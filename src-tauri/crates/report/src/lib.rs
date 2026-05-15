//! Native PDF report generation using printpdf 0.7.
//! Produces OpenAEC-branded A4 PDF with EN 1993-1-1 derivation sections.

use printpdf::*;
use printpdf::path::{PaintMode, WindingOrder};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use steel_check::result::{BeamCheckResult, CheckKind};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue};
use std::io::{BufWriter, Cursor};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ReportInput {
    pub project_name: String,
    pub project_number: String,
    pub engineer: String,
    pub company: String,
    pub date: String,
    pub steel_check_results: Vec<BeamCheckResult>,
}

// ── Layout constants (f32 — printpdf Mm takes f32) ───────────────────────────

const A4_W: f32 = 210.0;
const A4_H: f32 = 297.0;
const M: f32 = 15.0; // margin

// OpenAEC colour palette (RGB 0.0–1.0)
const AMBER:    (f32, f32, f32) = (0.851, 0.467, 0.024); // #D97706
const FORGE:    (f32, f32, f32) = (0.212, 0.212, 0.243); // #36363E
const TEXT:     (f32, f32, f32) = (0.15,  0.15,  0.18);
const MUTED:    (f32, f32, f32) = (0.44,  0.43,  0.41);
const OK_GRN:   (f32, f32, f32) = (0.086, 0.639, 0.290);
const FAIL_RED: (f32, f32, f32) = (0.863, 0.149, 0.149);
const WHITE:    (f32, f32, f32) = (1.0,   1.0,   1.0);
const SUBTEXT:  (f32, f32, f32) = (0.63,  0.63,  0.67);

// ── Builder ───────────────────────────────────────────────────────────────────

struct PdfBuilder {
    doc: PdfDocumentReference,
    regular: IndirectFontRef,
    bold:    IndirectFontRef,
    mono:    IndirectFontRef,
    // current page/layer indices (updated on add_page)
    cur_page:  PdfPageIndex,
    cur_layer: PdfLayerIndex,
}

impl PdfBuilder {
    fn new(title: &str) -> Self {
        let (doc, page, layer) =
            PdfDocument::new(title, Mm(A4_W), Mm(A4_H), "L1");
        let regular = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();
        let bold    = doc.add_builtin_font(BuiltinFont::HelveticaBold).unwrap();
        let mono    = doc.add_builtin_font(BuiltinFont::Courier).unwrap();
        Self { doc, regular, bold, mono, cur_page: page, cur_layer: layer }
    }

    fn layer(&self) -> PdfLayerReference {
        self.doc.get_page(self.cur_page).get_layer(self.cur_layer)
    }

    fn add_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(A4_W), Mm(A4_H), "L1");
        self.cur_page  = page;
        self.cur_layer = layer;
    }

    // Draw a filled rectangle (x, y = bottom-left corner in mm, all f32)
    fn rect(&self, x: f32, y: f32, w: f32, h: f32, fill: (f32, f32, f32)) {
        let layer = self.layer();
        layer.set_fill_color(Color::Rgb(Rgb::new(fill.0, fill.1, fill.2, None)));
        let pts: Vec<(Point, bool)> = vec![
            (Point::new(Mm(x),     Mm(y)),     false),
            (Point::new(Mm(x + w), Mm(y)),     false),
            (Point::new(Mm(x + w), Mm(y + h)), false),
            (Point::new(Mm(x),     Mm(y + h)), false),
        ];
        let poly = Polygon {
            rings: vec![pts],
            mode: PaintMode::Fill,
            winding_order: WindingOrder::NonZero,
        };
        layer.add_polygon(poly);
    }

    // Draw text at (x, y) in mm, font_size in pt (all f32)
    fn text(&self, s: &str, x: f32, y: f32, pt: f32, font: u8, col: (f32, f32, f32)) {
        if s.is_empty() { return; }
        // Sanitise to ASCII-printable — builtin fonts only handle Windows-1252
        let safe: String = s.chars().map(|c| if c as u32 > 127 { '?' } else { c }).collect();
        let f = match font {
            1 => &self.bold,
            2 => &self.mono,
            _ => &self.regular,
        };
        let layer = self.layer();
        layer.set_fill_color(Color::Rgb(Rgb::new(col.0, col.1, col.2, None)));
        layer.use_text(&safe, pt, Mm(x), Mm(y), f);
    }

    fn save(self) -> Vec<u8> {
        let buf: Vec<u8> = Vec::new();
        let cursor = Cursor::new(buf);
        let mut writer = BufWriter::new(cursor);
        self.doc.save(&mut writer).expect("PDF save failed");
        writer.into_inner().unwrap().into_inner()
    }
}

