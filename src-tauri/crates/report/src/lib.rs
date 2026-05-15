//! Native PDF report generation via genpdf — purpose-built layout library.
//! Replaces manual printpdf coordinate plotting with a proper layout engine.
//!
//! Fonts: Liberation Sans (OFL), bundled via include_bytes!.

use genpdf::{
    elements::{Break, FrameCellDecorator, LinearLayout, PageBreak, Paragraph, TableLayout},
    fonts,
    style::{Color, Style, StyledString},
    Document, Element, Margins, SimplePageDecorator,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use steel_check::result::{BeamCheckResult, CheckKind};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue};

// ── Bundled fonts (Liberation Sans, OFL licence) ──────────────────────────────

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");
const FONT_ITALIC: &[u8] = include_bytes!("../fonts/LiberationSans-Italic.ttf");
const FONT_BOLD_ITALIC: &[u8] = include_bytes!("../fonts/LiberationSans-BoldItalic.ttf");

// ── OpenAEC colour palette ────────────────────────────────────────────────────

const C_AMBER:    Color = Color::Rgb(217, 119,   6);  // #D97706
const C_DEEP:     Color = Color::Rgb( 54,  54,  62);  // #36363E
const C_TEXT:     Color = Color::Rgb( 38,  38,  46);
const C_MUTED:    Color = Color::Rgb( 87,  83,  78);
const C_OK:       Color = Color::Rgb( 22, 163,  74);  // #16A34A
const C_FAIL:     Color = Color::Rgb(220,  38,  38);  // #DC2626

// ── Input types ───────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ReportInput {
    pub project_name:        String,
    pub project_number:      String,
    pub engineer:            String,
    pub company:             String,
    pub date:                String,
    pub steel_check_results: Vec<BeamCheckResult>,
}

// ── Style helpers ─────────────────────────────────────────────────────────────

fn s_h1()    -> Style { Style::new().bold().with_font_size(22).with_color(C_TEXT)  }
fn s_h2()    -> Style { Style::new().bold().with_font_size(14).with_color(C_TEXT)  }
fn s_h3()    -> Style { Style::new().bold().with_font_size(11).with_color(C_TEXT)  }
fn s_label() -> Style { Style::new().bold().with_font_size(9) .with_color(C_AMBER) }
fn s_body()  -> Style { Style::new()      .with_font_size(9) .with_color(C_TEXT)  }
fn s_mono()  -> Style { Style::new()      .with_font_size(8) .with_color(C_MUTED) }
fn s_note()  -> Style { Style::new().italic().with_font_size(7).with_color(C_MUTED)}
fn s_amber_bold(pt: u8) -> Style { Style::new().bold().with_font_size(pt).with_color(C_AMBER) }
fn s_col(col: Color) -> Style { Style::new().bold().with_font_size(9).with_color(col) }

// Paragraph builder helpers
fn para(text: impl Into<String>, style: Style) -> Paragraph {
    Paragraph::new(StyledString::new(text.into(), style))
}

// ── Public entry point ────────────────────────────────────────────────────────

