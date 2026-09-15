//! Knik om de zwakke as bij hout: k_c,y en k_c,z met hun λ_rel en de
//! (6.23)/(6.24)-termen zichtbaar, en de kniklengte uit het vlak met herkomst.
//!
//! WAT HIER VASTLIGT
//! 1. Een C24-kolom 100 × 160 met L_cr,z = 2·L_cr,y: (6.24) is maatgevend, en
//!    beide takken staan in de afleiding. k_c,z en k_c,y worden MET DE HAND uit
//!    (6.21)/(6.22), (6.27)/(6.28) en (6.25)/(6.26) nagerekend.
//! 2. Een ligger met zijdelingse steunen: aan één rand verkorten ze L_cr,z
//!    niet, aan boven- én onderrand wel — de kolomtoets en de drukterm van de
//!    kiptoets veranderen, de kiplengte l_ef NIET (die heeft zijn eigen veld).
//! 3. Zonder opgave: de staaflengte, met herkomst.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_stability::kniklengte::{
    HERKOMST_KIPSTEUNEN, HERKOMST_OPGEGEVEN, HERKOMST_STAAFLENGTE,
};
use nen_en_1993_1_1_stability::{Deelstap, StabilityCalc};
use nen_en_1995_1_1::stability::{LtbLoadCase, LtbLoadPosition};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use timber_check::*;

#[allow(clippy::too_many_arguments)]
fn houten_staaf(
    b_mm: f64,
    h_mm: f64,
    l_mm: f64,
    n_kn: f64,
    m_top_knm: f64,
    l_cr_y_m: f64,
    l_cr_z_m: f64,
    steunen: Option<LateralBracing>,
) -> TimberBeamCheckResult {
    let envelop = (0..=20)
        .map(|i| {
            let x = l_mm * i as f64 / 20.0;
            ForcePoint {
                combination_id: 1,
                position_mm: x,
                forces: InternalForces {
                    n_ed: n_kn,
                    my_ed: m_top_knm * 4.0 * (x / l_mm) * (1.0 - x / l_mm),
                    ..Default::default()
                },
            }
        })
        .collect();
    check_timber_beam(TimberBeamCheckInput {
        beam_id: 1,
        width_mm: b_mm,
        height_mm: h_mm,
        custom_section: None,
        strength_class: "C24".to_string(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        load_duration_per_combination: vec![],
        length_m: l_mm / 1000.0,
        forces_envelope: envelop,
        buckling_length_y_m: l_cr_y_m,
        buckling_length_z_m: l_cr_z_m,
        lateral_bracing: steunen,
        ltb_segment_length_m: 0.0,
        ltb_load_case: LtbLoadCase::UniformLoad,
        ltb_load_position: LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: 0.0,
        perform_ltb_check: true,
        k_cr: 1.0,
        load_sharing: false,
        deflection_inst_mm: 0.0,
        deflection_quasi_perm_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
        deflection_notes: vec![],
    })
}

fn toets<'a>(r: &'a TimberBeamCheckResult, id: &str) -> &'a StabilityCalc {
    let c = r.checks.iter().find(|c| c.id == id).unwrap_or_else(|| panic!("{id} ontbreekt"));
    let CheckKind::Stability(s) = &c.kind else { panic!("{id} is een stabiliteitstoets") };
    s
}

fn stap<'a>(s: &'a StabilityCalc, id: &str) -> &'a Deelstap {
    s.deelstappen.iter().find(|d| d.id == id).unwrap_or_else(|| {
        panic!(
            "stap {id} ontbreekt; wel aanwezig: {:?}",
            s.deelstappen.iter().map(|d| d.id.as_str()).collect::<Vec<_>>()
        )
    })
}

fn waarde(s: &StabilityCalc, id: &str) -> f64 {
    stap(s, id).value.unwrap_or_else(|| panic!("stap {id} heeft geen uitkomst"))
}

