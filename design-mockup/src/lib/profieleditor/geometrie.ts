/**
 * geometrie — de meetkunde die de editor zélf nodig heeft: hoekpunten om te
 * tekenen, een snelle schatting van A en zwaartepunt tijdens het slepen, de
 * omhullende rechthoek, de vertaling van een gat naar wat de motor eruit
 * snijdt, en de herkenning van een gesloten cel.
 *
 * Bewust beperkt: A en zwaartepunt zijn de enige grootheden die hier in
 * TypeScript staan (voor de live-weergave tijdens het slepen); alle
 * doorsnede-eigenschappen die de gebruiker te zien krijgt komen uit de
 * Rust-motor. Twee implementaties van hetzelfde getal zijn een risico.
 */
import { catalogusOppervlak } from "./catalogus";
import type { MotorGat } from "./motorClient";
import type {
  Basisprofiel,
  Catalogusdeel,
  DeelUitvoer,
  DoorsnedeOntwerp,
  Gat,
  GatPlaats,
  GeslotenCelDef,
  Lamel,
} from "./types";

export type Punt = [number, number];

export function radialen(graden: number): number {
  return (graden * Math.PI) / 180;
}

// ── Lamellen ────────────────────────────────────────────────────────────────

/** De vier hoekpunten van een lamel, tegen de klok in (y rechts, z omhoog). */
export function lamelHoekpunten(l: Lamel): Punt[] {
  const a = radialen(l.alphaGraden);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hu = l.b_mm / 2;
  const hv = l.t_mm / 2;
  const p = (u: number, v: number): Punt => [l.y_mm + u * c - v * s, l.z_mm + u * s + v * c];
  return [p(-hu, -hv), p(hu, -hv), p(hu, hv), p(-hu, hv)];
}

/** Uiteinden van de plaatas (middellijn). */
export function lamelMiddellijn(l: Lamel): [Punt, Punt] {
  const a = radialen(l.alphaGraden);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hu = l.b_mm / 2;
  return [
    [l.y_mm - hu * c, l.z_mm - hu * s],
    [l.y_mm + hu * c, l.z_mm + hu * s],
  ];
}

// ── Snelle schatting (alleen A en zwaartepunt) ──────────────────────────────

export interface SnelleSchatting {
  a_mm2: number;
  /** Zwaartepunt; undefined als het niet in TypeScript te bepalen is. */
  y_c_mm?: number;
  z_c_mm?: number;
}

/**
 * A en zwaartepunt uit de invoer, zonder de motor. Voor een samenstelling
 * uit lamellen exact (Σ b·t, gewogen zwaartepunt); catalogusdelen tellen met
 * hun database-oppervlak mee op hun opgegeven zwaartepunt. Voor een profiel
 * met gaten: catalogusoppervlak min de gatoppervlakken; het zwaartepunt komt
 * dan uit de motor.
 */
export function snelleSchatting(o: DoorsnedeOntwerp): SnelleSchatting {
  if (o.soort === "samenstelling") {
    let a = 0;
    let sy = 0;
    let sz = 0;
    for (const l of o.lamellen) {
      const al = l.b_mm * l.t_mm;
      a += al;
      sy += al * l.y_mm;
      sz += al * l.z_mm;
    }
    for (const d of o.catalogusdelen) {
      const ad = catalogusOppervlak(d.profiel.naam) ?? 0;
      a += ad;
      sy += ad * d.y_mm;
      sz += ad * d.z_mm;
    }
    return a > 0 ? { a_mm2: a, y_c_mm: sy / a, z_c_mm: sz / a } : { a_mm2: 0 };
  }
  const basis = catalogusOppervlak(o.basis.naam) ?? o.basis.b * o.basis.h;
  let gaten = 0;
  for (const g of o.gaten) gaten += gatOppervlak(g, o.basis);
  return { a_mm2: Math.max(0, basis - gaten) };
}

// ── Gaten ───────────────────────────────────────────────────────────────────

/**
 * Hoe ver de uitsnede aan weerszijden door de plaat heen steekt, de leegte
 * in (mm). Nodig omdat een uitsnede die precies op de plaatvlakken eindigt
 * samenvallende randen geeft. Bewust geen rond getal, zodat de rand van de
 * uitsnede niet toevallig door een hoekpunt van het profiel loopt.
 */
export const OVERSTEEK_MM = 0.731;

export function isKoker(basis: Basisprofiel): boolean {
  return basis.soort === "Shs" || basis.soort === "Rhs";
}

