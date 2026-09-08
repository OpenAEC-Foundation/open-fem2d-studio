//! Het segmentspoor van de fysisch niet-lineaire tweede orde, zoals het de
//! PDF-invoer binnenkomt.
//!
//! # Waarom dit type bestaat
//!
//! De rekengang in de frontend lost per belastingcombinatie een lus op:
//! raamwerk oplossen → per segment (N, M) naar `concrete_check::segments` →
//! nieuwe EI terug → opnieuw oplossen. Van die lus gebruikt de krachtsverdeling
//! alleen het eindresultaat. Alles waarmee die krachtsverdeling NAVERTELD kan
//! worden — de segmentindeling, de (N, M) per segment, M0, de kromming, de
//! secans-EI, de gescheurde segmenten, de meldingen van de kern en het
//! convergentieverloop — zat tot nu toe alleen in het live rapport.
//!
//! Dit is de PDF-kant van datzelfde spoor. De vorm volgt bewust
//! `design-mockup/src/stores/betonStijfheidStore.ts` op de voet: dezelfde
//! velden, dezelfde namen, dezelfde betekenis. Wie daar iets wijzigt, ziet
//! hier meteen wat er mee moet, en de frontend-bouwer is dan bijna een
//! identiteitsafbeelding.
//!
//! # Wat er BOVENOP de store in zit, en waarom
//!
//! [`BetonStaafDoorsnede`] staat niet in de store maar wel in de INVOER van de
//! kernaanroep (`SegmentStiffnessRequest::section` / `::cage`). Het antwoord
//! draagt de doorsnede alleen als NAAM ("300 x 500") en de korf alleen als
//! zin ("onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm"). Om te kunnen
//! TEKENEN moeten die twee weer uit elkaar; de frontend doet dat met één
//! reguliere expressie (`betonDoorsnedeTerugval.ts`), gedeeld door het live
//! rapport en de PDF-invoer.
//!
//! Hier wordt niet geparsed, en dat is een besluit en geen omissie. Een tweede
//! parser op een zin die de kern zélf samenstelt is precies het soort dubbele
//! waarheid dat dit project elders bewust vermijdt: hij zou bij de eerste
//! wijziging van `summary()` stilzwijgend een andere doorsnede tekenen dan het
//! scherm. Daarom reizen de doorsnede en de korf als GEGEVEN mee, en levert de
//! frontend ze bij elk analysetype aan — na een fysische ronde uit de
//! kernaanroep zelf, en anders uit die ene terugval.
//!
//! # Wat "gedeeld" hier wél en niet betekent
//!
//! Eén gedeelde functie garandeert pas hetzelfde beeld als beide kanten er
//! hetzelfde in stoppen. De terugval kent twee bronnen voor de korf: de EXACTE
//! korf uit het model, en anders de samenvattingsregel hierboven (afgerond op
//! één decimaal door `fmt_mm`). Het live rapport in het hoofdvenster heeft
//! modelstate en geeft die exacte korf mee; het losgekoppelde rapportvenster
//! heeft die niet en leest de regel. De PDF-invoer draagt de korven daarom
//! sinds kort óók (`RapportPdfBronnen::korvenUitModel`, gevuld uit dezelfde
//! staafeigenschappen): levert de aanroeper ze aan, dan tekenen scherm en
//! papier aantoonbaar hetzelfde; laat hij ze weg, dan staat het papier gelijk
//! aan het losgekoppelde venster en zit het verschil hoogstens in die
//! afronding. Dat is de hele belofte — niet meer, en het is er nu ook een die
//! klopt.
//!
//! Eén staaf hoort hier NIET in te staan: die waarvoor de kern geen toets kon
//! leveren. In zo'n resultaat komen de doorsnedenaam en de wapeningsregel uit
//! de invoer die de kern juist niet kon verwerken; de terugval zou er een
//! keurige figuur van maken naast een staaf waarover niets is vastgesteld.
//! `doorsnedenVoorFiguren` slaat die staaf daarom over, en dit hoofdstuk meldt
//! zelf dat er geen doorsnede is meegestuurd.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use concrete_check::segments::SegmentStiffnessResponse;
use nen_en_1992_1_1::section::{ConcreteSectionInput, ReinforcementCage};
use nen_en_1992_1_1::stress_strain::NonlinearBasis;

