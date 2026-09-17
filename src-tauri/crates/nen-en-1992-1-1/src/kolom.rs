//! §5.8 — KOLOMMEN EN KNIK: kniklengte, slankheid, de slankheidsgrens waaronder
//! tweede-orde-effecten mogen vervallen, en de effectieve kruipcoëfficiënt.
//! Daarbij §9.5, de detailleringseisen die alleen voor een kolom gelden.
//!
//! Deze module beantwoordt in de eerste plaats één vraag: **moet deze kolom op
//! tweede-orde-effecten worden gerekend, en met welke kruip?** Voor het
//! rekenvlak rekent zij zelf géén tweede orde uit; dat doet de algemene
//! methode van §5.8.6, die in deze app al bestaat (fysisch niet-lineair,
//! M-N-κ per segment). De twee vereenvoudigde methoden — nominale stijfheid
//! (§5.8.7) en nominale kromming (§5.8.8) — zijn hier bewust NIET gebouwd;
//! wat zij zouden vragen staat onderaan deze doc.
//!
//! Daarnaast draagt zij de rekenregels van §5.2 (de imperfectie van een
//! afzonderlijk element als excentriciteit e_i) en van §5.8.9 (dubbele
//! buiging): de voorwaarden (5.38a) en (5.38b), N_Rd, de exponent a en de
//! interactie (5.39), met de afleiding erbij. Wie ze aan een staaf koppelt —
//! de omhullende, de tweede as, het M-N-κ-diagram om die as — is
//! `concrete_check::kolomtoetsen`.
//!
//! # De keten, met vindplaats per stap
//!
//! ```text
//! l₀   uit figuur 5.7 (vast geval), of
//!      = 0,5·l·√[(1 + k₁/(0,45+k₁))·(1 + k₂/(0,45+k₂))]     GESCHOORD   (5.15)
//!      = l·max{√(1 + 10·k₁k₂/(k₁+k₂)) ;
//!               (1 + k₁/(1+k₁))·(1 + k₂/(1+k₂))}            ONGESCHOORD (5.16)
//!      = π·√(EI/N_B)                                     numeriek       (5.17)
//!
//! λ    = l₀ / i                                                        (5.14)
//!
//! λ_lim = 20·A·B·C / √n                            5.8.3.1(1), NB-eis  (5.13N)
//!   A = 1/(1 + 0,2·φ_ef)      (φ_ef onbekend → A = 0,7)
//!   B = √(1 + 2ω)             (ω  onbekend → B = 1,1)
//!   C = 1,7 − r_m             (r_m onbekend → C = 0,7)
//!   ω = A_s·f_yd/(A_c·f_cd)   n = N_Ed/(A_c·f_cd)   r_m = M₀₁/M₀₂
//!
//! φ_ef = φ(∞,t₀) · M₀Eqp / M₀Ed                            5.8.4(2)    (5.19)
//! φ_ef = 0 mag als φ(∞,t₀) ≤ 2 én λ ≤ 75 én M₀Ed/N_Ed ≥ h  5.8.4(4)
//! ```
//!
//! λ < λ_lim → tweede-orde-effecten mogen worden verwaarloosd (5.8.3.1(1)).
//! λ ≥ λ_lim zegt NIET dat de kolom bezwijkt; het zegt dat er tweede orde
//! gerekend moet worden.
//!
//! # GESCHOORD is een ONTWERPBESLUIT, geen eigenschap van de geometrie
//!
//! §5.8.1 definieert het letterlijk zo: "Geschoorde elementen of systemen:
//! constructie-elementen of -delen, waarvan in de berekeningen het ontwerp is
//! aangenomen dat ze niet bijdragen aan de totale horizontale stabiliteit van
//! een constructie", en spiegelbeeldig "Schorende elementen of systemen: …
//! waarvan in de berekeningen het ontwerp is aangenomen dat ze bijdragen aan
//! de totale horizontale stabiliteit".
//!
//! Twee keer "is aangenomen". Of een kolom geschoord is volgt dus niet uit het
//! model — een raamwerk met windverbanden ziet er in een 2D-model niet anders
//! uit dan hetzelfde raamwerk zonder — maar uit wat de constructeur aan de
//! stabiliteit heeft toegewezen. Daarom is [`Schoring`] een INVOERVELD zonder
//! standaardwaarde en leidt deze module het nergens af. Wie het niet opgeeft,
//! krijgt geen toets; hij krijgt een foutmelding.
//!
//! Dat het verschil maakt, is geen theorie:
//!
//! * (5.15) en (5.16) zijn verschillende formules. Bij k₁ = k₂ = 0,1 geeft de
//!   geschoorde 0,59·l en de ongeschoorde 1,20·l — een factor twee in l₀, dus
//!   een factor twee in λ.
//! * C = 0,7 is voor een ongeschoord element VOORGESCHREVEN ("voor
//!   niet-geschoorde elementen in het algemeen"), terwijl een geschoorde kolom
//!   met tegengesteld tekenende eindmomenten C > 1,7 mag halen. Dat scheelt
//!   meer dan een factor twee in λ_lim.
//! * De NB laat de nominale-krommingsmethode (§5.8.8) alleen toe voor
//!   GESCHOORDE, op zichzelf staande elementen.
//!
//! # Wat de nationale bijlage in §5.8 doet
//!
//! Nagekeken op de gerenderde bladzijden 81 t/m 89 van de PDF-uitgave, die
//! NB-tekst oranje afdrukt en door de NB geschrapte EN-tekst oranje met een
//! streep erdoor.
//!
//! * **§5.8.3.1 — λ_lim.** De hele OPMERKING met (5.13N) is DOORGEHAALD en
//!   woordelijk teruggezet als eis: "De waarde van λ_lim moet gelijk aan
//!   20·A·B·C/√n zijn genomen", met dezelfde definities van A, B, C, ω, n en
//!   r_m. De GETALLEN veranderen dus niet; de STATUS verandert: van een
//!   aanbeveling die een land mocht wijzigen naar een nationaal opgelegde eis.
//!   Voor deze module verandert er niets in de uitkomst en alles in wat je erover
//!   in een rapport mag schrijven.
//! * **§5.8.3.2 — l₀, (5.14) t/m (5.17) en figuur 5.7.** Geen oranje op de
//!   bladzijden 82 t/m 84. De NB wijkt hier NIET af. Dat geldt ook voor de
//!   OPMERKING bij 5.8.3.2(3) die voor k₁ en k₂ een minimum van 0,1 aanbeveelt:
//!   die staat in zwart, is dus EN-tekst, en is een AANBEVELING gebleven —
//!   zie [`K_MIN_AANBEVOLEN`].
//! * **§5.8.3.3 — algemene tweede-orde-effecten in gebouwen, (5.18).** Hier
//!   grijpt de NB hard in: k₁ = 0 (aanbevolen was 0,31) en k₂ = 0 (aanbevolen
//!   was 0,62). Met k = 0 wordt de rechterzijde van (5.18) nul, en de eis
//!   F_V,Ed ≤ 0 is bij een drukbelast gebouw nooit vervuld. In Nederland is
//!   §5.8.3.3 daarmee GEEN bruikbare ontsnapping meer. Dat is de reden dat deze
//!   module (5.18) niet bouwt: hij zou altijd "voldoet niet" zeggen.
//! * **§5.8.4 — kruip.** Geen oranje op bladzijde 85 en 86. De NB wijkt hier
//!   NIET af: (5.19) en de drie voorwaarden van 5.8.4(4) staan er onveranderd.
//! * **§5.8.5 — keuze van de methode.** OPMERKING 1 (de keuze is nationaal) is
//!   doorgehaald en vervangen door NB-tekst: §5.8.7 mag voor geschoorde én
//!   schorende constructies, maar §5.8.7.2 (de nominale stijfheid zelf) is
//!   NIET toelaatbaar; in plaats daarvan EI uit 0,8·max M_Ed gedeeld door de
//!   bijbehorende kromming uit een M-N-κ-diagram, of E_f·I met tabel NB-1. En:
//!   "De methode gebaseerd op de nominale kromming (5.8.8) mag alleen voor
//!   geschoorde, op zichzelf staande elementen zijn toegepast."
//! * **§5.8.6(3) — γ_cE = 1,2**, doorgehaald als aanbeveling en teruggezet als
//!   eis met dezelfde waarde. Staat al in [`crate::factors::gamma_ce`].
//!
//! # Wat hier NIET in zit, en wat het zou vragen
//!
//! * **§5.8.7 (nominale stijfheid) — niet gebouwd.** In Nederland is de
//!   EN-weg naar EI (5.8.7.2, met K_c en K_s) verboden. Wat er dan nodig is:
//!   per staaf de grootste M_Ed, een M-N-κ-diagram op de aannamen van 6.1(2)P,
//!   de kromming die bij 0,8·M_Ed hoort, en — als de bijdrage van beton onder
//!   trek wordt meegenomen — een GECORRIGEERD M-N-κ-diagram met M_cr en κ_cr
//!   volgens de NB. Het alternatief E_f·I vraagt tabel NB-1: een fictieve
//!   E-modulus per sterkteklasse, met ρ en n als ingang, en drie kolommen naar
//!   gelang de doorsnede symmetrisch of excentrisch gewapend is en of er
//!   normaalkracht is. Die tabel loopt van C12/15 tot C90/105 en is nog niet
//!   overgenomen.
//! * **§5.8.8 (nominale kromming) — niet gebouwd.** Vraagt M₀e uit de twee
//!   eindmomenten, e₂ uit de kromming 1/r met de factoren K_r en K_φ, φ_ef
//!   (die deze module wél levert), en een aanname voor de krommingsverdeling
//!   (de factor c). Alleen bruikbaar voor geschoorde, op zichzelf staande
//!   elementen; voor een ongeschoorde kolom mag hij in Nederland niet.
//! * **§5.8.9 (dubbele buiging) — GEBOUWD**, zie de sectie §5.8.9 hieronder
//!   en `concrete_check::kolomtoetsen`. Dat de raamwerkoplosser geen M_z
//!   levert, betekent niet dat er geen M_z is: een kolom in een vlak raamwerk
//!   heeft een tweede as en knikt daar even goed om uit, met de imperfectie
//!   van §5.2 en het tweede-orde-effect in díe richting. Daarom draagt de
//!   invoer nu een eigen schoring en kniklengte om de tweede as (terugval:
//!   die van het rekenvlak, met melding), een extern M₀Ed om die as (nul als
//!   beginwaarde, zodat een ruimtelijk model hem kan vullen), en legt de
//!   korf de staven op hun plaats over de breedte in lagen voor het
//!   M-N-κ-diagram om de tweede as (`ReinforcementCage::lagen_om_z`).
//! * **§5.2 (imperfecties) — gebouwd voor een afzonderlijk element**: (5.1)
//!   met θ₀ = 1/300 uit de nationale bijlage, en (5.2). Zie de sectie §5.2.
//! * **§5.8.2(6) (de 10 %-regel)** — niet hier.
//! * **De hele §5.8.3.3** — zie hierboven; in Nederland zinledig.
//!
//! Deze module is nog nergens op aangesloten: geen orchestrator, geen
//! Tauri-command, geen frontend. Zij rekent en levert een afleiding; wie haar
//! aansluit, moet [`KolomInvoer`] kunnen vullen — zie het commentaar dáár over
//! het invoerveld "geschoord".

// `!(x > 0.0)` in plaats van `x <= 0.0`: die twee zijn NIET hetzelfde zodra x
// NaN is. Een NaN mag hier nooit door de bewaking heen glippen — een lengte,
// een oppervlakte of een normaalkracht die NaN is, levert anders een λ of een
// λ_lim die er als getal uitziet en dat niet is. De vorm met de negatie vangt
// NaN wél. Dezelfde afweging staat in `detaillering` bij `rho_w_min_9_2_2`.
#![allow(clippy::neg_cmp_op_on_partial_ord)]

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use mechanics::ForceStateSnapshot;

use crate::deelstappen::{lx, nl, nv, stap};
use crate::section::Staafpositie;
use crate::{CheckStatus, Deelstap, NamedValue, ResistanceCalc, UnityCheck};

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.1 — geschoord of ongeschoord
// ═══════════════════════════════════════════════════════════════════════════

/// Draagt dit element bij aan de horizontale stabiliteit? (§5.8.1)
///
/// **Geen `Default`.** Dat is opzet. Een standaardwaarde zou een
/// ontwerpbesluit stilzwijgend voor de constructeur nemen, en het besluit is
/// niet neutraal: [`Schoring::Ongeschoord`] dwingt C = 0,7 af en verlaagt
/// λ_lim, [`Schoring::Geschoord`] geeft de gunstigere kniklengteformule. Wie
/// niets invult, hoort een lege invoer te zien en geen aangenomen antwoord.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Schoring {
    /// GESCHOORD — "waarvan in de berekeningen het ontwerp is aangenomen dat ze
    /// niet bijdragen aan de totale horizontale stabiliteit" (§5.8.1). De
    /// stabiliteit komt van iets anders: een kern, een wand, een verband.
    Geschoord,
    /// ONGESCHOORD — het element is zelf een schorend element, of staat in een
    /// raamwerk dat zijn stabiliteit aan de buigstijfheid van de kolommen
    /// ontleent. De norm spreekt dan van een "schorend element"; in de
    /// rekenregels heet het element zelf "niet-geschoord".
    Ongeschoord,
}

impl Schoring {
    pub fn label(self) -> &'static str {
        match self {
            Schoring::Geschoord => "geschoord",
            Schoring::Ongeschoord => "ongeschoord",
        }
    }

    /// De omschrijving zoals §5.8.1 hem geeft, voor in het rapport.
    pub fn omschrijving(self) -> &'static str {
        match self {
            Schoring::Geschoord => {
                "geschoord: in het ontwerp is aangenomen dat dit element niet bijdraagt aan de \
                 totale horizontale stabiliteit (§5.8.1)"
            }
            Schoring::Ongeschoord => {
                "ongeschoord: in het ontwerp is aangenomen dat dit element wél bijdraagt aan de \
                 totale horizontale stabiliteit (§5.8.1)"
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.3.2 — de effectieve lengte l₀
// ═══════════════════════════════════════════════════════════════════════════

/// De aanbevolen ondergrens voor k₁ en k₂ — §5.8.3.2(3), OPMERKING.
///
/// Letterlijk: "k = 0 is de theoretische grens voor een starre rotatie­verhindering
/// (gedeeltelijke inklemming) en k = ∞ is de grens indien er geen enkele
/// verhindering (inklemming) is. Omdat een volledig starre verhindering in de
/// praktijk zeldzaam is, is voor k₁ en k₂ een minimumwaarde van 0,1 aanbevolen."
///
/// Deze OPMERKING staat in ZWART op bladzijde 83 — het is EN-tekst en de
/// Nederlandse bijlage laat hem ongemoeid. Het is een AANBEVELING en geen eis;
/// daarom wordt de grens hier toegepast maar wel gemeld, en niet stiekem.
///
/// Waarom hij ertoe doet: met k₁ = k₂ = 0 geeft (5.15) l₀ = 0,5·l en (5.16)
/// l₀ = l. Dat is de theoretische volledige inklemming, en die bestaat in beton
/// niet. Wie de grens weglaat, rekent de kolom stelselmatig te kort.
pub const K_MIN_AANBEVOLEN: f64 = 0.1;

/// De gevallen van **figuur 5.7** — voorbeelden van knikvormen met hun
/// effectieve lengte.
///
/// De figuur toont ZEVEN vakjes, a) tot en met g). Vijf ervan hebben een vaste
/// l₀; de laatste twee, f) en g), zijn juist de gevallen mét gedeeltelijke
/// inklemming en horen bij de vergelijkingen (5.15) en (5.16). Hun bijschrift
/// geeft daarom een BEREIK en geen waarde. Zie [`Knikgeval::l0_factor`], die
/// voor f) en g) `None` teruggeeft: daar is een rekensom nodig, geen tabel.
///
/// **Het bijschrift van g) is geen ondergrens.** Er staat "l₀ > 2l", maar dat
/// hoort bij de in dát vakje getekende situatie. (5.16) zelf loopt van l₀ = l
/// (bij k₁ = k₂ = 0) tot oneindig en levert bij k₁ = 0,4 en k₂ = 0,8 een l₀ van
/// 1,91·l — netjes onder 2l. Wie het bijschrift als ondergrens leest, vermoedt
/// daar ten onrechte een rekenfout. Bij f) valt het bereik l/2 < l₀ < l wél
/// samen met het bereik van (5.15), maar dat volgt uit die formule en niet uit
/// de figuur.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Knikgeval {
    /// **a)** Beide einden scharnierend en zijdelings gesteund. l₀ = l.
    ScharnierendScharnierend,
    /// **b)** Onderaan ingeklemd, bovenaan volledig vrij — een console.
    /// l₀ = 2·l. Een console houdt zichzelf overeind en is dus per definitie
    /// ONGESCHOORD; zie [`Knikgeval::schoring`].
    Console,
    /// **c)** Onderaan ingeklemd, bovenaan scharnierend en zijdelings gesteund.
    /// l₀ = 0,7·l.
    IngeklemdScharnierend,
    /// **d)** Beide einden ingeklemd en zijdelings gesteund. l₀ = l/2.
    TweezijdigIngeklemdGeschoord,
    /// **e)** Beide einden ingeklemd tegen rotatie, maar het bovenste einde kan
    /// zijdelings verplaatsen. l₀ = l.
    TweezijdigIngeklemdOngeschoord,
    /// **f)** Gedeeltelijke inklemming aan beide einden, zijdelings gesteund —
    /// het GESCHOORDE geval van (5.15). Bijschrift: l/2 < l₀ < l.
    GedeeltelijkIngeklemdGeschoord,
    /// **g)** Gedeeltelijke inklemming aan beide einden, zijdelings vrij — het
    /// ONGESCHOORDE geval van (5.16). Bijschrift: l₀ > 2·l.
    GedeeltelijkIngeklemdOngeschoord,
}

impl Knikgeval {
    /// De factor waarmee de vrije lengte l moet worden vermenigvuldigd.
    ///
    /// `None` voor de gevallen f) en g): de figuur geeft daar een bereik en de
    /// vergelijkingen (5.15) respectievelijk (5.16) geven het getal.
    pub fn l0_factor(self) -> Option<f64> {
        match self {
            Knikgeval::ScharnierendScharnierend => Some(1.0),
            Knikgeval::Console => Some(2.0),
            Knikgeval::IngeklemdScharnierend => Some(0.7),
            Knikgeval::TweezijdigIngeklemdGeschoord => Some(0.5),
            Knikgeval::TweezijdigIngeklemdOngeschoord => Some(1.0),
            Knikgeval::GedeeltelijkIngeklemdGeschoord
            | Knikgeval::GedeeltelijkIngeklemdOngeschoord => None,
        }
    }

    /// De letter uit figuur 5.7.
    pub fn letter(self) -> &'static str {
        match self {
            Knikgeval::ScharnierendScharnierend => "a",
            Knikgeval::Console => "b",
            Knikgeval::IngeklemdScharnierend => "c",
            Knikgeval::TweezijdigIngeklemdGeschoord => "d",
            Knikgeval::TweezijdigIngeklemdOngeschoord => "e",
            Knikgeval::GedeeltelijkIngeklemdGeschoord => "f",
            Knikgeval::GedeeltelijkIngeklemdOngeschoord => "g",
        }
    }

    /// Het bijschrift van figuur 5.7, letterlijk.
    pub fn bijschrift(self) -> &'static str {
        match self {
            Knikgeval::ScharnierendScharnierend => "l₀ = l",
            Knikgeval::Console => "l₀ = 2l",
            Knikgeval::IngeklemdScharnierend => "l₀ = 0,7l",
            Knikgeval::TweezijdigIngeklemdGeschoord => "l₀ = l/2",
            Knikgeval::TweezijdigIngeklemdOngeschoord => "l₀ = l",
            Knikgeval::GedeeltelijkIngeklemdGeschoord => "l/2 < l₀ < l",
            Knikgeval::GedeeltelijkIngeklemdOngeschoord => "l₀ > 2l",
        }
    }

    /// Bij welke schoring hoort dit geval?
    ///
    /// **Dit is een lezing van de TEKENING, geen zin uit de norm.** §5.8.1
    /// definieert geschoord aan de hand van het ontwerpbesluit en niet aan de
    /// hand van de oplegging, en het bijschrift van figuur 5.7 zegt niets over
    /// schoring. Wat de figuur wél tekent, is of het bovenste einde zijdelings
    /// wordt gehouden, en dat valt op de gerenderde bladzijde 83 goed te zien:
    ///
    /// * **a)** en **c)** — bovenaan een scharnier tegen een gearceerde wand:
    ///   zijdelings gehouden.
    /// * **d)** — bovenaan rechtstreeks gearceerd, dus zowel op rotatie als op
    ///   verplaatsing gehouden.
    /// * **f)** — bovenaan een rol tegen een gearceerde wand met een veer
    ///   erbij: zijdelings gehouden, rotatie gedeeltelijk verhinderd.
    /// * **b)** — bovenaan HELEMAAL NIETS: alleen de belastingpijl, en de
    ///   gestreepte uitbuigingslijn helt naar buiten. Een console houdt zichzelf
    ///   overeind en is dus een schorend element; in de rekenregels heet dat
    ///   "niet-geschoord".
    /// * **e)** en **g)** — bovenaan een arcering met rollen eronder: de
    ///   rotatie is verhinderd maar de verplaatsing niet.
    ///
    /// [`kolomslankheid`] gebruikt dit om een tegenspraak in de INVOER af te
    /// wijzen: geval e) opgeven en tegelijk "geschoord" aanvinken kan niet
    /// allebei waar zijn. Wie een geval nodig heeft dat hier niet in past, moet
    /// l₀ opgeven of (5.15)/(5.16) gebruiken; dan doet deze indeling niet mee.
    pub fn schoring(self) -> Schoring {
        match self {
            Knikgeval::ScharnierendScharnierend
            | Knikgeval::IngeklemdScharnierend
            | Knikgeval::TweezijdigIngeklemdGeschoord
            | Knikgeval::GedeeltelijkIngeklemdGeschoord => Schoring::Geschoord,
            Knikgeval::Console
            | Knikgeval::TweezijdigIngeklemdOngeschoord
            | Knikgeval::GedeeltelijkIngeklemdOngeschoord => Schoring::Ongeschoord,
        }
    }

    pub fn omschrijving(self) -> &'static str {
        match self {
            Knikgeval::ScharnierendScharnierend => {
                "figuur 5.7 a) — beide einden scharnierend en zijdelings gesteund"
            }
            Knikgeval::Console => {
                "figuur 5.7 b) — onderaan ingeklemd, bovenaan volledig vrij (console)"
            }
            Knikgeval::IngeklemdScharnierend => {
                "figuur 5.7 c) — onderaan ingeklemd, bovenaan scharnierend en zijdelings gesteund"
            }
            Knikgeval::TweezijdigIngeklemdGeschoord => {
                "figuur 5.7 d) — beide einden ingeklemd, zijdelings gesteund"
            }
            Knikgeval::TweezijdigIngeklemdOngeschoord => {
                "figuur 5.7 e) — beide einden ingeklemd tegen rotatie, bovenaan zijdelings vrij"
            }
            Knikgeval::GedeeltelijkIngeklemdGeschoord => {
                "figuur 5.7 f) — gedeeltelijke inklemming, zijdelings gesteund; l₀ volgens (5.15)"
            }
            Knikgeval::GedeeltelijkIngeklemdOngeschoord => {
                "figuur 5.7 g) — gedeeltelijke inklemming, zijdelings vrij; l₀ volgens (5.16)"
            }
        }
    }
}

/// De relatieve flexibiliteit k van een gedeeltelijke inklemming — §5.8.3.2(3).
///
/// k = (θ/M)·(EI/l), waarin θ de hoekverdraaiing van de gedeeltelijke
/// inklemming is door het buigend moment M, EI de buigstijfheid van het op druk
/// belaste element en l zijn vrije lengte tussen de eindaansluitingen.
///
/// Eenheden: θ in rad, M in N·mm, EI in N·mm², l in mm. Het resultaat is
/// dimensieloos. Wie θ/M in rad/kNm invult en EI in N·mm² krijgt een k die er
/// duizend keer naast zit en die er toch geloofwaardig uitziet — vandaar dat de
/// argumenten hun eenheid in de naam dragen.
///
/// §5.8.3.2(4): draagt óók een aansluitende kolom in het knooppunt bij aan de
/// rotatie bij knik, dan moet (E·I/l) worden vervangen door de SOM
/// [(EI/l)_a + (EI/l)_b] van de kolom boven en onder het knooppunt. Dat is een
/// keuze van de aanroeper; deze functie rekent met wat zij krijgt.
pub fn k_relatieve_flexibiliteit(
    theta_rad: f64,
    m_nmm: f64,
    ei_nmm2: f64,
    l_mm: f64,
) -> Result<f64, String> {
    if !(m_nmm.abs() > 0.0) {
        return Err("k = (θ/M)·(EI/l): M is nul, de verhouding θ/M bestaat niet".to_string());
    }
    if !(l_mm > 0.0) {
        return Err("k = (θ/M)·(EI/l): de vrije lengte l moet groter dan nul zijn".to_string());
    }
    Ok((theta_rad / m_nmm) * (ei_nmm2 / l_mm))
}

