//! Steel check orchestrator — top-level engine that takes a beam input
//! and produces a complete check result with all derivation steps.

pub mod input;
pub mod result;
pub mod orchestrator;
pub mod deflection;

pub use input::*;
pub use result::*;
pub use orchestrator::check_beam;

pub fn check_all_beams(inputs: Vec<input::BeamCheckInput>) -> Vec<result::BeamCheckResult> {
    inputs.into_iter().map(check_beam).collect()
}
