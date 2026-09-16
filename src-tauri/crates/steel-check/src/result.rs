//! Result types for steel-check orchestrator.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use nen_en_1993_1_1_section::{ResistanceCalc, CheckStatus};
use nen_en_1993_1_1_section::classification::CrossSectionClass;
use nen_en_1993_1_1_stability::StabilityCalc;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
#[serde(tag = "type", content = "data")]
pub enum CheckKind {
    Resistance(ResistanceCalc),
    Stability(StabilityCalc),
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct NamedCheck {
    pub id: String,
    pub kind: CheckKind,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct BeamCheckResult {
    pub beam_id: u32,
    pub profile_name: String,
    pub steel_grade: String,
    /// Doorsnedeklasse. Bij een verlopende staaf de ONGUNSTIGSTE klasse over
    /// alle rekenpunten; de klasse per toetsdoorsnede staat in [`Self::verloop`].
    pub classification: CrossSectionClass,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
    /// Alleen bij een VERLOPENDE staaf (`profile_end` in de invoer): de zes
    /// toetsdoorsneden, het maatgevende punt en de doorsneden waarmee de
    /// stabiliteitstoetsen zijn gerekend. Afwezig bij een prismatische staaf,
    /// en dan ook niet geserialiseerd — zo blijven de bestaande snapshots en
    /// antwoorden byte-gelijk.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub verloop: Option<VerloopRapport>,
}

// ═══════════════════════════════════════════════════════════════════════════
//  Verlopend profiel — wat het rapport nodig heeft (ontwerp 15-09-2026, §5)
// ═══════════════════════════════════════════════════════════════════════════
//
// Deze typen wonen hier en niet in `verlopend.rs` omdat de HOUTkern ze óók
// levert: `timber_check` hangt al van deze crate af voor `NamedCheck`, en een
// rapport dat staal en hout langs één pad zet, hoort voor het verloop maar één
// vorm te kennen. Bij hout blijven `tw_mm`/`tf_mm` leeg en `klasse` `None`.

/// De hoofdmaten van één doorsnede langs een verlopende staaf, in mm.
/// `tw_mm` en `tf_mm` alleen bij een gelast I-profiel (staal).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct VerloopMaten {
    pub h_mm: f64,
    pub b_mm: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tw_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tf_mm: Option<f64>,
}

/// De unity check van één doorsnedetoets op één toetsdoorsnede. `uc` is
/// `None` als de toets daar niet is gerekend (geweigerd, of niet van
/// toepassing op die plek) — dat is geen 0,00.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct ToetsUc {
    /// Het toets-id zoals het in `checks` staat ("6.2.5_bending_y", "6.1.6_bending").
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub uc: Option<f64>,
}

/// Eén toetsdoorsnede: waar hij ligt, welke maten daar gelden en wat elke
/// doorsnedetoets daar geeft (de hoogste unity check over de combinaties op
/// dat rekenpunt).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct Toetsdoorsnede {
    /// Positie langs de staaf (mm vanaf x = 0), het REKENPUNT dat het dichtst
    /// bij de gevraagde plaats ligt — niet per se precies k·L/5.
    pub x_mm: f64,
    /// Relatieve positie t = x/L.
    pub t: f64,
    pub maten: VerloopMaten,
    /// Doorsnede-oppervlak op deze plek (mm²).
    pub area_mm2: f64,
    /// Weerstandsmoment om y op deze plek (mm³): W_pl,y bij staal, W_el,y bij hout.
    pub w_y_mm3: f64,
    /// Doorsnedeklasse op deze plek (staal): de ongunstigste over de
    /// combinaties op dit rekenpunt. `None` bij hout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub klasse: Option<CrossSectionClass>,
    pub toetsen: Vec<ToetsUc>,
}

/// Het maatgevende punt over alle doorsnedetoetsen en alle rekenpunten.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct MaatgevendPunt {
    pub toets_id: String,
    pub uc: f64,
    pub doorsnede: Toetsdoorsnede,
}

/// De doorsnede waarmee één stabiliteitstoets is gerekend, en waarom die.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct StabiliteitsDoorsnede {
    pub toets_id: String,
    /// Het veld waarvoor deze doorsnede geldt (bij kip: het kipveld), als
    /// tekst voor het rapport; leeg als het de hele staaf is.
    pub veld: String,
    pub x_mm: f64,
    pub maten: VerloopMaten,
    pub area_mm2: f64,
    pub w_y_mm3: f64,
    pub reden: String,
}

/// Alles wat het rapport over een verlopende staaf moet tonen.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct VerloopRapport {
    pub begin_naam: String,
    pub eind_naam: String,
    pub begin: VerloopMaten,
    pub eind: VerloopMaten,
    /// Aantal rekenpunten (unieke posities) waarop de doorsnedetoetsen zijn uitgevoerd.
    pub aantal_rekenpunten: u32,
    /// De zes toetsdoorsneden op x ≈ 0, L/5, …, L (het dichtstbijzijnde rekenpunt).
    pub toetsdoorsneden: Vec<Toetsdoorsnede>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub maatgevend: Option<MaatgevendPunt>,
    pub stabiliteit: Vec<StabiliteitsDoorsnede>,
    /// Toelichtingen bij het verloop als geheel (gelaste aanname, f_y-dikte, …).
    pub notities: Vec<String>,
}
