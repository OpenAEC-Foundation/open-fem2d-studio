//! Font registry — TTF loading, metrics, text measurement.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use crate::error::LayoutError;
use crate::types::Pt;

/// Opaque font identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FontId(pub(crate) usize);

/// Cached per-font data and metrics.
struct FontEntry {
    /// Raw TTF/OTF bytes (kept for PDF embedding).
    data: Vec<u8>,
    /// Units per em from the font header.
    units_per_em: f32,
    /// Typographic ascender in font units.
    ascender: f32,
    /// Typographic descender in font units (negative).
    descender: f32,
    /// Glyph advance widths cache (char → advance in font units).
    advances: HashMap<char, f32>,
}

impl FontEntry {
    fn load(data: Vec<u8>) -> Result<Self, LayoutError> {
        let face = ttf_parser::Face::parse(&data, 0)
            .map_err(|e| LayoutError::FontParseError(e.to_string()))?;

        let units_per_em = face.units_per_em() as f32;
        let ascender = face.ascender() as f32;
        let descender = face.descender() as f32;

        // Pre-cache ASCII advances
        let mut advances = HashMap::with_capacity(128);
        for ch in ' '..='~' {
            if let Some(glyph_id) = face.glyph_index(ch) {
                let advance = face.glyph_hor_advance(glyph_id).unwrap_or(0) as f32;
                advances.insert(ch, advance);
            }
        }

        Ok(Self {
            data,
            units_per_em,
            ascender,
            descender,
            advances,
        })
    }

    fn char_advance(&mut self, ch: char, data: &[u8]) -> f32 {
        if let Some(&adv) = self.advances.get(&ch) {
            return adv;
        }
        // Cache miss — parse face and look up
        let advance = ttf_parser::Face::parse(data, 0)
            .ok()
            .and_then(|face| face.glyph_index(ch))
            .and_then(|gid| {
                ttf_parser::Face::parse(data, 0)
                    .ok()
                    .and_then(|face| face.glyph_hor_advance(gid))
            })
            .unwrap_or(0) as f32;
        self.advances.insert(ch, advance);
        advance
    }
}

/// Registry of loaded fonts with metrics and measurement.
pub struct FontRegistry {
    fonts: Vec<FontEntry>,
    names: HashMap<String, FontId>,
}

impl FontRegistry {
    pub fn new() -> Self {
        Self {
            fonts: Vec::new(),
            names: HashMap::new(),
        }
    }

    /// Register a TTF/OTF font from file.
    pub fn register_ttf(&mut self, name: &str, path: &Path) -> Result<FontId, LayoutError> {
        let data = std::fs::read(path).map_err(|e| {
            LayoutError::FontNotFound(format!("{}: {}", path.display(), e))
        })?;
        self.register_ttf_bytes(name, data)
    }

    /// Register a TTF/OTF font from bytes.
    pub fn register_ttf_bytes(&mut self, name: &str, data: Vec<u8>) -> Result<FontId, LayoutError> {
        let entry = FontEntry::load(data)?;
        let id = FontId(self.fonts.len());
        self.fonts.push(entry);
        self.names.insert(name.to_string(), id);
        Ok(id)
    }

    /// Register an alias for an existing font name.
    ///
    /// This allows e.g. `"LiberationSans"` to resolve to `"LiberationSans-Regular"`.
    pub fn register_alias(&mut self, alias: &str, target: &str) -> bool {
        if let Some(&id) = self.names.get(target) {
            self.names.insert(alias.to_string(), id);
            true
        } else {
            false
        }
    }

    /// Look up font by name, with automatic `-Regular` suffix fallback.
    pub fn get(&self, name: &str) -> Option<FontId> {
        self.names
            .get(name)
            .or_else(|| self.names.get(&format!("{}-Regular", name)))
            .copied()
    }

    /// Get raw font bytes (for PDF embedding).
    pub fn font_data(&self, id: FontId) -> &[u8] {
        &self.fonts[id.0].data
    }

    /// Measure the width of a text string at a given font size.
    pub fn text_width(&mut self, id: FontId, text: &str, size: Pt) -> Pt {
        let entry = &self.fonts[id.0];
        let upem = entry.units_per_em;
        let data_clone = entry.data.clone();

        let entry = &mut self.fonts[id.0];
        let total: f32 = text.chars().map(|ch| entry.char_advance(ch, &data_clone)).sum();
        Pt(total * size.0 / upem)
    }

    /// Measure width of a single character.
    pub fn char_width(&mut self, id: FontId, ch: char, size: Pt) -> Pt {
        let data_clone = self.fonts[id.0].data.clone();
        let entry = &mut self.fonts[id.0];
        let advance = entry.char_advance(ch, &data_clone);
        Pt(advance * size.0 / entry.units_per_em)
    }

    /// Font ascender at a given size (positive, above baseline).
    pub fn ascent(&self, id: FontId, size: Pt) -> Pt {
        let entry = &self.fonts[id.0];
        Pt(entry.ascender * size.0 / entry.units_per_em)
    }

    /// Font descender at a given size (positive value, below baseline).
    pub fn descent(&self, id: FontId, size: Pt) -> Pt {
        let entry = &self.fonts[id.0];
        Pt(-entry.descender * size.0 / entry.units_per_em)
    }

    /// Recommended line height at a given size.
    pub fn line_height(&self, id: FontId, size: Pt) -> Pt {
        let ascent = self.ascent(id, size);
        let descent = self.descent(id, size);
        Pt(ascent.0 + descent.0)
    }

    /// Number of registered fonts.
    pub fn len(&self) -> usize {
        self.fonts.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.fonts.is_empty()
    }

    /// Iterator over registered font names and IDs.
    pub fn iter(&self) -> impl Iterator<Item = (&str, FontId)> {
        self.names.iter().map(|(name, &id)| (name.as_str(), id))
    }
}

impl Default for FontRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Shared font registry (Arc wrapper for thread safety).
pub type SharedFontRegistry = Arc<std::sync::Mutex<FontRegistry>>;

/// Create a new shared font registry.
pub fn shared_font_registry() -> SharedFontRegistry {
    Arc::new(std::sync::Mutex::new(FontRegistry::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: tests that need actual TTF files are in integration tests.
    // These tests verify the API surface.

    #[test]
    fn test_empty_registry() {
        let reg = FontRegistry::new();
        assert!(reg.is_empty());
        assert_eq!(reg.len(), 0);
        assert!(reg.get("anything").is_none());
    }
}
