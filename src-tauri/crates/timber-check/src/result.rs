//! Resultaattypen voor de hout-orchestrator.
//!
//! `NamedCheck`/`CheckKind` worden hergebruikt uit `steel-check` zodat het
//! rapport één weergavecontract houdt (TODO: naar een materiaal-neutrale
//! crate verhuizen, zie crate-doc).

use nen_en_1993_1_1_section::CheckStatus;
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use serde::{Deserialize, Serialize};
use steel_check::NamedCheck;
use ts_rs::TS;

/// Volledig toetsresultaat van één houten staaf.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct TimberBeamCheckResult {
    pub beam_id: u32,
    /// Doorsnedenaam, bijv. "96 x 450".
    pub section_name: String,
    /// Sterkteklasse, bijv. "C24".
    pub strength_class: String,
    pub service_class: ServiceClass,
    pub load_duration: LoadDurationClass,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
}
