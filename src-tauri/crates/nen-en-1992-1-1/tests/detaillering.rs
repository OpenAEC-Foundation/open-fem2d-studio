//! De detailleringstoetsen van §9.2.1, §9.2.2 en §8.2, van buitenaf gebruikt
//! zoals een rapportbouwer ze gebruikt.
//!
//! Waar de tests in de module zelf de losse formules narekenen, doen deze twee
//! dingen die daar niet passen:
//!
//! 1. **De vijf NB-afwijkingen vastpinnen.** Voor elk van de vijf plekken waar
//!    de Nederlandse bijlage van de EN-tekst afwijkt, staat hier een geval
//!    waarin de EN-waarde een ANDER antwoord zou geven. Zo valt het meteen op
//!    als iemand ooit de EN-waarde terugzet.
//! 2. **De hele reeks als rapportinhoud bekijken:** negen toetsen, elk met een
//!    artikel, een formule, variabelen en een unity check — of, als een gegeven
//!    ontbreekt, met een reden en zonder unity check.
//!
//! Alle getallen hieronder zijn MET DE HAND uitgerekend; het rekenwerk staat in
//! het commentaar bij elke test. Geen enkele verwachting is uit de code
//! afgeleid.

use approx::assert_relative_eq;
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::detaillering::{
    as_max_9_2_1_1, as_min_9_2_1_1, detailleringstoetsen, min_balkbreedte_9_2,
    min_diameter_beugel_9_2_2, min_diameter_langsstaaf_9_2_1_1, rho_w_min_9_2_2, s_l_max_9_2_2,
    s_t_max_9_2_2, vrije_staafafstand_8_2, DetailleringInvoer,
};
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, CheckStatus, ConcreteSection,
    DesignMaterial, DesignSituation, RebarRow, ReinforcementCage, ResistanceCalc, SteelBranch,
};

/// C30/37 met B500B, blijvende/tijdelijke ontwerpsituatie.
///
/// Daaruit volgt: f_cd = 1,0·30/1,5 = 20 N/mm², f_yd = 500/1,15 = 434,7826
/// N/mm², λ = 0,8 en η = 1,0 (f_ck ≤ 50 N/mm²), ε_cu3 = 3,5 ‰.
fn materiaal() -> DesignMaterial {
    DesignMaterial::new(
        concrete_class_by_name("C30/37").unwrap(),
        reinforcement_grade_by_name("B500B").unwrap(),
        DesignSituation::PersistentTransient,
        SteelBranch::Horizontal,
    )
}

/// f_ctm van C30/37 uit tabel 3.1: 2,9 N/mm².
const F_CTM_C30: f64 = 2.9;

/// De referentiebalk: 300 × 600, dekking 35 mm, beugel Ø10 tweebenig h.o.h.
/// 200 mm, onder 4Ø20, boven 2Ø12.
fn referentiekorf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 35.0,
        stirrup_diameter_mm: 10.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 4, diameter_mm: 20.0 },
        stirrup_spacing_mm: Some(200.0),
        stirrup_legs: Some(2),
        ..ReinforcementCage::default()
    }
}

fn krachten(n_kn: f64, m_knm: f64) -> ForceStateSnapshot {
    ForceStateSnapshot {
        combination_id: 3,
        position_mm: 3000.0,
        forces: InternalForces { n_ed: n_kn, my_ed: m_knm, ..Default::default() },
    }
}

struct Opzet {
    section: ConcreteSection,
    cage: ReinforcementCage,
    mat: DesignMaterial,
}

fn referentiebalk() -> Opzet {
    Opzet {
        section: ConcreteSection::new(300.0, 600.0),
        cage: referentiekorf(),
        mat: materiaal(),
    }
}

/// De volledig ingevulde invoer: alle projectgegevens bekend, zodat er nergens
/// een "kan niet toetsen" overblijft.
fn volledige_invoer(o: &Opzet) -> DetailleringInvoer<'_> {
    DetailleringInvoer {
        section: &o.section,
        cage: &o.cage,
        mat: &o.mat,
        f_ctm_mpa: F_CTM_C30,
        force_state: krachten(0.0, 250.0),
        d_g_mm: Some(16.0),
        dwarskrachtwapening_vereist: Some(true),
        v_ed_kn: Some(150.0),
        v_rd_max_kn: Some(500.0),
        blijvend_bekiste_oppervlakken: Some(0),
        dubbel_wapeningsnet: Some(false),
    }
}

