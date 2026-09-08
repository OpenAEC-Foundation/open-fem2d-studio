/**
 * tekening — de tekenbare vorm van een ontwerp, als SVG-paden in
 * modelcoördinaten (mm, y naar rechts, z omhoog). De renderer zet ze met één
 * groepstransformatie `translate(…) scale(s, −s)` op het scherm.
 *
 * Catalogusvormen komen uit `shapePath` (components/shared/profielVorm.ts),
 * dezelfde contourwiskunde als het rapport en het profielkeuzescherm — mét
 * walsuitrondingen. Die paden staan in het eigen profielstelsel (oorsprong
 * linksboven, y omlaag); `transform` zet ze in het modelstelsel.
 */
import {
  flensHellingVanProfiel,
  shapePath,
  type SectionShape,
} from "../../components/shared/profielVorm";
import { gatContourPunten, gatNaarMotor, lamelHoekpunten, deelZwaartepunt } from "./geometrie";
import { lassenVan, naadmeetkunde } from "./lassen";
import type { Basisprofiel, Catalogusdeel, DeelUitvoer, DoorsnedeOntwerp, Gat, Lamel, Las } from "./types";

export interface TekenItem {
  soort: "lamel" | "deel" | "basis" | "gat" | "las";
  id: string;
  /** SVG-pad; `transform` (SVG-syntax, modelstelsel) hoort erbij als hij er is. */
  d: string;
  transform?: string;
  fillRule?: "evenodd";
}

/** Basisprofiel → tekenvorm van profielVorm.ts. */
export function basisVorm(b: Basisprofiel): SectionShape {
  switch (b.soort) {
    case "ISection":
      return { type: "isection", h: b.h, b: b.b, tw: b.tw, tf: b.tf, r: b.r };
    case "Channel":
      return { type: "channel", h: b.h, b: b.b, tw: b.tw, tf: b.tf, r: b.r, flensHelling: 0 };
    case "ChannelSchuin":
      // De soort zegt dát de flens toeloopt; hoevéél staat bij de naam in de
      // staaldatabase. Een profiel dat daar niet in staat, wordt met
      // evenwijdige flenzen getekend — geen verzonnen helling.
      return {
        type: "channel",
        h: b.h,
        b: b.b,
        tw: b.tw,
        tf: b.tf,
        r: b.r,
        flensHelling: flensHellingVanProfiel(b.naam),
      };
    case "Shs":
    case "Rhs":
      return { type: "box", h: b.h, b: b.b, t: b.tw, r: b.r };
    case "Chs":
      return { type: "tube", d: b.h, t: b.tw };
    case "Rechthoek":
      return { type: "rect", h: b.h, b: b.b };
  }
}

/** Eigen profielstelsel (y omlaag, oorsprong linksboven) → modelstelsel. */
function flipNaarModel(h: number): string {
  return `translate(0 ${fmt(h)}) scale(1 -1)`;
}

function fmt(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : "0";
}

function polygoonPad(punten: [number, number][]): string {
  return punten.map(([y, z], i) => `${i === 0 ? "M" : "L"} ${fmt(y)} ${fmt(z)}`).join(" ") + " Z";
}

export function lamelItem(l: Lamel): TekenItem {
  return { soort: "lamel", id: l.id, d: polygoonPad(lamelHoekpunten(l)) };
}

/**
 * Catalogusdeel: eigen contour, gespiegeld/gedraaid om zijn zwaartepunt en
 * op `(y_mm, z_mm)` gezet. Transformaties werken van rechts naar links.
 */
export function deelItem(d: Catalogusdeel, uit?: DeelUitvoer): TekenItem {
  const [yc, zc] = deelZwaartepunt(d, uit);
  const pad = shapePath(basisVorm(d.profiel), 1, 0, 0);
  const transform =
    `translate(${fmt(d.y_mm)} ${fmt(d.z_mm)}) rotate(${fmt(d.alphaGraden)}) ` +
    `scale(${d.gespiegeld ? -1 : 1} 1) translate(${fmt(-yc)} ${fmt(-zc)}) ${flipNaarModel(d.profiel.h)}`;
  return { soort: "deel", id: d.id, d: pad.d, transform, fillRule: pad.fillRule };
}

export function basisItem(b: Basisprofiel): TekenItem {
  const pad = shapePath(basisVorm(b), 1, 0, 0);
  return { soort: "basis", id: "basis", d: pad.d, transform: flipNaarModel(b.h), fillRule: pad.fillRule };
}

