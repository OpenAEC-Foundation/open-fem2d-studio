import { INode, IBeamElement, IBeamForces, IMaterial, getReleasedLocalDofs, getBeamDistributedLoads } from './types';
import {
  calculateBeamLength,
  calculateBeamAngle,
  calculateBeamLocalStiffness,
  transformGlobalToLocal,
  calculateTrapezoidalLoadVector,
  calculatePartialTrapezoidalLoadVector,
  calculateDistributedLoadVector,
  calculatePartialDistributedLoadVector,
  projectDistributedLoadToLocal,
} from './Beam';
import { applyEndReleases } from '../solver/Assembler';
import { calculateBeamThermalLocalForces } from './ThermalLoad';

const NUM_STATIONS = 21; // Number of points along beam for diagrams

/**
 * Klein dicht stelsel A·x = b (n ≤ 6) via Gauss-eliminatie met partiële
 * pivotering. Retourneert null bij een (bijna) singuliere A — de aanroeper
 * beslist dan zelf wat een veilige terugval is. A en b worden niet gemuteerd.
 */
function solveKleinStelsel(Ain: number[][], bin: number[]): number[] | null {
  const n = bin.length;
  const A = Ain.map(row => row.slice());
  const b = bin.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-20) return null;
    if (piv !== col) {
      [A[piv], A[col]] = [A[col], A[piv]];
      [b[piv], b[col]] = [b[col], b[piv]];
    }
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

/** Eén verdeelde last, geprojecteerd naar lokale staafcomponenten. */
interface ILocalDistLoad {
  qxS: number; qyS: number;   // waarde op het lastBEGIN (lokaal)
  qxE: number; qyE: number;   // waarde op het lastEINDE (lokaal)
  startT: number; endT: number; // fracties 0..1 op de staaf
}

/**
 * EXACTE particuliere oplossing (ingeklemde randen: w = w' = 0 en u = 0 op
 * beide staafeinden) voor een PARTIËLE, eventueel trapeziumvormige last op
 * [a, b] ⊂ [0, L] — stuksgewijs: vóór, onder en na het belaste deel.
 *
 * Afleiding (transversaal): EI·w'''' = q(x) met q(x) = qS + m·(x−a) op
 * [a, b] en 0 daarbuiten (m = (qE−qS)/(b−a)). Vier keer integreren vanaf
 * x = 0 met w(0) = w'(0) = 0 geeft
 *   EI·w(x) = V₀·x³/6 + M₀·x²/2 + R₃(x),
 *   EI·w'(x) = V₀·x²/2 + M₀·x + R₂(x),
 * met de lastintegralen (u₁ = x − min(x, b), u₂ = x − a, beide 0 vóór a):
 *   R₃(x) = ∫ₐ^{min(x,b)} q(s)·(x−s)³/6 ds
 *         = ([qS + m(x−a)]·(u₂⁴−u₁⁴)/4 − m·(u₂⁵−u₁⁵)/5) / 6,
 *   R₂(x) = ([qS + m(x−a)]·(u₂³−u₁³)/3 − m·(u₂⁴−u₁⁴)/4) / 2.
 * De randvoorwaarden w(L) = w'(L) = 0 leveren
 *   V₀ = (12·R₃(L) − 6·L·R₂(L)) / L³,   M₀ = (−R₂(L) − V₀·L²/2) / L.
 * Voor a = 0, b = L reduceert dit exact tot de bekende gesloten vormen
 * q·x²(L−x)²/(24EI) (uniform) en Δq·(x⁵/(120L) − Lx³/40 + L²x²/60)/EI
 * (driehoek) — algebraïsch geverifieerd.
 *
 * Axiaal analoog: EA·u'' = −qx(x), u(0) = u(L) = 0:
 *   EA·u(x) = C₁·x − Rx₁(x),  Rx₁(x) = [qxS + mx(x−a)]·(u₂²−u₁²)/2
 *             − mx·(u₂³−u₁³)/3,  C₁ = Rx₁(L)/L.
 */
