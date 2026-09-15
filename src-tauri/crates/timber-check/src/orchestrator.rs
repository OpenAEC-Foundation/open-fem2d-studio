//! Orchestrator: neem TimberBeamCheckInput, voer alle EN 1995-toetsen uit,
//! lever TimberBeamCheckResult met volledige afleiding.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use nen_en_1993_1_1_stability::kniklengte::{bepaal_kniklengte, Steunen, Steunrand};
use nen_en_1993_1_1_stability::StabilityCalc;
use nen_en_1995_1_1::stability::{
    check_beam_stability, check_column_stability, effective_length_mm, BeamStabilityInput,
    ColumnStabilityInput,
};
use nen_en_1995_1_1::{
    bending, beta_c, compression, deflection, design_strength, gamma_m, k_def, k_h, k_m, k_mod,
    k_sys, shear, strength_class_by_name, TimberSection,
};
use steel_check::{CheckKind, CustomSection, NamedCheck};

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

/// Is deze samengestelde doorsnede in werkelijkheid gewoon een rechthoek?
///
/// Waarom die vraag ertoe doet: aan `TimberSection::rechthoekig` hangen drie
/// normregels (k_h van 3.2(3)/3.3(3), k_m van 6.1.6(2) en de vereenvoudigde
/// sigma_m,crit van 6.3.3(2)). Een gebruiker die in de profieleditor een
/// enkele plaat tekent, heeft een rechthoek en hoort die drie gewoon te
/// krijgen; hem als "samengesteld" behandelen zou de kiptoets laten vervallen
/// zonder dat daar een reden voor is.
///
/// Alleen een echte rechthoek telt: precies een lamel, liggend of staand.
/// Levert `(b, h)` in mm.
fn als_rechthoek(cs: &CustomSection) -> Option<(f64, f64)> {
    if cs.lamellen.len() != 1 || !cs.gesloten_cellen.is_empty() {
        return None;
    }
    let l = cs.lamellen[0];
    if l.alpha_rad.sin().abs() < 1e-9 {
        Some((l.b_mm, l.t_mm)) // liggend: lengte langs y
    } else if l.alpha_rad.cos().abs() < 1e-9 {
        Some((l.t_mm, l.b_mm)) // staand: lengte langs z
    } else {
        None
    }
}

/// De doorsnede waarmee getoetst wordt, met de naam die in het rapport komt.
///
/// Zonder `custom_section` is dat de rechthoek b x h uit de invoer -- het
/// gedrag van voorheen, tot op de laatste decimaal. Met `custom_section`
/// komen A, I, W en de maatgevende schuifvezel uit `section-properties`,
/// dezelfde motor die de profieleditor gebruikt. Zo is er geen tweede plek
/// waar doorsnedegrootheden worden uitgerekend.
///
/// `Err` zodra de doorsnede geen contour heeft (alleen kant-en-klare
/// eigenschappen, of een catalogusdeel erin): dan is er geen breedte op een
/// vezel te meten en dus geen dwarskrachttoets volgens art. 6.1.7 te maken.
/// Doorrekenen met een geraden breedte is precies wat hier niet mag.
fn doorsnede_uit(input: &TimberBeamCheckInput) -> Result<(TimberSection, String), String> {
    let cs = match input.custom_section.as_ref() {
        None => {
            let s = TimberSection::rechthoek(input.width_mm, input.height_mm);
            let naam = s.name();
            return Ok((s, naam));
        }
        Some(cs) => cs,
    };
    if let Some((b, h)) = als_rechthoek(cs) {
        return Ok((TimberSection::rechthoek(b, h), cs.naam.clone()));
    }
    if cs.lamellen.is_empty() {
        return Err(format!(
            "doorsnede \"{}\" is niet uit lamellen opgebouwd. De houttoetsing heeft              de vorm zelf nodig: art. 6.1.7 vraagt de breedte op de beschouwde vezel,              en die staat niet in een kant-en-klare set doorsnede-eigenschappen.              Teken de doorsnede als samenstelling van platen.",
            cs.naam
        ));
    }
    let comp = cs.naar_composite();
    let vezel = comp.maatgevende_schuifvezel().ok_or_else(|| {
        format!(
            "van doorsnede \"{}\" is de maatgevende schuifvezel niet te bepalen              (een catalogusprofiel als bouwsteen heeft geen contour). Bouw de              doorsnede uit platen op.",
            cs.naam
        )
    })?;
    let p = comp.bereken().props;
    if !(p.area_mm2 > 0.0) || !(p.iy_mm4 > 0.0) {
        return Err(format!(
            "doorsnede \"{}\" heeft geen bruikbaar oppervlak of traagheidsmoment.",
            cs.naam
        ));
    }
    Ok((
        TimberSection {
            b_mm: p.b_mm,
            h_mm: p.h_mm,
            a_mm2: p.area_mm2,
            // wel_y_mm3 is de maatgevende (kleinste) van boven- en ondervezel.
            w_y_mm3: p.wel_y_mm3,
            w_z_mm3: p.wel_z_mm3,
            i_y_mm4: p.iy_mm4,
            i_z_mm4: p.iz_mm4,
            radius_y_mm: p.iy_radius_mm,
            radius_z_mm: p.iz_radius_mm,
            s_y_mm3: vezel.s_mm3,
            b_schuif_mm: vezel.b_mm,
            b_flens_mm: vezel.b_max_mm,
            rechthoekig: false,
        },
        cs.naam.clone(),
    ))
}