// Font aliases (match font arg)
const REG:  u8 = 0;
const BOLD: u8 = 1;
const MONO: u8 = 2;

// ── Chrome (header + footer) ──────────────────────────────────────────────────

fn chrome(b: &PdfBuilder, project: &str, engineer: &str, date: &str, page: u32) {
    // Header band (top 38 mm)
    b.rect(0.0, A4_H - 38.0, A4_W, 38.0, FORGE);
    // Amber underline strip
    b.rect(0.0, A4_H - 39.5, A4_W, 1.5, AMBER);

    // Logo
    b.text("Open",  M,       A4_H - 18.0, 18.0, BOLD, WHITE);
    b.text("AEC",   M + 23.0, A4_H - 18.0, 18.0, BOLD, AMBER);
    b.text("Build free. Build together.", M, A4_H - 25.0, 7.0, REG, SUBTEXT);

    // Right metadata
    let rx = A4_W - 85.0;
    b.text("Project:",  rx,       A4_H - 14.0, 8.0, BOLD, WHITE);
    b.text(project,     rx + 22.0, A4_H - 14.0, 8.0, REG, SUBTEXT);
    b.text("Engineer:", rx,       A4_H - 20.0, 8.0, BOLD, WHITE);
    b.text(engineer,    rx + 22.0, A4_H - 20.0, 8.0, REG, SUBTEXT);
    b.text("Date:",     rx,       A4_H - 26.0, 8.0, BOLD, WHITE);
    b.text(date,        rx + 22.0, A4_H - 26.0, 8.0, REG, SUBTEXT);

    // Footer band (bottom 15 mm)
    b.rect(0.0, 0.0, A4_W, 15.0, FORGE);
    b.rect(0.0, 15.0, A4_W, 1.0, AMBER);

    b.text("Open",                     M,              5.0, 8.0, BOLD, WHITE);
    b.text("AEC",                      M + 11.0,       5.0, 8.0, BOLD, AMBER);
    b.text("EN 1993 Steel Check",      A4_W / 2.0 - 25.0, 5.0, 8.0, REG, SUBTEXT);
    b.text(&format!("p. {}", page),    A4_W - 28.0,   5.0, 8.0, MONO, AMBER);
}

// ── Per-check rendering ───────────────────────────────────────────────────────

struct CheckFields<'a> {
    title:         &'a str,
    article:       &'a str,
    combo:         u32,
    pos:           f64,
    ned:           f64,
    vzed:          f64,
    myed:          f64,
    formula:       &'a str,
    variables:     &'a [NamedValue],
    value:         f64,
    unit:          &'a str,
    uc_opt:        Option<&'a nen_en_1993_1_1_section::UnityCheck>,
    status:        &'a CheckStatus,
    notes:         &'a [String],
    intermediates: &'a [NamedValue],
}

