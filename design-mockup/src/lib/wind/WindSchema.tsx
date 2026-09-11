/**
 * WindSchema — de twee tekeningen van het windvenster.
 *
 *  • DoorsnedeSchema: het spant zoals de generator het las (gevel, dak,
 *    overstek, vloer), met de windrichting, de bouwmaten h en d, bij een kap
 *    zonder gevel de gedachte gevels eronder, en per staaf de pijlen van het
 *    gekozen belastinggeval: druk tegen het vlak in, zuiging ervanaf.
 *  • PlattegrondSchema: het gebouw van boven — lengte b, spanwijdte d, de
 *    spanten op h.o.h., het gekozen spant uitgelicht op zijn afstand tot de
 *    kopgevel, en de windrichtingen als pijlen.
 *
 * Pure componenten: alles komt uit props, niets uit een store. Zo zijn ze
 * met react-dom/server te toetsen (test-wind-schema.mjs) en tekenen ze in
 * het rapport hetzelfde als in het venster. Assen: x naar rechts, z omhoog,
 * meters; het SVG-stelsel klapt z om.
 */
import type { BeamLoadRole } from "../../components/fem/femTypes";
import type { VlakRegel, WindGeometrie, Windrichting } from "./windGenerator";

const nl = (v: number, d: number) => v.toFixed(d).replace(".", ",");

/** Kleur per staafrol — dezelfde betekenis als in de tekening van het model. */
export const ROL_KLEUR: Record<BeamLoadRole, string> = {
  gevelLinks: "#2563eb",
  gevelRechts: "#2563eb",
  dakPlat: "#16a34a",
  dakHellend: "#16a34a",
  overstek: "#d97706",
  vloer: "#9ca3af",
  binnen: "#9ca3af",
};

export const KLEUR_DRUK = "#2563eb";
export const KLEUR_ZUIGING = "#dc2626";
export const KLEUR_WIND = "#0891b2";

/**
 * Buitennormaal van een staaf voor de pijlen — dezelfde regel als de
 * generator: een gevel wijst naar buiten, een dak of overstek heeft de
 * transversale as met positieve z.
 */
function buitennormaal(s: { rol: BeamLoadRole; x1: number; z1: number; x2: number; z2: number }) {
  if (s.rol === "gevelLinks") return { nx: -1, nz: 0 };
  if (s.rol === "gevelRechts") return { nx: 1, nz: 0 };
  const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
  const L = Math.hypot(dx, dz) || 1;
  const tx = -dz / L, tz = dx / L;
  return tz >= 0 ? { nx: tx, nz: tz } : { nx: -tx, nz: -tz };
}

export interface DoorsnedeSchemaProps {
  geometrie: WindGeometrie;
  /** Windrichting van het getoonde geval; null = geen pijl. */
  richting: Windrichting | null;
  /** De vlakregels van het getoonde geval; leeg = alleen de constructie. */
  regels?: readonly VlakRegel[];
  /** Gevelhoogte in m bij een kap zonder gevel; getekend als gedachte wand. */
  gevelhoogte_m?: number | null;
  breedtePx?: number;
}

