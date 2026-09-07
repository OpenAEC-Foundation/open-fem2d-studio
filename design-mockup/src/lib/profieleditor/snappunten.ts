/**
 * snappunten — de betekenisvolle punten van een tekening waar de aanwijzer op
 * vastklikt.
 *
 * Een tekenpakket laat de muis niet alleen op het raster landen maar ook op
 * wat er al staat: de hoekpunten van een bouwsteen, de middens van zijn
 * zijden, zijn hart, en het zwaartepunt van de doorsnede. Daarmee zet je de
 * hoek van de ene plaat exact op de hoek van de andere zonder eerst uit te
 * rekenen hoe ver dat is — en het resultaat klopt tot op de millimeter, want
 * de coördinaten komen uit de geometrie en niet uit de muis.
 *
 * De punten staan in modelcoördinaten (mm, y naar rechts, z omhoog). Zoeken
 * gebeurt in SCHERMeenheden: de gevoeligheid hoort bij het beeld, niet bij de
 * doorsnede, zodat de vangst bij elke zoomstand even ver reikt.
 */
import { deelHoekpunten, gatNaarMotor, lamelHoekpunten, type Punt } from "./geometrie";
import type { DeelUitvoer, DoorsnedeOntwerp } from "./types";

/** Soort punt waar de aanwijzer op vast kan klikken. */
export type SnapSoort = "hoek" | "midden" | "hart" | "zwaartepunt";

/** Waar de aanwijzer geland is: op een punt, op het raster, of nergens op. */
export type VangSoort = SnapSoort | "raster" | "vrij";

export interface SnapPunt {
  y: number;
  z: number;
  soort: SnapSoort;
  /** Bouwsteen of gat waar het punt bij hoort; ontbreekt bij het zwaartepunt. */
  id?: string;
}

/** Waar de aanwijzer op is uitgekomen, in modelcoördinaten. */
export interface Vangst {
  y: number;
  z: number;
  soort: VangSoort;
}

/** Korte naam voor in beeld. */
export const VANG_NAAM: Record<VangSoort, string> = {
  hoek: "hoekpunt",
  midden: "midden",
  hart: "hart",
  zwaartepunt: "zwaartepunt",
  raster: "raster",
  vrij: "vrij",
};

/**
 * Voorkeur bij bijna gelijke afstand, als opslag in schermeenheden. Een
 * hoekpunt is het punt waar je op mikt; een hart of het zwaartepunt ligt
 * midden in een vlak en zit vaker toevallig in de buurt.
 */
const VOORKEUR: Record<SnapSoort, number> = {
  hoek: 0,
  midden: 2,
  hart: 4,
  zwaartepunt: 4,
};

/**
 * Afronden op 0,0001 mm — hetzelfde rooster waarop de bewerkingen hun
 * coördinaten neerzetten (lib/profieleditor/transformeren.ts).
 *
 * Dat is geen kosmetiek. Een staande lamel krijgt zijn hoekpunten via
 * `Math.cos(π/2)`, en dat is 6,1·10⁻¹⁷ in plaats van 0: het hoekpunt komt op
 * 393,99999999999994 uit. Vang je daarop, dan is de verplaatsing 193,9999…
 * en landt de plaat naast het punt dat je aanwees. Een mikpunt hoort een rond
 * getal te zijn; anders klopt het resultaat wel op het oog, maar niet in de
 * getallen. Ruimt ook −0 op.
 */
function net(v: number): number {
  const r = Math.round(v * 1e4) / 1e4;
  return r === 0 ? 0 : r;
}

/** Hoekpunten én de middens van de zijden van een gesloten veelhoek. */
function veelhoekPunten(punten: Punt[], id: string, uit: SnapPunt[]): void {
  const n = punten.length;
  for (let i = 0; i < n; i++) {
    const [y, z] = punten[i];
    const [y2, z2] = punten[(i + 1) % n];
    uit.push({ y: net(y), z: net(z), soort: "hoek", id });
    uit.push({ y: net((y + y2) / 2), z: net((z + z2) / 2), soort: "midden", id });
  }
}

/**
 * Alle snappunten van een ontwerp.
 *
 * Een lamel levert zijn vier hoekpunten, de vier middens van zijn zijden en
 * zijn hart. Een catalogusdeel levert de hoekpunten en zijdemiddens van zijn
 * omhullende rechthoek (b × h, meegedraaid en meegespiegeld) plus zijn hart —
 * dat zijn de punten waarop je een profiel uitlijnt; de walsuitrondingen van
 * de eigen contour zijn geen mikpunt. Bij een profiel met gaten ligt het
 * basisprofiel vast: dat levert zijn omhullende, en elk gat zijn hart op de
 * plek waar het getekend staat.
 */
export function snapPunten(
  o: DoorsnedeOntwerp,
  delen: DeelUitvoer[] = [],
  zwaartepunt?: { y: number; z: number } | null,
): SnapPunt[] {
  const uit: SnapPunt[] = [];
  if (o.soort === "samenstelling") {
    for (const l of o.lamellen) {
      veelhoekPunten(lamelHoekpunten(l), l.id, uit);
      uit.push({ y: net(l.y_mm), z: net(l.z_mm), soort: "hart", id: l.id });
    }
    o.catalogusdelen.forEach((d, i) => {
      veelhoekPunten(deelHoekpunten(d, delen[i]), d.id, uit);
      uit.push({ y: net(d.y_mm), z: net(d.z_mm), soort: "hart", id: d.id });
    });
  } else {
    const b = o.basis;
    veelhoekPunten(
      [
        [0, 0],
        [b.b, 0],
        [b.b, b.h],
        [0, b.h],
      ],
      "basis",
      uit,
    );
    uit.push({ y: net(b.b / 2), z: net(b.h / 2), soort: "hart", id: "basis" });
    for (const g of o.gaten) {
      const m = gatNaarMotor(g, b);
      uit.push({ y: net(m.y), z: net(m.z), soort: "hart", id: g.id });
    }
  }
  if (zwaartepunt) uit.push({ y: net(zwaartepunt.y), z: net(zwaartepunt.z), soort: "zwaartepunt" });
  return uit;
}

/**
 * Het snappunt dat het dichtst bij een schermpositie ligt, of null als er
 * geen binnen `straal` valt.
 *
 * `naarScherm` zet een modelpunt om in schermeenheden; afstand én straal
 * worden daarin gemeten, zodat inzoomen de vangst niet gevoeliger of juist
 * ongevoeliger maakt. Bij bijna gelijke afstand wint het soort met de laagste
 * opslag: een
 * hoekpunt gaat vóór een midden, en dat weer vóór een hart.
 */
export function dichtstbijzijndeSnap(
  punten: SnapPunt[],
  naarScherm: (y: number, z: number) => [number, number],
  px: number,
  py: number,
  straal: number,
): SnapPunt | null {
  let beste: SnapPunt | null = null;
  let besteScore = Infinity;
  for (const p of punten) {
    const [sx, sy] = naarScherm(p.y, p.z);
    const d = Math.hypot(sx - px, sy - py);
    if (d > straal) continue;
    const score = d + VOORKEUR[p.soort];
    if (score < besteScore) {
      besteScore = score;
      beste = p;
    }
  }
  return beste;
}
