//! Frame — container that places flowables top-to-bottom.
//!
//! A frame occupies a rectangular area on a page. Flowables are added
//! sequentially. When a flowable doesn't fit, the frame signals overflow.

use crate::draw::DrawList;
use crate::flowable::{Flowable, LayoutContext, SplitResult};
use crate::types::{Padding, Pt, Rect};

/// Result of adding flowables to a frame.
#[derive(Debug)]
pub enum FrameResult {
    /// All flowables were placed.
    Complete,
    /// Overflow: remaining flowables starting at this index.
    Overflow {
        /// Index of the first flowable that didn't fit.
        first_remaining: usize,
        /// If the flowable at `first_remaining` was split, this is the second part.
        split_remainder: Option<Box<dyn Flowable>>,
    },
}

/// A rectangular area on a page that contains flowables.
#[derive(Debug, Clone)]
pub struct Frame {
    pub rect: Rect,
    pub padding: Padding,
}

impl Frame {
    pub fn new(rect: Rect) -> Self {
        Self {
            rect,
            padding: Padding::default(),
        }
    }

    pub fn with_padding(mut self, padding: Padding) -> Self {
        self.padding = padding;
        self
    }

    /// Inner width after padding.
    pub fn inner_width(&self) -> Pt {
        Pt(self.rect.width.0 - self.padding.horizontal().0)
    }

    /// Inner height after padding.
    pub fn inner_height(&self) -> Pt {
        Pt(self.rect.height.0 - self.padding.vertical().0)
    }

    /// Layout and draw flowables into this frame.
    ///
    /// Returns `FrameResult::Complete` if all flowables fit,
    /// or `FrameResult::Overflow` with the index of the first
    /// flowable that didn't fit.
    pub fn add_flowables(
        &self,
        flowables: &mut [Box<dyn Flowable>],
        draw_list: &mut DrawList,
        ctx: &LayoutContext,
    ) -> FrameResult {
        let inner_w = self.inner_width();
        let inner_h = self.inner_height();
        let start_x = Pt(self.rect.x.0 + self.padding.left.0);
        let start_y = Pt(self.rect.y.0 + self.padding.top.0);

        let mut cursor_y = Pt(0.0);

        for (i, flowable) in flowables.iter_mut().enumerate() {
            // Page break forces overflow
            if flowable.is_page_break() {
                return FrameResult::Overflow {
                    first_remaining: i + 1,
                    split_remainder: None,
                };
            }

            let remaining_height = Pt(inner_h.0 - cursor_y.0);
            let size = flowable.wrap(inner_w, remaining_height, ctx);

            if size.height.0 <= remaining_height.0 {
                // Fits — draw it
                flowable.draw(start_x, Pt(start_y.0 + cursor_y.0), draw_list);
                cursor_y = Pt(cursor_y.0 + size.height.0);
            } else {
                // Doesn't fit — try splitting
                match flowable.split(inner_w, remaining_height, ctx) {
                    SplitResult::Fits => {
                        flowable.draw(start_x, Pt(start_y.0 + cursor_y.0), draw_list);
                        cursor_y = Pt(cursor_y.0 + size.height.0);
                    }
                    SplitResult::Split(mut first, second) => {
                        let first_size = first.wrap(inner_w, remaining_height, ctx);
                        first.draw(start_x, Pt(start_y.0 + cursor_y.0), draw_list);
                        // cursor_y advances but we return immediately
                        let _cursor_y = Pt(cursor_y.0 + first_size.height.0);
                        return FrameResult::Overflow {
                            first_remaining: i + 1,
                            split_remainder: Some(second),
                        };
                    }
                    SplitResult::CannotSplit => {
                        return FrameResult::Overflow {
                            first_remaining: i,
                            split_remainder: None,
                        };
                    }
                }
            }
        }

        FrameResult::Complete
    }
}
