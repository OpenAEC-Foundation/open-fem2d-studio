//! Paragraph — styled text with word wrapping.
//!
//! Supports basic inline markup: `<b>`, `<i>`, `<b><i>` (stripped for metrics,
//! preserved for rendering as font variant selection).

use crate::draw::DrawList;
use crate::flowable::{Flowable, LayoutContext, SplitResult};
use crate::types::{Alignment, Color, Pt, Size};

/// Style for a paragraph.
#[derive(Debug, Clone)]
pub struct ParagraphStyle {
    pub font_name: String,
    pub font_size: Pt,
    pub leading: Pt,
    pub text_color: Color,
    pub alignment: Alignment,
    pub space_before: Pt,
    pub space_after: Pt,
    pub first_line_indent: Pt,
    pub left_indent: Pt,
    pub right_indent: Pt,
    pub bold: bool,
    pub italic: bool,
}

impl Default for ParagraphStyle {
    fn default() -> Self {
        Self {
            font_name: "LiberationSans".to_string(),
            font_size: Pt(10.0),
            leading: Pt(14.0),
            text_color: Color::BLACK,
            alignment: Alignment::Left,
            space_before: Pt(0.0),
            space_after: Pt(4.0),
            first_line_indent: Pt(0.0),
            left_indent: Pt(0.0),
            right_indent: Pt(0.0),
            bold: false,
            italic: false,
        }
    }
}

/// A single laid-out text line.
#[derive(Debug, Clone)]
struct TextLine {
    text: String,
    #[allow(dead_code)]
    width: Pt,
}

/// Paragraph flowable — text with word wrapping.
#[derive(Debug)]
pub struct Paragraph {
    text: String,
    style: ParagraphStyle,
    /// Computed after wrap()
    lines: Vec<TextLine>,
    wrapped_width: Pt,
    wrapped_height: Pt,
}

impl Paragraph {
    pub fn new(text: impl Into<String>, style: ParagraphStyle) -> Self {
        Self {
            text: text.into(),
            style,
            lines: Vec::new(),
            wrapped_width: Pt::ZERO,
            wrapped_height: Pt::ZERO,
        }
    }

    /// Create with default style.
    pub fn plain(text: impl Into<String>) -> Self {
        Self::new(text, ParagraphStyle::default())
    }

    /// Strip inline XML tags for metrics measurement.
    fn strip_tags(text: &str) -> String {
        let mut result = String::with_capacity(text.len());
        let mut in_tag = false;
        for ch in text.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => result.push(ch),
                _ => {}
            }
        }
        result
    }

    /// Word-wrap the text to fit within `max_width`.
    fn wrap_text(&self, max_width: Pt, ctx: &LayoutContext) -> Vec<TextLine> {
        let plain = Self::strip_tags(&self.text);
        if plain.is_empty() {
            return vec![TextLine {
                text: String::new(),
                width: Pt::ZERO,
            }];
        }

        let mut fonts = ctx.fonts.lock().unwrap();
        // FontRegistry.get() already tries "-Regular" suffix fallback.
        // Also try the bold variant name to match what draw() will use.
        let lookup_name = if self.style.bold {
            format!("{}-Bold", self.style.font_name)
        } else {
            self.style.font_name.clone()
        };
        let font_id = match fonts.get(&lookup_name).or_else(|| fonts.get(&self.style.font_name)) {
            Some(id) => id,
            None => {
                // Fallback: return single unwrapped line
                return vec![TextLine {
                    text: plain,
                    width: Pt::ZERO,
                }];
            }
        };

        let mut lines = Vec::new();
        let leading_indent = self.style.first_line_indent;

        for paragraph in plain.split('\n') {
            if paragraph.is_empty() {
                lines.push(TextLine {
                    text: String::new(),
                    width: Pt::ZERO,
                });
                continue;
            }

            let words: Vec<&str> = paragraph.split_whitespace().collect();
            if words.is_empty() {
                lines.push(TextLine {
                    text: String::new(),
                    width: Pt::ZERO,
                });
                continue;
            }

            let is_first_line = lines.is_empty();
            let indent = if is_first_line { leading_indent } else { Pt::ZERO };
            let effective_width = Pt(max_width.0 - indent.0 - self.style.left_indent.0 - self.style.right_indent.0);

            let mut current_line = String::new();
            let mut current_width = Pt::ZERO;
            let space_width = fonts.char_width(font_id, ' ', self.style.font_size);

            for word in &words {
                let word_width = fonts.text_width(font_id, word, self.style.font_size);

                if current_line.is_empty() {
                    // First word on line — always add it
                    current_line.push_str(word);
                    current_width = word_width;
                } else if Pt(current_width.0 + space_width.0 + word_width.0).0 <= effective_width.0
                {
                    // Word fits on current line
                    current_line.push(' ');
                    current_line.push_str(word);
                    current_width = Pt(current_width.0 + space_width.0 + word_width.0);
                } else {
                    // Word doesn't fit — start new line
                    lines.push(TextLine {
                        text: current_line,
                        width: current_width,
                    });
                    current_line = word.to_string();
                    current_width = word_width;
                }
            }

            // Last line
            if !current_line.is_empty() {
                lines.push(TextLine {
                    text: current_line,
                    width: current_width,
                });
            }
        }

        lines
    }
}

