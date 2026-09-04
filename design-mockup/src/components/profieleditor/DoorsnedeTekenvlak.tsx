/**
 * DoorsnedeTekenvlak — het interactieve tekenvlak van de profieleditor.
 *
 * Tekent het ontwerp op ware verhouding (y naar rechts, z omhoog), met een
 * millimeterraster, de zwaartepuntsassen en het schuifmiddelpunt uit de
 * motoruitvoer, en maatlijnen voor de buitenmaten. Bouwstenen (lamellen,
 * catalogusdelen, gaten) zijn aan te klikken en te slepen; het basisprofiel
 * van een gat-ontwerp ligt vast.
 *
 * De contouren komen uit lib/profieleditor/tekening.ts en worden met één
 * groepstransformatie `translate · scale(s, −s)` op het scherm gezet; alle
 * tekst en maatlijnen staan buiten die groep in schermcoördinaten.
 */
import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { omhullende } from "../../lib/profieleditor/geometrie";
import { tekenItems } from "../../lib/profieleditor/tekening";
import { fmtMaat } from "../../lib/profieleditor/format";
import type { DoorsnedeOntwerp, MotorUitvoer } from "../../lib/profieleditor/types";

const W = 640;
const H = 560;
const MARGE_LINKS = 64;
const MARGE_RECHTS = 36;
const MARGE_BOVEN = 44;
const MARGE_ONDER = 30;

interface Props {
  ontwerp: DoorsnedeOntwerp;
  uitvoer: MotorUitvoer | null;
  verouderd: boolean;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
  /** Sleep begonnen op een bouwsteen. */
  onSleepStart: (id: string) => void;
  /** Sleepverplaatsing sinds het begin, in model-mm. */
  onSleep: (id: string, dy: number, dz: number) => void;
  onSleepEinde: () => void;
}

/** Rasterstap (mm) zodat een stap minstens 14 schermeenheden is. */
function rasterStap(s: number): number {
  for (const stap of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
    if (stap * s >= 14) return stap;
  }
  return 1000;
}

