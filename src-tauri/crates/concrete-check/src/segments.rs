//! De stateloze stijfheidsdienst: één betonstaaf, in segmenten, elk met zijn
//! eigen secante buigstijfheid.
//!
//! # Waarvoor dit bestaat
//!
//! 5.8.6(6) van NEN-EN 1992-1-1 zegt: "In het algemeen is in een aantal
//! dwarsdoorsneden aan de voorwaarden voor evenwicht en compatibiliteit
//! voldaan. Een vereenvoudigd alternatief is om alleen de kritieke
//! dwarsdoorsnede(n) te beschouwen en een van toepassing zijnde variatie van
//! de tussenliggende kromming aan te nemen."
//!
//! Deze dienst doet **niet** dat vereenvoudigde alternatief maar het algemene
//! geval: evenwicht en compatibiliteit in een groot aantal doorsneden, één per
//! segment. De aanroeper knipt de staaf in dezelfde segmenten op als
//! elementen, rekent het raamwerk door, stuurt de gevonden (N, M) per segment
//! hierheen, en krijgt per segment een EI terug waarmee de volgende ronde
//! gerekend wordt. Deze crate houdt daarbij **niets** vast: elk verzoek staat
//! op zichzelf en draagt zijn eigen vorige ronde mee.
//!
//! # Waarom de indeling hier zit en niet in de aanroeper
//!
//! De segmentgrenzen moeten precies de elementgrenzen van de mesh zijn, en ze
//! moeten onafhankelijk van het belastinggeval zijn — anders verschuift de
//! mesh per combinatie en zijn de stijfheden van twee ronden niet meer
//! vergelijkbaar. Een tweede implementatie van dezelfde afrondingsregel in een
//! andere taal is precies de fout die dit project eerder met een dubbele
//! aanroeplaag heeft gemaakt. Daarom: [`segment_layout`] is de enige plaats
//! waar de indeling wordt bepaald, en een verzoek **zonder** krachten levert
//! alleen die indeling. Dat is ronde 0.
//!
//! # De indelingsregel
//!
//! ```text
//!   n = max(1, round(L / L_doel));    elk segment krijgt lengte L / n
//! ```
//!
//! Alle segmenten zijn dus **even lang**. Dat is een keuze, geen norm, en hij
//! is als volgt te verdedigen:
//!
//! * Een restsegment ("negen van 400 mm en één van 137 mm") geeft een sprong
//!   in de elementlengte die niets met de constructie te maken heeft maar wel
//!   met de rekenuitkomst: de geometrische stijfheidsmatrix is
//!   Hermite-consistent en haar nauwkeurigheid hangt af van de elementlengte,
//!   dus een kort staartelement is plaatselijk nauwkeuriger dan zijn buren.
//!   Even lange segmenten houden die fout gelijkmatig verdeeld.
//! * `round` in plaats van `ceil` of `floor` houdt de werkelijke
//!   segmentlengte zo dicht mogelijk bij de gewenste. De uitkomst ligt altijd
//!   tussen 0,75× en 1,5× de gewenste lengte: bij n ≥ 2 volgt uit
//!   |L/L_doel − n| ≤ ½ dat L/n tussen (1 − 1/(2n))·L_doel en
//!   (1 + 1/(2n))·L_doel ligt, en bij n = 1 is L zelf kleiner dan 1,5·L_doel.
//! * `max(1, …)` omdat een staaf altijd minstens één segment heeft. Een stukje
//!   van 200 mm in tweeën knippen levert geen nauwkeuriger tweede orde op,
//!   alleen meer vrijheidsgraden.
//!
//! `L_doel` is 400 mm als beginwaarde en instelbaar — besluit B3 van het
//! plandocument. De aanroeper bewaakt zelf het aantal vrijheidsgraden;
//! [`SegmentStiffnessRequest::max_segments`] is alleen een vangnet tegen een
//! doelwaarde van nul komma nul nul iets.
//!
//! # Het convergentie-oordeel
//!
//! Ook dat hoort hier en niet in de aanroeper. De maat is per segment
//!
//! ```text
//!   r = |EI_nieuw − EI_vorig| / max(|EI_nieuw|, |EI_vorig|)
//! ```
//!
//! en het oordeel is `max(r) ≤ tolerantie` over alle segmenten, met 1 % als
//! beginwaarde. De symmetrische noemer is met opzet gekozen: hij ligt altijd
//! tussen 0 en 1 en kan niet ontploffen als een segment vanuit een zeer slappe
//! toestand terugveert.
//!
//! **De maat rekent met de onbewerkte EI, niet met de teruggegeven.** Wordt er
//! gerelaxeerd of geklemd, dan is de teruggegeven waarde per definitie dichter
//! bij de vorige dan de berekende — een convergentiemaat op de teruggegeven
//! waarde zou dus door relaxatie zelf "converged" gaan melden terwijl de
//! oplossing nog beweegt. Dat is precies het soort verzonnen antwoord dat hier
//! niet mag.
//!
//! # Klemmen is zichtbaar, en nooit stil
//!
//! Vlak onder de momentweerstand loopt EI naar nul en wordt het globale
//! stelsel singulier. Er is daarom een ondergrens
//! [`SegmentStiffnessRequest::min_ei_ratio`] × E_c·I_c. Zodra die ingrijpt:
//!
//! * staat `clamped` op dat segment;
//! * staat de onbewerkte waarde nog steeds in `ei_raw_knm2`;
//! * en is `converged` van de hele ronde **onvoorwaardelijk false**, met een
//!   regel in `notes`.
//!
//! Een geklemde waarde is een verzinsel; hij mag het stelsel oplosbaar houden,
//! maar hij mag nooit als antwoord worden aangenomen.
//!
//! # Kruip
//!
//! φ_ef staat standaard op 0 (besluit B1) en dat is **zichtbaar**: het
//! antwoord draagt `phi_ef`, `creep_neglected` en een `creep_note` die het
//! met zoveel woorden zegt, inclusief de vermelding dat de uitkomst voor
//! blijvend belaste kolommen aan de onveilige kant is. Geen stilzwijgende nul.

