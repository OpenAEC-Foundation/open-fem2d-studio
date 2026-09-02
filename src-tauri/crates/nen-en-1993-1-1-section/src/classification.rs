//! NEN-EN 1993-1-1 §5.5 + Tabel 5.2 — doorsnedeclassificatie.
//!
//! Tabel 5.2 kent drie bladen, en welk blad geldt hangt af van het
//! doorsnedetype:
//!
//! * **Blad 1 — inwendige drukdelen** (een plaatdeel dat aan béíde randen
//!   door een aansluitend plaatdeel gesteund wordt): het lijf van een
//!   I-profiel of U-profiel, en *alle vier* de wanden van een koker.
//! * **Blad 2 — uitkragende flenzen** (aan één rand gesteund, andere rand
//!   vrij): de flenzen van een I-profiel en van een U-profiel.
//! * **Blad 3 — ronde buizen**: grenzen op d/t in plaats van c/t.
//!
//! Tot sept 2026 werden de I-profielregels (blad 1 voor het lijf + blad 2 voor
//! de flens) op élk profiel losgelaten, dus ook op kokers en ronde buizen. Een
//! kokerwand werd daardoor als uitkraging getoetst (grens 9ε/10ε/14ε in plaats
//! van 33ε/38ε/42ε) en een ronde buis als een fictief I-profiel. Gevolg: SHS
//! vanaf 120 mm en CHS vanaf 168,3 mm kwamen in klasse 3 uit in plaats van
//! klasse 1, waardoor met W_el in plaats van W_pl gerekend werd. Dat is
//! veilig-zijdig maar fout, en het laat de app onnodig zware profielen kiezen.
//!
//! Voor een **catalogusprofiel** doet [`classify_section`] dat met de maten uit
//! de database. Voor een uit platen **samengestelde** doorsnede bestaat die
//! kortere weg niet: daar loopt [`classify_composite`] tabel 5.2 per plaatdeel
//! af en geeft de ongunstigste klasse terug, inclusief het bepalende plaatdeel.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use section_properties::SectionProperties;
use section_properties::composite::{CompositeSection, Lamella};
use mechanics::InternalForces;
use crate::SteelGrade;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum CrossSectionClass { Class1, Class2, Class3, Class4 }

/// Doorsnedevorm, voor zover tabel 5.2 er onderscheid tussen maakt.
///
/// Dit is bewust géén kopie van de catalogus-enum `ProfileKind`: de norm kent
/// alleen het onderscheid dat bepaalt welk blad van tabel 5.2 geldt. SHS en
/// RHS vallen daarom samen in [`SectionShape::BoxSection`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SectionShape {
    /// Dubbelsymmetrisch I-/H-profiel: lijf inwendig, flenzen uitkragend.
    ISection,
    /// U-profiel: lijf inwendig, flenzen uitkragend over de volle breedte.
    Channel,
    /// Rechthoekige of vierkante koker: alle wanden inwendig.
    BoxSection,
    /// Ronde buis: blad 3, grenzen op d/t.
    CircularHollow,
}

pub fn epsilon(grade: &SteelGrade) -> f64 {
    (235.0 / grade.fy_mpa).sqrt()
}

/// Klasse uit een slankheid en de drie grenswaarden.
fn klasse_uit(slankheid: f64, g1: f64, g2: f64, g3: f64) -> CrossSectionClass {
    match slankheid {
        s if s <= g1 => CrossSectionClass::Class1,
        s if s <= g2 => CrossSectionClass::Class2,
        s if s <= g3 => CrossSectionClass::Class3,
        _ => CrossSectionClass::Class4,
    }
}

/// Blad 1, inwendig deel met lineair spanningsverloop (zuivere buiging):
/// 72ε / 83ε / 124ε. Bij noemenswaardige normaalkracht wordt het deel als
/// volledig gedrukt behandeld: 33ε / 38ε / 42ε.
fn grenzen_inwendig(eps: f64, zuivere_buiging: bool) -> (f64, f64, f64) {
    if zuivere_buiging {
        (72.0 * eps, 83.0 * eps, 124.0 * eps)
    } else {
        (33.0 * eps, 38.0 * eps, 42.0 * eps)
    }
}

/// Blad 1, inwendig deel onder gelijkmatige druk: 33ε / 38ε / 42ε.
fn grenzen_inwendig_druk(eps: f64) -> (f64, f64, f64) {
    (33.0 * eps, 38.0 * eps, 42.0 * eps)
}

/// Blad 2, uitkragende flens onder gelijkmatige druk: 9ε / 10ε / 14ε.
fn grenzen_uitkraging(eps: f64) -> (f64, f64, f64) {
    (9.0 * eps, 10.0 * eps, 14.0 * eps)
}

