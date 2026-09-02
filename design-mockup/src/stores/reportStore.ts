/**
 * reportStore — instellingen van het live HTML-rapport.
 *
 * Het rapport ÍS HTML (ReportShell + secties in components/report/); PDF
 * ontstaat via de printdialoog van de webview (window.print → "Opslaan als
 * PDF"). Er is dus geen genereer-stap en geen PDF-state meer — deze store
 * houdt alleen instellingen bij die het raamwerk daadwerkelijk aansturen:
 *
 *  - pageSize / orientation → schermafmetingen van de vellen én de
 *    dynamische `@page`-regel in de print-CSS (ReportShell);
 *  - marges + basisLettergrootte + regelafstand → de opmaak van het vel: op
 *    scherm via CSS-variabelen op de vellen, in print via dezelfde
 *    `@page`-regel. Elke wijziging herpagineert de opmaakproef live
 *    (ReportShell, gedebouncet).
 *  - zoom → schermweergave (50–150%), heeft géén effect op de print;
 *  - hiddenSections → sectie-toggles per registry-id (reportSections.ts);
 *    een id dat ontbreekt staat AAN, zodat nieuwe secties standaard meedoen.
 *  - resultCombo → de combinatie-keuze van de resultaatsecties (R3). Bewust
 *    ÉÉN gedeelde instelling (geen lokale sectiestate): krachtsverdeling,
 *    oplegreacties en verplaatsingen vertellen zo altijd één consistent
 *    verhaal over dezelfde combinatie. `null` = automatisch (omhullende als
 *    die er is, anders de eerste combinatie met resultaten).
 */
import { create } from 'zustand';

export type ReportPageSize = 'A4' | 'A3';
export type ReportOrientation = 'portrait' | 'landscape';

/** Papierformaten in mm (breedte × hoogte, staand). */
const PAPER_MM: Record<ReportPageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

