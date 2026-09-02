# Plan: profielen — tekening, uitbreiding en samengestelde doorsneden

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Bron: vier verkenningsrapporten profielen d.d. 2026-09-02 (profieldatabase-keten,
> tekencomponent/v2-UI, doorsnede-eigenschappen, functionele eisen). Alle
> regelnummers en getallen hieronder zijn opnieuw geverifieerd tegen master
> (764e6ed) plus de werkmap-wijzigingen die op dat moment openstonden.

**Doel:** drie letterlijke gebruikerswensen afdekken.

1. *"bij de profieltoewijzing wil ik ook gewoon een tekeningetje zien, dat je ziet
   hoe het profiel eruit ziet"*
2. *"profielen nog even verder uitbreiden"*
3. *"de mogelijkheid hebben om samengestelde profielen te maken van staal, met
   eigen berekening van doorsnede-eigenschappen"*

Vandaag: de profieldatabase telt 100 entries (98 uniek), de reeksen stoppen bij
HEA/HEB 400 en HEM 300, hele families ontbreken (UPE, L, T, HD/HL, koudgevormd,
plaatliggers), er staan **vijf** parallelle kopieën van dezelfde afmetingen in de
repo, en `Beam.profile` is een platte string (femTypes.ts:83-95) waar een
zelfgemaakte doorsnede principieel niet in past. Na dit plan: één afleidbare en
per-profiel gecontroleerde database, een gedeelde doorsnedetekening overal in de
UI, en gelaste/samengestelde stalen doorsneden met een eigen, in Rust berekende
en aantoonbaar correcte eigenschappenset — met expliciet benoemde grenzen aan wat
er daarop getoetst mag worden.

---

## Architectuurkeuze 1: samengestelde doorsneden rekenen in de Rust-kern

De eigenschappenberekening van een samengestelde doorsnede landt in
`src-tauri/crates/section-properties` (nieuw `composite.rs`), **niet** in
TypeScript. Argumenten:

1. **Er zijn al vijf bronnen van waarheid; een zesde is de duurste fout die dit
   plan kan maken.** Vandaag staan dezelfde afmetingen in (a)
   `steel-profiles/data/profiles.json`, (b) `steelSections.generated.ts`,
   (c) `steelSectionDims.generated.ts`, (d) de handmatige tabel
   `STAALPROFIEL_AFMETINGEN` in `ifcExport.ts:105 e.v.` (met een TODO op
   :96-98 die zichzelf al afkeurt) en (e) `PROFILE_AREA_CM2`/`PROFILE_WPL_Y_CM3`
   in `profileData.ts:11-51`, dat bij een onbekend profiel stil terugvalt op
   HEA160 (`profileData.ts:76`). Een TS-rekenmotor zou solver, toetsing, rapport
   en IFC opnieuw uit elkaar laten lopen.
2. **De toetsing consumeert al precies één struct.** Elke weerstands- en
   stabiliteitsfunctie neemt `p: &SectionProperties` (section-properties/src/lib.rs:15-34,
   18 velden). Een samengestelde doorsnede die diezelfde struct vult, erft het
   volledige EN 1993-apparaat gratis — mits classificatie én knikkromme expliciet
   meekomen, en die zijn nu vormspecifiek fout (zie fase D2).
3. **De analytische kern bestaat al en wordt al gebruikt om cataloguswaarden te
   reproduceren.** `i_section.rs`, `channel.rs` en `rhs.rs` leveren dezelfde
   struct uit pure geometrie. Een generieke lamellen-solver is de natuurlijke
   generalisatie: gewalste profielen blijven catalogus (met controle), gelast en
   samengesteld wordt berekend.
4. **`cargo test` is de plek waar dit soort fouten gevangen wordt.** De node-tests
   bewijzen de doorvoer (solver, adapter, UI-keten); de doorsnedewiskunde is
   zuivere rekenkunde en hoort in de Rust-testbatterij, die per commit meedraait.

## Architectuurkeuze 2: één inline doorsnede in de toetsingsingang, geen tweede database

`BeamCheckInput` draagt vandaag alleen `profile_name: String`
(steel-check/src/input.rs:15-17) en de orchestrator zoekt die op met
`db().find(&input.profile_name)` (orchestrator.rs:107-121) — één resolutieplek.
Een samengestelde doorsnede heeft geen naam in de gedeelde database. In plaats
van een tweede opzoektabel krijgt `BeamCheckInput` een optioneel veld
`custom_section: Option<CustomSection>`; is dat gevuld, dan wint het, anders de
databasenaam. Zo blijft er één plek waar een doorsnede ontstaat, en blijft het
onmogelijk dat de toetsing met een andere doorsnede rekent dan het rapport toont.

## Architectuurkeuze 3: de tekening is één gedeelde vormmodule, geen tweede tekenaar

De doorsnedecontour (walsuitrondingen, kokerhoeken, buis als twee cirkels met
`evenodd`) leeft in één module `components/shared/profielVorm.ts`; het rapport
(`SectionSketch`, vaste papierkleuren, twee panelen met maatvoering en assen) en
de app (`ProfielMiniatuur`, één paneel, thema-tokens) zijn twee *presentaties*
van diezelfde wiskunde. De naam→vorm-conversie (`shapeVanProfiel`) staat er ook
in, zodat een profiel overal identiek herkend wordt. Dit is de enige manier om te
voorkomen dat een nieuw profieltype in het rapport wél en in de kiezer níet
getekend wordt. De `SectionShape`-union is bewust een **gesloten** union met een
`switch` zonder `default` (profielVorm.ts:76-134): een nieuwe vorm geeft
gegarandeerd compile-fouten op precies de plekken die aangepast moeten worden.

## Architectuurkeuze 4: eerst het fundament, dan de groei

De database mag pas groeien nadat drie aangetoonde inhoudelijke fouten gerepareerd
zijn en er een consistentietest over de héle database draait. Reden: elke fout
vermenigvuldigt zich met het aantal profielen, en alle drie zijn nu geverifieerd
aan de **onveilige** kant:

- **HEM-It is 34,5% tot 72,5% te hoog** (11 profielen; nagerekend met El Darwish &
  Johnston: HEM 100 database 118 cm⁴ tegen 68,4 cm⁴, HEM 300 1930 tegen 1435).
  Alle IPE/HEA/HEB liggen in −14,7%…+1%. De productie-kiptoetsing rekent
  `M_cr ∝ √(Iz·It)` (nb_annex.rs:170-173, `s_parameter` op :63-64), dus M_cr is
  voor alle 11 HEM-maten tot ~31% te hoog.
- **Alle 13 kanaalprofielen staan op knikkromme b om de sterke as** (geverifieerd:
  `b/c` voor élk Channel-profiel), waar Tabel 6.2 voor U-, T- en massieve
  doorsneden kromme **c om elke as** voorschrijft. α gaat van 0,49 naar 0,34
  (buckling_curve.rs:11-16), dus χ_y komt structureel te hoog uit.
- **De doorsnedeclassificatie is I-profiel-specifiek en wordt op alle vormen
  losgelaten.** `classify_section` (classification.rs:24-38) rekent
  onvoorwaardelijk `c_web = h − 2tf − 2r`, `c_flange = b/2 − tw/2 − r` en de
  uitstekende-flenslimieten 9/10/14·ε. Nagerekend over de database: SHS 120x120x5,
  150x150x6, 200x200x8, 250x250x10, 300x300x10 en CHS 168,3x8, 219,1x10, 273x10,
  323,9x12,5, 406,4x16 komen er als klasse 3 uit terwijl ze klasse 1 zijn
  (SHS 300x300x10: c/t = 26 < 33; CHS 406,4x16: d/t = 25,4 < 50·ε²). Gevolg:
  Wel in plaats van Wpl, ~12–15% te conservatief.

---

## Randvoorwaarden

- Nederlandse UI-teksten en comments; **geen productnamen van externe
  rekensoftware** — nergens, ook niet in comments, commit-messages of fixtures.
- `npx tsc --noEmit` schoon in design-mockup **per taak**.
- `cargo test --workspace` groen in src-tauri **per taak** die Rust raakt, en
  `cargo build` moet blijven slagen (de ts-rs-typen worden bij het testen
  geregenereerd — controleer dat de gegenereerde TS-typen mee gecommit worden).
- **Analytisch-exacte tests** in de stijl van de bestaande `test-*.mjs`
  (top-comment met de referenties en de handformules, `check(naam, actueel,
  verwacht, tolPct)`, exit-code op falen), uitgevoerd met `node test-<naam>.mjs`
  vanuit design-mockup.
- **Geen regressie op de bestaande testbatterij** (31 `test-*.mjs` in
  design-mockup per 2026-09-02, waaronder test-sectie-doorvoer, test-ifc-export,
  test-doorbuiging-toets, test-checkconfig en de twaalf plaat-tests) en niet op de
  Rust-workspace (steel-profiles/tests/referentie_hea.rs,
  nen-en-1993-1-1-section/tests/referentie_2867.rs en de unit-tests in de crates).