/// De kale invoer: alleen doorsnede, korf en materiaal, geen projectgegevens.
fn kale_invoer(o: &Opzet) -> DetailleringInvoer<'_> {
    DetailleringInvoer {
        d_g_mm: None,
        dwarskrachtwapening_vereist: None,
        v_ed_kn: None,
        v_rd_max_kn: None,
        blijvend_bekiste_oppervlakken: None,
        dubbel_wapeningsnet: None,
        ..volledige_invoer(o)
    }
}

fn uc(c: &ResistanceCalc) -> f64 {
    c.uc.as_ref().unwrap_or_else(|| panic!("{} hoort een unity check te hebben", c.id)).uc
}

// ===========================================================================
// De referentiebalk, toets voor toets met de hand nagerekend
// ===========================================================================
//
// Doorsnede 300 × 600 mm, C30/37, B500B, dekking 35 mm, beugel Ø10 tweebenig
// h.o.h. 200 mm, onder 4Ø20, boven 2Ø12; M_Ed = 250 kNm, N_Ed = 0,
// V_Ed = 150 kN, V_Rd,max = 500 kN, d_g = 16 mm.
//
// Basisgrootheden, met de hand:
//   d      = 600 − (35 + 10 + 20/2)         = 545 mm
//   d₂     = 35 + 10 + 12/2                 = 51 mm
//   A_c    = 300 · 600                      = 180 000 mm²
//   W      = 300 · 600²/6                   = 18 000 000 mm³
//   b_w    = 300 mm (rechthoek)
//   A_s1   = 4 · π · 10²                    = 1 256,637 mm²
//   A_s2   = 2 · π · 6²                     = 226,195 mm²
//   A_sw   = 2 · π/4 · 10²                  = 157,0796 mm²

/// ρ_w,min — §9.2.2(5) met de NB-waarde bij (9.5N).
///
///   ρ_w     = A_sw/(s·b_w·sin 90°) = 157,079633/(200·300)
///           = 157,079633/60 000 = 0,002617994
///   ρ_w,min = 0,08·√30/500 = 0,08·5,4772256/500 = 0,438178/500
///           = 0,000876356
///   UC      = 0,000876356/0,002617994 = 0,334744
#[test]
fn referentiebalk_rho_w_min() {
    let o = referentiebalk();
    let c = rho_w_min_9_2_2(&volledige_invoer(&o));
    assert_eq!(c.status, CheckStatus::Ok);
    assert_relative_eq!(c.value, 0.000876356, max_relative = 1e-6);
    assert_relative_eq!(c.uc.as_ref().unwrap().rd, 0.002617994, max_relative = 1e-6);
    assert_relative_eq!(uc(&c), 0.334744, max_relative = 1e-5);
}

/// s_l,max — §9.2.2(6) met de NB-vervanging.
///
///   0,75·d·(1 + cot 90°) = 0,75 · 545 · 1 = 408,75 mm
///   NB-plafond 300 mm is kleiner, dus s_l,max = 300 mm
///   UC = 200/300 = 0,666667
#[test]
fn referentiebalk_s_l_max() {
    let o = referentiebalk();
    let c = s_l_max_9_2_2(&volledige_invoer(&o));
    assert_eq!(c.status, CheckStatus::Ok);
    assert_relative_eq!(c.value, 300.0);
    assert_relative_eq!(uc(&c), 2.0 / 3.0, max_relative = 1e-12);
}

/// s_t,max — §9.2.2(8) met de NB-vervanging.
///
///   s_t (tweebenige beugel) = b_w − 2·c_nom − Ø = 300 − 70 − 10 = 220 mm
///   0,5·V_Rd,max = 0,5 · 500 = 250 kN; V_Ed = 150 kN ≤ 250 kN
///   → de ruime tak: s_t,max = 500 mm
///   UC = 220/500 = 0,44
#[test]
fn referentiebalk_s_t_max() {
    let o = referentiebalk();
    let c = s_t_max_9_2_2(&volledige_invoer(&o));
    assert_eq!(c.status, CheckStatus::Ok);
    assert_relative_eq!(c.value, 500.0);
    assert_relative_eq!(uc(&c), 0.44, max_relative = 1e-12);
    assert!(c.variables.iter().any(|v| v.symbol == "s_t" && v.value == 220.0));
}

