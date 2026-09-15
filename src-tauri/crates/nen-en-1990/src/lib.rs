//! NEN-EN 1990 met de Nederlandse nationale bijlage (NEN-EN 1990:2002/NB:2019):
//! partiële factoren, ψ-factoren en gevolgklassen.
//!
//! LET OP — WAT DEZE CRATE NIET DOET. De app leidt haar belastingcombinaties
//! NIET uit deze crate af. De standaardcombinaties worden in de frontend
//! opgesteld (`design-mockup/src/components/fem/solver/normcombinaties.ts`) en
//! komen als gefactoreerde krachten in de toetskernen aan. De rest van de
//! workspace gebruikt uit deze crate alleen `ConsequenceClass`, en die alleen
//! ter vermelding (zie `steel-check/src/orchestrator.rs`).
//!
//! De tabellen hieronder staan er als naslag. Tot september 2026 weken ze af
//! van de NB (categorie D ψ₀ = 0,6 in plaats van 0,4; categorie F "< 30 kN" met
//! ψ₀ = 0,6 in plaats van "≤ 25 kN" met 0,7; EQU zonder γ_G,sup = 1,1) — een
//! valkuil voor wie ze ooit als bron zou nemen. Ze zijn nu letterlijk gelijk
//! aan de NB, en `design-mockup/test-belastingcombinaties.mjs` vergelijkt ze met
//! de tabellen van de frontend.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Partiële factoren voor één uitdrukking (STR/GEO of EQU).
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct LoadFactors {
    pub name: &'static str,
    /// γ_G,sup — ongunstig werkende blijvende belasting.
    pub gamma_g_sup: f64,
    /// γ_G,inf — gunstig werkende blijvende belasting.
    pub gamma_g_inf: f64,
    /// γ_Q — belangrijkste én andere veranderlijke belastingen.
    pub gamma_q: f64,
}

/// NB tabel NB.4–A1.2(B), uitdrukking 6.10a, gevolgklasse 2:
/// 1,35 G_k,j,sup / 0,9 G_k,j,inf / 1,5 ψ₀,1 Q_k,1 / 1,5 ψ₀,i Q_k,i.
pub const ULS_6_10A: LoadFactors = LoadFactors {
    name: "6.10a", gamma_g_sup: 1.35, gamma_g_inf: 0.9, gamma_q: 1.5,
};
/// NB tabel NB.4–A1.2(B), uitdrukking 6.10b, gevolgklasse 2:
/// 1,2 G_k,j,sup / 0,9 G_k,j,inf / 1,5 Q_k,1 / 1,5 ψ₀,i Q_k,i.
pub const ULS_6_10B: LoadFactors = LoadFactors {
    name: "6.10b", gamma_g_sup: 1.2, gamma_g_inf: 0.9, gamma_q: 1.5,
};
/// NB tabel NB.3–A1.2(A), EQU (groep A):
/// 1,1 G_k,j,sup / 0,9 G_k,j,inf / 1,5 Q_k,1 / 1,5 ψ₀,i Q_k,i.
pub const EQU: LoadFactors = LoadFactors {
    name: "EQU", gamma_g_sup: 1.1, gamma_g_inf: 0.9, gamma_q: 1.5,
};

/// ψ-factoren voor één rij van tabel NB.2–A1.1.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct PsiFactors {
    pub category: &'static str,
    pub description: &'static str,
    pub psi0: f64,
    pub psi1: f64,
    pub psi2: f64,
}

// NEN-EN 1990:2002/NB:2019 tabel NB.2–A1.1 "ψ-factoren voor gebouwen".
pub const PSI_A: PsiFactors = PsiFactors { category: "A", description: "Woon- en verblijfsruimtes", psi0: 0.4, psi1: 0.5, psi2: 0.3 };
pub const PSI_B: PsiFactors = PsiFactors { category: "B", description: "Kantoorruimtes", psi0: 0.5, psi1: 0.5, psi2: 0.3 };
/// Voetnoot a: ψ₀ = 0,4 voor de overige delen van een bijeenkomstruimte.
pub const PSI_C: PsiFactors = PsiFactors { category: "C", description: "Bijeenkomstruimtes, overige delen", psi0: 0.4, psi1: 0.7, psi2: 0.6 };
/// Voetnoot a: ψ₀ = 0,6 voor delen die bij een calamiteit zwaar door een
/// mensenmenigte kunnen worden belast (vluchtroutes, trappen enz.).
pub const PSI_C_MENIGTE: PsiFactors = PsiFactors { category: "C-menigte", description: "Bijeenkomstruimtes, delen die bij een calamiteit zwaar door een mensenmenigte belast kunnen worden", psi0: 0.6, psi1: 0.7, psi2: 0.6 };
pub const PSI_D: PsiFactors = PsiFactors { category: "D", description: "Winkelruimtes", psi0: 0.4, psi1: 0.7, psi2: 0.6 };
pub const PSI_E: PsiFactors = PsiFactors { category: "E", description: "Opslagruimtes", psi0: 1.0, psi1: 0.9, psi2: 0.8 };
pub const PSI_F: PsiFactors = PsiFactors { category: "F", description: "Verkeersruimte, voertuiggewicht ≤ 25 kN", psi0: 0.7, psi1: 0.7, psi2: 0.6 };
pub const PSI_G: PsiFactors = PsiFactors { category: "G", description: "Verkeersruimte, 25 kN < voertuiggewicht ≤ 160 kN", psi0: 0.7, psi1: 0.5, psi2: 0.3 };
pub const PSI_H: PsiFactors = PsiFactors { category: "H", description: "Daken", psi0: 0.0, psi1: 0.0, psi2: 0.0 };
pub const PSI_INDUSTRIE_KORT: PsiFactors = PsiFactors { category: "industrie-kort", description: "Industrieel gebruik, belasting niet langdurig aanwezig", psi0: 0.5, psi1: 0.5, psi2: 0.3 };
pub const PSI_INDUSTRIE_LANG: PsiFactors = PsiFactors { category: "industrie-lang", description: "Industrieel gebruik, belasting langdurig aanwezig", psi0: 1.0, psi1: 0.9, psi2: 0.8 };
pub const PSI_WIND: PsiFactors = PsiFactors { category: "Wind", description: "Windbelasting", psi0: 0.0, psi1: 0.2, psi2: 0.0 };
pub const PSI_SNOW: PsiFactors = PsiFactors { category: "Sneeuw", description: "Sneeuwbelasting", psi0: 0.0, psi1: 0.2, psi2: 0.0 };

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum ConsequenceClass { CC1, CC2, CC3 }

