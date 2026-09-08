//! §6.2 Dwarskracht — V_Rd,c (6.2.a/6.2.b) en het vakwerkmodel (6.8)/(6.9).
//!
//! De norm toetst de dwarskracht in **twee sporen die elkaar uitsluiten**:
//!
//! 1. **Geen berekende dwarskrachtwapening.** Zolang V_Ed ≤ V_Rd,c is er
//!    volgens 6.2.1(3) geen berekende dwarskrachtwapening nodig. V_Rd,c volgt
//!    uit (6.2.a) *met een minimum van* (6.2.b) — dus de **grootste** van
//!    beide, niet de kleinste.
//! 2. **Vakwerkmodel.** Zodra V_Ed > V_Rd,c komt de weerstand volgens 6.2.3
//!    uitsluitend uit het vakwerk: V_Rd = min(V_Rd,s (6.8); V_Rd,max (6.9)).
//!
//! **De betonbijdrage wordt in spoor 2 NIET opgeteld.** Dat is geen
//! implementatiekeuze maar de systematiek van 6.2.3: (6.8) en (6.9) staan
//! zonder betonterm in de norm, en 6.2.3(3) noemt V_Rd "de kleinste waarde
//! van" die twee. Wie V_Rd = V_Rd,c + V_Rd,s rekent, rekent onveilig.
//!
//! ## Wat hier is overgenomen, en waar het staat
//!
//! De normtekst is gelezen uit de PDF-uitgave. De tekstlaag van die uitgave
//! plakt woorden aaneen en laat formulebeelden weg; wat niet in de tekstlaag
//! stond is van de op 200 dpi gerenderde bladzijde afgelezen. Per grootheid:
//!
//! | grootheid | vindplaats | hoe gelezen |
//! |---|---|---|
//! | (6.2.a), (6.2.b), (6.3N) | 6.2.2(1) + OPMERKING | tekstlaag, letterlijk |
//! | k = 1 + √(200/d) ≤ 2,0 | 6.2.2(1) | gerenderde bladzijde 111 |
//! | ρ_l = A_sl/(b_w·d) ≤ 0,02 | 6.2.2(1) | gerenderde bladzijde 111 |
//! | σ_cp = N_Ed/A_c < 0,2·f_cd | 6.2.2(1) | gerenderde bladzijde 111 |
//! | C_Rd,c = 0,18/γ_C, v_min, k₁ = 0,15 | NB bij 6.2.2(1) | tekstlaag, letterlijk |
//! | (6.5) en ν = 0,6[1 − f_ck/250] | 6.2.2(6) + NB | tekstlaag, letterlijk |
//! | β = a_v/2d en zijn voorwaarden | 6.2.2(6) | tekstlaag, letterlijk |
//! | z = 0,9·d "zonder normaalkracht" | 6.2.3(1) | tekstlaag, letterlijk |
//! | 1,0 ≤ cot θ ≤ 2,5 | NB bij 6.2.3(2) | tekstlaag, letterlijk |
//! | (6.8) V_Rd,s = (A_sw/s)·z·f_ywd·cot θ | 6.2.3(3) | gerenderde bladzijde 115 |
//! | (6.9) V_Rd,max = α_cw·b_w·z·ν₁·f_cd/(cot θ + tan θ) | 6.2.3(3) | tekstlaag, letterlijk |
//! | ν₁ = ν, α_cw = 1 (niet voorgespannen) | NB bij 6.2.3(3) | tekstlaag, letterlijk |
//! | (6.12) A_sw,max·f_ywd/(b_w·s) ≤ ½·α_cw·ν₁·f_cd | 6.2.3(3) OPM. 4 | zie hieronder |
//! | (6.18) ΔF_td = 0,5·V_Ed·(cot θ − cot α) | 6.2.3(7) | tekstlaag, letterlijk |
//!
//! (6.12) staat in de PDF als formulebeeld. Zij is hier niet uit het hoofd
//! opgeschreven maar **afgeleid uit (6.8) en (6.9)**, die beide wél zijn
//! gelezen: gelijkstellen bij cot θ = 1 geeft
//! (A_sw/s)·z·f_ywd = α_cw·b_w·z·ν₁·f_cd/2, en delen door b_w geeft precies
//! A_sw·f_ywd/(b_w·s) = ½·α_cw·ν₁·f_cd. Dat de norm dezelfde uitkomst geeft,
//! is daarmee een controle op (6.8) en (6.9) zelf.
//!
//! ## Wat deze module NIET doet
//!
//! * **6.2.1(8)** — de verlichting binnen een afstand d vanaf de dagkant van
//!   de oplegging. De normtekst is compleet ("Voor elementen die voornamelijk
//!   zijn belast door gelijkmatig verdeelde belastingen hoeft de
//!   dwarskrachtweerstand niet te zijn gecontroleerd binnen een afstand d
//!   vanaf de dagkant van de oplegging"), maar zij gaat over de vraag wélke
//!   doorsnede je toetst, en die vraag ligt buiten deze doorsnedetoets: er is
//!   hier geen opleggingsgeometrie en geen belastingbeeld. De toets rekent dus
//!   met de aangeboden V_Ed en blijft daarmee **op de veilige kant** — bij de
//!   oplegging is V_Ed het grootst. De bijbehorende eis dat V_Ed bij de
//!   oplegging niet groter is dan V_Rd,max blijft staan en wordt hier op de
//!   aangeboden doorsnede getoetst.
//! * **6.2.3(8)** — dezelfde β = a_v/2d, maar dan voor het *dimensioneren* van
//!   de wapening, met voorwaarde (6.19) V_Ed ≤ A_sw·f_ywd·sin α over het
//!   middendeel 0,75·a_v. Dat middendeel is een lengtemaat langs de staaf; de
//!   korf kent geen verdeling over de lengte. Niet gebouwd.
//! * **(6.4)** — de ongescheurde-doorsnedeformule geldt uitsluitend voor vrij
//!   opgelegde **voorgespannen** elementen; voorspanning zit niet in dit model.
//! * **(6.10.aN)/(6.10.bN)** — de verlaagde ν₁ mág worden gebruikt als de
//!   spanning in de dwarskrachtwapening kleiner is dan 80 % van f_yk, maar de
//!   OPMERKING onder (6.8) eist dan tegelijk f_ywd ≤ 0,8·f_ywk. Dat is een
//!   gekoppelde keuze met een kringverwijzing (de spanning volgt uit de
//!   berekening die je ermee wilt maken); hier is steeds ν₁ = ν aangehouden,
//!   de door de NB voorgeschreven waarde.
//! * **§6.2.4** (afschuiving lijf–flens) en **§6.2.5** (aansluitvlak van op
//!   verschillende tijdstippen gestort beton) zijn eigen toetsen en staan hier
//!   niet in. Bij een T-doorsnede is de dwarskrachttoets daarmee niet compleet.
//! * **§9.2.2** — ρ_w,min, s_l,max, s_t,max en de minimale beugeldiameter zijn
//!   detailleringseisen en horen in de beugelmodule, niet hier.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, Deelstap, ResistanceCalc, UnityCheck};

use crate::deelstappen::{lx, nl, nv, stap};
use crate::section::{ConcreteSection, ReinforcementCage, ShearReinforcement, STIRRUP_ALPHA_DEG};
use crate::stress_strain::DesignMaterial;

// ── Nationaal bepaalde parameters ─────────────────────────────────────────────

/// k₁ in (6.2.a) en (6.2.b) — NB bij 6.2.2(1): "De waarde van k₁ moet gelijk
/// aan 0,15 zijn genomen."
pub const K1_NB: f64 = 0.15;

/// Bovengrens van de schaalfactor k, 6.2.2(1): k = 1 + √(200/d) ≤ 2,0.
/// Bindend: elke doorsnede met d ≤ 200 mm krijgt k = 2,0.
pub const K_MAX: f64 = 2.0;

/// Bovengrens van de wapeningsverhouding, 6.2.2(1): ρ_l ≤ 0,02.
pub const RHO_L_MAX: f64 = 0.02;

/// Bovengrens van de normaaldrukspanning in 6.2.2(1): σ_cp < 0,2·f_cd.
pub const SIGMA_CP_FACTOR: f64 = 0.2;

/// Ondergrens van cot θ — NB bij 6.2.3(2): "De grenswaarden van cot θ zijn
/// 1,0 ≤ cot θ ≤ 2,5."
pub const COT_THETA_MIN: f64 = 1.0;

/// Bovengrens van cot θ — zelfde NB-bepaling.
pub const COT_THETA_MAX: f64 = 2.5;

/// α_cw voor niet-voorgespannen constructies — NB bij 6.2.3(3): "De waarde van
/// α_cw moet gelijk zijn genomen aan: α_cw = 1 voor niet-voorgespannen
/// constructies; …".
///
/// De drie andere takken van de NB — (1 + σ_cp/f_cd), 1,25 en 2,5(1 − σ_cp/f_cd)
/// — horen bij een σ_cp uit **voorspanning**. Deze crate kent geen
/// voorspanning: er is nergens een voorspanelement, een voorspankracht of een
/// verliesberekening. α_cw is daarom vast 1,0. Dat is bovendien de veilige
/// kant, want de tweede en derde tak leveren α_cw ≥ 1 op.
pub const ALPHA_CW_NIET_VOORGESPANNEN: f64 = 1.0;

/// C_Rd,c — NB bij 6.2.2(1): "De waarde van C_Rd,c moet gelijk aan 0,18/γ_C
/// zijn genomen."
///
/// De norm geeft de **uitdrukking**, niet het getal. Met γ_C = 1,5 (blijvend en
/// tijdelijk) volgt 0,12; met γ_C = 1,2 (buitengewoon) volgt 0,15. Wie 0,12
/// vastlegt, rekent een buitengewone ontwerpsituatie te laag.
pub fn c_rd_c(gamma_c: f64) -> f64 {
    0.18 / gamma_c
}

/// Schaalfactor k = 1 + √(200/d) ≤ 2,0 (6.2.2(1), d in mm).
///
/// Levert (k, begrensd) — of de bovengrens werkelijk bond, zodat de afleiding
/// dat kan melden in plaats van een getal te tonen dat niet uit de formule
/// volgt.
pub fn k_factor(d_mm: f64) -> (f64, bool) {
    let ruw = 1.0 + (200.0 / d_mm).sqrt();
    if ruw > K_MAX {
        (K_MAX, true)
    } else {
        (ruw, false)
    }
}

/// v_min volgens (6.3N) = 0,035·k^(3/2)·f_ck^(1/2), met f_ck in MPa.
///
/// NB bij 6.2.2(1): "De waarde van v_min moet gelijk aan 0,035 k^{3/2} · f_ck^{1/2}
/// zijn genomen." Empirische formule: k dimensieloos, f_ck in MPa, uitkomst in MPa.
pub fn v_min_mpa(k: f64, f_ck: f64) -> f64 {
    0.035 * k.powf(1.5) * f_ck.sqrt()
}

/// ν volgens (6.6N) = 0,6·[1 − f_ck/250], met f_ck in MPa.
///
/// NB bij 6.2.2(6): "De waarde van ν moet gelijk aan 0,6[1 − f_ck/250] zijn
/// genomen." NB bij 6.2.3(3): "De waarde van ν₁ moet gelijk aan ν zijn
/// genomen." Eén functie voor beide dus.
pub fn nu_gescheurd_beton(f_ck: f64) -> f64 {
    0.6 * (1.0 - f_ck / 250.0)
}

