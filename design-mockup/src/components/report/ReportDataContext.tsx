/**
 * ReportDataContext — de modelstate voor de rapportsecties.
 *
 * Architectuurkeuze (R2): de modelstate (knopen/staven/lasten/combinaties/
 * stramien) leeft in de useFemStore-HOOK-instantie in App.tsx — er is géén
 * globale model-store waar secties op kunnen abonneren (anders dan de
 * check-/reportStore). De minimale nette route is daarom props-doorgifte:
 *
 *   App.tsx  ── data-prop ──▶  ReportPreview  ── Provider ──▶  secties
 *
 * App levert één ReportData-object (doorgeef-regels, geen logica);
 * ReportPreview zet het in deze context; elke sectie leest via
 * useReportData(). Omdat useFemStore per mutatie nieuwe array-identiteiten
 * maakt, rerendert App → ReportPreview → secties automatisch: het rapport
 * volgt het model live, zonder genereer-stap.
 *
 * In het detached rapportvenster (eigen webview, eigen React-root) is er
 * geen modelstate — daar geldt EMPTY_REPORT_DATA en tonen de secties hun
 * eerlijke lege-modelmeldingen.
 */
import { createContext, useContext } from "react";
import type {
  Node,
  Beam,
  Support,
  Load,
  LoadCase,
  StructuralGrid,
} from "../fem/femTypes";
import type { LoadCombination } from "../fem/solver/combinations";

export interface ReportData {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  loads: Load[];
  loadCases: LoadCase[];
  combinations: LoadCombination[];
  structuralGrid: StructuralGrid;
  selfWeightEnabled: boolean;
}

export const EMPTY_REPORT_DATA: ReportData = {
  nodes: [],
  beams: [],
  supports: [],
  loads: [],
  loadCases: [],
  combinations: [],
  structuralGrid: { enabled: false, xAxes: [], zAxes: [] },
  selfWeightEnabled: false,
};

const ReportDataContext = createContext<ReportData>(EMPTY_REPORT_DATA);

export const ReportDataProvider = ReportDataContext.Provider;

/** De modelstate voor rapportsecties; EMPTY_REPORT_DATA zonder provider. */
export function useReportData(): ReportData {
  return useContext(ReportDataContext);
}
