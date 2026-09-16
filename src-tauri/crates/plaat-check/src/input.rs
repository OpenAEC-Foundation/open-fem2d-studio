//! Invoertypen van de plaattoets.
//!
//! De spanningen komen uit de plaatsolver van de app (`PlateElementStress`):
//! elementgemiddeld, in de GLOBALE assen van het model, per UGT-combinatie
//! gesuperponeerd. Deze kern rekent ze niet opnieuw uit; hij toetst ze. Wat hij
//! wel zelf doet is alles wat met de norm te maken heeft: de materiaalsterkte,
//! de partiële factor, de transformatie naar de materiaalassen van hout en het
//! criterium.

use nationale_bijlage::NationaleBijlage;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// De materiaalsoort van een plaat — dezelfde vijf soorten als in
/// `design-mockup/src/lib/plaatMateriaal.ts`.
///
/// De soort reist expliciet mee en wordt niet uit de naam geraden: "C30" is in
/// EN 338 een HOUTsterkteklasse en "C30/37" een betonklasse, en de app heeft
/// die keuze bij het bepalen van de stijfheid al gemaakt. Deze kern controleert
/// wel dat de naam bij de opgegeven soort in zijn eigen tabel staat; past dat
/// niet, dan volgt een weigering in plaats van een toets met een andere tabel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub enum PlaatMateriaalSoort {
    Staal,
    Hout,
    Kruislaaghout,
    Beton,
    Vrij,
}

/// Spanningen van één plaatelement in de globale assen, in N/mm².
///
/// `sigma_y_mpa` is de normaalspanning in de VERTICALE richting van het
/// modelvlak (model-z) — de naam volgt het plaatresultaat van de solver
/// (`sigmaY`). In de notatie van NEN-EN 1993-1-1 (6.1) is dat σ_z,Ed.
/// Trek positief.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatElementSpanning {
    /// Element-id in het rekenmesh; komt onveranderd terug in het resultaat.
    pub element_id: u32,
    pub sigma_x_mpa: f64,
    pub sigma_y_mpa: f64,
    pub tau_xy_mpa: f64,
}

/// De elementspanningen van één UGT-combinatie.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatCombinatie {
    pub combination_id: u32,
    pub elements: Vec<PlaatElementSpanning>,
}

/// Invoer voor de toets van één plaat.
///
/// `deny_unknown_fields`, net als de staafinvoertypen: een tikfout in een
/// veldnaam hoort geweigerd te worden en niet stil op een standaardwaarde te
/// vallen.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlateCheckInput {
    /// De nationale bijlage (normnaad); bepaalt γ_M0.
    #[serde(default)]
    pub bijlage: NationaleBijlage,
    /// Plaatnummer uit het model; komt onveranderd terug.
    pub plate_id: u32,
    pub soort: PlaatMateriaalSoort,
    /// De materiaalnaam zoals de app hem herkende: "S355", "C24", "GL28h", …
    pub materiaal: String,
    /// Plaatdikte in mm. Bij staal bepaalt zij de dikteklasse van tabel 3.1.
    pub thickness_mm: f64,
    /// Kanttekeningen van de invoerbouwer; rekenen nergens mee en komen
    /// letterlijk in de notities van het resultaat.
    #[serde(default)]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub notities: Vec<String>,
    /// De elementspanningen per UGT-combinatie.
    pub combinations: Vec<PlaatCombinatie>,
}
