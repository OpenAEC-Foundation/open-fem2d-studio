//! De omschrijving van de gegenereerde windlasten op papier (issue #16).
//!
//! Het live rapport noemde per windlast al de paragraaf, de tabel, α, φ en de
//! gebruikte coëfficiënt; de PDF niet. Deze proef zet het tekstblok
//! `wind_toelichting` in een rapport en zoekt de woorden terug in de
//! inhoudsstroom — op dezelfde manier als `rapportaanvulling_pdf.rs`: een woord
//! wordt met `ttf-parser` vertaald naar de gliefreeks waarmee printpdf het
//! opschrijft. Staat die reeks in de stroom, dan staat het woord op papier.
//!
//! De tekst hieronder is woordelijk de uitvoer van `vrijstaandDakUitgangspunten`
//! (`design-mockup/src/lib/wind/windGenerator.ts`) voor de carport van
//! `test-wind-vrijstaand-dak.mjs` (lessenaarsdak α = 10°, φ = 0,50), zodat de
//! proef over de vorm gaat die de app werkelijk meestuurt.

use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{
    classification::CrossSectionClass, CheckStatus, ResistanceCalc, UnityCheck,
};
use report::{generate_report_pdf, ReportInput};
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

fn inhoudsstromen(pdf: &[u8]) -> String {
    let doc = lopdf::Document::load_mem(pdf).expect("de PDF moet te lezen zijn");
    let mut uit = String::new();
    for (_, id) in doc.get_pages() {
        let inhoud = doc
            .get_page_content(id)
            .expect("de inhoudsstroom moet uit te pakken zijn");
        uit.push_str(&String::from_utf8_lossy(&inhoud).to_uppercase());
    }
    uit
}

/// Per teken het gliefnummer als vier hexcijfers — de vorm waarin printpdf een
/// woord in de stroom zet.
fn glief_hex(font: &[u8], woord: &str) -> String {
    let face = ttf_parser::Face::parse(font, 0).expect("het lettertype moet te lezen zijn");
    let mut uit = String::with_capacity(woord.chars().count() * 4);
    for ch in woord.chars() {
        let gid = face
            .glyph_index(ch)
            .unwrap_or_else(|| panic!("geen glief voor {ch:?} — kies een ander proefwoord"));
        uit.push_str(&format!("{:04X}", gid.0));
    }
    uit
}

fn staat_erin(stroom: &str, woord: &str) -> bool {
    [FONT_REGULAR, FONT_BOLD]
        .iter()
        .any(|font| stroom.contains(&glief_hex(font, woord)))
}

/// Eén staaltoets, zodat er een rapport is om de uitgangspunten in te zetten.
fn proefstaaf() -> BeamCheckResult {
    BeamCheckResult {
        beam_id: 1,
        profile_name: "HEA160".into(),
        steel_grade: "S235".into(),
        classification: CrossSectionClass::Class1,
        checks: vec![NamedCheck {
            id: "comp".into(),
            kind: CheckKind::Resistance(ResistanceCalc {
                deelstappen: Vec::new(),
                id: "comp".into(),
                title: "Compression resistance — 6.2.4".into(),
                article: "EN 1993-1-1 §6.2.4".into(),
                force_state: ForceStateSnapshot {
                    combination_id: 1,
                    position_mm: 0.0,
                    forces: InternalForces {
                        n_ed: -10.0,
                        vy_ed: 0.0,
                        vz_ed: 0.0,
                        mt_ed: 0.0,
                        my_ed: 0.0,
                        mz_ed: 0.0,
                    },
                },
                formula_latex: "N_{c,Rd} = A · f_y / γ_{M0}".into(),
                variables: Vec::new(),
                value: 910.0,
                unit: "kN".into(),
                uc: Some(UnityCheck {
                    ed: 10.0,
                    rd: 910.0,
                    uc: 0.011,
                    formula_latex: "UC = N_{Ed} / N_{c,Rd}".into(),
                }),
                status: CheckStatus::Ok,
                notes: Vec::new(),
            }),
        }],
        uc_max: 0.011,
        status: CheckStatus::Ok,
        governing_check_id: "comp".into(),
        verloop: None,
    }
}

