//! Invoertypen van de plaattoets.
//!
//! De spanningen komen uit de plaatsolver van de app (`PlateElementStress`):
//! elementgemiddeld, in de GLOBALE assen van het model, per UGT-combinatie
//! gesuperponeerd. Deze kern rekent ze niet opnieuw uit; hij toetst ze. Wat hij
//! wel zelf doet is alles wat met de norm te maken heeft: de materiaalsterkte,
//! de partiële factor, de transformatie naar de materiaalassen van hout en het
//! criterium.

use nationale_bijlage::NationaleBijlage;
use nen_en_1992_1_1::ExposureClass;
use nen_en_1995_1_1::ServiceClass;
use timber_check::CombinationLoadDuration;
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

/// Eén volledig, asgelijnd plaatveld; maten in mm en steun expliciet opgegeven.
/// De directe API-aanroeper bevestigt de geometrie; de app controleert haar tegen de knopen.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatPlooiInput {
    /// Volledige elementset uit de mesh, onafhankelijk van beschikbare spanningsresultaten.
    pub expected_element_ids: Vec<u32>,
    pub a_mm: f64,
    pub b_mm: f64,
    pub randvoorwaarden: String,
    pub steun_bron: String,
    pub onverstijfd: bool,
    pub uniforme_spanning: bool,
    pub rechthoek_zonder_openingen: bool,
    /// Afwijking die de modelbouwer vaststelde. Nooit negeren in de kern.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub geometrie_fout: Option<String>,
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
    /// Zonder dit veld blijft de bestaande vloeicontrole ongewijzigd.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub plooi: Option<PlaatPlooiInput>,
    /// Hout: hoofdrichting (vezel) in GRADEN tegen de klok in vanaf de globale
    /// x-as — dezelfde hoek als `Plate.hoofdrichting` en als de solver gebruikt.
    /// Weglaten = 0°. Bij staal zonder betekenis.
    #[serde(default)]
    #[ts(as = "Option<f64>", optional)]
    pub hoofdrichting_graden: f64,
    /// Hout: de klimaatklasse (2.3.1.3). VERPLICHT voor hout: ontbreekt zij,
    /// dan weigert de kern — er wordt geen klasse aangenomen.
    #[serde(default)]
    #[ts(optional)]
    pub service_class: Option<ServiceClass>,
    /// Hout: de belastingduurklasse per UGT-combinatie (3.1.3(2)), zoals de
    /// invoerbouwer haar uit de belastinggevallen afleidde. Elke combinatie in
    /// `combinations` moet erin staan; anders weigert de kern.
    #[serde(default)]
    #[ts(as = "Option<Vec<CombinationLoadDuration>>", optional)]
    pub load_duration_per_combination: Vec<CombinationLoadDuration>,
    /// Kanttekeningen van de invoerbouwer; rekenen nergens mee en komen
    /// letterlijk in de notities van het resultaat.
    #[serde(default)]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub notities: Vec<String>,
    /// De elementspanningen per UGT-combinatie.
    pub combinations: Vec<PlaatCombinatie>,
    /// Beton: de AANWEZIGE wapening van de wand (issue #25). Weglaten = niet
    /// ingevoerd; dan toetst de kern alleen de benodigde wapening en het beton,
    /// precies zoals zonder dit veld, met de melding dat de aanwezige wapening
    /// niet is ingevoerd. Bij een ander materiaal dan beton geweigerd.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub wapening_aanwezig: Option<PlaatWapeningInvoer>,
    /// Beton: de elementspanningen per FREQUENTE BGT-combinatie (6.15b) — de
    /// combinatie waaronder de nationale bijlage bij 7.3.1(5) (tabel 7.1N) de
    /// scheurwijdte laat toetsen. Alleen gelezen samen met
    /// `wapening_aanwezig`; leeg = scheurwijdte niet getoetst, met reden.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<PlaatCombinatie>>", optional)]
    pub frequente_combinaties: Vec<PlaatCombinatie>,
}

/// Eén wapeningslaag van een wand: één richting aan één zijde.
///
/// Opgave OF met staafdiameter en hart-op-hartafstand, OF met de oppervlakte
/// per meter wand — niet beide (dan zou de kern moeten kiezen welke geldt).
/// Met alleen mm²/m zijn de eisen aan diameter en staafafstand (9.6.1(3),
/// 9.6.2(3), 9.6.3(2)) en (7.11) niet te toetsen; dat staat dan met reden in
/// het resultaat.
/// Zonder diameter ontbreekt tevens het staafzwaartepunt voor momentevenwicht
/// over de wanddikte: een positieve UGT-trekkracht wordt dan niet getoetst.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatWapeningLaag {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub diameter_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hoh_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub as_mm2_per_m: Option<f64>,
    /// Betondekking op DEZE staven (van het wandoppervlak tot de staaf), mm.
    pub dekking_mm: f64,
}

/// De wapening in één richting: zijde 1 (voorzijde) en zijde 2 (achterzijde).
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatWapeningRichting {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub zijde_1: Option<PlaatWapeningLaag>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub zijde_2: Option<PlaatWapeningLaag>,
}

/// De aanwezige wapening van een betonwand.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatWapeningInvoer {
    /// Betonstaalsoort, bijvoorbeeld "B500B" — bepaalt f_yk en f_yd.
    pub staalsoort: String,
    /// Wapening in de horizontale modelrichting (x).
    pub horizontaal: PlaatWapeningRichting,
    /// Wapening in de verticale modelrichting (z).
    pub verticaal: PlaatWapeningRichting,
    /// Milieuklasse (tabel 4.1): de enige ingang van tabel 7.1N (NB) voor
    /// w_max. Weglaten = scheurwijdte niet getoetst, met reden; er wordt geen
    /// klasse aangenomen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub milieuklasse: Option<ExposureClass>,
    /// Treksterkte op het verwachte scheurtijdstip (7.3.2), N/mm².
    /// Geen automatische aanname van ouderdom of f_ctm.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub f_ct_eff_mpa: Option<f64>,
    /// Belastingsduur voor (7.9): true = langdurend, false = kortdurend.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub langdurend: Option<bool>,
    /// Aanhechting voor (7.11): true = hoog, false = glad.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hoge_aanhechting: Option<bool>,
}
