/**
 * useFemStore — single hook owning all FEM model state.
 *
 * Used by App.tsx so FemCanvas, FemProjectTree, FemProperties and the
 * Ribbon buttons all consume the same model. Keeps state lifting tidy
 * (no prop-drilling soup) without introducing an external store library.
 *
 * Includes a tiny undo/redo history stack — every mutating action pushes
 * a Snapshot, Ctrl+Z restores the previous one.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import type {
  Node, Beam, BeamReleases, Plate, PlaatMeshCache, Support, Load, LoadCase,
  Selection, Snapshot, SupportType, StructuralGrid,
} from "../components/fem/femTypes";
import {
  DEFAULT_STRUCTURAL_GRID, PLATE_DEFAULTS, withPlateDefaults,
  registreerPlaatMeshCaches, registreerPolygoonRandlasten,
  registreerPlaatMeshCacheCommitter,
} from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type {
  LoadCombination, Envelope,
} from "../components/fem/solver/combinations";
import { defaultCombinations } from "../components/fem/solver/combinations";

// ── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_NODES: Node[] = [
  { id: 1, x: 0,     z: 0 },
  { id: 2, x: 12000, z: 0 },
  { id: 3, x: 0,     z: 5000 },
  { id: 4, x: 12000, z: 5000 },
];
// Expliciet materiaal/profiel: zonder deze velden viel de solver stil terug
// op dezelfde defaults (HEA 160 / S235) maar met een console-warning per
// staaf per berekening, en presenteerde het rapport een impliciete default
// als bewuste profielkeuze.
const DEFAULT_BEAMS: Beam[] = [
  { id: 1, from: 1, to: 3, material: "S235", profile: "HEA160" },
  { id: 2, from: 2, to: 4, material: "S235", profile: "HEA160" },
  { id: 3, from: 3, to: 4, material: "S235", profile: "HEA160" },
];
const DEFAULT_SUPPORTS: Support[] = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 2, type: "pinned" },
];
const DEFAULT_PLATES: Plate[] = [];
const DEFAULT_LOAD_CASES: LoadCase[] = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)",  type: "live" },
  { id: 3, name: "Sneeuw (S)",    type: "snow" },
  { id: 4, name: "Wind (W)",      type: "wind" },
];
// Pre-populate one line load on top beam (id 3) in the permanent case,
// so the solver still has something to act on by default.
const DEFAULT_LOADS: Load[] = [
  { id: 1, type: "lineLoad", caseId: 1, beamId: 3, q: -5 /* kN/m */ },
];

/**
 * Snapshot zoals de undo-historie hem bewaart: het model PLUS het stramien.
 * Het stramien zit bewust in de historie sinds een as-verplaatsing de knopen
 * op die as meeneemt (zie `verplaatsStramienAs`): as en knopen horen dan bij
 * elkaar en moeten met één Ctrl+Z samen terug. Het veld is optioneel zodat
 * bestaande snapshot-constructies (en `Snapshot` zelf, dat het model-contract
 * voor de solver/IO beschrijft) ongewijzigd blijven werken.
 */
type HistorieSnapshot = Snapshot & { structuralGrid?: StructuralGrid };

function makeInitialSnapshot(): HistorieSnapshot {
  return {
    nodes: [...DEFAULT_NODES],
    beams: [...DEFAULT_BEAMS],
    supports: [...DEFAULT_SUPPORTS],
    plates: [...DEFAULT_PLATES],
    loads: [...DEFAULT_LOADS],
    structuralGrid: DEFAULT_STRUCTURAL_GRID,
  };
}

const HISTORY_LIMIT = 100;

/** Tolerantie waarmee een knoop "op" een stramienas ligt (mm). */
export const STRAMIEN_TOL_MM = 1;

/**
 * Knoop-ids die op een stramienas liggen.
 *  - `as: "x"` → verticale stramienas: knopen met x ≈ `positieMm`.
 *  - `as: "z"` → niveau (horizontale as): knopen met z ≈ `positieMm`.
 * De tolerantie is standaard 1 mm; het model rekent in mm en assen worden op
 * hele mm gezet, dus dat vangt afrondingsruis zonder buurknopen op te pikken.
 */
export function knopenOpStramienAs(
  nodes: Pick<Node, "id" | "x" | "z">[],
  as: "x" | "z",
  positieMm: number,
  tolMm: number = STRAMIEN_TOL_MM,
): number[] {
  return nodes
    .filter(n => Math.abs((as === "x" ? n.x : n.z) - positieMm) <= tolMm)
    .map(n => n.id);
}

/** Resultaat van `berekenStramienVerplaatsing`. */
export interface StramienVerplaatsing {
  /** Verplaatsing van de as zelf (mm), positief = naar +x resp. +z. */
  delta: number;
  /** Zelfde verplaatsing uitgesplitst voor `translateNodes`. */
  dx: number;
  dz: number;
  /** Knopen die op de as liggen en dus meebewegen. */
  nodeIds: number[];
}

/**
 * Pure rekenkern achter het verslepen van een stramienas via de maatlijn.
 *
 * GEKOZEN GEDRAG — "lokale maat", niet "kettingmaat":
 * alléén de as die bij de bewerkte maat hoort verschuift. Staat het stramien
 * A-B-C en wijzig je de maat A-B, dan schuift B (plus alles wat OP B staat);
 * C blijft op zijn absolute positie en de maat B-C verandert dus zichtbaar
 * mee. Reden: de bewerking blijft lokaal en volledig zichtbaar — er verplaatst
 * nooit een deel van het model dat je niet in beeld had. Bij de kettingvariant
 * (C schuift mee) zou ook alles rechts van C verschuiven, inclusief knopen die
 * NIET op een as liggen en dus achterblijven — precies de stille vervorming
 * die deze functie moet voorkomen. Hetzelfde geldt één-op-één voor niveaus:
 * alleen het bewerkte niveau schuift, hogere niveaus blijven staan.
 *
 * Knopen "verderop" (voorbij de verplaatste as) blijven staan, tenzij ze zelf
 * exact op de verplaatste as liggen. Meerdere knopen op dezelfde as (een
 * kolomlijn over meerdere verdiepingen) gaan allemaal mee.
 */
export function berekenStramienVerplaatsing(
  nodes: Pick<Node, "id" | "x" | "z">[],
  as: "x" | "z",
  huidigePositie: number,
  nieuwePositie: number,
  tolMm: number = STRAMIEN_TOL_MM,
): StramienVerplaatsing {
  const delta = nieuwePositie - huidigePositie;
  return {
    delta,
    dx: as === "x" ? delta : 0,
    dz: as === "z" ? delta : 0,
    nodeIds: knopenOpStramienAs(nodes, as, huidigePositie, tolMm),
  };
}

/**
 * Pure splitslogica voor `splitBeamAt` — losgetrokken uit de hook zodat hij
 * unit-testbaar is (zie design-mockup/test-splitsen.mjs).
 *
 * Gedrag:
 *  - Beide nieuwe staven erven materiaal + profiel van de oorspronkelijke staaf.
 *  - Releases: de start-releases (startTx/startTz/startRy) gaan mee met deel 1
 *    (startzijde), de eind-releases (endTx/endTz/endRy) met deel 2 (eindzijde).
 *    De nieuwe tussenknoop is momentvast: geen releases aan de binnenzijden.
 *  - Lijnlasten op de gesplitste staaf gaan over op beide delen: uniform →
 *    zelfde q op beide delen; trapezium (qStart ≠ qEnd) → lineair
 *    geïnterpoleerd op het splitspunt (deel 1: qStart→qMid, deel 2: qMid→qEnd).
 *    Deellasten (startFrac/endFrac) worden HERMAPT naar de delen: het belaste
 *    interval wordt met het splitspunt gesneden en per deel opnieuw als
 *    fracties uitgedrukt; een deel zonder belast interval krijgt geen last.
 *    Trapeziumwaarden worden daarbij op de snijgrens geïnterpoleerd over het
 *    belaste interval.
 *  - Temperatuurlasten (deltaT) worden op beide delen gedupliceerd.
 *  - Knoopgebonden lasten (pointForce/pointMoment) verwijzen naar knopen, niet
 *    naar staven, en blijven ongemoeid. Een eventueel toekomstig staafgebonden
 *    lasttype dat hier niet bekend is wordt behoudend ongewijzigd gelaten.
 *
 * Retourneert null wanneer de staaf of zijn eindknopen niet bestaan.
 */
