/**
 * NonlinearMaterial.ts - Material nonlinearity for FNL analysis
 *
 * Implements moment-curvature relationships for:
 * - Steel sections (elastic-plastic with strain hardening)
 * - Reinforced concrete sections (fiber model)
 *
 * Used by NonlinearSolver for physically nonlinear frame analysis.
 *
 * WAT HIER NIET (MEER) STAAT — en waarom dat zo hoort te blijven.
 * Dit bestand droeg ook een tweede model voor de GESCHEURDE buigstijfheid van
 * beton: een scheurmoment, een gescheurde I, een interpolatie met tension
 * stiffening en een eigen opdeling van de staaf in segmenten
 * (`ICrackedSectionState`, `calculateCrackingMoment`, `calculateCrackedI`,
 * `calculateEffectiveI`, `determineBeamSplitPoints`, `calculateBeamSegments`).
 * Dat model is verwijderd. Het werd nergens aangezet — `materialNonlinear`
 * staat in de hele app op false — en het verzon zijn eigen invoer: de
 * wapening werd geschat op "0,5 % van het betonoppervlak" en b en h uit A en
 * I teruggerekend. Naast de rekenkern (NEN-EN 1992-1-1, M-N-κ met de
 * werkelijke wapeningskorf) zou dat twee antwoorden op dezelfde vraag geven.
 *
 * De gescheurde stijfheid komt uitsluitend uit de kern, via de
 * segmentstijfheidsdienst; de lus die dat aan de solver knoopt staat in
 * `lib/betonStijfheid.ts` en zet de stijfheid per segment als `section.I` van
 * een deelelement. Voeg hier dus geen betonstijfheid meer toe.
 */

import { IBeamSection } from '../fem/types';

// ============================================================================
// Material Properties
// ============================================================================

export interface ISteelMaterial {
  fy: number;      // Yield strength (Pa)
  fu: number;      // Ultimate strength (Pa)
  E: number;       // Young's modulus (Pa)
  Esh: number;     // Strain hardening modulus (Pa), typically E/100
  epsilonY: number;  // Yield strain = fy/E
  epsilonU: number;  // Ultimate strain (typically 0.15-0.20)
}

export interface IConcreteMaterial {
  fck: number;     // Characteristic compressive strength (Pa)
  fcd: number;     // Design compressive strength (Pa)
  fctm: number;    // Mean tensile strength (Pa)
  Ecm: number;     // Secant modulus (Pa)
  epsilonC2: number; // Strain at peak stress (typically 0.002)
  epsilonCU2: number; // Ultimate strain (typically 0.0035)
}

export interface IRebarLayer {
  As: number;      // Area of reinforcement (m²)
  d: number;       // Distance from compression face (m)
  fy: number;      // Yield strength (Pa)
  Es: number;      // Young's modulus (Pa)
}

// ============================================================================
// Section State (for tracking plastic behavior)
// ============================================================================

export interface ISectionState {
  curvature: number;           // Current curvature (1/m)
  moment: number;              // Current moment (Nm)
  tangentStiffness: number;    // Current EI_tangent (Nm²)
  isYielded: boolean;          // Has section yielded?
  plasticRotation: number;     // Accumulated plastic rotation (rad)
  yieldMoment: number;         // Moment at first yield (Nm)
  plasticMoment: number;       // Full plastic moment (Nm)
  maxCurvature: number;        // Maximum curvature reached
}

// ============================================================================
// Steel Moment-Curvature
// ============================================================================

/**
 * Create default steel material from yield strength
 */
export function createSteelMaterial(fy: number): ISteelMaterial {
  const E = 210e9; // Pa
  return {
    fy,
    fu: fy * 1.25, // Approximate
    E,
    Esh: E / 100,
    epsilonY: fy / E,
    epsilonU: 0.15,
  };
}

/**
 * Calculate moment for given curvature - Steel I-section
 * Uses fiber model with elastic-plastic material
 *
 * @param kappa Curvature (1/m)
 * @param section Beam section properties
 * @param steel Steel material properties
 * @returns { M, EI_tangent }
 */
