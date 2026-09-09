//! DE BEWAKING TEGEN UITEENLOPEN (kruislaaghout) — de Rust-kant leest hier de
//! **gedeelde** referentie, dezelfde die de frontend leest.
//!
//! # Wat er precies bewaakt wordt
//!
//! De mechanica van een CLT-opbouw staat twee keer in dit project: in de kern
//! (`nen_en_1995_1_1::clt::CltMechanics`) en in de frontend
//! (`design-mockup/src/lib/cltCheckBuilder.ts`, `cltMechanica`). Die tweede is
//! geen tekenhulpje — via `sectionResolver.ts` levert hij de E, A en I waarmee
//! de SOLVER rekent. Loopt hij weg van de kern, dan rekent het model met een
//! andere plaat dan er getoetst wordt, en dat is aan geen enkel getal in de
//! uitdraai te zien.
//!
//! Sinds het houthoofdstuk tekent de PDF de opbouwfiguur ook na
//! (`report::houtfiguren`). Daarmee bestaat de BEMONSTERING van het
//! τ-verloop eveneens twee keer.
//!
//! Daarom staan de verwachte waarden op één plaats:
//! `tests/golden/cltmeetkunde-referentie.json`. De andere lezer is
//! `design-mockup/test-cltmeetkunde-referentie.mjs`. Geen van beide tests
//! draagt eigen getallen; verschuift één kant een laaggrens, een arm of een
//! monsterpunt, dan valt die kant om.
//!
//! Hoe je de referentie bewust bijwerkt, staat in het JSON-bestand zelf onder
//! `bijwerken`.
//!
//! # Waarom er geen weerstandsmoment in staat
//!
//! Omdat er er in deze keten geen is, en er ook geen definitie voor gekozen is
//! — zie `waarom_geen_wy` in het JSON-bestand. Bijlage B geeft de spanning per
//! laag rechtstreeks; een W_y hier verzinnen zou een bedachte grootheid in de
//! bewaking zetten.

use std::collections::BTreeMap;

use nen_en_1995_1_1::clt::{CltLayerOrientation, CltLayup, CltMechanics};
use nen_en_1995_1_1::strength_class_by_name;
use report::houtfiguren::{
    lagen_zelfde_e, sigma_verloop, tau_monster_z, tau_verloop, CLT_TAU_MONSTERS_LENGTELAAG,
};
use serde::Deserialize;

/// Het gedeelde bestand. Het pad staat hier vast in de bron: een test die zijn
/// referentie niet kan vinden moet omvallen, niet stilletjes overslaan.
const REFERENTIE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/golden/cltmeetkunde-referentie.json"
);

#[derive(Deserialize)]
struct Referentie {
    tolerantie: Tolerantie,
    e0_mean_mpa: BTreeMap<String, f64>,
    gevallen: Vec<Geval>,
}

#[derive(Deserialize)]
struct Tolerantie {
    absoluut: f64,
    relatief: f64,
}

#[derive(Deserialize)]
struct Geval {
    naam: String,
    /// Letterlijk het invoertype van de kern, zodat het JSON-bestand geen
    /// tweede beschrijving van een opbouw wordt.
    opbouw: CltLayup,
    krachten: Krachten,
    mechanica: Mechanica,
    lagen: Vec<Laag>,
    /// Paren [z_mm, tau_mpa], in de volgorde waarin de figuur ze tekent.
    tau_verloop: Vec<[f64; 2]>,
}

#[derive(Deserialize)]
struct Krachten {
    my_ed_knm: f64,
    vz_ed_kn: f64,
    k_cr: f64,
}

#[derive(Deserialize)]
struct Mechanica {
    hoogte_mm: f64,
    z0_mm: f64,
    ei_ef_nmm2: f64,
    ea_ef_n: f64,
    i_ef_net_mm4: f64,
    lagen_zelfde_e: bool,
}

#[derive(Deserialize)]
struct Laag {
    index: u32,
    z_top_mm: f64,
    z_bot_mm: f64,
    e_mpa: f64,
    a_mm2: f64,
    i_eigen_mm4: f64,
    arm_mm: f64,
    steiner_mm4: f64,
    sigma_top_mpa: f64,
    sigma_bot_mpa: f64,
}

