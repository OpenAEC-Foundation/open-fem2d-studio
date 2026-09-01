//! Core types: units, geometry, colors.

use std::ops::{Add, Div, Mul, Sub};

/// Points (1/72 inch) — PDF native unit.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Default)]
pub struct Pt(pub f32);

/// Millimeters — human-friendly unit.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Default)]
pub struct Mm(pub f32);

const MM_TO_PT: f32 = 72.0 / 25.4; // 2.834_645_7

impl From<Mm> for Pt {
    fn from(mm: Mm) -> Self {
        Pt(mm.0 * MM_TO_PT)
    }
}

impl From<Pt> for Mm {
    fn from(pt: Pt) -> Self {
        Mm(pt.0 / MM_TO_PT)
    }
}

// ── Arithmetic for Pt ────────────────────────────────────────────────

impl Add for Pt {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Pt(self.0 + rhs.0)
    }
}

impl Sub for Pt {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Pt(self.0 - rhs.0)
    }
}

impl Mul<f32> for Pt {
    type Output = Self;
    fn mul(self, rhs: f32) -> Self {
        Pt(self.0 * rhs)
    }
}

impl Div<f32> for Pt {
    type Output = Self;
    fn div(self, rhs: f32) -> Self {
        Pt(self.0 / rhs)
    }
}

impl Pt {
    pub const ZERO: Self = Pt(0.0);

    pub fn max(self, other: Self) -> Self {
        Pt(self.0.max(other.0))
    }

    pub fn min(self, other: Self) -> Self {
        Pt(self.0.min(other.0))
    }
}

// ── Geometry ─────────────────────────────────────────────────────────

/// 2D size in points.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Size {
    pub width: Pt,
    pub height: Pt,
}

impl Size {
    pub const fn new(width: Pt, height: Pt) -> Self {
        Self { width, height }
    }

    pub fn landscape(self) -> Self {
        Size {
            width: self.height,
            height: self.width,
        }
    }
}

/// Rectangle (position + size) in points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: Pt,
    pub y: Pt,
    pub width: Pt,
    pub height: Pt,
}

impl Rect {
    pub const fn new(x: Pt, y: Pt, width: Pt, height: Pt) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }
}

// ── Color ────────────────────────────────────────────────────────────

/// RGBA color.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Color {
    pub const fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b, a: 255 }
    }

    pub const fn rgba(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self { r, g, b, a }
    }

    /// Convert to PDF color floats (0.0–1.0).
    pub fn to_pdf_rgb(&self) -> (f32, f32, f32) {
        (
            self.r as f32 / 255.0,
            self.g as f32 / 255.0,
            self.b as f32 / 255.0,
        )
    }

    /// Parse hex color string (#RRGGBB or #RGB).
    pub fn from_hex(hex: &str) -> Option<Self> {
        let hex = hex.trim_start_matches('#');
        match hex.len() {
            6 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                Some(Self::rgb(r, g, b))
            }
            3 => {
                let r = u8::from_str_radix(&hex[0..1], 16).ok()? * 17;
                let g = u8::from_str_radix(&hex[1..2], 16).ok()? * 17;
                let b = u8::from_str_radix(&hex[2..3], 16).ok()? * 17;
                Some(Self::rgb(r, g, b))
            }
            _ => None,
        }
    }

    pub const BLACK: Self = Self::rgb(0, 0, 0);
    pub const WHITE: Self = Self::rgb(255, 255, 255);
    pub const RED: Self = Self::rgb(255, 0, 0);
    pub const GREEN: Self = Self::rgb(0, 128, 0);
    pub const GREY: Self = Self::rgb(128, 128, 128);
    pub const LIGHT_GREY: Self = Self::rgb(230, 230, 230);
}

impl Default for Color {
    fn default() -> Self {
        Self::BLACK
    }
}

// ── Alignment ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Alignment {
    #[default]
    Left,
    Center,
    Right,
    Justify,
}

// ── Padding ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Padding {
    pub top: Pt,
    pub right: Pt,
    pub bottom: Pt,
    pub left: Pt,
}

impl Padding {
    pub const fn all(value: Pt) -> Self {
        Self {
            top: value,
            right: value,
            bottom: value,
            left: value,
        }
    }

    pub const fn new(top: Pt, right: Pt, bottom: Pt, left: Pt) -> Self {
        Self {
            top,
            right,
            bottom,
            left,
        }
    }

    pub fn horizontal(&self) -> Pt {
        Pt(self.left.0 + self.right.0)
    }

    pub fn vertical(&self) -> Pt {
        Pt(self.top.0 + self.bottom.0)
    }
}

// ── Standard page sizes ──────────────────────────────────────────────

pub const A4: Size = Size::new(Pt(595.28), Pt(841.89));
pub const A3: Size = Size::new(Pt(841.89), Pt(1190.55));

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mm_to_pt() {
        let pt: Pt = Mm(25.4).into();
        assert!((pt.0 - 72.0).abs() < 0.01);
    }

    #[test]
    fn test_pt_to_mm() {
        let mm: Mm = Pt(72.0).into();
        assert!((mm.0 - 25.4).abs() < 0.01);
    }

    #[test]
    fn test_a4_dimensions_mm() {
        let w: Mm = A4.width.into();
        let h: Mm = A4.height.into();
        assert!((w.0 - 210.0).abs() < 0.1);
        assert!((h.0 - 297.0).abs() < 0.1);
    }

    #[test]
    fn test_color_from_hex() {
        let c = Color::from_hex("#40124A").unwrap();
        assert_eq!(c.r, 0x40);
        assert_eq!(c.g, 0x12);
        assert_eq!(c.b, 0x4A);
    }

    #[test]
    fn test_landscape() {
        let ls = A4.landscape();
        assert_eq!(ls.width, A4.height);
        assert_eq!(ls.height, A4.width);
    }
}
