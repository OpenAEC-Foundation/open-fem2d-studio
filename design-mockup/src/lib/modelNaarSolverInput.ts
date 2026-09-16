/**
 * modelNaarSolverInput — vertaalt het UI-model (knopen, staven, opleggingen,
 * platen, belastinggevallen en lasten zoals de store ze bewaart) naar de
 * `MultiInput` die de solver-adapter (`solver/engine.ts`) verwacht.
 *
 * Deze mapping BEPAALT welke doorsnede (A, I) en welk materiaal (E) bij een
 * profielnaam horen en welke krachten in welke eenheden de solver in gaan.
 * Ze stond tot nu toe midden in `App.tsx`, waardoor elke tweede consument van
 * de solver (de MCP-sidecar) hem zou moeten naschrijven — en een nageschreven
 * doorsnedekeuze is net zo gevaarlijk als een tweede solver: twee plausibel
 * ogende antwoorden op hetzelfde model. Daarom staat hij hier als PURE functie,
 * zonder React, DOM of Tauri, zodat de app en de sidecar letterlijk dezelfde
 * regels uitvoeren.
 *
 * Eenheden — de store rekent in "constructeurseenheden", de solver in N en mm:
 *   - puntlast fx/fz: kN → N   (×1000)
 *   - koppel my:      kNm → N·mm (×1e6)
 *   - veerstijfheid:  kN/mm → N/mm (×1000), kNm/rad → N·mm/rad (×1e6)
 *   - lijnlast q:     kN/m = N/mm, dus ongewijzigd
 *   - geometrie:      mm, z positief omhoog
 */
import type { Beam, BeamEindVeren, Load, LoadCase, Node, Plate, Support } from "../components/fem/femTypes";
import { withPlateDefaults } from "../components/fem/femTypes";

/**
 * Verende aansluitingen van de UI (kN/mm, kNm/rad) naar de canonieke
 * solvereenheden (N/mm, N·mm/rad). Alleen velden > 0 gaan mee; zonder één
 * zo'n veld komt er geen `veren`-sleutel — dan blijft de invoer van een
 * model zonder veren byte-gelijk aan vroeger.
 */
export function verenNaarCanoniek(v: BeamEindVeren | undefined): { veren?: NonNullable<MultiInput["beams"][number]["veren"]> } {
  if (!v) return {};
  const uit: Record<string, number> = {};
  for (const k of ["startTx", "startTz", "endTx", "endTz"] as const) {
    if (v[k] !== undefined && v[k]! > 0) uit[k] = v[k]! * 1e3;
  }
  for (const k of ["startRy", "endRy"] as const) {
    if (v[k] !== undefined && v[k]! > 0) uit[k] = v[k]! * 1e6;
  }
  return Object.keys(uit).length > 0 ? { veren: uit } : {};
}
import type {
  MultiInput, SolverBeamInput, SolverBeamSegmentInput,
} from "../components/fem/solver/types";
import { MIN_SEGMENT_MM } from "../components/fem/solver/engine";
import {
  DoorsnedeOnbekendFout,
  bepaalVerloop,
  doorsnedeOpPositie,
  eigenGewichtPerMeter,
  eigenGewichtVanDoorsnede,
  onbekendeDoorsneden,
  resolveSection,
  type VerlopendeDoorsnede,
} from "./sectionResolver";
import { thermalAlphaForMaterial } from "./thermalAlpha";
import { zoneSnedenUitStaven } from "./betonZoneSneden";

/**
 * Het deel van het modelbestand dat de solver-invoer bepaalt. Bewust een eigen
 * interface en niet het volledige store-object: de mapping mag niets van de
 * UI-toestand (selectie, weergave, undo) kunnen lezen.
 */
export interface FemModelInvoer {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loadCases: LoadCase[];
  loads: Load[];
  /** Eigen gewicht van staven en platen meenemen in het eerste dead-geval. */
  selfWeightEnabled: boolean;
  /** Scheefstand (initiële imperfectie) meenemen. */
  scheefstandEnabled: boolean;
  /** Noemer van de scheefstand: φ = 1/noemer. */
  scheefstandNoemer: number;
  /** Richting van de equivalente horizontale krachten: +1 = +x, −1 = −x. */
  scheefstandRichting: 1 | -1;
}

