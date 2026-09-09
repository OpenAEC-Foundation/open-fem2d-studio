//! De dekkingslijn van §9.2.1.3 (figuur 9.2) van buitenaf, zoals de
//! rapportbouwer en de tekenlaag hem straks gaan gebruiken.
//!
//! **Alle verwachte waarden hieronder zijn MET DE HAND uitgerekend**; het
//! rekenwerk staat in het commentaar bij elke test. Geen enkele verwachting is
//! uit de code afgeleid.
//!
//! # De referentiebalk
//!
//! Eén balk loopt door bijna alle tests heen, zodat de tussenwaarden maar één
//! keer hoeven te worden nagerekend:
//!
//! ```text
//!   doorsnede   300 × 600 mm, rechthoek
//!   beton       C30/37   f_ck = 30      f_ctk;0,05 = 2,0 (tabel 3.1)
//!   staal       B500B    f_yk = 500     γ_S = 1,15 → f_yd = 434,7826 N/mm²
//!   γ_C = 1,5, α_cc = α_ct = 1,0 (NB)
//!   dekking     c = 30 mm, beugel Ø8 tweebenig
//!   onder       Ø16  → asafstand 30 + 8 + 8 = 46 mm  → d   = 554 mm
//!   boven       2Ø12 → asafstand 30 + 8 + 6 = 44 mm  → d_b = 556 mm
//!   overspanning L = 6000 mm, vrij opgelegd, q = 40 kN/m
//! ```
//!
//! ## l_bd van een Ø16-staaf (§8.4)
//!
//! ```text
//!   f_ctd    = α_ct·f_ctk;0,05/γ_C = 1,0 · 2,0 / 1,5      = 1,33333 N/mm²
//!   η₁ = 1,0 (staaf onderin, 46 mm boven de onderrand → figuur 8.2 'goed')
//!   η₂ = 1,0 (Ø ≤ 32 mm)
//!   f_bd     = 2,25 · η₁ · η₂ · f_ctd                      = 3,0 N/mm²   (8.2)
//!   σ_sd     = f_yd                                        = 434,7826 N/mm²
//!   l_b,rqd  = (Ø/4)·(σ_sd/f_bd) = 4 · 144,92754           = 579,7101 mm (8.3)
//!   α₁…α₅    = 1,0  (recht; c_d = 0 onbepaald; K = 0; geen gelaste
//!              dwarsstaaf; p = 0)
//!   l_b,min  = max(0,3·579,7101; 10·16; 100) = 173,91 mm  → niet maatgevend
//!   l_bd     = 1,0 · 579,7101                              = 579,7101 mm (8.4)
//! ```
//!
//! ## De krachten per staaf
//!
//! ```text
//!   A_s(Ø16) = π/4 · 16²                                   = 201,06193 mm²
//!   F_1staaf = 201,06193 · 434,7826 / 1000                 =  87,41823 kN
//!   3 staven = 262,25469 kN   4 staven = 349,67292 kN   5 staven = 437,09115 kN
//! ```
//!
//! ## z en a_l
//!
//! ```text
//!   z (per snede) = 0,9·d = 0,9 · 554                      = 498,6 mm  6.2.3(1)
//!   d_max (beide zijden)                                   = 556 mm
//!   z voor a_l    = 0,9 · 556                              = 500,4 mm
//!   cot θ = 2,5 (bovengrens NB bij 6.2.3(2), veilig voor a_l)
//!   a_l = z(cot θ − cot α)/2 = 500,4 · 2,5/2               = 625,5 mm  (9.2)
//! ```
//!
//! ## De momentenlijn
//!
//! M(x) = q·x·(L − x)/2 met q = 40 kN/m, dus M_max = 180 kNm op het midden.
//! De omhullende wordt op stations van 500 mm aangeboden:
//!
//! ```text
//!   x [m]  0    0,5  1,0  1,5  2,0  2,5  3,0  3,5  4,0  4,5  5,0  5,5  6,0
//!   M      0     55  100  135  160  175  180  175  160  135  100   55    0
//!   V    120    100   80   60   40   20    0  −20  −40  −60  −80 −100 −120
//! ```

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::dekkingslijn::{
    dekkingslijn, Dekkingslijn, DekkingslijnInvoer, Dwarskrachtpunt, MomentBewijs, Momentpunt,
    Snedezijde, Staafeinde,
};
use nen_en_1992_1_1::dwarskracht::{ShearOptions, Weerstandsroute};
use nen_en_1992_1_1::section::{
    ConcreteSection, LongitudinalZone, RebarRow, RebarSide, ReinforcementCage,
    ReinforcementZones, StirrupZone,
};
use nen_en_1992_1_1::stress_strain::{DesignMaterial, SteelBranch};
use nen_en_1992_1_1::verankering::{Staafvorm, Stortpositie, BETA_2};
use nen_en_1992_1_1::{concrete_class_by_name, reinforcement_grade_by_name, DesignSituation};

// ───────────────────────────────────────────────────────────────────────────
// De met de hand narekende waarden, één keer opgeschreven
// ───────────────────────────────────────────────────────────────────────────

/// l_bd van een Ø16-staaf in C30/37, zie de moduletekst.
const L_BD_16: f64 = 579.710_144_927_536_2;
/// De trekkracht van één Ø16-staaf bij f_yd, kN.
const F_STAAF_16_KN: f64 = 87.418_230_360_759_47;
/// z = 0,9·d met d = 554 mm.
const Z_MM: f64 = 498.6;
/// a_l = 0,9·556·2,5/2.
const A_L_MM: f64 = 625.5;
/// De lengte van de referentiebalk.
const L_MM: f64 = 6000.0;

