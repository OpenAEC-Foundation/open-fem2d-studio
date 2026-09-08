//! §9.2.1, §9.2.2 en §8.2 — de DETAILLERINGSEISEN aan de wapening van een
//! balk, elk als eigen toets met zijn eigen artikelverwijzing.
//!
//! Dit zijn geen sterktetoetsen. Ze vergelijken geen belasting met een
//! weerstand maar een AANWEZIGE maat met een VEREISTE maat: staat de beugel
//! niet te ver uit elkaar, zit er genoeg trekwapening in, passen de staven
//! wel naast elkaar. Ze komen niettemin als [`ResistanceCalc`] naar buiten —
//! hetzelfde contract als de buigtoets — zodat het rapport ze naast de
//! sterktetoetsen kan zetten met dezelfde afleiding: artikel, formule,
//! [`NamedValue`]s en een unity check.
//!
//! # Hoe de unity check hier gelezen moet worden
//!
//! Een unity check is `ed / rd` en voldoet bij ≤ 1. Bij een MAXIMUM-eis
//! (s ≤ s_l,max) is dat rechttoe rechtaan: `ed` = de aanwezige maat, `rd` =
//! de grens. Bij een MINIMUM-eis (A_s ≥ A_s,min) staat het om: `ed` = de
//! VEREISTE waarde en `rd` = de AANWEZIGE waarde, zodat "te weinig" opnieuw
//! uc > 1 oplevert. In beide gevallen betekent uc ≤ 1 "voldoet". Welke van
//! de twee het is, staat in `formula_latex` van de unity check.
//!
//! # Wat de nationale bijlage hier verandert
//!
//! Vijf van deze eisen zijn in de Nederlandse uitgave anders dan in de
//! EN-tekst. Ze zijn alle vijf zelf in de PDF nagelezen — de doorgehaalde
//! EN-tekst en de vervangende NB-zin staan naast elkaar op de gerenderde
//! pagina's:
//!
//! * **§9.2.1.1(1)** — de hele OPMERKING 2 met (9.1N) is DOORGEHAALD. In
//!   Nederland geldt niet 0,26·(f_ctm/f_yk)·b_t·d maar
//!   A_s,min = min(A_s,min1; A_s,min2). Let op het woord *kleinste*.
//! * **§9.2.2(5)/(9.5N)** — ρ_w,min = (0,08·√f_ck)/f_yk.
//! * **§9.2.2(6)/(9.6N)** — s_l,max krijgt een absoluut plafond van 300 mm
//!   dat de EN-tekst niet kent.
//! * **§9.2.2(8)/(9.8N)** — s_t,max is 500 mm, niet de 600 mm van de
//!   EN-tekst, en de tak hangt af van V_Ed t.o.v. 0,5·V_Rd,max.
//! * **§9.2.2(9)** en **§9.2.1.1(5)** — twee minimumdiameters (5 mm voor
//!   dwarskrachtwapening, 6 mm voor langsstaven) die de EN-tekst helemaal
//!   niet heeft; ze staan alleen in de NB. Idem de minimale balkbreedte van
//!   §9.2(1).
//!
//! # Een toets die iets niet weet, zegt dat
//!
//! Detailleringseisen leunen op gegevens die de app niet allemaal heeft: de
//! beugelafstand kan leeg zijn, de korrelafmeting d_g is een projectgegeven
//! en of er rekenkundig dwarskrachtwapening nodig is volgt pas uit V_Rd,c.
//! Ontbreekt zo'n gegeven, dan levert de toets [`CheckStatus::NotApplicable`]
//! met de reden erbij — nooit een stilzwijgende "voldoet". Een groene
//! detailleringstoets die niets wist is gevaarlijker dan geen toets.
//!
//! Waar het kan wordt er tóch een uitspraak gedaan. Bij een eis met twee
//! takken waarvan de voorwaarde onbekend is, geldt: valt de maat binnen de
//! STRENGSTE tak, dan voldoet zij hoe dan ook; ligt zij buiten de RUIMSTE
//! tak, dan voldoet zij in geen enkel geval. Alleen daartussen is de uitspraak
//! werkelijk onbeslist. Zie [`Uitspraak`].
//!
//! # Wat hier NIET in zit
//!
//! * §9.2.2(4) (β₃ = 0,5, minimaal aandeel beugels) en §9.2.2(7) (s_b,max)
//!   gaan over opgebogen staven; die tweede wapeningsfamilie kent het model
//!   niet.
//! * §9.2.1.2(2) (dwarswapening om meegerekende drukwapening, h.o.h. ≤ 15Ø)
//!   vergt de beugelafstand *rond de drukstaven*, wat iets anders is dan s.
//! * §8.2(2) wordt alleen HORIZONTAAL binnen één laag getoetst. De korf kent
//!   één rij boven en één rij onder, dus er is geen tweede laag waartussen de
//!   verticale vrije afstand zou moeten worden getoetst.
//! * §9.2(1)d (voorafvervaardigde schillen) vergt de schildikte; die is geen
//!   invoer.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

use crate::bending::stress_block;
use crate::section::{
    ConcreteSection, LegSpacingSource, RebarLayer, ReinforcementCage, STIRRUP_ALPHA_DEG,
};
use crate::stress_strain::DesignMaterial;

// ---------------------------------------------------------------------------
// De normwaarden. Elke constante draagt haar vindplaats; alle waarden hieronder
// komen uit de NEDERLANDSE bijlage en zijn zelf in de PDF nagelezen.
// ---------------------------------------------------------------------------

/// Coëfficiënt in ρ_w,min = (0,08·√f_ck)/f_yk — NB bij §9.2.2(5), (9.5N).
///
/// De EN-tekst geeft (9.5N) alleen als ingesloten afbeelding; de NB-zin "De
/// waarde van ρ_w,min voor liggers moet gelijk aan (0,08 √f_ck)/f_yk zijn
/// genomen" staat scherp leesbaar op de pagina en gaat voor.
///
/// De formule is DIMENSIE-AFHANKELIJK: f_ck en f_yk moeten beide in N/mm².
pub const RHO_W_MIN_COEFFICIENT: f64 = 0.08;

/// Factor op d in s_l,max = 0,75·d·(1 + cot α) — §9.2.2(6), (9.6N).
pub const S_L_MAX_FACTOR_D: f64 = 0.75;

/// Absoluut plafond op s_l,max, in mm — NB bij §9.2.2(6).
///
/// Dit plafond staat NIET in de EN-tekst. Het is bindend zodra
/// 0,75·d·(1 + cot α) er bovenuit komt, en bij rechte beugels (cot α = 0) is
/// dat al vanaf d = 400 mm het geval.
pub const S_L_MAX_PLAFOND_MM: f64 = 300.0;

/// Factor op d in s_t,max = 0,75·d — §9.2.2(8), (9.8N).
pub const S_T_MAX_FACTOR_D: f64 = 0.75;

/// Plafond op s_t,max, in mm — NB bij §9.2.2(8).
///
/// **500 mm, niet de 600 mm van de EN-tekst.** Wie (9.8N) letterlijk
/// overneemt zonder de NB krijgt in Nederland een te ruime dwarsafstand.
pub const S_T_MAX_PLAFOND_MM: f64 = 500.0;

/// De fractie van V_Rd,max waarboven de scherpe tak van s_t,max geldt —
/// NB bij §9.2.2(8): 500 mm indien V_Ed ≤ 0,5·V_Rd,max.
pub const S_T_MAX_GRENSFRACTIE_V_RD_MAX: f64 = 0.5;

/// Minimale diameter van de dwarskrachtwapening, mm — NB §9.2.2(9).
///
/// Deze eis bestaat ALLEEN in de nationale bijlage: de EN-tekst van §9.2.2
/// kent geen lid (9). De NB voegt toe: "Dwarskrachtwapening moet een diameter
/// hebben van ten minste 5 mm."
pub const MIN_DIAMETER_DWARSKRACHTWAPENING_MM: f64 = 5.0;

/// Minimale diameter van de langsstaven, mm — NB §9.2.1.1(5).
///
/// Ook deze eis bestaat alleen in de nationale bijlage: "Langsstaven moeten
/// een diameter hebben van ten minste 6 mm."
pub const MIN_DIAMETER_LANGSSTAAF_MM: f64 = 6.0;

/// A_s,max = 0,04·A_c — NB bij §9.2.1.1(3), gelijk aan de aanbevolen waarde,
/// maar door de NB normatief gemaakt.
pub const A_S_MAX_FRACTIE_A_C: f64 = 0.04;

/// A_s,min2 = 1,25 × de bij UGT-toetsing benodigde oppervlakte —
/// NB bij §9.2.1.1(1).
pub const A_S_MIN2_FACTOR_UGT: f64 = 1.25;

/// Minimale balkbreedte, mm — NB §9.2(1)a: "De breedte b van balken moet over
/// de gehele lengte en hoogte ten minste 100 mm bedragen." Alleen in de NB.
pub const MIN_BALKBREEDTE_MM: f64 = 100.0;

/// Toeslag op de minimale balkbreedte per blijvend bekist oppervlak, mm —
/// NB §9.2(1)b.
pub const BALKBREEDTE_TOESLAG_PER_BEKIST_VLAK_MM: f64 = 5.0;

/// Minimale balkbreedte bij een dubbel wapeningsnet, mm — NB §9.2(1)c.
pub const MIN_BALKBREEDTE_DUBBEL_NET_MM: f64 = 120.0;

/// Factor op d_g in de minimale balkbreedte — NB §9.2(1)e: "De balkbreedte
/// moet ten minste gelijk zijn aan 2,5 maal de grootste korrelafmeting."
pub const BALKBREEDTE_FACTOR_D_G: f64 = 2.5;

/// k₁ in de vrije staafafstand van §8.2(2) — NB: "De waarde van k1 moet gelijk
/// aan 1 zijn genomen." Een factor op de STAAFDIAMETER en dus dimensieloos;
/// de Nederlandse vertaling van de aanbevolen waarde schrijft er ten onrechte
/// "mm" bij.
pub const K1_VRIJE_STAAFAFSTAND: f64 = 1.0;

/// k₂ in de vrije staafafstand van §8.2(2), in mm — NB: "De waarde van k2 moet
/// gelijk aan 5 zijn genomen." Optelterm bij d_g.
pub const K2_VRIJE_STAAFAFSTAND_MM: f64 = 5.0;

/// De vaste ondergrens van 20 mm in §8.2(2). Geen nationaal bepaalde
/// parameter: die 20 mm staat in de EN-tekst zelf.
pub const VRIJE_STAAFAFSTAND_ONDERGRENS_MM: f64 = 20.0;

// ---------------------------------------------------------------------------
// Invoer
// ---------------------------------------------------------------------------

/// Alles wat de detailleringstoetsen nodig hebben.
///
/// De `Option`-velden zijn met opzet `Option` en hebben geen standaardwaarde:
/// `None` betekent overal NIET OPGEGEVEN. De norm kent voor geen van deze
/// gegevens een aanbevolen waarde, dus een stilzwijgende default zou een
/// verzonnen getal in een toets zetten. Wat ontbreekt, komt als reden terug in
/// de betreffende toets.
pub struct DetailleringInvoer<'a> {
    pub section: &'a ConcreteSection,
    pub cage: &'a ReinforcementCage,
    pub mat: &'a DesignMaterial,
    /// Gemiddelde treksterkte f_ctm uit **tabel 3.1**, N/mm² — nodig voor
    /// M_E,min en N_E,min van de NB-versie van A_s,min. [`DesignMaterial`]
    /// draagt f_ctm niet; hij komt uit
    /// [`crate::data::ConcreteClass::f_ctm`].
    pub f_ctm_mpa: f64,
    /// Het maatgevende krachtenpunt. Bepaalt aan welke zijde de trekwapening
    /// ligt, en levert M_Ed en N_Ed voor de NB-versie van A_s,min.
    pub force_state: ForceStateSnapshot,
    /// Grootste nominale korrelafmeting d_g, mm (§8.2(2), §9.2(1)e).
    ///
    /// `None` = niet opgegeven. **De norm geeft hier geen standaardwaarde** —
    /// d_g is een betonspecificatie, geen rekenregel — dus er wordt er ook
    /// geen aangenomen. Zonder d_g is §8.2(2) niet sluitend te toetsen.
    pub d_g_mm: Option<f64>,
    /// Is er rekenkundig dwarskrachtwapening vereist (V_Ed > V_Rd,c)?
    ///
    /// Bepaalt welke tak van de NB-regel voor s_l,max geldt. `None` =
    /// onbekend; dan wordt alleen uitgesproken wat in beide takken vaststaat.
    pub dwarskrachtwapening_vereist: Option<bool>,
    /// V_Ed in kN voor de tak van s_t,max (§9.2.2(8)).
    ///
    /// Bewust een eigen veld en NIET stilzwijgend `force_state.forces.vz_ed`:
    /// een nul in dat veld kan óók "niet ingevuld" betekenen, en dan zou de
    /// toets vanzelf in de ruime tak (500 mm) belanden. Een gegeven dat er
    /// niet is, moet als `None` binnenkomen.
    pub v_ed_kn: Option<f64>,
    /// V_Rd,max in kN volgens (6.9)/(6.14). `None` = niet berekend.
    pub v_rd_max_kn: Option<f64>,
    /// Aantal blijvend bekiste oppervlakken (NB §9.2(1)b). `None` = niet
    /// opgegeven; dan wordt die toeslag niet toegepast en zegt de toets dat.
    pub blijvend_bekiste_oppervlakken: Option<u32>,
    /// Is er een dubbel wapeningsnet toegepast (NB §9.2(1)c)? `None` = niet
    /// opgegeven.
    pub dubbel_wapeningsnet: Option<bool>,
}

// ---------------------------------------------------------------------------
// Hulpstukken
// ---------------------------------------------------------------------------

fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue { symbol: symbol.to_string(), value, unit: unit.to_string() }
}

/// Getal zonder overbodige komma's: "300" in plaats van "300,0".
fn g(v: f64) -> String {
    if (v - v.round()).abs() < 5e-4 {
        format!("{}", v.round() as i64)
    } else {
        format!("{v:.1}")
    }
}

