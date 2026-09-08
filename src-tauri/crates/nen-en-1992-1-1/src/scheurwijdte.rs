//! §7.3 Scheurbeheersing — grenswaarde w_max, minimumwapening (7.3.2), de
//! tabelweg zonder directe berekening (7.3.3) en de rekenweg (7.3.4).
//!
//! # Het zwaartepunt van dit hoofdstuk: de nationale bijlage vervangt de combinatie
//!
//! De Eurocode toetst de scheurwijdte van gewapend beton onder de
//! **quasi-blijvende** belastingscombinatie. De Nederlandse bijlage haalt die
//! tekst én de hele aanbevolen tabel 7.1N door en zet er een geamendeerde,
//! normatieve tabel 7.1N voor in de plaats waarin voor **alle drie** de
//! elementtypen — dus ook voor gewoon gewapend beton — de **FREQUENTE**
//! belastingscombinatie geldt. Woordelijk uit de NB-tabel: de drie kolomkoppen
//! luiden alle drie "Frequente belastingscombinatie".
//!
//! Wie hier 6.16 (quasi-blijvend) invult in plaats van 6.15 (frequent) rekent
//! structureel te gunstig. Deze module rekent daarom nergens zelf een
//! belastingscombinatie uit, maar eist de staalspanning van de aanroeper en
//! schrijft in elke afleiding op onder wélke combinatie zij hoort te zijn
//! bepaald. Zie [`COMBINATIE_SCHEURWIJDTE`].
//!
//! De grenswaarden zelf zijn óók andere getallen dan de EN: voor betonstaal
//! 0,40 / 0,30 / 0,20 mm aflopend met de milieuklasse, en voor de kolommen met
//! voorspanstaal met aanhechting 0,30 / 0,20 / 0,10 mm respectievelijk
//! Δσ_p ≤ ξ·275 / ξ·175 / ξ·75 MPa. Zie [`w_max_mm`].
//!
//! # Eén uitzondering binnen hetzelfde hoofdstuk
//!
//! h_cr in (7.6N)/(7.7N) staat in **niet-geamendeerde** EN-tekst en is daar
//! uitdrukkelijk gedefinieerd onder de **quasi-blijvende** combinatie. De
//! tabelweg van 7.3.3 heeft dus twee verschillende BGT-combinaties nodig:
//! frequent voor σ_s en w_max, quasi-blijvend voor h_cr. Dat is geen slordigheid
//! in deze module maar een eigenschap van de norm; [`Scheurinvoer::h_cr_mm`]
//! draagt het apart.
//!
//! # Wat deze module NIET doet
//!
//! * **(7.7N) — de aanpassing van de staafdiameter bij zuivere axiale trek —
//!   is niet geïmplementeerd.** De formule staat in de gebruikte PDF-uitgave
//!   uitsluitend als raster van 189 × 28 pixels; op die bronresolutie is zij
//!   niet met zekerheid te lezen. Een verkeerd overgenomen deler is bij een
//!   constructeur een verkeerde berekening, dus levert
//!   [`aangepaste_staafdiameter`] voor het trekgeval een leesbare `Err` in
//!   plaats van een getal. (7.6N), voor buiging, is wél glyph voor glyph
//!   geverifieerd en is geïmplementeerd.
//! * **Voorspanning.** ξ_1, A_p′, Δσ_p en (7.5) zitten er niet in: ξ komt uit
//!   tabel 6.2 (§6.8.2), die buiten dit hoofdstuk valt, en op ξ_1 in (7.10)
//!   staat in deze uitgave geen aantoonbare macht 2. In (7.10) geldt hier dus
//!   ρ_p,eff = A_s / A_c,eff, wat voor gewoon gewapend beton exact is.
//! * **(7.15)** (twee orthogonale wapeningsrichtingen) en **7.3.4(5)** (wand met
//!   vroegtijdige thermische krimp) zijn als losse functies aanwezig, maar geen
//!   enkele toets kiest ze zelf: beide vragen gegevens (de hoek θ, de
//!   wandhoogte, de belemmering aan de onderzijde) die het model niet kent.
//!
//! Elke overgenomen waarde draagt haar vindplaats in het commentaar. De
//! normtekst is gelezen uit de PDF-uitgave met `pdftotext -raw`; de
//! vergelijkingen die daar als afbeelding staan ((7.2), (7.3), (7.6N), (7.9)
//! en de NB-formule voor k_x) zijn uit de ingebedde rasters van de PDF gelezen
//! en glyph voor glyph nagelopen.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, Deelstap, NamedValue, ResistanceCalc, UnityCheck};

use crate::data::{ConcreteClass, ReinforcementGrade};
use crate::dekking::ExposureClass;
use crate::factors::E_S;
use crate::section::{ConcreteSection, ReinforcementCage};

// ---------------------------------------------------------------------------
// Kleine hulpjes
// ---------------------------------------------------------------------------

fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue {
        symbol: symbol.to_string(),
        value,
        unit: unit.to_string(),
    }
}

fn status_for(uc: f64) -> CheckStatus {
    if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    }
}

/// Eén stap van de afleiding. De volgorde van de argumenten is die van
/// [`Deelstap`] zelf, zodat de bouwregels leesbaar blijven.
#[allow(clippy::too_many_arguments)]
fn stap(
    id: &str,
    titel: &str,
    symbol: &str,
    article: &str,
    formula_latex: &str,
    ingevuld_latex: String,
    variables: Vec<NamedValue>,
    value: Option<f64>,
    unit: &str,
    notes: Vec<String>,
) -> Deelstap {
    Deelstap {
        id: id.to_string(),
        titel: titel.to_string(),
        symbol: symbol.to_string(),
        article: article.to_string(),
        formula_latex: formula_latex.to_string(),
        ingevuld_latex,
        variables,
        value,
        unit: unit.to_string(),
        notes,
    }
}

// ---------------------------------------------------------------------------
// 7.3.1 — de grenswaarde w_max en de belastingscombinatie
// ---------------------------------------------------------------------------

/// De belastingscombinatie waaronder §7.3 in Nederland moet worden getoetst.
///
/// De geamendeerde tabel 7.1N van de nationale bijlage kent drie kolommen en
/// alle drie dragen de kop "Frequente belastingscombinatie". De doorgehaalde
/// EN-tekst schreef voor gewapend beton de quasi-blijvende combinatie voor;
/// die geldt in Nederland dus NIET meer.
pub const COMBINATIE_SCHEURWIJDTE: &str =
    "frequente belastingscombinatie (NB bij 7.3.1(5), tabel 7.1N)";

/// De combinatie waaronder h_cr in (7.6N)/(7.7N) hoort te worden bepaald.
///
/// Dit is de enige plek binnen §7.3 waar de quasi-blijvende combinatie
/// overblijft: de definitie van h_cr staat in niet-geamendeerde EN-tekst.
pub const COMBINATIE_H_CR: &str =
    "quasi-blijvende belastingscombinatie (7.3.3(2), niet geamendeerd)";

/// Welke kolom van de geamendeerde tabel 7.1N geldt.
///
/// De NB-tabel deelt niet naar "gewapend of voorgespannen" maar naar wélk
/// staal de scheurvorming beheerst. Dat is een andere indeling dan de EN had,
/// en de kolommen mogen niet cel voor cel met de EN-tabel worden gemengd.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Elementtype {
    /// "Elementen met betonstaal en/of voorspanstaal zonder aanhechting."
    /// Gewoon gewapend beton valt hier onder. Ook elementen met uitsluitend
    /// spanelementen zónder aanhechting, zie 7.3.1(6).
    Betonstaal,
    /// "Elementen met een combinatie van betonstaal en voorspanstaal met
    /// aanhechting." Zie ook 7.3.1(6) voor elementen met spanelementen mét en
    /// zónder aanhechting door elkaar.
    CombinatieMetAanhechting,
    /// "Elementen met uitsluitend voorspanstaal met aanhechting." Deze kolom
    /// geeft géén w_max maar een grens aan Δσ_p; zie [`delta_sigma_p_grens`].
    UitsluitendVoorspanstaalMetAanhechting,
}

/// De drie milieurijen van tabel 7.1N. XF- en XA-klassen komen in de tabel
/// niet voor en leveren daarom `None`: die elementen hebben altijd óók een
/// carbonatatie- of chlorideklasse, en dié bepaalt w_max.
fn rij_van_tabel_7_1n(klasse: ExposureClass) -> Option<usize> {
    use ExposureClass::*;
    match klasse {
        X0 | XC1 => Some(0),
        XC2 | XC3 | XC4 => Some(1),
        XD1 | XD2 | XD3 | XS1 | XS2 | XS3 => Some(2),
        XF1 | XF2 | XF3 | XF4 | XA1 | XA2 | XA3 => None,
    }
}

/// w_max in mm volgens de door de nationale bijlage **geamendeerde** tabel
/// 7.1N, onder de FREQUENTE belastingscombinatie.
///
/// | milieuklasse | betonstaal | combinatie met aanhechting |
/// |---|---|---|
/// | X0, XC1 | 0,40 mm | 0,30 mm |
/// | XC2, XC3, XC4 | 0,30 mm | 0,20 mm |
/// | XD1–XD3, XS1–XS3 | 0,20 mm | 0,10 mm |
///
/// Dit zijn NIET de EN-getallen: de EN-tabel is in de Nederlandse uitgave in
/// zijn geheel doorgehaald. Neem de tabel als geheel over.
///
/// `Err` bij XF/XA (staan niet in tabel 7.1N) en bij
/// [`Elementtype::UitsluitendVoorspanstaalMetAanhechting`] (die kolom geeft een
/// spanningsgrens, geen scheurwijdte).
pub fn w_max_mm(klasse: ExposureClass, elementtype: Elementtype) -> Result<f64, String> {
    let rij = rij_van_tabel_7_1n(klasse).ok_or_else(|| {
        format!(
            "milieuklasse {klasse:?} komt niet voor in tabel 7.1N; geef de \
             carbonatatie- of chlorideklasse op die voor deze doorsnede geldt"
        )
    })?;
    match elementtype {
        // Kolom 1 van de geamendeerde tabel 7.1N.
        Elementtype::Betonstaal => Ok([0.40, 0.30, 0.20][rij]),
        // Kolom 2 van de geamendeerde tabel 7.1N.
        Elementtype::CombinatieMetAanhechting => Ok([0.30, 0.20, 0.10][rij]),
        Elementtype::UitsluitendVoorspanstaalMetAanhechting => Err(
            "voor elementen met uitsluitend voorspanstaal met aanhechting geeft de \
             geamendeerde tabel 7.1N geen scheurwijdte maar een grens aan de \
             spanningsverandering Δσ_p; gebruik delta_sigma_p_grens()"
                .to_string(),
        ),
    }
}

/// Voetnoot a onder de geamendeerde tabel 7.1N, alleen bij X0 en XC1.
///
/// De grens is daar niet gesteld voor de duurzaamheid maar voor het uiterlijk,
/// en mag bij afwezigheid van eisen aan het uiterlijk worden afgezwakt. Dat is
/// een beslissing van de constructeur; de app zwakt niets uit zichzelf af,
/// maar zégt het er wel bij.
pub fn voetnoot_uiterlijk(klasse: ExposureClass) -> Option<&'static str> {
    match klasse {
        ExposureClass::X0 | ExposureClass::XC1 => Some(
            "Voetnoot a bij tabel 7.1N: voor X0 en XC1 heeft de scheurwijdte geen invloed \
             op de duurzaamheid; deze grens is gesteld om een in het algemeen aanvaardbaar \
             uiterlijk te verkrijgen. Bij afwezigheid van voorwaarden ten aanzien van het \
             uiterlijk mag deze beperking zijn afgezwakt.",
        ),
        _ => None,
    }
}

/// De grens aan Δσ_p uit kolom 3 van de geamendeerde tabel 7.1N, als
/// **vermenigvuldiger van ξ**: Δσ_p ≤ ξ · (275 | 175 | 75) MPa.
///
/// ξ (de verhouding van de aanhechtsterkte van voorspan- en betonstaal, tabel
/// 6.2 in 6.8.2) zit niet in deze crate. De functie levert daarom het getal
/// zonder ξ; wie hem gebruikt moet ξ zelf aanleveren.
pub fn delta_sigma_p_grens(klasse: ExposureClass) -> Result<f64, String> {
    let rij = rij_van_tabel_7_1n(klasse)
        .ok_or_else(|| format!("milieuklasse {klasse:?} komt niet voor in tabel 7.1N"))?;
    Ok([275.0, 175.0, 75.0][rij])
}

/// k_x volgens de nationale bijlage bij 7.3.1(5): k_x = c_toegepast / c_nom ≤ 2.
///
/// Alleen toepasbaar als de scheurwijdte volgens 7.3.3 of 7.3.4 wordt berekend
/// **voor de bepaling van de duurzaamheid**. w_max mag dan met k_x worden
/// vermenigvuldigd. c_toegepast is de werkelijk toegepaste dekking op de
/// wapening die voor de dekking bepalend is, c_nom de vereiste nominale
/// dekking op diezelfde wapening.
///
/// Deze factor kent de EN niet; hij staat uitsluitend in de NB.
pub fn k_x(c_toegepast_mm: f64, c_nom_mm: f64) -> Result<f64, String> {
    if c_nom_mm <= 0.0 {
        return Err("c_nom moet groter dan nul zijn om k_x te kunnen bepalen".to_string());
    }
    if c_toegepast_mm < c_nom_mm {
        return Err(format!(
            "c_toegepast ({c_toegepast_mm:.0} mm) is kleiner dan c_nom ({c_nom_mm:.0} mm); \
             de NB eist c_toegepast ≥ c_nom, k_x is dan niet van toepassing"
        ));
    }
    Ok((c_toegepast_mm / c_nom_mm).min(2.0))
}

// ---------------------------------------------------------------------------
// 7.3.2 — minimumwapening
// ---------------------------------------------------------------------------

/// k uit (7.1): de coëfficiënt voor niet-gelijkmatige eigenspanningen.
///
/// 7.3.2(2): k = 1,0 voor lijven met h ≤ 300 mm of flenzen met breedten kleiner
/// dan 300 mm; k = 0,65 voor lijven met h ≥ 800 mm of flenzen met breedten
/// groter dan 800 mm; daartussen lineair interpoleren.
///
/// `afmeting_mm` is dus de lijfhóógte bij een lijf en de flensbréédte bij een
/// flens — niet altijd dezelfde grootheid.
pub fn k_eigenspanningen(afmeting_mm: f64) -> f64 {
    if afmeting_mm <= 300.0 {
        1.0
    } else if afmeting_mm >= 800.0 {
        0.65
    } else {
        1.0 - (afmeting_mm - 300.0) / (800.0 - 300.0) * (1.0 - 0.65)
    }
}

/// h* uit 7.3.2(2): h* = h voor h < 1,0 m; h* = 1,0 m voor h ≥ 1,0 m. In mm.
pub fn h_ster_mm(h_mm: f64) -> f64 {
    h_mm.min(1000.0)
}

/// σ_c uit (7.4): de gemiddelde betonspanning in het beschouwde deel.
///
/// **N_Ed is hier DRUKKRACHT POSITIEF.** De rest van deze crate en de solver
/// rekenen op de buitengrens met trek positief; wie hier het teken vergeet te
/// draaien, draait k_c om en daarmee de hele minimumwapening.
pub fn sigma_c_mpa(n_ed_druk_positief_n: f64, b_mm: f64, h_mm: f64) -> f64 {
    if b_mm <= 0.0 || h_mm <= 0.0 {
        return 0.0;
    }
    n_ed_druk_positief_n / (b_mm * h_mm)
}

