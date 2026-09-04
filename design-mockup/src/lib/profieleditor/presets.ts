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
  label: string;
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
    label: "Koker uit vier platen",
    omschrijving: "200×200, wanden 10 — gesloten cel (Bredt)",
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
    label: "Hoekprofiel L",
    omschrijving: "100×100×10, scherpe hoek",
    maak: () => samenstelling([lamel(100, 10, 5, 50, 90), lamel(90, 10, 55, 5)]),
  },
  {
    id: "dubbel-unp",
    label: "Twee UNP 200 rug-aan-rug",
    omschrijving: "Catalogusdelen, gespiegeld om de z-as",
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
