//! Resultaattypen voor de vrije spanningstoets.
//!
//! `NamedCheck`/`CheckKind`/`ResistanceCalc` worden hergebruikt uit
//! `steel-check` respectievelijk `nen-en-1993-1-1-section`, zodat het
//! toetsingspaneel en het rapport één weergavecontract houden — precies zoals
//! de hout- en betonkern dat doen.

use nen_en_1993_1_1_section::CheckStatus;
use serde::{Deserialize, Serialize};
use steel_check::NamedCheck;
use ts_rs::TS;

use crate::doorsnede::SpanningLaag;

/// Eén rekenpunt van het spanningsverloop over de hoogte.
///
/// Op een laaggrens komt dezelfde `z_mm` twee keer voor — één keer met de
/// breedte erboven en één keer met die eronder. Zo staat de sprong in τ in de
/// gegevens en hoeft de tekening hem niet te raden.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct SpanningVezel {
    /// Hoogte vanaf de bovenkant van de doorsnede (mm).
    pub z_mm: f64,
    /// Meewerkende breedte op deze hoogte (mm).
    pub breedte_mm: f64,
    /// Statisch moment van het deel bóven z om de zwaartelijn (mm³).
    pub s_mm3: f64,
    /// Normaalspanning σ_x (N/mm², trek positief).
    pub sigma_x_mpa: f64,
    /// Schuifspanning τ (N/mm², absolute waarde).
    pub tau_mpa: f64,
    /// Vergelijkspanning σ_eq (N/mm², altijd ≥ 0).
    pub sigma_eq_mpa: f64,
}

/// Het spanningsverloop bij één snedekrachtenset (de maatgevende).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct SpanningVerloop {
    pub combination_id: u32,
    /// Plaats langs de staaf (mm vanaf de startknoop).
    pub position_mm: f64,
    pub n_ed_kn: f64,
    pub vz_ed_kn: f64,
    pub my_ed_knm: f64,
    /// De aangenomen dwarsspanning (N/mm²), constant over de hoogte.
    pub sigma_z_mpa: f64,
    pub vezels: Vec<SpanningVezel>,
    /// Hoogte waar σ_eq maximaal is (mm vanaf boven).
    pub z_maatgevend_mm: f64,
}

/// De uitgewerkte doorsnede: lagenmodel plus de gebruikte grootheden.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct SpanningDoorsnedeResultaat {
    pub naam: String,
    pub hoogte_mm: f64,
    /// Grootste laagbreedte (mm) — voor de schaal van de tekening.
    pub breedte_max_mm: f64,
    /// Zwaartelijn vanaf de bovenkant (mm).
    pub z_c_mm: f64,
    pub a_mm2: f64,
    pub iy_mm4: f64,
    /// Elastisch weerstandsmoment naar de bovenste vezel (mm³).
    pub wel_top_mm3: f64,
    /// Elastisch weerstandsmoment naar de onderste vezel (mm³).
    pub wel_bot_mm3: f64,
    /// Herkomst van A en I_y: "profieldatabase" of "lagenmodel".
    pub bron: String,
    pub lagen: Vec<SpanningLaag>,
}

/// Volledig toetsresultaat van één staaf op vergelijkspanning.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct SpanningBeamCheckResult {
    pub beam_id: u32,
    /// Doorsnedenaam voor de kopregel, bijv. "HEA 200" of "300 × 500 mm".
    pub section_name: String,
    /// Materiaalnaam zoals de gebruiker hem gaf.
    pub material_name: String,
    pub f_toel_mpa: f64,
    pub gamma_m: f64,
    /// Rekenwaarde f_d = f_toel / γ_M (N/mm²).
    pub f_d_mpa: f64,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
    pub section: SpanningDoorsnedeResultaat,
    /// Spanningsverloop bij de maatgevende snede; leeg bij een fout.
    pub verloop: Option<SpanningVerloop>,
    /// Aannamen, benaderingen en meldingen voor paneel en rapport.
    pub notes: Vec<String>,
}
