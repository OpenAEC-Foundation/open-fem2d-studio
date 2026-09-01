//! NEN-EN 1993-1-1 §6.3 — member stability checks.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{NamedValue, UnityCheck, CheckStatus};

pub mod buckling_curve;
pub mod column_buckling;
pub mod interaction_factors;
pub mod combined_n_m;

/// Mirror of ResistanceCalc but for stability checks.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct StabilityCalc {
    pub id: String,
    pub title: String,
    pub article: String,
    pub force_state: ForceStateSnapshot,
    pub formula_latex: String,
    pub variables: Vec<NamedValue>,
    pub intermediate_values: Vec<NamedValue>,
    pub value: f64,
    pub unit: String,
    pub uc: Option<UnityCheck>,
    pub status: CheckStatus,
    pub notes: Vec<String>,
}