use nen_en_1992_1_1::mnkappa::DEFAULT_N_STRIPS;
use nen_en_1992_1_1::{
    concrete_class_by_name, ei_secant, reinforcement_grade_by_name, DesignMaterial,
    DesignSituation, LoadDuration, MnKappaOptions, NonlinearBasis, RectConcreteSection,
    ReinforcementCage, SolveMethod, SteelBranch, StiffnessOptions,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Gewenste segmentlengte in mm — besluit B3 van het plandocument.
pub const DEFAULT_SEGMENT_LENGTH_MM: f64 = 400.0;
/// Convergentietolerantie op de relatieve verandering van EI. Een keuze, geen
/// normwaarde.
pub const DEFAULT_CONVERGENCE_TOLERANCE: f64 = 0.01;
/// Ondergrens voor EI als fractie van E_c·I_c. Een keuze, geen normwaarde.
pub const DEFAULT_MIN_EI_RATIO: f64 = 0.01;
/// Vangnet tegen een onzinnig kleine doelwaarde.
pub const DEFAULT_MAX_SEGMENTS: u32 = 2000;

fn default_segment_length() -> f64 {
    DEFAULT_SEGMENT_LENGTH_MM
}
fn default_tolerance() -> f64 {
    DEFAULT_CONVERGENCE_TOLERANCE
}
fn default_relaxation() -> f64 {
    1.0
}
fn default_min_ei_ratio() -> f64 {
    DEFAULT_MIN_EI_RATIO
}
fn default_max_segments() -> u32 {
    DEFAULT_MAX_SEGMENTS
}
fn default_n_strips() -> u32 {
    DEFAULT_N_STRIPS as u32
}

// ───────────────────────────────────────────────────────────────────────────
// Invoer
// ───────────────────────────────────────────────────────────────────────────

/// De snedekrachten van één segment, zoals de vorige raamwerkronde ze gaf.
///
/// Tekenconventie gelijk aan `mechanics` en aan de rest van dit project:
/// **N positief = trek**, M positief = trek in de onderste vezel.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SegmentForces {
    /// Normaalkracht in kN; trek positief, druk dus negatief.
    pub n_ed_kn: f64,
    /// Buigend moment in kNm om de sterke as; positief = trek onderin.
    pub m_ed_knm: f64,
}

