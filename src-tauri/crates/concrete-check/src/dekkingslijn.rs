//! De dekkingslijn als DIENST: §9.2.1.3 met figuur 9.2, en §6.2 voor de
//! dwarskracht — één betonstaaf per verzoek, en er blijft niets achter.
//!
//! # Waarvoor dit bestand bestaat
//!
//! `nen_en_1992_1_1::dekkingslijn` rekent de momenten- en de
//! dwarskrachtdekking al helemaal uit, maar levert Rust-typen die noch
//! `Serialize` noch `TS` zijn. Daardoor kon geen van de drie wegen erbij: niet
//! het Tauri-command, niet de toetsbrug en niet de MCP-server. Dit bestand is
//! de vertaallaag en niets meer — het rekent zelf niets uit. Elke uitkomst
//! hieronder komt letterlijk uit [`nen_en_1992_1_1::dekkingslijn::dekkingslijn`];
//! een tweede rekenimplementatie zou betekenen dat dezelfde staaf twee
//! plausibele dekkingslijnen kan opleveren, en dat is bij constructieve
//! software een veiligheidsprobleem.
//!
//! Het model is dat van [`crate::segments`]: stateloos, verzoek erin, antwoord
//! eruit. Twee aanroepen met hetzelfde verzoek geven hetzelfde antwoord, en
//! tussen twee aanroepen wordt niets bewaard.
//!
//! # Waarom [`ConcreteBeamCheckInput`] wordt HERGEBRUIKT en er geen tweede,
//! bijna gelijk invoertype is gemaakt
//!
//! De dekkingslijn heeft nodig: de doorsnede, de betonklasse, de staalsoort,
//! de korf, de zones, de staaflengte en de omhullende. Dat zijn precies zeven
//! van de velden van [`ConcreteBeamCheckInput`], met dezelfde betekenis en
//! dezelfde eenheden. Een eigen invoertype met diezelfde zeven velden zou:
//!
//! * de frontend dwingen tot een TWEEDE bouwer die dezelfde stores op dezelfde
//!   manier uitleest — en twee bouwers lopen uiteen, precies zoals dit project
//!   eerder met een dubbele aanroeplaag heeft ondervonden;
//! * bij elk nieuw veld op de betontoets (er kwamen er de afgelopen tijd vijf
//!   bij: `reinforcement_zones`, `sls_frequent_envelope`, `structural_class`,
//!   `structural_system`, `bar_spacing_mm`) om een tweede wijziging vragen, met
//!   de kans dat er één wordt vergeten;
//! * de toetsbrug een eigen veldenlijst geven, terwijl die weg nu juist
//!   `ConcreteBeamCheckInput` RECHTSTREEKS leest en dus vanzelf meereist.
//!
//! Daarom draagt [`DekkingslijnVerzoek`] de hele betonstaaf als één veld
//! `beam`, met daarnaast de vier keuzes die de dekkingslijn wél kent en de
//! doorsnedetoets niet. Dat het `beam`-object een paar velden meedraagt die
//! deze dienst niet gebruikt — `n_strips`, `apply_min_eccentricity`,
//! `sls_frequent_envelope`, `exposure_class`, `structural_class`,
//! `aggregate_size_mm`, `structural_system`, `bar_spacing_mm` — is de prijs, en
//! die is laag: een ongebruikt veld is zichtbaar (het staat in het schema en in
//! de documentatie hieronder) terwijl een uiteengelopen tweede invoertype dat
//! niet is.
//!
//! **NIET GEFLATTEND.** `#[serde(flatten)]` zou de velden van de staaf op het
//! bovenste niveau brengen, maar serde kan `deny_unknown_fields` en `flatten`
//! niet combineren — de strengheid die elk ander invoertype in deze crate
//! draagt zou dan stilzwijgend wegvallen, en een tikfout in een veldnaam met
//! `#[serde(default)]` zou terugvallen op de standaardwaarde. Genest dus.
//!
//! # De vier keuzes die hier bijkomen
//!
//! * `z_mm` — de inwendige hefboomsarm waarmee figuur 9.2 het moment op kracht
//!   omrekent (F = M_Ed/z). Leeg → z = 0,9·d per snede, maar 6.2.3(1) staat die
//!   vereenvoudiging uitsluitend toe "voor gewapend beton zonder
//!   normaalkracht"; werkt er wél een normaalkracht, dan komt er een FOUT met
//!   die reden en geen getal.
//! * `c_d_mm` — c_d volgens figuur 8.3. Leeg → 0 mm, de ONBEPAALDE waarde:
//!   alle alfa-factoren van tabel 8.2 worden 1,0 en l_bd is maximaal. Dat is de
//!   veilige kant.
//! * `a_sl_mm2` — A_sl van 6.2.2(1). Leeg → de trekrij van de korf ter plaatse.
//! * `cot_theta` — cot θ binnen 1,0 … 2,5 (NB bij 6.2.3(2)). Leeg → per snede
//!   automatisch voor de dwarskracht, en voor a_l de bovengrens, want een
//!   grotere cot θ geeft een grotere verschuiving.
//!
//! # Wat er met opzet NIET in het verzoek zit
//!
//! [`nen_en_1992_1_1::dwarskracht::ShearOptions`] kent een vierde keuze:
//! `nabij_steunpunt`, de β-vermindering van 6.2.2(6). Die geldt voor ÉÉN
//! doorsnede, met een a_v die vanaf de rand van de oplegging wordt gemeten en
//! met een bijdrage aan V_Ed die alleen de aanroeper kent. De dekkingslijn
//! loopt over de HELE staaf; één zo'n opgave zou de vermindering op elk punt
//! van de lijn toepassen, ook waar zij niet geldt. Dat is onveilig en
//! onzichtbaar, dus die keuze is hier niet aangeboden. De onverminderde V_Ed is
//! de veilige kant.
//!
//! # Waarom de volledige dwarskrachtafleiding er niet in zit
//!
//! [`nen_en_1992_1_1::dekkingslijn::Dwarskrachtdekking`] draagt de hele
//! [`ShearResistance`](nen_en_1992_1_1::dwarskracht::ShearResistance) van de
//! maatgevende snede. Die staat hier NIET in het antwoord: `check_concrete_beams`
//! levert diezelfde afleiding al, met dezelfde keuze op de unity check, en twee
//! kopieën van één afleiding kunnen in een rapport uiteenlopen. Wat er wél in
//! staat is per punt het getal, de route, het spoor en de reden — genoeg om de
//! lijn te tekenen en om te zien welk bewijs waar gold.

use nen_en_1992_1_1::dekkingslijn as kern;
use nen_en_1992_1_1::dwarskracht::ShearOptions;
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, DesignMaterial, RebarSide,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::input::ConcreteBeamCheckInput;

