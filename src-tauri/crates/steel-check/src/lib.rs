//! Steel check orchestrator — top-level engine that takes a beam input
//! and produces a complete check result with all derivation steps.

/// De nationaal bepaalde parameters bij NEN-EN 1990, uit de normnaad.
///
/// Voor deze crate gaat het om de doorbuigingsgrenzen van A1.4.3(3) en (4):
/// ℓ_rep/500, 3/1 000·ℓ_rep, ℓ_rep/250 en ℓ_rep/150 voor w2 + w3. Ze stonden
/// als losse getallen in `deflection`.
pub(crate) const NDP_1990: nationale_bijlage::Ndp1990 =
    nationale_bijlage::Ndp1990::voor(nationale_bijlage::NationaleBijlage::NL);

pub mod input;
pub mod result;
pub mod orchestrator;
pub mod deflection;
pub mod verlopend;

pub use input::*;
pub use result::*;
pub use orchestrator::check_beam;
pub use verlopend::{bepaal_verloop, Maten, Verloop};

pub fn check_all_beams(inputs: Vec<input::BeamCheckInput>) -> Vec<result::BeamCheckResult> {
    inputs.into_iter().map(check_beam).collect()
}
