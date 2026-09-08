//! DE HANDAFLEIDING van de meetkunde van de betondoorsnede: elke verwachte
//! waarde hieronder is uit de maten afgeleid en niet uit de code overgenomen.
//!
//! # Waarom deze test er is, en wat hij NIET doet
//!
//! De betonfiguren worden twee keer getekend: op het scherm door de frontend,
//! en in de PDF door `report::betonfiguren`. Twee tekeningen van hetzelfde ding
//! lopen uit elkaar — dat is precies de reden waarom "de SVG als afbeelding
//! invoegen" is overwogen. De keuze is natekenen geworden, en dan moet er een
//! bewaking tegenover staan.
//!
//! **Die bewaking is dit bestand niet.** Er wordt hier geen TypeScript
//! uitgevoerd; dit zijn Rust-uitkomsten tegen handgetallen. Zolang de frontend
//! zijn eigen verwachte waarden droeg — op andere bemonsteringspunten, en voor
//! de staafharten zelfs alleen op een grens — bleef een verschoven punt aan
//! beide kanten groen.
//!
//! **Het uiteenlopen wordt bewaakt door `betonfiguren_referentie.rs`**, dat
//! samen met `design-mockup/test-betonfiguren-referentie.mjs` één gedeeld
//! bestand leest: `tests/golden/betonfiguren-referentie.json`. Wat hier staat
//! blijft daarnaast staan, omdat het uitlegt wáárom een punt ligt waar hij
//! ligt — de referentie draagt de getallen, dit bestand de redenering.
//!
//! **De andere implementatie staat in
//! `design-mockup/src/components/beton/wapeningskorf.ts`**: `omtrekPunten`,
//! `staafPosities`, `breedteOpHoogteMm` en `hartXMm`.
//!
//! Wie hier een verwachte waarde aanpast omdat "de test rood is", moet eerst
//! `wapeningskorf.ts` erbij pakken: of allebei veranderen, of geen van beide.
//!
//! # De regels die worden vastgepind
//!
//! * de omtrek volgt de BANDEN van de doorsnede (rechthoek, T, omgekeerde T, L)
//!   en niet een aparte parametrisering per vorm;
//! * bij een L staat het lijf tegen de LINKERRAND, bij een T in het midden —
//!   voor de berekening geen verschil, voor de tekening wél;
//! * een staafrij wordt verdeeld over de breedte die op ZIJN EIGEN hoogte
//!   aanwezig is, en de inzet vanaf elke rand is `c_nom + Ø_beugel + Ø_hoofd/2`.

use nen_en_1992_1_1::section::{
    ConcreteSection, ConcreteSectionInput, RebarRow, ReinforcementCage,
};
use report::betonfiguren::{
    breedte_op_hoogte_mm, hart_x_mm, maat, mooie_stap, nl, nul_schoon, omtrek_punten,
    staaf_posities, ticks, Rij, StaafPositie,
};

/// De korf van de standaardbalk: dekking 30, beugel Ø8, onder 3Ø16, boven 2Ø12.
/// Asafstand onder = 30 + 8 + 8 = 46 mm, boven = 30 + 8 + 6 = 44 mm.
fn korf_3x16_2x12() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
    }
}

/// Dezelfde korf met vier staven boven — voor de flensdoorsneden, waar de
/// bovenrij in de brede flens ligt.
fn korf_3x16_4x12() -> ReinforcementCage {
    ReinforcementCage { top: RebarRow { count: 4, diameter_mm: 12.0 }, ..korf_3x16_2x12() }
}

/// Vergelijkt punten op de millimeter nauwkeurig; de maten zijn hele
/// millimeters, dus een afwijking hoort er niet te zijn.
#[track_caller]
fn gelijk(werkelijk: &[(f64, f64)], verwacht: &[(f64, f64)]) {
    assert_eq!(
        werkelijk.len(),
        verwacht.len(),
        "aantal punten: {werkelijk:?} tegen verwacht {verwacht:?}"
    );
    for (i, (w, v)) in werkelijk.iter().zip(verwacht).enumerate() {
        assert!(
            (w.0 - v.0).abs() < 1e-9 && (w.1 - v.1).abs() < 1e-9,
            "punt {i}: {w:?} in plaats van {v:?} (volledig: {werkelijk:?})"
        );
    }
}

