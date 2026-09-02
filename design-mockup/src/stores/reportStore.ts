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

interface ReportState {
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

  setPageSize: (size: ReportPageSize) => void;
  setOrientation: (orientation: ReportOrientation) => void;
  setZoom: (zoom: number) => void;
  setSectionEnabled: (id: string, enabled: boolean) => void;
  /** Alle secties weer aan. */
  resetSections: () => void;
  setResultCombo: (v: number | 'envelope' | null) => void;
}

export const useReportStore = create<ReportState>((set) => ({
  pageSize: 'A4',
  orientation: 'portrait',
  zoom: 1,
  hiddenSections: {},
  resultCombo: null,

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
}));

/** True wanneer de sectie met dit id zichtbaar is. */
export function isSectionEnabled(
  hiddenSections: Record<string, boolean>,
  id: string,
): boolean {
  return !hiddenSections[id];
}
