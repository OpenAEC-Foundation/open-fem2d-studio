/**
 * Solver service that tries the remote OpenSees/xara backend first,
 * then falls back to the local TypeScript solver.
 */

import { Mesh } from '../fem/Mesh';
import { ISolverResult, IBeamForces, AnalysisType } from '../fem/types';
import { solveNonlinear } from './NonlinearSolver';
// Import plate tests so they're available in browser console
import './PlateVerificationTests';

export interface SolveOptions {
  analysisType: AnalysisType;
  geometricNonlinear: boolean;
  // FNL (Physical Nonlinearity) options
  materialNonlinear?: boolean;
  materialType?: 'steel' | 'concrete';
  steelFy?: number;       // Steel yield strength (Pa)
  concreteFck?: number;   // Concrete characteristic strength (Pa)
  maxIterations?: number;
  tolerance?: number;
}

/**
 * Solve the model: tries remote backend first, falls back to local TS solver.
 */
export async function solve(
  mesh: Mesh,
  options: SolveOptions,
  signal?: AbortSignal
): Promise<ISolverResult> {
  try {
    return await solveRemote(mesh, options, signal);
  } catch (e) {
    console.warn('Remote solver failed, falling back to local:', e);
    return solveNonlinear(mesh, options);
  }
}

// ── Remote solver ───────────────────────────────────────────────────────────

async function solveRemote(
  mesh: Mesh,
  options: SolveOptions,
  signal?: AbortSignal
): Promise<ISolverResult> {
  const payload = meshToSolverPayload(mesh, options);

  const resp = await fetch('/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!resp.ok) throw new Error(`Solver HTTP ${resp.status}`);

  const data = await resp.json();
  if (!data.success) throw new Error(data.error || 'Solver failed');

  return responseToSolverResult(data, mesh);
}

// ── Payload builders ────────────────────────────────────────────────────────

function meshToSolverPayload(mesh: Mesh, options: SolveOptions) {
  const nodes: any[] = [];
  for (const n of mesh.nodes.values()) {
    nodes.push({
      id: n.id,
      x: n.x,
      y: n.y,
      constraints: {
        x: n.constraints.x,
        y: n.constraints.y,
        rotation: n.constraints.rotation,
      },
      loads: {
        fx: n.loads.fx,
        fy: n.loads.fy,
        moment: n.loads.moment,
      },
    });
  }

  const beams: any[] = [];
  for (const b of mesh.beamElements.values()) {
    const beam: any = {
      id: b.id,
      nodeIds: [b.nodeIds[0], b.nodeIds[1]],
      materialId: b.materialId,
      section: {
        A: b.section.A,
        I: b.section.I,
        h: b.section.h,
      },
    };

    if (b.distributedLoad) {
      beam.distributedLoad = {
        qx: b.distributedLoad.qx,
        qy: b.distributedLoad.qy,
        qxEnd: b.distributedLoad.qxEnd ?? b.distributedLoad.qx,
        qyEnd: b.distributedLoad.qyEnd ?? b.distributedLoad.qy,
        startT: b.distributedLoad.startT ?? 0,
        endT: b.distributedLoad.endT ?? 1,
        coordSystem: b.distributedLoad.coordSystem ?? 'local',
      };
    }

    if (b.endReleases) {
      beam.endReleases = {
        startMoment: b.endReleases.startMoment,
        endMoment: b.endReleases.endMoment,
      };
    }

    if (b.startConnection) beam.startConnection = b.startConnection;
    if (b.endConnection) beam.endConnection = b.endConnection;

    beams.push(beam);
  }

  const materials: any[] = [];
  // Collect only materials actually referenced by beams
  const usedMaterialIds = new Set(beams.map((b: any) => b.materialId));
  for (const m of mesh.materials.values()) {
    if (usedMaterialIds.has(m.id)) {
      materials.push({
        id: m.id,
        E: m.E,
        nu: m.nu,
      });
    }
  }

  return {
    nodes,
    beams,
    materials,
    analysisType: options.analysisType,
    geometricNonlinear: options.geometricNonlinear,
  };
}

// ── Response mapper ─────────────────────────────────────────────────────────

function responseToSolverResult(
  data: any,
  _mesh: Mesh
): ISolverResult {
  const nodeIdOrder: number[] = data.nodeIdOrder;

  // Build index map: nodeId -> position in the nodeIdOrder array
  const nodeIdToIdx = new Map<number, number>();
  nodeIdOrder.forEach((id, idx) => {
    nodeIdToIdx.set(id, idx);
  });

  // Displacements: already in [u1, v1, θ1, u2, v2, θ2, ...] order
  // matching the nodeIdOrder from the backend
  const displacements: number[] = data.displacements;

  // Reactions: same ordering
  const reactions: number[] = data.reactions;

  // Beam forces: convert from plain object to Map
  const beamForces = new Map<number, IBeamForces>();
  if (data.beamForces) {
    for (const key of Object.keys(data.beamForces)) {
      const bf = data.beamForces[key];
      beamForces.set(bf.elementId, {
        elementId: bf.elementId,
        N1: bf.N1,
        V1: bf.V1,
        M1: bf.M1,
        N2: bf.N2,
        V2: bf.V2,
        M2: bf.M2,
        stations: bf.stations,
        normalForce: bf.normalForce,
        shearForce: bf.shearForce,
        bendingMoment: bf.bendingMoment,
        maxN: bf.maxN,
        maxV: bf.maxV,
        maxM: bf.maxM,
      });
    }
  }

  // Find max values for scaling (using maxM from beam forces)
  let maxVonMises = 0;
  for (const forces of beamForces.values()) {
    maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
  }

  return {
    displacements,
    reactions,
    elementStresses: new Map(),
    beamForces,
    maxVonMises,
    minVonMises: 0,
  };
}
