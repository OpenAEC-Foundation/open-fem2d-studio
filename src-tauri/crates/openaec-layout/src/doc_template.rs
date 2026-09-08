//! DocTemplate — multi-page PDF assembly.
//!
//! Takes flowables, lays them out across pages using PageTemplates,
//! and renders the result to PDF via printpdf.

use std::path::Path;

use crate::draw::{DrawList, DrawOp};
use crate::error::LayoutError;
use crate::flowable::{Flowable, LayoutContext};
use crate::fonts::SharedFontRegistry;
use crate::page_template::PageTemplate;
use crate::types::{Pt, Size};

/// Helper: convert our Pt to printpdf Mm.
fn to_pdf_mm(pt: Pt) -> printpdf::Mm {
    let mm: crate::types::Mm = pt.into();
    printpdf::Mm(mm.0)
}

/// Convert CamelCase font name to hyphenated form.
/// "GothamBold" → "Gotham-Bold", "GothamBookItalic" → "Gotham-BookItalic"
fn camel_to_hyphen(name: &str) -> String {
    let mut result = String::with_capacity(name.len() + 2);
    let mut prev_lower = false;
    for ch in name.chars() {
        if ch.is_uppercase() && prev_lower {
            result.push('-');
        }
        result.push(ch);
        prev_lower = ch.is_lowercase();
    }
    result
}

/// Hoeveel ruimte er ná een kop op hetzelfde vel over moet zijn.
///
/// Ongeveer twee regels lopende tekst (leading 12,5 pt) of één tabelregel. Het
/// is met opzet een KLEIN getal en niet de hoogte van het volgende element:
/// een kop boven een tabel van drie bladzijden moet gewoon blijven staan, en
/// wat hier bewaakt wordt is de kop die als enige onderaan achterblijft.
pub const MIN_VERVOLG: Pt = Pt(26.0);

/// Hoeveel ruimte de kopketen die bij `idx` begint nodig heeft, ínclusief het
/// begin van waar de kop bij hoort.
///
/// De keten is het element zelf plus alle direct erop volgende elementen die
/// óók [`Flowable::keep_with_next`] zeggen — een `<h2>` gevolgd door een
/// `<h3>` is één keten: verhuist de `h3`, dan moet de `h2` mee, anders staat
/// die alsnog alleen onderaan. Daarbovenop komt
/// [`Flowable::min_start_height`] van het eerste element dat GEEN kop is: voor
/// een alinea of een tabel is dat [`MIN_VERVOLG`], voor een figuur — die niet
/// kan splitsen — zijn volle hoogte.
///
/// `wrap` is hier nodig om die hoogtes te weten en verandert de opmaakstaat
/// van de vooruitgekeken elementen; dat is ongevaarlijk omdat de paginamotor
/// ze vlak daarna nog eens wrapt met de breedte en hoogte van hun eigen plek.
fn kopketen_hoogte(
    flowables: &mut [Box<dyn Flowable>],
    idx: usize,
    breedte: Pt,
    hoogte: Pt,
    ctx: &LayoutContext,
) -> Pt {
    let mut totaal = 0.0_f32;
    let mut j = idx;
    while j < flowables.len() && !flowables[j].is_page_break() && flowables[j].keep_with_next() {
        totaal += flowables[j].wrap(breedte, hoogte, ctx).height.0;
        j += 1;
    }
    if j < flowables.len() && !flowables[j].is_page_break() {
        flowables[j].wrap(breedte, hoogte, ctx);
        totaal += flowables[j].min_start_height().0;
    }
    Pt(totaal)
}

/// A rendered page (draw list + size).
#[derive(Debug)]
struct RenderedPage {
    draw_list: DrawList,
    page_size: Size,
    template_name: String,
}

/// A pre-rendered page (canvas-drawn, not flowable-based).
/// Used for cover, colofon, TOC, backcover etc.
#[derive(Debug, Clone)]
pub struct RawPage {
    pub page_size: Size,
    pub draw_list: DrawList,
}