pub fn classify_section(
    p: &SectionProperties,
    grade: &SteelGrade,
    forces: &InternalForces,
    shape: SectionShape,
) -> CrossSectionClass {
    let eps = epsilon(grade);

    // Grove schakelaar tussen "zuivere buiging" en "gedrukt". Bij meer dan 5%
    // van de plastische normaalkrachtcapaciteit wordt het lijf als volledig
    // gedrukt getoetst; dat is veilig-zijdig ten opzichte van de exacte
    // α/ψ-formules van tabel 5.2.
    let n_ratio = forces.n_ed.abs() * 1000.0 / (p.area_mm2 * grade.fy_mpa);
    let zuivere_buiging = n_ratio < 0.05;

    match shape {
        SectionShape::CircularHollow => {
            // Blad 3: klasse 1 bij d/t ≤ 50ε², klasse 2 ≤ 70ε², klasse 3 ≤ 90ε².
            // h_mm is bij een ronde buis de uitwendige diameter d.
            let d_over_t = p.h_mm / p.tw_mm.max(1e-9);
            klasse_uit(d_over_t, 50.0 * eps * eps, 70.0 * eps * eps, 90.0 * eps * eps)
        }

        SectionShape::BoxSection => {
            // Alle vier de wanden zijn inwendige delen (blad 1).
            //
            // Voor c wordt de codificeerde standaardwaarde c = breedte − 3t
            // aangehouden. Tabel 5.2 laat formeel c = b − 2t − 2r_i toe, maar
            // de r-kolom in de catalogus is niet eenduidig een binnenradius
            // (bij warmvervaardigde kokers staat er ook 1,5t, wat op een
            // buitenradius wijst). b − 3t is bij elke r in de dataset de
            // grootste — en dus veilig-zijdige — van de twee waarden.
            let t = p.tw_mm.max(1e-9);
            let c_lijf = p.h_mm - 3.0 * t;
            let c_flens = p.b_mm - 3.0 * t;

            let (w1, w2, w3) = grenzen_inwendig(eps, zuivere_buiging);
            let lijf = klasse_uit(c_lijf / t, w1, w2, w3);

            // De flens (wand loodrecht op het buigende vlak) is over de volle
            // breedte gedrukt, ook bij zuivere buiging.
            let (f1, f2, f3) = grenzen_inwendig_druk(eps);
            let flens = klasse_uit(c_flens / t, f1, f2, f3);

            lijf.max(flens)
        }

        SectionShape::ISection | SectionShape::Channel => {
            // Lijf: inwendig deel tussen de flenzen, uitrondingen eraf.
            let c_lijf = p.h_mm - 2.0 * p.tf_mm - 2.0 * p.r_mm;
            let (w1, w2, w3) = grenzen_inwendig(eps, zuivere_buiging);
            let lijf = klasse_uit(c_lijf / p.tw_mm.max(1e-9), w1, w2, w3);

            // Flens: uitkraging. Bij een I-profiel kraagt de flens aan beide
            // zijden van het lijf uit, dus c = (b − t_w)/2 − r. Bij een
            // U-profiel zit het lijf aan de rand en kraagt de flens over de
            // volle breedte uit: c = b − t_w − r.
            let c_flens = match shape {
                SectionShape::Channel => p.b_mm - p.tw_mm - p.r_mm,
                _ => (p.b_mm - p.tw_mm) / 2.0 - p.r_mm,
            };
            let (f1, f2, f3) = grenzen_uitkraging(eps);
            let flens = klasse_uit(c_flens / p.tf_mm.max(1e-9), f1, f2, f3);

            lijf.max(flens)
        }
    }
}

impl PartialOrd for CrossSectionClass {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for CrossSectionClass {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (*self as u8).cmp(&(*other as u8))
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  D4.2 — samengestelde doorsneden: tabel 5.2 per plaatdeel
// ═══════════════════════════════════════════════════════════════════════════
//
// Een gewalst profiel laat zich met twee slankheden afdoen (h/t_w en b/t_f).
// Een uit platen samengestelde doorsnede niet: daar moet tabel 5.2 op **elk
// plaatdeel afzonderlijk** worden losgelaten, met per deel
//
//   * de vlakke breedte `c` en de dikte `t`,
//   * de soort steuning — inwendig (blad 1) of uitkragend (blad 2),
//   * de elastische spanningsverhouding ψ = σ₂/σ₁ over dat deel,
//   * de plastische drukfractie α van dat deel.
//
// De doorsnedeklasse is de ongunstigste over alle gedrukte plaatdelen. Welk
// deel dat is, komt in het resultaat mee, zodat het rapport kan zeggen wáár de
// klasse vandaan komt.
//
// ## Hoe `c` uit de lamellen volgt
//
// Twee lamellen "raken" elkaar als een uiteinde van de een binnen een halve
// gezamenlijke wanddikte van de middellijn van de ander ligt — hetzelfde
// lasnaad-criterium dat `composite.rs` voor de welvingsberekening gebruikt. Het
// **knooppunt** ligt op het snijpunt van de twee (doorgetrokken) middellijnen.
// Op de as van een lamel geeft dat een reeks steunpunten; tussen twee
// steunpunten ligt een inwendig deel, tussen het buitenste steunpunt en een
// vrij uiteinde een uitkraging. `c` is telkens de **vrije** breedte: de afstand
// tussen de knooppunten minus de halve dikten van de aansluitende platen.
//
// Voor de gelaste I met flenzen 200×15 en lijf 400×10 (h = 430) levert dat
// precies de handwaarden:
//   * lijf: knooppunten op z = ±207,5 (hart flens) ⇒ c = 415 − 7,5 − 7,5 = 400,
//     dus c/t = 40;
//   * flens: één knooppunt in het midden (hart lijf) ⇒ twee uitkragingen met
//     c = 100 − 5 = 95, dus c/t = 95/15 = 6,33.

/// Soort plaatdeel volgens tabel 5.2.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Plaatdeelsoort {
    /// Blad 1 — inwendig drukdeel: aan béíde randen door een aansluitend
    /// plaatdeel gesteund.
    Inwendig,
    /// Blad 2 — uitkragend deel: aan één rand gesteund, de andere rand vrij.
    Uitkraging,
}

/// De classificatie van één plaatdeel, met alle tussenstappen erbij zodat het
/// rapport ze kan tonen.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlaatdeelKlasse {
    /// Index van de lamel in [`CompositeSection::lamellen`].
    pub lamel_index: usize,
    pub soort: Plaatdeelsoort,
    /// Leesbare aanduiding voor het rapport.
    pub omschrijving: String,
    /// Vrije breedte van het plaatdeel.
    pub c_mm: f64,
    pub t_mm: f64,
    pub c_over_t: f64,
    /// Elastische spanningsverhouding `ψ = σ₂/σ₁` over het plaatdeel, met druk
    /// positief en `σ₁` de grootste drukspanning van de twee randen. `ψ = 1`
    /// is gelijkmatige druk, `ψ = −1` zuivere buiging.
    pub psi: f64,
    /// Drukfractie `α` van het plaatdeel bij de plastische spanningsverdeling.
    pub alpha: f64,
    pub grens_klasse1: f64,
    pub grens_klasse2: f64,
    pub grens_klasse3: f64,
    pub klasse: CrossSectionClass,
}

