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
 *
 * RAPPORTTYPEN
 * ------------
 * Elke sectie zegt zelf of hij in het BEPERKTE rapport hoort (`inBeperkt`)
 * en waaróm (`beperktReden`). Zo staat de verdeling op één plek, naast de
 * sectie zelf, in plaats van in een losse lijst die stilletjes veroudert.
 *
 *  - Volledig — alles aan: de complete berekening, inclusief invoertabellen
 *    en de formule-afleidingen per staaf. Dit is het archiefstuk.
 *  - Beperkt — de kern die je aan een opdrachtgever geeft: wie/wat/waarom
 *    (projectgegevens + uitgangspunten), de aannames waarop getoetst is
 *    (belastingen, profielen), het beeld (constructieschets, krachts-
 *    verdeling), de maatgevende uitkomsten (oplegreacties, verplaatsingen)
 *    en het toetsingsoverzicht. Zonder de uitgebreide invoertabellen en
 *    zonder de afleidingen per staaf.
 *
 * Het type is een VOORINSTELLING, geen slot: na het toepassen kan elke
 * sectie los aan of uit (ReportPreview laat dan "aangepast" zien).
 */
import type { ComponentType } from "react";
import ProjectSection from "./sections/ProjectSection";
import TocSection from "./sections/TocSection";
import NodesSection from "./sections/NodesSection";
import BeamsSection from "./sections/BeamsSection";
import PlatesSection from "./sections/PlatesSection";
import SectionsSection from "./sections/SectionsSection";
import MaterialsSection from "./sections/MaterialsSection";
import LoadsSection from "./sections/LoadsSection";
import CombinationsSection from "./sections/CombinationsSection";
import SchemaSection from "./sections/SchemaSection";
import DiagramsSection from "./sections/DiagramsSection";
import ReactionsSection from "./sections/ReactionsSection";
import DisplacementsSection from "./sections/DisplacementsSection";
import PlateStressSection from "./sections/PlateStressSection";
import CheckTableSection from "./sections/CheckTableSection";
import CheckDetailSection from "./sections/CheckDetailSection";

export interface ReportSectionDef {
  /** Stabiel id — sleutel voor de aan/uit-toggle in de reportStore. */
  id: string;
  /** i18n-sleutel (namespace "ribbon") voor het label in de zijbalk. */
  titleKey: string;
  /** Nederlandse fallback wanneer de sleutel ontbreekt. */
  defaultTitle: string;
  /** Hoort deze sectie in het BEPERKTE rapport? */
  inBeperkt: boolean;
  /** Waarom wel/niet — de onderbouwing hoort bij de sectie, niet in een lijst. */
  beperktReden: string;
  /** De sectie-inhoud zelf (rendert ook zijn eigen kop). */
  Component: ComponentType;
}

