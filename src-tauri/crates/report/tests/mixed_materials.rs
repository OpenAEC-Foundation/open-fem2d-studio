//! Gemengd rapport: staal (EN 1993-1-1) én hout (EN 1995-1-1) in één PDF.
//!
//! Wat deze test hard aantoont:
//! - `report_members` levert ALLE staven (staal + hout) gesorteerd op staaf-id,
//!   met de juiste norm-, doorsnede- en klasselabels — dit is exact de bron
//!   waaruit de samenvattingstabel en de per-staaf-blokken worden gerenderd.
//! - `norms_line` toont alleen de normen waarvan resultaten aanwezig zijn.
//! - De gerenderde PDF is syntactisch geldig en telt één pagina per staaf
//!   (cover + samenvatting + n staven); een rapport mét houtstaaf heeft
//!   aantoonbaar één pagina méér dan hetzelfde rapport zonder.
//!
//! Wat deze test NIET kan aantonen: letterlijke tekst in de PDF-stream.
//! openaec-layout schrijft tekst via TTF-glyph-encoding (printpdf
//! `write_text`), waardoor strings als "HEB160" niet grep-baar zijn in de
//! bytes. De inhoudsgarantie loopt daarom via `report_members`/`norms_line`
//! (zelfde codepad als de renderer) plus de pagina-telling.

use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{
    classification::CrossSectionClass, CheckStatus, NamedValue, ResistanceCalc, UnityCheck,
};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use report::{generate_report_pdf, norms_line, report_members, ReportInput};
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck};
use timber_check::TimberBeamCheckResult;

// ── Testdata ─────────────────────────────────────────────────────────────────

fn dummy_check(id: &str, title: &str, article: &str, uc: f64) -> NamedCheck {
    NamedCheck {
        id: id.into(),
        kind: CheckKind::Resistance(ResistanceCalc {
            id: id.into(),
            title: title.into(),
            article: article.into(),
            force_state: ForceStateSnapshot {
                combination_id: 1,
                position_mm: 1250.0,
                forces: InternalForces {
                    n_ed: -120.0,
                    vy_ed: 0.0,
                    vz_ed: 8.0,
                    mt_ed: 0.0,
                    my_ed: 22.5,
                    mz_ed: 0.0,
                },
            },
            formula_latex: "X_d = X_k · k / γ_M".into(),
            variables: vec![NamedValue {
                symbol: "X_k".into(),
                value: 24.0,
                unit: "MPa".into(),
            }],
            value: 14.77,
            unit: "MPa".into(),
            uc: Some(UnityCheck {
                ed: 10.0,
                rd: 14.77,
                uc,
                formula_latex: "UC = E_d / R_d".into(),
            }),
            status: if uc <= 1.0 {
                CheckStatus::Ok
            } else {
                CheckStatus::NotOk
            },
            notes: vec![],
        }),
    }
}

fn steel_beam(beam_id: u32, uc: f64) -> BeamCheckResult {
    BeamCheckResult {
        beam_id,
        profile_name: "HEB160".into(),
        steel_grade: "S235".into(),
        classification: CrossSectionClass::Class1,
        checks: vec![dummy_check("comp", "Compression resistance", "EN 1993-1-1 §6.2.4", uc)],
        uc_max: uc,
        status: CheckStatus::Ok,
        governing_check_id: "comp".into(),
    }
}

