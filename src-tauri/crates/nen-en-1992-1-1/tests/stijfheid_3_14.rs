//! Twee dingen die de bibliotheek niet zelf kan bewijzen.
//!
//! 1. **De doorsnedetoetsing is onveranderd.** Er zijn twee betondiagrammen
//!    bijgekomen (3.1.5 vgl. (3.14) in twee varianten) naast het bestaande
//!    parabool-rechthoekdiagram van 3.1.7. Dat mag de weerstand niet
//!    verschuiven. Deze tests leggen de uitkomsten van de toetsing op het
//!    laatste bit vast, zodat een latere verwisseling van diagram meteen
//!    opvalt.
//! 2. **De rekentijd.** De fysisch niet-lineaire tweede orde roept de kern
//!    per staafsegment per iteratie aan, dus de kosten per aanroep zijn een
//!    ontwerpgegeven en geen bijzaak. De metingen staan hieronder en worden
//!    afgedrukt.
//!
//! Referentiedoorsnede: b × h = 300 × 500 mm, C30/37, B500B, dekking 30 mm,
//! beugel Ø8, onder 3Ø16, boven 2Ø12.

use approx::assert_relative_eq;
use nen_en_1992_1_1::bending::stress_block;
use nen_en_1992_1_1::stiffness::{ei_secant, kappa_from_nm, m0_knm, StiffnessOptions};
use nen_en_1992_1_1::{
    concrete_class_by_name, mn_kappa_diagram, reinforcement_grade_by_name, solve_state,
    DesignMaterial, DesignSituation, MnKappaOptions, NonlinearBasis, RebarLayer, RebarRow,
    RectConcreteSection, ReinforcementCage, SteelBranch,
};
use std::time::Instant;

fn doorsnede() -> RectConcreteSection {
    RectConcreteSection::new(300.0, 500.0)
}

fn korf(boven: u32) -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: boven, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        ..ReinforcementCage::default()
    }
}

fn toetsmateriaal() -> DesignMaterial {
    DesignMaterial::new(
        concrete_class_by_name("C30/37").unwrap(),
        reinforcement_grade_by_name("B500B").unwrap(),
        DesignSituation::PersistentTransient,
        SteelBranch::Horizontal,
    )
}

fn stijfheidsmateriaal(basis: NonlinearBasis, phi_ef: f64) -> DesignMaterial {
    DesignMaterial::nonlinear(
        concrete_class_by_name("C30/37").unwrap(),
        reinforcement_grade_by_name("B500B").unwrap(),
        DesignSituation::PersistentTransient,
        SteelBranch::Horizontal,
        basis,
        phi_ef,
    )
}

/// **De toetsuitkomsten mogen niet zijn verschoven.** `DesignMaterial::new`
/// levert nog steeds het parabool-rechthoekdiagram van 3.1.7 en de
/// doorsnedetoetsing rekent er bit-identiek mee door.
///
/// Twee redenen waarom dat geen kwestie van vertrouwen is:
///
/// * `stress_block` (3.1.7(3)) komt helemaal niet langs `internal_forces` —
///   die rekent met λ, η en `mat.steel.sigma`, geen van alle geraakt.
/// * In `internal_forces` is `mat.concrete.sigma(ε)` vervangen door
///   `mat.sigma_c(ε)`, en dat is bij `nonlinear: None` letterlijk diezelfde
///   aanroep. Het bewijs staat hieronder: **113,12286139035288 kNm** is de
///   waarde die vóór deze uitbreiding al in `openaec-mcp-server/README.md`
///   stond opgeschreven, en die komt er tot op het laatste bit weer uit.
#[test]
fn doorsnedetoetsing_is_bit_identiek_gebleven() {
    let s = doorsnede();
    let m = toetsmateriaal();
    let o = MnKappaOptions::default();

    // Dubbel gewapend: onder 3Ø16, boven 2Ø12.
    let lagen = korf(2).layers(s.h_mm);
    let blok = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap();
    let mnk = mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &o);
    assert_eq!(blok.m_rd_knm, 113.29232963145907, "spanningsblok, 2Ø12 boven");
    assert_eq!(mnk.m_max_knm, 113.12286139035288, "M-N-κ, 2Ø12 boven");
    assert_eq!(mnk.kappa_u_per_m, 0.07026452382057882);

    // Enkelvoudig gewapend: alleen onder 3Ø16 (de handberekening van
    // `tests/handberekening.rs`, M_Rd = 113,33 kNm).
    let l1 = korf(0).layers(s.h_mm);
    assert_eq!(
        stress_block(&s, &l1, &m, 0.0, 1.0).unwrap().m_rd_knm,
        113.33216951431505,
        "spanningsblok, zonder bovenwapening"
    );
    assert_eq!(
        mn_kappa_diagram(&s, &l1, &m, 0.0, 1.0, &o).m_max_knm,
        113.1742295589604,
        "M-N-κ, zonder bovenwapening"
    );

    // En M(κ = 0) bij druk, de waarden waar de M₀-correctie op gebouwd is.
    for (n, verwacht) in [(-200.0, -0.9808796482167925), (-800.0, -4.127887365409146)] {
        let st = solve_state(&s, &lagen, &m, n, 0.0, &o).unwrap();
        assert_eq!(st.m_knm, verwacht, "M₀ bij N = {n} kN");
    }

    // Het materiaal draagt geen niet-lineaire kromme, en `sigma_c` is dus
    // letterlijk het parabool-rechthoekdiagram.
    assert!(m.nonlinear.is_none());
    for e in [-0.002_f64, 0.0, 0.0005, 0.001, 0.002, 0.0035, 0.01] {
        assert_eq!(m.sigma_c(e), m.concrete.sigma(e));
    }
}

