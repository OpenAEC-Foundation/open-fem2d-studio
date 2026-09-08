//! DE BEWAKING TEGEN UITEENLOPEN — de Rust-kant leest hier de **gedeelde**
//! referentie, dezelfde die de frontend leest.
//!
//! # Waarom dit bestand naast `betonfiguren_meetkunde.rs` staat
//!
//! Die test pint de Rust-uitkomsten vast op met de hand afgeleide getallen, en
//! dat blijft nuttig: hij legt uit wáárom een punt ligt waar hij ligt. Maar
//! zolang de frontend zijn eigen verwachte getallen droeg, bewaakte niets het
//! uiteenlopen zelf. Een verschoven staafhart bleef aan beide kanten groen
//! zolang je maar in beide suites het getal meeverschoof — en de TS-kant toetste
//! de staafharten helemaal niet op waarde, alleen op een grens ("min >= 200,
//! max <= 400"), waar elke verschuiving binnen die grens ongemerkt doorheen
//! glipt.
//!
//! Daarom is er nu één bestand met de verwachte punten, en lezen beide kanten
//! daaruit: `tests/golden/betonfiguren-referentie.json`. De andere lezer is
//! `design-mockup/test-betonfiguren-referentie.mjs`, die dezelfde gevallen door
//! `src/components/beton/wapeningskorf.ts` haalt. Geen van beide tests draagt
//! nog eigen getallen — verschuift één implementatie, dan valt die kant om.
//!
//! Hoe je de referentie bewust bijwerkt, staat in het JSON-bestand zelf onder
//! `bijwerken`.

use nen_en_1992_1_1::section::{ConcreteSectionInput, ConcreteShape, ReinforcementCage};
use report::betonfiguren::{
    breedte_op_hoogte_mm, hart_x_mm, omtrek_punten, staaf_posities, Rij,
};
use serde::Deserialize;

/// Het gedeelde bestand. Het pad staat hier vast in de bron: een test die zijn
/// referentie niet kan vinden moet omvallen, niet stilletjes overslaan.
const REFERENTIE: &str =
    concat!(env!("CARGO_MANIFEST_DIR"), "/tests/golden/betonfiguren-referentie.json");

#[derive(Deserialize)]
struct Referentie {
    tolerantie: Tolerantie,
    gevallen: Vec<Geval>,
}

#[derive(Deserialize)]
struct Tolerantie {
    absoluut_mm: f64,
    relatief: f64,
}

#[derive(Deserialize)]
struct Geval {
    naam: String,
    /// Letterlijk het invoertype van de kern, zodat het JSON-bestand geen
    /// tweede beschrijving van een doorsnede wordt.
    doorsnede: ConcreteSectionInput,
    korf: ReinforcementCage,
    omtrek_mm: Vec<[f64; 2]>,
    staven: Vec<Staaf>,
    /// Bemonsteringspunten voor `breedte_op_hoogte_mm` en `hart_x_mm`; mag leeg
    /// zijn waar een eerder geval dezelfde vorm al vastpint.
    #[serde(default)]
    breedte_op_hoogte: Vec<BreedtePunt>,
}

#[derive(Deserialize)]
struct Staaf {
    x_mm: f64,
    z_mm: f64,
    diameter_mm: f64,
    rij: String,
}

#[derive(Deserialize)]
struct BreedtePunt {
    z_mm: f64,
    breedte_mm: f64,
    hart_x_mm: f64,
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
        (werkelijk - verwacht).abs() <= self.absoluut_mm + self.relatief * verwacht.abs()
    }
}

/// De omtrek: evenveel punten, in dezelfde volgorde, op dezelfde plaats.
///
/// De volgorde telt mee. Dezelfde punten in een andere volgorde beschrijven een
/// andere polygoon, en de frontend en de PDF moeten hetzelfde pad lopen.
#[test]
fn omtrekpunten_volgen_de_gedeelde_referentie() {
    let ref_ = lees();
    for geval in &ref_.gevallen {
        let section = geval
            .doorsnede
            .build()
            .unwrap_or_else(|e| panic!("{}: de doorsnede uit de referentie bouwt niet: {e}", geval.naam));
        let werkelijk = omtrek_punten(&section);
        assert_eq!(
            werkelijk.len(),
            geval.omtrek_mm.len(),
            "{}: {} omtrekpunten in plaats van {} — {werkelijk:?} tegen {:?}",
            geval.naam,
            werkelijk.len(),
            geval.omtrek_mm.len(),
            geval.omtrek_mm
        );
        for (i, (w, v)) in werkelijk.iter().zip(&geval.omtrek_mm).enumerate() {
            assert!(
                ref_.tolerantie.gelijk(w.0, v[0]) && ref_.tolerantie.gelijk(w.1, v[1]),
                "{}: omtrekpunt {i} is ({}, {}) in plaats van ({}, {})",
                geval.naam,
                w.0,
                w.1,
                v[0],
                v[1]
            );
        }
    }
}

