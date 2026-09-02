//! Exacte doorsnedegrootheden uit **gesloten contouren**.
//!
//! Een doorsnede is hier niets anders dan één of meer gesloten randen: een
//! buitenrand tegen de klok in, elk gat met de klok mee. Elk randsegment is óf
//! een rechte lijn óf een **cirkelboog** — die laatste is onmisbaar voor
//! walsuitrondingen, kokerhoeken en buizen.
//!
//! Alles wordt met de **stelling van Green** langs die rand geïntegreerd, met
//! per segmenttype een *gesloten* formule. Er wordt dus niets gediscretiseerd:
//! de uitkomst is exact tot machineprecisie, ongeacht hoe grof of fijn je de
//! contour beschrijft.
//!
//! ## Assenstelsel
//!
//! `y` naar rechts, `z` omhoog. `Iy = ∫ z² dA` (buiging om de horizontale as),
//! `Iz = ∫ y² dA`. Een rand die tegen de klok in loopt telt positief mee, een
//! rand met de klok mee negatief — daarmee is een gat gewoon een omgekeerd
//! doorlopen contour en hoeft er nergens een tekenadministratie bij.
//!
//! ## De Green-vormen
//!
//! Green: `∮(P dy + Q dz) = ∬(∂Q/∂y − ∂P/∂z) dA` over een tegen-de-klok-in
//! doorlopen rand. Daaruit volgen de zes vormen die we nodig hebben:
//!
//! | grootheid            | randintegraal        | keuze P, Q      |
//! |----------------------|----------------------|-----------------|
//! | `A  = ∬ dA`          | `−∮ z dy`            | `P = −z`        |
//! | `Sy = ∬ z dA`        | `−½∮ z² dy`          | `P = −½z²`      |
//! | `Sz = ∬ y dA`        | `½∮ y² dz`           | `Q = ½y²`       |
//! | `Iy = ∬ z² dA`       | `−⅓∮ z³ dy`          | `P = −⅓z³`      |
//! | `Iz = ∬ y² dA`       | `⅓∮ y³ dz`           | `Q = ⅓y³`       |
//! | `Iyz = ∬ y z dA`     | `½∮ y² z dz`         | `Q = ½y²z`      |
//!
//! Algemener geldt voor elke functie van alleen `z`: `∬ h(z) dA = −∮ H(z) dy`
//! met `H' = h`. Precies die vorm gebruiken we voor het plastisch
//! weerstandsmoment, met `h(z) = max(z − c, 0)^n` — zo hoeft de contour nooit
//! op de neutrale lijn *geknipt* te worden.
//!
//! ## De boogafleiding
//!
//! Een boog met middelpunt `(yc, zc)`, straal `r`, van hoek `θ₁` tot `θ₂`:
//!
//! ```text
//! y(θ) = yc + r·cos θ      dy = −r·sin θ dθ
//! z(θ) = zc + r·sin θ      dz =  r·cos θ dθ
//! ```
//!
//! `θ₂ > θ₁` betekent tegen de klok in, `θ₂ < θ₁` met de klok mee; het teken
//! komt vanzelf goed doordat we van `θ₁` naar `θ₂` integreren.
//!
//! Invullen levert per grootheid een integraal over machten van `sin` en `cos`,
//! en die hebben alle een elementaire primitieve. Bijvoorbeeld het oppervlak:
//!
//! ```text
//! A = −∮ z dy = −∫ (zc + r sin θ)·(−r sin θ) dθ
//!             =  ∫ (zc·r·sin θ + r²·sin²θ) dθ
//!             = [ −zc·r·cos θ + r²·(θ/2 − sin 2θ/4) ]
//! ```
//!
//! Controle: een volle cirkel om de oorsprong (`zc = 0`, `θ: 0 → 2π`) geeft
//! `r²·π` — inderdaad `πr²`.
//!
//! Dezelfde weg voor de rest, met de primitieven
//!
//! ```text
//! ∫ sin θ  = −cos θ                  ∫ cos θ  = sin θ
//! ∫ sin²θ  = θ/2 − sin 2θ/4          ∫ cos²θ  = θ/2 + sin 2θ/4
//! ∫ sin³θ  = −cos θ + cos³θ/3        ∫ cos³θ  = sin θ − sin³θ/3
//! ∫ sin⁴θ  = 3θ/8 − sin 2θ/4 + sin 4θ/32
//! ∫ cos⁴θ  = 3θ/8 + sin 2θ/4 + sin 4θ/32
//! ∫ sin θ cos θ = sin²θ/2            ∫ sin θ cos²θ = −cos³θ/3
//! ∫ sin θ cos³θ = −cos⁴θ/4
//! ```
//!
//! geeft:
//!
//! ```text
//! Sy = −½∮ z² dy = ½·r·[ −zc²·cos θ + 2·zc·r·(θ/2 − sin2θ/4)
//!                        + r²·(−cos θ + cos³θ/3) ]
//! Sz =  ½∮ y² dz = ½·r·[  yc²·sin θ + 2·yc·r·(θ/2 + sin2θ/4)
//!                        + r²·( sin θ − sin³θ/3) ]
//! Iy = −⅓∮ z³ dy = ⅓·r·[ −zc³·cos θ + 3·zc²·r·(θ/2 − sin2θ/4)
//!                        + 3·zc·r²·(−cos θ + cos³θ/3)
//!                        + r³·(3θ/8 − sin2θ/4 + sin4θ/32) ]
//! Iz =  ⅓∮ y³ dz = ⅓·r·[  yc³·sin θ + 3·yc²·r·(θ/2 + sin2θ/4)
//!                        + 3·yc·r²·( sin θ − sin³θ/3)
//!                        + r³·(3θ/8 + sin2θ/4 + sin4θ/32) ]
//! Iyz = ½∮ y² z dz = ½·r·[ yc²·zc·sin θ + yc²·r·sin²θ/2
//!                        + 2·yc·zc·r·(θ/2 + sin2θ/4)
//!                        − 2·yc·r²·cos³θ/3
//!                        + zc·r²·(sin θ − sin³θ/3)
//!                        − r³·cos⁴θ/4 ]
//! ```
//!
//! Controles die je met de hand kunt narekenen: een volle cirkel om de
//! oorsprong geeft `Iy = Iz = ⅓·r·r³·(3/8)·2π = πr⁴/4` en `Iyz = 0`; een volle
//! cirkel om `(yc, zc)` geeft `Iyz = ½·r·2·yc·zc·r·π = πr²·yc·zc`, precies de
//! Steiner-term die je verwacht omdat een cirkel om zijn eigen zwaartepunt
//! geen traagheidsproduct heeft.
//!
//! ## Wat hier bewust *niet* zit
//!
//! De torsieconstante `It` en de welvingsconstante `Iw` volgen niet uit de
//! contour alleen — daarvoor moet een randwaardeprobleem over het inwendige
//! worden opgelost. Die blijven dus buiten deze module.

use std::f64::consts::{FRAC_PI_2, PI, TAU};

// ════════════════════════════════════════════════════════════════════════════
//  Segmenten
// ════════════════════════════════════════════════════════════════════════════

/// Eén randsegment: een rechte lijn of een cirkelboog.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Segment {
    /// Rechte lijn van `van` naar `naar`.
    Lijn { van: (f64, f64), naar: (f64, f64) },
    /// Cirkelboog om `centrum` met straal `straal`, van hoek `theta1` tot
    /// `theta2` (rad). `theta2 > theta1` = tegen de klok in.
    Boog { centrum: (f64, f64), straal: f64, theta1: f64, theta2: f64 },
}

impl Segment {
    pub fn beginpunt(&self) -> (f64, f64) {
        match *self {
            Segment::Lijn { van, .. } => van,
            Segment::Boog { centrum, straal, theta1, .. } => punt_op_boog(centrum, straal, theta1),
        }
    }

    pub fn eindpunt(&self) -> (f64, f64) {
        match *self {
            Segment::Lijn { naar, .. } => naar,
            Segment::Boog { centrum, straal, theta2, .. } => punt_op_boog(centrum, straal, theta2),
        }
    }

    /// Verschuif het segment over `(dy, dz)`.
    pub fn verschoven(&self, dy: f64, dz: f64) -> Segment {
        match *self {
            Segment::Lijn { van, naar } => Segment::Lijn {
                van: (van.0 + dy, van.1 + dz),
                naar: (naar.0 + dy, naar.1 + dz),
            },
            Segment::Boog { centrum, straal, theta1, theta2 } => Segment::Boog {
                centrum: (centrum.0 + dy, centrum.1 + dz),
                straal,
                theta1,
                theta2,
            },
        }
    }

    /// Draai het segment over `hoek` (rad, tegen de klok in) om de oorsprong.
    ///
    /// Voor een boog is dat gratis: het middelpunt draait mee en beide
    /// hoekgrenzen schuiven met `hoek` op — de straal verandert niet.
    pub fn gedraaid(&self, hoek: f64) -> Segment {
        let (s, c) = hoek.sin_cos();
        let d = |p: (f64, f64)| (p.0 * c - p.1 * s, p.0 * s + p.1 * c);
        match *self {
            Segment::Lijn { van, naar } => Segment::Lijn { van: d(van), naar: d(naar) },
            Segment::Boog { centrum, straal, theta1, theta2 } => Segment::Boog {
                centrum: d(centrum),
                straal,
                theta1: theta1 + hoek,
                theta2: theta2 + hoek,
            },
        }
    }

