# Plan: live HTML-rapport (vervangt de directe PDF-route)

> Bron: `docs/superpowers/specs/2026-09-01-rapportgenerator-eisen.md` — met het
> definitieve besluit van 2026-09-02: het rapport ÍS HTML; PDF ontstaat via de
> print-naar-PDF-pijplijn van de webview. De onzichtbare Rust-PDF-route gaat
> uit de UI.

**Doel:** het Rapport-tabblad toont een live, modulair HTML-rapport dat zich
abonneert op model/resultaten/toetsing (constructie aanpassen → rapport direct
bij), naast het scherm te zetten is (detached venster), en waaruit de PDF via
afdrukken ontstaat met exact kloppende A4-pagina's.

**Randvoorwaarden:** Nederlandse UI · geen productnamen van externe
rekensoftware · tsc schoon per taak · aansluiten-of-weg (geen decoratie) ·
commit per taak op master.

## Taken

- [x] **R1. Rapport-raamwerk.** `ReportPreview` wordt het live HTML-rapport:
  sectieraamwerk (registry van secties met aan/uit, volgorde), A4-print-CSS
  (`@page`, mm-maten, paginascheiding per sectie, kop-/voettekst met
  paginanummers via CSS counters), zoombare schermweergave, en de
  Afdrukken/PDF-knop via de webview-printdialoog. De oude
  `generatePdf`/iframe-route en de dode instellingen (engine, tenant/brand,
  zinloze toggles) gaan eruit; sectie-toggles die blijven wérken. Het
  detached-venster-pad (`useWindowManager`, view "report") wordt de
  "naast je scherm"-knop.
- [x] **R2. Invoersecties.** Projectblok (gegevens + instelbare koptekst/logo
  per project), knopen- en stavenlijst, profielen mét doorsnede-tekening
  (SVG, parametrisch: I-profielen en rechthoeken b×h) naast de
  eigenschappentabel, materialen, belastinggevallen (tabel per geval) en
  combinatietabel met factormatrix.
- [x] **R3. Resultaatsecties.** Constructieschets op schaal (SVG),
  M/V/N/w-diagrammen per combinatie of omhullende (hergebruik de
  21-station-arrays), oplegreacties, verplaatsingen — selecteerbaar per
  combinatie.
- [x] **R4. Toetsingssecties.** Twee detailniveaus per rapport instelbaar:
  tabellarisch (rij per staaf: maatgevende UC + formule/artikel) en
  uitgebreid (volledige KaTeX-afleidingen — hergebruik CheckBlock).
  Materiaal-neutraal (staal + hout door hetzelfde pad).
- [x] **R5. Live + venster.** Rapport abonneert op de stores (live bij
  modelwijziging, met "verouderd"-markering zolang niet herrekend);
  detached venster synchroon; print vanuit beide.

## Uitfasering PDF-route
UI-aanroepen van `generate_steel_report_pdf` verwijderen (ReportPreview,
Ribbon, CheckPanel-dubbelklik → vervangen door het HTML-rapport te openen op
de betreffende staaf). De report-crate en zijn tests blijven bestaan als
bibliotheek (geen UI-consument); besluit over verwijderen valt later.
