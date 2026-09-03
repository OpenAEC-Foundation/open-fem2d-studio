//! Top-level orchestrator: take BeamCheckInput, run all EN 1993 checks,
//! return BeamCheckResult with full derivation trace.

use mechanics::{ForceStateSnapshot, ForcePoint, InternalForces};
use nen_en_1993_1_1_section::{
    grade_by_name, S235, SteelGrade,
    ResistanceCalc, CheckStatus,
    classification::{classify_composite, classify_section, epsilon, CrossSectionClass, SectionShape},
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
use nen_en_1993_1_1_ltb::{m_b_rd, m_b_rd_channel, Kipprofiel, Kipveld};
use section_properties::SectionProperties;
use steel_profiles::{db, ProfileKind};
use crate::input::{
    BeamCheckInput, CustomDoorsnedevorm, MELDING_VORM_NIET_CONTROLEERBAAR,
    REDEN_GESLOTEN_CEL_NIET_GEDECLAREERD, REDEN_INTERACTIE_ZONDER_KIP, REDEN_KIP_NIET_DUBBELSYMMETRISCH,
    REDEN_KLASSE_4, reden_lijfplooi,
};
use crate::result::{BeamCheckResult, NamedCheck, CheckKind};
use crate::deflection::check_deflection_pair;

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

// ═══════════════════════════════════════════════════════════════════════════
//  D4.3 — de doorsnede resolveren en de weigeringen hard programmeren
// ═══════════════════════════════════════════════════════════════════════════

/// η uit NEN-EN 1993-1-1 6.2.6(3): 1,2 voor staalsoorten t/m S460. Zelfde
/// waarde als `CompositeSection::eta_schuif` in de rekenkern.
const ETA_SCHUIF: f64 = 1.2;

/// De doorsnede waarop getoetst wordt, plus wat er níet gerekend mag worden.
///
/// Voor het databasepad zijn alle weigeringsvelden `None`: D4.3 verandert
/// niets aan het gedrag van een catalogusprofiel. De weigeringen gelden voor
/// het inline pad, waar de doorsnede geen catalogusgeschiedenis heeft en de
/// aannames van de formules dus niet vanzelf opgaan.
struct Doorsnede {
    naam: String,
    props: SectionProperties,
    klasse: CrossSectionClass,
    curve_y: BucklingCurve,
    curve_z: BucklingCurve,
    is_channel: bool,
    /// Welke rij van tabel 6.5 de kipkromme levert (art. 6.3.2.3). Dit is een
    /// ANDERE tabel dan de 6.2 waar `curve_y`/`curve_z` uit komen: die gaan
    /// over kolomknik en hebben de grens h/b = 1,2, tabel 6.5 gaat over kip en
    /// heeft de grens h/b = 2.
    kip_profielsoort: Kipprofiel,
    /// Reden waarom kip 6.3.2 (en daarmee 6.3.3) niet gerekend mag worden.
    kip_weigering: Option<String>,
    /// Reden waarom de schuiftoets om de z-as (en M+V, M+N+V) niet mag draaien.
    schuif_weigering: Option<String>,
    /// Reden waarom géén enkele weerstands- of stabiliteitstoets mag draaien.
    totaal_weigering: Option<String>,
    /// Losse meldingen die als eigen regel in de checklijst landen.
    meldingen: Vec<(&'static str, &'static str, String)>,
    /// Notities die bij de kipcontrole horen als die wél draait.
    kip_notities: Vec<String>,
}

/// De twaalf toetsen die bij een weigering met naam en artikel in de lijst
/// blijven staan, zodat het rapport toont wát er niet gerekend is en waarom.
/// De laatste kolom zegt of het een stabiliteitstoets is.
const TOETSEN: [(&str, &str, &str, bool); 12] = [
    ("6.2.4_compression", "Compression", "art. 6.2.4 (6.10)", false),
    ("6.2.5_bending_y", "Bending (y-axis)", "art. 6.2.5 (6.12)", false),
    ("6.2.5_bending_z", "Bending (z-axis)", "art. 6.2.5 (6.12)", false),
    ("6.2.6_shear_z", "Shear", "art. 6.2.6 (6.18)", false),
    ("6.2.6_shear_y", "Shear (y-axis)", "art. 6.2.6", false),
    ("6.2.8_combined_mv", "Bending + shear", "art. 6.2.8", false),
    ("6.2.9_combined_mn", "Bending + axial force", "art. 6.2.9", false),
    ("6.2.10_combined_mnv", "Bending + axial + shear", "art. 6.2.10", false),
    ("6.3.1_buckling", "Column buckling", "art. 6.3.1 (6.46)", true),
    ("6.3.2_ltb", "Lateral-torsional buckling resistance", "art. 6.3.2", true),
    ("6.3.3_eq_6_61", "Combined N+M (6.61)", "art. 6.3.3", true),
    ("6.3.3_eq_6_62", "Combined N+M (6.62)", "art. 6.3.3", true),
];

/// Een geweigerde toets: `CheckStatus::NotApplicable`, géén UC, en de reden in
/// leesbaar Nederlands in `notes`. Nooit een UC van 0,0 die als "voldoet" oogt.
fn weigering(
    id: &str,
    titel: &str,
    artikel: &str,
    stabiliteit: bool,
    redenen: Vec<String>,
    force_state: ForceStateSnapshot,
) -> NamedCheck {
    if stabiliteit {
        NamedCheck {
            id: id.to_string(),
            kind: CheckKind::Stability(StabilityCalc {
                id: id.to_string(),
                title: titel.to_string(),
                article: artikel.to_string(),
                force_state,
                formula_latex: String::new(),
                variables: vec![],
                intermediate_values: vec![],
                value: 0.0,
                unit: "-".to_string(),
                uc: None,
                status: CheckStatus::NotApplicable,
                notes: redenen,
            }),
        }
    } else {
        NamedCheck {
            id: id.to_string(),
            kind: CheckKind::Resistance(ResistanceCalc {
                id: id.to_string(),
                title: titel.to_string(),
                article: artikel.to_string(),
                force_state,
                formula_latex: String::new(),
                variables: vec![],
                value: 0.0,
                unit: "-".to_string(),
                uc: None,
                status: CheckStatus::NotApplicable,
                notes: redenen,
            }),
        }
    }
}

/// Zoekt titel, artikel en soort bij een toets-id uit [`TOETSEN`].
fn toetsgegevens(id: &str) -> (&'static str, &'static str, bool) {
    TOETSEN
        .iter()
        .find(|(t, ..)| *t == id)
        .map(|&(_, titel, artikel, stab)| (titel, artikel, stab))
        .unwrap_or(("", "", false))
}

/// Kiest de doorsnede: eerst de inline `custom_section`, anders de database.
///
/// Het databasepad is letterlijk het oude pad — zelfde lookup, zelfde
/// classificatie, zelfde knikkrommen — zodat een aanroep zonder
/// `custom_section` bit-identiek blijft.
fn resolveer_doorsnede(
    input: &BeamCheckInput,
    grade: &SteelGrade,
    bend_forces: &InternalForces,
) -> Result<Doorsnede, String> {
    let Some(custom) = input.custom_section.as_ref() else {
        let profile = match db().find(&input.profile_name) {
            Some(p) => p,
            None => return Err(format!("ERROR: profile {} not found", input.profile_name)),
        };
        let p = &profile.properties;
        // De vorm bepaalt welk blad van tabel 5.2 geldt: kokerwanden zijn
        // inwendige delen (blad 1) en ronde buizen hebben eigen d/t-grenzen
        // (blad 3). SHS en RHS vallen voor de norm samen.
        let shape = match profile.kind {
            ProfileKind::ISection => SectionShape::ISection,
            ProfileKind::Channel  => SectionShape::Channel,
            ProfileKind::Shs | ProfileKind::Rhs => SectionShape::BoxSection,
            ProfileKind::Chs      => SectionShape::CircularHollow,
        };
        return Ok(Doorsnede {
            naam: input.profile_name.clone(),
            props: *p,
            klasse: classify_section(p, grade, bend_forces, shape),
            curve_y: BucklingCurve::from_char(profile.buckling_curves.y_axis)
                .unwrap_or(BucklingCurve::B),
            curve_z: BucklingCurve::from_char(profile.buckling_curves.z_axis)
                .unwrap_or(BucklingCurve::C),
            is_channel: matches!(profile.kind, ProfileKind::Channel),
            // Tabel 6.5 kent alleen rijen voor I-profielen. Alles uit de
            // catalogus is gewalst; kokers en buizen vallen buiten de tabel.
            kip_profielsoort: match profile.kind {
                ProfileKind::ISection => Kipprofiel::GewalsteI,
                ProfileKind::Channel
                | ProfileKind::Shs
                | ProfileKind::Rhs
                | ProfileKind::Chs => Kipprofiel::Overig,
            },
            kip_weigering: None,
            schuif_weigering: None,
            totaal_weigering: None,
            meldingen: vec![],
            kip_notities: vec![],
        });
    };

    // ── Inline doorsnede ────────────────────────────────────────────────────
    let mut meldingen: Vec<(&'static str, &'static str, String)> = Vec::new();
    let mut kip_notities: Vec<String> = Vec::new();

    let (mut props, klasse, kip_toegestaan) = if !custom.lamellen.is_empty() {
        // Geometrie beslist: eigenschappen, klasse per plaatdeel (tabel 5.2)
        // en de dubbelsymmetrie volgen alle drie uit de lamellen.
        let sec = custom.naar_composite();
        let res = sec.bereken();
        let cls = classify_composite(&sec, grade, bend_forces);
        if custom.heeft_ongedeclareerde_gesloten_cel() {
            meldingen.push((
                "doorsnede_gesloten_cel",
                "Gesloten cel (torsiestijfheid)",
                REDEN_GESLOTEN_CEL_NIET_GEDECLAREERD.to_string(),
            ));
        }
        (res.props, cls.klasse, custom.is_dubbelsymmetrische_gelaste_i())
    } else {
        // Alleen eigenschappen: er is geen geometrie om tabel 5.2 op los te
        // laten, dus de gedeclareerde vorm moet zeggen welk blad geldt.
        let p = custom.eigenschappen.ok_or_else(|| {
            "inline doorsnede zonder lamellen en zonder eigenschappen: er valt niets te toetsen"
                .to_string()
        })?;
        let shape = match custom.vorm {
            CustomDoorsnedevorm::Onbekend => {
                return Err(
                    "inline doorsnede zonder lamellen én zonder vormaanduiding kan niet volgens \
                     tabel 5.2 worden geklasseerd"
                        .to_string(),
                )
            }
            CustomDoorsnedevorm::GelasteIDubbelsymmetrisch
            | CustomDoorsnedevorm::GelasteIMonosymmetrisch => SectionShape::ISection,
            CustomDoorsnedevorm::Koker => SectionShape::BoxSection,
            CustomDoorsnedevorm::RondeBuis => SectionShape::CircularHollow,
        };
        kip_notities.push(MELDING_VORM_NIET_CONTROLEERBAAR.to_string());
        (
            p,
            classify_section(&p, grade, bend_forces, shape),
            custom.vorm == CustomDoorsnedevorm::GelasteIDubbelsymmetrisch,
        )
    };

    // `composite.rs` laat t_f en t_w op nul staan: een willekeurige
    // lamellendoorsnede heeft geen "flens" en geen "lijf". Twee formules vragen
    // er wél om, en beide gebruiken het product `2·b·t_f` c.q. `h/t_w`:
    //
    //  * 6.2.9 gebruikt `a = (A − 2·b·t_f)/A ≤ 0,5` — de **lijffractie** van de
    //    doorsnede. Met `t_f = ΣA_liggend/(2·b)` komt daar precies
    //    `A_lijf/A` uit, ook bij ongelijke flenzen. Voor de gelaste I uit D4.1
    //    levert dat de echte flensdikte terug: 6000/(2·200) = 15 mm.
    //  * de kipformules van de nationale bijlage (k_red, C₂-correctie) vragen
    //    om h, b, t_f en t_w; die draaien alleen op de dubbelsymmetrische
    //    gelaste I, waar `t_f` en `t_w` letterlijk de plaatdikten zijn.
    //
    // `t_w` wordt de **dunste** staande plaat: dat is de ongunstigste voor
    // `h/t_w` in k_red.
    if !custom.lamellen.is_empty() {
        let a_liggend: f64 = custom
            .lamellen
            .iter()
            .filter(|l| l.alpha_rad.sin().abs() <= l.alpha_rad.cos().abs())
            .map(|l| l.b_mm * l.t_mm)
            .sum();
        if props.b_mm > 0.0 {
            props.tf_mm = a_liggend / (2.0 * props.b_mm);
        }
        props.tw_mm = custom
            .lamellen
            .iter()
            .filter(|l| l.alpha_rad.sin().abs() > l.alpha_rad.cos().abs())
            .map(|l| l.t_mm)
            .fold(f64::INFINITY, f64::min);
        if !props.tw_mm.is_finite() {
            props.tw_mm = 0.0;
        }
    }

    // (1) Kip 6.3.2 — alleen op een dubbelsymmetrische gelaste I.
    let kip_weigering = if kip_toegestaan {
        None
    } else {
        Some(REDEN_KIP_NIET_DUBBELSYMMETRISCH.to_string())
    };

    // (3) Lijfplooi onder schuifkracht: NEN-EN 1993-1-5 §5.1(2) verlangt een
    //     plooitoets zodra h_w/t_w > 72ε/η. Die toets is niet geïmplementeerd,
    //     dus dan mag V_pl,Rd niet als weerstand doorgaan.
    let grens_lijfplooi = 72.0 * epsilon(grade) / ETA_SCHUIF;
    let schuif_weigering = custom
        .hw_over_tw()
        .filter(|hw| *hw > grens_lijfplooi)
        .map(|hw| reden_lijfplooi(hw, grens_lijfplooi));

    // (2) Klasse 4: geen effectieve breedtes, dus geen enkele weerstand.
    let totaal_weigering = (klasse == CrossSectionClass::Class4)
        .then(|| REDEN_KLASSE_4.to_string());

    // Knikkrommen: tabel 6.2, **gelaste** I-doorsnede. t_f ≤ 40 mm → b (y-y) en
    // c (z-z); t_f > 40 mm → c (y-y) en d (z-z). Een inline doorsnede erft
    // nooit stilzwijgend de gunstiger gewalste kromme.
    let (curve_y, curve_z) = if custom.flensdikte_mm() <= 40.0 {
        (BucklingCurve::B, BucklingCurve::C)
    } else {
        (BucklingCurve::C, BucklingCurve::D)
    };

    Ok(Doorsnede {
        naam: if custom.naam.is_empty() { input.profile_name.clone() } else { custom.naam.clone() },
        props,
        klasse,
        curve_y,
        curve_z,
        is_channel: false,
        // Een inline doorsnede heeft geen catalogusgeschiedenis en is per
        // definitie uit platen samengesteld, dus gelast. Kip draait hier
        // bovendien alleen op de dubbelsymmetrische gelaste I (zie
        // `kip_weigering`), precies de rij "gelaste I-profielen" van tabel 6.5.
        kip_profielsoort: Kipprofiel::GelasteI,
        kip_weigering,
        schuif_weigering,
        totaal_weigering,
        meldingen,
        kip_notities,
    })
}

fn uc_of(c: &NamedCheck) -> f64 {
    let (uc_opt, status_skip) = match &c.kind {
        CheckKind::Resistance(r) => (r.uc.as_ref().map(|u| u.uc), matches!(r.status, CheckStatus::NotApplicable)),
        CheckKind::Stability(s) => (s.uc.as_ref().map(|u| u.uc), matches!(s.status, CheckStatus::NotApplicable)),
    };
    if status_skip { 0.0 } else { uc_opt.unwrap_or(0.0) }
}

pub fn check_beam(input: BeamCheckInput) -> BeamCheckResult {
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

    // 4. Resolveer de doorsnede: inline (D4.3) of uit de database, inclusief
    //    de classificatie (buiging drijft de classificatie) en de expliciete
    //    weigeringen die bij die doorsnede horen.
    let doorsnede = match resolveer_doorsnede(&input, &grade, &gov_bending.forces) {
        Ok(d) => d,
        Err(reden) => return BeamCheckResult {
            beam_id: input.beam_id,
            profile_name: input.profile_name.clone(),
            steel_grade: input.steel_grade.clone(),
            classification: CrossSectionClass::Class1,
            checks: vec![],
            uc_max: 0.0,
            status: CheckStatus::NotApplicable,
            governing_check_id: reden,
        },
    };
    let p = &doorsnede.props;
    let classification = doorsnede.klasse;

    let mut checks: Vec<NamedCheck> = Vec::new();

    // Losse meldingen over de doorsnede zelf (bijvoorbeeld een gesloten cel
    // die niet is gedeclareerd) landen als eigen NotApplicable-regel.
    for (id, titel, reden) in &doorsnede.meldingen {
        checks.push(weigering(id, titel, "NEN-EN 1993-1-1 6.2.7 / kern", false,
            vec![reden.clone()], bend_state));
    }

    // Klasse 4 (weigering 2): geen effectieve breedtes volgens NEN-EN 1993-1-5,
    // dus geen enkele weerstands- of stabiliteitstoets. Alle twaalf toetsen
    // blijven mét reden in de lijst staan; alleen de doorbuigingstoets — puur
    // EI en dus altijd geldig — draait nog.
    if let Some(reden4) = doorsnede.totaal_weigering.clone() {
        for &(id, titel, artikel, stabiliteit) in TOETSEN.iter() {
            let mut redenen = vec![reden4.clone()];
            if let Some(r) = &doorsnede.schuif_weigering {
                if matches!(id, "6.2.6_shear_z" | "6.2.8_combined_mv" | "6.2.10_combined_mnv") {
                    redenen.push(r.clone());
                }
            }
            if let Some(r) = &doorsnede.kip_weigering {
                if matches!(id, "6.3.2_ltb" | "6.3.3_eq_6_61" | "6.3.3_eq_6_62") {
                    redenen.push(r.clone());
                }
            }
            let state = match id {
                "6.2.4_compression" | "6.3.1_buckling" => comp_state,
                "6.2.6_shear_z" | "6.2.6_shear_y" => shear_state,
                _ => bend_state,
            };
            checks.push(weigering(id, titel, artikel, stabiliteit, redenen, state));
        }
        let (defl_fin, defl_add) = check_deflection_pair(
            input.deflection_actual_max_mm,
            input.pre_camber_mm,
            input.deflection_permanent_mm,
            input.length_m,
            input.deflection_limit_class,
            input.deflection_limit_numerator,
        );
        checks.push(make_resistance(defl_fin));
        checks.push(make_resistance(defl_add));

        let mut uc_max = 0.0_f64;
        for c in &checks {
            uc_max = uc_max.max(uc_of(c));
        }
        return BeamCheckResult {
            beam_id: input.beam_id,
            profile_name: doorsnede.naam.clone(),
            steel_grade: input.steel_grade.clone(),
            classification,
            checks,
            uc_max,
            status: CheckStatus::NotApplicable,
            governing_check_id: format!("NIET TOETSBAAR: {reden4}"),
        };
    }

    // 5. Run cross-section resistance checks
    let comp = n_c_rd(p, &grade, comp_state);
    let n_c_rd_kn = comp.value;
    checks.push(make_resistance(comp));

    let bend_y = m_y_c_rd(p, &grade, classification, bend_state);
    let m_y_c_rd_knm = bend_y.value;
    checks.push(make_resistance(bend_y));

    let bend_z = m_z_c_rd(p, &grade, classification, bend_state);
    checks.push(make_resistance(bend_z));

    // Lijfplooi (weigering 3): boven 72ε/η draagt het lijf niet meer de volle
    // V_pl,Rd. Dan vervallen de schuiftoets om de z-as en alles wat V_pl,Rd
    // als weerstand gebruikt.
    // De volgorde van de checklijst blijft in beide takken gelijk:
    // V_z, V_y, M+V, M+N, M+N+V.
    let geweigerd_v = |id: &str, state: ForceStateSnapshot| -> NamedCheck {
        let (titel, artikel, stab) = toetsgegevens(id);
        weigering(id, titel, artikel, stab,
            vec![doorsnede.schuif_weigering.clone().unwrap_or_default()], state)
    };
    let v_z_pl_rd = if doorsnede.schuif_weigering.is_some() {
        checks.push(geweigerd_v("6.2.6_shear_z", shear_state));
        0.0 // wordt niet gebruikt: elke afnemer van V_pl,Rd is hieronder geweigerd
    } else {
        let shear_z = v_z_c_rd(p, &grade, shear_state);
        let v = shear_z.value;
        checks.push(make_resistance(shear_z));
        v
    };

    let shear_y = v_y_c_rd(p, &grade, shear_state);
    checks.push(make_resistance(shear_y));

    // Combined M+V and M+N checks use bending-governing location
    match doorsnede.schuif_weigering {
        Some(_) => checks.push(geweigerd_v("6.2.8_combined_mv", bend_state)),
        None => {
            let mv = check_combined_mv(p, &grade, classification, v_z_pl_rd, m_y_c_rd_knm, bend_state);
            checks.push(make_resistance(mv));
        }
    }

    let mn = check_combined_mn(p, &grade, classification, n_c_rd_kn, m_y_c_rd_knm, bend_state);
    checks.push(make_resistance(mn));

    match doorsnede.schuif_weigering {
        Some(_) => checks.push(geweigerd_v("6.2.10_combined_mnv", bend_state)),
        None => {
            let mnv = check_combined_mnv(p, &grade, classification, n_c_rd_kn, m_y_c_rd_knm, v_z_pl_rd, bend_state);
            checks.push(make_resistance(mnv));
        }
    }

    // 6. Member stability — column buckling 6.3.1 (compression-governing location)
    let curve_y = doorsnede.curve_y;
    let curve_z = doorsnede.curve_z;
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
    //
    //    Weigering (1): voor een inline doorsnede die géén dubbelsymmetrische
    //    gelaste I is, bestaat er geen M_cr. `m_cr_i_section` gebruikt alleen
    //    I_z en I_t en `m_cr_algemeen` I_w zonder monosymmetrieparameter z_j;
    //    beide veronderstellen dubbelsymmetrie. Dan blijft de kipcontrole leeg
    //    — mét reden — en vervalt 6.3.3, want dat deelt door M_b,Rd.
    let is_channel = doorsnede.is_channel;
    let m_b_rd_knm: f64;

    // De kipvelden van deze staaf (NB.NB.4.3).
    //
    // Drie beslissingen, en alle drie horen hier omdat de ltb-crate de
    // momentenlijn niet kent:
    //
    //  1. WELKE FLENS. Kip is uitknikken van de GEDRUKTE flens; een steun aan
    //     de getrokken flens telt niet mee. Bij sagging (M_y ≥ 0) gelden de
    //     bovenflenssteunen, bij hogging de onderflenssteunen. Vóór deze
    //     reparatie werd `bottom_flange_positions` nergens gelezen: een ligger
    //     met een bovenflenssteun halverwege en een onderflenssteun aan het
    //     eind rekende bij windzuiging met de halve kiplengte. De keuze valt
    //     PER STEUN, op het moment ter plaatse van die steun — niet één keer
    //     voor de hele staaf op het teken van het maatgevende moment; zie
    //     `LateralBracing::kipsteunen_op_de_gedrukte_flens` voor waarom dat
    //     laatste de uitkomst discontinu maakt in de belasting.
    //  2. WAAR DE VELDGRENZEN LIGGEN. Alleen de grootste tussenafstand kennen
    //     is niet genoeg — de eindmomenten moeten op de werkelijke veldgrenzen
    //     worden afgelezen, niet op L_st/4 vanaf x = 0.
    //  3. WELK VELD MAATGEVEND IS. Die keuze zit in de ltb-crate (laagste
    //     M_cr), want zij vergt de hele NB-keten; zie `maatgevend_kipveld`.
    let l_g_mm = input.length_m * 1000.0;
    let combo_id = gov_bending.combination_id;
    let kipsteunen = input
        .lateral_bracing
        .kipsteunen_op_de_gedrukte_flens(|f| {
            interpolate_my_at(&input.forces_envelope, f * l_g_mm, combo_id)
        });
    let grenzen = nen_en_1993_1_1_ltb::lambda_chi::kipveld_grenzen_mm(l_g_mm, &kipsteunen);
    // Zonder tussenliggende kipsteun is er één veld, en dat loopt van gaffel
    // tot gaffel: dan geldt L_kip = L_st en NIET de formule met β.
    let tussen_gaffels = grenzen.len() == 2;
    let kipvelden: Vec<Kipveld> = grenzen
        .windows(2)
        .map(|w| Kipveld {
            l_st_mm: w[1] - w[0],
            m_begin_knm: interpolate_my_at(&input.forces_envelope, w[0], combo_id),
            m_eind_knm: interpolate_my_at(&input.forces_envelope, w[1], combo_id),
            tussen_gaffels,
        })
        .collect();

    // β en B* hangen rechtstreeks aan de momenten op de STAAFEINDEN, en
    // `interpolate_my_at` houdt buiten het bemonsterde bereik de laatste waarde
    // vast. Reikt de omhullende van de maatgevende combinatie niet tot beide
    // uiteinden, dan zijn die eindmomenten dus niet gemeten maar doorgetrokken,
    // en de richting is onveilig: een vastgehouden veldmoment maakt van een
    // vrij opgelegde ligger een ligger onder eindmomenten (B* → ±1, C₁ van 1,13
    // naar 1,75) en daarmee M_cr te hoog. De invoer wordt niet gecorrigeerd —
    // de kern weet niet wat er niet bemonsterd is — maar het rapport hoort te
    // zeggen dat het hierop berust.
    let mut envelop_notities: Vec<String> = Vec::new();
    {
        let tol_mm = (l_g_mm * 1e-6).max(1e-9);
        let mut posities = input
            .forces_envelope
            .iter()
            .filter(|p| p.combination_id == combo_id)
            .map(|p| p.position_mm);
        if let Some(eerste) = posities.next() {
            let (mut min_mm, mut max_mm) = (eerste, eerste);
            for x in posities {
                min_mm = min_mm.min(x);
                max_mm = max_mm.max(x);
            }
            if min_mm > tol_mm || max_mm < l_g_mm - tol_mm {
                envelop_notities.push(format!(
                    "De momentenlijn van de maatgevende combinatie is bemonsterd van \
                     x = {min_mm:.0} tot x = {max_mm:.0} mm op een staaf van {l_g_mm:.0} mm. \
                     Buiten dat bereik is de laatst bemonsterde waarde vastgehouden, dus \
                     de eindmomenten waaruit β en B* volgen (NB.NB.4.3) zijn \
                     doorgetrokken en niet gemeten."
                ));
            }
        }
    }

    let ltb_check = if let Some(reden_kip) = doorsnede.kip_weigering.clone() {
        m_b_rd_knm = f64::NAN; // bestaat niet; elke afnemer is hieronder geweigerd
        let (titel, artikel, stab) = toetsgegevens("6.3.2_ltb");
        weigering("6.3.2_ltb", titel, artikel, stab, vec![reden_kip], bend_state)
    } else if is_channel {
        let mut ltb = m_b_rd_channel(
            p, &grade, l_g_mm, &kipvelden,
            input.q_equiv_n_per_mm,
            input.z_a_mm,
            bend_state,
        );
        ltb.notes.extend(envelop_notities.iter().cloned());
        let chi_lt = ltb.value;
        m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;
        make_stability(ltb)
    } else {
        let mut ltb = m_b_rd(
            p, &grade, l_g_mm, &kipvelden,
            input.q_equiv_n_per_mm,
            input.z_a_mm,
            doorsnede.kip_profielsoort,
            bend_state,
        );
        // Leeg voor een catalogusprofiel; gevuld als de dubbelsymmetrie op een
        // declaratie berust in plaats van op lamellen.
        ltb.notes.extend(doorsnede.kip_notities.iter().cloned());
        ltb.notes.extend(envelop_notities.iter().cloned());
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
    if let Some(reden_kip) = doorsnede.kip_weigering.clone() {
        // 6.61 en 6.62 delen door M_b,Rd; zonder kipcontrole bestaat dat getal
        // niet. Doorrekenen met χ_LT = 1 zou de kip stilzwijgend wegpoetsen.
        for id in ["6.3.3_eq_6_61", "6.3.3_eq_6_62"] {
            let (titel, artikel, stab) = toetsgegevens(id);
            checks.push(weigering(id, titel, artikel, stab,
                vec![REDEN_INTERACTIE_ZONDER_KIP.to_string(), reden_kip.clone()], bend_state));
        }
    } else {
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
    }

    // 9. Doorbuiging (BGT): eindzakking w_fin (L/klasse) en bijkomende
    //    zakking w_add (L/150), conform de referentie-uitwerking.
    let (defl_fin, defl_add) = check_deflection_pair(
        input.deflection_actual_max_mm,
        input.pre_camber_mm,
        input.deflection_permanent_mm,
        input.length_m,
        input.deflection_limit_class,
        input.deflection_limit_numerator,
    );
    checks.push(make_resistance(defl_fin));
    checks.push(make_resistance(defl_add));

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
        // Gelijk aan `input.profile_name` op het databasepad; bij een inline
        // doorsnede staat hier de naam waaronder hij in het rapport hoort.
        profile_name: doorsnede.naam.clone(),
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