/// Past de aanbevolen ondergrens van 0,1 op k toe.
///
/// Levert `(k_gebruikt, is_opgehoogd)` terug, zodat de afleiding kan melden dat
/// er een aanbeveling is toegepast die de norm niet als eis stelt.
pub fn k_begrensd(k: f64) -> (f64, bool) {
    if k < K_MIN_AANBEVOLEN {
        (K_MIN_AANBEVOLEN, true)
    } else {
        (k, false)
    }
}

/// (5.15) — l₀ voor een GESCHOORD element in een regelmatig raamwerk.
///
/// l₀ = 0,5·l·√[(1 + k₁/(0,45 + k₁))·(1 + k₂/(0,45 + k₂))]
///
/// Randwaarden om de formule aan te herkennen: k₁ = k₂ = 0 geeft 0,5·l
/// (figuur 5.7 d)); k₁ = k₂ → ∞ geeft 0,5·l·√(2·2) = l (figuur 5.7 a)). Het
/// bijschrift van figuur 5.7 f), "l/2 < l₀ < l", is precies dat bereik.
pub fn l0_geschoord_5_15(k1: f64, k2: f64, l_mm: f64) -> f64 {
    let t1 = 1.0 + k1 / (0.45 + k1);
    let t2 = 1.0 + k2 / (0.45 + k2);
    0.5 * l_mm * (t1 * t2).sqrt()
}

/// (5.16) — l₀ voor een ONGESCHOORD element in een regelmatig raamwerk.
///
/// l₀ = l·max{ √(1 + 10·k₁·k₂/(k₁ + k₂)) ; (1 + k₁/(1 + k₁))·(1 + k₂/(1 + k₂)) }
///
/// De twee takken zijn geen alternatieven waaruit de constructeur kiest: de norm
/// schrijft het MAXIMUM voor. Bij kleine k wint de linker (wortel)tak, bij grote
/// k de rechter. Randwaarde: k₁ = k₂ = 0 geeft max{1 ; 1} = l — figuur 5.7 e).
///
/// De teller k₁·k₂/(k₁ + k₂) is bij k₁ = k₂ = 0 een 0/0. Dat geval kan alleen
/// ontstaan als de aanbevolen ondergrens van 0,1 is overgeslagen; hij wordt hier
/// opgevangen door de limiet (0) aan te houden, wat de linkertak op 1 zet en de
/// rechtertak laat winnen — dezelfde uitkomst l₀ = l als de limiet van beide
/// takken.
pub fn l0_ongeschoord_5_16(k1: f64, k2: f64, l_mm: f64) -> f64 {
    let som = k1 + k2;
    let tak_wortel = if som > 0.0 {
        (1.0 + 10.0 * k1 * k2 / som).sqrt()
    } else {
        1.0
    };
    let tak_product = (1.0 + k1 / (1.0 + k1)) * (1.0 + k2 / (1.0 + k2));
    l_mm * tak_wortel.max(tak_product)
}

/// (5.17) — l₀ uit een numeriek bepaalde knikbelasting, §5.8.3.2(6).
///
/// l₀ = π·√(EI/N_B), voor gevallen die niet onder (2) of (3) vallen:
/// veranderlijke normaalkracht of veranderlijke doorsnede. EI is een
/// REPRESENTATIEVE buigstijfheid en N_B de knikbelasting uitgedrukt in díe EI;
/// de norm voegt daaraan toe dat i in (5.14) bij dezelfde EI moet horen.
pub fn l0_uit_knikbelasting_5_17(ei_nmm2: f64, n_b_n: f64) -> Result<f64, String> {
    if !(n_b_n > 0.0) {
        return Err("(5.17): de knikbelasting N_B moet groter dan nul zijn".to_string());
    }
    if !(ei_nmm2 > 0.0) {
        return Err("(5.17): de buigstijfheid EI moet groter dan nul zijn".to_string());
    }
    Ok(std::f64::consts::PI * (ei_nmm2 / n_b_n).sqrt())
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.3.2(1) — de slankheid λ
// ═══════════════════════════════════════════════════════════════════════════

/// De traagheidsstraal i van de NIET-GESCHEURDE betondoorsnede — §5.8.3.2(1).
///
/// i = √(I/A). Let op het woord *niet-gescheurde*: de wapening telt hier niet
/// mee en de scheurvorming evenmin. Dat is niet vanzelfsprekend — in §5.8.3.2(5)
/// eist de norm bij de bepaling van l₀ juist wél dat het effect van
/// scheurvorming in de VERHINDERENDE elementen zit. Twee verschillende
/// stijfheden in één rekengang, en ze wisselen makkelijk om.
pub fn traagheidsstraal_mm(i_mm4: f64, a_mm2: f64) -> Result<f64, String> {
    if !(a_mm2 > 0.0) {
        return Err("i = √(I/A): de oppervlakte A moet groter dan nul zijn".to_string());
    }
    if !(i_mm4 >= 0.0) {
        return Err("i = √(I/A): het kwadratisch oppervlaktemoment I mag niet negatief zijn"
            .to_string());
    }
    Ok((i_mm4 / a_mm2).sqrt())
}

/// De traagheidsstraal van een RECHTHOEK om de as loodrecht op de hoogte h:
/// i = h/√12 ≈ 0,2887·h.
///
/// Volgt uit I = b·h³/12 en A = b·h; de breedte valt weg. Handig als
/// zelfstandige controle op [`traagheidsstraal_mm`], en als eerlijke
/// standaardweg voor de gewone rechthoekige kolom.
pub fn traagheidsstraal_rechthoek_mm(h_mm: f64) -> f64 {
    h_mm / 12.0_f64.sqrt()
}

/// (5.14) — λ = l₀/i.
pub fn slankheid_5_14(l0_mm: f64, i_mm: f64) -> Result<f64, String> {
    if !(i_mm > 0.0) {
        return Err("(5.14) λ = l₀/i: de traagheidsstraal i moet groter dan nul zijn".to_string());
    }
    Ok(l0_mm / i_mm)
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.3.1 — de slankheidsgrens λ_lim
// ═══════════════════════════════════════════════════════════════════════════

/// ω = A_s·f_yd/(A_c·f_cd) — de mechanische wapeningsverhouding, §5.8.3.1(1).
///
/// A_s is de TOTALE oppervlakte van de doorsnede van de langswapening. Voor een
/// kolom is dat dus alles wat er in de vier zijden zit, niet alleen de
/// "trekwapening".
pub fn omega(a_s_mm2: f64, f_yd_mpa: f64, a_c_mm2: f64, f_cd_mpa: f64) -> Result<f64, String> {
    if !(a_c_mm2 > 0.0 && f_cd_mpa > 0.0) {
        return Err("ω = A_s·f_yd/(A_c·f_cd): A_c en f_cd moeten groter dan nul zijn".to_string());
    }
    Ok(a_s_mm2 * f_yd_mpa / (a_c_mm2 * f_cd_mpa))
}

/// n = N_Ed/(A_c·f_cd) — de relatieve normaalkracht, §5.8.3.1(1).
///
/// **N_Ed is hier een DRUKkracht en positief.** Dat is de conventie van §5.8;
/// aan de buitengrens van deze crate is N juist positief bij trek. De omzetting
/// zit in [`KolomInvoer::n_ed_kn`] en nergens anders — deze functie krijgt de
/// drukkracht al met het goede teken.
pub fn n_relatief(n_ed_druk_n: f64, a_c_mm2: f64, f_cd_mpa: f64) -> Result<f64, String> {
    if !(a_c_mm2 > 0.0 && f_cd_mpa > 0.0) {
        return Err("n = N_Ed/(A_c·f_cd): A_c en f_cd moeten groter dan nul zijn".to_string());
    }
    Ok(n_ed_druk_n / (a_c_mm2 * f_cd_mpa))
}

/// A = 1/(1 + 0,2·φ_ef); "als φ_ef onbekend is mag A = 0,7 zijn gebruikt".
///
/// Levert `(A, is_standaardwaarde)`.
///
/// Merk op dat 0,7 NIET conservatief is maar precies de waarde bij φ_ef ≈ 2,14.
/// Bij een lagere kruip is de werkelijke A groter (gunstiger) en bij een hogere
/// kleiner (ongunstiger). Wie de standaardwaarde gebruikt terwijl φ_ef groot is,
/// rekent λ_lim te hoog en verwaarloost tweede orde die er wel is.
pub fn factor_a(phi_ef: Option<f64>) -> (f64, bool) {
    match phi_ef {
        Some(p) if p.is_finite() && p >= 0.0 => (1.0 / (1.0 + 0.2 * p), false),
        _ => (0.7, true),
    }
}

/// Waar A in λ_lim vandaan komt.
///
/// §5.8.3.1(1) (5.13N), door de NB als eis gesteld: A = 1/(1 + 0,2·φ_ef),
/// "als φ_ef onbekend is mag A = 0,7 zijn gebruikt". Die 0,7 hoort bij
/// φ_ef ≈ 2,14 en ligt dus alleen aan de veilige kant zolang de werkelijke
/// φ_ef niet groter is. Daarom maakt de gang onderscheid tussen een φ_ef die
/// ONBEKEND is omdat er niets over de kruip bekend is, en een φ_ef die alleen
/// in (5.19) niet kon worden ingevuld terwijl φ(∞,t₀) wél gegeven is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum AGrondslag {
    /// A = 1/(1 + 0,2·φ_ef) met φ_ef uit (5.19).
    UitPhiEf,
    /// φ_ef is niet uit (5.19) te bepalen (geen M₀Eqp, of M₀Ed = 0), maar
    /// φ(∞,t₀) is gegeven en groter dan 2,14. Dan is 0,7 niet meer de veilige
    /// kant en is A genomen met φ(∞,t₀) als bovengrens van φ_ef:
    /// A = 1/(1 + 0,2·φ(∞,t₀)) < 0,7. De bovengrens volgt uit (5.19) zelf
    /// zolang |M₀Eqp| ≤ |M₀Ed| — de quasi-blijvende combinatie is niet
    /// zwaarder dan de UGT-combinatie.
    BovengrensKruip { phi_inf_t0: f64 },
    /// A = 0,7, de standaardwaarde die §5.8.3.1(1) toestaat als φ_ef onbekend
    /// is. `phi_inf_t0` is `Some` als φ(∞,t₀) wel gegeven is maar niet groter
    /// dan 2,14: dan is 0,7 de kleinste — veilige — van de twee.
    Standaardwaarde { phi_inf_t0: Option<f64> },
}

/// A voor λ_lim, met de grondslag erbij. Zie [`AGrondslag`].
///
/// `phi_ef` is de uitkomst van (5.19) als die er is; `phi_inf_t0` de
/// opgegeven eindkruipcoëfficiënt. A is nooit groter dan de waarde die de
/// norm voor het geval toestaat: met (5.19) de formule, zonder (5.19) de
/// kleinste van 0,7 en 1/(1 + 0,2·φ(∞,t₀)).
pub fn factor_a_met_grondslag(phi_ef: Option<f64>, phi_inf_t0: Option<f64>) -> (f64, AGrondslag) {
    match (phi_ef, phi_inf_t0) {
        (Some(p), _) if p.is_finite() && p >= 0.0 => (1.0 / (1.0 + 0.2 * p), AGrondslag::UitPhiEf),
        (_, Some(phi)) if phi.is_finite() && phi >= 0.0 => {
            let a_bovengrens = 1.0 / (1.0 + 0.2 * phi);
            if a_bovengrens < 0.7 {
                (a_bovengrens, AGrondslag::BovengrensKruip { phi_inf_t0: phi })
            } else {
                (0.7, AGrondslag::Standaardwaarde { phi_inf_t0: Some(phi) })
            }
        }
        _ => (0.7, AGrondslag::Standaardwaarde { phi_inf_t0: None }),
    }
}

/// De kanttekening bij A als A NIET uit (5.19) komt: welke terugval, en onder
/// welke voorwaarde de norm hem toestaat. `None` als A uit (5.19) komt.
///
/// `m0_eqp_knm` en `m0_ed_knm` bepalen alleen de reden in de tekst waarom
/// (5.19) niet is ingevuld; het getal verandert er niet door.
pub fn a_toelichting(
    grondslag: AGrondslag,
    m0_eqp_knm: Option<f64>,
    m0_ed_knm: Option<f64>,
) -> Option<String> {
    let reden_519 = match (m0_ed_knm, m0_eqp_knm) {
        (Some(ed), _) if !(ed.abs() > 1e-9) => {
            "M₀Ed is nul, dus de verhouding M₀Eqp/M₀Ed van (5.19) is onbepaald"
        }
        (None, _) => "M₀Ed is niet bekend, dus (5.19) is niet in te vullen",
        (_, None) => {
            "M₀Eqp uit de quasi-blijvende BGT-combinatie ontbreekt, dus (5.19) is niet in te \
             vullen"
        }
        _ => "(5.19) is niet ingevuld",
    };
    match grondslag {
        AGrondslag::UitPhiEf => None,
        AGrondslag::BovengrensKruip { phi_inf_t0 } => Some(format!(
            "WAARSCHUWING — A niet uit (5.19): φ(∞,t₀) = {} is gegeven, maar {}. §5.8.3.1(1) \
             staat bij een onbekende φ_ef A = 0,7 toe, maar 0,7 hoort bij φ_ef ≈ 2,14 en ligt bij \
             deze kruipcoëfficiënt NIET aan de veilige kant. Daarom is φ(∞,t₀) als bovengrens van \
             φ_ef genomen — (5.19) φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed is niet groter zolang |M₀Eqp| ≤ \
             |M₀Ed| — en A = 1/(1 + 0,2·{}) = {}.",
            nl(phi_inf_t0, 2),
            reden_519,
            nl(phi_inf_t0, 2),
            nl(1.0 / (1.0 + 0.2 * phi_inf_t0), 3)
        )),
        AGrondslag::Standaardwaarde { phi_inf_t0: Some(phi) } => Some(format!(
            "A = 0,7 (§5.8.3.1(1): \"als φ_ef onbekend is mag A = 0,7 zijn gebruikt\"): φ(∞,t₀) = \
             {} is gegeven, maar {}. De voorwaarde waaronder 0,7 aan de veilige kant ligt — \
             φ_ef ≤ 2,14 — is hier vervuld: φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed is niet groter dan \
             φ(∞,t₀) = {} zolang |M₀Eqp| ≤ |M₀Ed|, en 1/(1 + 0,2·{}) = {} ≥ 0,7.",
            nl(phi, 2),
            reden_519,
            nl(phi, 2),
            nl(phi, 2),
            nl(1.0 / (1.0 + 0.2 * phi), 3)
        )),
        AGrondslag::Standaardwaarde { phi_inf_t0: None } => Some(
            "WAARSCHUWING — A = 0,7 zonder kruipgegevens: φ(∞,t₀) is niet opgegeven, dus φ_ef \
             is onbekend en §5.8.3.1(1) staat A = 0,7 toe (\"als φ_ef onbekend is mag A = 0,7 \
             zijn gebruikt\"). Die 0,7 is GEEN veilige kant maar de waarde bij φ_ef ≈ 2,14: bij \
             zwaardere kruip is de werkelijke A kleiner en λ_lim lager dan hier staat. Geef \
             φ(∞,t₀) op (§3.1.4) — als projectwaarde of per staaf — om A uit (5.19) te bepalen."
                .to_string(),
        ),
    }
}

/// B = √(1 + 2ω); "als ω onbekend is, mag B = 1,1 zijn gebruikt".
///
/// Levert `(B, is_standaardwaarde)`. B = 1,1 hoort bij ω = 0,105.
pub fn factor_b(omega: Option<f64>) -> (f64, bool) {
    match omega {
        Some(w) if w.is_finite() && w >= 0.0 => ((1.0 + 2.0 * w).sqrt(), false),
        _ => (1.1, true),
    }
}

/// Waarom C zijn waarde heeft — dit is de plek waar geschoord/ongeschoord
/// rechtstreeks in het getal doorwerkt.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Cgrondslag {
    /// C = 1,7 − r_m met r_m = M₀₁/M₀₂ uit de twee eerste-orde-eindmomenten.
    UitEindmomenten { m01_knm: f64, m02_knm: f64, r_m: f64 },
    /// §5.8.3.1(1): "In de volgende gevallen behoort r_m gelijk aan 1,0 te zijn
    /// genomen (dat wil zeggen C = 0,7): … voor geschoorde elementen waarin de
    /// eerste-orde-effecten alleen of voornamelijk zijn veroorzaakt door
    /// imperfecties of dwarsbelasting".
    GeschoordUitImperfectiesOfDwarsbelasting,
    /// §5.8.3.1(1), tweede geval: "voor niet-geschoorde elementen in het
    /// algemeen". Geen uitzondering, geen voorwaarde — een ongeschoord element
    /// krijgt C = 0,7.
    OngeschoordInHetAlgemeen,
    /// r_m is niet opgegeven: "als r_m onbekend is, mag C = 0,7 zijn gebruikt".
    Onbekend,
}

impl Cgrondslag {
    pub fn c(&self) -> f64 {
        match self {
            Cgrondslag::UitEindmomenten { r_m, .. } => 1.7 - r_m,
            Cgrondslag::GeschoordUitImperfectiesOfDwarsbelasting
            | Cgrondslag::OngeschoordInHetAlgemeen
            | Cgrondslag::Onbekend => 0.7,
        }
    }

    pub fn toelichting(&self) -> String {
        match self {
            Cgrondslag::UitEindmomenten { m01_knm, m02_knm, r_m } => format!(
                "C = 1,7 − r_m met r_m = M₀₁/M₀₂ = {}/{} = {}. Het teken volgt uit §5.8.3.1(1): \
                 geven M₀₁ en M₀₂ aan dezelfde zijde trek, dan is r_m positief (C ≤ 1,7), anders \
                 negatief (C > 1,7).",
                nl(*m01_knm, 2),
                nl(*m02_knm, 2),
                nl(*r_m, 3)
            ),
            Cgrondslag::GeschoordUitImperfectiesOfDwarsbelasting => {
                "C = 0,7: §5.8.3.1(1) schrijft r_m = 1,0 voor bij een geschoord element waarin de \
                 eerste-orde-effecten alleen of voornamelijk door imperfecties of dwarsbelasting \
                 zijn veroorzaakt."
                    .to_string()
            }
            Cgrondslag::OngeschoordInHetAlgemeen => {
                "C = 0,7: §5.8.3.1(1) schrijft r_m = 1,0 voor \"voor niet-geschoorde elementen in \
                 het algemeen\". Er is geen gunstiger tak voor een ongeschoorde kolom — dit is de \
                 bepaling waarin het ontwerpbesluit geschoord/ongeschoord rechtstreeks in λ_lim \
                 doorwerkt."
                    .to_string()
            }
            Cgrondslag::Onbekend => {
                "C = 0,7: de eerste-orde-eindmomenten zijn niet opgegeven, en §5.8.3.1(1) staat \
                 dan de standaardwaarde toe (\"als r_m onbekend is, mag C = 0,7 zijn gebruikt\")."
                    .to_string()
            }
        }
    }
}

/// Bepaalt C volgens §5.8.3.1(1), in de volgorde waarin de norm de gevallen
/// noemt.
///
/// De volgorde is niet vrij te kiezen. Een ongeschoord element valt ALTIJD in
/// de r_m = 1,0-tak, ook als de eindmomenten bekend zijn — "voor niet-geschoorde
/// elementen in het algemeen" kent geen uitzondering. Pas daarna komt de
/// geschoorde uitzondering aan bod, en pas als beide niet gelden, mogen de
/// eindmomenten worden gebruikt.
///
/// `eindmomenten` is `(M₀₁, M₀₂)` in kNm, met |M₀₂| ≥ |M₀₁| en met een teken
/// dat de trekzijde weergeeft: gelijk teken = trek aan dezelfde zijde.
pub fn grondslag_c(
    schoring: Schoring,
    eerste_orde_vooral_imperfecties_of_dwarsbelasting: bool,
    eindmomenten: Option<(f64, f64)>,
) -> Result<Cgrondslag, String> {
    if schoring == Schoring::Ongeschoord {
        return Ok(Cgrondslag::OngeschoordInHetAlgemeen);
    }
    if eerste_orde_vooral_imperfecties_of_dwarsbelasting {
        return Ok(Cgrondslag::GeschoordUitImperfectiesOfDwarsbelasting);
    }
    match eindmomenten {
        Some((m01, m02)) => {
            if !(m02.abs() > 0.0) {
                return Err(
                    "r_m = M₀₁/M₀₂: M₀₂ is nul. §5.8.3.1(1) definieert M₀₂ als het GROOTSTE van \
                     de twee eerste-orde-eindmomenten (|M₀₂| ≥ |M₀₁|); is dat nul, dan zijn er \
                     geen eindmomenten en geldt de tak r_m = 1,0 uit imperfecties of \
                     dwarsbelasting."
                        .to_string(),
                );
            }
            if m01.abs() > m02.abs() + 1e-9 {
                return Err(format!(
                    "r_m = M₀₁/M₀₂ vereist |M₀₂| ≥ |M₀₁| (§5.8.3.1(1)); opgegeven is \
                     |M₀₁| = {} kNm en |M₀₂| = {} kNm. Verwissel de twee.",
                    nl(m01.abs(), 2),
                    nl(m02.abs(), 2)
                ));
            }
            Ok(Cgrondslag::UitEindmomenten { m01_knm: m01, m02_knm: m02, r_m: m01 / m02 })
        }
        None => Ok(Cgrondslag::Onbekend),
    }
}