    /// Doorlooprichting omkeren (buitenrand ↔ gat).
    pub fn omgekeerd(&self) -> Segment {
        match *self {
            Segment::Lijn { van, naar } => Segment::Lijn { van: naar, naar: van },
            Segment::Boog { centrum, straal, theta1, theta2 } => {
                Segment::Boog { centrum, straal, theta1: theta2, theta2: theta1 }
            }
        }
    }

    /// De zes Green-bijdragen van dit segment, om de **oorsprong**.
    fn momenten(&self) -> Momenten {
        match *self {
            Segment::Lijn { van, naar } => momenten_lijn(van, naar),
            Segment::Boog { centrum, straal, theta1, theta2 } => {
                momenten_boog(centrum, straal, theta1, theta2)
            }
        }
    }

    /// Bijdrage aan `(A⁺, Q⁺)` van het deel van de doorsnede boven `z = snij`,
    /// met `Q⁺ = ∬_{z>snij} (z − snij) dA`.
    fn boven(&self, snij: f64) -> (f64, f64) {
        match *self {
            Segment::Lijn { van, naar } => boven_lijn(van, naar, snij),
            Segment::Boog { centrum, straal, theta1, theta2 } => {
                boven_boog(centrum, straal, theta1, theta2, snij)
            }
        }
    }

    /// Omhullende rechthoek `(y_min, y_max, z_min, z_max)` van dit segment.
    fn uitersten(&self) -> (f64, f64, f64, f64) {
        match *self {
            Segment::Lijn { van, naar } => (
                van.0.min(naar.0),
                van.0.max(naar.0),
                van.1.min(naar.1),
                van.1.max(naar.1),
            ),
            Segment::Boog { centrum, straal, theta1, theta2 } => {
                uitersten_boog(centrum, straal, theta1, theta2)
            }
        }
    }
}

fn punt_op_boog(centrum: (f64, f64), straal: f64, theta: f64) -> (f64, f64) {
    let (s, c) = theta.sin_cos();
    (centrum.0 + straal * c, centrum.1 + straal * s)
}

/// De zes randintegralen om de oorsprong.
#[derive(Clone, Copy, Debug, Default)]
struct Momenten {
    a: f64,
    sy: f64,
    sz: f64,
    iy: f64,
    iz: f64,
    iyz: f64,
}

impl Momenten {
    fn tel_op(&mut self, m: Momenten) {
        self.a += m.a;
        self.sy += m.sy;
        self.sz += m.sz;
        self.iy += m.iy;
        self.iz += m.iz;
        self.iyz += m.iyz;
    }
}

// ── Rechte lijn ─────────────────────────────────────────────────────────────

/// Gesloten formules voor een recht segment.
///
/// Parametrisatie `y(t) = y₁ + t·a`, `z(t) = z₁ + t·b` met `a = y₂ − y₁`,
/// `b = z₂ − z₁` en `t ∈ [0,1]`; dan is `dy = a dt` en `dz = b dt`. Elke
/// Green-integrand wordt daarmee een polynoom in `t` dat exact te integreren
/// is. Bijvoorbeeld `A = −∮ z dy = −a·∫₀¹(z₁ + t·b) dt = −a·(z₁ + b/2)`, wat
/// over een gesloten polygoon precies de bekende schoenveterformule oplevert.
fn momenten_lijn(p1: (f64, f64), p2: (f64, f64)) -> Momenten {
    let (y1, z1) = p1;
    let (y2, z2) = p2;
    let a = y2 - y1;
    let b = z2 - z1;

    Momenten {
        // A = −a·∫(z₁ + tb) dt
        a: -a * (z1 + b / 2.0),
        // Sy = −½·a·∫(z₁ + tb)² dt
        sy: -0.5 * a * (z1 * z1 + z1 * b + b * b / 3.0),
        // Sz = ½·b·∫(y₁ + ta)² dt
        sz: 0.5 * b * (y1 * y1 + y1 * a + a * a / 3.0),
        // Iy = −⅓·a·∫(z₁ + tb)³ dt
        iy: -(1.0 / 3.0)
            * a
            * (z1 * z1 * z1 + 1.5 * z1 * z1 * b + z1 * b * b + b * b * b / 4.0),
        // Iz = ⅓·b·∫(y₁ + ta)³ dt
        iz: (1.0 / 3.0)
            * b
            * (y1 * y1 * y1 + 1.5 * y1 * y1 * a + y1 * a * a + a * a * a / 4.0),
        // Iyz = ½·b·∫(y₁ + ta)²·(z₁ + tb) dt, met de haakjes uitgeschreven:
        //   t⁰: y₁²z₁ · 1
        //   t¹: (y₁²b + 2y₁az₁) · ½
        //   t²: (2y₁ab + a²z₁) · ⅓
        //   t³: a²b · ¼
        iyz: 0.5
            * b
            * (y1 * y1 * z1
                + (y1 * y1 * b + 2.0 * y1 * a * z1) / 2.0
                + (2.0 * y1 * a * b + a * a * z1) / 3.0
                + a * a * b / 4.0),
    }
}

// ── Cirkelboog ──────────────────────────────────────────────────────────────

/// Gesloten formules voor een boogsegment; zie de moduledocumentatie voor de
/// volledige afleiding. Elke grootheid is hier een primitieve `F(θ)` die op
/// `θ₂` en `θ₁` wordt afgelezen.
fn momenten_boog(centrum: (f64, f64), r: f64, t1: f64, t2: f64) -> Momenten {
    if r == 0.0 {
        return Momenten::default();
    }
    let (yc, zc) = centrum;

    // Hulpprimitieven van de machten van sinus en cosinus.
    let sin2 = |t: f64| t / 2.0 - (2.0 * t).sin() / 4.0; // ∫sin²
    let cos2 = |t: f64| t / 2.0 + (2.0 * t).sin() / 4.0; // ∫cos²
    let sin3 = |t: f64| -t.cos() + t.cos().powi(3) / 3.0; // ∫sin³
    let cos3 = |t: f64| t.sin() - t.sin().powi(3) / 3.0; // ∫cos³
    let sin4 = |t: f64| 3.0 * t / 8.0 - (2.0 * t).sin() / 4.0 + (4.0 * t).sin() / 32.0;
    let cos4 = |t: f64| 3.0 * t / 8.0 + (2.0 * t).sin() / 4.0 + (4.0 * t).sin() / 32.0;

    let f_a = |t: f64| -zc * r * t.cos() + r * r * sin2(t);
    let f_sy = |t: f64| 0.5 * r * (-zc * zc * t.cos() + 2.0 * zc * r * sin2(t) + r * r * sin3(t));
    let f_sz = |t: f64| 0.5 * r * (yc * yc * t.sin() + 2.0 * yc * r * cos2(t) + r * r * cos3(t));
    let f_iy = |t: f64| {
        (1.0 / 3.0)
            * r
            * (-zc.powi(3) * t.cos()
                + 3.0 * zc * zc * r * sin2(t)
                + 3.0 * zc * r * r * sin3(t)
                + r.powi(3) * sin4(t))
    };
    let f_iz = |t: f64| {
        (1.0 / 3.0)
            * r
            * (yc.powi(3) * t.sin()
                + 3.0 * yc * yc * r * cos2(t)
                + 3.0 * yc * r * r * cos3(t)
                + r.powi(3) * cos4(t))
    };
    let f_iyz = |t: f64| {
        let (s, c) = t.sin_cos();
        0.5 * r
            * (yc * yc * zc * s
                + yc * yc * r * (s * s / 2.0)
                + 2.0 * yc * zc * r * cos2(t)
                - 2.0 * yc * r * r * c.powi(3) / 3.0
                + zc * r * r * cos3(t)
                - r.powi(3) * c.powi(4) / 4.0)
    };

    Momenten {
        a: f_a(t2) - f_a(t1),
        sy: f_sy(t2) - f_sy(t1),
        sz: f_sz(t2) - f_sz(t1),
        iy: f_iy(t2) - f_iy(t1),
        iz: f_iz(t2) - f_iz(t1),
        iyz: f_iyz(t2) - f_iyz(t1),
    }
}

