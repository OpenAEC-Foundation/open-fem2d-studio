//! `doorsnedemotor` — de exacte doorsnedemotor als JSON-in / JSON-uit.
//!
//! Hierdoor kan het generatiescript (`scripts/genereer-profieldata.mjs`)
//! dezelfde rekenkern gebruiken als de app zelf, in plaats van de formules in
//! JavaScript na te bouwen. Dat is het hele punt: **één waarheid**. Wat hier
//! uitkomt is wat de toetsing straks gebruikt.
//!
//! ```text
//! cargo run -q -p section-properties --bin doorsnedemotor -- invoer.json uitvoer.json
//! ```
//!
//! De invoer is een array van geometrie-objecten:
//!
//! ```json
//! [{ "naam": "IPE 200", "soort": "ISection", "h": 200, "b": 100,
//!    "tw": 5.6, "tf": 8.5, "r": 12 }]
//! ```
//!
//! `soort` is `ISection` | `Channel` | `ChannelSchuin` | `Shs` | `Rhs` | `Chs`
//! | `Rechthoek`. Bij een koker telt alleen `t`; bij een buis is `h` de
//! buitendiameter. Optioneel `elementen_per_wand` (standaard 8) om de mesh van
//! de torsieoplossing fijner te zetten.
//!
//! De uitvoer geeft per profiel alle velden van `SectionProperties` plus de
//! diagnostiek waarmee te controleren is dát het klopt: de insluiting van `It`
//! tussen onder- en bovengrens, het meshoppervlak tegenover het exacte
//! oppervlak, het aantal driehoeken en de rekentijd.
//!
//! Zonder argumenten leest hij van stdin en schrijft naar stdout.

use std::io::{Read, Write};

use section_properties::motor::{self, Profielvorm};
use section_properties::torsie::{aanbevolen_h, TorsieOpties};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Invoer {
    #[serde(default)]
    naam: String,
    soort: String,
    #[serde(default)]
    h: f64,
    #[serde(default)]
    b: f64,
    #[serde(default)]
    tw: f64,
    #[serde(default)]
    tf: f64,
    #[serde(default)]
    t: f64,
    #[serde(default)]
    r: f64,
    /// Aantal driehoeken door de dunste wand; standaard 8.
    #[serde(default)]
    elementen_per_wand: Option<f64>,
}

#[derive(Serialize)]
struct Uitvoer {
    naam: String,
    soort: String,

    area_mm2: f64,
    iy_mm4: f64,
    iz_mm4: f64,
    wel_y_mm3: f64,
    wel_z_mm3: f64,
    wpl_y_mm3: f64,
    wpl_z_mm3: f64,
    av_y_mm2: f64,
    av_z_mm2: f64,
    it_mm4: f64,
    iw_mm6: f64,
    iy_radius_mm: f64,
    iz_radius_mm: f64,
    h_mm: f64,
    b_mm: f64,
    tw_mm: f64,
    tf_mm: f64,
    r_mm: f64,

    y_c_mm: f64,
    z_c_mm: f64,
    wel_y_top_mm3: f64,
    wel_y_bot_mm3: f64,
    wel_z_left_mm3: f64,
    wel_z_right_mm3: f64,
    iyz_mm4: f64,
    iu_mm4: f64,
    iv_mm4: f64,
    alpha_hoofdas_rad: f64,
    y_s_mm: f64,
    z_s_mm: f64,

    // ── Diagnostiek: waarmee je het getal kunt wantrouwen ────────────────────
    /// Gegarandeerde ondergrens van `It` (Prandtl).
    it_ondergrens_mm4: f64,
    /// Bovengrens van `It` (welving, Rayleigh-quotiënt).
    it_bovengrens_mm4: f64,
    /// Halve breedte van dat interval, relatief.
    it_onzekerheid: f64,
    /// Oppervlak van de gediscretiseerde doorsnede; hoort samen te vallen met
    /// `area_mm2`, dat exact is.
    a_mesh_mm2: f64,
    /// Relatief verschil tussen mesh en exacte contour.
    a_mesh_afwijking: f64,
    h_mesh_mm: f64,
    driehoeken: usize,
    kleinste_hoek_graden: f64,
    tijd_ms: f64,
    /// `true` als de doorsnede uit losse stukken bestaat; `Iw` en het
    /// schuifmiddelpunt zijn dan betekenisloos.
    losse_delen: bool,
}

fn vorm_van(i: &Invoer) -> Result<Profielvorm, String> {
    let dikte = if i.t > 0.0 { i.t } else { i.tw };
    Ok(match i.soort.as_str() {
        "ISection" => Profielvorm::IProfiel { h: i.h, b: i.b, tw: i.tw, tf: i.tf, r: i.r },
        // Evenwijdige flenzen (UPE, DIN 1026-2).
        "Channel" => Profielvorm::UProfiel { h: i.h, b: i.b, tw: i.tw, tf: i.tf, r: i.r },
        // Toelopende flenzen (UNP, DIN 1026-1).
        "ChannelSchuin" => {
            Profielvorm::UProfielSchuin { h: i.h, b: i.b, tw: i.tw, tf: i.tf, r: i.r }
        }
        "Shs" | "Rhs" => Profielvorm::Koker { h: i.h, b: i.b, t: dikte },
        "Chs" => Profielvorm::Buis { d: i.h, t: dikte },
        "Rechthoek" => Profielvorm::Rechthoek { h: i.h, b: i.b },
        anders => return Err(format!("onbekende soort: {anders}")),
    })
}

