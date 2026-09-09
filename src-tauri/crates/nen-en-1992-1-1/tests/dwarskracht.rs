//! §6.2 Dwarskracht — toetsen met MET DE HAND uitgerekende waarden.
//!
//! Elke verwachte waarde in dit bestand is buiten de code om uitgerekend en
//! staat als rekenregel in het commentaar. Een test die de module met zichzelf
//! vergelijkt bewaakt niets; wat hier wordt vastgelegd is dat de module
//! dezelfde getallen oplevert als iemand die (6.2.a), (6.2.b), (6.8) en (6.9)
//! met de hand invult.
//!
//! De laatste test is de acceptatieproef tegen een externe
//! referentie-berekening van een plaatstrook. Die WIJKT AF; het verschil staat
//! er met de reden bij en er is niets aan de coëfficiënten veranderd om hem
//! kloppend te maken.

use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::dwarskracht::{
    beta_6_2_2_6, check_shear, shear_resistance, CotThetaKeuze, LastNabijSteunpunt, ShearOptions,
    Spoor, VakwerkTak, VrdCTak, Weerstandsroute,
};
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, ConcreteSection, DesignMaterial,
    DesignSituation, RebarRow, ReinforcementCage, SteelBranch,
};
use nen_en_1993_1_1_section::CheckStatus;

const EPS: f64 = 1e-3;

fn dichtbij(gevonden: f64, verwacht: f64, marge: f64, wat: &str) {
    assert!(
        (gevonden - verwacht).abs() <= marge,
        "{wat}: gevonden {gevonden:.6}, verwacht {verwacht:.6} (marge {marge})"
    );
}

fn snap(n_kn: f64, v_kn: f64, m_knm: f64) -> ForceStateSnapshot {
    ForceStateSnapshot {
        combination_id: 1,
        position_mm: 0.0,
        forces: InternalForces { n_ed: n_kn, vz_ed: v_kn, my_ed: m_knm, ..Default::default() },
    }
}

fn materiaal(beton: &str) -> DesignMaterial {
    DesignMaterial::new(
        concrete_class_by_name(beton).unwrap(),
        reinforcement_grade_by_name("B500B").unwrap(),
        DesignSituation::PersistentTransient,
        SteelBranch::Horizontal,
    )
}

/// Ligger 300 × 500 mm, C30/37, dekking 30 mm, beugel Ø8, onder 3Ø16.
///
/// d = 500 − (30 + 8 + 16/2) = 454 mm; A_sl = 3 · π/4 · 16² = 603,18579 mm².
fn ligger(beugels: Option<(f64, u32)>) -> (ConcreteSection, ReinforcementCage, DesignMaterial) {
    let mut korf = ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 0, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        ..ReinforcementCage::default()
    };
    if let Some((s, n)) = beugels {
        korf.stirrup_spacing_mm = Some(s);
        korf.stirrup_legs = Some(n);
    }
    (ConcreteSection::new(300.0, 500.0), korf, materiaal("C30/37"))
}

// ── V_Rd,c ────────────────────────────────────────────────────────────────────

#[test]
fn v_rd_c_is_de_grootste_van_6_2a_en_6_2b_niet_de_kleinste() {
    // Plaatstrook 1000 × 280 mm, C20/25, Ø10-150 (A_sl = 523,5988 mm²/m),
    // dekking 25 mm, geen beugel → d = 280 − (25 + 0 + 5) = 250 mm.
    //
    //   k     = 1 + √(200/250) = 1 + 0,8944272 = 1,8944272   (< 2,0)
    //   ρ_l   = 523,5988/(1000 · 250) = 0,00209440           (< 0,02)
    //   C_Rd,c= 0,18/1,5 = 0,12
    //   100·ρ_l·f_ck = 100 · 0,00209440 · 20 = 4,188790
    //   (4,188790)^(1/3) = 1,611990
    //   (6.2.a) = 0,12 · 1,8944272 · 1,611990 · 1000 · 250
    //           = 0,3664562 · 250 000 = 91 614 N = 91,614 kN
    //   v_min = 0,035 · 1,8944272^1,5 · √20
    //         = 0,035 · 2,6074216 · 4,4721360 = 0,4081313 N/mm²
    //   (6.2.b) = 0,4081313 · 250 000 = 102 033 N = 102,033 kN
    //   V_Rd,c  = max(91,614; 102,033) = 102,033 kN → (6.2.b) is maatgevend.
    let doorsnede = ConcreteSection::new(1000.0, 280.0);
    let korf = ReinforcementCage {
        cover_mm: 25.0,
        stirrup_diameter_mm: 0.0,
        top: RebarRow { count: 7, diameter_mm: 10.0 },
        bottom: RebarRow { count: 7, diameter_mm: 10.0 },
        ..ReinforcementCage::default()
    };
    let mat = materiaal("C20/25");
    // Ø10-150 is 6⅔ staven per meter; de korf telt hele staven, dus A_sl gaat
    // als getal mee. Dat is precies waarvoor `a_sl_mm2` bestaat.
    let opts = ShearOptions { a_sl_mm2: Some(523.5987756), ..ShearOptions::default() };
    let r = shear_resistance(&doorsnede, &korf, &mat, &snap(0.0, 30.0, 100.0), &opts);

    dichtbij(r.vrd_c.d_mm, 250.0, 1e-9, "d");
    dichtbij(r.vrd_c.k, 1.8944272, 1e-6, "k");
    dichtbij(r.vrd_c.rho_l, 0.00209440, 1e-8, "ρ_l");
    dichtbij(r.vrd_c.v_min_mpa, 0.4081313, 1e-6, "v_min");
    dichtbij(r.vrd_c.v_6_2a_kn, 91.614, 2e-2, "(6.2.a)");
    dichtbij(r.vrd_c.v_6_2b_kn, 102.033, 2e-2, "(6.2.b)");
    dichtbij(r.vrd_c.v_rd_c_kn, 102.033, 2e-2, "V_Rd,c");
    assert_eq!(r.vrd_c.tak, VrdCTak::Formule62b);
    // (6.2.b) is in de norm ingeleid met "met een minimum van": de GROOTSTE.
    assert!(r.vrd_c.v_rd_c_kn > r.vrd_c.v_6_2a_kn);
}

