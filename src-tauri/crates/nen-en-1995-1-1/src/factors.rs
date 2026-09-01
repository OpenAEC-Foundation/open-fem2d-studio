//! Modificatie- en veiligheidsfactoren — NEN-EN 1995-1-1 §2.3/§2.4/§3 + NB.
//!
//! Verificatie: k_mod, gamma_M, k_def en k_h zijn getoetst aan de
//! referentie-uitwerking (C24, klimaatklasse 1: gamma_M = 1,30, k_def = 0,60,
//! k_mod = 0,60/0,80/0,90 met 0,50/0,65/0,80 voor klimaatklasse 3, en
//! f_m,z,d = 16,1 N/mm2 via k_h = (150/96)^0,2).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Materiaaltype voor factorbepaling.
///
/// LVL en plaatmateriaal zijn bewust niet opgenomen: de referentie-uitwerking
/// noch een raadpleegbare normtekst dekte die rijen, dus die zouden
/// NIET-GEVERIFIEERD zijn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum TimberType {
    /// Massief hout (EN 338).
    Solid,
    /// Gelamineerd hout / glulam (EN 14080).
    Glulam,
}

/// Klimaatklasse (service class) volgens §2.3.1.3.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum ServiceClass {
    Sc1,
    Sc2,
    Sc3,
}

/// Belastingduurklasse volgens §2.3.1.2.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum LoadDurationClass {
    Permanent,
    LongTerm,
    MediumTerm,
    ShortTerm,
    Instantaneous,
}

/// k_mod — tabel 3.1 (massief hout en gelamineerd hout hebben dezelfde rijen).
///
/// Referentiewaarden: klimaatklasse 1/2 → 0,60 / 0,70 / 0,80 / 0,90 / 1,10;
/// klimaatklasse 3 → 0,50 / 0,55 / 0,65 / 0,70 / 0,90. De eerste drie kolommen
/// van beide rijen staan letterlijk in de referentie-uitwerking
/// ("0,60(0,50) / 0,80(0,65) / 0,90(0,80)").
pub fn k_mod(_timber: TimberType, service: ServiceClass, duration: LoadDurationClass) -> f64 {
    use LoadDurationClass::*;
    use ServiceClass::*;
    match (service, duration) {
        (Sc1 | Sc2, Permanent) => 0.60,
        (Sc1 | Sc2, LongTerm) => 0.70,
        (Sc1 | Sc2, MediumTerm) => 0.80,
        (Sc1 | Sc2, ShortTerm) => 0.90,
        (Sc1 | Sc2, Instantaneous) => 1.10,
        (Sc3, Permanent) => 0.50,
        (Sc3, LongTerm) => 0.55,
        (Sc3, MediumTerm) => 0.65,
        (Sc3, ShortTerm) => 0.70,
        (Sc3, Instantaneous) => 0.90,
    }
}

/// Materiaalfactor gamma_M volgens de Nederlandse NB (NB:2013):
/// massief hout 1,30 — bevestigd door de referentie-uitwerking
/// ("Solid timber; gammaM = 1,30"); gelamineerd hout 1,25.
pub fn gamma_m(timber: TimberType) -> f64 {
    match timber {
        TimberType::Solid => 1.30,
        TimberType::Glulam => 1.25,
    }
}

/// k_def — tabel 3.2 (kruip). Massief en gelamineerd hout: 0,60 / 0,80 / 2,00
/// voor klimaatklasse 1 / 2 / 3. Klimaatklasse 1 (0,60) bevestigd door de
/// referentie-uitwerking ("kdef = 0,60").
pub fn k_def(_timber: TimberType, service: ServiceClass) -> f64 {
    match service {
        ServiceClass::Sc1 => 0.60,
        ServiceClass::Sc2 => 0.80,
        ServiceClass::Sc3 => 2.00,
    }
}