/// De inwendige hefboomsarm die 6.2.3(1) toestaat: z = 0,9·d.
///
/// Alleen "in de dwarskrachtberekening van gewapend beton **zonder
/// normaalkracht**"; zie [`ShearOptions::z_mm`].
pub fn z_0_9d(d_mm: f64) -> f64 {
    0.9 * d_mm
}

// ── Invoer ────────────────────────────────────────────────────────────────────

/// Een last die volgens 6.2.2(6) dicht bij het steunpunt aangrijpt.
///
/// De norm laat de bijdrage van zo'n last aan V_Ed vermenigvuldigen met
/// β = a_v/2d. Dat mag **alleen** voor het toetsen van V_Rd,c in (6.2.a), en
/// alleen als de langswapening volledig is verankerd bij de oplegging. Beide
/// gegevens moeten van de aanroeper komen: een doorsnedetoets weet niet waar de
/// lasten staan en of de wapening verankerd is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LastNabijSteunpunt {
    /// a_v — afstand van de rand van de oplegging (of het midden van flexibel
    /// oplegmateriaal) tot de last, mm.
    pub a_v_mm: f64,
    /// Het deel van V_Ed dat dóór deze last wordt veroorzaakt, kN, absoluut.
    ///
    /// Alleen dít deel wordt met β verminderd. De reductie op de hele V_Ed-lijn
    /// toepassen is de klassieke fout: de norm vermindert "de bijdrage van deze
    /// belasting aan de dwarskracht V_Ed".
    pub bijdrage_kn: f64,
    /// Bevestiging dat de langswapening volledig is verankerd bij de oplegging
    /// (voorwaarde in 6.2.2(6)). `false` → de reductie wordt niet toegepast.
    pub langswapening_verankerd: bool,
}

/// Keuzes die de norm vrijlaat, en die de aanroeper dus moet kunnen maken.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ShearOptions {
    /// A_sl in mm² (6.2.2(1)): de trekwapening die ≥ (l_bd + d) voorbij de
    /// beschouwde doorsnede **doorloopt** (figuur 6.3).
    ///
    /// `None` → de trekwapening van de korf aan de zijde waar het moment trek
    /// geeft. Dat is binnen dít model juist — de korf kent één doorlopende rij
    /// boven en één onder, en die worden nergens gestaffeld — maar het is een
    /// aanname zodra de werkelijke wapening wél wordt afgeknipt, en dan is zij
    /// **onveilig**: bij een steunpunt is A_sl vaak veel kleiner dan A_s in het
    /// veld. De afleiding zegt dat er met zoveel woorden bij.
    pub a_sl_mm2: Option<f64>,
    /// cot θ, vrij te kiezen binnen 1,0 ≤ cot θ ≤ 2,5 (NB bij 6.2.3(2)).
    ///
    /// `None` → automatisch, zie [`CotThetaKeuze::Automatisch`]. Een waarde
    /// buiten de grenzen wordt afgekapt en dat wordt gemeld.
    pub cot_theta: Option<f64>,
    /// z in mm. `None` → 0,9·d, maar **alleen** als er geen normaalkracht is;
    /// 6.2.3(1) staat die vereenvoudiging uitsluitend toe voor "gewapend beton
    /// zonder normaalkracht". Met normaalkracht is z de werkelijke inwendige
    /// hefboomsarm bij het buigend moment in de beschouwde doorsnede, en die
    /// moet hier worden opgegeven — bijvoorbeeld uit de buigtoets. Ontbreekt
    /// hij dan, dan vervalt de vakwerktak met een leesbare reden in plaats van
    /// dat er stilzwijgend 0,9·d wordt ingevuld.
    pub z_mm: Option<f64>,
    /// 6.2.2(6) — een last dicht bij het steunpunt. `None` = niet van
    /// toepassing; de toets rekent dan met de onverminderde V_Ed en blijft op
    /// de veilige kant.
    pub nabij_steunpunt: Option<LastNabijSteunpunt>,
}

// ── Uitkomsten ────────────────────────────────────────────────────────────────

/// Welke van de twee uitdrukkingen voor V_Rd,c maatgevend was.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VrdCTak {
    /// (6.2.a) — de wapeningsafhankelijke uitdrukking.
    Formule62a,
    /// (6.2.b) — de ondergrens met v_min ("met een minimum van").
    Formule62b,
}

impl VrdCTak {
    pub fn label(&self) -> &'static str {
        match self {
            VrdCTak::Formule62a => "(6.2.a)",
            VrdCTak::Formule62b => "(6.2.b)",
        }
    }
}

/// De afleiding van V_Rd,c: elke tussenwaarde, met haar begrenzing.
#[derive(Clone, Debug, PartialEq)]
pub struct VrdC {
    pub d_mm: f64,
    pub b_w_mm: f64,
    pub a_c_mm2: f64,
    /// A_sl zoals gebruikt, mm².
    pub a_sl_mm2: f64,
    /// `true` als A_sl uit de korf is genomen en niet is opgegeven.
    pub a_sl_uit_korf: bool,
    pub rho_l: f64,
    /// `true` als ρ_l op 0,02 is afgekapt.
    pub rho_l_begrensd: bool,
    pub k: f64,
    /// `true` als k op 2,0 is afgekapt.
    pub k_begrensd: bool,
    /// σ_cp in N/mm², **druk positief** zoals 6.2.2(1) hem definieert.
    pub sigma_cp_mpa: f64,
    /// `true` als σ_cp op 0,2·f_cd is afgekapt.
    pub sigma_cp_begrensd: bool,
    pub c_rd_c: f64,
    pub k1: f64,
    pub v_min_mpa: f64,
    /// Uitkomst van (6.2.a), kN.
    pub v_6_2a_kn: f64,
    /// Uitkomst van (6.2.b), kN.
    pub v_6_2b_kn: f64,
    /// De grootste van beide, kN — en nooit negatief.
    pub v_rd_c_kn: f64,
    pub tak: VrdCTak,
    /// `true` als de grootste van beide negatief uitkwam (grote trek) en op 0
    /// is gezet.
    pub afgekapt_op_nul: bool,
}

/// Hoe cot θ tot stand is gekomen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CotThetaKeuze {
    /// Opgegeven door de aanroeper.
    Opgegeven,
    /// Opgegeven, maar buiten 1,0…2,5 en daarom afgekapt.
    OpgegevenAfgekapt,
    /// Automatisch: de **grootste** cot θ binnen 1,0…2,5 waarbij de
    /// betondrukdiagonaal nog voldoet (V_Rd,max ≥ V_Ed).
    Automatisch,
    /// Automatisch, maar zelfs bij cot θ = 1 haalt V_Rd,max het niet. Dan is
    /// cot θ = 1 aangehouden: de waarde waarbij (6.9) maximaal is.
    AutomatischDrukdiagonaalTeKlein,
    /// Er wordt geen wapening ontworpen (spoor A). cot θ = 1 aangehouden,
    /// omdat (6.9) daar maximaal is en V_Rd,max hier alleen als bovengrens van
    /// 6.2.1(6) dient.
    SpoorZonderWapening,
}

/// Welke tak van het vakwerkmodel maatgevend was.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VakwerkTak {
    /// (6.8) — de dwarskrachtwapening vloeit.
    WapeningVloeit,
    /// (6.9) — de betondrukdiagonaal bezwijkt.
    DrukdiagonaalBezwijkt,
}

/// Waar f_ywd vandaan komt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FywdBron {
    /// Dezelfde staalsoort als de langswapening: f_ywd = f_yd.
    ZelfdeAlsLangswapening,
    /// Eigen beugelkwaliteit: f_ywd = f_ywk/γ_S.
    EigenFywk,
}

/// De afleiding van het vakwerkmodel (6.2.3).
///
/// `v_rd_s_kn` is `None` zolang de beugelgegevens ontbreken — dan is alleen
/// V_Rd,max te bepalen, want die hangt niet van de wapening af.
#[derive(Clone, Debug, PartialEq)]
pub struct Vakwerk {
    pub z_mm: f64,
    /// `true` als z = 0,9·d is aangehouden (6.2.3(1)), `false` als z is opgegeven.
    pub z_is_0_9d: bool,
    pub cot_theta: f64,
    pub theta_deg: f64,
    pub cot_theta_keuze: CotThetaKeuze,
    pub nu1: f64,
    pub alpha_cw: f64,
    pub alpha_deg: f64,
    /// V_Rd,max volgens (6.9), kN.
    pub v_rd_max_kn: f64,
    /// A_sw/s in mm²/mm, `None` zonder beugelgegevens.
    pub a_sw_per_s_mm: Option<f64>,
    pub a_sw_mm2: Option<f64>,
    pub s_mm: Option<f64>,
    pub legs: Option<u32>,
    pub f_ywd_mpa: Option<f64>,
    pub f_ywd_bron: Option<FywdBron>,
    /// V_Rd,s volgens (6.8), kN. `None` zonder beugelgegevens.
    pub v_rd_s_kn: Option<f64>,
    /// Waarom V_Rd,s niet is bepaald.
    pub v_rd_s_reden: Option<String>,
    /// min(V_Rd,s; V_Rd,max), kN. Zonder beugels gelijk aan `None`.
    pub v_rd_kn: Option<f64>,
    pub tak: Option<VakwerkTak>,
    /// (6.12) — alleen zinvol bij cot θ = 1. `Some(false)` = de aanwezige
    /// wapening is meer dan effectief kan zijn.
    pub asw_max_voldoet: Option<bool>,
    /// De rechterzijde van (6.12), ½·α_cw·ν₁·f_cd in N/mm².
    pub asw_max_grens_mpa: f64,
    /// De linkerzijde van (6.12), A_sw·f_ywd/(b_w·s) in N/mm², `None` zonder beugels.
    pub asw_max_aanwezig_mpa: Option<f64>,
    /// ΔF_td volgens (6.18), kN — de bijkomende trekkracht in de langswapening.
    pub delta_f_td_kn: f64,
}

/// Welk spoor van 6.2 geldt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Spoor {
    /// V_Ed ≤ V_Rd,c — geen berekende dwarskrachtwapening nodig (6.2.1(3)).
    GeenBerekendeWapening,
    /// V_Ed > V_Rd,c — uitsluitend het vakwerkmodel van 6.2.3 telt.
    Vakwerkmodel,
}

/// De β-reductie van 6.2.2(6), zoals werkelijk toegepast.
#[derive(Clone, Debug, PartialEq)]
pub struct BetaReductie {
    pub a_v_mm: f64,
    /// a_v zoals gebruikt: voor a_v ≤ 0,5·d schrijft 6.2.2(6) a_v = 0,5·d voor.
    pub a_v_gebruikt_mm: f64,
    pub beta: f64,
    pub bijdrage_kn: f64,
    /// V_Ed ná vermindering van alleen die bijdrage, kN.
    pub v_ed_verminderd_kn: f64,
    /// De rechterzijde van (6.5), 0,5·b_w·d·ν·f_cd in kN.
    pub grens_6_5_kn: f64,
    /// Voldoet de ONVERMINDERDE V_Ed aan (6.5)?
    pub voldoet_6_5: bool,
}