#[track_caller]
fn staven_gelijk(werkelijk: &[StaafPositie], verwacht: &[(f64, f64, f64, Rij)]) {
    assert_eq!(werkelijk.len(), verwacht.len(), "aantal staven: {werkelijk:?}");
    for (i, (w, v)) in werkelijk.iter().zip(verwacht).enumerate() {
        assert!(
            (w.x_mm - v.0).abs() < 1e-9
                && (w.z_mm - v.1).abs() < 1e-9
                && (w.diameter_mm - v.2).abs() < 1e-9
                && w.rij == v.3,
            "staaf {i}: {w:?} in plaats van (x {}, z {}, Ø {}, {:?})",
            v.0,
            v.1,
            v.2,
            v.3
        );
    }
}

// ── 1. De rechthoek ───────────────────────────────────────────────────────────

/// Rechthoek 300 × 500.
///
/// Omtrek met de hand: één band van z = 0 tot 500 met b = 300, dus de vier
/// hoekpunten (0,0) — (300,0) — (300,500) — (0,500), tegen de klok in.
///
/// Staven met de hand, onderrij 3Ø16 met asafstand 46 mm:
///   hart = 300/2 = 150; eerste = 150 − 150 + 46 = 46; laatste = 150 + 150 − 46 = 254;
///   drie staven op 46, (46 + 254)/2 = 150 en 254, alle op z = 46.
/// Bovenrij 2Ø12 met asafstand 44 mm, op z = 500 − 44 = 456:
///   eerste = 44, laatste = 256.
#[test]
fn rechthoek_300x500() {
    let s = ConcreteSection::new(300.0, 500.0);
    gelijk(&omtrek_punten(&s), &[(0.0, 0.0), (300.0, 0.0), (300.0, 500.0), (0.0, 500.0)]);

    staven_gelijk(
        &staaf_posities(&korf_3x16_2x12(), &s),
        &[
            (46.0, 46.0, 16.0, Rij::Onder),
            (150.0, 46.0, 16.0, Rij::Onder),
            (254.0, 46.0, 16.0, Rij::Onder),
            (44.0, 456.0, 12.0, Rij::Boven),
            (256.0, 456.0, 12.0, Rij::Boven),
        ],
    );

    // De breedte is overal 300 en het hart altijd in het midden.
    assert_eq!(breedte_op_hoogte_mm(&s, 46.0), 300.0);
    assert_eq!(hart_x_mm(&s, 46.0), 150.0);
}

/// Eén staaf in een rij staat in het midden en niet tegen de rand — de
/// `count == 1`-tak, die anders nooit geraakt wordt.
#[test]
fn een_staaf_staat_in_het_midden() {
    let s = ConcreteSection::new(300.0, 500.0);
    let korf = ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 0, diameter_mm: 0.0 },
        bottom: RebarRow { count: 1, diameter_mm: 20.0 },
    };
    // Asafstand = 30 + 8 + 10 = 48 mm.
    staven_gelijk(&staaf_posities(&korf, &s), &[(150.0, 48.0, 20.0, Rij::Onder)]);
}

// ── 2. De T, flens boven ──────────────────────────────────────────────────────

