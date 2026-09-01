//! Steel-check PDF report — built on **OpenAEC Foundation `openaec-layout`**.
//!
//! `openaec-layout` is the Rust equivalent of ReportLab Platypus: Flowables
//! (Paragraph, Table, Spacer, PageBreak) flow through Frames in PageTemplates,
//! and the DocTemplate runs the page-break engine and renders to PDF via
//! printpdf 0.7.
//!
//! Fonts: Liberation Sans (OFL), bundled via include_bytes!.

use openaec_layout::{
    doc_template::{DocTemplate, RawPage},
    draw::DrawList,
    flowable::Flowable,
    fonts::shared_font_registry,
    frame::Frame,
    page_template::{PageCallback, PageTemplate},
    paragraph::{Paragraph, ParagraphStyle},
    spacer::{PageBreak, Spacer},
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt, Rect, Size, A4},
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use nen_en_1993_1_1_section::{CheckStatus, NamedValue};
use steel_check::result::{BeamCheckResult, CheckKind};

// ── Bundled fonts (Liberation Sans, OFL licence) ──────────────────────────────

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");
const FONT_ITALIC: &[u8] = include_bytes!("../fonts/LiberationSans-Italic.ttf");
const FONT_BOLD_ITALIC: &[u8] = include_bytes!("../fonts/LiberationSans-BoldItalic.ttf");

// ── OpenAEC colour palette ────────────────────────────────────────────────────

const C_AMBER: Color = Color::rgb(217, 119, 6); //  #D97706
const C_DEEP: Color = Color::rgb(54, 54, 62); //  #36363E
const C_TEXT: Color = Color::rgb(38, 38, 46); //  near-black
const C_MUTED: Color = Color::rgb(87, 83, 78); //  warm grey
const C_OK: Color = Color::rgb(22, 163, 74); //  #16A34A
const C_FAIL: Color = Color::rgb(220, 38, 38); //  #DC2626
const C_HEADER_BG: Color = Color::rgb(245, 240, 230); //  faint warm tint
const C_DIVIDER: Color = Color::rgb(217, 119, 6); //  amber rule

// ── Input types ───────────────────────────────────────────────────────────────

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

// ── Style helpers ─────────────────────────────────────────────────────────────
// Stylesheet palette — some helpers are unused right now but kept so the
// cover/page-decoration code can pick them up without re-deriving values.
#[allow(dead_code)]
fn style_h1() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(22.0),
        leading: Pt(26.0),
        text_color: C_TEXT,
        space_before: Pt(0.0),
        space_after: Pt(6.0),
        bold: true,
        ..Default::default()
    }
}

fn style_h2() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(14.0),
        leading: Pt(17.0),
        text_color: C_TEXT,
        space_before: Pt(8.0),
        space_after: Pt(4.0),
        bold: true,
        ..Default::default()
    }
}

fn style_h3() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(11.0),
        leading: Pt(14.0),
        text_color: C_TEXT,
        space_before: Pt(6.0),
        space_after: Pt(2.0),
        bold: true,
        ..Default::default()
    }
}

#[allow(dead_code)]
fn style_label() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(8.5),
        leading: Pt(11.0),
        text_color: C_AMBER,
        space_after: Pt(1.0),
        bold: true,
        ..Default::default()
    }
}

fn style_body() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(9.5),
        leading: Pt(12.5),
        text_color: C_TEXT,
        space_after: Pt(2.0),
        ..Default::default()
    }
}

fn style_mono() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(8.5),
        leading: Pt(11.0),
        text_color: C_MUTED,
        space_after: Pt(1.0),
        ..Default::default()
    }
}

fn style_note() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(7.5),
        leading: Pt(10.0),
        text_color: C_MUTED,
        space_after: Pt(1.0),
        italic: true,
        ..Default::default()
    }
}

fn style_amber_value() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(10.0),
        leading: Pt(13.0),
        text_color: C_AMBER,
        space_after: Pt(2.0),
        bold: true,
        ..Default::default()
    }
}

