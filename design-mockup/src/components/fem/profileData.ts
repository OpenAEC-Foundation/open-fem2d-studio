/**
 * Profile + material database used for self-weight calculation and
 * (later) EN 1993 steel checks.
 *
 * Areas are in cm² (matches European section tables / steel profile
 * libraries). Convert to mm² with × 100 before passing to the solver.
 * Densities are in kg/m³.
 */

/** Cross-sectional area lookup (cm²) for common European steel profiles. */
export const PROFILE_AREA_CM2: Record<string, number> = {
  // HEA series
  HEA100: 21.2, HEA120: 25.3, HEA140: 31.4, HEA160: 38.8,
  HEA180: 45.3, HEA200: 53.8, HEA220: 64.3, HEA240: 76.8,
  HEA260: 86.8, HEA280: 97.3, HEA300: 112.5,
  // HEB series
  HEB100: 26.0, HEB120: 34.0, HEB140: 43.0, HEB160: 54.3,
  HEB180: 65.3, HEB200: 78.1, HEB220: 91.0, HEB240: 106.0,
  HEB260: 118.4, HEB280: 131.4, HEB300: 149.1,
  // IPE series
  IPE100: 10.3, IPE120: 13.2, IPE140: 16.4, IPE160: 20.1,
  IPE180: 23.9, IPE200: 28.5, IPE220: 33.4, IPE240: 39.1,
  IPE270: 45.9, IPE300: 53.8, IPE330: 62.6, IPE360: 72.7,
  // UNP / UPN series
  UNP100: 13.5, UNP120: 17.0, UNP140: 20.4, UNP160: 24.0,
  UNP180: 28.0, UNP200: 32.2, UNP220: 37.4, UNP240: 42.3,
};

/**
 * Plastic section modulus Wpl,y (cm³) — used for EN 1993 unity check
 * (Mpl,Rd = Wpl · fy / γM0). Convert to mm³ with × 1000.
 */
export const PROFILE_WPL_Y_CM3: Record<string, number> = {
  // HEA series
  HEA100: 83,  HEA120: 119, HEA140: 173, HEA160: 245,
  HEA180: 325, HEA200: 429, HEA220: 568, HEA240: 744,
  HEA260: 920, HEA280: 1112, HEA300: 1383,
  // HEB series
  HEB100: 104, HEB120: 165, HEB140: 245, HEB160: 354,
  HEB180: 481, HEB200: 642, HEB220: 827, HEB240: 1053,
  HEB260: 1283, HEB280: 1534, HEB300: 1869,
  // IPE series
  IPE100: 39,  IPE120: 60,  IPE140: 88,  IPE160: 124,
  IPE180: 166, IPE200: 220, IPE220: 285, IPE240: 367,
  IPE270: 484, IPE300: 628, IPE330: 804, IPE360: 1019,
  // UNP / UPN series
  UNP100: 49,  UNP120: 72,  UNP140: 103, UNP160: 138,
  UNP180: 179, UNP200: 228, UNP220: 282, UNP240: 339,
};

/** Yield strength (N/mm²) per steel grade. */
export const STEEL_FY: Record<string, number> = {
  S235: 235, S275: 275, S355: 355, S420: 420, S460: 460,
};

/** Material density (kg/m³). */
export const MATERIAL_DENSITY: Record<string, number> = {
  S235: 7850, S275: 7850, S355: 7850, S420: 7850, S460: 7850,
  // Future: concrete C20/25 = 2500, etc.
};

/** Standard gravitational acceleration (m/s²). */
export const G = 9.81;

/**
 * Distributed self-weight (q in kN/m) for a beam with the given material +
 * profile.  Returns a NEGATIVE number (downward in global +Z convention).
 *
 *   q = ρ · A · g  [N/m]  = ρ · A · g / 1000  [kN/m]
 *
 * With ρ ≈ 7850 kg/m³ and A in m² = A_cm² / 1e4:
 *   q [kN/m] ≈ −7850 · (A_cm² / 1e4) · 9.81 / 1000
 *           ≈ −0.0077 · A_cm²
 */
export function selfWeightPerMeter(material: string, profile: string): number {
  const A_cm2 = PROFILE_AREA_CM2[profile] ?? PROFILE_AREA_CM2.HEA160;
  const rho   = MATERIAL_DENSITY[material] ?? 7850;
  const A_m2  = A_cm2 / 10000;
  // negative → gravity is in -Z direction in our convention
  return -(rho * A_m2 * G) / 1000;
}
