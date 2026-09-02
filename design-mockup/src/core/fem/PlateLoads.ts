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
