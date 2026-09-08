/**
 * statischeOnbepaaldheid.ts — de graad van statische onbepaaldheid van het
 * vlakke raamwerk, en de waarschuwing die daaruit volgt.
 *
 * WAAROM DIT BESTAAT. De profielvarianten (zie `profielVarianten.ts`) toetsen
 * een andere doorsnede tegen DEZELFDE krachtsverdeling. Dat is exact juist voor
 * een statisch bepaalde constructie: daar volgen N, V en M alleen uit evenwicht
 * en niet uit de stijfheid. Voor een statisch ONbepaalde constructie is het
 * aantoonbaar fout — een stijvere ligger trekt méér moment naar zich toe, een
 * slappere stoot het af naar zijn buren — en aan het getoonde getal is niet te
 * zien welke kant het op is. Dat mag dus nooit stilzwijgend gebeuren; deze
 * module levert de bepaling waarop de waarschuwing rust.
 *
 * DE TELLING. De gangbare telling voor een VLAK raamwerk (plane frame), zie
 * elk standaardwerk constructiemechanica:
 *
 *     n = 3·m + r − 3·j − c
 *
 * met
 *   m = aantal staven,
 *   r = aantal oplegreactiecomponenten,
 *   j = aantal knopen (starre verbindingen tellen als één knoop),
 *   c = aantal voorwaardenvergelijkingen uit scharnieren en andere ontkoppelde
 *       vrijheidsgraden (elke losgekoppelde DOF levert er één).
 *
 * n > 0 → statisch onbepaald (graad n)
 * n = 0 → statisch bepaald
 * n < 0 → de telling wijst een mechanisme aan
 *
 * Reactiecomponenten per opleggingstype:
 *   ingeklemd (fixed)          3   (H, V, M)
 *   scharnier (pinned)         2   (H, V)
 *   roloplegging (xRoller,
 *     zRoller)                 1
 *   veer (zSpring, xSpring,
 *     rotSpring)               1
 *
 * EEN VEER TELT MEE. Een lineaire veer levert een reactie die van de
 * verplaatsing afhangt, en die verplaatsing hangt van de stijfheidsverhouding
 * in de constructie af. De krachtsverdeling verandert dus wél mee met de
 * doorsnede — precies wat de waarschuwing wil vangen. Een veer als "geen
 * oplegging" tellen zou een verende inklemming statisch bepaald noemen en de
 * waarschuwing onterecht onderdrukken.
 *
 * WAT DE TELLING NIET KAN. Zij ziet alleen staven, knopen, opleggingen en
 * scharnieren. Wandschijven (platen) voegen redundantie toe die er niet in zit,
 * en een lokaal mechanisme naast een elders overbepaald deel kan elkaar in de
 * som opheffen. Daarom is het antwoord hieronder geen kale booleaan maar een
 * uitkomst mét de reden, en valt elke twijfel naar de VEILIGE kant: waarschuwen.
 */
import type { Beam, Node, Support, SupportType } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";

/** Reactiecomponenten per opleggingstype — zie de kop van dit bestand. */
export const REACTIECOMPONENTEN: Record<SupportType, number> = {
  fixed: 3,
  pinned: 2,
  xRoller: 1,
  zRoller: 1,
  zSpring: 1,
  xSpring: 1,
  rotSpring: 1,
};

/** Uitkomst van de bepaling: het getal, het oordeel én waarom. */
export interface OnbepaaldheidUitkomst {
  /** n = 3m + r − 3j − c; `null` wanneer de telling niet opgaat. */
  graad: number | null;
  /**
   * Mag de krachtsverdeling als doorsnede-onafhankelijk worden beschouwd?
   * Alleen `true` bij een aantoonbaar statisch bepaalde constructie zonder
   * platen — elke twijfel valt naar `false`.
   */
  statischBepaald: boolean;
  /** De telling in woorden, voor het rapport en de tooltip. */
  toelichting: string;
  /** Tellingsonderdelen, zodat de test en het rapport ze kunnen nalezen. */
  m: number;
  r: number;
  j: number;
  c: number;
  /** Bevat het model wandschijven? Dan zegt de staventelling niets. */
  metPlaten: boolean;
}

/** Aantal losgekoppelde vrijheidsgraden van één staaf (scharnieren, hulzen). */
export function releaseAantal(beam: Beam): number {
  const r = beam.releases;
  if (!r) return 0;
  let n = 0;
  for (const v of [r.startTx, r.startTz, r.startRy, r.endTx, r.endTz, r.endRy]) {
    if (v) n++;
  }
  return n;
}

