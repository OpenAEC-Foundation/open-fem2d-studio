//! Invoertypen voor de beton-orchestrator.

use mechanics::ForcePoint;
use nen_en_1992_1_1::mnkappa::DEFAULT_N_STRIPS;
use nen_en_1992_1_1::{DesignSituation, ReinforcementCage, SteelBranch};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

fn default_n_strips() -> u32 {
    DEFAULT_N_STRIPS as u32
}

fn default_true() -> bool {
    true
}

/// Invoer voor één betonnen staaf (rechthoekige doorsnede b × h met korf).
///
/// `deny_unknown_fields`: een tikfout in een veldnaam met `#[serde(default)]`
/// zou anders stilzwijgend de standaardwaarde opleveren.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteBeamCheckInput {
    pub beam_id: u32,
    /// Doorsnedebreedte b in mm.
    pub width_mm: f64,
    /// Doorsnedehoogte h in mm (buiging om de sterke as).
    pub height_mm: f64,
    /// Betonsterkteklasse, bijv. "C30/37" (tabel 3.1).
    pub concrete_class: String,
    /// Wapeningsstaal, bijv. "B500B" (bijlage C).
    pub reinforcement_grade: String,
    /// Wapeningskorf: dekking, beugel, boven- en onderwapening.
    pub cage: ReinforcementCage,
    /// Staaflengte in m.
    pub length_m: f64,
    /// Krachtsverloop (envelop) langs de staaf; N drukt negatief.
    pub forces_envelope: Vec<ForcePoint>,
    /// Aantal stroken waarin de doorsnede voor de integratie van de
    /// betonspanning wordt verdeeld ("in hoeveel delen opknippen").
    #[serde(default = "default_n_strips")]
    pub n_strips: u32,
    /// Bovenste tak van het staaldiagram (3.2.7(2)); standaard horizontaal.
    #[serde(default)]
    pub steel_branch: SteelBranch,
    /// Ontwerpsituatie voor tabel 2.1N; standaard blijvend en tijdelijk.
    #[serde(default)]
    pub design_situation: DesignSituation,
    /// Minimale excentriciteit e₀ = max(h/30; 20 mm) toepassen bij druk (6.1(4)).
    #[serde(default = "default_true")]
    pub apply_min_eccentricity: bool,
}

/// Verzoek om het M-N-κ-diagram van een korf, los van een staaf.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct MnKappaRequest {
    pub width_mm: f64,
    pub height_mm: f64,
    pub concrete_class: String,
    pub reinforcement_grade: String,
    pub cage: ReinforcementCage,
    /// Normaalkracht waarbij het M-κ-diagram wordt bepaald (kN, trek positief).
    #[serde(default)]
    pub n_ed_kn: f64,
    /// Richting van het moment: +1 trek onder (standaard), −1 trek boven.
    #[serde(default = "default_moment_sign")]
    pub moment_sign: f64,
    #[serde(default = "default_n_strips")]
    pub n_strips: u32,
    #[serde(default)]
    pub steel_branch: SteelBranch,
    #[serde(default)]
    pub design_situation: DesignSituation,
    /// Aantal punten van het N-M-interactiediagram (0 = niet berekenen).
    #[serde(default = "default_interaction_points")]
    pub interaction_points: u32,
}

fn default_moment_sign() -> f64 {
    1.0
}

fn default_interaction_points() -> u32 {
    21
}
