/**
 * cltOpbouwenStore — de bewaarde eigen CLT-vloeropbouwen van de gebruiker.
 *
 * DEZELFDE WEG ALS `eigenDoorsnedenStore`, EEN ANDERE DOOS
 * -------------------------------------------------------
 * De route is bewust identiek aan die van de eigen doorsneden: een winkel op
 * `zustand/vanilla`, opslag in localStorage, en `exporteer()` / `importeer()`
 * voor het projectbestand. Wat er ín gaat verschilt fundamenteel, en daarom
 * is dit een eigen winkel en geen extra veld in de bestaande:
 *
 *  - Een eigen doorsnede is UITVOER van de doorsnedemotor (A, I, W, …) en kan
 *    niet uit zijn naam worden teruggerekend. De staaf draagt daarom alleen
 *    een verwijzing (`EIGEN:<naam>`) en de doorsnede zélf moet meereizen,
 *    anders rekent de staaf nergens meer mee.
 *  - Een CLT-opbouw is INVOER en staat volledig in zijn eigen profielnaam:
 *    "CLT 40L:C24/20D:C16/40L b600" beschrijft de opbouw compleet. De staaf
 *    krijgt dus die naam en NIET een verwijzing naar deze bibliotheek.
 *
 * Gevolg — en dat is de reden dat er hier geen voorvoegsel bestaat: deze
 * bibliotheek is een gemak, geen afhankelijkheid. Een project waarvan de
 * opbouwen ontbreken rekent gewoon door; je mist alleen de NAAM die de
 * gebruiker eraan gaf. Niets in de solver, de toetsing of het rapport leest
 * deze winkel, en `sectionResolver` hoeft er niets van te weten.
 *
 * # Waarom hier geen React in zit
 *
 * Zelfde reden als bij `eigenDoorsnedenStore`: dit bestand blijft op
 * `zustand/vanilla` zodat het nooit React de sidecarbundel in trekt. De
 * React-binding staat apart in `useCltOpbouwen.ts`.
 */
import { createStore } from "zustand/vanilla";
import type { CltLayup } from "../types/timber/CltLayup";
import { cltOpbouwSleutel, parseCltProfiel } from "../cltCheckBuilder";

const OPSLAG_SLEUTEL = "openaec.cltOpbouwen.v1";

/** Eén door de gebruiker bewaarde vloeropbouw. */
export interface EigenCltOpbouw {
  id: string;
  /** Naam die de gebruiker eraan gaf ("Vloer begane grond"). */
  naam: string;
  /** De opbouw zelf — lagen van boven naar beneden, plus de strookbreedte. */
  layup: CltLayup;
  /** ISO-tijdstip van bewaren; puur informatief. */
  bewaardOp: string;
}

interface CltOpbouwenState {
  items: EigenCltOpbouw[];
  /** Voeg toe of vervang (op id én op naam: een naam is uniek). */
  bewaar: (o: EigenCltOpbouw) => void;
  verwijder: (id: string) => void;
  /** Vervang de complete lijst — alleen voor "bibliotheek leegmaken". */
  vervangAlles: (items: EigenCltOpbouw[]) => void;
  /**
   * Voeg binnenkomende opbouwen samen met de lokale; bij een gelijke naam
   * wint de BINNENKOMENDE (zie `importeer`). Geeft de namen terug die
   * daarbij inhoudelijk zijn overschreven.
   */
  voegSamen: (binnen: EigenCltOpbouw[]) => string[];
}

function lees(): EigenCltOpbouw[] {
  try {
    const ruw = localStorage.getItem(OPSLAG_SLEUTEL);
    if (!ruw) return [];
    const data = JSON.parse(ruw);
    return Array.isArray(data) ? (data as EigenCltOpbouw[]) : [];
  } catch {
    // Geen opslag (privévenster, quota, of een Node-proces zonder browser):
    // de sessie begint dan met een lege bibliotheek en werkt gewoon door.
    return [];
  }
}