/** Wanddikte van de plaat waar het gat doorheen gaat. */
export function plaatdikte(basis: Basisprofiel, plaats: GatPlaats): number {
  switch (plaats) {
    case "lijf":
    case "wand":
      return basis.tw;
    case "flensBoven":
    case "flensOnder":
      return basis.tf;
    case "vlak":
      return 0;
  }
}

/** y van het hart van het lijf (I: midden; U en koker: linkerplaat). */
export function lijfHart(basis: Basisprofiel): number {
  switch (basis.soort) {
    case "Channel":
    case "ChannelSchuin":
    case "Shs":
    case "Rhs":
      return basis.tw / 2;
    case "ISection":
    case "ISectionSchuin":
    case "Chs":
    case "Rechthoek":
      return basis.b / 2;
  }
}

/** Afmeting van het gat langs de plaatas (hoogte in een lijf, breedte in een flens). */
export function gatLangsPlaat(g: Gat): number {
  return g.vorm === "rond" ? g.d : g.h;
}

/**
 * Wat de motor voor dit gat krijgt. Een gat door een plaat wordt een
 * `uitsnede`: een rechthoek over de volle plaatdikte (plus overstek in de
 * leegte) met de gatmaat langs de plaat; een langsgat gaat als `vlak` mee.
 */
export function gatNaarMotor(g: Gat, basis: Basisprofiel): MotorGat {
  const langs = gatLangsPlaat(g);
  const t = plaatdikte(basis, g.plaats) + 2 * OVERSTEEK_MM;
  switch (g.plaats) {
    case "vlak":
      return g.vorm === "rond"
        ? { plaats: "vlak", vorm: "rond", y: g.y, z: g.z, d: g.d }
        : { plaats: "vlak", vorm: "rechthoek", y: g.y, z: g.z, b: g.b, h: g.h, hoek_graden: g.hoekGraden };
    case "lijf":
      return { plaats: "uitsnede", y: lijfHart(basis), z: g.z, b: t, h: langs, hoek_graden: 0 };
    case "flensBoven":
      return { plaats: "uitsnede", y: g.y, z: basis.h - basis.tf / 2, b: langs, h: t, hoek_graden: 0 };
    case "flensOnder":
      return { plaats: "uitsnede", y: g.y, z: basis.tf / 2, b: langs, h: t, hoek_graden: 0 };
    case "wand": {
      // Buis: de uitsnede staat radiaal, op straal R − t/2 onder hoek φ.
      const R = basis.h / 2;
      const phi = radialen(g.hoekGraden);
      const rm = R - basis.tw / 2;
      return {
        plaats: "uitsnede",
        y: R + rm * Math.cos(phi),
        z: R + rm * Math.sin(phi),
        b: t,
        h: langs,
        hoek_graden: g.hoekGraden,
      };
    }
  }
}

/** Oppervlak dat een gat uit de doorsnede wegneemt (mm², benadering voor de buiswand). */
export function gatOppervlak(g: Gat, basis: Basisprofiel): number {
  if (g.plaats === "vlak") return g.vorm === "rond" ? (Math.PI * g.d * g.d) / 4 : g.b * g.h;
  return plaatdikte(basis, g.plaats) * gatLangsPlaat(g);
}

/** Welke plaatsen een gat kan hebben bij deze profielsoort. */
export function toegestanePlaatsen(basis: Basisprofiel): GatPlaats[] {
  switch (basis.soort) {
    case "ISection":
    case "ISectionSchuin":
    case "Channel":
    case "ChannelSchuin":
    case "Shs":
    case "Rhs":
      return ["lijf", "flensBoven", "flensOnder"];
    case "Chs":
      return ["wand"];
    case "Rechthoek":
      return ["vlak"];
  }
}

export function plaatsLabel(plaats: GatPlaats, basis: Basisprofiel): string {
  const koker = isKoker(basis);
  switch (plaats) {
    case "lijf":
      return koker ? "door de linkerwand" : "door het lijf";
    case "flensBoven":
      return koker ? "door de bovenwand" : "door de bovenflens";
    case "flensOnder":
      return koker ? "door de onderwand" : "door de onderflens";
    case "wand":
      return "door de buiswand";
    case "vlak":
      return "langsgat in het doorsnedevlak";
  }
}

