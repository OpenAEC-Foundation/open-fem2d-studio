/**
 * modelControle.ts — constructieve modelcontrole VÓÓR het rekenen.
 *
 * WAAROM DIT BESTAAT
 * Een raamwerk kan er op het scherm volledig gesloten uitzien en toch uit
 * losse stukken bestaan. De drie manieren waarop dat gebeurt zijn allemaal
 * onzichtbaar bij het tekenen:
 *
 *   1. Een kolomvoet staat ÓP een doorgaande ligger, maar zit er niet aan
 *      vast — de ligger loopt er ononderbroken onderdoor.
 *   2. Twee knopen liggen exact op elkaar zonder verbinding: de dakligger
 *      eindigt op de ene, de kolom op de andere.
 *   3. Een staafuiteinde hangt vrij in de lucht zonder oplegging.
 *
 * In alle drie de gevallen faalt de solver met "Matrix is singular" — een
 * melding die niets zegt over wélke knoop het probleem is. Deze module meldt
 * het mét knoopnummers, en levert per bevinding de bewerking die het herstelt
 * (verbinden = staaf splitsen op die knoop, of samenvoegen van twee knopen).
 *
 * PUUR EN GEDEELD
 * Geen React, geen DOM: het canvas gebruikt deze functies voor de controle en
 * de reparatieknoppen, en `mcp/valideerModel.ts` gebruikt dezelfde regel voor
 * samenvallende knopen. Eén implementatie, dus geen twee antwoorden op
 * dezelfde vraag.
 *
 * WAT DEZE CONTROLE NIET CLAIMT
 * Geen bevindingen betekent "geen van deze drie valkuilen aangetroffen", niet
 * "dit model is oplosbaar". Of een stelsel singulier is bewijst alleen de
 * ontbinding zelf; die hoort in de solver. Zie ook de gelijkluidende
 * kanttekening in `mcp/valideerModel.ts`.
 */
import type { Beam, Load, LoadCase, Node, Plate, Support } from "../components/fem/femTypes";
import {
  bepaalPlaatlastRand, dichtstbijzijndePlaatrand, staafeindeBijPlaatrandTekst,
  valideerPlaatOpeningen, STAAFEINDE_BIJ_RAND_MM, type NabijePlaatrand,
} from "../components/fem/femTypes";
import { puntInPolygoon } from "../core/fem/PlaatMesher";
// De lastmapping zelf is de enige waarheid over "telt deze last mee": de
// controle MEET met `bouwMultiInput` in plaats van de if/else-keten na te
// schrijven. Zie `teltLastMee` hieronder.
import { bouwMultiInput } from "./modelNaarSolverInput";
import { dubbelzinnigMateriaal, dubbelzinnigMateriaalTekst } from "./materiaalDubbelzinnig";
import { keurPlaatMateriaal } from "./plaatMateriaal";

/**
 * Tekentolerantie in mm. Het model rekent in mm en de gebruiker tekent met
 * raster- en objectsnap; alles binnen 1 mm is dezelfde plek. Bewust ruimer dan
 * de exacte-gelijkheidsdrempel die de MCP-poort hanteert: dáár is de invoer
 * machinaal, hier komt hij uit een muis.
 */
export const CONTROLE_TOL_MM = 1;

/** Soort bevinding — bepaalt de tekst en de aangeboden herstelactie. */
export type BevindingSoort =
  /** Knoop ligt in het inwendige van een staaf zonder eraan vast te zitten. */
  | "knoopOpStaaf"
  /** Twee knopen op (vrijwel) dezelfde plek. */
  | "dubbeleKnoop"
  /** Staafuiteinde met maar één staaf en geen oplegging. */
  | "vrijUiteinde"
  /** Knoop die aan geen enkele staaf of plaat vastzit. */
  | "losseKnoop"
  /** Plaatlast waarvan de rand of de positie niet te bepalen is. */
  | "plaatlast"
  /** Opening buiten de plaat, rakend aan de omtrek, of over een andere opening. */
  | "opening"
  /** Plaatmateriaal dat niet herkend wordt. */
  | "plaatmateriaal"
  /** Materiaalnaam die hout én de korte naam van een betonklasse is ("C30"). */
  | "dubbelzinnigMateriaal"
  /** Last die het bestand wél draagt maar die geen solverinvoer oplevert. */
  | "stilleLast"
  /** Staafknoop tussen 1 en 50 mm van een plaatrand (omtrek of opening): niet gekoppeld. */
  | "staafeindeBijPlaatrand";

