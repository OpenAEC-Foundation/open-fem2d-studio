/**
 * PlateLoads — plaatlasten-helpers in de kern (taak P1.2).
 *
 * Zet lasten op membraanelementen (wandschijven) om naar equivalente
 * knooplasten, zonder de mesh zelf te muteren:
 *
 * 1. Eigengewicht: per element W = ρ·g·t·A, gelijk verdeeld over de knopen
 *    (CST: W/3 per knoop, Quad4: W/4 per knoop), werkend in −y (in de
 *    core-conventie is y de verticale in-vlak-as; de UI noemt die as z).
 *    De som over alle elementen is daarmee EXACT ΣF = ρ·g·t·A_totaal.
 * 2. Randlast (kracht per lengte langs een rij randknopen): dunne wrapper
 *    om de bestaande conversie via cumulatieve booglengte + tributary
 *    lengths (convertEdgeNodeIdsToNodalForces, PlateRegion.ts) — inwendige
 *    knopen dragen het halve interval aan weerszijden, randknopen het
 *    halve aangrenzende interval ("trapeziumverdeling", ½-gewicht).
 *
 * De helpers geven een lijst knoopkrachten terug; applyNodalForces telt ze
 * additief op bij de bestaande knooplasten (meerdere bijdragen stapelen).
 */

import { Mesh } from './Mesh';
import { IElement } from './types';
import { convertEdgeNodeIdsToNodalForces } from './PlateRegion';

/** Equivalente knoopkracht (N) op één knoop, in globale assen. */
export interface INodalForce {
  nodeId: number;
  fx: number;
  fy: number;
}

/** Standaard valversnelling (m/s²). */
export const STANDARD_GRAVITY = 9.81;

/**
 * Oppervlakte van een membraanelement (CST of Quad4) via de
 * schoenveterformule over de knopen in gegeven volgorde. Voor de
 * (tegen-de-klok-in genummerde) elementen van deze codebase is het
 * resultaat positief; |·| maakt de helper ordening-ongevoelig.
 */
