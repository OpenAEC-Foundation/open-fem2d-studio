/**
 * checkStore — resultaten van de toetsing.
 *
 * Eén run draait de vijf Rust-kernen parallel — staal (`check_steel_beams`),
 * hout (`check_timber_beams`), kruislaaghout (`check_clt_beams`), beton
 * (`check_concrete_beams`) en de vrije spanningstoets
 * (`check_stress_beams`) — en merget de resultaten op staaf-id in één lijst
 * met hetzelfde NamedCheck-contract. Niet-toetsbare staven komen met
 * expliciete reden in `skipped` (zichtbaar in het toetsingspaneel) — geen
 * stille aannames.
 *
 * De vijfde kern is bewust NORM-ONAFHANKELIJK: een doorsnede plus een
 * toelaatbare spanning, getoetst op de vergelijkspanning van von Mises. Hij
 * bedient de materialen die buiten EN 1992/1993/1995 vallen (natuursteen,
 * een gietstuk, een kunststof) en de snelle spanningscontrole op een
 * bestaand profiel.
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
import type { Beam, Node, Support } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { BeamCheckResult } from "../lib/types/steel/BeamCheckResult";
import type { TimberBeamCheckResult } from "../lib/types/timber/TimberBeamCheckResult";
import type { CltBeamCheckResult } from "../lib/types/timber/CltBeamCheckResult";
import type { ConcreteBeamCheckResult } from "../lib/types/concrete/ConcreteBeamCheckResult";
import type { SpanningBeamCheckResult } from "../lib/types/spanning/SpanningBeamCheckResult";
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
import {
  bEffWaardenPerStaaf,
  bepaalBeffPerStaaf,
  type BeffStaafUitkomst,
} from "../lib/beffLiggerlijn";
import { buildSpanningCheckInputs } from "../lib/spanningCheckBuilder";
import { isVrijMateriaal } from "../lib/vrijMateriaal";

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
  /**
   * Opleggingen. De doorbuigingstoets gebruikt ze om een echt tussensteunpunt
   * te onderscheiden van een knoop waar een ligger alleen is doorgeknipt;
   * zonder dat onderscheid kan de toetsing niet zeggen of het per-staafdeel
   * toetsen van de doorbuiging klopt. Optioneel, zodat een aanroeper die ze
   * niet heeft nog steeds kan toetsen — het rapport zegt dan dat het
   * onderscheid niet gemaakt kon worden.
   */
  supports?: Support[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
}