/**
 * Bewerking die de bevinding opheft. De store voert hem uit; de controle
 * bepaalt alleen wélke bewerking bij welke bevinding hoort.
 */
export type Herstel =
  /** Splits `beamId` op `nodeId`, zodat de knoop echt aan de staaf vastzit. */
  | { soort: "verbind"; nodeId: number; beamId: number }
  /** Voeg `verwijderId` samen met `bewaarId` (alles verhuist mee). */
  | { soort: "voegSamen"; bewaarId: number; verwijderId: number };

export interface Bevinding {
  soort: BevindingSoort;
  /**
   * "fout" = het model is aantoonbaar verkeerd verbonden; doorrekenen levert
   * een singuliere matrix of een antwoord bij een ánder model.
   * "waarschuwing" = mogelijk bedoeld (een console is óók een vrij uiteinde).
   */
  ernst: "fout" | "waarschuwing";
  /** Nederlandse melding, altijd mét knoopnummers. */
  tekst: string;
  /** Betrokken knopen — het canvas licht ze op. */
  nodeIds: number[];
  /** Betrokken staaf, waar van toepassing. */
  beamId?: number;
  /** Ontbreekt = niet automatisch te herstellen (alleen melden). */
  herstel?: Herstel;
}

/** Het deel van het model dat deze controle leest. */
export interface ControleModel {
  nodes: Pick<Node, "id" | "x" | "z">[];
  /**
   * Materiaal en korf zijn optioneel: alleen de materiaalcontrole leest ze.
   * De korf is bewust `unknown`: de MCP-poort geeft een rauw model door.
   */
  beams: (Pick<Beam, "id" | "from" | "to"> & {
    material?: string;
    checkConfig?: { betonKorf?: unknown } | null;
  })[];
  supports?: Pick<Support, "nodeId">[];
  plates?: Pick<Plate, "id" | "nodeIds" | "openingen" | "materiaal">[];
  /**
   * Optioneel: de lasten, voor de controle op plaatlasten en op lasten die
   * stil wegvallen. Ontbreekt het veld, dan blijven die controles achterwege
   * en is de uitkomst gelijk aan vroeger.
   */
  loads?: Load[];
  /**
   * Optioneel: de belastinggevallen. Alleen nodig voor `zoekStilleLasten` —
   * een last die naar een niet-bestaand geval verwijst, valt bij het rekenen
   * weg. Ontbreekt het veld, dan wordt die ene controle overgeslagen.
   */
  loadCases?: LoadCase[];
}

/**
 * Ligt punt (x, z) in het INWENDIGE van staaf `beam`? Retourneert de
 * positiefractie t (0..1 vanaf de startknoop) of null.
 *
 * "Inwendig" is strikt: een punt binnen `tolMm` van een van beide eindknopen
 * telt niet mee — dáár zit de knoop al aan de staaf vast en zou splitsen een
 * staaf met lengte nul opleveren.
 */
export function puntOpStaaf(
  nodes: Pick<Node, "id" | "x" | "z">[],
  beam: Pick<Beam, "from" | "to">,
  x: number,
  z: number,
  tolMm: number = CONTROLE_TOL_MM,
): number | null {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len = Math.hypot(vx, vz);
  if (len <= tolMm) return null; // staaf met lengte nul — niets om op te liggen
  // Loodrechte projectie op de staafas.
  const t = ((x - a.x) * vx + (z - a.z) * vz) / (len * len);
  // Strikt inwendig: minstens `tolMm` van beide uiteinden vandaan.
  if (t * len <= tolMm || (1 - t) * len <= tolMm) return null;
  // Afstand tot de as (kruisproduct / lengte).
  const afstand = Math.abs((x - a.x) * vz - (z - a.z) * vx) / len;
  if (afstand > tolMm) return null;
  return t;
}

/** Ligt (x, z) binnen `tolMm` van het lijnstuk a–b (eindpunten meegeteld)? */
function puntOpLijnstuk(
  a: { x: number; z: number },
  b: { x: number; z: number },
  x: number,
  z: number,
  tolMm: number,
): boolean {
  const vx = b.x - a.x, vz = b.z - a.z;
  const len = Math.hypot(vx, vz);
  if (len <= tolMm) return Math.hypot(x - a.x, z - a.z) <= tolMm;
  const t = ((x - a.x) * vx + (z - a.z) * vz) / (len * len);
  if (t * len < -tolMm || (1 - t) * len < -tolMm) return false;
  return Math.abs((x - a.x) * vz - (z - a.z) * vx) / len <= tolMm;
}