/// C24 volgens de kern: f_c,0,k = 21, E_0,05 = 7400 N/mm²; massief hout, dus
/// β_c = 0,2 en γ_M = 1,3; klimaatklasse 1 en middellange belastingduur, dus
/// k_mod = 0,8. f_c,0,d = 0,8·21/1,3 = 12,923 N/mm².
const F_C0K: f64 = 21.0;
const E_005: f64 = 7400.0;
const BETA_C: f64 = 0.2;

/// De tak van één as met de hand: λ = L_cr/i, λ_rel (6.21)/(6.22),
/// k (6.27)/(6.28), k_c (6.25)/(6.26).
fn tak_met_de_hand(l_cr_mm: f64, i_mm: f64) -> (f64, f64, f64, f64) {
    let lambda = l_cr_mm / i_mm;
    let lambda_rel = lambda / std::f64::consts::PI * (F_C0K / E_005).sqrt();
    let k = 0.5 * (1.0 + BETA_C * (lambda_rel - 0.3) + lambda_rel * lambda_rel);
    let k_c = (1.0 / (k + (k * k - lambda_rel * lambda_rel).sqrt())).min(1.0);
    (lambda, lambda_rel, k, k_c)
}

#[test]
fn c24_kolom_knikt_om_z_en_de_afleiding_toont_beide_takken() {
    let (b, h) = (100.0, 160.0);
    let r = houten_staaf(b, h, 2000.0, -20.0, 0.0, 1.0, 2.0, None);
    let s = toets(&r, "6.3.2_column_stability");

    // ── De handberekening ──────────────────────────────────────────────────
    let f_c0d = 0.8 * F_C0K / 1.3;
    assert_relative_eq!(f_c0d, 12.923, max_relative = 1e-4);
    let sigma_c = 20.0e3 / (b * h); // 1,25 N/mm²
    // Om z: i_z = 100/√12 = 28,868 mm; λ_z = 2000/28,868 = 69,28;
    //       λ_rel,z = 69,28/π·√(21/7400) = 1,1748;
    //       k_z = 0,5·(1 + 0,2·(1,1748 − 0,3) + 1,1748²) = 1,2776;
    //       k_c,z = 1/(1,2776 + √(1,2776² − 1,1748²)) = 0,5619;
    //       (6.24) = 1,25/(0,5619·12,923) = 0,1721.
    let (l_z, lr_z, k_z, kc_z) = tak_met_de_hand(2000.0, b / 12.0_f64.sqrt());
    assert_relative_eq!(l_z, 69.28, max_relative = 1e-4);
    assert_relative_eq!(lr_z, 1.1748, max_relative = 1e-4);
    assert_relative_eq!(k_z, 1.2776, max_relative = 1e-4);
    assert_relative_eq!(kc_z, 0.5619, max_relative = 2e-4);
    let eq_24 = sigma_c / (kc_z * f_c0d);
    assert_relative_eq!(eq_24, 0.1721, max_relative = 5e-4);
    // Om y: i_y = 160/√12 = 46,188 mm; λ_y = 21,65; λ_rel,y = 0,3671;
    //       k_y = 0,5741; k_c,y = 0,9848; (6.23) = 0,0982.
    let (l_y, lr_y, k_y, kc_y) = tak_met_de_hand(1000.0, h / 12.0_f64.sqrt());
    assert_relative_eq!(l_y, 21.65, max_relative = 2e-4);
    assert_relative_eq!(lr_y, 0.3671, max_relative = 2e-4);
    assert_relative_eq!(k_y, 0.5741, max_relative = 2e-4);
    assert_relative_eq!(kc_y, 0.9848, max_relative = 1e-4);
    let eq_23 = sigma_c / (kc_y * f_c0d);
    assert_relative_eq!(eq_23, 0.0982, max_relative = 1e-3);

    // ── De kern schrijft precies die keten op ─────────────────────────────
    assert_eq!(waarde(s, "l_cr_y"), 1000.0);
    assert_eq!(waarde(s, "l_cr_z"), 2000.0);
    assert_eq!(waarde(s, "l_cr_z"), 2.0 * waarde(s, "l_cr_y"));
    assert_relative_eq!(waarde(s, "sigma_c"), sigma_c, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "lambda_z"), l_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "lambda_rel_z"), lr_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "k_z"), k_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "k_c_z"), kc_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "vergelijking_z"), eq_24, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, "lambda_rel_y"), lr_y, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "k_c_y"), kc_y, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "vergelijking_y"), eq_23, max_relative = 1e-9);
    assert_eq!(stap(s, "vergelijking_z").symbol, "(6.24)");
    assert_eq!(stap(s, "vergelijking_y").symbol, "(6.23)");
    assert!(stap(s, "lambda_rel_z").article.contains("(6.22)"));
    assert!(stap(s, "k_c_z").article.contains("(6.26)"));

    // Beide takken volledig en op volgorde; de slotstap is de grootste.
    let ids: Vec<&str> = s.deelstappen.iter().map(|d| d.id.as_str()).collect();
    for a in ["y", "z"] {
        let posities: Vec<usize> = ["l_cr", "i", "lambda", "lambda_rel", "k", "k_c", "vergelijking"]
            .iter()
            .map(|k| {
                let id = format!("{k}_{a}");
                ids.iter()
                    .position(|i| *i == id)
                    .unwrap_or_else(|| panic!("{id} ontbreekt in {ids:?}"))
            })
            .collect();
        assert!(posities.windows(2).all(|w| w[0] < w[1]), "tak {a} niet op volgorde: {ids:?}");
    }
    assert_eq!(ids.last(), Some(&"maatgevend"));
    assert_relative_eq!(s.uc.as_ref().unwrap().uc, eq_24, max_relative = 1e-9);
    assert!(stap(s, "maatgevend").notes[0].contains("(6.24) — knik om de z-as (uit het vlak)"));
    assert_eq!(stap(s, "l_cr_z").notes[0], format!("Herkomst: {HERKOMST_OPGEGEVEN}."));
    assert!(stap(s, "l_cr_z").notes.iter().any(|n| n.contains("UIT het vlak")));
    assert!(s.title.contains("om z (uit het vlak)"), "{}", s.title);
    assert!(s.notes.iter().any(|n| n.starts_with("Om de z-as (uit het vlak): L_cr,z = 2000 mm (opgegeven)")));
}

