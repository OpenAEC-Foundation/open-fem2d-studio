//! NEN-EN 1995-1-1+C1+A1:2011/NB:2013 — toetsing van houten staven.
//!
//! Alle formules zijn losse, herbruikbare functies. Elke toets levert een
//! [`ResistanceCalc`] of [`StabilityCalc`] met volledige afleiding
//! (variabelen, tussenwaarden, unity check), hetzelfde contract als de
//! staaltoetsen zodat het rapport één weergavepad houdt.
//!
//! TODO: `ResistanceCalc`, `StabilityCalc`, `NamedValue`, `UnityCheck` en
//! `CheckStatus` worden hergebruikt uit `nen-en-1993-1-1-section` /
//! `nen-en-1993-1-1-stability`. Die typen zijn materiaal-neutraal maar wonen
//! nu in staal-crates; verhuis ze later naar een gedeelde `check-core` crate.
//!
//! Verificatiestatus: de geïmplementeerde formules zijn per stuk getoetst
//! tegen de referentie-uitwerking (houten raamwerk, C24 96x450) of tegen de
//! normtekst zoals die letterlijk in de referentie-uitwerking is afgedrukt.
//! Onderdelen die niet tegen een van beide konden worden onderbouwd, zijn in
//! hun doc-comment expliciet als NIET-GEVERIFIEERD gemarkeerd.

pub mod data;
pub mod factors;
pub mod section;
pub mod compression;
pub mod bending;
pub mod shear;
pub mod stability;
pub mod deflection;

pub use data::{strength_class_by_name, StrengthClass};
pub use factors::{
    beta_c, design_strength, gamma_m, k_def, k_h, k_m, k_mod, k_sys,
    LoadDurationClass, ServiceClass, TimberType,
};
pub use section::RectTimberSection;

// Hergebruikte resultaattypen (zie TODO in de crate-doc).
pub use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};
pub use nen_en_1993_1_1_stability::StabilityCalc;
