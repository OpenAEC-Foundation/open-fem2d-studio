/**
 * kipsteunBeeld.ts — de kipsteunen van het hele model, klaar om te tekenen.
 *
 * `lib/kipsteunen.ts` leidt de steunen af uit de toetsconfiguratie ZOALS DE
 * TOETSING HEM ZIET. Dit bestand zorgt dat de tekening ook werkelijk díe
 * configuratie krijgt, langs dezelfde twee stappen als de invoerbouwers van
 * staal en hout:
 *  1. `voegDoorgaandeLijnenSamen` — een ligger die door een tussenknoop zonder
 *     oplegging in delen is geknipt, wordt als ÉÉN staaf getoetst, met de
 *     kipsteunen van de delen omgerekend naar de lijn en de tussenknoop NIET
 *     als gaffel. De tekening toont dus één ketting over de hele lijn;
 *  2. `toetsdataInReferentierichting` — fracties tellen van links naar rechts
 *     (staand: van voet naar kop), en "boven" is de zijde links van die
 *     richting: het bovenvlak van een ligger, de LINKERzijde van een kolom.
 * Daarna komt alles terug in wereldcoördinaten, zodat het tekenvlak niets van
 * spiegelen hoeft te weten.
 *
 * Zuiver: geen React, geen DOM, geen resultaten nodig. De tekening toont de
 * AANNAME, ook vóór er gerekend is.
 */
import type { Beam, Node, Support } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { Staafeinden } from "./types/steel/Staafeinden";
import type { Staafstand } from "./types/steel/Staafstand";
import { STEEL_GRADES, beamLengthMm, isSteelProfile } from "./steelCheckBuilder";
import { matchSupportedTimberGrade } from "./timberCheckBuilder";
import { bepaalStaafeinden, voegDoorgaandeLijnenSamen } from "./doorgaandeLijn";
import { referentieVanStaaf, toetsdataInReferentierichting } from "./referentierichting";
import {
  kipsteunenVanStaaf,
  type Kipsteun,
  type KipsteunSoort,
  type Kipveldketting,
} from "./kipsteunen";

export interface KipsteunModel {
  nodes: Node[];
  beams: Beam[];
  /**
   * Zonder opleggingenlijst worden er geen lijnen samengevoegd en gelden alle
   * staafeinden als gaffel — dezelfde terugval als in de bouwers.
   */
  supports?: Support[];
  plates?: { nodeIds: number[] }[];
}

export interface Punt {
  x: number;
  z: number;
}

/** Een kipsteun met zijn plaats in het model (mm, wereldcoördinaten). */
export interface KipsteunOpTekening extends Kipsteun, Punt {}

/** De kipsteunen van één GETOETSTE staaf (een losse staaf of een doorgaande lijn). */
export interface KipsteunBeeld {
  /** Het staafnummer waaronder de toetsing deze staaf voert. */
  toetsId: number;
  /** De modelstaven waaruit hij bestaat; bij een losse staaf alleen hijzelf. */
  staafIds: number[];
  soort: KipsteunSoort;
  /** Begin en eind in de referentierichting van de toetsing (mm, wereld). */
  begin: Punt;
  eind: Punt;
  lengteMm: number;
  staafstand: Staafstand;
  /**
   * Eenheidsvector (wereld, z omhoog) naar de zijde die de toetsing "boven"
   * noemt: 90° linksom vanaf de referentierichting.
   */
  boven: Punt;
  /**
   * Wat de toetsing aan de staafeinden aanneemt. Een GAFFEL is een impliciete
   * kipsteun (NB.NB.4.3) en hoort op de tekening; een vrij of doorlopend eind
   * is dat niet. De staalkern krijgt dit veld; de houtkern niet, maar art.
   * 6.3.3 gaat evengoed uit van tegen torsie gesteunde opleggingen, dus de
   * tekening houdt voor hout dezelfde beoordeling aan.
   */
  einden: Staafeinden;
  steunen: KipsteunOpTekening[];
  kettingen: Kipveldketting[];
}

/** Staal, hout, of geen van beide (beton, kruislaaghout, onbekend): dan geen kiptoets. */
export function kipsteunSoortVanStaaf(beam: Beam): KipsteunSoort | null {
  // Hout EERST, net als in de houtbouwer: `isSteelProfile` geeft `true` voor
  // elke eigen doorsnede, ook een houten.
  if (matchSupportedTimberGrade(beam.material)) return "hout";
  if (isSteelProfile(beam.profile) && STEEL_GRADES.includes((beam.material ?? "").toUpperCase())) {
    return "staal";
  }
  return null;
}

/** Een punt op de staaf, op `xMm` vanaf `begin` in de richting van `eind`. */
export function puntOpStaaf(beeld: Pick<KipsteunBeeld, "begin" | "eind" | "lengteMm">, xMm: number): Punt {
  const f = beeld.lengteMm > 0 ? xMm / beeld.lengteMm : 0;
  return {
    x: beeld.begin.x + (beeld.eind.x - beeld.begin.x) * f,
    z: beeld.begin.z + (beeld.eind.z - beeld.begin.z) * f,
  };
}

/**
 * De kipsteunen van alle stalen en houten staven van het model, per getoetste
 * staaf. Staven zonder knopen of met lengte 0 vallen weg.
 */
export function kipsteunBeelden(model: KipsteunModel): KipsteunBeeld[] {
  const teToetsen = model.beams.filter((b) => kipsteunSoortVanStaaf(b) !== null);
  if (teToetsen.length === 0) return [];
  const lijn = voegDoorgaandeLijnenSamen({
    nodes: model.nodes,
    beams: teToetsen,
    alleBeams: model.beams,
    supports: model.supports,
    plates: model.plates,
    combinationResults: new Map<number, SolverResult>(),
  });
  const data = toetsdataInReferentierichting(lijn.data);
  const knoop = new Map(model.nodes.map((n) => [n.id, n]));

  const uit: KipsteunBeeld[] = [];
  for (const beam of data.beams) {
    const soort = kipsteunSoortVanStaaf(beam);
    const a = knoop.get(beam.from);
    const b = knoop.get(beam.to);
    const lengteMm = beamLengthMm(beam, data.nodes);
    if (!soort || !a || !b || !(lengteMm > 0)) continue;
    const delen = lijn.lijnen.get(beam.id)?.delen.map((d) => d.beam.id) ?? [beam.id];
    const dx = (b.x - a.x) / lengteMm;
    const dz = (b.z - a.z) / lengteMm;
    const beeld: KipsteunBeeld = {
      toetsId: beam.id,
      staafIds: delen,
      soort,
      begin: { x: a.x, z: a.z },
      eind: { x: b.x, z: b.z },
      lengteMm,
      staafstand: referentieVanStaaf(beam, data.nodes).staafstand,
      boven: { x: -dz, z: dx },
      einden: bepaalStaafeinden(beam, data.nodes, model.beams, model.supports, new Set(delen), model.plates),
      steunen: [],
      kettingen: [],
    };
    const kip = kipsteunenVanStaaf(beam.checkConfig, lengteMm, soort);
    beeld.steunen = kip.steunen.map((s) => ({ ...s, ...puntOpStaaf(beeld, s.xMm) }));
    beeld.kettingen = kip.kettingen;
    uit.push(beeld);
  }
  return uit;
}
