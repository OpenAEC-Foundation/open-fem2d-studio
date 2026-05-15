//! Calc 2 Beam 2 acceptance test — HEB160 S235.
//!
//! Reference: verificatie calculations/original/Calc 2.pdf §2.6.2 (page 53-57)
//! XFrame model: 5 m beam, check at x=2500 mm.
//! This beam has HIGHER forces than Beam 1 and higher governing UC (1.52 bending).

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
            beam_id: 2,
            profile_name: "HEB160".to_string(),
            steel_grade: "S235".to_string(),
            length_m: 5.0,
            forces_envelope: vec![
                // Combination 2, x=0 mm: Nx=-241.496 kN, Vz=50.669 kN, My=0
                ForcePoint {
                    combination_id: 2,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -241.496, vy_ed: 0.0, vz_ed: 50.669, mt_ed: 0.0, my_ed: 0.0, mz_ed: 0.0 },
                },
                // Combination 2, x=2500 mm: Nx=-241.496, Vz=50.669, My=126.672 kNm (governing for bending)
                ForcePoint {
                    combination_id: 2,
                    position_mm: 2500.0,
                    forces: InternalForces { n_ed: -241.496, vy_ed: 0.0, vz_ed: 50.669, mt_ed: 0.0, my_ed: 126.672, mz_ed: 0.0 },
                },
                // Combination 1, x=2500 mm: used for LTB
                ForcePoint {
                    combination_id: 1,
                    position_mm: 2500.0,
                    forces: InternalForces { n_ed: -205.954, vy_ed: 0.0, vz_ed: 40.291, mt_ed: 0.0, my_ed: 100.727, mz_ed: 0.0 },
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
fn calc2_beam2_compression() {
    let r = run();
    // XFrame: N_c,Rd = 1275.472 kN, UC = 0.19
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 1275.472, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.19, max_relative = 0.025);
}

#[test]
fn calc2_beam2_bending() {
    let r = run();
    // XFrame: M_y,c,Rd = 83.217 kNm, UC = 1.52 NOT OK
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 83.217, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.5_bending_y"), 1.52, max_relative = 0.02);
    let bend = find_check(r, "6.2.5_bending_y");
    if let CheckKind::Resistance(rc) = &bend.kind {
        assert_eq!(rc.status, CheckStatus::NotOk);
    }
}

#[test]
fn calc2_beam2_shear() {
    let r = run();
    // XFrame: V_c,z,Rd = 239.1 kN, UC = 0.21
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 239.1, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.21, max_relative = 0.025);
}

#[test]
fn calc2_beam2_classification_class1() {
    let r = run();
    assert_eq!(r.classification, CrossSectionClass::Class1);
}

#[test]
fn calc2_beam2_governing_not_ok() {
    let r = run();
    // XFrame governing: 6.2.9.1 (bending+axial) with UC 1.52 (same as pure bending since M >> limit)
    assert!(r.uc_max >= 1.0, "expected uc_max >= 1.0 (XFrame: 1.52), got {}", r.uc_max);
    assert_eq!(r.status, CheckStatus::NotOk);
}

#[test]
fn calc2_beam2_snapshot() {
    insta::assert_json_snapshot!("calc2_beam2", run());
}
