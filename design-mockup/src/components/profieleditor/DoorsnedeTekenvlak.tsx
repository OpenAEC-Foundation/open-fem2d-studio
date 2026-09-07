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
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { omhullende, type Omhullende } from "../../lib/profieleditor/geometrie";
import {
  VANG_NAAM,
  dichtstbijzijndeSnap,
  snapPunten,
  type SnapPunt,
  type VangSoort,
  type Vangst,
} from "../../lib/profieleditor/snappunten";
import { tekenItems } from "../../lib/profieleditor/tekening";
import { fmtMaat } from "../../lib/profieleditor/format";
import type { DoorsnedeOntwerp, MotorUitvoer } from "../../lib/profieleditor/types";

const W = 640;
const H = 560;
const MARGE_LINKS = 64;
const MARGE_RECHTS = 36;
const MARGE_BOVEN = 44;
const MARGE_ONDER = 30;

/**
 * Een lopende verplaats- of roteermodus (G/R). Het tekenvlak tekent hem en
 * meldt de muis; het rekenwerk en de tekst staan in ProfielEditor.
 */
export interface TekenvlakModus {
  soort: "verplaats" | "roteer";
  /** Wat er nu gebeurt, bijvoorbeeld "Verplaatsen: Δy = 40 mm, Δz = −20 mm". */
  regel: string;
  /** Tweede regel met de bediening. */
  bediening: string;
  /**
   * Draaipunt (roteren) of basispunt (verplaatsen) in modelcoördinaten, of
   * null zolang het basispunt nog aangewezen moet worden.
   */
  anker: { y: number; z: number } | null;
  /** Vergrendelde as bij verplaatsen (tekent de hulplijn). */
  asSlot?: "y" | "z" | null;
  /**
   * Het ontwerp zoals het bij de start van de modus stond. De snappunten komen
   * hieruit en niet uit de voorvertoning: anders zou een bouwsteen zich aan
   * zijn eigen meebewegende hoekpunt vastklikken.
   */
  snapOntwerp: DoorsnedeOntwerp;
  /** Bevroren zwaartepunt bij de start van de modus, om dezelfde reden. */
  snapZwaartepunt: { y: number; z: number } | null;
}

interface Props {
  ontwerp: DoorsnedeOntwerp;
  uitvoer: MotorUitvoer | null;
  verouderd: boolean;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
  /** Sleep begonnen op een bouwsteen. */
  onSleepStart: (id: string) => void;
  /**
   * Sleepverplaatsing sinds het begin, in model-mm, al gevangen op een
   * snappunt of op het raster. `vrij` betekent dat Shift ingedrukt is: dan is
   * er niets gevangen en blijft het bij hele millimeters.
   */
  onSleep: (id: string, dy: number, dz: number, vrij: boolean) => void;
  onSleepEinde: () => void;
  /** Lopende verplaats-/roteermodus, of null. */
  modus?: TekenvlakModus | null;
  /**
   * Muis in modelcoördinaten tijdens een modus, al gevangen. `vang` zegt
   * waarop, `shift` of Shift ingedrukt is (die laat ook de hoekstap los).
   */
  onModusMuis?: (y: number, z: number, vang: VangSoort, shift: boolean) => void;
  /**
   * Klikken in het tekenvlak tijdens een modus: de eerste klik legt het
   * basispunt vast, de tweede voert de bewerking uit. Het meegegeven punt is
   * de gevangen muispositie van die klik.
   */
  onModusBevestig?: (punt: { y: number; z: number }) => void;
}

/** Zoomgrenzen ten opzichte van passend in beeld. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 20;

/**
 * Hoe dicht de aanwijzer bij een snappunt moet komen voordat hij eraan
 * vastklikt, in schermeenheden van het viewBox. Bewust niet in millimeter:
 * de vangst hoort bij het beeld, zodat hij bij elke zoomstand even ver reikt.
 */
