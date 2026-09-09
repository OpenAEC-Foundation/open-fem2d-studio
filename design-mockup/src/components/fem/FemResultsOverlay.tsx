/**
 * FemResultsOverlay — renders deflected shape + reactions + per-element
 * internal-force labels for the most recent solver result.
 *
 * Drawn as SVG over the existing FemCanvas SVG geometry; reuses the same
 * world→screen mapping so the overlay registers pixel-perfect with the model.
 *
 * Deflected shape: each beam is sampled at 12 intermediate stations using
 * Euler-Bernoulli Hermite shape functions in element-local coordinates
 * (so the curve actually bulges between nodes — matters most for the
 * uniformly-loaded top beam where the nodal disp is tiny but mid-span sags).
 */
import type { SolverResult } from "./solver/types";
import type { Node, Beam, Support, Load } from "./femTypes";
import { resolveSection } from "../../lib/sectionResolver";

/** Per-result display toggles — multi-active diagram picker. */
export interface DisplayFlags {
  deflection: boolean;
  N: boolean;
  V: boolean;
  M: boolean;
  /**
   * Hoekverdraaiing θ(x) langs de staaf (uit `ElementForces.rotation`, rad).
   * Getekend als verloopdiagram, gelabeld in mrad — zie `renderRotationDiagram`.
   */
  rotation: boolean;
  /**
   * Buigstijfheid EI(x) langs de staaf uit de segmentuitkomsten van de
   * fysisch niet-lineaire tweede orde (beton). Alleen zinvol wanneer het
   * resultaat `ElementForces.segmenten` draagt.
   */
  EI: boolean;
  reactions: boolean;
  /** Reactie-componentkeuze: horizontale (Fx) resp. verticale (Fz) pijlen. */
  reactieX: boolean;
  reactieZ: boolean;
  /** Knoopwaarden: label met ux/uz (mm) bij elke knoop — subvinkje onder Verplaatsing. */
  knoopWaarden: boolean;
  /** Show extreme-value labels (Mmax, Vmax, Nmax, umax) at peak locations. */
  showExtremes: boolean;
  /**
   * Snedetekens: het afschuifteken in de dwarskrachtlijn en het buigteken in
   * de momentenlijn. Zie het blok SNEDETEKENS verderop in dit bestand voor de
   * tekenconventie die ze aanhouden.
   */
  snedeTekens: boolean;
  /** Unity-check-badges op staafmidden (maatgevende UC uit de normtoetsing). */
  uc: boolean;
  /** Per-component scale multipliers — 1.0 = auto, slider 0.1–5.0. */
  scaleN: number;
  scaleV: number;
  scaleM: number;
  scaleU: number;
  /** Schaalregelaar van het hoekverdraaiingsdiagram. */
  scaleR: number;
  /** Schaalregelaar van het EI-verloop. */
  scaleEI: number;
  /** Plaatspanningscontouren op het canvas (P3.2) — aan/uit. */
  plaatContour: boolean;
  /** Gekozen contourcomponent (von Mises default) — zie PLAAT_COMPONENTEN in FemCanvas. */
  plaatComponent: "vonMises" | "sigmaX" | "sigmaY" | "tauXY" | "nx" | "ny" | "nxy";
  /** Elementranden (mesh-lijnen) tonen in de contourlaag. */
  plaatMesh: boolean;
  /**
   * Profielnaam klein langs elke staaf op het canvas. Dit is een MODEL-
   * weergave en geen resultaatweergave, maar hij hoort hier omdat dit de ene
   * lijst met canvas-vinkjes is: een tweede vinkjessysteem ernaast zou de
   * gebruiker laten zoeken waar iets uit te zetten valt.
   */
  profielLabels: boolean;
}

export const DEFAULT_DISPLAY_FLAGS: DisplayFlags = {
  deflection: true, N: false, V: false, M: true, reactions: true,
  // Uit by default: het zijn extra standen naast N/V/M, en EI heeft alleen
  // inhoud bij een fysisch niet-lineaire betonberekening.
  rotation: false, EI: false,
  reactieX: true, reactieZ: true,
  knoopWaarden: false,
  showExtremes: true,
  // Aan: het teken is de eerste vraag bij een snedekrachtlijn ("trekt hij hier
  // onder of boven?"), en het antwoord hoort er te staan zonder dat de
  // gebruiker eerst een vinkje moet vinden. Uitzetten kan in Resultaten →
  // Opties, voor wie een kale lijn wil.
  snedeTekens: true,
  uc: false,
  scaleN: 1, scaleV: 1, scaleM: 1, scaleU: 1, scaleR: 1, scaleEI: 1,
  plaatContour: true, plaatComponent: "vonMises", plaatMesh: true,
  // Aan: de gebruiker wil bij het tekenen kunnen zien welk profiel een staaf
  // heeft zonder hem eerst aan te klikken.
  profielLabels: true,
};

interface Props {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  result: SolverResult;
  worldToScreen: (x: number, z: number) => { x: number; y: number };
  /** Canvas pixel size — used for auto-scaling deflection. */
  canvasW: number;
  canvasH: number;
  /** Which result components to render. Defaults to DEFAULT_DISPLAY_FLAGS. */
  displayFlags?: DisplayFlags;
  /** All loads — used to add UDL parabolic bulge to M-diagram. */
  loads?: Load[];
  /** Active load case id — filters which UDLs to apply. */
  activeLoadCaseId?: number;
}

const SAMPLES_PER_BEAM = 12;

/** Getalnotatie voor canvas-labels: NL-komma, standaard 1 decimaal.
 *  Waarden die op 0 afronden verliezen hun minteken (geen "−0,0"). */
export function fmtNl(v: number, dec = 1): string {
  let s = v.toFixed(dec);
  if (parseFloat(s) === 0) s = (0).toFixed(dec);
  return s.replace(".", ",").replace("-", "−");
}

