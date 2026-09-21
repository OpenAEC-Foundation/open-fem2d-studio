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
import type { Beam, Node, Plate, Support } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { StabiliteitVoorToets } from "../components/fem/solver/alphaCr";
import type { Gevolgklasse } from "../components/fem/solver/normcombinaties";
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
import type { TimberBuildData } from "../lib/timberCheckBuilder";
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
import { buildPlaatCheckInputs, type PlaatSkip } from "../lib/plaatCheckBuilder";
import type { PlateCheckResult } from "../lib/types/plaat/PlateCheckResult";
import { isVrijMateriaal } from "../lib/vrijMateriaal";
import type { NationaleBijlageCode } from "../lib/normAanduidingen";
import {
  bepaalKruipPerStaaf,
  kolomMetKruipcoefficient,
  kruipWaardenPerStaaf,
  type KruipInvoerProject,
} from "../lib/kruipcoefficient";
import type { CreepCoefficientResponse } from "../lib/types/concrete/CreepCoefficientResponse";

/**
 * Roep de Rust-rekenkern aan, waar de app ook draait.
 *
 * In de desktop-app gaat dat via Tauri; in de browser via de dev-brug. De
 * aanroepers merken het verschil niet, en dat is de bedoeling — de toetsing
 * hoort niet af te hangen van de schil waarin de app toevallig staat.
 * Geëxporteerd zodat ook de korfeditor (M-N-κ-diagram) dezelfde weg neemt.
 *
 * ── EEN ANTWOORD DAT GEEN ANTWOORD IS ──────────────────────────────────────
 *
 * `/api/toetsing` bestaat alleen zolang de ONTWIKKELSERVER draait; die
 * middleware zit in `vite.config.ts` en niet in de gebouwde bestanden. Vraagt
 * een statische bouw in de browser toch om een toetsing, dan krijgt hij geen
 * 404 maar de `index.html` van de app met status 200 — de gewone terugval van
 * een enkelbladige toepassing. Dat is de gevaarlijkste soort antwoord: het ziet
 * er geslaagd uit. `.json().catch(() => null)` maakte er `null` van, en dat
 * `null` ging als resultaat naar de aanroeper. Het venster tekende dan niets,
 * zonder één woord waarom.
 *
 * Daarom wordt hier op de LETTERLIJKE tekst gewacht en zelf ontleed: is zij
 * geen JSON, dan is er geen rekenkern aan de andere kant en zegt de fout dat,
 * in plaats van de gebruiker met een lege tekening achter te laten.
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
  const ruw = await antwoord.text();
  let data: unknown = null;
  let isJson = true;
  try {
    data = JSON.parse(ruw);
  } catch {
    isJson = false;
  }
  if (!isJson) {
    throw new Error(
      `De rekenkern is hier niet bereikbaar: /api/toetsing gaf geen JSON terug ` +
        `(status ${antwoord.status}). Buiten de desktop-app loopt de toetsing via de ` +
        `dev-brug van de ontwikkelserver; in een gebouwde webversie bestaat die niet.`,
    );
  }
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
  /**
   * Platen (wandschijven). De staal- en houtbouwer gebruiken de hoekknopen
   * om een staafeind in een plaat niet als vrij eind aan te zien
   * (`lib/doorgaandeLijn.ts`). Optioneel: zonder lijst geldt een knoop zonder
   * oplegging en zonder andere staaf als vrij.
   *
   * Een VOLLEDIGE plaat (met `id`) wordt daarnaast zelf getoetst
   * (`lib/plaatCheckBuilder.ts`, kern `check_plates`). Een aanroeper die alleen
   * hoekknopen meegeeft, toetst geen platen.
   */
  plates?: (Pick<Plate, "nodeIds"> & Partial<Plate>)[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
  /**
   * Gevolgklasse van het project — voor de staalkern alleen ter vermelding
   * (`consequence_class`); de factoren zitten al in de combinaties. Ontbreekt → CC2.
   */
  gevolgklasse?: Gevolgklasse;
  /**
   * De nationale bijlage van het project (normnaad). Zij gaat als `bijlage`
   * naar elke rekenkern en bepaalt daar de nationaal bepaalde parameters —
   * γ_M, k_cr, de doorbuigingsgrenzen, de dekkingseisen, de kipmethode.
   * Ontbreekt → de enige gevulde bijlage; zie `lib/normAanduidingen.ts`.
   */
  nationaleBijlage?: NationaleBijlageCode;
  /**
   * De belastinggevallen, voor de belastingduur PER UGT-combinatie van de
   * hout- en CLT-toetsing (EN 1995-1-1 3.1.3(2), `lib/belastingduur.ts`).
   * Ontbreekt de lijst, dan rekenen die met één klasse voor alle combinaties.
   */
  loadCases?: TimberBuildData["loadCases"];
  /**
   * De gevallen met een werkzame last (de sleutels van `perCase`): een leeg
   * geval maakt een combinatie niet korter. Staat hier zodat de
   * profielvarianten precies dezelfde afleiding krijgen als de toetsing.
   */
  gevallenMetLast?: readonly number[];
  /**
   * Het analysetype en α_cr per combinatie van de rekengang waarop getoetst
   * wordt (`solver/alphaCr.ts`). De staal- en houtbouwer zetten er bij eerste
   * orde onder de grens een kanttekening mee bij elke op druk belaste staaf.
   */
  stabiliteit?: StabiliteitVoorToets;
  /**
   * De kruipcoëfficiënt φ(∞,t₀) van het PROJECT (art. 3.1.4), dezelfde waarde
   * die de fysisch niet-lineaire lus als `standaardPhiInfT0` krijgt. De
   * kolomtoets gebruikt hem voor elke staaf met een §5.8-blok zonder eigen
   * waarde (`korvenUitStaven`), zodat de gebruiker φ niet twee keer opgeeft.
   * `undefined` = niet opgegeven; de kern meldt dat dan.
   */
  standaardPhiInfT0?: number;
  /**
   * De projectinvoer voor φ(∞,t₀) volgens bijlage B (RH, t₀, cementklasse).
   * Alleen gebruikt als `standaardPhiInfT0` ontbreekt: een opgegeven waarde
   * gaat voor. De kern rekent per staaf met h₀ uit diens doorsnede
   * (`bepaalKruipPerStaaf`); `null`/`undefined` = niet berekenen.
   */
  kruipInvoer?: KruipInvoerProject | null;
  /**
   * De eerste-orde-oplossing per combinatie na een tweede-orde- of fysisch
   * niet-lineaire rekengang (`lib/eersteOrdeResultaten.ts`), voor r_m en φ_ef
   * van de betonkolomtoets (§5.8.3.1(1), (5.19); issue #35). `undefined` = de
   * rekengang was eerste orde of er is geen kolom.
   */
  eersteOrdeResultaten?: Map<number, SolverResult>;
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
  /**
   * φ(∞,t₀) volgens bijlage B per betonstaaf, zoals de kern hem uitschreef —
   * alleen gevuld als het project geen φ opgeeft en bijlage B aan staat. Om
   * dezelfde reden als `beff` in de store: het rapport toont de afleiding, en
   * de dekkingslijn en de profielvarianten moeten dezelfde waarde gebruiken als
   * de toetsing. Een array en geen Map, want het rapportsnapshot gaat als JSON.
   */
  kruip: CreepCoefficientResponse[];
  /** Staven waarvoor de kern φ volgens bijlage B weigerde, met zijn reden. */
  kruipMislukt: { beamId: number; reden: string }[];
  /**
   * De plaattoets (wandschijven), per plaat — APART van `results`, want dat
   * contract is per staaf-id en een plaatnummer kan gelijk zijn aan een
   * staafnummer. Een plaat die de kern weigert staat hier met `geweigerd`.
   */
  plateResults: PlateCheckResult[];
  /** Platen die niet naar de kern gingen (geen of onbruikbaar materiaal), met reden. */
  plateSkipped: PlaatSkip[];
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
  /**
   * De KERNINVOER van de laatste run, per kern, precies zoals de vijf bouwers
   * hem samenstelden en naar de rekenkern stuurden.
   *
   * WAAROM. `results` is wat de kern terugstuurde; zonder de bijbehorende
   * invoer is dat niet te reproduceren. Wie dezelfde staaf rechtstreeks door
   * de kern wil halen — de GUI-bediening doet dat om te bewijzen dat de app
   * hetzelfde antwoord toont als de kern geeft, en een rapport-invoerhoofdstuk
   * heeft hetzelfde nodig — vindt hier de exacte verzoeken. Het is dezelfde
   * "één bron"-gedachte als bij `lastRunData`, één laag dieper.
   *
   * `null` zolang er niet gedraaid is, en weer `null` na `clear()`.
   */
  lastRunInputs: {
    steel: ReturnType<typeof buildSteelCheckInputs>["inputs"];
    timber: ReturnType<typeof buildTimberCheckInputs>["inputs"];
    clt: ReturnType<typeof buildCltCheckInputs>["inputs"];
    beton: ReturnType<typeof buildBetonCheckInputs>["inputs"];
    spanning: ReturnType<typeof buildSpanningCheckInputs>["inputs"];
    plaat: ReturnType<typeof buildPlaatCheckInputs>["inputs"];
  } | null;

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
export function korvenUitStaven(
  beams: Beam[],
  /**
   * φ(∞,t₀) van het project (art. 3.1.4). Vult `phi_inf_t0` van het §5.8-blok
   * aan waar de staaf zelf geen waarde heeft — dezelfde voorrangsregel als de
   * BGT-stijfheidslus, uit `lib/kruipcoefficient.ts`.
   */
  standaardPhiInfT0?: number | null,
  /**
   * φ(∞,t₀) volgens bijlage B per staaf-id (`kruipWaardenPerStaaf`). Geldt
   * alleen waar staaf en project niets opgeven.
   */
  berekendePhi?: ReadonlyMap<number, number>,
): Map<number, BetonStaafConfig> {
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
      // en zonder een aangenomen schoring of kniklengte. Alleen φ(∞,t₀) wordt
      // aangevuld met de projectwaarde als de staaf er zelf geen heeft; zonder
      // blok maakt de projectwaarde van de staaf geen kolom.
      kolom: kolomMetKruipcoefficient(cfg.betonKolom, standaardPhiInfT0, berekendePhi?.get(b.id)),
    });
  }
  return korven;
}