fn style_uc(uc_color: Color) -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(9.5),
        leading: Pt(12.5),
        text_color: uc_color,
        space_after: Pt(2.0),
        bold: true,
        ..Default::default()
    }
}

// ── Public entry point ────────────────────────────────────────────────────────

pub fn generate_report_pdf(input: ReportInput) -> Vec<u8> {
    // 1. Font registry — register Liberation Sans variants by their OpenAEC names.
    let fonts = shared_font_registry();
    {
        let mut reg = fonts.lock().unwrap();
        reg.register_ttf_bytes("LiberationSans-Regular", FONT_REGULAR.to_vec())
            .expect("register regular font");
        reg.register_ttf_bytes("LiberationSans-Bold", FONT_BOLD.to_vec())
            .expect("register bold font");
        reg.register_ttf_bytes("LiberationSans-Italic", FONT_ITALIC.to_vec())
            .expect("register italic font");
        reg.register_ttf_bytes(
            "LiberationSans-BoldItalic",
            FONT_BOLD_ITALIC.to_vec(),
        )
        .expect("register bold-italic font");
        // Alias so `style.font_name = "LiberationSans"` resolves.
        reg.register_alias("LiberationSans", "LiberationSans-Regular");
    }

    // 2. DocTemplate + page template with header/footer callback.
    let mut doc = DocTemplate::new("EN 1993 Steel Check Report", fonts.clone());

    let margin_x: Pt = Mm(20.0).into();
    let margin_top: Pt = Mm(28.0).into(); // header band
    let margin_bottom: Pt = Mm(20.0).into();

    let frame = Frame::new(Rect::new(
        margin_x,
        margin_top,
        Pt(A4.width.0 - 2.0 * margin_x.0),
        Pt(A4.height.0 - margin_top.0 - margin_bottom.0),
    ))
    .with_padding(Padding::all(Pt(0.0)));

    let template = PageTemplate::new("content", A4, frame).with_callback(Box::new(
        OpenAecHeaderFooter {
            project: input.project_name.clone(),
        },
    ));
    doc.add_page_template(template);

    // 3. Cover page (RawPage — drawn directly).
    doc.add_pre_page(build_cover_page(&input));

    // 4. Build content flowables.
    let mut flow: Vec<Box<dyn Flowable>> = Vec::new();

    flow.push(Box::new(Paragraph::new(
        "Summary — Unity Checks",
        style_h2(),
    )));
    flow.push(Box::new(Spacer::from_mm(2.0)));

    flow.push(Box::new(build_summary_table(&input.steel_check_results)));
    flow.push(Box::new(Spacer::from_mm(6.0)));

    for (idx, r) in input.steel_check_results.iter().enumerate() {
        if idx > 0 || !input.steel_check_results.is_empty() {
            flow.push(Box::new(PageBreak));
        }

        flow.push(Box::new(Paragraph::new(
            format!(
                "{}. Beam {} — {} ({})",
                idx + 1,
                r.beam_id,
                r.profile_name,
                r.steel_grade
            ),
            style_h2(),
        )));
        flow.push(Box::new(Spacer::from_mm(3.0)));

        for nc in &r.checks {
            extend_with_check_block(&mut flow, &nc.kind);
        }
    }

    // 5. Render.
    doc.build_to_bytes(flow).expect("openaec-layout build")
}

// ── Cover page (drawn manually onto a RawPage) ────────────────────────────────