/**
 * Plaatlasten waarvan de rand of de positie niet te bepalen is: een benoemde
 * rand op een polygoon, een rand-index die geen zijde is, beide of geen adres,
 * een plaat die niet bestaat, een opening die niet bestaat (of een benoemde
 * rand op een opening), of een puntlast op een plaatrand zonder positie.
 *
 * DEZELFDE regel als de engine en de MCP-droogloop (`bepaalPlaatlastRand`), maar
 * al terwijl je tekent: sleept de gebruiker een rechthoek scheef, dan wordt
 * een benoemde randlast ongeldig, en dat hoort hier te staan en niet pas als
 * melding na "Berekenen". Geen herstelactie: welke rand bedoeld was, weet
 * alleen de gebruiker.
 */
export function zoekPlaatlastFouten(model: ControleModel): Bevinding[] {
  const uit: Bevinding[] = [];
  for (const l of model.loads ?? []) {
    if (l.plateId === undefined) continue;
    if (l.type !== "edgeLoad" && l.type !== "pointForce") continue;
    const soortTekst = l.type === "edgeLoad" ? "Randlast" : "Puntlast";
    const plaat = (model.plates ?? []).find((p) => p.id === l.plateId);
    if (!plaat) {
      uit.push({
        soort: "plaatlast", ernst: "fout", nodeIds: [],
        tekst: `${soortTekst} ${l.id} staat op plaat ${l.plateId}, maar die plaat bestaat niet.`,
      });
      continue;
    }
    const hoeken = plaat.nodeIds.map((id) => model.nodes.find((n) => n.id === id));
    if (hoeken.some((h) => !h)) continue;       // een ontbrekende hoek meldt de plaat zelf
    const rand = bepaalPlaatlastRand(
      hoeken.map((h) => ({ x: h!.x, z: h!.z })), plaat.openingen, l, CONTROLE_TOL_MM);
    if (!rand.ok) {
      uit.push({
        soort: "plaatlast", ernst: "fout", nodeIds: [...plaat.nodeIds],
        tekst: `${soortTekst} ${l.id} op plaat ${plaat.id}: ${rand.reden}`,
      });
      continue;
    }
    if (l.type === "pointForce" && l.posFrac === undefined) {
      uit.push({
        soort: "plaatlast", ernst: "fout", nodeIds: [...plaat.nodeIds],
        tekst:
          `Puntlast ${l.id} op plaat ${plaat.id} heeft geen positie langs de rand. ` +
          "Geef de afstand vanaf de beginhoek op.",
      });
    }
  }
  return uit;
}

/**
 * Openingen die niet kunnen: buiten de plaat, rakend aan de omtrek (minder
 * dan PLAAT_OPENING_MIN_AFSTAND_MM) of over een andere opening heen. DEZELFDE
 * regel als de tekentool, de engine en de MCP-poort (`valideerPlaatOpeningen`),
 * maar al zichtbaar terwijl je tekent: sleept de gebruiker een hoekknoop van
 * de plaat naar binnen, dan ligt een opening ineens buiten de omtrek, en dat
 * hoort hier te staan en niet pas als melding na "Berekenen". Geen
 * herstelactie: welke opening weg of anders moet, weet alleen de gebruiker.
 */
export function zoekOpeningFouten(model: ControleModel): Bevinding[] {
  const uit: Bevinding[] = [];
  for (const p of model.plates ?? []) {
    if (!p.openingen || p.openingen.length === 0) continue;
    const hoeken = p.nodeIds.map((id) => model.nodes.find((n) => n.id === id));
    if (hoeken.some((h) => !h)) continue;       // een ontbrekende hoek meldt de plaat zelf
    const fout = valideerPlaatOpeningen(
      hoeken.map((h) => ({ x: h!.x, z: h!.z })),
      p.openingen.map((o) => o.punten),
      CONTROLE_TOL_MM,
    );
    if (fout) {
      uit.push({
        soort: "opening", ernst: "fout", nodeIds: [...p.nodeIds],
        tekst: `Plaat ${p.id}: ${fout}`,
      });
    }
  }
  return uit;
}

