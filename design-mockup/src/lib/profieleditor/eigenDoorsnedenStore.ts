/**
 * eigenDoorsnedenStore — de bewaarde eigen doorsneden uit de profieleditor.
 *
 * Een eigen doorsnede landt op een staaf als profielnaam met het voorvoegsel
 * `EIGEN:` (bijvoorbeeld `EIGEN:IPE 300 met lijfgat`), zodat de bestaande
 * velden `Beam.material` / `Beam.profile` ongewijzigd blijven en elke plek
 * die een profielnaam leest hem aan het voorvoegsel herkent. De helpers
 * hieronder zijn de enige plek die dat voorvoegsel kent.
 *
 * Opslag: localStorage (per browser/desktop-installatie). Opname in het
 * projectbestand is een integratiestap van de hoofdsessie; daarvoor bestaan
 * `exporteer()` / `importeer()`.
 */
import { create } from "zustand";
import type { CustomSection } from "../types/steel/CustomSection";
import type { SectionProperties } from "../types/steel/SectionProperties";
import type { EigenDoorsnede } from "./types";

export const EIGEN_PREFIX = "EIGEN:";
const OPSLAG_SLEUTEL = "openaec.eigenDoorsneden.v1";

/** Profielnaam zoals hij op een staaf komt te staan. */
export function profielnaamVan(d: Pick<EigenDoorsnede, "naam">): string {
  return `${EIGEN_PREFIX}${d.naam}`;
}

/** Is deze profielnaam een verwijzing naar een eigen doorsnede? */
export function isEigenProfiel(profile: string | undefined): boolean {
  return !!profile && profile.startsWith(EIGEN_PREFIX);
}

/** Naam van de eigen doorsnede achter een profielnaam (zonder voorvoegsel). */
export function eigenNaamVan(profile: string | undefined): string | null {
  return isEigenProfiel(profile) ? profile!.slice(EIGEN_PREFIX.length) : null;
}

interface EigenDoorsnedenState {
  items: EigenDoorsnede[];
  /** Voeg toe of vervang (op id én op naam: een naam is uniek). */
  bewaar: (d: EigenDoorsnede) => void;
  verwijder: (id: string) => void;
  /** Vervang de complete lijst (projectbestand laden). */
  vervangAlles: (items: EigenDoorsnede[]) => void;
}

function lees(): EigenDoorsnede[] {
  try {
    const ruw = localStorage.getItem(OPSLAG_SLEUTEL);
    if (!ruw) return [];
    const data = JSON.parse(ruw);
    return Array.isArray(data) ? (data as EigenDoorsnede[]) : [];
  } catch {
    return [];
  }
}

function schrijf(items: EigenDoorsnede[]): void {
  try {
    localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(items));
  } catch {
    // Geen opslag beschikbaar (privévenster, quota): de sessie werkt gewoon door.
  }
}

export const useEigenDoorsneden = create<EigenDoorsnedenState>((set, get) => ({
  items: lees(),
  bewaar: (d) => {
    const rest = get().items.filter((x) => x.id !== d.id && x.naam !== d.naam);
    const items = [...rest, d].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
    schrijf(items);
    set({ items });
  },
  verwijder: (id) => {
    const items = get().items.filter((x) => x.id !== id);
    schrijf(items);
    set({ items });
  },
  vervangAlles: (items) => {
    schrijf(items);
    set({ items: [...items] });
  },
}));

/** Zoek een eigen doorsnede op profielnaam (`EIGEN:…`) — buiten React bruikbaar. */
export function zoekEigenDoorsnede(profile: string | undefined): EigenDoorsnede | undefined {
  const naam = eigenNaamVan(profile);
  if (naam === null) return undefined;
  return useEigenDoorsneden.getState().items.find((d) => d.naam === naam);
}

/** Alle bewaarde doorsneden als kopie — voor opname in een projectbestand. */
export function exporteer(): EigenDoorsnede[] {
  return useEigenDoorsneden.getState().items.map((d) => ({ ...d }));
}

/** Projectbestand → store (vervangt de lokale lijst). */
export function importeer(items: EigenDoorsnede[]): void {
  useEigenDoorsneden.getState().vervangAlles(items);
}

/**
 * De doorsnede zoals de toetsing hem wil hebben (`BeamCheckInput.custom_section`).
 *
 * Een samenstelling uit uitsluitend lamellen gaat als geometrie mee: de kern
 * rekent hem dan zelf door en klasseert per plaatdeel volgens tabel 5.2.
 * Alles anders (catalogusprofiel met gat, samenstelling met catalogusdelen)
 * gaat als kant-en-klare eigenschappen mee, met de vormaanduiding erbij.
 */
export function naarCustomSection(d: EigenDoorsnede): CustomSection {
  const o = d.ontwerp;
  if (o.soort === "samenstelling" && o.catalogusdelen.length === 0 && o.lamellen.length > 0) {
    return {
      naam: d.naam,
      lamellen: o.lamellen.map((l) => ({
        b_mm: l.b_mm,
        t_mm: l.t_mm,
        y_mm: l.y_mm,
        z_mm: l.z_mm,
        alpha_rad: (l.alphaGraden * Math.PI) / 180,
      })),
      gesloten_cellen: (d.motor.cel ? [d.motor.cel] : []).map((c) => ({
        midlijn: c.midlijn.map(([y, z]) => ({ y_mm: y, z_mm: z })),
        dikte_mm: c.dikte_mm,
        lamellen: c.lamellen,
      })),
      eigenschappen: null,
      vorm: "Onbekend",
    };
  }
  return {
    naam: d.naam,
    lamellen: [],
    gesloten_cellen: [],
    eigenschappen: d.eigenschappen,
    vorm: d.vorm,
  };
}

// De solverstijfheid (E, A, I) van een eigen doorsnede bepaalt
// `resolveSection` in sectionResolver.ts zelf — die kent E_STAAL en is de
// enige plek waar de solver zijn doorsnede vandaan haalt. Zo importeert deze
// store niets uit de resolver en de resolver wél uit de store: één richting.

/** De eigenschappen die het rapport toont — één plek, geen herberekening. */
export function eigenschappenVan(d: EigenDoorsnede): SectionProperties {
  return d.eigenschappen;
}
