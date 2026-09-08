//! Secante buigstijfheid voor de niet-lineaire constructieve berekening.
//!
//! Dit is de omgekeerde weg van [`crate::mnkappa`]. Daar wordt bij een
//! opgelegde kromming het moment bepaald; hier wordt bij een opgelegd
//! momentenpaar (N, M) de kromming bepaald, en daaruit de secante
//! buigstijfheid waarmee een raamwerkberekening verder kan:
//!
//! ```text
//!            M − M₀
//!   EI  =  ───────────
//!              κ
//! ```
//!
//! **M₀ is geen detail.** Het moment wordt in deze crate om de geometrische
//! middenvezel h/2 genomen en niet om het plastisch zwaartepunt van de
//! doorsnede. Bij een symmetrische wapeningskorf valt dat samen en is
//! M(κ = 0) exact nul, maar bij een asymmetrische korf onder druk niet: de
//! normaalkracht levert dan zelf al een moment om h/2. Zonder die correctie
//! is EI = M/κ fout — te stijf of te slap, afhankelijk van het teken. Voor de
//! referentiedoorsnede (300 × 500, onder 3Ø16, boven 2Ø12) is M₀ ≈ −0,98 kNm
//! bij N = −200 kN en ≈ −4,13 kNm bij N = −800 kN.
//!
//! ## Twee grenstoestanden, twee antwoorden
//!
//! | | UGT | BGT |
//! |---|---|---|
//! | diagram | (3.14) met f_cd en E_cd = E_cm/1,2 — 5.8.6(3) | (3.14) met f_cm en E_cm — 3.1.5 |
//! | betontrek | verwaarloosd — 5.8.6(5) | tot f_ctm — 7.4.3(4) |
//! | tension stiffening | nee — 5.8.6(5) | ja, (7.18)/(7.19) — 7.4.3(3) |
//!
//! De keuze zit in [`crate::stress_strain::NonlinearBasis`] en staat in
//! [`SecantStiffness::basis`]; hij is dus nooit impliciet.
//!
//! ## Tension stiffening, 7.4.3(3)
//!
//! Letterlijk uit de norm: "Elementen die naar verwachting zullen scheuren,
//! maar misschien niet volledig, zullen zich gedragen op een wijze die ligt
//! tussen de ongescheurde en de volledig gescheurde toestand en, voor
//! elementen die voornamelijk op buiging zijn belast, een goede voorspelling
//! van het gedrag wordt gegeven door vergelijking (7.18):
//!
//! ```text
//!   α = ζ·α_II + (1 − ζ)·α_I                                       (7.18)
//! ```
//!
//! waarin α de beschouwde vervormingsparameter is "die bijvoorbeeld een rek,
//! een kromming of een rotatie kan zijn" — hier dus de kromming κ — en α_I en
//! α_II de waarden "voor de respectievelijk ongescheurde en volledig
//! gescheurde toestanden". De verdelingsfactor ζ is vergelijking (7.19).
//!
//! **Hoe (7.19) is gelezen.** Ook dat is in de PDF-uitgave een formulebeeld;
//! de bladzijde met 7.4.3 (PDF-pagina 171/294) is als afbeelding gerenderd en
//! afgelezen:
//!
//! ```text
//!            ⎛ σ_sr ⎞²
//!   ζ = 1 − β⎜──────⎟                                              (7.19)
//!            ⎝ σ_s  ⎠
//! ```
//!
//! met, uit de wél leesbare tekst eronder:
//!
//! * ζ = 0 voor ongescheurde doorsneden;
//! * β = 1,0 voor een enkele kortdurende belasting, 0,5 voor aanhoudende
//!   belastingen of meervoudige cycli van zich herhalende belastingen;
//! * σ_s is de spanning in de trekwapening berekend op basis van een
//!   gescheurde doorsnede;
//! * σ_sr dezelfde spanning "onder de belastingscondities die de eerste
//!   scheur veroorzaken";
//! * OPMERKING: "σ_sr/σ_s mag zijn vervangen door M_cr/M voor buiging".
//!
//! Deze module gebruikt (7.19) zoals hij er staat, met σ_sr en σ_s beide uit
//! de gescheurde doorsnede: σ_s bij (N, M) en σ_sr bij (N, M_cr). Dat is
//! nauwkeuriger dan de vervanging M_cr/M zodra er een normaalkracht in het
//! spel is — de OPMERKING geeft die vervanging immers "voor buiging". Levert
//! de gescheurde doorsnede geen enkele trekkende laag op, dan is er niets om
//! te scheuren en is ζ = 0 (ongescheurd).
//!
//! α_I en α_II zijn hier de krommingen van twee **gladde** doorsnedemodellen:
//! α_I met lineair-elastische betontrek zonder afkap ("als ongescheurd
//! beschouwd", 7.4.3(3)) en α_II zonder betontrek ("volledig gescheurd").
//! Uitdrukkelijk **niet** het model dat de betontrek bros bij f_ctm afkapt:
//! daar valt de trekkracht bij het scheuren ineens weg, waardoor M(κ)
//! terugvalt en niet meer monotoon is. Dat verschijnsel is echt — het staat
//! als test in deze module — en het is precies wat 7.4.3 met de interpolatie
//! omzeilt. Zie [`crate::stress_strain::ConcreteTension`].
//!
//! ## Wat hier niet zit
//!
//! Alleen de bibliotheeklaag. Er is nog geen verzoektype, geen Tauri-command,
//! geen toetsbrug en geen MCP-gereedschap; die horen bij de fysisch
//! niet-lineaire tweede orde en zijn een aparte taak.

use crate::mnkappa::{internal_forces, solve_eps0, MnKappaOptions, SectionState, MAX_N_STRIPS};
use crate::section::{mirrored_layers, ConcreteSection, RebarLayer, RectConcreteSection};
use crate::stress_strain::{
    ConcreteNonlinearCurve, ConcreteTension, DesignMaterial, NonlinearBasis,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// β van (7.19): de invloed van de belastingsduur op de gemiddelde rek.
///
/// Serde en ts-rs staan erop omdat het segmentstijfheidsverzoek in
/// `concrete-check` deze keuze als invoerveld draagt en hem in het antwoord
/// terugmeldt. Welke β is gebruikt mag niet impliciet blijven; het scheelt in
/// de BGT rechtstreeks stijfheid (zie `beta_van_7_19_werkt_de_goede_kant_op`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum LoadDuration {
    /// "= 1,0 voor een enkele kortdurende belasting" — 7.4.3(3).
    #[default]
    ShortTerm,
    /// "= 0,5 voor aanhoudende belastingen of meervoudige cycli van zich
    /// herhalende belastingen" — 7.4.3(3).
    Sustained,
}

impl LoadDuration {
    /// De coëfficiënt β van (7.19).
    pub fn beta(&self) -> f64 {
        match self {
            LoadDuration::ShortTerm => 1.0,
            LoadDuration::Sustained => 0.5,
        }
    }
}

/// Instellingen van de stijfheidsberekening.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StiffnessOptions {
    /// Strokenverdeling voor de integratie van de betonspanning.
    pub mnk: MnKappaOptions,
    /// β van (7.19). Alleen in de BGT gebruikt.
    pub load_duration: LoadDuration,
}

/// Wat er misging. Een niet-convergent geval levert dit en géén getal.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StiffnessError {
    /// Het materiaal draagt geen (3.14)-kromme. Gebruik
    /// [`DesignMaterial::nonlinear`]; het parabool-rechthoekdiagram van
    /// 3.1.7 is het diagram van de doorsnedetoetsing en niet van de
    /// constructieve berekening (5.8.6(3)).
    NoNonlinearCurve,
    /// Bij κ = 0 is al geen evenwicht mogelijk: |N| ligt boven de
    /// normaalkrachtcapaciteit van de doorsnede.
    AxialCapacityExceeded,
    /// Er is geen kromming waarbij de doorsnede dit moment draagt: M ligt
    /// boven de momentweerstand bij deze N.
    MomentNotReached,
    /// De iteratie is binnen het iteratieplafond niet geconvergeerd.
    NotConverged,
}

impl std::fmt::Display for StiffnessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            StiffnessError::NoNonlinearCurve => {
                "materiaal zonder (3.14)-kromme; gebruik DesignMaterial::nonlinear (5.8.6(3))"
            }
            StiffnessError::AxialCapacityExceeded => {
                "geen evenwicht bij κ = 0: |N| boven de normaalkrachtcapaciteit"
            }
            StiffnessError::MomentNotReached => {
                "geen kromming gevonden: M boven de momentweerstand bij deze N"
            }
            StiffnessError::NotConverged => "de iteratie is niet geconvergeerd",
        };
        f.write_str(s)
    }
}

impl std::error::Error for StiffnessError {}

/// Hoe de kromming is gevonden.
///
/// Serde en ts-rs staan erop om dezelfde reden als bij [`LoadDuration`]: het
/// segmentantwoord meldt per segment of de snelle weg is genomen of dat er is
/// teruggevallen op de insluiting. Dat is de vroegste zichtbare aanwijzing dat
/// een segment tegen de top van zijn M-κ-diagram aanloopt.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum SolveMethod {
    /// Newton op (ε₀, κ), binnen de bewaakte insluiting.
    Newton,
    /// Terugval: insluiten door κ op te voeren en daarna halveren.
    Bisection,
}

