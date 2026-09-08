//! De toetsen als [`ResistanceCalc`]: formule, variabelen, waarde, unity
//! check en vindplaats, in hetzelfde contract als de staal- en houttoetsen.
//!
//! * [`check_bending_stress_block`] — art. 6.1 met de rechthoekige
//!   spanningsverdeling van 3.1.7(3): de klassieke handberekening.
//! * [`check_mn_kappa`] — art. 6.1 met het parabool-rechthoekdiagram van
//!   3.1.7(1): M_Rd(N_Ed) als grootste moment op het M-κ-diagram tot
//!   bezwijken, met de minimale excentriciteit van 6.1(4).

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

use crate::bending::{stress_block, StressBlockError};
use crate::deelstappen::{self, Betongegevens};
use crate::mnkappa::{
    axial_compression_capacity_kn, axial_tension_capacity_kn, mn_kappa_diagram, FailureMode,
    MnKappaDiagram, MnKappaOptions,
};
use crate::section::{RebarLayer, RectConcreteSection, ReinforcementCage};
use crate::stress_strain::DesignMaterial;

fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue { symbol: symbol.to_string(), value, unit: unit.to_string() }
}

fn status_for(uc: f64, applicable: bool) -> CheckStatus {
    if !applicable {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    }
}

/// Minimale excentriciteit voor gedrukte doorsneden, 6.1(4):
/// e₀ = h/30, maar niet kleiner dan 20 mm.
pub fn minimum_eccentricity_mm(h_mm: f64) -> f64 {
    (h_mm / 30.0).max(20.0)
}

