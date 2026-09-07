/**
 * betonStijfheidStore — het spoor van de fysisch niet-lineaire tweede orde.
 *
 * De lus in `lib/betonStijfheid.ts` levert per belastingcombinatie een
 * `FysischUitkomst`, maar de rekengang gebruikt daarvan alleen `resultaat` —
 * de krachtsverdeling. Alles waarmee die krachtsverdeling NAVERTELD kan
 * worden (de segmentindeling, de (N, M) per segment, M₀, de kromming, de
 * secans-EI, of het segment gescheurd is, de meldingen van de kern en het
 * convergentieverloop) zou daarmee verdwijnen. Deze store houdt dat spoor
 * vast, en is de bron van het rapporthoofdstuk.
 *
 * WAAROM EEN EIGEN STORE EN NIET DE ReportData
 * --------------------------------------------
 * `ReportData` draagt de MODELSTATE plus de solveruitkomsten; die komt via
 * props uit de useFemStore-instantie van App.tsx. Het segmentspoor is geen
 * modelstate maar de uitkomst van een ASYNCHRONE kernaanroep, precies zoals de
 * toetsresultaten in `checkStore`. Het volgt daarom dezelfde weg als die: een
 * eigen zustand-store, gevuld door de rekengang, gewist bij elke
 * modelwijziging, en meegestuurd in het rapportsnapshot naar losgekoppelde
 * vensters.
 *
 * VERSE OF NIETS
 * --------------
 * Wissen gebeurt op dezelfde plaats als `checkStore.clear()`: bij elke
 * model- of lastwijziging, en zodra er met een ANDER analysetype gerekend
 * wordt. Een segmenttabel die bij een vorig model hoort is erger dan geen
 * tabel: hij ziet er precies zo overtuigend uit.
 */
import { create } from "zustand";
import type { CheckSkip } from "../lib/checkTypes";
import type { NonlinearBasis } from "../lib/types/concrete/NonlinearBasis";
import type { SegmentStiffnessResponse } from "../lib/types/concrete/SegmentStiffnessResponse";

/** Eén ronde van de lus, zoals het rapport de convergentie laat zien. */
export interface StijfheidRonde {
  /** 1-gebaseerd; ronde 0 is de indeling en telt niet als oplossing mee. */
  ronde: number;
  /**
   * De grootste relatieve verandering van EI over alle staven en segmenten,
   * `max |EI_nieuw − EI_vorig| / max(|EI_nieuw|, |EI_vorig|)`. `null` in de
   * eerste ronde: er is dan niets om tegen te vergelijken.
   */
  maxRelatieveVerandering: number | null;
  /** Zeiden ALLE staven van de kern dat deze ronde geconvergeerd is? */
  geconvergeerd: boolean;
}

/** Wat één belastingcombinatie fysisch niet-lineair opleverde. */
export interface StijfheidCombinatie {
  combinatieId: number;
  combinatieNaam: string;
  /**
   * De variant waarmee de kern gerekend heeft (besluit B2): UGT-combinaties
   * met rekenwaarden, BGT-combinaties met gemiddelde waarden. Staat óók per
   * segment in het antwoord, want de norm laat dat nooit impliciet.
   */
  grenstoestand: NonlinearBasis;
  /** Aantal opgeloste raamwerkstelsels (ronde 0, de indeling, telt niet mee). */
  ronden: number;
  /** Het convergentieverloop, op volgorde. */
  verloop: StijfheidRonde[];
  /** De kernantwoorden van de LAATSTE ronde, per staaf — de rapporttabel. */
  staven: SegmentStiffnessResponse[];
}

export interface BetonStijfheidState {
  /** De gewenste segmentlengte waarmee gerekend is, mm (besluit B3). */
  segmentLengteMm: number;
  /** Per combinatie het spoor; leeg zolang er niet fysisch gerekend is. */
  combinaties: StijfheidCombinatie[];
  /**
   * Betonstaven die NIET meerekenden, met de reden (geen wapeningskorf, geen
   * herkenbare rechthoek). Zonder deze lijst zou het hoofdstuk stilzwijgend
   * over een betonstaaf heen stappen.
   */
  overgeslagen: CheckSkip[];
  /** Tijdstip van de rekengang, of null wanneer er niets staat. */
  berekendOp: number | null;

  zet: (s: {
    segmentLengteMm: number;
    combinaties: StijfheidCombinatie[];
    overgeslagen: CheckSkip[];
  }) => void;
  /** Wis het spoor (modelwijziging, ander analysetype, mislukte rekengang). */
  clear: () => void;
}

const LEEG = {
  segmentLengteMm: 0,
  combinaties: [] as StijfheidCombinatie[],
  overgeslagen: [] as CheckSkip[],
  berekendOp: null as number | null,
};

export const useBetonStijfheidStore = create<BetonStijfheidState>((set) => ({
  ...LEEG,
  zet: ({ segmentLengteMm, combinaties, overgeslagen }) =>
    set({ segmentLengteMm, combinaties, overgeslagen, berekendOp: Date.now() }),
  clear: () =>
    // Alleen schrijven wanneer er iets stond: `clear()` loopt bij elke
    // modelwijziging langs, en een gelijke set zou elke abonnee (het
    // rapporthoofdstuk) onnodig laten hertekenen.
    set((s) =>
      s.berekendOp === null && s.combinaties.length === 0 && s.overgeslagen.length === 0
        ? s
        : { ...LEEG },
    ),
}));