const TOL: f64 = 1e-9;

// ───────────────────────────────────────────────────────────────────────────
// Bouwstenen
// ───────────────────────────────────────────────────────────────────────────

fn mat() -> DesignMaterial {
    DesignMaterial::new(
        concrete_class_by_name("C30/37").expect("C30/37"),
        reinforcement_grade_by_name("B500B").expect("B500B"),
        DesignSituation::PersistentTransient,
        SteelBranch::Horizontal,
    )
}

fn f_ctk() -> f64 {
    concrete_class_by_name("C30/37").expect("C30/37").f_ctk_005
}

fn sectie() -> ConcreteSection {
    ConcreteSection::rectangle(300.0, 600.0)
}

/// De basiskorf: onder 3Ø16, boven 2Ø12, beugel Ø8 tweebenig h.o.h. 150 mm.
fn korf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        stirrup_spacing_mm: Some(150.0),
        stirrup_legs: Some(2),
        ..Default::default()
    }
}

fn langs(count: u32, x_start_mm: f64, x_end_mm: f64) -> LongitudinalZone {
    LongitudinalZone {
        side: RebarSide::Bottom,
        row: RebarRow { count, diameter_mm: 16.0 },
        x_start_mm,
        x_end_mm,
        bar_shape: Staafvorm::Recht,
        casting_position: Stortpositie::Onderzijde,
    }
}

/// De omhullende van de referentiebalk: stations van 500 mm, één combinatie.
fn omhullende() -> Vec<ForcePoint> {
    (0..=12)
        .map(|i| {
            let x_m = i as f64 * 0.5;
            ForcePoint {
                combination_id: 1,
                position_mm: x_m * 1000.0,
                forces: InternalForces {
                    my_ed: 20.0 * x_m * (6.0 - x_m),
                    vz_ed: 40.0 * (3.0 - x_m),
                    ..Default::default()
                },
            }
        })
        .collect()
}

struct Opzet {
    section: ConcreteSection,
    cage: ReinforcementCage,
    zones: ReinforcementZones,
    mat: DesignMaterial,
    env: Vec<ForcePoint>,
}

impl Opzet {
    fn nieuw(zones: ReinforcementZones, env: Vec<ForcePoint>) -> Self {
        Opzet { section: sectie(), cage: korf(), zones, mat: mat(), env }
    }

    fn reken(&self, opts: ShearOptions) -> Dekkingslijn {
        let inv = DekkingslijnInvoer {
            section: &self.section,
            cage: &self.cage,
            zones: &self.zones,
            mat: &self.mat,
            f_ctk_005_mpa: f_ctk(),
            lengte_mm: L_MM,
            omhullende: &self.env,
            z_mm: None,
            c_d_mm: None,
            shear_opts: opts,
        };
        dekkingslijn(&inv).expect("dekkingslijn")
    }
}

/// De onderwapeningszones 3 / 5 / 3 met de knip op `knip` en L − `knip`.
fn zones_3_5_3(knip: f64) -> ReinforcementZones {
    ReinforcementZones {
        longitudinal: vec![
            langs(3, 0.0, knip),
            langs(5, knip, L_MM - knip),
            langs(3, L_MM - knip, L_MM),
        ],
        stirrups: vec![],
    }
}

fn punt_op(punten: &[Momentpunt], x_mm: f64, zijde: Snedezijde) -> &Momentpunt {
    punten
        .iter()
        .find(|p| (p.x_mm - x_mm).abs() < 1e-6 && p.zijde == zijde)
        .unwrap_or_else(|| panic!("geen momentpunt op x = {x_mm} ({zijde:?})"))
}

fn dwarspunt_op(punten: &[Dwarskrachtpunt], x_mm: f64, zijde: Snedezijde) -> &Dwarskrachtpunt {
    punten
        .iter()
        .find(|p| (p.x_mm - x_mm).abs() < 1e-6 && p.zijde == zijde)
        .unwrap_or_else(|| panic!("geen dwarskrachtpunt op x = {x_mm} ({zijde:?})"))
}

// ───────────────────────────────────────────────────────────────────────────
// §8.4 — de verankeringslengte die de schuine tak bepaalt
// ───────────────────────────────────────────────────────────────────────────

/// l_bd van de Ø16-staven, met de hele rekengang van de moduletekst.
///
/// Dit is de maat die de lengte van de schuine takken in figuur 9.2 bepaalt;
/// als hij verschuift, verschuift de hele weerstandslijn mee. Daarom staat hij
/// hier apart vastgepind.
#[test]
fn l_bd_van_de_referentiestaaf() {
    let d = Opzet::nieuw(zones_3_5_3(1500.0), omhullende()).reken(ShearOptions::default());
    for b in &d.onder.bundels {
        assert_relative_eq!(b.l_bd_mm, L_BD_16, max_relative = TOL);
        // De ondergrens (8.6) is 0,3·579,71 = 173,9 mm en dus niet maatgevend.
        assert!(!b.verankering.ondergrens_maatgevend, "{:?}", b.verankering.l_b_min_term);
        assert_relative_eq!(b.verankering.f_bd_mpa, 3.0, max_relative = TOL);
        assert_relative_eq!(b.verankering.alfa.product, 1.0, max_relative = TOL);
    }
}

