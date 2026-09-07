//! De stateloze stijfheidsdienst, getoetst op de dingen die kapot mogen gaan.
//!
//! De doorsnede is de referentiedoorsnede die de hele betonkern gebruikt:
//! 300 × 500 mm, C30/37, B500B, dekking 30 mm, beugel Ø8, onder 3Ø16, boven
//! 2Ø12 (`concrete-check/tests/referentie_balk.rs`,
//! `nen-en-1992-1-1/tests/handberekening.rs`). Er is hier geen getal verzonnen:
//! elk verwacht getal is óf een tabelwaarde uit NEN-EN 1992-1-1, óf in de test
//! zelf uit die tabelwaarden narekend.

use concrete_check::segments::{
    segment_layout, segment_stiffness, SegmentForces, SegmentRunStatus, SegmentStatus,
    SegmentStiffnessRequest, DEFAULT_MAX_SEGMENTS,
};
use nen_en_1992_1_1::{
    concrete_class_by_name, ConcreteSectionInput, LoadDuration, NonlinearBasis, RebarRow,
    ReinforcementCage,
};

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/// De referentiekorf: **asymmetrisch**. Met een symmetrische korf is M₀ exact
/// nul en bewijst een M₀-test niets.
fn korf_asym() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
    }
}

fn korf_sym() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 3, diameter_mm: 16.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
    }
}

fn verzoek(length_m: f64, cage: ReinforcementCage) -> SegmentStiffnessRequest {
    SegmentStiffnessRequest {
        beam_id: 1,
        section: ConcreteSectionInput::rectangle(300.0, 500.0),
        concrete_class: "C30/37".to_string(),
        reinforcement_grade: "B500B".to_string(),
        cage,
        length_m,
        target_segment_length_mm: 400.0,
        max_segments: DEFAULT_MAX_SEGMENTS,
        limit_state: NonlinearBasis::DesignValues,
        phi_ef: 0.0,
        segment_forces: vec![],
        previous_ei_knm2: vec![],
        relaxation: 1.0,
        convergence_tolerance: 0.01,
        min_ei_ratio: 0.01,
        n_strips: 50,
        steel_branch: Default::default(),
        design_situation: Default::default(),
        load_duration: LoadDuration::ShortTerm,
    }
}

/// Krachten met een vaste N en een moment per segment.
fn krachten(n_kn: f64, momenten: &[f64]) -> Vec<SegmentForces> {
    momenten
        .iter()
        .map(|&m| SegmentForces { n_ed_kn: n_kn, m_ed_knm: m })
        .collect()
}

// ── Ronde 0: alleen de indeling ─────────────────────────────────────────────

/// Een verzoek zonder krachten levert de indeling en verder niets. Dat is de
/// bron van de elementgrenzen voor de adapter.
#[test]
fn ronde_nul_levert_alleen_de_indeling() {
    let r = segment_stiffness(verzoek(4.0, korf_asym())).unwrap();
    assert_eq!(r.status, SegmentRunStatus::Layout);
    assert!(!r.has_forces);
    assert!(!r.converged);
    assert_eq!(r.segment_count, 10);
    assert_eq!(r.segment_length_mm, 400.0);
    assert_eq!(r.segments.len(), 10);
    for (i, s) in r.segments.iter().enumerate() {
        assert_eq!(s.index, i as u32);
        assert_eq!(s.x_start_mm, 400.0 * i as f64);
        assert_eq!(s.x_end_mm, 400.0 * (i + 1) as f64);
        assert_eq!(s.x_mid_mm, 400.0 * i as f64 + 200.0);
        assert_eq!(s.status, SegmentStatus::Layout);
        // Geen getallen die als antwoord gelezen kunnen worden.
        assert!(s.ei_knm2.is_none());
        assert!(s.kappa_per_m.is_none());
        assert!(s.m0_knm.is_none());
        assert!(s.n_ed_kn.is_none());
    }
    assert!(r.max_relative_change.is_none());
}

