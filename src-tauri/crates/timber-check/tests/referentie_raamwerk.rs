//! Acceptatietest: beide staven uit de referentie-uitwerking (houten
//! raamwerk, C24 96 x 450, klimaatklasse 1, duurklasse middellang).
//!
//! Model: schuine kolom (staaf 1, L = 3313 mm) + ligger (staaf 2,
//! L = 6342 mm) met q = 15 kN/m; UGT-combinatie 1.2 (6.10a, scheefstand −X),
//! geometrisch niet-lineair. UC-tabel van de referentie:
//!
//!   staaf 1: 6.1.4 → 0,17; 6.1.7 → 0,29; 6.3.2 → 1,74;
//!            doorbuiging 0,52 / 0,26
//!   staaf 2: 6.1.4 → 0,10; 6.1.7 → 1,07; 6.3.2 → 1,64;
//!            6.3.3 → 2,40 (maatgevend); doorbuiging 1,55 / 0,77

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use timber_check::*;

fn uc_van(r: &TimberBeamCheckResult, id: &str) -> f64 {
    let check = r.checks.iter().find(|c| c.id == id).unwrap_or_else(|| {
        panic!(
            "toets '{id}' ontbreekt; aanwezig: {:?}",
            r.checks.iter().map(|c| c.id.as_str()).collect::<Vec<_>>()
        )
    });
    match &check.kind {
        CheckKind::Resistance(x) => x.uc.as_ref().expect("UC aanwezig").uc,
        CheckKind::Stability(x) => x.uc.as_ref().expect("UC aanwezig").uc,
    }
}

fn punt(x_mm: f64, n: f64, vz: f64, my: f64) -> ForcePoint {
    ForcePoint {
        combination_id: 12, // combinatie 1.2 uit de referentie
        position_mm: x_mm,
        forces: InternalForces { n_ed: n, vz_ed: vz, my_ed: my, ..Default::default() },
    }
}