fn build_cover_page(input: &ReportInput) -> RawPage {
    let mut dl = DrawList::new();

    // Background tint band at top
    dl.set_fill_color(C_HEADER_BG);
    dl.draw_rect(
        Pt(0.0),
        Pt(0.0),
        A4.width,
        Mm(70.0).into(),
        true,
        false,
    );

    // Amber rule under the band
    let band_bottom: Pt = Mm(70.0).into();
    dl.set_fill_color(C_DIVIDER);
    dl.draw_rect(
        Pt(0.0),
        band_bottom,
        A4.width,
        Pt(2.0),
        true,
        false,
    );

    let left: Pt = Mm(20.0).into();

    // "Open" + "AEC" + "Foundation" wordmark — built from text draws
    dl.set_font("LiberationSans-Bold", Pt(46.0));
    dl.set_fill_color(C_DEEP);
    dl.draw_text(left, Mm(45.0).into(), "Open");

    dl.set_font("LiberationSans-Bold", Pt(46.0));
    dl.set_fill_color(C_AMBER);
    // 4 chars × ~28pt each ≈ 112pt advance for "Open" — tune empirically.
    dl.draw_text(Pt(left.0 + 110.0), Mm(45.0).into(), "AEC");

    dl.set_font("LiberationSans-Regular", Pt(20.0));
    dl.set_fill_color(C_MUTED);
    dl.draw_text(Pt(left.0 + 200.0), Mm(45.0).into(), "Foundation");

    // Title block
    dl.set_font("LiberationSans-Bold", Pt(28.0));
    dl.set_fill_color(C_TEXT);
    dl.draw_text(left, Mm(95.0).into(), "EN 1993-1-1");

    dl.set_font("LiberationSans-Bold", Pt(22.0));
    dl.set_fill_color(C_TEXT);
    dl.draw_text(left, Mm(108.0).into(), "Steel Check Report");

    dl.set_font("LiberationSans-Italic", Pt(13.0));
    dl.set_fill_color(C_MUTED);
    dl.draw_text(left, Mm(118.0).into(), &input.project_name);

    // Project info — manual two-column layout
    let label_x = left;
    let value_x: Pt = Pt(left.0 + Mm(35.0).0 * 2.834_645_7);
    let mut y_mm = 145.0_f32;

    let rows: &[(&str, &str)] = &[
        ("Project", input.project_name.as_str()),
        ("Number", input.project_number.as_str()),
        ("Engineer", input.engineer.as_str()),
        ("Company", input.company.as_str()),
        ("Date", input.date.as_str()),
        ("Standard", "NEN-EN 1993-1-1+C2+A1/NB:2016 nl"),
    ];

    for (label, val) in rows {
        dl.set_font("LiberationSans-Bold", Pt(9.5));
        dl.set_fill_color(C_AMBER);
        dl.draw_text(label_x, Mm(y_mm).into(), label);

        dl.set_font("LiberationSans-Regular", Pt(10.5));
        dl.set_fill_color(C_TEXT);
        dl.draw_text(value_x, Mm(y_mm).into(), val);

        y_mm += 8.5;
    }

    // Footer mark on cover
    dl.set_font("LiberationSans-Italic", Pt(8.0));
    dl.set_fill_color(C_MUTED);
    dl.draw_text(
        left,
        Pt(A4.height.0 - Mm(15.0).0 * 2.834_645_7),
        "OpenAEC Foundation — open structural analysis tooling",
    );

    RawPage {
        page_size: A4,
        draw_list: dl,
    }
}

// ── Header/footer callback (per content page) ─────────────────────────────────

#[derive(Debug)]
struct OpenAecHeaderFooter {
    project: String,
}