pub fn generate_report_pdf(input: ReportInput) -> Vec<u8> {
    // Load font family from embedded bytes
    let font_family = fonts::FontFamily {
        regular:    fonts::FontData::new(FONT_REGULAR.to_vec(), None).expect("font regular"),
        bold:       fonts::FontData::new(FONT_BOLD.to_vec(), None).expect("font bold"),
        italic:     fonts::FontData::new(FONT_ITALIC.to_vec(), None).expect("font italic"),
        bold_italic: fonts::FontData::new(FONT_BOLD_ITALIC.to_vec(), None).expect("font bold italic"),
    };

    let mut doc = Document::new(font_family);
    doc.set_title("EN 1993 Steel Check Report");
    doc.set_minimal_conformance();
    doc.set_line_spacing(1.2);
    doc.set_font_size(9);

    // Page decorator: margins + header on every page
    let project_clone = input.project_name.clone();
    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(Margins::trbl(20, 15, 20, 15));
    decorator.set_header(move |page: usize| {
        let mut row = LinearLayout::vertical();
        // Header line: "OpenAEC — <project> — p.<n>"
        let mut hdr = Paragraph::default();
        hdr.push_styled("Open", Style::new().bold().with_font_size(11).with_color(C_DEEP));
        hdr.push_styled("AEC", Style::new().bold().with_font_size(11).with_color(C_AMBER));
        hdr.push_styled(
            format!("   EN 1993 Steel Check   {}   p. {}", project_clone, page),
            s_mono(),
        );
        row.push(hdr);
        // Thin amber underline represented as a short break (genpdf has no horizontal rule built-in)
        row.push(Break::new(0.5));
        row
    });
    doc.set_page_decorator(decorator);

    // ═══════════════════════════════════════════════════════
    //  COVER PAGE
    // ═══════════════════════════════════════════════════════
    doc.push(Break::new(3.0));
    doc.push(para("Open", Style::new().bold().with_font_size(36).with_color(C_DEEP)));
    {
        let mut p = Paragraph::default();
        p.push_styled("AEC", Style::new().bold().with_font_size(36).with_color(C_AMBER));
        p.push_styled(
            "   Foundation",
            Style::new().with_font_size(20).with_color(C_MUTED),
        );
        doc.push(p);
    }
    doc.push(Break::new(1.5));
    doc.push(para("EN 1993-1-1 Steel Check Report", s_h1()));
    doc.push(Break::new(0.5));
    doc.push(para(input.project_name.as_str(), Style::new().with_font_size(13).with_color(C_MUTED)));
    doc.push(Break::new(3.0));

    // Project info table (2 col: label | value)
    let mut info = TableLayout::new(vec![3, 7]);
    info.set_cell_decorator(FrameCellDecorator::new(false, false, false));
    let info_rows: &[(&str, &str)] = &[
        ("Project",     &input.project_name),
        ("Number",      &input.project_number),
        ("Engineer",    &input.engineer),
        ("Company",     &input.company),
        ("Date",        &input.date),
        ("Standards",   "NEN-EN 1993-1-1+C2+A1/NB:2016 nl"),
    ];
    for (label, val) in info_rows {
        info.row()
            .element(para(*label, s_label()).padded(Margins::trbl(1, 2, 1, 0)))
            .element(para(*val,   s_body()).padded(Margins::trbl(1, 0, 1, 2)))
            .push()
            .expect("info row");
    }
    doc.push(info);
    doc.push(PageBreak::new());

    // ═══════════════════════════════════════════════════════
    //  SUMMARY TABLE
    // ═══════════════════════════════════════════════════════
    doc.push(para("Summary — Unity Checks", s_h2()));
    doc.push(Break::new(0.5));

    // columns: Beam | Profile | Grade | UC | Governing check | Status
    let mut summary = TableLayout::new(vec![1, 3, 2, 1, 4, 2]);
    summary.set_cell_decorator(FrameCellDecorator::new(true, true, false));

    // Header
    summary.row()
        .element(para("Beam",      s_label()).padded(2))
        .element(para("Profile",   s_label()).padded(2))
        .element(para("Grade",     s_label()).padded(2))
        .element(para("UC",        s_label()).padded(2))
        .element(para("Governing", s_label()).padded(2))
        .element(para("Status",    s_label()).padded(2))
        .push().expect("summary header");

    for r in &input.steel_check_results {
        let uc_col   = if r.uc_max > 1.0 { C_FAIL } else { C_OK };
        let (sl, sc) = status_label_col(&r.status);
        summary.row()
            .element(para(r.beam_id.to_string(),    s_body()).padded(2))
            .element(para(r.profile_name.as_str(),  s_body()).padded(2))
            .element(para(r.steel_grade.as_str(),   s_body()).padded(2))
            .element(para(format!("{:.2}", r.uc_max), s_col(uc_col)).padded(2))
            .element(para(r.governing_check_id.as_str(), s_mono()).padded(2))
            .element(para(sl,                        s_col(sc)).padded(2))
            .push().expect("summary row");
    }
    doc.push(summary);

    // ═══════════════════════════════════════════════════════
    //  PER-BEAM DERIVATION PAGES
    // ═══════════════════════════════════════════════════════
    for (idx, r) in input.steel_check_results.iter().enumerate() {
        doc.push(PageBreak::new());

        // Beam heading
        doc.push(para(
            format!(
                "{}. Beam {} — {} ({})",
                idx + 1, r.beam_id, r.profile_name, r.steel_grade
            ),
            s_h2(),
        ));
        doc.push(Break::new(1.0));

        for nc in &r.checks {
            render_check(&mut doc, &nc.kind);
        }
    }

    // Render to bytes
    let mut buf = Vec::new();
    doc.render(&mut buf).expect("genpdf render");
    buf
}

// ── Per-check block ───────────────────────────────────────────────────────────

