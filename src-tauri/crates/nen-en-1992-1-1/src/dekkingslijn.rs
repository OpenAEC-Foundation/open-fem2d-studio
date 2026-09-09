//! §9.2.1.3 — de dekkingslijn: figuur 9.2 als GEGEVENS.
//!
//! Deze module levert geen plaatje maar de getallen waarmee er één te tekenen
//! is: per plaats langs de staaf de BENODIGDE en de AANWEZIGE waarde, met per
//! punt het bewijs dat daar gold. Er zijn twee lijnen — één voor het moment en
//! één voor de dwarskracht — en zij worden op verschillende manieren opgebouwd,
//! want de norm bouwt ze ook verschillend op.
//!
//! # Wat figuur 9.2 tekent
//!
//! De verklaring bij figuur 9.2 (van de gerenderde bladzijde 201 afgelezen,
//! want zij staat als beeld in de PDF) noemt drie lijnen:
//!
//! ```text
//!   A   omhullende van M_Ed/z + N_Ed
//!   B   optredende trekkracht F_s
//!   C   weerstandbiedende trekkracht F_Rs
//! ```
//!
//! Alle drie zijn KRACHTEN, geen momenten. Dat is geen tekenkeuze maar de kern
//! van het artikel: de weerstandbiedende lijn C is een optelling van
//! staafoppervlakten maal f_yd, en die is lineair in het aantal staven. Op
//! momentniveau zou elke snede een nieuwe evenwichtsberekening vragen (de
//! hefboomsarm verandert met de wapening mee); op krachtniveau is één snede een
//! optelling. Deze module rekent daarom op krachtniveau, zoals de figuur.
//!
//! * **A** is de omhullende zelf: M_Ed/z + N_Ed, per zijde en per combinatie.
//! * **B** is A ná de verschuiving over a_l uit §9.2.1.3(2) — zie
//!   [`crate::verankering::verschuiving`] voor a_l en zijn grondslag.
//! * **C** is de trapeziumlijn van de aanwezige staven: vol waar zij volledig
//!   zijn ontwikkeld, en binnen l_bd van elk staafeinde LINEAIR aflopend naar
//!   nul. Art. 9.2.1.3(3): "Met de weerstand van staven binnen hun
//!   verankeringslengte mag rekening zijn gehouden, uitgaande van een lineair
//!   krachtverloop, zie figuur 9.2." Die tak is de gekozen weg;
//!   [`crate::verankering::opneembare_krachtfractie`] rekent hem uit.
//!
//! # De verschuiving over a_l bij een OMHULLENDE
//!
//! Art. 6.2.2(5) zegt dat de M_Ed-lijn "over een afstand a_l = d in de
//! ONGUNSTIGE richting" wordt verschoven. Bij één momentenlijn is die richting
//! aanwijsbaar: naar de steunpunten toe voor een veldmoment, het veld in voor
//! een steunpuntsmoment. Bij een OMHULLENDE van tientallen combinaties is er
//! niet één richting meer.
//!
//! Deze module leest de regel daarom puntsgewijs: de benodigde trekkracht op
//! plaats x is het MAXIMUM van A over het gesloten venster
//! [x − a_l, x + a_l] ∩ [0, L]. Voor een monotone tak van de lijn valt dat
//! samen met de verschuiving die de norm voorschrijft — op een stijgende tak
//! ligt het maximum in x + a_l, op een dalende in x − a_l — en waar de
//! omhullende binnen het venster niet monotoon is, ligt de vensterwaarde er
//! nooit ONDER. Het is dus de veilige lezing, en zij valt met de norm samen
//! waar de norm eenduidig is.
//!
//! # Wat er met N_Ed gebeurt
//!
//! De figuur schrijft `M_Ed/z + N_Ed`. Een TREKkracht wordt hier volledig aan
//! beide trekranden toegekend: dat verhoogt de benodigde kracht en ligt aan de
//! veilige kant. Een DRUKkracht wordt NIET verrekend. De norm laat dat toe
//! ("die moet zijn opgeteld bij of afgetrokken van de trekkracht", 9.2.1.4(2)),
//! maar het aftrekken van de volle drukkracht van de trekgordel veronderstelt
//! dat die druk daar ook werkelijk aangrijpt, en dat volgt pas uit een
//! doorsnede-evenwicht dat deze module niet maakt. Niet verrekenen is de
//! veilige kant; de onverrekende N_Ed staat per punt in
//! [`Momentpunt::n_ed_kn`], zodat het rapport kan laten zien wat er is
//! weggelaten.
//!
//! # De dwarskrachtlijn: V_Rd,c en V_Rd,s worden NIET opgeteld
//!
//! Dat is nagekeken in de normtekst zelf, niet aangenomen:
//!
//! * **6.2.1(2)**: "De dwarskrachtweerstand van een element met
//!   dwarskrachtwapening is gelijk aan: V_Rd = V_Rd,s + V_ccd + V_td (6.1)."
//!   In die som staat GEEN V_Rd,c; V_ccd en V_td zijn de componenten bij een
//!   verlopende hoogte (figuur 6.2) en zijn bij constante hoogte nul.
//! * **6.2.3(3)**: "Voor elementen met verticale dwarskrachtwapening is de
//!   dwarskrachtweerstand V_Rd de KLEINSTE WAARDE van: (6.8) … en (6.9)."
//!   Een kleinste-van is geen som, en (6.8) noch (6.9) draagt een betonterm.
//! * **6.2.1(3)**: "In gebieden van het element waar geldt V_Ed ≤ V_Rd,c is
//!   geen berekende dwarskrachtwapening nodig." Dat is de ANDERE bewijsvoering,
//!   niet een bijdrage aan de eerste.
//!
//! De teruggegeven lijn nodigt daarom niet uit tot optellen: een
//! [`Dwarskrachtpunt`] draagt ÉÉN `aanwezig_kn` met daarbij de
//! [`Weerstandsroute`] die hem leverde. V_Rd,c en V_Rd,s staan er met opzet
//! niet als twee optelbare velden naast elkaar in. Welke van beide bewijzen op
//! een plaats het gunstigst is, kiest [`shear_resistance`] zelf.
//!
//! # 6.2.1(8) is NIET gebouwd
//!
//! De normtekst is compleet en luidt: "Voor elementen die voornamelijk zijn
//! belast door gelijkmatig verdeelde belastingen hoeft de dwarskrachtweerstand
//! niet te zijn gecontroleerd binnen een afstand d vanaf de DAGKANT van de
//! oplegging. Elke vereiste dwarskrachtwapening behoort door te lopen tot de
//! oplegging. Aanvullend behoort te zijn getoetst of de dwarskracht bij de
//! oplegging niet groter is dan V_Rd,max."
//!
//! Voor de eerste zin is de dagkant van de oplegging nodig, dus de BREEDTE van
//! het oplegvlak. In dit model is een oplegging een KNOOP met een type en
//! eventueel een veerstijfheid — er is geen oplegvlak en dus geen dagkant, en
//! die afstand is niet vast te stellen. Er wordt hier dan ook niets verlicht: de
//! lijn begint op x = 0 en loopt door tot x = L, en toetst dus tot in de
//! oplegging. Dat is de veilige kant — daar is V_Ed het grootst. De tweede en
//! derde zin blijven daarmee vanzelf gerespecteerd.
//!
//! # A_sl van 6.2.2(1) wordt gemeld, niet opgelegd
//!
//! [`ShearOptions::a_sl_mm2`] blijft precies zoals de aanroeper hem zet. Laat
//! hij hem leeg, dan neemt [`shear_resistance`] de trekrij van de korf die op
//! DIE plaats geldt — met zones is dat al een stuk scherper dan één korf voor
//! de hele staaf, maar het is nog niet de regel van 6.2.2(1), die eist dat de
//! staaf ≥ (l_bd + d) VOORBIJ de doorsnede doorloopt (figuur 6.3).
//!
//! Die regel hier zelf opleggen is niet gedaan, en dat is een bewuste keuze.
//! Figuur 6.3 meet l_bd + d in de richting waarin de schuine scheur loopt, dus
//! naar de oplegging toe. Welke kant dat is, en of de staaf daar in
//! werkelijkheid doorloopt, hangt af van de opleggingsgeometrie die dit model
//! niet heeft: elke staaf houdt in het model bij x = 0 en x = L op, terwijl zij
//! in werkelijkheid de oplegging in loopt en daar volgens §9.2.1.4(3) is
//! verankerd. A_sl bij het steunpunt op nul zetten zou dus een gevolg zijn van
//! een ontbrekend model, niet van de constructie. Wat er wél gebeurt: per punt
//! wordt zowel de GEBRUIKTE A_sl gemeld als de deelverzameling die binnen de
//! staaflengte aantoonbaar naar BEIDE kanten ≥ (l_bd + d) doorloopt, zodat het
//! verschil zichtbaar is en een aanroeper die het beter weet
//! [`ShearOptions::a_sl_mm2`] kan vullen.
//!
//! # Wat deze module verder NIET doet
//!
//! * **Zij tekent niet.** De uitkomst is een lijst punten; het tekenwerk zit
//!   elders.
//! * **Zij raakt de orchestrator niet aan.** Net als [`crate::dwarskracht`] en
//!   [`crate::scheurwijdte`] is dit een zuivere module met eigen tests.
//! * **Zij toetst §9.2.1.1 niet** (A_s,min/A_s,max) en §9.2.2 evenmin
//!   (ρ_w,min, s_l,max, s_t,max). Dat is detaillering en woont in
//!   [`crate::detaillering`].
//! * **Zij kent geen opgebogen staven** (§9.2.1.3(4)). Het zonemodel drukt
//!   alleen rechte staaflengtes uit;
//!   [`crate::verankering::min_verankering_opgebogen_staaf_mm`] staat klaar
//!   voor wie ze ooit toevoegt.
//! * **Zij verrekent de overlappingslengte van §8.7.3 niet.** Een overlapping
//!   is geen inkorting; l₀ hoort niet in de weerstandslijn thuis.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};

use crate::deelstappen::nl;
use crate::dwarskracht::{
    shear_resistance, ShearOptions, ShearResistance, Spoor, Weerstandsroute, COT_THETA_MAX,
};
use crate::section::{
    ConcreteSection, RebarRow, RebarSide, ReinforcementCage, ReinforcementZones,
};
use crate::stress_strain::DesignMaterial;
use crate::verankering::{
    aanhechting, as_steunpunt_vereist_mm2, f_ed_eindoplegging_kn, min_verankering_tussensteunpunt_mm,
    opneembare_krachtfractie, verankeringslengte, verschuiving, Staafvorm, Stortpositie,
    Tussensteunpuntvorm, Verankering, VerankeringInvoer, Verankeringssoort, Verschuiving,
    Verschuivingsgrondslag, BETA_2,
};

// ───────────────────────────────────────────────────────────────────────────
// Vaste maten van deze module
// ───────────────────────────────────────────────────────────────────────────

/// De afstand waarmee de LINKERkant van een sprong wordt bemonsterd, in mm.
///
/// Op een zonegrens verandert de korf, en daarmee springt de weerstand.
/// [`ReinforcementZones::cage_at_mm`] is links gesloten en rechts open, dus op
/// de grens zelf levert hij de RECHTER korf. Om de linkerwaarde te krijgen
/// wordt één micrometer vóór de grens bemonsterd — ruim boven
/// [`crate::section::ZONE_TOLERANCE_MM`] (1 nm), zodat de rechterzone niet
/// meer meetelt, en zó klein dat de krachten er niet meetbaar van veranderen.
///
/// De uitkomst draagt de grens zelf als `x_mm` en de kant in
/// [`Snedezijde`], zodat een tekenaar twee punten op dezelfde x krijgt: precies
/// wat een sprong is.
pub const SPRONG_OFFSET_MM: f64 = 1e-3;