/// De uitspraak over een eis waarvan een gegeven ontbreekt.
///
/// Bij een eis met twee takken — s_l,max en s_t,max hebben er allebei een —
/// hoeft een ontbrekende voorwaarde niet meteen "onbeslist" te betekenen. Valt
/// de aanwezige maat binnen de strengste tak, dan voldoet zij in beide
/// gevallen; ligt zij buiten de ruimste tak, dan voldoet zij in geen enkel
/// geval. Alleen daartussen weet de toets het werkelijk niet, en dán zegt hij
/// dat.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Uitspraak {
    /// Voldoet in elke tak.
    Voldoet,
    /// Voldoet in geen enkele tak.
    VoldoetNiet,
    /// Hangt af van het ontbrekende gegeven.
    Onbeslist,
}

/// De uitspraak voor een MAXIMUM-eis waarvan de tak onbekend is:
/// `strengste` ≤ `ruimste`.
fn uitspraak_maximum(aanwezig: f64, strengste: f64, ruimste: f64) -> Uitspraak {
    if aanwezig <= strengste + 1e-9 {
        Uitspraak::Voldoet
    } else if aanwezig > ruimste + 1e-9 {
        Uitspraak::VoldoetNiet
    } else {
        Uitspraak::Onbeslist
    }
}

/// Bouwsteentje voor een toets: de vaste kop plus wat er onderweg bij komt.
struct Eis {
    id: &'static str,
    title: &'static str,
    article: &'static str,
    formula_latex: String,
    variables: Vec<NamedValue>,
    notes: Vec<String>,
    force_state: ForceStateSnapshot,
}

impl Eis {
    fn new(
        id: &'static str,
        title: &'static str,
        article: &'static str,
        formula_latex: &str,
        force_state: ForceStateSnapshot,
    ) -> Self {
        Self {
            id,
            title,
            article,
            formula_latex: formula_latex.to_string(),
            variables: Vec::new(),
            notes: Vec::new(),
            force_state,
        }
    }

    fn var(mut self, symbol: &str, value: f64, unit: &str) -> Self {
        self.variables.push(nv(symbol, value, unit));
        self
    }

    fn note(mut self, s: impl Into<String>) -> Self {
        self.notes.push(s.into());
        self
    }

    fn maybe_note(self, s: Option<String>) -> Self {
        match s {
            Some(t) => self.note(t),
            None => self,
        }
    }

    fn afronden(
        self,
        value: f64,
        unit: &str,
        uc: Option<UnityCheck>,
        status: CheckStatus,
    ) -> ResistanceCalc {
        ResistanceCalc {
            id: self.id.to_string(),
            title: self.title.to_string(),
            article: self.article.to_string(),
            force_state: self.force_state,
            formula_latex: self.formula_latex,
            variables: self.variables,
            deelstappen: Vec::new(),
            value,
            unit: unit.to_string(),
            uc,
            status,
            notes: self.notes,
        }
    }

    /// MAXIMUM-eis: de aanwezige maat mag de grens niet overschrijden.
    fn maximum(self, aanwezig: f64, grens: f64, unit: &str, uc_formula: &str) -> ResistanceCalc {
        let uc = if grens > 0.0 { aanwezig / grens } else { f64::INFINITY };
        let status = if uc <= 1.0 + 1e-9 { CheckStatus::Ok } else { CheckStatus::NotOk };
        self.afronden(
            grens,
            unit,
            Some(UnityCheck {
                ed: aanwezig,
                rd: grens,
                uc,
                formula_latex: uc_formula.to_string(),
            }),
            status,
        )
    }

    /// MINIMUM-eis: de aanwezige maat moet de vereiste waarde halen. `ed` is
    /// hier de VEREISTE en `rd` de AANWEZIGE waarde — zie de moduledoc.
    fn minimum(self, aanwezig: f64, vereist: f64, unit: &str, uc_formula: &str) -> ResistanceCalc {
        let uc = if aanwezig > 0.0 { vereist / aanwezig } else { f64::INFINITY };
        let status = if uc <= 1.0 + 1e-9 { CheckStatus::Ok } else { CheckStatus::NotOk };
        self.afronden(
            vereist,
            unit,
            Some(UnityCheck {
                ed: vereist,
                rd: aanwezig,
                uc,
                formula_latex: uc_formula.to_string(),
            }),
            status,
        )
    }

    /// Niet te toetsen: het gegeven ontbreekt. Geen unity check, en met de
    /// reden vooraan in de notes.
    fn niet_te_toetsen(mut self, reden: impl Into<String>) -> ResistanceCalc {
        self.notes.insert(0, reden.into());
        self.afronden(0.0, "-", None, CheckStatus::NotApplicable)
    }
}

/// De nuttige hoogte d aan de TREKZIJDE van het maatgevende moment, mm.
///
/// §9.2.2 spreekt van "de nuttige hoogte" zonder er een teken bij te geven.
/// Bij een positief moment is dat de afstand tot de onderwapening, bij een
/// negatief moment die tot de bovenwapening. Is er aan de trekzijde geen
/// wapening, dan valt de functie terug op de onderwapening — dat is de d die
/// de rest van de crate ook gebruikt.
fn nuttige_hoogte_mm(section: &ConcreteSection, cage: &ReinforcementCage, m_ed_knm: f64) -> f64 {
    if m_ed_knm < 0.0 && !cage.top.is_empty() {
        section.h_mm - cage.d2_mm()
    } else {
        cage.d_mm(section.h_mm)
    }
}

/// cot α van de dwarskrachtwapening. Bij de vastgelegde α = 90° is dit 0;
/// hij wordt uit [`STIRRUP_ALPHA_DEG`] gerekend zodat de formules meebewegen
/// als die constante ooit verandert.
fn cot_alpha() -> f64 {
    let a = STIRRUP_ALPHA_DEG.to_radians();
    let c = a.cos() / a.sin();
    // 90° levert numeriek 6·10⁻¹⁷ in plaats van precies 0; dat schoonvegen
    // houdt "0,75·d·(1 + cot α)" in het rapport op een rond getal.
    if c.abs() < 1e-12 {
        0.0
    } else {
        c
    }
}

// ---------------------------------------------------------------------------
// §9.2.1.1(1) — A_s,min volgens de NEDERLANDSE bijlage
// ---------------------------------------------------------------------------

/// De minimum in rekening te brengen combinatie (M_E,min; N_E,min) volgens de
/// NB bij §9.2.1.1(1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MinimumBelasting {
    /// M_E,min in kNm, als positief getal (grootte).
    pub m_e_min_knm: f64,
    /// N_E,min in kN, TREK POSITIEF — dezelfde tekenafspraak als de rest van
    /// de kern. Een drukkracht komt er dus negatief uit.
    pub n_e_min_kn: f64,
    /// η = e·A_c/W. `None` bij zuivere buiging, waar e onbepaald is.
    pub eta: Option<f64>,
    /// De excentriciteit e = M_Ed/N_Ed in mm. `None` bij zuivere buiging.
    pub e_mm: Option<f64>,
    /// Het weerstandsmoment W van de meest getrokken vezel, mm³.
    pub w_mm3: f64,
}

/// M_E,min en N_E,min volgens de NB bij §9.2.1.1(1).
///
/// De NB vervangt de doorgehaalde (9.1N) en schrijft, letterlijk uit de
/// gerenderde pagina:
///
/// ```text
///   M_E,min = f_ctm·W·η/(η − 1)   indien N_E,min een drukkracht is
///   M_E,min = f_ctm·W·η/(η + 1)   indien N_E,min een trekkracht is
///   M_E,min = f_ctm·W             bij zuivere buiging
///   N_E,min = f_ctm·A_c·1/(η − 1) indien N_E,min een drukkracht is
///   N_E,min = f_ctm·A_c·1/(η + 1) indien N_E,min een trekkracht is
///   met  η = e·A_c/W  en  e de excentriciteit bij M_Ed en N_Ed
///        W  het weerstandsmoment behorend bij de meest getrokken vezel
/// ```
///
/// `Err` als η ≤ 1 bij een drukkracht: dan ligt de resultante binnen de kern,
/// scheurt de doorsnede onder deze combinatie niet en loopt η/(η − 1) door nul
/// of wordt negatief. Er is dan geen zinvolle minimumcombinatie te vormen, en
/// een getal aannemen zou hier hetzelfde zijn als iets verzinnen.
pub fn minimum_belasting(
    section: &ConcreteSection,
    f_ctm_mpa: f64,
    m_ed_knm: f64,
    n_ed_kn: f64,
) -> Result<MinimumBelasting, String> {
    // W hoort bij de MEEST GETROKKEN vezel: onder bij een positief moment,
    // boven bij een negatief. Bij een rechthoek zijn die gelijk; bij een T
    // schelen ze een factor.
    let w = if m_ed_knm < 0.0 { section.w_top_mm3() } else { section.w_bottom_mm3() };
    let a_c = section.area_mm2();
    if !(w > 0.0 && a_c > 0.0 && f_ctm_mpa > 0.0) {
        return Err("W, A_c en f_ctm moeten positief zijn om M_E,min te kunnen bepalen".into());
    }
    // Zuivere buiging: geen normaalkracht, dus geen excentriciteit en geen η.
    if n_ed_kn.abs() < 1e-9 {
        return Ok(MinimumBelasting {
            m_e_min_knm: f_ctm_mpa * w * 1e-6,
            n_e_min_kn: 0.0,
            eta: None,
            e_mm: None,
            w_mm3: w,
        });
    }
    // e = M_Ed/N_Ed. M in kNm = 10⁶ Nmm, N in kN = 10³ N, dus e in mm is
    // (M·10⁶)/(N·10³) = 10³·M/N. De excentriciteit is een afstand: absoluut.
    let e_mm = (m_ed_knm / n_ed_kn).abs() * 1e3;
    let eta = e_mm * a_c / w;
    let druk = n_ed_kn < 0.0;
    if druk && eta <= 1.0 + 1e-9 {
        return Err(format!(
            "η = e·A_c/W = {:.3} ≤ 1 bij een drukkracht: de resultante ligt binnen de kern, de \
             doorsnede scheurt onder deze combinatie niet en η/(η − 1) is niet te evalueren. \
             De NB-versie van A_s,min levert hier geen minimumcombinatie.",
            eta
        ));
    }
    let noemer = if druk { eta - 1.0 } else { eta + 1.0 };
    let n_grootte = f_ctm_mpa * a_c / noemer * 1e-3; // kN
    Ok(MinimumBelasting {
        m_e_min_knm: f_ctm_mpa * w * eta / noemer * 1e-6,
        // Trek positief: een drukkracht komt er negatief uit.
        n_e_min_kn: if druk { -n_grootte } else { n_grootte },
        eta: Some(eta),
        e_mm: Some(e_mm),
        w_mm3: w,
    })
}

/// De volgens §6.1 benodigde TREKWAPENING voor de combinatie (M; N), mm².
///
/// De NB bij §9.2.1.1(1) verwijst voor A_s,min1 naar "de volgens 6.1 benodigde
/// oppervlakte", en voor A_s,min2 naar "de benodigde oppervlakte bij toetsing
/// in de uiterste grenstoestand". Dat is twee keer dezelfde vraag met een
/// andere belasting, dus twee keer dezelfde omkering: welke A_s levert precies
/// M_Rd = M?
///
/// De omkering gebeurt met [`crate::bending::stress_block`] — dezelfde
/// rechthoekige spanningsverdeling als de buigtoets, zodat het antwoord bij
/// dezelfde norm hoort — en met bisectie, want M_Rd(A_s) is niet in gesloten
/// vorm om te keren zodra er drukwapening of een normaalkracht meedoet.
/// M_Rd is monotoon stijgend in A_s zolang de doorsnede niet
/// overgewapend is; de bovengrens van het zoekbereik is daarom A_s,max =
/// 0,04·A_c uit §9.2.1.1(3): meer dan dat mag de norm zelf niet.
///
/// **Modelkeuze, geen normvoorschrift:** alleen de rij aan de TREKZIJDE wordt
/// gevarieerd; de wapening aan de andere zijde blijft staan zoals zij is
/// opgegeven. Dat is wat een ontwerper doet — hij zoekt de benodigde
/// trekwapening bij een gegeven doorsnede — maar de norm schrijft het niet
/// voor.
pub fn benodigde_trekwapening_mm2(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    m_knm: f64,
    n_kn: f64,
) -> Result<f64, String> {
    let sign = if m_knm < 0.0 { -1.0 } else { 1.0 };
    let h = section.h_mm;
    let (trekrij, drukrij) =
        if sign > 0.0 { (&cage.bottom, &cage.top) } else { (&cage.top, &cage.bottom) };
    if trekrij.diameter_mm <= 0.0 {
        return Err(
            "aan de trekzijde is geen staafdiameter opgegeven, dus de LIGGING van de benodigde \
             staven is niet bekend; zonder ligging is er geen nuttige hoogte en dus geen \
             benodigde oppervlakte te bepalen"
                .into(),
        );
    }
    // De ligging van de trekrij: dezelfde meetkunde als `ReinforcementCage::layers`.
    let z_trek = if sign > 0.0 {
        cage.axis_offset_mm(trekrij)
    } else {
        h - cage.axis_offset_mm(trekrij)
    };
    let z_druk = if sign > 0.0 {
        h - cage.axis_offset_mm(drukrij)
    } else {
        cage.axis_offset_mm(drukrij)
    };
    let doel = m_knm.abs();
    let bovengrens = A_S_MAX_FRACTIE_A_C * section.area_mm2();

    let m_rd = |a_s: f64| -> Option<f64> {
        let mut lagen = vec![RebarLayer {
            z_mm: z_trek,
            area_mm2: a_s,
            label: "trekzijde".to_string(),
        }];
        if !drukrij.is_empty() {
            lagen.push(RebarLayer {
                z_mm: z_druk,
                area_mm2: drukrij.area_mm2(),
                label: "drukzijde".to_string(),
            });
        }
        stress_block(section, &lagen, mat, n_kn, sign).ok().map(|r| r.m_rd_knm)
    };

    // Een oppervlakte van precies nul zou de laag laten verdwijnen; 10⁻³ mm²
    // is verwaarloosbaar staal en houdt de laag in de berekening.
    let ondergrens = 1e-3;
    match m_rd(ondergrens) {
        Some(m) if m >= doel => return Ok(0.0),
        Some(_) => {}
        None => {
            return Err(
                "de rechthoekige spanningsverdeling levert bij deze normaalkracht geen evenwicht; \
                 de benodigde wapening is er niet mee te bepalen (zie de M-N-κ-toets)"
                    .into(),
            )
        }
    }
    match m_rd(bovengrens) {
        Some(m) if m < doel => {
            return Err(format!(
                "ook met A_s = A_s,max = 0,04·A_c = {:.0} mm² is M_Rd = {m:.1} kNm kleiner dan de \
                 gevraagde {doel:.1} kNm; er is binnen de norm geen wapening die deze combinatie \
                 opneemt",
                bovengrens
            ))
        }
        Some(_) => {}
        None => {
            return Err(
                "de rechthoekige spanningsverdeling levert bij A_s,max geen evenwicht; de \
                 benodigde wapening is er niet mee te bepalen (zie de M-N-κ-toets)"
                    .into(),
            )
        }
    }

    let mut lo = ondergrens;
    let mut hi = bovengrens;
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        match m_rd(mid) {
            Some(m) if m < doel => lo = mid,
            Some(_) => hi = mid,
            // Geen evenwicht halverwege: dat kan bij een grote trekkracht met
            // weinig staal. Meer staal helpt dan, dus zoek naar boven.
            None => lo = mid,
        }
        if hi - lo < 1e-6 * bovengrens.max(1.0) {
            break;
        }
    }
    Ok(hi)
}

