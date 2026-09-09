//! §8.4 van buitenaf gebruikt, zoals de dekkingslijn en de rapportbouwer hem
//! straks gaan gebruiken.
//!
//! Waar de tests in de module zelf de losse formules narekenen, doen deze drie
//! dingen die daar niet passen:
//!
//! 1. **Hele staven doorrekenen** met de materiaalgegevens uit de crate zelf
//!    ([`concrete_class_by_name`], [`reinforcement_grade_by_name`], tabel 2.1N)
//!    in plaats van met losse getallen. Zo valt het op als iemand ooit aan
//!    tabel 3.1 of aan γ_S komt.
//! 2. **De NB-uitspraken vastpinnen.** Twee uitspraken uit de moduledoc zijn
//!    hier een test: dat §8.4 GEEN nationaal bepaalde parameter kent (α_ct en
//!    γ_C komen van elders en zijn 1,0 respectievelijk 1,5), en dat tabel NB 8.3
//!    voor DRUKoverlappingen α₆ = 1 voorschrijft waar de EN-tabel bij 50 %
//!    ongeveer 1,4 geeft.
//! 3. **De afleiding als rapportinhoud bekijken:** zes deelstappen, elk met een
//!    artikel, een symbolische formule, een ingevulde regel en kanttekeningen.
//!
//! Alle getallen hieronder zijn MET DE HAND uitgerekend; het rekenwerk staat in
//! het commentaar bij elke test. Geen enkele verwachting is uit de code
//! afgeleid.

use approx::assert_relative_eq;
use nen_en_1992_1_1::verankering::{
    aanhechting_figuur_8_2, alpha_1, alpha_2, alpha_3, alpha_5, alpha_6, as_steunpunt_vereist_mm2,
    c_d_mm, f_ed_eindoplegging_kn, lambda_8_2, min_verankering_opgebogen_staaf_mm,
    min_verankering_tussensteunpunt_mm, opneembare_krachtfractie, overlappingslengte, verschuiving,
    verankering_deelstappen, verankeringslengte, Aanhechting, Dekkingsgeval, Elementtype, KWaarde,
    OndergrensTerm, Staafvorm, Stortpositie, Tussensteunpuntvorm, VerankeringInvoer,
    Verankeringssoort, Verschuivingsgrondslag, BETA_2,
};
use nen_en_1992_1_1::factors::{f_yd, gamma_s};
use nen_en_1992_1_1::{concrete_class_by_name, reinforcement_grade_by_name, DesignSituation};

/// γ_S = 1,15 (tabel 2.1N, blijvend en tijdelijk) → f_yd = 500/1,15 = 434,7826.
fn f_yd_b500() -> f64 {
    let staal = reinforcement_grade_by_name("B500B").unwrap();
    let gamma_s = gamma_s(DesignSituation::PersistentTransient);
    assert_relative_eq!(gamma_s, 1.15, max_relative = 1e-12);
    f_yd(staal.f_yk, gamma_s)
}

/// f_ctk;0,05 van een klasse uit tabel 3.1.
fn f_ctk(klasse: &str) -> f64 {
    concrete_class_by_name(klasse).unwrap().f_ctk_005
}

/// De referentiebalk: 300 × 600 mm, d = 550 mm, C30/37, B500B, beugels Ø8
/// tweebenig, onderwapening 4Ø20 en één laag met dekking zodanig dat
/// c_d = 40 mm.
fn onderstaaf(diameter_mm: f64) -> VerankeringInvoer {
    VerankeringInvoer {
        diameter_mm,
        f_ctk_005_mpa: f_ctk("C30/37"),
        alpha_ct: 1.0,
        gamma_c: 1.5,
        f_yd_mpa: f_yd_b500(),
        h_mm: 600.0,
        c_d_mm: 40.0,
        ..VerankeringInvoer::default()
    }
}

// ---------------------------------------------------------------------------
// De keten van (8.2) tot en met (8.4), met de hand
// ---------------------------------------------------------------------------