/// A_s,max — §9.2.1.1(3) met de NB-waarde.
///
///   A_s,max = 0,04 · 180 000 = 7 200 mm²
///   maatgevend is de onderwapening: 1 256,637 mm²
///   UC = 1 256,637/7 200 = 0,174533
#[test]
fn referentiebalk_as_max() {
    let o = referentiebalk();
    let c = as_max_9_2_1_1(&volledige_invoer(&o));
    assert_relative_eq!(c.value, 7200.0, max_relative = 1e-12);
    assert_relative_eq!(uc(&c), 0.174533, max_relative = 1e-5);
}

/// A_s,min — de NB-versie bij §9.2.1.1(1).
///
/// **M_E,min bij zuivere buiging** = f_ctm·W = 2,9 · 18 000 000
/// = 52 200 000 Nmm = 52,2 kNm.
///
/// **A_s,min1** = de volgens 6.1 benodigde wapening voor 52,2 kNm.
/// Handcontrole bij A_s1 = 214,21 mm² en x = 34,78 mm:
///   F_c  = η·f_cd·b·λ·x = 1,0·20·300·0,8·34,78 = 166 944 N
///   ε_s2 = 0,0035·(1 − 51/34,78) = −0,0016324 → elastisch,
///          σ_s2 = −326,5 N/mm², F_s2 = 226,195·(−326,5) = −73 852 N
///   ε_s1 = 0,0035·(1 − 545/34,78) = −0,05134 → vloeit,
///          F_s1 = −214,21·434,7826 = −93 135 N
///   evenwicht: 166 944 − 73 852 − 93 135 = −43 N ≈ 0 ✓
///   M om het midden = 166 944·(300 − 13,91) − 73 852·(300 − 51)
///                     − 93 135·(300 − 545)
///                   = 47 759 000 − 18 389 200 + 22 818 100
///                   = 52 187 900 Nmm ≈ 52,2 kNm ✓
///
/// **A_s,min2** = 1,25 × de UGT-behoefte voor 250 kNm.
/// Handcontrole bij A_s1 = 1 133,17 mm² en x = 88,64 mm:
///   F_c  = 4800 · 88,64 = 425 472 N
///   ε_s2 = 0,0035·(1 − 51/88,64) = +0,0014862 → elastisch,
///          σ_s2 = +297,2 N/mm², F_s2 = +67 225 N (druk)
///   F_s1 = −1 133,17·434,7826 = −492 683 N (vloeit)
///   evenwicht: 425 472 + 67 225 − 492 683 = +14 N ≈ 0 ✓
///   M = 425 472·(300 − 35,46) + 67 225·249 + 492 683·245
///     = 112 553 400 + 16 739 000 + 120 707 300 = 250,0·10⁶ Nmm ✓
///   A_s,min2 = 1,25 · 1 133,17 = 1 416,47 mm²
///
/// A_s,min = min(214,21; 1 416,47) = 214,21 mm² — de KLEINSTE.
/// UC = 214,21/1 256,637 = 0,170461.
#[test]
fn referentiebalk_as_min_neemt_de_kleinste_kandidaat() {
    let o = referentiebalk();
    let c = as_min_9_2_1_1(&volledige_invoer(&o));
    assert_eq!(c.status, CheckStatus::Ok);
    let a1 = c.variables.iter().find(|v| v.symbol.contains(r"\min 1")).unwrap().value;
    let a2 = c.variables.iter().find(|v| v.symbol.contains(r"\min 2")).unwrap().value;
    assert_relative_eq!(a1, 214.21, max_relative = 2e-3);
    assert_relative_eq!(a2, 1416.47, max_relative = 2e-3);
    assert_relative_eq!(c.value, 214.21, max_relative = 2e-3);
    assert_relative_eq!(uc(&c), 0.170461, max_relative = 3e-3);
    // De omgekeerde lezing zou 1 416 mm² eisen; die valt hier ruim boven de
    // aanwezige 1 257 mm² en zou de balk ten onrechte afkeuren.
    assert!(a2 > 1256.637, "de valkuil 'min als max lezen' is hier voelbaar");
}