/// T 400 × 450, flens 400 × 50 boven, lijf 200.
///
/// Banden: lijf van z = 0 tot 400 met b = 200, flens van 400 tot 450 met
/// b = 400. Het lijf ligt in het MIDDEN: links ervan 100 mm, rechts ervan
/// 100 mm. De omtrek loopt tegen de klok in en heeft acht punten.
///
/// Staven met de hand:
///   onderrij op z = 46 — dat is in het LIJF, dus breedte 200 en niet 400;
///   hart = 200; eerste = 200 − 100 + 46 = 146; laatste = 200 + 100 − 46 = 254;
///   drie staven op 146, 200 en 254.
///   bovenrij op z = 450 − 44 = 406 — dat is in de FLENS, breedte 400;
///   eerste = 44, laatste = 356; vier staven met stap (356 − 44)/3 = 104,
///   dus 44, 148, 252 en 356.
#[test]
fn t_vorm_400x450_flens_boven() {
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    gelijk(
        &omtrek_punten(&s),
        &[
            (100.0, 0.0),
            (300.0, 0.0),
            (300.0, 400.0),
            (400.0, 400.0),
            (400.0, 450.0),
            (0.0, 450.0),
            (0.0, 400.0),
            (100.0, 400.0),
        ],
    );

    // De breedte op de hoogte van elke rij — de maat die de verdeling stuurt.
    assert_eq!(breedte_op_hoogte_mm(&s, 46.0), 200.0, "onderrij ligt in het lijf");
    assert_eq!(breedte_op_hoogte_mm(&s, 406.0), 400.0, "bovenrij ligt in de flens");
    assert_eq!(hart_x_mm(&s, 46.0), 200.0, "bij een T ligt het lijf in het midden");

    staven_gelijk(
        &staaf_posities(&korf_3x16_4x12(), &s),
        &[
            (146.0, 46.0, 16.0, Rij::Onder),
            (200.0, 46.0, 16.0, Rij::Onder),
            (254.0, 46.0, 16.0, Rij::Onder),
            (44.0, 406.0, 12.0, Rij::Boven),
            (148.0, 406.0, 12.0, Rij::Boven),
            (252.0, 406.0, 12.0, Rij::Boven),
            (356.0, 406.0, 12.0, Rij::Boven),
        ],
    );
}

// ── 3. De omgekeerde T, flens onder ───────────────────────────────────────────

/// Dezelfde T met `flange_at_bottom`: de flens ligt ONDER.
///
/// De kern maakt daar een gespiegelde bandenreeks van — flens van z = 0 tot 50
/// met b = 400, lijf van 50 tot 450 met b = 200 — en de omtrek volgt die
/// banden. Hij is dus letterlijk de omtrek van de rechtopstaande T, in de
/// hoogte omgeklapt.
///
/// Staven met de hand:
///   onderrij op z = 46 ligt nu in de FLENS: breedte 400, hart 200,
///   eerste = 46, laatste = 354, drie staven op 46, 200 en 354.
///   bovenrij op z = 406 ligt in het LIJF: breedte 200, hart 200,
///   eerste = 200 − 100 + 44 = 144, laatste = 256.
#[test]
fn omgekeerde_t_flens_onder() {
    let mut invoer = ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0);
    invoer.flange_at_bottom = true;
    let s = invoer.build().unwrap();

    gelijk(
        &omtrek_punten(&s),
        &[
            (0.0, 0.0),
            (400.0, 0.0),
            (400.0, 50.0),
            (300.0, 50.0),
            (300.0, 450.0),
            (100.0, 450.0),
            (100.0, 50.0),
            (0.0, 50.0),
        ],
    );

    // Precies de omtrek van de rechtopstaande T, omgeklapt om z = h/2 — en dat
    // is geen toeval maar de eis: de tekening leest de banden, en de kern klapt
    // de banden om.
    let rechtop = omtrek_punten(&ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap());
    let omgeklapt: Vec<(f64, f64)> = omtrek_punten(&s).iter().map(|(x, z)| (*x, 450.0 - z)).collect();
    for p in &rechtop {
        assert!(
            omgeklapt.iter().any(|q| (q.0 - p.0).abs() < 1e-9 && (q.1 - p.1).abs() < 1e-9),
            "omgeklapt punt {p:?} ontbreekt in {omgeklapt:?}"
        );
    }

    staven_gelijk(
        &staaf_posities(&korf_3x16_2x12(), &s),
        &[
            (46.0, 46.0, 16.0, Rij::Onder),
            (200.0, 46.0, 16.0, Rij::Onder),
            (354.0, 46.0, 16.0, Rij::Onder),
            (144.0, 406.0, 12.0, Rij::Boven),
            (256.0, 406.0, 12.0, Rij::Boven),
        ],
    );
}

