/**
 * bediening.ts — de pagina-kant van het bedieningskanaal.
 *
 * Rust (`gui_control.rs`) zet opdrachten als event `gui-control:opdracht` op
 * het hoofdvenster; deze module voert ze uit met de acties die App.tsx al
 * heeft — dezelfde closures die de knoppen en het canvas gebruiken — en meldt
 * de uitkomst terug via het command `gui_control_antwoord`. Er wordt niets
 * nagebouwd: `toetsen` ís `handleRunMemberChecks`, `korf_zetten` ís
 * `updateBeam`.
 *
 * KLAAR BETEKENT KLAAR. Elke actie komt pas terug als de app in de nieuwe
 * toestand STAAT. Voor de zustand-stores (toetsing, dekkingslijn) gebeurt dat
 * met `wachtOpStore` — een abonnement dat oplost bij de eerste toestand die
 * voldoet. Voor de raamwerkstore, die op React-state draait en niets te
 * abonneren heeft, gebeurt het met `verseRender`: een eigen tik die altijd
 * een commit oplevert, en de hook lost hem op na die commit. Geen timers,
 * geen "even wachten".
 *
 * NOOIT KAAL OP DE VOLGENDE RENDER WACHTEN NA EEN ACTIE. Een opdracht die
 * niets verandert — de weergave zetten naar de weergave die al actief is,
 * dezelfde staaf opnieuw selecteren, hetzelfde analysetype — levert in React
 * geen commit op (gelijke state wordt overgeslagen). Wie dan op "de
 * eerstvolgende render" wacht, wacht tot de time-out van Rust (30 s) en
 * krijgt een fout terwijl er niets mis is (issue #28). Daarom wacht elke
 * actie hieronder op `verseRender`, nooit op `wachtOpRender`.
 *
 * FOUTEN REIZEN MEE. Wat de app zelf zou melden — een korf die
 * `controleerKorf` weigert, toetsen zonder model — gaat letterlijk terug als
 * `fout`. Hier wordt niets vertaald en niets verzonnen.
 *
 * In een gewone sessie doet deze module niets: de hook vraagt Rust eenmalig
 * `gui_control_actief` en luistert alleen als dat waar is.
 */
import { useEffect, useRef, useState } from "react";
import { useCheckStore } from "../stores/checkStore";
import { useDekkingslijnStore } from "../stores/dekkingslijnStore";
import { useReportStore } from "../stores/reportStore";
import { leesRapportKopOverschrijving } from "../components/report/useProjectInfo";
import { leesPagineerToestand } from "../components/report/rapportGereedheid";
import { tocToestand } from "../components/report/toc";
import type { Beam, Selection, SupportType, Load, Analysetype } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { ReinforcementCage } from "../lib/types/concrete/ReinforcementCage";
import {
  lopendeExportId,
  rapportAfronden,
  rapportVoorbereiden,
  wachtOpRekenrust,
} from "./rapportExport";

const EVENT_OPDRACHT = "gui-control:opdracht";

/** Wat één rekengang (App.tsx `rekenDoor`) opleverde. */
export interface RekengangUitkomst {
  gelukt: boolean;
  /**
   * Wat de fysisch niet-lineaire ronde deed: `nvt` (ander analysetype),
   * `gedraaid`, `niets-te-doen` (geen betonstaaf met korf) of `mislukt`.
   */
  fysisch: "nvt" | "gedraaid" | "niets-te-doen" | "mislukt" | "verouderd";
}

/** De rekentoestand die in refs van App.tsx leeft — niet in de render. */
export interface RekenToestand {
  /** Staat er na een modelwijziging een automatische herberekening gepland? */
  herberekeningGepland: boolean;
  /** Aantal rekengangen dat nog loopt (tot en met de toetsing). */
  lopendeRekengangen: number;
  /** Hoogt op bij elke modelwijziging en elke rekengang. */
  generatie: number;
  /** De combinatieresultaten van de laatste VOLTOOIDE rekengang, of null. */
  volledigeRekengang: Map<number, SolverResult> | null;
}