export const REPORT_SECTIONS: ReportSectionDef[] = [
  {
    id: "project",
    titleKey: "report.sectionProject",
    defaultTitle: "Projectgegevens",
    inBeperkt: true,
    beperktReden:
      "Projectgegevens en uitgangspunten (normen, gevolgklasse, levensduur) " +
      "zijn de basis van elk rapport — zonder die kop is geen enkele uitkomst " +
      "te plaatsen.",
    Component: ProjectSection,
  },
  // Inhoudsopgave: voorwerk, dus na de projectgegevens en vóór de
  // inhoudelijke hoofdstukken. De paginanummers komen uit de paginering
  // zelf (zie toc.ts).
  {
    id: "toc",
    titleKey: "report.sectionToc",
    defaultTitle: "Inhoudsopgave",
    inBeperkt: true,
    beperktReden:
      "Voorwerk, geen inhoud: kost weinig ruimte en maakt ook een kort " +
      "rapport doorzoekbaar voor de ontvanger.",
    Component: TocSection,
  },
  // ── R2: invoersecties (lezen de modelstate via ReportDataContext) ──
  {
    id: "nodes",
    titleKey: "report.sectionNodes",
    defaultTitle: "Knopen",
    inBeperkt: false,
    beperktReden:
      "Uitgebreide invoertabel: coördinaten per knoop zijn controlemateriaal, " +
      "geen informatie voor de opdrachtgever. De constructieschets laat " +
      "hetzelfde in één beeld zien.",
    Component: NodesSection,
  },
  {
    id: "beams",
    titleKey: "report.sectionBeams",
    defaultTitle: "Staven",
    inBeperkt: false,
    beperktReden:
      "Uitgebreide invoertabel; de toegepaste profielen staan al in " +
      "'Profielen & doorsneden' en op de constructieschets.",
    Component: BeamsSection,
  },
  // ── P5.2: platen (wandschijven) — invoertabel ──
  {
    id: "plates",
    titleKey: "report.sectionPlates",
    defaultTitle: "Platen",
    inBeperkt: false,
    beperktReden: "Uitgebreide invoertabel (mesh- en plaatgegevens).",
    Component: PlatesSection,
  },
  {
    id: "sections",
    titleKey: "report.sectionSections",
    defaultTitle: "Profielen & doorsneden",
    inBeperkt: true,
    beperktReden:
      "Dít is wat er besteld en gemonteerd wordt — de belangrijkste uitkomst " +
      "van de berekening voor de ontvanger.",
    Component: SectionsSection,
  },
  {
    id: "materials",
    titleKey: "report.sectionMaterials",
    defaultTitle: "Materialen",
    inBeperkt: false,
    beperktReden:
      "De materiaalsoort staat al bij elk profiel en in de uitgangspunten; " +
      "de aparte tabel met E-moduli is achtergrond.",
    Component: MaterialsSection,
  },
  {
    id: "loads",
    titleKey: "report.sectionLoads",
    defaultTitle: "Belastinggevallen",
    inBeperkt: true,
    beperktReden:
      "De aangenomen belastingen zijn uitgangspunten: zonder die aannames is " +
      "de toetsing niet te beoordelen of over te nemen.",
    Component: LoadsSection,
  },
  {
    id: "combinations",
    titleKey: "report.sectionCombinations",
    defaultTitle: "Belastingcombinaties",
    inBeperkt: false,
    beperktReden:
      "Combinatiefactoren zijn normadministratie; de maatgevende combinatie " +
      "staat per toets al in het toetsingsoverzicht.",
    Component: CombinationsSection,
  },
  // ── R3: resultaatsecties (schets = model; de rest leest de multi-LC-
  //    resultaten uit de ReportDataContext en toont "Nog niet berekend"
  //    zolang die er niet — of niet meer — zijn) ──
  {
    id: "schema",
    titleKey: "report.sectionSchema",
    defaultTitle: "Constructieschets",
    inBeperkt: true,
    beperktReden:
      "Het beeld van de constructie: vervangt in één figuur de knoop- en " +
      "staaftabellen.",
    Component: SchemaSection,
  },
  {
    id: "diagrams",
    titleKey: "report.sectionDiagrams",
    defaultTitle: "Krachtsverdeling",
    inBeperkt: true,
    beperktReden:
      "De M-, V- en N-lijnen zijn het klassieke resultaatbeeld en laten " +
      "meteen zien waar de constructie zwaar belast is.",
    Component: DiagramsSection,
  },
  {
    id: "reactions",
    titleKey: "report.sectionReactions",
    defaultTitle: "Oplegreacties",
    inBeperkt: true,
    beperktReden:
      "Nodig voor de fundering en voor aansluitende partijen — een uitkomst " +
      "die búiten dit rapport gebruikt wordt.",
    Component: ReactionsSection,
  },
  {
    id: "displacements",
    titleKey: "report.sectionDisplacements",
    defaultTitle: "Verplaatsingen",
    inBeperkt: true,
    beperktReden:
      "Doorbuiging is een beoordelingscriterium waar de opdrachtgever zelf " +
      "mee te maken krijgt (vloerafwerking, kozijnen, scheurvorming).",
    Component: DisplacementsSection,
  },
  // ── P5.2: plaatspanningen per combinatie + omhullende ──
  {
    id: "plateStresses",
    titleKey: "report.sectionPlateStresses",
    defaultTitle: "Plaatspanningen",
    inBeperkt: false,
    beperktReden:
      "Detailuitvoer per plaatelement; hoort bij de volledige berekening.",
    Component: PlateStressSection,
  },
  {
    id: "checkTable",
    titleKey: "report.sectionCheckTable",
    defaultTitle: "Toetsingsoverzicht",
    inBeperkt: true,
    beperktReden:
      "De conclusie van het rapport: voldoet elke staaf, en met welke " +
      "maatgevende toets.",
    Component: CheckTableSection,
  },
  {
    id: "checkDetail",
    titleKey: "report.sectionCheckDetail",
    defaultTitle: "Toetsing per staaf",
    inBeperkt: false,
    beperktReden:
      "De formule-afleidingen per staaf: verantwoording voor de " +
      "controlerend constructeur, niet voor de opdrachtgever.",
    Component: CheckDetailSection,
  },
];

/**
 * `hiddenSections`-map die bij een rapporttype hoort. "Volledig" verbergt
 * niets; "beperkt" verbergt de secties met `inBeperkt: false`.
 */
export function hiddenSectionsVoorType(beperkt: boolean): Record<string, boolean> {
  if (!beperkt) return {};
  const uit: Record<string, boolean> = {};
  for (const s of REPORT_SECTIONS) {
    if (!s.inBeperkt) uit[s.id] = true;
  }
  return uit;
}

/** Wijkt de huidige sectiekeuze af van de voorinstelling van dit type? */
export function isAangepast(
  hiddenSections: Record<string, boolean>,
  beperkt: boolean,
): boolean {
  const verwacht = hiddenSectionsVoorType(beperkt);
  return REPORT_SECTIONS.some(
    (s) => Boolean(hiddenSections[s.id]) !== Boolean(verwacht[s.id]),
  );
}
