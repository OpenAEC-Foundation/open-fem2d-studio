//! M-N-κ-berekening van de doorsnede met wapeningskorf.
//!
//! Uitgangspunten, 6.1(2):
//! * vlakke doorsneden blijven vlak — de rek is lineair over de hoogte:
//!   ε(z) = ε₀ + κ·(z − h/2), met ε₀ de rek in het midden van de doorsnede;
//! * de rek van de aanhechtende wapening is gelijk aan die van het
//!   omringende beton;
//! * de treksterkte van beton wordt verwaarloosd;
//! * de spanningen volgen uit de rekendiagrammen van 3.1.7 (parabool-
//!   rechthoek) en 3.2.7 (bilineair).
//!
//! De betonspanning wordt over de hoogte geïntegreerd door de doorsnede in
//! `n_strips` even hoge stroken te verdelen en per strook de spanning in het
//! midden te nemen (middelpuntregel). Dat is de "verdeling in delen" die de
//! gebruiker instelt; de fout neemt kwadratisch af met het aantal stroken
//! (de parabool is glad en de overgang naar het plateau is C¹). De tests in
//! `tests/handberekening.rs` laten de convergentie zien.
//!
//! Heeft de doorsnede meer dan één band — een T of een L — dan krijgt **elke
//! band zijn eigen stroken**, evenredig met zijn hoogte, zodat er nooit een
//! strook óver de sprong in b(z) heen ligt. Daar zou de middelpuntregel
//! eerste-orde worden en de kwadratische convergentie inzakken;
//! `tests/vormen.rs` bewaakt dat. De vorm van de doorsnede komt in deze
//! module verder nergens voor: de rekengang kijkt naar de banden, niet naar
//! het etiket.
//!
//! Bezwijken, 6.1(3)–(6) en figuur 6.1:
//! * ligt de neutrale lijn in de doorsnede, dan is de drukrek aan de meest
//!   gedrukte vezel begrensd op ε_cu2;
//! * staat de hele doorsnede onder druk, dan is niet de randrek maar de rek
//!   op afstand h·(1 − ε_c2/ε_cu2) van de meest gedrukte vezel begrensd op
//!   ε_c2 (het draaipunt C van figuur 6.1; bij κ = 0 is dat 6.1(4): zuivere
//!   druk begrensd op ε_c2). De figuur zelf is in de tekstextractie niet
//!   leesbaar; deze constructie is de gebruikelijke lezing ervan en sluit bij
//!   x = h aan op de eerste regel;
//! * de trekrek van het staal is begrensd op ε_ud (3.2.7(2)a, NB: 0,9·ε_uk).
//!   Bij de horizontale tak (3.2.7(2)b) eist de norm geen rekgrens; het
//!   diagram moet toch ergens eindigen en gebruikt dan dezelfde ε_ud als
//!   praktisch eindpunt — dat staat in het resultaat als
//!   [`FailureMode::SteelStrainLimit`] en niet als normbezwijken.
//!
//! Vereenvoudiging: het door de wapening verdrongen beton wordt niet van de
//! betondrukkracht afgetrokken — dezelfde vereenvoudiging als in de
//! klassieke handberekening, zodat beide sporen vergelijkbaar blijven. Het
//! effect is van de orde A_s/A_c (≈ 0,5 %).
//!
//! Tekenconventie **inwendig**: druk positief; κ > 0 = druk boven, trek
//! onder (positief moment in de conventie van `mechanics`). Aan de
//! buitengrens (`n_ed_kn`, `m_knm`) geldt de `mechanics`-conventie: N
//! positief = trek, M positief = trek onder.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::section::{mirrored_layers, ConcreteSection, RebarLayer, RectConcreteSection};
use crate::stress_strain::DesignMaterial;

/// Standaardaantal stroken. Bij 50 stroken ligt de integratiefout van de
/// betondrukkracht onder 10⁻⁴ relatief (zie de convergentietest).
pub const DEFAULT_N_STRIPS: usize = 50;