/**
 * Veerstijfheid van UI-eenheden naar solver-eenheden.
 *  - zSpring/xSpring: k_ui [kN/mm] × 1000 → N/mm
 *  - rotSpring:       k_ui [kNm/rad] × 1e6 → N·mm/rad
 * Geeft `undefined` voor starre opleggingen (de solver negeert `k` daar).
 *
 * DE ENIGE bron van deze omrekening. Ze stond eerder driemaal in de repo:
 * hier, in App.tsx en onderaan FemCanvas.tsx (met het commentaar "Same logic
 * as App.tsx" — een duplicaat dat zichzelf al aankondigde). Het canvas-pad
 * importeert hem nu hiervandaan, zodat een wijziging aan de eenheden nooit
 * meer maar op één van de twee rekenpaden kan landen.
 */
export function liftSpringK(s: { type: string; k?: number }): number | undefined {
  if (s.k === undefined) return undefined;
  if (s.type === "zSpring" || s.type === "xSpring") return s.k * 1000;
  if (s.type === "rotSpring") return s.k * 1e6;
  return undefined;
}

/**
 * DE doorsnedecontrole vóór het rekenen, voor ELK rekenpad.
 *
 * Gooit [`DoorsnedeOnbekendFout`] met de staafnummers en de reden als van één
 * of meer staven de doorsnede niet te bepalen is. Stond eerst alleen in
 * `bouwMultiInput`; het canvaspad (`FemCanvas`) nam E, A en I over van
 * `resolveSection` zonder te kijken of die de doorsnede kón bepalen, en rekende
 * een onbekende doorsnede daardoor stil als HEA 160 / S235 — met "Berekend om"
 * in de statusbalk. Gemeten: een ligger 6 m met q = 10 kN/m in GL30h 300×500
 * zakte −48,03 mm (de HEA 160-waarde) in plaats van te stoppen. Twee paden,
 * één controle: daarom deze functie.
 */
export function controleerDoorsneden(
  beams: Iterable<{ id: number; material?: string; profile?: string; profileEnd?: string }>,
  opties: {
    /**
     * Bevat het model platen? Dan wordt een VERLOPENDE staaf geweigerd: het
     * plaatpad zet geen extra sneden (staaf- en plaatknopen worden binnen
     * 1 mm aan elkaar geknoopt, en een segmentgrens vlak bij een plaatknoop
     * zou een verbinding maken die het model niet vraagt). Zolang die
     * afweging per staaf niet bestaat, is weigeren met reden het enige
     * eerlijke antwoord; zie het ontwerp van 15 september 2026, §4.3.
     */
    heeftPlaten?: boolean;
  } = {},
): void {
  const lijst = Array.from(beams);
  const onbekend = onbekendeDoorsneden(lijst);
  if (onbekend.length === 0) {
    if (!opties.heeftPlaten) return;
    const verlopend = lijst.filter(
      (b) => bepaalVerloop(b.material, b.profile, b.profileEnd).status === "verlopend",
    );
    if (verlopend.length === 0) return;
    const reden =
      "een verlopend profiel wordt in een model met platen nog niet ondersteund — " +
      "maak de staaf prismatisch (verwijder het eindprofiel) of haal de platen uit het model";
    throw new DoorsnedeOnbekendFout(
      `De berekening is gestopt: ${verlopend.length === 1 ? "staaf" : "staven"} ` +
        `${verlopend.map((b) => b.id).join(", ")} ${verlopend.length === 1 ? "heeft" : "hebben"} ` +
        `een verlopend profiel en het model bevat platen; ${reden}.`,
      verlopend.map((b) => ({ beamId: b.id, reden })),
    );
  }
  // Hoogstens vijf staven in de melding; bij een groot model zou de
  // volledige lijst onleesbaar worden en zegt het aantal genoeg.
  const eerste = onbekend.slice(0, 5).map((o) => `staaf ${o.beamId}: ${o.reden}`);
  const rest = onbekend.length - eerste.length;
  throw new DoorsnedeOnbekendFout(
    `De berekening is gestopt: van ${onbekend.length} ` +
      `${onbekend.length === 1 ? "staaf is" : "staven is"} de doorsnede niet te ` +
      `bepalen. ${eerste.join("; ")}` +
      (rest > 0 ? `; en nog ${rest} andere` : "") +
      ". Doorrekenen met een vervangende doorsnede zou een antwoord geven bij " +
      "een ander model dan is ingevoerd.",
    onbekend,
  );
}

