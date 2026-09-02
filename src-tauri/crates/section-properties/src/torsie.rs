//! Torsieconstante `It` en welvingsconstante `Iw`, numeriek uit de geometrie.
//!
//! [`crate::contour`] rekent alles uit wat als randintegraal te schrijven is.
//! `It` en `Iw` horen daar niet bij: die volgen uit een randwaardeprobleem over
//! het *inwendige* van de doorsnede en hebben voor een willekeurige vorm geen
//! gesloten uitdrukking. Deze module lost die twee problemen op met lineaire
//! driehoekselementen op de mesh uit [`crate::mesh2d`], en convergeert daarmee
//! naar de exacte waarde in plaats van naar een tabelgetal.
//!
//! # 1. `It` — de spanningsfunctie van Prandtl
//!
//! Zoek `φ` met
//!
//! ```text
//! ∇²φ = −2      in het materiaal
//! φ   = 0       op de buitenrand
//! φ   = φₖ      constant op elke binnenrand k
//! ```
//!
//! De constante `φₖ` is *niet* vrij: de verplaatsing moet éénwaardig zijn rond
//! een gat, en dat legt de circulatievoorwaarde
//!
//! ```text
//! ∮_Γₖ (∂φ/∂n) ds = 2·Aₖ        (n naar buiten uit het materiaal, Aₖ = gatoppervlak)
//! ```
//!
//! op. Daarmee is
//!
//! ```text
//! It = 2∬φ dA + 2·Σₖ φₖ·Aₖ
//! ```
//!
//! **Controle op de holle ronde staaf** (binnenstraal `a`, buitenstraal `b`),
//! waar `φ = (b² − r²)/2` exact is: op de binnenrand wijst de naar buiten
//! gerichte normaal naar `−r`, dus `∂φ/∂n = −∂φ/∂r = r = a` en
//! `∮ = 2πa·a = 2πa² = 2Aₖ` ✓. En `2∬φ dA + 2φ_a·πa²` levert netjes
//! `π(b⁴ − a⁴)/2` ✓. Het teken van de circulatieterm is dus vastgelegd door een
//! geval waarvan de uitkomst bekend is, niet door een aanname.
//!
//! In de zwakke vorm is diezelfde voorwaarde gratis. Met
//! `∬∇φ·∇v = ∬2v + ∮v ∂φ/∂n` en `v` de vormfunctie die op héél `Γₖ` gelijk 1
//! is, wordt de randterm precies `∮_Γₖ ∂φ/∂n ds`. Dus: knoop de vrijheidsgraden
//! van elke binnenrand aan elkaar tot één onbekende en zet `2Aₖ` in de
//! rechterlidvector. Meer is er niet nodig — geen Lagrange-multiplicatoren.
//!
//! # 2. `Iw` — de sectoriale coördinaat
//!
//! De welvingsfunctie `ω` van Saint-Venant volgt uit
//!
//! ```text
//! ∇²ω = 0                    in het materiaal
//! ∂ω/∂n = z·n_y − y·n_z      op de rand
//! ```
//!
//! Dat is een zuiver Neumann-probleem: `ω` ligt op een constante na vast, en de
//! oplosbaarheidsvoorwaarde `∮(z n_y − y n_z) ds = 0` is identiek voldaan. Langs
//! een rand die het materiaal links houdt is `n = (dz, −dy)/ds`, dus de
//! randterm wordt simpelweg `∮ v (y dy + z dz)` — een integraal van twee
//! lineaire functies over een recht stukje rand, dus exact te doen.
//!
//! De pool zit in de oorsprong van het gebruikte assenstelsel; wij rekenen in
//! zwaartepuntscoördinaten. Verplaatsen van de pool naar `(y_p, z_p)` geeft
//! `ω_P = ω_O − z_p·y + y_p·z + c` (volgt uit het gelijk houden van de
//! schuifvervormingen). Het **schuifmiddelpunt** is de pool waarvoor de welving
//! geen buiging oplevert, `∬ω_P·y dA = ∬ω_P·z dA = 0`:
//!
//! ```text
//! z_p = ( S_ωy·Iy  − Iyz·S_ωz ) / (Iy·Iz − Iyz²)
//! y_p = ( Iyz·S_ωy − Iz ·S_ωz ) / (Iy·Iz − Iyz²)
//! ```
//!
//! met `S_ωy = ∬ω·y dA` en `S_ωz = ∬ω·z dA`. Daarna `ω` op nul-gemiddelde
//! normaliseren en `Iw = ∬ω² dA`.
//!
//! # 3. Twee onafhankelijke `It`, en waarom dat gratis een foutmarge geeft
//!
//! Uit dezelfde `ω` volgt ook `It = Iy + Iz − ∬|∇ω|² dA`. Die vorm is een
//! **Rayleigh-quotiënt**: de eindige-elementenruimte is kleiner dan de echte
//! functieruimte, dus `∬|∇ω_h|² ≤ ∬|∇ω|²` en de uitkomst ligt te *hoog*. De
//! Prandtl-vorm is de complementaire formulering en ligt te *laag*. Samen
//! sluiten ze de exacte waarde van de gediscretiseerde doorsnede in:
//!
//! ```text
//! It(Prandtl) ≤ It_exact ≤ It(welving)
//! ```
//!
//! Die twee getallen worden allebei teruggegeven. Het verschil is een echte
//! a-posteriori foutgrens — geen schatting, geen vuistregel. Loopt hij op, dan
//! is de mesh te grof, en dat is aan het resultaat zelf te zien.
//!
//! Beide fouten zijn van orde `h²` en in de praktijk vrijwel even groot, dus
//! het **midden** van de band is aanzienlijk nauwkeuriger dan elke grens apart
//! (gemeten op de rechthoekreeks: vier tot negen keer). Dat midden staat als
//! `it_beste_mm4` in het resultaat en is de waarde voor de database;
//! `it_mm4` blijft de Prandtl-ondergrens voor wie een gegarandeerd veilig
//! getal wil.
//!
//! # 4. Grenzen van de methode
//!
//! * **Scherpe inspringende hoeken.** Bij een hoek van 270° (koker zonder
//!   binnenafronding, gelaste I-vorm) is `∇φ` singulier. `It` blijft
//!   convergeren, maar de orde zakt van `h²` naar ongeveer `h^4/3`. Walsprofielen
//!   hebben afrondingen en hebben daar geen last van.
//! * **Losse delen.** Een doorsnede die uit niet-verbonden stukken bestaat
//!   heeft geen enkelvoudig schuifmiddelpunt. `It` klopt (de stukken tellen
//!   op), `Iw` en het schuifmiddelpunt zijn dan betekenisloos; het veld
//!   `losse_delen` in het resultaat zegt dat.
//! * **Zeer dunne wanden.** De mesh moet minstens ~4 elementen door de dunste
//!   wand leggen; `It ∝ t³` vergroot elke fout in de wanddikte met factor 3.
//!   [`aanbevolen_h`] regelt dat automatisch.

use std::time::Instant;

use crate::contour::{Doorsnede, Segment};
use crate::mesh2d::{self, Mesh2D};

// ════════════════════════════════════════════════════════════════════════════
//  Publieke API
// ════════════════════════════════════════════════════════════════════════════