function makePartialParticular(
  L: number, EI: number, EA: number, ld: ILocalDistLoad,
): { wAt: (x: number) => number; uAt: (x: number) => number } {
  const a = ld.startT * L;
  const b = ld.endT * L;
  const span = b - a;
  if (span <= 0 || EI <= 0 || EA <= 0) {
    return { wAt: () => 0, uAt: () => 0 };
  }
  const my = (ld.qyE - ld.qyS) / span;
  const mx = (ld.qxE - ld.qxS) / span;

  const R3 = (x: number): number => {
    if (x <= a) return 0;
    const u1 = x - Math.min(x, b);
    const u2 = x - a;
    const c = ld.qyS + my * (x - a);
    return (c * (u2 ** 4 - u1 ** 4) / 4 - my * (u2 ** 5 - u1 ** 5) / 5) / 6;
  };
  const R2 = (x: number): number => {
    if (x <= a) return 0;
    const u1 = x - Math.min(x, b);
    const u2 = x - a;
    const c = ld.qyS + my * (x - a);
    return (c * (u2 ** 3 - u1 ** 3) / 3 - my * (u2 ** 4 - u1 ** 4) / 4) / 2;
  };
  const V0 = (12 * R3(L) - 6 * L * R2(L)) / (L ** 3);
  const M0 = (-R2(L) - V0 * L * L / 2) / L;

  const Rx1 = (x: number): number => {
    if (x <= a) return 0;
    const u1 = x - Math.min(x, b);
    const u2 = x - a;
    const cx = ld.qxS + mx * (x - a);
    return cx * (u2 * u2 - u1 * u1) / 2 - mx * (u2 ** 3 - u1 ** 3) / 3;
  };
  const C1 = Rx1(L) / L;

  return {
    wAt: (x: number) => (V0 * x ** 3 / 6 + M0 * x * x / 2 + R3(x)) / EI,
    uAt: (x: number) => (C1 * x - Rx1(x)) / EA,
  };
}

/**
 * Calculate internal forces (N, V, M) for a beam element
 *
 * Sign conventions:
 * - N positive: tension
 * - V positive: causes clockwise rotation of element
 * - M positive: causes tension in bottom fiber (sagging)
 */
