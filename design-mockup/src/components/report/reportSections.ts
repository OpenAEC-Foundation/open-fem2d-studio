/**
 * reportSections — registry van rapportsecties.
 *
 * Elke sectie is een React-component die LIVE uit de stores leest (zustand
 * hooks): modelwijziging → rerender, geen genereer-stap. ReportShell rendert
 * elke aangezette sectie als eigen vel; de sectie-toggles in de zijbalk
 * (ReportPreview) en de aan/uit-state in de reportStore werken op het `id`.
 *
 * Latere secties (R2 invoer, R3 resultaten, R4 toetsing in detail) haken
 * hier alleen nog in: component schrijven → regel toevoegen → klaar.
 */
import type { ComponentType } from "react";
import ProjectSection from "./sections/ProjectSection";
import NodesSection from "./sections/NodesSection";
import BeamsSection from "./sections/BeamsSection";
import SectionsSection from "./sections/SectionsSection";
import MaterialsSection from "./sections/MaterialsSection";
import LoadsSection from "./sections/LoadsSection";
import CombinationsSection from "./sections/CombinationsSection";
import SchemaSection from "./sections/SchemaSection";
import DiagramsSection from "./sections/DiagramsSection";
import ReactionsSection from "./sections/ReactionsSection";
import DisplacementsSection from "./sections/DisplacementsSection";
import CheckTableSection from "./sections/CheckTableSection";
import CheckDetailSection from "./sections/CheckDetailSection";

export interface ReportSectionDef {
  /** Stabiel id — sleutel voor de aan/uit-toggle in de reportStore. */
  id: string;
  /** i18n-sleutel (namespace "ribbon") voor het label in de zijbalk. */
  titleKey: string;
  /** Nederlandse fallback wanneer de sleutel ontbreekt. */
  defaultTitle: string;
  /** De sectie-inhoud zelf (rendert ook zijn eigen kop). */
  Component: ComponentType;
}

export const REPORT_SECTIONS: ReportSectionDef[] = [
  {
    id: "project",
    titleKey: "report.sectionProject",
    defaultTitle: "Projectgegevens",
    Component: ProjectSection,
  },
  // ── R2: invoersecties (lezen de modelstate via ReportDataContext) ──
  {
    id: "nodes",
    titleKey: "report.sectionNodes",
    defaultTitle: "Knopen",
    Component: NodesSection,
  },
  {
    id: "beams",
    titleKey: "report.sectionBeams",
    defaultTitle: "Staven",
    Component: BeamsSection,
  },
  {
    id: "sections",
    titleKey: "report.sectionSections",
    defaultTitle: "Profielen & doorsneden",
    Component: SectionsSection,
  },
  {
    id: "materials",
    titleKey: "report.sectionMaterials",
    defaultTitle: "Materialen",
    Component: MaterialsSection,
  },
  {
    id: "loads",
    titleKey: "report.sectionLoads",
    defaultTitle: "Belastinggevallen",
    Component: LoadsSection,
  },
  {
    id: "combinations",
    titleKey: "report.sectionCombinations",
    defaultTitle: "Belastingcombinaties",
    Component: CombinationsSection,
  },
  // ── R3: resultaatsecties (schets = model; de rest leest de multi-LC-
  //    resultaten uit de ReportDataContext en toont "Nog niet berekend"
  //    zolang die er niet — of niet meer — zijn) ──
  {
    id: "schema",
    titleKey: "report.sectionSchema",
    defaultTitle: "Constructieschets",
    Component: SchemaSection,
  },
  {
    id: "diagrams",
    titleKey: "report.sectionDiagrams",
    defaultTitle: "Krachtsverdeling",
    Component: DiagramsSection,
  },
  {
    id: "reactions",
    titleKey: "report.sectionReactions",
    defaultTitle: "Oplegreacties",
    Component: ReactionsSection,
  },
  {
    id: "displacements",
    titleKey: "report.sectionDisplacements",
    defaultTitle: "Verplaatsingen",
    Component: DisplacementsSection,
  },
  {
    id: "checkTable",
    titleKey: "report.sectionCheckTable",
    defaultTitle: "Toetsingsoverzicht",
    Component: CheckTableSection,
  },
  {
    id: "checkDetail",
    titleKey: "report.sectionCheckDetail",
    defaultTitle: "Toetsing per staaf",
    Component: CheckDetailSection,
  },
];
