//! Regressietest op `It` van de U-profielen (UPE en UNP).
//!
//! # Waarom deze test bestaat
//!
//! `It` van een gewalst U-profiel had in de database een empirische waarde die
//! van de I-profielformule was afgeleid door de uitrondings- en uiteindetermen
//! te halveren. Die waarde lag op alle 27 U-profielen boven de bewezen
//! bovengrens van de numerieke torsiemotor: 4,6 tot 12,0 procent te hoog. Dat
//! is niet zomaar onnauwkeurig maar **onveilig**, want `It` gaat via
//!
//! ```text
//! M_cr ~ sqrt( Iz · Iw + Iz · It · L²·G/(π²·E) )
//! ```
//!
//! recht in de kipcapaciteit: een te hoge `It` geeft een te hoge `M_cr`, een te
//! lage slankheid, een te hoge reductiefactor en dus een unity check die er te
//! gunstig uitziet.
//!
//! De waarden komen nu uit `section_properties::torsie`, die het probleem van
//! Prandtl numeriek oplost en de uitkomst insluit tussen een bewezen onder- en
//! bovengrens. Deze test legt dat vast: hij rekent elk U-profiel opnieuw door
//! en eist dat de opgeslagen waarde binnen die insluiting valt.
//!
//! # Waarom er ook een meetkundecontrole in zit
//!
//! De insluiting geldt voor de doorsnede die je de motor voert. Reken je een
//! UNP met evenwijdige flenzen door, dan krijg je een geldige insluiting om een
//! verkeerd profiel, en een foute `It` kan daar ongemerkt in vallen. Precies
//! die val heeft eerder de UNP-reeks als "onbeslist" laten wegschrijven.
//!
//! Daarom controleert de test eerst dat het gekozen geometriemodel het
//! opgeslagen `A` en `Iy` reproduceert, en dat de twee modellen niet
//! verwisselbaar zijn: bij een UNP levert de evenwijdige contour aantoonbaar
//! een ander oppervlak op. Slaagt die controle niet, dan zegt de insluiting
//! niets en faalt de test.

use section_properties::contour::{self, Doorsnede};
use section_properties::torsie::{self, TorsieOpties};
use steel_profiles::{ProfileKind, SteelProfile};

/// Elementen door de dunste wand. De motor vult de database op zijn
/// standaarddichtheid (8); deze test rekent bewust grover, zodat hij in een
/// debug-build binnen enkele seconden klaar is. Grover betekent een BREDERE
/// insluiting, dus de test wordt er alleen maar toegeeflijker van — hij kan
/// niet vals alarm slaan doordat het net te grof staat.
const ELEMENTEN_PER_WAND: f64 = 4.0;

/// De UNP-reeks (DIN 1026-1) heeft 8 procent flenshelling, de UPE-reeks
/// (DIN 1026-2) evenwijdige flenzen. De database kent beide als `Channel`;
/// het onderscheid zit alleen in de naam.
fn is_unp(naam: &str) -> bool {
    naam.chars()
        .filter(|c| c.is_ascii_alphabetic())
        .flat_map(|c| c.to_uppercase())
        .collect::<String>()
        .starts_with("UNP")
}

/// De contour die bij een U-profiel hoort, per reeks het juiste model.
fn contour_van(p: &SteelProfile) -> Doorsnede {
    let g = &p.geometry;
    if is_unp(&p.name) {
        contour::unp(g.h, g.b, g.tw, g.tf, g.r)
    } else {
        contour::u_profiel(g.h, g.b, g.tw, g.tf, g.r)
    }
}

fn u_profielen() -> Vec<&'static SteelProfile> {
    steel_profiles::db()
        .all()
        .iter()
        .filter(|p| p.kind == ProfileKind::Channel)
        .collect()
}

fn rel(a: f64, b: f64) -> f64 {
    (a - b) / b
}

