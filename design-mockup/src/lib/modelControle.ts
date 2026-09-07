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
import type { Beam, Node, Plate, Support } from "../components/fem/femTypes";

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
  | "vrijUiteinde";

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
  beams: Pick<Beam, "id" | "from" | "to">[];
  supports?: Pick<Support, "nodeId">[];
  plates?: Pick<Plate, "id" | "nodeIds">[];
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

  const uit: Bevinding[] = [];
  for (const n of model.nodes) {
    if ((graad.get(n.id) ?? 0) !== 1) continue;
    if (gesteund.has(n.id) || plaathoek.has(n.id)) continue;
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
 * De volledige controle: fouten eerst, dan waarschuwingen, binnen elke groep
 * op knoopnummer. Een vrij uiteinde dat óók al als fout is gemeld (de
 * kolomvoet die op een ligger ligt) wordt weggelaten — één oorzaak, één regel.
 */
export function controleerModel(
  model: ControleModel,
  tolMm: number = CONTROLE_TOL_MM,
): Bevinding[] {
  const fouten = [
    ...zoekKnopenOpStaaf(model, tolMm),
    ...zoekDubbeleKnopen(model, tolMm),
  ];
  const alGemeld = new Set<number>();
  for (const f of fouten) for (const id of f.nodeIds) alGemeld.add(id);
  const waarschuwingen = zoekVrijeUiteinden(model).filter(
    (w) => !w.nodeIds.some((id) => alGemeld.has(id)),
  );
  const opNummer = (a: Bevinding, b: Bevinding) =>
    (a.nodeIds[0] ?? 0) - (b.nodeIds[0] ?? 0) || (a.beamId ?? 0) - (b.beamId ?? 0);
  return [...fouten.sort(opNummer), ...waarschuwingen.sort(opNummer)];
}

/** Zijn er blokkerende bevindingen (ernst "fout")? */
export function heeftFouten(bevindingen: Bevinding[]): boolean {
  return bevindingen.some((b) => b.ernst === "fout");
}
