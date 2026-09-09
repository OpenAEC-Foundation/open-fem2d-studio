//! `dekking` — de betondekking van 4.4.1: milieuklasse (tabel 4.1),
//! minimumdekking c_min (4.4.1.2) en de nominale dekking c_nom (4.4.1.1).
//!
//! Tot nu toe was `ReinforcementCage::cover_mm` een puur geometrisch gegeven:
//! het bepaalde de ligging van de staafassen en daarmee de nuttige hoogte d,
//! en verder niets. Wie 20 mm invulde bij XD3 kreeg een keurige M_Rd en geen
//! woord over duurzaamheid. Deze module toetst die invoer alsnog aan de norm.
//!
//! DE KETEN, met vindplaats per stap
//!
//! ```text
//! c_nom = c_min + Δc_dev                                          (4.1)   4.4.1.1(2)P
//! c_min = max{c_min,b ; c_min,dur + Δc_dur,γ − Δc_dur,st − Δc_dur,add ; 10 mm}
//!                                                                 (4.2)   4.4.1.2(2)P
//! ```
//!
//! * `c_min,b` — tabel 4.2: bij afzonderlijke staven de diameter van de staaf;
//!   bij gebundelde staven de gelijkwaardige diameter Ø_n (8.9.1);
//! * `c_min,dur` — tabel 4.4N voor betonstaal, per constructieklasse en
//!   milieuklasse. LET OP: de tabel uit de EN is door de Nederlandse
//!   nationale bijlage GESCHRAPT en vervangen; de waarden hieronder zijn de
//!   NB-versie ("welke tabel dan als volgt moet zijn gelezen (normatief)").
//!   De kolom XD3/XS3 verschilt daadwerkelijk van de EN-versie (25…50 in
//!   plaats van 30…55), dus de EN-tabel invullen zou hier fout zijn;
//! * `Δc_dur,γ`, `Δc_dur,st`, `Δc_dur,add` — 4.4.1.2(6), (7) en (8). De NB:
//!   "De waarde van … moet gelijk aan 0 mm zijn genomen", alle drie;
//! * `Δc_dev` — 4.4.1.3(1)P. De EN beveelt 10 mm aan; de NB schrijft voor:
//!   "De waarde van Δc dev moet gelijk aan 5 mm zijn genomen".
//!
//! WAT DEZE MODULE NIET DOET, en waarom niet
//!
//! * De constructieklasse wordt NIET afgeleid uit tabel 4.3N. Die tabel staat
//!   in de geraadpleegde uitgave alleen leesbaar tot en met de kolom XC4 — de
//!   kolommen XD/XS lopen buiten de bladspiegel en zijn ook in de tekstlaag
//!   afgekapt. Een classificatie die op onleesbare kolommen berust zou een
//!   verzonnen classificatie zijn. De klasse is daarom invoer, met S4 als
//!   uitgangspunt: de NB bepaalt "Als constructieklasse voor een
//!   ontwerplevensduur van 50 jaar moet S4 zijn aangehouden. Als minimale
//!   constructieklasse moet S1 zijn aangehouden."
//! * De klassen XF1…XF4 en XA1…XA3 komen in tabel 4.4N niet voor en krijgen
//!   dus GEEN c_min,dur. Dat is geen omissie van deze module maar van de
//!   tabel: 4.4.1.2(12) verwijst voor vorst/dooi en chemische aantasting naar
//!   de betonsamenstelling (hoofdstuk 6 van EN 206-1) en zegt "In het algemeen
//!   zal een dekking in overeenstemming met 4.4 in dergelijke situaties
//!   voldoende zijn". Bij zo'n klasse blijft alleen de aanhechtingseis en de
//!   ondergrens van 10 mm over, en dat staat met zoveel woorden in het
//!   antwoord.
//! * De toeslag van 5 mm op c_min,b bij een korrelafmeting groter dan 32 mm
//!   (voetnoot bij tabel 4.2), de 5 mm bij oneffen oppervlakken (4.4.1.2(11))
//!   en de afslijtingsklassen XM1…XM3 (4.4.1.2(13); de NB zet k₁ = k₂ = k₃ =
//!   0 mm) blijven buiten beschouwing — daarvoor zou de invoer gegevens
//!   moeten dragen die het model niet heeft.
//! * Voorspanstaal (tabel 4.5N) blijft buiten beschouwing: dit model kent
//!   alleen slappe wapening.
//!
//! DE DEKKING IS EEN UITSPRAAK PER BETONOPPERVLAK, NIET PER ELEMENT
//!
//! 4.4.1.1(1)P: "De betondekking is de afstand tussen het oppervlak van de
//! wapening en het dichtstbijzijnde betonoppervlak (inclusief beugels en
//! huidwapening voor zover van toepassing)." Er staat *het dichtstbijzijnde*
//! betonoppervlak — een balk heeft er vier, en (4.2) koppelt c_min,dur aan de
//! milieuklasse van dát oppervlak. Een vloer met de bovenzijde binnen (XC1) en
//! de onderzijde buiten (XC4) heeft dus twee verschillende c_min,dur en twee
//! verschillende dekkingen, en daarmee twee verschillende nuttige hoogtes.
//!
//! Deze rekengang blijft daarom bewust een berekening voor ÉÉN oppervlak:
//! [`ConcreteCoverRequest`] draagt één milieuklasse en één c_nom. Wie een
//! element per zijde wil toetsen, roept hem één keer per zijde aan; welke zijde
//! het is, zegt het optionele veld [`ConcreteCoverRequest::side`], zodat het
//! antwoord zichzelf kan benoemen. Er is met opzet geen tweede rekengang die
//! drie zijden tegelijk doet — dat zou dezelfde keten van (4.1) en (4.2) een
//! tweede keer opschrijven.
//!
//! Welke zijden er zijn en waarom het er drie zijn, staat bij [`CoverSide`].
//! Wat een zijde aan eigen gegevens draagt, staat bij [`FaceCover`]; dat type
//! hangt in [`crate::section::ReinforcementCage`], want de dekking is meetkunde
//! van de korf.
//!
//! De module is bereikbaar langs de drie wegen — Tauri-command, toetsbrug en
//! MCP-server — net als `beff`, en heeft daarom één rekengang
//! ([`concrete_cover_request`]) die alle drie aanroepen.

use nen_en_1993_1_1_section::CheckStatus;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ───────────────────────────────────────────────────────────────────────────
// Tabel 4.1 — de milieuklassen
// ───────────────────────────────────────────────────────────────────────────