/// De hele dwarskrachttoets als afleiding: elke tussenwaarde, welke tak gold,
/// en waarom.
///
/// Dit is met opzet geen kaal getal. De aanroeper maakt er
/// [`NamedValue`](nen_en_1993_1_1_section::NamedValue)s en [`Deelstap`]pen van — zie [`ShearResistance::deelstappen`]
/// en [`check_shear`].
#[derive(Clone, Debug, PartialEq)]
pub struct ShearResistance {
    /// De onverminderde rekenwaarde van de dwarskracht, kN, absoluut.
    pub v_ed_kn: f64,
    /// De V_Ed waarmee tegen V_Rd,c is vergeleken (kan met β zijn verminderd).
    pub v_ed_voor_vrd_c_kn: f64,
    pub n_ed_kn: f64,
    /// `true` als het moment trek aan de onderzijde geeft.
    pub trek_onder: bool,
    pub f_cd_mpa: f64,
    pub f_ck_mpa: f64,
    pub gamma_c: f64,
    pub gamma_s: f64,
    pub vrd_c: VrdC,
    pub beta: Option<BetaReductie>,
    /// Het vakwerkmodel. `None` als z niet bepaalbaar was; dan staat de reden
    /// in `vakwerk_reden`.
    pub vakwerk: Option<Vakwerk>,
    pub vakwerk_reden: Option<String>,
    pub spoor: Spoor,
    /// De maatgevende weerstand, kN. `None` als het spoor niet kon worden
    /// afgerekend (zie `reden`).
    pub v_rd_kn: Option<f64>,
    /// Unity check V_Ed/V_Rd. `None` als `v_rd_kn` dat ook is.
    pub uc: Option<f64>,
    /// Waarom er geen V_Rd is, in leesbaar Nederlands.
    pub reden: Option<String>,
    /// Kanttekeningen die met het resultaat mee moeten reizen.
    pub notes: Vec<String>,
}

// ── De rekengang ──────────────────────────────────────────────────────────────

/// §6.2 — de dwarskrachtweerstand met de hele afleiding erbij.
///
/// Tekenafspraak aan deze grens is die van de crate: `n_ed` positief = **trek**,
/// `my_ed` positief = trek in de onderste vezel, `vz_ed` in kN. 6.2.2(1)
/// definieert N_Ed andersom (positief voor druk); de omkering zit hier en
/// nergens anders.
pub fn shear_resistance(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    force_state: &ForceStateSnapshot,
    opts: &ShearOptions,
) -> ShearResistance {
    let v_ed_kn = force_state.forces.vz_ed.abs();
    let n_ed_kn = force_state.forces.n_ed;
    let trek_onder = force_state.forces.my_ed >= 0.0;

    let h = section.h_mm;
    let b_w = section.b_w_mm();
    // d hoort bij de rij die op TREK staat. Bij een negatief moment is dat de
    // bovenwapening; d wordt dan vanaf de onderrand gemeten. `d_mm` gebruikt de
    // onderwapening, `d2_mm` de afstand van de bovenwapening tot de bovenrand.
    let d = if trek_onder { cage.d_mm(h) } else { h - cage.d2_mm() };
    let a_c = section.area_mm2();

    let mut notes: Vec<String> = Vec::new();

    // ── A_sl (6.2.2(1), figuur 6.3) ───────────────────────────────────────────
    let a_sl_uit_korf = opts.a_sl_mm2.is_none();
    let a_sl = opts.a_sl_mm2.unwrap_or(if trek_onder {
        cage.a_s_bottom_mm2()
    } else {
        cage.a_s_top_mm2()
    });
    if a_sl_uit_korf {
        notes.push(format!(
            "A_sl = {} mm² is de {} van de korf. 6.2.2(1) telt alleen de trekwapening mee die \
             ten minste (l_bd + d) VOORBIJ deze doorsnede doorloopt (figuur 6.3). Dit model kent \
             één doorlopende rij boven en één onder en staffelt niet, dus binnen het model klopt \
             dat — maar wordt de wapening in werkelijkheid afgeknipt of eindigt zij vlak bij een \
             steunpunt, dan is A_sl daar KLEINER en is deze V_Rd,c te hoog. Geef A_sl dan zelf op.",
            nl(a_sl, 0),
            if trek_onder { "onderwapening" } else { "bovenwapening" }
        ));
    }
    if a_sl <= 0.0 {
        notes.push(
            "Er is geen trekwapening aan de zijde die op trek staat: ρ_l = 0. (6.2.a) levert dan \
             alleen de σ_cp-term; de ondergrens (6.2.b) is maatgevend."
                .to_string(),
        );
    }

    // ── k, ρ_l, σ_cp met hun begrenzingen ────────────────────────────────────
    let (k, k_begrensd) = k_factor(d);
    let rho_l_ruw = if d > 0.0 && b_w > 0.0 { a_sl / (b_w * d) } else { 0.0 };
    let rho_l_begrensd = rho_l_ruw > RHO_L_MAX;
    let rho_l = rho_l_ruw.min(RHO_L_MAX);

    // 6.2.2(1): N_Ed > 0 voor DRUK. De crate rekent trek positief.
    let sigma_cp_ruw = if a_c > 0.0 { -n_ed_kn * 1e3 / a_c } else { 0.0 };
    let sigma_cp_grens = SIGMA_CP_FACTOR * mat.f_cd();
    let sigma_cp_begrensd = sigma_cp_ruw > sigma_cp_grens;
    // `+ 0.0` maakt van een negatieve nul een positieve nul (IEEE-754); zonder
    // dat staat er bij N_Ed = 0 een “−0” in het rapport.
    let sigma_cp = if sigma_cp_begrensd { sigma_cp_grens } else { sigma_cp_ruw } + 0.0;
    if sigma_cp_begrensd {
        notes.push(format!(
            "σ_cp = {} N/mm² overschrijdt de geldigheidsgrens 0,2·f_cd = {} N/mm² van 6.2.2(1); \
             er is met de grenswaarde gerekend. Dat is de veilige kant, maar (6.2.a) en (6.2.b) \
             zijn boven die grens strikt genomen niet meer van toepassing.",
            nl(sigma_cp_ruw, 2),
            nl(sigma_cp_grens, 2)
        ));
    }
    if sigma_cp < 0.0 {
        notes.push(format!(
            "N_Ed = {} kN is TREK. 6.2.2(1) definieert N_Ed positief voor druk, dus σ_cp = {} \
             N/mm² is negatief en de term k₁·σ_cp VERLAAGT V_Rd,c. De norm geeft hier geen \
             ondergrens voor σ_cp.",
            nl(n_ed_kn, 1),
            nl(sigma_cp, 2)
        ));
    }

    // ── V_Rd,c volgens (6.2.a) en (6.2.b) ────────────────────────────────────
    let c = c_rd_c(mat.gamma_c);
    let v_min = v_min_mpa(k, mat.f_ck);
    let bd = b_w * d;
    let v_6_2a_n = (c * k * (100.0 * rho_l * mat.f_ck).cbrt() + K1_NB * sigma_cp) * bd;
    let v_6_2b_n = (v_min + K1_NB * sigma_cp) * bd;
    // (6.2.b) is "met een minimum van": V_Rd,c is de GROOTSTE van beide.
    let (grootste_n, tak) = if v_6_2a_n >= v_6_2b_n {
        (v_6_2a_n, VrdCTak::Formule62a)
    } else {
        (v_6_2b_n, VrdCTak::Formule62b)
    };
    let afgekapt_op_nul = grootste_n < 0.0;
    if afgekapt_op_nul {
        notes.push(
            "De trekspanning maakt beide uitdrukkingen voor V_Rd,c negatief. Een negatieve \
             weerstand bestaat niet; V_Rd,c is op 0 gezet. De doorsnede valt daarmee altijd in \
             het vakwerkspoor van 6.2.3."
                .to_string(),
        );
    }
    let v_rd_c_kn = grootste_n.max(0.0) / 1e3;

    let vrd_c = VrdC {
        d_mm: d,
        b_w_mm: b_w,
        a_c_mm2: a_c,
        a_sl_mm2: a_sl,
        a_sl_uit_korf,
        rho_l,
        rho_l_begrensd,
        k,
        k_begrensd,
        sigma_cp_mpa: sigma_cp,
        sigma_cp_begrensd,
        c_rd_c: c,
        k1: K1_NB,
        v_min_mpa: v_min,
        v_6_2a_kn: v_6_2a_n / 1e3,
        v_6_2b_kn: v_6_2b_n / 1e3,
        v_rd_c_kn,
        tak,
        afgekapt_op_nul,
    };
    if k_begrensd {
        notes.push(format!(
            "k is op de bovengrens 2,0 van 6.2.2(1) afgekapt (d = {} mm ≤ 200 mm geeft altijd \
             k = 2,0).",
            nl(d, 0)
        ));
    }
    if rho_l_begrensd {
        notes.push(format!(
            "ρ_l = {} is op de bovengrens 0,02 van 6.2.2(1) afgekapt; extra langswapening \
             verhoogt V_Rd,c daarboven niet.",
            nl(rho_l_ruw, 4)
        ));
    }

    // ── β van 6.2.2(6), alleen voor de vergelijking met V_Rd,c ───────────────
    let nu = nu_gescheurd_beton(mat.f_ck);
    let grens_6_5_kn = 0.5 * b_w * d * nu * mat.f_cd() / 1e3;
    let mut beta_uit: Option<BetaReductie> = None;
    let mut v_ed_voor_vrd_c = v_ed_kn;
    if let Some(last) = opts.nabij_steunpunt {
        match beta_6_2_2_6(last.a_v_mm, d) {
            Ok((beta, a_v_gebruikt)) if last.langswapening_verankerd => {
                let bijdrage = last.bijdrage_kn.abs().min(v_ed_kn);
                let verminderd = v_ed_kn - bijdrage + beta * bijdrage;
                let voldoet = v_ed_kn <= grens_6_5_kn;
                v_ed_voor_vrd_c = verminderd;
                notes.push(format!(
                    "6.2.2(6): van V_Ed = {} kN komt {} kN door een last op a_v = {} mm van de \
                     opleggingsrand. Die bijdrage is met β = a_v/(2·d) = {} vermenigvuldigd, \
                     zodat voor de vergelijking met V_Rd,c geldt V_Ed = {} kN. Deze vermindering \
                     geldt UITSLUITEND voor die vergelijking; het vakwerkmodel rekent hieronder \
                     met de onverminderde V_Ed.",
                    nl(v_ed_kn, 1),
                    nl(bijdrage, 1),
                    nl(last.a_v_mm, 0),
                    nl(beta, 3),
                    nl(verminderd, 1)
                ));
                if !voldoet {
                    notes.push(format!(
                        "(6.5) is NIET gehaald: de onverminderde V_Ed = {} kN is groter dan \
                         0,5·b_w·d·ν·f_cd = {} kN. 6.2.2(6) staat de β-vermindering dan niet toe.",
                        nl(v_ed_kn, 1),
                        nl(grens_6_5_kn, 1)
                    ));
                    v_ed_voor_vrd_c = v_ed_kn;
                }
                beta_uit = Some(BetaReductie {
                    a_v_mm: last.a_v_mm,
                    a_v_gebruikt_mm: a_v_gebruikt,
                    beta,
                    bijdrage_kn: bijdrage,
                    v_ed_verminderd_kn: v_ed_voor_vrd_c,
                    grens_6_5_kn,
                    voldoet_6_5: voldoet,
                });
            }
            Ok(_) => notes.push(
                "6.2.2(6) is niet toegepast: de voorwaarde dat de langswapening volledig is \
                 verankerd bij de oplegging is niet bevestigd. De toets rekent met de \
                 onverminderde V_Ed en blijft daarmee op de veilige kant."
                    .to_string(),
            ),
            Err(reden) => notes.push(format!(
                "6.2.2(6) is niet toegepast: {reden} De toets rekent met de onverminderde V_Ed \
                 en blijft daarmee op de veilige kant."
            )),
        }
    }

    // ── Spoor bepalen ────────────────────────────────────────────────────────
    let spoor = if v_ed_voor_vrd_c <= v_rd_c_kn {
        Spoor::GeenBerekendeWapening
    } else {
        Spoor::Vakwerkmodel
    };

    // ── Het vakwerkmodel ─────────────────────────────────────────────────────
    let (vakwerk, vakwerk_reden) =
        bouw_vakwerk(cage, mat, opts, d, b_w, n_ed_kn, v_ed_kn, spoor, nu);

    // ── Weerstand, unity check en de resterende kanttekeningen ───────────────
    let (v_rd_kn, uc, reden) = match spoor {
        Spoor::GeenBerekendeWapening => {
            notes.push(format!(
                "V_Ed = {} kN ≤ V_Rd,c = {} kN: volgens 6.2.1(3) is er GEEN berekende \
                 dwarskrachtwapening nodig. 6.2.1(4) eist dan nog wel de minimale \
                 dwarskrachtwapening van §9.2.2 — die mag alleen worden weggelaten bij platen \
                 (massief, ribben- of kanaalplaat) waarin herverdeling in dwarsrichting mogelijk \
                 is, en bij elementen van ondergeschikt belang zoals lateien met een overspanning \
                 ≤ 2 m. Die detailleringseis wordt hier NIET getoetst.",
                nl(v_ed_voor_vrd_c, 1),
                nl(v_rd_c_kn, 1)
            ));
            let uc = if v_rd_c_kn > 0.0 {
                v_ed_voor_vrd_c / v_rd_c_kn
            } else if v_ed_voor_vrd_c > 0.0 {
                f64::INFINITY
            } else {
                0.0
            };
            (Some(v_rd_c_kn), Some(uc), None)
        }
        Spoor::Vakwerkmodel => {
            notes.push(format!(
                "V_Ed = {} kN > V_Rd,c = {} kN: de weerstand komt volgens 6.2.3 UITSLUITEND uit \
                 het vakwerkmodel. De bijdrage van het beton V_Rd,c wordt NIET opgeteld — (6.8) \
                 en (6.9) kennen geen betonterm en 6.2.3(3) noemt V_Rd \"de kleinste waarde van\" \
                 die twee.",
                nl(v_ed_kn, 1),
                nl(v_rd_c_kn, 1)
            ));
            match vakwerk.as_ref().and_then(|v| v.v_rd_kn.map(|r| (v, r))) {
                Some((v, rd)) => {
                    let uc = if rd > 0.0 { v_ed_kn / rd } else { f64::INFINITY };
                    if v.tak == Some(VakwerkTak::DrukdiagonaalBezwijkt) {
                        notes.push(
                            "V_Rd,max is maatgevend: de betondrukdiagonaal bezwijkt vóór de \
                             beugels vloeien. Méér beugelwapening helpt hier niet — de doorsnede \
                             of de betonsterkte moet groter, of θ moet binnen 1,0 ≤ cot θ ≤ 2,5 \
                             anders worden gekozen."
                                .to_string(),
                        );
                    }
                    (Some(rd), Some(uc), None)
                }
                None => {
                    let reden = vakwerk
                        .as_ref()
                        .and_then(|v| v.v_rd_s_reden.clone())
                        .or_else(|| vakwerk_reden.clone())
                        .unwrap_or_else(|| "het vakwerkmodel kon niet worden bepaald".to_string());
                    (None, None, Some(reden))
                }
            }
        }
    };

    if let Some(v) = vakwerk.as_ref() {
        if spoor == Spoor::Vakwerkmodel {
            notes.push(format!(
                "De dwarskracht veroorzaakt volgens (6.18) een bijkomende trekkracht in de \
                 langswapening: ΔF_td = 0,5·V_Ed·(cot θ − cot α) = {} kN. De norm eist bovendien \
                 dat (M_Ed/z) + ΔF_td niet groter wordt genomen dan M_Ed,max/z. Dat is een eis \
                 over de HELE ligger; deze doorsnedetoets kent M_Ed,max niet en toetst hem NIET.",
                nl(v.delta_f_td_kn, 1)
            ));
            if v.asw_max_voldoet == Some(false) {
                notes.push(format!(
                    "(6.12): bij cot θ = 1 is de effectieve dwarskrachtwapening begrensd op \
                     A_sw·f_ywd/(b_w·s) ≤ ½·α_cw·ν₁·f_cd = {} N/mm²; aanwezig is {} N/mm². De \
                     wapening boven die grens levert geen extra weerstand.",
                    nl(v.asw_max_grens_mpa, 2),
                    nl(v.asw_max_aanwezig_mpa.unwrap_or(0.0), 2)
                ));
            }
        }
    }
    if opts.nabij_steunpunt.is_none() {
        notes.push(
            "Er is geen last dicht bij een steunpunt opgegeven, dus de β-vermindering van \
             6.2.2(6) en de verlichting van 6.2.1(8) (binnen een afstand d van de dagkant van de \
             oplegging hoeft niet te worden getoetst) zijn NIET toegepast. De toets rekent met de \
             aangeboden V_Ed en blijft daarmee op de veilige kant."
                .to_string(),
        );
    }
    notes.extend(cage.assumptions());

    ShearResistance {
        v_ed_kn,
        v_ed_voor_vrd_c_kn: v_ed_voor_vrd_c,
        n_ed_kn,
        trek_onder,
        f_cd_mpa: mat.f_cd(),
        f_ck_mpa: mat.f_ck,
        gamma_c: mat.gamma_c,
        gamma_s: mat.gamma_s,
        vrd_c,
        beta: beta_uit,
        vakwerk,
        vakwerk_reden,
        spoor,
        v_rd_kn,
        uc,
        reden,
        notes,
    }
}

