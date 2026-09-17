//! Invoertypen voor de beton-orchestrator.

use mechanics::{ForcePoint, Staafstand};
use nen_en_1992_1_1::mnkappa::DEFAULT_N_STRIPS;
use nen_en_1992_1_1::slankheid::StructuralSystem;
use nen_en_1992_1_1::{
    ConcreteCoverRequest, ConcreteSectionInput, CoverSide, DesignSituation, ExposureClass,
    ReinforcementCage, ReinforcementZones, SteelBranch, StructuralClass,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::kolom::ConcreteColumnInput;

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
    /// De nationale bijlage waarmee getoetst wordt.
    ///
    /// Zij bepaalt de nationaal bepaalde parameters van deze toetsing (zie de
    /// crate `nationale-bijlage`). Een bijlage die deze uitgave niet kent, wordt
    /// bij het lezen van de invoer GEWEIGERD met reden; er wordt nooit stil op
    /// de Nederlandse waarden teruggevallen.
    ///
    /// `#[serde(default)]` — en waarom dat hier geen stille keuze is: er is
    /// precies één gevulde rij, dus "veld weggelaten" kan niet iets anders
    /// betekenen dan die rij. Het houdt oude projectbestanden en oude
    /// MCP-cliënten aan de praat. Zodra er een tweede rij gevuld is, MOET deze
    /// regel weg; de test `zodra_er_een_tweede_bijlage_is_moet_de_serde_default_weg`
    /// in `nationale-bijlage` valt dan om en zegt dat.
    #[serde(default)]
    pub bijlage: nationale_bijlage::NationaleBijlage,
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

    /// Krachtsverloop onder de **quasi-blijvende** BGT-combinatie, NEN-EN 1990
    /// uitdrukking (6.16).
    ///
    /// Dit is de DERDE omhullende van dit type, en zij heeft een eigen taak.
    /// `forces_envelope` draagt de UGT; `sls_frequent_envelope` draagt (6.15)
    /// voor §7.3, omdat de nationale bijlage bij 7.3.1(5) de scheurwijdte
    /// onder de frequente combinatie beoordeeld wil hebben. Deze lijst draagt
    /// (6.16) voor M₀Eqp in (5.19) — de effectieve kruipcoëfficiënt van
    /// §5.8.4, die de norm uitdrukkelijk aan de QUASI-BLIJVENDE combinatie
    /// koppelt.
    ///
    /// De drie zijn niet uitwisselbaar en er is met opzet geen terugval van de
    /// een op de ander: (6.15) als (6.16) lezen geeft een te grote M₀Eqp en
    /// dus een te grote φ_ef, en andersom een te kleine. Is deze lijst leeg,
    /// dan blijft φ_ef onbekend, staat §5.8.3.1(1) A = 0,7 toe, en zegt de
    /// kruiptoets dat met de reden erbij.
    #[serde(default)]
    pub sls_quasi_permanent_envelope: Vec<ForcePoint>,

    /// De §5.8-gegevens: geschoord of ongeschoord, de kniklengte, de kruip en
    /// de twee keuzen die §9.5 nodig heeft.
    ///
    /// `None` = niet opgegeven. Staat er normaaldruk op de staaf, dan komt
    /// §5.8.3.1 als "niet uitgevoerd" in het rapport met de reden; staat er
    /// geen druk op, dan is §5.8 niet van toepassing en zegt de toets dát.
    /// Er wordt niets aangenomen — zie [`ConcreteColumnInput`] voor waarom
    /// geschoord en l₀ geen standaardwaarde mogen hebben.
    #[serde(default)]
    #[ts(optional)]
    pub column: Option<ConcreteColumnInput>,
    /// Hoe de staaf in het model staat — alleen voor de benaming van de zijden
    /// in de afleiding.
    ///
    /// De krachtenomhullende en de zones horen in de referentierichting van de
    /// staaf te staan: liggend van links naar rechts, staand van voet naar
    /// kop. "Onderwapening" en "bovenwapening" zijn dan bij een liggende staaf
    /// letterlijk; bij een staande staaf ligt de onderwapening RECHTS en de
    /// bovenwapening LINKS, en dat zet de kern er bij elke toets die een
    /// trekzijde kiest bij. `None` of weglaten = [`Staafstand::Liggend`].
    #[serde(default)]
    #[ts(optional)]
    pub staafstand: Option<Staafstand>,
    /// Kanttekeningen bij de staafstand die de BOUWER van de invoer opstelt. De
    /// kern zet ze letterlijk bij elke toets die een trekzijde kiest en bij de
    /// dekkingslijn, achter de zijden in wereldtermen, en rekent er nergens mee.
    ///
    /// WAAROM. Aan welke fysieke zijde de "bovenwapening" ligt, springt bij een
    /// naar links hellende staaf op 75° van het bovenvlak naar het ondervlak
    /// (zie `design-mockup/src/lib/referentierichting.ts`, DE SPRONG BIJ 75°).
    /// Of een staaf dicht bij die sprong ligt, weet alleen wie de meetkunde
    /// kent; de kern krijgt alleen de omhullende. Zonder dit kanaal zou de
    /// waarschuwing niet in de afleiding en niet in het rapport komen. `None` of
    /// een lege lijst = geen kanttekening.
    #[serde(default)]
    #[ts(optional)]
    pub staafstand_notities: Option<Vec<String>>,
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
        // De ZIJKANT wordt geraakt door de buitenste staaf van de boven- én
        // die van de onderrij, en — als de korf ze heeft — ook door de
        // zijstaven; die liggen immers per definitie tegen die rand. c_min,b
        // van tabel 4.2 is de diameter van de staaf die het oppervlak raakt,
        // dus de dikste van de drie.
        let dikste = self
            .cage
            .top
            .diameter_mm
            .max(self.cage.bottom.diameter_mm)
            .max(self.cage.side_row().diameter_mm);
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
                    // De bijlage van de staaf, niet een standaard: tabel 4.4N, de
                    // Δc-toeslagen en de constructieklasse bij 50 jaar horen bij
                    // de bijlage waarmee de staaf getoetst wordt (normnaad).
                    bijlage: self.bijlage,
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
    /// De nationale bijlage waarmee gerekend wordt (normnaad).
    ///
    /// Zij bepaalt γ_C, γ_S, α_cc en ε_ud van het materiaal (via
    /// `DesignMaterial::new`). Een bijlage die deze uitgave niet kent, wordt bij
    /// het lezen van het verzoek GEWEIGERD met reden; er wordt nooit stil op de
    /// Nederlandse waarden teruggevallen.
    ///
    /// `#[serde(default)]` om dezelfde reden als bij `ConcreteBeamCheckInput`:
    /// er is één gevulde rij, dus weglaten kan niets anders betekenen. De test
    /// `zodra_er_een_tweede_bijlage_is_moet_de_serde_default_weg` in
    /// `nationale-bijlage` valt om zodra dat niet meer waar is.
    #[serde(default)]
    pub bijlage: nationale_bijlage::NationaleBijlage,
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