/// Het toevoegen van een (3.14)-kromme raakt alléén dat materiaal: een
/// tweede, gewoon materiaal naast een niet-lineair materiaal blijft
/// onveranderd rekenen.
#[test]
fn een_niet_lineair_materiaal_besmet_het_toetsmateriaal_niet() {
    let s = doorsnede();
    let lagen = korf(2).layers(s.h_mm);
    let o = MnKappaOptions::default();
    let nl = stijfheidsmateriaal(NonlinearBasis::DesignValues, 0.0);
    let _ = mn_kappa_diagram(&s, &lagen, &nl, 0.0, 1.0, &o);
    let m = toetsmateriaal();
    assert_eq!(
        stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap().m_rd_knm,
        113.29232963145907
    );
    assert_eq!(mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &o).m_max_knm, 113.12286139035288);
}

/// De secante buigstijfheid van de referentiedoorsnede, in beide varianten,
/// naast de ongescheurde vergelijkingswaarde. Deze test rekent niets af; hij
/// drukt de tabel af die in het verslag staat en bewaakt alleen de orde.
#[test]
fn tabel_van_de_referentiedoorsnede() {
    let s = doorsnede();
    let lagen: Vec<RebarLayer> = korf(2).layers(s.h_mm);
    let o = StiffnessOptions::default();
    let i_c = 300.0 * 500.0_f64.powi(3) / 12.0;
    println!("E_cm·I_c (ongescheurd, bruto beton) = {:.1} MNm²", 33_000.0 * i_c * 1e-12);
    println!("E_cd·I_c (E_cd = E_cm/1,2)          = {:.1} MNm²", 27_500.0 * i_c * 1e-12);
    for basis in [NonlinearBasis::DesignValues, NonlinearBasis::MeanValues] {
        let m = stijfheidsmateriaal(basis, 0.0);
        println!("\n{}", basis.label());
        println!("   N [kN]   M [kNm]     κ [1/m]   EI [MNm²]   M₀ [kNm]  M_cr [kNm]  gescheurd   ζ");
        for (n, mm) in [
            (0.0, 10.0),
            (0.0, 30.0),
            (0.0, 60.0),
            (0.0, 90.0),
            (-400.0, 30.0),
            (-400.0, 90.0),
            (-800.0, 20.0),
            (-800.0, 100.0),
        ] {
            let r = ei_secant(&s, &lagen, &m, n, mm, &o).unwrap();
            let zeta = r.tension_stiffening.map(|t| t.zeta).unwrap_or(f64::NAN);
            println!(
                "{n:>9.0} {mm:>9.1} {:>11.3e} {:>11.1} {:>10.2} {:>11.1}   {:>8}   {zeta:.3}",
                r.kappa_per_m,
                r.ei_mnm2(),
                r.m0_knm,
                r.m_cr_knm,
                r.cracked
            );
            assert!(r.ei_knm2 > 0.0 && r.ei_knm2.is_finite());
            assert!(r.ei_knm2 < 1.1 * r.ei_uncracked_knm2 * 1.05);
            assert_eq!(r.basis, basis);
            assert_relative_eq!(r.phi_ef, 0.0);
            assert!(!r.beyond_eps_cu1);
        }
    }
}