impl PageCallback for OpenAecHeaderFooter {
    fn on_page(
        &self,
        dl: &mut DrawList,
        page_num: usize,
        total_pages: usize,
        page_size: Size,
    ) {
        // Header strip (light tint, top 18mm)
        let header_h: Pt = Mm(18.0).into();
        dl.set_fill_color(C_HEADER_BG);
        dl.draw_rect(Pt(0.0), Pt(0.0), page_size.width, header_h, true, false);

        // Amber rule under header
        dl.set_fill_color(C_DIVIDER);
        dl.draw_rect(
            Pt(0.0),
            Pt(header_h.0),
            page_size.width,
            Pt(1.2),
            true,
            false,
        );

        // Header text — wordmark + project name
        let left: Pt = Mm(20.0).into();
        let baseline: Pt = Mm(11.0).into();

        dl.set_font("LiberationSans-Bold", Pt(11.0));
        dl.set_fill_color(C_DEEP);
        dl.draw_text(left, baseline, "Open");
        dl.set_font("LiberationSans-Bold", Pt(11.0));
        dl.set_fill_color(C_AMBER);
        dl.draw_text(Pt(left.0 + 28.0), baseline, "AEC");

        dl.set_font("LiberationSans-Regular", Pt(8.5));
        dl.set_fill_color(C_MUTED);
        dl.draw_text(
            Pt(left.0 + 60.0),
            baseline,
            &format!("EN 1993-1-1 — {}", self.project),
        );

        // Page-number on the right of the header
        let right: Pt = Pt(page_size.width.0 - Mm(20.0).0 * 2.834_645_7);
        dl.set_font("LiberationSans-Regular", Pt(8.5));
        dl.set_fill_color(C_MUTED);
        dl.draw_text_right(
            right,
            baseline,
            &format!("page {} of {}", page_num, total_pages),
        );

        // Footer rule + text
        let footer_y: Pt = Pt(page_size.height.0 - Mm(13.0).0 * 2.834_645_7);
        dl.set_fill_color(C_DIVIDER);
        dl.draw_rect(
            Pt(0.0),
            footer_y,
            page_size.width,
            Pt(0.6),
            true,
            false,
        );

        dl.set_font("LiberationSans-Italic", Pt(7.5));
        dl.set_fill_color(C_MUTED);
        dl.draw_text(
            left,
            Pt(footer_y.0 + 12.0),
            "Generated by Open FEM2D Studio — OpenAEC Foundation",
        );
    }
}

// ── Summary table ─────────────────────────────────────────────────────────────

fn build_summary_table(rows: &[BeamCheckResult]) -> Table {
    let headers: Vec<String> = vec![
        "Beam".into(),
        "Profile".into(),
        "Grade".into(),
        "UC".into(),
        "Governing".into(),
        "Status".into(),
    ];

    let body: Vec<Vec<String>> = rows
        .iter()
        .map(|r| {
            vec![
                r.beam_id.to_string(),
                r.profile_name.clone(),
                r.steel_grade.clone(),
                format!("{:.2}", r.uc_max),
                r.governing_check_id.clone(),
                status_label(&r.status).into(),
            ]
        })
        .collect();

    let style = TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(220, 215, 205),
        grid_width: Pt(0.5),
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(4.0), Pt(5.0), Pt(4.0), Pt(5.0)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(9.0),
        header_font_size: Pt(9.0),
    };

    // Column widths chosen to fit within the inner content frame (~170mm)
    Table::new(headers, body)
        .with_col_widths(vec![
            Mm(15.0).into(),
            Mm(35.0).into(),
            Mm(20.0).into(),
            Mm(15.0).into(),
            Mm(60.0).into(),
            Mm(20.0).into(),
        ])
        .with_style(style)
        .with_repeat_header(true)
}

// ── Per-check block (heading + force state + formula + UC + notes) ────────────