/// §9.2.1.1(1) — A_s,min volgens de NEDERLANDSE bijlage.
///
/// **(9.1N) geldt in Nederland NIET.** De hele OPMERKING 2 met
/// A_s,min = 0,26·(f_ctm/f_yk)·b_t·d is in de NL-uitgave doorgehaald; wie hem
/// implementeert rekent met een niet-geldende regel. De NB zet er voor in de
/// plaats:
///
/// ```text
///   A_s,min = min(A_s,min1 ; A_s,min2)
/// ```
///
/// — de KLEINSTE van beide, niet de grootste. Dat is de tweede valkuil: 'min'
/// voor 'max' lezen geeft stelselmatig te veel minimumwapening.
///
/// Omdat het een minimum van twee is, is elk van beide op zichzelf een
/// BOVENGRENS voor A_s,min. Haalt de aanwezige wapening er één van, dan
/// voldoet zij dus al — ook als de andere niet bepaald kon worden. Alleen als
/// de aanwezige wapening de wél bepaalde kandidaat níét haalt en de andere
/// onbekend is, kan de toets niets zeggen; dan zegt hij dat.
pub fn as_min_9_2_1_1(inv: &DetailleringInvoer) -> ResistanceCalc {
    let m_ed = inv.force_state.forces.my_ed;
    let n_ed = inv.force_state.forces.n_ed;
    let sign_positief = m_ed >= 0.0;
    let a_s_trek = if sign_positief {
        inv.cage.a_s_bottom_mm2()
    } else {
        inv.cage.a_s_top_mm2()
    };

    let eis = Eis::new(
        "9.2.1.1_as_min",
        "Minimum langstrekwapening A_s,min",
        "NB bij art. 9.2.1.1(1) — (9.1N) is in de Nederlandse uitgave doorgehaald",
        r"A_{s,\min} = \min\left(A_{s,\min 1};\ A_{s,\min 2}\right),\quad A_{s,\min 2} = 1{,}25\,A_{s,\mathrm{UGT}}",
        inv.force_state,
    )
    .var(r"A_{s,trek}", a_s_trek, "mm²")
    .var(r"f_{ctm}", inv.f_ctm_mpa, "N/mm²")
    .var("A_c", inv.section.area_mm2(), "mm²")
    .note(
        "De Nederlandse bijlage heeft de hele OPMERKING 2 bij 9.2.1.1(1) DOORGEHAALD, inclusief \
         vergelijking (9.1N) A_s,min = 0,26·(f_ctm/f_yk)·b_t·d. Die vergelijking is in Nederland \
         NIET van toepassing en is hier dan ook niet gebruikt.",
    )
    .note(
        "A_s,min is de KLEINSTE van A_s,min1 en A_s,min2 — niet de grootste. Elk van beide is \
         daardoor op zichzelf al genoeg om aan de eis te voldoen.",
    );

    // De minimumcombinatie (M_E,min; N_E,min) volgens de NB.
    let mb = match minimum_belasting(inv.section, inv.f_ctm_mpa, m_ed, n_ed) {
        Ok(mb) => mb,
        Err(reden) => {
            return eis
                .note(
                    "A_s,min2 = 1,25 × de UGT-behoefte is hierdoor de enige kandidaat die \
                     overblijft; ook die is zonder A_s,min1 geen sluitende toets, want A_s,min \
                     is het minimum van beide.",
                )
                .niet_te_toetsen(format!("A_s,min1 is niet te bepalen: {reden}"))
        }
    };
    let mut eis = eis
        .var(r"W", mb.w_mm3, "mm³")
        .var(r"M_{E,\min}", mb.m_e_min_knm, "kNm")
        .var(r"N_{E,\min}", mb.n_e_min_kn, "kN");
    if let (Some(eta), Some(e)) = (mb.eta, mb.e_mm) {
        eis = eis.var(r"\eta", eta, "-").var("e", e, "mm");
        eis = eis.note(format!(
            "η = e·A_c/W = {:.0}·{:.0}/{:.0} = {:.3}, met e = |M_Ed/N_Ed| = {:.0} mm.",
            e,
            inv.section.area_mm2(),
            mb.w_mm3,
            eta,
            e
        ));
    } else {
        eis = eis.note(format!(
            "Zuivere buiging (N_Ed = 0): M_E,min = f_ctm·W = {:.2}·{:.0} = {:.1} kNm.",
            inv.f_ctm_mpa,
            mb.w_mm3,
            mb.m_e_min_knm
        ));
    }

    // De twee kandidaten. Beide via dezelfde omkering van 6.1.
    let a_min1 = benodigde_trekwapening_mm2(
        inv.section,
        inv.cage,
        inv.mat,
        mb.m_e_min_knm * if sign_positief { 1.0 } else { -1.0 },
        mb.n_e_min_kn,
    );
    let a_min2 = benodigde_trekwapening_mm2(inv.section, inv.cage, inv.mat, m_ed, n_ed)
        .map(|a| A_S_MIN2_FACTOR_UGT * a);

    let mut eis = match &a_min1 {
        Ok(a) => eis
            .var(r"A_{s,\min 1}", *a, "mm²")
            .note(format!(
                "A_s,min1 = de volgens 6.1 benodigde oppervlakte voor (M_E,min = {:.1} kNm; \
                 N_E,min = {:.1} kN) = {a:.0} mm².",
                mb.m_e_min_knm, mb.n_e_min_kn
            )),
        Err(r) => eis.note(format!("A_s,min1 is niet bepaald: {r}")),
    };
    eis = match &a_min2 {
        Ok(a) => eis.var(r"A_{s,\min 2}", *a, "mm²").note(format!(
            "A_s,min2 = 1,25 × de bij UGT-toetsing benodigde oppervlakte voor \
             (M_Ed = {:.1} kNm; N_Ed = {:.1} kN) = {a:.0} mm².",
            m_ed, n_ed
        )),
        Err(r) => eis.note(format!("A_s,min2 is niet bepaald: {r}")),
    };

    let kandidaten: Vec<f64> = [a_min1.as_ref().ok().copied(), a_min2.as_ref().ok().copied()]
        .into_iter()
        .flatten()
        .collect();
    if kandidaten.is_empty() {
        return eis.niet_te_toetsen(
            "Geen van beide kandidaten voor A_s,min kon worden bepaald; zie de redenen hieronder.",
        );
    }
    let laagste = kandidaten.iter().cloned().fold(f64::INFINITY, f64::min);
    let beide_bekend = a_min1.is_ok() && a_min2.is_ok();
    if a_s_trek + 1e-9 >= laagste {
        // Voldoet aan de laagste bekende kandidaat, en dus zeker aan het
        // minimum van beide — ook als de andere onbekend is.
        return eis
            .note(format!(
                "De aanwezige trekwapening {:.0} mm² haalt de laagste bepaalde kandidaat \
                 ({laagste:.0} mm²) en voldoet daarmee aan A_s,min, dat immers het minimum van \
                 beide kandidaten is.",
                a_s_trek
            ))
            .minimum(a_s_trek, laagste, "mm²", r"A_{s,\min} / A_{s,trek}");
    }
    if beide_bekend {
        return eis.minimum(a_s_trek, laagste, "mm²", r"A_{s,\min} / A_{s,trek}");
    }
    eis.niet_te_toetsen(format!(
        "De aanwezige trekwapening {a_s_trek:.0} mm² haalt de enige bepaalde kandidaat \
         ({laagste:.0} mm²) niet, maar de andere kandidaat kon niet worden bepaald. Omdat \
         A_s,min het MINIMUM van beide is, kan de uitkomst alsnog voldoen; de toets doet daarom \
         geen uitspraak."
    ))
}

// ---------------------------------------------------------------------------
// §9.2.1.1(3) — A_s,max
// ---------------------------------------------------------------------------

/// §9.2.1.1(3) — A_s,max = 0,04·A_c buiten de overlappingslassen.
///
/// De NB maakt de aanbevolen waarde normatief: "De waarde van A_s,max voor
/// liggers moet gelijk aan 0,04 A_c zijn genomen."
///
/// **Gekozen lezing:** de norm schrijft "de oppervlakte van de dwarsdoorsnede
/// van trek- OF drukwapening", dus wordt elke rij afzonderlijk getoetst en is
/// de grootste van de twee maatgevend. De som van beide rijen staat als
/// `A_s,totaal` in de variabelen, zodat wie de strengere lezing "de totale
/// langswapening" aanhoudt, die zelf kan nalopen.
pub fn as_max_9_2_1_1(inv: &DetailleringInvoer) -> ResistanceCalc {
    let a_c = inv.section.area_mm2();
    let onder = inv.cage.a_s_bottom_mm2();
    let boven = inv.cage.a_s_top_mm2();
    let maatgevend = onder.max(boven);
    let grens = A_S_MAX_FRACTIE_A_C * a_c;
    Eis::new(
        "9.2.1.1_as_max",
        "Maximum langswapening A_s,max",
        "art. 9.2.1.1(3) met de NB-waarde",
        r"A_{s,\max} = 0{,}04\,A_c",
        inv.force_state,
    )
    .var("A_c", a_c, "mm²")
    .var(r"A_{s,onder}", onder, "mm²")
    .var(r"A_{s,boven}", boven, "mm²")
    .var(r"A_{s,totaal}", onder + boven, "mm²")
    .var(r"A_{s,\max}", grens, "mm²")
    .note(format!(
        "A_s,max = 0,04·A_c = 0,04·{} = {} mm². De eis geldt BUITEN de overlappingslassen; \
         binnen een lasgebied ligt de grens hoger en wordt hier niet getoetst.",
        g(a_c),
        g(grens)
    ))
    .note(
        "Gelezen als: trek- én drukwapening elk afzonderlijk ≤ A_s,max (de norm schrijft \
         'trek- of drukwapening'). Maatgevend is dus de grootste van beide rijen; \
         A_s,totaal staat er ter controle bij voor wie de som wil toetsen.",
    )
    .maximum(maatgevend, grens, "mm²", r"A_{s} / A_{s,\max}")
}

// ---------------------------------------------------------------------------
// §9.2.2(5) — ρ_w,min
// ---------------------------------------------------------------------------

