/**
 * toc — de inhoudsopgave van het gedrukte rapport.
 *
 * De inhoudsopgave staat ALS SECTIE in het document (TocSection) en toont
 * echte paginanummers. Die kunnen alleen uit de paginering komen: pas als de
 * inhoud over vellen verdeeld is, weet je op welk vel een hoofdstuk begint.
 *
 * TERUGKOPPELING
 * --------------
 * Dat is een lus: de inhoudsopgave neemt zelf ruimte in, dus zodra hij
 * gevuld wordt verschuiven de nummers die hij toont. De oplossing is een
 * herhaalde slag —
 *
 *    pagineren → koppen + velnummers aflezen → inhoudsopgave vullen →
 *    opnieuw pagineren → …
 *
 * — met drie garanties dat hij stopt:
 *
 *  1. STOP BIJ GELIJK: veranderen de nummers niet meer, dan wordt er niets
 *     gepubliceerd en komt er dus geen nieuwe pagineerslag. Dat is het
 *     normale einde (in de praktijk na 2 slagen).
 *  2. HARDE GRENS: maximaal MAX_SLAGEN bijstellingen per aanleiding. Blijft
 *     het bij een grensgeval heen en weer springen (een hoofdstuk dat
 *     precies op een velgrens balanceert), dan wordt bij de laatste slag de
 *     STABIELE BOVENGRENS gekozen — per regel het hoogste paginanummer dat
 *     we gezien hebben — en daarna bevriest de inhoudsopgave. Liever een
 *     nummer dat er eentje naast zit dan een rapport dat blijft
 *     herpagineren.
 *  3. NIEUWE AANLEIDING = NIEUWE REEKS: een pagineerslag die NIET door onze
 *     eigen publicatie kwam (marge versleept, model gewijzigd, sectie
 *     aan/uit) zet de teller en de bevriezing terug, zodat de nummers daarna
 *     gewoon weer meelopen.
 */
import { useSyncExternalStore } from "react";

/** Eén regel in de inhoudsopgave. */
export interface TocRegel {
  /** 2 = hoofdstuk, 3 = subsectie. */
  niveau: 2 | 3;
  /** Nummer zoals het in het document staat ("3" of "3.2"). */
  nummer: string;
  titel: string;
  /** Het vel waarop dit hoofdstuk begint (1-gebaseerd). */
  pagina: number;
}

/** Maximaal aantal bijstelslagen per aanleiding (zie kop van dit bestand). */
const MAX_SLAGEN = 4;

let regels: TocRegel[] = [];
const luisteraars = new Set<() => void>();

let slag = 0;
let bevroren = false;
/** Staat er een pagineerslag op stapel die door ONZE publicatie komt? */
let eigenSlagVerwacht = false;

/** Sleutel om twee opsommingen te vergelijken (met of zonder paginanummers). */
function sleutel(r: TocRegel[], metPagina: boolean): string {
  return r
    .map((x) => (metPagina ? `${x.nummer}|${x.titel}|${x.pagina}` : `${x.nummer}|${x.titel}`))
    .join("§");
}

/** Per regel het hoogste paginanummer: de stabiele bovengrens. */
function bovengrens(oud: TocRegel[], nieuw: TocRegel[]): TocRegel[] {
  const hoogste = new Map(oud.map((r) => [r.nummer, r.pagina]));
  return nieuw.map((r) => {
    const eerder = hoogste.get(r.nummer);
    return eerder !== undefined && eerder > r.pagina ? { ...r, pagina: eerder } : r;
  });
}

function meld(): void {
  luisteraars.forEach((f) => f());
}

/**
 * Meld het begin van een pagineerslag. Kwam die niet uit onze eigen
 * publicatie, dan begint een nieuwe reeks (teller en bevriezing terug).
 */
export function startPagineerslag(): void {
  const intern = eigenSlagVerwacht;
  eigenSlagVerwacht = false;
  if (!intern) {
    slag = 0;
    bevroren = false;
  }
}

/**
 * Verwerk de koppen die uit de zojuist gebouwde vellen zijn afgelezen.
 * Retourneert het slagnummer van deze reeks (0 = niets gewijzigd, klaar).
 */
export function verwerkKoppen(nieuw: TocRegel[]): number {
  const structuurGewijzigd = sleutel(nieuw, false) !== sleutel(regels, false);
  if (structuurGewijzigd) {
    // Andere hoofdstukken (sectie aan/uit, ander model): nieuwe reeks.
    slag = 0;
    bevroren = false;
  } else if (sleutel(nieuw, true) === sleutel(regels, true)) {
    return 0; // convergentie — niets te doen
  } else if (bevroren) {
    return slag; // bovengrens al gekozen, niet blijven herpagineren
  }

  slag++;
  let uit = nieuw;
  if (slag >= MAX_SLAGEN) {
    uit = bovengrens(regels, nieuw);
    bevroren = true;
  }
  regels = uit;
  eigenSlagVerwacht = true;
  meld();
  return slag;
}

function huidig(): TocRegel[] {
  return regels;
}

function abonneer(fn: () => void): () => void {
  luisteraars.add(fn);
  return () => {
    luisteraars.delete(fn);
  };
}

/** De actuele inhoudsopgave (rerendert de sectie zodra de nummers wijzigen). */
export function useInhoudsopgave(): TocRegel[] {
  return useSyncExternalStore(abonneer, huidig, huidig);
}