export function computeBeamSplit(
  cur: Pick<Snapshot, "nodes" | "beams" | "loads">,
  beamId: number, x: number, z: number,
): { nodes: Node[]; beams: Beam[]; loads: Load[]; newNodeId: number } | null {
  const beam = cur.beams.find(b => b.id === beamId);
  if (!beam) return null;
  const nodeA = cur.nodes.find(n => n.id === beam.from);
  const nodeB = cur.nodes.find(n => n.id === beam.to);
  if (!nodeA || !nodeB) return null;

  const newNodeId = cur.nodes.length === 0 ? 1 : Math.max(...cur.nodes.map(n => n.id)) + 1;
  const nodes = [...cur.nodes, { id: newNodeId, x, z }];

  // Relatieve positie van het splitspunt op de staaf (0 = start, 1 = eind) —
  // nodig voor de interpolatie van trapeziumlasten.
  const len = Math.hypot(nodeB.x - nodeA.x, nodeB.z - nodeA.z);
  const t = len > 1e-9
    ? Math.min(1, Math.max(0, Math.hypot(x - nodeA.x, z - nodeA.z) / len))
    : 0.5;

  const maxBeamId = Math.max(...cur.beams.map(b => b.id));
  const rel = beam.releases;
  const startRel: BeamReleases | undefined =
    rel && (rel.startTx || rel.startTz || rel.startRy)
      ? { startTx: rel.startTx, startTz: rel.startTz, startRy: rel.startRy }
      : undefined;
  const endRel: BeamReleases | undefined =
    rel && (rel.endTx || rel.endTz || rel.endRy)
      ? { endTx: rel.endTx, endTz: rel.endTz, endRy: rel.endRy }
      : undefined;
  // `...beam` neemt materiaal/profiel (en toekomstige velden) mee; id/from/to/
  // releases worden expliciet overschreven.
  const beam1: Beam = { ...beam, id: maxBeamId + 1, from: beam.from, to: newNodeId, releases: startRel };
  const beam2: Beam = { ...beam, id: maxBeamId + 2, from: newNodeId, to: beam.to, releases: endRel };
  const beams = cur.beams.filter(b => b.id !== beamId).concat([beam1, beam2]);

  let nextLoadId = cur.loads.length === 0 ? 1 : Math.max(...cur.loads.map(l => l.id)) + 1;
  const loads: Load[] = [];
  for (const l of cur.loads) {
    if (l.beamId !== beamId) { loads.push(l); continue; }
    if (l.type === "lineLoad") {
      // Belast interval als fracties op de OORSPRONKELIJKE staaf.
      const a = Math.min(1, Math.max(0, l.startFrac ?? 0));
      const b = Math.min(1, Math.max(0, l.endFrac ?? 1));
      const isTrapezium = l.qStart !== undefined && l.qEnd !== undefined && l.qStart !== l.qEnd;
      // q op een fractie s van het BELASTE interval [a,b] (trapezium
      // loopt lineair over het belaste deel, niet over de hele staaf).
      const qAt = (s: number) => {
        if (!isTrapezium) return undefined;
        const rel = b > a ? (s - a) / (b - a) : 0;
        return l.qStart! + rel * (l.qEnd! - l.qStart!);
      };
      // Deel 1 (0..t): belast interval [a, min(b,t)] → fracties /t.
      if (a < t && t > 1e-12) {
        const b1 = Math.min(b, t);
        const full1 = a <= 0 && b1 >= t; // dekt deel 1 volledig
        loads.push({
          ...l, id: nextLoadId++, beamId: beam1.id,
          ...(isTrapezium ? { qStart: l.qStart, qEnd: qAt(b1) } : {}),
          startFrac: full1 ? undefined : a / t,
          endFrac:   full1 ? undefined : b1 / t,
        });
      }
      // Deel 2 (t..1): belast interval [max(a,t), b] → fracties −t, /(1−t).
      if (b > t && 1 - t > 1e-12) {
        const a2 = Math.max(a, t);
        const full2 = a2 <= t && b >= 1; // dekt deel 2 volledig
        loads.push({
          ...l, id: nextLoadId++, beamId: beam2.id,
          ...(isTrapezium ? { qStart: qAt(a2), qEnd: l.qEnd } : {}),
          startFrac: full2 ? undefined : (a2 - t) / (1 - t),
          endFrac:   full2 ? undefined : (b - t) / (1 - t),
        });
      }
    } else if (l.type === "thermal") {
      loads.push({ ...l, id: nextLoadId++, beamId: beam1.id });
      loads.push({ ...l, id: nextLoadId++, beamId: beam2.id });
    } else if (l.type === "pointForce" && l.posFrac !== undefined) {
      // Staafgebonden puntlast (vrije positie): hij hoort bij het deel waarin
      // zijn positie valt; de fractie wordt naar dat deel hermapt. Zelfde
      // regels als de deellast-fracties hierboven.
      const s = Math.min(1, Math.max(0, l.posFrac));
      if (t > 1e-12 && s <= t) {
        loads.push({ ...l, id: nextLoadId++, beamId: beam1.id, posFrac: s / t });
      } else if (1 - t > 1e-12) {
        loads.push({ ...l, id: nextLoadId++, beamId: beam2.id, posFrac: (s - t) / (1 - t) });
      } else {
        loads.push({ ...l, id: nextLoadId++, beamId: beam1.id, posFrac: 1 });
      }
    } else {
      // Knoopgebonden of onbekend lasttype — ongewijzigd laten staan.
      loads.push(l);
    }
  }
  return { nodes, beams, loads, newNodeId };
}

// ── Pure transformatielogica ───────────────────────────────────────────────
// Losgetrokken uit de hook zodat hij unit-testbaar is (zie
// design-mockup/test-transform.mjs), naar het voorbeeld van computeBeamSplit.

/**
 * Verzamel alle knoop-ids die een Selection raakt: geselecteerde knopen +
 * eindknopen van geselecteerde staven + hoekknopen van geselecteerde platen.
 * Een gedeelde knoop (bv. de gezamenlijke knoop van twee geselecteerde staven)
 * zit er precies één keer in (Set), zodat een transformatie hem nooit dubbel
 * toepast. Een lastselectie of lege selectie levert een lege set.
 */
export function collectSelectionNodeIds(
  cur: Pick<Snapshot, "beams" | "plates">,
  sel: Selection,
): Set<number> {
  const ids = new Set<number>();
  if (!sel) return ids;
  if (sel.type === "node") {
    ids.add(sel.id);
  } else if (sel.type === "beam") {
    const b = cur.beams.find(bb => bb.id === sel.id);
    if (b) { ids.add(b.from); ids.add(b.to); }
  } else if (sel.type === "plate") {
    const p = cur.plates.find(pp => pp.id === sel.id);
    if (p) p.nodeIds.forEach(id => ids.add(id));
  } else if (sel.type === "multi") {
    sel.nodeIds.forEach(id => ids.add(id));
    for (const bid of sel.beamIds) {
      const b = cur.beams.find(bb => bb.id === bid);
      if (b) { ids.add(b.from); ids.add(b.to); }
    }
    for (const pid of sel.plateIds) {
      const p = cur.plates.find(pp => pp.id === pid);
      if (p) p.nodeIds.forEach(id => ids.add(id));
    }
  }
  return ids;
}

/**
 * Verplaats de selectie over (dx, dz). Retourneert null wanneer de selectie
 * geen knopen raakt (lege selectie / lastselectie) — de aanroeper toont dan
 * feedback in plaats van stilzwijgend niets te doen.
 */
export function computeSelectionTranslate(
  cur: Pick<Snapshot, "nodes" | "beams" | "plates">,
  sel: Selection, dx: number, dz: number,
): { nodes: Node[] } | null {
  const ids = collectSelectionNodeIds(cur, sel);
  if (ids.size === 0) return null;
  const nodes = cur.nodes.map(n =>
    ids.has(n.id) ? { ...n, x: n.x + dx, z: n.z + dz } : n);
  return { nodes };
}

/**
 * Roteer de selectie om (cx, cz) met `angleRad` (positief = van +x naar +z).
 * Coördinaten worden op hele mm afgerond, consistent met de bestaande
 * enkelvoudige flow en het mm-integer-model. Null wanneer de selectie geen
 * knopen raakt.
 */