/// **De indeling is lastgeval-onafhankelijk.** Dat is de hele reden dat hij in
/// de kern zit: verschuift de mesh per combinatie, dan zijn de stijfheden van
/// twee ronden niet meer vergelijkbaar en is de iteratie zinloos.
#[test]
fn de_indeling_is_lastgeval_onafhankelijk() {
    let leeg = segment_stiffness(verzoek(4.3, korf_asym())).unwrap();
    let grenzen: Vec<(f64, f64)> =
        leeg.segments.iter().map(|s| (s.x_start_mm, s.x_end_mm)).collect();
    assert_eq!(leeg.segment_count, 11); // round(4300/400) = round(10,75) = 11

    for (n, m) in [(0.0, 10.0), (-800.0, 40.0), (250.0, -25.0)] {
        let mut v = verzoek(4.3, korf_asym());
        v.segment_forces = krachten(n, &vec![m; grenzen.len()]);
        let r = segment_stiffness(v).unwrap();
        assert_eq!(r.segment_count, leeg.segment_count);
        let g: Vec<(f64, f64)> = r.segments.iter().map(|s| (s.x_start_mm, s.x_end_mm)).collect();
        assert_eq!(g, grenzen, "de indeling verschoof bij N = {n}, M = {m}");
    }
    // En hij is ook dezelfde in de andere grenstoestand.
    let mut bgt = verzoek(4.3, korf_asym());
    bgt.limit_state = NonlinearBasis::MeanValues;
    let r = segment_stiffness(bgt).unwrap();
    let g: Vec<(f64, f64)> = r.segments.iter().map(|s| (s.x_start_mm, s.x_end_mm)).collect();
    assert_eq!(g, grenzen);
}

/// Krachten die niet bij de indeling horen zijn een fout, geen stilzwijgende
/// bijsnijding. Anders schuift de hele tabel één segment op.
#[test]
fn een_verkeerd_aantal_krachten_is_een_fout() {
    let mut v = verzoek(4.0, korf_asym());
    v.segment_forces = krachten(0.0, &[10.0; 9]); // 9 in plaats van 10
    let e = segment_stiffness(v).unwrap_err();
    assert!(e.contains("10 segmenten"), "{e}");

    let mut v = verzoek(4.0, korf_asym());
    v.segment_forces = krachten(0.0, &[10.0; 10]);
    v.previous_ei_knm2 = vec![1000.0; 3];
    assert!(segment_stiffness(v).is_err());
}

// ── De ongescheurde stijfheid ───────────────────────────────────────────────