/// Aantal stroken begrensd tot dit maximum, om een dwaze invoer niet in een
/// seconden durende berekening te laten ontaarden.
pub const MAX_N_STRIPS: usize = 2000;

/// Wijze van bezwijken (einde van het M-κ-diagram).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum FailureMode {
    /// Beton bereikt ε_cu2 (of ε_c2 bij een geheel gedrukte doorsnede), 6.1(3)/(4).
    ConcreteCrushing,
    /// Staal bereikt ε_ud bij de hellende tak (3.2.7(2)a).
    SteelRupture,
    /// Staal bereikt ε_ud bij de horizontale tak: geen normbezwijken, maar
    /// het praktische eindpunt van het diagram (zie moduledoc).
    SteelStrainLimit,
    /// Bij κ = 0 is al geen evenwicht mogelijk: |N_Ed| overschrijdt de
    /// normaalkrachtcapaciteit.
    AxialCapacityExceeded,
    /// Geen evenwicht gevonden (numeriek).
    NoEquilibrium,
}

/// Rek- en spanningstoestand van de doorsnede bij één (N, κ).
#[derive(Clone, Debug, PartialEq)]
pub struct SectionState {
    /// Kromming in 1/m (positief: druk boven).
    pub kappa_per_m: f64,
    /// Rek in het midden van de doorsnede (druk positief).
    pub eps_0: f64,
    /// Rek aan de bovenrand (z = h) en onderrand (z = 0), druk positief.
    pub eps_top: f64,
    pub eps_bottom: f64,
    /// Hoogte van de drukzone vanaf de meest gedrukte rand, mm. `None` als
    /// de doorsnede geheel onder trek staat; `h` als hij geheel onder druk staat.
    pub x_mm: Option<f64>,
    /// Normaalkracht in kN (trek positief, `mechanics`-conventie).
    pub n_kn: f64,
    /// Buigend moment in kNm (trek onder positief).
    pub m_knm: f64,
    /// Betondrukkracht in kN en de arm van zijn resultante t.o.v. het midden, mm.
    pub f_c_kn: f64,
    pub z_c_mm: f64,
    /// Per wapeningslaag: rek (druk positief), spanning (N/mm²), kracht (kN, druk positief).
    pub eps_s: Vec<f64>,
    pub sigma_s: Vec<f64>,
    pub f_s_kn: Vec<f64>,
}

impl SectionState {
    /// Grootste drukrek in het beton.
    pub fn eps_c_max(&self) -> f64 {
        self.eps_top.max(self.eps_bottom).max(0.0)
    }

    /// Grootste trekrek in het staal (positief getal; 0 als geen laag trekt).
    pub fn eps_s_tension_max(&self) -> f64 {
        self.eps_s.iter().fold(0.0_f64, |m, &e| m.max(-e))
    }
}

/// Eén punt van het M-κ-diagram.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct MnKappaPoint {
    pub kappa_per_m: f64,
    pub m_knm: f64,
    /// Drukrek boven en onder (druk positief), dimensieloos.
    pub eps_top: f64,
    pub eps_bottom: f64,
    /// Hoogte van de drukzone vanaf de gedrukte rand, mm (0 als er geen druk is).
    pub x_mm: f64,
}

/// Het M-κ-diagram bij vaste N, tot bezwijken.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct MnKappaDiagram {
    /// Normaalkracht waarbij het diagram is bepaald (kN, trek positief).
    pub n_kn: f64,
    /// Richting van het moment waarvoor is gerekend (+1: trek onder; −1: trek boven).
    pub moment_sign: f64,
    /// Punten van κ = 0 tot κ_u, in de richting `moment_sign` (M ≥ 0).
    pub points: Vec<MnKappaPoint>,
    /// Kromming en moment bij bezwijken.
    pub kappa_u_per_m: f64,
    pub m_u_knm: f64,
    /// Grootste moment op het diagram (de momentweerstand M_Rd bij deze N).
    pub m_max_knm: f64,
    /// Kromming en moment waarbij de eerste wapeningslaag gaat vloeien (ε ≥ ε_yd).
    pub kappa_y_per_m: Option<f64>,
    pub m_y_knm: Option<f64>,
    pub failure_mode: FailureMode,
    /// Drukzonehoogte en rekken bij bezwijken.
    pub x_u_mm: f64,
    pub eps_c_u: f64,
    pub eps_s_u: f64,
    pub n_strips: u32,
}

