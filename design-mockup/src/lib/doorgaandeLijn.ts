/**
 * doorgaandeLijn.ts — een door tussenknopen geknipte staaf als ÉÉN staaf
 * toetsen, en de staafeinden benoemen die géén gaffel zijn.
 *
 * HET PROBLEEM (basisaudit nr 29 en het kipgedrag "tussenknoop als gaffel")
 *
 * Zet de gebruiker een knoop op een staaf — voor een puntlast, een
 * aansluiting, of gewoon om te knippen — dan bestaat die staaf in het model
 * uit twee delen. De toetsing zag tot september 2026 twee losse staven, elk
 * met eigen lengte, en nam de tussenknoop stilzwijgend als zijdelingse steun
 * en als gaffel:
 *
 *  - kolomknik: HEA160 S235 van 6 m met N_Ed = 300 kN gaf UC 1,162; met een
 *    knoop op 3 m gaf elk deel λ̄_z = 0,802 en UC 0,500 — 2,3 keer zoveel
 *    knikweerstand zonder dat er een steun bij kwam;
 *  - kip: IPE 300 van 6 m vrij opgelegd gaf UC_kip 0,720; met een knoop op
 *    3 m kreeg elk deel L_st = 3000 mm en UC_kip 0,406;
 *  - doorbuiging: per deel gemeten vanaf de koorde van dát deel, tegen L/n
 *    van dat deel.
 *
 * Een knoop in het rekenvlak steunt de knik loodrecht op het vlak nooit, en
 * in het vlak alleen als iets hem vasthoudt. Zonder oplegging is de fysieke
 * staaf de hele lijn.
 *
 * DE OPLOSSING
 *
 * Vóór de toetsing worden staven die in elkaars verlengde liggen, dezelfde
 * doorsnede en hetzelfde materiaal hebben en op de gedeelde knoop geen
 * oplegging hebben (dezelfde herkenning als `collinearContinuations`), tot
 * één VIRTUELE staaf samengevoegd: de lijn van het ene eind naar het andere,
 * met
 *  - de station-arrays van de delen aaneengeregen (krachten, zakking,
 *    rotatie), zodat de kipvelden, de knik en de koorde van de doorbuiging
 *    over de hele lengte gaan;
 *  - de kipsteunen van de delen omgerekend naar fracties van de lijn;
 *  - een opgegeven kniklengte, zeeg of klasse van de delen overgenomen (bij
 *    verschil de ongunstigste, met een notitie).
 *
 * De virtuele staaf krijgt het laagste staafnummer van de delen; de andere
 * delen komen met reden bij de overgeslagen staven. Alles wat de bouwers
 * daarna doen (referentierichting, doorbuiging, kern) ziet gewoon één staaf.
 *
 * STAAFEINDEN (kipgedrag "vrij eind als gaffel")
 *
 * De kern neemt een staafeind als gaffel. Deze module benoemt per staafeind
 * of dat klopt: een eind zonder oplegging en zonder aansluitende staaf is
 * VRIJ (uitkraging, vrijstaande kolom); een eind waar de lijn zonder
 * oplegging doorloopt in een staaf met een ándere doorsnede is DOORLOPEND.
 * Wat de kern daarmee doet staat bij `Staafeind` in de Rust-invoer.
 */
import type { Beam, BeamCheckConfig, Node, Support } from "../components/fem/femTypes";
import type { ElementForces, SolverResult } from "../components/fem/solver/types";
import type { CheckSkip } from "./checkTypes";
import type { Staafeinden } from "./types/steel/Staafeinden";
// Wederzijdse import met de staalbouwer (die roept deze module aan); alleen
// functies, gelezen bij de aanroep — dan zijn beide modules geladen.
import { beamLengthMm, collinearContinuations } from "./steelCheckBuilder";
import { spiegelElementKrachten, spiegelFracties } from "./referentierichting";

/** Eén deel van een doorgaande lijn, in de volgorde van begin naar eind. */
export interface LijnDeel {
  beam: Beam;
  /** De staaf is tegen de lijnrichting in getekend (from/to omgekeerd). */
  gespiegeld: boolean;
  lengteMm: number;
  /** Afstand van het lijnbegin tot het begin van dit deel (mm). */
  xStartMm: number;
}

