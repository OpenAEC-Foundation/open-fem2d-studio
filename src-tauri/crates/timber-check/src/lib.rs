//! Orchestrator voor houttoetsing volgens NEN-EN 1995-1-1+C1+A1:2011/NB:2013.
//!
//! Naar het model van `steel-check`: [`TimberBeamCheckInput`] →
//! [`TimberBeamCheckResult`]. De losse toetsen komen uit `nen-en-1995-1-1`;
//! het resultaat hergebruikt de bestaande rapportagetypen (`ResistanceCalc`,
//! `StabilityCalc`, `NamedCheck`, `CheckKind`) zodat staal en hout één
//! rapportcontract delen.
//!
//! TODO: `ResistanceCalc`/`StabilityCalc`/`NamedCheck`/`CheckKind`/
//! `CheckStatus` wonen nu in staal-crates (`nen-en-1993-1-1-section`,
//! `nen-en-1993-1-1-stability`, `steel-check`); verhuis ze naar een
//! materiaal-neutrale `check-core` crate zodra die bestaat.

pub mod input;
pub mod orchestrator;
pub mod result;

pub use input::TimberBeamCheckInput;
pub use orchestrator::check_timber_beam;
pub use result::TimberBeamCheckResult;

pub use nen_en_1993_1_1_section::CheckStatus;
pub use steel_check::{CheckKind, NamedCheck};
