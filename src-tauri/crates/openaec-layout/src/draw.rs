//! Draw operations — intermediate representation between layout and PDF output.
//!
//! The layout engine produces `DrawOp` sequences. The PDF backend converts
//! them to actual PDF content streams.
//!
//! Coordinate system: top-left origin, Y increases downward.
//! The PDF backend converts to PDF's bottom-left origin.

use crate::types::{Color, Pt};

/// A single drawing operation.
#[derive(Debug, Clone)]
pub enum DrawOp {
    /// Set current font.
    SetFont { name: String, size: Pt },

    /// Draw text at position (top-left of text baseline).
    DrawText { x: Pt, y: Pt, text: String },

    /// Draw right-aligned text (x is the right edge).
    DrawTextRight { x: Pt, y: Pt, text: String },

    /// Draw center-aligned text (x is the center).
    DrawTextCenter { x: Pt, y: Pt, text: String },

    /// Set fill color.
    SetFillColor(Color),

    /// Set stroke color.
    SetStrokeColor(Color),

    /// Set line width.
    SetLineWidth(Pt),

    /// Draw a rectangle.
    DrawRect {
        x: Pt,
        y: Pt,
        width: Pt,
        height: Pt,
        fill: bool,
        stroke: bool,
    },

    /// Draw a line.
    DrawLine {
        x1: Pt,
        y1: Pt,
        x2: Pt,
        y2: Pt,
    },

    /// Draw an image from bytes.
    DrawImage {
        data: Vec<u8>,
        x: Pt,
        y: Pt,
        width: Pt,
        height: Pt,
    },

    /// Draw a closed polygon (filled and/or stroked).
    DrawPolygon {
        points: Vec<(Pt, Pt)>,
        fill: bool,
        stroke: bool,
    },

    /// Draw a rounded rectangle.
    DrawRoundedRect {
        x: Pt,
        y: Pt,
        width: Pt,
        height: Pt,
        radius: Pt,
        fill: bool,
        stroke: bool,
    },

    /// Save graphics state.
    SaveState,

    /// Restore graphics state.
    RestoreState,
}

/// A list of draw operations for a single page.
#[derive(Debug, Clone, Default)]
pub struct DrawList {
    pub ops: Vec<DrawOp>,
}

impl DrawList {
    pub fn new() -> Self {
        Self { ops: Vec::new() }
    }

    pub fn set_font(&mut self, name: &str, size: Pt) {
        self.ops.push(DrawOp::SetFont {
            name: name.to_string(),
            size,
        });
    }

    pub fn draw_text(&mut self, x: Pt, y: Pt, text: &str) {
        self.ops.push(DrawOp::DrawText {
            x,
            y,
            text: text.to_string(),
        });
    }

    pub fn draw_text_right(&mut self, x: Pt, y: Pt, text: &str) {
        self.ops.push(DrawOp::DrawTextRight {
            x,
            y,
            text: text.to_string(),
        });
    }

    pub fn draw_text_center(&mut self, x: Pt, y: Pt, text: &str) {
        self.ops.push(DrawOp::DrawTextCenter {
            x,
            y,
            text: text.to_string(),
        });
    }

    pub fn set_fill_color(&mut self, color: Color) {
        self.ops.push(DrawOp::SetFillColor(color));
    }

    pub fn set_stroke_color(&mut self, color: Color) {
        self.ops.push(DrawOp::SetStrokeColor(color));
    }

    pub fn set_line_width(&mut self, width: Pt) {
        self.ops.push(DrawOp::SetLineWidth(width));
    }

    pub fn draw_rect(&mut self, x: Pt, y: Pt, width: Pt, height: Pt, fill: bool, stroke: bool) {
        self.ops.push(DrawOp::DrawRect {
            x,
            y,
            width,
            height,
            fill,
            stroke,
        });
    }

    pub fn draw_line(&mut self, x1: Pt, y1: Pt, x2: Pt, y2: Pt) {
        self.ops.push(DrawOp::DrawLine { x1, y1, x2, y2 });
    }

    pub fn draw_image(&mut self, data: Vec<u8>, x: Pt, y: Pt, width: Pt, height: Pt) {
        self.ops.push(DrawOp::DrawImage {
            data,
            x,
            y,
            width,
            height,
        });
    }

    pub fn draw_polygon(&mut self, points: Vec<(Pt, Pt)>, fill: bool, stroke: bool) {
        self.ops.push(DrawOp::DrawPolygon {
            points,
            fill,
            stroke,
        });
    }

    pub fn draw_rounded_rect(
        &mut self,
        x: Pt,
        y: Pt,
        width: Pt,
        height: Pt,
        radius: Pt,
        fill: bool,
        stroke: bool,
    ) {
        self.ops.push(DrawOp::DrawRoundedRect {
            x,
            y,
            width,
            height,
            radius,
            fill,
            stroke,
        });
    }

    pub fn save_state(&mut self) {
        self.ops.push(DrawOp::SaveState);
    }

    pub fn restore_state(&mut self) {
        self.ops.push(DrawOp::RestoreState);
    }
}