pub fn check_timber_beam(input: TimberBeamCheckInput) -> TimberBeamCheckResult {
    // 0. De doorsnede. Lukt dat niet, dan STOPT de toetsing van deze staaf met
    //    de reden erbij -- er wordt geen vervangende doorsnede verzonnen.
    let (section, section_name) = match doorsnede_uit(&input) {
        Ok(paar) => paar,
        Err(reden) => {
            return TimberBeamCheckResult {
                beam_id: input.beam_id,
                section_name: input
                    .custom_section
                    .as_ref()
                    .map(|c| c.naam.clone())
                    .unwrap_or_default(),
                strength_class: input.strength_class.clone(),
                service_class: input.service_class,
                load_duration: input.load_duration,
                checks: vec![],
                uc_max: 0.0,
                status: CheckStatus::NotApplicable,
                governing_check_id: format!("ERROR: {reden}"),
            }
        }
    };

    // 1. Sterkteklasse opzoeken.
    let mat = match strength_class_by_name(&input.strength_class) {
        Some(m) => m,
        None => {
            return TimberBeamCheckResult {
                beam_id: input.beam_id,
                section_name,
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
    // k_h geldt volgens §3.2(3) en §3.3(3) uitdrukkelijk bij een RECHTHOEKIGE
    // doorsnede ("bij rechthoekig gezaagd hout", "bij rechthoekig gelijmd
    // gelamineerd hout"). Bij een samengestelde doorsnede blijft hij dus 1,0.
    // Dat is bovendien de veilige kant: k_h is een verhoging van f_m,k en
    // f_t,0,k, geen verlaging.
    let (kh_y, kh_z, kh_t) = if section.rechthoekig {
        (
            k_h(mat.timber_type, section.h_mm),                  // buiging om y: hoogte h
            k_h(mat.timber_type, section.b_mm),                  // buiging om z: hoogte b
            k_h(mat.timber_type, section.h_mm.max(section.b_mm)), // trek: grootste maat (§3.2(3))
        )
    } else {
        (1.0, 1.0, 1.0)
    };
    // §6.1.6(2): k_m = 0,7 bij een rechthoekige doorsnede, 1,0 bij alle andere.
    let km = k_m(section.rechthoekig);
    // Scheurfactor voor de dwarskracht. Bij een prismatische (rechthoekige)
    // ligger is dat de waarde uit de invoer -- de NB schrijft daar 1,0 voor en
    // dat is ook de standaardwaarde van het invoerveld. Bij een I-, T- of
    // kokervorm leest de NB bij 6.1.7 k_cr af uit de verhouding lijfdikte /
    // flensbreedte; die verhouding kent de invoer niet en de doorsnede wel,
    // dus wordt hij hier bepaald. Zie `shear::k_cr_nb`.
    let k_cr = if section.rechthoekig {
        input.k_cr
    } else {
        shear::k_cr_nb(section.b_schuif_mm, section.b_flens_mm)
    };

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
        &section, f_vd, k_cr, shear_state,
    )));

    // 5. Kolomknik §6.3.2 op het maatgevende buigpunt (conform de
    //    referentie-uitwerking: veldmoment + normaalkracht).
    //
    //    De kniklengten beslist de kern, mét herkomst (zie
    //    `nen_en_1993_1_1_stability::kniklengte`): opgegeven, of om z uit
    //    steunen aan BEIDE randen, of de staaflengte. Dezelfde L_cr,z gaat
    //    hieronder ook naar de drukterm van de kiptoets.
    let bc = beta_c(mat.timber_type);
    let l_staaf_mm = input.length_m * 1e3;
    let kniklengte_y = bepaal_kniklengte("y", true, input.buckling_length_y_m, l_staaf_mm, None);
    let kniklengte_z = bepaal_kniklengte(
        "z",
        false,
        input.buckling_length_z_m,
        l_staaf_mm,
        input.lateral_bracing.as_ref().map(|b| Steunen {
            boven: &b.top_flange_positions,
            onder: &b.bottom_flange_positions,
            soort: Steunrand::Rand,
        }),
    );
    let l_cr_z_mm = kniklengte_z.l_cr_mm;
    let kniklengte_z_samenvatting = kniklengte_z.samenvatting();
    checks.push(make_stability(check_column_stability(
        &section,
        &ColumnStabilityInput {
            kniklengte_y,
            kniklengte_z,
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
                section.h_mm,
            )
        };
        let mut kip = check_beam_stability(
            &section,
            &BeamStabilityInput {
                l_ef_mm,
                l_cr_z_mm,
                f_mk_mpa: mat.f_mk,
                f_c0k_mpa: mat.f_c0k,
                e0_05_mpa: mat.e0_05,
                beta_c: bc,
                f_myd_mpa: f_myd,
                f_c0d_mpa: f_c0d,
            },
            bend_state,
        );
        // Waar de kniklengte in de drukterm van (6.35) vandaan komt. Zonder
        // deze regel ziet de lezer van de kiptoets k_c,z staan maar niet met
        // welke L_cr,z hij bepaald is — en die kan op de staaflengte zijn
        // teruggevallen.
        kip.notes.push(format!(
            "k_c,z in de drukterm van (6.35) is bepaald met {kniklengte_z_samenvatting} — dezelfde \
             kniklengte als in de kolomtoets van art. 6.3.2, waar haar afleiding staat."
        ));
        checks.push(make_stability(kip));
    }

    // 7. Doorbuiging §7.2 met kruip.
    let kdef = k_def(mat.timber_type, input.service_class);
    let (mut fin, add) = deflection::check_deflection_pair(
        input.deflection_inst_mm,
        input.deflection_quasi_perm_mm,
        input.deflection_permanent_mm,
        kdef,
        input.length_m * 1e3,
        input.deflection_limit_fin,
        input.deflection_limit_add,
    );
    // Waar w_qp vandaan komt, staat bij w_fin — dat is de enige formule waar
    // hij in voorkomt (w_fin = w_inst + k_def · w_qp). w_add volgt uit w_fin en
    // erft de aanname dus, wat in de toelichting zelf hoort te staan.
    fin.notes.extend(input.deflection_notes.iter().cloned());
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
        section_name,
        strength_class: mat.name.to_string(),
        service_class: input.service_class,
        load_duration: input.load_duration,
        checks,
        uc_max,
        status,
        governing_check_id,
    }
}

/// De hele lijst in één keer — de batch-instap van deze kern.
///
/// Waarom dit bestaat en niet elke schil zijn eigen lus schrijft: het
/// Tauri-command, de toetsbrug én de MCP-server voeren alle drie dezelfde
/// staven door dezelfde toetsing. Zolang die lus in de schil staat, is er drie
/// keer een plek waar iemand de volgorde omdraait, een staaf overslaat of een
/// filter toevoegt — en dan geeft hetzelfde raamwerk per omgeving een ander
/// antwoord. Staal (`steel_check::check_all_beams`) en beton
/// (`concrete_check::check_all_concrete_beams`) hebben zo'n instap al; hout
/// hield als enige de lus buiten de bibliotheek.
pub fn check_all_timber_beams(inputs: Vec<TimberBeamCheckInput>) -> Vec<TimberBeamCheckResult> {
    inputs.into_iter().map(check_timber_beam).collect()
}