/// Eén punt van het N-M-interactiediagram (bezwijkomhullende).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct InteractionPoint {
    /// Normaalkracht in kN (trek positief).
    pub n_kn: f64,
    /// Momentweerstand bij die normaalkracht, kNm (≥ 0).
    pub m_rd_knm: f64,
}

/// Instellingen van de berekening.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MnKappaOptions {
    /// Aantal stroken voor de integratie van de betonspanning.
    pub n_strips: usize,
}

impl Default for MnKappaOptions {
    fn default() -> Self {
        Self { n_strips: DEFAULT_N_STRIPS }
    }
}

impl MnKappaOptions {
    fn strips(&self) -> usize {
        self.n_strips.clamp(1, MAX_N_STRIPS)
    }
}

/// Inwendige krachten (N in N, druk positief; M in N·mm, druk boven positief)
/// bij rek ε₀ in het midden en kromming κ (1/mm).
///
/// Levert ook de betondrukkracht en zijn moment apart, voor de rapportage.
pub fn internal_forces(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    eps_0: f64,
    kappa_per_mm: f64,
    n_strips: usize,
) -> InternalForces {
    let h = section.h_mm;
    let n = n_strips.clamp(1, MAX_N_STRIPS);
    let mut n_c = 0.0;
    let mut m_c = 0.0;
    // `sigma_c` is het parabool-rechthoekdiagram van 3.1.7(1) zolang het
    // materiaal geen niet-lineaire kromme draagt (`nonlinear: None`, de
    // stand van `DesignMaterial::new`) — de doorsnedetoetsing rekent dus
    // onveranderd. Met `DesignMaterial::nonlinear` is het (3.14) van
    // 3.1.5, zoals 5.8.6(3) voor de constructieve berekening voorschrijft.
    match section.bands() {
        // Eén band — de rechthoek. Letterlijk de lus die er altijd stond:
        // dezelfde strookhoogte, dezelfde middelpunten, dezelfde volgorde van
        // vermenigvuldigen. De rechthoek verschuift dus geen bit.
        [enige] => {
            let dz = h / n as f64;
            for i in 0..n {
                let z = (i as f64 + 0.5) * dz;
                let arm = z - h / 2.0;
                let sigma = mat.sigma_c(eps_0 + kappa_per_mm * arm);
                let f = sigma * enige.b_mm * dz;
                n_c += f;
                m_c += f * arm;
            }
        }
        // Meer banden: elke band krijgt zijn eigen stroken, evenredig met zijn
        // hoogte. Zo ligt er nooit een strook óver de sprong in b(z) heen —
        // dat zou de middelpuntregel bij de overgang eerste-orde maken en de
        // kwadratische convergentie van `stroken_convergentie_analytisch`
        // bederven. Er is bewust geen voorgerekende tabel met b·dz: dan zou
        // hier σ·(b·dz) staan waar nu (σ·b)·dz staat, en dat breekt de
        // bit-identiteit met de rechthoek. De prijs is twee delingen per band.
        banden => {
            for band in banden {
                let hb = band.height_mm();
                if hb <= 0.0 {
                    continue;
                }
                let nb = ((n as f64 * hb / h).round() as usize).max(1);
                let dz = hb / nb as f64;
                for i in 0..nb {
                    let z = band.z0_mm + (i as f64 + 0.5) * dz;
                    let arm = z - h / 2.0;
                    let sigma = mat.sigma_c(eps_0 + kappa_per_mm * arm);
                    let f = sigma * band.b_mm * dz;
                    n_c += f;
                    m_c += f * arm;
                }
            }
        }
    }
    let mut n_s = 0.0;
    let mut m_s = 0.0;
    let mut eps_s = Vec::with_capacity(layers.len());
    let mut sigma_s = Vec::with_capacity(layers.len());
    let mut f_s = Vec::with_capacity(layers.len());
    for l in layers {
        let arm = l.z_mm - h / 2.0;
        let e = eps_0 + kappa_per_mm * arm;
        let s = mat.steel.sigma(e);
        let f = s * l.area_mm2;
        n_s += f;
        m_s += f * arm;
        eps_s.push(e);
        sigma_s.push(s);
        f_s.push(f);
    }
    InternalForces { n_c, m_c, n_s, m_s, eps_s, sigma_s, f_s }
}