/// β = a_v/(2·d) volgens 6.2.2(6), met de door de norm voorgeschreven
/// behandeling van kleine a_v.
///
/// Levert (β, de gebruikte a_v). `Err` als a_v buiten het toepassingsgebied
/// valt: 6.2.2(6) geldt voor 0,5·d ≤ a_v ≤ 2·d, en schrijft voor a_v ≤ 0,5·d
/// voor dat a_v = 0,5·d wordt gebruikt. Boven 2·d is er geen reductie — dan
/// hoort de last gewoon volledig mee te tellen.
pub fn beta_6_2_2_6(a_v_mm: f64, d_mm: f64) -> Result<(f64, f64), String> {
    if d_mm.is_nan() || d_mm <= 0.0 {
        return Err("de nuttige hoogte d is niet positief.".to_string());
    }
    if a_v_mm < 0.0 {
        return Err("a_v is negatief.".to_string());
    }
    if a_v_mm > 2.0 * d_mm {
        return Err(format!(
            "a_v = {} mm ligt buiten het bereik 0,5·d ≤ a_v ≤ 2·d van 6.2.2(6) (2·d = {} mm); de \
             last telt volledig mee.",
            nl(a_v_mm, 0),
            nl(2.0 * d_mm, 0)
        ));
    }
    let a_v = a_v_mm.max(0.5 * d_mm);
    Ok((a_v / (2.0 * d_mm), a_v))
}

/// De grootste cot θ binnen 1,0…2,5 waarbij (6.9) nog V_Ed haalt.
///
/// **Waarom deze keuze.** De norm laat θ vrij binnen 1,0 ≤ cot θ ≤ 2,5 (NB bij
/// 6.2.3(2)) en zegt niet welke waarde je moet nemen. De twee vergelijkingen
/// trekken tegengesteld: V_Rd,s = (A_sw/s)·z·f_ywd·cot θ stijgt met cot θ,
/// terwijl V_Rd,max = α_cw·b_w·z·ν₁·f_cd/(cot θ + tan θ) een maximum heeft bij
/// cot θ = 1 en daarna daalt (cot θ + tan θ neemt vanaf 1 monotoon toe). De
/// grootste toelaatbare cot θ geeft dus de minste beugelwapening en is de
/// gangbare ontwerpkeuze — mits de drukdiagonaal het houdt. Daarom:
///
/// * los cot θ + tan θ = K op met K = α_cw·b_w·z·ν₁·f_cd / V_Ed. Dat is
///   c² − K·c + 1 = 0 met de grootste wortel c = (K + √(K² − 4))/2;
/// * kap af op 2,5, en houd ten minste 1,0 aan;
/// * is K < 2, dan haalt zelfs cot θ = 1 het niet en bezwijkt de
///   drukdiagonaal. Dan is cot θ = 1 aangehouden, de waarde waarbij (6.9)
///   maximaal is; de toets valt daarna op V_Rd,max af.
///
/// Wat er ook uit komt, het rapport toont welke θ is gebruikt en waarom — de
/// keuze is een ontwerpbeslissing en geen rekenkundig detail.
pub fn cot_theta_automatisch(v_rd_max_teller_n: f64, v_ed_n: f64) -> (f64, CotThetaKeuze) {
    if v_ed_n.is_nan() || v_ed_n <= 0.0 {
        return (COT_THETA_MAX, CotThetaKeuze::Automatisch);
    }
    let k = v_rd_max_teller_n / v_ed_n;
    if k < 2.0 {
        return (COT_THETA_MIN, CotThetaKeuze::AutomatischDrukdiagonaalTeKlein);
    }
    let c = (k + (k * k - 4.0).sqrt()) / 2.0;
    (c.clamp(COT_THETA_MIN, COT_THETA_MAX), CotThetaKeuze::Automatisch)
}