// ── Verlopende profielen: van (profile, profileEnd) naar segmenten ──────────
//
// De solver kent geen verlopende staaf; hij kent segmenten met elk een eigen
// E·I en E·A (`SolverBeamInput.segmenten`). Een verlopende staaf wordt daarom
// HIER, in de mapping, in segmenten gedeeld — de app, het canvas, de
// matrixweergave en de MCP-sidecar lopen allemaal door deze functies, zodat
// er één opdeling bestaat en niet drie.
//
// TRAPSGEWIJS, NIET LINEAIR. Elk segment krijgt de doorsnede van zijn MIDDEN
// en rekent daarmee als prismatisch stuk; de werkelijke I(x) ~ h(x)³ wordt
// dus als trap benaderd. Met 20 segmenten blijft dat ruim binnen 1 % op de
// zakking van een uitkrager waarvan de hoogte halveert (gemeten in
// test-verlopend-profiel.mjs: 0,11 % bij h 400 → 200), omdat de fout van de middenregel per
// stuk met (ℓ/L)² afneemt en de resten van buurstukken elkaar deels opheffen.
// De segmentgrenzen worden echte rekenknopen, dus de snedekrachten en de
// zakking komen op 21 stations PER SEGMENT beschikbaar — 420 punten op een
// volle staaf, elk met de doorsnede van dat segment.
//
// NIET KORTER DAN MIN_SEGMENT_MM. Een korte staaf krijgt minder segmenten,
// nooit kortere: onder 25 mm verliest de stijfheidsmatrix cijfers (zie de
// meting bij MIN_SEGMENT_MM in engine.ts), en de adapter zou zulke grenzen
// bovendien zelf laten vallen.

/** Standaardaantal segmenten van een verlopende staaf. */
export const VERLOOP_SEGMENTEN = 20;

/**
 * Aantal segmenten voor een verlopende staaf van `L_mm`: `aantal`, tenzij de
 * stukken dan korter dan MIN_SEGMENT_MM worden; minstens één.
 */
export function aantalVerloopSegmenten(L_mm: number, aantal = VERLOOP_SEGMENTEN): number {
  if (!(L_mm > 0)) return 1;
  return Math.max(1, Math.min(aantal, Math.floor(L_mm / MIN_SEGMENT_MM)));
}

/**
 * De segmentindeling van een verlopende staaf: `n` gelijke stukken, elk met
 * A en I van de doorsnede in zijn midden. De fracties zijn i/n, zodat de
 * grenzen bit-gelijk zijn aan de deellastgrenzen van het eigen gewicht
 * (`eigenGewichtLasten`) en de adapter ze als één snede herkent.
 */
export function segmentenVoorVerloop(
  verloop: VerlopendeDoorsnede,
  L_mm: number,
  aantal = VERLOOP_SEGMENTEN,
): SolverBeamSegmentInput[] {
  const n = aantalVerloopSegmenten(L_mm, aantal);
  const uit: SolverBeamSegmentInput[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const d = doorsnedeOpPositie(verloop, (t0 + t1) / 2);
    uit.push({ tStart: t0, tEnd: t1, I: d.I, A: d.A });
  }
  return uit;
}