- Commit per afgeronde taak op master.
- Elke taak noemt **verboden bestanden** (niet aanraken) zodat taken conflictvrij
  parallel of door subagents kunnen lopen.

## Ontwerpbesluiten (gelden voor het hele plan)

- **Eén generator, geen seed-mechanisme.** `scripts/migrate-profiles.mjs` is de
  facto dood: het leest de bestaande `profiles.json` als `seeds` (regel 35-42) en
  slaat elke bronregel over waarvan de naam al in seeds staat (regel 240). Alle
  100 namen staan in seeds, dus een herrun migreert er 0 en een formulecorrectie
  raakt bestaande profielen nooit meer. Concreet zichtbaar: het script berekent
  Av;z voor UNP inmiddels als `A − 2b·tf + (tw+r)·tf`, maar de 12 gemigreerde
  UNP-entries dragen nog de oude `h·tw`-waarde. Na fase D2 is de generator
  idempotent: brondata → volledige herberekening → `profiles.json`.
- **Cataloguswaarde mag, stil overtypen niet.** Elke uit een catalogus overgenomen
  grootheid wordt door de generator vergeleken met de analytische formule; buiten
  de per-grootheid vastgelegde marge **faalt de generatie** met profielnaam en
  veldnaam. Dit is precies wat ontbrak toen de Iw-kolom +27% tot +154% fout was.
- **Duplicaten en sleutelbotsingen zijn een harde fout.** Zowel de Rust-loader
  (lib.rs:69-72) als de generator (genereer-staalprofielen.mjs, "eerste wint")
  slikken botsingen nu geruisloos. Geverifieerd aanwezig: `HEB160` ↔ `HEB 160` en
  `HEB300` ↔ `HEB 300`, met afwijkende eigenschappen, waarbij de niet-gecorrigeerde
  seed wint. Ook de naamgeving is inconsistent (`UNP350` zonder spatie tegen
  `UNP 80`…`UNP 300` mét).
- **Weergavenaam naast sleutel.** De gegenereerde tabellen dragen alleen de
  genormaliseerde sleutel, dus de UI toont letterlijk `CHS424X32`. Vanaf D1.2
  draagt elke entry een `naam` (`"CHS 42,4x3,2"`) die de UI toont; de sleutel
  blijft de identiteit.
- **Eenheden:** database en `SectionProperties` in mm/mm²/mm³/mm⁴/mm⁶, N/mm²
  voor spanningen. De solver-doorvoer (`resolveSection`, sectionResolver.ts:51-78)
  blijft ongewijzigd van eenheid.
- **Nooit een verzonnen getal.** Waar een toets op een doorsnede niet geldig is,
  komt er een expliciete weigering met reden in het resultaat en het rapport, geen
  benadering. `resolveSection`'s stille terugval op HEA160 (:71-77, mét
  console.warn) wordt in D2.7 zichtbaar gemaakt in de UI.

---

## Fase D1 — Tekening bij de profieltoewijzing (wens 1)

> **Startpunt:** de gedeelde vormmodule `components/shared/profielVorm.ts` en
> `components/shared/ProfielMiniatuur.tsx` bestaan al in de werkmap (nog niet
> gecommit), en `ProfielKiezer.tsx:99-103, 179-183, 230-234` roept ze al aan voor
> zowel staal als hout. D1.1 legt dat vast en bewijst het; D1.2/D1.3 dichten de
> resterende gaten.

- [ ] **D1.1 Tekening vastleggen en bewijzen.** Committeer de gedeelde
  vormmodule en de miniatuur, en verwijder de laatste duplicatie: de
  niet-geëxporteerde helper `steelShape` en de padwiskunde mogen alleen nog in
  `profielVorm.ts` staan; `SectionSketch.tsx` importeert `SectionShape`,
  `shapePath` en `buitenmaten` daaruit en houdt alleen zijn eigen layout
  (viewBox 342×172, twee panelen) en de vijf papierkleuren.
  **Testinhoud** (`test-profielvorm.mjs`, analytisch): voor **elke** sleutel in
  `STEEL_SECTION_DIMS` (a) geeft `shapeVanProfiel` een niet-null vorm en is het
  vormtype consistent met `kind` (ISection→isection, Channel→channel,
  Shs|Rhs→box, Chs→tube); (b) is de bounding box van het gegenereerde pad exact
  `b × h` (voor tube: `d × d`) binnen 0,01 mm na terugschalen; (c) is de
  ingesloten oppervlakte — bogen bemonsterd op 64 punten — gelijk aan
  `props.area` binnen 3% (uitrondingen en hoekstralen zitten in beide); (d) komt
  in geen enkel pad `NaN`, `Infinity` of een negatieve straal voor. Extra:
  `shapeVanProfiel("96x450")` geeft een rect 96×450 en
  `shapeVanProfiel("bestaat-niet")` geeft `null` (geen tekening in plaats van een
  verkeerde tekening).
  *Bestanden:* Create `design-mockup/src/components/shared/profielVorm.ts`,
  `design-mockup/src/components/shared/ProfielMiniatuur.tsx`,
  `design-mockup/test-profielvorm.mjs`; Modify
  `design-mockup/src/components/report/sections/SectionSketch.tsx`,
  `design-mockup/src/components/report/sections/SectionsSection.tsx`,
  `design-mockup/src/components/fem/ProfielKiezer.tsx`,
  `design-mockup/src/components/fem/ProfielKiezer.css`.
  *Niet aanraken:* alle bestanden onder `src-tauri/`, `steelSectionDims.generated.ts`,
  `steelSections.generated.ts`, `sectionResolver.ts`, `steelCheckBuilder.ts`,
  `engine.ts`, `App.tsx`, `FemCanvas.tsx`.

- [ ] **D1.2 Weergavenaam in de gegenereerde tabellen.** `genereer-staalprofielen.mjs`
  schrijft per entry een veld `naam: p.name` mee in `STEEL_SECTION_DIMS` (en de
  bijbehorende `SteelSectionDims`-interface). ProfielKiezer, LibraryDialog
  (`LibraryDialog.tsx:49-53`) en het rapporthoofdstuk tonen `naam` in plaats van
  de sleutel; de sleutel blijft de identiteit voor lookups. Zonder dit wordt een
  lijst met 300+ profielen (`CHS424X32`, `CHS1143X63`) onleesbaar.
  **Testinhoud** (`test-profielnamen.mjs`): elke entry heeft een niet-lege `naam`;
  `profileLookupKey(naam)` is exact gelijk aan de objectsleutel voor alle entries
  (dit is meteen de garantie dat de UI-naam en de toetsingssleutel niet uit elkaar
  kunnen lopen); geen twee entries delen dezelfde `naam`.
  *Bestanden:* Modify `design-mockup/scripts/genereer-staalprofielen.mjs`,
  `design-mockup/src/lib/steelSectionDims.generated.ts` (gegenereerd),
  `design-mockup/src/components/fem/ProfielKiezer.tsx`,
  `design-mockup/src/components/settings/LibraryDialog.tsx`,
  `design-mockup/src/components/report/sections/SectionsSection.tsx`;
  Create `design-mockup/test-profielnamen.mjs`.
  *Niet aanraken:* `src-tauri/**`, `profielVorm.ts`, `ProfielMiniatuur.tsx`,
  `SectionSketch.tsx`, `sectionResolver.ts`, `engine.ts`.

- [ ] **D1.3 Tekening op de andere plekken waar een profiel getoond wordt.**
  (a) Naslagdialoog `LibraryDialog.tsx`: kolom met een kleine `ProfielMiniatuur`
  (`maatvoering={false}`) per rij, zodat de bibliotheek visueel bladerbaar wordt.
  (b) Staaf-eigenschappenpaneel `FemProperties.tsx` en `BarPropertiesDialog.tsx`:
  miniatuur naast het gekozen profiel, zodat je zonder de kiezer te openen ziet
  wat er op de staaf zit. (c) Vorm onbekend → niets tekenen plus de bestaande
  eerlijke melding, nooit een placeholder-rechthoek.
  **Testcriterium:** `npx tsc --noEmit` schoon **plus** handmatige checklist:
  IPE 300 / UNP 200 / SHS 200x200x8 / CHS 219,1x10 / hout 96x450 tonen elk de
  juiste silhouetvorm in beide thema's (licht en openaec) met leesbare
  contourlijn; een staaf met een onbekend profiel toont geen tekening en wel de
  melding; de kiezer opent en sluit zonder layout-sprong bij 132×132 px.
  *Bestanden:* Modify `design-mockup/src/components/settings/LibraryDialog.tsx`
  (+ bijbehorende CSS), `design-mockup/src/components/fem/FemProperties.tsx`,
  `design-mockup/src/components/fem/BarPropertiesDialog.tsx`.
  *Niet aanraken:* `profielVorm.ts`, `ProfielMiniatuur.tsx`, `SectionSketch.tsx`,
  `genereer-staalprofielen.mjs`, `src-tauri/**`, `engine.ts`, `App.tsx`.

## Fase D2 — Fundament: fouten weg, één generator, één bron

