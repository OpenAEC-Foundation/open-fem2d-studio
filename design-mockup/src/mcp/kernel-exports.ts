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

// De NDJSON-hoofdlus hoort IN de bundel: Rust schrijft `fem-kernel.mjs` uit de
// binary naar schijf en start hem als `node fem-kernel.mjs --sidecar`. Zonder
// de lus zou dat proces niets doen en met lege stdout eindigen — voor de
// aanroeper niet te onderscheiden van een crash. De lus start ALLEEN met die
// vlag of als hoofdmodule; het bundelscript en de bundelstand van de
// regressierunner importeren dit bestand juist, en dan blijft hij stil.
export * from "./sidecar";

// De strenge modelvalidatie en de Nederlandse foutafbeelding staan hier apart,
// hoewel `sidecar.ts` ze al gebruikt: hun tests horen tegen de BUNDEL te
// draaien, want dat is het artefact dat de MCP-server uitvoert. Zonder deze
// twee regels kan de bundelstand van de regressierunner ze niet aanroepen.
export * from "./fouten";
export * from "./valideerModel";

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
