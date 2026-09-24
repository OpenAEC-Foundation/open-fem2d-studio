/**
 * aanzichtGeometrie.ts — de staven van het model in AANZICHT, op ware grootte
 * (issue #45): per staaf de lijnen die het zijaanzicht van zijn doorsnede
 * vormen, in modelcoördinaten (mm, z omhoog). Het tekenvlak en de
 * constructieschets van het rapport zetten die lijnen alleen nog om naar het
 * scherm; hier wordt niets getekend en er is geen React of DOM.
 *
 * ── ÉÉN BRON VOOR DE MATEN ─────────────────────────────────────────────────
 *
 * Er staat hier geen maattabel. Welke doorsnede een staaf heeft, beslist
 * `resolveSection` — dezelfde keuring als de solver: een staaf waarvan de
 * doorsnede niet te bepalen is (`bron: "default"`), krijgt géén aanzicht, want
 * een tekening van de terugvaldoorsnede zou een profiel tonen dat niemand heeft
 * ingevoerd. De maten zelf komen uit:
 *  - staal: `STEEL_SECTION_DIMS` (h, b, t_w, t_f), de catalogus van de toetsing;
 *  - verlopend profiel: `bepaalVerloop` — de maten aan begin en eind;
 *  - eigen doorsnede: het ontwerp uit `eigenDoorsnedenStore` en het zwaartepunt
 *    dat de doorsnedemotor ervoor heeft bepaald;
 *  - hout: `parseRechthoek`, kruislaaghout `parseCltProfiel` + `cltMechanica`;
 *  - beton: `parseConcreteSection` (rechthoek, T, L) en de korf met de
 *    afleiding van de betontekening: `asAfstandMm` (c_nom van die rand +
 *    Ø_beugel + Ø/2), `staafPosities` voor de zijstaven en `korfOpX` — de
 *    spiegel van `cage_at_mm` — voor wat er op elke plaats langs de staaf ligt.
 *
 * ── WAT "AANZICHT" HIER BETEKENT ───────────────────────────────────────────
 *
 * De staaf ligt in het vlak van de tekening; de kijker kijkt langs de y-as van
 * de doorsnede (loodrecht op het model), vanaf +y. Elke langsrand van het
 * prisma wordt dan een lijn evenwijdig aan de staafas, op zijn hoogte v:
 *  - `contour`: de buitenranden (v_min, v_max) en de twee kopse einden;
 *  - `zichtbaar`: een rand waar het VOORVLAK verspringt — de onderkant van een
 *    flens die buiten het lijf uitsteekt, de flens van een betonnen T;
 *  - `verborgen` (streeplijn): een rand die achter materiaal ligt — de
 *    binnenwand van een koker of buis, het lijf van een I-profiel dat om zijn
 *    zwakke as staat;
 *  - `lamel`: een lijmnaad (gelamineerd hout, kruislaaghout);
 *  - `wapening`: de as van een staaflaag; `beugel`: een beugel, dwars.
 * Welke rand zichtbaar is en welke verborgen, volgt uit de doorsnede zelf
 * (`zijaanzicht`): op elke hoogte waar er een rand zit, wordt vergeleken wat de
 * kijker vlak erboven en vlak eronder als eerste raakt.
 *
 * De doorsnede staat GECENTREERD OP HAAR ZWAARTEPUNT: de systeemlijn is de
 * zwaartelijn, zoals in de solver. Bij kruislaaghout is dat de E-gewogen
 * zwaartelijn van `cltMechanica` — dezelfde lijn waarom de solver buigt.
 *
 * "Boven" (v > 0) is de zijde die de toetsing boven noemt: 90° linksom vanaf de
 * referentierichting (`lib/referentierichting.ts`) — het bovenvlak van een
 * ligger, de LINKERzijde van een staande staaf. Daar ligt dus de flens van een
 * T-balk en de bovenwapening, precies waar de betontoets ze neemt.
 *
 * ── ZWAKKE AS ──────────────────────────────────────────────────────────────
 *
 * Een staaf heeft in dit model GEEN doorsnederotatie (`BeamCheckConfig`: "een
 * staaf kent geen doorsnederotatie en de oplosser rekent met I_y"). Een profiel
 * dat om zijn zwakke as buigt, bestaat alleen als EIGEN DOORSNEDE: een
 * catalogusdeel dat in de profieleditor een kwartslag gedraaid is. De motor
 * rekent daar I_y om de zwakke as mee, en deze module tekent hetzelfde ontwerp:
 * de hoogte in het aanzicht is dan b, het lijf zit verborgen achter de flens.
 *
 * ── BEWUSTE VEREENVOUDIGINGEN ──────────────────────────────────────────────
 *
 *  - Afrondingsstralen tellen niet mee: de raaklijn van een walsuitronding
 *    tekent een aanzicht niet (tekenconventie), en de flenslijn ligt op t_f.
 *  - Bij een toelopende flens (INP, UNP) ligt de flenslijn op de catalogusmaat
 *    t_f, niet op het verloop van de flensdikte.
 *  - Een gat van een eigen doorsnede zit plaatselijk in de staaf en wordt in
 *    het aanzicht niet getekend; de basisdoorsnede wel.
 *  - Het model kent geen lameldikte van gelamineerd hout. De lamellen worden
 *    daarom SCHEMATISCH getekend: gelijke lamellen van ongeveer 40 mm (de
 *    gangbare maat; EN 14080 staat tot 45 mm toe), n = h/40 afgerond. Het is
 *    een aanduiding "dit is gelamineerd", geen maat waar iets van afhangt.
 *  - De langswapening stopt op c_nom van de kopse kant; de eerste beugel staat
 *    op s/2 van het begin van zijn stuk, de volgende op h.o.h. s — dezelfde
 *    plaatsing als de aanzicht in het betonvenster.
 */