#[test]
fn rho_l_wordt_op_0_02_afgekapt() {
    // A_sl = 10 000 mm² bij b_w · d = 300 · 454 = 136 200 mm² geeft
    // ρ_l = 0,07342 → afgekapt op 0,02.
    let (s, k, m) = ligger(None);
    let opts = ShearOptions { a_sl_mm2: Some(10_000.0), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 40.0, 100.0), &opts);
    dichtbij(r.vrd_c.rho_l, 0.02, 1e-12, "ρ_l");
    assert!(r.vrd_c.rho_l_begrensd);
    // (6.2.a) = 0,12 · 1,6637233 · (100 · 0,02 · 30)^(1/3) · 136 200
    //         = 0,12 · 1,6637233 · 3,9148676 · 136 200
    //         = 0,7815975 · 136 200 = 106 454 N = 106,454 kN.
    dichtbij(r.vrd_c.v_6_2a_kn, 106.454, 2e-2, "(6.2.a) met afgekapte ρ_l");
}

// ── Het vakwerkmodel ─────────────────────────────────────────────────────────

#[test]
fn vakwerk_handberekening_bij_cot_theta_2_5() {
    // Ligger 300 × 500, C30/37, beugel Ø8 tweebenig h.o.h. 150 mm.
    //
    //   A_sw   = 2 · π/4 · 8² = 100,530965 mm²
    //   A_sw/s = 100,530965/150 = 0,67020643 mm²/mm
    //   f_ywd  = 500/1,15 = 434,782609 N/mm²
    //   z      = 0,9 · 454 = 408,6 mm
    //   ν₁     = ν = 0,6 · (1 − 30/250) = 0,528
    //   f_cd   = 30/1,5 = 20 N/mm²
    //
    //   (6.8)  V_Rd,s   = 0,67020643 · 408,6 · 434,782609 · 2,5
    //                   = 119 063,63 · 2,5 = 297 659 N = 297,659 kN
    //   (6.9)  teller   = 1 · 300 · 408,6 · 0,528 · 20 = 1 294 444,8 N
    //          V_Rd,max = 1 294 444,8/(2,5 + 0,4) = 446 360 N = 446,360 kN
    //   V_Rd = min(297,659; 446,360) = 297,659 kN → (6.8) maatgevend.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions { cot_theta: Some(2.5), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    assert_eq!(r.spoor, Spoor::Vakwerkmodel);
    let v = r.vakwerk.as_ref().unwrap();
    dichtbij(v.z_mm, 408.6, 1e-9, "z");
    dichtbij(v.nu1, 0.528, 1e-12, "ν₁");
    dichtbij(v.a_sw_mm2.unwrap(), 100.530965, 1e-5, "A_sw");
    dichtbij(v.f_ywd_mpa.unwrap(), 434.782609, 1e-5, "f_ywd");
    dichtbij(v.v_rd_s_kn.unwrap(), 297.659, EPS * 10.0, "V_Rd,s");
    dichtbij(v.v_rd_max_kn, 446.360, EPS * 10.0, "V_Rd,max");
    dichtbij(r.v_rd_kn.unwrap(), 297.659, EPS * 10.0, "V_Rd");
    assert_eq!(v.tak, Some(VakwerkTak::WapeningVloeit));
    dichtbij(r.uc.unwrap(), 250.0 / 297.659, 1e-5, "UC");
}

