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
//! En [`segment_stiffness`]: de stateloze stijfheidsdienst voor de fysisch
//! niet-lineaire tweede orde (5.8.6). Eén staaf, in segmenten, elk met zijn
//! eigen secante buigstijfheid uit `nen_en_1992_1_1::stiffness`. Daar zit ook
//! de segmentindelingsregel ([`segment_layout`]) en het convergentie-oordeel,
//! bewust in de kern en niet in de aanroeper — zie de moduletoelichting van
//! [`segments`].
//!
//! TODO: `ResistanceCalc`/`NamedCheck`/`CheckKind`/`CheckStatus` wonen nu in
//! staal-crates; verhuis ze naar een materiaal-neutrale `check-core` crate
//! zodra die bestaat.

pub mod input;
pub mod orchestrator;
pub mod result;
pub mod segments;

pub use input::{ConcreteBeamCheckInput, MnKappaRequest};
pub use orchestrator::{check_all_concrete_beams, check_concrete_beam, mn_kappa};
pub use result::{ConcreteBeamCheckResult, MnKappaResponse};
pub use segments::{
    segment_layout, segment_stiffness, SegmentForces, SegmentRunStatus, SegmentSpan,
    SegmentStatus, SegmentStiffness, SegmentStiffnessRequest, SegmentStiffnessResponse,
    DEFAULT_SEGMENT_LENGTH_MM,
};

pub use nen_en_1993_1_1_section::CheckStatus;
pub use steel_check::{CheckKind, NamedCheck};
