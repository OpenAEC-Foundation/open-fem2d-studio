//! k_mod per belastingduurklasse — EN 1995-1-1 3.1.3(2), met de hand nagerekend.
//!
//! WAT HIER MISGING (basisaudit nr 15 en 18)
//! De kern rekende met één belastingduurklasse voor de hele UGT-omhullende, in
//! de app standaard "middellang". Daardoor:
//! - kreeg de combinatie met alleen de blijvende belasting k_mod 0,80 in plaats
//!   van 0,60 (te gunstig: GL24h 160×400, alleen G, UC 0,801 waar 1,068 hoort);
//! - kreeg een combinatie met sneeuw leidend k_mod 0,80 in plaats van 0,90 (te
//!   streng: C24 100×300, G = 4 en S = 3, UC 0,472 waar 0,420 hoort).
//!
//! DE HANDBEREKENING, één keer voor alle gevallen
//! Rechthoek b × h: W = b·h²/6. Buiging zonder M_z: UC = (M/W) / f_m,d met
//! f_m,d = k_mod · k_h · f_m,k / γ_M (2.14).
//! - C24 (EN 338): f_m,k = 24, f_v,k = 4,0; γ_M = 1,30 (NB); k_h = 1,0 bij
//!   h = 300 ≥ 150 mm (3.2(3)).
//! - GL24h (EN 14080): f_m,k = 24; γ_M = 1,25 (NB); k_h = min((600/h)^0,1; 1,1)
//!   = 1,5^0,1 = 1,04138 bij h = 400 (3.3(3)).
//! - k_mod tabel 3.1, klimaatklasse 1: blijvend 0,60, lang 0,70, middellang
//!   0,80, kort 0,90; klimaatklasse 3: blijvend 0,50, kort 0,70.
//! De momenten zijn die van een vrij opgelegde ligger, M = q·L²/8, met q de
//! gefactoreerde lijnlast van de combinatie.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1995_1_1::clt::CltLayup;
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use steel_check::{CheckKind, NamedCheck};
use timber_check::clt::{check_clt_beam, CltBeamCheckInput};
use timber_check::{check_timber_beam, CombinationLoadDuration, TimberBeamCheckInput};

fn punt(combinatie: u32, x_mm: f64, n: f64, vz: f64, my: f64) -> ForcePoint {
    ForcePoint {
        combination_id: combinatie,
        position_mm: x_mm,
        forces: InternalForces { n_ed: n, vz_ed: vz, my_ed: my, ..Default::default() },
    }
}

fn duur(combinatie: u32, d: LoadDurationClass, basis: &str) -> CombinationLoadDuration {
    CombinationLoadDuration { combination_id: combinatie, load_duration: d, basis: basis.into() }
}

fn ligger(klasse: &str, b: f64, h: f64, l_m: f64, env: Vec<ForcePoint>) -> TimberBeamCheckInput {
    TimberBeamCheckInput {
        beam_id: 1,
        width_mm: b,
        height_mm: h,
        custom_section: None,
        strength_class: klasse.into(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        load_duration_per_combination: vec![],
        length_m: l_m,
        forces_envelope: env,
        buckling_length_y_m: 0.0,
        buckling_length_z_m: 0.0,
        lateral_bracing: None,
        ltb_segment_length_m: 0.0,
        ltb_load_case: nen_en_1995_1_1::stability::LtbLoadCase::UniformLoad,
        ltb_load_position: nen_en_1995_1_1::stability::LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: 0.0,
        perform_ltb_check: true,
        k_cr: 1.0,
        load_sharing: false,
        deflection_inst_mm: -8.0,
        deflection_quasi_perm_mm: -5.0,
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
        deflection_notes: vec![],
    }
}

fn toets<'a>(checks: &'a [NamedCheck], id: &str) -> &'a NamedCheck {
    checks.iter().find(|c| c.id == id).unwrap_or_else(|| panic!("toets {id} ontbreekt"))
}