/// Ø16 onderwapening in C30/37 met B500B, beugels Ø8 tweebenig, K = 0,05.
///
/// Handrekening:
/// ```text
///   f_ctd   = 1,0 · 2,0 / 1,5            = 1,33333 N/mm²
///   f_bd    = 2,25 · 1,0 · 1,0 · 1,33333 = 3,0     N/mm²
///   σ_sd    = f_yd = 500/1,15            = 434,7826 N/mm²
///   l_b,rqd = (16/4)·(434,7826/3,0) = 2000/3,45 = 579,71014 mm
///   A_s     = π/4·16²  = 201,0619 mm²
///   ΣA_st   = 2·π/4·8² = 100,5310 mm²    (twee beugelbenen Ø8)
///   A_st,min= 0,25·201,0619 = 50,2655 mm²   (balk)
///   λ       = (100,5310 − 50,2655)/201,0619 = 0,25
///   α₁ = 1,0                             (rechte staaf)
///   α₂ = 1 − 0,15·(40 − 16)/16 = 0,775
///   α₃ = 1 − 0,05·0,25         = 0,9875
///   α₄ = 1,0   α₅ = 1,0
///   (α₂α₃α₅) = 0,7653125 ≥ 0,7           → (8.5) grijpt niet in
///   l_bd    = 0,7653125·2000/3,45 = 1530,625/3,45 = 443,65942 mm
///   l_b,min = max{0,3·579,71014; 10·16; 100} = max{173,913; 160; 100}
///           = 173,913 mm                 → niet maatgevend
/// ```
#[test]
fn onderwapening_o16_c30_37_volledig_nagerekend() {
    let a_s = std::f64::consts::PI / 4.0 * 16.0 * 16.0;
    let sum_a_st = 2.0 * (std::f64::consts::PI / 4.0 * 8.0 * 8.0);
    let lambda = lambda_8_2(sum_a_st, a_s, Elementtype::Balk);
    assert_relative_eq!(lambda, 0.25, max_relative = 1e-12);

    let v = verankeringslengte(&VerankeringInvoer {
        k_waarde: KWaarde::DwarsstaafBuiten,
        lambda,
        ..onderstaaf(16.0)
    })
    .unwrap();

    assert_eq!(v.aanhechting, Aanhechting::Goed);
    assert_relative_eq!(v.f_ctd_mpa, 2.0 / 1.5, max_relative = 1e-12);
    assert_relative_eq!(v.f_bd_mpa, 3.0, max_relative = 1e-12);
    assert_relative_eq!(v.sigma_sd_mpa, 500.0 / 1.15, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_rqd_mm, 2000.0 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.alpha_2, 0.775, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.alpha_3, 0.9875, max_relative = 1e-12);
    assert!(!v.alfa.begrensd_door_8_5);
    assert_relative_eq!(v.l_bd_mm, 1530.625 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_mm, 443.6594203, max_relative = 1e-8);
    assert_relative_eq!(v.l_b_min_mm, 0.3 * 2000.0 / 3.45, max_relative = 1e-12);
    assert!(!v.ondergrens_maatgevend);
}

/// Dezelfde staaf, maar als BOVENwapening in dezelfde balk van 600 mm.
///
/// Figuur 8.2c: boven de onderste 250 mm zijn de omstandigheden 'slecht', dus
/// η₁ = 0,7 en f_bd = 2,25·0,7·1,33333 = 2,1 N/mm².
///
/// ```text
///   l_b,rqd = (16/4)·(434,7826/2,1) = 2000/2,415 = 828,15735 mm
///   l_bd    = 0,7653125·2000/2,415 = 1530,625/2,415 = 633,79917 mm
///   verhouding tot de onderstaaf: 1/0,7 = 1,42857
/// ```
///
/// Dat verschil van 190 mm op één en dezelfde staaf is precies waarom de
/// stortpositie per staaf wordt opgegeven en niet per balk.
#[test]
fn bovenwapening_is_een_factor_1_over_0_7_langer() {
    let onder = verankeringslengte(&VerankeringInvoer {
        k_waarde: KWaarde::DwarsstaafBuiten,
        lambda: 0.25,
        ..onderstaaf(16.0)
    })
    .unwrap();
    let boven = verankeringslengte(&VerankeringInvoer {
        k_waarde: KWaarde::DwarsstaafBuiten,
        lambda: 0.25,
        stortpositie: Stortpositie::Bovenzijde,
        ..onderstaaf(16.0)
    })
    .unwrap();

    assert_eq!(boven.aanhechting, Aanhechting::Overig);
    assert_relative_eq!(boven.f_bd_mpa, 2.1, max_relative = 1e-12);
    assert_relative_eq!(boven.l_b_rqd_mm, 2000.0 / 2.415, max_relative = 1e-12);
    assert_relative_eq!(boven.l_bd_mm, 1530.625 / 2.415, max_relative = 1e-12);
    assert_relative_eq!(boven.l_bd_mm, 633.7991718, max_relative = 1e-8);
    assert_relative_eq!(boven.l_bd_mm / onder.l_bd_mm, 1.0 / 0.7, max_relative = 1e-12);
}

/// De sprong in figuur 8.2 tussen geval c en geval d is echt.
///
/// Een staaf 301 mm boven de onderrand ligt in een balk van 600 mm buiten de
/// 'goede' zone van 8.2c (die reikt tot 250 mm), en in een balk van 601 mm er
/// precies binnen volgens 8.2d (de bovenste 300 mm is 'slecht', en 601 − 301 =
/// 300 ≥ 300).
#[test]
fn de_sprong_bij_600_mm_uit_figuur_8_2_is_niet_gladgestreken() {
    assert_eq!(aanhechting_figuur_8_2(600.0, 301.0), Aanhechting::Overig);
    assert_eq!(aanhechting_figuur_8_2(601.0, 301.0), Aanhechting::Goed);
}