/// Document template — the top-level layout engine.
pub struct DocTemplate {
    page_templates: Vec<PageTemplate>,
    fonts: SharedFontRegistry,
    title: String,
    /// Pages prepended before content (cover, colofon, TOC).
    pre_pages: Vec<RawPage>,
    /// Pages appended after content (backcover).
    post_pages: Vec<RawPage>,
}

impl DocTemplate {
    pub fn new(title: impl Into<String>, fonts: SharedFontRegistry) -> Self {
        Self {
            page_templates: Vec::new(),
            fonts,
            title: title.into(),
            pre_pages: Vec::new(),
            post_pages: Vec::new(),
        }
    }

    /// Add a page template. The first one added is the default.
    pub fn add_page_template(&mut self, template: PageTemplate) {
        self.page_templates.push(template);
    }

    /// Add a pre-rendered page before the content (e.g., cover, colofon, TOC).
    pub fn add_pre_page(&mut self, page: RawPage) {
        self.pre_pages.push(page);
    }

    /// Add a pre-rendered page after the content (e.g., backcover).
    pub fn add_post_page(&mut self, page: RawPage) {
        self.post_pages.push(page);
    }

    /// Get page template by name, or the first one as default.
    fn get_template(&self, _name: Option<&str>) -> &PageTemplate {
        // For now, always return the first template.
        // TODO: support named template selection.
        &self.page_templates[0]
    }

    /// Build the document from flowables and write to a file.
    pub fn build(
        &self,
        flowables: Vec<Box<dyn Flowable>>,
        output: &Path,
    ) -> Result<(), LayoutError> {
        let pdf_bytes = self.build_to_bytes(flowables)?;
        std::fs::write(output, pdf_bytes)?;
        Ok(())
    }

    /// Build the document from flowables and return PDF bytes.
    pub fn build_to_bytes(
        &self,
        flowables: Vec<Box<dyn Flowable>>,
    ) -> Result<Vec<u8>, LayoutError> {
        if self.page_templates.is_empty() {
            return Err(LayoutError::PdfError(
                "No page templates defined".to_string(),
            ));
        }

        let ctx = LayoutContext {
            fonts: self.fonts.clone(),
        };

        // Phase 1: Build pre-pages
        let pre: Vec<RenderedPage> = self
            .pre_pages
            .iter()
            .map(|rp| RenderedPage {
                draw_list: rp.draw_list.clone(),
                page_size: rp.page_size,
                template_name: "raw".to_string(),
            })
            .collect();

        // Phase 2: Layout content flowables across pages
        let content = self.layout_pages(flowables, &ctx);

        // Phase 3: Build post-pages
        let post: Vec<RenderedPage> = self
            .post_pages
            .iter()
            .map(|rp| RenderedPage {
                draw_list: rp.draw_list.clone(),
                page_size: rp.page_size,
                template_name: "raw".to_string(),
            })
            .collect();

        // Combine all pages
        let mut all_pages = pre;
        all_pages.extend(content);
        all_pages.extend(post);

        // Phase 4: Render to PDF
        self.render_pdf(&all_pages)
    }