/// (5.13N) / NB bij §5.8.3.1(1) — λ_lim = 20·A·B·C/√n.
///
/// De NB heeft de OPMERKING met (5.13N) geschrapt en woordelijk als EIS
/// teruggezet: "De waarde van λ_lim moet gelijk aan 20·A·B·C/√n zijn genomen."
/// Dezelfde formule, dezelfde definities, andere status.
///
/// n staat onder een wortel in de NOEMER. Bij n → 0 loopt λ_lim naar oneindig
/// en zou elke kolom "slank genoeg" heten. Een element zonder normaaldruk is
/// echter geen knikgeval en hoort deze toets helemaal niet te krijgen; daarom
/// weigert deze functie n ≤ 0 in plaats van er een getal van te maken.
pub fn lambda_lim_5_13n(
    bijlage: nationale_bijlage::NationaleBijlage,
    a: f64,
    b: f64,
    c: f64,
    n: f64,
) -> Result<f64, String> {
    if !(n > 0.0) {
        return Err(format!(
            "λ_lim = 20·A·B·C/√n vereist een DRUKkracht: n = N_Ed/(A_c·f_cd) is {} en dus niet \
             positief. Een element zonder normaaldruk is geen knikgeval; §5.8 is er niet op van \
             toepassing.",
            nl(n, 4)
        ));
    }
    // De coëfficiënt 20 is een nationaal bepaalde parameter en komt uit de rij
    // van `bijlage` in de normnaad, niet uit een los getal in deze regel.
    Ok(nationale_bijlage::Ndp1992::voor(bijlage).lambda_lim_coefficient * a * b * c / n.sqrt())
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.4 — de effectieve kruipcoëfficiënt φ_ef
// ═══════════════════════════════════════════════════════════════════════════

/// (5.19) — φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed.
///
/// M₀Eqp is het eerste-orde-buigend moment in de QUASI-BLIJVENDE combinatie
/// (BGT); M₀Ed dat in de UGT. Beide zijn EERSTE-ORDE-momenten — niet de totale
/// momenten. De norm noemt in een OPMERKING de mogelijkheid om φ_ef wél op de
/// totale momenten M_Eqp en M_Ed te baseren, maar zegt er meteen bij dat dat
/// iteraties vraagt en een stabiliteitstoetsing onder de quasi-blijvende
/// belasting met φ_ef = φ(∞,t₀). Die weg is hier niet gebouwd.
///
/// §5.8.4(3): varieert de verhouding M₀Eqp/M₀Ed over het element, dan mag zij
/// worden bepaald in de doorsnede met het maximale moment, of mag een
/// representatieve gemiddelde waarde worden gebruikt. Welke van de twee het is,
/// is een keuze van de aanroeper en hoort in de afleiding te staan.
pub fn phi_ef_5_19(phi_inf_t0: f64, m0_eqp_knm: f64, m0_ed_knm: f64) -> Result<f64, String> {
    if !(phi_inf_t0 >= 0.0) {
        return Err("(5.19): φ(∞,t₀) mag niet negatief zijn".to_string());
    }
    if !(m0_ed_knm.abs() > 0.0) {
        return Err(
            "(5.19) φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed: M₀Ed is nul. Zonder eerste-orde-moment in de UGT \
             is de verhouding onbepaald; §5.8.4(4) geeft dan juist de derde voorwaarde \
             M₀Ed/N_Ed ≥ h die niet vervuld kan zijn."
                .to_string(),
        );
    }
    Ok(phi_inf_t0 * (m0_eqp_knm / m0_ed_knm).abs())
}

/// Het antwoord op §5.8.4(4): mag φ_ef = 0 worden aangehouden?
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct KruipVerwaarlozing {
    /// Alle drie de voorwaarden vervuld?
    pub toegestaan: bool,
    /// φ(∞,t₀) ≤ 2.
    pub kruipcoefficient_ten_hoogste_2: bool,
    /// λ ≤ 75.
    pub slankheid_ten_hoogste_75: bool,
    /// M₀Ed/N_Ed ≥ h, met h de hoogte van de doorsnede in de overeenkomstige
    /// richting.
    pub excentriciteit_ten_minste_h: bool,
    /// De uitgerekende excentriciteit M₀Ed/N_Ed in mm, ter vergelijking met h.
    pub e0_mm: f64,
    /// De waarschuwing uit de OPMERKING bij §5.8.4(4), als zij van toepassing
    /// is. `None` = de opmerking speelt hier niet of ω is niet opgegeven.
    pub waarschuwing: Option<String>,
}

/// §5.8.4(4) — mag het effect van kruip worden verwaarloosd (φ_ef = 0)?
///
/// Drie voorwaarden, alle drie tegelijk:
///
/// * φ(∞,t₀) ≤ 2;
/// * λ ≤ 75;
/// * M₀Ed/N_Ed ≥ h, met h de hoogte van de doorsnede in de overeenkomstige
///   richting.
///
/// De derde voorwaarde is een EXCENTRICITEITSeis: het eerste-orde-moment moet
/// zo groot zijn dat de resultante buiten de doorsnede valt. Een centrisch
/// gedrukte kolom voldoet er dus nooit aan, en juist daar is kruip het
/// gevaarlijkst.
///
/// `omega` is optioneel en dient alleen voor de OPMERKING bij dit lid: "Indien
/// slechts net aan de voorwaarden voor verwaarlozing van de tweede-orde-effecten,
/// volgens 5.8.2(6) of 5.8.3.3, is voldaan, kan het te optimistisch zijn om
/// zowel de tweede-orde-effecten als de kruip te verwaarlozen, tenzij de
/// mechanische wapeningsverhouding (ω, zie 5.8.3.1(1)) ten minste 0,25 is."
///
/// **N_Ed is hier weer de DRUKkracht, positief.** Zie [`n_relatief`].
pub fn kruip_verwaarloosbaar_5_8_4_4(
    phi_inf_t0: f64,
    lambda: f64,
    m0_ed_knm: f64,
    n_ed_druk_kn: f64,
    h_mm: f64,
    omega: Option<f64>,
) -> Result<KruipVerwaarlozing, String> {
    if !(n_ed_druk_kn > 0.0) {
        return Err(
            "§5.8.4(4) toetst M₀Ed/N_Ed ≥ h; daarvoor moet N_Ed een drukkracht groter dan nul \
             zijn."
                .to_string(),
        );
    }
    if !(h_mm > 0.0) {
        return Err("§5.8.4(4): de doorsnedehoogte h in de beschouwde richting moet groter dan \
                    nul zijn"
            .to_string());
    }
    // M₀Ed in kNm → N·mm is ×1e6; N_Ed in kN → N is ×1e3. De verhouding is dus
    // ×1e3 en komt in mm uit, dezelfde eenheid als h.
    let e0_mm = (m0_ed_knm.abs() * 1.0e6) / (n_ed_druk_kn * 1.0e3);
    let c1 = phi_inf_t0 <= 2.0;
    let c2 = lambda <= 75.0;
    let c3 = e0_mm >= h_mm;
    let toegestaan = c1 && c2 && c3;
    let waarschuwing = match omega {
        Some(w) if w < 0.25 => Some(format!(
            "OPMERKING bij §5.8.4(4): is slechts nét aan de voorwaarden voor verwaarlozing van de \
             tweede-orde-effecten voldaan, dan kan het te optimistisch zijn om zowel die effecten \
             als de kruip te verwaarlozen, tenzij ω ten minste 0,25 is. Hier is ω = {} en dus \
             kleiner dan 0,25.",
            nl(w, 3)
        )),
        Some(_) => None,
        None => Some(
            "OPMERKING bij §5.8.4(4) kon niet worden nagegaan: de mechanische \
             wapeningsverhouding ω is niet opgegeven. De opmerking waarschuwt tegen het \
             tegelijk verwaarlozen van tweede-orde-effecten én kruip als ω kleiner is dan 0,25."
                .to_string(),
        ),
    };
    Ok(KruipVerwaarlozing {
        toegestaan,
        kruipcoefficient_ten_hoogste_2: c1,
        slankheid_ten_hoogste_75: c2,
        excentriciteit_ten_minste_h: c3,
        e0_mm,
        waarschuwing,
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// De hele gang in één keer
// ═══════════════════════════════════════════════════════════════════════════

/// Hoe l₀ tot stand komt.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Kniklengtebepaling {
    /// Een vast geval uit figuur 5.7: l₀ = factor · l.
    Standaardgeval(Knikgeval),
    /// (5.15) of (5.16), met de twee relatieve flexibiliteiten. Welke van de
    /// twee formules geldt, volgt uit [`Schoring`] en uit niets anders.
    Raamwerk { k1: f64, k2: f64 },
    /// (5.17): l₀ = π·√(EI/N_B) uit een numeriek bepaalde knikbelasting.
    UitKnikbelasting { ei_nmm2: f64, n_b_n: f64 },
    /// l₀ rechtstreeks opgegeven, bijvoorbeeld uit een aparte knikanalyse.
    /// Dan legt de afleiding vast dát het gegeven is, en niet waaruit.
    Opgegeven,
}

/// Alles wat §5.8.3 en §5.8.4 van een kolom moeten weten.
///
/// # Het invoerveld "geschoord" — waar het hoort
///
/// [`KolomInvoer::schoring`] is een eigenschap van de STAAF PER AS, niet van
/// het model en niet van de doorsnede. Een kolom kan in het vlak van het
/// raamwerk geschoord zijn (een kern of een windverband neemt de stabiliteit
/// over) en er loodrecht op ongeschoord, of andersom. Eén vinkje per staaf is
/// dus te weinig.
///
/// De frontend heeft dat veld nog NIET en deze module maakt het ook niet aan —
/// dat zou over de grens van dit spoor heen reiken. Wat het moet worden, ligt
/// wel vast: `BeamCheckConfig` in `design-mockup/src/components/fem/femTypes.ts`
/// draagt al `bucklingLengthY_m` en `bucklingLengthZ_m`, twee per-as-velden van
/// precies dezelfde soort. Daarnaast horen:
///
/// ```ts
/// /** §5.8.1 — draagt deze staaf om de STERKE as bij aan de horizontale
///  *  stabiliteit? Geen standaardwaarde: het is een ontwerpbesluit, en
///  *  ontbreekt het, dan wordt §5.8 niet getoetst en zegt het paneel waarom. */
/// betonGeschoordY?: boolean;
/// /** Idem om de ZWAKKE as. */
/// betonGeschoordZ?: boolean;
/// ```
///
/// `undefined` mag daarbij niet stilzwijgend "geschoord" gaan betekenen. Dat is
/// dezelfde afspraak als bij `milieuklasse` in datzelfde bestand: ontbreekt de
/// klasse, dan wordt de dekking niet getoetst in plaats van met een aangenomen
/// klasse goedgekeurd. Een aangenomen "geschoord" is erger dan geen toets: het
/// levert een groene kolom op die in werkelijkheid twee keer zo slank is.
#[derive(Clone, Debug)]
pub struct KolomInvoer {
    /// De nationale bijlage waaruit de coëfficiënt van λ_lim (5.13N) komt
    /// (normnaad). De aanroeper geeft de bijlage van zijn verzoek door.
    pub bijlage: nationale_bijlage::NationaleBijlage,
    /// Vrije lengte l tussen de eindaansluitingen, mm (§5.8.3.2(3)).
    pub l_mm: f64,
    /// Hoe l₀ wordt bepaald.
    pub kniklengte: Kniklengtebepaling,
    /// l₀ in mm — alleen gebruikt bij [`Kniklengtebepaling::Opgegeven`].
    pub l0_opgegeven_mm: Option<f64>,
    /// Geschoord of ongeschoord: het ONTWERPBESLUIT van §5.8.1.
    pub schoring: Schoring,
    /// Traagheidsstraal i van de niet-gescheurde betondoorsnede, mm.
    pub i_mm: f64,
    /// Oppervlakte van de betondoorsnede A_c, mm².
    pub a_c_mm2: f64,
    /// Totale oppervlakte van de langswapening A_s, mm² (alle vier de zijden).
    pub a_s_mm2: f64,
    /// f_cd, N/mm².
    pub f_cd_mpa: f64,
    /// f_yd, N/mm².
    pub f_yd_mpa: f64,
    /// **N_Ed in de tekenconventie van de buitengrens: POSITIEF = TREK.**
    ///
    /// §5.8 rekent met druk positief; de omzetting gebeurt in
    /// [`kolomslankheid`] en nergens anders. Een positieve waarde hier
    /// betekent dus trek en levert een leesbare weigering op in plaats van een
    /// stilzwijgend verkeerde λ_lim.
    pub n_ed_kn: f64,
    /// Eerste-orde-buigend moment in de UGT, kNm — M₀Ed uit (5.19) en uit de
    /// derde voorwaarde van §5.8.4(4). `None` = niet opgegeven.
    pub m0_ed_knm: Option<f64>,
    /// Eerste-orde-buigend moment in de quasi-blijvende combinatie (BGT), kNm —
    /// M₀Eqp uit (5.19). `None` = niet opgegeven.
    pub m0_eqp_knm: Option<f64>,
    /// Eindwaarde van de kruipcoëfficiënt φ(∞,t₀) volgens §3.1.4. `None` = niet
    /// opgegeven; dan blijft φ_ef onbekend en geldt A = 0,7.
    pub phi_inf_t0: Option<f64>,
    /// Doorsnedehoogte h in de beschouwde richting, mm — nodig voor de derde
    /// voorwaarde van §5.8.4(4).
    pub h_mm: Option<f64>,
    /// De twee eerste-orde-eindmomenten (M₀₁, M₀₂) in kNm, met |M₀₂| ≥ |M₀₁|.
    /// Gelijk teken = trek aan dezelfde zijde.
    pub eindmomenten_knm: Option<(f64, f64)>,
    /// Komen de eerste-orde-effecten alleen of voornamelijk uit imperfecties of
    /// dwarsbelasting? Alleen van belang bij een GESCHOORD element; dan schrijft
    /// §5.8.3.1(1) r_m = 1,0 voor.
    pub eerste_orde_vooral_imperfecties_of_dwarsbelasting: bool,
}

/// De uitkomst van §5.8.3 en §5.8.4 voor één kolom, één richting.
#[derive(Clone, Debug)]
pub struct Kolomslankheid {
    pub schoring: Schoring,
    pub l_mm: f64,
    pub l0_mm: f64,
    pub kniklengte: Kniklengtebepaling,
    /// De k-waarden zoals ze in (5.15)/(5.16) zijn ingevuld, ná de aanbevolen
    /// ondergrens van 0,1, plus of die grens is toegepast.
    pub k_gebruikt: Option<(f64, f64)>,
    pub k_opgehoogd: (bool, bool),
    pub i_mm: f64,
    pub lambda: f64,
    /// n = N_Ed/(A_c·f_cd), met N_Ed als drukkracht positief.
    pub n: f64,
    pub n_ed_druk_kn: f64,
    pub omega: f64,
    /// φ_ef volgens (5.19), of `None` als φ(∞,t₀) of de momenten ontbreken.
    pub phi_ef: Option<f64>,
    /// Het antwoord van §5.8.4(4), als het te geven was.
    pub kruip: Option<KruipVerwaarlozing>,
    pub a: f64,
    /// A = 0,7 als standaardwaarde van §5.8.3.1(1).
    pub a_standaard: bool,
    /// Waar A vandaan komt; zie [`AGrondslag`].
    pub a_grondslag: AGrondslag,
    pub b: f64,
    pub b_standaard: bool,
    pub c_grondslag: Cgrondslag,
    pub c: f64,
    pub lambda_lim: f64,
    /// λ < λ_lim → §5.8.3.1(1) staat toe de tweede-orde-effecten te
    /// verwaarlozen.
    pub tweede_orde_verwaarloosbaar: bool,
    /// Kanttekeningen die bij de hele gang horen en niet bij één stap.
    pub kanttekeningen: Vec<String>,
}

/// Rekent §5.8.3 en §5.8.4 door voor één kolom in één richting.
///
/// Weigert liever dan te gokken: ontbreekt een gegeven waarvan de norm geen
/// standaardwaarde geeft, dan komt er een leesbare foutmelding. Waar de norm
/// zelf een standaardwaarde toestaat (A = 0,7, B = 1,1, C = 0,7), wordt die
/// gebruikt én gemeld.
pub fn kolomslankheid(inv: &KolomInvoer) -> Result<Kolomslankheid, String> {
    let mut kanttekeningen = Vec::new();

    if !(inv.l_mm > 0.0) {
        return Err("de vrije lengte l moet groter dan nul zijn".to_string());
    }

    // ── l₀ ────────────────────────────────────────────────────────────────
    let mut k_gebruikt = None;
    let mut k_opgehoogd = (false, false);
    let l0_mm = match inv.kniklengte {
        Kniklengtebepaling::Standaardgeval(geval) => {
            if geval.schoring() != inv.schoring {
                return Err(format!(
                    "figuur 5.7 {}) is een {} geval, maar de kolom is als {} opgegeven. \
                     Geschoord/ongeschoord is een ontwerpbesluit (§5.8.1) en het knikgeval moet \
                     daarbij passen.",
                    geval.letter(),
                    geval.schoring().label(),
                    inv.schoring.label()
                ));
            }
            let factor = geval.l0_factor().ok_or_else(|| {
                format!(
                    "figuur 5.7 {}) geeft geen vaste l₀ maar het bereik \"{}\"; gebruik \
                     Kniklengtebepaling::Raamwerk met k₁ en k₂, dan levert {} het getal.",
                    geval.letter(),
                    geval.bijschrift(),
                    match geval.schoring() {
                        Schoring::Geschoord => "(5.15)",
                        Schoring::Ongeschoord => "(5.16)",
                    }
                )
            })?;
            factor * inv.l_mm
        }
        Kniklengtebepaling::Raamwerk { k1, k2 } => {
            if !(k1 >= 0.0 && k2 >= 0.0) {
                return Err("k₁ en k₂ zijn relatieve flexibiliteiten en kunnen niet negatief zijn"
                    .to_string());
            }
            let (k1g, op1) = k_begrensd(k1);
            let (k2g, op2) = k_begrensd(k2);
            k_gebruikt = Some((k1g, k2g));
            k_opgehoogd = (op1, op2);
            if op1 || op2 {
                kanttekeningen.push(format!(
                    "De OPMERKING bij §5.8.3.2(3) beveelt voor k₁ en k₂ een minimumwaarde van 0,1 \
                     aan, omdat een volledig starre verhindering in de praktijk zeldzaam is. Die \
                     grens is hier toegepast: k₁ = {} en k₂ = {}. Het is een AANBEVELING in de \
                     EN-tekst, geen eis, en de nationale bijlage wijzigt hem niet.",
                    nl(k1g, 3),
                    nl(k2g, 3)
                ));
            }
            match inv.schoring {
                Schoring::Geschoord => l0_geschoord_5_15(k1g, k2g, inv.l_mm),
                Schoring::Ongeschoord => l0_ongeschoord_5_16(k1g, k2g, inv.l_mm),
            }
        }
        Kniklengtebepaling::UitKnikbelasting { ei_nmm2, n_b_n } => {
            kanttekeningen.push(
                "l₀ volgt uit (5.17) met een numeriek bepaalde knikbelasting. §5.8.3.2(6) eist \
                 daarbij uitdrukkelijk dat i in (5.14) bij DEZELFDE representatieve EI hoort; dat \
                 is hier niet controleerbaar en blijft de verantwoordelijkheid van de aanroeper."
                    .to_string(),
            );
            l0_uit_knikbelasting_5_17(ei_nmm2, n_b_n)?
        }
        Kniklengtebepaling::Opgegeven => inv.l0_opgegeven_mm.ok_or_else(|| {
            "de kniklengte is als 'opgegeven' aangemerkt maar l₀ is niet ingevuld".to_string()
        })?,
    };

    // ── λ ─────────────────────────────────────────────────────────────────
    let lambda = slankheid_5_14(l0_mm, inv.i_mm)?;

    // ── n en ω ────────────────────────────────────────────────────────────
    // De buitengrens rekent met trek positief; §5.8 met druk positief.
    let n_ed_druk_kn = -inv.n_ed_kn;
    if !(n_ed_druk_kn > 0.0) {
        return Err(format!(
            "§5.8 is een toets op een op DRUK belast element. Opgegeven is N_Ed = {} kN in de \
             conventie van de buitengrens (positief = trek), dus {} kN druk. Zonder normaaldruk \
             is er geen knikgeval en is λ_lim niet gedefinieerd (√n in de noemer).",
            nl(inv.n_ed_kn, 2),
            nl(n_ed_druk_kn, 2)
        ));
    }
    let n = n_relatief(n_ed_druk_kn * 1.0e3, inv.a_c_mm2, inv.f_cd_mpa)?;
    let w = omega(inv.a_s_mm2, inv.f_yd_mpa, inv.a_c_mm2, inv.f_cd_mpa)?;

    // ── φ_ef ──────────────────────────────────────────────────────────────
    let phi_ef = match (inv.phi_inf_t0, inv.m0_eqp_knm, inv.m0_ed_knm) {
        (Some(p), Some(eqp), Some(ed)) => Some(phi_ef_5_19(p, eqp, ed)?),
        // Zonder φ(∞,t₀), M₀Eqp of M₀Ed is (5.19) niet in te vullen. Wat dat
        // voor A betekent, staat bij A hieronder.
        _ => None,
    };

    // ── §5.8.4(4): mag φ_ef = 0? ──────────────────────────────────────────
    let kruip = match (inv.phi_inf_t0, inv.m0_ed_knm, inv.h_mm) {
        (Some(p), Some(m0), Some(h)) => {
            Some(kruip_verwaarloosbaar_5_8_4_4(p, lambda, m0, n_ed_druk_kn, h, Some(w))?)
        }
        _ => {
            kanttekeningen.push(
                "§5.8.4(4) — of φ_ef = 0 mag worden aangehouden — is NIET nagegaan: daarvoor zijn \
                 φ(∞,t₀), M₀Ed én de doorsnedehoogte h in de beschouwde richting nodig. Zolang \
                 dat niet is nagegaan, is rekenen met φ_ef = 0 een aanname en geen normuitspraak."
                    .to_string(),
            );
            None
        }
    };

    // ── A, B, C en λ_lim ──────────────────────────────────────────────────
    // §5.8.3.1(1): A = 1/(1 + 0,2·φ_ef), "als φ_ef onbekend is mag A = 0,7 zijn
    // gebruikt". De terugval op 0,7 wordt alleen genomen waar hij aan de
    // veilige kant ligt; zie `factor_a_met_grondslag` en de kanttekening.
    let (a, a_grondslag) = factor_a_met_grondslag(phi_ef, inv.phi_inf_t0);
    let a_standaard = matches!(a_grondslag, AGrondslag::Standaardwaarde { .. });
    if let Some(t) = a_toelichting(a_grondslag, inv.m0_eqp_knm, inv.m0_ed_knm) {
        kanttekeningen.push(t);
    }
    let (b, b_standaard) = factor_b(Some(w));
    let c_grondslag = grondslag_c(
        inv.schoring,
        inv.eerste_orde_vooral_imperfecties_of_dwarsbelasting,
        inv.eindmomenten_knm,
    )?;
    let c = c_grondslag.c();
    let lambda_lim = lambda_lim_5_13n(inv.bijlage, a, b, c, n)?;

    kanttekeningen.push(
        "λ_lim komt uit de Nederlandse bijlage bij §5.8.3.1(1): daar is de OPMERKING met (5.13N) \
         doorgehaald en woordelijk als EIS teruggezet — \"De waarde van λ_lim moet gelijk aan \
         20·A·B·C/√n zijn genomen\". De getallen zijn dezelfde als de EN-aanbeveling; de status \
         is een andere."
            .to_string(),
    );
    kanttekeningen.push(
        "λ < λ_lim betekent alleen dat de tweede-orde-effecten mogen worden verwaarloosd \
         (§5.8.3.1(1)). Het is geen sterktetoets: de doorsnede moet nog steeds op M en N worden \
         getoetst."
            .to_string(),
    );

    Ok(Kolomslankheid {
        schoring: inv.schoring,
        l_mm: inv.l_mm,
        l0_mm,
        kniklengte: inv.kniklengte.clone(),
        k_gebruikt,
        k_opgehoogd,
        i_mm: inv.i_mm,
        lambda,
        n,
        n_ed_druk_kn,
        omega: w,
        phi_ef,
        kruip,
        a,
        a_standaard,
        a_grondslag,
        b,
        b_standaard,
        c_grondslag,
        c,
        lambda_lim,
        tweede_orde_verwaarloosbaar: lambda < lambda_lim,
        kanttekeningen,
    })
}

/// De afleiding van [`kolomslankheid`] als uitgeschreven deelstappen.
///
/// Rekent NIETS opnieuw uit — hetzelfde contract als [`crate::deelstappen`]:
/// deze functie schrijft op wat [`kolomslankheid`] al bepaald heeft.
/// Dezelfde afleiding als [`kolom_deelstappen`], maar voor een BENOEMDE as —
/// in de app de tweede as z, loodrecht op het rekenvlak.
///
/// WAAROM. De slankheidspoort om z (5.8.3.1(2): het criterium mag per richting
/// worden gecontroleerd) liep door dezelfde keten als die om y, en de stappen
/// heetten daardoor l₀, λ en λ_lim — dezelfde symbolen als in het vlak. Wie het
/// rapport leest, kon de twee assen alleen aan de kop van de toets uit elkaar
/// houden, en een losse stap "λ = 69,3" zei niet om welke as het ging. Hier
/// krijgt elke grootheid die per as verschilt de asnaam in haar symbool:
/// l₀,z, i_z, λ_z en λ_lim,z. De ids blijven gelijk; dat zijn sleutels, geen
/// rapporttekst.
///
/// De keten zelf wordt niet opnieuw opgebouwd: de stappen van
/// [`kolom_deelstappen`] krijgen alleen andere symbolen, zodat de twee assen
/// nooit een verschillende afleiding kunnen krijgen.
pub fn kolom_deelstappen_om_as(k: &Kolomslankheid, as_naam: &str) -> Vec<Deelstap> {
    // `\lambda` gevolgd door iets anders dan een onderstreping of een letter:
    // de slankheid zelf. `\lambda_{lim}` en `\lambda_1` blijven zo ongemoeid.
    fn met_as_lambda(tekst: &str, as_naam: &str) -> String {
        let mut uit = String::with_capacity(tekst.len() + 8);
        let mut rest = tekst;
        while let Some(pos) = rest.find(r"\lambda") {
            let (voor, na) = rest.split_at(pos + r"\lambda".len());
            uit.push_str(voor);
            let volgende = na.chars().next();
            if !matches!(volgende, Some(c) if c == '_' || c.is_alphabetic()) {
                uit.push_str(&format!("_{{{as_naam}}}"));
            }
            rest = na;
        }
        uit.push_str(rest);
        uit
    }
    let latex = |t: &str| -> String {
        let t = t
            .replace(r"\lambda_{lim}", &format!(r"\lambda_{{lim,{as_naam}}}"))
            .replace("l_0", &format!("l_{{0,{as_naam}}}"))
            .replace("{i}", &format!("{{i_{as_naam}}}"));
        met_as_lambda(&t, as_naam)
    };
    let mut stappen = kolom_deelstappen(k);
    for s in &mut stappen {
        s.titel = format!("{} — om de {as_naam}-as", s.titel);
        s.symbol = latex(&s.symbol);
        s.formula_latex = latex(&s.formula_latex);
        s.ingevuld_latex = latex(&s.ingevuld_latex);
        for v in &mut s.variables {
            v.symbol = match v.symbol.as_str() {
                "l₀" => format!("l₀,{as_naam}"),
                "λ" => format!("λ_{as_naam}"),
                "λ_lim" => format!("λ_lim,{as_naam}"),
                "i" => format!("i_{as_naam}"),
                _ => latex(&v.symbol),
            };
        }
    }
    stappen
}

pub fn kolom_deelstappen(k: &Kolomslankheid) -> Vec<Deelstap> {
    let mut stappen = Vec::new();

    // Stap 1 — het ontwerpbesluit.
    stappen.push(stap(
        "schoring",
        "Geschoord of ongeschoord",
        "",
        "art. 5.8.1",
        String::new(),
        String::new(),
        Vec::new(),
        None,
        "",
        vec![
            k.schoring.omschrijving().to_string(),
            "§5.8.1 definieert geschoord en schorend allebei met de woorden \"is aangenomen\": \
             het is een ontwerpbesluit en geen eigenschap die uit het model volgt. De app vraagt \
             het daarom en leidt het niet af."
                .to_string(),
        ],
    ));

    // Stap 2 — l₀.
    let (formule, ingevuld, artikel, notes) = match &k.kniklengte {
        Kniklengtebepaling::Standaardgeval(geval) => (
            r"l_0 = \text{factor} \cdot l".to_string(),
            format!(
                r"l_0 = {} \cdot {}\ \mathrm{{mm}} = {}\ \mathrm{{mm}}",
                lx(geval.l0_factor().unwrap_or(f64::NAN), 2),
                lx(k.l_mm, 0),
                lx(k.l0_mm, 0)
            ),
            "art. 5.8.3.2(2), figuur 5.7".to_string(),
            vec![format!("{} — bijschrift: {}", geval.omschrijving(), geval.bijschrift())],
        ),
        Kniklengtebepaling::Raamwerk { .. } => {
            let (k1, k2) = k.k_gebruikt.unwrap_or((f64::NAN, f64::NAN));
            match k.schoring {
                Schoring::Geschoord => (
                    r"l_0 = 0{,}5\,l\sqrt{\left(1+\frac{k_1}{0{,}45+k_1}\right)\cdot\left(1+\frac{k_2}{0{,}45+k_2}\right)}"
                        .to_string(),
                    format!(
                        r"l_0 = 0{{,}}5 \cdot {} \cdot \sqrt{{\left(1+\frac{{{}}}{{0{{,}}45+{}}}\right)\left(1+\frac{{{}}}{{0{{,}}45+{}}}\right)}} = {}\ \mathrm{{mm}}",
                        lx(k.l_mm, 0),
                        lx(k1, 3),
                        lx(k1, 3),
                        lx(k2, 3),
                        lx(k2, 3),
                        lx(k.l0_mm, 0)
                    ),
                    "art. 5.8.3.2(3) (5.15)".to_string(),
                    vec![
                        "(5.15) geldt voor GESCHOORDE elementen in regelmatige raamwerken \
                         (figuur 5.7 f)). De uitkomst ligt tussen 0,5·l en l."
                            .to_string(),
                    ],
                ),
                Schoring::Ongeschoord => (
                    r"l_0 = l\cdot\max\left\{\sqrt{1+10\frac{k_1k_2}{k_1+k_2}}\ ;\ \left(1+\frac{k_1}{1+k_1}\right)\left(1+\frac{k_2}{1+k_2}\right)\right\}"
                        .to_string(),
                    format!(
                        r"l_0 = {} \cdot \max\left\{{\sqrt{{1+10\frac{{{} \cdot {}}}{{{}+{}}}}}\ ;\ \left(1+\frac{{{}}}{{1+{}}}\right)\left(1+\frac{{{}}}{{1+{}}}\right)\right\}} = {}\ \mathrm{{mm}}",
                        lx(k.l_mm, 0),
                        lx(k1, 3),
                        lx(k2, 3),
                        lx(k1, 3),
                        lx(k2, 3),
                        lx(k1, 3),
                        lx(k1, 3),
                        lx(k2, 3),
                        lx(k2, 3),
                        lx(k.l0_mm, 0)
                    ),
                    "art. 5.8.3.2(3) (5.16)".to_string(),
                    vec![
                        "(5.16) geldt voor ONGESCHOORDE elementen in regelmatige raamwerken \
                         (figuur 5.7 g)). De norm schrijft het MAXIMUM van de twee takken voor; \
                         het is geen keuze."
                            .to_string(),
                    ],
                ),
            }
        }
        Kniklengtebepaling::UitKnikbelasting { ei_nmm2, n_b_n } => (
            r"l_0 = \pi\sqrt{EI/N_B}".to_string(),
            format!(
                r"l_0 = \pi\sqrt{{{}/{}}} = {}\ \mathrm{{mm}}",
                lx(*ei_nmm2, 0),
                lx(*n_b_n, 0),
                lx(k.l0_mm, 0)
            ),
            "art. 5.8.3.2(6) (5.17)".to_string(),
            vec![
                "(5.17) is bedoeld voor elementen met een veranderlijke normaalkracht en/of \
                 doorsnede. i in (5.14) moet bij dezelfde representatieve EI horen."
                    .to_string(),
            ],
        ),
        Kniklengtebepaling::Opgegeven => (
            r"l_0".to_string(),
            format!(r"l_0 = {}\ \mathrm{{mm}}", lx(k.l0_mm, 0)),
            "art. 5.8.3.2".to_string(),
            vec!["l₀ is rechtstreeks opgegeven; de herkomst staat niet in deze afleiding."
                .to_string()],
        ),
    };
    stappen.push(stap(
        "l0",
        "Effectieve lengte (kniklengte)",
        "l_0",
        &artikel,
        formule,
        ingevuld,
        vec![nv("l", k.l_mm, "mm"), nv("l₀", k.l0_mm, "mm")],
        Some(k.l0_mm),
        "mm",
        notes,
    ));

    // Stap 3 — λ.
    stappen.push(stap(
        "lambda",
        "Slankheid",
        r"\lambda",
        "art. 5.8.3.2(1) (5.14)",
        r"\lambda = \frac{l_0}{i}".to_string(),
        format!(
            r"\lambda = \frac{{{}}}{{{}}} = {}",
            lx(k.l0_mm, 0),
            lx(k.i_mm, 1),
            lx(k.lambda, 1)
        ),
        vec![nv("l₀", k.l0_mm, "mm"), nv("i", k.i_mm, "mm"), nv("λ", k.lambda, "-")],
        Some(k.lambda),
        "-",
        vec![
            "i is de traagheidsstraal van de NIET-GESCHEURDE betondoorsnede (§5.8.3.2(1)): zonder \
             wapening en zonder scheurvorming. Dat is een andere stijfheid dan die van §5.8.3.2(5), \
             waar de scheurvorming in de verhinderende elementen juist wél moet worden meegenomen."
                .to_string(),
        ],
    ));

    // Stap 4 — n en ω.
    stappen.push(stap(
        "n_omega",
        "Relatieve normaalkracht en mechanische wapeningsverhouding",
        "n,\\ \\omega",
        "art. 5.8.3.1(1)",
        r"n = \frac{N_{Ed}}{A_c f_{cd}} \qquad \omega = \frac{A_s f_{yd}}{A_c f_{cd}}".to_string(),
        format!(
            r"n = {} \qquad \omega = {}",
            lx(k.n, 3),
            lx(k.omega, 3)
        ),
        vec![nv("n", k.n, "-"), nv("ω", k.omega, "-")],
        Some(k.n),
        "-",
        vec![format!(
            "N_Ed is hier de DRUKkracht en positief: {} kN. Aan de buitengrens van deze kern is N \
             positief bij trek; de omzetting gebeurt op één plek. A_s is de TOTALE langswapening \
             van de doorsnede.",
            nl(k.n_ed_druk_kn, 2)
        )],
    ));

    // Stap 5 — φ_ef.
    let mut notes_phi = Vec::new();
    let (formule_phi, ingevuld_phi, waarde_phi) = match k.phi_ef {
        Some(p) => (
            r"\varphi_{ef} = \varphi(\infty,t_0)\cdot\frac{M_{0Eqp}}{M_{0Ed}}".to_string(),
            format!(r"\varphi_{{ef}} = {}", lx(p, 3)),
            Some(p),
        ),
        None => {
            notes_phi.push(
                "φ_ef is niet uit (5.19) bepaald. Hoe A dan is genomen — de standaardwaarde 0,7 \
                 van §5.8.3.1(1) of φ(∞,t₀) als bovengrens — en onder welke voorwaarde, staat bij \
                 de factoren A, B en C."
                    .to_string(),
            );
            (
                r"\varphi_{ef} = \varphi(\infty,t_0)\cdot\frac{M_{0Eqp}}{M_{0Ed}}".to_string(),
                String::new(),
                None,
            )
        }
    };
    if let Some(kr) = &k.kruip {
        notes_phi.push(format!(
            "§5.8.4(4) — φ_ef = 0 mag {}: φ(∞,t₀) ≤ 2 {}, λ ≤ 75 {}, M₀Ed/N_Ed ≥ h {} \
             (e₀ = {} mm).",
            if kr.toegestaan { "worden aangehouden" } else { "NIET worden aangehouden" },
            if kr.kruipcoefficient_ten_hoogste_2 { "✓" } else { "✗" },
            if kr.slankheid_ten_hoogste_75 { "✓" } else { "✗" },
            if kr.excentriciteit_ten_minste_h { "✓" } else { "✗" },
            nl(kr.e0_mm, 0)
        ));
        if let Some(w) = &kr.waarschuwing {
            notes_phi.push(w.clone());
        }
    }
    notes_phi.push(
        "De nationale bijlage wijkt van §5.8.4 niet af: op de bladzijden met (5.19) en de drie \
         voorwaarden staat geen NB-tekst."
            .to_string(),
    );
    stappen.push(stap(
        "phi_ef",
        "Effectieve kruipcoëfficiënt",
        r"\varphi_{ef}",
        "art. 5.8.4(2) (5.19), met art. 5.8.4(4)",
        formule_phi,
        ingevuld_phi,
        Vec::new(),
        waarde_phi,
        "-",
        notes_phi,
    ));

    // Stap 6 — A, B, C.
    let mut notes_abc = vec![k.c_grondslag.toelichting()];
    // De terugval voor A en de voorwaarde waaronder de norm hem toestaat
    // (§5.8.3.1(1)). De reden waarom (5.19) niet is ingevuld staat al in de
    // kanttekeningen van de hele gang.
    match k.a_grondslag {
        AGrondslag::UitPhiEf => {}
        AGrondslag::BovengrensKruip { phi_inf_t0 } => notes_abc.push(format!(
            "A = 1/(1 + 0,2·φ(∞,t₀)) = {}: φ_ef is niet uit (5.19) bepaald en φ(∞,t₀) = {} is \
             groter dan 2,14, dus de standaardwaarde 0,7 van §5.8.3.1(1) ligt niet aan de veilige \
             kant. φ(∞,t₀) is als bovengrens van φ_ef genomen (|M₀Eqp| ≤ |M₀Ed|).",
            nl(k.a, 3),
            nl(phi_inf_t0, 2)
        )),
        AGrondslag::Standaardwaarde { phi_inf_t0: Some(phi) } => notes_abc.push(format!(
            "A = 0,7 is de standaardwaarde die §5.8.3.1(1) toestaat als φ_ef onbekend is. Zij ligt \
             hier aan de veilige kant: φ(∞,t₀) = {} ≤ 2,14 en φ_ef is niet groter dan φ(∞,t₀) \
             zolang |M₀Eqp| ≤ |M₀Ed|.",
            nl(phi, 2)
        )),
        AGrondslag::Standaardwaarde { phi_inf_t0: None } => notes_abc.push(
            "A = 0,7 is de standaardwaarde die §5.8.3.1(1) toestaat als φ_ef onbekend is. \
             WAARSCHUWING: φ(∞,t₀) is niet opgegeven, dus niet na te gaan of 0,7 aan de veilige \
             kant ligt — dat is alleen zo bij φ_ef ≤ 2,14."
                .to_string(),
        ),
    }
    if k.b_standaard {
        notes_abc.push(
            "B = 1,1 is de standaardwaarde die §5.8.3.1(1) toestaat als ω onbekend is.".to_string(),
        );
    }
    stappen.push(stap(
        "abc",
        "De factoren A, B en C",
        "A,\\ B,\\ C",
        "art. 5.8.3.1(1), zoals door de nationale bijlage als eis gesteld",
        r"A = \frac{1}{1+0{,}2\varphi_{ef}} \qquad B = \sqrt{1+2\omega} \qquad C = 1{,}7 - r_m"
            .to_string(),
        format!(
            r"A = {} \qquad B = {} \qquad C = {}",
            lx(k.a, 3),
            lx(k.b, 3),
            lx(k.c, 3)
        ),
        vec![nv("A", k.a, "-"), nv("B", k.b, "-"), nv("C", k.c, "-")],
        None,
        "-",
        notes_abc,
    ));

    // Stap 7 — λ_lim en de uitspraak.
    stappen.push(stap(
        "lambda_lim",
        "Slankheidsgrens",
        r"\lambda_{lim}",
        "NB bij art. 5.8.3.1(1) — de EN-aanbeveling (5.13N) is als eis overgenomen",
        r"\lambda_{lim} = \frac{20\,A\,B\,C}{\sqrt{n}}".to_string(),
        format!(
            r"\lambda_{{lim}} = \frac{{20 \cdot {} \cdot {} \cdot {}}}{{\sqrt{{{}}}}} = {}",
            lx(k.a, 3),
            lx(k.b, 3),
            lx(k.c, 3),
            lx(k.n, 3),
            lx(k.lambda_lim, 1)
        ),
        vec![nv("λ", k.lambda, "-"), nv("λ_lim", k.lambda_lim, "-")],
        Some(k.lambda_lim),
        "-",
        vec![
            format!(
                "λ = {} en λ_lim = {}: de tweede-orde-effecten mogen {}worden verwaarloosd \
                 (§5.8.3.1(1)).",
                nl(k.lambda, 1),
                nl(k.lambda_lim, 1),
                if k.tweede_orde_verwaarloosbaar { "" } else { "NIET " }
            ),
            "Bij λ ≥ λ_lim is de kolom niet afgekeurd; er moet dan tweede orde worden gerekend. In \
             deze app is dat de algemene methode van §5.8.6."
                .to_string(),
        ],
    ));

    stappen
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.2 — geometrische imperfecties van een afzonderlijk element, als
// excentriciteit e_i
// ═══════════════════════════════════════════════════════════════════════════
//
// Nagekeken op de gerenderde bladzijden 68 en 69 van de PDF-uitgave.
//
// * §5.2(5), (5.1): θ_i = θ₀·α_h·α_m, met α_h = 2/√l en 2/3 ≤ α_h ≤ 1, en
//   α_m = √(0,5·(1 + 1/m)). De twee formules staan als afbeelding in de PDF
//   en zijn van de gerenderde bladzijde gelezen.
// * De OPMERKING bij (5.1) — "de aanbevolen waarde is 1/200" — is oranje
//   DOORGEHAALD, en eronder staat in oranje: "De waarde van θ₀ moet gelijk aan
//   1/300 zijn genomen." De nationale bijlage wijkt hier dus af, en het is
//   een eis.
// * §5.2(6): voor het effect op een afzonderlijk element is l de feitelijke
//   lengte van het element en m = 1. Geen oranje.
// * §5.2(7)a, (5.2): e_i = θ_i·l₀/2 met l₀ de effectieve lengte van
//   §5.8.3.2. De vereenvoudiging "e_i = l₀/400, overeenkomend met α_h = 1"
//   staat er in zwart bij; zij is EN-tekst en hoort bij θ₀ = 1/200. Met de
//   Nederlandse θ₀ = 1/300 zou α_h = 1 op l₀/600 uitkomen. Deze module
//   gebruikt de vereenvoudiging NIET maar (5.1) en (5.2) voluit, zodat de
//   NB-waarde van θ₀ er ook werkelijk in zit.

/// θ₀ — de basiswaarde van de scheefstand, nationale bijlage bij §5.2(5).
///
/// "De waarde van θ₀ moet gelijk aan 1/300 zijn genomen." De EN-aanbeveling
/// 1/200 is op de gerenderde bladzijde 68 oranje doorgehaald.
pub const THETA_0_NB: f64 = 1.0 / 300.0;

/// Welke grens van α_h heeft ingegrepen — §5.2(5): 2/3 ≤ α_h ≤ 1.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlphaHGrens {
    /// 2/√l zou boven 1 uitkomen (l < 4 m); α_h = 1.
    Boven,
    /// 2/√l zou onder 2/3 uitkomen (l > 9 m); α_h = 2/3.
    Onder,
}

/// De scheefstand θ_i van (5.1), met de twee reductiefactoren erbij.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Scheefstand {
    /// De lengte l in m — voor een afzonderlijk element zijn feitelijke lengte
    /// (§5.2(6)).
    pub l_m: f64,
    /// Het aantal verticale elementen m dat aan het effect bijdraagt; 1 voor
    /// een afzonderlijk element.
    pub m: u32,
    pub alpha_h: f64,
    pub alpha_h_grens: Option<AlphaHGrens>,
    pub alpha_m: f64,
    /// θ₀ zoals gebruikt: [`THETA_0_NB`].
    pub theta_0: f64,
    /// θ_i = θ₀·α_h·α_m, rad.
    pub theta_i: f64,
}

/// (5.1): θ_i = θ₀·α_h·α_m, met θ₀ = 1/300 uit de nationale bijlage.
pub fn scheefstand_5_1(l_m: f64, m: u32) -> Result<Scheefstand, String> {
    if !(l_m > 0.0) {
        return Err(format!("de lengte l voor α_h moet groter dan nul zijn, kreeg {l_m} m"));
    }
    if m == 0 {
        return Err("het aantal elementen m voor α_m moet ten minste 1 zijn".to_string());
    }
    let ruw = 2.0 / l_m.sqrt();
    let (alpha_h, alpha_h_grens) = if ruw > 1.0 {
        (1.0, Some(AlphaHGrens::Boven))
    } else if ruw < 2.0 / 3.0 {
        (2.0 / 3.0, Some(AlphaHGrens::Onder))
    } else {
        (ruw, None)
    };
    let alpha_m = (0.5 * (1.0 + 1.0 / m as f64)).sqrt();
    Ok(Scheefstand {
        l_m,
        m,
        alpha_h,
        alpha_h_grens,
        alpha_m,
        theta_0: THETA_0_NB,
        theta_i: THETA_0_NB * alpha_h * alpha_m,
    })
}

/// (5.2): e_i = θ_i·l₀/2 — de imperfectie van een afzonderlijk element als
/// excentriciteit, §5.2(7)a. l₀ is de effectieve lengte van §5.8.3.2, in mm.
pub fn e_i_5_2_mm(theta_i: f64, l0_mm: f64) -> Result<f64, String> {
    if !(theta_i >= 0.0) {
        return Err(format!("θ_i kan niet negatief zijn, kreeg {theta_i}"));
    }
    if !(l0_mm > 0.0) {
        return Err(format!("l₀ moet groter dan nul zijn voor e_i = θ_i·l₀/2, kreeg {l0_mm} mm"));
    }
    Ok(theta_i * l0_mm / 2.0)
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.9 — dubbele buiging
// ═══════════════════════════════════════════════════════════════════════════
//
// Nagekeken op de gerenderde bladzijden 95 en 96. Geen oranje: de nationale
// bijlage wijkt in §5.8.9 nergens af. De formules (5.38b) en (5.39) staan als
// afbeelding in de PDF en zijn van de gerenderde bladzijde gelezen.
//
// * §5.8.9(1): de algemene methode van §5.8.6 mag ook voor dubbele buiging.
//   Bij vereenvoudigde methoden gelden de voorwaarden hieronder.
// * §5.8.9(2): eerst mag in iedere hoofdrichting afzonderlijk worden
//   gerekend, zonder dubbele buiging. Met imperfecties hoeft alleen rekening
//   te zijn gehouden in de richting waarin ze het meest ongunstig werken.
// * §5.8.9(3): geen verdere controle als (5.38a) λ_y/λ_z ≤ 2 én λ_z/λ_y ≤ 2,
//   en als de betrekkelijke excentriciteiten aan (5.38b) voldoen:
//   (e_y/h_eq)/(e_z/b_eq) ≤ 0,2 óf (e_z/b_eq)/(e_y/h_eq) ≤ 0,2, met
//   b_eq = i_y·√12 en h_eq = i_z·√12, e_y = M_Edz/N_Ed en e_z = M_Edy/N_Ed,
//   de momenten INCLUSIEF het tweede-orde-moment.
// * §5.8.9(4): anders de interactie (5.39):
//   (M_Edz/M_Rdz)^a + (M_Edy/M_Rdy)^a ≤ 1,0, met a = 2 voor een cirkel of
//   ellips en voor een rechthoek a = 1,0 / 1,5 / 2,0 bij N_Ed/N_Rd = 0,1 /
//   0,7 / 1,0 "met lineaire interpolatie voor tussenliggende waarden";
//   N_Rd = A_c·f_cd + A_s·f_yd.
//
// ASSEN. Figuur 5.8 van de norm tekent h LANGS de y-as en b langs de z-as;
// deze crate noemt de breedte (langs y) b en de hoogte (langs z) h. De
// formules staan in i_y en i_z en trekken zich daar niets van aan:
// b_eq = i_y·√12 is de maat in de richting van e_z (voor een rechthoek van
// deze crate: h), h_eq = i_z·√12 die in de richting van e_y (hier: b). De
// afleiding drukt beide af, zodat de lezer het kan narekenen.

/// De drie ankerpunten (N_Ed/N_Rd, a) van de tabel in §5.8.9(4) voor een
/// RECHTHOEKIGE doorsnede.
pub const EXPONENT_A_TABEL_5_39: [(f64, f64); 3] = [(0.1, 1.0), (0.7, 1.5), (1.0, 2.0)];

/// a = 2 voor cirkelvormige en elliptische doorsneden, §5.8.9(4).
pub const EXPONENT_A_ROND_5_39: f64 = 2.0;

/// Hoe de exponent a van (5.39) tot stand kwam.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExponentAGrondslag {
    /// N_Ed/N_Rd ≤ 0,1. De tabel BEGINT bij 0,1 met a = 1,0; daaronder geeft
    /// de norm niets. Hier is a = 1,0 aangehouden: dat is de lineaire
    /// interactie, de strengste van de drie, dus de veilige kant.
    OnderTabel,
    /// Tussen twee ankerpunten (of er precies op): lineair geïnterpoleerd,
    /// zoals de tabel voorschrijft.
    Geinterpoleerd,
    /// N_Ed/N_Rd ≥ 1,0: a = 2,0. N_Ed ≥ N_Rd is op zichzelf al een
    /// overschrijding; de exponent is dan het minste probleem.
    BovenTabel,
}

/// N_Rd = A_c·f_cd + A_s·f_yd — de rekenwaarde van de opneembare
/// normaalkracht in §5.8.9(4), in N. A_c is de BRUTO betondoorsnede.
pub fn n_rd_5_39_n(a_c_mm2: f64, f_cd_mpa: f64, a_s_mm2: f64, f_yd_mpa: f64) -> Result<f64, String> {
    if !(a_c_mm2 > 0.0 && f_cd_mpa > 0.0) {
        return Err(format!(
            "N_Rd vraagt A_c > 0 en f_cd > 0, kreeg A_c = {a_c_mm2} mm² en f_cd = {f_cd_mpa} N/mm²"
        ));
    }
    if !(a_s_mm2 >= 0.0 && f_yd_mpa >= 0.0) {
        return Err(format!(
            "N_Rd vraagt A_s ≥ 0 en f_yd ≥ 0, kreeg A_s = {a_s_mm2} mm² en f_yd = {f_yd_mpa} N/mm²"
        ));
    }
    Ok(a_c_mm2 * f_cd_mpa + a_s_mm2 * f_yd_mpa)
}

/// De exponent a van (5.39) voor een RECHTHOEKIGE doorsnede, uit de tabel in
/// §5.8.9(4) met lineaire interpolatie tussen de ankerpunten.
///
/// N_Ed als DRUK, positief, in N; N_Rd uit [`n_rd_5_39_n`].
pub fn exponent_a_5_39(n_ed_druk_n: f64, n_rd_n: f64) -> Result<(f64, ExponentAGrondslag), String> {
    if !(n_rd_n > 0.0) {
        return Err(format!("N_Rd moet groter dan nul zijn, kreeg {n_rd_n} N"));
    }
    if !(n_ed_druk_n >= 0.0) {
        return Err(format!(
            "de exponent a vraagt N_Ed als drukkracht (positief), kreeg {n_ed_druk_n} N"
        ));
    }
    let v = n_ed_druk_n / n_rd_n;
    let [(v0, a0), (v1, a1), (v2, a2)] = EXPONENT_A_TABEL_5_39;
    if v <= v0 {
        return Ok((a0, ExponentAGrondslag::OnderTabel));
    }
    if v >= v2 {
        return Ok((a2, ExponentAGrondslag::BovenTabel));
    }
    let a = if v <= v1 {
        a0 + (v - v0) / (v1 - v0) * (a1 - a0)
    } else {
        a1 + (v - v1) / (v2 - v1) * (a2 - a1)
    };
    Ok((a, ExponentAGrondslag::Geinterpoleerd))
}

/// (5.38a): λ_y/λ_z ≤ 2 én λ_z/λ_y ≤ 2.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Voorwaarde538a {
    pub lambda_y: f64,
    pub lambda_z: f64,
    /// λ_y/λ_z.
    pub y_door_z: f64,
    /// λ_z/λ_y.
    pub z_door_y: f64,
    pub voldaan: bool,
}

/// De slankheidsvoorwaarde (5.38a) van §5.8.9(3).
pub fn voorwaarde_5_38a(lambda_y: f64, lambda_z: f64) -> Result<Voorwaarde538a, String> {
    if !(lambda_y > 0.0 && lambda_z > 0.0) {
        return Err(format!(
            "(5.38a) vraagt twee slankheden groter dan nul, kreeg λ_y = {lambda_y} en λ_z = {lambda_z}"
        ));
    }
    let y_door_z = lambda_y / lambda_z;
    let z_door_y = lambda_z / lambda_y;
    Ok(Voorwaarde538a {
        lambda_y,
        lambda_z,
        y_door_z,
        z_door_y,
        voldaan: y_door_z <= 2.0 && z_door_y <= 2.0,
    })
}

/// (5.38b): (e_y/h_eq)/(e_z/b_eq) ≤ 0,2 óf (e_z/b_eq)/(e_y/h_eq) ≤ 0,2.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Voorwaarde538b {
    /// e_y = M_Edz/N_Ed, mm — de excentriciteit in de richting van de y-as
    /// (over de breedte van deze crate).
    pub e_y_mm: f64,
    /// e_z = M_Edy/N_Ed, mm — in de richting van de z-as (over de hoogte).
    pub e_z_mm: f64,
    pub i_y_mm: f64,
    pub i_z_mm: f64,
    /// b_eq = i_y·√12 — de gelijkwaardige maat in de richting van e_z.
    pub b_eq_mm: f64,
    /// h_eq = i_z·√12 — de gelijkwaardige maat in de richting van e_y.
    pub h_eq_mm: f64,
    /// e_y/h_eq.
    pub e_y_rel: f64,
    /// e_z/b_eq.
    pub e_z_rel: f64,
    /// (e_y/h_eq)/(e_z/b_eq); ∞ als e_z = 0.
    pub y_door_z: f64,
    /// (e_z/b_eq)/(e_y/h_eq); ∞ als e_y = 0.
    pub z_door_y: f64,
    pub voldaan: bool,
}

