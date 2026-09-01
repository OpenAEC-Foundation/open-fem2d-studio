//! Page template — defines the layout of a single page type.

use crate::draw::DrawList;
use crate::frame::Frame;
use crate::types::Size;

/// Callback for drawing page decorations (header, footer, stationery).
pub trait PageCallback: Send + Sync + std::fmt::Debug {
    /// Called after the page content is drawn.
    fn on_page(
        &self,
        draw_list: &mut DrawList,
        page_num: usize,
        total_pages: usize,
        page_size: Size,
    );
}

/// A page template defines the layout structure for a page type.
#[derive(Debug)]
pub struct PageTemplate {
    /// Template name (e.g., "content", "cover", "landscape").
    pub name: String,
    /// Page dimensions.
    pub page_size: Size,
    /// Content frames on this page.
    pub frames: Vec<Frame>,
    /// Optional callback for page decorations.
    pub on_page: Option<Box<dyn PageCallback>>,
}

impl PageTemplate {
    /// Create a new page template with a single content frame.
    pub fn new(name: impl Into<String>, page_size: Size, frame: Frame) -> Self {
        Self {
            name: name.into(),
            page_size,
            frames: vec![frame],
            on_page: None,
        }
    }

    pub fn with_callback(mut self, callback: Box<dyn PageCallback>) -> Self {
        self.on_page = Some(callback);
        self
    }

    /// Get the primary (first) frame.
    pub fn primary_frame(&self) -> &Frame {
        &self.frames[0]
    }
}
