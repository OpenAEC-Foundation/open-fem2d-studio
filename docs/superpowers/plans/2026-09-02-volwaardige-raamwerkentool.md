# Plan: van mockup-gehalte naar volwaardige 2D-raamwerkentool

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Bron: de inventaris in `docs/superpowers/specs/2026-09-02-volwaardige-raamwerkentool-inventaris.md` (169 elementen, bewijs per element).

**Doel:** elke knop in het programma doet wat hij belooft, en de reken-/toetsketen is correct genoeg om op te bouwen: juiste stijfheden overal, veldzakkingen, per-staaf toetsconfiguratie, betrouwbaar opslaan.

**Volgorde-principe:** correctheid vóór features, aansluiten vóór bouwen (veel motorcapaciteit bestaat al maar hangt los), en géén schijn-UI laten staan: wat niet werkt wordt óf aangesloten óf zichtbaar uitgeschakeld.

**Globale randvoorwaarden:** Nederlandse UI-teksten en comments · geen productnamen van externe rekensoftware · elke taak eindigt met `npx tsc --noEmit` schoon in design-mockup + relevante tests · geen regressie op de 199+ Rust-tests · commit per afgeronde taak op master.

---

## Fase A — Correct rekenen (kern)

- [x] **A1. Multi-LC/toetsingspad krijgt echte doorsneden.** `App.tsx` `computeAndStoreSolverOutputs` (~305-319) stuurt geen E/A/I mee — elke staaf rekent als HEA 160/S235 en de toetsing eet die krachten. Fix: per staaf `resolveSection(b.material, b.profile)` zoals FemCanvas al doet. Test: houten raamwerk-voorbeeld geeft in het multi-LC-pad dezelfde reacties/diagrammen als het canvas-pad.
- [x] **A2. Per-staaf E in de engine.** `engine.ts:82-86` zet één E voor het hele model (eerste staaf). Fix: per unieke E een Mesh-materiaal (`Mesh.addMaterial`, Mesh.ts:322-328) en per staaf toewijzen. Test: gemengd staal+hout-model — stijve staalligger op houten kolommen — geeft aantoonbaar andere verdeling dan alles-één-E.
- [x] **A3. Veldzakking w(x) per station.** Verplaatsingsuitvoer kent alleen knoopwaarden; een gewone overspanning toont 0 zakking in het veld. Fix: per station Hermite-interpolatie van eindverplaatsingen/-rotaties plús de particuliere oplossing (q/trapezium) in `BeamForces`→`ElementForces`; overlay tekent de kromme; per staaf max-veldzakking beschikbaar. Test: vrij opgelegde ligger q — w_mid = 5qL⁴/384EI binnen 1%.
- [x] **A4. 2e-orde echt (P-Δ).** `solveAllCasesNonlinear` delegeert naar lineair ("For now: same as linear", engine.ts:258). Fix: geometrisch niet-lineair pad van de core aansluiten, per cómbinatie rekenen (superpositie is bij 2e-orde ongeldig), valideren tegen een analytisch geval (kolom met dwarslast nabij knik). Tot die validatie: toggle uit de UI of gemarkeerd "1e orde".

## Fase B — Toetsing betrouwbaar (kern)

- [x] **B1. `Beam.checkConfig` + projectbestand v2.** Optioneel per-staaf object: kniklengtes/factoren per as, kipsteunposities, doorbuigingsklasse+limiet, zeeg, klimaatklasse, belastingduur. Projectbestand naar versie 2: checkConfig, belastingcombinaties én stramien mee opslaan (gaan nu verloren bij save/open!), met migratie vanaf v1.
- [x] **B2. EN 1993/EN 1995-tab gebonden.** De kniklengte-velden in `BarPropertiesDialog` zijn ongebonden decoratie. Binden aan checkConfig; builders (`steelCheckBuilder`/`timberCheckBuilder`) lezen de config in plaats van hun hardcoded defaults.
- [x] **B3. Doorbuigingstoets op veld-max.** Builders geven het maximum van w(x) uit A3 door in plaats van knoopzakkingen (die voor een normale overspanning 0 zijn — de toets slaagt nu altijd).
- [x] **B4. Hout-PDF.** Report-crate rendert het gedeelde NamedCheck-contract voor beide normen; Tauri-command; filter in `reportStore.generatePdf` vervangen door samenvoegen. *(Draait als aparte agent — geheel in src-tauri, conflictvrij.)*

## Fase C — Bestandszekerheid & basis-UX (kern)

- [x] **C1. Opslaan overal.** TitleBar-Opslaan (nu zonder onClick), Opslaan-knop op de Start-tab, Ctrl+S — allemaal naar het bestaande `handleSaveProject` (App.tsx:167).
- [x] **C2. Dirty-vlag + sluitbeveiliging.** Snapshot-vergelijking; Tauri `onCloseRequested` met opslaan/negeren/annuleren; zelfde guard vóór Nieuw/Openen/recent.
- [x] **C3. Sub-knoop netjes.** Bij splitsen: lasten proportioneel herverdelen en materiaal/profiel/releases overerven (lasten raken nu wees).

## Backlog (belangrijk → nice-to-have, uit de inventaris)

Afgerond sinds het plan: dode TitleBar/Welcome/recente-bestanden-knoppen ✓ · StatusBar echt ✓ · rapport-instellingen echt (live HTML-rapport R1–R5) ✓ · thermische last doorgevoerd ✓ (test-thermiek) · transform-tools ✓ (test-transform) · verkenner Materialen/Profielen echt, Versies-schijn weg ✓ · deellasten ✓ (test-deellast) · veerinklemming + veerreacties ✓ (test-veren) · uX/uZ-releases doorgerekend ✓ (test-releases) · Tabel-tab als echte tabel-editor (in uitvoering).

Extra solver-fixes buiten het plan om (2026-09-02): leeg belastinggeval brak de multi-LC-pijplijn (test-leeg-geval) · N-tekenconventie nu trek-positief conform contract (test-n-teken) · pendelstaaf-condensatie was fout — negatieve dwarsstijfheid bij dubbelscharnier (test-pendelstaaf).

Nog open, in deze volgorde: scheefstand/imperfecties · instellingen (eenheden, nationale bijlage, defaults) + projectinfo per bestand · Grafiek/Agent/Console-toggles aansluiten of verwijderen · IFC-tab echt of eerlijk minimaal · DocumentBar één-document eerlijk · FeedbackDialog naar het juiste repo · platen (groot, apart plan).

Live HTML-rapport: eigen spec (`2026-09-01-rapportgenerator-eisen.md`), start na fase B.
