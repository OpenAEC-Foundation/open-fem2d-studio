//! Invoertypen voor de beton-orchestrator.

use mechanics::ForcePoint;
use nen_en_1992_1_1::mnkappa::DEFAULT_N_STRIPS;
use nen_en_1992_1_1::slankheid::StructuralSystem;
use nen_en_1992_1_1::{
    ConcreteSectionInput, DesignSituation, ExposureClass, ReinforcementCage, SteelBranch,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

fn default_n_strips() -> u32 {
    DEFAULT_N_STRIPS as u32
}

fn default_true() -> bool {
    true
}

/// Invoer voor één betonnen staaf: een doorsnede met een wapeningskorf.
///
/// `deny_unknown_fields`: een tikfout in een veldnaam met `#[serde(default)]`
/// zou anders stilzwijgend de standaardwaarde opleveren.
///
/// De doorsnede staat als één `section`-object in het verzoek en niet meer als
/// een losse breedte en hoogte. Dat is met opzet **geen** uitbreiding met
/// extra optionele velden naast de oude twee: dan zou een T te maken zijn door
/// alleen `h_f_mm` in te vullen en `shape` te vergeten, en zou de doorsnede
/// stilzwijgend een rechthoek blijven. Zie [`ConcreteSectionInput`].
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteBeamCheckInput {
    pub beam_id: u32,
    /// De doorsnede: rechthoek, T of L, met de maten die bij die vorm horen.
    pub section: ConcreteSectionInput,
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

    // ── Wat de toetsen buiten §6.1 nodig hebben ────────────────────────────
    //
    // Alle velden hieronder zijn optioneel en betekenen leeg NIET OPGEGEVEN.
    // Er wordt er nergens één ingevuld: de toets die het gegeven nodig heeft
    // meldt in het rapport dat hij niet kan, met de reden. Dat is met opzet —
    // een stilzwijgende milieuklasse of een aangenomen korrelafmeting stuurt
    // een grenswaarde zonder dat iemand het ziet.
    /// Krachtsverloop onder de **frequente** BGT-combinatie, NEN-EN 1990
    /// uitdrukking (6.15).
    ///
    /// De nationale bijlage bij 7.3.1(5) vervangt tabel 7.1N door een tabel
    /// waarvan alle drie de kolommen "Frequente belastingscombinatie" heten,
    /// waar de EN-tekst de quasi-blijvende combinatie noemt. §7.3 vraagt de
    /// staalspanning σ_s in de **gescheurde** doorsnede onder díe combinatie;
    /// die is uit de UGT-envelop niet af te leiden. Is deze lijst leeg, dan
    /// komen de scheurtoetsen als "niet uitgevoerd" in het rapport, met de
    /// reden — er wordt geen UGT-spanning voor in de plaats gezet.
    #[serde(default)]
    pub sls_frequent_envelope: Vec<ForcePoint>,

    /// Milieuklasse van dit element (tabel 4.1) — de ingang van tabel 7.1N
    /// voor w_max. `None` = niet opgegeven; §7.3 kan dan niet.
    #[serde(default)]
    #[ts(optional)]
    pub exposure_class: Option<ExposureClass>,

    /// Grootste nominale korrelafmeting d_g in mm, voor §8.2(2) en §9.2(1)e.
    ///
    /// `None` = niet opgegeven. De norm kent er **geen** aanbevolen waarde
    /// voor — d_g hoort bij de betonspecificatie — dus er wordt er ook geen
    /// aangenomen; zie [`nen_en_1992_1_1::detaillering::vrije_staafafstand_8_2`].
    #[serde(default)]
    #[ts(optional)]
    pub aggregate_size_mm: Option<f64>,

    /// De regel uit tabel 7.4N voor de slankheidstoets van 7.4.2.
    ///
    /// `None` = niet opgegeven. Dit is niet uit een raamwerkmodel af te
    /// leiden: of een staaf een eindveld, een tussenveld of een uitkraging is
    /// hangt van de constructie af en niet van de staaf. Zonder deze keuze
    /// blijft 7.4.2 ongetoetst, met de reden in het rapport.
    #[serde(default)]
    #[ts(optional)]
    pub structural_system: Option<StructuralSystem>,

    /// Werkelijke hart-op-hartafstand van de trekstaven in mm, voor (7.11) en
    /// tabel 7.3N.
    ///
    /// `None` = niet opgegeven; de orchestrator leidt hem dan af uit de korf
    /// (zuivere meetkunde, één rij, gelijkmatig verdeeld tussen de
    /// beugelbenen) en meldt dat in de afleiding.
    #[serde(default)]
    #[ts(optional)]
    pub bar_spacing_mm: Option<f64>,
}

/// Verzoek om het M-N-κ-diagram van een korf, los van een staaf.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct MnKappaRequest {
    /// De doorsnede: rechthoek, T of L, met de maten die bij die vorm horen.
    pub section: ConcreteSectionInput,
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
