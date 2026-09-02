//! Randconforme driehoeksmesh voor een [`Doorsnede`](crate::contour::Doorsnede).
//!
//! De contourkern in [`crate::contour`] levert alles wat als randintegraal te
//! schrijven is: oppervlak, statische momenten, traagheden, weerstandsmomenten.
//! De torsieconstante `It` en de welvingsconstante `Iw` horen daar niet bij —
//! die volgen uit een randwaardeprobleem *over het inwendige* van de doorsnede.
//! Daarvoor is een vlakverdeling nodig, en die maakt deze module.
//!
//! ## Waarom hier een eigen mesher staat
//!
//! De frontend heeft een randconforme mesher (WebAssembly), maar die is niet
//! aanroepbaar vanuit de Rust-kant en zou de doorsnedemotor afhankelijk maken
//! van een JS-runtime. Voor het genereren van de profieldatabase moet de motor
//! zelfstandig kunnen draaien, dus staat hier een compacte mesher die alleen
//! `std` gebruikt. De aanpak is bewust die van de standaardliteratuur, zodat er
//! niets nieuws te bewijzen valt:
//!
//! 1. **Discretiseren.** Elke contour wordt een gesloten polylijn. Rechte
//!    segmenten worden in stukken ≤ `h` geknipt; bogen ook, met daarbovenop een
//!    hoeklimiet van π/8 per stuk. De koordefout van een boog is dan
//!    `r(1 − cos(Δθ/2)) ≈ h²/(8r)` — dezelfde orde als de discretisatiefout van
//!    de lineaire driehoekselementen zelf, dus de randfout verpest de
//!    convergentiesnelheid niet.
//! 2. **Punten zaaien.** Alle polylijnknopen, plus een driehoeksrooster met
//!    steek `h` binnen het materiaal (rijen op `h·√3/2`, om en om een halve
//!    steek verschoven), waarbij punten dichter dan `0,6·h` bij de rand
//!    wegvallen. Zo'n rooster is *van zichzelf* al bijna gelijkzijdig; er hoeft
//!    dus geen kwaliteitsverfijning achteraf.
//! 3. **Delaunay.** Bowyer–Watson met superdriehoek, incrementeel, met een
//!    ruimtelijk gesorteerde invoegvolgorde zodat de puntlokalisatie kort
//!    wandelt.
//! 4. **Randherstel.** Elk randsegment moet als driehoekszijde terugkomen.
//!    Ontbreekt er één, dan wordt hij in tweeën geknipt en het middelpunt
//!    ingevoegd (de standaard-Ruppert-stap). Dat termineert; in de praktijk is
//!    één ronde genoeg omdat de roosterpunten al `0,6·h` van de rand vandaan
//!    blijven.
//! 5. **Classificeren.** Vanaf de superdriehoek een breedte-eerst-wandeling
//!    over de driehoeken; elke keer dat een randsegment wordt overgestoken
//!    klapt "binnen/buiten" om. Zo vallen zowel de holtes van een U- of
//!    I-vorm als de gaten van een koker vanzelf buiten de mesh.
//!
//! Buiten het materiaal wordt een *grof* rooster (steek `3·h`) gezaaid. Dat
//! is puur numerieke hygiëne: een leeg gat waarvan de rand een cirkel is levert
//! anders louter concyclische punten op, en dan is de Delaunay-driehoeking niet
//! uniek en de in-cirkeltest een muntworp. Die driehoeken worden daarna
//! weggegooid.
//!
//! ## Wat deze mesher niet doet
//!
//! Geen lokale verfijning (overal dezelfde `h`), geen kromme elementen, geen
//! garantie op een minimumhoek. Voor de walsprofielen en samengestelde
//! doorsneden waar het hier om gaat is dat ruim voldoende; zie de
//! convergentietabellen in [`crate::torsie`].

use std::collections::{HashMap, HashSet};
use std::f64::consts::PI;

use crate::contour::{Doorsnede, Segment};

// ════════════════════════════════════════════════════════════════════════════
//  Uitkomst
// ════════════════════════════════════════════════════════════════════════════

/// Eén gesloten randlus van de mesh, in doorloopvolgorde (materiaal links).
#[derive(Clone, Debug, PartialEq)]
pub struct Randlus {
    /// Knoopindices in `Mesh2D::punten`, in volgorde; niet gesloten herhaald.
    pub knopen: Vec<u32>,
    /// `true` voor een binnenrand (gat), `false` voor een buitenrand.
    pub gat: bool,
    /// Absoluut omsloten oppervlak van de polylijn (mm²).
    pub oppervlak_mm2: f64,
}

/// Driehoeksmesh van een doorsnede. Alle driehoeken zijn tegen de klok in.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Mesh2D {
    pub punten: Vec<[f64; 2]>,
    pub driehoeken: Vec<[u32; 3]>,
    pub lussen: Vec<Randlus>,
    /// De gevraagde elementgrootte waarmee deze mesh is gemaakt.
    pub h_mm: f64,
}

impl Mesh2D {
    /// Oppervlak van de gediscretiseerde doorsnede (som van de driehoeken).
    pub fn oppervlak_mm2(&self) -> f64 {
        self.driehoeken.iter().map(|t| self.oppervlak_van(*t)).sum()
    }

    /// Oppervlak van één driehoek; positief als de knopen tegen de klok in staan.
    pub fn oppervlak_van(&self, t: [u32; 3]) -> f64 {
        let a = self.punten[t[0] as usize];
        let b = self.punten[t[1] as usize];
        let c = self.punten[t[2] as usize];
        0.5 * ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    }

