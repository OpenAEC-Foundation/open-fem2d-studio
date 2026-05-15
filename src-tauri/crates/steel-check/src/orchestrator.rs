//! Top-level orchestrator: take BeamCheckInput, run all EN 1993 checks,
//! return BeamCheckResult with full derivation trace.

use mechanics::{ForceStateSnapshot, ForcePoint};
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
use nen_en_1993_1_1_ltb::m_b_rd;
use steel_profiles::db;

use crate::input::BeamCheckInput;
use crate::result::{BeamCheckResult, NamedCheck, CheckKind};
use crate::deflection::check_deflection;

fn governing_force_point(env: &[ForcePoint]) -> ForcePoint {
    // Pick the point with the highest combined |My| + |N| ratio as governing.
    if env.is_empty() {
        return ForcePoint {
            combination_id: 0,
            position_mm: 0.0,
            forces: Default::default(),
        };
    }
    let mut best = env[0];
    let mut best_score = best.forces.my_ed.abs() + best.forces.n_ed.abs() * 0.01;
    for p in &env[1..] {
        let score = p.forces.my_ed.abs() + p.forces.n_ed.abs() * 0.01;
        if score > best_score {
            best = *p;
            best_score = score;
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

    // 3. Find governing force point
    let governing = governing_force_point(&input.forces_envelope);
    let governing_state = ForceStateSnapshot {
        combination_id: governing.combination_id,
        position_mm: governing.position_mm,
        forces: governing.forces,
    };

    // 4. Classify section
    let classification = classify_section(p, &grade, &governing.forces);

    // 5. Run cross-section resistance checks
    let mut checks: Vec<NamedCheck> = Vec::new();

    let comp = n_c_rd(p, &grade, governing_state);
    let n_c_rd_kn = comp.value;
    checks.push(make_resistance(comp));

    let bend_y = m_y_c_rd(p, &grade, classification, governing_state);
    let m_y_c_rd_knm = bend_y.value;
    checks.push(make_resistance(bend_y));

    let bend_z = m_z_c_rd(p, &grade, classification, governing_state);
    checks.push(make_resistance(bend_z));

    let shear_z = v_z_c_rd(p, &grade, governing_state);
    let v_z_pl_rd = shear_z.value;
    checks.push(make_resistance(shear_z));

    let shear_y = v_y_c_rd(p, &grade, governing_state);
    checks.push(make_resistance(shear_y));

    let mv = check_combined_mv(p, &grade, classification, v_z_pl_rd, m_y_c_rd_knm, governing_state);
    checks.push(make_resistance(mv));

    let mn = check_combined_mn(p, &grade, classification, n_c_rd_kn, m_y_c_rd_knm, governing_state);
    checks.push(make_resistance(mn));

    let mnv = check_combined_mnv(p, &grade, classification, n_c_rd_kn, m_y_c_rd_knm, v_z_pl_rd, governing_state);
    checks.push(make_resistance(mnv));

    // 6. Member stability — column buckling 6.3.1
    let curve_y = BucklingCurve::from_char(profile.buckling_curves.y_axis).unwrap_or(BucklingCurve::B);
    let curve_z = BucklingCurve::from_char(profile.buckling_curves.z_axis).unwrap_or(BucklingCurve::C);
    let buckling = n_b_rd(p, &grade, input.buckling_length_y_m, input.buckling_length_z_m, curve_y, curve_z, governing_state);

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

    // 7. LTB 6.3.2
    let ltb = m_b_rd(
        p, &grade, input.length_m, &input.lateral_bracing,
        governing.forces.my_ed,
        governing.forces.my_ed * 0.5,
        governing.forces.my_ed * 0.5,
        governing_state,
    );
    // ltb.value is chi_LT; M_b,Rd = chi_LT * W_pl,y * fy / gamma_M1
    let chi_lt = ltb.value;
    let m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;
    checks.push(make_stability(ltb));

    // 8. Combined N+M 6.3.3
    let cm_y = cm_uniform_or_psi(0.0);
    let cm_z = cm_uniform_or_psi(0.0);
    let is_class_1_or_2 = matches!(classification, CrossSectionClass::Class1 | CrossSectionClass::Class2);
    let factors = interaction_factors_method_2(
        governing.forces.n_ed.abs(), n_b_rd_y_kn, n_b_rd_z_kn,
        lambda_bar_y, lambda_bar_z, cm_y, cm_z, is_class_1_or_2,
    );
    let m_z_c_rd_knm = if is_class_1_or_2 {
        p.wpl_z_mm3 * grade.fy_mpa / grade.gamma_m0 * 1e-6
    } else {
        p.wel_z_mm3 * grade.fy_mpa / grade.gamma_m0 * 1e-6
    };
    let n_my = check_combined_n_my(
        governing.forces.n_ed.abs(), n_b_rd_y_kn,
        governing.forces.my_ed, m_b_rd_knm.max(1e-9),
        governing.forces.mz_ed, m_z_c_rd_knm,
        factors, governing_state,
    );
    checks.push(make_stability(n_my));
    let n_mz = check_combined_n_mz(
        governing.forces.n_ed.abs(), n_b_rd_z_kn,
        governing.forces.my_ed, m_b_rd_knm.max(1e-9),
        governing.forces.mz_ed, m_z_c_rd_knm,
        factors, governing_state,
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
