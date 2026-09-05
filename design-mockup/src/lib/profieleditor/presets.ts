/**
 * Startvormen voor het samenstellen: een paar veelgebruikte plaatdoorsneden
 * en een dubbel U-profiel. Alleen geometrie — de eigenschappen komen altijd
 * uit de motor.
 */
import { basisprofielVan } from "./catalogus";
import { nieuwId } from "./id";
import type { Catalogusdeel, DoorsnedeOntwerp, Lamel } from "./types";

function lamel(b_mm: number, t_mm: number, y_mm: number, z_mm: number, alphaGraden = 0): Lamel {
  return { id: nieuwId(), b_mm, t_mm, y_mm, z_mm, alphaGraden };
}

function samenstelling(lamellen: Lamel[], catalogusdelen: Catalogusdeel[] = []): DoorsnedeOntwerp {
  return { soort: "samenstelling", lamellen, catalogusdelen, celMeenemen: true };
}

export interface Preset {
  id: string;
  /** Korte naam op de knop; het paneel toont hem naast een silhouet. */
  label: string;
  /** Volledige omschrijving; staat als tooltip op de knop, niet in beeld. */
  omschrijving: string;
  maak: () => DoorsnedeOntwerp;
}

export const PRESETS: Preset[] = [
  {
    id: "gelaste-i",
    label: "Gelaste I",
    omschrijving: "Flenzen 200×15, lijf 400×10 (h = 430)",
    maak: () =>
      samenstelling([
        lamel(200, 15, 0, 207.5),
        lamel(200, 15, 0, -207.5),
        lamel(400, 10, 0, 0, 90),
      ]),
  },
  {
    id: "koker",
    label: "Koker",
    omschrijving: "Vier platen, 200×200, wanden 10 — gesloten cel (Bredt)",
    maak: () =>
      samenstelling([
        lamel(200, 10, 0, 95),
        lamel(200, 10, 0, -95),
        lamel(180, 10, 95, 0, 90),
        lamel(180, 10, -95, 0, 90),
      ]),
  },
  {
    id: "t",
    label: "T-profiel",
    omschrijving: "Flens 200×20 op een lijf 180×10",
    maak: () => samenstelling([lamel(200, 20, 0, 190), lamel(180, 10, 0, 90, 90)]),
  },
  {
    id: "hoek",
    label: "Hoek L",
    omschrijving: "Hoekprofiel 100×100×10, scherpe hoek",
    maak: () => samenstelling([lamel(100, 10, 5, 50, 90), lamel(90, 10, 55, 5)]),
  },
  {
    id: "sfb",
    label: "SFB-ligger",
    omschrijving: "Geïntegreerde ligger: HEB 200 met onderplaat 400×15 — de vloer rust op de plaatranden",
    maak: () => {
      const p = basisprofielVan("HEB 200");
      if (!p) return samenstelling([]);
      // De onderplaat sluit aan tegen de onderkant van de onderflens: het
      // profiel staat op zijn zwaartepunt (z = 0), dus de onderkant ligt op
      // −h/2 en het hart van de plaat een halve plaatdikte daaronder.
      const t = 15;
      return samenstelling(
        [lamel(400, t, 0, -(p.h / 2 + t / 2))],
        [{ id: nieuwId(), profiel: p, y_mm: 0, z_mm: 0, alphaGraden: 0, gespiegeld: false }],
      );
    },
  },
  {
    id: "dubbel-unp",
    label: "2× UNP 200",
    omschrijving: "Twee UNP 200 rug aan rug — catalogusdelen, gespiegeld om de z-as",
    maak: () => {
      const p = basisprofielVan("UNP 200");
      if (!p) return samenstelling([]);
      // De motor plaatst een deel op zijn zwaartepunt; e_y ≈ 20,2 mm voor
      // UNP 200. De tekening pakt het exacte zwaartepunt uit het antwoord.
      const e = 20.2;
      return samenstelling(
        [],
        [
          { id: nieuwId(), profiel: p, y_mm: e, z_mm: 0, alphaGraden: 0, gespiegeld: false },
          { id: nieuwId(), profiel: p, y_mm: -e, z_mm: 0, alphaGraden: 0, gespiegeld: true },
        ],
      );
    },
  },
];
