//! NEN-EN 1990 NB — partial factors, combination factors, consequence classes.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct LoadFactors {
    pub name: &'static str,
    pub gamma_g: f64,
    pub gamma_q: f64,
    pub gamma_q_acc: f64,
    pub psi0: f64,
}

pub const ULS_6_10A: LoadFactors = LoadFactors {
    name: "6.10a", gamma_g: 1.35, gamma_q: 1.5, gamma_q_acc: 1.5, psi0: 0.0,
};
pub const ULS_6_10B: LoadFactors = LoadFactors {
    name: "6.10b", gamma_g: 1.2, gamma_q: 1.5, gamma_q_acc: 1.5, psi0: 0.0,
};
pub const EQU: LoadFactors = LoadFactors {
    name: "EQU", gamma_g: 0.9, gamma_q: 1.5, gamma_q_acc: 1.5, psi0: 0.0,
};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct PsiFactors {
    pub category: &'static str,
    pub description: &'static str,
    pub psi0: f64,
    pub psi1: f64,
    pub psi2: f64,
}

pub const PSI_A: PsiFactors = PsiFactors { category: "A", description: "Woonruimten", psi0: 0.4, psi1: 0.5, psi2: 0.3 };
pub const PSI_B: PsiFactors = PsiFactors { category: "B", description: "Kantoorruimten", psi0: 0.5, psi1: 0.5, psi2: 0.3 };
pub const PSI_C: PsiFactors = PsiFactors { category: "C", description: "Bijeenkomstruimten", psi0: 0.6, psi1: 0.7, psi2: 0.6 };
pub const PSI_D: PsiFactors = PsiFactors { category: "D", description: "Winkelruimten", psi0: 0.6, psi1: 0.7, psi2: 0.6 };
pub const PSI_E: PsiFactors = PsiFactors { category: "E", description: "Opslagruimten", psi0: 1.0, psi1: 0.9, psi2: 0.8 };
pub const PSI_F: PsiFactors = PsiFactors { category: "F", description: "Verkeer < 30 kN", psi0: 0.6, psi1: 0.7, psi2: 0.6 };
pub const PSI_G: PsiFactors = PsiFactors { category: "G", description: "Verkeer 30-160 kN", psi0: 0.7, psi1: 0.5, psi2: 0.3 };
pub const PSI_H: PsiFactors = PsiFactors { category: "H", description: "Daken", psi0: 0.0, psi1: 0.0, psi2: 0.0 };
pub const PSI_WIND: PsiFactors = PsiFactors { category: "Wind", description: "Windbelasting", psi0: 0.0, psi1: 0.2, psi2: 0.0 };
pub const PSI_SNOW: PsiFactors = PsiFactors { category: "Sneeuw", description: "Sneeuwbelasting NL", psi0: 0.0, psi1: 0.2, psi2: 0.0 };

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub enum ConsequenceClass { CC1, CC2, CC3 }

impl ConsequenceClass {
    pub fn k_fi(self) -> f64 {
        match self { Self::CC1 => 0.9, Self::CC2 => 1.0, Self::CC3 => 1.1 }
    }
    pub fn name(self) -> &'static str {
        match self { Self::CC1 => "CC1", Self::CC2 => "CC2", Self::CC3 => "CC3" }
    }
}
