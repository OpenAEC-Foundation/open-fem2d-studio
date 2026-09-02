//! D4.2 — doorsnedeklasse per plaatdeel voor samengestelde doorsneden.
//!
//! Alle getallen in deze tests zijn met de hand na te rekenen; de tussenstappen
//! staan in de commentaren. De meetkunde volgt de gelaste I uit D4.1:
//! flenzen 200×15, lijf 400×10, totale hoogte h = 430 mm.

use mechanics::InternalForces;
use nen_en_1993_1_1_section::classification::{
    classify_composite, classify_section, CrossSectionClass, Plaatdeelsoort, PlaatdeelKlasse,
    SectionShape,
};
use nen_en_1993_1_1_section::{S235, S355};
use section_properties::composite::{CompositeSection, Lamella};
use section_properties::SectionProperties;

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/// Gelaste I uit drie platen.
///
/// Lamel 0 = onderflens, lamel 1 = bovenflens, lamel 2 = lijf. Het hart van
/// een flens ligt op `z = ±(h_w + t_f)/2`; voor 400×10 met flenzen van 15 mm
/// is dat `±(400 + 15)/2 = ±207,5 mm` en de totale hoogte 430 mm.
fn gelaste_i(bf: f64, tf: f64, hw: f64, tw: f64) -> CompositeSection {
    let z = (hw + tf) / 2.0;
    CompositeSection::nieuw()
        .met_lamel(Lamella::liggend(bf, tf, 0.0, -z))
        .met_lamel(Lamella::liggend(bf, tf, 0.0, z))
        .met_lamel(Lamella::staand(hw, tw, 0.0, 0.0))
}

/// Gelaste koker uit vier platen met uitwendige maten `h × b` en wanddikte `t`.
///
/// Lamel 0/1 = lijven over de volle hoogte `h` op `y = ±(b − t)/2`;
/// lamel 2/3 = flenzen ertussen, lengte `b − 2t`, op `z = ±(h − t)/2`.
/// Het oppervlak klopt daarmee exact: `2·h·t + 2·(b − 2t)·t = h·b − (h−2t)(b−2t)`.
fn koker(h: f64, b: f64, t: f64) -> CompositeSection {
    let ym = (b - t) / 2.0;
    let zm = (h - t) / 2.0;
    CompositeSection::nieuw()
        .met_lamel(Lamella::staand(h, t, -ym, 0.0))
        .met_lamel(Lamella::staand(h, t, ym, 0.0))
        .met_lamel(Lamella::liggend(b - 2.0 * t, t, 0.0, -zm))
        .met_lamel(Lamella::liggend(b - 2.0 * t, t, 0.0, zm))
}

/// Dezelfde koker als doorsnede-eigenschappen voor het bestaande
/// `classify_section`-pad met `SectionShape::BoxSection`.
fn koker_props(h: f64, b: f64, t: f64) -> SectionProperties {
    SectionProperties {
        h_mm: h,
        b_mm: b,
        tw_mm: t,
        tf_mm: t,
        r_mm: 0.0,
        area_mm2: 2.0 * h * t + 2.0 * (b - 2.0 * t) * t,
        ..Default::default()
    }
}

fn buiging(my_knm: f64) -> InternalForces {
    InternalForces { my_ed: my_knm, ..Default::default() }
}

/// `n_ed` is negatief bij druk, net als in de rest van de rekenkern.
fn druk(n_kn: f64) -> InternalForces {
    InternalForces { n_ed: -n_kn, ..Default::default() }
}

/// Het (enige) inwendige plaatdeel van lamel `i`.
fn inwendig(delen: &[PlaatdeelKlasse], i: usize) -> &PlaatdeelKlasse {
    delen
        .iter()
        .find(|d| d.lamel_index == i && d.soort == Plaatdeelsoort::Inwendig)
        .expect("inwendig plaatdeel verwacht")
}

/// Het eerste uitkragende plaatdeel van lamel `i`.
fn uitkraging(delen: &[PlaatdeelKlasse], i: usize) -> &PlaatdeelKlasse {
    delen
        .iter()
        .find(|d| d.lamel_index == i && d.soort == Plaatdeelsoort::Uitkraging)
        .expect("uitkragend plaatdeel verwacht")
}

// ── (a) Gelaste I, S235, zuivere buiging → klasse 1 ─────────────────────────

