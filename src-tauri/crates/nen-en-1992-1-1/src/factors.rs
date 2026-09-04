//! Partiële factoren en rekenwaarden.
//!
//! * **Tabel 2.1N** (§2.4.2.4(1)) — partiële factoren voor materialen in de
//!   uiterste grenstoestand: blijvend en tijdelijk γ_C = 1,5 en γ_S = 1,15;
//!   buitengewoon γ_C = 1,2 en γ_S = 1,0. De Nederlandse bijlage houdt deze
//!   waarden aan (de tabel staat als NB-tekst herhaald in de norm).
//! * **3.1.6(1)P**, vergelijking (3.15): f_cd = α_cc·f_ck/γ_C. De Nederlandse
//!   bijlage bij 3.1.6(1)P: "De waarde van α_cc moet gelijk aan 1,0 zijn
//!   genomen."
//! * **3.1.7(3)**, vergelijkingen (3.19)–(3.22): de factoren λ (hoogte van de
//!   drukzone) en η (effectieve sterkte) van de rechthoekige
//!   spanningsverdeling.
//! * **3.2.7(2)** — rekenwaarde f_yd = f_yk/γ_S (figuur 3.8); de Nederlandse
//!   bijlage: "De waarde van ε_ud moet gelijk aan 0,9·ε_uk zijn genomen."
//! * **3.2.7(4)** — E_s = 200 GPa.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Ontwerpsituatie voor tabel 2.1N.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum DesignSituation {
    /// Blijvend en tijdelijk: γ_C = 1,5; γ_S = 1,15.
    #[default]
    PersistentTransient,
    /// Buitengewoon: γ_C = 1,2; γ_S = 1,0.
    Accidental,
}

/// Partiële factor voor beton γ_C (tabel 2.1N).
pub fn gamma_c(situation: DesignSituation) -> f64 {
    match situation {
        DesignSituation::PersistentTransient => 1.5,
        DesignSituation::Accidental => 1.2,
    }
}

/// Partiële factor voor betonstaal γ_S (tabel 2.1N).
pub fn gamma_s(situation: DesignSituation) -> f64 {
    match situation {
        DesignSituation::PersistentTransient => 1.15,
        DesignSituation::Accidental => 1.0,
    }
}

/// α_cc — Nederlandse nationale bijlage bij 3.1.6(1)P: 1,0.
pub const ALPHA_CC: f64 = 1.0;

/// Rekenwaarde van de elasticiteitsmodulus van betonstaal, 3.2.7(4): 200 GPa.
pub const E_S: f64 = 200_000.0;

/// Rekenwaarde van de betondruksterkte, vergelijking (3.15).
pub fn f_cd(f_ck: f64, alpha_cc: f64, gamma_c: f64) -> f64 {
    alpha_cc * f_ck / gamma_c
}

/// Rekenwaarde van de vloeigrens van betonstaal, 3.2.7(2) / figuur 3.8.
pub fn f_yd(f_yk: f64, gamma_s: f64) -> f64 {
    f_yk / gamma_s
}

/// Rekenwaarde van de grensrek van betonstaal — NB bij 3.2.7(2): ε_ud = 0,9·ε_uk.
pub fn eps_ud(eps_uk: f64) -> f64 {
    0.9 * eps_uk
}

/// λ — hoogte van de drukzone in de rechthoekige spanningsverdeling,
/// vergelijkingen (3.19) en (3.20):
/// λ = 0,8 voor f_ck ≤ 50 MPa; λ = 0,8 − (f_ck − 50)/400 voor 50 < f_ck ≤ 90 MPa.
pub fn lambda(f_ck: f64) -> f64 {
    if f_ck <= 50.0 {
        0.8
    } else {
        0.8 - (f_ck - 50.0) / 400.0
    }
}

/// η — effectieve sterkte in de rechthoekige spanningsverdeling,
/// vergelijkingen (3.21) en (3.22):
/// η = 1,0 voor f_ck ≤ 50 MPa; η = 1,0 − (f_ck − 50)/200 voor 50 < f_ck ≤ 90 MPa.
pub fn eta(f_ck: f64) -> f64 {
    if f_ck <= 50.0 {
        1.0
    } else {
        1.0 - (f_ck - 50.0) / 200.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn tabel_2_1n() {
        assert_relative_eq!(gamma_c(DesignSituation::PersistentTransient), 1.5);
        assert_relative_eq!(gamma_s(DesignSituation::PersistentTransient), 1.15);
        assert_relative_eq!(gamma_c(DesignSituation::Accidental), 1.2);
        assert_relative_eq!(gamma_s(DesignSituation::Accidental), 1.0);
    }

    #[test]
    fn rekenwaarden_c30_b500() {
        // f_cd = 1,0 · 30 / 1,5 = 20 N/mm²; f_yd = 500 / 1,15 = 434,78 N/mm².
        assert_relative_eq!(f_cd(30.0, ALPHA_CC, 1.5), 20.0);
        assert_relative_eq!(f_yd(500.0, 1.15), 434.7826, max_relative = 1e-5);
        // ε_ud = 0,9 · 5,0 % = 4,5 % (B500B).
        assert_relative_eq!(eps_ud(0.05), 0.045);
    }

    #[test]
    fn lambda_en_eta_zijn_continu_bij_50_en_kloppen_bij_90() {
        assert_relative_eq!(lambda(30.0), 0.8);
        assert_relative_eq!(eta(30.0), 1.0);
        assert_relative_eq!(lambda(50.0), 0.8);
        assert_relative_eq!(eta(50.0), 1.0);
        assert_relative_eq!(lambda(90.0), 0.7);
        assert_relative_eq!(eta(90.0), 0.8);
    }
}