#[test]
fn vakwerk_handberekening_bij_cot_theta_1() {
    //   (6.8)  V_Rd,s   = 0,67020643 · 408,6 · 434,782609 · 1,0 = 119,064 kN
    //   (6.9)  V_Rd,max = 1 294 444,8/(1 + 1) = 647 222 N = 647,222 kN
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions { cot_theta: Some(1.0), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    let v = r.vakwerk.as_ref().unwrap();
    dichtbij(v.v_rd_s_kn.unwrap(), 119.064, EPS * 10.0, "V_Rd,s");
    dichtbij(v.v_rd_max_kn, 647.222, EPS * 10.0, "V_Rd,max");
    dichtbij(v.theta_deg, 45.0, 1e-9, "θ");
    // (6.12): ½·α_cw·ν₁·f_cd = 0,5 · 1 · 0,528 · 20 = 5,28 N/mm²;
    //         aanwezig A_sw·f_ywd/(b_w·s) = 100,530965 · 434,782609/(300 · 150)
    //                                     = 43 709,12/45 000 = 0,97131 N/mm².
    dichtbij(v.asw_max_grens_mpa, 5.28, 1e-9, "(6.12) grens");
    dichtbij(v.asw_max_aanwezig_mpa.unwrap(), 0.97131, 1e-5, "(6.12) aanwezig");
    assert_eq!(v.asw_max_voldoet, Some(true));
}

#[test]
fn de_betonbijdrage_wordt_in_het_vakwerkspoor_niet_opgeteld() {
    // De klassieke fout: V_Rd = V_Rd,c + V_Rd,s. Zodra V_Ed > V_Rd,c vervalt
    // V_Rd,c volledig (6.2.3(3): "de kleinste waarde van" (6.8) en (6.9)).
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions { cot_theta: Some(2.5), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    let v_rd_c = r.vrd_c.v_rd_c_kn; // 64,402 kN
    let v_rd_s = r.vakwerk.as_ref().unwrap().v_rd_s_kn.unwrap(); // 297,659 kN
    dichtbij(v_rd_c, 64.402, 2e-2, "V_Rd,c");
    dichtbij(r.v_rd_kn.unwrap(), v_rd_s, 1e-9, "V_Rd = V_Rd,s");
    assert!(
        (r.v_rd_kn.unwrap() - (v_rd_c + v_rd_s)).abs() > 60.0,
        "V_Rd mag niet de som van beton en wapening zijn"
    );
    assert!(r.notes.iter().any(|n| n.contains("NIET opgeteld")));
}

// ── De weerstand van een doorsnede die beugels DRAAGT ────────────────────────
//
// 6.2.1(3) beantwoordt de vraag of er wapening moet worden ONTWORPEN. 6.2.1(2)
// beantwoordt de vraag wat een element MET dwarskrachtwapening kan dragen. Die
// twee vragen zijn niet dezelfde, en de vier proeven hieronder houden dat vast.

#[test]
fn beugels_dragen_ook_waar_6_2_1_3_er_niet_om_vraagt() {
    // Ligger 300 × 500, C30/37, beugel Ø8 tweebenig h.o.h. 150 mm, V_Ed = 60 kN.
    //
    //   V_Rd,c = 64,4028 kN ≥ 60 kN → 6.2.1(3): geen BEREKENDE wapening nodig.
    //
    // De beugels liggen er niettemin, en 6.2.1(2) geeft een element met
    // dwarskrachtwapening de weerstand V_Rd,s (bij constante hoogte; V_ccd en
    // V_td zijn nul). Met cot θ = 2,5 — de automatische keuze, want
    // K = 1 294 444,8/60 000 = 21,6 ≫ 2 — is dat:
    //
    //   A_sw/s = 100,530965/150 = 0,67020643 mm²/mm ; z = 0,9·454 = 408,6 mm
    //   (6.8)  V_Rd,s   = 0,67020643·408,6·434,782609·2,5 = 297 659 N = 297,659 kN
    //   (6.9)  V_Rd,max = 1 294 444,8/2,9                 = 446 360 N = 446,360 kN
    //   V_Rd = max(64,4028 ; min(297,659; 446,360)) = 297,659 kN
    //   UC   = 60/297,659 = 0,20157
    //
    // Vóór deze reparatie meldde de kern hier 64,4028 kN en UC = 0,932 — een
    // getal dat uit de spoorgrens kwam en niet uit de constructie.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 60.0, 100.0), &ShearOptions::default());

    // Het SPOOR blijft wat het was: 6.2.1(3) eist hier geen berekende wapening.
    assert_eq!(r.spoor, Spoor::GeenBerekendeWapening);
    // Maar de WEERSTAND komt van de beugels.
    assert_eq!(r.weerstandsroute, Some(Weerstandsroute::Dwarskrachtwapening));
    dichtbij(r.vrd_c.v_rd_c_kn, 64.4028, 2e-2, "V_Rd,c");
    dichtbij(r.vakwerk.as_ref().unwrap().cot_theta, 2.5, 1e-12, "cot θ");
    dichtbij(r.vakwerk.as_ref().unwrap().v_rd_s_kn.unwrap(), 297.659, EPS * 10.0, "V_Rd,s");
    dichtbij(r.v_rd_kn.unwrap(), 297.659, EPS * 10.0, "V_Rd");
    dichtbij(r.uc.unwrap(), 60.0 / 297.659, 1e-5, "UC");
    // En de afleiding zegt met zoveel woorden waaróm.
    assert!(r.notes.iter().any(|n| n.contains("6.2.1(2)")));
}

#[test]
fn de_weerstand_springt_niet_op_de_grens_v_ed_gelijk_v_rd_c() {
    // Dit is het verschijnsel waar de reparatie om begon: aan weerszijden van
    // V_Ed = V_Rd,c = 64,4028 kN horen dezelfde beugels te dragen.
    //
    //   V_Ed = 64 kN → spoor A (6.2.1(3)) ; V_Ed = 65 kN → spoor B (6.2.1(5))
    //   In beide gevallen K = teller/V_Ed ≫ 2, dus cot θ = 2,5 en
    //   V_Rd = V_Rd,s = 297,659 kN. Het verschil in unity check is dan
    //   64/297,659 = 0,21501 tegen 65/297,659 = 0,21837 — de sprong in V_Ed
    //   zelf, en niets meer.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let onder = shear_resistance(&s, &k, &m, &snap(0.0, 64.0, 100.0), &ShearOptions::default());
    let boven = shear_resistance(&s, &k, &m, &snap(0.0, 65.0, 100.0), &ShearOptions::default());

    assert_eq!(onder.spoor, Spoor::GeenBerekendeWapening);
    assert_eq!(boven.spoor, Spoor::Vakwerkmodel);
    dichtbij(onder.v_rd_kn.unwrap(), 297.659, EPS * 10.0, "V_Rd net onder de grens");
    dichtbij(boven.v_rd_kn.unwrap(), 297.659, EPS * 10.0, "V_Rd net boven de grens");
    dichtbij(onder.v_rd_kn.unwrap(), boven.v_rd_kn.unwrap(), 1e-9, "geen sprong in V_Rd");
    dichtbij(onder.uc.unwrap(), 64.0 / 297.659, 1e-5, "UC net onder de grens");
    dichtbij(boven.uc.unwrap(), 65.0 / 297.659, 1e-5, "UC net boven de grens");
    // De unity check mag over die grens hooguit met de sprong in V_Ed stijgen.
    assert!(
        (boven.uc.unwrap() - onder.uc.unwrap()).abs() < 0.01,
        "de unity check springt op de spoorgrens: {} → {}",
        onder.uc.unwrap(),
        boven.uc.unwrap()
    );
}

#[test]
fn zwakke_beugels_verlagen_de_weerstand_niet_onder_v_rd_c() {
    // De keerzijde: de weerstand is de GROOTSTE van de twee bewijzen, dus een
    // magere beugel mag V_Rd,c niet wegdrukken. 6.2.1(3) blijft immers een
    // geldig bewijs zolang V_Ed ≤ V_Rd,c.
    //
    // Beugel Ø8 tweebenig h.o.h. 400 mm, cot θ = 1 opgelegd:
    //   A_sw/s = 100,530965/400 = 0,25132741 mm²/mm ; z = 408,6 mm
    //   (6.8) V_Rd,s = 0,25132741·408,6·434,782609·1,0 = 44 649 N = 44,649 kN
    //   V_Rd,c = 64,4028 kN ≥ V_Ed = 60 kN
    //   V_Rd = max(64,4028 ; 44,649) = 64,4028 kN ; UC = 60/64,4028 = 0,93163
    let (s, k, m) = ligger(Some((400.0, 2)));
    let opts = ShearOptions { cot_theta: Some(1.0), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 60.0, 100.0), &opts);

    assert_eq!(r.spoor, Spoor::GeenBerekendeWapening);
    assert_eq!(r.weerstandsroute, Some(Weerstandsroute::BetonZonderWapening));
    dichtbij(r.vakwerk.as_ref().unwrap().v_rd_s_kn.unwrap(), 44.649, 2e-2, "V_Rd,s");
    dichtbij(r.v_rd_kn.unwrap(), 64.4028, 2e-2, "V_Rd = V_Rd,c");
    dichtbij(r.uc.unwrap(), 60.0 / 64.4028, 1e-4, "UC");
}

#[test]
fn zonder_beugels_blijft_v_rd_c_de_hele_weerstand() {
    // 9.2.2 kent geen weerstandsbijdrage toe; wat telt is of er wapening LIGT.
    // Ligt er niets, dan is er geen (6.8) en blijft V_Rd,c de hele weerstand —
    // precies zoals vóór de reparatie.
    let (s, k, m) = ligger(None);
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 60.0, 100.0), &ShearOptions::default());
    assert_eq!(r.spoor, Spoor::GeenBerekendeWapening);
    assert_eq!(r.weerstandsroute, Some(Weerstandsroute::BetonZonderWapening));
    assert!(r.vakwerk.as_ref().unwrap().v_rd_s_kn.is_none());
    // Zonder beugels is er ook geen θ te kiezen; cot θ = 1 maakt (6.9) maximaal.
    let keuze = r.vakwerk.as_ref().unwrap().cot_theta_keuze;
    assert_eq!(keuze, CotThetaKeuze::GeenDwarskrachtwapening);
    dichtbij(r.v_rd_kn.unwrap(), 64.4028, 2e-2, "V_Rd = V_Rd,c");
    dichtbij(r.uc.unwrap(), 60.0 / 64.4028, 1e-4, "UC");
}