export function computeSelectionRotate(
  cur: Pick<Snapshot, "nodes" | "beams" | "plates">,
  sel: Selection, cx: number, cz: number, angleRad: number,
): { nodes: Node[] } | null {
  const ids = collectSelectionNodeIds(cur, sel);
  if (ids.size === 0) return null;
  const cs = Math.cos(angleRad), sn = Math.sin(angleRad);
  const nodes = cur.nodes.map(n => {
    if (!ids.has(n.id)) return n;
    const rx = n.x - cx, rz = n.z - cz;
    return {
      ...n,
      x: Math.round(cx + rx * cs - rz * sn),
      z: Math.round(cz + rx * sn + rz * cs),
    };
  });
  return { nodes };
}

/**
 * Spiegel de selectie om de lijn door (x1,z1)-(x2,z2). Coördinaten op hele mm
 * (zie computeSelectionRotate). Null wanneer de selectie geen knopen raakt of
 * de spiegelas gedegenereerd is (lengte ~0).
 */
export function computeSelectionMirror(
  cur: Pick<Snapshot, "nodes" | "beams" | "plates">,
  sel: Selection, x1: number, z1: number, x2: number, z2: number,
): { nodes: Node[] } | null {
  const ids = collectSelectionNodeIds(cur, sel);
  if (ids.size === 0) return null;
  const dx = x2 - x1, dz = z2 - z1;
  const denom = dx * dx + dz * dz;
  if (denom < 1e-6) return null;
  const nodes = cur.nodes.map(n => {
    if (!ids.has(n.id)) return n;
    const t = ((n.x - x1) * dx + (n.z - z1) * dz) / denom;
    const fx = x1 + t * dx, fz = z1 + t * dz;
    return { ...n, x: Math.round(2 * fx - n.x), z: Math.round(2 * fz - n.z) };
  });
  return { nodes };
}

/**
 * Volwaardige kopie van de selectie op offset (dx, dz).
 *
 * Regels:
 *  - Knopen krijgen nieuwe id's; `...n`-spread behoudt eventuele extra velden.
 *  - Staven behouden ALLE velden — materiaal/profiel/releases/checkConfig én
 *    toekomstige velden via spread; from/to worden herbonden aan de nieuwe
 *    knoop-id's. (Geneste objecten worden per referentie gedeeld, conform de
 *    immutable-update-conventie van de store: patches vervangen subobjecten.)
 *  - Platen krijgen nieuwe id's met herbonden hoekknopen.
 *  - Opleggingen op gekopieerde knopen gaan mee naar de nieuwe knoop-id's.
 *  - Staafgebonden lasten (lineLoad/thermal) gaan mee naar de nieuwe staaf-id
 *    in HETZELFDE belastinggeval; knoopgebonden lasten (pointForce/pointMoment)
 *    naar de nieuwe knoop-id.
 *
 * Retourneert null wanneer de selectie niets kopieerbaars bevat. De functie
 * muteert `cur` niet — de aanroepende mutatie pusht het resultaat als één
 * history-snapshot, zodat één Ctrl+Z de hele kopie ongedaan maakt.
 */
export function computeSelectionCopy(
  cur: Snapshot,
  sel: Selection, dx: number, dz: number,
): {
  nodes: Node[]; beams: Beam[]; supports: Support[]; plates: Plate[]; loads: Load[];
  nodeIdMap: Map<number, number>; beamIdMap: Map<number, number>;
} | null {
  const copyNodeIds = collectSelectionNodeIds(cur, sel);
  if (copyNodeIds.size === 0) return null;
  const copyBeamIds = new Set<number>();
  const copyPlateIds = new Set<number>();
  if (sel && sel.type === "beam") copyBeamIds.add(sel.id);
  else if (sel && sel.type === "plate") copyPlateIds.add(sel.id);
  else if (sel && sel.type === "multi") {
    sel.beamIds.forEach(id => copyBeamIds.add(id));
    sel.plateIds.forEach(id => copyPlateIds.add(id));
  }

  let nextNodeId  = cur.nodes.length  === 0 ? 1 : Math.max(...cur.nodes.map(n => n.id)) + 1;
  let nextBeamId  = cur.beams.length  === 0 ? 1 : Math.max(...cur.beams.map(b => b.id)) + 1;
  let nextPlateId = cur.plates.length === 0 ? 1 : Math.max(...cur.plates.map(p => p.id)) + 1;
  let nextLoadId  = cur.loads.length  === 0 ? 1 : Math.max(...cur.loads.map(l => l.id)) + 1;

  // Knopen — itereren over cur.nodes (niet over de Set) zodat kopieën in
  // modelvolgorde ontstaan en dangling ids in de selectie stil vervallen.
  const nodeIdMap = new Map<number, number>();
  const newNodes: Node[] = [];
  for (const n of cur.nodes) {
    if (!copyNodeIds.has(n.id)) continue;
    const clone: Node = { ...n, id: nextNodeId++, x: n.x + dx, z: n.z + dz };
    nodeIdMap.set(n.id, clone.id);
    newNodes.push(clone);
  }

  const beamIdMap = new Map<number, number>();
  const newBeams: Beam[] = [];
  for (const b of cur.beams) {
    if (!copyBeamIds.has(b.id)) continue;
    const from = nodeIdMap.get(b.from), to = nodeIdMap.get(b.to);
    if (from === undefined || to === undefined) continue; // eindknoop ontbreekt
    const clone: Beam = { ...b, id: nextBeamId++, from, to };
    beamIdMap.set(b.id, clone.id);
    newBeams.push(clone);
  }

  const plateIdMap = new Map<number, number>();
  const newPlates: Plate[] = [];
  for (const p of cur.plates) {
    if (!copyPlateIds.has(p.id)) continue;
    const mapped = p.nodeIds.map(id => nodeIdMap.get(id));
    if (mapped.some(id => id === undefined)) continue;
    const clone: Plate = { ...p, id: nextPlateId++, nodeIds: mapped as number[] };
    plateIdMap.set(p.id, clone.id);
    newPlates.push(clone);
  }

  const newSupports: Support[] = [];
  for (const s of cur.supports) {
    const mapped = nodeIdMap.get(s.nodeId);
    if (mapped !== undefined) newSupports.push({ ...s, nodeId: mapped });
  }

  const newLoads: Load[] = [];
  for (const l of cur.loads) {
    if (l.beamId !== undefined && beamIdMap.has(l.beamId)) {
      newLoads.push({ ...l, id: nextLoadId++, beamId: beamIdMap.get(l.beamId)! });
    } else if (l.nodeId !== undefined && nodeIdMap.has(l.nodeId)) {
      newLoads.push({ ...l, id: nextLoadId++, nodeId: nodeIdMap.get(l.nodeId)! });
    } else if (l.plateId !== undefined && plateIdMap.has(l.plateId)) {
      // Randlast (edgeLoad, P3.3) volgt zijn gekopieerde plaat.
      newLoads.push({ ...l, id: nextLoadId++, plateId: plateIdMap.get(l.plateId)! });
    }
  }

  return {
    nodes: [...cur.nodes, ...newNodes],
    beams: [...cur.beams, ...newBeams],
    supports: [...cur.supports, ...newSupports],
    plates: [...cur.plates, ...newPlates],
    loads: [...cur.loads, ...newLoads],
    nodeIdMap, beamIdMap,
  };
}

export interface FemStore {
  // Model
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
  loadCases: LoadCase[];
  activeLoadCaseId: number;

  // Combinations / envelope (step 2d/2e)
  combinations: LoadCombination[];
  /** Selected combination for canvas display; null = show active LC or envelope. */
  activeCombinationId: number | null;
  /** When true, canvas shows envelope view instead of a single result. */
  envelopeView: boolean;
  /** Per-case solver outputs from the last "Toetsen uitvoeren" run. */
  multiLcResult: Map<number, SolverResult> | null;
  /** Combined SolverResult per combination id. */
  combinationResults: Map<number, SolverResult> | null;
  /** Envelope across all combinations. */
  envelope: Envelope | null;

  // UI
  selection: Selection;

  // Setters (snapshot-aware)
  setSelection: (s: Selection) => void;
  setActiveLoadCaseId: (id: number) => void;
  setActiveCombinationId: (id: number | null) => void;
  setEnvelopeView: (v: boolean) => void;
  setSolverOutputs: (m: {
    perCase: Map<number, SolverResult>;
    combinationResults: Map<number, SolverResult>;
    envelope: Envelope;
  } | null) => void;

