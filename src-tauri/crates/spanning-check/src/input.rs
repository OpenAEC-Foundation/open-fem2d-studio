//! Invoertypen voor de vrije spanningstoets.

use crate::doorsnede::SpanningDoorsnede;
use mechanics::ForcePoint;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

fn default_one() -> f64 {
    1.0
}

fn default_vezels() -> u32 {
    21
}

/// Invoer voor één staaf die op vergelijkspanning getoetst wordt.
///
/// Dit is bewust GEEN normtoetsing: er is geen materiaalnorm, geen
/// doorsnedeklassificatie, geen knik-, kip- of doorbuigingsgrens. De
/// toelaatbare spanning komt volledig van de gebruiker; de kern rekent alleen
/// de spanningen uit de snedekrachten en vergelijkt ze daarmee.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct SpanningBeamCheckInput {
    pub beam_id: u32,
    /// De doorsnede: rechthoek, catalogusprofiel of vrij lagenmodel.
    pub section: SpanningDoorsnede,
    /// Naam van het materiaal zoals de gebruiker het genoemd heeft, bijv.
    /// "Natuursteen". Alleen voor de kopregel en het rapport.
    pub material_name: String,
    /// Toelaatbare spanning f_toel in N/mm². Positief.
    pub f_toel_mpa: f64,
    /// Materiaalfactor γ_M; de rekenwaarde is f_d = f_toel / γ_M.
    /// Standaard 1,0 — dan is f_toel zelf de rekenwaarde.
    #[serde(default = "default_one")]
    pub gamma_m: f64,
    /// Dwarsspanning σ_z in N/mm² (bijv. een oplegdruk), constant over de
    /// doorsnede aangenomen. Het staafmodel berekent σ_z niet zelf: een
    /// staafelement kent alleen N, V en M. Standaard 0.
    #[serde(default)]
    pub sigma_z_mpa: f64,
    /// Staaflengte in m — alleen voor de kopregel van het rapport.
    pub length_m: f64,
    /// Krachtsverloop (envelop) langs de staaf; N trek-positief, M_y positief
    /// = trek in de onderste vezel (zie `mechanics::InternalForces`).
    pub forces_envelope: Vec<ForcePoint>,
    /// Richtaantal rekenpunten over de hoogte; elke laag krijgt er minstens
    /// drie. Standaard 21.
    #[serde(default = "default_vezels")]
    pub fiber_count: u32,
}
