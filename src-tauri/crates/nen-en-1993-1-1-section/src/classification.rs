//! NEN-EN 1993-1-1 §5.5 + Tabel 5.2 — doorsnedeclassificatie.
//!
//! Tabel 5.2 kent drie bladen, en welk blad geldt hangt af van het
//! doorsnedetype:
//!
//! * **Blad 1 — inwendige drukdelen** (een plaatdeel dat aan béíde randen
//!   door een aansluitend plaatdeel gesteund wordt): het lijf van een
//!   I-profiel of U-profiel, en *alle vier* de wanden van een koker.
//! * **Blad 2 — uitkragende flenzen** (aan één rand gesteund, andere rand
//!   vrij): de flenzen van een I-profiel en van een U-profiel.
//! * **Blad 3 — ronde buizen**: grenzen op d/t in plaats van c/t.
//!
//! Tot sept 2026 werden de I-profielregels (blad 1 voor het lijf + blad 2 voor
//! de flens) op élk profiel losgelaten, dus ook op kokers en ronde buizen. Een
//! kokerwand werd daardoor als uitkraging getoetst (grens 9ε/10ε/14ε in plaats
//! van 33ε/38ε/42ε) en een ronde buis als een fictief I-profiel. Gevolg: SHS
//! vanaf 120 mm en CHS vanaf 168,3 mm kwamen in klasse 3 uit in plaats van
//! klasse 1, waardoor met W_el in plaats van W_pl gerekend werd. Dat is
//! veilig-zijdig maar fout, en het laat de app onnodig zware profielen kiezen.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use section_properties::SectionProperties;
use mechanics::InternalForces;
use crate::SteelGrade;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum CrossSectionClass { Class1, Class2, Class3, Class4 }

/// Doorsnedevorm, voor zover tabel 5.2 er onderscheid tussen maakt.
///
/// Dit is bewust géén kopie van de catalogus-enum `ProfileKind`: de norm kent
/// alleen het onderscheid dat bepaalt welk blad van tabel 5.2 geldt. SHS en
/// RHS vallen daarom samen in [`SectionShape::BoxSection`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SectionShape {
    /// Dubbelsymmetrisch I-/H-profiel: lijf inwendig, flenzen uitkragend.
    ISection,
    /// U-profiel: lijf inwendig, flenzen uitkragend over de volle breedte.
    Channel,
    /// Rechthoekige of vierkante koker: alle wanden inwendig.
    BoxSection,
    /// Ronde buis: blad 3, grenzen op d/t.
    CircularHollow,
}

pub fn epsilon(grade: &SteelGrade) -> f64 {
    (235.0 / grade.fy_mpa).sqrt()
}

/// Klasse uit een slankheid en de drie grenswaarden.
fn klasse_uit(slankheid: f64, g1: f64, g2: f64, g3: f64) -> CrossSectionClass {
    match slankheid {
        s if s <= g1 => CrossSectionClass::Class1,
        s if s <= g2 => CrossSectionClass::Class2,
        s if s <= g3 => CrossSectionClass::Class3,
        _ => CrossSectionClass::Class4,
    }
}

/// Blad 1, inwendig deel met lineair spanningsverloop (zuivere buiging):
/// 72ε / 83ε / 124ε. Bij noemenswaardige normaalkracht wordt het deel als
/// volledig gedrukt behandeld: 33ε / 38ε / 42ε.
fn grenzen_inwendig(eps: f64, zuivere_buiging: bool) -> (f64, f64, f64) {
    if zuivere_buiging {
        (72.0 * eps, 83.0 * eps, 124.0 * eps)
    } else {
        (33.0 * eps, 38.0 * eps, 42.0 * eps)
    }
}

/// Blad 1, inwendig deel onder gelijkmatige druk: 33ε / 38ε / 42ε.
fn grenzen_inwendig_druk(eps: f64) -> (f64, f64, f64) {
    (33.0 * eps, 38.0 * eps, 42.0 * eps)
}

/// Blad 2, uitkragende flens onder gelijkmatige druk: 9ε / 10ε / 14ε.
fn grenzen_uitkraging(eps: f64) -> (f64, f64, f64) {
    (9.0 * eps, 10.0 * eps, 14.0 * eps)
}

