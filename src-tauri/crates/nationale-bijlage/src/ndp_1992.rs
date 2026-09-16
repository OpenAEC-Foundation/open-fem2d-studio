//! NDP's bij **NEN-EN 1992-1-1** — betonconstructies.
//!
//! De Nederlandse rij komt uit NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020.
//! Per veld staat het artikel erbij; waar de bijlage de aanbevolen waarde
//! ongewijzigd overneemt staat dat er ook, want dat is zelf een nationale
//! keuze.

use crate::NationaleBijlage;

/// De nationaal bepaalde parameters bij NEN-EN 1992-1-1.
#[derive(Clone, Copy, Debug)]
pub struct Ndp1992 {
    /// γ_C bij een blijvende of tijdelijke ontwerpsituatie — tabel 2.1N
    /// (§2.4.2.4(1)). De bijlage herhaalt de tabel met dezelfde waarden.
    pub gamma_c_blijvend: f64,
    /// γ_S bij een blijvende of tijdelijke ontwerpsituatie — tabel 2.1N.
    pub gamma_s_blijvend: f64,
    /// γ_C bij een buitengewone ontwerpsituatie — tabel 2.1N.
    pub gamma_c_buitengewoon: f64,
    /// γ_S bij een buitengewone ontwerpsituatie — tabel 2.1N.
    pub gamma_s_buitengewoon: f64,
    /// α_cc in (3.15) — NB bij 3.1.6(1)P: "De waarde van α_cc moet gelijk aan
    /// 1,0 zijn genomen."
    pub alpha_cc: f64,
    /// γ_cE in (5.20) — NB bij 5.8.6(3): "De waarde van γ CE moet gelijk aan
    /// 1,2 zijn genomen." (De EN beveelt dezelfde waarde aan.)
    pub gamma_ce: f64,
    /// De factor in ε_ud = f·ε_uk — NB bij 3.2.7(2): "De waarde van ε_ud moet
    /// gelijk aan 0,9·ε_uk zijn genomen."
    pub eps_ud_factor: f64,
    /// De constructieklasse bij een ontwerplevensduur van 50 jaar, als nummer
    /// (S4 → 4) — NB bij 4.4.1.2(5).
    ///
    /// Als getal en niet als `StructuralClass`, zodat deze crate niets van de
    /// betoncrate hoeft te weten; `nen_en_1992_1_1::dekking` zet het nummer om
    /// en faalt bij het compileren als er een klasse bij zou komen die niet
    /// bestaat.
    pub constructieklasse_50_jaar: u8,
    /// Tabel 4.4N — c_min,dur voor betonstaal, in mm, ZOALS DE NATIONALE
    /// BIJLAGE HEM VOORSCHRIJFT (de EN-tabel is doorgehaald: "welke tabel dan
    /// als volgt moet zijn gelezen (normatief)").
    ///
    /// Rijen S1…S6; kolommen X0, XC1, XC2/XC3, XC4, XD1/XS1, XD2/XS2, XD3/XS3.
    /// De laatste kolom verschilt werkelijk van de EN-versie (25…50 in plaats
    /// van 30…55).
    pub c_min_dur_betonstaal: [[f64; 7]; 6],
    /// Δc_dur,γ — 4.4.1.2(6). NB: "moet gelijk aan 0 mm zijn genomen".
    pub delta_c_dur_gamma_mm: f64,
    /// Δc_dur,st — 4.4.1.2(7). NB: "moet gelijk aan 0 mm zijn genomen".
    pub delta_c_dur_st_mm: f64,
    /// Δc_dur,add — 4.4.1.2(8). NB: "moet gelijk aan 0 mm zijn genomen".
    pub delta_c_dur_add_mm: f64,
    /// Δc_dev — 4.4.1.3(1)P. De EN beveelt 10 mm aan; de NB schrijft 5 mm voor.
    pub delta_c_dev_mm: f64,
    /// De coëfficiënt 20 in λ_lim = 20·A·B·C/√n, (5.13N) bij 5.8.3.1(1).
    pub lambda_lim_coefficient: f64,
    /// Of λ_lim een EIS is in plaats van een aanbeveling. De Nederlandse
    /// bijlage stelt 5.8.3.1 als eis; dat is geen getal maar wel een NDP, en
    /// het bepaalt of de kolomtoets de tweede orde mag laten vervallen.
    pub lambda_lim_is_eis: bool,
    /// α₆ bij een DRUKverankering — §8.7.3(1) met tabel NB 8.3. De EN-tabel 8.3
    /// is doorgehaald; de NB-versie geeft voor druk α₆ = 1 bij elk
    /// overlappingspercentage.
    pub alpha_6_druk: f64,
}