/** Een doorgaande lijn van twee of meer delen. */
export interface DoorgaandeLijn {
  /** Het staafnummer waaronder de lijn wordt getoetst: het laagste van de delen. */
  id: number;
  delen: LijnDeel[];
  /** De knopen tussen de delen, in volgorde. */
  tussenknopen: number[];
  from: number;
  to: number;
  lengteMm: number;
}

/** Wat een bouwer nodig heeft om lijnen te herkennen en samen te voegen. */
export interface LijnInvoer {
  nodes: Node[];
  /** De staven die getoetst worden. */
  beams: Beam[];
  supports?: Support[];
  combinationResults: Map<number, SolverResult>;
  /**
   * Alle staven van het model, ook die niet getoetst worden. De herkenning
   * van een doorgaande lijn en van een vrij staafeind kijkt naar het hele
   * model; ontbreekt de lijst, dan gelden `beams` als het hele model.
   */
  alleBeams?: Beam[];
  /** Platen (wandschijven): een hoekknoop van een plaat is geen vrij eind. */
  plates?: { nodeIds: number[] }[];
}

export interface LijnUitkomst<T extends LijnInvoer> {
  /** Dezelfde invoer, met elke lijn vervangen door haar virtuele staaf. */
  data: T;
  /** Per virtuele staaf de lijn waar hij uit bestaat. */
  lijnen: Map<number, DoorgaandeLijn>;
  /** Per virtuele staaf de toelichting voor `staaf_notities`. */
  notities: Map<number, string[]>;
  /** De delen die niet onder hun eigen nummer worden getoetst, met reden. */
  overgeslagen: CheckSkip[];
}

const nl = (v: number, d = 3): string => v.toFixed(d).replace(".", ",");

function richting(beam: Beam, nodes: Node[]): { x: number; z: number } | null {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  if (l <= 0) return null;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}

/**
 * De doorgaande lijnen tussen de staven in `beams`, herkend op het hele
 * model. Zonder opleggingenlijst wordt er niets samengevoegd: dan is een
 * tussensteunpunt niet van een knip te onderscheiden, en samenvoegen over een
 * steunpunt heen zou een doorgaande ligger als één overspanning toetsen.
 */
export function vindDoorgaandeLijnen(
  beams: Beam[],
  nodes: Node[],
  alleBeams: Beam[],
  supports: Support[] | undefined,
): DoorgaandeLijn[] {
  if (!supports) return [];
  const perId = new Map<number, Beam>(alleBeams.map((b) => [b.id, b]));
  const teToetsen = new Set(beams.map((b) => b.id));
  const gezien = new Set<number>();
  const lijnen: DoorgaandeLijn[] = [];

  for (const start of beams) {
    if (gezien.has(start.id)) continue;
    // Samenhangende component van collineaire vervolgstaven.
    const leden: Beam[] = [];
    const wachtrij = [start];
    gezien.add(start.id);
    while (wachtrij.length > 0) {
      const b = wachtrij.pop()!;
      leden.push(b);
      for (const id of collinearContinuations(b, nodes, alleBeams, supports)) {
        if (gezien.has(id)) continue;
        const other = perId.get(id);
        if (!other) continue;
        gezien.add(id);
        wachtrij.push(other);
      }
    }
    if (leden.length < 2) continue;
    const dir = richting(start, nodes);
    if (!dir) continue;
    // Volgorde langs de lijn: projectie van de knopen op de richting.
    const proj = (id: number): number => {
      const n = nodes.find((k) => k.id === id)!;
      return n.x * dir.x + n.z * dir.z;
    };
    const geordend = leden
      .map((beam) => {
        const pa = proj(beam.from);
        const pb = proj(beam.to);
        return { beam, gespiegeld: pb < pa, pMin: Math.min(pa, pb) };
      })
      .sort((a, b) => a.pMin - b.pMin);
    const delen: LijnDeel[] = [];
    const tussenknopen: number[] = [];
    let x = 0;
    for (let i = 0; i < geordend.length; i++) {
      const { beam, gespiegeld } = geordend[i];
      const lengteMm = beamLengthMm(beam, nodes);
      delen.push({ beam, gespiegeld, lengteMm, xStartMm: x });
      x += lengteMm;
      if (i > 0) tussenknopen.push(gespiegeld ? beam.to : beam.from);
    }
    const eerste = delen[0];
    const laatste = delen[delen.length - 1];
    // Het nummer waaronder de lijn wordt getoetst: het laagste van de delen
    // die in de te toetsen lijst staan (bij een deelselectie via de MCP-server
    // hoort het antwoord onder een gevraagd nummer te staan).
    const kandidaten = leden.filter((b) => teToetsen.has(b.id)).map((b) => b.id);
    lijnen.push({
      id: Math.min(...(kandidaten.length > 0 ? kandidaten : leden.map((b) => b.id))),
      delen,
      tussenknopen,
      from: eerste.gespiegeld ? eerste.beam.to : eerste.beam.from,
      to: laatste.gespiegeld ? laatste.beam.from : laatste.beam.to,
      lengteMm: x,
    });
  }
  return lijnen;
}