/// Het geometriemodel moet kloppen vóórdat de insluiting iets betekent.
#[test]
fn geometriemodel_reproduceert_de_opgeslagen_doorsnede() {
    let profielen = u_profielen();
    assert_eq!(profielen.len(), 27, "aantal U-profielen in de catalogus");

    for p in &profielen {
        let e = contour_van(p).bereken();
        let q = &p.properties;
        // Twaalf van de dertien UNP's en alle veertien UPE's komen uit dezelfde
        // meetkunde als de contour en vallen op 0,000% samen. UNP350 wijkt af
        // omdat zijn A, Iy en Iz uit een externe referentieberekening komen en
        // niet uit het DIN-model; die marge is bekend en vastgelegd op 0,6/1,0%.
        assert!(
            rel(e.a_mm2, q.area_mm2).abs() < 0.006,
            "{}: A model {:.1} tegen database {:.1} ({:+.3}%)",
            p.name,
            e.a_mm2,
            q.area_mm2,
            rel(e.a_mm2, q.area_mm2) * 100.0
        );
        assert!(
            rel(e.iy_mm4, q.iy_mm4).abs() < 0.010,
            "{}: Iy model {:.4e} tegen database {:.4e} ({:+.3}%)",
            p.name,
            e.iy_mm4,
            q.iy_mm4,
            rel(e.iy_mm4, q.iy_mm4) * 100.0
        );
    }
}

/// De twee modellen zijn niet verwisselbaar. Bij elk UNP-profiel ligt de tapse
/// contour aantoonbaar dichter bij de catalogus dan de evenwijdige — voor `A`
/// én voor `Iy`, met minstens een factor 1,5 verschil. Zonder deze controle zou
/// de test hierboven met het verkeerde model kunnen slagen, en dan bewijst de
/// insluiting niets: je krijgt een geldige band om een verkeerd profiel.
#[test]
fn de_tapse_contour_is_aantoonbaar_het_juiste_unp_model() {
    let mut gecontroleerd = 0;
    for p in u_profielen().iter().filter(|p| is_unp(&p.name)) {
        let g = &p.geometry;
        let taps = contour::unp(g.h, g.b, g.tw, g.tf, g.r).bereken();
        let recht = contour::u_profiel(g.h, g.b, g.tw, g.tf, g.r).bereken();
        let q = &p.properties;

        for (grootheid, mt, mr, ref_w) in [
            ("A", taps.a_mm2, recht.a_mm2, q.area_mm2),
            ("Iy", taps.iy_mm4, recht.iy_mm4, q.iy_mm4),
        ] {
            let ft = rel(mt, ref_w).abs();
            let fr = rel(mr, ref_w).abs();
            assert!(
                fr > 1.5 * ft.max(1e-6),
                "{}: {} — tapse contour {:+.3}%, evenwijdige {:+.3}%. De twee \
                 modellen zijn hier niet te onderscheiden, dus deze testsuite \
                 kan een verkeerd geometriemodel niet meer betrappen.",
                p.name,
                grootheid,
                rel(mt, ref_w) * 100.0,
                rel(mr, ref_w) * 100.0
            );
        }
        gecontroleerd += 1;
    }
    assert_eq!(gecontroleerd, 13, "aantal UNP-profielen");
}

