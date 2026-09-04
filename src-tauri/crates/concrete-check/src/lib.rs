//! Orchestrator voor de betontoetsing volgens NEN-EN 1992-1-1:2005+A1:2015
//! +NB:2016+A1:2020.
//!
//! Naar het model van `steel-check` en `timber-check`:
//! [`ConcreteBeamCheckInput`] → [`ConcreteBeamCheckResult`]. De losse
//! toetsen komen uit `nen-en-1992-1-1`; het resultaat hergebruikt de
//! bestaande rapportagetypen (`ResistanceCalc`, `NamedCheck`, `CheckKind`)
//! zodat staal, hout en beton één rapportcontract delen.
//!
//! Daarnaast biedt de crate [`mn_kappa`] aan: het M-N-κ-diagram en het
//! N-M-interactiediagram voor een korf, los van een staaf — dat is wat de
//! frontend tekent bij de wapeningskorf in de eigenschappen.
//!
//! TODO: `ResistanceCalc`/`NamedCheck`/`CheckKind`/`CheckStatus` wonen nu in
//! staal-crates; verhuis ze naar een materiaal-neutrale `check-core` crate
//! zodra die bestaat.

pub mod input;
pub mod orchestrator;
pub mod result;

pub use input::{ConcreteBeamCheckInput, MnKappaRequest};
pub use orchestrator::{check_all_concrete_beams, check_concrete_beam, mn_kappa};
pub use result::{ConcreteBeamCheckResult, MnKappaResponse};

pub use nen_en_1993_1_1_section::CheckStatus;
pub use steel_check::{CheckKind, NamedCheck};
