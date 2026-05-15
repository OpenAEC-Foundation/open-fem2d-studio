//! NEN-EN 1993-1-1 §6.2.10 — bending, axial, and shear combined.

use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use crate::{SteelGrade, ResistanceCalc};
use crate::classification::CrossSectionClass;
use crate::combined_mn::check_combined_mn;

pub fn check_combined_mnv(
    p: &SectionProperties, grade: &SteelGrade, class: CrossSectionClass,
    n_pl_rd_kn: f64, m_pl_y_rd_knm: f64, v_pl_z_rd_kn: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let v_ed = force_state.forces.vz_ed.abs();
    let v_threshold = v_pl_z_rd_kn / 2.0;

    if v_ed <= v_threshold {
        let mut result = check_combined_mn(p, grade, class, n_pl_rd_kn, m_pl_y_rd_knm, force_state);
        result.id = "6.2.10_combined_mnv".to_string();
        result.title = "Bending, axial, shear (no shear effect)".to_string();
        result.article = "art. 6.2.10".to_string();
        return result;
    }

    let rho = ((2.0 * v_ed / v_pl_z_rd_kn) - 1.0).powi(2);
    let m_pl_red = (1.0 - rho) * m_pl_y_rd_knm;
    let mut result = check_combined_mn(p, grade, class, n_pl_rd_kn, m_pl_red, force_state);
    result.id = "6.2.10_combined_mnv".to_string();
    result.title = "Bending, axial, shear combined".to_string();
    result.article = "art. 6.2.10".to_string();
    result.notes.insert(0, format!("rho = {:.4}, reduced M_pl,y,Rd = {:.3} kNm", rho, m_pl_red));
    result
}