/// De excentriciteitsvoorwaarde (5.38b) van §5.8.9(3).
///
/// De excentriciteiten worden als grootte genomen (het teken doet er voor de
/// verhouding niet toe). Is één van beide nul, dan is de buiging in
/// werkelijkheid enkelvoudig en is de voorwaarde vervuld: de verhouding is
/// dan 0 en niet "deling door nul". De vergelijking wordt daarom zonder
/// deling gedaan: e_y,rel ≤ 0,2·e_z,rel óf e_z,rel ≤ 0,2·e_y,rel.
pub fn voorwaarde_5_38b(
    e_y_mm: f64,
    e_z_mm: f64,
    i_y_mm: f64,
    i_z_mm: f64,
) -> Result<Voorwaarde538b, String> {
    if !(i_y_mm > 0.0 && i_z_mm > 0.0) {
        return Err(format!(
            "(5.38b) vraagt twee traagheidsstralen groter dan nul, kreeg i_y = {i_y_mm} en i_z = {i_z_mm} mm"
        ));
    }
    if !(e_y_mm.is_finite() && e_z_mm.is_finite()) {
        return Err("(5.38b) vraagt eindige excentriciteiten".to_string());
    }
    let e_y = e_y_mm.abs();
    let e_z = e_z_mm.abs();
    let sqrt12 = 12.0_f64.sqrt();
    let b_eq_mm = i_y_mm * sqrt12;
    let h_eq_mm = i_z_mm * sqrt12;
    let e_y_rel = e_y / h_eq_mm;
    let e_z_rel = e_z / b_eq_mm;
    let deel = |t: f64, n: f64| if n > 0.0 { t / n } else if t > 0.0 { f64::INFINITY } else { 0.0 };
    Ok(Voorwaarde538b {
        e_y_mm: e_y,
        e_z_mm: e_z,
        i_y_mm,
        i_z_mm,
        b_eq_mm,
        h_eq_mm,
        e_y_rel,
        e_z_rel,
        y_door_z: deel(e_y_rel, e_z_rel),
        z_door_y: deel(e_z_rel, e_y_rel),
        voldaan: e_y_rel <= 0.2 * e_z_rel || e_z_rel <= 0.2 * e_y_rel,
    })
}