> Deze fase raakt géén nieuwe profielen aan. Ze maakt de bestaande 98 aantoonbaar
> correct en zorgt dat fase D3 niet 300 keer dezelfde fout kan maken.

- [ ] **D2.1 Consistentietest over de héle database.** Nieuw
  `src-tauri/crates/steel-profiles/tests/consistentie.rs` dat over `db().all()`
  itereert. Vandaag hebben 96 van de 98 profielen nul testdekking (alleen
  HEA 320 en HEA 400 zijn gedekt) — precies waarom de Av;z/Iw-fout kon overleven.
  Deze taak schrijft de test **eerst**, met de bekende fouten als `#[should_panic]`
  of expliciet gemarkeerde bekende afwijkingen, zodat D2.2–D2.4 zich als
  groenwordende asserties laten aftekenen.
  **Testinhoud** — per profiel, met per check een eigen marge:
  (a) unieke genormaliseerde sleutel over de hele database (0 duplicaten);
  (b) `A` binnen 3% van de geometrische som per `kind`;
  (c) `i_y = √(Iy/A)` en `i_z = √(Iz/A)` binnen 0,5%;
  (d) `Wel;y = Iy/(h/2)` en `Wel;z = Iz/(b/2)` binnen 1% voor dubbelsymmetrische
      vormen (Channel uitgezonderd voor Wel;z, want die heeft twee waarden —
      het schema kan dat pas na D4.1 dragen; tot dan alleen `Iz/e_y` controleren);
  (e) `Wpl ≥ Wel` en `1,0 ≤ Wpl/Wel ≤ 1,7`;
  (f) `Av;z` volgens de kind-specifieke EN-formule binnen 1%
      (I: `A − 2b·tf + (tw+2r)·tf` met ondergrens `1,2·hw·tw`;
       Channel: `A − 2b·tf + (tw+r)·tf`; koker: `A·h/(b+h)`; CHS: `2A/π`);
  (g) `Iw = Iz·(h−tf)²/4` binnen 3% voor ISection, exact 0 voor Shs/Rhs/Chs;
  (h) `It` binnen 20% van El Darwish & Johnston voor ISection, binnen 5% van
      Bredt voor Shs/Rhs, exact `2·I` voor Chs;
  (i) de opgeslagen knikkrommen zijn gelijk aan wat de regelfunctie uit D2.3
      oplevert voor `kind`, `h/b` en `tf`.
  *Bestanden:* Create `src-tauri/crates/steel-profiles/tests/consistentie.rs`.
  *Niet aanraken:* `profiles.json`, alle `src/`-bestanden van welke crate dan ook,
  `design-mockup/**`.

- [ ] **D2.2 HEM-It corrigeren.** De 11 HEM-entries krijgen een It die binnen de
  marge van D2.1(h) valt. Aanpak: de El Darwish & Johnston-waarde wordt de
  referentie (dezelfde formule die de andere 50 I-profielen binnen −14,7%…+1%
  reproduceert), en de entry krijgt een herkomstmarkering `it_bron: "berekend"`
  in de brondata van de generator. Wees eerlijk in het commentaar: EDJ is zélf een
  benadering; de keuze is dat een consistente benadering met een aantoonbare
  marge te verkiezen is boven een kolom die 34,5–72,5% afwijkt en waarvan de
  herkomst onbekend is.
  **Testinhoud:** D2.1(h) wordt groen zonder uitzonderingen voor HEM. Extra
  regressietest in `nen-en-1993-1-1-ltb`: `M_cr` voor HEM 300 (L=6 m, zuivere
  buiging) daalt met factor `√(1930/1435) = 1,16` ten opzichte van de oude waarde
  — de test legt de nieuwe waarde vast met de handformule
  `M_cr = k·(C/L)·√(E·Iz·G·It)` erin uitgeschreven.
  *Bestanden:* Modify `src-tauri/crates/steel-profiles/data/profiles.json`,
  `scripts/migrate-profiles.mjs` (It-berekening); Create
  `src-tauri/crates/nen-en-1993-1-1-ltb/tests/hem_it_regressie.rs`.
  *Niet aanraken:* `classification.rs`, `buckling_curve.rs`, `section-properties/**`,
  `design-mockup/**` (de gegenereerde tabellen volgen in D2.6).

- [ ] **D2.3 Knikkrommen: regelfunctie in plaats van overgetypte paren.** Nieuw
  `steel-profiles/src/buckling_rules.rs` met `curves_for(kind, h, b, tf, grade)`
  die Tabel 6.2 uitschrijft. `BucklingCurves.y_axis/z_axis` gaat van `char` naar
  `String` zodat `a0` uitdrukbaar wordt, en `BucklingCurve::from_char` krijgt een
  `from_str` met `"a0"` (buckling_curve.rs:8 kent A0 al, :18-26 kan hem niet
  lezen). De opgeslagen paren in `profiles.json` blijven de S235–S420-waarde; de
  orchestrator vraagt de staalsoortafhankelijke variant op via de regelfunctie.
  Te corrigeren data: alle 13 Channel-entries van `b/c` naar `c/c`; de entry
  `HFRHS200X200X16` van `c/c` naar `a/a` (warmvervaardigd, net als de andere
  SHS/RHS) óf hernoemen naar de koudgevormde variant als dat de bedoeling was —
  kies bewust en leg het vast in het commentaar.
  **Testinhoud** (tabelgedreven unit-test, één rij per Tabel 6.2-regel):
  gewalst I h/b > 1,2 tf ≤ 40 → a/b, bij S460 → a0/a0; gewalst I h/b > 1,2
  40 < tf ≤ 100 → b/c, bij S460 → a/a; gewalst I h/b ≤ 1,2 tf ≤ 100 → b/c, bij
  S460 → a/a; gewalst I h/b ≤ 1,2 tf > 100 → d/d, bij S460 → c/c; gelast I
  tf ≤ 40 → b/c; gelast I tf > 40 → c/d; warmvervaardigd hol → a/a, bij S460 →
  a0/a0; koudgevormd hol → c/c; U/T/massief → c/c; L → b/b. Plus D2.1(i) groen
  over de hele database.
  *Bestanden:* Create `src-tauri/crates/steel-profiles/src/buckling_rules.rs`;
  Modify `src-tauri/crates/steel-profiles/src/lib.rs`,
  `src-tauri/crates/steel-profiles/data/profiles.json`,
  `src-tauri/crates/nen-en-1993-1-1-stability/src/buckling_curve.rs`,
  `src-tauri/crates/steel-check/src/orchestrator.rs` (regel 187-188),
  `scripts/migrate-profiles.mjs`, de gegenereerde ts-rs-typen onder
  `design-mockup/src/lib/types/steel/`.
  *Niet aanraken:* `classification.rs`, `section-properties/**`,
  `nen-en-1993-1-1-ltb/**`, alle overige `design-mockup/src`-bestanden.

- [ ] **D2.4 Doorsnedeklasse per vorm.** `SectionProperties` krijgt een veld
  `form: SectionForm` (`#[serde(default)]`, enum in section-properties:
  `RolledI | WeldedI | Channel | Box | Tube | Angle | Tee | BuiltUp`) — zo hoeft
  `nen-en-1993-1-1-section` geen afhankelijkheid op `steel-profiles` te krijgen.
  `classify_section` (classification.rs:17-54) leest `p.form` en past de juiste
  Tabel 5.2-rij toe: **inwendig** element voor koker-flens en -lijf (druk
  33/38/42·ε, buiging 72/83/124·ε), **d/t met 50/70/90·ε²** voor CHS,
  `c_flange = b − tw − r` voor het uitstekende U-flensdeel (nu foutief
  `b/2 − tw/2 − r`), en de bestaande I-logica alleen nog voor RolledI/WeldedI.
  **Testinhoud:** de tien nagerekende profielen die nu ten onrechte klasse 3
  zijn worden klasse 1, met de c/t-waarde in de assertie: SHS 120x120x5 (c/t 20,0),
  150x150x6 (21,0), 200x200x8 (21,0), 250x250x10 (21,0), 300x300x10 (26,0) en
  CHS 168,3x8 (d/t 21,0), 219,1x10 (21,9), 273x10 (27,3), 323,9x12,5 (25,9),
  406,4x16 (25,4) — allemaal ruim onder 33·ε resp. 50·ε². HEB 160 S235 zuivere
  buiging blijft klasse 1 (bestaande test classification.rs:73-78). Een verzonnen
  slank lijf (h 1000, tw 5, tf 20, r 0) blijft klasse 4. Extra: een UNP 200 met
  de nieuwe U-flensformule geeft dezelfde klasse als voorheen (dikke flenzen),
  maar een fictief UPE-achtig profiel met tf 8 mm schuift wél op — bewijs dat de
  formule daadwerkelijk verandert.
  *Bestanden:* Modify `src-tauri/crates/section-properties/src/lib.rs`
  (enum + veld), `src-tauri/crates/section-properties/src/{i_section,channel,rhs}.rs`
  (form vullen), `src-tauri/crates/nen-en-1993-1-1-section/src/classification.rs`,
  `src-tauri/crates/steel-profiles/src/lib.rs` (form afleiden uit `kind`),
  de gegenereerde ts-rs-typen.
  *Niet aanraken:* `profiles.json`, `buckling_rules.rs`, `orchestrator.rs`,
  `nen-en-1993-1-1-ltb/**`, `design-mockup/src/**` behalve de gegenereerde typen.