// ───────────────────────────────────────────────────────────────────────────
// Invoer
// ───────────────────────────────────────────────────────────────────────────

/// Eén stateloos verzoek om de dekkingslijn van één betonstaaf.
///
/// `deny_unknown_fields`: een tikfout in een van de vier optionele velden zou
/// zonder deze strengheid stilzwijgend op "niet opgegeven" terugvallen, en dan
/// verandert de lijn zonder dat iemand het ziet — een vergeten `z_mm` levert
/// bij een staaf zonder normaalkracht 0,9·d in plaats van de opgegeven waarde.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct DekkingslijnVerzoek {
    /// De betonstaaf, in HETZELFDE type dat `check_concrete_beams` krijgt.
    ///
    /// Gebruikt worden: `beam_id`, `section`, `concrete_class`,
    /// `reinforcement_grade`, `cage`, `reinforcement_zones`, `length_m`,
    /// `forces_envelope`, `design_situation` en `steel_branch`.
    ///
    /// Niet gebruikt: `n_strips`, `apply_min_eccentricity`,
    /// `sls_frequent_envelope`, `exposure_class`, `structural_class`,
    /// `aggregate_size_mm`, `structural_system` en `bar_spacing_mm`. Zij horen
    /// bij de doorsnedetoetsen (§6.1, §7.3, §7.4, §8.2) en niet bij de
    /// dekkingslijn; zie de moduletekst voor waarom dit type tóch als geheel
    /// wordt hergebruikt.
    pub beam: ConcreteBeamCheckInput,

    /// De inwendige hefboomsarm z in mm waarmee figuur 9.2 het moment op
    /// kracht omrekent.
    ///
    /// Leeg = niet opgegeven: dan z = 0,9·d per snede volgens 6.2.3(1), maar
    /// **alleen** als er nergens een normaalkracht werkt. Werkt er wél een
    /// normaalkracht, dan is dit verzoek een FOUT met die reden — 6.2.3(1)
    /// staat de vereenvoudiging uitsluitend toe "voor gewapend beton zonder
    /// normaalkracht", en stilzwijgend 0,9·d invullen zou de benodigde
    /// trekkracht te laag maken.
    #[serde(default)]
    #[ts(optional)]
    pub z_mm: Option<f64>,

    /// c_d volgens figuur 8.3, mm — de maat die α₂ van tabel 8.2 bepaalt.
    ///
    /// Leeg = 0 mm, de ONBEPAALDE waarde: alle alfa-factoren worden 1,0 en l_bd
    /// is maximaal, dus de schuine takken van figuur 9.2 zijn zo lang als de
    /// norm ze kan maken. Dat is de veilige kant. Let op het gevolg: een
    /// omgebogen staafeinde ([`Staafvorm::AndersDanRecht`](nen_en_1992_1_1::Staafvorm))
    /// verkort l_bd dan NIET, want α₁ = 0,7 vergt c_d > 3Φ.
    #[serde(default)]
    #[ts(optional)]
    pub c_d_mm: Option<f64>,

    /// A_sl in mm² volgens 6.2.2(1): de trekwapening die ≥ (l_bd + d) voorbij
    /// de beschouwde doorsnede doorloopt (figuur 6.3).
    ///
    /// Leeg = de trekrij van de korf die op die plaats geldt. Met zones is dat
    /// al een stuk scherper dan één korf voor de hele staaf, maar het is nog
    /// niet de regel van 6.2.2(1); elk punt van de dwarskrachtlijn meldt
    /// daarom zowel de GEBRUIKTE A_sl als de deelverzameling die aantoonbaar
    /// naar beide kanten ver genoeg doorloopt.
    #[serde(default)]
    #[ts(optional)]
    pub a_sl_mm2: Option<f64>,

    /// cot θ van de betondrukdiagonaal, binnen 1,0 ≤ cot θ ≤ 2,5 (NB bij
    /// 6.2.3(2)).
    ///
    /// Leeg = de dwarskrachttoets kiest θ per snede zelf, en voor de
    /// verschuiving a_l wordt de bovengrens aangehouden: een grotere cot θ
    /// geeft volgens (9.2) een grotere a_l en dus een zwaardere eis.
    #[serde(default)]
    #[ts(optional)]
    pub cot_theta: Option<f64>,
}

// ───────────────────────────────────────────────────────────────────────────
// Uitvoer — de spiegel van `nen_en_1992_1_1::dekkingslijn`
// ───────────────────────────────────────────────────────────────────────────

/// Aan welke kant van een sprong een punt ligt.
///
/// Op een zonegrens verandert de korf en SPRINGT de weerstand. Interpoleren
/// over een sprong heeft geen betekenis; er staan daarom twee punten op
/// dezelfde `x_mm`, met deze aanduiding erbij. Wie de lijn tekent, moet die
/// twee punten met een verticaal stuk verbinden en niet met een schuine lijn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Snedezijde {
    /// Er is hier geen sprong; één punt volstaat.
    Enkel,
    /// De waarde die LINKS van de grens geldt.
    Links,
    /// De waarde die RECHTS van de grens geldt.
    Rechts,
}

impl From<kern::Snedezijde> for Snedezijde {
    fn from(z: kern::Snedezijde) -> Self {
        match z {
            kern::Snedezijde::Enkel => Snedezijde::Enkel,
            kern::Snedezijde::Links => Snedezijde::Links,
            kern::Snedezijde::Rechts => Snedezijde::Rechts,
        }
    }
}

/// Welk bewijs de weerstandbiedende trekkracht op een plaats levert —
/// §9.2.1.3(1) of §9.2.1.3(3).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum MomentBewijs {
    /// Aan deze zijde ligt hier geen langswapening.
    GeenWapening,
    /// Alle aanwezige staven liggen verder dan l_bd van hun uiteinden en
    /// leveren dus hun volle kracht A_s·f_yd.
    VolledigOntwikkeld,
    /// Ten minste één bundel telt hier mee met het LINEAIRE krachtverloop van
    /// art. 9.2.1.3(3): op het staafeinde nul, op l_bd ervandaan vol.
    BinnenVerankeringslengte,
}

impl From<kern::MomentBewijs> for MomentBewijs {
    fn from(b: kern::MomentBewijs) -> Self {
        match b {
            kern::MomentBewijs::GeenWapening => MomentBewijs::GeenWapening,
            kern::MomentBewijs::VolledigOntwikkeld => MomentBewijs::VolledigOntwikkeld,
            kern::MomentBewijs::BinnenVerankeringslengte => {
                MomentBewijs::BinnenVerankeringslengte
            }
        }
    }
}