/**
 * Een plaatmateriaal dat niet herkend wordt. DEZELFDE beoordeling als de
 * engine en de MCP-poort (`keurPlaatMateriaal`), maar al zichtbaar vóór
 * "Berekenen": typt de gebruiker "C4" in plaats van "C24", dan hoort dat
 * hier te staan en niet pas als de berekening afbreekt. Geen herstelactie:
 * welk materiaal bedoeld is, weet alleen de gebruiker.
 */
export function zoekPlaatMateriaalFouten(model: ControleModel): Bevinding[] {
  const uit: Bevinding[] = [];
  for (const p of model.plates ?? []) {
    const reden = keurPlaatMateriaal(p.materiaal);
    if (reden) {
      uit.push({
        soort: "plaatmateriaal", ernst: "fout", nodeIds: [...(p.nodeIds ?? [])],
        tekst: `Plaat ${p.id}: ${reden}`,
      });
    }
  }
  return uit;
}

/** Knoopgraad: het aantal staven waar een knoop een uiteinde van is. */
function knoopGraden(model: ControleModel): Map<number, number> {
  const graad = new Map<number, number>();
  for (const n of model.nodes) graad.set(n.id, 0);
  for (const b of model.beams) {
    graad.set(b.from, (graad.get(b.from) ?? 0) + 1);
    graad.set(b.to, (graad.get(b.to) ?? 0) + 1);
  }
  return graad;
}

/**
 * Samenvallende knopen. Meldt ELK paar binnen `tolMm`, ook een paar dat door
 * een staaf verbonden is: die staaf heeft dan lengte nul en is óók fout. Het
 * onderscheid staat wel in de tekst, want de oorzaak verschilt.
 *
 * Deze functie is de enige implementatie van deze regel in de repo;
 * `mcp/valideerModel.ts` gebruikt hem met zijn eigen (exacte) tolerantie.
 */
export function zoekDubbeleKnopen(
  model: ControleModel,
  tolMm: number = CONTROLE_TOL_MM,
): Bevinding[] {
  const verbonden = new Set<string>();
  for (const b of model.beams) {
    verbonden.add(b.from < b.to ? `${b.from}-${b.to}` : `${b.to}-${b.from}`);
  }
  const uit: Bevinding[] = [];
  const { nodes } = model;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (Math.abs(a.x - b.x) > tolMm || Math.abs(a.z - b.z) > tolMm) continue;
      const sleutel = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      const zitVast = verbonden.has(sleutel);
      uit.push({
        soort: "dubbeleKnoop",
        ernst: "fout",
        nodeIds: [a.id, b.id],
        tekst: zitVast
          ? `Knoop ${a.id} en knoop ${b.id} liggen op dezelfde plek ` +
            `(${a.x}, ${a.z}) mm en zijn met een staaf van lengte nul verbonden; ` +
            "voeg ze samen."
          : `Knoop ${a.id} en knoop ${b.id} liggen op dezelfde plek ` +
            `(${a.x}, ${a.z}) mm. Ze zijn NIET met elkaar verbonden; voeg ze ` +
            "samen of verplaats er één.",
        // De laagste id blijft bestaan: stabiel en voorspelbaar, ongeacht in
        // welke volgorde de knopen zijn getekend.
        herstel: {
          soort: "voegSamen",
          bewaarId: Math.min(a.id, b.id),
          verwijderId: Math.max(a.id, b.id),
        },
      });
    }
  }
  return uit;
}

/**
 * Knopen die in het inwendige van een staaf liggen zonder eraan vast te
 * zitten — de kolomvoet op de doorgaande ligger. Elk paar (knoop, staaf)
 * levert één bevinding met een verbind-actie.
 */
export function zoekKnopenOpStaaf(
  model: ControleModel,
  tolMm: number = CONTROLE_TOL_MM,
): Bevinding[] {
  const uit: Bevinding[] = [];
  for (const b of model.beams) {
    for (const n of model.nodes) {
      if (n.id === b.from || n.id === b.to) continue;
      const t = puntOpStaaf(model.nodes, b, n.x, n.z, tolMm);
      if (t === null) continue;
      uit.push({
        soort: "knoopOpStaaf",
        ernst: "fout",
        nodeIds: [n.id],
        beamId: b.id,
        tekst:
          `Knoop ${n.id} ligt op staaf ${b.id} (op ` +
          `${(t * 100).toFixed(1).replace(".", ",")} % van de staaflengte) maar ` +
          "zit er niet aan vast. Verbind ze, of verplaats de knoop van de " +
          "staaf af.",
        herstel: { soort: "verbind", nodeId: n.id, beamId: b.id },
      });
    }
  }
  return uit;
}