/// Vrije staafafstand — §8.2(2) met de NB-waarden k₁ = 1 en k₂ = 5.
///
///   binnenmaat = 300 − 2·(35 + 10) = 300 − 90 = 210 mm
///   a_vrij     = (210 − 4·20)/(4 − 1) = 130/3 = 43,3333 mm
///   vereist    = max(1·20; 16 + 5; 20) = max(20; 21; 20) = 21 mm
///   UC         = 21/43,3333 = 0,484615
///
/// De bovenwapening 2Ø12 heeft (210 − 24)/1 = 186 mm vrij en is dus niet
/// maatgevend.
#[test]
fn referentiebalk_vrije_staafafstand() {
    let o = referentiebalk();
    let c = vrije_staafafstand_8_2(&volledige_invoer(&o));
    assert_eq!(c.status, CheckStatus::Ok);
    assert_relative_eq!(c.value, 21.0, max_relative = 1e-12);
    assert_relative_eq!(c.uc.as_ref().unwrap().rd, 130.0 / 3.0, max_relative = 1e-9);
    assert_relative_eq!(uc(&c), 21.0 / (130.0 / 3.0), max_relative = 1e-9);
}

/// De twee minimumdiameters en de minimale balkbreedte van de NB.
///
///   beugel Ø10 ≥ 5 mm  → UC = 5/10 = 0,5
///   kleinste langsstaaf Ø12 ≥ 6 mm → UC = 6/12 = 0,5
///   b_w = 300 mm ≥ max(100 + 0; 2,5·16 = 40) = 100 mm → UC = 100/300 = 0,3333
#[test]
fn referentiebalk_diameters_en_balkbreedte() {
    let o = referentiebalk();
    let inv = volledige_invoer(&o);
    assert_relative_eq!(uc(&min_diameter_beugel_9_2_2(&inv)), 0.5, max_relative = 1e-12);
    assert_relative_eq!(uc(&min_diameter_langsstaaf_9_2_1_1(&inv)), 0.5, max_relative = 1e-12);
    let c = min_balkbreedte_9_2(&inv);
    assert_relative_eq!(c.value, 100.0, max_relative = 1e-12);
    assert_relative_eq!(uc(&c), 1.0 / 3.0, max_relative = 1e-9);
}

// ===========================================================================
// De vijf plekken waar de Nederlandse bijlage van de EN-tekst afwijkt
// ===========================================================================

/// **Afwijking 1 — §9.2.1.1(1).** De hele OPMERKING 2 met (9.1N) is in de
/// Nederlandse uitgave doorgehaald.
///
/// De doorgehaalde EN-formule zou voor de referentiebalk
/// A_s,min = 0,26·(f_ctm/f_yk)·b_t·d = 0,26·(2,9/500)·300·545
/// = 0,26·0,0058·163 500 = 246,558 mm² geven, met als ondergrens
/// 0,0013·300·545 = 212,55 mm².
///
/// De NB-versie levert 214,21 mm². Die twee liggen dicht bij elkaar maar zijn
/// niet gelijk, en de toets moet uitdrukkelijk zeggen dat (9.1N) niet is
/// gebruikt.
#[test]
fn nb_afwijking_1_de_doorgehaalde_9_1n_wordt_niet_toegepast() {
    let o = referentiebalk();
    let c = as_min_9_2_1_1(&volledige_invoer(&o));
    let en_waarde = 0.26 * (F_CTM_C30 / 500.0) * 300.0 * 545.0;
    assert_relative_eq!(en_waarde, 246.558, max_relative = 1e-5);
    assert!(
        (c.value - en_waarde).abs() > 10.0,
        "A_s,min = {} ligt verdacht dicht bij de doorgehaalde (9.1N) = {en_waarde}",
        c.value
    );
    assert!(
        c.notes.iter().any(|n| n.contains("(9.1N)")),
        "de toets moet vermelden dat (9.1N) in NL niet geldt"
    );
    assert_eq!(c.article, "NB bij art. 9.2.1.1(1) — (9.1N) is in de Nederlandse uitgave doorgehaald");
}