fn timber_beam(beam_id: u32, uc: f64) -> TimberBeamCheckResult {
    TimberBeamCheckResult {
        beam_id,
        section_name: "96 x 450".into(),
        strength_class: "C24".into(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        checks: vec![dummy_check("bending", "Buiging", "EN 1995-1-1 §6.1.6", uc)],
        uc_max: uc,
        status: CheckStatus::Ok,
        governing_check_id: "bending".into(),
    }
}

fn input(steel: Vec<BeamCheckResult>, timber: Vec<TimberBeamCheckResult>) -> ReportInput {
    ReportInput {
        project_name: "Gemengd raamwerk".into(),
        project_number: "MX-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-02".into(),
        steel_check_results: steel,
        timber_check_results: timber,
    }
}

// ── PDF-hulpfunctie ──────────────────────────────────────────────────────────

/// Leest het paginatal uit de Pages-boom: printpdf schrijft
/// `<</Type/Pages/Count N/Kids[...]>>` (zonder spaties in de names).
fn count_pages(bytes: &[u8]) -> usize {
    let needle = b"/Type/Pages/Count ";
    let start = bytes
        .windows(needle.len())
        .position(|w| w == needle)
        .expect("PDF moet een /Type/Pages/Count bevatten")
        + needle.len();
    let digits: String = bytes[start..]
        .iter()
        .take_while(|b| b.is_ascii_digit())
        .map(|&b| b as char)
        .collect();
    digits.parse().expect("Count moet een getal zijn")
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[test]
fn report_members_bevat_staal_en_hout_gesorteerd_op_staaf_id() {
    let inp = input(vec![steel_beam(4, 0.42)], vec![timber_beam(2, 0.81)]);
    let members = report_members(&inp);

    assert_eq!(members.len(), 2, "beide staven moeten in het rapport zitten");

    // Gesorteerd op staaf-id: hout-staaf 2 vóór staal-staaf 4.
    assert_eq!(members[0].beam_id, 2);
    assert_eq!(members[0].norm, "EN 1995-1-1");
    assert_eq!(members[0].section_label, "96 x 450");
    assert_eq!(members[0].grade_label, "C24");
    assert_eq!(members[0].governing_check_id, "bending");
    assert!((members[0].uc_max - 0.81).abs() < 1e-12);
    assert_eq!(members[0].checks.len(), 1);

    assert_eq!(members[1].beam_id, 4);
    assert_eq!(members[1].norm, "EN 1993-1-1");
    assert_eq!(members[1].section_label, "HEB160");
    assert_eq!(members[1].grade_label, "S235");
}

#[test]
fn norms_line_toont_alleen_aanwezige_normen() {
    let staal_alleen = input(vec![steel_beam(1, 0.5)], vec![]);
    let hout_alleen = input(vec![], vec![timber_beam(1, 0.5)]);
    let beide = input(vec![steel_beam(1, 0.5)], vec![timber_beam(2, 0.5)]);

    assert_eq!(norms_line(&staal_alleen), "EN 1993-1-1");
    assert_eq!(norms_line(&hout_alleen), "EN 1995-1-1");
    assert_eq!(norms_line(&beide), "EN 1993-1-1 / EN 1995-1-1");
}

#[test]
fn gemengd_rapport_rendert_geldige_pdf_met_pagina_per_staaf() {
    let met_hout = input(vec![steel_beam(1, 0.42)], vec![timber_beam(2, 0.81)]);
    let zonder_hout = input(vec![steel_beam(1, 0.42)], vec![]);

    let bytes_met = generate_report_pdf(met_hout);
    let bytes_zonder = generate_report_pdf(zonder_hout);

    // Geldige PDF-omhulling
    assert!(bytes_met.len() > 1000, "PDF te klein: {} bytes", bytes_met.len());
    assert!(bytes_met.starts_with(b"%PDF-"), "PDF-magic ontbreekt");
    assert!(
        bytes_met.windows(5).any(|w| w == b"%%EOF"),
        "%%EOF-trailer ontbreekt"
    );

    // Cover (1) + samenvatting (1) + één pagina per staaf.
    assert_eq!(
        count_pages(&bytes_met),
        4,
        "verwacht cover + samenvatting + 2 staafpagina's"
    );
    assert_eq!(
        count_pages(&bytes_zonder),
        3,
        "verwacht cover + samenvatting + 1 staafpagina"
    );

    // Persist voor visuele inspectie.
    let pid = std::process::id();
    let out = std::env::temp_dir().join(format!("openaec_mixed_report_{}.pdf", pid));
    std::fs::write(&out, &bytes_met).expect("write mixed PDF");
    eprintln!("[mixed] wrote {} bytes to {}", bytes_met.len(), out.display());
}

#[test]
fn timber_check_results_heeft_serde_default_voor_bestaande_aanroepen() {
    // Bestaande frontend-aanroepen sturen het veld niet mee — dat moet
    // deserialiseren naar een lege lijst.
    let json = r#"{
        "project_name": "Legacy",
        "project_number": "L-1",
        "engineer": "E",
        "company": "C",
        "date": "2026-09-02",
        "steel_check_results": []
    }"#;
    let parsed: ReportInput = serde_json::from_str(json).expect("legacy JSON moet geldig blijven");
    assert!(parsed.timber_check_results.is_empty());
}