/// Uitkomst van [`internal_forces`], in N en N·mm, druk positief.
#[derive(Clone, Debug, PartialEq)]
pub struct InternalForces {
    pub n_c: f64,
    pub m_c: f64,
    pub n_s: f64,
    pub m_s: f64,
    pub eps_s: Vec<f64>,
    pub sigma_s: Vec<f64>,
    pub f_s: Vec<f64>,
}

impl InternalForces {
    pub fn n(&self) -> f64 {
        self.n_c + self.n_s
    }
    pub fn m(&self) -> f64 {
        self.m_c + self.m_s
    }
}

/// Zoek ε₀ zodat de inwendige normaalkracht gelijk is aan `n_target` (N,
/// druk positief) bij kromming `kappa_per_mm`. De inwendige normaalkracht is
/// monotoon niet-dalend in ε₀ (elke spanning is niet-dalend in de rek), dus
/// bisectie volstaat. `None` als `n_target` buiten het bereik van de
/// doorsnede ligt (alles vloeit / alles op f_cd).
pub fn solve_eps0(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_target: f64,
    kappa_per_mm: f64,
    n_strips: usize,
) -> Option<f64> {
    // Ruime grenzen: bij |ε₀| = 0,5 staat alles op zijn plateau, ook bij grote κ
    // (κ·h/2 blijft ver onder 0,5 voor elke realistische kromming).
    let mut lo = -0.5_f64;
    let mut hi = 0.5_f64;
    let f = |e: f64| internal_forces(section, layers, mat, e, kappa_per_mm, n_strips).n();
    let n_lo = f(lo);
    let n_hi = f(hi);
    let tol = 1e-6 * (n_hi - n_lo).abs().max(1.0);
    if n_target < n_lo - tol || n_target > n_hi + tol {
        return None;
    }
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        let n_mid = f(mid);
        if (n_mid - n_target).abs() <= tol {
            // Verfijn nog even door te blijven halveren — de rek moet ook
            // scherp zijn, niet alleen de kracht.
            if hi - lo < 1e-12 {
                return Some(mid);
            }
        }
        if n_mid < n_target {
            lo = mid;
        } else {
            hi = mid;
        }
        if hi - lo < 1e-13 {
            return Some(0.5 * (lo + hi));
        }
    }
    Some(0.5 * (lo + hi))
}

/// De volledige toestand bij normaalkracht `n_ed_kn` (kN, trek positief) en
/// kromming `kappa_per_m` (1/m, positief = druk boven). `None` als geen
/// evenwicht mogelijk is.
pub fn solve_state(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    kappa_per_m: f64,
    opts: &MnKappaOptions,
) -> Option<SectionState> {
    let n_target = -n_ed_kn * 1e3; // trek+ → druk+
    let kappa_per_mm = kappa_per_m * 1e-3;
    let eps_0 = solve_eps0(section, layers, mat, n_target, kappa_per_mm, opts.strips())?;
    Some(state_from(section, layers, mat, eps_0, kappa_per_mm, opts.strips()))
}

/// De volledige toestand bij een **al bekende** rek ε₀ en kromming (1/mm) —
/// zonder opnieuw naar evenwicht te zoeken. [`crate::stiffness`] gebruikt dit
/// om de toestand bij zijn eigen oplossing uit te schrijven, zodat er geen
/// tweede, iets afwijkende ε₀ ontstaat.
pub fn state_at(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    eps_0: f64,
    kappa_per_mm: f64,
    opts: &MnKappaOptions,
) -> SectionState {
    state_from(section, layers, mat, eps_0, kappa_per_mm, opts.strips())
}

