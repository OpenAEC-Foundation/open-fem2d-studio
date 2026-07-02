/**
 * REMOVED 2026-05-21 — was part of the fake/parallel in-process solver.
 *
 * Element stiffness, transformation, and geometric-stiffness matrices are
 * now built by the canonical solver utilities:
 *   - calculateBeamLocalStiffness() in src/core/fem/Beam.ts
 *   - NonlinearSolver geometric pass in src/core/solver/NonlinearSolver.ts
 *
 * Safe to delete this stub once you've confirmed nothing imports it.
 */
export {};
