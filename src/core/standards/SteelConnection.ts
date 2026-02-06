/**
 * Steel Moment Connection Design — EN 1993-1-8
 *
 * Simplified end-plate moment connection:
 *   - Extended / flush end-plate
 *   - T-stub model per bolt row
 *   - Column web panel shear
 *   - Moment capacity = Σ(F_ri × h_ri)
 */

// ─── Bolt data ──────────────────────────────────────────────────────────────
export interface IBoltData {
  diameter: number;   // mm (M12..M30)
  A_s: number;        // tensile stress area mm²
  d_0: number;        // hole diameter mm
}

const BOLT_TABLE: Record<number, IBoltData> = {
  12: { diameter: 12, A_s: 84.3, d_0: 13 },
  16: { diameter: 16, A_s: 157, d_0: 18 },
  20: { diameter: 20, A_s: 245, d_0: 22 },
  24: { diameter: 24, A_s: 353, d_0: 26 },
  27: { diameter: 27, A_s: 459, d_0: 30 },
  30: { diameter: 30, A_s: 561, d_0: 33 },
};

export interface IBoltClass {
  name: string;
  f_ub: number; // ultimate tensile strength MPa
}

const BOLT_CLASSES: Record<string, IBoltClass> = {
  '8.8': { name: '8.8', f_ub: 800 },
  '10.9': { name: '10.9', f_ub: 1000 },
};

// ─── Input ──────────────────────────────────────────────────────────────────
export interface IMomentConnectionConfig {
  // Beam profile
  beam_h: number;     // beam depth mm
  beam_b: number;     // beam flange width mm
  beam_tw: number;    // beam web thickness mm
  beam_tf: number;    // beam flange thickness mm
  beam_fy: number;    // beam yield strength MPa
  beamProfileName: string;

  // Column profile
  col_h: number;      // column depth mm
  col_b: number;      // column flange width mm
  col_tw: number;     // column web thickness mm
  col_tf: number;     // column flange thickness mm
  col_fy: number;     // column yield strength MPa
  colProfileName: string;

  // Bolts
  boltDiameter: number;  // mm (12, 16, 20, 24, 27, 30)
  boltClass: string;     // '8.8' or '10.9'
  boltRows: number;      // number of bolt rows in tension zone (1..4)

  // End plate
  plate_tp: number;      // plate thickness mm
  plate_bp: number;      // plate width mm
  plate_hp: number;      // plate height mm
  plate_fy: number;      // plate yield strength MPa

  // Design forces
  M_Ed: number;          // design moment kNm
  V_Ed: number;          // design shear kN
}

// ─── Output ─────────────────────────────────────────────────────────────────
export interface IBoltRowResult {
  row: number;
  h_r: number;           // lever arm from compression centre mm
  F_tRd_mode1: number;   // T-stub mode 1 kN
  F_tRd_mode2: number;   // T-stub mode 2 kN
  F_tRd_mode3: number;   // T-stub mode 3 kN (bolt failure)
  F_tRd: number;         // governing row resistance kN
  F_tEd: number;         // row force demand kN
}

export interface IMomentConnectionResult {
  M_jRd: number;         // moment resistance kNm
  V_wpRd: number;        // column web panel shear resistance kN
  boltRows: IBoltRowResult[];
  governingMode: string;
  UC_M: number;          // moment unity check
  UC_V: number;          // shear unity check
  UC_max: number;
  status: 'OK' | 'FAIL';
}

// ─── Design ─────────────────────────────────────────────────────────────────
const GAMMA_M0 = 1.0;
const GAMMA_M2 = 1.25;

