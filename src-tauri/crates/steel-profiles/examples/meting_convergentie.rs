//! TIJDELIJK — netverfijningsstudie op een representatieve steekproef.
//! Toont of `It`/`Iw` van de motor zijn uitgeconvergeerd, zodat een afwijking
//! t.o.v. de database niet aan de discretisatie kan liggen.

use section_properties::contour::{self, Doorsnede};
use section_properties::torsie::{self, TorsieOpties};
use steel_profiles::{ProfileKind, SteelProfile};

fn contour_van(p: &SteelProfile, en10210: bool) -> Doorsnede {
    let g = &p.geometry;
    match p.kind {
        ProfileKind::ISection => contour::i_profiel(g.h, g.b, g.tw, g.tf, g.r),
        ProfileKind::Channel => contour::u_profiel(g.h, g.b, g.tw, g.tf, g.r),
        ProfileKind::Rhs | ProfileKind::Shs => {
            if en10210 {
                let buiten = contour::Contour::afgeronde_rechthoek(0.0, 0.0, g.b, g.h, 1.5 * g.t);
                let binnen = contour::Contour::afgeronde_rechthoek(
                    g.t, g.t, g.b - 2.0 * g.t, g.h - 2.0 * g.t, 1.0 * g.t,
                );
                Doorsnede::nieuw().met(buiten).met_gat(binnen)
            } else {
                contour::koker(g.h, g.b, g.t, g.r)
            }
        }
        ProfileKind::Chs => contour::buis(g.h, g.t),
    }
}

fn main() {
    let db = steel_profiles::db();
    let steekproef = [
        "IPE 80", "IPE 200", "HEM 100", "HEA 300", "HEB 300",
        "UPE 80", "UPE 200", "UPE 400",
        "UNP 200",
        "CHS 33.7x4", "CHS 219.1x10",
        "SHS 60x60x8", "SHS 200x200x8", "RHS 100x50x4", "RHS 80x40x8",
    ];
    println!("naam;soort;factor;h_mm;driehoeken;a_mesh;a_exact;it_onder;it_beste;it_boven;iw;it_db;iw_db");
    for naam in steekproef {
        let p = db.find(naam).expect("profiel bestaat");
        let en = matches!(p.kind, ProfileKind::Rhs | ProfileKind::Shs);
        let d = contour_van(p, en);
        let e = d.bereken();
        let h0 = torsie::aanbevolen_h(&d, torsie::ELEMENTEN_PER_WAND);
        for f in [1.0f64, 2.0, 4.0] {
            let h = h0 / f;
            // Zeer fijne netten op de grootste doorsneden overslaan.
            if h < 0.25 && e.a_mm2 > 8000.0 {
                continue;
            }
            let r = torsie::bereken_met(&d, TorsieOpties::met_h(h));
            println!(
                "{};{:?};{};{:.5};{};{:.4e};{:.4e};{:.8e};{:.8e};{:.8e};{:.8e};{:.6e};{:.6e}",
                p.name, p.kind, f, h, r.driehoeken, r.a_mesh_mm2, e.a_mm2,
                r.it_ondergrens_mm4, r.it_beste_mm4, r.it_bovengrens_mm4, r.iw_mm6,
                p.properties.it_mm4, p.properties.iw_mm6
            );
        }
    }
}
