//! De kruipcoëfficiënt φ(t,t₀) en φ(∞,t₀) volgens NEN-EN 1992-1-1 bijlage B
//! (B.1 t/m B.9), met de afleiding als deelstappen voor het rapport.
//!
//! # Waarom deze module bestaat
//!
//! φ(∞,t₀) voedt twee rekengangen: de BGT-stijfheid (§5.8.6(4) en (7.20)) en de
//! kolomtoets (§5.8.3.1 A, §5.8.4 (5.19)). Tot nu toe moest de constructeur hem
//! zelf opgeven — uit figuur 3.1 of uit een eigen berekening — en bleef hij
//! leeg, dan rekende de app zonder kruip. Bijlage B geeft de rekenmethode uit
//! gegevens die de constructeur wél kent: de betonklasse, de relatieve
//! vochtigheid, de fictieve dikte en de ouderdom bij belasten.
//!
//! # De normtekst
//!
//! In de PDF-uitgave staan B.3 t/m B.9 alleen als afbeelding. Ze zijn van een
//! gerenderde pagina afgelezen (B.7 uit de ingesloten afbeelding zelf, omdat
//! die in de paginaweergave wegvalt). Letterlijk:
//!
//! ```text
//! (B.1)  φ(t,t₀) = φ₀ · β_c(t,t₀)
//! (B.2)  φ₀ = φ_RH · β(f_cm) · β(t₀)
//! (B.3a) φ_RH = 1 + (1 − RH/100) / (0,1 · ∛h₀)                  voor f_cm ≤ 35 MPa
//! (B.3b) φ_RH = [1 + (1 − RH/100) / (0,1 · ∛h₀) · α₁] · α₂       voor f_cm > 35 MPa
//! (B.4)  β(f_cm) = 16,8 / √f_cm
//! (B.5)  β(t₀) = 1 / (0,1 + t₀^0,20)
//! (B.6)  h₀ = 2·A_c / u
//! (B.7)  β_c(t,t₀) = [(t − t₀) / (β_H + t − t₀)]^0,3
//! (B.8a) β_H = 1,5 [1 + (0,012 RH)^18] h₀ + 250 ≤ 1500          voor f_cm ≤ 35
//! (B.8b) β_H = 1,5 [1 + (0,012 RH)^18] h₀ + 250 α₃ ≤ 1500 α₃     voor f_cm ≥ 35
//! (B.8c) α₁ = [35/f_cm]^0,7   α₂ = [35/f_cm]^0,2   α₃ = [35/f_cm]^0,5
//! (B.9)  t₀ = t₀,T · (9 / (2 + t₀,T^1,2) + 1)^α ≥ 0,5
//!        α = −1 voor cement van klasse S; 0 voor klasse N; 1 voor klasse R
//! ```
//!
//! RH in %, h₀ in mm, f_cm in MPa, t en t₀ in dagen. B.3b zegt "> 35", B.8b
//! "≥ 35"; bij f_cm = 35 MPa zijn α₁ = α₂ = α₃ = 1 en vallen beide takken samen,
//! dus het verschil verandert geen getal. Deze module kiest de a-tak bij
//! f_cm ≤ 35 en de b-tak daarboven, voor B.3 en B.8 gelijk.
//!
//! De Nederlandse bijlage zegt bij bijlage B alleen: "Bijlage B moet als
//! informatief zijn gelezen." Er zijn geen nationaal bepaalde parameters.
//!
//! # φ(∞,t₀)
//!
//! Voor t → ∞ gaat β_c van (B.7) naar 1, dus φ(∞,t₀) = φ₀. Figuur 3.1 geeft
//! volgens het slot van B.1 "kruip van beton op 70 jaar"; daar is β_c net
//! kleiner dan 1 (ruim 0,99 bij gangbare h₀). Deze module levert φ₀ als
//! φ(∞,t₀) — de eindwaarde die §3.1.4 zo noemt — en rekent β_c alleen uit als
//! de aanroeper een tijdstip t opgeeft.
//!
//! # Wat NIET gerekend wordt
//!
//! * (B.10), de temperatuurcorrectie van de ouderdom: t₀,T = t₀. Bij 20 °C is
//!   de factor e^−(4000/293 − 13,65) = 0,998; bij een afwijkende
//!   verhardingstemperatuur hoort de aanroeper de gecorrigeerde ouderdom zelf
//!   als t₀ op te geven. Dat staat als kanttekening in het antwoord.
//! * §3.1.4(4) met (3.7), de niet-lineaire kruip bij een drukspanning boven
//!   0,45·f_ck(t₀): deze module kent de spanning niet. Kanttekening.
//! * Welk deel van de omtrek aan uitdroging blootstaat: B.6 neemt "de omtrek
//!   van het element dat in aanraking komt met de buitenlucht". Wordt h₀ uit
//!   een doorsnede afgeleid, dan telt de HELE omtrek mee; dat staat als
//!   aanname in de afleiding, en wie het anders weet geeft h₀ zelf op.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use nen_en_1993_1_1_section::Deelstap;