/// De marge waarmee twee plaatsen langs de staaf als dezelfde plaats gelden,
/// mm. Ruimer dan de zonetolerantie, want dit vangt ook de ruis op van
/// stationsposities die uit een deling van de staaflengte komen.
pub const X_TOLERANTIE_MM: f64 = 1e-6;

/// De grens waarboven een normaalkracht 6.2.3(1) blokkeert, kN. Gelijk aan de
/// grens die [`crate::dwarskracht`] hanteert, zodat beide modules dezelfde
/// doorsnede op dezelfde manier beoordelen.
const N_TOLERANTIE_KN: f64 = 1e-6;

// ───────────────────────────────────────────────────────────────────────────
// Uitkomsttypen
// ───────────────────────────────────────────────────────────────────────────

/// Aan welke kant van een sprong een punt ligt.
///
/// Op een zonegrens verandert de korf en springt de weerstand. Interpoleren
/// over een sprong heeft geen betekenis; er staan daarom twee punten op
/// dezelfde `x_mm`, met deze aanduiding erbij.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Snedezijde {
    /// Er is hier geen sprong; één punt volstaat.
    Enkel,
    /// De waarde die LINKS van de grens geldt.
    Links,
    /// De waarde die RECHTS van de grens geldt.
    Rechts,
}

impl Snedezijde {
    /// Aanduiding voor het rapport.
    pub fn label(self) -> &'static str {
        match self {
            Snedezijde::Enkel => "",
            Snedezijde::Links => "links van de zonegrens",
            Snedezijde::Rechts => "rechts van de zonegrens",
        }
    }
}

/// Welk bewijs de weerstandbiedende trekkracht op een plaats levert.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

impl MomentBewijs {
    /// Waarom deze weerstand geldt.
    pub fn omschrijving(self) -> &'static str {
        match self {
            MomentBewijs::GeenWapening => {
                "Aan deze zijde ligt hier geen langswapening; de weerstandbiedende trekkracht \
                 is nul."
            }
            MomentBewijs::VolledigOntwikkeld => {
                "Alle staven die hier liggen zijn volledig ontwikkeld: zij liggen verder dan \
                 l_bd van elk van hun uiteinden en leveren A_s·f_yd."
            }
            MomentBewijs::BinnenVerankeringslengte => {
                "Ten minste één staafbundel ligt hier binnen zijn verankeringslengte. \
                 Art. 9.2.1.3(3) laat toe die staven mee te tellen met een LINEAIR \
                 krachtverloop: nul op het staafeinde, vol op l_bd ervandaan (figuur 9.2)."
            }
        }
    }

    /// De vindplaats.
    pub fn artikel(self) -> &'static str {
        match self {
            MomentBewijs::GeenWapening => "art. 9.2.1.3(1)",
            MomentBewijs::VolledigOntwikkeld => "art. 9.2.1.3(1)",
            MomentBewijs::BinnenVerankeringslengte => "art. 9.2.1.3(3), figuur 9.2",
        }
    }
}

/// Eén plaats op de MOMENTdekkingslijn, voor één zijde van de doorsnede.
///
/// Alle krachten in kN. `benodigd_kn` is regel B van figuur 9.2 en
/// `aanwezig_kn` is regel C; `omhullende_kn` is regel A, de onverschoven
/// waarde, zodat het rapport kan laten zien wat de verschuiving heeft gedaan.
#[derive(Clone, Debug, PartialEq)]
pub struct Momentpunt {
    /// Plaats langs de staaf, mm vanaf het beginknoop.
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
    /// F_s/F_Rs. `None` als er geen wapening ligt — dan is er geen verhouding,
    /// alleen een tekort.
    pub uc: Option<f64>,
    /// max(0; F_s − F_Rs), kN. Ook zonder unity check is dit het tekort.
    pub tekort_kn: f64,
    /// Welk bewijs hier gold.
    pub bewijs: MomentBewijs,
    /// De inwendige hefboomsarm z waarmee M_Ed hier op kracht is omgerekend,
    /// mm.
    pub z_mm: f64,
    /// De normaalkracht van de maatgevende combinatie op deze plaats, kN
    /// (trek positief). Een DRUKkracht is niet in `omhullende_kn` verrekend;
    /// zie de moduletekst.
    pub n_ed_kn: f64,
    /// Het buigend moment van de maatgevende combinatie op deze plaats, kNm.
    pub m_ed_knm: f64,
    /// De combinatie die `omhullende_kn` op deze plaats leverde.
    pub combinatie_id: u32,
    /// Ligt dit punt binnen l_bd van een staafeinde dat op een STAAFEINDE
    /// valt? Daar geldt niet de vrije dekkingslijn maar §9.2.1.4/§9.2.1.5, en
    /// die eist een verankeringslengte die vóórbij het steunpunt doorloopt —
    /// buiten het model dus. Zie [`Dekkingslijn::steunpunten`].
    pub in_eindzone: bool,
}

/// Eén plaats op de DWARSKRACHTdekkingslijn.
///
/// Er is met opzet ÉÉN `aanwezig_kn`, met de route die hem leverde ernaast.
/// V_Rd,c en V_Rd,s staan hier niet als twee optelbare velden; zie de
/// moduletekst voor de normplaatsen waarom optellen niet mag.
#[derive(Clone, Debug, PartialEq)]
pub struct Dwarskrachtpunt {
    /// Plaats langs de staaf, mm vanaf het beginknoop.
    pub x_mm: f64,
    /// Aan welke kant van een sprong dit punt ligt.
    pub zijde: Snedezijde,
    /// |V_Ed| van de maatgevende combinatie, kN.
    pub benodigd_kn: f64,
    /// De maatgevende weerstand V_Rd, kN. `None` als zij niet kon worden
    /// bepaald; `reden` zegt waarom.
    pub aanwezig_kn: Option<f64>,
    /// V_Ed/V_Rd. `None` als `aanwezig_kn` dat ook is.
    pub uc: Option<f64>,
    /// Welke bewijsvoering `aanwezig_kn` leverde.
    pub route: Option<Weerstandsroute>,
    /// Welk spoor van 6.2.1(3)/(5) hier geldt — de ONTWERPvraag, los van de
    /// weerstandsroute.
    pub spoor: Spoor,
    /// Waarom er geen V_Rd is.
    pub reden: Option<String>,
    /// A_sl zoals [`shear_resistance`] hem gebruikte, mm².
    pub a_sl_gebruikt_mm2: f64,
    /// De trekwapening die op deze plaats aantoonbaar naar BEIDE kanten
    /// ≥ (l_bd + d) doorloopt, mm² — de deelverzameling die zonder
    /// opleggingsgeometrie aan 6.2.2(1) voldoet. Zie de moduletekst; deze
    /// waarde wordt gemeld, niet opgelegd.
    pub a_sl_doorlopend_mm2: f64,
    /// De combinatie die deze snede maatgevend maakte.
    pub combinatie_id: u32,
}

/// Eén staafbundel: een groep staven met dezelfde diameter die over hetzelfde
/// stuk staaf doorloopt.
///
/// Dit is de eenheid waarin figuur 9.2 denkt, en zij is NIET hetzelfde als een
/// [`crate::section::LongitudinalZone`]. Een zone zegt hoeveel staven er op een
/// stuk liggen; een bundel zegt welke staven het zijn. Loopt de onderwapening
/// van 3Ø16 naar 5Ø16 en weer terug naar 3Ø16, dan zijn dat drie zones maar
/// twee bundels: 3Ø16 over de hele lengte en 2Ø16 in het veld. Alleen die
/// tweede bundel heeft staafeinden in het veld, en alleen dáár loopt de
/// weerstandslijn schuin.
#[derive(Clone, Debug, PartialEq)]
pub struct Staafbundel {
    /// Boven- of onderwapening.
    pub side: RebarSide,
    /// Aantal staven in deze bundel.
    pub aantal: u32,
    /// Staafdiameter Φ, mm.
    pub diameter_mm: f64,
    /// Begin van het staal, mm vanaf het beginknoop.
    pub x_start_mm: f64,
    /// Einde van het staal, mm vanaf het beginknoop.
    pub x_end_mm: f64,
    /// De rekenwaarde van de verankeringslengte, mm — de schuine tak van
    /// figuur 9.2 loopt over deze lengte.
    pub l_bd_mm: f64,
    /// De hele afleiding van l_bd volgens §8.4, voor het rapport.
    pub verankering: Verankering,
    /// De staafvorm die is aangehouden — de ONGUNSTIGSTE van de zones die deze
    /// bundel doorkruist.
    pub vorm: Staafvorm,
    /// De stortpositie die is aangehouden — de ongunstigste van de zones die
    /// deze bundel doorkruist.
    pub stortpositie: Stortpositie,
    /// Kanttekeningen bij deze bundel.
    pub toelichting: Vec<String>,
}

impl Staafbundel {
    /// A_s van de bundel, mm².
    pub fn a_s_mm2(&self) -> f64 {
        RebarRow { count: self.aantal, diameter_mm: self.diameter_mm }.area_mm2()
    }

    /// De volle trekkracht A_s·f_yd van de bundel, kN.
    pub fn f_rs_vol_kn(&self, f_yd_mpa: f64) -> f64 {
        self.a_s_mm2() * f_yd_mpa / 1000.0
    }

    /// Ligt `x_mm` binnen deze bundel?
    pub fn dekt(&self, x_mm: f64) -> bool {
        x_mm >= self.x_start_mm - X_TOLERANTIE_MM && x_mm <= self.x_end_mm + X_TOLERANTIE_MM
    }

    /// De fractie van de staafkracht die op plaats `x_mm` kan worden opgenomen,
    /// 0…1 — art. 9.2.1.3(3), de schuine tak van figuur 9.2.
    ///
    /// Elk van de twee staafeinden legt zijn eigen lineaire tak op; de kleinste
    /// van beide is maatgevend. Buiten de bundel is de uitkomst nul.
    pub fn ontwikkeling_op(&self, x_mm: f64) -> f64 {
        if !self.dekt(x_mm) {
            return 0.0;
        }
        let vanaf_begin = opneembare_krachtfractie(x_mm - self.x_start_mm, self.l_bd_mm);
        let vanaf_eind = opneembare_krachtfractie(self.x_end_mm - x_mm, self.l_bd_mm);
        vanaf_begin.min(vanaf_eind)
    }

    /// "onderwapening 2Ø16 van 1000 tot 4000 mm, l_bd = 705 mm".
    pub fn label(&self) -> String {
        format!(
            "{} {}Ø{} van {} tot {} mm, l_bd = {} mm",
            self.side.label(),
            self.aantal,
            nl(self.diameter_mm, 0),
            nl(self.x_start_mm, 0),
            nl(self.x_end_mm, 0),
            nl(self.l_bd_mm, 0)
        )
    }
}

/// Welk uiteinde van de staaf.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Staafeinde {
    /// x = 0.
    Begin,
    /// x = L.
    Eind,
}

impl Staafeinde {
    pub fn label(self) -> &'static str {
        match self {
            Staafeinde::Begin => "beginknoop (x = 0)",
            Staafeinde::Eind => "eindknoop (x = L)",
        }
    }
}