/// Milieuklasse volgens tabel 4.1 ("Verband tussen milieuklassen en
/// milieu-omstandigheden volgens EN 206-1").
///
/// De volgorde is die van de tabel: eerst X0, dan de carbonatatieklassen, de
/// chlorideklassen, de zeewaterklassen, vorst/dooi en chemische aantasting.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum ExposureClass {
    X0,
    XC1,
    XC2,
    XC3,
    XC4,
    XD1,
    XD2,
    XD3,
    XS1,
    XS2,
    XS3,
    XF1,
    XF2,
    XF3,
    XF4,
    XA1,
    XA2,
    XA3,
}

/// Eén rij uit tabel 4.1, zoals de keuzelijst hem nodig heeft.
///
/// `description` is de kolom "Beschrijving van het milieu" en `examples` de
/// kolom "Informatieve voorbeelden waar de milieuklassen zich kunnen
/// voordoen"; beide woordelijk uit de tabel. `group` is het tussenkopje
/// waaronder de klasse in de tabel staat.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ExposureClassInfo {
    pub class: ExposureClass,
    /// "XC4" — de klasseaanduiding als tekst, voor labels en het rapport.
    pub name: &'static str,
    /// Het tussenkopje uit tabel 4.1, bijv. "2 Corrosie ingeleid door carbonatatie".
    pub group: &'static str,
    /// De kolom "Beschrijving van het milieu".
    pub description: &'static str,
    /// De kolom "Informatieve voorbeelden…"; regels gescheiden door " · ".
    pub examples: &'static str,
    /// De kolomaanduiding in tabel 4.4N, of `None` als de tabel de klasse niet
    /// kent (XF en XA).
    pub cover_column: Option<&'static str>,
}

/// Tabel 4.1, woordelijk. De beschrijvingen zijn overgenomen zoals ze in de
/// Nederlandstalige uitgave staan; ze worden nergens vertaald of ingekort,
/// want dan zou de app iets anders zeggen dan de norm.
pub const EXPOSURE_CLASSES: &[ExposureClassInfo] = &[
    ExposureClassInfo {
        class: ExposureClass::X0,
        name: "X0",
        group: "1 Geen risico op corrosie of aantasting",
        description: "Voor beton zonder wapening of ingestorte metalen: alle milieus, behalve bij \
                      vorst/dooi, afslijting of chemische aantasting. Voor beton met wapening of \
                      ingesloten metalen: zeer droog",
        examples: "Beton binnen gebouwen met zeer lage luchtvochtigheid",
        cover_column: Some("X0"),
    },
    ExposureClassInfo {
        class: ExposureClass::XC1,
        name: "XC1",
        group: "2 Corrosie ingeleid door carbonatatie",
        description: "Droog of blijvend nat",
        examples: "Beton binnen gebouwen met lage luchtvochtigheid · Beton blijvend onder water",
        cover_column: Some("XC1"),
    },
    ExposureClassInfo {
        class: ExposureClass::XC2,
        name: "XC2",
        group: "2 Corrosie ingeleid door carbonatatie",
        description: "Nat, zelden droog",
        examples: "Betonoppervlakken langdurig in contact met water · Veel funderingen",
        cover_column: Some("XC2/XC3"),
    },
    ExposureClassInfo {
        class: ExposureClass::XC3,
        name: "XC3",
        group: "2 Corrosie ingeleid door carbonatatie",
        description: "Matige vochtigheid",
        examples: "Beton binnen gebouwen met matige of hoge luchtvochtigheid · Beton buiten \
                   beschut tegen regen",
        cover_column: Some("XC2/XC3"),
    },
    ExposureClassInfo {
        class: ExposureClass::XC4,
        name: "XC4",
        group: "2 Corrosie ingeleid door carbonatatie",
        description: "Wisselend nat en droog",
        examples: "Betonoppervlakken in contact met water, maar die niet onder milieuklasse XC2 \
                   vallen",
        cover_column: Some("XC4"),
    },
    ExposureClassInfo {
        class: ExposureClass::XD1,
        name: "XD1",
        group: "3 Corrosie ingeleid door chloriden",
        description: "Matige vochtigheid",
        examples: "Betonoppervlakken blootgesteld aan chloriden uit de lucht",
        cover_column: Some("XD1/XS1"),
    },
    ExposureClassInfo {
        class: ExposureClass::XD2,
        name: "XD2",
        group: "3 Corrosie ingeleid door chloriden",
        description: "Nat, zelden droog",
        examples: "Zwembaden · Beton blootgesteld aan chloridehoudend industriewater",
        cover_column: Some("XD2/XS2"),
    },
    ExposureClassInfo {
        class: ExposureClass::XD3,
        name: "XD3",
        group: "3 Corrosie ingeleid door chloriden",
        description: "Wisselend nat en droog",
        examples: "Brugdelen blootgesteld aan chloridehoudend spatwater · Verhardingen · Vloeren \
                   van parkeerplaatsen voor voertuigen",
        cover_column: Some("XD3/XS3"),
    },
    ExposureClassInfo {
        class: ExposureClass::XS1,
        name: "XS1",
        group: "4 Corrosie ingeleid door chloriden afkomstig uit zeewater",
        description: "Blootgesteld aan zout uit de lucht, maar niet in direct contact met zeewater",
        examples: "Constructies bij of aan de kust",
        cover_column: Some("XD1/XS1"),
    },
    ExposureClassInfo {
        class: ExposureClass::XS2,
        name: "XS2",
        group: "4 Corrosie ingeleid door chloriden afkomstig uit zeewater",
        description: "Blijvend onder zeewater",
        examples: "Delen van constructies in zee",
        cover_column: Some("XD2/XS2"),
    },
    ExposureClassInfo {
        class: ExposureClass::XS3,
        name: "XS3",
        group: "4 Corrosie ingeleid door chloriden afkomstig uit zeewater",
        description: "Getijde-, spat- en stuifzones",
        examples: "Delen van constructies in zee",
        cover_column: Some("XD3/XS3"),
    },
    ExposureClassInfo {
        class: ExposureClass::XF1,
        name: "XF1",
        group: "5 Aantasting door vorst/dooi-wisselingen",
        description: "Niet volledig verzadigd met water, zonder dooizouten",
        examples: "Verticale betonoppervlakken blootgesteld aan regen en vorst",
        cover_column: None,
    },
    ExposureClassInfo {
        class: ExposureClass::XF2,
        name: "XF2",
        group: "5 Aantasting door vorst/dooi-wisselingen",
        description: "Niet volledig verzadigd met water, met dooizouten",
        examples: "Verticale betonoppervlakken van wegconstructies blootgesteld aan vorst en met \
                   de lucht meegevoerde dooizouten",
        cover_column: None,
    },
    ExposureClassInfo {
        class: ExposureClass::XF3,
        name: "XF3",
        group: "5 Aantasting door vorst/dooi-wisselingen",
        description: "Verzadigd met water, zonder dooizouten",
        examples: "Horizontale betonoppervlakken blootgesteld aan regen en vorst",
        cover_column: None,
    },
    ExposureClassInfo {
        class: ExposureClass::XF4,
        name: "XF4",
        group: "5 Aantasting door vorst/dooi-wisselingen",
        description: "Verzadigd met water, met dooizouten of zeewater",
        examples: "Wegen en brugdekken blootgesteld aan dooizouten · Betonoppervlakken \
                   blootgesteld aan direct gesproeide dooizouten en vorst · Spatzones van \
                   constructies in zee blootgesteld aan vorst",
        cover_column: None,
    },
    ExposureClassInfo {
        class: ExposureClass::XA1,
        name: "XA1",
        group: "6 Chemische aantasting",
        description: "Zwak agressief chemisch milieu volgens tabel 2 van EN 206-1",
        examples: "Natuurlijke grond en grondwater",
        cover_column: None,
    },
    ExposureClassInfo {
        class: ExposureClass::XA2,
        name: "XA2",
        group: "6 Chemische aantasting",
        description: "Matig agressief milieu volgens tabel 2 van EN 206-1",
        examples: "Natuurlijke grond en grondwater",
        cover_column: None,
    },
    ExposureClassInfo {
        class: ExposureClass::XA3,
        name: "XA3",
        group: "6 Chemische aantasting",
        description: "Sterk agressief milieu volgens tabel 2 van EN 206-1",
        examples: "Natuurlijke grond en grondwater",
        cover_column: None,
    },
];

