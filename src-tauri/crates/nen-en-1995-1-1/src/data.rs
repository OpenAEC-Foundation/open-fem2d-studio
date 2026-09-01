//! Sterkteklassen voor hout.
//!
//! Bron: EN 338 (massief naaldhout, C-klassen) en EN 14080 (gelamineerd
//! hout, GL-h-klassen). De waarden zijn overgenomen uit de bestaande
//! materiaalbibliotheek van de applicatie (`src/core/materials/
//! MaterialLibrary.ts`) en voor C24 volledig geverifieerd tegen de
//! referentie-uitwerking (f_m,k = 24; f_t,0,k = 14; f_c,0,k = 21;
//! f_c,90,k = 2,5; f_v,k = 4,0; E_0,mean = 11000; E_0,05 = 7400;
//! E_90,mean = 370; G_mean = 690; rho_k = 350; rho_mean = 420).
//!
//! Afwijking: de bibliotheek geeft f_t,90,k = 0,5 voor C24; de
//! referentie-uitwerking en EN 338 geven 0,4 — hier is 0,4 aangehouden.
//! f_t,90,k van de overige klassen is uit de bibliotheek overgenomen en
//! NIET-GEVERIFIEERD tegen een uitwerking (geen toets gebruikt deze waarde).

use crate::factors::TimberType;

/// Karakteristieke eigenschappen van een sterkteklasse.
/// Sterkten en stijfheden in N/mm2, dichtheden in kg/m3.
#[derive(Clone, Copy, Debug)]
pub struct StrengthClass {
    pub name: &'static str,
    pub timber_type: TimberType,
    pub f_mk: f64,
    pub f_t0k: f64,
    pub f_t90k: f64,
    pub f_c0k: f64,
    pub f_c90k: f64,
    pub f_vk: f64,
    pub e0_mean: f64,
    pub e0_05: f64,
    pub e90_mean: f64,
    pub g_mean: f64,
    pub rho_k: f64,
    pub rho_mean: f64,
}

const fn softwood(
    name: &'static str,
    f_mk: f64, f_t0k: f64, f_t90k: f64, f_c0k: f64, f_c90k: f64, f_vk: f64,
    e0_mean: f64, e0_05: f64, e90_mean: f64, g_mean: f64, rho_k: f64, rho_mean: f64,
) -> StrengthClass {
    StrengthClass {
        name,
        timber_type: TimberType::Solid,
        f_mk, f_t0k, f_t90k, f_c0k, f_c90k, f_vk,
        e0_mean, e0_05, e90_mean, g_mean, rho_k, rho_mean,
    }
}

const fn glulam(
    name: &'static str,
    f_mk: f64, f_t0k: f64, f_t90k: f64, f_c0k: f64, f_c90k: f64, f_vk: f64,
    e0_mean: f64, e0_05: f64, e90_mean: f64, g_mean: f64, rho_k: f64, rho_mean: f64,
) -> StrengthClass {
    StrengthClass {
        name,
        timber_type: TimberType::Glulam,
        f_mk, f_t0k, f_t90k, f_c0k, f_c90k, f_vk,
        e0_mean, e0_05, e90_mean, g_mean, rho_k, rho_mean,
    }
}

/// Massief naaldhout — EN 338.
pub const SOFTWOOD: &[StrengthClass] = &[
    softwood("C14", 14.0, 8.0, 0.4, 16.0, 2.0, 3.0, 7000.0, 4700.0, 230.0, 440.0, 290.0, 350.0),
    softwood("C16", 16.0, 10.0, 0.4, 17.0, 2.2, 3.2, 8000.0, 5400.0, 270.0, 500.0, 310.0, 370.0),
    softwood("C18", 18.0, 11.0, 0.4, 18.0, 2.2, 3.4, 9000.0, 6000.0, 300.0, 560.0, 320.0, 380.0),
    softwood("C20", 20.0, 12.0, 0.5, 19.0, 2.3, 3.6, 9500.0, 6400.0, 320.0, 590.0, 330.0, 390.0),
    softwood("C22", 22.0, 13.0, 0.5, 20.0, 2.4, 3.8, 10000.0, 6700.0, 330.0, 630.0, 340.0, 410.0),
    softwood("C24", 24.0, 14.0, 0.4, 21.0, 2.5, 4.0, 11000.0, 7400.0, 370.0, 690.0, 350.0, 420.0),
    softwood("C27", 27.0, 16.0, 0.5, 22.0, 2.6, 4.0, 11500.0, 7700.0, 380.0, 720.0, 370.0, 450.0),
    softwood("C30", 30.0, 18.0, 0.5, 23.0, 2.7, 4.0, 12000.0, 8000.0, 400.0, 750.0, 380.0, 460.0),
    softwood("C35", 35.0, 21.0, 0.5, 25.0, 2.8, 4.0, 13000.0, 8700.0, 430.0, 810.0, 400.0, 480.0),
];

/// Gelamineerd hout (homogeen) — EN 14080.
pub const GLULAM: &[StrengthClass] = &[
    glulam("GL24h", 24.0, 19.2, 0.5, 24.0, 2.5, 3.5, 11500.0, 9600.0, 300.0, 650.0, 385.0, 420.0),
    glulam("GL28h", 28.0, 22.3, 0.5, 26.5, 2.5, 3.5, 12600.0, 10500.0, 300.0, 650.0, 425.0, 460.0),
    glulam("GL32h", 32.0, 25.6, 0.5, 29.0, 2.5, 3.5, 13700.0, 11100.0, 300.0, 650.0, 440.0, 480.0),
    glulam("GL36h", 36.0, 28.8, 0.5, 31.0, 2.5, 3.5, 14700.0, 11900.0, 300.0, 650.0, 450.0, 490.0),
];

/// Zoek een sterkteklasse op naam ("C24", "GL28h", ...).
pub fn strength_class_by_name(name: &str) -> Option<&'static StrengthClass> {
    SOFTWOOD
        .iter()
        .chain(GLULAM.iter())
        .find(|c| c.name.eq_ignore_ascii_case(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn c24_komt_overeen_met_de_referentie() {
        let c24 = strength_class_by_name("C24").expect("C24 aanwezig");
        assert_relative_eq!(c24.f_mk, 24.0);
        assert_relative_eq!(c24.f_t0k, 14.0);
        assert_relative_eq!(c24.f_t90k, 0.4);
        assert_relative_eq!(c24.f_c0k, 21.0);
        assert_relative_eq!(c24.f_c90k, 2.5);
        assert_relative_eq!(c24.f_vk, 4.0);
        assert_relative_eq!(c24.e0_mean, 11000.0);
        assert_relative_eq!(c24.e0_05, 7400.0);
        assert_relative_eq!(c24.e90_mean, 370.0);
        assert_relative_eq!(c24.g_mean, 690.0);
        assert_relative_eq!(c24.rho_k, 350.0);
        assert_relative_eq!(c24.rho_mean, 420.0);
        assert_eq!(c24.timber_type, crate::factors::TimberType::Solid);
    }

    #[test]
    fn opzoeken_is_hoofdletterongevoelig_en_kent_glulam() {
        assert!(strength_class_by_name("c24").is_some());
        let gl = strength_class_by_name("GL28h").expect("GL28h aanwezig");
        assert_relative_eq!(gl.f_mk, 28.0);
        assert_eq!(gl.timber_type, crate::factors::TimberType::Glulam);
        assert!(strength_class_by_name("S235").is_none());
    }
}