  // Mutations (each pushes a history snapshot)
  addNode: (x: number, z: number) => number;          // returns new node id
  updateNode: (id: number, x: number, z: number) => void;
  addBeam: (fromId: number, toId: number) => number | null;
  updateBeam: (id: number, updates: Partial<Beam>) => void;
  /**
   * Voeg een plaat toe (rechthoek óf polygoon, P4.2) en geef het nieuwe id
   * terug. Voor een polygonplaat levert het canvas de zojuist gegenereerde
   * CDT-meshcache direct mee, zodat plaat + mesh in één history-snapshot
   * landen (geen halve modellen bij undo).
   */
  addPlate: (nodeIds: number[], meshCache?: PlaatMeshCache) => number;
  updatePlate: (id: number, updates: Partial<Plate>) => void;
  /**
   * Vervang de CDT-meshcache van een polygonplaat (P4.2) — ZONDER
   * history-snapshot: de cache is afgeleide data van geometrie + meshSize,
   * geen bewerkstap. Undo/redo herstelt platen inclusief hun cache via de
   * gewone snapshots; het canvas regenereert wanneer de signatuur niet klopt.
   */
  setPlateMeshCache: (id: number, cache: PlaatMeshCache | undefined) => void;
  addSupport: (nodeId: number, type: SupportType, k?: number) => void;
  removeSupport: (nodeId: number) => void;
  addLoad: (l: Omit<Load, "id">) => void;
  updateLoad: (id: number, updates: Partial<Load>) => void;
  // Verwijderen op id (tabel-editor) — zelfde cascade-regels als
  // deleteSelected, maar zonder dat het element geselecteerd hoeft te zijn.
  removeNode: (id: number) => void;
  removeBeam: (id: number) => void;
  removeLoad: (id: number) => void;
  removePlate: (id: number) => void;
  deleteSelected: () => void;
  splitBeamAt: (beamId: number, x: number, z: number) => void;
  // Transformaties — multi-selectie-bewust. Retourneren `false` wanneer de
  // selectie niets transformeerbaars bevat (lege selectie / lastselectie),
  // zodat de aanroeper feedback kan tonen in plaats van een stille no-op.
  translateSelection: (sel: Selection, dx: number, dz: number) => boolean;
  copySelection: (sel: Selection, dx: number, dz: number) => boolean;
  rotateSelection: (sel: Selection, cx: number, cz: number, angleRad: number) => boolean;
  mirrorSelection: (sel: Selection, x1: number, z1: number, x2: number, z2: number) => boolean;
  addLoadCase: (name: string) => void;

  /**
   * Vervang in ÉÉN stap alles wat een generator (vandaag: de windbelasting-
   * generator) eerder heeft aangemaakt: de gegenereerde belastinggevallen, de
   * gegenereerde lasten en de gegenereerde combinaties. Handmatig ingevoerde
   * gevallen, lasten en combinaties blijven onaangeroerd.
   *
   * Eén aanroep = één history-snapshot (dus één keer Ctrl+Z), en één enkele
   * `loads`-identiteitswissel, zodat de live-rekencyclus in App.tsx precies
   * één keer opnieuw rekent in plaats van per last.
   *
   * `combinatieHoortBijGeneratie` bepaalt welke bestaande combinaties worden
   * opgeruimd; de aanroeper levert dat criterium, zodat deze store niets van
   * de windmodule hoeft te weten.
   */
  vervangGegenereerdeBelasting: (p: {
    gevallen: LoadCase[];
    lasten: Omit<Load, "id">[];
    combinaties: Omit<LoadCombination, "id">[];
    gevalHoortBijGeneratie: (c: LoadCase) => boolean;
    lastHoortBijGeneratie: (l: Load) => boolean;
    combinatieHoortBijGeneratie: (c: LoadCombination) => boolean;
  }) => void;

  /** Bulk translate a set of nodes by (dx, dz) — used by drag-to-move / G-grab. */
  translateNodes: (nodeIds: number[], dx: number, dz: number) => void;

  /** Structural grid (stramien) — defaults are 2×2 letters/numbers for the default portal. */
  structuralGrid: StructuralGrid;
  setStructuralGrid: (g: StructuralGrid | ((prev: StructuralGrid) => StructuralGrid)) => void;
  /**
   * Verplaats een stramienas én de knopen die erop liggen, als één undo-stap.
   * Retourneert het aantal meegeschoven knopen (null = as onbekend of delta 0).
   */
  verplaatsStramienAs: (as: "x" | "z", axisId: string, nieuwePositie: number) => number | null;

  /** Solver options. */
  selfWeightEnabled: boolean;
  setSelfWeightEnabled: (v: boolean) => void;
  /** Niet-lineair (P-Δ) toggle — adds geometric stiffness + Newton-Raphson. */
  nonlinearEnabled: boolean;
  setNonlinearEnabled: (v: boolean) => void;
  /**
   * Scheefstand (initiële imperfectie, EN 1993-1-1 §5.3.2-aanpak): elke
   * verticale last krijgt een horizontale metgezel H = φ·V. φ = 1/noemer
   * (default 1/200); richting +1 = +x, −1 = −x. De motor past alleen toe —
   * zie ScheefstandInput in solver/types.ts.
   */
  scheefstandEnabled: boolean;
  setScheefstandEnabled: (v: boolean) => void;
  /** Noemer x in φ = 1/x (default 200). */
  scheefstandNoemer: number;
  setScheefstandNoemer: (v: number) => void;
  /** Richting van de equivalente horizontale krachten: +1 = +x, −1 = −x. */
  scheefstandRichting: 1 | -1;
  setScheefstandRichting: (v: 1 | -1) => void;
  /** Canvas view mode: false = model-only (no loads drawn), true = LC active loads visible. */
  showLoads: boolean;
  setShowLoads: (v: boolean) => void;
  /** When set, the matching field in LoadProperties auto-focuses + selects. */
  pendingLoadFocus: { loadId: number; field: keyof Load } | null;
  setPendingLoadFocus: (v: { loadId: number; field: keyof Load } | null) => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // ── Load case + combination management ────────────────────────────────
  updateLoadCase: (id: number, patch: Partial<Omit<LoadCase, "id">>) => void;
  removeLoadCase: (id: number) => void;
  addCombination: (combo: Omit<LoadCombination, "id">) => void;
  updateCombination: (id: number, patch: Partial<Omit<LoadCombination, "id">>) => void;
  removeCombination: (id: number) => void;

  /** Replace all model state from a deserialized project file. */
  loadProjectState: (p: {
    nodes: Node[]; beams: Beam[]; supports: Support[]; plates: Plate[]; loads: Load[];
    loadCases: LoadCase[]; activeLoadCaseId: number;
    selfWeightEnabled?: boolean; nonlinearEnabled?: boolean;
    /** v2: combinatie-definities; ontbreekt (v1) → defaultCombinations(). */
    combinations?: LoadCombination[];
    /** v2: stramien; ontbreekt (v1) → DEFAULT_STRUCTURAL_GRID. */
    structuralGrid?: StructuralGrid;
    /** v2: scheefstand-instellingen; ontbreken → uit, 1/200, +x. */
    scheefstandEnabled?: boolean;
    scheefstandNoemer?: number;
    scheefstandRichting?: 1 | -1;
  }) => void;
}

