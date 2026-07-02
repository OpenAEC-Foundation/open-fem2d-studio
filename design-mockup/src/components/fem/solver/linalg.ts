/**
 * REMOVED 2026-05-21 — was part of the fake/parallel in-process solver.
 *
 * Gaussian elimination + matrix utilities are now handled by the canonical
 * solver. See `engine.ts` → `src/core/solver/NonlinearSolver.ts` which
 * calls `solveLinearSystem()` from `src/core/math/GaussElimination.ts`.
 *
 * Safe to delete this stub once you've confirmed nothing imports it.
 */
export {};