/// **Een ongescheurde balk levert de ongescheurde stijfheid.**
///
/// Dat moet in de BGT worden getoetst, niet in de UGT: 5.8.6(5) laat de
/// betontrek weg, dus in de UGT bestaat er geen ongescheurde tak (zie
/// `nen-en-1992-1-1::stiffness::ugt_kent_geen_ongescheurde_tak_want_geen_betontrek`).
/// In de BGT is ζ = 0 onder M_cr (7.4.3(3)) en rekent de kern met de
/// "als ongescheurd beschouwde" doorsnede.
///
/// De verwachte waarde is hier van de grond af nagerekend. Bij een kleine
/// kromming is elk materiaal nog lineair, en dan geldt met N vast:
///
/// ```text
///   N = A_E·ε₀ + S_E·κ ,   M = S_E·ε₀ + I_E·κ   (beide om h/2)
///   ⇒  M − M₀ = (I_E − S_E²/A_E)·κ  ⇒  EI = I_E − S_E²/A_E
/// ```
///
/// dus de raaklijnstijfheid van de getransformeerde doorsnede om háár eigen
/// zwaartepunt. De onderdelen:
///
/// * beton: begintangens van (3.14) = 1,05·E_cm (φ_ef = 0), over de bruto
///   doorsnede. De kern integreert met de middelpuntsregel over `n_strips`
///   stroken, en die geeft voor ∫z²  precies (h³/12)·(1 − 1/n²) — die factor
///   staat er dus bij, anders zou de test een verschil van 1/n² als fout
///   aanwijzen dat geen fout is;
/// * wapening: E_s = 200 000 N/mm² op haar arm ten opzichte van h/2. Het door
///   de wapening verdrongen beton wordt niet afgetrokken, gelijk aan de rest
///   van de kern.
#[test]
fn een_ongescheurde_balk_levert_de_ongescheurde_stijfheid() {
    let n_strips = 200_u32;
    let mut v = verzoek(4.0, korf_asym());
    v.limit_state = NonlinearBasis::MeanValues;
    v.n_strips = n_strips;
    // 2 kNm ligt ruim onder het scheurmoment (f_ctm·W_c = 2,9 · 12,5·10⁶ =
    // 36,25 kNm) en houdt de rek in de uiterste vezel op enkele microstrains,
    // waar (3.14) nog binnen een promille lineair is.
    v.segment_forces = krachten(0.0, &[2.0; 10]);
    let r = segment_stiffness(v).unwrap();

    let beton = concrete_class_by_name("C30/37").unwrap();
    let (b, h) = (300.0_f64, 500.0_f64);
    let e_c0 = 1.05 * beton.e_cm; // begintangens van (3.14), φ_ef = 0
    let e_s = 200_000.0_f64;
    // Lagen: onder 3Ø16 op z = 30 + 8 + 8 = 46 mm, boven 2Ø12 op
    // z = 500 − 30 − 8 − 6 = 456 mm.
    let a_bot = 3.0 * std::f64::consts::PI * 8.0_f64.powi(2);
    let a_top = 2.0 * std::f64::consts::PI * 6.0_f64.powi(2);
    let (arm_bot, arm_top) = (46.0 - h / 2.0, 456.0 - h / 2.0);

    let n = n_strips as f64;
    let a_e = e_c0 * b * h + e_s * (a_bot + a_top);
    let s_e = e_s * (a_bot * arm_bot + a_top * arm_top);
    let i_e = e_c0 * b * h.powi(3) / 12.0 * (1.0 - 1.0 / (n * n))
        + e_s * (a_bot * arm_bot.powi(2) + a_top * arm_top.powi(2));
    let verwacht = (i_e - s_e * s_e / a_e) * 1e-9; // N·mm² → kNm²

    let gemeten = r.segments[0].ei_knm2.expect("een stijfheid");
    println!(
        "ongescheurd (BGT): EI = {:.1} MNm², handberekening {:.1} MNm², E_cm·I_c = {:.1} MNm², \
         afwijking {:.3} %",
        gemeten * 1e-3,
        verwacht * 1e-3,
        r.ei_uncracked_knm2 * 1e-3,
        100.0 * (gemeten - verwacht) / verwacht
    );
    assert!(
        (gemeten - verwacht).abs() / verwacht < 2e-3,
        "EI = {gemeten}, verwacht {verwacht}"
    );
    // Ongescheurd, ζ = 0 en de vergelijkingswaarde E_cm·I_c staat erbij.
    for s in &r.segments {
        assert_eq!(s.status, SegmentStatus::Uncracked);
        assert_eq!(s.cracked, Some(false));
        assert_eq!(s.zeta, Some(0.0));
    }
    assert!((r.ei_uncracked_knm2 - beton.e_cm * b * h.powi(3) / 12.0 * 1e-9).abs() < 1e-6);
    // De BGT rekent met f_cm en E_cm (tabel 3.1), de UGT met f_cd en E_cd.
    assert!((r.f_c_mpa - beton.f_cm).abs() < 1e-12);
    assert!((r.e_c_mpa - beton.e_cm).abs() < 1e-12);
    assert!((r.f_ctm_mpa - beton.f_ctm).abs() < 1e-12);
}

// ── Boven het scheurmoment ──────────────────────────────────────────────────

