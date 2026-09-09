/**
 * betonZoneSneden — de zonegrenzen van de wapening worden REKENKNOPEN.
 *
 * ── HET PROBLEEM ───────────────────────────────────────────────────────────
 *
 * Op een zonegrens verandert het aantal staven, en daarmee SPRINGT de
 * opneembare weerstand: M_Rd en V_Rd hebben links en rechts van die grens een
 * andere waarde. De dekkingslijn (§9.2.1.3, figuur 9.2) moet daar dus twee
 * punten kunnen tonen. Maar de omhullende komt van de solver, en die levert per
 * REKENELEMENT een vast aantal stations. Valt er op de zonegrens geen station,
 * dan wordt de sprong weggeïnterpoleerd: de dekkingslijn leest de benodigde
 * kracht af op het dichtstbijzijnde station — tot een halve stationsafstand
 * ernaast — en zet die naast een weerstand die daar helemaal niet geldt.
 *
 * ── DE OPLOSSING, EN WAAROM ZIJ AL KLAARLAG ────────────────────────────────
 *
 * `SolverBeamInput.extraSneden` bestaat precies hiervoor: een lijst fracties
 * langs de staaf waar de adapter een echte rekenknoop legt. Twee rekenelementen
 * leveren elk hun eigen stations, dus op de snede staat het station DUBBEL —
 * en dat is wat een sprong nodig heeft.
 *
 * Kost dat nauwkeurigheid? Nee. Voor een Euler-Bernoulli-staaf met consistente
 * knooplasten is de eindige-elementenoplossing IN DE KNOPEN exact (de homogene
 * oplossing is kubisch en ligt dus in de Hermite-ruimte). Een extra knoop
 * midden op een staaf laat reacties en knoopverplaatsingen daarom ongemoeid en
 * maakt alleen het stationsraster fijner.
 *
 * ── ÉÉN BRON VOOR DE GRENZEN ───────────────────────────────────────────────
 *
 * De grenzen zelf worden hier NIET bedacht. `ReinforcementZones::boundaries_mm()`
 * in de rekenkern is de enige plaats waar staat wélke plaatsen dat zijn: alle
 * begin- en eindmaten van alle zones, oplopend en zonder doublures. Deze module
 * doet daar drie dingen mee, en niets meer:
 *
 *   1. dezelfde lijst afleiden uit dezelfde zonelijsten (zuiver een `flatMap`
 *      over de twee lijsten — géén tweede regel, alleen dezelfde opsomming);
 *   2. de twee STAAFUITEINDEN weglaten: daar zit al een knoop, en de adapter
 *      zou de fractie toch laten vallen;
 *   3. omrekenen naar de fractie 0…1 die `extraSneden` verwacht.
 *
 * ── WAT DEZE MODULE MET OPZET NIET DOET ────────────────────────────────────
 *
 * Zij past GEEN samenvoegregel toe en laat geen fracties vallen die te dicht op
 * elkaar of op een bestaande knoop liggen. Dat oordeel hoort in de adapter, en
 * daar staat het ook (`MIN_SEGMENT_MM`, de plaatknoop-uitsluiting, de weging
 * tegen de dwingende fracties). Een tweede, iets andere versie van die regel
 * hier zou betekenen dat de app en de sidecar op hetzelfde model een ander
 * rekenmesh kunnen bouwen.
 *
 * Zij weet ook niets van doorsneden, materialen of de toetsing — alleen van
 * zonegrenzen en staaflengtes. Daarom staat zij APART van
 * `betonDekkingslijn.ts`: `modelNaarSolverInput.ts` zit in de barrel van de
 * sidecarbundel en zou anders de hele invoerbouwer van de betontoetsing
 * meetrekken.
 */
import type { ReinforcementZones } from "./types/concrete/ReinforcementZones";
import type { Beam, Node } from "../components/fem/femTypes";
import type { MultiInput } from "../components/fem/solver/types";

/**
 * De speling waarmee twee zonegrenzen als DEZELFDE grens gelden, mm.
 *
 * Gelijk aan `ZONE_TOLERANCE_MM` in `nen-en-1992-1-1/src/section.rs`, en om
 * dezelfde reden zó klein: zonegrenzen komen uit een gebruikersinvoer of uit
 * een omrekening van meters naar millimeters, dus twee getallen die dezelfde
 * grens bedoelen kunnen een laatste bit schelen. Deze speling vangt die ruis op
 * en NIET een werkelijk gat — een gat van een tiende millimeter is nog steeds
 * een gat, en de kern hoort dat te melden.
 */