/// Eén ronde van de lus — spiegel van `StijfheidRonde` in de store.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct StijfheidRonde {
    /// 1-gebaseerd; ronde 0 is de indeling en telt niet als oplossing mee.
    pub ronde: u32,
    /// De grootste relatieve verandering van EI over alle staven en segmenten.
    /// Leeg in de eerste ronde: er is dan niets om tegen te vergelijken.
    #[serde(default)]
    pub max_relatieve_verandering: Option<f64>,
    /// Zeiden ALLE staven van de kern dat deze ronde geconvergeerd is?
    pub geconvergeerd: bool,
}

/// De doorsnede en de wapeningskorf van één betonstaaf — wat de figuren nodig
/// hebben en wat het toetsresultaat niet draagt. Spiegel van
/// `BetonSegmentStaaf` in `design-mockup/src/lib/betonStijfheid.ts`, beperkt
/// tot wat er getekend wordt.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BetonStaafDoorsnede {
    pub beam_id: u32,
    /// De doorsnede zoals de kern hem heeft gekregen — bij een T of een L dus
    /// mét de meewerkende flensbreedte die er werkelijk in zat.
    pub doorsnede: ConcreteSectionInput,
    pub korf: ReinforcementCage,
}

/// Een betonstaaf die NIET meerekende, met de reden. Spiegel van `CheckSkip`.
///
/// Zonder deze lijst zou het hoofdstuk stilzwijgend over een betonstaaf heen
/// stappen, en dat is erger dan een lange lijst: de lezer ziet dan niet dat
/// die staaf de ongescheurde stijfheid heeft gehouden.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct OvergeslagenStaaf {
    pub beam_id: u32,
    /// Woordelijk de reden die de frontend heeft vastgesteld.
    pub reden: String,
}

/// Wat één belastingcombinatie fysisch niet-lineair opleverde — spiegel van
/// `StijfheidCombinatie` in de store.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct StijfheidCombinatie {
    pub combinatie_id: u32,
    pub combinatie_naam: String,
    /// De variant waarmee de kern gerekend heeft: UGT-combinaties met
    /// rekenwaarden, BGT-combinaties met gemiddelde waarden. Staat óók per
    /// segment in het antwoord — de norm laat dat nooit impliciet.
    pub grenstoestand: NonlinearBasis,
    /// Aantal opgeloste raamwerkstelsels (ronde 0, de indeling, telt niet mee).
    pub ronden: u32,
    /// Het convergentieverloop, op volgorde.
    pub verloop: Vec<StijfheidRonde>,
    /// De kernantwoorden van de LAATSTE ronde, per staaf — de rapporttabel.
    pub staven: Vec<SegmentStiffnessResponse>,
}

/// Het hele spoor van één rekengang — spiegel van `BetonStijfheidState`.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BetonStijfheidSpoor {
    /// De gewenste segmentlengte waarmee gerekend is, mm.
    pub segment_lengte_mm: f64,
    /// Per combinatie het spoor; leeg zolang er niet fysisch gerekend is.
    #[serde(default)]
    pub combinaties: Vec<StijfheidCombinatie>,
    /// Betonstaven die niet meerekenden, met de reden.
    #[serde(default)]
    pub overgeslagen: Vec<OvergeslagenStaaf>,
    /// De doorsnede en korf per meerekenende staaf — alleen voor de figuren.
    #[serde(default)]
    pub staafdoorsneden: Vec<BetonStaafDoorsnede>,
}

impl BetonStijfheidSpoor {
    /// De doorsnede en korf van staaf `beam_id`, als ze meegestuurd zijn.
    pub fn doorsnede(&self, beam_id: u32) -> Option<&BetonStaafDoorsnede> {
        self.staafdoorsneden.iter().find(|d| d.beam_id == beam_id)
    }

    /// Is er werkelijk fysisch niet-lineair gerekend? Een spoor met alleen
    /// overgeslagen staven telt niet: dan is er niets na te vertellen.
    pub fn heeft_ronden(&self) -> bool {
        self.combinaties.iter().any(|c| !c.staven.is_empty())
    }
}
