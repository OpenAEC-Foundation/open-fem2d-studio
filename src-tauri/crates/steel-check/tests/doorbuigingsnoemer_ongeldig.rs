//! Issue #9: een doorbuigingsnoemer van 0 of kleiner is een invoerfout.
//!
//! WAT HIER MISGING
//! Klasse `Custom` met noemer 0 gaf in `check_deflection_pair` een grens van
//! oneindig; de UC werd 0 en de toets op w_fin kreeg status Ok. De staaf als
//! geheel slaagde daarmee voor een toets die niets had getoetst. Bij w_add viel
//! hetzelfde geval terug op 3/1 000 · ℓ_rep, en een negatieve w_add-noemer werd
//! stil gelezen als "niet opgegeven".
//!
//! WAT DEZE TEST VASTLEGT
//! 1. `Custom` met noemer 0 of negatief: geen toetsen, status NotApplicable,
//!    de reden in `governing_check_id` — dezelfde vorm als een onbekende
//!    staalsoort.
//! 2. Een negatieve of niet-eindige w_add-noemer: idem, bij elke klasse.
//! 3. Wat geen fout is blijft rekenen: een noemer 0 bij een andere klasse dan
//!    `Custom` (die wordt niet gelezen) en w_add-noemer 0 (= afleiden uit de
//!    klasse). Voor die gevallen is de w_fin-grens met de hand nagerekend:
//!    L = 2500 mm, klasse Floor, 2500/333 = 7,508 mm (deflection.rs,
//!    `default_numerator`).

use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_section::CheckStatus;
use steel_check::*;

/// De kolom HEB160 uit `portal_beam2.rs`, met een kleine zakking erbij zodat
/// een doorbuigingstoets die WEL rekent een UC groter dan nul heeft.
fn invoer(klasse: DeflectionClass, noemer: i32, noemer_add: f64) -> BeamCheckInput {
    BeamCheckInput {
        bijlage: Default::default(),
        beam_id: 2,
        profile_name: "HEB160".to_string(),
        steel_grade: "S235".to_string(),
        length_m: 2.5,
        forces_envelope: vec![ForcePoint {
            combination_id: 22,
            position_mm: 0.0,
            forces: InternalForces { n_ed: -233.911, vy_ed: 0.0, vz_ed: 17.357, mt_ed: 0.0, my_ed: -63.139, mz_ed: 0.0 },
        }],
        lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![] },
        buckling_length_y_m: 2.5,
        buckling_length_z_m: 2.5,
        deflection_limit_class: klasse,
        deflection_limit_numerator: noemer,
        deflection_actual_max_mm: -3.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: noemer_add,
        deflection_notes: vec![],
        q_equiv_n_per_mm: 0.0,
        z_a_mm: 0.0,
        custom_section: None,
        staafstand: None,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
        profile_end: None,
        custom_section_end: None,
    }
}

fn eis_geweigerd(r: &BeamCheckResult, trefwoord: &str, wat: &str) {
    assert_eq!(r.status, CheckStatus::NotApplicable, "{wat}: status");
    assert!(r.checks.is_empty(), "{wat}: er is toch getoetst");
    assert_eq!(r.uc_max, 0.0, "{wat}: uc_max");
    assert!(
        r.governing_check_id.starts_with("ERROR: ") && r.governing_check_id.contains(trefwoord),
        "{wat}: reden ontbreekt of is onduidelijk: {}",
        r.governing_check_id
    );
    assert!(r.governing_check_id.contains("niet getoetst"), "{wat}: {}", r.governing_check_id);
}

#[test]
fn custom_met_noemer_nul_of_negatief_wordt_geweigerd() {
    for n in [0, -1, -300] {
        let r = check_beam(invoer(DeflectionClass::Custom, n, 0.0));
        eis_geweigerd(&r, "'Custom'", &format!("Custom met noemer {n}"));
        assert!(r.governing_check_id.contains(&format!("noemer {n}")));
    }
}

#[test]
fn negatieve_of_ongeldige_w_add_noemer_wordt_geweigerd() {
    for klasse in [DeflectionClass::Floor, DeflectionClass::Roof, DeflectionClass::Custom] {
        let r = check_beam(invoer(klasse, 400, -150.0));
        eis_geweigerd(&r, "w_add", &format!("{klasse:?} met w_add-noemer -150"));
    }
    let r = check_beam(invoer(DeflectionClass::Floor, 333, f64::NAN));
    eis_geweigerd(&r, "w_add", "w_add-noemer NaN");
}

/// Ook een verlopende staaf gaat eerst langs de keuring.
#[test]
fn verlopende_staaf_krijgt_dezelfde_weigering() {
    let mut i = invoer(DeflectionClass::Custom, 0, 0.0);
    i.profile_name = "HEA200".to_string();
    i.profile_end = Some("HEA300".to_string());
    let r = check_beam(i);
    eis_geweigerd(&r, "'Custom'", "verlopend, Custom met noemer 0");
}

#[test]
fn wat_geen_fout_is_rekent_gewoon() {
    // Noemer 0 bij klasse Floor: niet gelezen, de klassenoemer 333 geldt.
    let r = check_beam(invoer(DeflectionClass::Floor, 0, 0.0));
    assert_ne!(r.status, CheckStatus::NotApplicable, "{}", r.governing_check_id);
    let fin = r.checks.iter().find(|c| c.id == "deflection_w_fin").expect("w_fin getoetst");
    match &fin.kind {
        CheckKind::Resistance(c) => {
            assert_eq!(c.status, CheckStatus::Ok);
            let uc = c.uc.as_ref().expect("UC aanwezig");
            assert!((uc.rd - 2500.0 / 333.0).abs() < 1e-9, "grens {}", uc.rd);
            assert!((uc.uc - 3.0 / (2500.0 / 333.0)).abs() < 1e-9, "UC {}", uc.uc);
        }
        CheckKind::Stability(_) => panic!("w_fin is een weerstandstoets"),
    }

    // Custom met een geldige noemer rekent met die noemer, voor w_fin én w_add.
    let r = check_beam(invoer(DeflectionClass::Custom, 250, 0.0));
    for id in ["deflection_w_fin", "deflection_w_add"] {
        let c = r.checks.iter().find(|c| c.id == id).expect(id);
        match &c.kind {
            CheckKind::Resistance(c) => {
                assert_eq!(c.status, CheckStatus::Ok, "{id}");
                assert!((c.uc.as_ref().unwrap().rd - 10.0).abs() < 1e-9, "{id}: 2500/250 = 10 mm");
            }
            CheckKind::Stability(_) => panic!("{id} is een weerstandstoets"),
        }
    }
}