/// De eis van §9.2.1.4 en §9.2.1.5 aan één staafuiteinde: hoeveel
/// onderwapening moet daar doorlopen, en welke trekkracht moet daar zijn
/// verankerd.
///
/// §9.2.1.5(1) verklaart de oppervlakte-eis van §9.2.1.4(1) uitdrukkelijk ook
/// van toepassing op TUSSENsteunpunten, dus deze eis geldt aan elk uiteinde
/// zonder dat de module hoeft te weten wat voor steunpunt daar zit. Wat wél van
/// het soort steunpunt afhangt is de vereiste verankeringsLENGTE, en die
/// lengte wordt gemeten vanaf de raaklijn tussen balk en oplegging
/// (§9.2.1.4(3)) — een maat die dit model niet heeft. Daarom worden beide
/// kandidaten gemeld en wordt er geen oordeel over de lengte geveld.
#[derive(Clone, Debug, PartialEq)]
pub struct SteunpuntEis {
    /// Welk uiteinde.
    pub uiteinde: Staafeinde,
    /// De plaats, mm.
    pub x_mm: f64,
    /// A_s,veld: de grootste onderwapening die ergens in de overspanning ligt,
    /// mm².
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
    /// eist, te meten vanaf de raaklijn tussen balk en oplegging. `None` als
    /// er hier geen onderwapening ligt.
    pub l_bd_mm: Option<f64>,
    /// 10Φ — de ondergrens van §9.2.1.5(2) voor RECHTE staven bij een
    /// tussensteunpunt, mm. `None` als er hier geen onderwapening ligt. Voor
    /// haken en ombuigingen geldt de doorndiameter uit tabel 8.1N; die is voor
    /// deze module niet uitgelezen en wordt dus niet gemeld.
    pub min_lengte_recht_mm: Option<f64>,
    /// Kanttekeningen.
    pub toelichting: Vec<String>,
}

/// De momentendekking van één zijde van de doorsnede.
#[derive(Clone, Debug, PartialEq)]
pub struct Momentdekking {
    /// Boven- of onderwapening.
    pub side: RebarSide,
    /// De lijn, oplopend in x. Op een sprong staan twee punten met dezelfde x.
    pub punten: Vec<Momentpunt>,
    /// De maatgevende plaats — de index in `punten` met de hoogste unity check
    /// BUITEN de eindzones.
    ///
    /// De eindzones blijven erbuiten omdat de norm ze elders regelt: binnen
    /// l_bd van een staafeinde dat op een steunpunt valt, geldt §9.2.1.4 /
    /// §9.2.1.5 en niet de vrije dekkingslijn. Zonder die uitzondering zou het
    /// maatgevende punt altijd x = 0 zijn, waar de weerstandslijn per definitie
    /// bij nul begint. Zie [`Dekkingslijn::steunpunten`] voor die toets, en
    /// [`Momentpunt::in_eindzone`] voor wie het anders wil doen.
    pub maatgevend: Option<usize>,
    /// De bundels waaruit de weerstandslijn is opgebouwd.
    pub bundels: Vec<Staafbundel>,
    /// Kanttekeningen bij deze zijde.
    pub toelichting: Vec<String>,
}

impl Momentdekking {
    /// Het maatgevende punt, als er een is.
    pub fn maatgevend_punt(&self) -> Option<&Momentpunt> {
        self.maatgevend.and_then(|i| self.punten.get(i))
    }
}

/// De dwarskrachtdekking van de staaf.
#[derive(Clone, Debug, PartialEq)]
pub struct Dwarskrachtdekking {
    /// De lijn, oplopend in x. Op een sprong staan twee punten met dezelfde x.
    pub punten: Vec<Dwarskrachtpunt>,
    /// De maatgevende plaats — de index in `punten`.
    ///
    /// Hier wordt NIETS uitgezonderd: 6.2.1(8) is niet gebouwd (zie de
    /// moduletekst), dus er wordt tot in de oplegging getoetst.
    pub maatgevend: Option<usize>,
    /// De volledige afleiding van de maatgevende snede, voor het rapport.
    pub maatgevende_weerstand: Option<ShearResistance>,
    /// Kanttekeningen.
    pub toelichting: Vec<String>,
}

impl Dwarskrachtdekking {
    /// Het maatgevende punt, als er een is.
    pub fn maatgevend_punt(&self) -> Option<&Dwarskrachtpunt> {
        self.maatgevend.and_then(|i| self.punten.get(i))
    }
}

/// De hele dekkingslijn van één staaf.
#[derive(Clone, Debug, PartialEq)]
pub struct Dekkingslijn {
    /// Staaflengte, mm.
    pub lengte_mm: f64,
    /// a_l met zijn grondslag — §9.2.1.3(2) of 6.2.2(5).
    pub a_l: Verschuiving,
    /// De inwendige hefboomsarm waarmee a_l is bepaald, mm.
    pub z_voor_a_l_mm: f64,
    /// De onderwapening.
    pub onder: Momentdekking,
    /// De bovenwapening.
    pub boven: Momentdekking,
    /// De dwarskracht.
    pub dwarskracht: Dwarskrachtdekking,
    /// §9.2.1.4 en §9.2.1.5 aan beide staafuiteinden.
    pub steunpunten: Vec<SteunpuntEis>,
    /// Kanttekeningen die met de hele lijn mee moeten reizen.
    pub toelichting: Vec<String>,
}

// ───────────────────────────────────────────────────────────────────────────
// Invoer
// ───────────────────────────────────────────────────────────────────────────

/// De invoer van [`dekkingslijn`].
pub struct DekkingslijnInvoer<'a> {
    /// De betondoorsnede.
    pub section: &'a ConcreteSection,
    /// De basiskorf. Waar de zones niets zeggen, geldt deze.
    pub cage: &'a ReinforcementCage,
    /// De wapening die langs de staaf verandert. Leeg = de basiskorf geldt over
    /// de hele lengte, en dan is er per zijde één bundel over [0, L].
    pub zones: &'a ReinforcementZones,
    /// Beton- en staalgegevens.
    pub mat: &'a DesignMaterial,
    /// f_ctk;0,05 van de betonsterkteklasse, N/mm² (tabel 3.1).
    ///
    /// Staat niet in [`DesignMaterial`] en moet daarom apart mee: (8.2) heeft
    /// hem nodig voor f_bd, en zonder f_bd is er geen l_bd en dus geen schuine
    /// tak.
    pub f_ctk_005_mpa: f64,
    /// Staaflengte, mm.
    pub lengte_mm: f64,
    /// De omhullende: alle stations van alle combinaties.
    pub omhullende: &'a [ForcePoint],
    /// De inwendige hefboomsarm z, mm.
    ///
    /// `None` → z = 0,9·d per snede, maar **alleen** als er nergens een
    /// normaalkracht werkt: 6.2.3(1) staat die vereenvoudiging uitsluitend toe
    /// "voor gewapend beton zonder normaalkracht". Werkt er wél een
    /// normaalkracht, dan levert [`dekkingslijn`] een `Err` met die reden in
    /// plaats van stilzwijgend 0,9·d in te vullen.
    pub z_mm: Option<f64>,
    /// c_d volgens figuur 8.3, mm — zie [`crate::verankering::c_d_mm`].
    ///
    /// `None` → c_d = 0, de ONBEPAALDE waarde. Dan wordt α₂ = 1,0 en is l_bd
    /// maximaal; dat is de veilige kant en het is dezelfde keuze die
    /// [`crate::section::LongitudinalZone`] al maakt. Let op het gevolg:
    /// [`Staafvorm::AndersDanRecht`] verkort l_bd dan NIET, want α₁ = 0,7 vergt
    /// c_d > 3Φ.
    pub c_d_mm: Option<f64>,
    /// De keuzes voor de dwarskrachttoets. Worden ONVERANDERD doorgegeven aan
    /// [`shear_resistance`]; deze module vult er niets in.
    pub shear_opts: ShearOptions,
}

// ───────────────────────────────────────────────────────────────────────────
// De rekengang
// ───────────────────────────────────────────────────────────────────────────

