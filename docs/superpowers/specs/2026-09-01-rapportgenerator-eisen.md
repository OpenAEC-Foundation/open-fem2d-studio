# Rapportgenerator — eisen (verzameld)

Status: eisenverzameling. Doel-app: `design-mockup/` (het programma).
Bron: opdrachten van de gebruiker, 2026-09-01.

## Functionele eisen

0. **LIVE HTML-rapport als primaire vorm** (toegevoegd later op 2026-09-01):
   - Geen genereer-knop of PDF-cyclus: het rapport ís een live weergave die
     zich abonneert op de model- en resultatenstate. Constructie aanpassen →
     rapport is direct bijgewerkt (herrekenen + hertoetsen automatisch of met
     duidelijke "verouderd"-markering totdat herrekend is).
   - **Naast het scherm te zetten**: het rapport moet in een eigen venster
     kunnen (tweede Tauri-WebView-venster of los browservenster op de
     dev-server), synchroon met de app-state.
   - PDF wordt een export van hetzelfde live rapport, geen aparte pijplijn.
   - Dit vervangt de oude rapportmodule in het programma: die is rommelig,
     met kloppende hoogtes als expliciet pijnpunt — **herontwerp**, geen
     opknapbeurt. Paginahoogtes/A4-weergave moeten exact kloppen (ook als
     basis voor de latere PDF-export).
   - **DEFINITIEF BESLOTEN (2026-09-02, gebruiker expliciet):** géén
     onzichtbare direct-naar-PDF-engine als gebruikersroute. Het rapport ÍS
     HTML — zichtbaar en aanpasbaar — en de PDF ontstaat daarúit via de
     printpijplijn van de webview (print-naar-PDF; dat werkt tegenwoordig
     goed). De bestaande Rust-PDF-route verdwijnt uit de UI; de report-crate
     blijft hooguit als slapende bibliotheek bestaan.
1. **Modulair.** De generator is opgebouwd uit losse, herbruikbare secties;
   secties aan/uit zetten mag de rest niet raken.
2. **Parametrisch met live preview.** De gebruiker ziet een preview en stelt
   opties in; het rapport volgt de instellingen direct.
3. **Twee detailniveaus voor de normtoetsing, per rapport instelbaar:**
   - **Tabellarisch:** één rij per staaf — staafnummer, hoogste unity check,
     en daarbij de formule/aanduiding van de maatgevende toets. Bij 10 staven
     dus 10 rijen.
   - **Uitgebreid:** per staaf de werkelijk ingevulde normformules op de
     maatgevende plek in de staaf (zoals de referentie-uitwerking 2867).
4. **Meerdere materialen.** Nu staal (EN 1993); hout (EN 1995) moet er later
   vlekkeloos in passen. Geen staal-aannames in de rapportstructuur: secties
   krijgen een materiaalsoort-onafhankelijk contract (toets-id, titel,
   artikel, formule, tussenwaarden, UC, status).
5. **Constructie-views.** Het 2D-raamwerk (geometrie, belastingen,
   krachtsverdeling M/V/N, reacties, vervormingen) moet er goed en op schaal
   in staan. Correcte afmetingen zijn een harde eis.
6. **Doorsnede van het profiel mét eigenschappen.** Per toegepast profiel een
   doorsnede-tekening (zoals `ProfileSvgPreview`: contouren met fillets,
   maatlijnen h/b/t_w/t_f, assen) naast de eigenschappentabel (A, I_y, I_z,
   W_el, W_pl, A_v, I_t, I_w, …).
7. **Instelbare koptekst** met logo en projectgegevens (bedrijf, project,
   nummer, datum, constructeur).
8. **Volledige berekening als inhoud** (eerder vastgelegde eis): geometrie,
   profielen, belastinggevallen, combinaties, krachtsverdeling en per staaf
   de toetsingen — gelijkwaardig aan de externe referentie-uitdraai.

## Reeds aanwezige bouwstenen (uit de verkenning)

- `src/core/report/ReportGenerator.ts` — verweesde maar rijke HTML-generator:
  cover, TOC, knopen/staven/profielen, belastinggevallen, combinatietabel,
  reacties, verplaatsingen, M/V/N-SVG's (`DiagramRenderer.ts`).
- `src/components/ReportPanel/sections/` — 15 React-secties, incl.
  `CheckBlock.tsx` met echte KaTeX-rendering van de normformules.
- `src/components/SectionPropertiesDialog/ProfileSvgPreview.tsx` —
  parametrische doorsnede-tekening (eis 6).
- Rust-route: `report`-crate op `openaec-layout` (PDF met tabellen,
  paginanummering, kop/voet) — mist nog modelsecties, diagrammen en
  formule-typesetting.
- Toetsingsdata: `BeamCheckResult` levert per toets formule (LaTeX),
  variabelen, tussenwaarden, UC en status — voldoende voor beide
  detailniveaus.

## Openstaande architectuurkeuze voor het plan

HTML-preview (React-secties, KaTeX, SVG) als primaire weergave met
print-naar-PDF, versus de Rust-PDF-route uitbouwen. De HTML-kant heeft
vandaag verreweg de meeste van de gevraagde bouwstenen.
