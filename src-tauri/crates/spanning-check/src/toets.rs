//! De toetsing zelf: snedekrachten → spanningen → vergelijkspanning → UC.
//!
//! # De formules
//!
//! Per station van de envelop en per vezel over de hoogte (z vanaf de
//! bovenkant, z_c de zwaartelijn):
//!
//! ```text
//!   σ_x(z) = N_Ed / A  +  M_y,Ed · (z − z_c) / I_y          [N/mm²]
//!   τ(z)   = V_z,Ed · S(z) / ( I_y · b(z) )                 [N/mm²]
//!   σ_z    = door de gebruiker opgegeven, constant          [N/mm²]
//!   σ_eq   = √( σ_x² + σ_z² − σ_x·σ_z + 3·τ² )              [N/mm²]
//!   UC     = σ_eq,max / f_d      met f_d = f_toel / γ_M
//! ```
//!
//! # Waarom de kruisterm −σ_x·σ_z erin staat
//!
//! De vergelijkspanning is de vlakke-spanningsvorm van het criterium van von
//! Mises (Huber–Hencky). Voor een vlakke spanningstoestand (σ_y = τ_xz =
//! τ_yz = 0) luidt die voluit
//!
//! ```text
//!   σ_eq = √( σ_x² + σ_z² − σ_x·σ_z + 3·τ² )
//! ```
//!
//! De kruisterm −σ_x·σ_z hoort erbij: zonder die term zou een gelijkmatige
//! alzijdige trek (σ_x = σ_z) een vergelijkspanning √2·σ opleveren, terwijl
//! von Mises daar σ geeft. Weglaten is dus niet "veilig vereenvoudigd" maar
//! gewoon een ander criterium.
//!
//! Bij σ_z = 0 — de gewone situatie voor een staaf, want een staafelement
//! kent alleen N, V en M — vereenvoudigt de formule tot
//!
//! ```text
//!   σ_eq = √( σ_x² + 3·τ² )
//! ```
//!
//! en dat is precies de vorm die NEN-EN 1993-1-1 in 6.2.1(5) geeft. Deze
//! toets is verder GEEN normtoetsing: er is geen doorsnedeklassificatie, geen
//! knik-, kip- of doorbuigingstoets en geen materiaalnorm. De toelaatbare
//! spanning komt volledig van de gebruiker.
//!
//! # Zuivere afschuiving
//!
//! Uit dezelfde formule volgt met σ_x = σ_z = 0 dat zuivere afschuiving de
//! grens bereikt bij τ = f_d/√3. Die waarde is de rekenwaarde van de
//! schuiftoets hieronder — geen extra aanname, maar hetzelfde criterium.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};
use steel_check::{CheckKind, NamedCheck};

use crate::doorsnede::{maak_doorsnede, Doorsnedegegevens, Vezelpositie};
use crate::input::SpanningBeamCheckInput;
use crate::result::{
    SpanningBeamCheckResult, SpanningDoorsnedeResultaat, SpanningVerloop, SpanningVezel,
};

/// Vergelijkspanning volgens von Mises voor een vlakke spanningstoestand.
/// Zie de moduledocumentatie voor de onderbouwing van de kruisterm.
pub fn sigma_eq(sigma_x: f64, sigma_z: f64, tau: f64) -> f64 {
    (sigma_x * sigma_x - sigma_x * sigma_z + sigma_z * sigma_z + 3.0 * tau * tau).max(0.0).sqrt()
}

/// Eén beoordeeld rekenpunt: plaats langs de staaf én hoogte in de doorsnede.
#[derive(Clone, Copy, Debug)]
struct Punt {
    combination_id: u32,
    position_mm: f64,
    forces: InternalForces,
    z_mm: f64,
    breedte_mm: f64,
    s_mm3: f64,
    sigma_x: f64,
    tau: f64,
    sigma_eq: f64,
}

