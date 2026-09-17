//! De zwakke as in de PDF: staat de gebruikte L_cr,z er met haar herkomst in?
//!
//! Een toetsresultaat dat de herkomst draagt, is pas af als die herkomst ook op
//! papier komt. Deze proef loopt de keten van JSON-invoer tot gezette PDF:
//!
//! 1. De staalinvoer gaat als JSON ZONDER `buckling_length_y_m` en
//!    `buckling_length_z_m` de kern in — precies wat een MCP-client mag sturen
//!    nu die velden optioneel zijn. Dat moet deserialiseren.
//! 2. De kern valt terug op de staaflengte en zegt dat.
//! 3. De PDF bevat de kniklengte met haar herkomst en de uitgeschreven
//!    afleiding van de knikcontrole (die hier maatgevend is).
//!
//! Woorden worden teruggezocht zoals in `houthoofdstuk_pdf.rs`: de
//! inhoudsstromen met `lopdf` uitgepakt, elk woord met `ttf-parser` vertaald
//! naar de glief-nummers van Liberation Sans. De PDF blijft in de tijdelijke
//! map staan (pad in de uitvoer van `cargo test -- --nocapture`).

use report::{generate_report_pdf, ReportInput};
use serde_json::json;
use steel_check::{check_beam, BeamCheckInput, CheckKind};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

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
fn de_pdf_noemt_de_kniklengte_uit_het_vlak_met_haar_herkomst() {
    let envelop: Vec<_> = (0..=10)
        .map(|i| {
            json!({
                "combination_id": 1,
                "position_mm": 400.0 * i as f64,
                "forces": { "n_ed": -100.0, "vy_ed": 0.0, "vz_ed": 0.0, "mt_ed": 0.0, "my_ed": 0.0, "mz_ed": 0.0 }
            })
        })
        .collect();
    // Geen kniklengtevelden: "0 of weglaten = niet opgegeven".
    let invoer: BeamCheckInput = serde_json::from_value(json!({
        "beam_id": 7,
        "profile_name": "IPE 200",
        "steel_grade": "S235",
        "length_m": 4.0,
        "forces_envelope": envelop,
        "lateral_bracing": { "top_flange_positions": [], "bottom_flange_positions": [] },
        "deflection_limit_class": "Floor",
        "deflection_limit_numerator": 333,
        "deflection_actual_max_mm": 0.0,
        "is_cantilever": false,
        "consequence_class": "CC1"
    }))
    .expect("invoer zonder kniklengtevelden hoort geldig te zijn");
    assert_eq!(invoer.buckling_length_z_m, 0.0);

    let resultaat = check_beam(invoer);
    assert_eq!(resultaat.governing_check_id, "6.3.1_buckling", "de proef rekent op een maatgevende knikcontrole");
    let knik = resultaat.checks.iter().find(|c| c.id == "6.3.1_buckling").unwrap();
    let CheckKind::Stability(k) = &knik.kind else { panic!("stabiliteit") };
    assert!(k.notes.iter().any(|n| n.contains("L_cr,z = 4000 mm (staaflengte (terugval))")));

    let pdf = generate_report_pdf(ReportInput {
        bijlage: Default::default(),
        project_name: "Zwakke as".into(),
        project_number: "ZA-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-15".into(),
        taal: Default::default(),
        steel_check_results: vec![resultaat],
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
    });
    let pad = std::env::temp_dir().join("zwakke_as_proef.pdf");
    std::fs::write(&pad, &pdf).expect("de PDF moet weg te schrijven zijn");
    println!("PDF: {}", pad.display());

    let stroom = inhoudsstromen(&pdf);
    // De titel noemt beide assen met hun vlak.
    eis_erin(&stroom, "Kolomknik");
    // De kanttekening met de gebruikte kniklengte en haar herkomst.
    eis_erin(&stroom, "L_cr,z");
    eis_erin(&stroom, "staaflengte");
    eis_erin(&stroom, "terugval");
    // Wat het vlakke model niet ziet.
    eis_erin(&stroom, "raamwerkberekening");
    // De uitgeschreven afleiding van de maatgevende toets.
    eis_erin(&stroom, "Herkomst:");
    eis_erin(&stroom, "Reductiefactor");
}