    /// Layout flowables across pages, returning rendered pages.
    fn layout_pages(
        &self,
        mut flowables: Vec<Box<dyn Flowable>>,
        ctx: &LayoutContext,
    ) -> Vec<RenderedPage> {
        let mut pages = Vec::new();
        let mut idx = 0;

        while idx < flowables.len() {
            let template = self.get_template(None);
            let frame = template.primary_frame();
            let inner_w = frame.inner_width();
            let inner_h = frame.inner_height();
            let start_x = Pt(frame.rect.x.0 + frame.padding.left.0);
            let start_y = Pt(frame.rect.y.0 + frame.padding.top.0);

            let mut draw_list = DrawList::new();
            let mut cursor_y = Pt(0.0);

            while idx < flowables.len() {
                let flowable = &mut flowables[idx];

                if flowable.is_page_break() {
                    idx += 1;
                    break;
                }

                let remaining = Pt(inner_h.0 - cursor_y.0);
                let size = flowable.wrap(inner_w, remaining, ctx);

                // Een kop mag niet los onderaan een vel blijven staan. Staat er
                // al iets op dit vel (anders zou de kop nergens heen kunnen),
                // dan moet de hele kopketen plus MIN_VERVOLG nog passen.
                if cursor_y.0 > 0.0
                    && flowables[idx].keep_with_next()
                    && kopketen_hoogte(&mut flowables, idx, inner_w, remaining, ctx).0
                        > remaining.0
                {
                    break;
                }
                let flowable = &mut flowables[idx];

                if size.height.0 <= remaining.0 {
                    // Fits entirely
                    flowable.draw(start_x, Pt(start_y.0 + cursor_y.0), &mut draw_list);
                    cursor_y = Pt(cursor_y.0 + size.height.0);
                    idx += 1;
                } else {
                    // Doesn't fit — try to split
                    let split_result = flowable.split(inner_w, remaining, ctx);
                    match split_result {
                        crate::flowable::SplitResult::Split(mut first, second) => {
                            // Draw the first part on this page
                            let first_size = first.wrap(inner_w, remaining, ctx);
                            first.draw(start_x, Pt(start_y.0 + cursor_y.0), &mut draw_list);
                            cursor_y = Pt(cursor_y.0 + first_size.height.0);
                            // Replace current flowable with the remainder
                            flowables[idx] = second;
                            // Break to start a new page for the remainder
                            break;
                        }
                        crate::flowable::SplitResult::CannotSplit => {
                            if cursor_y.0 == 0.0 {
                                // First item on page, force draw even if too tall
                                flowable.draw(start_x, Pt(start_y.0 + cursor_y.0), &mut draw_list);
                                cursor_y = Pt(cursor_y.0 + size.height.0);
                                idx += 1;
                            }
                            // Move to next page
                            break;
                        }
                        crate::flowable::SplitResult::Fits => {
                            // Shouldn't happen but handle gracefully
                            flowable.draw(start_x, Pt(start_y.0 + cursor_y.0), &mut draw_list);
                            cursor_y = Pt(cursor_y.0 + size.height.0);
                            idx += 1;
                        }
                    }
                }
            }

            // NOTE: Pass 1 callback removed — callbacks only run in pass 2
            // with correct total_pages. This prevents double-rendering of
            // footer elements.
            pages.push(RenderedPage {
                draw_list,
                page_size: template.page_size,
                template_name: template.name.clone(),
            });
        }

        // Single pass: run callbacks with correct total page count
        let total_pages = pages.len();
        for (i, page) in pages.iter_mut().enumerate() {
            if let Some(template) = self
                .page_templates
                .iter()
                .find(|t| t.name == page.template_name)
                && let Some(ref callback) = template.on_page
            {
                callback.on_page(&mut page.draw_list, i + 1, total_pages, page.page_size);
            }
        }

        pages
    }

    /// Render pages to PDF bytes using printpdf.
    fn render_pdf(&self, pages: &[RenderedPage]) -> Result<Vec<u8>, LayoutError> {
        if pages.is_empty() {
            return Err(LayoutError::PdfError("No pages to render".to_string()));
        }

        let first_page = &pages[0];
        let (doc, first_page_idx, first_layer_idx) = printpdf::PdfDocument::new(
            &self.title,
            to_pdf_mm(first_page.page_size.width),
            to_pdf_mm(first_page.page_size.height),
            "Content",
        );

        // Register fonts with printpdf
        let fonts_guard = self.fonts.lock().unwrap();
        let mut pdf_fonts: std::collections::HashMap<String, printpdf::IndirectFontRef> =
            std::collections::HashMap::new();

        for (name, font_id) in fonts_guard.iter() {
            let font_data = fonts_guard.font_data(font_id);
            match doc.add_external_font(font_data) {
                Ok(font_ref) => {
                    pdf_fonts.insert(name.to_string(), font_ref);
                }
                Err(e) => {
                    tracing::warn!("Failed to register font '{}': {}", name, e);
                }
            }
        }
        drop(fonts_guard);

        // Render each page
        for (page_idx, rendered_page) in pages.iter().enumerate() {
            let (page_ref, layer_ref) = if page_idx == 0 {
                (first_page_idx, first_layer_idx)
            } else {
                doc.add_page(
                    to_pdf_mm(rendered_page.page_size.width),
                    to_pdf_mm(rendered_page.page_size.height),
                    "Content",
                )
            };

            let layer = doc.get_page(page_ref).get_layer(layer_ref);
            self.render_draw_list(&layer, &rendered_page.draw_list, rendered_page.page_size.height, &pdf_fonts);
        }

        // Save to bytes
        let mut buf = std::io::BufWriter::new(Vec::new());
        doc.save(&mut buf)
            .map_err(|e| LayoutError::PdfError(e.to_string()))?;

        buf.into_inner()
            .map_err(|e| LayoutError::PdfError(e.to_string()))
    }

