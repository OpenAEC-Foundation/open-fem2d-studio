/**
 * Load Case and Load Combination definitions
 */

import { IEdgeLoad, IThermalLoad } from './types';

export interface IPointLoad {
  nodeId: number;       // Node ID for node-based point loads (0 if beam-based)
  fx: number;           // N (global X)
  fy: number;           // N (global Y)
  mz: number;           // Nm
  // Beam point load fields (optional - when set, load is on beam, not node)
  beamId?: number;      // Beam element ID
  position?: number;    // Position along beam (0 to 1, where 0 = start node, 1 = end node)
}

export interface IDistributedLoad {
  id?: number;     // Unique identifier within a load case (auto-generated)
  elementId: number;    // beam element ID (0 when edgeId is set)
  edgeId?: number;      // IEdge ID — when set, targets a plate edge instead of a beam
  qx: number;      // N/m (local/global) — at start (or uniform)
  qy: number;      // N/m (local/global) — at start (or uniform)
  qxEnd?: number;  // N/m at end (if different from qx → trapezoidal)
  qyEnd?: number;  // N/m at end (if different from qy → trapezoidal)
  startT?: number;  // Partial load start position (0-1), default 0
  endT?: number;    // Partial load end position (0-1), default 1
  coordSystem?: 'local' | 'global'; // Load direction, default 'local'
  description?: string;  // User-defined label (e.g. "Self-weight", "Wind pressure")
}

export interface ILoadCase {
  id: number;
  name: string;
  type: 'dead' | 'live' | 'wind' | 'snow' | 'other';
  pointLoads: IPointLoad[];
  distributedLoads: IDistributedLoad[];
  /** @deprecated Use distributedLoads with edgeId instead */
  edgeLoads?: IEdgeLoad[];
  thermalLoads: IThermalLoad[];
  color: string;
}

export interface ILoadCombination {
  id: number;
  name: string;
  factors: Map<number, number>;  // loadCaseId -> factor
  type: 'ULS' | 'SLS';
}

export const DEFAULT_LOAD_CASES: ILoadCase[] = [
  {
    id: 1,
    name: 'Dead Load (G)',
    type: 'dead',
    pointLoads: [],
    distributedLoads: [],
    thermalLoads: [],
    color: '#6b7280'
  },
  {
    id: 2,
    name: 'Live Load (Q)',
    type: 'live',
    pointLoads: [],
    distributedLoads: [],
    thermalLoads: [],
    color: '#3b82f6'
  },
  {
    id: 3,
    name: 'Wind Load (W)',
    type: 'wind',
    pointLoads: [],
    distributedLoads: [],
    thermalLoads: [],
    color: '#22c55e'
  }
];

export function createLoadCase(
  id: number,
  name: string,
  type: ILoadCase['type'] = 'other'
): ILoadCase {
  const colors: Record<ILoadCase['type'], string> = {
    dead: '#6b7280',
    live: '#3b82f6',
    wind: '#22c55e',
    snow: '#06b6d4',
    other: '#f59e0b'
  };

  return {
    id,
    name,
    type,
    pointLoads: [],
    distributedLoads: [],
    thermalLoads: [],
    color: colors[type]
  };
}

export function createLoadCombination(
  id: number,
  name: string,
  type: 'ULS' | 'SLS' = 'ULS'
): ILoadCombination {
  return {
    id,
    name,
    factors: new Map(),
    type
  };
}

// Standard Eurocode combinations
export function getEurocodeULSFactors(loadCases: ILoadCase[]): Map<number, number> {
  const factors = new Map<number, number>();

  for (const lc of loadCases) {
    switch (lc.type) {
      case 'dead':
        factors.set(lc.id, 1.35);
        break;
      case 'live':
        factors.set(lc.id, 1.5);
        break;
      case 'wind':
      case 'snow':
        factors.set(lc.id, 1.5);
        break;
      default:
        factors.set(lc.id, 1.5);
    }
  }

  return factors;
}

export function getEurocodeSLSFactors(loadCases: ILoadCase[]): Map<number, number> {
  const factors = new Map<number, number>();

  for (const lc of loadCases) {
    factors.set(lc.id, 1.0);
  }

  return factors;
}
