/**
 * Solver entry point for v2 — re-exports `engine.ts`.
 *
 * The FEM engine code lives in `src/core/` (own code of this app).
 * `engine.ts` is the unit-conversion + type-adapter layer between the UI's
 * compact shape and the engine's Mesh class. It contains no FEM math —
 * all math is in `src/core/solver/` and `src/core/fem/`.
 */
export {
  solve,
  solveAllCases,
  solveAllCasesNonlinear,
  buildMatrices as buildMatricesOnly,
  type Assembly,
  type ExposedBeamCache,
} from "./engine";