/// Eén stateloos verzoek om de segmentstijfheden van één betonstaaf.
///
/// `deny_unknown_fields`: er staan hier tien velden met een standaardwaarde,
/// en een tikfout in één daarvan zou zonder deze strengheid stilzwijgend op de
/// standaard terugvallen — met een andere stijfheid als gevolg.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SegmentStiffnessRequest {
    /// Staafnummer; komt onveranderd terug in het antwoord.
    pub beam_id: u32,
    /// Doorsnedebreedte b in mm.
    pub width_mm: f64,
    /// Doorsnedehoogte h in mm (buiging om de sterke as).
    pub height_mm: f64,
    /// Betonsterkteklasse, bijv. "C30/37" (tabel 3.1).
    pub concrete_class: String,
    /// Wapeningsstaal, bijv. "B500B" (bijlage C).
    pub reinforcement_grade: String,
    /// Wapeningskorf: dekking, beugel, boven- en onderwapening.
    pub cage: ReinforcementCage,
    /// Staaflengte in m.
    pub length_m: f64,

    /// Gewenste segmentlengte in mm; 400 als beginwaarde (besluit B3). De
    /// werkelijke lengte volgt uit [`segment_layout`] en staat in het antwoord.
    #[serde(default = "default_segment_length")]
    pub target_segment_length_mm: f64,
    /// Vangnet: meer segmenten dan dit is een verzoekfout, geen berekening.
    #[serde(default = "default_max_segments")]
    pub max_segments: u32,

    /// Grenstoestand: `DesignValues` = UGT (5.8.6(3), f_cd en E_cd = E_cm/1,2,
    /// geen betontrek), `MeanValues` = BGT (3.1.5/7.4.3, f_cm en E_cm, met de
    /// tension stiffening van (7.18)). Nooit impliciet — de gebruikte variant
    /// staat per segment in het antwoord.
    #[serde(default)]
    pub limit_state: NonlinearBasis,

    /// Effectieve kruipcoëfficiënt volgens 5.8.4, verwerkt volgens 5.8.6(4).
    /// Besluit B1 zet hem op 0; het antwoord meldt dat met zoveel woorden.
    #[serde(default)]
    pub phi_ef: f64,

    /// De krachten per segment uit de vorige raamwerkronde, in de volgorde van
    /// de segmentindeling. **Leeg = ronde 0**: dan komt alleen de indeling
    /// terug. Is de lijst niet leeg, dan moet hij precies zoveel elementen
    /// tellen als er segmenten zijn; een afwijkende lengte is een fout en geen
    /// stilzwijgende bijsnijding.
    #[serde(default)]
    pub segment_forces: Vec<SegmentForces>,

    /// De stijfheden van de vorige ronde, in dezelfde volgorde. Leeg = eerste
    /// ronde met krachten; er is dan niets om tegen te convergeren.
    #[serde(default)]
    pub previous_ei_knm2: Vec<f64>,

    /// Onderrelaxatie ω: `EI = EI_vorig + ω·(EI_berekend − EI_vorig)`.
    /// 1,0 = geen relaxatie (beginwaarde). Alleen van kracht als er een vorige
    /// ronde is. De onbewerkte waarde blijft in `ei_raw_knm2` staan.
    #[serde(default = "default_relaxation")]
    pub relaxation: f64,

    /// Convergentietolerantie op `max |ΔEI| / max(|EI|, |EI_vorig|)`.
    #[serde(default = "default_tolerance")]
    pub convergence_tolerance: f64,

    /// Ondergrens voor EI als fractie van E_c·I_c, om het globale stelsel
    /// oplosbaar te houden. 0 = niet klemmen. Grijpt de klem in, dan is de
    /// ronde per definitie niet geconvergeerd.
    #[serde(default = "default_min_ei_ratio")]
    pub min_ei_ratio: f64,

    /// Aantal stroken voor de integratie van de betonspanning.
    #[serde(default = "default_n_strips")]
    pub n_strips: u32,
    /// Bovenste tak van het staaldiagram (3.2.7(2)); standaard horizontaal.
    #[serde(default)]
    pub steel_branch: SteelBranch,
    /// Ontwerpsituatie voor tabel 2.1N; standaard blijvend en tijdelijk.
    #[serde(default)]
    pub design_situation: DesignSituation,
    /// β van (7.19); alleen in de BGT van invloed.
    #[serde(default)]
    pub load_duration: LoadDuration,
}

// ───────────────────────────────────────────────────────────────────────────
// Uitvoer
// ───────────────────────────────────────────────────────────────────────────

/// Toestand van één segment. De volgorde is oplopend in ernst; het antwoord
/// van de hele ronde neemt de zwaarste over.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum SegmentStatus {
    /// Alleen de indeling; er zijn geen krachten aangeleverd (ronde 0).
    Layout,
    /// |M_Ed| ≤ |M_cr|: de doorsnede is niet gescheurd.
    Uncracked,
    /// |M_Ed| > |M_cr|: de doorsnede is gescheurd.
    Cracked,
    /// De grootste drukrek ligt boven ε_cu1. (3.14) is daar niet meer geldig
    /// ("geldig voor 0 < |ε_c| < |ε_cu1|", 3.1.5(1)); het getal is een
    /// extrapolatie en de doorsnede is in werkelijkheid bezweken.
    BeyondEpsCu1,
    /// Er kwam geen stijfheid uit. `message` zegt waarom; `ei_knm2` is leeg.
    Failed,
}

/// Toestand van de hele ronde.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum SegmentRunStatus {
    /// Alleen de indeling teruggegeven (ronde 0).
    Layout,
    /// Alle segmenten gerekend en binnen de tolerantie — klaar.
    Converged,
    /// Alle segmenten gerekend, maar nog niet uitgeconvergeerd, of er is nog
    /// geen vorige ronde om tegen te vergelijken, of er is geklemd.
    NotConverged,
    /// Ten minste één segment leverde geen getal. De aanroeper mag deze ronde
    /// niet als oplossing gebruiken.
    Failed,
}