    /// `(A, Sy, Sz, Iyy, Izz, Iyz)` om de oorsprong, uit de driehoeken zelf.
    ///
    /// Bewust *niet* uit de contour overgenomen: de FEM-oplossing hoort bij de
    /// gediscretiseerde veelhoek, dus moeten de traagheden waarmee ze wordt
    /// gecombineerd bij diezelfde veelhoek horen.
    pub fn momenten(&self) -> (f64, f64, f64, f64, f64, f64) {
        let (mut a, mut sy, mut sz) = (0.0, 0.0, 0.0);
        let (mut iyy, mut izz, mut iyz) = (0.0, 0.0, 0.0);
        for t in &self.driehoeken {
            let opp = self.oppervlak_van(*t);
            let p: [[f64; 2]; 3] = [
                self.punten[t[0] as usize],
                self.punten[t[1] as usize],
                self.punten[t[2] as usize],
            ];
            let sy_p: f64 = p.iter().map(|q| q[0]).sum();
            let sz_p: f64 = p.iter().map(|q| q[1]).sum();
            a += opp;
            sz += opp * sy_p / 3.0;
            sy += opp * sz_p / 3.0;
            // ∫f·g dA over een driehoek met lineaire f,g:
            // (A/12)·[(Σf)(Σg) + Σ fᵢgᵢ].
            let kwad = |f: [f64; 3], g: [f64; 3]| {
                let sf = f[0] + f[1] + f[2];
                let sg = g[0] + g[1] + g[2];
                opp / 12.0 * (sf * sg + f[0] * g[0] + f[1] * g[1] + f[2] * g[2])
            };
            let ys = [p[0][0], p[1][0], p[2][0]];
            let zs = [p[0][1], p[1][1], p[2][1]];
            iyy += kwad(zs, zs);
            izz += kwad(ys, ys);
            iyz += kwad(ys, zs);
        }
        (a, sy, sz, iyy, izz, iyz)
    }