impl ConsequenceClass {
    /// K_FI uit de opmerking bij NB tabel NB.4: 0,9 / 1,0 / 1,1. Ter
    /// vermelding — de factor zit al in `uls_factoren`.
    pub fn k_fi(self) -> f64 {
        match self { Self::CC1 => 0.9, Self::CC2 => 1.0, Self::CC3 => 1.1 }
    }
    pub fn name(self) -> &'static str {
        match self { Self::CC1 => "CC1", Self::CC2 => "CC2", Self::CC3 => "CC3" }
    }
    /// De partiële factoren (6.10a, 6.10b) voor deze klasse: NB tabel NB.4
    /// voor CC2 en NB tabel NB.5 voor CC1 en CC3 (STR/GEO, groep B).
    pub fn uls_factoren(self) -> (LoadFactors, LoadFactors) {
        match self {
            Self::CC1 => (
                LoadFactors { name: "6.10a", gamma_g_sup: 1.2, gamma_g_inf: 0.9, gamma_q: 1.35 },
                LoadFactors { name: "6.10b", gamma_g_sup: 1.1, gamma_g_inf: 0.9, gamma_q: 1.35 },
            ),
            Self::CC2 => (ULS_6_10A, ULS_6_10B),
            Self::CC3 => (
                LoadFactors { name: "6.10a", gamma_g_sup: 1.5, gamma_g_inf: 0.9, gamma_q: 1.65 },
                LoadFactors { name: "6.10b", gamma_g_sup: 1.3, gamma_g_inf: 0.9, gamma_q: 1.65 },
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// De getallen uit NB tabel NB.4 en NB.5, letterlijk uit de PDF.
    #[test]
    fn partiele_factoren_per_gevolgklasse_volgens_nb4_en_nb5() {
        let (a, b) = ConsequenceClass::CC2.uls_factoren();
        assert_eq!((a.gamma_g_sup, a.gamma_q, b.gamma_g_sup, b.gamma_q), (1.35, 1.5, 1.2, 1.5));
        let (a, b) = ConsequenceClass::CC1.uls_factoren();
        assert_eq!((a.gamma_g_sup, a.gamma_q, b.gamma_g_sup, b.gamma_q), (1.2, 1.35, 1.1, 1.35));
        let (a, b) = ConsequenceClass::CC3.uls_factoren();
        assert_eq!((a.gamma_g_sup, a.gamma_q, b.gamma_g_sup, b.gamma_q), (1.5, 1.65, 1.3, 1.65));
        for cc in [ConsequenceClass::CC1, ConsequenceClass::CC2, ConsequenceClass::CC3] {
            let (a, b) = cc.uls_factoren();
            assert_eq!((a.gamma_g_inf, b.gamma_g_inf), (0.9, 0.9), "{}", cc.name());
        }
    }

    /// NB tabel NB.3: EQU met 1,1 ongunstig en 0,9 gunstig.
    #[test]
    fn equ_volgens_nb3() {
        assert_eq!((EQU.gamma_g_sup, EQU.gamma_g_inf, EQU.gamma_q), (1.1, 0.9, 1.5));
    }

    /// De rijen van tabel NB.2 die tot september 2026 afweken.
    #[test]
    fn psi_volgens_nb2() {
        assert_eq!((PSI_D.psi0, PSI_D.psi1, PSI_D.psi2), (0.4, 0.7, 0.6));
        assert_eq!((PSI_F.psi0, PSI_F.psi1, PSI_F.psi2), (0.7, 0.7, 0.6));
        assert_eq!((PSI_C.psi0, PSI_C_MENIGTE.psi0), (0.4, 0.6));
        assert_eq!((PSI_WIND.psi0, PSI_WIND.psi1, PSI_WIND.psi2), (0.0, 0.2, 0.0));
        assert_eq!((PSI_SNOW.psi0, PSI_SNOW.psi1, PSI_SNOW.psi2), (0.0, 0.2, 0.0));
    }
}