import type { Beam, Node } from "../components/fem/femTypes";
import type { ConcreteSectionInput } from "./types/concrete/ConcreteSectionInput";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";
import type { RebarRow } from "./types/concrete/RebarRow";
import type { ReinforcementZones } from "./types/concrete/ReinforcementZones";
import type { DoorsnedeOntwerp, Basisprofiel } from "./profieleditor/types";
import { STEEL_SECTION_DIMS, type SteelSectionDims } from "./steelSectionDims.generated";
import { profileLookupKey, STEEL_GRADES } from "./steelCheckBuilder";
import {
  bepaalVerloop,
  parseRechthoek,
  resolveSection,
  CONCRETE_E_CM,
  TIMBER_E_MEAN,
  type VerloopMaten,
} from "./sectionResolver";
import { parseConcreteSection } from "./betonCheckBuilder";
import { cltMechanica, isCltProfiel, parseCltProfiel } from "./cltCheckBuilder";
import { zoekEigenDoorsnede } from "./profieleditor/eigenDoorsnedenStore";
import { matchSupportedTimberGrade } from "./timberCheckBuilder";
import { referentieVanStaaf, staafInReferentierichting } from "./referentierichting";
import { zoneGrenzenMm, ZONE_TOLERANTIE_MM } from "./betonZoneSneden";
import { asAfstandMm, dekkingVanZijdeMm, staafPosities } from "../components/beton/wapeningskorf";
import { korfOpX } from "../components/beton/dekking/zoneModel";

// ═══ Doorsnede: delen en zijaanzicht ════════════════════════════════════════

/** Een punt in het doorsnedevlak: y naar rechts (uit het model), z omhoog; mm. */
type YZ = readonly [number, number];

/**
 * Een deel van een doorsnede. Een veelhoek is CONVEX (een plaat, eventueel
 * gedraaid); een ring is een buis of, met r = 0, een volle ronde staaf.
 */
export type Doorsnededeel =
  | { soort: "veelhoek"; punten: YZ[] }
  | { soort: "ring"; y: number; z: number; R: number; r: number };

/** Het zijaanzicht van een doorsnede, in de coördinaten van die doorsnede. */
export interface Zijaanzicht {
  zMin: number;
  zMax: number;
  /** Hoogtes van de zichtbare randen tussen zMin en zMax, oplopend. */
  zichtbaar: number[];
  /** Hoogtes van de verborgen randen, oplopend. */
  verborgen: number[];
}

const rechthoek = (y0: number, z0: number, y1: number, z1: number): Doorsnededeel => ({
  soort: "veelhoek",
  punten: [[y0, z0], [y1, z0], [y1, z1], [y0, z1]],
});

