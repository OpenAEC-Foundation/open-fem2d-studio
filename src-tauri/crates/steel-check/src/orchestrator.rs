//! Top-level orchestrator: take BeamCheckInput, run all EN 1993 checks,
//! return BeamCheckResult with full derivation trace.

use mechanics::{ForceStateSnapshot, ForcePoint, InternalForces};
use nen_en_1993_1_1_section::{
    grade_by_name, S235, SteelGrade,
    ResistanceCalc, CheckStatus,
    classification::{classify_section, CrossSectionClass},
    compression::n_c_rd,
    bending::{m_y_c_rd, m_z_c_rd},
    shear::{v_z_c_rd, v_y_c_rd},
    combined_mv::check_combined_mv,
    combined_mn::check_combined_mn,
    combined_mnv::check_combined_mnv,
};
use nen_en_1993_1_1_stability::{
    StabilityCalc,
    buckling_curve::BucklingCurve,
    column_buckling::n_b_rd,
    interaction_factors::{interaction_factors_method_2, cm_uniform_or_psi},
    combined_n_m::{check_combined_n_my, check_combined_n_mz},
};
use nen_en_1993_1_1_ltb::{m_b_rd, m_b_rd_channel};
use steel_profiles::{db, ProfileKind};
use crate::input::BeamCheckInput;
use crate::result::{BeamCheckResult, NamedCheck, CheckKind};
use crate::deflection::check_deflection;

/// Find the force point that maximises `score(forces)`.
/// Falls back to a zero-force point if the envelope is empty.
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

/// Linear interpolation of M_y at a given position within an unbraced segment.
/// Filters envelope to `combo_id`, sorts by position, and interpolates.
fn interpolate_my_at(envelope: &[ForcePoint], position_mm: f64, combo_id: u32) -> f64 {
    let mut pts: Vec<&ForcePoint> = envelope
        .iter()
        .filter(|p| p.combination_id == combo_id)
        .collect();
    if pts.is_empty() {
        // Fall back to all points if no points match the combination
        pts = envelope.iter().collect();
    }
    pts.sort_by(|a, b| a.position_mm.partial_cmp(&b.position_mm).unwrap());
    if pts.is_empty() {
        return 0.0;
    }
    if pts.len() == 1 {
        return pts[0].forces.my_ed;
    }
    let first = pts[0];
    let last = pts[pts.len() - 1];
    if position_mm <= first.position_mm {
        return first.forces.my_ed;
    }
    if position_mm >= last.position_mm {
        return last.forces.my_ed;
    }
    for w in pts.windows(2) {
        let (a, b) = (w[0], w[1]);
        if position_mm >= a.position_mm && position_mm <= b.position_mm {
            let span = (b.position_mm - a.position_mm).max(1e-9);
            let t = (position_mm - a.position_mm) / span;
            return a.forces.my_ed + t * (b.forces.my_ed - a.forces.my_ed);
        }
    }
    last.forces.my_ed
}

fn make_resistance(check: ResistanceCalc) -> NamedCheck {
    NamedCheck { id: check.id.clone(), kind: CheckKind::Resistance(check) }
}

fn make_stability(check: StabilityCalc) -> NamedCheck {
    NamedCheck { id: check.id.clone(), kind: CheckKind::Stability(check) }
}

fn uc_of(c: &NamedCheck) -> f64 {
    let (uc_opt, status_skip) = match &c.kind {
        CheckKind::Resistance(r) => (r.uc.as_ref().map(|u| u.uc), matches!(r.status, CheckStatus::NotApplicable)),
        CheckKind::Stability(s) => (s.uc.as_ref().map(|u| u.uc), matches!(s.status, CheckStatus::NotApplicable)),
    };
    if status_skip { 0.0 } else { uc_opt.unwrap_or(0.0) }
}

