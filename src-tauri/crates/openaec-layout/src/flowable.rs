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

    /// Mag dit element **niet** als laatste op een vel achterblijven?
    ///
    /// Een kop hoort bij wat eronder staat: een kop onderaan een bladzijde met
    /// zijn tabel op de volgende is een aankondiging zonder inhoud. Het live
    /// HTML-rapport lost dat op met de `KOP`-lijst in
    /// `design-mockup/src/components/report/paginate.ts` — dezelfde regel,
    /// daar op CSS-selectors en hier op de flowable zelf.
    ///
    /// De paginamotor van [`crate::doc_template::DocTemplate`] eist bij `true`
    /// dat er ná deze kop — en ná de kopketen die er direct achter staat — nog
    /// [`MIN_VERVOLG`](crate::doc_template::MIN_VERVOLG) aan ruimte op het vel
    /// over is; anders verhuist de hele kopketen naar het volgende vel.
    ///
    /// Bewust GEEN eis dat het volgende element in zijn geheel past: een kop
    /// boven een tabel van drie bladzijden zou dan eindeloos doorschuiven.
    fn keep_with_next(&self) -> bool {
        false
    }

    /// Hoeveel ruimte dit element minstens nodig heeft om ZINVOL TE BEGINNEN
    /// op het vel waar een kop erboven staat.
    ///
    /// Voor alles wat kan splitsen — een alinea, een tabel — is dat een paar
    /// regels: [`MIN_VERVOLG`](crate::doc_template::MIN_VERVOLG). Voor iets dat
    /// NIET kan splitsen, zoals een figuur, is het de volle hoogte: een kop
    /// bovenaan met de figuur op het volgende vel laat een halve bladzijde wit
    /// achter, en dat is precies wat je op het gerenderde blad ziet en in de
    /// code niet.
    ///
    /// Alleen gebruikt in de vooruitblik ná een kop. De paginamotor slaat die
    /// vooruitblik over zodra het vel nog leeg is, dus een figuur die hoger is
    /// dan een hele bladzijde kan hiermee niet in een lus terechtkomen.
    fn min_start_height(&self) -> Pt {
        crate::doc_template::MIN_VERVOLG
    }
}
