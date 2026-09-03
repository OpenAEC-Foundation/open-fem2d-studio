//! Kip van een holle doorsnede — de tak die tabel 6.5 niet kent.
//!
//! De kipreparatie van 3 september 2026 verving een vaste α_LT = 0,34 door de
//! keuze uit tabel 6.5. Die tabel heeft precies twee rijen: gewalste en
//! gelaste I-profielen. Kokers en buizen staan er niet in, en vallen in
//! [`Kipprofiel::Overig`] → kromme d → α_LT = 0,76. Dat is een expliciete
//! veilig-zijdige keuze buiten de tabel om, geen normwaarde — en zij is met de
//! reparatie ongemeten doorgevoerd. Deze test dekt haar alsnog.
//!
//! Waarom het in de praktijk weinig uitmaakt en toch getest hoort te worden:
//! een vierkante koker heeft I_z ≈ I_y en een hoge I_t, dus λ_LT blijft ruim
//! onder 0,4 en χ_LT = 1,0 — de kipkromme raakt de uitkomst dan helemaal niet.
//! Pas bij zeer grote overspanningen komt λ_LT boven 0,4 en gaat de kromme
//! meetellen. Beide regimes staan hieronder.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use steel_check::*;

/// Vierkante koker HFRHS200X200X16 (h/b = 1,0), vrij opgelegd onder een
/// gelijkmatig verdeelde belasting, over `l_m` meter.
fn koker(l_m: f64, q_n_per_mm: f64) -> BeamCheckResult {
    let envelop: Vec<ForcePoint> = (0..21)
        .map(|i| {
            let x_m = l_m * i as f64 / 20.0;
            ForcePoint {
                combination_id: 1,
                position_mm: x_m * 1000.0,
                forces: InternalForces {
                    my_ed: q_n_per_mm * x_m * (l_m - x_m) / 2.0,
                    vz_ed: q_n_per_mm * (l_m / 2.0 - x_m),
                    ..Default::default()
                },
            }
        })
        .collect();

    check_beam(BeamCheckInput {
        beam_id: 1,
        profile_name: "HFRHS200X200X16".to_string(),
        steel_grade: "S235".to_string(),
        length_m: l_m,
        forces_envelope: envelop,
        lateral_bracing: LateralBracing {
            top_flange_positions: vec![],
            bottom_flange_positions: vec![],
        },
        buckling_length_y_m: l_m,
        buckling_length_z_m: l_m,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        q_equiv_n_per_mm: q_n_per_mm,
        // Belasting op de bovenflens: z_a = h/2 = 100 mm (destabiliserend).
        z_a_mm: 100.0,
        custom_section: None,
    })
}

fn kip(r: &BeamCheckResult) -> &nen_en_1993_1_1_stability::StabilityCalc {
    let c = r.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(s) = &c.kind else { panic!("kip hoort stabiliteit te zijn") };
    s
}

fn tussenwaarde(r: &BeamCheckResult, sym: &str) -> f64 {
    kip(r)
        .intermediate_values
        .iter()
        .find(|v| v.symbol == sym)
        .unwrap_or_else(|| panic!("tussenwaarde '{sym}' ontbreekt"))
        .value
}

#[test]
fn een_koker_krijgt_kromme_d_want_tabel_6_5_kent_hem_niet() {
    let r = koker(10.0, 20.0);
    assert_relative_eq!(tussenwaarde(&r, r"\alpha_{LT}"), 0.76, max_relative = 1e-12);
}

#[test]
fn de_notitie_claimt_geen_tabelrij_die_niet_bestaat() {
    // Dit is de kloof tussen commentaar en code die de reparatie zelf moest
    // dichten, en die daarna in de rapporttekst terugkwam: de notitie zei
    // onvoorwaardelijk "volgens tabel 6.5", ook voor een doorsnede waarvoor
    // die tabel geen rij heeft. De tekst hoort de keuze als keuze te benoemen.
    let r = koker(10.0, 20.0);
    let n = &kip(&r).notes;
    assert!(
        n.iter().any(|s| s.contains("kent voor deze doorsnede geen rij")),
        "verwachtte een notitie dat tabel 6.5 deze doorsnede niet noemt; genoteerd: {n:?}"
    );
    assert!(
        !n.iter().any(|s| s.contains("→ kipkromme d volgens tabel 6.5")),
        "de notitie mag geen tabelrij aanhalen die niet bestaat; genoteerd: {n:?}"
    );
}

#[test]
fn bij_een_normale_overspanning_bijt_de_kipkromme_niet() {
    // λ_LT < 0,4 → χ_LT = 1,0 (art. 6.3.2.3(1)); de kromme doet dan niet mee.
    // Voor een gesloten koker is dat het gewone geval, en het is de reden dat
    // de overgang van kromme b naar d in de praktijk zelden zichtbaar wordt.
    let r = koker(10.0, 20.0);
    assert!(tussenwaarde(&r, r"\bar{\lambda}_{LT}") < 0.4);
    assert_relative_eq!(tussenwaarde(&r, r"\chi_{LT}"), 1.0, max_relative = 1e-12);
}

#[test]
fn bij_een_zeer_grote_overspanning_telt_de_kromme_wel_mee() {
    // Pas hier komt λ_LT boven 0,4 en gaat α_LT = 0,76 de χ_LT verlagen ten
    // opzichte van de 0,34 die er vóór de reparatie vast stond. De richting is
    // veilig-zijdig: χ_LT met kromme d ligt onder die met kromme b.
    let r = koker(40.0, 2.0);
    let lambda = tussenwaarde(&r, r"\bar{\lambda}_{LT}");
    assert!(lambda > 0.4, "λ_LT = {lambda} moet hier boven 0,4 uitkomen");

    let chi_d = tussenwaarde(&r, r"\chi_{LT}");
    let chi_b = {
        let phi = 0.5 * (1.0 + 0.34 * (lambda - 0.4) + 0.75 * lambda.powi(2));
        (1.0 / (phi + (phi.powi(2) - 0.75 * lambda.powi(2)).sqrt()))
            .min(1.0)
            .min(1.0 / lambda.powi(2))
    };
    assert!(
        chi_d < chi_b,
        "kromme d hoort een lagere χ_LT te geven dan de oude vaste kromme b: \
         {chi_d} tegen {chi_b}"
    );
}
