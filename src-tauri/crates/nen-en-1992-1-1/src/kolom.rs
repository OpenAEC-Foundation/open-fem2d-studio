//! §5.8 — KOLOMMEN EN KNIK: kniklengte, slankheid, de slankheidsgrens waaronder
//! tweede-orde-effecten mogen vervallen, en de effectieve kruipcoëfficiënt.
//! Daarbij §9.5, de detailleringseisen die alleen voor een kolom gelden.
//!
//! Deze module beantwoordt één vraag: **moet deze kolom op tweede-orde-effecten
//! worden gerekend, en met welke kruip?** Zij rekent zelf géén tweede orde uit.
//! Dat doet de algemene methode van §5.8.6, die in deze app al bestaat
//! (fysisch niet-lineair, M-N-κ per segment). De twee vereenvoudigde methoden
//! — nominale stijfheid (§5.8.7) en nominale kromming (§5.8.8) — zijn hier
//! bewust NIET gebouwd; wat zij zouden vragen staat onderaan deze doc.
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
//!   eis met dezelfde waarde. Staat al in [`crate::factors::GAMMA_CE`].
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
//! * **§5.8.9 (dubbele buiging), §5.8.2(6) (de 10 %-regel) en de
//!   imperfecties van §5.2** — geen van drieën hier.
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
pub fn lambda_lim_5_13n(a: f64, b: f64, c: f64, n: f64) -> Result<f64, String> {
    if !(n > 0.0) {
        return Err(format!(
            "λ_lim = 20·A·B·C/√n vereist een DRUKkracht: n = N_Ed/(A_c·f_cd) is {} en dus niet \
             positief. Een element zonder normaaldruk is geen knikgeval; §5.8 is er niet op van \
             toepassing.",
            nl(n, 4)
        ));
    }
    Ok(20.0 * a * b * c / n.sqrt())
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
    pub a_standaard: bool,
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
        (Some(_), _, _) => {
            kanttekeningen.push(
                "φ(∞,t₀) is opgegeven maar M₀Eqp en/of M₀Ed niet, dus (5.19) kon niet worden \
                 ingevuld. φ_ef blijft onbekend en §5.8.3.1(1) staat dan A = 0,7 toe."
                    .to_string(),
            );
            None
        }
        _ => {
            kanttekeningen.push(
                "φ(∞,t₀) is niet opgegeven, dus (5.19) kon niet worden ingevuld. φ_ef blijft \
                 onbekend en §5.8.3.1(1) staat dan A = 0,7 toe. Let op: 0,7 is geen veilige kant \
                 maar de waarde bij φ_ef ≈ 2,14 — bij zwaardere kruip is de werkelijke A kleiner."
                    .to_string(),
            );
            None
        }
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
    let (a, a_standaard) = factor_a(phi_ef);
    let (b, b_standaard) = factor_b(Some(w));
    let c_grondslag = grondslag_c(
        inv.schoring,
        inv.eerste_orde_vooral_imperfecties_of_dwarsbelasting,
        inv.eindmomenten_knm,
    )?;
    let c = c_grondslag.c();
    let lambda_lim = lambda_lim_5_13n(a, b, c, n)?;

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
                "φ_ef is niet bepaald; §5.8.3.1(1) staat dan A = 0,7 toe. Die 0,7 is niet de \
                 veilige kant maar de waarde bij φ_ef ≈ 2,14."
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
    if k.a_standaard {
        notes_abc.push(
            "A = 0,7 is de standaardwaarde die §5.8.3.1(1) toestaat als φ_ef onbekend is."
                .to_string(),
        );
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
    /// dat aantal is hier niet getoetst.
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
                 aantal wordt hier niet getoetst."
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
/// # Wat het korfmodel hiervoor mist
///
/// [`crate::ReinforcementCage`] kent één BOVENrij en één ONDERrij. Een kolom
/// heeft staven langs alle vier de zijden, en drie van de regels hieronder
/// hangen daaraan:
///
/// * **§9.5.2(4)** — "ten minste één staaf in iedere hoek" bij een veelhoekige
///   doorsnede, en ten minste vier staven bij een ronde. Met twee rijen is niet
///   te zien of de hoeken bezet zijn; deze eis is daarom NIET gebouwd.
/// * **§9.5.3(6)** — "Elke langsstaaf of staafbundel in een hoek behoort op zijn
///   plaats te zijn gehouden door dwarswapening. Geen enkele staaf binnen een
///   drukzone behoort verder dan 150 mm vanaf een opgesloten staaf te liggen."
///   Dat vraagt de LIGGING van elke staaf in het vlak van de doorsnede, niet
///   alleen zijn hoogte. Ook niet gebouwd.
/// * **A_s** in A_s,min en A_s,max is de TOTALE langswapening. Met twee rijen is
///   dat te vullen, maar alleen als de zijstaven bij een van beide rijen worden
///   opgeteld — en dan klopt hun ligging niet meer voor de buigtoets. Daarom
///   komt A_s hier als apart getal binnen en wordt de korf niet aangesproken.
///
/// Wat een kolomkorf nodig heeft, is een derde begrip naast "boven" en "onder":
/// een rij staven per ZIJDE met hun onderlinge afstand, plus het aantal staven
/// per zijde. Zolang dat er niet is, zijn §9.5.2(4) en §9.5.3(6) niet te
/// toetsen en moet dat met zoveel woorden in het rapport staan — niet als
/// stilzwijgend groen vinkje.
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
    /// De zone waarin de beschouwde doorsnede ligt (§9.5.3(4)).
    pub zone: Beugelzone,
    /// Overlappingssituatie voor A_s,max (NB bij §9.5.2(3)).
    pub overlapping: Overlappingssituatie,
    /// **N_Ed als DRUKkracht, positief, in kN** — de norm schrijft bij (9.12N)
    /// letterlijk "de rekenwaarde van de aangrijpende normaaldrukkracht".
    pub n_ed_druk_kn: f64,
    /// f_yd, N/mm².
    pub f_yd_mpa: f64,
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
            "A_s is de TOTALE langswapening van de doorsnede, dus alle vier de zijden. Het \
             korfmodel van deze crate kent alleen een boven- en een onderrij; A_s komt daarom als \
             apart getal binnen en is niet uit de korf afgeleid."
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

/// Alle §9.5-toetsen die met het huidige model te maken zijn, op een rij.
///
/// **Niet compleet, en dat staat er ook bij.** §9.5.2(4) (een staaf in iedere
/// hoek, minimaal vier bij een ronde kolom) en §9.5.3(6) (elke hoekstaaf
/// opgesloten, geen staaf verder dan 150 mm van een opgesloten staaf) zijn niet
/// te toetsen zolang het korfmodel geen staven per zijde kent. Zie de doc bij
/// [`KolomdetailleringInvoer`]. §9.5.3(2) ("de dwarswapening behoort voldoende
/// te zijn verankerd") en §9.5.3(5) (knikken in de langsstaven) zijn
/// beoordelingen en geen rekenregels.
pub fn kolomdetailleringstoetsen(inv: &KolomdetailleringInvoer) -> Vec<ResistanceCalc> {
    vec![
        toepassingsgebied_9_5_1(inv),
        min_dwarsafmeting_9_5_1(inv),
        min_diameter_langsstaaf_9_5_2(inv),
        as_min_9_5_2(inv),
        as_max_9_5_2(inv),
        min_diameter_dwarswapening_9_5_3(inv),
        s_cl_tmax_9_5_3(inv),
    ]
}

/// De §9.5-eisen die deze module NIET toetst, met de reden. Bedoeld om
/// letterlijk in het rapport te zetten: een detailleringshoofdstuk dat zwijgt
/// over wat het niet heeft nagekeken, is misleidend.
pub fn niet_getoetste_9_5_eisen() -> Vec<String> {
    vec![
        "§9.5.2(4) — ten minste één staaf in iedere hoek van een veelhoekige doorsnede, en ten \
         minste vier langsstaven in een ronde kolom. Niet getoetst: het wapeningsmodel kent alleen \
         een boven- en een onderrij en weet niet welke hoeken bezet zijn."
            .to_string(),
        "§9.5.3(2) — de dwarswapening behoort voldoende te zijn verankerd. Een beoordeling van de \
         detaillering, geen rekenregel."
            .to_string(),
        "§9.5.3(4)ii — bij een overlappingslas met Φ_l > 14 mm zijn ten minste drie beugels \
         vereist, gelijkmatig over de overlappingslengte verdeeld. Het AANTAL beugels is niet \
         getoetst; alleen de gereduceerde afstand."
            .to_string(),
        "§9.5.3(5) — bij een richtingsverandering van de langsstaven moet de beugelafstand op de \
         dwarskrachten worden berekend; verwaarloosbaar bij een verandering van ten hoogste 1 op \
         12. Niet getoetst: de kolomafmeting per verdieping is geen invoer."
            .to_string(),
        "§9.5.3(6) — elke hoekstaaf moet door dwarswapening op zijn plaats worden gehouden, en \
         geen staaf in een drukzone mag verder dan 150 mm van een opgesloten staaf liggen. Niet \
         getoetst: dat vraagt de ligging van elke staaf in het vlak van de doorsnede."
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
        assert!(lambda_lim_5_13n(0.7, 1.1, 0.7, 0.0).is_err());
        assert!(lambda_lim_5_13n(0.7, 1.1, 0.7, -0.2).is_err());
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