#[allow(clippy::too_many_arguments)]
fn bouw_vakwerk(
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    opts: &ShearOptions,
    d_mm: f64,
    b_w_mm: f64,
    n_ed_kn: f64,
    v_ed_kn: f64,
    spoor: Spoor,
    nu: f64,
) -> (Option<Vakwerk>, Option<String>) {
    // z: 6.2.3(1) staat z = 0,9·d alleen toe voor gewapend beton ZONDER
    // normaalkracht. Met normaalkracht moet de werkelijke hefboomsarm worden
    // opgegeven; er wordt hier niets aangenomen.
    let (z, z_is_0_9d) = match opts.z_mm {
        Some(z) if z > 0.0 => (z, false),
        _ => {
            if n_ed_kn.abs() > 1e-6 {
                return (
                    None,
                    Some(format!(
                        "de inwendige hefboomsarm z is niet bepaald. 6.2.3(1) staat de \
                         vereenvoudiging z = 0,9·d uitsluitend toe \"in de dwarskrachtberekening \
                         van gewapend beton zonder normaalkracht\", en hier werkt N_Ed = {} kN. \
                         Geef z op — de werkelijke hefboomsarm bij het buigend moment in deze \
                         doorsnede — dan volgt de vakwerktoets alsnog.",
                        nl(n_ed_kn, 1)
                    )),
                );
            }
            (z_0_9d(d_mm), true)
        }
    };

    let alpha_cw = ALPHA_CW_NIET_VOORGESPANNEN;
    let nu1 = nu; // NB bij 6.2.3(3): ν₁ = ν.
    let teller_n = alpha_cw * b_w_mm * z * nu1 * mat.f_cd();

    // θ: opgegeven gaat vóór; anders automatisch (spoor B) of cot θ = 1 (spoor A).
    let (cot_theta, keuze) = match opts.cot_theta {
        Some(c) => {
            let afgekapt = c.clamp(COT_THETA_MIN, COT_THETA_MAX);
            let keuze = if (afgekapt - c).abs() > 1e-12 {
                CotThetaKeuze::OpgegevenAfgekapt
            } else {
                CotThetaKeuze::Opgegeven
            };
            (afgekapt, keuze)
        }
        None => match spoor {
            Spoor::Vakwerkmodel => cot_theta_automatisch(teller_n, v_ed_kn * 1e3),
            Spoor::GeenBerekendeWapening => (COT_THETA_MIN, CotThetaKeuze::SpoorZonderWapening),
        },
    };
    let tan_theta = 1.0 / cot_theta;
    let theta_deg = cot_theta.recip().atan().to_degrees();
    let v_rd_max_n = teller_n / (cot_theta + tan_theta);

    // De dwarskrachtwapening. `shear_reinforcement` is de enige poort naar de
    // beugels; ontbreekt er iets, dan komt daar één leesbare zin uit.
    let (asw, v_rd_s_reden): (Option<ShearReinforcement>, Option<String>) =
        match cage.shear_reinforcement() {
            Ok(a) => (Some(a), None),
            Err(e) => (None, Some(e)),
        };

    // f_ywd: eigen beugelkwaliteit → f_ywk/γ_S; anders de f_yd van de
    // langswapening. De korf legt vast dat `None` "dezelfde staalsoort" betekent.
    let (f_ywd, f_ywd_bron) = match asw.and_then(|a| a.f_ywk_mpa) {
        Some(f_ywk) => (Some(f_ywk / mat.gamma_s), Some(FywdBron::EigenFywk)),
        None => {
            if asw.is_some() {
                (Some(mat.f_yd()), Some(FywdBron::ZelfdeAlsLangswapening))
            } else {
                (None, None)
            }
        }
    };

    // (6.8) geldt voor VERTICALE dwarskrachtwapening. De korf legt α vast op
    // 90°; loopt dat ooit uiteen, dan zou (6.13)/(6.14) nodig zijn en die staan
    // hier niet — dus dan liever geen getal.
    let alpha_deg = asw.map(|a| a.alpha_deg).unwrap_or(STIRRUP_ALPHA_DEG);
    if (alpha_deg - 90.0).abs() > 1e-9 {
        return (
            None,
            Some(format!(
                "de dwarskrachtwapening staat onder α = {}°; (6.8) en (6.9) gelden voor \
                 verticale wapening (α = 90°) en de hellende varianten (6.13)/(6.14) zijn in \
                 deze module niet opgenomen.",
                nl(alpha_deg, 1)
            )),
        );
    }

    let v_rd_s_n = match (asw, f_ywd) {
        (Some(a), Some(f)) => Some(a.a_sw_per_s_mm * z * f * cot_theta),
        _ => None,
    };
    let (v_rd_n, tak) = match v_rd_s_n {
        Some(s) if s <= v_rd_max_n => (Some(s), Some(VakwerkTak::WapeningVloeit)),
        Some(_) => (Some(v_rd_max_n), Some(VakwerkTak::DrukdiagonaalBezwijkt)),
        None => (None, None),
    };

    // (6.12) — alleen zinvol als cot θ werkelijk 1 is.
    let asw_max_grens = 0.5 * alpha_cw * nu1 * mat.f_cd();
    let asw_max_aanwezig = match (asw, f_ywd) {
        (Some(a), Some(f)) if b_w_mm > 0.0 && a.s_mm > 0.0 => {
            Some(a.a_sw_mm2 * f / (b_w_mm * a.s_mm))
        }
        _ => None,
    };
    let asw_max_voldoet = if (cot_theta - 1.0).abs() < 1e-9 {
        asw_max_aanwezig.map(|l| l <= asw_max_grens)
    } else {
        None
    };

    // (6.18) met cot α = 0 (α = 90°).
    let delta_f_td_kn = 0.5 * v_ed_kn * cot_theta;

    (
        Some(Vakwerk {
            z_mm: z,
            z_is_0_9d,
            cot_theta,
            theta_deg,
            cot_theta_keuze: keuze,
            nu1,
            alpha_cw,
            alpha_deg,
            v_rd_max_kn: v_rd_max_n / 1e3,
            a_sw_per_s_mm: asw.map(|a| a.a_sw_per_s_mm),
            a_sw_mm2: asw.map(|a| a.a_sw_mm2),
            s_mm: asw.map(|a| a.s_mm),
            legs: asw.map(|a| a.legs),
            f_ywd_mpa: f_ywd,
            f_ywd_bron,
            v_rd_s_kn: v_rd_s_n.map(|v| v / 1e3),
            v_rd_s_reden,
            v_rd_kn: v_rd_n.map(|v| v / 1e3),
            tak,
            asw_max_voldoet,
            asw_max_grens_mpa: asw_max_grens,
            asw_max_aanwezig_mpa: asw_max_aanwezig,
            delta_f_td_kn,
        }),
        None,
    )
}

// ── De afleiding als deelstappen ──────────────────────────────────────────────

