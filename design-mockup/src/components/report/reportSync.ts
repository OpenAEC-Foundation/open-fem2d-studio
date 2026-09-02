/**
 * reportSync — live synchronisatie tussen het hoofdvenster en losgekoppelde
 * rapportvensters ("Naast je scherm", R5).
 *
 * ARCHITECTUURKEUZE (gedocumenteerd, zie plan R5):
 *
 * De modelstate leeft in de useFemStore-HOOK-instantie van App.tsx — een
 * losgekoppeld venster (eigen webview/eigen React-root) kan die dus nooit
 * direct lezen. Daarom pusht het hoofdvenster bij elke relevante wijziging
 * één volledig, JSON-serialiseerbaar snapshot (model + solver-uitkomsten +
 * toetsresultaten + rapportinstellingen) naar alle rapportvensters:
 *
 *  - Transport: BroadcastChannel (zelfde origin — dekt de browser-dev-
 *    omgeving én WebView2, waar alle Tauri-vensters één Chromium-profiel
 *    delen) ÉN het Tauri-eventsysteem (emit/listen — dekt webview-
 *    implementaties zonder gedeeld BroadcastChannel-proces). Beide kanalen
 *    versturen hetzelfde bericht; de ontvanger dedupliceert op (src, seq),
 *    dus dubbel bezorgen is onschadelijk. Tauri-events serialiseren naar
 *    JSON, vandaar het Wire-formaat: Maps ↔ entry-arrays.
 *
 *  - Handshake: een rapportvenster meldt zich met "hello" (en herhaalt dat
 *    kort tot het eerste snapshot binnen is — dekt races tijdens het
 *    registreren van listeners); het hoofdvenster antwoordt direct met een
 *    snapshot en pusht daarna alleen zolang er aangemelde vensters zijn
 *    ("bye" bij sluiten). Start het hoofdvenster opnieuw, dan roept
 *    "main-ready" alle nog openstaande rapportvensters terug.
 *
 *  - Rapportinstellingen (papierformaat, oriëntatie, sectie-toggles,
 *    combinatiekeuze) zijn GEDEELD tussen de vensters — dat verrast het
 *    minst: het rapport is één document, waar je het ook bekijkt. Een
 *    wijziging in het losgekoppelde venster gaat als "settings"-bericht naar
 *    het hoofdvenster, dat zijn eigen reportStore aanpast en het volledige
 *    snapshot terug-broadcast (één echo; een guard voorkomt een lus).
 *    Alleen de ZOOM blijft per venster — die is puur schermweergave.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportData } from "./ReportDataContext";
import {
  useReportStore,
  type ReportOrientation,
  type ReportPageSize,
} from "../../stores/reportStore";
import { useCheckStore } from "../../stores/checkStore";
import type { MemberCheckResult, CheckSkip } from "../../lib/checkTypes";
import type {
  NodalDisp,
  NodalReaction,
  ElementForces,
  PlateResult,
  SolverResult,
} from "../fem/solver/types";
import type {
  LoadCombination,
  Envelope,
  EnvelopeElementSpan,
  EnvelopeReaction,
} from "../fem/solver/combinations";
import { isTauriApp } from "../../lib/tauri";

// ── Kanalen & identiteit ──────────────────────────────────────────────────

const CHANNEL_NAME = "openaec-report-sync";
const TAURI_EVENT = "openaec:report-sync";

/** Uniek per JS-context (venster); filtert eigen berichten eruit
 *  (Tauri-emit bezorgt óók aan het versturende venster). */