interface CheckState {
  results: MemberCheckResult[];
  skipped: CheckSkip[];
  /**
   * De afleiding van de meewerkende flensbreedte per T-/L-betonstaaf
   * (5.3.2.1), zoals de kern hem heeft uitgeschreven.
   *
   * WAAROM DIT IN DE STORE STAAT EN NIET WEGGEGOOID WORDT. De afgeleide b_eff
   * belandt in de doorsnede waarmee getoetst is, en die staat in
   * `section_name` — maar de WEG ernaartoe (welk geval van figuur 5.2, uit
   * welke overspanningen l₀ volgde, welke grens van (5.7a)/(5.7b) won) zat
   * tot nu toe alleen in de console. Het rapport heeft hem nodig, en het
   * losgekoppelde rapportvenster ook; vandaar hier, naast de toetsresultaten
   * die dezelfde weg reizen.
   *
   * Een array en geen Map: het rapportsnapshot gaat als JSON over.
   */
  beff: BeffStaafUitkomst[];
  isRunning: boolean;
  error: string | null;
  lastRunAt: number | null;
  /**
   * De modelgegevens waarmee de laatste run is gedraaid.
   *
   * WAAROM DIE BEWAARD WORDEN. De profielvarianten (`stores/variantStore.ts`)
   * toetsen dezelfde staaf nog eens met een andere doorsnede, en hebben
   * daarvoor exact dezelfde invoer nodig: dezelfde knopen, dezelfde
   * combinaties, hetzelfde krachtsverloop. Ze uit de React-boom opnieuw
   * doorgeven zou een tweede weg naar dezelfde gegevens openen — met het
   * risico dat de varianten op een ander model rekenen dan de toetsing die
   * ernaast staat. Hier is er maar één bron.
   *
   * `null` zolang er niet gedraaid is, en weer `null` na `clear()`.
   */
  lastRunData: CheckRunData | null;

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

/**
 * De profieldatabase van de rekenkern, gesleuteld op `profileLookupKey`.
 * Geëxporteerd zodat de profielvarianten (`stores/variantStore.ts`) dezelfde
 * gecachete lijst gebruiken en niet een tweede keer bij de kern langsgaan.
 */
export async function getProfileDb(): Promise<Map<string, SteelProfile>> {
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

/** Sterkteklassen van de houtkern; zie `getProfileDb` voor het waarom van de export. */
export async function getTimberGrades(): Promise<string[]> {
  if (timberGradesCache) return timberGradesCache;
  timberGradesCache = await roepKern<string[]>("list_timber_grades");
  return timberGradesCache;
}

/** Betonsterkteklassen van de betonkern; zie `getProfileDb`. */
export async function getConcreteClasses(): Promise<string[]> {
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
export function korvenUitStaven(beams: Beam[]): Map<number, BetonStaafConfig> {
  const korven = new Map<number, BetonStaafConfig>();
  for (const b of beams) {
    const cfg = b.checkConfig;
    if (!cfg?.betonKorf) continue;
    korven.set(b.id, {
      korf: cfg.betonKorf,
      staalsoort: cfg.betonStaalsoort,
      aantalStroken: cfg.betonStroken,
      staaltak: cfg.betonStaaltak,
      // De milieuklasse stond al in het model voor de dekkingstoets van
      // 4.4.1; §7.3 leest hem als ingang van tabel 7.1N (w_max). Zonder deze
      // regel zou de scheurwijdtetoets in de app altijd melden dat de
      // milieuklasse ontbreekt terwijl de gebruiker haar heeft ingevuld.
      milieuklasse: cfg.betonMilieuklasse,
      // §5.8. Het blok gaat als GEHEEL door naar de bouwer en van daar naar de
      // kern; hier wordt het niet uitgepakt. Ontbreekt het, dan blijft het
      // `undefined` en meldt de kern dat §5.8 niet is getoetst — met de reden,
      // en zonder een aangenomen schoring of kniklengte.
      kolom: cfg.betonKolom,
    });
  }
  return korven;
}

export const useCheckStore = create<CheckState>((set) => ({
  results: [],
  skipped: [],
  beff: [],
  isRunning: false,
  error: null,
  lastRunAt: null,
  lastRunData: null,

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

      // De staalbouwer krijgt de staven met een vrij materiaal niet te zien:
      // hun profiel kán een staalprofiel zijn ("even staal op spanning
      // toetsen"), maar hun materiaal is geen staalsoort — anders meldde hij
      // ze als "geen ondersteunde staalsoort" terwijl de spanningskern ze
      // wél toetst. Zelfde reden als waarom de houtbouwer de CLT-staven niet
      // ziet.
      const steel = buildSteelCheckInputs({
        ...data,
        beams: data.beams.filter((b) => !isVrijMateriaal(b.material)),
        profileDb,
      });
      // De houtbouwer krijgt de CLT-staven niet te zien: qua materiaal zijn
      // ze hout, maar hun profiel is een opbouw en geen b × h — anders meldde
      // hij ze als "geen rechthoek" terwijl de CLT-bouwer ze wél toetst.
      const timber = buildTimberCheckInputs({
        ...data,
        beams: data.beams.filter((b) => !isCltProfiel(b.profile)),
        supportedGrades: timberGrades,
      });
      const clt = buildCltCheckInputs({ ...data, supportedGrades: timberGrades });
      // De meewerkende flensbreedte moet vóór de bouwer bekend zijn: hij
      // belandt in de doorsnede zelf, niet als losse correctie erna. De hele
      // afleiding wordt bewaard — zie het veld `beff` hierboven.
      const beffUitkomsten = await bepaalBeffPerStaaf(data, roepKern);
      const beton = buildBetonCheckInputs({
        ...data,
        korven: korvenUitStaven(data.beams),
        supportedClasses: concreteClasses,
        bEffPerStaaf: bEffWaardenPerStaaf(beffUitkomsten),
      });
      const spanning = buildSpanningCheckInputs(data);

      // Eerlijkheid: elke staaf die nergens terechtkwam expliciet melden.
      const bouwers: { inputs: { beam_id: number }[]; skipped: CheckSkip[] }[] = [
        steel, timber, clt, beton, spanning,
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
            reason: `niet herkend als staal, hout, kruislaaghout, beton of vrij materiaal (materiaal "${b.material ?? "—"}", profiel "${b.profile ?? "—"}") — geen toetsing mogelijk`,
          });
        }
      }
      // Zichtbaar in de devtools-console én in het toetsingspaneel.
      for (const s of skipped) {
        console.info(`[Toetsing] staaf ${s.beamId} overgeslagen — ${s.reason}`);
      }

      const [steelResults, timberResults, cltResults, betonResults, spanningResults] =
        await Promise.all([
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
          spanning.inputs.length > 0
            ? roepKern<SpanningBeamCheckResult[]>("check_stress_beams", spanning.inputs)
            : Promise.resolve<SpanningBeamCheckResult[]>([]),
        ]);

      const merged: MemberCheckResult[] = [
        ...steelResults,
        ...timberResults,
        ...cltResults,
        ...betonResults,
        ...spanningResults,
      ].sort((a, b) => a.beam_id - b.beam_id);

      set({
        results: merged,
        skipped: skipped.sort((a, b) => a.beamId - b.beamId),
        beff: beffUitkomsten,
        isRunning: false,
        error: null,
        lastRunAt: Date.now(),
        lastRunData: data,
      });
    } catch (e) {
      set({ error: String(e), isRunning: false });
    }
  },

  clear: () =>
    set({
      results: [],
      skipped: [],
      beff: [],
      error: null,
      lastRunAt: null,
      lastRunData: null,
    }),
}));

/**
 * Snelle voorspelling of een run überhaupt iets zal toetsen — gebruikt om
 * de gebruiker vroeg te waarschuwen (geen aanroep van de kern nodig).
 */
export function anyCheckableBeams(beams: Beam[]): boolean {
  return beams.some(
    (b) =>
      isVrijMateriaal(b.material) ||
      isSteelProfile(b.profile) ||
      isCltProfiel(b.profile) ||
      matchSupportedTimberGrade(b.material) !== null ||
      matchSupportedConcreteClass(b.material) !== null,
  );
}
