//! NEN-EN 1993-1-1 §6.3 — member stability checks.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{NamedValue, UnityCheck, CheckStatus};

pub mod buckling_curve;
pub mod column_buckling;
pub mod interaction_factors;
pub mod combined_n_m;

/// Eén stap uit de afleiding die aan een toets voorafgaat.
///
/// Het type is verhuisd naar [`nen_en_1993_1_1_section`]: een afleiding is geen
/// eigenschap van stabiliteit, en ook een weerstandstoets kan er een hebben —
/// de betontoetsen van EN 1992 zijn dat. Zie de docstring dáár. Deze re-export
/// staat er zodat `nen_en_1993_1_1_stability::Deelstap` blijft werken; het
/// ts-rs-pad is ongewijzigd, dus de frontend ziet dezelfde `Deelstap.ts`.
pub use nen_en_1993_1_1_section::Deelstap;

/// Mirror of ResistanceCalc but for stability checks.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct StabilityCalc {
    pub id: String,
    pub title: String,
    pub article: String,
    pub force_state: ForceStateSnapshot,
    pub formula_latex: String,
    pub variables: Vec<NamedValue>,
    pub intermediate_values: Vec<NamedValue>,
    /// De afleiding die aan deze toets voorafgaat, in de volgorde waarin het
    /// rapport haar toont. Leeg voor toetsen die geen voorafgaande keten
    /// hebben; dan verandert er niets aan de weergave.
    ///
    /// Waar deze lijst gevuld is, herhaalt `intermediate_values` haar
    /// uitkomsten: die blijft bestaan omdat toetsen en afnemers erop zoeken,
    /// maar het rapport hoort dan de deelstappen te tonen en de losse
    /// tussenwaardenregel weg te laten.
    pub deelstappen: Vec<Deelstap>,
    pub value: f64,
    pub unit: String,
    pub uc: Option<UnityCheck>,
    pub status: CheckStatus,
    pub notes: Vec<String>,
}
