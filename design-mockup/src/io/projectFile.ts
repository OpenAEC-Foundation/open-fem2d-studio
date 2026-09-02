/**
 * projectFile.ts — serialize / deserialize the FEM model to a JSON file
 * (.ifcfem2d extension) + native dialog + IO via Tauri plugins, with a browser
 * fallback (Blob download / file-input) when running in a plain web context.
 */
import type {
  Node, Beam, Support, Plate, Load, LoadCase, StructuralGrid,
} from "../components/fem/femTypes";
import type { LoadCombination } from "../components/fem/solver/combinations";

export const PROJECT_FILE_EXT = "ifcfem2d";
/**
 * Versiegeschiedenis:
 *  1 — model + loadCases + solver-toggles.
 *  2 — + belastingcombinaties (`combinations`, factors als object omdat een
 *      Map niet JSON-serialiseerbaar is) en stramien (`structuralGrid`).
 *      `Beam.checkConfig` reist automatisch mee met de beams-array.
 *      Later binnen v2 toegevoegd (optioneel, dus geen versie-bump):
 *      scheefstand-instellingen (`scheefstandEnabled`, `scheefstandNoemer`,
 *      `scheefstandRichting`) — ontbreken ze, dan laadt het bestand met
 *      scheefstand uit (noemer 200, richting +x).
 *      Eveneens optioneel binnen v2: plaat-rekenvelden op `Plate`
 *      (`thickness`, `E`, `nu`, `rho`, `meshSize`) — reizen automatisch mee
 *      met de plates-array (zoals `Beam.checkConfig`); ontbreken ze, dan
 *      vult het laden de PLATE_DEFAULTS aan (20 mm / 210000 N/mm² / 0,3 /
 *      7850 kg/m³ / 500 mm — zie femTypes.withPlateDefaults).
 *      Polygonplaten (P4.2, optioneel — geen versie-bump): `Plate.nodeIds`
 *      mag n ≥ 3 hoeken bevatten en `Plate.meshCache` draagt dan het
 *      gecachete CDT-rekenmesh (platte data + geometrie-signatuur, zie
 *      femTypes.PlaatMeshCache); randlasten op polygonranden gebruiken
 *      `Load.edgeIndex` i.p.v. de benoemde `Load.edge`. Beide velden reizen
 *      automatisch mee met de bestaande arrays; oude bestanden zonder deze
 *      velden laden ongewijzigd, en een bestand met verouderde cache wordt
 *      bij het openen door het canvas geregenereerd (signatuurcontrole).
 * v1-bestanden blijven leesbaar: de v2-velden zijn optioneel en ontbrekende
 * velden krijgen bij het laden de bestaande defaults (defaultCombinations()
 * en DEFAULT_STRUCTURAL_GRID in useFemStore.loadProjectState).
 */
export const PROJECT_FORMAT_VERSION = 2;

/** JSON-vorm van één belastingcombinatie: `factors` als { caseId: factor }. */
export interface ProjectFileCombination {
  id: number;
  name: string;
  type: "uls" | "sls";
  formula: string;
  factors: Record<string, number>;
}

/** LoadCombination[] (Map-factoren) → JSON-serialiseerbare vorm. */
export function combinationsToFile(combos: LoadCombination[]): ProjectFileCombination[] {
  return combos.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    formula: c.formula,
    factors: Object.fromEntries([...c.factors].map(([caseId, f]) => [String(caseId), f])),
  }));
}

/**
 * JSON-vorm → LoadCombination[] met Map-factoren (caseId weer numeriek).
 * `undefined` in → `undefined` uit, zodat de aanroeper bij v1-bestanden op
 * de bestaande defaults kan terugvallen.
 */
export function combinationsFromFile(
  raw: ProjectFileCombination[] | undefined,
): LoadCombination[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type === "sls" ? "sls" : "uls",
    formula: c.formula ?? "",
    factors: new Map(
      Object.entries(c.factors ?? {}).map(([caseId, f]) => [Number(caseId), Number(f)]),
    ),
  }));
}