/// Instellingen voor de numerieke oplossing.
#[derive(Clone, Copy, Debug)]
pub struct TorsieOpties {
    /// Richtgrootte van de driehoeken (mm). Zie [`aanbevolen_h`].
    pub h_mm: f64,
    /// Relatieve resttolerantie van de iteratieve oplosser.
    pub tolerantie: f64,
    /// Bovengrens aan het aantal CG-stappen.
    pub max_iteraties: usize,
}

impl Default for TorsieOpties {
    fn default() -> Self {
        TorsieOpties { h_mm: 1.0, tolerantie: 1e-12, max_iteraties: 50_000 }
    }
}

impl TorsieOpties {
    pub fn met_h(h_mm: f64) -> Self {
        TorsieOpties { h_mm, ..Default::default() }
    }
}

/// Uitkomst van de torsie- en welvingsberekening.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct TorsieResultaat {
    /// Torsieconstante uit de spanningsfunctie van Prandtl (mm⁴).
    /// **Ondergrens**: hij ligt gegarandeerd aan de veilige kant, want een te
    /// lage `It` geeft een te lage kipmomentcapaciteit.
    pub it_mm4: f64,
    /// Zelfde als `it_mm4`; expliciet benoemd als **ondergrens**.
    pub it_ondergrens_mm4: f64,
    /// Torsieconstante uit de welvingsfunctie — **bovengrens** (mm⁴).
    pub it_bovengrens_mm4: f64,
    /// Midden van het insluitinterval — de **beste schatting** (mm⁴).
    ///
    /// Beide grenzen hebben een fout van orde `h²` met tegengesteld teken en
    /// in de praktijk vrijwel gelijke grootte, dus het midden is ongeveer vijf
    /// keer nauwkeuriger dan elke grens apart. Gebruik dit getal voor de
    /// profieldatabase; gebruik `it_mm4` als er een gegarandeerd veilige
    /// ondergrens nodig is.
    pub it_beste_mm4: f64,
    /// Halve breedte van het insluitinterval, relatief: `(boven − onder)/2·It`.
    pub it_onzekerheid: f64,
    /// Welvingsconstante om het schuifmiddelpunt (mm⁶).
    pub iw_mm6: f64,
    /// Schuifmiddelpunt in het **invoerassenstelsel** (mm).
    pub y_s_mm: f64,
    pub z_s_mm: f64,
    /// Zwaartepunt van de mesh, invoerassenstelsel (mm).
    pub y_c_mm: f64,
    pub z_c_mm: f64,
    /// Oppervlak van de gediscretiseerde doorsnede (mm²).
    pub a_mesh_mm2: f64,
    /// Traagheden van de gediscretiseerde doorsnede om het zwaartepunt (mm⁴).
    pub iy_mesh_mm4: f64,
    pub iz_mesh_mm4: f64,
    /// Gebruikte elementgrootte (mm).
    pub h_mm: f64,
    pub knopen: usize,
    pub driehoeken: usize,
    pub iteraties_prandtl: usize,
    pub iteraties_welving: usize,
    /// Rekentijd van mesh + beide oplossingen, in milliseconden.
    pub tijd_ms: f64,
    /// `true` als de mesh uit meerdere niet-verbonden delen bestaat; `iw_mm6`
    /// en het schuifmiddelpunt zijn dan betekenisloos.
    pub losse_delen: bool,
}

/// Aanbevolen elementgrootte: `per_wand` elementen door de dunste wand.
///
/// De karakteristieke wanddikte wordt geschat als `t ≈ 2A/L` met `L` de totale
/// randlengte. Voor een dunwandig profiel is dat exact de wanddikte (een strook
/// `b × t` heeft `2bt/(2b + 2t) → t` voor `b ≫ t`); voor een massieve cirkel
/// levert het `r` op, wat daar de goede maat is. Daarnaast een bovengrens van
/// `D/25` (D = grootste buitenmaat) zodat een massieve doorsnede niet met een
/// handvol driehoeken wordt afgedaan.
pub fn aanbevolen_h(d: &Doorsnede, per_wand: f64) -> f64 {
    let eig = d.bereken();
    let a = eig.a_mm2;
    let l = randlengte(d);
    let (y0, y1, z0, z1) = d.uitersten();
    let diameter = (y1 - y0).max(z1 - z0).max(1e-9);
    if a <= 0.0 || l <= 0.0 {
        return diameter / 25.0;
    }
    let t_eff = 2.0 * a / l;
    (t_eff / per_wand.max(1.0)).min(diameter / 25.0).max(diameter / 2000.0)
}

/// Totale randlengte van de doorsnede (mm), exact per segment.
pub fn randlengte(d: &Doorsnede) -> f64 {
    d.contouren
        .iter()
        .flat_map(|c| c.segmenten.iter())
        .map(|s| match *s {
            Segment::Lijn { van, naar } => (naar.0 - van.0).hypot(naar.1 - van.1),
            Segment::Boog { straal, theta1, theta2, .. } => straal * (theta2 - theta1).abs(),
        })
        .sum()
}

/// Standaarddichtheid: acht elementen door de dunste wand.
///
/// Bij deze dichtheid blijft `it_beste_mm4` op **elk** testgeval met een
/// bekende exacte waarde binnen 0,5 % (cirkel, ellips, de rechthoekreeks voor
/// b/t = 1, 2 en 10, en de ronde buis); zie de convergentietabellen in de
/// testmodule. De rekentijd is dan enkele tientallen milliseconden per profiel,
/// dus de hele catalogus is in ongeveer een halve minuut door te rekenen.
///
/// Wie de gegarandeerde ondergrens `it_mm4` op 0,5 % wil hebben, heeft ruwweg
/// `ELEMENTEN_PER_WAND = 16` nodig — acht keer zoveel rekenwerk, want de fout
/// van elke grens apart zakt met `h²` terwijl die van het midden veel sneller
/// wegvalt.
pub const ELEMENTEN_PER_WAND: f64 = 8.0;

/// Reken `It`, `Iw` en het schuifmiddelpunt met de standaardinstellingen.
pub fn bereken(d: &Doorsnede) -> TorsieResultaat {
    bereken_met(d, TorsieOpties::met_h(aanbevolen_h(d, ELEMENTEN_PER_WAND)))
}

/// Reken met eigen instellingen.
pub fn bereken_met(d: &Doorsnede, opties: TorsieOpties) -> TorsieResultaat {
    let start = Instant::now();
    let mesh = mesh2d::genereer(d, opties.h_mm);
    let mut r = bereken_op_mesh(&mesh, opties);
    r.tijd_ms = start.elapsed().as_secs_f64() * 1000.0;
    r
}