export function DoorsnedeSchema({
  geometrie: g, richting, regels = [], gevelhoogte_m = null, breedtePx = 440,
}: DoorsnedeSchemaProps) {
  const gevel = g.kapZonderGevel && gevelhoogte_m ? gevelhoogte_m : 0;
  const xs = g.staven.flatMap((s) => [s.x1, s.x2]);
  const zs = g.staven.flatMap((s) => [s.z1, s.z2]);
  const minX = Math.min(g.xLinks_m, ...xs), maxX = Math.max(g.xRechts_m, ...xs);
  const minZ = Math.min(...zs) - gevel, maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 0.1), spanZ = Math.max(maxZ - minZ, 0.1);
  // Marges: links/rechts ruimte voor de windpijl en de hoogtemaat, onder voor
  // de breedtemaat en de grondlijn.
  const M = { l: 56, r: 40, t: 22, b: 30 };
  const tekenW = breedtePx - M.l - M.r;
  const schaal = Math.min(tekenW / spanX, 170 / spanZ);
  const hoogtePx = Math.max(120, spanZ * schaal + M.t + M.b);
  const sx = (x: number) => M.l + (x - minX) * schaal;
  const sy = (z: number) => M.t + (maxZ - z) * schaal;
  const y0 = sy(minZ);

  // Pijlen per regel: op het midden van het belaste deel van de staaf.
  const pijlen = regels.flatMap((r, i) => {
    const s = g.staven.find((st) => st.beamId === r.beamId);
    if (!s || Math.abs(r.w_kNm2) < 1e-9) return [];
    const a = r.startFrac ?? 0, b = r.endFrac ?? 1;
    const f = (a + b) / 2;
    const px = s.x1 + (s.x2 - s.x1) * f, pz = s.z1 + (s.z2 - s.z1) * f;
    const n = buitennormaal(s);
    const druk = r.w_kNm2 > 0;
    const lengte = 14 + Math.min(22, Math.abs(r.w_kNm2) * 12);
    // Druk: de pijl komt van buiten en wijst het vlak in (punt op het vlak).
    // Zuiging: de pijl staat op het vlak en wijst naar buiten.
    const cx = sx(px), cy = sy(pz);
    const ex = cx + n.nx * lengte, ey = cy - n.nz * lengte;
    const van = druk ? { x: ex, y: ey } : { x: cx, y: cy };
    const naar = druk ? { x: cx, y: cy } : { x: ex, y: ey };
    return [{
      key: `${r.beamId}-${i}`, van, naar, druk,
      label: `${r.zone.replace(/ \(.*\)$/, "")} ${nl(Math.abs(r.q_kNm), 2)}`,
      lx: ex + n.nx * 8, ly: ey - n.nz * 8,
    }];
  });

  const windY = sy((minZ + maxZ) / 2 + gevel / 2);
  return (
    <svg
      className="wgd-schema"
      viewBox={`0 0 ${breedtePx} ${hoogtePx.toFixed(0)}`}
      role="img"
      aria-label={`Doorsnede van het spant, h = ${nl(g.h_m, 2)} m, d = ${nl(g.d_m, 2)} m`}
    >
      <defs>
        <marker id="wgd-pijl" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
        </marker>
      </defs>

      {/* Grondlijn */}
      <line x1={M.l - 30} y1={y0} x2={breedtePx - M.r + 20} y2={y0} stroke="var(--theme-text-faint, #888)" strokeWidth="1" />
      {Array.from({ length: 12 }, (_, k) => (
        <line key={`g${k}`} x1={M.l - 26 + k * ((breedtePx - M.l - M.r + 46) / 11)} y1={y0} x2={M.l - 32 + k * ((breedtePx - M.l - M.r + 46) / 11)} y2={y0 + 6} stroke="var(--theme-text-faint, #888)" strokeWidth="0.7" />
      ))}

      {/* Kap zonder gevel: de gedachte gevels als gestreepte wanden */}
      {gevel > 0 && (
        <g className="wgd-gedachte-gevel" stroke={ROL_KLEUR.gevelLinks} strokeWidth="1.4" strokeDasharray="5 4" fill="none">
          <line x1={sx(g.xLinks_m)} y1={sy(minZ + gevel)} x2={sx(g.xLinks_m)} y2={y0} />
          <line x1={sx(g.xRechts_m)} y1={sy(minZ + gevel)} x2={sx(g.xRechts_m)} y2={y0} />
          <text x={sx(g.xLinks_m) - 6} y={(sy(minZ + gevel) + y0) / 2} fontSize="9" textAnchor="end" stroke="none" fill={ROL_KLEUR.gevelLinks}>
            {`gevel ${nl(gevel, 2)} m`}
          </text>
        </g>
      )}

      {/* De staven, gekleurd naar rol */}
      {g.staven.map((s) => (
        <line
          key={s.beamId}
          x1={sx(s.x1)} y1={sy(s.z1)} x2={sx(s.x2)} y2={sy(s.z2)}
          stroke={ROL_KLEUR[s.rol]}
          strokeWidth={s.rol === "vloer" || s.rol === "binnen" ? 1.5 : 3}
          strokeLinecap="round"
          className={`wgd-staaf wgd-rol-${s.rol}`}
        >
          <title>{`Staaf ${s.beamId} — ${s.rol}`}</title>
        </line>
      ))}

      {/* Windpijl */}
      {richting === "links" && (
        <line x1={M.l - 48} y1={windY} x2={sx(minX) - 10} y2={windY} stroke={KLEUR_WIND} strokeWidth="2.2" markerEnd="url(#wgd-pijl)" className="wgd-wind" />
      )}
      {richting === "rechts" && (
        <line x1={breedtePx - M.r + 30} y1={windY} x2={sx(maxX) + 10} y2={windY} stroke={KLEUR_WIND} strokeWidth="2.2" markerEnd="url(#wgd-pijl)" className="wgd-wind" />
      )}
      {richting === "haaks" && (
        <g className="wgd-wind" transform={`translate(${M.l - 30} ${windY})`}>
          <circle r="7" fill="none" stroke={KLEUR_WIND} strokeWidth="1.8" />
          <line x1="-5" y1="-5" x2="5" y2="5" stroke={KLEUR_WIND} strokeWidth="1.8" />
          <line x1="-5" y1="5" x2="5" y2="-5" stroke={KLEUR_WIND} strokeWidth="1.8" />
          <title>Wind haaks op het spant (het vlak in)</title>
        </g>
      )}

      {/* Druk- en zuigpijlen van het geval */}
      {pijlen.map((p) => (
        <g key={p.key} className={p.druk ? "wgd-druk" : "wgd-zuiging"}>
          <line x1={p.van.x} y1={p.van.y} x2={p.naar.x} y2={p.naar.y}
            stroke={p.druk ? KLEUR_DRUK : KLEUR_ZUIGING} strokeWidth="1.6" markerEnd="url(#wgd-pijl)" />
          <text x={p.lx} y={p.ly + 3} fontSize="8" textAnchor="middle" fill={p.druk ? KLEUR_DRUK : KLEUR_ZUIGING}>
            {p.label}
          </text>
        </g>
      ))}

      {/* Maten: d onder, h rechts */}
      <g stroke="var(--theme-text-faint, #888)" strokeWidth="0.8" fill="var(--theme-text-muted, #666)" fontSize="9">
        <line x1={sx(g.xLinks_m)} y1={y0 + 16} x2={sx(g.xRechts_m)} y2={y0 + 16} />
        <line x1={sx(g.xLinks_m)} y1={y0 + 12} x2={sx(g.xLinks_m)} y2={y0 + 20} />
        <line x1={sx(g.xRechts_m)} y1={y0 + 12} x2={sx(g.xRechts_m)} y2={y0 + 20} />
        <text x={(sx(g.xLinks_m) + sx(g.xRechts_m)) / 2} y={y0 + 27} textAnchor="middle" stroke="none">{`d = ${nl(g.d_m, 2)} m`}</text>
        <line x1={sx(maxX) + 18} y1={sy(maxZ)} x2={sx(maxX) + 18} y2={y0} />
        <line x1={sx(maxX) + 14} y1={sy(maxZ)} x2={sx(maxX) + 22} y2={sy(maxZ)} />
        <line x1={sx(maxX) + 14} y1={y0} x2={sx(maxX) + 22} y2={y0} />
        <text x={sx(maxX) + 24} y={(sy(maxZ) + y0) / 2 + 3} stroke="none">{`h = ${nl(g.h_m, 2)} m`}</text>
      </g>
    </svg>
  );
}