/** Puntenrij langs de rand van een langsgat (voor controle en tekening). */
export function gatContourPunten(g: Gat): Punt[] {
  if (g.vorm === "rond") {
    const n = 48;
    const r = g.d / 2;
    return Array.from({ length: n }, (_, i) => {
      const t = (2 * Math.PI * i) / n;
      return [g.y + r * Math.cos(t), g.z + r * Math.sin(t)] as Punt;
    });
  }
  const a = radialen(g.hoekGraden);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hb = g.b / 2;
  const hh = g.h / 2;
  const p = (u: number, v: number): Punt => [g.y + u * c - v * s, g.z + u * s + v * c];
  return [p(-hb, -hh), p(hb, -hh), p(hb, hh), p(-hb, hh)];
}

/** Marge die een gat door een plaat tot de uitronding/hoek moet houden (mm). */
const MARGE_MM = 0.5;

/**
 * Vrije lengte van de plaat waar het gat in moet passen, als `[van, tot]`
 * langs de plaatas — buiten uitrondingen en hoekstralen. Voor een I-flens
 * twee uitstekken.
 */
export function vrijePlaatbereiken(basis: Basisprofiel, plaats: GatPlaats): Array<[number, number]> {
  const koker = isKoker(basis);
  switch (plaats) {
    case "lijf":
      return koker
        ? [[1.5 * basis.tw, basis.h - 1.5 * basis.tw]]
        : [[basis.tf + basis.r, basis.h - basis.tf - basis.r]];
    case "flensBoven":
    case "flensOnder": {
      if (koker) return [[1.5 * basis.tw, basis.b - 1.5 * basis.tw]];
      if (basis.soort === "ISection") {
        const wl = (basis.b - basis.tw) / 2;
        return [
          [0, wl - basis.r],
          [wl + basis.tw + basis.r, basis.b],
        ];
      }
      return [[basis.tw + basis.r, basis.b]];
    }
    case "wand":
      return [[0, 360]];
    case "vlak":
      return [[0, 0]];
  }
}

/**
 * Controleert een gat: geeft een Nederlandse melding of null als het goed
 * is. De walsuitrondingen en hoekstralen tellen als plaatgrens: een gat dat
 * in de uitronding valt is geen "gat door het lijf".
 */
export function controleerGat(g: Gat, basis: Basisprofiel): string | null {
  const langs = gatLangsPlaat(g);
  const dwars = g.vorm === "rond" ? g.d : g.b;
  if (!(langs > 0) || !(dwars > 0)) return "Geef het gat een positieve afmeting.";
  switch (g.plaats) {
    case "vlak": {
      if (basis.soort !== "Rechthoek") return "Een langsgat kan alleen in een massieve doorsnede.";
      const binnen = gatContourPunten(g).every(
        ([y, z]) => y > MARGE_MM && y < basis.b - MARGE_MM && z > MARGE_MM && z < basis.h - MARGE_MM,
      );
      return binnen ? null : "Het langsgat ligt (deels) buiten het materiaal.";
    }
    case "wand": {
      if (langs >= 0.6 * basis.h) return "Het gat is te groot voor de buiswand (hoogstens 0,6·D).";
      return null;
    }
    case "lijf":
    case "flensBoven":
    case "flensOnder": {
      const pos = g.plaats === "lijf" ? g.z : g.y;
      const bereiken = vrijePlaatbereiken(basis, g.plaats);
      const past = bereiken.some(
        ([a, b]) => pos - langs / 2 >= a + MARGE_MM - 1e-9 && pos + langs / 2 <= b - MARGE_MM + 1e-9,
      );
      if (past) return null;
      const as = g.plaats === "lijf" ? "z" : "y";
      const tekst = bereiken
        .map(([a, b]) => `${(a + MARGE_MM).toFixed(1)}–${(b - MARGE_MM).toFixed(1)}`)
        .join(" of ");
      return `Het gat moet met zijn hele maat binnen de vrije plaat liggen (${as} = ${tekst} mm, buiten uitrondingen en hoeken).`;
    }
  }
}

