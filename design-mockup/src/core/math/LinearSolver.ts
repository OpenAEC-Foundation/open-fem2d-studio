/**
 * Keuzepunt voor de stelseloplosser.
 *
 * Dit is de ENIGE plek waar staat welke oplosser draait. `NonlinearSolver`
 * importeert `solveLinearSystem` hiervandaan en niet meer rechtstreeks uit
 * `GaussElimination`; de zeven aanroepplaatsen daar hoeven daardoor niets van
 * de keuze te weten en houden hun bestaande handtekening.
 *
 * Twee oplossers:
 *
 *   'gauss'    dichte Gauss-eliminatie met partiële pivotering (bestaand).
 *              O(n³) in tijd, O(n²) in geheugen.
 *   'skyline'  LDLᵀ over de onderdriehoek-envelop. O(n·b²) met b de
 *              gemiddelde profielhoogte; valt terug op 'gauss' zodra de
 *              matrix niet symmetrisch blijkt. STANDAARD.
 *
 * De standaard is 'skyline'. De keuze is per proces te overrulen met de
 * omgevingsvariabele `FEM_SOLVER` — dat is het haakje waarmee de volledige
 * regressiebatterij met de andere oplosser gedraaid kan worden zonder de
 * broncode te veranderen — of programmatisch met `setLinearSolver`.
 */

import { Matrix } from './Matrix';
import { solveLinearSystem as solveGauss } from './GaussElimination';
import { solveSkyline } from './SkylineSolver';

export type LinearSolverId = 'gauss' | 'skyline';

export const LINEAR_SOLVER_IDS: readonly LinearSolverId[] = ['gauss', 'skyline'] as const;

/**
 * Standaard. Verander dit niet zonder meting — zie het besluitdocument B3.
 *
 * Waarom 'skyline' en niet de oudere 'gauss': gemeten scheelt het bij 3135
 * vrijheidsgraden 16 964 ms tegen 55 ms, en op de volledige rekenketen bij
 * 7860 vrijheidsgraden 249 s tegen 1,4 s. De fysisch niet-lineaire tweede orde
 * doet tientallen oplossingen per combinatie op een model dat door de
 * segmentindeling tien keer zoveel elementen telt; met de dichte oplosser ligt
 * de grens van één seconde per oplossing al bij circa 165 m staaflengte.
 *
 * De uitkomsten verschillen door de andere eliminatievolgorde in de laatste
 * cijfers: gemeten 9,3e-13 op verplaatsingen, 1,1e-12 op reacties en 2,0e-12
 * op staafkrachten, relatief. Dat is ver onder de precisie waarop het rapport
 * getallen toont. `test-oplossers.mjs` meet dat verschil en drukt het af.
 */
const STANDAARD: LinearSolverId = 'skyline';

/** Metingen over alle aanroepen sinds de laatste reset. */
export interface ILinearSolverStats {
  /** Aantal aanroepen van `solveLinearSystem`. */
  calls: number;
  /** Opgetelde tijd binnen de oplosser, in milliseconden. */
  totalMs: number;
  /** Grootste stelselgrootte die langskwam. */
  maxDofs: number;
}

function leesOmgevingskeuze(): LinearSolverId {
  // `process` bestaat niet in de browser; de optional chaining houdt dit
  // stil in de app en werkzaam in Node (tests, sidecar, meetscript).
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const ruw = g.process?.env?.FEM_SOLVER;
  if (!ruw) return STANDAARD;
  const genormaliseerd = ruw.trim().toLowerCase();
  if ((LINEAR_SOLVER_IDS as readonly string[]).includes(genormaliseerd)) {
    return genormaliseerd as LinearSolverId;
  }
  return STANDAARD;
}

let actief: LinearSolverId = leesOmgevingskeuze();
let stats: ILinearSolverStats = { calls: 0, totalMs: 0, maxDofs: 0 };

export function getLinearSolver(): LinearSolverId {
  return actief;
}

export function setLinearSolver(id: LinearSolverId): void {
  if (!(LINEAR_SOLVER_IDS as readonly string[]).includes(id)) {
    throw new Error(`Onbekende stelseloplosser: ${id}`);
  }
  actief = id;
}

export function getLinearSolverStats(): ILinearSolverStats {
  return { ...stats };
}

export function resetLinearSolverStats(): void {
  stats = { calls: 0, totalMs: 0, maxDofs: 0 };
}

/**
 * Lost A·x = b op met de actieve oplosser.
 *
 * Handtekening en foutgedrag zijn gelijk aan
 * `GaussElimination.solveLinearSystem`; beide oplossers werpen bij een
 * singuliere matrix dezelfde melding met dezelfde kolomaanduiding.
 */
export function solveLinearSystem(A: Matrix, b: number[]): number[] {
  const t0 = performance.now();
  try {
    return actief === 'skyline' ? solveSkyline(A, b) : solveGauss(A, b);
  } finally {
    stats.calls++;
    stats.totalMs += performance.now() - t0;
    if (A.rows > stats.maxDofs) stats.maxDofs = A.rows;
  }
}