/**
 * Vrije staafuiteinden zonder oplegging: een knoop die aan precies één staaf
 * hangt, geen oplegging draagt en geen plaathoek is.
 *
 * WAARSCHUWING, GEEN FOUT — een console (uitkraging) heeft per definitie een
 * vrij uiteinde en is volstrekt geldig. Alleen samen met een van de twee
 * fouten hierboven wijst het op een niet-aangesloten onderdeel; daarom
 * onderdrukt `controleerModel` de waarschuwing voor knopen die al een fout
 * hebben.
 */
export function zoekVrijeUiteinden(model: ControleModel): Bevinding[] {
  const graad = knoopGraden(model);
  const gesteund = new Set((model.supports ?? []).map((s) => s.nodeId));
  const plaathoek = new Set<number>();
  for (const p of model.plates ?? []) for (const id of p.nodeIds ?? []) plaathoek.add(id);

  // Een staafeinde OP een plaatrand hangt aan de plaat: valt het op een
  // rekenknoop van de rand, dan deelt het die knoop; ligt het ertussen, dan
  // koppelt de engine het kinematisch aan de rand (lineaire interpolatie).
  // Zo'n knoop is dus geen vrij uiteinde, en de waarschuwing zou de
  // gebruiker naar een gebrek sturen dat er niet is. Dat geldt voor de
  // omtrek én voor de rand van een opening (issue #13): de engine koppelt
  // beide op dezelfde manier.
  const opPlaatrand = (x: number, z: number): boolean =>
    (model.plates ?? []).some((p) => {
      const hoeken = (p.nodeIds ?? []).map((id) => model.nodes.find((k) => k.id === id));
      if (hoeken.length < 3 || hoeken.some((h) => !h)) return false;
      const lussen = [
        hoeken as { x: number; z: number }[],
        ...(p.openingen ?? []).map((o) => o.punten).filter((o) => Array.isArray(o) && o.length >= 3),
      ];
      return lussen.some((lus) => lus.some((a, i) =>
        puntOpLijnstuk(a, lus[(i + 1) % lus.length], x, z, CONTROLE_TOL_MM)));
    });

  const uit: Bevinding[] = [];
  for (const n of model.nodes) {
    if ((graad.get(n.id) ?? 0) !== 1) continue;
    if (gesteund.has(n.id) || plaathoek.has(n.id)) continue;
    if (opPlaatrand(n.x, n.z)) continue;
    const staaf = model.beams.find((b) => b.from === n.id || b.to === n.id);
    uit.push({
      soort: "vrijUiteinde",
      ernst: "waarschuwing",
      nodeIds: [n.id],
      beamId: staaf?.id,
      tekst:
        `Knoop ${n.id} is een vrij uiteinde van staaf ${staaf?.id ?? "?"} ` +
        "zonder oplegging. Bedoeld als uitkraging? Zo niet: sluit hem aan of " +
        "geef hem een oplegging.",
    });
  }
  return uit;
}

/**
 * Staafknopen die BIJNA op een plaatrand liggen: verder dan `tolMm` (daar
 * koppelt de engine) maar dichter dan `STAAFEINDE_BIJ_RAND_MM` (femTypes, met
 * de verantwoording van die 50 mm). Omtrek en openingsranden gelijk.
 *
 * FOUT voor een VRIJ staafeinde (één staaf, geen oplegging) BUITEN het
 * plaatmateriaal — naast de omtrek of in een opening. De engine koppelt het
 * niet en weigert het met dezelfde tekst; hier staat het al terwijl je tekent.
 *
 * WAARSCHUWING in de andere gevallen. Een knoop die ook aan iets anders
 * vastzit, kan bewust naast de plaat staan. En een vrij einde BINNEN het
 * plaatmateriaal kan op een rekenknoop van een fijn net vallen — dat weet
 * alleen het mesh; valt het ernaast, dan weigert de engine met reden. Deze
 * controle mag niet strenger zijn dan de engine.
 */