/// **Een balk boven M_cr heeft monotoon dalende segment-EI.**
///
/// Vrij opgelegde balk van 6 m onder een gelijkmatig verdeelde belasting:
/// M(x) = q·x·(L − x)/2, met q zo gekozen dat het veldmoment 100 kNm wordt en
/// dus onder de momentweerstand van 113,33 kNm blijft (de handberekening in
/// `nen-en-1992-1-1/tests/handberekening.rs`). Naar het midden toe groeit het
/// moment, dus de stijfheid moet dalen — en na het midden weer stijgen, want
/// het momentenverloop is symmetrisch.
#[test]
fn boven_het_scheurmoment_daalt_de_segment_ei_monotoon() {
    let l = 6.0_f64;
    let q = 8.0 * 100.0 / (l * l); // kN/m, zodat q·L²/8 = 100 kNm
    let indeling = segment_layout(l * 1000.0, 400.0, DEFAULT_MAX_SEGMENTS).unwrap();
    assert_eq!(indeling.len(), 15);
    let momenten: Vec<f64> = indeling
        .iter()
        .map(|s| {
            let x = s.x_mid_mm() / 1000.0;
            q * x * (l - x) / 2.0
        })
        .collect();

    let mut v = verzoek(l, korf_asym());
    v.segment_forces = krachten(0.0, &momenten);
    let r = segment_stiffness(v).unwrap();
    assert_eq!(r.status, SegmentRunStatus::NotConverged); // geen vorige ronde
    assert_eq!(r.failed_count, 0);
    assert_eq!(r.clamped_count, 0);

    println!(" seg   x [mm]   M [kNm]   M_cr [kNm]   EI [MNm²]  gescheurd  status");
    let mut gescheurd = 0;
    for s in &r.segments {
        println!(
            "{:>4} {:>8.0} {:>9.2} {:>12.2} {:>11.1}  {:>9}  {:?}",
            s.index,
            s.x_mid_mm,
            s.m_ed_knm.unwrap(),
            s.m_cr_knm.unwrap(),
            s.ei_knm2.unwrap() * 1e-3,
            s.cracked.unwrap(),
            s.status
        );
        if s.cracked.unwrap() {
            gescheurd += 1;
        }
    }
    assert!(gescheurd >= 9, "maar {gescheurd} segmenten boven M_cr");

    // Oplopend moment ⇒ dalende stijfheid, tot en met het middensegment.
    for i in 1..=7 {
        let vorige = r.segments[i - 1].ei_knm2.unwrap();
        let deze = r.segments[i].ei_knm2.unwrap();
        assert!(
            r.segments[i].m_ed_knm.unwrap() > r.segments[i - 1].m_ed_knm.unwrap(),
            "segment {i}: het moment loopt niet op"
        );
        assert!(deze < vorige, "segment {i}: EI stijgt van {vorige} naar {deze}");
    }
    // En het verloop is symmetrisch, want het momentenverloop is dat ook.
    for i in 0..7 {
        let links = r.segments[i].ei_knm2.unwrap();
        let rechts = r.segments[14 - i].ei_knm2.unwrap();
        assert!((links - rechts).abs() / links < 1e-9, "{links} vs {rechts}");
    }
    // Alle segmenten boven M_cr zijn ook echt als gescheurd gemeld.
    for s in &r.segments {
        assert_eq!(
            s.cracked.unwrap(),
            s.m_ed_knm.unwrap().abs() > s.m_cr_knm.unwrap().abs(),
            "segment {}: `cracked` klopt niet met M en M_cr",
            s.index
        );
    }
}

// ── M₀ ──────────────────────────────────────────────────────────────────────