/// Hoogtefactor k_h voor buiging en trek (§3.2(3) massief, §3.3(3) glulam).
///
/// Massief hout, rechthoekig, rho_k <= 700 kg/m3, h < 150 mm:
///   k_h = min((150/h)^0,2 ; 1,3)
/// Gelamineerd hout, h < 600 mm:
///   k_h = min((600/h)^0,1 ; 1,1)
///
/// `h_mm` is de maatgevende doorsnedeafmeting in de beschouwde richting
/// (bij buiging: de hoogte in het betreffende buigvlak).
/// Verificatie massief: referentie gebruikt f_m,z,d = 14,77 x (150/96)^0,2
/// = 16,1 N/mm2 voor de 96 mm brede zijde. De glulam-tak volgt de normtekst
/// maar heeft geen referentiewaarde (NIET-GEVERIFIEERD tegen een uitwerking).
pub fn k_h(timber: TimberType, h_mm: f64) -> f64 {
    if h_mm <= 0.0 {
        return 1.0;
    }
    match timber {
        TimberType::Solid => {
            if h_mm < 150.0 {
                (150.0 / h_mm).powf(0.2).min(1.3)
            } else {
                1.0
            }
        }
        TimberType::Glulam => {
            if h_mm < 600.0 {
                (600.0 / h_mm).powf(0.1).min(1.1)
            } else {
                1.0
            }
        }
    }
}

/// Systeemsterktefactor k_sys = 1,1 (§6.6): alleen toepassen wanneer meerdere
/// gelijksoortige elementen door een lastverdelend systeem zijn gekoppeld.
/// De referentie-uitwerking past k_sys niet toe; de waarde 1,1 volgt de
/// normtekst (NIET-GEVERIFIEERD tegen een uitwerking).
pub fn k_sys(load_sharing: bool) -> f64 {
    if load_sharing {
        1.1
    } else {
        1.0
    }
}

/// Herverdelingsfactor k_m voor dubbele buiging (§6.1.6(2)):
/// 0,7 voor rechthoekige doorsneden, 1,0 voor overige.
/// Referentie: k_m = 0,7 in vergelijking (6.23)/(6.24).
pub fn k_m(rectangular: bool) -> f64 {
    if rectangular {
        0.7
    } else {
        1.0
    }
}

/// Rechtheidsfactor beta_c voor knik (vergelijking 6.29):
/// 0,2 massief hout, 0,1 gelamineerd hout.
/// Referentie: beta_c = 0,2 in (6.27)/(6.28).
pub fn beta_c(timber: TimberType) -> f64 {
    match timber {
        TimberType::Solid => 0.2,
        TimberType::Glulam => 0.1,
    }
}