/// Welke van de twee door de norm toegelaten bewijsvoeringen de
/// dwarskrachtweerstand op een plaats levert.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Weerstandsroute {
    /// 6.2.2(1): V_Rd = V_Rd,c — de doorsnede draagt de dwarskracht zonder dat
    /// er dwarskrachtwapening voor nodig is.
    BetonZonderWapening,
    /// 6.2.1(2)/6.2.3(3): V_Rd = min(V_Rd,s; V_Rd,max) — de aanwezige
    /// dwarskrachtwapening draagt.
    Dwarskrachtwapening,
}

impl From<nen_en_1992_1_1::dwarskracht::Weerstandsroute> for Weerstandsroute {
    fn from(r: nen_en_1992_1_1::dwarskracht::Weerstandsroute) -> Self {
        match r {
            nen_en_1992_1_1::dwarskracht::Weerstandsroute::BetonZonderWapening => {
                Weerstandsroute::BetonZonderWapening
            }
            nen_en_1992_1_1::dwarskracht::Weerstandsroute::Dwarskrachtwapening => {
                Weerstandsroute::Dwarskrachtwapening
            }
        }
    }
}

/// Welk spoor van 6.2.1(3)/(5) geldt — de ONTWERPvraag, los van de
/// weerstandsroute.
///
/// Een doorsnede met V_Ed ≤ V_Rd,c die tóch beugels draagt, staat in
/// [`Spoor::GeenBerekendeWapening`] en kan niettemin
/// [`Weerstandsroute::Dwarskrachtwapening`] zijn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Spoor {
    /// V_Ed ≤ V_Rd,c — geen berekende dwarskrachtwapening nodig (6.2.1(3)).
    GeenBerekendeWapening,
    /// V_Ed > V_Rd,c — er MOET dwarskrachtwapening zijn (6.2.1(5)); de
    /// betonbijdrage telt daarbij niet mee.
    Vakwerkmodel,
}

impl From<nen_en_1992_1_1::dwarskracht::Spoor> for Spoor {
    fn from(s: nen_en_1992_1_1::dwarskracht::Spoor) -> Self {
        match s {
            nen_en_1992_1_1::dwarskracht::Spoor::GeenBerekendeWapening => {
                Spoor::GeenBerekendeWapening
            }
            nen_en_1992_1_1::dwarskracht::Spoor::Vakwerkmodel => Spoor::Vakwerkmodel,
        }
    }
}

/// Welk uiteinde van de staaf.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Staafeinde {
    /// x = 0.
    Begin,
    /// x = L.
    Eind,
}

impl From<kern::Staafeinde> for Staafeinde {
    fn from(u: kern::Staafeinde) -> Self {
        match u {
            kern::Staafeinde::Begin => Staafeinde::Begin,
            kern::Staafeinde::Eind => Staafeinde::Eind,
        }
    }
}

/// Eén plaats op de MOMENTdekkingslijn, voor één zijde van de doorsnede.
///
/// Dit is figuur 9.2 als getallen. `omhullende_kn` is regel A, `benodigd_kn`
/// regel B (A ná de verschuiving over a_l) en `aanwezig_kn` regel C.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct Momentpunt {
    /// Plaats langs de staaf, mm vanaf de beginknoop.
    pub x_mm: f64,
    /// Aan welke kant van een sprong dit punt ligt.
    pub zijde: Snedezijde,
    /// Regel A — de omhullende van M_Ed/z + N_Ed op deze plaats zelf, kN.
    pub omhullende_kn: f64,
    /// Regel B — F_s, de optredende trekkracht ná de verschuiving over a_l, kN.
    pub benodigd_kn: f64,
    /// Regel C — F_Rs, de weerstandbiedende trekkracht, kN.
    pub aanwezig_kn: f64,
    /// Wat de hier liggende staven zouden leveren als zij volledig ontwikkeld
    /// waren, kN. Het verschil met `aanwezig_kn` is precies wat het lineaire
    /// krachtverloop van 9.2.1.3(3) van hen afhaalt.
    pub aanwezig_volledig_kn: f64,
    /// De laagste ontwikkelingsfractie van de bundels die hier liggen, 0…1.
    pub ontwikkeling: f64,
    /// F_s/F_Rs. Leeg als er geen wapening ligt — dan is er geen verhouding,
    /// alleen een tekort.
    #[ts(optional)]
    pub uc: Option<f64>,
    /// max(0; F_s − F_Rs), kN.
    pub tekort_kn: f64,
    /// Welk bewijs hier gold.
    pub bewijs: MomentBewijs,
    /// De inwendige hefboomsarm z waarmee M_Ed hier op kracht is omgerekend, mm.
    pub z_mm: f64,
    /// De normaalkracht van de maatgevende combinatie op deze plaats, kN (trek
    /// positief). Een DRUKkracht is NIET in `omhullende_kn` verrekend: het
    /// aftrekken van de volle drukkracht van de trekgordel veronderstelt een
    /// doorsnede-evenwicht dat deze lijn niet maakt. Niet verrekenen is de
    /// veilige kant; de waarde staat er zodat het rapport kan tonen wat er is
    /// weggelaten.
    pub n_ed_kn: f64,
    /// Het buigend moment van de maatgevende combinatie op deze plaats, kNm.
    pub m_ed_knm: f64,
    /// De combinatie die `omhullende_kn` op deze plaats leverde.
    pub combinatie_id: u32,
    /// Ligt dit punt binnen l_bd van een STAAFEINDE? Daar geldt niet de vrije
    /// dekkingslijn maar §9.2.1.4/§9.2.1.5 — zie `steunpunten`.
    pub in_eindzone: bool,
}

