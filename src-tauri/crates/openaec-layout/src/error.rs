//! Layout engine errors.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum LayoutError {
    #[error("font not found: {0}")]
    FontNotFound(String),

    #[error("font parse error: {0}")]
    FontParseError(String),

    #[error("image error: {0}")]
    ImageError(String),

    #[error("PDF generation error: {0}")]
    PdfError(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