export function calculateBeamInternalForces(
  element: IBeamElement,
  n1: INode,
  n2: INode,
  material: IMaterial,
  globalDisplacements: number[]
): IBeamForces {
  const L = calculateBeamLength(n1, n2);
  const angle = calculateBeamAngle(n1, n2);

  // Transform global displacements to local coordinates
  const localDisp = transformGlobalToLocal(globalDisplacements, angle);

  // Alle verdeelde lasten op deze staaf (enkelvoudig veld + deellasten-array),
  // per last geprojecteerd naar lokale componenten — zelfde operatievolgorde
  // als het vroegere één-last-pad (zie projectDistributedLoadToLocal).
  const dLoads: ILocalDistLoad[] = getBeamDistributedLoads(element).map(dl => {
    const p = projectDistributedLoadToLocal(dl, angle);
    return { qxS: p.qxS, qyS: p.qyS, qxE: p.qxE, qyE: p.qyE, startT: p.startT, endT: p.endT };
  });

  // Calculate local stiffness matrix
  const Kl = calculateBeamLocalStiffness(L, material.E, element.section.A, element.section.I);

  // Equivalente knoopkrachten: SOM over alle lasten, per last dezelfde
  // dispatch (uniform / trapezium / partieel) als voorheen.
  const equivalentNodalForces: number[] = [0, 0, 0, 0, 0, 0];
  for (const dl of dLoads) {
    const isTrap = dl.qxE !== dl.qxS || dl.qyE !== dl.qyS;
    const isPart = dl.startT > 0 || dl.endT < 1;
    let f: number[];
    if (isTrap) {
      f = isPart
        ? calculatePartialTrapezoidalLoadVector(L, dl.qxS, dl.qyS, dl.qxE, dl.qyE, dl.startT, dl.endT)
        : calculateTrapezoidalLoadVector(L, dl.qxS, dl.qyS, dl.qxE, dl.qyE);
    } else if (isPart) {
      f = calculatePartialDistributedLoadVector(L, dl.qxS, dl.qyS, dl.startT, dl.endT);
    } else {
      f = calculateDistributedLoadVector(L, dl.qxS, dl.qyS);
    }
    for (let i = 0; i < 6; i++) equivalentNodalForces[i] += f[i];
  }

  // Thermische equivalente knoopkrachten (lokaal) meenemen in F_eq zodat de
  // terugrekening f_intern = K·d − F_eq de MECHANISCHE snedekrachten geeft:
  //   N = E·A·(ε − α·ΔT)
  // Vrij uitzetbare staaf: ε = α·ΔT → N = 0; volledig verhinderd: ε = 0 →
  // |N| = E·A·α·ΔT (druk bij opwarming). Uniforme ΔT heeft géén invloed op
  // M(x) of w(x) — geen kromming — dus de deflectie-particulier blijft
  // ongewijzigd; gradient-ΔT levert via de eindmomenten in F_eq wél M.
  const thermalLocal = calculateBeamThermalLocalForces(element, material);
  for (let i = 0; i < 6; i++) {
    equivalentNodalForces[i] += thermalLocal[i];
  }

  // Apply static condensation for releases — must be done BEFORE computing
  // forces. This ensures moment = 0 at hinged ends (and N/V = 0 at Tx/Tz-
  // released ends) and correctly redistributes fixed-end forces from
  // distributed loads to the remaining DOFs.
  const releasedLocalDofs = getReleasedLocalDofs(element);

  // ── Werkelijke lokale eind-DOF's voor de verplaatsingskromme ──────────────
  // Bij een release is het eind-DOF van het ELEMENT niet gelijk aan het
  // knoop-DOF. Terugrekenen uit de nul-krachtvoorwaarde op de released
  // DOF's, met de ORIGINELE (niet-gecondenseerde) Kl en belastingvector:
  //   K_RR·d_R = F_R^eq − K_RC·d_C   (want interne kracht = K·d − F^eq = 0)
  // Algemeen klein stelsel (1..n released DOF's) met Gauss + partiële
  // pivotering; een singuliere K_RR (mechanisme, bv. dezelfde translatie aan
  // beide einden los) laat de knoopwaarden staan — de solve zelf is dan al
  // op een singulier stelsel gestrand. Moet vóór applyEndReleases gebeuren
  // omdat die Kl/F in-place muteert.
  const dLoc = localDisp.slice();
  if (releasedLocalDofs.length > 0) {
    const m = releasedLocalDofs.length;
    const A: number[][] = [];
    const b: number[] = [];
    for (let r = 0; r < m; r++) {
      const i = releasedLocalDofs[r];
      let rhs = equivalentNodalForces[i];
      for (let j = 0; j < 6; j++) {
        if (!releasedLocalDofs.includes(j)) rhs -= Kl.get(i, j) * dLoc[j];
      }
      b.push(rhs);
      A.push(releasedLocalDofs.map(jj => Kl.get(i, jj)));
    }
    const sol = solveKleinStelsel(A, b);
    if (sol) {
      for (let r = 0; r < m; r++) dLoc[releasedLocalDofs[r]] = sol[r];
    }
  }

  if (releasedLocalDofs.length > 0) {
    applyEndReleases(Kl, releasedLocalDofs, equivalentNodalForces);
  }

  // Calculate local element forces from displacements: f_local = K_condensed * d_local
  const localForces = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      localForces[i] += Kl.get(i, j) * localDisp[j];
    }
  }

  // Internal forces = condensed stiffness forces - condensed equivalent nodal forces
  for (let i = 0; i < 6; i++) {
    localForces[i] -= equivalentNodalForces[i];
  }

  const N1 = localForces[0];
  const V1 = localForces[1];
  const M1 = -localForces[2];
  const N2 = -localForces[3];
  const V2 = -localForces[4];
  const M2 = localForces[5];

  // Generate stations along beam for diagram plotting
  const stations: number[] = [];
  const normalForce: number[] = [];
  const shearForce: number[] = [];
  const bendingMoment: number[] = [];

  for (let i = 0; i < NUM_STATIONS; i++) {
    const x = (i / (NUM_STATIONS - 1)) * L;
    stations.push(x);

    // N(x) = N1 + ∫qx, V(x) = V1 + ∫qy, M(x) = M1 + V1·x + ∫qy·(x−s) —
    // stuksgewijs en gesommeerd over ALLE lasten. Per last dezelfde
    // integralen als voorheen; de Simpson-som over q(s)·(x−s) is voor een
    // lineaire q (integrand kwadratisch) exact — dus ook deellast-stations
    // zijn exact.
    let intQx = 0;
    let intQy = 0;
    let intQyMoment = 0;

    for (const dl of dLoads) {
      if (x <= dl.startT * L) continue;
      const loadStart = dl.startT * L;
      const loadEnd = Math.min(x, dl.endT * L);
      if (loadEnd <= loadStart) continue;
      const span = (dl.endT - dl.startT) * L;
      const tStart = 0; // at loadStart, t=0
      const tEnd = span > 0 ? (loadEnd - loadStart) / span : 0;
      // q(s) = qxS + (qxE - qxS) * ((s - loadStart) / span)
      // integral from loadStart to loadEnd = qxS*ds + (qxE-qxS)*ds*(tStart+tEnd)/2
      const ds = loadEnd - loadStart;
      intQx += dl.qxS * ds + (dl.qxE - dl.qxS) * ds * (tStart + tEnd) / 2;
      intQy += dl.qyS * ds + (dl.qyE - dl.qyS) * ds * (tStart + tEnd) / 2;

      // For moment: integral of qy(s) * (x - s) ds from loadStart to loadEnd
      // Using numerical integration (Simpson's rule, 10 intervals)
      const nSub = 10;
      const hSub = ds / nSub;
      let sum = 0;
      for (let k = 0; k <= nSub; k++) {
        const s = loadStart + k * hSub;
        const tK = span > 0 ? (s - loadStart) / span : 0;
        const qy_s = dl.qyS + (dl.qyE - dl.qyS) * tK;
        let w: number;
        if (k === 0 || k === nSub) w = 1;
        else if (k % 2 === 1) w = 4;
        else w = 2;
        sum += w * qy_s * (x - s);
      }
      intQyMoment += sum * hSub / 3;
    }

    const N_x = N1 + intQx;
    normalForce.push(N_x);

    const V_x = V1 + intQy;
    shearForce.push(V_x);

    const M_x = M1 + V1 * x + intQyMoment;
    bendingMoment.push(M_x);
  }

  // ── Veldverplaatsingen w(x) en u(x) op dezelfde stations ─────────────────
  // Totale lokale verplaatsing = homogeen deel + particulier deel:
  //  • Homogeen: Hermite-vormfuncties op de lokale eind-DOF's dLoc (voor
  //    scharnieren de teruggerekende element-eindrotatie, zie hierboven).
  //  • Particulier: de ingeklemde-ligger-oplossing (w = w' = 0, resp. u = 0
  //    op beide uiteinden) van de elementbelasting. Samen geeft dit de EXACTE
  //    Euler-Bernoulli-oplossing binnen het element.
  //
  // Tekenconventie: w positief in lokale +y (90° CCW vanaf de staafas
  // node1→node2) — dezelfde conventie als de knoopverplaatsingen (voor een
  // horizontale staaf is +y omhoog; doorhangen onder gravitatie is negatief).
  // Sagging-positieve M (bestaande conventie) hoort dus bij negatieve w.
  // u positief langs de staafas richting node2.
  //
  // GEDEKTE elementbelastingen (particulier deel): volledige-lengte uniforme
  // en trapeziumvormige q via de gesloten vormen hieronder, én PARTIËLE
  // (deellast-)q via de exacte stuksgewijze oplossing in
  // makePartialParticular — daarmee is w(x)/u(x) op de stations voor alle
  // ondersteunde verdeelde lasten exact (het vroegere gedocumenteerde gat
  // "partiële q alleen homogeen benaderd" is gedicht).
  // Puntlasten grijpen in deze core altijd op knopen aan en zitten daarmee
  // volledig in het homogene deel.
  const EI = material.E * element.section.I;
  const EA = material.E * element.section.A;
  // Per last: volle lengte → gesloten vormen (bit-identiek aan voorheen);
  // partieel → exacte stuksgewijze particulier.
  const particulars = dLoads.map(dl => {
    const isPart = dl.startT > 0 || dl.endT < 1;
    if (!isPart) {
      const hasLoad = dl.qyS !== 0 || dl.qyE !== 0 || dl.qxS !== 0 || dl.qxE !== 0;
      return { kind: hasLoad ? ('full' as const) : ('none' as const), dl, partial: null };
    }
    return { kind: 'partial' as const, dl, partial: makePartialParticular(L, EI, EA, dl) };
  });

  const deflection: number[] = [];
  const axialDisp: number[] = [];
  const u1L = dLoc[0], v1L = dLoc[1], t1L = dLoc[2];
  const u2L = dLoc[3], v2L = dLoc[4], t2L = dLoc[5];
  for (let i = 0; i < NUM_STATIONS; i++) {
    const x = stations[i];
    const xi = L > 0 ? x / L : 0;
    // Hermite (transversaal) + lineair (axiaal) homogeen deel
    const H1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
    const H2 = x * (1 - xi) * (1 - xi);
    const H3 = 3 * xi * xi - 2 * xi * xi * xi;
    const H4 = x * xi * (xi - 1);
    let w = H1 * v1L + H2 * t1L + H3 * v2L + H4 * t2L;
    let u = u1L + (u2L - u1L) * xi;
    for (const p of particulars) {
      if (p.kind === 'full' && EI > 0 && EA > 0) {
        const dl = p.dl;
        const dqy = dl.qyE - dl.qyS;
        const dqx = dl.qxE - dl.qxS;
        // Particuliere oplossing met ingeklemde randen:
        //  uniform:   w_p = qyS·x²(L−x)²/(24EI)
        //  driehoek:  w_p = Δqy·(x⁵/(120L) − L·x³/40 + L²·x²/60)/EI
        w += dl.qyS * x * x * (L - x) * (L - x) / (24 * EI);
        w += dqy * (Math.pow(x, 5) / (120 * L) - L * x * x * x / 40 + L * L * x * x / 60) / EI;
        //  axiaal uniform:  u_p = qxS·x(L−x)/(2EA)
        //  axiaal driehoek: u_p = Δqx·x(L²−x²)/(6L·EA)
        u += dl.qxS * x * (L - x) / (2 * EA);
        u += dqx * x * (L * L - x * x) / (6 * L * EA);
      } else if (p.kind === 'partial' && p.partial) {
        w += p.partial.wAt(x);
        u += p.partial.uAt(x);
      }
    }
    deflection.push(w);
    axialDisp.push(u);
  }

  // Find maximum absolute values for scaling
  const maxN = Math.max(...normalForce.map(Math.abs), 1e-10);
  const maxV = Math.max(...shearForce.map(Math.abs), 1e-10);
  const maxM = Math.max(...bendingMoment.map(Math.abs), 1e-10);

  return {
    elementId: element.id,
    N1,
    V1,
    M1,
    N2,
    V2,
    M2,
    stations,
    normalForce,
    shearForce,
    bendingMoment,
    deflection,
    axialDisp,
    maxN,
    maxV,
    maxM
  };
}