impl ExposureClass {
    /// De rij uit tabel 4.1 die bij deze klasse hoort.
    pub fn info(self) -> &'static ExposureClassInfo {
        EXPOSURE_CLASSES
            .iter()
            .find(|i| i.class == self)
            .expect("elke milieuklasse staat in EXPOSURE_CLASSES")
    }

    /// "XC4".
    pub fn name(self) -> &'static str {
        self.info().name
    }

    /// De kolomindex in tabel 4.4N, of `None` bij XF en XA — die klassen staan
    /// niet in die tabel (4.4.1.2(12)).
    fn cover_column_index(self) -> Option<usize> {
        match self {
            ExposureClass::X0 => Some(0),
            ExposureClass::XC1 => Some(1),
            ExposureClass::XC2 | ExposureClass::XC3 => Some(2),
            ExposureClass::XC4 => Some(3),
            ExposureClass::XD1 | ExposureClass::XS1 => Some(4),
            ExposureClass::XD2 | ExposureClass::XS2 => Some(5),
            ExposureClass::XD3 | ExposureClass::XS3 => Some(6),
            ExposureClass::XF1
            | ExposureClass::XF2
            | ExposureClass::XF3
            | ExposureClass::XF4
            | ExposureClass::XA1
            | ExposureClass::XA2
            | ExposureClass::XA3 => None,
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// De zijden van de doorsnede
// ───────────────────────────────────────────────────────────────────────────

/// De zijde van de doorsnede waarop een dekking en een milieuklasse slaan.
///
/// # WAAROM DRIE ZIJDEN EN NIET TWEE OF VIER
///
/// Een balk heeft vier betonoppervlakken: boven, onder, links en rechts.
/// 4.4.1.1(1)P kent aan elk daarvan een eigen dekking toe. Toch zijn het er
/// hier drie, en dat is een keuze met een reden per variant.
///
/// * **Boven en onder apart — noodzakelijk.** Zij bepalen de ligging van de
///   staafas en daarmee de nuttige hoogte d van §1.6 ("effectieve hoogte van
///   een dwarsdoorsnede"). Boven- en onderwapening liggen aan verschillende
///   oppervlakken en kunnen dus in een verschillend milieu liggen; met één
///   dekking voor beide ligt de bovenwapening op de verkeerde plaats zodra de
///   bovenzijde een andere klasse heeft. Dat is precies het geval waarvoor dit
///   type bestaat.
/// * **De twee zijkanten samen — verantwoord.** In elke formule die de
///   zijdelingse dekking gebruikt komt zij uitsluitend als PAAR voor: de
///   dwarsafstand van de beugelbenen s_t = b_w − 2·c − Ø_beugel (§9.2.2(8)),
///   de vrije staafafstand van §8.2(2) en de binnenmaat waarin een rij staven
///   moet passen. Alleen de SOM van links en rechts telt daar. Links en rechts
///   uit elkaar trekken zou dus in geen enkele uitkomst zichtbaar worden — het
///   zou alleen de rij staven uit het midden schuiven, en die meetkunde
///   (staven scheef in de doorsnede) heeft dit model niet.
/// * **Vier zou een vierde invoerveld kosten** voor een onderscheid dat geen
///   getal verandert. Verschillen de twee zijkanten werkelijk van milieu, dan
///   is de zwaarste van de twee de juiste invoer; die keus is veilig en staat
///   in de invoerhulp.
///
/// De volgorde is die van de tekening: eerst boven, dan onder, dan de
/// zijkanten.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum CoverSide {
    /// De bovenzijde, z = h — de rand waar [`crate::section::ReinforcementCage::top`]
    /// tegenaan ligt.
    Top,
    /// De onderzijde, z = 0 — de rand waar [`crate::section::ReinforcementCage::bottom`]
    /// tegenaan ligt.
    Bottom,
    /// De twee verticale zijkanten samen; zie de toelichting hierboven.
    Sides,
}

impl CoverSide {
    /// Alle zijden, in de volgorde van de tekening.
    pub const ALL: [CoverSide; 3] = [CoverSide::Top, CoverSide::Bottom, CoverSide::Sides];

    /// Woordelijke aanduiding voor meldingen, de invoer en het rapport.
    pub fn label(self) -> &'static str {
        match self {
            CoverSide::Top => "bovenzijde",
            CoverSide::Bottom => "onderzijde",
            CoverSide::Sides => "zijkanten",
        }
    }
}