/// **M₀ bij een asymmetrische korf.** Het moment wordt om de geometrische
/// middenvezel h/2 genomen, dus bij een asymmetrische korf onder druk levert de
/// normaalkracht zelf al een moment. Bij een symmetrische korf is M₀ exact nul
/// — een test met alléén die korf zou deze fout niet vinden.
#[test]
fn m0_klopt_bij_een_asymmetrische_korf() {
    let mut asym = verzoek(4.0, korf_asym());
    asym.segment_forces = krachten(-800.0, &[20.0; 10]);
    let a = segment_stiffness(asym).unwrap();

    let mut sym = verzoek(4.0, korf_sym());
    sym.segment_forces = krachten(-800.0, &[20.0; 10]);
    let s = segment_stiffness(sym).unwrap();

    let m0_a = a.segments[0].m0_knm.expect("M₀");
    let m0_s = s.segments[0].m0_knm.expect("M₀");
    println!("N = −800 kN: M₀ asymmetrisch = {m0_a:.3} kNm, symmetrisch = {m0_s:.3} kNm");
    assert!(m0_a < -1.0, "M₀ = {m0_a}");
    assert!(m0_s.abs() < 1e-9, "M₀ = {m0_s}");

    // Alle segmenten dragen hetzelfde M₀ bij dezelfde N — M₀ hangt van de
    // doorsnede en de normaalkracht af, niet van het moment.
    for seg in &a.segments {
        assert!((seg.m0_knm.unwrap() - m0_a).abs() < 1e-12);
    }

    // Zonder de M₀-correctie zou EI hier meetbaar anders uitvallen: de
    // correctie is geen afrondingsdetail.
    let seg = &a.segments[0];
    let zonder = seg.m_ed_knm.unwrap() / seg.kappa_per_m.unwrap();
    println!(
        "EI = {:.1} MNm², zonder M₀-correctie {:.1} MNm²",
        seg.ei_knm2.unwrap() * 1e-3,
        zonder * 1e-3
    );
    assert!(seg.ei_knm2.unwrap() > 1.15 * zonder);

    // En bij een negatief moment keert het teken van de kromming om terwijl
    // EI positief blijft.
    let mut neg = verzoek(4.0, korf_asym());
    neg.segment_forces = krachten(-800.0, &[-20.0; 10]);
    let n = segment_stiffness(neg).unwrap();
    assert!(n.segments[0].kappa_per_m.unwrap() < 0.0);
    assert!(n.segments[0].ei_knm2.unwrap() > 0.0);
    assert!((n.segments[0].m0_knm.unwrap() - m0_a).abs() < 1e-12);
}

// ── Niet-convergentie ───────────────────────────────────────────────────────

/// **Een niet-convergent geval levert een nette fout en géén getal.**
///
/// Een moment boven de momentweerstand heeft geen kromming waarbij de
/// doorsnede het draagt. Dan hoort er geen stijfheid uit te komen — ook niet
/// een hele kleine, of een nul, want beide lezen in een raamwerk als een
/// geldige waarde.
#[test]
fn een_onbereikbaar_moment_levert_geen_getal() {
    let mut v = verzoek(4.0, korf_asym());
    // M_Rd is 113,33 kNm bij deze korf; 500 kNm is onbereikbaar. Segment 3 en
    // 7 krijgen dat, de rest een gewoon moment.
    let mut m = vec![20.0_f64; 10];
    m[3] = 500.0;
    m[7] = -500.0;
    v.segment_forces = krachten(0.0, &m);
    let r = segment_stiffness(v).unwrap();

    assert_eq!(r.status, SegmentRunStatus::Failed);
    assert_eq!(r.failed_count, 2);
    assert!(!r.converged);
    for i in [3_usize, 7] {
        let s = &r.segments[i];
        assert_eq!(s.status, SegmentStatus::Failed);
        assert!(s.ei_knm2.is_none(), "segment {i} leverde tóch een getal");
        assert!(s.ei_raw_knm2.is_none());
        let melding = s.message.as_ref().expect("een reden");
        println!("segment {i}: {melding}");
        assert!(melding.contains("momentweerstand"), "{melding}");
    }
    // De overige segmenten zijn wél gerekend: één slecht segment maakt de hele
    // tabel niet onbruikbaar.
    // M = 20 kNm ligt onder M_cr = 36,25 kNm, dus die segmenten zijn
    // ongescheurd — maar wél gerekend.
    for i in [0_usize, 1, 2, 4, 5, 6, 8, 9] {
        assert!(r.segments[i].ei_knm2.is_some(), "segment {i} ontbreekt");
        assert_eq!(r.segments[i].status, SegmentStatus::Uncracked);
        assert!(r.segments[i].message.is_none());
    }
    assert!(r.notes.iter().any(|n| n.contains("geen stijfheid")), "{:?}", r.notes);

    // Te veel druk levert een even nette fout.
    let mut v = verzoek(4.0, korf_asym());
    v.segment_forces = krachten(-50_000.0, &[10.0; 10]);
    let r = segment_stiffness(v).unwrap();
    assert_eq!(r.status, SegmentRunStatus::Failed);
    assert_eq!(r.failed_count, 10);
    assert!(r.segments.iter().all(|s| s.ei_knm2.is_none()));
    println!("te veel druk: {}", r.segments[0].message.as_ref().unwrap());
}