fn uc(c: &NamedCheck) -> f64 {
    match &c.kind {
        CheckKind::Resistance(r) => r.uc.as_ref().map(|u| u.uc).unwrap_or(0.0),
        CheckKind::Stability(s) => s.uc.as_ref().map(|u| u.uc).unwrap_or(0.0),
    }
}

fn notities(c: &NamedCheck) -> &[String] {
    match &c.kind {
        CheckKind::Resistance(r) => &r.notes,
        CheckKind::Stability(s) => &s.notes,
    }
}

fn combinatie_van(c: &NamedCheck) -> u32 {
    match &c.kind {
        CheckKind::Resistance(r) => r.force_state.combination_id,
        CheckKind::Stability(s) => s.force_state.combination_id,
    }
}

const BUIGING: &str = "6.1.6_bending";

/// Het faalscenario van nr 18: GL24h 160×400, L = 3,5 m, alleen G = 26,45 kN/m.
/// M = 1,35·26,45·3,5²/8 = 54,677 kNm; W = 160·400²/6 = 4,2667·10⁶ mm³;
/// σ = 12,815 N/mm². f_m,d = 0,60·1,04138·24/1,25 = 11,997 → UC 1,068.
/// Met middellang (0,80): f_m,d = 15,996 → UC 0,801.
#[test]
fn alleen_blijvende_belasting_krijgt_k_mod_060() {
    let m = 1.35 * 26.45 * 3.5_f64.powi(2) / 8.0;
    let v = 1.35 * 26.45 * 3.5 / 2.0;
    let env = vec![punt(1, 0.0, 0.0, v, 0.0), punt(1, 1750.0, 0.0, 0.0, m)];
    let w = 160.0 * 400.0_f64.powi(2) / 6.0;
    let kh = 1.5_f64.powf(0.1);
    let uc_blijvend = (m * 1e6 / w) / (0.60 * kh * 24.0 / 1.25);
    let uc_middellang = (m * 1e6 / w) / (0.80 * kh * 24.0 / 1.25);
    assert_relative_eq!(uc_blijvend, 1.068, max_relative = 5e-4);
    assert_relative_eq!(uc_middellang, 0.801, max_relative = 5e-4);

    // Zonder lijst: het oude gedrag, één klasse (middellang) voor alles.
    let oud = check_timber_beam(ligger("GL24h", 160.0, 400.0, 3.5, env.clone()));
    assert_relative_eq!(uc(toets(&oud.checks, BUIGING)), uc_middellang, max_relative = 1e-9);
    assert!(oud.k_mod_per_load_duration.is_empty());
    assert_eq!(oud.governing_combination_id, None);

    // Met lijst: combinatie 1 is alleen G → blijvend.
    let mut invoer = ligger("GL24h", 160.0, 400.0, 3.5, env);
    invoer.load_duration_per_combination =
        vec![duur(1, LoadDurationClass::Permanent, "alleen blijvende belasting: geval 1 G")];
    let r = check_timber_beam(invoer);
    let buiging = toets(&r.checks, BUIGING);
    assert_relative_eq!(uc(buiging), uc_blijvend, max_relative = 1e-9);
    assert_eq!(r.status, nen_en_1995_1_1::CheckStatus::NotOk);
    assert_eq!(r.load_duration, LoadDurationClass::Permanent);
    assert_eq!(r.governing_combination_id, Some(1));
    assert_eq!(r.k_mod_per_load_duration.len(), 1);
    assert_relative_eq!(r.k_mod_per_load_duration[0].k_mod, 0.60);
    assert_eq!(r.k_mod_per_load_duration[0].combination_ids, vec![1]);
    assert_eq!(r.k_mod_per_load_duration[0].bases, vec!["combinatie 1: alleen blijvende belasting: geval 1 G".to_string()]);
    let n = notities(buiging).join(" ");
    assert!(n.contains("k_mod = 0,60"), "{n}");
    assert!(n.contains("klimaatklasse 1") && n.contains("blijvend") && n.contains("3.1.3(2)"), "{n}");
}