fn extract_fields(kind: &CheckKind) -> CheckFields<'_> {
    match kind {
        CheckKind::Resistance(r) => CheckFields {
            title:         &r.title,
            article:       &r.article,
            combo:         r.force_state.combination_id,
            pos:           r.force_state.position_mm,
            ned:           r.force_state.forces.n_ed,
            vzed:          r.force_state.forces.vz_ed,
            myed:          r.force_state.forces.my_ed,
            formula:       &r.formula_latex,
            variables:     &r.variables,
            value:         r.value,
            unit:          &r.unit,
            uc_opt:        r.uc.as_ref(),
            status:        &r.status,
            notes:         &r.notes,
            intermediates: &[],
        },
        CheckKind::Stability(s) => CheckFields {
            title:         &s.title,
            article:       &s.article,
            combo:         s.force_state.combination_id,
            pos:           s.force_state.position_mm,
            ned:           s.force_state.forces.n_ed,
            vzed:          s.force_state.forces.vz_ed,
            myed:          s.force_state.forces.my_ed,
            formula:       &s.formula_latex,
            variables:     &s.variables,
            value:         s.value,
            unit:          &s.unit,
            uc_opt:        s.uc.as_ref(),
            status:        &s.status,
            notes:         &s.notes,
            intermediates: &s.intermediate_values,
        },
    }
}

fn render_check(
    b: &mut PdfBuilder,
    mut y: f32,
    kind: &CheckKind,
    input: &ReportInput,
    page_num: &mut u32,
) -> f32 {
    let f = extract_fields(kind);

    // Page break
    if y < 55.0 {
        *page_num += 1;
        b.add_page();
        chrome(b, &input.project_name, &input.engineer, &input.date, *page_num);
        y = A4_H - 50.0;
    }

    // Title row
    b.text(f.title,   M,            y, 11.0, BOLD, TEXT);
    b.text(f.article, A4_W - 58.0,  y, 8.0,  MONO, AMBER);
    y -= 5.0;

    // Force state
    let fs = format!(
        "Comb: {}  x={:.0}mm  NEd={:.1}kN  VEd={:.1}kN  MEd={:.1}kNm",
        f.combo, f.pos, f.ned, f.vzed, f.myed
    );
    b.text(&fs, M, y, 7.0, MONO, MUTED);
    y -= 4.5;

    // Formula
    b.text(f.formula, M, y, 8.5, MONO, TEXT);
    y -= 4.5;

    // Variables (one line)
    if !f.variables.is_empty() {
        let line: String = f.variables.iter()
            .map(|v| format!("{}={:.3}{}", v.symbol, v.value, v.unit))
            .collect::<Vec<_>>().join("  ");
        b.text(&line, M, y, 7.5, MONO, MUTED);
        y -= 4.5;
    }

    // Result value
    b.text(&format!("= {:.3} {}", f.value, f.unit), M, y, 9.0, BOLD, AMBER);
    y -= 4.5;

    // UC + status
    if let Some(uc) = f.uc_opt {
        let uc_line = format!(
            "UC = {:.3} / {:.3} = {:.3}",
            uc.ed, uc.rd, uc.uc
        );
        b.text(&uc_line, M, y, 8.5, MONO, TEXT);

        let (label, col) = match f.status {
            CheckStatus::Ok             => ("OK",   OK_GRN),
            CheckStatus::NotOk          => ("FAIL", FAIL_RED),
            CheckStatus::NotApplicable  => ("N/A",  MUTED),
        };
        b.text(label, M + 75.0, y, 8.5, BOLD, col);
        y -= 4.5;
    } else {
        let (label, col) = match f.status {
            CheckStatus::Ok             => ("OK",   OK_GRN),
            CheckStatus::NotOk          => ("FAIL", FAIL_RED),
            CheckStatus::NotApplicable  => ("N/A",  MUTED),
        };
        b.text(label, M, y, 8.5, BOLD, col);
        y -= 4.5;
    }

    // Intermediates
    if !f.intermediates.is_empty() {
        let iline: String = f.intermediates.iter()
            .map(|v: &NamedValue| format!("{}={:.3}", v.symbol, v.value))
            .collect::<Vec<_>>().join("  ");
        b.text(&iline, M, y, 7.0, MONO, MUTED);
        y -= 4.0;
    }

    // Notes
    for note in f.notes {
        b.text(note, M, y, 7.0, REG, MUTED);
        y -= 4.0;
    }

    // Divider line
    y -= 2.0;
    b.rect(M, y, A4_W - 2.0 * M, 0.3, (0.85, 0.85, 0.85));
    y -= 3.0;

    y
}

// ── Public entry point ────────────────────────────────────────────────────────