/** Standaardgat voor een plaats: in het midden van de (eerste vrije) plaat. */
export function standaardGat(basis: Basisprofiel, plaats: GatPlaats, id: string): Gat {
  const bereik = vrijePlaatbereiken(basis, plaats);
  // Bij een I-flens het rechter uitstek, anders het enige bereik.
  const [a, b] = bereik[bereik.length - 1];
  const vrij = Math.max(0, b - a - 2 * MARGE_MM);
  const d = Math.max(4, Math.floor(Math.min(vrij / 2, Math.min(basis.h, basis.b) / 4) / 5) * 5 || 4);
  const midden = (a + b) / 2;
  switch (plaats) {
    case "lijf":
      return { id, plaats, vorm: "rond", y: lijfHart(basis), z: midden, d, b: d, h: d, hoekGraden: 0 };
    case "flensBoven":
      return { id, plaats, vorm: "rond", y: midden, z: basis.h - basis.tf / 2, d, b: d, h: d, hoekGraden: 0 };
    case "flensOnder":
      return { id, plaats, vorm: "rond", y: midden, z: basis.tf / 2, d, b: d, h: d, hoekGraden: 0 };
    case "wand": {
      const dw = Math.max(4, Math.floor(basis.h / 5 / 5) * 5);
      return { id, plaats, vorm: "rond", y: basis.h / 2, z: basis.h - basis.tw / 2, d: dw, b: dw, h: dw, hoekGraden: 90 };
    }
    case "vlak": {
      const dv = Math.max(4, Math.floor(Math.min(basis.h, basis.b) / 3 / 5) * 5);
      return { id, plaats, vorm: "rond", y: basis.b / 2, z: basis.h / 2, d: dv, b: dv, h: dv, hoekGraden: 0 };
    }
  }
}

/**
 * Is de doorsnede met deze gaten nog dubbelsymmetrisch? Elk gat moet zijn
 * spiegelbeeld hebben om y = b/2 én om z = h/2 (en om beide tegelijk).
 * Alleen zinvol voor een I-profiel; de vormaanduiding voor de toetsing hangt
 * hiervan af.
 */
export function gatenDubbelsymmetrisch(basis: Basisprofiel, gaten: Gat[]): boolean {
  const tol = 0.01;
  const gelijk = (p: Gat, q: Gat, y: number, z: number) =>
    p.plaats === q.plaats &&
    p.vorm === q.vorm &&
    Math.abs(p.d - q.d) < tol &&
    Math.abs(p.b - q.b) < tol &&
    Math.abs(p.h - q.h) < tol &&
    Math.abs(q.y - y) < tol &&
    Math.abs(q.z - z) < tol;
  const spiegelPlaats = (p: GatPlaats): GatPlaats =>
    p === "flensBoven" ? "flensOnder" : p === "flensOnder" ? "flensBoven" : p;
  for (const g of gaten) {
    const spiegelY = { ...g, y: basis.b - g.y };
    const spiegelZ = { ...g, z: basis.h - g.z, plaats: spiegelPlaats(g.plaats) };
    const beide = { ...spiegelZ, y: basis.b - g.y };
    for (const s of [spiegelY, spiegelZ, beide]) {
      if (!gaten.some((q) => gelijk(s, q, s.y, s.z))) return false;
    }
  }
  return true;
}

// ── Omhullende en catalogusdelen ────────────────────────────────────────────

