/**
 * useEigenDoorsneden — de React-binding op `eigenDoorsnedenStore`.
 *
 * Deze haak staat apart van de winkel zelf, en dat is geen indeling om de
 * indeling. `sectionResolver.ts` leest `zoekEigenDoorsnede` uit die winkel, en
 * de resolver loopt óók in de sidecar: een kaal Node-proces zonder browser.
 * Stond de React-ingang van zustand in hetzelfde bestand, dan trok esbuild
 * React mee de sidecarbundel in en struikelde de bundelcontrole over
 * `window.`-verwijzingen — waarna `assets/fem-kernel.mjs` niet meer te
 * herbouwen was.
 *
 * Dus: componenten importeren hier, rekencode importeert uit de winkel.
 */
import { useStore } from "zustand";
import { eigenDoorsnedenStore } from "./eigenDoorsnedenStore";
import type { EigenDoorsnede } from "./types";

interface EigenDoorsnedenState {
  items: EigenDoorsnede[];
  bewaar: (d: EigenDoorsnede) => void;
  verwijder: (id: string) => void;
  vervangAlles: (items: EigenDoorsnede[]) => void;
}

/**
 * Volg (een deel van) de bewaarde doorsneden in een component.
 *
 * Zelfde gebruiksvorm als een gewone zustand-haak: geef een keuzefunctie mee,
 * dan hertekent het component alleen als dát deel verandert.
 */
export function useEigenDoorsneden<T>(selector: (s: EigenDoorsnedenState) => T): T {
  return useStore(eigenDoorsnedenStore, selector);
}
