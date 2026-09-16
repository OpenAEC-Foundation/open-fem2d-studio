//! Kiptoets aan/uit en het aangrijpingspunt van de belasting komen tot in het
//! resultaat — en k_cr staat altijd met bron in de dwarskrachttoets.
//!
//! Waarom deze test bestaat. `perform_ltb_check`, `ltb_load_position` en
//! `k_cr` bestonden al in de invoer, maar sinds september 2026 zijn het keuzen
//! van de gebruiker (`checkConfig` in de app, `check_config` via MCP). Drie
//! dingen moeten dan vaststaan:
//!
//!  - kiptoets UIT laat de toets niet stil verdwijnen: zij staat als
//!    `NotApplicable` in het resultaat, zonder UC en mét de reden
//!    (art. 6.3.3(5): gedrukte rand doorgaand gesteund, k_crit = 1,0), en de
//!    maatgevende toets komt dan van elders;
//!  - een last aan de DRUKzijde maakt l_ef 2h langer (tabel 6.1, voetnoot a),
//!    aan de TREKzijde 0,5h korter, en de notitie bij de kiptoets zegt dat;
//!  - de dwarskrachttoets noemt k_cr met bron, óók bij 1,0 — tot september
//!    2026 zweeg 1,0, en dan kon een lezer NB-waarde en Europese aanbeveling
//!    niet uit elkaar houden.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1995_1_1::stability::{LtbLoadCase, LtbLoadPosition};
use nen_en_1995_1_1::{CheckStatus, LoadDurationClass, ServiceClass};
use timber_check::*;

const B_MM: f64 = 96.0;
const H_MM: f64 = 450.0;
const L_M: f64 = 6.0;

fn toets<'a>(r: &'a TimberBeamCheckResult, id: &str) -> &'a NamedCheck {
    r.checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("toets {id} ontbreekt in {:?}", r.checks.iter().map(|c| &c.id).collect::<Vec<_>>()))
}

fn notes(c: &NamedCheck) -> &Vec<String> {
    match &c.kind {
        CheckKind::Resistance(x) => &x.notes,
        CheckKind::Stability(x) => &x.notes,
    }
}

fn status(c: &NamedCheck) -> &CheckStatus {
    match &c.kind {
        CheckKind::Resistance(x) => &x.status,
        CheckKind::Stability(x) => &x.status,
    }
}

fn uc(c: &NamedCheck) -> Option<f64> {
    match &c.kind {
        CheckKind::Resistance(x) => x.uc.as_ref().map(|u| u.uc),
        CheckKind::Stability(x) => x.uc.as_ref().map(|u| u.uc),
    }
}

fn grootheid(c: &NamedCheck, symbool: &str) -> f64 {
    let (vars, tussen) = match &c.kind {
        CheckKind::Resistance(x) => (&x.variables, None),
        CheckKind::Stability(x) => (&x.variables, Some(&x.intermediate_values)),
    };
    vars.iter()
        .chain(tussen.into_iter().flatten())
        .find(|v| v.symbol == symbool)
        .unwrap_or_else(|| panic!("grootheid {symbool} ontbreekt"))
        .value
}

