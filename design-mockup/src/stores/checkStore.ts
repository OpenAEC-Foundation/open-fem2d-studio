/**
 * checkStore — resultaten van de normtoetsing.
 *
 * Eén run draait de vier Rust-kernen parallel — staal (`check_steel_beams`),
 * hout (`check_timber_beams`), kruislaaghout (`check_clt_beams`) en beton
 * (`check_concrete_beams`) — en merget de resultaten op staaf-id in één lijst
 * met hetzelfde NamedCheck-contract. Niet-toetsbare staven komen met
 * expliciete reden in `skipped` (zichtbaar in het toetsingspaneel) — geen
 * stille aannames.
 *
 * De rekenkern is in beide omgevingen bereikbaar. In de desktop-app via
 * Tauri's `invoke`; in de browser via het eindpunt `/api/toetsing` van de
 * dev-server, dat dezelfde binary aanroept (zie `vite.config.ts` en
 * `src-tauri/crates/toetsbrug`). Dat is bewust dezelfde kern en geen tweede
 * implementatie: hetzelfde model hoort overal hetzelfde antwoord te geven.
 * Vóór die brug haakte de toetsing in de browser volledig af, waardoor elke
 * unity check leeg bleef — in het canvas én in het rapport.
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { BeamCheckResult } from "../lib/types/steel/BeamCheckResult";
import type { TimberBeamCheckResult } from "../lib/types/timber/TimberBeamCheckResult";
import type { CltBeamCheckResult } from "../lib/types/timber/CltBeamCheckResult";
import type { ConcreteBeamCheckResult } from "../lib/types/concrete/ConcreteBeamCheckResult";
import type { ConcreteClass } from "../lib/types/concrete/ConcreteClass";
import type { SteelProfile } from "../lib/types/steel/SteelProfile";
import type { MemberCheckResult, CheckSkip } from "../lib/checkTypes";
import { isTauriApp } from "../lib/tauri";
import {
  buildSteelCheckInputs,
  isSteelProfile,
  profileLookupKey,
} from "../lib/steelCheckBuilder";
import {
  buildTimberCheckInputs,
  matchSupportedTimberGrade,
} from "../lib/timberCheckBuilder";
import { buildCltCheckInputs, isCltProfiel } from "../lib/cltCheckBuilder";
import {
  buildBetonCheckInputs,
  matchSupportedConcreteClass,
  type BetonStaafConfig,
} from "../lib/betonCheckBuilder";

/**
 * Roep de Rust-rekenkern aan, waar de app ook draait.
 *
 * In de desktop-app gaat dat via Tauri; in de browser via de dev-brug. De
 * aanroepers merken het verschil niet, en dat is de bedoeling — de toetsing
 * hoort niet af te hangen van de schil waarin de app toevallig staat.
 * Geëxporteerd zodat ook de korfeditor (M-N-κ-diagram) dezelfde weg neemt.
 */
export async function roepKern<T>(opdracht: string, inputs?: unknown): Promise<T> {
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
      (data as { fout?: string })?.fout ??
        `De rekenkern antwoordde met status ${antwoord.status}.`,
    );
  }
  return data as T;
}

export interface CheckRunData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
}

interface CheckState {
  results: MemberCheckResult[];
  skipped: CheckSkip[];
  isRunning: boolean;
  error: string | null;
  lastRunAt: number | null;

  /** Draai alle kernen in één run. Resolves wanneer de state gevuld is. */
  run: (data: CheckRunData) => Promise<void>;
  /** Wis resultaten (bijv. wanneer het model wijzigt). */
  clear: () => void;
}

// Module-level caches — de profieldatabase en de klassenlijsten veranderen
// niet tijdens een sessie, dus één aanroep per app-start volstaat.
let profileDbCache: Map<string, SteelProfile> | null = null;
let timberGradesCache: string[] | null = null;
let concreteClassesCache: string[] | null = null;

async function getProfileDb(): Promise<Map<string, SteelProfile>> {
  if (profileDbCache) return profileDbCache;
  const profiles = await roepKern<SteelProfile[]>("list_steel_profiles");
  const map = new Map<string, SteelProfile>();
  for (const p of profiles) {
    const key = profileLookupKey(p.name);
    if (!map.has(key)) map.set(key, p);
  }
  profileDbCache = map;
  return map;
}

async function getTimberGrades(): Promise<string[]> {
  if (timberGradesCache) return timberGradesCache;
  timberGradesCache = await roepKern<string[]>("list_timber_grades");
  return timberGradesCache;
}

async function getConcreteClasses(): Promise<string[]> {
  if (concreteClassesCache) return concreteClassesCache;
  const klassen = await roepKern<ConcreteClass[]>("list_concrete_classes");
  concreteClassesCache = klassen.map((k) => k.name);
  return concreteClassesCache;
}

/**
 * Wapeningskorven uit de staafeigenschappen. Een betonstaaf zónder korf komt
 * niet in deze map en wordt door de betonbouwer met reden overgeslagen —
 * er is geen stille standaardkorf.
 */