/// Eén plaats op de DWARSKRACHTdekkingslijn.
///
/// Er is met opzet ÉÉN `aanwezig_kn`, met de route die hem leverde ernaast.
/// V_Rd,c en V_Rd,s staan hier niet als twee optelbare velden: 6.2.1(2) geeft
/// V_Rd = V_Rd,s + V_ccd + V_td zonder betonterm, 6.2.3(3) noemt V_Rd "de
/// kleinste waarde van" (6.8) en (6.9), en 6.2.1(3) is een tweede, losstaande
/// bewijsvoering.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct Dwarskrachtpunt {
    /// Plaats langs de staaf, mm vanaf de beginknoop.
    pub x_mm: f64,
    /// Aan welke kant van een sprong dit punt ligt.
    pub zijde: Snedezijde,
    /// |V_Ed| van de maatgevende combinatie, kN.
    pub benodigd_kn: f64,
    /// De maatgevende weerstand V_Rd, kN. Leeg als zij niet kon worden bepaald;
    /// `reden` zegt waarom.
    #[ts(optional)]
    pub aanwezig_kn: Option<f64>,
    /// V_Ed/V_Rd. Leeg als `aanwezig_kn` dat ook is.
    #[ts(optional)]
    pub uc: Option<f64>,
    /// Welke bewijsvoering `aanwezig_kn` leverde.
    #[ts(optional)]
    pub route: Option<Weerstandsroute>,
    /// Welk spoor van 6.2.1(3)/(5) hier geldt.
    pub spoor: Spoor,
    /// Waarom er geen V_Rd is.
    #[ts(optional)]
    pub reden: Option<String>,
    /// A_sl zoals de dwarskrachttoets hem gebruikte, mm².
    pub a_sl_gebruikt_mm2: f64,
    /// De trekwapening die op deze plaats aantoonbaar naar BEIDE kanten
    /// ≥ (l_bd + d) doorloopt, mm² — de deelverzameling die zonder
    /// opleggingsgeometrie aan 6.2.2(1) voldoet. Wordt gemeld, niet opgelegd.
    pub a_sl_doorlopend_mm2: f64,
    /// De combinatie die deze snede maatgevend maakte.
    pub combinatie_id: u32,
}

/// De afleiding van l_bd van één bundel volgens §8.4 — (8.2), (8.3), (8.4) en
/// (8.6)/(8.7).
///
/// Geen kaal getal: wie l_bd in een rapport zet, moet kunnen laten zien welke
/// aanhechtingsomstandigheden zijn aangehouden, welke alfa-factoren golden en
/// welke ondergrens maatgevend was. De schuine tak van figuur 9.2 loopt over
/// deze lengte, dus zij bepaalt rechtstreeks waar de weerstandslijn schuin
/// gaat lopen.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct Verankeringsafleiding {
    /// η₁ volgens 8.4.2(2) — 1,0 bij 'goede' omstandigheden, 0,7 bij "alle
    /// andere gevallen".
    pub eta_1: f64,
    /// De omschrijving zoals de norm haar noemt.
    pub aanhechting: String,
    /// Waarom die omstandigheden gelden (figuur 8.2).
    pub aanhechting_reden: String,
    /// η₂ volgens 8.4.2(2) — de staafdiameterfactor.
    pub eta_2: f64,
    /// f_ctd volgens (3.16), N/mm².
    pub f_ctd_mpa: f64,
    /// f_bd volgens (8.2), N/mm².
    pub f_bd_mpa: f64,
    /// σ_sd zoals in (8.3) ingevuld, N/mm².
    pub sigma_sd_mpa: f64,
    /// l_b,rqd volgens (8.3), mm.
    pub l_b_rqd_mm: f64,
    /// α₁ — vorm van de staaf (tabel 8.2).
    pub alpha_1: f64,
    /// α₂ — betondekking.
    pub alpha_2: f64,
    /// α₃ — opsluiting door niet-gelaste dwarswapening.
    pub alpha_3: f64,
    /// α₄ — opsluiting door gelaste dwarswapening.
    pub alpha_4: f64,
    /// α₅ — opsluiting door dwarsdruk.
    pub alpha_5: f64,
    /// α₁·α₂·α₃·α₄·α₅ met (8.5) toegepast — de factor uit (8.4).
    pub alpha_product: f64,
    /// Heeft (8.5) het product α₂·α₃·α₅ opgetrokken tot 0,7?
    pub begrensd_door_8_5: bool,
    /// (8.4) vóór de ondergrens, mm.
    pub l_bd_berekend_mm: f64,
    /// l_b,min volgens (8.6)/(8.7), mm.
    pub l_b_min_mm: f64,
    /// Is l_b,min maatgevend voor l_bd?
    pub ondergrens_maatgevend: bool,
    /// De rekenwaarde van de verankeringslengte, mm — het antwoord.
    pub l_bd_mm: f64,
    /// Eén regel per alfa-factor: welke tabelregel gold en waarom.
    pub herkomst: Vec<String>,
    /// Kanttekeningen bij deze staaf: aannamen, afwijkingen, grenzen.
    pub toelichting: Vec<String>,
}

/// Eén staafbundel: een groep staven met dezelfde diameter die over hetzelfde
/// stuk staaf doorloopt.
///
/// Dit is de eenheid waarin figuur 9.2 denkt, en zij is NIET hetzelfde als een
/// wapeningszone. Een zone zegt hoevéél staven er op een stuk liggen; een
/// bundel zegt wélke staven het zijn. Loopt de onderwapening van 3Ø16 naar
/// 5Ø16 en weer terug naar 3Ø16, dan zijn dat drie zones maar twee bundels: 3Ø16
/// over de hele lengte en 2Ø16 in het veld. Alleen die tweede bundel heeft
/// staafeinden in het veld, en alleen dáár loopt de weerstandslijn schuin.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct Staafbundel {
    /// Boven- of onderwapening.
    pub side: RebarSide,
    /// Aantal staven in deze bundel.
    pub aantal: u32,
    /// Staafdiameter Φ, mm.
    pub diameter_mm: f64,
    /// A_s van de bundel, mm².
    pub a_s_mm2: f64,
    /// Begin van het staal, mm vanaf de beginknoop.
    pub x_start_mm: f64,
    /// Einde van het staal, mm vanaf de beginknoop.
    pub x_end_mm: f64,
    /// De rekenwaarde van de verankeringslengte, mm.
    pub l_bd_mm: f64,
    /// De volle trekkracht A_s·f_yd van de bundel, kN — de hoogte van de
    /// trapeziumlijn waar de bundel volledig is ontwikkeld.
    pub f_rs_vol_kn: f64,
    /// De hele afleiding van l_bd volgens §8.4.
    pub verankering: Verankeringsafleiding,
    /// "onderwapening 2Ø16 van 1000 tot 4000 mm, l_bd = 705 mm".
    pub label: String,
    /// Kanttekeningen bij deze bundel.
    pub toelichting: Vec<String>,
}

/// De momentendekking van één zijde van de doorsnede.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct Momentdekking {
    /// Boven- of onderwapening.
    pub side: RebarSide,
    /// De lijn, oplopend in x. Op een sprong staan twee punten met dezelfde x.
    pub punten: Vec<Momentpunt>,
    /// De maatgevende plaats — de index in `punten` met de hoogste unity check
    /// BUITEN de eindzones.
    ///
    /// De eindzones blijven erbuiten omdat de norm ze elders regelt: binnen
    /// l_bd van een staafeinde geldt §9.2.1.4/§9.2.1.5 en niet de vrije
    /// dekkingslijn. Zonder die uitzondering zou het maatgevende punt altijd
    /// x = 0 zijn, waar de weerstandslijn per definitie bij nul begint.
    #[ts(optional)]
    pub maatgevend: Option<u32>,
    /// De bundels waaruit de weerstandslijn is opgebouwd.
    pub bundels: Vec<Staafbundel>,
    /// Kanttekeningen bij deze zijde.
    pub toelichting: Vec<String>,
}