export interface ProjectFile {
  format: "open-fem2d-studio-v2";
  version: number;
  savedAt: string;          // ISO timestamp
  // Model
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
  // Cases + UI prefs
  loadCases: LoadCase[];
  activeLoadCaseId: number;
  selfWeightEnabled: boolean;
  nonlinearEnabled: boolean;
  // v2 — optioneel zodat v1-bestanden zonder migratiestap blijven laden.
  /** Belastingcombinatie-definities (v2). */
  combinations?: ProjectFileCombination[];
  /** Stramien (v2). */
  structuralGrid?: StructuralGrid;
  /** Scheefstand meenemen in de berekening (v2, optioneel — ontbreekt = uit). */
  scheefstandEnabled?: boolean;
  /** Noemer x in φ = 1/x (v2, optioneel — ontbreekt = 200). */
  scheefstandNoemer?: number;
  /** Richting van de equivalente horizontale krachten (v2, optioneel — ontbreekt = +1). */
  scheefstandRichting?: 1 | -1;
}

export function serializeProject(state: Omit<ProjectFile, "format" | "version" | "savedAt">): string {
  const file: ProjectFile = {
    format: "open-fem2d-studio-v2",
    version: PROJECT_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    ...state,
  };
  return JSON.stringify(file, null, 2);
}

export function deserializeProject(text: string): ProjectFile {
  const parsed = JSON.parse(text);
  if (parsed.format !== "open-fem2d-studio-v2") {
    throw new Error(`Onbekend bestandsformaat: ${parsed.format ?? "(geen format-tag)"}`);
  }
  if (typeof parsed.version !== "number") {
    throw new Error("Bestand mist version-tag");
  }
  if (parsed.version > PROJECT_FORMAT_VERSION) {
    throw new Error(`Bestand is opgeslagen met nieuwere versie (${parsed.version}) — werk je app bij`);
  }
  return parsed as ProjectFile;
}

// ── Tauri vs. browser detection ─────────────────────────────────────────────
function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

// ── Save flow ──────────────────────────────────────────────────────────────
/**
 * Save text to a file. In Tauri: opens a native Save-dialog and writes via
 * the fs plugin. In browser: triggers a Blob download. Returns the path that
 * was saved to (Tauri only — empty string in browser).
 */
export async function saveProjectAs(text: string, suggestedName: string): Promise<string> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "Open FEM2D Studio project", extensions: [PROJECT_FILE_EXT] }],
    });
    if (!path) return "";  // user cancelled
    await writeTextFile(path, text);
    return path as string;
  }
  // Browser fallback: trigger download
  const blob = new Blob([text], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = suggestedName.endsWith(`.${PROJECT_FILE_EXT}`)
    ? suggestedName
    : `${suggestedName}.${PROJECT_FILE_EXT}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "";
}

/**
 * Save to a known path (no dialog). Falls back to saveProjectAs in the browser.
 */
export async function saveProjectTo(path: string, text: string): Promise<void> {
  if (isTauri() && path) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, text);
    return;
  }
  // No known path / browser → fall back to dialog flow
  await saveProjectAs(text, "project");
}

// ── Open flow ──────────────────────────────────────────────────────────────
/**
 * Open a project file. In Tauri: native dialog + fs read. In browser: hidden
 * file-input. Returns { text, path } — text is the raw JSON, path is the
 * file path (Tauri only) or filename (browser).
 */
export async function openProject(): Promise<{ text: string; path: string } | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      multiple: false,
      filters: [{ name: "Open FEM2D Studio project", extensions: [PROJECT_FILE_EXT] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    const text = await readTextFile(selected as string);
    return { text, path: selected as string };
  }
  // Browser: hidden <input type=file>
  return await new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${PROJECT_FILE_EXT},application/json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const text = await file.text();
      resolve({ text, path: file.name });
    };
    input.click();
  });
}
