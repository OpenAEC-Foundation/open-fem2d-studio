/**
 * EigenGewichtLaag — de automatisch gegenereerde lasten van het eigen gewicht
 * op het tekenvlak (issue #42).
 *
 * ALLEEN-LEZEN. De laag tekent wat `eigenGewichtOverzicht` aanlevert — de
 * uitvoer van dezelfde `eigenGewichtLasten` waarmee de rekengang wordt gevoed —
 * en rekent zelf niets uit. Er valt niets aan te klikken, te slepen of te
 * verwijderen (`pointer-events: none`): de lasten volgen uit profiel, materiaal
 * en geometrie en werken vanzelf bij.
 *
 * Herkenbaar als automatisch: gestreepte, gedempte pijlen in plaats van de
 * rode van een ingevoerde last, en "(auto)" achter de waarde. De waarde staat
 * per staaf in kN/m, bij een verlopend profiel als bereik.
 *
 * Bewust een eigen component met eigen stijlblad: FemCanvas krijgt er één prop
 * en één regel bij.
 */
import type { Beam, Node, Plate } from "./femTypes";
import type { EigenGewichtOverzicht } from "../../lib/eigenGewichtOverzicht";
import "./EigenGewichtLaag.css";

interface Props {
  overzicht: EigenGewichtOverzicht;
  nodes: Node[];
  beams: Beam[];
  plates: Plate[];
  worldToScreen: (x: number, z: number) => { x: number; y: number };
  /** Achtervoegsel achter de waarde, vertaald door de aanroeper ("auto"). */
  autoLabel: string;
}

/** Pijllengte in px: vast en kort, zodat de laag een ingevoerde last niet overstemt. */
const PIJL_PX = 16;

/** Getal met komma, zoals de rest van het tekenvlak het eigen gewicht leest. */
function nl(x: number, decimalen: number): string {
  return x.toFixed(decimalen).replace(".", ",");
}

export default function EigenGewichtLaag({
  overzicht, nodes, beams, plates, worldToScreen, autoLabel,
}: Props) {
  if (overzicht.caseId === null) return null;
  const knoop = new Map(nodes.map((n) => [n.id, n]));
  const staaf = new Map(beams.map((b) => [b.id, b]));

  return (
    <g className="fem-eg-laag" pointerEvents="none" data-testid="eigen-gewicht-laag">
      <defs>
        <marker id="fem-eg-head" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fem-eg-marker" />
        </marker>
      </defs>

      {overzicht.staven.map((s) => {
        const b = staaf.get(s.beamId);
        const nA = b ? knoop.get(b.from) : undefined;
        const nB = b ? knoop.get(b.to) : undefined;
        if (!b || !nA || !nB || s.delen.length === 0) return null;
        const pA = worldToScreen(nA.x, nA.z), pB = worldToScreen(nB.x, nB.z);
        const dx = pB.x - pA.x, dy = pB.y - pA.y;
        if (Math.hypot(dx, dy) < 1) return null;
        const pijlen: React.ReactNode[] = [];
        for (const [i, d] of s.delen.entries()) {
          // Zwaartekracht: altijd globaal omlaag, ook op een schuine staaf —
          // zo rekent de solver een globale z-last.
          const n = Math.max(2, Math.round(8 * (d.endFrac - d.startFrac)));
          for (let k = 0; k <= n; k++) {
            const f = d.startFrac + ((d.endFrac - d.startFrac) * k) / n;
            const x = pA.x + dx * f, y = pA.y + dy * f;
            pijlen.push(
              <line key={`${i}-${k}`} x1={x} y1={y - PIJL_PX} x2={x} y2={y}
                className="fem-eg-pijl" markerEnd="url(#fem-eg-head)" />,
            );
          }
        }
        const qs = s.delen.map((d) => Math.abs(d.q));
        const qMin = Math.min(...qs), qMax = Math.max(...qs);
        const waarde = qMax - qMin < 5e-4 ? nl(qMax, 3) : `${nl(qMin, 3)}–${nl(qMax, 3)}`;
        // Het label ONDER de staaf: boven staat het label van een ingevoerde last.
        const mx = (pA.x + pB.x) / 2, my = (pA.y + pB.y) / 2;
        return (
          <g key={`eg-b${s.beamId}`} data-eg-staaf={s.beamId}>
            <line x1={pA.x} y1={pA.y - PIJL_PX} x2={pB.x} y2={pB.y - PIJL_PX} className="fem-eg-band" />
            {pijlen}
            <text x={mx} y={my + 15} className="fem-eg-tekst">
              {`g = ${waarde} kN/m (${autoLabel})`}
            </text>
          </g>
        );
      })}

      {overzicht.platen.map((pl) => {
        const plaat = plates.find((p) => p.id === pl.plateId);
        const hoeken = plaat?.nodeIds.map((id) => knoop.get(id)).filter((h): h is Node => h !== undefined) ?? [];
        if (hoeken.length < 3) return null;
        const cx = hoeken.reduce((a, h) => a + h.x, 0) / hoeken.length;
        const cz = hoeken.reduce((a, h) => a + h.z, 0) / hoeken.length;
        const p = worldToScreen(cx, cz);
        return (
          <g key={`eg-p${pl.plateId}`} data-eg-plaat={pl.plateId}>
            <line x1={p.x} y1={p.y - PIJL_PX - 12} x2={p.x} y2={p.y - 12}
              className="fem-eg-pijl" markerEnd="url(#fem-eg-head)" />
            <text x={p.x} y={p.y + 4} className="fem-eg-tekst">
              {`g = ${nl(Math.abs(pl.p), 3)} kN/m² (${autoLabel})`}
            </text>
          </g>
        );
      })}
    </g>
  );
}