/** Begin- of eindvelden van releases/veren, met het voorvoegsel hernoemd. */
function eindVelden<T extends object>(
  obj: T | undefined,
  van: "start" | "end",
  naar: "start" | "end",
): Partial<T> | undefined {
  if (!obj) return undefined;
  const uit: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith(van) || v === undefined) continue;
    uit[`${naar}${k.slice(van.length)}`] = v;
    n++;
  }
  return n > 0 ? (uit as Partial<T>) : undefined;
}

/** Kipsteunfracties van een deel, als fracties van de hele lijn. */
function fractiesNaarLijn(
  fracties: number[] | undefined,
  deel: LijnDeel,
  lengteMm: number,
): number[] {
  if (!Array.isArray(fracties) || lengteMm <= 0) return [];
  const eigen = fracties.filter((f) => Number.isFinite(f) && f >= 0 && f <= 1);
  const inLijnrichting = deel.gespiegeld ? spiegelFracties(eigen) : eigen;
  return inLijnrichting.map((f) => Math.round(((deel.xStartMm + f * deel.lengteMm) / lengteMm) * 1e12) / 1e12);
}

/**
 * De toetsconfiguratie van de virtuele staaf uit die van de delen. Levert
 * ook de zinnen die zeggen waar de delen het oneens waren.
 */