/// (5.39): (M_Edz/M_Rdz)^a + (M_Edy/M_Rdy)^a — de som, te toetsen aan 1,0.
///
/// De momenten worden als grootte genomen; de momentweerstanden moeten groter
/// dan nul zijn en de exponent ten minste 1.
pub fn interactie_5_39(
    m_edz_knm: f64,
    m_rdz_knm: f64,
    m_edy_knm: f64,
    m_rdy_knm: f64,
    a: f64,
) -> Result<f64, String> {
    if !(m_rdz_knm > 0.0 && m_rdy_knm > 0.0) {
        return Err(format!(
            "(5.39) vraagt twee momentweerstanden groter dan nul, kreeg M_Rdz = {m_rdz_knm} en M_Rdy = {m_rdy_knm} kNm"
        ));
    }
    if !(a >= 1.0) {
        return Err(format!("de exponent a van (5.39) is ten minste 1,0, kreeg {a}"));
    }
    Ok((m_edz_knm.abs() / m_rdz_knm).powf(a) + (m_edy_knm.abs() / m_rdy_knm).powf(a))
}

// ── De afleiding van het moment om de tweede as ───────────────────────────

/// Hoe het tweede-orde-deel e₂ van het moment om de tweede as is bepaald.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TweedeOrdeDeel {
    /// λ < λ_lim in deze richting: §5.8.3.1(1) staat toe de tweede-orde-
    /// effecten te verwaarlozen, en §5.8.9(4) verwijst daar uitdrukkelijk
    /// naar ("tenzij ze mogen zijn verwaarloosd volgens 5.8.2(6) of 5.8.3").
    Verwaarloosd { lambda: f64, lambda_lim: f64 },
    /// Gerekend met de algemene methode (§5.8.6) op de maatgevende doorsnede
    /// (§5.8.6(6)): e₂ = (1/r)·l₀²/c, met 1/r de kromming uit het M-N-κ-
    /// diagram met de (3.14)-kromme bij het TOTALE moment, en dat tot het
    /// evenwicht niet meer verandert.
    Gerekend {
        e_2_mm: f64,
        kappa_per_m: f64,
        c: f64,
        iteraties: u32,
        phi_ef: f64,
        lambda: f64,
        lambda_lim: f64,
    },
    /// Geen evenwicht: bij het opvoeren van e₂ liep het totale moment boven de
    /// momentweerstand van de doorsnede uit. De kolom knikt in deze richting.
    Instabiel {
        laatste_m_knm: f64,
        c: f64,
        iteraties: u32,
        phi_ef: f64,
        lambda: f64,
        lambda_lim: f64,
    },
}

/// De rekenwaarde van het moment om de TWEEDE as, opgebouwd uit zijn delen:
/// het eerste-orde-moment uit het model, de imperfectie van §5.2, het
/// tweede-orde-deel en de minimale excentriciteit van 6.1(4).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MomentTweedeAs {
    /// N_Ed als druk, positief, kN.
    pub n_ed_druk_kn: f64,
    /// |M₀Ed| om deze as uit het model plus een extern opgegeven deel, kNm —
    /// zonder imperfectie.
    pub m0_knm: f64,
    pub scheefstand: Scheefstand,
    /// l₀ om deze as, mm.
    pub l0_mm: f64,
    /// e_i = θ_i·l₀/2, mm.
    pub e_i_mm: f64,
    pub tweede_orde: TweedeOrdeDeel,
    /// e₀ = max(b/30; 20 mm) van 6.1(4), met b de doorsnedemaat in de richting
    /// van de excentriciteit, mm.
    pub e_0_mm: f64,
    /// Heeft N_Ed·e₀ het moment opgetild?
    pub e_0_bindend: bool,
    /// De rekenwaarde M_Ed = max(M₀Ed + N_Ed·(e_i + e₂) ; N_Ed·e₀), kNm. Bij
    /// [`TweedeOrdeDeel::Instabiel`] het laatste moment waarvoor nog evenwicht
    /// werd gezocht.
    pub m_ed_knm: f64,
    /// De momentweerstand om deze as bij N_Ed (§6.1), kNm; `None` als de
    /// doorsnede N_Ed al niet draagt.
    pub m_rd_knm: Option<f64>,
}

/// De afleiding van [`MomentTweedeAs`] als deelstappen. Rekent niets opnieuw
/// uit; schrijft op wat er al is bepaald.
pub fn moment_tweede_as_deelstappen(m: &MomentTweedeAs) -> Vec<Deelstap> {
    let mut stappen = Vec::new();
    let s = &m.scheefstand;

    // Stap 1 — θ_i.
    let mut notes_theta = vec![
        "θ₀ = 1/300 is de waarde van de nationale bijlage bij §5.2(5); de EN-aanbeveling 1/200 \
         is daar doorgehaald."
            .to_string(),
        format!(
            "Voor een afzonderlijk element is l de feitelijke lengte van het element en m = 1 \
             (§5.2(6)): α_m = √(0,5·(1 + 1/1)) = 1. α_h = 2/√l = 2/√{} = {}, binnen \
             2/3 ≤ α_h ≤ 1.",
            nl(s.l_m, 3),
            nl(2.0 / s.l_m.sqrt(), 4)
        ),
    ];
    match s.alpha_h_grens {
        Some(AlphaHGrens::Boven) => notes_theta.push(
            "2/√l ligt boven 1; α_h is op de bovengrens 1 gezet.".to_string(),
        ),
        Some(AlphaHGrens::Onder) => notes_theta.push(
            "2/√l ligt onder 2/3; α_h is op de ondergrens 2/3 gezet.".to_string(),
        ),
        None => {}
    }
    stappen.push(stap(
        "theta_i",
        "Scheefstand",
        r"\theta_i",
        "art. 5.2(5) (5.1), NB: θ₀ = 1/300",
        r"\theta_i = \theta_0 \cdot \alpha_h \cdot \alpha_m".to_string(),
        format!(
            r"\theta_i = \frac{{1}}{{300}} \cdot {} \cdot {} = {}",
            lx(s.alpha_h, 4),
            lx(s.alpha_m, 4),
            lx(s.theta_i, 6)
        ),
        vec![
            nv("l", s.l_m, "m"),
            nv("m", s.m as f64, "-"),
            nv("α_h", s.alpha_h, "-"),
            nv("α_m", s.alpha_m, "-"),
            nv("θ_i", s.theta_i, "rad"),
        ],
        Some(s.theta_i),
        "rad",
        notes_theta,
    ));

    // Stap 2 — e_i.
    stappen.push(stap(
        "e_i",
        "Imperfectie als excentriciteit",
        "e_i",
        "art. 5.2(7)a (5.2)",
        r"e_i = \theta_i \cdot l_0 / 2".to_string(),
        format!(
            r"e_i = {} \cdot {} / 2 = {}\ \mathrm{{mm}}",
            lx(s.theta_i, 6),
            lx(m.l0_mm, 0),
            lx(m.e_i_mm, 2)
        ),
        vec![nv("θ_i", s.theta_i, "rad"), nv("l_0", m.l0_mm, "mm"), nv("e_i", m.e_i_mm, "mm")],
        Some(m.e_i_mm),
        "mm",
        vec![
            "l₀ is de effectieve lengte om DEZE as (§5.8.3.2), niet die van het rekenvlak. De \
             vereenvoudiging e_i = l₀/400 van §5.2(7)a is niet gebruikt: zij hoort bij θ₀ = 1/200."
                .to_string(),
            "§5.8.9(2) staat toe met imperfecties alleen rekening te houden in de richting waarin \
             zij het meest ongunstig werken. Hier is de imperfectie om deze as ALTIJD meegenomen; \
             dat is de veilige kant, want welke richting het ongunstigst is blijkt pas uit de \
             uitkomst."
                .to_string(),
        ],
    ));

    // Stap 3 — e₂.
    match m.tweede_orde {
        TweedeOrdeDeel::Verwaarloosd { lambda, lambda_lim } => stappen.push(stap(
            "e_2",
            "Tweede-orde-uitbuiging",
            "e_2",
            "art. 5.8.3.1(1) en 5.8.9(4)",
            r"e_2 = 0".to_string(),
            String::new(),
            vec![nv("λ", lambda, "-"), nv("λ_lim", lambda_lim, "-")],
            Some(0.0),
            "mm",
            vec![format!(
                "λ = {} < λ_lim = {} om deze as: §5.8.3.1(1) staat toe de tweede-orde-effecten te \
                 verwaarlozen, en §5.8.9(4) neemt die ontsnapping uitdrukkelijk over (\"tenzij ze \
                 mogen zijn verwaarloosd volgens 5.8.2(6) of 5.8.3\"). e₂ = 0.",
                nl(lambda, 1),
                nl(lambda_lim, 1)
            )],
        )),
        TweedeOrdeDeel::Gerekend { e_2_mm, kappa_per_m, c, iteraties, phi_ef, lambda, lambda_lim } => {
            stappen.push(stap(
                "e_2",
                "Tweede-orde-uitbuiging (algemene methode)",
                "e_2",
                "art. 5.8.6(6) met de krommingsverdeling van 5.8.8.2(3)/(4)",
                r"e_2 = \frac{1}{r} \cdot \frac{l_0^2}{c}".to_string(),
                format!(
                    r"e_2 = {} \cdot 10^{{-3}} \cdot \frac{{{}^2}}{{{}}} = {}\ \mathrm{{mm}}",
                    lx(kappa_per_m, 5),
                    lx(m.l0_mm, 0),
                    lx(c, 0),
                    lx(e_2_mm, 2)
                ),
                vec![
                    nv("1/r", kappa_per_m, "1/m"),
                    nv("l_0", m.l0_mm, "mm"),
                    nv("c", c, "-"),
                    nv("φ_ef", phi_ef, "-"),
                    nv("λ", lambda, "-"),
                    nv("λ_lim", lambda_lim, "-"),
                    nv("e_2", e_2_mm, "mm"),
                ],
                Some(e_2_mm),
                "mm",
                vec![
                    format!(
                        "λ = {} ≥ λ_lim = {} om deze as: de tweede-orde-effecten mogen NIET worden \
                         verwaarloosd (§5.8.3.1(1)).",
                        nl(lambda, 1),
                        nl(lambda_lim, 1)
                    ),
                    format!(
                        "De algemene methode van §5.8.6, in de vereenvoudigde vorm van §5.8.6(6): \
                         alleen de maatgevende doorsnede is beschouwd, met een aangenomen verloop \
                         van de kromming daartussen. 1/r is de kromming uit het M-N-κ-diagram van \
                         de doorsnede om deze as — met de (3.14)-kromme op rekenwaarden f_cd en \
                         E_cd = E_cm/γ_cE van §5.8.6(3), zonder betontrek (§5.8.6(5)), en met alle \
                         betonrekken vermenigvuldigd met (1 + φ_ef) = {} volgens §5.8.6(4) — bij \
                         het TOTALE moment M₀Ed + N_Ed·(e_i + e₂). Omdat e₂ zelf in dat moment \
                         zit, is dit een evenwichtsiteratie; zij is na {} stappen niet meer \
                         veranderd.",
                        nl(1.0 + phi_ef, 3),
                        iteraties
                    ),
                    format!(
                        "c = {} is de factor voor de krommingsverdeling. §5.8.8.2(4): voor een \
                         constante doorsnede is in het algemeen c = 10 (≈ π²); is het \
                         eerste-orde-moment constant, dan behoort een lagere waarde te zijn \
                         overwogen, met 8 als ondergrens (constant totaal moment). {}",
                        nl(c, 0),
                        if c < 9.0 {
                            "Het eerste-orde-moment om deze as is hier constant over de lengte \
                             (imperfectie en een vast opgegeven M₀Ed), dus c = 8: de veilige kant."
                        } else {
                            "Het eerste-orde-moment om deze as varieert over de lengte, dus c = 10."
                        }
                    ),
                ],
            ));
        }
        TweedeOrdeDeel::Instabiel { laatste_m_knm, c, iteraties, phi_ef, lambda, lambda_lim } => {
            stappen.push(stap(
                "e_2",
                "Tweede-orde-uitbuiging (algemene methode) — GEEN EVENWICHT",
                "e_2",
                "art. 5.8.6(6)",
                r"e_2 = \frac{1}{r} \cdot \frac{l_0^2}{c}".to_string(),
                String::new(),
                vec![
                    nv("l_0", m.l0_mm, "mm"),
                    nv("c", c, "-"),
                    nv("φ_ef", phi_ef, "-"),
                    nv("λ", lambda, "-"),
                    nv("λ_lim", lambda_lim, "-"),
                    nv("M_laatste", laatste_m_knm, "kNm"),
                ],
                None,
                "mm",
                vec![format!(
                    "λ = {} ≥ λ_lim = {}: tweede orde is nodig, maar bij het opvoeren van e₂ liep \
                     het totale moment na {} stappen boven de momentweerstand van de doorsnede \
                     uit (laatst beproefd: {} kNm). Er bestaat geen evenwichtstoestand: de kolom \
                     KNIKT om deze as. Met (1 + φ_ef) = {} en c = {}.",
                    nl(lambda, 1),
                    nl(lambda_lim, 1),
                    iteraties,
                    nl(laatste_m_knm, 1),
                    nl(1.0 + phi_ef, 3),
                    nl(c, 0)
                )],
            ));
        }
    }

    // Stap 4 — M_Ed.
    let e_2 = match m.tweede_orde {
        TweedeOrdeDeel::Gerekend { e_2_mm, .. } => e_2_mm,
        _ => 0.0,
    };
    let mut notes_m = vec![format!(
        "M₀Ed = {} kNm is het eerste-orde-moment om deze as uit het model (plus een eventueel \
         extern opgegeven deel), zonder imperfectie. N_Ed·(e_i + e₂) = {} · ({} + {}) mm = {} kNm.",
        nl(m.m0_knm, 2),
        nl(m.n_ed_druk_kn, 1),
        nl(m.e_i_mm, 2),
        nl(e_2, 2),
        nl(m.n_ed_druk_kn * (m.e_i_mm + e_2) * 1e-3, 2)
    )];
    notes_m.push(format!(
        "6.1(4): bij druk geldt een minimale excentriciteit e₀ = max(b/30; 20 mm) = {} mm in de \
         richting van de excentriciteit, dus M_Ed ≥ N_Ed·e₀ = {} kNm. {}",
        nl(m.e_0_mm, 1),
        nl(m.n_ed_druk_kn * m.e_0_mm * 1e-3, 2),
        if m.e_0_bindend {
            "Die ondergrens is hier BINDEND: het moment uit imperfectie en tweede orde ligt eronder."
        } else {
            "Die ondergrens is hier niet bindend."
        }
    ));
    if matches!(m.tweede_orde, TweedeOrdeDeel::Instabiel { .. }) {
        notes_m.push(
            "Er is geen evenwicht gevonden; het getal hieronder is het laatste moment waarvoor \
             nog een kromming is gezocht, en geen rekenwaarde."
                .to_string(),
        );
    }
    stappen.push(stap(
        "m_ed_tweede_as",
        "Rekenwaarde van het moment om de tweede as",
        r"M_{Ed}",
        "art. 5.8.8.2(1) (5.31) en 6.1(4)",
        r"M_{Ed} = \max\left\{M_{0Ed} + N_{Ed}\,(e_i + e_2)\ ;\ N_{Ed}\,e_0\right\}".to_string(),
        format!(
            r"M_{{Ed}} = \max\left\{{{} + {} \cdot ({} + {}) \cdot 10^{{-3}}\ ;\ {} \cdot {} \cdot 10^{{-3}}\right\}} = {}\ \mathrm{{kNm}}",
            lx(m.m0_knm, 2),
            lx(m.n_ed_druk_kn, 1),
            lx(m.e_i_mm, 2),
            lx(e_2, 2),
            lx(m.n_ed_druk_kn, 1),
            lx(m.e_0_mm, 1),
            lx(m.m_ed_knm, 2)
        ),
        vec![
            nv("N_Ed", m.n_ed_druk_kn, "kN"),
            nv("M_0Ed", m.m0_knm, "kNm"),
            nv("e_i", m.e_i_mm, "mm"),
            nv("e_2", e_2, "mm"),
            nv("e_0", m.e_0_mm, "mm"),
            nv("M_Ed", m.m_ed_knm, "kNm"),
        ],
        Some(m.m_ed_knm),
        "kNm",
        notes_m,
    ));

    // Stap 5 — M_Rd.
    match m.m_rd_knm {
        Some(m_rd) => stappen.push(stap(
            "m_rd_tweede_as",
            "Momentweerstand om de tweede as",
            r"M_{Rd}",
            "art. 6.1",
            r"M_{Rd} = \max M(\kappa)\ \text{bij}\ N_{Ed}".to_string(),
            format!(r"M_{{Rd}} = {}\ \mathrm{{kNm}}", lx(m_rd, 2)),
            vec![nv("M_Rd", m_rd, "kNm")],
            Some(m_rd),
            "kNm",
            vec![
                "Het grootste moment op het M-N-κ-diagram om deze as bij N_Ed, met het \
                 parabool-rechthoekdiagram van 3.1.7(1) en het bilineaire staaldiagram van 3.2.7 \
                 — dezelfde doorsnedeberekening als de momenttoets om de eerste as. De staven \
                 zijn daarvoor op hun plaats over de BREEDTE in lagen gelegd."
                    .to_string(),
            ],
        )),
        None => stappen.push(stap(
            "m_rd_tweede_as",
            "Momentweerstand om de tweede as",
            r"M_{Rd}",
            "art. 6.1",
            String::new(),
            String::new(),
            vec![],
            None,
            "kNm",
            vec![
                "De doorsnede draagt N_Ed al niet bij κ = 0: er is geen momentweerstand meer over."
                    .to_string(),
            ],
        )),
    }

    stappen
}

// ── De afleiding van §5.8.9 op één snede ──────────────────────────────────

/// §5.8.9 op de maatgevende snede: de twee voorwaarden van (3) en, als die
/// niet allebei gelden, de interactie (5.39) van (4).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DubbeleBuiging {
    pub voorwaarde_a: Voorwaarde538a,
    pub voorwaarde_b: Voorwaarde538b,
    /// (5.38a) én (5.38b) vervuld: de richtingen mogen apart worden getoetst.
    pub apart_toegestaan: bool,
    /// N_Ed als druk, positief, kN.
    pub n_ed_druk_kn: f64,
    /// N_Rd = A_c·f_cd + A_s·f_yd, kN.
    pub n_rd_kn: f64,
    pub a_c_mm2: f64,
    pub a_s_mm2: f64,
    pub f_cd_mpa: f64,
    pub f_yd_mpa: f64,
    pub n_verhouding: f64,
    pub a: f64,
    pub a_grondslag: ExponentAGrondslag,
    pub m_edy_knm: f64,
    pub m_rdy_knm: f64,
    pub m_edz_knm: f64,
    pub m_rdz_knm: f64,
    /// De som van (5.39). Ook uitgerekend als de richtingen apart mogen; dan
    /// is hij ter informatie.
    pub interactie: f64,
}