/// Uitkomst van [`kappa_from_nm`].
#[derive(Clone, Debug, PartialEq)]
pub struct KappaSolution {
    /// Kromming in 1/m, `mechanics`-conventie (positief = druk boven).
    pub kappa_per_m: f64,
    /// Rek in het midden van de doorsnede (druk positief).
    pub eps_0: f64,
    /// De doorsnedetoestand in de oorspronkelijke (niet-gespiegelde) stand.
    pub state: SectionState,
    pub iterations: u32,
    pub method: SolveMethod,
    /// De grootste drukrek ligt boven ε_cu1: (3.14) is daar niet meer geldig
    /// ("geldig voor 0 < |ε_c| < |ε_cu1|", 3.1.5(1)). Het getal is dan een
    /// extrapolatie en de aanroeper moet erop handelen.
    pub beyond_eps_cu1: bool,
}

/// De tension-stiffening-tak van 7.4.3(3), alleen in de BGT gevuld.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TensionStiffening {
    /// β van (7.19).
    pub beta: f64,
    /// ζ van (7.19); 0 = ongescheurd.
    pub zeta: f64,
    /// κ_I — de ongescheurde toestand (α_I van (7.18)), 1/m.
    pub kappa_uncracked_per_m: f64,
    /// κ_II — de volledig gescheurde toestand (α_II van (7.18)), 1/m.
    pub kappa_cracked_per_m: f64,
    /// σ_s — spanning in de meest trekkende wapeningslaag, gescheurde
    /// doorsnede bij (N, M). N/mm², positief = trek.
    pub sigma_s: f64,
    /// σ_sr — dezelfde spanning bij (N, M_cr).
    pub sigma_sr: f64,
}

/// Secante buigstijfheid en alles wat de rapporttabel ervan nodig heeft.
#[derive(Clone, Debug, PartialEq)]
pub struct SecantStiffness {
    /// Waarop is gerekend — nooit impliciet.
    pub basis: NonlinearBasis,
    /// De effectieve kruipcoëfficiënt die in het diagram zit (5.8.6(4)).
    /// Staat er ook als hij nul is: dan is er zonder kruip gerekend, en dat
    /// is voor blijvend belaste kolommen aan de onveilige kant.
    pub phi_ef: f64,
    /// Normaalkracht (kN, trek positief) en moment (kNm, trek onder positief).
    pub n_kn: f64,
    pub m_knm: f64,
    /// Het moment bij κ = 0 om de geometrische middenvezel h/2.
    pub m0_knm: f64,
    /// Scheurmoment uit f_ctm, met de normaalkracht erin (kNm, zelfde teken
    /// als `m_knm`).
    pub m_cr_knm: f64,
    /// Is |M| groter dan |M_cr|?
    pub cracked: bool,
    /// De gevonden kromming, 1/m.
    pub kappa_per_m: f64,
    /// EI = (M − M₀)/κ, in kNm².
    pub ei_knm2: f64,
    /// De ongescheurde vergelijkingswaarde E_c·I_c (bruto betondoorsnede),
    /// kNm² — met E_c = E_cd in de UGT en E_cm in de BGT.
    pub ei_uncracked_knm2: f64,
    /// Alleen in de BGT gevuld (7.4.3(3)); in de UGT `None` omdat 5.8.6(5)
    /// verwaarlozen toestaat.
    pub tension_stiffening: Option<TensionStiffening>,
    pub iterations: u32,
    pub method: SolveMethod,
    pub beyond_eps_cu1: bool,
}

impl SecantStiffness {
    /// EI in MNm² — de eenheid waarin de plandocumenten de vergelijking maken.
    pub fn ei_mnm2(&self) -> f64 {
        self.ei_knm2 * 1e-3
    }
}

// ───────────────────────────────────────────────────────────────────────────
// M₀ — het moment bij κ = 0
// ───────────────────────────────────────────────────────────────────────────

/// Het moment bij κ = 0 (kNm), in het frame dat `moment_sign` aanwijst.
///
/// `moment_sign` = +1 geeft de `mechanics`-conventie (trek onder positief).
/// `moment_sign` = −1 geeft het gespiegelde frame waarin
/// [`crate::mnkappa::mn_kappa_diagram`] rekent — daar is de korf gespiegeld
/// en is M₀ dus precies het tegengestelde: `m0(−1) = −m0(+1)`. Dat is geen
/// tekenfout maar de eigenschap van de spiegeling; wie EI = (M − M₀)/κ in het
/// gespiegelde frame uitrekent moet daar het gespiegelde M₀ bij hebben.
///
/// `None` als er bij κ = 0 geen evenwicht mogelijk is (|N| boven de
/// normaalkrachtcapaciteit).
pub fn m0_knm(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    moment_sign: f64,
    opts: &MnKappaOptions,
) -> Option<f64> {
    let sec_eigen: ConcreteSection;
    let eigen: Vec<RebarLayer>;
    let (section, lagen): (&ConcreteSection, &[RebarLayer]) = if moment_sign < 0.0 {
        sec_eigen = section.mirrored();
        eigen = mirrored_layers(layers, section.h_mm);
        (&sec_eigen, &eigen)
    } else {
        (section, layers)
    };
    let n_strips = opts.n_strips.clamp(1, MAX_N_STRIPS);
    let n_target = -n_ed_kn * 1e3;
    let eps_0 = eps0_at(section, lagen, mat, n_target, 0.0, n_strips, None)?;
    Some(internal_forces(section, lagen, mat, eps_0, 0.0, n_strips).m() * 1e-6)
}

// ───────────────────────────────────────────────────────────────────────────
// Het scheurmoment
// ───────────────────────────────────────────────────────────────────────────

/// Scheurmoment uit f_ctm, **met de normaalkracht in de spanningsformule**
/// (kNm, met het teken van `moment_sign`).
///
/// De uiterste vezel scheurt zodra de trekspanning f_ctm bereikt. Met de
/// normaalkracht erin (`mechanics`-conventie: N positief = trek):
///
/// ```text
///   σ = N/A_c + M/W_c = f_ctm     →     M_cr = (f_ctm − N/A_c)·W_c
/// ```
///
/// met A_c en W_c van de **bruto betondoorsnede**. De wapening wordt niet
/// meegerekend (geen omrekening naar een homogene doorsnede) — dezelfde
/// vereenvoudiging als elders in deze crate, waar het door de wapening
/// verdrongen beton ook niet wordt afgetrokken. Voor een
/// tweede-ordeberekening is dat de veilige kant op: een kleinere W_c geeft
/// een kleiner M_cr, dus eerder scheuren en een slappere staaf.
///
/// **Twee weerstandsmomenten, niet één.** Welke vezel scheurt, hangt af van
/// de richting van het moment, en welke W daarbij hoort van de ligging van
/// het zwaartepunt. Bij een rechthoek ligt dat op halve hoogte en is
/// W_onder = W_boven = b·h²/6; het teken van `moment_sign` draaide toen alleen
/// de uitkomst om. Bij een T ligt het zwaartepunt naar de flens toe, en dan
/// is W_onder = I/z_g kleiner dan W_boven = I/(h − z_g). **Het scheurmoment
/// van een T verschilt dus wezenlijk tussen een positief en een negatief
/// moment** — met de flens boven scheurt de onderzijde eerder.
///
/// f_ctm komt uit **tabel 3.1**; 7.4.3(4): "In het algemeen zal de beste
/// schatting van het gedrag zijn verkregen indien f_ctm is gebruikt." De
/// buigtreksterkte f_ctm,fl van 3.1.8, die 7.4.3(4) toestaat als er
/// aantoonbaar geen normaaltrekspanningen zijn, wordt hier niet gebruikt.
///
/// Bij zoveel normaaltrek dat de doorsnede al zonder moment scheurt, is de
/// uitkomst 0.
pub fn m_cr_knm(
    section: &RectConcreteSection,
    f_ctm: f64,
    n_ed_kn: f64,
    moment_sign: f64,
) -> f64 {
    let a_c = section.area_mm2();
    // Positief moment = trek in de ONDERSTE vezel (mechanics-conventie), dus
    // W van de onderzijde; negatief moment scheurt de bovenzijde.
    let w_c = if moment_sign < 0.0 { section.w_top_mm3() } else { section.w_bottom_mm3() };
    if a_c <= 0.0 {
        return 0.0;
    }
    let sigma_n = n_ed_kn * 1e3 / a_c; // N/mm², trek positief
    let m = ((f_ctm - sigma_n) * w_c * 1e-6).max(0.0);
    if moment_sign < 0.0 {
        -m
    } else {
        m
    }
}

// ───────────────────────────────────────────────────────────────────────────
// κ uit (N, M)
// ───────────────────────────────────────────────────────────────────────────

/// Maximaal aantal Newton-stappen van de buitenlus.
const MAX_NEWTON: u32 = 60;
/// Aantal stappen waarmee de terugval de kromming opvoert om in te sluiten.
/// Meetkundig verdeeld over zes ordes van grootte, dus ongeveer 9 % per stap.
const MARCH_STEPS: u32 = 160;

