//! Meewerkende flensbreedte b_eff — met de hand nagerekend uit NEN-EN 1992-1-1
//! art. 5.3.2.1, figuur 5.2 en de vergelijkingen (5.7), (5.7a) en (5.7b).
//!
//! ELKE verwachte waarde hieronder is uit de normuitdrukking berekend en in
//! het commentaar uitgeschreven, NIET uit de code overgenomen. Wie de code
//! wijzigt en een test ziet omvallen, kan de handberekening naast de nieuwe
//! uitkomst leggen.
//!
//! REFERENTIELIGGER (figuur 5.2 letterlijk)
//!
//! ```text
//!   ligger op drie steunpunten met een uitkraging:
//!     l1 = 6000 mm   eindveld, buitensteunpunt vrij opgelegd
//!     l2 = 5000 mm   binnenveld
//!     l3 = 2000 mm   uitkraging
//!
//!   geldigheid (OPMERKING bij figuur 5.2):
//!     l3 = 2000 < 0,5·l2 = 2500                                  ✔
//!     l1/l2 = 6000/5000 = 1,20, ligt tussen 2/3 en 1,5           ✔
//! ```
//!
//! T-DOORSNEDE (figuur 5.3): b_w = 300 mm, b_1 = b_2 = 1000 mm,
//! dus b = 300 + 1000 + 1000 = 2300 mm.

use nen_en_1992_1_1::beff::{
    beff_distribution, effective_flange_width, l0_zones, BeamLine, BeffBound, BeffError,
    FlangeGeometry, L0Case, LineEnd,
};

const TOL: f64 = 1e-9;

fn dichtbij(gemeten: f64, verwacht: f64, wat: &str) {
    assert!(
        (gemeten - verwacht).abs() < TOL,
        "{wat}: {gemeten} ≠ {verwacht} (afwijking {})",
        (gemeten - verwacht).abs()
    );
}

fn t_doorsnede() -> FlangeGeometry {
    FlangeGeometry {
        b_w_mm: 300.0,
        b_i_mm: vec![1000.0, 1000.0],
    }
}

fn referentielijn() -> BeamLine {
    BeamLine {
        spans_mm: vec![6000.0, 5000.0, 2000.0],
        start: LineEnd::Support,
        end: LineEnd::Free,
    }
}

// ───────────────────────────────────────────────────────────────────────────
// 1. EINDVELD — l0 = 0,85·l1
// ───────────────────────────────────────────────────────────────────────────
//
//   l0      = 0,85 · 6000                       = 5100 mm
//   b_eff,i = 0,2·1000 + 0,1·5100 = 200 + 510   =  710 mm      (5.7a, 1e lid)
//             bovengrens 0,2·l0 = 0,2·5100      = 1020 mm  → niet maatgevend
//             bovengrens b_i                    = 1000 mm  → niet maatgevend
//   b_eff   = 710 + 710 + 300                   = 1720 mm      (5.7)
//             ≤ b = 2300 mm                                 → geen begrenzing
#[test]
fn eindveld() {
    let z = &l0_zones(&referentielijn()).unwrap()[0];
    assert_eq!(z.case, L0Case::EndSpan);
    dichtbij(z.l0_mm, 5100.0, "l0 eindveld");
    dichtbij(z.x_start_mm, 0.0, "begin eindveldgebied");
    dichtbij(z.x_end_mm, 5100.0, "einde eindveldgebied");

    let r = effective_flange_width(&t_doorsnede(), 5100.0).unwrap();
    dichtbij(r.parts[0].formula_mm, 710.0, "0,2·b_i + 0,1·l0");
    dichtbij(r.parts[0].cap_l0_mm, 1020.0, "0,2·l0");
    dichtbij(r.parts[0].b_eff_i_mm, 710.0, "b_eff,1 eindveld");
    assert_eq!(r.parts[0].governing, BeffBound::Formula);
    dichtbij(r.b_eff_mm, 1720.0, "b_eff eindveld");
    dichtbij(r.b_mm, 2300.0, "b");
    assert!(!r.limited_by_b);
}