fn render_check(doc: &mut Document, kind: &CheckKind) {
    // Extract common fields (mirrors the printpdf version's extract_fields)
    let (title, article, combo, pos, ned, vzed, myed,
         formula, variables, value, unit,
         uc_ed, uc_rd, uc_uc,
         status, notes, intermediates) = extract(kind);

    // Title + article ref
    {
        let mut p = Paragraph::default();
        p.push_styled(title, s_h3());
        p.push_styled(format!("    {}", article),
            Style::new().with_font_size(8).with_color(C_AMBER));
        doc.push(p);
    }

    // Force state
    doc.push(para(
        format!(
            "Comb: {}  x = {:.0} mm  N_Ed = {:.2} kN  V_Ed = {:.2} kN  M_Ed = {:.2} kNm",
            combo, pos, ned, vzed, myed
        ),
        s_mono(),
    ));

    // Formula
    doc.push(para(formula, s_body()));

    // Variables (one condensed line)
    if !variables.is_empty() {
        let vars: String = variables.iter()
            .map(|v| format!("{} = {:.3} {}", v.symbol, v.value, v.unit))
            .collect::<Vec<_>>()
            .join("   ");
        doc.push(para(vars, s_mono()));
    }

    // Result value
    doc.push(para(format!("= {:.3} {}", value, unit), s_amber_bold(9)));

    // UC + status
    if uc_uc.is_some() {
        let uc_str = format!(
            "UC = {:.3} / {:.3} = {:.3}",
            uc_ed.unwrap_or(0.0),
            uc_rd.unwrap_or(0.0),
            uc_uc.unwrap_or(0.0),
        );
        let (sl, sc) = status_label_col(status);
        let mut p = Paragraph::default();
        p.push_styled(uc_str, s_body());
        p.push_styled(format!("    {}", sl), s_col(sc));
        doc.push(p);
    } else {
        let (sl, sc) = status_label_col(status);
        doc.push(para(sl, s_col(sc)));
    }

    // Intermediate values
    if !intermediates.is_empty() {
        let iline: String = intermediates.iter()
            .map(|v| format!("{} = {:.3}", v.symbol, v.value))
            .collect::<Vec<_>>()
            .join("   ");
        doc.push(para(iline, s_mono()));
    }

    // Notes
    for note in notes {
        doc.push(para(note.as_str(), s_note()));
    }

    doc.push(Break::new(0.7));
}

// ── Field extraction (avoids duplicating match in two places) ─────────────────

#[allow(clippy::type_complexity)]
fn extract(kind: &CheckKind) -> (
    &str, &str,             // title, article
    u32, f64,               // combo, pos
    f64, f64, f64,          // ned, vzed, myed
    &str,                   // formula
    &[NamedValue],          // variables
    f64, &str,              // value, unit
    Option<f64>, Option<f64>, Option<f64>, // uc_ed, uc_rd, uc_uc
    &CheckStatus,           // status
    &[String],              // notes
    &[NamedValue],          // intermediates
) {
    match kind {
        CheckKind::Resistance(r) => (
            &r.title, &r.article,
            r.force_state.combination_id, r.force_state.position_mm,
            r.force_state.forces.n_ed, r.force_state.forces.vz_ed, r.force_state.forces.my_ed,
            &r.formula_latex,
            &r.variables,
            r.value, &r.unit,
            r.uc.as_ref().map(|u| u.ed),
            r.uc.as_ref().map(|u| u.rd),
            r.uc.as_ref().map(|u| u.uc),
            &r.status, &r.notes,
            &[],
        ),
        CheckKind::Stability(s) => (
            &s.title, &s.article,
            s.force_state.combination_id, s.force_state.position_mm,
            s.force_state.forces.n_ed, s.force_state.forces.vz_ed, s.force_state.forces.my_ed,
            &s.formula_latex,
            &s.variables,
            s.value, &s.unit,
            s.uc.as_ref().map(|u| u.ed),
            s.uc.as_ref().map(|u| u.rd),
            s.uc.as_ref().map(|u| u.uc),
            &s.status, &s.notes,
            &s.intermediate_values,
        ),
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────

fn status_label_col(s: &CheckStatus) -> (&'static str, Color) {
    match s {
        CheckStatus::Ok            => ("OK",   C_OK),
        CheckStatus::NotOk         => ("FAIL", C_FAIL),
        CheckStatus::NotApplicable => ("N/A",  C_MUTED),
    }
}
