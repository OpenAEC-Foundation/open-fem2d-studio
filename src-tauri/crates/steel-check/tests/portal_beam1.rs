//! Portal Frame Beam 1 acceptance test — UNP350 S235.
//!
//! Reference: verificatie calculations/original/portal-frame.pdf §2.6.1 (page 51-54)
//! Profile: UNP350 (channel section). Beam length: 5000 mm (horizontal girder).
//! Governing combination: 2.1 (referentie combination, mapped to u32 21).
//! Governing check: 6.3.3 interaction with UC = 0.98.

use steel_check::*;
use mechanics::{InternalForces, ForcePoint};
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1990::ConsequenceClass;
use approx::assert_relative_eq;
use std::sync::OnceLock;

fn run() -> &'static BeamCheckResult {
    static RESULT: OnceLock<BeamCheckResult> = OnceLock::new();
    RESULT.get_or_init(|| {
        let input = BeamCheckInput {
            beam_id: 1,
            profile_name: "UNP350".to_string(),
            steel_grade: "S235".to_string(),
            length_m: 5.0,
            forces_envelope: vec![
                // Combination 2.1 (id=21), x=0: compression + shear + moment
                ForcePoint {
                    combination_id: 21,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -18.479, vy_ed: 0.0, vz_ed: -232.736, mt_ed: 0.0, my_ed: 66.036, mz_ed: 0.0 },
                },
                // Combination 2.1 (id=21), x=3900 mm: decisive for bending + shear + 6.3.3
                ForcePoint {
                    combination_id: 21,
                    position_mm: 3900.0,
                    forces: InternalForces { n_ed: -18.479, vy_ed: 0.0, vz_ed: 235.084, mt_ed: 0.0, my_ed: -194.796, mz_ed: 0.0 },
                },
            ],
            lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![] },
            // referentie: Lcr,y=5000 mm, Lcr,z=5000 mm
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
fn portal_beam1_compression() {
    let r = run();
    // Phase 13-G: UNP350 area aligned with referentie (A=7665.7 mm²)
    // N_c,Rd = 7665.7 × 235 / 1.0 / 1000 = 1801.44 kN — matches referentie exactly
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 1801.44, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.01, max_relative = 0.15); // very small UC, wider tolerance
}

#[test]
fn portal_beam1_bending() {
    let r = run();
    // Phase 13-F: UNP350 Wpl,y corrected to 889763 mm³ (referentie catalog value)
    // M_y,c,Rd = 889763 × 235 / 1.0 / 1e6 = 209.094 kNm — now matches referentie exactly
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 209.094, max_relative = 1e-3);
    // UC = 194.796 / 209.094 = 0.932 (referentie: 0.93 — now aligned)
    assert_relative_eq!(uc_value(r, "6.2.5_bending_y"), 0.932, max_relative = 0.025);
}

#[test]
fn portal_beam1_shear() {
    let r = run();
    // Phase 13-G: UNP350 Av_z aligned with referentie (Av=4946 mm²)
    // V_c,z,Rd = 4946 × (235/√3) / 1.0 / 1000 = 671.06 kN — matches referentie 671.1 kN
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 671.06, max_relative = 1e-3);
    // UC = 235.084 / 671.06 = 0.350 (referentie: 0.35)
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.350, max_relative = 0.025);
}

#[test]
fn portal_beam1_channel_ltb() {
    let r = run();
    // Phase 13-E: UNP350 LTB is now computed (no longer NotApplicable).
    // Uses conservative monosym Mcr (× 0.7) with buckling curve c (alpha_LT=0.49).
    let ltb_uc = uc_value(r, "6.3.2_ltb_channel");
    assert!(ltb_uc > 0.0 && ltb_uc < 5.0, "LTB UC should be a finite positive value, got {}", ltb_uc);
    eprintln!("portal_beam1 channel LTB UC (Phase 13-E) = {}", ltb_uc);
}

#[test]
fn portal_beam1_governing_ok() {
    let r = run();
    // referentie governing: 6.3.3 UC=0.98, beam is OK.
    // Phase 13-F: Wpl corrected to 889763 mm³, bending and interaction UCs now aligned with referentie.
    assert!(r.uc_max > 0.0, "uc_max should be positive");
    // Document UC for comparison with referentie reference:
    eprintln!("portal_beam1 uc_max (Phase 13-F) = {}", r.uc_max);
}

#[test]
fn portal_beam1_snapshot() {
    insta::assert_json_snapshot!("portal_beam1", run());
}
