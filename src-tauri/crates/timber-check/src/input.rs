//! Invoertypen voor de hout-orchestrator.

use mechanics::ForcePoint;
use nen_en_1995_1_1::stability::{LtbLoadCase, LtbLoadPosition};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

fn default_one() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

fn default_noemer_fin() -> f64 {
    nen_en_1995_1_1::deflection::NOEMER_W_FIN
}

fn default_noemer_add() -> f64 {
    nen_en_1995_1_1::deflection::NOEMER_W_ADD
}

fn default_ltb_load_case() -> LtbLoadCase {
    LtbLoadCase::UniformLoad
}

fn default_ltb_load_position() -> LtbLoadPosition {
    LtbLoadPosition::CentreOfGravity
}

/// Invoer voor één houten staaf (rechthoekige doorsnede b × h).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct TimberBeamCheckInput {
    pub beam_id: u32,
    /// Doorsnedebreedte b in mm.
    pub width_mm: f64,
    /// Doorsnedehoogte h in mm (buiging om de sterke as).
    pub height_mm: f64,
    /// Sterkteklasse, bijv. "C24" (EN 338) of "GL28h" (EN 14080).
    pub strength_class: String,
    /// Klimaatklasse (service class) §2.3.1.3.
    pub service_class: ServiceClass,
    /// Maatgevende belastingduurklasse van de UGT-combinatie (§3.1.3:
    /// de kortst durende belasting in de combinatie bepaalt k_mod).
    pub load_duration: LoadDurationClass,
    /// Staaflengte in m.
    pub length_m: f64,
    /// Krachtsverloop (envelop) langs de staaf; N drukt negatief.
    pub forces_envelope: Vec<ForcePoint>,
    /// Kniklengte om de sterke as (m).
    pub buckling_length_y_m: f64,
    /// Kniklengte om de zwakke as (m) — bij kipsteunen de steunafstand.
    pub buckling_length_z_m: f64,
    /// Kipsteunafstand (m) voor tabel 6.1; 0 → staaflengte.
    #[serde(default)]
    pub ltb_segment_length_m: f64,
    /// Belastinggeval voor l_ef (tabel 6.1).
    #[serde(default = "default_ltb_load_case")]
    pub ltb_load_case: LtbLoadCase,
    /// Aangrijpingspunt van de belasting (tabel 6.1, voetnoot).
    #[serde(default = "default_ltb_load_position")]
    pub ltb_load_position: LtbLoadPosition,
    /// Expliciete effectieve kiplengte in m; 0 → berekenen via tabel 6.1.
    #[serde(default)]
    pub ltb_effective_length_override_m: f64,
    /// Kiptoets §6.3.3 uitvoeren. De referentie-uitwerking voert 6.3.3
    /// alleen voor de ligger uit, niet voor de kolommen.
    #[serde(default = "default_true")]
    pub perform_ltb_check: bool,
    /// Scheurfactor k_cr voor dwarskracht (6.13a). 1,0 conform de
    /// referentie-uitwerking; A1-aanbevolen waarde 0,67.
    #[serde(default = "default_one")]
    pub k_cr: f64,
    /// Lastverdelend systeem aanwezig → k_sys = 1,1 (§6.6).
    #[serde(default)]
    pub load_sharing: bool,
    /// Zakking onder de karakteristieke BGT-combinatie (mm, negatief = omlaag).
    #[serde(default)]
    pub deflection_inst_mm: f64,
    /// Zakking onder de quasi-blijvende BGT-combinatie (mm).
    #[serde(default)]
    pub deflection_quasi_perm_mm: f64,
    /// Zakking onder de blijvende BGT-combinatie (mm).
    #[serde(default)]
    pub deflection_permanent_mm: f64,
    /// Noemer voor w_fin (L/n), NB-standaard 250.
    #[serde(default = "default_noemer_fin")]
    pub deflection_limit_fin: f64,
    /// Noemer voor w_add (L/n), NB-standaard 333.
    #[serde(default = "default_noemer_add")]
    pub deflection_limit_add: f64,
}
