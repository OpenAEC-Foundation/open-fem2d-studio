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
//! WAAR DE GETALLEN VANDAAN KOMEN — sinds de normnaad (september 2026) niet
//! meer uit dit bestand. De tabellen NB.2, NB.3, NB.4 en NB.5 zijn nationaal
//! bepaalde parameters en staan daarom in de crate `nationale-bijlage`, waar
//! alle NDP's per bijlage bij elkaar staan. Deze crate vertaalt ze naar de
//! vorm waarin de rest van de workspace ze gebruikt, en houdt haar publieke
//! namen ongewijzigd. `design-mockup/test-belastingcombinaties.mjs` leest de
//! rij van de naad als tekst en legt hem naast de tabellen van de frontend.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use nationale_bijlage::{NationaleBijlage, Ndp1990};

// De twee tabeltypen horen bij de NDP-rij en worden hier alleen opnieuw
// aangeboden, zodat aanroepers van deze crate niets hoeven te veranderen.
pub use nationale_bijlage::{LoadFactors, PsiFactors};

/// De Nederlandse rij, één keer opgehaald. Alles hieronder leest hieruit; er
/// staat geen enkel NDP-getal meer los in dit bestand.
const NDP: Ndp1990 = Ndp1990::voor(NationaleBijlage::NL);

/// NB tabel NB.4–A1.2(B), uitdrukking 6.10a, gevolgklasse 2:
/// 1,35 G_k,j,sup / 0,9 G_k,j,inf / 1,5 ψ₀,1 Q_k,1 / 1,5 ψ₀,i Q_k,i.
pub const ULS_6_10A: LoadFactors = NDP.uls_cc2.0;
/// NB tabel NB.4–A1.2(B), uitdrukking 6.10b, gevolgklasse 2:
/// 1,2 G_k,j,sup / 0,9 G_k,j,inf / 1,5 Q_k,1 / 1,5 ψ₀,i Q_k,i.
pub const ULS_6_10B: LoadFactors = NDP.uls_cc2.1;
/// NB tabel NB.3–A1.2(A), EQU (groep A):
/// 1,1 G_k,j,sup / 0,9 G_k,j,inf / 1,5 Q_k,1 / 1,5 ψ₀,i Q_k,i.
pub const EQU: LoadFactors = NDP.equ;

// NEN-EN 1990:2002/NB:2019 tabel NB.2–A1.1 "ψ-factoren voor gebouwen", in de
// volgorde waarin de tabel ze geeft. De index is de rij van `Ndp1990::psi`.
pub const PSI_A: PsiFactors = NDP.psi[0];
pub const PSI_B: PsiFactors = NDP.psi[1];
/// Voetnoot a: ψ₀ = 0,4 voor de overige delen van een bijeenkomstruimte.
pub const PSI_C: PsiFactors = NDP.psi[2];
/// Voetnoot a: ψ₀ = 0,6 voor delen die bij een calamiteit zwaar door een
/// mensenmenigte kunnen worden belast (vluchtroutes, trappen enz.).
pub const PSI_C_MENIGTE: PsiFactors = NDP.psi[3];
pub const PSI_D: PsiFactors = NDP.psi[4];
pub const PSI_E: PsiFactors = NDP.psi[5];
pub const PSI_F: PsiFactors = NDP.psi[6];
pub const PSI_G: PsiFactors = NDP.psi[7];
pub const PSI_H: PsiFactors = NDP.psi[8];
pub const PSI_INDUSTRIE_KORT: PsiFactors = NDP.psi[9];
pub const PSI_INDUSTRIE_LANG: PsiFactors = NDP.psi[10];
pub const PSI_WIND: PsiFactors = NDP.psi[11];
pub const PSI_SNOW: PsiFactors = NDP.psi[12];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum ConsequenceClass { CC1, CC2, CC3 }

impl ConsequenceClass {
    /// K_FI uit de opmerking bij NB tabel NB.4: 0,9 / 1,0 / 1,1. Ter
    /// vermelding — de factor zit al in `uls_factoren`.
    pub fn k_fi(self) -> f64 {
        match self { Self::CC1 => NDP.k_fi.0, Self::CC2 => NDP.k_fi.1, Self::CC3 => NDP.k_fi.2 }
    }
    pub fn name(self) -> &'static str {
        match self { Self::CC1 => "CC1", Self::CC2 => "CC2", Self::CC3 => "CC3" }
    }
    /// De partiële factoren (6.10a, 6.10b) voor deze klasse: NB tabel NB.4
    /// voor CC2 en NB tabel NB.5 voor CC1 en CC3 (STR/GEO, groep B).
    pub fn uls_factoren(self) -> (LoadFactors, LoadFactors) {
        match self {
            Self::CC1 => NDP.uls_cc1,
            Self::CC2 => NDP.uls_cc2,
            Self::CC3 => NDP.uls_cc3,
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

    /// Elke ψ-rij en elke γ-rij komt UIT DE NAAD en niet uit een losse
    /// constante in dit bestand. De vergelijking gaat langs de bron zelf, zodat
    /// een met de hand teruggezet getal hier rood wordt.
    #[test]
    fn elke_waarde_komt_uit_de_normnaad() {
        let bron = Ndp1990::voor(NationaleBijlage::NL);
        let rijen = [PSI_A, PSI_B, PSI_C, PSI_C_MENIGTE, PSI_D, PSI_E, PSI_F, PSI_G, PSI_H,
                     PSI_INDUSTRIE_KORT, PSI_INDUSTRIE_LANG, PSI_WIND, PSI_SNOW];
        assert_eq!(rijen.len(), bron.psi.len());
        for (hier, daar) in rijen.iter().zip(bron.psi.iter()) {
            assert_eq!(hier.category, daar.category);
            assert_eq!((hier.psi0, hier.psi1, hier.psi2), (daar.psi0, daar.psi1, daar.psi2));
        }
        assert_eq!(ULS_6_10A.gamma_g_sup, bron.uls_cc2.0.gamma_g_sup);
        assert_eq!(ULS_6_10B.gamma_g_sup, bron.uls_cc2.1.gamma_g_sup);
        assert_eq!(EQU.gamma_g_sup, bron.equ.gamma_g_sup);
        assert_eq!(
            (ConsequenceClass::CC1.k_fi(), ConsequenceClass::CC2.k_fi(), ConsequenceClass::CC3.k_fi()),
            bron.k_fi
        );
    }
}