/// **Rekentijd.** De kosten per aanroep, want de tweede orde roept dit per
/// staafsegment per iteratie aan.
///
/// De meting draait ook in het debug-profiel, waar hij een factor tien tot
/// twintig ongunstiger uitvalt dan in release. Draai
/// `cargo test -p nen-en-1992-1-1 --release --test stijfheid_3_14 -- --nocapture`
/// voor de getallen die tellen.
#[test]
fn rekentijd_van_de_kern() {
    let s = doorsnede();
    let lagen: Vec<RebarLayer> = korf(2).layers(s.h_mm);
    let mnk = MnKappaOptions::default();
    let o = StiffnessOptions::default();
    let ugt = stijfheidsmateriaal(NonlinearBasis::DesignValues, 0.0);
    let bgt = stijfheidsmateriaal(NonlinearBasis::MeanValues, 0.0);
    let toets = toetsmateriaal();

    // De kromming/momenten worden per aanroep gevarieerd, zodat er geen
    // deelantwoord blijft hangen en de optimalisator niets kan wegstrepen.
    let herhaal = 400;
    let meet = |naam: &str, f: &dyn Fn(usize) -> f64| {
        // Opwarmen.
        let mut som = 0.0;
        for i in 0..20 {
            som += f(i);
        }
        let t = Instant::now();
        for i in 0..herhaal {
            som += f(i);
        }
        let per = t.elapsed().as_secs_f64() / herhaal as f64;
        println!("{naam:<52} {:>9.1} µs   (Σ = {som:.3e})", per * 1e6);
        per
    };

    let profiel = if cfg!(debug_assertions) { "debug" } else { "release" };
    println!("\nprofiel: {profiel}; 50 stroken; referentiedoorsnede 300 × 500\n");

    let t_solve = meet("solve_state (κ opgelegd, parabool-rechthoek 3.1.7)", &|i| {
        let kap = 1e-3 + i as f64 * 1e-5;
        solve_state(&s, &lagen, &toets, -400.0, kap, &mnk).unwrap().m_knm
    });
    meet("solve_state (κ opgelegd, (3.14) UGT)", &|i| {
        let kap = 1e-3 + i as f64 * 1e-5;
        solve_state(&s, &lagen, &ugt, -400.0, kap, &mnk).unwrap().m_knm
    });
    let t_kappa = meet("kappa_from_nm ((N, M) → κ, (3.14) UGT)", &|i| {
        let mm = 20.0 + i as f64 * 0.1;
        kappa_from_nm(&s, &lagen, &ugt, -400.0, mm, &mnk).unwrap().kappa_per_m
    });
    meet("m0_knm (M bij κ = 0)", &|i| {
        let n = -400.0 - i as f64 * 0.1;
        m0_knm(&s, &lagen, &ugt, n, 1.0, &mnk).unwrap()
    });
    let t_ugt = meet("ei_secant UGT (M₀ + κ)", &|i| {
        let mm = 20.0 + i as f64 * 0.1;
        ei_secant(&s, &lagen, &ugt, -400.0, mm, &o).unwrap().ei_knm2
    });
    let t_bgt = meet("ei_secant BGT (M₀ + κ_I + κ_II + σ_sr, 7.4.3)", &|i| {
        let mm = 60.0 + i as f64 * 0.1;
        ei_secant(&s, &lagen, &bgt, 0.0, mm, &o).unwrap().ei_knm2
    });

    println!(
        "\nvolledig M-κ-diagram (61 punten, parabool-rechthoek): {:.2} ms",
        {
            let t = Instant::now();
            let d = mn_kappa_diagram(&s, &lagen, &toets, 0.0, 1.0, &mnk);
            let dt = t.elapsed().as_secs_f64() * 1e3;
            assert!(d.points.len() > 50);
            dt
        }
    );
    println!(
        "\nEén staaf van 4 m in segmenten van 400 mm = 10 segmenten:\n\
         \x20 UGT {:.2} ms per iteratie, BGT {:.2} ms per iteratie.",
        10.0 * t_ugt * 1e3,
        10.0 * t_bgt * 1e3
    );

    // Geen harde drempel — dit is een meting, geen eis. Wel een ruime
    // bovengrens die een ontsporing (een lus die niet convergeert en het
    // iteratieplafond haalt) zichtbaar maakt.
    assert!(t_solve < 5e-3, "solve_state {t_solve} s");
    assert!(t_kappa < 20e-3, "kappa_from_nm {t_kappa} s");
    assert!(t_bgt < 60e-3, "ei_secant BGT {t_bgt} s");
}
