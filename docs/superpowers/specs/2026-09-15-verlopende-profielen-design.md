# Verlopende profielen — ontwerp

Datum: 2026-09-15
Status: ontwerp, besluiten genomen (zie §2); wacht op beoordeling van dit document

## 1. Doel

Een staaf in Open FEM2D Studio kan een **profiel aan het begin en een profiel aan het
eind** hebben. Tussen die twee verlopen de maten lineair. De stijfheid, het eigen
gewicht, de snedekrachten, de zakking, de toetsing (staal en hout) en het rapport
rekenen met de doorsnede die op elke plek werkelijk aanwezig is.

Aanleiding: houten balklagen die voor afschot schuin worden afgezaagd (de rekenhoogte
verloopt over de overspanning), en stalen liggers met een verlopende hoogte.

Open FEM2D is hiervoor de enige rekenbasis. Hulptools (tabellenpagina's,
variantservers) rekenen zelf niets: zij geven een model op, roepen de rekenkern aan en
kiezen een uitkomst.

## 2. Besluiten

| Onderwerp | Besluit |
|---|---|
| Waar getoetst | Elke doorsnedetoets op **alle rekenpunten** langs de staaf, met de plaatselijke doorsnede, zodat geen maximum gemist wordt. Het rapport toont **6 toetsdoorsneden** (x = 0, L/5, 2L/5, 3L/5, 4L/5, L) plus het maatgevende punt. |
| Kip en knik | Veilig-zijdig met de **kleinste doorsnede in het veld** (tussen twee steunen voor kip, over de kniklengte voor knik), voor staal en hout. Het rapport noemt die doorsnede. |
| Staal: wat verloopt | **Alle maten** (h, b, t_w, t_f) lineair tussen begin- en eindprofiel. Een verlopende doorsnede telt als **gelast** I-profiel: knikkromme en kipkromme voor gelaste profielen; geen afrondingsstraal. |
| Hout: wat verloopt | b en h van de rechthoek, lineair. k_h per rekenpunt met de plaatselijke hoogte. |
| Bestaande modellen | Zonder eindprofiel is een staaf prismatisch en verandert er **niets** — geen enkel getal. |

## 3. Voorwerk (deel 0) — nodig voordat hulptools op de kern kunnen leunen

Drie punten die los van verlopende profielen staan, maar eerst moeten landen:

1. **Hout in `check_fem_model`.** De MCP-weg toetst nu alleen staal en verwijst houten
   staven naar `check_timber_beams`, waardoor een aanroeper zelf omhullende en
   zakkingen moet samenstellen. `check_fem_model` gaat houten staven toetsen met
   dezelfde `buildTimberCheckInputs` als de app (sidecarbundel) en dezelfde
   `timber_check::check_all_timber_beams`. Houtresultaten komen in `results`, met
   dezelfde garantie als staal: elke gevraagde staaf staat in `results` óf in
   `skipped_beams` met een reden.
2. **k_mod per combinatie** (basisaudit nr 15 en 18, groep F). De belastingduurklasse
   volgt per UGT-combinatie uit de kortstdurende belasting erin (typen van de
   belastinggevallen, NB tabel 2.2); er is altijd een combinatie met alleen de
   blijvende belasting. De maatgevende uitkomst over de combinaties telt; het rapport
   noemt k_mod per combinatie.
3. **Niet-herkende BGT-combinaties vallen niet meer stil weg** in de doorbuigingskeuze
   van `steelCheckBuilder.ts` (en de gelijksoortige keuze bij hout en beton): een
   combinatie die niet als 6.14b/6.15b/6.16b herkend wordt, telt veilig-zijdig mee in
   de omhullende, met een melding. Reproductie: IPE 80, L = 5250 mm, eigen
   karakteristieke combinaties naast een herkende quasi-blijvende gaf w = 10,99 mm in
   plaats van 46,86 mm.

## 4. Deel 1 — model en solver

### 4.1 Model en bestand
- `Beam.profileEnd?: string` naast `profile` (= begin). Leeg of gelijk aan `profile`
  betekent prismatisch.
- Beide profielen moeten van **dezelfde doorsnedesoort** zijn: rechthoek↔rechthoek
  (hout) of I/H↔I/H (staal). Anders een invoerfout met reden. Kokers, buizen,
  hoeklijnen, CLT en beton: invoerfout "verlopend profiel wordt voor deze doorsnede
  niet ondersteund".
- Projectbestand `.ifcfem2d`: optioneel veld binnen formaatversie 2 (geen verhoging).
- Validatie: `valideerModel.ts` (`BEAM_VELDEN`), sidecar, MCP-schema `schema_beams` in
  `fem_tools.rs` — alle drie tegelijk, met de bestaande strikte-schematests.

### 4.2 Doorsnede op positie x
- Eén functie levert de doorsnede op relatieve positie t = x/L: maten lineair tussen
  begin en eind, grootheden (A, I_y, I_z, W_el, W_pl, I_t, I_w) uit gesloten formules.
  Hout: rechthoek b(t) × h(t). Staal: gelast I-profiel h(t), b(t), t_w(t), t_f(t)
  zonder afrondingsstraal.
- De solver rekent in TypeScript (`sectionResolver.ts`, app en sidecar), de toetsing
  in Rust. De formules staan daarom op twee plaatsen: in `sectionResolver.ts` voor de
  stijfheid en in de Rust-kern voor de toetsing. Een **gedeelde tabeltest** legt beide
  implementaties tegen dezelfde handberekende waarden (rechthoek en gelast I-profiel
  op t = 0, ½ en 1), zodat ze niet uit elkaar kunnen lopen.
- Referentierichting: bij spiegelen van de staaf draaien begin en eind mee om.