/// Ø40 in C30/37: η₂ = (132 − 40)/100 = 0,92.
///
/// ```text
///   f_bd    = 2,25·1,0·0,92·1,33333 = 2,76 N/mm²
///   l_b,rqd = (40/4)·(434,7826/2,76) = 5000/3,174 = 1575,29931 mm
///   α₂      = 1 − 0,15·(40 − 40)/40 = 1,0, de overige α ook 1,0
///   l_bd    = 1575,29931 mm
///   l_b,min = max{0,3·1575,29931; 400; 100} = 472,58979 mm → niet maatgevend
/// ```
///
/// Ter vergelijking: dezelfde staaf op Ø16 vraagt 443,66 mm. Een Ø40 vraagt dus
/// 3,55 keer zoveel, en dat is meer dan de factor 40/16 = 2,5 die je bij een
/// lineair verband zou verwachten — l_b,rqd loopt met Φ mee én η₂ verlaagt f_bd.
#[test]
fn staaf_dikker_dan_32_mm_verlaagt_f_bd_via_eta_2() {
    let v = verankeringslengte(&onderstaaf(40.0)).unwrap();
    assert_relative_eq!(v.eta_2, 0.92, max_relative = 1e-12);
    assert_relative_eq!(v.f_bd_mpa, 2.76, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_rqd_mm, 5000.0 / 3.174, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_mm, 1575.2993069, max_relative = 1e-8);
    assert_relative_eq!(v.l_b_min_mm, 0.3 * 5000.0 / 3.174, max_relative = 1e-12);
    assert!(!v.ondergrens_maatgevend);

    // Bij Φ = 32 mm grijpt η₂ nog net niet in: (132 − 32)/100 = 1,00.
    let v32 = verankeringslengte(&VerankeringInvoer {
        c_d_mm: 32.0,
        ..onderstaaf(32.0)
    })
    .unwrap();
    assert_relative_eq!(v32.eta_2, 1.0, max_relative = 1e-12);
    assert_relative_eq!(v32.f_bd_mpa, 3.0, max_relative = 1e-12);
}

/// De ondergrens van 100 mm uit (8.6), met een Ø8 in C50/60.
///
/// ```text
///   f_ctk;0,05 (C50/60) = 2,9 N/mm²  →  f_ctd = 2,9/1,5 = 1,93333 N/mm²
///   f_bd    = 2,25·1,93333 = 4,35 N/mm²
///   l_b,rqd = (8/4)·(434,7826/4,35) = 1000/5,0025 = 199,90005 mm
///   α₂      = 1 − 0,15·(30 − 8)/8 = 0,5875 → begrensd op 0,7
///   α₄      = 0,7   (gelaste dwarsstaaf Ø8 > 0,6·8 = 4,8 mm)
///   product = 1,0·0,7·1,0·0,7·1,0 = 0,49
///   (α₂α₃α₅)= 0,7 → precies op de grens van (8.5), geen ingreep
///   l_bd,ber= 0,49·199,90005 = 97,95102 mm
///   l_b,min = max{0,3·199,90005; 10·8; 100} = max{59,970; 80; 100} = 100 mm
///   l_bd    = 100 mm — de ONDERGRENS is maatgevend
/// ```
#[test]
fn ondergrens_100_mm_tilt_een_o8_in_een_net_op() {
    let v = verankeringslengte(&VerankeringInvoer {
        diameter_mm: 8.0,
        f_ctk_005_mpa: f_ctk("C50/60"),
        c_d_mm: 30.0,
        phi_t_mm: Some(8.0),
        h_mm: 200.0,
        ..onderstaaf(8.0)
    })
    .unwrap();

    assert_relative_eq!(v.f_bd_mpa, 4.35, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_rqd_mm, 1000.0 / 5.0025, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.alpha_2, 0.7, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.alpha_4, 0.7, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.product_235_berekend, 0.7, max_relative = 1e-12);
    assert!(!v.alfa.begrensd_door_8_5);
    assert_relative_eq!(v.alfa.product, 0.49, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_berekend_mm, 97.9510245, max_relative = 1e-7);
    assert!(v.ondergrens_maatgevend);
    assert_eq!(v.l_b_min_term, OndergrensTerm::HonderdMillimeter);
    assert_relative_eq!(v.l_bd_mm, 100.0, max_relative = 1e-12);
}

