//! Het verlopende profiel op papier (ontwerp 15-09-2026, §6).
//!
//! Bij een verlopende staaf zegt de unity check alleen niet waar hij vandaan
//! komt: de maatgevende plek ligt er lang niet altijd bij de grootste
//! snedekracht, omdat de weerstand met de doorsnede meeverloopt. Het rapport
//! moet daarom de ZES toetsdoorsneden tonen (x ≈ 0, L/5, …, L) en de plaats
//! waar het maatgevend werd.
//!
//! Deze proef loopt de hele keten: catalogusprofiel + eindprofiel → de
//! toetsing van de kern → de gezette PDF, en zoekt in de inhoudsstromen terug
//! of die gegevens er werkelijk staan — de plaats van elk van de zes
//! toetsdoorsneden inbegrepen, als getal.
//!
//! Tegenproef: dezelfde ligger ZONDER eindprofiel is prismatisch, en dan hoort
//! geen van de proefwoorden in de PDF te staan. Zonder die tegenproef bewijst
//! hun aanwezigheid niets.
//!
//! Woorden worden teruggezocht zoals in `kiplengte_pdf.rs`: via de
//! gliefnummers van het lettertype, want de tekst staat in de inhoudsstroom
//! als gliefreeks en niet als leesbare letters.

use report::{generate_report_pdf, ReportInput};
use serde_json::json;
use steel_check::{check_beam, BeamCheckInput, BeamCheckResult};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

/// Woorden die alleen uit het verloopblok kunnen komen.
const PROEFWOORDEN: [&str; 5] = [
    "toetsdoorsneden",
    "rekenpunten",
    "Maatgevend punt",
    "stabiliteitstoetsen",
    "verlopend",
];

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

/// Ligger op twee steunpunten, L = 6 m, q = 15 kN/m, S235.
/// Met `eind` verloopt hij van IPE 300 naar dat profiel; zonder is hij
/// prismatisch IPE 300.
fn ligger(eind: Option<&str>) -> BeamCheckResult {
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
    let mut invoer = json!({
        "beam_id": 7,
        "profile_name": "IPE 300",
        "steel_grade": "S235",
        "length_m": 6.0,
        "forces_envelope": envelop,
        "lateral_bracing": { "top_flange_positions": [], "bottom_flange_positions": [] },
        "deflection_limit_class": "Floor",
        "deflection_limit_numerator": 333,
        "deflection_actual_max_mm": 0.0,
        "is_cantilever": false,
        "consequence_class": "CC1",
        "q_equiv_n_per_mm": 15.0,
        "z_a_mm": 150.0
    });
    if let Some(e) = eind {
        invoer["profile_end"] = json!(e);
    }
    let invoer: BeamCheckInput =
        serde_json::from_value(invoer).expect("de invoer hoort geldig te zijn");
    check_beam(invoer)
}

fn pdf_van(r: BeamCheckResult, naam: &str) -> String {
    let pdf = generate_report_pdf(ReportInput {
        project_name: "Verlopend profiel".into(),
        project_number: "VP-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-16".into(),
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
    });
    let pad = std::env::temp_dir().join(naam);
    std::fs::write(&pad, &pdf).expect("de PDF moet weg te schrijven zijn");
    println!("PDF: {}", pad.display());
    inhoudsstromen(&pdf)
}

/// Duizendtalscheiding zoals `report::betonfiguren::nl(v, 0)` hem zet, zodat de
/// proef dezelfde schrijfwijze zoekt als de tabel gebruikt.
fn nl0(v: f64) -> String {
    let s = format!("{:.0}", v.abs());
    let mut uit = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            uit.push('.');
        }
        uit.push(c);
    }
    uit
}

#[test]
fn de_pdf_toont_de_zes_toetsdoorsneden_en_de_maatgevende_plaats() {
    let verlopend = ligger(Some("IPE 200"));
    let v = verlopend
        .verloop
        .clone()
        .expect("een staaf met een eindprofiel hoort een verlooprapport te dragen");
    assert_eq!(
        v.toetsdoorsneden.len(),
        6,
        "het ontwerp vraagt zes toetsdoorsneden (x = 0, L/5, …, L)"
    );
    let maatgevend = v
        .maatgevend
        .clone()
        .expect("er hoort een maatgevend punt te zijn zodra er een doorsnedetoets is gerekend");

    let stroom = pdf_van(verlopend, "verlopend_met_eindprofiel.pdf");
    for woord in PROEFWOORDEN {
        assert!(staat_erin(&stroom, woord), "{woord:?} staat niet in de PDF van de verlopende staaf");
    }
    // De plaats van ELKE toetsdoorsnede, als getal in de tabel.
    for d in &v.toetsdoorsneden {
        let x = nl0(d.x_mm);
        assert!(
            staat_erin(&stroom, &x),
            "de toetsdoorsnede op x = {x} mm staat niet in de tabel in de PDF"
        );
    }
    // En de maatgevende plaats, met het sterretje dat haar in de tabel aanwijst.
    let xm = nl0(maatgevend.doorsnede.x_mm);
    assert!(
        staat_erin(&stroom, &format!("{xm} *")),
        "de maatgevende plaats x = {xm} mm is in de tabel niet als zodanig aangewezen"
    );
    // De begin- en eindnaam van het verloop, zodat de lezer ziet waar het
    // verloop vandaan komt en waarheen het gaat.
    assert!(staat_erin(&stroom, "IPE 300"), "het beginprofiel staat niet in de PDF");
    assert!(staat_erin(&stroom, "IPE 200"), "het eindprofiel staat niet in de PDF");
}

#[test]
fn een_prismatische_staaf_krijgt_geen_verloopblok() {
    let prismatisch = ligger(None);
    assert!(
        prismatisch.verloop.is_none(),
        "zonder eindprofiel hoort er geen verlooprapport te zijn"
    );
    let stroom = pdf_van(prismatisch, "verlopend_zonder_eindprofiel.pdf");
    for woord in PROEFWOORDEN {
        assert!(
            !staat_erin(&stroom, woord),
            "{woord:?} staat ook in de PDF van een PRISMATISCHE staaf; het bewijst dan niets"
        );
    }
}
