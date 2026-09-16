//! Resultaattypen van de plaattoets.

use nen_en_1993_1_1_section::CheckStatus;
use serde::{Deserialize, Serialize};
use steel_check::NamedCheck;
use ts_rs::TS;

use crate::input::PlaatMateriaalSoort;

/// De hoogste unity check van één element over alle combinaties — de
/// OMHULLENDE per element. Hieruit kleurt het canvas elk element.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatElementUitkomst {
    pub element_id: u32,
    pub uc: f64,
    /// De combinatie waarin deze hoogste UC optreedt.
    pub combination_id: u32,
    /// De toets die deze UC geeft (bij staal altijd het vloeicriterium).
    pub check_id: String,
}

/// Het maatgevende element van één combinatie.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatCombinatieUitkomst {
    pub combination_id: u32,
    pub uc: f64,
    pub element_id: u32,
    pub check_id: String,
}

/// Iets dat bij deze plaat NIET getoetst is, met de reden.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatNietGetoetst {
    /// Stabiele sleutel, bijvoorbeeld "en1993_1_5_plooi".
    pub id: String,
    /// De titel zoals paneel en rapport hem tonen.
    pub titel: String,
    /// Waarom niet — met de normverwijzing.
    pub reden: String,
    /// Bepaalt dit gat de STATUS van de plaat? `true` betekent: de spanning
    /// waar het om gaat is in deze plaat werkelijk aanwezig en niet getoetst,
    /// dus de plaat kan niet "voldoet" heten (status `NotApplicable` zolang
    /// geen uitgevoerde toets `NotOk` geeft). `false` betekent: het staat
    /// erbij als grens van de toets, zoals plooi bij staal.
    pub bepaalt_status: bool,
}

/// Beton: de benodigde trekkracht in de wapening van één element, per
/// wapeningsrichting, volgens NEN-EN 1992-1-1 bijlage F — het maximum over de
/// combinaties. In kN per m wand (= f'_td · t): deel door f_yd voor A_s in
/// mm²/m (over beide zijden samen).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatWapeningElement {
    pub element_id: u32,
    /// Wapening in de horizontale modelrichting (x).
    pub n_td_x_kn_per_m: f64,
    pub combination_x: u32,
    /// Wapening in de verticale modelrichting (z).
    pub n_td_z_kn_per_m: f64,
    pub combination_z: u32,
}

/// Beton: de benodigde wapening over de hele plaat.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlaatWapening {
    /// Het element met de grootste benodigde trekkracht in x.
    pub max_x: PlaatWapeningElement,
    /// Het element met de grootste benodigde trekkracht in z.
    pub max_z: PlaatWapeningElement,
    /// Per element, in de volgorde van het rekenmesh.
    pub elementen: Vec<PlaatWapeningElement>,
}

/// Resultaat van de toets van één plaat.
///
/// Geen `PartialEq`: `NamedCheck` heeft die niet. Vergelijk twee antwoorden
/// op hun JSON, zoals de drie-wegen-tests dat doen.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/plaat/")]
pub struct PlateCheckResult {
    pub plate_id: u32,
    pub soort: PlaatMateriaalSoort,
    pub materiaal: String,
    pub thickness_mm: f64,
    /// De norm waarop getoetst is, zoals het rapport hem noemt; leeg bij een
    /// weigering.
    pub norm: String,
    /// Per toets de afleiding op het maatgevende element en de maatgevende
    /// combinatie van díe toets.
    pub checks: Vec<NamedCheck>,
    /// De hoogste unity check over alle elementen, combinaties en toetsen. 0
    /// bij een weigering — lees dan `geweigerd`, niet dit getal.
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub governing_element_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub governing_combination_id: Option<u32>,
    /// Per combinatie het maatgevende element.
    pub combinaties: Vec<PlaatCombinatieUitkomst>,
    /// Per element de hoogste UC over de combinaties (omhullende), in de
    /// volgorde van het rekenmesh.
    pub elementen: Vec<PlaatElementUitkomst>,
    /// Wat niet getoetst is, met reden.
    pub niet_getoetst: Vec<PlaatNietGetoetst>,
    /// Aanwezig = er is NIETS getoetst, met de reden. `status` is dan
    /// `NotApplicable` en `uc_max` 0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub geweigerd: Option<String>,
    /// Alleen bij beton: de benodigde wapening volgens bijlage F.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub wapening: Option<PlaatWapening>,
    /// Kanttekeningen bij de plaat als geheel.
    pub notes: Vec<String>,
}