export default function DoorsnedeTekenvlak({
  ontwerp,
  uitvoer,
  verouderd,
  geselecteerd,
  onSelecteer,
  onSleepStart,
  onSleep,
  onSleepEinde,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const sleep = useRef<{ id: string; x0: number; y0: number } | null>(null);

  const items = useMemo(() => tekenItems(ontwerp, uitvoer?.delen ?? []), [ontwerp, uitvoer]);
  const kader = useMemo(() => omhullende(ontwerp, uitvoer?.delen ?? []), [ontwerp, uitvoer]);

  if (!kader || items.length === 0) {
    return (
      <div className="pe-tekenvlak-leeg">
        Nog niets getekend. Kies links een startvorm of voeg een lamel toe.
      </div>
    );
  }

  // Passend maken: buitenmaten met een kleine marge.
  const bw = Math.max(kader.yMax - kader.yMin, 1);
  const bh = Math.max(kader.zMax - kader.zMin, 1);
  const tekenW = W - MARGE_LINKS - MARGE_RECHTS;
  const tekenH = H - MARGE_BOVEN - MARGE_ONDER;
  const s = Math.min(tekenW / (bw * 1.12), tekenH / (bh * 1.12));
  const ox = MARGE_LINKS + (tekenW - bw * s) / 2 - kader.yMin * s;
  const oy = MARGE_BOVEN + (tekenH - bh * s) / 2 + kader.zMax * s;
  const X = (y: number) => ox + y * s;
  const Y = (z: number) => oy - z * s;

  // Raster in schermcoördinaten.
  const stap = rasterStap(s);
  const rasterLijnen: Array<{ x1: number; y1: number; x2: number; y2: number; hoofd: boolean }> = [];
  const yVan = Math.floor((0 - ox) / s / stap) * stap;
  const yTot = Math.ceil((W - ox) / s / stap) * stap;
  for (let y = yVan; y <= yTot; y += stap) {
    rasterLijnen.push({ x1: X(y), y1: 0, x2: X(y), y2: H, hoofd: Math.abs(y) < 1e-9 });
  }
  const zVan = Math.floor((oy - H) / s / stap) * stap;
  const zTot = Math.ceil(oy / s / stap) * stap;
  for (let z = zVan; z <= zTot; z += stap) {
    rasterLijnen.push({ x1: 0, y1: Y(z), x2: W, y2: Y(z), hoofd: Math.abs(z) < 1e-9 });
  }

  const naarViewBox = (e: ReactPointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const opItemDown = (id: string, sleepbaar: boolean) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    onSelecteer(id);
    if (!sleepbaar) return;
    const p = naarViewBox(e);
    sleep.current = { id, x0: p.x, y0: p.y };
    svgRef.current?.setPointerCapture(e.pointerId);
    onSleepStart(id);
  };

  const opMove = (e: ReactPointerEvent) => {
    if (!sleep.current) return;
    const p = naarViewBox(e);
    onSleep(sleep.current.id, (p.x - sleep.current.x0) / s, -(p.y - sleep.current.y0) / s);
  };

  const opUp = (e: ReactPointerEvent) => {
    if (!sleep.current) return;
    sleep.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // al losgelaten
    }
    onSleepEinde();
  };

  // Maatlijnen buitenmaten.
  const yMaat = Y(kader.zMax) - 18;
  const xMaat = X(kader.yMin) - 22;

  // Zwaartepunt, schuifmiddelpunt en hoofdassen uit de motor.
  const zp = uitvoer ? { x: X(uitvoer.y_c_mm), y: Y(uitvoer.z_c_mm) } : null;
  const sm =
    uitvoer && uitvoer.schuifmiddelpunt_bepaald
      ? { x: X(uitvoer.y_s_mm), y: Y(uitvoer.z_s_mm) }
      : null;
  const smZichtbaar =
    sm && zp && (Math.abs(sm.x - zp.x) > 1.5 || Math.abs(sm.y - zp.y) > 1.5);
  const alphaGraden = uitvoer ? (uitvoer.alpha_hoofdas_rad * 180) / Math.PI : 0;
  const hoofdassen = uitvoer && Math.abs(alphaGraden) > 0.5 && Math.abs(Math.abs(alphaGraden) - 90) > 0.5;
  const asLengte = Math.max(bw, bh) * s * 0.65;

  return (
    <svg
      ref={svgRef}
      className={`pe-tekenvlak${verouderd ? " verouderd" : ""}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={() => onSelecteer(null)}
      onPointerMove={opMove}
      onPointerUp={opUp}
      onPointerCancel={opUp}
      role="img"
      aria-label="Tekenvlak van de doorsnede"
    >
      {/* Raster */}
      <g>
        {rasterLijnen.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            className={l.hoofd ? "pe-raster-hoofd" : "pe-raster"}
          />
        ))}
      </g>
      <text x={W - 6} y={H - 6} className="pe-tekst" textAnchor="end">
        raster {stap} mm
      </text>

      {/* Materiaal en gaten, in modelcoördinaten */}
      <g transform={`translate(${ox} ${oy}) scale(${s} ${-s})`}>
        {items.map((it) => {
          const actief = geselecteerd === it.id;
          const isGat = it.soort === "gat";
          const vast = it.soort === "basis";
          const klasse = isGat
            ? `pe-gat${actief ? " actief" : ""}`
            : `pe-materiaal${vast ? " pe-vast" : ""}${actief ? " actief" : ""}`;
          return (
            <path
              key={`${it.soort}-${it.id}`}
              d={it.d}
              transform={it.transform}
              fillRule={it.fillRule}
              className={klasse}
              onPointerDown={opItemDown(it.id, !vast)}
            />
          );
        })}
      </g>

      {/* Zwaartepuntsassen en hoofdassen */}
      {zp && (
        <g>
          <line x1={X(kader.yMin) - 14} y1={zp.y} x2={X(kader.yMax) + 14} y2={zp.y} className="pe-as" />
          <line x1={zp.x} y1={Y(kader.zMax) - 14} x2={zp.x} y2={Y(kader.zMin) + 14} className="pe-as" />
          <text x={X(kader.yMax) + 16} y={zp.y + 3} className="pe-tekst" fontStyle="italic">
            y
          </text>
          <text x={zp.x + 4} y={Y(kader.zMax) - 16} className="pe-tekst" fontStyle="italic">
            z
          </text>
          {hoofdassen && (
            <g>
              <line
                x1={zp.x - asLengte * Math.cos((alphaGraden * Math.PI) / 180)}
                y1={zp.y + asLengte * Math.sin((alphaGraden * Math.PI) / 180)}
                x2={zp.x + asLengte * Math.cos((alphaGraden * Math.PI) / 180)}
                y2={zp.y - asLengte * Math.sin((alphaGraden * Math.PI) / 180)}
                className="pe-hoofdas"
              />
              <line
                x1={zp.x + asLengte * Math.sin((alphaGraden * Math.PI) / 180)}
                y1={zp.y + asLengte * Math.cos((alphaGraden * Math.PI) / 180)}
                x2={zp.x - asLengte * Math.sin((alphaGraden * Math.PI) / 180)}
                y2={zp.y - asLengte * Math.cos((alphaGraden * Math.PI) / 180)}
                className="pe-hoofdas"
              />
              <text
                x={zp.x + asLengte * Math.cos((alphaGraden * Math.PI) / 180) + 4}
                y={zp.y - asLengte * Math.sin((alphaGraden * Math.PI) / 180)}
                className="pe-tekst"
                fontStyle="italic"
              >
                u ({fmtMaat(alphaGraden, 1)}°)
              </text>
            </g>
          )}
          <circle cx={zp.x} cy={zp.y} r={4} className="pe-zwaartepunt" />
          <line x1={zp.x - 7} y1={zp.y} x2={zp.x + 7} y2={zp.y} className="pe-zwaartepunt" />
          <line x1={zp.x} y1={zp.y - 7} x2={zp.x} y2={zp.y + 7} className="pe-zwaartepunt" />
          <text x={zp.x + 7} y={zp.y - 6} className="pe-tekst">
            Z ({fmtMaat(uitvoer!.y_c_mm)}, {fmtMaat(uitvoer!.z_c_mm)})
          </text>
        </g>
      )}
      {smZichtbaar && sm && (
        <g>
          <line x1={sm.x - 5} y1={sm.y - 5} x2={sm.x + 5} y2={sm.y + 5} className="pe-schuifmiddelpunt" />
          <line x1={sm.x - 5} y1={sm.y + 5} x2={sm.x + 5} y2={sm.y - 5} className="pe-schuifmiddelpunt" />
          <text x={sm.x + 7} y={sm.y + 12} className="pe-tekst">
            S ({fmtMaat(uitvoer!.y_s_mm)}, {fmtMaat(uitvoer!.z_s_mm)})
          </text>
        </g>
      )}

      {/* Maatlijnen buitenmaten */}
      <g className="pe-maatlijn" stroke="currentColor">
        <line x1={X(kader.yMin)} y1={yMaat} x2={X(kader.yMax)} y2={yMaat} className="pe-maatlijn" />
        <line x1={X(kader.yMin)} y1={yMaat - 3} x2={X(kader.yMin)} y2={yMaat + 3} className="pe-maatlijn" />
        <line x1={X(kader.yMax)} y1={yMaat - 3} x2={X(kader.yMax)} y2={yMaat + 3} className="pe-maatlijn" />
        <line x1={xMaat} y1={Y(kader.zMax)} x2={xMaat} y2={Y(kader.zMin)} className="pe-maatlijn" />
        <line x1={xMaat - 3} y1={Y(kader.zMax)} x2={xMaat + 3} y2={Y(kader.zMax)} className="pe-maatlijn" />
        <line x1={xMaat - 3} y1={Y(kader.zMin)} x2={xMaat + 3} y2={Y(kader.zMin)} className="pe-maatlijn" />
      </g>
      <text x={(X(kader.yMin) + X(kader.yMax)) / 2} y={yMaat - 4} className="pe-tekst" textAnchor="middle">
        b = {fmtMaat(bw)} mm
      </text>
      <text
        x={xMaat - 4}
        y={(Y(kader.zMax) + Y(kader.zMin)) / 2}
        className="pe-tekst"
        textAnchor="middle"
        transform={`rotate(-90 ${xMaat - 4} ${(Y(kader.zMax) + Y(kader.zMin)) / 2})`}
      >
        h = {fmtMaat(bh)} mm
      </text>
    </svg>
  );
}