/// De tweede ondergrens, 10Φ, met dezelfde Ø8 maar zonder de gelaste
/// dwarsstaaf en met een dikkere staaf zodat 10Φ boven de 100 mm uitkomt.
///
/// Ø12 in C50/60, α₂ = 1 − 0,15·(40 − 12)/12 = 0,65 → 0,7, α₄ = 0,7:
/// ```text
///   l_b,rqd = (12/4)·(434,7826/4,35) = 1500/5,0025 = 299,85007 mm
///   product = 0,7·0,7 = 0,49  →  l_bd,ber = 146,92654 mm
///   l_b,min = max{0,3·299,85007; 120; 100} = max{89,955; 120; 100} = 120 mm
///   l_bd    = 146,92654 mm  →  de ondergrens is hier NIET maatgevend
/// ```
/// en met α₄ = 0,7 én α₁ = 0,7 (ombuiging met c_d = 40 > 3Φ = 36):
/// ```text
///   α₂ (anders dan recht) = 1 − 0,15·(40 − 36)/12 = 0,95
///   product = 0,7·0,95·1·0,7·1 = 0,4655 → l_bd,ber = 139,58121 mm
/// ```
/// Nog altijd boven 120 mm. Om 10Φ maatgevend te krijgen is een groter f_bd
/// nodig: C90/105 wordt op de C60/75-waarde begrensd, dus f_bd = 4,65 N/mm².
/// ```text
///   l_b,rqd = (12/4)·(434,7826/4,65) = 1500/5,3475 = 280,50491 mm
///   product = 0,4655  →  l_bd,ber = 130,57504 mm  > 120 mm
/// ```
/// Ook dat is niet genoeg — met de minimale α-factoren van 0,343 wél:
/// ```text
///   α₁ = 0,7, (α₂α₃α₅) = 0,7 (door 8.5), α₄ = 0,7 → product = 0,343
///   l_bd,ber = 0,343·280,50491 = 96,21318 mm
///   l_b,min  = max{0,3·280,50491; 120; 100} = max{84,151; 120; 100} = 120 mm
///   l_bd     = 120 mm — 10Φ is maatgevend
/// ```
#[test]
fn ondergrens_10_diameters_kan_maatgevend_worden() {
    let v = verankeringslengte(&VerankeringInvoer {
        diameter_mm: 12.0,
        f_ctk_005_mpa: f_ctk("C90/105"), // 3,5 → begrensd op 3,1
        soort: Verankeringssoort::Trek,
        vorm: Staafvorm::AndersDanRecht,
        c_d_mm: 100.0,              // > 3Φ = 36 → α₁ = 0,7; α₂ = 0,2 → 0,7
        k_waarde: KWaarde::InDeHoek, // K = 0,1
        lambda: 3.0,                // α₃ = 0,7
        p_mpa: 7.5,                 // α₅ = 1 − 0,3 = 0,7
        phi_t_mm: Some(12.0),       // α₄ = 0,7
        ..onderstaaf(12.0)
    })
    .unwrap();

    assert!(v.begrensd_op_c60_75);
    assert_relative_eq!(v.f_bd_mpa, 4.65, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_rqd_mm, 1500.0 / 5.3475, max_relative = 1e-12);
    // (α₂α₃α₅) = 0,7·0,7·0,7 = 0,343 → door (8.5) opgetrokken naar 0,7.
    assert_relative_eq!(v.alfa.product_235_berekend, 0.343, max_relative = 1e-12);
    assert!(v.alfa.begrensd_door_8_5);
    assert_relative_eq!(v.alfa.product, 0.7 * 0.7 * 0.7, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_berekend_mm, 0.343 * 1500.0 / 5.3475, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_berekend_mm, 96.2131836, max_relative = 1e-7);
    assert!(v.ondergrens_maatgevend);
    assert_eq!(v.l_b_min_term, OndergrensTerm::TienDiameters);
    assert_relative_eq!(v.l_bd_mm, 120.0, max_relative = 1e-12);
}

/// De eerste term van (8.6)/(8.7) kan nooit maatgevend worden.
///
/// AFGELEID, niet uit de norm overgenomen: het α-product is voor trek ten
/// minste 0,7³ = 0,343 (α₁ ≥ 0,7, (α₂α₃α₅) ≥ 0,7 door (8.5), α₄ ≥ 0,7) en dat
/// is groter dan de 0,3 van (8.6); voor druk ten minste 0,7 en dat is groter
/// dan de 0,6 van (8.7). Deze test loopt over alle uitersten heen en pint dat
/// vast — als de norm ooit zou wijzigen, valt hij om en niet stilzwijgend.
#[test]
fn de_fractie_van_l_b_rqd_wordt_nooit_maatgevend() {
    for soort in [Verankeringssoort::Trek, Verankeringssoort::Druk] {
        for vorm in [Staafvorm::Recht, Staafvorm::AndersDanRecht] {
            for c_d in [10.0_f64, 40.0, 200.0] {
                for lambda in [0.0_f64, 3.0, 10.0] {
                    for phi_t in [None, Some(20.0)] {
                        for p in [0.0_f64, 20.0] {
                            let v = verankeringslengte(&VerankeringInvoer {
                                diameter_mm: 20.0,
                                soort,
                                vorm,
                                c_d_mm: c_d,
                                k_waarde: KWaarde::InDeHoek,
                                lambda,
                                phi_t_mm: phi_t,
                                p_mpa: p,
                                ..onderstaaf(20.0)
                            })
                            .unwrap();
                            let fractie = match soort {
                                Verankeringssoort::Trek => 0.3,
                                Verankeringssoort::Druk => 0.6,
                            };
                            assert!(
                                v.l_bd_berekend_mm >= fractie * v.l_b_rqd_mm - 1e-9,
                                "α-product {} maakt de fractie-tak toch maatgevend",
                                v.alfa.product
                            );
                        }
                    }
                }
            }
        }
    }
}