/// **Afwijking 2 — §9.2.2(5)/(9.5N).** ρ_w,min = (0,08·√f_ck)/f_yk.
///
/// Voor C30/37 met B500: 0,08·√30/500 = 0,000876356. Deze test pint dat getal
/// vast; een andere coëfficiënt dan 0,08 of een f_ywk in plaats van f_yk zou
/// hier meteen opvallen.
#[test]
fn nb_afwijking_2_rho_w_min_is_0_08_wortel_fck_gedeeld_door_fyk() {
    let o = referentiebalk();
    let c = rho_w_min_9_2_2(&volledige_invoer(&o));
    assert_relative_eq!(c.value, 0.08 * 30.0_f64.sqrt() / 500.0, max_relative = 1e-12);
    assert_relative_eq!(c.value, 0.000876356, max_relative = 1e-5);

    // Een afwijkende beugelkwaliteit verandert ρ_w,min NIET: (9.5N) schrijft
    // f_yk, de vloeigrens van de LANGSWAPENING. Wel moet de toets dat melden.
    let mut o2 = referentiebalk();
    o2.cage.stirrup_fywk_mpa = Some(400.0);
    let c2 = rho_w_min_9_2_2(&volledige_invoer(&o2));
    assert_relative_eq!(c2.value, c.value, max_relative = 1e-12);
    assert!(c2.notes.iter().any(|n| n.contains("f_ywk")));
}

/// **Afwijking 3 — §9.2.2(6)/(9.6N).** Het plafond van 300 mm dat de EN-tekst
/// niet kent.
///
/// Balk 400 × 900, dekking 35, beugel Ø10, onder 4Ø25:
///   d = 900 − (35 + 10 + 12,5) = 842,5 mm
///   EN-waarde (9.6N): s_l,max = 0,75·842,5·(1 + cot 90°) = 631,875 mm
///   NB-waarde: min(631,875; 300) = 300 mm
///
/// Met s = 350 mm zou de EN-tekst de balk goedkeuren (350 ≤ 631,875) en keurt
/// de NB hem af: UC = 350/300 = 1,166667.
#[test]
fn nb_afwijking_3_s_l_max_krijgt_een_plafond_van_300_mm() {
    let mut cage = referentiekorf();
    cage.bottom = RebarRow { count: 4, diameter_mm: 25.0 };
    cage.stirrup_spacing_mm = Some(350.0);
    let o = Opzet { section: ConcreteSection::new(400.0, 900.0), cage, mat: materiaal() };
    let mut inv = volledige_invoer(&o);
    inv.dwarskrachtwapening_vereist = Some(true);
    let c = s_l_max_9_2_2(&inv);

    // De EN-waarde die hier NIET geldt.
    let en_waarde = 0.75 * 842.5;
    assert_relative_eq!(en_waarde, 631.875, max_relative = 1e-12);
    assert!(350.0 <= en_waarde, "met de EN-waarde zou 350 mm nog net mogen");

    assert_eq!(c.status, CheckStatus::NotOk, "de NB kapt af op 300 mm");
    assert_relative_eq!(c.value, 300.0);
    assert_relative_eq!(uc(&c), 350.0 / 300.0, max_relative = 1e-12);
    // 0,75·d staat er als tussenwaarde bij, zodat de constructeur ziet dat
    // niet de formule maar het plafond bindend is.
    let f = c.variables.iter().find(|v| v.symbol.contains("0{,}75")).unwrap();
    assert_relative_eq!(f.value, 631.875, max_relative = 1e-12);
}