/** Lengte van een staaf in mm uit de knoopcoördinaten; 0 als een knoop ontbreekt. */
export function staafLengteMm(
  b: { from: number; to: number },
  nodes: Iterable<{ id: number; x: number; z: number }>,
): number {
  let nA: { x: number; z: number } | undefined;
  let nB: { x: number; z: number } | undefined;
  for (const n of nodes) {
    if (n.id === b.from) nA = n;
    if (n.id === b.to) nB = n;
  }
  return nA && nB ? Math.hypot(nB.x - nA.x, nB.z - nA.z) : 0;
}

/**
 * De doorsnedevelden van één staaf voor de solver: E, A en I — en bij een
 * verlopend profiel ook de segmenten. DE ENIGE plek waar (materiaal, profiel,
 * eindprofiel) in solverstijfheid wordt omgezet; `bouwMultiInput`, het
 * canvaspad en de matrixweergave roepen hem alle drie aan.
 *
 * Prismatisch: exact `{ E, A, I }` uit `resolveSection`, in die volgorde en
 * zonder verdere sleutels, zodat de invoer van elk bestaand model byte-gelijk
 * blijft. Verlopend: E van het materiaal, A en I van het MIDDEN van de staaf
 * als staafwaarde (de segmenten overschrijven ze stuk voor stuk; de
 * staafwaarde dient alleen nog de bedding-indeling en lezers die één getal
 * willen), plus de segmenten.
 *
 * Een eindprofiel dat niet bij het beginprofiel past is hier een fout en geen
 * terugval op het beginprofiel: `controleerDoorsneden` heeft dat normaal al
 * gemeld, maar wie deze functie rechtstreeks aanroept krijgt dezelfde
 * uitzondering in plaats van stil een prismatische staaf.
 */
export function doorsnedeVeldenVoorSolver(
  b: { id: number; material?: string; profile?: string; profileEnd?: string },
  L_mm: number,
): Pick<SolverBeamInput, "E" | "A" | "I" | "segmenten"> {
  const verloop = bepaalVerloop(b.material, b.profile, b.profileEnd);
  if (verloop.status === "fout") {
    throw new DoorsnedeOnbekendFout(
      `Staaf ${b.id}: ${verloop.reden}. De berekening is gestopt.`,
      [{ beamId: b.id, reden: verloop.reden }],
    );
  }
  if (verloop.status === "prismatisch") {
    const sec = resolveSection(b.material, b.profile);
    return { E: sec.E, A: sec.A, I: sec.I };
  }
  const v = verloop.verloop;
  const midden = doorsnedeOpPositie(v, 0.5);
  return { E: v.E, A: midden.A, I: midden.I, segmenten: segmentenVoorVerloop(v, L_mm) };
}

/**
 * Het eigen gewicht van één staaf als solverlasten in belastinggeval
 * `caseId`. Prismatisch: één lijnlast q = −ρ·A·g over de volle lengte, of
 * niets als q verwaarloosbaar is — precies het bestaande gedrag. Verlopend:
 * per segment een deellast met de A van het midden van dat segment, op
 * dezelfde fracties als de segmenten zelf. Zo weegt elk stuk wat het is, en
 * is de som over de segmenten voor een lineair verlopende A exact
 * gemiddelde A · ρ · g · L (middenregel is exact voor een lineaire functie).
 */
export function eigenGewichtLasten(
  b: { id: number; material?: string; profile?: string; profileEnd?: string },
  L_mm: number,
  caseId: number,
): MultiInput["loads"] {
  const verloop = bepaalVerloop(b.material, b.profile, b.profileEnd);
  if (verloop.status !== "verlopend") {
    const q = eigenGewichtPerMeter(b.material, b.profile);
    return Math.abs(q) > 1e-9 ? [{ beamId: b.id, q, caseId }] : [];
  }
  return segmentenVoorVerloop(verloop.verloop, L_mm).map((s) => ({
    beamId: b.id,
    q: eigenGewichtVanDoorsnede(b.material, s.A!),
    startFrac: s.tStart,
    endFrac: s.tEnd,
    caseId,
  }));
}

