//! Portal Frame Beam 4 acceptance test — HEB300 S235 (horizontal ridge beam).
//!
//! Reference: verificatie calculations/original/portal-frame.pdf §2.6.4 (page 60-64)
//! Profile: HEB300. Beam length: 5000 mm. TENSION member (Nx positive).
//! Governing check: 6.2.5 bending, UC = 0.62.
//!
//! LTB: 2 lateral restraints at 1667 mm spacing, C1=1.582, M_cr=7883.581 kNm,
//!       lambda_LT=0.236 < 0.4, chi_LT=1.00
//! Reference: Combination 2.1 (id=21) governs bending; 1.1 (id=11) for LTB.

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
            beam_id: 4,
            profile_name: "HEB300".to_string(),
            steel_grade: "S235".to_string(),
            length_m: 5.0,
            forces_envelope: vec![
                // Combination 2.1 (id=21), x=2491 mm: tension + bending (decisive)
                ForcePoint {
                    combination_id: 21,
                    position_mm: 2491.0,
                    forces: InternalForces { n_ed: 18.479, vy_ed: 0.0, vz_ed: 0.0, mt_ed: 0.0, my_ed: 273.135, mz_ed: 0.0 },
                },
                // Combination 2.1 (id=21), x=5000 mm: shear check
                ForcePoint {
                    combination_id: 21,
                    position_mm: 5000.0,
                    forces: InternalForces { n_ed: 18.479, vy_ed: 0.0, vz_ed: -234.164, mt_ed: 0.0, my_ed: -20.602, mz_ed: 0.0 },
                },
                // Combination 1.1 (id=11), x=2491 mm: used for LTB check
                ForcePoint {
                    combination_id: 11,
                    position_mm: 2491.0,
                    forces: InternalForces { n_ed: 16.042, vy_ed: 0.0, vz_ed: 134.475, mt_ed: 0.0, my_ed: 237.241, mz_ed: 0.0 },
                },
            ],
            // 2 lateral restraints at 1667 mm and 3333 mm from start (5000 mm beam)
            // Stored as fractions of beam length per unbraced_length_mm() convention:
            // 1667/5000 = 0.3334, 3333/5000 = 0.6666
            lateral_bracing: LateralBracing {
                top_flange_positions: vec![0.3334, 0.6666],
                bottom_flange_positions: vec![],
            },
            // Reference: Lcr,y=5000 mm, Lcr,z (not critical: chi_LT=1.0)
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
fn portal_beam4_bending() {
    let r = run();
    // Reference: M_y,c,Rd = 439.199 kNm, UC = 0.62
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 439.199, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.5_bending_y"), 0.62, max_relative = 0.02);
}

#[test]
fn portal_beam4_shear() {
    let r = run();
    // Reference: V_c,z,Rd = 643.8 kN (Av=4745 mm²), UC = 0.36 (at x=5000 mm, Vz=-234.164 kN)
    // Our profile DB: Av_z=4742 mm² → V_c,z,Rd = 643.4 kN
    // Phase 13-A fix: orchestrator now picks max |Vz| as governing for shear check.
    // → position x=5000 mm, Vz=-234.164 kN, UC = 234.164 / 643.4 ≈ 0.364
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 643.4, max_relative = 1e-2);
    // UC close to reference 0.36 (small delta due to profile DB Av_z: 4742 vs reference 4745 mm²)
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.364, max_relative = 0.02);
}

#[test]
fn portal_beam4_ltb_chi_is_one() {
    let r = run();
    // Reference: lambda_LT = 0.236 < 0.4, so chi_LT = 1.00.
    // The LTB result value IS chi_LT per the orchestrator convention.
    // We check that M_b,Rd (indirectly via 6.3.2_ltb value or UC) reflects chi_LT=1.0.
    // UC_LTB = M_y,Ed / M_b,Rd = 273.135 / 439.199 = 0.622 (same as pure bending since chi_LT=1)
    let ltb_uc = uc_value(r, "6.3.2_ltb");
    // Sept 2026: de twee TODO's uit fase 13 vroegen om verificatie van M_cr
    // voor de HEB 300 mét kipsteunen. Die is er nu, dankzij de kipreparatie —
    // en de uitkomst is ONVERANDERD gebleven, zie hieronder. De tolerantie van
    // 5 % blijft staan omdat de referentie met de algemene EN-formule voor
    // M_cr rekent en onze kern met de Nederlandse bijlage; dat methodeverschil
    // is groter dan de rekennauwkeurigheid en hoort niet weggetolereerd te
    // worden.
    assert_relative_eq!(ltb_uc, 0.622, max_relative = 0.05);
    // χ_LT = 1,00 is de eigenlijke bewering; die mag exact.
    assert_relative_eq!(resistance_value(r, "6.3.2_ltb"), 1.0, max_relative = 1e-12);
}

#[test]
fn portal_beam4_governing_ok() {
    let r = run();
    // Reference: all checks OK, UC_max = 0.62 (bending governs)
    assert!(r.uc_max < 1.0, "expected uc_max < 1.0 (reference: 0.62), got {}", r.uc_max);
    assert_eq!(r.status, CheckStatus::Ok);
}

/// Regressiesnapshot van het volledige resultaat.
///
/// Sept 2026 bijgewerkt na de kipreparatie, maar **geen enkel getal is
/// veranderd**. Alleen de nieuwe tussenwaarde α_LT = 0,34 is bijgekomen.
///
/// Dit is de enige ligger in de suite met échte kipsteunen (twee, op 1667 en
/// 3333 mm), en dus het geval waar de veldindeling er het meest toe doet. De
/// drie velden krijgen elk hun eigen β en L_kip:
///   [0 ; 1667]     M = 273,135 en 273,135 → β = +1,00 → L_kip = 1667 mm
///   [1667 ; 3333]  M = 273,135 en 174,55  → β = +0,64 → L_kip = 1667 mm
///   [3333 ; 5000]  M = 174,55 en −20,602  → β = −0,12 → L_kip = 2334 mm
/// Het eerste veld heeft de laagste M_cr en is dus maatgevend — nét, want het
/// derde veld komt er met zijn 40 % langere kiplengte dicht bij (C = 30,70
/// tegen 30,76). Dat het maatgevende veld het KORTSTE van de drie is, laat
/// zien waarom "het langste veld" niet als criterium kan dienen.
///
/// Het maatgevende veld levert β = +1 en L_kip = L_st = 1667 mm; toevallig
/// precies wat de oude kwartpuntbenadering hier ook opleverde (die las op
/// x = 417 mm af, waar de envelop nog op M_max staat, en de formule kapte
/// (1,4 − 0,8) op de ondergrens 1,0 af). λ_LT blijft 0,209 en dus χ_LT = 1,00,
/// zoals in de referentie (λ_LT = 0,236). HEB 300 heeft h/b = 1,0 ≤ 2, dus
/// tabel 6.5 geeft kromme b met dezelfde α_LT = 0,34 die er vast stond.
#[test]
fn portal_beam4_snapshot() {
    insta::assert_json_snapshot!("portal_beam4", run());
}
