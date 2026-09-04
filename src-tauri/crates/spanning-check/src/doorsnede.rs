//! Het vezelmodel van een doorsnede: een stapel lagen met constante breedte,
//! van boven (z = 0) naar beneden (z = h).
//!
//! Met dat model zijn alle grootheden bepaald die de spanningstoets nodig
//! heeft, en alle drie uit dezelfde bron — geen losse tabelwaarden die met
//! elkaar in tegenspraak kunnen raken:
//!
//! ```text
//!   A     = Σ b_i · t_i
//!   z_c   = Σ b_i · t_i · z_i / A            (vanaf de bovenkant)
//!   I_y   = Σ ( b_i · t_i³/12 + b_i · t_i · (z_i − z_c)² )
//!   S(z)  = | ∫₀ᶻ b(ζ) · (ζ − z_c) dζ |      (statisch moment van het deel
//!                                             bóven z, om de zwaartelijn)
//!   b(z)  = de breedte van de laag waarin z ligt
//! ```
//!
//! Op een laaggrens (flens → lijf) is `b(z)` tweewaardig; daar springt de
//! schuifspanning. Het model geeft de grens daarom twee keer terug, één keer
//! met de breedte erboven en één keer met de breedte eronder, zodat de sprong
//! in het spanningsverloop zichtbaar wordt in plaats van weggemiddeld.
//!
//! # Aannamen, expliciet
//!
//! - Rechte lagen: walsuitrondingen (de straal r bij I- en U-profielen, de
//!   hoekstraal bij kokers) zitten NIET in het model. Voor een
//!   catalogusprofiel worden `A` en `I_y` daarom uit de profieldatabase
//!   overgenomen (die zíjn inclusief uitrondingen) en dient het lagenmodel
//!   alleen voor `S(z)` en `b(z)`. Het verschil wordt als notitie gemeld.
//! - Een ronde wand (CHS) is geen laagmodel; die wordt met stroken benaderd,
//!   met de exacte wandbreedte op het midden van elke strook.
//! - Buiging alleen om de sterke as (y). M_z en torsie zitten niet in dit
//!   model; de orkestratie meldt het wanneer ze niet nul zijn.

use serde::{Deserialize, Serialize};
use steel_profiles::{ProfileKind, SteelProfile};
use ts_rs::TS;

/// Aantal stroken waarmee een ronde wand (CHS) benaderd wordt.
const CHS_STROKEN: usize = 80;

/// Eén laag van het vezelmodel: constante breedte tussen twee hoogten.
/// `z` loopt vanaf de bovenkant van de doorsnede naar beneden (mm).
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct SpanningLaag {
    /// Bovenkant van de laag vanaf de bovenkant van de doorsnede (mm).
    pub z_top_mm: f64,
    /// Onderkant van de laag (mm).
    pub z_bot_mm: f64,
    /// Meewerkende breedte van de laag (mm). Voor een koker de som van beide
    /// wanden, voor een buis de som van de twee wanddoorsneden op die hoogte.
    pub breedte_mm: f64,
}

impl SpanningLaag {
    pub fn dikte_mm(&self) -> f64 {
        self.z_bot_mm - self.z_top_mm
    }
    fn z_mid(&self) -> f64 {
        (self.z_top_mm + self.z_bot_mm) / 2.0
    }
}