/// Rek in het midden (druk positief) waarbij de inwendige normaalkracht
/// gelijk is aan `n_target` (N, druk positief) bij kromming `kappa` (1/mm).
///
/// Newton met de numerieke raaklijn dN/dε₀ = Σ E_t·A, gestart bij het
/// lineaire schatje ε₀ = n_target/(E_c0·A_c + E_s·A_s). Dat schatje ligt
/// altijd dichter bij nul dan de oplossing (de raaklijnstijfheid kan alleen
/// maar afnemen), en N(ε₀) is op de stijgende tak concaaf, dus Newton nadert
/// de wortel van onderaf en monotoon. Lukt dat niet, dan valt hij terug op de
/// bisectie van [`solve_eps0`].
fn eps0_at(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_target: f64,
    kappa_per_mm: f64,
    n_strips: usize,
    seed: Option<f64>,
) -> Option<f64> {
    let n_of = |e: f64| internal_forces(section, layers, mat, e, kappa_per_mm, n_strips).n();
    // Referentiestijfheid voor het beginschatje en de tolerantie.
    let e_c0 = mat.nonlinear.map(|c| c.e_c0()).unwrap_or(mat.concrete.f_cd * mat.concrete.n / mat.concrete.eps_c2);
    // Bandsgewijs opgeteld, zodat de rechthoek letterlijk e_c0·b·h houdt.
    let ea = section.bands().iter().map(|b| e_c0 * b.b_mm * b.height_mm()).sum::<f64>()
        + crate::factors::E_S * layers.iter().map(|l| l.area_mm2).sum::<f64>();
    let n_ref = section.bands().iter().map(|b| mat.f_cd().max(1.0) * b.b_mm * b.height_mm()).sum::<f64>();
    let tol = 1e-10 * n_ref.max(n_target.abs());

    let mut e = seed.unwrap_or(if ea > 0.0 { n_target / ea } else { 0.0 });
    let mut r = n_of(e) - n_target;
    for _ in 0..MAX_NEWTON {
        if r.abs() <= tol {
            return Some(e);
        }
        let h = 1e-7;
        let d = (n_of(e + h) - n_of(e - h)) / (2.0 * h);
        if !(d.is_finite() && d > 0.0) {
            break;
        }
        let mut stap = -r / d;
        // Stapbegrenzing: nooit meer dan 5 ‰ rek per stap.
        stap = stap.clamp(-5e-3, 5e-3);
        // Lijnzoek: halveer tot het residu kleiner is.
        let mut alpha = 1.0;
        let mut gelukt = false;
        for _ in 0..25 {
            let e_new = e + alpha * stap;
            let r_new = n_of(e_new) - n_target;
            if r_new.abs() < r.abs() {
                e = e_new;
                r = r_new;
                gelukt = true;
                break;
            }
            alpha *= 0.5;
        }
        if !gelukt {
            break;
        }
    }
    if r.abs() <= 1e-6 * n_ref.max(n_target.abs()).max(1.0) {
        return Some(e);
    }
    // Terugval: de bisectie van de M-N-κ-motor.
    solve_eps0(section, layers, mat, n_target, kappa_per_mm, n_strips)
}

/// Interne oplossing in het werkframe: `m_target` ≥ M₀, κ ≥ 0.
struct Branch {
    eps_0: f64,
    kappa_per_mm: f64,
    iterations: u32,
    method: SolveMethod,
}