/** De delen van één catalogusvorm, met de oorsprong linksonder in de omhullende. */
function catalogusDelen(
  soort: SteelSectionDims["kind"] | Basisprofiel["soort"],
  h: number, b: number, tw: number, tf: number,
): Doorsnededeel[] {
  switch (soort) {
    case "ISection":
    case "ISectionSchuin":
      return [
        rechthoek(0, 0, b, tf),
        rechthoek((b - tw) / 2, tf, (b + tw) / 2, h - tf),
        rechthoek(0, h - tf, b, h),
      ];
    case "Channel":
    case "ChannelSchuin":
      return [rechthoek(0, 0, b, tf), rechthoek(0, tf, tw, h - tf), rechthoek(0, h - tf, b, h)];
    case "Shs":
    case "Rhs":
      return [
        rechthoek(0, 0, b, tw),
        rechthoek(0, tw, tw, h - tw),
        rechthoek(b - tw, tw, b, h - tw),
        rechthoek(0, h - tw, b, h),
      ];
    case "Chs":
      return [{ soort: "ring", y: h / 2, z: h / 2, R: h / 2, r: Math.max(0, h / 2 - tw) }];
    case "Angle":
      // Hiel linksonder, het lange been staand (zie `SectionShape` "angle").
      return [rechthoek(0, 0, tw, h), rechthoek(tw, 0, b, tw)];
    case "Rechthoek":
      return [rechthoek(0, 0, b, h)];
  }
}

/** Oppervlak en zwaartepunt van de delen (mm², mm). */
export function zwaartepuntVanDelen(delen: readonly Doorsnededeel[]): { A: number; y: number; z: number } {
  let A = 0, Sy = 0, Sz = 0;
  for (const d of delen) {
    if (d.soort === "ring") {
      const a = Math.PI * (d.R * d.R - d.r * d.r);
      A += a; Sy += a * d.y; Sz += a * d.z;
      continue;
    }
    // Schoenveter, met het teken van de omloop eruit gedeeld.
    let a2 = 0, cy = 0, cz = 0;
    const p = d.punten;
    for (let i = 0; i < p.length; i++) {
      const [y0, z0] = p[i];
      const [y1, z1] = p[(i + 1) % p.length];
      const k = y0 * z1 - y1 * z0;
      a2 += k; cy += (y0 + y1) * k; cz += (z0 + z1) * k;
    }
    if (Math.abs(a2) < 1e-12) continue;
    const a = Math.abs(a2) / 2;
    A += a; Sy += a * (cy / (3 * a2)); Sz += a * (cz / (3 * a2));
  }
  return A > 0 ? { A, y: Sy / A, z: Sz / A } : { A: 0, y: 0, z: 0 };
}

/** De materiaalintervallen langs y op hoogte z, samengevoegd en oplopend. */
function intervallenOpHoogte(delen: readonly Doorsnededeel[], z: number): [number, number][] {
  const ruw: [number, number][] = [];
  for (const d of delen) {
    if (d.soort === "ring") {
      const dz = z - d.z;
      if (Math.abs(dz) >= d.R) continue;
      const yo = Math.sqrt(d.R * d.R - dz * dz);
      if (Math.abs(dz) < d.r) {
        const yi = Math.sqrt(d.r * d.r - dz * dz);
        ruw.push([d.y - yo, d.y - yi], [d.y + yi, d.y + yo]);
      } else {
        ruw.push([d.y - yo, d.y + yo]);
      }
      continue;
    }
    const ys: number[] = [];
    const p = d.punten;
    for (let i = 0; i < p.length; i++) {
      const [ya, za] = p[i];
      const [yb, zb] = p[(i + 1) % p.length];
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      ys.push(ya + ((z - za) * (yb - ya)) / (zb - za));
    }
    if (ys.length >= 2) ruw.push([Math.min(...ys), Math.max(...ys)]);
  }
  ruw.sort((a, b) => a[0] - b[0]);
  const uit: [number, number][] = [];
  for (const iv of ruw) {
    const laatste = uit[uit.length - 1];
    if (laatste && iv[0] <= laatste[1] + 1e-9) laatste[1] = Math.max(laatste[1], iv[1]);
    else uit.push([iv[0], iv[1]]);
  }
  return uit;
}

/** Stap boven en onder een rand, en de tolerantie waarmee twee randen gelijk heten (mm). */
const EPS_MM = 1e-4;
const TOL_MM = 1e-3;

/**
 * Het zijaanzicht van een doorsnede, gezien vanaf +y. Een rand op hoogte z is
 * ZICHTBAAR als het voorvlak (de grootste y met materiaal) er verspringt, en
 * VERBORGEN als alleen de verdeling van het materiaal erachter verandert.
 */