/**
 * De generatie van de toetsuitslag: elke `run` en elke `clear` hoogt haar op.
 *
 * WAAROM (issue #18, basisaudit ruw 31). Een ronde is asynchroon: tussen het
 * vertrek naar de rekenkern en het antwoord kan het model veranderen. `clear()`
 * wiste dan wel de oude uitslag, maar de lopende ronde schreef zijn antwoord
 * er daarna gewoon overheen. Die uitslag is gesleuteld op STAAFNUMMER, en
 * staafnummers worden hergebruikt (`Math.max + 1`): verwijder staaf 6, teken
 * een nieuwe, en de nieuwe staaf 6 kreeg de UC-badge, de kaart en de
 * rapportregel van de oude — een betonbalk-uitslag op een stalen staaf.
 * Hetzelfde gebeurt als een oudere, tragere ronde na een nieuwere terugkomt.
 *
 * Een ronde schrijft dus alleen nog als er sinds zijn vertrek niets gewist of
 * opnieuw gestart is; anders gooit hij zijn antwoord weg. Liever geen uitslag
 * dan een uitslag van een ander model.
 */
let toetsGeneratie = 0;
/** De generatie van de laatst GESTARTE ronde — voor het afsluiten van `isRunning`. */
let laatsteRonde = 0;