#[test]
fn de_bovengrens_van_6_2_1_6_bijt_als_v_rd_c_boven_v_rd_max_uitkomt() {
    // 6.2.1(6): V_Ed mag "op geen enkele plaats in het element" boven V_Rd,max
    // uitkomen. Dat kan V_Rd,c overrulen, en met een kunstmatig kleine z is dat
    // te laten zien. z = 30 mm opgegeven, cot θ = 1, beugel Ø8-400:
    //
    //   teller (6.9) = 1,0·300·30·0,528·20 = 95 040 N
    //   V_Rd,max     = 95 040/(1 + 1) = 47 520 N = 47,52 kN
    //   (6.8) V_Rd,s = 0,25132741·30·434,782609·1,0 = 3 278 N = 3,278 kN
    //   V_Rd,c = 64,4028 kN ≥ V_Ed = 60 kN → spoor A, betonroute is het
    //   gunstigste bewijs, maar 64,4028 > V_Rd,max = 47,52 kN.
    //   V_Rd = min(64,4028 ; 47,52) = 47,52 kN ; UC = 60/47,52 = 1,26263
    //
    // z = 30 mm hoort bij geen enkele echte balk; het is de enige manier om
    // deze tak zonder normaalkracht te bereiken, en zij moet blijven werken.
    let (s, k, m) = ligger(Some((400.0, 2)));
    let opts = ShearOptions {
        z_mm: Some(30.0),
        cot_theta: Some(1.0),
        ..ShearOptions::default()
    };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 60.0, 100.0), &opts);

    assert_eq!(r.spoor, Spoor::GeenBerekendeWapening);
    dichtbij(r.vakwerk.as_ref().unwrap().v_rd_max_kn, 47.52, 1e-3, "V_Rd,max");
    dichtbij(r.vakwerk.as_ref().unwrap().v_rd_s_kn.unwrap(), 3.278, 2e-3, "V_Rd,s");
    dichtbij(r.v_rd_kn.unwrap(), 47.52, 1e-3, "V_Rd begrensd door 6.2.1(6)");
    dichtbij(r.uc.unwrap(), 60.0 / 47.52, 1e-5, "UC");
    assert!(r.notes.iter().any(|n| n.contains("6.2.1(6)")));
}

#[test]
fn de_afleiding_noemt_welk_bewijs_de_weerstand_levert() {
    // Wat er ook uit komt, de lezer moet kunnen zien of hij naar (6.2.a/b) of
    // naar (6.8)/(6.9) kijkt, met welke cot θ, en waarom.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let calc = check_shear(&s, &k, &m, snap(0.0, 60.0, 100.0), &ShearOptions::default());

    let route = calc
        .deelstappen
        .iter()
        .find(|d| d.id == "dwarskracht_weerstandsroute")
        .expect("de deelstap met de weerstandsroute ontbreekt");
    assert_eq!(route.article, "art. 6.2.1(2) en 6.2.3(3)");
    dichtbij(route.value.unwrap(), 297.659, EPS * 10.0, "V_Rd in de afleiding");
    assert!(route.notes.iter().any(|n| n.contains("6.2.1(3)")), "{:?}", route.notes);
    // De spoorstap blijft ernaast staan en zegt wat 6.2.1(3) vindt.
    let spoor = calc
        .deelstappen
        .iter()
        .find(|d| d.id == "dwarskracht_spoor")
        .expect("de spoorstap ontbreekt");
    assert!(spoor.notes.iter().any(|n| n.contains("geen BEREKENDE")));
    // En de θ die is gebruikt staat er als eigen stap bij.
    assert!(calc.deelstappen.iter().any(|d| d.id == "dwarskracht_theta"));
    // De kop van de toets verwijst naar het vakwerkmodel, want dát levert hier
    // het getal.
    assert_eq!(calc.article, "art. 6.2.3(3) (6.8) en (6.9)");
}