// ══ SNEDETEKENS ═══════════════════════════════════════════════════════════
//
// Het afschuifteken in de dwarskrachtlijn en het buigteken in de momentenlijn
// — dezelfde tekentjes die op een constructietekening naast de lijn staan. Ze
// zeggen zonder woorden welk teken waar geldt, zodat de lezer daarvoor niet
// eerst hoeft uit te zoeken welke kant van de staaf "positief" is.
//
// ── DE TEKENCONVENTIE VAN DEZE APP ───────────────────────────────────────
// Een teken dat de verkeerde kant op wijst is erger dan geen teken, dus staat
// hier vast waar de conventie vandaan komt. Hij ligt in
// core/fem/BeamForces.ts (`calculateBeamInternalForces`, kopcommentaar) en
// wordt door de adapter in solver/engine.ts ONVERANDERD doorgegeven: daar
// wordt alleen N naar trek-positief geflipt en M van N·m naar N·mm gerekend —
// aan de TEKENS van M en V raakt niemand meer.
//
//   M > 0  trek in de ONDERVEZEL (sagging). Nagerekend op een simpel opgelegde
//          ligger met neerwaartse q: M = +qL²/8 in het veld. Bij een
//          doorgaande ligger is M boven het tussensteunpunt negatief.
//   V > 0  het staafdeel draait MET DE KLOK MEE: aan de knoop-1-zijde van de
//          snede werkt de dwarskracht naar lokale +y, aan de knoop-2-zijde
//          naar lokale −y. Nagerekend op dezelfde ligger: V = +qL/2 bij het
//          steunpunt aan de KNOOP-1-kant.
//
// "Lokale +y" is 90° tegen de klok in vanaf de staafas knoop1→knoop2; voor een
// horizontale staaf van links naar rechts is dat omhoog. Alle diagrammen
// zetten hun waarde al langs die richting uit (`nxW`/`nzW` in het
// diagram-sample), dus de tekens gebruiken exact dezelfde assen.
//
// ── HOE DE TEKENTJES DAARUIT VOLGEN ──────────────────────────────────────
// BUIGTEKEN — de boog IS de gebogen vezel. Bij M > 0 trekt de ondervezel, dus
//   een dal (∪) met de bolle kant naar lokale −y; bij M < 0 een bult (∩). De
//   momentenlijn wordt hier al op de TREKZIJDE uitgezet (de `-raw`-flip bij
//   het plotten), waardoor de boog altijd dezelfde kant op bolt als de lob
//   waarin hij ligt. Eén regel dus: de bolling wijst naar de trekzijde.
// AFSCHUIFTEKEN — twee tegengesteld gerichte pijlen, samen het koppel uit de
//   definitie hierboven: bij V > 0 wijst de pijl aan de knoop-1-zijde naar
//   lokale +y en die aan de knoop-2-zijde naar −y (met de klok mee).
//
// ── PLAATSING EN MAAT ────────────────────────────────────────────────────
//  • Eén teken per ZONE met gelijk teken, niet één per station. Wisselt het
//    teken binnen één staaf — het geval waar het de gebruiker om gaat, zoals
//    boven het tussensteunpunt van een doorgaande ligger — dan krijgt elke
//    zone zijn eigen teken.
//  • De maat volgt de zoom: hij komt uit de SCHERMlengte van de zone én uit de
//    diepte van de lob ter plaatse, met een bovengrens. Zo kruipen de tekens
//    bij uitzoomen niet over elkaar heen, en past het teken altijd binnen het
//    diagramvlak — het botst dus nooit met de waarde-labels, die juist buiten
//    de diagramlijn staan.
//  • Past er geen leesbaar teken meer in (< MIN_TEKEN_PX), dan komt er geen.
//    Dat is meteen de drempel tegen ruis: een lob die verwaarloosbaar is ten
//    opzichte van de rest van het model is op het scherm ook ondiep. Daarnaast
//    telt alles binnen een dode band van 0,1 % van de grootste waarde als NUL,
//    zodat het afrondingsgruis van een nul-diagram geen tekenwissels verzint.

/** Grootste en kleinste tekenmaat (px). Boven de bovengrens gaat het teken de
 *  lijn domineren, onder de ondergrens is het een vlekje. */
const MAX_TEKEN_PX = 11;
const MIN_TEKEN_PX = 4.5;

/** Eén aaneengesloten stuk van een snedekrachtlijn met hetzelfde teken. */
export interface TekenZone {
  /** Index van het eerste en het laatste station in de zone. */
  i0: number;
  i1: number;
  /** Teken van de RUWE grootheid (dus vóór de trekzijde-flip van M). */
  teken: 1 | -1;
  /** Grootste |waarde| binnen de zone. */
  piek: number;
}

/**
 * Deelt een reeks stationswaarden op in zones met hetzelfde teken.
 *
 * Waarden binnen `dodeBand` tellen als NUL: ze horen bij geen enkele zone en
 * breken een lopende zone af. Dat is precies wat er bij een nuldoorgang moet
 * gebeuren (het station ín de nuldoorgang hoort bij geen van beide lobben), en
 * het voorkomt dat een diagram dat overal nul is uit zijn afrondingsruis een
 * handvol schijn-zones oplevert.
 */
export function bepaalTekenZones(waarden: number[], dodeBand: number): TekenZone[] {
  const zones: TekenZone[] = [];
  let lopend: TekenZone | null = null;
  for (let i = 0; i < waarden.length; i++) {
    const w = waarden[i];
    if (!Number.isFinite(w) || Math.abs(w) <= dodeBand) { lopend = null; continue; }
    const teken: 1 | -1 = w > 0 ? 1 : -1;
    if (lopend && lopend.teken === teken) {
      lopend.i1 = i;
      lopend.piek = Math.max(lopend.piek, Math.abs(w));
    } else {
      lopend = { i0: i, i1: i, teken, piek: Math.abs(w) };
      zones.push(lopend);
    }
  }
  return zones;
}

/**
 * Alles wat één tekentje nodig heeft, in SCHERMcoördinaten (px, y naar
 * beneden). De twee richtingsvectoren zijn eenheidsvectoren en staan loodrecht
 * op elkaar.
 */
export interface TekenMeetkunde {
  /** Basispunt op de staafas — het hart van de zone. */
  bx: number;
  by: number;
  /** Eenheidsrichting langs de staaf, van knoop 1 naar knoop 2. */
  exx: number;
  exy: number;
  /** Lokale +y (90° tegen de klok in vanaf de staafas, in WERELDassen). */
  eyx: number;
  eyy: number;
  /**
   * Diepte van de lob ter plaatse, MET teken, in px langs `ey` — dus de al
   * geplotte waarde (voor M inclusief de trekzijde-flip). Het teken zegt aan
   * welke kant van de staaf het diagram ligt.
   */
  diepte: number;
  /** Maat van het tekentje (px). */
  maat: number;
}