/// G = 4 en S = 3 kN/m op C24 100×300, L = 3 m (nr 15).
/// Combinatie 1 = 1,35·G = 5,40 kN/m → M = 6,075 kNm, blijvend: σ = 4,05,
///   f_m,d = 0,60·24/1,30 = 11,077 → UC 0,366.
/// Combinatie 2 = 1,2·G + 1,5·S = 9,30 kN/m → M = 10,4625 kNm, kort: σ = 6,975,
///   f_m,d = 0,90·24/1,30 = 16,615 → UC 0,420 (maatgevend).
/// Oud (middellang voor alles): 6,975 / 14,769 = 0,472.
#[test]
fn sneeuw_leidend_krijgt_k_mod_090_en_blijvend_rekent_mee() {
    let env = vec![
        punt(1, 1500.0, 0.0, 0.0, 5.40 * 9.0 / 8.0),
        punt(2, 1500.0, 0.0, 0.0, 9.30 * 9.0 / 8.0),
    ];
    let oud = check_timber_beam(ligger("C24", 100.0, 300.0, 3.0, env.clone()));
    assert_relative_eq!(uc(toets(&oud.checks, BUIGING)), 6.975 / (0.80 * 24.0 / 1.30), max_relative = 1e-9);
    assert_relative_eq!(uc(toets(&oud.checks, BUIGING)), 0.472, max_relative = 1e-3);

    let mut invoer = ligger("C24", 100.0, 300.0, 3.0, env);
    invoer.load_duration_per_combination = vec![
        duur(1, LoadDurationClass::Permanent, "alleen blijvende belasting"),
        duur(2, LoadDurationClass::ShortTerm, "kortste: geval 3 Sneeuw (S), kort"),
    ];
    let r = check_timber_beam(invoer);
    let buiging = toets(&r.checks, BUIGING);
    assert_relative_eq!(uc(buiging), 6.975 / (0.90 * 24.0 / 1.30), max_relative = 1e-9);
    assert_relative_eq!(uc(buiging), 0.420, max_relative = 1e-3);
    assert_eq!(combinatie_van(buiging), 2);
    assert_eq!(r.load_duration, LoadDurationClass::ShortTerm);
    assert_eq!(r.governing_combination_id, Some(2));
    let kmods: Vec<(LoadDurationClass, f64)> =
        r.k_mod_per_load_duration.iter().map(|k| (k.load_duration, k.k_mod)).collect();
    assert_eq!(kmods, vec![(LoadDurationClass::Permanent, 0.60), (LoadDurationClass::ShortTerm, 0.90)]);
    let n = notities(buiging).join(" ");
    assert!(n.contains("k_mod = 0,90"), "{n}");
    // De andere klasse staat erbij, met haar eigen unity check: 4,05/11,077 = 0,366.
    assert!(n.contains("blijvend (k_mod 0,60; combinatie 1) UC 0,366"), "{n}");
}

