//! Mechanics primitives — force/moment structures, beam axis, force envelopes.
//! Used as foundation by all higher crates. No application-specific deps.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Internal forces at a point along a beam.
/// Sign convention: N positive = tension; My positive = bottom fibre tension.
/// Units: kN (forces), kNm (moments).
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct InternalForces {
    pub n_ed: f64,
    pub vy_ed: f64,
    pub vz_ed: f64,
    pub mt_ed: f64,
    pub my_ed: f64,
    pub mz_ed: f64,
}

/// Beam local axis frame.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct BeamAxis {
    pub length_m: f64,
    pub orientation_rad: f64,
}

/// One sample point along a beam: position (mm from start) + governing
/// internal forces at that location for some load combination.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ForcePoint {
    pub combination_id: u32,
    pub position_mm: f64,
    pub forces: InternalForces,
}

/// Snapshot of force state at a single check location — used in derivation reports.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ForceStateSnapshot {
    pub combination_id: u32,
    pub position_mm: f64,
    pub forces: InternalForces,
}

impl ForceStateSnapshot {
    pub fn from_point(p: &ForcePoint) -> Self {
        Self {
            combination_id: p.combination_id,
            position_mm: p.position_mm,
            forces: p.forces,
        }
    }
}