function korvenUitStaven(beams: Beam[]): Map<number, BetonStaafConfig> {
  const korven = new Map<number, BetonStaafConfig>();
  for (const b of beams) {
    const cfg = b.checkConfig;
    if (!cfg?.betonKorf) continue;
    korven.set(b.id, {
      korf: cfg.betonKorf,
      staalsoort: cfg.betonStaalsoort,
      aantalStroken: cfg.betonStroken,
      staaltak: cfg.betonStaaltak,
    });
  }
  return korven;
}

export const useCheckStore = create<CheckState>((set) => ({
  results: [],
  skipped: [],
  isRunning: false,
  error: null,
  lastRunAt: null,

  run: async (data: CheckRunData) => {
    // Geen omgevingscontrole meer: de toetsing loopt altijd mee met de
    // berekening. Is de rekenkern onbereikbaar, dan komt dat als een gewone
    // fout terug uit `roepKern` en staat het in het toetsingspaneel — in
    // plaats van dat de toetsing er stilzwijgend niet is.
    set({ isRunning: true, error: null });
    try {
      const [profileDb, timberGrades, concreteClasses] = await Promise.all([
        getProfileDb(),
        getTimberGrades(),
        getConcreteClasses(),
      ]);

      const steel = buildSteelCheckInputs({ ...data, profileDb });
      // De houtbouwer krijgt de CLT-staven niet te zien: qua materiaal zijn
      // ze hout, maar hun profiel is een opbouw en geen b × h — anders meldde
      // hij ze als "geen rechthoek" terwijl de CLT-bouwer ze wél toetst.
      const timber = buildTimberCheckInputs({
        ...data,
        beams: data.beams.filter((b) => !isCltProfiel(b.profile)),
        supportedGrades: timberGrades,
      });
      const clt = buildCltCheckInputs({ ...data, supportedGrades: timberGrades });
      const beton = buildBetonCheckInputs({
        ...data,
        korven: korvenUitStaven(data.beams),
        supportedClasses: concreteClasses,
      });

      // Eerlijkheid: elke staaf die nergens terechtkwam expliciet melden.
      const bouwers: { inputs: { beam_id: number }[]; skipped: CheckSkip[] }[] = [
        steel, timber, clt, beton,
      ];
      const covered = new Set<number>(
        bouwers.flatMap((b) => [
          ...b.inputs.map((i) => i.beam_id),
          ...b.skipped.map((s) => s.beamId),
        ]),
      );
      const skipped: CheckSkip[] = bouwers.flatMap((b) => b.skipped);
      for (const b of data.beams) {
        if (!covered.has(b.id)) {
          skipped.push({
            beamId: b.id,
            reason: `niet herkend als staal, hout, kruislaaghout of beton (materiaal "${b.material ?? "—"}", profiel "${b.profile ?? "—"}") — geen normtoetsing mogelijk`,
          });
        }
      }
      // Zichtbaar in de devtools-console én in het toetsingspaneel.
      for (const s of skipped) {
        console.info(`[Toetsing] staaf ${s.beamId} overgeslagen — ${s.reason}`);
      }

      const [steelResults, timberResults, cltResults, betonResults] = await Promise.all([
        steel.inputs.length > 0
          ? roepKern<BeamCheckResult[]>("check_steel_beams", steel.inputs)
          : Promise.resolve<BeamCheckResult[]>([]),
        timber.inputs.length > 0
          ? roepKern<TimberBeamCheckResult[]>("check_timber_beams", timber.inputs)
          : Promise.resolve<TimberBeamCheckResult[]>([]),
        clt.inputs.length > 0
          ? roepKern<CltBeamCheckResult[]>("check_clt_beams", clt.inputs)
          : Promise.resolve<CltBeamCheckResult[]>([]),
        beton.inputs.length > 0
          ? roepKern<ConcreteBeamCheckResult[]>("check_concrete_beams", beton.inputs)
          : Promise.resolve<ConcreteBeamCheckResult[]>([]),
      ]);

      const merged: MemberCheckResult[] = [
        ...steelResults,
        ...timberResults,
        ...cltResults,
        ...betonResults,
      ].sort((a, b) => a.beam_id - b.beam_id);

      set({
        results: merged,
        skipped: skipped.sort((a, b) => a.beamId - b.beamId),
        isRunning: false,
        error: null,
        lastRunAt: Date.now(),
      });
    } catch (e) {
      set({ error: String(e), isRunning: false });
    }
  },

  clear: () => set({ results: [], skipped: [], error: null, lastRunAt: null }),
}));

/**
 * Snelle voorspelling of een run überhaupt iets zal toetsen — gebruikt om
 * de gebruiker vroeg te waarschuwen (geen aanroep van de kern nodig).
 */
export function anyCheckableBeams(beams: Beam[]): boolean {
  return beams.some(
    (b) =>
      isSteelProfile(b.profile ?? "HEA160") ||
      isCltProfiel(b.profile) ||
      matchSupportedTimberGrade(b.material) !== null ||
      matchSupportedConcreteClass(b.material) !== null,
  );
}
