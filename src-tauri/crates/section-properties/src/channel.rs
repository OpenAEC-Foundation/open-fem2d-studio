//! U-profielen (UNP/UPE).
//!
//! Monosymmetrisch: de y-as (het hart van de hoogte) is de symmetrieas, de
//! z-richting is asymmetrisch. Alle coördinaten in dit bestand lopen vanaf de
//! **rug van het lijf** (`y = 0`) naar de flenspunten (`y = b`), en vanaf de
//! onderkant (`z = 0`) naar boven (`z = h`) — hetzelfde beschrijvingsstelsel
//! als `SectionProperties::y_c_mm`/`z_c_mm`.
//!
//! Er zijn twee geometriemodellen:
//!
//! * [`channel_section_props`] — **parallelle flenzen** (UPE, DIN 1026-2): de
//!   klassieke drieplaats-idealisatie, ongewijzigd sinds de eerste versie.
//! * [`channel_section_props_unp`] / [`channel_section_props_taps`] — flenzen
//!   met een **hellend binnenvlak** (UNP, DIN 1026-1, helling 8%). Zonder die
//!   helling zit het zwaartepunt van een UNP er ~7% naast (voor UNP 200: 21,6 mm
//!   tegen 20,19 mm uit de catalogus), en dat is precies het getal dat een
//!   samengestelde doorsnede uit U-profielen nodig heeft.

use crate::SectionProperties;

/// Flenshelling van de DIN 1026-1 U-profielen (UNP): 8%.
pub const UNP_FLENSHELLING: f64 = 0.08;

/// Verhouding uit de zwaartepuntsligging van een afrondingsdriehoek
/// (vierkant minus kwartcirkel): `e = r·(10 − 3π)/(12 − 3π) ≈ 0,2234·r`,
/// gemeten vanaf het scherpe hoekpunt.
fn afronding_zwaartepunt(r: f64) -> f64 {
    r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI)
}

/// Oppervlak van één afronding: `r²(1 − π/4) ≈ 0,2146·r²`.
fn afronding_oppervlak(r: f64) -> f64 {
    r * r - std::f64::consts::PI * r * r / 4.0
}