/// Eén segment: dit is letterlijk de rapporttabel.
///
/// Alle rekengrootheden zijn `Option`. Dat is met opzet: in ronde 0 is er
/// niets gerekend, en een segment dat niet convergeert hoort géén getal te
/// leveren. Een nul of een NaN op die plek zou als antwoord kunnen worden
/// gelezen.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SegmentStiffness {
    /// Volgnummer, 0-gebaseerd; dezelfde volgorde als `segment_forces`.
    pub index: u32,
    /// Beginafstand langs de staaf vanaf het staafbegin, mm.
    pub x_start_mm: f64,
    /// Eindafstand langs de staaf, mm.
    pub x_end_mm: f64,
    /// Midden van het segment, mm — de doorsnede waarin evenwicht en
    /// compatibiliteit worden afgedwongen (5.8.6(6)).
    pub x_mid_mm: f64,
    pub length_mm: f64,

    /// Normaalkracht in dit segment (kN, trek positief).
    pub n_ed_kn: Option<f64>,
    /// Buigend moment in dit segment (kNm).
    pub m_ed_knm: Option<f64>,
    /// Het moment bij κ = 0 om de geometrische middenvezel h/2. Bij een
    /// asymmetrische korf onder druk is dit niet nul, en zonder deze correctie
    /// is EI = M/κ fout.
    pub m0_knm: Option<f64>,
    /// Scheurmoment uit f_ctm, met de normaalkracht erin (kNm).
    pub m_cr_knm: Option<f64>,
    /// De gevonden kromming, 1/m.
    pub kappa_per_m: Option<f64>,
    /// EI = (M − M₀)/κ zoals de kern hem berekende, kNm² — vóór relaxatie en
    /// vóór klemmen.
    pub ei_raw_knm2: Option<f64>,
    /// De EI die de aanroeper moet gebruiken, kNm² — ná relaxatie en klemmen.
    pub ei_knm2: Option<f64>,
    /// De EI van de vorige ronde, kNm².
    pub ei_previous_knm2: Option<f64>,
    /// |EI_raw − EI_vorig| / max(|EI_raw|, |EI_vorig|).
    pub relative_change: Option<f64>,

    /// Is |M_Ed| groter dan |M_cr|?
    pub cracked: Option<bool>,
    /// ζ van (7.19); alleen in de BGT gevuld (7.4.3(3)).
    pub zeta: Option<f64>,
    /// De gebruikte variant. Nooit impliciet, ook niet per segment.
    pub basis: NonlinearBasis,

    /// Heeft de relaxatie de teruggegeven waarde verschoven?
    pub relaxed: bool,
    /// Heeft de ondergrens ingegrepen? Zo ja, dan is `ei_knm2` een verzinsel
    /// dat het stelsel oplosbaar houdt en is de ronde niet geconvergeerd.
    pub clamped: bool,
    /// Ligt de grootste drukrek boven ε_cu1?
    pub beyond_eps_cu1: bool,
    /// Aantal iteraties van de krommingsoplosser.
    pub iterations: u32,
    /// Hoe de kromming is gevonden.
    pub method: Option<SolveMethod>,
    pub status: SegmentStatus,
    /// Reden bij `Failed`, of een toelichting bij een ingreep.
    pub message: Option<String>,
}

/// Antwoord op [`SegmentStiffnessRequest`].
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SegmentStiffnessResponse {
    pub beam_id: u32,
    /// Doorsnedenaam, bijv. "300 x 500".
    pub section_name: String,
    pub concrete_class: String,
    pub reinforcement_grade: String,
    /// "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".
    pub reinforcement_summary: String,
    pub length_m: f64,

    /// De gevraagde segmentlengte, mm.
    pub target_segment_length_mm: f64,
    /// De werkelijke segmentlengte, mm — L/n, voor elk segment gelijk.
    pub segment_length_mm: f64,
    pub segment_count: u32,
    /// De regel die de indeling bepaalde, uitgeschreven voor het rapport.
    pub segmentation_rule: String,

    /// De gebruikte grenstoestand en zijn omschrijving.
    pub limit_state: NonlinearBasis,
    pub limit_state_label: String,
    /// β van (7.19).
    pub load_duration: LoadDuration,
    pub beta: f64,

    /// De effectieve kruipcoëfficiënt die in het diagram zit (5.8.6(4)).
    pub phi_ef: f64,
    /// Staat φ_ef op nul?
    pub creep_neglected: bool,
    /// De verplichte vermelding uit besluit B1 — altijd gevuld, ook als er
    /// mét kruip is gerekend.
    pub creep_note: String,

    /// f_cd (UGT) of f_cm (BGT), N/mm².
    pub f_c_mpa: f64,
    /// E_cd = E_cm/1,2 (UGT) of E_cm (BGT), N/mm².
    pub e_c_mpa: f64,
    /// f_ctm volgens tabel 3.1, N/mm².
    pub f_ctm_mpa: f64,
    /// E_c·I_c van de bruto betondoorsnede, kNm². **Vergelijkingswaarde, geen
    /// rekenwaarde**: in de UGT bestaat er geen ongescheurde tak, want
    /// 5.8.6(5) laat de betontrek weg.
    pub ei_uncracked_knm2: f64,
    /// De toegepaste ondergrens in kNm² (`min_ei_ratio` × E_c·I_c).
    pub min_ei_knm2: f64,
    pub relaxation: f64,
    pub convergence_tolerance: f64,

    /// Zijn er krachten meegestuurd? Zo niet, dan is dit ronde 0.
    pub has_forces: bool,
    pub segments: Vec<SegmentStiffness>,

    /// Zijn de stijfheden uitgeconvergeerd? Klemmen zet dit onvoorwaardelijk
    /// op false.
    pub converged: bool,
    /// De grootste relatieve verandering over alle segmenten; leeg als er geen
    /// vorige ronde was.
    pub max_relative_change: Option<f64>,
    /// Het segment waar die grootste verandering zit.
    pub governing_segment: Option<u32>,
    pub clamped_count: u32,
    pub failed_count: u32,
    pub status: SegmentRunStatus,
    /// Toelichtingen die in het rapport horen: de indelingsregel, een ingreep
    /// van de klem, de reden van niet-convergeren.
    pub notes: Vec<String>,
}