export function zijaanzicht(delen: readonly Doorsnededeel[]): Zijaanzicht | null {
  let zMin = Infinity, zMax = -Infinity;
  const kandidaten: number[] = [];
  for (const d of delen) {
    if (d.soort === "ring") {
      zMin = Math.min(zMin, d.z - d.R); zMax = Math.max(zMax, d.z + d.R);
      kandidaten.push(d.z - d.R, d.z + d.R);
      if (d.r > 0) kandidaten.push(d.z - d.r, d.z + d.r);
    } else {
      for (const [, z] of d.punten) {
        zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
        kandidaten.push(z);
      }
    }
  }
  if (!(zMax - zMin > TOL_MM)) return null;
  kandidaten.sort((a, b) => a - b);
  const zichtbaar: number[] = [];
  const verborgen: number[] = [];
  let vorige = -Infinity;
  for (const z of kandidaten) {
    if (z - vorige < TOL_MM) continue;
    vorige = z;
    if (z <= zMin + TOL_MM || z >= zMax - TOL_MM) continue;
    const boven = intervallenOpHoogte(delen, z + EPS_MM);
    const onder = intervallenOpHoogte(delen, z - EPS_MM);
    const voor = (iv: [number, number][]) => (iv.length ? iv[iv.length - 1][1] : -Infinity);
    if (Math.abs(voor(boven) - voor(onder)) > TOL_MM) { zichtbaar.push(z); continue; }
    const gelijk =
      boven.length === onder.length &&
      boven.every((iv, i) => Math.abs(iv[0] - onder[i][0]) <= TOL_MM && Math.abs(iv[1] - onder[i][1]) <= TOL_MM);
    if (!gelijk) verborgen.push(z);
  }
  return { zMin, zMax, zichtbaar, verborgen };
}