/// De kern: de opgeslagen `It` ligt binnen de bewezen insluiting van de motor.
///
/// De ondergrens komt uit de spanningsfunctie van Prandtl, de bovengrens uit de
/// welvingsfunctie; samen sluiten ze de exacte waarde van de gemodelleerde
/// doorsnede in. Een waarde bóven de bovengrens is dus bewijsbaar te hoog, en
/// daarmee onveilig voor kip.
#[test]
fn opgeslagen_it_ligt_binnen_de_insluiting_van_de_motor() {
    let mut ergste_boven = f64::NEG_INFINITY;
    let mut ergste_onder = f64::NEG_INFINITY;
    let mut ergste_naam = String::new();

    for p in u_profielen() {
        let d = contour_van(&p);
        let h = torsie::aanbevolen_h(&d, ELEMENTEN_PER_WAND);
        let t = torsie::bereken_met(&d, TorsieOpties::met_h(h));
        assert!(!t.losse_delen, "{}: mesh viel uiteen", p.name);
        assert!(
            t.it_ondergrens_mm4 > 0.0 && t.it_ondergrens_mm4 <= t.it_bovengrens_mm4,
            "{}: insluiting ongeldig",
            p.name
        );

        let it = p.properties.it_mm4;
        // Boven de bovengrens = bewijsbaar te hoog = onveilig.
        assert!(
            it <= t.it_bovengrens_mm4,
            "{}: opgeslagen It = {:.4e} ligt {:+.2}% BOVEN de bewezen bovengrens \
             {:.4e}. Een te hoge It overschat M_cr en dus de kipcapaciteit. \
             Herstel met: node scripts/genereer-profieldata.mjs --motor-herstel",
            p.name,
            it,
            rel(it, t.it_bovengrens_mm4) * 100.0,
            t.it_bovengrens_mm4
        );
        // Onder de ondergrens is niet onveilig, maar wel weggegooide capaciteit
        // en een teken dat de bron niet meer de motor is.
        assert!(
            it >= t.it_ondergrens_mm4,
            "{}: opgeslagen It = {:.4e} ligt {:+.2}% ONDER de bewezen ondergrens \
             {:.4e}; dat is onnodig conservatief en wijst op een andere bron.",
            p.name,
            it,
            rel(it, t.it_ondergrens_mm4) * 100.0,
            t.it_ondergrens_mm4
        );

        let boven = rel(it, t.it_bovengrens_mm4);
        let onder = -rel(it, t.it_ondergrens_mm4);
        if boven > ergste_boven {
            ergste_boven = boven;
            ergste_naam = p.name.clone();
        }
        ergste_onder = ergste_onder.max(onder);
    }

    // Zichtbaar maken hoeveel ruimte er nog is; `cargo test -- --nocapture`.
    println!(
        "It binnen de insluiting op alle 27 U-profielen; krapste marge naar de \
         bovengrens {:.2}% ({}), naar de ondergrens {:.2}%",
        -ergste_boven * 100.0,
        ergste_naam,
        -ergste_onder * 100.0
    );
}

/// De fout die hier ooit in zat, moet door deze test worden gevangen.
///
/// Zonder deze controle zou de test hierboven kunnen "slagen" doordat de
/// insluiting per ongeluk zo ruim is dat er van alles in past. Hier gaat de
/// oorspronkelijke, afgekeurde formule er nog één keer doorheen: die moet
/// aantoonbaar buiten de insluiting vallen.
#[test]
fn de_afgekeurde_formule_valt_buiten_de_insluiting() {
    /// It van een U volgens de oude benadering: de I-profielformule van
    /// El Darwish & Johnston met gehalveerde uitrondings- en uiteindetermen.
    fn it_afgekeurd(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> f64 {
        let hw = h - 2.0 * tf;
        let basis = (2.0 * b * tf.powi(3) + hw * tw.powi(3)) / 3.0;
        if r <= 0.0 {
            return basis;
        }
        let q = tw / tf;
        let pp = r / tf;
        let alpha =
            -0.042 + 0.2204 * q + 0.1355 * pp - 0.0865 * pp * q - 0.0725 * q * q;
        let d = ((tf + r).powi(2) + tw * (r + tw / 4.0)) / (2.0 * r + tf);
        basis + alpha * d.powi(4) - 0.21 * tf.powi(4)
    }

    let mut betrapt = 0;
    for p in u_profielen() {
        let g = &p.geometry;
        let d = contour_van(&p);
        let h = torsie::aanbevolen_h(&d, ELEMENTEN_PER_WAND);
        let t = torsie::bereken_met(&d, TorsieOpties::met_h(h));
        let oud = it_afgekeurd(g.h, g.b, g.tw, g.tf, g.r);
        assert!(
            oud > t.it_bovengrens_mm4,
            "{}: de afgekeurde formule ({:.4e}) valt binnen de insluiting \
             [{:.4e}, {:.4e}] — dan vangt deze testsuite de oude fout niet meer",
            p.name,
            oud,
            t.it_ondergrens_mm4,
            t.it_bovengrens_mm4
        );
        betrapt += 1;
    }
    assert_eq!(betrapt, 27);
}
