/**
 * betonKern.ts — typed aanroepen van de betonopdrachten in de rekenkern.
 *
 * `roepBetonKern` is een kopie van `roepKern` in stores/checkStore.ts: in de
 * desktop-app via Tauri's `invoke`, in de browser via het eindpunt
 * `/api/toetsing` van de dev-server (toetsbrug). Dezelfde kern, geen tweede
 * implementatie. Zodra de hoofdsessie `roepKern` uit checkStore exporteert,
 * kan deze kopie daarnaar verwijzen; het paneel accepteert de aanroep ook
 * als prop (`berekenDiagram`), zodat die koppeling zonder wijziging hier
 * gemaakt kan worden.
 *
 * Opdrachten (zie src-tauri/crates/toetsbrug/src/main.rs):
 *  - list_concrete_classes      → ConcreteClass[]     (tabel 3.1, volledig)
 *  - list_reinforcement_grades  → ReinforcementGrade[] (bijlage C)
 *  - concrete_mn_kappa          → MnKappaResponse     (diagram voor één korf)
 *  - check_concrete_beams       → ConcreteBeamCheckResult[]
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriApp } from "../../lib/tauri";
import type { ConcreteClass } from "../../lib/types/concrete/ConcreteClass";
import type { ReinforcementGrade } from "../../lib/types/concrete/ReinforcementGrade";
import type { MnKappaRequest } from "../../lib/types/concrete/MnKappaRequest";
import type { MnKappaResponse } from "../../lib/types/concrete/MnKappaResponse";
import type { ConcreteBeamCheckInput } from "../../lib/types/concrete/ConcreteBeamCheckInput";
import type { ConcreteBeamCheckResult } from "../../lib/types/concrete/ConcreteBeamCheckResult";

export async function roepBetonKern<T>(opdracht: string, inputs?: unknown): Promise<T> {
  if (isTauriApp()) {
    return invoke<T>(opdracht, inputs !== undefined ? { inputs } : undefined);
  }
  const antwoord = await fetch("/api/toetsing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opdracht, inputs }),
  });
  const data = await antwoord.json().catch(() => null);
  if (!antwoord.ok || (data && typeof data === "object" && "fout" in data)) {
    throw new Error(
      (data as { fout?: string })?.fout ?? `De rekenkern antwoordde met status ${antwoord.status}.`,
    );
  }
  return data as T;
}

// Module-level caches — de materiaaltabellen veranderen niet tijdens een sessie.
let betonklassenCache: ConcreteClass[] | null = null;
let staalsoortenCache: ReinforcementGrade[] | null = null;

/** Tabel 3.1 uit de kern (alle kolommen), gecachet. */
export async function haalBetonklassen(): Promise<ConcreteClass[]> {
  if (betonklassenCache) return betonklassenCache;
  betonklassenCache = await roepBetonKern<ConcreteClass[]>("list_concrete_classes");
  return betonklassenCache;
}

/** Bijlage C uit de kern (B500A/B/C), gecachet. */
export async function haalWapeningsstaal(): Promise<ReinforcementGrade[]> {
  if (staalsoortenCache) return staalsoortenCache;
  staalsoortenCache = await roepBetonKern<ReinforcementGrade[]>("list_reinforcement_grades");
  return staalsoortenCache;
}

/** M-N-κ-diagram en interactiediagram voor één korf. */
export function berekenMnKappa(verzoek: MnKappaRequest): Promise<MnKappaResponse> {
  return roepBetonKern<MnKappaResponse>("concrete_mn_kappa", verzoek);
}

/** Toetsing van betonstaven (invoer uit betonCheckBuilder). */
export function toetsBetonstaven(inputs: ConcreteBeamCheckInput[]): Promise<ConcreteBeamCheckResult[]> {
  return roepBetonKern<ConcreteBeamCheckResult[]>("check_concrete_beams", inputs);
}