function voegConfigSamen(lijn: DoorgaandeLijn): { config: BeamCheckConfig | undefined; notities: string[] } {
  const configs = lijn.delen.map((d) => d.beam.checkConfig ?? {});
  const notities: string[] = [];
  const uit: BeamCheckConfig = {};

  const boven = new Set<number>();
  const onder = new Set<number>();
  for (const d of lijn.delen) {
    for (const f of fractiesNaarLijn(d.beam.checkConfig?.lateralRestraints, d, lijn.lengteMm)) boven.add(f);
    for (const f of fractiesNaarLijn(d.beam.checkConfig?.lateralRestraintsBottom, d, lijn.lengteMm)) onder.add(f);
  }
  if (boven.size > 0) uit.lateralRestraints = [...boven].sort((a, b) => a - b);
  if (onder.size > 0) uit.lateralRestraintsBottom = [...onder].sort((a, b) => a - b);

  // Een absolute maat die op een deel is opgegeven, geldt voor de lijn; bij
  // verschillende opgaven de GROOTSTE (de ongunstigste: een langere kniklengte
  // en een grotere kipsteunafstand geven de lagere weerstand).
  const grootste = (sleutel: "bucklingLengthY_m" | "bucklingLengthZ_m" | "ltbSupportSpacing_m", naam: string) => {
    const waarden = configs.map((c) => c[sleutel]).filter((v): v is number => Number.isFinite(v) && (v as number) > 0);
    if (waarden.length === 0) return;
    const max = Math.max(...waarden);
    uit[sleutel] = max;
    if (new Set(waarden).size > 1) {
      notities.push(
        `De delen geven verschillende waarden voor ${naam} (${waarden.map((v) => nl(v)).join(", ")} m); ` +
          `aangehouden is de grootste, ${nl(max)} m — de ongunstigste.`,
      );
    }
  };
  grootste("bucklingLengthY_m", "de kniklengte om de y-as");
  grootste("bucklingLengthZ_m", "de kniklengte om de z-as");
  grootste("ltbSupportSpacing_m", "de kipsteunafstand");

  // Een keuze (klasse, noemer, klimaat- en duurklasse, spanning) die op een
  // deel staat, geldt voor de lijn; verschillen de delen, dan wint het eerste
  // deel dat de keuze heeft gemaakt, en dat staat erbij.
  const eerste = <K extends keyof BeamCheckConfig>(sleutel: K, naam: string) => {
    const waarden = configs.map((c) => c[sleutel]).filter((v) => v !== undefined && v !== null);
    if (waarden.length === 0) return;
    uit[sleutel] = waarden[0];
    if (new Set(waarden.map((v) => JSON.stringify(v))).size > 1) {
      notities.push(
        `De delen verschillen in ${naam}; aangehouden is de waarde van het eerste deel dat ` +
          `haar heeft gezet (${JSON.stringify(waarden[0])}).`,
      );
    }
  };
  eerste("deflectionClass", "de doorbuigingsklasse");
  eerste("deflectionLimitNumerator", "de doorbuigingsnoemer");
  eerste("deflectionAddLimitNumerator", "de noemer van de bijkomende doorbuiging");
  eerste("serviceClass", "de klimaatklasse");
  eerste("loadDuration", "de belastingduurklasse");
  eerste("spanningSigmaZ", "de dwarsspanning");

  // Zeeg: alleen als alle delen dezelfde geven — een zeeg hoort bij de
  // overspanning als geheel. Bij verschil geen zeeg (de veilige kant) en een
  // notitie; bij het splitsen wist de app hem al met een melding.
  const zegen = configs.map((c) => c.preCamber_mm).filter((v): v is number => Number.isFinite(v) && v !== 0);
  if (zegen.length > 0) {
    if (zegen.length === configs.length && new Set(zegen).size === 1) {
      uit.preCamber_mm = zegen[0];
    } else {
      notities.push(
        `Niet alle delen geven dezelfde zeeg (${zegen.map((v) => nl(v, 1)).join(", ")} mm); ` +
          "de zeeg is voor de lijn op 0 gezet. Geef één zeeg op bij het deel waaronder de lijn wordt getoetst.",
      );
    }
  }

  return { config: Object.keys(uit).length > 0 ? uit : undefined, notities };
}

/** De station-arrays van de delen aaneengeregen tot die van de lijn. */
function voegElementKrachtenSamen(delen: { ef: ElementForces; gespiegeld: boolean }[]): ElementForces {
  const efs = delen.map((d) => (d.gespiegeld ? spiegelElementKrachten(d.ef) : d.ef));
  const stations_mm: number[] = [];
  const normalForce: number[] = [];
  const shearForce: number[] = [];
  const bendingMoment: number[] = [];
  const deflection: number[] = [];
  const axialDisp: number[] = [];
  const rotation: number[] = [];
  const metRotatie = efs.every((ef) => Array.isArray(ef.rotation) && ef.rotation.length === ef.stations_mm.length);
  let x0 = 0;
  efs.forEach((ef, i) => {
    // Het eerste station van een vervolgdeel valt samen met het laatste van
    // het vorige deel; één keer opnemen.
    const van = i > 0 ? 1 : 0;
    for (let k = van; k < ef.stations_mm.length; k++) {
      stations_mm.push(x0 + ef.stations_mm[k]);
      normalForce.push(ef.normalForce[k] ?? 0);
      shearForce.push(ef.shearForce[k] ?? 0);
      bendingMoment.push(ef.bendingMoment[k] ?? 0);
      deflection.push(ef.deflection[k] ?? 0);
      axialDisp.push(ef.axialDisp[k] ?? 0);
      if (metRotatie) rotation.push(ef.rotation![k]);
    }
    x0 += ef.L_mm;
  });
  const laatste = efs[efs.length - 1];
  const uit: ElementForces = {
    N: efs[0].N,
    V: efs[0].V,
    M_start: efs[0].M_start,
    M_end: laatste.M_end,
    L_mm: x0,
    stations_mm,
    normalForce,
    shearForce,
    bendingMoment,
    deflection,
    axialDisp,
  };
  if (metRotatie) uit.rotation = rotation;
  return uit;
}

