//! Invoertypen voor de beton-orchestrator.

use mechanics::ForcePoint;
use nen_en_1992_1_1::mnkappa::DEFAULT_N_STRIPS;
use nen_en_1992_1_1::slankheid::StructuralSystem;
use nen_en_1992_1_1::{
    ConcreteCoverRequest, ConcreteSectionInput, CoverSide, DesignSituation, ExposureClass,
    ReinforcementCage, ReinforcementZones, SteelBranch, StructuralClass,
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
    ///
    /// Dit is de korf die geldt waar `reinforcement_zones` niets zegt — dus bij
    /// lege zonelijsten over de hele staaf.
    pub cage: ReinforcementCage,
    /// De wapening die LANGS de staaf verandert: welke staaflaag van waar tot
    /// waar loopt (§9.2.1.3) en waar de beugels dichter staan (§9.2.2).
    ///
    /// Dit veld staat NAAST `cage` en niet erin. `ReinforcementCage` is `Copy`
    /// en beschrijft één doorsnede; hij wordt op tientallen plaatsen
    /// doorgegeven waar alleen die doorsnede nodig is (buiging, M-N-κ,
    /// scheurwijdte, de twee tekenkanten). Een lengte-as in dat type zou zich
    /// door al die signaturen heen planten en het bovendien zijn `Copy` kosten.
    /// Zie [`ReinforcementZones`] voor waarom het twee gescheiden lijsten zijn
    /// en niet één.
    ///
    /// **LEEG (of weggelaten) = het gedrag van vóór dit veld**: dan geldt
    /// `cage` onveranderd over de hele staaf. Dat is geen bijkomstigheid maar
    /// de voorwaarde waaronder dit veld erbij mocht: geen enkele bestaande
    /// toets verandert erdoor.
    #[serde(default)]
    pub reinforcement_zones: ReinforcementZones,
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

    /// Milieuklasse van dit ELEMENT (tabel 4.1) — de ingang van tabel 7.1N
    /// voor w_max. `None` = niet opgegeven; §7.3 kan dan niet.
    ///
    /// # Dit is de klasse van het element, niet van één oppervlak
    ///
    /// 4.4.1.1(1)P meet de betondekking tot "het dichtstbijzijnde
    /// betonoppervlak", en een balk heeft er vier. Een klasse PER ZIJDE staat
    /// daarom bij de korf: [`ReinforcementCage::cover_top`],
    /// `cover_bottom` en `cover_sides` dragen elk een eigen milieuklasse en een
    /// eigen dekking. Dit veld is wat daar de terugval voor is — zie
    /// [`Self::exposure_at`] — en tegelijk de klasse waarmee §7.3 werkt.
    ///
    /// Waarom §7.3 het ELEMENT neemt en niet de trekzijde: tabel 7.1N (in de
    /// versie van de nationale bijlage bij 7.3.1(5)) geeft w_max per
    /// milieuklasse, en de scheurwijdte wordt aan de trekzijde beoordeeld. Wie
    /// die koppeling per zijde wil leggen, moet 7.3 de zijde van het
    /// maatgevende momentteken laten kiezen; dat gebeurt hier nog niet, en de
    /// scheurtoets houdt dus deze ene klasse aan.
    #[serde(default)]
    #[ts(optional)]
    pub exposure_class: Option<ExposureClass>,

    /// Constructieklasse S1…S6 van dit ELEMENT (4.4.1.2(5)).
    ///
    /// `None` = de waarde van de nationale bijlage: "Als constructieklasse voor
    /// een ontwerplevensduur van 50 jaar moet S4 zijn aangehouden." Anders dan
    /// bij de milieuklasse is er hier dus wél een voorgeschreven waarde, en zij
    /// staat met zoveel woorden in de norm.
    ///
    /// De klasse staat NIET per zijde. De vijf criteria van de door de
    /// nationale bijlage vervangen tabel 4.3N — ontwerplevensduur 100 jaar,
    /// ontwerplevensduur 75 jaar, sterkteklasse, element met plaatgeometrie en
    /// gewaarborgde kwaliteitsbeheersing — zijn alle vijf een eigenschap van
    /// het element; zie [`StructuralClass`] voor de uitwerking en de ene
    /// nuance daarbij.
    #[serde(default)]
    #[ts(optional)]
    pub structural_class: Option<StructuralClass>,

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

impl ConcreteBeamCheckInput {
    /// De milieuklasse die aan één betonoppervlak geldt: die van de zijde zelf,
    /// en anders die van het element (4.4.1.1(1)P met (4.2)).
    ///
    /// Eén plek waar die terugval wordt gemaakt, zodat de dekkingstoets, de
    /// tekening en het rapport niet elk hun eigen versie krijgen. `None` =
    /// nergens een klasse opgegeven; dan is er geen c_min,dur en meldt de toets
    /// dat hij niet kan.
    pub fn exposure_at(&self, side: CoverSide) -> Option<ExposureClass> {
        self.cage.exposure_at(side, self.exposure_class)
    }

    /// De dekkingsverzoeken voor alle drie de zijden, klaar voor
    /// [`nen_en_1992_1_1::dekking::concrete_cover_request`].
    ///
    /// Zijden zonder milieuklasse leveren geen verzoek op: zonder klasse is er
    /// geen ingang in tabel 4.4N en dus niets te toetsen. Er wordt niets
    /// aangenomen — dezelfde afspraak als bij elk ander ontbrekend gegeven in
    /// dit type.
    ///
    /// De aanhechtingseis c_min,b (tabel 4.2) krijgt PER ZIJDE de staaf die
    /// daar werkelijk ligt: boven de bovenwapening, onder de onderwapening. Bij
    /// de zijkanten is dat de dikste van de twee — beide rijen raken met hun
    /// buitenste staaf de zijkant.
    pub fn cover_requests(&self) -> Vec<ConcreteCoverRequest> {
        let dikste = self.cage.top.diameter_mm.max(self.cage.bottom.diameter_mm);
        CoverSide::ALL
            .iter()
            .filter_map(|&side| {
                let klasse = self.exposure_at(side)?;
                let phi = match side {
                    CoverSide::Top => self.cage.top.diameter_mm,
                    CoverSide::Bottom => self.cage.bottom.diameter_mm,
                    CoverSide::Sides => dikste,
                };
                Some(ConcreteCoverRequest {
                    beam_id: self.beam_id,
                    side: Some(side),
                    exposure_class: klasse,
                    structural_class: self.structural_class,
                    cover_mm: self.cage.cover_at_mm(side),
                    stirrup_diameter_mm: self.cage.stirrup_diameter_mm,
                    max_bar_diameter_mm: phi,
                })
            })
            .collect()
    }
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
