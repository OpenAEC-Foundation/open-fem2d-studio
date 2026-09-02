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
  Plate,
  Support,
  Load,
  LoadCase,
  StructuralGrid,
} from "../fem/femTypes";
import type { LoadCombination, Envelope } from "../fem/solver/combinations";
import type { SolverResult } from "../fem/solver/types";

export interface ReportData {
  nodes: Node[];
  beams: Beam[];
  /** Platen (wandschijven) — P5.2: invoer- en spanningssectie in het rapport. */
  plates: Plate[];
  supports: Support[];
  loads: Load[];
  loadCases: LoadCase[];
  combinations: LoadCombination[];
  structuralGrid: StructuralGrid;
  selfWeightEnabled: boolean;
  /**
   * R3 — resultaten van de multi-LC-pipeline (Berekenen): per combinatie een
   * volledig SolverResult (incl. 21-station-arrays per staaf) + de omhullende.
   * `null` betekent EERLIJK "nog niet berekend": useFemStore zet deze velden
   * op null bij élke model-/lastwijziging (invalidatie-effect), dus de
   * resultaatsecties tonen nooit stilzwijgend verouderde uitkomsten — ze
   * vallen automatisch terug op de "Nog niet berekend"-melding.
   */
  combinationResults: Map<number, SolverResult> | null;
  /**
   * P5.2 — per-belastinggeval-resultaten (zelfde run als combinationResults,
   * zelfde invalidatie in useFemStore). De combinatiepijplijn combineert
   * `plateElements` (nog) niet; de plaatspanningssectie superponeert daarom
   * zelf lineair over deze per-case-resultaten.
   */
  caseResults: Map<number, SolverResult> | null;
  envelope: Envelope | null;
}

export const EMPTY_REPORT_DATA: ReportData = {
  nodes: [],
  beams: [],
  plates: [],
  supports: [],
  loads: [],
  loadCases: [],
  combinations: [],
  structuralGrid: { enabled: false, xAxes: [], zAxes: [] },
  selfWeightEnabled: false,
  combinationResults: null,
  caseResults: null,
  envelope: null,
};

const ReportDataContext = createContext<ReportData>(EMPTY_REPORT_DATA);

export const ReportDataProvider = ReportDataContext.Provider;

/** De modelstate voor rapportsecties; EMPTY_REPORT_DATA zonder provider. */
export function useReportData(): ReportData {
  return useContext(ReportDataContext);
}
