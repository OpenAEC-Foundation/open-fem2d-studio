//! Simple flowables: Spacer and PageBreak.

use crate::draw::DrawList;
use crate::flowable::{Flowable, LayoutContext, SplitResult};
use crate::types::{Pt, Size};

/// Vertical spacer — inserts empty space.
#[derive(Debug)]
pub struct Spacer {
    height: Pt,
}

impl Spacer {
    pub fn new(height: Pt) -> Self {
        Self { height }
    }

    pub fn from_mm(mm: f32) -> Self {
        Self {
            height: crate::types::Mm(mm).into(),
        }
    }
}

impl Flowable for Spacer {
    fn wrap(&mut self, _available_width: Pt, _available_height: Pt, _ctx: &LayoutContext) -> Size {
        Size::new(Pt::ZERO, self.height)
    }

    fn draw(&self, _x: Pt, _y: Pt, _draw_list: &mut DrawList) {
        // Spacer draws nothing
    }

    fn split(
        &self,
        _available_width: Pt,
        available_height: Pt,
        _ctx: &LayoutContext,
    ) -> SplitResult {
        if available_height.0 >= self.height.0 {
            SplitResult::Fits
        } else if available_height.0 > 0.0 {
            // Split: consume what fits, remainder on next page
            let first = Spacer::new(available_height);
            let second = Spacer::new(Pt(self.height.0 - available_height.0));
            SplitResult::Split(Box::new(first), Box::new(second))
        } else {
            SplitResult::CannotSplit
        }
    }

    fn height(&self) -> Pt {
        self.height
    }
}

/// Page break — forces a new page.
#[derive(Debug)]
pub struct PageBreak;

impl Flowable for PageBreak {
    fn wrap(&mut self, _available_width: Pt, _available_height: Pt, _ctx: &LayoutContext) -> Size {
        Size::new(Pt::ZERO, Pt::ZERO)
    }

    fn draw(&self, _x: Pt, _y: Pt, _draw_list: &mut DrawList) {
        // PageBreak draws nothing
    }

    fn height(&self) -> Pt {
        Pt::ZERO
    }

    fn is_page_break(&self) -> bool {
        true
    }
}
