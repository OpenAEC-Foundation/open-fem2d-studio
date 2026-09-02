//! TIJDELIJKE meetharnas — rekent de volledige profieldatabase opnieuw door met
//! de contour- + torsiemotor en schrijft het resultaat als CSV naar stdout.
//! Wordt NIET gecommit; puur voor de validatiemeting.

use section_properties::contour::{self, Doorsnede};
use section_properties::torsie;
use steel_profiles::{ProfileKind, SteelProfile};

/// Bouw de doorsnedecontour uit de opgeslagen basisgeometrie.
fn contour_van(p: &SteelProfile) -> Doorsnede {
    let g = &p.geometry;
    match p.kind {
        ProfileKind::ISection => contour::i_profiel(g.h, g.b, g.tw, g.tf, g.r),
        ProfileKind::Channel => contour::u_profiel(g.h, g.b, g.tw, g.tf, g.r),
        // Kokers: de opgeslagen r is de BUITENhoekstraal (1,5·t volgens
        // EN 10210-2). `koker()` leidt de binnenstraal af als r_buiten − t.
        ProfileKind::Rhs | ProfileKind::Shs => contour::koker(g.h, g.b, g.t, g.r),
        ProfileKind::Chs => contour::buis(g.h, g.t),
    }
}

/// Variant-koker volgens de normconventie EN 10210-2: buiten 1,5·t, binnen 1,0·t.
/// Nodig om "modelverschil" van "motorfout" te scheiden.
fn koker_en10210(h: f64, b: f64, t: f64) -> Doorsnede {
    let ro = 1.5 * t;
    let ri = 1.0 * t;
    let buiten = contour::Contour::afgeronde_rechthoek(0.0, 0.0, b, h, ro);
    let binnen = contour::Contour::afgeronde_rechthoek(t, t, b - 2.0 * t, h - 2.0 * t, ri);
    Doorsnede::nieuw().met(buiten).met_gat(binnen)
}

/// Av;z volgens EN 1993-1-1 §6.2.6(3), met het oppervlak van de motor.
fn av_z(p: &SteelProfile, a: f64) -> f64 {
    let g = &p.geometry;
    match p.kind {
        ProfileKind::ISection => {
            let hw = g.h - 2.0 * g.tf;
            (a - 2.0 * g.b * g.tf + (g.tw + 2.0 * g.r) * g.tf).max(hw * g.tw)
        }
        ProfileKind::Channel => {
            let hw = g.h - 2.0 * g.tf;
            (a - 2.0 * g.b * g.tf + (g.tw + g.r) * g.tf).max(hw * g.tw)
        }
        ProfileKind::Rhs | ProfileKind::Shs => a * g.h / (g.b + g.h),
        ProfileKind::Chs => 2.0 * a / std::f64::consts::PI,
    }
}

fn main() {
    let db = steel_profiles::db();
    println!(
        "naam;soort;h;b;tw;tf;t;r;\
         a_db;a_mot;iy_db;iy_mot;iz_db;iz_mot;\
         wely_db;wely_mot;welz_db;welz_mot;wply_db;wply_mot;wplz_db;wplz_mot;\
         iyr_db;iyr_mot;izr_db;izr_mot;avz_db;avz_mot;\
         it_db;it_mot;it_onder;it_boven;it_onz;iw_db;iw_mot;\
         a_mesh;h_mesh;driehoeken;hoek_min;tijd_ms;\
         a_alt;iy_alt;iz_alt;wply_alt;wplz_alt;it_alt"
    );
    for p in db.all() {
        let d = contour_van(p);
        let e = d.bereken();
        let t = torsie::bereken(&d);
        let db_p = &p.properties;
        let g = &p.geometry;

        let wely = e.wel_y_boven_mm3.min(e.wel_y_onder_mm3);
        let welz = e.wel_z_links_mm3.min(e.wel_z_rechts_mm3);

        // Alternatieve kokermeetkunde (binnenstraal 1,0·t) als vergelijking.
        let (a_alt, iy_alt, iz_alt, wply_alt, wplz_alt, it_alt) =
            if matches!(p.kind, ProfileKind::Rhs | ProfileKind::Shs) {
                let d2 = koker_en10210(g.h, g.b, g.t);
                let e2 = d2.bereken();
                let t2 = torsie::bereken(&d2);
                (e2.a_mm2, e2.iy_mm4, e2.iz_mm4, e2.wpl_y_mm3, e2.wpl_z_mm3, t2.it_beste_mm4)
            } else {
                (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
            };

        let mesh = section_properties::mesh2d::genereer(&d, t.h_mm);

        println!(
            "{};{:?};{};{};{};{};{};{};\
             {:.6e};{:.6e};{:.6e};{:.6e};{:.6e};{:.6e};\
             {:.6e};{:.6e};{:.6e};{:.6e};{:.6e};{:.6e};{:.6e};{:.6e};\
             {:.6e};{:.6e};{:.6e};{:.6e};{:.6e};{:.6e};\
             {:.6e};{:.6e};{:.6e};{:.6e};{:.4e};{:.6e};{:.6e};\
             {:.6e};{:.4};{};{:.3};{:.1};\
             {:.6e};{:.6e};{:.6e};{:.6e};{:.6e};{:.6e}",
            p.name,
            p.kind,
            g.h, g.b, g.tw, g.tf, g.t, g.r,
            db_p.area_mm2, e.a_mm2,
            db_p.iy_mm4, e.iy_mm4,
            db_p.iz_mm4, e.iz_mm4,
            db_p.wel_y_mm3, wely,
            db_p.wel_z_mm3, welz,
            db_p.wpl_y_mm3, e.wpl_y_mm3,
            db_p.wpl_z_mm3, e.wpl_z_mm3,
            db_p.iy_radius_mm, e.i_y_straal_mm,
            db_p.iz_radius_mm, e.i_z_straal_mm,
            db_p.av_z_mm2, av_z(p, e.a_mm2),
            db_p.it_mm4, t.it_beste_mm4, t.it_ondergrens_mm4, t.it_bovengrens_mm4,
            t.it_onzekerheid,
            db_p.iw_mm6, t.iw_mm6,
            t.a_mesh_mm2, t.h_mm, t.driehoeken, mesh.kleinste_hoek_graden(), t.tijd_ms,
            a_alt, iy_alt, iz_alt, wply_alt, wplz_alt, it_alt
        );
    }
}