/// k_1 uit (7.2): 1,5 als N_Ed een drukkracht is, 2h*/(3h) als N_Ed een
/// trekkracht is (7.3.2(2)).
pub fn k_1_normaalkracht(n_ed_druk_positief_n: f64, h_mm: f64) -> f64 {
    if n_ed_druk_positief_n >= 0.0 {
        1.5
    } else {
        2.0 * h_ster_mm(h_mm) / (3.0 * h_mm)
    }
}

/// k_c uit (7.2), voor RECHTHOEKIGE doorsneden en voor LIJVEN van koker- en
/// T-doorsneden bij buiging of buiging met normaalkracht:
///
/// k_c = 0,4 · [1 − σ_c / (k_1 · (h/h*) · f_ct,eff)] ≤ 1
///
/// Bij zuivere buiging (σ_c = 0) levert dit exact 0,4 — de waarde waarop ook
/// tabel 7.2N is gebaseerd (OPMERKING 1 onder die tabel).
pub fn k_c_lijf(sigma_c_mpa: f64, h_mm: f64, f_ct_eff_mpa: f64, n_ed_druk_positief_n: f64) -> f64 {
    if f_ct_eff_mpa <= 0.0 || h_mm <= 0.0 {
        return 0.0;
    }
    let k1 = k_1_normaalkracht(n_ed_druk_positief_n, h_mm);
    let noemer = k1 * (h_mm / h_ster_mm(h_mm)) * f_ct_eff_mpa;
    (0.4 * (1.0 - sigma_c_mpa / noemer)).clamp(0.0, 1.0)
}

/// k_c uit (7.3), voor FLENZEN van koker- en T-doorsneden:
/// k_c = 0,9 · F_cr / (A_ct · f_ct,eff) ≥ 0,5.
///
/// F_cr is de absolute waarde van de trekkracht in de flens onmiddellijk vóór
/// het scheuren, uit het met f_ct,eff berekende scheurmoment. Die kracht komt
/// van de aanroeper: zij hangt af van het momentenverloop en niet van de
/// doorsnede alleen.
pub fn k_c_flens(f_cr_n: f64, a_ct_mm2: f64, f_ct_eff_mpa: f64) -> f64 {
    if a_ct_mm2 <= 0.0 || f_ct_eff_mpa <= 0.0 {
        return 0.5;
    }
    (0.9 * f_cr_n.abs() / (a_ct_mm2 * f_ct_eff_mpa)).max(0.5)
}

/// A_s,min uit (7.1): A_s,min = k_c · k · f_ct,eff · A_ct / σ_s, in mm².
///
/// σ_s is hier de **maximaal toelaatbare** spanning onmiddellijk na het
/// ontstaan van de scheur — f_yk mag, maar een lagere waarde kan nodig zijn om
/// aan de scheurwijdtegrens te voldoen (7.3.3(2)). Dat is een ándere grootheid
/// dan de σ_s van (7.9), die de wérkelijke spanning in de gescheurde doorsnede
/// is. Beide dragen in de norm hetzelfde symbool.
pub fn a_s_min_mm2(
    k_c: f64,
    k: f64,
    f_ct_eff_mpa: f64,
    a_ct_mm2: f64,
    sigma_s_mpa: f64,
) -> Result<f64, String> {
    if sigma_s_mpa <= 0.0 {
        return Err("σ_s in (7.1) moet groter dan nul zijn".to_string());
    }
    Ok(k_c * k * f_ct_eff_mpa * a_ct_mm2 / sigma_s_mpa)
}

// ---------------------------------------------------------------------------
// 7.3.3 — beheersing zonder directe berekening: tabel 7.2N en tabel 7.3N
// ---------------------------------------------------------------------------

/// De drie kolommen van tabel 7.2N en 7.3N: w_k = 0,4 / 0,3 / 0,2 mm.
pub const W_KOLOMMEN_MM: [f64; 3] = [0.4, 0.3, 0.2];

/// **Tabel 7.2N** — maximale staafdiameters Ø\*_s (mm) voor scheurbeheersing.
///
/// Per rij: de staalspanning in MPa en daarna de drie kolommen w_k = 0,4 /
/// 0,3 / 0,2 mm. `None` is het streepje "–" in de norm: dáár geeft de tabel
/// geen oplossing. Dat is niet hetzelfde als nul en al helemaal niet
/// "onbeperkt".
///
/// De nationale bijlage verklaart de tabel NORMATIEF: "De waarde van Ø\*_s moet
/// aan tabel 7.2N zijn ontleend, welke tabel als normatief moet zijn gelezen."
pub const TABEL_7_2N: &[(f64, [Option<f64>; 3])] = &[
    (160.0, [Some(40.0), Some(32.0), Some(25.0)]),
    (200.0, [Some(32.0), Some(25.0), Some(16.0)]),
    (240.0, [Some(20.0), Some(16.0), Some(12.0)]),
    (280.0, [Some(16.0), Some(12.0), Some(8.0)]),
    (320.0, [Some(12.0), Some(10.0), Some(6.0)]),
    (360.0, [Some(10.0), Some(8.0), Some(5.0)]),
    (400.0, [Some(8.0), Some(6.0), Some(4.0)]),
    (450.0, [Some(6.0), Some(5.0), None]),
];

/// **Tabel 7.3N** — maximale staafafstand (mm) voor scheurbeperking.
///
/// Zelfde opbouw als [`TABEL_7_2N`]. De tabel loopt tot 360 MPa; daarboven
/// geeft zij niets. Ook deze tabel is door de NB normatief verklaard, mét de
/// aanvullende eis dat de afstanden bij axiale trek worden GEHALVEERD.
pub const TABEL_7_3N: &[(f64, [Option<f64>; 3])] = &[
    (160.0, [Some(300.0), Some(300.0), Some(200.0)]),
    (200.0, [Some(300.0), Some(250.0), Some(150.0)]),
    (240.0, [Some(250.0), Some(200.0), Some(100.0)]),
    (280.0, [Some(200.0), Some(150.0), Some(50.0)]),
    (320.0, [Some(150.0), Some(100.0), None]),
    (360.0, [Some(100.0), Some(50.0), None]),
];

/// De aannamen waarop tabel 7.2N en 7.3N berusten (OPMERKING 1 onder tabel
/// 7.2N), woordelijk: c = 25 mm; f_ct,eff = 2,9 MPa; h_cr = 0,5 h;
/// (h − d) = 0,1 h; k_1 = 0,8; k_2 = 0,5; k_c = 0,4; k = 1,0; k_t = 0,4 en
/// k_4 = 1,0.
///
/// De NB eist: "In geval van andere waarden van de parameters (zie opmerking 1
/// onder tabel 7.2N), moet tabel 7.2N dienovereenkomstig zijn geamendeerd."
/// (7.6N) amendeert de tabel voor f_ct,eff, k_c, h_cr en (h − d); voor c, k_1,
/// k_2, k, k_t en k_4 doet zij dat NIET. Wijken die af, dan is de tabelweg
/// strikt genomen niet zonder meer bruikbaar en is 7.3.4 de aangewezen route.
/// Elke toets die de tabel gebruikt zet deze zin in zijn notes.
pub const AANNAMEN_TABEL_7_2N: &str =
    "Tabel 7.2N/7.3N berusten op c = 25 mm, f_ct,eff = 2,9 MPa, h_cr = 0,5h, (h − d) = 0,1h, \
     k_1 = 0,8, k_2 = 0,5, k_c = 0,4, k = 1,0, k_t = 0,4 en k_4 = 1,0 (OPMERKING 1 onder tabel \
     7.2N). (7.6N) amendeert de tabel voor f_ct,eff, k_c, h_cr en (h − d); voor de overige \
     parameters niet. Wijken die af, dan eist de nationale bijlage amendering van de tabel en \
     is de rekenweg van 7.3.4 de zuivere route.";

/// Hoe een tabelwaarde tussen twee tabelregels wordt gelezen.
///
/// De norm geeft tabel 7.2N en 7.3N als een reeks losse regels en zegt niets
/// over tussenwaarden. Twee lezingen zijn verdedigbaar en de constructeur mag
/// kiezen; er is er geen die "de norm" is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Tabelaflezing {
    /// Neem de regel met de kléinste getabelleerde staalspanning die nog ≥ σ_s
    /// is. Omdat de grenzen dalen met de staalspanning is dat altijd de veilige
    /// kant. Dit is de standaard: de tabel wordt dan uitsluitend op haar eigen
    /// regels gelezen en er wordt nergens een getal bij verzonnen.
    #[default]
    Conservatief,
    /// Lineair interpoleren tussen de twee omliggende regels. Gebruikelijk in
    /// de praktijk, maar het is een aanname over het verloop tússen de regels
    /// die de norm niet uitspreekt. Wie hem kiest krijgt hem in de afleiding
    /// terug te zien.
    LineairGeinterpoleerd,
}

/// Welke kolom van tabel 7.2N/7.3N bij een gegeven w_max hoort.
///
/// Exact 0,4 / 0,3 / 0,2 → die kolom. Ligt w_max ertussenin (bijvoorbeeld
/// 0,30 × k_x = 0,45), dan de grootste kolom die nog **kleiner dan of gelijk
/// aan** w_max is: dat is de veilige kant en het is géén interpolatie tussen
/// kolommen. Onder 0,20 mm geeft de tabel niets — dan is 7.3.4 de enige weg.
fn kolom_voor_w(w_max_mm: f64) -> Result<usize, String> {
    for (i, w) in W_KOLOMMEN_MM.iter().enumerate() {
        if w_max_mm >= w - 1e-9 {
            return Ok(i);
        }
    }
    Err(format!(
        "w_max = {w_max_mm:.2} mm ligt onder de kleinste kolom van tabel 7.2N/7.3N (0,20 mm); \
         de tabelweg van 7.3.3 biedt hier geen uitkomst, gebruik de rekenweg van 7.3.4"
    ))
}

/// Lees een van beide tabellen bij een staalspanning en een grenswijdte.
fn lees_tabel(
    tabel: &[(f64, [Option<f64>; 3])],
    naam: &str,
    sigma_s_mpa: f64,
    w_max_mm: f64,
    aflezing: Tabelaflezing,
) -> Result<f64, String> {
    if !sigma_s_mpa.is_finite() || sigma_s_mpa < 0.0 {
        return Err(format!(
            "σ_s = {sigma_s_mpa} is geen bruikbare staalspanning"
        ));
    }
    let kolom = kolom_voor_w(w_max_mm)?;
    let laatste = tabel[tabel.len() - 1];
    if sigma_s_mpa > laatste.0 + 1e-9 {
        return Err(format!(
            "σ_s = {sigma_s_mpa:.0} N/mm² ligt boven de laatste regel van {naam} \
             ({:.0} N/mm²); de tabel geeft daar geen grens en de rekenweg van 7.3.4 is de \
             enige route",
            laatste.0
        ));
    }
    let leeg = |s: f64| {
        format!(
            "{naam} geeft bij σ_s = {s:.0} N/mm² en w_k = {:.1} mm een streepje: er is geen \
             oplossing. Dat is niet nul en niet onbeperkt — verlaag de staalspanning of ga \
             over op de rekenweg van 7.3.4",
            W_KOLOMMEN_MM[kolom]
        )
    };
    // Onder de eerste regel: de eerste regel geeft de grootste getabelleerde
    // grens; die aanhouden is de veilige kant en verzint niets.
    if sigma_s_mpa <= tabel[0].0 + 1e-9 {
        return tabel[0].1[kolom].ok_or_else(|| leeg(tabel[0].0));
    }
    match aflezing {
        Tabelaflezing::Conservatief => {
            for (s, waarden) in tabel {
                if sigma_s_mpa <= *s + 1e-9 {
                    return waarden[kolom].ok_or_else(|| leeg(*s));
                }
            }
            unreachable!("σ_s boven de laatste regel is hierboven al afgevangen")
        }
        Tabelaflezing::LineairGeinterpoleerd => {
            for paar in tabel.windows(2) {
                let (s0, v0) = paar[0];
                let (s1, v1) = paar[1];
                if sigma_s_mpa <= s1 + 1e-9 {
                    let a = v0[kolom].ok_or_else(|| leeg(s0))?;
                    let b = v1[kolom].ok_or_else(|| leeg(s1))?;
                    let t = (sigma_s_mpa - s0) / (s1 - s0);
                    return Ok(a + t * (b - a));
                }
            }
            unreachable!("σ_s boven de laatste regel is hierboven al afgevangen")
        }
    }
}

/// Ø\*_s uit **tabel 7.2N**: de maximale staafdiameter vóór de aanpassing van
/// (7.6N), in mm.
pub fn phi_ster_s_mm(
    sigma_s_mpa: f64,
    w_max_mm: f64,
    aflezing: Tabelaflezing,
) -> Result<f64, String> {
    lees_tabel(TABEL_7_2N, "tabel 7.2N", sigma_s_mpa, w_max_mm, aflezing)
}

/// De maximale staafafstand uit **tabel 7.3N**, in mm.
///
/// `axiale_trek` schakelt de aanvullende NB-eis in: "Indien de doorsnede belast
/// is door een axiale trekkracht, moeten de maximale staafafstanden uit tabel
/// 7.3N zijn GEHALVEERD." De tabelwaarden zelf zijn ongewijzigd.
pub fn staafafstand_max_mm(
    sigma_s_mpa: f64,
    w_max_mm: f64,
    axiale_trek: bool,
    aflezing: Tabelaflezing,
) -> Result<f64, String> {
    let s = lees_tabel(TABEL_7_3N, "tabel 7.3N", sigma_s_mpa, w_max_mm, aflezing)?;
    Ok(if axiale_trek { s / 2.0 } else { s })
}

/// De belastingssituatie waaronder (7.6N) of (7.7N) van toepassing zou zijn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Belastingsgeval {
    /// Buiging — ten minste een deel van de doorsnede staat onder druk. (7.6N).
    Buiging,
    /// Axiale centrische trek: de gehele doorsnede staat onder trek. (7.7N).
    AxialeTrek,
}

/// De aangepaste maximale staafdiameter volgens (7.6N):
///
/// Ø_s = Ø\*_s · (f_ct,eff / 2,9) · k_c · h_cr / (2 (h − d))
///
/// 2,9 is de MPa-waarde waarop tabel 7.2N is gebaseerd (OPMERKING 1). `d` is
/// hier "de effectieve hoogte betrokken op het zwaartepunt van de BUITENSTE
/// wapeningslaag" — niet noodzakelijk de gebruikelijke d van het zwaartepunt
/// van álle trekwapening. h_cr is de hoogte van de trekzone onmiddellijk vóór
/// het scheuren, onder de QUASI-BLIJVENDE combinatie (zie [`COMBINATIE_H_CR`]).
///
/// Voor [`Belastingsgeval::AxialeTrek`] hoort hier (7.7N), en die is bewust
/// niet geïmplementeerd — zie de moduletekst. De functie levert dan een `Err`.
pub fn aangepaste_staafdiameter(
    phi_ster_s_mm: f64,
    f_ct_eff_mpa: f64,
    k_c: f64,
    h_cr_mm: f64,
    h_mm: f64,
    d_mm: f64,
    geval: Belastingsgeval,
) -> Result<f64, String> {
    if geval == Belastingsgeval::AxialeTrek {
        return Err(
            "de aanpassing van de staafdiameter bij zuivere axiale trek gaat volgens (7.7N); \
             die vergelijking staat in de gebruikte uitgave uitsluitend als raster van \
             189 × 28 pixels en is op die bronresolutie niet met zekerheid te lezen. Zij is \
             daarom NIET geïmplementeerd: liever een ontbrekende toets dan een verzonnen \
             deler. Toets dit geval met de rekenweg van 7.3.4"
                .to_string(),
        );
    }
    let h_min_d = h_mm - d_mm;
    if h_min_d <= 0.0 {
        return Err(format!(
            "h − d = {h_min_d:.1} mm is niet positief; (7.6N) heeft een positieve afstand van \
             de betonrand tot het zwaartepunt van de buitenste wapeningslaag nodig"
        ));
    }
    Ok(phi_ster_s_mm * (f_ct_eff_mpa / 2.9) * k_c * h_cr_mm / (2.0 * h_min_d))
}