/** Punt op `a` px langs de staaf en `b` px langs lokale +y vanaf het basispunt. */
function tekenPunt(g: TekenMeetkunde, a: number, b: number): string {
  const x = g.bx + g.exx * a + g.eyx * b;
  const y = g.by + g.exy * a + g.eyy * b;
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

/**
 * BUIGTEKEN — de gebogen vezel, als kwadratische bézier.
 *
 * De boog ligt halverwege de lob en bolt naar dezelfde kant als de lob zelf,
 * dus naar de trekzijde (zie de conventie hierboven). Een bézier wijkt van
 * zijn koorde half zoveel af als zijn controlepunt, vandaar de factor 2 op de
 * bolling; de koorde ligt een halve bolling terug zodat de boog netjes om het
 * hart van de lob heen ligt.
 */
export function buigTekenPad(g: TekenMeetkunde): string {
  const naarTrek = g.diepte >= 0 ? 1 : -1;
  const halveKoorde = g.maat;
  const bolling = g.maat * 0.62;
  const hart = g.diepte * 0.5;
  const koorde = hart - naarTrek * bolling * 0.5;
  return `M ${tekenPunt(g, -halveKoorde, koorde)}` +
         ` Q ${tekenPunt(g, 0, koorde + naarTrek * bolling * 2)}` +
         ` ${tekenPunt(g, halveKoorde, koorde)}`;
}

/**
 * AFSCHUIFTEKEN — de verspringing: twee staafdelen die langs elkaar schuiven,
 * getekend als twee evenwijdige lijnen met een verticale sprong ertussen. Dat
 * is de notatie zoals een constructeur hem op papier zet.
 *
 * Hij verving twee tegengesteld gerichte pijlen. Die drukten dezelfde zin uit,
 * maar het is niet de gangbare notatie en het las als een krachtenpaar in
 * plaats van als een afschuiving.
 *
 * `tekenV` is het teken van de RUWE dwarskracht en bepaalt WELKE helft
 * verspringt. Bij +1 ligt de linkerhelft (de knoop-1-zijde) naar lokale +y en
 * de rechterhelft naar −y: het koppel dat het staafdeel met de klok mee
 * draait, precies de definitie van een positieve dwarskracht in deze app. Dat
 * is dezelfde richting als waar de vroegere pijl aan de knoop-1-zijde heen
 * wees, dus de tekenafleiding boven in dit bestand blijft ongewijzigd gelden.
 */
export function afschuifTekenPad(g: TekenMeetkunde, tekenV: 1 | -1): string {
  const halveLengte = g.maat * 0.95;   // halve breedte van het teken langs de staaf
  const sprong = g.maat * 0.72;        // halve hoogte van de verspringing
  const hart = g.diepte * 0.5;
  const links = hart + tekenV * sprong;
  const rechts = hart - tekenV * sprong;
  // Eén doorlopende lijn: horizontaal, verticaal over, horizontaal. De sprong
  // staat in het midden zodat het teken symmetrisch om het hart van de zone
  // ligt en bij een smalle zone niet naar één kant uitloopt.
  return `M ${tekenPunt(g, -halveLengte, links)}` +
         ` L ${tekenPunt(g, 0, links)}` +
         ` L ${tekenPunt(g, 0, rechts)}` +
         ` L ${tekenPunt(g, halveLengte, rechts)}`;
}

export default function FemResultsOverlay({
  nodes, beams, supports, result, worldToScreen, canvasW, canvasH,
  displayFlags = DEFAULT_DISPLAY_FLAGS,
  loads: _loads = [], activeLoadCaseId: _activeLoadCaseId,
}: Props) {
  // `loads` and `activeLoadCaseId` are kept in Props for API stability but
  // are no longer read here — diagrams come straight from the solver's
  // station arrays (which already account for all loads + combinations).
  void _loads; void _activeLoadCaseId;
  const showDeflection = displayFlags.deflection;
  const showReactions  = displayFlags.reactions;
  const showN = displayFlags.N;
  const showV = displayFlags.V;
  const showM = displayFlags.M;
  const showRotation = displayFlags.rotation === true;
  const showEI = displayFlags.EI === true;
  // ── Auto-scale the deflection so the biggest sample is visible. ─────────
  // We sample every beam and find the max curve offset (mm), then scale so
  // it shows as ~60px on screen.
  // w_mm = LOKALE transversale zakking op dit sample (voor veldmax-label).
  type Sample = { sx: number; sy: number; dx_mm: number; dz_mm: number; w_mm: number };
  type BeamSamples = { beam: Beam; samples: Sample[] };

  const allBeamSamples: BeamSamples[] = [];
  let maxOffsetMm = 0;
  // Veldmaximum |w| over alle staven — voor het extreme-waarde-label.
  let maxFieldW: { beamId: number; sampleIdx: number; w_mm: number } | null = null;

  for (const beam of beams) {
    const nA = nodes.find(n => n.id === beam.from);
    const nB = nodes.find(n => n.id === beam.to);
    if (!nA || !nB) continue;
    const dA = result.displacements.get(beam.from);
    const dB = result.displacements.get(beam.to);
    if (!dA || !dB) continue;

    const dx = nB.x - nA.x, dz = nB.z - nA.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) continue;
    const c = dx / L, s = dz / L;

    const samples: Sample[] = [];
    const pushSample = (xi: number, uL: number, vL: number) => {
      // local x = (c, s) ; local y = (-s, c) — terug naar globaal
      const dxG = uL * c + vL * (-s);
      const dzG = uL * s + vL * c;
      const px = nA.x + dx * xi;
      const pz = nA.z + dz * xi;
      const screen = worldToScreen(px, pz);
      samples.push({ sx: screen.x, sy: screen.y, dx_mm: dxG, dz_mm: dzG, w_mm: vL });
      const off = Math.hypot(dxG, dzG);
      if (off > maxOffsetMm) maxOffsetMm = off;
      if (maxFieldW === null || Math.abs(vL) > Math.abs(maxFieldW.w_mm)) {
        maxFieldW = { beamId: beam.id, sampleIdx: samples.length - 1, w_mm: vL };
      }
    };

    // Voorkeurspad: de ECHTE veldkromme uit de solver-stations (deflection[]
    // bevat homogeen Hermite-deel + particuliere oplossing van de element-
    // belasting — een vrij opgelegde ligger onder q toont zo zijn werkelijke
    // doorhang in het veld, ook al zijn de knoopverplaatsingen ~0).
    const ef = result.elements.get(beam.id);
    const hasCurve = !!ef && ef.L_mm > 0 && ef.stations_mm.length > 1 &&
      (ef.deflection?.length ?? 0) === ef.stations_mm.length &&
      (ef.axialDisp?.length  ?? 0) === ef.stations_mm.length;

    if (hasCurve && ef) {
      for (let k = 0; k < ef.stations_mm.length; k++) {
        const xi = ef.stations_mm[k] / ef.L_mm;
        pushSample(xi, ef.axialDisp[k], ef.deflection[k]);
      }
    } else {
      // Fallback (geen station-data): Hermite op knoopwaarden alleen.
      // Transform global node disps into element-local
      const u1L = dA.ux * c + dA.uz * s;          // axial at A
      const v1L = -dA.ux * s + dA.uz * c;         // transverse at A
      const t1  = dA.ry;                          // rotation at A
      const u2L = dB.ux * c + dB.uz * s;
      const v2L = -dB.ux * s + dB.uz * c;
      const t2  = dB.ry;

      for (let k = 0; k <= SAMPLES_PER_BEAM; k++) {
        const xi = k / SAMPLES_PER_BEAM;                  // 0..1 along element
        // Linear interp for axial; Hermite for transverse
        const uL = u1L + (u2L - u1L) * xi;
        const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
        const N2 = L * (xi - 2 * xi * xi + xi * xi * xi);
        const N3 = 3 * xi * xi - 2 * xi * xi * xi;
        const N4 = L * (-xi * xi + xi * xi * xi);
        const vL = N1 * v1L + N2 * t1 + N3 * v2L + N4 * t2;
        pushSample(xi, uL, vL);
      }
    }
    allBeamSamples.push({ beam, samples });
  }

  // Pick deflection magnification: target ~60 px on screen for the max sample.
  const TARGET_PX = 60;
  const dispScale = maxOffsetMm > 1e-9 ? (TARGET_PX / maxOffsetMm) * (displayFlags.scaleU ?? 1) : 0;

  // Reaction arrow scale: target ~50 px for the max reaction COMPONENT
  // (so Fx and Fz arrows share a single scale and you can compare their
  // lengths visually). Each component gets its own arrow.
  let maxReactionComp = 0;
  result.reactions.forEach(r => {
    if (Math.abs(r.fx) > maxReactionComp) maxReactionComp = Math.abs(r.fx);
    if (Math.abs(r.fz) > maxReactionComp) maxReactionComp = Math.abs(r.fz);
  });
  const REACTION_TARGET_PX = 50;
  const reactionScale = maxReactionComp > 1e-9 ? REACTION_TARGET_PX / maxReactionComp : 0;

  // The screen-y axis is flipped (positive down), so we must invert dz_mm.
  // worldToScreen embeds the (size.h − ORIGIN_Y_FROM_BOTTOM − mz·SCALE) mapping;
  // displaced screen position = worldToScreen(x + dx, z + dz). But to keep
  // dispScale independent of canvas-coord SCALE we just shift screen pixels.
  // The canvas scale is 1/25 mm→px; we shift by dispScale·dx_mm in screen px
  // for x (right is +) and -dispScale·dz_mm for y (up is +z → up is −y in svg).
  const renderDeflection = () => allBeamSamples.map(({ beam, samples }) => {
    const points = samples.map(p => {
      const x = p.sx + p.dx_mm * dispScale;
      const y = p.sy - p.dz_mm * dispScale;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    return (
      <polyline
        key={`def${beam.id}`}
        points={points}
        className="fem-deflected"
      />
    );
  });

  // Extreme-waarde-label op het VELDmaximum |w| (lokale transversale zakking)
  // — dankzij de station-kromme ligt dat punt ook mídden in een veld, niet
  // alleen op knopen. Getoond bij "Extreme waarden tonen".
  const renderDeflectionExtreme = () => {
    if (!displayFlags.showExtremes || !maxFieldW) return null;
    if (Math.abs(maxFieldW.w_mm) < 1e-3) return null; // < 0.001 mm: ruis
    const bs = allBeamSamples.find(b => b.beam.id === maxFieldW!.beamId);
    const sm = bs?.samples[maxFieldW.sampleIdx];
    if (!sm) return null;
    const lx = sm.sx + sm.dx_mm * dispScale;
    const ly = sm.sy - sm.dz_mm * dispScale;
    // Label onder het diepste punt van de getekende kromme (bij w<0 = onder).
    const off = maxFieldW.w_mm <= 0 ? 20 : -20;
    const tekst = `w = ${fmtNl(maxFieldW.w_mm)} mm`;
    const bw = tekst.length * 7.5 + 12;
    return (
      <g key="def-extreme">
        <rect x={lx - bw / 2} y={ly + off - 11} width={bw} height={20} rx={3}
          className="fem-result-label-bg" />
        <text x={lx} y={ly + off + 4} textAnchor="middle"
          className="fem-diagram-value" style={{ fill: "var(--theme-accent)" }}>
          {tekst}
        </text>
      </g>
    );
  };

  // ── Knoopwaarden (subvinkje onder Verplaatsing): per knoop een label met
  //    ux / uz in mm (NL-komma) naast de knoop. Alleen zichtbaar wanneer de
  //    vervormingsweergave aanstaat — zelfde patroon als de reactie-subkeuzes.
  const renderKnoopWaarden = () => {
    if (!showDeflection || displayFlags.knoopWaarden !== true) return null;
    const out: React.ReactNode[] = [];
    for (const n of nodes) {
      const d = result.displacements.get(n.id);
      if (!d) continue;
      const p = worldToScreen(n.x, n.z);
      const tekst = `${n.id}: ${fmtNl(d.ux)} / ${fmtNl(d.uz)} mm`;
      const bw = tekst.length * 7.2 + 10;
      out.push(
        <g key={`knoopw${n.id}`}>
          <rect x={p.x + 9} y={p.y + 8} width={bw} height={19} rx={3}
            className="fem-result-label-bg" />
          <text x={p.x + 14} y={p.y + 21.5} textAnchor="start"
            className="fem-node-disp-label">
            {tekst}
          </text>
        </g>
      );
    }
    return out;
  };

  // Reactions — twee aparte pijlen per oplegging: horizontaal (Fx) en
  // verticaal (Fz). Pijl wijst in de richting van de KRACHT (head richting
  // knoop, tail aan de andere kant). Pijl-tip stopt op REACTION_GAP px van
  // het knoop-punt zodat het niet door het support-symbool heen loopt.
  const REACTION_MIN_KN = 0.05;  // < 0.05 kN (= 50 N) wordt niet getekend
  const REACTION_GAP_PX = 14;     // afstand tussen pijl-tip en steunpunt
  const renderReactions = () => Array.from(result.reactions.entries()).flatMap(([nodeId, r]) => {
    const n = nodes.find(nn => nn.id === nodeId);
    if (!n) return [];
    const p = worldToScreen(n.x, n.z);
    const out: React.ReactNode[] = [];

    // ── Horizontaal (Fx) ──────────────────────────────────────────────
    if (displayFlags.reactieX !== false && Math.abs(r.fx) / 1000 > REACTION_MIN_KN) {
      const ax = r.fx * reactionScale;   // screen-px in x direction
      const dirX = Math.sign(ax) || 1;
      // Head zit GAP weg van p in tail-richting (= weg van het support).
      const headX = p.x - dirX * REACTION_GAP_PX;
      const tailX = headX - ax;
      const midX = (tailX + headX) / 2;
      const labelY = p.y + 18;
      const tekst = `Fx ${fmtNl(r.fx / 1000)} kN`;
      const bw = tekst.length * 7.5 + 12;
      out.push(
        <g key={`rx-fx-${nodeId}`}>
          <line x1={tailX} y1={p.y} x2={headX} y2={p.y}
            className="fem-reaction-arrow"
            markerEnd="url(#fem-reaction-head)" />
          <rect x={midX - bw / 2} y={labelY - 10} width={bw} height={19} rx={3}
            className="fem-result-label-bg" />
          <text x={midX} y={labelY + 4} className="fem-reaction-label">
            {tekst}
          </text>
        </g>
      );
    }

    // ── Verticaal (Fz) ────────────────────────────────────────────────
    if (displayFlags.reactieZ !== false && Math.abs(r.fz) / 1000 > REACTION_MIN_KN) {
      // Klassieke weergave: de verticale reactiepijl staat ONDER het
      // support-symbool (driehoek + grondlijn + hatching ≈ 34 px hoog),
      // volledig vrij van knoop, staaf en diagrammen. Pijlrichting = de
      // krachtrichting: Fz > 0 (omhoog) → pijl wijst omhoog richting het
      // support; Fz < 0 (uplift-anker) → pijl wijst omlaag.
      const SUPPORT_CLEAR_PX = 38;         // ruimte voor het support-symbool
      const len = Math.abs(-r.fz * reactionScale);
      const topY = p.y + SUPPORT_CLEAR_PX; // bovenkant van de pijl-as
      const botY = topY + len;
      const up = r.fz > 0;                 // kracht omhoog?
      const y1 = up ? botY : topY;         // tail
      const y2 = up ? topY : botY;         // head (marker-end)
      const midY = (topY + botY) / 2;
      const tekst = `Fz ${fmtNl(r.fz / 1000)} kN`;
      const bw = tekst.length * 7.5 + 12;
      const labelX = p.x + 10 + bw / 2;
      out.push(
        <g key={`rx-fz-${nodeId}`}>
          <line x1={p.x} y1={y1} x2={p.x} y2={y2}
            className="fem-reaction-arrow"
            markerEnd="url(#fem-reaction-head)" />
          <rect x={labelX - bw / 2} y={midY - 10} width={bw} height={19} rx={3}
            className="fem-result-label-bg" />
          <text x={labelX} y={midY + 4} className="fem-reaction-label">
            {tekst}
          </text>
        </g>
      );
    }

    return out;
  });

  // ── Internal-force diagrams (M-line, V-line, N-line) ──────────────────
  // Use the 21-station arrays from the solver directly. The solver runs
  // BeamForces.calculateBeamInternalForces() which produces a true
  // parabola under UDL, a true linear shape under point loads (with steps
  // at the load), and constant N. No re-computation in the UI — that
  // double-counted loads when multi-case combinations were active.
  // Auto-scale per force type so the largest value reaches ~TARGET_PX pixels.
  const TARGET_PX_DIAGRAM = 50;
  // (Solver-station data is already combination-aware; no per-LC re-projection here.)

  type DiagramSample = {
    px: number; py: number;        // screen position of point ON beam axis
    nxW: number; nzW: number;      // perpendicular direction in WORLD
    /**
     * Positie langs de staaf (mm). Nodig om DUBBELE stations te herkennen: een
     * staaf die in deelelementen is geknipt (plaatrand, of een eigen I per
     * segment bij de fysisch niet-lineaire beton-berekening) levert het
     * knippunt twee keer — einde van deel k en begin van deel k+1. Zie de
     * extremum-zoeker in renderForceDiagram.
     */
    x: number;
    // θ in mrad (rad × 1000) — zie de eenheidskeuze bij renderForceDiagram.
    N: number; V: number; M: number; T: number;
  };
  type BeamDiagram = {
    beam: Beam;
    samples: DiagramSample[];
  };

  const beamDiagrams: BeamDiagram[] = [];
  let dgMaxN = 0, dgMaxV = 0, dgMaxM = 0, dgMaxT = 0;
  const anyDiagram = showN || showV || showM || showRotation;

  if (anyDiagram) {
    for (const beam of beams) {
      const nA = nodes.find(n => n.id === beam.from);
      const nB = nodes.find(n => n.id === beam.to);
      const ef = result.elements.get(beam.id);
      if (!nA || !nB || !ef) continue;
      const dx = nB.x - nA.x, dz = nB.z - nA.z;
      const L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const s = dz / L;
      // Perpendicular = CCW 90° rotation of beam axis: (-s, c) in world
      const c2 = dx / L;
      const nxW = -s, nzW = c2;

      const samples: DiagramSample[] = [];

      // Use the engine's station arrays directly. Fallback to a simple
      // linear interpolation between endpoints only if no stations came
      // through (shouldn't happen with the new pipeline).
      const stations = ef.stations_mm;
      const hasStations = stations.length > 0 && ef.L_mm > 0 &&
        ef.bendingMoment.length === stations.length &&
        ef.shearForce.length    === stations.length &&
        ef.normalForce.length   === stations.length;

      if (hasStations) {
        for (let k = 0; k < stations.length; k++) {
          const xi = stations[k] / ef.L_mm;
          const px = nA.x + dx * xi;
          const pz = nA.z + dz * xi;
          const screen = worldToScreen(px, pz);
          const N_val = ef.normalForce[k];
          const V_val = ef.shearForce[k];
          const M_val = ef.bendingMoment[k];
          // rad → mrad; ontbreekt het veld (ouder resultaat) dan blijft het 0
          // en tekent de θ-stand een vlakke lijn i.p.v. NaN-punten.
          const T_val = (ef.rotation?.[k] ?? 0) * 1000;
          samples.push({ px: screen.x, py: screen.y, nxW, nzW, x: stations[k], N: N_val, V: V_val, M: M_val, T: T_val });
          if (Math.abs(N_val) > dgMaxN) dgMaxN = Math.abs(N_val);
          if (Math.abs(V_val) > dgMaxV) dgMaxV = Math.abs(V_val);
          if (Math.abs(M_val) > dgMaxM) dgMaxM = Math.abs(M_val);
          if (Math.abs(T_val) > dgMaxT) dgMaxT = Math.abs(T_val);
        }
      } else {
        // Fallback: 13 linear samples between endpoint values only.
        const FALLBACK_SAMPLES = 12;
        for (let k = 0; k <= FALLBACK_SAMPLES; k++) {
          const xi = k / FALLBACK_SAMPLES;
          const px = nA.x + dx * xi;
          const pz = nA.z + dz * xi;
          const screen = worldToScreen(px, pz);
          const N_val = ef.N;
          const V_val = ef.V;
          const M_val = (1 - xi) * ef.M_start + xi * ef.M_end;
          // Zonder stations is er geen θ-verloop; 0 laat de stand leeg i.p.v.
          // een verzonnen lineair verloop te suggereren.
          samples.push({ px: screen.x, py: screen.y, nxW, nzW, x: xi * L, N: N_val, V: V_val, M: M_val, T: 0 });
          if (Math.abs(N_val) > dgMaxN) dgMaxN = Math.abs(N_val);
          if (Math.abs(V_val) > dgMaxV) dgMaxV = Math.abs(V_val);
          if (Math.abs(M_val) > dgMaxM) dgMaxM = Math.abs(M_val);
        }
      }

      beamDiagrams.push({ beam, samples });
    }
  }

  // Auto-scale per component; user-controlled multiplier (slider) applied on top.
  const scaleN = dgMaxN > 0 ? (TARGET_PX_DIAGRAM / dgMaxN) * (displayFlags.scaleN ?? 1) : 0;
  const scaleV = dgMaxV > 0 ? (TARGET_PX_DIAGRAM / dgMaxV) * (displayFlags.scaleV ?? 1) : 0;
  const scaleM = dgMaxM > 0 ? (TARGET_PX_DIAGRAM / dgMaxM) * (displayFlags.scaleM ?? 1) : 0;
  const scaleT = dgMaxT > 0 ? (TARGET_PX_DIAGRAM / dgMaxT) * (displayFlags.scaleR ?? 1) : 0;

  /** Draw a diagram (filled polygon + outline) for one force component.
   *
   * M is computed in engineering convention (sagging-positive).
   * To plot on the TENSION SIDE we flip the offset sign for M — sagging M > 0
   * pushes the diagram in the -y_local direction (= bottom of a horizontal beam,
   * = world-RIGHT for the left column, etc.). N and V keep raw signs.
   *
   * "θ" is de hoekverdraaiing. Die krijgt GEEN trekzijde-flip — hij is geen
   * snedekracht maar een vervormingsgrootheid, dus hij wordt met zijn eigen
   * teken uitgezet (positief = tegen de klok in, dus naar lokale +y).
   *
   * EENHEID θ: mrad, niet rad en niet graden. Een gebruikelijke
   * eindrotatie ligt rond 1/300 rad; in rad lees je "0,0033" (drie
   * betekenisloze nullen), in graden "0,19°" — beide lastig te vergelijken.
   * mrad geeft "3,3" en sluit bovendien aan op de kolom "φy [mrad]" van de
   * knoopverplaatsingstabel, zodat één eenheid door de hele app loopt.
   */
  const renderForceDiagram = (which: "N" | "V" | "M" | "θ", scale: number, classKey: string) => {
    if (scale === 0) return null;
    const showValues = displayFlags.showExtremes ?? false;
    // Snedetekens alleen bij V en M — N kent geen afschuif- of buigzin, en θ
    // is een vervormingsgrootheid. Zie het blok SNEDETEKENS bovenaan.
    const toonTekens = (displayFlags.snedeTekens !== false) &&
      (which === "V" || which === "M");
    const globaalMax = which === "M" ? dgMaxM : dgMaxV;
    // Waarde MET eenheid en NL-komma: momenten in kNm, krachten in kN,
    // hoekverdraaiing in mrad (de sample draagt hem al in mrad).
    const fmtValue = (raw: number): string =>
      which === "M" ? `${fmtNl(raw / 1e6)} kNm`
      : which === "θ" ? `${fmtNl(raw, 2)} mrad`
      : `${fmtNl(raw / 1000)} kN`;

    return beamDiagrams.map(({ beam, samples }) => {
      if (samples.length === 0) return null;
      const offset: string[] = [];
      // Bijhouden voor waarde-labels: per sample de geplotte offset-positie
      // + de vlip-waarde (voor label-offset-richting) + de raw waarde.
      const pts: { ox: number; oy: number; vFlip: number; raw: number; nxW: number; nzW: number; x: number }[] = [];
      for (const sm of samples) {
        const raw = which === "N" ? sm.N
          : which === "V" ? sm.V
          : which === "θ" ? sm.T
          : sm.M;
        // M flips for tension-side rendering; N/V/θ plot in raw direction.
        const v = which === "M" ? -raw : raw;
        const ox = sm.px + sm.nxW * v * scale;
        const oy = sm.py - sm.nzW * v * scale;
        offset.push(`${ox.toFixed(2)},${oy.toFixed(2)}`);
        pts.push({ ox, oy, vFlip: v, raw, nxW: sm.nxW, nzW: sm.nzW, x: sm.x });
      }
      // Closing polygon: back to beam (endpoint → startpoint along axis)
      const startBase = `${samples[0].px.toFixed(2)},${samples[0].py.toFixed(2)}`;
      const endBase   = `${samples[samples.length - 1].px.toFixed(2)},${samples[samples.length - 1].py.toFixed(2)}`;
      const beamClose: string[] = [endBase, startBase];
      const polyPts = [...offset, ...beamClose].join(" ");
      // Outline volgt OOK de zijkanten: vanaf baseline-start, omhoog naar
      // diagram-top, langs de top, naar diagram-eind, en terug naar baseline-
      // eind. Zo sluit de lijn netjes aan op de staaf bij hoeken / knopen.
      const linePts = [startBase, ...offset, endBase].join(" ");

      // ── Waarde-labels op extreme punten (knop "Extreme waarden tonen") ──
      //  1. Uiteinden (hoeken / steunmomenten): sample 0 en laatste.
      //  2. Lokale extrema: elk punt waar de helling van teken wisselt —
      //     dit vangt het VELDMOMENT (max in het veld, waar V door nul gaat).
      //     Bij een UDL-lijn wordt de piekwaarde parabolisch verfijnd zodat
      //     het getoonde max exact is, niet de dichtstbijzijnde sample-waarde.
      const valueLabels: React.ReactNode[] = [];
      if (showValues) {
        let globalPeak = 0;
        for (const p of pts) globalPeak = Math.max(globalPeak, Math.abs(p.raw));
        const minShow = Math.max(globalPeak * 0.02, 1e-6); // ruis-drempel

        // label-index → weer te geven waarde (kan parabolisch verfijnd zijn)
        const labelVal = new Map<number, number>();
        const consider = (i: number, value: number) => {
          if (Math.abs(value) <= minShow) return;
          // Bij bijna-samenvallende indices houd de grootste |waarde|.
          const prev = labelVal.get(i);
          if (prev === undefined || Math.abs(value) > Math.abs(prev)) labelVal.set(i, value);
        };

        // Uiteinden (steunmomenten / hoekwaarden)
        consider(0, pts[0].raw);
        consider(pts.length - 1, pts[pts.length - 1].raw);

        // ── Lokale extrema (veldmoment, tussensteunpunten) ────────────────
        // NAADPUNTEN EERST WEGNEMEN. Een in deelelementen geknipte staaf —
        // op een plaatrand, of met een eigen I per segment bij de fysisch
        // niet-lineaire betonberekening — levert het knippunt TWEE keer: het
        // laatste station van deel k en het eerste van deel k+1, met dezelfde
        // x. Voor een grootheid die daar echt continu is, is het tweede punt
        // bit-identiek aan het eerste (de hoekverdraaiing komt links en rechts
        // uit dezelfde knoop-DOF). Het verschil naar die buur is dan exact
        // nul, en de tekenwisselingstoets hieronder ziet op ELKE segmentgrens
        // een "extremum" — op een staaf met dertien segmenten leverde dat
        // tientallen labels over één diagram.
        //
        // Een naad met een ECHTE sprong (N en V mogen op een plaatrandknoop
        // springen) blijft staan: die twee waarden verschillen wél. En het
        // punt zelf verdwijnt niet — alleen de kopie ervan — zodat een
        // veldmaximum dat toevallig precies op een naad valt (bij een
        // symmetrisch gesegmenteerde ligger: het midden) gewoon gevonden
        // wordt.
        //
        // "Gelijk" met een marge van 1 % van de piek, niet bit-exact: bij de
        // fysisch niet-lineaire berekening heeft elk stuk zijn eigen EI, en
        // dan verschillen de twee naadwaarden van een vrijwel constante
        // grootheid (N of V op een kolom) in de derde decimaal. Die marge kan
        // geen leesbaar label wegnemen: `minShow` hieronder toont sowieso
        // niets onder 2 % van de piek.
        const naadTol = globalPeak * 1e-2;
        const kand: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          if (i > 0 && pts[i].x === pts[i - 1].x &&
              Math.abs(pts[i].raw - pts[i - 1].raw) <= naadTol) continue;
          kand.push(i);
        }
        // Verschillen onder de afrondingsruis tellen als NUL. Een constante
        // grootheid (N of V op een kolom) is binnen één rekenelement exact
        // constant, maar over een segmentgrens verschillen de twee waarden in
        // het laatste bit — twee elementen, twee stijfheidsmatrices. Zonder
        // deze drempel leest de tekenwisselingstoets dat als een extremum en
        // zet ze op elke grens een label neer.
        const ruis = globalPeak * 1e-9;
        const snap = (d: number) => (Math.abs(d) <= ruis ? 0 : d);
        for (let k = 1; k < kand.length - 1; k++) {
          const i = kand[k], iPrev = kand[k - 1], iNext = kand[k + 1];
          const dPrev = snap(pts[i].raw - pts[iPrev].raw);
          const dNext = snap(pts[iNext].raw - pts[i].raw);
          if (dPrev === 0 && dNext === 0) continue;
          const slopeFlips = (dPrev >= 0 && dNext <= 0) || (dPrev <= 0 && dNext >= 0);
          if (!slopeFlips) continue;
          // Parabolische verfijning van het extremum via 3 gelijk-afstand punten.
          const y0 = pts[iPrev].raw, y1 = pts[i].raw, y2 = pts[iNext].raw;
          const denom = y0 - 2 * y1 + y2;
          let peakVal = y1;
          if (Math.abs(denom) > 1e-9) {
            const t = 0.5 * (y0 - y2) / denom;         // -0.5..0.5 vertex-offset
            peakVal = y1 - 0.25 * (y0 - y2) * t;       // vertex-waarde
          }
          consider(i, peakVal);
        }

        for (const [i, value] of labelVal) {
          const pt = pts[i];
          // Label net voorbij de diagram-lijn, in de plot-richting van het
          // diagram op dat punt (of een vaste kant bij ~0-waarde).
          const dir = Math.sign(pt.vFlip) || 1;
          const lx = pt.ox + pt.nxW * dir * 16;
          const ly = pt.oy - pt.nzW * dir * 16;
          valueLabels.push(
            <text
              key={`val-${which}-${beam.id}-${i}`}
              x={lx} y={ly}
              className={`fem-diagram-value ${classKey}`}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {fmtValue(value)}
            </text>
          );
        }
      }

      // ── Snedetekens: één per zone met gelijk teken ──────────────────────
      // Zie het blok SNEDETEKENS bovenaan voor de conventie en voor de reden
      // achter de maatvoering hieronder.
      const tekens: React.ReactNode[] = [];
      if (toonTekens && pts.length >= 2 && globaalMax > 0) {
        const zones = bepaalTekenZones(pts.map(p => p.raw), globaalMax * 1e-3);
        for (const zone of zones) {
          // Zone van één station heeft geen lengte om een teken in te zetten
          // (en zou hieronder buiten de reeks interpoleren).
          if (zone.i1 <= zone.i0) continue;
          // Hart van de zone LANGS DE STAAF, tussen de twee omliggende
          // stations geïnterpoleerd. Zou het teken op het dichtstbijzijnde
          // station gaan zitten, dan verspringt het zichtbaar zodra de zone
          // een station opschuift (andere belastinggeval, andere combinatie).
          const xMid = (pts[zone.i0].x + pts[zone.i1].x) / 2;
          let j = zone.i0;
          while (j < zone.i1 - 1 && pts[j + 1].x < xMid) j++;
          const dxSt = pts[j + 1].x - pts[j].x;
          const t = dxSt > 0 ? Math.min(1, Math.max(0, (xMid - pts[j].x) / dxSt)) : 0;
          const bx = samples[j].px + t * (samples[j + 1].px - samples[j].px);
          const by = samples[j].py + t * (samples[j + 1].py - samples[j].py);
          const vMid = pts[j].vFlip + t * (pts[j + 1].vFlip - pts[j].vFlip);
          const diepte = vMid * scale;

          // Maat: begrensd door de schermlengte van de zone (anders kruipen de
          // tekens bij uitzoomen over elkaar), door de diepte van de lob
          // (anders steekt het teken door de diagramlijn heen) en door een
          // vaste bovengrens (anders overstemt het teken de lijn zelf).
          const zoneLenPx = Math.hypot(
            samples[zone.i1].px - samples[zone.i0].px,
            samples[zone.i1].py - samples[zone.i0].py,
          );
          const maat = Math.min(zoneLenPx * 0.20, Math.abs(diepte) * 0.42, MAX_TEKEN_PX);
          if (!(maat >= MIN_TEKEN_PX)) continue;

          // Schermassen van deze staaf. `nxW`/`nzW` is lokale +y in WERELD-
          // assen; het scherm klapt de z-as om (zie worldToScreen), vandaar
          // het minteken op de y-component. De staafas zelf staat daar 90° op.
          const { nxW, nzW } = pts[zone.i0];
          const g: TekenMeetkunde = {
            bx, by,
            exx: nzW, exy: nxW,      // langs de staaf, knoop1 → knoop2
            eyx: nxW, eyy: -nzW,     // lokale +y
            diepte, maat,
          };
          const d = which === "M" ? buigTekenPad(g) : afschuifTekenPad(g, zone.teken);
          tekens.push(
            <path
              key={`tkn-${which}-${beam.id}-${zone.i0}`}
              d={d}
              className={`fem-diagram-teken ${classKey}`}
              // Lijndikte mee laten groeien met de maat: een teken van 4,5 px
              // met een lijn van 1,8 px is een vlek.
              style={{ strokeWidth: Math.max(1, maat * 0.16) }}
            />
          );
        }
      }

      return (
        <g key={`dgm-${which}-${beam.id}`}>
          <polygon points={polyPts} className={`fem-diagram-fill ${classKey}`} />
          <polyline points={linePts} className={`fem-diagram-line ${classKey}`} fill="none" />
          {tekens}
          {valueLabels}
        </g>
      );
    });
  };

  // ── Buigstijfheidsverloop EI(x) — fysisch niet-lineair beton ─────────────
  // De fysisch niet-lineaire tweede orde rekent elke staaf in stukken met een
  // eigen traagheidsmoment. `ElementForces.segmenten` draagt per rekenstuk
  // xStart/xEnd (mm langs de staaf) en de I (mm⁴) waarmee dat stuk gerekend
  // heeft; de E hoort bij de staaf en komt uit dezelfde `resolveSection` die
  // de solver-invoer voedt. Samen geeft dat EI per stuk.
  //
  // Waarom een stapfiguur MET referentielijn: de vraag van een constructeur is
  // niet "hoe groot is EI" maar "wáár is de ligger gescheurd". De ongescheurde
  // EI₀ = E·I van de bruto doorsnede is de gestreepte lijn; de dichte stappen
  // liggen daar (deels) onder. Waar ze samenvallen is de doorsnede ongescheurd.
  //
  // Zonder `segmenten` is er niets gescheurd gerekend — een geldige toestand,
  // geen fout. Deze weergave tekent dan niets en de stand staat in de
  // Resultaten-tab uitgegrijsd met de reden erbij.
  const EI_TARGET_PX = 46;
  type EiStuk = { xStart: number; xEnd: number; EI: number };
  type EiStaaf = { beam: Beam; L_mm: number; EI0: number; stukken: EiStuk[] };
  const eiStaven: EiStaaf[] = [];
  let eiMax = 0;
  if (showEI) {
    for (const beam of beams) {
      const ef = result.elements.get(beam.id);
      if (!ef?.segmenten || ef.segmenten.length === 0 || ef.L_mm <= 0) continue;
      const sec = resolveSection(beam.material, beam.profile);
      if (!(sec.E > 0)) continue;
      const EI0 = sec.E * sec.I;                       // N·mm² — ongescheurd
      const stukken = ef.segmenten.map(s => ({
        xStart: s.xStart, xEnd: s.xEnd, EI: sec.E * s.I,
      }));
      for (const s of stukken) if (s.EI > eiMax) eiMax = s.EI;
      if (EI0 > eiMax) eiMax = EI0;
      eiStaven.push({ beam, L_mm: ef.L_mm, EI0, stukken });
    }
  }
  const eiScale = eiMax > 0 ? (EI_TARGET_PX / eiMax) * (displayFlags.scaleEI ?? 1) : 0;

  /** EI in kNm²: 1 kNm² = 10³ N · 10⁶ mm² = 10⁹ N·mm². */
  const eiNaarKNm2 = (nmm2: number) => nmm2 / 1e9;

  const renderEIDiagram = () => {
    if (eiScale === 0) return null;
    const toonWaarden = displayFlags.showExtremes ?? false;
    return eiStaven.map(({ beam, L_mm, EI0, stukken }) => {
      const nA = nodes.find(n => n.id === beam.from);
      const nB = nodes.find(n => n.id === beam.to);
      if (!nA || !nB) return null;
      const dx = nB.x - nA.x, dz = nB.z - nA.z;
      const L = Math.hypot(dx, dz);
      if (L < 1e-6) return null;
      // Loodrecht = 90° CCW op de staafas, dezelfde richting als de andere
      // diagrammen gebruiken.
      const nxW = -dz / L, nzW = dx / L;
      /** Scherm-punt op fractie t langs de staaf, met een loodrechte offset. */
      const punt = (t: number, offsetPx: number) => {
        const p = worldToScreen(nA.x + dx * t, nA.z + dz * t);
        return { x: p.x + nxW * offsetPx, y: p.y - nzW * offsetPx };
      };

      // Stapfiguur: per stuk een horizontale lijn op EI·schaal, met verticale
      // sprongen ertussen. Eén doorlopende polyline zodat de sprong zichtbaar
      // is als verticale flank en niet als schuine helling.
      const pts: string[] = [];
      for (const s of stukken) {
        const h = s.EI * eiScale;
        const t0 = s.xStart / L_mm, t1 = s.xEnd / L_mm;
        const a = punt(t0, h), b = punt(t1, h);
        pts.push(`${a.x.toFixed(2)},${a.y.toFixed(2)}`, `${b.x.toFixed(2)},${b.y.toFixed(2)}`);
      }
      // Referentielijn op de ongescheurde EI₀ over de hele staaf.
      const r0 = punt(0, EI0 * eiScale), r1 = punt(1, EI0 * eiScale);

      // Vlak tussen staafas en stappen, zodat de terugval als "hap" leest.
      const basisEind = punt(1, 0), basisStart = punt(0, 0);
      const vlak = [
        ...pts,
        `${basisEind.x.toFixed(2)},${basisEind.y.toFixed(2)}`,
        `${basisStart.x.toFixed(2)},${basisStart.y.toFixed(2)}`,
      ].join(" ");

      // Label op het stuk met de KLEINSTE EI — dat is de maatgevende
      // scheurplek — plus de referentiewaarde bij de gestreepte lijn.
      const labels: React.ReactNode[] = [];
      if (toonWaarden && stukken.length > 0) {
        let laagste = stukken[0];
        for (const s of stukken) if (s.EI < laagste.EI) laagste = s;
        const factor = EI0 > 0 ? laagste.EI / EI0 : 1;
        const tMid = ((laagste.xStart + laagste.xEnd) / 2) / L_mm;
        const p = punt(tMid, laagste.EI * eiScale + 12);
        labels.push(
          <text key={`ei-min-${beam.id}`} x={p.x} y={p.y}
            className="fem-diagram-value fem-diagram-EI"
            textAnchor="middle" dominantBaseline="middle">
            {`EI = ${fmtNl(eiNaarKNm2(laagste.EI), 0)} kNm² (${fmtNl(factor, 2)}·EI₀)`}
          </text>
        );
        const pr = punt(0.5, EI0 * eiScale + 12);
        labels.push(
          <text key={`ei-ref-${beam.id}`} x={pr.x} y={pr.y}
            className="fem-diagram-value fem-diagram-EI-reflabel"
            textAnchor="middle" dominantBaseline="middle">
            {`EI₀ = ${fmtNl(eiNaarKNm2(EI0), 0)} kNm²`}
          </text>
        );
      }

      return (
        <g key={`ei-${beam.id}`}>
          <polygon points={vlak} className="fem-diagram-fill fem-diagram-EI" />
          <polyline points={pts.join(" ")} className="fem-diagram-line fem-diagram-EI" fill="none" />
          <line x1={r0.x} y1={r0.y} x2={r1.x} y2={r1.y} className="fem-diagram-EI-ref" />
          {labels}
        </g>
      );
    });
  };

  return (
    <g className="fem-results-overlay" pointerEvents="none">
      {/* Arrow marker — defined once */}
      <defs>
        <marker
          id="fem-reaction-head"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fem-reaction-marker-fill" />
        </marker>
      </defs>
      {showDeflection && renderDeflection()}
      {showDeflection && renderDeflectionExtreme()}
      {renderKnoopWaarden()}
      {/* Internal-force diagrams drawn under reactions/labels so they don't
          occlude annotation text. */}
      {showM && renderForceDiagram("M", scaleM, "fem-diagram-M")}
      {showV && renderForceDiagram("V", scaleV, "fem-diagram-V")}
      {showN && renderForceDiagram("N", scaleN, "fem-diagram-N")}
      {showRotation && renderForceDiagram("θ", scaleT, "fem-diagram-R")}
      {showEI && renderEIDiagram()}
      {showReactions && renderReactions()}

      {/* HUD-like banner so the user knows scale used — only when deflection shown */}
      {showDeflection && maxOffsetMm > 0 && (
        <g transform={`translate(${canvasW - 220}, ${canvasH - 90})`}>
          <rect width={210} height={36} rx={4} className="fem-result-label-bg" />
          <text x={10} y={15} className="fem-scale-label">Deflection scale: {dispScale.toFixed(1)}×</text>
          <text x={10} y={28} className="fem-scale-label">max |u| = {maxOffsetMm.toFixed(2)} mm</text>
        </g>
      )}

      {/* Supports list (used to satisfy props lint) — render nothing visually,
          but keep the prop in the signature so callers stay consistent. */}
      <g style={{ display: "none" }}>{supports.map(s => <text key={s.nodeId}>{s.nodeId}</text>)}</g>
    </g>
  );
}
