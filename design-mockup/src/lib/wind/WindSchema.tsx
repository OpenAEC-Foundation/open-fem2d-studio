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
 *  • Bij een vrijstaand dak (§7.3) tekent de doorsnede de zones A/B/C/D
 *    boven het dak en bij een c_f-geval de resultante op zijn aangrijpingspunt;
 *    de plattegrond toont de zones van tabel 7.6/7.7, en BlokkeringSchema
 *    laat zien wat de blokkering φ betekent.
 *
 * Pure componenten: alles komt uit props, niets uit een store. Zo zijn ze
 * met react-dom/server te toetsen (test-wind-schema.mjs) en tekenen ze in
 * het rapport hetzelfde als in het venster. Assen: x naar rechts, z omhoog,
 * meters; het SVG-stelsel klapt z om.
 */
import { useTranslation } from "react-i18next";
import { formatLength, type LengthUnit } from "../lengthInput";
import { BEAM_LOAD_ROLE_SLEUTEL, type BeamLoadRole } from "../../components/fem/femTypes";
import type { VlakRegel, WindGeometrie, Windrichting } from "./windGenerator";
import type { OverkappingDakvorm, OverkappingZone } from "./windEurocode";

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
export const KLEUR_RESULTANTE = "#7c3aed";

/** Vlakkleur per zone van een vrijstaand dak (tabel 7.6/7.7). */
export const ZONE_KLEUR: Record<OverkappingZone, string> = {
  A: "#bbf7d0",
  B: "#fca5a5",
  C: "#fdba74",
  D: "#c4b5fd",
};

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
  /** Vrijstaand dak, c_f-geval: de resultante(n) van het getoonde geval. */
  resultanten?: readonly { x_m: number; z_m: number; F_kN: number }[];
  breedtePx?: number;
  /** Invoervenster gebruikt mm; bestaande alleen-lezen afnemers behouden m. */
  lengthUnit?: LengthUnit;
}

