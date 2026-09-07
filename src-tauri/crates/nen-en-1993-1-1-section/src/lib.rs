//! NEN-EN 1993-1-1 cross-section resistance checks (article 6.2).
//! All check functions return ResistanceCalc with derivation steps.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;

pub mod classification;
pub mod compression;
pub mod bending;
pub mod shear;
pub mod combined_mv;
pub mod combined_mn;
pub mod combined_mnv;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct SteelGrade {
    pub name: &'static str,
    pub fy_mpa: f64,
    pub fu_mpa: f64,
    pub gamma_m0: f64,
    pub gamma_m1: f64,
    pub gamma_m2: f64,
}

pub const S235: SteelGrade = SteelGrade { name: "S235", fy_mpa: 235.0, fu_mpa: 360.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S275: SteelGrade = SteelGrade { name: "S275", fy_mpa: 275.0, fu_mpa: 430.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S355: SteelGrade = SteelGrade { name: "S355", fy_mpa: 355.0, fu_mpa: 510.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S420: SteelGrade = SteelGrade { name: "S420", fy_mpa: 420.0, fu_mpa: 520.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };
pub const S460: SteelGrade = SteelGrade { name: "S460", fy_mpa: 460.0, fu_mpa: 540.0, gamma_m0: 1.0, gamma_m1: 1.0, gamma_m2: 1.25 };

pub fn grade_by_name(name: &str) -> Option<SteelGrade> {
    match name {
        "S235" => Some(S235), "S275" => Some(S275), "S355" => Some(S355),
        "S420" => Some(S420), "S460" => Some(S460), _ => None,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum CheckStatus { Ok, NotOk, NotApplicable }

// `PartialEq`: een antwoordtype dat deelstappen draagt moet vergelijkbaar
// blijven — de drie-wegen-tests zetten twee antwoorden naast elkaar. Puur
// gegevens, dus de afgeleide vergelijking is de bedoelde.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct NamedValue {
    pub symbol: String,
    pub value: f64,
    pub unit: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct UnityCheck {
    pub ed: f64,
    pub rd: f64,
    pub uc: f64,
    pub formula_latex: String,
}

/// Eén stap uit de afleiding die aan een toets voorafgaat.
///
/// Een toets is zelden één formule. Een kiptoets is een keten van veertien
/// (B*, β, C₁, C₂, L_kip, S, C, k_red, M_cr, λ̄_LT, χ_LT); een betonnen
/// doorsnedetoets is er een van rekenwaarden, nuttige hoogte, krachtenevenwicht,
/// drukzonehoogte, rekverdeling, hefboomsarm en momentenevenwicht. Van zo'n
/// keten alleen de UITKOMSTEN afleveren — een rij losse getallen — is voor een
/// rapport dat een normtoets moet verantwoorden te weinig: het moet per stap
/// tonen wélke formule is gebruikt, met wélke getallen, en wáár die formule
/// staat. Een `Deelstap` draagt daarom de hele stap: de formule symbolisch,
/// dezelfde formule met de getallen ingevuld, de uitkomst met haar eenheid, en
/// de vindplaats in de norm.
///
/// **Waarom dit type hier staat en niet bij de stabiliteitstoetsen.** Het is
/// daar begonnen — de kipketen was de eerste die een afleiding nodig had — maar
/// een afleiding is geen eigenschap van stabiliteit. De betontoetsen zijn
/// weerstandstoetsen ([`ResistanceCalc`]) en hebben dezelfde keten nodig. Omdat
/// `nen-en-1993-1-1-stability` van deze crate afhangt en niet andersom, kan het
/// type alleen hier staan; de stabiliteitscrate exporteert hem onveranderd door,
/// zodat `nen_en_1993_1_1_stability::Deelstap` blijft werken. Het ts-rs-pad is
/// hetzelfde gebleven, dus de frontend ziet exact dezelfde `Deelstap.ts`.
///
/// **Waarom de ingevulde regel uit de rekenkern komt en niet uit de frontend.**
/// De frontend maakt zo'n regel voor een gewone toets door de symbolen in
/// `formula_latex` door hun waarde te vervangen (`vulGetallenIn`). Dat werkt
/// voor een formule als `N_{c,Rd} = A f_y / \gamma_{M0}`, maar de ketens hier
/// bevatten wortels met losse hoofdletters (`\sqrt{E I_z / (G I_t)}`), sommaties
/// over wapeningslagen, en eenheidsomrekeningen (kNm → N·mm) die helemaal geen
/// symbool hebben. Wie de formule kent kan de ingevulde regel exact opschrijven;
/// een tekstvervanging achteraf kan dat niet. `ingevuld_latex` is daarom in de
/// kern gevuld. Is hij leeg, dan hoort er geen ingevulde regel te staan
/// (bijvoorbeeld bij een stap die alleen uitgangspunten opsomt).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
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
    /// of `"art. 3.1.7(3) (3.19)"`. Apart veld, niet als achtervoegsel in de
    /// titel — het rapport zet hem in de rechtermarge.
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
    ///
    /// Dit veld is niet decoratief. Een afleiding die stilzwijgend een aanname
    /// doet is erger dan geen afleiding: de lezer denkt dan dat hij de hele
    /// redenering ziet. Elke aangenomen bezwijkvorm, elke vereenvoudiging en
    /// elke normgrens die NIET getoetst is, hoort hier te staan.
    pub notes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct ResistanceCalc {
    pub id: String,
    pub title: String,
    pub article: String,
    pub force_state: ForceStateSnapshot,
    pub formula_latex: String,
    pub variables: Vec<NamedValue>,
    /// De afleiding die aan deze toets voorafgaat, in de volgorde waarin het
    /// rapport haar toont. Leeg voor toetsen die geen voorafgaande keten
    /// hebben — dan verandert er niets aan de weergave. De betontoetsen vullen
    /// hem; de staal- en houttoetsen zijn één formule en laten hem leeg.
    #[serde(default)]
    pub deelstappen: Vec<Deelstap>,
    pub value: f64,
    pub unit: String,
    pub uc: Option<UnityCheck>,
    pub status: CheckStatus,
    pub notes: Vec<String>,
}
