//! Regressietest bij bevinding B4 — kipsteunen tellen alleen mee aan de
//! GEDRUKTE flens.
//!
//! Kip is uitknikken van de gedrukte flens; een steun aan de getrokken flens
//! houdt die knik niet tegen. Welke flens gedrukt is volgt uit het teken van
//! M_y: de kern rekent M_y positief = trek in de onderste vezel (`mechanics`),
//! dus sagging drukt de bovenflens en hogging de onderflens.
//!
//! Tot deze reparatie las `unbraced_length_mm` uitsluitend
//! `top_flange_positions`, met als eerste regel een kortsluiting op "is die
//! vector leeg, dan is L_st de hele staaflengte". `bottom_flange_positions`
//! werd door de frontend wél gevuld (UI-sectie "Kipsteunen onderflens") maar
//! aan de Rust-kant nooit gelezen. Het geval R17 uit de validatiecampagne —
//! bovenflenssteun halverwege, windzuiging met hogging — rekende daardoor met
//! de halve kiplengte en kwam ongeveer 20 % te gunstig uit.
//!
//! Vier gevallen, alle vier op dezelfde staaf: alleen het teken van het moment
//! en de flens waaraan de steun zit, verschillen.
//!
//! | moment  | steun aan  | L_st vóór | L_st na  | wat er mis was            |
//! |---------|------------|-----------|----------|---------------------------|
//! | sagging | bovenflens | 5000      | 5000     | (was al goed)             |
//! | sagging | onderflens | 10 000    | 10 000   | (was al goed)             |
//! | hogging | bovenflens | 5000      | 10 000   | steunde de getrokken flens|
//! | hogging | onderflens | 10 000    | 5000     | steun werd niet gelezen   |

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use steel_check::*;

const L_MM: f64 = 10_000.0;
const M_MAX_KNM: f64 = 150.0;

/// IPE 400 van 10 m onder een paraboolvormige momentenlijn met een top van
/// 150 kNm in het midden en nul aan beide einden, bemonsterd op 21 stations.
///
/// `teken` = +1 levert sagging, −1 dezelfde lijn gespiegeld (hogging).
/// Één kipsteun halverwege, aan de flens die `aan_de_bovenflens` aangeeft.
fn ligger(teken: f64, aan_de_bovenflens: bool) -> BeamCheckResult {
    let envelop: Vec<ForcePoint> = (0..21)
        .map(|i| {
            let x = L_MM * i as f64 / 20.0;
            let my = teken * M_MAX_KNM * 4.0 * (x / L_MM) * (1.0 - x / L_MM);
            ForcePoint {
                combination_id: 1,
                position_mm: x,
                forces: InternalForces { my_ed: my, ..Default::default() },
            }
        })
        .collect();

    let bracing = if aan_de_bovenflens {
        LateralBracing { top_flange_positions: vec![0.5], bottom_flange_positions: vec![] }
    } else {
        LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![0.5] }
    };

    check_beam(BeamCheckInput {
        beam_id: 1,
        profile_name: "IPE 400".to_string(),
        steel_grade: "S235".to_string(),
        length_m: L_MM / 1000.0,
        forces_envelope: envelop,
        lateral_bracing: bracing,
        buckling_length_y_m: 10.0,
        buckling_length_z_m: 10.0,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        // q = 8·M_max/L² = 8·150/10² = 12 kN/m ≡ 12 N/mm.
        q_equiv_n_per_mm: 12.0,
        z_a_mm: 200.0,
        custom_section: None,
    })
}

fn tussenwaarde(r: &BeamCheckResult, sym: &str) -> f64 {
    let c = r.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(s) = &c.kind else { panic!("kip hoort stabiliteit te zijn") };
    s.intermediate_values
        .iter()
        .find(|v| v.symbol == sym)
        .unwrap_or_else(|| panic!("tussenwaarde '{sym}' ontbreekt"))
        .value
}

fn kip_uc(r: &BeamCheckResult) -> f64 {
    let c = r.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(s) = &c.kind else { unreachable!() };
    s.uc.as_ref().expect("UC").uc
}

#[test]
fn sagging_leest_de_bovenflenssteun() {
    // M_y > 0 → bovenflens gedrukt. De steun halverwege telt: twee velden van
    // 5000 mm. Dit was al goed en moet goed blijven.
    let r = ligger(1.0, true);
    assert_relative_eq!(tussenwaarde(&r, "L_{st}"), 5000.0, max_relative = 1e-9);
}