pub fn generate_report_pdf(input: ReportInput) -> Vec<u8> {
    let mut b = PdfBuilder::new("EN 1993 Steel Check Report");
    let mut page_num: u32 = 1;

    // ── Cover page ────────────────────────────────────────────────────────────
    chrome(&b, &input.project_name, &input.engineer, &input.date, page_num);

    b.text("EN 1993-1-1",       M, A4_H - 70.0,  28.0, BOLD, TEXT);
    b.text("Steel Check Report", M, A4_H - 82.0,  18.0, REG,  MUTED);

    let info: &[(&str, &str)] = &[
        ("Project",      &input.project_name),
        ("Nr",           &input.project_number),
        ("Engineer",     &input.engineer),
        ("Company",      &input.company),
        ("Date",         &input.date),
        ("Standard",     "NEN-EN 1993-1-1+C2+A1/NB:2016 nl"),
    ];
    let mut y = A4_H - 105.0;
    for (label, val) in info {
        b.text(label,  M,        y, 9.0, BOLD, AMBER);
        b.text(val,    M + 38.0, y, 9.0, REG,  TEXT);
        y -= 6.0;
    }

    // ── Summary table ─────────────────────────────────────────────────────────
    page_num += 1;
    b.add_page();
    chrome(&b, &input.project_name, &input.engineer, &input.date, page_num);

    b.text("Summary — Unity Checks", M, A4_H - 50.0, 14.0, BOLD, TEXT);
    let mut y = A4_H - 60.0;

    // Header row
    b.text("Beam",      M,       y, 9.0, BOLD, MUTED);
    b.text("Profile",   M + 20.0, y, 9.0, BOLD, MUTED);
    b.text("Grade",     M + 60.0, y, 9.0, BOLD, MUTED);
    b.text("UC",        M + 85.0, y, 9.0, BOLD, MUTED);
    b.text("Governing", M + 100.0, y, 9.0, BOLD, MUTED);
    b.text("Status",    M + 155.0, y, 9.0, BOLD, MUTED);
    y -= 1.5;
    b.rect(M, y, A4_W - 2.0 * M, 0.4, AMBER);
    y -= 4.0;

    for r in &input.steel_check_results {
        b.text(&r.beam_id.to_string(),     M,        y, 9.0, MONO, TEXT);
        b.text(&r.profile_name,            M + 20.0, y, 9.0, REG,  TEXT);
        b.text(&r.steel_grade,             M + 60.0, y, 9.0, REG,  TEXT);
        let uc_col = if r.uc_max > 1.0 { FAIL_RED } else { OK_GRN };
        b.text(&format!("{:.2}", r.uc_max), M + 85.0, y, 9.0, BOLD, uc_col);
        b.text(&r.governing_check_id,      M + 100.0, y, 8.0, MONO, MUTED);
        let (slabel, scol) = match r.status {
            CheckStatus::Ok            => ("OK",   OK_GRN),
            CheckStatus::NotOk         => ("FAIL", FAIL_RED),
            CheckStatus::NotApplicable => ("N/A",  MUTED),
        };
        b.text(slabel, M + 155.0, y, 9.0, BOLD, scol);
        y -= 5.0;

        if y < 30.0 {
            page_num += 1;
            b.add_page();
            chrome(&b, &input.project_name, &input.engineer, &input.date, page_num);
            y = A4_H - 50.0;
        }
    }

    // ── Per-beam derivation pages ─────────────────────────────────────────────
    for (idx, r) in input.steel_check_results.iter().enumerate() {
        page_num += 1;
        b.add_page();
        chrome(&b, &input.project_name, &input.engineer, &input.date, page_num);

        let heading = format!(
            "{}. Beam {} — {} ({})",
            idx + 1, r.beam_id, r.profile_name, r.steel_grade
        );
        b.text(&heading, M, A4_H - 50.0, 13.0, BOLD, TEXT);

        let mut y = A4_H - 60.0;
        for nc in &r.checks {
            y = render_check(&mut b, y, &nc.kind, &input, &mut page_num);
        }
    }

    b.save()
}