export const ZONE_TOLERANTIE_MM = 1e-6;

/**
 * Alle plaatsen waar de korf KAN veranderen, in mm vanaf de beginknoop:
 * oplopend, zonder doublures, en met de staafuiteinden er nog in.
 *
 * Dit is de TypeScript-tegenhanger van `ReinforcementZones::boundaries_mm()`.
 * Zij bedenkt niets: het is dezelfde opsomming van dezelfde velden uit dezelfde
 * twee lijsten.
 */
export function zoneGrenzenMm(zones: ReinforcementZones | undefined): number[] {
  if (!zones) return [];
  const ruw = [
    ...zones.longitudinal.flatMap((z) => [z.x_start_mm, z.x_end_mm]),
    ...zones.stirrups.flatMap((z) => [z.x_start_mm, z.x_end_mm]),
  ].filter((x) => Number.isFinite(x));
  ruw.sort((a, b) => a - b);
  const uit: number[] = [];
  for (const x of ruw) {
    if (uit.length === 0 || Math.abs(x - uit[uit.length - 1]) > ZONE_TOLERANTIE_MM) uit.push(x);
  }
  return uit;
}

/**
 * De zonegrenzen als snedefracties voor `SolverBeamInput.extraSneden`.
 *
 * De twee staafuiteinden vallen af: op x = 0 en x = L zit al een knoop, en een
 * fractie van 0 of 1 wordt door de adapter toch verworpen. Grenzen buiten
 * [0, L] vallen eveneens af — die horen niet bij deze staaf, en de kern
 * weigert zo'n zone-indeling zelf ook.
 *
 * Er wordt NIET afgerond en NIET samengevoegd; zie de moduletekst.
 */
export function zoneSnedeFracties(
  zones: ReinforcementZones | undefined,
  lengteMm: number,
): number[] {
  if (!(lengteMm > 0)) return [];
  return zoneGrenzenMm(zones)
    .filter((x) => x > ZONE_TOLERANTIE_MM && x < lengteMm - ZONE_TOLERANTIE_MM)
    .map((x) => x / lengteMm);
}

/**
 * De snedefracties van alle staven die wapeningszones dragen, per staaf-id.
 *
 * Staven zonder zones komen NIET in de map: een lege map betekent dat er niets
 * te knippen valt, en dat is precies de toestand waarin het model bit-identiek
 * aan voorheen rekent.
 *
 * De staaflengte komt uit de knoopcoördinaten van het model zelf — dezelfde
 * lengte waarmee de zones zijn ingevoerd en waarmee de toetsing rekent, zodat
 * een fractie hier niet op een andere plaats uitkomt dan de zonegrens bedoelt.
 */
export function zoneSnedenUitStaven(
  beams: Beam[],
  nodes: Node[],
): Map<number, number[]> {
  const knoop = new Map(nodes.map((n) => [n.id, n]));
  const uit = new Map<number, number[]>();
  for (const b of beams) {
    const zones = b.checkConfig?.betonZones;
    if (!zones || (zones.longitudinal.length === 0 && zones.stirrups.length === 0)) continue;
    const a = knoop.get(b.from);
    const c = knoop.get(b.to);
    if (!a || !c) continue; // ontbrekende knoop: lengte 0, en dan is er niets te knippen
    const fracties = zoneSnedeFracties(zones, Math.hypot(c.x - a.x, c.z - a.z));
    if (fracties.length > 0) uit.set(b.id, fracties);
  }
  return uit;
}

/**
 * Zet de snedefracties per staaf-id in een bestaande `MultiInput`.
 *
 * Zelfde vorm als `metSegmenten` in `betonStijfheid.ts`, en met dezelfde
 * garantie: een LEGE map levert letterlijk dezelfde invoer terug, dus een model
 * zonder wapeningszones rekent bit-identiek aan het bestaande pad.
 *
 * Bestaande `extraSneden` op een staaf blijven staan en de zonegrenzen komen
 * erbij — de adapter weegt de hele lijst daarna zelf tegen zijn dwingende
 * fracties.
 */
export function metZoneSneden(
  input: MultiInput,
  fractiesPerStaaf: Map<number, number[]>,
): MultiInput {
  if (fractiesPerStaaf.size === 0) return input;
  return {
    ...input,
    beams: input.beams.map((b) => {
      const extra = fractiesPerStaaf.get(b.id);
      if (!extra || extra.length === 0) return b;
      return { ...b, extraSneden: [...(b.extraSneden ?? []), ...extra] };
    }),
  };
}