#[test]
fn steunen_aan_boven_en_onderrand_verkorten_lcr_z_maar_niet_de_kiplengte() {
    let (b, h, l) = (75.0, 225.0, 4500.0);
    let derde = vec![1.0 / 3.0, 2.0 / 3.0];
    let een_rand = houten_staaf(b, h, l, -15.0, 4.0, 0.0, 0.0, Some(LateralBracing {
        top_flange_positions: derde.clone(),
        bottom_flange_positions: vec![],
    }));
    let beide = houten_staaf(b, h, l, -15.0, 4.0, 0.0, 0.0, Some(LateralBracing {
        top_flange_positions: derde.clone(),
        bottom_flange_positions: derde.clone(),
    }));

    let kolom_a = toets(&een_rand, "6.3.2_column_stability");
    let kolom_b = toets(&beide, "6.3.2_column_stability");
    assert_eq!(waarde(kolom_a, "l_cr_z"), l);
    assert_eq!(stap(kolom_a, "l_cr_z").notes[0], format!("Herkomst: {HERKOMST_STAAFLENGTE}."));
    assert!(stap(kolom_a, "l_cr_z").notes.iter().any(|n| n.contains("alleen de bovenrand (2)")));
    assert_relative_eq!(waarde(kolom_b, "l_cr_z"), 1500.0, max_relative = 1e-12);
    assert_eq!(stap(kolom_b, "l_cr_z").notes[0], format!("Herkomst: {HERKOMST_KIPSTEUNEN}."));
    assert!(stap(kolom_b, "l_cr_z").notes.iter().any(|n| n.contains("(9.34)")));

    // Met de hand om z: 4500 mm → λ_rel,z = 3,5244 → k_c,z = 0,0759;
    //                   1500 mm → λ_rel,z = 1,1748 → k_c,z = 0,5619.
    let i_z = b / 12.0_f64.sqrt();
    let (_, lr_a, _, kc_a) = tak_met_de_hand(l, i_z);
    let (_, lr_b, _, kc_b) = tak_met_de_hand(1500.0, i_z);
    assert_relative_eq!(lr_b, 1.1748, max_relative = 1e-4);
    assert_relative_eq!(waarde(kolom_a, "k_c_z"), kc_a, max_relative = 1e-9);
    assert_relative_eq!(waarde(kolom_b, "k_c_z"), kc_b, max_relative = 1e-9);
    assert!(lr_a > 3.0 * lr_b);

    // De kolomtoets verandert: een kortere L_cr,z geeft een grotere k_c,z en
    // dus een kleinere drukterm in (6.24).
    let uc_a = kolom_a.uc.as_ref().unwrap().uc;
    let uc_b = kolom_b.uc.as_ref().unwrap().uc;
    assert!(uc_b < uc_a, "UC (6.23)/(6.24): {uc_a} → {uc_b}");

    // De kiptoets: dezelfde l_ef (de steunen voeden de kiplengte NIET), maar de
    // drukterm van (6.35) gebruikt de nieuwe k_c,z — en de toets zegt met welke
    // L_cr,z.
    let kip_a = toets(&een_rand, "6.3.3_beam_stability");
    let kip_b = toets(&beide, "6.3.3_beam_stability");
    let l_ef = |s: &StabilityCalc| s.variables.iter().find(|v| v.symbol == "l_{ef}").unwrap().value;
    assert_eq!(l_ef(kip_a), l_ef(kip_b));
    assert!(kip_b.uc.as_ref().unwrap().uc < kip_a.uc.as_ref().unwrap().uc);
    assert!(kip_a.notes.iter().any(|n| n.contains("L_cr,z = 4500 mm (staaflengte (terugval))")), "{:?}", kip_a.notes);
    assert!(kip_b.notes.iter().any(|n| n.contains("L_cr,z = 1500 mm (uit de kipsteunen)")), "{:?}", kip_b.notes);
}

