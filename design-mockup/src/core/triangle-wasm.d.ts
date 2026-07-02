/**
 * Ambient type declaration for `triangle-wasm` — only referenced by
 * `core/mesher/TriangleService.ts` which itself is only imported by
 * `core/fem/PlateRegion.ts`. Neither is reachable from the FEM solver
 * entry points used by v2 (Mesh + NonlinearSolver + Assembler),
 * so it's tree-shaken at build time. This stub silences tsc --noEmit.
 *
 * If/when plate meshing is actually wired into the UI, replace this stub
 * with the real types and `npm install triangle-wasm`.
 */
declare module 'triangle-wasm' {
  const x: any;
  export = x;
}
