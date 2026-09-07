//! Orchestrator: neem ConcreteBeamCheckInput, voer de EN 1992-toetsen uit,
//! lever ConcreteBeamCheckResult met volledige afleiding.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::checks::{check_bending_stress_block, check_mn_kappa};
use nen_en_1992_1_1::mnkappa::{
    axial_compression_capacity_kn, axial_tension_capacity_kn, interaction_diagram,
    mn_kappa_diagram, MnKappaOptions,
};
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, ConcreteSection, ConcreteSectionInput,
    DesignMaterial,
};
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use steel_check::{CheckKind, NamedCheck};

use crate::input::{ConcreteBeamCheckInput, MnKappaRequest};
use crate::result::{ConcreteBeamCheckResult, MnKappaResponse};

/// Zoek het envelop-punt dat `score` maximaliseert — zelfde aanpak als de
/// staal- en hout-orchestrator.
fn governing_for<F>(env: &[ForcePoint], score: F) -> ForcePoint
where
    F: Fn(&InternalForces) -> f64,
{
    if env.is_empty() {
        return ForcePoint { combination_id: 0, position_mm: 0.0, forces: Default::default() };
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

fn uc_of(c: &NamedCheck) -> f64 {
    match &c.kind {
        CheckKind::Resistance(r) => {
            if matches!(r.status, CheckStatus::NotApplicable) {
                0.0
            } else {
                r.uc.as_ref().map(|u| u.uc).unwrap_or(0.0)
            }
        }
        CheckKind::Stability(s) => {
            if matches!(s.status, CheckStatus::NotApplicable) {
                0.0
            } else {
                s.uc.as_ref().map(|u| u.uc).unwrap_or(0.0)
            }
        }
    }
}

/// Het resultaat waarin alleen de reden staat. De doorsnede kán hier
/// onbouwbaar zijn — een T zonder lijfbreedte bijvoorbeeld — dus de naam en de
/// hoogte komen uit de INVOER en niet uit een doorsnede die er niet is.
fn error_result(input: &ConcreteBeamCheckInput, fout: String) -> ConcreteBeamCheckResult {
    ConcreteBeamCheckResult {
        beam_id: input.beam_id,
        section_name: input.section.name(),
        concrete_class: input.concrete_class.clone(),
        reinforcement_grade: input.reinforcement_grade.clone(),
        reinforcement_summary: input.cage.summary(),
        a_s_bottom_mm2: input.cage.a_s_bottom_mm2(),
        a_s_top_mm2: input.cage.a_s_top_mm2(),
        d_mm: input.cage.d_mm(input.section.h_mm),
        f_cd_mpa: 0.0,
        f_yd_mpa: 0.0,
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: format!("ERROR: {fout}"),
        mn_kappa: None,
        interaction_positive: vec![],
        interaction_negative: vec![],
    }
}

/// Materiaal en geometrie uit de invoer; `Err` met een leesbare reden.
fn setup(
    section: &ConcreteSectionInput,
    concrete_class: &str,
    reinforcement_grade: &str,
    cage: &nen_en_1992_1_1::ReinforcementCage,
    situation: nen_en_1992_1_1::DesignSituation,
    branch: nen_en_1992_1_1::SteelBranch,
) -> Result<(ConcreteSection, DesignMaterial), String> {
    let section = section.build()?;
    let beton = concrete_class_by_name(concrete_class)
        .ok_or_else(|| format!("betonsterkteklasse {concrete_class} onbekend"))?;
    let staal = reinforcement_grade_by_name(reinforcement_grade)
        .ok_or_else(|| format!("wapeningsstaal {reinforcement_grade} onbekend"))?;
    cage.validate(&section)?;
    Ok((section, DesignMaterial::new(beton, staal, situation, branch)))
}

pub fn check_concrete_beam(input: ConcreteBeamCheckInput) -> ConcreteBeamCheckResult {
    let (section, mat) = match setup(
        &input.section,
        &input.concrete_class,
        &input.reinforcement_grade,
        &input.cage,
        input.design_situation,
        input.steel_branch,
    ) {
        Ok(v) => v,
        Err(e) => return error_result(&input, e),
    };
    let opts = MnKappaOptions { n_strips: input.n_strips.max(1) as usize };
    let layers = input.cage.layers(section.h_mm);

    // Maatgevende krachtspunten. Buiging: grootste |M| (met N als
    // scheidsrechter). M-N: daarnaast het punt met de grootste druk — bij
    // een kolom kan dát maatgevend zijn door de minimale excentriciteit.
    let gov_bending = governing_for(&input.forces_envelope, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01);
    let gov_compression =
        governing_for(&input.forces_envelope, |f| if f.n_ed < 0.0 { f.n_ed.abs() } else { 0.0 });
    let bend_state = ForceStateSnapshot::from_point(&gov_bending);
    let comp_state = ForceStateSnapshot::from_point(&gov_compression);

    let mut checks: Vec<NamedCheck> = Vec::new();

    // 1. Buiging met de rechthoekige spanningsverdeling (handberekening).
    checks.push(make_resistance(check_bending_stress_block(&section, &input.cage, &mat, bend_state)));

    // 2. M-N-κ op het buigpunt, en op het drukpunt als dat een ander punt is;
    //    de zwaarste van de twee telt.
    let mut mn = check_mn_kappa(&section, &input.cage, &mat, &opts, input.apply_min_eccentricity, bend_state);
    let ander_punt = gov_compression.forces.n_ed < 0.0
        && (gov_compression.position_mm != gov_bending.position_mm
            || gov_compression.combination_id != gov_bending.combination_id);
    if ander_punt {
        let mn2 = check_mn_kappa(&section, &input.cage, &mat, &opts, input.apply_min_eccentricity, comp_state);
        let uc1 = mn.calc.uc.as_ref().map(|u| u.uc).unwrap_or(0.0);
        let uc2 = mn2.calc.uc.as_ref().map(|u| u.uc).unwrap_or(0.0);
        if uc2 > uc1 {
            mn = mn2;
        }
    }
    let diagram = mn.diagram.clone();
    checks.push(make_resistance(mn.calc));

    // 3. Interactiediagrammen voor de weergave (grover: 21 punten).
    let inter_opts = MnKappaOptions { n_strips: opts.n_strips.min(50) };
    let interaction_positive = interaction_diagram(&section, &layers, &mat, 1.0, 21, &inter_opts);
    let interaction_negative = interaction_diagram(&section, &layers, &mat, -1.0, 21, &inter_opts);

    // 4. Aggregatie.
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

    ConcreteBeamCheckResult {
        beam_id: input.beam_id,
        section_name: section.name(),
        concrete_class: mat.concrete_name.to_string(),
        reinforcement_grade: mat.steel_name.to_string(),
        reinforcement_summary: input.cage.summary(),
        a_s_bottom_mm2: input.cage.a_s_bottom_mm2(),
        a_s_top_mm2: input.cage.a_s_top_mm2(),
        d_mm: input.cage.d_mm(section.h_mm),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        checks,
        uc_max,
        status,
        governing_check_id,
        mn_kappa: Some(diagram),
        interaction_positive,
        interaction_negative,
    }
}

pub fn check_all_concrete_beams(inputs: Vec<ConcreteBeamCheckInput>) -> Vec<ConcreteBeamCheckResult> {
    inputs.into_iter().map(check_concrete_beam).collect()
}

/// M-N-κ-diagram en interactiediagram voor een korf, los van een staaf.
pub fn mn_kappa(req: MnKappaRequest) -> Result<MnKappaResponse, String> {
    let (section, mat) = setup(
        &req.section,
        &req.concrete_class,
        &req.reinforcement_grade,
        &req.cage,
        req.design_situation,
        req.steel_branch,
    )?;
    let opts = MnKappaOptions { n_strips: req.n_strips.max(1) as usize };
    let layers = req.cage.layers(section.h_mm);
    let diagram = mn_kappa_diagram(&section, &layers, &mat, req.n_ed_kn, req.moment_sign, &opts);
    let (interaction_positive, interaction_negative) = if req.interaction_points >= 3 {
        let inter_opts = MnKappaOptions { n_strips: opts.n_strips.min(50) };
        (
            interaction_diagram(&section, &layers, &mat, 1.0, req.interaction_points as usize, &inter_opts),
            interaction_diagram(&section, &layers, &mat, -1.0, req.interaction_points as usize, &inter_opts),
        )
    } else {
        (vec![], vec![])
    };
    Ok(MnKappaResponse {
        section_name: section.name(),
        reinforcement_summary: req.cage.summary(),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        d_mm: req.cage.d_mm(section.h_mm),
        a_s_bottom_mm2: req.cage.a_s_bottom_mm2(),
        a_s_top_mm2: req.cage.a_s_top_mm2(),
        n_rd_compression_kn: axial_compression_capacity_kn(&section, &layers, &mat, &opts),
        n_rd_tension_kn: axial_tension_capacity_kn(&layers, &mat),
        diagram,
        interaction_positive,
        interaction_negative,
    })
}