impl ShearResistance {
    /// De afleiding uitgeschreven, in de volgorde waarin het rapport haar toont.
    ///
    /// Deze functie **rekent niets opnieuw uit**: zij schrijft op wat
    /// [`shear_resistance`] al heeft bepaald. Dezelfde regel als in
    /// [`crate::deelstappen`]; een stap die zijn eigen som maakt, kan van de
    /// kern af gaan drijven zonder dat een test dat ziet.
    pub fn deelstappen(&self) -> Vec<Deelstap> {
        let c = &self.vrd_c;
        let mut uit = Vec::new();

        uit.push(stap(
            "dwarskracht_uitgangspunten",
            "Uitgangspunten van de dwarskrachttoets",
            "",
            "art. 6.2.1",
            String::new(),
            String::new(),
            vec![
                nv(r"V_{Ed}", self.v_ed_kn, "kN"),
                nv(r"N_{Ed}", self.n_ed_kn, "kN"),
                nv("b_w", c.b_w_mm, "mm"),
                nv("d", c.d_mm, "mm"),
                nv("A_c", c.a_c_mm2, "mm²"),
                nv(r"f_{ck}", self.f_ck_mpa, "N/mm²"),
                nv(r"f_{cd}", self.f_cd_mpa, "N/mm²"),
            ],
            None,
            "",
            vec![
                "§6.2 kent twee sporen die elkaar UITSLUITEN. Zolang V_Ed ≤ V_Rd,c is er geen \
                 berekende dwarskrachtwapening nodig (6.2.1(3)). Zodra V_Ed > V_Rd,c komt de \
                 weerstand uitsluitend uit het vakwerkmodel van 6.2.3 en telt de betonbijdrage \
                 NIET mee."
                    .to_string(),
                format!(
                    "b_w = {} mm is de kleinste breedte van de doorsnede (6.2.2(1): \"de kleinste \
                     breedte van de dwarsdoorsnede in de zone onder trek\"; 6.2.3(1): \"de \
                     minimale breedte tussen de trek- en de drukrand\"). Bij een T of L is dat de \
                     LIJFbreedte en niet de flensbreedte.",
                    nl(c.b_w_mm, 0)
                ),
                format!(
                    "d = {} mm is gemeten tot de {} — de rij die bij dit moment op trek staat.",
                    nl(c.d_mm, 0),
                    if self.trek_onder { "onderwapening" } else { "bovenwapening" }
                ),
                "(6.2.a) is een EMPIRISCHE formule: f_ck in MPa, b_w en d in mm, uitkomst in N. \
                 Rekenen in kN of in m levert een fout antwoord."
                    .to_string(),
            ],
        ));

        uit.push(stap(
            "dwarskracht_k",
            "Schaalfactor voor de nuttige hoogte",
            "k",
            "art. 6.2.2(1)",
            r"k = 1 + \sqrt{\frac{200}{d}} \le 2{,}0".to_string(),
            format!(
                r"k = 1 + \sqrt{{\frac{{200}}{{{d}}}}} = {kw}",
                d = lx(c.d_mm, 0),
                kw = lx(1.0 + (200.0 / c.d_mm).sqrt(), 4)
            ),
            vec![nv("d", c.d_mm, "mm")],
            Some(c.k),
            "-",
            vec![if c.k_begrensd {
                "De bovengrens 2,0 is bindend: elke doorsnede met d ≤ 200 mm krijgt k = 2,0."
                    .to_string()
            } else {
                "De bovengrens 2,0 is hier niet bindend.".to_string()
            }],
        ));

        uit.push(stap(
            "dwarskracht_rho_l",
            "Wapeningsverhouding van de langse trekwapening",
            r"\rho_l",
            "art. 6.2.2(1)",
            r"\rho_l = \frac{A_{sl}}{b_w \, d} \le 0{,}02".to_string(),
            format!(
                r"\rho_l = \frac{{{asl}}}{{{bw} \cdot {d}}} = {r}",
                asl = lx(c.a_sl_mm2, 1),
                bw = lx(c.b_w_mm, 0),
                d = lx(c.d_mm, 0),
                r = lx(c.a_sl_mm2 / (c.b_w_mm * c.d_mm), 5)
            ),
            vec![nv(r"A_{sl}", c.a_sl_mm2, "mm²"), nv("b_w", c.b_w_mm, "mm"), nv("d", c.d_mm, "mm")],
            Some(c.rho_l),
            "-",
            vec![
                "A_sl is volgens 6.2.2(1) alleen de trekwapening die ten minste (l_bd + d) \
                 VOORBIJ deze doorsnede doorloopt (figuur 6.3) — niet zonder meer de \
                 buigtrekwapening."
                    .to_string(),
                if c.rho_l_begrensd {
                    "ρ_l is op de bovengrens 0,02 afgekapt.".to_string()
                } else {
                    "De bovengrens 0,02 is hier niet bindend.".to_string()
                },
            ],
        ));

        uit.push(stap(
            "dwarskracht_sigma_cp",
            "Normaalspanning in de doorsnede",
            r"\sigma_{cp}",
            "art. 6.2.2(1)",
            r"\sigma_{cp} = \frac{N_{Ed}}{A_c} < 0{,}2\, f_{cd}".to_string(),
            format!(
                r"\sigma_{{cp}} = \frac{{{n}}}{{{ac}}} = {s}",
                n = lx(-self.n_ed_kn * 1e3, 0),
                ac = lx(c.a_c_mm2, 0),
                s = lx(c.sigma_cp_mpa, 3)
            ),
            vec![nv(r"N_{Ed}", -self.n_ed_kn, "kN (druk +)"), nv("A_c", c.a_c_mm2, "mm²")],
            Some(c.sigma_cp_mpa),
            "N/mm²",
            vec![
                "6.2.2(1) definieert N_Ed POSITIEF VOOR DRUK — tegengesteld aan de trek-positieve \
                 conventie van de rekenkern. Die omkering is hier toegepast."
                    .to_string(),
                format!(
                    "De geldigheidsgrens 0,2·f_cd = {} N/mm² is {}.",
                    nl(SIGMA_CP_FACTOR * self.f_cd_mpa, 2),
                    if c.sigma_cp_begrensd { "OVERSCHREDEN en afgekapt" } else { "niet bereikt" }
                ),
            ],
        ));

        uit.push(stap(
            "dwarskracht_v_min",
            "Minimale schuifspanningsweerstand",
            r"v_{min}",
            "art. 6.2.2(1) (6.3N) + NB",
            r"v_{min} = 0{,}035 \, k^{3/2} \, f_{ck}^{1/2}".to_string(),
            format!(
                r"v_{{min}} = 0{{,}}035 \cdot {k}^{{3/2}} \cdot {fck}^{{1/2}}",
                k = lx(c.k, 4),
                fck = lx(self.f_ck_mpa, 0)
            ),
            vec![nv("k", c.k, "-"), nv(r"f_{ck}", self.f_ck_mpa, "N/mm²")],
            Some(c.v_min_mpa),
            "N/mm²",
            vec![
                "NB bij 6.2.2(1): \"De waarde van v_min moet gelijk aan 0,035 k^{3/2} · f_ck^{1/2} \
                 zijn genomen.\" Geen keuze dus."
                    .to_string(),
            ],
        ));

        uit.push(stap(
            "dwarskracht_c_rd_c",
            "Coëfficiënt C_Rd,c",
            r"C_{Rd,c}",
            "art. 6.2.2(1), NB",
            r"C_{Rd,c} = \frac{0{,}18}{\gamma_C}".to_string(),
            format!(r"C_{{Rd,c}} = \frac{{0{{,}}18}}{{{g}}}", g = lx(self.gamma_c, 2)),
            vec![nv(r"\gamma_C", self.gamma_c, "-")],
            Some(c.c_rd_c),
            "-",
            vec![
                "De NB geeft de UITDRUKKING 0,18/γ_C, niet een getal. Met γ_C = 1,5 volgt 0,12, \
                 met γ_C = 1,2 (buitengewone ontwerpsituatie) volgt 0,15."
                    .to_string(),
                "k₁ = 0,15 — NB bij 6.2.2(1): \"De waarde van k₁ moet gelijk aan 0,15 zijn \
                 genomen.\""
                    .to_string(),
            ],
        ));

        uit.push(stap(
            "dwarskracht_v_rd_c",
            "Dwarskrachtweerstand zonder dwarskrachtwapening",
            r"V_{Rd,c}",
            "art. 6.2.2(1) (6.2.a) en (6.2.b)",
            r"V_{Rd,c} = \max\Big( \big[ C_{Rd,c}\, k\, (100\, \rho_l\, f_{ck})^{1/3} + k_1 \sigma_{cp} \big] b_w d \; ; \; (v_{min} + k_1 \sigma_{cp})\, b_w d \Big)"
                .to_string(),
            format!(
                r"V_{{Rd,c}} = \max\big( {a} \;;\; {b} \big) \text{{ kN}}",
                a = lx(c.v_6_2a_kn, 2),
                b = lx(c.v_6_2b_kn, 2)
            ),
            vec![
                nv(r"C_{Rd,c}", c.c_rd_c, "-"),
                nv("k", c.k, "-"),
                nv(r"\rho_l", c.rho_l, "-"),
                nv(r"f_{ck}", self.f_ck_mpa, "N/mm²"),
                nv("k_1", c.k1, "-"),
                nv(r"\sigma_{cp}", c.sigma_cp_mpa, "N/mm²"),
                nv(r"v_{min}", c.v_min_mpa, "N/mm²"),
                nv("b_w", c.b_w_mm, "mm"),
                nv("d", c.d_mm, "mm"),
            ],
            Some(c.v_rd_c_kn),
            "kN",
            vec![
                format!(
                    "(6.2.b) is in de norm ingeleid met \"met een minimum van\": V_Rd,c is de \
                     GROOTSTE van beide, niet de kleinste. Hier is {} maatgevend.",
                    c.tak.label()
                ),
                format!(
                    "(6.2.a) geeft {} kN, (6.2.b) geeft {} kN.",
                    nl(c.v_6_2a_kn, 1),
                    nl(c.v_6_2b_kn, 1)
                ),
            ],
        ));

        if let Some(b) = &self.beta {
            uit.push(stap(
                "dwarskracht_beta",
                "Vermindering voor een last dicht bij het steunpunt",
                r"\beta",
                "art. 6.2.2(6)",
                r"\beta = \frac{a_v}{2\,d}, \quad 0{,}5d \le a_v \le 2d".to_string(),
                format!(
                    r"\beta = \frac{{{av}}}{{2 \cdot {d}}} = {b}",
                    av = lx(b.a_v_gebruikt_mm, 0),
                    d = lx(c.d_mm, 0),
                    b = lx(b.beta, 3)
                ),
                vec![
                    nv("a_v", b.a_v_gebruikt_mm, "mm"),
                    nv("d", c.d_mm, "mm"),
                    nv(r"V_{Ed,bijdrage}", b.bijdrage_kn, "kN"),
                ],
                Some(b.v_ed_verminderd_kn),
                "kN",
                vec![
                    "6.2.2(6) laat ALLEEN de bijdrage van de betreffende last verminderen, en \
                     ALLEEN voor het toetsen van V_Rd,c in (6.2.a). Het vakwerkmodel rekent met \
                     de onverminderde V_Ed."
                        .to_string(),
                    format!(
                        "De onverminderde V_Ed moet altijd voldoen aan (6.5): V_Ed ≤ \
                         0,5·b_w·d·ν·f_cd = {} kN — {}.",
                        nl(b.grens_6_5_kn, 1),
                        if b.voldoet_6_5 { "voldaan" } else { "NIET voldaan" }
                    ),
                ],
            ));
        }

        match self.spoor {
            Spoor::GeenBerekendeWapening => uit.push(stap(
                "dwarskracht_spoor",
                "Spoorkeuze",
                r"V_{Rd}",
                "art. 6.2.1(3) en 6.2.1(4)",
                r"V_{Ed} \le V_{Rd,c} \Rightarrow V_{Rd} = V_{Rd,c}".to_string(),
                format!(
                    r"{ved} \le {vrdc} \text{{ kN}}",
                    ved = lx(self.v_ed_voor_vrd_c_kn, 1),
                    vrdc = lx(c.v_rd_c_kn, 1)
                ),
                vec![
                    nv(r"V_{Ed}", self.v_ed_voor_vrd_c_kn, "kN"),
                    nv(r"V_{Rd,c}", c.v_rd_c_kn, "kN"),
                ],
                Some(c.v_rd_c_kn),
                "kN",
                vec![
                    "6.2.1(3): geen BEREKENDE dwarskrachtwapening nodig. 6.2.1(4) eist dan nog \
                     wel de minimale dwarskrachtwapening van §9.2.2, tenzij het om platen gaat \
                     waarin herverdeling in dwarsrichting mogelijk is, of om elementen van \
                     ondergeschikt belang (lateien met overspanning ≤ 2 m). Die detailleringseis \
                     valt buiten deze toets."
                        .to_string(),
                ],
            )),
            Spoor::Vakwerkmodel => uit.push(stap(
                "dwarskracht_spoor",
                "Spoorkeuze",
                r"V_{Rd}",
                "art. 6.2.1(5) en 6.2.3(3)",
                r"V_{Ed} > V_{Rd,c} \Rightarrow V_{Rd} = \min(V_{Rd,s}; V_{Rd,max})".to_string(),
                format!(
                    r"{ved} > {vrdc} \text{{ kN}}",
                    ved = lx(self.v_ed_kn, 1),
                    vrdc = lx(c.v_rd_c_kn, 1)
                ),
                vec![nv(r"V_{Ed}", self.v_ed_kn, "kN"), nv(r"V_{Rd,c}", c.v_rd_c_kn, "kN")],
                None,
                "",
                vec![
                    "De betonbijdrage V_Rd,c VERVALT hier volledig. (6.8) en (6.9) kennen geen \
                     betonterm; V_Rd = V_Rd,c + V_Rd,s zou onveilig zijn."
                        .to_string(),
                ],
            )),
        }

        if let Some(v) = &self.vakwerk {
            uit.push(stap(
                "dwarskracht_z",
                "Inwendige hefboomsarm",
                "z",
                "art. 6.2.3(1)",
                if v.z_is_0_9d { r"z = 0{,}9\, d".to_string() } else { r"z".to_string() },
                if v.z_is_0_9d {
                    format!(r"z = 0{{,}}9 \cdot {d}", d = lx(c.d_mm, 0))
                } else {
                    String::new()
                },
                vec![nv("d", c.d_mm, "mm")],
                Some(v.z_mm),
                "mm",
                vec![if v.z_is_0_9d {
                    "6.2.3(1): \"In de dwarskrachtberekening van gewapend beton zonder \
                     normaalkracht mag in het algemeen de benaderende waarde z = 0,9 d zijn \
                     gebruikt.\" Er is hier geen normaalkracht, dus die vereenvoudiging is \
                     toegestaan."
                        .to_string()
                } else {
                    "z is opgegeven; 6.2.3(1) staat z = 0,9·d alleen toe zonder normaalkracht."
                        .to_string()
                }],
            ));

            uit.push(stap(
                "dwarskracht_theta",
                "Hoek van de betondrukdiagonaal",
                r"\cot\theta",
                "art. 6.2.3(2), NB bij (6.7N)",
                r"1{,}0 \le \cot\theta \le 2{,}5".to_string(),
                format!(
                    r"\cot\theta = {c} \;\;(\theta = {t}^\circ)",
                    c = lx(v.cot_theta, 3),
                    t = lx(v.theta_deg, 1)
                ),
                vec![nv(r"\cot\theta", v.cot_theta, "-"), nv(r"\theta", v.theta_deg, "°")],
                Some(v.cot_theta),
                "-",
                vec![
                    "NB bij 6.2.3(2): \"De grenswaarden van cot θ zijn 1,0 ≤ cot θ ≤ 2,5.\" \
                     Binnen die grenzen is θ een vrije ONTWERPKEUZE."
                        .to_string(),
                    match v.cot_theta_keuze {
                        CotThetaKeuze::Opgegeven => "cot θ is door de gebruiker opgegeven.".to_string(),
                        CotThetaKeuze::OpgegevenAfgekapt =>
                            "De opgegeven cot θ lag buiten 1,0…2,5 en is op de grens afgekapt."
                                .to_string(),
                        CotThetaKeuze::Automatisch =>
                            "Gekozen is de GROOTSTE cot θ binnen 1,0…2,5 waarbij de \
                             betondrukdiagonaal (6.9) V_Ed nog haalt. Dat geeft de kleinste \
                             benodigde beugelwapening, want (6.8) stijgt met cot θ terwijl (6.9) \
                             daalt."
                                .to_string(),
                        CotThetaKeuze::AutomatischDrukdiagonaalTeKlein =>
                            "Zelfs bij cot θ = 1 — de waarde waarbij (6.9) MAXIMAAL is — haalt de \
                             betondrukdiagonaal V_Ed niet. cot θ = 1 is aangehouden; de toets \
                             loopt daarna op V_Rd,max stuk."
                                .to_string(),
                        CotThetaKeuze::SpoorZonderWapening =>
                            "Er wordt geen wapening ontworpen, dus θ is geen ontwerpkeuze. \
                             cot θ = 1 is aangehouden: daar is (6.9) maximaal, en V_Rd,max dient \
                             hier alleen als de bovengrens van 6.2.1(6)."
                                .to_string(),
                    },
                ],
            ));

            uit.push(stap(
                "dwarskracht_v_rd_max",
                "Bezwijken van de betondrukdiagonaal",
                r"V_{Rd,max}",
                "art. 6.2.3(3) (6.9)",
                r"V_{Rd,max} = \frac{\alpha_{cw}\, b_w\, z\, \nu_1\, f_{cd}}{\cot\theta + \tan\theta}"
                    .to_string(),
                format!(
                    r"V_{{Rd,max}} = \frac{{{acw} \cdot {bw} \cdot {z} \cdot {nu} \cdot {fcd}}}{{{ct} + {tt}}} \cdot 10^{{-3}}",
                    acw = lx(v.alpha_cw, 1),
                    bw = lx(c.b_w_mm, 0),
                    z = lx(v.z_mm, 1),
                    nu = lx(v.nu1, 4),
                    fcd = lx(self.f_cd_mpa, 2),
                    ct = lx(v.cot_theta, 3),
                    tt = lx(1.0 / v.cot_theta, 3)
                ),
                vec![
                    nv(r"\alpha_{cw}", v.alpha_cw, "-"),
                    nv("b_w", c.b_w_mm, "mm"),
                    nv("z", v.z_mm, "mm"),
                    nv(r"\nu_1", v.nu1, "-"),
                    nv(r"f_{cd}", self.f_cd_mpa, "N/mm²"),
                    nv(r"\cot\theta", v.cot_theta, "-"),
                ],
                Some(v.v_rd_max_kn),
                "kN",
                vec![
                    "NB bij 6.2.3(3): \"De waarde van ν₁ moet gelijk aan ν zijn genomen\", en ν \
                     volgt uit (6.6N) = 0,6[1 − f_ck/250]. De verlaagde ν₁ van (6.10.aN)/(6.10.bN) \
                     is NIET gebruikt: die mag alleen als de spanning in de dwarskrachtwapening \
                     onder 80 % van f_yk blijft, en dwingt dan tegelijk f_ywd ≤ 0,8·f_ywk."
                        .to_string(),
                    "NB bij 6.2.3(3): α_cw = 1 voor niet-voorgespannen constructies. Voorspanning \
                     zit niet in dit model, dus de drie σ_cp-afhankelijke takken van α_cw zijn \
                     niet van toepassing."
                        .to_string(),
                    "In de noemer staat (cot θ + tan θ) — niet (1 + cot²θ); die vorm hoort bij \
                     (6.14) voor hellende wapening."
                        .to_string(),
                ],
            ));

            match (v.v_rd_s_kn, v.f_ywd_mpa, v.a_sw_per_s_mm) {
                (Some(v_rd_s), Some(f_ywd), Some(asw_s)) => {
                    let mut notes = vec![
                        "A_sw is de doorsnede van ALLE beugelbenen in één beugelvlak (§9.2.2(5): \
                         \"binnen de lengte s\"). Eén been rekenen halveert de weerstand van een \
                         gewone tweebenige beugel."
                            .to_string(),
                        format!(
                            "α = {}° (verticale beugels), dus (6.8) geldt; (6.13) zou hier \
                             hetzelfde geven, want cot 90° = 0 en sin 90° = 1.",
                            nl(v.alpha_deg, 0)
                        ),
                    ];
                    notes.push(match v.f_ywd_bron {
                        Some(FywdBron::EigenFywk) => format!(
                            "f_ywd = f_ywk/γ_S = {} N/mm²: voor de beugels is een eigen \
                             staalkwaliteit opgegeven.",
                            nl(f_ywd, 1)
                        ),
                        _ => format!(
                            "f_ywd = f_yd = {} N/mm²: er is geen afwijkende beugelkwaliteit \
                             opgegeven, dus de staalsoort van de langswapening geldt.",
                            nl(f_ywd, 1)
                        ),
                    });
                    uit.push(stap(
                        "dwarskracht_v_rd_s",
                        "Weerstand van de dwarskrachtwapening",
                        r"V_{Rd,s}",
                        "art. 6.2.3(3) (6.8)",
                        r"V_{Rd,s} = \frac{A_{sw}}{s}\, z\, f_{ywd}\, \cot\theta".to_string(),
                        format!(
                            r"V_{{Rd,s}} = {asws} \cdot {z} \cdot {f} \cdot {ct} \cdot 10^{{-3}}",
                            asws = lx(asw_s, 5),
                            z = lx(v.z_mm, 1),
                            f = lx(f_ywd, 2),
                            ct = lx(v.cot_theta, 3)
                        ),
                        vec![
                            nv(r"A_{sw}", v.a_sw_mm2.unwrap_or(0.0), "mm²"),
                            nv("s", v.s_mm.unwrap_or(0.0), "mm"),
                            nv("z", v.z_mm, "mm"),
                            nv(r"f_{ywd}", f_ywd, "N/mm²"),
                            nv(r"\cot\theta", v.cot_theta, "-"),
                        ],
                        Some(v_rd_s),
                        "kN",
                        notes,
                    ));
                }
                _ => {
                    if let Some(reden) = &v.v_rd_s_reden {
                        uit.push(stap(
                            "dwarskracht_v_rd_s",
                            "Weerstand van de dwarskrachtwapening",
                            r"V_{Rd,s}",
                            "art. 6.2.3(3) (6.8)",
                            r"V_{Rd,s} = \frac{A_{sw}}{s}\, z\, f_{ywd}\, \cot\theta".to_string(),
                            String::new(),
                            vec![],
                            None,
                            "kN",
                            vec![format!("Niet bepaald: {reden}")],
                        ));
                    }
                }
            }

            if let Some(rd) = v.v_rd_kn {
                uit.push(stap(
                    "dwarskracht_v_rd",
                    "Dwarskrachtweerstand van het vakwerkmodel",
                    r"V_{Rd}",
                    "art. 6.2.3(3)",
                    r"V_{Rd} = \min(V_{Rd,s};\, V_{Rd,max})".to_string(),
                    format!(
                        r"V_{{Rd}} = \min({s};\, {m}) = {r} \text{{ kN}}",
                        s = lx(v.v_rd_s_kn.unwrap_or(f64::NAN), 1),
                        m = lx(v.v_rd_max_kn, 1),
                        r = lx(rd, 1)
                    ),
                    vec![
                        nv(r"V_{Rd,s}", v.v_rd_s_kn.unwrap_or(0.0), "kN"),
                        nv(r"V_{Rd,max}", v.v_rd_max_kn, "kN"),
                    ],
                    Some(rd),
                    "kN",
                    vec![match v.tak {
                        Some(VakwerkTak::WapeningVloeit) =>
                            "(6.8) is maatgevend: de dwarskrachtwapening vloeit.".to_string(),
                        Some(VakwerkTak::DrukdiagonaalBezwijkt) =>
                            "(6.9) is maatgevend: de betondrukdiagonaal bezwijkt. Méér beugels \
                             helpen niet."
                                .to_string(),
                        None => String::new(),
                    }],
                ));
            }
        } else if let Some(reden) = &self.vakwerk_reden {
            uit.push(stap(
                "dwarskracht_vakwerk_afgebroken",
                "Vakwerkmodel niet doorgerekend",
                "",
                "art. 6.2.3",
                String::new(),
                String::new(),
                vec![],
                None,
                "",
                vec![reden.clone()],
            ));
        }

        if let (Some(rd), Some(uc)) = (self.v_rd_kn, self.uc) {
            uit.push(stap(
                "dwarskracht_unity_check",
                "Unity check",
                "UC",
                "art. 6.2",
                r"UC = \frac{V_{Ed}}{V_{Rd}}".to_string(),
                format!(
                    r"UC = \frac{{{ed}}}{{{rd}}} = {uc}",
                    ed = lx(self.toetsende_v_ed_kn(), 1),
                    rd = lx(rd, 1),
                    uc = lx(uc, 3)
                ),
                vec![nv(r"V_{Ed}", self.toetsende_v_ed_kn(), "kN"), nv(r"V_{Rd}", rd, "kN")],
                Some(uc),
                "-",
                vec![],
            ));
        }

        uit
    }

