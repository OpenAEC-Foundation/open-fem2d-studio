//! Invoertypen voor de hout-orchestrator.

use mechanics::ForcePoint;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1995_1_1::stability::{LtbLoadCase, LtbLoadPosition};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use serde::{Deserialize, Serialize};
use steel_check::CustomSection;
use ts_rs::TS;

use crate::belastingduur::CombinationLoadDuration;

fn default_one() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

fn default_noemer_fin() -> f64 {
    nen_en_1995_1_1::deflection::NOEMER_W_FIN
}

fn default_noemer_add() -> f64 {
    nen_en_1995_1_1::deflection::NOEMER_W_ADD
}

fn default_ltb_load_case() -> LtbLoadCase {
    LtbLoadCase::UniformLoad
}

fn default_ltb_load_position() -> LtbLoadPosition {
    LtbLoadPosition::CentreOfGravity
}

/// Invoer voor één houten staaf (rechthoekige doorsnede b × h).
///
/// `deny_unknown_fields`: een onbekend veld is een FOUT en geen ruis. Zeventien
/// velden hieronder hebben een standaardwaarde, en zonder deze regel viel een
/// tikfout in zo'n veldnaam stil terug op die standaard. Gemeten: `kcr` in
/// plaats van `k_cr` gaf dwarskracht-UC 1,066 in plaats van 1,591, en
/// `deflection_quasi_perm_m` liet de kruipterm k_def·w_qp van §7.2 wegvallen
/// (w_fin-UC 0,788 in plaats van 1,143) — beide zonder melding. Staal
/// (`BeamCheckInput`) en beton (`ConcreteBeamCheckInput`) weigerden al.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct TimberBeamCheckInput {
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
    /// Doorsnedebreedte b in mm. Bij een samengestelde doorsnede
    /// (`custom_section`) de omhullende breedte; de toetsing rekent dan met
    /// de grootheden uit die doorsnede en niet met b x h.
    pub width_mm: f64,
    /// Doorsnedehoogte h in mm (buiging om de sterke as).
    pub height_mm: f64,
    /// Een samengestelde doorsnede uit de profieleditor, als lamellen.
    ///
    /// WAAROM DIT VELD ER IS
    /// Zonder dit veld kan alleen een rechthoek b x h worden getoetst, en dat
    /// is niet alleen een gemis maar een gevaar. Wie een samengestelde ligger
    /// (flenzen 1000 x 40, lijf 71 x 40, h = 120) als "1000x120" invoert,
    /// krijgt bij de dwarskrachttoets van art. 6.1.7 een schuifspanning die
    /// ruim een orde van grootte te laag is: die toets hoort met de breedte
    /// van het LIJF en met de eigen S en I te rekenen, niet met b x h.
    ///
    /// De grootheden worden uit de lamellen berekend door `section-properties`
    /// -- dezelfde motor die de profieleditor gebruikt -- inclusief de
    /// maatgevende schuifvezel. Zit er geen lamel in (een catalogusdeel, of
    /// alleen kant-en-klare eigenschappen), dan is er geen contour om een
    /// breedte op te meten en weigert de toetsing met een melding.
    ///
    /// Weglaten = rechthoek b x h, precies zoals voorheen. `#[ts(optional)]`
    /// zodat het veld ook in TypeScript weglaatbaar is en de bestaande
    /// bouwers ongewijzigd blijven compileren -- dezelfde afspraak als bij
    /// `BeamCheckInput::custom_section` van de staaltoetsing.
    #[serde(default)]
    #[ts(optional)]
    pub custom_section: Option<CustomSection>,
    /// Sterkteklasse, bijv. "C24" (EN 338) of "GL28h" (EN 14080).
    pub strength_class: String,
    /// Klimaatklasse (service class) §2.3.1.3.
    pub service_class: ServiceClass,
    /// Belastingduurklasse (§2.3.1.2) voor de hele omhullende, en de TERUGVAL
    /// voor een combinatie die niet in [`Self::load_duration_per_combination`]
    /// staat.
    ///
    /// LET OP: zonder die lijst geldt deze ene klasse voor ALLE
    /// UGT-combinaties. §3.1.3(2) wil de kortste belastingsduur PER
    /// combinatie; met één klasse wordt de combinatie met alleen de blijvende
    /// belasting dus niet met k_mod "blijvend" getoetst.
    pub load_duration: LoadDurationClass,
    /// De belastingduurklasse per UGT-combinatie (§3.1.3(2)).
    ///
    /// Gevuld: de kern groepeert de omhullende per klasse, toetst elke klasse
    /// met haar eigen k_mod en neemt per toets de hoogste unity check. Leeg
    /// (of weggelaten): het gedrag van vóór dit veld, met `load_duration` voor
    /// alles. Zie `crate::belastingduur`.
    #[serde(default)]
    #[ts(as = "Option<Vec<CombinationLoadDuration>>", optional)]
    pub load_duration_per_combination: Vec<CombinationLoadDuration>,
    /// Staaflengte in m.
    pub length_m: f64,
    /// Krachtsverloop (envelop) langs de staaf; N drukt negatief.
    pub forces_envelope: Vec<ForcePoint>,
    /// Kniklengte om de sterke y-as (m) — knik IN het vlak van het model.
    ///
    /// `0` of weglaten = niet opgegeven: de kern houdt de staaflengte aan en
    /// zegt dat in de afleiding ("staaflengte (terugval)"). Negatief of niet
    /// eindig wordt genegeerd mét een kanttekening.
    #[serde(default)]
    pub buckling_length_y_m: f64,
    /// Kniklengte om de zwakke z-as (m) — knik UIT het vlak van het model.
    ///
    /// `0` of weglaten = niet opgegeven. De kern leidt L_cr,z dan af uit
    /// [`Self::lateral_bracing`], maar alleen op plaatsen waar een steun aan
    /// de boven- ÉN aan de onderrand zit; anders geldt de staaflengte. De
    /// gebruikte waarde en haar herkomst staan in de kolomtoets en in de
    /// drukterm van de kiptoets.
    #[serde(default)]
    pub buckling_length_z_m: f64,
    /// Zijdelingse steunen als fracties van de staaflengte, per rand — dezelfde
    /// vorm als bij staal (`top_flange_positions` = bovenrand,
    /// `bottom_flange_positions` = onderrand).
    ///
    /// ALLEEN voor de kniklengte om de z-as. De kiptoets van art. 6.3.3 rekent
    /// met zijn eigen [`Self::ltb_segment_length_m`] en leidt niets uit deze
    /// posities af; dat besluit is bewust en blijft staan (zie de toelichting
    /// bij dat veld in de invoerbouwer).
    ///
    /// Weglaten = geen steunen, dus geen afleiding.
    #[serde(default)]
    #[ts(optional)]
    pub lateral_bracing: Option<LateralBracing>,
    /// Kipsteunafstand (m) voor tabel 6.1; 0 → staaflengte.
    #[serde(default)]
    pub ltb_segment_length_m: f64,
    /// Belastinggeval voor l_ef (tabel 6.1).
    #[serde(default = "default_ltb_load_case")]
    pub ltb_load_case: LtbLoadCase,
    /// Aangrijpingspunt van de belasting (tabel 6.1, voetnoot).
    #[serde(default = "default_ltb_load_position")]
    pub ltb_load_position: LtbLoadPosition,
    /// Expliciete effectieve kiplengte in m; 0 → berekenen via tabel 6.1.
    #[serde(default)]
    pub ltb_effective_length_override_m: f64,
    /// Kiptoets §6.3.3 uitvoeren. `false` betekent: de gedrukte rand is over
    /// de volle lengte zijdelings gesteund en de opleggingen zijn torsievast,
    /// zodat k_crit = 1,0 (art. 6.3.3(5)). De toets wordt dan niet stil
    /// weggelaten maar als `NotApplicable` met die reden in het resultaat
    /// gezet. De referentie-uitwerking voert 6.3.3 alleen voor de ligger uit,
    /// niet voor de kolommen.
    #[serde(default = "default_true")]
    pub perform_ltb_check: bool,
    /// Scheurfactor k_cr voor dwarskracht (6.13a), bereik (0, 1]. 1,0 is de
    /// waarde van NEN-EN 1995-1-1/NB bij 6.1.7 voor een prismatische
    /// doorsnede en de standaard; de in 6.1.7(2) aanbevolen waarde is 0,67.
    /// Alleen bij een rechthoek gelezen; bij een samengestelde doorsnede
    /// bepaalt de kern k_cr zelf (`shear::k_cr_nb`).
    #[serde(default = "default_one")]
    pub k_cr: f64,
    /// Lastverdelend systeem aanwezig → k_sys = 1,1 (§6.6).
    #[serde(default)]
    pub load_sharing: bool,
    /// Zakking onder de karakteristieke BGT-combinatie (mm, negatief = omlaag).
    #[serde(default)]
    pub deflection_inst_mm: f64,
    /// Zakking onder de quasi-blijvende BGT-combinatie (mm).
    #[serde(default)]
    pub deflection_quasi_perm_mm: f64,
    /// Zakking onder de blijvende BGT-combinatie (mm).
    #[serde(default)]
    pub deflection_permanent_mm: f64,
    /// Noemer voor w_fin (L/n), NB-standaard 250.
    #[serde(default = "default_noemer_fin")]
    pub deflection_limit_fin: f64,
    /// Noemer voor w_add (L/n), NB-standaard 333.
    #[serde(default = "default_noemer_add")]
    pub deflection_limit_add: f64,
    /// Vrije toelichtingen bij de doorbuigingstoets, die letterlijk in de
    /// `notes` van de w_fin-regel van het rapport belanden.
    ///
    /// Waarom dit bestaat: `deflection_quasi_perm_mm` is een kaal getal, en de
    /// kern kan niet zien uit welke belastingscombinatie het komt. De bouwer
    /// die de invoer samenstelt weet dat wél — of hij weet juist dat hij de
    /// quasi-blijvende combinatie NIET heeft kunnen vinden en op de volle last
    /// is teruggevallen. Zonder dit kanaal zou zo'n terugval onzichtbaar zijn,
    /// en een onzichtbare aanname is geen aanname maar een fout in wording.
    #[serde(default)]
    pub deflection_notes: Vec<String>,
    /// Toelichtingen bij de STAAF ALS GEHEEL, letterlijk bij de kolomtoets
    /// (art. 6.3.2), de kiptoets (art. 6.3.3) en de eindzakking gezet; rekenen
    /// nergens mee. De bouwer zet hier wat hij van de staaf weet en de kern
    /// niet: dat een door tussenknopen geknipte staaf als één doorgaande lijn
    /// is getoetst, over welke lengte, en welke tussenknopen niet als steun
    /// tellen. `None` of leeg = niets te melden.
    #[serde(default)]
    #[ts(optional)]
    pub staaf_notities: Option<Vec<String>>,
    /// Breedte b aan het EIND van de staaf (x = L) van een VERLOPENDE staaf;
    /// [`Self::width_mm`] is dan de breedte aan het begin (x = 0).
    ///
    /// Samen met [`Self::height_end_mm`]: ontbreken ze allebei (of zijn ze
    /// gelijk aan begin), dan is de staaf prismatisch en verandert er niets
    /// aan de bestaande toetsing, tot op het laatste getal. Staat er één van
    /// beide, dan houdt de andere maat zijn beginwaarde.
    ///
    /// De KERN bepaalt per krachtpunt de plaatselijke rechthoek b(x) × h(x),
    /// toetst elke doorsnedetoets van §6.1 daarop — met k_h van §3.2(3)/3.3(3)
    /// uit de PLAATSELIJKE hoogte — en rekent de stabiliteitstoetsen van
    /// §6.3.2 en §6.3.3 veilig-zijdig met de kleinste doorsnede in het veld.
    /// Zie `crate::verlopend`.
    ///
    /// Een samengestelde doorsnede (`custom_section`) kan niet verlopen: dan
    /// wordt geweigerd met reden.
    #[serde(default)]
    #[ts(optional)]
    pub width_end_mm: Option<f64>,
    /// Hoogte h aan het EIND van de staaf (x = L); zie [`Self::width_end_mm`].
    ///
    /// Dit is de maat waar het bij een afgezaagde balklaag om gaat: de
    /// rekenhoogte verloopt over de overspanning, en k_h verloopt mee.
    #[serde(default)]
    #[ts(optional)]
    pub height_end_mm: Option<f64>,
}