/// De vrijstelling van 7.3.3(1), woordelijk:
///
/// > Voor gewapende of voorgespannen platen in gebouwen belast op buiging
/// > zonder significante axiale trek zijn specifieke maatregelen ter beheersing
/// > van scheurvorming niet nodig indien de totale hoogte niet groter dan
/// > 200 mm is en indien de bepalingen van 9.3 zijn toegepast.
///
/// Vijf voorwaarden, alle vijf nodig: (1) een plaat, (2) in een gebouw, (3)
/// belast op buiging, (4) zonder significante axiale trek, (5) h ≤ 200 mm — en
/// bovendien moeten de detailleringsbepalingen van 9.3 zijn toegepast. Deze
/// module toetst 9.3 niet; die bevestiging komt van de aanroeper, en dat staat
/// in de reden die de toets meegeeft.
pub fn plaat_vrijgesteld_7_3_3_1(
    plaat_in_gebouw: bool,
    significante_axiale_trek: bool,
    h_mm: f64,
    detaillering_9_3_toegepast: bool,
) -> bool {
    plaat_in_gebouw && !significante_axiale_trek && h_mm <= 200.0 && detaillering_9_3_toegepast
}

// ---------------------------------------------------------------------------
// 7.3.4 — de rekenweg
// ---------------------------------------------------------------------------

/// k_t uit 7.3.4(2): 0,6 voor kortdurende, 0,4 voor langdurende belasting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Belastingsduur {
    Kortdurend,
    Langdurend,
}

impl Belastingsduur {
    /// k_t in (7.9).
    pub fn k_t(self) -> f64 {
        match self {
            Belastingsduur::Kortdurend => 0.6,
            Belastingsduur::Langdurend => 0.4,
        }
    }
}

/// k_1 uit (7.11): de coëfficiënt voor de aanhechteigenschappen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Aanhechting {
    /// Staven met hoge aanhechting (geribd betonstaal): k_1 = 0,8.
    Hoog,
    /// Staven met een feitelijk glad oppervlak (bijvoorbeeld voorspanelementen):
    /// k_1 = 1,6.
    Glad,
}

impl Aanhechting {
    /// k_1 in (7.11).
    pub fn k_1(self) -> f64 {
        match self {
            Aanhechting::Hoog => 0.8,
            Aanhechting::Glad => 1.6,
        }
    }
}

/// k_2 uit (7.11): de coëfficiënt voor de rekverdeling.
///
/// 0,5 voor buiging, 1,0 voor zuivere trek. Bij excentrische trek eist de norm
/// de tussenwaarde van (7.13); hardcoderen op 0,5 is bij trek ONVEILIG, want
/// k_2 staat in de teller van (7.11).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Rekverdeling {
    Buiging,
    ZuivereTrek,
    /// (7.13): k_2 = (ε_1 + ε_2)/(2 ε_1), met ε_1 de grootste en ε_2 de
    /// kleinste rek aan de randen van de gescheurde doorsnede.
    ExcentrischeTrek {
        eps_1: f64,
        eps_2: f64,
    },
}

impl Rekverdeling {
    pub fn k_2(self) -> f64 {
        match self {
            Rekverdeling::Buiging => 0.5,
            Rekverdeling::ZuivereTrek => 1.0,
            Rekverdeling::ExcentrischeTrek { eps_1, eps_2 } => k_2_excentrische_trek(eps_1, eps_2),
        }
    }
}

/// (7.13): k_2 = (ε_1 + ε_2) / (2 ε_1).
pub fn k_2_excentrische_trek(eps_1: f64, eps_2: f64) -> f64 {
    if eps_1.abs() < 1e-15 {
        return 1.0;
    }
    (eps_1 + eps_2) / (2.0 * eps_1)
}

/// k_3 uit (7.11). Nationale bijlage: "De waarde van k_3 moet gelijk aan 3,4
/// zijn genomen." Numeriek gelijk aan de (doorgehaalde) EN-aanbeveling, maar
/// in Nederland normatief.
pub const K_3: f64 = 3.4;

/// k_4 uit (7.11). Nationale bijlage: "De waarde van k_4 moet gelijk aan 0,425
/// zijn genomen."
pub const K_4: f64 = 0.425;

/// h_c,ef uit 7.3.2(3) en figuur 7.1: de kleinste waarde van 2,5 (h − d),
/// (h − x)/3 en h/2.
///
/// x is de hoogte van de drukzone in de GESCHEURDE doorsnede in de BGT — niet
/// de x van het spanningsblok in de UGT.
pub fn h_c_ef_mm(h_mm: f64, d_mm: f64, x_mm: f64) -> f64 {
    let a = 2.5 * (h_mm - d_mm);
    let b = (h_mm - x_mm) / 3.0;
    let c = h_mm / 2.0;
    a.min(b).min(c).max(0.0)
}

/// A_c,eff: het effectieve trekgebied, h_c,ef maal de bijbehorende breedte
/// (figuur 7.1), in mm².
///
/// Bij een T of L is de breedte aan de trekrand niet de flensbreedte; daarom
/// wordt hier over de werkelijke banden geïntegreerd in plaats van met één
/// breedte vermenigvuldigd. `trek_onder` zegt welke rand op trek staat.
pub fn a_c_eff_mm2(section: &ConcreteSection, h_c_ef_mm: f64, trek_onder: bool) -> f64 {
    let werk = if trek_onder {
        section.mirrored()
    } else {
        *section
    };
    werk.top_strip(h_c_ef_mm.clamp(0.0, section.h_mm)).0
}

/// ρ_p,eff uit (7.10). Zonder voorspanning: ρ_p,eff = A_s / A_c,eff.
///
/// De term ξ_1·A_p′ is hier weggelaten omdat deze crate geen voorspanning
/// kent; voor gewoon gewapend beton is A_p′ = 0 en is dit exact.
pub fn rho_p_eff(a_s_mm2: f64, a_c_eff_mm2: f64) -> Result<f64, String> {
    if a_c_eff_mm2 <= 0.0 {
        return Err("A_c,eff is nul; ρ_p,eff uit (7.10) is dan niet te bepalen".to_string());
    }
    Ok(a_s_mm2 / a_c_eff_mm2)
}

/// Het rekverschil van (7.9), met de ondergrens 0,6 σ_s / E_s.
///
/// ε_sm − ε_cm = [σ_s − k_t (f_ct,eff/ρ_p,eff)(1 + α_e ρ_p,eff)] / E_s
///               ≥ 0,6 σ_s / E_s
///
/// Levert het rekverschil (dimensieloos) en of de ondergrens maatgevend was.
/// Dat tweede getal is geen bijzaak: is de ondergrens maatgevend, dan telt de
/// tension stiffening niet meer mee en verandert de gevoeligheid van de hele
/// toets.
pub fn rekverschil(
    sigma_s_mpa: f64,
    k_t: f64,
    f_ct_eff_mpa: f64,
    rho_p_eff: f64,
    alpha_e: f64,
) -> Result<(f64, bool), String> {
    if rho_p_eff <= 0.0 {
        return Err("ρ_p,eff moet groter dan nul zijn in (7.9)".to_string());
    }
    let hoofdterm =
        (sigma_s_mpa - k_t * (f_ct_eff_mpa / rho_p_eff) * (1.0 + alpha_e * rho_p_eff)) / E_S;
    let ondergrens = 0.6 * sigma_s_mpa / E_S;
    if hoofdterm >= ondergrens {
        Ok((hoofdterm, false))
    } else {
        Ok((ondergrens, true))
    }
}

/// α_e = E_s / E_cm (bij (7.9)).
pub fn alpha_e(e_cm_mpa: f64) -> f64 {
    if e_cm_mpa <= 0.0 {
        return 0.0;
    }
    E_S / e_cm_mpa
}

/// Ø_eq uit (7.12): de gelijkwaardige staafdiameter bij twee diameters in één
/// doorsnede — (n_1 Ø_1² + n_2 Ø_2²) / (n_1 Ø_1 + n_2 Ø_2).
pub fn phi_eq_mm(n_1: f64, phi_1_mm: f64, n_2: f64, phi_2_mm: f64) -> Result<f64, String> {
    let noemer = n_1 * phi_1_mm + n_2 * phi_2_mm;
    if noemer <= 0.0 {
        return Err(
            "(7.12) heeft ten minste één staaf met een positieve diameter nodig".to_string(),
        );
    }
    Ok((n_1 * phi_1_mm * phi_1_mm + n_2 * phi_2_mm * phi_2_mm) / noemer)
}

/// Welke van de twee uitdrukkingen voor s_r,max is gebruikt, en waarom.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScheurafstandBron {
    /// (7.11): de hechtende wapening ligt voldoende dichtbij elkaar
    /// (staafafstand ≤ 5(c + Ø/2)), zónder dat de NB-bovengrens maatgevend was.
    Vergelijking7_11,
    /// (7.11) mét de door de nationale bijlage toegevoegde bovengrens
    /// max{(50 − 0,8 f_ck)·Ø ; 15·Ø} als maatgevende waarde.
    Vergelijking7_11NbBovengrens,
    /// (7.14): s_r,max = 1,3 (h − x), omdat de staafafstand groter is dan
    /// 5(c + Ø/2) of er geen hechtende wapening in de trekzone zit.
    Vergelijking7_14,
}

/// De uitkomst van de scheurafstandsbepaling, met alle tussenwaarden die het
/// rapport nodig heeft om haar na te rekenen.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Scheurafstand {
    pub s_r_max_mm: f64,
    pub bron: ScheurafstandBron,
    /// De onbegrensde uitkomst van (7.11), of `None` als (7.14) gold.
    pub s_r_max_7_11_mm: Option<f64>,
    /// De NB-bovengrens max{(50 − 0,8 f_ck)Ø ; 15Ø}, of `None` als (7.14) gold.
    pub nb_bovengrens_mm: Option<f64>,
    /// De toepassingsgrens 5(c + Ø/2) waaraan de staafafstand is getoetst.
    pub grens_5c_mm: f64,
}

/// De door de nationale bijlage aan (7.11) toegevoegde bovengrens:
/// s_r,max ≤ de GROOTSTE waarde van (50 − 0,8 f_ck)·Ø en 15·Ø.
///
/// De EN kent deze grens niet. Let op het woord "grootste": hem als minimum
/// lezen is fout. Voor lage betonklassen is de eerste term maatgevend
/// (C20/25 → 34 Ø), vanaf f_ck = 43,75 MPa de tweede (15 Ø).
pub fn nb_bovengrens_s_r_max_mm(f_ck_mpa: f64, phi_mm: f64) -> f64 {
    ((50.0 - 0.8 * f_ck_mpa) * phi_mm).max(15.0 * phi_mm)
}

/// s_r,max volgens 7.3.4(3): (7.11) met de NB-bovengrens, of (7.14).
///
/// * `c_mm` is **de dekking op de LANGSWAPENING**, niet op de beugel. Voert de
///   app c_nom op de beugel in, dan moet de beugeldiameter er eerst bij op.
///   [`Scheurinvoer::c_langswapening_mm`] doet dat.
/// * `staafafstand_mm` is de wérkelijke hart-op-hartafstand van de hechtende
///   wapening in de trekzone. `None` = onbekend; dan wordt (7.14) genomen,
///   want de norm staat (7.11) alleen toe als de afstand aantoonbaar
///   ≤ 5(c + Ø/2) is. Twee staven in een brede balk vallen daar al snel buiten.
/// * `x_mm` is de drukzonehoogte in de gescheurde doorsnede in de BGT, nodig
///   voor (7.14).
#[allow(clippy::too_many_arguments)]
pub fn scheurafstand(
    c_mm: f64,
    phi_mm: f64,
    rho_p_eff: f64,
    k_1: f64,
    k_2: f64,
    f_ck_mpa: f64,
    staafafstand_mm: Option<f64>,
    h_mm: f64,
    x_mm: f64,
) -> Result<Scheurafstand, String> {
    let grens_5c = 5.0 * (c_mm + phi_mm / 2.0);
    let dichtbij = match staafafstand_mm {
        Some(s) => s <= grens_5c + 1e-9,
        None => false,
    };
    if !dichtbij {
        // (7.14): bovengrens voor de scheurwijdte als de staven te ver uit
        // elkaar liggen of er geen hechtende wapening in de trekzone is.
        return Ok(Scheurafstand {
            s_r_max_mm: 1.3 * (h_mm - x_mm),
            bron: ScheurafstandBron::Vergelijking7_14,
            s_r_max_7_11_mm: None,
            nb_bovengrens_mm: None,
            grens_5c_mm: grens_5c,
        });
    }
    if rho_p_eff <= 0.0 {
        return Err("ρ_p,eff moet groter dan nul zijn in (7.11)".to_string());
    }
    let onbegrensd = K_3 * c_mm + k_1 * k_2 * K_4 * phi_mm / rho_p_eff;
    let bovengrens = nb_bovengrens_s_r_max_mm(f_ck_mpa, phi_mm);
    let (waarde, bron) = if onbegrensd <= bovengrens {
        (onbegrensd, ScheurafstandBron::Vergelijking7_11)
    } else {
        (bovengrens, ScheurafstandBron::Vergelijking7_11NbBovengrens)
    };
    Ok(Scheurafstand {
        s_r_max_mm: waarde,
        bron,
        s_r_max_7_11_mm: Some(onbegrensd),
        nb_bovengrens_mm: Some(bovengrens),
        grens_5c_mm: grens_5c,
    })
}

/// (7.15): de scheurafstand bij in twee orthogonale richtingen gewapende
/// elementen, als de hoek tussen de hoofdspanningsassen en de wapeningsrichting
/// significant groter is dan 15°.
///
/// θ in RADIALEN; de norm schrijft hem in graden. Geen enkele toets in deze
/// module kiest deze vergelijking zelf: zij vraagt θ, en die volgt niet uit een
/// staafmodel.
pub fn scheurafstand_twee_richtingen(
    theta_rad: f64,
    s_r_max_y_mm: f64,
    s_r_max_z_mm: f64,
) -> Result<f64, String> {
    if s_r_max_y_mm <= 0.0 || s_r_max_z_mm <= 0.0 {
        return Err("(7.15) heeft twee positieve scheurafstanden nodig".to_string());
    }
    let noemer = theta_rad.cos() / s_r_max_y_mm + theta_rad.sin() / s_r_max_z_mm;
    if noemer <= 0.0 {
        return Err("(7.15) levert bij deze hoek geen positieve scheurafstand".to_string());
    }
    Ok(1.0 / noemer)
}

/// 7.3.4(5): voor wanden met vroegtijdige thermische krimp waarvan de
/// horizontale staaldoorsnede A_s niet aan 7.3.2 voldoet én waarvan de
/// onderzijde door een vooraf gestorte ondergrond is belemmerd, mag
/// s_r,max = 1,3 × de hoogte van de wand zijn aangenomen.
pub fn scheurafstand_wand_krimp_mm(wandhoogte_mm: f64) -> f64 {
    1.3 * wandhoogte_mm
}

/// (7.8): w_k = s_r,max (ε_sm − ε_cm), in mm.
pub fn w_k_mm(s_r_max_mm: f64, rekverschil: f64) -> f64 {
    s_r_max_mm * rekverschil
}

