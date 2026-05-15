//! UNP/UPE channel section properties.
//! Mono-symmetric: Iy major (web vertical), Iz minor (asymmetric about z).

use crate::SectionProperties;

pub fn channel_section_props(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> SectionProperties {
    let hw = h - 2.0 * tf;
    let area = 2.0 * b * tf + hw * tw + 2.0 * (r * r - std::f64::consts::PI * r * r / 4.0);

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

    let av_z = hw * tw + 2.0 * (r * r - std::f64::consts::PI * r * r / 4.0);
    let av_y = 2.0 * b * tf;

    let it = (1.0 / 3.0) * (2.0 * b * tf.powi(3) + hw * tw.powi(3));

    let iw = (b.powi(3) * tf * (h - tf).powi(2) / 12.0) * (3.0 * b * tf + 2.0 * hw * tw) / (6.0 * b * tf + hw * tw);

    let iy_radius = (iy / area).sqrt();
    let iz_radius = (iz / area).sqrt();

    SectionProperties {
        area_mm2: area, iy_mm4: iy, iz_mm4: iz,
        wel_y_mm3: wel_y, wel_z_mm3: wel_z,
        wpl_y_mm3: wpl_y, wpl_z_mm3: wpl_z,
        av_y_mm2: av_y, av_z_mm2: av_z,
        it_mm4: it, iw_mm6: iw,
        iy_radius_mm: iy_radius, iz_radius_mm: iz_radius,
        h_mm: h, b_mm: b, tw_mm: tw, tf_mm: tf, r_mm: r,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn unp350_matches_catalog() {
        let p = channel_section_props(350.0, 100.0, 14.0, 16.0, 16.0);
        assert_relative_eq!(p.area_mm2, 7727.0, max_relative = 0.05);
    }
}