#[test]
fn sagging_negeert_de_onderflenssteun() {
    // M_y > 0 → bovenflens gedrukt, maar de steun zit aan de ONDERflens.
    // Die steunt de getrokken flens en telt dus niet mee: één veld van
    // 10 000 mm. Dit is tevens de test die "voeg de twee vectoren gewoon
    // samen" uitsluit — dan zou hier 5000 mm uitkomen.
    let r = ligger(1.0, false);
    assert_relative_eq!(tussenwaarde(&r, "L_{st}"), 10_000.0, max_relative = 1e-9);
}

#[test]
fn hogging_negeert_de_bovenflenssteun() {
    // Het geval R17. M_y < 0 → ONDERflens gedrukt, maar de steun zit aan de
    // bovenflens. Vóór de reparatie las de kern die vector toch en kwam op
    // L_st = 5000 mm; correct is 10 000 mm — de gedrukte flens is over de
    // volle lengte ongesteund.
    let goed = ligger(-1.0, true);
    assert_relative_eq!(tussenwaarde(&goed, "L_{st}"), 10_000.0, max_relative = 1e-9);

    // En het maakt uit: met de oude, te korte kiplengte (het sagginggeval,
    // dat wél 5000 mm mag rekenen) valt de UC merkbaar gunstiger uit.
    let te_gunstig = ligger(1.0, true);
    assert!(
        kip_uc(&goed) > kip_uc(&te_gunstig) * 1.1,
        "de ongesteunde gedrukte flens hoort een merkbaar hogere UC te geven: \
         {} tegen {}",
        kip_uc(&goed),
        kip_uc(&te_gunstig)
    );
}

#[test]
fn hogging_leest_de_onderflenssteun() {
    // M_y < 0 → onderflens gedrukt, en daar zit de steun. Twee velden van
    // 5000 mm. Vóór de reparatie werd `bottom_flange_positions` nergens
    // gelezen en kwam hier 10 000 mm uit — te conservatief, maar even fout.
    let r = ligger(-1.0, false);
    assert_relative_eq!(tussenwaarde(&r, "L_{st}"), 5000.0, max_relative = 1e-9);
}

#[test]
fn een_gesteunde_ligger_krijgt_de_l_kip_formule_en_niet_l_st() {
    // NB.NB.4.3, de tegenhanger van het gaffelgeval in tests/kip_ipe330_r16.rs:
    // zodra er een kipsteun IS, ligt elk veld tussen een gaffel en een
    // kipsteun of tussen twee kipsteunen, en geldt L_kip = (1,4 − 0,8·β)·L_st
    // met 1,0 ≤ L_kip/L_st ≤ 1,4.
    //
    // Het gesteunde veld loopt hier van x = 0 tot x = 5000 met eindmomenten 0
    // en ±150 kNm, dus β = 0 en L_kip = 1,4·5000 = 7000 mm. Dezelfde 5000 mm
    // tussen twee gaffels zou 5000 mm geven — 40 % korter en een navenant
    // hogere M_cr.
    for r in [ligger(1.0, true), ligger(-1.0, false)] {
        let l_st = tussenwaarde(&r, "L_{st}");
        let l_kip = tussenwaarde(&r, "L_{kip}");
        let beta = tussenwaarde(&r, r"\beta");
        assert_relative_eq!(l_st, 5000.0, max_relative = 1e-9);
        assert_relative_eq!(beta, 0.0, epsilon = 1e-12);
        assert_relative_eq!(l_kip, 7000.0, max_relative = 1e-9);
        let verwacht = ((1.4 - 0.8 * beta).clamp(1.0, 1.4)) * l_st;
        assert_relative_eq!(l_kip, verwacht, max_relative = 1e-12);
    }

    // Het ongesteunde geval daarentegen ligt tussen twee gaffels: L_kip = L_st.
    let ongesteund = ligger(-1.0, true);
    assert_relative_eq!(tussenwaarde(&ongesteund, "L_{kip}"), 10_000.0, max_relative = 1e-9);
    assert_relative_eq!(tussenwaarde(&ongesteund, "L_{st}"), 10_000.0, max_relative = 1e-9);
}