/// De dwarskrachtdekking van de staaf.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct Dwarskrachtdekking {
    /// De lijn, oplopend in x. Op een sprong staan twee punten met dezelfde x.
    pub punten: Vec<Dwarskrachtpunt>,
    /// De maatgevende plaats — de index in `punten`.
    ///
    /// Hier wordt NIETS uitgezonderd: 6.2.1(8) is niet gebouwd (het model kent
    /// geen oplegvlak en dus geen dagkant), dus er wordt tot in de oplegging
    /// getoetst. Dat is de veilige kant.
    #[ts(optional)]
    pub maatgevend: Option<u32>,
    /// Kanttekeningen.
    pub toelichting: Vec<String>,
}

/// De eis van §9.2.1.4 en §9.2.1.5 aan één staafuiteinde.
///
/// §9.2.1.5(1) verklaart de oppervlakte-eis van §9.2.1.4(1) uitdrukkelijk ook
/// van toepassing op TUSSENsteunpunten, dus deze eis geldt aan elk uiteinde
/// zonder dat er hoeft te worden geweten wat voor steunpunt daar zit. Wat wél
/// van het soort steunpunt afhangt is de vereiste verankeringsLENGTE, en die
/// wordt gemeten vanaf de raaklijn tussen balk en oplegging (§9.2.1.4(3)) — een
/// maat die dit model niet heeft. Beide kandidaten worden daarom GEMELD en er
/// wordt geen oordeel over de lengte geveld.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SteunpuntEis {
    /// Welk uiteinde.
    pub uiteinde: Staafeinde,
    /// De plaats, mm.
    pub x_mm: f64,
    /// A_s,veld: de grootste onderwapening die ergens in de overspanning ligt, mm².
    pub a_s_veld_mm2: f64,
    /// β₂·A_s,veld met β₂ = 0,25 — §9.2.1.4(1) met de nationale bijlage.
    pub a_s_vereist_mm2: f64,
    /// De onderwapening die hier werkelijk ligt, mm².
    pub a_s_aanwezig_mm2: f64,
    /// Voldoet de oppervlakte-eis?
    pub voldoet_oppervlakte: bool,
    /// F_Ed volgens (9.3) — de hier te verankeren trekkracht, kN.
    pub f_ed_kn: f64,
    /// |V_Ed| waarmee (9.3) is ingevuld, kN.
    pub v_ed_kn: f64,
    /// N_Ed waarmee (9.3) is ingevuld, kN (trek positief).
    pub n_ed_kn: f64,
    /// a_l zoals gebruikt, mm.
    pub a_l_mm: f64,
    /// z zoals gebruikt, mm.
    pub z_mm: f64,
    /// l_bd van de staven die hier eindigen, mm — de lengte die §9.2.1.4(3)
    /// eist, te meten vanaf de raaklijn tussen balk en oplegging. Leeg als er
    /// hier geen onderwapening ligt.
    #[ts(optional)]
    pub l_bd_mm: Option<f64>,
    /// 10Φ — de ondergrens van §9.2.1.5(2) voor RECHTE staven bij een
    /// tussensteunpunt, mm. Leeg als er hier geen onderwapening ligt.
    #[ts(optional)]
    pub min_lengte_recht_mm: Option<f64>,
    /// Kanttekeningen.
    pub toelichting: Vec<String>,
}

/// Het antwoord op [`DekkingslijnVerzoek`]: de hele dekkingslijn van één staaf.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct DekkingslijnAntwoord {
    /// Staafnummer; komt onveranderd terug uit het verzoek.
    pub beam_id: u32,
    /// Doorsnedenaam, bijv. "300 x 500".
    pub section_name: String,
    pub concrete_class: String,
    pub reinforcement_grade: String,
    /// "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".
    pub reinforcement_summary: String,
    /// Staaflengte, mm.
    pub lengte_mm: f64,
    /// f_yd van de wapening, N/mm² — de hoogte van de weerstandslijn is
    /// A_s·f_yd.
    pub f_yd_mpa: f64,
    /// f_ctk;0,05 van de betonsterkteklasse (tabel 3.1), N/mm² — zonder deze
    /// waarde is er geen f_bd en dus geen l_bd.
    pub f_ctk_005_mpa: f64,

    /// a_l — de verschuiving van de momentenlijn, mm. Een LENGTE, geen
    /// richting: bij een omhullende is de benodigde trekkracht op plaats x het
    /// MAXIMUM van de omhullende over het venster [x − a_l; x + a_l].
    pub a_l_mm: f64,
    /// De vindplaats van a_l — "art. 9.2.1.3(2) (9.2)" of "art. 6.2.2(5)".
    pub a_l_artikel: String,
    /// De inwendige hefboomsarm waarmee a_l is bepaald, mm. Let op: voor de
    /// KRACHT F = M_Ed/z is een kleine z ongunstig en wordt z per snede uit de
    /// korf ter plaatse genomen; voor de VERSCHUIVING is een grote z ongunstig
    /// en wordt de grootste d van de staaf gebruikt. Die twee veilige kanten
    /// vallen niet samen, en daarom is dit een eigen veld.
    pub z_voor_a_l_mm: f64,

    /// De onderwapening.
    pub onder: Momentdekking,
    /// De bovenwapening.
    pub boven: Momentdekking,
    /// De dwarskracht.
    pub dwarskracht: Dwarskrachtdekking,
    /// §9.2.1.4 en §9.2.1.5 aan beide staafuiteinden.
    pub steunpunten: Vec<SteunpuntEis>,

    /// De grootste unity check van de momentendekking over beide zijden, buiten
    /// de eindzones. Leeg als er nergens wapening ligt.
    #[ts(optional)]
    pub uc_moment_max: Option<f64>,
    /// De grootste unity check van de dwarskrachtdekking. Leeg als er nergens
    /// een V_Rd kon worden bepaald.
    #[ts(optional)]
    pub uc_dwarskracht_max: Option<f64>,

    /// Kanttekeningen die met de hele lijn mee moeten reizen — waarom a_l zo
    /// is gelezen, wat er met N_Ed is gebeurd, waarom 6.2.1(8) niet is
    /// toegepast en waarom V_Rd,c en V_Rd,s nergens zijn opgeteld.
    pub notes: Vec<String>,
}

// ───────────────────────────────────────────────────────────────────────────
// De dienst
// ───────────────────────────────────────────────────────────────────────────

