//! Portal Frame Beam 2 acceptance test — HEB160 S235 (left column).
//!
//! Reference: verificatie calculations/original/portal-frame.pdf §2.6.2 (page 53-58)
//! Profile: HEB160. Beam length: 2500 mm (column).
//! Governing check: 6.3.3 (N+M interaction), UC = 0.79.
//!
//! Note: the reference uses combination 2.1 (mapped to u32 21) and 2.2 (mapped to u32 22).
//! The bending check uses combination 2.1 (My=-66.036 kNm), compression uses 2.2 (N=-233.911 kN).
//! LTB check uses combination 1.1 (mapped to u32 11).

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
            length_m: 2.5,
            forces_envelope: vec![
                // Combination 2.2 (id=22), x=0: governs compression
                ForcePoint {
                    combination_id: 22,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -233.911, vy_ed: 0.0, vz_ed: 17.357, mt_ed: 0.0, my_ed: -63.139, mz_ed: 0.0 },
                },
                // Combination 2.1 (id=21), x=0: governs bending + 6.3.3
                ForcePoint {
                    combination_id: 21,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -232.435, vy_ed: 0.0, vz_ed: 19.817, mt_ed: 0.0, my_ed: -66.036, mz_ed: 0.0 },
                },
                // Combination 1.1 (id=11), x=0: used for LTB check
                ForcePoint {
                    combination_id: 11,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -201.988, vy_ed: 0.0, vz_ed: 17.184, mt_ed: 0.0, my_ed: -57.423, mz_ed: 0.0 },
                },
            ],
            lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![] },
            // Reference: Lcr,y=2500 mm, Lcr,z=2500 mm
            buckling_length_y_m: 2.5,
            buckling_length_z_m: 2.5,
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
fn portal_beam2_compression() {
    let r = run();
    // Reference: N_c,Rd = 1275.472 kN, UC = 0.18
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 1275.472, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.18, max_relative = 0.025);
}

#[test]
fn portal_beam2_bending() {
    let r = run();
    // Reference: M_y,c,Rd = 83.217 kNm, UC = 0.79
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 83.217, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.5_bending_y"), 0.79, max_relative = 0.02);
}

#[test]
fn portal_beam2_shear() {
    let r = run();
    // Reference: V_c,z,Rd = 239.1 kN, UC = 0.08
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 239.1, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.08, max_relative = 0.04);
}

#[test]
fn portal_beam2_governing_ok() {
    let r = run();
    // Reference governing: 6.3.3 UC=0.79; beam is OK.
    // TODO Phase 13: assert governing_check_id == "6.3.3_n_my" once verified.
    assert!(r.uc_max < 1.0, "expected uc_max < 1.0 (reference: 0.79), got {}", r.uc_max);
    assert_eq!(r.status, CheckStatus::Ok);
}

#[test]
fn portal_beam2_snapshot() {
    insta::assert_json_snapshot!("portal_beam2", run());
}