/** Wat App.tsx aan de bediening geeft. Allemaal bestaande closures. */
export interface BedieningActies {
  /** De raamwerkstore van deze render. */
  fem: {
    nodes: readonly { id: number; x: number; z: number }[];
    beams: readonly Beam[];
    /** Platen: tellen mee bij "is er iets te toetsen" (plaattoets). */
    plates?: readonly { materiaal?: string }[];
    loads: readonly Load[];
    loadCases: readonly { id: number; name: string }[];
    combinations: readonly { id: number; name: string }[];
    combinationResults: Map<number, SolverResult> | null;
    analysetype: Analysetype;
    addNode: (x: number, z: number) => number;
    addBeam: (fromId: number, toId: number) => number | null;
    updateBeam: (id: number, updates: Partial<Beam>) => void;
    addSupport: (nodeId: number, type: SupportType, k?: number) => void;
    addLoad: (l: Omit<Load, "id">) => void;
    addLoadCase: (name: string) => void;
    setAnalysetype: (v: Analysetype) => void;
  };
  activeView: string;
  selection: Selection;
  setSelection: (s: Selection) => void;
  setActiveView: (v: string) => void;
  setBottomPanelOpen: (v: boolean) => void;
  handleRunMemberChecks: (opts?: { openPanel?: boolean }) => Promise<void>;
  /**
   * De rekengang van de knop Berekenen — `rekenDoor` in App.tsx, met de
   * fysisch niet-lineaire ronde en de toetsing erachteraan — als belofte die
   * pas inlost als ALLES klaar is. Vroeger riep `rekenen` hier alleen
   * `computeAndStoreSolverOutputs` aan: zonder die ronde en zonder toetsing,
   * zodat een rapport via het kanaal bij tweedeOrdeFysisch op P-Δ-krachten
   * stond waar de knop de gescheurde verdeling gaf.
   */
  rekenDoor: () => Promise<RekengangUitkomst>;
  /** De rekentoestand uit de refs van App.tsx (gepland, lopend, generatie). */
  rekenToestand: () => RekenToestand;
  /**
   * De reden dat de laatste rekengang mislukte, of null. Zonder dit veld gaf
   * "rekenen" altijd "controleer het model (opleggingen, belastingen)" terug,
   * ook bij een onbekende doorsnede of een kolom die knikt.
   */
  laatsteRekenfout: () => string | null;
  createDetachedWindow: (opts: { view: string; title: string; width?: number; height?: number }) => Promise<string>;
  /** Het pad van "Openen…": tekst → project in de store, mét bibliotheken. */
  laadProjectTekst: (tekst: string, pad?: string) => Promise<void>;
}

interface Opdracht {
  id: number;
  naam: string;
  args: Record<string, unknown>;
}

// ── Wachten ─────────────────────────────────────────────────────────────────

/** Lost op bij de eerste store-toestand die voldoet; anders een fout na `ms`. */
function wachtOpStore<S>(
  store: { getState: () => S; subscribe: (l: (s: S) => void) => () => void },
  voldoet: (s: S) => boolean,
  ms: number,
  wat: string,
): Promise<S> {
  return new Promise((los, weiger) => {
    const nu = store.getState();
    if (voldoet(nu)) { los(nu); return; }
    const timer = window.setTimeout(() => {
      af();
      weiger(new Error(`wachten op ${wat} verliep na ${Math.round(ms / 1000)} s`));
    }, ms);
    const af = store.subscribe((s) => {
      if (voldoet(s)) { window.clearTimeout(timer); af(); los(s); }
    });
  });
}

// ── De hook ─────────────────────────────────────────────────────────────────

/**
 * Installeer de bediening. Geeft terug of het kanaal aanstaat, zodat de
 * statusbalk het kan tonen.
 */
export function useBediening(acties: BedieningActies): boolean {
  const [actief, setActief] = useState(false);
  const actiesRef = useRef(acties);
  actiesRef.current = acties;

  // `wachtOpRender`: beloftes die na de eerstvolgende commit worden ingelost.
  const wachtenden = useRef<Array<() => void>>([]);
  useEffect(() => {
    const w = wachtenden.current;
    wachtenden.current = [];
    for (const los of w) los();
  });
  const wachtOpRender = () =>
    new Promise<void>((los) => { wachtenden.current.push(los); });
  // `verseRender`: forceer een commit en wacht erop. Nodig na een ASYNCHRONE
  // actie (een rekengang met toetsing): de commits die daarbij hoorden kunnen
  // al voorbij zijn, en dan zou `wachtOpRender` op een render wachten die
  // nooit komt. Evengoed na een actie die niets verandert (#28): React slaat
  // gelijke state over en commit dan niet. Met een eigen tik komt er altijd
  // één, en daarna staat de laatste modelstate gegarandeerd in `actiesRef`.
  const [, setTik] = useState(0);
  const verseRender = () => {
    const p = wachtOpRender();
    setTik((n) => n + 1);
    return p;
  };

  useEffect(() => {
    let af: (() => void) | null = null;
    let gestopt = false;
    (async () => {
      let aan = false;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        aan = await invoke<boolean>("gui_control_actief");
      } catch {
        aan = false; // geen Tauri, of een oudere app zonder het command
      }
      if (!aan || gestopt) return;
      setActief(true);
      const { listen } = await import("@tauri-apps/api/event");
      const { invoke } = await import("@tauri-apps/api/core");
      af = await listen<Opdracht>(EVENT_OPDRACHT, async (e) => {
        const { id, naam, args } = e.payload;
        let antwoord: { ok: true; uitkomst: unknown } | { ok: false; fout: string };
        try {
          const uitkomst = await voerUit(naam, args ?? {}, actiesRef, wachtOpRender, verseRender);
          antwoord = { ok: true, uitkomst };
        } catch (err) {
          antwoord = { ok: false, fout: err instanceof Error ? err.message : String(err) };
        }
        try {
          await invoke("gui_control_antwoord", { id, uitkomst: antwoord });
        } catch (err) {
          console.error("[bediening] antwoord niet afgeleverd:", err);
        }
      });
    })();
    return () => { gestopt = true; af?.(); };
  }, []);

  return actief;
}