// ── De keuze van θ ───────────────────────────────────────────────────────────

#[test]
fn theta_wordt_zo_groot_mogelijk_gekozen_binnen_de_nb_grenzen() {
    // V_Ed = 500 kN. K = teller/V_Ed = 1 294 444,8/500 000 = 2,5888896.
    // cot θ + tan θ = K → c² − K·c + 1 = 0 → c = (K + √(K² − 4))/2
    //   K² = 6,7023487; K² − 4 = 2,7023487; √ = 1,6438822
    //   c = (2,5888896 + 1,6438822)/2 = 2,1163859  (binnen 1,0…2,5)
    // Bij die cot θ is V_Rd,max per constructie precies 500 kN, en
    //   V_Rd,s = 119 063,63 · 2,1163859 = 251 985 N = 251,985 kN.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 500.0, 100.0), &ShearOptions::default());
    let v = r.vakwerk.as_ref().unwrap();
    assert_eq!(v.cot_theta_keuze, CotThetaKeuze::Automatisch);
    dichtbij(v.cot_theta, 2.1163859, 1e-6, "cot θ");
    dichtbij(v.v_rd_max_kn, 500.0, 1e-3, "V_Rd,max = V_Ed bij de gekozen θ");
    dichtbij(v.v_rd_s_kn.unwrap(), 251.985, 2e-2, "V_Rd,s");
    dichtbij(r.v_rd_kn.unwrap(), 251.985, 2e-2, "V_Rd");
}

#[test]
fn theta_wordt_op_de_nb_bovengrens_2_5_afgekapt() {
    // V_Ed = 300 kN → K = 4,314816 → c = 4,069 > 2,5 → cot θ = 2,5.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 300.0, 100.0), &ShearOptions::default());
    let v = r.vakwerk.as_ref().unwrap();
    dichtbij(v.cot_theta, 2.5, 1e-12, "cot θ");
    dichtbij(v.v_rd_s_kn.unwrap(), 297.659, EPS * 10.0, "V_Rd,s");
    dichtbij(v.v_rd_max_kn, 446.360, EPS * 10.0, "V_Rd,max");
    // 297,659 < 300 → afgekeurd.
    assert!(r.uc.unwrap() > 1.0);
}

#[test]
fn opgegeven_cot_theta_buiten_de_grenzen_wordt_afgekapt_en_gemeld() {
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions { cot_theta: Some(4.0), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    let v = r.vakwerk.as_ref().unwrap();
    dichtbij(v.cot_theta, 2.5, 1e-12, "cot θ");
    assert_eq!(v.cot_theta_keuze, CotThetaKeuze::OpgegevenAfgekapt);
}

#[test]
fn drukdiagonaal_te_klein_dan_helpt_meer_beugelwapening_niet() {
    // Beugel Ø12 vierbenig h.o.h. 100 mm. De dikkere beugel verandert de
    // nuttige hoogte: d = 500 − (30 + 12 + 16/2) = 450 mm, dus z = 405 mm.
    //   A_sw   = 4 · π/4 · 12² = 452,389342 mm²; A_sw/s = 4,52389342 mm²/mm
    //   (6.8) bij cot θ = 1: 4,52389342 · 405 · 434,782609 = 796 599 N
    //   (6.9) teller = 1 · 300 · 405 · 0,528 · 20 = 1 283 040 N
    //         bij cot θ = 1: 1 283 040/2 = 641 520 N  ← maatgevend
    // V_Ed = 700 kN geeft K = 1 283 040/700 000 = 1,833 < 2: zelfs bij
    // cot θ = 1 haalt de drukdiagonaal het niet.
    let (s, mut k, m) = ligger(Some((100.0, 4)));
    k.stirrup_diameter_mm = 12.0;
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 700.0, 100.0), &ShearOptions::default());
    let v = r.vakwerk.as_ref().unwrap();
    assert_eq!(v.cot_theta_keuze, CotThetaKeuze::AutomatischDrukdiagonaalTeKlein);
    dichtbij(v.cot_theta, 1.0, 1e-12, "cot θ");
    dichtbij(v.v_rd_s_kn.unwrap(), 796.599, 2e-2, "V_Rd,s");
    dichtbij(v.v_rd_max_kn, 641.520, 2e-2, "V_Rd,max");
    dichtbij(r.v_rd_kn.unwrap(), 641.520, 2e-2, "V_Rd");
    assert_eq!(v.tak, Some(VakwerkTak::DrukdiagonaalBezwijkt));
    assert!(r.notes.iter().any(|n| n.contains("Méér beugelwapening helpt hier niet")));
}

