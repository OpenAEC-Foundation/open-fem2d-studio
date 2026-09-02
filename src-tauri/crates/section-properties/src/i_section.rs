//! Hot-rolled I-section properties (HEA, HEB, IPE, HEM).
//! Approximations follow standard structural-steel handbook formulas.

use crate::SectionProperties;

/// Compute properties for a rolled I-section (h, b, tw, tf, r in mm).
pub fn i_section_props(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> SectionProperties {
    let hw = h - 2.0 * tf;

    let a_flanges = 2.0 * b * tf;
    let a_web = hw * tw;
    let a_fillets = 4.0 * (r * r - std::f64::consts::PI * r * r / 4.0);
    let area = a_flanges + a_web + a_fillets;

    let iy_flanges = 2.0 * (b * tf.powi(3) / 12.0 + b * tf * ((h - tf) / 2.0).powi(2));
    let iy_web = tw * hw.powi(3) / 12.0;
    let fillet_area = r * r - std::f64::consts::PI * r * r / 4.0;
    let fillet_centroid_y = hw / 2.0 - r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI);
    let iy_fillets = 4.0 * fillet_area * fillet_centroid_y.powi(2);
    let iy = iy_flanges + iy_web + iy_fillets;

    let iz_flanges = 2.0 * (tf * b.powi(3) / 12.0);
    let iz_web = hw * tw.powi(3) / 12.0;
    let iz_fillets = 4.0 * fillet_area * (tw / 2.0 + r / 2.0).powi(2);
    let iz = iz_flanges + iz_web + iz_fillets;

    let wel_y = iy / (h / 2.0);
    let wel_z = iz / (b / 2.0);

    let wpl_y = b * tf * (h - tf) + tw * (h / 2.0 - tf).powi(2)
        + 4.0 * fillet_area * fillet_centroid_y;
    let wpl_z = 2.0 * (tf * b.powi(2) / 4.0) + (hw * tw.powi(2) / 4.0)
        + 4.0 * fillet_area * (tw / 2.0 + r / 2.0);

    let av_z = area - 2.0 * b * tf + (tw + 2.0 * r) * tf;
    let av_y = 2.0 * b * tf;

    let it = (1.0 / 3.0) * (2.0 * b * tf.powi(3) + (h - tf) * tw.powi(3))
        + 2.0 * 0.0937 * r.powi(4);
    let iw = iz * (h - tf).powi(2) / 4.0;

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
        // Dubbelsymmetrisch: zwaartepunt in het hart, geen traagheidsproduct,
        // hoofdassen vallen samen met y en z en het schuifmiddelpunt met het
        // zwaartepunt. Boven- en ondervezel zijn identiek, links en rechts ook.
        y_c_mm: b / 2.0, z_c_mm: h / 2.0,
        wel_y_top_mm3: wel_y, wel_y_bot_mm3: wel_y,
        wel_z_left_mm3: wel_z, wel_z_right_mm3: wel_z,
        iyz_mm4: 0.0, iu_mm4: iy, iv_mm4: iz, alpha_hoofdas_rad: 0.0,
        y_s_mm: b / 2.0, z_s_mm: h / 2.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn heb160_matches_catalog_within_2pct() {
        let p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        assert_relative_eq!(p.area_mm2, 5427.5, max_relative = 0.02);
        assert_relative_eq!(p.iy_mm4, 24920000.0, max_relative = 0.02);
        assert_relative_eq!(p.iz_mm4, 8892600.0, max_relative = 0.02);
        assert_relative_eq!(p.wpl_y_mm3, 354100.0, max_relative = 0.02);
    }
}