export function steelMomentCurvature(
  kappa: number,
  section: IBeamSection,
  steel: ISteelMaterial
): { M: number; EI_tangent: number } {
  const { h, b, tw, tf } = section;
  const { fy, E, Esh } = steel;

  // For I-sections, use simplified fiber model
  // Divide section into layers (flanges + web)
  const nLayers = 20;
  const layers: { y: number; A: number }[] = [];

  // Effective dimensions
  const bFlange = b ?? h / 3;
  const tFlange = tf ?? h / 10;
  const tWeb = tw ?? h / 20;
  const hWeb = h - 2 * tFlange;

  // Top flange layers
  const nFlangeL = 4;
  for (let i = 0; i < nFlangeL; i++) {
    const y = h / 2 - tFlange / 2 - (i / (nFlangeL - 1) - 0.5) * tFlange;
    layers.push({ y, A: bFlange * tFlange / nFlangeL });
  }

  // Web layers
  const nWebL = nLayers - 2 * nFlangeL;
  for (let i = 0; i < nWebL; i++) {
    const y = (hWeb / 2) * (1 - 2 * i / (nWebL - 1));
    layers.push({ y, A: tWeb * hWeb / nWebL });
  }

  // Bottom flange layers
  for (let i = 0; i < nFlangeL; i++) {
    const y = -h / 2 + tFlange / 2 + (i / (nFlangeL - 1) - 0.5) * tFlange;
    layers.push({ y, A: bFlange * tFlange / nFlangeL });
  }

  // Integrate stress over section
  let M = 0;
  let EI_tangent = 0;

  for (const layer of layers) {
    const epsilon = kappa * layer.y;
    const epsilonY = fy / E;

    let sigma: number;
    let Et: number; // Tangent modulus

    if (Math.abs(epsilon) <= epsilonY) {
      // Elastic
      sigma = E * epsilon;
      Et = E;
    } else {
      // Plastic with strain hardening
      const sign = epsilon > 0 ? 1 : -1;
      const epsilonPlastic = Math.abs(epsilon) - epsilonY;
      sigma = sign * (fy + Esh * epsilonPlastic);
      Et = Esh;
    }

    M += sigma * layer.A * layer.y;
    EI_tangent += Et * layer.A * layer.y * layer.y;
  }

  return { M, EI_tangent };
}

/**
 * Calculate yield and plastic moment for steel section
 */
export function steelSectionCapacity(
  section: IBeamSection,
  steel: ISteelMaterial
): { My: number; Mp: number } {
  const Wy = section.Wy ?? section.I / (section.h / 2);
  const Wpl = section.Wply ?? Wy * 1.15; // Shape factor ~1.15 for I-sections

  const My = Wy * steel.fy;
  const Mp = Wpl * steel.fy;

  return { My, Mp };
}

// ============================================================================
// Concrete Moment-Curvature
// ============================================================================

/**
 * Create default concrete material from characteristic strength
 */
export function createConcreteMaterial(fck: number): IConcreteMaterial {
  const fcd = fck / 1.5; // γc = 1.5
  const fctm = 0.3 * Math.pow(fck / 1e6, 2/3) * 1e6; // EC2 formula
  const Ecm = 22000 * Math.pow(fck / 1e6 / 10, 0.3) * 1e6;

  return {
    fck,
    fcd,
    fctm,
    Ecm,
    epsilonC2: 0.002,
    epsilonCU2: 0.0035,
  };
}

/**
 * Parabola-rectangle stress-strain for concrete (EC2 Fig 3.3)
 */
function concreteStress(epsilon: number, concrete: IConcreteMaterial): { sigma: number; Et: number } {
  const { fcd, epsilonC2, epsilonCU2 } = concrete;

  if (epsilon >= 0) {
    // Tension - cracked, no contribution
    return { sigma: 0, Et: 0 };
  }

  const epsC = -epsilon; // Make positive for compression

  if (epsC <= epsilonC2) {
    // Parabolic part
    const n = 2; // EC2 exponent
    const ratio = epsC / epsilonC2;
    const sigma = -fcd * (1 - Math.pow(1 - ratio, n));
    const Et = fcd * n * Math.pow(1 - ratio, n - 1) / epsilonC2;
    return { sigma, Et };
  } else if (epsC <= epsilonCU2) {
    // Constant part
    return { sigma: -fcd, Et: 0 };
  } else {
    // Crushing
    return { sigma: 0, Et: 0 };
  }
}

/**
 * Steel reinforcement stress-strain (bilinear)
 */
function rebarStress(epsilon: number, rebar: IRebarLayer): { sigma: number; Et: number } {
  const epsilonY = rebar.fy / rebar.Es;

  if (Math.abs(epsilon) <= epsilonY) {
    return { sigma: rebar.Es * epsilon, Et: rebar.Es };
  } else {
    // Yielded (no hardening for simplicity)
    const sign = epsilon > 0 ? 1 : -1;
    return { sigma: sign * rebar.fy, Et: 0 };
  }
}

/**
 * Calculate moment for given curvature - Reinforced concrete section
 * Uses fiber model with cracked concrete + reinforcement
 *
 * @param kappa Curvature (1/m)
 * @param b Section width (m)
 * @param h Section height (m)
 * @param concrete Concrete material
 * @param rebarTop Top reinforcement layer
 * @param rebarBot Bottom reinforcement layer
 * @param neutralAxisGuess Initial guess for neutral axis from top (m)
 * @returns { M, EI_tangent, xNA }
 */