export interface Omhullende {
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

/** Zwaartepunt van een catalogusdeel in zijn eigen beschrijvingsassenstelsel. */
export function deelZwaartepunt(d: Catalogusdeel, uit?: DeelUitvoer): Punt {
  if (uit && uit.y_c_mm > 0) return [uit.y_c_mm, uit.z_c_mm];
  return [d.profiel.b / 2, d.profiel.h / 2];
}

/** Hoekpunten van de omhullende rechthoek van een deel, in het samenstelstelsel. */
export function deelHoekpunten(d: Catalogusdeel, uit?: DeelUitvoer): Punt[] {
  const [yc, zc] = deelZwaartepunt(d, uit);
  const a = radialen(d.alphaGraden);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const my = d.gespiegeld ? -1 : 1;
  const hoeken: Punt[] = [
    [0, 0],
    [d.profiel.b, 0],
    [d.profiel.b, d.profiel.h],
    [0, d.profiel.h],
  ];
  return hoeken.map(([y, z]) => {
    const u = my * (y - yc);
    const v = z - zc;
    return [d.y_mm + u * c - v * s, d.z_mm + u * s + v * c] as Punt;
  });
}

export function omhullende(o: DoorsnedeOntwerp, delen: DeelUitvoer[] = []): Omhullende | null {
  const punten: Punt[] = [];
  if (o.soort === "samenstelling") {
    for (const l of o.lamellen) punten.push(...lamelHoekpunten(l));
    o.catalogusdelen.forEach((d, i) => punten.push(...deelHoekpunten(d, delen[i])));
  } else {
    punten.push([0, 0], [o.basis.b, o.basis.h]);
  }
  if (punten.length === 0) return null;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const [y, z] of punten) {
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  return { yMin, yMax, zMin, zMax };
}

// ── Gesloten cel herkennen ──────────────────────────────────────────────────

/**
 * Lasnaad-criterium: raakt een uiteinde van a de middellijn van b?
 *
 * Ook de lassen gebruiken dit: waar twee platen elkaar zo raken, zit in een
 * gelaste doorsnede een naad. Zie lib/profieleditor/lassen.ts.
 */
export function rakenElkaar(a: Lamel, b: Lamel): boolean {
  const tol = 0.5 * (a.t_mm + b.t_mm) * 1.05 + 1e-9;
  return afstandUiteindenTotAs(a, b) <= tol || afstandUiteindenTotAs(b, a) <= tol;
}

/**
 * Kleinste afstand van een uiteinde van `a` tot de middellijn van `b`. Klein
 * betekent: `a` eindigt op `b`. De lassen gebruiken dit om te bepalen welke van
 * de twee platen de "steel" van de naad is en welke de "voet".
 */
export function afstandUiteindenTotAs(a: Lamel, b: Lamel): number {
  const [b0, b1] = lamelMiddellijn(b);
  const ab: Punt = [b1[0] - b0[0], b1[1] - b0[1]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1];
  let min = Infinity;
  for (const e of lamelMiddellijn(a)) {
    let d: number;
    if (l2 <= 0) {
      d = Math.hypot(e[0] - b0[0], e[1] - b0[1]);
    } else {
      const s = Math.max(0, Math.min(1, ((e[0] - b0[0]) * ab[0] + (e[1] - b0[1]) * ab[1]) / l2));
      d = Math.hypot(e[0] - (b0[0] + s * ab[0]), e[1] - (b0[1] + s * ab[1]));
    }
    min = Math.min(min, d);
  }
  return min;
}

/** Snijpunt van de doorgetrokken middellijnen van twee lamellen. */
function snijpuntMiddellijnen(a: Lamel, b: Lamel): Punt | null {
  const da: Punt = [Math.cos(radialen(a.alphaGraden)), Math.sin(radialen(a.alphaGraden))];
  const db: Punt = [Math.cos(radialen(b.alphaGraden)), Math.sin(radialen(b.alphaGraden))];
  const noemer = da[0] * db[1] - da[1] * db[0];
  if (Math.abs(noemer) < 1e-12) return null;
  const dy = b.y_mm - a.y_mm;
  const dz = b.z_mm - a.z_mm;
  const ua = (dy * db[1] - dz * db[0]) / noemer;
  return [a.y_mm + ua * da[0], a.z_mm + ua * da[1]];
}

/**
 * Herkent één gesloten cel: elke lamel raakt precies twee andere en samen
 * vormen ze één ring. Geeft de cel zoals de motor (Bredt) hem verwacht, met
 * de hoekpunten van de wandmiddellijn op de snijpunten van de middellijnen.
 * null als de lamellen geen enkelvoudige ring vormen (open doorsnede, of
 * meer dan één cel — die laatste is nog niet ondersteund).
 */
export function herkenGeslotenCel(lamellen: Lamel[]): GeslotenCelDef | null {
  const n = lamellen.length;
  if (n < 3) return null;
  const buren: number[][] = lamellen.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rakenElkaar(lamellen[i], lamellen[j]) && snijpuntMiddellijnen(lamellen[i], lamellen[j])) {
        buren[i].push(j);
        buren[j].push(i);
      }
    }
  }
  if (buren.some((b) => b.length !== 2)) return null;
  // Ring aflopen vanaf lamel 0.
  const volgorde = [0];
  let vorige = -1;
  let huidig = 0;
  while (volgorde.length < n) {
    const volgende = buren[huidig].find((b) => b !== vorige);
    if (volgende === undefined || volgende === 0) return null;
    volgorde.push(volgende);
    vorige = huidig;
    huidig = volgende;
  }
  if (!buren[huidig].includes(0)) return null;

  const midlijn: [number, number][] = [];
  const dikte: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = lamellen[volgorde[k]];
    const b = lamellen[volgorde[(k + 1) % n]];
    const p = snijpuntMiddellijnen(a, b);
    if (!p) return null;
    midlijn.push([p[0], p[1]]);
    // Zijde k → k+1 ligt langs lamel b (de wand tussen dit en het volgende hoekpunt).
    dikte.push(b.t_mm);
  }
  // Het middellijnpolygoon moet een echt oppervlak hebben.
  let opp = 0;
  for (let i = 0; i < n; i++) {
    const [y0, z0] = midlijn[i];
    const [y1, z1] = midlijn[(i + 1) % n];
    opp += y0 * z1 - y1 * z0;
  }
  if (Math.abs(opp) / 2 < 1) return null;
  return { midlijn, dikte_mm: dikte, lamellen: volgorde };
}
