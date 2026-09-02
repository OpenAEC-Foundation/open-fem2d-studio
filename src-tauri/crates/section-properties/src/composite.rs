//! Samengestelde doorsneden: een doorsnede als verzameling **lamellen**
//! (rechthoekige platen) plus optioneel complete **catalogusprofielen** als
//! bouwsteen.
//!
//! De kern is bewust puur meetkundig: er zit geen staalsoort, geen toetsing en
//! geen UI in. Alles wat hier uitkomt is met de hand na te rekenen.
//!
//! ## Assenstelsel
//!
//! `y` naar rechts, `z` omhoog. De invoercoördinaten zijn vrij te kiezen; alle
//! traagheidsmomenten komen terug om de **zwaartepuntsassen**, en `y_c_mm` /
//! `z_c_mm` geven de ligging van het zwaartepunt in het invoerstelsel.
//!
//! ## Formules
//!
//! * `A = Σ A_i`
//! * `y_c = Σ A_i·y_i / Σ A_i`, `z_c = Σ A_i·z_i / Σ A_i`
//! * `Iy = Σ (I_y,i + A_i·(z_i − z_c)²)`
//! * `Iz = Σ (I_z,i + A_i·(y_i − y_c)²)`
//! * `Iyz = Σ (I_yz,i + A_i·(y_i − y_c)·(z_i − z_c))`
//! * hoofdassen: `tan 2α = 2·Iyz / (Iz − Iy)`, `Iu/Iv = (Iy+Iz)/2 ± R/2` met
//!   `R = √((Iy − Iz)² + 4·Iyz²)`
//! * `Wpl = Σ |A_i|·|z_i − z_pna|` met de PNA op de gelijke-oppervlakte-as
//! * `It = ⅓·Σ b_i·t_i³` (open) plus `4·A_m²/∮(ds/t)` (Bredt) per gedeclareerde
//!   gesloten cel
//! * `Iw` via de sectoriële-oppervlaktemethode op de middellijn (dunwandig)
//!
//! De lamel-integralen lopen niet via reeksontwikkelingen maar via exacte
//! polygoonintegralen (Green), zodat een gedraaide plaat net zo exact is als
//! een rechte.

use crate::SectionProperties;

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/// Een rechthoekige lamel (plaat) in het doorsnedevlak.
///
/// `b_mm` is de lengte in de lengterichting van de plaat, `t_mm` de dikte
/// daar loodrecht op. `(y_mm, z_mm)` is het **zwaartepunt** van de plaat.
/// `alpha_rad` is de hoek van de lengterichting ten opzichte van de y-as,
/// positief tegen de klok in; `alpha_rad = 0` betekent een liggende plaat.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Lamella {
    pub b_mm: f64,
    pub t_mm: f64,
    pub y_mm: f64,
    pub z_mm: f64,
    pub alpha_rad: f64,
}

impl Lamella {
    /// Liggende plaat (`α = 0`): `b_mm` langs y, `t_mm` langs z.
    pub fn liggend(b_mm: f64, t_mm: f64, y_mm: f64, z_mm: f64) -> Self {
        Self { b_mm, t_mm, y_mm, z_mm, alpha_rad: 0.0 }
    }

    /// Staande plaat (`α = 90°`): `b_mm` langs z, `t_mm` langs y.
    pub fn staand(b_mm: f64, t_mm: f64, y_mm: f64, z_mm: f64) -> Self {
        Self { b_mm, t_mm, y_mm, z_mm, alpha_rad: std::f64::consts::FRAC_PI_2 }
    }

    /// Plaat onder een vrije hoek.
    pub fn gedraaid(b_mm: f64, t_mm: f64, y_mm: f64, z_mm: f64, alpha_rad: f64) -> Self {
        Self { b_mm, t_mm, y_mm, z_mm, alpha_rad }
    }

    pub fn oppervlak_mm2(&self) -> f64 {
        self.b_mm * self.t_mm
    }

    /// De vier hoekpunten, tegen de klok in.
    pub fn hoekpunten(&self) -> [(f64, f64); 4] {
        let (s, c) = self.alpha_rad.sin_cos();
        // Halve lengte langs de plaatas (u) en halve dikte er loodrecht op (v).
        let hu = self.b_mm / 2.0;
        let hv = self.t_mm / 2.0;
        let p = |u: f64, v: f64| (self.y_mm + u * c - v * s, self.z_mm + u * s + v * c);
        [p(-hu, -hv), p(hu, -hv), p(hu, hv), p(-hu, hv)]
    }

    /// De middellijn van de plaat: de twee uiteinden van de plaatas.
    pub fn middellijn(&self) -> ((f64, f64), (f64, f64)) {
        let (s, c) = self.alpha_rad.sin_cos();
        let hu = self.b_mm / 2.0;
        (
            (self.y_mm - hu * c, self.z_mm - hu * s),
            (self.y_mm + hu * c, self.z_mm + hu * s),
        )
    }
}

/// Een compleet catalogusprofiel als bouwsteen, geplaatst op zijn zwaartepunt.
///
/// `gespiegeld` spiegelt het deel om zijn eigen z-as (`y → −y`); dat is precies
/// wat je nodig hebt om twee U-profielen rug-aan-rug te zetten.
#[derive(Clone, Copy, Debug)]
pub struct CatalogusDeel {
    pub props: SectionProperties,
    /// Positie van het **zwaartepunt** van het deel in het invoerstelsel.
    pub y_mm: f64,
    pub z_mm: f64,
    pub alpha_rad: f64,
    pub gespiegeld: bool,
}

impl CatalogusDeel {
    pub fn nieuw(props: SectionProperties, y_mm: f64, z_mm: f64) -> Self {
        Self { props, y_mm, z_mm, alpha_rad: 0.0, gespiegeld: false }
    }

    /// Spiegelt het deel om zijn eigen z-as (`y → −y`).
    pub fn spiegel(mut self) -> Self {
        self.gespiegeld = !self.gespiegeld;
        self
    }

    pub fn draai(mut self, alpha_rad: f64) -> Self {
        self.alpha_rad = alpha_rad;
        self
    }

    /// Uitersten van het deel ten opzichte van zijn **eigen zwaartepunt**, in
    /// het eigen assenstelsel (vóór spiegelen en draaien).
    fn eigen_uitersten(&self) -> (f64, f64, f64, f64) {
        let p = &self.props;
        // Oudere data kent y_c/z_c niet (velden zijn `default` = 0); dan is de
        // dubbelsymmetrische aanname b/2 resp. h/2 de juiste terugval.
        let yc = if p.y_c_mm > 0.0 { p.y_c_mm } else { p.b_mm / 2.0 };
        let zc = if p.z_c_mm > 0.0 { p.z_c_mm } else { p.h_mm / 2.0 };
        (-yc, p.b_mm - yc, -zc, p.h_mm - zc)
    }
}

/// Een expliciet gedeclareerde gesloten cel voor de Bredt-torsie.
///
/// `midlijn_mm` zijn de hoekpunten van de **wandmiddellijn**, in volgorde; de
/// cel wordt vanzelf gesloten. `dikte_mm[i]` is de wanddikte van de zijde van
/// punt `i` naar punt `i+1`. `lamellen` verwijst naar de indices van de
/// lamellen die de celwanden vormen; die tellen niet mee in de open
/// `⅓·Σ b·t³`-term.
#[derive(Clone, Debug)]
pub struct GeslotenCel {
    pub midlijn_mm: Vec<(f64, f64)>,
    pub dikte_mm: Vec<f64>,
    pub lamellen: Vec<usize>,
}