/// Omhullende rechthoek van een boog: de eindpunten plus elk kardinaal punt
/// (`θ = n·π/2`) dat binnen het hoekbereik valt.
fn uitersten_boog(centrum: (f64, f64), r: f64, t1: f64, t2: f64) -> (f64, f64, f64, f64) {
    let (lo, hi) = if t1 <= t2 { (t1, t2) } else { (t2, t1) };
    let mut u = (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
    let mut voeg_toe = |p: (f64, f64)| {
        u.0 = u.0.min(p.0);
        u.1 = u.1.max(p.0);
        u.2 = u.2.min(p.1);
        u.3 = u.3.max(p.1);
    };
    voeg_toe(punt_op_boog(centrum, r, lo));
    voeg_toe(punt_op_boog(centrum, r, hi));

    let n0 = (lo / FRAC_PI_2).floor() as i64;
    let n1 = (hi / FRAC_PI_2).ceil() as i64;
    // Bogen komen altijd uit de bouwer en spannen hooguit 2π; de lus blijft
    // daarmee kort. De begrenzing is puur een vangnet tegen onzinnige invoer.
    for n in n0..=n1.min(n0 + 8) {
        let t = n as f64 * FRAC_PI_2;
        if t >= lo && t <= hi {
            voeg_toe(punt_op_boog(centrum, r, t));
        }
    }
    u
}

// ── Deel boven een snijlijn (voor Wpl) ──────────────────────────────────────

/// Bijdrage van een recht segment aan `A⁺ = ∬_{z>c} dA` en
/// `Q⁺ = ∬_{z>c}(z − c) dA`.
///
/// Beide volgen uit `∬ h(z) dA = −∮ H(z) dy` met `h(z) = max(z − c, 0)^n`.
/// Langs een recht segment is `w(t) = z(t) − c` lineair, dus is er hooguit één
/// nulpunt; we knippen het parameterinterval daarop en integreren de rest
/// exact. De integralen zijn bewust in de *stabiele* vorm geschreven
/// (verschil van de eindwaarden, niet delen door `b`), zodat een bijna
/// horizontaal segment geen uitdoving geeft.
fn boven_lijn(p1: (f64, f64), p2: (f64, f64), snij: f64) -> (f64, f64) {
    let (y1, z1) = p1;
    let (y2, z2) = p2;
    let a = y2 - y1;
    if a == 0.0 {
        return (0.0, 0.0); // dy = 0 ⇒ geen bijdrage
    }
    let b = z2 - z1;
    let w0 = z1 - snij;

    let (t0, t1) = if b == 0.0 {
        if w0 > 0.0 {
            (0.0, 1.0)
        } else {
            return (0.0, 0.0);
        }
    } else {
        let ts = -w0 / b; // w(ts) = 0
        if b > 0.0 {
            (ts.max(0.0), 1.0)
        } else {
            (0.0, ts.min(1.0))
        }
    };
    if t1 <= t0 {
        return (0.0, 0.0);
    }

    let wa = w0 + t0 * b;
    let wb = w0 + t1 * b;
    let dt = t1 - t0;
    let i1 = dt * (wa + wb) / 2.0; // ∫ w  dt
    let i2 = dt * (wa * wa + wa * wb + wb * wb) / 3.0; // ∫ w² dt
    (-a * i1, -0.5 * a * i2)
}

/// De deelintervallen van `[lo, hi]` waar `sin θ > k`.
///
/// `sin θ > k` geldt op `(φ + 2πn, π − φ + 2πn)` met `φ = asin k`.
fn sin_boven_intervallen(lo: f64, hi: f64, k: f64) -> Vec<(f64, f64)> {
    // NaN (een ontaarde boog met straal nul) telt als "geen bijdrage".
    if k.is_nan() || k >= 1.0 {
        return Vec::new();
    }
    if k <= -1.0 {
        return vec![(lo, hi)];
    }
    let phi = k.asin();
    let n_start = ((lo - (PI - phi)) / TAU).floor() as i64 - 1;
    let n_eind = ((hi - phi) / TAU).ceil() as i64 + 1;
    let mut uit = Vec::new();
    for n in n_start..=n_eind.min(n_start + 8) {
        let a = (phi + TAU * n as f64).max(lo);
        let b = (PI - phi + TAU * n as f64).min(hi);
        if b > a {
            uit.push((a, b));
        }
    }
    uit
}

/// Bijdrage van een boogsegment aan `(A⁺, Q⁺)`.
///
/// Met `d = zc − c` en `z − c = d + r sin θ` en `dy = −r sin θ dθ`:
///
/// ```text
/// A⁺ = −∮ max(z−c,0) dy   = ∫_S (d + r sinθ)·r sinθ dθ
///                         = [ −r·d·cos θ + r²·(θ/2 − sin2θ/4) ]_S
/// Q⁺ = −½∮ max(z−c,0)² dy = ½∫_S (d + r sinθ)²·r sinθ dθ
///                         = ½[ −d²·r·cos θ + 2·d·r²·(θ/2 − sin2θ/4)
///                              + r³·(−cos θ + cos³θ/3) ]_S
/// ```
///
/// waarbij `S` de deelverzameling van het hoekbereik is waarop `z > c`, dus
/// `sin θ > (c − zc)/r`. De doorlooprichting zit in het teken: bij een boog
/// met de klok mee (`θ₂ < θ₁`) draaien we het bereik om en keren het teken.
fn boven_boog(centrum: (f64, f64), r: f64, t1: f64, t2: f64, snij: f64) -> (f64, f64) {
    if r == 0.0 {
        return (0.0, 0.0);
    }
    let zc = centrum.1;
    let d = zc - snij;
    let (lo, hi, teken) = if t1 <= t2 { (t1, t2, 1.0) } else { (t2, t1, -1.0) };
    let k = (snij - zc) / r;

    let sin2 = |t: f64| t / 2.0 - (2.0 * t).sin() / 4.0;
    let f_a = |t: f64| -r * d * t.cos() + r * r * sin2(t);
    let f_q = |t: f64| {
        let c = t.cos();
        0.5 * (-d * d * r * c + 2.0 * d * r * r * sin2(t) + r * r * r * (-c + c * c * c / 3.0))
    };

    let mut a_plus = 0.0;
    let mut q_plus = 0.0;
    for (a, b) in sin_boven_intervallen(lo, hi, k) {
        a_plus += f_a(b) - f_a(a);
        q_plus += f_q(b) - f_q(a);
    }
    (teken * a_plus, teken * q_plus)
}

// ════════════════════════════════════════════════════════════════════════════
//  Contour en bouwer
// ════════════════════════════════════════════════════════════════════════════

/// Eén gesloten rand. Tegen de klok in = materiaal, met de klok mee = gat.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Contour {
    pub segmenten: Vec<Segment>,
}

impl Contour {
    /// Doorlooprichting omkeren: buitenrand wordt gat en andersom.
    pub fn omgekeerd(&self) -> Contour {
        Contour {
            segmenten: self.segmenten.iter().rev().map(Segment::omgekeerd).collect(),
        }
    }

    pub fn verschoven(&self, dy: f64, dz: f64) -> Contour {
        Contour { segmenten: self.segmenten.iter().map(|s| s.verschoven(dy, dz)).collect() }
    }

    pub fn gedraaid(&self, hoek: f64) -> Contour {
        Contour { segmenten: self.segmenten.iter().map(|s| s.gedraaid(hoek)).collect() }
    }

    /// Het teken van het omsloten oppervlak: `> 0` tegen de klok in.
    pub fn oppervlak_mm2(&self) -> f64 {
        self.segmenten.iter().map(|s| s.momenten().a).sum()
    }

    /// Rechthoek met de linkeronderhoek op `(y0, z0)`, tegen de klok in.
    pub fn rechthoek(y0: f64, z0: f64, b: f64, h: f64) -> Contour {
        ContourBouwer::nieuw(y0, z0)
            .lijn(y0 + b, z0)
            .lijn(y0 + b, z0 + h)
            .lijn(y0, z0 + h)
            .sluit()
    }

    /// Rechthoek met vier afgeronde hoeken (straal `r`), tegen de klok in.
    /// `r = 0` geeft gewoon de scherpe rechthoek.
    pub fn afgeronde_rechthoek(y0: f64, z0: f64, b: f64, h: f64, r: f64) -> Contour {
        let r = r.max(0.0).min(b / 2.0).min(h / 2.0);
        if r == 0.0 {
            return Contour::rechthoek(y0, z0, b, h);
        }
        let (y1, z1) = (y0 + b, z0 + h);
        ContourBouwer::nieuw(y0 + r, z0)
            .lijn(y1 - r, z0)
            .boog((y1 - r, z0 + r), (y1, z0 + r), true)
            .lijn(y1, z1 - r)
            .boog((y1 - r, z1 - r), (y1 - r, z1), true)
            .lijn(y0 + r, z1)
            .boog((y0 + r, z1 - r), (y0, z1 - r), true)
            .lijn(y0, z0 + r)
            .boog((y0 + r, z0 + r), (y0 + r, z0), true)
            .sluit()
    }

    /// Volledige cirkel als **vier kwartbogen**, tegen de klok in.
    pub fn cirkel(centrum: (f64, f64), r: f64) -> Contour {
        let segmenten = (0..4)
            .map(|i| Segment::Boog {
                centrum,
                straal: r,
                theta1: i as f64 * FRAC_PI_2,
                theta2: (i + 1) as f64 * FRAC_PI_2,
            })
            .collect();
        Contour { segmenten }
    }
}

/// Bouwt een contour segment voor segment; onthoudt het huidige punt.
#[derive(Clone, Debug)]
pub struct ContourBouwer {
    start: (f64, f64),
    huidig: (f64, f64),
    segmenten: Vec<Segment>,
}

impl ContourBouwer {
    pub fn nieuw(y: f64, z: f64) -> Self {
        Self { start: (y, z), huidig: (y, z), segmenten: Vec::new() }
    }

    /// Rechte lijn naar `(y, z)`.
    pub fn lijn(mut self, y: f64, z: f64) -> Self {
        if (y, z) != self.huidig {
            self.segmenten.push(Segment::Lijn { van: self.huidig, naar: (y, z) });
            self.huidig = (y, z);
        }
        self
    }