export function designMomentConnection(cfg: IMomentConnectionConfig): IMomentConnectionResult {
  const bolt = BOLT_TABLE[cfg.boltDiameter];
  const boltCls = BOLT_CLASSES[cfg.boltClass];
  if (!bolt || !boltCls) throw new Error('Invalid bolt configuration');

  // Bolt tension resistance (per bolt)
  const k2 = 0.9;
  const F_tRd_bolt = (k2 * boltCls.f_ub * bolt.A_s) / (GAMMA_M2 * 1000); // kN

  // Bolt row positions — measured from compression centre (bottom beam flange)
  // Compression centre at beam_tf/2 from bottom
  const compressionCentre = cfg.beam_tf / 2;

  // Standard bolt row positions (from beam bottom):
  // Row 1: above beam top flange (extended plate) at beam_h + e_x
  // Row 2: just below top flange
  // Row 3, 4: further down web
  const e_x = 40; // edge distance above beam
  const p = 70;    // bolt row pitch mm
  const rowPositions: number[] = [];

  // Row 1 (extended above top flange)
  rowPositions.push(cfg.beam_h + e_x);
  // Row 2 (below top flange)
  rowPositions.push(cfg.beam_h - cfg.beam_tf - 30);
  // Additional rows
  for (let i = 2; i < cfg.boltRows; i++) {
    rowPositions.push(cfg.beam_h - cfg.beam_tf - 30 - (i - 1) * p);
  }

  // Lever arms from compression centre
  const leverArms = rowPositions.map(pos => pos - compressionCentre);

  // T-stub effective lengths (simplified)
  const m = (cfg.plate_bp - cfg.beam_tw) / 4; // distance from bolt to web
  const e = Math.min((cfg.plate_bp - cfg.beam_tw) / 4, 1.25 * m);

  const boltRowResults: IBoltRowResult[] = [];
  let M_jRd = 0;
  let governingMode = '';
  let minModeRatio = Infinity;

  for (let i = 0; i < cfg.boltRows; i++) {
    const h_r = leverArms[i];
    if (h_r <= 0) continue; // skip rows in compression zone

    // Effective length for T-stub (simplified circular pattern)
    const l_eff = Math.min(2 * Math.PI * m, 4 * m + 1.25 * e);

    // Mode 1: Complete flange yielding
    const M_pl = 0.25 * l_eff * cfg.plate_tp * cfg.plate_tp * cfg.plate_fy / (GAMMA_M0 * 1e6); // kNm
    const F_tRd_mode1 = (4 * M_pl * 1000) / m; // kN

    // Mode 2: Bolt failure with flange yielding
    const n_bolt = 2; // 2 bolts per row
    const F_tRd_mode2 = (2 * M_pl * 1000 + n_bolt * F_tRd_bolt * Math.min(m, e)) / (m + Math.min(m, e)); // kN

    // Mode 3: Bolt failure
    const F_tRd_mode3 = n_bolt * F_tRd_bolt; // kN

    const F_tRd = Math.min(F_tRd_mode1, F_tRd_mode2, F_tRd_mode3);

    // Determine which mode governs
    let rowMode = 'Mode 1';
    if (F_tRd === F_tRd_mode2) rowMode = 'Mode 2';
    if (F_tRd === F_tRd_mode3) rowMode = 'Mode 3';

    // Contribution to moment
    const M_contribution = F_tRd * h_r / 1000; // kNm
    M_jRd += M_contribution;

    // Track governing
    if (F_tRd / F_tRd_mode3 < minModeRatio) {
      minModeRatio = F_tRd / F_tRd_mode3;
      governingMode = `Bolt row ${i + 1}: ${rowMode}`;
    }

    boltRowResults.push({
      row: i + 1,
      h_r,
      F_tRd_mode1,
      F_tRd_mode2,
      F_tRd_mode3,
      F_tRd,
      F_tEd: 0, // calculated below
    });
  }

  // Distribute applied moment to bolt rows (proportional to lever arm)
  const totalH = boltRowResults.reduce((s, r) => s + r.h_r, 0);
  for (const row of boltRowResults) {
    row.F_tEd = (cfg.M_Ed * 1000 / totalH) * (row.h_r / (totalH / boltRowResults.length)); // simplified
  }

  // Actually: F_tEd per row = M_Ed × h_ri / Σ(h_ri²)
  const sumH2 = boltRowResults.reduce((s, r) => s + r.h_r * r.h_r, 0);
  for (const row of boltRowResults) {
    row.F_tEd = (cfg.M_Ed * 1e6 * row.h_r) / (sumH2 * 1000); // kN
  }

  // Column web panel shear resistance
  const A_vc = cfg.col_h * cfg.col_tw; // mm² (simplified)
  const V_wpRd = (0.9 * cfg.col_fy * A_vc) / (Math.sqrt(3) * GAMMA_M0 * 1000); // kN

  // Unity checks
  const UC_M = cfg.M_Ed / M_jRd;
  const UC_V = cfg.V_Ed / V_wpRd;
  const UC_max = Math.max(UC_M, UC_V);

  if (UC_M > UC_V) {
    governingMode = 'Moment: ' + governingMode;
  } else {
    governingMode = 'Column web panel shear';
  }

  return {
    M_jRd,
    V_wpRd,
    boltRows: boltRowResults,
    governingMode,
    UC_M,
    UC_V,
    UC_max,
    status: UC_max <= 1.0 ? 'OK' : 'FAIL',
  };
}

export function getAvailableBoltDiameters(): number[] {
  return Object.keys(BOLT_TABLE).map(Number);
}

export function getAvailableBoltClasses(): string[] {
  return Object.keys(BOLT_CLASSES);
}