// ───────────────────────────────────────────────────────────────────────────
// De staafbundels: wat er werkelijk aan staal ligt
// ───────────────────────────────────────────────────────────────────────────

/// Een 3/5/3-staffeling is DRIE zones maar TWEE bundels.
///
/// De drie zones sluiten aaneen; de gemeenschappelijke 3 staven lopen over de
/// hele lengte door en alleen de 2 bijgelegde staven hebben uiteinden in het
/// veld. Wie de zones rechtstreeks als staaflengtes zou lezen, laat de
/// weerstand op x = 1500 en x = 4500 naar nul zakken terwijl daar gewoon 3Ø16
/// doorloopt.
#[test]
fn staffeling_levert_fysieke_staafbundels() {
    let d = Opzet::nieuw(zones_3_5_3(1500.0), omhullende()).reken(ShearOptions::default());
    assert_eq!(d.onder.bundels.len(), 2, "{:#?}", d.onder.bundels);

    let doorgaand = &d.onder.bundels[0];
    assert_eq!(doorgaand.aantal, 3);
    assert_relative_eq!(doorgaand.x_start_mm, 0.0);
    assert_relative_eq!(doorgaand.x_end_mm, L_MM);
    assert_relative_eq!(
        doorgaand.f_rs_vol_kn(d.onder.bundels[0].verankering.sigma_sd_mpa),
        3.0 * F_STAAF_16_KN,
        max_relative = TOL
    );

    let bijleg = &d.onder.bundels[1];
    assert_eq!(bijleg.aantal, 2);
    assert_relative_eq!(bijleg.x_start_mm, 1500.0);
    assert_relative_eq!(bijleg.x_end_mm, 4500.0);
}

/// Art. 9.2.1.3(3): binnen l_bd telt een staaf LINEAIR mee.
///
/// Handberekening op de bijlegbundel 2Ø16 van 1500 tot 4500 mm, l_bd = 579,71:
///
/// ```text
///   x = 1500,00 → (1500,00 − 1500)/579,71 = 0,00 → 0 %
///   x = 1789,86 → ( 289,86)/579,71        = 0,50 → 50 %
///   x = 2079,71 → ( 579,71)/579,71        = 1,00 → 100 %
///   x = 4500,00 → (4500 − 4500)/579,71    = 0,00 → 0 %  (andere uiteinde)
/// ```
#[test]
fn lineair_krachtverloop_binnen_de_verankeringslengte() {
    let d = Opzet::nieuw(zones_3_5_3(1500.0), omhullende()).reken(ShearOptions::default());
    let bijleg = &d.onder.bundels[1];
    assert_relative_eq!(bijleg.ontwikkeling_op(1500.0), 0.0, epsilon = 1e-12);
    assert_relative_eq!(bijleg.ontwikkeling_op(1500.0 + L_BD_16 / 2.0), 0.5, max_relative = TOL);
    assert_relative_eq!(bijleg.ontwikkeling_op(1500.0 + L_BD_16), 1.0, max_relative = TOL);
    assert_relative_eq!(bijleg.ontwikkeling_op(4500.0), 0.0, epsilon = 1e-12);
    assert_relative_eq!(bijleg.ontwikkeling_op(4500.0 - L_BD_16), 1.0, max_relative = TOL);
    // Buiten de bundel telt zij niet mee.
    assert_relative_eq!(bijleg.ontwikkeling_op(1000.0), 0.0, epsilon = 1e-12);
    assert_relative_eq!(bijleg.ontwikkeling_op(5000.0), 0.0, epsilon = 1e-12);
}

/// De weerstandslijn C van figuur 9.2 op de knikpunten van de trapezia.
///
/// ```text
///   x = 1500,00 mm: 3 staven vol + 2 staven à 0 %   = 262,25469 kN
///   x = 2079,71 mm: 3 staven vol + 2 staven vol     = 437,09115 kN
///   x = 3000,00 mm: idem                            = 437,09115 kN
/// ```
#[test]
fn afgekorte_staaf_geeft_een_schuine_weerstandslijn() {
    let d = Opzet::nieuw(zones_3_5_3(1500.0), omhullende()).reken(ShearOptions::default());
    let p = &d.onder.punten;

    let bij_knip = punt_op(p, 1500.0, Snedezijde::Rechts);
    assert_relative_eq!(bij_knip.aanwezig_kn, 3.0 * F_STAAF_16_KN, max_relative = TOL);
    assert_relative_eq!(bij_knip.aanwezig_volledig_kn, 5.0 * F_STAAF_16_KN, max_relative = TOL);
    assert_eq!(bij_knip.bewijs, MomentBewijs::BinnenVerankeringslengte);

    let vol = punt_op(p, 1500.0 + L_BD_16, Snedezijde::Enkel);
    assert_relative_eq!(vol.aanwezig_kn, 5.0 * F_STAAF_16_KN, max_relative = TOL);
    assert_eq!(vol.bewijs, MomentBewijs::VolledigOntwikkeld);

    let midden = punt_op(p, 3000.0, Snedezijde::Enkel);
    assert_relative_eq!(midden.aanwezig_kn, 5.0 * F_STAAF_16_KN, max_relative = TOL);
}