/**
 * De virtuele staaf van een lijn: van het ene eind naar het andere, met de
 * eigenschappen van het eerste deel en de samengevoegde toetsconfiguratie.
 */
function virtueleStaaf(lijn: DoorgaandeLijn): { beam: Beam; notities: string[] } {
  const eerste = lijn.delen[0];
  const laatste = lijn.delen[lijn.delen.length - 1];
  const { config, notities } = voegConfigSamen(lijn);
  const beam: Beam = {
    ...eerste.beam,
    id: lijn.id,
    from: lijn.from,
    to: lijn.to,
  };
  delete beam.releases;
  delete beam.veren;
  delete beam.checkConfig;
  const startRel = eindVelden(eerste.beam.releases, eerste.gespiegeld ? "end" : "start", "start");
  const endRel = eindVelden(laatste.beam.releases, laatste.gespiegeld ? "start" : "end", "end");
  if (startRel || endRel) beam.releases = { ...(startRel ?? {}), ...(endRel ?? {}) };
  const startVeren = eindVelden(eerste.beam.veren, eerste.gespiegeld ? "end" : "start", "start");
  const endVeren = eindVelden(laatste.beam.veren, laatste.gespiegeld ? "start" : "end", "end");
  if (startVeren || endVeren) beam.veren = { ...(startVeren ?? {}), ...(endVeren ?? {}) };
  if (config) beam.checkConfig = config;
  return { beam, notities };
}

/**
 * Vervang in de bouwerinvoer elke doorgaande lijn door haar virtuele staaf,
 * met aaneengeregen resultaten. De invoer zelf wordt niet gewijzigd.
 */
export function voegDoorgaandeLijnenSamen<T extends LijnInvoer>(invoer: T): LijnUitkomst<T> {
  const alleBeams = invoer.alleBeams ?? invoer.beams;
  const lijnen = vindDoorgaandeLijnen(invoer.beams, invoer.nodes, alleBeams, invoer.supports);
  if (lijnen.length === 0) {
    return { data: invoer, lijnen: new Map(), notities: new Map(), overgeslagen: [] };
  }

  const vervangen = new Set<number>();
  const virtueel: Beam[] = [];
  const notities = new Map<number, string[]>();
  const lijnPerId = new Map<number, DoorgaandeLijn>();
  const overgeslagen: CheckSkip[] = [];
  const teToetsen = new Set(invoer.beams.map((b) => b.id));

  for (const lijn of lijnen) {
    const { beam, notities: configNotities } = virtueleStaaf(lijn);
    virtueel.push(beam);
    lijnPerId.set(lijn.id, lijn);
    const ids = lijn.delen.map((d) => d.beam.id);
    for (const id of ids) {
      vervangen.add(id);
      if (id !== lijn.id && teToetsen.has(id)) {
        overgeslagen.push({
          beamId: id,
          reason:
            `maakt deel uit van de doorgaande lijn die als staaf ${lijn.id} is getoetst ` +
            `(staven ${ids.join(", ")}, samen ${nl(lijn.lengteMm / 1000)} m); zie staaf ${lijn.id}`,
        });
      }
    }
    const tekst: string[] = [
      `DOORGAANDE LIJN. Deze staaf is de doorgaande lijn van de staven ${ids.join(", ")} ` +
        `(${beam.profile ?? "—"}, ${beam.material ?? "—"}): zij liggen in elkaars verlengde, hebben ` +
        `dezelfde doorsnede en hetzelfde materiaal, en op de tussenknoop ${lijn.tussenknopen.join(", ")} ` +
        "staat geen oplegging. De toetsing beschouwt de lijn als ÉÉN staaf van " +
        `${nl(lijn.lengteMm / 1000)} m: de terugval van de kniklengte, de kipvelden en de koorde ` +
        "van de doorbuiging gelden voor die hele lengte, en een tussenknoop telt niet als steun of " +
        "als gaffel (basisaudit nr 29 en het kipgedrag bij een tussenknoop). Kipsteunen van de delen " +
        "zijn omgerekend naar de lijn; een opgegeven kniklengte, kipsteunafstand, zeeg of klasse van " +
        "een deel is voor de lijn overgenomen.",
    ];
    // Andere staven op een tussenknoop: mogelijk een steun, mogelijk niet.
    for (const knoop of lijn.tussenknopen) {
      const aangesloten = alleBeams
        .filter((b) => !vervangen.has(b.id) && !ids.includes(b.id) && (b.from === knoop || b.to === knoop))
        .map((b) => b.id);
      if (aangesloten.length > 0) {
        tekst.push(
          `Op tussenknoop ${knoop} sluit staaf ${aangesloten.join(", ")} aan. Die aansluiting is NIET ` +
            "als steun of gaffel meegeteld: een vlak model zegt niet of zij de lijn zijdelings of " +
            "tegen torsie vasthoudt. Doet zij dat werkelijk, geef dan op die plaats een kipsteun " +
            "(aan beide flenzen) of een kniklengte op.",
        );
      }
    }
    tekst.push(...configNotities);
    notities.set(lijn.id, tekst);
  }

  const beams = invoer.beams.filter((b) => !vervangen.has(b.id)).concat(virtueel);

  // Resultaten: per combinatie de virtuele staaf erbij, als alle delen er een
  // resultaat in hebben. De bestaande Maps blijven onaangeroerd.
  const combinationResults = new Map<number, SolverResult>();
  for (const [comboId, result] of invoer.combinationResults) {
    let elements: Map<number, ElementForces> | null = null;
    for (const lijn of lijnen) {
      const stukken: { ef: ElementForces; gespiegeld: boolean }[] = [];
      for (const d of lijn.delen) {
        const ef = result.elements.get(d.beam.id);
        if (!ef || ef.stations_mm.length === 0) break;
        stukken.push({ ef, gespiegeld: d.gespiegeld });
      }
      if (stukken.length !== lijn.delen.length) continue;
      elements ??= new Map(result.elements);
      elements.set(lijn.id, voegElementKrachtenSamen(stukken));
    }
    combinationResults.set(comboId, elements ? { ...result, elements } : result);
  }

  return {
    data: { ...invoer, beams, combinationResults },
    lijnen: lijnPerId,
    notities,
    overgeslagen,
  };
}