/// Een vrij opgelegde ligger met veldmoment én dwarskracht, zodat kip en
/// dwarskracht allebei een echte UC hebben.
fn ligger(kip: bool, positie: LtbLoadPosition, k_cr: f64) -> TimberBeamCheckResult {
    check_timber_beam(TimberBeamCheckInput {
        beam_id: 1,
        width_mm: B_MM,
        height_mm: H_MM,
        custom_section: None,
        strength_class: "C24".to_string(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        load_duration_per_combination: vec![],
        length_m: L_M,
        forces_envelope: vec![
            ForcePoint {
                combination_id: 1,
                position_mm: 0.0,
                forces: InternalForces { vz_ed: 30.0, ..Default::default() },
            },
            ForcePoint {
                combination_id: 1,
                position_mm: 3000.0,
                forces: InternalForces { my_ed: 40.0, ..Default::default() },
            },
        ],
        buckling_length_y_m: L_M,
        buckling_length_z_m: L_M,
        lateral_bracing: None,
        ltb_segment_length_m: 0.0,
        ltb_load_case: LtbLoadCase::UniformLoad,
        ltb_load_position: positie,
        ltb_effective_length_override_m: 0.0,
        perform_ltb_check: kip,
        k_cr,
        load_sharing: false,
        deflection_inst_mm: 0.0,
        deflection_quasi_perm_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
        deflection_notes: vec![],
        staaf_notities: None,
    })
}

/// Kiptoets uit: de toets staat er wél, als niet van toepassing, zonder UC en
/// met de reden. De maatgevende toets is dan een andere, en uc_max blijft
/// een echte uitkomst (geen 0 uit de overgeslagen toets).
#[test]
fn kiptoets_uit_staat_als_niet_van_toepassing_met_reden() {
    let aan = ligger(true, LtbLoadPosition::CentreOfGravity, 1.0);
    let uit = ligger(false, LtbLoadPosition::CentreOfGravity, 1.0);

    let kip = toets(&uit, "6.3.3_beam_stability");
    assert!(matches!(status(kip), CheckStatus::NotApplicable), "{:?}", status(kip));
    assert!(uc(kip).is_none(), "een overgeslagen toets heeft geen UC");
    let tekst = notes(kip).join(" ");
    assert!(tekst.contains("overgeslagen"), "{tekst}");
    assert!(tekst.contains("6.3.3(5)"), "{tekst}");
    assert!(tekst.contains("zijdelings gesteund"), "{tekst}");

    // Aan: de kiptoets is maatgevend (l_ef = 5400 mm op C24 96×450 met
    // 40 kNm geeft k_crit < 1). Uit: iets anders wordt maatgevend, en het
    // aantal toetsen is gelijk — er verdwijnt niets uit de lijst.
    assert_eq!(aan.governing_check_id, "6.3.3_beam_stability");
    assert_ne!(uit.governing_check_id, "6.3.3_beam_stability");
    assert_eq!(aan.checks.len(), uit.checks.len());
    assert!(uit.uc_max > 0.0 && uit.uc_max < aan.uc_max, "{} < {}", uit.uc_max, aan.uc_max);
}

/// Tabel 6.1, voetnoot a: drukzijde l_ef + 2h, trekzijde l_ef − 0,5h.
/// Handberekening met ℓ = 6000 mm, h = 450 mm, gelijkmatig verdeeld (0,9):
///   zwaartepunt 5400 mm; drukzijde 5400 + 900 = 6300 mm; trekzijde
///   5400 − 225 = 5175 mm. De UC volgt l_ef: drukzijde het hoogst.
#[test]
fn lastpositie_verschuift_l_ef_en_de_uc_in_de_verwachte_richting() {
    let zp = ligger(true, LtbLoadPosition::CentreOfGravity, 1.0);
    let druk = ligger(true, LtbLoadPosition::CompressionEdge, 1.0);
    let trek = ligger(true, LtbLoadPosition::TensionEdge, 1.0);

    let l = |r: &TimberBeamCheckResult| grootheid(toets(r, "6.3.3_beam_stability"), r"l_{ef}");
    assert_relative_eq!(l(&zp), 5400.0, max_relative = 1e-9);
    assert_relative_eq!(l(&druk), 6300.0, max_relative = 1e-9);
    assert_relative_eq!(l(&trek), 5175.0, max_relative = 1e-9);

    let u = |r: &TimberBeamCheckResult| uc(toets(r, "6.3.3_beam_stability")).expect("UC");
    assert!(u(&druk) > u(&zp), "drukzijde hoort zwaarder te toetsen: {} > {}", u(&druk), u(&zp));
    assert!(u(&trek) < u(&zp), "trekzijde hoort lichter te toetsen: {} < {}", u(&trek), u(&zp));

    // De notitie zegt hoe l_ef tot stand kwam, mét het aangrijpingspunt.
    let n = notes(toets(&druk, "6.3.3_beam_stability")).join(" ");
    assert!(n.contains("0,9 · 6000 + 2 · 450 = 6300 mm"), "{n}");
    assert!(n.contains("DRUKzijde"), "{n}");
    assert!(n.contains("staaflengte, terugval"), "{n}");
    let n = notes(toets(&trek, "6.3.3_beam_stability")).join(" ");
    assert!(n.contains("TREKzijde"), "{n}");
    let n = notes(toets(&zp, "6.3.3_beam_stability")).join(" ");
    assert!(n.contains("zwaartepunt"), "{n}");
}

/// b_ef = k_cr · b: τ en dus de UC schalen met 1/k_cr. Met 0,67 wordt de
/// dwarskracht-UC 1/0,67 = 1,493 keer zo hoog als met 1,0. En de notitie
/// noemt de waarde met bron — ook bij 1,0.
#[test]
fn k_cr_schaalt_de_dwarskracht_uc_en_staat_met_bron_in_de_notitie() {
    let nb = ligger(true, LtbLoadPosition::CentreOfGravity, 1.0);
    let eu = ligger(true, LtbLoadPosition::CentreOfGravity, 0.67);

    let uc_nb = uc(toets(&nb, "6.1.7_shear")).expect("UC");
    let uc_eu = uc(toets(&eu, "6.1.7_shear")).expect("UC");
    assert!(uc_nb > 0.0);
    assert_relative_eq!(uc_eu / uc_nb, 1.0 / 0.67, max_relative = 1e-9);
    assert_relative_eq!(grootheid(toets(&eu, "6.1.7_shear"), "k_{cr}"), 0.67, max_relative = 1e-12);

    let n_nb = notes(toets(&nb, "6.1.7_shear")).join(" ");
    assert!(n_nb.contains("k_cr = 1,00"), "{n_nb}");
    assert!(n_nb.contains("NB bij 6.1.7"), "{n_nb}");
    let n_eu = notes(toets(&eu, "6.1.7_shear")).join(" ");
    assert!(n_eu.contains("k_cr = 0,67"), "{n_eu}");
    assert!(n_eu.contains("opgegeven"), "{n_eu}");
    assert!(n_eu.contains("strenger"), "{n_eu}");
}
