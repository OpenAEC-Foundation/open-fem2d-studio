//! NEN-EN 1993-1-1 bijlage B (methode 2): interactiefactoren k_ij voor de
//! interactieformules (6.61) en (6.62) van art. 6.3.3(4).
//!
//! De Nederlandse bijlage bij 6.3.3(5) schrijft voor: "Voor de bepaling van de
//! waarden van k_yy, k_yz, k_zy en k_zz moet bijlage B zijn toegepast", en bij
//! bijlage B zelf: "Bijlage B moet als normatief zijn gelezen." Bijlage B kent
//! drie tabellen:
//!
//! * **tabel B.1** — k_ij voor staven die NIET gevoelig zijn voor vervormingen
//!   door torsie (gesloten doorsneden, of open doorsneden die niet kippen);
//! * **tabel B.2** — k_ij voor staven die WEL gevoelig zijn voor vervormingen
//!   door torsie: k_yy, k_yz en k_zz volgens B.1, maar k_zy met een eigen
//!   formule waarin C_mLT meerekent;
//! * **tabel B.3** — de equivalente momentverdelingsfactoren C_my, C_mz en
//!   C_mLT uit het momentenverloop tussen de gesteunde punten.
//!
//! Hier stond tot september 2026 C_m hard op 0,6 en k_zy altijd volgens B.1.
//! Dat is bij een constant moment 40 % te gunstig (tabel B.3 geeft daar 1,0),
//! en voor een kipgevoelige staaf de verkeerde tabel. Zie basisaudit nr 7.

use crate::opmaak::nl;

/// De drie rijen van tabel B.3.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CmRij {
    /// Alleen eindmomenten, lineair verloop: `C_m = 0,6 + 0,4ψ ≥ 0,4`.
    Lineair,
    /// Eindmomenten M_h en ψ·M_h mét een veldmoment M_s dat kleiner is dan
    /// M_h: `α_s = M_s/M_h`.
    Eindmomenten,
    /// Veldmoment M_s groter dan de eindmomenten: `α_h = M_h/M_s`.
    Veldmoment,
}

/// De twee kolommen van tabel B.3: gelijkmatig verdeelde of geconcentreerde
/// belasting. De kolom "gelijkmatig verdeeld" geeft in elke rij de grootste
/// (dus veiligste) C_m; bij twijfel over de lastvorm wordt zij aangehouden.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lastvorm {
    Verdeeld,
    Geconcentreerd,
}

/// Eén C_m met de hele verantwoording erbij.
#[derive(Clone, Debug)]
pub struct CmUitkomst {
    pub cm: f64,
    pub rij: CmRij,
    pub lastvorm: Lastvorm,
    /// Verhouding van de eindmomenten, −1 ≤ ψ ≤ 1 (kleinste gedeeld door
    /// grootste, mét teken). 1,0 als beide eindmomenten nul zijn.
    pub psi: f64,
    /// Grootste eindmoment M_h (kNm, mét teken).
    pub m_h_knm: f64,
    /// Veldmoment M_s (kNm, mét teken); 0 bij een lineair verloop.
    pub m_s_knm: f64,
    /// α_s = M_s/M_h (rij "Eindmomenten") of α_h = M_h/M_s (rij "Veldmoment").
    pub alpha: f64,
    /// Leesbare verantwoording voor het rapport, zonder de naam van de factor
    /// (die plakt de aanroeper ervoor: "C_my", "C_mLT", ...).
    pub toelichting: String,
}

/// Verhouding waaronder een afwijking van de rechte lijn tussen de
/// eindmomenten als "geen afwijking" telt (t.o.v. het grootste moment).
const TOL_LINEAIR: f64 = 1e-3;

/// `0,6 + 0,4ψ ≥ 0,4` — de eerste rij van tabel B.3 (alleen eindmomenten).
pub fn cm_uniform_or_psi(psi: f64) -> f64 {
    (0.6 + 0.4 * psi).max(0.4)
}