/// De dekkingslijn van één betonstaaf. Stateloos: alles wat nodig is staat in
/// het verzoek, en er blijft niets achter.
///
/// `Err` waar de norm niet te volgen is zonder iets te verzinnen: een onbekende
/// sterkteklasse of staalsoort, een korf die niet in de doorsnede past, een
/// ongeldige zone-indeling, een ontbrekende staaflengte, een lege omhullende,
/// of z = 0,9·d terwijl er een normaalkracht werkt. Er komt dan géén lijn
/// terug — een dekkingslijn met een verzonnen hefboomsarm ziet er
/// geloofwaardig uit en is dat niet.
pub fn dekkingslijn(verzoek: DekkingslijnVerzoek) -> Result<DekkingslijnAntwoord, String> {
    let b = &verzoek.beam;

    let section = b.section.build()?;
    let beton = concrete_class_by_name(&b.concrete_class)
        .ok_or_else(|| format!("betonsterkteklasse {} onbekend", b.concrete_class))?;
    let staal = reinforcement_grade_by_name(&b.reinforcement_grade)
        .ok_or_else(|| format!("wapeningsstaal {} onbekend", b.reinforcement_grade))?;
    b.cage.validate(&section)?;

    let mat = DesignMaterial::new(beton, staal, b.design_situation, b.steel_branch);
    let lengte_mm = b.length_m * 1000.0;

    // De keuzes van de aanroeper gaan ONVERANDERD door naar de dwarskrachttoets;
    // deze laag vult er niets in. `nabij_steunpunt` blijft leeg — zie de
    // moduletekst waarom die keuze bij een lijn over de hele staaf niet hoort.
    let shear_opts = ShearOptions {
        a_sl_mm2: verzoek.a_sl_mm2,
        cot_theta: verzoek.cot_theta,
        z_mm: verzoek.z_mm,
        nabij_steunpunt: None,
    };

    let inv = kern::DekkingslijnInvoer {
        section: &section,
        cage: &b.cage,
        zones: &b.reinforcement_zones,
        mat: &mat,
        f_ctk_005_mpa: beton.f_ctk_005,
        lengte_mm,
        omhullende: &b.forces_envelope,
        z_mm: verzoek.z_mm,
        c_d_mm: verzoek.c_d_mm,
        shear_opts,
    };
    let d = kern::dekkingslijn(&inv)?;

    let onder = uit_momentdekking(&d.onder);
    let boven = uit_momentdekking(&d.boven);
    let dwarskracht = uit_dwarskrachtdekking(&d.dwarskracht);

    // De twee samenvattende unity checks. Ze worden uit de MAATGEVENDE punten
    // gehaald die de kern zelf heeft aangewezen en niet opnieuw over de lijst
    // gezocht: de kern zondert bij de momentendekking de eindzones uit
    // (§9.2.1.4/§9.2.1.5 gelden daar) en een tweede maximum hier zou die
    // uitzondering stilzwijgend ongedaan maken.
    let uc_moment_max = [&onder, &boven]
        .iter()
        .filter_map(|m| m.maatgevend.and_then(|i| m.punten.get(i as usize)))
        .filter_map(|p| p.uc)
        .fold(None::<f64>, |acc, uc| Some(acc.map_or(uc, |a: f64| a.max(uc))));
    let uc_dwarskracht_max = dwarskracht
        .maatgevend
        .and_then(|i| dwarskracht.punten.get(i as usize))
        .and_then(|p| p.uc);

    Ok(DekkingslijnAntwoord {
        beam_id: b.beam_id,
        section_name: section.name(),
        concrete_class: b.concrete_class.clone(),
        reinforcement_grade: b.reinforcement_grade.clone(),
        reinforcement_summary: b.cage.summary(),
        lengte_mm: d.lengte_mm,
        f_yd_mpa: mat.f_yd(),
        f_ctk_005_mpa: beton.f_ctk_005,
        a_l_mm: d.a_l.a_l_mm,
        a_l_artikel: d.a_l.artikel.to_string(),
        z_voor_a_l_mm: d.z_voor_a_l_mm,
        onder,
        boven,
        dwarskracht,
        steunpunten: d.steunpunten.iter().map(uit_steunpunt).collect(),
        uc_moment_max,
        uc_dwarskracht_max,
        notes: d.toelichting.clone(),
    })
}

fn uit_momentdekking(m: &kern::Momentdekking) -> Momentdekking {
    Momentdekking {
        side: m.side,
        punten: m.punten.iter().map(uit_momentpunt).collect(),
        maatgevend: m.maatgevend.map(|i| i as u32),
        bundels: m.bundels.iter().map(uit_bundel).collect(),
        toelichting: m.toelichting.clone(),
    }
}

fn uit_momentpunt(p: &kern::Momentpunt) -> Momentpunt {
    Momentpunt {
        x_mm: p.x_mm,
        zijde: p.zijde.into(),
        omhullende_kn: p.omhullende_kn,
        benodigd_kn: p.benodigd_kn,
        aanwezig_kn: p.aanwezig_kn,
        aanwezig_volledig_kn: p.aanwezig_volledig_kn,
        ontwikkeling: p.ontwikkeling,
        uc: p.uc,
        tekort_kn: p.tekort_kn,
        bewijs: p.bewijs.into(),
        z_mm: p.z_mm,
        n_ed_kn: p.n_ed_kn,
        m_ed_knm: p.m_ed_knm,
        combinatie_id: p.combinatie_id,
        in_eindzone: p.in_eindzone,
    }
}

fn uit_dwarskrachtdekking(d: &kern::Dwarskrachtdekking) -> Dwarskrachtdekking {
    Dwarskrachtdekking {
        punten: d
            .punten
            .iter()
            .map(|p| Dwarskrachtpunt {
                x_mm: p.x_mm,
                zijde: p.zijde.into(),
                benodigd_kn: p.benodigd_kn,
                aanwezig_kn: p.aanwezig_kn,
                uc: p.uc,
                route: p.route.map(Into::into),
                spoor: p.spoor.into(),
                reden: p.reden.clone(),
                a_sl_gebruikt_mm2: p.a_sl_gebruikt_mm2,
                a_sl_doorlopend_mm2: p.a_sl_doorlopend_mm2,
                combinatie_id: p.combinatie_id,
            })
            .collect(),
        maatgevend: d.maatgevend.map(|i| i as u32),
        toelichting: d.toelichting.clone(),
    }
}