// ---------------------------------------------------------------------------
// De invoer die de aanroeper moet leveren
// ---------------------------------------------------------------------------

/// Waardoor de scheuren in hoofdzaak ontstaan. Bepaalt welke tabellen van
/// 7.3.3 mogen worden gebruikt.
///
/// 7.3.3(2), OPMERKING: bij scheuren door **belemmerde vervorming** mag
/// uitsluitend tabel 7.2N worden aangehouden, met σ_s = de spanning onmiddellijk
/// na scheurvorming (dat is de σ_s van (7.1)). Bij scheuren door **belasting**
/// volstaat tabel 7.2N óf tabel 7.3N.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scheuroorzaak {
    BelemmerdeVervorming,
    Belasting,
}

/// Alles wat §7.3 nodig heeft en wat deze module NIET uit de doorsnede kan
/// afleiden. Wat hier niet in staat, wordt nergens geraden.
///
/// # De staalspanning komt van de aanroeper
///
/// [`Self::sigma_s_mpa`] is de spanning in de trekwapening van een
/// **gescheurde** doorsnede onder de **frequente** combinatie. Deze module
/// berekent hem niet: dat vraagt de doorsnedeanalyse in de BGT met de juiste
/// combinatie, en die hoort bij de aanroeper. Wie hier een UGT-spanning, f_yd
/// of een ongescheurde elastische spanning invult, krijgt een andere en te
/// gunstige toets.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Scheurinvoer {
    /// σ_s in N/mm², gescheurde doorsnede, FREQUENTE combinatie. Zie boven.
    pub sigma_s_mpa: f64,
    /// x: de hoogte van de drukzone in diezelfde gescheurde doorsnede, mm,
    /// gemeten vanaf de gedrukte rand. Nodig voor h_c,ef en voor (7.14).
    pub x_mm: f64,
    /// h_cr onder de QUASI-BLIJVENDE combinatie, mm — alleen voor (7.6N).
    /// `None` = niet opgegeven; dan wordt hij alleen afgeleid als dat mag
    /// (zuivere buiging, geen normaalkracht), zie [`h_cr_of_afgeleid`].
    pub h_cr_mm: Option<f64>,
    /// N_Ed in de BGT, **DRUKKRACHT POSITIEF** zoals (7.4) het vraagt, in N.
    pub n_ed_druk_positief_n: f64,
    /// Staat de doorsnede onder een axiale trekkracht? Schakelt de NB-eis in
    /// dat de staafafstanden van tabel 7.3N worden gehalveerd.
    pub axiale_trek: bool,
    /// De duur van de belasting, voor k_t in (7.9).
    pub belastingsduur: Belastingsduur,
    /// De aanhechteigenschappen van de staven, voor k_1 in (7.11).
    pub aanhechting: Aanhechting,
    /// De rekverdeling, voor k_2 in (7.11).
    pub rekverdeling: Rekverdeling,
    /// De wérkelijke hart-op-hartafstand van de trekstaven, mm. `None` =
    /// onbekend; dan valt 7.3.4 terug op (7.14) en kan tabel 7.3N niet worden
    /// getoetst.
    pub staafafstand_mm: Option<f64>,
    /// De toegepaste dekking c_toegepast (≥ c_nom) op de voor de dekking
    /// bepalende wapening, mm. `None` = geen k_x.
    pub c_toegepast_mm: Option<f64>,
    /// De vereiste nominale dekking c_nom op diezelfde wapening, mm.
    /// `None` = geen k_x.
    pub c_nom_mm: Option<f64>,
    /// De milieuklasse van dit element (tabel 4.1) — de ingang van tabel 7.1N.
    pub milieuklasse: ExposureClass,
    /// Welke kolom van de geamendeerde tabel 7.1N geldt.
    pub elementtype: Elementtype,
    /// Waardoor de scheuren in hoofdzaak ontstaan (7.3.3(2)).
    pub scheuroorzaak: Scheuroorzaak,
    /// Hoe tussenwaarden in tabel 7.2N/7.3N worden gelezen.
    pub aflezing: Tabelaflezing,
    /// Is dit een plaat in een gebouw? Voorwaarde voor 7.3.3(1).
    pub plaat_in_gebouw: bool,
    /// Zijn de detailleringsbepalingen van 9.3 toegepast? Voorwaarde voor
    /// 7.3.3(1); deze module toetst 9.3 niet zelf.
    pub detaillering_9_3_toegepast: bool,
    /// Staat de trekzone aan de ONDERkant? Bepaalt aan welke rand A_c,eff ligt.
    pub trek_onder: bool,
}

impl Scheurinvoer {
    /// Een invoer met de gegevens die een gewone gewapend-betonnen ligger in
    /// zuivere buiging nodig heeft. Alles wat een keuze is, staat er expliciet
    /// in; er is met opzet geen `Default`, want een stilzwijgende milieuklasse
    /// of een stilzwijgende belastingsduur is precies wat we niet willen.
    pub fn buiging(
        sigma_s_mpa: f64,
        x_mm: f64,
        milieuklasse: ExposureClass,
        belastingsduur: Belastingsduur,
    ) -> Self {
        Self {
            sigma_s_mpa,
            x_mm,
            h_cr_mm: None,
            n_ed_druk_positief_n: 0.0,
            axiale_trek: false,
            belastingsduur,
            aanhechting: Aanhechting::Hoog,
            rekverdeling: Rekverdeling::Buiging,
            staafafstand_mm: None,
            c_toegepast_mm: None,
            c_nom_mm: None,
            milieuklasse,
            elementtype: Elementtype::Betonstaal,
            scheuroorzaak: Scheuroorzaak::Belasting,
            aflezing: Tabelaflezing::Conservatief,
            plaat_in_gebouw: false,
            detaillering_9_3_toegepast: false,
            trek_onder: true,
        }
    }

    /// De dekking op de LANGSWAPENING voor (7.11): c_nom van de korf plus de
    /// beugeldiameter. De korf voert c_nom op de bééugel in; de langsstaaf ligt
    /// er de beugeldiameter achter.
    pub fn c_langswapening_mm(cage: &ReinforcementCage) -> f64 {
        cage.cover_mm + cage.stirrup_diameter_mm
    }

    /// w_max inclusief de NB-factor k_x, mm.
    pub fn w_max_toegepast_mm(&self) -> Result<(f64, f64), String> {
        let w = w_max_mm(self.milieuklasse, self.elementtype)?;
        let kx = match (self.c_toegepast_mm, self.c_nom_mm) {
            (Some(ct), Some(cn)) => k_x(ct, cn)?,
            _ => 1.0,
        };
        Ok((w * kx, kx))
    }
}

/// h_cr uit de invoer, of afgeleid als dat mag.
///
/// h_cr is de hoogte van de trekzone onmiddellijk vóór het scheuren. Zolang de
/// doorsnede ongescheurd is en er geen normaalkracht op staat, ligt de
/// nulspanningslijn in het zwaartepunt van de bruto betondoorsnede; h_cr is dan
/// de afstand van de trekrand tot dat zwaartepunt. Voor een rechthoek is dat
/// exact h/2 — precies de aanname waarop tabel 7.2N berust.
///
/// **Zodra er een normaalkracht is, wordt niets afgeleid.** De
/// nulspanningslijn verschuift dan, en hoevéél hangt af van de quasi-blijvende
/// combinatie die deze module niet kent.
pub fn h_cr_of_afgeleid(
    section: &ConcreteSection,
    invoer: &Scheurinvoer,
) -> Result<(f64, bool), String> {
    if let Some(h) = invoer.h_cr_mm {
        return Ok((h, false));
    }
    if invoer.n_ed_druk_positief_n.abs() > 1e-9 {
        return Err(
            "h_cr is niet opgegeven en er staat een normaalkracht op de doorsnede; de hoogte \
             van de trekzone vlak vóór het scheuren is dan niet uit de meetkunde af te leiden. \
             Bepaal h_cr onder de quasi-blijvende belastingscombinatie en geef hem op"
                .to_string(),
        );
    }
    let z_g = section.centroid_z_mm();
    // z_g is gemeten vanaf de ONDERrand. Staat de trekzone onder, dan is de
    // trekzone precies z_g hoog; staat zij boven, dan h − z_g.
    Ok((
        if invoer.trek_onder {
            z_g
        } else {
            section.h_mm - z_g
        },
        true,
    ))
}

// ---------------------------------------------------------------------------
// De toetsen
// ---------------------------------------------------------------------------

/// De gegevens die alle drie de toetsen delen.
pub struct Scheurgegevens<'a> {
    pub section: &'a ConcreteSection,
    pub cage: &'a ReinforcementCage,
    pub beton: &'a ConcreteClass,
    pub staal: &'a ReinforcementGrade,
    pub invoer: &'a Scheurinvoer,
}

impl Scheurgegevens<'_> {
    /// f_ct,eff voor de scheurwijdte. 7.1(2): "Voor het berekenen van
    /// scheurwijdtes en 'tension stiffening' behoort f_ctm te zijn gebruikt" —
    /// dus niet f_ctm,fl.
    pub fn f_ct_eff_mpa(&self) -> f64 {
        self.beton.f_ctm
    }

    /// d van de trekwapening, mm.
    fn d_mm(&self) -> f64 {
        if self.invoer.trek_onder {
            self.cage.d_mm(self.section.h_mm)
        } else {
            self.section.h_mm - self.cage.d2_mm()
        }
    }

    /// A_s in de trekzone, mm².
    fn a_s_trek_mm2(&self) -> f64 {
        if self.invoer.trek_onder {
            self.cage.a_s_bottom_mm2()
        } else {
            self.cage.a_s_top_mm2()
        }
    }

    /// De diameter van de trekstaven, mm.
    fn phi_mm(&self) -> f64 {
        if self.invoer.trek_onder {
            self.cage.bottom.diameter_mm
        } else {
            self.cage.top.diameter_mm
        }
    }
}

/// Een `ResistanceCalc` die alleen een reden draagt: de toets kan niet.
fn niet_van_toepassing(
    id: &str,
    title: &str,
    article: &str,
    force_state: ForceStateSnapshot,
    reden: String,
) -> ResistanceCalc {
    ResistanceCalc {
        id: id.to_string(),
        title: title.to_string(),
        article: article.to_string(),
        force_state,
        formula_latex: String::new(),
        variables: vec![],
        deelstappen: vec![],
        value: 0.0,
        unit: String::new(),
        uc: None,
        status: CheckStatus::NotApplicable,
        notes: vec![reden],
    }
}

/// **7.3.2 — minimumwapening voor scheurbeheersing.**
///
/// A_s,min · σ_s = k_c · k · f_ct,eff · A_ct  (7.1)
///
/// `a_ct_mm2` is het deel van de doorsnede dat volgens de berekening juist vóór
/// het ontstaan van de eerste scheur onder trek staat. `None` mag alleen bij
/// zuivere buiging zonder normaalkracht: dan is de trekzone het deel onder (of
/// boven) het zwaartepunt van de ongescheurde doorsnede, en dat is meetkunde,
/// geen aanname. Bij een normaalkracht MOET de aanroeper A_ct leveren.
///
/// `sigma_s_mpa` is de maximaal toelaatbare spanning onmiddellijk na
/// scheurvorming; `None` betekent f_yk (7.3.2(2) staat dat toe).
///
/// Bij T- en kokerdoorsneden schrijft 7.3.2(2) voor de minimumwapening per deel
/// (lijf, flens) te bepalen. Deze toets rekent één deel door; bij een doorsnede
/// mét flens zegt zij dat er in de notes bij.
pub fn check_minimumwapening(
    g: &Scheurgegevens<'_>,
    a_ct_mm2: Option<f64>,
    sigma_s_mpa: Option<f64>,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let id = "7.3.2_minimumwapening";
    let title = "Minimumwapening voor scheurbeheersing";
    let article = "art. 7.3.2(2) (7.1), (7.2) en (7.4)";

    let h = g.section.h_mm;
    let f_ct_eff = g.f_ct_eff_mpa();
    let a_ct =
        match a_ct_mm2 {
            Some(a) if a > 0.0 => a,
            Some(_) => {
                return niet_van_toepassing(
                    id,
                    title,
                    article,
                    force_state,
                    "A_ct is nul of negatief; er is dan geen trekzone om (7.1) op toe te passen"
                        .to_string(),
                )
            }
            None => {
                if g.invoer.n_ed_druk_positief_n.abs() > 1e-9 {
                    return niet_van_toepassing(
                    id, title, article, force_state,
                    "A_ct is niet opgegeven en er staat een normaalkracht op de doorsnede; het \
                     deel van de doorsnede dat juist vóór het scheuren onder trek staat is dan \
                     niet uit de meetkomst alleen te bepalen. Geef A_ct op onder de van \
                     toepassing zijnde belastingscombinatie."
                        .to_string(),
                );
                }
                // Zuivere buiging: de nulspanningslijn ligt in het zwaartepunt van
                // de bruto doorsnede. De trekzone is de strook aan de trekrand.
                let z_g = g.section.centroid_z_mm();
                let hoogte = if g.invoer.trek_onder { z_g } else { h - z_g };
                a_c_eff_mm2(g.section, hoogte, g.invoer.trek_onder)
            }
        };

    let sigma_s = sigma_s_mpa.unwrap_or(g.staal.f_yk);
    let k = k_eigenspanningen(h);
    let sigma_c = sigma_c_mpa(g.invoer.n_ed_druk_positief_n, g.section.b_w_mm(), h);
    let k_c = k_c_lijf(sigma_c, h, f_ct_eff, g.invoer.n_ed_druk_positief_n);

    let a_s_min = match a_s_min_mm2(k_c, k, f_ct_eff, a_ct, sigma_s) {
        Ok(v) => v,
        Err(e) => return niet_van_toepassing(id, title, article, force_state, e),
    };
    let a_s = g.a_s_trek_mm2();
    let uc = if a_s > 0.0 {
        a_s_min / a_s
    } else {
        f64::INFINITY
    };

    let mut notes = vec![
        format!(
            "σ_s in (7.1) is de maximaal toelaatbare spanning ONMIDDELLIJK NA het ontstaan van \
             de scheur; hier {sigma_s:.0} N/mm². Dat is een andere grootheid dan de σ_s van \
             (7.9), ook al draagt zij in de norm hetzelfde symbool."
        ),
        format!(
            "f_ct,eff = f_ctm = {f_ct_eff:.2} N/mm² (7.1(2)). Wordt scheurvorming eerder dan na \
             28 dagen verwacht, dan hoort hier de lagere f_ctm(t); die ouderdom kent dit model \
             niet."
        ),
        format!(
            "k = {k:.3} uit h = {h:.0} mm (7.3.2(2): 1,0 bij ≤ 300 mm, 0,65 bij ≥ 800 mm, \
             daartussen lineair)."
        ),
    ];
    if a_ct_mm2.is_none() {
        notes.push(format!(
            "A_ct = {a_ct:.0} mm² is uit de meetkunde afgeleid: bij zuivere buiging ligt de \
             nulspanningslijn vlak vóór het scheuren in het zwaartepunt van de ongescheurde \
             doorsnede, en de trekzone is de strook daaronder. Bij een rechthoek is dat b·h/2."
        ));
    }
    if g.section.shape.has_flange() {
        notes.push(
            "7.3.2(2) schrijft voor niet-rechthoekige doorsneden voor de minimumwapening PER \
             DEEL (lijf, flens) te bepalen, met (7.2) voor het lijf en (7.3) voor de flens en \
             met een eigen k per deel. Deze toets rekent één deel door met (7.2)."
                .to_string(),
        );
    }
    notes.push(
        "Deze toets zegt niets over de scheurwijdte zelf. 7.3.3 kan een LAGERE σ_s eisen dan de \
         hier gebruikte, en dan is meer wapening nodig dan A_s,min."
            .to_string(),
    );

    let deelstappen = vec![
        stap(
            "k_c",
            "Spanningsverdeling vlak vóór het scheuren",
            "k_c",
            "art. 7.3.2(2) (7.2) en (7.4)",
            r"k_c = 0{,}4\left[1 - \frac{\sigma_c}{k_1\,(h/h^{*})\,f_{ct,eff}}\right] \le 1",
            format!(
                r"k_c = 0{{,}}4\left[1 - \frac{{{sigma_c:.3}}}{{{k1:.3}\cdot({h:.0}/{hs:.0})\cdot{f_ct_eff:.2}}}\right] = {k_c:.3}",
                k1 = k_1_normaalkracht(g.invoer.n_ed_druk_positief_n, h),
                hs = h_ster_mm(h),
            ),
            vec![
                nv(r"\sigma_c", sigma_c, "N/mm²"),
                nv(
                    "k_1",
                    k_1_normaalkracht(g.invoer.n_ed_druk_positief_n, h),
                    "-",
                ),
                nv("h", h, "mm"),
                nv("h^{*}", h_ster_mm(h), "mm"),
                nv(r"f_{ct,eff}", f_ct_eff, "N/mm²"),
            ],
            Some(k_c),
            "-",
            vec![format!(
                "σ_c = N_Ed/(b·h) = {:.1}/({:.0}·{:.0}) = {sigma_c:.3} N/mm², met N_Ed \
                 DRUKKRACHT POSITIEF zoals (7.4) het vraagt.",
                g.invoer.n_ed_druk_positief_n,
                g.section.b_w_mm(),
                h
            )],
        ),
        stap(
            "a_s_min",
            "Minimumwapening",
            r"A_{s,min}",
            "art. 7.3.2(2) (7.1)",
            r"A_{s,min} = \frac{k_c\,k\,f_{ct,eff}\,A_{ct}}{\sigma_s}",
            format!(
                r"A_{{s,min}} = \frac{{{k_c:.3}\cdot{k:.3}\cdot{f_ct_eff:.2}\cdot{a_ct:.0}}}{{{sigma_s:.0}}} = {a_s_min:.0}\ \mathrm{{mm^2}}"
            ),
            vec![
                nv("k_c", k_c, "-"),
                nv("k", k, "-"),
                nv(r"f_{ct,eff}", f_ct_eff, "N/mm²"),
                nv(r"A_{ct}", a_ct, "mm²"),
                nv(r"\sigma_s", sigma_s, "N/mm²"),
            ],
            Some(a_s_min),
            "mm²",
            vec![],
        ),
    ];

    ResistanceCalc {
        id: id.to_string(),
        title: title.to_string(),
        article: article.to_string(),
        force_state,
        formula_latex: r"A_{s,min}\,\sigma_s = k_c\,k\,f_{ct,eff}\,A_{ct}".to_string(),
        variables: vec![
            nv("k_c", k_c, "-"),
            nv("k", k, "-"),
            nv(r"f_{ct,eff}", f_ct_eff, "N/mm²"),
            nv(r"A_{ct}", a_ct, "mm²"),
            nv(r"\sigma_s", sigma_s, "N/mm²"),
            nv(r"A_s", a_s, "mm²"),
        ],
        deelstappen,
        value: a_s_min,
        unit: "mm²".to_string(),
        uc: Some(UnityCheck {
            ed: a_s_min,
            rd: a_s,
            uc,
            formula_latex: r"A_{s,min} / A_s".to_string(),
        }),
        status: status_for(uc),
        notes,
    }
}