/**
 * Calculate stress at a point in the beam cross-section
 *
 * @param N Normal force
 * @param M Bending moment
 * @param A Cross-sectional area
 * @param I Second moment of area
 * @param y Distance from neutral axis (positive = tension side for positive M)
 */
export function calculateBeamStress(
  N: number,
  M: number,
  A: number,
  I: number,
  y: number
): number {
  const sigma_axial = N / A;
  const sigma_bending = -M * y / I; // Negative because positive M causes compression at top (y > 0)
  return sigma_axial + sigma_bending;
}

/**
 * Calculate maximum stress in beam element (at extreme fibers)
 */
export function calculateMaxBeamStress(
  forces: IBeamForces,
  section: { A: number; I: number; h: number }
): { maxTension: number; maxCompression: number; location: { x: number; fiber: 'top' | 'bottom' } } {
  const y_top = section.h / 2;
  const y_bottom = -section.h / 2;

  let maxTension = -Infinity;
  let maxCompression = Infinity;
  let location = { x: 0, fiber: 'top' as 'top' | 'bottom' };

  for (let i = 0; i < forces.stations.length; i++) {
    const N = forces.normalForce[i];
    const M = forces.bendingMoment[i];

    const sigma_top = calculateBeamStress(N, M, section.A, section.I, y_top);
    const sigma_bottom = calculateBeamStress(N, M, section.A, section.I, y_bottom);

    if (sigma_top > maxTension) {
      maxTension = sigma_top;
      location = { x: forces.stations[i], fiber: 'top' };
    }
    if (sigma_bottom > maxTension) {
      maxTension = sigma_bottom;
      location = { x: forces.stations[i], fiber: 'bottom' };
    }
    if (sigma_top < maxCompression) {
      maxCompression = sigma_top;
    }
    if (sigma_bottom < maxCompression) {
      maxCompression = sigma_bottom;
    }
  }

  return { maxTension, maxCompression, location };
}