/// Art. 6.1 — buiging met normaalkracht, rechthoekige spanningsverdeling
/// (3.1.7(3), vergelijkingen (3.19)–(3.22)).
///
/// De formule in het rapport: M_Rd = F_c·z_c + F_s1·z_s1 + F_s2·z_s2, met
/// s1 = onderwapening en s2 = bovenwapening (0 als afwezig), krachten in kN
/// (druk positief) en armen in m ten opzichte van het midden van de
/// doorsnede (positief naar de gedrukte rand). Zo vult de rapportage de
/// formule met getallen die ook dimensioneel op elkaar passen.
pub fn check_bending_stress_block(
    section: &RectConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let m_ed = force_state.forces.my_ed;
    let n_ed = force_state.forces.n_ed;
    let sign = if m_ed < 0.0 { -1.0 } else { 1.0 };
    let layers = cage.layers(section.h_mm);
    // De aannamen van de doorsnedevorm reizen met ELK resultaat mee. Bij een
    // rechthoek is dat niets; bij een T en een L de modelkeuze achter de
    // bandenintegratie, en bij een L bovendien dat de zijdelingse kromming
    // verhinderd wordt verondersteld. Zie `ConcreteSection::assumptions`.
    let mut notes: Vec<String> = section.assumptions();
    let mut variables = vec![
        nv("b", section.b_mm, "mm"),
        nv("h", section.h_mm, "mm"),
        nv("d", cage.d_mm(section.h_mm), "mm"),
        nv(r"f_{cd}", mat.f_cd(), "N/mm²"),
        nv(r"f_{yd}", mat.f_yd(), "N/mm²"),
        nv(r"\lambda", mat.lambda, "-"),
        nv(r"\eta", mat.eta, "-"),
        nv(r"A_{s1}", cage.a_s_bottom_mm2(), "mm²"),
        nv(r"A_{s2}", cage.a_s_top_mm2(), "mm²"),
    ];
    // Bij een T of L is `b` de flensbreedte; dan horen b_w en h_f er ook bij,
    // anders is de tabel niet na te rekenen. Bij een rechthoek blijft de
    // tabel letterlijk zoals hij was.
    if section.shape.has_flange() {
        variables.push(nv("b_w", section.b_w_mm(), "mm"));
        variables.push(nv("h_f", section.h_f_mm(), "mm"));
    }
    if n_ed.abs() > 1e-9 {
        notes.push(format!(
            "N_Ed = {n_ed:.1} kN is in het krachtenevenwicht meegenomen (druk negatief)."
        ));
    }
    if sign < 0.0 {
        notes.push("M_Ed < 0: drukzone aan de onderzijde, bovenwapening op trek.".to_string());
    }

    let article = "art. 6.1 en 3.1.7(3) (3.19–3.22)".to_string();
    let title = "Buiging — rechthoekige spanningsverdeling".to_string();
    let id = "6.1_bending_stress_block".to_string();

    // De gegevens waarmee de afleiding wordt uitgeschreven. Zij worden hier
    // alleen doorgegeven, niet opnieuw berekend: `deelstappen` beschrijft de
    // rekengang en verandert hem niet.
    let g = Betongegevens {
        section,
        cage,
        mat,
        layers: &layers,
        sign,
        n_ed_kn: n_ed,
        m_ed_knm: m_ed.abs(),
        m_y_ed_knm: m_ed,
    };

    match stress_block(section, &layers, mat, n_ed, sign) {
        Ok(r) => {
            // Lagen op label terugvinden: "onder …" = s1, "boven …" = s2.
            let (f_s1, z_s1, f_s2, z_s2) = {
                let mut f1 = 0.0;
                let mut z1 = 0.0;
                let mut f2 = 0.0;
                let mut z2 = 0.0;
                for l in &r.layers {
                    if l.label.starts_with("onder") {
                        f1 = l.f_kn;
                        z1 = l.z_m;
                    } else {
                        f2 = l.f_kn;
                        z2 = l.z_m;
                    }
                }
                (f1, z1, f2, z2)
            };
            variables.extend([
                nv("x", r.x_mm, "mm"),
                nv("F_c", r.f_c_kn, "kN"),
                nv("z_c", r.z_c_m, "m"),
                nv(r"F_{s1}", f_s1, "kN"),
                nv(r"z_{s1}", z_s1, "m"),
                nv(r"F_{s2}", f_s2, "kN"),
                nv(r"z_{s2}", z_s2, "m"),
            ]);
            // Welke breedte in de gesloten vorm hoort, hangt af van de vraag
            // of het blok binnen één band blijft. Bij een negatief moment
            // rekent `stress_block` op de omgeklapte doorsnede, dus die moet
            // hier ook worden bekeken — anders zou er bij een T de
            // flensbreedte staan waar het lijf wordt gedrukt.
            let werk = if sign < 0.0 { section.mirrored() } else { *section };
            match werk.uniform_top_width(r.lambda * r.x_mm) {
                Some(b) => notes.push(format!(
                    "F_c = η·f_cd·b·λ·x = {:.3}·{:.2}·{:.0}·{:.2}·{:.2} = {:.1} kN; x uit N_c + ΣF_s = −N_Ed.",
                    r.eta, mat.f_cd(), b, r.lambda, r.x_mm, r.f_c_kn
                )),
                None => {
                    let (a_blok, _) = werk.top_strip(r.lambda * r.x_mm);
                    notes.push(format!(
                        "Het spanningsblok van λ·x = {:.2} mm komt de flens uit: de drukkracht is \
                         over de werkelijke breedte b(z) geïntegreerd. F_c = η·f_cd·A_blok = \
                         {:.3}·{:.2}·{a_blok:.0} = {:.1} kN, met het zwaartepunt van A_blok op \
                         {:.1} mm onder de gedrukte rand; x uit N_c + ΣF_s = −N_Ed.",
                        r.lambda * r.x_mm,
                        r.eta,
                        mat.f_cd(),
                        r.f_c_kn,
                        section.h_mm / 2.0 - r.z_c_m * 1e3
                    ));
                }
            }
            for l in &r.layers {
                notes.push(format!(
                    "{}: ε_s = {:.2} ‰, σ_s = {:.1} N/mm²{}",
                    l.label,
                    l.eps * 1e3,
                    l.sigma,
                    if l.yields { " (vloeit)" } else { " (elastisch)" }
                ));
            }
            let m_rd = r.m_rd_knm;
            let uc = if m_rd > 0.0 { m_ed.abs() / m_rd } else { 0.0 };
            let applicable = m_ed.abs() > 1e-9;
            let mut stappen = deelstappen::spanningsblok_deelstappen(&g, &r);
            stappen.push(deelstappen::spanningsblok_unity_check(&g, m_rd));
            ResistanceCalc {
                id,
                title,
                article,
                force_state,
                formula_latex: r"M_{Rd} = F_c z_c + F_{s1} z_{s1} + F_{s2} z_{s2}".to_string(),
                variables,
                deelstappen: stappen,
                value: m_rd,
                unit: "kNm".to_string(),
                uc: Some(UnityCheck {
                    ed: m_ed.abs(),
                    rd: m_rd,
                    uc,
                    formula_latex: r"M_{Ed} / M_{Rd}".to_string(),
                }),
                status: status_for(uc, applicable),
                notes,
            }
        }
        Err(e) => {
            let reden = match e {
                StressBlockError::WhollyCompressed => {
                    "De doorsnede staat bij deze N_Ed geheel onder druk (x > h); de rechthoekige \
                     spanningsverdeling met ε_cu3 aan de rand is dan niet van toepassing. Zie de \
                     M-N-κ-toets (draaipunt C van figuur 6.1)."
                        .to_string()
                }
                StressBlockError::TensionCapacityExceeded => {
                    "N_Ed (trek) overschrijdt de trekcapaciteit van de wapening; geen evenwicht \
                     mogelijk. Zie de M-N-κ-toets."
                        .to_string()
                }
                StressBlockError::NoReinforcement => "Geen wapening in de doorsnede.".to_string(),
            };
            notes.push(reden.clone());
            ResistanceCalc {
                id,
                title,
                article,
                force_state,
                formula_latex: r"M_{Rd} = F_c z_c + F_{s1} z_{s1} + F_{s2} z_{s2}".to_string(),
                variables,
                deelstappen: deelstappen::spanningsblok_afgebroken(&g, &reden),
                value: 0.0,
                unit: "kNm".to_string(),
                uc: None,
                status: CheckStatus::NotApplicable,
                notes,
            }
        }
    }
}

