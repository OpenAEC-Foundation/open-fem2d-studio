/**
 * useCltOpbouwen — de React-binding op `cltOpbouwenStore`.
 *
 * Staat om dezelfde reden apart als `useEigenDoorsneden`: de winkel zelf
 * blijft op `zustand/vanilla`, zodat er langs geen enkel importpad React in
 * de sidecarbundel terechtkomt. Componenten importeren hier; wie buiten React
 * alleen wil opzoeken of exporteren, gebruikt de winkel rechtstreeks.
 */
import { useStore } from "zustand";
import { cltOpbouwenStore } from "./cltOpbouwenStore";
import type { EigenCltOpbouw } from "./cltOpbouwenStore";

interface CltOpbouwenState {
  items: EigenCltOpbouw[];
  bewaar: (o: EigenCltOpbouw) => void;
  verwijder: (id: string) => void;
}

/** Volg (een deel van) de bewaarde CLT-opbouwen in een component. */
export function useCltOpbouwen<T>(selector: (s: CltOpbouwenState) => T): T {
  return useStore(cltOpbouwenStore, selector);
}