/// C_m volgens tabel B.3 uit een bemonsterde momentenlijn `(x_mm, M_kNm)`
/// tussen twee gesteunde punten. De punten hoeven niet gesorteerd te zijn.
///
/// Werkwijze:
/// 1. De eindmomenten geven M_h (grootste absolute waarde) en ψ.
/// 2. Wijkt geen enkel tussenpunt meer dan 0,1 % van het grootste moment af
///    van de rechte lijn tussen de eindmomenten, dan is het verloop lineair
///    (rij 1).
/// 3. Anders is er een veldmoment M_s: het tussenliggende extremum van de
///    momentenlijn (het punt waar de helling van teken wisselt) met de grootste
///    absolute waarde. Is |M_s| ≤ |M_h| dan geldt rij 2 met α_s = M_s/M_h,
///    anders rij 3 met α_h = M_h/M_s. Tekens tellen mee: α < 0 betekent dat
///    veld- en eindmoment aan weerszijden van de staafas liggen.
/// 4. Heeft de lijn géén tussenliggend extremum (monotoon verloop met een
///    bolling), dan is rij 1 genomen én rij 2/3 met het punt van de grootste
///    bolling als M_s, en de grootste van de twee aangehouden: tabel B.3
///    heeft voor zo'n verloop geen eigen rij, en de grootste C_m is de
///    veilige kant.
/// 5. De lastvorm (verdeeld of geconcentreerd) volgt uit de vorm van de
///    bolling: alleen als zij duidelijk driehoekig is, geldt de kolom
///    "geconcentreerde belasting"; anders de (grotere) kolom "gelijkmatig
///    verdeeld".
pub fn cm_uit_momentenlijn(punten: &[(f64, f64)]) -> CmUitkomst {
    let mut p: Vec<(f64, f64)> = punten
        .iter()
        .copied()
        .filter(|(x, m)| x.is_finite() && m.is_finite())
        .collect();
    p.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    // Dubbele x-posities (bijvoorbeeld twee combinaties door elkaar) samenvoegen
    // op de grootste absolute waarde.
    p.dedup_by(|b, a| {
        if (a.0 - b.0).abs() <= 1e-9 {
            if b.1.abs() > a.1.abs() {
                a.1 = b.1;
            }
            true
        } else {
            false
        }
    });

    let m_max = p.iter().fold(0.0_f64, |m, q| m.max(q.1.abs()));
    if p.len() == 1 && m_max > 1e-12 {
        // Eén bemonsterd punt: van het verloop is niets bekend. Een constant
        // moment (ψ = 1) is dan de veilige aanname — de bovengrens van tabel
        // B.3 — en géén stilzwijgende 0,6.
        return CmUitkomst {
            cm: 1.0,
            rij: CmRij::Lineair,
            lastvorm: Lastvorm::Verdeeld,
            psi: 1.0,
            m_h_knm: p[0].1,
            m_s_knm: 0.0,
            alpha: 0.0,
            toelichting: format!(
                "tabel B.3: de momentenlijn is op één punt bemonsterd (M = {} kNm), dus het \
                 verloop is onbekend; aangehouden is een constant moment (rij 1, ψ = 1) met \
                 C_m = 1,0 — de bovengrens van de tabel.",
                nl(p[0].1, 2)
            ),
        };
    }
    if p.len() < 2 || m_max <= 1e-12 {
        return CmUitkomst {
            cm: 1.0,
            rij: CmRij::Lineair,
            lastvorm: Lastvorm::Verdeeld,
            psi: 1.0,
            m_h_knm: 0.0,
            m_s_knm: 0.0,
            alpha: 0.0,
            toelichting: "tabel B.3: geen buigend moment over dit veld, C_m = 1,0 aangehouden \
                          (rekent niet mee omdat de momentterm nul is)."
                .to_string(),
        };
    }

    let (x0, m1) = p[0];
    let (x1, m2) = p[p.len() - 1];
    let l = (x1 - x0).max(1e-9);
    // M_h is het eindmoment met de grootste absolute waarde; ψ het andere
    // gedeeld door M_h. Beide nul → ψ = 1 (rekent alleen in rij 3 mee, en daar
    // valt de ψ-term dan weg omdat α_h = 0).
    let (m_h, m_ander) = if m1.abs() >= m2.abs() { (m1, m2) } else { (m2, m1) };
    let psi = if m_h.abs() > 1e-12 * m_max.max(1.0) { m_ander / m_h } else { 1.0 };

    // Afwijking van de rechte lijn tussen de eindmomenten.
    let lineair_op = |x: f64| m1 + (m2 - m1) * (x - x0) / l;
    let afwijking: Vec<(f64, f64)> = p
        .iter()
        .map(|&(x, m)| ((x - x0) / l, m - lineair_op(x)))
        .collect();
    let d_max = afwijking.iter().fold(0.0_f64, |d, q| d.max(q.1.abs()));

    if d_max <= TOL_LINEAIR * m_max {
        let cm = cm_uniform_or_psi(psi);
        return CmUitkomst {
            cm,
            rij: CmRij::Lineair,
            lastvorm: Lastvorm::Verdeeld,
            psi,
            m_h_knm: m_h,
            m_s_knm: 0.0,
            alpha: 0.0,
            toelichting: format!(
                "tabel B.3, rij 1 (alleen eindmomenten, lineair verloop): M = {} kNm en ψ·M met \
                 ψ = {} → C_m = 0,6 + 0,4·ψ = {} (ondergrens 0,4).",
                nl(m_h, 2),
                nl(psi, 3),
                nl(cm, 3)
            ),
        };
    }

    // Tussenliggend extremum van de momentenlijn: helling wisselt van teken.
    let mut extremum: Option<(f64, f64)> = None;
    for i in 1..p.len() - 1 {
        let links = p[i].1 - p[i - 1].1;
        let rechts = p[i + 1].1 - p[i].1;
        let is_extremum = links * rechts < 0.0;
        if is_extremum {
            match extremum {
                Some((_, m)) if m.abs() >= p[i].1.abs() => {}
                _ => extremum = Some(p[i]),
            }
        }
    }

    // Lastvorm uit de vorm van de bolling.
    let lastvorm = lastvorm_uit_afwijking(&afwijking);

    let bereken = |m_s: f64| -> (f64, CmRij, f64) {
        if m_h.abs() > 1e-12 * m_max.max(1.0) && m_s.abs() <= m_h.abs() {
            // Rij 2: α_s = M_s/M_h.
            let a_s = m_s / m_h;
            let cm = if a_s >= 0.0 {
                0.2 + 0.8 * a_s
            } else if psi >= 0.0 {
                match lastvorm {
                    Lastvorm::Verdeeld => 0.1 - 0.8 * a_s,
                    Lastvorm::Geconcentreerd => -0.8 * a_s,
                }
            } else {
                match lastvorm {
                    Lastvorm::Verdeeld => 0.1 * (1.0 - psi) - 0.8 * a_s,
                    Lastvorm::Geconcentreerd => 0.2 * (-psi) - 0.8 * a_s,
                }
            };
            (cm.max(0.4), CmRij::Eindmomenten, a_s)
        } else {
            // Rij 3: α_h = M_h/M_s.
            let a_h = if m_s.abs() > 0.0 { m_h / m_s } else { 0.0 };
            let (basis, helling) = match lastvorm {
                Lastvorm::Verdeeld => (0.95, 0.05),
                Lastvorm::Geconcentreerd => (0.90, 0.10),
            };
            let cm = if a_h >= 0.0 || psi >= 0.0 {
                basis + helling * a_h
            } else {
                basis + helling * a_h * (1.0 + 2.0 * psi)
            };
            (cm, CmRij::Veldmoment, a_h)
        }
    };

    let last = match lastvorm {
        Lastvorm::Verdeeld => "gelijkmatig verdeelde belasting",
        Lastvorm::Geconcentreerd => "geconcentreerde belasting",
    };

    match extremum {
        Some((_, m_s)) => {
            let (cm, rij, alpha) = bereken(m_s);
            CmUitkomst {
                cm,
                rij,
                lastvorm,
                psi,
                m_h_knm: m_h,
                m_s_knm: m_s,
                alpha,
                toelichting: rij_toelichting(rij, m_h, psi, m_s, alpha, last, cm),
            }
        }
        None => {
            // Monotoon verloop met een bolling: tabel B.3 heeft er geen eigen
            // rij voor. Rij 1 (alleen de eindmomenten) negeert de bolling; die
            // kan het verloop juist gelijkmatiger maken en C_m dus hoger. Rij 2
            // met het GEMIDDELDE moment over het veld als M_s vangt dat op: voor
            // een zuiver lineair verloop is het gemiddelde ½(1 + ψ)·M_h en
            // geeft 0,2 + 0,8·α_s exact dezelfde 0,6 + 0,4·ψ als rij 1, en een
            // verloop dat lang bij M_h blijft hangen en pas aan het eind zakt
            // loopt naar α_s → 1 en C_m → 1. De grootste van beide is
            // aangehouden — de veilige kant.
            let mut opp = 0.0;
            for w in p.windows(2) {
                opp += 0.5 * (w[0].1 + w[1].1) * (w[1].0 - w[0].0);
            }
            let m_gem = opp / l;
            let (cm_gem, rij_gem, alpha_gem) = bereken(m_gem);
            let cm_lin = cm_uniform_or_psi(psi);
            let (cm, rij, alpha) = if cm_lin >= cm_gem {
                (cm_lin, CmRij::Lineair, 0.0)
            } else {
                (cm_gem, rij_gem, alpha_gem)
            };
            CmUitkomst {
                cm,
                rij,
                lastvorm,
                psi,
                m_h_knm: m_h,
                m_s_knm: m_gem,
                alpha,
                toelichting: format!(
                    "tabel B.3: de momentenlijn loopt monotoon van {} naar {} kNm maar wijkt van \
                     de rechte lijn af (grootste afwijking {} kNm); zo'n verloop heeft geen eigen \
                     rij. Aangehouden is de grootste van rij 1 (ψ = {}, C_m = {}) en rij 2 met \
                     het gemiddelde moment over het veld als veldmoment (M_s = {} kNm, α_s = {}, \
                     {last}, C_m = {}): C_m = {}.",
                    nl(m1, 2),
                    nl(m2, 2),
                    nl(d_max, 2),
                    nl(psi, 3),
                    nl(cm_lin, 3),
                    nl(m_gem, 2),
                    nl(alpha_gem, 3),
                    nl(cm_gem, 3),
                    nl(cm, 3)
                ),
            }
        }
    }
}