impl Punt {
    fn snapshot(&self) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: self.combination_id,
            position_mm: self.position_mm,
            forces: self.forces,
        }
    }
}

fn spanningen_in(
    p: &ForcePoint,
    v: &Vezelpositie,
    d: &Doorsnedegegevens,
    sigma_z: f64,
) -> Punt {
    let s = d.model.s_boven_mm3(v.z_mm);
    // N in kN → N; M in kNm → N·mm; V in kN → N.
    let sigma_n = if d.a_mm2 > 0.0 { p.forces.n_ed * 1e3 / d.a_mm2 } else { 0.0 };
    let sigma_m = if d.iy_mm4 > 0.0 {
        p.forces.my_ed * 1e6 * (v.z_mm - d.model.z_c_mm) / d.iy_mm4
    } else {
        0.0
    };
    let sigma_x = sigma_n + sigma_m;
    let tau = if d.iy_mm4 > 0.0 && v.breedte_mm > 0.0 {
        (p.forces.vz_ed * 1e3).abs() * s / (d.iy_mm4 * v.breedte_mm)
    } else {
        0.0
    };
    Punt {
        combination_id: p.combination_id,
        position_mm: p.position_mm,
        forces: p.forces,
        z_mm: v.z_mm,
        breedte_mm: v.breedte_mm,
        s_mm3: s,
        sigma_x,
        tau,
        sigma_eq: sigma_eq(sigma_x, sigma_z, tau),
    }
}