fn state_from(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    eps_0: f64,
    kappa_per_mm: f64,
    n_strips: usize,
) -> SectionState {
    let h = section.h_mm;
    let fi = internal_forces(section, layers, mat, eps_0, kappa_per_mm, n_strips);
    let eps_top = eps_0 + kappa_per_mm * h / 2.0;
    let eps_bottom = eps_0 - kappa_per_mm * h / 2.0;
    let x_mm = neutral_axis_depth(eps_top, eps_bottom, h);
    let f_c_kn = fi.n_c * 1e-3;
    let z_c_mm = if fi.n_c.abs() > 1e-9 { fi.m_c / fi.n_c } else { 0.0 };
    SectionState {
        kappa_per_m: kappa_per_mm * 1e3,
        eps_0,
        eps_top,
        eps_bottom,
        x_mm,
        n_kn: -fi.n() * 1e-3,
        m_knm: fi.m() * 1e-6,
        f_c_kn,
        z_c_mm,
        eps_s: fi.eps_s,
        sigma_s: fi.sigma_s,
        f_s_kn: fi.f_s.iter().map(|f| f * 1e-3).collect(),
    }
}

/// Hoogte van de drukzone vanaf de meest gedrukte rand.
fn neutral_axis_depth(eps_top: f64, eps_bottom: f64, h: f64) -> Option<f64> {
    let (hi, lo) = if eps_top >= eps_bottom { (eps_top, eps_bottom) } else { (eps_bottom, eps_top) };
    if hi <= 0.0 {
        None
    } else if lo >= 0.0 {
        Some(h)
    } else {
        Some(h * hi / (hi - lo))
    }
}

/// Toets de toestand aan de rekgrenzen van 6.1(3)–(4)/figuur 6.1 en
/// 3.2.7(2). `None` = binnen de grenzen.
pub fn exceeded_limit(state: &SectionState, mat: &DesignMaterial, h_mm: f64) -> Option<FailureMode> {
    let c = &mat.concrete;
    let tol = 1e-9;
    let eps_hi = state.eps_top.max(state.eps_bottom);
    let eps_lo = state.eps_top.min(state.eps_bottom);
    if eps_lo >= -tol {
        // Geheel gedrukt: draaipunt C op afstand h·(1 − ε_c2/ε_cu2) van de
        // meest gedrukte vezel is begrensd op ε_c2.
        let h_c = h_mm * (1.0 - c.eps_c2 / c.eps_cu2);
        let kappa_abs = (state.eps_top - state.eps_bottom).abs() / h_mm;
        let eps_at_c = eps_hi - kappa_abs * h_c;
        if eps_at_c > c.eps_c2 + tol {
            return Some(FailureMode::ConcreteCrushing);
        }
    } else if eps_hi > c.eps_cu2 + tol {
        return Some(FailureMode::ConcreteCrushing);
    }
    if state.eps_s_tension_max() > mat.steel.eps_ud + tol {
        return Some(if mat.steel.has_strain_limit() {
            FailureMode::SteelRupture
        } else {
            FailureMode::SteelStrainLimit
        });
    }
    None
}

/// Aantal punten waarmee het diagram wordt uitgeschreven (κ = 0 t/m κ_u).
const DIAGRAM_POINTS: usize = 60;