// ── 4. De L ───────────────────────────────────────────────────────────────────

/// L 400 × 450 met dezelfde maten als de T.
///
/// Voor de BEREKENING is dit exact de T: dezelfde banden, dus dezelfde b(z).
/// Voor de TEKENING niet: het lijf staat tegen de LINKERRAND, niet in het
/// midden. Wie een L als een T tekent, laat de constructeur iets anders zien
/// dan hij heeft ingevoerd.
///
/// Omtrek met de hand: lijf van x = 0 tot 200 over z = 0 tot 400, flens van
/// x = 0 tot 400 over z = 400 tot 450. Linksboven vallen de hoekpunten van het
/// lijf en van de flens samen; het dubbele punt wordt weggefilterd, dus er
/// blijven ZEVEN punten over en niet acht.
///
/// Staven met de hand:
///   onderrij op z = 46, breedte 200, hart 100 (lijf links!);
///   eerste = 100 − 100 + 46 = 46, laatste = 100 + 100 − 46 = 154;
///   drie staven op 46, 100 en 154 — in de T stonden diezelfde staven op
///   146, 200 en 254.
///   bovenrij op z = 406, breedte 400, hart 200: 44, 148, 252, 356 — gelijk
///   aan de T, want de flens beslaat de volle breedte.
#[test]
fn l_vorm_lijf_tegen_de_linkerrand() {
    let s = ConcreteSection::ell(400.0, 50.0, 200.0, 450.0).unwrap();

    gelijk(
        &omtrek_punten(&s),
        &[
            (0.0, 0.0),
            (200.0, 0.0),
            (200.0, 400.0),
            (400.0, 400.0),
            (400.0, 450.0),
            (0.0, 450.0),
            (0.0, 400.0),
        ],
    );

    assert_eq!(hart_x_mm(&s, 46.0), 100.0, "bij een L staat het lijf tegen de linkerrand");
    assert_eq!(hart_x_mm(&s, 425.0), 200.0, "de flens beslaat de volle breedte");

    staven_gelijk(
        &staaf_posities(&korf_3x16_4x12(), &s),
        &[
            (46.0, 46.0, 16.0, Rij::Onder),
            (100.0, 46.0, 16.0, Rij::Onder),
            (154.0, 46.0, 16.0, Rij::Onder),
            (44.0, 406.0, 12.0, Rij::Boven),
            (148.0, 406.0, 12.0, Rij::Boven),
            (252.0, 406.0, 12.0, Rij::Boven),
            (356.0, 406.0, 12.0, Rij::Boven),
        ],
    );

    // De L en de T hebben dezelfde banden — de tekening moet ze tóch
    // verschillend neerzetten. Dat is de hele reden dat het etiket meereist.
    let t = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    assert_eq!(s.bands(), t.bands());
    assert_ne!(omtrek_punten(&s), omtrek_punten(&t));
}

// ── De korf en de doorsnede horen bij elkaar ──────────────────────────────────