// ───────────────────────────────────────────────────────────────────────────
// De segmentindelingsregel
// ───────────────────────────────────────────────────────────────────────────

/// Begin en eind van één segment langs de staaf, in mm vanaf het staafbegin.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SegmentSpan {
    pub x_start_mm: f64,
    pub x_end_mm: f64,
}

impl SegmentSpan {
    pub fn length_mm(&self) -> f64 {
        self.x_end_mm - self.x_start_mm
    }
    pub fn x_mid_mm(&self) -> f64 {
        0.5 * (self.x_start_mm + self.x_end_mm)
    }
}

/// **De enige plaats waar de segmentindeling wordt bepaald.**
///
/// n = max(1, round(L / L_doel)), alle segmenten even lang. Zie de
/// moduletoelichting voor de verantwoording. De uitkomst hangt uitsluitend af
/// van `length_mm` en `target_mm` — niet van de krachten, niet van de
/// belastingcombinatie, niet van de grenstoestand. Dat is de eis: de mesh mag
/// niet per lastgeval verschuiven.
///
/// De grenzen worden uit `i·L/n` berekend en niet opgeteld, zodat het laatste
/// segment exact op L eindigt en er geen drijvende-kommarest overblijft.
pub fn segment_layout(
    length_mm: f64,
    target_mm: f64,
    max_segments: u32,
) -> Result<Vec<SegmentSpan>, String> {
    if !length_mm.is_finite() || length_mm <= 0.0 {
        return Err(format!("staaflengte moet groter dan nul zijn, kreeg {length_mm} mm"));
    }
    if !target_mm.is_finite() || target_mm <= 0.0 {
        return Err(format!(
            "gewenste segmentlengte moet groter dan nul zijn, kreeg {target_mm} mm"
        ));
    }
    let n = (length_mm / target_mm).round().max(1.0);
    if !n.is_finite() || n > max_segments as f64 {
        return Err(format!(
            "{n} segmenten bij een staaf van {length_mm} mm en een doellengte van {target_mm} mm; \
             dat is meer dan de toegestane {max_segments}. Verhoog `target_segment_length_mm` of \
             `max_segments`."
        ));
    }
    let n = n as u32;
    Ok((0..n)
        .map(|i| SegmentSpan {
            x_start_mm: length_mm * i as f64 / n as f64,
            x_end_mm: length_mm * (i + 1) as f64 / n as f64,
        })
        .collect())
}

// ───────────────────────────────────────────────────────────────────────────
// De dienst
// ───────────────────────────────────────────────────────────────────────────

/// De verplichte kruipvermelding van besluit B1.
fn creep_note(phi_ef: f64) -> String {
    if phi_ef == 0.0 {
        "Er is ZONDER kruip gerekend: φ_ef = 0. 5.8.6(4) staat toe met kruip rekening te houden \
         door alle rekwaarden in het spanning-rekdiagram van 5.8.6(3) met (1 + φ_ef) te \
         vermenigvuldigen, waarin φ_ef de effectieve kruipcoëfficiënt volgens 5.8.4 is; dat is \
         hier niet gedaan. Voor blijvend belaste kolommen is deze uitkomst daarmee AAN DE \
         ONVEILIGE KANT: kruip verlaagt de buigstijfheid en vergroot dus het \
         tweede-ordemoment."
            .to_string()
    } else {
        format!(
            "Kruip is verwerkt volgens 5.8.6(4): alle rekwaarden in het spanning-rekdiagram van \
             5.8.6(3) zijn met (1 + φ_ef) = {:.3} vermenigvuldigd, met φ_ef = {phi_ef} volgens \
             5.8.4.",
            1.0 + phi_ef
        )
    }
}