// ── De acties ───────────────────────────────────────────────────────────────

/**
 * Voer één opdracht uit. Geëxporteerd voor test-bediening-wachten.mjs, dat
 * zonder app nagaat dat geen actie op een render wacht die niet komt.
 * `wachtOpRender` gaat alleen door naar `rapportVoorbereiden`, dat hem pas
 * gebruikt nadat het de weergave aantoonbaar heeft gewisseld.
 */
export async function voerUit(
  naam: string,
  args: Record<string, unknown>,
  ref: { current: BedieningActies },
  wachtOpRender: () => Promise<void>,
  verseRender: () => Promise<void>,
): Promise<unknown> {
  const a = () => ref.current;
  const getal = (k: string): number => {
    const v = args[k];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`\`${k}\` ontbreekt of is geen getal`);
    return v;
  };
  const staaf = (id: number): Beam => {
    const b = a().fem.beams.find((x) => x.id === id);
    if (!b) throw new Error(`geen staaf met id ${id}`);
    return b;
  };

  switch (naam) {
    case "status": {
      const f = a().fem;
      return {
        weergave: a().activeView,
        selectie: a().selection,
        aantalKnopen: f.nodes.length,
        aantalStaven: f.beams.length,
        aantalLasten: f.loads.length,
        analysetype: f.analysetype,
        toetsingLoopt: useCheckStore.getState().isRunning,
        rekentoestand: (() => {
          const r = a().rekenToestand();
          return {
            herberekeningGepland: r.herberekeningGepland,
            lopendeRekengangen: r.lopendeRekengangen,
            generatie: r.generatie,
          };
        })(),
        // De rapportinstellingen zoals ze NU staan — zo is na een export te
        // controleren dat type, papier en kop zijn teruggezet.
        rapport: (() => {
          const s = useReportStore.getState();
          return {
            type: s.rapportType,
            formaat: s.pageSize,
            orientatie: s.orientation,
            kopOverschreven: leesRapportKopOverschrijving() !== null,
            lopendeExport: lopendeExportId(),
            // De toestand achter het klaar-signaal van de export: zo is van
            // buiten te zien waarom een export (nog) wacht.
            paginering: leesPagineerToestand(),
            inhoudsopgave: tocToestand(),
          };
        })(),
        // Genoeg om een staaf te kiezen zonder het hele model op te vragen:
        // materiaal en profiel zeggen wat het is, `heeftKorf` of hij al
        // wapening draagt.
        staven: f.beams.map((b) => ({
          id: b.id,
          material: b.material ?? null,
          profileName: (b as { profileName?: string }).profileName ?? null,
          heeftKorf: b.checkConfig?.betonKorf != null,
        })),
      };
    }

    case "model_laden": {
      const tekst = args.tekst;
      if (typeof tekst !== "string") throw new Error("`tekst` ontbreekt");
      await a().laadProjectTekst(tekst, typeof args.pad === "string" ? args.pad : undefined);
      await verseRender();
      const f = a().fem;
      return { aantalKnopen: f.nodes.length, aantalStaven: f.beams.length, aantalLasten: f.loads.length };
    }

    case "model_bouwen": {
      const f = a().fem;
      const knopen = (args.nodes as Array<{ x: number; z: number }> | undefined) ?? [];
      const nodeIds = knopen.map((n) => f.addNode(n.x, n.z));
      const staven = (args.beams as Array<{ from: number; to: number; updates?: Partial<Beam> }> | undefined) ?? [];
      const beamIds: Array<number | null> = [];
      for (const s of staven) {
        const van = nodeIds[s.from - 1], naar = nodeIds[s.to - 1];
        if (van === undefined || naar === undefined) throw new Error(`staaf ${s.from}→${s.to}: knoopindex buiten bereik`);
        const id = f.addBeam(van, naar);
        if (id != null && s.updates) f.updateBeam(id, s.updates);
        beamIds.push(id);
      }
      for (const s of (args.supports as Array<{ node: number; type: SupportType; k?: number }> | undefined) ?? []) {
        const nid = nodeIds[s.node - 1];
        if (nid === undefined) throw new Error(`oplegging op knoop ${s.node}: buiten bereik`);
        f.addSupport(nid, s.type, s.k);
      }
      for (const naam of (args.load_cases as string[] | undefined) ?? []) f.addLoadCase(naam);
      for (const l of (args.loads as Array<Omit<Load, "id">> | undefined) ?? []) f.addLoad(l);
      await verseRender();
      return { nodeIds, beamIds };
    }

    case "staaf_selecteren": {
      const id = getal("id");
      staaf(id);
      a().setSelection({ type: "beam", id });
      await verseRender();
      return staaf(id);
    }

    case "korf_zetten": {
      const id = getal("beamId");
      staaf(id);
      const korf = args.korf as ReinforcementCage | undefined;
      if (!korf || typeof korf !== "object") throw new Error("`korf` ontbreekt");
      // De korf hangt aan `checkConfig.betonKorf`, niet aan de staaf zelf —
      // dezelfde plek waar het startmodel en de eigenschappendialoog hem
      // zetten. De rest van checkConfig blijft staan.
      const huidig = staaf(id).checkConfig ?? {};
      a().fem.updateBeam(id, { checkConfig: { ...huidig, betonKorf: korf } });
      await verseRender();
      return staaf(id);
    }

    case "analysetype_zetten": {
      const v = args.analysetype;
      if (v !== "eersteOrde" && v !== "tweedeOrdeGeometrisch" && v !== "tweedeOrdeFysisch") {
        throw new Error(`onbekend analysetype ${String(v)}`);
      }
      a().fem.setAnalysetype(v);
      await verseRender();
      return { analysetype: a().fem.analysetype };
    }

    case "rekenen": {
      // Dezelfde rekengang als de knop Berekenen, en pas terug als hij HELEMAAL
      // klaar is: doorrekenen, bij tweedeOrdeFysisch de fysisch niet-lineaire
      // ronde, en de toetsing. Stond er na een modelwijziging al een
      // herberekening gepland, dan eerst die laten uitlopen — anders zou die
      // na deze gang nog starten en de toetsing onder de client vandaan wissen.
      const deadline = performance.now() + 590_000;
      await wachtOpRekenrust(a, deadline);
      const uitkomst = await a().rekenDoor();
      await verseRender();
      await wachtOpRekenrust(a, deadline);
      // Mislukt de rekengang, dan de ECHTE reden terug — en nooit de
      // combinatieresultaten van een vorige gang.
      const fout = a().laatsteRekenfout();
      const cr = a().fem.combinationResults;
      if (!uitkomst.gelukt || fout || !cr) {
        throw new Error(`doorrekenen mislukt: ${fout ?? "de rekengang leverde geen combinatieresultaten"}`);
      }
      const t = useCheckStore.getState();
      return {
        ...samenvatting(cr, a().fem.combinations),
        analysetype: a().fem.analysetype,
        fysischeRonde: uitkomst.fysisch,
        // De toetsing liep mee; wat ze opleverde staat hier samengevat, de
        // uitkomsten zelf via `toetsen_uitlezen`.
        toetsing: {
          fout: t.error,
          getoetst: t.results.length,
          overgeslagen: t.skipped.length,
          uitgevoerdOp: t.lastRunAt,
        },
      };
    }

    case "toetsen": {
      await a().handleRunMemberChecks({ openPanel: false });
      await wachtOpStore(useCheckStore, (s) => !s.isRunning, 300_000, "de toetsing");
      return toetsenUitlezen();
    }

    case "toetsen_uitlezen":
      return toetsenUitlezen();

    case "dekkingslijn_openen": {
      const id = getal("beamId");
      staaf(id);
      const st = useDekkingslijnStore.getState();
      const v0 = st.volgnummer;
      a().setSelection({ type: "beam", id });
      a().setBottomPanelOpen(true);
      await verseRender();
      // Het venster vraagt de kern pas na een korte vertraging; wacht tot hij
      // óf klaar is (volgnummer hoger) óf aantoonbaar bezig, en dan tot klaar.
      // Was deze staaf al open en klaar, dan verandert er niets en is het
      // bestaande antwoord het antwoord.
      try {
        await wachtOpStore(useDekkingslijnStore,
          (s) => s.volgnummer > v0 || s.bezig, 3_000, "het dekkingslijnvenster");
      } catch {
        const s = useDekkingslijnStore.getState();
        if (!(s.beamId === id && !s.bezig && (s.antwoord || s.fout))) {
          throw new Error("het dekkingslijnvenster kwam niet in beweging — is het een betonstaaf met korf?");
        }
      }
      const klaar = await wachtOpStore(useDekkingslijnStore,
        (s) => !s.bezig && s.beamId === id && (s.antwoord !== null || s.fout !== null),
        180_000, "het dekkingslijn-antwoord");
      if (klaar.fout) throw new Error(klaar.fout);
      // Verzoek én antwoord: het verzoek is precies wat naar de kern ging, zodat
      // een client het rechtstreeks kan naspelen (vier wegen, één antwoord).
      return { verzoek: klaar.verzoek, antwoord: klaar.antwoord };
    }

    case "weergave_zetten": {
      const v = args.view;
      if (typeof v !== "string") throw new Error("`view` ontbreekt");
      a().setActiveView(v);
      await verseRender();
      return { weergave: a().activeView };
    }

    case "rapport_losmaken": {
      const label = await a().createDetachedWindow({ view: "report", title: "Rapport", width: 1000, height: 900 });
      return { label };
    }

    case "screenshot_dom": {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(document.body, { useCORS: true, logging: false });
      return { dataUrl: canvas.toDataURL("image/png") };
    }

    // Het standaardrapport als PDF: Rust (`rapport_pdf`) roept deze twee aan,
    // met het printen ertussen. Zie rapportExport.ts.
    case "rapport_voorbereiden":
      return rapportVoorbereiden(args, a, wachtOpRender, verseRender);

    case "rapport_afronden":
      return rapportAfronden(args, a);

    default:
      throw new Error(`onbekende bedieningsopdracht \`${naam}\``);
  }
}