/** Draaien (graden, linksom) om de oorsprong, na eventueel spiegelen van y. */
function transformeer(d: Doorsnededeel, alphaGraden: number, spiegel: boolean, dy: number, dz: number): Doorsnededeel {
  const a = (alphaGraden * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const t = (y: number, z: number): YZ => {
    const y1 = spiegel ? -y : y;
    return [y1 * c - z * s + dy, y1 * s + z * c + dz];
  };
  if (d.soort === "ring") {
    const [y, z] = t(d.y, d.z);
    return { ...d, y, z };
  }
  return { soort: "veelhoek", punten: d.punten.map(([y, z]) => t(y, z)) };
}

/** Een catalogusdeel met zijn zwaartepunt in de oorsprong. */
function gecentreerd(delen: Doorsnededeel[]): Doorsnededeel[] {
  const c = zwaartepuntVanDelen(delen);
  return delen.map((d) => transformeer(d, 0, false, -c.y, -c.z));
}

/** De delen van het ontwerp van een eigen doorsnede, in de coördinaten van dat ontwerp. */
export function delenVanOntwerp(o: DoorsnedeOntwerp): Doorsnededeel[] {
  if (o.soort === "gat") {
    // De basis met de oorsprong linksonder, zoals de profieleditor hem
    // beschrijft; de gaten zitten plaatselijk in de staaf en tekent een
    // aanzicht niet.
    const p = o.basis;
    return catalogusDelen(p.soort, p.h, p.b, p.tw, p.tf);
  }
  const uit: Doorsnededeel[] = [];
  for (const l of o.lamellen) {
    // `b_mm` langs de plaatas, `t_mm` de dikte; 0° = liggend.
    const plaat = rechthoek(-l.b_mm / 2, -l.t_mm / 2, l.b_mm / 2, l.t_mm / 2);
    uit.push(transformeer(plaat, l.alphaGraden, false, l.y_mm, l.z_mm));
  }
  for (const c of o.catalogusdelen) {
    const p = c.profiel;
    for (const d of gecentreerd(catalogusDelen(p.soort, p.h, p.b, p.tw, p.tf))) {
      uit.push(transformeer(d, c.alphaGraden, c.gespiegeld, c.y_mm, c.z_mm));
    }
  }
  return uit;
}

// ═══ Doorsnede van een staaf ════════════════════════════════════════════════

export type AanzichtMateriaal = "staal" | "hout" | "beton" | "overig";

/**
 * Een doorsnede zoals het aanzicht hem nodig heeft: de delen, het zwaartepunt
 * (z, in dezelfde coördinaten) en de lijmnaden.
 */
export interface AanzichtDoorsnede {
  delen: Doorsnededeel[];
  zc: number;
  /** Lijmnaden (hoogtes, zelfde coördinaten); leeg bij een massieve doorsnede. */
  naden: number[];
  /** Alleen bij beton: de doorsnede zoals de toetsing hem leest, met z = 0 onderaan. */
  beton?: ConcreteSectionInput;
}

/** Nominale lameldikte waarmee gelamineerd hout schematisch wordt getekend (mm). */
export const GL_LAMEL_NOMINAAL_MM = 40;

const isGelamineerd = (materiaal: string | undefined): boolean => /^\s*GL/i.test(materiaal ?? "");

/** Gelijke lamellen van ongeveer `GL_LAMEL_NOMINAAL_MM` over de hoogte h: de naden. */
export function glNaden(h: number, aantal = Math.max(1, Math.round(h / GL_LAMEL_NOMINAAL_MM))): number[] {
  const uit: number[] = [];
  for (let i = 1; i < aantal; i++) uit.push((h * i) / aantal);
  return uit;
}

function rechthoekDoorsnede(b: number, h: number): AanzichtDoorsnede {
  return { delen: [rechthoek(0, 0, b, h)], zc: h / 2, naden: [] };
}

function iDoorsnede(m: VerloopMaten): AanzichtDoorsnede {
  return { delen: catalogusDelen("ISection", m.h, m.b, m.tw ?? 0, m.tf ?? 0), zc: m.h / 2, naden: [] };
}

/**
 * De doorsnede van (materiaal, profiel) voor het aanzicht, of `null` als die
 * niet te bepalen is. Dezelfde keuring als de solver: `resolveSection`.
 */
export function aanzichtDoorsnede(material: string | undefined, profile: string | undefined): AanzichtDoorsnede | null {
  const sec = resolveSection(material, profile);
  switch (sec.bron) {
    case "default":
      return null;
    case "eigen": {
      const eigen = zoekEigenDoorsnede(profile);
      if (!eigen) return null;
      const delen = delenVanOntwerp(eigen.ontwerp);
      if (delen.length === 0) return null;
      // Het zwaartepunt van de doorsnedemotor: in hetzelfde stelsel als het
      // ontwerp, en mét de gaten — de lijn waarom de solver buigt.
      const zc = Number.isFinite(eigen.eigenschappen.z_c_mm)
        ? eigen.eigenschappen.z_c_mm
        : zwaartepuntVanDelen(delen).z;
      return { delen, zc, naden: [] };
    }
    case "staal-db":
    case "vrij": {
      const rect = parseRechthoek(profile);
      if (sec.bron === "vrij" && rect) return rechthoekDoorsnede(rect.b, rect.h);
      const d = STEEL_SECTION_DIMS[profileLookupKey(profile ?? "")];
      if (!d) return null;
      const delen = catalogusDelen(d.kind, d.h, d.b, d.tw, d.tf);
      return { delen, zc: zwaartepuntVanDelen(delen).z, naden: [] };
    }
    case "hout-bxh": {
      const rect = parseRechthoek(profile);
      if (!rect) return null;
      const uit = rechthoekDoorsnede(rect.b, rect.h);
      if (isGelamineerd(material)) uit.naden = glNaden(rect.h);
      return uit;
    }
    case "clt": {
      if (!isCltProfiel(profile)) return null;
      const layup = parseCltProfiel(profile, material ?? "");
      if (!layup) return null;
      const h = layup.layers.reduce((s, l) => s + l.thickness_mm, 0);
      const naden: number[] = [];
      let z = h;
      for (let i = 0; i < layup.layers.length - 1; i++) {
        z -= layup.layers[i].thickness_mm;
        naden.push(z);
      }
      // De E-gewogen zwaartelijn (vanaf de bovenkant), zoals de solver buigt.
      const mech = cltMechanica(layup, (k) => TIMBER_E_MEAN[k]);
      return { delen: [rechthoek(0, 0, layup.width_mm, h)], zc: mech ? h - mech.z0 : h / 2, naden };
    }
    case "beton-bxh":
    case "beton-vorm": {
      const uit = parseConcreteSection(profile);
      if (!uit.ok) return null;
      const d = uit.doorsnede;
      const delen: Doorsnededeel[] = [];
      if (d.shape === "Rectangle" || d.b_w_mm === null || d.h_f_mm === null) {
        delen.push(rechthoek(0, 0, d.b_mm, d.h_mm));
      } else {
        // Zelfde plaatsing als `omtrekPunten`: bij een L staat het lijf tegen
        // de linkerrand, bij een T in het midden.
        const x0 = d.shape === "Ell" ? 0 : (d.b_mm - d.b_w_mm) / 2;
        const hF = d.h_f_mm;
        if (d.flange_at_bottom) {
          delen.push(rechthoek(0, 0, d.b_mm, hF), rechthoek(x0, hF, x0 + d.b_w_mm, d.h_mm));
        } else {
          delen.push(rechthoek(x0, 0, x0 + d.b_w_mm, d.h_mm - hF), rechthoek(0, d.h_mm - hF, d.b_mm, d.h_mm));
        }
      }
      return { delen, zc: zwaartepuntVanDelen(delen).z, naden: [], beton: d };
    }
  }
}

/** Soort materiaal, alleen voor de kleur van het vlak. */
export function aanzichtMateriaal(material: string | undefined): AanzichtMateriaal {
  const m = (material ?? "").trim();
  if (m in CONCRETE_E_CM) return "beton";
  if (matchSupportedTimberGrade(m) || m in TIMBER_E_MEAN) return "hout";
  if (STEEL_GRADES.includes(m.toUpperCase())) return "staal";
  return "overig";
}

// ═══ Staaf in aanzicht ══════════════════════════════════════════════════════

export interface Punt {
  x: number;
  z: number;
}

export type AanzichtLijnSoort = "contour" | "zichtbaar" | "verborgen" | "lamel" | "wapening" | "beugel";

/**
 * Eén lijn van het aanzicht. `s` loopt langs de staaf vanaf het begin in de
 * referentierichting (mm), `v` dwars erop vanaf de systeemlijn (mm, + = boven).
 * `a` en `b` zijn dezelfde twee punten in wereldcoördinaten.
 */
export interface AanzichtLijn {
  soort: AanzichtLijnSoort;
  s0: number;
  v0: number;
  s1: number;
  v1: number;
  a: Punt;
  b: Punt;
}

export interface StaafAanzicht {
  staafId: number;
  materiaal: AanzichtMateriaal;
  /** Staand (van voet naar kop): wordt vóór de liggende staven getekend. */
  staand: boolean;
  lengteMm: number;
  /** Begin en eind in de referentierichting, wereld (mm). */
  begin: Punt;
  eind: Punt;
  /** Eenheidsvector naar "boven" (90° linksom vanaf de referentierichting). */
  boven: Punt;
  /** Onder- en bovenrand (v, mm) aan begin en eind. */
  randen: { begin: { onder: number; boven: number }; eind: { onder: number; boven: number } };
  /** Het vlak van het aanzicht: vier hoekpunten, wereld (mm). */
  omtrek: Punt[];
  lijnen: AanzichtLijn[];
}

/** Het zijaanzicht van een doorsnede ten opzichte van haar zwaartepunt (v = z − z_c). */
interface VNiveaus {
  onder: number;
  boven: number;
  zichtbaar: number[];
  verborgen: number[];
  naden: number[];
}

function niveaus(d: AanzichtDoorsnede): VNiveaus | null {
  const za = zijaanzicht(d.delen);
  if (!za) return null;
  const v = (z: number) => z - d.zc;
  return {
    onder: v(za.zMin),
    boven: v(za.zMax),
    zichtbaar: za.zichtbaar.map(v),
    verborgen: za.verborgen.map(v),
    naden: d.naden.map(v),
  };
}

/** Eén looprichting van de langswapening of de beugels, met wat erop ligt. */
interface Stuk<T> {
  van: number;
  tot: number;
  waarde: T;
}

/**
 * De stukken van [0, L] waarop de korf gelijk blijft, met per stuk wat
 * `kies(korfOpX(...))` oplevert; aangrenzende stukken met dezelfde waarde
 * worden samengevoegd. `korfOpX` is de spiegel van `cage_at_mm` in de kern:
 * dezelfde regel waarmee de toets per snede zijn korf kiest.
 */
function stukkenLangs<T>(
  korf: ReinforcementCage,
  zones: ReinforcementZones | undefined,
  lengteMm: number,
  kies: (k: ReinforcementCage) => T,
  gelijk: (a: T, b: T) => boolean,
): Stuk<T>[] {
  const grenzen = [0, ...zoneGrenzenMm(zones).filter((x) => x > ZONE_TOLERANTIE_MM && x < lengteMm - ZONE_TOLERANTIE_MM), lengteMm];
  const uit: Stuk<T>[] = [];
  for (let i = 0; i + 1 < grenzen.length; i++) {
    const van = grenzen[i], tot = grenzen[i + 1];
    if (!(tot - van > ZONE_TOLERANTIE_MM)) continue;
    const waarde = kies(korfOpX(korf, zones, (van + tot) / 2));
    const vorige = uit[uit.length - 1];
    if (vorige && gelijk(vorige.waarde, waarde)) vorige.tot = tot;
    else uit.push({ van, tot, waarde });
  }
  return uit;
}

const rijGelijk = (a: RebarRow, b: RebarRow) => a.count === b.count && a.diameter_mm === b.diameter_mm;

/** Wapening en beugels in (s, v) — v ten opzichte van het zwaartepunt `zc`. */
function wapeningsLijnen(
  korf: ReinforcementCage,
  zones: ReinforcementZones | undefined,
  d: ConcreteSectionInput,
  zc: number,
  lengteMm: number,
): Omit<AanzichtLijn, "a" | "b">[] {
  const uit: Omit<AanzichtLijn, "a" | "b">[] = [];
  // Langs: de staven stoppen op c_nom van de kopse kant.
  const kop = Math.max(0, korf.cover_mm);
  for (const [kant, rijVan] of [
    ["onder", (k: ReinforcementCage) => k.bottom],
    ["boven", (k: ReinforcementCage) => k.top],
  ] as const) {
    const stukken = stukkenLangs(korf, zones, lengteMm, (k) => ({ k, rij: rijVan(k) }), (a, b) => rijGelijk(a.rij, b.rij));
    for (const st of stukken) {
      const { k, rij } = st.waarde;
      if (rij.count <= 0 || rij.diameter_mm <= 0) continue;
      const as = asAfstandMm(k, rij, kant);
      const z = kant === "onder" ? as : d.h_mm - as;
      const s0 = Math.max(st.van, kop), s1 = Math.min(st.tot, lengteMm - kop);
      if (s1 - s0 > 0) uit.push({ soort: "wapening", s0, v0: z - zc, s1, v1: z - zc });
    }
  }
  // Zijstaven (kolomkorf): liggen niet in zones, dus over de hele staaf.
  const zijZ = [...new Set(staafPosities(korf, d).filter((p) => p.rij === "opzij").map((p) => p.z))];
  for (const z of zijZ) {
    if (lengteMm - 2 * kop > 0) uit.push({ soort: "wapening", s0: kop, v0: z - zc, s1: lengteMm - kop, v1: z - zc });
  }
  // Beugels: per stuk met dezelfde beugel, de eerste op s/2.
  type Beugel = { d: number; s: number };
  const beugelStukken = stukkenLangs<Beugel | null>(
    korf, zones, lengteMm,
    (k) => {
      const s = k.stirrup_spacing_mm;
      return k.stirrup_diameter_mm > 0 && s !== undefined && s !== null && s > 0 ? { d: k.stirrup_diameter_mm, s } : null;
    },
    (a, b) => (a === null ? b === null : b !== null && a.d === b.d && a.s === b.s),
  );
  const zOnder = dekkingVanZijdeMm(korf, "Bottom");
  const zBoven = d.h_mm - dekkingVanZijdeMm(korf, "Top");
  for (const st of beugelStukken) {
    if (!st.waarde) continue;
    const { d: diam, s } = st.waarde;
    // De hartlijn van de beugel: een halve beugeldiameter binnen de dekking.
    const v0 = zOnder + diam / 2 - zc, v1 = zBoven - diam / 2 - zc;
    for (let x = st.van + s / 2; x < st.tot - 1e-9; x += s) {
      uit.push({ soort: "beugel", s0: x, v0, s1: x, v1 });
    }
  }
  return uit;
}

/**
 * Het aanzicht van één staaf, of `null` als de staaf geen knopen, geen lengte
 * of geen bepaalbare doorsnede heeft (dan blijft alleen de systeemlijn over).
 */
export function staafAanzicht(beam: Beam, nodes: Node[]): StaafAanzicht | null {
  // In de referentierichting, zoals de toetsing: dan is "boven" de zijde van
  // de bovenwapening en de flens van een T, en lopen de zones vanaf het begin.
  const ref = staafInReferentierichting(beam, nodes);
  const a = nodes.find((n) => n.id === ref.from);
  const b = nodes.find((n) => n.id === ref.to);
  if (!a || !b) return null;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(L > 0)) return null;
  const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
  const boven = { x: -u.z, z: u.x };

  // Begin- en einddoorsnede: bij een verlopend profiel de maten van het
  // verloop, anders tweemaal dezelfde.
  const verloop = bepaalVerloop(ref.material, ref.profile, ref.profileEnd);
  if (verloop.status === "fout") return null;
  let dBegin: AanzichtDoorsnede | null;
  let dEind: AanzichtDoorsnede | null;
  if (verloop.status === "verlopend") {
    const v = verloop.verloop;
    if (v.soort === "rechthoek") {
      dBegin = rechthoekDoorsnede(v.begin.b, v.begin.h);
      dEind = rechthoekDoorsnede(v.eind.b, v.eind.h);
      if (isGelamineerd(ref.material)) {
        // Evenveel lamellen aan beide einden, zodat de naden doorlopen.
        const n = Math.max(1, Math.round(Math.max(v.begin.h, v.eind.h) / GL_LAMEL_NOMINAAL_MM));
        dBegin.naden = glNaden(v.begin.h, n);
        dEind.naden = glNaden(v.eind.h, n);
      }
    } else {
      dBegin = iDoorsnede(v.begin);
      dEind = iDoorsnede(v.eind);
    }
  } else {
    dBegin = dEind = aanzichtDoorsnede(ref.material, ref.profile);
  }
  if (!dBegin || !dEind) return null;
  const nB = niveaus(dBegin);
  const nE = niveaus(dEind);
  if (!nB || !nE) return null;

  const P = (s: number, v: number): Punt => ({ x: a.x + u.x * s + boven.x * v, z: a.z + u.z * s + boven.z * v });
  const lijnen: AanzichtLijn[] = [];
  const lijn = (l: Omit<AanzichtLijn, "a" | "b">) => lijnen.push({ ...l, a: P(l.s0, l.v0), b: P(l.s1, l.v1) });

  lijn({ soort: "contour", s0: 0, v0: nB.onder, s1: L, v1: nE.onder });
  lijn({ soort: "contour", s0: 0, v0: nB.boven, s1: L, v1: nE.boven });
  lijn({ soort: "contour", s0: 0, v0: nB.onder, s1: 0, v1: nB.boven });
  lijn({ soort: "contour", s0: L, v0: nE.onder, s1: L, v1: nE.boven });
  // Begin en eind hebben dezelfde vorm (prismatisch, of een verloop binnen
  // één soort), dus dezelfde randen in dezelfde volgorde.
  for (const [soort, lb, le] of [
    ["zichtbaar", nB.zichtbaar, nE.zichtbaar],
    ["verborgen", nB.verborgen, nE.verborgen],
    ["lamel", nB.naden, nE.naden],
  ] as const) {
    if (lb.length !== le.length) continue;
    lb.forEach((v0, i) => lijn({ soort, s0: 0, v0, s1: L, v1: le[i] }));
  }

  const korf = ref.checkConfig?.betonKorf;
  if (dBegin.beton && korf && verloop.status === "prismatisch") {
    for (const l of wapeningsLijnen(korf, ref.checkConfig?.betonZones, dBegin.beton, dBegin.zc, L)) lijn(l);
  }

  return {
    staafId: beam.id,
    materiaal: aanzichtMateriaal(ref.material),
    staand: referentieVanStaaf(beam, nodes).staafstand === "Staand",
    lengteMm: L,
    begin: { x: a.x, z: a.z },
    eind: { x: b.x, z: b.z },
    boven,
    randen: { begin: { onder: nB.onder, boven: nB.boven }, eind: { onder: nE.onder, boven: nE.boven } },
    omtrek: [P(0, nB.onder), P(L, nE.onder), P(L, nE.boven), P(0, nB.boven)],
    lijnen,
  };
}

/**
 * Het aanzicht van alle staven, in TEKENVOLGORDE: eerst de staande staven
 * (kolommen), dan de rest. Waar een ligger op een kolom aansluit, overlappen de
 * twee aanzichten; de ligger ligt dan ervóór en dekt met zijn vlak de
 * kolomlijnen af, zoals een constructeur de knoop ook zou schetsen. Er wordt
 * geen verbinding getekend — alleen de volgorde, zodat het rustig oogt.
 */
export function modelAanzicht(model: { nodes: Node[]; beams: Beam[] }): StaafAanzicht[] {
  const uit: StaafAanzicht[] = [];
  for (const b of model.beams) {
    const a = staafAanzicht(b, model.nodes);
    if (a) uit.push(a);
  }
  // Stabiel: binnen een groep blijft de modelvolgorde.
  return [...uit.filter((a) => a.staand), ...uit.filter((a) => !a.staand)];
}