/// Op de knip is de benodigde trekkracht die van a_l VERDEROP, niet die ter
/// plaatse — dat is de hele verschuivingsregel.
///
/// Handberekening op x = 4500 (de rechterknip van de 3/5/3-balk):
///
/// ```text
///   venster [4500 − 625,5 ; 4500 + 625,5] = [3874,5 ; 5125,5], afgekapt op L
///   M is dalend voorbij het midden, dus het maximum ligt op 3874,5 mm.
///   M(3874,5) volgt lineair uit de stations 3500 (175) en 4000 (160):
///        175 − 15 · (374,5/500)                       = 163,765 kNm
///   F_s  = 163,765 · 1000 / 498,6                     = 328,4497 kN
///   F_Rs = 3 · 87,41823                               = 262,2547 kN
///   UC   = 328,4497 / 262,2547                        =   1,25241
///   onverschoven zou daar M(4500) = 135 kNm staan → 270,758/262,255 = 1,03242
/// ```
#[test]
fn verschuiving_verzwaart_de_eis_op_de_knip() {
    let d = Opzet::nieuw(zones_3_5_3(1500.0), omhullende()).reken(ShearOptions::default());
    assert_relative_eq!(d.a_l.a_l_mm, A_L_MM, max_relative = TOL);

    // De RECHTERkant van de knip: daar is de bijlegbundel op zijn staafeinde en
    // levert zij volgens 9.2.1.3(3) precies nul. (Aan de linkerkant staat de
    // korf nog op 5Ø16, maar de bijlegstaven zijn daar even ver afgelopen; het
    // verschil tussen beide punten is de micrometer waarmee de sprong wordt
    // bemonsterd, dus drie tienduizendste kN.)
    let p = punt_op(&d.onder.punten, 4500.0, Snedezijde::Rechts);
    assert_relative_eq!(p.z_mm, Z_MM, max_relative = TOL);
    assert_relative_eq!(p.omhullende_kn, 135_000.0 / Z_MM, max_relative = TOL);
    assert_relative_eq!(p.benodigd_kn, 163_765.0 / Z_MM, max_relative = 1e-9);
    assert_relative_eq!(p.aanwezig_kn, 3.0 * F_STAAF_16_KN, max_relative = TOL);
    assert_relative_eq!(
        p.uc.expect("unity check"),
        (163_765.0 / Z_MM) / (3.0 * F_STAAF_16_KN),
        max_relative = 1e-9
    );
}

/// **De verschuivingsregel verlegt de maatgevende plaats.**
///
/// Dezelfde balk, maar met de knip op 1000 en 5000 mm — ruim genoeg om de knip
/// ZONDER verschuiving niet maatgevend te laten zijn:
///
/// ```text
///   ZONDER verschuiving  (kolom `omhullende_kn` / `aanwezig_kn`)
///     x = 1000: M = 100 kNm → 200,562 kN  /  262,2547 = 0,76476
///     x = 3000: M = 180 kNm → 361,011 kN  /  437,0912 = 0,82594   ← zwaarst
///
///   MÉT verschuiving over a_l = 625,5 mm
///     x = 1000: venster [374,5 ; 1625,5]; M(1625,5) volgt lineair uit de
///               stations 1500 (135) en 2000 (160): 135 + 25·(125,5/500)
///                                                      = 141,275 kNm
///               F_s = 141 275 / 498,6 = 283,3434 kN
///               UC  = 283,3434 / 262,2547            = 1,08041   ← zwaarst
///     x = 3000: het midden is het maximum van de omhullende, dus het venster
///               levert daar dezelfde 361,011 kN → UC = 0,82594
/// ```
///
/// Zonder de regel van 9.2.1.3(2) zou het rapport de maatgevende plaats dus op
/// het midden aanwijzen en de knip ongemoeid laten, terwijl juist dáár de
/// wapening tekortschiet.
#[test]
fn verschuivingsregel_verlegt_de_maatgevende_plaats() {
    let d = Opzet::nieuw(zones_3_5_3(1000.0), omhullende()).reken(ShearOptions::default());

    // Waar zou de maatgevende plaats liggen ZONDER de verschuiving? Beide
    // kolommen staan op elk punt, dus dat is na te rekenen zonder de module
    // opnieuw te draaien.
    let zonder = d
        .onder
        .punten
        .iter()
        .filter(|p| !p.in_eindzone && p.aanwezig_kn > 0.0)
        .max_by(|a, b| {
            (a.omhullende_kn / a.aanwezig_kn)
                .partial_cmp(&(b.omhullende_kn / b.aanwezig_kn))
                .expect("geen NaN")
        })
        .expect("een punt buiten de eindzones");
    assert_relative_eq!(zonder.x_mm, 3000.0, max_relative = TOL);
    assert_relative_eq!(
        zonder.omhullende_kn / zonder.aanwezig_kn,
        (180_000.0 / Z_MM) / (5.0 * F_STAAF_16_KN),
        max_relative = 1e-9
    );

    // En MÉT de verschuiving.
    let met = d.onder.maatgevend_punt().expect("een maatgevende plaats");
    assert_relative_eq!(met.x_mm, 1000.0, max_relative = TOL);
    assert_relative_eq!(met.aanwezig_kn, 3.0 * F_STAAF_16_KN, max_relative = TOL);
    assert_relative_eq!(met.benodigd_kn, 141_275.0 / Z_MM, max_relative = 1e-9);
    assert_relative_eq!(
        met.uc.expect("unity check"),
        (141_275.0 / Z_MM) / (3.0 * F_STAAF_16_KN),
        max_relative = 1e-9
    );
    assert!(met.uc.expect("uc") > 1.0, "de knip schiet hier tekort");
}