/// **Afwijking 4 — §9.2.2(8)/(9.8N).** Het plafond is 500 mm en niet 600 mm,
/// en de tak hangt van V_Rd,max af.
///
/// Balk 700 × 800 met een opgegeven s_t van 550 mm:
///   EN-waarde (9.8N): s_t,max = 0,75·d ≤ 600 mm → 550 mm zou mogen
///   NB-waarde: 500 mm bij V_Ed ≤ 0,5·V_Rd,max → 550 mm mag NIET
///   UC = 550/500 = 1,1
#[test]
fn nb_afwijking_4_s_t_max_is_500_mm_en_niet_600_mm() {
    let mut cage = referentiekorf();
    cage.stirrup_leg_spacing_mm = Some(550.0);
    let o = Opzet { section: ConcreteSection::new(700.0, 800.0), cage, mat: materiaal() };
    let mut inv = volledige_invoer(&o);
    inv.v_ed_kn = Some(100.0);
    inv.v_rd_max_kn = Some(900.0); // 0,5·900 = 450 kN > 100 kN → ruime tak
    let c = s_t_max_9_2_2(&inv);

    // d = 800 − (35 + 10 + 10) = 745 mm; 0,75·745 = 558,75 mm, dus de
    // EN-tekst zou op min(558,75; 600) = 558,75 mm uitkomen en 550 mm nog
    // toelaten.
    let en_waarde: f64 = (0.75f64 * 745.0).min(600.0);
    assert_relative_eq!(en_waarde, 558.75, max_relative = 1e-12);
    assert!(550.0 <= en_waarde, "met de EN-waarde zou 550 mm nog mogen");

    assert_eq!(c.status, CheckStatus::NotOk);
    assert_relative_eq!(c.value, 500.0);
    assert_relative_eq!(uc(&c), 1.1, max_relative = 1e-12);
}

/// **Afwijking 5 — eisen die de EN-tekst helemaal niet heeft.**
///
/// De nationale bijlage voegt drie eisen toe die in de EN-uitgave niet
/// bestaan: Ø_beugel ≥ 5 mm (§9.2.2(9)), Ø_langs ≥ 6 mm (§9.2.1.1(5)) en
/// b ≥ 100 mm (§9.2(1)a). Een korf die alle drie net niet haalt, moet drie
/// keer worden afgekeurd — met de EN-tekst alleen zou er niets gebeuren.
///
///   beugel Ø4  → UC = 5/4  = 1,25
///   langs  Ø5  → UC = 6/5  = 1,2
///   lijf   90 mm → UC = 100/90 = 1,111111
#[test]
fn nb_afwijking_5_eisen_die_alleen_de_nationale_bijlage_kent() {
    // Een smal lijf met dunne staven: 90 mm lijf, dekking 10, beugel Ø4,
    // onder 2Ø5. Binnenmaat = 90 − 2·14 = 62 mm; 2·5 = 10 mm staal past.
    let cage = ReinforcementCage {
        cover_mm: 10.0,
        stirrup_diameter_mm: 4.0,
        top: RebarRow { count: 0, diameter_mm: 0.0 },
        bottom: RebarRow { count: 2, diameter_mm: 5.0 },
        stirrup_spacing_mm: Some(100.0),
        stirrup_legs: Some(2),
        ..ReinforcementCage::default()
    };
    let o = Opzet {
        section: ConcreteSection::tee(600.0, 120.0, 90.0, 400.0).unwrap(),
        cage,
        mat: materiaal(),
    };
    let inv = volledige_invoer(&o);

    let beugel = min_diameter_beugel_9_2_2(&inv);
    assert_eq!(beugel.status, CheckStatus::NotOk);
    assert_relative_eq!(uc(&beugel), 1.25, max_relative = 1e-12);

    let langs = min_diameter_langsstaaf_9_2_1_1(&inv);
    assert_eq!(langs.status, CheckStatus::NotOk);
    assert_relative_eq!(uc(&langs), 1.2, max_relative = 1e-12);

    let breedte = min_balkbreedte_9_2(&inv);
    assert_eq!(breedte.status, CheckStatus::NotOk);
    assert_relative_eq!(uc(&breedte), 100.0 / 90.0, max_relative = 1e-9);

    // Alle drie melden dat de eis alleen in de nationale bijlage staat.
    for c in [&beugel, &langs, &breedte] {
        assert!(
            c.article.contains("NB"),
            "{} zou een NB-artikel moeten dragen, staat nu: {}",
            c.id,
            c.article
        );
    }
}

// ===========================================================================
// De reeks als rapportinhoud
// ===========================================================================

