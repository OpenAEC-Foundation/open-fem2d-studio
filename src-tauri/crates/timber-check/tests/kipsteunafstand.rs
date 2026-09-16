//! De kipsteunafstand van EN 1995-1-1 art. 6.3.3 komt tot in tabel 6.1 aan.
//!
//! Wat hier wordt vastgelegd. `ltb_segment_length_m` is de ℓ waaruit tabel 6.1
//! de meewerkende lengte l_ef maakt: l_ef = verhouding · ℓ, met 1,0 bij een
//! constant moment, 0,9 bij een gelijkmatig verdeelde belasting en 0,8 bij een
//! puntlast in het midden voor een ligger op twee steunpunten, en 0,5 / 0,8
//! voor een uitkraging. l_ef gaat daarna naar σ_m,crit van (6.32) en daarmee
//! naar k_crit van (6.33).
//!
//! Waarom dit een eigen test is. Het veld bestond al in de kern, maar de app
//! liet het altijd op nul staan — een houten ligger met tussensteunen tegen kip
//! werd dus altijd op de volle staaflengte getoetst. Nu de invoer er wél is,
//! moet vaststaan dat zij niet halverwege blijft hangen: dat de waarde
//! werkelijk door tabel 6.1 gaat, dat nul nog steeds op de staaflengte
//! terugvalt, en dat een kortere steunafstand de kiptoets daadwerkelijk
//! verlicht.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use timber_check::*;

const B_MM: f64 = 96.0;
const H_MM: f64 = 450.0;
const L_M: f64 = 6.0;

/// De waarde van grootheid `symbool` uit de kiptoets — uit `variables` of uit
/// `intermediate_values`, want σ_m,crit staat in de tweede lijst.
fn grootheid(r: &TimberBeamCheckResult, symbool: &str) -> f64 {
    let check = r
        .checks
        .iter()
        .find(|c| c.id == "6.3.3_beam_stability")
        .expect("de kiptoets hoort erbij te staan");
    let (vars, tussen) = match &check.kind {
        CheckKind::Resistance(x) => (&x.variables, None),
        CheckKind::Stability(x) => (&x.variables, Some(&x.intermediate_values)),
    };
    vars.iter()
        .chain(tussen.into_iter().flatten())
        .find(|v| v.symbol == symbool)
        .unwrap_or_else(|| panic!("grootheid {symbool} ontbreekt in de kiptoets"))
        .value
}

fn uc_kip(r: &TimberBeamCheckResult) -> f64 {
    let check = r
        .checks
        .iter()
        .find(|c| c.id == "6.3.3_beam_stability")
        .expect("de kiptoets hoort erbij te staan");
    match &check.kind {
        CheckKind::Resistance(x) => x.uc.as_ref().expect("UC aanwezig").uc,
        CheckKind::Stability(x) => x.uc.as_ref().expect("UC aanwezig").uc,
    }
}

/// Een vrij opgelegde ligger met alleen een veldmoment: geen druk, zodat
/// (6.33) de maatgevende vorm is en l_ef als enige aan de knop zit.
fn ligger(segment_m: f64, l_ef_override_m: f64) -> TimberBeamCheckResult {
    check_timber_beam(TimberBeamCheckInput {
        bijlage: Default::default(),
        beam_id: 1,
        width_mm: B_MM,
        height_mm: H_MM,
        custom_section: None,
        strength_class: "C24".to_string(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        load_duration_per_combination: vec![],
        length_m: L_M,
        forces_envelope: vec![ForcePoint {
            combination_id: 1,
            position_mm: 3000.0,
            forces: InternalForces { my_ed: 40.0, ..Default::default() },
        }],
        buckling_length_y_m: L_M,
        buckling_length_z_m: L_M,
        lateral_bracing: None,
        ltb_segment_length_m: segment_m,
        ltb_load_case: nen_en_1995_1_1::stability::LtbLoadCase::UniformLoad,
        ltb_load_position: nen_en_1995_1_1::stability::LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: l_ef_override_m,
        perform_ltb_check: true,
        k_cr: 1.0,
        load_sharing: false,
        deflection_inst_mm: 0.0,
        deflection_quasi_perm_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
        deflection_notes: vec![],
        staaf_notities: None,
        width_end_mm: None,
        height_end_mm: None,
    })
}

/// Handberekening: zonder kipsteunafstand is ℓ de staaflengte, en tabel 6.1
/// geeft bij een gelijkmatig verdeelde belasting op twee steunpunten
/// l_ef = 0,9 · 6000 = 5400 mm.
#[test]
fn nul_valt_terug_op_de_staaflengte() {
    assert_relative_eq!(grootheid(&ligger(0.0, 0.0), r"l_{ef}"), 5400.0, max_relative = 1e-9);
}

/// Handberekening: met vier tussensteunen op een ligger van 6 m is de
/// steunafstand 1,2 m, en tabel 6.1 geeft l_ef = 0,9 · 1200 = 1080 mm.
///
/// Dit is de kern van de zaak: de opgegeven afstand gaat ECHT door tabel 6.1
/// heen en wordt niet ergens onderweg door de staaflengte vervangen.
#[test]
fn de_opgegeven_kipsteunafstand_gaat_door_tabel_6_1() {
    assert_relative_eq!(grootheid(&ligger(1.2, 0.0), r"l_{ef}"), 1080.0, max_relative = 1e-9);
}

/// σ_m,crit = 0,78·b²/(h·l_ef)·E_0,05 is omgekeerd evenredig met l_ef, dus een
/// vijf keer kortere steunafstand hoort een vijf keer hogere kritieke
/// buigspanning te geven — en daarmee een lichtere kiptoets.
///
/// Handberekening met C24 (E_0,05 = 7400 N/mm²), b = 96 mm, h = 450 mm:
///   l_ef = 5400 mm → σ_m,crit = 0,78 · 96² / (450 · 5400) · 7400 = 21,88 N/mm²
///   l_ef = 1080 mm → σ_m,crit = 0,78 · 96² / (450 · 1080) · 7400 = 109,4 N/mm²
#[test]
fn een_kortere_steunafstand_verlicht_de_kiptoets() {
    let vol = ligger(0.0, 0.0);
    let kort = ligger(1.2, 0.0);

    let s_vol = grootheid(&vol, r"\sigma_{m,crit}");
    let s_kort = grootheid(&kort, r"\sigma_{m,crit}");
    assert_relative_eq!(s_vol, 21.88, max_relative = 2e-3);
    assert_relative_eq!(s_kort, 109.4, max_relative = 2e-3);
    assert_relative_eq!(s_kort / s_vol, 5.0, max_relative = 1e-9);

    assert!(
        uc_kip(&kort) < uc_kip(&vol),
        "een kortere kipsteunafstand hoort de unity check te verlagen: {} tegenover {}",
        uc_kip(&kort),
        uc_kip(&vol)
    );
}

/// De expliciete l_ef blijft winnen van de steunafstand: wie een externe
/// referentieberekening naloopt met een eigen l_ef, mag niet stilzwijgend door
/// tabel 6.1 worden overruled.
#[test]
fn een_expliciete_l_ef_wint_van_de_steunafstand() {
    assert_relative_eq!(grootheid(&ligger(1.2, 1.268), r"l_{ef}"), 1268.0, max_relative = 1e-9);
}