/**
 * Bevat het doorgerekende model wandschijven? Af te lezen aan de
 * solverresultaten: `plateElements` is alleen aanwezig wanneer er platen in het
 * model zaten. Dat is hier de enige beschikbare bron — de toetsinvoer draagt de
 * platen niet — en het is een betrouwbaar signaal: geen platen, geen veld.
 */
export function heeftPlaten(resultaten: Iterable<SolverResult>): boolean {
  for (const r of resultaten) {
    if (r.plateElements && r.plateElements.length > 0) return true;
  }
  return false;
}

/**
 * Graad van statische onbepaaldheid van het vlakke raamwerk.
 *
 * `knopen` mag alle knopen van het model bevatten; alleen knopen die aan een
 * staaf of aan een oplegging hangen tellen mee. Losse knopen (bijvoorbeeld
 * hoekpunten van een plaat) zouden de telling anders naar een schijnbaar
 * mechanisme duwen.
 */
export function bepaalOnbepaaldheid(
  knopen: Node[],
  staven: Beam[],
  opleggingen: Support[] | undefined,
  solverResultaten: Iterable<SolverResult> = [],
): OnbepaaldheidUitkomst {
  const metPlaten = heeftPlaten(solverResultaten);

  const m = staven.length;

  const gebruikt = new Set<number>();
  for (const b of staven) {
    gebruikt.add(b.from);
    gebruikt.add(b.to);
  }
  const bestaande = new Set(knopen.map((n) => n.id));
  for (const s of opleggingen ?? []) {
    if (bestaande.has(s.nodeId)) gebruikt.add(s.nodeId);
  }
  const j = gebruikt.size;

  let r = 0;
  for (const s of opleggingen ?? []) {
    r += REACTIECOMPONENTEN[s.type] ?? 0;
  }

  let c = 0;
  for (const b of staven) c += releaseAantal(b);

  // Geen staven → er valt niets te tellen en niets te toetsen.
  if (m === 0) {
    return {
      graad: null,
      statischBepaald: false,
      toelichting: "Het model bevat geen staven; de graad van statische onbepaaldheid is niet bepaald.",
      m, r, j, c, metPlaten,
    };
  }

  // Zonder opleggingslijst is r onbekend. Dan niet raden: de telling is dan
  // geen telling meer, en het antwoord valt naar de veilige kant.
  if (opleggingen === undefined) {
    return {
      graad: null,
      statischBepaald: false,
      toelichting:
        "De opleggingen zijn niet aan de toetsing meegegeven, dus de graad van " +
        "statische onbepaaldheid kon niet worden bepaald. De varianten worden " +
        "daarom behandeld alsof de constructie statisch onbepaald is.",
      m, r, j, c, metPlaten,
    };
  }

  const graad = 3 * m + r - 3 * j - c;
  const telling =
    `n = 3·m + r − 3·j − c = 3·${m} + ${r} − 3·${j} − ${c} = ${graad} ` +
    `(m = staven, r = oplegreactiecomponenten, j = knopen, c = ontkoppelde vrijheidsgraden).`;

  if (metPlaten) {
    return {
      graad,
      statischBepaald: false,
      toelichting:
        `${telling} Het model bevat wandschijven; die tellen niet mee in deze ` +
        "staventelling en voegen altijd redundantie toe. De constructie wordt " +
        "daarom als statisch onbepaald behandeld.",
      m, r, j, c, metPlaten,
    };
  }

  if (graad < 0) {
    return {
      graad,
      statischBepaald: false,
      toelichting:
        `${telling} Een negatieve uitkomst wijst op een mechanisme, terwijl het ` +
        "model wél is doorgerekend. De telling klopt dan niet met het model " +
        "(bijvoorbeeld door een lokaal mechanisme naast een elders overbepaald " +
        "deel), en de varianten worden behandeld alsof de constructie statisch " +
        "onbepaald is.",
      m, r, j, c, metPlaten,
    };
  }

  if (graad === 0) {
    return {
      graad,
      statischBepaald: true,
      toelichting:
        `${telling} De constructie is statisch bepaald: de krachtsverdeling volgt ` +
        "uit evenwicht alleen en verandert niet met de doorsnede.",
      m, r, j, c, metPlaten,
    };
  }

  return {
    graad,
    statischBepaald: false,
    toelichting:
      `${telling} De constructie is ${graad}-voudig statisch onbepaald: de ` +
      "krachtsverdeling hangt af van de stijfheidsverhoudingen en verandert dus " +
      "mee met de doorsnede.",
    m, r, j, c, metPlaten,
  };
}