/// De doorsnede zoals de gebruiker hem opgeeft.
///
/// Drie vormen, alle drie met een echte geometrie — juist omdat het
/// spanningsverloop over de hoogte getekend moet worden. Een doorsnede die
/// alleen als A/I/W bekend is heeft geen vezelverdeling en zou dus geen
/// verloop kunnen leveren; die vorm zit hier bewust niet in. Wie toch een
/// vrije doorsnede wil, geeft hem als `Lagen`.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
#[serde(tag = "vorm", content = "maten")]
pub enum SpanningDoorsnede {
    /// Massieve rechthoek b × h (mm).
    Rechthoek(Rechthoek),
    /// Catalogusprofiel uit de profieldatabase, op naam ("HEA 200").
    Catalogus(Catalogus),
    /// Vrij opgegeven lagenmodel, van boven naar beneden.
    Lagen(Lagenmodel),
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct Rechthoek {
    pub b_mm: f64,
    pub h_mm: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct Catalogus {
    /// Profielnaam; dezelfde zoeksleutel als de staaltoetsing ("HEA200",
    /// "HEA 200" en "hea-200" vinden hetzelfde profiel).
    pub naam: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/spanning/")]
pub struct Lagenmodel {
    /// Lagen van boven naar beneden; aaneengesloten, dus `z_bot` van laag i
    /// is `z_top` van laag i+1.
    pub lagen: Vec<SpanningLaag>,
}

/// Uitgewerkt vezelmodel: de lagen plus de daaruit volgende grootheden.
#[derive(Clone, Debug)]
pub struct Vezelmodel {
    pub lagen: Vec<SpanningLaag>,
    pub hoogte_mm: f64,
    /// Zwaartelijn vanaf de bovenkant (mm).
    pub z_c_mm: f64,
    /// Oppervlakte van het lagenmodel (mm²).
    pub a_model_mm2: f64,
    /// Traagheidsmoment van het lagenmodel om de zwaartelijn (mm⁴).
    pub iy_model_mm4: f64,
    /// Grootste laagbreedte (mm) — alleen voor de tekening.
    pub breedte_max_mm: f64,
}

impl Vezelmodel {
    /// Bouw het model uit een lagenlijst. Een fout is een Nederlandse melding
    /// voor de gebruiker.
    pub fn nieuw(lagen: Vec<SpanningLaag>) -> Result<Self, String> {
        if lagen.is_empty() {
            return Err("de doorsnede heeft geen enkele laag".to_string());
        }
        let mut a = 0.0;
        let mut az = 0.0;
        let mut breedte_max: f64 = 0.0;
        for (i, l) in lagen.iter().enumerate() {
            let t = l.dikte_mm();
            if !(t > 0.0) {
                return Err(format!(
                    "laag {} loopt van z = {} tot z = {} mm — de dikte moet positief zijn",
                    i + 1,
                    l.z_top_mm,
                    l.z_bot_mm
                ));
            }
            if !(l.breedte_mm > 0.0) {
                return Err(format!(
                    "laag {} heeft breedte {} mm — moet positief zijn",
                    i + 1,
                    l.breedte_mm
                ));
            }
            if i > 0 && (l.z_top_mm - lagen[i - 1].z_bot_mm).abs() > 1e-6 {
                return Err(format!(
                    "laag {} begint op z = {} mm terwijl laag {} op z = {} mm eindigt — de lagen moeten aansluiten",
                    i + 1,
                    l.z_top_mm,
                    i,
                    lagen[i - 1].z_bot_mm
                ));
            }
            a += l.breedte_mm * t;
            az += l.breedte_mm * t * l.z_mid();
            breedte_max = breedte_max.max(l.breedte_mm);
        }
        let z_c = az / a;
        let mut iy = 0.0;
        for l in &lagen {
            let t = l.dikte_mm();
            let arm = l.z_mid() - z_c;
            iy += l.breedte_mm * t * t * t / 12.0 + l.breedte_mm * t * arm * arm;
        }
        let hoogte = lagen[lagen.len() - 1].z_bot_mm - lagen[0].z_top_mm;
        Ok(Self {
            lagen,
            hoogte_mm: hoogte,
            z_c_mm: z_c,
            a_model_mm2: a,
            iy_model_mm4: iy,
            breedte_max_mm: breedte_max,
        })
    }

    /// Statisch moment van het deel bóven `z` om de zwaartelijn (mm³,
    /// absolute waarde). Nul aan boven- en onderkant, maximaal op z_c.
    pub fn s_boven_mm3(&self, z: f64) -> f64 {
        let mut q = 0.0;
        for l in &self.lagen {
            if z <= l.z_top_mm {
                break;
            }
            let za = l.z_top_mm;
            let zb = z.min(l.z_bot_mm);
            // ∫ b·(ζ − z_c) dζ van za tot zb.
            q += l.breedte_mm * ((zb * zb - za * za) / 2.0 - self.z_c_mm * (zb - za));
        }
        q.abs()
    }

    /// De vezelposities waarop gerekend en getekend wordt: per laag `n`
    /// punten van boven- tot onderkant (grenzen dus dubbel, één keer per
    /// aangrenzende laag), plus de zwaartelijn in de laag waarin die valt.
    ///
    /// `richtaantal` is het totale aantal punten over de hoogte; elke laag
    /// krijgt er minstens drie, zodat de parabool in een lijf niet tot een
    /// rechte lijn vervlakt.
    pub fn vezels(&self, richtaantal: usize) -> Vec<Vezelpositie> {
        let mut uit = Vec::new();
        for (idx, l) in self.lagen.iter().enumerate() {
            let deel = l.dikte_mm() / self.hoogte_mm;
            let n = ((richtaantal as f64 * deel).round() as usize).clamp(3, 61);
            let mut punten: Vec<f64> = (0..n)
                .map(|k| l.z_top_mm + (l.z_bot_mm - l.z_top_mm) * (k as f64) / ((n - 1) as f64))
                .collect();
            // De zwaartelijn erbij wanneer die binnen deze laag valt: daar is
            // S(z) maximaal en dus τ.
            if self.z_c_mm > l.z_top_mm && self.z_c_mm < l.z_bot_mm {
                punten.push(self.z_c_mm);
                punten.sort_by(|a, b| a.partial_cmp(b).unwrap());
                punten.dedup_by(|a, b| (*a - *b).abs() < 1e-9);
            }
            for z in punten {
                uit.push(Vezelpositie {
                    z_mm: z,
                    laag: idx,
                    breedte_mm: l.breedte_mm,
                });
            }
        }
        uit
    }
}

/// Eén rekenpunt over de hoogte, met de laag waar het bij hoort. Op een
/// laaggrens komt dezelfde `z_mm` twee keer voor, met verschillende breedte.
#[derive(Clone, Copy, Debug)]
pub struct Vezelpositie {
    pub z_mm: f64,
    pub laag: usize,
    pub breedte_mm: f64,
}

/// Wat er over de gekozen doorsnede bekend is: het lagenmodel plus de
/// grootheden waarmee gerekend wordt (voor een catalogusprofiel uit de
/// database, anders uit het model zelf).
#[derive(Clone, Debug)]
pub struct Doorsnedegegevens {
    pub naam: String,
    pub model: Vezelmodel,
    /// Oppervlakte waarmee gerekend wordt (mm²).
    pub a_mm2: f64,
    /// Traagheidsmoment waarmee gerekend wordt (mm⁴).
    pub iy_mm4: f64,
    /// Herkomst van A en I_y: "profieldatabase" of "lagenmodel".
    pub bron: String,
    /// Meldingen die met de doorsnede meekomen (benaderingen, afwijkingen).
    pub notities: Vec<String>,
}

/// Rechthoek → lagenmodel (één laag).
fn lagen_rechthoek(b: f64, h: f64) -> Result<Vec<SpanningLaag>, String> {
    if !(b > 0.0) || !(h > 0.0) {
        return Err(format!(
            "een rechthoek van {b} × {h} mm is geen doorsnede — b en h moeten positief zijn"
        ));
    }
    Ok(vec![SpanningLaag {
        z_top_mm: 0.0,
        z_bot_mm: h,
        breedte_mm: b,
    }])
}

/// Catalogusprofiel → lagenmodel. I- en U-profielen krijgen flens/lijf/flens,
/// kokers wand/twee-lijven/wand, buizen een strokenbenadering.
fn lagen_profiel(p: &SteelProfile) -> Result<Vec<SpanningLaag>, String> {
    let h = p.properties.h_mm;
    let b = p.properties.b_mm;
    let tw = p.properties.tw_mm;
    let tf = p.properties.tf_mm;
    if !(h > 0.0) || !(b > 0.0) {
        return Err(format!("profiel \"{}\" heeft geen bruikbare hoofdmaten", p.name));
    }
    match p.kind {
        // Flens — lijf — flens. Voor een U-profiel is dat om de sterke as
        // dezelfde opbouw als voor een I-profiel: één lijf van dikte t_w.
        ProfileKind::ISection | ProfileKind::Channel => {
            if !(tf > 0.0) || !(tw > 0.0) || h <= 2.0 * tf {
                return Err(format!(
                    "profiel \"{}\": flens/lijf-dikten ({tf} / {tw} mm) passen niet in een hoogte van {h} mm",
                    p.name
                ));
            }
            Ok(vec![
                SpanningLaag { z_top_mm: 0.0, z_bot_mm: tf, breedte_mm: b },
                SpanningLaag { z_top_mm: tf, z_bot_mm: h - tf, breedte_mm: tw },
                SpanningLaag { z_top_mm: h - tf, z_bot_mm: h, breedte_mm: b },
            ])
        }
        // Koker: boven- en onderwand over de volle breedte, daartussen twee
        // zijwanden — samen 2·t meewerkende breedte.
        ProfileKind::Rhs | ProfileKind::Shs => {
            let t = if tw > 0.0 { tw } else { tf };
            if !(t > 0.0) || h <= 2.0 * t {
                return Err(format!(
                    "profiel \"{}\": wanddikte {t} mm past niet in een hoogte van {h} mm",
                    p.name
                ));
            }
            Ok(vec![
                SpanningLaag { z_top_mm: 0.0, z_bot_mm: t, breedte_mm: b },
                SpanningLaag { z_top_mm: t, z_bot_mm: h - t, breedte_mm: 2.0 * t },
                SpanningLaag { z_top_mm: h - t, z_bot_mm: h, breedte_mm: b },
            ])
        }
        // Buis: de wandbreedte verloopt continu over de hoogte. Stroken met
        // de exacte breedte op het strookmidden.
        ProfileKind::Chs => {
            let t = if tw > 0.0 { tw } else { tf };
            let r_uit = h / 2.0;
            let r_in = r_uit - t;
            if !(t > 0.0) || r_in <= 0.0 {
                return Err(format!(
                    "profiel \"{}\": wanddikte {t} mm past niet in een diameter van {h} mm",
                    p.name
                ));
            }
            let dz = h / CHS_STROKEN as f64;
            let mut lagen = Vec::with_capacity(CHS_STROKEN);
            for k in 0..CHS_STROKEN {
                let z_top = k as f64 * dz;
                let z_bot = z_top + dz;
                let y = (z_top + z_bot) / 2.0 - r_uit; // afstand tot het hart
                let buiten = (r_uit * r_uit - y * y).max(0.0).sqrt();
                let binnen = (r_in * r_in - y * y).max(0.0).sqrt();
                let breedte = 2.0 * (buiten - binnen);
                if breedte <= 1e-9 {
                    continue;
                }
                lagen.push(SpanningLaag { z_top_mm: z_top, z_bot_mm: z_bot, breedte_mm: breedte });
            }
            if lagen.is_empty() {
                return Err(format!("profiel \"{}\" leverde geen bruikbare stroken op", p.name));
            }
            // De eerste en laatste strook kunnen wegvallen; de resterende
            // stroken moeten wel aansluiten, dus de randen bijtrekken.
            let eerste = lagen[0].z_top_mm;
            let laatste = lagen[lagen.len() - 1].z_bot_mm;
            if eerste > 0.0 || laatste < h {
                // Niets te herstellen: het model gaat over de resterende hoogte.
            }
            Ok(lagen)
        }
    }
}

/// Doorsnede-invoer → uitgewerkt model plus de grootheden waarmee gerekend
/// wordt. Bij een catalogusprofiel winnen de databasewaarden voor `A` en
/// `I_y`; zij bevatten de walsuitrondingen die het lagenmodel niet kent.
pub fn maak_doorsnede(d: &SpanningDoorsnede) -> Result<Doorsnedegegevens, String> {
    match d {
        SpanningDoorsnede::Rechthoek(r) => {
            let model = Vezelmodel::nieuw(lagen_rechthoek(r.b_mm, r.h_mm)?)?;
            Ok(Doorsnedegegevens {
                naam: format!("{} × {} mm", maat(r.b_mm), maat(r.h_mm)),
                a_mm2: model.a_model_mm2,
                iy_mm4: model.iy_model_mm4,
                model,
                bron: "lagenmodel".to_string(),
                notities: vec![],
            })
        }
        SpanningDoorsnede::Lagen(l) => {
            let model = Vezelmodel::nieuw(l.lagen.clone())?;
            Ok(Doorsnedegegevens {
                naam: format!(
                    "vrije doorsnede ({} lagen, h = {} mm)",
                    model.lagen.len(),
                    maat(model.hoogte_mm)
                ),
                a_mm2: model.a_model_mm2,
                iy_mm4: model.iy_model_mm4,
                model,
                bron: "lagenmodel".to_string(),
                notities: vec![],
            })
        }
        SpanningDoorsnede::Catalogus(c) => {
            let p = steel_profiles::db().find(&c.naam).ok_or_else(|| {
                format!("profiel \"{}\" staat niet in de profieldatabase", c.naam)
            })?;
            let model = Vezelmodel::nieuw(lagen_profiel(p)?)?;
            let a = p.properties.area_mm2;
            let iy = p.properties.iy_mm4;
            let mut notities = vec![];
            if a > 0.0 && iy > 0.0 {
                let da = (model.a_model_mm2 - a) / a * 100.0;
                let di = (model.iy_model_mm4 - iy) / iy * 100.0;
                if da.abs() > 1.0 || di.abs() > 1.0 {
                    notities.push(format!(
                        "A en I_y komen uit de profieldatabase (inclusief walsuitrondingen). \
                         S(z) en b(z) volgen uit het rechte plaatmodel zonder uitrondingen; \
                         dat model geeft A = {} mm² ({:+.1} %) en I_y = {} mm⁴ ({:+.1} %).",
                        maat(model.a_model_mm2),
                        da,
                        maat(model.iy_model_mm4),
                        di
                    ));
                }
            }
            if p.kind == ProfileKind::Chs {
                notities.push(format!(
                    "De ronde wand is met {CHS_STROKEN} stroken benaderd; de breedte per strook \
                     is de exacte wandbreedte op het strookmidden."
                ));
            }
            let (a, iy, bron) = if a > 0.0 && iy > 0.0 {
                (a, iy, "profieldatabase")
            } else {
                (model.a_model_mm2, model.iy_model_mm4, "lagenmodel")
            };
            Ok(Doorsnedegegevens {
                naam: p.name.clone(),
                model,
                a_mm2: a,
                iy_mm4: iy,
                bron: bron.to_string(),
                notities,
            })
        }
    }
}

/// Maat als tekst: geheel waar dat kan, anders één decimaal.
fn maat(v: f64) -> String {
    let r = (v * 10.0).round() / 10.0;
    if (r - r.round()).abs() < 1e-9 {
        format!("{}", r.round() as i64)
    } else {
        format!("{r:.1}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn rechthoek_grootheden() {
        // b = 100, h = 300: A = 30 000 mm², I = 100·300³/12 = 2,25·10⁸ mm⁴,
        // z_c = 150 mm, S(z_c) = 100·150·75 = 1,125·10⁶ mm³.
        let d = maak_doorsnede(&SpanningDoorsnede::Rechthoek(Rechthoek { b_mm: 100.0, h_mm: 300.0 }))
            .expect("geldige rechthoek");
        assert_relative_eq!(d.a_mm2, 30_000.0);
        assert_relative_eq!(d.iy_mm4, 2.25e8);
        assert_relative_eq!(d.model.z_c_mm, 150.0);
        assert_relative_eq!(d.model.s_boven_mm3(150.0), 1.125e6, max_relative = 1e-12);
        assert_relative_eq!(d.model.s_boven_mm3(0.0), 0.0);
        assert_relative_eq!(d.model.s_boven_mm3(300.0), 0.0, epsilon = 1e-6);
    }

    #[test]
    fn ipe300_lagenmodel() {
        // IPE 300: h = 300, b = 150, t_w = 7,1, t_f = 10,7.
        // S op de zwaartelijn = 150·10,7·(150 − 5,35) + 7,1·(150 − 10,7)²/2
        //                     = 232 163 + 68 963 = 301 126 mm³.
        let d = maak_doorsnede(&SpanningDoorsnede::Catalogus(Catalogus {
            naam: "IPE300".to_string(),
        }))
        .expect("IPE 300 staat in de database");
        assert_eq!(d.model.lagen.len(), 3);
        assert_relative_eq!(d.model.z_c_mm, 150.0, max_relative = 1e-9);
        let s = d.model.s_boven_mm3(150.0);
        let hand = 150.0 * 10.7 * (150.0 - 10.7 / 2.0) + 7.1 * (150.0f64 - 10.7).powi(2) / 2.0;
        assert_relative_eq!(s, hand, max_relative = 1e-9);
        // A en I komen uit de database (inclusief uitrondingen).
        assert_relative_eq!(d.a_mm2, 5380.0, max_relative = 5e-3);
        assert_eq!(d.bron, "profieldatabase");
    }

    #[test]
    fn buis_stroken_benaderen_de_database() {
        let d = maak_doorsnede(&SpanningDoorsnede::Catalogus(Catalogus {
            naam: "CHS 168.3x8.0".to_string(),
        }))
        .expect("CHS staat in de database");
        // Het strokenmodel moet A en I_y van de database dicht benaderen.
        assert_relative_eq!(d.model.a_model_mm2, d.a_mm2, max_relative = 3e-2);
        assert_relative_eq!(d.model.iy_model_mm4, d.iy_mm4, max_relative = 3e-2);
    }

    #[test]
    fn lagen_moeten_aansluiten() {
        let fout = Vezelmodel::nieuw(vec![
            SpanningLaag { z_top_mm: 0.0, z_bot_mm: 10.0, breedte_mm: 100.0 },
            SpanningLaag { z_top_mm: 20.0, z_bot_mm: 30.0, breedte_mm: 100.0 },
        ])
        .unwrap_err();
        assert!(fout.contains("aansluiten"), "melding was: {fout}");
    }

    #[test]
    fn vezels_dubbelen_de_laaggrens() {
        let d = maak_doorsnede(&SpanningDoorsnede::Catalogus(Catalogus {
            naam: "HEA 200".to_string(),
        }))
        .expect("HEA 200");
        let v = d.model.vezels(21);
        let grens = d.model.lagen[0].z_bot_mm;
        let op_grens: Vec<_> = v.iter().filter(|p| (p.z_mm - grens).abs() < 1e-9).collect();
        assert_eq!(op_grens.len(), 2, "de flens/lijf-grens hoort twee breedtes te hebben");
        assert!(op_grens[0].breedte_mm > op_grens[1].breedte_mm);
    }
}