/// De afleiding van [`DubbeleBuiging`] als deelstappen.
pub fn dubbele_buiging_deelstappen(d: &DubbeleBuiging) -> Vec<Deelstap> {
    let mut stappen = Vec::new();
    let a = &d.voorwaarde_a;
    let b = &d.voorwaarde_b;

    stappen.push(stap(
        "voorwaarde_5_38a",
        "Slankheidsvoorwaarde",
        "",
        "art. 5.8.9(3) (5.38a)",
        r"\lambda_y/\lambda_z \le 2 \ \text{en}\ \lambda_z/\lambda_y \le 2".to_string(),
        format!(
            r"{}/{} = {} \ \text{{en}}\ {}/{} = {}",
            lx(a.lambda_y, 1),
            lx(a.lambda_z, 1),
            lx(a.y_door_z, 3),
            lx(a.lambda_z, 1),
            lx(a.lambda_y, 1),
            lx(a.z_door_y, 3)
        ),
        vec![
            nv("λ_y", a.lambda_y, "-"),
            nv("λ_z", a.lambda_z, "-"),
            nv("λ_y/λ_z", a.y_door_z, "-"),
            nv("λ_z/λ_y", a.z_door_y, "-"),
        ],
        None,
        "-",
        vec![format!(
            "λ_y = l₀,y/i_y en λ_z = l₀,z/i_z, elk met de eigen kniklengte. (5.38a) is {}.",
            if a.voldaan { "vervuld" } else { "NIET vervuld" }
        )],
    ));

    stappen.push(stap(
        "voorwaarde_5_38b",
        "Excentriciteitsvoorwaarde",
        "",
        "art. 5.8.9(3) (5.38b), figuur 5.8",
        r"\frac{e_y/h_{eq}}{e_z/b_{eq}} \le 0{,}2\ \text{of}\ \frac{e_z/b_{eq}}{e_y/h_{eq}} \le 0{,}2"
            .to_string(),
        format!(
            r"\frac{{{}/{}}}{{{}/{}}} = {}\ \text{{of}}\ \frac{{{}/{}}}{{{}/{}}} = {}",
            lx(b.e_y_mm, 1),
            lx(b.h_eq_mm, 1),
            lx(b.e_z_mm, 1),
            lx(b.b_eq_mm, 1),
            lx(b.y_door_z, 3),
            lx(b.e_z_mm, 1),
            lx(b.b_eq_mm, 1),
            lx(b.e_y_mm, 1),
            lx(b.h_eq_mm, 1),
            lx(b.z_door_y, 3)
        ),
        vec![
            nv("e_y", b.e_y_mm, "mm"),
            nv("e_z", b.e_z_mm, "mm"),
            nv("i_y", b.i_y_mm, "mm"),
            nv("i_z", b.i_z_mm, "mm"),
            nv("b_eq", b.b_eq_mm, "mm"),
            nv("h_eq", b.h_eq_mm, "mm"),
            nv("e_y/h_eq", b.e_y_rel, "-"),
            nv("e_z/b_eq", b.e_z_rel, "-"),
        ],
        None,
        "-",
        vec![
            format!(
                "e_y = M_Edz/N_Ed = {}/{} = {} mm en e_z = M_Edy/N_Ed = {}/{} = {} mm, met de \
                 momenten inclusief imperfectie en tweede-orde-deel. b_eq = i_y·√12 = {} mm en \
                 h_eq = i_z·√12 = {} mm zijn de maten van de gelijkwaardige rechthoek: figuur 5.8 \
                 tekent h langs de y-as en b langs de z-as, dus h_eq hoort bij e_y en b_eq bij e_z.",
                nl(d.m_edz_knm, 2),
                nl(d.n_ed_druk_kn, 1),
                nl(b.e_y_mm, 1),
                nl(d.m_edy_knm, 2),
                nl(d.n_ed_druk_kn, 1),
                nl(b.e_z_mm, 1),
                nl(b.b_eq_mm, 1),
                nl(b.h_eq_mm, 1)
            ),
            format!(
                "(5.38b) is {}. {}",
                if b.voldaan { "vervuld" } else { "NIET vervuld" },
                if d.apart_toegestaan {
                    "Samen met (5.38a) betekent dat: §5.8.9(3) vraagt geen verdere controle; de \
                     twee richtingen zijn elk afzonderlijk getoetst (§5.8.9(2))."
                } else {
                    "Er is dus niet aan (5.38) voldaan en §5.8.9(4) vraagt de interactie (5.39)."
                }
            ),
        ],
    ));

    stappen.push(stap(
        "n_rd",
        "Opneembare normaalkracht",
        r"N_{Rd}",
        "art. 5.8.9(4)",
        r"N_{Rd} = A_c f_{cd} + A_s f_{yd}".to_string(),
        format!(
            r"N_{{Rd}} = ({} \cdot {} + {} \cdot {}) \cdot 10^{{-3}} = {}\ \mathrm{{kN}}",
            lx(d.a_c_mm2, 0),
            lx(d.f_cd_mpa, 2),
            lx(d.a_s_mm2, 0),
            lx(d.f_yd_mpa, 1),
            lx(d.n_rd_kn, 1)
        ),
        vec![
            nv("A_c", d.a_c_mm2, "mm²"),
            nv("f_cd", d.f_cd_mpa, "N/mm²"),
            nv("A_s", d.a_s_mm2, "mm²"),
            nv("f_yd", d.f_yd_mpa, "N/mm²"),
            nv("N_Rd", d.n_rd_kn, "kN"),
        ],
        Some(d.n_rd_kn),
        "kN",
        vec!["A_c is de bruto betondoorsnede en A_s de totale langswapening.".to_string()],
    ));

    stappen.push(stap(
        "exponent_a",
        "Exponent van de interactie",
        "a",
        "art. 5.8.9(4), tabel bij (5.39)",
        r"a = f(N_{Ed}/N_{Rd})".to_string(),
        format!(
            r"N_{{Ed}}/N_{{Rd}} = {}/{} = {} \Rightarrow a = {}",
            lx(d.n_ed_druk_kn, 1),
            lx(d.n_rd_kn, 1),
            lx(d.n_verhouding, 3),
            lx(d.a, 3)
        ),
        vec![nv("N_Ed/N_Rd", d.n_verhouding, "-"), nv("a", d.a, "-")],
        Some(d.a),
        "-",
        vec![match d.a_grondslag {
            ExponentAGrondslag::OnderTabel => {
                "N_Ed/N_Rd ≤ 0,1. De tabel begint bij 0,1 met a = 1,0 en zegt niets over \
                 kleinere waarden; a = 1,0 is aangehouden — de lineaire interactie, de strengste \
                 van de drie."
                    .to_string()
            }
            ExponentAGrondslag::Geinterpoleerd => {
                "Rechthoekige doorsnede: a = 1,0 bij N_Ed/N_Rd = 0,1, 1,5 bij 0,7 en 2,0 bij 1,0, \
                 met lineaire interpolatie voor tussenliggende waarden."
                    .to_string()
            }
            ExponentAGrondslag::BovenTabel => {
                "N_Ed/N_Rd ≥ 1,0: a = 2,0. Let op: N_Ed ≥ N_Rd is op zichzelf al een \
                 overschrijding van de normaalkrachtcapaciteit."
                    .to_string()
            }
        }],
    ));

    stappen.push(stap(
        "interactie_5_39",
        "Interactie van de twee momenten",
        "",
        "art. 5.8.9(4) (5.39)",
        r"\left(\frac{M_{Edz}}{M_{Rdz}}\right)^a + \left(\frac{M_{Edy}}{M_{Rdy}}\right)^a \le 1{,}0"
            .to_string(),
        format!(
            r"\left(\frac{{{}}}{{{}}}\right)^{{{}}} + \left(\frac{{{}}}{{{}}}\right)^{{{}}} = {}",
            lx(d.m_edz_knm, 2),
            lx(d.m_rdz_knm, 2),
            lx(d.a, 3),
            lx(d.m_edy_knm, 2),
            lx(d.m_rdy_knm, 2),
            lx(d.a, 3),
            lx(d.interactie, 3)
        ),
        vec![
            nv("M_Edz", d.m_edz_knm, "kNm"),
            nv("M_Rdz", d.m_rdz_knm, "kNm"),
            nv("M_Edy", d.m_edy_knm, "kNm"),
            nv("M_Rdy", d.m_rdy_knm, "kNm"),
            nv("a", d.a, "-"),
        ],
        Some(d.interactie),
        "-",
        vec![if d.apart_toegestaan {
            "Ter informatie: §5.8.9(3) vraagt deze interactie hier niet, omdat (5.38a) en (5.38b) \
             allebei zijn vervuld. De som staat er zodat te zien is hoe ver de kolom van de grens \
             af zit; hij is niet de unity check van deze toets."
                .to_string()
        } else {
            "M_Edz en M_Edy zijn de rekenwaarden inclusief tweede-orde-moment; M_Rdz en M_Rdy de \
             momentweerstanden bij N_Ed in de respectievelijke richtingen (§6.1)."
                .to_string()
        }],
    ));

    stappen
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.5 — detailleringseisen voor een kolom
// ═══════════════════════════════════════════════════════════════════════════

/// NB bij §9.5.1(2) — de kleinste dwarsafmeting van een kolom, mm.
///
/// "De kleinste dwarsafmeting moet ten minste 200 mm bedragen." Deze zin is een
/// TOEVOEGING van de Nederlandse bijlage; §9.5.1 van de EN-tekst kent alleen
/// lid (1), over de verhouding h ≤ 4b. Op de gerenderde bladzijde 213 staat de
/// zin oranje en niet doorgehaald.
pub const MIN_DWARSAFMETING_KOLOM_MM: f64 = 200.0;

/// NB bij §9.5.2(1) — Φ_min voor langsstaven in een kolom, mm.
///
/// De EN-aanbeveling (8 mm) is doorgehaald en als eis teruggezet: "De waarde van
/// Φ_min moet gelijk aan 8 mm zijn genomen." Zelfde getal, andere status. Let
/// op het verschil met een BALK, waar de NB bij §9.2.1.1(5) 6 mm eist.
pub const MIN_DIAMETER_LANGSSTAAF_KOLOM_MM: f64 = 8.0;

/// §9.5.3(1) — de ondergrens van de diameter van dwarswapening in een kolom, mm.
///
/// Zwarte EN-tekst, door de NB niet gewijzigd: "De diameter van dwarswapening
/// (beugels, haarspelden of spiraalwapening) behoort niet kleiner te zijn dan
/// 6 mm, of, als deze groter is, een kwart van de maximale diameter van de
/// langsstaven."
pub const MIN_DIAMETER_DWARSWAPENING_KOLOM_MM: f64 = 6.0;

/// §9.5.3(3) — het absolute plafond in s_cl,tmax, mm.
pub const S_CL_TMAX_PLAFOND_MM: f64 = 400.0;

/// §9.5.3(4) — de reductiefactor op s_cl,tmax.
pub const S_CL_TMAX_REDUCTIE: f64 = 0.6;

/// §9.5.3(4)ii — vanaf welke langsstaafdiameter de regels bij een
/// overlappingslas gaan gelden, mm.
///
/// "nabij overlappingslassen indien de maximale diameter van de langsstaven
/// groter is dan 14 mm" — zowel de factor 0,6 als de eis van drie beugels hangt
/// aan deze drempel.
pub const PHI_L_DREMPEL_LAS_9_5_3_MM: f64 = 14.0;

/// §9.5.3(4)ii — het minimumaantal beugels over een overlappingslas.
///
/// "Een minimum van drie staven, gelijkmatig verdeeld over de
/// overlappingslengte, is vereist."
pub const MIN_AANTAL_BEUGELS_LAS_9_5_3: u32 = 3;

/// §8.7.3(1) met (8.11) — de ondergrens van de overlappingslengte l₀ die hoe
/// dan ook geldt, mm.
///
/// (8.10) eist l₀ ≥ l₀,min en (8.11) zet
/// l₀,min ≥ max{0,3·α₆·l_b,rqd ; 15Φ ; 200 mm}. De eerste tak vraagt l_b,rqd en
/// α₆ en is hier dus niet te vullen; hij kan de uitkomst alleen VERHOGEN, want
/// (8.11) is een maximum. Wat overblijft — max{15Φ ; 200 mm} — is daarmee een
/// gegarandeerde ondergrens van l₀ en niet de waarde van l₀ zelf. Alleen als
/// zodanig gebruiken: een toets die hem als de werkelijke lengte behandelt,
/// keurt af waar de norm dat niet doet.
///
/// `phi_mm` is de diameter van de overlappende staaf.
pub fn l0_ondergrens_8_11_mm(phi_mm: f64) -> f64 {
    (15.0 * phi_mm).max(200.0)
}

/// Waar in de kolom bevindt de beschouwde doorsnede zich? §9.5.3(4).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Beugelzone {
    /// Gewone kolomdoorsnede: de volle s_cl,tmax van §9.5.3(3).
    Regulier,
    /// §9.5.3(4)i — binnen een afstand gelijk aan de grootste afmeting van de
    /// kolomdwarsdoorsnede boven of onder een balk of plaat: factor 0,6.
    BijBalkOfPlaat,
    /// §9.5.3(4)ii — nabij overlappingslassen als de maximale diameter van de
    /// langsstaven groter is dan 14 mm: factor 0,6. De norm eist daar bovendien
    /// ten minste drie staven, gelijkmatig verdeeld over de overlappingslengte;
    /// dat aantal toetst [`aantal_beugels_las_9_5_3`].
    BijOverlappingslas,
}

impl Beugelzone {
    pub fn factor(self) -> f64 {
        match self {
            Beugelzone::Regulier => 1.0,
            Beugelzone::BijBalkOfPlaat | Beugelzone::BijOverlappingslas => S_CL_TMAX_REDUCTIE,
        }
    }

    pub fn toelichting(self) -> &'static str {
        match self {
            Beugelzone::Regulier => "reguliere kolomdoorsnede: de volle s_cl,tmax van §9.5.3(3)",
            Beugelzone::BijBalkOfPlaat => {
                "§9.5.3(4)i — binnen een afstand gelijk aan de grootste afmeting van de \
                 kolomdwarsdoorsnede boven of onder een balk of plaat: ×0,6"
            }
            Beugelzone::BijOverlappingslas => {
                "§9.5.3(4)ii — nabij een overlappingslas met Φ_l > 14 mm: ×0,6. De norm eist daar \
                 óók ten minste drie beugels, gelijkmatig over de overlappingslengte verdeeld; dat \
                 aantal staat in een eigen toets."
            }
        }
    }
}

/// Komen er overlappingslassen in de kolom voor? Bepaalt A_s,max volgens de NB
/// bij §9.5.2(3).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Overlappingssituatie {
    /// Geen overlappingslassen in deze kolom: A_s,max = 0,08·A_c.
    GeenLassen,
    /// Er komen lassen voor, maar deze doorsnede ligt er niet ter plaatse van:
    /// A_s,max = 0,04·A_c.
    LassenBuitenDezeDoorsnede,
    /// Deze doorsnede ligt ter plaatse van een overlappingslas:
    /// A_s,max = 0,08·A_c.
    TerPlaatseVanLas,
}

/// NB bij §9.5.2(2) — A_s,min = max{0,10·N_Ed/f_yd ; 0,002·A_c}.
///
/// De EN-aanbeveling met (9.12N) is doorgehaald en als eis teruggezet met
/// dezelfde inhoud: "De waarde van A_s,min moet gelijk aan de grootste waarde
/// van [0,10·N_Ed/f_yd] en 0,002·A_c zijn genomen."
///
/// **N_Ed is hier de aangrijpende normaalDRUKkracht, positief**, in N. De norm
/// zegt dat met zoveel woorden: "N_Ed is de rekenwaarde van de aangrijpende
/// normaaldrukkracht."
pub fn as_min_9_5_2_mm2(n_ed_druk_n: f64, f_yd_mpa: f64, a_c_mm2: f64) -> Result<f64, String> {
    if !(f_yd_mpa > 0.0) {
        return Err("A_s,min volgens (9.12N): f_yd moet groter dan nul zijn".to_string());
    }
    if n_ed_druk_n < 0.0 {
        return Err(
            "A_s,min volgens (9.12N) rekent met de aangrijpende normaalDRUKkracht; een negatieve \
             waarde is trek en hoort hier niet in te gaan."
                .to_string(),
        );
    }
    Ok((0.10 * n_ed_druk_n / f_yd_mpa).max(0.002 * a_c_mm2))
}

/// NB bij §9.5.2(3) — A_s,max, mm².
///
/// Hier wijkt de Nederlandse bijlage inhoudelijk af van de EN-aanbeveling.
///
/// * **EN-aanbeveling (doorgehaald):** 0,04·A_c buiten gebieden met
///   overlappingslassen, te vergroten tot 0,08·A_c bij overlappingslassen.
/// * **NB (eis):** 0,04·A_c voor kolommen WAARIN overlappingslassen voorkomen,
///   en ter plaatse van die lassen 0,08·A_c; **0,08·A_c voor kolommen waarin
///   GEEN overlappingslassen voorkomen.**
///
/// Het verschil zit in dat laatste geval: een kolom zonder lassen mag in
/// Nederland het dubbele van de EN-aanbeveling. Wie de EN-tekst leest en de NB
/// overslaat, keurt zo'n kolom ten onrechte af.
pub fn as_max_9_5_2_mm2(a_c_mm2: f64, situatie: Overlappingssituatie) -> f64 {
    match situatie {
        Overlappingssituatie::GeenLassen | Overlappingssituatie::TerPlaatseVanLas => {
            0.08 * a_c_mm2
        }
        Overlappingssituatie::LassenBuitenDezeDoorsnede => 0.04 * a_c_mm2,
    }
}

/// §9.5.3(1) — de vereiste minimumdiameter van de dwarswapening, mm.
///
/// max{6 mm ; Φ_l,max/4}. De regel voor gepuntlaste wapeningsnetten (5 mm) valt
/// hier niet onder: dat is een andere wapeningsvorm en de app kent hem niet.
pub fn min_diameter_dwarswapening_9_5_3_mm(phi_l_max_mm: f64) -> f64 {
    MIN_DIAMETER_DWARSWAPENING_KOLOM_MM.max(phi_l_max_mm / 4.0)
}

/// De drie takken van s_cl,tmax, zodat de afleiding kan tonen wélke wint.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum ScltmaxTak {
    /// 20 × de minimumdiameter van de langsstaven.
    TwintigMaalDiameter,
    /// De kleinste afmeting van de kolom.
    KleinsteKolomafmeting,
    /// 400 mm.
    Plafond400,
}

impl ScltmaxTak {
    pub fn omschrijving(self) -> &'static str {
        match self {
            ScltmaxTak::TwintigMaalDiameter => "20 maal de minimumdiameter van de langsstaven",
            ScltmaxTak::KleinsteKolomafmeting => "de kleinste afmeting van de kolom",
            ScltmaxTak::Plafond400 => "400 mm",
        }
    }
}

/// NB bij §9.5.3(3), met §9.5.3(4) — de grootste hart-op-hartafstand van de
/// dwarswapening langs de kolom, mm.
///
/// De EN-aanbeveling is doorgehaald en woordelijk als eis teruggezet: "De waarde
/// van s_cl,tmax moet gelijk zijn genomen aan de kleinste waarde van de volgende
/// drie afstanden: 20 maal de minimumdiameter van de langsstaven; de kleinste
/// afmeting van de kolom; 400 mm." Zelfde drie takken, andere status.
///
/// Let op **minimumdiameter**: staan er Ø25 hoekstaven en Ø12 tussenstaven, dan
/// telt de Ø12. De ruimste tak is dus niet de dikste staaf maar de dunste.
///
/// Levert `(s_cl,tmax, maatgevende tak)`; de reductie van §9.5.3(4) zit in
/// `zone`.
pub fn s_cl_tmax_9_5_3_mm(
    phi_l_min_mm: f64,
    kleinste_kolomafmeting_mm: f64,
    zone: Beugelzone,
) -> Result<(f64, ScltmaxTak), String> {
    if !(phi_l_min_mm > 0.0) {
        return Err(
            "s_cl,tmax volgens §9.5.3(3): de minimumdiameter van de langsstaven moet groter dan \
             nul zijn"
                .to_string(),
        );
    }
    if !(kleinste_kolomafmeting_mm > 0.0) {
        return Err("s_cl,tmax volgens §9.5.3(3): de kleinste kolomafmeting moet groter dan nul \
                    zijn"
            .to_string());
    }
    let takken = [
        (20.0 * phi_l_min_mm, ScltmaxTak::TwintigMaalDiameter),
        (kleinste_kolomafmeting_mm, ScltmaxTak::KleinsteKolomafmeting),
        (S_CL_TMAX_PLAFOND_MM, ScltmaxTak::Plafond400),
    ];
    let (waarde, tak) = takken
        .into_iter()
        .fold((f64::INFINITY, ScltmaxTak::Plafond400), |acc, kandidaat| {
            if kandidaat.0 < acc.0 {
                kandidaat
            } else {
                acc
            }
        });
    Ok((waarde * zone.factor(), tak))
}

/// §9.5.1(1) — het toepassingsgebied van §9.5: h ≤ 4·b.
///
/// "Deze paragraaf behandelt kolommen waarvoor de grootste afmeting h niet
/// groter is dan viermaal de kleinste afmeting b." Daarbuiten is het element
/// voor de norm een WAND en gelden de regels van §9.6. Dat is geen formaliteit:
/// §9.6 kent andere minimale wapeningspercentages en een andere beugelregel.
pub fn valt_onder_9_5(h_mm: f64, b_mm: f64) -> bool {
    let grootste = h_mm.max(b_mm);
    let kleinste = h_mm.min(b_mm);
    kleinste > 0.0 && grootste <= 4.0 * kleinste + 1e-9
}

/// Alles wat §9.5 van een kolom moet weten.
///
/// # De staven langs de vier zijden
///
/// [`crate::ReinforcementCage`] kende lange tijd alleen een BOVENrij en een
/// ONDERrij. Een kolom heeft staven langs alle vier de zijden, en drie van de
/// regels hieronder hangen daaraan. Met
/// [`crate::ReinforcementCage::sides`] en
/// [`crate::ReinforcementCage::staafposities`] zijn die drie nu wél te doen:
///
/// * **§9.5.2(4)** — "ten minste één staaf in iedere hoek" bij een veelhoekige
///   doorsnede, en ten minste vier staven bij een ronde. Zie
///   [`hoekstaven_9_5_2`]; hij leest [`Self::staafposities`].
/// * **§9.5.3(6)** — "Elke langsstaaf of staafbundel in een hoek behoort op zijn
///   plaats te zijn gehouden door dwarswapening. Geen enkele staaf binnen een
///   drukzone behoort verder dan 150 mm vanaf een opgesloten staaf te liggen."
///   Zie [`opgesloten_staven_9_5_3`].
/// * **A_s** in A_s,min en A_s,max is de TOTALE langswapening — §9.5.2(2)
///   spreekt van "de totale hoeveelheid langswapening" en (3) van "de
///   oppervlakte van de doorsnede van de langswapening". Dat is nu
///   [`crate::ReinforcementCage::a_s_total_mm2`], inclusief de zijstaven.
///   Zolang die niet meetelden, kon A_s,max ten onrechte groen staan; die
///   afwijking is hiermee weg.
///
/// A_s komt nog steeds als apart getal binnen en niet als korf: deze module
/// kent de doorsnede niet en zou dus toch niet uit de korf kunnen aflezen wat
/// er ligt. De AANROEPER vult hem, en die heeft de korf wel.
#[derive(Clone, Debug)]
pub struct KolomdetailleringInvoer {
    /// Het maatgevende krachtenpunt, alleen om de toets in het rapport te
    /// kunnen plaatsen.
    pub force_state: ForceStateSnapshot,
    /// Grootste afmeting h van de dwarsdoorsnede, mm.
    pub h_mm: f64,
    /// Kleinste afmeting b van de dwarsdoorsnede, mm.
    pub b_mm: f64,
    /// Oppervlakte van de betondoorsnede A_c, mm².
    pub a_c_mm2: f64,
    /// Totale aanwezige langswapening A_s, mm².
    pub a_s_mm2: f64,
    /// Kleinste aanwezige diameter van de langsstaven, mm.
    pub phi_l_min_mm: f64,
    /// Grootste aanwezige diameter van de langsstaven, mm.
    pub phi_l_max_mm: f64,
    /// Aanwezige diameter van de dwarswapening, mm. `None` = niet opgegeven.
    pub phi_dwars_mm: Option<f64>,
    /// Aanwezige hart-op-hartafstand van de dwarswapening, mm. `None` = niet
    /// opgegeven.
    pub s_dwars_mm: Option<f64>,
    /// Aantal beugelbenen n dat één doorsnede kruist. `None` = niet opgegeven.
    ///
    /// Alleen §9.5.3(6) leest dit. Bij één gesloten beugel (twee benen) staat
    /// vast wélke staven zijn opgesloten: de vier in de beugelhoeken. Bij méér
    /// benen sluiten die extra benen ook staven op, maar wáár zij zitten is in
    /// dit model geen invoer, en dan wordt er niet gegokt.
    pub n_beugelbenen: Option<u32>,
    /// De zone waarin de beschouwde doorsnede ligt (§9.5.3(4)).
    pub zone: Beugelzone,
    /// Overlappingssituatie voor A_s,max (NB bij §9.5.2(3)).
    pub overlapping: Overlappingssituatie,
    /// **N_Ed als DRUKkracht, positief, in kN** — de norm schrijft bij (9.12N)
    /// letterlijk "de rekenwaarde van de aangrijpende normaaldrukkracht".
    pub n_ed_druk_kn: f64,
    /// f_yd, N/mm².
    pub f_yd_mpa: f64,
    /// De ligging van elke langsstaaf in het vlak van de doorsnede, uit
    /// [`crate::ReinforcementCage::staafposities`].
    ///
    /// **LEEG betekent NIET BEKEND, niet "er liggen geen staven".** §9.5.2(4)
    /// en §9.5.3(6) leveren dan [`CheckStatus::NotApplicable`] met de reden
    /// erbij — nooit een stilzwijgend groen vinkje. Zo blijft een aanroeper
    /// die de posities (nog) niet kan geven eerlijk in het rapport staan.
    pub staafposities: Vec<Staafpositie>,
}