/// Toets één staaf.
pub fn check_spanning_beam(input: SpanningBeamCheckInput) -> SpanningBeamCheckResult {
    let doorsnede = match maak_doorsnede(&input.section) {
        Ok(d) => d,
        Err(fout) => return leeg_resultaat(&input, fout),
    };
    if !(input.f_toel_mpa > 0.0) {
        return leeg_resultaat(
            &input,
            format!(
                "de toelaatbare spanning is {} N/mm² — vul een positieve waarde in",
                input.f_toel_mpa
            ),
        );
    }
    if !(input.gamma_m > 0.0) {
        return leeg_resultaat(
            &input,
            format!("de materiaalfactor γ_M is {} — vul een positieve waarde in", input.gamma_m),
        );
    }

    let f_d = input.f_toel_mpa / input.gamma_m;
    let f_vd = f_d / 3f64.sqrt();
    let sigma_z = input.sigma_z_mpa;
    let vezels = doorsnede.model.vezels(input.fiber_count.max(3) as usize);

    // Eén doorgang over alle stations × vezels; drie uitersten bijhouden.
    let mut best_eq: Option<Punt> = None;
    let mut best_sigma: Option<Punt> = None;
    let mut best_tau: Option<Punt> = None;
    let mut ander_moment = false;
    let mut torsie = false;
    for fp in &input.forces_envelope {
        if fp.forces.mz_ed.abs() > 1e-9 || fp.forces.vy_ed.abs() > 1e-9 {
            ander_moment = true;
        }
        if fp.forces.mt_ed.abs() > 1e-9 {
            torsie = true;
        }
        for v in &vezels {
            let punt = spanningen_in(fp, v, &doorsnede, sigma_z);
            if best_eq.map_or(true, |b| punt.sigma_eq > b.sigma_eq) {
                best_eq = Some(punt);
            }
            if best_sigma.map_or(true, |b| punt.sigma_x.abs() > b.sigma_x.abs()) {
                best_sigma = Some(punt);
            }
            if best_tau.map_or(true, |b| punt.tau > b.tau) {
                best_tau = Some(punt);
            }
        }
    }

    let (Some(eq), Some(sx), Some(tv)) = (best_eq, best_sigma, best_tau) else {
        return leeg_resultaat(
            &input,
            "geen krachtsverloop en geen vezels om op te rekenen".to_string(),
        );
    };

    let checks = vec![
        NamedCheck {
            id: "spanning_vergelijk".to_string(),
            kind: CheckKind::Resistance(toets_vergelijkspanning(&eq, sigma_z, f_d, &input)),
        },
        NamedCheck {
            id: "spanning_normaal".to_string(),
            kind: CheckKind::Resistance(toets_normaalspanning(&sx, &doorsnede, f_d)),
        },
        NamedCheck {
            id: "spanning_schuif".to_string(),
            kind: CheckKind::Resistance(toets_schuifspanning(&tv, &doorsnede, f_vd, f_d)),
        },
    ];

    let mut uc_max = 0.0;
    let mut governing = String::new();
    for c in &checks {
        let CheckKind::Resistance(r) = &c.kind else { continue };
        if let Some(u) = &r.uc {
            if u.uc > uc_max {
                uc_max = u.uc;
                governing = c.id.clone();
            }
        }
    }
    if governing.is_empty() {
        governing = "spanning_vergelijk".to_string();
    }

    // Het verloop bij de maatgevende snede.
    let maatgevend = ForcePoint {
        combination_id: eq.combination_id,
        position_mm: eq.position_mm,
        forces: eq.forces,
    };
    let verloop_vezels: Vec<SpanningVezel> = vezels
        .iter()
        .map(|v| {
            let p = spanningen_in(&maatgevend, v, &doorsnede, sigma_z);
            SpanningVezel {
                z_mm: p.z_mm,
                breedte_mm: p.breedte_mm,
                s_mm3: p.s_mm3,
                sigma_x_mpa: p.sigma_x,
                tau_mpa: p.tau,
                sigma_eq_mpa: p.sigma_eq,
            }
        })
        .collect();

    let mut notes = vec![
        "Vrije spanningstoets: geen materiaalnorm, geen doorsnedeklassificatie en \
         geen knik-, kip- of doorbuigingstoets. De toelaatbare spanning is door de \
         gebruiker opgegeven."
            .to_string(),
        "De vergelijkspanning is de vlakke-spanningsvorm van von Mises: \
         σ_eq = √(σ_x² + σ_z² − σ_x·σ_z + 3·τ²). Bij σ_z = 0 vereenvoudigt die tot \
         σ_eq = √(σ_x² + 3·τ²) — de vorm van NEN-EN 1993-1-1 6.2.1(5)."
            .to_string(),
    ];
    if sigma_z.abs() > 1e-12 {
        notes.push(format!(
            "σ_z = {sigma_z} N/mm² is als constante dwarsspanning over de hele doorsnede \
             meegenomen (bijvoorbeeld een oplegdruk). Het staafmodel berekent σ_z niet \
             zelf: een staafelement kent alleen N, V en M."
        ));
    }
    if ander_moment {
        notes.push(
            "In de envelop staan een dwarskracht V_y en/of een moment M_z om de zwakke as. \
             Die zijn NIET in de spanningen verwerkt: deze toets rekent op buiging om de \
             sterke as."
                .to_string(),
        );
    }
    if torsie {
        notes.push(
            "In de envelop staat een torsiemoment M_t. Torsieschuifspanningen zijn NIET \
             in de vergelijkspanning verwerkt."
                .to_string(),
        );
    }
    notes.extend(doorsnede.notities.iter().cloned());

    let hoogte = doorsnede.model.hoogte_mm;
    let z_c = doorsnede.model.z_c_mm;
    let wel_top = if z_c > 0.0 { doorsnede.iy_mm4 / z_c } else { 0.0 };
    let wel_bot = if hoogte - z_c > 0.0 { doorsnede.iy_mm4 / (hoogte - z_c) } else { 0.0 };

    SpanningBeamCheckResult {
        beam_id: input.beam_id,
        section_name: doorsnede.naam.clone(),
        material_name: input.material_name.clone(),
        f_toel_mpa: input.f_toel_mpa,
        gamma_m: input.gamma_m,
        f_d_mpa: f_d,
        checks,
        uc_max,
        status: if uc_max <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        governing_check_id: governing,
        section: SpanningDoorsnedeResultaat {
            naam: doorsnede.naam,
            hoogte_mm: hoogte,
            breedte_max_mm: doorsnede.model.breedte_max_mm,
            z_c_mm: z_c,
            a_mm2: doorsnede.a_mm2,
            iy_mm4: doorsnede.iy_mm4,
            wel_top_mm3: wel_top,
            wel_bot_mm3: wel_bot,
            bron: doorsnede.bron,
            lagen: doorsnede.model.lagen,
        },
        verloop: Some(SpanningVerloop {
            combination_id: eq.combination_id,
            position_mm: eq.position_mm,
            n_ed_kn: eq.forces.n_ed,
            vz_ed_kn: eq.forces.vz_ed,
            my_ed_knm: eq.forces.my_ed,
            sigma_z_mpa: sigma_z,
            vezels: verloop_vezels,
            z_maatgevend_mm: eq.z_mm,
        }),
        notes,
    }
}