/**
 * Wat er aan de twee staafeinden zit, voor de kern — zie `Staafeind` in de
 * Rust-invoer. `beam` is de (eventueel virtuele en eventueel gespiegelde)
 * staaf zoals de bouwer hem toetst: `from` is het begin in de
 * referentierichting. `ledenVanLijn` zijn de delen waaruit hij bestaat; die
 * tellen niet als aansluitende staaf.
 */
export function bepaalStaafeinden(
  beam: Beam,
  nodes: Node[],
  alleBeams: Beam[],
  supports: Support[] | undefined,
  ledenVanLijn: ReadonlySet<number>,
  plates?: { nodeIds: number[] }[],
): Staafeinden {
  // Zonder opleggingenlijst is een vrij eind niet van een opgelegd eind te
  // onderscheiden. Dan geen uitspraak: beide einden gelden als gaffel, de
  // aanname van vóór dit veld — een "vrij" eind aanwijzen waar in werkelijkheid
  // een oplegging staat, zou de kniklengte verdubbelen op grond van niets.
  if (!supports) return { begin: "Gaffel", eind: "Gaffel" };
  const dir = richting(beam, nodes);
  const opgelegd = new Set(supports.map((s) => s.nodeId));
  const inPlaat = new Set((plates ?? []).flatMap((p) => p.nodeIds));
  const eind = (knoop: number) => {
    if (opgelegd.has(knoop) || inPlaat.has(knoop)) return "Gaffel" as const;
    const anderen = alleBeams.filter(
      (b) => b.id !== beam.id && !ledenVanLijn.has(b.id) && (b.from === knoop || b.to === knoop),
    );
    if (anderen.length === 0) return "Vrij" as const;
    // Alleen collineaire staven op de knoop, met (per definitie van de
    // lijnherkenning) een andere doorsnede of materiaal: de lijn loopt door.
    const alleenInVerlengde =
      dir !== null &&
      anderen.every((b) => {
        const d2 = richting(b, nodes);
        return d2 !== null && Math.abs(dir.x * d2.z - dir.z * d2.x) <= 1e-6;
      });
    return alleenInVerlengde ? ("Doorlopend" as const) : ("Gaffel" as const);
  };
  return { begin: eind(beam.from), eind: eind(beam.to) };
}
