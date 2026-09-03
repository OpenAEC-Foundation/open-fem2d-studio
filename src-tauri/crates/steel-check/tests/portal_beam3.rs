//! Portal Frame Beam 3 acceptance test — HEB160 S235 (right column).
//!
//! Reference: verificatie calculations/original/portal-frame.pdf §2.6.3 (page 57-61)
//! Profile: HEB160. Beam length: 2500 mm (column, symmetric to Beam 2).
//! Governing check: 6.3.3 with UC=0.78 (or 0.62 for other combination).
//!
//! LTB: C1=1.485 (beta=0.326), M_cr=536.275 kNm, lambda_LT=0.394, chi_LT=1.00
//! Reference: Combination 2.2 (id=22) governs bending; 1.1 (id=11) for LTB.

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
            beam_id: 3,
            profile_name: "HEB160".to_string(),
            steel_grade: "S235".to_string(),
            length_m: 2.5,
            forces_envelope: vec![
                // Combination 2.1 (id=21), x=0: used for compression check
                ForcePoint {
                    combination_id: 21,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -234.244, vy_ed: 0.0, vz_ed: -17.124, mt_ed: 0.0, my_ed: 63.411, mz_ed: 0.0 },
                },
                // Combination 2.2 (id=22), x=0: governs bending + 6.3.3
                ForcePoint {
                    combination_id: 22,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -232.768, vy_ed: 0.0, vz_ed: -19.519, mt_ed: 0.0, my_ed: 66.192, mz_ed: 0.0 },
                },
                // Combination 1.1 (id=11), x=0: used for LTB check
                ForcePoint {
                    combination_id: 11,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -203.541, vy_ed: 0.0, vz_ed: -14.886, mt_ed: 0.0, my_ed: 55.195, mz_ed: 0.0 },
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
fn portal_beam3_compression() {
    let r = run();
    // Reference: N_c,Rd = 1275.472 kN, UC = 0.18
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 1275.472, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.18, max_relative = 0.025);
}

#[test]
fn portal_beam3_bending() {
    let r = run();
    // Reference: M_y,c,Rd = 83.217 kNm, UC = 0.80
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 83.217, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.5_bending_y"), 0.80, max_relative = 0.02);
}

#[test]
fn portal_beam3_shear() {
    let r = run();
    // Reference: V_c,z,Rd = 239.1 kN, UC = 0.08
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 239.1, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.08, max_relative = 0.03);
}

#[test]
fn portal_beam3_governing_ok() {
    let r = run();
    // Reference governing: 6.3.3 UC=0.78; beam is OK.
    assert!(r.uc_max < 1.0, "expected uc_max < 1.0 (reference: 0.78), got {}", r.uc_max);
    assert_eq!(r.status, CheckStatus::Ok);
}

/// Regressiesnapshot van het volledige resultaat.
///
/// Sept 2026 bijgewerkt na de kipreparatie, maar **geen enkel getal is
/// veranderd** — zelfde situatie als portal_beam2, waarvan deze kolom het
/// spiegelbeeld is. Alleen de nieuwe tussenwaarde α_LT = 0,34 is bijgekomen.
/// Zie de verantwoording bij `portal_beam2_snapshot`.
#[test]
fn portal_beam3_snapshot() {
    insta::assert_json_snapshot!("portal_beam3", run());
}