/**
 * Format force value for display
 */
export function formatForce(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(2)} MN`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(2)} kN`;
  } else {
    return `${value.toFixed(2)} N`;
  }
}

/**
 * Format moment value for display
 */
export function formatMoment(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(2)} MNm`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(2)} kNm`;
  } else {
    return `${value.toFixed(2)} Nm`;
  }
}

/**
 * Calculate reaction forces at supports for the entire frame
 */
export function calculateReactionForces(
  reactions: number[],
  nodeIdToIndex: Map<number, number>,
  nodes: Map<number, INode>,
  dofsPerNode: number
): Map<number, { Rx: number; Ry: number; Rm: number }> {
  const reactionMap = new Map<number, { Rx: number; Ry: number; Rm: number }>();

  for (const node of nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      const nodeIndex = nodeIdToIndex.get(node.id);
      if (nodeIndex === undefined) continue;

      const baseDof = nodeIndex * dofsPerNode;
      const Rx = node.constraints.x ? reactions[baseDof] : 0;
      const Ry = node.constraints.y ? reactions[baseDof + 1] : 0;
      const Rm = dofsPerNode === 3 && node.constraints.rotation ? reactions[baseDof + 2] : 0;

      reactionMap.set(node.id, { Rx, Ry, Rm });
    }
  }

  return reactionMap;
}