// ── Convergentie, relaxatie en klemmen ──────────────────────────────────────

/// Twee ronden met dezelfde krachten: de tweede ronde vindt dezelfde
/// stijfheden en meldt convergentie.
#[test]
fn dezelfde_krachten_twee_keer_geeft_convergentie() {
    let mut v = verzoek(4.0, korf_asym());
    v.segment_forces = krachten(-400.0, &[10.0, 20.0, 30.0, 40.0, 50.0, 50.0, 40.0, 30.0, 20.0, 10.0]);
    let eerste = segment_stiffness(v.clone()).unwrap();
    assert_eq!(eerste.status, SegmentRunStatus::NotConverged);
    assert!(eerste.max_relative_change.is_none());
    assert!(eerste.notes.iter().any(|n| n.contains("vorige ronde")));

    v.previous_ei_knm2 = eerste.segments.iter().map(|s| s.ei_knm2.unwrap()).collect();
    let tweede = segment_stiffness(v).unwrap();
    assert_eq!(tweede.status, SegmentRunStatus::Converged);
    assert!(tweede.converged);
    let m = tweede.max_relative_change.expect("een maat");
    println!("grootste relatieve verandering: {m:.3e} (segment {:?})", tweede.governing_segment);
    assert!(m < 1e-12, "{m}");
}

/// **Relaxatie mag geen convergentie voorwenden.** De convergentiemaat rekent
/// met de onbewerkte stijfheid, niet met de gerelaxeerde: anders zou een
/// voldoende zware demping elke ronde als "geconvergeerd" melden terwijl de
/// oplossing nog volop beweegt.
#[test]
fn relaxatie_kan_geen_convergentie_voorwenden() {
    let mut v = verzoek(4.0, korf_asym());
    v.segment_forces = krachten(0.0, &[60.0; 10]);
    let kaal = segment_stiffness(v.clone()).unwrap();
    let raw = kaal.segments[0].ei_raw_knm2.unwrap();

    // Vorige ronde stond op het dubbele: de werkelijke verandering is 50 %.
    v.previous_ei_knm2 = vec![2.0 * raw; 10];
    v.relaxation = 0.01; // zware demping
    let r = segment_stiffness(v).unwrap();

    let s = &r.segments[0];
    assert!(s.relaxed);
    // De teruggegeven waarde is nauwelijks van de vorige afgeweken …
    let teruggegeven = s.ei_knm2.unwrap();
    let schijnbaar = (teruggegeven - 2.0 * raw).abs() / (2.0 * raw);
    // … maar de gemelde verandering is die van de onbewerkte waarde.
    let gemeld = s.relative_change.unwrap();
    println!(
        "onbewerkt {:.0} kNm², vorige {:.0}, teruggegeven {:.0}; schijnbare verandering {:.4}, \
         gemelde verandering {:.4}",
        raw,
        2.0 * raw,
        teruggegeven,
        schijnbaar,
        gemeld
    );
    assert!(schijnbaar < 0.02, "de relaxatie dempte niet: {schijnbaar}");
    assert!((gemeld - 0.5).abs() < 1e-9, "gemelde verandering = {gemeld}");
    assert!(!r.converged);
    assert_eq!(r.status, SegmentRunStatus::NotConverged);
    assert!(r.notes.iter().any(|n| n.contains("ONBEWERKTE")), "{:?}", r.notes);
}