- [ ] **D2.5 Duplicaten weg, botsing = harde fout.** Verwijder de twee
  seed-duplicaten `HEB160` en `HEB300` (behoud de gemigreerde, met de audit
  gecorrigeerde `HEB 160`/`HEB 300`) en normaliseer alle namen naar de schrijfwijze
  mét spatie (`UNP350` → `UNP 350`). Verplaats de duplicaatcontrole naar een
  publieke functie die zowel `build.rs` als de test aanroept, en laat `build.rs`
  falen bij een botsing in plaats van de huidige enkele `serde_json::Value`-parse
  (build.rs:1-8). Laat `build.rs` bovendien deserialiseren naar `Vec<SteelProfile>`
  in plaats van `Value`, zodat een typefout of ontbrekend veld bij het bouwen
  faalt en niet pas runtime in de `expect("profiles.json must parse")` op
  lib.rs:62-63.
  **Testinhoud:** D2.1(a) groen; een unit-test die de duplicaatdetectie voedt met
  twee entries `"HEB 160"` en `"HEB-160"` en een `Err` terugkrijgt; de database
  telt na deze taak 98 entries (was 100) en `db().find("HEB160")`,
  `db().find("HEB 160")` en `db().find("heb-160")` geven alle drie dezelfde entry
  met de gecorrigeerde `Av;z = 1764` en `Iw = 48,03e9`.
  *Bestanden:* Modify `src-tauri/crates/steel-profiles/data/profiles.json`,
  `src-tauri/crates/steel-profiles/build.rs`,
  `src-tauri/crates/steel-profiles/src/lib.rs`,
  `design-mockup/scripts/genereer-staalprofielen.mjs` (botsing → exit 1 in plaats
  van eerste-wint).
  *Niet aanraken:* `classification.rs`, `buckling_rules.rs`, `section-properties/**`,
  `design-mockup/src/**`.

- [ ] **D2.6 Eén idempotente generator.** Vervang het seed-mechanisme door een
  echte generator: brondata per reeks in aparte, leesbare databestanden
  (`scripts/profieldata/<reeks>.json`, alleen catalogusafmetingen + de handvol
  grootheden die écht uit de catalogus komen) → volledige herberekening van álle
  afgeleide velden via een JS-spiegel van de `section-properties`-formules →
  `profiles.json`. Elke grootheid krijgt een herkomst (`catalogus` of `berekend`);
  een cataloguswaarde die buiten de marge van D2.1 valt laat de generatie **falen**
  met profielnaam en veldnaam. Draai daarna `genereer-staalprofielen.mjs` zodat
  de twee TS-tabellen bij zijn.
  **Testinhoud:** (a) de generator twee keer draaien geeft byte-identieke
  `profiles.json` (idempotent); (b) de generator draaien op de huidige brondata
  reproduceert de gecommitte `profiles.json` byte-identiek — dat is het bewijs dat
  de data volledig afleidbaar is; (c) een opzettelijk vervalste cataloguswaarde
  (Iy × 1,2 in een kopie van de brondata) laat de generator met exit-code ≠ 0 en
  een melding met profielnaam en veldnaam falen; (d) `cargo test --workspace`
  groen, D2.1 groen.
  *Bestanden:* Modify `scripts/migrate-profiles.mjs` (of vervang door
  `scripts/genereer-profieldatabase.mjs`); Create `scripts/profieldata/*.json`;
  Modify `src-tauri/crates/steel-profiles/data/profiles.json` (gegenereerd),
  `design-mockup/src/lib/steelSections.generated.ts`,
  `design-mockup/src/lib/steelSectionDims.generated.ts` (gegenereerd).
  *Niet aanraken:* alle `src/`-bestanden van de Rust-crates,
  `design-mockup/src/**` behalve de twee gegenereerde tabellen.

- [ ] **D2.7 De handmatige kopieën elimineren.** (a) `ifcExport.ts` laat de
  ingebedde tabel `STAALPROFIEL_AFMETINGEN` (regel 105 e.v.) vallen en importeert
  `STEEL_SECTION_DIMS` — de TODO op :96-98 vraagt daar zelf om. (b)
  `profileData.ts` vervangt `PROFILE_AREA_CM2`/`PROFILE_WPL_Y_CM3` door een
  afleiding uit `STEEL_SECTIONS`/`STEEL_SECTION_DIMS`; `selfWeightPerMeter`
  (:75-81, gebruikt via App.tsx) valt niet meer stil terug op HEA160 maar geeft
  `null` terug, en de aanroeper toont dan een expliciete melding. (c)
  `sectionResolver.ts:71-77` doet hetzelfde: de `bron: "default"`-terugval blijft
  bestaan maar wordt in de UI zichtbaar bij de staaf (niet alleen `console.warn`).
  **Testinhoud** (`test-profielbronnen.mjs`): (1) voor **elk** van de 98 profielen
  geldt `selfWeightPerMeter("S235", naam) = −7850·A·9,81/1e9` binnen 1e-9
  relatief, met A uit `STEEL_SECTIONS` — dus geen enkel profiel valt nog stil
  terug; (2) `selfWeightPerMeter("S235", "bestaat-niet")` geeft `null`;
  (3) elk profiel dat `isSteelProfile` als staal herkent en in
  `STEEL_SECTION_DIMS` staat, levert in `ifcExport` een profieldefinitie (geen
  ontbrekende doorsnede meer); (4) `test-ifc-export.mjs` en
  `test-sectie-doorvoer.mjs` blijven groen.
  *Bestanden:* Modify `design-mockup/src/io/ifcExport.ts`,
  `design-mockup/src/components/fem/profileData.ts`,
  `design-mockup/src/lib/sectionResolver.ts`, `design-mockup/src/App.tsx`,
  `design-mockup/src/io/steelCheck.ts`; Create
  `design-mockup/test-profielbronnen.mjs`.
  *Niet aanraken:* `src-tauri/**`, de gegenereerde tabellen, `profielVorm.ts`,
  `ProfielMiniatuur.tsx`, `engine.ts`, `FemCanvas.tsx`.

## Fase D3 — Database uitbreiden (wens 2)

> Voorwaarde: D2 volledig afgerond. Elke taak hieronder voegt alleen brondata toe
> en laat de generator uit D2.6 het werk doen; de consistentietest uit D2.1 is
> daarmee automatisch de kruiscontrole van elk toegevoegd profiel tegen de
> formules uit de geometrie. De drie taken D3.1–D3.3 raken elk een eigen
> brondatabestand en kunnen daarom parallel.

- [ ] **D3.1 HEA/HEB/HEM verlengen tot en met 1000.** Nu: HEA 15 maten (100–400),
  HEB 15 unieke (100–400), HEM 11 (100–300). Toevoegen: HEA en HEB 450, 500, 550,
  600, 650, 700, 800, 900, 1000 (9 per reeks); HEM 320 t/m 1000. Let op: vanaf
  HEM 320 is `tf = 40 mm` — precies de grens in Tabel 6.2 — dus de knikkromme-regel
  uit D2.3 moet hier aantoonbaar de `tf ≤ 40`-tak kiezen, en de test moet dat
  expliciet vastleggen in plaats van het toevallig goed te hebben.
  **Testinhoud:** D2.1 (a) t/m (i) groen over de vergrote database, dus per nieuw
  profiel: A binnen 3% van de geometrische som, i = √(I/A) binnen 0,5%,
  Wel = I/(h/2) binnen 1%, Wpl/Wel in [1,0; 1,7], Av;z volgens de EN-formule
  binnen 1%, Iw = Iz(h−tf)²/4 binnen 3%, It binnen 20% van EDJ. Extra assertie:
  voor élk toegevoegd profiel is de opgeslagen knikkromme gelijk aan
  `curves_for(kind, h, b, tf, S235)` — de onderbouwing is dus mechanisch
  afdwingbaar, niet een claim in een commit-message. Aantalcontrole: HEA en HEB
  tellen na deze taak elk 24 maten, HEM 22.
  *Bestanden:* Modify `scripts/profieldata/hea.json`, `heb.json`, `hem.json`;
  gegenereerd: `profiles.json`, `steelSections.generated.ts`,
  `steelSectionDims.generated.ts`.
  *Niet aanraken:* alle overige brondatabestanden, alle Rust-`src/`-bestanden,
  `design-mockup/src/**` behalve de gegenereerde tabellen.

