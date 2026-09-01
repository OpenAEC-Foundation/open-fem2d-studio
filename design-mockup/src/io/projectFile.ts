/**
 * projectFile.ts — serialize / deserialize the FEM model to a JSON file
 * (.ifcfem2d extension) + native dialog + IO via Tauri plugins, with a browser
 * fallback (Blob download / file-input) when running in a plain web context.
 */
import type {
  Node, Beam, Support, Plate, Load, LoadCase,
} from "../components/fem/femTypes";

export const PROJECT_FILE_EXT = "ifcfem2d";
export const PROJECT_FORMAT_VERSION = 1;

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