/// Uitkomst van de M-N-κ-toets: de toets zelf plus het diagram waarop hij rust.
pub struct MnKappaCheck {
    pub calc: ResistanceCalc,
    pub diagram: MnKappaDiagram,
}

/// Art. 6.1 — moment-normaalkrachttoets met het parabool-rechthoekdiagram
/// (3.1.7(1), vergelijkingen (3.17)/(3.18)) en het bilineaire staaldiagram
/// (3.2.7): M_Rd(N_Ed) is het grootste moment op het M-κ-diagram bij N_Ed,
/// tot bezwijken volgens 6.1(3)–(6). Bij druk geldt de minimale
/// excentriciteit e₀ = max(h/30; 20 mm) van 6.1(4): M_Ed ≥ |N_Ed|·e₀.
pub fn check_mn_kappa(
    section: &RectConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    opts: &MnKappaOptions,
    apply_min_eccentricity: bool,
    force_state: ForceStateSnapshot,
) -> MnKappaCheck {
    let m_ed = force_state.forces.my_ed;
    let n_ed = force_state.forces.n_ed;
    let sign = if m_ed < 0.0 { -1.0 } else { 1.0 };
    let layers: Vec<RebarLayer> = cage.layers(section.h_mm);
    let diagram = mn_kappa_diagram(section, &layers, mat, n_ed, sign, opts);

    // Idem: de vormaannamen staan in elk resultaat.
    let mut notes: Vec<String> = section.assumptions();
    let e0 = minimum_eccentricity_mm(section.h_mm);
    let mut m_ed_eff = m_ed.abs();
    // `None` zolang 6.1(4) het toetsmoment niet heeft opgetild; de afleiding
    // krijgt e₀ alleen te zien als die grens werkelijk bindend was.
    let mut e0_bindend: Option<f64> = None;
    if apply_min_eccentricity && n_ed < 0.0 {
        let m_min = n_ed.abs() * e0 * 1e-3;
        if m_min > m_ed_eff {
            notes.push(format!(
                "6.1(4): minimale excentriciteit e₀ = max(h/30; 20 mm) = {e0:.1} mm → M_Ed ≥ |N_Ed|·e₀ = {m_min:.2} kNm (was {:.2} kNm).",
                m_ed.abs()
            ));
            m_ed_eff = m_min;
            e0_bindend = Some(e0);
        }
    }
    notes.push(format!(
        "Betonspanning geïntegreerd over {} stroken (parabool-rechthoek, n = {:.2}, ε_c2 = {:.1} ‰, ε_cu2 = {:.1} ‰); staal {}.",
        diagram.n_strips,
        mat.concrete.n,
        mat.concrete.eps_c2 * 1e3,
        mat.concrete.eps_cu2 * 1e3,
        match mat.steel.branch {
            crate::stress_strain::SteelBranch::Horizontal => "bilineair met horizontale bovenste tak (3.2.7(2)b)".to_string(),
            crate::stress_strain::SteelBranch::Inclined => format!(
                "bilineair met hellende bovenste tak tot k·f_yk/γ_S = {:.1} N/mm² bij ε_uk (3.2.7(2)a), ε_ud = {:.1} ‰",
                mat.steel.f_ud_inclined,
                mat.steel.eps_ud * 1e3
            ),
        }
    ));
    if sign < 0.0 {
        notes.push("M_Ed < 0: drukzone aan de onderzijde, bovenwapening op trek.".to_string());
    }

    let mut variables = vec![
        nv(r"N_{Ed}", n_ed, "kN"),
        nv(r"M_{Ed}", m_ed_eff, "kNm"),
        nv("b", section.b_mm, "mm"),
        nv("h", section.h_mm, "mm"),
        nv(r"f_{cd}", mat.f_cd(), "N/mm²"),
        nv(r"f_{yd}", mat.f_yd(), "N/mm²"),
        nv(r"A_{s1}", cage.a_s_bottom_mm2(), "mm²"),
        nv(r"A_{s2}", cage.a_s_top_mm2(), "mm²"),
        nv(r"n_{stroken}", diagram.n_strips as f64, "-"),
    ];
    if section.shape.has_flange() {
        variables.push(nv("b_w", section.b_w_mm(), "mm"));
        variables.push(nv("h_f", section.h_f_mm(), "mm"));
    }

    let article = "art. 6.1 en 3.1.7(1) (3.17)".to_string();
    let title = "Moment-normaalkracht (M-N-κ)".to_string();
    let id = "6.1_mn_kappa".to_string();
    let formula = r"M_{Rd} = \max_{\kappa} M(\kappa; N_{Ed})".to_string();

    // Zie de opmerking bij `check_bending_stress_block`: alleen doorgeven.
    let g = Betongegevens {
        section,
        cage,
        mat,
        layers: &layers,
        sign,
        n_ed_kn: n_ed,
        m_ed_knm: m_ed_eff,
        m_y_ed_knm: m_ed,
    };

    if diagram.failure_mode == FailureMode::AxialCapacityExceeded
        || diagram.failure_mode == FailureMode::NoEquilibrium
    {
        // Geen momentweerstand bij deze normaalkracht: toets op N.
        let n_rd = if n_ed < 0.0 {
            axial_compression_capacity_kn(section, &layers, mat, opts)
        } else {
            axial_tension_capacity_kn(&layers, mat)
        };
        let uc = if n_rd > 0.0 { n_ed.abs() / n_rd } else { f64::INFINITY };
        variables.push(nv(r"N_{Rd}", n_rd, "kN"));
        let reden = if n_ed < 0.0 {
            format!(
                "Geen evenwicht bij κ = 0: |N_Ed| = {:.1} kN overschrijdt de drukcapaciteit N_Rd = f_cd·A_c + ΣA_s·σ_s(ε_c2) = {n_rd:.1} kN (6.1(4)).",
                n_ed.abs()
            )
        } else {
            format!(
                "Geen evenwicht bij κ = 0: N_Ed = {n_ed:.1} kN overschrijdt de trekcapaciteit N_Rd = ΣA_s·σ_s(ε_ud) = {n_rd:.1} kN."
            )
        };
        notes.push(reden.clone());
        return MnKappaCheck {
            calc: ResistanceCalc {
                id,
                title,
                article,
                force_state,
                formula_latex: formula,
                variables,
                deelstappen: deelstappen::mn_kappa_afgebroken(&g, n_rd, reden),
                value: 0.0,
                unit: "kNm".to_string(),
                uc: Some(UnityCheck {
                    ed: n_ed.abs(),
                    rd: n_rd,
                    uc,
                    formula_latex: r"N_{Ed} / N_{Rd}".to_string(),
                }),
                status: CheckStatus::NotOk,
                notes,
            },
            diagram,
        };
    }

    let m_rd = diagram.m_max_knm;
    variables.extend([
        nv(r"\kappa_u", diagram.kappa_u_per_m * 1e3, "10⁻³/m"),
        nv("x_u", diagram.x_u_mm, "mm"),
        nv(r"\varepsilon_{c,u}", diagram.eps_c_u * 1e3, "‰"),
        nv(r"\varepsilon_{s,u}", diagram.eps_s_u * 1e3, "‰"),
        nv("M_u", diagram.m_u_knm, "kNm"),
    ]);
    if let (Some(ky), Some(my)) = (diagram.kappa_y_per_m, diagram.m_y_knm) {
        variables.push(nv(r"\kappa_y", ky * 1e3, "10⁻³/m"));
        variables.push(nv("M_y", my, "kNm"));
    }
    notes.push(match diagram.failure_mode {
        FailureMode::ConcreteCrushing => format!(
            "Bezwijken door het beton: ε_c = {:.2} ‰ bij κ_u = {:.2}·10⁻³/m, x_u = {:.0} mm (6.1(3)).",
            diagram.eps_c_u * 1e3,
            diagram.kappa_u_per_m * 1e3,
            diagram.x_u_mm
        ),
        FailureMode::SteelRupture => format!(
            "Bezwijken door het staal: ε_s = {:.1} ‰ = ε_ud bij κ_u = {:.2}·10⁻³/m (3.2.7(2)a).",
            diagram.eps_s_u * 1e3,
            diagram.kappa_u_per_m * 1e3
        ),
        FailureMode::SteelStrainLimit => format!(
            "Diagram beëindigd bij ε_s = ε_ud = {:.1} ‰ (κ_u = {:.2}·10⁻³/m); de horizontale tak van 3.2.7(2)b kent zelf geen rekgrens, het beton was nog niet bezweken (ε_c = {:.2} ‰).",
            diagram.eps_s_u * 1e3,
            diagram.kappa_u_per_m * 1e3,
            diagram.eps_c_u * 1e3
        ),
        _ => String::new(),
    });
    let uc = if m_rd > 0.0 { m_ed_eff / m_rd } else { f64::INFINITY };
    let applicable = m_ed_eff > 1e-9 || n_ed.abs() > 1e-9;
    let stappen = deelstappen::mn_kappa_deelstappen(&g, &diagram, opts, e0_bindend);
    MnKappaCheck {
        calc: ResistanceCalc {
            id,
            title,
            article,
            force_state,
            formula_latex: formula,
            variables,
            deelstappen: stappen,
            value: m_rd,
            unit: "kNm".to_string(),
            uc: Some(UnityCheck {
                ed: m_ed_eff,
                rd: m_rd,
                uc,
                formula_latex: r"M_{Ed} / M_{Rd}".to_string(),
            }),
            status: status_for(uc, applicable),
            notes,
        },
        diagram,
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

    fn snap(n: f64, m: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 1,
            position_mm: 2500.0,
            forces: InternalForces { n_ed: n, my_ed: m, ..Default::default() },
        }
    }

    fn opzet() -> (RectConcreteSection, ReinforcementCage, DesignMaterial) {
        (
            RectConcreteSection::new(300.0, 500.0),
            ReinforcementCage {
                cover_mm: 30.0,
                stirrup_diameter_mm: 8.0,
                top: RebarRow { count: 0, diameter_mm: 12.0 },
                bottom: RebarRow { count: 3, diameter_mm: 16.0 },
                ..ReinforcementCage::default()
            },
            DesignMaterial::new(
                concrete_class_by_name("C30/37").unwrap(),
                reinforcement_grade_by_name("B500B").unwrap(),
                DesignSituation::PersistentTransient,
                SteelBranch::Horizontal,
            ),
        )
    }

    #[test]
    fn buigtoets_uc_en_status() {
        let (s, k, m) = opzet();
        let r = check_bending_stress_block(&s, &k, &m, snap(0.0, 100.0));
        assert_relative_eq!(r.value, 113.33, max_relative = 1e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 100.0 / 113.33, max_relative = 1e-3);
        assert_eq!(r.status, CheckStatus::Ok);
        // Negatief moment zonder bovenwapening: de enige laag (3Ø16) ligt
        // vlak bij de gedrukte rand en levert een kleine weerstand → NotOk.
        let r = check_bending_stress_block(&s, &k, &m, snap(0.0, -120.0));
        assert_eq!(r.status, CheckStatus::NotOk);
        assert!(r.value < 20.0);
    }

    #[test]
    fn minimale_excentriciteit_wordt_toegepast() {
        let (s, k, m) = opzet();
        assert_relative_eq!(minimum_eccentricity_mm(500.0), 20.0);
        assert_relative_eq!(minimum_eccentricity_mm(900.0), 30.0);
        let r = check_mn_kappa(&s, &k, &m, &MnKappaOptions { n_strips: 20 }, true, snap(-500.0, 2.0));
        // M_Ed,eff = 500 · 0,020 = 10 kNm.
        assert_relative_eq!(r.calc.uc.as_ref().unwrap().ed, 10.0, max_relative = 1e-9);
        assert!(r.calc.notes.iter().any(|n| n.contains("6.1(4)")));
    }

    #[test]
    fn overschreden_drukcapaciteit_toetst_op_n() {
        let (s, k, m) = opzet();
        let r = check_mn_kappa(&s, &k, &m, &MnKappaOptions { n_strips: 20 }, true, snap(-5000.0, 0.0));
        assert_eq!(r.calc.status, CheckStatus::NotOk);
        assert_eq!(r.calc.uc.as_ref().unwrap().formula_latex, r"N_{Ed} / N_{Rd}");
        assert!(r.calc.uc.as_ref().unwrap().uc > 1.0);
    }
}