#[test]
fn zonder_opgave_de_staaflengte_met_herkomst() {
    let r = houten_staaf(100.0, 160.0, 3000.0, -20.0, 0.0, 0.0, 0.0, None);
    let s = toets(&r, "6.3.2_column_stability");
    for a in ["y", "z"] {
        assert_eq!(waarde(s, &format!("l_cr_{a}")), 3000.0);
        assert_eq!(stap(s, &format!("l_cr_{a}")).notes[0], format!("Herkomst: {HERKOMST_STAAFLENGTE}."));
    }
    // Dezelfde getallen als met de staaflengte expliciet opgegeven.
    let expliciet = houten_staaf(100.0, 160.0, 3000.0, -20.0, 0.0, 3.0, 3.0, None);
    assert_eq!(toets(&expliciet, "6.3.2_column_stability").value, s.value);

    // Onder trek is kolomknik niet van toepassing: geen afleiding, maar de
    // herkomst van de kniklengte staat er toch.
    let trek = houten_staaf(100.0, 160.0, 3000.0, 20.0, 0.0, 0.0, 0.0, None);
    let t = toets(&trek, "6.3.2_column_stability");
    assert!(t.deelstappen.is_empty());
    assert!(t.notes.iter().any(|n| n.contains("L_cr,z = 3000 mm (staaflengte (terugval))")));
}
