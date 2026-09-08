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
  /**
   * U-profiel. `flensHelling` is de helling van het flens*binnen*vlak als
   * verhouding (0,08 = 8 %); 0 geeft evenwijdige flenzen.
   *
   * Zonder dat veld kwamen UNP en UPE op dezelfde tekening uit en zag een UNP
   * eruit als een UPE. `tf` is bij een toelopende flens niet de dikte overal:
   * hij geldt op halve flensbreedte (x = b/2 vanaf de rug van het lijf), zie
   * `flensDikte`.
   */
  | {
      type: "channel";
      h: number;
      b: number;
      tw: number;
      tf: number;
      r: number;
      flensHelling: number;
    }
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

/** De U-vorm los, zodat de flensmeetkunde hem als parameter kan aannemen. */
export type ChannelShape = Extract<SectionShape, { type: "channel" }>;

/**
 * Flensdikte van een U-profiel op afstand `x` van de rug van het lijf (mm).
 *
 * Bij een toelopende flens (UNP) is de catalogusmaat `tf` NIET de dikte overal
 * en ook niet de gemiddelde dikte: hij geldt op halve flensbreedte, x = b/2.
 * Dat is dezelfde afspraak waarmee de doorsnedegrootheden zijn opgesteld
 * (zie `channel_section_props_taps` in src-tauri/crates/section-properties/
 * src/channel.rs) en het is na te rekenen aan het catalogusoppervlak, dat bij
 * het tekenen nergens is gebruikt. Grootste afwijking over de reeks
 * UNP 80–300, gemeten aan de getekende contour:
 *
 *   tf op x = b/2                        0,02 %
 *   tf halverwege de vrije uitkraging    1,72 %
 *   evenwijdige flenzen (de oude fout)   2,64 %
 *
 * Daaruit volgt met de helling s de dikte bij het lijf t₀ = tf + s·(b/2 − tw)
 * en aan de punt t₁ = tf − s·b/2. Bij `flensHelling = 0` geeft dit gewoon `tf`.
 */
export function flensDikte(shape: ChannelShape, x: number): number {
  return shape.tf + shape.flensHelling * (shape.b / 2 - x);
}

/**
 * Flenshelling die bij een profielnaam hoort; 0 = evenwijdige flenzen.
 *
 * Uit de staaldatabase, zodat er geen tweede lijst met hellingen ontstaat.
 * Een onbekende naam geeft 0: liever een U met evenwijdige flenzen dan een
 * verzonnen helling.
 */
export function flensHellingVanProfiel(profiel: string | undefined): number {
  if (!profiel) return 0;
  return STEEL_SECTION_DIMS[profileLookupKey(profiel)]?.flensHelling ?? 0;
}

/** Staaldims → tekenvorm; null wanneer we de vorm niet kennen. */
export function steelShape(dims: SteelSectionDims | undefined): SectionShape | null {
  if (!dims) return null;
  switch (dims.kind) {
    case "ISection":
      return { type: "isection", h: dims.h, b: dims.b, tw: dims.tw, tf: dims.tf, r: dims.r };
    case "Channel":
      return {
        type: "channel",
        h: dims.h,
        b: dims.b,
        tw: dims.tw,
        tf: dims.tf,
        r: dims.r,
        // Ontbreekt de helling in de database, dan tekenen we evenwijdig.
        // Dat is juist voor de UPE-reeks en zichtbaar fout voor een nieuwe
        // reeks met toelopende flens — daarom hoort hij in profiles.json.
        flensHelling: dims.flensHelling ?? 0,
      };
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
 *
 * Een U-profiel met `flensHelling > 0` krijgt de toelopende flens mét
 * flenstipafronding; met helling 0 blijft het de vorm met evenwijdige
 * flenzen. Zo is een UNP op de tekening te onderscheiden van een UPE.
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
      // NB: `s` is in deze functie de SCHAALFACTOR van de tekening; de
      // flenshelling heet daarom `helling` en niet `s`.
      const helling = Math.max(0, shape.flensHelling);
      // Dikte aan de flenspunt. Zonder helling is dat tf; wordt hij nul of negatief
      // dan snijdt het binnenvlak door het buitenvlak heen en is de opgegeven
      // maatvoering onmogelijk — dan liever de evenwijdige vorm dan een
      // omgeklapte tekening.
      const tPunt = flensDikte(shape, b);
      if (helling === 0 || tPunt <= 0) {
        const r = Math.max(0, Math.min(shape.r, b - tw - 0.5, (h - 2 * tf) / 2 - 0.5));
        return {
          d:
            `M ${P(0, 0)} L ${P(b, 0)} L ${P(b, tf)} L ${P(tw + r, tf)} ` +
            `${A(r, tw, tf + r, 0)} L ${P(tw, h - tf - r)} ${A(r, tw + r, h - tf, 0)} ` +
            `L ${P(b, h - tf)} L ${P(b, h)} L ${P(0, h)} Z`,
        };
      }
      // ── Toelopende flens (UNP) ──────────────────────────────────────────
      // Het flensBUITENvlak blijft vlak op y = 0 en y = h; het BINNENvlak
      // loopt met `helling` toe naar de punt. Twee afrondingen:
      //   r1 — walsuitronding lijf/flens, middelpunt in de HOLTE;
      //   r2 — flenstipafronding, middelpunt in het MATERIAAL.
      // r2 = r1/2 is de DIN 1026-1-verhouding; dezelfde die de oude
      // staaltabel noemt ("binnenste afronding r = t, buitenste r₁ = t/2",
      // en in de database is r inderdaad gelijk aan tf voor de hele
      // UNP-reeks). Dit is dezelfde constructie als `u_profiel_schuin` in
      // src-tauri/crates/section-properties/src/contour.rs, zodat de
      // tekening en de rekenkern dezelfde contour beschrijven.
      const hh = h / 2;
      const k = Math.sqrt(1 + helling * helling); // lengte van de schuine eenheidsstap
      // Hoogte van het binnenvlak boven het hart, op x: a + helling·x.
      const a = hh - tf - (helling * b) / 2;
      // De uitronding moet in de holte passen, de tipafronding in het dunste
      // deel van de flens. De deling door k houdt de tipboog binnen de punt;
      // op de catalogusmaten is die grens nooit bindend (r/2 blijft ruim
      // onder t_punt), hij vangt alleen handmatige maatvoering op.
      const r1 = Math.max(0, Math.min(shape.r, (b - tw) / 2, a));
      const r2 = Math.max(0, Math.min(shape.r / 2, (b - tw) / 2, tPunt / k));
      const xc1 = tw + r1; // middelpunt walsuitronding
      const d1 = a + helling * xc1 - r1 * k; // hoogte ervan boven het hart
      const xt1 = xc1 - (r1 * helling) / k; // raakpunt op het schuine vlak
      const xc2 = b - r2; // middelpunt tipafronding
      const d2 = a + helling * xc2 + r2 * k;
      const xt2 = xc2 + (r2 * helling) / k;
      const bin = (x: number) => flensDikte(shape, x); // binnenvlak bovenflens
      return {
        d:
          `M ${P(0, 0)} L ${P(b, 0)} L ${P(b, hh - d2)} ` +
          `${A(r2, xt2, bin(xt2), 1)} L ${P(xt1, bin(xt1))} ` +
          `${A(r1, tw, hh - d1, 0)} L ${P(tw, hh + d1)} ` +
          `${A(r1, xt1, h - bin(xt1), 0)} L ${P(xt2, h - bin(xt2))} ` +
          `${A(r2, b, hh + d2, 1)} L ${P(b, h)} L ${P(0, h)} Z`,
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