export function concreteMomentCurvature(
  kappa: number,
  b: number,
  h: number,
  concrete: IConcreteMaterial,
  rebarTop: IRebarLayer,
  rebarBot: IRebarLayer,
  neutralAxisGuess?: number
): { M: number; EI_tangent: number; xNA: number } {
  // Fiber model: divide concrete into layers
  const nLayers = 20;
  const layerH = h / nLayers;

  // Find neutral axis by force equilibrium (iterate)
  // xNA = distance from top (compression) face to neutral axis
  let xNA = neutralAxisGuess ?? h / 2;

  // Newton-Raphson to find xNA such that sum of forces = 0
  for (let iter = 0; iter < 20; iter++) {
    let N = 0;      // Total axial force
    let dN_dxNA = 0; // Derivative for Newton-Raphson

    // Concrete layers
    for (let i = 0; i < nLayers; i++) {
      const yFromTop = (i + 0.5) * layerH;
      const yFromNA = xNA - yFromTop; // +ve = compression side
      const epsilon = kappa * yFromNA;

      const { sigma, Et } = concreteStress(epsilon, concrete);
      const dA = b * layerH;

      N += sigma * dA;
      // dN/dxNA = d(sigma)/d(epsilon) * d(epsilon)/d(xNA) * dA
      // d(epsilon)/d(xNA) = kappa
      dN_dxNA += Et * kappa * dA;
    }

    // Top reinforcement
    {
      const yFromNA = xNA - rebarTop.d;
      const epsilon = kappa * yFromNA;
      const { sigma, Et } = rebarStress(epsilon, rebarTop);
      N += sigma * rebarTop.As;
      dN_dxNA += Et * kappa * rebarTop.As;
    }

    // Bottom reinforcement
    {
      const yFromNA = xNA - rebarBot.d;
      const epsilon = kappa * yFromNA;
      const { sigma, Et } = rebarStress(epsilon, rebarBot);
      N += sigma * rebarBot.As;
      dN_dxNA += Et * kappa * rebarBot.As;
    }

    // Newton-Raphson update
    if (Math.abs(dN_dxNA) < 1e-20) break;
    const delta = -N / dN_dxNA;
    xNA += delta;

    // Clamp xNA to reasonable range
    xNA = Math.max(0.01 * h, Math.min(0.99 * h, xNA));

    if (Math.abs(N) < 1 && Math.abs(delta) < 1e-6) break;
  }

  // Now compute moment and tangent stiffness with converged xNA
  let M = 0;
  let EI_tangent = 0;

  // Reference point for moment: centroid of section (h/2 from top)
  const yRef = h / 2;

  // Concrete layers
  for (let i = 0; i < nLayers; i++) {
    const yFromTop = (i + 0.5) * layerH;
    const yFromNA = xNA - yFromTop;
    const epsilon = kappa * yFromNA;

    const { sigma, Et } = concreteStress(epsilon, concrete);
    const dA = b * layerH;
    const lever = yRef - yFromTop; // Distance from centroid

    M += sigma * dA * lever;
    EI_tangent += Et * dA * yFromNA * yFromNA;
  }

  // Top reinforcement
  {
    const yFromNA = xNA - rebarTop.d;
    const epsilon = kappa * yFromNA;
    const { sigma, Et } = rebarStress(epsilon, rebarTop);
    const lever = yRef - rebarTop.d;

    M += sigma * rebarTop.As * lever;
    EI_tangent += Et * rebarTop.As * yFromNA * yFromNA;
  }

  // Bottom reinforcement
  {
    const yFromNA = xNA - rebarBot.d;
    const epsilon = kappa * yFromNA;
    const { sigma, Et } = rebarStress(epsilon, rebarBot);
    const lever = yRef - rebarBot.d;

    M += sigma * rebarBot.As * lever;
    EI_tangent += Et * rebarBot.As * yFromNA * yFromNA;
  }

  return { M, EI_tangent, xNA };
}

/**
 * Calculate yield and ultimate moment for RC section
 */
export function concreteSectionCapacity(
  b: number,
  _h: number,  // Not used in simplified calculation
  concrete: IConcreteMaterial,
  rebarBot: IRebarLayer
): { My: number; Mu: number } {
  // Simplified calculation
  const d = rebarBot.d;
  const As = rebarBot.As;
  const fyd = rebarBot.fy;
  const fcd = concrete.fcd;

  // Lever arm (approximate)
  const z = 0.9 * d;

  // Yield moment (when steel yields)
  const My = As * fyd * z;

  // Ultimate moment (assuming compression block)
  const x = As * fyd / (0.8 * b * fcd);
  const zU = d - 0.4 * x;
  const Mu = As * fyd * zU;

  return { My, Mu };
}