/// De kleinste κ ≥ 0 waarbij het inwendige moment `m_target` (N·mm) wordt
/// gedragen bij normaalkracht `n_target` (N, druk positief).
///
/// **De kleinste wortel, altijd.** M(κ) bij vaste N stijgt tot een top en
/// daalt daarna (het M-κ-diagram), dus een moment onder de top wordt bij twee
/// krommingen gedragen. Alleen de kleinste is de stabiele, fysisch
/// bereikbare toestand. Dat wordt afgedwongen met een insluiting: `k_lo` is
/// de grootste κ waarvan bekend is dat M(κ) < m_target, `k_hi` de kleinste
/// waarvan bekend is dat M(κ) > m_target. Bij κ = 0 is M = M₀ < m_target, dus
/// de insluiting bevat vanaf het begin de kleinste wortel, en elke
/// Newton-stap die eruit valt wordt vervangen door een halvering.
///
/// Die redenering leunt erop dat M(κ) één top heeft. Dat geldt voor alle
/// modellen die [`ei_secant`] gebruikt — [`ConcreteTension::None`] en
/// [`ConcreteTension::LinearUncracked`] — maar **niet** voor de bros bij
/// f_ctm afgekapte trektak ([`ConcreteTension::UpToFctm`]): daar valt M bij
/// het scheuren terug en zijn er twee toppen, waarvan de eerste zo scherp kan
/// zijn dat geen enkel eindig raster hem betrouwbaar vindt. Voor dat model
/// wordt de Newton overgeslagen en meteen gemarcheerd, zodat de gevonden
/// wortel in elk geval de eerste is die een raster van ongeveer 9 % kan
/// onderscheiden — maar een garantie is dat niet, en voor een moment dat
/// precies in de scheurpiek valt is de vraag ook niet welgesteld.
fn solve_branch(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_target: f64,
    m_target: f64,
    n_strips: usize,
) -> Result<Branch, StiffnessError> {
    let h = section.h_mm;
    // Toestand bij κ = 0.
    let eps0_0 = eps0_at(section, layers, mat, n_target, 0.0, n_strips, None)
        .ok_or(StiffnessError::AxialCapacityExceeded)?;
    let m_0 = internal_forces(section, layers, mat, eps0_0, 0.0, n_strips).m();

    // Schaal waarop momenten worden afgerond: f_cd maal het kleinste
    // weerstandsmoment van de bruto doorsnede. Bij een rechthoek b·h²/6.
    let m_ref = mat.f_cd().max(1.0) * section.w_bottom_mm3().min(section.w_top_mm3());
    let tol_m = 1e-9 * m_ref.max(m_target.abs());
    if (m_target - m_0).abs() <= tol_m {
        return Ok(Branch { eps_0: eps0_0, kappa_per_mm: 0.0, iterations: 0, method: SolveMethod::Newton });
    }
    if m_target < m_0 {
        // De aanroeper hoort het frame zo te kiezen dat m_target ≥ M₀.
        return Err(StiffnessError::MomentNotReached);
    }

    // Bovengrens voor de kromming: ruim voorbij elke bereikbare bezwijkrek.
    let eps_c_lim = mat.nonlinear.map(|c| c.eps_cu1).unwrap_or(mat.concrete.eps_cu2);
    let kappa_max = 3.0 * (eps_c_lim + mat.steel.eps_ud) / h;

    // M(κ) met continuatie van ε₀ (het vorige antwoord als beginschatje).
    let mut eps_seed = eps0_0;
    let moment = |kap: f64, seed: f64| -> Option<(f64, f64)> {
        let e = eps0_at(section, layers, mat, n_target, kap, n_strips, Some(seed))?;
        Some((internal_forces(section, layers, mat, e, kap, n_strips).m(), e))
    };

    // Beginschatje uit de ongescheurde stijfheid: κ₀ = (M − M₀)/(E_c0·I_c).
    let e_c0 = mat.nonlinear.map(|c| c.e_c0()).unwrap_or(mat.concrete.f_cd * mat.concrete.n / mat.concrete.eps_c2);
    let ei_0 = e_c0 * section.i_centroid_mm4();
    let mut k = if ei_0 > 0.0 { ((m_target - m_0) / ei_0).min(kappa_max) } else { kappa_max * 0.01 };
    // Vangt ook NaN en oneindig af: een onbruikbaar beginschatje wordt een
    // kleine, zeker positieve kromming.
    if !k.is_finite() || k <= 0.0 {
        k = kappa_max * 1e-4;
    }

    let mut k_lo = 0.0_f64;
    let mut k_hi = f64::INFINITY;
    let mut iter = 0_u32;
    // Kwam de laatst gezette kromming van de Newton-stap of van de
    // insluiting? Dat staat in het antwoord, zodat zichtbaar is wanneer de
    // snelle weg is verlaten.
    let mut via_newton = true;

    // Bij de brosse trektak is M(κ) niet eentoppig: sla de Newton over.
    let bros = matches!(
        mat.nonlinear.map(|c| c.tension),
        Some(crate::stress_strain::ConcreteTension::UpToFctm)
    );
    while !bros && iter < MAX_NEWTON {
        iter += 1;
        let Some((m_k, e_k)) = moment(k, eps_seed) else {
            // Geen evenwicht meer bij deze kromming: sluit van boven af.
            k_hi = k_hi.min(k);
            k = 0.5 * (k_lo + if k_hi.is_finite() { k_hi } else { k_lo + kappa_max });
            via_newton = false;
            continue;
        };
        eps_seed = e_k;
        let r = m_k - m_target;
        if r.abs() <= tol_m {
            let method =
                if via_newton { SolveMethod::Newton } else { SolveMethod::Bisection };
            return Ok(Branch { eps_0: e_k, kappa_per_mm: k, iterations: iter, method });
        }
        if r < 0.0 {
            k_lo = k_lo.max(k);
        } else {
            k_hi = k_hi.min(k);
        }

        // Newton-stap met de numerieke afgeleide dM/dκ.
        let dk = (1e-4 * k).max(1e-12);
        let voorstel = match moment(k + dk, e_k) {
            Some((m_p, _)) => {
                let d = (m_p - m_k) / dk;
                if d.is_finite() && d > 0.0 {
                    Some(k - r / d)
                } else {
                    None
                }
            }
            None => None,
        };

        let binnen = |x: f64| x > k_lo && x < k_hi && x.is_finite();
        k = match voorstel {
            Some(x) if binnen(x) => {
                via_newton = true;
                x
            }
            _ => {
                via_newton = false;
                if k_hi.is_finite() {
                    0.5 * (k_lo + k_hi)
                } else {
                    // Nog geen bovengrens: voer de kromming op tot hij er is.
                    let volgende = (k * 2.0).min(kappa_max);
                    if volgende <= k_lo * (1.0 + 1e-12) {
                        break;
                    }
                    volgende
                }
            }
        };
        if k_hi.is_finite() && k_hi - k_lo < 1e-15 {
            break;
        }
        if k >= kappa_max && !k_hi.is_finite() {
            break;
        }
    }

    // Terugval: marcheren tot de eerste insluiting en dan halveren.
    //
    // De stappen lopen **meetkundig** en niet lineair. De bruikbare
    // krommingen beslaan enkele ordes van grootte — van 10⁻⁴ /m in een
    // nauwelijks belaste ligger tot 10⁻¹ /m vlak voor bezwijken — en een
    // lineaire verdeling over dat bereik stapt met haar eerste stap al over
    // het hele lage gebied heen. Dan wordt niet de eerste wortel gevonden
    // maar een latere, en juist dat mag niet gebeuren.
    let (mut lo, mut hi) = (0.0_f64, f64::NAN);
    let mut seed = eps0_0;
    let k_min = kappa_max * 1e-6;
    let factor = (kappa_max / k_min).powf(1.0 / MARCH_STEPS as f64);
    for i in 1..=MARCH_STEPS {
        let kap = k_min * factor.powi(i as i32 - 1);
        match moment(kap, seed) {
            Some((m_k, e_k)) => {
                seed = e_k;
                if m_k >= m_target {
                    hi = kap;
                    break;
                }
                lo = kap;
            }
            None => {
                hi = kap;
                break;
            }
        }
    }
    if !hi.is_finite() {
        return Err(StiffnessError::MomentNotReached);
    }
    let mut eps = eps0_0;
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        match moment(mid, eps) {
            Some((m_k, e_k)) => {
                eps = e_k;
                if m_k < m_target {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            None => hi = mid,
        }
        if hi - lo <= 1e-14 * kappa_max {
            break;
        }
    }
    let kap = 0.5 * (lo + hi);
    match eps0_at(section, layers, mat, n_target, kap, n_strips, Some(eps)) {
        Some(e) => Ok(Branch {
            eps_0: e,
            kappa_per_mm: kap,
            iterations: MAX_NEWTON + MARCH_STEPS,
            method: SolveMethod::Bisection,
        }),
        None => Err(StiffnessError::NotConverged),
    }
}

/// De kleinste kromming κ (1/m) waarbij de doorsnede bij normaalkracht
/// `n_ed_kn` (kN, trek positief) het moment `m_ed_knm` (kNm, trek onder
/// positief) draagt.
///
/// Dit is de omgekeerde weg van [`crate::mnkappa::solve_state`], die bij een
/// **opgelegde** kromming het moment geeft. De richting van de kromming volgt
/// uit het teken van M − M₀; is dat negatief, dan wordt de korf gespiegeld —
/// dezelfde spiegeling die [`crate::mnkappa::mn_kappa_diagram`] gebruikt —
/// en het antwoord daarna teruggedraaid. De toestand in het antwoord staat
/// altijd in de oorspronkelijke stand.
///
/// **Grens van de belofte.** "De kleinste κ" geldt onvoorwaardelijk zolang
/// M(κ) één top heeft; zie [`solve_branch`]. Dat is zo voor de modellen die
/// [`ei_secant`] gebruikt. Voor de bros bij f_ctm afgekapte trektak
/// ([`ConcreteTension::UpToFctm`]) heeft M(κ) twee toppen en is de belofte
/// alleen zo scherp als het raster van de terugval.
pub fn kappa_from_nm(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    m_ed_knm: f64,
    opts: &MnKappaOptions,
) -> Result<KappaSolution, StiffnessError> {
    let n_strips = opts.n_strips.clamp(1, MAX_N_STRIPS);
    let n_target = -n_ed_kn * 1e3;
    let m0 = m0_knm(section, layers, mat, n_ed_kn, 1.0, opts)
        .ok_or(StiffnessError::AxialCapacityExceeded)?;
    let sign = if m_ed_knm < m0 { -1.0 } else { 1.0 };

    // Ook hier klapt de hele doorsnede om en niet alleen de korf: bij een T
    // hoort de flens onder als het moment negatief is.
    let sec_eigen: ConcreteSection;
    let eigen: Vec<RebarLayer>;
    let (werk, lagen): (&ConcreteSection, &[RebarLayer]) = if sign < 0.0 {
        sec_eigen = section.mirrored();
        eigen = mirrored_layers(layers, section.h_mm);
        (&sec_eigen, &eigen)
    } else {
        (section, layers)
    };
    let br = solve_branch(werk, lagen, mat, n_target, sign * m_ed_knm * 1e6, n_strips)?;

    // Terug naar de oorspronkelijke stand. De rek in het midden is onder de
    // spiegeling z → h − z onveranderd (alleen de armen keren om), dus de
    // toestand kan rechtstreeks worden uitgeschreven — zonder tweede
    // evenwichtszoektocht die een iets andere ε₀ zou opleveren.
    let kappa_per_mm = sign * br.kappa_per_mm;
    let state = crate::mnkappa::state_at(
        section,
        layers,
        mat,
        br.eps_0,
        kappa_per_mm,
        &MnKappaOptions { n_strips },
    );

    let eps_cu1 = mat.nonlinear.map(|c| c.eps_cu1).unwrap_or(mat.concrete.eps_cu2);
    Ok(KappaSolution {
        kappa_per_m: kappa_per_mm * 1e3,
        eps_0: br.eps_0,
        beyond_eps_cu1: state.eps_c_max() > eps_cu1 + 1e-12,
        state,
        iterations: br.iterations,
        method: br.method,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// De secante buigstijfheid
// ───────────────────────────────────────────────────────────────────────────

/// EI = (M − M₀)/κ (kNm²), met de tension stiffening van 7.4.3(3) als de
/// bruikbaarheidsgrenstoestand is gekozen.
///
/// Het materiaal moet een (3.14)-kromme dragen — zie
/// [`DesignMaterial::nonlinear`]. Zonder die kromme zou hier het
/// parabool-rechthoekdiagram van de doorsnedetoetsing worden gebruikt en dat
/// is het verkeerde diagram voor een constructieve berekening (5.8.6(3));
/// vandaar [`StiffnessError::NoNonlinearCurve`].
pub fn ei_secant(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    m_ed_knm: f64,
    opts: &StiffnessOptions,
) -> Result<SecantStiffness, StiffnessError> {
    let curve: ConcreteNonlinearCurve = mat.nonlinear.ok_or(StiffnessError::NoNonlinearCurve)?;
    let mnk = &opts.mnk;
    let i_c = section.i_centroid_mm4();
    // E_c·I_c in kNm²: N/mm² · mm⁴ = N·mm² = 10⁻⁹ kN·m².
    let ei_uncracked = curve.e_c * i_c * 1e-9;

    let m_cr = m_cr_knm(section, curve.f_ctm, n_ed_kn, if m_ed_knm < 0.0 { -1.0 } else { 1.0 });

    // Kromming waarbij de uiterste vezel 10⁻⁶ rek krijgt: klein genoeg om de
    // raaklijn te benaderen, groot genoeg om ruim boven het oplosresidu uit
    // te komen.
    let kappa_eps = 2e-3 / section.h_mm;

    let afronden = |k: KappaSolution,
                    m0: f64,
                    ts: Option<TensionStiffening>,
                    kappa: f64,
                    limiet_mat: &DesignMaterial| {
        // Bij M = M₀ is de kromming nul en is de secans EI = (M − M₀)/κ als
        // 0/0 onbepaald. Dat is geen randgeval: een kolom met normaalkracht
        // en zonder moment valt er precies op, en die heeft wel degelijk een
        // stijfheid. Genomen wordt dan de limietwaarde — het quotiënt bij een
        // verwaarloosbaar kleine kromming, oftewel de raaklijnstijfheid in
        // die toestand. Geen aangenomen getal, gewoon dezelfde formule bij
        // een kromming die de rek nauwelijks verandert.
        let ei = if kappa.abs() > kappa_eps * 1e-3 {
            (m_ed_knm - m0) / kappa
        } else {
            match crate::mnkappa::solve_state(
                section,
                layers,
                limiet_mat,
                n_ed_kn,
                kappa_eps,
                mnk,
            ) {
                Some(st) => (st.m_knm - m0) / kappa_eps,
                None => f64::INFINITY,
            }
        };
        SecantStiffness {
            basis: curve.basis,
            phi_ef: curve.phi_ef,
            n_kn: n_ed_kn,
            m_knm: m_ed_knm,
            m0_knm: m0,
            m_cr_knm: m_cr,
            cracked: m_ed_knm.abs() > m_cr.abs() + 1e-12,
            kappa_per_m: kappa,
            ei_knm2: ei,
            ei_uncracked_knm2: ei_uncracked,
            tension_stiffening: ts,
            iterations: k.iterations,
            method: k.method,
            beyond_eps_cu1: k.beyond_eps_cu1,
        }
    };

    match curve.basis {
        // ── UGT: geen betontrek, geen tension stiffening (5.8.6(5)). ──────
        NonlinearBasis::DesignValues => {
            let mat_ugt = mat.with_concrete_tension(ConcreteTension::None);
            let m0 = m0_knm(section, layers, &mat_ugt, n_ed_kn, 1.0, mnk)
                .ok_or(StiffnessError::AxialCapacityExceeded)?;
            let k = kappa_from_nm(section, layers, &mat_ugt, n_ed_kn, m_ed_knm, mnk)?;
            let kappa = k.kappa_per_m;
            Ok(afronden(k, m0, None, kappa, &mat_ugt))
        }
        // ── BGT: (7.18) tussen ongescheurd en volledig gescheurd. ─────────
        NonlinearBasis::MeanValues => {
            // α_I: "als ongescheurd beschouwd" — lineair-elastische trek
            // zonder afkap. α_II: "volledig gescheurd" — geen betontrek.
            // Bewust níét de bros bij f_ctm afgekapte trektak: die maakt
            // M(κ) niet-monotoon, en dat is precies wat 7.4.3(3) met de
            // interpolatie omzeilt (zie `ConcreteTension`).
            let mat_i = mat.with_concrete_tension(ConcreteTension::LinearUncracked);
            let mat_ii = mat.with_concrete_tension(ConcreteTension::None);
            let m0_i = m0_knm(section, layers, &mat_i, n_ed_kn, 1.0, mnk)
                .ok_or(StiffnessError::AxialCapacityExceeded)?;
            let k_i = kappa_from_nm(section, layers, &mat_i, n_ed_kn, m_ed_knm, mnk)?;

            // 7.4.3(3): "ζ = 0 voor ongescheurde doorsneden."
            if m_ed_knm.abs() <= m_cr.abs() {
                let kappa = k_i.kappa_per_m;
                let ts = TensionStiffening {
                    beta: opts.load_duration.beta(),
                    zeta: 0.0,
                    kappa_uncracked_per_m: kappa,
                    kappa_cracked_per_m: f64::NAN,
                    sigma_s: f64::NAN,
                    sigma_sr: f64::NAN,
                };
                return Ok(afronden(k_i, m0_i, Some(ts), kappa, &mat_i));
            }

            let m0_ii = m0_knm(section, layers, &mat_ii, n_ed_kn, 1.0, mnk)
                .ok_or(StiffnessError::AxialCapacityExceeded)?;
            let k_ii = kappa_from_nm(section, layers, &mat_ii, n_ed_kn, m_ed_knm, mnk)?;
            // σ_s en σ_sr, beide uit de gescheurde doorsnede (7.4.3(3)).
            let sigma_s = trekspanning(&k_ii.state);
            let sigma_sr = match kappa_from_nm(section, layers, &mat_ii, n_ed_kn, m_cr, mnk) {
                Ok(k_cr) => trekspanning(&k_cr.state),
                Err(_) => f64::NAN,
            };
            let beta = opts.load_duration.beta();
            let zeta = if sigma_s > 0.0 && sigma_sr.is_finite() && sigma_sr > 0.0 {
                (1.0 - beta * (sigma_sr / sigma_s).powi(2)).clamp(0.0, 1.0)
            } else {
                // Geen trekkende laag ⇒ er is niets om te scheuren.
                0.0
            };
            let kappa = zeta * k_ii.kappa_per_m + (1.0 - zeta) * k_i.kappa_per_m;
            let m0 = zeta * m0_ii + (1.0 - zeta) * m0_i;
            let ts = TensionStiffening {
                beta,
                zeta,
                kappa_uncracked_per_m: k_i.kappa_per_m,
                kappa_cracked_per_m: k_ii.kappa_per_m,
                sigma_s,
                sigma_sr,
            };
            Ok(afronden(k_ii, m0, Some(ts), kappa, &mat_i))
        }
    }
}

/// Grootste trekspanning in de wapening (N/mm², positief = trek). De crate
/// rekent inwendig met druk positief, dus de trekspanning is −σ.
fn trekspanning(state: &SectionState) -> f64 {
    state.sigma_s.iter().fold(0.0_f64, |m, &s| m.max(-s))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::factors::DesignSituation;
    use crate::section::{RebarRow, ReinforcementCage};
    use crate::stress_strain::SteelBranch;
    use approx::assert_relative_eq;

    fn doorsnede() -> RectConcreteSection {
        RectConcreteSection::new(300.0, 500.0)
    }

    /// De referentiekorf: asymmetrisch (onder 3Ø16, boven 2Ø12).
    fn korf_asym() -> ReinforcementCage {
        ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
            ..ReinforcementCage::default()
        }
    }

    /// Symmetrische korf: boven en onder gelijk. Hier is M₀ exact nul — een
    /// test met alléén deze korf vindt de M₀-fout niet.
    fn korf_sym() -> ReinforcementCage {
        ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 3, diameter_mm: 16.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
            ..ReinforcementCage::default()
        }
    }

    fn mat(basis: NonlinearBasis, phi_ef: f64) -> DesignMaterial {
        DesignMaterial::nonlinear(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
            basis,
            phi_ef,
        )
    }

    fn opts() -> StiffnessOptions {
        StiffnessOptions::default()
    }

    // ── M₀ ────────────────────────────────────────────────────────────────

    /// Bij een **symmetrische** korf is M₀ exact nul — precies waarom een
    /// test met alleen deze korf de M₀-fout niet zou vinden.
    #[test]
    fn m0_is_nul_bij_een_symmetrische_korf() {
        let s = doorsnede();
        let lagen = korf_sym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        for n in [0.0_f64, -200.0, -800.0, -2000.0, 200.0] {
            let m0 = m0_knm(&s, &lagen, &m, n, 1.0, &MnKappaOptions::default()).unwrap();
            assert!(m0.abs() < 1e-9, "N = {n}: M₀ = {m0}");
        }
    }

    /// Bij een **asymmetrische** korf onder druk is M₀ ≠ 0: de normaalkracht
    /// levert zelf al een moment om h/2. De handberekening: de betonspanning
    /// is bij κ = 0 uniform en levert om het midden niets, dus M₀ is puur het
    /// staal, F_s = A_s·σ_s(ε₀) op zijn arm.
    #[test]
    fn m0_is_niet_nul_bij_een_asymmetrische_korf_onder_druk() {
        let s = doorsnede();
        let k = korf_asym();
        let lagen = k.layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let o = MnKappaOptions::default();
        let m0_nul = m0_knm(&s, &lagen, &m, 0.0, 1.0, &o).unwrap();
        let m0_druk = m0_knm(&s, &lagen, &m, -800.0, 1.0, &o).unwrap();
        assert!(m0_druk < -1.0, "M₀ bij N = −800 kN is {m0_druk}");
        assert!(m0_druk < m0_nul);

        // Handberekening bij N = −800 kN, uit de rek in het midden: de
        // spanning is in beide lagen gelijk (uniforme rek), dus
        //   M₀ = σ_s·(A_boven·(456 − 250) + A_onder·(46 − 250)).
        let sol = crate::mnkappa::solve_state(&s, &lagen, &m, -800.0, 0.0, &o).unwrap();
        let sigma = sol.sigma_s[0];
        assert_relative_eq!(sol.sigma_s[1], sigma, max_relative = 1e-12);
        let hand = sigma * (226.1947 * 206.0 - 603.1858 * 204.0) * 1e-6;
        assert_relative_eq!(m0_druk, hand, max_relative = 1e-4);
        assert!(hand < 0.0);
    }

    /// M₀ krijgt bij een negatief moment het juiste teken na spiegeling:
    /// het gespiegelde frame is precies het tegengestelde.
    #[test]
    fn m0_teken_klopt_na_spiegeling() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let o = MnKappaOptions::default();
        for n in [0.0_f64, -200.0, -800.0, -2500.0] {
            let plus = m0_knm(&s, &lagen, &m, n, 1.0, &o).unwrap();
            let min = m0_knm(&s, &lagen, &m, n, -1.0, &o).unwrap();
            assert_relative_eq!(min, -plus, epsilon = 1e-12, max_relative = 1e-12);
        }
        // En het gespiegelde frame is inderdaad het frame van
        // `mn_kappa_diagram`: daar is M(κ = 0) bij moment_sign = −1 gelijk aan
        // −M₀. Bij zware druk is dat een positief getal, en dan zou EI = M/κ
        // zonder M₀-correctie zelfs van teken wisselen.
        let m0_druk = m0_knm(&s, &lagen, &m, -2500.0, -1.0, &o).unwrap();
        assert!(m0_druk > 0.0, "gespiegeld M₀ = {m0_druk}");
    }

    /// De gemeten M₀-waarden uit het plandocument, nu met (3.14) in plaats
    /// van het parabool-rechthoekdiagram: het teken en de orde blijven, maar
    /// de getallen zijn niet identiek — het diagram is stijver, dus bij
    /// dezelfde N is de rek kleiner en het staal draagt minder.
    #[test]
    fn m0_orde_van_grootte_klopt_met_de_meting() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let o = MnKappaOptions::default();
        for (n, verwacht) in [(-200.0, -0.98), (-800.0, -4.13)] {
            let m0 = m0_knm(&s, &lagen, &m, n, 1.0, &o).unwrap();
            println!("N = {n} kN → M₀ = {m0:.3} kNm (parabool-rechthoek: {verwacht})");
            assert!(m0 < 0.0);
            assert!(m0 > 1.6 * verwacht && m0 < 0.4 * verwacht, "M₀ = {m0}");
        }
    }

    // ── κ uit (N, M) ──────────────────────────────────────────────────────

    /// Heen en terug: leg een kromming op, lees het moment af, en vraag de
    /// kromming er weer uit.
    ///
    /// Is de opgelegde kromming de **eerste** waarbij dat moment wordt
    /// gedragen, dan moet hij er precies weer uit komen. Is er een kleinere
    /// kromming met hetzelfde moment — voorbij de top van het M-κ-diagram —
    /// dan hoort per opzet die kleinere eruit te komen. Beide gevallen worden
    /// hier nagegaan, en de sweep moet ze allebei raken; anders zou hij
    /// stilzwijgend om de valkuil heen lopen.
    ///
    /// De sweep gaat over de drie modellen die [`ei_secant`] gebruikt: de
    /// UGT zonder betontrek (5.8.6(5)) en de beide toestanden van 7.4.3(3).
    /// Het bros afgekapte model doet niet mee — daar heeft M(κ) twee toppen
    /// en is de kleinste wortel niet welgesteld; dat staat apart vastgelegd
    /// in `brosse_trekafkap_geeft_een_terugval_in_m_kappa`.
    #[test]
    fn kappa_from_nm_is_de_inverse_van_solve_state() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let o = MnKappaOptions::default();
        let mut meerdere_wortels = 0;
        let modellen = [
            (NonlinearBasis::DesignValues, ConcreteTension::None),
            (NonlinearBasis::MeanValues, ConcreteTension::LinearUncracked),
            (NonlinearBasis::MeanValues, ConcreteTension::None),
        ];
        for (basis, tension) in modellen {
            let m = mat(basis, 0.0).with_concrete_tension(tension);
            for n in [0.0_f64, -200.0, -800.0] {
                for kap in [0.5e-3_f64, 2e-3, 5e-3, 1e-2, 2e-2] {
                    for teken in [1.0_f64, -1.0] {
                        let k_in = teken * kap;
                        let st = crate::mnkappa::solve_state(&s, &lagen, &m, n, k_in, &o).unwrap();
                        let uit = kappa_from_nm(&s, &lagen, &m, n, st.m_knm, &o).unwrap();
                        assert_relative_eq!(uit.state.m_knm, st.m_knm, max_relative = 1e-6);
                        assert_relative_eq!(uit.state.n_kn, n, epsilon = 1e-4, max_relative = 1e-8);
                        // Is er vóór k_in al een kromming met hetzelfde
                        // moment? Scan het traject (0, k_in) af.
                        let m0 = m0_knm(&s, &lagen, &m, n, 1.0, &o).unwrap();
                        let doel = teken * (st.m_knm - m0);
                        let mut eerder = false;
                        for i in 1..200 {
                            let kx = k_in * i as f64 / 200.0;
                            if let Some(sx) = crate::mnkappa::solve_state(&s, &lagen, &m, n, kx, &o)
                            {
                                if teken * (sx.m_knm - m0) >= doel * (1.0 - 1e-12) {
                                    eerder = true;
                                    break;
                                }
                            }
                        }
                        if eerder {
                            meerdere_wortels += 1;
                            assert!(
                                uit.kappa_per_m.abs() < k_in.abs(),
                                "{basis:?}/{tension:?} N={n} κ={k_in}: er is een kleinere wortel maar \
                                 kappa_from_nm gaf {}",
                                uit.kappa_per_m
                            );
                        } else {
                            assert!(
                                (uit.kappa_per_m - k_in).abs() <= 1e-6 * k_in.abs(),
                                "{basis:?}/{tension:?} N={n} κ={k_in} teken={teken}: κ_uit={}, M={}",
                                uit.kappa_per_m,
                                st.m_knm
                            );
                        }
                    }
                }
            }
        }
        assert!(meerdere_wortels > 0, "de sweep raakte geen enkele meervoudige wortel");
        println!("{meerdere_wortels} gevallen hadden meer dan één wortel");
    }

    /// Het brosse afkappen van de betontrek bij f_ctm (7.4.3(4)) maakt M(κ)
    /// niet-monotoon: zodra de uiterste vezel scheurt valt de trekkracht in
    /// het beton ineens weg en zákt het moment. Dat is de reden dat de
    /// BGT-tak van [`ei_secant`] niet met dat model rekent maar met (7.18)
    /// tussen twee gladde modellen interpoleert. Deze test legt het
    /// verschijnsel vast, zodat het niet later als "bug" wordt wegbeschermd.
    #[test]
    fn brosse_trekafkap_geeft_een_terugval_in_m_kappa() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::MeanValues, 0.0); // trektak tot f_ctm
        let o = MnKappaOptions::default();
        let mut top = f64::MIN;
        let mut na_de_top = f64::MAX;
        let mut kap = 1e-5;
        while kap < 1.2e-3 {
            if let Some(st) = crate::mnkappa::solve_state(&s, &lagen, &m, 0.0, kap, &o) {
                if st.m_knm > top {
                    top = st.m_knm;
                    na_de_top = f64::MAX;
                } else {
                    na_de_top = na_de_top.min(st.m_knm);
                }
            }
            kap += 1e-5;
        }
        println!("brosse trektak: top {top:.1} kNm, terugval tot {na_de_top:.1} kNm");
        assert!(top > 30.0, "top = {top}");
        assert!(na_de_top < 0.8 * top, "geen terugval: {na_de_top} na {top}");
        // De gladde modellen die (7.18) gebruikt kennen die terugval niet.
        for tension in [ConcreteTension::None, ConcreteTension::LinearUncracked] {
            let glad = m.with_concrete_tension(tension);
            let mut vorige = f64::MIN;
            let mut kap = 1e-5;
            while kap < 1.2e-3 {
                let st = crate::mnkappa::solve_state(&s, &lagen, &glad, 0.0, kap, &o).unwrap();
                assert!(st.m_knm > vorige, "{tension:?} daalt bij κ = {kap}");
                vorige = st.m_knm;
                kap += 1e-5;
            }
        }
    }

    /// Bij M = M₀ is de kromming exact nul, ook bij een asymmetrische korf
    /// onder druk — dáár zit de valkuil.
    #[test]
    fn kappa_is_nul_bij_m_gelijk_m0() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let o = MnKappaOptions::default();
        for n in [0.0_f64, -800.0] {
            let m0 = m0_knm(&s, &lagen, &m, n, 1.0, &o).unwrap();
            let k = kappa_from_nm(&s, &lagen, &m, n, m0, &o).unwrap();
            assert!(k.kappa_per_m.abs() < 1e-12, "N = {n}: κ = {}", k.kappa_per_m);
        }
    }

    /// De kleinste wortel: vlak onder de top van het M-κ-diagram zijn er twee
    /// krommingen met hetzelfde moment. `kappa_from_nm` moet de kleinste
    /// leveren — de stabiele, bereikbare toestand.
    #[test]
    fn kappa_from_nm_neemt_de_kleinste_wortel() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let o = MnKappaOptions::default();
        // Zoek een moment dat op twee krommingen wordt gedragen: loop het
        // diagram af en vind de top.
        let mut top = (0.0_f64, f64::MIN);
        let mut kap = 1e-4;
        while kap < 0.12 {
            if let Some(st) = crate::mnkappa::solve_state(&s, &lagen, &m, -400.0, kap, &o) {
                if st.m_knm > top.1 {
                    top = (kap, st.m_knm);
                }
            }
            kap += 1e-3;
        }
        assert!(top.1 > 0.0, "geen top gevonden");
        // Een moment net onder de top; er is dan een wortel vóór en een ná de top.
        let doel = 0.995 * top.1;
        let na_de_top =
            crate::mnkappa::solve_state(&s, &lagen, &m, -400.0, top.0 + 0.02, &o).map(|st| st.m_knm);
        assert!(na_de_top.map(|v| v < doel).unwrap_or(true), "diagram daalt niet: {na_de_top:?}");
        let k = kappa_from_nm(&s, &lagen, &m, -400.0, doel, &o).unwrap();
        assert!(k.kappa_per_m < top.0, "κ = {} ≥ top {}", k.kappa_per_m, top.0);
        assert_relative_eq!(k.state.m_knm, doel, max_relative = 1e-6);
    }

    /// Een moment boven de weerstand levert een nette fout en géén getal.
    #[test]
    fn onbereikbaar_moment_levert_een_fout() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let o = MnKappaOptions::default();
        assert_eq!(
            kappa_from_nm(&s, &lagen, &m, 0.0, 10_000.0, &o).unwrap_err(),
            StiffnessError::MomentNotReached
        );
        // En te veel druk levert AxialCapacityExceeded.
        assert_eq!(
            kappa_from_nm(&s, &lagen, &m, -50_000.0, 10.0, &o).unwrap_err(),
            StiffnessError::AxialCapacityExceeded
        );
    }

    // ── Scheurmoment ──────────────────────────────────────────────────────

    /// M_cr = (f_ctm − N/A_c)·W_c, met de normaalkracht erin.
    #[test]
    fn scheurmoment_met_de_normaalkracht_erin() {
        let s = doorsnede();
        // W_c = 300·500²/6 = 12,5·10⁶ mm³; A_c = 150 000 mm².
        let w = 300.0 * 500.0 * 500.0 / 6.0;
        assert_relative_eq!(w, 12.5e6);
        // Zonder normaalkracht: 2,9·12,5·10⁶ = 36,25 kNm.
        assert_relative_eq!(m_cr_knm(&s, 2.9, 0.0, 1.0), 36.25, max_relative = 1e-12);
        // Met 750 kN druk: σ_N = −5,0 N/mm² → (2,9 + 5,0)·12,5·10⁶ = 98,75 kNm.
        assert_relative_eq!(m_cr_knm(&s, 2.9, -750.0, 1.0), 98.75, max_relative = 1e-12);
        // Met 300 kN trek: σ_N = +2,0 → (2,9 − 2,0)·12,5·10⁶ = 11,25 kNm.
        assert_relative_eq!(m_cr_knm(&s, 2.9, 300.0, 1.0), 11.25, max_relative = 1e-12);
        // Zoveel trek dat de doorsnede al zonder moment scheurt: 0.
        assert_relative_eq!(m_cr_knm(&s, 2.9, 600.0, 1.0), 0.0);
        // Het teken volgt het frame.
        assert_relative_eq!(m_cr_knm(&s, 2.9, -750.0, -1.0), -98.75, max_relative = 1e-12);
    }

    // ── EI ────────────────────────────────────────────────────────────────

    /// **In de UGT bestaat er geen ongescheurde tak.** 5.8.6(5) staat toe de
    /// betontrek te verwaarlozen en dat is hier gedaan, dus zodra er een
    /// moment op staat draagt de trekzijde niets meer — ook bij M → 0. De
    /// secante stijfheid is dan meteen die van de gescheurde doorsnede en
    /// niet E_cd·I_c. Dat is geen fout maar de prijs van 5.8.6(5); wie de
    /// ongescheurde stijfheid nodig heeft, moet de BGT-variant nemen, en de
    /// vergelijkingswaarde E_c·I_c staat daarom apart in het antwoord.
    #[test]
    fn ugt_kent_geen_ongescheurde_tak_want_geen_betontrek() {
        let s = doorsnede();
        let lagen = korf_sym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let i_c = 300.0 * 500.0_f64.powi(3) / 12.0;
        let r = ei_secant(&s, &lagen, &m, 0.0, 0.05, &opts()).unwrap();
        println!(
            "UGT, M = 0,05 kNm: EI = {:.1} MNm²; E_cd·I_c = {:.1} MNm²; E_cm·I_c = {:.1} MNm²",
            r.ei_mnm2(),
            r.ei_uncracked_knm2 * 1e-3,
            33_000.0 * i_c * 1e-9 * 1e-3
        );
        assert!(r.ei_knm2 < 0.5 * r.ei_uncracked_knm2, "EI = {}", r.ei_knm2);
        assert_relative_eq!(r.ei_uncracked_knm2, 27_500.0 * i_c * 1e-9, max_relative = 1e-12);
        assert_eq!(r.basis, NonlinearBasis::DesignValues);
        assert_relative_eq!(r.phi_ef, 0.0);
        assert!(r.tension_stiffening.is_none()); // 5.8.6(5)

        // Staat de hele doorsnede onder druk, dan is er geen trekzone en komt
        // EI wél in de buurt van de ongescheurde waarde — omlaag getrokken
        // door de raaklijn van (3.14), die bij die drukrek al onder de
        // begintangens 1,05·E_cd ligt.
        let druk = ei_secant(&s, &lagen, &m, -1500.0, 1.0, &opts()).unwrap();
        println!(
            "UGT, N = −1500 kN, M = 1 kNm: EI = {:.1} MNm² ({:.0} % van E_cd·I_c)",
            druk.ei_mnm2(),
            100.0 * druk.ei_knm2 / druk.ei_uncracked_knm2
        );
        assert!(druk.ei_knm2 > 3.0 * r.ei_knm2, "EI = {}", druk.ei_knm2);
        assert!(druk.ei_knm2 < 1.05 * druk.ei_uncracked_knm2);
    }

    /// **De kern van de opdracht, in getallen.** Hetzelfde moment, dezelfde
    /// doorsnede, twee diagrammen: het parabool-rechthoekdiagram van 3.1.7
    /// (dat de doorsnedetoetsing gebruikt) tegen (3.14) van 3.1.5 met f_cd en
    /// E_cd (dat 5.8.6(3) voor de constructieve berekening voorschrijft).
    /// (3.14) is overal stijver — een raamwerk dat met het verkeerde diagram
    /// rekent, krijgt een te slappe staaf.
    ///
    /// De maat van het verschil hangt sterk af van de normaalkracht. Zonder
    /// normaalkracht is de doorsnede gescheurd en wordt de stijfheid bepaald
    /// door de wapening en de hoogte van de drukzone; het betondiagram doet
    /// er dan maar een paar procent toe. Staat de doorsnede onder druk en is
    /// hij nog niet gescheurd, dan telt de betonstijfheid vol mee en loopt
    /// het verschil op naar de verhouding van de begintangensen,
    /// 1,05·E_cd/(f_cd·n/ε_c2) = 28 875/20 000 = 1,44.
    #[test]
    fn vgl_3_14_is_stijver_dan_het_parabool_rechthoekdiagram() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let o = MnKappaOptions::default();
        let pr = DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        );
        let nl = mat(NonlinearBasis::DesignValues, 0.0);
        let ei = |m: &DesignMaterial, n: f64, mm: f64| {
            let m0 = m0_knm(&s, &lagen, m, n, 1.0, &o).unwrap();
            let k = kappa_from_nm(&s, &lagen, m, n, mm, &o).unwrap();
            (mm - m0) / k.kappa_per_m * 1e-3
        };
        println!("  N [kN]   M [kNm]   EI 3.1.7 [MNm²]   EI (3.14) [MNm²]   verhouding");
        let mut grootste = 1.0_f64;
        for (n, mm) in [
            (0.0, 10.0),
            (0.0, 30.0),
            (0.0, 60.0),
            (0.0, 90.0),
            (-250.0, 12.0),
            (-400.0, 30.0),
            (-600.0, 25.0),
            (-800.0, 20.0),
            (-1500.0, 5.0),
            (-2000.0, 5.0),
        ] {
            let ei_pr = ei(&pr, n, mm);
            let ei_nl = ei(&nl, n, mm);
            println!("{n:>8.0} {mm:>9.1} {ei_pr:>17.1} {ei_nl:>18.1} {:>12.3}", ei_nl / ei_pr);
            assert!(ei_nl > ei_pr, "N = {n}, M = {mm}: (3.14) is niet stijver");
            grootste = grootste.max(ei_nl / ei_pr);
        }
        // Onder druk loopt het verschil op tot in de buurt van de verhouding
        // van de begintangensen (1,44).
        assert!(grootste > 1.3, "grootste verhouding = {grootste}");
    }

    /// EI daalt monotoon met het moment zodra de doorsnede scheurt.
    #[test]
    fn ei_daalt_monotoon_boven_het_scheurmoment() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let mut vorige = f64::INFINITY;
        println!("  M [kNm]   κ [1/m]     EI [MNm²]  gescheurd  methode  iteraties");
        for mm in [5.0_f64, 20.0, 40.0, 60.0, 80.0, 100.0, 110.0] {
            let r = ei_secant(&s, &lagen, &m, 0.0, mm, &opts()).unwrap();
            println!(
                "{:>9.1} {:>10.3e} {:>12.1}  {:>9}  {:?}  {}",
                mm,
                r.kappa_per_m,
                r.ei_mnm2(),
                r.cracked,
                r.method,
                r.iterations
            );
            assert!(r.ei_knm2 < vorige, "EI stijgt bij M = {mm}");
            assert!(r.ei_knm2 > 0.0);
            // De snelle weg wordt ook echt genomen: Newton, in een handvol
            // stappen. Slaat dat om naar de terugval, dan is dat zichtbaar.
            assert_eq!(r.method, SolveMethod::Newton, "M = {mm}");
            assert!(r.iterations <= 20, "M = {mm}: {} iteraties", r.iterations);
            vorige = r.ei_knm2;
        }
    }

    /// EI is positief bij een **negatief** moment, en de M₀-correctie is daar
    /// niet symmetrisch: bij een asymmetrische korf onder druk verschilt |EI|
    /// tussen een positief en een negatief moment.
    #[test]
    fn ei_is_positief_bij_negatief_moment() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        // 2Ø12 boven draagt als trekwapening minder dan 3Ø16 onder: de
        // negatieve momentweerstand is ongeveer 40 % van de positieve, dus
        // het toetsmoment moet daaronder blijven.
        for n in [0.0_f64, -400.0] {
            let plus = ei_secant(&s, &lagen, &m, n, 30.0, &opts()).unwrap();
            let min = ei_secant(&s, &lagen, &m, n, -30.0, &opts()).unwrap();
            assert!(plus.ei_knm2 > 0.0 && min.ei_knm2 > 0.0);
            assert!(plus.kappa_per_m > 0.0 && min.kappa_per_m < 0.0);
            assert!(plus.m0_knm.is_finite() && min.m0_knm.is_finite());
            println!(
                "N = {n} kN: EI(+30) = {:.1} MNm², EI(−30) = {:.1} MNm²",
                plus.ei_mnm2(),
                min.ei_mnm2()
            );
        }
        // Zonder normaalkracht is de doorsnede duidelijk gescheurd en telt de
        // asymmetrie van de korf: de negatieve richting is dan aantoonbaar
        // slapper. Onder druk is de doorsnede nog nauwelijks gescheurd en is
        // het verschil verwaarloosbaar — daar zou zo'n eis niets betekenen.
        let plus = ei_secant(&s, &lagen, &m, 0.0, 30.0, &opts()).unwrap();
        let min = ei_secant(&s, &lagen, &m, 0.0, -30.0, &opts()).unwrap();
        assert!(min.ei_knm2 < 0.85 * plus.ei_knm2, "{} vs {}", min.ei_knm2, plus.ei_knm2);
    }

    /// Een kolom met normaalkracht en zonder moment valt precies op M = M₀:
    /// κ = 0 en de secans is als 0/0 onbepaald. Er moet dan een eindige,
    /// zinnige stijfheid uit komen — de limietwaarde — en geen oneindig of
    /// een NaN. Bij de **symmetrische** korf is M₀ = 0 en valt M = 0 er
    /// precies op; bij de **asymmetrische** korf ligt het punt bij M = M₀ ≠ 0
    /// en zou een implementatie die naar M = 0 kijkt het missen.
    #[test]
    fn kappa_nul_geeft_de_limietstijfheid_en_geen_oneindig() {
        let s = doorsnede();
        let o = MnKappaOptions::default();
        for basis in [NonlinearBasis::DesignValues, NonlinearBasis::MeanValues] {
            let m = mat(basis, 0.0);
            // Symmetrisch: M₀ = 0, dus M = 0 is het ontaarde punt.
            let sym = korf_sym().layers(s.h_mm);
            let r = ei_secant(&s, &sym, &m, -800.0, 0.0, &opts()).unwrap();
            println!("{basis:?} symmetrisch, N = −800, M = 0: EI = {:.1} MNm²", r.ei_mnm2());
            assert_relative_eq!(r.kappa_per_m, 0.0);
            assert!(r.ei_knm2.is_finite() && r.ei_knm2 > 0.0);
            assert!(r.ei_knm2 < 1.1 * r.ei_uncracked_knm2);
            // De limiet sluit aan op een klein maar eindig moment.
            let bijna = ei_secant(&s, &sym, &m, -800.0, 0.5, &opts()).unwrap();
            assert_relative_eq!(r.ei_knm2, bijna.ei_knm2, max_relative = 0.02);

            // Asymmetrisch: het ontaarde punt ligt bij M = M₀ ≠ 0.
            let asym = korf_asym().layers(s.h_mm);
            let m0 = m0_knm(&s, &asym, &m, -800.0, 1.0, &o).unwrap();
            assert!(m0 < -1.0);
            let r = ei_secant(&s, &asym, &m, -800.0, m0, &opts()).unwrap();
            println!(
                "{basis:?} asymmetrisch, N = −800, M = M₀ = {m0:.2}: EI = {:.1} MNm²",
                r.ei_mnm2()
            );
            assert!(r.kappa_per_m.abs() < 1e-12);
            assert!(r.ei_knm2.is_finite() && r.ei_knm2 > 0.0);
            let bijna = ei_secant(&s, &asym, &m, -800.0, m0 + 0.5, &opts()).unwrap();
            assert_relative_eq!(r.ei_knm2, bijna.ei_knm2, max_relative = 0.02);
        }
    }

    /// Zonder M₀-correctie zou EI bij een asymmetrische korf onder druk
    /// aantoonbaar fout zijn. Deze test legt vast hoe groot de fout is, zodat
    /// een latere vereenvoudiging naar EI = M/κ meteen opvalt.
    #[test]
    fn m0_correctie_maakt_bij_druk_een_meetbaar_verschil() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::DesignValues, 0.0);
        let r = ei_secant(&s, &lagen, &m, -800.0, 20.0, &opts()).unwrap();
        let zonder = r.m_knm / r.kappa_per_m;
        println!(
            "N = −800 kN, M = 20 kNm: M₀ = {:.3} kNm, EI = {:.1} MNm², zonder correctie {:.1} MNm²",
            r.m0_knm,
            r.ei_mnm2(),
            zonder * 1e-3
        );
        assert!(r.m0_knm < -1.0);
        assert!(r.ei_knm2 > zonder * 1.15, "verschil te klein: {} vs {}", r.ei_knm2, zonder);
    }

    // ── BGT: betontrek en tension stiffening ──────────────────────────────

    /// Onder het scheurmoment is de BGT-doorsnede ongescheurd en is ζ = 0
    /// (7.4.3(3)); de stijfheid is dan die van de ongescheurde doorsnede.
    #[test]
    fn bgt_onder_het_scheurmoment_is_ongescheurd() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::MeanValues, 0.0);
        let r = ei_secant(&s, &lagen, &m, 0.0, 20.0, &opts()).unwrap();
        assert_relative_eq!(r.m_cr_knm, 36.25, max_relative = 1e-9);
        assert!(!r.cracked);
        let ts = r.tension_stiffening.expect("BGT draagt de 7.4.3-tak");
        assert_relative_eq!(ts.zeta, 0.0);
        // Ongescheurd ligt de stijfheid dicht bij E_cm·I_c (103,1 MNm²), iets
        // hoger door de wapening en de begintangens 1,05·E_cm.
        println!("BGT ongescheurd: EI = {:.1} MNm² (E_cm·I_c = {:.1})", r.ei_mnm2(), r.ei_uncracked_knm2 * 1e-3);
        assert!(r.ei_mnm2() > 103.1 && r.ei_mnm2() < 125.0);
    }

    /// Boven het scheurmoment interpoleert (7.18) tussen de ongescheurde en
    /// de volledig gescheurde kromming, en ligt het antwoord er dus tussenin.
    #[test]
    fn bgt_boven_het_scheurmoment_interpoleert_7_18() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::MeanValues, 0.0);
        let r = ei_secant(&s, &lagen, &m, 0.0, 60.0, &opts()).unwrap();
        assert!(r.cracked);
        let ts = r.tension_stiffening.unwrap();
        assert!(ts.zeta > 0.0 && ts.zeta < 1.0, "ζ = {}", ts.zeta);
        assert!(ts.kappa_cracked_per_m > ts.kappa_uncracked_per_m);
        assert!(r.kappa_per_m > ts.kappa_uncracked_per_m);
        assert!(r.kappa_per_m < ts.kappa_cracked_per_m);
        // (7.19) letterlijk nagerekend.
        assert_relative_eq!(
            ts.zeta,
            1.0 - ts.beta * (ts.sigma_sr / ts.sigma_s).powi(2),
            max_relative = 1e-9
        );
        assert!(ts.sigma_sr > 0.0 && ts.sigma_s > ts.sigma_sr);
        println!(
            "BGT M = 60 kNm: ζ = {:.3}, κ_I = {:.3e}, κ_II = {:.3e}, κ = {:.3e}, EI = {:.1} MNm²",
            ts.zeta, ts.kappa_uncracked_per_m, ts.kappa_cracked_per_m, r.kappa_per_m, r.ei_mnm2()
        );
    }

    /// β van (7.19): 1,0 bij een enkele kortdurende belasting, 0,5 bij
    /// aanhoudende of herhaalde belasting. In ζ = 1 − β·(σ_sr/σ_s)² geeft de
    /// kleinere β een **grotere** ζ, dus meer gewicht op de volledig
    /// gescheurde toestand en een slappere doorsnede. Dat is de bedoeling:
    /// bij aanhoudende belasting gaat de gunstige werking van de betontrek
    /// tussen de scheuren verloren.
    #[test]
    fn beta_van_7_19_werkt_de_goede_kant_op() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let m = mat(NonlinearBasis::MeanValues, 0.0);
        let kort = ei_secant(
            &s,
            &lagen,
            &m,
            0.0,
            60.0,
            &StiffnessOptions { load_duration: LoadDuration::ShortTerm, ..opts() },
        )
        .unwrap();
        let lang = ei_secant(
            &s,
            &lagen,
            &m,
            0.0,
            60.0,
            &StiffnessOptions { load_duration: LoadDuration::Sustained, ..opts() },
        )
        .unwrap();
        assert_relative_eq!(kort.tension_stiffening.unwrap().beta, 1.0);
        assert_relative_eq!(lang.tension_stiffening.unwrap().beta, 0.5);
        assert!(lang.tension_stiffening.unwrap().zeta > kort.tension_stiffening.unwrap().zeta);
        assert!(lang.ei_knm2 < kort.ei_knm2);
        // ζ blijft in beide gevallen tussen 0 en 1.
        for r in [&kort, &lang] {
            let z = r.tension_stiffening.unwrap().zeta;
            assert!((0.0..=1.0).contains(&z), "ζ = {z}");
        }
    }

    /// De UGT kent géén betontrek en géén tension stiffening (5.8.6(5)), de
    /// BGT wel. Bij hetzelfde moment is de BGT dus stijver.
    #[test]
    fn ugt_en_bgt_verschillen_zoals_de_tabel_zegt() {
        let s = doorsnede();
        let lagen = korf_asym().layers(s.h_mm);
        let ugt = ei_secant(&s, &lagen, &mat(NonlinearBasis::DesignValues, 0.0), 0.0, 60.0, &opts()).unwrap();
        let bgt = ei_secant(&s, &lagen, &mat(NonlinearBasis::MeanValues, 0.0), 0.0, 60.0, &opts()).unwrap();
        assert_eq!(ugt.basis, NonlinearBasis::DesignValues);
        assert_eq!(bgt.basis, NonlinearBasis::MeanValues);
        assert!(ugt.tension_stiffening.is_none());
        assert!(bgt.tension_stiffening.is_some());
        assert!(bgt.ei_knm2 > ugt.ei_knm2, "BGT {} vs UGT {}", bgt.ei_knm2, ugt.ei_knm2);
        println!("M = 60 kNm: EI_UGT = {:.1} MNm², EI_BGT = {:.1} MNm²", ugt.ei_mnm2(), bgt.ei_mnm2());
    }

    /// Kruip: φ_ef staat in de uitvoer, ook als hij nul is, en een grotere
    /// φ_ef geeft een slappere doorsnede (5.8.6(4)).
    #[test]
    fn kruip_staat_in_de_uitvoer_en_verslapt() {
        let s = doorsnede();
        let lagen = korf_sym().layers(s.h_mm);
        let zonder = ei_secant(&s, &lagen, &mat(NonlinearBasis::DesignValues, 0.0), 0.0, 40.0, &opts()).unwrap();
        let met = ei_secant(&s, &lagen, &mat(NonlinearBasis::DesignValues, 2.0), 0.0, 40.0, &opts()).unwrap();
        assert_relative_eq!(zonder.phi_ef, 0.0);
        assert_relative_eq!(met.phi_ef, 2.0);
        assert!(met.ei_knm2 < zonder.ei_knm2, "{} vs {}", met.ei_knm2, zonder.ei_knm2);
    }

    /// Zonder (3.14)-kromme weigert `ei_secant`: het parabool-rechthoek-
    /// diagram is het diagram van de doorsnedetoetsing, niet van de
    /// constructieve berekening.
    #[test]
    fn zonder_3_14_kromme_weigert_de_stijfheidsberekening() {
        let s = doorsnede();
        let lagen = korf_sym().layers(s.h_mm);
        let m = DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        );
        assert_eq!(
            ei_secant(&s, &lagen, &m, 0.0, 40.0, &opts()).unwrap_err(),
            StiffnessError::NoNonlinearCurve
        );
    }
}