fn lees() -> Referentie {
    let tekst = std::fs::read_to_string(REFERENTIE)
        .unwrap_or_else(|e| panic!("gedeelde referentie {REFERENTIE} niet te lezen: {e}"));
    serde_json::from_str(&tekst)
        .unwrap_or_else(|e| panic!("gedeelde referentie {REFERENTIE} niet te lezen als JSON: {e}"))
}

impl Tolerantie {
    /// Vergelijking op WAARDE, niet op een grens. De marge is
    /// `absoluut + relatief · |verwacht|`; waarom die zo klein mag zijn, staat
    /// in het JSON-bestand onder `tolerantie`.
    fn gelijk(&self, werkelijk: f64, verwacht: f64) -> bool {
        (werkelijk - verwacht).abs() <= self.absoluut + self.relatief * verwacht.abs()
    }
}

fn mechanica_van(geval: &Geval) -> CltMechanics {
    geval
        .opbouw
        .mechanics()
        .unwrap_or_else(|e| panic!("{}: de opbouw uit de referentie rekent niet: {e}", geval.naam))
}

/// De E-tabel. Hij staat twee keer met de hand overgetypt: in
/// `nen-en-1995-1-1/src/data.rs` (EN 338 tabel 1) en in
/// `design-mockup/src/lib/sectionResolver.ts`. Wijkt één van de twee af, dan
/// loopt dat verschil in élk ander getal van deze referentie mee zonder dat te
/// zien is waar het vandaan komt — dus wordt het hier apart vastgepind.
#[test]
fn de_e_modulus_per_klasse_volgt_de_gedeelde_referentie() {
    let ref_ = lees();
    assert!(!ref_.e0_mean_mpa.is_empty(), "de referentie noemt geen enkele sterkteklasse");
    for (klasse, e) in &ref_.e0_mean_mpa {
        let k = strength_class_by_name(klasse)
            .unwrap_or_else(|| panic!("sterkteklasse {klasse} bestaat niet in de kern"));
        assert!(
            ref_.tolerantie.gelijk(k.e0_mean, *e),
            "{klasse}: E_0,mean is {} in de kern en {e} in de referentie",
            k.e0_mean
        );
    }
}

/// Zwaartelijn, (EI)_ef, (EA)_ef en I_ef,net.
#[test]
fn de_stijfheden_volgen_de_gedeelde_referentie() {
    let ref_ = lees();
    for geval in &ref_.gevallen {
        let m = mechanica_van(geval);
        let v = &geval.mechanica;
        let t = &ref_.tolerantie;
        assert!(t.gelijk(m.height_mm, v.hoogte_mm), "{}: h is {}", geval.naam, m.height_mm);
        assert!(t.gelijk(m.z0_mm, v.z0_mm), "{}: z0 is {} in plaats van {}", geval.naam, m.z0_mm, v.z0_mm);
        assert!(
            t.gelijk(m.ei_ef_nmm2, v.ei_ef_nmm2),
            "{}: (EI)_ef is {} in plaats van {}",
            geval.naam,
            m.ei_ef_nmm2,
            v.ei_ef_nmm2
        );
        assert!(
            t.gelijk(m.ea_ef_n, v.ea_ef_n),
            "{}: (EA)_ef is {} in plaats van {}",
            geval.naam,
            m.ea_ef_n,
            v.ea_ef_n
        );
        assert!(
            t.gelijk(m.i_ef_net_mm4(), v.i_ef_net_mm4),
            "{}: I_ef,net is {} in plaats van {}",
            geval.naam,
            m.i_ef_net_mm4(),
            v.i_ef_net_mm4
        );
        assert_eq!(
            lagen_zelfde_e(&m),
            v.lagen_zelfde_e,
            "{}: 'alle lengtelagen dezelfde E' klopt niet",
            geval.naam
        );
    }
}

