/**
 * profielVorm — gedeelde definitie van een doorsnedevorm plus de conversie
 * van een profielnaam naar die vorm.
 *
 * Twee plekken tekenen doorsneden: het rapport (SectionSketch, papierstijl
 * met maatvoering en assenweergave) en het profielkeuzescherm
 * (ProfielMiniatuur, compact en thema-volgend). Beide gebruiken dezelfde
 * vormdefinitie en dezelfde naam→vorm-conversie, zodat een profiel overal
 * identiek wordt herkend en getekend.
 */
import { STEEL_SECTION_DIMS, type SteelSectionDims } from "../../lib/steelSectionDims.generated";
import { profileLookupKey } from "../../lib/steelCheckBuilder";
import { parseRechthoek } from "../../lib/sectionResolver";
import { parseConcreteSection } from "../../lib/betonCheckBuilder";
import type { ConcreteSectionInput } from "../../lib/types/concrete/ConcreteSectionInput";

export type SectionShape =
  | { type: "isection"; h: number; b: number; tw: number; tf: number; r: number }
  | { type: "channel"; h: number; b: number; tw: number; tf: number; r: number }
  | { type: "box"; h: number; b: number; t: number; r: number }
  | { type: "tube"; d: number; t: number }
  | { type: "rect"; h: number; b: number }
  /**
   * Betonnen T- of L-ligger. `bw` is de lijfbreedte, `hf` de flensdikte en
   * `b` de flensbreedte (in de toetsing de meewerkende breedte b_eff).
   *
   * `eenzijdig` onderscheidt de L van de T: bij een L staat het lijf tegen de
   * rand van de flens en niet in het midden. Voor de berekening is dat geen
   * verschil — b(z) is identiek — maar wie een L als een T tekent, laat de
   * constructeur iets anders zien dan hij heeft ingevoerd.
   */
  | {
      type: "tee";
      h: number;
      b: number;
      bw: number;
      hf: number;
      flensOnder: boolean;
      eenzijdig: boolean;
    };

/** Staaldims → tekenvorm; null wanneer we de vorm niet kennen. */
export function steelShape(dims: SteelSectionDims | undefined): SectionShape | null {
  if (!dims) return null;
  switch (dims.kind) {
    case "ISection":
      return { type: "isection", h: dims.h, b: dims.b, tw: dims.tw, tf: dims.tf, r: dims.r };
    case "Channel":
      return { type: "channel", h: dims.h, b: dims.b, tw: dims.tw, tf: dims.tf, r: dims.r };
    case "Shs":
    case "Rhs":
      return { type: "box", h: dims.h, b: dims.b, t: dims.tw, r: dims.r };
    case "Chs":
      return { type: "tube", d: dims.h, t: dims.tw };
  }
}

/**
 * Profielnaam → tekenvorm. Eerst de staaldatabase (genormaliseerde sleutel,
 * zelfde lookup als de toetsing), anders een rechthoek b×h (hout of vrije
 * maatvoering). null = geen tekening beschikbaar.
 */
export function shapeVanProfiel(profiel: string | undefined): SectionShape | null {
  if (!profiel) return null;
  const dims = STEEL_SECTION_DIMS[profileLookupKey(profiel)];
  if (dims) return steelShape(dims);
  // Een betonnen T of L staat als "T 400x450 bw=200 hf=50" in de profielnaam
  // en begint dus niet met een cijfer; `parseRechthoek` hieronder zou hem
  // niet zien en de tekening zou wegvallen.
  const beton = betonShape(profiel);
  if (beton) return beton;
  const rect = parseRechthoek(profiel);
  return rect ? { type: "rect", b: rect.b, h: rect.h } : null;
}

/** Betondoorsnede uit de profielnaam → tekenvorm; null als het er geen is. */
export function betonShape(profiel: string | undefined): SectionShape | null {
  const uit = parseConcreteSection(profiel);
  if (!uit.ok) return null;
  return shapeVanBetonDoorsnede(uit.doorsnede);
}

/** Dezelfde omzetting, maar vanuit een al geparseerde doorsnede. */
export function shapeVanBetonDoorsnede(d: ConcreteSectionInput): SectionShape | null {
  if (d.shape === "Rectangle") return { type: "rect", b: d.b_mm, h: d.h_mm };
  if (d.b_w_mm === null || d.h_f_mm === null) return null;
  return {
    type: "tee",
    b: d.b_mm,
    h: d.h_mm,
    bw: d.b_w_mm,
    hf: d.h_f_mm,
    flensOnder: d.flange_at_bottom,
    eenzijdig: d.shape === "Ell",
  };
}

/** Buitenmaten van een vorm (mm) — voor schaling en aria-teksten. */
export function buitenmaten(shape: SectionShape): { b: number; h: number } {
  return shape.type === "tube"
    ? { b: shape.d, h: shape.d }
    : { b: shape.b, h: shape.h };
}

/**
 * SVG-pad van de contour, geschaald met `s` en verschoven naar (x0, y0).
 * Mét échte afrondingsstralen: walsuitrondingen bij I- en U-profielen,
 * afgeronde hoeken bij kokers, twee cirkels bij buizen; een rechthoek
 * (hout) blijft strak. `fillRule: "evenodd"` markeert holle vormen.
 */