/// §9.2.2(5) met (9.5N) — de minimum dwarskrachtwapeningsverhouding.
///
/// ```text
///   ρ_w     = A_sw / (s · b_w · sin α)          (9.4)
///   ρ_w,min = (0,08 · √f_ck) / f_yk             NB bij (9.5N)
/// ```
///
/// Drie dingen om niet te verliezen:
///
/// * ρ_w rekent met **b_w**, de lijfbreedte, niet met de totale breedte. Bij
///   een T scheelt dat makkelijk een factor drie.
/// * (9.5N) werkt alleen als f_ck en f_yk beide in N/mm² staan. Deze crate
///   rekent in N en mm, dus dat klopt; een omrekening naar kN of kPa zou de
///   formule stil breken.
/// * De norm schrijft in (9.5N) **f_yk** — de langswapening — en niet f_ywk,
///   ook al gaat het over beugels. Die letterlijke lezing wordt hier
///   aangehouden; wijkt de beugelkwaliteit af, dan staat dat als opmerking bij
///   de toets.
pub fn rho_w_min_9_2_2(inv: &DetailleringInvoer) -> ResistanceCalc {
    let b_w = inv.section.b_w_mm();
    let f_ck = inv.mat.f_ck;
    let f_yk = inv.mat.f_yk;
    let rho_min = RHO_W_MIN_COEFFICIENT * f_ck.sqrt() / f_yk;
    let eis = Eis::new(
        "9.2.2_rho_w_min",
        "Minimum dwarskrachtwapening ρ_w,min",
        "art. 9.2.2(5) met de NB-waarde bij (9.5N)",
        r"\rho_w = \frac{A_{sw}}{s\,b_w\,\sin\alpha} \ \ge\ \rho_{w,\min} = \frac{0{,}08\sqrt{f_{ck}}}{f_{yk}}",
        inv.force_state,
    )
    .var("b_w", b_w, "mm")
    .var(r"f_{ck}", f_ck, "N/mm²")
    .var(r"f_{yk}", f_yk, "N/mm²")
    .var(r"\rho_{w,\min}", rho_min, "-")
    .note(format!(
        "ρ_w,min = 0,08·√f_ck/f_yk = 0,08·√{}/{} = {:.5}. Dit is de NB-waarde; \
         zij vervangt de aanbevolen waarde van (9.5N).",
        g(f_ck),
        g(f_yk),
        rho_min
    ))
    .note(
        "b_w is de LIJFBREEDTE (§6.2.3(1): de kleinste breedte tussen trek- en drukrand), niet \
         de flensbreedte.",
    )
    .maybe_note(inv.cage.stirrup_fywk_mpa.filter(|f| (*f - f_yk).abs() > 1e-9).map(|f| {
        format!(
            "Voor de beugels is een eigen vloeigrens f_ywk = {} N/mm² opgegeven. (9.5N) schrijft \
             hier echter f_yk = {} N/mm², de vloeigrens van de LANGSWAPENING, en die letterlijke \
             lezing is aangehouden. Met f_ywk in de noemer zou ρ_w,min = {:.5} zijn.",
            g(f),
            g(f_yk),
            RHO_W_MIN_COEFFICIENT * f_ck.sqrt() / f
        )
    }));

    let dw = match inv.cage.shear_reinforcement() {
        Ok(dw) => dw,
        Err(reden) => return eis.niet_te_toetsen(reden),
    };
    // `!(x > 0.0)` en niet `x <= 0.0`: een NaN moet hier WEL worden afgevangen,
    // en `NaN <= 0.0` is onwaar. Zelfde idioom als in `section`.
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(b_w > 0.0) {
        return eis.niet_te_toetsen("de lijfbreedte b_w is niet positief");
    }
    let sin_a = STIRRUP_ALPHA_DEG.to_radians().sin();
    let rho_w = dw.a_sw_mm2 / (dw.s_mm * b_w * sin_a);
    eis.var(r"A_{sw}", dw.a_sw_mm2, "mm²")
        .var("s", dw.s_mm, "mm")
        .var(r"\alpha", dw.alpha_deg, "°")
        .var(r"\rho_w", rho_w, "-")
        .note(format!(
            "ρ_w = A_sw/(s·b_w·sin α) = {}/({}·{}·{:.3}) = {:.5}, met A_sw = {} benen × π/4 × Ø{}² \
             = {} mm² (§9.2.2(5): de wapening BINNEN de lengte s).",
            g(dw.a_sw_mm2),
            g(dw.s_mm),
            g(b_w),
            sin_a,
            rho_w,
            dw.legs,
            g(dw.diameter_mm),
            g(dw.a_sw_mm2)
        ))
        .minimum(rho_w, rho_min, "-", r"\rho_{w,\min} / \rho_w")
}

// ---------------------------------------------------------------------------
// §9.2.2(6) — s_l,max
// ---------------------------------------------------------------------------

/// §9.2.2(6) met de NB-vervanging van (9.6N) — de maximale beugelafstand in de
/// LENGTErichting.
///
/// De NB-tekst luidt letterlijk: "Indien geen dwarskrachtwapening is vereist,
/// moet de waarde van s_l,max gelijk aan 300 mm zijn genomen. Indien wel
/// dwarskrachtwapening is vereist, moet de waarde van s_l,max gelijk aan de
/// kleinste waarde van 0,75 d(1 + cot α) en 300 mm zijn genomen."
///
/// Het plafond van 300 mm staat NIET in de EN-tekst. Bij rechte beugels
/// (cot α = 0) is 0,75·d groter dan 300 mm zodra d > 400 mm, en dan is het
/// plafond bindend.
///
/// Is niet bekend of er rekenkundig dwarskrachtwapening vereist is, dan wordt
/// alleen uitgesproken wat in beide takken vaststaat; zie [`Uitspraak`].
pub fn s_l_max_9_2_2(inv: &DetailleringInvoer) -> ResistanceCalc {
    let d = nuttige_hoogte_mm(inv.section, inv.cage, inv.force_state.forces.my_ed);
    let cot_a = cot_alpha();
    let formule = S_L_MAX_FACTOR_D * d * (1.0 + cot_a);
    let streng = formule.min(S_L_MAX_PLAFOND_MM);
    let ruim = S_L_MAX_PLAFOND_MM;

    let eis = Eis::new(
        "9.2.2_sl_max",
        "Maximale beugelafstand in de lengterichting s_l,max",
        "art. 9.2.2(6) met de NB-vervanging van (9.6N)",
        r"s_{l,\max} = \begin{cases} 300\ \text{mm} & \text{geen dwarskrachtwapening vereist} \\ \min\!\left(0{,}75\,d\,(1+\cot\alpha);\ 300\ \text{mm}\right) & \text{wel vereist} \end{cases}",
        inv.force_state,
    )
    .var("d", d, "mm")
    .var(r"\alpha", STIRRUP_ALPHA_DEG, "°")
    .var(r"\cot\alpha", cot_a, "-")
    .var(r"0{,}75\,d\,(1+\cot\alpha)", formule, "mm")
    .note(format!(
        "0,75·d·(1 + cot α) = 0,75·{}·(1 + {}) = {} mm; het NB-plafond is {} mm. Dat plafond \
         staat niet in de EN-tekst en is bij rechte beugels bindend zodra d > 400 mm.",
        g(d),
        g(cot_a),
        g(formule),
        g(S_L_MAX_PLAFOND_MM)
    ));

    let dw = match inv.cage.shear_reinforcement() {
        Ok(dw) => dw,
        Err(reden) => return eis.niet_te_toetsen(reden),
    };
    let eis = eis.var("s", dw.s_mm, "mm");

    match inv.dwarskrachtwapening_vereist {
        Some(true) => eis
            .note(format!(
                "Er is rekenkundig dwarskrachtwapening vereist, dus s_l,max = min({} mm; {} mm) = {} mm.",
                g(formule),
                g(S_L_MAX_PLAFOND_MM),
                g(streng)
            ))
            .maximum(dw.s_mm, streng, "mm", r"s / s_{l,\max}"),
        Some(false) => eis
            .note(format!(
                "Er is rekenkundig geen dwarskrachtwapening vereist, dus s_l,max = {} mm. \
                 §6.2.1(4) eist niettemin een minimale dwarskrachtwapening volgens 9.2.2, \
                 behalve bij platen met dwarsverdeling en bij elementen van ondergeschikt belang.",
                g(S_L_MAX_PLAFOND_MM)
            ))
            .maximum(dw.s_mm, ruim, "mm", r"s / s_{l,\max}"),
        None => match uitspraak_maximum(dw.s_mm, streng, ruim) {
            Uitspraak::Voldoet => eis
                .note(format!(
                    "Niet opgegeven of er rekenkundig dwarskrachtwapening vereist is. s = {} mm \
                     valt binnen de STRENGSTE tak ({} mm) en voldoet dus in beide gevallen.",
                    g(dw.s_mm),
                    g(streng)
                ))
                .maximum(dw.s_mm, streng, "mm", r"s / s_{l,\max}"),
            Uitspraak::VoldoetNiet => eis
                .note(format!(
                    "Niet opgegeven of er rekenkundig dwarskrachtwapening vereist is. s = {} mm \
                     overschrijdt zelfs de RUIMSTE tak ({} mm) en voldoet dus in geen enkel geval.",
                    g(dw.s_mm),
                    g(ruim)
                ))
                .maximum(dw.s_mm, ruim, "mm", r"s / s_{l,\max}"),
            Uitspraak::Onbeslist => eis.niet_te_toetsen(format!(
                "s = {} mm ligt tussen de strengste tak ({} mm) en de ruimste tak ({} mm). Welke \
                 van de twee geldt hangt af van de vraag of er rekenkundig dwarskrachtwapening \
                 vereist is (V_Ed > V_Rd,c), en dat is niet opgegeven. De toets doet daarom geen \
                 uitspraak.",
                g(dw.s_mm),
                g(streng),
                g(ruim)
            )),
        },
    }
}

// ---------------------------------------------------------------------------
// §9.2.2(8) — s_t,max
// ---------------------------------------------------------------------------

/// §9.2.2(8) met de NB-vervanging van (9.8N) — de maximale afstand tussen de
/// beugelBENEN, gemeten in DWARSrichting.
///
/// NB-tekst letterlijk: "De waarde van s_t,max moet gelijk zijn genomen aan:
/// 500 mm indien V_Ed ≤ 0,5 V_Rd,max / 0,75 d ≤ 500 mm indien
/// V_Ed > 0,5 V_Rd,max."
///
/// Twee valkuilen tegelijk:
///
/// * het plafond is **500 mm**, niet de 600 mm van de EN-tekst;
/// * de tak hangt van V_Rd,max af, dus deze detailleringstoets kan pas NA de
///   dwarskrachtberekening. Wie 9.2.2 als "pure detaillering" vooraan zet,
///   kan hem niet uitvoeren.
///
/// s_t komt uit [`ReinforcementCage::leg_spacing_mm`] en is bij een gesloten
/// tweebenige beugel afleidbaar uit b_w, c_nom en Ø; dan staat dat er als
/// afleiding bij.
pub fn s_t_max_9_2_2(inv: &DetailleringInvoer) -> ResistanceCalc {
    let d = nuttige_hoogte_mm(inv.section, inv.cage, inv.force_state.forces.my_ed);
    let formule = S_T_MAX_FACTOR_D * d;
    let streng = formule.min(S_T_MAX_PLAFOND_MM);
    let ruim = S_T_MAX_PLAFOND_MM;

    let eis = Eis::new(
        "9.2.2_st_max",
        "Maximale afstand tussen beugelbenen s_t,max",
        "art. 9.2.2(8) met de NB-vervanging van (9.8N)",
        r"s_{t,\max} = \begin{cases} 500\ \text{mm} & V_{Ed} \le 0{,}5\,V_{Rd,\max} \\ 0{,}75\,d \le 500\ \text{mm} & V_{Ed} > 0{,}5\,V_{Rd,\max} \end{cases}",
        inv.force_state,
    )
    .var("d", d, "mm")
    .var(r"0{,}75\,d", formule, "mm")
    .note(format!(
        "0,75·d = {} mm; het NB-plafond is {} mm — NIET de 600 mm van de aanbevolen (9.8N).",
        g(formule),
        g(S_T_MAX_PLAFOND_MM)
    ));

    let (s_t, herkomst) = match inv.cage.leg_spacing_mm(inv.section) {
        Some(v) => v,
        None => {
            return eis.niet_te_toetsen(
                "de dwarsafstand s_t van de beugelbenen is niet opgegeven en niet af te leiden. \
                 Afleiden kan alleen bij een gesloten TWEEbenige beugel (s_t = b_w − 2·c_nom − Ø); \
                 bij meer benen hangt s_t af van de verdeling over de breedte en zou elke waarde \
                 een aanname zijn.",
            )
        }
    };
    let eis = eis.var("s_t", s_t, "mm").note(match herkomst {
        LegSpacingSource::Given => format!("s_t = {} mm is opgegeven.", g(s_t)),
        LegSpacingSource::DerivedTwoLeg => format!(
            "s_t = {} mm is AFGELEID uit de meetkunde van een gesloten tweebenige beugel: \
             s_t = b_w − 2·c_nom − Ø_beugel = {} − 2·{} − {}. Dat is zuivere meetkunde en staat \
             als zodanig niet in de norm.",
            g(s_t),
            g(inv.section.b_w_mm()),
            g(inv.cage.cover_mm),
            g(inv.cage.stirrup_diameter_mm)
        ),
    });

    match (inv.v_ed_kn, inv.v_rd_max_kn) {
        (Some(v_ed), Some(v_rd_max)) if v_rd_max > 0.0 => {
            let grensv = S_T_MAX_GRENSFRACTIE_V_RD_MAX * v_rd_max;
            let zwaar = v_ed.abs() > grensv + 1e-9;
            let grens = if zwaar { streng } else { ruim };
            eis.var(r"V_{Ed}", v_ed.abs(), "kN")
                .var(r"V_{Rd,\max}", v_rd_max, "kN")
                .note(format!(
                    "V_Ed = {} kN {} 0,5·V_Rd,max = {} kN, dus s_t,max = {} mm.",
                    g(v_ed.abs()),
                    if zwaar { ">" } else { "≤" },
                    g(grensv),
                    g(grens)
                ))
                .maximum(s_t, grens, "mm", r"s_t / s_{t,\max}")
        }
        _ => match uitspraak_maximum(s_t, streng, ruim) {
            Uitspraak::Voldoet => eis
                .note(format!(
                    "V_Ed en/of V_Rd,max zijn niet opgegeven, dus de tak is onbekend. s_t = {} mm \
                     valt binnen de STRENGSTE tak ({} mm) en voldoet dus in beide gevallen.",
                    g(s_t),
                    g(streng)
                ))
                .maximum(s_t, streng, "mm", r"s_t / s_{t,\max}"),
            Uitspraak::VoldoetNiet => eis
                .note(format!(
                    "V_Ed en/of V_Rd,max zijn niet opgegeven, dus de tak is onbekend. s_t = {} mm \
                     overschrijdt zelfs de RUIMSTE tak ({} mm) en voldoet dus in geen enkel geval.",
                    g(s_t),
                    g(ruim)
                ))
                .maximum(s_t, ruim, "mm", r"s_t / s_{t,\max}"),
            Uitspraak::Onbeslist => eis.niet_te_toetsen(format!(
                "s_t = {} mm ligt tussen de strengste tak ({} mm) en de ruimste tak ({} mm). \
                 Welke geldt hangt af van V_Ed ten opzichte van 0,5·V_Rd,max, en die zijn niet \
                 opgegeven. Deze toets kan pas NA de dwarskrachtberekening.",
                g(s_t),
                g(streng),
                g(ruim)
            )),
        },
    }
}

// ---------------------------------------------------------------------------
// §9.2.2(9) en §9.2.1.1(5) — de twee minimumdiameters van de NB
// ---------------------------------------------------------------------------