/// G = 9 en Q = 2 kN/m (categorie A, middellang) op C24 100×300, L = 3 m.
/// 1: 1,35·G = 12,15 kN/m → M = 13,669 kNm, blijvend: σ = 9,1125 → UC 0,823.
/// 2: 1,2·G + 1,5·Q = 13,80 kN/m → M = 15,525 kNm, middellang: σ = 10,35 → UC 0,701.
/// 3: 1,35·G + 1,5·0,4·Q = 13,35 kN/m → M = 15,019 kNm, middellang.
/// De combinatie met alleen G is maatgevend, met een KLEINER moment.
#[test]
fn kleine_veranderlijke_last_laat_de_combinatie_met_alleen_g_maatgevend() {
    let env = vec![
        punt(1, 1500.0, 0.0, 0.0, 12.15 * 9.0 / 8.0),
        punt(2, 1500.0, 0.0, 0.0, 13.80 * 9.0 / 8.0),
        punt(3, 1500.0, 0.0, 0.0, 13.35 * 9.0 / 8.0),
    ];
    let mut invoer = ligger("C24", 100.0, 300.0, 3.0, env);
    invoer.load_duration_per_combination = vec![
        duur(1, LoadDurationClass::Permanent, ""),
        duur(2, LoadDurationClass::MediumTerm, ""),
        duur(3, LoadDurationClass::MediumTerm, ""),
    ];
    let r = check_timber_beam(invoer);
    let buiging = toets(&r.checks, BUIGING);
    assert_relative_eq!(uc(buiging), 9.1125 / (0.60 * 24.0 / 1.30), max_relative = 1e-9);
    assert_relative_eq!(uc(buiging), 0.823, max_relative = 1e-3);
    assert_eq!(combinatie_van(buiging), 1);
    assert_eq!(r.governing_combination_id, Some(1));
    assert_eq!(r.k_mod_per_load_duration[1].combination_ids, vec![2, 3]);
    let n = notities(buiging).join(" ");
    assert!(n.contains("middellang (k_mod 0,80; combinatie 2, 3) UC 0,701"), "{n}");
}

/// Opslag (categorie E) is lang: k_mod 0,70. Klimaatklasse 3: blijvend 0,50 en
/// kort 0,70 (tabel 3.1).
#[test]
fn k_mod_volgt_tabel_31_voor_lang_en_klimaatklasse_3() {
    let env = vec![punt(5, 1500.0, 0.0, 0.0, 10.0)];
    let mut invoer = ligger("C24", 100.0, 300.0, 3.0, env.clone());
    invoer.load_duration_per_combination = vec![duur(5, LoadDurationClass::LongTerm, "opslag")];
    let r = check_timber_beam(invoer);
    assert_relative_eq!(r.k_mod_per_load_duration[0].k_mod, 0.70);
    assert_relative_eq!(uc(toets(&r.checks, BUIGING)), (10.0e6 / 1.5e6) / (0.70 * 24.0 / 1.30), max_relative = 1e-9);

    let env3 = vec![punt(1, 1500.0, 0.0, 0.0, 6.0), punt(2, 1500.0, 0.0, 0.0, 8.0)];
    let mut sc3 = ligger("C24", 100.0, 300.0, 3.0, env3);
    sc3.service_class = ServiceClass::Sc3;
    sc3.load_duration_per_combination = vec![
        duur(1, LoadDurationClass::Permanent, ""),
        duur(2, LoadDurationClass::ShortTerm, ""),
    ];
    let r3 = check_timber_beam(sc3);
    let k: Vec<f64> = r3.k_mod_per_load_duration.iter().map(|k| k.k_mod).collect();
    assert_eq!(k, vec![0.50, 0.70]);
    // 1: 4,0/(0,50·24/1,3) = 0,4333; 2: 5,333/(0,70·24/1,3) = 0,4127 → 1 maatgevend.
    assert_relative_eq!(uc(toets(&r3.checks, BUIGING)), 4.0 / (0.50 * 24.0 / 1.30), max_relative = 1e-9);
}

/// Een combinatie die niet in de lijst staat, valt op `load_duration` van de
/// staaf — zichtbaar in de basis, niet stil.
#[test]
fn onbekende_combinatie_valt_zichtbaar_terug_op_load_duration() {
    let env = vec![punt(1, 1500.0, 0.0, 0.0, 6.0), punt(9, 1500.0, 0.0, 0.0, 7.0)];
    let mut invoer = ligger("C24", 100.0, 300.0, 3.0, env);
    invoer.load_duration = LoadDurationClass::LongTerm;
    invoer.load_duration_per_combination = vec![duur(1, LoadDurationClass::Permanent, "")];
    let r = check_timber_beam(invoer);
    assert_eq!(r.k_mod_per_load_duration.len(), 2);
    let lang = &r.k_mod_per_load_duration[1];
    assert_eq!(lang.load_duration, LoadDurationClass::LongTerm);
    assert_eq!(lang.combination_ids, vec![9]);
    assert!(lang.bases[0].contains("terugval"), "{:?}", lang.bases);
}