/// **Een geklemde waarde is een verzinsel en telt nooit als convergentie.**
/// De klem houdt het globale stelsel oplosbaar, maar zodra hij ingrijpt is de
/// ronde per definitie geen oplossing — ook niet als alle veranderingen binnen
/// de tolerantie vielen.
#[test]
fn klemmen_is_zichtbaar_en_verhindert_convergentie() {
    let mut v = verzoek(4.0, korf_asym());
    v.segment_forces = krachten(0.0, &[100.0; 10]);
    let kaal = segment_stiffness(v.clone()).unwrap();
    let raw = kaal.segments[0].ei_raw_knm2.unwrap();
    assert_eq!(kaal.clamped_count, 0);

    // Zet de ondergrens boven de werkelijke stijfheid, zodat de klem zeker
    // ingrijpt. De verhouding zelf is een instelling, geen normwaarde.
    let ratio = 1.5 * raw / kaal.ei_uncracked_knm2;
    v.min_ei_ratio = ratio;
    v.previous_ei_knm2 = vec![raw; 10]; // identiek: zonder klem zou dit convergeren
    let r = segment_stiffness(v).unwrap();

    assert_eq!(r.clamped_count, 10);
    let s = &r.segments[0];
    assert!(s.clamped);
    assert!((s.ei_raw_knm2.unwrap() - raw).abs() < 1e-9, "de onbewerkte waarde is weg");
    assert!(s.ei_knm2.unwrap() > raw, "er is niet geklemd");
    assert!((s.ei_knm2.unwrap() - r.min_ei_knm2).abs() < 1e-9);
    let melding = s.message.as_ref().expect("een melding bij de klem");
    println!("{melding}");
    assert!(melding.contains("ondergrens"));
    // De verandering is nul, en tóch niet geconvergeerd.
    assert!(r.max_relative_change.unwrap() < 1e-12);
    assert!(!r.converged);
    assert_eq!(r.status, SegmentRunStatus::NotConverged);
    assert!(r.notes.iter().any(|n| n.contains("geklemd")), "{:?}", r.notes);
}

// ── Besluit B1 en B2 ────────────────────────────────────────────────────────

/// **φ_ef = 0 staat er met zoveel woorden, en niet stilzwijgend** (besluit B1).
#[test]
fn de_kruipvermelding_van_besluit_b1_staat_in_het_antwoord() {
    let r = segment_stiffness(verzoek(4.0, korf_asym())).unwrap();
    assert_eq!(r.phi_ef, 0.0);
    assert!(r.creep_neglected);
    let note = &r.creep_note;
    println!("{note}");
    assert!(note.contains("ZONDER kruip"));
    assert!(note.contains("φ_ef = 0"));
    assert!(note.contains("ONVEILIGE KANT"));
    assert!(note.contains("5.8.6(4)"));
    assert!(r.notes.iter().any(|n| n == note));

    // Met kruip verandert de vermelding én de uitkomst (5.8.6(4)).
    let mut met = verzoek(4.0, korf_asym());
    met.phi_ef = 2.0;
    met.segment_forces = krachten(-400.0, &[30.0; 10]);
    let met = segment_stiffness(met).unwrap();
    assert!(!met.creep_neglected);
    assert!(met.creep_note.contains("1 + φ_ef) = 3.000"), "{}", met.creep_note);

    let mut zonder = verzoek(4.0, korf_asym());
    zonder.segment_forces = krachten(-400.0, &[30.0; 10]);
    let zonder = segment_stiffness(zonder).unwrap();
    assert!(
        met.segments[0].ei_knm2.unwrap() < zonder.segments[0].ei_knm2.unwrap(),
        "kruip maakt de doorsnede niet slapper"
    );
}

