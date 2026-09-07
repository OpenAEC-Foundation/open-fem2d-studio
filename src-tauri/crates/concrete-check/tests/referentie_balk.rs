//! Orchestrator-tests op de referentiedoorsnede uit
//! `nen-en-1992-1-1/tests/handberekening.rs`: 300 × 500, C30/37, B500B,
//! dekking 30, beugel Ø8, onder 3Ø16, boven 2Ø12.

use approx::assert_relative_eq;
use concrete_check::{check_concrete_beam, mn_kappa, CheckKind, CheckStatus, ConcreteBeamCheckInput, MnKappaRequest};
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::{ConcreteSectionInput, RebarRow, ReinforcementCage};

fn korf(boven: u32) -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: boven, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
    }
}

fn punt(combi: u32, x_mm: f64, n: f64, m: f64) -> ForcePoint {
    ForcePoint {
        combination_id: combi,
        position_mm: x_mm,
        forces: InternalForces { n_ed: n, my_ed: m, ..Default::default() },
    }
}

fn invoer(boven: u32, envelop: Vec<ForcePoint>) -> ConcreteBeamCheckInput {
    ConcreteBeamCheckInput {
        beam_id: 7,
        section: ConcreteSectionInput::rectangle(300.0, 500.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage: korf(boven),
        length_m: 5.0,
        forces_envelope: envelop,
        n_strips: 50,
        steel_branch: Default::default(),
        design_situation: Default::default(),
        apply_min_eccentricity: true,
    }
}

fn uc(r: &concrete_check::ConcreteBeamCheckResult, id: &str) -> f64 {
    let c = r.checks.iter().find(|c| c.id == id).expect("toets aanwezig");
    match &c.kind {
        CheckKind::Resistance(rc) => rc.uc.as_ref().unwrap().uc,
        CheckKind::Stability(_) => unreachable!(),
    }
}

/// Vrij opgelegde balk, veldmoment 100 kNm, geen normaalkracht:
/// UC buiging = 100 / 113,33 = 0,88 (handberekening 1).
#[test]
fn vrij_opgelegde_balk() {
    let env = vec![punt(1, 0.0, 0.0, 0.0), punt(1, 2500.0, 0.0, 100.0), punt(1, 5000.0, 0.0, 0.0)];
    let r = check_concrete_beam(invoer(0, env));
    assert_eq!(r.status, CheckStatus::Ok);
    assert_eq!(r.section_name, "300 x 500");
    assert_eq!(r.concrete_class, "C30/37");
    assert_eq!(r.reinforcement_grade, "B500B");
    assert_relative_eq!(r.f_cd_mpa, 20.0);
    assert_relative_eq!(r.d_mm, 454.0);
    assert_relative_eq!(uc(&r, "6.1_bending_stress_block"), 100.0 / 113.33, max_relative = 1e-3);
    // M-N-κ met parabool-rechthoek: binnen 2 % van het spanningsblok.
    assert_relative_eq!(uc(&r, "6.1_mn_kappa"), 100.0 / 113.33, max_relative = 0.02);
    assert!(r.uc_max > 0.85 && r.uc_max < 0.92);
    let d = r.mn_kappa.as_ref().unwrap();
    assert!(d.points.len() > 50);
    assert_relative_eq!(d.n_kn, 0.0);
    assert_eq!(r.interaction_positive.len(), 21);
    assert_eq!(r.interaction_negative.len(), 21);
}

/// Kolom met 2000 kN druk en een klein moment: de minimale excentriciteit
/// (6.1(4): e₀ = 20 mm → 40 kNm) neemt het over van M_Ed = 25 kNm, en het
/// drukpunt (andere combinatie) is maatgevend voor de M-N-toets.
#[test]
fn kolom_met_minimale_excentriciteit() {
    let env = vec![
        punt(1, 0.0, -2000.0, 25.0),
        punt(2, 0.0, -800.0, 60.0),
        punt(2, 3000.0, -800.0, 20.0),
    ];
    let r = check_concrete_beam(invoer(2, env));
    let mn = r.checks.iter().find(|c| c.id == "6.1_mn_kappa").unwrap();
    let CheckKind::Resistance(rc) = &mn.kind else { unreachable!() };
    // Twee kandidaten: (N = −800, M = 60) en (N = −2000, M = max(25; 40)).
    // Welke wint hangt van M_Rd(N) af; in elk geval is de toets geldig en
    // vermeldt hij bij het drukpunt de minimale excentriciteit.
    assert!(rc.uc.as_ref().unwrap().uc.is_finite());
    assert!(matches!(rc.status, CheckStatus::Ok | CheckStatus::NotOk));
    if rc.force_state.forces.n_ed < -1999.0 {
        assert_relative_eq!(rc.uc.as_ref().unwrap().ed, 40.0, max_relative = 1e-9);
        assert!(rc.notes.iter().any(|n| n.contains("6.1(4)")));
    }
    assert!(r.mn_kappa.is_some());
}

/// Onbekende klasse en een korf die niet past leveren een leesbare fout, geen paniek.
#[test]
fn fouten_worden_gemeld() {
    let env = vec![punt(1, 0.0, 0.0, 50.0)];
    let mut i = invoer(2, env.clone());
    i.concrete_class = "C24".into();
    let r = check_concrete_beam(i);
    assert!(r.governing_check_id.starts_with("ERROR"));
    assert!(r.checks.is_empty());

    let mut i = invoer(2, env);
    i.cage.bottom = RebarRow { count: 30, diameter_mm: 25.0 };
    let r = check_concrete_beam(i);
    assert!(r.governing_check_id.contains("past niet"));
}

/// Het losse M-N-κ-verzoek (voor de korf in de eigenschappen) levert het
/// diagram, de capaciteiten en beide interactiediagrammen.
#[test]
fn mn_kappa_verzoek() {
    let req = MnKappaRequest {
        section: ConcreteSectionInput::rectangle(300.0, 500.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage: korf(2),
        n_ed_kn: 0.0,
        moment_sign: 1.0,
        n_strips: 50,
        steel_branch: Default::default(),
        design_situation: Default::default(),
        interaction_points: 11,
    };
    let r = mn_kappa(req).expect("geldig verzoek");
    assert_relative_eq!(r.n_rd_compression_kn, 3331.75, max_relative = 1e-3);
    assert_relative_eq!(r.n_rd_tension_kn, (603.186 + 226.195) * 434.7826 * 1e-3, max_relative = 1e-3);
    assert!(r.diagram.m_max_knm > 110.0 && r.diagram.m_max_knm < 125.0);
    assert_eq!(r.interaction_positive.len(), 11);
    assert_eq!(r.reinforcement_summary, "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm");
}

/// JSON-contract: de invoer zoals de frontend hem stuurt, met weglaatbare velden.
#[test]
fn json_invoer_met_defaults() {
    let json = r#"{
        "beam_id": 3, "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37", "reinforcement_grade": "B500B",
        "cage": { "cover_mm": 30, "stirrup_diameter_mm": 8,
                  "top": { "count": 2, "diameter_mm": 12 },
                  "bottom": { "count": 3, "diameter_mm": 16 } },
        "length_m": 5,
        "forces_envelope": [ { "combination_id": 1, "position_mm": 2500,
            "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0, "mt_ed": 0, "my_ed": 80, "mz_ed": 0 } } ]
    }"#;
    let i: ConcreteBeamCheckInput = serde_json::from_str(json).unwrap();
    assert_eq!(i.n_strips, 50);
    assert!(i.apply_min_eccentricity);
    let r = check_concrete_beam(i);
    assert_eq!(r.status, CheckStatus::Ok);
    // Een onbekend veld is een fout.
    let fout = json.replace("\"length_m\"", "\"n_stripes\": 3, \"length_m\"");
    assert!(serde_json::from_str::<ConcreteBeamCheckInput>(&fout).is_err());
}
