//! Smoke test for openaec-layout based PDF generation.
//! Verifies the generator returns a syntactically-valid PDF stream.

use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{
    classification::CrossSectionClass, CheckStatus, NamedValue, ResistanceCalc, UnityCheck,
};
use report::{generate_report_pdf, ReportInput};
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck};

fn dummy_resistance_calc(uc: f64) -> ResistanceCalc {
    ResistanceCalc {
        id: "comp".into(),
        title: "Compression resistance — 6.2.4".into(),
        article: "EN 1993-1-1 §6.2.4".into(),
        force_state: ForceStateSnapshot {
            combination_id: 1,
            position_mm: 1500.0,
            forces: InternalForces {
                n_ed: -150.0,
                vy_ed: 0.0,
                vz_ed: 12.5,
                mt_ed: 0.0,
                my_ed: 38.7,
                mz_ed: 0.0,
            },
        },
        formula_latex: "N_{c,Rd} = A · f_y / γ_{M0}".into(),
        variables: vec![
            NamedValue {
                symbol: "A".into(),
                value: 5430.0,
                unit: "mm²".into(),
            },
            NamedValue {
                symbol: "f_y".into(),
                value: 235.0,
                unit: "MPa".into(),
            },
        ],
        value: 1276.05,
        unit: "kN".into(),
        uc: Some(UnityCheck {
            ed: 150.0,
            rd: 1276.05,
            uc,
            formula_latex: "UC = N_{Ed} / N_{c,Rd}".into(),
        }),
        status: if uc <= 1.0 {
            CheckStatus::Ok
        } else {
            CheckStatus::NotOk
        },
        notes: vec!["Class 1 cross-section; full plastic resistance assumed.".into()],
    }
}

fn dummy_beam(beam_id: u32, profile: &str, uc: f64) -> BeamCheckResult {
    BeamCheckResult {
        beam_id,
        profile_name: profile.into(),
        steel_grade: "S235".into(),
        classification: CrossSectionClass::Class1,
        checks: vec![NamedCheck {
            id: "comp".into(),
            kind: CheckKind::Resistance(dummy_resistance_calc(uc)),
        }],
        uc_max: uc,
        status: if uc <= 1.0 {
            CheckStatus::Ok
        } else {
            CheckStatus::NotOk
        },
        governing_check_id: "comp".into(),
    }
}

#[test]
fn produces_valid_pdf_header() {
    let input = ReportInput {
        project_name: "Smoke Test".into(),
        project_number: "ST-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-05-15".into(),
        steel_check_results: vec![
            dummy_beam(1, "HEB160", 0.42),
            dummy_beam(2, "HEB300", 0.87),
            dummy_beam(3, "UNP350", 1.12),
        ],
    };

    let bytes = generate_report_pdf(input);

    assert!(
        bytes.len() > 1000,
        "PDF should be substantial (got {} bytes)",
        bytes.len()
    );
    assert!(
        bytes.starts_with(b"%PDF-"),
        "PDF must start with %PDF- magic; got: {:?}",
        std::str::from_utf8(&bytes[..bytes.len().min(8)]).unwrap_or("<binary>")
    );
    assert!(
        bytes.windows(5).any(|w| w == b"%%EOF"),
        "PDF must contain %%EOF trailer"
    );

    // Persist for visual inspection. Use process id to avoid file-lock collisions
    // when the previous run's PDF is still open in a viewer.
    let pid = std::process::id();
    let out = std::env::temp_dir().join(format!("openaec_layout_smoke_{}.pdf", pid));
    std::fs::write(&out, &bytes).expect("write smoke PDF");
    eprintln!("[smoke] wrote {} bytes to {}", bytes.len(), out.display());
}