/// **7.3.3 — scheurbeheersing zonder directe berekening** (de tabelweg).
///
/// Dit is de weg die in de praktijk het meest wordt gelopen: begrens de
/// staafdiameter (tabel 7.2N, aangepast met (7.6N)) of de staafafstand (tabel
/// 7.3N). Bij scheuren door belasting volstaat één van beide (7.3.3(2)); bij
/// scheuren door belemmerde vervorming uitsluitend tabel 7.2N.
///
/// De toets levert de unity check van het criterium dat de doorsnede het
/// gúnstigst beoordeelt — dat is wat de norm toestaat — en schrijft het andere
/// criterium er in de notes bij, zodat de lezer beide ziet.
pub fn check_scheurbeheersing_tabel(
    g: &Scheurgegevens<'_>,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let id = "7.3.3_scheurbeheersing_tabel";
    let title = "Scheurbeheersing zonder directe berekening";
    let article = "art. 7.3.3(2), tabel 7.2N en 7.3N, met (7.6N)";

    let h = g.section.h_mm;
    let d = g.d_mm();
    let phi = g.phi_mm();
    let sigma_s = g.invoer.sigma_s_mpa;

    if plaat_vrijgesteld_7_3_3_1(
        g.invoer.plaat_in_gebouw,
        g.invoer.axiale_trek,
        h,
        g.invoer.detaillering_9_3_toegepast,
    ) {
        return niet_van_toepassing(
            id,
            title,
            article,
            force_state,
            format!(
                "7.3.3(1): voor gewapende of voorgespannen platen in gebouwen belast op buiging \
                 zonder significante axiale trek zijn specifieke maatregelen ter beheersing van \
                 scheurvorming niet nodig indien de totale hoogte niet groter dan 200 mm is en \
                 indien de bepalingen van 9.3 zijn toegepast. Hier: h = {h:.0} mm ≤ 200 mm, \
                 plaat in een gebouw, geen significante axiale trek, en de aanroeper bevestigt \
                 dat 9.3 is toegepast."
            ),
        );
    }

    let (w_max, kx) = match g.invoer.w_max_toegepast_mm() {
        Ok(v) => v,
        Err(e) => return niet_van_toepassing(id, title, article, force_state, e),
    };

    // --- criterium 1: de staafdiameter (tabel 7.2N + (7.6N)) ---
    let f_ct_eff = g.f_ct_eff_mpa();
    let sigma_c = sigma_c_mpa(g.invoer.n_ed_druk_positief_n, g.section.b_w_mm(), h);
    let k_c = k_c_lijf(sigma_c, h, f_ct_eff, g.invoer.n_ed_druk_positief_n);
    let diameter: Result<(f64, f64, f64), String> = (|| {
        let phi_ster = phi_ster_s_mm(sigma_s, w_max, g.invoer.aflezing)?;
        let (h_cr, _afgeleid) = h_cr_of_afgeleid(g.section, g.invoer)?;
        let geval = if g.invoer.axiale_trek {
            Belastingsgeval::AxialeTrek
        } else {
            Belastingsgeval::Buiging
        };
        let phi_max = aangepaste_staafdiameter(phi_ster, f_ct_eff, k_c, h_cr, h, d, geval)?;
        Ok((phi_ster, h_cr, phi_max))
    })();

    // --- criterium 2: de staafafstand (tabel 7.3N) ---
    let afstand: Result<(f64, f64), String> = (|| {
        let s = g.invoer.staafafstand_mm.ok_or_else(|| {
            "de werkelijke hart-op-hartafstand van de trekstaven is niet opgegeven; tabel 7.3N \
             is dan niet te toetsen"
                .to_string()
        })?;
        let s_max = staafafstand_max_mm(sigma_s, w_max, g.invoer.axiale_trek, g.invoer.aflezing)?;
        Ok((s, s_max))
    })();

    let mut notes = vec![
        format!(
            "σ_s = {sigma_s:.0} N/mm² hoort te zijn bepaald in een GESCHEURDE doorsnede onder de \
             {COMBINATIE_SCHEURWIJDTE}. Niet de UGT-spanning, niet f_yd en niet een ongescheurde \
             elastische spanning."
        ),
        format!(
            "w_max = {w_max:.2} mm uit de door de nationale bijlage GEAMENDEERDE tabel 7.1N \
             (milieuklasse {:?}). De EN-tabel is in de Nederlandse uitgave in haar geheel \
             doorgehaald; de NB-getallen zijn 0,40 / 0,30 / 0,20 mm voor elementen met \
             betonstaal.",
            g.invoer.milieuklasse
        ),
        AANNAMEN_TABEL_7_2N.to_string(),
    ];
    if (kx - 1.0).abs() > 1e-9 {
        notes.push(format!(
            "w_max is met k_x = {kx:.3} vermenigvuldigd (NB bij 7.3.1(5): k_x = c_toegepast/c_nom \
             ≤ 2). Die factor mag alleen bij een berekening voor de bepaling van de DUURZAAMHEID."
        ));
    }
    if let Some(v) = voetnoot_uiterlijk(g.invoer.milieuklasse) {
        notes.push(v.to_string());
    }
    match g.invoer.aflezing {
        Tabelaflezing::Conservatief => notes.push(
            "De tabellen zijn conservatief gelezen: bij een staalspanning tussen twee regels is \
             de regel met de eerstvolgende HOGERE staalspanning aangehouden. Er wordt dus \
             nergens tussen de regels geïnterpoleerd."
                .to_string(),
        ),
        Tabelaflezing::LineairGeinterpoleerd => notes.push(
            "De tabellen zijn lineair geïnterpoleerd tussen de regels. Dat is gebruikelijk, maar \
             het verloop tússen de regels spreekt de norm niet uit; het is een keuze."
                .to_string(),
        ),
    }
    if g.invoer.axiale_trek {
        notes.push(
            "De doorsnede staat onder axiale trek: de nationale bijlage eist dat de maximale \
             staafafstanden uit tabel 7.3N worden GEHALVEERD."
                .to_string(),
        );
    }

    let mut deelstappen = Vec::new();
    let uc_diameter = match &diameter {
        Ok((phi_ster, h_cr, phi_max)) => {
            deelstappen.push(stap(
                "phi_ster",
                "Maximale staafdiameter uit tabel 7.2N",
                r"\varnothing^{*}_{s}",
                "tabel 7.2N (NB: normatief)",
                r"\varnothing^{*}_{s} = f(\sigma_s;\ w_k)",
                format!(
                    r"\varnothing^{{*}}_{{s}}({sigma_s:.0}\ \mathrm{{N/mm^2}};\ w_k = {w_max:.2}\ \mathrm{{mm}}) = {phi_ster:.1}\ \mathrm{{mm}}"
                ),
                vec![nv(r"\sigma_s", sigma_s, "N/mm²"), nv("w_k", w_max, "mm")],
                Some(*phi_ster),
                "mm",
                vec![],
            ));
            deelstappen.push(stap(
                "phi_max",
                "Aangepaste maximale staafdiameter",
                r"\varnothing_s",
                "art. 7.3.3(2) (7.6N)",
                r"\varnothing_s = \varnothing^{*}_{s}\,\frac{f_{ct,eff}}{2{,}9}\,\frac{k_c\,h_{cr}}{2\,(h-d)}",
                format!(
                    r"\varnothing_s = {phi_ster:.1}\cdot\frac{{{f_ct_eff:.2}}}{{2{{,}}9}}\cdot\frac{{{k_c:.3}\cdot{h_cr:.1}}}{{2\cdot({h:.0}-{d:.1})}} = {phi_max:.2}\ \mathrm{{mm}}"
                ),
                vec![
                    nv(r"\varnothing^{*}_{s}", *phi_ster, "mm"),
                    nv(r"f_{ct,eff}", f_ct_eff, "N/mm²"),
                    nv("k_c", k_c, "-"),
                    nv(r"h_{cr}", *h_cr, "mm"),
                    nv("h", h, "mm"),
                    nv("d", d, "mm"),
                ],
                Some(*phi_max),
                "mm",
                vec![format!(
                    "h_cr hoort te zijn bepaald onder de {COMBINATIE_H_CR}; dat is de enige plek \
                     binnen §7.3 waar de quasi-blijvende combinatie is blijven staan. d is hier \
                     de effectieve hoogte tot het zwaartepunt van de BUITENSTE wapeningslaag."
                )],
            ));
            if phi > 0.0 && *phi_max > 0.0 {
                Some(phi / phi_max)
            } else {
                None
            }
        }
        Err(e) => {
            notes.push(format!("Tabel 7.2N is hier niet gebruikt: {e}."));
            None
        }
    };

    let uc_afstand = match &afstand {
        Ok((s, s_max)) => {
            deelstappen.push(stap(
                "s_max",
                "Maximale staafafstand uit tabel 7.3N",
                r"s_{max}",
                "tabel 7.3N (NB: normatief)",
                r"s_{max} = f(\sigma_s;\ w_k)",
                format!(
                    r"s_{{max}}({sigma_s:.0}\ \mathrm{{N/mm^2}};\ w_k = {w_max:.2}\ \mathrm{{mm}}) = {s_max:.0}\ \mathrm{{mm}}"
                ),
                vec![nv(r"\sigma_s", sigma_s, "N/mm²"), nv("w_k", w_max, "mm")],
                Some(*s_max),
                "mm",
                vec![],
            ));
            if *s_max > 0.0 {
                Some(s / s_max)
            } else {
                None
            }
        }
        Err(e) => {
            notes.push(format!("Tabel 7.3N is hier niet gebruikt: {e}."));
            None
        }
    };

    // 7.3.3(2): bij belemmerde vervorming telt alleen tabel 7.2N mee.
    let (uc, ed, rd, unit, formula, welke) = match g.invoer.scheuroorzaak {
        Scheuroorzaak::BelemmerdeVervorming => match (uc_diameter, &diameter) {
            (Some(u), Ok((_, _, phi_max))) => (
                u,
                phi,
                *phi_max,
                "mm",
                r"\varnothing / \varnothing_{s,max}",
                "tabel 7.2N (staafdiameter)",
            ),
            _ => {
                return niet_van_toepassing(
                    id,
                    title,
                    article,
                    force_state,
                    format!(
                        "De scheuren ontstaan in hoofdzaak door belemmerde vervorming; 7.3.3(2) \
                         laat dan uitsluitend tabel 7.2N toe, en die is hier niet te lezen. {}",
                        diameter.err().unwrap_or_default()
                    ),
                )
            }
        },
        Scheuroorzaak::Belasting => {
            // "voldaan ofwel aan de bepalingen van tabel 7.2N of aan die van
            // tabel 7.3N" — dus de gunstigste van de twee is maatgevend.
            match (uc_diameter, uc_afstand) {
                (Some(ud), Some(ua)) => {
                    if ud <= ua {
                        let (_, _, phi_max) = diameter.as_ref().unwrap();
                        (
                            ud,
                            phi,
                            *phi_max,
                            "mm",
                            r"\varnothing / \varnothing_{s,max}",
                            "tabel 7.2N (staafdiameter)",
                        )
                    } else {
                        let (s, s_max) = afstand.as_ref().unwrap();
                        (
                            ua,
                            *s,
                            *s_max,
                            "mm",
                            r"s / s_{max}",
                            "tabel 7.3N (staafafstand)",
                        )
                    }
                }
                (Some(ud), None) => {
                    let (_, _, phi_max) = diameter.as_ref().unwrap();
                    (
                        ud,
                        phi,
                        *phi_max,
                        "mm",
                        r"\varnothing / \varnothing_{s,max}",
                        "tabel 7.2N (staafdiameter)",
                    )
                }
                (None, Some(ua)) => {
                    let (s, s_max) = afstand.as_ref().unwrap();
                    (
                        ua,
                        *s,
                        *s_max,
                        "mm",
                        r"s / s_{max}",
                        "tabel 7.3N (staafafstand)",
                    )
                }
                (None, None) => {
                    return niet_van_toepassing(
                        id,
                        title,
                        article,
                        force_state,
                        "Geen van beide tabellen van 7.3.3 is hier te lezen; zie de notes."
                            .to_string(),
                    )
                }
            }
        }
    };

    notes.push(format!(
        "Maatgevend is {welke}: {ed:.1} mm tegen {rd:.2} mm, unity check {uc:.2}."
    ));
    if g.invoer.scheuroorzaak == Scheuroorzaak::Belasting {
        if let (Some(ud), Some(ua)) = (uc_diameter, uc_afstand) {
            notes.push(format!(
                "7.3.3(2) laat bij scheuren door belasting toe dat aan tabel 7.2N ÓF aan tabel \
                 7.3N wordt voldaan. Staafdiameter: unity check {ud:.2}; staafafstand: unity \
                 check {ua:.2}. De gunstigste van de twee is aangehouden."
            ));
        }
    } else {
        notes.push(
            "De scheuren ontstaan in hoofdzaak door belemmerde vervorming; 7.3.3(2) laat dan \
             uitsluitend tabel 7.2N toe, met σ_s = de spanning onmiddellijk na scheurvorming \
             (de σ_s van (7.1))."
                .to_string(),
        );
    }
    notes.push(
        "Deze weg vervangt de rekenweg van 7.3.4 en levert dus geen scheurwijdte w_k. Zij geldt \
         bovendien alleen als de minimumwapening van 7.3.2 aanwezig is (7.3.3(2), OPMERKING)."
            .to_string(),
    );

    ResistanceCalc {
        id: id.to_string(),
        title: title.to_string(),
        article: article.to_string(),
        force_state,
        formula_latex: formula.to_string(),
        variables: vec![
            nv(r"\sigma_s", sigma_s, "N/mm²"),
            nv(r"w_{max}", w_max, "mm"),
            nv("h", h, "mm"),
            nv("d", d, "mm"),
            nv(r"\varnothing", phi, "mm"),
            nv("k_c", k_c, "-"),
            nv(r"f_{ct,eff}", f_ct_eff, "N/mm²"),
        ],
        deelstappen,
        value: rd,
        unit: unit.to_string(),
        uc: Some(UnityCheck {
            ed,
            rd,
            uc,
            formula_latex: formula.to_string(),
        }),
        status: status_for(uc),
        notes,
    }
}