export function DoorsnedeSchema({
  geometrie: g, richting, regels = [], gevelhoogte_m = null, resultanten = [], breedtePx = 440, lengthUnit = "m",
}: DoorsnedeSchemaProps) {
  const { t } = useTranslation("common");
  const maat = (m: number, d: number) => lengthUnit === "mm" ? formatLength(m, "m") : nl(m, d);
  const vrij = g.vrijstaand;
  // Onder het model: de gedachte gevel van een kap zonder gevel, of bij een
  // vrijstaand dak het stuk tussen het model en de opgegeven hoogte h.
  const gevel = vrij
    ? Math.max(0, g.h_m - g.modelhoogte_m)
    : (g.kapZonderGevel && gevelhoogte_m ? gevelhoogte_m : 0);
  const xs = g.staven.flatMap((s) => [s.x1, s.x2]);
  const zs = g.staven.flatMap((s) => [s.z1, s.z2]);
  const minX = Math.min(g.xLinks_m, ...xs), maxX = Math.max(g.xRechts_m, ...xs);
  const minZ = Math.min(...zs) - gevel, maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 0.1), spanZ = Math.max(maxZ - minZ, 0.1);
  // Marges: links/rechts ruimte voor de windpijl en de hoogtemaat, onder voor
  // de breedtemaat en de grondlijn.
  const M = { l: 56, r: 40, t: vrij ? 40 : 22, b: 30 };
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
    const lengte = 14 + Math.min(22, Math.abs(r.w_kNm2) * 12);
    // Wrijving en kolomwind: de pijl wijst in de richting van de kracht en
    // eindigt op de staaf; een normaal van het vlak zegt hier niets.
    if (r.krachtRichting) {
      const cx = sx(px), cy = sy(pz);
      const { x: kx, z: kz } = r.krachtRichting;
      const bx = cx - kx * lengte, by = cy + kz * lengte;
      return [{
        key: `${r.beamId}-${i}`, van: { x: bx, y: by }, naar: { x: cx, y: cy }, druk: true,
        label: `${r.zone} ${nl(Math.abs(r.q_kNm), 2)}`,
        lx: bx - kx * 8, ly: by + kz * 8,
      }];
    }
    const n = buitennormaal(s);
    const druk = r.w_kNm2 > 0;
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
      aria-label={t("wind.schema.sectionAria", { unit: lengthUnit, h: maat(g.h_m, 2), d: maat(g.d_m, 2) })}
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

      {/* Vrijstaand dak: de zones als band boven het dak */}
      {vrij && (
        <g className="wgd-zones">
          {vrij.zones.map((z, k) => (
            <g key={k} className={`wgd-zone wgd-zone-${z.zone}`}>
              <rect x={sx(z.van_m)} y={6} width={Math.max(1, (z.tot_m - z.van_m) * schaal)} height={14}
                fill={ZONE_KLEUR[z.zone]} stroke="var(--theme-bg, #fff)" strokeWidth="1" />
              <text x={sx((z.van_m + z.tot_m) / 2)} y={16.5} fontSize="9" fontWeight="600" textAnchor="middle" fill="#1f2937">{z.zone}</text>
            </g>
          ))}
        </g>
      )}
      {vrij && gevel > 0 && (
        <g className="wgd-gedachte-kolom" stroke="var(--theme-text-faint, #888)" strokeWidth="1.2" strokeDasharray="5 4">
          <line x1={sx(g.xLinks_m)} y1={sy(minZ + gevel)} x2={sx(g.xLinks_m)} y2={y0} />
          <line x1={sx(g.xRechts_m)} y1={sy(minZ + gevel)} x2={sx(g.xRechts_m)} y2={y0} />
        </g>
      )}

      {/* Kap zonder gevel: de gedachte gevels als gestreepte wanden */}
      {!vrij && gevel > 0 && (
        <g className="wgd-gedachte-gevel" stroke={ROL_KLEUR.gevelLinks} strokeWidth="1.4" strokeDasharray="5 4" fill="none">
          <line x1={sx(g.xLinks_m)} y1={sy(minZ + gevel)} x2={sx(g.xLinks_m)} y2={y0} />
          <line x1={sx(g.xRechts_m)} y1={sy(minZ + gevel)} x2={sx(g.xRechts_m)} y2={y0} />
          <text x={sx(g.xLinks_m) - 6} y={(sy(minZ + gevel) + y0) / 2} fontSize="9" textAnchor="end" stroke="none" fill={ROL_KLEUR.gevelLinks}>
            {t("wind.schema.wallHeight", { unit: lengthUnit, h: maat(gevel, 2) })}
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
          <title>{t("wind.schema.beamTitle", { id: s.beamId, rol: t(BEAM_LOAD_ROLE_SLEUTEL[s.rol]) })}</title>
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
          <title>{t("wind.schema.windPerpendicular")}</title>
        </g>
      )}

      {richting === "alle" && (
        <g className="wgd-wind">
          <line x1={M.l - 50} y1={windY} x2={sx(minX) - 10} y2={windY} stroke={KLEUR_WIND} strokeWidth="2.2"
            markerStart="url(#wgd-pijl)" markerEnd="url(#wgd-pijl)" />
          <title>{t("wind.schema.allDirections")}</title>
        </g>
      )}

      {/* Vrijstaand dak, c_f-geval: de resultante op zijn aangrijpingspunt */}
      {resultanten.map((r, k) => {
        const cx = sx(r.x_m), cy = sy(r.z_m);
        const neer = r.F_kN >= 0;
        const van = neer ? { x: cx, y: cy - 38 } : { x: cx, y: cy };
        const naar = neer ? { x: cx, y: cy - 2 } : { x: cx, y: cy - 36 };
        return (
          <g key={`res${k}`} className="wgd-resultante">
            <line x1={van.x} y1={van.y} x2={naar.x} y2={naar.y} stroke={KLEUR_RESULTANTE} strokeWidth="2.6" markerEnd="url(#wgd-pijl)" />
            <text x={cx + 6} y={cy - 40} fontSize="9" fontWeight="600" fill={KLEUR_RESULTANTE}>
              {`F = ${nl(Math.abs(r.F_kN), 2)} kN`}
            </text>
          </g>
        );
      })}

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
        <text x={(sx(g.xLinks_m) + sx(g.xRechts_m)) / 2} y={y0 + 27} textAnchor="middle" stroke="none">{`d = ${maat(g.d_m, 2)} ${lengthUnit}`}</text>
        <line x1={sx(maxX) + 18} y1={sy(maxZ)} x2={sx(maxX) + 18} y2={y0} />
        <line x1={sx(maxX) + 14} y1={sy(maxZ)} x2={sx(maxX) + 22} y2={sy(maxZ)} />
        <line x1={sx(maxX) + 14} y1={y0} x2={sx(maxX) + 22} y2={y0} />
        <text x={sx(maxX) + 24} y={(sy(maxZ) + y0) / 2 + 3} stroke="none">{`h = ${maat(g.h_m, 2)} ${lengthUnit}`}</text>
      </g>
    </svg>
  );
}

