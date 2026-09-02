//! Calc 2 Beam 1 acceptance test — HEB160 S235.
//!
//! Reference: verificatie calculations/original/Calc 2.pdf §2.6.1 (page 50-53)
//! Reference model: 5 m beam, check at x=2500 mm.

use steel_check::*;
use mechanics::{InternalForces, ForcePoint};
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_section::{CheckStatus, classification::CrossSectionClass};
use approx::assert_relative_eq;
use std::sync::OnceLock;

fn run() -> &'static BeamCheckResult {
    static RESULT: OnceLock<BeamCheckResult> = OnceLock::new();
    RESULT.get_or_init(|| {
        let input = BeamCheckInput {
            beam_id: 1,
            profile_name: "HEB160".to_string(),
            steel_grade: "S235".to_string(),
            length_m: 5.0,
            forces_envelope: vec![
                ForcePoint {
                    combination_id: 2,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -226.027, vy_ed: 0.0, vz_ed: -35.136, mt_ed: 0.0, my_ed: 0.0, mz_ed: 0.0 },
                },
                ForcePoint {
                    combination_id: 2,
                    position_mm: 2500.0,
                    forces: InternalForces { n_ed: -226.027, vy_ed: 0.0, vz_ed: -35.136, mt_ed: 0.0, my_ed: -87.84, mz_ed: 0.0 },
                },
                ForcePoint {
                    combination_id: 1,
                    position_mm: 2500.0,
                    forces: InternalForces { n_ed: -197.946, vy_ed: 0.0, vz_ed: -31.922, mt_ed: 0.0, my_ed: -79.806, mz_ed: 0.0 },
                },
            ],
            lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![] },
            buckling_length_y_m: 5.0,
            buckling_length_z_m: 5.0,
            deflection_limit_class: DeflectionClass::Floor,
            deflection_limit_numerator: 333,
            deflection_actual_max_mm: 0.0,
            is_cantilever: false,
            consequence_class: ConsequenceClass::CC1,
            pre_camber_mm: 0.0,
            deflection_permanent_mm: 0.0,
            q_equiv_n_per_mm: 0.0,
            z_a_mm: 0.0,
            custom_section: None,
        };
        check_beam(input)
    })
}

fn find_check<'a>(result: &'a BeamCheckResult, id: &str) -> &'a NamedCheck {
    result.checks.iter().find(|c| c.id == id)
        .unwrap_or_else(|| panic!("check '{}' not found; available: {:?}", id,
            result.checks.iter().map(|c| c.id.as_str()).collect::<Vec<_>>()))
}

fn resistance_value(result: &BeamCheckResult, id: &str) -> f64 {
    match &find_check(result, id).kind {
        CheckKind::Resistance(r) => r.value,
        CheckKind::Stability(s) => s.value,
    }
}

fn uc_value(result: &BeamCheckResult, id: &str) -> f64 {
    match &find_check(result, id).kind {
        CheckKind::Resistance(r) => r.uc.as_ref().expect("expected UC").uc,
        CheckKind::Stability(s) => s.uc.as_ref().expect("expected UC").uc,
    }
}

#[test]
fn calc2_beam1_compression() {
    let r = run();
    // Reference: N_c,Rd = 1275.472 kN, UC = 0.18
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 1275.472, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.18, max_relative = 0.025);
}

#[test]
fn calc2_beam1_bending() {
    let r = run();
    // Reference: M_y,c,Rd = 83.217 kNm, UC = 1.06 NOT OK
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 83.217, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.5_bending_y"), 1.06, max_relative = 0.02);
    let bend = find_check(r, "6.2.5_bending_y");
    if let CheckKind::Resistance(rc) = &bend.kind {
        assert_eq!(rc.status, CheckStatus::NotOk);
    }
}

#[test]
fn calc2_beam1_shear() {
    let r = run();
    // Reference: V_c,z,Rd = 239.1 kN, UC = 0.15
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 239.1, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.15, max_relative = 0.025);
}

#[test]
fn calc2_beam1_classification_class1() {
    let r = run();
    assert_eq!(r.classification, CrossSectionClass::Class1);
}

#[test]
fn calc2_beam1_governing_is_bending() {
    let r = run();
    // Governing should be 6.2.5_bending_y with UC ~1.06
    // NOTE: Phase 13 may reveal that one of the 6.3.3 interaction equations gives higher UC
    // due to C1 approximation; if so, this test will need adjustment per iteration-log.md.
    assert!(r.uc_max >= 1.0, "expected uc_max >= 1.0 (reference: 1.06), got {}", r.uc_max);
    assert_eq!(r.status, CheckStatus::NotOk);
}

#[test]
fn calc2_beam1_snapshot() {
    insta::assert_json_snapshot!("calc2_beam1", run());
}