    /// Cirkelboog om `centrum` naar `naar`.
    ///
    /// De straal volgt uit het **huidige** punt, zodat de contour gegarandeerd
    /// aansluit; `naar` bepaalt alleen de eindhoek. `tegen_klok` kiest welke
    /// van de twee bogen tussen begin- en eindhoek wordt gelopen: de bolle
    /// hoek van een koker loopt tegen de klok in, een walsuitronding (holle
    /// hoek) met de klok mee.
    pub fn boog(mut self, centrum: (f64, f64), naar: (f64, f64), tegen_klok: bool) -> Self {
        let r = ((self.huidig.0 - centrum.0).powi(2) + (self.huidig.1 - centrum.1).powi(2)).sqrt();
        if r <= 0.0 {
            return self.lijn(naar.0, naar.1);
        }
        let t1 = (self.huidig.1 - centrum.1).atan2(self.huidig.0 - centrum.0);
        let mut t2 = (naar.1 - centrum.1).atan2(naar.0 - centrum.0);
        if tegen_klok {
            while t2 <= t1 {
                t2 += TAU;
            }
        } else {
            while t2 >= t1 {
                t2 -= TAU;
            }
        }
        self.segmenten.push(Segment::Boog { centrum, straal: r, theta1: t1, theta2: t2 });
        self.huidig = punt_op_boog(centrum, r, t2);
        self
    }

    /// Sluit de contour (voegt zo nodig een sluitende lijn toe).
    pub fn sluit(mut self) -> Contour {
        if self.huidig != self.start {
            self.segmenten.push(Segment::Lijn { van: self.huidig, naar: self.start });
        }
        Contour { segmenten: self.segmenten }
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Doorsnede
// ════════════════════════════════════════════════════════════════════════════

/// Een complete doorsnede: buitenrand(en) plus gaten.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Doorsnede {
    pub contouren: Vec<Contour>,
}

/// Alle uit de geometrie afleidbare doorsnedegrootheden.
///
/// `Iy`, `Iz` en `Iyz` staan om de **zwaartepuntsassen**; `y_c_mm`/`z_c_mm`
/// geven het zwaartepunt in het invoerstelsel, en `y_min_mm` … `z_max_mm` de
/// omhullende rechthoek, eveneens in het invoerstelsel.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ContourEigenschappen {
    pub a_mm2: f64,
    /// `Sy = ∬ z dA` om de **oorsprong** van het invoerstelsel.
    pub sy_mm3: f64,
    /// `Sz = ∬ y dA` om de **oorsprong** van het invoerstelsel.
    pub sz_mm3: f64,
    pub y_c_mm: f64,
    pub z_c_mm: f64,

    pub iy_mm4: f64,
    pub iz_mm4: f64,
    pub iyz_mm4: f64,

    /// Grootste hoofdtraagheidsmoment.
    pub iu_mm4: f64,
    /// Kleinste hoofdtraagheidsmoment.
    pub iv_mm4: f64,
    /// Hoek van de y-as naar de hoofdas met de grootste traagheid (rad),
    /// `α = ½·atan2(−2·Iyz, Iy − Iz)`.
    pub alpha_hoofdas_rad: f64,

    pub y_min_mm: f64,
    pub y_max_mm: f64,
    pub z_min_mm: f64,
    pub z_max_mm: f64,

    /// `Iy / (z_max − z_c)`
    pub wel_y_boven_mm3: f64,
    /// `Iy / (z_c − z_min)`
    pub wel_y_onder_mm3: f64,
    /// `Iz / (y_c − y_min)`
    pub wel_z_links_mm3: f64,
    /// `Iz / (y_max − y_c)`
    pub wel_z_rechts_mm3: f64,

    pub i_y_straal_mm: f64,
    pub i_z_straal_mm: f64,

    pub wpl_y_mm3: f64,
    pub wpl_z_mm3: f64,
    /// z-coördinaat van de plastische neutrale as (invoerstelsel).
    pub z_pna_mm: f64,
    /// y-coördinaat van de plastische neutrale as (invoerstelsel).
    pub y_pna_mm: f64,
}

/// Uitkomst van een plastische berekening om één as.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PlastischResultaat {
    pub wpl_mm3: f64,
    /// Afstand van de plastische neutrale as tot het **zwaartepunt**, gemeten
    /// loodrecht op de as (positief in de `+u`-richting).
    pub as_afstand_mm: f64,
    pub iteraties: u32,
}

impl Doorsnede {
    pub fn nieuw() -> Self {
        Self::default()
    }

    pub fn met(mut self, c: Contour) -> Self {
        self.contouren.push(c);
        self
    }

    /// Voeg een gat toe: de contour wordt omgekeerd doorlopen.
    pub fn met_gat(mut self, c: Contour) -> Self {
        self.contouren.push(c.omgekeerd());
        self
    }

    pub fn verschoven(&self, dy: f64, dz: f64) -> Doorsnede {
        Doorsnede { contouren: self.contouren.iter().map(|c| c.verschoven(dy, dz)).collect() }
    }

    pub fn gedraaid(&self, hoek: f64) -> Doorsnede {
        Doorsnede { contouren: self.contouren.iter().map(|c| c.gedraaid(hoek)).collect() }
    }

    /// Alle contouren omgekeerd doorlopen. Nodig als vangnet wanneer een
    /// doorsnede per ongeluk helemaal met de klok mee is ingevoerd.
    pub fn omgekeerd(&self) -> Doorsnede {
        Doorsnede { contouren: self.contouren.iter().map(Contour::omgekeerd).collect() }
    }

    fn alle_segmenten(&self) -> impl Iterator<Item = &Segment> {
        self.contouren.iter().flat_map(|c| c.segmenten.iter())
    }

    /// De zes randintegralen om de **oorsprong** van het invoerstelsel.
    /// Publiek omdat je ermee kunt controleren dat samenstellingen optellen.
    pub fn momenten_om_oorsprong(&self) -> (f64, f64, f64, f64, f64, f64) {
        let mut m = Momenten::default();
        for s in self.alle_segmenten() {
            m.tel_op(s.momenten());
        }
        (m.a, m.sy, m.sz, m.iy, m.iz, m.iyz)
    }