fn uit_bundel(b: &kern::Staafbundel) -> Staafbundel {
    let v = &b.verankering;
    Staafbundel {
        side: b.side,
        aantal: b.aantal,
        diameter_mm: b.diameter_mm,
        a_s_mm2: b.a_s_mm2(),
        x_start_mm: b.x_start_mm,
        x_end_mm: b.x_end_mm,
        l_bd_mm: b.l_bd_mm,
        // f_yd komt uit dezelfde `DesignMaterial` als de rest van de lijn;
        // `Staafbundel::f_rs_vol_kn` is A_s·f_yd/1000 en wordt hier met σ_sd
        // van de verankering ingevuld, want (8.3) vult daar per definitie f_yd
        // in (zie de moduledoc van `verankering`). Zo hoeft f_yd niet als
        // tweede weg door deze functie te reizen.
        f_rs_vol_kn: b.f_rs_vol_kn(v.sigma_sd_mpa),
        verankering: Verankeringsafleiding {
            eta_1: v.eta_1,
            aanhechting: v.aanhechting.omschrijving().to_string(),
            aanhechting_reden: v.aanhechting_reden.clone(),
            eta_2: v.eta_2,
            f_ctd_mpa: v.f_ctd_mpa,
            f_bd_mpa: v.f_bd_mpa,
            sigma_sd_mpa: v.sigma_sd_mpa,
            l_b_rqd_mm: v.l_b_rqd_mm,
            alpha_1: v.alfa.alpha_1,
            alpha_2: v.alfa.alpha_2,
            alpha_3: v.alfa.alpha_3,
            alpha_4: v.alfa.alpha_4,
            alpha_5: v.alfa.alpha_5,
            alpha_product: v.alfa.product,
            begrensd_door_8_5: v.alfa.begrensd_door_8_5,
            l_bd_berekend_mm: v.l_bd_berekend_mm,
            l_b_min_mm: v.l_b_min_mm,
            ondergrens_maatgevend: v.ondergrens_maatgevend,
            l_bd_mm: v.l_bd_mm,
            herkomst: v.alfa.herkomst.clone(),
            toelichting: v.toelichting.clone(),
        },
        label: b.label(),
        toelichting: b.toelichting.clone(),
    }
}

