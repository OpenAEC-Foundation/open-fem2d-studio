//! W_pl van elk gewalst I-profiel binnen 0,5 % van de exacte contour.
//!
//! Basisaudit nr 33: de overgetypte tabelwaarden van W_pl,z van de HEM-reeks
//! stonden tot 1,9 % te hoog (HEM 300: 1 950 000 tegen 1 913 180 mm³). Een te
//! hoge W_pl,z geeft een te hoge M_z,c,Rd (6.2.5) en een te gunstige
//! interactie (6.61/6.62). W_pl is een zuivere contourgrootheid — tweemaal het
//! statisch moment van de halve doorsnede om de plastische neutrale lijn — en
//! de contourmotor rekent haar exact, zonder mesh. Deze test is de grens van
//! 0,5 % op de hele database: wie een nieuwe I-reeks overtypt of een oude
//! bijstelt, valt hier door zodra W_pl,y of W_pl,z meer dan een
//! afrondingsmarge van de meetkunde afwijkt.
//!
//! De grens is 0,5 % en niet strakker, omdat de niet-hersteld regels op drie
//! significante cijfers staan (afronding tot 0,5 %). Strakker dan de
//! afronding zou honderd regels in beweging zetten zonder één onveilig getal
//! te verbeteren.

use section_properties::motor::Profielvorm;
use steel_profiles::{db, ProfileKind};

/// Alle gewalste I-profielen, met de flenshelling uit de database (INP: 14 %).
fn i_profielen() -> Vec<(&'static str, Profielvorm, f64, f64)> {
    db().all()
        .iter()
        .filter(|p| matches!(p.kind, ProfileKind::ISection))
        .map(|p| {
            let g = &p.geometry;
            let vorm = if g.flange_slope > 0.0 {
                Profielvorm::IProfielSchuin { h: g.h, b: g.b, tw: g.tw, tf: g.tf, r: g.r }
            } else {
                Profielvorm::IProfiel { h: g.h, b: g.b, tw: g.tw, tf: g.tf, r: g.r }
            };
            (p.name.as_str(), vorm, p.properties.wpl_y_mm3, p.properties.wpl_z_mm3)
        })
        .collect()
}

#[test]
fn wpl_van_elk_i_profiel_binnen_een_half_procent_van_de_contour() {
    let lijst = i_profielen();
    assert!(lijst.len() > 100, "verwachtte de hele I-catalogus, kreeg {}", lijst.len());
    let mut fouten = Vec::new();
    for (naam, vorm, wpl_y_db, wpl_z_db) in &lijst {
        let e = vorm.doorsnede().bereken();
        let dy = (wpl_y_db - e.wpl_y_mm3) / e.wpl_y_mm3 * 100.0;
        let dz = (wpl_z_db - e.wpl_z_mm3) / e.wpl_z_mm3 * 100.0;
        if dy.abs() > 0.5 {
            fouten.push(format!("{naam}: W_pl,y {wpl_y_db} tegen contour {:.0} ({dy:+.2} %)", e.wpl_y_mm3));
        }
        if dz.abs() > 0.5 {
            fouten.push(format!("{naam}: W_pl,z {wpl_z_db} tegen contour {:.0} ({dz:+.2} %)", e.wpl_z_mm3));
        }
    }
    assert!(fouten.is_empty(), "W_pl buiten de 0,5 %-grens:\n{}", fouten.join("\n"));
}

/// De negen regels die in september 2026 uit de motor zijn overgenomen, met
/// de hand na te rekenen via W_pl,z = t_f·b²/2 + h_w·t_w²/4 + 4·A_r·(t_w/2 + e)
/// (A_r = (1 − π/4)·r², e = r·(10 − 3π)/(12 − 3π), de zwaartepuntsafstand van
/// een uitronding tot de scherpe hoek). HEM 300 (h 340, b 310, t_w 21, t_f 39,
/// r 27): 39·310²/2 + 262·21²/4 + 4·156,5·(10,5 + 6,03) = 1 873 950 + 28 886 +
/// 10 345 = 1 913 180 mm³.
#[test]
fn hem_300_wpl_z_is_de_contourwaarde() {
    let p = db().find("HEM 300").expect("HEM 300");
    let (h, b, tw, tf, r) = (340.0_f64, 310.0_f64, 21.0_f64, 39.0_f64, 27.0_f64);
    let a_r = (1.0 - std::f64::consts::PI / 4.0) * r * r;
    let e = r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI);
    let hand = tf * b * b / 2.0 + (h - 2.0 * tf) * tw * tw / 4.0 + 4.0 * a_r * (tw / 2.0 + e);
    assert!((hand - 1_913_180.0).abs() < 20.0, "handformule: {hand}");
    assert!(
        ((p.properties.wpl_z_mm3 - hand) / hand).abs() < 1e-5,
        "database {} tegen hand {hand}",
        p.properties.wpl_z_mm3
    );
    // De oude, overgetypte 1 950 000 zit er 1,9 % boven.
    assert!(p.properties.wpl_z_mm3 < 1_920_000.0);
}