/// Negen toetsen, alle groen op de referentiebalk, elk met artikel, formule,
/// variabelen en unity check. Dit is wat er in het rapport terechtkomt.
#[test]
fn de_referentiebalk_levert_negen_groene_narekenbare_toetsen() {
    let o = referentiebalk();
    let alle = detailleringstoetsen(&volledige_invoer(&o));
    assert_eq!(alle.len(), 9);
    for c in &alle {
        assert_eq!(c.status, CheckStatus::Ok, "{} is niet groen: {:?}", c.id, c.notes);
        assert!(uc(c) <= 1.0, "{} heeft uc = {}", c.id, uc(c));
        assert!(!c.article.is_empty(), "{} zonder artikel", c.id);
        assert!(!c.formula_latex.is_empty(), "{} zonder formule", c.id);
        assert!(!c.variables.is_empty(), "{} zonder variabelen", c.id);
        assert!(!c.notes.is_empty(), "{} zonder toelichting", c.id);
        // De unity check draagt de aanwezige én de vereiste waarde, zodat de
        // lezer ziet wat er is gemeten en wat er werd geëist.
        let u = c.uc.as_ref().unwrap();
        assert!(u.ed.is_finite() && u.rd.is_finite(), "{} heeft geen leesbare uc", c.id);
        assert!(!u.formula_latex.is_empty(), "{} zonder uc-formule", c.id);
    }
}

/// Zonder de projectgegevens vallen precies de toetsen uit die die gegevens
/// nodig hebben — en ze vallen uit als NotApplicable MET reden, niet als een
/// stilzwijgende "voldoet".
///
/// Voor de referentiebalk blijft er van de kale invoer één toets over die het
/// echt niet weet: §8.2(2) zonder d_g. De andere twee tak-afhankelijke toetsen
/// (s_l,max en s_t,max) kunnen wél uitspraak doen, want 200 mm respectievelijk
/// 220 mm vallen binnen de strengste tak.
#[test]
fn zonder_projectgegevens_zwijgt_geen_enkele_toets_zich_groen() {
    let o = referentiebalk();
    let alle = detailleringstoetsen(&kale_invoer(&o));
    for c in &alle {
        match c.status {
            CheckStatus::NotApplicable => {
                assert!(c.uc.is_none(), "{} is NotApplicable maar draagt een uc", c.id);
                assert!(!c.notes.is_empty(), "{} is NotApplicable zonder reden", c.id);
            }
            _ => assert!(c.uc.is_some(), "{} heeft een oordeel maar geen uc", c.id),
        }
    }
    let staaf = alle.iter().find(|c| c.id == "8.2_vrije_staafafstand").unwrap();
    assert_eq!(staaf.status, CheckStatus::NotApplicable);
    assert!(staaf.notes[0].contains("d_g"), "{:?}", staaf.notes);

    // s_l,max: 200 mm ≤ min(408,75; 300) = 300 mm, dus in beide takken goed.
    let sl = alle.iter().find(|c| c.id == "9.2.2_sl_max").unwrap();
    assert_eq!(sl.status, CheckStatus::Ok);
    assert_relative_eq!(sl.value, 300.0);
    // s_t,max: 220 mm ≤ min(0,75·545; 500) = 408,75 mm, dus ook.
    let st = alle.iter().find(|c| c.id == "9.2.2_st_max").unwrap();
    assert_eq!(st.status, CheckStatus::Ok);
    assert_relative_eq!(st.value, 408.75, max_relative = 1e-12);

    // De balkbreedtetoets zegt met zoveel woorden welke deeleisen zijn
    // overgeslagen; ze verdwijnen niet stilletjes.
    let breedte = alle.iter().find(|c| c.id == "9.2_min_balkbreedte").unwrap();
    let tekst = breedte.notes.join(" ");
    for deel in ["9.2(1)b is NIET getoetst", "9.2(1)c is NIET getoetst", "9.2(1)e is NIET getoetst"]
    {
        assert!(tekst.contains(deel), "ontbrekende melding: {deel}");
    }
}

