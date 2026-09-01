//! openaec-layout — PDF layout engine.
//!
//! A Rust equivalent of Python's ReportLab Platypus. Provides:
//! - **Flowables**: content elements (Paragraph, Table, Image, Spacer, PageBreak)
//! - **Frame**: container that places flowables top-to-bottom
//! - **PageTemplate**: page structure with frames and decorations
//! - **DocTemplate**: multi-page PDF assembly
//!
//! # Usage
//!
//! ```rust,no_run
//! use openaec_layout::*;
//!
//! // Create font registry
//! let fonts = fonts::shared_font_registry();
//!
//! // Create document
//! let mut doc = DocTemplate::new("My Report", fonts.clone());
//!
//! // Add a page template
//! let frame = Frame::new(Rect::new(Pt(56.7), Pt(56.7), Pt(481.9), Pt(728.5)));
//! let template = PageTemplate::new("content", A4, frame);
//! doc.add_page_template(template);
//!
//! // Create flowables
//! let flowables: Vec<Box<dyn Flowable>> = vec![
//!     Box::new(Paragraph::plain("Hello, World!")),
//!     Box::new(Spacer::from_mm(10.0)),
//! ];
//!
//! // Build PDF
//! let pdf_bytes = doc.build_to_bytes(flowables).unwrap();
//! ```

pub mod types;
pub mod error;
pub mod fonts;
pub mod draw;
pub mod flowable;
pub mod spacer;
pub mod paragraph;
pub mod table;
pub mod image_flowable;
pub mod frame;
pub mod page_template;
pub mod doc_template;

// Re-exports
pub use types::{Pt, Mm, Size, Rect, Color, Alignment, Padding, A4, A3};
pub use error::LayoutError;
pub use fonts::{FontId, FontRegistry, SharedFontRegistry, shared_font_registry};
pub use draw::{DrawOp, DrawList};
pub use flowable::{Flowable, LayoutContext, SplitResult};
pub use spacer::{Spacer, PageBreak};
pub use paragraph::{Paragraph, ParagraphStyle};
pub use table::{Table, TableStyleConfig, CellContent};
pub use image_flowable::{ImageFlowable, ImageData};
pub use frame::{Frame, FrameResult};
pub use page_template::{PageTemplate, PageCallback};
pub use doc_template::{DocTemplate, RawPage};
