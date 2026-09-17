//! Issue #23, de kern: een aangeleverde langeduurzakking w_qp,fin
//! (`deflection_quasi_perm_fin_mm`) bij massief hout en kruislaaghout.
//!
//! WAAROM
//! In een statisch onbepaalde constructie met delen van verschillend
//! kruipgedrag geldt de vereenvoudiging w_fin = w_inst + k_def·w_qp van
//! EN 1995-1-1 2.2.3(5) niet. 2.2.3(4) vraagt de langeduurvervorming onder de
//! quasi-blijvende combinatie met E_mean,fin (2.3.2.2(1), uitdrukking 2.7), en
//! daarbij de ogenblikkelijke vervorming door het verschil tussen de
//! karakteristieke en de quasi-blijvende combinatie:
//!   w_fin = w_qp,fin + (w_inst − w_qp) = w_inst + (w_qp,fin − w_qp).
//!
//! WAT DEZE TEST VASTLEGT
//! 1. Weglaten = exact de vereenvoudiging (alle toetsen bit-identiek aan
//!    dezelfde invoer zonder het veld).
//! 2. Met w_qp,fin: w_fin en w_add met de hand, de formule en de herkomst in de
//!    afleiding, en de andere toetsen onveranderd.
//! 3. Een niet-eindige w_qp,fin wordt geweigerd met reden.

use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use serde_json::{json, Value};
use steel_check::CheckKind;
use timber_check::clt::{check_clt_beam, CltBeamCheckInput};
use timber_check::{check_timber_beam, TimberBeamCheckInput};

fn punt(x_mm: f64, vz: f64, my: f64) -> Value {
    json!({
        "combination_id": 12,
        "position_mm": x_mm,
        "forces": { "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": vz, "mt_ed": 0.0, "my_ed": my, "mz_ed": 0.0 }
    })
}

/// C24 96 x 450 over 5 m, klimaatklasse 1 (k_def = 0,6).
/// w_inst = −8, w_qp = −5, w₁ = −3 mm.
fn hout() -> Value {
    json!({
        "beam_id": 3,
        "width_mm": 96.0,
        "height_mm": 450.0,
        "strength_class": "C24",
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "length_m": 5.0,
        "forces_envelope": [punt(0.0, 10.0, 0.0), punt(2500.0, 0.0, 12.0), punt(5000.0, -10.0, 0.0)],
        "buckling_length_y_m": 5.0,
        "buckling_length_z_m": 5.0,
        "deflection_inst_mm": -8.0,
        "deflection_quasi_perm_mm": -5.0,
        "deflection_permanent_mm": -3.0
    })
}

/// De vijflaagse CLT-plaat met k_def = 0,8; dezelfde zakkingen.
fn clt() -> Value {
    let laag = |t: f64, richting: &str| {
        json!({ "thickness_mm": t, "orientation": richting, "strength_class": "C24" })
    };
    json!({
        "beam_id": 7,
        "layup": {
            "width_mm": 1000.0,
            "layers": [
                laag(40.0, "Longitudinal"), laag(20.0, "Transverse"), laag(40.0, "Longitudinal"),
                laag(20.0, "Transverse"), laag(40.0, "Longitudinal")
            ]
        },
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "length_m": 5.0,
        "forces_envelope": [punt(0.0, 10.0, 0.0), punt(2500.0, 0.0, 20.0), punt(5000.0, -10.0, 0.0)],
        "k_def": 0.8,
        "k_def_bron": "opgave fabrikant (testwaarde)",
        "deflection_inst_mm": -8.0,
        "deflection_quasi_perm_mm": -5.0,
        "deflection_permanent_mm": -3.0
    })
}

fn met_fin(mut v: Value, w: Value) -> Value {
    v["deflection_quasi_perm_fin_mm"] = w;
    v
}

fn toets<'a>(checks: &'a [steel_check::NamedCheck], id: &str) -> &'a ResistanceCalc {
    match &checks.iter().find(|c| c.id == id).unwrap_or_else(|| panic!("{id} ontbreekt")).kind {
        CheckKind::Resistance(r) => r,
        CheckKind::Stability(_) => panic!("{id} is een weerstandstoets"),
    }
}

#[test]
fn weglaten_is_de_vereenvoudiging_tot_op_het_bit() {
    let zonder: TimberBeamCheckInput = serde_json::from_value(hout()).unwrap();
    let a = check_timber_beam(zonder);
    // Het veld expliciet op null zetten is hetzelfde als weglaten.
    let met_null: TimberBeamCheckInput = serde_json::from_value(met_fin(hout(), Value::Null)).unwrap();
    let b = check_timber_beam(met_null);
    assert_eq!(serde_json::to_string(&a).unwrap(), serde_json::to_string(&b).unwrap());
    // w_fin = −8 + 0,6·−5 = −11 mm.
    let fin = toets(&a.checks, "deflection_w_fin");
    assert!((fin.uc.as_ref().unwrap().ed - 11.0).abs() < 1e-12);
    assert_eq!(fin.formula_latex, r"w_{fin,z} = w_z + k_{def} \cdot w_{qp,z}");
}