/// Flenzen 200×15, lijf 400×10, S235 (ε = 1,0), zuivere buiging.
///
/// * Lijf — inwendig deel tussen de flenshartlijnen op z = ±207,5:
///   `c = 415 − 7,5 − 7,5 = 400`; `c/t = 400/10 = 40 < 72ε = 72` → klasse 1.
/// * Flens — uitkraging vanaf het hart van het lijf:
///   `c = (200 − 10)/2 = 95`; `c/t = 95/15 = 6,33 < 9ε = 9` → klasse 1.
#[test]
fn gelaste_i_s235_zuivere_buiging_is_klasse1() {
    let sec = gelaste_i(200.0, 15.0, 400.0, 10.0);
    let r = classify_composite(&sec, &S235, &buiging(80.0));

    assert_eq!(r.epsilon, 1.0, "S235 ⇒ ε = √(235/235) = 1");
    assert_eq!(r.klasse, CrossSectionClass::Class1);

    let lijf = inwendig(&r.delen, 2);
    assert!((lijf.c_mm - 400.0).abs() < 1e-9, "c_lijf = 415 − 15 = 400, gemeten {}", lijf.c_mm);
    assert!((lijf.c_over_t - 40.0).abs() < 1e-9, "c/t = 40, gemeten {}", lijf.c_over_t);
    assert_eq!(lijf.klasse, CrossSectionClass::Class1);

    let flens = uitkraging(&r.delen, 1);
    assert!((flens.c_mm - 95.0).abs() < 1e-9, "c_flens = (200 − 10)/2 = 95, gemeten {}", flens.c_mm);
    assert!(
        (flens.c_over_t - 95.0 / 15.0).abs() < 1e-9,
        "c/t = 95/15 = 6,333, gemeten {}",
        flens.c_over_t
    );
    assert_eq!(flens.klasse, CrossSectionClass::Class1);
}

/// De trekflens plooit niet en wordt dus niet geclassificeerd: bij `M_y > 0`
/// staat lamel 0 (onderflens) volledig op trek. Er blijven drie gedrukte
/// plaatdelen over: het lijf plus de twee uitkragingen van de bovenflens.
#[test]
fn trekflens_wordt_niet_geclassificeerd() {
    let sec = gelaste_i(200.0, 15.0, 400.0, 10.0);
    let r = classify_composite(&sec, &S235, &buiging(80.0));

    assert!(r.delen.iter().all(|d| d.lamel_index != 0), "onderflens staat op trek");
    assert_eq!(r.delen.len(), 3, "lijf + twee flensuitkragingen: {:#?}", r.delen);
    assert_eq!(r.delen.iter().filter(|d| d.soort == Plaatdeelsoort::Inwendig).count(), 1);
    assert_eq!(r.delen.iter().filter(|d| d.soort == Plaatdeelsoort::Uitkraging).count(), 2);
    assert!(!r.catalogusdelen_overgeslagen);
}

// ── (b) Slank lijf → klasse 4, het lijf is bepalend ─────────────────────────

/// Dezelfde flenzen, maar een lijf 800×6. Flenshart op z = ±(800 + 15)/2 = ±407,5.
/// `c = 815 − 15 = 800`; `c/t = 800/6 = 133,3 > 124ε = 124` → klasse 4.
/// De flens blijft klasse 1 (c/t = 6,33), dus het lijf is bepalend.
#[test]
fn slank_lijf_wordt_klasse4_en_is_bepalend() {
    let sec = gelaste_i(200.0, 15.0, 800.0, 6.0);
    let r = classify_composite(&sec, &S235, &buiging(80.0));

    let lijf = inwendig(&r.delen, 2);
    assert!((lijf.c_mm - 800.0).abs() < 1e-9, "c = 815 − 15 = 800, gemeten {}", lijf.c_mm);
    assert!(
        (lijf.c_over_t - 800.0 / 6.0).abs() < 1e-9,
        "c/t = 800/6 = 133,33, gemeten {}",
        lijf.c_over_t
    );
    assert!((lijf.grens_klasse3 - 124.0).abs() < 1e-9, "124ε = 124 bij S235");
    assert_eq!(lijf.klasse, CrossSectionClass::Class4);

    assert_eq!(uitkraging(&r.delen, 1).klasse, CrossSectionClass::Class1);

    assert_eq!(r.klasse, CrossSectionClass::Class4);
    let bepalend = r.bepalend.as_ref().expect("er is een bepalend plaatdeel");
    assert_eq!(bepalend.lamel_index, 2, "het lijf is bepalend");
    assert_eq!(bepalend.soort, Plaatdeelsoort::Inwendig);
}

