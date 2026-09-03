//! NEN-EN 1993-1-1 §6.3 — member stability checks.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{NamedValue, UnityCheck, CheckStatus};

pub mod buckling_curve;
pub mod column_buckling;
pub mod interaction_factors;
pub mod combined_n_m;

/// Eén stap uit de afleiding die aan een toets voorafgaat.
///
/// `intermediate_values` op [`StabilityCalc`] draagt alleen de UITKOMSTEN van
/// zo'n keten: een lijstje `S = 2006 mm   C = 4,12`. Waar die getallen vandaan
/// komen staat er niet bij, en een rapport dat een normtoets moet verantwoorden
/// heeft juist dát nodig. Een `Deelstap` draagt daarom de hele stap: de formule
/// symbolisch, dezelfde formule met de getallen ingevuld, de uitkomst met haar
/// eenheid, en de vindplaats in de norm.
///
/// **Waarom de ingevulde regel uit de rekenkern komt en niet uit de frontend.**
/// De frontend maakt zo'n regel nu door de symbolen in `formula_latex` door hun
/// waarde te vervangen (`vulGetallenIn`). Dat werkt voor een formule als
/// `N_{c,Rd} = A f_y / \gamma_{M0}`, maar de NB-keten bevat wortels met losse
/// hoofdletters (`\sqrt{E I_z / (G I_t)}`) naast samengestelde symbolen, en
/// bovendien eenheidsomrekeningen (kNm → N·mm) die geen symbool hebben. Wie de
/// formule kent kan de ingevulde regel exact opschrijven; een tekstvervanging
/// achteraf kan dat niet. `ingevuld_latex` is daarom hier gevuld. Is hij leeg,
/// dan hoort er geen ingevulde regel te staan (bijvoorbeeld bij een stap die
/// alleen uitgangspunten opsomt).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct Deelstap {
    /// Stabiele sleutel, bedoeld om een stap in code of test op terug te vinden
    /// (`"m_cr"`, `"k_red"`, `"uitgangspunten"`). Geen rapporttekst.
    pub id: String,
    /// Nederlandse kop boven de stap, bijvoorbeeld "Kritiek kipmoment".
    pub titel: String,
    /// Het LaTeX-symbool van de grootheid die deze stap oplevert (`"M_{cr}"`).
    /// Leeg als de stap geen enkele grootheid oplevert.
    pub symbol: String,
    /// De vindplaats: vergelijking- of artikelnummer, bijvoorbeeld `"NB.148"`
    /// of `"NB.NB.4.3(3)"`. Apart veld, niet als achtervoegsel in de titel —
    /// het rapport zet hem in de rechtermarge.
    pub article: String,
    /// De formule symbolisch.
    pub formula_latex: String,
    /// Dezelfde formule met de getallen ingevuld. Leeg = geen ingevulde regel.
    pub ingevuld_latex: String,
    /// De grootheden die in de formule voorkomen, mét de eenheid waarin ze in
    /// díe formule staan (dus N·mm waar de formule N·mm rekent, ook als de
    /// uitgangspuntenlijst dezelfde grootheid in kNm toont).
    pub variables: Vec<NamedValue>,
    /// De uitkomst van de stap. `None` voor een stap zonder uitkomst.
    pub value: Option<f64>,
    pub unit: String,
    /// Kanttekeningen bij déze stap: welke tak van de norm geldt, waar een
    /// benadering buiten de norm om is aangehouden, welke aanname eronder ligt.
    pub notes: Vec<String>,
}

/// Mirror of ResistanceCalc but for stability checks.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct StabilityCalc {
    pub id: String,
    pub title: String,
    pub article: String,
    pub force_state: ForceStateSnapshot,
    pub formula_latex: String,
    pub variables: Vec<NamedValue>,
    pub intermediate_values: Vec<NamedValue>,
    /// De afleiding die aan deze toets voorafgaat, in de volgorde waarin het
    /// rapport haar toont. Leeg voor toetsen die geen voorafgaande keten
    /// hebben; dan verandert er niets aan de weergave.
    ///
    /// Waar deze lijst gevuld is, herhaalt `intermediate_values` haar
    /// uitkomsten: die blijft bestaan omdat toetsen en afnemers erop zoeken,
    /// maar het rapport hoort dan de deelstappen te tonen en de losse
    /// tussenwaardenregel weg te laten.
    pub deelstappen: Vec<Deelstap>,
    pub value: f64,
    pub unit: String,
    pub uc: Option<UnityCheck>,
    pub status: CheckStatus,
    pub notes: Vec<String>,
}