#[test]
fn formule_6_12_zegt_hetzelfde_als_v_rd_s_gelijk_v_rd_max_bij_cot_theta_1() {
    // (6.12) staat in de PDF als formulebeeld en is afgeleid uit (6.8) en
    // (6.9). Deze test controleert die afleiding numeriek: de verhouding
    // grens/aanwezig van (6.12) moet gelijk zijn aan V_Rd,max/V_Rd,s.
    //   aanwezig = 452,389342 · 434,782609/(300 · 100) = 196 691/30 000
    //            = 6,55636 N/mm²;  grens = 5,28 N/mm²
    //   5,28/6,55636 = 0,80533   en   641 520/796 599 = 0,80532
    let (s, mut k, m) = ligger(Some((100.0, 4)));
    k.stirrup_diameter_mm = 12.0;
    let opts = ShearOptions { cot_theta: Some(1.0), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 700.0, 100.0), &opts);
    let v = r.vakwerk.as_ref().unwrap();
    dichtbij(v.asw_max_aanwezig_mpa.unwrap(), 6.55636, 1e-4, "(6.12) aanwezig");
    dichtbij(v.asw_max_grens_mpa, 5.28, 1e-12, "(6.12) grens");
    assert_eq!(v.asw_max_voldoet, Some(false));
    let uit_6_12 = v.asw_max_grens_mpa / v.asw_max_aanwezig_mpa.unwrap();
    let uit_6_8_en_6_9 = v.v_rd_max_kn / v.v_rd_s_kn.unwrap();
    dichtbij(uit_6_12, uit_6_8_en_6_9, 1e-9, "(6.12) tegen (6.8)/(6.9)");
    assert!(r.notes.iter().any(|n| n.contains("(6.12)")));
}

#[test]
fn boven_cot_theta_1_wordt_6_12_niet_getoetst() {
    // (6.12) geldt volgens de OPMERKING uitsluitend voor cot θ = 1.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions { cot_theta: Some(2.0), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    assert_eq!(r.vakwerk.as_ref().unwrap().asw_max_voldoet, None);
}

// ── z, f_ywd en ΔF_td ────────────────────────────────────────────────────────

#[test]
fn z_is_0_9d_alleen_zonder_normaalkracht() {
    let (s, k, m) = ligger(Some((150.0, 2)));
    // Zonder normaalkracht: 6.2.3(1) staat z = 0,9 · 454 = 408,6 mm toe.
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &ShearOptions::default());
    let v = r.vakwerk.as_ref().unwrap();
    assert!(v.z_is_0_9d);
    dichtbij(v.z_mm, 408.6, 1e-9, "z");

    // MET normaalkracht en zonder opgegeven z: geen vakwerk, wél een reden.
    let r = shear_resistance(&s, &k, &m, &snap(-200.0, 250.0, 100.0), &ShearOptions::default());
    assert!(r.vakwerk.is_none());
    let reden = r.vakwerk_reden.as_ref().unwrap();
    assert!(reden.contains("6.2.3(1)"), "de reden moet het artikel noemen: {reden}");
    assert!(r.v_rd_kn.is_none());

    // Met een opgegeven z rekent hij wél door.
    let opts = ShearOptions {
        z_mm: Some(400.0),
        cot_theta: Some(2.5),
        ..ShearOptions::default()
    };
    let r = shear_resistance(&s, &k, &m, &snap(-200.0, 250.0, 100.0), &opts);
    let v = r.vakwerk.as_ref().unwrap();
    assert!(!v.z_is_0_9d);
    // V_Rd,s = 0,67020643 · 400 · 434,782609 · 2,5 = 291 394 N = 291,394 kN.
    dichtbij(v.v_rd_s_kn.unwrap(), 291.394, 2e-2, "V_Rd,s met opgegeven z");
}

#[test]
fn eigen_beugelkwaliteit_gaat_via_gamma_s() {
    // f_ywk = 600 N/mm² → f_ywd = 600/1,15 = 521,739130 N/mm².
    // V_Rd,s = 0,67020643 · 408,6 · 521,739130 · 2,5 = 357 191 N = 357,191 kN
    // (dat is precies 1,2 × de 297,659 kN van B500, want 600/500 = 1,2).
    let (s, mut k, m) = ligger(Some((150.0, 2)));
    k.stirrup_fywk_mpa = Some(600.0);
    let opts = ShearOptions { cot_theta: Some(2.5), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    let v = r.vakwerk.as_ref().unwrap();
    dichtbij(v.f_ywd_mpa.unwrap(), 521.739130, 1e-5, "f_ywd");
    dichtbij(v.v_rd_s_kn.unwrap(), 357.191, 2e-2, "V_Rd,s");
}

#[test]
fn delta_f_td_volgt_6_18_met_cot_alpha_nul() {
    // ΔF_td = 0,5 · V_Ed · (cot θ − cot α); α = 90° dus cot α = 0.
    // 0,5 · 250 · 2,5 = 312,5 kN.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions { cot_theta: Some(2.5), ..ShearOptions::default() };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    dichtbij(r.vakwerk.as_ref().unwrap().delta_f_td_kn, 312.5, 1e-9, "ΔF_td");
    assert!(r.notes.iter().any(|n| n.contains("(6.18)")));
    // De koppeling naar M_Ed,max wordt NIET getoetst en dat moet er staan.
    assert!(r.notes.iter().any(|n| n.contains("M_Ed,max")));
}

// ── β van 6.2.2(6) ───────────────────────────────────────────────────────────

#[test]
fn beta_volgt_6_2_2_6_met_de_voorgeschreven_ondergrens() {
    // d = 454 mm → 0,5·d = 227 mm, 2·d = 908 mm.
    //   a_v = 400 mm  → β = 400/908  = 0,440529
    //   a_v = 100 mm  → a_v = 227 mm (6.2.2(6)) → β = 227/908 = 0,25
    //   a_v = 1000 mm → buiten het bereik: geen reductie
    let (beta, a_v) = beta_6_2_2_6(400.0, 454.0).unwrap();
    dichtbij(beta, 0.440529, 1e-6, "β bij a_v = 400");
    dichtbij(a_v, 400.0, 1e-9, "gebruikte a_v");
    let (beta, a_v) = beta_6_2_2_6(100.0, 454.0).unwrap();
    dichtbij(beta, 0.25, 1e-12, "β bij a_v < 0,5·d");
    dichtbij(a_v, 227.0, 1e-9, "gebruikte a_v = 0,5·d");
    assert!(beta_6_2_2_6(1000.0, 454.0).is_err());
}

#[test]
fn beta_vermindert_alleen_de_bijdrage_van_die_last_en_alleen_voor_v_rd_c() {
    // V_Ed = 200 kN waarvan 150 kN door een last op a_v = 400 mm.
    //   β = 0,440529 → V_Ed voor de vergelijking met V_Rd,c
    //     = 200 − 150 + 0,440529 · 150 = 50 + 66,079 = 116,079 kN
    // (6.5): 0,5 · 300 · 454 · 0,528 · 20 = 719 136 N = 719,136 kN ≥ 200 kN.
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions {
        nabij_steunpunt: Some(LastNabijSteunpunt {
            a_v_mm: 400.0,
            bijdrage_kn: 150.0,
            langswapening_verankerd: true,
        }),
        ..ShearOptions::default()
    };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 200.0, 100.0), &opts);
    let b = r.beta.as_ref().unwrap();
    dichtbij(b.beta, 0.440529, 1e-6, "β");
    dichtbij(b.v_ed_verminderd_kn, 116.079, 1e-3, "verminderde V_Ed");
    dichtbij(b.grens_6_5_kn, 719.136, 1e-2, "(6.5)");
    assert!(b.voldoet_6_5);
    // De onverminderde V_Ed blijft 200 kN, en die geldt in het vakwerkspoor.
    dichtbij(r.v_ed_kn, 200.0, 1e-12, "onverminderde V_Ed");
    // 116,079 > V_Rd,c = 64,402 → nog steeds spoor B, met de ONVERMINDERDE
    // V_Ed in de unity check.
    assert_eq!(r.spoor, Spoor::Vakwerkmodel);
    dichtbij(r.toetsende_v_ed_kn(), 200.0, 1e-12, "toetsende V_Ed in spoor B");
}