/**
 * Eén plaat naar de solver: rekenvelden met defaults aangevuld, en de
 * CDT-meshcache van een polygoonplaat erbij.
 *
 * DE ENIGE vertaling van een plaat, voor het canvaspad én `bouwMultiInput`.
 * Tot september 2026 gaf `bouwMultiInput` de meshcache NIET door; de engine
 * las hem dan uit een module-globaal doorgeefluik dat alleen de GUI-store
 * vulde. In de MCP-sidecar was dat luik leeg, dus daar faalde elke
 * polygoonplaat — terwijl de droogloop hem goedkeurde (gemeten). Nu draagt de
 * invoer zelf de cache en rekenen canvas, app en MCP hetzelfde mesh.
 */
export function plaatNaarSolverInput(p: Plate): NonNullable<MultiInput["plates"]>[number] {
  const d = withPlateDefaults(p);
  return {
    id: d.id, nodeIds: d.nodeIds,
    thickness: d.thickness!,
    // E, ν en ρ gaan alleen mee als de plaat ze DRAAGT. Zonder materiaal vult
    // `withPlateDefaults` ze met de staaldefaults, dus dan staan ze er alle
    // drie en is de invoer byte-gelijk aan die van vóór stap 3 (ook de
    // volgorde van de sleutels). Mét materiaal blijven ze leeg tenzij de
    // gebruiker ze zelf heeft ingevuld, en dan zijn ze de overschrijving.
    ...(d.E !== undefined ? { E: d.E } : {}),
    ...(d.nu !== undefined ? { nu: d.nu } : {}),
    ...(d.rho !== undefined ? { rho: d.rho } : {}),
    meshSize: d.meshSize!,
    // Materiaal en hoofdrichting (stap 3): alleen mee als ze gezet zijn.
    ...(d.materiaal && d.materiaal.trim() !== "" ? { materiaal: d.materiaal } : {}),
    ...(d.hoofdrichting !== undefined ? { hoofdrichting: d.hoofdrichting } : {}),
    // Alleen aanwezig als er een cache is: een rechthoek draagt er geen, en
    // dan blijft de invoer van zo'n model byte-gelijk aan voorheen.
    ...(d.meshCache ? { meshCache: d.meshCache } : {}),
    // Elementkeuze en openingen (stap 2): alleen mee als ze gezet zijn, om
    // dezelfde reden — een plaat zonder keuze en zonder openingen levert
    // exact dezelfde solverinvoer als vóór stap 2.
    ...(d.meshType ? { meshType: d.meshType } : {}),
    ...(d.openingen && d.openingen.length > 0 ? { openingen: d.openingen } : {}),
  };
}

/**
 * Een randlast (`edgeLoad`) naar de solver, of `null` als de last geen plaat
 * of geen waarde heeft. Het randadres gaat ONGEWIJZIGD mee: `edge` en
 * `edgeIndex` zoals ingevoerd. Hier werd tot september 2026 een ontbrekende
 * `edge` stil "top" en ging `edgeIndex` niet mee — een polygoonrandlast viel
 * via de app en de MCP daardoor weg of kwam op de bovenrand van een rechthoek
 * (gemeten). Welke rand bedoeld is en of het adres geldig is, beslist nu
 * alleen `femTypes.bepaalPlaatRand` in de engine, die bij twijfel weigert.
 */
export function randlastNaarSolverInput(
  l: Load,
): Omit<NonNullable<MultiInput["edgeLoads"]>[number], "caseId"> | null {
  if (l.type !== "edgeLoad" || l.plateId === undefined || l.q === undefined) return null;
  return {
    plateId: l.plateId,
    ...(l.edge !== undefined ? { edge: l.edge } : {}),
    ...(l.edgeIndex !== undefined ? { edgeIndex: l.edgeIndex } : {}),
    // Openingsrand: alleen mee als het veld er staat, zodat een randlast op de
    // omtrek byte-gelijke solverinvoer houdt.
    ...(l.openingId !== undefined ? { openingId: l.openingId } : {}),
    p: l.q,
    // Deellast en trapezium: dezelfde velden en dezelfde betekenis als bij een
    // staaf, maar langs de rand vanaf de beginhoek. Alleen aanwezig als ze
    // ingevoerd zijn, zodat een volle gelijkmatige randlast byte-gelijk blijft.
    ...(l.qStart !== undefined ? { pStart: l.qStart } : {}),
    ...(l.qEnd !== undefined ? { pEnd: l.qEnd } : {}),
    ...(l.startFrac !== undefined ? { startFrac: l.startFrac } : {}),
    ...(l.endFrac !== undefined ? { endFrac: l.endFrac } : {}),
    dir: l.qDir,
  };
}