fn extend_with_check_block(flow: &mut Vec<Box<dyn Flowable>>, kind: &CheckKind) {
    let f = extract(kind);

    // Title with article reference appended in muted amber
    flow.push(Box::new(Paragraph::new(
        format!("{}    [{}]", f.title, f.article),
        style_h3(),
    )));

    // Force state line
    flow.push(Box::new(Paragraph::new(
        format!(
            "Comb {}  ·  x = {:.0} mm  ·  N_Ed = {:.2} kN  ·  V_Ed = {:.2} kN  ·  M_Ed = {:.2} kNm",
            f.combo, f.pos_mm, f.n_ed, f.vz_ed, f.my_ed
        ),
        style_mono(),
    )));

    // Formula (LaTeX rendered as plain text — KaTeX rendering is a future
    // enhancement; we already strip the dollars upstream).
    flow.push(Box::new(Paragraph::new(f.formula.to_string(), style_body())));

    // Variables on one condensed line
    if !f.variables.is_empty() {
        let vars: String = f
            .variables
            .iter()
            .map(|v| format!("{} = {:.3} {}", v.symbol, v.value, v.unit))
            .collect::<Vec<_>>()
            .join("   ");
        flow.push(Box::new(Paragraph::new(vars, style_mono())));
    }

    // Result value
    flow.push(Box::new(Paragraph::new(
        format!("= {:.3} {}", f.value, f.unit),
        style_amber_value(),
    )));

    // UC + status
    if let (Some(ed), Some(rd), Some(uc)) = (f.uc_ed, f.uc_rd, f.uc_uc) {
        let uc_color = if uc > 1.0 { C_FAIL } else { C_OK };
        let line = format!(
            "UC = {:.3} / {:.3} = {:.3}     {}",
            ed,
            rd,
            uc,
            status_label(f.status)
        );
        flow.push(Box::new(Paragraph::new(line, style_uc(uc_color))));
    } else {
        let (sl, sc) = (status_label(f.status), status_color(f.status));
        flow.push(Box::new(Paragraph::new(sl, style_uc(sc))));
    }

    // Intermediate values
    if !f.intermediates.is_empty() {
        let line: String = f
            .intermediates
            .iter()
            .map(|v| format!("{} = {:.3}", v.symbol, v.value))
            .collect::<Vec<_>>()
            .join("   ");
        flow.push(Box::new(Paragraph::new(line, style_mono())));
    }

    // Notes
    for note in f.notes {
        flow.push(Box::new(Paragraph::new(note.clone(), style_note())));
    }

    flow.push(Box::new(Spacer::from_mm(2.5)));
}

// ── Field extraction (mirrors the previous genpdf version) ────────────────────

struct ExtractedFields<'a> {
    title: &'a str,
    article: &'a str,
    combo: u32,
    pos_mm: f64,
    n_ed: f64,
    vz_ed: f64,
    my_ed: f64,
    formula: &'a str,
    variables: &'a [NamedValue],
    value: f64,
    unit: &'a str,
    uc_ed: Option<f64>,
    uc_rd: Option<f64>,
    uc_uc: Option<f64>,
    status: &'a CheckStatus,
    notes: &'a [String],
    intermediates: &'a [NamedValue],
}

fn extract(kind: &CheckKind) -> ExtractedFields<'_> {
    match kind {
        CheckKind::Resistance(r) => ExtractedFields {
            title: &r.title,
            article: &r.article,
            combo: r.force_state.combination_id,
            pos_mm: r.force_state.position_mm,
            n_ed: r.force_state.forces.n_ed,
            vz_ed: r.force_state.forces.vz_ed,
            my_ed: r.force_state.forces.my_ed,
            formula: &r.formula_latex,
            variables: &r.variables,
            value: r.value,
            unit: &r.unit,
            uc_ed: r.uc.as_ref().map(|u| u.ed),
            uc_rd: r.uc.as_ref().map(|u| u.rd),
            uc_uc: r.uc.as_ref().map(|u| u.uc),
            status: &r.status,
            notes: &r.notes,
            intermediates: &[],
        },
        CheckKind::Stability(s) => ExtractedFields {
            title: &s.title,
            article: &s.article,
            combo: s.force_state.combination_id,
            pos_mm: s.force_state.position_mm,
            n_ed: s.force_state.forces.n_ed,
            vz_ed: s.force_state.forces.vz_ed,
            my_ed: s.force_state.forces.my_ed,
            formula: &s.formula_latex,
            variables: &s.variables,
            value: s.value,
            unit: &s.unit,
            uc_ed: s.uc.as_ref().map(|u| u.ed),
            uc_rd: s.uc.as_ref().map(|u| u.rd),
            uc_uc: s.uc.as_ref().map(|u| u.uc),
            status: &s.status,
            notes: &s.notes,
            intermediates: &s.intermediate_values,
        },
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────

fn status_label(s: &CheckStatus) -> &'static str {
    match s {
        CheckStatus::Ok => "OK",
        CheckStatus::NotOk => "FAIL",
        CheckStatus::NotApplicable => "N/A",
    }
}

fn status_color(s: &CheckStatus) -> Color {
    match s {
        CheckStatus::Ok => C_OK,
        CheckStatus::NotOk => C_FAIL,
        CheckStatus::NotApplicable => C_MUTED,
    }
}