fn rij_toelichting(
    rij: CmRij,
    m_h: f64,
    psi: f64,
    m_s: f64,
    alpha: f64,
    last: &str,
    cm: f64,
) -> String {
    match rij {
        CmRij::Lineair => unreachable!("rij 1 heeft een eigen tekst"),
        CmRij::Eindmomenten => format!(
            "tabel B.3, rij 2 (eindmomenten met veldmoment, {last}): M_h = {} kNm, ψ = {}, \
             M_s = {} kNm, α_s = M_s/M_h = {} → C_m = {} (ondergrens 0,4).",
            nl(m_h, 2),
            nl(psi, 3),
            nl(m_s, 2),
            nl(alpha, 3),
            nl(cm, 3)
        ),
        CmRij::Veldmoment => format!(
            "tabel B.3, rij 3 (veldmoment groter dan de eindmomenten, {last}): M_s = {} kNm, \
             M_h = {} kNm, ψ = {}, α_h = M_h/M_s = {} → C_m = {}.",
            nl(m_s, 2),
            nl(m_h, 2),
            nl(psi, 3),
            nl(alpha, 3),
            nl(cm, 3)
        ),
    }
}

/// Verdeeld of geconcentreerd, uit de vorm van de afwijking `(ξ, d)` ten
/// opzichte van de rechte lijn. Een gelijkmatig verdeelde belasting geeft een
/// parabool `d_max·4ξ(1−ξ)`, een puntlast een driehoek met de top op de plaats
/// van de grootste afwijking. Alleen een duidelijk betere driehoekpassing
/// (kwadratensom kleiner dan de helft) telt als geconcentreerd; alles daartussen
/// krijgt de veilige kolom "gelijkmatig verdeeld".
fn lastvorm_uit_afwijking(afwijking: &[(f64, f64)]) -> Lastvorm {
    if afwijking.len() < 4 {
        return Lastvorm::Verdeeld;
    }
    let (xi_top, d_top) = afwijking
        .iter()
        .fold((0.5_f64, 0.0_f64), |acc, &(xi, d)| if d.abs() > acc.1.abs() { (xi, d) } else { acc });
    if d_top == 0.0 || xi_top <= 0.0 || xi_top >= 1.0 {
        return Lastvorm::Verdeeld;
    }
    let mut rss_par = 0.0;
    let mut rss_tri = 0.0;
    for &(xi, d) in afwijking {
        let par = d_top * 4.0 * xi * (1.0 - xi);
        let tri = if xi <= xi_top { d_top * xi / xi_top } else { d_top * (1.0 - xi) / (1.0 - xi_top) };
        rss_par += (d - par).powi(2);
        rss_tri += (d - tri).powi(2);
    }
    if rss_tri < 0.5 * rss_par {
        Lastvorm::Geconcentreerd
    } else {
        Lastvorm::Verdeeld
    }
}