/// Alle staven achter elkaar — spiegel van `check_all_beams` in `steel-check`.
pub fn check_all_spanning_beams(
    inputs: Vec<SpanningBeamCheckInput>,
) -> Vec<SpanningBeamCheckResult> {
    inputs.into_iter().map(check_spanning_beam).collect()
}

fn toets_vergelijkspanning(
    p: &Punt,
    sigma_z: f64,
    f_d: f64,
    input: &SpanningBeamCheckInput,
) -> ResistanceCalc {
    let uc = if f_d > 0.0 { p.sigma_eq / f_d } else { 0.0 };
    ResistanceCalc {
        deelstappen: Vec::new(),
        id: "spanning_vergelijk".to_string(),
        title: "Vergelijkspanning (von Mises)".to_string(),
        article: "vrije spanningstoets".to_string(),
        force_state: p.snapshot(),
        formula_latex: r"\sigma_{eq} = \sqrt{\sigma_x^2 + \sigma_z^2 - \sigma_x \sigma_z + 3 \tau^2}"
            .to_string(),
        variables: vec![
            nv(r"\sigma_x", p.sigma_x, "N/mm²"),
            nv(r"\sigma_z", sigma_z, "N/mm²"),
            nv(r"\tau", p.tau, "N/mm²"),
            nv("z", p.z_mm, "mm"),
            nv(r"f_{toel}", input.f_toel_mpa, "N/mm²"),
            nv(r"\gamma_M", input.gamma_m, "-"),
            nv("f_d", f_d, "N/mm²"),
        ],
        value: p.sigma_eq,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: p.sigma_eq,
            rd: f_d,
            uc,
            formula_latex: r"\sigma_{eq} / f_d".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![format!(
            "Maatgevend op x = {:.0} mm, vezel z = {:.1} mm vanaf de bovenkant \
             (combinatie {}).",
            p.position_mm, p.z_mm, p.combination_id
        )],
    }
}

fn toets_normaalspanning(p: &Punt, d: &Doorsnedegegevens, f_d: f64) -> ResistanceCalc {
    let uc = if f_d > 0.0 { p.sigma_x.abs() / f_d } else { 0.0 };
    ResistanceCalc {
        deelstappen: Vec::new(),
        id: "spanning_normaal".to_string(),
        title: "Normaalspanning σ_x".to_string(),
        article: "vrije spanningstoets".to_string(),
        force_state: p.snapshot(),
        formula_latex:
            r"\sigma_x = \frac{N_{Ed}}{A} + \frac{M_{y,Ed} \cdot (z - z_c)}{I_y}".to_string(),
        variables: vec![
            nv("N_{Ed}", p.forces.n_ed * 1e3, "N"),
            nv("A", d.a_mm2, "mm²"),
            nv("M_{y,Ed}", p.forces.my_ed * 1e6, "N·mm"),
            nv("z", p.z_mm, "mm"),
            nv("z_c", d.model.z_c_mm, "mm"),
            nv("I_y", d.iy_mm4, "mm⁴"),
        ],
        value: p.sigma_x,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: p.sigma_x.abs(),
            rd: f_d,
            uc,
            formula_latex: r"|\sigma_x| / f_d".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![
            "Trek positief. z wordt vanaf de bovenkant van de doorsnede gemeten; \
             M_y positief geeft trek in de onderste vezel."
                .to_string(),
        ],
    }
}

