//! Pure section-property calculations from geometric primitives.
//! Used by steel-profiles to validate catalog values and by EN-1993 checks.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub mod i_section;
pub mod rhs;
pub mod channel;

/// All cross-sectional properties needed for EN 1993 checks.
/// Units: mm² for areas, mm⁴ for I, mm³ for W, mm for radii.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct SectionProperties {
    pub area_mm2: f64,
    pub iy_mm4: f64,
    pub iz_mm4: f64,
    pub wel_y_mm3: f64,
    pub wel_z_mm3: f64,
    pub wpl_y_mm3: f64,
    pub wpl_z_mm3: f64,
    pub av_y_mm2: f64,
    pub av_z_mm2: f64,
    pub it_mm4: f64,
    pub iw_mm6: f64,
    pub iy_radius_mm: f64,
    pub iz_radius_mm: f64,
    pub h_mm: f64,
    pub b_mm: f64,
    pub tw_mm: f64,
    pub tf_mm: f64,
    pub r_mm: f64,
}