/// Het M-κ-diagram bij vaste normaalkracht `n_ed_kn` (kN, trek positief),
/// voor een moment met teken `moment_sign` (+1: trek onder; −1: trek boven).
/// De punten lopen van κ = 0 tot het bezwijkpunt κ_u.
pub fn mn_kappa_diagram(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    moment_sign: f64,
    opts: &MnKappaOptions,
) -> MnKappaDiagram {
    let sign = if moment_sign < 0.0 { -1.0 } else { 1.0 };
    // Bij een negatief moment wordt de hele doorsnede omgeklapt en als
    // positief doorgerekend: niet alleen de korf, ook de BANDEN. Bij een T
    // hoort de flens dan onder — een negatief moment drukt op het lijf en
    // trekt aan de flens.
    let sec_eig: ConcreteSection;
    let lagen_eig: Vec<RebarLayer>;
    let (section, lagen): (&ConcreteSection, &[RebarLayer]) = if sign < 0.0 {
        sec_eig = section.mirrored();
        lagen_eig = mirrored_layers(layers, section.h_mm);
        (&sec_eig, &lagen_eig)
    } else {
        (section, layers)
    };
    let h = section.h_mm;
    let n_strips = opts.strips() as u32;

    let leeg = |mode: FailureMode| MnKappaDiagram {
        n_kn: n_ed_kn,
        moment_sign: sign,
        points: vec![],
        kappa_u_per_m: 0.0,
        m_u_knm: 0.0,
        m_max_knm: 0.0,
        kappa_y_per_m: None,
        m_y_knm: None,
        failure_mode: mode,
        x_u_mm: 0.0,
        eps_c_u: 0.0,
        eps_s_u: 0.0,
        n_strips,
    };

    // 1. κ = 0: is er überhaupt evenwicht binnen de rekgrenzen?
    let s0 = match solve_state(section, lagen, mat, n_ed_kn, 0.0, opts) {
        Some(s) => s,
        None => return leeg(FailureMode::AxialCapacityExceeded),
    };
    if exceeded_limit(&s0, mat, h).is_some() {
        return leeg(FailureMode::AxialCapacityExceeded);
    }

    // 2. Opvoeren van κ tot bezwijken. Stap: ongeveer 0,1 ‰ randrek per stap.
    let step = 2.0e-4 / h * 1e3; // 1/m
    let mut kappa_ok = 0.0_f64;
    let mut kappa_fail = None;
    let mut mode = FailureMode::NoEquilibrium;
    let mut k = step;
    for _ in 0..200_000 {
        match solve_state(section, lagen, mat, n_ed_kn, k, opts) {
            Some(s) => match exceeded_limit(&s, mat, h) {
                Some(m) => {
                    mode = m;
                    kappa_fail = Some(k);
                    break;
                }
                None => {
                    kappa_ok = k;
                    k += step;
                }
            },
            None => {
                mode = FailureMode::NoEquilibrium;
                kappa_fail = Some(k);
                break;
            }
        }
    }
    let Some(mut kappa_fail) = kappa_fail else {
        return leeg(FailureMode::NoEquilibrium);
    };

    // 3. Bezwijkpunt scherp stellen door bisectie tussen laatste goede en
    //    eerste foute kromming.
    for _ in 0..60 {
        let mid = 0.5 * (kappa_ok + kappa_fail);
        match solve_state(section, lagen, mat, n_ed_kn, mid, opts) {
            Some(s) => match exceeded_limit(&s, mat, h) {
                Some(m) => {
                    mode = m;
                    kappa_fail = mid;
                }
                None => kappa_ok = mid,
            },
            None => {
                mode = FailureMode::NoEquilibrium;
                kappa_fail = mid;
            }
        }
        if kappa_fail - kappa_ok < 1e-12 {
            break;
        }
    }
    let kappa_u = kappa_ok;
    let su = solve_state(section, lagen, mat, n_ed_kn, kappa_u, opts)
        .unwrap_or_else(|| s0.clone());

    // 4. Diagram uitschrijven.
    let mut points = Vec::with_capacity(DIAGRAM_POINTS + 1);
    let mut m_max = f64::MIN;
    for i in 0..=DIAGRAM_POINTS {
        let kap = kappa_u * i as f64 / DIAGRAM_POINTS as f64;
        let s = if i == DIAGRAM_POINTS {
            su.clone()
        } else {
            match solve_state(section, lagen, mat, n_ed_kn, kap, opts) {
                Some(s) => s,
                None => continue,
            }
        };
        m_max = m_max.max(s.m_knm);
        points.push(MnKappaPoint {
            kappa_per_m: s.kappa_per_m,
            m_knm: s.m_knm,
            eps_top: s.eps_top,
            eps_bottom: s.eps_bottom,
            x_mm: s.x_mm.unwrap_or(0.0),
        });
    }

    // 5. Vloeipunt: eerste κ waarbij een laag |ε_s| ≥ ε_yd bereikt.
    let vloeit = |s: &SectionState| s.eps_s.iter().any(|e| e.abs() >= mat.steel.eps_yd);
    let (kappa_y, m_y) = if vloeit(&su) && !vloeit(&s0) {
        let mut lo = 0.0_f64;
        let mut hi = kappa_u;
        for _ in 0..60 {
            let mid = 0.5 * (lo + hi);
            match solve_state(section, lagen, mat, n_ed_kn, mid, opts) {
                Some(s) if vloeit(&s) => hi = mid,
                Some(_) => lo = mid,
                None => break,
            }
            if hi - lo < 1e-12 {
                break;
            }
        }
        match solve_state(section, lagen, mat, n_ed_kn, hi, opts) {
            Some(s) => (Some(s.kappa_per_m), Some(s.m_knm)),
            None => (None, None),
        }
    } else {
        (None, None)
    };

    MnKappaDiagram {
        n_kn: n_ed_kn,
        moment_sign: sign,
        points,
        kappa_u_per_m: kappa_u,
        m_u_knm: su.m_knm,
        m_max_knm: if m_max == f64::MIN { 0.0 } else { m_max },
        kappa_y_per_m: kappa_y,
        m_y_knm: m_y,
        failure_mode: mode,
        x_u_mm: su.x_mm.unwrap_or(0.0),
        eps_c_u: su.eps_c_max(),
        eps_s_u: su.eps_s_tension_max(),
        n_strips,
    }
}

