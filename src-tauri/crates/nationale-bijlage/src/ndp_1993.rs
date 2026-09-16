//! NDP's bij **NEN-EN 1993-1-1** (staal, algemene regels) en **NEN-EN 1993-1-8**
//! (verbindingen).
//!
//! De Nederlandse rijen komen uit NEN-EN 1993-1-1+A1:2014+NB:2016 en
//! NEN-EN 1993-1-8:2006+C11:2016 met NB:2011.
//!
//! Let op het veld [`Ndp1993::kipmethode`]. Niet elke NDP is een getal: bij
//! 6.3.2.3 laat de Eurocode de bepaling van M_cr aan het land over, en de
//! Nederlandse bijlage vult die met de gedigitaliseerde figuren van bijlage
//! NB.NB. Een andere bijlage kan dáár een andere WERKWIJZE voorschrijven, niet
//! alleen een ander getal; de naad moet dat kunnen dragen, anders zou een
//! tweede rij stilzwijgend de Nederlandse figuren gebruiken.

use crate::NationaleBijlage;

/// Hoe het kritieke kipmoment M_cr wordt bepaald.
///
/// NEN-EN 1993-1-1 geeft zelf GEEN uitdrukking voor M_cr; het is aan de
/// nationale bijlage. Deze enum is daarom geen afgeleide van een getal maar een
/// eigen NDP.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kipmethode {
    /// De gedigitaliseerde figuren van bijlage NB.NB bij de Nederlandse
    /// nationale bijlage (tabel NB.NB.1, figuren NB.NB.5/NB.NB.6).
    NbNbFiguren,
}

/// De nationaal bepaalde parameters bij NEN-EN 1993-1-1.
#[derive(Clone, Copy, Debug)]
pub struct Ndp1993 {
    /// γ_M0 — NB bij 6.1(1), OPMERKING 2B: "γ M0 … gelijk aan 1,00".
    pub gamma_m0: f64,
    /// γ_M1 — NB bij 6.1(1): "γ M1 … gelijk aan 1,00".
    pub gamma_m1: f64,
    /// γ_M2 — NB bij 6.1(1): "γ M2 … gelijk aan 1,25".
    pub gamma_m2: f64,
    /// λ̄_LT,0 in (6.57) — NB bij 6.3.2.3(1): "de waarde van λ_LT,0 moet gelijk
    /// zijn genomen aan 0,4". Voorschrift, niet aanbeveling.
    pub lambda_lt_0: f64,
    /// β in (6.57) — NB bij 6.3.2.3(1): "de waarde van β moet gelijk zijn
    /// genomen aan 0,75".
    pub beta_lt: f64,
    /// Hoe M_cr wordt bepaald — zie [`Kipmethode`].
    pub kipmethode: Kipmethode,
}

impl Ndp1993 {
    /// De rij van deze bijlage. Uitputtende `match`.
    pub const fn voor(bijlage: NationaleBijlage) -> Self {
        match bijlage {
            NationaleBijlage::NL => NDP_1993_NL,
        }
    }
}

/// De Nederlandse rij — NEN-EN 1993-1-1+A1:2014+NB:2016.
pub const NDP_1993_NL: Ndp1993 = Ndp1993 {
    gamma_m0: 1.0,
    gamma_m1: 1.0,
    gamma_m2: 1.25,
    lambda_lt_0: 0.4,
    beta_lt: 0.75,
    kipmethode: Kipmethode::NbNbFiguren,
};

/// De nationaal bepaalde parameters bij NEN-EN 1993-1-8.
///
/// Apart van [`Ndp1993`] omdat het een ander normdeel met een eigen nationale
/// bijlage is (NB:2011 tegen NB:2016). Dat de twee γ_M2's vandaag hetzelfde
/// getal dragen, is een uitkomst en geen afspraak.
#[derive(Clone, Copy, Debug)]
pub struct Ndp1993Las {
    /// γ_M2 voor de weerstand van lassen — tabel 2.1 met de waarde uit de
    /// Nederlandse nationale bijlage.
    pub gamma_m2: f64,
}

impl Ndp1993Las {
    /// De rij van deze bijlage. Uitputtende `match`.
    pub const fn voor(bijlage: NationaleBijlage) -> Self {
        match bijlage {
            NationaleBijlage::NL => NDP_1993_LAS_NL,
        }
    }
}

/// De Nederlandse rij — NEN-EN 1993-1-8:2006+C11:2016 met NB:2011.
pub const NDP_1993_LAS_NL: Ndp1993Las = Ndp1993Las { gamma_m2: 1.25 };

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nl_rij_volgens_de_nationale_bijlage() {
        let n = Ndp1993::voor(NationaleBijlage::NL);
        assert_eq!((n.gamma_m0, n.gamma_m1, n.gamma_m2), (1.0, 1.0, 1.25));
        assert_eq!((n.lambda_lt_0, n.beta_lt), (0.4, 0.75));
        assert_eq!(n.kipmethode, Kipmethode::NbNbFiguren);
        assert_eq!(Ndp1993Las::voor(NationaleBijlage::NL).gamma_m2, 1.25);
    }
}
