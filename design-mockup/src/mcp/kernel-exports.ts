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
// De kritieke lastfactor α_cr en de meldingen erbij (basisaudit nr 27): de
// sidecar zet ze in `warnings`, dus horen ze in de bundel en in de bundeltest.
export * from "../components/fem/solver/alphaCr";
// De afleiding van de standaardcombinaties (NB-tabellen, gevolgklasse) en het
// bijhouden van gevallen en combinaties: de sidecar gebruikt ze voor zijn
// standaardset en zijn meldingen, en hun tests horen óók tegen de bundel te
// draaien. Pure rekencode, geen DOM en geen Tauri.
export * from "../components/fem/solver/normcombinaties";
export * from "../lib/combinatieBeheer";
// De combinatieselectie hoort IN de bundel: de sidecar past hem toe vlak vóór
// het combineren, zodat een MCP-solve niet acht combinaties oplevert waar de
// app er zes toont. Hij trekt `variantInvoer` mee — de materiaalclassificatie
// die de toetsing ook gebruikt; pure rekencode, geen DOM en geen Tauri.
// De NORMNAAD: welke nationale bijlagen rekenwaarden hebben, en de
// normaanduidingen die bij die keuze horen. Zit al in de bundel via
// `sidecar.ts` en de vier check-bouwers, maar zonder deze regel is hij in de
// bundelstand van de regressierunner niet aanroepbaar — en juist de WEIGERING
// van een niet-gevulde bijlage hoort in het MCP-artefact net zo hard te zijn
// als in de bron: dat is de enige plek waar een stille terugval op Nederlandse
// partiële factoren zou kunnen ontstaan. Pure tekst en tabellen, geen DOM.
export * from "../lib/normAanduidingen";
export * from "../lib/combinatieSelectie";
export * from "../lib/steelCheckBuilder";
// De referentierichting (spiegelen van staaf, uitkomst en toetsconfig): al in
// de bundel via de staalbouwer, maar zonder deze regel niet aanroepbaar in de
// bundelstand van de regressierunner. Pure rekencode: sinds het verlopende
// profiel wisselt hij ook begin- en eindprofiel, en dat hoort tegen de bundel
// bewezen te worden.
export * from "../lib/referentierichting";
export * from "../lib/timberCheckBuilder";
// De eindstijfheid van hout (EN 1995-1-1 2.3.2.2): de sidecar maakt er de
// eindtoestandvarianten mee, en de test hoort tegen de bundel te draaien.
export * from "../lib/houtEindstijfheid";
export * from "../lib/sectionResolver";
// Het materiaal van een PLAAT (stap 3): pure rekencode die de bestaande
// materiaaltabellen leest. Zit al in de bundel via `engine.ts` en
// `valideerModel`, maar zonder deze regel is hij in de bundelstand van de
// regressierunner niet aanroepbaar — en juist de weigering van een onbekend
// materiaal hoort in het MCP-artefact net zo hard te zijn als in de bron.
export * from "../lib/plaatMateriaal";
export * from "../lib/modelNaarSolverInput";
export * from "../components/fem/femTypes";
// De plaatmesher (raster met openingen, koppeling tot vierhoeken, keuring van
// een cache): pure meetkunde zonder WASM of DOM — de engine gebruikt hem al,
// en zijn tests horen tegen de bundel te draaien. PlateRegion en de
// CDT-service blijven er bewust buiten (zie boven).
export * from "../core/fem/PlaatMesher";
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