pub fn classify_section(
    p: &SectionProperties,
    grade: &SteelGrade,
    forces: &InternalForces,
    shape: SectionShape,
) -> CrossSectionClass {
    let eps = epsilon(grade);

    // Grove schakelaar tussen "zuivere buiging" en "gedrukt". Bij meer dan 5%
    // van de plastische normaalkrachtcapaciteit wordt het lijf als volledig
    // gedrukt getoetst; dat is veilig-zijdig ten opzichte van de exacte
    // α/ψ-formules van tabel 5.2.
    let n_ratio = forces.n_ed.abs() * 1000.0 / (p.area_mm2 * grade.fy_mpa);
    let zuivere_buiging = n_ratio < 0.05;

    match shape {
        SectionShape::CircularHollow => {
            // Blad 3: klasse 1 bij d/t ≤ 50ε², klasse 2 ≤ 70ε², klasse 3 ≤ 90ε².
            // h_mm is bij een ronde buis de uitwendige diameter d.
            let d_over_t = p.h_mm / p.tw_mm.max(1e-9);
            klasse_uit(d_over_t, 50.0 * eps * eps, 70.0 * eps * eps, 90.0 * eps * eps)
        }

        SectionShape::BoxSection => {
            // Alle vier de wanden zijn inwendige delen (blad 1).
            //
            // Voor c wordt de codificeerde standaardwaarde c = breedte − 3t
            // aangehouden. Tabel 5.2 laat formeel c = b − 2t − 2r_i toe, maar
            // de r-kolom in de catalogus is niet eenduidig een binnenradius
            // (bij warmvervaardigde kokers staat er ook 1,5t, wat op een
            // buitenradius wijst). b − 3t is bij elke r in de dataset de
            // grootste — en dus veilig-zijdige — van de twee waarden.
            let t = p.tw_mm.max(1e-9);
            let c_lijf = p.h_mm - 3.0 * t;
            let c_flens = p.b_mm - 3.0 * t;

            let (w1, w2, w3) = grenzen_inwendig(eps, zuivere_buiging);
            let lijf = klasse_uit(c_lijf / t, w1, w2, w3);

            // De flens (wand loodrecht op het buigende vlak) is over de volle
            // breedte gedrukt, ook bij zuivere buiging.
            let (f1, f2, f3) = grenzen_inwendig_druk(eps);
            let flens = klasse_uit(c_flens / t, f1, f2, f3);

            lijf.max(flens)
        }

        SectionShape::ISection | SectionShape::Channel => {
            // Lijf: inwendig deel tussen de flenzen, uitrondingen eraf.
            let c_lijf = p.h_mm - 2.0 * p.tf_mm - 2.0 * p.r_mm;
            let (w1, w2, w3) = grenzen_inwendig(eps, zuivere_buiging);
            let lijf = klasse_uit(c_lijf / p.tw_mm.max(1e-9), w1, w2, w3);

            // Flens: uitkraging. Bij een I-profiel kraagt de flens aan beide
            // zijden van het lijf uit, dus c = (b − t_w)/2 − r. Bij een
            // U-profiel zit het lijf aan de rand en kraagt de flens over de
            // volle breedte uit: c = b − t_w − r.
            let c_flens = match shape {
                SectionShape::Channel => p.b_mm - p.tw_mm - p.r_mm,
                _ => (p.b_mm - p.tw_mm) / 2.0 - p.r_mm,
            };
            let (f1, f2, f3) = grenzen_uitkraging(eps);
            let flens = klasse_uit(c_flens / p.tf_mm.max(1e-9), f1, f2, f3);

            lijf.max(flens)
        }
    }
}

impl PartialOrd for CrossSectionClass {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for CrossSectionClass {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (*self as u8).cmp(&(*other as u8))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use section_properties::i_section::i_section_props;
    use crate::{S235, S355};

    /// Doorsnede-eigenschappen waarbij alleen de maten voor de classificatie
    /// ertoe doen. area_mm2 wordt gebruikt voor de n_ratio-schakelaar.
    fn maten(h: f64, b: f64, tw: f64, tf: f64, r: f64, a: f64) -> SectionProperties {
        SectionProperties {
            h_mm: h, b_mm: b, tw_mm: tw, tf_mm: tf, r_mm: r, area_mm2: a,
            ..Default::default()
        }
    }

