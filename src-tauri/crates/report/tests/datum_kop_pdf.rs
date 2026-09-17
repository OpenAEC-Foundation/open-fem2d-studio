//! De datum in de paginakop van de PDF, voluit en in de taal van het rapport
//! (issue #20).
//!
//! WAT HIER MISGING. Het titelblad van het live rapport toonde de datum voluit
//! ("16 september 2026"), de kop van elke pagina ruw ("2026-09-16"). De PDF
//! zette hem op het titelblad ruw en in de paginakop helemaal niet.
//!
//! Wat deze proef vastlegt:
//! - [`datum_voluit`] levert per taal precies de notatie uit de gedeelde
//!   proeftabel `tests/data/datumnotatie.json` — dezelfde tabel waartegen
//!   `design-mockup/test-rapport-datum.mjs` het live rapport houdt, zodat
//!   scherm en papier niet uiteen kunnen lopen;
//! - in de GERENDERDE PDF staat de datum op ELKE pagina (titelblad en de kop
//!   van elke inhoudspagina) voluit, in het Nederlands, Engels en Duits, en
//!   nergens meer ruw;
//! - een aanroep zonder `taal` (JSON van vóór dit veld) levert Nederlands, en
//!   een onbekende taal wordt geweigerd;
//! - een datum die geen kalenderdatum is, gaat woordelijk door.

use nen_en_1993_1_1_section::CheckStatus;
use report::{datum_voluit, generate_report_pdf, RapportTaal, ReportInput};
use serde::Deserialize;
use steel_check::result::BeamCheckResult;

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");

// ── Woorden terugzoeken in de PDF (zie tests/betonhoofdstuk_pdf.rs) ──────────

/// De inhoudsstroom per pagina, in paginavolgorde.
fn stromen_per_pagina(pdf: &[u8]) -> Vec<String> {
    let doc = lopdf::Document::load_mem(pdf).expect("de PDF moet te lezen zijn");
    doc.get_pages()
        .into_values()
        .map(|id| {
            let inhoud = doc
                .get_page_content(id)
                .expect("de inhoudsstroom moet uit te pakken zijn");
            String::from_utf8_lossy(&inhoud).to_uppercase()
        })
        .collect()
}

/// De kop en de waarden op het titelblad staan in het gewone gewicht.
fn glief_hex(tekst: &str) -> String {
    let face = ttf_parser::Face::parse(FONT_REGULAR, 0).expect("het lettertype moet te lezen zijn");
    let mut uit = String::with_capacity(tekst.chars().count() * 4);
    for ch in tekst.chars() {
        let gid = face
            .glyph_index(ch)
            .unwrap_or_else(|| panic!("geen glief voor {ch:?} — kies een andere proefdatum"));
        uit.push_str(&format!("{:04X}", gid.0));
    }
    uit
}

// ── De gedeelde proeftabel ───────────────────────────────────────────────────

#[derive(Deserialize)]
struct Tabel {
    rijen: Vec<Rij>,
}

#[derive(Deserialize)]
struct Rij {
    taal: RapportTaal,
    ruw: String,
    voluit: String,
}

fn tabel() -> Tabel {
    serde_json::from_str(include_str!("data/datumnotatie.json"))
        .expect("tests/data/datumnotatie.json moet te lezen zijn")
}

// ── Testgegevens ─────────────────────────────────────────────────────────────

fn staalstaaf(beam_id: u32) -> BeamCheckResult {
    BeamCheckResult {
        beam_id,
        profile_name: "HEB160".into(),
        steel_grade: "S235".into(),
        classification: nen_en_1993_1_1_section::classification::CrossSectionClass::Class1,
        checks: vec![],
        uc_max: 0.12,
        status: CheckStatus::Ok,
        governing_check_id: String::new(),
        verloop: None,
    }
}

/// Genoeg staven voor meer dan één inhoudspagina: de kop moet op ELKE pagina
/// kloppen, niet alleen op de eerste.
fn invoer(date: &str, taal: RapportTaal) -> ReportInput {
    ReportInput {
        bijlage: Default::default(),
        project_name: "Datumproef".into(),
        project_number: "DK-020".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: date.into(),
        taal,
        steel_check_results: (1..=80).map(staalstaaf).collect(),
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
        plate_skipped: Vec::new(),
    }
}

/// Elke pagina draagt `verwacht`; geen enkele pagina draagt een van `nooit`.
fn datum_op_elke_pagina(pdf: &[u8], verwacht: &str, nooit: &[&str]) {
    let paginas = stromen_per_pagina(pdf);
    assert!(
        paginas.len() >= 3,
        "de proef hoort titelblad plus minstens twee inhoudspagina's te hebben, kreeg {}",
        paginas.len()
    );
    let gezocht = glief_hex(verwacht);
    for (i, stroom) in paginas.iter().enumerate() {
        assert!(
            stroom.contains(&gezocht),
            "pagina {} draagt de datum {verwacht:?} niet",
            i + 1
        );
        for fout in nooit {
            assert!(
                !stroom.contains(&glief_hex(fout)),
                "pagina {} draagt de datum in de notatie {fout:?}",
                i + 1
            );
        }
    }
}

// ── De proeven ───────────────────────────────────────────────────────────────

#[test]
fn de_notatie_volgt_de_gedeelde_proeftabel() {
    let t = tabel();
    for taal in RapportTaal::ALLE {
        assert!(
            t.rijen.iter().filter(|r| r.taal == taal).count() >= 12,
            "de proeftabel hoort elke maand in {} te dekken",
            taal.code()
        );
    }
    for r in &t.rijen {
        assert_eq!(
            datum_voluit(&r.ruw, r.taal),
            r.voluit,
            "{:?} in {}",
            r.ruw,
            r.taal.code()
        );
    }
}

#[test]
fn nederlands_op_titelblad_en_elke_paginakop() {
    let pdf = generate_report_pdf(invoer("2026-09-16", RapportTaal::Nl));
    datum_op_elke_pagina(&pdf, "16 september 2026", &["2026-09-16", "September 16, 2026"]);
}

#[test]
fn engels_op_titelblad_en_elke_paginakop() {
    let pdf = generate_report_pdf(invoer("2026-09-16", RapportTaal::En));
    datum_op_elke_pagina(&pdf, "September 16, 2026", &["2026-09-16", "16 september 2026"]);
}

#[test]
fn duits_op_titelblad_en_elke_paginakop() {
    let pdf = generate_report_pdf(invoer("2026-03-02", RapportTaal::De));
    datum_op_elke_pagina(&pdf, "2. März 2026", &["2026-03-02", "2 maart 2026"]);
}

#[test]
fn zonder_taal_nederlands_en_een_onbekende_taal_geweigerd() {
    let mut json = serde_json::to_value(invoer("2026-09-16", RapportTaal::En)).unwrap();
    json.as_object_mut().unwrap().remove("taal");
    let zonder: ReportInput = serde_json::from_value(json.clone()).expect("taal is optioneel");
    assert_eq!(zonder.taal, RapportTaal::Nl);
    datum_op_elke_pagina(&generate_report_pdf(zonder), "16 september 2026", &["2026-09-16"]);

    json["taal"] = "es".into();
    assert!(
        serde_json::from_value::<ReportInput>(json).is_err(),
        "een taal die de app niet kent hoort geweigerd te worden, niet stil Nederlands"
    );
}

#[test]
fn een_vrije_datumtekst_gaat_woordelijk_door() {
    let pdf = generate_report_pdf(invoer("week 38", RapportTaal::Nl));
    datum_op_elke_pagina(&pdf, "week 38", &[]);
}