#[test]
fn zonder_bevestigde_verankering_geen_beta_reductie() {
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions {
        nabij_steunpunt: Some(LastNabijSteunpunt {
            a_v_mm: 400.0,
            bijdrage_kn: 150.0,
            langswapening_verankerd: false,
        }),
        ..ShearOptions::default()
    };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 200.0, 100.0), &opts);
    assert!(r.beta.is_none());
    dichtbij(r.v_ed_voor_vrd_c_kn, 200.0, 1e-12, "onverminderde V_Ed");
    assert!(r.notes.iter().any(|n| n.contains("verankerd")));
}

// ── Het contract naar het rapport ────────────────────────────────────────────

#[test]
fn de_toets_levert_een_narekenbare_afleiding_en_geen_kaal_getal() {
    let (s, k, m) = ligger(Some((150.0, 2)));
    let opts = ShearOptions { cot_theta: Some(2.5), ..ShearOptions::default() };
    let calc = check_shear(&s, &k, &m, snap(0.0, 250.0, 100.0), &opts);
    assert_eq!(calc.id, "6.2_shear");
    assert_eq!(calc.status, CheckStatus::Ok);
    dichtbij(calc.value, 297.659, EPS * 10.0, "V_Rd");
    let ids: Vec<&str> = calc.deelstappen.iter().map(|d| d.id.as_str()).collect();
    for verwacht in [
        "dwarskracht_uitgangspunten",
        "dwarskracht_k",
        "dwarskracht_rho_l",
        "dwarskracht_sigma_cp",
        "dwarskracht_v_min",
        "dwarskracht_c_rd_c",
        "dwarskracht_v_rd_c",
        "dwarskracht_spoor",
        "dwarskracht_z",
        "dwarskracht_theta",
        "dwarskracht_v_rd_max",
        "dwarskracht_v_rd_s",
        "dwarskracht_v_rd",
        "dwarskracht_unity_check",
    ] {
        assert!(ids.contains(&verwacht), "deelstap {verwacht} ontbreekt: {ids:?}");
    }
    // Elke stap draagt zijn vindplaats; geen enkele mag leeg zijn.
    for d in &calc.deelstappen {
        assert!(!d.article.is_empty(), "deelstap {} zonder vindplaats", d.id);
    }
    // De afleiding rekent niets opnieuw uit: de stap V_Rd,c draagt exact het
    // getal dat de kern heeft bepaald.
    let stap = calc.deelstappen.iter().find(|d| d.id == "dwarskracht_v_rd_c").unwrap();
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 250.0, 100.0), &opts);
    dichtbij(stap.value.unwrap(), r.vrd_c.v_rd_c_kn, 1e-12, "V_Rd,c in de afleiding");
}

#[test]
fn zonder_beugelgegevens_zegt_de_toets_wat_er_ontbreekt() {
    // Spoor B zonder beugelafstand en zonder aantal benen: geen getal, wel een
    // leesbare reden. Er wordt niets aangenomen.
    let (s, k, m) = ligger(None);
    let calc = check_shear(&s, &k, &m, snap(0.0, 250.0, 100.0), &ShearOptions::default());
    assert_eq!(calc.status, CheckStatus::NotApplicable);
    assert!(calc.uc.is_none());
    assert!(calc
        .notes
        .iter()
        .any(|n| n.contains("hart-op-hartafstand") && n.contains("aantal beugelbenen")));
}

#[test]
fn negatief_moment_meet_d_tot_de_bovenwapening() {
    // M_Ed < 0: de bovenwapening staat op trek. Boven 2Ø12 → d = 500 − (30 + 8
    // + 6) = 456 mm en A_sl = 2 · π/4 · 12² = 226,194671 mm².
    let (s, mut k, m) = ligger(None);
    k.top = RebarRow { count: 2, diameter_mm: 12.0 };
    let r = shear_resistance(&s, &k, &m, &snap(0.0, 40.0, -100.0), &ShearOptions::default());
    assert!(!r.trek_onder);
    dichtbij(r.vrd_c.d_mm, 456.0, 1e-9, "d tot de bovenwapening");
    dichtbij(r.vrd_c.a_sl_mm2, 226.194671, 1e-5, "A_sl");
}

