/**
 * solverLogStore — wat de solver tijdens de laatste berekening heeft gemeld.
 *
 * De kern (`core/solver/NonlinearSolver.ts`) MELDT via een callback en bewaart
 * niets; deze store is de enige plek waar die regels blijven staan. Dat is met
 * opzet zo gescheiden: `engine.ts` zit in de sidecar-bundel en mag geen zustand
 * kennen, dus de aanroeper — de app — hangt de opvanger eraan. In het
 * kale Node-proces van de sidecar luistert niemand, en dan kost het log niets.
 *
 * Waarom een store en geen veld in het resultaat: het log is juist het meest
 * waard wanneer er GEEN resultaat komt. Divergeert de tweede orde, dan gooit de
 * solver en verdwijnt elk resultaatobject — maar de regels tot en met de laatste
 * iteratie staan hier dan al in, en dat is precies wat de gebruiker moet zien om
 * te begrijpen waaróm het misging.
 *
 * Schrijver: App (via `maakSolverLogOpvanger`). Lezer: InsightsView.
 */
import { create } from "zustand";
import type { SolverLogRegel } from "../core/solver/NonlinearSolver";

/** Een regel zoals hij in het paneel staat: de solverregel plus zijn volgnummer. */
export interface LogRegel extends SolverLogRegel {
  /** Oplopend, zodat React een sleutel heeft die niet met de tekst meebeweegt. */
  nr: number;
}

/**
 * Bovengrens op wat we bewaren. Een fysisch niet-lineaire som met veel
 * laststappen kan duizenden iteraties doen; het paneel toont er hooguit een
 * paar honderd en de rest zou alleen geheugen kosten. Bij overschrijding
 * vervallen de OUDSTE regels: het einde van de reeks — de convergentie of de
 * fout — is wat de lezer zoekt.
 */
const MAX_REGELS = 500;

interface SolverLogState {
  regels: LogRegel[];
  /** Aantal regels dat is weggevallen door `MAX_REGELS`; 0 = het log is volledig. */
  verlorenRegels: number;
  /** Gooi het log leeg. Hoort aan het BEGIN van elke berekening. */
  begin: () => void;
  voegToe: (regel: SolverLogRegel) => void;
}

export const useSolverLogStore = create<SolverLogState>((set) => ({
  regels: [],
  verlorenRegels: 0,
  begin: () => set({ regels: [], verlorenRegels: 0 }),
  voegToe: (regel) =>
    set((s) => {
      const nr = s.regels.length + s.verlorenRegels;
      const regels = [...s.regels, { ...regel, nr }];
      if (regels.length <= MAX_REGELS) return { regels };
      const teveel = regels.length - MAX_REGELS;
      return {
        regels: regels.slice(teveel),
        verlorenRegels: s.verlorenRegels + teveel,
      };
    }),
}));

/**
 * De opvanger die aan de solver wordt meegegeven.
 *
 * Aparte functie omdat de aanroeper hem per berekening opnieuw nodig heeft en
 * het legen van het log erbij hoort: zonder `begin()` zou de tweede solve
 * achter de eerste aan groeien en zou het paneel twee berekeningen als één
 * reeks tonen.
 */
export function maakSolverLogOpvanger(): (regel: SolverLogRegel) => void {
  useSolverLogStore.getState().begin();
  // getState() per regel: de store-referentie is stabiel, en zo houdt de
  // opvanger geen verouderde closure vast als de store ertussen vervangen wordt.
  return (regel) => useSolverLogStore.getState().voegToe(regel);
}