### 4.3 Stijfheid en eigen gewicht
- De solver deelt een verlopende staaf automatisch op in segmenten (standaard 20, en
  niet korter dan de bestaande minimale stuklengte van 25 mm). Elk segment krijgt de
  E·A en E·I van de doorsnede in zijn midden; de bestaande segmentmechaniek
  (`normaliseerSegmenten`/`doorsnedeVoor` in `engine.ts`) wordt uitgebreid met A per
  segment. Het eigen gewicht wordt per segment met de plaatselijke A opgebracht.
- De rekenpunten (21 per rekenelement, aaneengeregen) blijven de basis voor
  snedekrachten en zakking.
- Grenzen in deel 1: een verlopende staaf in een model met platen, en een verlopende
  betonstaaf, geven een invoerfout met reden (de betonlus en het plaatpad beheren de
  opdeling zelf). Tweede orde: P·δ binnen een element blijft buiten beschouwing, zoals
  nu; dat staat in de meldingen.

## 5. Deel 2 — toetsing

- Kerninvoer staal (`BeamCheckInput`) en hout (`TimberBeamCheckInput`) krijgen een
  optioneel eindprofiel (naam of eigen doorsnede). De **kern** bepaalt per krachtpunt
  (`ForcePoint.position_mm`) de plaatselijke doorsnede; de builders geven alleen
  begin en eind door.
- Doorsnedetoetsen (staal: 6.2.x inclusief classificatie per punt; hout: 6.1.x met k_h
  per punt) worden op elk krachtpunt met die doorsnede uitgevoerd; maatgevend is de
  hoogste U.C. over alle punten en combinaties.
- Stabiliteit (staal 6.3.1–6.3.3, hout 6.3.2–6.3.3): de kleinste doorsnede in het
  betreffende veld — gedefinieerd als de doorsnede met de kleinste relevante weerstand
  (M_c,Rd voor kip, N_c,Rd voor knik) binnen dat veld; bij lineair verloop is dat een
  veldeinde.
- Doorbuiging: ongewijzigd uit de solver (die al met de verlopende stijfheid rekent).
- Rapportgegevens in het resultaat: de 6 toetsdoorsneden met hun maten en U.C. per
  toets, het maatgevende punt, en de voor stabiliteit gebruikte doorsnede.
- Drie wegen: Tauri-command, toetsbrug en MCP delen dezelfde typen (ts-rs) en krijgen
  het veld tegelijk; de kruistabeltest dekt het.

## 6. Deel 3 — interface en rapport

- Profielkiezer: schakelaar "Verlopend profiel" met een tweede keuze "Profiel eind",
  beperkt tot dezelfde doorsnedesoort. Eigenschappenpaneel en staafdialoog tonen
  begin en eind; meervoudige selectie werkt op beide.
- Tekening: het verloop is zichtbaar in de staafweergave en in de doorsnedelegenda.
- Splitsen van een verlopende staaf: beide delen worden verlopend, met de
  geïnterpoleerde doorsnede op de splitsplaats als eind resp. begin (hout als `b×h`,
  staal als eigen gelaste doorsnede).
- Rapport (live en PDF): doorsnedenaam "IPE 300 → IPE 200 (verlopend)", een tabel met
  de 6 toetsdoorsneden en het maatgevende punt, en de gebruikte
  stabiliteitsdoorsnede.

## 7. Deel 4 — hulptools (buiten de repo)

Tabellenpagina's gebruiken verlopende houten balken voor een afgezaagde balklaag:
beginprofiel = zaagmaat, eindprofiel = zaagmaat min het afschot over de lengte,
getoetst door de kern. Het afschot en welk einde hoog ligt, legt de constructeur vast.

## 8. Tests en acceptatie

- **Geen regressie:** alle bestaande tests, gouden uitvoer en referentieprojecten
  leveren dezelfde getallen; een staaf met `profileEnd` gelijk aan `profile` geeft
  exact de prismatische uitkomst.
- **Solver:** verlopende rechthoekige ligger op twee steunpunten en een verlopende
  uitkrager tegen de analytische zakking en momentenlijn; afwijking < 1 % met de
  standaardopdeling, en een convergentietest over het aantal segmenten.
- **Doorsnede:** grootheden van een gelast I-profiel en een rechthoek op t = 0, ½, 1
  tegen handberekening.
- **Toetsing:** handberekende gevallen voor staal (buiging, dwarskracht, classificatie
  die langs de staaf wisselt, kip met de kleinste doorsnede) en hout (buiging met k_h
  per punt, kip); het maatgevende punt ligt aantoonbaar niet op de plaats van de
  grootste M.
- **Drie wegen:** kruistabeltest en een aanroep via `check_fem_model`.
- **Rapport:** PDF met de tabel van 6 toetsdoorsneden.
- Verificatievolgorde: `npm run build:sidecar`, `cargo build --release -p toetsbrug -p
  openaec-mcp-server`, `npx tsc --noEmit`, `node scripts/run-tests.mjs`,
  `node scripts/run-tests.mjs --bundel`, `cargo test --workspace --exclude
  open-fem2d-studio`.

## 9. Buiten scope

Verlopende beton-, CLT-, koker-, buis- en hoekprofielen; de algemene methode
EN 1993-1-1 6.3.4; niet-lineair verloop (bv. gebogen of getoogde liggers); verlopende
staven in modellen met platen.

## 10. Uitvoering

Per deel: bouwen in een eigen worktree, daarna een onafhankelijke verificatie met
handberekeningen die probeert de uitkomst te breken, herstel, en pas samenvoegen als
alles groen is. Volgorde: deel 0 → deel 1 → deel 2 → deel 3 → deel 4.