impl GeslotenCel {
    /// `It = 4·A_m² / ∮(ds/t)` (Bredt, eerste formule van Bredt).
    pub fn it_bredt_mm4(&self) -> f64 {
        let n = self.midlijn_mm.len();
        if n < 3 || self.dikte_mm.len() != n {
            return 0.0;
        }
        let am = polygoon_oppervlak(&self.midlijn_mm).abs();
        let mut omtrek_over_t = 0.0;
        for i in 0..n {
            let (y0, z0) = self.midlijn_mm[i];
            let (y1, z1) = self.midlijn_mm[(i + 1) % n];
            let l = ((y1 - y0).powi(2) + (z1 - z0).powi(2)).sqrt();
            if self.dikte_mm[i] > 0.0 {
                omtrek_over_t += l / self.dikte_mm[i];
            }
        }
        if omtrek_over_t <= 0.0 {
            return 0.0;
        }
        4.0 * am * am / omtrek_over_t
    }
}

// ── De doorsnede ────────────────────────────────────────────────────────────

/// Een samengestelde doorsnede.
#[derive(Clone, Debug)]
pub struct CompositeSection {
    pub lamellen: Vec<Lamella>,
    pub delen: Vec<CatalogusDeel>,
    pub cellen: Vec<GeslotenCel>,
    /// `η` uit EN 1993-1-1 6.2.6(3); 1,2 voor staalsoorten t/m S460.
    pub eta_schuif: f64,
}

impl Default for CompositeSection {
    fn default() -> Self {
        Self { lamellen: Vec::new(), delen: Vec::new(), cellen: Vec::new(), eta_schuif: 1.2 }
    }
}

/// Uitkomst van de berekening, inclusief eerlijke vlaggen over wat wél en niet
/// bepaald kon worden.
#[derive(Clone, Copy, Debug)]
pub struct CompositeResult {
    pub props: SectionProperties,
    /// `true` als `Iw` sectorieel is bepaald (open, samenhangende middellijn en
    /// geen catalogusdelen). Anders is `iw_mm6` nul.
    pub iw_bepaald: bool,
    /// `true` als het schuifmiddelpunt sectorieel is bepaald. Anders valt
    /// `y_s_mm`/`z_s_mm` terug op het zwaartepunt.
    pub schuifmiddelpunt_bepaald: bool,
    /// `true` als `Wpl` uit de lamellen is bepaald. Een catalogusdeel laat zich
    /// niet doorsnijden op de PNA, dus dan is `Wpl` niet bepaald (en nul).
    pub wpl_bepaald: bool,
    /// Uiterste vezels ten opzichte van het **zwaartepunt**.
    pub y_min_mm: f64,
    pub y_max_mm: f64,
    pub z_min_mm: f64,
    pub z_max_mm: f64,
}

impl CompositeSection {
    pub fn nieuw() -> Self {
        Self::default()
    }

    pub fn met_lamel(mut self, l: Lamella) -> Self {
        self.lamellen.push(l);
        self
    }

    pub fn met_lamellen(mut self, l: impl IntoIterator<Item = Lamella>) -> Self {
        self.lamellen.extend(l);
        self
    }

    pub fn met_deel(mut self, d: CatalogusDeel) -> Self {
        self.delen.push(d);
        self
    }

    pub fn met_cel(mut self, c: GeslotenCel) -> Self {
        self.cellen.push(c);
        self
    }