/// NB §9.2.2(9) — de dwarskrachtwapening moet ten minste Ø5 zijn.
///
/// Deze eis staat ALLEEN in de nationale bijlage; de EN-tekst van §9.2.2 kent
/// geen lid (9).
pub fn min_diameter_beugel_9_2_2(inv: &DetailleringInvoer) -> ResistanceCalc {
    let d_sw = inv.cage.stirrup_diameter_mm;
    let eis = Eis::new(
        "9.2.2_min_diameter_beugel",
        "Minimumdiameter dwarskrachtwapening",
        "NB bij art. 9.2.2(9) — eis die alleen in de nationale bijlage staat",
        r"\phi_{sw} \ \ge\ 5\ \text{mm}",
        inv.force_state,
    )
    .var(r"\phi_{sw,\min}", MIN_DIAMETER_DWARSKRACHTWAPENING_MM, "mm")
    .note(
        "De NB voegt aan 9.2.2 een lid (9) toe dat de EN-tekst niet heeft: \
         \"Dwarskrachtwapening moet een diameter hebben van ten minste 5 mm.\"",
    );
    // Zie de opmerking bij `rho_w_min_9_2_2`: NaN moet hier ook afvallen.
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(d_sw > 0.0) {
        return eis.niet_te_toetsen(
            "er is geen dwarskrachtwapening opgegeven (beugeldiameter 0), dus er is geen diameter \
             om te toetsen. Let op: §6.2.1(4) eist ook zonder rekenkundige noodzaak een minimale \
             dwarskrachtwapening volgens 9.2.2 — behalve bij platen waarin herverdeling in \
             dwarsrichting mogelijk is en bij elementen van ondergeschikt belang.",
        );
    }
    eis.var(r"\phi_{sw}", d_sw, "mm").minimum(
        d_sw,
        MIN_DIAMETER_DWARSKRACHTWAPENING_MM,
        "mm",
        r"\phi_{sw,\min} / \phi_{sw}",
    )
}

/// NB §9.2.1.1(5) — langsstaven moeten ten minste Ø6 zijn.
///
/// Ook deze eis staat alleen in de nationale bijlage. Maatgevend is de
/// KLEINSTE diameter van de aanwezige rijen.
pub fn min_diameter_langsstaaf_9_2_1_1(inv: &DetailleringInvoer) -> ResistanceCalc {
    let eis = Eis::new(
        "9.2.1.1_min_diameter_langs",
        "Minimumdiameter langsstaven",
        "NB bij art. 9.2.1.1(5) — eis die alleen in de nationale bijlage staat",
        r"\phi_{l} \ \ge\ 6\ \text{mm}",
        inv.force_state,
    )
    .var(r"\phi_{l,\min,eis}", MIN_DIAMETER_LANGSSTAAF_MM, "mm")
    .note(
        "De NB voegt aan 9.2.1.1 een lid (5) toe dat de EN-tekst niet heeft: \
         \"Langsstaven moeten een diameter hebben van ten minste 6 mm.\"",
    );
    let mut kleinste = f64::INFINITY;
    for rij in [&inv.cage.bottom, &inv.cage.top] {
        if !rij.is_empty() {
            kleinste = kleinste.min(rij.diameter_mm);
        }
    }
    if !kleinste.is_finite() {
        return eis.niet_te_toetsen("de korf bevat geen langswapening om te toetsen");
    }
    eis.var(r"\phi_{l}", kleinste, "mm")
        .note(format!(
            "Maatgevend is de kleinste aanwezige staafdiameter: Ø{} (onder {}, boven {}).",
            g(kleinste),
            inv.cage.bottom.label(),
            inv.cage.top.label()
        ))
        .minimum(kleinste, MIN_DIAMETER_LANGSSTAAF_MM, "mm", r"\phi_{l,\min} / \phi_{l}")
}

// ---------------------------------------------------------------------------
// NB §9.2(1) — minimale balkbreedte
// ---------------------------------------------------------------------------

/// NB §9.2(1) — de minimale balkbreedte.
///
/// Ook dit artikel bestaat alleen in de Nederlandse bijlage; de EN-tekst van
/// §9.2 kent geen lid (1) met breedte-eisen. De NB somt op:
///
/// * **a)** b ≥ 100 mm over de gehele lengte en hoogte;
/// * **b)** bij storten tegen blijvende bekisting +5 mm per blijvend bekist
///   oppervlak;
/// * **c)** bij een dubbel wapeningsnet b ≥ 120 mm;
/// * **d)** bij voorafvervaardigde schillen 100 mm plus de dikte van elke
///   schil — niet getoetst, want de schildikte is geen invoer;
/// * **e)** b ≥ 2,5 × de grootste korrelafmeting.
///
/// Getoetst wordt b_w, de KLEINSTE breedte van de doorsnede: "over de gehele
/// lengte en hoogte" betekent dat ook het lijf van een T eraan moet voldoen.
///
/// De toeslag van (b) wordt op de maatgevende basiswaarde gelegd — de NB zegt
/// "de minimale breedte moet zijn vermeerderd", zonder te zeggen wélke, en dit
/// is de letterlijke lezing.
///
/// Ontbreekt een gegeven, dan wordt de betreffende deeleis NIET toegepast en
/// staat dat met zoveel woorden in de opmerkingen. De toets zwijgt daar dus
/// niet over.
pub fn min_balkbreedte_9_2(inv: &DetailleringInvoer) -> ResistanceCalc {
    let b_w = inv.section.b_w_mm();
    let mut basis = MIN_BALKBREEDTE_MM;
    let mut eis = Eis::new(
        "9.2_min_balkbreedte",
        "Minimale balkbreedte",
        "NB bij art. 9.2(1) — eis die alleen in de nationale bijlage staat",
        r"b_w \ \ge\ \max\left(100\ \text{mm} \ [+5\ \text{mm per bekist vlak}];\ 120\ \text{mm bij dubbel net};\ 2{,}5\,d_g\right)",
        inv.force_state,
    )
    .var("b_w", b_w, "mm")
    .note(format!(
        "9.2(1)a: b ≥ {} mm over de gehele lengte en hoogte. Getoetst wordt b_w = {} mm, de \
         kleinste breedte van de doorsnede.",
        g(MIN_BALKBREEDTE_MM),
        g(b_w)
    ));

    match inv.dubbel_wapeningsnet {
        Some(true) => {
            basis = basis.max(MIN_BALKBREEDTE_DUBBEL_NET_MM);
            eis = eis.note(format!(
                "9.2(1)c: er is een dubbel wapeningsnet, dus de basiseis gaat naar {} mm.",
                g(MIN_BALKBREEDTE_DUBBEL_NET_MM)
            ));
        }
        Some(false) => {
            eis = eis.note("9.2(1)c: geen dubbel wapeningsnet, dus die 120 mm geldt niet.");
        }
        None => {
            eis = eis.note(
                "9.2(1)c is NIET getoetst: er is niet opgegeven of er een dubbel wapeningsnet is. \
                 Zo ja, dan is de basiseis 120 mm in plaats van 100 mm.",
            );
        }
    }
    match inv.blijvend_bekiste_oppervlakken {
        Some(n) => {
            let toeslag = BALKBREEDTE_TOESLAG_PER_BEKIST_VLAK_MM * n as f64;
            basis += toeslag;
            eis = eis
                .var("n_{bekist}", n as f64, "-")
                .note(format!(
                    "9.2(1)b: {n} blijvend bekiste oppervlakken, dus +{} mm toeslag.",
                    g(toeslag)
                ));
        }
        None => {
            eis = eis.note(
                "9.2(1)b is NIET getoetst: het aantal blijvend bekiste oppervlakken is niet \
                 opgegeven. Elk zo'n oppervlak verhoogt de minimale breedte met 5 mm.",
            );
        }
    }
    let mut vereist = basis;
    match inv.d_g_mm {
        Some(dg) if dg > 0.0 => {
            let uit_dg = BALKBREEDTE_FACTOR_D_G * dg;
            vereist = vereist.max(uit_dg);
            eis = eis.var("d_g", dg, "mm").note(format!(
                "9.2(1)e: b ≥ 2,5·d_g = 2,5·{} = {} mm.",
                g(dg),
                g(uit_dg)
            ));
        }
        _ => {
            eis = eis.note(
                "9.2(1)e is NIET getoetst: de grootste korrelafmeting d_g is niet opgegeven. De \
                 norm kent daarvoor geen standaardwaarde — d_g is een betonspecificatie — dus er \
                 wordt er ook geen aangenomen. De eis b ≥ 2,5·d_g is pas bindend bij d_g > 40 mm.",
            );
        }
    }
    eis.note(
        "9.2(1)d (voorafvervaardigde schillen: 100 mm plus de dikte van elke schil) is niet \
         getoetst; de schildikte is geen invoer van dit model.",
    )
    .var("b_{w,vereist}", vereist, "mm")
    .minimum(b_w, vereist, "mm", r"b_{w,vereist} / b_w")
}

// ---------------------------------------------------------------------------
// §8.2(2) — vrije staafafstand
// ---------------------------------------------------------------------------

/// De vrije horizontale ruimte tussen de staven van één rij, mm, en de breedte
/// waarop die is bepaald.
///
/// **AFGELEID, staat niet zo in de norm.** §8.2(2) geeft alleen de rechterkant
/// van de ongelijkheid — hoe groot de vrije ruimte moet zijn. Hoe groot zij
/// werkelijk IS, volgt uit de meetkunde van de korf:
///
/// ```text
///   binnenmaat = b(z) − 2·(c_nom + Ø_beugel)
///   a_vrij     = (binnenmaat − n·Ø_l) / (n − 1)
/// ```
///
/// `b(z)` is de breedte die op de hoogte van de rij WERKELIJK aanwezig is —
/// dezelfde regel die [`ReinforcementCage::validate`] al gebruikt, zodat de
/// twee niet uiteenlopen. Bij één staaf in de rij is er geen vrije afstand en
/// levert dit `None`.
fn vrije_afstand_mm(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    rij: &crate::section::RebarRow,
    z_mm: f64,
) -> Option<(f64, f64)> {
    if rij.is_empty() || rij.count < 2 {
        return None;
    }
    let breedte = section.width_at_mm(z_mm);
    let binnen = breedte - 2.0 * (cage.cover_mm + cage.stirrup_diameter_mm);
    Some(((binnen - rij.count as f64 * rij.diameter_mm) / (rij.count as f64 - 1.0), breedte))
}