export const useCheckStore = create<CheckState>((set) => ({
  results: [],
  skipped: [],
  beff: [],
  kruip: [],
  kruipMislukt: [],
  plateResults: [],
  plateSkipped: [],
  isRunning: false,
  error: null,
  lastRunAt: null,
  lastRunData: null,
  lastRunInputs: null,

  run: async (data: CheckRunData) => {
    // Geen omgevingscontrole meer: de toetsing loopt altijd mee met de
    // berekening. Is de rekenkern onbereikbaar, dan komt dat als een gewone
    // fout terug uit `roepKern` en staat het in het toetsingspaneel — in
    // plaats van dat de toetsing er stilzwijgend niet is.
    const mijnRonde = ++toetsGeneratie;
    laatsteRonde = mijnRonde;
    /**
     * Is deze ronde ingehaald (gewist of door een nieuwere vervangen)? Dan
     * schrijft hij niets. `isRunning` zet hij alleen terug als er geen nieuwere
     * ronde loopt — die sluit zichzelf af.
     */
    const ingehaald = (): boolean => {
      if (mijnRonde === toetsGeneratie) return false;
      if (laatsteRonde === mijnRonde) set({ isRunning: false });
      return true;
    };
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
      // `alleBeams`: de doorgaande lijn en het vrije staafeind worden op het
      // HELE model herkend, ook als een deel van de staven hieronder wordt
      // weggefilterd.
      const steel = buildSteelCheckInputs({
        ...data,
        beams: data.beams.filter((b) => !isVrijMateriaal(b.material)),
        alleBeams: data.beams,
        profileDb,
      });
      // De houtbouwer krijgt de CLT-staven niet te zien: qua materiaal zijn
      // ze hout, maar hun profiel is een opbouw en geen b × h — anders meldde
      // hij ze als "geen rechthoek" terwijl de CLT-bouwer ze wél toetst.
      const timber = buildTimberCheckInputs({
        ...data,
        beams: data.beams.filter((b) => !isCltProfiel(b.profile)),
        alleBeams: data.beams,
        supportedGrades: timberGrades,
      });
      const clt = buildCltCheckInputs({ ...data, supportedGrades: timberGrades });
      // De meewerkende flensbreedte moet vóór de bouwer bekend zijn: hij
      // belandt in de doorsnede zelf, niet als losse correctie erna. De hele
      // afleiding wordt bewaard — zie het veld `beff` hierboven.
      const beffUitkomsten = await bepaalBeffPerStaaf(data, roepKern);
      // φ(∞,t₀) volgens bijlage B, per staaf uit de kern — alleen als het
      // project geen waarde opgeeft (die gaat voor). Dezelfde functie als de
      // BGT-stijfheidslus in App.tsx gebruikt, dus dezelfde waarde.
      const kruip = await bepaalKruipPerStaaf(
        data.beams,
        data.kruipInvoer,
        data.standaardPhiInfT0,
        roepKern,
        data.nationaleBijlage,
      );
      for (const m of kruip.mislukt) {
        console.info(`[Toetsing] staaf ${m.beamId}: φ(∞,t₀) volgens bijlage B niet bepaald — ${m.reden}`);
      }
      const beton = buildBetonCheckInputs({
        ...data,
        korven: korvenUitStaven(data.beams, data.standaardPhiInfT0, kruipWaardenPerStaaf(kruip)),
        supportedClasses: concreteClasses,
        bEffPerStaaf: bEffWaardenPerStaaf(beffUitkomsten),
      });
      const spanning = buildSpanningCheckInputs(data);
      // Platen: alleen volledige platen (met id) — zie `CheckRunData.plates`.
      const plaat = buildPlaatCheckInputs({
        nodes: data.nodes,
        plates: (data.plates ?? []).filter((p): p is Plate => typeof p.id === "number"),
        combinations: data.combinations,
        combinationResults: data.combinationResults,
        nationaleBijlage: data.nationaleBijlage,
        loadCases: data.loadCases,
        gevallenMetLast: data.gevallenMetLast,
      });
      for (const s of plaat.skipped) {
        console.info(`[Toetsing] plaat ${s.plateId} overgeslagen — ${s.reason}`);
      }

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

      const [steelResults, timberResults, cltResults, betonResults, spanningResults, plaatResults] =
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
          plaat.inputs.length > 0
            ? roepKern<PlateCheckResult[]>("check_plates", plaat.inputs)
            : Promise.resolve<PlateCheckResult[]>([]),
        ]);

      const merged: MemberCheckResult[] = [
        ...steelResults,
        ...timberResults,
        ...cltResults,
        ...betonResults,
        ...spanningResults,
      ].sort((a, b) => a.beam_id - b.beam_id);

      if (ingehaald()) return;
      set({
        results: merged,
        skipped: skipped.sort((a, b) => a.beamId - b.beamId),
        beff: beffUitkomsten,
        kruip: [...kruip.perStaaf.values()],
        kruipMislukt: kruip.mislukt,
        plateResults: [...plaatResults].sort((a, b) => a.plate_id - b.plate_id),
        plateSkipped: [...plaat.skipped].sort((a, b) => a.plateId - b.plateId),
        isRunning: false,
        error: null,
        lastRunAt: Date.now(),
        lastRunData: data,
        lastRunInputs: {
          steel: steel.inputs,
          timber: timber.inputs,
          clt: clt.inputs,
          beton: beton.inputs,
          spanning: spanning.inputs,
          plaat: plaat.inputs,
        },
      });
    } catch (e) {
      // Ook een fout van een ingehaalde ronde hoort bij een ander model: hij
      // mag de uitslag of de foutbanner van de lopende ronde niet overschrijven.
      if (ingehaald()) return;
      // EEN MISLUKTE RONDE LAAT GEEN OUDE UITSLAG ACHTER. Hier werd alleen de
      // fout gezet; resultaten, overgeslagen staven en rapportinvoer van de
      // VORIGE ronde bleven staan. Het toetsingspaneel toonde de foutbanner,
      // maar de UC-badges op het canvas, de projectboom, de PDF-controle en
      // het losse rapportvenster zagen de fout niet en toonden de oude UC.
      // Gemeten (IPE300, q = −18 kN/m): na "eigen gewicht aan" en een
      // mislukte ronde bleef 1,6766 staan waar 1,7074 hoorde. Daarom wist de
      // catch dezelfde velden als `clear()`, en zet hij daarnaast de fout.
      //
      // `String(e)` plakt er "Error: " voor, en die tekst komt woordelijk in
      // het toetsingspaneel én in het betonvenster terecht. De boodschap van de
      // kern is al een volzin; het voorvoegsel maakt haar alleen lelijker.
      set({
        results: [],
        skipped: [],
        beff: [],
        kruip: [],
        kruipMislukt: [],
        plateResults: [],
        plateSkipped: [],
        lastRunAt: null,
        lastRunData: null,
        lastRunInputs: null,
        error: e instanceof Error ? e.message : String(e),
        isRunning: false,
      });
    }
  },

  clear: () => {
    // Een lopende ronde rekent op het model van vóór deze wis; zijn antwoord
    // mag er niet meer in (zie `toetsGeneratie`).
    toetsGeneratie += 1;
    set({
      results: [],
      skipped: [],
      beff: [],
      kruip: [],
      kruipMislukt: [],
      plateResults: [],
      plateSkipped: [],
      error: null,
      lastRunAt: null,
      lastRunData: null,
      lastRunInputs: null,
    });
  },
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

/**
 * Heeft het model een plaat die de toetsing kan oppakken? Een plaat met een
 * materiaal gaat naar de kern (die hem toetst of met reden weigert); een plaat
 * zonder materiaal wordt met reden overgeslagen. Beide horen in het
 * toetsingspaneel, dus elke plaat telt.
 */
export function anyCheckablePlates(plates: readonly { materiaal?: string }[] | undefined): boolean {
  return (plates ?? []).length > 0;
}