/**
 * Een puntlast op een plaatrand (`pointForce` met `plateId`) naar de solver, of
 * `null` als het geen plaatgebonden puntlast is. Eenheden als bij elke puntlast
 * (kN → N). Het randadres en `posFrac` gaan ONGEWIJZIGD mee — ook een
 * ontbrekende positie: die zet de engine niet stil op 0 maar weigert hem.
 */
export function randpuntlastNaarSolverInput(
  l: Load,
): Omit<NonNullable<MultiInput["edgePointLoads"]>[number], "caseId"> | null {
  if (l.type !== "pointForce" || l.plateId === undefined) return null;
  return {
    plateId: l.plateId,
    ...(l.edge !== undefined ? { edge: l.edge } : {}),
    ...(l.edgeIndex !== undefined ? { edgeIndex: l.edgeIndex } : {}),
    ...(l.openingId !== undefined ? { openingId: l.openingId } : {}),
    posFrac: l.posFrac,
    fx: (l.fx ?? 0) * 1000,
    fz: (l.fz ?? 0) * 1000,
  };
}

/**
 * Bouw de solver-invoer voor ALLE belastinggevallen uit één modelbestand.
 * Puur: leest alleen `model`, muteert niets aan de invoer en raakt geen
 * globale toestand aan.
 */