/// Een korf zonder beugelgegevens laat de vier dwarskrachttoetsen uitvallen —
/// alle vier met een reden — en laat de vijf langswapenings- en
/// meetkundetoetsen gewoon staan.
#[test]
fn een_korf_zonder_beugels_laat_alleen_de_beugeltoetsen_uitvallen() {
    let mut o = referentiebalk();
    o.cage.stirrup_diameter_mm = 0.0;
    o.cage.stirrup_spacing_mm = None;
    o.cage.stirrup_legs = None;
    let alle = detailleringstoetsen(&volledige_invoer(&o));

    for id in ["9.2.2_rho_w_min", "9.2.2_sl_max", "9.2.2_st_max", "9.2.2_min_diameter_beugel"] {
        let c = alle.iter().find(|c| c.id == id).unwrap();
        assert_eq!(c.status, CheckStatus::NotApplicable, "{id}");
        assert!(c.uc.is_none(), "{id} draagt een uc terwijl hij niets weet");
        assert!(!c.notes[0].is_empty(), "{id} zonder reden");
    }
    for id in [
        "9.2.1.1_as_min",
        "9.2.1.1_as_max",
        "9.2.1.1_min_diameter_langs",
        "9.2_min_balkbreedte",
        "8.2_vrije_staafafstand",
    ] {
        let c = alle.iter().find(|c| c.id == id).unwrap();
        assert_ne!(c.status, CheckStatus::NotApplicable, "{id} zou wél te toetsen moeten zijn");
    }
    // De diametertoets wijst op 6.2.1(4): ook zonder rekenkundige noodzaak
    // hoort er minimale dwarskrachtwapening in een balk te zitten.
    let beugel = alle.iter().find(|c| c.id == "9.2.2_min_diameter_beugel").unwrap();
    assert!(beugel.notes[0].contains("6.2.1(4)"));
}

/// Bij een T-ligger rekent ρ_w met de LIJFbreedte en niet met de flens.
///
/// T 900/150 op een lijf van 250 mm, hoogte 600 mm, beugel Ø10 tweebenig
/// h.o.h. 200 mm:
///   ρ_w = 157,0796/(200·250) = 157,0796/50 000 = 0,00314159
/// Met de flensbreedte van 900 mm zou er 0,00087267 uitkomen — net onder
/// ρ_w,min = 0,00087636 — en zou de balk ten onrechte worden AFGEKEURD.
#[test]
fn bij_een_t_ligger_telt_de_lijfbreedte_voor_rho_w() {
    let o = Opzet {
        section: ConcreteSection::tee(900.0, 150.0, 250.0, 600.0).unwrap(),
        cage: referentiekorf(),
        mat: materiaal(),
    };
    let c = rho_w_min_9_2_2(&volledige_invoer(&o));
    assert!(c.variables.iter().any(|v| v.symbol == "b_w" && v.value == 250.0));
    assert_relative_eq!(c.uc.as_ref().unwrap().rd, 0.00314159, max_relative = 1e-5);
    assert_eq!(c.status, CheckStatus::Ok);

    let met_flens = 157.0796 / (200.0 * 900.0);
    assert!(met_flens < c.value, "met de flensbreedte zou de toets afkeuren: {met_flens}");
}

/// Elke toets draagt het krachtenpunt waarop hij is uitgevoerd mee. Voor de
/// detaillering is dat vooral van belang bij A_s,min (M_Ed en N_Ed staan in de
/// formule) en bij de nuttige hoogte d, die aan de trekzijde wordt genomen.
#[test]
fn elke_toets_draagt_het_krachtenpunt_mee() {
    let o = referentiebalk();
    let alle = detailleringstoetsen(&volledige_invoer(&o));
    for c in &alle {
        assert_eq!(c.force_state.combination_id, 3, "{}", c.id);
        assert_relative_eq!(c.force_state.position_mm, 3000.0);
    }
}

/// Bij een NEGATIEF moment ligt de trekzijde boven: A_s,min toetst dan de
/// bovenwapening, en d wordt de afstand tot de bovenstaven.
///
/// Referentiebalk met M_Ed = −60 kNm:
///   d = 600 − d₂ = 600 − 51 = 549 mm  → 0,75·d = 411,75 mm
///   getoetste wapening = de bovenwapening 2Ø12 = 226,195 mm²
#[test]
fn bij_een_negatief_moment_ligt_de_trekzijde_boven() {
    let o = referentiebalk();
    let mut inv = volledige_invoer(&o);
    inv.force_state = krachten(0.0, -60.0);
    let c = as_min_9_2_1_1(&inv);
    let a_trek = c.variables.iter().find(|v| v.symbol.contains("A_{s,trek}")).unwrap().value;
    assert_relative_eq!(a_trek, 226.19467, max_relative = 1e-5);

    let st = s_t_max_9_2_2(&inv);
    let d = st.variables.iter().find(|v| v.symbol == "d").unwrap().value;
    assert_relative_eq!(d, 549.0, max_relative = 1e-12);
    assert_relative_eq!(st.value, 500.0, max_relative = 1e-12);
}
