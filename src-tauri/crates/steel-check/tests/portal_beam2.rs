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

/// Regressiesnapshot van het volledige resultaat.
///
/// Sept 2026 (b) bijgewerkt na de nabeschouwing op de kipreparatie.
/// **Geen enkele unity check en geen enkele tussenwaarde verandert**; het
/// verschil met de vorige snapshot zit volledig in de notitieteksten:
///  * de kipkrommenotitie is per rij van tabel 6.5 apart geformuleerd. Zij
///    stond onvoorwaardelijk als "volgens tabel 6.5", ook voor doorsneden
///    waarvoor die tabel geen rij heeft — precies de kloof tussen commentaar en
///    code die de reparatie zelf moest dichten, terug op de plek waar de
///    constructeur hem leest. De krommeletter staat nu bovendien klein, zoals de
///    norm hem schrijft, en de getallen met een decimale komma;
///  * er komt een notitie bij dat vgl. (6.58) — χ_LT,mod — niet is toegepast.
///    Het artikellabel van deze toets noemt 6.3.2.3; dan hoort het rapport te
///    zeggen welk deel daarvan is overgeslagen. Weglaten is veilig-zijdig
///    (f ≤ 1, dus χ_LT,mod ≥ χ_LT), maar niet stilzwijgend;
///  * er komt een notitie bij dat de omhullende van de maatgevende
///    combinatie uit één station bestaat (x = 0 op een staaf van 2500 mm), zodat
///    béíde eindmomenten waaruit β en B* volgen zijn vastgehouden en niet
///    gemeten. Dat is een eigenschap van deze fixture, geen wijziging in de kern.
///
/// Sept 2026 bijgewerkt na de kipreparatie, maar **geen enkel getal is
/// veranderd**. Alleen de nieuwe tussenwaarde α_LT = 0,34 is bijgekomen, zodat
/// het rapport kan tonen wélke kipkromme is gebruikt.
///
/// Waarom er niets schuift, nagerekend: de envelop heeft voor de maatgevende
/// combinatie (id 21) één station, op x = 0. Beide eindmomenten van het enige
/// kipveld zijn dus −66,036 kNm, β = +1 — dezelfde waarde die de oude
/// kwartpuntbenadering gaf. De kolom is ongesteund, dus het veld ligt tussen
/// twee gaffels en L_kip = L_st = 2500 mm; de oude code kwam daar ook op uit
/// doordat (1,4 − 0,8·1) = 0,6 op de ondergrens 1,0 werd afgekapt. En HEB 160
/// heeft h/b = 1,0 ≤ 2, dus tabel 6.5 geeft kromme b: α_LT = 0,34, dezelfde
/// waarde die er vast stond.
#[test]
fn portal_beam2_snapshot() {
    insta::assert_json_snapshot!("portal_beam2", run());
}