/// De eindzones tellen niet mee bij het kiezen van de maatgevende plaats, want
/// daar geldt §9.2.1.4/§9.2.1.5 en niet de vrije dekkingslijn.
///
/// Op x = 0 is de weerstand per definitie nul — het model laat de staaf daar
/// ophouden terwijl zij in werkelijkheid de oplegging in loopt — dus zónder die
/// uitzondering zou x = 0 altijd winnen.
#[test]
fn eindzones_blijven_buiten_de_keuze() {
    let d = Opzet::nieuw(zones_3_5_3(1000.0), omhullende()).reken(ShearOptions::default());

    let bij_nul = punt_op(&d.onder.punten, 0.0, Snedezijde::Enkel);
    assert_relative_eq!(bij_nul.aanwezig_kn, 0.0, epsilon = 1e-12);
    assert!(bij_nul.in_eindzone);
    assert!(bij_nul.uc.is_none(), "zonder weerstand is er geen verhouding");

    // De eindzone loopt tot l_bd van het staafeinde.
    assert!(punt_op(&d.onder.punten, L_BD_16, Snedezijde::Enkel).in_eindzone);
    assert!(!d.onder.maatgevend_punt().expect("maatgevend").in_eindzone);
}

/// De omhullende A van figuur 9.2 telt een DRUKkracht niet mee, maar meldt hem
/// wel. Met een opgegeven z is er geen 6.2.3(1)-blokkade.
#[test]
fn drukkracht_wordt_gemeld_maar_niet_verrekend() {
    let section = sectie();
    let cage = korf();
    let zones = ReinforcementZones::default();
    let m = mat();
    let mut env = omhullende();
    for p in env.iter_mut() {
        p.forces.n_ed = -200.0; // druk
    }
    let inv = DekkingslijnInvoer {
        section: &section,
        cage: &cage,
        zones: &zones,
        mat: &m,
        f_ctk_005_mpa: f_ctk(),
        lengte_mm: L_MM,
        omhullende: &env,
        z_mm: Some(Z_MM),
        c_d_mm: None,
        shear_opts: ShearOptions::default(),
    };
    let d = dekkingslijn(&inv).expect("met opgegeven z mag het");
    let midden = punt_op(&d.onder.punten, 3000.0, Snedezijde::Enkel);
    // M/z zonder enige bijdrage van N_Ed.
    assert_relative_eq!(midden.omhullende_kn, 180_000.0 / Z_MM, max_relative = TOL);
    assert_relative_eq!(midden.n_ed_kn, -200.0, max_relative = TOL);
}

// ───────────────────────────────────────────────────────────────────────────
// §6.2 — de dwarskrachtlijn
// ───────────────────────────────────────────────────────────────────────────

/// De dwarskrachtlijn leest de beugelzone die op DIE plaats ligt, en laat de
/// weerstand op de zonegrens springen.
///
/// Handberekening met cot θ = 2,5 vastgezet, V_Ed = 200 kN, M_Ed = 0 (trek
/// onder, dus d = 554 mm en z = 0,9·d = 498,6 mm):
///
/// ```text
///   A_sw = 2 · π/4 · 8²                                   = 100,53096 mm²
///   f_ywd = f_yd                                          = 434,7826 N/mm²
///   V_Rd,s = (A_sw/s)·z·f_ywd·cot θ                                     (6.8)
///     s = 100 mm: 1,0053096 · 498,6 · 434,7826 · 2,5 /1e3 = 544,834 kN
///     s = 250 mm: 0,4021239 · 498,6 · 434,7826 · 2,5 /1e3 = 217,934 kN
///   ν  = 0,6(1 − 30/250) = 0,528     f_cd = 30/1,5 = 20 N/mm²
///   V_Rd,max = 1,0·300·498,6·0,528·20/(2,5 + 0,4)/1e3     = 544,678 kN  (6.9)
///   V_Rd = min(V_Rd,s; V_Rd,max)                                     6.2.3(3)
///     links  van de grens: min(544,834; 544,678)          = 544,678 kN
///     rechts van de grens: min(217,934; 544,678)          = 217,934 kN
/// ```
#[test]
fn dwarskracht_leest_de_beugelzone_ter_plaatse() {
    let zones = ReinforcementZones {
        longitudinal: vec![],
        stirrups: vec![
            StirrupZone {
                x_start_mm: 0.0,
                x_end_mm: 1000.0,
                spacing_mm: 100.0,
                legs: 2,
                diameter_mm: 8.0,
            },
            StirrupZone {
                x_start_mm: 1000.0,
                x_end_mm: L_MM,
                spacing_mm: 250.0,
                legs: 2,
                diameter_mm: 8.0,
            },
        ],
    };
    // Constante V_Ed = 200 kN en M_Ed = 0, zodat de handberekening niet ook nog
    // van de momentenlijn afhangt.
    let env: Vec<ForcePoint> = [0.0, 1000.0, L_MM]
        .iter()
        .map(|&x| ForcePoint {
            combination_id: 1,
            position_mm: x,
            forces: InternalForces { vz_ed: 200.0, ..Default::default() },
        })
        .collect();
    let opzet = Opzet::nieuw(zones, env);
    let d = opzet.reken(ShearOptions { cot_theta: Some(2.5), ..ShearOptions::default() });

    let links = dwarspunt_op(&d.dwarskracht.punten, 1000.0, Snedezijde::Links);
    let rechts = dwarspunt_op(&d.dwarskracht.punten, 1000.0, Snedezijde::Rechts);

    let v_rd_max = 1.0 * 300.0 * Z_MM * 0.528 * 20.0 / (2.5 + 0.4) / 1000.0;
    let a_sw = 2.0 * std::f64::consts::PI / 4.0 * 64.0;
    let v_rd_s_250 = (a_sw / 250.0) * Z_MM * (500.0 / 1.15) * 2.5 / 1000.0;

    assert_relative_eq!(links.aanwezig_kn.expect("V_Rd links"), v_rd_max, max_relative = 1e-9);
    assert_relative_eq!(
        rechts.aanwezig_kn.expect("V_Rd rechts"),
        v_rd_s_250,
        max_relative = 1e-9
    );
    assert_relative_eq!(links.benodigd_kn, 200.0, max_relative = TOL);
    assert_eq!(links.route, Some(Weerstandsroute::Dwarskrachtwapening));
    assert_eq!(rechts.route, Some(Weerstandsroute::Dwarskrachtwapening));
    assert_relative_eq!(rechts.uc.expect("uc"), 200.0 / v_rd_s_250, max_relative = 1e-9);
}