// ── Acceptatieproef tegen een externe referentie-berekening ──────────────────

#[test]
fn acceptatieproef_plaatstrook_tegen_externe_referentie() {
    // Plaatstrook 1000 mm breed, C20/25, B500B, Ø10-150 boven en onder,
    // milieuklasse XC1, constructieklasse S4, dekking onder 25 mm.
    // De externe referentie geeft:
    //   x = 0    : h = 280 mm, V_Ed = 29,8 kN, V_Rd,c = 96,4 kN,
    //              V_Rd,s = 0, V_Rd,max = 390 kN
    //   x = 5000 : h = 140 mm, V_Ed = 26,5 kN, V_Rd,c = 53,9 kN
    //
    // Deze module rekent met d = h − c − Ø/2 (25 + 5 = 30 mm dekkingslaag) en
    // A_sl = 523,5988 mm²/m:
    //   h = 280 → d = 250 → (6.2.a) = 91,614 kN, (6.2.b) = 102,033 kN
    //             → V_Rd,c = 102,033 kN   (referentie 96,4 kN, +5,8 %)
    //   h = 140 → d = 110 → (6.2.a) =  55,952 kN, (6.2.b) =  48,699 kN
    //             → V_Rd,c =  55,952 kN   (referentie 53,9 kN, +3,8 %)
    //
    // Het verschil zit in de INVOER, niet in de coëfficiënten. Terugrekenen
    // van de referentiewaarden geeft d ≈ 229 mm bij h = 280 (de (6.2.b)-tak)
    // en d ≈ 104 mm bij h = 140 (de (6.2.a)-tak) — twee verschillende
    // asafstanden (51 en 36 mm) die niet uit één dekkingsmodel volgen. De
    // referentie hanteert daar dus een andere nuttige hoogte, en mogelijk een
    // andere A_sl. Er is niets aan C_Rd,c, v_min of k₁ gesleuteld om de
    // getallen te laten kloppen; die zijn alle drie letterlijk uit de NB.
    let mat = materiaal("C20/25");
    let korf = ReinforcementCage {
        cover_mm: 25.0,
        stirrup_diameter_mm: 0.0,
        top: RebarRow { count: 7, diameter_mm: 10.0 },
        bottom: RebarRow { count: 7, diameter_mm: 10.0 },
        ..ReinforcementCage::default()
    };
    let opts = ShearOptions { a_sl_mm2: Some(523.5987756), ..ShearOptions::default() };

    // x = 0.
    let dik = ConcreteSection::new(1000.0, 280.0);
    let r0 = shear_resistance(&dik, &korf, &mat, &snap(0.0, 29.8, 100.0), &opts);
    dichtbij(r0.vrd_c.v_rd_c_kn, 102.033, 2e-2, "V_Rd,c bij x = 0");
    assert_eq!(r0.spoor, Spoor::GeenBerekendeWapening);
    // De referentie ligt 5,8 % lager; binnen 10 % maar niet gelijk.
    let afwijking = (r0.vrd_c.v_rd_c_kn - 96.4) / 96.4;
    assert!(afwijking > 0.0 && afwijking < 0.10, "afwijking bij x = 0: {afwijking:.3}");
    // V_Rd,s = 0 in de referentie betekent: geen dwarskrachtwapening. Deze
    // module levert dan geen getal maar een reden, en dat is de bedoeling.
    assert!(r0.vakwerk.as_ref().unwrap().v_rd_s_kn.is_none());
    // V_Rd,max bij cot θ = 1 (de waarde waarbij (6.9) maximaal is):
    //   1 · 1000 · 225 · 0,552 · 13,3333/2 = 828 000 N = 828,0 kN.
    // De referentie noemt 390 kN en zegt niet welke θ en welke z daarbij
    // horen; met z = 0,9·d = 225 mm is 390 kN binnen 1,0 ≤ cot θ ≤ 2,5 niet te
    // bereiken (cot θ = 2,5 geeft 571,0 kN). Dat verschil is dus niet verklaard.
    dichtbij(r0.vakwerk.as_ref().unwrap().v_rd_max_kn, 828.0, 1e-2, "V_Rd,max bij x = 0");

    // x = 5000, waar de plaat 140 mm dik is.
    let dun = ConcreteSection::new(1000.0, 140.0);
    let r5 = shear_resistance(&dun, &korf, &mat, &snap(0.0, 26.5, 100.0), &opts);
    dichtbij(r5.vrd_c.d_mm, 110.0, 1e-9, "d bij x = 5000");
    dichtbij(r5.vrd_c.v_6_2a_kn, 55.952, 2e-2, "(6.2.a) bij x = 5000");
    dichtbij(r5.vrd_c.v_6_2b_kn, 48.699, 2e-2, "(6.2.b) bij x = 5000");
    dichtbij(r5.vrd_c.v_rd_c_kn, 55.952, 2e-2, "V_Rd,c bij x = 5000");
    assert_eq!(r5.vrd_c.tak, VrdCTak::Formule62a);
    assert!(r5.vrd_c.k_begrensd, "k moet bij d = 110 mm op 2,0 zijn afgekapt");
    let afwijking = (r5.vrd_c.v_rd_c_kn - 53.9) / 53.9;
    assert!(afwijking > 0.0 && afwijking < 0.10, "afwijking bij x = 5000: {afwijking:.3}");

    // Beide stations vallen ruim in spoor A: V_Ed ≪ V_Rd,c.
    assert_eq!(r5.spoor, Spoor::GeenBerekendeWapening);
    assert!(r0.uc.unwrap() < 0.4 && r5.uc.unwrap() < 0.6);
}