const SNAP_STRAAL = 12;

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
  modus = null,
  onModusMuis,
  onModusBevestig,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  /**
   * Lopende sleep. `basis` is het punt dat je vastpakte — al gevangen op een
   * hoekpunt, midden of hart van díé bouwsteen als je daar dichtbij genoeg
   * klikte, anders op het raster. De verplaatsing is het verschil tussen dat
   * punt en waar de muis nu op vastklikt.
   */
  const sleep = useRef<{ id: string; basis: { y: number; z: number } } | null>(null);
  /** Slepen van het vlak zelf (verschuiven van het beeld). */
  const schuif = useRef<{ x0: number; y0: number; panX: number; panY: number } | null>(null);
  /** Omhullende waarop het beeld past; bevroren zolang er een bewerking loopt. */
  const kaderVast = useRef<Omhullende | null>(null);

  // Zoom en verschuiving ten opzichte van "passend in beeld". 1 en (0,0) is
  // passend; het beeld staat daarop tot de gebruiker eraan draait.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** Waar de aanwijzer op vastklikt tijdens een modus of een sleep. */
  const [vangst, setVangst] = useState<Vangst | null>(null);
  /** Is er een sleep bezig? Alleen om de vangstmarkering te tonen. */
  const [sleept, setSleept] = useState(false);

  const items = useMemo(() => tekenItems(ontwerp, uitvoer?.delen ?? []), [ontwerp, uitvoer]);
  const kader = useMemo(() => omhullende(ontwerp, uitvoer?.delen ?? []), [ontwerp, uitvoer]);

  // Snappunten. Tijdens een modus uit het bevroren ontwerp van vóór de
  // bewerking: de voorvertoning schuift mee met de muis, en een punt dat
  // meeschuift is geen mikpunt maar een terugkoppeling.
  const modusSnapOntwerp = modus?.snapOntwerp;
  const modusSnapZwaartepunt = modus?.snapZwaartepunt;
  const snapLijst = useMemo(() => {
    const bron = modusSnapOntwerp ?? ontwerp;
    const zp = modusSnapOntwerp
      ? (modusSnapZwaartepunt ?? null)
      : uitvoer
        ? { y: uitvoer.y_c_mm, z: uitvoer.z_c_mm }
        : null;
    return snapPunten(bron, uitvoer?.delen ?? [], zp);
  }, [modusSnapOntwerp, modusSnapZwaartepunt, ontwerp, uitvoer]);

  if (!kader || items.length === 0) {
    return (
      <div className="pe-tekenvlak-leeg">
        Nog niets getekend. Kies links een startvorm of voeg een lamel toe.
      </div>
    );
  }

  // Tijdens een bewerking staat het beeld stil. De voorvertoning verandert de
  // buitenmaten, en een tekening die onder de aanwijzer vandaan schaalt is niet
  // aan te wijzen: je mikt op een hoekpunt dat tijdens het mikken wegloopt. Bij
  // het loslaten past het beeld zich in één keer aan.
  const bezig = !!modus || sleept;
  if (!bezig) kaderVast.current = kader;
  const beeldKader = (bezig && kaderVast.current) || kader;

  // Passend maken: buitenmaten met een kleine marge.
  const bw = Math.max(kader.yMax - kader.yMin, 1);
  const bh = Math.max(kader.zMax - kader.zMin, 1);
  const passW = Math.max(beeldKader.yMax - beeldKader.yMin, 1);
  const passH = Math.max(beeldKader.zMax - beeldKader.zMin, 1);
  const tekenW = W - MARGE_LINKS - MARGE_RECHTS;
  const tekenH = H - MARGE_BOVEN - MARGE_ONDER;
  // Passende schaal en oorsprong; zoom en verschuiving komen daar bovenop.
  const sPassend = Math.min(tekenW / (passW * 1.12), tekenH / (passH * 1.12));
  const oxPassend = MARGE_LINKS + (tekenW - passW * sPassend) / 2 - beeldKader.yMin * sPassend;
  const oyPassend = MARGE_BOVEN + (tekenH - passH * sPassend) / 2 + beeldKader.zMax * sPassend;
  const s = sPassend * zoom;
  // Bij zoomen om het midden blijft het midden van het passende beeld staan.
  const ox = oxPassend + (W / 2 - oxPassend) * (1 - zoom) + pan.x;
  const oy = oyPassend + (H / 2 - oyPassend) * (1 - zoom) + pan.y;
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

  /** Schermpunt → modelcoördinaten (mm). */
  const naarModel = (p: { x: number; y: number }) => ({ y: (p.x - ox) / s, z: (oy - p.y) / s });

  /**
   * De aanwijzer vangen: eerst op een snappunt van de tekening, anders op het
   * raster dat in beeld staat. Shift laat allebei los.
   *
   * De volgorde is de bedoeling: een hoekpunt van een plaat wint van de
   * rasterlijn er vlak naast, want dáár wil je op landen. `filter` beperkt de
   * kandidaten — tijdens het slepen op de punten van de bouwsteen zelf (het
   * vastpakken) en juist op alle andere (het neerzetten).
   */
  const vang = (
    px: number,
    py: number,
    shift: boolean,
    filter?: (p: SnapPunt) => boolean,
  ): Vangst => {
    const my = (px - ox) / s;
    const mz = (oy - py) / s;
    if (shift) return { y: my, z: mz, soort: "vrij" };
    const kandidaten = filter ? snapLijst.filter(filter) : snapLijst;
    const p = dichtstbijzijndeSnap(kandidaten, (y, z) => [X(y), Y(z)], px, py, SNAP_STRAAL);
    if (p) return { y: p.y, z: p.z, soort: p.soort };
    return { y: Math.round(my / stap) * stap, z: Math.round(mz / stap) * stap, soort: "raster" };
  };

  /**
   * Vangen tijdens een modus. Roteren blijft ongemoeid: daar mikt de muis op
   * een hoek en niet op een punt, en die hoek landt op stappen van 15°.
   */
  const vangVoorModus = (e: ReactPointerEvent): Vangst => {
    const p = naarViewBox(e);
    if (modus?.soort === "roteer") return { ...naarModel(p), soort: "vrij" };
    return vang(p.x, p.y, e.shiftKey);
  };

  /** Oorsprong bij een gegeven zoom, zonder verschuiving. */
  const oxBij = (z: number) => W / 2 - (W / 2 - oxPassend) * z;
  const oyBij = (z: number) => H / 2 + (oyPassend - H / 2) * z;

  /**
   * Wielen zoomt om de muisaanwijzer: het punt van de doorsnede dat onder de
   * cursor ligt blijft daar staan. Dat is waar je op inzoomt, dus dat hoort
   * niet weg te schuiven.
   */
  const opWiel = (e: ReactWheelEvent) => {
    const p = naarViewBox(e as unknown as ReactPointerEvent);
    const nieuw = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (nieuw === zoom) return;
    const my = (p.x - ox) / s;
    const mz = (oy - p.y) / s;
    const s2 = sPassend * nieuw;
    setPan({ x: p.x - my * s2 - oxBij(nieuw), y: p.y + mz * s2 - oyBij(nieuw) });
    setZoom(nieuw);
  };

  const passend = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const opItemDown = (id: string, sleepbaar: boolean) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    // Tijdens een verplaats-/roteermodus wijst elke klik een punt aan;
    // selecteren en slepen zijn dan niet aan de beurt.
    if (modus) {
      const v = vangVoorModus(e);
      setVangst(v);
      onModusBevestig?.(v);
      return;
    }
    onSelecteer(id);
    if (!sleepbaar) return;
    const p = naarViewBox(e);
    // Het punt dat je vastpakt: een hoekpunt, zijdemidden of hart van déze
    // bouwsteen als je daar dichtbij genoeg klikte, anders het raster. Zo
    // landt de hoek die je oppakt straks precies op de hoek die je aanwijst.
    const basis = vang(p.x, p.y, e.shiftKey, (q) => q.id === id);
    sleep.current = { id, basis };
    setVangst(basis);
    setSleept(true);
    svgRef.current?.setPointerCapture(e.pointerId);
    onSleepStart(id);
  };

  /** Slepen op de achtergrond verschuift het beeld. */
  const opVlakDown = (e: ReactPointerEvent) => {
    if (modus) {
      const v = vangVoorModus(e);
      setVangst(v);
      onModusBevestig?.(v);
      return;
    }
    onSelecteer(null);
    const p = naarViewBox(e);
    schuif.current = { x0: p.x, y0: p.y, panX: pan.x, panY: pan.y };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const opMove = (e: ReactPointerEvent) => {
    if (modus) {
      const v = vangVoorModus(e);
      setVangst(v);
      onModusMuis?.(v.y, v.z, v.soort, e.shiftKey);
      return;
    }
    if (schuif.current) {
      const p = naarViewBox(e);
      setPan({
        x: schuif.current.panX + (p.x - schuif.current.x0),
        y: schuif.current.panY + (p.y - schuif.current.y0),
      });
      return;
    }
    if (!sleep.current) return;
    const p = naarViewBox(e);
    const sl = sleep.current;
    // Neerzetten: vangen op de punten van al het andere — de bouwsteen die
    // meebeweegt en het zwaartepunt dat met hem meeschuift zijn geen mikpunt.
    // Shift laat alle vangst los; dan blijft het bij hele millimeters.
    const doel = vang(p.x, p.y, e.shiftKey, (q) => q.id !== sl.id && q.soort !== "zwaartepunt");
    setVangst(doel);
    onSleep(sl.id, doel.y - sl.basis.y, doel.z - sl.basis.z, e.shiftKey);
  };

  const opUp = (e: ReactPointerEvent) => {
    const losmaken = () => {
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // al losgelaten
      }
    };
    if (schuif.current) {
      schuif.current = null;
      losmaken();
      return;
    }
    if (!sleep.current) return;
    sleep.current = null;
    setSleept(false);
    setVangst(null);
    losmaken();
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
      className={`pe-tekenvlak${verouderd ? " verouderd" : ""}${modus ? " pe-modus" : ""}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={opVlakDown}
      onPointerMove={opMove}
      onPointerUp={opUp}
      onPointerCancel={opUp}
      onWheel={opWiel}
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
        raster {stap} mm · snap op punten en raster (Shift = vrij)
      </text>

      {/* Zoomregelaar linksonder: percentage en terug naar passend. */}
      <g className="pe-zoombalk">
        <text x={6} y={H - 6} className="pe-tekst">
          zoom {Math.round(zoom * 100)}%
        </text>
        {zoom !== 1 && (
          <g onPointerDown={(e) => { e.stopPropagation(); passend(); }} style={{ cursor: "pointer" }}>
            <rect x={62} y={H - 18} width={54} height={15} rx={3} className="pe-knopvlak" />
            <text x={89} y={H - 6} className="pe-tekst" textAnchor="middle">
              passend
            </text>
          </g>
        )}
      </g>

      {/* Materiaal en gaten, in modelcoördinaten */}
      <g transform={`translate(${ox} ${oy}) scale(${s} ${-s})`}>
        {items.map((it) => {
          const actief = geselecteerd === it.id;
          const isGat = it.soort === "gat";
          const isLas = it.soort === "las";
          const vast = it.soort === "basis";
          const klasse = isGat
            ? `pe-gat${actief ? " actief" : ""}`
            : isLas
              ? `pe-las${actief ? " actief" : ""}`
              : `pe-materiaal${vast ? " pe-vast" : ""}${actief ? " actief" : ""}`;
          return (
            <path
              key={`${it.soort}-${it.id}`}
              d={it.d}
              transform={it.transform}
              fillRule={it.fillRule}
              className={klasse}
              // Een lasnaad zit vast aan de twee platen die hij verbindt; hij is
              // wel aan te klikken (om hem in de lijst op te lichten) maar niet
              // los te slepen.
              onPointerDown={opItemDown(it.id, !vast && !isLas)}
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

      {/* Waar de aanwijzer op vastklikt: markering met het soort punt erbij. */}
      {vangst && vangst.soort !== "vrij" && (modus || sleept) && (
        <VangstMerk vangst={vangst} x={X(vangst.y)} y={Y(vangst.z)} />
      )}

      {/* Verplaats-/roteermodus: anker- of basispunt, hulplijn en de regel. */}
      {modus && (
        <g className="pe-modus-laag">
          {modus.anker && vangst && (
            <line
              x1={X(modus.anker.y)}
              y1={Y(modus.anker.z)}
              x2={X(vangst.y)}
              y2={Y(vangst.z)}
              className="pe-modus-lijn"
            />
          )}
          {modus.anker && modus.soort === "verplaats" && modus.asSlot === "y" && (
            <line x1={0} y1={Y(modus.anker.z)} x2={W} y2={Y(modus.anker.z)} className="pe-modus-lijn" />
          )}
          {modus.anker && modus.soort === "verplaats" && modus.asSlot === "z" && (
            <line x1={X(modus.anker.y)} y1={0} x2={X(modus.anker.y)} y2={H} className="pe-modus-lijn" />
          )}
          {modus.anker && (
            <>
              <circle cx={X(modus.anker.y)} cy={Y(modus.anker.z)} r={5} className="pe-modus-anker" />
              <line
                x1={X(modus.anker.y) - 9}
                y1={Y(modus.anker.z)}
                x2={X(modus.anker.y) + 9}
                y2={Y(modus.anker.z)}
                className="pe-modus-anker"
              />
              <line
                x1={X(modus.anker.y)}
                y1={Y(modus.anker.z) - 9}
                x2={X(modus.anker.y)}
                y2={Y(modus.anker.z) + 9}
                className="pe-modus-anker"
              />
            </>
          )}
          <rect x={0} y={0} width={W} height={32} className="pe-modus-band" />
          <text x={W / 2} y={14} className="pe-modus-regel" textAnchor="middle">
            {modus.regel}
          </text>
          <text x={W / 2} y={26} className="pe-modus-bediening" textAnchor="middle">
            {modus.bediening}
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * De markering op het punt waar de aanwijzer aan vastklikt, met een symbool
 * dat het soort punt verraadt — zoals in een tekenpakket: een vierkantje voor
 * een hoekpunt, een driehoekje voor een midden, een cirkeltje voor een hart
 * en een cirkel met kruis voor het zwaartepunt. Het raster krijgt een klein
 * kruisje zonder naam; er is niets aan te wijzen wat je nog niet zag.
 */
function VangstMerk({ vangst, x, y }: { vangst: Vangst; x: number; y: number }) {
  const r = 5;
  return (
    <g className="pe-snap-laag">
      {vangst.soort === "hoek" && (
        <rect x={x - r} y={y - r} width={2 * r} height={2 * r} className="pe-snap" />
      )}
      {vangst.soort === "midden" && (
        <path d={`M ${x} ${y - r - 1} L ${x + r + 1} ${y + r} L ${x - r - 1} ${y + r} Z`} className="pe-snap" />
      )}
      {vangst.soort === "hart" && <circle cx={x} cy={y} r={r} className="pe-snap" />}
      {vangst.soort === "zwaartepunt" && (
        <>
          <circle cx={x} cy={y} r={r + 1} className="pe-snap" />
          <line x1={x - r - 3} y1={y} x2={x + r + 3} y2={y} className="pe-snap" />
          <line x1={x} y1={y - r - 3} x2={x} y2={y + r + 3} className="pe-snap" />
        </>
      )}
      {vangst.soort === "raster" && (
        <>
          <line x1={x - 4} y1={y} x2={x + 4} y2={y} className="pe-snap" />
          <line x1={x} y1={y - 4} x2={x} y2={y + 4} className="pe-snap" />
        </>
      )}
      {vangst.soort !== "raster" && vangst.soort !== "vrij" && (
        <text x={x + r + 4} y={y - r - 2} className="pe-snap-tekst">
          {VANG_NAAM[vangst.soort]}
        </text>
      )}
    </g>
  );
}