/// Wat één betonoppervlak aan EIGEN gegevens draagt: zijn dekking en zijn
/// milieuklasse.
///
/// # `None` betekent "volg het element", niet "nul" en niet "onbekend"
///
/// Beide velden leeg — de [`Default`] — is de stand van vóór dit type: de zijde
/// gebruikt dan de dekking en de milieuklasse van het element. Dat is de reden
/// dat dit type überhaupt zo mag bestaan: een projectbestand van vóór deze
/// uitbreiding kent deze velden niet, `#[serde(default)]` maakt ze leeg, en
/// elke uitkomst blijft daarmee bit voor bit dezelfde. Zie
/// [`crate::section::ReinforcementCage::cover_at_mm`].
///
/// De dekking en de klasse staan met opzet in ÉÉN type en niet in twee losse
/// lijstjes. (4.2) leidt c_min,dur rechtstreeks uit de milieuklasse af; wie ze
/// zou scheiden, kan een projectbestand krijgen met een eigen dekking voor de
/// bovenzijde en een milieuklasse voor het hele element, en niets dat die
/// tegenspraak opmerkt.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct FaceCover {
    /// De nominale dekking c_nom van DEZE zijde, in mm. `None` = de dekking van
    /// het element.
    #[serde(default)]
    #[ts(optional)]
    pub cover_mm: Option<f64>,
    /// De milieuklasse van DEZE zijde (tabel 4.1). `None` = de milieuklasse van
    /// het element.
    #[serde(default)]
    #[ts(optional)]
    pub exposure_class: Option<ExposureClass>,
}

impl FaceCover {
    /// Zegt deze zijde niets eigens? Dan geldt het element.
    pub fn is_empty(&self) -> bool {
        self.cover_mm.is_none() && self.exposure_class.is_none()
    }

    /// Alleen een eigen dekking, zonder eigen klasse — het geval waarin de
    /// tekening en de berekening uiteen kunnen lopen als niemand het zegt.
    pub fn heeft_eigen_dekking(&self) -> bool {
        self.cover_mm.is_some()
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Constructieklasse en tabel 4.4N
// ───────────────────────────────────────────────────────────────────────────

/// Constructieklasse S1…S6 (4.4.1.2(5), tabel 4.3N).
///
/// # DE CONSTRUCTIEKLASSE HOORT BIJ HET ELEMENT, NIET BIJ DE ZIJDE
///
/// De nationale bijlage bij 4.4.1.2(5) schrapt de aanbevolen tabel 4.3N en
/// schrijft een eigen versie voor: "Constructieve classificatie moet in
/// overeenstemming met de geamendeerde tabel 4.3N zijn, welke tabel dan als
/// volgt moet zijn gelezen (normatief)". Die tabel kent vijf criteria, en alle
/// vijf zijn een eigenschap van het ELEMENT en niet van een oppervlak:
/// "Ontwerplevensduur 100 jaar" (+2 klassen), "Ontwerplevensduur 75 jaar"
/// (+1 klasse), "Sterkteklasse" (−1 klasse), "Element met plaatgeometrie
/// (plaats van de wapening niet beïnvloed door het bouwproces)" (−1 klasse) en
/// "Specifieke kwaliteitsbeheersing van de betonproductie gewaarborgd"
/// (−1 klasse). Een balk heeft één ontwerplevensduur, één betonsterkteklasse,
/// één geometrie en één productiewijze.
///
/// Eén nuance hoort erbij, en die is echt: de DREMPEL bij het criterium
/// sterkteklasse loopt per milieuklassekolom op — "≥ C30/37" bij X0 en XC1,
/// "≥ C35/45" bij XC2/XC3, "≥ C40/50" bij XC4 en XD1. Wie die aanpassing zelf
/// toepast, kan met één en dezelfde betonsterkte aan de ene zijde wél en aan de
/// andere zijde niet een klasse omlaag. Deze module leidt de klasse echter NIET
/// af — zij is invoer, zie de moduletekst — en houdt daarom één klasse voor het
/// hele element aan. Dat staat ook in de toelichting bij elke uitkomst, zodat
/// wie de aanpassing wél zelf doet, weet dat hij hem zelf per zijde moet
/// invullen.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum StructuralClass {
    S1,
    S2,
    S3,
    S4,
    S5,
    S6,
}

impl StructuralClass {
    fn index(self) -> usize {
        match self {
            StructuralClass::S1 => 0,
            StructuralClass::S2 => 1,
            StructuralClass::S3 => 2,
            StructuralClass::S4 => 3,
            StructuralClass::S5 => 4,
            StructuralClass::S6 => 5,
        }
    }

    /// "S4".
    pub fn name(self) -> &'static str {
        match self {
            StructuralClass::S1 => "S1",
            StructuralClass::S2 => "S2",
            StructuralClass::S3 => "S3",
            StructuralClass::S4 => "S4",
            StructuralClass::S5 => "S5",
            StructuralClass::S6 => "S6",
        }
    }
}

/// De constructieklasse bij een ontwerplevensduur van 50 jaar.
///
/// NB bij 4.4.1.2(5): "Als constructieklasse voor een ontwerplevensduur van 50
/// jaar moet S4 zijn aangehouden."
pub const DEFAULT_STRUCTURAL_CLASS: StructuralClass = StructuralClass::S4;

/// Tabel 4.4N — c_min,dur voor betonstaal volgens NEN-EN 10080, in mm, ZOALS
/// DE NATIONALE BIJLAGE HEM VOORSCHRIJFT.
///
/// Rijen S1…S6; kolommen X0, XC1, XC2/XC3, XC4, XD1/XS1, XD2/XS2, XD3/XS3.
///
/// De EN-tabel met dezelfde naam is door de NB doorgehaald ("welke tabel dan
/// als volgt moet zijn gelezen (normatief)") en de laatste kolom verschilt:
/// de EN gaf daar 30/35/40/45/50/55, de NB geeft dezelfde waarden als de kolom
/// XD2/XS2. Wie hier uit het geheugen de EN-waarden invult, rekent een balk in
/// een getijdezone 5 mm te dun.
const C_MIN_DUR_REINFORCING: [[f64; 7]; 6] = [
    [10.0, 10.0, 10.0, 15.0, 20.0, 25.0, 25.0], // S1
    [10.0, 10.0, 15.0, 20.0, 25.0, 30.0, 30.0], // S2
    [10.0, 10.0, 20.0, 25.0, 30.0, 35.0, 35.0], // S3
    [10.0, 15.0, 25.0, 30.0, 35.0, 40.0, 40.0], // S4
    [15.0, 20.0, 30.0, 35.0, 40.0, 45.0, 45.0], // S5
    [20.0, 25.0, 35.0, 40.0, 45.0, 50.0, 50.0], // S6
];