/// Rekenwaarde van een sterkte-eigenschap (vergelijking 2.14):
/// f_d = k_h · k_sys · k_mod · f_k / gamma_M.
/// Geef `k_h_factor`/`k_sys_factor` = 1,0 waar niet van toepassing.
pub fn design_strength(f_k: f64, k_mod_factor: f64, gamma_m_value: f64, k_h_factor: f64, k_sys_factor: f64) -> f64 {
    k_h_factor * k_sys_factor * k_mod_factor * f_k / gamma_m_value
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn k_mod_tabel_3_1_referentierijen() {
        // Referentie-uitwerking: "0,60(0,50) / 0,80(0,65) / 0,90(0,80)".
        assert_relative_eq!(k_mod(TimberType::Solid, ServiceClass::Sc1, LoadDurationClass::Permanent), 0.60);
        assert_relative_eq!(k_mod(TimberType::Solid, ServiceClass::Sc1, LoadDurationClass::MediumTerm), 0.80);
        assert_relative_eq!(k_mod(TimberType::Solid, ServiceClass::Sc1, LoadDurationClass::ShortTerm), 0.90);
        assert_relative_eq!(k_mod(TimberType::Solid, ServiceClass::Sc3, LoadDurationClass::Permanent), 0.50);
        assert_relative_eq!(k_mod(TimberType::Solid, ServiceClass::Sc3, LoadDurationClass::MediumTerm), 0.65);
        assert_relative_eq!(k_mod(TimberType::Solid, ServiceClass::Sc3, LoadDurationClass::ShortTerm), 0.70);
        // Overige cellen conform tabel 3.1.
        assert_relative_eq!(k_mod(TimberType::Glulam, ServiceClass::Sc2, LoadDurationClass::LongTerm), 0.70);
        assert_relative_eq!(k_mod(TimberType::Glulam, ServiceClass::Sc2, LoadDurationClass::Instantaneous), 1.10);
        assert_relative_eq!(k_mod(TimberType::Solid, ServiceClass::Sc3, LoadDurationClass::Instantaneous), 0.90);
    }

    #[test]
    fn gamma_m_volgens_nb() {
        assert_relative_eq!(gamma_m(TimberType::Solid), 1.30);
        assert_relative_eq!(gamma_m(TimberType::Glulam), 1.25);
    }

    #[test]
    fn k_def_tabel_3_2() {
        assert_relative_eq!(k_def(TimberType::Solid, ServiceClass::Sc1), 0.60);
        assert_relative_eq!(k_def(TimberType::Solid, ServiceClass::Sc2), 0.80);
        assert_relative_eq!(k_def(TimberType::Glulam, ServiceClass::Sc3), 2.00);
    }

    #[test]
    fn k_h_massief_96mm_referentie() {
        // Referentie: f_m,z,d = 16,1 = 14,77 x (150/96)^0,2 → k_h = 1,0935.
        assert_relative_eq!(k_h(TimberType::Solid, 96.0), 1.0935, max_relative = 1e-3);
        // h >= 150 mm: geen verhoging (referentie: f_m,y,d = 14,8 bij h = 450).
        assert_relative_eq!(k_h(TimberType::Solid, 450.0), 1.0);
        // Afkapping op 1,3 voor zeer kleine hoogten: (150/30)^0,2 = 1,38 → 1,3.
        assert_relative_eq!(k_h(TimberType::Solid, 30.0), 1.3);
    }

    #[test]
    fn k_h_glulam_normtekst() {
        assert_relative_eq!(k_h(TimberType::Glulam, 600.0), 1.0);
        assert_relative_eq!(k_h(TimberType::Glulam, 300.0), (600.0_f64 / 300.0).powf(0.1), max_relative = 1e-9);
        // Afkapping op 1,1.
        assert_relative_eq!(k_h(TimberType::Glulam, 100.0), 1.1);
    }

    #[test]
    fn rekenwaarden_c24_middellang_referentie() {
        // Referentietabel: f_m,d = 14,77; f_c,0,d = 12,92; f_v,d = 2,46 N/mm2.
        let g = gamma_m(TimberType::Solid);
        let km = k_mod(TimberType::Solid, ServiceClass::Sc1, LoadDurationClass::MediumTerm);
        assert_relative_eq!(design_strength(24.0, km, g, 1.0, 1.0), 14.77, max_relative = 1e-3);
        assert_relative_eq!(design_strength(21.0, km, g, 1.0, 1.0), 12.92, max_relative = 1e-3);
        assert_relative_eq!(design_strength(4.0, km, g, 1.0, 1.0), 2.46, max_relative = 2e-3);
        // Permanent: f_m,d = 11,08; kort: f_m,d = 16,62.
        let kp = k_mod(TimberType::Solid, ServiceClass::Sc1, LoadDurationClass::Permanent);
        let ks = k_mod(TimberType::Solid, ServiceClass::Sc1, LoadDurationClass::ShortTerm);
        assert_relative_eq!(design_strength(24.0, kp, g, 1.0, 1.0), 11.08, max_relative = 1e-3);
        assert_relative_eq!(design_strength(24.0, ks, g, 1.0, 1.0), 16.62, max_relative = 1e-3);
    }

    #[test]
    fn k_m_en_beta_c() {
        assert_relative_eq!(k_m(true), 0.7);
        assert_relative_eq!(k_m(false), 1.0);
        assert_relative_eq!(beta_c(TimberType::Solid), 0.2);
        assert_relative_eq!(beta_c(TimberType::Glulam), 0.1);
    }

    #[test]
    fn k_sys_alleen_bij_lastverdeling() {
        assert_relative_eq!(k_sys(true), 1.1);
        assert_relative_eq!(k_sys(false), 1.0);
    }
}