export function computeElementArea(mesh: Mesh, element: IElement): number {
  const nodes = element.nodeIds.map((nid) => mesh.getNode(nid));
  if (nodes.some((n) => n === undefined)) return 0;
  let sum = 0;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export interface SelfWeightOptions {
  /** Alleen deze element-ids meenemen (default: alle membraanelementen). */
  elementIds?: number[];
  /** Valversnelling (m/s²), default STANDARD_GRAVITY. */
  g?: number;
}

/**
 * Eigengewicht van membraanelementen → equivalente knooplasten.
 * Per element: W = ρ·g·t·A, gelijk verdeeld over de elementknopen
 * (CST: W/3, Quad4: W/4), als fy = −W/n (omlaag). Bijdragen van meerdere
 * elementen op dezelfde knoop worden gesommeerd. De totale som is exact
 * ΣFy = −ρ·g·t·A_totaal (optellen is de enige bewerking na de exacte
 * oppervlakteformule).
 */
export function computeSelfWeightNodalForces(
  mesh: Mesh,
  options: SelfWeightOptions = {}
): INodalForce[] {
  const g = options.g ?? STANDARD_GRAVITY;
  const elements: IElement[] = [];
  if (options.elementIds) {
    for (const eid of options.elementIds) {
      const el = mesh.getElement(eid);
      if (el) elements.push(el);
    }
  } else {
    elements.push(...mesh.elements.values());
  }

  const perNode = new Map<number, number>(); // nodeId → ΣFy (negatief)
  for (const element of elements) {
    const nNodes = element.nodeIds.length;
    if (nNodes !== 3 && nNodes !== 4) continue; // alleen CST/Quad4-membranen
    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;
    const area = computeElementArea(mesh, element);
    const weight = material.rho * g * element.thickness * area; // N
    const share = weight / nNodes;
    for (const nid of element.nodeIds) {
      perNode.set(nid, (perNode.get(nid) ?? 0) - share);
    }
  }

  const forces: INodalForce[] = [];
  for (const [nodeId, fy] of perNode) {
    forces.push({ nodeId, fx: 0, fy });
  }
  return forces;
}

/**
 * Randlast (px, py in N/m, globale assen) op een geordende rij randknopen →
 * equivalente knooplasten. Dunne wrapper om de bestaande conversie met
 * cumulatieve booglengte en tributary lengths in PlateRegion.ts, zodat
 * engine-code de randlast-omzetting via één kernmodule aanspreekt.
 */
export function computeEdgeLoadNodalForces(
  mesh: Mesh,
  edgeNodeIds: number[],
  px: number,
  py: number
): INodalForce[] {
  return convertEdgeNodeIdsToNodalForces(mesh, edgeNodeIds, px, py);
}

/**
 * Consistente knoopkrachten van een lijnlast langs een plaatrand — ook een
 * DEELLAST of een TRAPEZIUMLAST.
 *
 * WAAROM CONSISTENT, EN WAAROM DAT EXACT IS. De randen van de schijfelementen
 * (CST en Quad4) zijn lineair: langs de elementrand tussen randknoop j (op
 * booglengte s_j) en randknoop j+1 (op s_{j+1}, lengte ℓ = s_{j+1} − s_j)
 * gelden de vormfuncties
 *     N_j(s) = (s_{j+1} − s)/ℓ,     N_{j+1}(s) = (s − s_j)/ℓ.
 * De knoopkracht die dezelfde virtuele arbeid levert als de verdeelde last is
 *     F_k = ∫ N_k(s)·p(s) ds    (k = j, j+1),
 * genomen over het BELASTE deel van die elementrand. De last p(s) loopt
 * lineair van pA op sA naar pB op sB en is daarbuiten nul. Op het gesneden
 * interval [lo, hi] = [max(s_j, sA), min(s_{j+1}, sB)] is N_k·p dus een
 * tweedegraads polynoom, en daarop is de regel van Simpson exact:
 *     ∫_lo^hi f ds = (hi − lo)/6 · (f(lo) + 4·f(½(lo+hi)) + f(hi)).
 * Begint of eindigt het belaste deel midden in een elementrand, dan snijdt
 * [lo, hi] dat vanzelf af: er hoeft geen rekenknoop op de lastgrens te komen,
 * het mesh blijft in elk belastinggeval hetzelfde, en de combinaties van
 * plaatspanningen (die per elementindex optellen) blijven kloppen.
 *
 * Voor een gelijkmatige last over een volle elementrand geeft dit ½·p·ℓ per
 * knoop — de tributaire verdeling van `convertEdgeNodeIdsToNodalForces`.
 *
 * `nodeIds` en `s` (m, oplopend) beschrijven de randknopen van de begin- naar
 * de eindhoek; `sA < sB` (m) begrenzen het belaste deel; de lastwaarden zijn
 * in N/m, globale assen. Knopen zonder bijdrage komen niet in de uitvoer.
 */
export function verdeelRandlastConsistent(
  nodeIds: number[],
  s: number[],
  sA: number,
  sB: number,
  pxA: number,
  pyA: number,
  pxB: number,
  pyB: number,
): INodalForce[] {
  const perKnoop = new Map<number, { fx: number; fy: number }>();
  const tel = (nodeId: number, fx: number, fy: number) => {
    const oud = perKnoop.get(nodeId) ?? { fx: 0, fy: 0 };
    perKnoop.set(nodeId, { fx: oud.fx + fx, fy: oud.fy + fy });
  };
  const lengte = sB - sA;
  if (!(lengte > 0)) return [];
  /** Lastwaarde op booglengte x (lineair over het belaste deel). */
  const px = (x: number) => pxA + (pxB - pxA) * ((x - sA) / lengte);
  const py = (x: number) => pyA + (pyB - pyA) * ((x - sA) / lengte);

  for (let j = 0; j + 1 < nodeIds.length; j++) {
    const s0 = s[j], s1 = s[j + 1];
    const l = s1 - s0;
    if (!(l > 0)) continue;
    const lo = Math.max(s0, sA);
    const hi = Math.min(s1, sB);
    if (!(hi > lo)) continue;                      // dit stuk rand is onbelast
    const m = 0.5 * (lo + hi);
    const w = (hi - lo) / 6;
    const Nj = (x: number) => (s1 - x) / l;
    const Nk = (x: number) => (x - s0) / l;
    // Simpson per vormfunctie en per component.
    tel(nodeIds[j],
      w * (Nj(lo) * px(lo) + 4 * Nj(m) * px(m) + Nj(hi) * px(hi)),
      w * (Nj(lo) * py(lo) + 4 * Nj(m) * py(m) + Nj(hi) * py(hi)));
    tel(nodeIds[j + 1],
      w * (Nk(lo) * px(lo) + 4 * Nk(m) * px(m) + Nk(hi) * px(hi)),
      w * (Nk(lo) * py(lo) + 4 * Nk(m) * py(m) + Nk(hi) * py(hi)));
  }
  return nodeIds
    .filter((id) => perKnoop.has(id))
    .map((id) => ({ nodeId: id, ...perKnoop.get(id)! }));
}

/**
 * Consistente knoopkrachten van een PUNTLAST op een plaatrand.
 *
 * Een puntlast F op booglengte sP is de grensvorm van een verdeelde last; met
 * dezelfde lineaire vormfuncties als hierboven geeft de virtuele arbeid
 *     F_j = N_j(sP)·F = (s_{j+1} − sP)/ℓ · F,   F_{j+1} = (sP − s_j)/ℓ · F
 * op de twee randknopen van de elementrand waarop de last staat. Dat is EXACT
 * de last die een lineaire elementrand kan dragen: geen nieuw net, geen
 * gewijzigde meshsignatuur, en in elk belastinggeval hetzelfde mesh. Valt sP
 * op een randknoop, dan gaat de hele kracht naar die knoop.
 *
 * Wat dit bewust NIET geeft: de spanningspiek direct onder de last. Een
 * membraan onder een puntlast is ter plaatse singulier; de piek hangt van de
 * elementgrootte af en zegt zonder uitlezen op afstand weinig. Een afgedwongen
 * rekenknoop op de lastpositie is een mogelijke vervolgstap — die moet dan wel
 * lastgeval-onafhankelijk, omdat combinaties plaatspanningen per elementindex
 * optellen.
 *
 * `sP` wordt op [s_0, s_laatste] geklemd tegen afrondruis; de aanroeper
 * weigert posities die werkelijk buiten de rand liggen.
 */
export function verdeelRandpuntlastConsistent(
  nodeIds: number[],
  s: number[],
  sP: number,
  fx: number,
  fy: number,
): INodalForce[] {
  const n = nodeIds.length;
  if (n === 0) return [];
  const x = Math.min(s[n - 1], Math.max(s[0], sP));
  for (let j = 0; j + 1 < n; j++) {
    const s0 = s[j], s1 = s[j + 1];
    if (x < s0 || x > s1) continue;
    const l = s1 - s0;
    if (!(l > 0)) continue;
    const t = (x - s0) / l;
    return [
      { nodeId: nodeIds[j], fx: (1 - t) * fx, fy: (1 - t) * fy },
      { nodeId: nodeIds[j + 1], fx: t * fx, fy: t * fy },
    ];
  }
  // Eén randknoop (kan niet bij een geldige rand): alles op die knoop.
  return [{ nodeId: nodeIds[0], fx, fy }];
}

/**
 * Telt knoopkrachten additief op bij de bestaande knooplasten in de mesh
 * (bestaande fx/fy/moment blijven behouden; bijdragen stapelen).
 */
export function applyNodalForces(mesh: Mesh, forces: INodalForce[]): void {
  for (const f of forces) {
    const node = mesh.getNode(f.nodeId);
    if (!node) continue;
    mesh.updateNode(f.nodeId, {
      loads: {
        ...node.loads,
        fx: node.loads.fx + f.fx,
        fy: node.loads.fy + f.fy,
      },
    });
  }
}
