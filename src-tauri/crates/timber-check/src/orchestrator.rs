//! Orchestrator: neem TimberBeamCheckInput, voer alle EN 1995-toetsen uit,
//! lever TimberBeamCheckResult met volledige afleiding.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use nen_en_1993_1_1_stability::StabilityCalc;
use nen_en_1995_1_1::stability::{
    check_beam_stability, check_column_stability, effective_length_mm, BeamStabilityInput,
    ColumnStabilityInput,
};
use nen_en_1995_1_1::{
    bending, beta_c, compression, deflection, design_strength, gamma_m, k_def, k_h, k_m, k_mod,
    k_sys, shear, strength_class_by_name, RectTimberSection,
};
use steel_check::{CheckKind, NamedCheck};

use crate::input::TimberBeamCheckInput;
use crate::result::TimberBeamCheckResult;

/// Zoek het envelop-punt dat `score` maximaliseert (0-krachtenpunt als de
/// envelop leeg is) — zelfde aanpak als de staal-orchestrator.
fn governing_for<F>(env: &[ForcePoint], score: F) -> ForcePoint
where
    F: Fn(&InternalForces) -> f64,
{
    if env.is_empty() {
        return ForcePoint {
            combination_id: 0,
            position_mm: 0.0,
            forces: Default::default(),
        };
    }
    let mut best = env[0];
    let mut best_score = score(&best.forces);
    for p in &env[1..] {
        let s = score(&p.forces);
        if s > best_score {
            best = *p;
            best_score = s;
        }
    }
    best
}

fn make_resistance(check: ResistanceCalc) -> NamedCheck {
    NamedCheck { id: check.id.clone(), kind: CheckKind::Resistance(check) }
}

fn make_stability(check: StabilityCalc) -> NamedCheck {
    NamedCheck { id: check.id.clone(), kind: CheckKind::Stability(check) }
}

fn uc_of(c: &NamedCheck) -> f64 {
    let (uc_opt, skip) = match &c.kind {
        CheckKind::Resistance(r) => (
            r.uc.as_ref().map(|u| u.uc),
            matches!(r.status, CheckStatus::NotApplicable),
        ),
        CheckKind::Stability(s) => (
            s.uc.as_ref().map(|u| u.uc),
            matches!(s.status, CheckStatus::NotApplicable),
        ),
    };
    if skip {
        0.0
    } else {
        uc_opt.unwrap_or(0.0)
    }
}