/// Elke getekende staaf ligt binnen het beton dat op zijn eigen hoogte
/// aanwezig is. Dat is geen extra regel maar dezelfde regel als
/// `ReinforcementCage::validate` hanteert; als de tekening en de controle uit
/// elkaar lopen, wijst een afgekeurde korf naar staven die er in het beeld
/// gewoon in passen.
#[test]
fn geen_staaf_valt_buiten_het_beton() {
    let gevallen: Vec<(ConcreteSection, ReinforcementCage)> = vec![
        (ConcreteSection::new(300.0, 500.0), korf_3x16_2x12()),
        (ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap(), korf_3x16_4x12()),
        (ConcreteSection::ell(400.0, 50.0, 200.0, 450.0).unwrap(), korf_3x16_4x12()),
        (
            ConcreteSectionInput { flange_at_bottom: true, ..ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0) }
                .build()
                .unwrap(),
            korf_3x16_2x12(),
        ),
    ];
    for (s, korf) in gevallen {
        korf.validate(&s).expect("de proefkorven moeten door de kerncontrole komen");
        for st in staaf_posities(&korf, &s) {
            let breedte = breedte_op_hoogte_mm(&s, st.z_mm);
            let hart = hart_x_mm(&s, st.z_mm);
            let links = hart - breedte / 2.0;
            let rechts = hart + breedte / 2.0;
            assert!(
                st.x_mm - st.diameter_mm / 2.0 >= links - 1e-9
                    && st.x_mm + st.diameter_mm / 2.0 <= rechts + 1e-9,
                "staaf {st:?} steekt buiten het beton ({links}..{rechts}) van {}",
                s.name()
            );
            assert!(st.z_mm > 0.0 && st.z_mm < s.h_mm, "staaf {st:?} ligt buiten de hoogte");
        }
    }
}

// ── De asverdeling: dezelfde stappenregel als op het scherm ───────────────────

/// `mooieStap` kiest 1, 2 of 5 × 10ⁿ. Met de hand nagelopen:
///   bereik 120, doel 5 → ruw 24 → mag 10, r = 2,4 → 2 → stap 20;
///   bereik 87  → ruw 17,4 → r = 1,74 → 2 → stap 20;
///   bereik 40  → ruw 8    → mag 1,   r = 8 → 10 → stap 10;
///   bereik 3   → ruw 0,6  → mag 0,1, r = 6 → 5  → stap 0,5.
#[test]
fn asstappen_volgen_dezelfde_regel_als_het_scherm() {
    assert_eq!(mooie_stap(120.0, 5.0), 20.0);
    assert_eq!(mooie_stap(87.0, 5.0), 20.0);
    assert_eq!(mooie_stap(40.0, 5.0), 10.0);
    assert!((mooie_stap(3.0, 5.0) - 0.5).abs() < 1e-12);
    // Een leeg of negatief bereik levert een stap van 1 en geen deling door nul.
    assert_eq!(mooie_stap(0.0, 5.0), 1.0);

    assert_eq!(ticks(120.0), vec![0.0, 20.0, 40.0, 60.0, 80.0, 100.0, 120.0]);
    assert_eq!(ticks(87.0), vec![0.0, 20.0, 40.0, 60.0, 80.0, 100.0]);
    // Een as die precies op een veelvoud van de stap eindigt, krijgt er geen
    // lege stap bij — daar is de tolerantie van 1e-9 voor.
    assert_eq!(*ticks(100.0).last().unwrap(), 100.0);
}

/// Getallen in de figuren staan in Nederlandse notatie, net als op het scherm:
/// komma als decimaalteken, punt als duizendtalscheiding.
#[test]
fn getallen_staan_er_nederlands_in() {
    assert_eq!(nl(1234.5, 1), "1.234,5");
    assert_eq!(nl(12.0, 0), "12");
    assert_eq!(nl(1_234_567.0, 0), "1.234.567");
    assert_eq!(nl(-250.0, 0), "-250");
    assert_eq!(nl(0.25, 2), "0,25");
    // −0 leest als een richting die er niet is; die hoort weg.
    assert_eq!(nul_schoon(-0.4, 0), "0");
    assert_eq!(nul_schoon(-250.0, 0), "-250");
    // Maten: geheel waar het kan, anders één decimaal.
    assert_eq!(maat(300.0), "300");
    assert_eq!(maat(2780.0), "2.780");
    assert_eq!(maat(12.5), "12,5");
}
