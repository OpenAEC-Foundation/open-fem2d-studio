/**
 * motorClient — de doorsnedemotor (Rust, `doorsnedemotor`) aanroepen.
 *
 * In de browser via het dev-eindpunt `/api/doorsnede` (zie `vite.config.ts`),
 * in de desktop-app via een Tauri-command met dezelfde JSON. Beide wegen
 * leiden naar dezelfde binary; er bestaat geen TypeScript-implementatie van
 * de doorsnede-eigenschappen — alles wat de editor toont komt hiervandaan.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriApp } from "../tauri";
import type { MotorSoort, MotorUitvoer } from "./types";

/**
 * Eén gat zoals de motor hem leest (beschrijvingsassenstelsel van het
 * profiel): `vlak` = langsgat als eigen contour, `uitsnede` = rechthoek die
 * exact uit de contour wordt gesneden (gat door een plaat).
 */
export interface MotorGat {
  plaats: "vlak" | "uitsnede";
  vorm?: "rond" | "rechthoek";
  y: number;
  z: number;
  d?: number;
  b?: number;
  h?: number;
  hoek_graden?: number;
}

export interface MotorLamel {
  b_mm: number;
  t_mm: number;
  y_mm: number;
  z_mm: number;
  alpha_rad: number;
}

export interface MotorDeel {
  soort: MotorSoort;
  h: number;
  b: number;
  tw: number;
  tf: number;
  r: number;
  y_mm: number;
  z_mm: number;
  alpha_rad: number;
  gespiegeld: boolean;
}

export interface MotorCel {
  midlijn: [number, number][];
  dikte_mm: number[];
  lamellen: number[];
}

/** Eén geometrie-object uit de JSON-array die de motor verwacht. */
export interface MotorInvoer {
  naam: string;
  soort: MotorSoort | "Samenstelling";
  h?: number;
  b?: number;
  tw?: number;
  tf?: number;
  t?: number;
  r?: number;
  elementen_per_wand?: number;
  gaten?: MotorGat[];
  lamellen?: MotorLamel[];
  catalogusdelen?: MotorDeel[];
  gesloten_cellen?: MotorCel[];
}

/** Naam van het Tauri-command dat de hoofdsessie kan aansluiten. */
export const TAURI_COMMAND = "bereken_doorsneden";

export async function roepMotor(
  invoer: MotorInvoer[],
  signal?: AbortSignal,
): Promise<MotorUitvoer[]> {
  if (isTauriApp()) {
    try {
      return await invoke<MotorUitvoer[]>(TAURI_COMMAND, { invoer });
    } catch (e) {
      throw new Error(
        `De doorsnedemotor is in de desktop-app nog niet aangesloten (command "${TAURI_COMMAND}"): ${String(e)}`,
      );
    }
  }
  const antwoord = await fetch("/api/doorsnede", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(invoer),
    signal,
  });
  const data = await antwoord.json().catch(() => null);
  if (!antwoord.ok || !Array.isArray(data)) {
    const fout = (data as { fout?: string } | null)?.fout;
    throw new Error(fout ?? `De doorsnedemotor antwoordde met status ${antwoord.status}.`);
  }
  return data as MotorUitvoer[];
}