function toetsenUitlezen() {
  const s = useCheckStore.getState();
  // `inputs`: de kerninvoer zoals de bouwers hem samenstelden. Daarmee kan een
  // client dezelfde staaf rechtstreeks door de kern halen en het antwoord
  // naast dat van de GUI leggen — vier wegen, één antwoord.
  return {
    results: s.results,
    skipped: s.skipped,
    // De plaattoets: per plaat het resultaat (of de weigering) en de platen
    // die met reden niet naar de kern gingen. `inputs.plaat` is de kerninvoer.
    plate_results: s.plateResults,
    skipped_plates: s.plateSkipped,
    error: s.error,
    lastRunAt: s.lastRunAt,
    inputs: s.lastRunInputs,
  };
}

/** Per combinatie de uitersten — genoeg om te zien dát er gerekend is, en wat. */
function samenvatting(
  cr: Map<number, SolverResult>,
  combos: readonly { id: number; name: string }[],
) {
  const uit: Record<string, unknown>[] = [];
  for (const [id, r] of cr) {
    let mMax = 0, vMax = 0, nMax = 0, wMax = 0;
    // Alleen de reeksen die hier tellen; via `unknown` omdat ElementForces
    // geen indexsignatuur heeft en de veldnamen per pad kunnen verschillen.
    const els = (r as unknown as { elements?: Map<number, Record<string, number[] | undefined>> }).elements;
    if (els) {
      for (const e of els.values()) {
        for (const x of e.bendingMoment ?? []) mMax = Math.max(mMax, Math.abs(x));
        for (const x of e.shearForce ?? []) vMax = Math.max(vMax, Math.abs(x));
        for (const x of e.axialForce ?? e.normalForce ?? []) nMax = Math.max(nMax, Math.abs(x));
        for (const x of e.deflection ?? []) wMax = Math.max(wMax, Math.abs(x));
      }
    }
    uit.push({
      combinatie: id,
      naam: combos.find((c) => c.id === id)?.name ?? String(id),
      M_max_kNm: mMax / 1e6,
      V_max_kN: vMax / 1e3,
      N_max_kN: nMax / 1e3,
      w_max_mm: wMax,
    });
  }
  return { combinaties: uit };
}