// ============================================================================
// Section State Management
// ============================================================================

/**
 * Initialize section state for a beam element
 */
export function initSectionState(
  section: IBeamSection,
  materialType: 'steel' | 'concrete',
  steel?: ISteelMaterial,
  concrete?: IConcreteMaterial,
  rebarBot?: IRebarLayer
): ISectionState {
  let My = 0;
  let Mp = 0;

  if (materialType === 'steel' && steel) {
    const cap = steelSectionCapacity(section, steel);
    My = cap.My;
    Mp = cap.Mp;
  } else if (materialType === 'concrete' && concrete && rebarBot) {
    const cap = concreteSectionCapacity(section.b ?? 0.3, section.h, concrete, rebarBot);
    My = cap.My;
    Mp = cap.Mu;
  }

  return {
    curvature: 0,
    moment: 0,
    tangentStiffness: section.I * (steel?.E ?? concrete?.Ecm ?? 210e9),
    isYielded: false,
    plasticRotation: 0,
    yieldMoment: My,
    plasticMoment: Mp,
    maxCurvature: 0,
  };
}

/**
 * Update section state for new curvature
 */
export function updateSectionState(
  state: ISectionState,
  kappa: number,
  section: IBeamSection,
  materialType: 'steel' | 'concrete',
  steel?: ISteelMaterial,
  concrete?: IConcreteMaterial,
  rebarTop?: IRebarLayer,
  rebarBot?: IRebarLayer
): ISectionState {
  let M: number;
  let EI_tangent: number;

  if (materialType === 'steel' && steel) {
    const result = steelMomentCurvature(kappa, section, steel);
    M = result.M;
    EI_tangent = result.EI_tangent;
  } else if (materialType === 'concrete' && concrete && rebarTop && rebarBot) {
    const result = concreteMomentCurvature(
      kappa,
      section.b ?? 0.3,
      section.h,
      concrete,
      rebarTop,
      rebarBot
    );
    M = result.M;
    EI_tangent = result.EI_tangent;
  } else {
    // Linear elastic fallback
    const E = steel?.E ?? concrete?.Ecm ?? 210e9;
    M = E * section.I * kappa;
    EI_tangent = E * section.I;
  }

  const isYielded = Math.abs(M) >= state.yieldMoment;
  const maxCurvature = Math.max(state.maxCurvature, Math.abs(kappa));

  return {
    ...state,
    curvature: kappa,
    moment: M,
    tangentStiffness: EI_tangent,
    isYielded,
    maxCurvature,
  };
}


// ============================================================================
// M-κ Diagram Generation (for visualization)
// ============================================================================

export interface IMKappaPoint {
  kappa: number;  // Curvature (1/m)
  M: number;      // Moment (Nm)
}

/**
 * Generate M-κ diagram points for steel section
 */
export function generateSteelMKappaDiagram(
  section: IBeamSection,
  steel: ISteelMaterial,
  nPoints: number = 50
): IMKappaPoint[] {
  const { My } = steelSectionCapacity(section, steel);
  const kappaY = My / (steel.E * section.I);
  const kappaMax = kappaY * 10; // Go to 10x yield curvature

  const points: IMKappaPoint[] = [];

  for (let i = 0; i <= nPoints; i++) {
    const kappa = (i / nPoints) * kappaMax;
    const { M } = steelMomentCurvature(kappa, section, steel);
    points.push({ kappa, M });
  }

  return points;
}

/**
 * Generate M-κ diagram points for RC section
 */
export function generateConcreteMKappaDiagram(
  b: number,
  h: number,
  concrete: IConcreteMaterial,
  rebarTop: IRebarLayer,
  rebarBot: IRebarLayer,
  nPoints: number = 50
): IMKappaPoint[] {
  // Estimate yield curvature
  const d = rebarBot.d;
  const epsilonY = rebarBot.fy / rebarBot.Es;
  const kappaY = epsilonY / (d * 0.7); // Approximate
  const kappaMax = kappaY * 15;

  const points: IMKappaPoint[] = [];
  let xNA = h / 2;

  for (let i = 0; i <= nPoints; i++) {
    const kappa = (i / nPoints) * kappaMax;
    const result = concreteMomentCurvature(kappa, b, h, concrete, rebarTop, rebarBot, xNA);
    points.push({ kappa, M: result.M });
    xNA = result.xNA; // Use converged NA for next point
  }

  return points;
}