use crate::data::concrete_class_by_name;
use crate::deelstappen::{lx, nl, nv, stap};
use crate::section::ConcreteSectionInput;

/// De grens tussen de a- en de b-tak van (B.3) en (B.8), in MPa.
pub const F_CM_GRENS_MPA: f64 = 35.0;

/// De cementklasse van §3.1.2(6), die via α in (B.9) de ouderdom t₀ aanpast.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum CementClass {
    /// Klasse S — langzaam verhardend; α = −1.
    S,
    /// Klasse N — normaal verhardend; α = 0.
    N,
    /// Klasse R — snel verhardend; α = 1.
    R,
}

impl CementClass {
    /// De macht α van (B.9).
    pub fn alpha(self) -> i32 {
        match self {
            CementClass::S => -1,
            CementClass::N => 0,
            CementClass::R => 1,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            CementClass::S => "S",
            CementClass::N => "N",
            CementClass::R => "R",
        }
    }
}

/// Alle tussenwaarden van bijlage B, in de volgorde van de norm.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct KruipUitkomst {
    pub f_cm_mpa: f64,
    pub relative_humidity_pct: f64,
    pub h0_mm: f64,
    /// De opgegeven ouderdom bij belasten, t₀,T in (B.9).
    pub t0_days: f64,
    pub cement_class: CementClass,
    /// α van (B.9).
    pub alpha_cement: i32,
    /// t₀ volgens (B.9), de ouderdom die in (B.5) wordt ingevuld.
    pub t0_adjusted_days: f64,
    /// Is de ondergrens 0,5 dag van (B.9) maatgevend geweest?
    pub t0_ondergrens_maatgevend: bool,
    /// α₁, α₂, α₃ van (B.8c). Ook bij f_cm ≤ 35 MPa uitgerekend; ze worden
    /// dan niet gebruikt.
    pub alpha_1: f64,
    pub alpha_2: f64,
    pub alpha_3: f64,
    /// `true` = de b-tak van (B.3) en (B.8), f_cm > 35 MPa.
    pub hoge_sterkte_tak: bool,
    pub phi_rh: f64,
    pub beta_fcm: f64,
    pub beta_t0: f64,
    /// φ₀ van (B.2).
    pub phi_0: f64,
    /// β_H van (B.8a)/(B.8b), na de bovengrens.
    pub beta_h: f64,
    /// Is de bovengrens 1500 (of 1500·α₃) van (B.8) maatgevend geweest?
    pub beta_h_bovengrens_maatgevend: bool,
    /// φ(∞,t₀) = φ₀ (β_c → 1).
    pub phi_inf_t0: f64,
    /// Het beschouwde tijdstip t, als opgegeven.
    pub t_days: Option<f64>,
    /// β_c(t,t₀) van (B.7), als t is opgegeven.
    pub beta_c: Option<f64>,
    /// φ(t,t₀) van (B.1), als t is opgegeven.
    pub phi_t_t0: Option<f64>,
}