export function bouwMultiInput(model: FemModelInvoer): MultiInput {
  // ZONEGRENZEN WORDEN REKENKNOPEN. Waar de wapening verandert SPRINGT de
  // opneembare weerstand, en de dekkingslijn (§9.2.1.3, figuur 9.2) moet daar
  // links en rechts een eigen waarde kunnen tonen. Zonder een station op die
  // plaats leest zij de benodigde kracht af op een station ernaast — tot een
  // halve stationsafstand fout — terwijl de weerstand daar al gesprongen is.
  //
  // De grenzen komen uit dezelfde zonelijsten (`checkConfig.betonZones`) die de
  // toetsing als `reinforcement_zones` krijgt: één bron, geen tweede regel.
  // Geen zones ⇒ een lege map ⇒ `extraSneden` blijft weg en elk bestaand model
  // rekent bit-identiek aan voorheen. Zie `lib/betonZoneSneden.ts`.
  // DOORSNEDECONTROLE VÓÓR HET REKENEN. Een staaf waarvan de doorsnede niet
  // te bepalen is, viel tot september 2026 terug op de solver-default
  // (HEA 160 / S235) met alleen een `console.warn`. Bij een HOUTEN staaf met
  // een eigen doorsnede betekende dat E = 210 000 in plaats van 11 000: een
  // factor negentien in de stijfheid, en een zakking die er volstrekt normaal
  // uitziet. Dat is de gevaarlijkste soort fout — de berekening loopt door en
  // het antwoord ziet er goed uit.
  //
  // Daarom stopt de rekengang hier, met de staafnummers en de reden erbij, in
  // dezelfde vorm als de modelcontrole en de overgeslagen staven van de
  // betontoetsing. `resolveSection` zelf blijft wél een waarde geven: het
  // rapport en de profielkiezer moeten "doorsnede onbekend" kunnen TÓNEN, en
  // een halfgetikte profielnaam mag geen scherm laten omvallen.
  controleerDoorsneden(model.beams, { heeftPlaten: model.plates.length > 0 });
  const zoneSneden = zoneSnedenUitStaven(model.beams, model.nodes);
  const multiInput: MultiInput = {
    nodes: model.nodes.map(n => ({ id: n.id, x: n.x, z: n.z })),
    beams: model.beams.map(b => {
      // Stijfheid uit materiaal + profiel — zelfde route als het canvas-pad
      // (FemCanvas → resolveSection). Zonder dit rekende het multi-LC-pad
      // (combinaties/envelope/toetsing) élke staaf met de solver-default
      // (HEA 160 / S235) en kreeg de toetsing krachten en zakkingen van
      // het verkeerde model.
      //
      // De uitkomst kan hier geen "default" meer zijn: de controle bovenaan
      // heeft die gevallen er al uit gegooid. Een verlopend profiel levert
      // hier bovendien zijn segmenten (zie doorsnedeVeldenVoorSolver).
      const sneden = zoneSneden.get(b.id);
      return {
        id: b.id, from: b.from, to: b.to,
        ...doorsnedeVeldenVoorSolver(b, staafLengteMm(b, model.nodes)),
        // Releases naar de engine: buigscharnieren via het legacy paar,
        // en het volledige object (mét Tx/Tz-hulzen in lokale assen)
        // ernaast — de engine kiest zelf het rijkere per-DOF-model zodra
        // er een translatie-release in zit.
        startConnection: b.releases?.startRy ? 'hinge' as const : 'fixed' as const,
        endConnection:   b.releases?.endRy   ? 'hinge' as const : 'fixed' as const,
        releases: b.releases,
        // Verende aansluitingen: UI kN/mm → N/mm (×1e3), kNm/rad → N·mm/rad
        // (×1e6). Alleen aanwezig als er echt een veer > 0 is opgegeven.
        ...(verenNaarCanoniek(b.veren)),
        // Alleen aanwezig als er werkelijk zonegrenzen zijn; een leeg veld zou
        // de invoer van een model zonder beton onnodig veranderen.
        ...(sneden && sneden.length > 0 ? { extraSneden: sneden } : {}),
        // Bedding: k [kN/m³] · b [mm] → lijnstijfheid in N/mm². 1 kN/m³ =
        // 1e3 N / 1e9 mm³ = 1e-6 N/mm³. Alleen aanwezig als er een bedding is.
        ...(b.bedding && b.bedding.k > 0 && b.bedding.b > 0
          ? { bedding: { kLijn: b.bedding.k * 1e-6 * b.bedding.b } }
          : {}),
      };
    }),
    supports: model.supports.map(s => ({ nodeId: s.nodeId, type: s.type, k: liftSpringK(s) })),
    // Platen (wandschijven, P2.3): rekenvelden met defaults aangevuld plus de
    // meshcache — de engine meshet en schakelt zelf naar mixed_beam_plate.
    plates: model.plates.map(plaatNaarSolverInput),
    cases: model.loadCases.map(lc => ({ id: lc.id, name: lc.name })),
    loads: [], pointLoads: [], beamPointLoads: [], thermalLoads: [], edgeLoads: [],
    // Scheefstand: φ = 1/noemer, richting ±x — de engine geeft elke
    // verticale last een horizontale metgezel H = φ·V.
    scheefstand: model.scheefstandEnabled
      ? { phi: 1 / model.scheefstandNoemer, richting: model.scheefstandRichting }
      : undefined,
  };
  // Optioneel: eigen gewicht als extra verdeelde lasten op het eerste
  // permanente (dead) belastinggeval. Per staaf → q = -ρ·A·g (omlaag in +Z).
  //
  // ZONDER blijvend geval wordt het eigen gewicht NIET toegepast. Tot september
  // 2026 viel het dan stil in `loadCases[0]`, welk type dat ook had: in een
  // veranderlijk geval kreeg het ψ₂ = 0,3 in de quasi-blijvende combinatie in
  // plaats van 1,0 (houtkruip −26 %) en γ_Q in de UGT. Een blijvende last met
  // de factoren van een andere soort is geen veilige terugval. De melding staat
  // in `meldingenBelastinggevallen` (lib/combinatieBeheer) en komt in de
  // projectboom, het rapport en de MCP-antwoorden.
  if (model.selfWeightEnabled) {
    const deadCase = model.loadCases.find(c => c.type === "dead");
    if (deadCase) {
      for (const b of model.beams) {
        multiInput.loads.push(...eigenGewichtLasten(b, staafLengteMm(b, model.nodes), deadCase.id));
      }
      // Plaat-eigengewicht: zelfde dead-geval als de staven. De engine
      // (buildMesh) zet dit via PlateLoads om in exacte ρ·g·t·A-
      // knooplasten op de meshknopen.
      for (const p of multiInput.plates ?? []) p.selfWeightCaseId = deadCase.id;
    }
  }

  for (const l of model.loads) {
    if (l.type === "lineLoad" && l.beamId !== undefined && l.q !== undefined) {
      multiInput.loads.push({
        beamId: l.beamId,
        q: l.q,
        qStart: l.qStart,
        qEnd: l.qEnd,
        qDir: l.qDir,
        qCoord: l.qCoord,
        startFrac: l.startFrac,
        endFrac: l.endFrac,
        caseId: l.caseId,
      });
    } else if (l.type === "pointForce" && l.plateId !== undefined) {
      // Puntlast op een plaatrand: VÓÓR de knoop- en staaftak, zodat `plateId`
      // de last aan de plaat bindt (de droogloop weigert een puntlast die
      // tegelijk een knoop of staaf noemt). Het veld komt er pas bij de eerste
      // zo'n last: een model zonder blijft byte-gelijk aan voorheen.
      const rp = randpuntlastNaarSolverInput(l)!;
      (multiInput.edgePointLoads ??= []).push({ ...rp, caseId: l.caseId });
    } else if (l.type === "pointForce" && l.nodeId !== undefined) {
      multiInput.pointLoads!.push({
        nodeId: l.nodeId,
        fx: (l.fx ?? 0) * 1000,
        fz: (l.fz ?? 0) * 1000,
        caseId: l.caseId,
      });
    } else if (l.type === "pointForce" && l.beamId !== undefined) {
      // Puntlast op een vrije positie op een staaf: positie als fractie
      // 0..1 vanaf de startknoop. De engine splitst de staaf daar en zet
      // de kracht op de tussenknoop (exacte V-sprong / M-knik).
      multiInput.beamPointLoads!.push({
        beamId: l.beamId,
        posFrac: Math.min(1, Math.max(0, l.posFrac ?? 0)),
        fx: (l.fx ?? 0) * 1000,
        fz: (l.fz ?? 0) * 1000,
        caseId: l.caseId,
      });
    } else if (l.type === "pointMoment" && l.nodeId !== undefined) {
      multiInput.pointLoads!.push({
        nodeId: l.nodeId,
        my: (l.my ?? 0) * 1e6,
        caseId: l.caseId,
      });
    } else if (l.type === "thermal" && l.beamId !== undefined && l.deltaT !== undefined) {
      // α per staafmateriaal (staal 1,2e-5 /K, hout 5,0e-6 /K = α∥
      // bovengrens, conservatief) — zonder dit rekende hout met staal-α,
      // een factor ~2,5–4 te hoog. Zie thermalAlpha.ts.
      const beam = model.beams.find(b => b.id === l.beamId);
      multiInput.thermalLoads!.push({
        beamId: l.beamId,
        deltaT: l.deltaT,
        alpha: thermalAlphaForMaterial(beam?.material),
        caseId: l.caseId,
      });
    } else if (l.type === "edgeLoad") {
      // Randlast op een plaatrand (P3.3): p in kN/m (= N/mm), richting in
      // globale assen, randadres ongewijzigd — zie randlastNaarSolverInput.
      const rl = randlastNaarSolverInput(l);
      if (rl) multiInput.edgeLoads!.push({ ...rl, caseId: l.caseId });
    }
  }
  return multiInput;
}