function schrijf(items: EigenCltOpbouw[]): void {
  try {
    localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(items));
  } catch {
    // Zie `lees`: zonder opslag blijft de bibliotheek een sessiebibliotheek.
  }
}

function sorteer(items: EigenCltOpbouw[]): EigenCltOpbouw[] {
  return [...items].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

/** Inhoudelijk gelijk = dezelfde lagen en dezelfde strookbreedte. */
function opbouwGelijk(a: EigenCltOpbouw, b: EigenCltOpbouw): boolean {
  return cltOpbouwSleutel(a.layup) === cltOpbouwSleutel(b.layup);
}

export const cltOpbouwenStore = createStore<CltOpbouwenState>((set, get) => ({
  items: lees(),
  bewaar: (o) => {
    const rest = get().items.filter((x) => x.id !== o.id && x.naam !== o.naam);
    const items = sorteer([...rest, o]);
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
        return bestaand !== undefined && !opbouwGelijk(bestaand, b);
      })
      .map((b) => b.naam);
    // Weg met alles wat de binnenkomende lijst opnieuw beschrijft — op naam
    // (dezelfde opbouw onder dezelfde naam) én op id (dezelfde opbouw die op
    // de andere machine hernoemd is), zodat er nooit twee rijen met hetzelfde
    // id of dezelfde naam overblijven.
    const rest = lokaal.filter((x) => !binnen.some((b) => b.naam === x.naam || b.id === x.id));
    const items = sorteer([...rest, ...binnen]);
    schrijf(items);
    set({ items });
    return overschreven;
  },
}));

/**
 * De opbouwen die in DIT project voorkomen — meer hoort er niet in het
 * projectbestand.
 *
 * De vorige regel ("alles wat lokaal bewaard is") maakte van elk
 * projectbestand een kopie van de hele persoonlijke bibliotheek: open je zo'n
 * bestand op een andere machine, dan kreeg die er tientallen opbouwen bij die
 * met het project niets te maken hebben.
 *
 * Een CLT-staaf draagt de opbouw als profielnaam en niet als verwijzing, dus
 * "gebruikt" is hier geen naamvergelijking maar een opbouwvergelijking: de
 * staafnaam wordt gelezen met het staafmateriaal als standaardklasse (precies
 * zoals de toetsing dat doet) en de canonieke sleutel daarvan wordt naast die
 * van de bewaarde opbouwen gelegd.
 */
export function exporteer(
  staven: Iterable<{ material?: string; profile?: string }>,
): EigenCltOpbouw[] {
  const gebruikt = new Set<string>();
  for (const s of staven) {
    const layup = parseCltProfiel(s.profile, s.material?.trim() ?? "");
    if (layup) gebruikt.add(cltOpbouwSleutel(layup));
  }
  return cltOpbouwenStore
    .getState()
    .items.filter((o) => gebruikt.has(cltOpbouwSleutel(o.layup)))
    .map((o) => ({ ...o }));
}

/**
 * Projectbestand → winkel: SAMENVOEGEN, waarbij het project wint bij een
 * gelijke naam.
 *
 * Niet vervangen. Vervangen wiste bij het openen van het tweede project de
 * bibliotheek van het eerste, terwijl de gebruiker daar niets voor had
 * gedaan. Het project wint wél bij een gelijke naam, want het projectbestand
 * beschrijft waarmee dít project is doorgerekend; een lokale opbouw met
 * dezelfde naam maar andere lagen zou daar stilzwijgend overheen liggen.
 *
 * Geeft de namen terug die daarbij inhoudelijk zijn overschreven, zodat de
 * aanroeper dat kan MELDEN — stil overschrijven is precies het probleem dat
 * deze regel oplost.
 */
export function importeer(items: EigenCltOpbouw[]): string[] {
  return cltOpbouwenStore.getState().voegSamen(items);
}