/// §8.2(2) — de vrije afstand tussen evenwijdige staven.
///
/// ```text
///   a_vrij ≥ max(k₁·Ø ; d_g + k₂ mm ; 20 mm),  NB: k₁ = 1 en k₂ = 5
/// ```
///
/// Hiermee is te toetsen of de opgegeven staven überhaupt naast elkaar passen.
///
/// **d_g is een projectgegeven en de app heeft het niet.** De norm geeft er
/// geen standaardwaarde voor — d_g hoort bij de betonspecificatie, niet bij de
/// rekenregels — dus de aanroeper levert hem
/// ([`DetailleringInvoer::d_g_mm`]) en er wordt er géén aangenomen. Zonder d_g
/// is de eis niet sluitend te toetsen: max(Ø; 20) is dan wel bekend, maar
/// d_g + 5 kan groter zijn. De toets doet daarom alleen de uitspraak die hoe
/// dan ook geldt — hij keurt af als het al op max(Ø; 20) misgaat — en meldt
/// verder dat hij niet kan.
///
/// Alleen de HORIZONTALE afstand binnen één rij wordt getoetst; §8.2(2) geldt
/// ook verticaal tussen staaflagen, maar de korf kent één rij per zijde.
pub fn vrije_staafafstand_8_2(inv: &DetailleringInvoer) -> ResistanceCalc {
    let h = inv.section.h_mm;
    let mut eis = Eis::new(
        "8.2_vrije_staafafstand",
        "Vrije afstand tussen de staven",
        "art. 8.2(2) met de NB-waarden k₁ = 1 en k₂ = 5",
        r"a_{vrij} \ \ge\ \max\left(k_1\,\phi;\ d_g + k_2;\ 20\ \text{mm}\right)",
        inv.force_state,
    )
    .var("k_1", K1_VRIJE_STAAFAFSTAND, "-")
    .var("k_2", K2_VRIJE_STAAFAFSTAND_MM, "mm")
    .note(
        "De vrije ruimte zelf is AFGELEID uit de korf en staat niet zo in de norm: \
         a_vrij = (b(z) − 2·(c_nom + Ø_beugel) − n·Ø_l)/(n − 1), met b(z) de breedte die op de \
         hoogte van de rij werkelijk aanwezig is. §8.2(2) geeft alleen de vereiste waarde.",
    )
    .note(
        "Alleen de HORIZONTALE vrije afstand binnen één rij is getoetst. §8.2(2) geldt ook \
         verticaal tussen horizontale staaflagen; dit model kent één rij boven en één rij onder \
         en heeft dus geen tweede laag.",
    )
    .note(
        "Bij een T- of L-doorsnede wordt voor een rij in de FLENS de flensbreedte genomen en \
         daarvan tweemaal (c_nom + Ø_beugel) afgetrokken, ook al omsluit de beugel alleen het \
         lijf. Dat is dezelfde modelkeuze die de korfcontrole al maakt; ze houdt de twee gelijk.",
    );

    // De maatgevende rij: de kleinste vrije afstand bij de grootste diameter.
    // Beide rijen worden nagelopen en de scherpste (grootste vereist/aanwezig)
    // wint; bij gelijke uitkomst maakt het niet uit welke.
    // naam, a_vrij, Ø, aantal, b(z), z. De marge waarop wordt vergeleken is
    // a_vrij − max(k₁·Ø; 20 mm): de term d_g + k₂ is voor beide rijen gelijk
    // en verschuift de rangorde dus niet, ook niet als d_g onbekend is.
    type Kandidaat = (&'static str, f64, f64, u32, f64, f64);
    let marge = |a_vrij: f64, phi: f64| {
        a_vrij - (K1_VRIJE_STAAFAFSTAND * phi).max(VRIJE_STAAFAFSTAND_ONDERGRENS_MM)
    };
    let mut maatgevend: Option<Kandidaat> = None;
    for (naam, rij, z) in [
        ("onderwapening", &inv.cage.bottom, inv.cage.axis_offset_mm(&inv.cage.bottom)),
        ("bovenwapening", &inv.cage.top, h - inv.cage.axis_offset_mm(&inv.cage.top)),
    ] {
        if let Some((a_vrij, breedte)) = vrije_afstand_mm(inv.section, inv.cage, rij, z) {
            let scherper = match maatgevend {
                None => true,
                Some((_, a0, phi0, _, _, _)) => {
                    marge(a_vrij, rij.diameter_mm) < marge(a0, phi0)
                }
            };
            if scherper {
                maatgevend = Some((naam, a_vrij, rij.diameter_mm, rij.count, breedte, z));
            }
        }
    }
    let (naam, a_vrij, phi, n, breedte, z) = match maatgevend {
        Some(v) => v,
        None => {
            return eis.niet_te_toetsen(
                "geen enkele rij bevat twee of meer staven naast elkaar, dus er is geen vrije \
                 afstand tussen evenwijdige staven te bepalen",
            )
        }
    };
    eis = eis
        .var(r"a_{vrij}", a_vrij, "mm")
        .var(r"\phi_l", phi, "mm")
        .var("n", n as f64, "-")
        .var("b(z)", breedte, "mm")
        .note(format!(
            "Maatgevend is de {naam}: {n} staven Ø{} op z = {} mm, waar de doorsnede {} mm breed \
             is. Binnenmaat = {} − 2·({} + {}) = {} mm; a_vrij = ({} − {}·{})/({} − 1) = {} mm.",
            g(phi),
            g(z),
            g(breedte),
            g(breedte),
            g(inv.cage.cover_mm),
            g(inv.cage.stirrup_diameter_mm),
            g(breedte - 2.0 * (inv.cage.cover_mm + inv.cage.stirrup_diameter_mm)),
            g(breedte - 2.0 * (inv.cage.cover_mm + inv.cage.stirrup_diameter_mm)),
            n,
            g(phi),
            n,
            g(a_vrij)
        ));

    let zonder_dg = (K1_VRIJE_STAAFAFSTAND * phi).max(VRIJE_STAAFAFSTAND_ONDERGRENS_MM);
    match inv.d_g_mm {
        Some(dg) if dg > 0.0 => {
            let vereist = zonder_dg.max(dg + K2_VRIJE_STAAFAFSTAND_MM);
            eis.var("d_g", dg, "mm")
                .var(r"a_{vrij,eis}", vereist, "mm")
                .note(format!(
                    "Vereist = max(1·{}; {} + 5; 20) = {} mm.",
                    g(phi),
                    g(dg),
                    g(vereist)
                ))
                .minimum(a_vrij, vereist, "mm", r"a_{vrij,eis} / a_{vrij}")
        }
        _ => {
            let eis = eis.note(format!(
                "De grootste korrelafmeting d_g is niet opgegeven. De norm kent er geen \
                 standaardwaarde voor — d_g hoort bij de betonspecificatie — dus er wordt er geen \
                 aangenomen. Zonder d_g staat alleen vast dat de eis ten minste \
                 max(1·Ø; 20 mm) = {} mm is; de term d_g + 5 mm kan hoger uitvallen.",
                g(zonder_dg)
            ));
            if a_vrij < zonder_dg - 1e-9 {
                // Dit deel van de eis staat vast, dus de afkeuring staat vast:
                // een grotere d_g maakt het alleen erger.
                eis.note(
                    "De vrije afstand haalt zelfs die ondergrens niet, dus de eis is hoe dan ook \
                     niet gehaald — een grotere d_g maakt het alleen scherper.",
                )
                .minimum(a_vrij, zonder_dg, "mm", r"a_{vrij,eis} / a_{vrij}")
            } else {
                eis.niet_te_toetsen(format!(
                    "a_vrij = {} mm haalt de bekende ondergrens van {} mm wel, maar zonder d_g is \
                     niet vast te stellen of hij ook d_g + 5 mm haalt. De toets doet daarom geen \
                     uitspraak; vul d_g in om hem te laten lopen.",
                    g(a_vrij),
                    g(zonder_dg)
                ))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Alles bij elkaar
// ---------------------------------------------------------------------------

/// Alle detailleringstoetsen van §9.2.1, §9.2.2 en §8.2, in de volgorde waarin
/// het rapport ze toont: eerst de langswapening, dan de dwarskrachtwapening,
/// dan de meetkunde van de korf.
pub fn detailleringstoetsen(inv: &DetailleringInvoer) -> Vec<ResistanceCalc> {
    vec![
        as_min_9_2_1_1(inv),
        as_max_9_2_1_1(inv),
        min_diameter_langsstaaf_9_2_1_1(inv),
        rho_w_min_9_2_2(inv),
        s_l_max_9_2_2(inv),
        s_t_max_9_2_2(inv),
        min_diameter_beugel_9_2_2(inv),
        min_balkbreedte_9_2(inv),
        vrije_staafafstand_8_2(inv),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::factors::DesignSituation;
    use crate::section::RebarRow;
    use crate::stress_strain::SteelBranch;
    use approx::assert_relative_eq;
    use mechanics::InternalForces;

    fn materiaal() -> DesignMaterial {
        DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        )
    }

    fn korf() -> ReinforcementCage {
        ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
            stirrup_spacing_mm: Some(150.0),
            stirrup_legs: Some(2),
            ..ReinforcementCage::default()
        }
    }

    fn snap(n: f64, m: f64, v: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 1,
            position_mm: 2500.0,
            forces: InternalForces { n_ed: n, my_ed: m, vz_ed: v, ..Default::default() },
        }
    }

    struct Opzet {
        section: ConcreteSection,
        cage: ReinforcementCage,
        mat: DesignMaterial,
    }

    fn opzet() -> Opzet {
        Opzet { section: ConcreteSection::new(300.0, 500.0), cage: korf(), mat: materiaal() }
    }

    fn invoer(o: &Opzet) -> DetailleringInvoer<'_> {
        DetailleringInvoer {
            section: &o.section,
            cage: &o.cage,
            mat: &o.mat,
            // C30/37, tabel 3.1: f_ctm = 2,9 N/mm².
            f_ctm_mpa: 2.9,
            force_state: snap(0.0, 100.0, 80.0),
            d_g_mm: None,
            dwarskrachtwapening_vereist: None,
            v_ed_kn: None,
            v_rd_max_kn: None,
            blijvend_bekiste_oppervlakken: None,
            dubbel_wapeningsnet: None,
        }
    }

    fn uc_van(c: &ResistanceCalc) -> f64 {
        c.uc.as_ref().expect("deze toets hoort een unity check te hebben").uc
    }

    // -----------------------------------------------------------------
    // ρ_w,min — §9.2.2(5) met de NB-waarde bij (9.5N)
    // -----------------------------------------------------------------

    /// HANDBEREKENING. C30/37, B500B, beugel Ø8 tweebenig h.o.h. 150 mm in een
    /// lijf van 300 mm.
    ///
    /// A_sw = 2 · π/4 · 8² = 2 · 50,265482 = 100,530965 mm²
    /// ρ_w  = 100,530965 / (150 · 300 · sin 90°) = 100,530965 / 45 000
    ///      = 0,00223402
    /// ρ_w,min = 0,08 · √30 / 500 = 0,08 · 5,4772256 / 500 = 0,43817805/500
    ///      = 0,00087636
    /// UC = 0,00087636 / 0,00223402 = 0,392274
    #[test]
    fn rho_w_min_met_de_hand_nagerekend() {
        let o = opzet();
        let c = rho_w_min_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::Ok);
        assert_relative_eq!(c.value, 0.000876356, max_relative = 1e-6);
        let uc = c.uc.as_ref().unwrap();
        assert_relative_eq!(uc.rd, 0.00223402, max_relative = 1e-6);
        assert_relative_eq!(uc.uc, 0.392274, max_relative = 1e-5);
        // De lijfbreedte, niet de flensbreedte.
        assert!(c.variables.iter().any(|v| v.symbol == "b_w" && v.value == 300.0));
    }

    /// Bij een T-ligger telt b_w (het lijf) en niet de flensbreedte. Met een
    /// lijf van 200 mm in plaats van 300 mm:
    /// ρ_w = 100,530965/(150·200) = 0,00335103, dus 1,5 keer zo groot.
    #[test]
    fn rho_w_gebruikt_de_lijfbreedte_van_een_t() {
        let t = ConcreteSection::tee(600.0, 120.0, 200.0, 500.0).unwrap();
        let o = Opzet { section: t, cage: korf(), mat: materiaal() };
        let c = rho_w_min_9_2_2(&invoer(&o));
        assert_relative_eq!(c.uc.as_ref().unwrap().rd, 0.00335103, max_relative = 1e-6);
    }

    /// Zonder beugelafstand kan de toets niets: NotApplicable met een reden,
    /// en met name GEEN stilzwijgende "voldoet".
    #[test]
    fn rho_w_min_zonder_beugelgegevens_zegt_dat_hij_niet_kan() {
        let mut o = opzet();
        o.cage.stirrup_spacing_mm = None;
        let c = rho_w_min_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotApplicable);
        assert!(c.uc.is_none());
        assert!(c.notes[0].contains("hart-op-hartafstand"), "reden ontbreekt: {:?}", c.notes);
    }

    /// Een te ruime beugel valt af. Ø6 tweebenig h.o.h. 400 mm in 300 mm lijf:
    /// A_sw = 2 · π/4 · 36 = 56,548668 mm²
    /// ρ_w = 56,548668/(400·300) = 56,548668/120 000 = 0,000471239
    /// UC = 0,00087636/0,000471239 = 1,85971 > 1
    #[test]
    fn te_ruime_beugel_valt_af_op_rho_w_min() {
        let mut o = opzet();
        o.cage.stirrup_diameter_mm = 6.0;
        o.cage.stirrup_spacing_mm = Some(400.0);
        let c = rho_w_min_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotOk);
        assert_relative_eq!(uc_van(&c), 1.85971, max_relative = 1e-4);
    }

    // -----------------------------------------------------------------
    // s_l,max — §9.2.2(6), NB-vervanging
    // -----------------------------------------------------------------

    /// HANDBEREKENING. d = 500 − (30 + 8 + 16/2) = 454 mm.
    /// α = 90° → cot α = 0 → 0,75·d·(1 + 0) = 340,5 mm.
    /// NB-plafond 300 mm, dus in de tak "wel dwarskrachtwapening vereist" is
    /// s_l,max = min(340,5; 300) = 300 mm en UC = 150/300 = 0,5.
    /// In de tak "niet vereist" is s_l,max = 300 mm — hier toevallig gelijk.
    #[test]
    fn s_l_max_plafond_van_300_is_bindend() {
        let o = opzet();
        let mut inv = invoer(&o);
        inv.dwarskrachtwapening_vereist = Some(true);
        let c = s_l_max_9_2_2(&inv);
        assert_eq!(c.status, CheckStatus::Ok);
        assert_relative_eq!(c.value, 300.0);
        assert_relative_eq!(uc_van(&c), 0.5, max_relative = 1e-12);
        // 0,75·d = 340,5 mm staat er als tussenwaarde bij.
        let f = c.variables.iter().find(|v| v.symbol.contains("0{,}75")).unwrap();
        assert_relative_eq!(f.value, 340.5, max_relative = 1e-12);
    }

    /// Bij een lage balk is 0,75·d wél maatgevend. h = 300, Ø16 onder:
    /// d = 300 − (30 + 8 + 8) = 254 mm; 0,75·254 = 190,5 mm < 300 mm.
    /// Met s = 150 mm: UC = 150/190,5 = 0,787402.
    #[test]
    fn s_l_max_bij_lage_balk_is_0_75_d() {
        let o = Opzet {
            section: ConcreteSection::new(300.0, 300.0),
            cage: korf(),
            mat: materiaal(),
        };
        let mut inv = invoer(&o);
        inv.dwarskrachtwapening_vereist = Some(true);
        let c = s_l_max_9_2_2(&inv);
        assert_relative_eq!(c.value, 190.5, max_relative = 1e-12);
        assert_relative_eq!(uc_van(&c), 150.0 / 190.5, max_relative = 1e-9);
    }

    /// Onbekende tak: s = 150 mm ≤ de strengste tak (300 mm) → voldoet hoe dan
    /// ook. s = 320 mm > de ruimste tak (300 mm) → voldoet in geen geval.
    /// Bij een lage balk ligt s = 250 mm tussen 190,5 en 300 → onbeslist.
    #[test]
    fn s_l_max_zonder_tak_spreekt_alleen_uit_wat_vaststaat() {
        let o = opzet();
        let c = s_l_max_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::Ok, "150 mm ligt binnen beide takken");

        let mut o2 = opzet();
        o2.cage.stirrup_spacing_mm = Some(320.0);
        let c2 = s_l_max_9_2_2(&invoer(&o2));
        assert_eq!(c2.status, CheckStatus::NotOk, "320 mm valt buiten beide takken");

        let mut o3 = Opzet {
            section: ConcreteSection::new(300.0, 300.0),
            cage: korf(),
            mat: materiaal(),
        };
        o3.cage.stirrup_spacing_mm = Some(250.0);
        let c3 = s_l_max_9_2_2(&invoer(&o3));
        assert_eq!(c3.status, CheckStatus::NotApplicable, "250 mm ligt tussen 190,5 en 300");
        assert!(c3.notes[0].contains("V_Ed > V_Rd,c") || c3.notes[0].contains("dwarskrachtwapening"));
    }

    // -----------------------------------------------------------------
    // s_t,max — §9.2.2(8), NB-vervanging
    // -----------------------------------------------------------------

    /// HANDBEREKENING. Tweebenige beugel, dus s_t = b_w − 2·c_nom − Ø_beugel
    /// = 300 − 60 − 8 = 232 mm. d = 454 mm → 0,75·d = 340,5 mm; met het
    /// NB-plafond van 500 mm is de strengste tak 340,5 mm.
    /// V_Ed = 80 kN, V_Rd,max = 400 kN → 0,5·V_Rd,max = 200 kN, dus de RUIME
    /// tak: s_t,max = 500 mm en UC = 232/500 = 0,464.
    #[test]
    fn s_t_max_ruime_tak_bij_lage_dwarskracht() {
        let o = opzet();
        let mut inv = invoer(&o);
        inv.v_ed_kn = Some(80.0);
        inv.v_rd_max_kn = Some(400.0);
        let c = s_t_max_9_2_2(&inv);
        assert_eq!(c.status, CheckStatus::Ok);
        assert_relative_eq!(c.value, 500.0);
        assert_relative_eq!(uc_van(&c), 0.464, max_relative = 1e-12);
        assert!(c.variables.iter().any(|v| v.symbol == "s_t" && v.value == 232.0));
    }

    /// Boven 0,5·V_Rd,max geldt 0,75·d ≤ 500 mm. V_Ed = 250 kN > 200 kN:
    /// s_t,max = min(340,5; 500) = 340,5 mm, UC = 232/340,5 = 0,681351.
    #[test]
    fn s_t_max_scherpe_tak_bij_hoge_dwarskracht() {
        let o = opzet();
        let mut inv = invoer(&o);
        inv.v_ed_kn = Some(250.0);
        inv.v_rd_max_kn = Some(400.0);
        let c = s_t_max_9_2_2(&inv);
        assert_relative_eq!(c.value, 340.5, max_relative = 1e-12);
        assert_relative_eq!(uc_van(&c), 232.0 / 340.5, max_relative = 1e-9);
    }

    /// De NB-grens is 500 mm en NIET de 600 mm van de aanbevolen (9.8N). Een
    /// s_t van 550 mm zou met de EN-waarde slagen en moet hier afvallen. Om
    /// zo'n s_t te kunnen opgeven is een breed lijf nodig: b_w = 700 mm geeft
    /// een afgeleide s_t van 700 − 60 − 8 = 632 mm, dus 550 mm past.
    #[test]
    fn s_t_max_gebruikt_500_mm_en_niet_de_600_van_de_en_tekst() {
        let mut o = Opzet {
            section: ConcreteSection::new(700.0, 500.0),
            cage: korf(),
            mat: materiaal(),
        };
        o.cage.stirrup_leg_spacing_mm = Some(550.0);
        let mut inv = invoer(&o);
        inv.v_ed_kn = Some(10.0);
        inv.v_rd_max_kn = Some(400.0);
        let c = s_t_max_9_2_2(&inv);
        assert_eq!(c.status, CheckStatus::NotOk, "550 mm > 500 mm (NB), maar < 600 mm (EN)");
        assert_relative_eq!(uc_van(&c), 1.1, max_relative = 1e-12);
    }

    /// Zonder V_Ed/V_Rd,max: 232 mm ≤ de strengste tak (340,5 mm) → voldoet
    /// hoe dan ook, ook al is de tak onbekend.
    #[test]
    fn s_t_max_zonder_dwarskracht_spreekt_uit_wat_vaststaat() {
        let o = opzet();
        let c = s_t_max_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::Ok);
        assert_relative_eq!(c.value, 340.5, max_relative = 1e-12);
    }

    /// Vier benen: s_t is niet af te leiden en niet opgegeven → NotApplicable.
    #[test]
    fn s_t_max_zonder_afleidbare_st_zegt_dat_hij_niet_kan() {
        let mut o = opzet();
        o.cage.stirrup_legs = Some(4);
        let c = s_t_max_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotApplicable);
        assert!(c.notes[0].contains("TWEEbenige") || c.notes[0].contains("niet af te leiden"));
    }

    // -----------------------------------------------------------------
    // De twee minimumdiameters van de NB
    // -----------------------------------------------------------------

    #[test]
    fn minimumdiameters_van_de_nationale_bijlage() {
        let o = opzet();
        // Ø8 ≥ 5 mm: UC = 5/8 = 0,625.
        let c = min_diameter_beugel_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::Ok);
        assert_relative_eq!(uc_van(&c), 0.625, max_relative = 1e-12);
        // Kleinste langsstaaf Ø12 ≥ 6 mm: UC = 6/12 = 0,5.
        let c = min_diameter_langsstaaf_9_2_1_1(&invoer(&o));
        assert_relative_eq!(uc_van(&c), 0.5, max_relative = 1e-12);

        // Ø4 beugel valt af: UC = 5/4 = 1,25.
        let mut o2 = opzet();
        o2.cage.stirrup_diameter_mm = 4.0;
        let c = min_diameter_beugel_9_2_2(&invoer(&o2));
        assert_eq!(c.status, CheckStatus::NotOk);
        assert_relative_eq!(uc_van(&c), 1.25, max_relative = 1e-12);

        // Ø5 langsstaaf valt af: UC = 6/5 = 1,2.
        let mut o3 = opzet();
        o3.cage.top = RebarRow { count: 2, diameter_mm: 5.0 };
        let c = min_diameter_langsstaaf_9_2_1_1(&invoer(&o3));
        assert_eq!(c.status, CheckStatus::NotOk);
        assert_relative_eq!(uc_van(&c), 1.2, max_relative = 1e-12);
    }

    /// Geen beugel = geen diameter om te toetsen; dat moet gezegd worden en
    /// niet als "voldoet" wegglippen.
    #[test]
    fn geen_beugel_levert_geen_groene_diametertoets() {
        let mut o = opzet();
        o.cage.stirrup_diameter_mm = 0.0;
        o.cage.stirrup_spacing_mm = None;
        o.cage.stirrup_legs = None;
        let c = min_diameter_beugel_9_2_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotApplicable);
        assert!(c.notes[0].contains("6.2.1(4)"), "de 6.2.1(4)-waarschuwing ontbreekt");
    }

    // -----------------------------------------------------------------
    // A_s,max — §9.2.1.1(3)
    // -----------------------------------------------------------------

    /// HANDBEREKENING. A_c = 300 · 500 = 150 000 mm²;
    /// A_s,max = 0,04 · 150 000 = 6 000 mm².
    /// Onder 3Ø16 = 3 · π · 64 = 603,18579 mm² → UC = 603,18579/6000
    /// = 0,10053.
    #[test]
    fn as_max_met_de_hand_nagerekend() {
        let o = opzet();
        let c = as_max_9_2_1_1(&invoer(&o));
        assert_relative_eq!(c.value, 6000.0, max_relative = 1e-12);
        assert_relative_eq!(uc_van(&c), 0.1005310, max_relative = 1e-5);
        assert_eq!(c.status, CheckStatus::Ok);
    }

    /// 20Ø25 onder = 20 · π · 156,25 = 9817,477 mm² > 6000 mm² → afkeuren.
    /// UC = 9817,477/6000 = 1,636246.
    #[test]
    fn te_veel_wapening_valt_af_op_as_max() {
        let mut o = opzet();
        o.cage.bottom = RebarRow { count: 20, diameter_mm: 25.0 };
        let c = as_max_9_2_1_1(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotOk);
        assert_relative_eq!(uc_van(&c), 1.636246, max_relative = 1e-5);
    }

    // -----------------------------------------------------------------
    // Minimale balkbreedte — NB §9.2(1)
    // -----------------------------------------------------------------

    #[test]
    fn minimale_balkbreedte_met_en_zonder_de_extra_eisen() {
        let o = opzet();
        // Kaal: 300 mm ≥ 100 mm → UC = 100/300 = 0,333333.
        let c = min_balkbreedte_9_2(&invoer(&o));
        assert_relative_eq!(uc_van(&c), 1.0 / 3.0, max_relative = 1e-9);
        assert_eq!(c.status, CheckStatus::Ok);

        // Dubbel net + 2 bekiste vlakken + d_g = 63 mm:
        // basis = max(100; 120) + 2·5 = 130 mm; 2,5·63 = 157,5 mm → 157,5 mm.
        // UC = 157,5/300 = 0,525.
        let mut inv = invoer(&o);
        inv.dubbel_wapeningsnet = Some(true);
        inv.blijvend_bekiste_oppervlakken = Some(2);
        inv.d_g_mm = Some(63.0);
        let c = min_balkbreedte_9_2(&inv);
        assert_relative_eq!(c.value, 157.5, max_relative = 1e-12);
        assert_relative_eq!(uc_van(&c), 0.525, max_relative = 1e-12);

        // Een lijf van 90 mm valt al op 9.2(1)a af: UC = 100/90 = 1,111111.
        let smal = ConcreteSection::tee(600.0, 120.0, 90.0, 500.0).unwrap();
        let o2 = Opzet { section: smal, cage: korf(), mat: materiaal() };
        let c = min_balkbreedte_9_2(&invoer(&o2));
        assert_eq!(c.status, CheckStatus::NotOk);
        assert_relative_eq!(uc_van(&c), 100.0 / 90.0, max_relative = 1e-9);
    }

    /// Ontbrekende gegevens worden benoemd; de toets doet er niet alsof.
    #[test]
    fn balkbreedte_benoemt_wat_hij_niet_getoetst_heeft() {
        let o = opzet();
        let c = min_balkbreedte_9_2(&invoer(&o));
        let tekst = c.notes.join(" ");
        assert!(tekst.contains("9.2(1)b is NIET getoetst"));
        assert!(tekst.contains("9.2(1)c is NIET getoetst"));
        assert!(tekst.contains("9.2(1)e is NIET getoetst"));
    }

    // -----------------------------------------------------------------
    // Vrije staafafstand — §8.2(2)
    // -----------------------------------------------------------------

    /// HANDBEREKENING. 3Ø16 onder in b = 300 mm, dekking 30, beugel Ø8:
    /// binnenmaat = 300 − 2·(30 + 8) = 224 mm
    /// a_vrij = (224 − 3·16)/(3 − 1) = 176/2 = 88 mm
    /// Met d_g = 32 mm: vereist = max(1·16; 32 + 5; 20) = 37 mm.
    /// UC = 37/88 = 0,420455.
    #[test]
    fn vrije_staafafstand_met_de_hand_nagerekend() {
        let o = opzet();
        let mut inv = invoer(&o);
        inv.d_g_mm = Some(32.0);
        let c = vrije_staafafstand_8_2(&inv);
        assert_eq!(c.status, CheckStatus::Ok);
        assert_relative_eq!(c.value, 37.0, max_relative = 1e-12);
        let uc = c.uc.as_ref().unwrap();
        assert_relative_eq!(uc.rd, 88.0, max_relative = 1e-12);
        assert_relative_eq!(uc.uc, 37.0 / 88.0, max_relative = 1e-9);
    }

    /// 6Ø20 onder in b = 300: binnenmaat 224 mm, 6·20 = 120 mm staal,
    /// a_vrij = (224 − 120)/5 = 104/5 = 20,8 mm.
    /// Zonder d_g is de bekende ondergrens max(20; 20) = 20 mm; 20,8 > 20, dus
    /// onbeslist — precies het geval waarin de toets NIET groen mag worden.
    #[test]
    fn zonder_korrelafmeting_geen_groene_staafafstand() {
        let mut o = opzet();
        o.cage.bottom = RebarRow { count: 6, diameter_mm: 20.0 };
        let c = vrije_staafafstand_8_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotApplicable);
        assert!(c.uc.is_none());
        assert!(c.notes[0].contains("d_g"), "reden ontbreekt: {:?}", c.notes);

        // Met d_g = 32 mm is de eis 37 mm en valt hij hard af:
        // UC = 37/20,8 = 1,778846.
        let mut inv = invoer(&o);
        inv.d_g_mm = Some(32.0);
        let c = vrije_staafafstand_8_2(&inv);
        assert_eq!(c.status, CheckStatus::NotOk);
        assert_relative_eq!(uc_van(&c), 37.0 / 20.8, max_relative = 1e-9);
    }

    /// Staat het al vast zonder d_g, dan wordt er wél afgekeurd. 7Ø25 onder in
    /// b = 400 mm: binnenmaat = 400 − 76 = 324 mm; 7·25 = 175 mm;
    /// a_vrij = (324 − 175)/6 = 149/6 = 24,8333 mm < max(25; 20) = 25 mm.
    /// UC = 25/24,8333 = 1,006711.
    #[test]
    fn zonder_korrelafmeting_toch_afkeuren_als_dat_al_vaststaat() {
        let mut o = Opzet {
            section: ConcreteSection::new(400.0, 500.0),
            cage: korf(),
            mat: materiaal(),
        };
        o.cage.bottom = RebarRow { count: 7, diameter_mm: 25.0 };
        let c = vrije_staafafstand_8_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotOk);
        assert_relative_eq!(c.uc.as_ref().unwrap().rd, 149.0 / 6.0, max_relative = 1e-9);
        assert_relative_eq!(uc_van(&c), 25.0 / (149.0 / 6.0), max_relative = 1e-9);
    }

    /// Eén staaf per rij: geen vrije afstand te bepalen.
    #[test]
    fn een_staaf_per_rij_levert_geen_staafafstandstoets() {
        let mut o = opzet();
        o.cage.bottom = RebarRow { count: 1, diameter_mm: 16.0 };
        o.cage.top = RebarRow { count: 0, diameter_mm: 12.0 };
        let c = vrije_staafafstand_8_2(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotApplicable);
    }

    // -----------------------------------------------------------------
    // A_s,min — NB bij §9.2.1.1(1)
    // -----------------------------------------------------------------

    /// HANDBEREKENING van M_E,min bij zuivere buiging.
    /// W = b·h²/6 = 300 · 500²/6 = 300 · 250 000/6 = 12 500 000 mm³
    /// M_E,min = f_ctm·W = 2,9 · 12 500 000 = 36 250 000 Nmm = 36,25 kNm
    #[test]
    fn m_e_min_bij_zuivere_buiging() {
        let s = ConcreteSection::new(300.0, 500.0);
        let mb = minimum_belasting(&s, 2.9, 100.0, 0.0).unwrap();
        assert_relative_eq!(mb.w_mm3, 12_500_000.0, max_relative = 1e-12);
        assert_relative_eq!(mb.m_e_min_knm, 36.25, max_relative = 1e-12);
        assert_relative_eq!(mb.n_e_min_kn, 0.0);
        assert!(mb.eta.is_none());
    }

    /// HANDBEREKENING met trekkracht. M_Ed = 100 kNm, N_Ed = +200 kN (trek).
    /// e = |100/200|·10³ = 500 mm
    /// A_c = 150 000 mm², W = 12 500 000 mm³
    /// η = 500 · 150 000 / 12 500 000 = 75 000 000/12 500 000 = 6
    /// M_E,min = f_ctm·W·η/(η+1) = 2,9 · 12 500 000 · 6/7
    ///         = 36 250 000 · 0,857142857 = 31 071 428,6 Nmm = 31,0714286 kNm
    /// N_E,min = f_ctm·A_c/(η+1) = 2,9 · 150 000/7 = 435 000/7 = 62 142,857 N
    ///         = 62,142857 kN, trek dus positief.
    #[test]
    fn m_e_min_en_n_e_min_bij_trekkracht() {
        let s = ConcreteSection::new(300.0, 500.0);
        let mb = minimum_belasting(&s, 2.9, 100.0, 200.0).unwrap();
        assert_relative_eq!(mb.e_mm.unwrap(), 500.0, max_relative = 1e-12);
        assert_relative_eq!(mb.eta.unwrap(), 6.0, max_relative = 1e-12);
        assert_relative_eq!(mb.m_e_min_knm, 31.0714286, max_relative = 1e-7);
        assert_relative_eq!(mb.n_e_min_kn, 62.142857, max_relative = 1e-7);
    }

    /// HANDBEREKENING met drukkracht. M_Ed = 100 kNm, N_Ed = −200 kN (druk).
    /// e = 500 mm, η = 6 (zelfde als hierboven; e is absoluut).
    /// M_E,min = 2,9 · 12 500 000 · 6/5 = 36 250 000 · 1,2 = 43 500 000 Nmm
    ///         = 43,5 kNm
    /// N_E,min = 2,9 · 150 000/5 = 87 000 N = 87 kN DRUK, dus −87 kN in de
    /// trek-positieve afspraak van de kern.
    #[test]
    fn m_e_min_en_n_e_min_bij_drukkracht() {
        let s = ConcreteSection::new(300.0, 500.0);
        let mb = minimum_belasting(&s, 2.9, 100.0, -200.0).unwrap();
        assert_relative_eq!(mb.eta.unwrap(), 6.0, max_relative = 1e-12);
        assert_relative_eq!(mb.m_e_min_knm, 43.5, max_relative = 1e-9);
        assert_relative_eq!(mb.n_e_min_kn, -87.0, max_relative = 1e-9);
    }

    /// Binnen de kern (η ≤ 1) bij druk is de NB-formule niet te evalueren.
    /// M_Ed = 10 kNm, N_Ed = −500 kN → e = 20 mm, η = 20·150 000/12 500 000
    /// = 0,24 ≤ 1.
    #[test]
    fn binnen_de_kern_levert_geen_verzonnen_m_e_min() {
        let s = ConcreteSection::new(300.0, 500.0);
        let err = minimum_belasting(&s, 2.9, 10.0, -500.0).unwrap_err();
        assert!(err.contains("kern"), "{err}");
    }

    /// HANDBEREKENING van de omkering van 6.1 — de spil onder A_s,min1 en
    /// A_s,min2.
    ///
    /// Doorsnede 300 × 500, C30/37 (f_cd = 1,0·30/1,5 = 20 N/mm², λ = 0,8,
    /// η = 1,0), B500B (f_yd = 500/1,15 = 434,782609 N/mm²), 3Ø16 onder met
    /// d = 454 mm, GEEN bovenwapening, N = 0, gevraagd M = 36,25 kNm.
    ///
    /// Met één vloeiende trekstaaf geldt M = T·(d − λx/2) met T = A_s·f_yd en
    /// x = T/(η·f_cd·b·λ) = T/(1,0·20·300·0,8) = T/4800.
    /// Dus M = T·d − T²·λ/(2·4800) = T·454 − T²·0,8/9600
    ///       = 454·T − T²/12 000.
    /// Met M = 36 250 000 Nmm:
    ///   T²/12 000 − 454·T + 36 250 000 = 0
    ///   T² − 5 448 000·T + 435 000 000 000 = 0
    ///   T = [5 448 000 − √(5 448 000² − 4·435 000 000 000)]/2
    ///     = [5 448 000 − √(29 680 704 000 000 − 1 740 000 000 000)]/2
    ///     = [5 448 000 − √27 940 704 000 000]/2
    ///     = [5 448 000 − 5 285 897,65]/2 = 162 102,35/2 = 81 051,17 N
    ///   A_s = 81 051,17/434,782609 = 186,42 mm²
    ///
    /// De code komt daar via bisectie op uit; de handberekening staat er los
    /// van en gebruikt de code niet.
    #[test]
    fn omkering_van_6_1_met_de_hand_nagerekend() {
        let mut cage = korf();
        cage.top = RebarRow { count: 0, diameter_mm: 12.0 };
        let s = ConcreteSection::new(300.0, 500.0);
        let a = benodigde_trekwapening_mm2(&s, &cage, &materiaal(), 36.25, 0.0).unwrap();
        assert_relative_eq!(a, 186.42, max_relative = 2e-3);
    }

    /// De volledige A_s,min-keten, C30/37, 300 × 500, korf met 3Ø16 onder
    /// (603,186 mm²) en 2Ø12 boven (226,195 mm²), M_Ed = 100 kNm, N_Ed = 0.
    ///
    /// **A_s,min1** hoort bij M_E,min = f_ctm·W = 36,25 kNm. Nu doet de
    /// bovenwapening wél mee — bij zo'n klein moment ligt de neutrale lijn op
    /// ~31 mm en zitten de bovenstaven op 44 mm dus in de TREKzone, waar ze
    /// meehelpen. Handcontrole bij A_s1 = 177,2 mm² en x = 30,55 mm:
    ///   F_c   = η·f_cd·b·λ·x = 1,0·20·300·0,8·30,55 = 146 640 N
    ///   ε_s2  = 0,0035·(1 − 44/30,55) = −0,0015407 → elastisch,
    ///           σ_s2 = −308,1 N/mm², F_s2 = 226,195·(−308,1) = −69 690 N
    ///   ε_s1  = 0,0035·(1 − 454/30,55) = −0,0485 → vloeit,
    ///           F_s1 = −177,2·434,7826 = −77 043 N
    ///   evenwicht: 146 640 − 69 690 − 77 043 = −93 N ≈ 0 ✓
    ///   M om het midden = 146 640·(250 − 12,22) − 69 690·(250 − 44)
    ///                     − 77 043·(250 − 454)
    ///                   = 34 863 900 − 14 356 100 + 15 716 800
    ///                   = 36 224 600 Nmm = 36,22 kNm ≈ 36,25 kNm ✓
    ///
    /// **A_s,min2** = 1,25 × de UGT-behoefte voor 100 kNm. Handcontrole bij
    /// A_s1 = 529,21 mm² en x = 46,30 mm:
    ///   F_c   = 4800·46,30 = 222 240 N
    ///   ε_s2  = 0,0035·(1 − 44/46,30) = +0,00017387 → elastisch,
    ///           σ_s2 = +34,77 N/mm², F_s2 = +7 865 N (druk)
    ///   F_s1  = −529,21·434,7826 = −230 091 N (vloeit)
    ///   evenwicht: 222 240 + 7 865 − 230 091 = +14 N ≈ 0 ✓
    ///   M = 222 240·(250 − 18,52) + 7 865·206 + 230 091·204
    ///     = 51 444 000 + 1 620 190 + 46 938 600 = 100,0·10⁶ Nmm ✓
    ///   A_s,min2 = 1,25 · 529,21 = 661,5 mm²
    ///
    /// A_s,min = min(177,2; 661,5) = 177,2 mm²; 603,186 mm² haalt dat ruim.
    /// UC = 177,2/603,186 = 0,2938.
    #[test]
    fn as_min_neemt_de_kleinste_van_de_twee_kandidaten() {
        let o = opzet();
        let c = as_min_9_2_1_1(&invoer(&o));
        assert_eq!(c.status, CheckStatus::Ok);
        let a1 = c.variables.iter().find(|v| v.symbol.contains(r"\min 1")).unwrap().value;
        let a2 = c.variables.iter().find(|v| v.symbol.contains(r"\min 2")).unwrap().value;
        assert_relative_eq!(a1, 177.2, max_relative = 2e-3);
        assert_relative_eq!(a2, 661.5, max_relative = 2e-3);
        // De MINIMUM-lezing: A_s,min is de kleinste, dus 177 en niet 661.
        assert_relative_eq!(c.value, a1.min(a2), max_relative = 1e-12);
        assert_relative_eq!(uc_van(&c), 177.2 / 603.18579, max_relative = 2e-3);
        assert!(c.notes.iter().any(|n| n.contains("KLEINSTE")));
    }

    /// Zonder bovenwapening komt A_s,min1 exact op de gesloten vorm uit die in
    /// `omkering_van_6_1_met_de_hand_nagerekend` met de hand is opgelost:
    /// 186,42 mm² in plaats van 177,2 mm². Het verschil zit hem er niet in dat
    /// de code iets anders doet, maar dat de bovenstaven bij dit kleine moment
    /// ónder de neutrale lijn liggen en dus meetrekken.
    #[test]
    fn as_min1_zonder_bovenwapening_volgt_de_gesloten_vorm() {
        let mut o = opzet();
        o.cage.top = RebarRow { count: 0, diameter_mm: 12.0 };
        let c = as_min_9_2_1_1(&invoer(&o));
        let a1 = c.variables.iter().find(|v| v.symbol.contains(r"\min 1")).unwrap().value;
        assert_relative_eq!(a1, 186.42, max_relative = 2e-3);
    }

    /// (9.1N) mag nergens opduiken: 0,26·(f_ctm/f_yk)·b_t·d zou hier
    /// 0,26·(2,9/500)·300·454 = 205,3 mm² geven, dicht bij A_s,min1. De toets
    /// moet uitdrukkelijk vermelden dat die vergelijking in NL niet geldt.
    #[test]
    fn de_doorgehaalde_9_1n_wordt_niet_gebruikt() {
        let o = opzet();
        let c = as_min_9_2_1_1(&invoer(&o));
        assert!(c
            .notes
            .iter()
            .any(|n| n.contains("(9.1N)") && n.to_lowercase().contains("doorgehaald")));
        assert!(c.notes.iter().any(|n| n.contains("NIET van toepassing")));
    }

    /// Te weinig trekwapening valt af. 2Ø6 onder = 2·π·9 = 56,549 mm², minder
    /// dan A_s,min1 ≈ 187 mm² en dan A_s,min2.
    #[test]
    fn te_weinig_trekwapening_valt_af_op_as_min() {
        let mut o = opzet();
        o.cage.bottom = RebarRow { count: 2, diameter_mm: 6.0 };
        let c = as_min_9_2_1_1(&invoer(&o));
        assert_eq!(c.status, CheckStatus::NotOk);
        assert!(uc_van(&c) > 1.0);
    }

    /// Kan één van beide kandidaten niet worden bepaald en haalt de wapening
    /// de andere niet, dan doet de toets géén uitspraak — want A_s,min is het
    /// MINIMUM en de onbekende kandidaat kan lager liggen.
    #[test]
    fn onbepaalbare_kandidaat_levert_geen_uitspraak_in_plaats_van_groen() {
        // M_Ed zo groot dat zelfs A_s,max = 0,04·A_c hem niet opneemt: dan is
        // A_s,min2 niet te bepalen. A_s,min1 (uit 36,25 kNm) wel, en 2Ø6
        // haalt die niet.
        let mut o = opzet();
        o.cage.bottom = RebarRow { count: 2, diameter_mm: 6.0 };
        let mut inv = invoer(&o);
        inv.force_state = snap(0.0, 5000.0, 0.0);
        let c = as_min_9_2_1_1(&inv);
        assert_eq!(c.status, CheckStatus::NotApplicable);
        assert!(c.notes[0].contains("MINIMUM"), "{:?}", c.notes);
    }

    // -----------------------------------------------------------------
    // De hele reeks
    // -----------------------------------------------------------------

    /// Alle negen toetsen komen terug, elk met een eigen id en een eigen
    /// artikelverwijzing, en geen enkele met een leeg artikel.
    #[test]
    fn alle_negen_toetsen_hebben_een_eigen_id_en_artikel() {
        let o = opzet();
        let alle = detailleringstoetsen(&invoer(&o));
        assert_eq!(alle.len(), 9);
        let mut ids: Vec<&str> = alle.iter().map(|c| c.id.as_str()).collect();
        ids.sort_unstable();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n, "dubbele id's: {ids:?}");
        for c in &alle {
            assert!(!c.article.is_empty(), "{} heeft geen artikel", c.id);
            assert!(!c.formula_latex.is_empty(), "{} heeft geen formule", c.id);
            assert!(!c.title.is_empty(), "{} heeft geen titel", c.id);
        }
    }

    /// Een toets die niet kan, heeft GEEN unity check en staat op
    /// NotApplicable — nooit op Ok met uc = 0. Dat is de kern van de zaak:
    /// groen omdat je niets wist is gevaarlijker dan geen toets.
    #[test]
    fn een_lege_korf_levert_nergens_een_stilzwijgende_voldoet() {
        let mut o = opzet();
        o.cage.stirrup_diameter_mm = 0.0;
        o.cage.stirrup_spacing_mm = None;
        o.cage.stirrup_legs = None;
        let alle = detailleringstoetsen(&invoer(&o));
        for c in &alle {
            if c.status == CheckStatus::NotApplicable {
                assert!(c.uc.is_none(), "{} is NotApplicable maar heeft een uc", c.id);
                assert!(!c.notes.is_empty(), "{} is NotApplicable zonder reden", c.id);
            } else {
                assert!(c.uc.is_some(), "{} heeft een status maar geen uc", c.id);
            }
        }
        // De drie beugeltoetsen kunnen zonder beugel niets.
        for id in ["9.2.2_rho_w_min", "9.2.2_sl_max", "9.2.2_st_max", "9.2.2_min_diameter_beugel"] {
            let c = alle.iter().find(|c| c.id == id).unwrap();
            assert_eq!(c.status, CheckStatus::NotApplicable, "{id} hoort NotApplicable te zijn");
        }
    }
}