impl Flowable for Paragraph {
    fn wrap(&mut self, available_width: Pt, _available_height: Pt, ctx: &LayoutContext) -> Size {
        self.lines = self.wrap_text(available_width, ctx);
        self.wrapped_width = available_width;

        let text_height = if self.lines.is_empty() {
            self.style.leading
        } else {
            Pt(self.lines.len() as f32 * self.style.leading.0)
        };

        self.wrapped_height = Pt(self.style.space_before.0 + text_height.0 + self.style.space_after.0);

        Size::new(available_width, self.wrapped_height)
    }

    fn draw(&self, x: Pt, y: Pt, draw_list: &mut DrawList) {
        let font_name = if self.style.bold {
            format!("{}-Bold", self.style.font_name)
        } else {
            self.style.font_name.clone()
        };

        draw_list.set_font(&font_name, self.style.font_size);
        draw_list.set_fill_color(self.style.text_color);

        // Baseline offset: use font_size * 0.8 (cap-height approximation).
        // This is much more accurate than leading * 0.8 which over-shoots
        // for typical leading values (e.g. 14pt leading → 11.2 vs 10pt font → 8.0).
        let mut cy = Pt(y.0 + self.style.space_before.0 + self.style.font_size.0 * 0.8);
        let left = Pt(x.0 + self.style.left_indent.0);

        for (i, line) in self.lines.iter().enumerate() {
            if line.text.is_empty() {
                cy = Pt(cy.0 + self.style.leading.0);
                continue;
            }

            let indent = if i == 0 {
                self.style.first_line_indent
            } else {
                Pt::ZERO
            };

            match self.style.alignment {
                Alignment::Left | Alignment::Justify => {
                    draw_list.draw_text(Pt(left.0 + indent.0), cy, &line.text);
                }
                Alignment::Center => {
                    let cx = Pt(x.0 + self.wrapped_width.0 / 2.0);
                    draw_list.draw_text_center(cx, cy, &line.text);
                }
                Alignment::Right => {
                    let rx = Pt(x.0 + self.wrapped_width.0 - self.style.right_indent.0);
                    draw_list.draw_text_right(rx, cy, &line.text);
                }
            }

            cy = Pt(cy.0 + self.style.leading.0);
        }
    }

    fn split(
        &self,
        available_width: Pt,
        available_height: Pt,
        ctx: &LayoutContext,
    ) -> SplitResult {
        if self.wrapped_height.0 <= available_height.0 {
            return SplitResult::Fits;
        }

        // Calculate how many lines fit
        let header = self.style.space_before.0;
        let remaining = available_height.0 - header;
        if remaining <= 0.0 {
            return SplitResult::CannotSplit;
        }

        let lines_that_fit = (remaining / self.style.leading.0).floor() as usize;
        if lines_that_fit == 0 {
            return SplitResult::CannotSplit;
        }
        if lines_that_fit >= self.lines.len() {
            return SplitResult::Fits;
        }

        // Split at line boundary
        let first_text: String = self.lines[..lines_that_fit]
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        let second_text: String = self.lines[lines_that_fit..]
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        let mut first_style = self.style.clone();
        first_style.space_after = Pt::ZERO;

        let mut second_style = self.style.clone();
        second_style.space_before = Pt::ZERO;
        second_style.first_line_indent = Pt::ZERO;

        let mut first = Paragraph::new(first_text, first_style);
        let mut second = Paragraph::new(second_text, second_style);

        // Pre-wrap both parts
        first.wrap(available_width, Pt(f32::MAX), ctx);
        second.wrap(available_width, Pt(f32::MAX), ctx);

        SplitResult::Split(Box::new(first), Box::new(second))
    }

    fn height(&self) -> Pt {
        self.wrapped_height
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_tags() {
        assert_eq!(
            Paragraph::strip_tags("Hello <b>world</b>"),
            "Hello world"
        );
        assert_eq!(
            Paragraph::strip_tags("<i>italic</i> and <b>bold</b>"),
            "italic and bold"
        );
        assert_eq!(Paragraph::strip_tags("no tags"), "no tags");
    }
}
