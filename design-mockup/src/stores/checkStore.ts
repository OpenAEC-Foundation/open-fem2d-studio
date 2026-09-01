/**
 * checkStore — resultaten van de normtoetsing (EN 1993 staal + EN 1995 hout).
 *
 * Eén run draait beide Rust-kernen parallel (Tauri-commands
 * `check_steel_beams` en `check_timber_beams`) en merget de resultaten op
 * staaf-id in één lijst met hetzelfde NamedCheck-contract. Niet-toetsbare
 * staven komen met expliciete reden in `skipped` (zichtbaar in het
 * toetsingspaneel) — geen stille aannames.
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { BeamCheckResult } from "../lib/types/steel/BeamCheckResult";
import type { TimberBeamCheckResult } from "../lib/types/timber/TimberBeamCheckResult";
import type { SteelProfile } from "../lib/types/steel/SteelProfile";
import type { MemberCheckResult, CheckSkip } from "../lib/checkTypes";
import { isTauriApp, DESKTOP_ONLY_MSG } from "../lib/tauri";
import {
  buildSteelCheckInputs,
  isSteelProfile,
  profileLookupKey,
} from "../lib/steelCheckBuilder";
import {
  buildTimberCheckInputs,
  matchSupportedTimberGrade,
} from "../lib/timberCheckBuilder";

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

  /** Draai staal + hout in één run. Resolves wanneer de state gevuld is. */
  run: (data: CheckRunData) => Promise<void>;
  /** Wis resultaten (bijv. wanneer het model wijzigt). */
  clear: () => void;
}

// Module-level caches — de profieldatabase en houtklassen veranderen niet
// tijdens een sessie, dus één invoke per app-start volstaat.
let profileDbCache: Map<string, SteelProfile> | null = null;
let timberGradesCache: string[] | null = null;

async function getProfileDb(): Promise<Map<string, SteelProfile>> {
  if (profileDbCache) return profileDbCache;
  const profiles = await invoke<SteelProfile[]>("list_steel_profiles");
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
  timberGradesCache = await invoke<string[]>("list_timber_grades");
  return timberGradesCache;
}

export const useCheckStore = create<CheckState>((set) => ({
  results: [],
  skipped: [],
  isRunning: false,
  error: null,
  lastRunAt: null,

  run: async (data: CheckRunData) => {
    if (!isTauriApp()) {
      set({ error: DESKTOP_ONLY_MSG, isRunning: false });
      return;
    }
    set({ isRunning: true, error: null });
    try {
      const [profileDb, timberGrades] = await Promise.all([
        getProfileDb(),
        getTimberGrades(),
      ]);

      const steel = buildSteelCheckInputs({ ...data, profileDb });
      const timber = buildTimberCheckInputs({ ...data, supportedGrades: timberGrades });

      // Eerlijkheid: elke staaf die nergens terechtkwam expliciet melden.
      const covered = new Set<number>([
        ...steel.inputs.map((i) => i.beam_id),
        ...timber.inputs.map((i) => i.beam_id),
        ...steel.skipped.map((s) => s.beamId),
        ...timber.skipped.map((s) => s.beamId),
      ]);
      const skipped: CheckSkip[] = [...steel.skipped, ...timber.skipped];
      for (const b of data.beams) {
        if (!covered.has(b.id)) {
          skipped.push({
            beamId: b.id,
            reason: `niet herkend als staal of hout (materiaal "${b.material ?? "—"}", profiel "${b.profile ?? "—"}") — geen normtoetsing mogelijk`,
          });
        }
      }
      // Zichtbaar in de devtools-console én in het toetsingspaneel.
      for (const s of skipped) {
        console.info(`[Toetsing] staaf ${s.beamId} overgeslagen — ${s.reason}`);
      }

      const [steelResults, timberResults] = await Promise.all([
        steel.inputs.length > 0
          ? invoke<BeamCheckResult[]>("check_steel_beams", { inputs: steel.inputs })
          : Promise.resolve<BeamCheckResult[]>([]),
        timber.inputs.length > 0
          ? invoke<TimberBeamCheckResult[]>("check_timber_beams", { inputs: timber.inputs })
          : Promise.resolve<TimberBeamCheckResult[]>([]),
      ]);

      const merged: MemberCheckResult[] = [...steelResults, ...timberResults].sort(
        (a, b) => a.beam_id - b.beam_id,
      );

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
 * de gebruiker vroeg te waarschuwen (geen invoke nodig).
 */
export function anyCheckableBeams(beams: Beam[]): boolean {
  return beams.some(
    (b) =>
      isSteelProfile(b.profile ?? "HEA160") ||
      matchSupportedTimberGrade(b.material) !== null,
  );
}