// ── (c) Slanke flens → klasse 4, de flens is bepalend ───────────────────────

/// Flenzen 300×10 met een lijf 400×10. Flenshart op z = ±205.
/// * Flensuitkraging: `c = (300 − 10)/2 = 145`; `c/t = 14,5 > 14ε = 14` → klasse 4.
/// * Lijf: `c = 410 − 10 = 400`; `c/t = 40 < 72` → klasse 1.
///
/// De gedrukte bovenflens (lamel 1) is dus bepalend.
#[test]
fn slanke_flens_wordt_klasse4_en_is_bepalend() {
    let sec = gelaste_i(300.0, 10.0, 400.0, 10.0);
    let r = classify_composite(&sec, &S235, &buiging(80.0));

    let flens = uitkraging(&r.delen, 1);
    assert!((flens.c_mm - 145.0).abs() < 1e-9, "c = (300 − 10)/2 = 145, gemeten {}", flens.c_mm);
    assert!((flens.c_over_t - 14.5).abs() < 1e-9, "c/t = 145/10 = 14,5, gemeten {}", flens.c_over_t);
    assert!((flens.psi - 1.0).abs() < 1e-12, "de flens is gelijkmatig gedrukt: ψ = 1");
    assert!((flens.grens_klasse1 - 9.0).abs() < 1e-9, "9ε = 9");
    assert!((flens.grens_klasse2 - 10.0).abs() < 1e-9, "10ε = 10");
    assert!((flens.grens_klasse3 - 14.0).abs() < 1e-9, "14ε = 14");
    assert_eq!(flens.klasse, CrossSectionClass::Class4);

    let lijf = inwendig(&r.delen, 2);
    assert!((lijf.c_over_t - 40.0).abs() < 1e-9, "c/t = 400/10 = 40, gemeten {}", lijf.c_over_t);
    assert_eq!(lijf.klasse, CrossSectionClass::Class1);

    assert_eq!(r.klasse, CrossSectionClass::Class4);
    let bepalend = r.bepalend.as_ref().expect("er is een bepalend plaatdeel");
    assert_eq!(bepalend.lamel_index, 1, "de gedrukte flens is bepalend");
    assert_eq!(bepalend.soort, Plaatdeelsoort::Uitkraging);
}

// ── (d) S355: de grenzen schuiven aantoonbaar mee ───────────────────────────