export function zoekStaafeindenBijPlaatrand(
  model: ControleModel,
  tolMm: number = CONTROLE_TOL_MM,
): Bevinding[] {
  const platen = (model.plates ?? []).flatMap((p) => {
    const hoeken = (p.nodeIds ?? []).map((id) => model.nodes.find((k) => k.id === id));
    if (hoeken.length < 3 || hoeken.some((h) => !h)) return [];
    const openingen = (Array.isArray(p.openingen) ? p.openingen : [])
      .filter((o) => o && typeof o.id === "number" && Array.isArray(o.punten) && o.punten.length >= 3);
    return [{ id: p.id, hoeken: hoeken.map((h) => ({ x: h!.x, z: h!.z })), openingen }];
  });
  if (platen.length === 0) return [];
  const graad = knoopGraden(model);
  const gesteund = new Set((model.supports ?? []).map((s) => s.nodeId));
  const uit: Bevinding[] = [];
  for (const n of model.nodes) {
    const g = graad.get(n.id) ?? 0;
    if (g === 0) continue;
    let dichtst: { plaat: (typeof platen)[number]; rand: NabijePlaatrand } | null = null;
    for (const plaat of platen) {
      const rand = dichtstbijzijndePlaatrand({ x: n.x, z: n.z }, plaat.hoeken, plaat.openingen);
      if (rand && (!dichtst || rand.afstand < dichtst.rand.afstand)) dichtst = { plaat, rand };
    }
    if (!dichtst || !(dichtst.rand.afstand > tolMm && dichtst.rand.afstand < STAAFEINDE_BIJ_RAND_MM)) continue;
    const { plaat, rand } = dichtst;
    const inMateriaal = puntInPolygoon(n.x, n.z, plaat.hoeken)
      && !plaat.openingen.some((o) => puntInPolygoon(n.x, n.z, o.punten));
    const vrij = g === 1 && !gesteund.has(n.id);
    const staaf = model.beams.find((b) => b.from === n.id || b.to === n.id);
    const mm = String(Math.round(rand.afstand * 10) / 10).replace(".", ",");
    uit.push({
      soort: "staafeindeBijPlaatrand",
      ernst: vrij && !inMateriaal ? "fout" : "waarschuwing",
      nodeIds: [n.id],
      beamId: staaf?.id,
      tekst: vrij
        ? staafeindeBijPlaatrandTekst(plaat.id, `knoop ${n.id}`, rand)
        : `Plaat ${plaat.id}: knoop ${n.id} ligt ${mm} mm van ${rand.naam} en wordt niet aan ` +
          "die rand gekoppeld (dat gebeurt alleen binnen 1 mm). Bedoeld als aansluiting? Leg de " +
          `knoop op de rand. Zo niet, dan is ${STAAFEINDE_BIJ_RAND_MM} mm of meer afstand duidelijker.`,
    });
  }
  return uit;
}

/**
 * Losse knopen: een knoop waar geen staaf begint of eindigt en die geen
 * plaathoek is. Zo'n knoop blijft staan als je alleen een staaf verwijdert.
 *
 * WAARSCHUWING, GEEN FOUT — met een volledig inklemmende oplegging, of in een
 * model met platen (het gemengde pad zet een knoop zonder stijfheid vast),
 * rekent het model gewoon door. Maar in het raamwerkpad krijgt elke knoop drie
 * vrijheidsgraden, en een losse knoop maakt het stelsel dan singulier. Die
 * fout noemde vroeger alleen een kolomnummer ("column 6"); met deze
 * waarschuwing staat de knoop al vóór het rekenen in beeld.
 */
export function zoekLosseKnopen(model: ControleModel): Bevinding[] {
  const graad = knoopGraden(model);
  const plaathoek = new Set<number>();
  for (const p of model.plates ?? []) for (const id of p.nodeIds ?? []) plaathoek.add(id);
  const uit: Bevinding[] = [];
  for (const n of model.nodes) {
    if ((graad.get(n.id) ?? 0) !== 0 || plaathoek.has(n.id)) continue;
    uit.push({
      soort: "losseKnoop",
      ernst: "waarschuwing",
      nodeIds: [n.id],
      tekst:
        `Knoop ${n.id} zit aan geen enkele staaf of plaat vast. Een losse knoop ` +
        "draagt niets en maakt het stelsel singulier zodra hij kan bewegen of " +
        "draaien — verwijder hem, of verbind hem met de constructie.",
    });
  }
  return uit;
}

