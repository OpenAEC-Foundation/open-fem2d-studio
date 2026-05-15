//! Result types for steel-check orchestrator.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use nen_en_1993_1_1_section::{ResistanceCalc, CheckStatus};
use nen_en_1993_1_1_section::classification::CrossSectionClass;
use nen_en_1993_1_1_stability::StabilityCalc;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
#[serde(tag = "type", content = "data")]
pub enum CheckKind {
    Resistance(ResistanceCalc),
    Stability(StabilityCalc),
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct NamedCheck {
    pub id: String,
    pub kind: CheckKind,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct BeamCheckResult {
    pub beam_id: u32,
    pub profile_name: String,
    pub steel_grade: String,
    pub classification: CrossSectionClass,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
}
