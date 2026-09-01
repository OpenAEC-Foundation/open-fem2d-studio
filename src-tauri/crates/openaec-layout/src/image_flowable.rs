//! Image flowable — embedded images with optional caption.

use std::path::PathBuf;

use crate::draw::DrawList;
use crate::flowable::{Flowable, LayoutContext};
use crate::types::{Alignment, Color, Pt, Size};

/// Image data source.
#[derive(Debug, Clone)]
pub enum ImageData {
    /// Path to image file.
    Path(PathBuf),
    /// Raw image bytes (PNG/JPEG).
    Bytes(Vec<u8>),
}

/// Image flowable — displays an image at a given size.
#[derive(Debug)]
pub struct ImageFlowable {
    data: ImageData,
    width: Pt,
    height: Pt,
    alignment: Alignment,
    caption: Option<String>,
    caption_height: Pt,
}

impl ImageFlowable {
    pub fn new(data: ImageData, width: Pt, height: Pt) -> Self {
        Self {
            data,
            width,
            height,
            alignment: Alignment::Center,
            caption: None,
            caption_height: Pt(14.0),
        }
    }

    /// Create from file path with specified width; height auto-calculated from aspect ratio.
    pub fn from_path(path: impl Into<PathBuf>, width: Pt) -> Result<Self, crate::error::LayoutError> {
        let path = path.into();
        let img_data = std::fs::read(&path).map_err(|e| {
            crate::error::LayoutError::ImageError(format!("{}: {}", path.display(), e))
        })?;

        let (img_w, img_h) = image_dimensions(&img_data)?;
        let aspect = img_h as f32 / img_w as f32;
        let height = Pt(width.0 * aspect);

        Ok(Self {
            data: ImageData::Bytes(img_data),
            width,
            height,
            alignment: Alignment::Center,
            caption: None,
            caption_height: Pt(14.0),
        })
    }

    /// Create from bytes with specified width; height auto-calculated.
    pub fn from_bytes(bytes: Vec<u8>, width: Pt) -> Result<Self, crate::error::LayoutError> {
        let (img_w, img_h) = image_dimensions(&bytes)?;
        let aspect = img_h as f32 / img_w as f32;
        let height = Pt(width.0 * aspect);

        Ok(Self {
            data: ImageData::Bytes(bytes),
            width,
            height,
            alignment: Alignment::Center,
            caption: None,
            caption_height: Pt(14.0),
        })
    }

    pub fn with_alignment(mut self, alignment: Alignment) -> Self {
        self.alignment = alignment;
        self
    }

    pub fn with_caption(mut self, caption: impl Into<String>) -> Self {
        self.caption = Some(caption.into());
        self
    }

    fn total_height(&self) -> Pt {
        if self.caption.is_some() {
            Pt(self.height.0 + self.caption_height.0)
        } else {
            self.height
        }
    }
}

/// Get image dimensions from bytes.
fn image_dimensions(data: &[u8]) -> Result<(u32, u32), crate::error::LayoutError> {
    let reader = image::ImageReader::new(std::io::Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| crate::error::LayoutError::ImageError(e.to_string()))?;

    let dims = reader
        .into_dimensions()
        .map_err(|e| crate::error::LayoutError::ImageError(e.to_string()))?;

    Ok(dims)
}

impl Flowable for ImageFlowable {
    fn wrap(&mut self, available_width: Pt, _available_height: Pt, _ctx: &LayoutContext) -> Size {
        // Scale down if wider than available space
        if self.width.0 > available_width.0 {
            let scale = available_width.0 / self.width.0;
            self.width = available_width;
            self.height = Pt(self.height.0 * scale);
        }

        Size::new(available_width, self.total_height())
    }

    fn draw(&self, x: Pt, y: Pt, draw_list: &mut DrawList) {
        let img_x = match self.alignment {
            Alignment::Left | Alignment::Justify => x,
            Alignment::Center => Pt(x.0 + (self.width.0 / 2.0) - (self.width.0 / 2.0)),
            Alignment::Right => Pt(x.0 + self.width.0 - self.width.0),
        };

        let bytes = match &self.data {
            ImageData::Bytes(b) => b.clone(),
            ImageData::Path(p) => std::fs::read(p).unwrap_or_default(),
        };

        if !bytes.is_empty() {
            draw_list.draw_image(bytes, img_x, y, self.width, self.height);
        }

        // Draw caption
        if let Some(ref caption) = self.caption {
            let caption_y = Pt(y.0 + self.height.0 + 2.0);
            draw_list.set_font("LiberationSans", Pt(8.0));
            draw_list.set_fill_color(Color::GREY);
            draw_list.draw_text_center(Pt(x.0 + self.width.0 / 2.0), caption_y, caption);
        }
    }

    fn height(&self) -> Pt {
        self.total_height()
    }
}