/// De doorbuiging hangt niet van k_mod af en blijft identiek; de kolom- en
/// kiptoets rekenen in hun klasse met hetzelfde krachtpunt als de buigtoets.
#[test]
fn doorbuiging_ongewijzigd_en_stabiliteit_op_het_buigpunt_van_haar_klasse() {
    // Klasse blijvend: combinatie 1 met druk en een klein moment; klasse kort:
    // combinatie 2 met het grootste moment en geen druk.
    let env = vec![
        punt(1, 1500.0, -60.0, 0.0, 6.0),
        punt(2, 1500.0, 0.0, 0.0, 10.0),
        punt(2, 0.0, 0.0, 12.0, 0.0),
    ];
    let oud = check_timber_beam(ligger("C24", 100.0, 300.0, 3.0, env.clone()));
    let mut invoer = ligger("C24", 100.0, 300.0, 3.0, env.clone());
    invoer.load_duration_per_combination = vec![
        duur(1, LoadDurationClass::Permanent, ""),
        duur(2, LoadDurationClass::ShortTerm, ""),
    ];
    let r = check_timber_beam(invoer);
    for id in ["7.2_w_fin", "7.2_w_add"] {
        let (a, b) = (oud.checks.iter().find(|c| c.id.contains(id)), r.checks.iter().find(|c| c.id.contains(id)));
        if let (Some(a), Some(b)) = (a, b) {
            assert_relative_eq!(uc(a), uc(b), max_relative = 1e-12);
        }
    }
    // De twee doorbuigingsregels staan achteraan en zijn gelijk aan het oude resultaat.
    let n = r.checks.len();
    assert_eq!(n, oud.checks.len());
    for i in n - 2..n {
        assert_eq!(r.checks[i].id, oud.checks[i].id);
        assert_relative_eq!(uc(&r.checks[i]), uc(&oud.checks[i]), max_relative = 1e-12);
    }
    // Kolomknik is alleen in klasse blijvend van toepassing (daar drukt N); in
    // klasse kort is er geen drukkracht. De notitie zegt dan "niet van
    // toepassing" en geen "UC 0,000", want dat zou als een echte nul lezen.
    let kolom = toets(&r.checks, "6.3.2_column_stability");
    assert_eq!(combinatie_van(kolom), 1);
    let n = notities(kolom).join(" ");
    assert!(n.contains("kort (k_mod 0,90; combinatie 2) niet van toepassing"), "{n}");
    assert!(!n.contains("UC 0,000"), "{n}");
    // Elke stabiliteitstoets rekent met het buigpunt (grootste |M| + 0,01·|N|)
    // van de klasse waarin hij maatgevend werd.
    for c in &r.checks {
        if let CheckKind::Stability(s) = &c.kind {
            let klasse_pnt: Vec<&ForcePoint> =
                env.iter().filter(|p| p.combination_id == s.force_state.combination_id).collect();
            let buigpunt = klasse_pnt
                .iter()
                .max_by(|a, b| {
                    (a.forces.my_ed.abs() + a.forces.n_ed.abs() * 0.01)
                        .total_cmp(&(b.forces.my_ed.abs() + b.forces.n_ed.abs() * 0.01))
                })
                .unwrap();
            assert_relative_eq!(s.force_state.forces.my_ed, buigpunt.forces.my_ed);
            assert_relative_eq!(s.force_state.forces.n_ed, buigpunt.forces.n_ed);
        }
    }
}