/// De staafharten: evenveel staven, in dezelfde volgorde (onder eerst), op
/// dezelfde plaats, met dezelfde diameter en aan dezelfde zijde.
#[test]
fn staafharten_volgen_de_gedeelde_referentie() {
    let ref_ = lees();
    for geval in &ref_.gevallen {
        let section = geval.doorsnede.build().expect("de doorsnede uit de referentie bouwt niet");
        let werkelijk = staaf_posities(&geval.korf, &section);
        assert_eq!(
            werkelijk.len(),
            geval.staven.len(),
            "{}: {} staven in plaats van {} — {werkelijk:?}",
            geval.naam,
            werkelijk.len(),
            geval.staven.len()
        );
        for (i, (w, v)) in werkelijk.iter().zip(&geval.staven).enumerate() {
            let kant = match v.rij.as_str() {
                "onder" => Rij::Onder,
                "boven" => Rij::Boven,
                anders => panic!("{}: staaf {i} heeft rij \"{anders}\"; alleen \"onder\" en \"boven\" bestaan", geval.naam),
            };
            assert!(
                ref_.tolerantie.gelijk(w.x_mm, v.x_mm)
                    && ref_.tolerantie.gelijk(w.z_mm, v.z_mm)
                    && ref_.tolerantie.gelijk(w.diameter_mm, v.diameter_mm)
                    && w.rij == kant,
                "{}: staaf {i} is {w:?} in plaats van (x {}, z {}, \u{d8} {}, {kant:?})",
                geval.naam,
                v.x_mm,
                v.z_mm,
                v.diameter_mm
            );
        }
    }
}

/// De breedte en het hart op de bemonsterde hoogten. Dat zijn de twee functies
/// waar alles op leunt: schuift `breedte_op_hoogte_mm` op een bandgrens, dan
/// schuift elke staaf mee.
#[test]
fn breedte_en_hart_volgen_de_gedeelde_referentie() {
    let ref_ = lees();
    let mut bemonsterd = 0usize;
    for geval in &ref_.gevallen {
        let section = geval.doorsnede.build().expect("de doorsnede uit de referentie bouwt niet");
        for punt in &geval.breedte_op_hoogte {
            let b = breedte_op_hoogte_mm(&section, punt.z_mm);
            let hart = hart_x_mm(&section, punt.z_mm);
            assert!(
                ref_.tolerantie.gelijk(b, punt.breedte_mm),
                "{}: breedte op z = {} is {b} in plaats van {}",
                geval.naam,
                punt.z_mm,
                punt.breedte_mm
            );
            assert!(
                ref_.tolerantie.gelijk(hart, punt.hart_x_mm),
                "{}: hart op z = {} is {hart} in plaats van {}",
                geval.naam,
                punt.z_mm,
                punt.hart_x_mm
            );
            bemonsterd += 1;
        }
    }
    assert!(bemonsterd >= 10, "de referentie bemonstert nog maar {bemonsterd} hoogten");
}

/// De referentie moet blijven dekken wat hij hoort te dekken. Zonder deze test
/// verdwijnt de bewaking door het weghalen van een geval, en blijft alles
/// groen.
#[test]
fn de_referentie_dekt_alle_vormen() {
    let ref_ = lees();
    assert!(ref_.gevallen.len() >= 6, "nog maar {} gevallen", ref_.gevallen.len());

    let heeft = |f: &dyn Fn(&Geval) -> bool| ref_.gevallen.iter().any(|g| f(g));
    assert!(heeft(&|g| g.doorsnede.shape == ConcreteShape::Rectangle), "geen rechthoek");
    assert!(
        heeft(&|g| g.doorsnede.shape == ConcreteShape::Tee && !g.doorsnede.flange_at_bottom),
        "geen T met de flens boven"
    );
    assert!(
        heeft(&|g| g.doorsnede.shape == ConcreteShape::Tee && g.doorsnede.flange_at_bottom),
        "geen omgekeerde T"
    );
    assert!(heeft(&|g| g.doorsnede.shape == ConcreteShape::Ell), "geen L");
    assert!(heeft(&|g| g.korf.top == g.korf.bottom), "geen symmetrisch gewapend geval");
    assert!(heeft(&|g| g.korf.top != g.korf.bottom), "geen asymmetrisch gewapend geval");
    assert!(heeft(&|g| g.korf.bottom.count == 1), "geen rij met één staaf");
    assert!(heeft(&|g| g.korf.top.is_empty()), "geen geval zonder bovenwapening");

    // Elke korf uit de referentie moet ook door de kerncontrole komen. Een
    // proefdoorsnede die de kern zou weigeren, bewaakt een tekening die nooit
    // getekend wordt.
    for geval in &ref_.gevallen {
        let section = geval.doorsnede.build().expect("de doorsnede uit de referentie bouwt niet");
        geval
            .korf
            .validate(&section)
            .unwrap_or_else(|e| panic!("{}: de korf uit de referentie is geen geldige korf: {e}", geval.naam));
    }
}
