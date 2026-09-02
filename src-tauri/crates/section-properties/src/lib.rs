//! Pure section-property calculations from geometric primitives.
//! Used by steel-profiles to validate catalog values and by EN-1993 checks.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub mod i_section;
pub mod rhs;
pub mod channel;
pub mod composite;
pub mod contour;
pub mod mesh2d;
pub mod motor;
pub mod torsie;

/// All cross-sectional properties needed for EN 1993 checks.
/// Units: mm² for areas, mm⁴ for I, mm³ for W, mm for radii.
///
/// ## Assenstelsel van de aanvullende velden (D4.1)
///
/// De velden `y_c_mm`, `z_c_mm`, `y_s_mm` en `z_s_mm` staan in het
/// **beschrijvingsassenstelsel** van de doorsnede: oorsprong linksonder in de
/// omhullende rechthoek, `y` naar rechts, `z` omhoog. Voor een catalogusprofiel
/// is dat dus `y ∈ [0, b]` en `z ∈ [0, h]`; voor een samengestelde doorsnede is
/// het het assenstelsel waarin de lamellen zijn ingevoerd.
///
/// Alle nieuwe velden zijn `#[serde(default)]`: bestaande JSON-data zonder deze
/// sleutels laadt ongewijzigd (de 98 catalogus-entries hoeven niet gemigreerd).
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct SectionProperties {
    pub area_mm2: f64,
    pub iy_mm4: f64,
    pub iz_mm4: f64,
    pub wel_y_mm3: f64,
    pub wel_z_mm3: f64,
    pub wpl_y_mm3: f64,
    pub wpl_z_mm3: f64,
    pub av_y_mm2: f64,
    pub av_z_mm2: f64,
    pub it_mm4: f64,
    pub iw_mm6: f64,
    pub iy_radius_mm: f64,
    pub iz_radius_mm: f64,
    pub h_mm: f64,
    pub b_mm: f64,
    pub tw_mm: f64,
    pub tf_mm: f64,
    pub r_mm: f64,

    // ── Aanvullende velden voor asymmetrische doorsneden (D4.1) ──────────────
    /// y-coördinaat van het zwaartepunt in het beschrijvingsassenstelsel.
    /// Voor een U-profiel is dit de afstand van de rug van het lijf tot het
    /// zwaartepunt (`e_y` in de catalogus).
    #[serde(default)]
    pub y_c_mm: f64,
    /// z-coördinaat van het zwaartepunt in het beschrijvingsassenstelsel.
    #[serde(default)]
    pub z_c_mm: f64,
    /// Elastisch weerstandsmoment om de y-as naar de **bovenste** vezel
    /// (`Iy / (z_max − z_c)`).
    #[serde(default)]
    pub wel_y_top_mm3: f64,
    /// Elastisch weerstandsmoment om de y-as naar de **onderste** vezel
    /// (`Iy / (z_c − z_min)`).
    #[serde(default)]
    pub wel_y_bot_mm3: f64,
    /// Elastisch weerstandsmoment om de z-as naar de vezel aan de **−y**-zijde
    /// (`Iz / (y_c − y_min)`). Voor een U-profiel: de rug van het lijf.
    #[serde(default)]
    pub wel_z_left_mm3: f64,
    /// Elastisch weerstandsmoment om de z-as naar de vezel aan de **+y**-zijde
    /// (`Iz / (y_max − y_c)`). Voor een U-profiel: de punt van de flenzen.
    #[serde(default)]
    pub wel_z_right_mm3: f64,
    /// Traagheidsproduct `Iyz = ∫ y·z dA` om de zwaartepuntsassen. Nul zodra de
    /// doorsnede één symmetrieas heeft die met y of z samenvalt.
    #[serde(default)]
    pub iyz_mm4: f64,
    /// Grootste hoofdtraagheidsmoment (`Iu ≥ Iv`).
    #[serde(default)]
    pub iu_mm4: f64,
    /// Kleinste hoofdtraagheidsmoment.
    #[serde(default)]
    pub iv_mm4: f64,
    /// Hoek van de y-as naar de **hoofdas met de grootste** traagheid, in rad,
    /// positief tegen de klok in: `α = ½·atan2(−2·Iyz, Iy − Iz)`.
    #[serde(default)]
    pub alpha_hoofdas_rad: f64,
    /// y-coördinaat van het schuifmiddelpunt, zelfde assenstelsel als `y_c_mm`.
    #[serde(default)]
    pub y_s_mm: f64,
    /// z-coördinaat van het schuifmiddelpunt.
    #[serde(default)]
    pub z_s_mm: f64,
}