/// Kruislaaghout: 5-laags 40/20/40/20/40 C24, strook 1000 mm.
/// Uit de eigen test van clt.rs: bij M = 20 kNm is σ in de buitenlaag 5,263 N/mm²
/// en bij V = 10 kN is τ_max in laag 1 0,07895 N/mm² (lineair in M en V).
/// Combinatie 1, blijvend: M = 10 kNm, V = 5 kN.
///   buiging laag 1: 2,6316 / (0,60·24/1,3 = 11,077) = 0,2376 (maatgevend);
///   schuif laag 1: 0,039475 / (0,60·4/1,3 = 1,8462) = 0,0214.
/// Combinatie 2, kort: M = 14 kNm, V = 10 kN.
///   buiging laag 1: 3,6842 / (0,90·24/1,3 = 16,615) = 0,2217;
///   schuif laag 1: 0,07895 / (0,90·4/1,3 = 2,7692) = 0,0285 (maatgevend voor schuif).
#[test]
fn clt_per_klasse_met_de_laagregel_uit_de_klasse_van_elke_toets() {
    let env = vec![
        ForcePoint { combination_id: 1, position_mm: 0.0, forces: InternalForces { vz_ed: 5.0, ..Default::default() } },
        ForcePoint { combination_id: 1, position_mm: 2500.0, forces: InternalForces { my_ed: 10.0, ..Default::default() } },
        ForcePoint { combination_id: 2, position_mm: 0.0, forces: InternalForces { vz_ed: 10.0, ..Default::default() } },
        ForcePoint { combination_id: 2, position_mm: 2500.0, forces: InternalForces { my_ed: 14.0, ..Default::default() } },
    ];
    let invoer = |lijst: Vec<CombinationLoadDuration>| CltBeamCheckInput {
        beam_id: 7,
        layup: CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0, 20.0, 40.0], "C24"),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        load_duration_per_combination: lijst,
        length_m: 5.0,
        forces_envelope: env.clone(),
        k_cr: 1.0,
        load_sharing: false,
    };
    let oud = check_clt_beam(invoer(vec![]));
    // Oud: middellang, M = 14 → 3,6842 / 14,769 = 0,2495.
    assert_relative_eq!(oud.uc_max, 3.6842 / (0.80 * 24.0 / 1.3), max_relative = 1e-3);

    let r = check_clt_beam(invoer(vec![
        duur(1, LoadDurationClass::Permanent, ""),
        duur(2, LoadDurationClass::ShortTerm, ""),
    ]));
    assert_relative_eq!(r.uc_max, 2.6316 / (0.60 * 24.0 / 1.3), max_relative = 1e-3);
    assert_eq!(r.governing_check_id, "clt_6.1.6_laag_1");
    assert_eq!(r.load_duration, LoadDurationClass::Permanent);
    assert_eq!(r.governing_combination_id, Some(1));
    let l1 = &r.layup.layers[0];
    assert_relative_eq!(l1.f_md_mpa, 0.60 * 24.0 / 1.3, max_relative = 1e-9);
    assert_relative_eq!(l1.sigma_top_mpa, -2.6316, max_relative = 1e-3);
    assert_relative_eq!(l1.f_vd_mpa, 0.90 * 4.0 / 1.3, max_relative = 1e-9);
    assert_relative_eq!(l1.tau_max_mpa, 0.07895, max_relative = 1e-3);
    assert_relative_eq!(l1.uc_shear.unwrap(), 0.07895 / (0.90 * 4.0 / 1.3), max_relative = 1e-3);
    // De dwarslaag toont de rolschuifspanning bij de grootste dwarskracht.
    assert_relative_eq!(r.layup.layers[1].tau_max_mpa, 0.07895, max_relative = 1e-3);
    assert!(r.notes.iter().any(|n| n.contains("Belastingduur per combinatie") && n.contains("blijvend (k_mod 0,60): combinatie 1")));
    let kmods: Vec<f64> = r.k_mod_per_load_duration.iter().map(|k| k.k_mod).collect();
    assert_eq!(kmods, vec![0.60, 0.90]);
}