- [ ] **D3.2 IPE compleet, UNP compleet, UPE-reeks toevoegen.** IPE: de
  ontbrekende varianten aanvullen (IPE 750-reeks). UNP: 50, 65, 320, 380, 400 —
  het gat bij 320 is nu extra scheef omdat UNP 350 er wél staat. **UPE**: de
  parallelflens-U ontbreekt volledig terwijl `steelCheckBuilder.ts:56-59` `"UPE"`
  al als bekend prefix noemt — een UPE-staaf wordt vandaag dus als staal herkend
  en vervolgens overgeslagen met "niet bekend in de profieldatabase"
  (steelCheckBuilder.ts:267-274). UPE 80 t/m 400. UPE past op
  `ProfileKind::Channel`, mits D2.3 (kromme c/c) en D2.4 (U-flensformule
  `b − tw − r`) er al zijn — bij UPE zijn de flenzen dun genoeg om verschil te
  maken, anders dan bij UNP.
  **Testinhoud:** D2.1 groen over de vergrote database, met voor Channel de
  kanaal-specifieke varianten: `Av;z = A − 2b·tf + (tw+r)·tf` binnen 1%,
  `Iw` volgens de kanaalformule `(b³·tf·(h−tf)²/12)·(3b·tf + 2hw·tw)/(6b·tf + hw·tw)`
  binnen 10%. Aanvullend een expliciete zwaartepuntscontrole per kanaal:
  `e_y = b − Iz/Wel;z` reproduceert de catalogus-e binnen 2% — geverifieerd
  ijkpunt op de bestaande data: UNP 100 → 15,5 mm, UNP 200 → 20,2 mm,
  UNP 300 → 27,0 mm. Integratietest in TS (`test-profiel-upe.mjs`): een staaf met
  profiel `"UPE 200"` wordt door `buildSteelCheckInputs` **niet** meer
  overgeslagen (de `skipped`-lijst is leeg voor die staaf).
  *Bestanden:* Modify `scripts/profieldata/ipe.json`, `unp.json`; Create
  `scripts/profieldata/upe.json`; Modify `design-mockup/src/components/fem/ProfielKiezer.tsx`
  (reeks UPE toevoegen aan `STAAL_REEKSEN`, :47-55); Create
  `design-mockup/test-profiel-upe.mjs`; gegenereerd: `profiles.json` en de twee
  TS-tabellen.
  *Niet aanraken:* `hea.json`, `heb.json`, `hem.json`, `shs.json`, `rhs.json`,
  `chs.json`, alle Rust-`src/`-bestanden, `steelCheckBuilder.ts`.

- [ ] **D3.3 SHS/RHS/CHS uitbreiden + analytische CHS-kern.** Nu: 7 SHS, 6 RHS,
  12 CHS, met per diameter telkens één wanddikte. Uitbreiden naar de gangbare
  maat/wanddikte-combinaties (SHS 40x40 t/m 400x400; RHS 50x30 t/m 400x200; CHS
  21,3 t/m 508 met meerdere wanddiktes per diameter). Tegelijk: nieuw
  `section-properties/src/chs.rs`, dat nu ontbreekt (`openaec-mcp-server`
  reproduceert CHS-waarden daarom niet en valt terug op de catalogus).
  Formules: `A = π/4(d² − (d−2t)²)`, `I = π/64(d⁴ − (d−2t)⁴)`, `Wel = 2I/d`,
  `Wpl = (d³ − (d−2t)³)/6`, `Av = 2A/π`, `It = 2I`, `Iw = 0`.
  **Let op de open vraag:** RHS-It in de huidige database wijkt 11–32% af van
  Bredt, met groeiende afwijking bij hogere h/b (100x50x4 +11%, 150x100x6 +22%,
  200x100x8 +29%, 250x150x8 +32%); voor SHS is de afwijking 1–9%. Eén van beide
  is fout en de databasewaarde is de hógere. **Deze taak stelt eerst vast welke,
  aan de hand van de Bredt-formule mét hoekcorrectie** (`A_m = (b−t)(h−t) −
  (4−π)(r_o−t/2)²`, `U_m = 2(b+h−2t) − 2(4−π)(r_o−t/2)`) en legt de uitkomst met
  motivatie vast in het commentaar. Blijft de afwijking na hoekcorrectie bestaan,
  dan wint de conservatieve (lagere) waarde en wordt dat expliciet vermeld.
  **Testinhoud:** (a) `chs.rs`-unit-tests reproduceren de 12 bestaande
  CHS-catalogusentries binnen 1% op A, I, Wel, Wpl, Av en It — de formules zijn
  exact, dus dat is een echte controle van de data, niet van de formule;
  (b) een handrekenbare CHS 100x10: `A = π/4(100² − 80²) = 2827,4 mm²`,
  `I = π/64(100⁴ − 80⁴) = π/64 · 59 040 000 = 2 898 118 mm⁴`,
  `Wel = 2I/d = 57 962 mm³`, `Wpl = (100³ − 80³)/6 = 81 333 mm³`,
  `Av = 2A/π = 1800,0 mm²`, `It = 2I = 5 796 236 mm⁴` — allemaal binnen
  0,1%; (c) D2.1 groen over de vergrote database, met de kokervarianten:
  `Av;z = A·h/(b+h)` binnen 1%, `Iw = 0` exact, It binnen de in deze taak
  vastgestelde marge; (d) `openaec-mcp-server` reproduceert CHS voortaan
  analytisch in plaats van door te geven.
  *Bestanden:* Create `src-tauri/crates/section-properties/src/chs.rs`; Modify
  `src-tauri/crates/section-properties/src/lib.rs` (mod),
  `src-tauri/crates/section-properties/src/rhs.rs` (hoekcorrectie It),
  `src-tauri/crates/openaec-mcp-server/src/main.rs` (regel 214-237),
  `scripts/profieldata/shs.json`, `rhs.json`, `chs.json`; gegenereerd:
  `profiles.json` en de twee TS-tabellen.
  *Niet aanraken:* `i_section.rs`, `channel.rs`, `classification.rs`,
  `buckling_rules.rs`, de andere brondatabestanden, `design-mockup/src/**`
  behalve de gegenereerde tabellen.

- [ ] **D3.4 De kiezer schaalbaar maken voor 300+ profielen.** De reekslijst
  `STAAL_REEKSEN` (ProfielKiezer.tsx:47-55) is handmatig en de sorteersleutel
  `maatVan` (:58-61) pakt het éérste getal in de sleutel — voor CHS levert dat de
  volgorde CHS 273, CHS 42,4, CHS 48,3, CHS 60,3, CHS 88,9, CHS 114,3, want
  `CHS273X10` begint met 273 en `CHS424X32` met 424. Vervang de sortering door
  `dims.h` (bij CHS de diameter) en daarna wanddikte; voeg een zoekveld toe dat op
  `naam` filtert (D1.2), en een reeksindeling die op `kind` + naamprefix werkt in
  plaats van alleen prefix. Behoud de miniatuur uit D1.
  **Testinhoud** (`test-profielkiezer-sortering.mjs`, pure functies): (a) de
  gesorteerde CHS-lijst is strikt monotoon in `dims.h` — expliciet: 42,4 vóór
  48,3 vóór 60,3 vóór 88,9 vóór 114,3 vóór 168,3 vóór 219,1 vóór 273 vóór 323,9
  vóór 406,4; (b) elke sleutel in `STEEL_SECTION_DIMS` valt in exact één reeks (geen
  profiel onvindbaar, geen dubbel); (c) het zoekfilter op `"200"` levert alleen
  profielen waarvan de weergavenaam `200` bevat. Aanvullend `npx tsc --noEmit`
  schoon plus handmatig: de HEA-lijst met 24 maten scrollt zonder de dialoog te
  laten groeien.
  *Bestanden:* Modify `design-mockup/src/components/fem/ProfielKiezer.tsx`,
  `design-mockup/src/components/fem/ProfielKiezer.css`; Create
  `design-mockup/test-profielkiezer-sortering.mjs`.
  *Niet aanraken:* `src-tauri/**`, `scripts/**`, de gegenereerde tabellen,
  `profielVorm.ts`, `ProfielMiniatuur.tsx`, `LibraryDialog.tsx`.

## Fase D4 — Samengestelde doorsneden: de rekenkern (wens 3, deel 1)

> Alles in deze fase is pure Rust-rekenkunde met `cargo test` als bewijs. Er komt
> nog geen UI, geen datamodel en geen toetsing aan te pas; dat is fase D5. Dat is
> bewust: de kern moet aantoonbaar kloppen vóórdat er een knop op zit.