    /// Reken de complete doorsnede door.
    pub fn bereken(&self) -> CompositeResult {
        // ── 1. Oppervlak en zwaartepunt ─────────────────────────────────────
        let mut a_tot = 0.0;
        let mut s_y = 0.0; // Σ A·y
        let mut s_z = 0.0; // Σ A·z
        for l in &self.lamellen {
            let a = l.oppervlak_mm2();
            a_tot += a;
            s_y += a * l.y_mm;
            s_z += a * l.z_mm;
        }
        for d in &self.delen {
            let a = d.props.area_mm2;
            a_tot += a;
            s_y += a * d.y_mm;
            s_z += a * d.z_mm;
        }
        let (y_c, z_c) = if a_tot > 0.0 { (s_y / a_tot, s_z / a_tot) } else { (0.0, 0.0) };

        // ── 2. Traagheidsmomenten om de zwaartepuntsassen ────────────────────
        // De polygoonintegralen worden pas ná verschuiving naar het zwaartepunt
        // uitgevoerd; zo treedt er geen uitdoving op bij een doorsnede die ver
        // van de oorsprong ligt (zie de Steiner-verschuivingstest).
        let mut iy = 0.0;
        let mut iz = 0.0;
        let mut iyz = 0.0;
        let (mut y_min, mut y_max) = (f64::INFINITY, f64::NEG_INFINITY);
        let (mut z_min, mut z_max) = (f64::INFINITY, f64::NEG_INFINITY);

        for l in &self.lamellen {
            let hp: Vec<(f64, f64)> =
                l.hoekpunten().iter().map(|&(y, z)| (y - y_c, z - z_c)).collect();
            let (dyy, dzz, dyz) = polygoon_traagheid_om_oorsprong(&hp);
            iy += dzz;
            iz += dyy;
            iyz += dyz;
            for &(y, z) in &hp {
                y_min = y_min.min(y);
                y_max = y_max.max(y);
                z_min = z_min.min(z);
                z_max = z_max.max(z);
            }
        }
        for d in &self.delen {
            let (piy, piz, piyz) = deel_traagheid(d);
            let dy = d.y_mm - y_c;
            let dz = d.z_mm - z_c;
            let a = d.props.area_mm2;
            iy += piy + a * dz * dz;
            iz += piz + a * dy * dy;
            iyz += piyz + a * dy * dz;
            for (y, z) in deel_hoekpunten(d) {
                y_min = y_min.min(y + dy);
                y_max = y_max.max(y + dy);
                z_min = z_min.min(z + dz);
                z_max = z_max.max(z + dz);
            }
        }
        if !y_min.is_finite() {
            y_min = 0.0;
            y_max = 0.0;
            z_min = 0.0;
            z_max = 0.0;
        }

        // ── 3. Hoofdassen ────────────────────────────────────────────────────
        // Iuv = ½(Iy − Iz)·sin 2α + Iyz·cos 2α = 0  ⇒  tan 2α = 2Iyz/(Iz − Iy).
        // Met 2α = atan2(−2Iyz, Iy − Iz) is Iu de grootste van de twee, en bij
        // Iyz = 0 en Iy > Iz komt er netjes α = 0 uit.
        let r = ((iy - iz).powi(2) + 4.0 * iyz * iyz).sqrt();
        let iu = 0.5 * (iy + iz) + 0.5 * r;
        let iv = 0.5 * (iy + iz) - 0.5 * r;
        let alpha = 0.5 * (-2.0 * iyz).atan2(iy - iz);

        // ── 4. Elastische weerstandsmomenten per vezel ───────────────────────
        let wel_y_top = veilig_delen(iy, z_max);
        let wel_y_bot = veilig_delen(iy, -z_min);
        let wel_z_right = veilig_delen(iz, y_max);
        let wel_z_left = veilig_delen(iz, -y_min);

        // ── 5. Plastische weerstandsmomenten ─────────────────────────────────
        let wpl_bepaald = self.delen.is_empty() && !self.lamellen.is_empty();
        let (wpl_y, wpl_z) = if wpl_bepaald {
            (
                self.wpl_om_as(true, z_min + z_c, z_max + z_c),
                self.wpl_om_as(false, y_min + y_c, y_max + y_c),
            )
        } else {
            (0.0, 0.0)
        };

        // ── 6. Torsie ────────────────────────────────────────────────────────
        let mut in_cel = vec![false; self.lamellen.len()];
        for cel in &self.cellen {
            for &i in &cel.lamellen {
                if i < in_cel.len() {
                    in_cel[i] = true;
                }
            }
        }
        let mut it = 0.0;
        for (i, l) in self.lamellen.iter().enumerate() {
            if !in_cel[i] {
                it += l.b_mm * l.t_mm.powi(3) / 3.0;
            }
        }
        for cel in &self.cellen {
            it += cel.it_bredt_mm4();
        }
        for d in &self.delen {
            it += d.props.it_mm4;
        }

        // ── 7. Afschuifoppervlakken ──────────────────────────────────────────
        // EN 1993-1-1 6.2.6(3)(b): evenwijdig aan het lijf telt η·Σ(hw·tw) mee;
        // (e): evenwijdig aan de flenzen telt A − Σ(hw·tw), dus zónder η. Voor
        // een lamellenmodel is dat het deel van elke plaat dat in de
        // beschouwde richting staat: sin²α respectievelijk cos²α.
        let mut av_z = 0.0;
        let mut av_y = 0.0;
        for l in &self.lamellen {
            let (s, c) = l.alpha_rad.sin_cos();
            let a = l.oppervlak_mm2();
            av_z += self.eta_schuif * a * s * s;
            av_y += a * c * c;
        }
        for d in &self.delen {
            let (s, c) = d.alpha_rad.sin_cos();
            av_z += d.props.av_z_mm2 * c * c + d.props.av_y_mm2 * s * s;
            av_y += d.props.av_y_mm2 * c * c + d.props.av_z_mm2 * s * s;
        }

        // ── 8. Welving en schuifmiddelpunt ───────────────────────────────────
        let mut iw = 0.0;
        let mut y_s = y_c;
        let mut z_s = z_c;
        let mut iw_bepaald = false;
        let mut sm_bepaald = false;
        if self.delen.is_empty() && self.cellen.is_empty() {
            if let Some(m) = self.middellijn_boom() {
                let (w, sy, sz) = welving(&m);
                iw = w;
                y_s = sy;
                z_s = sz;
                iw_bepaald = true;
                sm_bepaald = true;
            }
        }

        let props = SectionProperties {
            area_mm2: a_tot,
            iy_mm4: iy,
            iz_mm4: iz,
            wel_y_mm3: wel_y_top.min(wel_y_bot),
            wel_z_mm3: wel_z_left.min(wel_z_right),
            wpl_y_mm3: wpl_y,
            wpl_z_mm3: wpl_z,
            av_y_mm2: av_y,
            av_z_mm2: av_z,
            it_mm4: it,
            iw_mm6: iw,
            iy_radius_mm: if a_tot > 0.0 { (iy / a_tot).sqrt() } else { 0.0 },
            iz_radius_mm: if a_tot > 0.0 { (iz / a_tot).sqrt() } else { 0.0 },
            h_mm: z_max - z_min,
            b_mm: y_max - y_min,
            tw_mm: 0.0,
            tf_mm: 0.0,
            r_mm: 0.0,
            y_c_mm: y_c,
            z_c_mm: z_c,
            wel_y_top_mm3: wel_y_top,
            wel_y_bot_mm3: wel_y_bot,
            wel_z_left_mm3: wel_z_left,
            wel_z_right_mm3: wel_z_right,
            iyz_mm4: iyz,
            iu_mm4: iu,
            iv_mm4: iv,
            alpha_hoofdas_rad: alpha,
            y_s_mm: y_s,
            z_s_mm: z_s,
        };

        CompositeResult {
            props,
            iw_bepaald,
            schuifmiddelpunt_bepaald: sm_bepaald,
            wpl_bepaald,
            y_min_mm: y_min,
            y_max_mm: y_max,
            z_min_mm: z_min,
            z_max_mm: z_max,
        }
    }

