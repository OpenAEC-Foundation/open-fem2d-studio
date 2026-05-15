//! Cross-section classification stub (full implementation in Task 5.2).
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use section_properties::SectionProperties;
use mechanics::InternalForces;
use crate::SteelGrade;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub enum CrossSectionClass { Class1, Class2, Class3, Class4 }

pub fn classify_section(_p: &SectionProperties, _g: &SteelGrade, _f: &InternalForces) -> CrossSectionClass {
    CrossSectionClass::Class1
}