/// De segmentstijfheden van één staaf. Stateloos: alles wat nodig is staat in
/// het verzoek, en er blijft niets achter.
///
/// `Err` is voorbehouden aan een verzoek dat niet uitvoerbaar is — een
/// onbekende sterkteklasse, een korf die niet in de doorsnede past, een lijst
/// krachten die niet bij de indeling hoort. Een segment dat niet convergeert
/// is géén `Err`: dat is een uitkomst per segment, met status `Failed`, zonder
/// getal en met de reden erbij, zodat de rest van de tabel bruikbaar blijft.
pub fn segment_stiffness(
    req: SegmentStiffnessRequest,
) -> Result<SegmentStiffnessResponse, String> {
    let length_mm = req.length_m * 1000.0;
    let spans = segment_layout(length_mm, req.target_segment_length_mm, req.max_segments)?;
    let n_seg = spans.len();

    let section = RectConcreteSection::new(req.width_mm, req.height_mm);
    let beton = concrete_class_by_name(&req.concrete_class)
        .ok_or_else(|| format!("betonsterkteklasse {} onbekend", req.concrete_class))?;
    let staal = reinforcement_grade_by_name(&req.reinforcement_grade)
        .ok_or_else(|| format!("wapeningsstaal {} onbekend", req.reinforcement_grade))?;
    req.cage.validate(&section)?;
    if !(req.phi_ef.is_finite() && req.phi_ef >= 0.0) {
        return Err(format!("φ_ef moet nul of positief zijn, kreeg {}", req.phi_ef));
    }
    if !(req.relaxation.is_finite() && req.relaxation > 0.0 && req.relaxation <= 1.0) {
        return Err(format!(
            "relaxation moet in (0, 1] liggen, kreeg {}; 1,0 = geen relaxatie",
            req.relaxation
        ));
    }
    if !(req.convergence_tolerance.is_finite() && req.convergence_tolerance > 0.0) {
        return Err(format!(
            "convergence_tolerance moet groter dan nul zijn, kreeg {}",
            req.convergence_tolerance
        ));
    }
    if !(req.min_ei_ratio.is_finite() && (0.0..1.0).contains(&req.min_ei_ratio)) {
        return Err(format!(
            "min_ei_ratio moet in [0, 1) liggen, kreeg {}",
            req.min_ei_ratio
        ));
    }
    if !req.segment_forces.is_empty() && req.segment_forces.len() != n_seg {
        return Err(format!(
            "de indeling levert {n_seg} segmenten maar er zijn {} krachtenparen meegestuurd. \
             Vraag eerst de indeling op met een verzoek zonder `segment_forces`.",
            req.segment_forces.len()
        ));
    }
    if !req.previous_ei_knm2.is_empty() && req.previous_ei_knm2.len() != n_seg {
        return Err(format!(
            "de indeling levert {n_seg} segmenten maar er zijn {} stijfheden van de vorige ronde \
             meegestuurd.",
            req.previous_ei_knm2.len()
        ));
    }

    let mat = DesignMaterial::nonlinear(
        beton,
        staal,
        req.design_situation,
        req.steel_branch,
        req.limit_state,
        req.phi_ef,
    );
    let curve = mat
        .nonlinear
        .expect("DesignMaterial::nonlinear levert altijd een (3.14)-kromme");
    let layers = req.cage.layers(section.h_mm);
    let opts = StiffnessOptions {
        mnk: MnKappaOptions { n_strips: req.n_strips.max(1) as usize },
        load_duration: req.load_duration,
    };

    let i_c = section.b_mm * section.h_mm.powi(3) / 12.0;
    // N/mm² · mm⁴ = N·mm² = 10⁻⁹ kN·m².
    let ei_uncracked = curve.e_c * i_c * 1e-9;
    let min_ei = req.min_ei_ratio * ei_uncracked;

    let has_forces = !req.segment_forces.is_empty();
    let has_previous = !req.previous_ei_knm2.is_empty();

    let mut segments = Vec::with_capacity(n_seg);
    let mut max_change: Option<(f64, u32)> = None;
    let mut clamped_count = 0_u32;
    let mut failed_count = 0_u32;
    let mut notes: Vec<String> = Vec::new();

    for (i, span) in spans.iter().enumerate() {
        let leeg = SegmentStiffness {
            index: i as u32,
            x_start_mm: span.x_start_mm,
            x_end_mm: span.x_end_mm,
            x_mid_mm: span.x_mid_mm(),
            length_mm: span.length_mm(),
            n_ed_kn: None,
            m_ed_knm: None,
            m0_knm: None,
            m_cr_knm: None,
            kappa_per_m: None,
            ei_raw_knm2: None,
            ei_knm2: None,
            ei_previous_knm2: req.previous_ei_knm2.get(i).copied(),
            relative_change: None,
            cracked: None,
            zeta: None,
            basis: req.limit_state,
            relaxed: false,
            clamped: false,
            beyond_eps_cu1: false,
            iterations: 0,
            method: None,
            status: SegmentStatus::Layout,
            message: None,
        };
        if !has_forces {
            segments.push(leeg);
            continue;
        }

        let f = req.segment_forces[i];
        let vorig = req.previous_ei_knm2.get(i).copied();
        let mut s = SegmentStiffness {
            n_ed_kn: Some(f.n_ed_kn),
            m_ed_knm: Some(f.m_ed_knm),
            ..leeg
        };

        match ei_secant(&section, &layers, &mat, f.n_ed_kn, f.m_ed_knm, &opts) {
            Err(e) => {
                failed_count += 1;
                s.status = SegmentStatus::Failed;
                s.message = Some(format!(
                    "segment {i} ({:.0}–{:.0} mm) bij N = {:.1} kN en M = {:.1} kNm: {e}",
                    span.x_start_mm, span.x_end_mm, f.n_ed_kn, f.m_ed_knm
                ));
            }
            Ok(r) => {
                let raw = r.ei_knm2;
                // Een niet-eindige of niet-positieve secans is geen antwoord.
                // Hij kan alleen ontstaan als de oplosser op een randgeval
                // uitkomt; hem als getal doorgeven zou het stelsel stilzwijgend
                // vergiftigen.
                if !(raw.is_finite() && raw > 0.0) {
                    failed_count += 1;
                    s.status = SegmentStatus::Failed;
                    s.m0_knm = Some(r.m0_knm);
                    s.m_cr_knm = Some(r.m_cr_knm);
                    s.kappa_per_m = Some(r.kappa_per_m);
                    s.message = Some(format!(
                        "segment {i}: de secante stijfheid kwam uit op {raw} kNm² bij κ = {:.3e} \
                         1/m; dat is geen bruikbare stijfheid.",
                        r.kappa_per_m
                    ));
                } else {
                    s.m0_knm = Some(r.m0_knm);
                    s.m_cr_knm = Some(r.m_cr_knm);
                    s.kappa_per_m = Some(r.kappa_per_m);
                    s.cracked = Some(r.cracked);
                    s.zeta = r.tension_stiffening.map(|t| t.zeta);
                    s.iterations = r.iterations;
                    s.method = Some(r.method);
                    s.beyond_eps_cu1 = r.beyond_eps_cu1;
                    s.ei_raw_knm2 = Some(raw);

                    // Convergentiemaat: onbewerkt tegen vorig. Zie de
                    // moduletoelichting — relaxatie mag geen convergentie
                    // voorwenden.
                    if let Some(p) = vorig {
                        let noemer = raw.abs().max(p.abs());
                        let r_rel = if noemer > 0.0 { (raw - p).abs() / noemer } else { 0.0 };
                        s.relative_change = Some(r_rel);
                        if max_change.map(|(m, _)| r_rel > m).unwrap_or(true) {
                            max_change = Some((r_rel, i as u32));
                        }
                    }

                    // Relaxatie.
                    let mut ei = match vorig {
                        Some(p) if req.relaxation < 1.0 => {
                            s.relaxed = true;
                            p + req.relaxation * (raw - p)
                        }
                        _ => raw,
                    };
                    // Klemmen — luid.
                    if min_ei > 0.0 && ei < min_ei {
                        s.clamped = true;
                        clamped_count += 1;
                        s.message = Some(format!(
                            "EI is geklemd op de ondergrens {min_ei:.0} kNm² ({:.1} % van E_c·I_c). \
                             Berekend was {raw:.0} kNm², vóór klemmen stond er {ei:.0} kNm². Dit is \
                             een numerieke ondergrens en geen rekenuitkomst: het segment staat \
                             vrijwel op zijn momentweerstand.",
                            100.0 * req.min_ei_ratio
                        ));
                        ei = min_ei;
                    }
                    s.ei_knm2 = Some(ei);
                    s.status = if r.beyond_eps_cu1 {
                        SegmentStatus::BeyondEpsCu1
                    } else if r.cracked {
                        SegmentStatus::Cracked
                    } else {
                        SegmentStatus::Uncracked
                    };
                }
            }
        }
        segments.push(s);
    }

    notes.push(format!(
        "Segmentindeling: n = max(1; round(L / L_doel)) = {} segmenten van {:.1} mm bij een \
         staaflengte van {:.0} mm en een gewenste segmentlengte van {:.0} mm. Alle segmenten zijn \
         even lang; de indeling hangt niet van het belastinggeval af.",
        n_seg,
        length_mm / n_seg as f64,
        length_mm,
        req.target_segment_length_mm
    ));
    notes.push(format!("Grenstoestand: {}.", req.limit_state.label()));
    notes.push(creep_note(req.phi_ef));

    let converged_op_maat = has_forces
        && has_previous
        && failed_count == 0
        && max_change.map(|(m, _)| m <= req.convergence_tolerance).unwrap_or(false);
    let converged = converged_op_maat && clamped_count == 0;

    if has_forces {
        if failed_count > 0 {
            notes.push(format!(
                "{failed_count} van de {n_seg} segmenten leverde geen stijfheid. Deze ronde is geen \
                 oplossing; zie de meldingen per segment."
            ));
        }
        if clamped_count > 0 {
            notes.push(format!(
                "{clamped_count} van de {n_seg} segmenten is op de ondergrens geklemd. Een geklemde \
                 waarde is een numerieke ondergrens en geen rekenuitkomst, dus deze ronde geldt \
                 NIET als geconvergeerd, ook niet als de verandering binnen de tolerantie viel."
            ));
        }
        if !has_previous {
            notes.push(
                "Er zijn geen stijfheden van een vorige ronde meegestuurd; convergentie is daarom \
                 niet te beoordelen."
                    .to_string(),
            );
        }
        if req.relaxation < 1.0 {
            notes.push(format!(
                "Onderrelaxatie ω = {:.3} toegepast op de teruggegeven stijfheden. Het \
                 convergentie-oordeel rekent met de ONBEWERKTE waarden (`ei_raw_knm2`), zodat de \
                 relaxatie geen convergentie kan voorwenden.",
                req.relaxation
            ));
        }
    }

    let status = if !has_forces {
        SegmentRunStatus::Layout
    } else if failed_count > 0 {
        SegmentRunStatus::Failed
    } else if converged {
        SegmentRunStatus::Converged
    } else {
        SegmentRunStatus::NotConverged
    };

    Ok(SegmentStiffnessResponse {
        beam_id: req.beam_id,
        section_name: section.name(),
        concrete_class: req.concrete_class.clone(),
        reinforcement_grade: req.reinforcement_grade.clone(),
        reinforcement_summary: req.cage.summary(),
        length_m: req.length_m,
        target_segment_length_mm: req.target_segment_length_mm,
        segment_length_mm: length_mm / n_seg as f64,
        segment_count: n_seg as u32,
        segmentation_rule: "n = max(1; round(L / L_doel)); alle segmenten even lang".to_string(),
        limit_state: req.limit_state,
        limit_state_label: req.limit_state.label().to_string(),
        load_duration: req.load_duration,
        beta: req.load_duration.beta(),
        phi_ef: req.phi_ef,
        creep_neglected: req.phi_ef == 0.0,
        creep_note: creep_note(req.phi_ef),
        f_c_mpa: curve.f_c,
        e_c_mpa: curve.e_c,
        f_ctm_mpa: curve.f_ctm,
        ei_uncracked_knm2: ei_uncracked,
        min_ei_knm2: min_ei,
        relaxation: req.relaxation,
        convergence_tolerance: req.convergence_tolerance,
        has_forces,
        segments,
        converged,
        max_relative_change: max_change.map(|(m, _)| m),
        governing_segment: max_change.map(|(_, i)| i),
        clamped_count,
        failed_count,
        status,
        notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── De indelingsregel ─────────────────────────────────────────────────

    #[test]
    fn de_indeling_deelt_netjes_op_bij_een_passende_lengte() {
        let s = segment_layout(4000.0, 400.0, DEFAULT_MAX_SEGMENTS).unwrap();
        assert_eq!(s.len(), 10);
        for (i, seg) in s.iter().enumerate() {
            assert_eq!(seg.x_start_mm, 400.0 * i as f64);
            assert_eq!(seg.length_mm(), 400.0);
        }
        assert_eq!(s.last().unwrap().x_end_mm, 4000.0);
    }

    /// Een lengte die niet netjes deelbaar is levert even lange segmenten en
    /// géén restsegment, en de werkelijke lengte blijft tussen 0,75× en 1,5×
    /// de gewenste.
    #[test]
    fn een_niet_deelbare_lengte_levert_even_lange_segmenten() {
        for l in [237.0_f64, 500.0, 599.0, 601.0, 1234.0, 3333.0, 4300.0, 12_345.0] {
            let s = segment_layout(l, 400.0, DEFAULT_MAX_SEGMENTS).unwrap();
            let len = s[0].length_mm();
            for seg in &s {
                assert!(
                    (seg.length_mm() - len).abs() < 1e-9,
                    "L = {l}: ongelijke segmenten"
                );
            }
            assert_eq!(s.last().unwrap().x_end_mm, l, "L = {l}: eindigt niet op L");
            assert_eq!(s[0].x_start_mm, 0.0);
            // Bij n = 1 kan de staaf zelf korter zijn dan 0,75·L_doel; de
            // bovengrens geldt altijd.
            assert!(len <= 1.5 * 400.0 + 1e-9, "L = {l}: segment {len} mm");
            if s.len() > 1 {
                assert!(len >= 0.75 * 400.0 - 1e-9, "L = {l}: segment {len} mm");
            }
            println!("L = {l:>8.0} mm → {} segmenten van {len:.1} mm", s.len());
        }
    }

    #[test]
    fn een_korte_staaf_krijgt_een_segment() {
        assert_eq!(segment_layout(200.0, 400.0, 2000).unwrap().len(), 1);
        assert_eq!(segment_layout(599.0, 400.0, 2000).unwrap().len(), 1);
        // Vanaf 600 mm (= 1,5 × 400) kantelt `round` naar twee.
        assert_eq!(segment_layout(601.0, 400.0, 2000).unwrap().len(), 2);
    }

    #[test]
    fn onzinnige_invoer_levert_een_fout_en_geen_indeling() {
        assert!(segment_layout(0.0, 400.0, 2000).is_err());
        assert!(segment_layout(-1.0, 400.0, 2000).is_err());
        assert!(segment_layout(4000.0, 0.0, 2000).is_err());
        assert!(segment_layout(4000.0, f64::NAN, 2000).is_err());
        // Vangnet tegen een doelwaarde van bijna nul.
        assert!(segment_layout(4000.0, 0.001, 2000).is_err());
    }

    /// De instelbaarheid van besluit B3: een andere doelwaarde geeft een
    /// andere indeling, en 400 mm is de beginwaarde.
    #[test]
    fn de_doellengte_is_instelbaar_met_400_mm_als_beginwaarde() {
        assert_eq!(DEFAULT_SEGMENT_LENGTH_MM, 400.0);
        assert_eq!(segment_layout(4000.0, 400.0, 2000).unwrap().len(), 10);
        assert_eq!(segment_layout(4000.0, 200.0, 2000).unwrap().len(), 20);
        assert_eq!(segment_layout(4000.0, 1000.0, 2000).unwrap().len(), 4);
    }
}
