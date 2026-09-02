//! Hot-formed Rectangular/Square Hollow Section properties.

use crate::SectionProperties;

pub fn rhs_section_props(h: f64, b: f64, t: f64, r: f64) -> SectionProperties {
    let ri = (r - t).max(0.0);
    let area_outer = h * b - (4.0 - std::f64::consts::PI) * r * r;
    let area_inner = (h - 2.0 * t) * (b - 2.0 * t) - (4.0 - std::f64::consts::PI) * ri * ri;
    let area = area_outer - area_inner;

    let iy_outer = b * h.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * r.powi(2) * (h / 2.0 - r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI)).powi(2);
    let iy_inner_h = h - 2.0 * t;
    let iy_inner_b = b - 2.0 * t;
    let iy_inner = iy_inner_b * iy_inner_h.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * ri.powi(2) * (iy_inner_h / 2.0).powi(2);
    let iy = iy_outer - iy_inner;

    let iz_outer = h * b.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * r.powi(2) * (b / 2.0 - r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI)).powi(2);
    let iz_inner = iy_inner_h * iy_inner_b.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * ri.powi(2) * (iy_inner_b / 2.0).powi(2);
    let iz = iz_outer - iz_inner;

    let wel_y = iy / (h / 2.0);
    let wel_z = iz / (b / 2.0);

    let wpl_y = b * h * h / 4.0 - (b - 2.0 * t) * (h - 2.0 * t).powi(2) / 4.0;
    let wpl_z = h * b * b / 4.0 - (h - 2.0 * t) * (b - 2.0 * t).powi(2) / 4.0;

    let av_z = area * h / (b + h);
    let av_y = area * b / (b + h);

    let am = (b - t) * (h - t);
    let um = 2.0 * (b + h - 2.0 * t);
    let it = 4.0 * am.powi(2) * t / um;
    let iw = 0.0;

    let iy_radius = (iy / area).sqrt();
    let iz_radius = (iz / area).sqrt();

    SectionProperties {
        area_mm2: area, iy_mm4: iy, iz_mm4: iz,
        wel_y_mm3: wel_y, wel_z_mm3: wel_z,
        wpl_y_mm3: wpl_y, wpl_z_mm3: wpl_z,
        av_y_mm2: av_y, av_z_mm2: av_z,
        it_mm4: it, iw_mm6: iw,
        iy_radius_mm: iy_radius, iz_radius_mm: iz_radius,
        h_mm: h, b_mm: b, tw_mm: t, tf_mm: t, r_mm: r,
        // Dubbelsymmetrisch, net als het I-profiel.
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
    fn hfrhs_200x200x16_matches_catalog() {
        let p = rhs_section_props(200.0, 200.0, 16.0, 24.0);
        assert_relative_eq!(p.area_mm2, 10770.0, max_relative = 0.05);
        assert_relative_eq!(p.iy_mm4, 62400000.0, max_relative = 0.05);
    }
}
