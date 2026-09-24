/**
 * AanzichtLaag — de staven in aanzicht, op ware grootte (issue #45).
 *
 * WAT ER GETEKEND WORDT komt volledig uit `lib/aanzichtGeometrie.ts`: dit
 * bestand rekent niets uit over doorsneden, het zet modelpunten om naar het
 * scherm. Het tekenvlak (px, thema-kleuren uit FemCanvas.css) en de
 * constructieschets van het rapport (viewBox-eenheden, vaste inkt) tekenen
 * daardoor met precies dezelfde laag.
 *
 * LIJNDIKTE. De punten gaan eerst naar het scherm en worden daarna getekend;
 * er zit geen schaaltransformatie op de laag. Een lijn is dus bij elke zoom
 * even dik, en een streeplijn houdt dezelfde streepjes.
 *
 * DETAIL NAAR ZOOM. Is een staaf op het scherm minder dan anderhalve pixel hoog,
 * dan tekent de laag er niets van: dan is de systeemlijn het aanzicht. Onder
 * de zes pixel alleen het vlak en de contour; flenslijnen, lamellen en wapening
 * pas daarboven. Beugels alleen als ze minstens drie pixel uit elkaar staan —
 * dichter is het een grijs vlak en geen h.o.h.
 *
 * VOLGORDE. De lijst komt al in tekenvolgorde (kolommen eerst). Het vlak van
 * elke staaf is dekkend, zodat de ligger die over een kolom ligt de kolomlijnen
 * daar afdekt; de laag ligt ONDER de systeemlijnen en knopen, die dus altijd
 * zichtbaar en aanklikbaar blijven. De laag zelf vangt geen muis.
 */
import type { AanzichtLijnSoort, Punt, StaafAanzicht } from "../../lib/aanzichtGeometrie";

interface SchermPunt {
  x: number;
  y: number;
}

interface Props {
  aanzichten: StaafAanzicht[];
  /** Wereld (mm, z omhoog) → scherm. */
  naarScherm: (x: number, z: number) => SchermPunt;
  /**
   * `canvas`: kleuren uit FemCanvas.css (licht en donker thema).
   * `rapport`: vaste inkt, want het rapport is papier.
   */
  variant: "canvas" | "rapport";
  /** Geselecteerde staven: hun contour in de accentkleur. */
  geselecteerd?: ReadonlySet<number>;
}

/** Onder deze schermhoogte (px) geen aanzicht, onder de tweede alleen de contour. */
export const AANZICHT_MIN_PX = 1.5;
export const AANZICHT_DETAIL_PX = 6;
/** Kleinste beugelafstand op het scherm (px) waarbij de beugels los getekend worden. */
export const BEUGEL_MIN_PX = 3;

/** Rapport: dezelfde inkt als de schets (INK/DIM in reportGeometry). */
const RAPPORT_INKT = "#1a1a1a";
const RAPPORT_GRIJS = "#555";
const RAPPORT_VLAK: Record<StaafAanzicht["materiaal"], string> = {
  staal: "#f1f1f1",
  hout: "#f4eee3",
  beton: "#e6e6e6",
  overig: "#f4f4f4",
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export default function AanzichtLaag({ aanzichten, naarScherm, variant, geselecteerd }: Props) {
  const rapport = variant === "rapport";
  const S = (p: Punt) => naarScherm(p.x, p.z);

  return (
    <g className="fem-aanzicht" pointerEvents="none">
      {aanzichten.map((az) => {
        // Schaal op het scherm, langs de staaf; de omzetting is in beide
        // richtingen dezelfde (tekenvlak en schets houden de verhoudingen).
        const b0 = S(az.begin), b1 = S(az.eind);
        const pxPerMm = Math.hypot(b1.x - b0.x, b1.y - b0.y) / az.lengteMm;
        const hoogteMm = Math.max(
          az.randen.begin.boven - az.randen.begin.onder,
          az.randen.eind.boven - az.randen.eind.onder,
        );
        const hoogtePx = hoogteMm * pxPerMm;
        if (!(hoogtePx >= AANZICHT_MIN_PX)) return null;
        const detail = hoogtePx >= AANZICHT_DETAIL_PX;
        // Beugels alleen als de kleinste h.o.h. op het scherm leesbaar is.
        const beugels = az.lijnen.filter((l) => l.soort === "beugel");
        let kleinsteStap = Infinity;
        for (let i = 1; i < beugels.length; i++) kleinsteStap = Math.min(kleinsteStap, beugels[i].s0 - beugels[i - 1].s0);
        const beugelsLos = kleinsteStap * pxPerMm >= BEUGEL_MIN_PX;
        const toon = (s: AanzichtLijnSoort) =>
          s === "contour" || (detail && (s !== "beugel" || beugelsLos));
        const sel = geselecteerd?.has(az.staafId) ?? false;
        const punten = az.omtrek.map((p) => { const q = S(p); return `${r2(q.x)},${r2(q.y)}`; }).join(" ");
        return (
          <g
            key={az.staafId}
            className={`fem-aanzicht-staaf fem-aanzicht-${az.materiaal}${sel ? " geselecteerd" : ""}`}
            data-aanzicht-staaf={az.staafId}
          >
            <polygon
              points={punten}
              className="fem-aanzicht-vlak"
              {...(rapport ? { fill: RAPPORT_VLAK[az.materiaal], stroke: "none" } : {})}
            />
            {az.lijnen.filter((l) => toon(l.soort)).map((l, i) => {
              const a = S(l.a), b = S(l.b);
              return (
                <line
                  key={i}
                  x1={r2(a.x)} y1={r2(a.y)} x2={r2(b.x)} y2={r2(b.y)}
                  className={`fem-aanzicht-${l.soort}`}
                  data-aanzicht-lijn={l.soort}
                  {...(rapport ? rapportStijl(l.soort) : {})}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Rapportstijl per lijnsoort: vaste inkt, dikte in viewBox-eenheden. */
function rapportStijl(soort: AanzichtLijnSoort): React.SVGProps<SVGLineElement> {
  switch (soort) {
    case "contour": return { stroke: RAPPORT_INKT, strokeWidth: 1.4 };
    case "zichtbaar": return { stroke: RAPPORT_INKT, strokeWidth: 0.9 };
    case "verborgen": return { stroke: RAPPORT_GRIJS, strokeWidth: 0.9, strokeDasharray: "6 4" };
    case "lamel": return { stroke: RAPPORT_GRIJS, strokeWidth: 0.6 };
    case "wapening": return { stroke: RAPPORT_INKT, strokeWidth: 1.8 };
    case "beugel": return { stroke: RAPPORT_GRIJS, strokeWidth: 0.7 };
  }
}