fn toets_schuifspanning(p: &Punt, d: &Doorsnedegegevens, f_vd: f64, f_d: f64) -> ResistanceCalc {
    let uc = if f_vd > 0.0 { p.tau / f_vd } else { 0.0 };
    ResistanceCalc {
        deelstappen: Vec::new(),
        id: "spanning_schuif".to_string(),
        title: "Schuifspanning τ".to_string(),
        article: "vrije spanningstoets".to_string(),
        force_state: p.snapshot(),
        formula_latex: r"\tau = \frac{V_{z,Ed} \cdot S(z)}{I_y \cdot b(z)}".to_string(),
        variables: vec![
            nv("V_{z,Ed}", p.forces.vz_ed.abs() * 1e3, "N"),
            nv("S(z)", p.s_mm3, "mm³"),
            nv("I_y", d.iy_mm4, "mm⁴"),
            nv("b(z)", p.breedte_mm, "mm"),
            nv("z", p.z_mm, "mm"),
            nv("f_d", f_d, "N/mm²"),
        ],
        value: p.tau,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: p.tau,
            rd: f_vd,
            uc,
            formula_latex: r"\tau / f_{v,d}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![format!(
            "Zuivere afschuiving bereikt de vergelijkspanning bij τ = f_d/√3; \
             daarom f_v,d = {f_vd:.2} N/mm². Formule van Jourawski, met S(z) het \
             statisch moment van het deel bóven z om de zwaartelijn."
        )],
    }
}

fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue { symbol: symbol.to_string(), value, unit: unit.to_string() }
}

/// Resultaat zonder toetsen, met de reden expliciet in `notes` — dezelfde
/// aanpak als de CLT-kern: liever een zichtbare melding dan een stille nul.
fn leeg_resultaat(input: &SpanningBeamCheckInput, reden: String) -> SpanningBeamCheckResult {
    SpanningBeamCheckResult {
        beam_id: input.beam_id,
        section_name: "—".to_string(),
        material_name: input.material_name.clone(),
        f_toel_mpa: input.f_toel_mpa,
        gamma_m: input.gamma_m,
        f_d_mpa: if input.gamma_m > 0.0 { input.f_toel_mpa / input.gamma_m } else { 0.0 },
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: String::new(),
        section: SpanningDoorsnedeResultaat {
            naam: "—".to_string(),
            hoogte_mm: 0.0,
            breedte_max_mm: 0.0,
            z_c_mm: 0.0,
            a_mm2: 0.0,
            iy_mm4: 0.0,
            wel_top_mm3: 0.0,
            wel_bot_mm3: 0.0,
            bron: "—".to_string(),
            lagen: vec![],
        },
        verloop: None,
        notes: vec![format!("Niet getoetst: {reden}.")],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn von_mises_vereenvoudigt_bij_sigma_z_nul() {
        assert_relative_eq!(sigma_eq(100.0, 0.0, 0.0), 100.0);
        assert_relative_eq!(sigma_eq(0.0, 0.0, 10.0), 3f64.sqrt() * 10.0, max_relative = 1e-12);
        assert_relative_eq!(
            sigma_eq(60.0, 0.0, 40.0),
            (60.0f64 * 60.0 + 3.0 * 40.0 * 40.0).sqrt(),
            max_relative = 1e-12
        );
        // Alzijdige trek: de kruisterm zorgt dat σ_eq = σ, niet √2·σ.
        assert_relative_eq!(sigma_eq(50.0, 50.0, 0.0), 50.0, max_relative = 1e-12);
    }
}
