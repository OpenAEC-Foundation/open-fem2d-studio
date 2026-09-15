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

use crate::belastingduur::KmodPerLoadDuration;

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
    /// Zonder belastingduur per combinatie: de klasse uit de invoer. Met die
    /// lijst: de klasse van de maatgevende toets die van k_mod afhangt (de
    /// doorbuiging hangt er niet van af en telt hier niet mee).
    pub load_duration: LoadDurationClass,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
    /// k_mod per belastingduurklasse met de combinaties erin (§3.1.3(2)).
    /// Leeg als de invoer geen belastingduur per combinatie meegaf.
    #[serde(default)]
    #[ts(as = "Option<Vec<KmodPerLoadDuration>>", optional)]
    pub k_mod_per_load_duration: Vec<KmodPerLoadDuration>,
    /// De combinatie van het maatgevende krachtpunt van de zwaarste toets die
    /// van k_mod afhangt. `None` zonder belastingduur per combinatie, of als
    /// geen enkele sterktetoets een unity check groter dan nul had.
    #[serde(default)]
    #[ts(optional)]
    pub governing_combination_id: Option<u32>,
}
