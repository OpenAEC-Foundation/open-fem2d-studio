/**
 * spanningClient — de vrije spanningstoets en de lastoetsing aanroepen vanuit
 * de profieleditor.
 *
 * Beide rekenen in Rust: `spanning-check` (σ_x, τ en de vergelijkspanning over
 * de hoogte) en `nen-en-1993-1-8-las` (de weerstand van een langslas). In de
 * desktop-app gaat dat via Tauri, in de browser via het eindpunt
 * `/api/toetsing` van de dev-server. Zelfde patroon als `motorClient` en
 * `betonKern`: één rekenkern, twee wegen ernaartoe, geen tweede implementatie
 * in TypeScript.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriApp } from "../tauri";
import type { LasInput } from "../types/las/LasInput";
import type { LasResultaat } from "../types/las/LasResultaat";
import type { SpanningBeamCheckInput } from "../types/spanning/SpanningBeamCheckInput";
import type { SpanningBeamCheckResult } from "../types/spanning/SpanningBeamCheckResult";

async function roepKern<T>(opdracht: string, inputs: unknown, signal?: AbortSignal): Promise<T> {
  if (isTauriApp()) {
    return invoke<T>(opdracht, { inputs });
  }
  const antwoord = await fetch("/api/toetsing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opdracht, inputs }),
    signal,
  });
  const data = await antwoord.json().catch(() => null);
  if (!antwoord.ok || (data && typeof data === "object" && "fout" in data)) {
    throw new Error(
      (data as { fout?: string } | null)?.fout ??
        `De rekenkern antwoordde met status ${antwoord.status}.`,
    );
  }
  return data as T;
}

/** Spanningsverloop en unity checks voor één doorsnede met één snedekrachtenset. */
export async function toetsSpanning(
  input: SpanningBeamCheckInput,
  signal?: AbortSignal,
): Promise<SpanningBeamCheckResult> {
  const uit = await roepKern<SpanningBeamCheckResult[]>("check_stress_beams", [input], signal);
  if (!Array.isArray(uit) || uit.length === 0) {
    throw new Error("De spanningskern gaf geen resultaat terug.");
  }
  return uit[0];
}

/** Lasnaden toetsen volgens NEN-EN 1993-1-8 4.5.3.3. */
export async function toetsLassen(
  inputs: LasInput[],
  signal?: AbortSignal,
): Promise<LasResultaat[]> {
  if (inputs.length === 0) return [];
  return roepKern<LasResultaat[]>("check_fillet_welds", inputs, signal);
}