/// **De gebruikte variant staat per segment in het antwoord** (besluit B2).
/// Nooit impliciet: UGT en BGT geven bij hetzelfde moment een andere stijfheid,
/// en wie de tabel leest moet kunnen zien welke van de twee er staat.
#[test]
fn de_grenstoestand_staat_per_segment_in_het_antwoord() {
    let beton = concrete_class_by_name("C30/37").unwrap();
    let mut ugt = verzoek(4.0, korf_asym());
    ugt.segment_forces = krachten(0.0, &[60.0; 10]);
    let ugt = segment_stiffness(ugt).unwrap();

    let mut bgt = verzoek(4.0, korf_asym());
    bgt.limit_state = NonlinearBasis::MeanValues;
    bgt.segment_forces = krachten(0.0, &[60.0; 10]);
    let bgt = segment_stiffness(bgt).unwrap();

    assert_eq!(ugt.limit_state, NonlinearBasis::DesignValues);
    assert_eq!(bgt.limit_state, NonlinearBasis::MeanValues);
    assert!(ugt.limit_state_label.contains("UGT"));
    assert!(bgt.limit_state_label.contains("BGT"));
    for s in &ugt.segments {
        assert_eq!(s.basis, NonlinearBasis::DesignValues);
        assert!(s.zeta.is_none(), "5.8.6(5): in de UGT geen tension stiffening");
    }
    for s in &bgt.segments {
        assert_eq!(s.basis, NonlinearBasis::MeanValues);
        let z = s.zeta.expect("7.4.3(3) hoort in de BGT gevuld te zijn");
        assert!((0.0..=1.0).contains(&z), "ζ = {z}");
    }
    // UGT: f_cd = 1,0·30/1,5 = 20 N/mm², E_cd = E_cm/1,2 = 27 500 N/mm².
    assert!((ugt.f_c_mpa - 20.0).abs() < 1e-9);
    assert!((ugt.e_c_mpa - beton.e_cm / 1.2).abs() < 1e-9);
    // BGT: f_cm en E_cm uit tabel 3.1.
    assert!((bgt.f_c_mpa - beton.f_cm).abs() < 1e-12);
    assert!((bgt.e_c_mpa - beton.e_cm).abs() < 1e-12);
    // De BGT is stijver: zij houdt de betontrek en de tension stiffening.
    println!(
        "M = 60 kNm: EI_UGT = {:.1} MNm², EI_BGT = {:.1} MNm²",
        ugt.segments[0].ei_knm2.unwrap() * 1e-3,
        bgt.segments[0].ei_knm2.unwrap() * 1e-3
    );
    assert!(bgt.segments[0].ei_knm2.unwrap() > ugt.segments[0].ei_knm2.unwrap());

    // β van (7.19) staat er ook bij, en werkt alleen in de BGT.
    assert_eq!(bgt.load_duration, LoadDuration::ShortTerm);
    assert!((bgt.beta - 1.0).abs() < 1e-12);
    let mut lang = verzoek(4.0, korf_asym());
    lang.limit_state = NonlinearBasis::MeanValues;
    lang.load_duration = LoadDuration::Sustained;
    lang.segment_forces = krachten(0.0, &[60.0; 10]);
    let lang = segment_stiffness(lang).unwrap();
    assert!((lang.beta - 0.5).abs() < 1e-12);
    assert!(lang.segments[0].ei_knm2.unwrap() < bgt.segments[0].ei_knm2.unwrap());
}

// ── Onzin wordt geweigerd ───────────────────────────────────────────────────

#[test]
fn ongeldige_instellingen_leveren_een_fout() {
    let geval: Vec<(&str, Box<dyn Fn(&mut SegmentStiffnessRequest)>)> = vec![
        ("onbekende betonklasse", Box::new(|v: &mut SegmentStiffnessRequest| v.concrete_class = "C99/99".into())),
        ("onbekend wapeningsstaal", Box::new(|v: &mut SegmentStiffnessRequest| v.reinforcement_grade = "B999".into())),
        ("lengte nul", Box::new(|v: &mut SegmentStiffnessRequest| v.length_m = 0.0)),
        ("negatieve φ_ef", Box::new(|v: &mut SegmentStiffnessRequest| v.phi_ef = -1.0)),
        ("relaxatie nul", Box::new(|v: &mut SegmentStiffnessRequest| v.relaxation = 0.0)),
        ("relaxatie boven 1", Box::new(|v: &mut SegmentStiffnessRequest| v.relaxation = 1.5)),
        ("tolerantie nul", Box::new(|v: &mut SegmentStiffnessRequest| v.convergence_tolerance = 0.0)),
        ("klemverhouding 1", Box::new(|v: &mut SegmentStiffnessRequest| v.min_ei_ratio = 1.0)),
        ("korf past niet", Box::new(|v: &mut SegmentStiffnessRequest| v.cage.cover_mm = 400.0)),
    ];
    for (naam, aanpassing) in geval {
        let mut v = verzoek(4.0, korf_asym());
        aanpassing(&mut v);
        let e = segment_stiffness(v).unwrap_err();
        println!("{naam}: {e}");
        assert!(!e.is_empty());
    }
}