#[test]
fn massief_hout_rekent_2_2_3_4_met_de_aangeleverde_w_qp_fin() {
    let zonder = check_timber_beam(serde_json::from_value(hout()).unwrap());
    // w_qp,fin = −9,5 mm (bijvoorbeeld: het houtveld kruipt in een gemengde
    // ligger harder dan (1 + k_def)·w_qp = −8 mm).
    let r = check_timber_beam(serde_json::from_value(met_fin(hout(), json!(-9.5))).unwrap());
    assert_ne!(r.status, CheckStatus::NotApplicable, "{}", r.governing_check_id);

    // Met de hand: w_fin = −8 + (−9,5 − (−5)) = −12,5 mm; grens 5000/250 = 20.
    let fin = toets(&r.checks, "deflection_w_fin");
    assert!((fin.uc.as_ref().unwrap().ed - 12.5).abs() < 1e-12);
    assert!((fin.uc.as_ref().unwrap().uc - 12.5 / 20.0).abs() < 1e-12);
    assert_eq!(fin.formula_latex, r"w_{fin,z} = w_z + \left(w_{qp,fin,z} - w_{qp,z}\right)");
    assert!(fin.variables.iter().any(|v| v.symbol == "w_{qp,fin}" && v.value == -9.5));
    assert!(
        fin.notes.iter().any(|n| n.contains("2.2.3(4)") && n.contains("AANGELEVERD") && n.contains("-12,50")
            && n.contains("-11,00")),
        "herkomst en vergelijking met de vereenvoudiging: {:?}",
        fin.notes
    );
    // w_add = w_fin − w₁ = −12,5 + 3 = −9,5 mm; w₂ = −4,5 mm.
    let add = toets(&r.checks, "deflection_w_add");
    assert!((add.uc.as_ref().unwrap().ed - 9.5).abs() < 1e-12);
    assert!(add.notes.iter().any(|n| n.contains("w₂ + w₃") && n.contains("-4,50")), "{:?}", add.notes);

    // Alle andere toetsen zijn gelijk.
    for (x, y) in zonder.checks.iter().zip(r.checks.iter()) {
        assert_eq!(x.id, y.id);
        if !x.id.starts_with("deflection_") {
            assert_eq!(serde_json::to_string(x).unwrap(), serde_json::to_string(y).unwrap(), "{}", x.id);
        }
    }
}

#[test]
fn clt_rekent_2_2_3_4_met_de_aangeleverde_w_qp_fin() {
    let zonder = check_clt_beam(serde_json::from_value(clt()).unwrap());
    let fin0 = toets(&zonder.checks, "deflection_w_fin");
    // Vereenvoudiging: −8 + 0,8·−5 = −12 mm.
    assert!((fin0.uc.as_ref().unwrap().ed - 12.0).abs() < 1e-12);

    let r = check_clt_beam(serde_json::from_value(met_fin(clt(), json!(-10.0))).unwrap());
    // w_fin = −8 + (−10 + 5) = −13 mm; w_add = −13 + 3 = −10 mm.
    let fin = toets(&r.checks, "deflection_w_fin");
    assert!((fin.uc.as_ref().unwrap().ed - 13.0).abs() < 1e-12);
    assert!(fin.notes.iter().any(|n| n.contains("2.2.3(4)")));
    let add = toets(&r.checks, "deflection_w_add");
    assert!((add.uc.as_ref().unwrap().ed - 10.0).abs() < 1e-12);
}

#[test]
fn een_niet_eindige_w_qp_fin_wordt_geweigerd() {
    // JSON kent geen NaN; langs de kern zelf (Tauri of een Rust-aanroeper) kan
    // het wel binnenkomen.
    let mut h: TimberBeamCheckInput = serde_json::from_value(hout()).unwrap();
    h.deflection_quasi_perm_fin_mm = Some(f64::NAN);
    let r = check_timber_beam(h);
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty());
    assert!(r.governing_check_id.starts_with("ERROR: ") && r.governing_check_id.contains("w_qp,fin"));

    let mut c: CltBeamCheckInput = serde_json::from_value(clt()).unwrap();
    c.deflection_quasi_perm_fin_mm = Some(f64::INFINITY);
    let r = check_clt_beam(c);
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty());
    assert!(r.governing_check_id.contains("w_qp,fin"), "{}", r.governing_check_id);
}