/** Velafmetingen in mm voor het gekozen formaat + oriëntatie. */
export function pageDimsMm(
  size: ReportPageSize,
  orientation: ReportOrientation,
): { w: number; h: number } {
  const p = PAPER_MM[size];
  return orientation === 'portrait' ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

export const REPORT_ZOOM_MIN = 0.5;
export const REPORT_ZOOM_MAX = 1.5;

/** Grenzen van de opmaak-sliders (zijbalk → sectie "Opmaak"). */
export const MARGE_MIN_MM = 5;
export const MARGE_MAX_MM = 40;
export const LETTER_MIN_PT = 7;
export const LETTER_MAX_PT = 14;
export const REGELAFSTAND_MIN = 1;
export const REGELAFSTAND_MAX = 2;

/**
 * Opmaak van het vel. "Binnen/buiten" is de drukkersterm voor de marge aan de
 * rug- respectievelijk snijkant. Het rapport is ENKELZIJDIG drukwerk (elk vel
 * is één printpagina, er is geen spiegeling per even/oneven pagina), dus
 * binnen = links en buiten = rechts. De zijbalk noemt ze daarom links/rechts;
 * de veldnamen houden de drukkersterm aan zodat tweezijdig drukwerk later
 * alleen een spiegel-schakelaar nodig heeft.
 */
export interface ReportOpmaak {
  margeBoven: number;
  margeOnder: number;
  margeBinnen: number;
  margeBuiten: number;
  /** Basislettergrootte in pt; alle rapportmaten schalen hiermee mee. */
  basisLettergrootte: number;
  /** Interlinie als factor van de lettergrootte. */
  regelafstand: number;
}

export const STANDAARD_OPMAAK: ReportOpmaak = {
  margeBoven: 18,
  margeOnder: 20,
  margeBinnen: 15,
  margeBuiten: 15,
  basisLettergrootte: 10,
  regelafstand: 1.45,
};

interface ReportState extends ReportOpmaak {
  pageSize: ReportPageSize;
  orientation: ReportOrientation;
  /** Schermzoom van de rapportweergave (0.5–1.5). Print altijd op 100%. */
  zoom: number;
  /** Sectie-id → verborgen. Ontbrekende id = sectie staat aan. */
  hiddenSections: Record<string, boolean>;
  /**
   * Combinatie-keuze van de resultaatsecties: combinatie-id, 'envelope'
   * (omhullende) of null (= automatisch: omhullende indien beschikbaar,
   * anders de eerste combinatie met resultaten).
   */
  resultCombo: number | 'envelope' | null;
  /**
   * Sectie waar de lezer nu naar kijkt (scherm-navigatie: markering in de
   * inhoudsopgave in de zijbalk). Bewust GEEN gedeelde instelling — dit is
   * per venster en gaat dus niet mee in de rapport-sync.
   */
  actieveSectie: string | null;

  setPageSize: (size: ReportPageSize) => void;
  setOrientation: (orientation: ReportOrientation) => void;
  setZoom: (zoom: number) => void;
  setSectionEnabled: (id: string, enabled: boolean) => void;
  /** Alle secties weer aan. */
  resetSections: () => void;
  setResultCombo: (v: number | 'envelope' | null) => void;
  /** Eén opmaakwaarde wijzigen (slider) — waarden worden begrensd. */
  setOpmaak: (patch: Partial<ReportOpmaak>) => void;
  /** Terug naar de standaardopmaak. */
  resetOpmaak: () => void;
  setActieveSectie: (id: string | null) => void;
}

/** Begrens één opmaakwaarde binnen zijn slidergrenzen. */
function begrens(patch: Partial<ReportOpmaak>): Partial<ReportOpmaak> {
  const klem = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));
  const uit: Partial<ReportOpmaak> = {};
  if (patch.margeBoven !== undefined)
    uit.margeBoven = klem(patch.margeBoven, MARGE_MIN_MM, MARGE_MAX_MM);
  if (patch.margeOnder !== undefined)
    uit.margeOnder = klem(patch.margeOnder, MARGE_MIN_MM, MARGE_MAX_MM);
  if (patch.margeBinnen !== undefined)
    uit.margeBinnen = klem(patch.margeBinnen, MARGE_MIN_MM, MARGE_MAX_MM);
  if (patch.margeBuiten !== undefined)
    uit.margeBuiten = klem(patch.margeBuiten, MARGE_MIN_MM, MARGE_MAX_MM);
  if (patch.basisLettergrootte !== undefined)
    uit.basisLettergrootte = klem(patch.basisLettergrootte, LETTER_MIN_PT, LETTER_MAX_PT);
  if (patch.regelafstand !== undefined)
    uit.regelafstand = klem(patch.regelafstand, REGELAFSTAND_MIN, REGELAFSTAND_MAX);
  return uit;
}

export const useReportStore = create<ReportState>((set) => ({
  pageSize: 'A4',
  orientation: 'portrait',
  zoom: 1,
  hiddenSections: {},
  resultCombo: null,
  actieveSectie: null,
  ...STANDAARD_OPMAAK,

  setPageSize: (pageSize) => set({ pageSize }),
  setOrientation: (orientation) => set({ orientation }),
  setZoom: (zoom) =>
    set({ zoom: Math.min(REPORT_ZOOM_MAX, Math.max(REPORT_ZOOM_MIN, zoom)) }),

  setSectionEnabled: (id, enabled) =>
    set((state) => {
      const hiddenSections = { ...state.hiddenSections };
      if (enabled) delete hiddenSections[id];
      else hiddenSections[id] = true;
      return { hiddenSections };
    }),

  resetSections: () => set({ hiddenSections: {} }),

  setResultCombo: (resultCombo) => set({ resultCombo }),

  setOpmaak: (patch) => set(begrens(patch)),
  resetOpmaak: () => set({ ...STANDAARD_OPMAAK }),
  setActieveSectie: (actieveSectie) =>
    set((state) => (state.actieveSectie === actieveSectie ? state : { actieveSectie })),
}));

/** True wanneer de sectie met dit id zichtbaar is. */
export function isSectionEnabled(
  hiddenSections: Record<string, boolean>,
  id: string,
): boolean {
  return !hiddenSections[id];
}
