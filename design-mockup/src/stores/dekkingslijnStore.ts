/**
 * dekkingslijnStore — het laatste dekkingslijn-antwoord dat het betonvenster
 * van de rekenkern kreeg, voor wie het buiten dat venster nodig heeft.
 *
 * `BetonStaafVenster` hield dit tot nu toe in lokale React-state. Dat is
 * voor het venster zelf prima, maar twee lezers komen er niet bij: de
 * GUI-bediening (`bediening/bediening.ts`), die na `dekkingslijn_openen`
 * moet weten wanneer het venster KLAAR is en wat het kreeg — zonder de DOM
 * te schrapen — en straks het rapport. Het venster schrijft hier dus mee wat
 * het toch al in handen heeft; zijn eigen state blijft leidend voor het
 * tekenen.
 *
 * Eén staaf tegelijk: het venster toont er ook maar één. Een tweede
 * betonstaaf selecteren overschrijft dit; `beamId` zegt bij welke staaf het
 * antwoord hoort, zodat een lezer nooit het antwoord van de vórige staaf
 * voor dat van de huidige aanziet.
 */
import { create } from "zustand";
import type { DekkingslijnAntwoord } from "../lib/types/concrete/DekkingslijnAntwoord";
import type { DekkingslijnVerzoek } from "../lib/types/concrete/DekkingslijnVerzoek";

export interface DekkingslijnState {
  /** De staaf waarvoor `antwoord`/`fout` gelden; null = nog nooit gevraagd. */
  beamId: number | null;
  /** Wordt er op dit moment op de rekenkern gewacht? */
  bezig: boolean;
  /**
   * Het VERZOEK dat bij `antwoord` hoort — precies wat naar de kern ging.
   * Zonder het verzoek is het antwoord niet te reproduceren; mét kan een
   * client hetzelfde verzoek rechtstreeks door `concrete_dekkingslijn` halen
   * en de uitkomst naast die van het venster leggen (vier wegen, één
   * antwoord). Dezelfde gedachte als `checkStore.lastRunInputs`.
   */
  verzoek: DekkingslijnVerzoek | null;
  /** Het laatste antwoord, of null als er (nog) geen is of de kern weigerde. */
  antwoord: DekkingslijnAntwoord | null;
  /** De reden dat er geen antwoord is — letterlijk zoals het venster hem toont. */
  fout: string | null;
  /** Oplopend; elke afgeronde vraag (antwoord óf fout) verhoogt hem. */
  volgnummer: number;
  zetBezig: (beamId: number, verzoek: DekkingslijnVerzoek) => void;
  zetAntwoord: (beamId: number, antwoord: DekkingslijnAntwoord) => void;
  zetFout: (beamId: number, fout: string) => void;
}

export const useDekkingslijnStore = create<DekkingslijnState>((set) => ({
  beamId: null,
  bezig: false,
  verzoek: null,
  antwoord: null,
  fout: null,
  volgnummer: 0,
  zetBezig: (beamId, verzoek) => set({ beamId, bezig: true, verzoek }),
  zetAntwoord: (beamId, antwoord) =>
    set((s) => ({ beamId, bezig: false, antwoord, fout: null, volgnummer: s.volgnummer + 1 })),
  // Een fout zonder verzoek (het venster kon er geen bouwen) laat `verzoek`
  // op null; een fout ná een verzoek houdt het verzoek, want dát is wat faalde.
  zetFout: (beamId, fout) =>
    set((s) => ({
      beamId, bezig: false, antwoord: null, fout,
      verzoek: s.beamId === beamId ? s.verzoek : null,
      volgnummer: s.volgnummer + 1,
    })),
}));