/// Drukverankering: tabel 8.2 zet α₁, α₂, α₃ op 1,0 en α₅ op een streepje, en
/// (8.7) gebruikt 0,6 in plaats van 0,3.
///
/// Ø25 in C30/37, ombuiging, c_d = 100 mm:
/// ```text
///   art. 8.4.1(3): ombuigingen en haken dragen niet bij aan de verankering
///   van drukstaven → α₁ = 1,0 ondanks c_d = 100 > 3Φ = 75 mm
///   l_b,rqd = (25/4)·(434,7826/3,0) = 3125/3,45 = 905,79710 mm
///   l_bd    = 1,0·905,79710 = 905,79710 mm
///   l_b,min = max{0,6·905,79710; 250; 100} = 543,47826 mm → niet maatgevend
/// ```
#[test]
fn drukverankering_negeert_de_ombuiging_en_gebruikt_0_6() {
    let v = verankeringslengte(&VerankeringInvoer {
        diameter_mm: 25.0,
        soort: Verankeringssoort::Druk,
        vorm: Staafvorm::AndersDanRecht,
        c_d_mm: 100.0,
        k_waarde: KWaarde::InDeHoek,
        lambda: 5.0,
        p_mpa: 10.0,
        ..onderstaaf(25.0)
    })
    .unwrap();

    assert_relative_eq!(v.alfa.alpha_1, 1.0, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.alpha_2, 1.0, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.alpha_3, 1.0, max_relative = 1e-12);
    assert_relative_eq!(v.alfa.alpha_5, 1.0, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_rqd_mm, 3125.0 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_mm, 3125.0 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_min_mm, 0.6 * 3125.0 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_min_mm, 543.4782609, max_relative = 1e-8);
    assert_eq!(v.l_b_min_term, OndergrensTerm::FractieVanLbRqd);
}

// ---------------------------------------------------------------------------
// De nationale bijlage
// ---------------------------------------------------------------------------

/// §8.4 kent geen nationaal bepaalde parameter, en de NB wijkt er niet van af.
///
/// Wat er wél doorheen loopt komt van elders: α_ct = 1,0 uit de NB bij
/// 3.1.6(2)P en γ_C = 1,5 uit tabel 2.1N. Deze test rekent f_ctd met beide uit
/// en controleert dat f_bd = 2,25·f_ctd volgt — de enige plaats waar §8.4 een
/// getal uit de NB gebruikt.
#[test]
fn paragraaf_8_4_heeft_geen_nationaal_bepaalde_parameter() {
    let v = verankeringslengte(&onderstaaf(16.0)).unwrap();
    assert_relative_eq!(v.alpha_ct, 1.0, max_relative = 1e-12);
    assert_relative_eq!(v.gamma_c, 1.5, max_relative = 1e-12);
    assert_relative_eq!(v.f_ctd_mpa, 1.0 * 2.0 / 1.5, max_relative = 1e-12);
    assert_relative_eq!(v.f_bd_mpa, 2.25 * v.f_ctd_mpa, max_relative = 1e-12);
    // De vaste factor van (8.2) is 2,25 en niets anders.
    assert_relative_eq!(v.f_bd_mpa / v.f_ctd_mpa, 2.25, max_relative = 1e-12);
}

