/**
 * windStore — koppeling tussen de (pure) windbelastinggenerator en de
 * model-store van de app.
 *
 * VERANTWOORDELIJKHEDEN
 *  1. De generator-instellingen bewaren en terughalen, en het windgebied +
 *     de terreincategorie uit de projectgegevens volgen.
 *  2. De generatie-uitkomst omzetten naar echte belastinggevallen, lasten en
 *     combinaties, met STABIELE id's per belastinggeval.
 *  3. Opnieuw genereren bij een wijziging in de constructie — idempotent.
 *
 * IDEMPOTENTIE — waarom dit geen oneindige lus wordt
 *  • De regeneratie-effectlus luistert ALLEEN naar `nodes`, `beams` en de
 *    instellingen. De lasten die de generator zelf wegschrijft zitten NIET in
 *    die afhankelijkheden, dus een generatie kan zichzelf niet opnieuw
 *    aanzwengelen.
 *  • Vóór het wegschrijven worden de handtekening van de nieuwe generatie en
 *    die van wat al in het model staat vergeleken. Zijn ze gelijk, dan wordt
 *    er NIETS geschreven: geen nieuwe array-identiteiten, dus ook geen
 *    herberekening.
 *  • Belastinggeval-id's worden hergebruikt op basis van de sleutel, zodat
 *    ook de combinatiefactoren en de actieve tab stabiel blijven.
 *  • De vertraging (150 ms) ligt bewust ONDER de herberekenvertraging van
 *    App.tsx (300 ms): de gegenereerde lasten landen binnen hetzelfde
 *    debounce-venster, zodat één modelwijziging tot één berekening leidt.
 *
 * Meetbaar: `window.__windgen` houdt bij hoe vaak er is geregenereerd,
 * toegepast en overgeslagen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Load, LoadCase } from "../components/fem/femTypes";
import type { FemStore } from "../hooks/useFemStore";
import type { LoadCombination } from "../components/fem/solver/combinations";
import { getSetting, onSettingChange, setSetting } from "../store";
import {
  STANDAARD_WIND_INSTELLINGEN, WIND_COMBI_PREFIX, genereerWindbelasting,
  handtekeningVanGeneratie, handtekeningVanModel,
  type WindGeneratieResultaat, type WindInstellingen,
} from "../lib/wind/windGenerator";
import type { TerreinCategorie, Windgebied } from "../lib/wind/windEurocode";

const INSTELLINGEN_SLEUTEL = "windGenerator";
const REGENERATIE_VERTRAGING_MS = 150;

export type ToepasUitkomst = "toegepast" | "ongewijzigd" | "mislukt";

export interface WindGeneratorStatistiek {
  /** Hoe vaak de generator heeft gedraaid (handmatig + automatisch). */
  regeneraties: number;
  /** Hoe vaak dat tot een schrijfactie in het model leidde. */
  toegepast: number;
  /** Hoe vaak de uitkomst identiek was en er dus niets is geschreven. */
  overgeslagen: number;
}

export interface WindGeneratorApi {
  instellingen: WindInstellingen;
  setInstellingen: (patch: Partial<WindInstellingen>) => void;
  /** true = de generatie loopt mee met wijzigingen in de constructie. */
  actief: boolean;
  /** Laatste TOEGEPASTE uitkomst (null zolang er niet gegenereerd is). */
  laatste: WindGeneratieResultaat | null;
  /**
   * Telt op bij elke wijziging aan knopen of staven. Het dialoogvenster hangt
   * zijn voorbeeldweergave hieraan op, zodat de samenvatting meebeweegt met
   * de constructie — ook wanneer de generator (nog) niet actief is.
   */
  modelVersie: number;
  /** Draai de generator zonder iets weg te schrijven (voorbeeldweergave). */
  voorbeeld: () => WindGeneratieResultaat;
  /** Draai de generator én schrijf het resultaat weg; zet automatisch aan. */
  genereer: () => { resultaat: WindGeneratieResultaat; uitkomst: ToepasUitkomst };
  /** Verwijder alles wat de generator eerder heeft aangemaakt. */
  wis: () => void;
  statistiek: WindGeneratorStatistiek;
}

// ── Criteria: wat is door de windgenerator gemaakt? ──────────────────────
const isWindGeval = (c: LoadCase) => c.gegenereerd?.bron === "wind";
const isWindLast = (l: Load) => l.gegenereerdDoor === "wind";
const isWindCombinatie = (c: LoadCombination) => c.name.startsWith(WIND_COMBI_PREFIX);