export function shapePath(shape: SectionShape, s: number, x0: number, y0: number): {
  d: string;
  fillRule?: "evenodd";
} {
  const X = (x: number) => (x0 + x * s).toFixed(2);
  const Y = (y: number) => (y0 + y * s).toFixed(2);
  const P = (x: number, y: number) => `${X(x)} ${Y(y)}`;
  // Kwartcirkelboog met straal r naar (x, y); sweep 0 = holle uitronding
  // (walsuitronding), sweep 1 = bolle hoek (kokerhoek).
  const A = (r: number, x: number, y: number, sweep: 0 | 1) =>
    `A ${(r * s).toFixed(2)} ${(r * s).toFixed(2)} 0 0 ${sweep} ${P(x, y)}`;

  switch (shape.type) {
    case "isection": {
      const { h, b, tw, tf } = shape;
      // Straal defensief begrensd zodat de boog altijd binnen het profiel past.
      const r = Math.max(0, Math.min(shape.r, (b - tw) / 2 - 0.5, (h - 2 * tf) / 2 - 0.5));
      const wl = (b - tw) / 2; // flensuitstek links van het lijf
      const wr = wl + tw; // rechterkant lijf
      return {
        d:
          `M ${P(0, 0)} L ${P(b, 0)} L ${P(b, tf)} L ${P(wr + r, tf)} ` +
          `${A(r, wr, tf + r, 0)} L ${P(wr, h - tf - r)} ${A(r, wr + r, h - tf, 0)} ` +
          `L ${P(b, h - tf)} L ${P(b, h)} L ${P(0, h)} L ${P(0, h - tf)} ` +
          `L ${P(wl - r, h - tf)} ${A(r, wl, h - tf - r, 0)} L ${P(wl, tf + r)} ` +
          `${A(r, wl - r, tf, 0)} L ${P(0, tf)} Z`,
      };
    }
    case "channel": {
      const { h, b, tw, tf } = shape;
      const r = Math.max(0, Math.min(shape.r, b - tw - 0.5, (h - 2 * tf) / 2 - 0.5));
      return {
        d:
          `M ${P(0, 0)} L ${P(b, 0)} L ${P(b, tf)} L ${P(tw + r, tf)} ` +
          `${A(r, tw, tf + r, 0)} L ${P(tw, h - tf - r)} ${A(r, tw + r, h - tf, 0)} ` +
          `L ${P(b, h - tf)} L ${P(b, h)} L ${P(0, h)} Z`,
      };
    }
    case "box": {
      const { h, b, t } = shape;
      // Buitenhoekstraal: datastraal, maar minimaal 1,5t (warmgewalste
      // kokers hebben 1,5t à 2t); binnenstraal = buitenstraal − t.
      const ro = Math.min(Math.max(shape.r, 1.5 * t), Math.min(b, h) / 2 - 0.5);
      const ri = Math.max(ro - t, 0.5);
      const buiten =
        `M ${P(ro, 0)} L ${P(b - ro, 0)} ${A(ro, b, ro, 1)} L ${P(b, h - ro)} ` +
        `${A(ro, b - ro, h, 1)} L ${P(ro, h)} ${A(ro, 0, h - ro, 1)} ` +
        `L ${P(0, ro)} ${A(ro, ro, 0, 1)} Z`;
      const binnen =
        `M ${P(t + ri, t)} L ${P(b - t - ri, t)} ${A(ri, b - t, t + ri, 1)} ` +
        `L ${P(b - t, h - t - ri)} ${A(ri, b - t - ri, h - t, 1)} L ${P(t + ri, h - t)} ` +
        `${A(ri, t, h - t - ri, 1)} L ${P(t, t + ri)} ${A(ri, t + ri, t, 1)} Z`;
      return { d: `${buiten} ${binnen}`, fillRule: "evenodd" };
    }
    case "tube": {
      const { d, t } = shape;
      const rBuiten = d / 2;
      const rBinnen = Math.max(rBuiten - t, 0.5);
      const cx = x0 + rBuiten * s;
      const cy = y0 + rBuiten * s;
      const cirkel = (rad: number) =>
        `M ${(cx - rad * s).toFixed(2)} ${cy.toFixed(2)} ` +
        `a ${(rad * s).toFixed(2)} ${(rad * s).toFixed(2)} 0 1 0 ${(2 * rad * s).toFixed(2)} 0 ` +
        `a ${(rad * s).toFixed(2)} ${(rad * s).toFixed(2)} 0 1 0 ${(-2 * rad * s).toFixed(2)} 0 Z`;
      return { d: `${cirkel(rBuiten)} ${cirkel(rBinnen)}`, fillRule: "evenodd" };
    }
    case "rect": {
      const { h, b } = shape;
      return { d: `M ${P(0, 0)} L ${P(b, 0)} L ${P(b, h)} L ${P(0, h)} Z` };
    }
    case "tee": {
      // y = 0 is hier de BOVENrand van de tekening. Geen afrondingsstralen:
      // een gestorte betondoorsnede heeft ze niet.
      const { h, b, bw, hf } = shape;
      const xl = shape.eenzijdig ? 0 : (b - bw) / 2;
      const xr = xl + bw;
      return {
        d: shape.flensOnder
          ? `M ${P(xl, 0)} L ${P(xr, 0)} L ${P(xr, h - hf)} L ${P(b, h - hf)} ` +
            `L ${P(b, h)} L ${P(0, h)} L ${P(0, h - hf)} L ${P(xl, h - hf)} Z`
          : `M ${P(0, 0)} L ${P(b, 0)} L ${P(b, hf)} L ${P(xr, hf)} ` +
            `L ${P(xr, h)} L ${P(xl, h)} L ${P(xl, hf)} L ${P(0, hf)} Z`,
      };
    }
  }
}