const WINDOW_ID = `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let seqCounter = 0;
const nextSeq = () => ++seqCounter;

// ── Wire-formaat (JSON-serialiseerbaar; Maps als entry-arrays) ────────────

type WireCombination = Omit<LoadCombination, "factors"> & {
  factors: [number, number][];
};

interface WireSolverResult {
  displacements: [number, NodalDisp][];
  reactions: [number, NodalReaction][];
  elements: [number, ElementForces][];
  maxDisplacement: number;
  /** Plaatspanningen (P5.2) — al JSON-veilig (arrays), 1-op-1 mee. */
  plateElements?: PlateResult[];
}

interface WireEnvelope {
  elements: [number, EnvelopeElementSpan][];
  reactions: [number, EnvelopeReaction][];
  maxDisplacement: number;
  maxDisplacementCombinationId: number | null;
}

interface WireReportData {
  nodes: ReportData["nodes"];
  beams: ReportData["beams"];
  plates: ReportData["plates"];
  supports: ReportData["supports"];
  loads: ReportData["loads"];
  loadCases: ReportData["loadCases"];
  structuralGrid: ReportData["structuralGrid"];
  selfWeightEnabled: boolean;
  combinations: WireCombination[];
  combinationResults: [number, WireSolverResult][] | null;
  /** Per-belastinggeval-resultaten (P5.2) — zelfde wire-vorm. */
  caseResults: [number, WireSolverResult][] | null;
  envelope: WireEnvelope | null;
}

/** Toetsresultaten (checkStore) — al JSON-veilig, 1-op-1 mee in het snapshot. */
interface WireCheckState {
  results: MemberCheckResult[];
  skipped: CheckSkip[];
  lastRunAt: number | null;
}

/** Gedeelde rapportinstellingen (zoom bewust NIET — die is per venster). */
interface WireReportSettings {
  pageSize: ReportPageSize;
  orientation: ReportOrientation;
  hiddenSections: Record<string, boolean>;
  resultCombo: number | "envelope" | null;
}

type ReportSyncMessage =
  | { kind: "hello" | "bye" | "main-ready"; src: string; seq: number }
  | {
      kind: "snapshot";
      src: string;
      seq: number;
      data: WireReportData;
      settings: WireReportSettings;
      check: WireCheckState;
    }
  | { kind: "settings"; src: string; seq: number; settings: WireReportSettings };

// ── (De)serialisatie ──────────────────────────────────────────────────────

function wireSolverResult(r: SolverResult): WireSolverResult {
  return {
    displacements: [...r.displacements],
    reactions: [...r.reactions],
    elements: [...r.elements],
    maxDisplacement: r.maxDisplacement,
    ...(r.plateElements ? { plateElements: r.plateElements } : {}),
  };
}

function unwireSolverResult(w: WireSolverResult): SolverResult {
  return {
    displacements: new Map(w.displacements),
    reactions: new Map(w.reactions),
    elements: new Map(w.elements),
    maxDisplacement: w.maxDisplacement,
    ...(w.plateElements ? { plateElements: w.plateElements } : {}),
  };
}

function serializeReportData(d: ReportData): WireReportData {
  return {
    nodes: d.nodes,
    beams: d.beams,
    plates: d.plates,
    supports: d.supports,
    loads: d.loads,
    loadCases: d.loadCases,
    structuralGrid: d.structuralGrid,
    selfWeightEnabled: d.selfWeightEnabled,
    combinations: d.combinations.map((c) => ({ ...c, factors: [...c.factors] })),
    combinationResults: d.combinationResults
      ? [...d.combinationResults].map(
          ([id, r]) => [id, wireSolverResult(r)] as [number, WireSolverResult],
        )
      : null,
    caseResults: d.caseResults
      ? [...d.caseResults].map(
          ([id, r]) => [id, wireSolverResult(r)] as [number, WireSolverResult],
        )
      : null,
    envelope: d.envelope
      ? {
          elements: [...d.envelope.elements],
          reactions: [...d.envelope.reactions],
          maxDisplacement: d.envelope.maxDisplacement,
          maxDisplacementCombinationId: d.envelope.maxDisplacementCombinationId,
        }
      : null,
  };
}

function deserializeReportData(w: WireReportData): ReportData {
  const envelope: Envelope | null = w.envelope
    ? {
        elements: new Map(w.envelope.elements),
        reactions: new Map(w.envelope.reactions),
        maxDisplacement: w.envelope.maxDisplacement,
        maxDisplacementCombinationId: w.envelope.maxDisplacementCombinationId,
      }
    : null;
  return {
    nodes: w.nodes,
    beams: w.beams,
    // Oudere hoofdvensters sturen nog geen platen mee — defensief leeg.
    plates: w.plates ?? [],
    supports: w.supports,
    loads: w.loads,
    loadCases: w.loadCases,
    structuralGrid: w.structuralGrid,
    selfWeightEnabled: w.selfWeightEnabled,
    combinations: w.combinations.map((c) => ({ ...c, factors: new Map(c.factors) })),
    combinationResults: w.combinationResults
      ? new Map(w.combinationResults.map(([id, r]) => [id, unwireSolverResult(r)]))
      : null,
    // ?? — oudere hoofdvensters sturen dit veld nog niet mee.
    caseResults: w.caseResults
      ? new Map(w.caseResults.map(([id, r]) => [id, unwireSolverResult(r)]))
      : null,
    envelope,
  };
}

// ── Transport-plumbing ────────────────────────────────────────────────────

/** Eén zend-kanaal per venster (nooit gesloten — leeft zolang de app). */
let senderChannel: BroadcastChannel | null | undefined;
function getSender(): BroadcastChannel | null {
  if (senderChannel === undefined) {
    try {
      senderChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      senderChannel = null;
    }
  }
  return senderChannel;
}

/** Verstuur via BroadcastChannel én (indien Tauri) het eventsysteem. */
function sendMessage(msg: ReportSyncMessage): void {
  try {
    getSender()?.postMessage(msg);
  } catch {
    // structured clone faalt niet op ons wire-formaat; defensief.
  }
  if (isTauriApp()) {
    import("@tauri-apps/api/event")
      .then(({ emit }) => emit(TAURI_EVENT, msg))
      .catch(() => {});
  }
}

/** Registreer een ontvanger op beide kanalen; retourneert cleanup. */
function attachReceiver(onMessage: (raw: unknown) => void): () => void {
  let disposed = false;
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (e) => onMessage(e.data);
  } catch {
    bc = null;
  }
  let unlistenTauri: (() => void) | undefined;
  if (isTauriApp()) {
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen(TAURI_EVENT, (e) => onMessage(e.payload)))
      .then((u) => {
        if (disposed) u();
        else unlistenTauri = u;
      })
      .catch(() => {});
  }
  return () => {
    disposed = true;
    bc?.close();
    unlistenTauri?.();
  };
}

/**
 * Dedupliceer op (src, seq): hetzelfde bericht kan via twee kanalen
 * binnenkomen. Retourneert true wanneer het bericht nieuw is.
 */
function isFresh(seen: Map<string, number>, msg: { src: string; seq: number }): boolean {
  const last = seen.get(msg.src) ?? -1;
  if (msg.seq <= last) return false;
  seen.set(msg.src, msg.seq);
  return true;
}

function currentSettings(): WireReportSettings {
  const s = useReportStore.getState();
  return {
    pageSize: s.pageSize,
    orientation: s.orientation,
    hiddenSections: s.hiddenSections,
    resultCombo: s.resultCombo,
  };
}

// ── Hoofdvenster: publisher ───────────────────────────────────────────────

/**
 * Altijd-gemonteerde, onzichtbare component in het hoofdvenster: pusht het
 * rapportsnapshot naar losgekoppelde vensters. Bewust een eigen component
 * (geen hook in App) zodat de reportStore-/checkStore-abonnementen niet heel
 * App.tsx laten re-renderen.
 */
export function ReportWindowSync({ data }: { data: ReportData }): null {
  const pageSize = useReportStore((s) => s.pageSize);
  const orientation = useReportStore((s) => s.orientation);
  const hiddenSections = useReportStore((s) => s.hiddenSections);
  const resultCombo = useReportStore((s) => s.resultCombo);
  const checkResults = useCheckStore((s) => s.results);
  const checkSkipped = useCheckStore((s) => s.skipped);
  const checkLastRunAt = useCheckStore((s) => s.lastRunAt);

  // Altijd de actuele stand voor asynchrone aanvragen (hello-afhandeling).
  const latestRef = useRef<ReportData>(data);
  latestRef.current = data;

  /** Aangemelde rapportvensters — zonder aanmelding wordt er niets
   *  geserialiseerd of verstuurd (geen overhead als er geen venster is). */
  const listenersRef = useRef<Set<string>>(new Set());

  const publish = useCallback(() => {
    if (listenersRef.current.size === 0) return;
    const check = useCheckStore.getState();
    sendMessage({
      kind: "snapshot",
      src: WINDOW_ID,
      seq: nextSeq(),
      data: serializeReportData(latestRef.current),
      settings: currentSettings(),
      check: {
        results: check.results,
        skipped: check.skipped,
        lastRunAt: check.lastRunAt,
      },
    });
  }, []);

  // Publiceer bij elke relevante wijziging. Granulaire deps: de veld-
  // identiteiten wijzigen alleen bij echte mutaties (useFemStore maakt per
  // mutatie nieuwe arrays), niet bij elke App-render (zoom, tool, …).
  useEffect(() => {
    publish();
  }, [
    publish,
    data.nodes,
    data.beams,
    data.plates,
    data.supports,
    data.loads,
    data.loadCases,
    data.combinations,
    data.structuralGrid,
    data.selfWeightEnabled,
    data.combinationResults,
    data.caseResults,
    data.envelope,
    pageSize,
    orientation,
    hiddenSections,
    resultCombo,
    checkResults,
    checkSkipped,
    checkLastRunAt,
  ]);

  // Ontvang hello/bye/settings van rapportvensters.
  useEffect(() => {
    const seen = new Map<string, number>();
    const onMessage = (raw: unknown) => {
      const msg = raw as ReportSyncMessage | null;
      if (!msg || typeof msg !== "object" || !("kind" in msg)) return;
      if (msg.src === WINDOW_ID) return;
      if (!isFresh(seen, msg)) return;
      switch (msg.kind) {
        case "hello":
          listenersRef.current.add(msg.src);
          publish();
          break;
        case "bye":
          listenersRef.current.delete(msg.src);
          break;
        case "settings":
          // Wijziging uit een rapportvenster → in de eigen store zetten; de
          // publish-effect hierboven broadcast daarna vanzelf het volledige
          // snapshot terug (één echo, geen lus — zie guard in de ontvanger).
          useReportStore.setState({ ...msg.settings });
          break;
        default:
          break; // snapshot/main-ready van onszelf is al weggefilterd
      }
    };
    const detach = attachReceiver(onMessage);
    // Hoofdvenster (her)start → nog openstaande rapportvensters melden zich
    // opnieuw aan en krijgen direct weer een vers snapshot.
    sendMessage({ kind: "main-ready", src: WINDOW_ID, seq: nextSeq() });
    return detach;
  }, [publish]);

  return null;
}

// ── Losgekoppeld venster: ontvanger ───────────────────────────────────────

/**
 * Hook voor het losgekoppelde rapportvenster: meldt zich aan bij het
 * hoofdvenster en levert de laatst ontvangen modelstate (null zolang er nog
 * geen snapshot binnen is). Past binnenkomende rapportinstellingen en
 * toetsresultaten toe op de LOKALE zustand-stores (die zijn per venster) en
 * stuurt lokale instellingswijzigingen terug naar het hoofdvenster.
 */
export function useDetachedReportSync(): ReportData | null {
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    const seen = new Map<string, number>();
    // Echo-guard: instellingen die we net uit een snapshot hebben toegepast
    // mogen niet als "lokale wijziging" terug naar het hoofdvenster.
    let applyingRemote = false;
    let gotSnapshot = false;

    const sendHello = () =>
      sendMessage({ kind: "hello", src: WINDOW_ID, seq: nextSeq() });

    const onMessage = (raw: unknown) => {
      const msg = raw as ReportSyncMessage | null;
      if (!msg || typeof msg !== "object" || !("kind" in msg)) return;
      if (msg.src === WINDOW_ID) return;
      if (msg.kind === "main-ready") {
        // Hoofdvenster is (opnieuw) gestart → opnieuw aanmelden.
        sendHello();
        return;
      }
      if (msg.kind !== "snapshot") return;
      if (!isFresh(seen, msg)) return;
      gotSnapshot = true;
      setData(deserializeReportData(msg.data));
      applyingRemote = true;
      try {
        useReportStore.setState({ ...msg.settings });
        useCheckStore.setState({
          results: msg.check.results,
          skipped: msg.check.skipped,
          lastRunAt: msg.check.lastRunAt,
          isRunning: false,
          error: null,
        });
      } finally {
        applyingRemote = false;
      }
    };

    // Lokale instellingswijziging (sectie-toggle, formaat, combinatiekeuze)
    // → naar het hoofdvenster. Zoom blijft bewust per venster.
    const unsubscribe = useReportStore.subscribe((state, prev) => {
      if (applyingRemote) return;
      if (
        state.pageSize === prev.pageSize &&
        state.orientation === prev.orientation &&
        state.hiddenSections === prev.hiddenSections &&
        state.resultCombo === prev.resultCombo
      ) {
        return; // alleen zoom gewijzigd — niet syncen
      }
      sendMessage({
        kind: "settings",
        src: WINDOW_ID,
        seq: nextSeq(),
        settings: {
          pageSize: state.pageSize,
          orientation: state.orientation,
          hiddenSections: state.hiddenSections,
          resultCombo: state.resultCombo,
        },
      });
    });

    const detachReceiver = attachReceiver(onMessage);
    sendHello();
    // Herhaal de aanmelding kort totdat het eerste snapshot binnen is: dekt
    // de race waarin het antwoord van het hoofdvenster arriveert vóórdat de
    // (asynchrone) Tauri-listener hier geregistreerd was. Zonder hoofdvenster
    // (rapport-URL direct geopend) stopt de poging vanzelf.
    let tries = 0;
    const retry = window.setInterval(() => {
      if (gotSnapshot || ++tries > 10) {
        window.clearInterval(retry);
        return;
      }
      sendHello();
    }, 500);

    const sayBye = () =>
      sendMessage({ kind: "bye", src: WINDOW_ID, seq: nextSeq() });
    window.addEventListener("pagehide", sayBye);

    return () => {
      window.clearInterval(retry);
      window.removeEventListener("pagehide", sayBye);
      sayBye();
      unsubscribe();
      detachReceiver();
    };
  }, []);

  return data;
}
