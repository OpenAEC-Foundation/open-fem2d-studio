//! Milieuklasse en dekking PER ZIJDE — de keten van de invoer tot de
//! dekkingstoets van 4.4.1.
//!
//! WAAROM DEZE TEST BESTAAT
//! Bij het narekenen van een externe referentie-berekening bleek een verschil
//! in momentweerstand deels te herleiden tot de dekking: die berekening voert
//! boven en onder een eigen dekking (40 en 25 mm) en een eigen milieuklasse,
//! terwijl de korf hier één c_nom droeg. Bij een plaat met een drukzone van
//! enkele tientallen millimeters ligt de bovenwapening daardoor op de verkeerde
//! plaats en telt zij verkeerd mee.
//!
//! WAT HIER WORDT VASTGELEGD
//! 1. De HARDE EIS: een invoer zonder zijde-gegevens — elk bestaand
//!    projectbestand — geeft exact dezelfde uitkomst als vóór deze
//!    uitbreiding. Niet "ongeveer", niet "binnen de tolerantie": hetzelfde
//!    getal.
//! 2. Een eigen dekking per zijde verplaatst de juiste wapeningslaag en
//!    daarmee de juiste nuttige hoogte.
//! 3. De dekkingsverzoeken die de invoer oplevert, dragen per zijde de juiste
//!    milieuklasse, de juiste dekking en de staafdiameter die daar werkelijk
//!    ligt.

use concrete_check::{check_concrete_beam, ConcreteBeamCheckInput};
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::dekking::concrete_cover_request;
use nen_en_1992_1_1::{
    CheckStatus, ConcreteSectionInput, CoverSide, ExposureClass, FaceCover, RebarRow,
    ReinforcementCage, StructuralClass,
};

/// De vloer uit de opdracht: 1000 mm breed, 250 mm dik, bovenzijde binnen en
/// onderzijde buiten. De korf is bewust dezelfde in alle gevallen; alleen de
/// dekking verschilt.
fn korf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 0.0,
        top: RebarRow { count: 5, diameter_mm: 10.0 },
        bottom: RebarRow { count: 5, diameter_mm: 12.0 },
        ..ReinforcementCage::default()
    }
}

fn punt(x_mm: f64, m_knm: f64) -> ForcePoint {
    ForcePoint {
        combination_id: 1,
        position_mm: x_mm,
        forces: InternalForces { n_ed: 0.0, vz_ed: 0.0, my_ed: m_knm, ..Default::default() },
    }
}

fn invoer(cage: ReinforcementCage) -> ConcreteBeamCheckInput {
    ConcreteBeamCheckInput {
        beam_id: 1,
        section: ConcreteSectionInput::rectangle(1000.0, 250.0),
        concrete_class: "C30/37".to_string(),
        reinforcement_grade: "B500B".to_string(),
        cage,
        reinforcement_zones: Default::default(),
        length_m: 5.0,
        forces_envelope: vec![punt(0.0, 0.0), punt(2500.0, 60.0), punt(5000.0, 0.0)],
        n_strips: 100,
        steel_branch: Default::default(),
        design_situation: Default::default(),
        apply_min_eccentricity: true,
        sls_frequent_envelope: Vec::new(),
        exposure_class: None,
        structural_class: None,
        aggregate_size_mm: None,
        structural_system: None,
        bar_spacing_mm: None,
    }
}

/// DE HARDE EIS. Zonder zijde-gegevens verandert er niets — niet aan d, niet
/// aan M_Rd, niet aan de unity check.
#[test]
fn een_bestaand_projectbestand_geeft_exact_dezelfde_uitkomst() {
    let oud = check_concrete_beam(invoer(korf()));
    // Dezelfde korf, maar nu met alle drie de zijden EXPLICIET op de dekking
    // van het element. Dat is hetzelfde bouwwerk, dus hetzelfde antwoord.
    let expliciet = ReinforcementCage {
        cover_top: Some(FaceCover { cover_mm: Some(30.0), exposure_class: None }),
        cover_bottom: Some(FaceCover { cover_mm: Some(30.0), exposure_class: None }),
        cover_sides: Some(FaceCover { cover_mm: Some(30.0), exposure_class: None }),
        ..korf()
    };
    let nieuw = check_concrete_beam(invoer(expliciet));

    assert_eq!(oud.checks.len(), nieuw.checks.len());
    assert_eq!(oud.d_mm, nieuw.d_mm);
    assert_eq!(oud.uc_max, nieuw.uc_max);
    assert_eq!(oud.status, nieuw.status);
    assert_eq!(oud.governing_check_id, nieuw.governing_check_id);
    assert_eq!(oud.reinforcement_summary, nieuw.reinforcement_summary);
    // Elke afzonderlijke toets, niet alleen de maatgevende: één stille
    // verschuiving in een niet-maatgevende toets is net zo goed een verschil.
    let json = |r: &concrete_check::ConcreteBeamCheckResult| {
        serde_json::to_value(&r.checks).unwrap()
    };
    assert_eq!(json(&oud), json(&nieuw));

    // En de invoer zonder de nieuwe velden komt uit JSON precies zo terug.
    let json = serde_json::to_value(&invoer(korf())).unwrap();
    let cage = &json["cage"];
    assert_eq!(cage["cover_top"], serde_json::Value::Null);
    assert_eq!(cage["cover_mm"], serde_json::json!(30.0));
}