pub fn check_beam(input: BeamCheckInput) -> BeamCheckResult {
    // 1. Look up profile
    let profile = match db().find(&input.profile_name) {
        Some(p) => p,
        None => return BeamCheckResult {
            beam_id: input.beam_id,
            profile_name: input.profile_name.clone(),
            steel_grade: input.steel_grade.clone(),
            classification: CrossSectionClass::Class1,
            checks: vec![],
            uc_max: 0.0,
            status: CheckStatus::NotApplicable,
            governing_check_id: format!("ERROR: profile {} not found", input.profile_name),
        },
    };
    let p = &profile.properties;

    // 2. Look up grade (default to S235 if unknown)
    let grade: SteelGrade = grade_by_name(&input.steel_grade).unwrap_or(S235);

    // 3. Find per-check governing force points.
    //    - Compression: max |N|
    //    - Bending:     max |M_y| (+ small N weight for combined checks)
    //    - Shear:       max |V_z|
    //    - Combined/stability: max |M_y| + 0.01 * |N| (bending-driven)
    let gov_compression = governing_for(&input.forces_envelope, |f| f.n_ed.abs());
    let gov_bending = governing_for(&input.forces_envelope, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01);
    let gov_shear    = governing_for(&input.forces_envelope, |f| f.vz_ed.abs());

    let comp_state = ForceStateSnapshot {
        combination_id: gov_compression.combination_id,
        position_mm: gov_compression.position_mm,
        forces: gov_compression.forces,
    };
    let bend_state = ForceStateSnapshot {
        combination_id: gov_bending.combination_id,
        position_mm: gov_bending.position_mm,
        forces: gov_bending.forces,
    };
    let shear_state = ForceStateSnapshot {
        combination_id: gov_shear.combination_id,
        position_mm: gov_shear.position_mm,
        forces: gov_shear.forces,
    };

    // 4. Classify section (use bending-governing forces — bending drives classification)
    let classification = classify_section(p, &grade, &gov_bending.forces);

    // 5. Run cross-section resistance checks
    let mut checks: Vec<NamedCheck> = Vec::new();

    let comp = n_c_rd(p, &grade, comp_state);
    let n_c_rd_kn = comp.value;
    checks.push(make_resistance(comp));

    let bend_y = m_y_c_rd(p, &grade, classification, bend_state);
    let m_y_c_rd_knm = bend_y.value;
    checks.push(make_resistance(bend_y));

    let bend_z = m_z_c_rd(p, &grade, classification, bend_state);
    checks.push(make_resistance(bend_z));

    let shear_z = v_z_c_rd(p, &grade, shear_state);
    let v_z_pl_rd = shear_z.value;
    checks.push(make_resistance(shear_z));

    let shear_y = v_y_c_rd(p, &grade, shear_state);
    checks.push(make_resistance(shear_y));

    // Combined M+V and M+N checks use bending-governing location
    let mv = check_combined_mv(p, &grade, classification, v_z_pl_rd, m_y_c_rd_knm, bend_state);
    checks.push(make_resistance(mv));

    let mn = check_combined_mn(p, &grade, classification, n_c_rd_kn, m_y_c_rd_knm, bend_state);
    checks.push(make_resistance(mn));

    let mnv = check_combined_mnv(p, &grade, classification, n_c_rd_kn, m_y_c_rd_knm, v_z_pl_rd, bend_state);
    checks.push(make_resistance(mnv));

    // 6. Member stability — column buckling 6.3.1 (compression-governing location)
    let curve_y = BucklingCurve::from_char(profile.buckling_curves.y_axis).unwrap_or(BucklingCurve::B);
    let curve_z = BucklingCurve::from_char(profile.buckling_curves.z_axis).unwrap_or(BucklingCurve::C);
    let buckling = n_b_rd(p, &grade, input.buckling_length_y_m, input.buckling_length_z_m, curve_y, curve_z, comp_state);

    // Extract chi_y, chi_z and lambda_bar values from intermediate_values for use in §6.3.3.
    // Symbols match exactly what column_buckling.rs stores: r"\chi_y", r"\chi_z",
    // r"\bar{\lambda}_y", r"\bar{\lambda}_z".
    let chi_y = buckling.intermediate_values.iter()
        .find(|v| v.symbol == r"\chi_y")
        .map(|v| v.value).unwrap_or(1.0);
    let chi_z = buckling.intermediate_values.iter()
        .find(|v| v.symbol == r"\chi_z")
        .map(|v| v.value).unwrap_or(1.0);
    let n_pl_rd_kn = p.area_mm2 * grade.fy_mpa * 1e-3;
    let n_b_rd_y_kn = chi_y * n_pl_rd_rd_fn(n_pl_rd_kn, grade.gamma_m1);
    let n_b_rd_z_kn = chi_z * n_pl_rd_rd_fn(n_pl_rd_kn, grade.gamma_m1);
    let lambda_bar_y = buckling.intermediate_values.iter()
        .find(|v| v.symbol == r"\bar{\lambda}_y")
        .map(|v| v.value).unwrap_or(0.0);
    let lambda_bar_z = buckling.intermediate_values.iter()
        .find(|v| v.symbol == r"\bar{\lambda}_z")
        .map(|v| v.value).unwrap_or(0.0);
    checks.push(make_stability(buckling));

    // 7. LTB 6.3.2 — channel sections use monosymmetric (conservative) Mcr × 0.7.
    //    Doubly-symmetric I/H sections use the standard I-section formula.
    let is_channel = matches!(profile.kind, ProfileKind::Channel);
    let m_b_rd_knm: f64;

    // Interpolate M_y at L_st/4 and L_st/2 for accurate beta / C1 calculation.
    let l_st_mm = nen_en_1993_1_1_ltb::lambda_chi::unbraced_length_mm(
        input.length_m, &input.lateral_bracing,
    );
    let combo_id = gov_bending.combination_id;
    let my_at_quarter = interpolate_my_at(&input.forces_envelope, l_st_mm / 4.0, combo_id);
    let my_at_half    = interpolate_my_at(&input.forces_envelope, l_st_mm / 2.0, combo_id);

    let ltb_check = if is_channel {
        let ltb = m_b_rd_channel(
            p, &grade, input.length_m, &input.lateral_bracing,
            gov_bending.forces.my_ed,
            my_at_quarter,
            my_at_half,
            bend_state,
        );
        let chi_lt = ltb.value;
        m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;
        make_stability(ltb)
    } else {
        let ltb = m_b_rd(
            p, &grade, input.length_m, &input.lateral_bracing,
            gov_bending.forces.my_ed,
            my_at_quarter,
            my_at_half,
            bend_state,
        );
        let chi_lt = ltb.value;
        m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;
        make_stability(ltb)
    };
    checks.push(ltb_check);

    // 8. Combined N+M 6.3.3 (bending-governing location)
    let cm_y = cm_uniform_or_psi(0.0);
    let cm_z = cm_uniform_or_psi(0.0);
    let is_class_1_or_2 = matches!(classification, CrossSectionClass::Class1 | CrossSectionClass::Class2);
    let factors = interaction_factors_method_2(
        gov_bending.forces.n_ed.abs(), n_b_rd_y_kn, n_b_rd_z_kn,
        lambda_bar_y, lambda_bar_z, cm_y, cm_z, is_class_1_or_2,
    );
    let m_z_c_rd_knm = if is_class_1_or_2 {
        p.wpl_z_mm3 * grade.fy_mpa / grade.gamma_m0 * 1e-6
    } else {
        p.wel_z_mm3 * grade.fy_mpa / grade.gamma_m0 * 1e-6
    };
    let n_my = check_combined_n_my(
        gov_bending.forces.n_ed.abs(), n_b_rd_y_kn,
        gov_bending.forces.my_ed, m_b_rd_knm.max(1e-9),
        gov_bending.forces.mz_ed, m_z_c_rd_knm,
        factors, bend_state,
    );
    checks.push(make_stability(n_my));
    let n_mz = check_combined_n_mz(
        gov_bending.forces.n_ed.abs(), n_b_rd_z_kn,
        gov_bending.forces.my_ed, m_b_rd_knm.max(1e-9),
        gov_bending.forces.mz_ed, m_z_c_rd_knm,
        factors, bend_state,
    );
    checks.push(make_stability(n_mz));

    // 9. SLS Deflection
    let defl = check_deflection(
        input.deflection_actual_max_mm, input.length_m,
        input.deflection_limit_class, input.deflection_limit_numerator,
    );
    checks.push(make_resistance(defl));

    // Apply consequence class factor (KFI) — for v1, just note; not yet applied to individual UCs
    let _k_fi: f64 = input.consequence_class.k_fi();

    // 10. Aggregate
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

    BeamCheckResult {
        beam_id: input.beam_id,
        profile_name: input.profile_name.clone(),
        steel_grade: input.steel_grade.clone(),
        classification,
        checks,
        uc_max,
        status,
        governing_check_id,
    }
}

#[inline]
fn n_pl_rd_rd_fn(n_pl_rd_kn: f64, gamma_m1: f64) -> f64 {
    n_pl_rd_kn / gamma_m1
}