/// Uitkomst van [`classify_composite`].
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CompositeClassification {
    /// De ongunstigste klasse over alle gedrukte plaatdelen.
    pub klasse: CrossSectionClass,
    /// Het plaatdeel dat die klasse bepaalt. `None` als geen enkel plaatdeel
    /// gedrukt is (volledige trek, of helemaal geen belasting) — dan is er
    /// niets om op te plooien en is de doorsnede klasse 1.
    pub bepalend: Option<PlaatdeelKlasse>,
    /// Alle **gedrukte** plaatdelen; delen die volledig op trek staan worden
    /// niet geclassificeerd en staan er niet bij.
    pub delen: Vec<PlaatdeelKlasse>,
    pub epsilon: f64,
    /// `true` als de doorsnede catalogusdelen bevat. Die zijn hier **niet**
    /// geclassificeerd — alleen de lamellen zijn dat.
    pub catalogusdelen_overgeslagen: bool,
}

/// Marge waarbinnen α = 0,5 en ψ = −1 als "exact" gelden.
///
/// De twee takken van tabel 5.2 vallen in α = 0,5 samen op 72ε (klasse 1) en
/// 83ε (klasse 2), en de klasse-3-tak springt in ψ = −1 van 42ε/(0,67+0,33ψ)
/// naar 62ε(1−ψ)√(−ψ). Numerieke ruis in de plastische neutrale lijn mag daar
/// niet overheen tippen, anders komt er 82,9ε uit waar 83ε hoort te staan.
const TAK_TOL: f64 = 1e-9;

/// Klassegrenzen voor een **inwendig** drukdeel (tabel 5.2, blad 1), algemene
/// vorm:
///
/// * klasse 1: `396ε/(13α − 1)` voor α > 0,5, anders `36ε/α`
/// * klasse 2: `456ε/(13α − 1)` voor α > 0,5, anders `41,5ε/α`
/// * klasse 3: `42ε/(0,67 + 0,33ψ)` voor ψ > −1, anders `62ε(1 − ψ)·√(−ψ)`
///
/// Controle op de twee bekende bijzondere gevallen:
/// * zuivere buiging (α = 0,5; ψ = −1) → `36/0,5 = 72ε`, `41,5/0,5 = 83ε`,
///   `62·2·1 = 124ε`;
/// * gelijkmatige druk (α = 1; ψ = 1) → `396/12 = 33ε`, `456/12 = 38ε`,
///   `42/1 = 42ε`.
fn grenzen_inwendig_algemeen(eps: f64, alpha: f64, psi: f64) -> (f64, f64, f64) {
    let a = alpha.clamp(1e-6, 1.0);
    let (g1, g2) = if a > 0.5 + TAK_TOL {
        (396.0 * eps / (13.0 * a - 1.0), 456.0 * eps / (13.0 * a - 1.0))
    } else {
        (36.0 * eps / a, 41.5 * eps / a)
    };
    let g3 = if psi > -1.0 + TAK_TOL {
        42.0 * eps / (0.67 + 0.33 * psi)
    } else {
        62.0 * eps * (1.0 - psi) * (-psi).sqrt()
    };
    (g1, g2, g3)
}

/// Klassegrenzen voor een **uitkragend** deel (tabel 5.2, blad 2).
///
/// Bij gelijkmatige druk (ψ = 1) staan in de tabel de kale getallen
/// 9ε / 10ε / 14ε; die worden hier letterlijk overgenomen. Voor een
/// spanningsverloop gelden:
///
/// * vrije rand op druk: klasse 1 `9ε/α`, klasse 2 `10ε/α`;
/// * vrije rand op trek: klasse 1 `9ε/(α√α)`, klasse 2 `10ε/(α√α)`;
/// * klasse 3: `21ε·√k_σ` met `k_σ` uit NEN-EN 1993-1-5 tabel 4.2:
///   vrije rand op druk `k_σ = 0,57 − 0,21ψ + 0,07ψ²`; vrije rand op trek
///   `k_σ = 0,578/(ψ + 0,34)` voor ψ ≥ 0 en `k_σ = 1,7 − 5ψ + 17,1ψ²` daaronder.
fn grenzen_uitkraging_algemeen(
    eps: f64,
    alpha: f64,
    psi: f64,
    vrije_rand_op_druk: bool,
) -> (f64, f64, f64) {
    if psi >= 1.0 - TAK_TOL {
        return (9.0 * eps, 10.0 * eps, 14.0 * eps);
    }
    let a = alpha.clamp(1e-6, 1.0);
    let (g1, g2) = if vrije_rand_op_druk {
        (9.0 * eps / a, 10.0 * eps / a)
    } else {
        (9.0 * eps / (a * a.sqrt()), 10.0 * eps / (a * a.sqrt()))
    };
    let k_sigma = if vrije_rand_op_druk {
        0.57 - 0.21 * psi + 0.07 * psi * psi
    } else if psi >= 0.0 {
        0.578 / (psi + 0.34)
    } else {
        1.7 - 5.0 * psi + 17.1 * psi * psi
    };
    (g1, g2, 21.0 * eps * k_sigma.max(0.0).sqrt())
}

