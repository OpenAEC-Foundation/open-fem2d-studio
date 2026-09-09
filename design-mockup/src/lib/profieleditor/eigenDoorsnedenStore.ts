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
 *
 * # Waarom hier geen React in zit
 *
 * Dit bestand gebruikt bewust `zustand/vanilla` en niet de React-ingang van
 * zustand. `sectionResolver.ts` leest `zoekEigenDoorsnede` en die resolver
 * loopt óók in de sidecar — een kaal Node-proces zonder browser. Via de
 * React-ingang trok esbuild React de sidecarbundel in, waarna de bundelcontrole
 * terecht struikelde over `window.`-verwijzingen en `assets/fem-kernel.mjs`
 * niet meer te herbouwen was.
 *
 * De React-binding staat daarom apart in `useEigenDoorsneden.ts`. Wie in een
 * component de lijst wil volgen, importeert daar; wie buiten React alleen wil
 * opzoeken, blijft hier.
 */
import { createStore } from "zustand/vanilla";
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
  /** Vervang de complete lijst — alleen voor "bibliotheek leegmaken". */
  vervangAlles: (items: EigenDoorsnede[]) => void;
  /**
   * Voeg binnenkomende doorsneden samen met de lokale; bij een gelijke naam
   * wint de BINNENKOMENDE (zie `importeer`). Geeft de namen terug die
   * daarbij inhoudelijk zijn overschreven.
   */
  voegSamen: (binnen: EigenDoorsnede[]) => string[];
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

function sorteer(items: EigenDoorsnede[]): EigenDoorsnede[] {
  return [...items].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

/**
 * Inhoudelijk gelijk? Vergelijkt alles wat de doorsnede BESCHRIJFT en laat
 * `id` en `berekendOp` er bewust buiten: dezelfde doorsnede die op twee
 * machines is bewaard heeft daar altijd andere waarden, en dan zou elke
 * projectopening als "overschreven" gemeld worden.
 */
function doorsnedeGelijk(a: EigenDoorsnede, b: EigenDoorsnede): boolean {
  const kern = (d: EigenDoorsnede) =>
    JSON.stringify({ ontwerp: d.ontwerp, eigenschappen: d.eigenschappen, vorm: d.vorm, motor: d.motor });
  return kern(a) === kern(b);
}

export const eigenDoorsnedenStore = createStore<EigenDoorsnedenState>((set, get) => ({
  items: lees(),
  bewaar: (d) => {
    const rest = get().items.filter((x) => x.id !== d.id && x.naam !== d.naam);
    const items = sorteer([...rest, d]);
    schrijf(items);
    set({ items });
  },
  verwijder: (id) => {
    const items = get().items.filter((x) => x.id !== id);
    schrijf(items);
    set({ items });
  },
  vervangAlles: (items) => {
    const gesorteerd = sorteer(items);
    schrijf(gesorteerd);
    set({ items: gesorteerd });
  },
  voegSamen: (binnen) => {
    const lokaal = get().items;
    const overschreven = binnen
      .filter((b) => {
        const bestaand = lokaal.find((x) => x.naam === b.naam);
        return bestaand !== undefined && !doorsnedeGelijk(bestaand, b);
      })
      .map((b) => b.naam);
    // Weg met alles wat de binnenkomende lijst opnieuw beschrijft — op naam
    // (de staaf verwijst met `EIGEN:<naam>`, dus de naam is de sleutel) én op
    // id, zodat er nooit twee rijen met hetzelfde id overblijven.
    const rest = lokaal.filter((x) => !binnen.some((b) => b.naam === x.naam || b.id === x.id));
    const items = sorteer([...rest, ...binnen]);
    schrijf(items);
    set({ items });
    return overschreven;
  },
}));

/** Zoek een eigen doorsnede op profielnaam (`EIGEN:…`) — buiten React bruikbaar. */
export function zoekEigenDoorsnede(profile: string | undefined): EigenDoorsnede | undefined {
  const naam = eigenNaamVan(profile);
  if (naam === null) return undefined;
  return eigenDoorsnedenStore.getState().items.find((d) => d.naam === naam);
}

/**
 * De doorsneden waarnaar DIT project verwijst — meer hoort er niet in het
 * projectbestand.
 *
 * De vorige regel ("alles wat lokaal bewaard is") maakte van elk
 * projectbestand een kopie van de hele persoonlijke bibliotheek: open je zo'n
 * bestand op een andere machine, dan kreeg die er doorsneden bij die met het
 * project niets te maken hebben — en met het oude, vervangende laden wiste
 * dat bovendien wat daar al stond.
 *
 * Wat er wél in moet is niet onderhandelbaar: een staaf met `EIGEN:<naam>`
 * heeft geen doorsnede meer zonder deze rij, want de doorsnedemotor-uitvoer
 * is niet uit de naam terug te rekenen. Daarom precies de gebruikte namen.
 */
export function exporteer(
  staven: Iterable<{ profile?: string }>,
): EigenDoorsnede[] {
  const gebruikt = new Set<string>();
  for (const s of staven) {
    const naam = eigenNaamVan(s.profile);
    if (naam !== null) gebruikt.add(naam);
  }
  return eigenDoorsnedenStore
    .getState()
    .items.filter((d) => gebruikt.has(d.naam))
    .map((d) => ({ ...d }));
}

/**
 * Projectbestand → winkel: SAMENVOEGEN, waarbij het project wint bij een
 * gelijke naam.
 *
 * Niet vervangen. Vervangen wiste bij het openen van het tweede project de
 * doorsneden van het eerste, zonder dat de gebruiker daar iets voor deed. Het
 * project wint wél bij een gelijke naam: de staven in dat bestand verwijzen
 * met `EIGEN:<naam>` naar déze doorsnede, en zouden anders met een lokale
 * naamgenoot doorgerekend worden.
 *
 * Geeft de namen terug die daarbij inhoudelijk zijn overschreven, zodat de
 * aanroeper dat kan MELDEN — stil overschrijven is precies het probleem dat
 * deze regel oplost.
 */
export function importeer(items: EigenDoorsnede[]): string[] {
  return eigenDoorsnedenStore.getState().voegSamen(items);
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
