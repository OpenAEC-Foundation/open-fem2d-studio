//! Input types for steel-check orchestrator.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForcePoint;
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub enum DeflectionClass { Floor, Roof, Cantilever, Custom }

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct BeamCheckInput {
    pub beam_id: u32,
    pub profile_name: String,
    pub steel_grade: String,
    pub length_m: f64,
    pub forces_envelope: Vec<ForcePoint>,
    pub lateral_bracing: LateralBracing,
    pub buckling_length_y_m: f64,
    pub buckling_length_z_m: f64,
    pub deflection_limit_class: DeflectionClass,
    pub deflection_limit_numerator: u32,
    pub deflection_actual_max_mm: f64,
    pub is_cantilever: bool,
    pub consequence_class: ConsequenceClass,
}
