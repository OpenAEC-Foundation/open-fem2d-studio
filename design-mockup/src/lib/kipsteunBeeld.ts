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
export interface KipsteunOpTekening extends Kipsteun, Punt {
  /**
   * De MODELstaaf waarop de steun ligt. Bij een doorgaande lijn is dat een van
   * de delen; een klik op het symbool selecteert dan het deel dat eronder ligt.
   */
  staafId: number;
}

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
  /** De modelstaaf aan het begin en aan het eind (bij een lijn: het buitenste deel). */
  eindStaafIds: { begin: number; eind: number };
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
      eindStaafIds: { begin: beam.id, eind: beam.id },
      steunen: [],
      kettingen: [],
    };
    const kip = kipsteunenVanStaaf(beam.checkConfig, lengteMm, soort);
    const delenMetKnopen = delen
      .map((id) => model.beams.find((m) => m.id === id))
      .map((m) => (m ? { id: m.id, a: knoop.get(m.from), b: knoop.get(m.to) } : null))
      .filter((d): d is { id: number; a: Node; b: Node } => !!d && !!d.a && !!d.b);
    // Het deel waar een punt op ligt: daar is de som van de afstanden tot de
    // twee knopen gelijk aan de deellengte, en elders groter.
    const deelOp = (p: Punt): number => {
      let staafId = beam.id;
      let beste = Infinity;
      for (const d of delenMetKnopen) {
        const over =
          Math.hypot(p.x - d.a.x, p.z - d.a.z) + Math.hypot(p.x - d.b.x, p.z - d.b.z) -
          Math.hypot(d.b.x - d.a.x, d.b.z - d.a.z);
        if (over < beste - 1e-6) { beste = over; staafId = d.id; }
      }
      return staafId;
    };
    // Net binnen het eind, zodat de tussenknoop van een lijn niet meedingt.
    beeld.eindStaafIds = {
      begin: deelOp(puntOpStaaf(beeld, lengteMm * 1e-6)),
      eind: deelOp(puntOpStaaf(beeld, lengteMm * (1 - 1e-6))),
    };
    beeld.steunen = kip.steunen.map((s) => {
      const p = puntOpStaaf(beeld, s.xMm);
      return { ...s, ...p, staafId: deelOp(p) };
    });
    beeld.kettingen = kip.kettingen;
    uit.push(beeld);
  }
  return uit;
}