/// Classificeert een samengestelde doorsnede per plaatdeel volgens tabel 5.2.
///
/// `forces` gebruikt de tekenafspraak van de rest van de rekenkern: `n_ed` in
/// kN met **druk negatief**, `my_ed`/`mz_ed` in kNm. Een positieve `my_ed` legt
/// de bovenzijde (`z > z_c`) op druk; een positieve `mz_ed` de `−y`-zijde.
///
/// Catalogusdelen (`CompositeSection::delen`) worden **niet** geclassificeerd;
/// dat wordt in het resultaat gemeld.
pub fn classify_composite(
    sec: &CompositeSection,
    grade: &SteelGrade,
    forces: &InternalForces,
) -> CompositeClassification {
    let eps = epsilon(grade);
    let res = sec.bereken();
    let p = &res.props;

    let leeg = CompositeClassification {
        klasse: CrossSectionClass::Class1,
        bepalend: None,
        delen: Vec::new(),
        epsilon: eps,
        catalogusdelen_overgeslagen: !sec.delen.is_empty(),
    };
    if sec.lamellen.is_empty() {
        return leeg;
    }

    // ── Elastische spanningsverdeling, druk positief ─────────────────────────
    // σ_c(y,z) = −N/A + M_y·(z − z_c)/I_y − M_z·(y − y_c)/I_z
    let (area, iy, iz) = (p.area_mm2, p.iy_mm4, p.iz_mm4);
    let (yc, zc) = (p.y_c_mm, p.z_c_mm);
    let sigma_c = |y: f64, z: f64| -> f64 {
        let mut s = 0.0;
        if area > 0.0 {
            s += -forces.n_ed * 1000.0 / area;
        }
        if iy > 0.0 {
            s += forces.my_ed * 1.0e6 * (z - zc) / iy;
        }
        if iz > 0.0 {
            s += -forces.mz_ed * 1.0e6 * (y - yc) / iz;
        }
        s
    };

    // Richting waarin de drukspanning toeneemt: de gradiënt van σ_c. Loodrecht
    // daarop staat zowel de elastische als de plastische neutrale lijn.
    let g = (
        if iz > 0.0 { -forces.mz_ed * 1.0e6 / iz } else { 0.0 },
        if iy > 0.0 { forces.my_ed * 1.0e6 / iy } else { 0.0 },
    );
    let gn = (g.0 * g.0 + g.1 * g.1).sqrt();
    let n_druk = if gn > 1.0e-9 { Some((g.0 / gn, g.1 / gn)) } else { None };

    // ── Plastische neutrale lijn ─────────────────────────────────────────────
    // Volplastisch: alles boven de lijn op +f_y (druk), alles eronder op −f_y.
    // Evenwicht met N_Ed geeft A_druk = (A − N_Ed/f_y)/2; bij N_Ed = 0 is dat
    // de gelijke-oppervlakte-as.
    let a_lam: f64 = sec.lamellen.iter().map(|l| l.oppervlak_mm2()).sum();
    let a_druk_doel = if grade.fy_mpa > 0.0 {
        (a_lam - forces.n_ed * 1000.0 / grade.fy_mpa) / 2.0
    } else {
        a_lam / 2.0
    };
    let w0 = n_druk.map(|n| plastische_neutrale_lijn(&sec.lamellen, n, a_druk_doel));

    // ── Per lamel de plaatdelen aflopen ──────────────────────────────────────
    let mut delen: Vec<PlaatdeelKlasse> = Vec::new();
    for (i, lam) in sec.lamellen.iter().enumerate() {
        let (sin_a, cos_a) = lam.alpha_rad.sin_cos();
        let d = (cos_a, sin_a);
        let aan = aansluitingen(&sec.lamellen, i);
        for seg in segmenten(lam, &aan) {
            let c = seg.u_b - seg.u_a;
            if c <= 1e-6 || lam.t_mm <= 0.0 {
                continue;
            }
            let pa = (lam.y_mm + seg.u_a * d.0, lam.z_mm + seg.u_a * d.1);
            let pb = (lam.y_mm + seg.u_b * d.0, lam.z_mm + seg.u_b * d.1);
            let sa = sigma_c(pa.0, pa.1);
            let sb = sigma_c(pb.0, pb.1);

            // Volledig op trek ⇒ geen plooigevaar, niet classificeren.
            let s1 = sa.max(sb);
            if s1 <= 0.0 {
                continue;
            }
            let s2 = sa.min(sb);
            let psi = (s2 / s1).clamp(-1.0e3, 1.0);

            // α: drukfractie uit de plastische verdeling, met de elastische
            // drukfractie als ondergrens. Dat is nooit gunstiger dan de norm:
            // bij drukkracht ligt de plastische lijn dieper (α groter), bij
            // trekkracht houdt de elastische ondergrens α van nul af.
            let alpha_pl = match (w0, n_druk) {
                (Some(w0), Some(n)) => {
                    let wa = n.0 * pa.0 + n.1 * pa.1;
                    let wb = n.0 * pb.0 + n.1 * pb.1;
                    fractie_boven(wa, wb, w0)
                }
                _ => 1.0,
            };
            let alpha_el = fractie_boven(sa, sb, 0.0);
            let alpha = alpha_pl.max(alpha_el).clamp(1e-6, 1.0);

            let vrije_rand_op_druk = match (seg.vrij_a, seg.vrij_b) {
                (true, true) => true, // losstaande plaat: ongunstigste aanname
                (true, false) => sa >= sb,
                (false, true) => sb >= sa,
                (false, false) => false,
            };
            let (g1, g2, g3) = match seg.soort {
                Plaatdeelsoort::Inwendig => grenzen_inwendig_algemeen(eps, alpha, psi),
                Plaatdeelsoort::Uitkraging => {
                    grenzen_uitkraging_algemeen(eps, alpha, psi, vrije_rand_op_druk)
                }
            };
            let c_over_t = c / lam.t_mm;
            let klasse = klasse_uit(c_over_t, g1, g2, g3);
            let soortnaam = match seg.soort {
                Plaatdeelsoort::Inwendig => "inwendig deel",
                Plaatdeelsoort::Uitkraging => "uitkraging",
            };
            delen.push(PlaatdeelKlasse {
                lamel_index: i,
                soort: seg.soort,
                omschrijving: format!(
                    "lamel {i} — {soortnaam}, c = {c:.1} mm, t = {t:.1} mm, c/t = {ct:.2}",
                    t = lam.t_mm,
                    ct = c_over_t
                ),
                c_mm: c,
                t_mm: lam.t_mm,
                c_over_t,
                psi,
                alpha,
                grens_klasse1: g1,
                grens_klasse2: g2,
                grens_klasse3: g3,
                klasse,
            });
        }
    }

    // Bepalend is het deel met de hoogste klasse; bij gelijke klasse het deel
    // dat relatief het dichtst bij zijn klasse-1-grens zit.
    let bepalend = delen
        .iter()
        .max_by(|a, b| {
            a.klasse.cmp(&b.klasse).then_with(|| {
                let ra = a.c_over_t / a.grens_klasse1.max(1e-9);
                let rb = b.c_over_t / b.grens_klasse1.max(1e-9);
                ra.partial_cmp(&rb).unwrap_or(std::cmp::Ordering::Equal)
            })
        })
        .cloned();

    CompositeClassification {
        klasse: bepalend.as_ref().map_or(CrossSectionClass::Class1, |d| d.klasse),
        bepalend,
        delen,
        epsilon: eps,
        catalogusdelen_overgeslagen: !sec.delen.is_empty(),
    }
}

