//! NEN-EN 1993-1-1 §5.5 + Tabel 5.2 — cross-section classification.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use section_properties::SectionProperties;
use mechanics::InternalForces;
use crate::SteelGrade;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum CrossSectionClass { Class1, Class2, Class3, Class4 }

pub fn epsilon(grade: &SteelGrade) -> f64 {
    (235.0 / grade.fy_mpa).sqrt()
}

pub fn classify_section(
    p: &SectionProperties,
    grade: &SteelGrade,
    forces: &InternalForces,
) -> CrossSectionClass {
    let eps = epsilon(grade);

    let c_web = p.h_mm - 2.0 * p.tf_mm - 2.0 * p.r_mm;
    let web_slenderness = c_web / p.tw_mm.max(1e-9);

    let c_flange = (p.b_mm / 2.0) - (p.tw_mm / 2.0) - p.r_mm;
    let flange_slenderness = c_flange / p.tf_mm.max(1e-9);

    let n_ratio = forces.n_ed.abs() * 1000.0 / (p.area_mm2 * grade.fy_mpa);
    let is_pure_bending = n_ratio < 0.05;

    let (web_c1, web_c2, web_c3) = if is_pure_bending {
        (72.0 * eps, 83.0 * eps, 124.0 * eps)
    } else {
        (33.0 * eps, 38.0 * eps, 42.0 * eps)
    };
    let (flange_c1, flange_c2, flange_c3) = (9.0 * eps, 10.0 * eps, 14.0 * eps);

    let web_class = match web_slenderness {
        s if s <= web_c1 => CrossSectionClass::Class1,
        s if s <= web_c2 => CrossSectionClass::Class2,
        s if s <= web_c3 => CrossSectionClass::Class3,
        _ => CrossSectionClass::Class4,
    };
    let flange_class = match flange_slenderness {
        s if s <= flange_c1 => CrossSectionClass::Class1,
        s if s <= flange_c2 => CrossSectionClass::Class2,
        s if s <= flange_c3 => CrossSectionClass::Class3,
        _ => CrossSectionClass::Class4,
    };

    web_class.max(flange_class)
}

impl PartialOrd for CrossSectionClass {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for CrossSectionClass {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (*self as u8).cmp(&(*other as u8))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use section_properties::i_section::i_section_props;
    use crate::S235;

    #[test]
    fn heb160_s235_pure_bending_is_class1() {
        let p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        let f = InternalForces { my_ed: 80.0, ..Default::default() };
        assert_eq!(classify_section(&p, &S235, &f), CrossSectionClass::Class1);
    }
}