export function useFemStore(): FemStore {
  // Active snapshot (current model)
  const [nodes, setNodes]       = useState<Node[]>(DEFAULT_NODES);
  const [beams, setBeams]       = useState<Beam[]>(DEFAULT_BEAMS);
  const [supports, setSupports] = useState<Support[]>(DEFAULT_SUPPORTS);
  const [plates, setPlates]     = useState<Plate[]>(DEFAULT_PLATES);
  const [loads, setLoads]       = useState<Load[]>(DEFAULT_LOADS);

  const [loadCases, setLoadCases] = useState<LoadCase[]>(DEFAULT_LOAD_CASES);
  const [activeLoadCaseId, setActiveLoadCaseId] = useState<number>(1);

  // Combinations + cached solver outputs (step 2d/2e)
  const [combinations, setCombinations] = useState<LoadCombination[]>(() => defaultCombinations());
  const [activeCombinationId, setActiveCombinationId] = useState<number | null>(null);
  const [envelopeView, setEnvelopeView] = useState<boolean>(false);
  const [multiLcResult, setMultiLcResult] = useState<Map<number, SolverResult> | null>(null);
  const [combinationResults, setCombinationResults] = useState<Map<number, SolverResult> | null>(null);
  const [envelope, setEnvelope] = useState<Envelope | null>(null);

  // Structural grid (stramien) — separate from undo history.
  const [structuralGrid, setStructuralGridState] = useState<StructuralGrid>(DEFAULT_STRUCTURAL_GRID);

  // Solver options — separate from undo history (UI toggles, not model state).
  const [selfWeightEnabled, setSelfWeightEnabled] = useState<boolean>(false);
  const [nonlinearEnabled, setNonlinearEnabled]   = useState<boolean>(false);
  // Scheefstand (initiële imperfectie) — zelfde patroon als selfWeightEnabled.
  const [scheefstandEnabled, setScheefstandEnabled] = useState<boolean>(false);
  const [scheefstandNoemer, setScheefstandNoemer]   = useState<number>(200);
  const [scheefstandRichting, setScheefstandRichting] = useState<1 | -1>(1);
  // Canvas view mode: false = "Model" tab (no loads drawn), true = LC active.
  const [showLoads, setShowLoads] = useState<boolean>(true);
  // Cross-panel focus hint: when the user clicks a value on the canvas (e.g.
  // a q-load label), this requests that the matching Properties-input gets
  // focused + selected. Consumed once then cleared.
  const [pendingLoadFocus, setPendingLoadFocus] = useState<{ loadId: number; field: keyof Load } | null>(null);

  const setSolverOutputs = useCallback((m: {
    perCase: Map<number, SolverResult>;
    combinationResults: Map<number, SolverResult>;
    envelope: Envelope;
  } | null) => {
    if (m === null) {
      setMultiLcResult(null);
      setCombinationResults(null);
      setEnvelope(null);
      return;
    }
    setMultiLcResult(m.perCase);
    setCombinationResults(m.combinationResults);
    setEnvelope(m.envelope);
  }, []);

  const [selection, setSelection] = useState<Selection>(null);

  // History — stack of Snapshots, plus pointer.
  const [history, setHistory] = useState<HistorieSnapshot[]>([makeInitialSnapshot()]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // We use a ref for the latest model so the snapshot push always grabs
  // the freshest values without stale-closure trouble.
  const latestRef = useRef({ nodes, beams, supports, plates, loads });
  useEffect(() => {
    latestRef.current = { nodes, beams, supports, plates, loads };
  }, [nodes, beams, supports, plates, loads]);

  // Zelfde truc voor het stramien: `verplaatsStramienAs` en `setStructuralGrid`
  // hebben de verse waarde nodig binnen één event, vóór de re-render.
  const gridRef = useRef(structuralGrid);
  useEffect(() => { gridRef.current = structuralGrid; }, [structuralGrid]);
  // Idem voor de historie-pointer, zodat setStructuralGrid de JUISTE snapshot
  // bijwerkt zonder als dependency op historyIdx te hangen.
  const historyIdxRef = useRef(0);
  useEffect(() => { historyIdxRef.current = historyIdx; }, [historyIdx]);

  // ── Doorgeefluik-sync (P4.2/P4.3) ────────────────────────────────────────
  // De multi-LC-invoer wordt in App.tsx veld-voor-veld opgebouwd en draagt
  // de CDT-meshcache en de rand-index van polygonrandlasten niet; de engine
  // leest die daarom uit het femTypes-doorgeefluik. Hier wordt dat register
  // bij ELKE model-wijziging (incl. undo/redo en projectladen) volledig
  // vervangen, zodat het altijd de actuele store-inhoud spiegelt. De engine
  // valideert de cache bovendien op geometrie-signatuur — een verouderde
  // registratie kan dus nooit stil een verkeerd mesh opleveren.
  useEffect(() => {
    registreerPlaatMeshCaches(
      plates.flatMap((p): [number, PlaatMeshCache][] =>
        p.meshCache ? [[p.id, p.meshCache]] : []));
    registreerPolygoonRandlasten(
      loads
        .filter(l => l.type === "edgeLoad" && l.plateId !== undefined
          && l.edgeIndex !== undefined && l.q !== undefined)
        .map(l => ({
          plateId: l.plateId!, edgeIndex: l.edgeIndex!,
          p: l.q!, dir: l.qDir ?? "z", caseId: l.caseId,
        })));
  }, [plates, loads]);

  /** Push a new history snapshot AFTER a mutation completes. */
  const pushHistory = useCallback((next: HistorieSnapshot) => {
    // Elke snapshot draagt het stramien mee; roept een mutator alleen model-
    // velden aan, dan vullen we het actuele stramien aan. Zo hoort bij iedere
    // undo-stap altijd het bijbehorende stramien.
    const snap: HistorieSnapshot = next.structuralGrid
      ? next
      : { ...next, structuralGrid: gridRef.current };
    setHistory((prev) => {
      const truncated = prev.slice(0, historyIdx + 1);
      const updated = [...truncated, snap];
      // Cap memory usage
      const trimmed = updated.length > HISTORY_LIMIT
        ? updated.slice(updated.length - HISTORY_LIMIT)
        : updated;
      return trimmed;
    });
    setHistoryIdx((i) => Math.min(i + 1, HISTORY_LIMIT - 1));
    // Direct bijwerken: een setStructuralGrid later in hetzelfde event moet de
    // ZOJUIST gepushte snapshot bijwerken, niet de vorige.
    historyIdxRef.current = Math.min(historyIdx + 1, HISTORY_LIMIT - 1);
  }, [historyIdx]);

  // Helper: produce next snapshot from a partial change
  const applySnapshot = useCallback((next: HistorieSnapshot) => {
    setNodes(next.nodes);
    setBeams(next.beams);
    setSupports(next.supports);
    setPlates(next.plates);
    setLoads(next.loads);
    // Stramien hoort bij de snapshot sinds een as-verplaatsing knopen meeneemt.
    if (next.structuralGrid) {
      gridRef.current = next.structuralGrid;
      setStructuralGridState(next.structuralGrid);
    }
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────
  const addNode = useCallback((x: number, z: number) => {
    const cur = latestRef.current;
    const newId = cur.nodes.length === 0 ? 1 : Math.max(...cur.nodes.map(n => n.id)) + 1;
    const nextNodes = [...cur.nodes, { id: newId, x, z }];
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
    return newId;
  }, [pushHistory]);

  const updateNode = useCallback((id: number, x: number, z: number) => {
    const cur = latestRef.current;
    const nextNodes = cur.nodes.map(n => n.id === id ? { ...n, x, z } : n);
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
  }, [pushHistory]);

  const addBeam = useCallback((fromId: number, toId: number) => {
    if (fromId === toId) return null;
    const cur = latestRef.current;
    // No duplicate
    if (cur.beams.some(b =>
      (b.from === fromId && b.to === toId) || (b.from === toId && b.to === fromId))) {
      return null;
    }
    const newId = cur.beams.length === 0 ? 1 : Math.max(...cur.beams.map(b => b.id)) + 1;
    const nextBeams = [...cur.beams, { id: newId, from: fromId, to: toId }];
    setBeams(nextBeams);
    pushHistory({ ...cur, beams: nextBeams });
    return newId;
  }, [pushHistory]);

  /** Patch arbitrary fields on a beam (material, profile, releases, …). */
  const updateBeam = useCallback((id: number, updates: Partial<Beam>) => {
    const cur = latestRef.current;
    if (!cur.beams.some(b => b.id === id)) return;
    const nextBeams = cur.beams.map(b => b.id === id ? { ...b, ...updates } : b);
    setBeams(nextBeams);
    pushHistory({ ...cur, beams: nextBeams });
  }, [pushHistory]);

  const addPlate = useCallback((nodeIds: number[], meshCache?: PlaatMeshCache) => {
    const cur = latestRef.current;
    const newId = cur.plates.length === 0 ? 1 : Math.max(...cur.plates.map(p => p.id)) + 1;
    // Rekenvelden meteen expliciet op de defaults (dikte 20 mm, staal,
    // meshSize 500 mm) — zo toont de UI nooit een impliciete waarde. Een
    // polygonplaat krijgt zijn CDT-meshcache direct mee (P4.2).
    const nieuw: Plate = meshCache
      ? { id: newId, nodeIds, ...PLATE_DEFAULTS, meshCache }
      : { id: newId, nodeIds, ...PLATE_DEFAULTS };
    const nextPlates = [...cur.plates, nieuw];
    setPlates(nextPlates);
    pushHistory({ ...cur, plates: nextPlates });
    return newId;
  }, [pushHistory]);

  /** Meshcache bijwerken zonder history-snapshot — zie FemStore-doc. */
  const setPlateMeshCache = useCallback((id: number, cache: PlaatMeshCache | undefined) => {
    setPlates(prev => prev.map(p => p.id === id ? { ...p, meshCache: cache } : p));
  }, []);

  // Terugkanaal voor mesh-regeneratie (P4.2): het canvas commit een
  // geregenereerde CDT-cache via femTypes.commitPlaatMeshCache — de store
  // registreert de mutator hier zodat er geen extra App-prop nodig is.
  useEffect(() => {
    registreerPlaatMeshCacheCommitter(setPlateMeshCache);
    return () => registreerPlaatMeshCacheCommitter(null);
  }, [setPlateMeshCache]);

  /** Patch willekeurige velden op een plaat (dikte, E, ν, ρ, meshSize, …). */
  const updatePlate = useCallback((id: number, updates: Partial<Plate>) => {
    const cur = latestRef.current;
    if (!cur.plates.some(p => p.id === id)) return;
    const nextPlates = cur.plates.map(p => p.id === id ? { ...p, ...updates } : p);
    setPlates(nextPlates);
    pushHistory({ ...cur, plates: nextPlates });
  }, [pushHistory]);

  const addSupport = useCallback((nodeId: number, type: SupportType, k?: number) => {
    const cur = latestRef.current;
    const without = cur.supports.filter(s => s.nodeId !== nodeId);
    const nextSupports = [...without, { nodeId, type, k }];
    setSupports(nextSupports);
    pushHistory({ ...cur, supports: nextSupports });
  }, [pushHistory]);

  const removeSupport = useCallback((nodeId: number) => {
    const cur = latestRef.current;
    const nextSupports = cur.supports.filter(s => s.nodeId !== nodeId);
    setSupports(nextSupports);
    pushHistory({ ...cur, supports: nextSupports });
  }, [pushHistory]);

  const addLoad = useCallback((l: Omit<Load, "id">) => {
    const cur = latestRef.current;
    const newId = cur.loads.length === 0 ? 1 : Math.max(...cur.loads.map(x => x.id)) + 1;
    const nextLoads = [...cur.loads, { ...l, id: newId }];
    setLoads(nextLoads);
    pushHistory({ ...cur, loads: nextLoads });
  }, [pushHistory]);

  /** Patch arbitrary fields on a load (q, fx/fz/my, deltaT, …). */
  const updateLoad = useCallback((id: number, updates: Partial<Load>) => {
    const cur = latestRef.current;
    if (!cur.loads.some(l => l.id === id)) return;
    const nextLoads = cur.loads.map(l => l.id === id ? { ...l, ...updates } : l);
    setLoads(nextLoads);
    pushHistory({ ...cur, loads: nextLoads });
  }, [pushHistory]);

  // ── Verwijderen op id (tabel-editor) ─────────────────────────────────────
  // Zelfde cascade-regels als de overeenkomstige deleteSelected-takken; elke
  // mutator pusht één history-snapshot. Wijst de huidige selectie naar het
  // verwijderde element, dan wordt die leeggemaakt.

  /** Verwijder een knoop + aanliggende staven, oplegging, platen en lasten. */
  const removeNode = useCallback((id: number) => {
    const cur = latestRef.current;
    if (!cur.nodes.some(n => n.id === id)) return;
    const nextNodes = cur.nodes.filter(n => n.id !== id);
    const nextBeams = cur.beams.filter(b => b.from !== id && b.to !== id);
    const nextSupports = cur.supports.filter(s => s.nodeId !== id);
    const goneBeamIds = new Set(cur.beams.filter(b => b.from === id || b.to === id).map(b => b.id));
    // Platen die deze knoop raken verdwijnen — hun randlasten (edgeLoad,
    // P3.3) cascaderen mee, net als staafgebonden lasten.
    const gonePlateIds = new Set(cur.plates.filter(p => p.nodeIds.includes(id)).map(p => p.id));
    const nextLoads = cur.loads.filter(l =>
      l.nodeId !== id
      && !(l.beamId !== undefined && goneBeamIds.has(l.beamId))
      && !(l.plateId !== undefined && gonePlateIds.has(l.plateId)));
    const nextPlates = cur.plates.filter(p => !p.nodeIds.includes(id));
    setNodes(nextNodes);
    setBeams(nextBeams);
    setSupports(nextSupports);
    setPlates(nextPlates);
    setLoads(nextLoads);
    pushHistory({
      nodes: nextNodes, beams: nextBeams, supports: nextSupports,
      plates: nextPlates, loads: nextLoads,
    });
    setSelection(prev => prev && prev.type === "node" && prev.id === id ? null : prev);
  }, [pushHistory]);

  /** Verwijder een staaf + de lasten die eraan hangen. */
  const removeBeam = useCallback((id: number) => {
    const cur = latestRef.current;
    if (!cur.beams.some(b => b.id === id)) return;
    const nextBeams = cur.beams.filter(b => b.id !== id);
    const nextLoads = cur.loads.filter(l => l.beamId !== id);
    setBeams(nextBeams);
    setLoads(nextLoads);
    pushHistory({ ...cur, beams: nextBeams, loads: nextLoads });
    setSelection(prev => prev && prev.type === "beam" && prev.id === id ? null : prev);
  }, [pushHistory]);

  /** Verwijder één last. */
  const removeLoad = useCallback((id: number) => {
    const cur = latestRef.current;
    if (!cur.loads.some(l => l.id === id)) return;
    const nextLoads = cur.loads.filter(l => l.id !== id);
    setLoads(nextLoads);
    pushHistory({ ...cur, loads: nextLoads });
    setSelection(prev => prev && prev.type === "load" && prev.id === id ? null : prev);
  }, [pushHistory]);

  /** Verwijder één plaat (knopen blijven staan; randlasten cascaderen mee). */
  const removePlate = useCallback((id: number) => {
    const cur = latestRef.current;
    if (!cur.plates.some(p => p.id === id)) return;
    const nextPlates = cur.plates.filter(p => p.id !== id);
    const nextLoads = cur.loads.filter(l => l.plateId !== id);
    setPlates(nextPlates);
    setLoads(nextLoads);
    pushHistory({ ...cur, plates: nextPlates, loads: nextLoads });
    setSelection(prev => prev && prev.type === "plate" && prev.id === id ? null : prev);
  }, [pushHistory]);

  const deleteSelected = useCallback(() => {
    if (!selection) return;
    const cur = latestRef.current;
    if (selection.type === "beam") {
      const nextBeams = cur.beams.filter(b => b.id !== selection.id);
      // Also drop loads attached to this beam
      const nextLoads = cur.loads.filter(l => l.beamId !== selection.id);
      // And plates that reference its endpoints? — leave for now (plates use nodeIds).
      setBeams(nextBeams);
      setLoads(nextLoads);
      pushHistory({ ...cur, beams: nextBeams, loads: nextLoads });
    } else if (selection.type === "node") {
      const id = selection.id;
      const nextNodes = cur.nodes.filter(n => n.id !== id);
      const nextBeams = cur.beams.filter(b => b.from !== id && b.to !== id);
      const nextSupports = cur.supports.filter(s => s.nodeId !== id);
      // Drop plates that touch this node + loads on the removed beams / node
      const goneBeamIds = new Set(cur.beams.filter(b => b.from === id || b.to === id).map(b => b.id));
      // Randlasten (edgeLoad) van platen die deze knoop raken gaan mee weg.
      const gonePlateIds = new Set(cur.plates.filter(p => p.nodeIds.includes(id)).map(p => p.id));
      const nextLoads = cur.loads.filter(l =>
        l.nodeId !== id
        && !(l.beamId !== undefined && goneBeamIds.has(l.beamId))
        && !(l.plateId !== undefined && gonePlateIds.has(l.plateId))
      );
      const nextPlates = cur.plates.filter(p => !p.nodeIds.includes(id));
      setNodes(nextNodes);
      setBeams(nextBeams);
      setSupports(nextSupports);
      setPlates(nextPlates);
      setLoads(nextLoads);
      pushHistory({
        nodes: nextNodes, beams: nextBeams, supports: nextSupports,
        plates: nextPlates, loads: nextLoads,
      });
    } else if (selection.type === "plate") {
      const nextPlates = cur.plates.filter(p => p.id !== selection.id);
      // Randlasten (edgeLoad) op deze plaat cascaderen mee.
      const nextLoads = cur.loads.filter(l => l.plateId !== selection.id);
      setPlates(nextPlates);
      setLoads(nextLoads);
      pushHistory({ ...cur, plates: nextPlates, loads: nextLoads });
    } else if (selection.type === "load") {
      const nextLoads = cur.loads.filter(l => l.id !== selection.id);
      setLoads(nextLoads);
      pushHistory({ ...cur, loads: nextLoads });
    } else if (selection.type === "multi") {
      // Multi-select: drop all selected nodes/beams/plates and everything that
      // referenced them. Mirrors the single-node/beam branches above.
      const nodeIds = new Set(selection.nodeIds);
      const beamIds = new Set(selection.beamIds);
      const plateIds = new Set(selection.plateIds);
      const nextNodes = cur.nodes.filter(n => !nodeIds.has(n.id));
      const nextBeams = cur.beams.filter(b =>
        !beamIds.has(b.id) && !nodeIds.has(b.from) && !nodeIds.has(b.to));
      const goneBeamIds = new Set(cur.beams.filter(b =>
        beamIds.has(b.id) || nodeIds.has(b.from) || nodeIds.has(b.to)).map(b => b.id));
      const nextSupports = cur.supports.filter(s => !nodeIds.has(s.nodeId));
      // Verdwijnende platen (geselecteerd of via een verwijderde hoekknoop)
      // nemen hun randlasten (edgeLoad) mee.
      const gonePlateIds = new Set(cur.plates.filter(p =>
        plateIds.has(p.id) || p.nodeIds.some(nid => nodeIds.has(nid))).map(p => p.id));
      const nextLoads = cur.loads.filter(l =>
        (l.nodeId === undefined || !nodeIds.has(l.nodeId)) &&
        (l.beamId === undefined || !goneBeamIds.has(l.beamId)) &&
        (l.plateId === undefined || !gonePlateIds.has(l.plateId)));
      const nextPlates = cur.plates.filter(p =>
        !plateIds.has(p.id) && p.nodeIds.every(nid => !nodeIds.has(nid)));
      setNodes(nextNodes);
      setBeams(nextBeams);
      setSupports(nextSupports);
      setPlates(nextPlates);
      setLoads(nextLoads);
      pushHistory({
        nodes: nextNodes, beams: nextBeams, supports: nextSupports,
        plates: nextPlates, loads: nextLoads,
      });
    }
    setSelection(null);
  }, [selection, pushHistory]);

  /** Verplaats de volledige selectie (multi-bewust) over (dx, dz). */
  const translateSelection = useCallback((sel: Selection, dx: number, dz: number): boolean => {
    const cur = latestRef.current;
    const r = computeSelectionTranslate(cur, sel, dx, dz);
    if (!r) return false;
    setNodes(r.nodes);
    pushHistory({ ...cur, nodes: r.nodes });
    return true;
  }, [pushHistory]);

  /**
   * Volwaardige kopie van de selectie op offset (dx, dz): alle staafvelden,
   * opleggingen en lasten gaan mee (zie computeSelectionCopy). Eén history-
   * push, dus één Ctrl+Z maakt de hele kopie ongedaan.
   */
  const copySelection = useCallback((sel: Selection, dx: number, dz: number): boolean => {
    const cur = latestRef.current;
    const r = computeSelectionCopy(cur, sel, dx, dz);
    if (!r) return false;
    setNodes(r.nodes);
    setBeams(r.beams);
    setSupports(r.supports);
    setPlates(r.plates);
    setLoads(r.loads);
    pushHistory({
      nodes: r.nodes, beams: r.beams, supports: r.supports,
      plates: r.plates, loads: r.loads,
    });
    return true;
  }, [pushHistory]);

  /** Roteer de volledige selectie (multi-bewust) om (cx, cz) met `angleRad`. */
  const rotateSelection = useCallback((sel: Selection, cx: number, cz: number, angleRad: number): boolean => {
    const cur = latestRef.current;
    const r = computeSelectionRotate(cur, sel, cx, cz, angleRad);
    if (!r) return false;
    setNodes(r.nodes);
    pushHistory({ ...cur, nodes: r.nodes });
    return true;
  }, [pushHistory]);

  /** Spiegel de volledige selectie (multi-bewust) om de lijn (x1,z1)-(x2,z2). */
  const mirrorSelection = useCallback((sel: Selection, x1: number, z1: number, x2: number, z2: number): boolean => {
    const cur = latestRef.current;
    const r = computeSelectionMirror(cur, sel, x1, z1, x2, z2);
    if (!r) return false;
    setNodes(r.nodes);
    pushHistory({ ...cur, nodes: r.nodes });
    return true;
  }, [pushHistory]);

  /**
   * Split a beam at a snapped point (x, z): inserts a new node and replaces
   * the beam with two. Materiaal/profiel/releases/lijnlasten gaan netjes mee —
   * zie computeBeamSplit voor de precieze regels.
   */
  const splitBeamAt = useCallback((beamId: number, x: number, z: number) => {
    const cur = latestRef.current;
    const split = computeBeamSplit(cur, beamId, x, z);
    if (!split) return;
    setNodes(split.nodes);
    setBeams(split.beams);
    setLoads(split.loads);
    pushHistory({ ...cur, nodes: split.nodes, beams: split.beams, loads: split.loads });
  }, [pushHistory]);

  const addLoadCase = useCallback((name: string) => {
    setLoadCases(prev => {
      const newId = prev.length === 0 ? 1 : Math.max(...prev.map(c => c.id)) + 1;
      return [...prev, { id: newId, name, type: "other" }];
    });
  }, []);

  /**
   * Zie de documentatie bij FemStore.vervangGegenereerdeBelasting. Één
   * snapshot, één loads-identiteit — bewust GEEN lus over addLoad, want dat
   * zou per last een history-stap én een herberekening opleveren.
   */
  const vervangGegenereerdeBelasting = useCallback((p: {
    gevallen: LoadCase[];
    lasten: Omit<Load, "id">[];
    combinaties: Omit<LoadCombination, "id">[];
    gevalHoortBijGeneratie: (c: LoadCase) => boolean;
    lastHoortBijGeneratie: (l: Load) => boolean;
    combinatieHoortBijGeneratie: (c: LoadCombination) => boolean;
  }) => {
    const cur = latestRef.current;
    // Lasten: handmatige behouden (volgorde intact), gegenereerde vervangen.
    const behoudenLasten = cur.loads.filter(l => !p.lastHoortBijGeneratie(l));
    let nextLoadId = behoudenLasten.reduce((m, l) => Math.max(m, l.id), 0) + 1;
    const nieuweLasten: Load[] = p.lasten.map(l => ({ ...l, id: nextLoadId++ }));
    const nextLoads = [...behoudenLasten, ...nieuweLasten];
    setLoads(nextLoads);
    pushHistory({ ...cur, loads: nextLoads });

    setLoadCases(prev => {
      const behouden = prev.filter(c => !p.gevalHoortBijGeneratie(c));
      const volgend = [...behouden, ...p.gevallen];
      return volgend.length > 0 ? volgend : prev; // nooit alles wegnemen
    });
    // Wees de actieve tab naar een geval dat nog bestaat.
    setActiveLoadCaseId(curr => {
      const nogAanwezig = [
        ...loadCases.filter(c => !p.gevalHoortBijGeneratie(c)),
        ...p.gevallen,
      ];
      return nogAanwezig.some(c => c.id === curr) ? curr : (nogAanwezig[0]?.id ?? curr);
    });

    setCombinations(prev => {
      const behouden = prev.filter(c => !p.combinatieHoortBijGeneratie(c));
      let nextId = behouden.reduce((m, c) => Math.max(m, c.id), 0) + 1;
      return [...behouden, ...p.combinaties.map(c => ({ ...c, id: nextId++ }))];
    });
    setActiveCombinationId(null);
  }, [pushHistory, loadCases]);

  /** Bulk-translate the given nodeIds by (dx, dz). One snapshot push. */
  const translateNodes = useCallback((nodeIds: number[], dx: number, dz: number) => {
    if (nodeIds.length === 0 || (dx === 0 && dz === 0)) return;
    const cur = latestRef.current;
    const idSet = new Set(nodeIds);
    const nextNodes = cur.nodes.map(n =>
      idSet.has(n.id) ? { ...n, x: n.x + dx, z: n.z + dz } : n);
    setNodes(nextNodes);
    pushHistory({ ...cur, nodes: nextNodes });
  }, [pushHistory]);

  const setStructuralGrid = useCallback((g: StructuralGrid | ((prev: StructuralGrid) => StructuralGrid)) => {
    const next = typeof g === "function"
      ? (g as (p: StructuralGrid) => StructuralGrid)(gridRef.current)
      : g;
    gridRef.current = next;
    setStructuralGridState(next);
    // Losse stramien-bewerkingen (as toevoegen, hernoemen, verwijderen) zijn
    // geen eigen undo-stap — net als voorheen. We schrijven ze wél in de
    // HUIDIGE snapshot, anders zou een undo van een latere modelwijziging ze
    // stilletjes terugdraaien.
    setHistory(prev => prev.map((s, i) =>
      i === historyIdxRef.current ? { ...s, structuralGrid: next } : s));
  }, []);

  /**
   * Verplaats één stramienas naar `nieuwePositie` (mm) en neem de knopen die
   * OP die as liggen mee, zodat staven, opleggingen en lasten meeschuiven en
   * het model aan het stramien vast blijft zitten.
   *
   * As-verplaatsing en knoopverplaatsing vormen SAMEN één undo-stap: de
   * snapshot bevat zowel de nieuwe knopen als het nieuwe stramien.
   * Zie `berekenStramienVerplaatsing` voor het gekozen gedrag (lokale maat:
   * alleen de bewerkte as schuift, verdere assen blijven staan).
   *
   * Retourneert het aantal meegeschoven knopen, of null als de as niet bestaat
   * of de verplaatsing nul is.
   */
  const verplaatsStramienAs = useCallback((
    as: "x" | "z", axisId: string, nieuwePositie: number,
  ): number | null => {
    const cur = latestRef.current;
    const grid = gridRef.current;
    const doelAs = (as === "x" ? grid.xAxes : grid.zAxes).find(a => a.id === axisId);
    if (!doelAs) return null;
    const v = berekenStramienVerplaatsing(cur.nodes, as, doelAs.position, nieuwePositie);
    if (v.delta === 0) return null;

    const idSet = new Set(v.nodeIds);
    const nextNodes = v.nodeIds.length === 0
      ? cur.nodes
      : cur.nodes.map(n => idSet.has(n.id) ? { ...n, x: n.x + v.dx, z: n.z + v.dz } : n);
    const verplaatsAs = (lijst: StructuralGrid["xAxes"]) =>
      lijst.map(a => a.id === axisId ? { ...a, position: nieuwePositie } : a);
    const nextGrid: StructuralGrid = {
      ...grid,
      xAxes: as === "x" ? verplaatsAs(grid.xAxes) : grid.xAxes,
      zAxes: as === "z" ? verplaatsAs(grid.zAxes) : grid.zAxes,
    };

    if (v.nodeIds.length > 0) setNodes(nextNodes);
    gridRef.current = nextGrid;
    setStructuralGridState(nextGrid);
    pushHistory({ ...cur, nodes: nextNodes, structuralGrid: nextGrid });
    return v.nodeIds.length;
  }, [pushHistory]);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;
  const undo = useCallback(() => {
    if (!canUndo) return;
    const newIdx = historyIdx - 1;
    applySnapshot(history[newIdx]);
    setHistoryIdx(newIdx);
    historyIdxRef.current = newIdx;
    setSelection(null);
  }, [canUndo, historyIdx, history, applySnapshot]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const newIdx = historyIdx + 1;
    applySnapshot(history[newIdx]);
    setHistoryIdx(newIdx);
    historyIdxRef.current = newIdx;
    setSelection(null);
  }, [canRedo, historyIdx, history, applySnapshot]);

  // Invalidate cached solver outputs whenever the model changes, so the UI
  // never shows a stale envelope/combination after the user edits the model.
  useEffect(() => {
    setMultiLcResult(null);
    setCombinationResults(null);
    setEnvelope(null);
    // We deliberately depend on the model-bearing state, not on the setters.
    // `plates` doet mee sinds platen meerekenen (P2): zonder die dependency
    // zou een dikte- of meshSize-wijziging verouderde resultaten laten staan.
  }, [nodes, beams, supports, plates, loads]);

  return {
    nodes, beams, supports, plates, loads,
    loadCases, activeLoadCaseId,
    combinations, activeCombinationId, envelopeView,
    multiLcResult, combinationResults, envelope,
    selection,
    setSelection,
    setActiveLoadCaseId,
    setActiveCombinationId,
    setEnvelopeView,
    setSolverOutputs,
    addNode, updateNode, addBeam, updateBeam, addPlate, updatePlate,
    setPlateMeshCache,
    addSupport, removeSupport, addLoad, updateLoad,
    removeNode, removeBeam, removeLoad, removePlate,
    deleteSelected, splitBeamAt, addLoadCase, vervangGegenereerdeBelasting,
    translateSelection, copySelection, rotateSelection, mirrorSelection,
    translateNodes,
    structuralGrid, setStructuralGrid, verplaatsStramienAs,
    selfWeightEnabled, setSelfWeightEnabled,
    nonlinearEnabled,  setNonlinearEnabled,
    scheefstandEnabled, setScheefstandEnabled,
    scheefstandNoemer, setScheefstandNoemer,
    scheefstandRichting, setScheefstandRichting,
    showLoads, setShowLoads,
    pendingLoadFocus, setPendingLoadFocus,
    canUndo, canRedo, undo, redo,
    // ── Load case + combination mutators ─────────────────────────────────
    updateLoadCase: (id, patch) => {
      setLoadCases(prev => prev.map(lc => lc.id === id ? { ...lc, ...patch } : lc));
    },
    removeLoadCase: (id) => {
      setLoadCases(prev => {
        const next = prev.filter(lc => lc.id !== id);
        if (next.length === 0) return prev; // nooit alles wissen
        return next;
      });
      // Detach loads die naar deze case verwijzen.
      setLoads(prev => prev.filter(l => l.caseId !== id));
      // Switch actieve case als die verdwijnt.
      setActiveLoadCaseId(curr => curr === id ? (loadCases.find(c => c.id !== id)?.id ?? 1) : curr);
    },
    addCombination: (combo) => {
      setCombinations(prev => {
        const maxId = prev.reduce((m, c) => Math.max(m, c.id), 0);
        return [...prev, { ...combo, id: maxId + 1 }];
      });
    },
    updateCombination: (id, patch) => {
      setCombinations(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    },
    removeCombination: (id) => {
      setCombinations(prev => prev.filter(c => c.id !== id));
      setActiveCombinationId(curr => curr === id ? null : curr);
    },

    /** Replace the entire model from a deserialized project file. */
    loadProjectState: (p: {
      nodes: Node[]; beams: Beam[]; supports: Support[]; plates: Plate[]; loads: Load[];
      loadCases: LoadCase[]; activeLoadCaseId: number;
      selfWeightEnabled?: boolean; nonlinearEnabled?: boolean;
      combinations?: LoadCombination[];
      structuralGrid?: StructuralGrid;
      scheefstandEnabled?: boolean;
      scheefstandNoemer?: number;
      scheefstandRichting?: 1 | -1;
    }) => {
      // Oude bestanden zonder plaat-rekenvelden → defaults aanvullen
      // (dikte 20 mm, staal, meshSize 500 mm), zie withPlateDefaults.
      const plates = p.plates.map(withPlateDefaults);
      setNodes(p.nodes);
      setBeams(p.beams);
      setSupports(p.supports);
      setPlates(plates);
      setLoads(p.loads);
      setLoadCases(p.loadCases);
      setActiveLoadCaseId(p.activeLoadCaseId);
      setSelfWeightEnabled(!!p.selfWeightEnabled);
      setNonlinearEnabled(!!p.nonlinearEnabled);
      // Scheefstand — ontbrekende velden (v1/oudere v2-bestanden) → uit,
      // noemer 200 (φ = 1/200), richting +x.
      setScheefstandEnabled(!!p.scheefstandEnabled);
      setScheefstandNoemer(
        typeof p.scheefstandNoemer === "number" && p.scheefstandNoemer > 0
          ? p.scheefstandNoemer : 200,
      );
      setScheefstandRichting(p.scheefstandRichting === -1 ? -1 : 1);
      // v2-velden; v1-bestanden (of Nieuw) vallen terug op de defaults.
      setCombinations(p.combinations ?? defaultCombinations());
      const nieuwGrid = p.structuralGrid ?? DEFAULT_STRUCTURAL_GRID;
      gridRef.current = nieuwGrid;
      setStructuralGridState(nieuwGrid);
      // Combinatie-ids uit het bestand hoeven niet overeen te komen met de
      // vorige selectie — selectie resetten voorkomt een dangling id.
      setActiveCombinationId(null);
      setSelection(null);
      // Reset history so undo can't time-travel back to the previous model.
      setHistory([{
        nodes: p.nodes, beams: p.beams, supports: p.supports, plates,
        loads: p.loads, structuralGrid: nieuwGrid,
      }]);
      setHistoryIdx(0);
      historyIdxRef.current = 0;
    },
  };
}