/// Fractie van het lijnstuk `a → b` waarvoor de waarde boven `drempel` ligt.
fn fractie_boven(a: f64, b: f64, drempel: f64) -> f64 {
    let (lo, hi) = (a.min(b), a.max(b));
    if lo > drempel {
        1.0
    } else if hi <= drempel {
        0.0
    } else {
        (hi - drempel) / (hi - lo)
    }
}

/// Aansluiting van een ander plaatdeel op de as van deze lamel.
#[derive(Clone, Copy, Debug)]
struct Aansluiting {
    /// Positie langs de plaatas, gemeten vanaf het midden van de lamel.
    u_mm: f64,
    /// Dikte van het aansluitende plaatdeel.
    t_mm: f64,
}

/// Eén plaatdeel op de as van een lamel, begrensd door `u_a < u_b`.
#[derive(Clone, Copy, Debug)]
struct Segment {
    soort: Plaatdeelsoort,
    u_a: f64,
    u_b: f64,
    vrij_a: bool,
    vrij_b: bool,
}

/// Alle steunpunten op de as van lamel `i`, op volgorde van `u`.
fn aansluitingen(lamellen: &[Lamella], i: usize) -> Vec<Aansluiting> {
    let li = lamellen[i];
    let (sin_i, cos_i) = li.alpha_rad.sin_cos();
    let di = (cos_i, sin_i);
    let mid_i = li.middellijn();
    let hi = li.b_mm / 2.0;

    let mut gevonden: Vec<Aansluiting> = Vec::new();
    for (j, lj) in lamellen.iter().enumerate() {
        if j == i {
            continue;
        }
        // Zelfde lasnaad-criterium als de welvingsberekening in composite.rs:
        // een uiteinde dat binnen een halve gezamenlijke wanddikte van de
        // middellijn van de ander ligt, telt als aansluiting.
        let tol = 0.5 * (li.t_mm + lj.t_mm) * 1.05 + 1e-9;
        let mid_j = lj.middellijn();
        let raakt = uiteinde_bij_segment(mid_i, mid_j, tol) || uiteinde_bij_segment(mid_j, mid_i, tol);
        if !raakt {
            continue;
        }
        let (sin_j, cos_j) = lj.alpha_rad.sin_cos();
        let dj = (cos_j, sin_j);
        let Some(q) = snijpunt(mid_i.0, di, mid_j.0, dj) else {
            continue; // evenwijdige platen steunen elkaar niet in de c-richting
        };
        let u = (q.0 - li.y_mm) * di.0 + (q.1 - li.z_mm) * di.1;
        // Een knooppunt dat ver buiten de plaat valt is geen steunpunt.
        if u.abs() > hi + li.t_mm + lj.t_mm {
            continue;
        }
        gevonden.push(Aansluiting { u_mm: u, t_mm: lj.t_mm });
    }

    gevonden.sort_by(|a, b| a.u_mm.partial_cmp(&b.u_mm).unwrap_or(std::cmp::Ordering::Equal));
    let mut samen: Vec<Aansluiting> = Vec::new();
    for a in gevonden {
        match samen.last_mut() {
            // Twee platen die op dezelfde plek aansluiten: de dikste bepaalt c.
            Some(l) if (a.u_mm - l.u_mm).abs() < 1e-6 => l.t_mm = l.t_mm.max(a.t_mm),
            _ => samen.push(a),
        }
    }
    samen
}

