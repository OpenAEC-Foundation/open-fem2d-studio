/**
 * rapportGereedheid — is de opmaakproef in DIT venster klaar om geprint te worden?
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * De paginering (paginate.ts) draait gedebouncet: na een wijziging wacht
 * ReportShell HERPAGINEER_MS, na `document.fonts.ready` volgt nog een slag, en
 * de inhoudsopgave stelt zichzelf in maximaal vier slagen bij (toc.ts). Wie op
 * een willekeurig moment print, kan dus een PDF krijgen die halverwege een
 * slag is gemaakt, of met een inhoudsopgave die nog niet klopt. Een vaste
 * wachttijd ("even 1,5 s") verschuift dat risico alleen. Deze module maakt de
 * toestand van de paginering LEESBAAR, zodat de bediening
 * (`bediening/rapportExport.ts`) kan wachten op een expliciet klaar-signaal.
 *
 * WIE SCHRIJFT, WIE LEEST
 * -----------------------
 * ReportShell meldt elke verandering (`meldPagineer`): gemonteerd, een
 * pagineerslag gepland, een slag uitgevoerd (met het aantal vellen), fonts
 * binnen. `beoordeelPaginering` is ZUIVER — hij krijgt een momentopname en de
 * klok als argument — zodat hij zonder DOM te testen is
 * (test-rapport-gereedheid.mjs).
 *
 * De toestand is per venster (per JavaScript-omgeving): het losgekoppelde
 * rapportvenster heeft zijn eigen kopie, en die wordt hier niet gelezen.
 */
import type { TocToestand } from "./toc";

export interface PagineerToestand {
  /** Staat er in dit venster een ReportShell (rapportweergave in beeld)? */
  gemonteerd: boolean;
  /** Staat er een pagineerslag op stapel (debounce-timer loopt)? */
  timerGepland: boolean;
  /** Is `document.fonts.ready` binnen sinds het monteren? */
  fontsBinnen: boolean;
  /** Aantal uitgevoerde pagineerslagen sinds het monteren. */
  slagen: number;
  /** Aantal vellen na de laatste slag. */
  aantalVellen: number;
  /** Klok (ms, `performance.now()`) van de laatste slag; 0 = nog geen. */
  laatsteSlagOp: number;
  /**
   * Het herpagineerverzoek (zie `vraagHerpaginering`) dat ReportShell had
   * GERENDERD toen de laatste slag draaide. Een slag die dit nummer draagt, is
   * gegarandeerd gedaan ná alle store-wijzigingen die vóór het verzoek kwamen.
   */
  beantwoordVerzoek: number;
  /**
   * Waarom de laatste slag werd gepland (instellingen, inhoud van de
   * meetcontainer, maat, lettertypen, inhoudsopgave, verzoek). Alleen voor de
   * melding: een export die niet klaar wordt, zegt zo WAT er blijft plannen.
   */
  aanleiding: string;
}

const BEGIN: PagineerToestand = {
  aanleiding: "",
  gemonteerd: false,
  timerGepland: false,
  fontsBinnen: false,
  slagen: 0,
  aantalVellen: 0,
  laatsteSlagOp: 0,
  beantwoordVerzoek: -1,
};

// ── Herpagineerverzoek: de handdruk tussen export en ReportShell ────────────
//
// WAAROM. De export zet eerst het rapporttype, het papier en de kop (zustand-
// stores, synchroon) en vraagt dan of het rapport klaar is. Maar ReportShell en
// de secties renderen die wijzigingen pas even later. Stond het rapport al
// minuten stil, dan zou "geen slag gepland, laatste slag lang geleden" meteen
// "klaar" zeggen — over de vellen van VÓÓR de wijziging. Het verzoek sluit dat
// uit: de export hoogt het nummer op na zijn wijzigingen, ReportShell rendert
// het (in dezelfde of een latere commit als die wijzigingen) en plant een slag;
// pas een slag die het nieuwe nummer draagt telt.

let herpagineerVerzoek = 0;
const verzoekLuisteraars = new Set<() => void>();

/** Vraag een nieuwe pagineerslag aan; geeft het nummer waarop gewacht moet worden. */
export function vraagHerpaginering(): number {
  herpagineerVerzoek += 1;
  verzoekLuisteraars.forEach((f) => f());
  return herpagineerVerzoek;
}

export function leesHerpagineerVerzoek(): number {
  return herpagineerVerzoek;
}