    /// Measure text width using the font registry.
    fn measure_text_width(&self, font_name: &str, text: &str, size: f32) -> Pt {
        if let Ok(mut reg) = self.fonts.lock() {
            // Try original name, then CamelCase → hyphenated
            let font_id = reg
                .get(font_name)
                .or_else(|| reg.get(&camel_to_hyphen(font_name)));

            if let Some(id) = font_id {
                return reg.text_width(id, text, Pt(size));
            }
        }
        // Fallback: approximate average character width
        Pt(text.chars().count() as f32 * size * 0.55)
    }

    /// Render a draw list to a printpdf layer.
    fn render_draw_list(
        &self,
        layer: &printpdf::PdfLayerReference,
        draw_list: &DrawList,
        page_height: Pt,
        fonts: &std::collections::HashMap<String, printpdf::IndirectFontRef>,
    ) {
        let mut current_font: Option<&printpdf::IndirectFontRef> = None;
        let mut current_font_size: f32 = 10.0;
        let mut current_font_name = String::new();
        let mut current_fill_rgb: (u8, u8, u8) = (255, 255, 255); // for alpha compositing

        for op in &draw_list.ops {
            match op {
                DrawOp::SetFont { name, size } => {
                    current_font_size = size.0;
                    current_font_name = name.clone();
                    current_font = fonts.get(name.as_str())
                        .or_else(|| {
                            // Fallback 1: try with -Regular suffix
                            fonts.get(&format!("{}-Regular", name))
                        })
                        .or_else(|| {
                            // Fallback 2: try base name without variant suffix
                            let base = name.split('-').next().unwrap_or(name);
                            fonts.get(base)
                                .or_else(|| fonts.get(&format!("{}-Regular", base)))
                        })
                        .or_else(|| {
                            // Fallback 3: insert hyphens at CamelCase boundaries
                            // "GothamBold" → "Gotham-Bold", "GothamBookItalic" → "Gotham-BookItalic"
                            let hyphenated = camel_to_hyphen(name);
                            if hyphenated != *name {
                                fonts.get(hyphenated.as_str())
                            } else {
                                None
                            }
                        })
                        .or_else(|| {
                            // Fallback 4: try any font containing the base family name
                            let base = name.split('-').next().unwrap_or(name);
                            let base_lower = base.to_lowercase();
                            fonts.keys()
                                .find(|k| k.to_lowercase().starts_with(&base_lower))
                                .and_then(|k| fonts.get(k.as_str()))
                        });
                    if current_font.is_none() {
                        tracing::warn!(font = %name, "Font not found, text will be invisible");
                    }
                }

                DrawOp::DrawText { x, y, text } => {
                    if let Some(font) = current_font {
                        let pdf_y = page_height.0 - y.0;
                        layer.begin_text_section();
                        layer.set_font(font, current_font_size);
                        layer.set_text_cursor(to_pdf_mm(*x), to_pdf_mm(Pt(pdf_y)));
                        layer.write_text(text, font);
                        layer.end_text_section();
                    }
                }

                DrawOp::DrawTextCenter { x, y, text } => {
                    if let Some(font) = current_font {
                        let tw = self.measure_text_width(
                            &current_font_name,
                            text,
                            current_font_size,
                        );
                        let adjusted_x = Pt(x.0 - tw.0 / 2.0);
                        let pdf_y = page_height.0 - y.0;
                        layer.begin_text_section();
                        layer.set_font(font, current_font_size);
                        layer.set_text_cursor(to_pdf_mm(adjusted_x), to_pdf_mm(Pt(pdf_y)));
                        layer.write_text(text, font);
                        layer.end_text_section();
                    }
                }

                DrawOp::DrawTextRight { x, y, text } => {
                    if let Some(font) = current_font {
                        let tw = self.measure_text_width(
                            &current_font_name,
                            text,
                            current_font_size,
                        );
                        let adjusted_x = Pt(x.0 - tw.0);
                        let pdf_y = page_height.0 - y.0;
                        layer.begin_text_section();
                        layer.set_font(font, current_font_size);
                        layer.set_text_cursor(to_pdf_mm(adjusted_x), to_pdf_mm(Pt(pdf_y)));
                        layer.write_text(text, font);
                        layer.end_text_section();
                    }
                }

                DrawOp::SetFillColor(color) => {
                    current_fill_rgb = (color.r, color.g, color.b);
                    let (r, g, b) = color.to_pdf_rgb();
                    layer.set_fill_color(printpdf::Color::Rgb(printpdf::Rgb::new(
                        r, g, b, None,
                    )));
                }

                DrawOp::SetStrokeColor(color) => {
                    let (r, g, b) = color.to_pdf_rgb();
                    layer.set_outline_color(printpdf::Color::Rgb(printpdf::Rgb::new(
                        r, g, b, None,
                    )));
                }

                DrawOp::SetLineWidth(width) => {
                    layer.set_outline_thickness(width.0);
                }

                DrawOp::DrawRect {
                    x,
                    y,
                    width,
                    height,
                    fill,
                    stroke,
                } => {
                    let pdf_y = Pt(page_height.0 - y.0 - height.0);
                    let mode = match (fill, stroke) {
                        (true, true) => printpdf::path::PaintMode::FillStroke,
                        (true, false) => printpdf::path::PaintMode::Fill,
                        (false, true) => printpdf::path::PaintMode::Stroke,
                        (false, false) => continue, // nothing to draw
                    };
                    let ring = vec![
                        (printpdf::Point::new(to_pdf_mm(*x), to_pdf_mm(pdf_y)), false),
                        (printpdf::Point::new(to_pdf_mm(Pt(x.0 + width.0)), to_pdf_mm(pdf_y)), false),
                        (printpdf::Point::new(to_pdf_mm(Pt(x.0 + width.0)), to_pdf_mm(Pt(pdf_y.0 + height.0))), false),
                        (printpdf::Point::new(to_pdf_mm(*x), to_pdf_mm(Pt(pdf_y.0 + height.0))), false),
                    ];
                    let polygon = printpdf::Polygon {
                        rings: vec![ring],
                        mode,
                        winding_order: printpdf::path::WindingOrder::NonZero,
                    };
                    layer.add_polygon(polygon);
                }

                DrawOp::DrawLine { x1, y1, x2, y2 } => {
                    let pdf_y1 = page_height.0 - y1.0;
                    let pdf_y2 = page_height.0 - y2.0;

                    let points = vec![
                        (
                            printpdf::Point::new(
                                to_pdf_mm(*x1),
                                to_pdf_mm(Pt(pdf_y1)),
                            ),
                            false,
                        ),
                        (
                            printpdf::Point::new(
                                to_pdf_mm(*x2),
                                to_pdf_mm(Pt(pdf_y2)),
                            ),
                            false,
                        ),
                    ];

                    let line = printpdf::Line {
                        points,
                        is_closed: false,
                    };
                    layer.add_line(line);
                }

                DrawOp::DrawImage {
                    data,
                    x,
                    y,
                    width,
                    height,
                } => {
                    if let Ok(dynamic_img) = ::image::load_from_memory(data) {
                        // If image has alpha, composite onto current fill color background
                        let rgb = if dynamic_img.color().has_alpha() {
                            let rgba = dynamic_img.to_rgba8();
                            let (w, h) = (rgba.width(), rgba.height());
                            let (bg_r, bg_g, bg_b) = current_fill_rgb;
                            let mut out = Vec::with_capacity((w * h * 3) as usize);
                            for pixel in rgba.pixels() {
                                let a = pixel[3] as f32 / 255.0;
                                let inv = 1.0 - a;
                                out.push((pixel[0] as f32 * a + bg_r as f32 * inv) as u8);
                                out.push((pixel[1] as f32 * a + bg_g as f32 * inv) as u8);
                                out.push((pixel[2] as f32 * a + bg_b as f32 * inv) as u8);
                            }
                            (out, w as usize, h as usize)
                        } else {
                            let img = dynamic_img.to_rgb8();
                            let (w, h) = (img.width() as usize, img.height() as usize);
                            (img.into_raw(), w, h)
                        };
                        let (raw_pixels, img_w, img_h) = rgb;
                        let image_xobj = printpdf::ImageXObject {
                            width: printpdf::Px(img_w),
                            height: printpdf::Px(img_h),
                            color_space: printpdf::ColorSpace::Rgb,
                            bits_per_component: printpdf::ColorBits::Bit8,
                            interpolate: true,
                            image_data: raw_pixels,
                            image_filter: None,
                            smask: None,
                            clipping_bbox: None,
                        };
                        let pdf_image = printpdf::Image::from(image_xobj);
                        let pdf_y = Pt(page_height.0 - y.0 - height.0);
                        // printpdf scale_x/y are MULTIPLIERS on the native image size.
                        // At DPI=72: native_size = image_px points (1px = 1pt).
                        // So scale = desired_pt / image_px gives correct physical size.
                        let transform = printpdf::ImageTransform {
                            translate_x: Some(to_pdf_mm(*x)),
                            translate_y: Some(to_pdf_mm(pdf_y)),
                            scale_x: Some(width.0 / img_w as f32),
                            scale_y: Some(height.0 / img_h as f32),
                            dpi: Some(72.0),
                            ..Default::default()
                        };
                        pdf_image.add_to_layer(layer.clone(), transform);
                    }
                }

                DrawOp::DrawPolygon {
                    points,
                    fill,
                    stroke,
                } => {
                    if points.len() >= 2 {
                        let pdf_points: Vec<(printpdf::Point, bool)> = points
                            .iter()
                            .map(|(x, y)| {
                                let pdf_y = page_height.0 - y.0;
                                (
                                    printpdf::Point::new(to_pdf_mm(*x), to_pdf_mm(Pt(pdf_y))),
                                    false,
                                )
                            })
                            .collect();

                        let mode = match (fill, stroke) {
                            (true, true) => printpdf::path::PaintMode::FillStroke,
                            (true, false) => printpdf::path::PaintMode::Fill,
                            (false, true) => printpdf::path::PaintMode::Stroke,
                            (false, false) => printpdf::path::PaintMode::Fill,
                        };

                        let polygon = printpdf::Polygon {
                            rings: vec![pdf_points],
                            mode,
                            winding_order: printpdf::path::WindingOrder::NonZero,
                        };
                        layer.add_polygon(polygon);
                    }
                }

                DrawOp::DrawRoundedRect {
                    x,
                    y,
                    width,
                    height,
                    radius,
                    fill,
                    stroke,
                } => {
                    // Approximate rounded rect with bezier curves
                    let pdf_y = Pt(page_height.0 - y.0 - height.0);
                    let r = radius.0.min(width.0 / 2.0).min(height.0 / 2.0);

                    // Control point offset for circular approximation
                    let k: f32 = 0.5522847498;
                    let kr = k * r;

                    // Build points clockwise from bottom-left
                    let x0 = x.0;
                    let y0 = pdf_y.0;
                    let x1 = x.0 + width.0;
                    let y1 = pdf_y.0 + height.0;

                    let points = vec![
                        // Bottom-left corner start
                        (printpdf::Point::new(to_pdf_mm(Pt(x0)), to_pdf_mm(Pt(y0 + r))), false),
                        // Bottom-left arc
                        (printpdf::Point::new(to_pdf_mm(Pt(x0)), to_pdf_mm(Pt(y0 + r - kr))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x0 + r - kr)), to_pdf_mm(Pt(y0))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x0 + r)), to_pdf_mm(Pt(y0))), false),
                        // Bottom-right corner
                        (printpdf::Point::new(to_pdf_mm(Pt(x1 - r)), to_pdf_mm(Pt(y0))), false),
                        (printpdf::Point::new(to_pdf_mm(Pt(x1 - r + kr)), to_pdf_mm(Pt(y0))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x1)), to_pdf_mm(Pt(y0 + r - kr))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x1)), to_pdf_mm(Pt(y0 + r))), false),
                        // Top-right corner
                        (printpdf::Point::new(to_pdf_mm(Pt(x1)), to_pdf_mm(Pt(y1 - r))), false),
                        (printpdf::Point::new(to_pdf_mm(Pt(x1)), to_pdf_mm(Pt(y1 - r + kr))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x1 - r + kr)), to_pdf_mm(Pt(y1))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x1 - r)), to_pdf_mm(Pt(y1))), false),
                        // Top-left corner
                        (printpdf::Point::new(to_pdf_mm(Pt(x0 + r)), to_pdf_mm(Pt(y1))), false),
                        (printpdf::Point::new(to_pdf_mm(Pt(x0 + r - kr)), to_pdf_mm(Pt(y1))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x0)), to_pdf_mm(Pt(y1 - r + kr))), true),
                        (printpdf::Point::new(to_pdf_mm(Pt(x0)), to_pdf_mm(Pt(y1 - r))), false),
                    ];

                    let mode = match (fill, stroke) {
                        (true, true) => printpdf::path::PaintMode::FillStroke,
                        (true, false) => printpdf::path::PaintMode::Fill,
                        (false, true) => printpdf::path::PaintMode::Stroke,
                        (false, false) => printpdf::path::PaintMode::Fill,
                    };

                    let polygon = printpdf::Polygon {
                        rings: vec![points],
                        mode,
                        winding_order: printpdf::path::WindingOrder::NonZero,
                    };
                    layer.add_polygon(polygon);
                }

                DrawOp::SaveState => {
                    layer.save_graphics_state();
                }
                DrawOp::RestoreState => {
                    layer.restore_graphics_state();
                }
            }
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::Frame;
    use crate::paragraph::{Paragraph, ParagraphStyle};
    use crate::spacer::Spacer;
    use crate::types::{Rect, A4};

    /// Een document met één vel van `hoogte` punten aan inhoudsruimte.
    fn doc(hoogte: f32) -> DocTemplate {
        let fonts = crate::fonts::shared_font_registry();
        let mut d = DocTemplate::new("proef", fonts);
        d.add_page_template(PageTemplate::new(
            "content",
            A4,
            Frame::new(Rect::new(Pt(0.0), Pt(0.0), Pt(400.0), Pt(hoogte))),
        ));
        d
    }

    /// De teksten per vel, in tekenvolgorde.
    fn teksten_per_vel(pagina: &[RenderedPage]) -> Vec<Vec<String>> {
        pagina
            .iter()
            .map(|p| {
                p.draw_list
                    .ops
                    .iter()
                    .filter_map(|op| match op {
                        DrawOp::DrawText { text, .. } => Some(text.clone()),
                        _ => None,
                    })
                    .collect()
            })
            .collect()
    }

    fn kop(tekst: &str) -> Box<dyn Flowable> {
        Box::new(Paragraph::new(tekst, ParagraphStyle::default()).kop())
    }

    fn regel(tekst: &str) -> Box<dyn Flowable> {
        Box::new(Paragraph::new(tekst, ParagraphStyle::default()))
    }

    /// Een figuur-achtig element: het splitst niet en eist zijn volle hoogte
    /// zodra er een kop boven staat.
    #[derive(Debug)]
    struct Blok(Pt);
    impl Flowable for Blok {
        fn wrap(&mut self, breedte: Pt, _h: Pt, _ctx: &LayoutContext) -> Size {
            Size::new(breedte, self.0)
        }
        fn draw(&self, _x: Pt, _y: Pt, dl: &mut DrawList) {
            dl.draw_text(Pt(0.0), Pt(0.0), "BLOK");
        }
        fn height(&self) -> Pt {
            self.0
        }
        fn min_start_height(&self) -> Pt {
            self.0
        }
    }

    #[test]
    fn een_kop_met_ruimte_eronder_blijft_gewoon_staan() {
        let d = doc(200.0);
        let ctx = LayoutContext { fonts: d.fonts.clone() };
        let vellen = d.layout_pages(
            vec![
                Box::new(Spacer::new(Pt(140.0))),
                kop("KOP"),
                regel("inhoud"),
            ],
            &ctx,
        );
        let t = teksten_per_vel(&vellen);
        assert_eq!(t.len(), 1, "alles past op één vel, kreeg {}", t.len());
        assert!(
            t[0].contains(&"KOP".to_string()) && t[0].contains(&"inhoud".to_string()),
            "kop en inhoud horen samen op vel 1: {t:?}"
        );
    }

    #[test]
    fn een_kop_zonder_ruimte_eronder_verhuist_mee_naar_het_volgende_vel() {
        let d = doc(200.0);
        let ctx = LayoutContext { fonts: d.fonts.clone() };
        let vellen = d.layout_pages(
            vec![
                Box::new(Spacer::new(Pt(175.0))),
                kop("KOP"),
                regel("inhoud"),
            ],
            &ctx,
        );
        let t = teksten_per_vel(&vellen);
        assert_eq!(t.len(), 2, "verwacht twee vellen, kreeg {}", t.len());
        assert!(
            !t[0].contains(&"KOP".to_string()),
            "de kop bleef alleen onderaan vel 1 achter: {t:?}"
        );
        assert!(t[1].contains(&"KOP".to_string()), "de kop hoort op vel 2: {t:?}");
        assert!(t[1].contains(&"inhoud".to_string()), "en zijn inhoud erbij: {t:?}");
    }

    #[test]
    fn een_hele_kopketen_verhuist_en_niet_alleen_de_laatste() {
        let d = doc(200.0);
        let ctx = LayoutContext { fonts: d.fonts.clone() };
        let vellen = d.layout_pages(
            vec![
                Box::new(Spacer::new(Pt(150.0))),
                kop("H2"),
                kop("H3"),
                regel("inhoud"),
            ],
            &ctx,
        );
        let t = teksten_per_vel(&vellen);
        assert!(
            !t[0].contains(&"H2".to_string()) && !t[0].contains(&"H3".to_string()),
            "een kop bleef achter op vel 1: {t:?}"
        );
        assert!(t[1].contains(&"H2".to_string()) && t[1].contains(&"H3".to_string()));
    }

    #[test]
    fn een_kop_boven_iets_dat_niet_splitst_neemt_de_volle_hoogte_mee() {
        // Er is nog 100 pt over; de kop past ruim, en er is meer dan MIN_VERVOLG
        // vrij — maar het blok van 120 pt kan niet splitsen. Kop én blok horen
        // dus naar het volgende vel, en niet de kop alleen.
        let d = doc(200.0);
        let ctx = LayoutContext { fonts: d.fonts.clone() };
        let vellen = d.layout_pages(
            vec![
                Box::new(Spacer::new(Pt(100.0))),
                kop("KOP"),
                Box::new(Blok(Pt(120.0))),
            ],
            &ctx,
        );
        let t = teksten_per_vel(&vellen);
        assert!(
            !t[0].contains(&"KOP".to_string()),
            "de kop bleef zonder zijn figuur op vel 1 staan: {t:?}"
        );
        assert!(
            t[1].contains(&"KOP".to_string()) && t[1].contains(&"BLOK".to_string()),
            "kop en figuur horen samen op vel 2: {t:?}"
        );
    }

    #[test]
    fn een_kop_bovenaan_een_leeg_vel_schuift_nooit_door() {
        // Het blok is hoger dan een heel vel. De vooruitblik mag dan niet
        // ingrijpen, anders schuift de kop eindeloos door.
        let d = doc(200.0);
        let ctx = LayoutContext { fonts: d.fonts.clone() };
        let vellen = d.layout_pages(vec![kop("KOP"), Box::new(Blok(Pt(400.0)))], &ctx);
        let t = teksten_per_vel(&vellen);
        assert!(t[0].contains(&"KOP".to_string()), "de kop hoort op vel 1: {t:?}");
        assert!(vellen.len() <= 3, "onverwacht veel vellen: {}", vellen.len());
    }
}