/// Verdeelt de as van een lamel in plaatdelen tussen de steunpunten.
fn segmenten(l: &Lamella, aan: &[Aansluiting]) -> Vec<Segment> {
    let h = l.b_mm / 2.0;
    let mut uit = Vec::new();
    let Some(eerste) = aan.first() else {
        // Losstaande plaat: nergens gesteund. Tabel 5.2 kent dat geval niet;
        // de ongunstigste behandeling is een uitkraging over de volle breedte.
        uit.push(Segment {
            soort: Plaatdeelsoort::Uitkraging,
            u_a: -h,
            u_b: h,
            vrij_a: true,
            vrij_b: true,
        });
        return uit;
    };

    let u0 = eerste.u_mm - eerste.t_mm / 2.0;
    if u0 + h > 1e-6 {
        uit.push(Segment {
            soort: Plaatdeelsoort::Uitkraging,
            u_a: -h,
            u_b: u0,
            vrij_a: true,
            vrij_b: false,
        });
    }
    for w in aan.windows(2) {
        let a = w[0].u_mm + w[0].t_mm / 2.0;
        let b = w[1].u_mm - w[1].t_mm / 2.0;
        if b - a > 1e-6 {
            uit.push(Segment {
                soort: Plaatdeelsoort::Inwendig,
                u_a: a,
                u_b: b,
                vrij_a: false,
                vrij_b: false,
            });
        }
    }
    let laatste = aan[aan.len() - 1];
    let un = laatste.u_mm + laatste.t_mm / 2.0;
    if h - un > 1e-6 {
        uit.push(Segment {
            soort: Plaatdeelsoort::Uitkraging,
            u_a: un,
            u_b: h,
            vrij_a: false,
            vrij_b: true,
        });
    }
    uit
}