/**
 * Wat de blokkering φ betekent (§7.3(2), figuur 7.15), als twee tekeningetjes:
 * links het lege dak (φ = 0), rechts het dak met de gekozen φ als opgestapelde
 * goederen aan de lijzijde. De stapel is φ van de vrije hoogte onder het dak.
 */
export function BlokkeringSchema({ phi, dakvorm, breedtePx = 300 }: { phi: number; dakvorm: OverkappingDakvorm; breedtePx?: number }) {
  const { t } = useTranslation("common");
  const p = Math.max(0, Math.min(1, Number.isFinite(phi) ? phi : 0));
  const H = 78, grond = 64, dakZ = 22;
  const dak = (x0: number) => dakvorm === "lessenaar"
    ? `M ${x0} ${dakZ} L ${x0 + 110} ${dakZ + 10}`
    : `M ${x0} ${dakZ + 8} L ${x0 + 55} ${dakZ - 4} L ${x0 + 110} ${dakZ + 8}`;
  const paneel = (x0: number, stapel: number, label: string) => {
    const vrijeHoogte = grond - (dakZ + 10);
    const hoog = stapel * vrijeHoogte;
    return (
      <g>
        <line x1={x0 - 6} y1={grond} x2={x0 + 116} y2={grond} stroke="var(--theme-text-faint, #888)" strokeWidth="1" />
        <line x1={x0 + 4} y1={grond} x2={x0 + 4} y2={dakZ + 1} stroke="#9ca3af" strokeWidth="1.5" />
        <line x1={x0 + 106} y1={grond} x2={x0 + 106} y2={dakZ + 9} stroke="#9ca3af" strokeWidth="1.5" />
        <path d={dak(x0)} stroke={ROL_KLEUR.dakPlat} strokeWidth="3" fill="none" strokeLinecap="round" />
        {hoog > 0.5 && [0, 1, 2, 3].map((k) => (
          <rect key={k} className="wgd-blok" x={x0 + 102 - (k + 1) * 11} y={grond - hoog} width={10} height={hoog}
            fill="#d6b98c" stroke="#8b6b3d" strokeWidth="0.8" />
        ))}
        <line x1={x0 - 26} y1={grond - 22} x2={x0 - 8} y2={grond - 22} stroke={KLEUR_WIND} strokeWidth="1.8" markerEnd="url(#wgd-pijl3)" />
        <text x={x0 + 55} y={H - 2} fontSize="9.5" textAnchor="middle" fill="var(--theme-text-muted, #666)">{label}</text>
      </g>
    );
  };
  return (
    <svg className="wgd-schema wgd-blokkering" viewBox={`0 0 ${breedtePx} ${H}`} role="img"
      aria-label={t("wind.schema.blockageAria", { phi: nl(p, 2) })}>
      <defs>
        <marker id="wgd-pijl3" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
        </marker>
      </defs>
      {paneel(30, 0, t("wind.schema.blockageEmpty"))}
      {paneel(breedtePx / 2 + 28, p, `φ = ${nl(p, 2)}`)}
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
  /**
   * Vrijstaand dak: de zones van tabel 7.6/7.7 in plattegrond in plaats van de
   * randzone e/4. `nokFractie` = plaats van de nok of kiel vanaf de linker
   * dakrand (0…1); null bij een lessenaarsdak.
   */
  vrijstaand?: { nokFractie: number | null };
  breedtePx?: number;
  /** Invoervenster gebruikt mm; bestaande alleen-lezen afnemers behouden m. */
  lengthUnit?: LengthUnit;
}

export function PlattegrondSchema({
  gebouwlengte_m: b, d_m: d, hoh_m, positie, afstandTotKopgevel_m, richtingLinks, richtingRechts, richtingHaaks,
  e_m, vrijstaand, breedtePx = 440, lengthUnit = "m",
}: PlattegrondSchemaProps) {
  const { t } = useTranslation("common");
  const maat = (m: number, d: number) => lengthUnit === "mm" ? formatLength(m, "m") : nl(m, d);
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
  const eRand = !vrijstaand && e_m && e_m > 0 ? Math.min(e_m / 4, b) : 0;
  // Zones van een vrijstaand dak (tabel 7.6/7.7): B over b/10 aan de kopse
  // einden, C over d/10 langs de dakranden, D over d/5 rond de nok of kiel.
  // De linkerdakrand van de doorsnede ligt onderin (wind van links komt van
  // onderen, zie de windpijlen hieronder).
  const zoneRechthoeken: { zone: OverkappingZone; x: number; y: number; w: number; h: number }[] = [];
  if (vrijstaand) {
    const bB = (b / 10) * schaal, dC = (d / 10) * schaal;
    const binnenW = wPx - 2 * bB;
    zoneRechthoeken.push({ zone: "A", x: x0 + bB, y: y0, w: binnenW, h: hPx });
    zoneRechthoeken.push({ zone: "C", x: x0 + bB, y: y0, w: binnenW, h: dC });
    zoneRechthoeken.push({ zone: "C", x: x0 + bB, y: y0 + hPx - dC, w: binnenW, h: dC });
    if (vrijstaand.nokFractie !== null) {
      const yNok = y0 + hPx - vrijstaand.nokFractie * hPx;
      zoneRechthoeken.push({ zone: "D", x: x0 + bB, y: yNok - dC, w: binnenW, h: 2 * dC });
    }
    zoneRechthoeken.push({ zone: "B", x: x0, y: y0, w: bB, h: hPx });
    zoneRechthoeken.push({ zone: "B", x: x0 + wPx - bB, y: y0, w: bB, h: hPx });
  }
  return (
    <svg className="wgd-schema" viewBox={`0 0 ${breedtePx} ${hoogtePx.toFixed(0)}`} role="img"
      aria-label={t("wind.schema.planAria", { unit: lengthUnit, b: maat(b, 1), d: maat(d, 1) })}>
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
      {zoneRechthoeken.map((z, k) => (
        <g key={`z${k}`} className={`wgd-zone wgd-zone-${z.zone}`}>
          <rect x={z.x} y={z.y} width={Math.max(0, z.w)} height={Math.max(0, z.h)} fill={ZONE_KLEUR[z.zone]} opacity="0.75" />
          {z.w > 10 && z.h > 9 && (
            <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 3} fontSize="8.5" fontWeight="600" textAnchor="middle" fill="#1f2937">{z.zone}</text>
          )}
        </g>
      ))}
      <rect x={x0} y={y0} width={wPx} height={hPx} fill="none" stroke="var(--theme-text-secondary, #555)" strokeWidth="1.2" />
      {spanten.map((y) => (
        <line key={y} x1={sx(y)} y1={y0} x2={sx(y)} y2={y0 + hPx} stroke="var(--theme-text-faint, #999)" strokeWidth="0.8" className="wgd-spant" />
      ))}
      <line x1={sx(ditSpant)} y1={y0 - 4} x2={sx(ditSpant)} y2={y0 + hPx + 4} stroke="var(--theme-accent, #d97706)" strokeWidth="3" strokeLinecap="round" className="wgd-dit-spant">
        <title>{positie === "kopgevelspant" ? t("wind.positionGable") : t("wind.schema.innerFrameAt", { unit: lengthUnit, afstand: maat(ditSpant, 1) })}</title>
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
        <text x={x0 + wPx / 2} y={y0 + hPx + 18} textAnchor="middle">{t("wind.schema.planDims", { unit: lengthUnit, b: maat(b, 1), hoh: maat(hoh_m, 2) })}</text>
        <text x={x0 + wPx + 6} y={y0 + hPx / 2 + 3}>{`d = ${maat(d, 1)} ${lengthUnit}`}</text>
        {positie === "tussenspant" && (
          <text x={sx(ditSpant)} y={y0 - 8} textAnchor="middle" fill="var(--theme-accent, #d97706)">{`${maat(ditSpant, 1)} ${lengthUnit}`}</text>
        )}
      </g>
    </svg>
  );
}
