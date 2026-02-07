/**
 * Steel Moment Connection Design — NEN-EN 1993-1-8
 *
 * Full end-plate moment connection calculation including:
 *   - Column flange in transverse bending (6.2.6.4)
 *   - End-plate in bending (6.2.6.5)
 *   - Column web in transverse tension (6.2.6.3)
 *   - Beam web in tension (6.2.6.8)
 *   - Column web panel in shear (6.2.6.1)
 *   - Column web in transverse compression (6.2.6.2)
 *   - Beam flange and web in compression (6.2.6.7)
 *   - Shear and bearing resistance (Table 3.4)
 *   - Fillet weld checks
 *   - Rotational stiffness (6.3.1)
 *   - Joint classification (5.2.2)
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
  '4.6': { name: '4.6', f_ub: 400 },
  '5.6': { name: '5.6', f_ub: 500 },
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
  beam_r: number;     // beam root radius mm
  beam_fy: number;    // beam yield strength MPa
  beam_fu: number;    // beam ultimate strength MPa
  beam_A: number;     // beam area mm²
  beam_Iy: number;    // beam moment of inertia mm⁴
  beam_Wpl: number;   // beam plastic section modulus mm³
  beamProfileName: string;
  beamLength: number; // beam span length mm (for stiffness classification)

  // Column profile
  col_h: number;      // column depth mm
  col_b: number;      // column flange width mm
  col_tw: number;     // column web thickness mm
  col_tf: number;     // column flange thickness mm
  col_r: number;      // column root radius mm
  col_fy: number;     // column yield strength MPa
  col_fu: number;     // column ultimate strength MPa
  colProfileName: string;

  // Bolts
  boltDiameter: number;  // mm (12, 16, 20, 24, 27, 30)
  boltClass: string;     // '4.6', '5.6', '8.8' or '10.9'
  nBoltRows: number;     // number of bolt rows (1..4)
  nBoltsPerRow: number;  // bolts per row (typically 2)

  // Bolt geometry (from top of end plate)
  e_top: number;         // edge distance to top bolt row mm
  p_rows: number;        // vertical pitch between rows mm
  p_bolts: number;       // horizontal spacing between bolts mm
  e_side: number;        // side edge distance mm

  // End plate
  plate_tp: number;      // plate thickness mm
  plate_bp: number;      // plate width mm
  plate_hp: number;      // plate height mm
  plate_fy: number;      // plate yield strength MPa
  plate_fu: number;      // plate ultimate strength MPa

  // Welds
  a_ef: number;          // flange weld throat thickness mm
  a_ew: number;          // web weld throat thickness mm

  // Design forces
  M_Ed: number;          // design moment kNm
  V_Ed: number;          // design shear kN
  N_Ed?: number;         // design axial force kN (optional)

  // Partial factors
  gamma_M0?: number;     // resistance of cross-sections (default 1.0)
  gamma_M1?: number;     // resistance of members (default 1.0)
  gamma_M2?: number;     // resistance of connections (default 1.25)
}

// ─── Output ─────────────────────────────────────────────────────────────────
export interface IBoltRowResult {
  row: number;
  y_r: number;           // position from plate bottom mm
  h_r: number;           // lever arm from compression centre mm

  // Column flange T-stub (art. 6.2.6.4)
  F_T_cf_Rd: number;     // T-stub resistance kN
  mode_cf: 1 | 2 | 3;    // failure mode

  // End plate T-stub (art. 6.2.6.5)
  F_T_ep_Rd: number;     // T-stub resistance kN
  mode_ep: 1 | 2 | 3;    // failure mode

  // Column web in tension (art. 6.2.6.3)
  F_t_wc_Rd: number;     // resistance kN

  // Beam web in tension (art. 6.2.6.8)
  F_t_wb_Rd: number;     // resistance kN

  // Effective resistance
  F_tr_Rd: number;       // effective tension resistance kN
  limitingComponent: string;
}

export interface IComponentCheck {
  name: string;
  article: string;
  resistance: number;  // kN or kNm
  demand: number;      // kN or kNm
  UC: number;
  status: 'OK' | 'FAIL';
}

export interface IMomentConnectionResult {
  // Moment resistance
  M_jRd: number;         // moment resistance kNm
  compressionCentre: number; // mm from plate bottom

  // Column web panel shear (art. 6.2.6.1)
  V_wp_Rd: number;       // resistance kN

  // Column web compression (art. 6.2.6.2)
  F_c_wc_Rd: number;     // resistance kN

  // Beam flange compression (art. 6.2.6.7)
  F_c_fb_Rd: number;     // resistance kN

  // Bolt row details
  boltRows: IBoltRowResult[];

  // Shear resistance
  F_v_Rd: number;        // bolt shear resistance per plane kN
  F_b_Rd: number;        // bearing resistance kN
  V_Rd: number;          // total shear resistance kN

  // Weld checks
  weld_flange_ok: boolean;
  weld_web_ok: boolean;
  a_ef_min: number;      // minimum flange weld mm
  a_ew_min: number;      // minimum web weld mm

  // Rotational stiffness (art. 6.3.1)
  S_j_ini: number;       // initial stiffness kNm/rad
  S_j: number;           // secant stiffness kNm/rad

  // Classification (art. 5.2.2)
  classification: 'rigid' | 'semi-rigid' | 'pinned';
  S_j_rigid: number;     // rigid boundary kNm/rad
  S_j_pinned: number;    // pinned boundary kNm/rad

  // Characteristic rotations
  phi_Xd: number;        // design rotation rad
  phi_Cd: number;        // rotation capacity rad

  // Component checks summary
  components: IComponentCheck[];

  // Unity checks
  UC_M: number;          // moment unity check
  UC_V: number;          // shear unity check
  UC_max: number;
  governingCheck: string;
  status: 'OK' | 'FAIL';
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function calcTStubResistance(
  l_eff: number,      // effective length mm
  t_f: number,        // flange thickness mm
  m: number,          // distance bolt to web/weld mm
  e: number,          // edge distance mm
  F_tRd_bolt: number, // bolt tension resistance kN
  n_bolts: number,    // bolts per row
  f_y: number,        // yield strength MPa
  gamma_M0: number
): { F_Rd: number; mode: 1 | 2 | 3 } {
  const n = Math.min(e, 1.25 * m);

  // Plastic moment resistance of T-stub flange
  const M_pl_Rd = 0.25 * l_eff * t_f * t_f * f_y / gamma_M0 / 1e6; // kNm

  // Mode 1: Complete yielding of the flange
  const F_T_1_Rd = (4 * M_pl_Rd * 1000) / m; // kN

  // Mode 2: Bolt failure with yielding of flange
  const sum_F_tRd = n_bolts * F_tRd_bolt;
  const F_T_2_Rd = (2 * M_pl_Rd * 1000 + n * sum_F_tRd) / (m + n); // kN

  // Mode 3: Bolt failure
  const F_T_3_Rd = sum_F_tRd; // kN

  const F_Rd = Math.min(F_T_1_Rd, F_T_2_Rd, F_T_3_Rd);
  let mode: 1 | 2 | 3 = 1;
  if (F_Rd === F_T_2_Rd) mode = 2;
  if (F_Rd === F_T_3_Rd) mode = 3;

  return { F_Rd, mode };
}

// ─── Main Design Function ───────────────────────────────────────────────────

export function designMomentConnection(cfg: IMomentConnectionConfig): IMomentConnectionResult {
  const gamma_M0 = cfg.gamma_M0 ?? 1.0;
  const gamma_M1 = cfg.gamma_M1 ?? 1.0;
  const gamma_M2 = cfg.gamma_M2 ?? 1.25;

  const bolt = BOLT_TABLE[cfg.boltDiameter];
  const boltCls = BOLT_CLASSES[cfg.boltClass];
  if (!bolt || !boltCls) throw new Error('Invalid bolt configuration');

  // ─── Bolt resistances ───────────────────────────────────────────────────
  // Tension resistance per bolt (Table 3.4)
  const k2 = 0.9;
  const F_tRd_bolt = (k2 * boltCls.f_ub * bolt.A_s) / (gamma_M2 * 1000); // kN

  // Shear resistance per bolt per shear plane (Table 3.4)
  const alpha_v = (cfg.boltClass === '10.9') ? 0.5 : 0.6;
  const F_v_Rd = (alpha_v * boltCls.f_ub * bolt.A_s) / (gamma_M2 * 1000); // kN

  // ─── Geometry calculations ──────────────────────────────────────────────
  // Compression centre: at beam flange centre
  const compressionCentre = cfg.beam_tf / 2; // from plate bottom (beam bottom)

  // Bolt row positions from plate bottom
  const boltRowPositions: number[] = [];
  for (let i = 0; i < cfg.nBoltRows; i++) {
    const y = cfg.plate_hp - cfg.e_top - i * cfg.p_rows;
    boltRowPositions.push(y);
  }

  // Beam position relative to plate
  const beamBottom = (cfg.plate_hp - cfg.beam_h) / 2; // centred in plate
  const beamTop = beamBottom + cfg.beam_h;

  // ─── Calculate each bolt row ────────────────────────────────────────────
  const boltRowResults: IBoltRowResult[] = [];
  const components: IComponentCheck[] = [];

  for (let i = 0; i < cfg.nBoltRows; i++) {
    const y_r = boltRowPositions[i];
    const h_r = y_r - compressionCentre;

    // Skip rows in compression zone
    if (h_r <= cfg.beam_tf) continue;

    // Determine if row is adjacent to stiffener/flange or inner row
    const isAboveBeam = y_r > beamTop;
    const isBelowTopFlange = y_r < beamTop && y_r > beamTop - cfg.beam_tf - 30;
    const isInner = !isAboveBeam && !isBelowTopFlange;

    // ─── Column flange in transverse bending (6.2.6.4) ───────────────────
    const e_cf = 0.5 * (cfg.col_b - cfg.p_bolts); // edge distance
    const m_cf = 0.5 * cfg.col_b - 0.5 * cfg.col_tw - 0.8 * cfg.col_r;

    // Effective lengths (Table 6.4)
    let l_eff_cf: number;
    if (isInner) {
      const l_eff_cp = 2 * Math.PI * m_cf;
      const l_eff_nc = 4 * m_cf + 1.25 * e_cf;
      l_eff_cf = Math.min(l_eff_cp, l_eff_nc, cfg.p_rows);
    } else {
      const l_eff_cp = 2 * Math.PI * m_cf;
      const l_eff_nc = 4 * m_cf + 1.25 * e_cf;
      l_eff_cf = Math.min(l_eff_cp, l_eff_nc);
    }

    const tStub_cf = calcTStubResistance(
      l_eff_cf, cfg.col_tf, m_cf, e_cf,
      F_tRd_bolt, cfg.nBoltsPerRow, cfg.col_fy, gamma_M0
    );

    // ─── End plate in bending (6.2.6.5) ──────────────────────────────────
    const e_ep = cfg.e_side;
    const m_ep = 0.5 * cfg.plate_bp - 0.5 * cfg.beam_tw - 0.8 * cfg.a_ew * Math.sqrt(2);

    // Effective lengths (Table 6.6)
    let l_eff_ep: number;
    if (isInner) {
      const l_eff_cp = 2 * Math.PI * m_ep;
      const l_eff_nc = 4 * m_ep + 1.25 * e_ep;
      l_eff_ep = Math.min(l_eff_cp, l_eff_nc, cfg.p_rows);
    } else {
      const l_eff_cp = 2 * Math.PI * m_ep;
      const l_eff_nc = 4 * m_ep + 1.25 * e_ep;
      l_eff_ep = Math.min(l_eff_cp, l_eff_nc);
    }

    const tStub_ep = calcTStubResistance(
      l_eff_ep, cfg.plate_tp, m_ep, e_ep,
      F_tRd_bolt, cfg.nBoltsPerRow, cfg.plate_fy, gamma_M0
    );

    // ─── Column web in transverse tension (6.2.6.3) ──────────────────────
    const b_eff_twc = l_eff_cf;
    const A_vc = cfg.col_h * cfg.col_tw; // simplified
    const omega_1 = 1 / Math.sqrt(1 + 1.3 * (b_eff_twc * cfg.col_tw / A_vc) ** 2);
    const omega = omega_1; // simplified (no transverse stiffeners)
    const F_t_wc_Rd = (omega * b_eff_twc * cfg.col_tw * cfg.col_fy) / (gamma_M0 * 1000); // kN

    // ─── Beam web in tension (6.2.6.8) ───────────────────────────────────
    const b_eff_twb = l_eff_ep;
    const F_t_wb_Rd = (b_eff_twb * cfg.beam_tw * cfg.beam_fy) / (gamma_M0 * 1000); // kN

    // ─── Effective resistance ────────────────────────────────────────────
    const F_tr_Rd = Math.min(tStub_cf.F_Rd, tStub_ep.F_Rd, F_t_wc_Rd, F_t_wb_Rd);

    let limitingComponent = 'Column flange';
    if (F_tr_Rd === tStub_ep.F_Rd) limitingComponent = 'End plate';
    if (F_tr_Rd === F_t_wc_Rd) limitingComponent = 'Column web tension';
    if (F_tr_Rd === F_t_wb_Rd) limitingComponent = 'Beam web tension';

    boltRowResults.push({
      row: i + 1,
      y_r,
      h_r,
      F_T_cf_Rd: tStub_cf.F_Rd,
      mode_cf: tStub_cf.mode,
      F_T_ep_Rd: tStub_ep.F_Rd,
      mode_ep: tStub_ep.mode,
      F_t_wc_Rd,
      F_t_wb_Rd,
      F_tr_Rd,
      limitingComponent,
    });
  }

  // ─── Column web panel in shear (6.2.6.1) ────────────────────────────────
  const A_vc = cfg.col_h * cfg.col_tw - 2 * cfg.col_b * cfg.col_tf + (cfg.col_tw + 2 * cfg.col_r) * cfg.col_tf;
  const V_wp_Rd = (0.9 * cfg.col_fy * A_vc) / (Math.sqrt(3) * gamma_M0 * 1000); // kN

  // ─── Column web in transverse compression (6.2.6.2) ─────────────────────
  const b_eff_cwc = cfg.beam_tf + 2 * Math.sqrt(2) * cfg.a_ef + 5 * (cfg.col_tf + cfg.col_r);
  const d_wc = cfg.col_h - 2 * (cfg.col_tf + cfg.col_r);
  const lambda_p = 0.932 * Math.sqrt((b_eff_cwc * d_wc * cfg.col_fy) / (210000 * cfg.col_tw * cfg.col_tw));
  const rho = lambda_p <= 0.72 ? 1.0 : (lambda_p - 0.2) / (lambda_p * lambda_p);
  const omega_cwc = 1 / Math.sqrt(1 + 1.3 * (b_eff_cwc * cfg.col_tw / A_vc) ** 2);
  const k_wc = 1.0; // assuming sigma_com,Ed < 0.7 * f_y,wc
  const F_c_wc_Rd = (omega_cwc * k_wc * rho * b_eff_cwc * cfg.col_tw * cfg.col_fy) / (gamma_M1 * 1000); // kN

  // ─── Beam flange and web in compression (6.2.6.7) ───────────────────────
  const M_c_Rd = (cfg.beam_Wpl * cfg.beam_fy) / (gamma_M0 * 1e6); // kNm
  const F_c_fb_Rd = (M_c_Rd * 1000) / (cfg.beam_h - cfg.beam_tf); // kN

  // ─── Moment resistance (6.2.7.2) ────────────────────────────────────────
  // Redistribute forces considering compression limit
  const F_c_Rd = Math.min(F_c_wc_Rd, F_c_fb_Rd);

  let sumF = 0;
  let M_jRd = 0;
  for (const row of boltRowResults) {
    const availableCompression = F_c_Rd - sumF;
    const F_tr = Math.min(row.F_tr_Rd, availableCompression);
    sumF += F_tr;
    M_jRd += F_tr * row.h_r / 1000; // kNm
  }

  // ─── Shear resistance ───────────────────────────────────────────────────
  // Bearing resistance (Table 3.4)
  const e_1 = cfg.e_top; // end distance
  const e_2 = cfg.e_side;
  const p_1 = cfg.p_rows;
  const p_2 = cfg.p_bolts;

  const k_1_inner = Math.min(2.8 * e_2 / bolt.d_0 - 1.7, 1.4 * p_2 / bolt.d_0 - 1.7, 2.5);
  const alpha_d = Math.min(e_1 / (3 * bolt.d_0), p_1 / (3 * bolt.d_0) - 0.25, boltCls.f_ub / cfg.plate_fu, 1.0);
  const alpha_b = Math.min(alpha_d, boltCls.f_ub / cfg.plate_fu, 1.0);
  const F_b_Rd = (k_1_inner * alpha_b * cfg.plate_fu * bolt.diameter * cfg.plate_tp) / (gamma_M2 * 1000); // kN

  // Total shear resistance (2 shear planes per bolt, all bolts)
  const n_total_bolts = cfg.nBoltRows * cfg.nBoltsPerRow;
  const V_Rd = Math.min(
    n_total_bolts * 2 * F_v_Rd,      // bolt shear
    n_total_bolts * F_b_Rd            // bearing
  );

  // ─── Weld checks ────────────────────────────────────────────────────────
  const a_ef_min = 0.46 * cfg.beam_tf; // minimum flange weld
  const a_ew_min = 0.46 * cfg.beam_tw; // minimum web weld
  const weld_flange_ok = cfg.a_ef >= a_ef_min;
  const weld_web_ok = cfg.a_ew >= a_ew_min;

  // ─── Rotational stiffness (6.3.1) ───────────────────────────────────────
  const E = 210000; // MPa

  // Stiffness coefficients (Table 6.11)
  const k_coefficients: number[] = [];

  // k1: column web panel in shear
  const k_1 = (0.38 * A_vc) / (1.0 * (cfg.beam_h - cfg.beam_tf)); // z = h - tf approximation
  k_coefficients.push(k_1);

  // k2: column web in compression
  const k_2 = (0.7 * b_eff_cwc * cfg.col_tw) / (cfg.col_h - 2 * cfg.col_tf);
  k_coefficients.push(k_2);

  // For each bolt row: k3, k4, k5, k10
  for (const row of boltRowResults) {
    // k3: column web in tension
    const k_3 = (0.7 * row.h_r * cfg.col_tw) / (cfg.col_h - 2 * cfg.col_tf);

    // k4: column flange in bending (simplified)
    const m_cf = 0.5 * cfg.col_b - 0.5 * cfg.col_tw - 0.8 * cfg.col_r;
    const k_4 = (0.9 * row.h_r * cfg.col_tf ** 3) / (m_cf ** 3);

    // k5: end plate in bending (simplified)
    const m_ep = 0.5 * cfg.plate_bp - 0.5 * cfg.beam_tw - 0.8 * cfg.a_ew * Math.sqrt(2);
    const k_5 = (0.9 * row.h_r * cfg.plate_tp ** 3) / (m_ep ** 3);

    // k10: bolts in tension
    const L_b = cfg.plate_tp + cfg.col_tf + 0.5 * (bolt.diameter + bolt.diameter);
    const k_10 = (1.6 * bolt.A_s) / L_b;

    // Effective stiffness for this row
    const inv_k_eff = 1/k_3 + 1/k_4 + 1/k_5 + 1/k_10;
    k_coefficients.push(1/inv_k_eff);
  }

  // Equivalent lever arm
  const z_eq = boltRowResults.length > 0
    ? boltRowResults.reduce((sum, r) => sum + r.h_r, 0) / boltRowResults.length
    : cfg.beam_h - cfg.beam_tf;

  // Sum of inverse stiffnesses
  const sum_inv_k = k_coefficients.reduce((sum, k) => sum + 1/k, 0);

  // Initial rotational stiffness
  const S_j_ini = (E * z_eq * z_eq) / sum_inv_k / 1e6; // kNm/rad

  // Secant stiffness (simplified: S_j = S_j_ini / eta, eta depends on M_Ed/M_j,Rd)
  const mu = cfg.M_Ed / M_jRd;
  const psi = 2.7; // for bolted end-plate connections
  const eta = mu <= 2/3 ? 1.0 : (1.5 * mu) ** psi;
  const S_j = S_j_ini / Math.max(1, eta);

  // ─── Classification (5.2.2) ─────────────────────────────────────────────
  const E_Ib_Lb = (E * cfg.beam_Iy) / cfg.beamLength; // E*Ib/Lb
  const S_j_rigid = 25 * E_Ib_Lb / 1e6; // kNm/rad (for unbraced frames)
  const S_j_pinned = 0.5 * E_Ib_Lb / 1e6; // kNm/rad

  let classification: 'rigid' | 'semi-rigid' | 'pinned';
  if (S_j_ini >= S_j_rigid) {
    classification = 'rigid';
  } else if (S_j_ini >= S_j_pinned) {
    classification = 'semi-rigid';
  } else {
    classification = 'pinned';
  }

  // Characteristic rotations
  const phi_Xd = (2/3 * M_jRd) / S_j_ini; // rotation at 2/3 of moment resistance
  const phi_Cd = M_jRd / S_j_ini; // rotation at full moment resistance

  // ─── Component checks summary ───────────────────────────────────────────
  components.push({
    name: 'Moment resistance',
    article: '6.2.7',
    resistance: M_jRd,
    demand: cfg.M_Ed,
    UC: cfg.M_Ed / M_jRd,
    status: cfg.M_Ed <= M_jRd ? 'OK' : 'FAIL',
  });

  components.push({
    name: 'Column web panel shear',
    article: '6.2.6.1',
    resistance: V_wp_Rd,
    demand: cfg.V_Ed,
    UC: cfg.V_Ed / V_wp_Rd,
    status: cfg.V_Ed <= V_wp_Rd ? 'OK' : 'FAIL',
  });

  components.push({
    name: 'Column web compression',
    article: '6.2.6.2',
    resistance: F_c_wc_Rd,
    demand: sumF,
    UC: sumF / F_c_wc_Rd,
    status: sumF <= F_c_wc_Rd ? 'OK' : 'FAIL',
  });

  components.push({
    name: 'Beam flange compression',
    article: '6.2.6.7',
    resistance: F_c_fb_Rd,
    demand: sumF,
    UC: sumF / F_c_fb_Rd,
    status: sumF <= F_c_fb_Rd ? 'OK' : 'FAIL',
  });

  components.push({
    name: 'Bolt shear',
    article: 'Table 3.4',
    resistance: V_Rd,
    demand: cfg.V_Ed,
    UC: cfg.V_Ed / V_Rd,
    status: cfg.V_Ed <= V_Rd ? 'OK' : 'FAIL',
  });

  components.push({
    name: 'Flange weld',
    article: '4.5',
    resistance: cfg.a_ef,
    demand: a_ef_min,
    UC: a_ef_min / cfg.a_ef,
    status: weld_flange_ok ? 'OK' : 'FAIL',
  });

  components.push({
    name: 'Web weld',
    article: '4.5',
    resistance: cfg.a_ew,
    demand: a_ew_min,
    UC: a_ew_min / cfg.a_ew,
    status: weld_web_ok ? 'OK' : 'FAIL',
  });

  // ─── Overall result ─────────────────────────────────────────────────────
  const UC_M = cfg.M_Ed / M_jRd;
  const UC_V = cfg.V_Ed / V_Rd;
  const UC_max = Math.max(...components.map(c => c.UC));

  const failingComponents = components.filter(c => c.status === 'FAIL');
  const governingCheck = failingComponents.length > 0
    ? failingComponents[0].name
    : components.reduce((max, c) => c.UC > max.UC ? c : max, components[0]).name;

  return {
    M_jRd,
    compressionCentre,
    V_wp_Rd,
    F_c_wc_Rd,
    F_c_fb_Rd,
    boltRows: boltRowResults,
    F_v_Rd,
    F_b_Rd,
    V_Rd,
    weld_flange_ok,
    weld_web_ok,
    a_ef_min,
    a_ew_min,
    S_j_ini,
    S_j,
    classification,
    S_j_rigid,
    S_j_pinned,
    phi_Xd,
    phi_Cd,
    components,
    UC_M,
    UC_V,
    UC_max,
    governingCheck,
    status: UC_max <= 1.0 ? 'OK' : 'FAIL',
  };
}

// ─── Utility exports ────────────────────────────────────────────────────────

export function getAvailableBoltDiameters(): number[] {
  return Object.keys(BOLT_TABLE).map(Number);
}

export function getAvailableBoltClasses(): string[] {
  return Object.keys(BOLT_CLASSES);
}

export function getBoltData(diameter: number): IBoltData | undefined {
  return BOLT_TABLE[diameter];
}

export function getBoltClass(className: string): IBoltClass | undefined {
  return BOLT_CLASSES[className];
}

// ─── Default configuration helper ───────────────────────────────────────────

export function createDefaultConfig(
  beamProfile: { h: number; b: number; tw: number; tf: number; r: number; A: number; Iy: number; Wpl: number; name: string },
  colProfile: { h: number; b: number; tw: number; tf: number; r: number; name: string },
  M_Ed: number,
  V_Ed: number,
  beamLength: number = 5000
): IMomentConnectionConfig {
  const fy = 235;
  const fu = 360;

  return {
    beam_h: beamProfile.h,
    beam_b: beamProfile.b,
    beam_tw: beamProfile.tw,
    beam_tf: beamProfile.tf,
    beam_r: beamProfile.r,
    beam_fy: fy,
    beam_fu: fu,
    beam_A: beamProfile.A,
    beam_Iy: beamProfile.Iy,
    beam_Wpl: beamProfile.Wpl,
    beamProfileName: beamProfile.name,
    beamLength,

    col_h: colProfile.h,
    col_b: colProfile.b,
    col_tw: colProfile.tw,
    col_tf: colProfile.tf,
    col_r: colProfile.r,
    col_fy: fy,
    col_fu: fu,
    colProfileName: colProfile.name,

    boltDiameter: 16,
    boltClass: '8.8',
    nBoltRows: 2,
    nBoltsPerRow: 2,

    e_top: 40,
    p_rows: 100,
    p_bolts: 60,
    e_side: 50,

    plate_tp: 15,
    plate_bp: Math.max(beamProfile.b + 20, 160),
    plate_hp: beamProfile.h + 80,
    plate_fy: fy,
    plate_fu: fu,

    a_ef: 7,
    a_ew: 4,

    M_Ed,
    V_Ed,

    gamma_M0: 1.0,
    gamma_M1: 1.0,
    gamma_M2: 1.25,
  };
}