- [ ] **D4.1 Schema-uitbreiding plus generieke lamellen-kern.** `SectionProperties`
  (section-properties/src/lib.rs:15-34) mist alles wat een asymmetrische doorsnede
  nodig heeft: geen zwaartepuntsligging, geen schuifmiddelpunt, geen aparte `Wel`
  voor boven- en ondervezel, geen hoofdassen. Voeg toe (alle
  `#[serde(default)]`, zodat de 98 bestaande entries ongewijzigd blijven laden):
  `y_c_mm`, `z_c_mm`, `wel_y_top_mm3`, `wel_y_bot_mm3`, `wel_z_left_mm3`,
  `wel_z_right_mm3`, `iyz_mm4`, `iu_mm4`, `iv_mm4`, `alpha_hoofdas_rad`,
  `y_s_mm`/`z_s_mm` (schuifmiddelpunt). Vul ze in `channel.rs` (het zwaartepunt
  `z_centroid` wordt daar al berekend maar niet weggeschreven) en laat ze bij
  dubbelsymmetrische vormen gelijk zijn aan de bestaande waarden. Dan de kern:
  nieuw `src-tauri/crates/section-properties/src/composite.rs` — een doorsnede als
  verzameling lamellen (rechthoekige platen met `b`, `t`, positie `y,z` en hoek
  `α`) plus optioneel hele catalogusprofielen als bouwsteen. Levert `A`,
  zwaartepunt, `Iy`, `Iz`, `Iyz`, hoofdassen (`Iu`, `Iv`, hoek), `Wel` per vezel,
  `Wpl` via de gelijke-oppervlakte-as, `Av;y/z`, `It` (`⅓Σb·t³` open; Bredt voor
  een expliciet gedeclareerde gesloten cel) en `Iw`. Formules: `A = ΣA_i`;
  `z_c = ΣA_i z_i / ΣA_i`; `Iy = Σ(I_i + A_i(z_i−z_c)²)`;
  `Iyz = Σ(I_yz,i + A_i(y_i−y_c)(z_i−z_c))`; `tan 2α = 2I_yz/(I_z−I_y)`;
  `Wpl = Σ|A_i|·|z_i − z_pna|` met de PNA op de gelijke-oppervlakte-as.
  **Testinhoud — allemaal met de hand na te rekenen, de getallen staan in de test:**
  1. **Gelaste I uit drie platen** — flenzen 200×15, lijf 400×10, h = 430:
     `A = 10 000 mm²`; `Iy = 2[200·15³/12 + 200·15·207,5²] + 10·400³/12 =
     311 783 333 mm⁴`; `Wel;y = Iy/215 = 1 450 155 mm³`;
     `Iz = 2·15·200³/12 + 400·10³/12 = 20 033 333 mm⁴`; `Wel;z = 200 333 mm³`;
     `Wpl;y = 2·3000·207,5 + 2·200·10·100 = 1 645 000 mm³`;
     `Wpl;z = 2·2·1500·50 + 2·2000·2,5 = 310 000 mm³`;
     `It = ⅓(2·200·15³ + 400·10³) = 583 333 mm⁴`;
     `Iw = Iz(h−tf)²/4 = 8,626·10¹¹ mm⁶`;
     `Av;z = η·hw·tw = 1,2·400·10 = 4800 mm²`. Alles binnen 0,1%
     (Iw binnen 1%, want de dunwandige formule is een benadering).
  2. **Twee U-profielen rug-aan-rug** (lijven tegen elkaar, uit de database):
     `Iy = 2·Iy,UNP` **exact** (binnen 1e-12 relatief — zuivere optelling zonder
     Steiner), en `Iz = 2(Iz,UNP + A_UNP·e_y²)` binnen 0,5%, met `e_y` uit de
     catalogus. Geverifieerde referentiewaarden voor UNP 200
     (A = 3220 mm², Iy = 19,10·10⁶, Iz = 1,48·10⁶, e_y = 20,19 mm):
     `Iy = 38,20·10⁶ mm⁴`, `Iz = 5,584·10⁶ mm⁴`. Idem UNP 300:
     `Iy = 160,6·10⁶`, `Iz = 18,47·10⁶`. `Iyz = 0` exact (dubbelsymmetrisch).
  3. **Massieve vormen als degeneratiecontrole:** rechthoek b×h geeft
     `Iy = bh³/12` en `Wpl;y = bh²/4` binnen 1e-12; een als lamellen benaderde
     cirkel d geeft `Wpl = d³/6` binnen 1%.
  4. **Hoofdassen-invarianten op een L uit twee rechthoeken** (100×10 staand,
     90×10 liggend): `Iyz ≠ 0`; na rotatie `Iu + Iv = Iy + Iz` binnen 1e-10
     relatief en `Iuv = 0` binnen 1e-10; de rotatiehoek reproduceert
     `½·atan(2Iyz/(Iz−Iy))`.
  5. **Torsie van een open kruis** van drie dunne platen: `It = ⅓Σb_i t_i³` binnen
     1e-12; **gesloten cel** (koker uit vier lamellen 200×200×10) reproduceert de
     Bredt-waarde van `rhs_section_props` binnen 2%.
  6. **Steiner-controle over een verschoven stelsel:** dezelfde doorsnede met alle
     lamellen 1000 mm verschoven geeft identieke `Iy` om het eigen zwaartepunt
     (binnen 1e-10 relatief) — bewijst dat de zwaartepuntsverschuiving klopt.
  7. **Schemacontrole (de nieuwe velden):** UNP 200 uit de database krijgt via
     `channel.rs` een `y_c` die binnen 2% gelijk is aan de catalogus-`e_y`
     (geverifieerd ijkpunt: 20,19 mm uit `b − Iz/Wel;z`; idem UNP 100 → 15,5 mm,
     UNP 300 → 27,0 mm), en `wel_z_left ≠ wel_z_right` voor Channel terwijl beide
     gelijk zijn voor elke ISection/Shs/Rhs/Chs. D2.1 blijft groen op alle 98
     bestaande profielen (de nieuwe velden zijn `default`, dus geen migratie).
  *Bestanden:* Create `src-tauri/crates/section-properties/src/composite.rs`;
  Modify `src-tauri/crates/section-properties/src/lib.rs` (nieuwe velden + mod),
  `src-tauri/crates/section-properties/src/channel.rs` (zwaartepunt en de twee
  Wel;z wegschrijven), `src-tauri/crates/section-properties/src/{i_section,rhs}.rs`
  (nieuwe velden vullen), de gegenereerde ts-rs-typen.
  *Niet aanraken:* `chs.rs` (fase D3.3), `nen-en-1993-1-1-*/**`, `steel-check/**`,
  `steel-profiles/**`, `scripts/**`, `design-mockup/src/**` behalve de
  gegenereerde typen.

- [ ] **D4.2 Doorsnedeklasse per plaatdeel.** De klasse van een samengestelde
  doorsnede volgt niet uit `h/tw` en `b/tf` van een gewalst profiel maar uit
  Tabel 5.2 **per plaatdeel**, met onderscheid tussen uitwendige (uitstekende) en
  inwendige elementen. Nieuw `classify_composite` in
  `nen-en-1993-1-1-section`, dat de lamellenbeschrijving en de spanningsverdeling
  (ψ uit N en M) inleest en de hoogste klasse over alle delen teruggeeft, mét de
  bepalende lamel in het resultaat zodat het rapport kan zeggen wáár de klasse
  vandaan komt.
  **Testinhoud:** (a) de gelaste I uit D4.1 (lijf c/t = 400/10 = 40 < 72·ε,
  flensuitstek c/t = (200−10)/2/15 = 6,33 < 9·ε) is klasse 1 bij S235 in zuivere
  buiging; (b) dezelfde doorsnede met een lijf 800×6 (c/t = 133 > 124) is klasse 4
  en het resultaat wijst het lijf aan; (c) met flenzen 300×10 (c/t = 14,5 > 14)
  is de flens bepalend en de klasse 4; (d) bij S355 (ε = 0,8137) schuift de grens
  aantoonbaar mee — zuivere buiging, ψ = −1, limieten 72ε = 58,6 / 83ε = 67,5 /
  124ε = 100,9: lijf 400×10 (c/t = 40) blijft klasse 1, lijf 700×10 (70) wordt
  klasse 3, lijf 1100×10 (110) wordt klasse 4; de test schrijft ψ en de drie
  limieten expliciet uit; (e) een als lamellen opgebouwde koker
  geeft dezelfde klasse als `classify_section` met `form = Box` op dezelfde
  geometrie — de twee paden mogen niet uit elkaar lopen.
  *Bestanden:* Modify `src-tauri/crates/nen-en-1993-1-1-section/src/classification.rs`;
  Create `src-tauri/crates/nen-en-1993-1-1-section/tests/samengesteld.rs`.
  *Niet aanraken:* `composite.rs` (alleen importeren), `section-properties/src/lib.rs`,
  `steel-check/**`, `steel-profiles/**`, `design-mockup/**`.

