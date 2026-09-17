//! De toelichting op de kiplengte in de PDF.
//!
//! Bij kipsteunen op de derdepunten rekent de kiptoets met L_kip = 1,4·L_st
//! (NB.NB.4.3, β = 0 in het eindveld). Dat getal zonder uitleg op papier leest
//! als een fout. Deze proef loopt de keten van JSON-invoer tot gezette PDF en
//! eist dat de reden er staat: in de kanttekeningen van de kiptoets en in de
//! uitgeschreven afleiding, met het overzicht per kipveld.
//!
//! Tegenproef: dezelfde ligger zonder kipsteunen heeft L_kip = L_st, en dan
//! hoort geen van de proefwoorden in de PDF te staan — anders bewijst hun
//! aanwezigheid niets.
//!
//! Woorden worden teruggezocht zoals in `zwakke_as_pdf.rs`.

use report::{generate_report_pdf, ReportInput};
use serde_json::json;
use steel_check::{check_beam, BeamCheckInput, BeamCheckResult};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

/// Woorden die alleen uit de kiplengtetoelichting en het veldoverzicht komen.
const PROEFWOORDEN: [&str; 3] = ["steunafstand:", "opslag:", "kipveld:"];

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

fn staat_erin(stroom: &str, woord: &str) -> bool {
    [FONT_REGULAR, FONT_BOLD].iter().any(|f| stroom.contains(&glief_hex(f, woord)))
}

/// IPE 300, S235, L = 6 m onder 15 kN/m, last op de bovenflens.
fn ligger(steunen: &[f64]) -> BeamCheckResult {
    let envelop: Vec<_> = (0..=60)
        .map(|i| {
            let x = 6.0 * i as f64 / 60.0;
            json!({
                "combination_id": 1,
                "position_mm": x * 1000.0,
                "forces": {
                    "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": 15.0 * (3.0 - x), "mt_ed": 0.0,
                    "my_ed": 15.0 * x * (6.0 - x) / 2.0, "mz_ed": 0.0
                }
            })
        })
        .collect();
    let invoer: BeamCheckInput = serde_json::from_value(json!({
        "beam_id": 3,
        "profile_name": "IPE 300",
        "steel_grade": "S235",
        "length_m": 6.0,
        "forces_envelope": envelop,
        "lateral_bracing": { "top_flange_positions": steunen, "bottom_flange_positions": [] },
        "deflection_limit_class": "Floor",
        "deflection_limit_numerator": 333,
        "deflection_actual_max_mm": 0.0,
        "is_cantilever": false,
        "consequence_class": "CC1",
        "q_equiv_n_per_mm": 15.0,
        "z_a_mm": 150.0
    }))
    .expect("de invoer hoort geldig te zijn");
    check_beam(invoer)
}

fn pdf_van(r: BeamCheckResult, naam: &str) -> String {
    let pdf = generate_report_pdf(ReportInput {
        bijlage: Default::default(),
        project_name: "Kiplengte".into(),
        project_number: "KL-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-15".into(),
        taal: Default::default(),
        steel_check_results: vec![r],
        timber_check_results: vec![],
        clt_check_results: vec![],
        concrete_check_results: vec![],
        stress_check_results: vec![],
        concrete_stiffness_trace: None,
        concrete_dekkingslijnen: Vec::new(),
        concrete_reinforcement_zones: Vec::new(),
        scheefstand_toelichting: None,
        analyse_toelichting: None,
        wind_toelichting: None,
        plate_results: Vec::new(),
        plate_inputs: Vec::new(),
        plate_skipped: Vec::new(),
    });
    let pad = std::env::temp_dir().join(naam);
    std::fs::write(&pad, &pdf).expect("de PDF moet weg te schrijven zijn");
    println!("PDF: {}", pad.display());
    inhoudsstromen(&pdf)
}

#[test]
fn de_pdf_legt_uit_waarom_l_kip_groter_is_dan_de_steunafstand() {
    let met = ligger(&[1.0 / 3.0, 2.0 / 3.0]);
    // De afleiding komt alleen voor de maatgevende toets op papier; deze
    // ligger is zo gekozen dat dat de kiptoets is (UC 0,50 tegen 0,46 op
    // buiging).
    assert_eq!(met.governing_check_id, "6.3.2_ltb", "de proef rekent op een maatgevende kiptoets");
    let stroom = pdf_van(met, "kiplengte_met_steunen.pdf");
    for woord in PROEFWOORDEN {
        assert!(staat_erin(&stroom, woord), "{woord:?} staat niet in de PDF met kipsteunen");
    }
    eis_ook(&stroom, "NB.NB.4.3");

    let zonder = ligger(&[]);
    let stroom = pdf_van(zonder, "kiplengte_zonder_steunen.pdf");
    for woord in PROEFWOORDEN {
        assert!(
            !staat_erin(&stroom, woord),
            "{woord:?} staat ook in de PDF zónder kipsteunen; het bewijst dan niets"
        );
    }
}

fn eis_ook(stroom: &str, woord: &str) {
    assert!(staat_erin(stroom, woord), "{woord:?} staat niet in de PDF");
}