    /// De V_Ed waarmee de unity check is gemaakt: in spoor A de (eventueel met
    /// β verminderde) waarde, in spoor B altijd de onverminderde.
    pub fn toetsende_v_ed_kn(&self) -> f64 {
        match self.spoor {
            Spoor::GeenBerekendeWapening => self.v_ed_voor_vrd_c_kn,
            Spoor::Vakwerkmodel => self.v_ed_kn,
        }
    }
}

// ── De toets in het contract van de andere toetsen ───────────────────────────

/// Art. 6.2 — de dwarskrachttoets als [`ResistanceCalc`], klaar voor de
/// orchestrator.
///
/// Zelfde vorm als [`crate::checks::check_bending_stress_block`]: een unity
/// check, een artikelverwijzing, een formule in LaTeX, een reeks
/// [`NamedValue`](nen_en_1993_1_1_section::NamedValue)s en de uitgeschreven afleiding.
pub fn check_shear(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    force_state: ForceStateSnapshot,
    opts: &ShearOptions,
) -> ResistanceCalc {
    let r = shear_resistance(section, cage, mat, &force_state, opts);

    let mut variables = vec![
        nv(r"V_{Ed}", r.v_ed_kn, "kN"),
        nv("b_w", r.vrd_c.b_w_mm, "mm"),
        nv("d", r.vrd_c.d_mm, "mm"),
        nv(r"A_{sl}", r.vrd_c.a_sl_mm2, "mm²"),
        nv(r"\rho_l", r.vrd_c.rho_l, "-"),
        nv("k", r.vrd_c.k, "-"),
        nv(r"\sigma_{cp}", r.vrd_c.sigma_cp_mpa, "N/mm²"),
        nv(r"C_{Rd,c}", r.vrd_c.c_rd_c, "-"),
        nv(r"v_{min}", r.vrd_c.v_min_mpa, "N/mm²"),
        nv(r"V_{Rd,c}", r.vrd_c.v_rd_c_kn, "kN"),
    ];
    if let Some(v) = &r.vakwerk {
        variables.push(nv("z", v.z_mm, "mm"));
        variables.push(nv(r"\cot\theta", v.cot_theta, "-"));
        variables.push(nv(r"\nu_1", v.nu1, "-"));
        variables.push(nv(r"\alpha_{cw}", v.alpha_cw, "-"));
        variables.push(nv(r"V_{Rd,max}", v.v_rd_max_kn, "kN"));
        if let Some(s) = v.v_rd_s_kn {
            variables.push(nv(r"V_{Rd,s}", s, "kN"));
        }
    }

    // De vormaannamen van de doorsnede reizen met elk resultaat mee, net als
    // bij de buigtoets.
    let mut notes = section.assumptions();
    notes.extend(r.notes.iter().cloned());

    let formula_latex = match r.spoor {
        Spoor::GeenBerekendeWapening => {
            r"V_{Rd} = V_{Rd,c} = \max\big( (6.2.a); (6.2.b) \big)".to_string()
        }
        Spoor::Vakwerkmodel => r"V_{Rd} = \min(V_{Rd,s};\, V_{Rd,max})".to_string(),
    };
    let article = match r.spoor {
        Spoor::GeenBerekendeWapening => "art. 6.2.2(1) (6.2.a/6.2.b)".to_string(),
        Spoor::Vakwerkmodel => "art. 6.2.3(3) (6.8) en (6.9)".to_string(),
    };

    let deelstappen = r.deelstappen();
    let ed = r.toetsende_v_ed_kn();

    match (r.v_rd_kn, r.uc) {
        (Some(rd), Some(uc)) => {
            let applicable = r.v_ed_kn > 1e-9;
            ResistanceCalc {
                id: "6.2_shear".to_string(),
                title: "Dwarskracht".to_string(),
                article,
                force_state,
                formula_latex,
                variables,
                deelstappen,
                value: rd,
                unit: "kN".to_string(),
                uc: Some(UnityCheck {
                    ed,
                    rd,
                    uc,
                    formula_latex: r"V_{Ed} / V_{Rd}".to_string(),
                }),
                status: if !applicable {
                    CheckStatus::NotApplicable
                } else if uc <= 1.0 {
                    CheckStatus::Ok
                } else {
                    CheckStatus::NotOk
                },
                notes,
            }
        }
        _ => {
            if let Some(reden) = &r.reden {
                notes.push(format!(
                    "De dwarskrachttoets is niet afgerekend: {reden} Er is met opzet niets \
                     aangenomen — de norm kent hier geen standaardwaarde."
                ));
            }
            ResistanceCalc {
                id: "6.2_shear".to_string(),
                title: "Dwarskracht".to_string(),
                article,
                force_state,
                formula_latex,
                variables,
                deelstappen,
                value: 0.0,
                unit: "kN".to_string(),
                uc: None,
                status: CheckStatus::NotApplicable,
                notes,
            }
        }
    }
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

    fn snap(n_kn: f64, v_kn: f64, m_knm: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 1,
            position_mm: 0.0,
            forces: InternalForces {
                n_ed: n_kn,
                vz_ed: v_kn,
                my_ed: m_knm,
                ..Default::default()
            },
        }
    }

    fn c30() -> DesignMaterial {
        DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        )
    }

    /// 300 × 500, dekking 30, beugel Ø8, onder 3Ø16 — zonder beugelgegevens.
    fn ligger() -> (ConcreteSection, ReinforcementCage) {
        (
            ConcreteSection::new(300.0, 500.0),
            ReinforcementCage {
                cover_mm: 30.0,
                stirrup_diameter_mm: 8.0,
                top: RebarRow { count: 0, diameter_mm: 12.0 },
                bottom: RebarRow { count: 3, diameter_mm: 16.0 },
                ..ReinforcementCage::default()
            },
        )
    }

    #[test]
    fn nb_waarden_staan_vast() {
        // NB bij 6.2.2(1): C_Rd,c = 0,18/γ_C — een uitdrukking, geen getal.
        assert_relative_eq!(c_rd_c(1.5), 0.12, max_relative = 1e-12);
        assert_relative_eq!(c_rd_c(1.2), 0.15, max_relative = 1e-12);
        assert_relative_eq!(K1_NB, 0.15);
        // NB bij 6.2.2(6): ν = 0,6[1 − f_ck/250]. C30/37: 0,6 · 0,88 = 0,528.
        assert_relative_eq!(nu_gescheurd_beton(30.0), 0.528, max_relative = 1e-12);
        // C20/25: 0,6 · (1 − 0,08) = 0,552.
        assert_relative_eq!(nu_gescheurd_beton(20.0), 0.552, max_relative = 1e-12);
        assert_relative_eq!(COT_THETA_MIN, 1.0);
        assert_relative_eq!(COT_THETA_MAX, 2.5);
    }

    #[test]
    fn k_wordt_op_2_afgekapt_onder_200_mm() {
        // d = 454 mm: k = 1 + √(200/454) = 1 + 0,6637233 = 1,6637233.
        let (k, begrensd) = k_factor(454.0);
        assert_relative_eq!(k, 1.663_723_3, max_relative = 1e-6);
        assert!(!begrensd);
        // d = 200 mm: k = 1 + 1 = 2,0 — precies op de grens, niet afgekapt.
        let (k, begrensd) = k_factor(200.0);
        assert_relative_eq!(k, 2.0, max_relative = 1e-12);
        assert!(!begrensd);
        // d = 110 mm: k = 1 + 1,3484 = 2,3484 → afgekapt op 2,0.
        let (k, begrensd) = k_factor(110.0);
        assert_relative_eq!(k, 2.0, max_relative = 1e-12);
        assert!(begrensd);
    }

    #[test]
    fn v_min_volgt_6_3n() {
        // k = 2,0 en f_ck = 20: 0,035 · 2^1,5 · √20
        //                     = 0,035 · 2,8284271 · 4,4721360 = 0,4427189 N/mm².
        assert_relative_eq!(v_min_mpa(2.0, 20.0), 0.442_718_9, max_relative = 1e-6);
        // k = 1,6637233 en f_ck = 30: k^1,5 = 1,6637233 · 1,2898537 = 2,14595965;
        // 0,035 · 2,14595965 · 5,47722558 = 0,035 · 11,7539051 = 0,41138668.
        assert_relative_eq!(v_min_mpa(1.663_723_3, 30.0), 0.411_386_7, max_relative = 1e-6);
    }

    #[test]
    fn v_rd_c_handberekening_zonder_normaalkracht() {
        let (s, k) = ligger();
        let m = c30();
        let r = shear_resistance(&s, &k, &m, &snap(0.0, 40.0, 100.0), &ShearOptions::default());
        // d = 500 − (30 + 8 + 16/2) = 454 mm; A_sl = 3·π/4·16² = 603,18579 mm².
        assert_relative_eq!(r.vrd_c.d_mm, 454.0, max_relative = 1e-12);
        assert_relative_eq!(r.vrd_c.a_sl_mm2, 603.185_789, max_relative = 1e-6);
        // ρ_l = 603,18579/(300·454) = 0,00442868.
        assert_relative_eq!(r.vrd_c.rho_l, 0.004_428_68, max_relative = 1e-5);
        // (6.2.a) = (0,12 · 1,6637233 · (13,286045)^(1/3)) · 300 · 454
        //         = 0,4728496 · 136200 = 64 402 N = 64,40 kN.
        assert_relative_eq!(r.vrd_c.v_6_2a_kn, 64.402, max_relative = 1e-4);
        // (6.2.b) = 0,41138668 · 136200 = 56 030,9 N = 56,031 kN.
        assert_relative_eq!(r.vrd_c.v_6_2b_kn, 56.031, max_relative = 1e-4);
        // De GROOTSTE van beide, dus (6.2.a).
        assert_relative_eq!(r.vrd_c.v_rd_c_kn, 64.402, max_relative = 1e-4);
        assert_eq!(r.vrd_c.tak, VrdCTak::Formule62a);
        assert_eq!(r.spoor, Spoor::GeenBerekendeWapening);
        assert_relative_eq!(r.uc.unwrap(), 40.0 / 64.402, max_relative = 1e-4);
    }

    #[test]
    fn drukkracht_verhoogt_v_rd_c_via_sigma_cp() {
        let (s, k) = ligger();
        let m = c30();
        // N_Ed = −450 kN (druk in de trek-positieve conventie van de kern).
        // A_c = 300 · 500 = 150 000 mm² → σ_cp = 450 000/150 000 = 3,0 N/mm².
        // Grens 0,2·f_cd = 0,2 · 20 = 4,0 N/mm², dus niet afgekapt.
        // (6.2.a) = (0,4728496 + 0,15 · 3,0) · 136200 = 0,9228496 · 136200
        //         = 125 692 N = 125,69 kN.
        let r = shear_resistance(&s, &k, &m, &snap(-450.0, 40.0, 100.0), &ShearOptions::default());
        assert_relative_eq!(r.vrd_c.sigma_cp_mpa, 3.0, max_relative = 1e-12);
        assert!(!r.vrd_c.sigma_cp_begrensd);
        assert_relative_eq!(r.vrd_c.v_6_2a_kn, 125.692, max_relative = 1e-4);
        // (6.2.b) = (0,4113873 + 0,45) · 136200 = 117 321 N.
        assert_relative_eq!(r.vrd_c.v_6_2b_kn, 117.321, max_relative = 1e-4);
        assert_relative_eq!(r.vrd_c.v_rd_c_kn, 125.692, max_relative = 1e-4);
    }

    #[test]
    fn sigma_cp_wordt_op_0_2_f_cd_afgekapt() {
        let (s, k) = ligger();
        let m = c30();
        // N_Ed = −900 kN → σ_cp = 6,0 N/mm² > 0,2·f_cd = 4,0 → afgekapt.
        let r = shear_resistance(&s, &k, &m, &snap(-900.0, 40.0, 100.0), &ShearOptions::default());
        assert!(r.vrd_c.sigma_cp_begrensd);
        assert_relative_eq!(r.vrd_c.sigma_cp_mpa, 4.0, max_relative = 1e-12);
    }

    #[test]
    fn trek_verlaagt_v_rd_c() {
        let (s, k) = ligger();
        let m = c30();
        // N_Ed = +150 kN (trek) → σ_cp = −1,0 N/mm²; k₁·σ_cp = −0,15.
        // (6.2.a) = (0,4728496 − 0,15) · 136200 = 43 972 N = 43,97 kN.
        let r = shear_resistance(&s, &k, &m, &snap(150.0, 20.0, 100.0), &ShearOptions::default());
        assert_relative_eq!(r.vrd_c.sigma_cp_mpa, -1.0, max_relative = 1e-12);
        assert_relative_eq!(r.vrd_c.v_6_2a_kn, 43.972, max_relative = 1e-4);
        // Zonder z (want er IS normaalkracht) vervalt de vakwerktak met reden.
        assert!(r.vakwerk.is_none());
        assert!(r.vakwerk_reden.as_ref().unwrap().contains("6.2.3(1)"));
    }

    #[test]
    fn zonder_beugelgegevens_geen_v_rd_s_maar_wel_v_rd_max() {
        let (s, k) = ligger();
        let m = c30();
        // V_Ed = 200 kN > V_Rd,c = 64,4 kN → spoor B, maar de korf heeft geen
        // beugelafstand en geen aantal benen.
        let r = shear_resistance(&s, &k, &m, &snap(0.0, 200.0, 100.0), &ShearOptions::default());
        assert_eq!(r.spoor, Spoor::Vakwerkmodel);
        let v = r.vakwerk.as_ref().unwrap();
        assert!(v.v_rd_s_kn.is_none());
        assert!(v.v_rd_max_kn > 0.0);
        assert!(r.v_rd_kn.is_none());
        assert!(r.reden.as_ref().unwrap().contains("hart-op-hartafstand"));
    }
}
