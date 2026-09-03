//! Calc 2 Beam 2 acceptance test — HEB160 S235.
//!
//! Reference: verificatie calculations/original/Calc 2.pdf §2.6.2 (page 53-57)
//! Reference model: 5 m beam, check at x=2500 mm.
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
fn calc2_beam2_compression() {
    let r = run();
    // Reference: N_c,Rd = 1275.472 kN, UC = 0.19
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 1275.472, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.19, max_relative = 0.025);
}

#[test]
fn calc2_beam2_bending() {
    let r = run();
    // Reference: M_y,c,Rd = 83.217 kNm, UC = 1.52 NOT OK
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
    // Reference: V_c,z,Rd = 239.1 kN, UC = 0.21
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
    // Reference governing: 6.2.9.1 (bending+axial) with UC 1.52 (same as pure bending since M >> limit)
    assert!(r.uc_max >= 1.0, "expected uc_max >= 1.0 (reference: 1.52), got {}", r.uc_max);
    assert_eq!(r.status, CheckStatus::NotOk);
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
///    combinatie is bemonsterd van x = 0 tot x = 2500 mm op een staaf van
///    5000 mm, zodat het eindmoment waaruit β en B* volgen is vastgehouden en
///    niet gemeten. Zie de waarschuwing daarover hieronder.
///
/// Sept 2026 bijgewerkt na de kipreparatie, om exact dezelfde reden als bij
/// calc2_beam1 — zelfde profiel (HEB 160), zelfde lengte, zelfde ongesteunde
/// kipveld, alleen hogere krachten. Zie de uitgebreide verantwoording in de
/// docstring bij `calc2_beam1_snapshot`.
///
/// β komt nu uit de eindmomenten van het kipveld in plaats van uit
/// M(1250)/M_max = 0,50. Let op waar die eindmomenten vandaan komen: de fixture
/// bemonstert de momentenlijn alleen op x = 0 en x = 2500 mm, terwijl de staaf
/// 5000 mm lang is. De M(5000) = +126,672 kNm waarmee gerekend wordt is dus
/// niet gemeten maar door `interpolate_my_at` vastgehouden — het is de waarde
/// van x = 2500. De kern gelooft daardoor dat dit een ligger onder
/// eindmomenten is (B* = −1), terwijl de testkop "check at x=2500" beschrijft.
///
/// Gevolg: C₁ 1,300 → 1,750, M_cr 193,04 → 259,86 kNm, λ_LT 0,6565 → 0,5658,
/// χ_LT 0,8909 → 0,9323, UC kip 1,7092 → 1,6333, 6.3.3 vgl. 6.61 1,4389 →
/// 1,3865 en vgl. 6.62 1,2036 → 1,1721. uc_max 1,7092 → 1,6333; de ligger
/// blijft ruim NotOk. De op het referentie-rapport geijkte asserties hierboven
/// veranderen niet.
///
/// **Dezelfde waarschuwing als bij calc2_beam1, en zij geldt hier even hard.**
/// De UC daalt, maar die richting hangt aan de onvolledige envelop van de
/// fixture, niet aan de norm. Levert de frontend de volle overspanning (met
/// M(5000) = 0), dan zijn béíde eindmomenten nul, wordt B* = 0 in plaats van
/// −1 en C₁ = 1,13, en gaat de UC juist omhóóg. Op realistische invoer werkt
/// deze reparatie hier dus conservatiever, niet gunstiger. De fixture is bewust
/// niet uitgebreid: het is referentie-afgeleide invoer, en die binnen een
/// kipreparatie herschrijven maakt de snapshot onnavolgbaar. Het staat als open
/// punt in §B.15 van het validatiedossier, en de kern meldt de onvolledigheid
/// sinds september 2026 zelf in het rapport.
#[test]
fn calc2_beam2_snapshot() {
    insta::assert_json_snapshot!("calc2_beam2", run());
}
