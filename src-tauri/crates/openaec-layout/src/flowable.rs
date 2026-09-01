//! Flowable trait — the core abstraction for layout elements.
//!
//! Equivalent to ReportLab's `Flowable` base class. Every content element
//! (paragraph, table, image, spacer) implements this trait.

use crate::draw::DrawList;
use crate::fonts::SharedFontRegistry;
use crate::types::{Pt, Size};

/// Context passed to flowables during layout.
pub struct LayoutContext {
    pub fonts: SharedFontRegistry,
}

/// Result of attempting to split a flowable across a page boundary.
pub enum SplitResult {
    /// The flowable fits entirely in the available space.
    Fits,
    /// The flowable was split into two parts.
    Split(Box<dyn Flowable>, Box<dyn Flowable>),
    /// The flowable cannot be split; move to next page.
    CannotSplit,
}

/// A content element that can be laid out in a frame.
pub trait Flowable: std::fmt::Debug + Send {
    /// Calculate the size this flowable needs, given available space.
    /// Must be called before `draw()`.
    fn wrap(&mut self, available_width: Pt, available_height: Pt, ctx: &LayoutContext) -> Size;

    /// Draw the flowable at position (x, y) in top-left coordinates.
    fn draw(&self, x: Pt, y: Pt, draw_list: &mut DrawList);

    /// Attempt to split this flowable at the page boundary.
    /// `available_height` is the remaining space on the current page.
    fn split(
        &self,
        _available_width: Pt,
        _available_height: Pt,
        _ctx: &LayoutContext,
    ) -> SplitResult {
        SplitResult::CannotSplit
    }

    /// The wrapped height (after `wrap()` has been called).
    fn height(&self) -> Pt;

    /// Whether this flowable forces a page break.
    fn is_page_break(&self) -> bool {
        false
    }
}