/**
 * Een materiaalnaam die hout én de korte naam van een betonklasse is
 * ("C16", "C20", "C30", "C35"). De solver en de houttoets rekenen hout; de
 * betontoets slaat de staaf over. Tot september 2026 zei niemand dat, en de
 * betonbouwer nam de staaf óók nog als beton — een spooktoets op de
 * houtstijfheid (basisaudit nr 16). Waarschuwing zonder korf; met een
 * wapeningskorf op de staaf botsen de twee lezingen en is het een fout.
 */
export function zoekDubbelzinnigMateriaal(model: ControleModel): Bevinding[] {
  const uit: Bevinding[] = [];
  for (const b of model.beams) {
    const d = dubbelzinnigMateriaal(b.material);
    if (!d) continue;
    const metKorf = b.checkConfig?.betonKorf !== undefined && b.checkConfig?.betonKorf !== null;
    uit.push({
      soort: "dubbelzinnigMateriaal",
      ernst: metKorf ? "fout" : "waarschuwing",
      // Geen knopen: het canvas hoeft niets op te lichten; de staaf staat erbij.
      nodeIds: [],
      beamId: b.id,
      tekst: dubbelzinnigMateriaalTekst(b.id, d, metKorf),
    });
  }
  return uit;
}

/**
 * Levert deze last een invoerregel voor de solver op?
 *
 * GEMETEN met `bouwMultiInput` zelf, op een proefmodel dat alleen deze last
 * bevat en waarin eigen gewicht en scheefstand uit staan: elke regel die er
 * dan uit komt, komt gegarandeerd van deze last. Dezelfde meetwijze als
 * `teltLastMee` in `mcp/valideerModel.ts` — de mapping blijft de enige
 * waarheid over wat meetelt, en er ontstaat geen tweede lezing die ernaast
 * kan gaan lopen.
 */
function teltLastMee(last: Load, loadCases: LoadCase[]): boolean {
  const mi = bouwMultiInput({
    nodes: [], beams: [], supports: [], plates: [],
    loadCases,
    loads: [last],
    selfWeightEnabled: false,
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  });
  return (
    mi.loads.length +
      (mi.pointLoads?.length ?? 0) +
      (mi.beamPointLoads?.length ?? 0) +
      (mi.thermalLoads?.length ?? 0) +
      (mi.edgeLoads?.length ?? 0) +
      (mi.edgePointLoads?.length ?? 0) >
    0
  );
}

/**
 * Lasten die het projectbestand wél draagt maar die bij het rekenen STIL
 * wegvallen (basisaudit ruw 30).
 *
 * Drie manieren waarop dat gebeurt, alle drie gemeten in de audit:
 *
 *  1. De if/else-keten van `bouwMultiInput` neemt een lijnlast alleen mee met
 *     `q`, een thermische last alleen met `deltaT`, en herkent alleen exact
 *     gespelde typen. Een trapeziumlast met alleen `qStart`/`qEnd`, of een
 *     tikfout ("lineload"), levert nul regels op.
 *  2. Een verwijzing naar een staaf, knoop of plaat die niet bestaat gaat wél
 *     de mapping in, maar de engine laat hem vallen.
 *  3. Een verwijzing naar een belastinggeval dat niet bestaat maakt het geval
 *     "zonder werkzame last"; `solveAllCases` slaat het over.
 *
 * In alle drie de gevallen is nul niet te onderscheiden van "niet
 * meegenomen", en dat is precies het verschil tussen een lege en een
 * onderbelaste constructie. De MCP-weg meet dit al (`valideerModel`); de
 * app-openroute deed het niet. Ernst "fout": doorrekenen geeft een antwoord
 * bij een ánder model dan er op het scherm staat.
 */