fn reken(i: &Invoer) -> Result<Uitvoer, String> {
    let vorm = vorm_van(i)?;
    let d = vorm.doorsnede();
    let per_wand = i.elementen_per_wand.unwrap_or(section_properties::torsie::ELEMENTEN_PER_WAND);
    let opties = TorsieOpties::met_h(aanbevolen_h(&d, per_wand));
    let m = motor::bereken_uitgebreid(&vorm, Some(opties));
    let p = m.props;
    let t = m.torsie;
    // De mesh alleen voor de kwaliteitsmaat opnieuw opbouwen; dat is dezelfde
    // mesh, want `genereer` is deterministisch in `h`.
    let mesh = section_properties::mesh2d::genereer(&d, t.h_mm);

    Ok(Uitvoer {
        naam: i.naam.clone(),
        soort: i.soort.clone(),
        area_mm2: p.area_mm2,
        iy_mm4: p.iy_mm4,
        iz_mm4: p.iz_mm4,
        wel_y_mm3: p.wel_y_mm3,
        wel_z_mm3: p.wel_z_mm3,
        wpl_y_mm3: p.wpl_y_mm3,
        wpl_z_mm3: p.wpl_z_mm3,
        av_y_mm2: p.av_y_mm2,
        av_z_mm2: p.av_z_mm2,
        it_mm4: p.it_mm4,
        iw_mm6: p.iw_mm6,
        iy_radius_mm: p.iy_radius_mm,
        iz_radius_mm: p.iz_radius_mm,
        h_mm: p.h_mm,
        b_mm: p.b_mm,
        tw_mm: p.tw_mm,
        tf_mm: p.tf_mm,
        r_mm: p.r_mm,
        y_c_mm: p.y_c_mm,
        z_c_mm: p.z_c_mm,
        wel_y_top_mm3: p.wel_y_top_mm3,
        wel_y_bot_mm3: p.wel_y_bot_mm3,
        wel_z_left_mm3: p.wel_z_left_mm3,
        wel_z_right_mm3: p.wel_z_right_mm3,
        iyz_mm4: p.iyz_mm4,
        iu_mm4: p.iu_mm4,
        iv_mm4: p.iv_mm4,
        alpha_hoofdas_rad: p.alpha_hoofdas_rad,
        y_s_mm: p.y_s_mm,
        z_s_mm: p.z_s_mm,
        it_ondergrens_mm4: t.it_ondergrens_mm4,
        it_bovengrens_mm4: t.it_bovengrens_mm4,
        it_onzekerheid: t.it_onzekerheid,
        a_mesh_mm2: t.a_mesh_mm2,
        a_mesh_afwijking: if p.area_mm2 > 0.0 {
            (t.a_mesh_mm2 - p.area_mm2) / p.area_mm2
        } else {
            0.0
        },
        h_mesh_mm: t.h_mm,
        driehoeken: t.driehoeken,
        kleinste_hoek_graden: mesh.kleinste_hoek_graden(),
        tijd_ms: t.tijd_ms,
        losse_delen: t.losse_delen,
    })
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let bron = match args.first() {
        Some(p) => std::fs::read_to_string(p).unwrap_or_else(|e| {
            eprintln!("kan {p} niet lezen: {e}");
            std::process::exit(2);
        }),
        None => {
            let mut s = String::new();
            std::io::stdin().read_to_string(&mut s).expect("stdin");
            s
        }
    };

    let invoer: Vec<Invoer> = serde_json::from_str(&bron).unwrap_or_else(|e| {
        eprintln!("invoer is geen geldige JSON-array van geometrieën: {e}");
        std::process::exit(2);
    });

    let mut uit = Vec::with_capacity(invoer.len());
    for i in &invoer {
        match reken(i) {
            Ok(u) => uit.push(u),
            Err(e) => {
                eprintln!("{}: {e}", i.naam);
                std::process::exit(2);
            }
        }
    }

    let tekst = serde_json::to_string(&uit).expect("serialiseren");
    match args.get(1) {
        Some(p) => std::fs::write(p, tekst).unwrap_or_else(|e| {
            eprintln!("kan {p} niet schrijven: {e}");
            std::process::exit(2);
        }),
        None => {
            let stdout = std::io::stdout();
            let mut l = stdout.lock();
            l.write_all(tekst.as_bytes()).expect("stdout");
            l.write_all(b"\n").expect("stdout");
        }
    }
}