// ───────────────────────────────────────────────────────────────────────────
// 2. TUSSENSTEUNPUNT — l0 = 0,15·(l1 + l2)
// ───────────────────────────────────────────────────────────────────────────
//
//   l0      = 0,15 · (6000 + 5000) = 0,15 · 11000 = 1650 mm
//   b_eff,i = 0,2·1000 + 0,1·1650 = 200 + 165     =  365 mm     (5.7a, 1e lid)
//             bovengrens 0,2·l0 = 0,2·1650        =  330 mm → MAATGEVEND
//   b_eff   = 330 + 330 + 300                     =  960 mm     (5.7)
//
//   Het gebied loopt 0,15·l1 = 900 mm links van het steunpunt tot 0,15·l2 =
//   750 mm rechts ervan: van 6000 − 900 = 5100 tot 6000 + 750 = 6750 mm.
//   Zijn lengte is 1650 mm en dus gelijk aan l0 — zo tekent figuur 5.2 het.
#[test]
fn tussensteunpunt() {
    let z = &l0_zones(&referentielijn()).unwrap()[1];
    assert_eq!(z.case, L0Case::InteriorSupport);
    dichtbij(z.l0_mm, 1650.0, "l0 tussensteunpunt");
    dichtbij(z.x_start_mm, 5100.0, "begin steunpuntgebied");
    dichtbij(z.x_end_mm, 6750.0, "einde steunpuntgebied");

    let r = effective_flange_width(&t_doorsnede(), 1650.0).unwrap();
    dichtbij(r.parts[0].formula_mm, 365.0, "0,2·b_i + 0,1·l0");
    dichtbij(r.parts[0].cap_l0_mm, 330.0, "0,2·l0");
    dichtbij(r.parts[0].b_eff_i_mm, 330.0, "b_eff,1 steunpunt");
    assert_eq!(r.parts[0].governing, BeffBound::CapL0);
    dichtbij(r.b_eff_mm, 960.0, "b_eff steunpunt");
}

