/**
 * REMOVED 2026-05-21 — was part of the fake/parallel in-process solver.
 *
 * The app now delegates ALL FEM calculations to the canonical solver via
 * `engine.ts` → `src/core/solver/NonlinearSolver.ts`.
 *
 * If you need equivalent-load formulas, see `src/core/fem/Beam.ts`
 * (calculateDistributedLoadVector, calculateTrapezoidalLoadVector, etc.).
 *
 * Safe to delete this stub once you've confirmed nothing imports it.
 */
export {};