/// Een eigen dekking boven en onder verplaatst de twee wapeningslagen elk naar
/// hun eigen rand — het geval waarvoor dit bestaat.
#[test]
fn boven_25_en_onder_40_geven_twee_nuttige_hoogtes() {
    let cage = ReinforcementCage {
        cover_top: Some(FaceCover {
            cover_mm: Some(25.0),
            exposure_class: Some(ExposureClass::XC1),
        }),
        cover_bottom: Some(FaceCover {
            cover_mm: Some(40.0),
            exposure_class: Some(ExposureClass::XC4),
        }),
        ..korf()
    };
    // Geen beugel: de staafas ligt op c_nom + Ø/2 van de rand.
    // d  = 250 − (40 + 12/2) = 204 mm
    // d₂ =        25 + 10/2  =  30 mm
    assert!((cage.d_mm(250.0) - 204.0).abs() < 1e-9, "{}", cage.d_mm(250.0));
    assert!((cage.d2_mm() - 30.0).abs() < 1e-9, "{}", cage.d2_mm());

    // Met één dekking van 30 mm rondom zouden het 214 en 35 mm zijn geweest —
    // de bovenwapening 5 mm te laag en de onderwapening 10 mm te hoog.
    let uniform = korf();
    assert!((uniform.d_mm(250.0) - 214.0).abs() < 1e-9);
    assert!((uniform.d2_mm() - 35.0).abs() < 1e-9);
}

/// De verzoeken die naar 4.4.1 gaan: één per zijde, met de klasse van die
/// zijde en de staaf die daar ligt.
#[test]
fn de_drie_dekkingsverzoeken_dragen_elk_hun_eigen_zijde() {
    let cage = ReinforcementCage {
        cover_top: Some(FaceCover {
            cover_mm: Some(25.0),
            exposure_class: Some(ExposureClass::XC1),
        }),
        cover_bottom: Some(FaceCover {
            cover_mm: Some(40.0),
            exposure_class: Some(ExposureClass::XC4),
        }),
        ..korf()
    };
    let mut inp = invoer(cage);
    // De zijkanten zeggen niets eigens en volgen dus het element.
    inp.exposure_class = Some(ExposureClass::XC3);
    inp.structural_class = Some(StructuralClass::S4);

    let verzoeken = inp.cover_requests();
    assert_eq!(verzoeken.len(), 3);

    let boven = &verzoeken[0];
    assert_eq!(boven.side, Some(CoverSide::Top));
    assert_eq!(boven.exposure_class, ExposureClass::XC1);
    assert_eq!(boven.cover_mm, 25.0);
    assert_eq!(boven.max_bar_diameter_mm, 10.0);

    let onder = &verzoeken[1];
    assert_eq!(onder.side, Some(CoverSide::Bottom));
    assert_eq!(onder.exposure_class, ExposureClass::XC4);
    assert_eq!(onder.cover_mm, 40.0);
    assert_eq!(onder.max_bar_diameter_mm, 12.0);

    let zijkant = &verzoeken[2];
    assert_eq!(zijkant.side, Some(CoverSide::Sides));
    assert_eq!(zijkant.exposure_class, ExposureClass::XC3, "valt terug op het element");
    assert_eq!(zijkant.cover_mm, 30.0, "valt terug op het element");
    assert_eq!(zijkant.max_bar_diameter_mm, 12.0, "de dikste van de twee rijen");

    // En de norm rekent ze door: XC1/S4 → c_min,dur 15, c_nom 20 ≤ 25 → in
    // orde; XC4/S4 → c_min,dur 30, c_nom 35 ≤ 40 → in orde.
    let a = concrete_cover_request(boven.clone()).unwrap();
    assert_eq!(a.c_nom_required_mm, 20.0);
    assert_eq!(a.status, CheckStatus::Ok);
    let b = concrete_cover_request(onder.clone()).unwrap();
    assert_eq!(b.c_nom_required_mm, 35.0);
    assert_eq!(b.status, CheckStatus::Ok);
    // Zou de onderzijde de 25 mm van de bovenzijde krijgen, dan is hij te dun.
    let mut te_dun = onder.clone();
    te_dun.cover_mm = 25.0;
    assert_eq!(concrete_cover_request(te_dun).unwrap().status, CheckStatus::NotOk);
}

/// Zonder milieuklasse — nergens — is er niets te toetsen, en wordt er ook
/// niets aangenomen.
#[test]
fn zonder_milieuklasse_komt_er_geen_verzoek() {
    let inp = invoer(korf());
    assert!(inp.cover_requests().is_empty());
    for zijde in CoverSide::ALL {
        assert_eq!(inp.exposure_at(zijde), None);
    }

    // Alleen een klasse op het element: dan gelden alle drie de zijden.
    let mut met_element = invoer(korf());
    met_element.exposure_class = Some(ExposureClass::XC2);
    assert_eq!(met_element.cover_requests().len(), 3);
    for zijde in CoverSide::ALL {
        assert_eq!(met_element.exposure_at(zijde), Some(ExposureClass::XC2));
    }
}
