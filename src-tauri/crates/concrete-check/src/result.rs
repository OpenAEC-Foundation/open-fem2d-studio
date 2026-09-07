//! Resultaattypen voor de beton-orchestrator.

use nen_en_1992_1_1::{InteractionPoint, MnKappaDiagram};
use nen_en_1993_1_1_section::CheckStatus;
use serde::{Deserialize, Serialize};
use steel_check::NamedCheck;
use ts_rs::TS;

/// Volledig toetsresultaat van één betonnen staaf.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteBeamCheckResult {
    pub beam_id: u32,
    /// Doorsnedenaam, bijv. "300 x 500".
    pub section_name: String,
    /// De aannamen die bij DEZE DOORSNEDEVORM horen, woordelijk uit
    /// [`nen_en_1992_1_1::section::ConcreteSection::assumptions`]. Leeg bij een
    /// rechthoek.
    ///
    /// Dezelfde teksten staan óók vooraan in de `notes` van elke toets — daar
    /// horen ze, want ze gelden voor die toets. Maar een rapport dat ze per
    /// toets herhaalt, laat een lezer twee of drie keer dezelfde alinea zien en
    /// maakt niet zichtbaar dát het aannamen zijn. Met dit veld weet het rapport
    /// welke notes vormaannamen zijn, en kan het ze één keer tonen. Op tekst
    /// matchen zou breken zodra de kern één woord wijzigt.
    ///
    /// De tekst is de kernbron en mag niet vertaald of geherformuleerd worden:
    /// dat een L in dit uniaxiale model exact een T is omdat de zijdelingse
    /// kromming VERHINDERD wordt verondersteld, en dat de norm daar geen apart
    /// artikel voor geeft, is geen zin die in een tweede versie mag bestaan.
    #[serde(default)]
    pub shape_assumptions: Vec<String>,
    /// Betonsterkteklasse, bijv. "C30/37".
    pub concrete_class: String,
    /// Wapeningsstaal, bijv. "B500B".
    pub reinforcement_grade: String,
    /// "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".
    pub reinforcement_summary: String,
    pub a_s_bottom_mm2: f64,
    pub a_s_top_mm2: f64,
    /// Nuttige hoogte d van de onderwapening, mm.
    pub d_mm: f64,
    /// Rekenwaarden waarmee is getoetst.
    pub f_cd_mpa: f64,
    pub f_yd_mpa: f64,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
    /// M-κ-diagram bij de normaalkracht van het maatgevende M-N-punt.
    pub mn_kappa: Option<MnKappaDiagram>,
    /// N-M-interactiediagram (bezwijkomhullende) voor positief en negatief moment.
    pub interaction_positive: Vec<InteractionPoint>,
    pub interaction_negative: Vec<InteractionPoint>,
}

/// Antwoord op [`crate::MnKappaRequest`].
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct MnKappaResponse {
    pub section_name: String,
    pub reinforcement_summary: String,
    pub f_cd_mpa: f64,
    pub f_yd_mpa: f64,
    pub d_mm: f64,
    pub a_s_bottom_mm2: f64,
    pub a_s_top_mm2: f64,
    /// Drukcapaciteit N_Rd,c (kN, positief getal) en trekcapaciteit N_Rd,t.
    pub n_rd_compression_kn: f64,
    pub n_rd_tension_kn: f64,
    pub diagram: MnKappaDiagram,
    pub interaction_positive: Vec<InteractionPoint>,
    pub interaction_negative: Vec<InteractionPoint>,
}