/// Reken op een al bestaande mesh (voor convergentiestudies).
pub fn bereken_op_mesh(mesh: &Mesh2D, opties: TorsieOpties) -> TorsieResultaat {
    let start = Instant::now();
    if mesh.driehoeken.is_empty() {
        return TorsieResultaat { h_mm: mesh.h_mm, ..Default::default() };
    }
    let (a, sy, sz, ..) = mesh.momenten();
    let (y_c, z_c) = (sz / a, sy / a);
    // Alles in zwaartepuntscoördinaten: de pool van ω zit dan in het
    // zwaartepunt, precies zoals de formules voor het schuifmiddelpunt vragen.
    let p: Vec<[f64; 2]> = mesh.punten.iter().map(|q| [q[0] - y_c, q[1] - z_c]).collect();

    let (it_prandtl, it_iter) = los_prandtl_op(mesh, &p, &opties);
    let w = los_welving_op(mesh, &p, a, &opties);

    let onder = it_prandtl;
    let boven = w.it;
    let mid = 0.5 * (onder + boven);
    TorsieResultaat {
        it_mm4: onder,
        it_ondergrens_mm4: onder,
        it_bovengrens_mm4: boven,
        it_beste_mm4: mid,
        it_onzekerheid: if mid > 0.0 { 0.5 * (boven - onder) / mid } else { 0.0 },
        iw_mm6: w.iw,
        y_s_mm: y_c + w.y_p,
        z_s_mm: z_c + w.z_p,
        y_c_mm: y_c,
        z_c_mm: z_c,
        a_mesh_mm2: a,
        iy_mesh_mm4: w.iy,
        iz_mesh_mm4: w.iz,
        h_mm: mesh.h_mm,
        knopen: mesh.punten.len(),
        driehoeken: mesh.driehoeken.len(),
        iteraties_prandtl: it_iter,
        iteraties_welving: w.iteraties,
        tijd_ms: start.elapsed().as_secs_f64() * 1000.0,
        losse_delen: w.losse_delen,
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Elementmatrix
// ════════════════════════════════════════════════════════════════════════════

/// Lineair driehoekselement: `(oppervlak, b, c)` met `∇Nᵢ = (bᵢ, cᵢ)/2A`.
fn element(p0: [f64; 2], p1: [f64; 2], p2: [f64; 2]) -> (f64, [f64; 3], [f64; 3]) {
    let opp = 0.5 * ((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
    let b = [p1[1] - p2[1], p2[1] - p0[1], p0[1] - p1[1]];
    let c = [p2[0] - p1[0], p0[0] - p2[0], p1[0] - p0[0]];
    (opp, b, c)
}

// ════════════════════════════════════════════════════════════════════════════
//  IJle matrix + geconjugeerde gradiënten
// ════════════════════════════════════════════════════════════════════════════

/// Rijgecomprimeerde symmetrische matrix.
struct Ijl {
    n: usize,
    rij: Vec<u32>,
    kol: Vec<u32>,
    waarde: Vec<f64>,
}

impl Ijl {
    fn uit_tripletten(n: usize, mut t: Vec<(u32, u32, f64)>) -> Ijl {
        t.sort_unstable_by_key(|&(i, j, _)| ((i as u64) << 32) | j as u64);
        let mut rij = vec![0u32; n + 1];
        let mut kol: Vec<u32> = Vec::with_capacity(t.len());
        let mut waarde: Vec<f64> = Vec::with_capacity(t.len());
        let mut k = 0;
        while k < t.len() {
            let (i, j, _) = t[k];
            let mut som = 0.0;
            while k < t.len() && t[k].0 == i && t[k].1 == j {
                som += t[k].2;
                k += 1;
            }
            kol.push(j);
            waarde.push(som);
            rij[i as usize + 1] = kol.len() as u32;
        }
        for i in 1..=n {
            rij[i] = rij[i].max(rij[i - 1]);
        }
        Ijl { n, rij, kol, waarde }
    }

    fn maal(&self, x: &[f64], uit: &mut [f64]) {
        for i in 0..self.n {
            let mut s = 0.0;
            for k in self.rij[i] as usize..self.rij[i + 1] as usize {
                s += self.waarde[k] * x[self.kol[k] as usize];
            }
            uit[i] = s;
        }
    }

    fn diagonaal(&self) -> Vec<f64> {
        let mut d = vec![0.0; self.n];
        for i in 0..self.n {
            for k in self.rij[i] as usize..self.rij[i + 1] as usize {
                if self.kol[k] as usize == i {
                    d[i] = self.waarde[k];
                }
            }
        }
        d
    }
}

/// Trekt per samenhangend deel het gemiddelde eraf.
///
/// De stijfheidsmatrix van een zuiver Neumann-probleem is singulier: elke
/// constante per samenhangend deel zit in de nulruimte. Door residu en
/// zoekrichting telkens daarop loodrecht te projecteren blijft CG netjes in de
/// complementaire ruimte werken, zonder een knoop vast te zetten (wat het
//  conditiegetal onnodig zou verslechteren).
fn projecteer(x: &mut [f64], deel: &[u32], aantal: usize) {
    if aantal == 0 {
        return;
    }
    let mut som = vec![0.0; aantal];
    let mut tel = vec![0.0; aantal];
    for (i, &d) in deel.iter().enumerate() {
        som[d as usize] += x[i];
        tel[d as usize] += 1.0;
    }
    for k in 0..aantal {
        if tel[k] > 0.0 {
            som[k] /= tel[k];
        }
    }
    for (i, &d) in deel.iter().enumerate() {
        x[i] -= som[d as usize];
    }
}

/// Jacobi-gepreconditioneerde CG. `deel`/`aantal` schakelen de projectie in.
fn cg(
    a: &Ijl,
    b: &[f64],
    tol: f64,
    maxit: usize,
    deel: Option<(&[u32], usize)>,
) -> (Vec<f64>, usize) {
    let n = a.n;
    let diag = a.diagonaal();
    let minv: Vec<f64> = diag.iter().map(|&d| if d.abs() > 0.0 { 1.0 / d } else { 1.0 }).collect();
    let proj = |v: &mut [f64]| {
        if let Some((d, k)) = deel {
            projecteer(v, d, k);
        }
    };

    let mut x = vec![0.0; n];
    let mut r = b.to_vec();
    proj(&mut r);
    let r0 = r.iter().map(|v| v * v).sum::<f64>().sqrt();
    if r0 == 0.0 {
        return (x, 0);
    }
    let mut z: Vec<f64> = r.iter().zip(&minv).map(|(a, b)| a * b).collect();
    proj(&mut z);
    let mut p = z.clone();
    let mut rz: f64 = r.iter().zip(&z).map(|(a, b)| a * b).sum();
    let mut ap = vec![0.0; n];
    let mut iteraties = 0;
    for it in 0..maxit {
        iteraties = it + 1;
        a.maal(&p, &mut ap);
        proj(&mut ap);
        let pap: f64 = p.iter().zip(&ap).map(|(a, b)| a * b).sum();
        if pap <= 0.0 {
            break;
        }
        let alpha = rz / pap;
        for i in 0..n {
            x[i] += alpha * p[i];
            r[i] -= alpha * ap[i];
        }
        let rn = r.iter().map(|v| v * v).sum::<f64>().sqrt();
        if rn <= tol * r0 {
            break;
        }
        for i in 0..n {
            z[i] = r[i] * minv[i];
        }
        proj(&mut z);
        let rz_n: f64 = r.iter().zip(&z).map(|(a, b)| a * b).sum();
        let beta = rz_n / rz;
        rz = rz_n;
        for i in 0..n {
            p[i] = z[i] + beta * p[i];
        }
    }
    (x, iteraties)
}

// ════════════════════════════════════════════════════════════════════════════
//  Prandtl
// ════════════════════════════════════════════════════════════════════════════

fn los_prandtl_op(mesh: &Mesh2D, p: &[[f64; 2]], opties: &TorsieOpties) -> (f64, usize) {
    let n = mesh.punten.len();
    // −1 = vast op nul (buitenrand); ≥ 0 = vrijheidsgraadnummer.
    // De gaten krijgen de eerste nummers en delen elk één vrijheidsgraad.
    let gaten: Vec<&crate::mesh2d::Randlus> = mesh.lussen.iter().filter(|l| l.gat).collect();
    let mut dof = vec![i64::MIN; n];
    for (k, lus) in gaten.iter().enumerate() {
        for &knoop in &lus.knopen {
            dof[knoop as usize] = k as i64;
        }
    }
    for lus in mesh.lussen.iter().filter(|l| !l.gat) {
        for &knoop in &lus.knopen {
            dof[knoop as usize] = -1;
        }
    }
    let mut vrij = gaten.len();
    for d in dof.iter_mut() {
        if *d == i64::MIN {
            *d = vrij as i64;
            vrij += 1;
        }
    }
    if vrij == 0 {
        return (0.0, 0);
    }

    let mut trip: Vec<(u32, u32, f64)> = Vec::with_capacity(mesh.driehoeken.len() * 9);
    let mut f = vec![0.0; vrij];
    for t in &mesh.driehoeken {
        let (opp, b, c) = element(p[t[0] as usize], p[t[1] as usize], p[t[2] as usize]);
        if opp <= 0.0 {
            continue;
        }
        for i in 0..3 {
            let di = dof[t[i] as usize];
            if di < 0 {
                continue;
            }
            f[di as usize] += 2.0 * opp / 3.0;
            for j in 0..3 {
                let dj = dof[t[j] as usize];
                if dj < 0 {
                    continue;
                }
                let k = (b[i] * b[j] + c[i] * c[j]) / (4.0 * opp);
                trip.push((di as u32, dj as u32, k));
            }
        }
    }
    // Circulatievoorwaarde per gat: 2·Aₖ in het rechterlid.
    for (k, lus) in gaten.iter().enumerate() {
        f[k] += 2.0 * lus.oppervlak_mm2;
    }

    let a = Ijl::uit_tripletten(vrij, trip);
    let (x, iteraties) = cg(&a, &f, opties.tolerantie, opties.max_iteraties, None);

    let phi = |knoop: u32| -> f64 {
        let d = dof[knoop as usize];
        if d < 0 {
            0.0
        } else {
            x[d as usize]
        }
    };
    let mut integraal = 0.0;
    for t in &mesh.driehoeken {
        let opp = mesh.oppervlak_van(*t);
        integraal += opp * (phi(t[0]) + phi(t[1]) + phi(t[2])) / 3.0;
    }
    let mut it = 2.0 * integraal;
    for (k, lus) in gaten.iter().enumerate() {
        it += 2.0 * x[k] * lus.oppervlak_mm2;
    }
    (it, iteraties)
}

// ════════════════════════════════════════════════════════════════════════════
//  Welving
// ════════════════════════════════════════════════════════════════════════════

struct Welving {
    it: f64,
    iw: f64,
    y_p: f64,
    z_p: f64,
    iy: f64,
    iz: f64,
    iteraties: usize,
    losse_delen: bool,
}

/// Samenhangende delen van de mesh, via vereniging-zoeken over de driehoeken.
fn delen(n: usize, driehoeken: &[[u32; 3]]) -> (Vec<u32>, usize) {
    let mut ouder: Vec<u32> = (0..n as u32).collect();
    fn zoek(ouder: &mut Vec<u32>, mut x: u32) -> u32 {
        while ouder[x as usize] != x {
            ouder[x as usize] = ouder[ouder[x as usize] as usize];
            x = ouder[x as usize];
        }
        x
    }
    for t in driehoeken {
        for k in 1..3 {
            let (a, b) = (zoek(&mut ouder, t[0]), zoek(&mut ouder, t[k]));
            if a != b {
                ouder[b as usize] = a;
            }
        }
    }
    let mut label = vec![u32::MAX; n];
    let mut aantal = 0u32;
    for i in 0..n {
        let w = zoek(&mut ouder, i as u32);
        if label[w as usize] == u32::MAX {
            label[w as usize] = aantal;
            aantal += 1;
        }
        label[i] = label[w as usize];
    }
    (label, aantal as usize)
}

fn los_welving_op(mesh: &Mesh2D, p: &[[f64; 2]], a_tot: f64, opties: &TorsieOpties) -> Welving {
    let n = mesh.punten.len();
    let mut trip: Vec<(u32, u32, f64)> = Vec::with_capacity(mesh.driehoeken.len() * 9);
    for t in &mesh.driehoeken {
        let (opp, b, c) = element(p[t[0] as usize], p[t[1] as usize], p[t[2] as usize]);
        if opp <= 0.0 {
            continue;
        }
        for i in 0..3 {
            for j in 0..3 {
                trip.push((t[i], t[j], (b[i] * b[j] + c[i] * c[j]) / (4.0 * opp)));
            }
        }
    }
    // Randbelasting ∮ v·(y dy + z dz), exact per recht randstukje.
    let mut f = vec![0.0; n];
    for lus in &mesh.lussen {
        let m = lus.knopen.len();
        if m < 3 {
            continue;
        }
        for k in 0..m {
            let (i, j) = (lus.knopen[k] as usize, lus.knopen[(k + 1) % m] as usize);
            let (ay, az) = (p[j][0] - p[i][0], p[j][1] - p[i][1]);
            let cc = p[i][0] * ay + p[i][1] * az;
            let dd = ay * ay + az * az;
            f[i] += cc / 2.0 + dd / 6.0;
            f[j] += cc / 2.0 + dd / 3.0;
        }
    }

    let (deel, aantal) = delen(n, &mesh.driehoeken);
    let a = Ijl::uit_tripletten(n, trip);
    let (omega, iteraties) =
        cg(&a, &f, opties.tolerantie, opties.max_iteraties, Some((&deel, aantal)));

    // ── Integralen over de mesh ─────────────────────────────────────────────
    let bilineair = |opp: f64, u: [f64; 3], v: [f64; 3]| {
        let su = u[0] + u[1] + u[2];
        let sv = v[0] + v[1] + v[2];
        opp / 12.0 * (su * sv + u[0] * v[0] + u[1] * v[1] + u[2] * v[2])
    };
    let (mut iy, mut iz, mut iyz) = (0.0, 0.0, 0.0);
    let (mut s_wy, mut s_wz) = (0.0, 0.0);
    let mut grad2 = 0.0;
    for t in &mesh.driehoeken {
        let (opp, b, c) = element(p[t[0] as usize], p[t[1] as usize], p[t[2] as usize]);
        if opp <= 0.0 {
            continue;
        }
        let ys = [p[t[0] as usize][0], p[t[1] as usize][0], p[t[2] as usize][0]];
        let zs = [p[t[0] as usize][1], p[t[1] as usize][1], p[t[2] as usize][1]];
        let ws = [omega[t[0] as usize], omega[t[1] as usize], omega[t[2] as usize]];
        iy += bilineair(opp, zs, zs);
        iz += bilineair(opp, ys, ys);
        iyz += bilineair(opp, ys, zs);
        s_wy += bilineair(opp, ws, ys);
        s_wz += bilineair(opp, ws, zs);
        let gy = (ws[0] * b[0] + ws[1] * b[1] + ws[2] * b[2]) / (2.0 * opp);
        let gz = (ws[0] * c[0] + ws[1] * c[1] + ws[2] * c[2]) / (2.0 * opp);
        grad2 += opp * (gy * gy + gz * gz);
    }

    // ── Schuifmiddelpunt ────────────────────────────────────────────────────
    let det = iy * iz - iyz * iyz;
    let (y_p, z_p) = if det.abs() > 1e-14 * (iy * iz).abs().max(1.0) {
        ((iyz * s_wy - iz * s_wz) / det, (s_wy * iy - iyz * s_wz) / det)
    } else {
        (0.0, 0.0)
    };

    // ── ω om het schuifmiddelpunt, op nulgemiddelde ─────────────────────────
    let omega_s: Vec<f64> =
        omega.iter().enumerate().map(|(i, w)| w - z_p * p[i][0] + y_p * p[i][1]).collect();
    let mut som = 0.0;
    for t in &mesh.driehoeken {
        let opp = mesh.oppervlak_van(*t);
        som += opp
            * (omega_s[t[0] as usize] + omega_s[t[1] as usize] + omega_s[t[2] as usize])
            / 3.0;
    }
    let gem = if a_tot > 0.0 { som / a_tot } else { 0.0 };
    let mut iw = 0.0;
    for t in &mesh.driehoeken {
        let opp = mesh.oppervlak_van(*t);
        if opp <= 0.0 {
            continue;
        }
        let w = [
            omega_s[t[0] as usize] - gem,
            omega_s[t[1] as usize] - gem,
            omega_s[t[2] as usize] - gem,
        ];
        iw += bilineair(opp, w, w);
    }

    Welving {
        it: iy + iz - grad2,
        iw,
        y_p,
        z_p,
        iy,
        iz,
        iteraties,
        losse_delen: aantal > 1,
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contour::{
        buis, i_profiel, koker, rechthoek, u_profiel, Contour, ContourBouwer, Doorsnede,
    };
    use std::f64::consts::PI;

    fn cirkel(r: f64) -> Doorsnede {
        Doorsnede::nieuw().met(Contour::cirkel((0.0, 0.0), r))
    }

    /// Ellips als veelhoek met `n` hoekpunten (de contourkern kent alleen
    /// lijnen en cirkelbogen; een ellips is geen van beide).
    fn ellips(a: f64, b: f64, n: usize) -> Doorsnede {
        let mut c = ContourBouwer::nieuw(a, 0.0);
        for k in 1..n {
            let t = 2.0 * PI * k as f64 / n as f64;
            c = c.lijn(a * t.cos(), b * t.sin());
        }
        Doorsnede::nieuw().met(c.sluit())
    }

    /// Exacte torsieconstante van een rechthoek `b × t` (`b ≥ t`), uit de
    /// reeksoplossing van Saint-Venant:
    /// `J = ⅓bt³[1 − (192/π⁵)(t/b)·Σ_{n oneven} tanh(nπb/2t)/n⁵]`.
    fn rechthoek_it_exact(b: f64, t: f64) -> f64 {
        let (b, t) = if b >= t { (b, t) } else { (t, b) };
        let mut som = 0.0;
        let mut n = 1.0;
        while n < 60.0 {
            som += (n * PI * b / (2.0 * t)).tanh() / n.powi(5);
            n += 2.0;
        }
        b * t.powi(3) / 3.0 * (1.0 - 192.0 / PI.powi(5) * (t / b) * som)
    }

    fn rel(gevonden: f64, exact: f64) -> f64 {
        (gevonden - exact) / exact
    }

    // ── 1. Cirkel: It = πr⁴/2 exact ─────────────────────────────────────────

    #[test]
    fn cirkel_it_convergeert_kwadratisch() {
        let r: f64 = 50.0;
        let exact = PI * r.powi(4) / 2.0;
        let mut fouten = Vec::new();
        for h in [10.0, 5.0, 2.5] {
            let res = bereken_met(&cirkel(r), TorsieOpties::met_h(h));
            fouten.push(rel(res.it_mm4, exact).abs());
            assert!(
                res.it_ondergrens_mm4 <= res.it_bovengrens_mm4 * (1.0 + 1e-9),
                "insluiting klopt niet bij h={h}"
            );
        }
        // Halvering van h moet de fout ruwweg vierendelen; eis conservatief 3×.
        for k in 0..fouten.len() - 1 {
            assert!(
                fouten[k] / fouten[k + 1] > 3.0,
                "convergentieorde te laag: {:?}",
                fouten
            );
        }
        assert!(fouten[2] < 2e-3, "fijnste fout {:e}", fouten[2]);
    }

    #[test]
    fn cirkel_heeft_geen_welving() {
        let r: f64 = 50.0;
        let res = bereken_met(&cirkel(r), TorsieOpties::met_h(4.0));
        // Iw = 0 exact; schaal met (A·r⁴) om er een dimensieloos getal van te maken.
        let schaal = res.a_mesh_mm2 * r.powi(4);
        assert!(res.iw_mm6.abs() / schaal < 1e-6, "Iw = {}", res.iw_mm6);
        assert!(res.y_s_mm.abs() < 1e-6 * r && res.z_s_mm.abs() < 1e-6 * r);
    }

    // ── 2. Ellips: It = πa³b³/(a²+b²) ───────────────────────────────────────

    #[test]
    fn ellips_it() {
        let (a, b): (f64, f64) = (60.0, 30.0);
        let exact = PI * a.powi(3) * b.powi(3) / (a * a + b * b);
        let h = 2.0;
        let res = bereken_met(&ellips(a, b, 240), TorsieOpties::met_h(h));
        assert!(rel(res.it_mm4, exact).abs() < 5e-3, "It = {} vs {exact}", res.it_mm4);
    }

    // ── 3. Rechthoeken: de β-reeks ──────────────────────────────────────────

    #[test]
    fn rechthoek_it_volgt_de_reeks() {
        for (bb, tt, beta) in [(60.0, 60.0, 0.1406), (120.0, 60.0, 0.229), (300.0, 30.0, 0.312)] {
            let exact = rechthoek_it_exact(bb, tt);
            // De klassieke β-tabel als extra controle op onze eigen reeks.
            assert!(
                (exact / (bb * tt.powi(3)) - beta).abs() < 5e-4,
                "reeks geeft β = {}",
                exact / (bb * tt.powi(3))
            );
            let d = rechthoek(tt, bb); // rechthoek(h, b): hoogte = tt, breedte = bb
            let res = bereken(&d);
            assert!(
                rel(res.it_beste_mm4, exact).abs() < 5e-3,
                "b×t = {bb}×{tt}: midden {:.3}%",
                rel(res.it_beste_mm4, exact) * 100.0
            );
            // De grenzen sluiten de exacte waarde in.
            assert!(
                res.it_ondergrens_mm4 < exact && exact < res.it_bovengrens_mm4,
                "b×t = {bb}×{tt}: {exact} niet in [{}, {}]",
                res.it_ondergrens_mm4,
                res.it_bovengrens_mm4
            );
        }
    }

    /// De dichtheid uit [`ELEMENTEN_PER_WAND`] moet álle gevallen met een
    /// bekende exacte waarde binnen 0,5 % halen. Dit is de test die die keuze
    /// vastlegt.
    #[test]
    fn standaarddichtheid_haalt_een_half_procent() {
        let (a, b): (f64, f64) = (60.0, 30.0);
        let (d_b, t): (f64, f64) = (219.1, 8.0);
        let (ro, ri) = (d_b / 2.0, d_b / 2.0 - t);
        let gevallen: Vec<(&str, Doorsnede, f64)> = vec![
            ("cirkel r=50", cirkel(50.0), PI * 50.0_f64.powi(4) / 2.0),
            ("ellips 60×30", ellips(a, b, 240), PI * a.powi(3) * b.powi(3) / (a * a + b * b)),
            ("rechthoek b/t=1", rechthoek(60.0, 60.0), rechthoek_it_exact(60.0, 60.0)),
            ("rechthoek b/t=2", rechthoek(60.0, 120.0), rechthoek_it_exact(120.0, 60.0)),
            ("rechthoek b/t=10", rechthoek(30.0, 300.0), rechthoek_it_exact(300.0, 30.0)),
            ("buis 219,1×8", buis(d_b, t), PI * (ro.powi(4) - ri.powi(4)) / 2.0),
        ];
        for (naam, d, exact) in gevallen {
            let r = bereken(&d);
            let f = rel(r.it_beste_mm4, exact);
            assert!(
                f.abs() < 5e-3,
                "{naam}: {:+.3}% bij h = {:.3} mm ({} elementen)",
                f * 100.0,
                r.h_mm,
                r.driehoeken
            );
        }
    }

    // ── 4. Ronde buis: It = π(ro⁴ − ri⁴)/2 exact, mét gat ───────────────────

    #[test]
    fn buis_it_exact_met_gat() {
        let (d_buiten, t): (f64, f64) = (219.1, 8.0);
        let (ro, ri) = (d_buiten / 2.0, d_buiten / 2.0 - t);
        let exact = PI * (ro.powi(4) - ri.powi(4)) / 2.0;
        let d = buis(d_buiten, t);
        let res = bereken_met(&d, TorsieOpties::met_h(1.5));
        let f = rel(res.it_mm4, exact).abs();
        assert!(f < 5e-3, "It = {} vs {exact} ({:.3}%)", res.it_mm4, f * 100.0);
    }

    // ── 5. Gesloten koker: Bredt ────────────────────────────────────────────

    #[test]
    fn koker_it_bij_bredt() {
        let (h, b, t) = (200.0, 100.0, 5.0);
        let d = koker(h, b, t, 0.0);
        // Bredt: J = 4Am²/∮(ds/t), middellijn h−t bij b−t.
        let am = (b - t) * (h - t);
        let bredt = 4.0 * am * am / (2.0 * ((b - t) + (h - t)) / t);
        let res = bereken_met(&d, TorsieOpties::met_h(aanbevolen_h(&d, 6.0)));
        let f = rel(res.it_mm4, bredt).abs();
        // Bredt is zelf de benadering (dunwandig, scherpe hoeken); de FEM is de
        // exacte waarde. Enkele procenten verschil hoort erbij.
        assert!(f < 0.05, "It = {} vs Bredt {bredt} ({:.2}%)", res.it_mm4, f * 100.0);
    }

    // ── 6. I-profiel: It en Iw tegen de catalogus ───────────────────────────

    #[test]
    fn ipe200_it_en_iw() {
        let (h, b, tw, tf, r) = (200.0, 100.0, 5.6, 8.5, 12.0);
        let d = i_profiel(h, b, tw, tf, r);
        let res = bereken_met(&d, TorsieOpties::met_h(aanbevolen_h(&d, 6.0)));
        // Catalogus IPE 200: It = 6,98·10⁴ mm⁴, Iw = 13,0·10⁹ mm⁶.
        assert!(
            rel(res.it_mm4, 69_800.0).abs() < 0.06,
            "It = {} (catalogus 69800)",
            res.it_mm4
        );
        // Dunwandige benadering Iw = Iz·(h − tf)²/4.
        let eig = d.bereken();
        let iw_dun = eig.iz_mm4 * (h - tf).powi(2) / 4.0;
        assert!(
            rel(res.iw_mm6, iw_dun).abs() < 0.06,
            "Iw = {:e} vs dunwandig {:e}",
            res.iw_mm6,
            iw_dun
        );
        // Dubbelsymmetrisch: schuifmiddelpunt = zwaartepunt.
        assert!((res.y_s_mm - b / 2.0).abs() < 0.02 * b);
        assert!((res.z_s_mm - h / 2.0).abs() < 0.02 * h);
    }

    #[test]
    fn i_profiel_zonder_afronding_ligt_tussen_de_twee_plaatsommen() {
        // Twee klassieke referenties voor een gelaste I-vorm zonder afronding:
        //
        // * `Σβᵢbᵢtᵢ³` — elke plaat als losse rechthoek met haar eigen β uit de
        //   reeks. Dat is een **ondergrens**: de plaatuiteinden waar ze aan
        //   elkaar zitten zijn in werkelijkheid niet vrij.
        // * `⅓Σbt³` — dezelfde som met β = ⅓, de dunwandige limiet. Dat is een
        //   **bovengrens**: geen enkele plaat is oneindig lang.
        //
        // De numerieke waarde hoort daar netjes tussenin te vallen.
        let (h, b, tw, tf): (f64, f64, f64, f64) = (400.0, 180.0, 8.6, 13.5);
        let d = i_profiel(h, b, tw, tf, 0.0);
        let hw = h - 2.0 * tf;
        let onder = 2.0 * rechthoek_it_exact(b, tf) + rechthoek_it_exact(hw, tw);
        let boven = (2.0 * b * tf.powi(3) + hw * tw.powi(3)) / 3.0;
        let it = bereken(&d).it_beste_mm4;
        assert!(
            it > onder && it < boven,
            "It = {it} niet tussen Σβbt³ = {onder} en ⅓Σbt³ = {boven}"
        );
    }

    // ── 7. U-profiel: schuifmiddelpunt ──────────────────────────────────────

    /// Klassieke dunwandige middellijnwaarden voor een U met parallelle
    /// flenzen: schuifmiddelpuntsafstand vanaf het hárt van het lijf, en `Iw`.
    fn u_dunwandig(h: f64, b: f64, tw: f64, tf: f64) -> (f64, f64) {
        let bs = b - tw / 2.0; // flenslengte tot het hart van het lijf
        let hs = h - tf; // afstand tussen de flensmiddellijnen
        let iy = tw * hs.powi(3) / 12.0 + bs * tf * hs * hs / 2.0;
        let e = bs * bs * hs * hs * tf / (4.0 * iy);
        let iw = bs.powi(3) * hs * hs * tf / 12.0 * (3.0 * bs * tf + 2.0 * hs * tw)
            / (6.0 * bs * tf + hs * tw);
        (e, iw)
    }

    #[test]
    fn dunne_u_valt_samen_met_de_sectoriale_middellijnwaarde() {
        // Hoe dunner de wand, hoe scherper de dunwandige theorie klopt. Bij
        // t/h = 1 % moet de numerieke oplossing er binnen een paar procent op
        // liggen — dat is de eigenlijke controle op ω, het schuifmiddelpunt en
        // de normalisatie.
        let (h, b, tw, tf) = (300.0, 100.0, 3.0, 3.0);
        let d = u_profiel(h, b, tw, tf, 0.0);
        let (e_dun, iw_dun) = u_dunwandig(h, b, tw, tf);
        let res = bereken_met(&d, TorsieOpties::met_h(aanbevolen_h(&d, 3.0)));
        let e = tw / 2.0 - res.y_s_mm;
        assert!(
            rel(e, e_dun).abs() < 0.03,
            "schuifmiddelpunt {e:.3} mm vs dunwandig {e_dun:.3} mm"
        );
        assert!(
            rel(res.iw_mm6, iw_dun).abs() < 0.03,
            "Iw = {:e} vs dunwandig {iw_dun:e}",
            res.iw_mm6
        );
    }

    #[test]
    fn unp200_schuifmiddelpunt_en_welving() {
        let (h, b, tw, tf, r) = (200.0, 75.0, 8.5, 11.5, 11.5);
        let d = u_profiel(h, b, tw, tf, r);
        let res = bereken(&d);
        // Het schuifmiddelpunt ligt aan de andere kant van het lijf dan de
        // flenzen; de klassieke maat is de afstand tot het hart van het lijf.
        // Dunwandig komt daar 26,6 mm uit; de numerieke waarde ligt iets lager
        // doordat de walsafrondingen (r = 11,5) materiaal vlak bij het lijf
        // toevoegen, precies waar de sectoriale coördinaat klein is.
        let (e_dun, iw_dun) = u_dunwandig(h, b, tw, tf);
        assert!((e_dun - 26.63).abs() < 0.2, "middellijnwaarde {e_dun}");
        let e = tw / 2.0 - res.y_s_mm;
        assert!(
            e > 0.0 && rel(e, e_dun).abs() < 0.08,
            "schuifmiddelpunt {e:.3} mm vs middellijn {e_dun:.3} mm"
        );
        // Symmetrieas: z_s in het midden.
        assert!((res.z_s_mm - h / 2.0).abs() < 0.01 * h);
        assert!(
            rel(res.iw_mm6, iw_dun).abs() < 0.05,
            "Iw = {:e} vs middellijn {iw_dun:e}",
            res.iw_mm6
        );
        // De catalogus geeft 9,07·10⁹ mm⁶; dat hoort bij de UNP-vorm mét 8 %
        // flenshelling, waar de flensdikte aan de punt kleiner is en de welving
        // dus lager uitvalt. Onze contour heeft parallelle flenzen, dus die
        // twee getallen hóren te verschillen.
        assert!(res.iw_mm6 > 9.0e9);
    }

    // ── 8. Algemene eigenschappen ───────────────────────────────────────────

    #[test]
    fn insluiting_klopt_bij_elk_profiel() {
        let gevallen: Vec<(&str, Doorsnede)> = vec![
            ("cirkel", cirkel(40.0)),
            ("rechthoek", rechthoek(60.0, 120.0)),
            ("IPE 200", i_profiel(200.0, 100.0, 5.6, 8.5, 12.0)),
            ("UNP 200", u_profiel(200.0, 75.0, 8.5, 11.5, 11.5)),
            ("koker", koker(150.0, 150.0, 6.0, 9.0)),
        ];
        for (naam, d) in gevallen {
            let res = bereken_met(&d, TorsieOpties::met_h(aanbevolen_h(&d, 4.0)));
            assert!(
                res.it_ondergrens_mm4 > 0.0
                    && res.it_ondergrens_mm4 <= res.it_bovengrens_mm4 * (1.0 + 1e-9),
                "{naam}: [{}, {}]",
                res.it_ondergrens_mm4,
                res.it_bovengrens_mm4
            );
            assert!(!res.losse_delen, "{naam}: mesh viel uiteen");
        }
    }

    #[test]
    fn verschuiven_verandert_niets() {
        let d = i_profiel(200.0, 100.0, 5.6, 8.5, 12.0);
        let o = TorsieOpties::met_h(1.2);
        let a = bereken_met(&d, o);
        let b = bereken_met(&d.verschoven(4000.0, -2500.0), o);
        assert!(rel(b.it_mm4, a.it_mm4).abs() < 1e-9);
        assert!(rel(b.iw_mm6, a.iw_mm6).abs() < 1e-8);
        assert!((b.y_s_mm - 4000.0 - a.y_s_mm).abs() < 1e-6 * 100.0);
    }

    #[test]
    fn draaien_verandert_it_en_iw_niet() {
        let d = u_profiel(200.0, 75.0, 8.5, 11.5, 11.5);
        let o = TorsieOpties::met_h(1.5);
        let a = bereken_met(&d, o);
        let b = bereken_met(&d.gedraaid(0.7), o);
        // Andere mesh, dus geen machineprecisie; wel dezelfde grootheid.
        assert!(rel(b.it_mm4, a.it_mm4).abs() < 5e-3, "{} vs {}", b.it_mm4, a.it_mm4);
        assert!(rel(b.iw_mm6, a.iw_mm6).abs() < 5e-3);
    }

    /// Voor walsprofielen bestaat er geen exacte referentie, dus wordt de
    /// dichtheid daar tegen zichzelf afgezet: verdubbelen van het aantal
    /// elementen door de wand mag `it_beste_mm4` niet meer dan 0,5 % verschuiven.
    #[test]
    #[ignore = "twee meshes per profiel; alleen in de release-ronde"]
    fn standaarddichtheid_is_zelfconvergent_bij_walsprofielen() {
        for (naam, d) in [
            ("IPE 200", i_profiel(200.0, 100.0, 5.6, 8.5, 12.0)),
            ("HEB 300", i_profiel(300.0, 300.0, 11.0, 19.0, 27.0)),
            ("UNP 200", u_profiel(200.0, 75.0, 8.5, 11.5, 11.5)),
            ("RHS 200×100×8", koker(200.0, 100.0, 8.0, 12.0)),
        ] {
            let grof = bereken(&d);
            let fijn = bereken_met(
                &d,
                TorsieOpties::met_h(aanbevolen_h(&d, 2.0 * ELEMENTEN_PER_WAND)),
            );
            let f = rel(grof.it_beste_mm4, fijn.it_beste_mm4);
            assert!(f.abs() < 5e-3, "{naam}: {:+.3}% t.o.v. de fijne mesh", f * 100.0);
            let fw = rel(grof.iw_mm6, fijn.iw_mm6);
            assert!(fw.abs() < 5e-3, "{naam}: Iw {:+.3}%", fw * 100.0);
        }
    }

    // ── 9. Convergentietabellen (handmatig draaien) ─────────────────────────

    /// `cargo test --release -p section-properties -- --ignored --nocapture`
    #[test]
    #[ignore = "convergentiestudie; duurt te lang voor de gewone testronde"]
    fn convergentietabellen() {
        fn tabel(naam: &str, d: &Doorsnede, exact: Option<f64>, hs: &[f64]) {
            println!("\n=== {naam} ===");
            println!(
                "{:>8} {:>8} {:>9} {:>15} {:>15} {:>11} {:>11} {:>9}",
                "h [mm]",
                "knopen",
                "elem.",
                "It onder",
                "It boven",
                "fout onder",
                "fout midden",
                "ms"
            );
            for &h in hs {
                let r = bereken_met(d, TorsieOpties::met_h(h));
                let f = |v: f64| {
                    exact.map(|e| format!("{:+.3e}", (v - e) / e)).unwrap_or_else(|| "-".into())
                };
                println!(
                    "{:>8.3} {:>8} {:>9} {:>15.6e} {:>15.6e} {:>11} {:>11} {:>9.0}",
                    h,
                    r.knopen,
                    r.driehoeken,
                    r.it_ondergrens_mm4,
                    r.it_bovengrens_mm4,
                    f(r.it_ondergrens_mm4),
                    f(r.it_beste_mm4),
                    r.tijd_ms
                );
            }
        }

        let r: f64 = 50.0;
        tabel("cirkel r=50, It=πr⁴/2", &cirkel(r), Some(PI * r.powi(4) / 2.0), &[
            16.0, 8.0, 4.0, 2.0, 1.0,
        ]);

        let (a, b): (f64, f64) = (60.0, 30.0);
        tabel(
            "ellips 60×30, It=πa³b³/(a²+b²)",
            &ellips(a, b, 720),
            Some(PI * a.powi(3) * b.powi(3) / (a * a + b * b)),
            &[8.0, 4.0, 2.0, 1.0],
        );

        for (bb, tt) in [(60.0, 60.0), (120.0, 60.0), (300.0, 30.0)] {
            tabel(
                &format!("rechthoek {bb}×{tt} (b/t = {})", bb / tt),
                &rechthoek(tt, bb),
                Some(rechthoek_it_exact(bb, tt)),
                &[tt / 4.0, tt / 8.0, tt / 16.0, tt / 32.0],
            );
        }

        let (d_b, t): (f64, f64) = (219.1, 8.0);
        let (ro, ri) = (d_b / 2.0, d_b / 2.0 - t);
        tabel(
            "buis 219,1×8, It=π(ro⁴−ri⁴)/2",
            &buis(d_b, t),
            Some(PI * (ro.powi(4) - ri.powi(4)) / 2.0),
            &[4.0, 2.0, 1.0, 0.5],
        );

        let ipe = i_profiel(200.0, 100.0, 5.6, 8.5, 12.0);
        tabel("IPE 200 (catalogus It = 69 800)", &ipe, Some(69_800.0), &[
            2.8, 1.4, 0.7, 0.35,
        ]);

        let unp = u_profiel(200.0, 75.0, 8.5, 11.5, 11.5);
        tabel("UNP 200 (catalogus It = 127 258)", &unp, Some(127_258.0), &[
            3.0, 1.5, 0.75, 0.4,
        ]);

        let ko = koker(200.0, 100.0, 5.0, 0.0);
        let am = 95.0 * 195.0;
        tabel("koker 200×100×5 (Bredt)", &ko, Some(4.0 * am * am / (2.0 * (95.0 + 195.0) / 5.0)), &[
            2.5, 1.25, 0.6, 0.3,
        ]);

        // ── Standaarddichtheid: wat kost het en wat levert het op ────────────
        println!("\n=== standaarddichtheid ({ELEMENTEN_PER_WAND} elem. per wand) ===");
        println!(
            "{:>18} {:>8} {:>9} {:>15} {:>11} {:>10} {:>8}",
            "profiel", "h [mm]", "elem.", "It beste", "band", "CG-stappen", "ms"
        );
        let mut totaal = 0.0;
        for (naam, d) in [
            ("IPE 200", i_profiel(200.0, 100.0, 5.6, 8.5, 12.0)),
            ("IPE 600", i_profiel(600.0, 220.0, 12.0, 19.0, 24.0)),
            ("HEA 200", i_profiel(190.0, 200.0, 6.5, 10.0, 18.0)),
            ("HEB 1000", i_profiel(1000.0, 300.0, 19.0, 36.0, 30.0)),
            ("UNP 200", u_profiel(200.0, 75.0, 8.5, 11.5, 11.5)),
            ("SHS 100×5", koker(100.0, 100.0, 5.0, 7.5)),
            ("RHS 200×100×8", koker(200.0, 100.0, 8.0, 12.0)),
            ("buis 219,1×8", buis(219.1, 8.0)),
            ("massief 300×120", rechthoek(300.0, 120.0)),
        ] {
            let r = bereken(&d);
            totaal += r.tijd_ms;
            println!(
                "{:>18} {:>8.3} {:>9} {:>15.6e} {:>11.2e} {:>10} {:>8.0}",
                naam,
                r.h_mm,
                r.driehoeken,
                r.it_beste_mm4,
                r.it_onzekerheid,
                r.iteraties_prandtl.max(r.iteraties_welving),
                r.tijd_ms
            );
        }
        println!("  totaal {:.0} ms voor 9 profielen", totaal);

        println!("\n=== welving en schuifmiddelpunt ===");
        for (naam, d, h) in [
            ("IPE 200", i_profiel(200.0, 100.0, 5.6, 8.5, 12.0), &[2.8, 1.4, 0.7, 0.35][..]),
            ("UNP 200", u_profiel(200.0, 75.0, 8.5, 11.5, 11.5), &[3.0, 1.5, 0.75, 0.4][..]),
        ] {
            println!("\n-- {naam} --");
            println!("{:>8} {:>9} {:>16} {:>12} {:>12}", "h", "elem.", "Iw [mm⁶]", "y_s", "z_s");
            for &hh in h {
                let r = bereken_met(&d, TorsieOpties::met_h(hh));
                println!(
                    "{:>8.3} {:>9} {:>16.6e} {:>12.4} {:>12.4}",
                    hh, r.driehoeken, r.iw_mm6, r.y_s_mm, r.z_s_mm
                );
            }
        }

        // ── Wat de dunwandige benaderingen ervan maken ───────────────────────
        println!("\n=== numeriek versus dunwandig ===");
        let ipe = i_profiel(200.0, 100.0, 5.6, 8.5, 12.0);
        let r = bereken_met(&ipe, TorsieOpties::met_h(0.35));
        let iw_dun = ipe.bereken().iz_mm4 * (200.0 - 8.5_f64).powi(2) / 4.0;
        println!(
            "IPE 200  Iw: numeriek {:.5e}, dunwandig Iz(h−tf)²/4 = {:.5e} → {:+.2}%",
            r.iw_mm6,
            iw_dun,
            (r.iw_mm6 - iw_dun) / iw_dun * 100.0
        );
        println!(
            "IPE 200  It: numeriek {:.1}, catalogus 69 800 → {:+.2}%",
            r.it_beste_mm4,
            (r.it_beste_mm4 - 69_800.0) / 69_800.0 * 100.0
        );
        let unp = u_profiel(200.0, 75.0, 8.5, 11.5, 11.5);
        let r = bereken_met(&unp, TorsieOpties::met_h(0.4));
        let (e_dun, iw_dun) = u_dunwandig(200.0, 75.0, 8.5, 11.5);
        println!(
            "UNP 200  schuifmiddelpunt: numeriek {:.3} mm vanaf het hart van het lijf, \
             middellijn {:.3} mm → {:+.2}%",
            8.5 / 2.0 - r.y_s_mm,
            e_dun,
            (8.5 / 2.0 - r.y_s_mm - e_dun) / e_dun * 100.0
        );
        println!(
            "UNP 200  Iw: numeriek {:.5e}, middellijn {:.5e} → {:+.2}%",
            r.iw_mm6,
            iw_dun,
            (r.iw_mm6 - iw_dun) / iw_dun * 100.0
        );
        println!(
            "UNP 200  It: numeriek {:.1}, catalogus 127 258 → {:+.2}% \
             (catalogus geldt voor de UNP-vorm mét 8 % flenshelling)",
            r.it_beste_mm4,
            (r.it_beste_mm4 - 127_258.0) / 127_258.0 * 100.0
        );
    }
}