/// De weerstand van een punt is nooit V_Rd,c + V_Rd,s.
///
/// Nagekeken in de normtekst: 6.2.1(2) geeft V_Rd = V_Rd,s + V_ccd + V_td — een
/// som ZONDER betonterm — en 6.2.3(3) noemt V_Rd voor verticale beugels "de
/// kleinste waarde van" (6.8) en (6.9). 6.2.1(3) is een tweede, losstaande
/// bewijsvoering ("is geen berekende dwarskrachtwapening nodig") en geen
/// bijdrage aan de eerste.
///
/// Handberekening van de betontak op de referentiebalk (A_sl = 3Ø16, d = 554):
///
/// ```text
///   k     = 1 + √(200/554)                                = 1,600842   ≤ 2,0
///   ρ_l   = 603,1858/(300·554)                            = 0,0036293  ≤ 0,02
///   (6.2.a) 0,12·1,600842·(100·0,0036293·30)^⅓·300·554/1e3 = 70,763 kN
///   (6.2.b) 0,035·1,600842^1,5·√30·300·554/1e3             = 64,533 kN
///   V_Rd,c = de GROOTSTE van beide ("met een minimum van") = 70,763 kN
/// ```
///
/// Optellen bij V_Rd,s zou 288,7 kN geven; de lijn meldt 217,9 kN.
#[test]
fn geen_enkel_punt_telt_de_twee_bewijzen_op() {
    let zones = ReinforcementZones {
        longitudinal: vec![],
        stirrups: vec![StirrupZone {
            x_start_mm: 0.0,
            x_end_mm: L_MM,
            spacing_mm: 250.0,
            legs: 2,
            diameter_mm: 8.0,
        }],
    };
    let env: Vec<ForcePoint> = [0.0, 3000.0, L_MM]
        .iter()
        .map(|&x| ForcePoint {
            combination_id: 1,
            position_mm: x,
            forces: InternalForces { vz_ed: 200.0, ..Default::default() },
        })
        .collect();
    let d = Opzet::nieuw(zones, env)
        .reken(ShearOptions { cot_theta: Some(2.5), ..ShearOptions::default() });

    let a_sw = 2.0 * std::f64::consts::PI / 4.0 * 64.0;
    let v_rd_s = (a_sw / 250.0) * Z_MM * (500.0 / 1.15) * 2.5 / 1000.0;
    let k = 1.0 + (200.0_f64 / 554.0).sqrt();
    let rho = 3.0 * std::f64::consts::PI / 4.0 * 256.0 / (300.0 * 554.0);
    let v_rd_c_a = 0.12 * k * (100.0 * rho * 30.0).powf(1.0 / 3.0) * 300.0 * 554.0 / 1000.0;
    let v_rd_c_b = 0.035 * k.powf(1.5) * 30.0_f64.sqrt() * 300.0 * 554.0 / 1000.0;
    let v_rd_c = v_rd_c_a.max(v_rd_c_b);
    assert_relative_eq!(v_rd_c, 70.763_252_271_615_67, max_relative = 1e-9);

    for p in &d.dwarskracht.punten {
        let v_rd = p.aanwezig_kn.expect("V_Rd");
        assert!(
            v_rd <= v_rd_c.max(v_rd_s) + 1e-9,
            "op x = {} is V_Rd = {v_rd} kN, meer dan de grootste van de twee bewijzen \
             (V_Rd,c = {v_rd_c} kN, V_Rd,s = {v_rd_s} kN)",
            p.x_mm
        );
        assert!(
            v_rd < v_rd_c + v_rd_s - 1e-9,
            "op x = {} is V_Rd = {v_rd} kN — dat is de SOM van de twee bewijzen",
            p.x_mm
        );
    }
    // En dit is de weerstand die er wél staat.
    let midden = dwarspunt_op(&d.dwarskracht.punten, 3000.0, Snedezijde::Enkel);
    assert_relative_eq!(midden.aanwezig_kn.expect("V_Rd"), v_rd_s, max_relative = 1e-9);
}

