//! Issue #9, de houtkant: een doorbuigingsnoemer van 0 of kleiner is een
//! invoerfout, bij massief hout en bij kruislaaghout.
//!
//! WAT HIER MISGING
//! `nen_en_1995_1_1::deflection::check_deflection_pair` maakte van een noemer
//! n <= 0 een grens van oneindig; de UC werd 0 en de toets kreeg status Ok. Voor
//! `deflection_limit_fin` en `deflection_limit_add` geldt de NB-standaardwaarde
//! (L/250, L/333) alleen als het veld wegblijft — een opgegeven 0 of negatief
//! getal ging dus rechtstreeks de toets in en slaagde stil.
//!
//! WAT DEZE TEST VASTLEGT
//! Voor elk van de twee velden, met 0, negatief: geen toetsen, status
//! NotApplicable, de reden in `governing_check_id` — dezelfde vorm als een
//! onbekende sterkteklasse. En weglaten rekent gewoon door met de NB-waarden.

use nen_en_1993_1_1_section::CheckStatus;
use serde_json::{json, Value};
use timber_check::clt::{check_clt_beam, CltBeamCheckInput};
use timber_check::{check_timber_beam, TimberBeamCheckInput};

fn punt(x_mm: f64, vz: f64, my: f64) -> Value {
    json!({
        "combination_id": 12,
        "position_mm": x_mm,
        "forces": { "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": vz, "mt_ed": 0.0, "my_ed": my, "mz_ed": 0.0 }
    })
}

/// C24 96 x 450 over 5 m met een kleine zakking; zonder de noemervelden, die
/// zet elke test zelf.
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
        "deflection_inst_mm": -5.0,
        "deflection_quasi_perm_mm": -3.0,
        "deflection_permanent_mm": -3.0
    })
}

/// De vijflaagse CLT-plaat uit `clt.rs`, met k_def zodat de doorbuiging ook
/// werkelijk getoetst zou worden.
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
        "deflection_inst_mm": -5.0,
        "deflection_quasi_perm_mm": -3.0,
        "deflection_permanent_mm": -3.0
    })
}

fn met(mut v: Value, veld: &str, n: f64) -> Value {
    v[veld] = json!(n);
    v
}

fn eis_geweigerd(status: CheckStatus, leeg: bool, id: &str, veld: &str, wat: &str) {
    assert_eq!(status, CheckStatus::NotApplicable, "{wat}: status");
    assert!(leeg, "{wat}: er is toch getoetst");
    assert!(
        id.starts_with("ERROR: ") && id.contains(veld) && id.contains("niet getoetst"),
        "{wat}: reden ontbreekt of is onduidelijk: {id}"
    );
}

#[test]
fn massief_hout_weigert_noemer_nul_en_negatief() {
    for (veld, naam) in [("deflection_limit_fin", "w_fin"), ("deflection_limit_add", "w_add")] {
        for n in [0.0, -250.0] {
            let invoer: TimberBeamCheckInput = serde_json::from_value(met(hout(), veld, n)).unwrap();
            let r = check_timber_beam(invoer);
            eis_geweigerd(r.status, r.checks.is_empty(), &r.governing_check_id, naam,
                &format!("hout, {veld} = {n}"));
        }
    }
}

#[test]
fn clt_weigert_noemer_nul_en_negatief() {
    for (veld, naam) in [("deflection_limit_fin", "w_fin"), ("deflection_limit_add", "w_add")] {
        for n in [0.0, -250.0] {
            let invoer: CltBeamCheckInput = serde_json::from_value(met(clt(), veld, n)).unwrap();
            let r = check_clt_beam(invoer);
            eis_geweigerd(r.status, r.checks.is_empty(), &r.governing_check_id, naam,
                &format!("CLT, {veld} = {n}"));
            assert!(r.notes.iter().any(|t| t.contains(naam)), "CLT: reden ook in de notities");
        }
    }
}

/// Weglaten = de NB-standaardwaarden; dan wordt er gewoon getoetst. De grens
/// met de hand: L = 5000 mm, 5000/250 = 20 mm en 5000/333 = 15,015 mm.
#[test]
fn weglaten_rekent_met_de_nb_waarden() {
    let invoer: TimberBeamCheckInput = serde_json::from_value(hout()).unwrap();
    let r = check_timber_beam(invoer);
    assert_ne!(r.status, CheckStatus::NotApplicable, "{}", r.governing_check_id);
    let invoer: CltBeamCheckInput = serde_json::from_value(clt()).unwrap();
    let c = check_clt_beam(invoer);
    assert_ne!(c.status, CheckStatus::NotApplicable, "{}", c.governing_check_id);
    for (checks, soort) in [(&r.checks, "hout"), (&c.checks, "CLT")] {
        for (id, grens) in [("deflection_w_fin", 20.0), ("deflection_w_add", 5000.0 / 333.0)] {
            let t = checks.iter().find(|t| t.id == id).unwrap_or_else(|| panic!("{soort}: {id}"));
            match &t.kind {
                steel_check::CheckKind::Resistance(x) => {
                    assert_ne!(x.status, CheckStatus::NotApplicable, "{soort}: {id}");
                    assert!((x.uc.as_ref().unwrap().rd - grens).abs() < 1e-6, "{soort}: {id}");
                }
                steel_check::CheckKind::Stability(_) => panic!("{soort}: {id} is een weerstandstoets"),
            }
        }
    }
}