/// De vier interactiefactoren met hun verantwoording.
#[derive(Clone, Debug)]
pub struct InteractionFactors {
    pub k_yy: f64,
    pub k_yz: f64,
    pub k_zy: f64,
    pub k_zz: f64,
    pub cm_y: f64,
    pub cm_z: f64,
    pub cm_lt: f64,
    /// `true` als k_zy uit tabel B.2 komt (staaf gevoelig voor vervormingen
    /// door torsie), `false` bij tabel B.1.
    pub torsiegevoelig: bool,
    /// Kanttekeningen voor het rapport: per C_m de rij van tabel B.3, en de
    /// tabel waaruit k_zy komt.
    pub toelichting: Vec<String>,
}

/// Interactiefactoren volgens bijlage B, tabel B.1 of B.2.
///
/// * `torsiegevoelig`: `true` voor een open doorsnede die kipt (χ_LT < 1). Dan
///   komt k_zy uit tabel B.2, met C_mLT. Gesloten doorsneden en staven die
///   niet kippen (χ_LT = 1) vallen onder tabel B.1.
/// * `is_class_1_or_2`: plastische (klasse 1, 2) of elastische (klasse 3, 4)
///   kolom van de tabellen.
///
/// Formules van tabel B.1 (klasse 1 en 2, I-profielen):
///   k_yy = C_my·(1 + (λ̄_y − 0,2)·n_y) ≤ C_my·(1 + 0,8·n_y)
///   k_zz = C_mz·(1 + (2λ̄_z − 0,6)·n_z) ≤ C_mz·(1 + 1,4·n_z)
///   k_yz = 0,6·k_zz;  k_zy = 0,6·k_yy
/// klasse 3 en 4:
///   k_yy = C_my·(1 + 0,6·λ̄_y·n_y) ≤ C_my·(1 + 0,6·n_y)
///   k_zz = C_mz·(1 + 0,6·λ̄_z·n_z) ≤ C_mz·(1 + 0,6·n_z)
///   k_yz = k_zz;  k_zy = 0,8·k_yy
/// Tabel B.2 vervangt alleen k_zy (klasse 1 en 2):
///   λ̄_z < 0,4:  k_zy = 0,6 + λ̄_z ≤ 1 − 0,1·λ̄_z·n_z/(C_mLT − 0,25)
///   λ̄_z ≥ 0,4:  k_zy = 1 − 0,1·λ̄_z·n_z/(C_mLT − 0,25) ≥ 1 − 0,1·n_z/(C_mLT − 0,25)
/// klasse 3 en 4:
///   k_zy = 1 − 0,05·λ̄_z·n_z/(C_mLT − 0,25) ≥ 1 − 0,05·n_z/(C_mLT − 0,25)
/// met n_y = N_Ed/(χ_y·N_Rk/γ_M1) en n_z = N_Ed/(χ_z·N_Rk/γ_M1).
///
/// De cel van tabel B.2 is in de beschikbare pdf-afdruk van de norm niet
/// leesbaar (lege tabelcel); de formules hierboven zijn de gepubliceerde
/// normformules zoals ook de basisaudit ze aanhaalt.
#[allow(clippy::too_many_arguments)]
pub fn interaction_factors_method_2(
    n_ed_kn: f64,
    n_b_rd_y_kn: f64,
    n_b_rd_z_kn: f64,
    lambda_bar_y: f64,
    lambda_bar_z: f64,
    cm_y: &CmUitkomst,
    cm_z: &CmUitkomst,
    cm_lt: &CmUitkomst,
    torsiegevoelig: bool,
    is_class_1_or_2: bool,
) -> InteractionFactors {
    let n_ratio_y = n_ed_kn / n_b_rd_y_kn;
    let n_ratio_z = n_ed_kn / n_b_rd_z_kn;
    let (cmy, cmz, cmlt) = (cm_y.cm, cm_z.cm, cm_lt.cm);

    let (k_yy, k_yz, k_zy_b1, k_zz) = if is_class_1_or_2 {
        let k_yy = (cmy * (1.0 + (lambda_bar_y - 0.2) * n_ratio_y)).min(cmy * (1.0 + 0.8 * n_ratio_y));
        let k_zz = (cmz * (1.0 + (2.0 * lambda_bar_z - 0.6) * n_ratio_z)).min(cmz * (1.0 + 1.4 * n_ratio_z));
        (k_yy, 0.6 * k_zz, 0.6 * k_yy, k_zz)
    } else {
        let k_yy = (cmy * (1.0 + 0.6 * lambda_bar_y * n_ratio_y)).min(cmy * (1.0 + 0.6 * n_ratio_y));
        let k_zz = (cmz * (1.0 + 0.6 * lambda_bar_z * n_ratio_z)).min(cmz * (1.0 + 0.6 * n_ratio_z));
        (k_yy, k_zz, 0.8 * k_yy, k_zz)
    };

    let mut toelichting = vec![
        format!("C_my {}", cm_y.toelichting),
        format!("C_mz {}", cm_z.toelichting),
    ];

    let k_zy = if torsiegevoelig {
        // Tabel B.2. C_mLT ≥ 0,4, dus de noemer is minstens 0,15.
        let noemer = cmlt - 0.25;
        let k = if is_class_1_or_2 {
            if lambda_bar_z < 0.4 {
                (0.6 + lambda_bar_z).min(1.0 - 0.1 * lambda_bar_z * n_ratio_z / noemer)
            } else {
                (1.0 - 0.1 * lambda_bar_z * n_ratio_z / noemer).max(1.0 - 0.1 * n_ratio_z / noemer)
            }
        } else {
            (1.0 - 0.05 * lambda_bar_z * n_ratio_z / noemer).max(1.0 - 0.05 * n_ratio_z / noemer)
        };
        toelichting.push(format!("C_mLT {}", cm_lt.toelichting));
        toelichting.push(format!(
            "k_zy volgens tabel B.2 (staaf gevoelig voor vervormingen door torsie: open doorsnede \
             met χ_LT < 1): {} met λ̄_z = {}, n_z = N_Ed/(χ_z·N_Rk/γ_M1) = {} en C_mLT = {} → \
             k_zy = {}. k_yy, k_yz en k_zz volgens tabel B.1.",
            if is_class_1_or_2 {
                if lambda_bar_z < 0.4 {
                    "k_zy = 0,6 + λ̄_z ≤ 1 − 0,1·λ̄_z·n_z/(C_mLT − 0,25)"
                } else {
                    "k_zy = 1 − 0,1·λ̄_z·n_z/(C_mLT − 0,25) ≥ 1 − 0,1·n_z/(C_mLT − 0,25)"
                }
            } else {
                "k_zy = 1 − 0,05·λ̄_z·n_z/(C_mLT − 0,25) ≥ 1 − 0,05·n_z/(C_mLT − 0,25)"
            },
            nl(lambda_bar_z, 3),
            nl(n_ratio_z, 3),
            nl(cmlt, 3),
            nl(k, 3)
        ));
        k
    } else {
        toelichting.push(format!(
            "k_ij volgens tabel B.1 (staaf niet gevoelig voor vervormingen door torsie): \
             k_zy = {}·k_yy = {}.",
            if is_class_1_or_2 { "0,6" } else { "0,8" },
            nl(k_zy_b1, 3)
        ));
        k_zy_b1
    };

    InteractionFactors { k_yy, k_yz, k_zy, k_zz, cm_y: cmy, cm_z: cmz, cm_lt: cmlt, torsiegevoelig, toelichting }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn lijn<F: Fn(f64) -> f64>(n: usize, l: f64, f: F) -> Vec<(f64, f64)> {
        (0..n)
            .map(|i| {
                let xi = i as f64 / (n - 1) as f64;
                (xi * l, f(xi))
            })
            .collect()
    }

    #[test]
    fn constant_moment_geeft_1_0() {
        let u = cm_uit_momentenlijn(&lijn(21, 4000.0, |_| 40.0));
        assert_eq!(u.rij, CmRij::Lineair);
        assert_relative_eq!(u.psi, 1.0);
        assert_relative_eq!(u.cm, 1.0);
    }

    #[test]
    fn dubbele_kromming_geeft_ondergrens_0_4() {
        let u = cm_uit_momentenlijn(&lijn(21, 4000.0, |xi| 40.0 * (1.0 - 2.0 * xi)));
        assert_eq!(u.rij, CmRij::Lineair);
        assert_relative_eq!(u.psi, -1.0, epsilon = 1e-12);
        assert_relative_eq!(u.cm, 0.4);
    }

    #[test]
    fn lineair_van_nul_naar_m_geeft_0_6() {
        let u = cm_uit_momentenlijn(&lijn(21, 4000.0, |xi| -100.0 * xi));
        assert_eq!(u.rij, CmRij::Lineair);
        assert_relative_eq!(u.psi, 0.0, epsilon = 1e-12);
        assert_relative_eq!(u.cm, 0.6);
    }

    #[test]
    fn parabool_zonder_eindmomenten_geeft_0_95() {
        let u = cm_uit_momentenlijn(&lijn(21, 4000.0, |xi| 4.0 * 40.0 * xi * (1.0 - xi)));
        assert_eq!(u.rij, CmRij::Veldmoment);
        assert_eq!(u.lastvorm, Lastvorm::Verdeeld);
        assert_relative_eq!(u.alpha, 0.0);
        assert_relative_eq!(u.cm, 0.95);
    }

    #[test]
    fn driehoek_zonder_eindmomenten_geeft_0_90() {
        let u = cm_uit_momentenlijn(&lijn(21, 4000.0, |xi| 40.0 * (1.0 - (2.0 * xi - 1.0).abs())));
        assert_eq!(u.rij, CmRij::Veldmoment);
        assert_eq!(u.lastvorm, Lastvorm::Geconcentreerd);
        assert_relative_eq!(u.cm, 0.90);
    }

    #[test]
    fn ingeklemde_ligger_onder_q_last() {
        // M(ξ) = q L²/12 · (−1 + 6ξ − 6ξ²): eindmomenten −1, veldmoment +0,5.
        let u = cm_uit_momentenlijn(&lijn(41, 6000.0, |xi| 100.0 * (-1.0 + 6.0 * xi - 6.0 * xi * xi)));
        assert_eq!(u.rij, CmRij::Eindmomenten);
        assert_relative_eq!(u.psi, 1.0, epsilon = 1e-9);
        assert_relative_eq!(u.alpha, -0.5, epsilon = 1e-9);
        // ψ ≥ 0, α_s < 0, verdeeld: 0,1 − 0,8·(−0,5) = 0,5.
        assert_relative_eq!(u.cm, 0.5, epsilon = 1e-9);
    }

    #[test]
    fn eindmomenten_met_klein_veldmoment_zelfde_teken() {
        // Eindmomenten −100/−100, veldmoment −80: α_s = 0,8 → 0,2 + 0,64 = 0,84.
        let u = cm_uit_momentenlijn(&lijn(21, 4000.0, |xi| -100.0 + 20.0 * 4.0 * xi * (1.0 - xi)));
        assert_eq!(u.rij, CmRij::Eindmomenten);
        assert_relative_eq!(u.alpha, 0.8, epsilon = 1e-9);
        assert_relative_eq!(u.cm, 0.84, epsilon = 1e-9);
    }

    #[test]
    fn monotoon_met_bolling_neemt_de_veilige_kant() {
        // Van 0 naar −100 met een bolling die het moment vermindert: het
        // gemiddelde is −50 + ⅔·20 = −36,7, α_s = 0,367 → 0,49; rij 1 geeft
        // 0,6 en wint.
        let u = cm_uit_momentenlijn(&lijn(201, 4000.0, |xi| -100.0 * xi + 20.0 * 4.0 * xi * (1.0 - xi)));
        assert_eq!(u.rij, CmRij::Lineair);
        assert_relative_eq!(u.cm, 0.6);
        // Bolling die het moment vergroot: gemiddelde −50 − 13,3 = −63,3,
        // α_s = 0,633 → 0,2 + 0,507 = 0,707 > 0,6; rij 2 wint.
        let u = cm_uit_momentenlijn(&lijn(201, 4000.0, |xi| -100.0 * xi - 20.0 * 4.0 * xi * (1.0 - xi)));
        assert_eq!(u.rij, CmRij::Eindmomenten);
        assert_relative_eq!(u.cm, 0.2 + 0.8 * (50.0 + 20.0 * 2.0 / 3.0) / 100.0, epsilon = 1e-4);
        // Een kleine knik vlak bij het begin (187,33 → 187,10 op 1 % van de
        // lengte → −126,68) is nagenoeg lineair: C_m blijft op de ondergrens
        // 0,4 en springt niet naar 1,0.
        let u = cm_uit_momentenlijn(&[(2402.0, 187.327), (2431.0, 187.1), (5000.0, -126.675)]);
        assert_relative_eq!(u.cm, 0.4);
    }

    #[test]
    fn een_punt_is_een_constant_moment() {
        let u = cm_uit_momentenlijn(&[(3000.0, 220.0)]);
        assert_eq!(u.rij, CmRij::Lineair);
        assert_relative_eq!(u.psi, 1.0);
        assert_relative_eq!(u.cm, 1.0);
        assert!(u.toelichting.contains("één punt"));
    }

    #[test]
    fn geen_moment_geeft_1_0_zonder_paniek() {
        let u = cm_uit_momentenlijn(&lijn(5, 1000.0, |_| 0.0));
        assert_relative_eq!(u.cm, 1.0);
        let u = cm_uit_momentenlijn(&[]);
        assert_relative_eq!(u.cm, 1.0);
    }

    /// HEA 200, S235, L = 4 m, N = 300 kN, constant M_y = 40 kNm — het
    /// meetgeval van basisaudit nr 7. λ̄_y = 0,5143, λ̄_z = 0,8534, N_b,Rd,y =
    /// 1109,84 kN, N_b,Rd,z = 794,84 kN, χ_LT = 0,893 < 1.
    #[test]
    fn hea200_constant_moment_tabel_b2() {
        let cm = cm_uit_momentenlijn(&lijn(21, 4000.0, |_| 40.0));
        let f = interaction_factors_method_2(
            300.0, 1109.8386545, 794.8358063, 0.5142950652, 0.8534402890,
            &cm, &cm, &cm, true, true,
        );
        // k_yy = 1,0·(1 + (0,5143 − 0,2)·0,2703) = 1,0850 ≤ 1,0·(1 + 0,8·0,2703) = 1,2162
        assert_relative_eq!(f.k_yy, 1.0850, epsilon = 1e-3);
        // k_zy = max(1 − 0,1·0,8534·0,3774/0,75; 1 − 0,1·0,3774/0,75) = max(0,9571; 0,9497)
        assert_relative_eq!(f.k_zy, 0.9571, epsilon = 1e-3);
        assert!(f.torsiegevoelig);
    }
}