- [ ] **D4.3 Toetsingsingang: inline doorsnede plus expliciete weigeringen.**
  `BeamCheckInput` (steel-check/src/input.rs:15-44) krijgt
  `custom_section: Option<CustomSection>` (`#[serde(default)]`, zodat bestaande
  aanroepen ongewijzigd blijven). `check_beam` (orchestrator.rs:107-121) resolveert
  eerst `custom_section`, anders `db().find(&input.profile_name)`; de rest van de
  functie werkt ongewijzigd door op `p: &SectionProperties`. **Wat wél en niet
  mag draaien, hard geprogrammeerd:**
  - *Toegestaan* — doorsnedeweerstand N (6.2.4), V (6.2.6, met Av uit de kern),
    M_y en M_z (6.2.5), M+N-interactie (6.2.9), kolomknik 6.3.1 om y en z met de
    **gelaste** knikkromme (tf ≤ 40 → b/c; tf > 40 → c/d — nooit stil de gewalste
    kromme erven), en de BGT-doorbuigingstoets (puur EI, altijd geldig).
  - *Geweigerd met reden* — (1) **kip 6.3.2** op alles behalve een
    dubbelsymmetrische gelaste I: `m_cr_i_section` (nb_annex.rs:170-173) gebruikt
    alleen Iz en It en veronderstelt dubbelsymmetrie; `m_cr_algemeen`
    (en_general.rs:16-21) gebruikt Iw zonder monosymmetrieparameter z_j. Melding:
    *"kip is voor deze samengestelde doorsnede niet geautomatiseerd (monosymmetrie
    z_j ontbreekt) — beoordeel handmatig of voorkom kip met kipsteunen"*.
    (2) **klasse 4**: er is geen effectieve-doorsnedeberekening (EN 1993-1-5) —
    melding *"doorsnede is klasse 4; effectieve breedtes zijn niet
    geïmplementeerd"*, géén Wel-benadering. (3) **lijfplooi onder schuifkracht**
    wanneer `hw/tw > 72ε/η` — melding dat EN 1993-1-5 §5 nodig is. (4) **gesloten
    cel zonder expliciete declaratie**: It met de open-formule plus melding dat de
    torsiestijfheid daarmee sterk onderschat wordt.
  Elke weigering landt als `CheckStatus::NotApplicable` met een leesbare reden in
  `governing_check_id`/de checklijst, zoals de bestaande "profile not found"-tak
  (orchestrator.rs:119) — nooit een UC van 0,0 die als "voldoet" oogt.
  **Testinhoud:** (a) een `custom_section` met exact de eigenschappen van HEB 300
  geeft **identieke** UC's als `profile_name: "HEB 300"` (alle checks, binnen
  1e-12) — bewijst dat het inline-pad geen tweede rekenwijze introduceert;
  (b) de gelaste I uit D4.1 met N = 500 kN en M_y = 200 kNm geeft handrekenbare
  UC's: `N_Rd = 10 000·235/1,0 = 2350 kN → UC_N = 0,213`;
  `M_pl,Rd = 1 645 000·235·1e-6 = 386,6 kNm → UC_M = 0,517`;
  (c) diezelfde doorsnede krijgt kip **wel** (dubbelsymmetrisch gelast I) met
  knikkromme b/c, en dezelfde doorsnede met één flens 200 en één flens 300 krijgt
  kip **niet**, met de weigeringsmelding in het resultaat; (d) een lamellendoorsnede
  die klasse 4 uitkomt levert geen enkele weerstands-UC maar wel de melding.
  *Bestanden:* Modify `src-tauri/crates/steel-check/src/input.rs`,
  `src-tauri/crates/steel-check/src/orchestrator.rs`; Create
  `src-tauri/crates/steel-check/tests/samengesteld.rs`; gegenereerde ts-rs-typen.
  *Niet aanraken:* `composite.rs`, `classification.rs`, `nen-en-1993-1-1-ltb/**`,
  `steel-profiles/**`, `design-mockup/src/**` behalve de gegenereerde typen.

## Fase D5 — Samengestelde doorsneden: datamodel, UI en integratie (wens 3, deel 2)

- [ ] **D5.1 Datamodel en persist.** Een samengestelde doorsnede is geen naam in
  een globale tabel, dus `Beam.profile` (femTypes.ts:89) kan hem niet dragen.
  Introduceer `project.doorsneden: SamengesteldeDoorsnede[]` (id, naam,
  staalsoort, lamellen, optioneel gedeclareerde gesloten cellen) en laat
  `beam.profile` er met `"@eigen:<id>"` naar verwijzen. Persist volgens het
  bestaande optionele-velden-patroon (projectFile.ts:18-27) — **geen versie-bump**,
  wel het versiegeschiedeniscommentaar bijwerken. Alle vier de consumenten die nu
  aannemen dat een naam altijd in een globale tabel staat, krijgen een expliciete
  tak: `resolveSection` (sectionResolver.ts:51-78), `buildSteelCheckInputs`
  (steelCheckBuilder.ts:264-274), het rapporthoofdstuk en `ifcExport`.
  **Testinhoud** (`test-doorsnede-eigen.mjs`): (a) round-trip
  `serializeProject`/`deserializeProject` behoudt lamellen en cellen exact
  (diepe gelijkheid); (b) een projectbestand zónder `doorsneden` laadt ongewijzigd;
  (c) een staaf met `"@eigen:3"` terwijl doorsnede 3 níet bestaat levert een
  expliciete fout in de UI-laag en **geen** terugval op HEA160 — assertie op de
  foutmelding, niet op een getal; (d) `resolveSection` geeft voor een geldige
  `"@eigen:<id>"` de A en Iy die `composite.rs` uitrekent (waarde uit D4.1 test 1:
  A = 10 000 mm², Iy = 311 783 333 mm⁴) binnen 0,1%.
  *Bestanden:* Modify `design-mockup/src/components/fem/femTypes.ts`,
  `design-mockup/src/hooks/useFemStore.ts`, `design-mockup/src/io/projectFile.ts`,
  `design-mockup/src/lib/sectionResolver.ts`; Create
  `design-mockup/test-doorsnede-eigen.mjs`.
  *Niet aanraken:* `engine.ts`, `FemCanvas.tsx`, `ProfielKiezer.tsx`,
  `steelCheckBuilder.ts`, `src-tauri/**`.

- [ ] **D5.2 Doorsnede-editor in de kiezer.** Nieuwe materiaalsoort-tak
  "Samengesteld staal" in `ProfielKiezer` (naast de bestaande vijf,
  ProfielKiezer.tsx:38-44): lamellen toevoegen/verwijderen (b, t, y, z, hoek),
  een startsjabloon voor de drie gangbare gevallen (gelaste I uit drie platen;
  twee U rug-aan-rug; koker uit vier platen), en live de berekende eigenschappen
  (A, Iy, Iz, Wel, Wpl, It, klasse) naast de tekening. `SectionShape` krijgt een
  zesde variant `{ type: "lamellen"; delen: [...] }`; de gesloten `switch` in
  `profielVorm.ts:76-134` zorgt dat elke tekenplek een compile-fout geeft tot hij
  is bijgewerkt — dat is de bedoeling, niet een probleem.
  **Testcriterium:** `npx tsc --noEmit` schoon **plus** een pure-functietest
  (`test-doorsnede-editor.mjs`): het sjabloon "gelaste I" met flenzen 200×15 en
  lijf 400×10 levert exact de lamellenposities die `composite.rs` op
  A = 10 000 mm² en Iy = 311 783 333 mm⁴ brengen; de bounding box van de
  `lamellen`-vorm is 200×430; overlappende lamellen worden gedetecteerd en
  geweigerd met melding (dubbeltelling van oppervlakte is stille onzin).
  Handmatige checklist: sjabloon kiezen → tekening verschijnt → een flensdikte
  wijzigen → A en Iy veranderen zichtbaar en direct; annuleren laat het project
  ongewijzigd.
  *Bestanden:* Modify `design-mockup/src/components/fem/ProfielKiezer.tsx`,
  `design-mockup/src/components/fem/ProfielKiezer.css`,
  `design-mockup/src/components/shared/profielVorm.ts`,
  `design-mockup/src/components/shared/ProfielMiniatuur.tsx`,
  `design-mockup/src/components/report/sections/SectionSketch.tsx`; Create
  `design-mockup/src/lib/samengesteldeDoorsnede.ts`,
  `design-mockup/test-doorsnede-editor.mjs`.
  *Niet aanraken:* `engine.ts`, `App.tsx`, `FemCanvas.tsx`, `steelCheckBuilder.ts`,
  `src-tauri/**`, de gegenereerde tabellen.

- [ ] **D5.3 Eigenschappen uit de Rust-kern halen, niet uit TypeScript.** Nieuw
  Tauri-command `bereken_samengestelde_doorsnede(lamellen) -> SectionProperties`
  dat `composite.rs` aanroept. De editor uit D5.2 toont die waarden; de store
  cachet ze op de doorsnede (met de lamellen als invalidatiesleutel) zodat de
  solver-doorvoer synchroon blijft. Er komt **geen** tweede berekening in
  TypeScript — dit is architectuurkeuze 1, en deze taak is de plek waar hij
  gehandhaafd wordt.
  **Testinhoud:** (a) Rust-zijde: het command geeft voor de drie sjablonen uit
  D5.2 exact dezelfde struct als de directe `composite.rs`-aanroep (binnen 1e-12);
  (b) TS-zijde (`test-doorsnede-cache.mjs`): een lamelwijziging invalideert de
  cache en een ongewijzigde doorsnede niet; (c) een doorsnede zonder cache en
  zonder beschikbaar command levert een expliciete melding en géén solve met een
  geraden doorsnede.
  *Bestanden:* Modify `src-tauri/src/lib.rs` (command registreren),
  `design-mockup/src/hooks/useFemStore.ts`,
  `design-mockup/src/lib/samengesteldeDoorsnede.ts`; Create
  `design-mockup/test-doorsnede-cache.mjs`; gegenereerde ts-rs-typen.
  *Niet aanraken:* `composite.rs`, `orchestrator.rs`, `ProfielKiezer.tsx`,
  `engine.ts`, `App.tsx`.