export function zoekStilleLasten(model: ControleModel): Bevinding[] {
  const loads = model.loads;
  if (!loads) return [];
  const uit: Bevinding[] = [];
  const beamIds = new Set(model.beams.map((b) => b.id));
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const plateIds = new Set((model.plates ?? []).map((p) => p.id));
  const caseIds = model.loadCases
    ? new Set(model.loadCases.map((c) => c.id))
    : undefined;
  for (const l of loads) {
    const verwijzingen: string[] = [];
    if (l.beamId !== undefined && !beamIds.has(l.beamId)) {
      verwijzingen.push(`staaf ${l.beamId}`);
    }
    if (l.nodeId !== undefined && !nodeIds.has(l.nodeId)) {
      verwijzingen.push(`knoop ${l.nodeId}`);
    }
    if (l.plateId !== undefined && !plateIds.has(l.plateId)) {
      verwijzingen.push(`plaat ${l.plateId}`);
    }
    if (caseIds !== undefined && !caseIds.has(l.caseId)) {
      verwijzingen.push(`belastinggeval ${l.caseId}`);
    }
    if (verwijzingen.length > 0) {
      uit.push({
        soort: "stilleLast",
        ernst: "fout",
        tekst:
          `Last ${l.id} verwijst naar ${verwijzingen.join(" en ")}, die niet ` +
          "(meer) bestaat. Bij het rekenen valt deze last weg zonder melding: " +
          "het resultaat hoort dan bij een model met minder belasting dan er is " +
          "ingevoerd.",
        nodeIds: l.nodeId !== undefined && nodeIds.has(l.nodeId) ? [l.nodeId] : [],
        ...(l.beamId !== undefined && beamIds.has(l.beamId) ? { beamId: l.beamId } : {}),
      });
      continue;
    }
    if (!teltLastMee(l, model.loadCases ?? [{ id: l.caseId, name: "", type: "dead" }])) {
      uit.push({
        soort: "stilleLast",
        ernst: "fout",
        tekst:
          `Last ${l.id} (type "${String(l.type)}") levert geen invoer voor de ` +
          "solver op en telt dus niet mee. Controleer of alle velden voor dit " +
          "lasttype ingevuld zijn: een lijnlast heeft `beamId` en `q` nodig (ook " +
          "een trapeziumlast, naast `qStart` en `qEnd`), een puntlast `nodeId` of " +
          "`beamId` — of op een plaatrand `plateId`, een rand en `posFrac` —, een " +
          "thermische last `beamId` en `deltaT`, en een randlast `plateId`, een " +
          "rand en `q`.",
        nodeIds: l.nodeId !== undefined ? [l.nodeId] : [],
        ...(l.beamId !== undefined ? { beamId: l.beamId } : {}),
      });
    }
  }
  return uit;
}

/**
 * De volledige controle: fouten eerst, dan waarschuwingen, binnen elke groep
 * op knoopnummer. Een vrij uiteinde dat óók al als fout is gemeld (de
 * kolomvoet die op een ligger ligt) wordt weggelaten — één oorzaak, één regel.
 */
export function controleerModel(
  model: ControleModel,
  tolMm: number = CONTROLE_TOL_MM,
): Bevinding[] {
  const materiaal = zoekDubbelzinnigMateriaal(model);
  const bijRand = zoekStaafeindenBijPlaatrand(model, tolMm);
  const fouten = [
    ...zoekKnopenOpStaaf(model, tolMm),
    ...zoekDubbeleKnopen(model, tolMm),
    ...zoekPlaatlastFouten(model),
    ...zoekOpeningFouten(model),
    ...zoekPlaatMateriaalFouten(model),
    ...zoekStilleLasten(model),
    ...materiaal.filter((m) => m.ernst === "fout"),
    ...bijRand.filter((b) => b.ernst === "fout"),
  ];
  const alGemeld = new Set<number>();
  for (const f of fouten) for (const id of f.nodeIds) alGemeld.add(id);
  const waarschuwingen = [
    // Een vrij einde dat al als "bijna op de plaatrand" gemeld is: één
    // oorzaak, één regel — die melding zegt meer.
    ...zoekVrijeUiteinden(model).filter((w) => !bijRand.some((b) => b.nodeIds[0] === w.nodeIds[0])),
    ...zoekLosseKnopen(model),
    ...materiaal.filter((m) => m.ernst === "waarschuwing"),
    ...bijRand.filter((b) => b.ernst === "waarschuwing"),
  ].filter((w) => !w.nodeIds.some((id) => alGemeld.has(id)));
  const opNummer = (a: Bevinding, b: Bevinding) =>
    (a.nodeIds[0] ?? 0) - (b.nodeIds[0] ?? 0) || (a.beamId ?? 0) - (b.beamId ?? 0);
  return [...fouten.sort(opNummer), ...waarschuwingen.sort(opNummer)];
}

/** Zijn er blokkerende bevindingen (ernst "fout")? */
export function heeftFouten(bevindingen: Bevinding[]): boolean {
  return bevindingen.some((b) => b.ernst === "fout");
}
