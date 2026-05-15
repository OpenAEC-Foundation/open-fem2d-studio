//! NEN-EN 1993-1-1 cross-section resistance checks (article 6.2).
//! All check functions return ResistanceCalc with derivation steps.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;

pub mod classification;
pub mod compression;
pub mod bending;
pub mod shear;
pub mod combined_mv;
pub mod combined_mn;
pub mod combined_mnv;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct SteelGrade {
    pub name: &'static str,
    pub fy_mpa: f64,
    pub fu_mpa: f64,
    pub gamma_m0: f64,
    pub gamma_m1: f64,
    pub gamma_m2: f64,
}

pub const S235: SteelGrade = SteelGrade { name: "S235", fy_mpa: 235.0, fu_mpa: 360.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S275: SteelGrade = SteelGrade { name: "S275", fy_mpa: 275.0, fu_mpa: 430.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S355: SteelGrade = SteelGrade { name: "S355", fy_mpa: 355.0, fu_mpa: 510.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S420: SteelGrade = SteelGrade { name: "S420", fy_mpa: 420.0, fu_mpa: 520.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S460: SteelGrade = SteelGrade { name: "S460", fy_mpa: 460.0, fu_mpa: 540.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };

pub fn grade_by_name(name: &str) -> Option<SteelGrade> {
    match name {
        "S235" => Some(S235), "S275" => Some(S275), "S355" => Some(S355),
        "S420" => Some(S420), "S460" => Some(S460), _ => None,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub enum CheckStatus { Ok, NotOk, NotApplicable }

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct NamedValue {
    pub symbol: String,
    pub value: f64,
    pub unit: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct UnityCheck {
    pub ed: f64,
    pub rd: f64,
    pub uc: f64,
    pub formula_latex: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ResistanceCalc {
    pub id: String,
    pub title: String,
    pub article: String,
    pub force_state: ForceStateSnapshot,
    pub formula_latex: String,
    pub variables: Vec<NamedValue>,
    pub value: f64,
    pub unit: String,
    pub uc: Option<UnityCheck>,
    pub status: CheckStatus,
    pub notes: Vec<String>,
}