/// ε = √(235/355) = √0,661972 = 0,813617; de drie lijfgrenzen bij zuivere
/// buiging (ψ = −1, α = 0,5) zijn dan:
///   72ε  = 72 · 0,813617 = 58,580  → afgerond 58,6
///   83ε  = 83 · 0,813617 = 67,530  → afgerond 67,5
///  124ε  = 124 · 0,813617 = 100,888 → afgerond 100,9
/// Lijf 400×10  → c/t = 40  ≤ 58,58 → klasse 1
/// Lijf 700×10  → c/t = 70  > 67,53 en ≤ 100,89 → klasse 3
/// Lijf 1100×10 → c/t = 110 > 100,89 → klasse 4
#[test]
fn s355_lijfgrenzen_schuiven_mee_met_epsilon() {
    let eps = (235.0f64 / 355.0).sqrt();
    assert!((eps - 0.8136165_f64).abs() < 1e-7, "ε = √(235/355) = 0,8136165, gemeten {eps}");
    let (g1, g2, g3) = (72.0 * eps, 83.0 * eps, 124.0 * eps);
    assert!((g1 - 58.580_f64).abs() < 0.01, "72ε = 58,58 (≈58,6), gemeten {g1}");
    assert!((g2 - 67.530_f64).abs() < 0.01, "83ε = 67,53 (≈67,5), gemeten {g2}");
    assert!((g3 - 100.888_f64).abs() < 0.01, "124ε = 100,89 (≈100,9), gemeten {g3}");

    let gevallen = [
        (400.0, 40.0, CrossSectionClass::Class1),
        (700.0, 70.0, CrossSectionClass::Class3),
        (1100.0, 110.0, CrossSectionClass::Class4),
    ];
    for (hw, c_over_t, verwacht) in gevallen {
        let sec = gelaste_i(200.0, 15.0, hw, 10.0);
        let r = classify_composite(&sec, &S355, &buiging(80.0));
        assert!((r.epsilon - eps).abs() < 1e-12);

        let lijf = inwendig(&r.delen, 2);
        // c = (h_w + t_f) − t_f = h_w, dus c/t = h_w/10.
        assert!(
            (lijf.c_mm - hw).abs() < 1e-9,
            "lijf {hw}: c = {hw}, gemeten {}",
            lijf.c_mm
        );
        assert!(
            (lijf.c_over_t - c_over_t).abs() < 1e-9,
            "lijf {hw}: c/t = {c_over_t}, gemeten {}",
            lijf.c_over_t
        );
        // Zuivere buiging over een dubbelsymmetrisch lijf: ψ = −1, α = 0,5.
        assert!((lijf.psi + 1.0).abs() < 1e-9, "lijf {hw}: ψ = −1, gemeten {}", lijf.psi);
        assert!((lijf.alpha - 0.5).abs() < 1e-6, "lijf {hw}: α = 0,5, gemeten {}", lijf.alpha);
        // En de drie grenzen zijn exact 72ε / 83ε / 124ε.
        assert!(
            (lijf.grens_klasse1 - g1).abs() < 1e-6,
            "lijf {hw}: 72ε = {g1}, gemeten {}",
            lijf.grens_klasse1
        );
        assert!(
            (lijf.grens_klasse2 - g2).abs() < 1e-6,
            "lijf {hw}: 83ε = {g2}, gemeten {}",
            lijf.grens_klasse2
        );
        assert!(
            (lijf.grens_klasse3 - g3).abs() < 1e-6,
            "lijf {hw}: 124ε = {g3}, gemeten {}",
            lijf.grens_klasse3
        );
        assert_eq!(lijf.klasse, verwacht, "lijf {hw}: c/t = {c_over_t}");

        // De flens blijft in alle drie de gevallen klasse 1:
        // c/t = 6,33 ≤ 9ε = 7,32.
        let flens = uitkraging(&r.delen, 1);
        assert!((flens.grens_klasse1 - 9.0 * eps).abs() < 1e-9, "9ε = 7,323");
        assert_eq!(flens.klasse, CrossSectionClass::Class1);

        assert_eq!(r.klasse, verwacht, "de doorsnedeklasse volgt het lijf bij lijf {hw}");
        if verwacht != CrossSectionClass::Class1 {
            // Zodra het lijf uit klasse 1 loopt is het onbetwist bepalend; in
            // het eerste geval zijn lijf én flens klasse 1 en wijst het
            // resultaat de relatief slankste van de twee aan (de flens,
            // 6,33/7,32 = 0,86 tegen 40/58,58 = 0,68).
            assert_eq!(
                r.bepalend.as_ref().unwrap().lamel_index,
                2,
                "het lijf is bepalend bij lijf {hw}"
            );
        }
    }
}

/// Zelfde doorsnede, maar nu S235 tegenover S355 bij één en dezelfde slankheid:
/// een lijf 800×10 (c/t = 80) is bij S235 klasse 2 (72 < 80 ≤ 83) en bij S355
/// klasse 3 (80 > 67,53 en ≤ 100,89). Dat is precies het meeschuiven van de
/// grens: dezelfde plaat, een klasse slechter omdat het staal sterker is.
#[test]
fn zelfde_lijf_valt_bij_s355_een_klasse_lager_uit() {
    let sec = gelaste_i(200.0, 15.0, 800.0, 10.0);
    assert_eq!(
        classify_composite(&sec, &S235, &buiging(80.0)).klasse,
        CrossSectionClass::Class2,
        "S235: 72 < 80 ≤ 83"
    );
    assert_eq!(
        classify_composite(&sec, &S355, &buiging(80.0)).klasse,
        CrossSectionClass::Class3,
        "S355: 80 > 67,53"
    );
}

// ── Gelijkmatige druk: het lijf komt op de drukgrenzen 33ε/38ε/42ε ──────────