/// De rekengang van bijlage B, zonder tekst.
///
/// Weigert — met een Nederlandse reden — invoer waarvoor de formules geen
/// betekenis hebben. Een stille uitkomst bij RH = 120 % of h₀ = 0 zou een
/// kruipcoëfficiënt opleveren die nergens op slaat en toch door de hele
/// stijfheidslus reist.
pub fn kruipcoefficient_bijlage_b(
    f_cm_mpa: f64,
    relative_humidity_pct: f64,
    h0_mm: f64,
    t0_days: f64,
    cement_class: CementClass,
    t_days: Option<f64>,
) -> Result<KruipUitkomst, String> {
    if !(f_cm_mpa.is_finite() && f_cm_mpa > 0.0) {
        return Err(format!("f_cm = {f_cm_mpa} MPa: de gemiddelde druksterkte moet positief zijn."));
    }
    if !(relative_humidity_pct.is_finite()
        && relative_humidity_pct > 0.0
        && relative_humidity_pct <= 100.0)
    {
        return Err(format!(
            "RH = {relative_humidity_pct} %: de relatieve vochtigheid van de omgeving ligt tussen \
             0 en 100 % (bijlage B, (B.3) rekent met 1 − RH/100)."
        ));
    }
    if !(h0_mm.is_finite() && h0_mm > 0.0) {
        return Err(format!(
            "h₀ = {h0_mm} mm: de fictieve dikte 2·A_c/u (B.6) moet positief zijn."
        ));
    }
    if !(t0_days.is_finite() && t0_days > 0.0) {
        return Err(format!(
            "t₀ = {t0_days} dagen: de ouderdom van het beton bij belasten moet positief zijn."
        ));
    }
    if let Some(t) = t_days {
        if !(t.is_finite() && t > t0_days) {
            return Err(format!(
                "t = {t} dagen: het beschouwde tijdstip moet na het belasten liggen (t > t₀ = \
                 {t0_days} dagen), anders is t − t₀ in (B.7) geen belastingduur."
            ));
        }
    }

    // (B.8c)
    let verhouding = F_CM_GRENS_MPA / f_cm_mpa;
    let alpha_1 = verhouding.powf(0.7);
    let alpha_2 = verhouding.powf(0.2);
    let alpha_3 = verhouding.powf(0.5);
    let hoge_sterkte_tak = f_cm_mpa > F_CM_GRENS_MPA;

    // (B.9) met t₀,T = t₀ (B.10 niet gerekend, zie de moduletekst).
    let alpha_cement = cement_class.alpha();
    let t0_ongegrensd =
        t0_days * (9.0 / (2.0 + t0_days.powf(1.2)) + 1.0).powi(alpha_cement);
    let t0_ondergrens_maatgevend = t0_ongegrensd < 0.5;
    let t0_adjusted_days = t0_ongegrensd.max(0.5);

    // (B.3a)/(B.3b)
    let rh_term = (1.0 - relative_humidity_pct / 100.0) / (0.1 * h0_mm.cbrt());
    let phi_rh = if hoge_sterkte_tak {
        (1.0 + rh_term * alpha_1) * alpha_2
    } else {
        1.0 + rh_term
    };
    // (B.4), (B.5), (B.2)
    let beta_fcm = 16.8 / f_cm_mpa.sqrt();
    let beta_t0 = 1.0 / (0.1 + t0_adjusted_days.powf(0.20));
    let phi_0 = phi_rh * beta_fcm * beta_t0;

    // (B.8a)/(B.8b)
    let basis = 1.5 * (1.0 + (0.012 * relative_humidity_pct).powi(18)) * h0_mm;
    let (beta_h_ongegrensd, grens) = if hoge_sterkte_tak {
        (basis + 250.0 * alpha_3, 1500.0 * alpha_3)
    } else {
        (basis + 250.0, 1500.0)
    };
    let beta_h_bovengrens_maatgevend = beta_h_ongegrensd > grens;
    let beta_h = beta_h_ongegrensd.min(grens);

    // (B.7), (B.1). t − t₀ is de NIET-AANGEPASTE belastingduur (symboolverklaring
    // bij B.7); de aanpassing van (B.9) geldt alleen voor (B.5).
    let beta_c = t_days.map(|t| ((t - t0_days) / (beta_h + t - t0_days)).powf(0.3));
    let phi_t_t0 = beta_c.map(|b| phi_0 * b);

    Ok(KruipUitkomst {
        f_cm_mpa,
        relative_humidity_pct,
        h0_mm,
        t0_days,
        cement_class,
        alpha_cement,
        t0_adjusted_days,
        t0_ondergrens_maatgevend,
        alpha_1,
        alpha_2,
        alpha_3,
        hoge_sterkte_tak,
        phi_rh,
        beta_fcm,
        beta_t0,
        phi_0,
        beta_h,
        beta_h_bovengrens_maatgevend,
        phi_inf_t0: phi_0,
        t_days,
        beta_c,
        phi_t_t0,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// Het verzoek voor de drie wegen
// ───────────────────────────────────────────────────────────────────────────

/// Eén verzoek om φ(∞,t₀) volgens bijlage B, zoals het over het Tauri-command,
/// de toetsbrug en de MCP-server gaat.
///
/// h₀ komt uit PRECIES ÉÉN van `section` (B.6 met de hele omtrek) en `h0_mm`
/// (opgegeven). Allebei of geen van beide wordt geweigerd: twee bronnen voor
/// hetzelfde getal zonder voorrangsregel is een stille keuze.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct CreepCoefficientRequest {
    /// De nationale bijlage. Bijlage B kent geen nationaal bepaalde
    /// parameters; het veld staat er voor dezelfde invoervorm als de andere
    /// betonverzoeken, en een onbekende bijlage wordt bij het lezen geweigerd.
    #[serde(default)]
    pub bijlage: nationale_bijlage::NationaleBijlage,
    /// Vrij te kiezen nummer; komt onveranderd terug.
    #[serde(default)]
    pub beam_id: u32,
    /// Sterkteklasse, bijvoorbeeld "C30/37"; f_cm uit tabel 3.1.
    pub concrete_class: String,
    /// Relatieve vochtigheid van de omgeving, in %.
    pub relative_humidity_pct: f64,
    /// Ouderdom van het beton bij belasten, in dagen.
    pub t0_days: f64,
    pub cement_class: CementClass,
    /// De doorsnede waaruit h₀ = 2·A_c/u volgt, met u de hele omtrek.
    #[serde(default)]
    #[ts(optional)]
    pub section: Option<ConcreteSectionInput>,
    /// De fictieve dikte h₀ zelf, in mm — als maar een deel van de omtrek
    /// uitdroogt (een vloer op zand, een wand tegen grond).
    #[serde(default)]
    #[ts(optional)]
    pub h0_mm: Option<f64>,
    /// Het beschouwde tijdstip t in dagen; weglaten = alleen φ(∞,t₀).
    #[serde(default)]
    #[ts(optional)]
    pub t_days: Option<f64>,
}

/// Het antwoord: alle tussenwaarden, de afleiding en de kanttekeningen.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct CreepCoefficientResponse {
    pub beam_id: u32,
    pub concrete_class: String,
    /// A_c en u als h₀ uit de doorsnede volgt; anders `None`.
    pub a_c_mm2: Option<f64>,
    pub u_mm: Option<f64>,
    pub uitkomst: KruipUitkomst,
    pub deelstappen: Vec<Deelstap>,
    pub notes: Vec<String>,
}

/// A_c en u van een doorsnede uit de invoer.
///
/// De omtrek van een rechthoek, T of L is die van de omhullende rechthoek,
/// 2·(b + h): de doorsnede is rechthoekig begrensd en elke inham wordt aan
/// twee kanten door evenwijdige randen van gelijke totale lengte gesloten. Voor
/// een T met flens b_f × h_f en lijf b_w: b_f + 2·h_f + (b_f − b_w) +
/// 2·(h − h_f) + b_w = 2·(b_f + h).
fn ac_en_u(section: &ConcreteSectionInput) -> Result<(f64, f64), String> {
    let doorsnede = section.build()?;
    Ok((doorsnede.area_mm2(), 2.0 * (section.b_mm + section.h_mm)))
}

/// De rekengang achter alle drie de wegen. Eén implementatie, drie aanroepers.
pub fn creep_coefficient_request(
    req: CreepCoefficientRequest,
) -> Result<CreepCoefficientResponse, String> {
    let klasse = concrete_class_by_name(&req.concrete_class).ok_or_else(|| {
        format!(
            "Onbekende betonklasse \"{}\"; tabel 3.1 kent C12/15 t/m C90/105.",
            req.concrete_class
        )
    })?;
    let (h0_mm, a_c_mm2, u_mm) = match (&req.section, req.h0_mm) {
        (Some(_), Some(_)) => {
            return Err(
                "Geef h₀ óf een doorsnede op, niet allebei: de fictieve dikte heeft dan twee \
                 bronnen zonder dat vastligt welke geldt."
                    .into(),
            )
        }
        (None, None) => {
            return Err(
                "De fictieve dikte ontbreekt: geef `section` (h₀ = 2·A_c/u, (B.6)) of `h0_mm` op."
                    .into(),
            )
        }
        (Some(s), None) => {
            let (a_c, u) = ac_en_u(s)?;
            (2.0 * a_c / u, Some(a_c), Some(u))
        }
        (None, Some(h0)) => (h0, None, None),
    };
    let uitkomst = kruipcoefficient_bijlage_b(
        klasse.f_cm,
        req.relative_humidity_pct,
        h0_mm,
        req.t0_days,
        req.cement_class,
        req.t_days,
    )?;
    let deelstappen = kruip_deelstappen(klasse.name, a_c_mm2, u_mm, &uitkomst);
    let notes = kruip_kanttekeningen(&uitkomst);
    Ok(CreepCoefficientResponse {
        beam_id: req.beam_id,
        concrete_class: klasse.name.to_string(),
        a_c_mm2,
        u_mm,
        uitkomst,
        deelstappen,
        notes,
    })
}

/// Wat er bij elke uitkomst hoort te worden verteld.
fn kruip_kanttekeningen(u: &KruipUitkomst) -> Vec<String> {
    let mut notes = vec![
        "Bijlage B is informatief (Nederlandse bijlage). De variatiecoëfficiënt van de \
         voorspelde kruip is volgens het slot van B.1 van de orde van 20 %."
            .to_string(),
        "Geen temperatuurcorrectie (B.10): t₀,T = t₀. Bij verharding rond 20 °C is de factor \
         0,998; bij een afwijkende temperatuur hoort de gecorrigeerde ouderdom als t₀ te \
         worden opgegeven."
            .to_string(),
        "Lineaire kruip: geldt zolang de drukspanning bij belasten niet groter is dan \
         0,45·f_ck(t₀) (art. 3.1.4(2)). Daarboven vraagt art. 3.1.4(4) de niet-lineaire \
         kruipcoëfficiënt van (3.7); die is hier niet gerekend."
            .to_string(),
    ];
    if u.relative_humidity_pct < 40.0 {
        notes.push(format!(
            "RH = {} % ligt onder de 40 % waarvoor figuur 3.1 geldig is (art. 3.1.4(5)); \
             bijlage B noemt zelf geen grens, maar controleer de uitgangspunten.",
            nl(u.relative_humidity_pct, 0)
        ));
    }
    if u.t0_ondergrens_maatgevend {
        notes.push("De ondergrens t₀ ≥ 0,5 dag van (B.9) is maatgevend.".to_string());
    }
    notes
}

// ───────────────────────────────────────────────────────────────────────────
// De afleiding
// ───────────────────────────────────────────────────────────────────────────

/// De afleiding als deelstappen. Rekent niets opnieuw uit: elk getal komt uit
/// de meegegeven [`KruipUitkomst`].
pub fn kruip_deelstappen(
    klasse: &str,
    a_c_mm2: Option<f64>,
    u_mm: Option<f64>,
    u: &KruipUitkomst,
) -> Vec<Deelstap> {
    let mut keten = Vec::with_capacity(10);

    keten.push(stap(
        "kruip_uitgangspunten",
        "Uitgangspunten kruip",
        "",
        "art. 3.1.4, bijlage B",
        String::new(),
        String::new(),
        vec![
            nv("f_{cm}", u.f_cm_mpa, "MPa"),
            nv("RH", u.relative_humidity_pct, "%"),
            nv("t_0", u.t0_days, "d"),
        ],
        None,
        "",
        vec![
            format!("Betonklasse {klasse}: f_cm = {} MPa (tabel 3.1).", nl(u.f_cm_mpa, 0)),
            format!("Cementklasse {} (art. 3.1.2(6)).", u.cement_class.label()),
        ],
    ));

    // h₀ (B.6)
    match (a_c_mm2, u_mm) {
        (Some(a_c), Some(omtrek)) => keten.push(stap(
            "kruip_h0",
            "Fictieve dikte",
            "h_0",
            "(B.6)",
            r"h_0 = \frac{2 A_c}{u}".to_string(),
            format!(
                r"h_0 = \frac{{2 \cdot {}}}{{{}}} = {}\ \text{{mm}}",
                lx(a_c, 0),
                lx(omtrek, 0),
                lx(u.h0_mm, 1)
            ),
            vec![nv("A_c", a_c, "mm²"), nv("u", omtrek, "mm")],
            Some(u.h0_mm),
            "mm",
            vec![
                "Aanname: de hele omtrek van de doorsnede staat bloot aan uitdroging. Droogt \
                 maar een deel uit (een vloer op zand, een wand tegen grond), geef h₀ dan zelf op."
                    .to_string(),
            ],
        )),
        _ => keten.push(stap(
            "kruip_h0",
            "Fictieve dikte",
            "h_0",
            "(B.6)",
            String::new(),
            String::new(),
            vec![],
            Some(u.h0_mm),
            "mm",
            vec![format!("h₀ = {} mm opgegeven.", nl(u.h0_mm, 1))],
        )),
    }

    // α₁, α₂, α₃ (B.8c) — alleen in de b-tak.
    if u.hoge_sterkte_tak {
        keten.push(stap(
            "kruip_alpha",
            "Invloed van de betonsterkte",
            r"\alpha_{1,2,3}",
            "(B.8c)",
            r"\alpha_1 = \left[\frac{35}{f_{cm}}\right]^{0,7} \quad \alpha_2 = \left[\frac{35}{f_{cm}}\right]^{0,2} \quad \alpha_3 = \left[\frac{35}{f_{cm}}\right]^{0,5}".to_string(),
            format!(
                r"\alpha_1 = {} \quad \alpha_2 = {} \quad \alpha_3 = {}",
                lx(u.alpha_1, 3),
                lx(u.alpha_2, 3),
                lx(u.alpha_3, 3)
            ),
            vec![nv("f_{cm}", u.f_cm_mpa, "MPa")],
            None,
            "",
            vec![format!(
                "f_cm = {} MPa > 35 MPa: de b-takken (B.3b) en (B.8b) gelden.",
                nl(u.f_cm_mpa, 0)
            )],
        ));
    }

    // φ_RH (B.3a)/(B.3b)
    let (formule, ingevuld, artikel) = if u.hoge_sterkte_tak {
        (
            r"\varphi_{RH} = \left[1 + \frac{1 - RH/100}{0{,}1 \sqrt[3]{h_0}} \alpha_1\right] \alpha_2".to_string(),
            format!(
                r"\varphi_{{RH}} = \left[1 + \frac{{1 - {}/100}}{{0{{,}}1 \sqrt[3]{{{}}}}} \cdot {}\right] \cdot {} = {}",
                lx(u.relative_humidity_pct, 1),
                lx(u.h0_mm, 1),
                lx(u.alpha_1, 3),
                lx(u.alpha_2, 3),
                lx(u.phi_rh, 3)
            ),
            "(B.3b)",
        )
    } else {
        (
            r"\varphi_{RH} = 1 + \frac{1 - RH/100}{0{,}1 \sqrt[3]{h_0}}".to_string(),
            format!(
                r"\varphi_{{RH}} = 1 + \frac{{1 - {}/100}}{{0{{,}}1 \sqrt[3]{{{}}}}} = {}",
                lx(u.relative_humidity_pct, 1),
                lx(u.h0_mm, 1),
                lx(u.phi_rh, 3)
            ),
            "(B.3a)",
        )
    };
    keten.push(stap(
        "kruip_phi_rh",
        "Invloed van de relatieve vochtigheid",
        r"\varphi_{RH}",
        artikel,
        formule,
        ingevuld,
        vec![nv("RH", u.relative_humidity_pct, "%"), nv("h_0", u.h0_mm, "mm")],
        Some(u.phi_rh),
        "",
        vec![if u.hoge_sterkte_tak {
            "f_cm > 35 MPa.".to_string()
        } else {
            "f_cm ≤ 35 MPa.".to_string()
        }],
    ));

    // β(f_cm) (B.4)
    keten.push(stap(
        "kruip_beta_fcm",
        "Invloed van de betonsterkte",
        r"\beta(f_{cm})",
        "(B.4)",
        r"\beta(f_{cm}) = \frac{16{,}8}{\sqrt{f_{cm}}}".to_string(),
        format!(
            r"\beta(f_{{cm}}) = \frac{{16{{,}}8}}{{\sqrt{{{}}}}} = {}",
            lx(u.f_cm_mpa, 0),
            lx(u.beta_fcm, 3)
        ),
        vec![nv("f_{cm}", u.f_cm_mpa, "MPa")],
        Some(u.beta_fcm),
        "",
        vec![],
    ));

    // t₀ aangepast (B.9)
    let mut t0_notes = vec![format!(
        "Cementklasse {}: α = {} (B.9). t₀,T = t₀ = {} d, geen temperatuurcorrectie (B.10).",
        u.cement_class.label(),
        u.alpha_cement,
        nl(u.t0_days, 1)
    )];
    if u.t0_ondergrens_maatgevend {
        t0_notes.push("De ondergrens 0,5 dag is maatgevend.".to_string());
    }
    keten.push(stap(
        "kruip_t0",
        "Ouderdom bij belasten, aangepast aan de cementklasse",
        "t_0",
        "(B.9)",
        r"t_0 = t_{0,T} \cdot \left(\frac{9}{2 + t_{0,T}^{1{,}2}} + 1\right)^{\alpha} \geq 0{,}5".to_string(),
        format!(
            r"t_0 = {} \cdot \left(\frac{{9}}{{2 + {}^{{1{{,}}2}}}} + 1\right)^{{{}}} = {}\ \text{{d}}",
            lx(u.t0_days, 1),
            lx(u.t0_days, 1),
            u.alpha_cement,
            lx(u.t0_adjusted_days, 2)
        ),
        vec![nv("t_{0,T}", u.t0_days, "d")],
        Some(u.t0_adjusted_days),
        "d",
        t0_notes,
    ));

    // β(t₀) (B.5)
    keten.push(stap(
        "kruip_beta_t0",
        "Invloed van de ouderdom bij belasten",
        r"\beta(t_0)",
        "(B.5)",
        r"\beta(t_0) = \frac{1}{0{,}1 + t_0^{0{,}20}}".to_string(),
        format!(
            r"\beta(t_0) = \frac{{1}}{{0{{,}}1 + {}^{{0{{,}}20}}}} = {}",
            lx(u.t0_adjusted_days, 2),
            lx(u.beta_t0, 3)
        ),
        vec![nv("t_0", u.t0_adjusted_days, "d")],
        Some(u.beta_t0),
        "",
        vec![],
    ));

    // φ₀ (B.2) = φ(∞,t₀)
    keten.push(stap(
        "kruip_phi_0",
        "Theoretische kruipcoëfficiënt",
        r"\varphi(\infty,t_0)",
        "(B.2), (B.1)",
        r"\varphi(\infty,t_0) = \varphi_0 = \varphi_{RH} \cdot \beta(f_{cm}) \cdot \beta(t_0)".to_string(),
        format!(
            r"\varphi_0 = {} \cdot {} \cdot {} = {}",
            lx(u.phi_rh, 3),
            lx(u.beta_fcm, 3),
            lx(u.beta_t0, 3),
            lx(u.phi_0, 2)
        ),
        vec![
            nv(r"\varphi_{RH}", u.phi_rh, ""),
            nv(r"\beta(f_{cm})", u.beta_fcm, ""),
            nv(r"\beta(t_0)", u.beta_t0, ""),
        ],
        Some(u.phi_inf_t0),
        "",
        vec![
            "Voor t → ∞ gaat β_c(t,t₀) van (B.7) naar 1, dus φ(∞,t₀) = φ₀. Figuur 3.1 geeft \
             de waarde op 70 jaar, waar β_c net onder 1 ligt."
                .to_string(),
        ],
    ));

    // β_H (B.8) en β_c, φ(t,t₀) (B.7), (B.1) — alleen met een tijdstip.
    if let (Some(t), Some(beta_c), Some(phi_t)) = (u.t_days, u.beta_c, u.phi_t_t0) {
        let (formule, ingevuld, artikel) = if u.hoge_sterkte_tak {
            (
                r"\beta_H = 1{,}5 \left[1 + (0{,}012\,RH)^{18}\right] h_0 + 250\,\alpha_3 \leq 1500\,\alpha_3".to_string(),
                format!(
                    r"\beta_H = \min\left(1{{,}}5 \left[1 + (0{{,}}012 \cdot {})^{{18}}\right] \cdot {} + 250 \cdot {};\ 1500 \cdot {}\right) = {}",
                    lx(u.relative_humidity_pct, 1),
                    lx(u.h0_mm, 1),
                    lx(u.alpha_3, 3),
                    lx(u.alpha_3, 3),
                    lx(u.beta_h, 1)
                ),
                "(B.8b)",
            )
        } else {
            (
                r"\beta_H = 1{,}5 \left[1 + (0{,}012\,RH)^{18}\right] h_0 + 250 \leq 1500".to_string(),
                format!(
                    r"\beta_H = \min\left(1{{,}}5 \left[1 + (0{{,}}012 \cdot {})^{{18}}\right] \cdot {} + 250;\ 1500\right) = {}",
                    lx(u.relative_humidity_pct, 1),
                    lx(u.h0_mm, 1),
                    lx(u.beta_h, 1)
                ),
                "(B.8a)",
            )
        };
        let mut bh_notes = vec![];
        if u.beta_h_bovengrens_maatgevend {
            bh_notes.push("De bovengrens van (B.8) is maatgevend.".to_string());
        }
        keten.push(stap(
            "kruip_beta_h",
            "Coëfficiënt voor vochtigheid en fictieve dikte",
            r"\beta_H",
            artikel,
            formule,
            ingevuld,
            vec![nv("RH", u.relative_humidity_pct, "%"), nv("h_0", u.h0_mm, "mm")],
            Some(u.beta_h),
            "",
            bh_notes,
        ));
        keten.push(stap(
            "kruip_beta_c",
            "Ontwikkeling van de kruip in de tijd",
            r"\beta_c(t,t_0)",
            "(B.7)",
            r"\beta_c(t,t_0) = \left[\frac{t - t_0}{\beta_H + t - t_0}\right]^{0{,}3}".to_string(),
            format!(
                r"\beta_c = \left[\frac{{{} - {}}}{{{} + {} - {}}}\right]^{{0{{,}}3}} = {}",
                lx(t, 0),
                lx(u.t0_days, 1),
                lx(u.beta_h, 1),
                lx(t, 0),
                lx(u.t0_days, 1),
                lx(beta_c, 3)
            ),
            vec![nv("t", t, "d"), nv("t_0", u.t0_days, "d"), nv(r"\beta_H", u.beta_h, "")],
            Some(beta_c),
            "",
            vec![
                "t − t₀ is de niet-aangepaste belastingduur (symboolverklaring bij (B.7)); de \
                 aanpassing van (B.9) geldt alleen voor (B.5)."
                    .to_string(),
            ],
        ));
        keten.push(stap(
            "kruip_phi_t",
            "Kruipcoëfficiënt op tijdstip t",
            r"\varphi(t,t_0)",
            "(B.1)",
            r"\varphi(t,t_0) = \varphi_0 \cdot \beta_c(t,t_0)".to_string(),
            format!(
                r"\varphi(t,t_0) = {} \cdot {} = {}",
                lx(u.phi_0, 3),
                lx(beta_c, 3),
                lx(phi_t, 2)
            ),
            vec![nv(r"\varphi_0", u.phi_0, ""), nv(r"\beta_c", beta_c, "")],
            Some(phi_t),
            "",
            vec![],
        ));
    }
    keten
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cementklasse_alpha_volgens_b9() {
        assert_eq!(CementClass::S.alpha(), -1);
        assert_eq!(CementClass::N.alpha(), 0);
        assert_eq!(CementClass::R.alpha(), 1);
    }

    #[test]
    fn omtrek_van_een_t_is_die_van_de_omhullende_rechthoek() {
        let t = ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0);
        let (a, u) = ac_en_u(&t).unwrap();
        // Uitgeschreven omtrek: 400 + 2·50 + (400 − 200) + 2·(450 − 50) + 200 = 1700.
        assert!((u - 1700.0).abs() < 1e-9);
        assert!((a - (400.0 * 50.0 + 200.0 * 400.0)).abs() < 1e-6);
    }
}