/// De opbouw van I_y per laag: A_i, I_i, a_i en de Steiner-term — de vier
/// getallen die in de uitdraai regel voor regel staan — plus de randspanningen.
///
/// Verschuift een laaggrens, dan verschuift de arm mee en valt dit blok om.
#[test]
fn de_opbouw_van_iy_volgt_de_gedeelde_referentie() {
    let ref_ = lees();
    for geval in &ref_.gevallen {
        let m = mechanica_van(geval);
        let t = &ref_.tolerantie;
        let sigma = sigma_verloop(&m, geval.krachten.my_ed_knm);
        assert_eq!(
            m.layers.len(),
            geval.lagen.len(),
            "{}: {} lagen in plaats van {}",
            geval.naam,
            m.layers.len(),
            geval.lagen.len()
        );
        let mut som_i = 0.0_f64;
        let mut som_ei = 0.0_f64;
        for (l, v) in m.layers.iter().zip(&geval.lagen) {
            let steiner = l.area_mm2 * l.arm_mm * l.arm_mm;
            assert_eq!((l.index + 1) as u32, v.index, "{}: laagvolgorde", geval.naam);
            for (naam, werkelijk, verwacht) in [
                ("z_boven", l.z_top_mm, v.z_top_mm),
                ("z_onder", l.z_bot_mm, v.z_bot_mm),
                ("E_i", l.e_mpa, v.e_mpa),
                ("A_i", l.area_mm2, v.a_mm2),
                ("I_i", l.i_own_mm4, v.i_eigen_mm4),
                ("a_i", l.arm_mm, v.arm_mm),
                ("A_i·a_i²", steiner, v.steiner_mm4),
                ("sigma boven", sigma[l.index][0].1, v.sigma_top_mpa),
                ("sigma onder", sigma[l.index][1].1, v.sigma_bot_mpa),
            ] {
                assert!(
                    t.gelijk(werkelijk, verwacht),
                    "{}: laag {} — {naam} is {werkelijk} in plaats van {verwacht}",
                    geval.naam,
                    v.index
                );
            }
            if l.e_mpa > 0.0 {
                som_i += l.i_own_mm4 + steiner;
            }
            som_ei += l.ei_contribution_nmm2();
        }
        // De somregel uit de uitdraai moet ook echt de som zijn.
        assert!(
            t.gelijk(som_ei, geval.mechanica.ei_ef_nmm2),
            "{}: Σ E_i·(I_i + A_i·a_i²) is {som_ei} en (EI)_ef {}",
            geval.naam,
            geval.mechanica.ei_ef_nmm2
        );
        if geval.mechanica.lagen_zelfde_e {
            assert!(
                t.gelijk(som_i, geval.mechanica.i_ef_net_mm4),
                "{}: Σ(I_i + A_i·a_i²) is {som_i} en I_ef,net {} — bij gelijke E horen die \
                 samen te vallen",
                geval.naam,
                geval.mechanica.i_ef_net_mm4
            );
        } else {
            assert!(
                !t.gelijk(som_i, geval.mechanica.i_ef_net_mm4),
                "{}: Σ(I_i + A_i·a_i²) en I_ef,net vallen samen terwijl de lengtelagen \
                 verschillende E hebben — dan bewaakt dit geval niets",
                geval.naam
            );
        }
    }
}

/// Het bemonsterde τ-verloop: evenveel punten, in dezelfde volgorde, op
/// dezelfde hoogte en met dezelfde waarde.
///
/// De volgorde telt mee: dezelfde punten in een andere volgorde tekenen een
/// andere lijn.
#[test]
fn het_tau_verloop_volgt_de_gedeelde_referentie() {
    let ref_ = lees();
    for geval in &ref_.gevallen {
        let m = mechanica_van(geval);
        let t = &ref_.tolerantie;
        let werkelijk = tau_verloop(&m, geval.krachten.vz_ed_kn, geval.krachten.k_cr);
        assert_eq!(
            werkelijk.len(),
            geval.tau_verloop.len(),
            "{}: {} monsterpunten in plaats van {}",
            geval.naam,
            werkelijk.len(),
            geval.tau_verloop.len()
        );
        for (i, ((z, tau), v)) in werkelijk.iter().zip(&geval.tau_verloop).enumerate() {
            assert!(
                t.gelijk(*z, v[0]) && t.gelijk(*tau, v[1]),
                "{}: monsterpunt {i} is ({z}, {tau}) in plaats van ({}, {})",
                geval.naam,
                v[0],
                v[1]
            );
        }
    }
}