/**
 * Een gat als "leegte": de spleet die een gat door een plaat in het
 * doorsnedevlak achterlaat (over de volle plaatdikte), of het langsgat zelf.
 * Getekend in de achtergrondkleur óver het profiel.
 */
export function gatItem(g: Gat, basis: Basisprofiel): TekenItem {
  if (g.plaats === "vlak") {
    if (g.vorm === "rond") {
      const r = g.d / 2;
      return {
        soort: "gat",
        id: g.id,
        d:
          `M ${fmt(g.y - r)} ${fmt(g.z)} a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0 ` +
          `a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0 Z`,
      };
    }
    return { soort: "gat", id: g.id, d: polygoonPad(gatContourPunten(g)) };
  }
  const m = gatNaarMotor(g, basis);
  const b = m.b ?? 0;
  const h = m.h ?? 0;
  const rechthoek: [number, number][] = [
    [-b / 2, -h / 2],
    [b / 2, -h / 2],
    [b / 2, h / 2],
    [-b / 2, h / 2],
  ];
  return {
    soort: "gat",
    id: g.id,
    d: polygoonPad(rechthoek),
    transform: `translate(${fmt(m.y)} ${fmt(m.z)}) rotate(${fmt(m.hoek_graden ?? 0)})`,
  };
}

/**
 * Een lasnaad als getekende vorm.
 *
 * Een hoeklas wordt getekend zoals hij er in werkelijkheid uitziet: een
 * driehoek in de hoek tussen de twee platen, met rechthoekszijden `z = a·√2`
 * — dat is de gelijkbenige hoeklas waarvan `a` de keeldikte is. Bij een
 * dubbelzijdige naad staan er twee, één in elke hoek. Een volledig doorgelaste
 * stompe naad heeft geen driehoek; die krijgt een streepje dwars over de
 * plaatdikte, op de plaats van de naad.
 *
 * Zo is aan de tekening te zien wat er staat, en verandert de figuur mee als
 * de keeldikte verandert.
 */
export function lasItem(las: Las, a: Lamel, b: Lamel): TekenItem | null {
  const m = naadmeetkunde(a, b);
  if (!m) return null;
  const { punt, langsA: u, dwarsA: n, tA } = m;
  const punt2 = (s: number, t: number): [number, number] => [
    punt.y + u.y * s + n.y * t,
    punt.z + u.z * s + n.z * t,
  ];
  if (las.soort === "StompVolledig") {
    const halfB = tA / 2;
    const halfL = Math.max(0.4, tA * 0.2);
    return {
      soort: "las",
      id: las.id,
      d: polygoonPad([
        punt2(-halfL, -halfB),
        punt2(halfL, -halfB),
        punt2(halfL, halfB),
        punt2(-halfL, halfB),
      ]),
    };
  }
  const been = Math.max(0.1, las.a_mm) * Math.SQRT2;
  const zijden = las.soort === "HoeklasDubbel" ? [1, -1] : [1];
  const paden = zijden.map((s) => {
    const c: [number, number] = [punt.y + n.y * s * (tA / 2), punt.z + n.z * s * (tA / 2)];
    return polygoonPad([
      c,
      [c[0] + n.y * s * been, c[1] + n.z * s * been],
      [c[0] + u.y * been, c[1] + u.z * been],
    ]);
  });
  return { soort: "las", id: las.id, d: paden.join(" ") };
}

/** Alle lasnaden van een samenstelling als tekenitems. */
export function lasItems(o: Extract<DoorsnedeOntwerp, { soort: "samenstelling" }>): TekenItem[] {
  const perId = new Map(o.lamellen.map((l) => [l.id, l]));
  const uit: TekenItem[] = [];
  for (const las of lassenVan(o)) {
    const a = perId.get(las.aId);
    const b = perId.get(las.bId);
    if (!a || !b) continue;
    const item = lasItem(las, a, b);
    if (item) uit.push(item);
  }
  return uit;
}

/** Alle tekenitems van een ontwerp, in tekenvolgorde (gaten als laatste). */
export function tekenItems(o: DoorsnedeOntwerp, delen: DeelUitvoer[] = []): TekenItem[] {
  if (o.soort === "samenstelling") {
    return [
      ...o.catalogusdelen.map((d, i) => deelItem(d, delen[i])),
      ...o.lamellen.map(lamelItem),
      ...lasItems(o),
    ];
  }
  return [basisItem(o.basis), ...o.gaten.map((g) => gatItem(g, o.basis))];
}