    /// Omhullende rechthoek `(y_min, y_max, z_min, z_max)`.
    pub fn uitersten(&self) -> (f64, f64, f64, f64) {
        let mut u = (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
        for s in self.alle_segmenten() {
            let (a, b, c, d) = s.uitersten();
            u.0 = u.0.min(a);
            u.1 = u.1.max(b);
            u.2 = u.2.min(c);
            u.3 = u.3.max(d);
        }
        if !u.0.is_finite() {
            u = (0.0, 0.0, 0.0, 0.0);
        }
        u
    }

    /// `A⁺ = ∬_{z > snij} dA` — geen knipwerk nodig, zie moduledocumentatie.
    pub fn oppervlak_boven(&self, snij: f64) -> f64 {
        self.alle_segmenten().map(|s| s.boven(snij).0).sum()
    }

    /// `Q⁺ = ∬_{z > snij} (z − snij) dA`.
    pub fn statisch_moment_boven(&self, snij: f64) -> f64 {
        self.alle_segmenten().map(|s| s.boven(snij).1).sum()
    }

    /// Plastisch weerstandsmoment om een **willekeurige** as door het
    /// zwaartepunt, onder hoek `alpha_rad` met de y-as.
    ///
    /// De vezelafstand is `u = −y·sin α + z·cos α`; `α = 0` geeft dus `Wpl;y`
    /// en `α = π/2` geeft `Wpl;z`. De doorsnede wordt over `−α` teruggedraaid
    /// zodat de as horizontaal ligt, waarna de gelijke-oppervlakte-as met
    /// bisectie tot machineprecisie wordt gezocht.
    ///
    /// Met `c` de gevonden as geldt, zonder enige aanname over de ligging:
    ///
    /// ```text
    /// Wpl = ∬|z − c| dA = Q⁺ + Q⁻,   Q⁻ = (c·A − Sy) + Q⁺
    ///     = 2·Q⁺(c) + c·A − Sy
    /// ```
    ///
    /// `Sy` is in het gedraaide stelsel in theorie nul, maar wordt hier
    /// **gemeten** in plaats van weggelaten: het zwaartepunt heeft bij een
    /// doorsnede die duizenden millimeters van de oorsprong ligt een kleine
    /// restfout, en die zou anders rechtstreeks in `Wpl` doorwerken.
    pub fn wpl_om_as(&self, alpha_rad: f64) -> PlastischResultaat {
        let (a_tot, sy, sz, ..) = self.momenten_om_oorsprong();
        if a_tot == 0.0 {
            return PlastischResultaat::default();
        }
        if a_tot < 0.0 {
            // Helemaal met de klok mee ingevoerd: één keer omkeren en klaar.
            return self.omgekeerd().wpl_om_as(alpha_rad);
        }
        let (y_c, z_c) = (sz / a_tot, sy / a_tot);
        // Eerst naar het zwaartepunt, dán draaien: zo blijft de precisie
        // behouden ook als de doorsnede ver van de oorsprong ligt.
        let d = self.verschoven(-y_c, -z_c).gedraaid(-alpha_rad);
        let (a_d, sy_d, ..) = d.momenten_om_oorsprong();
        let (_, _, z_min, z_max) = d.uitersten();

        // Bisectie op de gelijke-oppervlakte-as. A⁺(c) daalt monotoon in c.
        let doel = a_d / 2.0;
        let (mut lo, mut hi) = (z_min, z_max);
        let mut iteraties = 0u32;
        loop {
            let mid = 0.5 * (lo + hi);
            if mid <= lo || mid >= hi || iteraties >= 200 {
                break;
            }
            if d.oppervlak_boven(mid) > doel {
                lo = mid;
            } else {
                hi = mid;
            }
            iteraties += 1;
        }
        let c = 0.5 * (lo + hi);
        let q_plus = d.statisch_moment_boven(c);
        PlastischResultaat {
            wpl_mm3: 2.0 * q_plus + c * a_d - sy_d,
            as_afstand_mm: c,
            iteraties,
        }
    }

    /// Reken de complete doorsnede door.
    pub fn bereken(&self) -> ContourEigenschappen {
        let (a, sy, sz, ..) = self.momenten_om_oorsprong();
        if a == 0.0 {
            return ContourEigenschappen::default();
        }
        if a < 0.0 {
            return self.omgekeerd().bereken();
        }
        let (y_c, z_c) = (sz / a, sy / a);

        // Tweede momenten worden op de náár het zwaartepunt verschoven contour
        // berekend, niet via Steiner terug. Zo is een doorsnede die 1000 mm
        // verderop ligt exact even nauwkeurig als een om de oorsprong: het
        // verschil `Iy₀ − A·z_c²` zou anders cijfers wegstrepen.
        let gecentreerd = self.verschoven(-y_c, -z_c);
        let (_, _, _, iy, iz, iyz) = gecentreerd.momenten_om_oorsprong();

        // Hoofdassen. Iu is maximaal wanneer (cos 2α, sin 2α) ∥ (Iy − Iz, −2Iyz).
        let straal = ((iy - iz).powi(2) + 4.0 * iyz * iyz).sqrt();
        let iu = 0.5 * (iy + iz) + 0.5 * straal;
        let iv = 0.5 * (iy + iz) - 0.5 * straal;
        let alpha = if iyz == 0.0 && iy >= iz {
            0.0
        } else {
            0.5 * (-2.0 * iyz).atan2(iy - iz)
        };

        let (y_min, y_max, z_min, z_max) = self.uitersten();
        let deel = |t: f64, n: f64| if n.abs() > 0.0 { t / n } else { 0.0 };

        let pl_y = self.wpl_om_as(0.0);
        let pl_z = self.wpl_om_as(FRAC_PI_2);

        ContourEigenschappen {
            a_mm2: a,
            sy_mm3: sy,
            sz_mm3: sz,
            y_c_mm: y_c,
            z_c_mm: z_c,
            iy_mm4: iy,
            iz_mm4: iz,
            iyz_mm4: iyz,
            iu_mm4: iu,
            iv_mm4: iv,
            alpha_hoofdas_rad: alpha,
            y_min_mm: y_min,
            y_max_mm: y_max,
            z_min_mm: z_min,
            z_max_mm: z_max,
            wel_y_boven_mm3: deel(iy, z_max - z_c),
            wel_y_onder_mm3: deel(iy, z_c - z_min),
            wel_z_links_mm3: deel(iz, y_c - y_min),
            wel_z_rechts_mm3: deel(iz, y_max - y_c),
            i_y_straal_mm: (iy / a).sqrt(),
            i_z_straal_mm: (iz / a).sqrt(),
            wpl_y_mm3: pl_y.wpl_mm3,
            wpl_z_mm3: pl_z.wpl_mm3,
            z_pna_mm: z_c + pl_y.as_afstand_mm,
            // Bij α = π/2 is u = −y, dus y_pna = y_c − as_afstand.
            y_pna_mm: y_c - pl_z.as_afstand_mm,
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Profielgeometrie → contouren
// ════════════════════════════════════════════════════════════════════════════
//
// Dezelfde vormlogica als de tekening in de frontend, maar dan als exacte
// meetkunde in plaats van een SVG-pad. Alle profielen staan met de
// linkeronderhoek van de omhullende rechthoek op de oorsprong: `y ∈ [0, b]`,
// `z ∈ [0, h]` — hetzelfde beschrijvingsassenstelsel als `SectionProperties`.

/// Werkelijke I-contour met vier walsuitrondingen als kwartcirkels.
///
/// De uitronding is een *holle* hoek: in een buitenrand die tegen de klok in
/// loopt, wordt die met de klok mee doorlopen. De straal wordt begrensd tot
/// wat er meetkundig past, zodat onzinnige catalogusinvoer geen zelfsnijdende
/// contour oplevert.
pub fn i_profiel(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> Doorsnede {
    let r = begrens_straal(r, (b - tw) / 2.0, (h - 2.0 * tf) / 2.0);
    let wl = (b - tw) / 2.0; // flensuitstek links van het lijf
    let wr = wl + tw; // rechterkant van het lijf
    let c = ContourBouwer::nieuw(0.0, 0.0)
        .lijn(b, 0.0)
        .lijn(b, tf)
        .lijn(wr + r, tf)
        .boog((wr + r, tf + r), (wr, tf + r), false)
        .lijn(wr, h - tf - r)
        .boog((wr + r, h - tf - r), (wr + r, h - tf), false)
        .lijn(b, h - tf)
        .lijn(b, h)
        .lijn(0.0, h)
        .lijn(0.0, h - tf)
        .lijn(wl - r, h - tf)
        .boog((wl - r, h - tf - r), (wl, h - tf - r), false)
        .lijn(wl, tf + r)
        .boog((wl - r, tf + r), (wl - r, tf), false)
        .lijn(0.0, tf)
        .sluit();
    Doorsnede::nieuw().met(c)
}

/// U-contour met twee walsuitrondingen; de rug van het lijf ligt op `y = 0`.
pub fn u_profiel(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> Doorsnede {
    let r = begrens_straal(r, b - tw, (h - 2.0 * tf) / 2.0);
    let c = ContourBouwer::nieuw(0.0, 0.0)
        .lijn(b, 0.0)
        .lijn(b, tf)
        .lijn(tw + r, tf)
        .boog((tw + r, tf + r), (tw, tf + r), false)
        .lijn(tw, h - tf - r)
        .boog((tw + r, h - tf - r), (tw + r, h - tf), false)
        .lijn(b, h - tf)
        .lijn(b, h)
        .lijn(0.0, h)
        .sluit();
    Doorsnede::nieuw().met(c)
}

/// U-contour met **toelopende** flenzen (DIN 1026-1, de UNP-reeks).
///
/// Het flens*buiten*vlak blijft vlak op `z = 0` en `z = h`; het *binnen*vlak
/// loopt met `schuinte` (8 % bij UNP) toe. De nominale flensdikte `tf` wordt
/// daarbij op **halve flensbreedte** gemeten (`y = b/2` vanaf de lijfrug) —
/// dezelfde conventie als bij de andere DIN-walsprofielen met schuine flens:
///
/// ```text
/// binnenvlak bovenflens:  z = h/2 + a + s·y,   a = h/2 − tf − s·b/2
/// ```
///
/// Er zitten twee afrondingen in: de walsuitronding `r1` tussen lijf en flens
/// (middelpunt in de **holte**, dus onder het schuine vlak) en de
/// flenstipafronding `r2` (middelpunt in het **materiaal**, dus erboven). Met
/// `k = √(1+s²)` liggen middelpunten en raakpunten vast op
///
/// ```text
/// y_c1 = tw + r1     d1 = a + s·y_c1 − r1·k     y_t1 = y_c1 − r1·s/k
/// y_c2 = b − r2      d2 = a + s·y_c2 + r2·k     y_t2 = y_c2 + r2·s/k
/// ```
///
/// (`d` telkens de hoogte van het middelpunt boven de halve hoogte). Controle
/// dat `y_t1` echt op de schuine lijn ligt:
/// `d1 + r1/k = a + s·y_c1 − r1·k + r1/k = a + s·y_c1 − r1·s²/k = a + s·y_t1` ✓.
///
/// Beide bogen spannen `180° − (90° + atan s)`, dus krap 90°. Met `s = 0` en
/// `r2 = 0` gaat deze contour exact over in [`u_profiel`].
pub fn u_profiel_schuin(
    h: f64,
    b: f64,
    tw: f64,
    tf: f64,
    r1: f64,
    r2: f64,
    schuinte: f64,
) -> Doorsnede {
    let s = schuinte.max(0.0);
    if s == 0.0 && r2 <= 0.0 {
        return u_profiel(h, b, tw, tf, r1);
    }
    let hh = h / 2.0;
    let a = hh - tf - s * b / 2.0;
    let k = (1.0 + s * s).sqrt();
    // De uitronding moet in de holte passen (tussen lijfvlak en schuin
    // flensbinnenvlak), de tipafronding in het dunste deel van de flens.
    let r1 = begrens_straal(r1, (b - tw) / 2.0, a);
    let r2 = begrens_straal(r2, (b - tw) / 2.0, hh - a - s * b);

    let yc1 = tw + r1;
    let d1 = a + s * yc1 - r1 * k;
    let yt1 = yc1 - r1 * s / k;
    let yc2 = b - r2;
    let d2 = a + s * yc2 + r2 * k;
    let yt2 = yc2 + r2 * s / k;

    // Hoogte van het schuine binnenvlak boven het hart, op positie y.
    let vlak = |y: f64| a + s * y;

    let c = ContourBouwer::nieuw(0.0, 0.0)
        .lijn(b, 0.0)
        .lijn(b, hh - d2)
        .boog((yc2, hh - d2), (yt2, hh - vlak(yt2)), true)
        .lijn(yt1, hh - vlak(yt1))
        .boog((yc1, hh - d1), (tw, hh - d1), false)
        .lijn(tw, hh + d1)
        .boog((yc1, hh + d1), (yt1, hh + vlak(yt1)), false)
        .lijn(yt2, hh + vlak(yt2))
        .boog((yc2, hh + d2), (b, hh + d2), true)
        .lijn(b, h)
        .lijn(0.0, h)
        .sluit();
    Doorsnede::nieuw().met(c)
}

/// Flensschuinte van de UNP-reeks volgens DIN 1026-1: 8 %.
pub const UNP_SCHUINTE: f64 = 0.08;

/// UNP-contour uit de vier catalogusmaten plus de walsuitronding.
/// De flenstipafronding is `r/2` (DIN 1026-1).
pub fn unp(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> Doorsnede {
    u_profiel_schuin(h, b, tw, tf, r, r / 2.0, UNP_SCHUINTE)
}

/// Koker met een **concentrische** wand: de binnenstraal is `r_buiten − t`,
/// zodat de wanddikte overal exact `t` is.
///
/// Dat is de meetkundig zuivere koker, maar **niet** de conventie waarmee de
/// catalogustabellen voor warmgewalste holle doorsneden zijn opgesteld —
/// gebruik daarvoor [`koker_en10210`]. Bij `r_buiten ≤ t` wordt de binnenhoek
/// scherp.
pub fn koker(h: f64, b: f64, t: f64, r_buiten: f64) -> Doorsnede {
    let ro = r_buiten.max(0.0).min(b / 2.0).min(h / 2.0);
    koker_met_stralen(h, b, t, ro, ro - t)
}

/// Koker met een **vrij gekozen** buiten- en binnenhoekstraal.
pub fn koker_met_stralen(h: f64, b: f64, t: f64, r_buiten: f64, r_binnen: f64) -> Doorsnede {
    let ro = begrens_straal(r_buiten, b / 2.0, h / 2.0);
    let ri = begrens_straal(r_binnen, b / 2.0 - t, h / 2.0 - t);
    let buiten = Contour::afgeronde_rechthoek(0.0, 0.0, b, h, ro);
    let binnen = Contour::afgeronde_rechthoek(t, t, b - 2.0 * t, h - 2.0 * t, ri);
    Doorsnede::nieuw().met(buiten).met_gat(binnen)
}

/// Warmgewalste koker volgens **EN 10210-2**: buitenhoekstraal `1,5·t`,
/// binnenhoekstraal `1,0·t`.
///
/// Die twee stralen zijn *niet* concentrisch — de wand is in de hoek dus dikker
/// dan `t`. Dat is geen slordigheid maar de normconventie waarmee de
/// gepubliceerde tabellen zijn opgesteld, en het scheelt merkbaar: op
/// SHS 60×60×8 geeft het concentrische model een 2,6 % kleiner oppervlak.
pub fn koker_en10210(h: f64, b: f64, t: f64) -> Doorsnede {
    koker_met_stralen(h, b, t, 1.5 * t, 1.0 * t)
}

/// Buis: twee cirkels, de binnenste als gat. `d` is de buitendiameter.
pub fn buis(d: f64, t: f64) -> Doorsnede {
    let ro = d / 2.0;
    let ri = (ro - t).max(0.0);
    let m = (ro, ro);
    let mut ds = Doorsnede::nieuw().met(Contour::cirkel(m, ro));
    if ri > 0.0 {
        ds = ds.met_gat(Contour::cirkel(m, ri));
    }
    ds
}

/// Massieve rechthoek `b × h` (hout, vrije maatvoering).
pub fn rechthoek(h: f64, b: f64) -> Doorsnede {
    Doorsnede::nieuw().met(Contour::rechthoek(0.0, 0.0, b, h))
}

fn begrens_straal(r: f64, max1: f64, max2: f64) -> f64 {
    r.max(0.0).min(max1.max(0.0)).min(max2.max(0.0))
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    /// Relatieve fout; bij een verwachte nul de absolute fout geschaald met
    /// `schaal`, zodat "nul" ook meetbaar is.
    fn rel(gemeten: f64, verwacht: f64, schaal: f64) -> f64 {
        if verwacht == 0.0 {
            (gemeten / schaal).abs()
        } else {
            ((gemeten - verwacht) / verwacht).abs()
        }
    }

    fn eis(naam: &str, gemeten: f64, verwacht: f64, schaal: f64) {
        let f = rel(gemeten, verwacht, schaal);
        println!("{naam:38} gemeten={gemeten:>22.12e} verwacht={verwacht:>22.12e} rel={f:.3e}");
        assert!(f < 1e-12, "{naam}: relatieve fout {f:.3e} ≥ 1e-12");
    }

    // ── Rechthoek ───────────────────────────────────────────────────────────

    #[test]
    fn rechthoek_exact() {
        let (b, h) = (120.0, 300.0);
        let p = rechthoek(h, b).bereken();
        eis("rechthoek A", p.a_mm2, b * h, b * h);
        eis("rechthoek y_c", p.y_c_mm, b / 2.0, b);
        eis("rechthoek z_c", p.z_c_mm, h / 2.0, h);
        eis("rechthoek Iy", p.iy_mm4, b * h.powi(3) / 12.0, b * h.powi(3));
        eis("rechthoek Iz", p.iz_mm4, h * b.powi(3) / 12.0, h * b.powi(3));
        eis("rechthoek Iyz", p.iyz_mm4, 0.0, b * h * b * h);
        eis("rechthoek Wpl;y", p.wpl_y_mm3, b * h * h / 4.0, b * h * h);
        eis("rechthoek Wpl;z", p.wpl_z_mm3, h * b * b / 4.0, h * b * b);
        eis("rechthoek Wel;y", p.wel_y_boven_mm3, b * h * h / 6.0, b * h * h);
        eis("rechthoek i_y", p.i_y_straal_mm, h / 12f64.sqrt(), h);
    }

    // ── Cirkel als vier bogen ───────────────────────────────────────────────

    #[test]
    fn cirkel_uit_vier_bogen_exact() {
        let r = 87.5;
        let d = Doorsnede::nieuw().met(Contour::cirkel((0.0, 0.0), r));
        let p = d.bereken();
        eis("cirkel A", p.a_mm2, PI * r * r, PI * r * r);
        eis("cirkel Iy", p.iy_mm4, PI * r.powi(4) / 4.0, PI * r.powi(4));
        eis("cirkel Iz", p.iz_mm4, PI * r.powi(4) / 4.0, PI * r.powi(4));
        eis("cirkel Iyz", p.iyz_mm4, 0.0, PI * r.powi(4));
        eis("cirkel z_c", p.z_c_mm, 0.0, r);
        eis("cirkel Wpl;y", p.wpl_y_mm3, 4.0 / 3.0 * r.powi(3), r.powi(3));
        eis("cirkel Wpl;z", p.wpl_z_mm3, 4.0 / 3.0 * r.powi(3), r.powi(3));
        // d³/6 is dezelfde waarde, andersom geschreven.
        eis("cirkel Wpl = d³/6", p.wpl_y_mm3, (2.0 * r).powi(3) / 6.0, r.powi(3));
        eis("cirkel z_max", p.z_max_mm, r, r);
        eis("cirkel y_min", p.y_min_mm, -r, r);
    }

    // ── Ring ────────────────────────────────────────────────────────────────

    #[test]
    fn ring_exact() {
        let (rr, ri) = (100.0, 88.0);
        let d = Doorsnede::nieuw()
            .met(Contour::cirkel((0.0, 0.0), rr))
            .met_gat(Contour::cirkel((0.0, 0.0), ri));
        let p = d.bereken();
        let a = PI * (rr * rr - ri * ri);
        let i = PI * (rr.powi(4) - ri.powi(4)) / 4.0;
        eis("ring A", p.a_mm2, a, a);
        eis("ring Iy", p.iy_mm4, i, i);
        eis("ring Iz", p.iz_mm4, i, i);
        eis("ring Iyz", p.iyz_mm4, 0.0, i);
        // Wpl van een ring: 2·(⅔)(R³ − r³) = (4/3)(R³ − r³).
        eis("ring Wpl;y", p.wpl_y_mm3, 4.0 / 3.0 * (rr.powi(3) - ri.powi(3)), rr.powi(3));
    }

    // ── Driehoek ────────────────────────────────────────────────────────────

    #[test]
    fn driehoek_exact() {
        let (b, h) = (150.0, 240.0);
        // Rechthoekige driehoek met de rechte hoek in de oorsprong.
        let c = ContourBouwer::nieuw(0.0, 0.0).lijn(b, 0.0).lijn(0.0, h).sluit();
        let p = Doorsnede::nieuw().met(c).bereken();
        eis("driehoek A", p.a_mm2, 0.5 * b * h, 0.5 * b * h);
        eis("driehoek z_c", p.z_c_mm, h / 3.0, h);
        eis("driehoek y_c", p.y_c_mm, b / 3.0, b);
        eis("driehoek Iy", p.iy_mm4, b * h.powi(3) / 36.0, b * h.powi(3));
        eis("driehoek Iz", p.iz_mm4, h * b.powi(3) / 36.0, h * b.powi(3));
        // Iyz om het zwaartepunt van deze driehoek: −b²h²/72.
        eis("driehoek Iyz", p.iyz_mm4, -b * b * h * h / 72.0, b * b * h * h);
        // Gelijke-oppervlakte-as: z waar b(1−z/h)·(h−z)/... — eenvoudiger via
        // de gelijkvormige bovendriehoek: A⁺ = A·((h−c)/h)² = A/2 ⇒
        // c = h(1 − 1/√2).
        let c_pna = h * (1.0 - 1.0 / 2f64.sqrt());
        eis("driehoek z_pna", p.z_pna_mm, c_pna, h);
    }

    // ── Verschuivingsinvariantie ────────────────────────────────────────────

    #[test]
    fn verschuiving_verandert_niets() {
        let basis = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0);
        let a = basis.bereken();
        let b = basis.verschoven(1000.0, 1000.0).bereken();
        eis("verschoven A", b.a_mm2, a.a_mm2, a.a_mm2);
        eis("verschoven Iy", b.iy_mm4, a.iy_mm4, a.iy_mm4);
        eis("verschoven Iz", b.iz_mm4, a.iz_mm4, a.iz_mm4);
        eis("verschoven Iyz", b.iyz_mm4, 0.0, a.iy_mm4);
        eis("verschoven Wpl;y", b.wpl_y_mm3, a.wpl_y_mm3, a.wpl_y_mm3);
        eis("verschoven Wpl;z", b.wpl_z_mm3, a.wpl_z_mm3, a.wpl_z_mm3);
        eis("verschoven y_c", b.y_c_mm - 1000.0, a.y_c_mm, a.y_c_mm);
        eis("verschoven z_c", b.z_c_mm - 1000.0, a.z_c_mm, a.z_c_mm);
        // Ook 10 000 mm verderop mag niets veranderen.
        let c = basis.verschoven(-10_000.0, 7_500.0).bereken();
        eis("ver verschoven Iy", c.iy_mm4, a.iy_mm4, a.iy_mm4);
        eis("ver verschoven Wpl;y", c.wpl_y_mm3, a.wpl_y_mm3, a.wpl_y_mm3);
    }

    // ── Rotatie-invariantie ─────────────────────────────────────────────────

    #[test]
    fn rotatie_invariantie() {
        let basis = u_profiel(200.0, 75.0, 8.5, 11.5, 12.0);
        let a = basis.bereken();
        for graden in [7.0, 31.0, 45.0, 118.0, -63.5] {
            let hoek = graden * PI / 180.0;
            let b = basis.gedraaid(hoek).bereken();
            eis("gedraaid A", b.a_mm2, a.a_mm2, a.a_mm2);
            eis("gedraaid Iy+Iz", b.iy_mm4 + b.iz_mm4, a.iy_mm4 + a.iz_mm4, a.iy_mm4);
            eis("gedraaid Iu", b.iu_mm4, a.iu_mm4, a.iu_mm4);
            eis("gedraaid Iv", b.iv_mm4, a.iv_mm4, a.iv_mm4);
        }
    }

    #[test]
    fn hoofdassen_maken_iyz_nul() {
        let basis = u_profiel(200.0, 75.0, 8.5, 11.5, 12.0);
        let a = basis.bereken();
        // Draai de doorsnede over −α: dan vallen de hoofdassen op y en z.
        let hoofd = basis.gedraaid(-a.alpha_hoofdas_rad).bereken();
        eis("hoofdassen Iyz", hoofd.iyz_mm4, 0.0, a.iu_mm4);
        eis("hoofdassen Iy = Iu", hoofd.iy_mm4, a.iu_mm4, a.iu_mm4);
        eis("hoofdassen Iz = Iv", hoofd.iz_mm4, a.iv_mm4, a.iv_mm4);
    }

    #[test]
    fn wpl_om_meegedraaide_as() {
        let basis = u_profiel(200.0, 75.0, 8.5, 11.5, 12.0);
        let wpl0 = basis.wpl_om_as(0.0).wpl_mm3;
        for graden in [7.0, 31.0, 45.0, 118.0, -63.5] {
            let hoek = graden * PI / 180.0;
            let wpl = basis.gedraaid(hoek).wpl_om_as(hoek).wpl_mm3;
            eis("Wpl om meegedraaide as", wpl, wpl0, wpl0);
        }
    }

    // ── L-vorm tegen de handmatige Steiner-berekening ───────────────────────

    #[test]
    fn l_vorm_tegen_handberekening() {
        // Twee rechthoeken:
        //   1) liggende flens  y ∈ [0,100], z ∈ [0,20]   A₁ = 2000, (50, 10)
        //   2) staand been     y ∈ [0, 20], z ∈ [20,100] A₂ = 1600, (10, 60)
        //
        // Met de hand:
        //   A   = 3600
        //   y_c = (2000·50 + 1600·10)/3600 = 116000/3600 = 290/9
        //   z_c = (2000·10 + 1600·60)/3600 = 116000/3600 = 290/9
        //   Iy  = 100·20³/12 + 2000·(10 − 290/9)²
        //       +  20·80³/12 + 1600·(60 − 290/9)²
        //       = 200000/3 + 80·10⁶/81 + 2560000/3 + 100·10⁶/81
        //       = 920000 + 180·10⁶/81 = 3 142 222,2̄
        //   Iz  = idem (de vorm is spiegelsymmetrisch in y ↔ z)
        //   Iyz = 2000·(50 − 290/9)(10 − 290/9) + 1600·(10 − 290/9)(60 − 290/9)
        //       = 2000·(160/9)(−200/9) + 1600·(−200/9)(250/9)
        //       = −64·10⁶/81 − 80·10⁶/81 = −144·10⁶/81 = −1 777 777,7̄
        //   Iu  = (Iy+Iz)/2 + √((Iy−Iz)² + 4Iyz²)/2 = Iy + |Iyz| = 4 920 000
        //   Iv  = Iy − |Iyz| = 1 364 444,4̄
        //   α   = ½·atan2(−2Iyz, 0) = π/4
        //
        //   Wpl;y: A/2 = 1800 mm² zit binnen de flens (2000 mm²), dus de
        //   plastische neutrale as ligt op 100·z = 1800 ⇒ z = 18.
        //   Q⁺ = 100·2·1 (flensrest) + 1600·(60 − 18) = 200 + 67200 = 67400
        //   Q⁻ = 1800·(18 − 9) = 16200
        //   Wpl;y = 83 600 mm³, en per symmetrie Wpl;z = 83 600 mm³.
        let d = Doorsnede::nieuw()
            .met(Contour::rechthoek(0.0, 0.0, 100.0, 20.0))
            .met(Contour::rechthoek(0.0, 20.0, 20.0, 80.0));
        let p = d.bereken();

        // 920 000 + 20·10⁶/9 = 3 142 222,2̄ ; −16·10⁶/9 = −1 777 777,7̄
        let iy_hand = 920_000.0 + 20e6 / 9.0;
        let iyz_hand = -16e6 / 9.0;

        eis("L A", p.a_mm2, 3600.0, 3600.0);
        eis("L y_c", p.y_c_mm, 290.0 / 9.0, 100.0);
        eis("L z_c", p.z_c_mm, 290.0 / 9.0, 100.0);
        eis("L Iy", p.iy_mm4, iy_hand, iy_hand);
        eis("L Iz", p.iz_mm4, iy_hand, iy_hand);
        eis("L Iyz", p.iyz_mm4, iyz_hand, iy_hand);
        eis("L Iu", p.iu_mm4, 4_920_000.0, 4_920_000.0);
        eis("L Iv", p.iv_mm4, 12_280_000.0 / 9.0, iy_hand);
        eis("L alpha", p.alpha_hoofdas_rad, PI / 4.0, PI);
        eis("L z_pna", p.z_pna_mm, 18.0, 100.0);
        eis("L y_pna", p.y_pna_mm, 18.0, 100.0);
        eis("L Wpl;y", p.wpl_y_mm3, 83_600.0, 83_600.0);
        eis("L Wpl;z", p.wpl_z_mm3, 83_600.0, 83_600.0);
        // Elastische weerstandsmomenten per uiterste vezel.
        eis("L Wel;y boven", p.wel_y_boven_mm3, iy_hand / (100.0 - 290.0 / 9.0), iy_hand);
        eis("L Wel;y onder", p.wel_y_onder_mm3, iy_hand / (290.0 / 9.0), iy_hand);
    }

    // ── Wpl om een willekeurige as ──────────────────────────────────────────

    #[test]
    fn wpl_om_diagonaal_van_een_vierkant() {
        // Vierkant a×a, as door het zwaartepunt onder 45°: de doorsnede valt
        // in twee driehoeken met oppervlak a²/2, waarvan het zwaartepunt op
        // ⅓·(a√2/2) = a√2/6 van de as ligt. Dus Wpl = 2·(a²/2)·a√2/6
        //           = a³·√2/6.
        let a = 90.0;
        let d = rechthoek(a, a);
        let wpl = d.wpl_om_as(PI / 4.0);
        eis("vierkant Wpl diagonaal", wpl.wpl_mm3, a.powi(3) * 2f64.sqrt() / 6.0, a.powi(3));
        // De as gaat door het zwaartepunt, dus de afstand is nul.
        eis("vierkant pna-afstand", wpl.as_afstand_mm, 0.0, a);
    }

    // ── Profielcontouren ────────────────────────────────────────────────────

    #[test]
    fn i_profiel_zonder_uitronding_is_analytisch() {
        let (h, b, tw, tf) = (300.0, 150.0, 7.1, 10.7);
        let p = i_profiel(h, b, tw, tf, 0.0).bereken();
        let hw = h - 2.0 * tf;
        let a = 2.0 * b * tf + hw * tw;
        let iy = b * h.powi(3) / 12.0 - (b - tw) * hw.powi(3) / 12.0;
        let iz = 2.0 * tf * b.powi(3) / 12.0 + hw * tw.powi(3) / 12.0;
        let wpl_y = b * tf * (h - tf) + tw * hw * hw / 4.0;
        let wpl_z = tf * b * b / 2.0 + hw * tw * tw / 4.0;
        eis("I(r=0) A", p.a_mm2, a, a);
        eis("I(r=0) Iy", p.iy_mm4, iy, iy);
        eis("I(r=0) Iz", p.iz_mm4, iz, iz);
        eis("I(r=0) Iyz", p.iyz_mm4, 0.0, iy);
        eis("I(r=0) Wpl;y", p.wpl_y_mm3, wpl_y, wpl_y);
        eis("I(r=0) Wpl;z", p.wpl_z_mm3, wpl_z, wpl_z);
    }

    #[test]
    fn i_profiel_uitrondingen_tellen_exact_op() {
        // De vier walsuitrondingen zijn precies "vierkant min kwartcirkel".
        // De volledige I-contour moet dus tot op machineprecisie gelijk zijn
        // aan de I zonder uitronding plús die vier losse vulstukken.
        let (h, b, tw, tf, r) = (300.0, 150.0, 7.1, 10.7, 15.0);
        let vol = i_profiel(h, b, tw, tf, r);
        let wl = (b - tw) / 2.0;
        let wr = wl + tw;

        // Eén vulstuk: twee rechte benen plus de holle boog, tegen de klok in.
        let vulling = |hoekpunt: (f64, f64), teken_y: f64, teken_z: f64| {
            let (hy, hz) = hoekpunt;
            let m = (hy + teken_y * r, hz + teken_z * r); // middelpunt van de boog
            let p1 = (hy + teken_y * r, hz); // eind van het horizontale been
            let p2 = (hy, hz + teken_z * r); // eind van het verticale been
            let c = ContourBouwer::nieuw(hy, hz)
                .lijn(p1.0, p1.1)
                // De korte (90°) boog: bij een diagonaal hoekpunt (+,+) of
                // (−,−) loopt die met de klok mee, bij (+,−) of (−,+) tegen.
                .boog(m, p2, teken_y * teken_z < 0.0)
                .sluit();
            // Zorg dat het vulstuk tegen de klok in loopt.
            if c.oppervlak_mm2() >= 0.0 { c } else { c.omgekeerd() }
        };

        let los = Doorsnede::nieuw()
            .met(vulling((wr, tf), 1.0, 1.0))
            .met(vulling((wr, h - tf), 1.0, -1.0))
            .met(vulling((wl, tf), -1.0, 1.0))
            .met(vulling((wl, h - tf), -1.0, -1.0));

        let a_vul = los.momenten_om_oorsprong().0;
        eis("vulstukken A", a_vul, 4.0 * r * r * (1.0 - PI / 4.0), r * r);

        let mut samen = i_profiel(h, b, tw, tf, 0.0);
        samen.contouren.extend(los.contouren.iter().cloned());

        let (a1, sy1, sz1, iy1, iz1, iyz1) = vol.momenten_om_oorsprong();
        let (a2, sy2, sz2, iy2, iz2, iyz2) = samen.momenten_om_oorsprong();
        eis("I samengesteld A", a2, a1, a1);
        eis("I samengesteld Sy", sy2, sy1, sy1);
        eis("I samengesteld Sz", sz2, sz1, sz1);
        eis("I samengesteld Iy", iy2, iy1, iy1);
        eis("I samengesteld Iz", iz2, iz1, iz1);
        eis("I samengesteld Iyz", iyz2, iyz1, iy1);

        // En het geheel tegen de gesloten oppervlakteformule.
        let hw = h - 2.0 * tf;
        let a_an = 2.0 * b * tf + hw * tw + 4.0 * r * r * (1.0 - PI / 4.0);
        eis("I(r) A analytisch", a1, a_an, a_an);
    }

    #[test]
    fn u_profiel_zonder_uitronding_is_analytisch() {
        let (h, b, tw, tf) = (200.0, 75.0, 8.5, 11.5);
        let p = u_profiel(h, b, tw, tf, 0.0).bereken();
        let hw = h - 2.0 * tf;
        let a = 2.0 * b * tf + hw * tw;
        let y_c = (2.0 * b * tf * (b / 2.0) + hw * tw * (tw / 2.0)) / a;
        eis("U(r=0) A", p.a_mm2, a, a);
        eis("U(r=0) y_c", p.y_c_mm, y_c, b);
        eis("U(r=0) z_c", p.z_c_mm, h / 2.0, h);
        let iy = b * h.powi(3) / 12.0 - (b - tw) * hw.powi(3) / 12.0;
        eis("U(r=0) Iy", p.iy_mm4, iy, iy);
        eis("U(r=0) Iyz", p.iyz_mm4, 0.0, iy);
        // Iz met Steiner om de eigen zwaartepuntsas.
        let iz = 2.0 * (tf * b.powi(3) / 12.0 + b * tf * (b / 2.0 - y_c).powi(2))
            + (hw * tw.powi(3) / 12.0 + hw * tw * (tw / 2.0 - y_c).powi(2));
        eis("U(r=0) Iz", p.iz_mm4, iz, iz);
    }

    #[test]
    fn koker_oppervlak_analytisch() {
        let (h, b, t, r) = (200.0, 100.0, 8.0, 16.0);
        let p = koker(h, b, t, r).bereken();
        // Afgeronde rechthoek: b·h − (4 − π)·r².
        let a_buiten = b * h - (4.0 - PI) * r * r;
        let ri = r - t;
        let a_binnen = (b - 2.0 * t) * (h - 2.0 * t) - (4.0 - PI) * ri * ri;
        eis("koker A", p.a_mm2, a_buiten - a_binnen, a_buiten);
        eis("koker y_c", p.y_c_mm, b / 2.0, b);
        eis("koker z_c", p.z_c_mm, h / 2.0, h);
        eis("koker Iyz", p.iyz_mm4, 0.0, p.iy_mm4);
        eis("koker z_pna", p.z_pna_mm, h / 2.0, h);
        // Scherpe koker is de zuivere rechthoek-min-rechthoek.
        let scherp = koker(h, b, t, 0.0).bereken();
        let iy = b * h.powi(3) / 12.0 - (b - 2.0 * t) * (h - 2.0 * t).powi(3) / 12.0;
        eis("koker(r=0) Iy", scherp.iy_mm4, iy, iy);
    }

    #[test]
    fn buis_is_de_ring() {
        let (d, t) = (219.1, 10.0);
        let p = buis(d, t).bereken();
        let ro = d / 2.0;
        let ri = ro - t;
        let a = PI * (ro * ro - ri * ri);
        let i = PI * (ro.powi(4) - ri.powi(4)) / 4.0;
        eis("buis A", p.a_mm2, a, a);
        eis("buis Iy", p.iy_mm4, i, i);
        eis("buis Iz", p.iz_mm4, i, i);
        eis("buis y_c", p.y_c_mm, ro, d);
        eis("buis Wpl", p.wpl_y_mm3, 4.0 / 3.0 * (ro.powi(3) - ri.powi(3)), ro.powi(3));
    }

    #[test]
    fn gat_maakt_het_verschil_van_twee_doorsneden() {
        // Rechthoek met een rond gat: A en Iy moeten exact het verschil zijn.
        let (b, h, r) = (200.0, 300.0, 40.0);
        let d = Doorsnede::nieuw()
            .met(Contour::rechthoek(0.0, 0.0, b, h))
            .met_gat(Contour::cirkel((b / 2.0, h / 2.0), r));
        let p = d.bereken();
        eis("gat A", p.a_mm2, b * h - PI * r * r, b * h);
        eis("gat z_c", p.z_c_mm, h / 2.0, h);
        let iy = b * h.powi(3) / 12.0 - PI * r.powi(4) / 4.0;
        eis("gat Iy", p.iy_mm4, iy, iy);
        // Wpl van de doorboorde rechthoek: b·h²/4 − (4/3)r³.
        eis("gat Wpl;y", p.wpl_y_mm3, b * h * h / 4.0 - 4.0 / 3.0 * r.powi(3), b * h * h);
    }
}