    /// `Wpl` om de y-as (`om_y = true`) of om de z-as, met de plastische
    /// neutrale as op de gelijke-oppervlakte-as.
    ///
    /// `Wpl = ∫|c − c_pna| dA`; de PNA wordt met bisectie gezocht op de
    /// gelijke-oppervlakte-voorwaarde. Omdat `d/dc ∫|c − c_pna| dA` in de PNA
    /// exact nul is, is de fout in `Wpl` tweede orde in de fout van de PNA.
    fn wpl_om_as(&self, om_y: bool, onder: f64, boven: f64) -> f64 {
        let polys: Vec<Vec<(f64, f64)>> =
            self.lamellen.iter().map(|l| l.hoekpunten().to_vec()).collect();
        let a_half: f64 = polys.iter().map(|p| polygoon_oppervlak(p).abs()).sum::<f64>() / 2.0;

        // Oppervlak onder de snijlijn.
        let onder_opp = |c: f64| -> f64 {
            polys
                .iter()
                .map(|p| polygoon_oppervlak(&knip_halfvlak(p, om_y, c, true)).abs())
                .sum()
        };

        let (mut lo, mut hi) = (onder, boven);
        for _ in 0..120 {
            let mid = 0.5 * (lo + hi);
            if onder_opp(mid) < a_half {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        let c_pna = 0.5 * (lo + hi);

        let mut wpl = 0.0;
        for p in &polys {
            for onderkant in [true, false] {
                let deel = knip_halfvlak(p, om_y, c_pna, onderkant);
                let a = polygoon_oppervlak(&deel).abs();
                if a <= 0.0 {
                    continue;
                }
                let (cy, cz) = polygoon_zwaartepunt(&deel);
                let c = if om_y { cz } else { cy };
                wpl += a * (c - c_pna).abs();
            }
        }
        wpl
    }

    /// Bouwt de middellijn van een open doorsnede uit de lamellen en geeft hem
    /// terug als het resultaat een **boom** is (samenhangend, geen lus).
    ///
    /// De uiteinden van een plaat worden op de middellijn van een aangrenzende
    /// plaat geprojecteerd als ze er binnen een halve wanddikte van liggen; dat
    /// is precies het lasnaad-detail van een gelaste I-vorm, waar de
    /// lijfmiddellijn tot in het hart van de flens doorloopt.
    fn middellijn_boom(&self) -> Option<Middellijn> {
        let n = self.lamellen.len();
        if n == 0 {
            return None;
        }
        let mid: Vec<MiddellijnSegment> = self
            .lamellen
            .iter()
            .map(|l| {
                let (a, b) = l.middellijn();
                (a, b, l.t_mm)
            })
            .collect();

        let mut uiteinden: Vec<[(f64, f64); 2]> = mid.iter().map(|&(a, b, _)| [a, b]).collect();
        let mut splits: Vec<Vec<(f64, f64)>> = vec![Vec::new(); n];

        for i in 0..n {
            let oorspronkelijk = [mid[i].0, mid[i].1];
            for j in 0..n {
                if i == j {
                    continue;
                }
                let (a, b, tj) = mid[j];
                let ab = (b.0 - a.0, b.1 - a.1);
                let l2 = ab.0 * ab.0 + ab.1 * ab.1;
                if l2 <= 0.0 {
                    continue;
                }
                let tol = 0.5 * (mid[i].2 + tj) * 1.05 + 1e-9;
                for (k, &e) in oorspronkelijk.iter().enumerate() {
                    let s = (((e.0 - a.0) * ab.0 + (e.1 - a.1) * ab.1) / l2).clamp(0.0, 1.0);
                    let proj = (a.0 + s * ab.0, a.1 + s * ab.1);
                    let d = ((e.0 - proj.0).powi(2) + (e.1 - proj.1).powi(2)).sqrt();
                    if d <= tol {
                        uiteinden[i][k] = proj;
                        if s > 1e-9 && s < 1.0 - 1e-9 {
                            splits[j].push(proj);
                        }
                    }
                }
            }
        }

        // Knopen samenvoegen en randen opbouwen.
        let mut knopen: Vec<(f64, f64)> = Vec::new();
        let schaal = mid
            .iter()
            .map(|&(a, b, _)| (b.0 - a.0).hypot(b.1 - a.1))
            .fold(1.0_f64, f64::max);
        let tol_knoop = 1e-9 * schaal.max(1.0);
        fn knoop_id(p: (f64, f64), knopen: &mut Vec<(f64, f64)>, tol: f64) -> usize {
            for (idx, q) in knopen.iter().enumerate() {
                if (p.0 - q.0).abs() <= tol && (p.1 - q.1).abs() <= tol {
                    return idx;
                }
            }
            knopen.push(p);
            knopen.len() - 1
        }

        let mut randen: Vec<(usize, usize, f64)> = Vec::new();
        for j in 0..n {
            let a = uiteinden[j][0];
            let b = uiteinden[j][1];
            let ab = (b.0 - a.0, b.1 - a.1);
            let l2 = ab.0 * ab.0 + ab.1 * ab.1;
            if l2 <= 0.0 {
                continue;
            }
            let mut punten: Vec<(f64, (f64, f64))> = vec![(0.0, a), (1.0, b)];
            for &p in &splits[j] {
                let s = ((p.0 - a.0) * ab.0 + (p.1 - a.1) * ab.1) / l2;
                if s > 1e-9 && s < 1.0 - 1e-9 {
                    punten.push((s, p));
                }
            }
            punten.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap_or(std::cmp::Ordering::Equal));
            for w in punten.windows(2) {
                let i0 = knoop_id(w[0].1, &mut knopen, tol_knoop);
                let i1 = knoop_id(w[1].1, &mut knopen, tol_knoop);
                if i0 != i1 {
                    randen.push((i0, i1, mid[j].2));
                }
            }
        }

        // Boom? Dan samenhangend én randen = knopen − 1.
        if knopen.is_empty() || randen.len() + 1 != knopen.len() {
            return None;
        }
        let mut gezien = vec![false; knopen.len()];
        let mut stapel = vec![0usize];
        gezien[0] = true;
        let mut aantal = 1;
        while let Some(k) = stapel.pop() {
            for &(a, b, _) in &randen {
                let buur = if a == k { Some(b) } else if b == k { Some(a) } else { None };
                if let Some(m) = buur {
                    if !gezien[m] {
                        gezien[m] = true;
                        aantal += 1;
                        stapel.push(m);
                    }
                }
            }
        }
        if aantal != knopen.len() {
            return None;
        }
        Some(Middellijn { knopen, randen })
    }
}

// ── Middellijn / welving ────────────────────────────────────────────────────

/// Eén stuk middellijn: beginpunt, eindpunt, wanddikte.
type MiddellijnSegment = ((f64, f64), (f64, f64), f64);

struct Middellijn {
    knopen: Vec<(f64, f64)>,
    randen: Vec<(usize, usize, f64)>,
}

/// Sectoriële-oppervlaktemethode: geeft `(Iw, y_s, z_s)`.
///
/// De sectoriële coördinaat volgt uit `dω = r_t·ds`, wat langs een recht
/// segment `A → B` om pool `P` neerkomt op `ω_B − ω_A = (A − P) × (B − A)`.
/// Het schuifmiddelpunt is de pool waarvoor `∫ω·y dA = ∫ω·z dA = 0`; met
/// `ω_P = ω_{P0} + d_y·z − d_z·y + c` en `d = P0 − P` geeft dat het stelsel
/// `S_ωy + d_y·Iyz − d_z·Iz = 0` en `S_ωz + d_y·Iy − d_z·Iyz = 0`.
fn welving(m: &Middellijn) -> (f64, f64, f64) {
    // Alles in het zwaartepunt van het dunwandige middellijnmodel zelf, zodat
    // ∫y dA = ∫z dA = 0 exact geldt.
    let mut a_m = 0.0;
    let mut sy = 0.0;
    let mut sz = 0.0;
    for &(i, j, t) in &m.randen {
        let (a, b) = (m.knopen[i], m.knopen[j]);
        let l = (b.0 - a.0).hypot(b.1 - a.1);
        a_m += l * t;
        sy += l * t * 0.5 * (a.0 + b.0);
        sz += l * t * 0.5 * (a.1 + b.1);
    }
    if a_m <= 0.0 {
        return (0.0, 0.0, 0.0);
    }
    let ym = sy / a_m;
    let zm = sz / a_m;
    let p: Vec<(f64, f64)> = m.knopen.iter().map(|&(y, z)| (y - ym, z - zm)).collect();

    // ω opbouwen met een breedte-eerst-wandeling vanaf knoop 0, pool = (0,0).
    let mut omega = vec![f64::NAN; p.len()];
    omega[0] = 0.0;
    let mut stapel = vec![0usize];
    while let Some(k) = stapel.pop() {
        for &(i, j, _) in &m.randen {
            let (van, naar) = if i == k {
                (i, j)
            } else if j == k {
                (j, i)
            } else {
                continue;
            };
            if omega[naar].is_nan() {
                let a = p[van];
                let b = p[naar];
                // (A − P) × (B − A) met P in de oorsprong.
                omega[naar] = omega[van] + (a.0 * (b.1 - a.1) - a.1 * (b.0 - a.0));
                stapel.push(naar);
            }
        }
    }
    for w in omega.iter_mut() {
        if w.is_nan() {
            *w = 0.0;
        }
    }

    // Integralen over de middellijn. Voor twee lineaire functies f (A→B) en
    // g (C→D) geldt ∫f·g ds = L·(2AC + AD + BC + 2BD)/6.
    let lin2 = |l: f64, t: f64, fa: f64, fb: f64, ga: f64, gb: f64| {
        l * t * (2.0 * fa * ga + fa * gb + fb * ga + 2.0 * fb * gb) / 6.0
    };

    let mut w_gem = 0.0;
    for &(i, j, t) in &m.randen {
        let l = (p[j].0 - p[i].0).hypot(p[j].1 - p[i].1);
        w_gem += l * t * 0.5 * (omega[i] + omega[j]);
    }
    w_gem /= a_m;
    let w0: Vec<f64> = omega.iter().map(|w| w - w_gem).collect();

    let (mut iy_m, mut iz_m, mut iyz_m, mut s_wy, mut s_wz) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for &(i, j, t) in &m.randen {
        let l = (p[j].0 - p[i].0).hypot(p[j].1 - p[i].1);
        iy_m += lin2(l, t, p[i].1, p[j].1, p[i].1, p[j].1);
        iz_m += lin2(l, t, p[i].0, p[j].0, p[i].0, p[j].0);
        iyz_m += lin2(l, t, p[i].0, p[j].0, p[i].1, p[j].1);
        s_wy += lin2(l, t, w0[i], w0[j], p[i].0, p[j].0);
        s_wz += lin2(l, t, w0[i], w0[j], p[i].1, p[j].1);
    }

    let det = iy_m * iz_m - iyz_m * iyz_m;
    let (dy, dz) = if det.abs() > 1e-12 * (iy_m * iz_m).abs().max(1.0) {
        (
            (s_wy * iyz_m - iz_m * s_wz) / det,
            (iy_m * s_wy - iyz_m * s_wz) / det,
        )
    } else {
        (0.0, 0.0)
    };

    // ω om het schuifmiddelpunt, opnieuw genormaliseerd.
    let mut ws: Vec<f64> = w0
        .iter()
        .zip(p.iter())
        .map(|(w, &(y, z))| w + dy * z - dz * y)
        .collect();
    let mut gem = 0.0;
    for &(i, j, t) in &m.randen {
        let l = (p[j].0 - p[i].0).hypot(p[j].1 - p[i].1);
        gem += l * t * 0.5 * (ws[i] + ws[j]);
    }
    gem /= a_m;
    for w in ws.iter_mut() {
        *w -= gem;
    }

    let mut iw = 0.0;
    for &(i, j, t) in &m.randen {
        let l = (p[j].0 - p[i].0).hypot(p[j].1 - p[i].1);
        iw += l * t * (ws[i] * ws[i] + ws[i] * ws[j] + ws[j] * ws[j]) / 3.0;
    }

    // P = P0 − d, terug in het invoerstelsel.
    (iw, ym - dy, zm - dz)
}

// ── Polygoon-hulpfuncties (exacte Green-integralen) ─────────────────────────

/// `A = ½·Σ (y_i·z_{i+1} − y_{i+1}·z_i)`; positief bij tegen-de-klok-in.
pub fn polygoon_oppervlak(p: &[(f64, f64)]) -> f64 {
    if p.len() < 3 {
        return 0.0;
    }
    let mut s = 0.0;
    for i in 0..p.len() {
        let (y0, z0) = p[i];
        let (y1, z1) = p[(i + 1) % p.len()];
        s += y0 * z1 - y1 * z0;
    }
    0.5 * s
}

pub fn polygoon_zwaartepunt(p: &[(f64, f64)]) -> (f64, f64) {
    let a = polygoon_oppervlak(p);
    if a.abs() < 1e-300 {
        return (0.0, 0.0);
    }
    let (mut cy, mut cz) = (0.0, 0.0);
    for i in 0..p.len() {
        let (y0, z0) = p[i];
        let (y1, z1) = p[(i + 1) % p.len()];
        let kruis = y0 * z1 - y1 * z0;
        cy += (y0 + y1) * kruis;
        cz += (z0 + z1) * kruis;
    }
    (cy / (6.0 * a), cz / (6.0 * a))
}

/// Geeft `(∫y² dA, ∫z² dA, ∫y·z dA)` om de **oorsprong** van de meegegeven
/// coördinaten. Altijd positief teruggegeven, ongeacht de omlooprichting.
fn polygoon_traagheid_om_oorsprong(p: &[(f64, f64)]) -> (f64, f64, f64) {
    if p.len() < 3 {
        return (0.0, 0.0, 0.0);
    }
    let (mut iyy, mut izz, mut iyz) = (0.0, 0.0, 0.0);
    for i in 0..p.len() {
        let (y0, z0) = p[i];
        let (y1, z1) = p[(i + 1) % p.len()];
        let kruis = y0 * z1 - y1 * z0;
        iyy += (y0 * y0 + y0 * y1 + y1 * y1) * kruis; // ∫y² dA · 12
        izz += (z0 * z0 + z0 * z1 + z1 * z1) * kruis; // ∫z² dA · 12
        iyz += (y0 * z1 + 2.0 * y0 * z0 + 2.0 * y1 * z1 + y1 * z0) * kruis; // ∫yz dA · 24
    }
    let teken = if polygoon_oppervlak(p) < 0.0 { -1.0 } else { 1.0 };
    (teken * iyy / 12.0, teken * izz / 12.0, teken * iyz / 24.0)
}

/// Knipt een polygoon af op `z = c` (`om_y = true`) of `y = c`.
/// `onderkant = true` houdt het deel met coördinaat ≤ `c` over.
fn knip_halfvlak(p: &[(f64, f64)], om_y: bool, c: f64, onderkant: bool) -> Vec<(f64, f64)> {
    let waarde = |q: &(f64, f64)| if om_y { q.1 } else { q.0 };
    let binnen = |q: &(f64, f64)| if onderkant { waarde(q) <= c } else { waarde(q) >= c };
    let mut uit: Vec<(f64, f64)> = Vec::with_capacity(p.len() + 2);
    for i in 0..p.len() {
        let a = p[i];
        let b = p[(i + 1) % p.len()];
        let (ia, ib) = (binnen(&a), binnen(&b));
        if ia {
            uit.push(a);
        }
        if ia != ib {
            let va = waarde(&a);
            let vb = waarde(&b);
            let t = (c - va) / (vb - va);
            uit.push((a.0 + t * (b.0 - a.0), a.1 + t * (b.1 - a.1)));
        }
    }
    uit
}

fn veilig_delen(teller: f64, noemer: f64) -> f64 {
    if noemer.abs() > 1e-12 {
        teller / noemer
    } else {
        0.0
    }
}

/// Traagheidsmomenten van een catalogusdeel om zijn eigen zwaartepunt, ná
/// spiegelen en draaien.
fn deel_traagheid(d: &CatalogusDeel) -> (f64, f64, f64) {
    let p = &d.props;
    // Spiegelen om de eigen z-as draait het teken van Iyz om.
    let iyz0 = if d.gespiegeld { -p.iyz_mm4 } else { p.iyz_mm4 };
    let (s, c) = d.alpha_rad.sin_cos();
    let iy = s * s * p.iz_mm4 + 2.0 * s * c * iyz0 + c * c * p.iy_mm4;
    let iz = c * c * p.iz_mm4 - 2.0 * s * c * iyz0 + s * s * p.iy_mm4;
    let iyz = s * c * (p.iz_mm4 - p.iy_mm4) + iyz0 * (c * c - s * s);
    (iy, iz, iyz)
}

/// Hoekpunten van de omhullende rechthoek van een catalogusdeel, ten opzichte
/// van zijn eigen zwaartepunt, ná spiegelen en draaien.
fn deel_hoekpunten(d: &CatalogusDeel) -> Vec<(f64, f64)> {
    let (y0, y1, z0, z1) = d.eigen_uitersten();
    let (my0, my1) = if d.gespiegeld { (-y1, -y0) } else { (y0, y1) };
    let (s, c) = d.alpha_rad.sin_cos();
    [(my0, z0), (my1, z0), (my1, z1), (my0, z1)]
        .iter()
        .map(|&(u, v)| (u * c - v * s, u * s + v * c))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
    use std::f64::consts::{FRAC_PI_2, FRAC_PI_4, PI};

    /// Gelaste I uit drie platen: flenzen 200×15, lijf 400×10, h = 430.
    /// Flenszwaartepunt op z = ±(430 − 15)/2 = ±207,5.
    fn gelaste_i() -> CompositeSection {
        CompositeSection::nieuw()
            .met_lamel(Lamella::liggend(200.0, 15.0, 0.0, 207.5))
            .met_lamel(Lamella::liggend(200.0, 15.0, 0.0, -207.5))
            .met_lamel(Lamella::staand(400.0, 10.0, 0.0, 0.0))
    }

    // ── Groep 1: gelaste I uit drie platen ───────────────────────────────────

    #[test]
    fn gelaste_i_uit_drie_platen() {
        let r = gelaste_i().bereken();
        let p = r.props;

        // A = 2·200·15 + 400·10 = 6000 + 4000 = 10 000 mm²
        assert_relative_eq!(p.area_mm2, 10_000.0, max_relative = 1e-3);

        // Iy = 2[200·15³/12 + 200·15·207,5²] + 10·400³/12
        //    = 2[56 250 + 129 168 750] + 53 333 333 = 311 783 333 mm⁴
        assert_relative_eq!(p.iy_mm4, 311_783_333.0, max_relative = 1e-3);

        // Wel;y = Iy/215 = 311 783 333/215 = 1 450 155 mm³ (boven = onder)
        assert_relative_eq!(p.wel_y_top_mm3, 1_450_155.0, max_relative = 1e-3);
        assert_relative_eq!(p.wel_y_bot_mm3, 1_450_155.0, max_relative = 1e-3);

        // Iz = 2·15·200³/12 + 400·10³/12 = 20 000 000 + 33 333 = 20 033 333 mm⁴
        assert_relative_eq!(p.iz_mm4, 20_033_333.0, max_relative = 1e-3);
        // Wel;z = Iz/100 = 200 333 mm³
        assert_relative_eq!(p.wel_z_left_mm3, 200_333.0, max_relative = 1e-3);
        assert_relative_eq!(p.wel_z_right_mm3, 200_333.0, max_relative = 1e-3);

        // Wpl;y = 2·(200·15)·207,5 + 2·(200·10)·100
        //       = 1 245 000 + 400 000 = 1 645 000 mm³
        assert!(r.wpl_bepaald);
        assert_relative_eq!(p.wpl_y_mm3, 1_645_000.0, max_relative = 1e-3);

        // Wpl;z = 4·(100·15)·50 + 2·(400·5)·2,5 = 300 000 + 10 000 = 310 000 mm³
        assert_relative_eq!(p.wpl_z_mm3, 310_000.0, max_relative = 1e-3);

        // It = ⅓(2·200·15³ + 400·10³) = ⅓(1 350 000 + 400 000) = 583 333 mm⁴
        assert_relative_eq!(p.it_mm4, 583_333.0, max_relative = 1e-3);

        // Iw ≈ Iz·(h − tf)²/4 = 20 033 333·415²/4 = 8,626·10¹¹ mm⁶.
        // De sectoriële uitkomst telt alleen de flenzen mee (het lijf ligt op de
        // ω = 0-lijn), dus 20 000 000·415²/4 = 8,611·10¹¹ — dat is de 0,17%
        // waarvoor de plantekst 1% marge geeft.
        assert!(r.iw_bepaald);
        assert_relative_eq!(p.iw_mm6, 8.626e11, max_relative = 0.01);

        // Av;z = η·hw·tw = 1,2·400·10 = 4800 mm²
        assert_relative_eq!(p.av_z_mm2, 4800.0, max_relative = 1e-3);
        // Av;y = A − Σ(hw·tw) = 10 000 − 4000 = 6000 mm² (flenzen, zonder η)
        assert_relative_eq!(p.av_y_mm2, 6000.0, max_relative = 1e-3);

        // Dubbelsymmetrisch: Iyz = 0, hoofdassen vallen samen met y en z.
        assert!(p.iyz_mm4.abs() < 1e-6);
        assert_relative_eq!(p.iu_mm4, p.iy_mm4, max_relative = 1e-12);
        assert_relative_eq!(p.iv_mm4, p.iz_mm4, max_relative = 1e-12);
        assert!(p.alpha_hoofdas_rad.abs() < 1e-12);
        // Schuifmiddelpunt valt samen met het zwaartepunt.
        assert!(p.y_s_mm.abs() < 1e-6);
        assert!(p.z_s_mm.abs() < 1e-6);
    }

    // ── Groep 2: twee U-profielen rug-aan-rug ────────────────────────────────

    /// Geverifieerde catalogusgegevens; opzettelijk hier vastgelegd omdat
    /// `section-properties` niet van de profielendatabase mag afhangen (die
    /// hangt namelijk andersom van deze crate af).
    fn unp(a: f64, iy: f64, iz: f64, h: f64, b: f64, e_y: f64) -> SectionProperties {
        SectionProperties {
            area_mm2: a,
            iy_mm4: iy,
            iz_mm4: iz,
            h_mm: h,
            b_mm: b,
            y_c_mm: e_y,
            z_c_mm: h / 2.0,
            ..Default::default()
        }
    }

    #[test]
    fn twee_unp200_rug_aan_rug() {
        // UNP 200: A = 3220 mm², Iy = 19,10·10⁶, Iz = 1,48·10⁶, e_y = 20,19 mm
        // (e_y = b − Iz/Wel;z = 75 − 1 480 000/27 000 = 20,185 mm).
        let e_y = 20.19;
        let p = unp(3220.0, 19.10e6, 1.48e6, 200.0, 75.0, e_y);
        let d = CompositeSection::nieuw()
            .met_deel(CatalogusDeel::nieuw(p, e_y, 0.0))
            .met_deel(CatalogusDeel::nieuw(p, -e_y, 0.0).spiegel())
            .bereken();

        // A = 2·3220 = 6440 mm²
        assert_relative_eq!(d.props.area_mm2, 6440.0, max_relative = 1e-12);
        // Iy = 2·19,10·10⁶ = 38,20·10⁶ mm⁴ — zuivere optelling, geen Steiner.
        assert_relative_eq!(d.props.iy_mm4, 38.20e6, max_relative = 1e-12);
        // Iz = 2(Iz,UNP + A·e_y²) = 2(1 480 000 + 3220·20,19²)
        //    = 2(1 480 000 + 1 312 617) = 5 585 234 ≈ 5,584·10⁶ mm⁴
        assert_relative_eq!(d.props.iz_mm4, 5.584e6, max_relative = 0.005);
        // Dubbelsymmetrisch door de spiegeling: Iyz = 0 exact.
        assert!(d.props.iyz_mm4.abs() < 1e-9);
    }

    #[test]
    fn twee_unp300_rug_aan_rug() {
        // UNP 300: A = 5880 mm², Iy = 80,3·10⁶, Iz = 4,95·10⁶,
        // e_y = 100 − 4 950 000/67 800 = 26,99 mm.
        let e_y = 27.0;
        let p = unp(5880.0, 80.3e6, 4.95e6, 300.0, 100.0, e_y);
        let d = CompositeSection::nieuw()
            .met_deel(CatalogusDeel::nieuw(p, e_y, 0.0))
            .met_deel(CatalogusDeel::nieuw(p, -e_y, 0.0).spiegel())
            .bereken();

        // Iy = 2·80,3·10⁶ = 160,6·10⁶ mm⁴
        assert_relative_eq!(d.props.iy_mm4, 160.6e6, max_relative = 1e-12);
        // Iz = 2(4 950 000 + 5880·27,0²) = 2(4 950 000 + 4 286 520) = 18,47·10⁶
        assert_relative_eq!(d.props.iz_mm4, 18.47e6, max_relative = 0.005);
        assert!(d.props.iyz_mm4.abs() < 1e-9);
    }

    // ── Groep 3: massieve vormen als degeneratiecontrole ─────────────────────

    #[test]
    fn massieve_rechthoek_degenereert_naar_handformules() {
        let (b, h) = (120.0, 300.0);
        let r = CompositeSection::nieuw()
            .met_lamel(Lamella::liggend(b, h, 0.0, 0.0))
            .bereken();

        // Iy = b·h³/12 = 120·300³/12 = 270 000 000 mm⁴
        assert_relative_eq!(r.props.iy_mm4, b * h.powi(3) / 12.0, max_relative = 1e-12);
        // Iz = h·b³/12 = 300·120³/12 = 43 200 000 mm⁴
        assert_relative_eq!(r.props.iz_mm4, h * b.powi(3) / 12.0, max_relative = 1e-12);
        // Wpl;y = b·h²/4 = 120·300²/4 = 2 700 000 mm³
        assert_relative_eq!(r.props.wpl_y_mm3, b * h * h / 4.0, max_relative = 1e-12);
        // Wpl;z = h·b²/4 = 300·120²/4 = 1 080 000 mm³
        assert_relative_eq!(r.props.wpl_z_mm3, h * b * b / 4.0, max_relative = 1e-12);
        // Wel;y = b·h²/6 = 1 800 000 mm³
        assert_relative_eq!(r.props.wel_y_top_mm3, b * h * h / 6.0, max_relative = 1e-12);
    }

    #[test]
    fn cirkel_als_lamellenstapel_geeft_wpl_is_d3_op_6() {
        // Cirkel d = 100 mm, benaderd met 200 horizontale stroken.
        let d = 100.0;
        let n = 200usize;
        let dz = d / n as f64;
        let mut lamellen = Vec::with_capacity(n);
        for i in 0..n {
            let z = -d / 2.0 + (i as f64 + 0.5) * dz;
            let breedte = 2.0 * ((d / 2.0).powi(2) - z * z).max(0.0).sqrt();
            lamellen.push(Lamella::liggend(breedte, dz, 0.0, z));
        }
        let r = CompositeSection::nieuw().met_lamellen(lamellen).bereken();

        // A → π·d²/4 = 7853,98 mm²
        assert_relative_eq!(r.props.area_mm2, PI * d * d / 4.0, max_relative = 0.01);
        // Wpl = d³/6 = 1 000 000/6 = 166 666,7 mm³
        assert_relative_eq!(r.props.wpl_y_mm3, d.powi(3) / 6.0, max_relative = 0.01);
        // Iy → π·d⁴/64 = 4 908 739 mm⁴
        assert_relative_eq!(r.props.iy_mm4, PI * d.powi(4) / 64.0, max_relative = 0.01);
    }

    // ── Groep 4: hoofdassen-invarianten op een L ─────────────────────────────

    /// Gelijkbenige hoek 100×100×10, gemodelleerd als een staande plaat
    /// 100×10 (y ∈ [0,10]) plus een liggende plaat 90×10 (y ∈ [10,100]).
    fn hoekprofiel_l() -> CompositeSection {
        CompositeSection::nieuw()
            .met_lamel(Lamella::staand(100.0, 10.0, 5.0, 50.0))
            .met_lamel(Lamella::liggend(90.0, 10.0, 55.0, 5.0))
    }

    #[test]
    fn hoofdassen_van_een_l_profiel() {
        let r = hoekprofiel_l().bereken();
        let p = r.props;

        // A = 1000 + 900 = 1900 mm²; y_c = z_c = (1000·5 + 900·55)/1900
        //   = 54 500/1900 = 28,6842 mm.
        assert_relative_eq!(p.area_mm2, 1900.0, max_relative = 1e-12);
        assert_relative_eq!(p.y_c_mm, 545.0 / 19.0, max_relative = 1e-12);
        assert_relative_eq!(p.z_c_mm, 545.0 / 19.0, max_relative = 1e-12);

        // Iy = [10·100³/12 + 1000·(405/19)²] + [90·10³/12 + 900·(450/19)²]
        //    = [833 333 + 454 363] + [7500 + 504 848] = 1 800 044 mm⁴
        assert_relative_eq!(p.iy_mm4, 1_800_043.8, max_relative = 1e-6);
        // Iz = [100·10³/12 + 1000·(450/19)²] + [10·90³/12 + 900·(500/19)²]
        //    = [8333 + 560 942] + [607 500 + 623 269] = 1 800 044 mm⁴
        assert_relative_eq!(p.iz_mm4, 1_800_043.8, max_relative = 1e-6);

        // Iyz = 1000·(−450/19)(405/19) + 900·(500/19)(−450/19)
        //     = −504 848 − 560 942 = −1 065 789 mm⁴ ≠ 0
        assert_relative_eq!(p.iyz_mm4, -1_065_789.5, max_relative = 1e-6);
        assert!(p.iyz_mm4.abs() > 1.0);

        // Invarianten: Iu + Iv = Iy + Iz binnen 1e-10 relatief.
        assert_relative_eq!(p.iu_mm4 + p.iv_mm4, p.iy_mm4 + p.iz_mm4, max_relative = 1e-10);

        // Iuv = ½(Iy − Iz)·sin 2α + Iyz·cos 2α moet nul zijn.
        let a = p.alpha_hoofdas_rad;
        let iuv = 0.5 * (p.iy_mm4 - p.iz_mm4) * (2.0 * a).sin() + p.iyz_mm4 * (2.0 * a).cos();
        assert!(
            iuv.abs() <= 1e-10 * (p.iy_mm4 + p.iz_mm4),
            "Iuv = {iuv} is niet nul"
        );

        // Iu, Iv apart: R = √((Iy − Iz)² + 4Iyz²) = 2|Iyz| = 2 131 579
        //  Iu = 1 800 044 + 1 065 790 = 2 865 833 mm⁴
        //  Iv = 1 800 044 − 1 065 790 =   734 254 mm⁴
        // (Vergelijk de catalogus voor L 100×100×10: Iu = 2,80·10⁶,
        //  Iv = 0,738·10⁶ — de scherpe-hoek-idealisatie zit er netjes naast.)
        assert_relative_eq!(p.iu_mm4, 2_865_833.3, max_relative = 1e-6);
        assert_relative_eq!(p.iv_mm4, 734_254.3, max_relative = 1e-6);

        // Iy = Iz exact voor deze gelijkbenige hoek (825 000 − 600 000 uit de
        // eigen traagheden valt exact weg tegen −225 000 uit de Steiner-termen),
        // dus tan 2α → ∞ en de hoofdassen liggen op ±45°. Dat is precies de
        // limiet van ½·atan(2·Iyz/(Iz − Iy)).
        assert_relative_eq!(p.alpha_hoofdas_rad, FRAC_PI_4, max_relative = 1e-12);
    }

    #[test]
    fn hoofdashoek_reproduceert_de_handformule_bij_ongelijke_benen() {
        // Ongelijkbenige hoek: staand 100×10 plus liggend 50×10, zodat
        // Iz − Iy ≠ 0 en ½·atan(2·Iyz/(Iz − Iy)) gewoon uit te rekenen is.
        let r = CompositeSection::nieuw()
            .met_lamel(Lamella::staand(100.0, 10.0, 5.0, 50.0))
            .met_lamel(Lamella::liggend(50.0, 10.0, 35.0, 5.0))
            .bereken();
        let p = r.props;
        assert!(p.iy_mm4 > p.iz_mm4, "Iy = {} moet groter zijn dan Iz = {}", p.iy_mm4, p.iz_mm4);

        let hand = 0.5 * (2.0 * p.iyz_mm4 / (p.iz_mm4 - p.iy_mm4)).atan();
        assert_relative_eq!(p.alpha_hoofdas_rad, hand, max_relative = 1e-12);
        assert_relative_eq!(p.iu_mm4 + p.iv_mm4, p.iy_mm4 + p.iz_mm4, max_relative = 1e-10);

        let a = p.alpha_hoofdas_rad;
        let iuv = 0.5 * (p.iy_mm4 - p.iz_mm4) * (2.0 * a).sin() + p.iyz_mm4 * (2.0 * a).cos();
        assert!(iuv.abs() <= 1e-10 * (p.iy_mm4 + p.iz_mm4), "Iuv = {iuv}");
    }

    // ── Groep 5: torsie ──────────────────────────────────────────────────────

    #[test]
    fn open_kruis_geeft_derde_som_b_t3() {
        // Drie dunne platen door één punt: 200×8 liggend, 300×6 staand en
        // 150×5 onder 45°.
        let r = CompositeSection::nieuw()
            .met_lamel(Lamella::liggend(200.0, 8.0, 0.0, 0.0))
            .met_lamel(Lamella::staand(300.0, 6.0, 0.0, 0.0))
            .met_lamel(Lamella::gedraaid(150.0, 5.0, 0.0, 0.0, FRAC_PI_4))
            .bereken();

        // It = ⅓(200·8³ + 300·6³ + 150·5³)
        //    = ⅓(102 400 + 64 800 + 18 750) = ⅓·185 950 = 61 983 mm⁴
        let verwacht = (200.0 * 8f64.powi(3) + 300.0 * 6f64.powi(3) + 150.0 * 5f64.powi(3)) / 3.0;
        assert_relative_eq!(r.props.it_mm4, verwacht, max_relative = 1e-12);
        assert_relative_eq!(r.props.it_mm4, 61_983.333_333_333_33, max_relative = 1e-12);
    }

    #[test]
    fn gesloten_koker_reproduceert_bredt() {
        // Koker 200×200×10 uit vier lamellen: flenzen 200×10 op z = ±95,
        // lijven 180×10 op y = ±95. A = 2·2000 + 2·1800 = 7600 mm²,
        // gelijk aan 200² − 180² van de scherpe-hoek-koker.
        let cel = GeslotenCel {
            // Wandmiddellijn: vierkant 190×190.
            midlijn_mm: vec![(-95.0, -95.0), (95.0, -95.0), (95.0, 95.0), (-95.0, 95.0)],
            dikte_mm: vec![10.0; 4],
            lamellen: vec![0, 1, 2, 3],
        };
        let r = CompositeSection::nieuw()
            .met_lamel(Lamella::liggend(200.0, 10.0, 0.0, 95.0))
            .met_lamel(Lamella::liggend(200.0, 10.0, 0.0, -95.0))
            .met_lamel(Lamella::staand(180.0, 10.0, 95.0, 0.0))
            .met_lamel(Lamella::staand(180.0, 10.0, -95.0, 0.0))
            .met_cel(cel)
            .bereken();

        assert_relative_eq!(r.props.area_mm2, 7600.0, max_relative = 1e-12);

        // Bredt: A_m = 190² = 36 100 mm²; ∮ds/t = 4·190/10 = 76
        //        It = 4·36 100²/76 = 68 590 000 mm⁴
        let referentie = crate::rhs::rhs_section_props(200.0, 200.0, 10.0, 0.0).it_mm4;
        assert_relative_eq!(r.props.it_mm4, 68_590_000.0, max_relative = 1e-9);
        assert_relative_eq!(r.props.it_mm4, referentie, max_relative = 0.02);

        // Een gesloten cel krijgt geen sectoriële Iw: dat is eerlijk nul.
        assert!(!r.iw_bepaald);
        assert_eq!(r.props.iw_mm6, 0.0);
    }

    // ── Groep 6: Steiner-verschuiving ────────────────────────────────────────

    #[test]
    fn verschuiving_van_1000_mm_laat_iy_ongemoeid() {
        let origineel = gelaste_i();
        let basis = origineel.bereken().props;
        let verschoven = CompositeSection {
            lamellen: origineel
                .lamellen
                .iter()
                .map(|l| Lamella { y_mm: l.y_mm + 1000.0, z_mm: l.z_mm + 1000.0, ..*l })
                .collect(),
            ..Default::default()
        }
        .bereken()
        .props;

        assert_relative_eq!(verschoven.iy_mm4, basis.iy_mm4, max_relative = 1e-10);
        assert_relative_eq!(verschoven.iz_mm4, basis.iz_mm4, max_relative = 1e-10);
        assert_relative_eq!(verschoven.wpl_y_mm3, basis.wpl_y_mm3, max_relative = 1e-10);
        // Het zwaartepunt schuift wél gewoon mee.
        assert_relative_eq!(verschoven.y_c_mm, basis.y_c_mm + 1000.0, max_relative = 1e-12);
        assert_relative_eq!(verschoven.z_c_mm, basis.z_c_mm + 1000.0, max_relative = 1e-12);
    }

    // ── Aanvullend: gedraaide lamel en asymmetrische vezels ──────────────────

    #[test]
    fn gedraaide_lamel_is_consistent_met_de_rechte() {
        // Dezelfde plaat 90° gedraaid moet Iy en Iz verwisselen.
        let recht = CompositeSection::nieuw()
            .met_lamel(Lamella::liggend(150.0, 12.0, 0.0, 0.0))
            .bereken()
            .props;
        let gedraaid = CompositeSection::nieuw()
            .met_lamel(Lamella::gedraaid(150.0, 12.0, 0.0, 0.0, FRAC_PI_2))
            .bereken()
            .props;
        assert_relative_eq!(gedraaid.iy_mm4, recht.iz_mm4, max_relative = 1e-10);
        assert_relative_eq!(gedraaid.iz_mm4, recht.iy_mm4, max_relative = 1e-10);
    }

    #[test]
    fn t_profiel_heeft_verschillende_vezels_boven_en_onder() {
        // T uit een flens 200×20 boven een lijf 180×10.
        let r = CompositeSection::nieuw()
            .met_lamel(Lamella::liggend(200.0, 20.0, 0.0, 190.0))
            .met_lamel(Lamella::staand(180.0, 10.0, 0.0, 90.0))
            .bereken();
        assert!(r.props.wel_y_top_mm3 > r.props.wel_y_bot_mm3);
        assert_relative_eq!(
            r.props.wel_z_left_mm3,
            r.props.wel_z_right_mm3,
            max_relative = 1e-12
        );
        // Wel;y (het maatgevende) is de kleinste van de twee.
        assert_relative_eq!(
            r.props.wel_y_mm3,
            r.props.wel_y_bot_mm3.min(r.props.wel_y_top_mm3),
            max_relative = 1e-12
        );
    }
}