pub fn check_timber_beam(input: TimberBeamCheckInput) -> TimberBeamCheckResult {
    let section = RectTimberSection::new(input.width_mm, input.height_mm);

    // 1. Sterkteklasse opzoeken.
    let mat = match strength_class_by_name(&input.strength_class) {
        Some(m) => m,
        None => {
            return TimberBeamCheckResult {
                beam_id: input.beam_id,
                section_name: section.name(),
                strength_class: input.strength_class.clone(),
                service_class: input.service_class,
                load_duration: input.load_duration,
                checks: vec![],
                uc_max: 0.0,
                status: CheckStatus::NotApplicable,
                governing_check_id: format!(
                    "ERROR: sterkteklasse {} onbekend",
                    input.strength_class
                ),
            }
        }
    };

    // 2. Factoren en rekenwaarden.
    let gamma = gamma_m(mat.timber_type);
    let kmod = k_mod(mat.timber_type, input.service_class, input.load_duration);
    let ksys = k_sys(input.load_sharing);
    let kh_y = k_h(mat.timber_type, input.height_mm); // buiging om y: hoogte h
    let kh_z = k_h(mat.timber_type, input.width_mm); // buiging om z: hoogte b
    // Trek: k_h op de grootste doorsnedeafmeting (§3.2(3)).
    let kh_t = k_h(mat.timber_type, input.height_mm.max(input.width_mm));
    let km = k_m(true); // rechthoekige doorsnede

    let f_c0d = design_strength(mat.f_c0k, kmod, gamma, 1.0, ksys);
    let f_t0d = design_strength(mat.f_t0k, kmod, gamma, kh_t, ksys);
    let f_myd = design_strength(mat.f_mk, kmod, gamma, kh_y, ksys);
    let f_mzd = design_strength(mat.f_mk, kmod, gamma, kh_z, ksys);
    let f_vd = design_strength(mat.f_vk, kmod, gamma, 1.0, ksys);

    // 3. Maatgevende krachtspunten per toets (zelfde strategie als staal).
    let gov_compression = governing_for(&input.forces_envelope, |f| {
        if f.n_ed < 0.0 { f.n_ed.abs() } else { 0.0 }
    });
    let gov_tension = governing_for(&input.forces_envelope, |f| f.n_ed.max(0.0));
    let gov_bending =
        governing_for(&input.forces_envelope, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01);
    let gov_shear = governing_for(&input.forces_envelope, |f| f.vz_ed.abs());

    let comp_state = ForceStateSnapshot::from_point(&gov_compression);
    let tens_state = ForceStateSnapshot::from_point(&gov_tension);
    let bend_state = ForceStateSnapshot::from_point(&gov_bending);
    let shear_state = ForceStateSnapshot::from_point(&gov_shear);

    // 4. Doorsnedetoetsen.
    let mut checks: Vec<NamedCheck> = Vec::new();
    checks.push(make_resistance(compression::check_tension_parallel(
        &section, f_t0d, tens_state,
    )));
    checks.push(make_resistance(compression::check_compression_parallel(
        &section, f_c0d, comp_state,
    )));
    checks.push(make_resistance(bending::check_bending(
        &section, f_myd, f_mzd, km, bend_state,
    )));
    checks.push(make_resistance(shear::check_shear(
        &section, f_vd, input.k_cr, shear_state,
    )));

    // 5. Kolomknik §6.3.2 op het maatgevende buigpunt (conform de
    //    referentie-uitwerking: veldmoment + normaalkracht).
    let bc = beta_c(mat.timber_type);
    checks.push(make_stability(check_column_stability(
        &section,
        &ColumnStabilityInput {
            l_cr_y_mm: input.buckling_length_y_m * 1e3,
            l_cr_z_mm: input.buckling_length_z_m * 1e3,
            f_c0k_mpa: mat.f_c0k,
            e0_05_mpa: mat.e0_05,
            beta_c: bc,
            f_c0d_mpa: f_c0d,
            f_myd_mpa: f_myd,
            f_mzd_mpa: f_mzd,
            k_m: km,
        },
        bend_state,
    )));

    // 6. Kipstabiliteit §6.3.3.
    if input.perform_ltb_check {
        let segment_mm = if input.ltb_segment_length_m > 0.0 {
            input.ltb_segment_length_m * 1e3
        } else {
            input.length_m * 1e3
        };
        let l_ef_mm = if input.ltb_effective_length_override_m > 0.0 {
            input.ltb_effective_length_override_m * 1e3
        } else {
            effective_length_mm(
                segment_mm,
                input.ltb_load_case,
                input.ltb_load_position,
                input.height_mm,
            )
        };
        checks.push(make_stability(check_beam_stability(
            &section,
            &BeamStabilityInput {
                l_ef_mm,
                l_cr_z_mm: input.buckling_length_z_m * 1e3,
                f_mk_mpa: mat.f_mk,
                f_c0k_mpa: mat.f_c0k,
                e0_05_mpa: mat.e0_05,
                beta_c: bc,
                f_myd_mpa: f_myd,
                f_c0d_mpa: f_c0d,
            },
            bend_state,
        )));
    }

    // 7. Doorbuiging §7.2 met kruip.
    let kdef = k_def(mat.timber_type, input.service_class);
    let (fin, add) = deflection::check_deflection_pair(
        input.deflection_inst_mm,
        input.deflection_quasi_perm_mm,
        input.deflection_permanent_mm,
        kdef,
        input.length_m * 1e3,
        input.deflection_limit_fin,
        input.deflection_limit_add,
    );
    checks.push(make_resistance(fin));
    checks.push(make_resistance(add));

    // 8. Aggregatie.
    let mut uc_max = 0.0_f64;
    let mut governing_check_id = String::new();
    for c in &checks {
        let uc = uc_of(c);
        if uc > uc_max {
            uc_max = uc;
            governing_check_id = c.id.clone();
        }
    }
    let status = if uc_max <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    TimberBeamCheckResult {
        beam_id: input.beam_id,
        section_name: section.name(),
        strength_class: mat.name.to_string(),
        service_class: input.service_class,
        load_duration: input.load_duration,
        checks,
        uc_max,
        status,
        governing_check_id,
    }
}
