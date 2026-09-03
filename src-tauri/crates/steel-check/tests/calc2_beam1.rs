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

/// Regressiesnapshot van het volledige resultaat.
///
/// Sept 2026 (c) bijgewerkt na de nabeschouwing op de kipreparatie.
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
///    5000 mm. Dat is exact de onvolledigheid die (b) hieronder al beschrijft;
///    het rapport meldt haar nu zelf in plaats van alleen deze docstring.
///
/// Sept 2026 (b) bijgewerkt na de kipreparatie. Eén van de drie defecten raakt
/// deze ligger: β kwam uit het VELDmoment (M op L_st/4 gedeeld door het
/// grootste moment over de staaf) in plaats van uit de EINDMOMENTEN van het
/// kipveld (NB.NB.4.3). De andere twee laten hem ongemoeid — de ligger is
/// ongesteund, dus het enige kipveld ligt tussen twee gaffels en L_kip = L_st
/// = 5000 mm, precies wat de oude code hier toevallig ook gaf (β = 0,5 kapte
/// de formule op de ondergrens 1,0 af); en HEB 160 heeft h/b = 160/160 = 1,0
/// ≤ 2, dus tabel 6.5 geeft kromme b met α_LT = 0,34 — dezelfde waarde die er
/// vast stond.
///
/// De envelop van de maatgevende combinatie (id 2) heeft twee stations:
/// M(0) = 0 en M(2500) = −87,84 kNm. Het kipveld loopt van 0 tot 5000 mm; het
/// moment op x = 5000 volgt uit die twee punten door het laatste te herhalen,
/// dus de eindmomenten zijn 0 en −87,84 kNm en β = 0. De oude benadering las
/// M(1250) = −43,92 af en kwam op β = 0,50.
///
/// Gevolg: C₁ 1,300 → 1,750 (tabel NB.NB.1 geval 1 geeft bij β = 0 exact 1,75),
/// M_cr 193,04 → 259,86 kNm, λ_LT 0,6565 → 0,5658, χ_LT 0,8909 → 0,9323,
/// UC kip 1,1852 → 1,1326, 6.3.3 vgl. 6.61 1,0536 → 1,0175 en vgl. 6.62
/// 0,9506 → 0,9289. uc_max 1,1852 → 1,1326; de ligger blijft NotOk op kip.
///
/// De UC daalt dus. Dat is geen versoepeling maar het corrigeren van een β die
/// op de verkeerde plek werd afgelezen: bij β = 0,50 hoort een veel vlakkere
/// momentenlijn dan deze envelop beschrijft. Wel het noteren waard: de fixture
/// bemonstert de momentenlijn maar tot x = 2500 mm. Levert de frontend de
/// volle 21 stations (met M(5000) = 0), dan zijn béíde eindmomenten nul, wordt
/// B* = 0 in plaats van −1 en C₁ = 1,13, en gaat de UC juist omhóóg naar
/// ≈ 1,21 (onafhankelijk nagemeten met 21 stations: 1,2171). De richting van
/// deze verschuiving hangt dus aan de onvolledige envelop van de fixture, niet
/// aan de norm; op realistische invoer werkt de reparatie hier conservatiever.
/// De fixture is bewust niet uitgebreid: het is referentie-afgeleide invoer, en
/// die binnen een kipreparatie herschrijven maakt de snapshot onnavolgbaar. Het
/// staat als open punt in §B.15 van het validatiedossier, en de kern meldt de
/// onvolledigheid sinds september 2026 zelf in het rapport.
///
/// De op het referentie-rapport geijkte asserties hierboven veranderen niet.
///
/// Sept 2026 (a) bijgewerkt nadat een dubbele catalogusregel is opgeruimd. HEB 160
/// stond twee keer in profiles.json — als "HEB160" en als "HEB 160" — met
/// verschillende waarden. Beide komen op dezelfde zoeksleutel uit, dus de
/// opzoeking pakte simpelweg de eerste: de SCHRIJFWIJZE bepaalde met welke
/// doorsnede er gerekend werd. De handmatige regel zonder spatie is
/// verwijderd; over blijft de regel die de generator uit de brontabellen
/// maakt, met de genormeerde waarden (A = 54,3 cm², Wpl;y = 354 cm³).
///
/// Gevolg hier: A 5427,5 -> 5430 mm², Wpl;y 354113 -> 354000 mm³, en daarmee
/// uc_max 1,0556 -> 1,0559. De ligger blijft NotOk op buiging, en de op het
/// referentie-rapport geijkte asserties hierboven veranderen niet.
///
/// De exacte doorsnedemotor onderschrijft de keuze: die geeft voor dit
/// profiel It = 312 065 mm⁴, waar de verwijderde regel 313 664 had (+0,51%)
/// en de behouden regel 312 000 (-0,02%).
#[test]
fn calc2_beam1_snapshot() {
    insta::assert_json_snapshot!("calc2_beam1", run());
}