/// De dekkingslijn van één staaf — §9.2.1.3 met figuur 9.2, en §6.2 voor de
/// dwarskracht.
///
/// `Err` waar de norm niet te volgen is zonder iets te verzinnen: een lege of
/// ongeldige zone-indeling, een ontbrekende staaflengte, een omhullende zonder
/// punten, of z = 0,9·d terwijl er een normaalkracht werkt.
pub fn dekkingslijn(inv: &DekkingslijnInvoer<'_>) -> Result<Dekkingslijn, String> {
    if !(inv.lengte_mm > 0.0) {
        return Err(format!(
            "de staaflengte is {} mm; zonder lengte is er geen dekkingslijn",
            nl(inv.lengte_mm, 1)
        ));
    }
    if inv.omhullende.is_empty() {
        return Err(
            "de omhullende is leeg; zonder krachten is er niets te dekken".to_string()
        );
    }
    inv.zones
        .validate(inv.cage, inv.section, inv.lengte_mm)
        .map_err(|e| format!("de wapeningszones deugen niet: {e}"))?;
    // Op z wordt gedeeld — in M_Ed/z en in (9.3). Een nul of een negatieve
    // hefboomsarm is geen invoer maar een vergissing, en die wordt hier gemeld
    // in plaats van als oneindige trekkracht doorgegeven.
    if let Some(z) = inv.z_mm {
        if !(z > 0.0) {
            return Err(format!(
                "de opgegeven inwendige hefboomsarm z is {} mm; z moet groter dan nul zijn,                  want de trekkracht wordt volgens figuur 9.2 als M_Ed/z bepaald",
                nl(z, 1)
            ));
        }
    }

    let h = inv.section.h_mm;
    let f_yd = inv.mat.f_yd();
    let reeksen = Reeksen::nieuw(inv.omhullende);

    // ── z en a_l ─────────────────────────────────────────────────────────────
    //
    // Twee verschillende veilige kanten, en die vallen niet samen:
    //
    // * voor de KRACHT F = M_Ed/z is een KLEINE z ongunstig, dus z wordt per
    //   snede uit de korf ter plaatse bepaald en nergens gemiddeld;
    // * voor de VERSCHUIVING a_l = z(cot θ − cot α)/2 is een GROTE z ongunstig,
    //   dus daar wordt de grootste d van de hele staaf gebruikt.
    let n_max_kn = inv
        .omhullende
        .iter()
        .fold(0.0_f64, |m, p| m.max(p.forces.n_ed.abs()));
    if inv.z_mm.is_none() && n_max_kn > N_TOLERANTIE_KN {
        return Err(format!(
            "de inwendige hefboomsarm z is niet opgegeven en er werkt een normaalkracht \
             (max |N_Ed| = {} kN). 6.2.3(1) staat de vereenvoudiging z = 0,9·d uitsluitend toe \
             \"in de dwarskrachtberekening van gewapend beton zonder normaalkracht\". Geef z op \
             — de werkelijke hefboomsarm bij het buigend moment — dan volgt de dekkingslijn \
             alsnog.",
            nl(n_max_kn, 1)
        ));
    }

    let mut toelichting: Vec<String> = Vec::new();

    // ── De bundels per zijde ────────────────────────────────────────────────
    let bundels_onder =
        bouw_bundels(inv, RebarSide::Bottom).map_err(|e| format!("onderwapening: {e}"))?;
    let bundels_boven =
        bouw_bundels(inv, RebarSide::Top).map_err(|e| format!("bovenwapening: {e}"))?;

    // ── d_max, z en a_l ─────────────────────────────────────────────────────
    //
    // Dit moet VÓÓR het raster: de plaatsen station ± a_l zijn knikpunten van
    // de verschoven lijn B en horen dus in het raster te staan.
    let mut d_max = 0.0_f64;
    for x in monsterplaatsen_korf(inv) {
        let korf = inv.zones.cage_at_mm(inv.cage, x);
        d_max = d_max.max(d_zijde(&korf, h, RebarSide::Bottom));
        d_max = d_max.max(d_zijde(&korf, h, RebarSide::Top));
    }

    let heeft_beugels =
        !inv.zones.stirrups.is_empty() || inv.cage.shear_reinforcement().is_ok();
    let z_voor_a_l = inv.z_mm.unwrap_or(0.9 * d_max);
    let a_l = if heeft_beugels {
        // cot θ: de door de aanroeper gekozen waarde, anders de bovengrens van
        // de NB bij 6.2.3(2). Een GROTERE cot θ geeft een GROTERE a_l, dus de
        // bovengrens is hier de veilige aanname zolang θ niet vaststaat.
        let cot_theta = inv.shear_opts.cot_theta.unwrap_or(COT_THETA_MAX);
        if inv.shear_opts.cot_theta.is_none() {
            toelichting.push(format!(
                "θ is niet opgegeven. Voor a_l is cot θ = {} aangehouden, de bovengrens van de \
                 NB bij 6.2.3(2): een grotere cot θ geeft een grotere verschuiving en dus een \
                 zwaardere eis. De dwarskrachttoets kiest θ per snede zelf.",
                nl(COT_THETA_MAX, 1)
            ));
        }
        // cot α = 0: rechte beugels, α = 90° (het model kent geen andere; zie
        // `crate::section::STIRRUP_ALPHA_DEG`).
        verschuiving(Verschuivingsgrondslag::MetDwarskrachtwapening {
            z_mm: z_voor_a_l,
            cot_theta,
            cot_alpha: 0.0,
        })
    } else {
        verschuiving(Verschuivingsgrondslag::ZonderDwarskrachtwapening { d_mm: d_max })
    };
    toelichting.push(format!(
        "a_l = {} mm volgens {}. De verschuiving is puntsgewijs toegepast als het maximum van \
         de omhullende over het venster [x − a_l; x + a_l]; zie de moduletekst waarom dat de \
         veilige lezing van \"de ongunstige richting\" is bij een omhullende.",
        nl(a_l.a_l_mm, 0),
        a_l.artikel
    ));
    for t in &a_l.toelichting {
        toelichting.push(t.clone());
    }
    if inv.z_mm.is_none() {
        toelichting.push(format!(
            "z is niet opgegeven en er werkt geen normaalkracht; per snede is z = 0,9·d \
             aangehouden volgens 6.2.3(1). Voor a_l is de grootste d van de staaf gebruikt \
             (d = {} mm), want een grotere z geeft een grotere verschuiving.",
            nl(d_max, 0)
        ));
    }
    if inv.c_d_mm.is_none() {
        toelichting.push(
            "c_d is niet opgegeven en is op 0 mm gehouden — de ONBEPAALDE waarde van figuur \
             8.3. Alle alfa-factoren van tabel 8.2 worden daarmee 1,0 en l_bd is maximaal; de \
             schuine takken van figuur 9.2 zijn dus zo lang als de norm ze kan maken. Een \
             opgegeven c_d verkort ze."
                .to_string(),
        );
    }

    // ── Het x-raster ────────────────────────────────────────────────────────
    let xs = bouw_raster(inv, &reeksen, a_l.a_l_mm, &bundels_onder, &bundels_boven);

    // ── De twee momentlijnen ────────────────────────────────────────────────
    let onder = bouw_momentdekking(
        inv,
        RebarSide::Bottom,
        bundels_onder,
        &xs,
        &reeksen,
        a_l.a_l_mm,
        f_yd,
    );
    let boven = bouw_momentdekking(
        inv,
        RebarSide::Top,
        bundels_boven,
        &xs,
        &reeksen,
        a_l.a_l_mm,
        f_yd,
    );

    // ── De dwarskrachtlijn ──────────────────────────────────────────────────
    let dwarskracht = bouw_dwarskrachtdekking(inv, &xs, &reeksen, &onder.bundels, &boven.bundels);

    // ── §9.2.1.4 en §9.2.1.5 ────────────────────────────────────────────────
    let steunpunten =
        bouw_steunpunteisen(inv, &onder.bundels, &reeksen, a_l.a_l_mm, z_voor_a_l);

    toelichting.push(
        "6.2.1(8) is NIET toegepast: die verlichting geldt binnen een afstand d vanaf de \
         DAGKANT van de oplegging, en het model kent alleen puntopleggingen zonder oplegvlak. \
         De lijn loopt daarom van x = 0 tot x = L en toetst tot in de oplegging — de veilige \
         kant, want daar is V_Ed het grootst."
            .to_string(),
    );
    toelichting.push(
        "V_Rd,c en V_Rd,s zijn nergens opgeteld. 6.2.1(2) geeft V_Rd = V_Rd,s + V_ccd + V_td \
         zonder betonterm, 6.2.3(3) noemt V_Rd \"de kleinste waarde van\" (6.8) en (6.9), en \
         6.2.1(3) is een tweede, losstaande bewijsvoering. Elk punt draagt daarom één \
         weerstand met de route die hem leverde."
            .to_string(),
    );

    Ok(Dekkingslijn {
        lengte_mm: inv.lengte_mm,
        a_l,
        z_voor_a_l_mm: z_voor_a_l,
        onder,
        boven,
        dwarskracht,
        steunpunten,
        toelichting,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// De krachten langs de staaf
// ───────────────────────────────────────────────────────────────────────────

/// De omhullende, per combinatie op volgorde gezet.
///
/// De solver levert per combinatie een reeks stations. Op een rekenknoop staat
/// een station DUBBEL — daar springt V werkelijk — en dat wordt hier bewaard:
/// wie precies op zo'n plaats vraagt, krijgt beide waarden terug en de
/// aanroeper kiest de ongunstigste.
struct Reeksen {
    per_combinatie: Vec<(u32, Vec<ForcePoint>)>,
}

impl Reeksen {
    fn nieuw(omhullende: &[ForcePoint]) -> Self {
        let mut per_combinatie: Vec<(u32, Vec<ForcePoint>)> = Vec::new();
        for p in omhullende {
            match per_combinatie.iter_mut().find(|(id, _)| *id == p.combination_id) {
                Some((_, lijst)) => lijst.push(*p),
                None => per_combinatie.push((p.combination_id, vec![*p])),
            }
        }
        for (_, lijst) in per_combinatie.iter_mut() {
            lijst.sort_by(|a, b| {
                a.position_mm.partial_cmp(&b.position_mm).unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        Reeksen { per_combinatie }
    }

    /// Alle stationsposities, oplopend en zonder doublures.
    fn posities(&self) -> Vec<f64> {
        let mut uit: Vec<f64> =
            self.per_combinatie.iter().flat_map(|(_, l)| l.iter().map(|p| p.position_mm)).collect();
        sorteer_uniek(&mut uit);
        uit
    }

    /// De krachten op plaats `x`, per combinatie.
    ///
    /// Valt `x` op een station, dan komen de daar aanwezige waarden ONGEWIJZIGD
    /// terug — ook als het station dubbel is, want dan zijn er twee geldige
    /// waarden. Ligt `x` ertussen, dan wordt er LINEAIR geïnterpoleerd tussen
    /// de twee omliggende stations van diezelfde combinatie.
    ///
    /// Die interpolatie is een benadering: onder een gelijkmatig verdeelde
    /// belasting is M kwadratisch, dus tussen twee stations ligt de rechte lijn
    /// iets ONDER de werkelijke momentenlijn. De stationswaarden zelf zijn
    /// exact en zij zitten allemaal in het raster, dus de maatgevende plaats
    /// kan er niet door worden gemist; alleen het getekende verloop tússen twee
    /// stations is glad gemaakt. Wie dat scherper wil, zet meer stations.
    fn op(&self, x_mm: f64) -> Vec<(u32, InternalForces)> {
        let mut uit = Vec::new();
        for (id, lijst) in &self.per_combinatie {
            if lijst.is_empty() {
                continue;
            }
            let treffers: Vec<&ForcePoint> =
                lijst.iter().filter(|p| (p.position_mm - x_mm).abs() <= X_TOLERANTIE_MM).collect();
            if !treffers.is_empty() {
                for p in treffers {
                    uit.push((*id, p.forces));
                }
                continue;
            }
            let eerste = lijst.first().expect("lijst is niet leeg");
            let laatste = lijst.last().expect("lijst is niet leeg");
            if x_mm < eerste.position_mm {
                uit.push((*id, eerste.forces));
                continue;
            }
            if x_mm > laatste.position_mm {
                uit.push((*id, laatste.forces));
                continue;
            }
            for paar in lijst.windows(2) {
                let (a, b) = (&paar[0], &paar[1]);
                if x_mm >= a.position_mm && x_mm <= b.position_mm {
                    let breedte = b.position_mm - a.position_mm;
                    let t = if breedte > 0.0 { (x_mm - a.position_mm) / breedte } else { 0.0 };
                    uit.push((*id, meng(&a.forces, &b.forces, t)));
                    break;
                }
            }
        }
        uit
    }
}

/// Lineaire menging van twee krachtentoestanden.
fn meng(a: &InternalForces, b: &InternalForces, t: f64) -> InternalForces {
    let f = |x: f64, y: f64| x + (y - x) * t;
    InternalForces {
        n_ed: f(a.n_ed, b.n_ed),
        vy_ed: f(a.vy_ed, b.vy_ed),
        vz_ed: f(a.vz_ed, b.vz_ed),
        mt_ed: f(a.mt_ed, b.mt_ed),
        my_ed: f(a.my_ed, b.my_ed),
        mz_ed: f(a.mz_ed, b.mz_ed),
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Het x-raster
// ───────────────────────────────────────────────────────────────────────────

/// Alle plaatsen waar de lijn een knik of een sprong kan hebben.
///
/// Vijf bronnen, en elk ervan is een plek waar interpoleren fout zou gaan:
///
/// 1. de staafuiteinden;
/// 2. alle stations van de omhullende — daar zijn de krachten exact;
/// 3. die stations ± a_l — daar knikt de VERSCHOVEN lijn B, want het venster
///    [x − a_l; x + a_l] neemt daar een nieuw uiterste op of laat er een los;
/// 4. de zonegrenzen — daar SPRINGT de korf en dus de weerstand;
/// 5. per bundel de vier knikpunten van zijn trapezium: x_start, x_start + l_bd,
///    x_end − l_bd en x_end.
fn bouw_raster(
    inv: &DekkingslijnInvoer<'_>,
    reeksen: &Reeksen,
    a_l_mm: f64,
    onder: &[Staafbundel],
    boven: &[Staafbundel],
) -> Vec<f64> {
    let l = inv.lengte_mm;
    let klem = |x: f64| x.clamp(0.0, l);
    let mut xs: Vec<f64> = vec![0.0, l];

    let stations = reeksen.posities();
    for &s in &stations {
        xs.push(klem(s));
        xs.push(klem(s - a_l_mm));
        xs.push(klem(s + a_l_mm));
    }

    for g in inv.zones.boundaries_mm() {
        xs.push(klem(g));
    }
    for b in onder.iter().chain(boven.iter()) {
        xs.push(klem(b.x_start_mm));
        xs.push(klem(b.x_start_mm + b.l_bd_mm));
        xs.push(klem(b.x_end_mm - b.l_bd_mm));
        xs.push(klem(b.x_end_mm));
    }

    sorteer_uniek(&mut xs);
    xs
}

/// De plaatsen waarop de KORF wordt afgetast om d_max te vinden: de
/// zonegrenzen, de staafuiteinden en de middens ertussen.
///
/// Tussen twee opeenvolgende zonegrenzen is de korf constant, dus meer punten
/// leveren niets op. Deze lijst hangt NIET van het raster af, en dat is de
/// bedoeling: a_l moet bekend zijn vóórdat het raster wordt opgebouwd, want de
/// plaatsen station ± a_l horen erin.
fn monsterplaatsen_korf(inv: &DekkingslijnInvoer<'_>) -> Vec<f64> {
    let mut grenzen: Vec<f64> = vec![0.0, inv.lengte_mm];
    for g in inv.zones.boundaries_mm() {
        if g >= 0.0 && g <= inv.lengte_mm {
            grenzen.push(g);
        }
    }
    sorteer_uniek(&mut grenzen);
    let mut uit = grenzen.clone();
    for paar in grenzen.windows(2) {
        uit.push((paar[0] + paar[1]) / 2.0);
    }
    sorteer_uniek(&mut uit);
    uit
}

fn sorteer_uniek(xs: &mut Vec<f64>) {
    xs.retain(|x| x.is_finite());
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    xs.dedup_by(|a, b| (*a - *b).abs() <= X_TOLERANTIE_MM);
}

/// De plaatsen in `xs` waar de korf werkelijk verandert, met de plaats waar de
/// LINKERkant bemonsterd moet worden.
///
/// Alleen grenzen die STRIKT binnen de staaf liggen tellen: op x = 0 en x = L
/// is er geen linkerkant respectievelijk geen rechterkant.
fn sprongen(inv: &DekkingslijnInvoer<'_>, xs: &[f64]) -> Vec<(usize, f64)> {
    let mut uit = Vec::new();
    for (i, &x) in xs.iter().enumerate() {
        if x <= X_TOLERANTIE_MM || x >= inv.lengte_mm - X_TOLERANTIE_MM {
            continue;
        }
        // De monsterplaats mag nooit vóór het vorige rasterpunt vallen; bij
        // zeer korte zones wordt de offset daarom gehalveerd tot hij past.
        let vorige = if i > 0 { xs[i - 1] } else { 0.0 };
        let offset = SPRONG_OFFSET_MM.min((x - vorige) * 0.5).max(f64::MIN_POSITIVE);
        let links = x - offset;
        if inv.zones.cage_at_mm(inv.cage, links) != inv.zones.cage_at_mm(inv.cage, x) {
            uit.push((i, links));
        }
    }
    uit
}

// ───────────────────────────────────────────────────────────────────────────
// De bundels
// ───────────────────────────────────────────────────────────────────────────

/// Een bundel die nog open staat tijdens het doorlopen van de zones.
#[derive(Clone, Debug)]
struct OpenBundel {
    aantal: u32,
    diameter_mm: f64,
    x_start_mm: f64,
    vorm: Staafvorm,
    stortpositie: Stortpositie,
    /// `true` zodra twee zones binnen deze bundel het niet eens waren over de
    /// staafvorm of de stortpositie.
    strijdig: bool,
}

/// Een bundel waarvan beide uiteinden vaststaan, maar waarvan l_bd nog moet
/// worden bepaald.
#[derive(Clone, Debug)]
struct GeslotenBundel {
    aantal: u32,
    diameter_mm: f64,
    x_start_mm: f64,
    x_end_mm: f64,
    vorm: Staafvorm,
    stortpositie: Stortpositie,
    strijdig: bool,
}

/// De staafbundels van één zijde, met hun l_bd.
///
/// # Waarom een zone-indeling niet meteen een bundel-indeling is
///
/// [`ReinforcementZones`] eist dat de zones van één zijde AANEENSLUITEN: geen
/// gaten, geen overlappingen. Een afgekorte staaf wordt daarin uitgedrukt als
/// een verspringend AANTAL — 3Ø16, dan 5Ø16, dan weer 3Ø16 — en niet als een
/// losse staaf met eigen uiteinden. Wie die zones rechtstreeks als staaflengtes
/// zou lezen, laat de weerstand op elke zonegrens naar nul zakken, ook waar de
/// staven gewoon doorlopen. Dat is niet conservatief maar onzin: het zou een
/// doorgaande onderwapening in het midden van het veld op nul zetten.
///
/// Deze functie leidt daarom de FYSIEKE staafgroepen af. Bij een grens tussen
/// n₁ en n₂ staven van dezelfde diameter lopen min(n₁; n₂) staven dóór en
/// beginnen of eindigen er |n₁ − n₂|. Verandert de DIAMETER, dan wordt de grens
/// als een volledige knip behandeld — alle staven van de ene zone houden daar
/// op en die van de andere beginnen er. Dat is de veilige lezing: twee rijen
/// met verschillende diameters zijn niet dezelfde staven, en aannemen dat ze
/// dat wél zijn zou een verankering wegdenken die er niet is.
///
/// Bundels sluiten in omgekeerde volgorde: wat het laatst is bijgelegd, wordt
/// het eerst weer afgekort. Dat is de gebruikelijke uitvoering — de bijlegstaaf
/// in het veld ligt binnen de doorgaande staven — en het maakt de doorgaande
/// bundel zo lang mogelijk, wat met de knip-bij-diameterwissel hierboven
/// meebeweegt.
fn bouw_bundels(
    inv: &DekkingslijnInvoer<'_>,
    side: RebarSide,
) -> Result<Vec<Staafbundel>, String> {
    let l = inv.lengte_mm;

    // De zones van deze zijde, op volgorde. Zonder zones: één pseudo-zone over
    // de hele staaf met de rij van de basiskorf.
    let mut zones: Vec<(RebarRow, f64, f64, Staafvorm, Stortpositie)> = inv
        .zones
        .longitudinal
        .iter()
        .filter(|z| z.side == side)
        .map(|z| (z.row, z.x_start_mm, z.x_end_mm, z.bar_shape, z.casting_position))
        .collect();
    if zones.is_empty() {
        let rij = match side {
            RebarSide::Bottom => inv.cage.bottom,
            RebarSide::Top => inv.cage.top,
        };
        zones.push((rij, 0.0, l, Staafvorm::default(), Stortpositie::default()));
    }
    zones.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut open: Vec<OpenBundel> = Vec::new();
    let mut klaar: Vec<GeslotenBundel> = Vec::new();

    let sluit = |b: &OpenBundel, aantal: u32, x_end: f64, klaar: &mut Vec<GeslotenBundel>| {
        // Een bundel van nul staven of met een lengte binnen de rastermarge is
        // geen bundel; die wordt niet bewaard.
        if aantal > 0 && b.diameter_mm > 0.0 && x_end > b.x_start_mm + X_TOLERANTIE_MM {
            klaar.push(GeslotenBundel {
                aantal,
                diameter_mm: b.diameter_mm,
                x_start_mm: b.x_start_mm,
                x_end_mm: x_end,
                vorm: b.vorm,
                stortpositie: b.stortpositie,
                strijdig: b.strijdig,
            });
        }
    };

    for (rij, x_start, _x_end, vorm, stort) in &zones {
        let x = *x_start;
        if rij.is_empty() {
            for b in open.drain(..) {
                sluit(&b, b.aantal, x, &mut klaar);
            }
            continue;
        }
        // Een diameterwissel is een volledige knip: zie de functiedoc.
        let mut behoud: Vec<OpenBundel> = Vec::new();
        for b in open.drain(..) {
            if (b.diameter_mm - rij.diameter_mm).abs() <= 1e-9 {
                behoud.push(b);
            } else {
                sluit(&b, b.aantal, x, &mut klaar);
            }
        }
        open = behoud;

        let mut huidig: u32 = open.iter().map(|b| b.aantal).sum();
        while huidig > rij.count {
            let teveel = huidig - rij.count;
            let laatste = open.last_mut().expect("huidig > 0 dus er staat iets open");
            if laatste.aantal <= teveel {
                let b = open.pop().expect("zojuist gelezen");
                huidig -= b.aantal;
                sluit(&b, b.aantal, x, &mut klaar);
            } else {
                // Deels afkorten: `teveel` staven van deze bundel houden hier
                // op, de rest loopt door.
                let deel = OpenBundel { aantal: teveel, ..laatste.clone() };
                laatste.aantal -= teveel;
                huidig -= teveel;
                sluit(&deel, teveel, x, &mut klaar);
            }
        }
        if huidig < rij.count {
            open.push(OpenBundel {
                aantal: rij.count - huidig,
                diameter_mm: rij.diameter_mm,
                x_start_mm: x,
                vorm: *vorm,
                stortpositie: *stort,
                strijdig: false,
            });
        }
        // De uitvoeringsgegevens van deze zone gelden ook voor de bundels die
        // hier dóórlopen: de ONGUNSTIGSTE wint.
        for b in open.iter_mut() {
            let nieuwe_vorm = ongunstigste_vorm(b.vorm, *vorm);
            let nieuwe_stort = ongunstigste_stortpositie(
                b.stortpositie,
                *stort,
                inv.section.h_mm,
                staafhoogte_mm(inv, side, b.diameter_mm),
            );
            if nieuwe_vorm != b.vorm || nieuwe_stort != b.stortpositie {
                b.strijdig = true;
            }
            b.vorm = nieuwe_vorm;
            b.stortpositie = nieuwe_stort;
        }
    }
    let einde = zones.last().map(|z| z.2).unwrap_or(l);
    for b in open.drain(..) {
        sluit(&b, b.aantal, einde, &mut klaar);
    }

    // ── l_bd per bundel ─────────────────────────────────────────────────────
    let mut uit = Vec::with_capacity(klaar.len());
    for g in klaar {
        let GeslotenBundel {
            aantal,
            diameter_mm,
            x_start_mm,
            x_end_mm,
            vorm,
            stortpositie,
            strijdig,
        } = g;
        let invoer = VerankeringInvoer {
            diameter_mm,
            f_ctk_005_mpa: inv.f_ctk_005_mpa,
            alpha_ct: crate::factors::ALPHA_CC,
            gamma_c: inv.mat.gamma_c,
            f_yd_mpa: inv.mat.f_yd(),
            // §9.2.1.3 heet "Inkorting van op TREK belaste langswapening"; de
            // dekkingslijn gaat over de trekgordel en dus over trekverankering.
            soort: Verankeringssoort::Trek,
            vorm,
            stortpositie,
            h_mm: inv.section.h_mm,
            z_staaf_boven_onderrand_mm: Some(staafhoogte_mm(inv, side, diameter_mm)),
            c_d_mm: inv.c_d_mm.unwrap_or(0.0),
            ..VerankeringInvoer::default()
        };
        let verankering = verankeringslengte(&invoer).map_err(|e| {
            format!("l_bd van {}Ø{} is niet te bepalen: {e}", aantal, nl(diameter_mm, 0))
        })?;
        let mut toelichting = verankering.toelichting.clone();
        if strijdig {
            toelichting.push(
                "Deze staven lopen door zones met verschillende uitvoeringsgegevens \
                 (staafvorm of stortpositie). De ONGUNSTIGSTE is aangehouden, dus de \
                 langste l_bd."
                    .to_string(),
            );
        }
        if vorm == Staafvorm::AndersDanRecht && invoer.c_d_mm <= 3.0 * diameter_mm {
            toelichting.push(format!(
                "De staaf is als \"anders dan recht\" opgegeven, maar α₁ = 0,7 vergt volgens \
                 tabel 8.2 c_d > 3Φ = {} mm en c_d is hier {} mm. De ombuiging verkort l_bd \
                 daarom niet.",
                nl(3.0 * diameter_mm, 0),
                nl(invoer.c_d_mm, 0)
            ));
        }
        uit.push(Staafbundel {
            side,
            aantal,
            diameter_mm,
            x_start_mm,
            x_end_mm,
            l_bd_mm: verankering.l_bd_mm,
            verankering,
            vorm,
            stortpositie,
            toelichting,
        });
    }
    uit.sort_by(|a, b| {
        a.x_start_mm.partial_cmp(&b.x_start_mm).unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(uit)
}

/// De ongunstigste van twee staafvormen: recht, want dan blijft α₁ = 1,0.
fn ongunstigste_vorm(a: Staafvorm, b: Staafvorm) -> Staafvorm {
    if a == Staafvorm::Recht || b == Staafvorm::Recht {
        Staafvorm::Recht
    } else {
        Staafvorm::AndersDanRecht
    }
}

/// De ongunstigste van twee stortposities: die met de laagste η₁, want een
/// lagere η₁ geeft een lagere f_bd en dus een langere l_bd.
///
/// De vergelijking gebeurt door [`aanhechting`] voor beide te laten beslissen
/// en niet met een vaste rangorde: welke positie de slechtste is hangt bij
/// [`Stortpositie::Bovenzijde`] van de elementhoogte af (figuur 8.2b tegenover
/// 8.2c/8.2d), en die afweging staat al in [`crate::verankering`].
fn ongunstigste_stortpositie(
    a: Stortpositie,
    b: Stortpositie,
    h_mm: f64,
    z_staaf_mm: f64,
) -> Stortpositie {
    if a == b {
        return a;
    }
    let (aa, _) = aanhechting(a, h_mm, Some(z_staaf_mm));
    let (ab, _) = aanhechting(b, h_mm, Some(z_staaf_mm));
    if ab.eta_1() < aa.eta_1() {
        b
    } else {
        a
    }
}

/// De hoogte van de staafas boven de ONDERRAND, mm — de maat die figuur 8.2
/// nodig heeft.
fn staafhoogte_mm(inv: &DekkingslijnInvoer<'_>, side: RebarSide, diameter_mm: f64) -> f64 {
    let dekking = inv.cage.cover_at_mm(side.cover_side());
    let as_afstand = dekking + inv.cage.stirrup_diameter_mm + diameter_mm / 2.0;
    match side {
        RebarSide::Bottom => as_afstand,
        RebarSide::Top => inv.section.h_mm - as_afstand,
    }
}

/// De nuttige hoogte aan één zijde, mm.
fn d_zijde(korf: &ReinforcementCage, h_mm: f64, side: RebarSide) -> f64 {
    match side {
        RebarSide::Bottom => korf.d_mm(h_mm),
        RebarSide::Top => h_mm - korf.d2_mm(),
    }
}

// ───────────────────────────────────────────────────────────────────────────
// De momentlijn
// ───────────────────────────────────────────────────────────────────────────

/// De omhullende trekkracht A van figuur 9.2 op één plaats, voor één zijde.
///
/// Levert (F_A in kN, M_Ed in kNm, N_Ed in kN, combinatie-id) van de
/// maatgevende combinatie.
fn omhullende_trekkracht(
    reeksen: &Reeksen,
    x_mm: f64,
    side: RebarSide,
    z_mm: f64,
) -> (f64, f64, f64, u32) {
    let mut beste = (0.0_f64, 0.0_f64, 0.0_f64, 0_u32);
    let mut gevonden = false;
    for (id, f) in reeksen.op(x_mm) {
        // Tekenafspraak van de kern: M_y positief = trek in de ONDERSTE vezel.
        let m_voor_zijde = match side {
            RebarSide::Bottom => f.my_ed,
            RebarSide::Top => -f.my_ed,
        };
        // Alleen een TREKkracht wordt verrekend; zie de moduletekst.
        let n_trek = f.n_ed.max(0.0);
        let f_a = (m_voor_zijde * 1000.0 / z_mm + n_trek).max(0.0);
        if !gevonden || f_a > beste.0 {
            beste = (f_a, f.my_ed, f.n_ed, id);
            gevonden = true;
        }
    }
    beste
}

/// De lijn van één zijde.
#[allow(clippy::too_many_arguments)]
fn bouw_momentdekking(
    inv: &DekkingslijnInvoer<'_>,
    side: RebarSide,
    bundels: Vec<Staafbundel>,
    xs: &[f64],
    reeksen: &Reeksen,
    a_l_mm: f64,
    f_yd_mpa: f64,
) -> Momentdekking {
    let h = inv.section.h_mm;
    let l = inv.lengte_mm;
    let sprongen = sprongen(inv, xs);

    // z per plaats: uit de korf ter plaatse, tenzij hij is opgegeven.
    let z_op = |monster_x: f64| -> f64 {
        match inv.z_mm {
            Some(z) if z > 0.0 => z,
            _ => 0.9 * d_zijde(&inv.zones.cage_at_mm(inv.cage, monster_x), h, side),
        }
    };

    // A op elk rasterpunt: de basis voor de vensterberekening van B.
    let a_op_raster: Vec<f64> = xs
        .iter()
        .map(|&x| omhullende_trekkracht(reeksen, x, side, z_op(x)).0)
        .collect();

    // De eindzones: binnen l_bd van een staafeinde dat op een STAAFEINDE valt.
    let eindzone_begin = bundels
        .iter()
        .filter(|b| b.x_start_mm <= X_TOLERANTIE_MM)
        .fold(0.0_f64, |m, b| m.max(b.l_bd_mm));
    let eindzone_eind = bundels
        .iter()
        .filter(|b| b.x_end_mm >= l - X_TOLERANTIE_MM)
        .fold(0.0_f64, |m, b| m.max(b.l_bd_mm));

    let mut punten: Vec<Momentpunt> = Vec::with_capacity(xs.len() + sprongen.len());
    for (i, &x) in xs.iter().enumerate() {
        let links = sprongen.iter().find(|(j, _)| *j == i).map(|(_, xl)| *xl);
        let kanten: Vec<(Snedezijde, f64)> = match links {
            Some(xl) => vec![(Snedezijde::Links, xl), (Snedezijde::Rechts, x)],
            None => vec![(Snedezijde::Enkel, x)],
        };
        for (zijde, monster_x) in kanten {
            let z = z_op(monster_x);
            let (a_hier, m_ed, n_ed, comb) = omhullende_trekkracht(reeksen, x, side, z);

            // Regel B: het maximum van A over [x − a_l; x + a_l] ∩ [0, L].
            let onder_grens = (x - a_l_mm).max(0.0);
            let boven_grens = (x + a_l_mm).min(l);
            let mut f_s = a_hier;
            for (j, &xj) in xs.iter().enumerate() {
                if xj >= onder_grens - X_TOLERANTIE_MM && xj <= boven_grens + X_TOLERANTIE_MM {
                    f_s = f_s.max(a_op_raster[j]);
                }
            }
            // De vensterranden zelf liggen zelden op een rasterpunt.
            for rand in [onder_grens, boven_grens] {
                f_s = f_s.max(omhullende_trekkracht(reeksen, rand, side, z_op(rand)).0);
            }

            // Regel C.
            let mut aanwezig = 0.0_f64;
            let mut volledig = 0.0_f64;
            let mut ontwikkeling = 1.0_f64;
            let mut heeft_wapening = false;
            let mut binnen_lbd = false;
            for b in bundels.iter().filter(|b| b.dekt(monster_x)) {
                heeft_wapening = true;
                let fractie = b.ontwikkeling_op(monster_x);
                let vol = b.f_rs_vol_kn(f_yd_mpa);
                volledig += vol;
                aanwezig += vol * fractie;
                ontwikkeling = ontwikkeling.min(fractie);
                if fractie < 1.0 - 1e-12 {
                    binnen_lbd = true;
                }
            }
            if !heeft_wapening {
                ontwikkeling = 0.0;
            }
            let bewijs = if !heeft_wapening {
                MomentBewijs::GeenWapening
            } else if binnen_lbd {
                MomentBewijs::BinnenVerankeringslengte
            } else {
                MomentBewijs::VolledigOntwikkeld
            };

            let uc = if aanwezig > 0.0 { Some(f_s / aanwezig) } else { None };
            let tekort = (f_s - aanwezig).max(0.0);
            let in_eindzone = x <= eindzone_begin + X_TOLERANTIE_MM
                || x >= l - eindzone_eind - X_TOLERANTIE_MM;

            punten.push(Momentpunt {
                x_mm: x,
                zijde,
                omhullende_kn: a_hier,
                benodigd_kn: f_s,
                aanwezig_kn: aanwezig,
                aanwezig_volledig_kn: volledig,
                ontwikkeling,
                uc,
                tekort_kn: tekort,
                bewijs,
                z_mm: z,
                n_ed_kn: n_ed,
                m_ed_knm: m_ed,
                combinatie_id: comb,
                in_eindzone,
            });
        }
    }

    let maatgevend = kies_maatgevend(&punten, |p| {
        if p.in_eindzone {
            None
        } else {
            Some((p.uc, p.tekort_kn, p.benodigd_kn))
        }
    });

    let mut toelichting = vec![format!(
        "De weerstandslijn is opgebouwd uit {} staafbundel(s); zie `bundels`. Bundels zijn de \
         FYSIEKE staafgroepen die uit de zone-indeling volgen, niet de zones zelf: waar het \
         aantal staven verspringt lopen de gemeenschappelijke staven dóór en korten alleen de \
         overtollige af.",
        bundels.len()
    )];
    if bundels.is_empty() {
        toelichting.push(format!(
            "Aan de {} ligt nergens langswapening. De weerstandslijn is overal nul; elk \
             benodigd trekkrachtdeel is dus een tekort.",
            side.label()
        ));
    }
    if maatgevend.is_none() && !punten.is_empty() {
        toelichting.push(
            "Er is geen maatgevende plaats buiten de eindzones: de hele staaf ligt binnen l_bd \
             van een staafeinde. Voor zo'n staaf zegt §9.2.1.3 niets meer dan §9.2.1.4/§9.2.1.5 \
             al zeggen; zie `steunpunten`."
                .to_string(),
        );
    }
    toelichting.push(
        "De eindzones — binnen l_bd van een staafeinde dat op een staafuiteinde valt — tellen \
         niet mee bij het kiezen van de maatgevende plaats. Daar begint de weerstandslijn per \
         definitie bij nul omdat het model de staaf op x = 0 respectievelijk x = L laat \
         ophouden, terwijl zij in werkelijkheid de oplegging in loopt. Wat daar geldt staat in \
         §9.2.1.4 en §9.2.1.5; zie `steunpunten`."
            .to_string(),
    );

    Momentdekking { side, punten, maatgevend, bundels, toelichting }
}

// ───────────────────────────────────────────────────────────────────────────
// De dwarskrachtlijn
// ───────────────────────────────────────────────────────────────────────────

fn bouw_dwarskrachtdekking(
    inv: &DekkingslijnInvoer<'_>,
    xs: &[f64],
    reeksen: &Reeksen,
    bundels_onder: &[Staafbundel],
    bundels_boven: &[Staafbundel],
) -> Dwarskrachtdekking {
    let h = inv.section.h_mm;
    let sprongen = sprongen(inv, xs);
    let mut punten: Vec<Dwarskrachtpunt> = Vec::with_capacity(xs.len() + sprongen.len());
    let mut maatgevende_weerstand: Option<ShearResistance> = None;
    let mut beste_maat: Option<Zwaarte> = None;
    let mut beste_index: Option<usize> = None;

    for (i, &x) in xs.iter().enumerate() {
        let links = sprongen.iter().find(|(j, _)| *j == i).map(|(_, xl)| *xl);
        let kanten: Vec<(Snedezijde, f64)> = match links {
            Some(xl) => vec![(Snedezijde::Links, xl), (Snedezijde::Rechts, x)],
            None => vec![(Snedezijde::Enkel, x)],
        };
        for (zijde, monster_x) in kanten {
            let korf = inv.zones.cage_at_mm(inv.cage, monster_x);
            let mut zwaarste: Option<(ShearResistance, u32)> = None;
            for (id, f) in reeksen.op(x) {
                let fs = ForceStateSnapshot {
                    combination_id: id,
                    position_mm: x,
                    forces: f,
                };
                let r = shear_resistance(inv.section, &korf, inv.mat, &fs, &inv.shear_opts);
                let neem = match &zwaarste {
                    None => true,
                    Some((huidig, _)) => zwaarder_dwarskracht(&r, huidig),
                };
                if neem {
                    zwaarste = Some((r, id));
                }
            }
            let Some((r, comb)) = zwaarste else { continue };

            // A_sl volgens de regel van 6.2.2(1), voor zover die zonder
            // opleggingsgeometrie is vast te stellen: de bundels die naar BEIDE
            // kanten ≥ (l_bd + d) voorbij deze doorsnede doorlopen. Alleen de
            // zijde die op TREK staat telt mee.
            let trek_zijde =
                if r.trek_onder { RebarSide::Bottom } else { RebarSide::Top };
            let bundels = match trek_zijde {
                RebarSide::Bottom => bundels_onder,
                RebarSide::Top => bundels_boven,
            };
            let d = d_zijde(&korf, h, trek_zijde);
            let a_sl_doorlopend: f64 = bundels
                .iter()
                .filter(|b| {
                    let nodig = b.l_bd_mm + d;
                    monster_x - b.x_start_mm >= nodig - X_TOLERANTIE_MM
                        && b.x_end_mm - monster_x >= nodig - X_TOLERANTIE_MM
                })
                .map(|b| b.a_s_mm2())
                .sum();

            let punt = Dwarskrachtpunt {
                x_mm: x,
                zijde,
                benodigd_kn: r.v_ed_kn,
                aanwezig_kn: r.v_rd_kn,
                uc: r.uc,
                route: r.weerstandsroute,
                spoor: r.spoor,
                reden: r.reden.clone(),
                a_sl_gebruikt_mm2: r.vrd_c.a_sl_mm2,
                a_sl_doorlopend_mm2: a_sl_doorlopend,
                combinatie_id: comb,
            };
            let maat = (punt.uc, (punt.benodigd_kn - punt.aanwezig_kn.unwrap_or(0.0)).max(0.0), punt.benodigd_kn);
            let neem = match &beste_maat {
                None => true,
                Some(b) => zwaarder_maat(&maat, b),
            };
            if neem {
                beste_maat = Some(maat);
                beste_index = Some(punten.len());
                maatgevende_weerstand = Some(r);
            }
            punten.push(punt);
        }
    }

    let mut toelichting = vec![
        "Elk punt draagt ÉÉN weerstand met de route die hem leverde. V_Rd,c en V_Rd,s staan er \
         met opzet niet als twee optelbare velden naast elkaar in: 6.2.1(2) geeft V_Rd = V_Rd,s \
         + V_ccd + V_td zonder betonterm en 6.2.3(3) noemt V_Rd \"de kleinste waarde van\" \
         (6.8) en (6.9)."
            .to_string(),
        "Op elke zonegrens staan twee punten met dezelfde x: de beugelverdichting laat de \
         weerstand daar SPRINGEN, en interpoleren over een sprong heeft geen betekenis."
            .to_string(),
    ];
    if inv.shear_opts.a_sl_mm2.is_none() && !inv.zones.longitudinal.is_empty() {
        toelichting.push(
            "A_sl is niet opgegeven, dus 6.2.2(1) rekent met de trekrij van de korf die op de \
             beschouwde plaats geldt. Dat volgt de staffeling van de zones, maar niet de eis \
             dat de staaf ≥ (l_bd + d) VOORBIJ de doorsnede doorloopt (figuur 6.3). Per punt \
             staat daarom naast de gebruikte A_sl ook de deelverzameling die aantoonbaar naar \
             beide kanten zo ver doorloopt. Die wordt gemeld en niet opgelegd: bij de \
             staafuiteinden zou zij nul zijn doordat het model de staaf daar laat ophouden, \
             terwijl de wapening in werkelijkheid de oplegging in loopt en daar volgens \
             §9.2.1.4(3) is verankerd."
                .to_string(),
        );
    }

    Dwarskrachtdekking {
        punten,
        maatgevend: beste_index,
        maatgevende_weerstand,
        toelichting,
    }
}

/// Is `nieuw` zwaarder dan `huidig`? Dezelfde rangorde als hieronder, maar dan
/// rechtstreeks op de afleiding, zodat er per snede maar één keer hoeft te
/// worden afgerekend.
fn zwaarder_dwarskracht(nieuw: &ShearResistance, huidig: &ShearResistance) -> bool {
    let maat = |r: &ShearResistance| {
        (r.uc, (r.v_ed_kn - r.v_rd_kn.unwrap_or(0.0)).max(0.0), r.v_ed_kn)
    };
    zwaarder_maat(&maat(nieuw), &maat(huidig))
}

// ───────────────────────────────────────────────────────────────────────────
// De maatgevende plaats
// ───────────────────────────────────────────────────────────────────────────

/// De zwaarte van één plaats: (unity check, tekort in kN, belasting in kN).
///
/// De unity check is `None` waar de weerstand nul is — dan is er geen
/// verhouding, alleen een tekort. Zie [`zwaarder_maat`] voor de rangorde.
type Zwaarte = (Option<f64>, f64, f64);

/// De rangorde waarmee twee plaatsen worden vergeleken.
///
/// De maat is (unity check, tekort, belasting). De regel:
///
/// 1. Een plaats ZONDER unity check maar MET een tekort gaat vóór elke plaats
///    met een unity check. Dat is geen willekeur: geen unity check betekent hier
///    dat de weerstand nul is, en een tekort tegen een nulweerstand is erger dan
///    welke eindige verhouding ook.
/// 2. Twee plaatsen zonder unity check worden op het tekort vergeleken.
/// 3. Twee plaatsen met een unity check worden op die unity check vergeleken, en
///    bij gelijkspel op de belasting — dan wint de zwaarder belaste snede, want
///    die is voor de lezer het herkenbaarst.
///
/// Dezelfde geest als de rangorde in de betonorchestrator, maar hier opnieuw
/// geschreven: dat type is daar privé en deze module hangt niet van die crate
/// af.
fn zwaarder_maat(nieuw: &Zwaarte, huidig: &Zwaarte) -> bool {
    match (nieuw.0, huidig.0) {
        (None, None) => nieuw.1 > huidig.1 || (nieuw.1 == huidig.1 && nieuw.2 > huidig.2),
        (None, Some(_)) => nieuw.1 > 0.0,
        (Some(_), None) => huidig.1 <= 0.0,
        (Some(a), Some(b)) => a > b || (a == b && nieuw.2 > huidig.2),
    }
}

/// De index van de zwaarste plaats, gemeten met `maat`. Punten waarvoor `maat`
/// `None` levert doen niet mee.
fn kies_maatgevend<T, F>(punten: &[T], maat: F) -> Option<usize>
where
    F: Fn(&T) -> Option<Zwaarte>,
{
    let mut beste: Option<(usize, Zwaarte)> = None;
    for (i, p) in punten.iter().enumerate() {
        let Some(m) = maat(p) else { continue };
        let neem = match &beste {
            None => true,
            Some((_, b)) => zwaarder_maat(&m, b),
        };
        if neem {
            beste = Some((i, m));
        }
    }
    beste.map(|(i, _)| i)
}

// ───────────────────────────────────────────────────────────────────────────
// §9.2.1.4 en §9.2.1.5 — de onderwapening bij de steunpunten
// ───────────────────────────────────────────────────────────────────────────

fn bouw_steunpunteisen(
    inv: &DekkingslijnInvoer<'_>,
    bundels_onder: &[Staafbundel],
    reeksen: &Reeksen,
    a_l_mm: f64,
    z_mm: f64,
) -> Vec<SteunpuntEis> {
    let l = inv.lengte_mm;

    // A_s,veld: "de oppervlakte van de doorsnede van het staal aangebracht in
    // de overspanning" (§9.2.1.4(1)) — de grootste onderwapening die ergens
    // langs de staaf ligt.
    let mut a_s_veld = 0.0_f64;
    for g in geef_monsterplaatsen(inv, bundels_onder) {
        let som: f64 =
            bundels_onder.iter().filter(|b| b.dekt(g)).map(|b| b.a_s_mm2()).sum();
        a_s_veld = a_s_veld.max(som);
    }
    let a_s_vereist = as_steunpunt_vereist_mm2(a_s_veld);

    let mut uit = Vec::with_capacity(2);
    for (uiteinde, x) in [(Staafeinde::Begin, 0.0_f64), (Staafeinde::Eind, l)] {
        let hier: Vec<&Staafbundel> = bundels_onder.iter().filter(|b| b.dekt(x)).collect();
        let a_s_aanwezig: f64 = hier.iter().map(|b| b.a_s_mm2()).sum();
        let l_bd = hier.iter().fold(None::<f64>, |m, b| {
            Some(match m {
                Some(v) => v.max(b.l_bd_mm),
                None => b.l_bd_mm,
            })
        });
        let min_recht = hier.iter().fold(None::<f64>, |m, b| {
            let w = min_verankering_tussensteunpunt_mm(
                Tussensteunpuntvorm::RechteStaaf,
                b.diameter_mm,
                0.0,
            );
            Some(match m {
                Some(v) => v.max(w),
                None => w,
            })
        });

        // (9.3) met de ongunstigste combinatie op dit uiteinde.
        let mut v_ed = 0.0_f64;
        let mut n_ed = 0.0_f64;
        let mut f_ed = 0.0_f64;
        for (_, f) in reeksen.op(x) {
            let kandidaat = f_ed_eindoplegging_kn(f.vz_ed, a_l_mm, z_mm, f.n_ed.max(0.0));
            if kandidaat > f_ed {
                f_ed = kandidaat;
                v_ed = f.vz_ed.abs();
                n_ed = f.n_ed;
            }
        }

        let mut toelichting = vec![
            format!(
                "§9.2.1.4(1) met de nationale bijlage: A_s,steunpunt ≥ β₂·A_s,veld met \
                 β₂ = {}. §9.2.1.5(1) verklaart diezelfde oppervlakte-eis ook van toepassing \
                 op tussensteunpunten, dus zij geldt aan dit uiteinde ongeacht het soort \
                 steunpunt. De NB wijkt hier NIET af van de aanbevolen EN-waarde.",
                nl(BETA_2, 2)
            ),
            "De vereiste verankeringsLENGTE is hier NIET getoetst. §9.2.1.4(3) meet l_bd \
             vanaf de raaklijn tussen balk en oplegging en §9.2.1.5(2) geeft voor \
             tussensteunpunten eigen ondergrenzen; beide vragen de opleggingsgeometrie, en \
             het model kent alleen een puntoplegging op een knoop. De genoemde lengtes zijn \
             daarom een OPGAVE, geen oordeel."
                .to_string(),
        ];
        if f_ed > 0.0 {
            toelichting.push(format!(
                "F_Ed = |V_Ed|·a_l/z + N_Ed = {}·{}/{} + {} = {} kN, vergelijking (9.3) van \
                 §9.2.1.4(2). Alleen een TREKkracht is meegeteld; zie de moduletekst.",
                nl(v_ed, 1),
                nl(a_l_mm, 0),
                nl(z_mm, 0),
                nl(n_ed.max(0.0), 1),
                nl(f_ed, 1)
            ));
        }
        if a_s_aanwezig <= 0.0 {
            toelichting.push(
                "Er ligt hier geen onderwapening. §9.2.1.4(1) eist die wél bij eindopleggingen \
                 waarbij weinig of geen eindinklemming is aangenomen."
                    .to_string(),
            );
        }

        uit.push(SteunpuntEis {
            uiteinde,
            x_mm: x,
            a_s_veld_mm2: a_s_veld,
            a_s_vereist_mm2: a_s_vereist,
            a_s_aanwezig_mm2: a_s_aanwezig,
            voldoet_oppervlakte: a_s_aanwezig >= a_s_vereist - 1e-9,
            f_ed_kn: f_ed,
            v_ed_kn: v_ed,
            n_ed_kn: n_ed,
            a_l_mm,
            z_mm,
            l_bd_mm: l_bd,
            min_lengte_recht_mm: min_recht,
            toelichting,
        });
    }
    uit
}

/// De plaatsen waarop A_s,veld wordt afgetast: elk bundelbegin en -einde plus
/// de middens ertussen. Meer is niet nodig — tussen twee bundelgrenzen ligt
/// overal dezelfde wapening.
fn geef_monsterplaatsen(inv: &DekkingslijnInvoer<'_>, bundels: &[Staafbundel]) -> Vec<f64> {
    let mut grenzen: Vec<f64> = vec![0.0, inv.lengte_mm];
    for b in bundels {
        grenzen.push(b.x_start_mm);
        grenzen.push(b.x_end_mm);
    }
    sorteer_uniek(&mut grenzen);
    let mut uit = grenzen.clone();
    for paar in grenzen.windows(2) {
        uit.push((paar[0] + paar[1]) / 2.0);
    }
    sorteer_uniek(&mut uit);
    uit
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::factors::DesignSituation;
    use crate::section::{LongitudinalZone, StirrupZone};
    use crate::stress_strain::SteelBranch;
    use approx::assert_relative_eq;

    fn mat() -> DesignMaterial {
        DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        )
    }

    fn f_ctk() -> f64 {
        concrete_class_by_name("C30/37").unwrap().f_ctk_005
    }

    fn sectie() -> ConcreteSection {
        ConcreteSection::rectangle(300.0, 600.0)
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

    /// Zonder zones is er per zijde precies één bundel, over de hele lengte.
    #[test]
    fn zonder_zones_een_bundel_per_zijde() {
        let s = sectie();
        let c = korf();
        let z = ReinforcementZones::default();
        let inv = DekkingslijnInvoer {
            section: &s,
            cage: &c,
            zones: &z,
            mat: &mat(),
            f_ctk_005_mpa: f_ctk(),
            lengte_mm: 6000.0,
            omhullende: &[punt(0.0, 0.0, 60.0), punt(3000.0, 90.0, 0.0), punt(6000.0, 0.0, -60.0)],
            z_mm: None,
            c_d_mm: None,
            shear_opts: ShearOptions::default(),
        };
        let d = dekkingslijn(&inv).expect("dekkingslijn");
        assert_eq!(d.onder.bundels.len(), 1);
        assert_eq!(d.onder.bundels[0].aantal, 3);
        assert_relative_eq!(d.onder.bundels[0].x_start_mm, 0.0);
        assert_relative_eq!(d.onder.bundels[0].x_end_mm, 6000.0);
        assert_eq!(d.boven.bundels.len(), 1);
        assert_eq!(d.boven.bundels[0].aantal, 2);
    }

    /// Drie zones 3/5/3 leveren TWEE bundels: de doorgaande 3 en de bijgelegde
    /// 2. Dit is de kern van `bouw_bundels`.
    #[test]
    fn staffeling_levert_doorgaande_en_bijgelegde_bundel() {
        let s = sectie();
        let c = korf();
        let l = 6000.0;
        let z = ReinforcementZones {
            longitudinal: vec![
                langs(RebarSide::Bottom, 3, 16.0, 0.0, 1500.0),
                langs(RebarSide::Bottom, 5, 16.0, 1500.0, 4500.0),
                langs(RebarSide::Bottom, 3, 16.0, 4500.0, l),
            ],
            stirrups: vec![],
        };
        let inv = DekkingslijnInvoer {
            section: &s,
            cage: &c,
            zones: &z,
            mat: &mat(),
            f_ctk_005_mpa: f_ctk(),
            lengte_mm: l,
            omhullende: &[punt(0.0, 0.0, 60.0), punt(3000.0, 90.0, 0.0), punt(l, 0.0, -60.0)],
            z_mm: None,
            c_d_mm: None,
            shear_opts: ShearOptions::default(),
        };
        let d = dekkingslijn(&inv).expect("dekkingslijn");
        assert_eq!(d.onder.bundels.len(), 2, "{:?}", d.onder.bundels);
        let doorgaand = &d.onder.bundels[0];
        assert_eq!(doorgaand.aantal, 3);
        assert_relative_eq!(doorgaand.x_start_mm, 0.0);
        assert_relative_eq!(doorgaand.x_end_mm, l);
        let bijleg = &d.onder.bundels[1];
        assert_eq!(bijleg.aantal, 2);
        assert_relative_eq!(bijleg.x_start_mm, 1500.0);
        assert_relative_eq!(bijleg.x_end_mm, 4500.0);
    }

    fn langs(
        side: RebarSide,
        count: u32,
        diameter_mm: f64,
        x_start_mm: f64,
        x_end_mm: f64,
    ) -> LongitudinalZone {
        LongitudinalZone {
            side,
            row: RebarRow { count, diameter_mm },
            x_start_mm,
            x_end_mm,
            bar_shape: Staafvorm::Recht,
            casting_position: Stortpositie::Onderzijde,
        }
    }

    /// Een diameterwissel is een volledige knip: geen enkele staaf loopt door.
    #[test]
    fn diameterwissel_knipt_alle_staven() {
        let s = sectie();
        let c = korf();
        let l = 4000.0;
        let z = ReinforcementZones {
            longitudinal: vec![
                langs(RebarSide::Bottom, 3, 16.0, 0.0, 2000.0),
                langs(RebarSide::Bottom, 3, 20.0, 2000.0, l),
            ],
            stirrups: vec![],
        };
        let inv = DekkingslijnInvoer {
            section: &s,
            cage: &c,
            zones: &z,
            mat: &mat(),
            f_ctk_005_mpa: f_ctk(),
            lengte_mm: l,
            omhullende: &[punt(0.0, 0.0, 40.0), punt(2000.0, 60.0, 0.0), punt(l, 0.0, -40.0)],
            z_mm: None,
            c_d_mm: None,
            shear_opts: ShearOptions::default(),
        };
        let d = dekkingslijn(&inv).expect("dekkingslijn");
        assert_eq!(d.onder.bundels.len(), 2);
        assert_relative_eq!(d.onder.bundels[0].x_end_mm, 2000.0);
        assert_relative_eq!(d.onder.bundels[1].x_start_mm, 2000.0);
    }

    /// Beugelzones laten de dwarskrachtweerstand SPRINGEN; op de grens staan
    /// daarom twee punten met dezelfde x en verschillende weerstand.
    #[test]
    fn beugelzonegrens_geeft_twee_punten() {
        let s = sectie();
        let c = korf();
        let l = 6000.0;
        let z = ReinforcementZones {
            longitudinal: vec![],
            stirrups: vec![
                StirrupZone {
                    x_start_mm: 0.0,
                    x_end_mm: 1000.0,
                    spacing_mm: 100.0,
                    legs: 2,
                    diameter_mm: 8.0,
                },
                StirrupZone {
                    x_start_mm: 1000.0,
                    x_end_mm: l,
                    spacing_mm: 250.0,
                    legs: 2,
                    diameter_mm: 8.0,
                },
            ],
        };
        let inv = DekkingslijnInvoer {
            section: &s,
            cage: &c,
            zones: &z,
            mat: &mat(),
            f_ctk_005_mpa: f_ctk(),
            lengte_mm: l,
            omhullende: &[
                punt(0.0, 0.0, 200.0),
                punt(1000.0, 100.0, 150.0),
                punt(3000.0, 200.0, 0.0),
                punt(l, 0.0, -200.0),
            ],
            z_mm: None,
            c_d_mm: None,
            shear_opts: ShearOptions::default(),
        };
        let d = dekkingslijn(&inv).expect("dekkingslijn");
        let op_grens: Vec<&Dwarskrachtpunt> = d
            .dwarskracht
            .punten
            .iter()
            .filter(|p| (p.x_mm - 1000.0).abs() < 1e-6)
            .collect();
        assert_eq!(op_grens.len(), 2, "op de zonegrens horen twee punten te staan");
        assert_eq!(op_grens[0].zijde, Snedezijde::Links);
        assert_eq!(op_grens[1].zijde, Snedezijde::Rechts);
        let links = op_grens[0].aanwezig_kn.expect("V_Rd links");
        let rechts = op_grens[1].aanwezig_kn.expect("V_Rd rechts");
        assert!(
            links > rechts,
            "s = 100 mm links hoort meer te dragen dan s = 250 mm rechts: {links} vs {rechts}"
        );
    }

    /// Geen enkel punt van de dwarskrachtlijn draagt een optelling van V_Rd,c
    /// en V_Rd,s: de weerstand is nooit groter dan de grootste van beide takken
    /// afzonderlijk.
    #[test]
    fn dwarskrachtweerstand_is_nooit_een_som() {
        let s = sectie();
        let c = korf();
        let l = 6000.0;
        let z = ReinforcementZones::default();
        let inv = DekkingslijnInvoer {
            section: &s,
            cage: &c,
            zones: &z,
            mat: &mat(),
            f_ctk_005_mpa: f_ctk(),
            lengte_mm: l,
            omhullende: &[punt(0.0, 0.0, 150.0), punt(3000.0, 200.0, 0.0), punt(l, 0.0, -150.0)],
            z_mm: None,
            c_d_mm: None,
            shear_opts: ShearOptions::default(),
        };
        let d = dekkingslijn(&inv).expect("dekkingslijn");
        let r = d.dwarskracht.maatgevende_weerstand.as_ref().expect("afleiding");
        let v_rd_c = r.vrd_c.v_rd_c_kn;
        let v_rd_s = r.vakwerk.as_ref().and_then(|v| v.v_rd_s_kn).unwrap_or(0.0);
        let v_rd = r.v_rd_kn.expect("V_Rd");
        assert!(
            v_rd <= v_rd_c.max(v_rd_s) + 1e-9,
            "V_Rd = {v_rd} mag niet boven max(V_Rd,c = {v_rd_c}; V_Rd,s = {v_rd_s}) uitkomen"
        );
        assert!(v_rd < v_rd_c + v_rd_s - 1e-9 || v_rd_c <= 1e-9 || v_rd_s <= 1e-9);
    }

    /// Zonder opgegeven z én mét normaalkracht weigert de module, in plaats van
    /// stilzwijgend 0,9·d in te vullen.
    #[test]
    fn normaalkracht_zonder_z_wordt_geweigerd() {
        let s = sectie();
        let c = korf();
        let z = ReinforcementZones::default();
        let mut p = punt(3000.0, 90.0, 0.0);
        p.forces.n_ed = -120.0;
        let inv = DekkingslijnInvoer {
            section: &s,
            cage: &c,
            zones: &z,
            mat: &mat(),
            f_ctk_005_mpa: f_ctk(),
            lengte_mm: 6000.0,
            omhullende: &[punt(0.0, 0.0, 60.0), p, punt(6000.0, 0.0, -60.0)],
            z_mm: None,
            c_d_mm: None,
            shear_opts: ShearOptions::default(),
        };
        let e = dekkingslijn(&inv).expect_err("hoort te weigeren");
        assert!(e.contains("6.2.3(1)"), "{e}");
    }
}