    fn buiging() -> InternalForces {
        InternalForces { my_ed: 80.0, ..Default::default() }
    }

    fn druk(n_kn: f64) -> InternalForces {
        InternalForces { n_ed: -n_kn, ..Default::default() }
    }

    // ── I-profiel: ongewijzigd gedrag ────────────────────────────────────────

    #[test]
    fn heb160_s235_zuivere_buiging_is_klasse1() {
        let p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::ISection),
            CrossSectionClass::Class1
        );
    }

    // ── Blad 3: ronde buizen, handberekende grensgevallen ────────────────────

    /// S235 → ε = 1, dus de grenzen zijn d/t = 50 / 70 / 90.
    /// d = 500, t = 10 → d/t = 50,0 — precies op de klasse-1-grens.
    #[test]
    fn chs_op_grens_klasse1_s235() {
        let p = maten(500.0, 500.0, 10.0, 10.0, 0.0, 15_400.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class1
        );
    }

    /// d = 510, t = 10 → d/t = 51,0 > 50 → klasse 2 (want ≤ 70).
    #[test]
    fn chs_net_over_klasse1_wordt_klasse2() {
        let p = maten(510.0, 510.0, 10.0, 10.0, 0.0, 15_700.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class2
        );
    }

    /// d/t = 71 → klasse 3; d/t = 91 → klasse 4.
    #[test]
    fn chs_klasse3_en_klasse4_grenzen_s235() {
        let p3 = maten(710.0, 710.0, 10.0, 10.0, 0.0, 22_000.0);
        assert_eq!(
            classify_section(&p3, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class3
        );
        let p4 = maten(910.0, 910.0, 10.0, 10.0, 0.0, 28_300.0);
        assert_eq!(
            classify_section(&p4, &S235, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class4
        );
    }

    /// S355 → ε² = 235/355 = 0,66197. Klasse-1-grens 50ε² = 33,098.
    /// d = 330, t = 10 → d/t = 33,0 ≤ 33,098 → nog klasse 1.
    /// d = 340, t = 10 → d/t = 34,0 > 33,098 → klasse 2 (grens 70ε² = 46,34).
    #[test]
    fn chs_grenzen_schalen_met_epsilon_kwadraat_s355() {
        let net_wel = maten(330.0, 330.0, 10.0, 10.0, 0.0, 10_100.0);
        assert_eq!(
            classify_section(&net_wel, &S355, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class1
        );
        let net_niet = maten(340.0, 340.0, 10.0, 10.0, 0.0, 10_400.0);
        assert_eq!(
            classify_section(&net_niet, &S355, &buiging(), SectionShape::CircularHollow),
            CrossSectionClass::Class2
        );
    }

    // ── Blad 1: kokers ───────────────────────────────────────────────────────

    /// SHS 120×120×5, S235. c = 120 − 3·5 = 105; c/t = 21,0.
    /// Lijf: 21,0 ≤ 72 → klasse 1. Flens: 21,0 ≤ 33 → klasse 1.
    /// (Met de oude I-profielregel werd de flens 52,5/5 = 10,5 > 10ε → klasse 3.)
    #[test]
    fn shs120x120x5_zuivere_buiging_is_klasse1() {
        let p = maten(120.0, 120.0, 5.0, 5.0, 5.0, 2_260.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::BoxSection),
            CrossSectionClass::Class1
        );
    }

    /// Kokerflens op de grens van klasse 1 onder druk: c/t = 33 bij S235.
    /// t = 5, c = b − 15 = 165 → b = 180 → c/t = 33,0.
    /// Het lijf is hier even slank en valt onder dezelfde drukgrens.
    #[test]
    fn koker_flens_op_grens_klasse1_druk() {
        // area zo klein dat n_ratio ≥ 0,05 → volledig gedrukt regime.
        let p = maten(180.0, 180.0, 5.0, 5.0, 5.0, 3_500.0);
        assert_eq!(
            classify_section(&p, &S235, &druk(500.0), SectionShape::BoxSection),
            CrossSectionClass::Class1
        );
    }

    /// Eén stap slanker dan het vorige geval: b = 185 → c/t = 34,0 > 33 → klasse 2.
    #[test]
    fn koker_net_over_grens_klasse1_druk_wordt_klasse2() {
        let p = maten(185.0, 185.0, 5.0, 5.0, 5.0, 3_600.0);
        assert_eq!(
            classify_section(&p, &S235, &druk(500.0), SectionShape::BoxSection),
            CrossSectionClass::Class2
        );
    }

    /// Slanke koker in zuivere buiging: h = 1000, b = 100, t = 5.
    /// Lijf c/t = (1000 − 15)/5 = 197 > 124 → klasse 4.
    #[test]
    fn slanke_kokerlijf_wordt_klasse4() {
        let p = maten(1000.0, 100.0, 5.0, 5.0, 5.0, 10_000.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::BoxSection),
            CrossSectionClass::Class4
        );
    }

    /// De flens van een koker telt óók bij zuivere buiging als volledig
    /// gedrukt deel (grens 33ε), niet als buigend deel (72ε).
    /// h = 100, b = 300, t = 5: lijf c/t = 17 (klasse 1),
    /// flens c/t = (300 − 15)/5 = 57 > 42 → klasse 4.
    #[test]
    fn kokerflens_wordt_op_drukgrens_getoetst_niet_op_buiggrens() {
        let p = maten(100.0, 300.0, 5.0, 5.0, 5.0, 8_000.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::BoxSection),
            CrossSectionClass::Class4
        );
    }

    // ── Blad 2: U-profiel, flens kraagt over de volle breedte uit ────────────

    /// Bij een U-profiel is c = b − t_w − r, niet (b − t_w)/2 − r.
    /// b = 100, t_w = 10, r = 16, t_f = 16 → c = 74; c/t_f = 4,63 → klasse 1.
    /// Met de oude (I-profiel-)formule was c = 29 en c/t_f = 1,81: een factor
    /// 2,6 te gunstig. Voor de catalogus-UNP's verandert de uitkomst niet,
    /// maar bij een dunnere flens wél.
    #[test]
    fn u_profiel_flens_gebruikt_volle_uitkraging() {
        // t_f zo gekozen dat de twee formules aan weerszijden van 9ε liggen:
        // c = 74; bij t_f = 7 is c/t_f = 10,57 → klasse 3.
        // De oude formule gaf 29/7 = 4,14 → klasse 1.
        let p = maten(300.0, 100.0, 10.0, 7.0, 16.0, 5_000.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::Channel),
            CrossSectionClass::Class3
        );
    }

    /// Catalogus-UNP 300 blijft klasse 1 in zuivere buiging:
    /// lijf c/t_w = (300 − 32 − 32)/10 = 23,6 ≤ 72;
    /// flens c/t_f = (100 − 10 − 16)/16 = 4,63 ≤ 9.
    #[test]
    fn unp300_blijft_klasse1() {
        let p = maten(300.0, 100.0, 10.0, 16.0, 16.0, 5_880.0);
        assert_eq!(
            classify_section(&p, &S235, &buiging(), SectionShape::Channel),
            CrossSectionClass::Class1
        );
    }

    // ── Regressie op de echte catalogus ──────────────────────────────────────

    /// De profielen die vóór de correctie ten onrechte klasse 3 werden.
    #[test]
    fn catalogus_kokers_en_buizen_zijn_klasse1_in_buiging() {
        for naam in ["SHS 120x120x5", "SHS 150x150x6", "SHS 200x200x8",
                     "SHS 250x250x10", "SHS 300x300x10",
                     "CHS 168.3x8.0", "CHS 219.1x10", "CHS 273x10",
                     "CHS 323.9x12.5", "CHS 406.4x16"] {
            let prof = steel_profiles::db().find(naam).expect(naam);
            let shape = match prof.kind {
                steel_profiles::ProfileKind::Chs => SectionShape::CircularHollow,
                steel_profiles::ProfileKind::Shs | steel_profiles::ProfileKind::Rhs => SectionShape::BoxSection,
                steel_profiles::ProfileKind::Channel => SectionShape::Channel,
                steel_profiles::ProfileKind::ISection => SectionShape::ISection,
            };
            assert_eq!(
                classify_section(&prof.properties, &S235, &buiging(), shape),
                CrossSectionClass::Class1,
                "{naam} hoort klasse 1 te zijn"
            );
        }
    }
}