// ── Hulpstukken voor de detailleringstoetsen ────────────────────────────────

/// Een getal zonder overbodige nullen, voor lopende tekst.
fn g(v: f64) -> String {
    if (v - v.round()).abs() < 5e-4 {
        format!("{}", v.round() as i64)
    } else {
        format!("{v:.1}").replace('.', ",")
    }
}

#[allow(clippy::too_many_arguments)]
fn eis(
    id: &str,
    title: &str,
    article: &str,
    formula_latex: &str,
    force_state: ForceStateSnapshot,
    variables: Vec<NamedValue>,
    value: f64,
    unit: &str,
    uc: Option<UnityCheck>,
    status: CheckStatus,
    notes: Vec<String>,
) -> ResistanceCalc {
    ResistanceCalc {
        id: id.to_string(),
        title: title.to_string(),
        article: article.to_string(),
        force_state,
        formula_latex: formula_latex.to_string(),
        variables,
        deelstappen: Vec::new(),
        value,
        unit: unit.to_string(),
        uc,
        status,
        notes,
    }
}

/// Unity check voor een MAXIMUM-eis: aanwezig ≤ grens.
fn uc_maximum(aanwezig: f64, grens: f64, formule: &str) -> (UnityCheck, CheckStatus) {
    let uc = if grens > 0.0 { aanwezig / grens } else { f64::INFINITY };
    (
        UnityCheck { ed: aanwezig, rd: grens, uc, formula_latex: formule.to_string() },
        if uc <= 1.0 + 1e-9 { CheckStatus::Ok } else { CheckStatus::NotOk },
    )
}

/// Unity check voor een MINIMUM-eis: aanwezig ≥ vereist.
///
/// `ed` en `rd` staan om, zodat "te weinig" opnieuw uc > 1 oplevert — dezelfde
/// afspraak als in [`crate::detaillering`].
fn uc_minimum(aanwezig: f64, vereist: f64, formule: &str) -> (UnityCheck, CheckStatus) {
    let uc = if aanwezig > 0.0 { vereist / aanwezig } else { f64::INFINITY };
    (
        UnityCheck { ed: vereist, rd: aanwezig, uc, formula_latex: formule.to_string() },
        if uc <= 1.0 + 1e-9 { CheckStatus::Ok } else { CheckStatus::NotOk },
    )
}

/// NB bij §9.5.1(2) — de kleinste dwarsafmeting van de kolom ≥ 200 mm.
pub fn min_dwarsafmeting_9_5_1(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let kleinste = inv.h_mm.min(inv.b_mm);
    let (uc, status) = uc_minimum(kleinste, MIN_DWARSAFMETING_KOLOM_MM, r"b_{\min,eis} / b_{\min}");
    eis(
        "9.5.1_min_dwarsafmeting",
        "Kleinste dwarsafmeting van de kolom",
        "NB bij art. 9.5.1(2) — eis die alleen in de nationale bijlage staat",
        r"b_{\min} \ \ge\ 200\ \text{mm}",
        inv.force_state,
        vec![
            nv("b_min", kleinste, "mm"),
            nv("b_min,eis", MIN_DWARSAFMETING_KOLOM_MM, "mm"),
        ],
        kleinste,
        "mm",
        Some(uc),
        status,
        vec![
            "De EN-tekst van §9.5.1 kent alleen lid (1) over de verhouding h ≤ 4b. De zin \"De \
             kleinste dwarsafmeting moet ten minste 200 mm bedragen\" is een TOEVOEGING van de \
             Nederlandse bijlage."
                .to_string(),
        ],
    )
}

/// §9.5.1(1) — valt dit element nog onder §9.5, of is het een wand?
pub fn toepassingsgebied_9_5_1(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let grootste = inv.h_mm.max(inv.b_mm);
    let kleinste = inv.h_mm.min(inv.b_mm);
    let grens = 4.0 * kleinste;
    let (uc, status) = uc_maximum(grootste, grens, r"h / (4b)");
    eis(
        "9.5.1_toepassingsgebied",
        "Toepassingsgebied van §9.5 (kolom of wand)",
        "art. 9.5.1(1)",
        r"h \ \le\ 4\,b",
        inv.force_state,
        vec![nv("h", grootste, "mm"), nv("b", kleinste, "mm"), nv("4b", grens, "mm")],
        grootste,
        "mm",
        Some(uc),
        status,
        vec![
            "Boven h = 4b is het element voor de norm geen kolom maar een WAND en gelden de regels \
             van §9.6, met andere minimale wapeningspercentages en een andere beugelregel. Deze \
             toets keurt niets af; hij zegt of §9.5 hier de juiste paragraaf is."
                .to_string(),
        ],
    )
}

/// NB bij §9.5.2(1) — langsstaven ≥ Ø8.
pub fn min_diameter_langsstaaf_9_5_2(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let (uc, status) = uc_minimum(
        inv.phi_l_min_mm,
        MIN_DIAMETER_LANGSSTAAF_KOLOM_MM,
        r"\phi_{\min,eis} / \phi_{l,\min}",
    );
    eis(
        "9.5.2_min_diameter_langs",
        "Minimumdiameter langsstaven in een kolom",
        "NB bij art. 9.5.2(1)",
        r"\phi_l \ \ge\ 8\ \text{mm}",
        inv.force_state,
        vec![
            nv("φ_l,min", inv.phi_l_min_mm, "mm"),
            nv("φ_min,eis", MIN_DIAMETER_LANGSSTAAF_KOLOM_MM, "mm"),
        ],
        inv.phi_l_min_mm,
        "mm",
        Some(uc),
        status,
        vec![
            "De EN-aanbeveling van 8 mm is door de NB doorgehaald en met dezelfde waarde als eis \
             teruggezet. Let op het verschil met een BALK: daar eist de NB bij §9.2.1.1(5) 6 mm."
                .to_string(),
        ],
    )
}

/// NB bij §9.5.2(2) — A_s ≥ A_s,min = max{0,10·N_Ed/f_yd ; 0,002·A_c}.
pub fn as_min_9_5_2(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let n_ed_n = inv.n_ed_druk_kn * 1.0e3;
    let tak_kracht = if inv.f_yd_mpa > 0.0 { 0.10 * n_ed_n / inv.f_yd_mpa } else { f64::NAN };
    let tak_opp = 0.002 * inv.a_c_mm2;
    let vereist = match as_min_9_5_2_mm2(n_ed_n, inv.f_yd_mpa, inv.a_c_mm2) {
        Ok(v) => v,
        Err(reden) => {
            return eis(
                "9.5.2_as_min",
                "Minimale langswapening in een kolom",
                "NB bij art. 9.5.2(2), (9.12N)",
                r"A_s \ \ge\ \max\left\{\frac{0{,}10\,N_{Ed}}{f_{yd}}\ ;\ 0{,}002\,A_c\right\}",
                inv.force_state,
                Vec::new(),
                f64::NAN,
                "mm²",
                None,
                CheckStatus::NotApplicable,
                vec![format!("Niet te toetsen: {reden}")],
            );
        }
    };
    let (uc, status) = uc_minimum(inv.a_s_mm2, vereist, r"A_{s,\min} / A_s");
    eis(
        "9.5.2_as_min",
        "Minimale langswapening in een kolom",
        "NB bij art. 9.5.2(2), (9.12N)",
        r"A_s \ \ge\ \max\left\{\frac{0{,}10\,N_{Ed}}{f_{yd}}\ ;\ 0{,}002\,A_c\right\}",
        inv.force_state,
        vec![
            nv("A_s", inv.a_s_mm2, "mm²"),
            nv("0,10·N_Ed/f_yd", tak_kracht, "mm²"),
            nv("0,002·A_c", tak_opp, "mm²"),
            nv("A_s,min", vereist, "mm²"),
        ],
        vereist,
        "mm²",
        Some(uc),
        status,
        vec![
            format!(
                "Maatgevend is {}: {} mm² tegen {} mm².",
                if tak_kracht >= tak_opp { "de krachtterm 0,10·N_Ed/f_yd" } else { "0,002·A_c" },
                g(vereist),
                g(if tak_kracht >= tak_opp { tak_opp } else { tak_kracht })
            ),
            "De NB heeft de EN-aanbeveling doorgehaald en met dezelfde inhoud als eis teruggezet. \
             N_Ed is hier de aangrijpende normaalDRUKkracht; de norm schrijft dat woordelijk zo."
                .to_string(),
            "A_s is de TOTALE langswapening van de doorsnede, dus alle vier de zijden — §9.5.2(2) \
             spreekt letterlijk van \"de totale hoeveelheid langswapening\". De aanroeper vult hem \
             uit de korf, met de zijstaven erbij; deze module kent de doorsnede niet en kan hem \
             dus niet zelf aflezen."
                .to_string(),
        ],
    )
}

/// NB bij §9.5.2(3) — A_s ≤ A_s,max.
pub fn as_max_9_5_2(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let grens = as_max_9_5_2_mm2(inv.a_c_mm2, inv.overlapping);
    let (uc, status) = uc_maximum(inv.a_s_mm2, grens, r"A_s / A_{s,\max}");
    let tak = match inv.overlapping {
        Overlappingssituatie::GeenLassen => {
            "0,08·A_c — de kolom bevat geen overlappingslassen. Dit is de tak waarin de NB \
             INHOUDELIJK van de EN-aanbeveling afwijkt: de EN geeft daar 0,04·A_c."
        }
        Overlappingssituatie::LassenBuitenDezeDoorsnede => {
            "0,04·A_c — de kolom bevat overlappingslassen, maar deze doorsnede ligt er niet ter \
             plaatse van."
        }
        Overlappingssituatie::TerPlaatseVanLas => {
            "0,08·A_c — deze doorsnede ligt ter plaatse van een overlappingslas."
        }
    };
    eis(
        "9.5.2_as_max",
        "Maximale langswapening in een kolom",
        "NB bij art. 9.5.2(3)",
        r"A_s \ \le\ A_{s,\max}",
        inv.force_state,
        vec![
            nv("A_s", inv.a_s_mm2, "mm²"),
            nv("A_c", inv.a_c_mm2, "mm²"),
            nv("A_s,max", grens, "mm²"),
        ],
        grens,
        "mm²",
        Some(uc),
        status,
        vec![
            tak.to_string(),
            "De NB-tekst luidt: A_s,max is 0,04·A_c voor kolommen waarin overlappingslassen \
             voorkomen (ter plaatse van die lassen 0,08·A_c), en 0,08·A_c voor kolommen waarin \
             geen overlappingslassen voorkomen. De EN-aanbeveling kende dat laatste geval niet."
                .to_string(),
        ],
    )
}

/// §9.5.3(1) — de diameter van de dwarswapening ≥ max{6 mm ; Φ_l,max/4}.
pub fn min_diameter_dwarswapening_9_5_3(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let vereist = min_diameter_dwarswapening_9_5_3_mm(inv.phi_l_max_mm);
    let basis = vec![
        nv("φ_l,max", inv.phi_l_max_mm, "mm"),
        nv("φ_l,max/4", inv.phi_l_max_mm / 4.0, "mm"),
        nv("φ_sw,min", vereist, "mm"),
    ];
    let notes = vec![
        format!(
            "Maatgevend is {}.",
            if inv.phi_l_max_mm / 4.0 > MIN_DIAMETER_DWARSWAPENING_KOLOM_MM {
                "een kwart van de grootste langsstaafdiameter"
            } else {
                "de absolute ondergrens van 6 mm"
            }
        ),
        "Zwarte EN-tekst; de NB wijzigt §9.5.3(1) niet. De aparte regel voor gepuntlaste \
         wapeningsnetten (5 mm) is hier niet gebouwd — dat is een andere wapeningsvorm."
            .to_string(),
    ];
    match inv.phi_dwars_mm {
        Some(d) if d > 0.0 => {
            let (uc, status) = uc_minimum(d, vereist, r"\phi_{sw,\min} / \phi_{sw}");
            let mut vars = basis;
            vars.insert(0, nv("φ_sw", d, "mm"));
            eis(
                "9.5.3_min_diameter_dwars",
                "Minimumdiameter dwarswapening in een kolom",
                "art. 9.5.3(1)",
                r"\phi_{sw} \ \ge\ \max\{6\ \text{mm}\ ;\ \phi_{l,\max}/4\}",
                inv.force_state,
                vars,
                vereist,
                "mm",
                Some(uc),
                status,
                notes,
            )
        }
        _ => {
            let mut notes = notes;
            notes.push(
                "Niet te toetsen: er is geen diameter van de dwarswapening opgegeven. De vereiste \
                 waarde staat er wel, zodat zichtbaar is waaraan moet worden voldaan."
                    .to_string(),
            );
            eis(
                "9.5.3_min_diameter_dwars",
                "Minimumdiameter dwarswapening in een kolom",
                "art. 9.5.3(1)",
                r"\phi_{sw} \ \ge\ \max\{6\ \text{mm}\ ;\ \phi_{l,\max}/4\}",
                inv.force_state,
                basis,
                vereist,
                "mm",
                None,
                CheckStatus::NotApplicable,
                notes,
            )
        }
    }
}

/// NB bij §9.5.3(3), met §9.5.3(4) — s ≤ s_cl,tmax.
pub fn s_cl_tmax_9_5_3(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let kleinste_afmeting = inv.h_mm.min(inv.b_mm);
    let (grens, tak) = match s_cl_tmax_9_5_3_mm(inv.phi_l_min_mm, kleinste_afmeting, inv.zone) {
        Ok(v) => v,
        Err(reden) => {
            return eis(
                "9.5.3_s_cl_tmax",
                "Beugelafstand in een kolom",
                "NB bij art. 9.5.3(3), met art. 9.5.3(4)",
                r"s \ \le\ s_{cl,t\max}",
                inv.force_state,
                Vec::new(),
                f64::NAN,
                "mm",
                None,
                CheckStatus::NotApplicable,
                vec![format!("Niet te toetsen: {reden}")],
            );
        }
    };
    let vars = vec![
        nv("20·φ_l,min", 20.0 * inv.phi_l_min_mm, "mm"),
        nv("b_min", kleinste_afmeting, "mm"),
        nv("400", S_CL_TMAX_PLAFOND_MM, "mm"),
        nv("s_cl,tmax", grens, "mm"),
    ];
    let mut notes = vec![
        format!("Maatgevend van de drie takken is {}.", tak.omschrijving()),
        inv.zone.toelichting().to_string(),
        "Let op het woord MINIMUMdiameter in de eerste tak: staan er dikke hoekstaven en dunnere \
         tussenstaven, dan telt de dunste. De ruimste tak is dus niet de dikste staaf."
            .to_string(),
        "De NB heeft de EN-aanbeveling doorgehaald en woordelijk met dezelfde drie takken als eis \
         teruggezet."
            .to_string(),
    ];
    if inv.zone == Beugelzone::BijOverlappingslas && inv.phi_l_max_mm <= 14.0 {
        notes.push(format!(
            "§9.5.3(4)ii reduceert alleen als de maximale diameter van de langsstaven groter is \
             dan 14 mm; hier is Φ_l,max = {} mm. De reductie is desondanks toegepast omdat de \
             zone zo is opgegeven — controleer die invoer.",
            g(inv.phi_l_max_mm)
        ));
    }
    match inv.s_dwars_mm {
        Some(s) if s > 0.0 => {
            let (uc, status) = uc_maximum(s, grens, r"s / s_{cl,t\max}");
            let mut vars = vars;
            vars.insert(0, nv("s", s, "mm"));
            eis(
                "9.5.3_s_cl_tmax",
                "Beugelafstand in een kolom",
                "NB bij art. 9.5.3(3), met art. 9.5.3(4)",
                r"s \ \le\ s_{cl,t\max}",
                inv.force_state,
                vars,
                grens,
                "mm",
                Some(uc),
                status,
                notes,
            )
        }
        _ => {
            notes.push(
                "Niet te toetsen: er is geen hart-op-hartafstand van de dwarswapening opgegeven."
                    .to_string(),
            );
            eis(
                "9.5.3_s_cl_tmax",
                "Beugelafstand in een kolom",
                "NB bij art. 9.5.3(3), met art. 9.5.3(4)",
                r"s \ \le\ s_{cl,t\max}",
                inv.force_state,
                vars,
                grens,
                "mm",
                None,
                CheckStatus::NotApplicable,
                notes,
            )
        }
    }
}

/// §9.5.3(4)ii — het AANTAL beugels over een overlappingslas.
///
/// "Een minimum van drie staven, gelijkmatig verdeeld over de overlappingslengte,
/// is vereist." Drie beugels gelijkmatig over l₀ betekent twee tussenruimten van
/// l₀/2, dus de eis is s ≤ l₀/2.
///
/// # Waarom hier met een ONDERGRENS van l₀ wordt gerekend
///
/// l₀ zelf is geen invoer van een raamwerkmodel: §8.7.3(1) bepaalt hem met
/// (8.10) uit l_b,rqd en de coëfficiënten α₁, α₂, α₃, α₅ en α₆, en die vragen de
/// spanning in de staaf, de dekkingsmaat c_d, de aanwezige dwarswapening en het
/// overlappingspercentage ρ₁ — geen daarvan staat in de korf.
///
/// Wat de norm wél onvoorwaardelijk garandeert is de ONDERgrens: (8.10) eist
/// l₀ ≥ l₀,min en (8.11) zet l₀,min ≥ max{0,3·α₆·l_b,rqd ; 15Φ ; 200 mm}. Omdat
/// α₆ ≥ 1 en l_b,rqd > 0, geldt dus altijd
///
/// > l₀ ≥ max{15Φ ; 200 mm}
///
/// Daarmee is de toets EENZIJDIG te maken. Past s binnen de helft van die
/// ondergrens, dan passen er drie beugels over l₀ — hoe lang de werkelijke
/// overlapping ook is — en dat is een uitkomst die staat. Past s daar niet
/// binnen, dan is er NIETS bewezen: de werkelijke l₀ is doorgaans een veelvoud
/// van de ondergrens, dus die tak levert [`CheckStatus::NotApplicable`] met de
/// reden en nadrukkelijk GEEN afkeuring.
///
/// Φ in (8.11) is de diameter van de overlappende staaf. Welke staven in deze
/// kolom worden gelast is geen invoer, dus hier staat de KLEINSTE aanwezige
/// langsstaafdiameter: die geeft de kleinste — en dus de enige gegarandeerde —
/// ondergrens van l₀.
pub fn aantal_beugels_las_9_5_3(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    const ID: &str = "9.5.3_aantal_beugels_las";
    const TITEL: &str = "Aantal beugels over een overlappingslas";
    const ARTIKEL: &str = "art. 9.5.3(4)ii, met art. 8.7.3(1) en (8.11)";
    const FORMULE: &str = r"s \ \le\ l_0/2 \quad\Longrightarrow\quad n \ \ge\ 3";

    let niet_toetsbaar = |notes: Vec<String>, vars: Vec<NamedValue>, waarde: f64| {
        eis(
            ID,
            TITEL,
            ARTIKEL,
            FORMULE,
            inv.force_state,
            vars,
            waarde,
            "mm",
            None,
            CheckStatus::NotApplicable,
            notes,
        )
    };

    // De eis hoort bij de las én bij de dikke staaf: §9.5.3(4)ii geldt "nabij
    // overlappingslassen indien de maximale diameter van de langsstaven groter
    // is dan 14 mm". Valt een van beide weg, dan is er geen eis — en dan hoort
    // er ook geen groen vinkje te staan dat suggereert dat er iets is nagegaan.
    if inv.zone != Beugelzone::BijOverlappingslas {
        return niet_toetsbaar(
            vec![
                "Niet van toepassing: deze doorsnede is niet opgegeven als een doorsnede nabij een \
                 overlappingslas. §9.5.3(4)ii stelt de eis van drie beugels alleen daar."
                    .to_string(),
            ],
            Vec::new(),
            f64::NAN,
        );
    }
    if !(inv.phi_l_max_mm > PHI_L_DREMPEL_LAS_9_5_3_MM) {
        return niet_toetsbaar(
            vec![format!(
                "Niet van toepassing: §9.5.3(4)ii geldt alleen als de maximale diameter van de \
                 langsstaven groter is dan {} mm; hier is Φ_l,max = {} mm.",
                g(PHI_L_DREMPEL_LAS_9_5_3_MM),
                g(inv.phi_l_max_mm)
            )],
            vec![nv("Φ_l,max", inv.phi_l_max_mm, "mm")],
            f64::NAN,
        );
    }
    if !(inv.phi_l_min_mm > 0.0) {
        return niet_toetsbaar(
            vec![
                "Niet te toetsen: de kleinste diameter van de langsstaven moet groter dan nul zijn; \
                 zonder Φ is de ondergrens 15·Φ van (8.11) niet te bepalen."
                    .to_string(),
            ],
            Vec::new(),
            f64::NAN,
        );
    }

    let l0_ondergrens = l0_ondergrens_8_11_mm(inv.phi_l_min_mm);
    let s_max = l0_ondergrens / (MIN_AANTAL_BEUGELS_LAS_9_5_3 as f64 - 1.0);
    let vars = vec![
        nv("Φ_l,min", inv.phi_l_min_mm, "mm"),
        nv("15·Φ_l,min", 15.0 * inv.phi_l_min_mm, "mm"),
        nv("l₀,ondergrens", l0_ondergrens, "mm"),
        nv("s_max", s_max, "mm"),
    ];
    let mut notes = vec![
        format!(
            "§9.5.3(4)ii eist ten minste {} beugels, gelijkmatig verdeeld over de \
             overlappingslengte l₀. Gelijkmatig verdeeld betekent {} tussenruimten, dus de eis is \
             s ≤ l₀/{}.",
            MIN_AANTAL_BEUGELS_LAS_9_5_3,
            MIN_AANTAL_BEUGELS_LAS_9_5_3 - 1,
            MIN_AANTAL_BEUGELS_LAS_9_5_3 - 1
        ),
        format!(
            "l₀ zelf is geen invoer — §8.7.3(1) bepaalt hem met (8.10) uit l_b,rqd en de \
             coëfficiënten α₁ tot en met α₆. Wat wél vaststaat is de ondergrens van (8.11): \
             l₀ ≥ max{{0,3·α₆·l_b,rqd ; 15·Φ ; 200 mm}}, en met α₆ ≥ 1 dus altijd \
             l₀ ≥ max{{15·Φ ; 200 mm}} = max{{{} ; 200}} = {} mm.",
            g(15.0 * inv.phi_l_min_mm),
            g(l0_ondergrens)
        ),
        "Φ in (8.11) is de diameter van de overlappende staaf. Welke staven worden gelast is geen \
         invoer, dus hier staat de KLEINSTE aanwezige langsstaafdiameter: die geeft de enige \
         ondergrens die hoe dan ook geldt."
            .to_string(),
    ];

    match inv.s_dwars_mm {
        Some(s) if s > 0.0 => {
            if s <= s_max + 1e-9 {
                let (uc, _) = uc_maximum(s, s_max, r"s / (l_0/2)");
                let mut vars = vars;
                vars.insert(0, nv("s", s, "mm"));
                notes.push(format!(
                    "s = {} mm ≤ {} mm: over de kortst mogelijke overlapping passen er al {} \
                     beugels, en de werkelijke l₀ kan alleen langer zijn. De eis is daarmee \
                     gehaald, wat l₀ ook is.",
                    g(s),
                    g(s_max),
                    MIN_AANTAL_BEUGELS_LAS_9_5_3
                ));
                eis(
                    ID,
                    TITEL,
                    ARTIKEL,
                    FORMULE,
                    inv.force_state,
                    vars,
                    s_max,
                    "mm",
                    Some(uc),
                    CheckStatus::Ok,
                    notes,
                )
            } else {
                let mut vars = vars;
                vars.insert(0, nv("s", s, "mm"));
                notes.push(format!(
                    "s = {} mm > {} mm: met de ondergrens van l₀ is NIET aan te tonen dat er drie \
                     beugels over de las staan. Dit is nadrukkelijk geen afkeuring — de \
                     werkelijke overlappingslengte is doorgaans een veelvoud van die ondergrens. \
                     Niet te toetsen zonder l₀ volgens §8.7.3(1); reken hem met de hand na, of \
                     leg ten minste {} beugels gelijkmatig over de las.",
                    g(s),
                    g(s_max),
                    MIN_AANTAL_BEUGELS_LAS_9_5_3
                ));
                niet_toetsbaar(notes, vars, s_max)
            }
        }
        _ => {
            notes.push(
                "Niet te toetsen: er is geen hart-op-hartafstand van de dwarswapening opgegeven."
                    .to_string(),
            );
            niet_toetsbaar(notes, vars, s_max)
        }
    }
}