/// Tabel NB 8.3 — hier wijkt de Nederlandse bijlage WEL af.
///
/// De EN-tabel 8.3 kent alleen een trekregel en is in de Nederlandse uitgave
/// doorgehaald; tabel NB 8.3 voegt een drukregel toe met α₆ = 1 bij elk
/// percentage. Bij 50 % overlapping scheelt dat een factor 1,41: wie de
/// EN-tabel gebruikt, rekent een drukoverlapping 41 % te lang.
///
/// Ø16 in C30/37, l_b,rqd = 579,71014 mm, alle α = 1,0:
/// ```text
///   trek, 50 %: α₆ = √(50/25) = 1,41421 → l₀ = 819,83395 mm
///   druk, 50 %: α₆ = 1,0 (NB)           → l₀ = 579,71 mm
///   l₀,min (druk) = max{0,3·1,0·579,71; 15·16; 200} = max{173,91; 240; 200}
///                 = 240 mm → niet maatgevend
/// ```
#[test]
fn tabel_nb_8_3_geeft_drukoverlappingen_alfa_6_gelijk_1() {
    let l_b_rqd = 2000.0 / 3.45;

    let trek = overlappingslengte(
        l_b_rqd,
        16.0,
        Verankeringssoort::Trek,
        1.0,
        1.0,
        1.0,
        1.0,
        50.0,
    );
    assert_relative_eq!(trek.alpha_6, 2.0_f64.sqrt(), max_relative = 1e-12);
    assert_relative_eq!(
        trek.l_0_mm,
        2.0_f64.sqrt() * 2000.0 / 3.45,
        max_relative = 1e-12
    );
    assert_relative_eq!(trek.l_0_mm, 819.8339492, max_relative = 1e-8);

    let druk = overlappingslengte(
        l_b_rqd,
        16.0,
        Verankeringssoort::Druk,
        1.0,
        1.0,
        1.0,
        1.0,
        50.0,
    );
    assert_relative_eq!(druk.alpha_6, 1.0, max_relative = 1e-12);
    assert_relative_eq!(druk.l_0_mm, 2000.0 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(druk.l_0_min_mm, 240.0, max_relative = 1e-12);
    assert_eq!(druk.l_0_min_term, OndergrensTerm::TienDiameters);

    // De EN-tabel zou hier 1,4 hebben gegeven; de NB maakt het 1,0.
    assert_relative_eq!(trek.l_0_mm / druk.l_0_mm, 2.0_f64.sqrt(), max_relative = 1e-12);
}

/// β₂ = 0,25 — de NB bij §9.2.1.4(1) schrijft dezelfde waarde voor als de
/// EN-aanbeveling. Ook dat is een uitspraak die is nagekeken.
#[test]
fn beta_2_is_0_25_en_de_nb_wijkt_niet_af() {
    assert_relative_eq!(BETA_2, 0.25, max_relative = 1e-12);
    // 4Ø20 in het veld = 4·π/4·20² = 1256,637 mm²; daarvan moet 0,25 · dat
    // = 314,159 mm² doorlopen — precies één Ø20.
    let as_veld = 4.0 * std::f64::consts::PI / 4.0 * 20.0 * 20.0;
    let vereist = as_steunpunt_vereist_mm2(as_veld);
    let een_staaf = std::f64::consts::PI / 4.0 * 20.0 * 20.0;
    assert_relative_eq!(vereist, een_staaf, max_relative = 1e-12);
    assert_relative_eq!(vereist, 314.1592654, max_relative = 1e-8);
}

// ---------------------------------------------------------------------------
// De regels waar de dekkingslijn op draait
// ---------------------------------------------------------------------------

/// De verschuivingsregel en het lineaire krachtverloop, samen in één balk.
///
/// Balk 300 × 600, d = 550 mm, z = 0,9·d = 495 mm, beugels recht (cot α = 0),
/// cot θ = 2,5:
/// ```text
///   a_l = z·(cot θ − cot α)/2 = 495·2,5/2 = 618,75 mm        (9.2)
///   zonder dwarskrachtwapening: a_l = d = 550 mm             6.2.2(5)
/// ```
/// Voor een Ø20 onderstaaf in C30/37 met c_d = 40 mm:
/// ```text
///   α₂ = 1 − 0,15·(40 − 20)/20 = 0,85, overige α = 1,0
///   l_b,rqd = (20/4)·(434,7826/3,0) = 2500/3,45 = 724,63768 mm
///   l_bd    = 0,85·2500/3,45 = 2125/3,45 = 615,94203 mm
/// ```
/// De schuine tak van figuur 9.2 loopt dus over 615,94 mm; halverwege is de
/// helft van de staafkracht opneembaar.
#[test]
fn verschuivingsregel_en_lineair_krachtverloop_samen() {
    let met = verschuiving(Verschuivingsgrondslag::MetDwarskrachtwapening {
        z_mm: 495.0,
        cot_theta: 2.5,
        cot_alpha: 0.0,
    });
    assert_relative_eq!(met.a_l_mm, 618.75, max_relative = 1e-12);

    let zonder = verschuiving(Verschuivingsgrondslag::ZonderDwarskrachtwapening { d_mm: 550.0 });
    assert_relative_eq!(zonder.a_l_mm, 550.0, max_relative = 1e-12);

    let v = verankeringslengte(&onderstaaf(20.0)).unwrap();
    assert_relative_eq!(v.alfa.alpha_2, 0.85, max_relative = 1e-12);
    assert_relative_eq!(v.l_b_rqd_mm, 2500.0 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_mm, 2125.0 / 3.45, max_relative = 1e-12);
    assert_relative_eq!(v.l_bd_mm, 615.9420290, max_relative = 1e-8);

    // De schuine tak: op het staafeinde nul, op l_bd volledig, lineair ertussen.
    assert_relative_eq!(opneembare_krachtfractie(0.0, v.l_bd_mm), 0.0);
    assert_relative_eq!(
        opneembare_krachtfractie(v.l_bd_mm / 2.0, v.l_bd_mm),
        0.5,
        max_relative = 1e-12
    );
    assert_relative_eq!(opneembare_krachtfractie(v.l_bd_mm, v.l_bd_mm), 1.0);
    // Verder dan l_bd levert niets extra's op.
    assert_relative_eq!(opneembare_krachtfractie(2.0 * v.l_bd_mm, v.l_bd_mm), 1.0);
}

/// (9.3) bij een eindoplegging, en de controle dat hij samenvalt met ΔF_td.
///
/// ```text
///   F_Ed = |V_Ed|·a_l/z + N_Ed = 120·618,75/495 + 0 = 150 kN     (9.3)
///   ΔF_td = 0,5·V_Ed·(cot θ − cot α) = 0,5·120·2,5 = 150 kN      (6.18)
/// ```
/// Met een normaaldrukkracht van 40 kN (trek positief, dus −40) wordt het
/// 150 − 40 = 110 kN.
#[test]
fn f_ed_bij_een_eindoplegging_volgens_9_3() {
    let a_l = 618.75;
    let z = 495.0;
    assert_relative_eq!(f_ed_eindoplegging_kn(120.0, a_l, z, 0.0), 150.0, max_relative = 1e-12);
    assert_relative_eq!(
        f_ed_eindoplegging_kn(120.0, a_l, z, 0.0),
        0.5 * 120.0 * 2.5,
        max_relative = 1e-12
    );
    assert_relative_eq!(f_ed_eindoplegging_kn(120.0, a_l, z, -40.0), 110.0, max_relative = 1e-12);
    // Het teken van V_Ed doet niet ter zake: (9.3) neemt de absolute waarde.
    assert_relative_eq!(
        f_ed_eindoplegging_kn(-120.0, a_l, z, 0.0),
        150.0,
        max_relative = 1e-12
    );
}

/// §9.2.1.5(2), de drie takken bij een tussensteunpunt, en §9.2.1.3(4) voor de
/// opgebogen staaf.
///
/// ```text
///   rechte Ø20                       : ≥ 10·20 = 200 mm
///   haak Ø20 met doorndiameter 140 mm: ≥ 140 mm
///   overige gevallen                 : ≥ 2·140 = 280 mm
///   opgebogen staaf in de trekzone   : ≥ 1,3·l_bd = 1,3·615,942 = 800,725 mm
///   opgebogen staaf in de drukzone   : ≥ 0,7·l_bd = 0,7·615,942 = 431,159 mm
/// ```
#[test]
fn minimumverankeringen_bij_steunpunt_en_opgebogen_staaf() {
    assert_relative_eq!(
        min_verankering_tussensteunpunt_mm(Tussensteunpuntvorm::RechteStaaf, 20.0, 140.0),
        200.0,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        min_verankering_tussensteunpunt_mm(
            Tussensteunpuntvorm::HaakOfOmbuigingVanaf16mm,
            20.0,
            140.0
        ),
        140.0,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        min_verankering_tussensteunpunt_mm(Tussensteunpuntvorm::Overig, 12.0, 140.0),
        280.0,
        max_relative = 1e-12
    );

    let l_bd = 2125.0 / 3.45;
    assert_relative_eq!(
        min_verankering_opgebogen_staaf_mm(l_bd, true),
        1.3 * l_bd,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        min_verankering_opgebogen_staaf_mm(l_bd, true),
        800.7246377,
        max_relative = 1e-8
    );
    assert_relative_eq!(
        min_verankering_opgebogen_staaf_mm(l_bd, false),
        0.7 * l_bd,
        max_relative = 1e-12
    );
}

/// c_d volgens de drie gevallen van figuur 8.3.
///
/// Balk 300 mm breed, dekking 35 mm, beugel Ø8, 4Ø20 in één laag:
/// ```text
///   c   = 35 mm (dekking op de beugel; de dekking op de langsstaaf is
///         35 + 8 = 43 mm — welke van de twee de norm bedoelt, bepaalt de
///         aanroeper, deze functie rekent alleen min(...))
///   c₁  = 43 mm
///   a   = (300 − 2·43 − 20)/3 + 20 = 84,667 mm  (hart-op-hart, 4 staven)
///   a) rechte staven : c_d = min(42,333; 43; 35) = 35 mm
///   b) haak/ombuiging: c_d = min(42,333; 43)     = 42,333 mm
///   c) haarspeld     : c_d = c                   = 35 mm
/// ```
#[test]
fn c_d_uit_figuur_8_3() {
    let c = 35.0;
    let c1 = 43.0;
    let a = (300.0 - 2.0 * 43.0 - 20.0) / 3.0 + 20.0;
    assert_relative_eq!(a, 84.6666667, max_relative = 1e-8);

    assert_relative_eq!(
        c_d_mm(Dekkingsgeval::RechteStaven { a_mm: a, c1_mm: c1, c_mm: c }),
        35.0,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        c_d_mm(Dekkingsgeval::OmgebogenOfHaak { a_mm: a, c1_mm: c1 }),
        a / 2.0,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        c_d_mm(Dekkingsgeval::Haarspeld { c_mm: c }),
        35.0,
        max_relative = 1e-12
    );
}

/// De losse tabel-8.2-functies, elk op één handgerekend punt.
#[test]
fn tabel_8_2_punt_voor_punt() {
    // α₁ = 0,7 bij een ombuiging met c_d > 3Φ; 1,0 zodra c_d dat niet haalt.
    assert_relative_eq!(
        alpha_1(Staafvorm::AndersDanRecht, Verankeringssoort::Trek, 49.0, 16.0),
        0.7,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        alpha_1(Staafvorm::AndersDanRecht, Verankeringssoort::Trek, 48.0, 16.0),
        1.0,
        max_relative = 1e-12
    );
    // α₂ recht: 1 − 0,15·(40 − 16)/16 = 0,775; ondergrens 0,7 bij c_d = 48 mm:
    // 1 − 0,15·(48 − 16)/16 = 0,70.
    assert_relative_eq!(
        alpha_2(Staafvorm::Recht, Verankeringssoort::Trek, 40.0, 16.0),
        0.775,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        alpha_2(Staafvorm::Recht, Verankeringssoort::Trek, 48.0, 16.0),
        0.7,
        max_relative = 1e-12
    );
    // α₃ = 1 − K·λ met K = 0,1 en λ = 2,0 → 0,8; bij λ = 4,0 → 0,6 → 0,7.
    assert_relative_eq!(
        alpha_3(Verankeringssoort::Trek, KWaarde::InDeHoek.k(), 2.0),
        0.8,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        alpha_3(Verankeringssoort::Trek, KWaarde::InDeHoek.k(), 4.0),
        0.7,
        max_relative = 1e-12
    );
    // α₅ = 1 − 0,04·p: p = 5 → 0,8; p = 10 → 0,6 → 0,7.
    assert_relative_eq!(alpha_5(Verankeringssoort::Trek, 5.0), 0.8, max_relative = 1e-12);
    assert_relative_eq!(alpha_5(Verankeringssoort::Trek, 10.0), 0.7, max_relative = 1e-12);
    // α₆ trek: (33/25)^0,5 = 1,14891 — de NB-tabel geeft 1,15.
    assert_relative_eq!(
        alpha_6(33.0, Verankeringssoort::Trek),
        1.1489125,
        max_relative = 1e-7
    );
}

// ---------------------------------------------------------------------------
// De afleiding als rapportinhoud
// ---------------------------------------------------------------------------

/// Zes deelstappen, elk met een vindplaats, een symbolische formule, een
/// ingevulde regel en een uitkomst — en de laatste stap geeft l_bd.
#[test]
fn de_afleiding_is_compleet_en_rekent_niets_opnieuw_uit() {
    let v = verankeringslengte(&VerankeringInvoer {
        k_waarde: KWaarde::DwarsstaafBuiten,
        lambda: 0.25,
        ..onderstaaf(16.0)
    })
    .unwrap();
    let stappen = verankering_deelstappen(&v);

    let ids: Vec<&str> = stappen.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, vec!["f_ctd", "f_bd", "l_b_rqd", "alfa", "l_b_min", "l_bd"]);

    for s in &stappen {
        assert!(!s.article.is_empty(), "{} draagt geen vindplaats", s.id);
        assert!(!s.formula_latex.is_empty(), "{} draagt geen formule", s.id);
        assert!(!s.ingevuld_latex.is_empty(), "{} draagt geen ingevulde regel", s.id);
        assert!(s.value.is_some(), "{} levert geen waarde", s.id);
    }

    // De stappen dragen exact de waarden die de berekening al had; er wordt
    // niets opnieuw uitgerekend.
    let waarde = |id: &str| stappen.iter().find(|s| s.id == id).unwrap().value.unwrap();
    assert_relative_eq!(waarde("f_ctd"), v.f_ctd_mpa, max_relative = 1e-15);
    assert_relative_eq!(waarde("f_bd"), v.f_bd_mpa, max_relative = 1e-15);
    assert_relative_eq!(waarde("l_b_rqd"), v.l_b_rqd_mm, max_relative = 1e-15);
    assert_relative_eq!(waarde("alfa"), v.alfa.product, max_relative = 1e-15);
    assert_relative_eq!(waarde("l_b_min"), v.l_b_min_mm, max_relative = 1e-15);
    assert_relative_eq!(waarde("l_bd"), v.l_bd_mm, max_relative = 1e-15);

    // Vijf alfa-factoren, vijf regels herkomst.
    assert_eq!(v.alfa.herkomst.len(), 5);

    // De afwijking σ_sd = f_yd staat als kanttekening in de afleiding; zij mag
    // niet stilzwijgend gebeuren.
    let l_b_rqd_stap = stappen.iter().find(|s| s.id == "l_b_rqd").unwrap();
    assert!(
        l_b_rqd_stap.notes.iter().any(|n| n.contains("f_yd")),
        "de keuze σ_sd = f_yd hoort in de kanttekeningen te staan"
    );
}

/// Een staaf die niet te berekenen is, levert een foutmelding en geen getal.
#[test]
fn onvolledige_invoer_levert_geen_stil_antwoord() {
    // Zonder materiaalgegevens.
    assert!(verankeringslengte(&VerankeringInvoer::default()).is_err());
    // Zonder treksterkte is er geen f_bd.
    assert!(verankeringslengte(&VerankeringInvoer {
        f_ctk_005_mpa: 0.0,
        ..onderstaaf(16.0)
    })
    .is_err());
    // Zonder f_yd is er geen σ_sd.
    assert!(verankeringslengte(&VerankeringInvoer { f_yd_mpa: 0.0, ..onderstaaf(16.0) }).is_err());
}
