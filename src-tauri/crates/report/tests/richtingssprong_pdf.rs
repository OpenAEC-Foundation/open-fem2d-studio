//! De waarschuwing bij de sprong van "boven" in de PDF.
//!
//! Bij een staaf die naar links helt, springt de fysieke zijde van "boven" op
//! 75° van het bovenvlak naar het ondervlak (zie
//! `design-mockup/src/lib/referentierichting.ts`, DE SPRONG BIJ 75°). Dicht bij
//! die grens zet de invoerbouwer een waarschuwing in `staafstand_notities`, en
//! de kern zet haar bij de kiptoets (staal) en bij de toetsen die een trekzijde
//! kiezen (beton). Een waarschuwing die alleen op het scherm staat, mist wie
//! het rapport leest; deze proef loopt van JSON-invoer tot gezette PDF en zoekt
//! de woorden terug, op dezelfde manier als `zwakke_as_pdf.rs`.

use concrete_check::{check_concrete_beam, CheckKind as BetonCheckKind, ConcreteBeamCheckInput};
use report::{generate_report_pdf, ReportInput};
use serde_json::json;
use steel_check::{check_beam, BeamCheckInput, CheckKind};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

/// Proefteksten met een woord dat nergens anders in het rapport staat, zodat
/// een treffer in de PDF aantoonbaar van DEZE kanttekening komt.
const STAAL: &str =
    "Richtingssprong nabij. Proefstaal: de BOVENflens ligt bij deze helling aan de fysieke onderzijde (linksonder).";
const BETON: &str =
    "Richtingssprong nabij. Proefbeton: de BOVENwapening ligt bij deze helling aan de fysieke onderzijde (linksonder).";

fn inhoudsstromen(pdf: &[u8]) -> String {
    let doc = lopdf::Document::load_mem(pdf).expect("de PDF moet te lezen zijn");
    let mut uit = String::new();
    for (_, id) in doc.get_pages() {
        let inhoud = doc.get_page_content(id).expect("de inhoudsstroom moet uit te pakken zijn");
        uit.push_str(&String::from_utf8_lossy(&inhoud).to_uppercase());
    }
    uit
}

fn glief_hex(font: &[u8], woord: &str) -> String {
    let face = ttf_parser::Face::parse(font, 0).expect("het lettertype moet te lezen zijn");
    woord
        .chars()
        .map(|ch| {
            let gid = face
                .glyph_index(ch)
                .unwrap_or_else(|| panic!("geen glief voor {ch:?} — kies een ander proefwoord"));
            format!("{:04X}", gid.0)
        })
        .collect()
}

fn eis_erin(stroom: &str, woord: &str) {
    assert!(
        [FONT_REGULAR, FONT_BOLD].iter().any(|f| stroom.contains(&glief_hex(f, woord))),
        "{woord:?} staat niet in de inhoudsstroom van de PDF"
    );
}

#[test]
fn de_pdf_toont_de_richtingssprong_bij_staal_en_beton() {
    // Staal: een staande IPE 330 van 9 m met een parabolisch moment en
    // kipsteunen aan de bovenflens — de kiptoets moet er zijn.
    let envelop: Vec<_> = (0..=10)
        .map(|i| {
            let x = 900.0 * i as f64;
            let t = x / 9000.0;
            json!({
                "combination_id": 1,
                "position_mm": x,
                "forces": { "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": 0.0, "mt_ed": 0.0,
                            "my_ed": 80.0 * 4.0 * t * (1.0 - t), "mz_ed": 0.0 }
            })
        })
        .collect();
    let staal: BeamCheckInput = serde_json::from_value(json!({
        "beam_id": 1,
        "profile_name": "IPE 330",
        "steel_grade": "S235",
        "length_m": 9.0,
        "forces_envelope": envelop,
        "lateral_bracing": { "top_flange_positions": [0.25, 0.5, 0.75], "bottom_flange_positions": [] },
        "deflection_limit_class": "Floor",
        "deflection_limit_numerator": 333,
        "deflection_actual_max_mm": 0.0,
        "is_cantilever": false,
        "consequence_class": "CC2",
        "staafstand": "Staand",
        "staafstand_notities": [STAAL]
    }))
    .expect("staalinvoer met staafstand_notities hoort geldig te zijn");
    let staal = check_beam(staal);
    let kip = staal.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(k) = &kip.kind else { panic!("de kiptoets is een stabiliteitstoets") };
    assert!(k.notes.iter().any(|n| n == STAAL), "de kern hoort de kanttekening bij de kiptoets te zetten");

    // Beton: 300 × 500 met een negatief moment, zodat 6.1 een trekzijde kiest.
    let beton: ConcreteBeamCheckInput = serde_json::from_value(json!({
        "beam_id": 2,
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30,
            "stirrup_diameter_mm": 8,
            "top": { "count": 2, "diameter_mm": 12 },
            "bottom": { "count": 3, "diameter_mm": 16 }
        },
        "length_m": 6,
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 3000,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0, "mt_ed": 0, "my_ed": -60, "mz_ed": 0 } }
        ],
        "staafstand": "Staand",
        "staafstand_notities": [BETON]
    }))
    .expect("betoninvoer met staafstand_notities hoort geldig te zijn");
    let beton = check_concrete_beam(beton);
    let buiging = beton
        .checks
        .iter()
        .find(|c| c.id == "6.1_bending_stress_block")
        .expect("buigingstoets 6.1");
    let notes = match &buiging.kind {
        BetonCheckKind::Resistance(r) => &r.notes,
        BetonCheckKind::Stability(s) => &s.notes,
    };
    assert!(notes.iter().any(|n| n == BETON), "de kern hoort de kanttekening bij 6.1 te zetten");

    let pdf = generate_report_pdf(ReportInput {
        bijlage: Default::default(),
        project_name: "Richtingssprong".into(),
        project_number: "RS-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-15".into(),
        taal: Default::default(),
        steel_check_results: vec![staal],
        timber_check_results: vec![],
        clt_check_results: vec![],
        concrete_check_results: vec![beton],
        stress_check_results: vec![],
        concrete_stiffness_trace: None,
        concrete_dekkingslijnen: Vec::new(),
        concrete_reinforcement_zones: Vec::new(),
        scheefstand_toelichting: None,
        analyse_toelichting: None,
        wind_toelichting: None,
        plate_results: Vec::new(),
        plate_skipped: Vec::new(),
    });
    let pad = std::env::temp_dir().join("richtingssprong_proef.pdf");
    std::fs::write(&pad, &pdf).expect("de PDF moet weg te schrijven zijn");
    println!("PDF: {}", pad.display());

    let stroom = inhoudsstromen(&pdf);
    eis_erin(&stroom, "Richtingssprong");
    // Elk proefwoord staat alleen in zijn eigen kanttekening: een treffer bewijst
    // dat zowel het staal- als het betonhoofdstuk hem zet.
    eis_erin(&stroom, "Proefstaal:");
    eis_erin(&stroom, "Proefbeton:");
    eis_erin(&stroom, "(linksonder).");
}
