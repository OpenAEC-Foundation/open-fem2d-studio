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
import CheckSummarySection from "./sections/CheckSummarySection";

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
  {
    id: "checkSummary",
    titleKey: "report.sectionCheckSummary",
    defaultTitle: "Toetsingssamenvatting",
    Component: CheckSummarySection,
  },
];