/// **7.3.4 — berekening van de scheurwijdte.**
///
/// w_k = s_r,max (ε_sm − ε_cm) (7.8), getoetst tegen w_max uit de geamendeerde
/// tabel 7.1N.
pub fn check_scheurwijdte_berekend(
    g: &Scheurgegevens<'_>,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let id = "7.3.4_scheurwijdte";
    let title = "Scheurwijdte";
    let article = "art. 7.3.4 (7.8)–(7.11), met de NB-bovengrens op (7.11)";

    let h = g.section.h_mm;
    let d = g.d_mm();
    let phi = g.phi_mm();
    let a_s = g.a_s_trek_mm2();
    let f_ct_eff = g.f_ct_eff_mpa();
    let sigma_s = g.invoer.sigma_s_mpa;
    let x = g.invoer.x_mm;

    let (w_max, kx) = match g.invoer.w_max_toegepast_mm() {
        Ok(v) => v,
        Err(e) => return niet_van_toepassing(id, title, article, force_state, e),
    };

    let h_c_ef = h_c_ef_mm(h, d, x);
    let a_c_eff = a_c_eff_mm2(g.section, h_c_ef, g.invoer.trek_onder);
    let rho = match rho_p_eff(a_s, a_c_eff) {
        Ok(v) => v,
        Err(e) => return niet_van_toepassing(id, title, article, force_state, e),
    };
    let a_e = alpha_e(g.beton.e_cm);
    let k_t = g.invoer.belastingsduur.k_t();
    let (eps, ondergrens) = match rekverschil(sigma_s, k_t, f_ct_eff, rho, a_e) {
        Ok(v) => v,
        Err(e) => return niet_van_toepassing(id, title, article, force_state, e),
    };

    let c = Scheurinvoer::c_langswapening_mm(g.cage);
    let k_1 = g.invoer.aanhechting.k_1();
    let k_2 = g.invoer.rekverdeling.k_2();
    let sr = match scheurafstand(
        c,
        phi,
        rho,
        k_1,
        k_2,
        g.beton.f_ck,
        g.invoer.staafafstand_mm,
        h,
        x,
    ) {
        Ok(v) => v,
        Err(e) => return niet_van_toepassing(id, title, article, force_state, e),
    };

    let w_k = w_k_mm(sr.s_r_max_mm, eps);
    let uc = if w_max > 0.0 {
        w_k / w_max
    } else {
        f64::INFINITY
    };

    let mut notes = vec![
        format!(
            "σ_s = {sigma_s:.0} N/mm² hoort te zijn bepaald in een GESCHEURDE doorsnede onder de \
             {COMBINATIE_SCHEURWIJDTE}."
        ),
        format!(
            "w_max = {w_max:.2} mm uit de door de nationale bijlage GEAMENDEERDE tabel 7.1N \
             (milieuklasse {:?}, {})",
            g.invoer.milieuklasse,
            match g.invoer.elementtype {
                Elementtype::Betonstaal => "elementen met betonstaal",
                Elementtype::CombinatieMetAanhechting =>
                    "combinatie van betonstaal en voorspanstaal met aanhechting",
                Elementtype::UitsluitendVoorspanstaalMetAanhechting =>
                    "uitsluitend voorspanstaal met aanhechting",
            }
        ),
        format!(
            "c = {c:.0} mm is de dekking op de LANGSWAPENING (7.3.4(3)): c_nom van de korf plus \
             de beugeldiameter, want de korf voert c_nom op de beugel in."
        ),
        format!("f_ct,eff = f_ctm = {f_ct_eff:.2} N/mm² — 7.1(2) schrijft voor scheurwijdtes f_ctm voor, niet f_ctm,fl."),
    ];
    if (kx - 1.0).abs() > 1e-9 {
        notes.push(format!(
            "w_max is met k_x = {kx:.3} vermenigvuldigd (NB bij 7.3.1(5), k_x ≤ 2). Alleen \
             toegestaan bij een berekening voor de bepaling van de duurzaamheid."
        ));
    }
    if let Some(v) = voetnoot_uiterlijk(g.invoer.milieuklasse) {
        notes.push(v.to_string());
    }
    if ondergrens {
        notes.push(
            "De ondergrens 0,6·σ_s/E_s van (7.9) is maatgevend: de tension stiffening telt hier \
             niet meer mee."
                .to_string(),
        );
    }
    match sr.bron {
        ScheurafstandBron::Vergelijking7_11 => notes.push(format!(
            "(7.11) is gebruikt: de staafafstand ({} mm) is niet groter dan 5(c + Ø/2) = {:.0} mm.",
            g.invoer
                .staafafstand_mm
                .map(|s| format!("{s:.0}"))
                .unwrap_or_else(|| "onbekend".to_string()),
            sr.grens_5c_mm
        )),
        ScheurafstandBron::Vergelijking7_11NbBovengrens => notes.push(format!(
            "De door de nationale bijlage aan (7.11) TOEGEVOEGDE bovengrens is maatgevend: \
             s_r,max ≤ de grootste waarde van (50 − 0,8·f_ck)·Ø en 15·Ø, hier {:.0} mm tegen \
             {:.0} mm uit de formule zelf. De EN kent deze grens niet.",
            sr.nb_bovengrens_mm.unwrap_or_default(),
            sr.s_r_max_7_11_mm.unwrap_or_default()
        )),
        ScheurafstandBron::Vergelijking7_14 => notes.push(format!(
            "(7.14) is gebruikt: s_r,max = 1,3(h − x). Reden: {}. Dat geeft een aanmerkelijk \
             grotere scheurafstand dan (7.11).",
            match g.invoer.staafafstand_mm {
                Some(s) => format!(
                    "de hart-op-hartafstand ({s:.0} mm) is groter dan 5(c + Ø/2) = {:.0} mm",
                    sr.grens_5c_mm
                ),
                None => "de werkelijke hart-op-hartafstand van de staven is niet opgegeven, en \
                         (7.11) mag alleen worden gebruikt als aantoonbaar aan 5(c + Ø/2) is \
                         voldaan"
                    .to_string(),
            }
        )),
    }
    if g.invoer.rekverdeling == Rekverdeling::Buiging && g.invoer.axiale_trek {
        notes.push(
            "LET OP: k_2 = 0,5 (buiging) is aangehouden terwijl de doorsnede onder axiale trek \
             staat. Bij excentrische trek eist 7.3.4(3) de tussenwaarde van (7.13); 0,5 is daar \
             onveilig."
                .to_string(),
        );
    }

    let deelstappen = vec![
        stap(
            "h_c_ef",
            "Effectief trekgebied",
            r"h_{c,ef}",
            "art. 7.3.2(3), figuur 7.1",
            r"h_{c,ef} = \min\{2{,}5\,(h-d);\ (h-x)/3;\ h/2\}",
            format!(
                r"h_{{c,ef}} = \min\{{2{{,}}5\cdot({h:.0}-{d:.1});\ ({h:.0}-{x:.1})/3;\ {h:.0}/2\}} = {h_c_ef:.1}\ \mathrm{{mm}}"
            ),
            vec![nv("h", h, "mm"), nv("d", d, "mm"), nv("x", x, "mm")],
            Some(h_c_ef),
            "mm",
            vec![
                "x is de drukzonehoogte in de GESCHEURDE doorsnede in de BGT, niet de x van het \
                 spanningsblok in de UGT."
                    .to_string(),
            ],
        ),
        stap(
            "rho_p_eff",
            "Effectief wapeningspercentage",
            r"\rho_{p,eff}",
            "art. 7.3.4(2) (7.10)",
            r"\rho_{p,eff} = \frac{A_s}{A_{c,eff}}",
            format!(r"\rho_{{p,eff}} = \frac{{{a_s:.0}}}{{{a_c_eff:.0}}} = {rho:.5}"),
            vec![nv("A_s", a_s, "mm²"), nv(r"A_{c,eff}", a_c_eff, "mm²")],
            Some(rho),
            "-",
            vec![
                "A_c,eff = de breedte aan de trekrand maal h_c,ef (figuur 7.1). Er is geen \
                 voorspanning, dus de term ξ_1·A_p′ van (7.10) is nul."
                    .to_string(),
            ],
        ),
        stap(
            "eps",
            "Rekverschil",
            r"\varepsilon_{sm}-\varepsilon_{cm}",
            "art. 7.3.4(2) (7.9)",
            r"\varepsilon_{sm}-\varepsilon_{cm} = \frac{\sigma_s - k_t\,\dfrac{f_{ct,eff}}{\rho_{p,eff}}\,(1+\alpha_e\rho_{p,eff})}{E_s} \ge 0{,}6\,\frac{\sigma_s}{E_s}",
            format!(
                r"\varepsilon_{{sm}}-\varepsilon_{{cm}} = \frac{{{sigma_s:.0} - {k_t:.1}\cdot\dfrac{{{f_ct_eff:.2}}}{{{rho:.5}}}\cdot(1+{a_e:.2}\cdot{rho:.5})}}{{{E_S:.0}}} = {eps:.6}"
            ),
            vec![
                nv(r"\sigma_s", sigma_s, "N/mm²"),
                nv("k_t", k_t, "-"),
                nv(r"f_{ct,eff}", f_ct_eff, "N/mm²"),
                nv(r"\rho_{p,eff}", rho, "-"),
                nv(r"\alpha_e", a_e, "-"),
                nv("E_s", E_S, "N/mm²"),
            ],
            Some(eps),
            "-",
            vec![format!(
                "k_t = {k_t:.1} ({}). α_e = E_s/E_cm = {:.0}/{:.0} = {a_e:.2}.",
                match g.invoer.belastingsduur {
                    Belastingsduur::Kortdurend => "kortdurende belasting",
                    Belastingsduur::Langdurend => "langdurende belasting",
                },
                E_S,
                g.beton.e_cm
            )],
        ),
        stap(
            "s_r_max",
            "Maximale scheurafstand",
            r"s_{r,max}",
            "art. 7.3.4(3) (7.11) met NB-bovengrens, of (7.14)",
            match sr.bron {
                ScheurafstandBron::Vergelijking7_14 => r"s_{r,max} = 1{,}3\,(h-x)",
                _ => {
                    r"s_{r,max} = k_3 c + \frac{k_1 k_2 k_4 \varnothing}{\rho_{p,eff}} \le \max\{(50-0{,}8 f_{ck})\varnothing;\ 15\varnothing\}"
                }
            },
            match sr.bron {
                ScheurafstandBron::Vergelijking7_14 => format!(
                    r"s_{{r,max}} = 1{{,}}3\cdot({h:.0}-{x:.1}) = {:.1}\ \mathrm{{mm}}",
                    sr.s_r_max_mm
                ),
                _ => format!(
                    r"s_{{r,max}} = {K_3}\cdot{c:.0} + \frac{{{k_1}\cdot{k_2}\cdot{K_4}\cdot{phi:.0}}}{{{rho:.5}}} = {:.1}\ \mathrm{{mm}}",
                    sr.s_r_max_7_11_mm.unwrap_or_default()
                ),
            },
            vec![
                nv("k_3", K_3, "-"),
                nv("c", c, "mm"),
                nv("k_1", k_1, "-"),
                nv("k_2", k_2, "-"),
                nv("k_4", K_4, "-"),
                nv(r"\varnothing", phi, "mm"),
                nv(r"\rho_{p,eff}", rho, "-"),
                nv(r"f_{ck}", g.beton.f_ck, "N/mm²"),
            ],
            Some(sr.s_r_max_mm),
            "mm",
            vec![format!(
                "k_3 = 3,4 en k_4 = 0,425 zijn door de nationale bijlage normatief vastgelegd. \
                 De bovengrens max{{(50 − 0,8 f_ck)Ø; 15Ø}} = {:.0} mm is eveneens een \
                 NB-toevoeging; de EN kent haar niet.",
                nb_bovengrens_s_r_max_mm(g.beton.f_ck, phi)
            )],
        ),
        stap(
            "w_k",
            "Scheurwijdte",
            "w_k",
            "art. 7.3.4(1) (7.8)",
            r"w_k = s_{r,max}\,(\varepsilon_{sm}-\varepsilon_{cm})",
            format!(
                r"w_k = {:.1}\cdot{eps:.6} = {w_k:.3}\ \mathrm{{mm}}",
                sr.s_r_max_mm
            ),
            vec![
                nv(r"s_{r,max}", sr.s_r_max_mm, "mm"),
                nv(r"\varepsilon_{sm}-\varepsilon_{cm}", eps, "-"),
            ],
            Some(w_k),
            "mm",
            vec![],
        ),
    ];

    ResistanceCalc {
        id: id.to_string(),
        title: title.to_string(),
        article: article.to_string(),
        force_state,
        formula_latex: r"w_k = s_{r,max}\,(\varepsilon_{sm}-\varepsilon_{cm})".to_string(),
        variables: vec![
            nv(r"\sigma_s", sigma_s, "N/mm²"),
            nv("x", x, "mm"),
            nv("d", d, "mm"),
            nv(r"h_{c,ef}", h_c_ef, "mm"),
            nv(r"A_{c,eff}", a_c_eff, "mm²"),
            nv(r"\rho_{p,eff}", rho, "-"),
            nv(r"\alpha_e", a_e, "-"),
            nv("k_t", k_t, "-"),
            nv(r"s_{r,max}", sr.s_r_max_mm, "mm"),
            nv(r"w_{max}", w_max, "mm"),
        ],
        deelstappen,
        value: w_k,
        unit: "mm".to_string(),
        uc: Some(UnityCheck {
            ed: w_k,
            rd: w_max,
            uc,
            formula_latex: r"w_k / w_{max}".to_string(),
        }),
        status: status_for(uc),
        notes,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::section::{RebarRow, ReinforcementCage};
    use approx::assert_relative_eq;

    fn korf(cover: f64, phi: f64, aantal: u32) -> ReinforcementCage {
        ReinforcementCage {
            cover_mm: cover,
            stirrup_diameter_mm: 0.0,
            bottom: RebarRow {
                count: aantal,
                diameter_mm: phi,
            },
            ..ReinforcementCage::default()
        }
    }

    fn snapshot() -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 15,
            position_mm: 0.0,
            forces: Default::default(),
        }
    }

    // -- 7.3.1 --------------------------------------------------------------

    #[test]
    fn de_nb_tabel_7_1n_geeft_andere_getallen_dan_de_en() {
        // Kolom 1 van de GEAMENDEERDE tabel: 0,40 / 0,30 / 0,20 mm.
        assert_eq!(
            w_max_mm(ExposureClass::X0, Elementtype::Betonstaal),
            Ok(0.40)
        );
        assert_eq!(
            w_max_mm(ExposureClass::XC1, Elementtype::Betonstaal),
            Ok(0.40)
        );
        assert_eq!(
            w_max_mm(ExposureClass::XC2, Elementtype::Betonstaal),
            Ok(0.30)
        );
        assert_eq!(
            w_max_mm(ExposureClass::XC4, Elementtype::Betonstaal),
            Ok(0.30)
        );
        // Hier wijkt de NB het duidelijkst af: de EN suggereert bij XD/XS
        // "decompressie" en niets voor gewapend beton; de NB geeft 0,20 mm.
        assert_eq!(
            w_max_mm(ExposureClass::XD3, Elementtype::Betonstaal),
            Ok(0.20)
        );
        assert_eq!(
            w_max_mm(ExposureClass::XS1, Elementtype::Betonstaal),
            Ok(0.20)
        );
        // Kolom 2.
        assert_eq!(
            w_max_mm(ExposureClass::XC1, Elementtype::CombinatieMetAanhechting),
            Ok(0.30)
        );
        assert_eq!(
            w_max_mm(ExposureClass::XC3, Elementtype::CombinatieMetAanhechting),
            Ok(0.20)
        );
        assert_eq!(
            w_max_mm(ExposureClass::XS3, Elementtype::CombinatieMetAanhechting),
            Ok(0.10)
        );
    }

    #[test]
    fn xf_en_xa_staan_niet_in_tabel_7_1n() {
        assert!(w_max_mm(ExposureClass::XF3, Elementtype::Betonstaal).is_err());
        assert!(w_max_mm(ExposureClass::XA1, Elementtype::Betonstaal).is_err());
    }

    #[test]
    fn kolom_drie_geeft_een_spanningsgrens_en_geen_scheurwijdte() {
        assert!(w_max_mm(
            ExposureClass::XC1,
            Elementtype::UitsluitendVoorspanstaalMetAanhechting
        )
        .is_err());
        assert_eq!(delta_sigma_p_grens(ExposureClass::XC1), Ok(275.0));
        assert_eq!(delta_sigma_p_grens(ExposureClass::XC4), Ok(175.0));
        assert_eq!(delta_sigma_p_grens(ExposureClass::XD2), Ok(75.0));
    }

    #[test]
    fn k_x_is_begrensd_op_twee() {
        // Handberekening: 45/30 = 1,5.
        assert_relative_eq!(k_x(45.0, 30.0).unwrap(), 1.5, epsilon = 1e-12);
        // 80/30 = 2,667 → afgekapt op 2.
        assert_relative_eq!(k_x(80.0, 30.0).unwrap(), 2.0, epsilon = 1e-12);
        // c_toegepast < c_nom mag niet.
        assert!(k_x(25.0, 30.0).is_err());
    }

    // -- 7.3.2 --------------------------------------------------------------

    #[test]
    fn k_uit_7_3_2_interpoleert_lineair_tussen_300_en_800_mm() {
        assert_relative_eq!(k_eigenspanningen(200.0), 1.0, epsilon = 1e-12);
        assert_relative_eq!(k_eigenspanningen(300.0), 1.0, epsilon = 1e-12);
        assert_relative_eq!(k_eigenspanningen(800.0), 0.65, epsilon = 1e-12);
        assert_relative_eq!(k_eigenspanningen(1200.0), 0.65, epsilon = 1e-12);
        // Handberekening bij h = 550 mm, precies halverwege:
        // k = 1,0 − (550−300)/500 · 0,35 = 1,0 − 0,5·0,35 = 0,825.
        assert_relative_eq!(k_eigenspanningen(550.0), 0.825, epsilon = 1e-12);
        // Handberekening bij h = 500 mm:
        // k = 1,0 − 200/500 · 0,35 = 1,0 − 0,14 = 0,86.
        assert_relative_eq!(k_eigenspanningen(500.0), 0.86, epsilon = 1e-12);
    }

    #[test]
    fn k_c_is_exact_nul_komma_vier_bij_zuivere_buiging() {
        // σ_c = 0 → k_c = 0,4·[1 − 0] = 0,4. Dat is óók de waarde waarop
        // tabel 7.2N berust (OPMERKING 1).
        assert_relative_eq!(k_c_lijf(0.0, 280.0, 2.2, 0.0), 0.4, epsilon = 1e-12);
    }

    #[test]
    fn k_c_bij_druk_en_bij_trek_handberekend() {
        // DRUK. b = 300, h = 500, N_Ed = +300 kN druk, C30/37 → f_ctm = 2,9.
        // σ_c = 300 000/(300·500) = 2,0 N/mm².
        // k_1 = 1,5 (druk); h* = 500 mm want h < 1,0 m, dus h/h* = 1.
        // k_c = 0,4·[1 − 2,0/(1,5·1·2,9)] = 0,4·[1 − 2,0/4,35]
        //     = 0,4·[1 − 0,4597701] = 0,4·0,5402299 = 0,21609195.
        let sc = sigma_c_mpa(300_000.0, 300.0, 500.0);
        assert_relative_eq!(sc, 2.0, epsilon = 1e-12);
        assert_relative_eq!(
            k_c_lijf(sc, 500.0, 2.9, 300_000.0),
            0.216_091_954_022_988_5,
            epsilon = 1e-9
        );
        // TREK. N_Ed = −300 kN (trek) → σ_c = −2,0.
        // k_1 = 2h*/(3h) = 2·500/(3·500) = 0,6666667.
        // k_c = 0,4·[1 − (−2,0)/(0,6666667·1·2,9)] = 0,4·[1 + 2,0/1,9333333]
        //     = 0,4·[1 + 1,0344828] = 0,4·2,0344828 = 0,8137931.
        let st = sigma_c_mpa(-300_000.0, 300.0, 500.0);
        assert_relative_eq!(st, -2.0, epsilon = 1e-12);
        assert_relative_eq!(
            k_c_lijf(st, 500.0, 2.9, -300_000.0),
            0.813_793_103_448_275_9,
            epsilon = 1e-9
        );
    }

    #[test]
    fn k_c_van_de_flens_heeft_een_ondergrens_van_nul_komma_vijf() {
        // Handberekening: F_cr = 200 kN, A_ct = 100 000 mm², f_ct,eff = 2,9.
        // k_c = 0,9·200 000/(100 000·2,9) = 180 000/290 000 = 0,62068966.
        assert_relative_eq!(
            k_c_flens(200_000.0, 100_000.0, 2.9),
            0.620_689_655_172_413_8,
            epsilon = 1e-9
        );
        // Kleine trekkracht: 0,9·50 000/290 000 = 0,15517 → afgekapt op 0,5.
        assert_relative_eq!(k_c_flens(50_000.0, 100_000.0, 2.9), 0.5, epsilon = 1e-12);
    }

    #[test]
    fn a_s_min_van_een_plaatstrook_handberekend() {
        // 1000 × 280 mm, C20/25 (f_ctm = 2,2), B500, zuivere buiging.
        // k = 1,0 (h = 280 ≤ 300); k_c = 0,4; A_ct = 1000·280/2 = 140 000 mm².
        // A_s,min = 0,4·1,0·2,2·140 000/500 = 123 200/500 = 246,4 mm².
        assert_relative_eq!(
            a_s_min_mm2(0.4, 1.0, 2.2, 140_000.0, 500.0).unwrap(),
            246.4,
            epsilon = 1e-9
        );
    }

    #[test]
    fn de_toets_minimumwapening_leidt_a_ct_af_bij_zuivere_buiging() {
        let sec = ConcreteSection::rectangle(1000.0, 280.0);
        let cage = korf(25.0, 10.0, 7); // 7Ø10 ≈ Ø10-150 per meter
        let beton = concrete_class_by_name("C20/25").unwrap();
        let staal = reinforcement_grade_by_name("B500B").unwrap();
        let inv =
            Scheurinvoer::buiging(200.0, 40.0, ExposureClass::XC1, Belastingsduur::Langdurend);
        let g = Scheurgegevens {
            section: &sec,
            cage: &cage,
            beton,
            staal,
            invoer: &inv,
        };
        let r = check_minimumwapening(&g, None, None, snapshot());
        // A_ct = 1000·140 = 140 000 mm² → A_s,min = 246,4 mm² (zie de test hierboven).
        assert_relative_eq!(r.value, 246.4, epsilon = 1e-6);
        // A_s = 7·π/4·10² = 7·78,539816 = 549,7787 mm².
        let a_s = 7.0 * std::f64::consts::PI * 25.0;
        assert_relative_eq!(r.uc.as_ref().unwrap().rd, a_s, epsilon = 1e-9);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 246.4 / a_s, epsilon = 1e-9);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn zonder_a_ct_en_met_normaalkracht_weigert_de_minimumwapening() {
        let sec = ConcreteSection::rectangle(300.0, 500.0);
        let cage = korf(30.0, 16.0, 3);
        let beton = concrete_class_by_name("C30/37").unwrap();
        let staal = reinforcement_grade_by_name("B500B").unwrap();
        let mut inv =
            Scheurinvoer::buiging(200.0, 100.0, ExposureClass::XC3, Belastingsduur::Langdurend);
        inv.n_ed_druk_positief_n = 250_000.0;
        let g = Scheurgegevens {
            section: &sec,
            cage: &cage,
            beton,
            staal,
            invoer: &inv,
        };
        let r = check_minimumwapening(&g, None, None, snapshot());
        assert_eq!(r.status, CheckStatus::NotApplicable);
        assert!(r.notes[0].contains("A_ct is niet opgegeven"));
    }

    // -- 7.3.3 --------------------------------------------------------------

    #[test]
    fn tabel_7_2n_en_7_3n_op_hun_eigen_regels() {
        let a = Tabelaflezing::Conservatief;
        assert_eq!(phi_ster_s_mm(160.0, 0.4, a), Ok(40.0));
        assert_eq!(phi_ster_s_mm(320.0, 0.4, a), Ok(12.0));
        assert_eq!(phi_ster_s_mm(360.0, 0.4, a), Ok(10.0));
        assert_eq!(phi_ster_s_mm(450.0, 0.3, a), Ok(5.0));
        assert_eq!(staafafstand_max_mm(320.0, 0.4, false, a), Ok(150.0));
        assert_eq!(staafafstand_max_mm(280.0, 0.3, false, a), Ok(150.0));
        assert_eq!(staafafstand_max_mm(200.0, 0.2, false, a), Ok(150.0));
    }

    #[test]
    fn het_streepje_in_de_tabel_is_geen_getal() {
        // 450 MPa, w_k = 0,2 mm: de norm zet daar "–". Dat betekent GEEN
        // oplossing — niet nul, niet oneindig.
        let e = phi_ster_s_mm(450.0, 0.2, Tabelaflezing::Conservatief).unwrap_err();
        assert!(e.contains("streepje"));
        // Tabel 7.3N: 320 MPa bij w_k = 0,2 mm is eveneens een streepje.
        assert!(staafafstand_max_mm(320.0, 0.2, false, Tabelaflezing::Conservatief).is_err());
    }

    #[test]
    fn boven_de_laatste_regel_geeft_de_tabel_niets() {
        // Tabel 7.3N loopt tot 360 MPa.
        assert!(staafafstand_max_mm(400.0, 0.4, false, Tabelaflezing::Conservatief).is_err());
        // Tabel 7.2N loopt tot 450 MPa.
        assert!(phi_ster_s_mm(500.0, 0.4, Tabelaflezing::Conservatief).is_err());
    }

    #[test]
    fn conservatief_lezen_rondt_de_staalspanning_omhoog() {
        // σ_s = 300 ligt tussen 280 (Ø* = 16) en 320 (Ø* = 12). Conservatief
        // is de regel van 320: de kleinste diameter, dus de scherpste eis.
        assert_eq!(
            phi_ster_s_mm(300.0, 0.4, Tabelaflezing::Conservatief),
            Ok(12.0)
        );
        // Lineair: 16 + (300−280)/40 · (12−16) = 16 − 2 = 14.
        assert_eq!(
            phi_ster_s_mm(300.0, 0.4, Tabelaflezing::LineairGeinterpoleerd),
            Ok(14.0)
        );
        // Onder de eerste regel: de grootste getabelleerde waarde.
        assert_eq!(
            phi_ster_s_mm(100.0, 0.4, Tabelaflezing::Conservatief),
            Ok(40.0)
        );
    }

    #[test]
    fn de_nb_halveert_de_staafafstand_bij_axiale_trek() {
        let a = Tabelaflezing::Conservatief;
        assert_eq!(staafafstand_max_mm(240.0, 0.4, false, a), Ok(250.0));
        assert_eq!(staafafstand_max_mm(240.0, 0.4, true, a), Ok(125.0));
    }

    #[test]
    fn w_max_tussen_twee_kolommen_valt_terug_op_de_lagere_kolom() {
        // w_max = 0,45 mm (0,30 × k_x = 1,5). De tabel kent alleen 0,4/0,3/0,2;
        // de kolom 0,4 is de grootste die er nog onder past.
        assert_eq!(
            phi_ster_s_mm(320.0, 0.45, Tabelaflezing::Conservatief),
            Ok(12.0)
        );
        // Onder 0,20 mm biedt de tabel niets.
        assert!(phi_ster_s_mm(320.0, 0.10, Tabelaflezing::Conservatief).is_err());
    }

    #[test]
    fn vergelijking_7_6n_handberekend() {
        // Ø* = 12 mm, f_ct,eff = 2,2, k_c = 0,4, h = 280, h_cr = 140, d = 250.
        // Ø_s = 12 · (2,2/2,9) · (0,4·140)/(2·30)
        //     = 12 · 0,75862069 · 56/60
        //     = 12 · 0,75862069 · 0,93333333 = 8,4965517 mm.
        let v = aangepaste_staafdiameter(
            12.0,
            2.2,
            0.4,
            140.0,
            280.0,
            250.0,
            Belastingsgeval::Buiging,
        )
        .unwrap();
        assert_relative_eq!(v, 8.496_551_724_137_93, epsilon = 1e-9);
    }

    #[test]
    fn vergelijking_7_7n_is_bewust_niet_geimplementeerd() {
        let e = aangepaste_staafdiameter(
            12.0,
            2.2,
            0.4,
            140.0,
            280.0,
            250.0,
            Belastingsgeval::AxialeTrek,
        )
        .unwrap_err();
        assert!(e.contains("(7.7N)"));
        assert!(e.contains("niet met zekerheid te lezen"));
    }

    #[test]
    fn de_vrijstelling_voor_platen_vraagt_alle_voorwaarden() {
        // 7.3.3(1): plaat in een gebouw, buiging zonder significante axiale
        // trek, h ≤ 200 mm, én 9.3 toegepast.
        assert!(plaat_vrijgesteld_7_3_3_1(true, false, 200.0, true));
        assert!(plaat_vrijgesteld_7_3_3_1(true, false, 150.0, true));
        // 201 mm is al te hoog.
        assert!(!plaat_vrijgesteld_7_3_3_1(true, false, 201.0, true));
        // Significante axiale trek sluit de vrijstelling uit.
        assert!(!plaat_vrijgesteld_7_3_3_1(true, true, 150.0, true));
        // Geen plaat.
        assert!(!plaat_vrijgesteld_7_3_3_1(false, false, 150.0, true));
        // 9.3 niet toegepast.
        assert!(!plaat_vrijgesteld_7_3_3_1(true, false, 150.0, false));
    }

    // -- 7.3.4 --------------------------------------------------------------

    #[test]
    fn h_c_ef_is_het_minimum_van_drie_uitdrukkingen() {
        // h = 600, d = 550, x = 150.
        // 2,5(h−d) = 125; (h−x)/3 = 150; h/2 = 300 → 125.
        assert_relative_eq!(h_c_ef_mm(600.0, 550.0, 150.0), 125.0, epsilon = 1e-12);
        // h = 600, d = 500, x = 150: 2,5·100 = 250; 450/3 = 150; 300 → 150.
        assert_relative_eq!(h_c_ef_mm(600.0, 500.0, 150.0), 150.0, epsilon = 1e-12);
        // h = 200, d = 100, x = 20: 2,5·100 = 250; 180/3 = 60; 100 → 60.
        assert_relative_eq!(h_c_ef_mm(200.0, 100.0, 20.0), 60.0, epsilon = 1e-12);
    }

    #[test]
    fn rekverschil_handberekend_met_en_zonder_ondergrens() {
        // σ_s = 250, k_t = 0,4, f_ct,eff = 2,9, ρ = 0,02, α_e = 200000/33000 = 6,0606061.
        // f_ct,eff/ρ = 145. 1 + α_e ρ = 1 + 0,12121212 = 1,12121212.
        // k_t·145·1,12121212 = 0,4·162,575758 = 65,0303030.
        // teller = 250 − 65,0303030 = 184,9696970. / 200 000 = 9,2484848e-4.
        // ondergrens = 0,6·250/200000 = 7,5e-4 → hoofdterm is maatgevend.
        let a_e = 200_000.0 / 33_000.0;
        let (eps, onder) = rekverschil(250.0, 0.4, 2.9, 0.02, a_e).unwrap();
        assert!(!onder);
        assert_relative_eq!(eps, 9.248_484_848_484_85e-4, epsilon = 1e-12);

        // Lage staalspanning: σ_s = 100 → teller = 100 − 65,0303030 = 34,9696970
        // → 1,74848e-4, ondergrens = 0,6·100/200000 = 3,0e-4 → ondergrens wint.
        let (eps2, onder2) = rekverschil(100.0, 0.4, 2.9, 0.02, a_e).unwrap();
        assert!(onder2);
        assert_relative_eq!(eps2, 3.0e-4, epsilon = 1e-15);
    }

    #[test]
    fn de_nb_bovengrens_op_7_11_is_de_grootste_van_twee() {
        // C20/25, Ø16: (50 − 0,8·20)·16 = 34·16 = 544 mm; 15·16 = 240 mm
        // → de grootste is 544 mm.
        assert_relative_eq!(nb_bovengrens_s_r_max_mm(20.0, 16.0), 544.0, epsilon = 1e-12);
        // C50/60, Ø16: (50 − 40)·16 = 160 mm; 15·16 = 240 mm → 240 mm.
        assert_relative_eq!(nb_bovengrens_s_r_max_mm(50.0, 16.0), 240.0, epsilon = 1e-12);
        // Omslagpunt: 50 − 0,8 f_ck = 15 bij f_ck = 43,75 MPa.
        assert_relative_eq!(
            nb_bovengrens_s_r_max_mm(43.75, 20.0),
            300.0,
            epsilon = 1e-12
        );
    }

    #[test]
    fn s_r_max_volgens_7_11_handberekend() {
        // c = 30, Ø = 16, ρ_p,eff = 0,02, k_1 = 0,8 (hoog), k_2 = 0,5 (buiging),
        // C30/37, staafafstand 150 mm.
        // 5(c + Ø/2) = 5·38 = 190 ≥ 150 → (7.11) mag.
        // s_r,max = 3,4·30 + 0,8·0,5·0,425·16/0,02
        //         = 102 + 2,72/0,02 = 102 + 136 = 238 mm.
        // NB-bovengrens: (50 − 24)·16 = 416; 15·16 = 240 → 416. 238 ≤ 416.
        let r = scheurafstand(30.0, 16.0, 0.02, 0.8, 0.5, 30.0, Some(150.0), 500.0, 150.0).unwrap();
        assert_relative_eq!(r.s_r_max_mm, 238.0, epsilon = 1e-9);
        assert_eq!(r.bron, ScheurafstandBron::Vergelijking7_11);
        assert_relative_eq!(r.grens_5c_mm, 190.0, epsilon = 1e-12);
    }

    #[test]
    fn de_nb_bovengrens_kan_maatgevend_worden() {
        // Zeer laag wapeningspercentage: ρ_p,eff = 0,002.
        // s_r,max(7.11) = 3,4·30 + 0,8·0,5·0,425·16/0,002 = 102 + 1360 = 1462 mm.
        // NB-bovengrens bij C50/60: max{(50−40)·16; 15·16} = max{160; 240} = 240 mm.
        let r =
            scheurafstand(30.0, 16.0, 0.002, 0.8, 0.5, 50.0, Some(150.0), 500.0, 150.0).unwrap();
        assert_relative_eq!(r.s_r_max_7_11_mm.unwrap(), 1462.0, epsilon = 1e-9);
        assert_relative_eq!(r.s_r_max_mm, 240.0, epsilon = 1e-12);
        assert_eq!(r.bron, ScheurafstandBron::Vergelijking7_11NbBovengrens);
    }

    #[test]
    fn te_ver_uit_elkaar_staande_staven_vallen_terug_op_7_14() {
        // 5(c + Ø/2) = 5·(30+8) = 190 mm; werkelijke afstand 250 mm > 190.
        // s_r,max = 1,3·(500 − 150) = 1,3·350 = 455 mm.
        let r = scheurafstand(30.0, 16.0, 0.02, 0.8, 0.5, 30.0, Some(250.0), 500.0, 150.0).unwrap();
        assert_relative_eq!(r.s_r_max_mm, 455.0, epsilon = 1e-9);
        assert_eq!(r.bron, ScheurafstandBron::Vergelijking7_14);
        // Onbekende afstand: eveneens (7.14) — (7.11) mag alleen als
        // aantoonbaar aan 5(c + Ø/2) is voldaan.
        let r2 = scheurafstand(30.0, 16.0, 0.02, 0.8, 0.5, 30.0, None, 500.0, 150.0).unwrap();
        assert_eq!(r2.bron, ScheurafstandBron::Vergelijking7_14);
    }

    #[test]
    fn phi_eq_en_k_2_handberekend() {
        // (7.12): 2 staven Ø20 en 3 staven Ø12.
        // teller = 2·400 + 3·144 = 800 + 432 = 1232.
        // noemer = 2·20 + 3·12 = 40 + 36 = 76.
        // Ø_eq = 1232/76 = 16,210526 mm.
        assert_relative_eq!(
            phi_eq_mm(2.0, 20.0, 3.0, 12.0).unwrap(),
            16.210_526_315_789_473,
            epsilon = 1e-9
        );
        // (7.13): ε_1 = 1,0e-3 (grootste), ε_2 = 0,4e-3 (kleinste).
        // k_2 = (1,0 + 0,4)/(2·1,0) = 1,4/2 = 0,7.
        assert_relative_eq!(k_2_excentrische_trek(1.0e-3, 0.4e-3), 0.7, epsilon = 1e-12);
        // Zuivere trek: beide randen even veel rek → k_2 = 1,0.
        assert_relative_eq!(k_2_excentrische_trek(1.0e-3, 1.0e-3), 1.0, epsilon = 1e-12);
        // Zuivere buiging: ε_2 = 0 → k_2 = 0,5.
        assert_relative_eq!(k_2_excentrische_trek(1.0e-3, 0.0), 0.5, epsilon = 1e-12);
    }

    #[test]
    fn scheurwijdte_van_een_balk_helemaal_handberekend() {
        // 300 × 500 mm, C30/37 (f_ctm = 2,9; E_cm = 33 000), B500B,
        // 3Ø16 onder, dekking 30 mm, geen beugel, staafafstand 100 mm,
        // σ_s = 250 N/mm², x = 150 mm, langdurende belasting, XC3.
        //
        // d = 500 − (30 + 0 + 8) = 462 mm.
        // h_c,ef = min{2,5·38 = 95; (500−150)/3 = 116,667; 250} = 95 mm.
        // A_c,eff = 300·95 = 28 500 mm².
        // A_s = 3·π/4·16² = 3·201,06193 = 603,18579 mm².
        // ρ_p,eff = 603,1857895/28 500 = 0,0211644137.
        // α_e = 200 000/33 000 = 6,0606061.
        // f_ct,eff/ρ = 2,9/0,0211644137 = 137,0224588.
        // 1 + α_e·ρ = 1 + 0,1282692 = 1,1282692.
        // k_t = 0,4 → aftrek = 0,4·137,0224588·1,1282692 = 61,8392864.
        // teller = 250 − 61,8392864 = 188,1607136 → /200 000 = 9,4080357e-4.
        // ondergrens = 0,6·250/200 000 = 7,5e-4 → hoofdterm maatgevend.
        //
        // c op de langswapening = 30 + 0 = 30 mm.
        // 5(c + Ø/2) = 5·38 = 190 ≥ 100 → (7.11).
        // s_r,max = 3,4·30 + 0,8·0,5·0,425·16/0,0211644137
        //         = 102 + 2,72/0,0211644137 = 102 + 128,5176165 = 230,5176165 mm.
        // NB-bovengrens: (50 − 24)·16 = 416 mm → niet maatgevend.
        // w_k = 230,5176165 · 9,4080357e-4 = 0,2168718 mm.
        // w_max (XC3, NB) = 0,30 mm → unity check 0,7229.
        let sec = ConcreteSection::rectangle(300.0, 500.0);
        let cage = korf(30.0, 16.0, 3);
        let beton = concrete_class_by_name("C30/37").unwrap();
        let staal = reinforcement_grade_by_name("B500B").unwrap();
        let mut inv =
            Scheurinvoer::buiging(250.0, 150.0, ExposureClass::XC3, Belastingsduur::Langdurend);
        inv.staafafstand_mm = Some(100.0);
        let g = Scheurgegevens {
            section: &sec,
            cage: &cage,
            beton,
            staal,
            invoer: &inv,
        };
        let r = check_scheurwijdte_berekend(&g, snapshot());

        // De handberekening, stap voor stap nagerekend met dezelfde getallen.
        let a_s = 3.0 * std::f64::consts::PI * 64.0;
        let h_c_ef = h_c_ef_mm(500.0, 462.0, 150.0);
        assert_relative_eq!(h_c_ef, 95.0, epsilon = 1e-12);
        let a_c_eff = 300.0 * 95.0;
        let rho = a_s / a_c_eff;
        let a_e = 200_000.0 / 33_000.0;
        let eps_hand = (250.0 - 0.4 * (2.9 / rho) * (1.0 + a_e * rho)) / 200_000.0;
        assert!(eps_hand > 0.6 * 250.0 / 200_000.0);
        let s_r_hand = 3.4 * 30.0 + 0.8 * 0.5 * 0.425 * 16.0 / rho;
        let w_hand = s_r_hand * eps_hand;
        assert_relative_eq!(r.value, w_hand, epsilon = 1e-12);
        // w_max bij XC3 = 0,30 mm (NB tabel 7.1N).
        assert_relative_eq!(r.uc.as_ref().unwrap().rd, 0.30, epsilon = 1e-12);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, w_hand / 0.30, epsilon = 1e-12);
        // De losse getallen, zodat een verschuiving meteen opvalt.
        assert_relative_eq!(s_r_hand, 230.517_616_5, epsilon = 1e-6);
        assert_relative_eq!(eps_hand, 9.408_035_7e-4, epsilon = 1e-10);
        assert_relative_eq!(w_hand, 0.216_871_8, epsilon = 1e-6);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.722_906_0, epsilon = 1e-6);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn de_toets_meldt_dat_de_frequente_combinatie_geldt() {
        let sec = ConcreteSection::rectangle(300.0, 500.0);
        let cage = korf(30.0, 16.0, 3);
        let beton = concrete_class_by_name("C30/37").unwrap();
        let staal = reinforcement_grade_by_name("B500B").unwrap();
        let mut inv =
            Scheurinvoer::buiging(250.0, 150.0, ExposureClass::XC3, Belastingsduur::Langdurend);
        inv.staafafstand_mm = Some(100.0);
        let g = Scheurgegevens {
            section: &sec,
            cage: &cage,
            beton,
            staal,
            invoer: &inv,
        };
        let r = check_scheurwijdte_berekend(&g, snapshot());
        assert!(r
            .notes
            .iter()
            .any(|n| n.contains("frequente belastingscombinatie")));
        assert!(r
            .notes
            .iter()
            .any(|n| n.contains("GEAMENDEERDE tabel 7.1N")));
    }

    #[test]
    fn h_cr_wordt_alleen_afgeleid_zonder_normaalkracht() {
        let sec = ConcreteSection::rectangle(1000.0, 280.0);
        let inv =
            Scheurinvoer::buiging(200.0, 40.0, ExposureClass::XC1, Belastingsduur::Langdurend);
        // Rechthoek zonder normaalkracht: h_cr = h/2 = 140 mm, precies de
        // aanname waarop tabel 7.2N berust.
        let (h_cr, afgeleid) = h_cr_of_afgeleid(&sec, &inv).unwrap();
        assert_relative_eq!(h_cr, 140.0, epsilon = 1e-12);
        assert!(afgeleid);
        // Met normaalkracht: niets afleiden.
        let mut inv2 = inv;
        inv2.n_ed_druk_positief_n = 100_000.0;
        assert!(h_cr_of_afgeleid(&sec, &inv2).is_err());
        // Opgegeven h_cr gaat altijd voor.
        let mut inv3 = inv2;
        inv3.h_cr_mm = Some(90.0);
        let (h3, afgeleid3) = h_cr_of_afgeleid(&sec, &inv3).unwrap();
        assert_relative_eq!(h3, 90.0, epsilon = 1e-12);
        assert!(!afgeleid3);
    }

    #[test]
    fn de_plaat_van_200_mm_valt_onder_de_vrijstelling_van_7_3_3_1() {
        let sec = ConcreteSection::rectangle(1000.0, 200.0);
        let cage = korf(25.0, 10.0, 7);
        let beton = concrete_class_by_name("C20/25").unwrap();
        let staal = reinforcement_grade_by_name("B500B").unwrap();
        let mut inv =
            Scheurinvoer::buiging(320.0, 40.0, ExposureClass::XC1, Belastingsduur::Langdurend);
        inv.plaat_in_gebouw = true;
        inv.detaillering_9_3_toegepast = true;
        let g = Scheurgegevens {
            section: &sec,
            cage: &cage,
            beton,
            staal,
            invoer: &inv,
        };
        let r = check_scheurbeheersing_tabel(&g, snapshot());
        assert_eq!(r.status, CheckStatus::NotApplicable);
        assert!(r.notes[0].contains("7.3.3(1)"));
    }
}