/// Δc_dur,γ — aanvullende veiligheidsmarge, 4.4.1.2(6).
/// NB: "De waarde van Δc dur,γ moet gelijk aan 0 mm zijn genomen."
pub const DELTA_C_DUR_GAMMA_MM: f64 = 0.0;

/// Δc_dur,st — reductie bij roestvast staal, 4.4.1.2(7).
/// NB: "De waarde van Δc dur,st moet gelijk aan 0 mm zijn genomen."
pub const DELTA_C_DUR_ST_MM: f64 = 0.0;

/// Δc_dur,add — reductie bij aanvullende bescherming, 4.4.1.2(8).
/// NB: "De waarde van Δc dur,add moet gelijk aan 0 mm zijn genomen."
pub const DELTA_C_DUR_ADD_MM: f64 = 0.0;

/// Δc_dev — toeslag voor uitvoeringstoleranties, 4.4.1.3(1)P.
///
/// De EN beveelt 10 mm aan; de NB schrijft voor: "De waarde van Δc dev moet
/// gelijk aan 5 mm zijn genomen." De reducties van 4.4.1.3(3) zijn in de NL
/// bijlage aan voorwaarden gebonden en worden hier niet toegepast.
pub const DELTA_C_DEV_MM: f64 = 5.0;

/// De ondergrens uit vergelijking (4.2): c_min is nooit kleiner dan 10 mm.
pub const C_MIN_FLOOR_MM: f64 = 10.0;

/// c_min,dur uit tabel 4.4N (betonstaal). `None` voor XF en XA.
pub fn c_min_dur_mm(exposure: ExposureClass, structural: StructuralClass) -> Option<f64> {
    exposure
        .cover_column_index()
        .map(|kolom| C_MIN_DUR_REINFORCING[structural.index()][kolom])
}

// ───────────────────────────────────────────────────────────────────────────
// Het verzoek voor de drie wegen
// ───────────────────────────────────────────────────────────────────────────

/// Welke van de drie termen van (4.2) de maat gaf.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum CoverGovernedBy {
    /// c_min,b — de aanhechtingseis van tabel 4.2.
    Bond,
    /// c_min,dur + Δ's — de duurzaamheidseis van tabel 4.4N.
    Durability,
    /// De ondergrens van 10 mm in (4.2).
    Floor,
}

/// Eén verzoek om de dekkingstoets, zoals het over het Tauri-command, de
/// toetsbrug en de MCP-server gaat.
///
/// `deny_unknown_fields`: een tikfout in `stirrup_diameter_mm` zou anders
/// stilzwijgend 0 opleveren, en dan valt de aanhechtingseis terug op de
/// hoofdstaaf terwijl er wél een beugel zit.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteCoverRequest {
    /// Vrij te kiezen nummer; komt onveranderd terug. 0 als het niet om een
    /// staaf uit een model gaat.
    #[serde(default)]
    pub beam_id: u32,
    /// Welk betonoppervlak dit verzoek betreft (4.4.1.1(1)P).
    ///
    /// `None` = niet benoemd; dan is het antwoord een dekkingstoets zonder
    /// zijde, precies zoals hij vóór deze uitbreiding was. Het veld verandert
    /// aan de berekening niets: het reist mee zodat het antwoord kan zeggen
    /// wélke zijde is getoetst, want drie antwoorden naast elkaar zonder
    /// opschrift zijn niet uit elkaar te houden.
    #[serde(default)]
    #[ts(optional)]
    pub side: Option<CoverSide>,
    /// De milieuklasse van tabel 4.1 — die van de zijde in [`Self::side`], of
    /// van het element als er geen zijde is benoemd.
    pub exposure_class: ExposureClass,
    /// De constructieklasse. Blijft het veld weg, dan
    /// [`DEFAULT_STRUCTURAL_CLASS`] — de NB-waarde voor 50 jaar.
    #[serde(default)]
    pub structural_class: Option<StructuralClass>,
    /// De opgegeven nominale dekking c_nom, in mm — het getal dat de
    /// constructeur invult en dat op de tekening komt (4.4.1.1(2)P).
    pub cover_mm: f64,
    /// Beugeldiameter in mm; 0 = geen beugel.
    #[serde(default)]
    pub stirrup_diameter_mm: f64,
    /// De grootste diameter van de hoofdwapening, in mm.
    ///
    /// Zowel de beugel als de hoofdstaaf tellen mee voor de aanhechtingseis:
    /// de beugel ligt op c_nom van de rand, de hoofdstaaf op c_nom + Ø_beugel.
    /// Zie [`concrete_cover_request`] voor de afweging.
    #[serde(default)]
    pub max_bar_diameter_mm: f64,
}

/// Het antwoord: de hele keten van (4.2) en (4.1), met de vindplaats van elke
/// term, plus het oordeel over de opgegeven dekking.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteCoverResponse {
    pub beam_id: u32,
    /// De zijde uit het verzoek, onveranderd terug; `None` als er geen is
    /// benoemd.
    pub side: Option<CoverSide>,
    pub exposure_class: ExposureClass,
    pub structural_class: StructuralClass,
    /// De kolomaanduiding uit tabel 4.4N, of `None` bij XF/XA.
    pub cover_column: Option<String>,
    /// c_min,dur uit tabel 4.4N; `None` bij XF/XA — zie de moduletekst.
    pub c_min_dur_mm: Option<f64>,
    /// c_min,b uit tabel 4.2: de maatgevende staafdiameter.
    pub c_min_b_mm: f64,
    /// Welke staaf die eis stelde — de beugel of de hoofdwapening.
    pub c_min_b_source: String,
    pub delta_c_dur_gamma_mm: f64,
    pub delta_c_dur_st_mm: f64,
    pub delta_c_dur_add_mm: f64,
    /// De duurzaamheidsterm van (4.2): c_min,dur + Δc_dur,γ − Δc_dur,st −
    /// Δc_dur,add. `None` bij XF/XA.
    pub durability_term_mm: Option<f64>,
    /// c_min volgens (4.2).
    pub c_min_mm: f64,
    pub governed_by: CoverGovernedBy,
    pub delta_c_dev_mm: f64,
    /// De vereiste nominale dekking volgens (4.1).
    pub c_nom_required_mm: f64,
    /// De opgegeven nominale dekking, onveranderd terug.
    pub c_nom_provided_mm: f64,
    /// c_nom,vereist / c_nom,aanwezig. Groter dan 1 = te weinig dekking.
    pub unity_check: f64,
    pub status: CheckStatus,
    /// Wat er bij deze uitkomst hoort te worden verteld — de NB-bepalingen die
    /// zijn gebruikt en de eisen die deze toets NIET dekt.
    pub notes: Vec<String>,
}

