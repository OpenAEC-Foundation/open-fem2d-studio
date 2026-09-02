/**
 * Barrel voor de solver-sidecar.
 *
 * Dit bestand is het ENIGE invoerpunt van `scripts/bouw-sidecar.mjs`. Alles wat
 * hier naar buiten komt, komt in `assets/fem-kernel.mjs` terecht en draait
 * daarmee in een kaal Node-proces zonder DOM en zonder Tauri-runtime.
 *
 * Regels voor dit bestand:
 *  - Voeg hier NOOIT modules toe die de browser of Tauri nodig hebben. De
 *    bundelaar volgt de importgraaf en trekt die glue stilzwijgend mee; het
 *    bundelscript faalt dan hard op `window.`, `document.`, `__TAURI` of
 *    `triangle-wasm`.
 *  - Trek `PlateRegion` hier niet in: dat haalt `TriangleService` en daarmee
 *    `window.location.origin` de bundel in.
 *  - De sidecar rekent uitsluitend via `solveAllCases` /
 *    `solveAllCasesNonlinear` uit `engine.ts` — dezelfde functies die de app
 *    aanroept. Er komt geen tweede rekenkern bij.
 */

export * from "../components/fem/solver/engine";
export * from "../components/fem/solver/combinations";
export * from "../lib/steelCheckBuilder";
export * from "../lib/timberCheckBuilder";
export * from "../lib/sectionResolver";
export * from "../lib/modelNaarSolverInput";
export * from "../components/fem/femTypes";
export * from "../lib/wind/windGenerator";
export * from "../lib/wind/windEurocode";

// Benoemd, NIET `export *`: dat trekt de Tauri- en DOM-glue mee (gemeten:
// 4x window., 4x document.createElement). Zo is het exact 0.
export {
  PROJECT_FORMAT_VERSION,
  PROJECT_FILE_EXT,
  serializeProject,
  deserializeProject,
  combinationsToFile,
  combinationsFromFile,
} from "../io/projectFile";