export function abonneerHerpagineerVerzoek(f: () => void): () => void {
  verzoekLuisteraars.add(f);
  return () => {
    verzoekLuisteraars.delete(f);
  };
}

let toestand: PagineerToestand = { ...BEGIN };
const luisteraars = new Set<(t: PagineerToestand) => void>();

/** De huidige momentopname (onveranderlijk object; elke melding maakt een nieuw). */
export function leesPagineerToestand(): PagineerToestand {
  return toestand;
}

/** ReportShell meldt een verandering. */
export function meldPagineer(patch: Partial<PagineerToestand>): void {
  toestand = { ...toestand, ...patch };
  luisteraars.forEach((f) => f(toestand));
}

/** ReportShell bij (de)monteren: alles terug naar het begin. */
export function resetPagineerToestand(gemonteerd: boolean, fontsBinnen: boolean): void {
  toestand = { ...BEGIN, gemonteerd, fontsBinnen };
  luisteraars.forEach((f) => f(toestand));
}

/** Abonneren, in dezelfde vorm als een zustand-store (`wachtOpStore`). */
export const pagineerStore = {
  getState: leesPagineerToestand,
  subscribe(f: (t: PagineerToestand) => void): () => void {
    luisteraars.add(f);
    return () => {
      luisteraars.delete(f);
    };
  },
};

/**
 * Stilte na de laatste pagineerslag voordat hij als "laatste" telt.
 *
 * WAAROM ER TOCH EEN TIJD IN STAAT. Niet als gok, maar als afgeleide van de
 * debounce zelf: een inhoudswijziging komt via de MutationObserver binnen als
 * microtaak en plant dan een slag over HERPAGINEER_MS (150 ms). Een toestand
 * zonder geplande slag die al twee debounce-perioden onveranderd staat, kan
 * dus geen wijziging meer "onderweg" hebben die de observer nog niet zag —
 * bijvoorbeeld een React-commit die net na de laatste slag landt (de
 * projectgegevens laden asynchroon, zie useProjectInfo).
 */
export const STILTE_NA_SLAG_MS = 300;

export interface GereedheidInvoer {
  pagineer: PagineerToestand;
  toc: TocToestand;
  /** Het herpagineerverzoek waarop gewacht wordt (`vraagHerpaginering`). */
  verzoek: number;
  /** Laden de projectgegevens nog (eerste `getSetting`)? */
  projectInfoLaadt: boolean;
  /** De klok, in dezelfde eenheid als `laatsteSlagOp`. */
  nu: number;
}

export type PagineerOordeel =
  | { soort: "klaar"; aantalVellen: number }
  | { soort: "wacht"; reden: string }
  | { soort: "weiger"; reden: string };

/**
 * Het klaar-signaal. Volgorde = de volgorde waarin de voorwaarden in de
 * praktijk vervuld raken, zodat de reden bij een verlopen wachttijd zegt waar
 * het bleef hangen.
 */
export function beoordeelPaginering(i: GereedheidInvoer): PagineerOordeel {
  const p = i.pagineer;
  if (!p.gemonteerd) return { soort: "wacht", reden: "de rapportweergave staat nog niet in beeld" };
  if (i.projectInfoLaadt) return { soort: "wacht", reden: "de projectgegevens worden nog geladen" };
  if (!p.fontsBinnen) return { soort: "wacht", reden: "de lettertypen zijn nog niet geladen" };
  if (p.timerGepland) {
    return {
      soort: "wacht",
      reden: `er staat een pagineerslag gepland (aanleiding: ${p.aanleiding || "onbekend"}; ${p.slagen} slagen gedaan)`,
    };
  }
  if (p.slagen === 0) return { soort: "wacht", reden: "er is nog niet gepagineerd" };
  if (p.beantwoordVerzoek < i.verzoek) {
    return { soort: "wacht", reden: "de paginering heeft de nieuwe rapportinstellingen nog niet verwerkt" };
  }
  if (!i.toc.stabiel) {
    return { soort: "wacht", reden: `de inhoudsopgave stelt zich nog bij (slag ${i.toc.slag})` };
  }
  if (i.nu - p.laatsteSlagOp < STILTE_NA_SLAG_MS) {
    return { soort: "wacht", reden: "de laatste pagineerslag is net gedaan" };
  }
  if (p.aantalVellen <= 0) {
    return {
      soort: "weiger",
      reden: "het rapport heeft geen enkel vel — alle secties staan uit of geen sectie is van toepassing",
    };
  }
  return { soort: "klaar", aantalVellen: p.aantalVellen };
}