/// De rekengang achter alle drie de wegen. Eén implementatie, drie aanroepers.
///
/// DE MAATGEVENDE STAAF VOOR c_min,b. De nominale dekking wordt gemeten tot de
/// buitenste wapening — 4.4.1.1(1)P: "de afstand tussen het oppervlak van de
/// wapening en het dichtstbijzijnde betonoppervlak (inclusief beugels …)". Bij
/// een korf mét beugel is dat dus de beugel, en tabel 4.2 vraagt daar
/// Ø_beugel. De hoofdstaaf ligt een beugeldiameter dieper en heeft daar
/// c_nom + Ø_beugel ≥ Ø_hoofd nodig; die eis wordt apart gecontroleerd en
/// alleen maatgevend gemaakt als hij zwaarder is dan de beugeleis.
/// Zonder beugel is de hoofdwapening zélf de buitenste wapening.
pub fn concrete_cover_request(
    req: ConcreteCoverRequest,
) -> Result<ConcreteCoverResponse, String> {
    if !req.cover_mm.is_finite() || req.cover_mm < 0.0 {
        return Err("De dekking c_nom moet een eindig, niet-negatief getal zijn.".into());
    }
    if !req.stirrup_diameter_mm.is_finite() || req.stirrup_diameter_mm < 0.0 {
        return Err("De beugeldiameter moet een eindig, niet-negatief getal zijn.".into());
    }
    if !req.max_bar_diameter_mm.is_finite() || req.max_bar_diameter_mm < 0.0 {
        return Err("De staafdiameter moet een eindig, niet-negatief getal zijn.".into());
    }

    let structural = req.structural_class.unwrap_or(DEFAULT_STRUCTURAL_CLASS);
    let info = req.exposure_class.info();
    let c_min_dur = c_min_dur_mm(req.exposure_class, structural);

    // Tabel 4.2, afzonderlijke staven: c_min,b = de diameter van de staaf.
    // De buitenste wapening bepaalt de eis aan c_nom zelf; de binnenliggende
    // hoofdstaaf mag zijn beugeldiameter aftrekken van de eis.
    let heeft_beugel = req.stirrup_diameter_mm > 0.0;
    let eis_beugel = if heeft_beugel {
        req.stirrup_diameter_mm
    } else {
        0.0
    };
    let eis_hoofd = (req.max_bar_diameter_mm - req.stirrup_diameter_mm).max(0.0);
    let (c_min_b, bron) = if eis_hoofd > eis_beugel {
        (
            eis_hoofd,
            if heeft_beugel {
                format!(
                    "hoofdwapening Ø{:.0} mm, gemeten vanaf de beugel: Ø − Ø_beugel = {:.0} − {:.0} mm",
                    req.max_bar_diameter_mm, req.max_bar_diameter_mm, req.stirrup_diameter_mm
                )
            } else {
                format!(
                    "hoofdwapening Ø{:.0} mm (geen beugel: de hoofdstaaf is de buitenste wapening)",
                    req.max_bar_diameter_mm
                )
            },
        )
    } else {
        (
            eis_beugel,
            if heeft_beugel {
                format!(
                    "beugel Ø{:.0} mm — de buitenste wapening, waarop c_nom is gemeten (4.4.1.1(1)P)",
                    req.stirrup_diameter_mm
                )
            } else {
                "geen wapening opgegeven waarop tabel 4.2 een eis stelt".to_string()
            },
        )
    };

    let durability_term = c_min_dur
        .map(|c| c + DELTA_C_DUR_GAMMA_MM - DELTA_C_DUR_ST_MM - DELTA_C_DUR_ADD_MM);

    // Vergelijking (4.2): de grootste van de drie.
    let mut c_min = c_min_b.max(C_MIN_FLOOR_MM);
    let mut governed_by = if c_min_b >= C_MIN_FLOOR_MM {
        CoverGovernedBy::Bond
    } else {
        CoverGovernedBy::Floor
    };
    if let Some(d) = durability_term {
        if d > c_min {
            c_min = d;
            governed_by = CoverGovernedBy::Durability;
        }
    }

    let c_nom_required = c_min + DELTA_C_DEV_MM;
    // De unity check is de verhouding vereist/aanwezig, zoals elke andere
    // toets in dit project: > 1 is afgekeurd. Bij c_nom = 0 is er geen
    // verhouding; dan is de toets zonder meer onvoldoende.
    let unity_check = if req.cover_mm > 0.0 {
        c_nom_required / req.cover_mm
    } else {
        f64::INFINITY
    };
    let status = if unity_check <= 1.0 + 1e-9 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    let mut notes = Vec::new();
    if let Some(zijde) = req.side {
        notes.push(format!(
            "Deze uitkomst geldt voor de {}. 4.4.1.1(1)P meet de dekking tot \"het \
             dichtstbijzijnde betonoppervlak\", dus per zijde; een element met een andere \
             milieuklasse aan een andere zijde heeft daar een eigen c_min,dur en een eigen \
             c_nom, en dus een eigen nuttige hoogte.",
            zijde.label()
        ));
    }
    notes.extend([
        format!(
            "Milieuklasse {} — {} (tabel 4.1, {}).",
            info.name, info.description, info.group
        ),
        format!(
            "c_nom = c_min + Δc_dev (4.1); c_min = max{{c_min,b; c_min,dur + Δc_dur,γ − \
             Δc_dur,st − Δc_dur,add; 10 mm}} (4.2).",
        ),
        format!(
            "Nationale bijlage: Δc_dur,γ = Δc_dur,st = Δc_dur,add = 0 mm (4.4.1.2(6)…(8)) en \
             Δc_dev = {:.0} mm (4.4.1.3(1)P; de EN beveelt 10 mm aan).",
            DELTA_C_DEV_MM
        ),
    ]);
    match c_min_dur {
        Some(c) => notes.push(format!(
            "c_min,dur = {:.0} mm uit tabel 4.4N (betonstaal), constructieklasse {}, kolom {}. \
             Dat is de door de nationale bijlage voorgeschreven tabel, niet de EN-tabel.",
            c,
            structural.name(),
            info.cover_column.unwrap_or("—")
        )),
        None => notes.push(format!(
            "Tabel 4.4N kent voor {} geen c_min,dur: vorst/dooi- en chemische aantasting worden \
             volgens 4.4.1.2(12) via de betonsamenstelling beheerst (hoofdstuk 6 van EN 206-1), \
             niet via de dekking. Er blijven hier alleen de aanhechtingseis en de ondergrens van \
             10 mm over; combineer deze klasse met de corrosieklasse die óók van toepassing is.",
            info.name
        )),
    }
    if req.structural_class.is_none() {
        notes.push(format!(
            "Constructieklasse {} aangehouden — de nationale bijlage bij 4.4.1.2(5): \
             \"Als constructieklasse voor een ontwerplevensduur van 50 jaar moet S4 zijn \
             aangehouden.\"",
            DEFAULT_STRUCTURAL_CLASS.name()
        ));
    }
    notes.push(
        "De constructieklasse wordt hier NIET automatisch aangepast volgens tabel 4.3N \
         (levensduur, sterkteklasse, plaatgeometrie, kwaliteitsbeheersing); zij is invoer. \
         Evenmin verwerkt: de toeslag van 5 mm bij een korrelafmeting > 32 mm (tabel 4.2), de \
         5 mm bij oneffen oppervlakken (4.4.1.2(11)) en de afslijtingsklassen XM1…XM3 \
         (4.4.1.2(13))."
            .to_string(),
    );
    if req.side.is_some() {
        notes.push(
            "De constructieklasse hoort bij het ELEMENT en niet bij de zijde: alle vijf de \
             criteria van de door de nationale bijlage vervangen tabel 4.3N — ontwerplevensduur \
             100 jaar, ontwerplevensduur 75 jaar, sterkteklasse, element met plaatgeometrie en \
             gewaarborgde kwaliteitsbeheersing — zijn eigenschappen van het element. Alleen de \
             DREMPEL bij het criterium sterkteklasse loopt per milieuklassekolom op (≥ C30/37 bij \
             X0 en XC1, ≥ C35/45 bij XC2/XC3, ≥ C40/50 bij XC4 en XD1); wie die aanpassing zelf \
             toepast kan daardoor per zijde op een andere klasse uitkomen en moet die dan hier \
             ook per zijde opgeven."
                .to_string(),
        );
    }

    Ok(ConcreteCoverResponse {
        beam_id: req.beam_id,
        side: req.side,
        exposure_class: req.exposure_class,
        structural_class: structural,
        cover_column: info.cover_column.map(|c| c.to_string()),
        c_min_dur_mm: c_min_dur,
        c_min_b_mm: c_min_b,
        c_min_b_source: bron,
        delta_c_dur_gamma_mm: DELTA_C_DUR_GAMMA_MM,
        delta_c_dur_st_mm: DELTA_C_DUR_ST_MM,
        delta_c_dur_add_mm: DELTA_C_DUR_ADD_MM,
        durability_term_mm: durability_term,
        c_min_mm: c_min,
        governed_by,
        delta_c_dev_mm: DELTA_C_DEV_MM,
        c_nom_required_mm: c_nom_required,
        c_nom_provided_mm: req.cover_mm,
        unity_check,
        status,
        notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn verzoek(exposure: ExposureClass, cover: f64) -> ConcreteCoverRequest {
        ConcreteCoverRequest {
            beam_id: 0,
            side: None,
            exposure_class: exposure,
            structural_class: None,
            cover_mm: cover,
            stirrup_diameter_mm: 8.0,
            max_bar_diameter_mm: 16.0,
        }
    }

    #[test]
    fn tabel_4_4n_hoeken() {
        // De vier hoeken van de NB-tabel plus de kolom die van de EN afwijkt.
        assert_eq!(
            c_min_dur_mm(ExposureClass::X0, StructuralClass::S1),
            Some(10.0)
        );
        assert_eq!(
            c_min_dur_mm(ExposureClass::XD3, StructuralClass::S1),
            Some(25.0)
        );
        assert_eq!(
            c_min_dur_mm(ExposureClass::X0, StructuralClass::S6),
            Some(20.0)
        );
        assert_eq!(
            c_min_dur_mm(ExposureClass::XS3, StructuralClass::S6),
            Some(50.0)
        );
        // XD3/XS3 is in de NB gelijk aan XD2/XS2 — in de EN was hij 5 mm hoger.
        for s in [
            StructuralClass::S1,
            StructuralClass::S2,
            StructuralClass::S3,
            StructuralClass::S4,
            StructuralClass::S5,
            StructuralClass::S6,
        ] {
            assert_eq!(
                c_min_dur_mm(ExposureClass::XD3, s),
                c_min_dur_mm(ExposureClass::XD2, s)
            );
        }
    }

    #[test]
    fn xd3_met_20_mm_is_afgekeurd() {
        // S4 (NB, 50 jaar), XD3 → c_min,dur = 40 mm; c_min = 40; c_nom = 45 mm.
        let r = concrete_cover_request(verzoek(ExposureClass::XD3, 20.0)).unwrap();
        assert_eq!(r.c_min_dur_mm, Some(40.0));
        assert_eq!(r.c_min_mm, 40.0);
        assert_eq!(r.c_nom_required_mm, 45.0);
        assert_eq!(r.status, CheckStatus::NotOk);
        assert_eq!(r.governed_by, CoverGovernedBy::Durability);
        assert!((r.unity_check - 45.0 / 20.0).abs() < 1e-12);
    }

    #[test]
    fn xc1_met_30_mm_is_goed() {
        // S4, XC1 → c_min,dur = 15 mm; c_min,b = 8 mm (beugel); c_min = 15;
        // c_nom = 20 mm ≤ 30 mm.
        let r = concrete_cover_request(verzoek(ExposureClass::XC1, 30.0)).unwrap();
        assert_eq!(r.c_min_dur_mm, Some(15.0));
        assert_eq!(r.c_min_mm, 15.0);
        assert_eq!(r.c_nom_required_mm, 20.0);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn ondergrens_van_10_mm_bij_x0() {
        // X0, S4 → c_min,dur = 10 mm; beugel Ø8 → c_min,b = 8 mm; de
        // ondergrens en de duurzaamheidsterm zijn hier beide 10 mm.
        let mut v = verzoek(ExposureClass::X0, 15.0);
        v.max_bar_diameter_mm = 8.0;
        let r = concrete_cover_request(v).unwrap();
        assert_eq!(r.c_min_b_mm, 8.0);
        assert_eq!(r.c_min_mm, 10.0);
        assert_eq!(r.c_nom_required_mm, 15.0);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn aanhechting_kan_maatgevend_zijn() {
        // Zware staaf zonder beugel: c_min,b = Ø = 40 mm > c_min,dur (X0: 10).
        let v = ConcreteCoverRequest {
            beam_id: 7,
            side: None,
            exposure_class: ExposureClass::X0,
            structural_class: Some(StructuralClass::S4),
            cover_mm: 50.0,
            stirrup_diameter_mm: 0.0,
            max_bar_diameter_mm: 40.0,
        };
        let r = concrete_cover_request(v).unwrap();
        assert_eq!(r.beam_id, 7);
        assert_eq!(r.c_min_b_mm, 40.0);
        assert_eq!(r.governed_by, CoverGovernedBy::Bond);
        assert_eq!(r.c_nom_required_mm, 45.0);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn xf_en_xa_geven_geen_c_min_dur() {
        for k in [ExposureClass::XF4, ExposureClass::XA3] {
            let r = concrete_cover_request(verzoek(k, 30.0)).unwrap();
            assert_eq!(r.c_min_dur_mm, None);
            assert_eq!(r.durability_term_mm, None);
            assert_eq!(r.cover_column, None);
            // Alleen aanhechting (8 mm) en de ondergrens (10 mm) blijven over.
            assert_eq!(r.c_min_mm, 10.0);
            assert!(r
                .notes
                .iter()
                .any(|n| n.contains("4.4.1.2(12)") && n.contains("EN 206-1")));
        }
    }

    #[test]
    fn elke_klasse_staat_in_tabel_4_1() {
        // Er is geen klasse zonder rij, en geen rij zonder klasse.
        assert_eq!(EXPOSURE_CLASSES.len(), 18);
        for i in EXPOSURE_CLASSES {
            assert_eq!(i.class.info().name, i.name);
            assert!(!i.description.is_empty());
            assert!(!i.examples.is_empty());
            assert_eq!(i.cover_column.is_some(), i.class.cover_column_index().is_some());
        }
    }

    #[test]
    fn de_zijde_verandert_de_uitkomst_niet_maar_wel_het_opschrift() {
        // Het veld `side` is opschrift, geen invoer voor (4.1) of (4.2). Elk
        // getal moet dus gelijk blijven; alleen de toelichting groeit.
        let zonder = concrete_cover_request(verzoek(ExposureClass::XC4, 35.0)).unwrap();
        let mut v = verzoek(ExposureClass::XC4, 35.0);
        v.side = Some(CoverSide::Top);
        let met = concrete_cover_request(v).unwrap();

        assert_eq!(zonder.side, None);
        assert_eq!(met.side, Some(CoverSide::Top));
        assert_eq!(met.c_min_dur_mm, zonder.c_min_dur_mm);
        assert_eq!(met.c_min_mm, zonder.c_min_mm);
        assert_eq!(met.c_nom_required_mm, zonder.c_nom_required_mm);
        assert_eq!(met.unity_check, zonder.unity_check);
        assert_eq!(met.status, zonder.status);
        assert!(met.notes.iter().any(|n| n.contains("bovenzijde")));
        assert!(met.notes.iter().any(|n| n.contains("4.4.1.1(1)P")));
        // De uitleg over de constructieklasse komt er alleen bij als er een
        // zijde is; zonder zijde is er niets om over te verwarren.
        assert!(met.notes.iter().any(|n| n.contains("hoort bij het ELEMENT")));
        assert!(!zonder.notes.iter().any(|n| n.contains("hoort bij het ELEMENT")));
    }

    #[test]
    fn een_vloer_binnen_boven_en_buiten_onder_geeft_twee_dekkingen() {
        // Het geval uit de opdracht: bovenzijde binnen (XC1), onderzijde buiten
        // (XC4). S4 (NB, 50 jaar) → c_min,dur 15 resp. 30 mm; met Δc_dev = 5 mm
        // wordt de vereiste c_nom 20 resp. 35 mm. Eén dekking voor beide zijden
        // kan dus niet kloppen.
        let mut boven = verzoek(ExposureClass::XC1, 25.0);
        boven.side = Some(CoverSide::Top);
        let boven = concrete_cover_request(boven).unwrap();
        let mut onder = verzoek(ExposureClass::XC4, 40.0);
        onder.side = Some(CoverSide::Bottom);
        let onder = concrete_cover_request(onder).unwrap();

        assert_eq!(boven.c_nom_required_mm, 20.0);
        assert_eq!(onder.c_nom_required_mm, 35.0);
        assert_eq!(boven.status, CheckStatus::Ok);
        assert_eq!(onder.status, CheckStatus::Ok);
        // Dezelfde 25 mm die boven ruim voldoet, is onder te dun.
        let mut te_dun = verzoek(ExposureClass::XC4, 25.0);
        te_dun.side = Some(CoverSide::Bottom);
        assert_eq!(
            concrete_cover_request(te_dun).unwrap().status,
            CheckStatus::NotOk
        );
    }

    #[test]
    fn elke_zijde_heeft_een_nederlandse_aanduiding() {
        assert_eq!(CoverSide::ALL.len(), 3);
        for z in CoverSide::ALL {
            assert!(!z.label().is_empty());
        }
        assert_eq!(CoverSide::Top.label(), "bovenzijde");
        assert_eq!(CoverSide::Bottom.label(), "onderzijde");
        assert_eq!(CoverSide::Sides.label(), "zijkanten");
    }

    #[test]
    fn een_lege_zijde_zegt_niets_eigens() {
        let leeg = FaceCover::default();
        assert!(leeg.is_empty());
        assert!(!leeg.heeft_eigen_dekking());
        let met_dekking = FaceCover { cover_mm: Some(40.0), exposure_class: None };
        assert!(!met_dekking.is_empty());
        assert!(met_dekking.heeft_eigen_dekking());
        // Een JSON zonder de velden — een projectbestand van vóór deze
        // uitbreiding — levert de lege zijde op en dus het oude gedrag.
        let uit_json: FaceCover = serde_json::from_str("{}").unwrap();
        assert_eq!(uit_json, leeg);
    }

    #[test]
    fn onzinnige_invoer_geeft_een_fout_en_geen_getal() {
        let mut v = verzoek(ExposureClass::XC1, -1.0);
        assert!(concrete_cover_request(v.clone()).is_err());
        v.cover_mm = f64::NAN;
        assert!(concrete_cover_request(v).is_err());
    }
}
