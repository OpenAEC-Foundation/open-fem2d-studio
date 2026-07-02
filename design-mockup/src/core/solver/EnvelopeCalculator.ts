/**
 * Envelope Calculator
 *
 * Computes min/max envelopes across multiple solver results
 * (one per load combination). For each DOF and each beam force station,
 * tracks the minimum and maximum values.
 */

import { ISolverResult, IEnvelopeResult } from '../fem/types';

/**
 * Calculate the envelope (min/max) across an array of solver results.
 * Typically called with one result per load combination.
 */
export function calculateEnvelope(results: ISolverResult[]): IEnvelopeResult {
  if (results.length === 0) {
    return {
      minDisplacements: [],
      maxDisplacements: [],
      beamForces: new Map(),
    };
  }

  const numDofs = results[0].displacements.length;

  // Initialize min/max displacement arrays from the first result
  const minDisplacements = [...results[0].displacements];
  const maxDisplacements = [...results[0].displacements];

  // Process remaining results for displacements
  for (let r = 1; r < results.length; r++) {
    const disp = results[r].displacements;
    for (let i = 0; i < numDofs; i++) {
      if (disp[i] < minDisplacements[i]) minDisplacements[i] = disp[i];
      if (disp[i] > maxDisplacements[i]) maxDisplacements[i] = disp[i];
    }
  }

  // Collect all beam element IDs across all results
  const allBeamIds = new Set<number>();
  for (const result of results) {
    for (const id of result.beamForces.keys()) {
      allBeamIds.add(id);
    }
  }

  // Build envelope for beam forces
  const beamForces = new Map<number, {
    minN: number[]; maxN: number[];
    minV: number[]; maxV: number[];
    minM: number[]; maxM: number[];
    stations: number[];
  }>();

  for (const beamId of allBeamIds) {
    // Find the first result that has data for this beam to get station count
    let stationCount = 0;
    let stations: number[] = [];
    for (const result of results) {
      const bf = result.beamForces.get(beamId);
      if (bf && bf.stations.length > 0) {
        stationCount = bf.stations.length;
        stations = [...bf.stations];
        break;
      }
    }

    if (stationCount === 0) continue;

    const minN = new Array(stationCount).fill(Infinity);
    const maxN = new Array(stationCount).fill(-Infinity);
    const minV = new Array(stationCount).fill(Infinity);
    const maxV = new Array(stationCount).fill(-Infinity);
    const minM = new Array(stationCount).fill(Infinity);
    const maxM = new Array(stationCount).fill(-Infinity);

    for (const result of results) {
      const bf = result.beamForces.get(beamId);
      if (!bf) continue;

      for (let i = 0; i < stationCount && i < bf.normalForce.length; i++) {
        if (bf.normalForce[i] < minN[i]) minN[i] = bf.normalForce[i];
        if (bf.normalForce[i] > maxN[i]) maxN[i] = bf.normalForce[i];
        if (bf.shearForce[i] < minV[i]) minV[i] = bf.shearForce[i];
        if (bf.shearForce[i] > maxV[i]) maxV[i] = bf.shearForce[i];
        if (bf.bendingMoment[i] < minM[i]) minM[i] = bf.bendingMoment[i];
        if (bf.bendingMoment[i] > maxM[i]) maxM[i] = bf.bendingMoment[i];
      }
    }

    // Replace any Infinity values with 0 (beam not present in some results)
    for (let i = 0; i < stationCount; i++) {
      if (minN[i] === Infinity) minN[i] = 0;
      if (maxN[i] === -Infinity) maxN[i] = 0;
      if (minV[i] === Infinity) minV[i] = 0;
      if (maxV[i] === -Infinity) maxV[i] = 0;
      if (minM[i] === Infinity) minM[i] = 0;
      if (maxM[i] === -Infinity) maxM[i] = 0;
    }

    beamForces.set(beamId, { minN, maxN, minV, maxV, minM, maxM, stations });
  }

  return {
    minDisplacements,
    maxDisplacements,
    beamForces,
  };
}