/// Positie `w₀` van de plastische neutrale lijn langs de drukrichting `n`, zó
/// dat het gedrukte oppervlak gelijk is aan `a_druk_doel`.
fn plastische_neutrale_lijn(lamellen: &[Lamella], n: (f64, f64), a_druk_doel: f64) -> f64 {
    let polys: Vec<[(f64, f64); 4]> = lamellen.iter().map(|l| l.hoekpunten()).collect();
    let (mut w_min, mut w_max) = (f64::INFINITY, f64::NEG_INFINITY);
    for poly in &polys {
        for &(y, z) in poly.iter() {
            let w = n.0 * y + n.1 * z;
            w_min = w_min.min(w);
            w_max = w_max.max(w);
        }
    }
    if !w_min.is_finite() {
        return 0.0;
    }
    let a_tot: f64 = polys.iter().map(|p| polygoon_oppervlak(p)).sum();
    if a_druk_doel >= a_tot {
        return w_min - 1.0; // hele doorsnede gedrukt
    }
    if a_druk_doel <= 0.0 {
        return w_max + 1.0; // hele doorsnede op trek
    }

    let druk_opp = |w0: f64| -> f64 {
        polys
            .iter()
            .map(|p| polygoon_oppervlak(&knip_boven(p, n, w0)))
            .sum()
    };
    let (mut lo, mut hi) = (w_min, w_max);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        // `druk_opp` daalt met w0. Bij gelijkheid schuift `lo` mee omhoog,
        // zodat een symmetrische doorsnede zonder normaalkracht van bovenaf
        // naar α = 0,5 nadert en niet in de andere tak van tabel 5.2 belandt.
        if druk_opp(mid) >= a_druk_doel {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

/// Snijpunt van twee oneindige lijnen `p₁ + t·d₁` en `p₂ + s·d₂`.
fn snijpunt(p1: (f64, f64), d1: (f64, f64), p2: (f64, f64), d2: (f64, f64)) -> Option<(f64, f64)> {
    let kruis = d1.0 * d2.1 - d1.1 * d2.0;
    if kruis.abs() < 1e-9 {
        return None;
    }
    let dp = (p2.0 - p1.0, p2.1 - p1.1);
    let t = (dp.0 * d2.1 - dp.1 * d2.0) / kruis;
    Some((p1.0 + t * d1.0, p1.1 + t * d1.1))
}

/// Ligt een uiteinde van segment `a` binnen `tol` van segment `b`?
fn uiteinde_bij_segment(
    a: ((f64, f64), (f64, f64)),
    b: ((f64, f64), (f64, f64)),
    tol: f64,
) -> bool {
    afstand_punt_segment(a.0, b.0, b.1) <= tol || afstand_punt_segment(a.1, b.0, b.1) <= tol
}

fn afstand_punt_segment(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let ab = (b.0 - a.0, b.1 - a.1);
    let l2 = ab.0 * ab.0 + ab.1 * ab.1;
    if l2 <= 0.0 {
        return ((p.0 - a.0).powi(2) + (p.1 - a.1).powi(2)).sqrt();
    }
    let s = (((p.0 - a.0) * ab.0 + (p.1 - a.1) * ab.1) / l2).clamp(0.0, 1.0);
    let q = (a.0 + s * ab.0, a.1 + s * ab.1);
    ((p.0 - q.0).powi(2) + (p.1 - q.1).powi(2)).sqrt()
}

/// Het deel van een convexe polygoon waarvoor `n·P ≥ w₀` (Sutherland–Hodgman).
fn knip_boven(poly: &[(f64, f64)], n: (f64, f64), w0: f64) -> Vec<(f64, f64)> {
    let f = |p: &(f64, f64)| n.0 * p.0 + n.1 * p.1 - w0;
    let m = poly.len();
    let mut uit = Vec::with_capacity(m + 2);
    for (i, &a) in poly.iter().enumerate() {
        let b = poly[(i + 1) % m];
        let (fa, fb) = (f(&a), f(&b));
        if fa >= 0.0 {
            uit.push(a);
        }
        if (fa > 0.0 && fb < 0.0) || (fa < 0.0 && fb > 0.0) {
            let t = fa / (fa - fb);
            uit.push((a.0 + t * (b.0 - a.0), a.1 + t * (b.1 - a.1)));
        }
    }
    uit
}

fn polygoon_oppervlak(poly: &[(f64, f64)]) -> f64 {
    if poly.len() < 3 {
        return 0.0;
    }
    let m = poly.len();
    let mut s = 0.0;
    for (i, &a) in poly.iter().enumerate() {
        let b = poly[(i + 1) % m];
        s += a.0 * b.1 - b.0 * a.1;
    }
    (s / 2.0).abs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use section_properties::i_section::i_section_props;
    use crate::{S235, S355};

    /// Doorsnede-eigenschappen waarbij alleen de maten voor de classificatie
    /// ertoe doen. area_mm2 wordt gebruikt voor de n_ratio-schakelaar.
    fn maten(h: f64, b: f64, tw: f64, tf: f64, r: f64, a: f64) -> SectionProperties {
        SectionProperties {
            h_mm: h, b_mm: b, tw_mm: tw, tf_mm: tf, r_mm: r, area_mm2: a,
            ..Default::default()
        }
    }

    fn buiging() -> InternalForces {
        InternalForces { my_ed: 80.0, ..Default::default() }
    }

    fn druk(n_kn: f64) -> InternalForces {
        InternalForces { n_ed: -n_kn, ..Default::default() }
    }

    // ── I-profiel: ongewijzigd gedrag ────────────────────────────────────────

    #[test]
    fn heb160_s235_zuivere_buiging_is_klasse1() {
        let p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::ISection),
            CrossSectionClass::Class1
        );
    }

    // ── Blad 3: ronde buizen, handberekende grensgevallen ────────────────────

    /// S235 → ε = 1, dus de grenzen zijn d/t = 50 / 70 / 90.
    /// d = 500, t = 10 → d/t = 50,0 — precies op de klasse-1-grens.
    #[test]
    fn chs_op_grens_klasse1_s235() {
        let p = maten(500.0, 500.0, 10.0, 10.0, 0.0, 15_400.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class1
        );
    }

    /// d = 510, t = 10 → d/t = 51,0 > 50 → klasse 2 (want ≤ 70).
    #[test]
    fn chs_net_over_klasse1_wordt_klasse2() {
        let p = maten(510.0, 510.0, 10.0, 10.0, 0.0, 15_700.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class2
        );
    }

    /// d/t = 71 → klasse 3; d/t = 91 → klasse 4.
    #[test]
    fn chs_klasse3_en_klasse4_grenzen_s235() {
        let p3 = maten(710.0, 710.0, 10.0, 10.0, 0.0, 22_000.0);
        assert_eq!(
            classify_section(&p3, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class3
        );
        let p4 = maten(910.0, 910.0, 10.0, 10.0, 0.0, 28_300.0);
        assert_eq!(
            classify_section(&p4, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class4
        );
    }

    /// S355 → ε² = 235/355 = 0,66197. Klasse-1-grens 50ε² = 33,098.
    /// d = 330, t = 10 → d/t = 33,0 ≤ 33,098 → nog klasse 1.
    /// d = 340, t = 10 → d/t = 34,0 > 33,098 → klasse 2 (grens 70ε² = 46,34).
    #[test]
    fn chs_grenzen_schalen_met_epsilon_kwadraat_s355() {
        let net_wel = maten(330.0, 330.0, 10.0, 10.0, 0.0, 10_100.0);
        assert_eq!(
            classify_section(&net_wel, &S355, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class1
        );
        let net_niet = maten(340.0, 340.0, 10.0, 10.0, 0.0, 10_400.0);
        assert_eq!(
            classify_section(&net_niet, &S355, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class2
        );
    }

    // ── Blad 1: kokers ───────────────────────────────────────────────────────

    /// SHS 120×120×5, S235. c = 120 − 3·5 = 105; c/t = 21,0.
    /// Lijf: 21,0 ≤ 72 → klasse 1. Flens: 21,0 ≤ 33 → klasse 1.
    /// (Met de oude I-profielregel werd de flens 52,5/5 = 10,5 > 10ε → klasse 3.)
    #[test]
    fn shs120x120x5_zuivere_buiging_is_klasse1() {
        let p = maten(120.0, 120.0, 5.0, 5.0, 5.0, 2_260.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::BoxSection),
            CrossSectionClass::Class1
        );
    }

    /// Kokerflens op de grens van klasse 1 onder druk: c/t = 33 bij S235.
    /// t = 5, c = b − 15 = 165 → b = 180 → c/t = 33,0.
    /// Het lijf is hier even slank en valt onder dezelfde drukgrens.
    #[test]
    fn koker_flens_op_grens_klasse1_druk() {
        // area zo klein dat n_ratio ≥ 0,05 → volledig gedrukt regime.
        let p = maten(180.0, 180.0, 5.0, 5.0, 5.0, 3_500.0);
        assert_eq!(
            classify_section(&p, &S235, &druk(500.0), SectionShape::BoxSection),
            CrossSectionClass::Class1
        );
    }

    /// Eén stap slanker dan het vorige geval: b = 185 → c/t = 34,0 > 33 → klasse 2.
    #[test]
    fn koker_net_over_grens_klasse1_druk_wordt_klasse2() {
        let p = maten(185.0, 185.0, 5.0, 5.0, 5.0, 3_600.0);
        assert_eq!(
            classify_section(&p, &S235, &druk(500.0), SectionShape::BoxSection),
            CrossSectionClass::Class2
        );
    }

    /// Slanke koker in zuivere buiging: h = 1000, b = 100, t = 5.
    /// Lijf c/t = (1000 − 15)/5 = 197 > 124 → klasse 4.
    #[test]
    fn slanke_kokerlijf_wordt_klasse4() {
        let p = maten(1000.0, 100.0, 5.0, 5.0, 5.0, 10_000.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::BoxSection),
            CrossSectionClass::Class4
        );
    }

    /// De flens van een koker telt óók bij zuivere buiging als volledig
    /// gedrukt deel (grens 33ε), niet als buigend deel (72ε).
    /// h = 100, b = 300, t = 5: lijf c/t = 17 (klasse 1),
    /// flens c/t = (300 − 15)/5 = 57 > 42 → klasse 4.
    #[test]
    fn kokerflens_wordt_op_drukgrens_getoetst_niet_op_buiggrens() {
        let p = maten(100.0, 300.0, 5.0, 5.0, 5.0, 8_000.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::BoxSection),
            CrossSectionClass::Class4
        );
    }

    // ── Blad 2: U-profiel, flens kraagt over de volle breedte uit ────────────

    /// Bij een U-profiel is c = b − t_w − r, niet (b − t_w)/2 − r.
    /// b = 100, t_w = 10, r = 16, t_f = 16 → c = 74; c/t_f = 4,63 → klasse 1.
    /// Met de oude (I-profiel-)formule was c = 29 en c/t_f = 1,81: een factor
    /// 2,6 te gunstig. Voor de catalogus-UNP's verandert de uitkomst niet,
    /// maar bij een dunnere flens wél.
    #[test]
    fn u_profiel_flens_gebruikt_volle_uitkraging() {
        // t_f zo gekozen dat de twee formules aan weerszijden van 9ε liggen:
        // c = 74; bij t_f = 7 is c/t_f = 10,57 → klasse 3.
        // De oude formule gaf 29/7 = 4,14 → klasse 1.
        let p = maten(300.0, 100.0, 10.0, 7.0, 16.0, 5_000.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::Channel),
            CrossSectionClass::Class3
        );
    }

    /// Catalogus-UNP 300 blijft klasse 1 in zuivere buiging:
    /// lijf c/t_w = (300 − 32 − 32)/10 = 23,6 ≤ 72;
    /// flens c/t_f = (100 − 10 − 16)/16 = 4,63 ≤ 9.
    #[test]
    fn unp300_blijft_klasse1() {
        let p = maten(300.0, 100.0, 10.0, 16.0, 16.0, 5_880.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::Channel),
            CrossSectionClass::Class1
        );
    }

    // ── Regressie op de echte catalogus ──────────────────────────────────────

    /// De profielen die vóór de correctie ten onrechte klasse 3 werden.
    #[test]
    fn catalogus_kokers_en_buizen_zijn_klasse1_in_buiging() {
        for naam in ["SHS 120x120x5", "SHS 150x150x6", "SHS 200x200x8",
                     "SHS 250x250x10", "SHS 300x300x10",
                     "CHS 168.3x8.0", "CHS 219.1x10", "CHS 273x10",
                     "CHS 323.9x12.5", "CHS 406.4x16"] {
            let prof = steel_profiles::db().find(naam).expect(naam);
            let shape = match prof.kind {
                steel_profiles::ProfileKind::Chs => SectionShape::CircularHollow,
                steel_profiles::ProfileKind::Shs | steel_profiles::ProfileKind::Rhs => SectionShape::BoxSection,
                steel_profiles::ProfileKind::Channel => SectionShape::Channel,
                steel_profiles::ProfileKind::ISection => SectionShape::ISection,
            };
            assert_eq!(
                classify_section(&prof.properties, &S235, &buiging(), shape),
                CrossSectionClass::Class1,
                "{naam} hoort klasse 1 te zijn"
            );
        }
    }
}