- [ ] **D5.4 Toetsing, eigengewicht, rapport en IFC aansluiten.**
  `buildSteelCheckInputs` vult `custom_section` voor `"@eigen:<id>"`-staven in
  plaats van ze over te slaan; `selfWeightPerMeter` rekent met de berekende A;
  het rapport toont de lamellenopbouw, de berekende eigenschappen én — verplicht —
  de weigeringen uit D4.3 als zichtbare regels ("kip: niet geautomatiseerd voor
  deze doorsnede"), niet als weggelaten rij. IFC exporteert een samengestelde
  doorsnede als `IfcArbitraryClosedProfileDef` uit de lamellencontour, of slaat
  hem over met een expliciete waarschuwing in de exportmelding.
  **Testinhoud:** (a) `test-doorsnede-toetsing.mjs`: een staaf met de gelaste I
  uit D4.1 onder N = 500 kN / M_y = 200 kNm levert `UC_N = 0,213` en
  `UC_M = 0,517` binnen 1% (dezelfde handformules als D4.3(b), nu door de hele
  keten); (b) een monosymmetrische samengestelde doorsnede levert een resultaat
  met de kip-weigering als zichtbare regel, en `uc_max` bevat géén waarde uit een
  kiptoets; (c) eigengewicht: `q = −7850·10 000e-6·9,81/1000 = −0,770 kN/m`
  binnen 0,1%; (d) `test-ifc-export.mjs` blijft groen en de nieuwe doorsnede
  exporteert of waarschuwt, nooit stil niets.
  *Bestanden:* Modify `design-mockup/src/lib/steelCheckBuilder.ts`,
  `design-mockup/src/components/fem/profileData.ts`,
  `design-mockup/src/io/ifcExport.ts`,
  `design-mockup/src/components/report/sections/SectionsSection.tsx`,
  `design-mockup/src/components/report/ReportDataContext.tsx`; Create
  `design-mockup/test-doorsnede-toetsing.mjs`.
  *Niet aanraken:* `src-tauri/**`, `profielVorm.ts`, `ProfielKiezer.tsx`,
  `engine.ts`, `useFemStore.ts`.

- [ ] **D5.5 L- en T-profielen in de database.** Deze families konden pas hier
  landen: `SectionProperties` had geen zwaartepunt, geen tweede `Wel` per vezel en
  geen hoofdassen, en die komen met D4.1/D4.4 mee. Toevoegen: gelijkzijdig
  hoekstaal L 20x3 t/m 200x24 en ongelijkzijdig L (EN 10056-1), plus gewalst T.
  `ProfileKind` krijgt `Angle` en `Tee`, met de bijbehorende armen in
  `openaec-mcp-server/src/main.rs:222-234`, `orchestrator.rs:213` en de
  tekenmapping in `profielVorm.ts:23-36`. Knikkrommen: L → b om elke as; T → c om
  elke as (regelfunctie D2.3). **Grens, expliciet:** eenzijdig aangesloten
  hoekstaal vergt de effectieve slankheid uit §6.3.1.4/bijlage BB.1.2; die wordt
  in deze taak **niet** geautomatiseerd — een L-staaf krijgt de knikcontrole met
  de geometrische slankheid plus een zichtbare melding dat excentrische
  aansluiting handmatig beoordeeld moet worden. Kip op L en T wordt geweigerd
  (zelfde reden als D4.3: geen z_j).
  **Testinhoud:** (a) D2.1 groen over de vergrote database met de L/T-varianten:
  zwaartepunt uit de statische momenten binnen 1%, `Iu + Iv = Iy + Iz` binnen
  1e-10, `Iuv = 0` in het hoofdassenstelsel; (b) handrekenbaar ijkpunt L 100x100x10:
  `A = 100·10 + 90·10 = 1900 mm²`, `z_c = (1000·5 + 900·55)/1900 = 28,7 mm`,
  `It ≈ ⅓(100·10³ + 90·10³) = 63 333 mm⁴` — elk binnen 1%; (c) een L-staaf in de
  toetsing levert de knikcontrole plus de excentriciteitsmelding, en géén
  kipresultaat.
  *Bestanden:* Create `scripts/profieldata/hoekstaal.json`, `tprofiel.json`,
  `src-tauri/crates/section-properties/src/angle_tee.rs`; Modify
  `src-tauri/crates/steel-profiles/src/lib.rs` (ProfileKind),
  `src-tauri/crates/openaec-mcp-server/src/main.rs`,
  `src-tauri/crates/steel-check/src/orchestrator.rs`,
  `design-mockup/src/components/shared/profielVorm.ts`,
  `design-mockup/src/components/fem/ProfielKiezer.tsx` (reeksen); gegenereerd:
  `profiles.json` en de twee TS-tabellen.
  *Niet aanraken:* `composite.rs`, `classification.rs`, `i_section.rs`,
  `channel.rs`, `rhs.rs`, `chs.rs`, `engine.ts`, `App.tsx`.

---

## Scope-grenzen (expliciet, geen stille aannames)

**Wel in dit plan:** gewalste I/U/koker/buis/L/T uit de database met per-profiel
gecontroleerde eigenschappen; gelaste en samengestelde stalen doorsneden uit
rechthoekige lamellen (open én expliciet gedeclareerd gesloten); de tekening
overal in de UI; classificatie per plaatdeel; kolomknik met de juiste, per
vervaardigingswijze en staalsoort onderbouwde knikkromme.

**Bewust niet, met de reden erbij:**
- **Kip op monosymmetrische of asymmetrische doorsneden** — de M_cr-formules in
  de kern (nb_annex.rs:170-173, en_general.rs:16-21) kennen geen
  monosymmetrieparameter z_j. Kanaalprofielen krijgen vandaag een grove
  `× 0,7`-reductie (nb_annex.rs:185-188, in de code zelf als "conservative"
  gemarkeerd); die blijft, maar wordt niet uitgebreid naar L, T of samengesteld.
- **Klasse 4 / effectieve doorsneden (EN 1993-1-5)** — niet geïmplementeerd,
  dus geweigerd in plaats van benaderd.
- **Lijf- en flensplooi, versterkingen, langsstijfheden** — buiten EN 1993-1-1.
- **Koudgevormde profielen (EN 1993-1-3)** — C-, Z- en sigma-gordingen vergen een
  eigen norm met eigen effectieve-doorsnedeberekening; de knikkromme c/c staat wel
  al in de regelfunctie zodat de data later past.
- **Beton, aluminium en verbindingen** — de kiezer toont ze eerlijk uitgeschakeld
  (ProfielKiezer.tsx:41-43) en dat blijft zo.
- **Torsietoetsing (6.2.7)** — bestaat ook voor gewalste profielen nog niet.
- **HD/HL zware kolomprofielen en plaatliggers als catalogusreeks** — een
  plaatligger maak je vanaf D5.2 als samengestelde doorsnede; een eigen
  catalogusreeks voegt daar niets aan toe zolang `tf > 100 mm` (kromme d/d)
  niet in de data voorkomt.

## Backlog (bewust niet in dit plan)

- **Monosymmetrieparameter z_j en een echte M_cr voor U/L/T/samengesteld** —
  vergt de sectorale coördinaten uit `composite.rs` plus een uitbreiding van de
  LTB-crate; pas zinvol als er vraag naar is.
- **Effectieve doorsneden EN 1993-1-5** — ontgrendelt klasse 4 en daarmee slanke
  plaatliggers.
- **Koudgevormde reeksen (EN 1993-1-3)** en **HD/HL**.
- **Handelsmatenlijst voor hout** — de vrije b×h-invoer blijft correct voor de
  NL-praktijk, maar een keuzelijst (gezaagd 38/50/63/71/96 mm breed; GL in
  breedtes 90/115/140/165/190/215 mm en hoogtes in stappen van twee lamellen)
  zou de kiezer sterk verbeteren.
- **Ontbrekende houtklassen** — loofhout D30–D70 (in timberCheckBuilder al als
  "herkenbaar maar zonder normdata" gemarkeerd), GL24c/GL28c/GL32c en
  C40/C45/C50 ontbreken in nen-en-1995-1-1/src/data.rs:65-82.
- **Doorsnede-eigenschappen uit een vrij getekende polygon** (in plaats van
  rechthoekige lamellen) — `composite.rs` kan het principieel, maar de editor,
  de klassebepaling per plaatdeel en de IFC-export worden dan een eigen traject.
- **Profielen met verstijvingen** (lijfverstijvers, doubler plates) — raakt
  zowel de klassebepaling als de plooicontrole.
- **Aluminium- en betondoorsneden** in dezelfde lamellenstructuur.
- **Bibliotheekbeheer**: eigen doorsneden delen tussen projecten (nu leven ze in
  het projectbestand, wat voor fase 1 de juiste keuze is).
