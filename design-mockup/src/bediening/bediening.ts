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
 * abonneren heeft, gebeurt het met `wachtOpRender`: de hook lost hem op na
 * de eerstvolgende commit. Geen timers, geen "even wachten".
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
import type { Beam, Selection, SupportType, Load, Analysetype } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { ReinforcementCage } from "../lib/types/concrete/ReinforcementCage";

const EVENT_OPDRACHT = "gui-control:opdracht";

/** Wat App.tsx aan de bediening geeft. Allemaal bestaande closures. */
export interface BedieningActies {
  /** De raamwerkstore van deze render. */
  fem: {
    nodes: readonly { id: number; x: number; z: number }[];
    beams: readonly Beam[];
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
  computeAndStoreSolverOutputs: () => { combinationResults: Map<number, SolverResult> } | null | undefined;
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
          const uitkomst = await voerUit(naam, args ?? {}, actiesRef, wachtOpRender);
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

async function voerUit(
  naam: string,
  args: Record<string, unknown>,
  ref: { current: BedieningActies },
  wachtOpRender: () => Promise<void>,
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
      await wachtOpRender();
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
      await wachtOpRender();
      return { nodeIds, beamIds };
    }

    case "staaf_selecteren": {
      const id = getal("id");
      staaf(id);
      a().setSelection({ type: "beam", id });
      await wachtOpRender();
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
      await wachtOpRender();
      return staaf(id);
    }

    case "analysetype_zetten": {
      const v = args.analysetype;
      if (v !== "eersteOrde" && v !== "tweedeOrdeGeometrisch" && v !== "tweedeOrdeFysisch") {
        throw new Error(`onbekend analysetype ${String(v)}`);
      }
      a().fem.setAnalysetype(v);
      await wachtOpRender();
      return { analysetype: a().fem.analysetype };
    }

    case "rekenen": {
      const uit = a().computeAndStoreSolverOutputs();
      await wachtOpRender();
      const cr = uit?.combinationResults ?? a().fem.combinationResults;
      if (!cr) throw new Error("doorrekenen leverde geen combinatieresultaten — controleer het model (opleggingen, belastingen)");
      return samenvatting(cr, a().fem.combinations);
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
      await wachtOpRender();
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
      await wachtOpRender();
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