/// 6.2.1(8) is niet gebouwd: de lijn begint op x = 0 en loopt tot x = L.
///
/// De verlichting geldt binnen een afstand d vanaf de DAGKANT van de oplegging
/// en vraagt dus de breedte van het oplegvlak. Het model kent alleen een
/// puntoplegging op een knoop, dus er wordt tot in de oplegging getoetst — de
/// veilige kant.
#[test]
fn de_lijn_loopt_tot_in_de_oplegging() {
    let d = Opzet::nieuw(zones_3_5_3(1000.0), omhullende()).reken(ShearOptions::default());
    let eerste = d.dwarskracht.punten.first().expect("punten");
    let laatste = d.dwarskracht.punten.last().expect("punten");
    assert_relative_eq!(eerste.x_mm, 0.0, epsilon = 1e-12);
    assert_relative_eq!(laatste.x_mm, L_MM, max_relative = TOL);
    assert_relative_eq!(eerste.benodigd_kn, 120.0, max_relative = TOL);
    assert!(
        d.toelichting.iter().any(|t| t.contains("6.2.1(8)")),
        "de lijn hoort te melden dat 6.2.1(8) niet is toegepast"
    );
}

// ───────────────────────────────────────────────────────────────────────────
// §9.2.1.4 en §9.2.1.5 — de onderwapening bij de steunpunten
// ───────────────────────────────────────────────────────────────────────────

/// De oppervlakte-eis van §9.2.1.4(1), met de NB-waarde β₂ = 0,25.
///
/// **De Nederlandse bijlage wijkt hier NIET af**: de EN-tekst geeft dezelfde
/// aanbevolen waarde 0,25 en de NB schrijft haar met zoveel woorden voor ("De
/// waarde van β₂ voor liggers moet gelijk aan 0,25 zijn genomen"). Dat is
/// nagekeken op de gerenderde bladzijde 201, waar de EN-OPMERKING is
/// doorgehaald en door die NB-zin is vervangen — met hetzelfde getal.
///
/// ```text
///   A_s,veld  = 5 · 201,06193                             = 1005,310 mm²
///   vereist   = 0,25 · 1005,310                           =  251,327 mm²
///   aanwezig  = 3 · 201,06193                             =  603,186 mm²  ✓
///   F_Ed      = |V_Ed|·a_l/z + N_Ed = 120 · 625,5/500,4   =  150,0 kN   (9.3)
/// ```
#[test]
fn steunpunteis_oppervlakte_en_te_verankeren_kracht() {
    let d = Opzet::nieuw(zones_3_5_3(1000.0), omhullende()).reken(ShearOptions::default());
    assert_relative_eq!(BETA_2, 0.25, max_relative = TOL);
    assert_eq!(d.steunpunten.len(), 2);

    let a_s = std::f64::consts::PI / 4.0 * 256.0;
    for eis in &d.steunpunten {
        assert_relative_eq!(eis.a_s_veld_mm2, 5.0 * a_s, max_relative = TOL);
        assert_relative_eq!(eis.a_s_vereist_mm2, 0.25 * 5.0 * a_s, max_relative = TOL);
        assert_relative_eq!(eis.a_s_aanwezig_mm2, 3.0 * a_s, max_relative = TOL);
        assert!(eis.voldoet_oppervlakte);
        // (9.3): 120 · 625,5 / 500,4 = 150 kN, want a_l = 1,25·z.
        assert_relative_eq!(eis.f_ed_kn, 150.0, max_relative = 1e-9);
        assert_relative_eq!(eis.v_ed_kn, 120.0, max_relative = TOL);
        assert_relative_eq!(eis.a_l_mm, A_L_MM, max_relative = TOL);
        assert_relative_eq!(eis.l_bd_mm.expect("l_bd"), L_BD_16, max_relative = TOL);
        // §9.2.1.5(2): 10Φ voor rechte staven.
        assert_relative_eq!(eis.min_lengte_recht_mm.expect("10Φ"), 160.0, max_relative = TOL);
    }
    assert_eq!(d.steunpunten[0].uiteinde, Staafeinde::Begin);
    assert_eq!(d.steunpunten[1].uiteinde, Staafeinde::Eind);
    assert_relative_eq!(d.steunpunten[1].x_mm, L_MM, max_relative = TOL);
}

/// En de eis SLAAT AAN als er te weinig doorloopt: 1Ø16 tegen de vereiste
/// 0,25 · 5Ø16.
///
/// ```text
///   A_s,veld = 5 · 201,06193 = 1005,310 mm² → vereist 251,327 mm²
///   aanwezig = 1 · 201,06193 =  201,062 mm² < 251,327 mm²  ✗
/// ```
#[test]
fn steunpunteis_slaat_aan_bij_te_weinig_doorlopende_wapening() {
    let zones = ReinforcementZones {
        longitudinal: vec![
            langs(1, 0.0, 500.0),
            langs(5, 500.0, 5500.0),
            langs(1, 5500.0, L_MM),
        ],
        stirrups: vec![],
    };
    let d = Opzet::nieuw(zones, omhullende()).reken(ShearOptions::default());
    let a_s = std::f64::consts::PI / 4.0 * 256.0;
    for eis in &d.steunpunten {
        assert_relative_eq!(eis.a_s_aanwezig_mm2, a_s, max_relative = TOL);
        assert_relative_eq!(eis.a_s_vereist_mm2, 1.25 * a_s, max_relative = TOL);
        assert!(!eis.voldoet_oppervlakte, "1Ø16 is minder dan 0,25·5Ø16");
    }
}

// ───────────────────────────────────────────────────────────────────────────
// a_l zonder dwarskrachtwapening
// ───────────────────────────────────────────────────────────────────────────