const WIND: &str = "Wind op een vrijstaand dak (open overkapping) volgens NEN-EN 1991-1-4 §7.3: referentiehoogte z_e = h (§7.3(8)); nettodrukcoëfficiënten c_p,net en globale krachtcoëfficiënten c_f uit tabel 7.6 (lessenaarsdak) of 7.7 (zadel- of kieldak), lineair geïnterpoleerd tussen φ = 0 en φ = 1 (§7.3(3)); c_f aangrijpend zoals figuur 7.16/7.17 (§7.3(6)). Positief = netto neerwaarts.
Wind vrijstaand dak c_p,net neerwaarts: §7.3 tabel 7.6 (α = 10,0°, φ = 0,50): zone C, c_p,net = +1,60; §7.3 tabel 7.6 (α = 10,0°, φ = 0,50): zone A, c_p,net = +1,20
Wind vrijstaand dak c_f opwaarts, van links: §7.3 tabel 7.6 (α = 10,0°, φ = 0,50): c_f = −1,15, resultante op d/4 van de loefrand (fig. 7.16)";

fn invoer(wind: Option<String>) -> ReportInput {
    ReportInput {
        bijlage: Default::default(),
        project_name: "Carport".into(),
        project_number: "W-16".into(),
        engineer: "Proef".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-17".into(),
        taal: Default::default(),
        steel_check_results: vec![proefstaaf()],
        timber_check_results: vec![],
        clt_check_results: vec![],
        concrete_check_results: vec![],
        stress_check_results: vec![],
        concrete_stiffness_trace: None,
        concrete_dekkingslijnen: Vec::new(),
        concrete_reinforcement_zones: Vec::new(),
        scheefstand_toelichting: None,
        analyse_toelichting: None,
        wind_toelichting: wind,
        plate_results: Vec::new(),
        plate_skipped: Vec::new(),
    }
}

#[test]
fn de_omschrijving_van_de_windlasten_staat_in_de_pdf() {
    let pdf = generate_report_pdf(invoer(Some(WIND.to_string())));
    let stroom = inhoudsstromen(&pdf);
    // Het hoofdstuk en de kop.
    for woord in ["Uitgangspunten", "Windbelasting"] {
        assert!(staat_erin(&stroom, woord), "{woord:?} ontbreekt in de PDF");
    }
    // Per geval: de naam, de tabel, α, φ en de coëfficiënt zelf.
    for woord in ["neerwaarts:", "lessenaarsdak", "10,0°,", "0,50):", "+1,60;", "−1,15,", "loefrand"] {
        assert!(staat_erin(&stroom, woord), "{woord:?} uit de windomschrijving ontbreekt in de PDF");
    }
}

#[test]
fn zonder_windomschrijving_zwijgt_de_pdf_erover() {
    for wind in [None, Some("  \n ".to_string())] {
        let stroom = inhoudsstromen(&generate_report_pdf(invoer(wind)));
        assert!(!staat_erin(&stroom, "Windbelasting"), "een kop zonder windlasten");
        // En zonder scheefstand en analyse ook geen leeg hoofdstuk.
        assert!(!staat_erin(&stroom, "Uitgangspunten"), "een leeg hoofdstuk Uitgangspunten");
    }
}

/// Een oude aanroep zonder het veld blijft geldig (`#[serde(default)]`): de
/// MCP-server en de toetsbrug krijgen JSON, geen Rust-structuur.
#[test]
fn een_aanroep_zonder_het_veld_blijft_geldig() {
    let mut json = serde_json::to_value(invoer(None)).expect("serialiseren");
    json.as_object_mut().unwrap().remove("wind_toelichting");
    let terug: ReportInput = serde_json::from_value(json).expect("zonder wind_toelichting geldig");
    assert!(terug.wind_toelichting.is_none());
}