/// De reden dat dit hele mechaniek bestaat: boven het steunpunt is b_eff bijna
/// de helft van de veldwaarde. Rekent de app daar met de veldwaarde, dan is de
/// doorsnede te stijf — te weinig doorbuiging en te weinig tweede orde, dus de
/// onveilige kant.
#[test]
fn boven_het_steunpunt_is_beff_veel_kleiner_dan_in_het_veld() {
    let v = beff_distribution(&referentielijn(), &t_doorsnede()).unwrap();
    let veld = v.zones[0].b_eff_mm; // 1720
    let steun = v.zones[1].b_eff_mm; // 960
    assert!(
        steun < 0.6 * veld,
        "steunpunt {steun} zou ruim onder het veld {veld} moeten liggen"
    );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. BINNENVELD — l0 = 0,7·l2
// ───────────────────────────────────────────────────────────────────────────
//
//   l0      = 0,7 · 5000                         = 3500 mm
//   b_eff,i = 0,2·1000 + 0,1·3500 = 200 + 350    =  550 mm      (5.7a, 1e lid)
//             bovengrens 0,2·l0 = 0,2·3500 = 700 mm → niet maatgevend
//   b_eff   = 550 + 550 + 300                    = 1400 mm      (5.7)
//
//   Gebied: van 6000 + 750 = 6750 tot 6000 + 5000 − 0,15·5000 = 10250 mm.
//   Lengte 3500 mm = l0.
#[test]
fn binnenveld() {
    let z = &l0_zones(&referentielijn()).unwrap()[2];
    assert_eq!(z.case, L0Case::InteriorSpan);
    dichtbij(z.l0_mm, 3500.0, "l0 binnenveld");
    dichtbij(z.x_start_mm, 6750.0, "begin binnenveldgebied");
    dichtbij(z.x_end_mm, 10250.0, "einde binnenveldgebied");

    let r = effective_flange_width(&t_doorsnede(), 3500.0).unwrap();
    dichtbij(r.parts[0].b_eff_i_mm, 550.0, "b_eff,1 binnenveld");
    assert_eq!(r.parts[0].governing, BeffBound::Formula);
    dichtbij(r.b_eff_mm, 1400.0, "b_eff binnenveld");
}

// ───────────────────────────────────────────────────────────────────────────
// 4. UITKRAGING — l0 = 0,15·l2 + l3
// ───────────────────────────────────────────────────────────────────────────
//
//   l0      = 0,15·5000 + 2000 = 750 + 2000      = 2750 mm
//   b_eff,i = 0,2·1000 + 0,1·2750 = 200 + 275    =  475 mm      (5.7a, 1e lid)
//             bovengrens 0,2·l0 = 0,2·2750 = 550 mm → niet maatgevend
//   b_eff   = 475 + 475 + 300                    = 1250 mm      (5.7)
//
//   Gebied: van 11000 − 750 = 10250 tot het vrije einde op 13000 mm.
//   Lengte 2750 mm = l0. De uitkraging heeft dus GEEN eigen veldgebied; ze
//   hoort helemaal bij het steunpuntgebied ernaast — precies zoals figuur 5.2
//   het tekent.
#[test]
fn uitkraging() {
    let zones = l0_zones(&referentielijn()).unwrap();
    assert_eq!(zones.len(), 4, "vier gebieden, precies figuur 5.2");
    let z = &zones[3];
    assert_eq!(z.case, L0Case::Cantilever);
    dichtbij(z.l0_mm, 2750.0, "l0 uitkraging");
    dichtbij(z.x_start_mm, 10250.0, "begin uitkraaggebied");
    dichtbij(z.x_end_mm, 13000.0, "einde uitkraaggebied");

    let r = effective_flange_width(&t_doorsnede(), 2750.0).unwrap();
    dichtbij(r.parts[0].b_eff_i_mm, 475.0, "b_eff,1 uitkraging");
    dichtbij(r.b_eff_mm, 1250.0, "b_eff uitkraging");
}

/// Een uitkraging aan het BEGIN van de lijn is hetzelfde geval gespiegeld.
///
/// ```text
///   spans: l1 = 2000 (uitkraging), l2 = 5000, l3 = 6000; rechts vrij opgelegd
///   geldigheid: 2000 < 0,5·5000 = 2500 ✔;  5000/6000 = 0,833 ∈ [2/3; 1,5] ✔
///
///   gebied 1 (uitkraging): 2000 + 0,15·5000 = 2750 mm, van 0 tot 2750
///   gebied 2 (binnenveld): 0,7·5000         = 3500 mm, van 2750 tot 6250
///   gebied 3 (steunpunt):  0,15·(5000+6000) = 1650 mm, van 6250 tot 7900
///   gebied 4 (eindveld):   0,85·6000        = 5100 mm, van 7900 tot 13000
/// ```
#[test]
fn uitkraging_aan_het_begin() {
    let lijn = BeamLine {
        spans_mm: vec![2000.0, 5000.0, 6000.0],
        start: LineEnd::Free,
        end: LineEnd::Support,
    };
    let z = l0_zones(&lijn).unwrap();
    assert_eq!(z.len(), 4);
    assert_eq!(z[0].case, L0Case::Cantilever);
    dichtbij(z[0].l0_mm, 2750.0, "l0 uitkraging links");
    dichtbij(z[0].x_end_mm, 2750.0, "einde uitkraaggebied links");
    assert_eq!(z[1].case, L0Case::InteriorSpan);
    dichtbij(z[1].l0_mm, 3500.0, "l0 binnenveld");
    assert_eq!(z[2].case, L0Case::InteriorSupport);
    dichtbij(z[2].l0_mm, 1650.0, "l0 tussensteunpunt");
    assert_eq!(z[3].case, L0Case::EndSpan);
    dichtbij(z[3].l0_mm, 5100.0, "l0 eindveld");
    dichtbij(z[3].x_end_mm, 13000.0, "einde lijn");
}

// ───────────────────────────────────────────────────────────────────────────
// 5. GELDIGHEIDSVOORWAARDEN — weigeren met reden, niet gokken
// ───────────────────────────────────────────────────────────────────────────

/// OPMERKING bij figuur 5.2: "De lengte van de uitkraging l3 behoort kleiner
/// te zijn dan de helft van de aangrenzende overspanning."
///
///   l3 = 2600 mm, 0,5·l2 = 0,5·5000 = 2500 mm  →  2600 > 2500, dus NIET geldig
#[test]
fn uitkraging_langer_dan_de_halve_aangrenzende_overspanning_wordt_geweigerd() {
    let lijn = BeamLine {
        spans_mm: vec![6000.0, 5000.0, 2600.0],
        start: LineEnd::Support,
        end: LineEnd::Free,
    };
    let fout = beff_distribution(&lijn, &t_doorsnede()).unwrap_err();
    match fout {
        BeffError::CantileverTooLong {
            index,
            cantilever_mm,
            adjacent_mm,
        } => {
            assert_eq!(index, 2);
            dichtbij(cantilever_mm, 2600.0, "gemelde uitkraging");
            dichtbij(adjacent_mm, 5000.0, "gemelde aangrenzende overspanning");
        }
        anders => panic!("verwacht CantileverTooLong, kreeg {anders:?}"),
    }
    // De melding noemt de reden en de getallen, zodat de lezer hem kan nagaan.
    let tekst = fout.to_string();
    assert!(tekst.contains("2600"), "melding zonder de uitkraaglengte: {tekst}");
    assert!(tekst.contains("2500"), "melding zonder de grenswaarde: {tekst}");
    assert!(tekst.contains("figuur"), "melding zonder vindplaats: {tekst}");
}

/// OPMERKING bij figuur 5.2: "de verhouding van aangrenzende overspanningen
/// behoort te liggen tussen 2/3 en 1,5."
///
///   8000 / 4000 = 2,0  →  buiten [2/3; 1,5], dus NIET geldig
#[test]
fn overspanningsverhouding_buiten_2_3_en_1_5_wordt_geweigerd() {
    let lijn = BeamLine {
        spans_mm: vec![8000.0, 4000.0],
        start: LineEnd::Support,
        end: LineEnd::Support,
    };
    match beff_distribution(&lijn, &t_doorsnede()).unwrap_err() {
        BeffError::SpanRatioOutOfRange { ratio, .. } => dichtbij(ratio, 2.0, "verhouding"),
        anders => panic!("verwacht SpanRatioOutOfRange, kreeg {anders:?}"),
    }
}

/// Precies op de grens: 4000/6000 = 2/3 en 6000/4000 = 1,5 zijn allebei nog
/// toegestaan ("tussen 2/3 en 1,5"); 3900/6000 = 0,65 niet meer.
#[test]
fn de_grenzen_van_de_overspanningsverhouding_liggen_op_2_3_en_1_5() {
    let op_de_ondergrens = BeamLine {
        spans_mm: vec![4000.0, 6000.0],
        start: LineEnd::Support,
        end: LineEnd::Support,
    };
    assert!(beff_distribution(&op_de_ondergrens, &t_doorsnede()).is_ok());

    let op_de_bovengrens = BeamLine {
        spans_mm: vec![6000.0, 4000.0],
        start: LineEnd::Support,
        end: LineEnd::Support,
    };
    assert!(beff_distribution(&op_de_bovengrens, &t_doorsnede()).is_ok());

    let er_net_onder = BeamLine {
        spans_mm: vec![3900.0, 6000.0],
        start: LineEnd::Support,
        end: LineEnd::Support,
    };
    assert!(matches!(
        beff_distribution(&er_net_onder, &t_doorsnede()),
        Err(BeffError::SpanRatioOutOfRange { .. })
    ));
}

/// Een losse staaf zonder liggerlijn, en een uitkraging zonder aangrenzende
/// overspanning: geen geval uit figuur 5.2, dus geen getal.
#[test]
fn onbepaalbare_gevallen_leveren_een_reden_en_geen_getal() {
    let leeg = BeamLine {
        spans_mm: vec![],
        start: LineEnd::Support,
        end: LineEnd::Support,
    };
    assert_eq!(
        beff_distribution(&leeg, &t_doorsnede()).unwrap_err(),
        BeffError::NoSpans
    );

    let losse_uitkraging = BeamLine {
        spans_mm: vec![2500.0],
        start: LineEnd::Restrained,
        end: LineEnd::Free,
    };
    assert_eq!(
        beff_distribution(&losse_uitkraging, &t_doorsnede()).unwrap_err(),
        BeffError::CantileverWithoutAdjacentSpan
    );

    let zwevend = BeamLine {
        spans_mm: vec![5000.0, 5000.0],
        start: LineEnd::Free,
        end: LineEnd::Free,
    };
    assert_eq!(
        beff_distribution(&zwevend, &t_doorsnede()).unwrap_err(),
        BeffError::BothEndsFree
    );
}

/// Onzinnige doorsnedematen zijn ook een reden en geen getal.
#[test]
fn onzinnige_flensmaten_leveren_een_reden() {
    let geen_lijf = FlangeGeometry {
        b_w_mm: 0.0,
        b_i_mm: vec![1000.0],
    };
    assert_eq!(
        beff_distribution(&referentielijn(), &geen_lijf).unwrap_err(),
        BeffError::NonPositiveWeb { b_w_mm: 0.0 }
    );

    let negatief = FlangeGeometry {
        b_w_mm: 300.0,
        b_i_mm: vec![-10.0],
    };
    assert!(matches!(
        beff_distribution(&referentielijn(), &negatief),
        Err(BeffError::NegativeFlange { .. })
    ));

    let te_veel = FlangeGeometry {
        b_w_mm: 300.0,
        b_i_mm: vec![100.0, 100.0, 100.0],
    };
    assert!(matches!(
        beff_distribution(&referentielijn(), &te_veel),
        Err(BeffError::TooManyFlanges { count: 3 })
    ));
}

// ───────────────────────────────────────────────────────────────────────────
// 6. (5.7b) EN DE L-LIGGER
// ───────────────────────────────────────────────────────────────────────────
//
// Randligger, één overspanning van 8000 mm, aan beide kanten vrij opgelegd.
// De momentnulpunten liggen in de steunpunten zelf, dus l0 = l = 8000 mm
// (5.3.2.1(2)); figuur 5.2 tekent dit geval niet.
//
//   b_w = 250 mm, b_1 = 800 mm  →  b = 1050 mm
//   b_eff,1 = 0,2·800 + 0,1·8000 = 160 + 800 =  960 mm    (5.7a, 1e lid)
//             bovengrens 0,2·l0 = 1600 mm → niet maatgevend
//             bovengrens b_1    =  800 mm → MAATGEVEND    (5.7b)
//   b_eff   = 800 + 250 = 1050 mm = b                     (5.7)
#[test]
fn l_ligger_enkele_overspanning() {
    let lijn = BeamLine {
        spans_mm: vec![8000.0],
        start: LineEnd::Support,
        end: LineEnd::Support,
    };
    let rand = FlangeGeometry {
        b_w_mm: 250.0,
        b_i_mm: vec![800.0],
    };
    let v = beff_distribution(&lijn, &rand).unwrap();
    assert_eq!(v.zones.len(), 1);
    assert_eq!(v.zones[0].zone.case, L0Case::SingleSpan);
    dichtbij(v.zones[0].zone.l0_mm, 8000.0, "l0 enkele overspanning");
    dichtbij(v.zones[0].parts[0].formula_mm, 960.0, "0,2·b_i + 0,1·l0");
    dichtbij(v.zones[0].parts[0].b_eff_i_mm, 800.0, "b_eff,1");
    assert_eq!(v.zones[0].parts[0].governing, BeffBound::CapBi);
    dichtbij(v.zones[0].b_eff_mm, 1050.0, "b_eff");
    dichtbij(v.zones[0].b_mm, 1050.0, "b");
    assert!(
        !v.zones[0].limited_by_b,
        "met (5.7b) toegepast kan de grens b van (5.7) niet meer ingrijpen"
    );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. MOMENTVAST BUITENUITEINDE — buiten figuur 5.2, en dat staat er ook bij
// ───────────────────────────────────────────────────────────────────────────
//
// Portaalligger van 7000 mm, aan beide zijden momentvast op een kolom.
//
//   steunpuntgebied:  l0 = 0,15·7000                       = 1050 mm
//   veldgebied:       l0 = 7000 − 2·1050 = 0,7·7000        = 4900 mm
//
//   veld:      b_eff,i = 0,2·1000 + 0,1·4900 = 200 + 490   =  690 mm
//                        0,2·4900 = 980 → niet maatgevend
//              b_eff   = 690 + 690 + 300                   = 1680 mm
//   steunpunt: b_eff,i = 0,2·1000 + 0,1·1050 = 200 + 105   =  305 mm
//                        0,2·1050 = 210 → MAATGEVEND
//              b_eff   = 210 + 210 + 300                   =  720 mm
#[test]
fn momentvast_uiteinde_leest_als_tussensteunpunt_en_meldt_dat() {
    let lijn = BeamLine {
        spans_mm: vec![7000.0],
        start: LineEnd::Restrained,
        end: LineEnd::Restrained,
    };
    let v = beff_distribution(&lijn, &t_doorsnede()).unwrap();
    assert_eq!(v.zones.len(), 3);

    assert_eq!(v.zones[0].zone.case, L0Case::RestrainedEnd);
    dichtbij(v.zones[0].zone.l0_mm, 1050.0, "l0 momentvast uiteinde");
    dichtbij(v.zones[0].b_eff_mm, 720.0, "b_eff momentvast uiteinde");

    assert_eq!(v.zones[1].zone.case, L0Case::InteriorSpan);
    dichtbij(v.zones[1].zone.l0_mm, 4900.0, "l0 veld");
    dichtbij(v.zones[1].b_eff_mm, 1680.0, "b_eff veld");

    assert_eq!(v.zones[2].zone.case, L0Case::RestrainedEnd);
    dichtbij(v.zones[2].zone.x_end_mm, 7000.0, "einde lijn");

    // De keuze is zichtbaar en niet impliciet.
    assert!(
        v.notes.iter().any(|n| n.contains("momentvast")),
        "de melding over het momentvaste uiteinde ontbreekt: {:?}",
        v.notes
    );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. DOORGAANDE LIGGER — de gebieden tegelen de hele lijn
// ───────────────────────────────────────────────────────────────────────────
//
// Drie gelijke velden van 6000 mm, beide buitensteunpunten vrij opgelegd:
//
//   0,85·6000        = 5100   van     0 tot  5100
//   0,15·(6000+6000) = 1800   van  5100 tot  6900
//   0,7·6000         = 4200   van  6900 tot 11100
//   0,15·(6000+6000) = 1800   van 11100 tot 12900
//   0,85·6000        = 5100   van 12900 tot 18000
//   ------------------------------------------------
//   som              = 18000 = l1 + l2 + l3                          ✔
#[test]
fn drie_gelijke_velden() {
    let lijn = BeamLine {
        spans_mm: vec![6000.0, 6000.0, 6000.0],
        start: LineEnd::Support,
        end: LineEnd::Support,
    };
    let z = l0_zones(&lijn).unwrap();
    let verwacht = [
        (L0Case::EndSpan, 0.0, 5100.0),
        (L0Case::InteriorSupport, 5100.0, 6900.0),
        (L0Case::InteriorSpan, 6900.0, 11100.0),
        (L0Case::InteriorSupport, 11100.0, 12900.0),
        (L0Case::EndSpan, 12900.0, 18000.0),
    ];
    assert_eq!(z.len(), verwacht.len());
    for (i, (geval, x0, x1)) in verwacht.iter().enumerate() {
        assert_eq!(z[i].case, *geval, "geval van gebied {i}");
        dichtbij(z[i].x_start_mm, *x0, &format!("begin gebied {i}"));
        dichtbij(z[i].x_end_mm, *x1, &format!("einde gebied {i}"));
        dichtbij(z[i].l0_mm, x1 - x0, &format!("l0 gebied {i}"));
    }
}

// ───────────────────────────────────────────────────────────────────────────
// 9. 5.3.2.1(4) — de terugvaloptie
// ───────────────────────────────────────────────────────────────────────────
//
// "mag een constante breedte over de gehele overspanning zijn aangenomen. De
// waarde die van toepassing is op de velddoorsnede behoort hiervoor te zijn
// aangenomen."  →  per overspanning de VELDwaarde: 1720 mm voor l1, 1400 mm
// voor l2. De uitkraging heeft geen velddoorsnede en dus geen (4)-waarde.
#[test]
fn constante_breedte_per_overspanning_is_de_velddoorsnede() {
    let v = beff_distribution(&referentielijn(), &t_doorsnede()).unwrap();
    dichtbij(v.constant_for_span(0).unwrap(), 1720.0, "constante b_eff l1");
    dichtbij(v.constant_for_span(1).unwrap(), 1400.0, "constante b_eff l2");
    assert_eq!(v.constant_for_span(2), None, "uitkraging heeft geen veld");
    // De veiligste enkele waarde is de kleinste over alle gebieden (960 mm,
    // boven het tussensteunpunt).
    dichtbij(v.min_b_eff_mm(), 960.0, "kleinste b_eff");
}

/// De plaatsafbeelding x → b_eff, waarmee de aanroeper elk staafsegment zijn
/// eigen breedte kan geven.
#[test]
fn beff_op_een_plaats_langs_de_lijn() {
    let v = beff_distribution(&referentielijn(), &t_doorsnede()).unwrap();
    dichtbij(v.b_eff_at_mm(2000.0).unwrap(), 1720.0, "midden eindveld");
    dichtbij(v.b_eff_at_mm(6000.0).unwrap(), 960.0, "op het steunpunt");
    dichtbij(v.b_eff_at_mm(8500.0).unwrap(), 1400.0, "midden binnenveld");
    dichtbij(v.b_eff_at_mm(12500.0).unwrap(), 1250.0, "op de uitkraging");
    assert_eq!(v.b_eff_at_mm(-1.0), None);
    assert_eq!(v.b_eff_at_mm(13001.0), None);
}

/// Een rechthoekige doorsnede zonder uitkragende flensdelen: b_eff = b_w, en
/// de melding zegt dat 5.3.2.1 over T- en L-liggers gaat.
#[test]
fn zonder_flens_is_beff_gelijk_aan_de_lijfbreedte() {
    let rechthoek = FlangeGeometry {
        b_w_mm: 300.0,
        b_i_mm: vec![],
    };
    let v = beff_distribution(&referentielijn(), &rechthoek).unwrap();
    for z in &v.zones {
        dichtbij(z.b_eff_mm, 300.0, "b_eff rechthoek");
    }
    assert!(v.notes.iter().any(|n| n.contains("rechthoekig")));
}