/// Zonder beugels is a_l = d volgens 6.2.2(5), niet z(cot θ − cot α)/2.
///
/// d_max is hier de bovenwapening: 600 − (30 + 8 + 6) = 556 mm.
#[test]
fn zonder_beugels_is_a_l_gelijk_aan_d() {
    let section = sectie();
    let mut cage = korf();
    cage.stirrup_spacing_mm = None;
    cage.stirrup_legs = None;
    let zones = ReinforcementZones::default();
    let m = mat();
    let env = omhullende();
    let inv = DekkingslijnInvoer {
        section: &section,
        cage: &cage,
        zones: &zones,
        mat: &m,
        f_ctk_005_mpa: f_ctk(),
        lengte_mm: L_MM,
        omhullende: &env,
        z_mm: None,
        c_d_mm: None,
        shear_opts: ShearOptions::default(),
    };
    let d = dekkingslijn(&inv).expect("dekkingslijn");
    assert_relative_eq!(d.a_l.a_l_mm, 556.0, max_relative = TOL);
    assert!(d.a_l.artikel.contains("6.2.2(5)"), "{}", d.a_l.artikel);
}

// ───────────────────────────────────────────────────────────────────────────
// Wat er NIET mag gebeuren
// ───────────────────────────────────────────────────────────────────────────

/// Een normaalkracht zonder opgegeven z levert een foutmelding, geen
/// stilzwijgende 0,9·d. Dezelfde discipline als in [`nen_en_1992_1_1::dwarskracht`].
#[test]
fn normaalkracht_zonder_z_levert_een_leesbare_weigering() {
    let section = sectie();
    let cage = korf();
    let zones = ReinforcementZones::default();
    let m = mat();
    let mut env = omhullende();
    env[6].forces.n_ed = 75.0;
    let inv = DekkingslijnInvoer {
        section: &section,
        cage: &cage,
        zones: &zones,
        mat: &m,
        f_ctk_005_mpa: f_ctk(),
        lengte_mm: L_MM,
        omhullende: &env,
        z_mm: None,
        c_d_mm: None,
        shear_opts: ShearOptions::default(),
    };
    let e = dekkingslijn(&inv).expect_err("hoort te weigeren");
    assert!(e.contains("6.2.3(1)"), "{e}");
    assert!(e.contains("Geef z op"), "{e}");
}

/// Een niet-positieve z wordt geweigerd: op z wordt gedeeld.
#[test]
fn een_nul_hefboomsarm_wordt_geweigerd() {
    let section = sectie();
    let cage = korf();
    let zones = ReinforcementZones::default();
    let m = mat();
    let env = omhullende();
    let inv = DekkingslijnInvoer {
        section: &section,
        cage: &cage,
        zones: &zones,
        mat: &m,
        f_ctk_005_mpa: f_ctk(),
        lengte_mm: L_MM,
        omhullende: &env,
        z_mm: Some(0.0),
        c_d_mm: None,
        shear_opts: ShearOptions::default(),
    };
    let e = dekkingslijn(&inv).expect_err("z = 0 hoort te worden afgekeurd");
    assert!(e.contains("groter dan nul"), "{e}");
}

/// Een ongeldige zone-indeling wordt niet stilzwijgend gerepareerd.
#[test]
fn een_gat_in_de_zones_wordt_afgekeurd() {
    let zones = ReinforcementZones {
        longitudinal: vec![langs(3, 0.0, 2000.0), langs(3, 3000.0, L_MM)],
        stirrups: vec![],
    };
    let section = sectie();
    let cage = korf();
    let m = mat();
    let env = omhullende();
    let inv = DekkingslijnInvoer {
        section: &section,
        cage: &cage,
        zones: &zones,
        mat: &m,
        f_ctk_005_mpa: f_ctk(),
        lengte_mm: L_MM,
        omhullende: &env,
        z_mm: None,
        c_d_mm: None,
        shear_opts: ShearOptions::default(),
    };
    let e = dekkingslijn(&inv).expect_err("een gat hoort te worden afgekeurd");
    assert!(e.contains("zones"), "{e}");
}

/// Zonder zones gedraagt de module zich als vóór het zonemodel: één bundel per
/// zijde over de hele lengte, en de weerstandslijn is overal vol behalve binnen
/// l_bd van de uiteinden.
#[test]
fn lege_zones_geven_het_oude_gedrag() {
    let d = Opzet::nieuw(ReinforcementZones::default(), omhullende())
        .reken(ShearOptions::default());
    assert_eq!(d.onder.bundels.len(), 1);
    assert_eq!(d.boven.bundels.len(), 1);
    let midden = punt_op(&d.onder.punten, 3000.0, Snedezijde::Enkel);
    assert_relative_eq!(midden.aanwezig_kn, 3.0 * F_STAAF_16_KN, max_relative = TOL);
    assert_eq!(midden.bewijs, MomentBewijs::VolledigOntwikkeld);
    // Boven 2Ø12: A_s = 2·π/4·144 = 226,1947 mm² → 98,3455 kN.
    let boven = punt_op(&d.boven.punten, 3000.0, Snedezijde::Enkel);
    let f_12 = 2.0 * std::f64::consts::PI / 4.0 * 144.0 * (500.0 / 1.15) / 1000.0;
    assert_relative_eq!(boven.aanwezig_kn, f_12, max_relative = 1e-9);
    // Bij een positief moment is er aan de bovenzijde geen trek gevraagd.
    assert_relative_eq!(boven.omhullende_kn, 0.0, epsilon = 1e-12);
}