/// Gelaste I onder zuivere druk: N = −2000 kN, A = 10 000 mm² → σ = 200 MPa
/// gelijkmatig. Elk plaatdeel heeft dan ψ = 1 en α = 1:
/// * lijf (inwendig): grenzen 33ε/38ε/42ε; c/t = 40 → 38 < 40 ≤ 42 → klasse 3;
/// * flens (uitkraging): grenzen 9ε/10ε/14ε; c/t = 6,33 → klasse 1.
#[test]
fn gelijkmatige_druk_gebruikt_de_drukgrenzen() {
    let sec = gelaste_i(200.0, 15.0, 400.0, 10.0);
    let r = classify_composite(&sec, &S235, &druk(2000.0));

    let lijf = inwendig(&r.delen, 2);
    assert!((lijf.psi - 1.0).abs() < 1e-12, "gelijkmatige druk: ψ = 1");
    assert!((lijf.alpha - 1.0).abs() < 1e-12, "volledig gedrukt: α = 1");
    assert!((lijf.grens_klasse1 - 33.0).abs() < 1e-9, "396/(13·1 − 1) = 33");
    assert!((lijf.grens_klasse2 - 38.0).abs() < 1e-9, "456/(13·1 − 1) = 38");
    assert!((lijf.grens_klasse3 - 42.0).abs() < 1e-9, "42/(0,67 + 0,33) = 42");
    assert_eq!(lijf.klasse, CrossSectionClass::Class3, "c/t = 40 valt tussen 38 en 42");

    // Nu staan béíde flenzen op druk, dus vier uitkragingen plus het lijf.
    assert_eq!(r.delen.len(), 5, "{:#?}", r.delen);
    assert_eq!(uitkraging(&r.delen, 0).klasse, CrossSectionClass::Class1);
    assert_eq!(uitkraging(&r.delen, 1).klasse, CrossSectionClass::Class1);

    assert_eq!(r.klasse, CrossSectionClass::Class3);
    assert_eq!(r.bepalend.as_ref().unwrap().lamel_index, 2);
}

// ── (e) Koker uit lamellen ⇄ classify_section met SectionShape::BoxSection ──

/// De twee paden mogen niet uit elkaar lopen.
///
/// Ze rekenen met een iets andere `c`: `classify_section` gebruikt de
/// gecodificeerde standaardwaarde `c = breedte − 3t` (die de uitrondingen van
/// een warmvervaardigde koker verdisconteert), terwijl een uit platen gelaste
/// koker geen uitrondingen heeft en de lamellenkant de werkelijke vrije
/// breedte `breedte − 2t` vindt. Voor een 200×200×10 is dat 170 tegenover 180,
/// dus de lamellenkant is de veilig-zijdige van de twee. De **klasse** moet
/// gelijk zijn.
///
/// Handcontrole per geval (S235, ε = 1), lamellenkant tussen haakjes:
///
/// | koker          | lijf c/t  | flens c/t | buiging          | druk             |
/// |----------------|-----------|-----------|------------------|------------------|
/// | 200×200×10     | 17 (18)   | 17 (18)   | 1 (72 / 33)      | 1 (33)           |
/// | 420×200×10     | 39 (40)   | 17 (18)   | 1 (72)           | 3 (38 < x ≤ 42)  |
/// | 800×200×10     | 77 (78)   | 17 (18)   | 2 (72 < x ≤ 83)  | 4 (> 42)         |
/// | 1000×200×10    | 97 (98)   | 17 (18)   | 3 (83 < x ≤ 124) | 4 (> 42)         |
/// | 1300×200×10    | 127 (128) | 17 (18)   | 4 (> 124)        | 4 (> 42)         |
/// | 200×380×10     | 17 (18)   | 35 (36)   | 2 (33 < x ≤ 38)  | 2 (33 < x ≤ 38)  |
/// | 200×600×10     | 17 (18)   | 57 (58)   | 4 (> 42)         | 4 (> 42)         |
///
/// De flens van een koker telt óók bij zuivere buiging als volledig gedrukt
/// deel (33ε/38ε/42ε), want de druk is over de volle breedte gelijk.
#[test]
fn koker_uit_lamellen_geeft_dezelfde_klasse_als_box_pad() {
    let matrix = [
        (200.0, 200.0, 10.0, CrossSectionClass::Class1, CrossSectionClass::Class1),
        (420.0, 200.0, 10.0, CrossSectionClass::Class1, CrossSectionClass::Class3),
        (800.0, 200.0, 10.0, CrossSectionClass::Class2, CrossSectionClass::Class4),
        (1000.0, 200.0, 10.0, CrossSectionClass::Class3, CrossSectionClass::Class4),
        (1300.0, 200.0, 10.0, CrossSectionClass::Class4, CrossSectionClass::Class4),
        (200.0, 380.0, 10.0, CrossSectionClass::Class2, CrossSectionClass::Class2),
        (200.0, 600.0, 10.0, CrossSectionClass::Class4, CrossSectionClass::Class4),
    ];

    for (h, b, t, klasse_buiging, klasse_druk) in matrix {
        let sec = koker(h, b, t);
        let props = koker_props(h, b, t);

        // Het lamellenmodel heeft exact het oppervlak van de koker.
        let a_kern = sec.bereken().props.area_mm2;
        assert!(
            (a_kern - props.area_mm2).abs() < 1e-9,
            "koker {h}×{b}×{t}: A = {}, lamellen geven {a_kern}",
            props.area_mm2
        );

        for (belasting, verwacht) in
            [(buiging(80.0), klasse_buiging), (druk(500.0), klasse_druk)]
        {
            let via_lamellen = classify_composite(&sec, &S235, &belasting);
            let via_box = classify_section(&props, &S235, &belasting, SectionShape::BoxSection);
            assert_eq!(
                via_lamellen.klasse, verwacht,
                "koker {h}×{b}×{t}, lamellenpad: {:#?}",
                via_lamellen.delen
            );
            assert_eq!(
                via_box, verwacht,
                "koker {h}×{b}×{t}, Box-pad"
            );
        }
    }
}