export function useWindGenerator(fem: FemStore): WindGeneratorApi {
  const [instellingen, setInstellingenState] = useState<WindInstellingen>(STANDAARD_WIND_INSTELLINGEN);
  const [actief, setActief] = useState(false);
  const [laatste, setLaatste] = useState<WindGeneratieResultaat | null>(null);
  const [statistiek, setStatistiek] = useState<WindGeneratorStatistiek>({
    regeneraties: 0, toegepast: 0, overgeslagen: 0,
  });
  // Modelteller — alleen knopen en staven; de lasten die de generator zelf
  // schrijft mogen de teller niet ophogen (dat zou de voorbeeldweergave laten
  // knipperen zonder dat er iets aan de constructie verandert).
  const [modelVersie, setModelVersie] = useState(0);
  useEffect(() => { setModelVersie((v) => v + 1); }, [fem.nodes, fem.beams]);

  // Verse verwijzingen zonder de effectlus opnieuw te laten vuren.
  const femRef = useRef(fem);
  useEffect(() => { femRef.current = fem; });
  const instRef = useRef(instellingen);
  useEffect(() => { instRef.current = instellingen; });

  // ── Instellingen laden + het windgebied uit de projectgegevens volgen ──
  useEffect(() => {
    let leeft = true;
    const pakProject = (p: unknown): Partial<WindInstellingen> => {
      const u = (p as { uitgangspunten?: { windgebied?: Windgebied; terreincategorie?: TerreinCategorie } })
        ?.uitgangspunten;
      if (!u) return {};
      return {
        ...(u.windgebied ? { windgebied: u.windgebied } : {}),
        ...(u.terreincategorie ? { terreincategorie: u.terreincategorie } : {}),
      };
    };
    void (async () => {
      const opgeslagen = await getSetting<Partial<WindInstellingen>>(INSTELLINGEN_SLEUTEL, {});
      const project = await getSetting<unknown>("projectInfo", {});
      if (!leeft) return;
      setInstellingenState((prev) => ({
        ...prev, ...opgeslagen, ...pakProject(project),
      }));
    })();
    let stop: (() => void) | undefined;
    void onSettingChange<unknown>("projectInfo", (p) => {
      if (!leeft) return;
      const patch = pakProject(p);
      if (Object.keys(patch).length === 0) return;
      setInstellingenState((prev) =>
        (prev.windgebied === patch.windgebied && prev.terreincategorie === patch.terreincategorie)
          ? prev : { ...prev, ...patch });
    }).then((f) => { if (leeft) stop = f; else f(); });
    return () => { leeft = false; stop?.(); };
  }, []);

  const setInstellingen = useCallback((patch: Partial<WindInstellingen>) => {
    setInstellingenState((prev) => {
      const volgend = { ...prev, ...patch };
      void setSetting(INSTELLINGEN_SLEUTEL, volgend);
      return volgend;
    });
  }, []);

  // ── Generator draaien ──────────────────────────────────────────────────
  const draai = useCallback((): WindGeneratieResultaat => {
    const f = femRef.current;
    return genereerWindbelasting(
      { nodes: f.nodes, beams: f.beams, loadCases: f.loadCases },
      instRef.current,
    );
  }, []);

  /**
   * Zet de generatie om naar model-objecten en schrijf ze weg — maar alleen
   * wanneer ze inhoudelijk afwijken van wat er al staat.
   */
  const pasToe = useCallback((res: WindGeneratieResultaat): ToepasUitkomst => {
    const f = femRef.current;
    if (!res.ok) return "mislukt";

    // Stabiele id's: bestaande sleutel houdt zijn id, nieuwe sleutels krijgen
    // het eerstvolgende vrije id.
    const bestaand = new Map(
      f.loadCases.filter(isWindGeval).map((c) => [c.gegenereerd!.sleutel, c.id]));
    const bezet = new Set(f.loadCases.map((c) => c.id));
    let volgend = f.loadCases.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    const idVan = new Map<string, number>();
    for (const gv of res.gevallen) {
      const oud = bestaand.get(gv.sleutel);
      if (oud !== undefined) { idVan.set(gv.sleutel, oud); continue; }
      while (bezet.has(volgend)) volgend++;
      idVan.set(gv.sleutel, volgend);
      bezet.add(volgend);
      volgend++;
    }

    const gevallen: LoadCase[] = res.gevallen.map((gv) => ({
      id: idVan.get(gv.sleutel)!,
      name: gv.naam,
      type: "wind",
      gegenereerd: { bron: "wind", sleutel: gv.sleutel },
    }));
    const lasten: Omit<Load, "id">[] = res.lasten.map((l) => ({
      type: "lineLoad" as const,
      caseId: idVan.get(l.gevalSleutel)!,
      beamId: l.beamId,
      q: l.q,
      qDir: "z" as const,
      qCoord: "local" as const,
      ...(l.startFrac !== undefined ? { startFrac: l.startFrac, endFrac: l.endFrac } : {}),
      gegenereerdDoor: "wind" as const,
    }));
    const combinaties: Omit<LoadCombination, "id">[] = res.combinaties.map((c) => ({
      name: c.naam,
      type: c.type,
      formula: c.formule,
      factors: new Map<number, number>([
        ...c.factorenPerCaseId,
        [idVan.get(c.windSleutel)!, c.windFactor],
      ]),
    }));

    // Niets veranderd? Dan ook niets schrijven — dit is de kern van de
    // idempotentie: geen nieuwe identiteiten ⇒ geen extra herberekening.
    const nieuweHandtekening = handtekeningVanGeneratie(
      res.gevallen.map((g) => ({ sleutel: g.sleutel, naam: g.naam })),
      res.lasten,
      res.combinaties,
    );
    const huidigeHandtekening = handtekeningVanModel(f.loadCases, f.loads, f.combinations);
    if (nieuweHandtekening === huidigeHandtekening) return "ongewijzigd";

    f.vervangGegenereerdeBelasting({
      gevallen, lasten, combinaties,
      gevalHoortBijGeneratie: isWindGeval,
      lastHoortBijGeneratie: isWindLast,
      combinatieHoortBijGeneratie: isWindCombinatie,
    });
    return "toegepast";
  }, []);

  const telMee = useCallback((uitkomst: ToepasUitkomst) => {
    setStatistiek((s) => {
      const volgend = {
        regeneraties: s.regeneraties + 1,
        toegepast: s.toegepast + (uitkomst === "toegepast" ? 1 : 0),
        overgeslagen: s.overgeslagen + (uitkomst === "ongewijzigd" ? 1 : 0),
      };
      // Meetpunt voor handmatige verificatie in de browserconsole.
      (window as unknown as Record<string, unknown>).__windgen = volgend;
      return volgend;
    });
  }, []);

  // BEWUST zonder setState: het dialoogvenster roept dit tijdens de render
  // aan (useMemo), en state schrijven tijdens een render is in React verboden.
  const voorbeeld = useCallback(() => draai(), [draai]);

  const genereer = useCallback(() => {
    const res = draai();
    setLaatste(res);
    const uitkomst = pasToe(res);
    telMee(uitkomst);
    if (res.ok) setActief(true);
    return { resultaat: res, uitkomst };
  }, [draai, pasToe, telMee]);

  const wis = useCallback(() => {
    setActief(false);
    setLaatste(null);
    femRef.current.vervangGegenereerdeBelasting({
      gevallen: [], lasten: [], combinaties: [],
      gevalHoortBijGeneratie: isWindGeval,
      lastHoortBijGeneratie: isWindLast,
      combinatieHoortBijGeneratie: isWindCombinatie,
    });
  }, []);

  // ── Automatisch opnieuw genereren bij een constructiewijziging ─────────
  // Let op de afhankelijkheden: nodes, beams en instellingen — NIET loads,
  // loadCases of combinations. Wat de generator zelf schrijft mag hem niet
  // opnieuw aanzwengelen.
  const pasToeRef = useRef(pasToe);
  useEffect(() => { pasToeRef.current = pasToe; });
  const draaiRef = useRef(draai);
  useEffect(() => { draaiRef.current = draai; });
  const telMeeRef = useRef(telMee);
  useEffect(() => { telMeeRef.current = telMee; });

  useEffect(() => {
    if (!actief) return;
    const id = window.setTimeout(() => {
      const res = draaiRef.current();
      setLaatste(res);
      telMeeRef.current(pasToeRef.current(res));
    }, REGENERATIE_VERTRAGING_MS);
    return () => window.clearTimeout(id);
  }, [actief, fem.nodes, fem.beams, instellingen]);

  return {
    instellingen, setInstellingen, actief, laatste, modelVersie,
    voorbeeld, genereer, wis, statistiek,
  };
}