/// Normaalkrachtcapaciteit onder zuivere druk (kN, positief getal):
/// N_Rd,c = ∫σ_c dA + Σ A_s·σ_s bij ε = ε_c2 over de hele doorsnede (6.1(4)).
pub fn axial_compression_capacity_kn(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    opts: &MnKappaOptions,
) -> f64 {
    internal_forces(section, layers, mat, mat.concrete.eps_c2, 0.0, opts.strips()).n() * 1e-3
}

/// Normaalkrachtcapaciteit onder zuivere trek (kN, positief getal):
/// N_Rd,t = Σ A_s·σ_s(ε_ud) — beton draagt geen trek.
pub fn axial_tension_capacity_kn(layers: &[RebarLayer], mat: &DesignMaterial) -> f64 {
    layers.iter().map(|l| l.area_mm2 * mat.steel.sigma(mat.steel.eps_ud)).sum::<f64>() * 1e-3
}

/// N-M-interactiediagram: de momentweerstand M_Rd(N) voor `n_points`
/// normaalkrachten tussen de trek- en de drukcapaciteit, voor een moment met
/// teken `moment_sign`.
pub fn interaction_diagram(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    moment_sign: f64,
    n_points: usize,
    opts: &MnKappaOptions,
) -> Vec<InteractionPoint> {
    let n_t = axial_tension_capacity_kn(layers, mat); // trek, positief getal
    let n_c = axial_compression_capacity_kn(section, layers, mat, opts); // druk, positief getal
    let n = n_points.max(3);
    let mut uit = Vec::with_capacity(n);
    for i in 0..n {
        let t = i as f64 / (n - 1) as f64;
        // Van trek (+n_t) naar druk (−n_c) in de mechanics-conventie.
        let n_kn = n_t - t * (n_t + n_c);
        let d = mn_kappa_diagram(section, layers, mat, n_kn, moment_sign, opts);
        uit.push(InteractionPoint { n_kn, m_rd_knm: d.m_max_knm.max(0.0) });
    }
    uit
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::factors::DesignSituation;
    use crate::section::{RebarRow, ReinforcementCage};
    use crate::stress_strain::SteelBranch;
    use approx::assert_relative_eq;

    fn opzet() -> (RectConcreteSection, Vec<RebarLayer>, DesignMaterial) {
        let s = RectConcreteSection::new(300.0, 500.0);
        let k = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        };
        let m = DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        );
        (s, k.layers(500.0), m)
    }

    #[test]
    fn parabool_over_de_hele_hoogte_analytisch() {
        // Rek 0 onder, ε_c2 boven (n = 2), geen staal:
        //   F  = (2/3)·f_cd·b·h ;  M om het midden = f_cd·b·h²/12.
        let (s, _, m) = opzet();
        let eps_c2 = m.concrete.eps_c2;
        let f_exact = 2.0 / 3.0 * 20.0 * 300.0 * 500.0;
        let m_exact = 20.0 * 300.0 * 500.0_f64.powi(2) / 12.0;
        // Middelpuntregel: fout ∝ 1/n²; bij 400 stroken < 10⁻⁵ relatief.
        let fi = internal_forces(&s, &[], &m, eps_c2 / 2.0, eps_c2 / 500.0, 400);
        assert_relative_eq!(fi.n_c, f_exact, max_relative = 2e-6);
        assert_relative_eq!(fi.m_c, m_exact, max_relative = 1e-5);
    }

    #[test]
    fn evenwicht_wordt_gevonden_en_teken_klopt() {
        let (s, lagen, m) = opzet();
        // κ = 5·10⁻³/m: randrekken van de orde ±1,25 ‰.
        let st = solve_state(&s, &lagen, &m, 0.0, 0.005, &MnKappaOptions::default()).unwrap();
        assert!(st.n_kn.abs() < 1e-6);
        assert!(st.m_knm > 0.0, "positieve kromming → positief moment");
        assert!(st.eps_top > 0.0 && st.eps_bottom < 0.0);
        assert!(st.x_mm.unwrap() < 500.0);
        // Onderwapening (laag 0) trekt, bovenwapening (laag 1) drukt.
        assert!(st.eps_s[0] < 0.0 && st.eps_s[1] > 0.0);
    }

    #[test]
    fn negatief_moment_spiegelt_de_korf() {
        let (s, lagen, m) = opzet();
        let pos = mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &MnKappaOptions::default());
        let neg = mn_kappa_diagram(&s, &lagen, &m, 0.0, -1.0, &MnKappaOptions::default());
        // 2Ø12 boven draagt als trekwapening minder dan 3Ø16.
        assert!(neg.m_max_knm < pos.m_max_knm);
        assert!(neg.m_max_knm > 0.3 * pos.m_max_knm);
        assert_eq!(neg.moment_sign, -1.0);
    }

    #[test]
    fn te_grote_druk_geeft_axial_capacity_exceeded() {
        let (s, lagen, m) = opzet();
        let n_c = axial_compression_capacity_kn(&s, &lagen, &m, &MnKappaOptions::default());
        let d = mn_kappa_diagram(&s, &lagen, &m, -(n_c * 1.01), 1.0, &MnKappaOptions::default());
        assert_eq!(d.failure_mode, FailureMode::AxialCapacityExceeded);
        assert!(d.points.is_empty());
    }

    #[test]
    fn interactiediagram_is_nul_aan_de_uiteinden_en_positief_ertussen() {
        let (s, lagen, m) = opzet();
        let pts = interaction_diagram(&s, &lagen, &m, 1.0, 9, &MnKappaOptions { n_strips: 20 });
        assert_eq!(pts.len(), 9);
        assert!(pts[0].n_kn > 0.0 && pts[8].n_kn < 0.0);
        assert!(pts[0].m_rd_knm < 1.0 && pts[8].m_rd_knm < 1.0);
        assert!(pts[4].m_rd_knm > 50.0);
        // Maximale M ligt bij matige druk, niet bij N = 0.
        let m_bij_nul = pts.iter().min_by(|a, b| a.n_kn.abs().partial_cmp(&b.n_kn.abs()).unwrap()).unwrap();
        let m_max = pts.iter().map(|p| p.m_rd_knm).fold(0.0, f64::max);
        assert!(m_max >= m_bij_nul.m_rd_knm);
    }
}