/// U-profiel met **parallelle** flenzen (UPE). Het rekenwerk is ongewijzigd;
/// alleen de nieuwe schemavelden worden nu ook gevuld.
pub fn channel_section_props(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> SectionProperties {
    let hw = h - 2.0 * tf;
    let area = 2.0 * b * tf + hw * tw + 2.0 * afronding_oppervlak(r);

    let s_flanges = 2.0 * (b * tf) * (b / 2.0);
    let s_web = (hw * tw) * (tw / 2.0);
    let z_centroid = (s_flanges + s_web) / area;

    let iy_flanges = 2.0 * (b * tf.powi(3) / 12.0 + b * tf * ((h - tf) / 2.0).powi(2));
    let iy_web = tw * hw.powi(3) / 12.0;
    let iy = iy_flanges + iy_web;

    let iz_flanges = 2.0 * (tf * b.powi(3) / 12.0 + b * tf * (b / 2.0 - z_centroid).powi(2));
    let iz_web = hw * tw.powi(3) / 12.0 + hw * tw * (z_centroid - tw / 2.0).powi(2);
    let iz = iz_flanges + iz_web;

    let wel_y = iy / (h / 2.0);
    let wel_z = iz / z_centroid.max(b - z_centroid);

    let wpl_y = b * tf * (h - tf) + tw * (h / 2.0 - tf).powi(2);
    let wpl_z = 2.0 * tf * b.powi(2) / 4.0 + hw * tw.powi(2) / 4.0;

    let av_z = hw * tw + 2.0 * afronding_oppervlak(r);
    let av_y = 2.0 * b * tf;

    let it = (1.0 / 3.0) * (2.0 * b * tf.powi(3) + hw * tw.powi(3));

    let iw = (b.powi(3) * tf * (h - tf).powi(2) / 12.0) * (3.0 * b * tf + 2.0 * hw * tw)
        / (6.0 * b * tf + hw * tw);

    schrijf(ChannelRuw {
        h,
        b,
        tw,
        tf,
        r,
        area,
        y_c: z_centroid,
        iy,
        iz,
        wel_y,
        wel_z,
        wpl_y,
        wpl_z,
        av_y,
        av_z,
        it,
        iw,
        tf_effectief: tf,
    })
}

/// U-profiel met de 8%-flenshelling van DIN 1026-1 (UNP).
pub fn channel_section_props_unp(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> SectionProperties {
    channel_section_props_taps(h, b, tw, tf, r, UNP_FLENSHELLING)
}

/// U-profiel met een hellend flensbinnenvlak.
///
/// `helling` is de flenshelling (0,08 voor UNP; 0 geeft de parallelle vorm).
/// De catalogusmaat `tf` geldt volgens DIN 1026-1 halverwege de flens, dus op
/// `y = b/2` vanaf de rug van het lijf. Daaruit volgt:
///
/// * dikte bij het lijf `t₀ = tf + helling·(b/2 − tw)`
/// * dikte aan de punt  `t₁ = tf − helling·b/2`
/// * lijfhoogte tussen de flenzen `hw = h − 2·t₀`
///
/// Voor UNP 200 (h = 200, b = 75, tw = 8,5, tf = 11,5, r = 11,5) geeft dat
/// `t₀ = 13,82`, `t₁ = 8,5`, `hw = 172,36`, `A = 3241 mm²` (catalogus 3220) en
/// `y_c = 20,33 mm` (catalogus 20,19).
pub fn channel_section_props_taps(
    h: f64,
    b: f64,
    tw: f64,
    tf: f64,
    r: f64,
    helling: f64,
) -> SectionProperties {
    let s = helling;
    let hh = h / 2.0;
    let t0 = tf + s * (b / 2.0 - tw); // flensdikte bij het lijf
    let t1 = tf - s * (b / 2.0); // flensdikte aan de punt
    let l = b - tw; // lengte van het hellende deel
    let hw = h - 2.0 * t0;

    // ── Momenten van het hellende flensdeel, u = y − tw ∈ [0, L] ────────────
    // t(u) = t₀ − s·u
    let m0 = t0 * l - s * l * l / 2.0; // ∫t du       (oppervlak)
    let m1 = t0 * l * l / 2.0 - s * l.powi(3) / 3.0; // ∫u·t du
    let m2 = t0 * l.powi(3) / 3.0 - s * l.powi(4) / 4.0; // ∫u²·t du
    // ∫t² du en ∫t³ du: gesloten vorm via substitutie w = t₀ − s·u.
    let (it2, it3) = if s.abs() > 1e-12 {
        (
            (t0.powi(3) - t1.powi(3)) / (3.0 * s),
            (t0.powi(4) - t1.powi(4)) / (4.0 * s),
        )
    } else {
        (t0 * t0 * l, t0.powi(3) * l)
    };

    // ── Flensblok boven het lijf, y ∈ [0, tw], dikte t₀ ──────────────────────
    let a_blok = tw * t0;
    let sy_blok = a_blok * tw / 2.0;
    let iyy_blok = t0 * tw.powi(3) / 3.0; // ∫y² dA om y = 0

    // ── Optellingen ─────────────────────────────────────────────────────────
    let a_flens = a_blok + m0; // één flens
    let sy_flens = sy_blok + (m1 + tw * m0);
    let iyy_flens = iyy_blok + (m2 + 2.0 * tw * m1 + tw * tw * m0);

    let a_web = hw * tw;
    let sy_web = a_web * tw / 2.0;
    let iyy_web = t_maal_b3_op_3(tw, hw);

    let a_afr = 2.0 * afronding_oppervlak(r);
    let e_afr = afronding_zwaartepunt(r);
    let y_afr = tw + e_afr;
    let z_afr = hh - t0 - e_afr; // afstand tot de symmetrieas
    let sy_afr = a_afr * y_afr;
    let iyy_afr = a_afr * y_afr * y_afr;

    let area = 2.0 * a_flens + a_web + a_afr;
    let sy = 2.0 * sy_flens + sy_web + sy_afr;
    let y_c = sy / area;

    // Iz om de zwaartepuntsas: Steiner terugrekenen vanaf y = 0.
    let iz = (2.0 * iyy_flens + iyy_web + iyy_afr) - area * y_c * y_c;

    // ── Iy om de symmetrieas z = 0 ──────────────────────────────────────────
    // Per flens: ∫[H³ − (H − t)³]/3 dy, met H = h/2.
    let iy_flens_blok = tw * (hh.powi(3) - (hh - t0).powi(3)) / 3.0;
    let iy_flens_taps = hh * hh * m0 - hh * it2 + it3 / 3.0;
    let iy = 2.0 * (iy_flens_blok + iy_flens_taps)
        + tw * hw.powi(3) / 12.0
        + a_afr * z_afr * z_afr;

    let wel_y = iy / hh;

    // ── Wpl;y: PNA op z = 0 (symmetrieas), dus Wpl = 2·∫_{z>0} z dA ─────────
    let sz_flens_blok = tw * (hh * hh - (hh - t0).powi(2)) / 2.0;
    let sz_flens_taps = hh * m0 - it2 / 2.0;
    let sz_web = tw * hw * hw / 8.0;
    let sz_afr = 0.5 * a_afr * z_afr;
    let wpl_y = 2.0 * (sz_flens_blok + sz_flens_taps + sz_web + sz_afr);

    // ── Wpl;z via de breedtefunctie w(y) ────────────────────────────────────
    // w(y) = 2·t(y) + lijf (y < tw) + de afrondingen, uitgesmeerd over
    // y ∈ [tw, tw + r] zodat de functie continu blijft.
    let w = |y: f64| -> f64 {
        let dikte = if y < tw { t0 } else { t0 - s * (y - tw) };
        let mut w = 2.0 * dikte.max(0.0);
        if y < tw {
            w += hw;
        }
        if r > 0.0 && y >= tw && y <= tw + r {
            w += a_afr / r;
        }
        w
    };
    let wpl_z = wpl_om_verticale_as(&w, 0.0, b);

    let av_z = hw * tw + a_afr;
    let av_y = 2.0 * a_flens;

    // It: ⅓·Σ b·t³ over flenzen (blok plus hellend deel) en lijf.
    let it = (2.0 * (tw * t0.powi(3) + it3) + hw * tw.powi(3)) / 3.0;

    // Iw: de dunwandige U-formule met de gemiddelde flensdikte A_flens/b.
    let tf_eff = a_flens / b;
    let iw = (b.powi(3) * tf_eff * (h - tf_eff).powi(2) / 12.0)
        * (3.0 * b * tf_eff + 2.0 * hw * tw)
        / (6.0 * b * tf_eff + hw * tw);

    let wel_z = iz / y_c.max(b - y_c);

    schrijf(ChannelRuw {
        h,
        b,
        tw,
        tf,
        r,
        area,
        y_c,
        iy,
        iz,
        wel_y,
        wel_z,
        wpl_y,
        wpl_z,
        av_y,
        av_z,
        it,
        iw,
        tf_effectief: tf_eff,
    })
}

fn t_maal_b3_op_3(t: f64, b: f64) -> f64 {
    b * t.powi(3) / 3.0
}

/// `Wpl` om een verticale as uit de breedtefunctie `w(y)`, met de PNA op de
/// gelijke-oppervlakte-as. Middelpuntsregel met 4000 stroken; de fout in `Wpl`
/// is tweede orde in de fout van de PNA, dus dit is ruim voldoende.
fn wpl_om_verticale_as(w: &dyn Fn(f64) -> f64, y0: f64, y1: f64) -> f64 {
    const N: usize = 4000;
    let dy = (y1 - y0) / N as f64;
    let mut ys: Vec<f64> = Vec::with_capacity(N);
    let mut ws: Vec<f64> = Vec::with_capacity(N);
    for i in 0..N {
        let y = y0 + (i as f64 + 0.5) * dy;
        ys.push(y);
        ws.push(w(y));
    }
    let a: f64 = ws.iter().sum::<f64>() * dy;
    let mut opp = 0.0;
    let mut y_pna = y1;
    for (i, &wi) in ws.iter().enumerate() {
        let volgende = opp + wi * dy;
        if volgende >= a / 2.0 {
            let rest = a / 2.0 - opp;
            y_pna = y0 + i as f64 * dy + rest / wi.max(1e-30);
            break;
        }
        opp = volgende;
    }
    ys.iter()
        .zip(ws.iter())
        .map(|(&y, &wi)| wi * dy * (y - y_pna).abs())
        .sum()
}

/// Alle ruwe uitkomsten van een U-profiel, vóór het vullen van het schema.
struct ChannelRuw {
    h: f64,
    b: f64,
    tw: f64,
    tf: f64,
    r: f64,
    area: f64,
    y_c: f64,
    iy: f64,
    iz: f64,
    wel_y: f64,
    wel_z: f64,
    wpl_y: f64,
    wpl_z: f64,
    av_y: f64,
    av_z: f64,
    it: f64,
    iw: f64,
    tf_effectief: f64,
}

fn schrijf(c: ChannelRuw) -> SectionProperties {
    // Schuifmiddelpunt van een U: op de symmetrieas, aan de andere kant van het
    // lijf dan de flenzen. Dunwandig: e = b'²·h'²·tf/(4·Iy) gemeten vanaf het
    // hart van het lijf, met b' = b − tw/2 en h' = h − tf.
    let b_acc = c.b - c.tw / 2.0;
    let h_acc = c.h - c.tf_effectief;
    let e = if c.iy > 0.0 {
        b_acc * b_acc * h_acc * h_acc * c.tf_effectief / (4.0 * c.iy)
    } else {
        0.0
    };

    SectionProperties {
        area_mm2: c.area,
        iy_mm4: c.iy,
        iz_mm4: c.iz,
        wel_y_mm3: c.wel_y,
        wel_z_mm3: c.wel_z,
        wpl_y_mm3: c.wpl_y,
        wpl_z_mm3: c.wpl_z,
        av_y_mm2: c.av_y,
        av_z_mm2: c.av_z,
        it_mm4: c.it,
        iw_mm6: c.iw,
        iy_radius_mm: (c.iy / c.area).sqrt(),
        iz_radius_mm: (c.iz / c.area).sqrt(),
        h_mm: c.h,
        b_mm: c.b,
        tw_mm: c.tw,
        tf_mm: c.tf,
        r_mm: c.r,
        // Zwaartepunt: op halve hoogte (symmetrieas) en op y_c vanaf de rug.
        y_c_mm: c.y_c,
        z_c_mm: c.h / 2.0,
        // Boven- en ondervezel zijn gelijk (symmetrie om de y-as); links en
        // rechts niet: links is de rug van het lijf, rechts de flenspunt.
        wel_y_top_mm3: c.wel_y,
        wel_y_bot_mm3: c.wel_y,
        wel_z_left_mm3: if c.y_c > 0.0 { c.iz / c.y_c } else { 0.0 },
        wel_z_right_mm3: if c.b - c.y_c > 0.0 { c.iz / (c.b - c.y_c) } else { 0.0 },
        // De y-as is symmetrieas, dus Iyz = 0 en de hoofdassen vallen samen
        // met y en z.
        iyz_mm4: 0.0,
        iu_mm4: c.iy,
        iv_mm4: c.iz,
        alpha_hoofdas_rad: 0.0,
        y_s_mm: c.tw / 2.0 - e,
        z_s_mm: c.h / 2.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i_section::i_section_props;
    use crate::rhs::rhs_section_props;
    use approx::assert_relative_eq;

    #[test]
    fn unp350_matches_catalog() {
        let p = channel_section_props(350.0, 100.0, 14.0, 16.0, 16.0);
        assert_relative_eq!(p.area_mm2, 7727.0, max_relative = 0.05);
        // Ook met de 8%-helling blijft A binnen dezelfde marge:
        // t₀ = 16 + 0,08·(50 − 14) = 18,88; t₁ = 12; hw = 312,24
        // A = 2·(14·18,88 + ∫t) + 312,24·14 + 2·0,2146·16² = 7665 mm²
        let taps = channel_section_props_unp(350.0, 100.0, 14.0, 16.0, 16.0);
        assert_relative_eq!(taps.area_mm2, 7727.0, max_relative = 0.05);
    }

    // ── D4.1 groep 7: schemacontrole op de nieuwe velden ─────────────────────

    /// `e_y` volgens de catalogus, afgeleid als `b − Iz/Wel;z`:
    ///  UNP 100: 50 − 293 000/8490  = 15,49 mm
    ///  UNP 200: 75 − 1 480 000/27 000 = 20,19 mm
    ///  UNP 300: 100 − 4 950 000/67 800 = 26,99 mm
    #[test]
    fn unp_zwaartepunt_binnen_2_procent_van_de_catalogus() {
        // (h, b, tw, tf, r, e_y uit de catalogus)
        let gevallen = [
            (100.0, 50.0, 6.0, 8.5, 8.5, 15.489),
            (200.0, 75.0, 8.5, 11.5, 11.5, 20.185),
            (300.0, 100.0, 10.0, 16.0, 16.0, 26.991),
        ];
        for (h, b, tw, tf, r, e_y) in gevallen {
            let p = channel_section_props_unp(h, b, tw, tf, r);
            let afwijking = (p.y_c_mm - e_y).abs() / e_y;
            assert!(
                afwijking <= 0.02,
                "UNP {h}: y_c = {:.3} mm tegen e_y = {e_y} mm ({:.2}%)",
                p.y_c_mm,
                afwijking * 100.0
            );
            // Het zwaartepunt ligt op halve hoogte (symmetrieas).
            assert_relative_eq!(p.z_c_mm, h / 2.0, max_relative = 1e-12);
        }
    }

    /// Zonder de flenshelling zit het zwaartepunt er aantoonbaar naast. Deze
    /// test legt dat vast zodat de reden om twee modellen te hebben zichtbaar
    /// blijft — hij is géén ijking op de catalogus.
    #[test]
    fn parallelle_flensidealisatie_zit_er_bij_unp_naast() {
        let p = channel_section_props(200.0, 75.0, 8.5, 11.5, 11.5);
        // 71 081,6/3286,3 = 21,63 mm tegen de catalogus 20,19 mm: +7,2%.
        assert_relative_eq!(p.y_c_mm, 21.63, max_relative = 0.01);
        assert!((p.y_c_mm - 20.185).abs() / 20.185 > 0.05);
    }

    #[test]
    fn channel_heeft_twee_verschillende_wel_z() {
        let p = channel_section_props_unp(200.0, 75.0, 8.5, 11.5, 11.5);
        // Wel;z;links = Iz/y_c, Wel;z;rechts = Iz/(b − y_c); y_c ≈ 20,33 en
        // b − y_c ≈ 54,67, dus links is ruim tweemaal zo groot als rechts.
        assert!(
            p.wel_z_left_mm3 > 1.5 * p.wel_z_right_mm3,
            "links {} vs rechts {}",
            p.wel_z_left_mm3,
            p.wel_z_right_mm3
        );
        // Het maatgevende (kleinste) blijft in het oude veld staan.
        assert_relative_eq!(
            p.wel_z_mm3,
            p.wel_z_left_mm3.min(p.wel_z_right_mm3),
            max_relative = 1e-12
        );
        // Boven en onder zijn wél gelijk: de y-as is symmetrieas.
        assert_relative_eq!(p.wel_y_top_mm3, p.wel_y_bot_mm3, max_relative = 1e-12);
        // Schuifmiddelpunt ligt buiten de doorsnede, aan de lijfzijde (y < 0).
        assert!(p.y_s_mm < 0.0, "y_s = {}", p.y_s_mm);
        assert_relative_eq!(p.z_s_mm, 100.0, max_relative = 1e-12);
    }

    #[test]
    fn dubbelsymmetrische_vormen_hebben_gelijke_vezels() {
        let ipe = i_section_props(300.0, 150.0, 7.1, 10.7, 15.0);
        assert_relative_eq!(ipe.wel_z_left_mm3, ipe.wel_z_right_mm3, max_relative = 1e-12);
        assert_relative_eq!(ipe.wel_y_top_mm3, ipe.wel_y_bot_mm3, max_relative = 1e-12);
        assert_relative_eq!(ipe.y_c_mm, 75.0, max_relative = 1e-12);
        assert_relative_eq!(ipe.z_c_mm, 150.0, max_relative = 1e-12);
        assert_eq!(ipe.iyz_mm4, 0.0);
        assert_eq!(ipe.alpha_hoofdas_rad, 0.0);

        let shs = rhs_section_props(200.0, 200.0, 8.0, 12.0);
        assert_relative_eq!(shs.wel_z_left_mm3, shs.wel_z_right_mm3, max_relative = 1e-12);
        assert_relative_eq!(shs.wel_y_top_mm3, shs.wel_y_bot_mm3, max_relative = 1e-12);
        assert_relative_eq!(shs.y_s_mm, shs.y_c_mm, max_relative = 1e-12);

        let rhs = rhs_section_props(200.0, 100.0, 8.0, 12.0);
        assert_relative_eq!(rhs.wel_z_left_mm3, rhs.wel_z_right_mm3, max_relative = 1e-12);
        assert_relative_eq!(rhs.y_c_mm, 50.0, max_relative = 1e-12);
        assert_relative_eq!(rhs.z_c_mm, 100.0, max_relative = 1e-12);
    }

    /// De nieuwe velden zijn `#[serde(default)]`: oude JSON zonder die sleutels
    /// laadt nog steeds, met nullen op de nieuwe plaatsen.
    #[test]
    fn oude_json_zonder_nieuwe_velden_laadt_nog() {
        let json = r#"{
            "area_mm2": 3220.0, "iy_mm4": 19100000.0, "iz_mm4": 1480000.0,
            "wel_y_mm3": 191000.0, "wel_z_mm3": 27000.0,
            "wpl_y_mm3": 228000.0, "wpl_z_mm3": 46400.0,
            "av_y_mm2": 1725.0, "av_z_mm2": 1700.0,
            "it_mm4": 184000.0, "iw_mm6": 36700000000.0,
            "iy_radius_mm": 77.02, "iz_radius_mm": 21.44,
            "h_mm": 200.0, "b_mm": 75.0, "tw_mm": 8.5, "tf_mm": 11.5, "r_mm": 11.5
        }"#;
        let p: SectionProperties = serde_json::from_str(json).expect("moet laden");
        assert_relative_eq!(p.area_mm2, 3220.0, max_relative = 1e-12);
        assert_eq!(p.y_c_mm, 0.0);
        assert_eq!(p.iu_mm4, 0.0);
    }
}