/// DE FOUT WAARVOOR DIT BESTAND IN DE EERSTE PLAATS BESTAAT.
///
/// De hoogste τ die de figuur TEKENT moet dezelfde zijn als de τ_d die de
/// toets per laag rapporteert. Dat is alleen zo als de zwaartelijn een vast
/// monsterpunt is; zonder dat punt tekent een asymmetrische opbouw een piek
/// die onder de τ_d in de tabel ernaast ligt — dezelfde grootheid, twee
/// antwoorden op één blad.
#[test]
fn de_getekende_piek_haalt_de_tau_d_van_de_toets() {
    let ref_ = lees();
    for geval in &ref_.gevallen {
        let m = mechanica_van(geval);
        let (v_kn, k_cr) = (geval.krachten.vz_ed_kn, geval.krachten.k_cr);
        let getekend = tau_verloop(&m, v_kn, k_cr)
            .into_iter()
            .map(|(_, t)| t)
            .fold(0.0_f64, f64::max);
        let tau_d = (0..m.layers.len())
            .map(|i| m.layer_max_shear(i, v_kn, k_cr).tau_mpa)
            .fold(0.0_f64, f64::max);
        assert!(
            ref_.tolerantie.gelijk(getekend, tau_d),
            "{}: getekende piek {getekend} tegen τ_d van de toets {tau_d}",
            geval.naam
        );
    }
}

/// De referentie moet blijven dekken wat hij hoort te dekken. Zonder deze test
/// verdwijnt de bewaking door het weghalen van een geval, en blijft alles
/// groen.
#[test]
fn de_referentie_dekt_wat_hij_moet_dekken() {
    let ref_ = lees();
    assert!(ref_.gevallen.len() >= 5, "nog maar {} opbouwen", ref_.gevallen.len());
    let heeft = |f: &dyn Fn(&Geval) -> bool| ref_.gevallen.iter().any(|g| f(g));

    assert!(
        heeft(&|g| ref_
            .tolerantie
            .gelijk(g.mechanica.z0_mm, g.mechanica.hoogte_mm / 2.0)),
        "geen symmetrische opbouw"
    );

    // Het geval waarvoor de bewaking bestaat: z₀ binnen een lengtelaag, maar
    // NIET op een gelijkmatig monsterpunt.
    assert!(
        heeft(&|g| {
            let m = mechanica_van(g);
            m.layers
                .iter()
                .find(|l| l.e_mpa > 0.0 && m.z0_mm > l.z_top_mm && m.z0_mm < l.z_bot_mm)
                .is_some_and(|l| {
                    let stap = l.thickness_mm() / (CLT_TAU_MONSTERS_LENGTELAAG - 1) as f64;
                    let rest = ((m.z0_mm - l.z_top_mm) / stap).fract();
                    rest > 1e-6 && rest < 1.0 - 1e-6
                })
        }),
        "geen asymmetrische opbouw waarin z₀ tussen twee gelijkmatige monsterpunten valt"
    );

    // En het spiegelbeeld: z₀ in een DWARSlaag, waar hij juist géén
    // monsterpunt mag worden.
    assert!(
        heeft(&|g| {
            let m = mechanica_van(g);
            let in_dwarslaag = m
                .layers
                .iter()
                .any(|l| l.e_mpa == 0.0 && m.z0_mm > l.z_top_mm && m.z0_mm < l.z_bot_mm);
            in_dwarslaag
                && !tau_monster_z(&m)
                    .iter()
                    .any(|z| (*z - m.z0_mm).abs() < 1e-12)
        }),
        "geen opbouw waarin z₀ in een dwarslaag valt en daar terecht géén monsterpunt is"
    );

    assert!(
        heeft(&|g| !g.mechanica.lagen_zelfde_e),
        "geen opbouw met verschillende sterkteklassen in de lengtelagen"
    );
    assert!(
        heeft(&|g| g.opbouw.layers.first().map(|l| l.orientation)
            == Some(CltLayerOrientation::Transverse)),
        "geen opbouw met een dwarslaag als buitenlaag"
    );
    assert!(heeft(&|g| g.krachten.k_cr != 1.0), "geen geval met k_cr ≠ 1");
    assert!(heeft(&|g| g.krachten.my_ed_knm < 0.0), "geen geval met een negatief moment");
    assert!(
        heeft(&|g| g.opbouw.layers.len() == 3),
        "geen geval met het kleinste toegestane aantal lagen"
    );

    // Elke opbouw uit de referentie moet ook door de controle van de kern
    // komen. Een proefopbouw die de kern zou weigeren, bewaakt een tekening
    // die nooit getekend wordt.
    for geval in &ref_.gevallen {
        geval.opbouw.validate().unwrap_or_else(|e| {
            panic!("{}: de opbouw uit de referentie is niet geldig: {e}", geval.naam)
        });
    }
}
