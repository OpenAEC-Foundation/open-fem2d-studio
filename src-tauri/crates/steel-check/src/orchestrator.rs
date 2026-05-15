//! Implemented in Task 8.3.
use crate::input::BeamCheckInput;
use crate::result::BeamCheckResult;
use nen_en_1993_1_1_section::CheckStatus;
use nen_en_1993_1_1_section::classification::CrossSectionClass;

pub fn check_beam(input: BeamCheckInput) -> BeamCheckResult {
    BeamCheckResult {
        beam_id: input.beam_id,
        profile_name: input.profile_name.clone(),
        steel_grade: input.steel_grade.clone(),
        classification: CrossSectionClass::Class1,
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::Ok,
        governing_check_id: String::new(),
    }
}
