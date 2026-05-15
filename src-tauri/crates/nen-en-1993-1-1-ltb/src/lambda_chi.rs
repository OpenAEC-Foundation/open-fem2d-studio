//! Implemented in Task 7.3.
use crate::LateralBracing;
pub fn unbraced_length_mm(length_m: f64, _bracing: &LateralBracing) -> f64 {
    length_m * 1000.0
}
pub fn lambda_lt(_w: f64, _fy: f64, _m_cr: f64) -> f64 { 0.0 }
pub fn chi_lt(_l: f64, _a: f64) -> f64 { 1.0 }