/// §9.5.2(4) — het aantal staven dat een hoek van de doorsnede bezet.
///
/// "Voor kolommen met een veelhoekige dwarsdoorsnede behoort ten minste één
/// staaf in iedere hoek te zijn geplaatst." Een rechthoek heeft er vier. De
/// tweede zin van het lid ("Het aantal langsstaven in cirkelvormige kolommen
/// behoort niet kleiner te zijn dan vier") komt op hetzelfde getal uit; ronde
/// kolommen kent dit model niet, en dat staat in de kanttekening.
pub const MIN_HOEKSTAVEN_9_5_2: u32 = 4;

/// §9.5.3(6) — de grootste afstand van een staaf tot een opgesloten staaf, mm.
///
/// "Geen enkele staaf binnen een drukzone behoort verder dan 150 mm vanaf een
/// opgesloten staaf te liggen." Zwarte EN-tekst; de nationale bijlage wijzigt
/// §9.5.3(6) niet.
pub const MAX_AFSTAND_TOT_OPGESLOTEN_STAAF_MM: f64 = 150.0;

/// §9.5.2(4) — in iedere hoek een staaf.
///
/// Telt de staven die volgens [`crate::ReinforcementCage::staafposities`] een
/// hoek bezetten en houdt dat aantal tegen de vier hoeken van een rechthoek.
/// Een rij met maar ÉÉN staaf bezet geen hoek: die staat in het midden. Zo
/// valt een korf met 1Ø20 onder en 1Ø20 boven terecht af, terwijl hij op A_s
/// misschien ruim voldoet.
pub fn hoekstaven_9_5_2(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let artikel = "art. 9.5.2(4)";
    let formule = r"n_{\text{hoek}} \ \ge\ 4";
    let mut notes = vec![
        "\"Voor kolommen met een veelhoekige dwarsdoorsnede behoort ten minste één staaf in \
         iedere hoek te zijn geplaatst. Het aantal langsstaven in cirkelvormige kolommen behoort \
         niet kleiner te zijn dan vier.\" Zwarte EN-tekst; de nationale bijlage wijzigt §9.5.2(4) \
         niet."
            .to_string(),
        "Als hoekstaaf telt de buitenste staaf van de onder- en van de bovenrij. Een rij met één \
         staaf bezet geen hoek — die staat in het midden van de rij — en de zijstaven liggen \
         tussen de hoeken in. Een rechthoek heeft dus vier hoekstaven zodra de onder- én de \
         bovenrij elk ten minste twee staven tellen."
            .to_string(),
        "Ronde kolommen kent dit doorsnedemodel niet; de tweede zin van het lid komt op hetzelfde \
         getal vier uit, dus de toets is voor beide vormen dezelfde grens."
            .to_string(),
    ];
    if inv.staafposities.is_empty() {
        notes.push(
            "Niet te toetsen: de ligging van de langsstaven in het vlak van de doorsnede is niet \
             meegegeven. Er wordt niets aangenomen — een korf zonder bekende staafplaatsen mag \
             hier geen groen vinkje krijgen."
                .to_string(),
        );
        return eis(
            "9.5.2_hoekstaven",
            "Een staaf in iedere hoek",
            artikel,
            formule,
            inv.force_state,
            Vec::new(),
            f64::NAN,
            "staven",
            None,
            CheckStatus::NotApplicable,
            notes,
        );
    }
    let hoekstaven = inv.staafposities.iter().filter(|s| s.in_hoek).count() as u32;
    let (uc, status) =
        uc_minimum(hoekstaven as f64, MIN_HOEKSTAVEN_9_5_2 as f64, r"n_{\text{hoek,eis}} / n_{\text{hoek}}");
    notes.push(format!(
        "Van de {} langsstaven in de doorsnede bezetten er {hoekstaven} een hoek.",
        inv.staafposities.len()
    ));
    eis(
        "9.5.2_hoekstaven",
        "Een staaf in iedere hoek",
        artikel,
        formule,
        inv.force_state,
        vec![
            nv("n_hoek", hoekstaven as f64, "staven"),
            nv("n_hoek,eis", MIN_HOEKSTAVEN_9_5_2 as f64, "staven"),
            nv("n_langs", inv.staafposities.len() as f64, "staven"),
        ],
        hoekstaven as f64,
        "staven",
        Some(uc),
        status,
        notes,
    )
}

/// §9.5.3(6) — elke hoekstaaf opgesloten, en geen staaf verder dan 150 mm van
/// een opgesloten staaf.
///
/// Het lid heeft twee zinnen en ze worden allebei getoetst.
///
/// 1. "Elke langsstaaf of staafbundel in een hoek behoort op zijn plaats te
///    zijn gehouden door dwarswapening." Zonder beugel is er niets dat een
///    hoekstaaf op zijn plaats houdt; dan faalt de eis, en niet omdat er iets
///    ontbreekt maar omdat er iets NIET LIGT.
/// 2. "Geen enkele staaf binnen een drukzone behoort verder dan 150 mm vanaf
///    een opgesloten staaf te liggen." Voor elke staaf wordt de kleinste
///    hart-op-hartafstand tot een opgesloten staaf bepaald; de grootste
///    daarvan is de maatgevende maat.
///
/// # Wélke staven als opgesloten gelden
///
/// Bij ÉÉN gesloten beugel — twee benen — staat dat vast: de vier staven in de
/// beugelhoeken. Meer benen (een tweede beugel, een haarspeld) sluiten ook
/// staven op, maar wáár die benen zitten is in dit model geen invoer:
/// [`Self::n_beugelbenen`] is een AANTAL en geen ligging. Dan wordt de toets
/// niet gedaan alsof die benen er niet zijn — dat zou een kolom afkeuren die
/// juist netjes is gedetailleerd — maar levert hij
/// [`CheckStatus::NotApplicable`] met de gemeten afstand erbij, zodat de lezer
/// ziet hoe ver het zonder die benen zou zijn. Niet groen, niet rood, en met
/// de reden erbij.
///
/// # "Binnen een drukzone" geldt hier voor ALLE langsstaven
///
/// Welk deel van de doorsnede gedrukt is, hangt van het belastinggeval af en
/// verschilt per combinatie; de eis op alle staven leggen kan nooit te ruim
/// zijn.
pub fn opgesloten_staven_9_5_3(inv: &KolomdetailleringInvoer) -> ResistanceCalc {
    let artikel = "art. 9.5.3(6)";
    let formule = r"a_{\max} \ \le\ 150\ \text{mm}";
    let id = "9.5.3_opgesloten_staven";
    let titel = "Opgesloten staven en de 150 mm-regel";
    let mut notes = vec![
        "\"Elke langsstaaf of staafbundel in een hoek behoort op zijn plaats te zijn gehouden \
         door dwarswapening. Geen enkele staaf binnen een drukzone behoort verder dan 150 mm \
         vanaf een opgesloten staaf te liggen.\" Zwarte EN-tekst; de nationale bijlage wijzigt \
         §9.5.3(6) niet."
            .to_string(),
        "Als OPGESLOTEN gelden hier de vier staven in de beugelhoeken. Bij één gesloten beugel — \
         twee benen — zijn dat er precies vier en is de toets exact."
            .to_string(),
        "\"Binnen een drukzone\" is hier op ALLE langsstaven toegepast. Welk deel van de \
         doorsnede gedrukt is, verschilt per belastingcombinatie; de eis op alle staven leggen \
         kan nooit te ruim zijn."
            .to_string(),
    ];
    if inv.staafposities.is_empty() {
        notes.push(
            "Niet te toetsen: de ligging van de langsstaven in het vlak van de doorsnede is niet \
             meegegeven. Zonder die plaatsen is er geen afstand te meten, en er wordt niets \
             aangenomen."
                .to_string(),
        );
        return eis(
            id,
            titel,
            artikel,
            formule,
            inv.force_state,
            Vec::new(),
            f64::NAN,
            "mm",
            None,
            CheckStatus::NotApplicable,
            notes,
        );
    }
    // De eerste zin. Geen beugel = geen dwarswapening die een hoekstaaf op zijn
    // plaats houdt. Dat is geen ontbrekend gegeven maar een afkeuring: de
    // beugeldiameter 0 zegt dat er niets ligt.
    let beugel = inv.phi_dwars_mm.filter(|d| *d > 0.0);
    if beugel.is_none() {
        notes.push(
            "AFGEKEURD op de eerste zin: er is geen dwarswapening. Zonder beugel wordt geen enkele \
             hoekstaaf op zijn plaats gehouden, en dan is de tweede zin niet eens aan de orde — er \
             is geen opgesloten staaf om vanaf te meten."
                .to_string(),
        );
        return eis(
            id,
            titel,
            artikel,
            formule,
            inv.force_state,
            vec![nv("n_langs", inv.staafposities.len() as f64, "staven")],
            f64::INFINITY,
            "mm",
            None,
            CheckStatus::NotOk,
            notes,
        );
    }
    let opgesloten: Vec<&Staafpositie> = inv.staafposities.iter().filter(|s| s.in_hoek).collect();
    if opgesloten.is_empty() {
        notes.push(
            "AFGEKEURD op de eerste zin: er staat in geen enkele hoek een staaf, dus er is geen \
             opgesloten staaf. Zie ook §9.5.2(4) hierboven."
                .to_string(),
        );
        return eis(
            id,
            titel,
            artikel,
            formule,
            inv.force_state,
            vec![nv("n_langs", inv.staafposities.len() as f64, "staven")],
            f64::INFINITY,
            "mm",
            None,
            CheckStatus::NotOk,
            notes,
        );
    }
    // De tweede zin: per staaf de kleinste afstand tot een opgesloten staaf, en
    // daarvan de grootste. Een opgesloten staaf zelf levert 0 — hij ís
    // opgesloten.
    let a_max = inv
        .staafposities
        .iter()
        .map(|s| {
            opgesloten.iter().map(|h| s.afstand_mm(h)).fold(f64::INFINITY, f64::min)
        })
        .fold(0.0_f64, f64::max);
    notes.push(format!(
        "Er staan {} langsstaven in de doorsnede, waarvan {} in een hoek en dus opgesloten door \
         de beugel Ø{} mm. De staaf die het verst van een opgesloten staaf ligt, ligt er {} mm \
         vandaan.",
        inv.staafposities.len(),
        opgesloten.len(),
        g(beugel.expect("hierboven gecontroleerd")),
        g(a_max)
    ));
    let vars = vec![
        nv("a_max", a_max, "mm"),
        nv("a_eis", MAX_AFSTAND_TOT_OPGESLOTEN_STAAF_MM, "mm"),
        nv("n_langs", inv.staafposities.len() as f64, "staven"),
        nv("n_hoek", opgesloten.len() as f64, "staven"),
    ];
    // Meer dan twee benen: er zijn tussenbeugels of haarspelden, en die sluiten
    // staven op die deze toets niet kan zien. Rood zetten zou een net
    // gedetailleerde kolom afkeuren, groen zetten zou een niet-gedetailleerde
    // goedkeuren. Dus geen van beide, met de gemeten afstand erbij.
    if inv.n_beugelbenen.is_some_and(|n| n > 2) {
        notes.push(format!(
            "Niet te toetsen: er zijn {} beugelbenen opgegeven. Alles boven twee betekent een \
             tussenbeugel of een haarspeld, en die sluit staven op die hier niet als opgesloten \
             gelden — hun ligging is in dit model geen invoer. De {} mm hierboven is dus de \
             afstand ZONDER die extra benen; met de hand na te gaan.",
            inv.n_beugelbenen.unwrap_or_default(),
            g(a_max)
        ));
        return eis(
            id,
            titel,
            artikel,
            formule,
            inv.force_state,
            vars,
            a_max,
            "mm",
            None,
            CheckStatus::NotApplicable,
            notes,
        );
    }
    let (uc, status) = uc_maximum(a_max, MAX_AFSTAND_TOT_OPGESLOTEN_STAAF_MM, r"a_{\max} / 150");
    eis(
        id,
        titel,
        artikel,
        formule,
        inv.force_state,
        vars,
        a_max,
        "mm",
        Some(uc),
        status,
        notes,
    )
}

/// Alle §9.5-toetsen die met het huidige model te maken zijn, op een rij.
///
/// **Nog steeds niet compleet, en dat staat er ook bij.** §9.5.3(2) (de
/// verankering van de beugeluiteinden, §8.5 met figuur 8.5) en §9.5.3(5) (de
/// richtingsverandering van de langsstaven) vragen invoer die dit model niet
/// draagt; zij staan met hun reden in [`niet_getoetste_9_5_eisen`].
///
/// §9.5.3(4)ii — het AANTAL beugels over een overlappingslas — is er sinds
/// [`aantal_beugels_las_9_5_3`] wél bij, maar EENZIJDIG: hij bewijst dat er
/// drie beugels passen zolang s binnen de helft van de gegarandeerde ondergrens
/// van l₀ blijft, en levert daarbuiten [`CheckStatus::NotApplicable`] met de
/// reden. De werkelijke l₀ van §8.7.3 is geen invoer.
///
/// §9.5.2(4) en §9.5.3(6) zitten er sinds de korf staven per zijde kent wél
/// bij. Zij leveren [`CheckStatus::NotApplicable`] zodra
/// [`KolomdetailleringInvoer::staafposities`] leeg is — dan is de ligging niet
/// bekend en wordt er niets aangenomen.
pub fn kolomdetailleringstoetsen(inv: &KolomdetailleringInvoer) -> Vec<ResistanceCalc> {
    vec![
        toepassingsgebied_9_5_1(inv),
        min_dwarsafmeting_9_5_1(inv),
        min_diameter_langsstaaf_9_5_2(inv),
        as_min_9_5_2(inv),
        as_max_9_5_2(inv),
        hoekstaven_9_5_2(inv),
        min_diameter_dwarswapening_9_5_3(inv),
        s_cl_tmax_9_5_3(inv),
        aantal_beugels_las_9_5_3(inv),
        opgesloten_staven_9_5_3(inv),
    ]
}

/// De id's van de §9.5-eisen, in de volgorde van
/// [`kolomdetailleringstoetsen`].
///
/// Waarom deze lijst bestaat: de laag die de MAATGEVENDE toets van een staaf
/// kiest, moet een detailleringseis kunnen herkennen. Een eis die VOLDOET
/// begrenst het ontwerp niet — hij is uitgevoerd — en hoort dus niet als
/// "maatgevend" in de samenvattingstabel te belanden met een unity check die
/// geen benuttingsgraad is; een eis die FAALT hoort er wél aan mee te doen.
/// Dezelfde redenering en dezelfde vorm als
/// [`crate::detaillering::DETAILLERINGSTOETS_IDS`] voor §9.2. Twee lijsten en
/// niet één, omdat §9.2 de BALK is en §9.5 de KOLOM: een staaf krijgt de ene
/// reeks of de andere, nooit allebei.
pub const KOLOMDETAILLERINGSTOETS_IDS: [&str; 10] = [
    "9.5.1_toepassingsgebied",
    "9.5.1_min_dwarsafmeting",
    "9.5.2_min_diameter_langs",
    "9.5.2_as_min",
    "9.5.2_as_max",
    "9.5.2_hoekstaven",
    "9.5.3_min_diameter_dwars",
    "9.5.3_s_cl_tmax",
    "9.5.3_aantal_beugels_las",
    "9.5.3_opgesloten_staven",
];

/// Is `id` de id van een kolomdetailleringseis (§9.5)?
pub fn is_kolomdetailleringstoets(id: &str) -> bool {
    KOLOMDETAILLERINGSTOETS_IDS.contains(&id)
}

/// De §9.5-eisen die deze module NIET toetst, met de reden. Bedoeld om
/// letterlijk in het rapport te zetten: een detailleringshoofdstuk dat zwijgt
/// over wat het niet heeft nagekeken, is misleidend.
pub fn niet_getoetste_9_5_eisen() -> Vec<String> {
    vec![
        "§9.5.3(2) — de dwarswapening behoort voldoende te zijn verankerd. Wat \"voldoende\" is, \
         staat in §8.5: de verankering gebeurt door ombuigingen en haken of met aangelaste \
         dwarswapening, binnen een haak of ombuiging hoort een staaf te zijn aangebracht, en de \
         vorm moet overeenkomen met figuur 8.5. Dat zijn eisen aan het UITEINDE van de beugel — \
         de ombuigingshoek, de rechte verlenging erachter, de las — en geen van die drie is \
         invoer van dit model; de korf draagt van de beugel alleen de diameter, de afstand en het \
         aantal benen."
            .to_string(),
        "§9.5.3(5) — als de richting van de langsstaven verandert (bijvoorbeeld bij een \
         verandering in de kolomafmeting) moet de beugelafstand worden berekend op de daarbij \
         optredende dwarskrachten; verwaarloosbaar bij een richtingsverandering van ten hoogste 1 \
         op 12. Niet getoetst: elke staaf in dit model heeft één prismatische doorsnede over haar \
         hele lengte, dus een richtingsverandering bestaat er niet in. Waar zij in werkelijkheid \
         zit — op de aansluiting met het kolomdeel erboven of eronder — kent het model noch de \
         versprongen maat noch de staafgeometrie."
            .to_string(),
    ]
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests bij de losse formules. De handberekeningen staan in
// tests/kolom_5_8.rs.
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    /// (5.15) met k₁ = k₂ = 0 moet de volledige inklemming van figuur 5.7 d)
    /// opleveren: l₀ = 0,5·l. Met de hand: elke haakje is 1 + 0/0,45 = 1, dus
    /// √(1·1) = 1 en l₀ = 0,5·l.
    #[test]
    fn vergelijking_5_15_bij_starre_inklemming_geeft_een_halve_lengte() {
        let l0 = l0_geschoord_5_15(0.0, 0.0, 4000.0);
        assert!((l0 - 2000.0).abs() < 1e-9, "l₀ = {l0}");
    }

    /// (5.15) met k → ∞ nadert figuur 5.7 a): l₀ = l. Met de hand: k/(0,45+k)
    /// nadert 1, dus elk haakje nadert 2 en √(2·2) = 2; l₀ = 0,5·2·l = l.
    #[test]
    fn vergelijking_5_15_bij_geen_inklemming_nadert_de_volle_lengte() {
        let l0 = l0_geschoord_5_15(1.0e9, 1.0e9, 4000.0);
        assert!((l0 - 4000.0).abs() < 1.0e-3, "l₀ = {l0}");
    }

    /// (5.16) met k₁ = k₂ = 0 geeft figuur 5.7 e): l₀ = l. Beide takken worden
    /// 1, dus het maximum is 1.
    #[test]
    fn vergelijking_5_16_bij_starre_inklemming_geeft_de_volle_lengte() {
        let l0 = l0_ongeschoord_5_16(0.0, 0.0, 4000.0);
        assert!((l0 - 4000.0).abs() < 1e-9, "l₀ = {l0}");
    }

    /// Het verschil tussen (5.15) en (5.16) bij dezelfde inklemming is de kern
    /// van dit spoor. Met k₁ = k₂ = 0,1 (de aanbevolen ondergrens):
    ///   (5.15): 1 + 0,1/0,55 = 1,181818…; √(1,181818² ) = 1,181818;
    ///           l₀ = 0,5·1,181818·l = 0,590909·l
    ///   (5.16): wortel-tak √(1 + 10·0,01/0,2) = √1,5 = 1,224745
    ///           product-tak (1 + 0,1/1,1)² = 1,090909² = 1,190083
    ///           max = 1,224745 → l₀ = 1,224745·l
    /// De ongeschoorde kolom krijgt dus een ruim twee keer zo grote kniklengte.
    #[test]
    fn geschoord_en_ongeschoord_verschillen_ruim_een_factor_twee() {
        let l = 3000.0;
        let geschoord = l0_geschoord_5_15(0.1, 0.1, l);
        let ongeschoord = l0_ongeschoord_5_16(0.1, 0.1, l);
        assert!((geschoord - 0.590909 * l).abs() < 1e-3, "geschoord {geschoord}");
        assert!((ongeschoord - 1.224745 * l).abs() < 1e-3, "ongeschoord {ongeschoord}");
        assert!(ongeschoord / geschoord > 2.0);
    }

    /// De aanbevolen ondergrens van 0,1 wordt toegepast én gemeld.
    #[test]
    fn ondergrens_van_k_wordt_toegepast_en_gemeld() {
        assert_eq!(k_begrensd(0.05), (0.1, true));
        assert_eq!(k_begrensd(0.5), (0.5, false));
    }

    /// i = h/√12 voor een rechthoek, en dezelfde uitkomst via I en A.
    /// Met de hand: h = 400 → i = 400/3,4641 = 115,470 mm.
    #[test]
    fn traagheidsstraal_rechthoek_klopt_met_i_en_a() {
        let b = 300.0;
        let h = 400.0;
        let i_direct = traagheidsstraal_rechthoek_mm(h);
        let i_via = traagheidsstraal_mm(b * h.powi(3) / 12.0, b * h).unwrap();
        assert!((i_direct - 115.4700538).abs() < 1e-6, "i = {i_direct}");
        assert!((i_direct - i_via).abs() < 1e-9);
    }

    /// Een ongeschoord element krijgt C = 0,7, óók als de eindmomenten bekend
    /// zijn: "voor niet-geschoorde elementen in het algemeen" kent geen
    /// uitzondering.
    #[test]
    fn ongeschoord_krijgt_altijd_c_is_nul_komma_zeven() {
        let g = grondslag_c(Schoring::Ongeschoord, false, Some((-40.0, 80.0))).unwrap();
        assert_eq!(g, Cgrondslag::OngeschoordInHetAlgemeen);
        assert!((g.c() - 0.7).abs() < 1e-12);
    }

    /// Bij een geschoord element met tegengesteld tekenende eindmomenten wordt
    /// C groter dan 1,7. Met de hand: r_m = −40/80 = −0,5 → C = 1,7 + 0,5 = 2,2.
    #[test]
    fn geschoord_met_tegengestelde_eindmomenten_geeft_c_groter_dan_een_komma_zeven() {
        let g = grondslag_c(Schoring::Geschoord, false, Some((-40.0, 80.0))).unwrap();
        assert!((g.c() - 2.2).abs() < 1e-12, "C = {}", g.c());
    }

    /// |M₀₂| ≥ |M₀₁| is een eis van de norm, geen suggestie.
    #[test]
    fn omgekeerde_eindmomenten_worden_geweigerd() {
        let r = grondslag_c(Schoring::Geschoord, false, Some((80.0, 40.0)));
        assert!(r.is_err(), "verwacht een weigering, kreeg {r:?}");
    }

    /// λ_lim zonder normaaldruk bestaat niet; de functie weigert in plaats van
    /// oneindig terug te geven.
    #[test]
    fn lambda_lim_weigert_zonder_normaaldruk() {
        let nl = nationale_bijlage::NationaleBijlage::NL;
        assert!(lambda_lim_5_13n(nl, 0.7, 1.1, 0.7, 0.0).is_err());
        assert!(lambda_lim_5_13n(nl, 0.7, 1.1, 0.7, -0.2).is_err());
    }

    /// A_s,max: de NB-tak voor een kolom zonder overlappingslassen is het
    /// dubbele van de EN-aanbeveling.
    #[test]
    fn as_max_zonder_lassen_is_het_dubbele_van_de_en_aanbeveling() {
        let a_c = 300.0 * 300.0;
        assert!(
            (as_max_9_5_2_mm2(a_c, Overlappingssituatie::GeenLassen) - 0.08 * a_c).abs() < 1e-9
        );
        assert!(
            (as_max_9_5_2_mm2(a_c, Overlappingssituatie::LassenBuitenDezeDoorsnede) - 0.04 * a_c)
                .abs()
                < 1e-9
        );
    }

    /// h ≤ 4b scheidt de kolom van de wand.
    #[test]
    fn toepassingsgebied_scheidt_kolom_van_wand() {
        assert!(valt_onder_9_5(800.0, 200.0));
        assert!(!valt_onder_9_5(900.0, 200.0));
    }
}