/// Alle vier de kokerwanden zijn inwendige delen: er is geen enkele uitkraging.
/// De vrije breedte is bij een 200×200×10 in beide richtingen
/// `190 − 5 − 5 = 180` (hart-op-hart 190, halve wanddikten eraf).
#[test]
fn kokerwanden_zijn_allemaal_inwendige_delen() {
    let sec = koker(200.0, 200.0, 10.0);
    let r = classify_composite(&sec, &S235, &druk(500.0));

    assert_eq!(r.delen.len(), 4, "vier wanden, alle vier gedrukt: {:#?}", r.delen);
    for d in &r.delen {
        assert_eq!(d.soort, Plaatdeelsoort::Inwendig, "{}", d.omschrijving);
        assert!((d.c_mm - 180.0).abs() < 1e-9, "c = 190 − 10 = 180, gemeten {}", d.c_mm);
        assert!((d.c_over_t - 18.0).abs() < 1e-9, "c/t = 18, gemeten {}", d.c_over_t);
    }
}

/// In zuivere buiging staat de onderflens van de koker op trek en valt af; het
/// lijf krijgt ψ = −1 (72ε/83ε/124ε) en de bovenflens ψ = 1 (33ε/38ε/42ε).
#[test]
fn koker_in_buiging_scheidt_lijf_en_flensgrenzen() {
    let sec = koker(200.0, 200.0, 10.0);
    let r = classify_composite(&sec, &S235, &buiging(80.0));

    assert_eq!(r.delen.len(), 3, "twee lijven + bovenflens: {:#?}", r.delen);

    let lijf = inwendig(&r.delen, 0);
    assert!((lijf.psi + 1.0).abs() < 1e-9, "lijf: ψ = −1, gemeten {}", lijf.psi);
    assert!((lijf.grens_klasse1 - 72.0).abs() < 1e-9);
    assert!((lijf.grens_klasse2 - 83.0).abs() < 1e-9);
    assert!((lijf.grens_klasse3 - 124.0).abs() < 1e-9);

    let flens = inwendig(&r.delen, 3); // lamel 3 = bovenflens
    assert!((flens.psi - 1.0).abs() < 1e-12, "bovenflens: gelijkmatig gedrukt, ψ = 1");
    assert!((flens.grens_klasse1 - 33.0).abs() < 1e-9);
    assert!((flens.grens_klasse2 - 38.0).abs() < 1e-9);
    assert!((flens.grens_klasse3 - 42.0).abs() < 1e-9);

    assert!(r.delen.iter().all(|d| d.lamel_index != 2), "onderflens staat op trek");
}