fn basis(beam_id: u32) -> TimberBeamCheckInput {
    TimberBeamCheckInput {
        beam_id,
        width_mm: 96.0,
        height_mm: 450.0,
        strength_class: "C24".to_string(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        length_m: 0.0,
        forces_envelope: vec![],
        buckling_length_y_m: 0.0,
        buckling_length_z_m: 0.0,
        ltb_segment_length_m: 0.0,
        ltb_load_case: nen_en_1995_1_1::stability::LtbLoadCase::UniformLoad,
        ltb_load_position: nen_en_1995_1_1::stability::LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: 0.0,
        perform_ltb_check: true,
        k_cr: 1.0, // referentie rekent met de volle breedte
        load_sharing: false,
        deflection_inst_mm: 0.0,
        deflection_quasi_perm_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
    }
}

/// Staaf 2 — de ligger (knoop 2 → 3), envelopkrachten van combinatie 1.2.
fn ligger() -> TimberBeamCheckResult {
    let input = TimberBeamCheckInput {
        length_m: 6.342,
        forces_envelope: vec![
            // oplegging knoop 2: maximale dwarskracht + steunpuntsmoment
            punt(0.0, -57.64, 75.568, -67.176),
            // x = 1034 mm: maatgevend drukpunt uit de referentie
            punt(1034.0, -57.64, 54.384, 0.0),
            // x = 3688 mm: maatgevend veldmoment
            punt(3688.0, -57.64, 0.0, 72.170),
            // oplegging knoop 3
            punt(6342.0, -57.64, -54.488, -0.515),
        ],
        buckling_length_y_m: 6.342, // systeemlengte
        buckling_length_z_m: 1.268, // kipsteunafstand (4 steunen, 5 velden)
        ltb_segment_length_m: 1.268,
        // De referentie rekent feitelijk met l_ef = 1268 mm (= de
        // kipsteunafstand; haar afgedrukte tabel 6.1-bewerking is
        // rekenkundig inconsistent) — daarom hier expliciet opgegeven.
        ltb_effective_length_override_m: 1.268,
        deflection_inst_mm: -24.5,
        deflection_quasi_perm_mm: -24.5,
        deflection_permanent_mm: -24.5,
        ..basis(2)
    };
    check_timber_beam(input)
}

/// Staaf 1 — de schuine kolom (knoop 1 → 2), combinatie 1.2.
fn kolom() -> TimberBeamCheckResult {
    let input = TimberBeamCheckInput {
        length_m: 3.313,
        forces_envelope: vec![
            punt(0.0, -93.532, -20.125, -0.143),
            punt(3313.0, -92.812, 20.463, -66.964),
        ],
        buckling_length_y_m: 3.313,
        buckling_length_z_m: 3.313, // geen zijdelingse steunen
        // De referentie voert §6.3.3 alleen voor de ligger uit; voor de
        // kolom rapporteert zij uitsluitend §6.3.2.
        perform_ltb_check: false,
        deflection_inst_mm: -4.3,
        deflection_quasi_perm_mm: -4.3,
        deflection_permanent_mm: -4.3,
        ..basis(1)
    };
    check_timber_beam(input)
}

#[test]
fn ligger_doorsnedetoetsen() {
    let r = ligger();
    // art. 6.1.4: sigma = 1,33/12,92 → UC 0,10.
    assert_relative_eq!(uc_van(&r, "6.1.4_compression"), 0.10, max_relative = 4e-2);
    // art. 6.1.7: tau = 2,62/2,46 → UC 1,07.
    assert_relative_eq!(uc_van(&r, "6.1.7_shear"), 1.07, max_relative = 5e-3);
}

#[test]
fn ligger_stabiliteitstoetsen() {
    let r = ligger();
    // art. 6.3.2 (6.23): UC 1,64.
    assert_relative_eq!(uc_van(&r, "6.3.2_column_stability"), 1.64, max_relative = 5e-3);
    // art. 6.3.3 (6.35): UC 2,40 — maatgevend.
    assert_relative_eq!(uc_van(&r, "6.3.3_beam_stability"), 2.40, max_relative = 5e-3);
}

#[test]
fn ligger_doorbuiging() {
    let r = ligger();
    // w_fin = −39,2 mm; L/250 = 25,4 → UC 1,55.
    assert_relative_eq!(uc_van(&r, "deflection_w_fin"), 1.55, max_relative = 5e-3);
    // w_add = −14,7 mm; L/333 = 19 → UC 0,77.
    assert_relative_eq!(uc_van(&r, "deflection_w_add"), 0.77, max_relative = 5e-3);
}

#[test]
fn ligger_maatgevend_is_de_kiptoets() {
    let r = ligger();
    assert_eq!(r.governing_check_id, "6.3.3_beam_stability");
    assert_relative_eq!(r.uc_max, 2.40, max_relative = 5e-3);
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_eq!(r.section_name, "96 x 450");
    assert_eq!(r.strength_class, "C24");
}

#[test]
fn kolom_toetsen() {
    let r = kolom();
    // art. 6.1.4: N = 93,5 kN → UC 0,17.
    assert_relative_eq!(uc_van(&r, "6.1.4_compression"), 0.17, max_relative = 3e-2);
    // art. 6.1.7: V = 20,46 kN → UC 0,29.
    assert_relative_eq!(uc_van(&r, "6.1.7_shear"), 0.29, max_relative = 1e-2);
    // art. 6.3.2 (6.24 maatgevend): UC 1,74.
    assert_relative_eq!(uc_van(&r, "6.3.2_column_stability"), 1.74, max_relative = 5e-3);
    // Doorbuiging: 0,52 / 0,26.
    assert_relative_eq!(uc_van(&r, "deflection_w_fin"), 0.52, max_relative = 1e-2);
    assert_relative_eq!(uc_van(&r, "deflection_w_add"), 0.26, max_relative = 1e-2);
    // Maatgevend: 6.3.2.
    assert_eq!(r.governing_check_id, "6.3.2_column_stability");
    assert_relative_eq!(r.uc_max, 1.74, max_relative = 5e-3);
    assert_eq!(r.status, CheckStatus::NotOk);
}

#[test]
fn trektoets_niet_van_toepassing_in_dit_raamwerk() {
    // Beide staven staan overal op druk; de trektoets telt niet mee in uc_max.
    for r in [ligger(), kolom()] {
        let trek = r.checks.iter().find(|c| c.id == "6.1.2_tension").expect("trektoets aanwezig");
        let CheckKind::Resistance(t) = &trek.kind else { panic!("trektoets is een ResistanceCalc") };
        assert_eq!(t.status, CheckStatus::NotApplicable);
    }
}

#[test]
fn onbekende_sterkteklasse_geeft_foutresultaat() {
    let input = TimberBeamCheckInput {
        strength_class: "X99".to_string(),
        length_m: 1.0,
        ..basis(9)
    };
    let r = check_timber_beam(input);
    assert!(r.governing_check_id.starts_with("ERROR"));
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty());
}