fn uit_steunpunt(s: &kern::SteunpuntEis) -> SteunpuntEis {
    SteunpuntEis {
        uiteinde: s.uiteinde.into(),
        x_mm: s.x_mm,
        a_s_veld_mm2: s.a_s_veld_mm2,
        a_s_vereist_mm2: s.a_s_vereist_mm2,
        a_s_aanwezig_mm2: s.a_s_aanwezig_mm2,
        voldoet_oppervlakte: s.voldoet_oppervlakte,
        f_ed_kn: s.f_ed_kn,
        v_ed_kn: s.v_ed_kn,
        n_ed_kn: s.n_ed_kn,
        a_l_mm: s.a_l_mm,
        z_mm: s.z_mm,
        l_bd_mm: s.l_bd_mm,
        min_lengte_recht_mm: s.min_lengte_recht_mm,
        toelichting: s.toelichting.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mechanics::{ForcePoint, InternalForces};
    use nen_en_1992_1_1::{
        ConcreteSectionInput, ConcreteShape, LongitudinalZone, RebarRow, ReinforcementCage,
        ReinforcementZones,
    };

    const L_MM: f64 = 6000.0;

    fn doorsnede() -> ConcreteSectionInput {
        ConcreteSectionInput {
            shape: ConcreteShape::Rectangle,
            b_mm: 300.0,
            h_mm: 600.0,
            b_w_mm: None,
            h_f_mm: None,
            flange_at_bottom: false,
        }
    }

    fn korf() -> ReinforcementCage {
        ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            stirrup_spacing_mm: Some(150.0),
            stirrup_legs: Some(2),
            ..Default::default()
        }
    }

    fn punt(x_mm: f64, my: f64, vz: f64) -> ForcePoint {
        ForcePoint {
            combination_id: 1,
            position_mm: x_mm,
            forces: InternalForces { my_ed: my, vz_ed: vz, ..Default::default() },
        }
    }

    /// Een vrij opgelegde ligger met een parabolische momentenlijn, bemonsterd
    /// op elf stations. Geen normaalkracht, dus z = 0,9·d mag (6.2.3(1)).
    fn omhullende() -> Vec<ForcePoint> {
        (0..=10)
            .map(|i| {
                let x = L_MM * i as f64 / 10.0;
                let t = x / L_MM;
                // M(x) = 4·M_max·t·(1 − t), V(x) = dM/dx.
                let m = 4.0 * 120.0 * t * (1.0 - t);
                let v = 4.0 * 120.0 * (1.0 - 2.0 * t) / (L_MM / 1000.0);
                punt(x, m, v)
            })
            .collect()
    }

    fn staaf(zones: ReinforcementZones) -> ConcreteBeamCheckInput {
        ConcreteBeamCheckInput {
            beam_id: 7,
            section: doorsnede(),
            concrete_class: "C30/37".to_string(),
            reinforcement_grade: "B500B".to_string(),
            cage: korf(),
            reinforcement_zones: zones,
            length_m: L_MM / 1000.0,
            forces_envelope: omhullende(),
            n_strips: 50,
            steel_branch: Default::default(),
            design_situation: Default::default(),
            apply_min_eccentricity: true,
            sls_frequent_envelope: vec![],
            exposure_class: None,
            structural_class: None,
            aggregate_size_mm: None,
            structural_system: None,
            bar_spacing_mm: None,
            // §5.8: deze staaf is geen kolom in de zin van de toets — er zijn
            // geen kniklengte en geen schoring opgegeven, dus de slankheidsgrens
            // komt als "niet uitgevoerd" terug. Leeg laten is hier het punt: zo
            // blijft deze test precies de test die hij was.
            column: None,
            sls_quasi_permanent_envelope: vec![],
        }
    }

    fn verzoek(zones: ReinforcementZones) -> DekkingslijnVerzoek {
        DekkingslijnVerzoek {
            beam: staaf(zones),
            z_mm: None,
            c_d_mm: None,
            a_sl_mm2: None,
            cot_theta: None,
        }
    }

    /// De dienst geeft precies terug wat de kern rekent: zonder zones is er per
    /// zijde één bundel over de hele staaf, en het staafnummer reist mee.
    #[test]
    fn zonder_zones_een_bundel_per_zijde() {
        let a = dekkingslijn(verzoek(ReinforcementZones::default())).expect("dekkingslijn");
        assert_eq!(a.beam_id, 7);
        assert_eq!(a.onder.bundels.len(), 1);
        assert_eq!(a.onder.bundels[0].aantal, 3);
        assert_eq!(a.boven.bundels.len(), 1);
        assert_eq!(a.boven.bundels[0].aantal, 2);
        assert!((a.lengte_mm - L_MM).abs() < 1e-9);
        assert!(a.f_yd_mpa > 400.0, "B500B levert f_yd = 500/1,15 ≈ 435 N/mm²");
        assert!(a.f_ctk_005_mpa > 0.0, "zonder f_ctk;0,05 is er geen f_bd en dus geen l_bd");
    }

    /// De lijn draagt punten en de beide unity checks komen uit de MAATGEVENDE
    /// punten die de kern zelf heeft aangewezen — niet uit een tweede zoektocht
    /// hier, die de uitzondering voor de eindzones ongedaan zou maken.
    #[test]
    fn de_maatgevende_punten_komen_uit_de_kern() {
        let a = dekkingslijn(verzoek(ReinforcementZones::default())).expect("dekkingslijn");
        assert!(!a.onder.punten.is_empty());
        assert!(!a.dwarskracht.punten.is_empty());
        let i = a.onder.maatgevend.expect("een maatgevend momentpunt") as usize;
        assert!(!a.onder.punten[i].in_eindzone, "de eindzones blijven buiten de keuze");
        let uc_boven = a
            .boven
            .maatgevend
            .and_then(|j| a.boven.punten.get(j as usize))
            .and_then(|p| p.uc);
        let verwacht = match (a.onder.punten[i].uc, uc_boven) {
            (Some(o), Some(b)) => Some(o.max(b)),
            (Some(o), None) => Some(o),
            (None, b) => b,
        };
        assert_eq!(a.uc_moment_max, verwacht);
        let j = a.dwarskracht.maatgevend.expect("een maatgevend dwarskrachtpunt") as usize;
        assert_eq!(a.uc_dwarskracht_max, a.dwarskracht.punten[j].uc);
    }

    /// Staffeling 3/5/3 levert TWEE bundels — de doorgaande 3Ø16 en de
    /// bijgelegde 2Ø16 — en op elke zonegrens staat een sprong: twee punten met
    /// dezelfde x, één links en één rechts.
    #[test]
    fn staffeling_levert_bundels_en_een_sprong_op_elke_zonegrens() {
        let zones = ReinforcementZones {
            longitudinal: vec![
                LongitudinalZone {
                    side: RebarSide::Bottom,
                    row: RebarRow { count: 3, diameter_mm: 16.0 },
                    x_start_mm: 0.0,
                    x_end_mm: 1500.0,
                    bar_shape: Default::default(),
                    casting_position: Default::default(),
                },
                LongitudinalZone {
                    side: RebarSide::Bottom,
                    row: RebarRow { count: 5, diameter_mm: 16.0 },
                    x_start_mm: 1500.0,
                    x_end_mm: 4500.0,
                    bar_shape: Default::default(),
                    casting_position: Default::default(),
                },
                LongitudinalZone {
                    side: RebarSide::Bottom,
                    row: RebarRow { count: 3, diameter_mm: 16.0 },
                    x_start_mm: 4500.0,
                    x_end_mm: L_MM,
                    bar_shape: Default::default(),
                    casting_position: Default::default(),
                },
            ],
            stirrups: vec![],
        };
        let a = dekkingslijn(verzoek(zones)).expect("dekkingslijn");
        assert_eq!(a.onder.bundels.len(), 2, "doorgaande 3Ø16 plus bijgelegde 2Ø16");
        let bij = a
            .onder
            .bundels
            .iter()
            .find(|b| b.aantal == 2)
            .expect("de bijgelegde bundel");
        assert!((bij.x_start_mm - 1500.0).abs() < 1.0);
        assert!((bij.x_end_mm - 4500.0).abs() < 1.0);
        assert!(bij.l_bd_mm > 0.0, "zonder l_bd loopt de schuine tak van figuur 9.2 niet");
        assert!(bij.f_rs_vol_kn > 0.0);

        for grens in [1500.0_f64, 4500.0] {
            let op_grens: Vec<&Momentpunt> = a
                .onder
                .punten
                .iter()
                .filter(|p| (p.x_mm - grens).abs() < 1e-6)
                .collect();
            assert!(
                op_grens.iter().any(|p| p.zijde == Snedezijde::Links)
                    && op_grens.iter().any(|p| p.zijde == Snedezijde::Rechts),
                "op {grens} mm hoort de weerstand te springen, dus twee punten"
            );
        }
    }

    /// Een normaalkracht ZONDER opgegeven z is een fout en geen lijn:
    /// 6.2.3(1) staat z = 0,9·d uitsluitend toe "voor gewapend beton zonder
    /// normaalkracht".
    #[test]
    fn normaalkracht_zonder_z_is_een_fout() {
        let mut v = verzoek(ReinforcementZones::default());
        for p in &mut v.beam.forces_envelope {
            p.forces.n_ed = -250.0;
        }
        let fout = dekkingslijn(v).expect_err("hier hoort geen lijn uit te komen");
        assert!(fout.contains("6.2.3(1)"), "de reden hoort het artikel te noemen: {fout}");
    }

    /// Dezelfde staaf mét opgegeven z levert wél een lijn — de aanroeper die de
    /// werkelijke hefboomsarm kent, komt er dus door.
    #[test]
    fn normaalkracht_met_opgegeven_z_levert_wel_een_lijn() {
        let mut v = verzoek(ReinforcementZones::default());
        for p in &mut v.beam.forces_envelope {
            p.forces.n_ed = -250.0;
        }
        v.z_mm = Some(500.0);
        let a = dekkingslijn(v).expect("met opgegeven z hoort de lijn er te zijn");
        assert!((a.z_voor_a_l_mm - 500.0).abs() < 1e-9);
    }

    /// De dienst is stateloos: twee keer hetzelfde verzoek levert hetzelfde
    /// antwoord, tot op de byte van de JSON.
    #[test]
    fn twee_gelijke_verzoeken_geven_hetzelfde_antwoord() {
        let een = dekkingslijn(verzoek(ReinforcementZones::default())).unwrap();
        let twee = dekkingslijn(verzoek(ReinforcementZones::default())).unwrap();
        assert_eq!(
            serde_json::to_string(&een).unwrap(),
            serde_json::to_string(&twee).unwrap()
        );
    }

    /// Een onbekende sterkteklasse is een fout met de reden, geen lege lijn:
    /// leeg zou als "geen wapening nodig" kunnen lezen.
    #[test]
    fn onbekende_sterkteklasse_is_een_fout_met_reden() {
        let mut v = verzoek(ReinforcementZones::default());
        v.beam.concrete_class = "C999/999".to_string();
        let fout = dekkingslijn(v).expect_err("onbekende klasse hoort te falen");
        assert!(fout.contains("C999/999"), "{fout}");
    }
}