    /// Kleinste hoek in de mesh, in graden — maat voor de meshkwaliteit.
    pub fn kleinste_hoek_graden(&self) -> f64 {
        let mut min = 180.0_f64;
        for t in &self.driehoeken {
            let p = [
                self.punten[t[0] as usize],
                self.punten[t[1] as usize],
                self.punten[t[2] as usize],
            ];
            for i in 0..3 {
                let (a, b, c) = (p[i], p[(i + 1) % 3], p[(i + 2) % 3]);
                let u = [b[0] - a[0], b[1] - a[1]];
                let v = [c[0] - a[0], c[1] - a[1]];
                let kruis = (u[0] * v[1] - u[1] * v[0]).abs();
                let punt = u[0] * v[0] + u[1] * v[1];
                let hoek = kruis.atan2(punt).to_degrees();
                min = min.min(hoek);
            }
        }
        min
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Stap 1 — contouren → polylijnen
// ════════════════════════════════════════════════════════════════════════════

struct Poly {
    punten: Vec<[f64; 2]>,
    /// Ondertekend oppervlak: positief tegen de klok in.
    opp: f64,
}

fn discretiseer(seg: &Segment, h: f64, uit: &mut Vec<[f64; 2]>) {
    match *seg {
        Segment::Lijn { van, naar } => {
            let l = (naar.0 - van.0).hypot(naar.1 - van.1);
            let n = ((l / h).ceil() as usize).max(1);
            for k in 0..n {
                let t = k as f64 / n as f64;
                uit.push([van.0 + t * (naar.0 - van.0), van.1 + t * (naar.1 - van.1)]);
            }
        }
        Segment::Boog { centrum, straal, theta1, theta2 } => {
            let dt = theta2 - theta1;
            let n_lengte = ((straal * dt.abs()) / h).ceil() as usize;
            let n_hoek = (dt.abs() / (PI / 8.0)).ceil() as usize;
            let n = n_lengte.max(n_hoek).max(1);
            for k in 0..n {
                let th = theta1 + dt * (k as f64 / n as f64);
                let (s, c) = th.sin_cos();
                uit.push([centrum.0 + straal * c, centrum.1 + straal * s]);
            }
        }
    }
}

fn polylijnen(d: &Doorsnede, h: f64) -> Vec<Poly> {
    let mut uit = Vec::new();
    for c in &d.contouren {
        let mut p = Vec::new();
        for s in &c.segmenten {
            discretiseer(s, h, &mut p);
        }
        // Dubbele opeenvolgende punten weg (kan bij een segment van lengte nul).
        let tol = 1e-9 * h;
        let mut schoon: Vec<[f64; 2]> = Vec::with_capacity(p.len());
        for q in p {
            if schoon.last().map_or(true, |l: &[f64; 2]| (l[0] - q[0]).hypot(l[1] - q[1]) > tol) {
                schoon.push(q);
            }
        }
        while schoon.len() >= 2 {
            let a = schoon[0];
            let b = *schoon.last().unwrap();
            if (a[0] - b[0]).hypot(a[1] - b[1]) <= tol {
                schoon.pop();
            } else {
                break;
            }
        }
        if schoon.len() < 3 {
            continue;
        }
        let mut opp = 0.0;
        for i in 0..schoon.len() {
            let a = schoon[i];
            let b = schoon[(i + 1) % schoon.len()];
            opp += a[0] * b[1] - b[0] * a[1];
        }
        uit.push(Poly { punten: schoon, opp: 0.5 * opp });
    }
    uit
}

// ════════════════════════════════════════════════════════════════════════════
//  Meetkundige hulpjes
// ════════════════════════════════════════════════════════════════════════════

/// Twee keer het oppervlak van driehoek `abc`; positief tegen de klok in.
fn orient2d(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/// `> 0` als `d` binnen de omgeschreven cirkel van de tegen-de-klok-in
/// driehoek `abc` ligt. De uitkomst wordt tegen een relatieve foutgrens
/// gelegd: valt de determinant daarbinnen, dan telt hij als exact nul (vier
/// punten op één cirkel). Dat houdt Bowyer–Watson stabiel bij het regelmatige
/// rooster, waar zulke bijna-ontaarde configuraties massaal voorkomen.
fn in_cirkel(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> f64 {
    let (adx, ady) = (a[0] - d[0], a[1] - d[1]);
    let (bdx, bdy) = (b[0] - d[0], b[1] - d[1]);
    let (cdx, cdy) = (c[0] - d[0], c[1] - d[1]);
    let al = adx * adx + ady * ady;
    let bl = bdx * bdx + bdy * bdy;
    let cl = cdx * cdx + cdy * cdy;
    let d1 = bdx * cdy - cdx * bdy;
    let d2 = adx * cdy - cdx * ady;
    let d3 = adx * bdy - bdx * ady;
    let det = al * d1 - bl * d2 + cl * d3;
    let grens = al * (bdx * cdy).abs()
        + al * (cdx * bdy).abs()
        + bl * (adx * cdy).abs()
        + bl * (cdx * ady).abs()
        + cl * (adx * bdy).abs()
        + cl * (bdx * ady).abs();
    if det.abs() <= 1e-14 * grens {
        0.0
    } else {
        det
    }
}

fn afstand_tot_segment(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let l2 = dx * dx + dy * dy;
    if l2 <= 0.0 {
        return (p[0] - a[0]).hypot(p[1] - a[1]);
    }
    let t = (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2).clamp(0.0, 1.0);
    (p[0] - (a[0] + t * dx)).hypot(p[1] - (a[1] + t * dy))
}

/// Vierkant zoekrooster over de randsegmenten, zodat "hoe ver is dit punt van
/// de rand" niet over alle duizenden segmenten hoeft te lopen.
struct Randrooster {
    cel: f64,
    y0: f64,
    z0: f64,
    nx: usize,
    ny: usize,
    bakken: Vec<Vec<u32>>,
    segmenten: Vec<([f64; 2], [f64; 2])>,
}

impl Randrooster {
    fn nieuw(segmenten: Vec<([f64; 2], [f64; 2])>, cel: f64, bbox: (f64, f64, f64, f64)) -> Self {
        let cel = cel.max(1e-12);
        let (y0b, y1b, z0b, z1b) = bbox;
        let (y0, z0) = (y0b - cel, z0b - cel);
        let nx = (((y1b - y0b) / cel).ceil() as usize + 3).max(1);
        let ny = (((z1b - z0b) / cel).ceil() as usize + 3).max(1);
        let kol = |y: f64| (((y - y0) / cel).floor().max(0.0) as usize).min(nx - 1);
        let rij = |z: f64| (((z - z0) / cel).floor().max(0.0) as usize).min(ny - 1);
        let mut bakken: Vec<Vec<u32>> = vec![Vec::new(); nx * ny];
        for (i, &(a, b)) in segmenten.iter().enumerate() {
            let (imin, imax) = (kol(a[0].min(b[0])), kol(a[0].max(b[0])));
            let (jmin, jmax) = (rij(a[1].min(b[1])), rij(a[1].max(b[1])));
            for j in jmin..=jmax {
                for ii in imin..=imax {
                    bakken[j * nx + ii].push(i as u32);
                }
            }
        }
        Randrooster { cel, y0, z0, nx, ny, bakken, segmenten }
    }

    fn kol(&self, y: f64) -> usize {
        (((y - self.y0) / self.cel).floor().max(0.0) as usize).min(self.nx - 1)
    }
    fn rij(&self, z: f64) -> usize {
        (((z - self.z0) / self.cel).floor().max(0.0) as usize).min(self.ny - 1)
    }

    /// `true` als er een randsegment dichter dan `r` bij `p` ligt.
    fn te_dichtbij(&self, p: [f64; 2], r: f64) -> bool {
        let straal = (r / self.cel).ceil() as isize + 1;
        let (ci, cj) = (self.kol(p[0]) as isize, self.rij(p[1]) as isize);
        for j in (cj - straal).max(0)..=(cj + straal).min(self.ny as isize - 1) {
            for i in (ci - straal).max(0)..=(ci + straal).min(self.nx as isize - 1) {
                for &s in &self.bakken[j as usize * self.nx + i as usize] {
                    let (a, b) = self.segmenten[s as usize];
                    if afstand_tot_segment(p, a, b) < r {
                        return true;
                    }
                }
            }
        }
        false
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Bowyer–Watson
// ════════════════════════════════════════════════════════════════════════════

/// Incrementele Delaunay-driehoeking met superdriehoek.
///
/// Knopen 0, 1 en 2 zijn de hoekpunten van de superdriehoek; alle echte punten
/// staan daarachter. `buur[t][i]` is de driehoek aan de overkant van de zijde
/// tegenover knoop `i` van driehoek `t`, of `-1` als die er niet is.
struct Delaunay {
    p: Vec<[f64; 2]>,
    v: Vec<[u32; 3]>,
    buur: Vec<[i32; 3]>,
    dood: Vec<bool>,
    stempel: Vec<u32>,
    generatie: u32,
    hint: usize,
}

impl Delaunay {
    /// `punten` in genormaliseerde coördinaten, allemaal binnen de eenheidscirkel.
    fn nieuw(punten: &[[f64; 2]]) -> Delaunay {
        let r = 60.0;
        let mut p = vec![
            [r * (PI / 2.0).cos(), r * (PI / 2.0).sin()],
            [r * (7.0 * PI / 6.0).cos(), r * (7.0 * PI / 6.0).sin()],
            [r * (11.0 * PI / 6.0).cos(), r * (11.0 * PI / 6.0).sin()],
        ];
        p.extend_from_slice(punten);
        Delaunay {
            p,
            v: vec![[0, 1, 2]],
            buur: vec![[-1, -1, -1]],
            dood: vec![false],
            stempel: vec![0],
            generatie: 0,
            hint: 0,
        }
    }

    fn nieuw_punt(&mut self, q: [f64; 2]) -> u32 {
        self.p.push(q);
        (self.p.len() - 1) as u32
    }

    /// Zoek de driehoek die `p[idx]` bevat door van buur naar buur te lopen.
    fn lokaliseer(&mut self, idx: u32) -> usize {
        let q = self.p[idx as usize];
        let mut t = self.hint;
        if self.dood[t] {
            t = (0..self.v.len()).find(|&i| !self.dood[i]).unwrap_or(0);
        }
        for stap in 0..(4 * self.v.len() + 64) {
            let mut verder = None;
            // Wisselende startzijde: zo blijft de wandeling niet in een lus hangen.
            let begin = stap % 3;
            for k in 0..3 {
                let i = (begin + k) % 3;
                let a = self.p[self.v[t][(i + 1) % 3] as usize];
                let b = self.p[self.v[t][(i + 2) % 3] as usize];
                if orient2d(a, b, q) < 0.0 && self.buur[t][i] >= 0 {
                    verder = Some(self.buur[t][i] as usize);
                    break;
                }
            }
            match verder {
                Some(n) => t = n,
                None => {
                    self.hint = t;
                    return t;
                }
            }
        }
        // Vangnet: alles aflopen. Komt bij een gezonde driehoeking niet voor.
        for t in 0..self.v.len() {
            if self.dood[t] {
                continue;
            }
            let ok = (0..3).all(|i| {
                let a = self.p[self.v[t][(i + 1) % 3] as usize];
                let b = self.p[self.v[t][(i + 2) % 3] as usize];
                orient2d(a, b, q) >= 0.0
            });
            if ok {
                self.hint = t;
                return t;
            }
        }
        self.hint
    }

    fn omcirkel_bevat(&self, t: usize, q: [f64; 2]) -> bool {
        let a = self.p[self.v[t][0] as usize];
        let b = self.p[self.v[t][1] as usize];
        let c = self.p[self.v[t][2] as usize];
        in_cirkel(a, b, c, q) > 0.0
    }

    fn voeg_in(&mut self, idx: u32) {
        let q = self.p[idx as usize];
        let t0 = self.lokaliseer(idx);
        self.generatie += 1;
        let gen = self.generatie;
        if self.stempel.len() < self.v.len() {
            self.stempel.resize(self.v.len(), 0);
        }

        // ── Holte verzamelen ────────────────────────────────────────────────
        let mut holte = vec![t0];
        self.stempel[t0] = gen;
        let mut stapel = vec![t0];
        while let Some(t) = stapel.pop() {
            for i in 0..3 {
                let nb = self.buur[t][i];
                if nb < 0 {
                    continue;
                }
                let nb = nb as usize;
                if self.stempel[nb] == gen {
                    continue;
                }
                if self.omcirkel_bevat(nb, q) {
                    self.stempel[nb] = gen;
                    holte.push(nb);
                    stapel.push(nb);
                }
            }
        }

        // ── Rand van de holte, met stervormigheidsbewaking ───────────────────
        // Elke randzijde moet met het nieuwe punt een positief georiënteerde
        // driehoek vormen. Zo niet, dan is de holte niet stervormig (kan bij
        // bijna-concyclische punten gebeuren) en wordt de buur alsnog opgeslokt.
        let mut rand: Vec<(u32, u32, i32, usize)> = Vec::new();
        for _ in 0..64 {
            rand.clear();
            let mut fout = Vec::new();
            let mut k = 0;
            while k < holte.len() {
                let t = holte[k];
                for i in 0..3 {
                    let nb = self.buur[t][i];
                    if nb >= 0 && self.stempel[nb as usize] == gen {
                        continue;
                    }
                    let a = self.v[t][(i + 1) % 3];
                    let b = self.v[t][(i + 2) % 3];
                    if orient2d(self.p[a as usize], self.p[b as usize], q) <= 0.0 && nb >= 0 {
                        fout.push(nb as usize);
                        continue;
                    }
                    let terug = if nb >= 0 {
                        (0..3).find(|&j| self.buur[nb as usize][j] == t as i32).unwrap_or(0)
                    } else {
                        0
                    };
                    rand.push((a, b, nb, terug));
                }
                k += 1;
            }
            if fout.is_empty() {
                break;
            }
            for f in fout {
                if self.stempel[f] != gen {
                    self.stempel[f] = gen;
                    holte.push(f);
                }
            }
        }

        // ── Holte opnieuw opvullen ──────────────────────────────────────────
        let mut nieuwe: Vec<usize> = Vec::with_capacity(rand.len());
        for k in 0..rand.len() {
            if k < holte.len() {
                nieuwe.push(holte[k]);
            } else {
                self.v.push([0, 0, 0]);
                self.buur.push([-1, -1, -1]);
                self.dood.push(false);
                self.stempel.push(0);
                nieuwe.push(self.v.len() - 1);
            }
        }
        for k in rand.len()..holte.len() {
            self.dood[holte[k]] = true;
        }

        let mut begint_bij: HashMap<u32, usize> = HashMap::with_capacity(rand.len() * 2);
        let mut eindigt_bij: HashMap<u32, usize> = HashMap::with_capacity(rand.len() * 2);
        for (k, &(a, b, _, _)) in rand.iter().enumerate() {
            begint_bij.insert(a, nieuwe[k]);
            eindigt_bij.insert(b, nieuwe[k]);
        }
        for (k, &(a, b, nb, terug)) in rand.iter().enumerate() {
            let t = nieuwe[k];
            self.v[t] = [idx, a, b];
            self.dood[t] = false;
            self.stempel[t] = 0;
            // buur[0] ligt tegenover `idx`, dus over zijde (a,b): de oude buur.
            // buur[1] ligt tegenover `a`, dus over zijde (b, idx).
            // buur[2] ligt tegenover `b`, dus over zijde (idx, a).
            self.buur[t] = [
                nb,
                begint_bij.get(&b).copied().map_or(-1, |x| x as i32),
                eindigt_bij.get(&a).copied().map_or(-1, |x| x as i32),
            ];
            if nb >= 0 {
                self.buur[nb as usize][terug] = t as i32;
            }
        }
        self.hint = nieuwe.first().copied().unwrap_or(self.hint);
    }

    /// Alle zijden van de levende driehoeken, als gesorteerde knooppaar.
    fn zijden(&self) -> HashSet<(u32, u32)> {
        let mut s = HashSet::with_capacity(self.v.len() * 2);
        for t in 0..self.v.len() {
            if self.dood[t] {
                continue;
            }
            for i in 0..3 {
                let a = self.v[t][(i + 1) % 3];
                let b = self.v[t][(i + 2) % 3];
                s.insert((a.min(b), a.max(b)));
            }
        }
        s
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Meshgeneratie
// ════════════════════════════════════════════════════════════════════════════

/// Bouw een randconforme driehoeksmesh met richtgrootte `h` (mm).
pub fn genereer(d: &Doorsnede, h: f64) -> Mesh2D {
    let h = h.max(1e-9);
    let mut polys = polylijnen(d, h);
    if polys.is_empty() {
        return Mesh2D { h_mm: h, ..Default::default() };
    }
    // Alles met de klok mee ingevoerd? Eén keer omkeren, net als in `contour`.
    let totaal: f64 = polys.iter().map(|p| p.opp).sum();
    if totaal < 0.0 {
        for p in polys.iter_mut() {
            p.punten.reverse();
            p.opp = -p.opp;
        }
    }

    // ── Omhullende + normalisatie ───────────────────────────────────────────
    let (mut y0, mut y1, mut z0, mut z1) =
        (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
    for p in &polys {
        for q in &p.punten {
            y0 = y0.min(q[0]);
            y1 = y1.max(q[0]);
            z0 = z0.min(q[1]);
            z1 = z1.max(q[1]);
        }
    }
    let schaal = (y1 - y0).max(z1 - z0).max(1e-12);
    let mid = [0.5 * (y0 + y1), 0.5 * (z0 + z1)];
    let naar_norm = |q: [f64; 2]| [(q[0] - mid[0]) / schaal, (q[1] - mid[1]) / schaal];
    let naar_echt = |q: [f64; 2]| [q[0] * schaal + mid[0], q[1] * schaal + mid[1]];

    // ── Randknopen ──────────────────────────────────────────────────────────
    let mut punten: Vec<[f64; 2]> = Vec::new();
    let mut lussen: Vec<(Vec<u32>, bool, f64)> = Vec::new();
    let mut randsegmenten: Vec<([f64; 2], [f64; 2])> = Vec::new();
    for p in &polys {
        let start = punten.len() as u32;
        for q in &p.punten {
            punten.push(*q);
        }
        let n = p.punten.len();
        for i in 0..n {
            randsegmenten.push((p.punten[i], p.punten[(i + 1) % n]));
        }
        lussen.push(((start..punten.len() as u32).collect(), p.opp < 0.0, p.opp.abs()));
    }
    let rooster_index = Randrooster::nieuw(randsegmenten, h, (y0, y1, z0, z1));

    // ── Roosterpunten ───────────────────────────────────────────────────────
    let dz = h * (3.0_f64).sqrt() / 2.0;
    let rijen = (((z1 - z0) / dz).ceil() as usize).max(1);
    let mut binnen_punten = Vec::new();
    let mut buiten_punten = Vec::new();
    for r in 0..=rijen {
        let z0_rij = z0 + (r as f64 + 0.5) * dz;
        if z0_rij >= z1 {
            break;
        }
        let intervallen = binnen_intervallen(&polys, z0_rij);
        let verschuiving = if r % 2 == 0 { 0.0 } else { 0.5 * h };
        let kolommen = (((y1 - y0) / h).ceil() as usize).max(1);
        for c in 0..=kolommen {
            let y0_kol = y0 + verschuiving + c as f64 * h;
            if y0_kol >= y1 {
                break;
            }
            // Deterministische verstoring van ±0,06·h. Een zuiver regelmatig
            // rooster levert massaal exact-collineaire drietallen en exact
            // concyclische viertallen op; dan is de Delaunay-driehoeking niet
            // uniek en kunnen de in-cirkel- en oriëntatietoetsen elkaar
            // tegenspreken, met ontaarde driehoeken tot gevolg. Deze verstoring
            // is groot genoeg om zulke gelijkspelen te breken en klein genoeg om
            // de meshkwaliteit onaangetast te laten.
            let sleutel = (r as u32) << 16 ^ c as u32;
            let y = y0_kol + 0.06 * h * ruis(sleutel);
            let z = z0_rij + 0.06 * h * ruis(sleutel ^ 0x5bf0_3635);
            let p = [y, z];
            let binnen = intervallen.iter().any(|&(a, b)| y0_kol > a && y0_kol < b);
            if binnen {
                if !rooster_index.te_dichtbij(p, 0.55 * h) {
                    binnen_punten.push(p);
                }
            } else if r % 3 == 0 && c % 3 == 0 && !rooster_index.te_dichtbij(p, 0.9 * h) {
                // Grof buitenrooster: alleen om concyclische ontaarding in lege
                // gaten en holtes te breken; deze driehoeken vallen straks af.
                buiten_punten.push(p);
            }
        }
    }
    let n_rand = punten.len();
    punten.extend(binnen_punten);
    punten.extend(buiten_punten);

    // ── Delaunay ────────────────────────────────────────────────────────────
    let genorm: Vec<[f64; 2]> = punten.iter().map(|q| naar_norm(*q)).collect();
    let mut dt = Delaunay::nieuw(&genorm);
    // Invoegvolgorde: eerst de randknopen in lusvolgorde, daarna de
    // roosterpunten slangsgewijs over een grof rooster. Beide volgordes zijn
    // ruimtelijk samenhangend, zodat de wandeling in `lokaliseer` telkens maar
    // een paar driehoeken hoeft te doorlopen. De randknopen gáán voorop, want
    // op een recht randstuk liggen ze exact op één lijn: wordt zo'n punt pas
    // ingevoegd nadat zijn twee buren al met een zijde verbonden zijn, dan valt
    // het precies óp die zijde en is de oriëntatietoets ontaard.
    for i in 0..n_rand {
        dt.voeg_in(i as u32 + 3);
    }
    for i in slangvolgorde(&genorm[n_rand..]) {
        dt.voeg_in(i + n_rand as u32 + 3);
    }

    // ── Randherstel ─────────────────────────────────────────────────────────
    for _ronde in 0..24 {
        let zijden = dt.zijden();
        let mut ontbreekt = false;
        for (knopen, _, _) in lussen.iter_mut() {
            let mut nieuw: Vec<u32> = Vec::with_capacity(knopen.len());
            let n = knopen.len();
            for i in 0..n {
                let a = knopen[i];
                let b = knopen[(i + 1) % n];
                nieuw.push(a);
                let sleutel = ((a + 3).min(b + 3), (a + 3).max(b + 3));
                if !zijden.contains(&sleutel) {
                    ontbreekt = true;
                    let (pa, pb) = (genorm_of(&dt, a), genorm_of(&dt, b));
                    let m = [0.5 * (pa[0] + pb[0]), 0.5 * (pa[1] + pb[1])];
                    let idx = dt.nieuw_punt(m);
                    dt.voeg_in(idx);
                    nieuw.push(idx - 3);
                    punten.push(naar_echt(m));
                }
            }
            *knopen = nieuw;
        }
        if !ontbreekt {
            break;
        }
    }

    // ── Binnen/buiten classificeren ─────────────────────────────────────────
    let mut vast: HashSet<(u32, u32)> = HashSet::new();
    for (knopen, _, _) in &lussen {
        let n = knopen.len();
        for i in 0..n {
            let a = knopen[i] + 3;
            let b = knopen[(i + 1) % n] + 3;
            vast.insert((a.min(b), a.max(b)));
        }
    }
    let nt = dt.v.len();
    let mut binnen = vec![false; nt];
    let mut bezocht = vec![false; nt];
    let mut stapel = Vec::new();
    for t in 0..nt {
        if !dt.dood[t] && dt.v[t].iter().any(|&x| x < 3) {
            bezocht[t] = true;
            stapel.push(t);
        }
    }
    while let Some(t) = stapel.pop() {
        for i in 0..3 {
            let nb = dt.buur[t][i];
            if nb < 0 {
                continue;
            }
            let nb = nb as usize;
            if bezocht[nb] || dt.dood[nb] {
                continue;
            }
            let a = dt.v[t][(i + 1) % 3];
            let b = dt.v[t][(i + 2) % 3];
            let kruist = vast.contains(&(a.min(b), a.max(b)));
            binnen[nb] = binnen[t] ^ kruist;
            bezocht[nb] = true;
            stapel.push(nb);
        }
    }

    // ── Uitdunnen en hernummeren ────────────────────────────────────────────
    let mut hernummer = vec![u32::MAX; punten.len()];
    let mut nieuwe_punten: Vec<[f64; 2]> = Vec::new();
    let mut driehoeken: Vec<[u32; 3]> = Vec::new();
    for t in 0..nt {
        if dt.dood[t] || !binnen[t] || dt.v[t].iter().any(|&x| x < 3) {
            continue;
        }
        let mut d3 = [0u32; 3];
        for k in 0..3 {
            let oud = dt.v[t][k] - 3;
            if hernummer[oud as usize] == u32::MAX {
                hernummer[oud as usize] = nieuwe_punten.len() as u32;
                nieuwe_punten.push(punten[oud as usize]);
            }
            d3[k] = hernummer[oud as usize];
        }
        driehoeken.push(d3);
    }

    let lussen: Vec<Randlus> = lussen
        .into_iter()
        .map(|(knopen, gat, opp)| Randlus {
            knopen: knopen
                .into_iter()
                .filter_map(|k| {
                    let n = hernummer[k as usize];
                    if n == u32::MAX {
                        None
                    } else {
                        Some(n)
                    }
                })
                .collect(),
            gat,
            oppervlak_mm2: opp,
        })
        .collect();

    let mut mesh = Mesh2D { punten: nieuwe_punten, driehoeken, lussen, h_mm: h };
    let op_rand: HashSet<u32> = mesh.lussen.iter().flat_map(|l| l.knopen.iter().copied()).collect();
    strijk_glad(&mut mesh, &op_rand, 4);
    mesh
}

fn genorm_of(dt: &Delaunay, extern_idx: u32) -> [f64; 2] {
    dt.p[(extern_idx + 3) as usize]
}

/// De y-intervallen waar de horizontale lijn `z` binnen het materiaal ligt.
///
/// Windingsgetal in plaats van pariteit: gaten lopen met de klok mee, dus hun
/// bijdrage is −1 en ze snijden het interval van de buitenrand netjes weg, ook
/// bij geneste contouren.
fn binnen_intervallen(polys: &[Poly], z: f64) -> Vec<(f64, f64)> {
    let mut kruisingen: Vec<(f64, i32)> = Vec::new();
    for p in polys {
        let n = p.punten.len();
        for i in 0..n {
            let a = p.punten[i];
            let b = p.punten[(i + 1) % n];
            if (a[1] <= z) == (b[1] <= z) {
                continue;
            }
            let t = (z - a[1]) / (b[1] - a[1]);
            let y = a[0] + t * (b[0] - a[0]);
            kruisingen.push((y, if b[1] > a[1] { 1 } else { -1 }));
        }
    }
    kruisingen.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut uit = Vec::new();
    let mut winding = 0;
    let mut begin = 0.0;
    for (y, d) in kruisingen {
        let was_binnen = winding != 0;
        winding += d;
        let is_binnen = winding != 0;
        if !was_binnen && is_binnen {
            begin = y;
        } else if was_binnen && !is_binnen {
            uit.push((begin, y));
        }
    }
    uit
}

/// Deterministische pseudo-toevalsgetal in `[−1, 1]`; geen afhankelijkheid, en
/// twee runs met dezelfde invoer geven bit-voor-bit dezelfde mesh.
fn ruis(sleutel: u32) -> f64 {
    let mut x = sleutel.wrapping_mul(2_654_435_761) ^ 0x9E37_79B9;
    x ^= x >> 13;
    x = x.wrapping_mul(1_274_126_177);
    x ^= x >> 16;
    (x as f64 / u32::MAX as f64) * 2.0 - 1.0
}

/// Slangsgewijze volgorde over een grof rooster; houdt de Delaunay-wandeling kort.
fn slangvolgorde(p: &[[f64; 2]]) -> Vec<u32> {
    let n = p.len();
    if n == 0 {
        return Vec::new();
    }
    let cellen = ((n as f64).sqrt() / 2.0).ceil().max(1.0) as usize;
    let (mut y0, mut y1, mut z0, mut z1) =
        (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
    for q in p {
        y0 = y0.min(q[0]);
        y1 = y1.max(q[0]);
        z0 = z0.min(q[1]);
        z1 = z1.max(q[1]);
    }
    let (by, bz) = ((y1 - y0).max(1e-12), (z1 - z0).max(1e-12));
    let mut sleutels: Vec<(u64, u32)> = (0..n)
        .map(|i| {
            let cx = (((p[i][0] - y0) / by * cellen as f64) as usize).min(cellen - 1);
            let cy = (((p[i][1] - z0) / bz * cellen as f64) as usize).min(cellen - 1);
            let cx = if cy % 2 == 0 { cx } else { cellen - 1 - cx };
            ((cy * cellen + cx) as u64, i as u32)
        })
        .collect();
    sleutels.sort_unstable();
    sleutels.into_iter().map(|(_, i)| i).collect()
}

/// Laplace-gladstrijken van de binnenknopen, met omklap-bewaking.
///
/// Alleen knopen die niet op een rand liggen bewegen, en alleen als *alle*
/// aanliggende driehoeken positief georiënteerd blijven. Zonder die bewaking
/// kan een knoop in een concave hoek buiten het materiaal terechtkomen.
fn strijk_glad(mesh: &mut Mesh2D, op_rand: &HashSet<u32>, sweeps: usize) {
    let n = mesh.punten.len();
    if n == 0 {
        return;
    }
    let mut buren: Vec<Vec<u32>> = vec![Vec::new(); n];
    let mut driehoeken_van: Vec<Vec<u32>> = vec![Vec::new(); n];
    for (ti, t) in mesh.driehoeken.iter().enumerate() {
        for k in 0..3 {
            driehoeken_van[t[k] as usize].push(ti as u32);
            for j in 0..3 {
                if j != k && !buren[t[k] as usize].contains(&t[j]) {
                    buren[t[k] as usize].push(t[j]);
                }
            }
        }
    }
    for _ in 0..sweeps {
        for i in 0..n {
            if op_rand.contains(&(i as u32)) || buren[i].is_empty() {
                continue;
            }
            let mut doel = [0.0, 0.0];
            for &b in &buren[i] {
                doel[0] += mesh.punten[b as usize][0];
                doel[1] += mesh.punten[b as usize][1];
            }
            let k = buren[i].len() as f64;
            doel = [doel[0] / k, doel[1] / k];
            let oud = mesh.punten[i];
            let nieuw = [oud[0] + 0.6 * (doel[0] - oud[0]), oud[1] + 0.6 * (doel[1] - oud[1])];
            mesh.punten[i] = nieuw;
            let ok = driehoeken_van[i].iter().all(|&t| {
                let d = mesh.driehoeken[t as usize];
                mesh.oppervlak_van(d) > 0.0
            });
            if !ok {
                mesh.punten[i] = oud;
            }
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contour::{buis, i_profiel, koker, rechthoek, u_profiel, Contour};

    fn controleer(mesh: &Mesh2D, verwacht_opp: f64, tol: f64, naam: &str) {
        assert!(!mesh.driehoeken.is_empty(), "{naam}: lege mesh");
        for t in &mesh.driehoeken {
            assert!(mesh.oppervlak_van(*t) > 0.0, "{naam}: omgeklapte driehoek");
        }
        let opp = mesh.oppervlak_mm2();
        let fout = (opp - verwacht_opp).abs() / verwacht_opp;
        assert!(
            fout < tol,
            "{naam}: oppervlak {opp} wijkt {:.3}% af van {verwacht_opp}",
            fout * 100.0
        );
    }

    #[test]
    fn rechthoek_mesh_dekt_het_oppervlak() {
        let d = rechthoek(300.0, 120.0);
        let m = genereer(&d, 8.0);
        // Een rechte rand geeft geen discretisatiefout: exact tot op afronding.
        controleer(&m, 300.0 * 120.0, 1e-12, "rechthoek");
        assert_eq!(m.lussen.len(), 1);
        assert!(!m.lussen[0].gat);
    }

    #[test]
    fn cirkel_mesh_nadert_het_oppervlak() {
        let r = 87.5;
        let d = crate::contour::Doorsnede::nieuw().met(Contour::cirkel((0.0, 0.0), r));
        for h in [10.0, 5.0, 2.5] {
            let m = genereer(&d, h);
            // Ingeschreven veelhoek: oppervlak iets kleiner, fout ~ h²/r².
            let fout = (PI * r * r - m.oppervlak_mm2()) / (PI * r * r);
            assert!(fout > 0.0 && fout < 0.02, "h={h}: fout {fout}");
        }
    }

    #[test]
    fn koker_heeft_een_gat() {
        let d = koker(200.0, 100.0, 6.0, 12.0);
        let m = genereer(&d, 1.5);
        let verwacht = d.bereken().a_mm2;
        controleer(&m, verwacht, 0.01, "koker");
        assert_eq!(m.lussen.len(), 2);
        assert!(m.lussen.iter().filter(|l| l.gat).count() == 1);
    }

    #[test]
    fn buis_heeft_een_rond_gat() {
        let d = buis(219.1, 8.0);
        let m = genereer(&d, 2.0);
        controleer(&m, d.bereken().a_mm2, 0.01, "buis");
        assert_eq!(m.lussen.len(), 2);
    }

    #[test]
    fn i_profiel_mesh_is_geldig() {
        let d = i_profiel(200.0, 100.0, 5.6, 8.5, 12.0);
        let m = genereer(&d, 1.2);
        controleer(&m, d.bereken().a_mm2, 0.005, "IPE 200");
        assert!(m.kleinste_hoek_graden() > 8.0, "hoek {}", m.kleinste_hoek_graden());
    }

    #[test]
    fn u_profiel_mesh_is_geldig() {
        let d = u_profiel(200.0, 75.0, 8.5, 11.5, 11.5);
        let m = genereer(&d, 1.5);
        controleer(&m, d.bereken().a_mm2, 0.005, "UNP 200");
    }

    #[test]
    fn traagheden_uit_de_mesh_kloppen_met_de_contour() {
        let d = rechthoek(300.0, 120.0).verschoven(-60.0, -150.0);
        let m = genereer(&d, 10.0);
        let (a, _, _, iyy, izz, iyz) = m.momenten();
        assert!((a - 36000.0).abs() / 36000.0 < 1e-12);
        let iy = 120.0 * 300.0_f64.powi(3) / 12.0;
        let iz = 300.0 * 120.0_f64.powi(3) / 12.0;
        assert!((iyy - iy).abs() / iy < 1e-12, "{iyy} vs {iy}");
        assert!((izz - iz).abs() / iz < 1e-12, "{izz} vs {iz}");
        assert!(iyz.abs() / iy < 1e-12);
    }

    #[test]
    fn verschoven_doorsnede_geeft_dezelfde_mesh() {
        let d = i_profiel(200.0, 100.0, 5.6, 8.5, 12.0);
        let a1 = genereer(&d, 2.0).oppervlak_mm2();
        let a2 = genereer(&d.verschoven(5000.0, -3000.0), 2.0).oppervlak_mm2();
        assert!((a1 - a2).abs() / a1 < 1e-9);
    }
}