impl Ndp1992 {
    /// De rij van deze bijlage. Uitputtende `match`.
    pub const fn voor(bijlage: NationaleBijlage) -> Self {
        match bijlage {
            NationaleBijlage::NL => NDP_1992_NL,
        }
    }
}

/// De Nederlandse rij — NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020.
pub const NDP_1992_NL: Ndp1992 = Ndp1992 {
    gamma_c_blijvend: 1.5,
    gamma_s_blijvend: 1.15,
    gamma_c_buitengewoon: 1.2,
    gamma_s_buitengewoon: 1.0,
    alpha_cc: 1.0,
    gamma_ce: 1.2,
    eps_ud_factor: 0.9,
    constructieklasse_50_jaar: 4,
    c_min_dur_betonstaal: [
        [10.0, 10.0, 10.0, 15.0, 20.0, 25.0, 25.0], // S1
        [10.0, 10.0, 15.0, 20.0, 25.0, 30.0, 30.0], // S2
        [10.0, 10.0, 20.0, 25.0, 30.0, 35.0, 35.0], // S3
        [10.0, 15.0, 25.0, 30.0, 35.0, 40.0, 40.0], // S4
        [15.0, 20.0, 30.0, 35.0, 40.0, 45.0, 45.0], // S5
        [20.0, 25.0, 35.0, 40.0, 45.0, 50.0, 50.0], // S6
    ],
    delta_c_dur_gamma_mm: 0.0,
    delta_c_dur_st_mm: 0.0,
    delta_c_dur_add_mm: 0.0,
    delta_c_dev_mm: 5.0,
    lambda_lim_coefficient: 20.0,
    lambda_lim_is_eis: true,
    alpha_6_druk: 1.0,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nl_rij_volgens_de_nationale_bijlage() {
        let n = Ndp1992::voor(NationaleBijlage::NL);
        // Tabel 2.1N.
        assert_eq!((n.gamma_c_blijvend, n.gamma_s_blijvend), (1.5, 1.15));
        assert_eq!((n.gamma_c_buitengewoon, n.gamma_s_buitengewoon), (1.2, 1.0));
        // 3.1.6(1)P, 5.8.6(3), 3.2.7(2).
        assert_eq!((n.alpha_cc, n.gamma_ce, n.eps_ud_factor), (1.0, 1.2, 0.9));
        // 4.4.1.2(5)–(8) en 4.4.1.3(1)P.
        assert_eq!(n.constructieklasse_50_jaar, 4);
        assert_eq!(n.delta_c_dev_mm, 5.0);
        assert_eq!(
            (n.delta_c_dur_gamma_mm, n.delta_c_dur_st_mm, n.delta_c_dur_add_mm),
            (0.0, 0.0, 0.0)
        );
        // De kolom die werkelijk van de EN-versie afwijkt: XD3/XS3 (index 6)
        // is gelijk aan XD2/XS2 (index 5) en NIET 5 mm hoger.
        for rij in n.c_min_dur_betonstaal {
            assert_eq!(rij[6], rij[5]);
        }
        assert_eq!(n.c_min_dur_betonstaal[3], [10.0, 15.0, 25.0, 30.0, 35.0, 40.0, 40.0]);
        // 5.8.3.1 en 8.7.3.
        assert_eq!(n.lambda_lim_coefficient, 20.0);
        assert!(n.lambda_lim_is_eis);
        assert_eq!(n.alpha_6_druk, 1.0);
    }
}