export interface PlattegrondSchemaProps {
  gebouwlengte_m: number;
  d_m: number;
  hoh_m: number;
  positie: "tussenspant" | "kopgevelspant";
  afstandTotKopgevel_m: number;
  richtingLinks: boolean;
  richtingRechts: boolean;
  richtingHaaks: boolean;
  /** e = min(b; 2h) — de randzone e/4 wordt licht gearceerd. */
  e_m?: number;
  breedtePx?: number;
}

export function PlattegrondSchema({
  gebouwlengte_m: b, d_m: d, hoh_m, positie, afstandTotKopgevel_m, richtingLinks, richtingRechts, richtingHaaks,
  e_m, breedtePx = 440,
}: PlattegrondSchemaProps) {
  const M = { l: 40, r: 40, t: 26, b: 22 };
  const tekenW = breedtePx - M.l - M.r;
  const schaal = Math.min(tekenW / Math.max(b, 0.1), 110 / Math.max(d, 0.1));
  const wPx = b * schaal, hPx = d * schaal;
  const hoogtePx = hPx + M.t + M.b;
  const x0 = M.l + (tekenW - wPx) / 2, y0 = M.t;
  // Spanten: langs de lengte, om de h.o.h. — het uitgelichte spant op zijn
  // afstand tot de (linker) kopgevel, of óp de kopgevel.
  const aantal = hoh_m > 0 ? Math.floor(b / hoh_m + 1e-9) : 0;
  const spanten = Array.from({ length: Math.min(aantal + 1, 60) }, (_, k) => k * hoh_m).filter((y) => y <= b + 1e-9);
  const ditSpant = positie === "kopgevelspant" ? 0 : Math.min(Math.max(afstandTotKopgevel_m, 0), b);
  const sx = (y: number) => x0 + y * schaal;
  const eRand = e_m && e_m > 0 ? Math.min(e_m / 4, b) : 0;
  return (
    <svg className="wgd-schema" viewBox={`0 0 ${breedtePx} ${hoogtePx.toFixed(0)}`} role="img"
      aria-label={`Plattegrond, gebouwlengte ${nl(b, 1)} m, spanwijdte ${nl(d, 1)} m`}>
      <defs>
        <marker id="wgd-pijl2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
        </marker>
      </defs>
      {/* Randzone e/4 aan beide kopgevels (zone F op het dak, A op de gevel) */}
      {eRand > 0 && (
        <g className="wgd-randzone" fill="var(--theme-accent, #d97706)" opacity="0.12">
          <rect x={x0} y={y0} width={eRand * schaal} height={hPx} />
          <rect x={x0 + wPx - eRand * schaal} y={y0} width={eRand * schaal} height={hPx} />
        </g>
      )}
      <rect x={x0} y={y0} width={wPx} height={hPx} fill="none" stroke="var(--theme-text-secondary, #555)" strokeWidth="1.2" />
      {spanten.map((y) => (
        <line key={y} x1={sx(y)} y1={y0} x2={sx(y)} y2={y0 + hPx} stroke="var(--theme-text-faint, #999)" strokeWidth="0.8" className="wgd-spant" />
      ))}
      <line x1={sx(ditSpant)} y1={y0 - 4} x2={sx(ditSpant)} y2={y0 + hPx + 4} stroke="var(--theme-accent, #d97706)" strokeWidth="3" strokeLinecap="round" className="wgd-dit-spant">
        <title>{positie === "kopgevelspant" ? "Kopgevelspant" : `Tussenspant op ${nl(ditSpant, 1)} m van de kopgevel`}</title>
      </line>
      {/* Windrichtingen: links/rechts in het vlak van het spant (van onder en boven in de plattegrond), haaks langs de lengte */}
      {richtingLinks && (
        <line x1={sx(ditSpant)} y1={y0 + hPx + 20} x2={sx(ditSpant)} y2={y0 + hPx + 6} stroke={KLEUR_WIND} strokeWidth="2" markerEnd="url(#wgd-pijl2)" className="wgd-wind" />
      )}
      {richtingRechts && (
        <line x1={sx(ditSpant)} y1={y0 - 20} x2={sx(ditSpant)} y2={y0 - 6} stroke={KLEUR_WIND} strokeWidth="2" markerEnd="url(#wgd-pijl2)" className="wgd-wind" />
      )}
      {richtingHaaks && (
        <line x1={x0 - 30} y1={y0 + hPx / 2} x2={x0 - 6} y2={y0 + hPx / 2} stroke={KLEUR_WIND} strokeWidth="2" markerEnd="url(#wgd-pijl2)" className="wgd-wind" />
      )}
      <g fill="var(--theme-text-muted, #666)" fontSize="9">
        <text x={x0 + wPx / 2} y={y0 + hPx + 18} textAnchor="middle">{`b = ${nl(b, 1)} m · h.o.h. ${nl(hoh_m, 2)} m`}</text>
        <text x={x0 + wPx + 6} y={y0 + hPx / 2 + 3}>{`d = ${nl(d, 1)} m`}</text>
        {positie === "tussenspant" && (
          <text x={sx(ditSpant)} y={y0 - 8} textAnchor="middle" fill="var(--theme-accent, #d97706)">{`${nl(ditSpant, 1)} m`}</text>
        )}
      </g>
    </svg>
  );
}
