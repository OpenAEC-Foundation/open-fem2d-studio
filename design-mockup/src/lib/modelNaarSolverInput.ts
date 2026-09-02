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
import type { Beam, Load, LoadCase, Node, Plate, Support } from "../components/fem/femTypes";
import { withPlateDefaults } from "../components/fem/femTypes";
import type { MultiInput } from "../components/fem/solver/types";
import { resolveSection, eigenGewichtPerMeter } from "./sectionResolver";
import { thermalAlphaForMaterial } from "./thermalAlpha";

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
 * Bouw de solver-invoer voor ALLE belastinggevallen uit één modelbestand.
 * Puur: leest alleen `model`, muteert niets aan de invoer en raakt geen
 * globale toestand aan.
 */
export function bouwMultiInput(model: FemModelInvoer): MultiInput {
  const multiInput: MultiInput = {
    nodes: model.nodes.map(n => ({ id: n.id, x: n.x, z: n.z })),
    beams: model.beams.map(b => {
      // Stijfheid uit materiaal + profiel — zelfde route als het canvas-pad
      // (FemCanvas → resolveSection). Zonder dit rekende het multi-LC-pad
      // (combinaties/envelope/toetsing) élke staaf met de solver-default
      // (HEA 160 / S235) en kreeg de toetsing krachten en zakkingen van
      // het verkeerde model.
      const sec = resolveSection(b.material, b.profile);
      return {
        id: b.id, from: b.from, to: b.to,
        E: sec.E, A: sec.A, I: sec.I,
        // Releases naar de engine: buigscharnieren via het legacy paar,
        // en het volledige object (mét Tx/Tz-hulzen in lokale assen)
        // ernaast — de engine kiest zelf het rijkere per-DOF-model zodra
        // er een translatie-release in zit.
        startConnection: b.releases?.startRy ? 'hinge' as const : 'fixed' as const,
        endConnection:   b.releases?.endRy   ? 'hinge' as const : 'fixed' as const,
        releases: b.releases,
      };
    }),
    supports: model.supports.map(s => ({ nodeId: s.nodeId, type: s.type, k: liftSpringK(s) })),
    // Platen (wandschijven, P2.3): rekenvelden met defaults aangevuld —
    // de engine meshet en schakelt zelf naar mixed_beam_plate.
    plates: model.plates.map(p => {
      const d = withPlateDefaults(p);
      return {
        id: d.id, nodeIds: d.nodeIds,
        thickness: d.thickness!, E: d.E!, nu: d.nu!, rho: d.rho!,
        meshSize: d.meshSize!,
      };
    }),
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
  if (model.selfWeightEnabled) {
    const deadCase = model.loadCases.find(c => c.type === "dead") ?? model.loadCases[0];
    if (deadCase) {
      for (const b of model.beams) {
        const q = eigenGewichtPerMeter(b.material, b.profile);
        if (Math.abs(q) > 1e-9) {
          multiInput.loads.push({
            beamId: b.id,
            q,
            caseId: deadCase.id,
          });
        }
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
    } else if (l.type === "edgeLoad" && l.plateId !== undefined && l.q !== undefined) {
      // Randlast op een plaatrand (P3.3): p in kN/m (= N/mm), richting
      // in globale assen — de engine zet dit via de PlateLoads-wrapper
      // om in exacte knooplasten op de mesh-randknopen.
      multiInput.edgeLoads!.push({
        plateId: l.plateId,
        edge: l.edge ?? "top",
        p: l.q,
        dir: l.qDir,
        caseId: l.caseId,
      });
    }
  }
  return multiInput;
}
