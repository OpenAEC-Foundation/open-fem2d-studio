//! Een onbekende staalsoort is een fout, geen S235.
//!
//! WAT HIER MISGING
//! `check_beam` zocht de staalsoort op met `grade_by_name(..).unwrap_or(S235)`.
//! Een naam als "S355J2", "s355", "S 355", "" of een tikfout werd daardoor stil
//! S235, terwijl het resultaat de OPGEGEVEN naam herhaalde. Gemeten: HEB160 met
//! "S355J2" gaf een unity check die bit-identiek was aan die van S235, onder de
//! naam S355J2 — en het rapport zette die naam in de PDF.
//!
//! WAT DEZE TEST VASTLEGT
//! 1. Elke naam die de kern niet kent levert een resultaat zonder toetsen, met
//!    status NotApplicable en "ERROR: staalsoort …" in `governing_check_id` —
//!    dezelfde vorm als de houtkern bij een onbekende sterkteklasse.
//! 2. De vijf namen die hij wél kent rekenen gewoon, en de staalsoort doet er
//!    werkelijk toe. Dat laatste met de hand nagerekend in plaats van
//!    opgeslagen: HEB160 is in S235 én in S355 klasse 1 (flens
//!    c/t_f = 61/13 = 4,7 ≤ 9ε = 7,3 bij S355; lijf c/t_w = 104/8 = 13 ≤ 33ε =
//!    26,8, tabel 5.2 met ε = √(235/355) = 0,814), dus N_c,Rd = A·f_y/γ_M0 volgens NEN-EN 1993-1-1 (6.10) en schaalt
//!    exact met f_y. De S235-waarde 1275,472 kN is de referentiewaarde uit
//!    `portal_beam2.rs`; voor S355 volgt 1275,472 · 355/235 = 1926,78 kN.

use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_section::CheckStatus;
use steel_check::*;

/// Het referentieportaal, kolom HEB160 — dezelfde krachten als `portal_beam2.rs`.
fn invoer(staalsoort: &str) -> BeamCheckInput {
    BeamCheckInput {
        beam_id: 2,
        profile_name: "HEB160".to_string(),
        steel_grade: staalsoort.to_string(),
        length_m: 2.5,
        forces_envelope: vec![
            ForcePoint {
                combination_id: 22,
                position_mm: 0.0,
                forces: InternalForces { n_ed: -233.911, vy_ed: 0.0, vz_ed: 17.357, mt_ed: 0.0, my_ed: -63.139, mz_ed: 0.0 },
            },
            ForcePoint {
                combination_id: 21,
                position_mm: 0.0,
                forces: InternalForces { n_ed: -232.435, vy_ed: 0.0, vz_ed: 19.817, mt_ed: 0.0, my_ed: -66.036, mz_ed: 0.0 },
            },
            ForcePoint {
                combination_id: 11,
                position_mm: 0.0,
                forces: InternalForces { n_ed: -201.988, vy_ed: 0.0, vz_ed: 17.184, mt_ed: 0.0, my_ed: -57.423, mz_ed: 0.0 },
            },
        ],
        lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![] },
        buckling_length_y_m: 2.5,
        buckling_length_z_m: 2.5,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        q_equiv_n_per_mm: 0.0,
        z_a_mm: 0.0,
        custom_section: None,
        staafstand: None,
    }
}

fn weerstand(r: &BeamCheckResult, id: &str) -> f64 {
    let c = r
        .checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("toets '{id}' ontbreekt"));
    match &c.kind {
        CheckKind::Resistance(x) => x.value,
        CheckKind::Stability(x) => x.value,
    }
}

#[test]
fn een_onbekende_staalsoort_wordt_geweigerd_en_niet_stil_s235() {
    for naam in ["S355J2", "s355", "S 355", "", "onzin", "S690"] {
        let r = check_beam(invoer(naam));
        assert!(
            r.checks.is_empty(),
            "staalsoort {naam:?}: er hoort niet getoetst te worden, kreeg {} toetsen",
            r.checks.len()
        );
        assert_eq!(r.status, CheckStatus::NotApplicable, "staalsoort {naam:?}");
        assert_eq!(r.uc_max, 0.0, "staalsoort {naam:?}");
        assert!(
            r.governing_check_id.starts_with("ERROR: staalsoort"),
            "staalsoort {naam:?}: de reden hoort in governing_check_id, kreeg {:?}",
            r.governing_check_id
        );
        assert!(
            r.governing_check_id.contains(&format!("\"{naam}\"")),
            "de melding hoort de afgewezen naam te noemen: {:?}",
            r.governing_check_id
        );
        // De opgegeven naam komt terug — maar nu bij een resultaat dat zegt dat
        // er NIET getoetst is, in plaats van bij een S235-toetsing.
        assert_eq!(r.steel_grade, naam);
    }
}

#[test]
fn de_bekende_staalsoorten_rekenen_en_de_staalsoort_telt_mee() {
    for naam in ["S235", "S275", "S355", "S420", "S460"] {
        let r = check_beam(invoer(naam));
        assert!(!r.checks.is_empty(), "{naam} hoort gewoon getoetst te worden");
        assert!(
            !r.governing_check_id.starts_with("ERROR"),
            "{naam}: {:?}",
            r.governing_check_id
        );
    }
    // N_c,Rd = A·f_y/γ_M0 (6.10), klasse 1 in beide soorten — zie de kop.
    let n235 = weerstand(&check_beam(invoer("S235")), "6.2.4_compression");
    let n355 = weerstand(&check_beam(invoer("S355")), "6.2.4_compression");
    assert!((n235 - 1275.472).abs() / 1275.472 < 1e-3, "N_c,Rd S235 = {n235}");
    assert!(
        (n355 - 1275.472 * 355.0 / 235.0).abs() / 1926.78 < 1e-3,
        "N_c,Rd S355 = {n355}, verwacht 1275,472·355/235 = 1926,78 kN"
    );
}
