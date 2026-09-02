# FEM-solver via MCP — implementatieplan

Datum: 2026-09-02
Basis: master @ `c13793b`
Status: ontwerpbesluit + uitvoerbaar plan

---

## 1. Beslissing

**Gekozen: een Node-sidecar achter de bestaande Rust-MCP-server, met de
TypeScript-solver als gebundeld artefact dat via `include_str!` in de binary
zit. Eén kortlevend Node-proces per tool-aanroep. Rust blijft de enige
MCP-voordeur.**

Concreet: er komt **geen** FEM-code in Rust bij. De MCP-server rekent niet
zelf, maar start per aanroep `node <fem-kernel.mjs>` en voert daarmee
letterlijk dezelfde `solveAllCases` / `solveAllCasesNonlinear` uit die de app
aanroept. De Rust/TypeScript-grens komt te liggen op precies dezelfde plek
waar de app hem vandaag al heeft: bij `BeamCheckInput`.

Dit is de basis van ontwerp 2, met drie onderdelen uit ontwerp 4 er expliciet
in gemonteerd:

- de hash-poort in `build.rs`, die de Rust-build **lokaal** al laat falen bij
  een niet-passende bundel (ontwerp 2 had alleen een CI-poort);
- de strenge invoervalidatie die onbekende velden hard weigert;
- de eerlijke intrekking van de "byte-identiek"-claim voor alles wat over de
  runtime-grens app ↔ sidecar loopt.

En één correctie op ontwerp 4, die twee van de drie lenzen als blokkerend
aanmerkten: de ontsnappingsklep `OPENAEC_FEM_KERNEL` mag **geen**
ongecontroleerde bundel accepteren. Hij verifieert de hash en weigert bij
verschil, tenzij daarnaast expliciet `OPENAEC_FEM_STA_DRIFT_TOE=1` staat.

### 1.1 Waarom dit, getoetst aan de drie lenzen

De drie lenzen zijn het **eens** over de bovenste twee plaatsen: alle drie
zetten ontwerp 2 eerste en ontwerp 4 tweede. Dat is geen toeval — het zijn
architectonisch bijna hetzelfde ontwerp, en het verschil zit in details die
per lens anders wegen. Er is dus geen tegenspraak op te lossen op de vraag
*welke richting*; alleen op de vraag *welke variant*. Die heb ik beslecht door
uit beide de sterkste onderdelen te nemen, want ze zijn goedkoop over te
zetten.

**Lens 1 — rekenkundige correctheid en stille divergentie.** Er blijft precies
één rekenkern: `solveNonlinear` (`design-mockup/src/core/solver/NonlinearSolver.ts:747`),
uitsluitend bereikbaar via `engine.ts`. Er wordt geen regel rekencode
gekopieerd of herschreven. Doordat de bundel via `include_str!` in de binary
zit, kan een gebruiker fysiek geen oude bundel naast een nieuwe binary
hebben — er is één artefact. Dat is het beslissende verschil met ontwerp 1,
waar `.mjs` en `.exe` los worden gedistribueerd en het ontwerp zelf toegeeft:
"een gebruiker met een oude .exe naast een nieuwe .mjs krijgt gewoon
antwoord."

**Lens 2 — de gebruiker.** Eén server, één configuratieregel, één absoluut pad,
geen argumenten: de bestaande crate-README blijft kloppen. Node ontbreken
**degradeert** de server in plaats van hem te slopen — de vijf staaltools
blijven volledig werken. De FEM-tools blijven zichtbaar in `tools/list` óók
zonder Node, met een Nederlandse reden en remedie, zodat de storing
diagnosticeerbaar is in plaats van dat de client meldt dat de functie niet
bestaat.

**Lens 3 — bouwbaarheid en onderhoud.** Dit sluit aan op de enige testrails die
er zijn: `cargo test -p openaec-mcp-server` bestaat al en
`tests/stdio_roundtrip.rs` is precies het patroon om op door te bouwen. Proces
per aanroep schrapt levensduurbeheer, herstart, backpressure én maakt de
module-globale meshcache-lekkage (`femTypes.ts:434-456`) structureel
onmogelijk: elk model krijgt een schone module-graaf.

### 1.2 Wat ik zelf heb gemeten (niet overgenomen)

De verkenningen spraken elkaar tegen over hoeveel van de testbatterij tegen
een bundel kan draaien — 8, of "alle 34". Ik heb het uitgevoerd.

| Meting | Uitkomst |
|---|---|
| Bundel bouwen met de aanwezige esbuild 0.27.3 | 12–15 ms, 228.689 bytes (zonder windmodules), 257.256 bytes (met) |
| Externe imports in de bundel | 0 |
| `window.` / `document.` / `__TAURI` / `triangle-wasm` | 0 / 0 / 0 / 0 |
| Adapter-tests tegen de bundel met **kaal** `node` | **22 van 22 geslaagd** |

Vier vondsten die het plan sturen en die in geen enkele verkenning stonden:

1. **De barrel moet `projectFile.ts` met benoemde exports ontsluiten, niet met
   `export *`.** Met `export *` trekt esbuild de Tauri- en browser-download-glue
   mee: ik mat 4× `window.` en 4× `document.createElement` in de bundel. Met
   benoemde exports (`serializeProject`, `deserializeProject`,
   `combinationsToFile`, `combinationsFromFile`, `PROJECT_FORMAT_VERSION`,
   `PROJECT_FILE_EXT`) is dat exact 0. Dit is het verschil tussen een bundel
   die in Node veilig is en één die een DOM-pad meedraagt dat nooit bereikt
   mag worden.

2. **22 van de 35 tests kunnen tegen de bundel; 13 niet.** Zes tests
   (`test-pendelstaaf`, `test-plaat-dkt`, `test-plaat-ids`,
   `test-plaat-lasten`, `test-plaat-mixed`, `test-plaat-schijf`) importeren
   kerninterne klassen (`Mesh`, `PlateRegion`, `Assembler`, `DKT`, `Quad4`,
   `Triangle`, `Matrix`, `GaussElimination`). Vijf (`test-deellast`,
   `test-puntlast-positie`, `test-splitsen`, `test-stramien-verplaatsen`,
   `test-transform`) testen de zustand-store en niet de solver. Twee
   (`test-ifc-export`, `test-plaat-gewicht`) staan er los van of vragen een
   extra kernmodule. Die 13 blijven op de bron draaien — dat is correct, want
   ze bewaken de kern, niet het MCP-artefact. De claim "alle 34 tegen de
   bundel" is onhaalbaar zonder `PlateRegion` in de barrel te trekken, en dat
   zou `TriangleService` en daarmee `window.location.origin` de bundel in
   halen.

3. **De testrunner mag testbestanden niet kopiëren.** Fixture-paden worden
   relatief aan het testbestand opgelost; `test-checkconfig.mjs` leest
   `voorbeelden/houten-raamwerk.ifcfem2d`. Verplaatsen breekt dat. De runner
   herschrijft de import ter plaatse in een tijdelijke kopie **naast** het
   origineel, of gebruikt een loader-alias.

4. **Op Windows moet het bundelpad een `file://`-URL zijn.** Een kaal
   `C:/...`-pad als ESM-specifier faalt; alle 22 tests vielen erop om tot ik
   er een `file:///C:/...`-URL van maakte.

Daarnaast: de profielgegevens zijn sinds de verkenning gewijzigd. HEA160
levert nu `A = 3880 mm²`, `I = 1,67·10⁷ mm⁴` waar de verkenning `A = 3877`,
`I = 1,673·10⁷` noteerde. Dat bevestigt dat drift echt is en dat gouden
waarden door een **gecommit script** gegenereerd moeten worden, nooit met de
hand overgeschreven.

### 1.3 Welke nadelen ik accepteer, en waarom

**Node ≥ 20 wordt een harde eis voor de FEM-tools.** De belofte "fully
self-contained" in de crate-README krijgt een uitzondering. Ik accepteer dat,
omdat het alternatief — de solver in Rust herschrijven — 12.701 regels kern
plus 1.428 regels adapter naschrijft en daarmee per definitie een tweede
antwoord op hetzelfde model introduceert. Verzachting: de vijf staaltools
blijven zonder Node werken, en de fout is een expliciete Nederlandse melding
met remedie, structureel onderscheidbaar van een rekenfout.

**Een build-artefact in versiebeheer.** De bundel van ~230 kB staat in git.
Lelijk, en het is precies het bestand dat stil oud kan worden. Ik accepteer
dat omdat er drie sloten op zitten: `build.rs` faalt lokaal bij hash-verschil,
CI herbouwt en vergelijkt byte-voor-byte, en de runtime-handshake weigert een
niet-passende bundel. Zonder alle drie zou ik dit ontwerp afwijzen.

**Geen bit-identiteit over de runtime-grens.** De app draait op V8 in WebView2,
de sidecar op V8 in Node. ECMAScript schrijft `sin`, `cos`, `atan2`, `pow` en
`hypot` niet bit-exact voor. Ik trek de claim "byte-identical results" in voor
de FEM-route en vervang hem door een gedocumenteerde tolerantie. Dat is
eerlijker dan een belofte die niemand kan nakomen — en het geldt vandaag al
tussen de app en de bestaande `test-*.mjs`; dit plan maakt het zichtbaar, niet
erger.

**~80–110 ms procesoverhead per aanroep.** Verwaarloosbaar naast rekentijden
van 4 ms tot 5,7 s, en het koopt het wegvallen van een hele klasse
levensduurbugs.

**Polygoonplaten blijven buiten bereik zonder voorgebouwde meshcache.** Een
echte functionele beperking, geen detail. Zie §6.

### 1.4 Waar de lenzen elkaar wél tegenspraken

Alleen op de derde plaats: lens 1 en 2 zetten ontwerp 3 (Rust-port) boven
ontwerp 1 (twee servers), lens 3 andersom. Die tegenspraak raakt de keuze
niet, want beide zijn door minstens twee lenzen als onaanvaardbaar
aangemerkt. Voor de volledigheid weeg ik hem toch: lens 3 heeft het
doorslaggevende argument geleverd, namelijk dat
`design-mockup/src/components/fem/solver/linalg.ts`, `loads.ts` en
`stiffness.ts` nog als grafstenen in de repo staan met de tekst
`REMOVED 2026-05-21 — was part of the fake/parallel in-process solver`. Dit
project heeft de fout van een parallelle rekenimplementatie al één keer
gemaakt en moeten opruimen. Een Rust-port stelt voor hem bewust opnieuw te
maken, op tienvoudige schaal, in een repo die vandaag nul geautomatiseerde
tests draait. Dat argument is sterker dan de eindstaat-esthetiek waarop lens 1
en 2 ontwerp 3 hoger zetten.

---

## 2. Architectuur

```
MCP-client
    │  JSON-RPC 2.0 over stdio
    ▼
openaec-mcp-server.exe        ← enige voordeur, ongewijzigd protocol
    ├── 5 bestaande staaltools → steel_check crate (geen Node)
    └── 5 nieuwe FEM-tools
            │  NDJSON over stdio, proces per aanroep
            ▼
        node fem-kernel.mjs   ← esbuild-bundel van engine.ts c.s.
            └── solveAllCases / solveAllCasesNonlinear
                    └── solveNonlinear  (de enige rekenkern)
```

### 2.1 Intern sidecar-protocol

Bewust **geen** JSON-RPC, zodat niemand het interne kanaal met het externe
verwart. Eén client, geen notificaties, geen batching.

Verzoek (één JSON-object per regel):

```json
{ "v": 1, "id": 7, "op": "handshake|validate|solve|check|load_project", "payload": { } }
```

Antwoord:

```json
{ "v": 1, "id": 7, "ok": true,  "result": { } }
{ "v": 1, "id": 7, "ok": false, "error": { "code": "...", "melding": "<Nederlands>", "detail": { } } }
```

Foutcodes: `PROTOCOL_MISMATCH`, `INVOER_ONGELDIG`, `BESTAND_ONLEESBAAR`,
`MODEL_ONOPLOSBAAR`, `TIJD_OVERSCHREDEN`, `INTERN`.

Rust schrijft handshake en verzoek **gepipelined** (twee regels ineens), leest
twee antwoordregels, sluit stdin, wacht op exit met timeout. De handshake
retourneert `{ protocol, node_version, bundle_version, bundle_hash }`; Rust
vergelijkt met wat in de binary is ingebakken en **weigert** bij verschil.

Bij een niet-nul exit of lege stdout: per definitie een crash → Nederlandse
`-32000`. stdout is uitsluitend protocol, stderr uitsluitend log.

### 2.2 Taal en veldnamen

- Tool- en veldnamen: **Engels**, gelijk aan de bestaande tools en aan
  `BeamCheckInput`. Elke hernoeming zou een handgeschreven mappinglaag zijn
  die kan afwijken, en dit plan bestaat juist om mappinglagen te elimineren.
- Beschrijvingen, foutmeldingen, code-commentaar, documentatie: **Nederlands**.

De kern gooit Engelse fouten (bijvoorbeeld
`Model has no constraints - add boundary conditions`). De sidecar beeldt
bekende meldingen af op het Nederlands vóór ze de MCP-grens passeren.

---

## 3. Nieuwe MCP-tools

Vijf stuks; het totaal gaat van 5 naar 10. `tests/stdio_roundtrip.rs:99`
(`assert_eq!(tools.len(), 5)`) moet mee naar 10.

Alle vijf schema's krijgen `"additionalProperties": false`, en de
bijbehorende Rust-typen `#[serde(deny_unknown_fields)]`. Dat is het
tegenovergestelde van het bestaande `check_steel_beam`-schema, en dat is
opzettelijk — zie taak T12.

### 3.1 `fem_solver_status`

**Doel:** diagnose zonder rekenpoging. Eerste stap in de README bij storing.

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

**Uitvoer:**

```json
{
  "available": true,
  "node_path": "C:\\Program Files\\nodejs\\node.exe",
  "node_version": "v24.11.1",
  "bundle_version": "2.0.1",
  "bundle_hash": "sha256:a1b2…",
  "protocol_version": 1,
  "binary_version": "0.1.0",
  "reason": null,
  "remedie": null
}
```

Bij ontbrekende Node: `available: false`, `reason` en `remedie` in het
Nederlands, met het geprobeerde pad en de vereiste versie.

### 3.2 `validate_fem_model`

**Doel:** droogloop zonder rekenen. Bestaat omdat een typefout in een lastveld
vandaag een gesláágde solve met een leeg resultaat oplevert — een fout die als
"nul" leest.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "model": { "$ref": "#/$defs/FemModel" },
    "project_path": { "type": "string", "description": "Absoluut pad naar een .ifcfem2d-bestand." }
  },
  "oneOf": [ { "required": ["model"] }, { "required": ["project_path"] } ]
}
```

**Uitvoer:** `{ "ok": bool, "errors": [...], "warnings": [...] }`, teksten in het
Nederlands. Gecontroleerd wordt: losse knopen, kinematisch mechanisme,
singulier stelsel, staven met lengte 0, dubbele knopen, onbekende
profiel/materiaal-combinaties (die anders stil terugvallen op een default),
belastinggevallen zonder werkzame last, polygoonplaten zonder geldige
meshcache, en **onbekende velden** in de invoer.

### 3.3 `load_fem_project`

**Doel:** de constructeur laten rekenen op zijn eigen opgeslagen model in
plaats van het over te typen.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["path"],
  "properties": { "path": { "type": "string" } }
}
```

**Uitvoer:** het gedeserialiseerde model plus `format_version` en tellingen van
knopen, staven, belastinggevallen en combinaties. Read-only.

### 3.4 `solve_fem_model`

**Doel:** het model doorrekenen. Levert als sluitstuk `steel_check_inputs` in
exact de vorm die `check_steel_beam` verwacht.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "model": { "$ref": "#/$defs/FemModel" },
    "project_path": { "type": "string" },
    "nonlinear": { "type": "boolean", "default": false,
      "description": "Tweede-orde (P-Delta). Uit een projectbestand komt deze waarde uit het bestand en overschrijft hij deze vlag niet." },
    "detail": { "type": "string", "enum": ["samenvatting", "stations"], "default": "samenvatting",
      "description": "'stations' geeft alle 21 stations per staaf terug en is fors groter." },
    "timeout_s": { "type": "integer", "minimum": 1, "maximum": 600, "default": 60 }
  },
  "oneOf": [ { "required": ["model"] }, { "required": ["project_path"] } ],
  "$defs": {
    "FemModel": {
      "type": "object",
      "additionalProperties": false,
      "required": ["nodes", "beams", "supports", "loadCases"],
      "properties": {
        "nodes": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["id", "x", "z"],
          "properties": {
            "id": { "type": "integer" },
            "x": { "type": "number", "description": "mm" },
            "z": { "type": "number", "description": "mm, positief omhoog" } } } },
        "beams": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["id", "from", "to"],
          "properties": {
            "id": { "type": "integer" },
            "from": { "type": "integer" }, "to": { "type": "integer" },
            "material": { "type": "string", "enum": ["steel", "timber", "concrete"] },
            "profile": { "type": "string", "description": "Bijv. 'HEA160', 'IPE300'." },
            "E": { "type": "number", "description": "N/mm2 — alleen als profile ontbreekt." },
            "A": { "type": "number", "description": "mm2 — alleen als profile ontbreekt." },
            "I": { "type": "number", "description": "mm4 — alleen als profile ontbreekt." },
            "releaseStart": { "type": "boolean" }, "releaseEnd": { "type": "boolean" } } } },
        "supports": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["nodeId", "type"],
          "properties": {
            "nodeId": { "type": "integer" },
            "type": { "type": "string", "enum": ["fixed", "pinned", "xRoller", "zRoller", "spring"] },
            "k": { "type": "number", "description": "Veerstijfheid N/mm, alleen bij type 'spring'." } } } },
        "loads": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "beamId": { "type": "integer" }, "nodeId": { "type": "integer" },
            "caseId": { "type": "integer" },
            "q": { "type": "number", "description": "Verdeelde last N/mm." },
            "dir": { "type": "string", "enum": ["x", "z", "lokaal"] },
            "fx": { "type": "number", "description": "Puntlast kN." },
            "fz": { "type": "number", "description": "Puntlast kN." },
            "my": { "type": "number", "description": "Koppel kNm." },
            "positionMm": { "type": "number" },
            "dT": { "type": "number", "description": "Temperatuurverschil K." } } } },
        "loadCases": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["id", "name"],
          "properties": {
            "id": { "type": "integer" }, "name": { "type": "string" },
            "type": { "type": "string", "enum": ["G", "Q", "W", "S"] } } } },
        "combinations": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["id", "name", "factors"],
          "properties": {
            "id": { "type": "integer" }, "name": { "type": "string" },
            "type": { "type": "string", "enum": ["ULS", "SLS"] },
            "factors": { "type": "object", "additionalProperties": { "type": "number" },
              "description": "Sleutel = belastinggeval-id als string, waarde = factor." } } } },
        "selfWeightEnabled": { "type": "boolean", "default": false },
        "scheefstandEnabled": { "type": "boolean", "default": false },
        "scheefstandNoemer": { "type": "number", "default": 300 },
        "scheefstandRichting": { "type": "integer", "enum": [-1, 1], "default": 1 }
      }
    }
  }
}
```

**Uitvoer:**

```json
{
  "solver_version": "2.0.1",
  "bundle_hash": "sha256:a1b2…",
  "model_hash": "sha256:c3d4…",
  "units": { "kracht": "kN", "moment": "kNm", "verplaatsing": "mm", "rotatie": "rad",
             "teken": "N positief = trek; z positief omhoog" },
  "cases_requested": [1, 2],
  "cases_solved": [1, 2],
  "cases_skipped_empty": [],
  "per_case": { "1": { "reactions": {}, "displacements": {}, "elements": {} } },
  "combinations": { "1": { } },
  "envelope": { },
  "steel_check_inputs": [ /* BeamCheckInput[] */ ],
  "skipped_beams": [ { "beam_id": 4, "reason": "houten staaf — houttoetsing niet via MCP" } ],
  "warnings": [],
  "solve_ms": 23
}
```

`cases_skipped_empty` staat er expres in: `engine.ts:1166` slaat een
belastinggeval zonder werkzame last stilzwijgend over (`continue`), waardoor
een client een ontbrekende sleutel krijgt die op "nul" lijkt.

**Dit is het scharnierpunt van de opdracht.** `steel_check_inputs` is een
`BeamCheckInput[]` dat ongewijzigd aan het bestaande `check_steel_beam` kan
worden gevoerd. De vijf `#[serde(default)]`-velden die het huidige schema
verzwijgt (`pre_camber_mm`, `deflection_permanent_mm`, `q_equiv_n_per_mm`,
`z_a_mm`, `custom_section`) worden door `buildSteelCheckInputs` ingevuld — niet
door de client. Dat is precies het verschil dat gemeten is tussen een unity
check van 0,9392 en 0,7971.

### 3.5 `check_fem_model`

**Doel:** doorrekenen én toetsen in één aanroep. Dit is de tool die de
roadmap-belofte waarmaakt en die het grootste veiligheidsgat dicht.

Invoer als `solve_fem_model`, plus:

```json
"check_config": {
  "type": "object",
  "additionalProperties": false,
  "description": "Per staaf-id de toetsinstellingen. Ontbreekt een staaf, dan gelden de defaults van de app.",
  "patternProperties": {
    "^[0-9]+$": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "steel_grade": { "type": "string", "enum": ["S235", "S275", "S355", "S420", "S460"] },
        "deflection_limit_class": { "type": "string", "enum": ["Floor", "Roof", "Cantilever", "Custom"] },
        "deflection_limit_numerator": { "type": "integer" },
        "consequence_class": { "type": "string", "enum": ["CC1", "CC2", "CC3"] },
        "is_cantilever": { "type": "boolean" },
        "buckling_length_y_m": { "type": "number" },
        "buckling_length_z_m": { "type": "number" },
        "lateral_bracing": {
          "type": "object", "additionalProperties": false,
          "required": ["top_flange_positions", "bottom_flange_positions"],
          "properties": {
            "top_flange_positions": { "type": "array", "items": { "type": "number" } },
            "bottom_flange_positions": { "type": "array", "items": { "type": "number" } } } }
      }
    }
  }
},
"beam_ids": { "type": "array", "items": { "type": "integer" },
  "description": "Beperk de toetsing tot deze staven. Leeg of afwezig = alle staalstaven." }
```

Let op: `lateral_bracing` vereist **beide** arrays. De Rust-kant
(`nen-en-1993-1-1-ltb/src/lib.rs:16-19`) heeft `Default` afgeleid maar géén
`#[serde(default)]`, dus `{}` levert een `-32602`. Het schema zegt dat nu
expliciet.

**Uitvoer:**

```json
{
  "solve_summary": { "cases_solved": [1,2], "cases_skipped_empty": [], "solve_ms": 23 },
  "steel_check_inputs": [ /* wat er getoetst is — expres zichtbaar */ ],
  "results": [ /* BeamCheckResult[] uit steel_check::check_all_beams */ ],
  "skipped_beams": [ { "beam_id": 4, "reason": "houten staaf — houttoetsing niet via MCP" } ],
  "governing": { "beam_id": 2, "uc_max": 0.9392, "check": "6.3.2_ltb" }
}
```

`steel_check_inputs` gaat expres mee terug: de client ziet wát er getoetst is
en kan één invoer desgewenst opnieuw door `check_steel_beam` halen, zonder
ooit zelf een invoer te hoeven verzinnen.

---

## 4. Taakgewijs implementatieplan

Elke taak eindigt met een commit. De volgorde is bindend: T0 tot en met T4
zijn voorwaarden, niet bijvangst. Wie T3 overslaat, ontvangt precies het
risico dat dit plan zegt te vermijden.

### T0 — CI-poort, vóór de feature

**Bestanden:** `.github/workflows/mcp.yml` (nieuw).

**Wijziging:** workflow op push en pull request die (a) `cargo build -p openaec-mcp-server`
en `cargo test -p openaec-mcp-server` draait in `src-tauri/`, (b) `npm ci` in
`design-mockup/` en de bestaande testbatterij draait.

**Waarom eerst:** vandaag komt de string `mcp` nergens in `.github/` voor en
draait CI nul geautomatiseerde tests. Elke hash-belofte verderop is zonder
deze poort een belofte in plaats van een mechanisme.

**Test die het bewijst:** de workflow draait groen op een onveranderde
werkboom; een opzettelijk gebroken assert in `test-n-teken.mjs` maakt hem rood
(daarna terugdraaien).

**Commit:** `ci: bouw en test de MCP-server en de solver-batterij`

---

### T1 — Bouwgereedschap vastleggen

**Bestanden:** `design-mockup/package.json`, `design-mockup/package-lock.json`.

**Wijziging:** `esbuild` en `tsx` als expliciete, gepinde `devDependencies`.
Scripts toevoegen:

```json
"test": "node scripts/run-tests.mjs",
"test:bundel": "node scripts/run-tests.mjs --bundel",
"build:sidecar": "node scripts/bouw-sidecar.mjs"
```

**Waarom:** `esbuild` zit nu alleen **transitief** via Vite in `node_modules`.
Een gecommit artefact met hash-poort bouwen met een ongepinde transitieve tool
is een tijdbom: een Vite-bump verandert de bundelbytes en de hash-poort valt
om zonder aanwijsbare oorzaak. `tsx` staat in geen enkele lockfile en wordt
vandaag uit de npx-cache gehaald — op een schone CI-runner is de hele
regressiebatterij dus niet reproduceerbaar.

**Test:** `rm -rf node_modules && npm ci && npx esbuild --version && npx tsx --version`
werkt zonder netwerk buiten het registry.

**Commit:** `chore(build): esbuild en tsx vastleggen als devDependency`

---

### T2 — Dode paden verwijderen

**Bestanden:** verwijderen — `design-mockup/src/core/solver/Solver.ts`,
`design-mockup/src/core/solver/SolverService.ts`,
`design-mockup/src/core/solver/PlateVerificationTests.ts`.

**Wijziging:** verwijderen. Alle drie worden nergens geïmporteerd (grep over
`src/` geeft nul treffers). `SolverService.ts` crasht bovendien bij import in
Node op `window is not defined`, via zijn top-level import van
`PlateVerificationTests`.

**Waarom:** `Solver.ts` bevat een tweede, afwijkende `solve()` die eruitziet
als de voor de hand liggende ingang. Zolang er één lezer is die de weg kent,
is dat te overzien; met een tweede consument erbij is het een val. Precies
zoals `linalg.ts`, `loads.ts` en `stiffness.ts` in mei al zijn opgeruimd.

**Test:** `npx tsc --noEmit` in `design-mockup/` blijft schoon; de volledige
batterij blijft groen.

**Commit:** `chore(solver): dode en browser-gebonden solverpaden verwijderd`

---

### T3 — Modelmapping uit App.tsx trekken (**het risicovolste stuk**)

**Bestanden:** `design-mockup/src/lib/modelNaarSolverInput.ts` (nieuw),
`design-mockup/src/App.tsx` (gewijzigd).

**Wijziging:** het blok in `computeAndStoreSolverOutputs` (`App.tsx`, vanaf de
`const multiInput: MultiInput = {` op regel ~596 tot en met de opbouw van
`edgeLoads`, eindigend vlak vóór de `solveAllCases`-aanroep op regel 722)
verhuist naar een pure functie:

```ts
export function bouwMultiInput(model: FemModelInvoer): MultiInput
```

`App.tsx` importeert die en houdt alleen de aanroep, de store-schrijfactie en
de foutafhandeling over. De nieuwe module bevat de profielopzoeking
(`resolveSection`, `App.tsx:606`), het eigengewicht (`eigenGewichtPerMeter`,
`App.tsx:644`), de eenheidsconversies kN→N (×1000) en kNm→N·mm (×1e6), α per
materiaal (`App.tsx:705`) en `liftSpringK` (`App.tsx:127`).

**Waarom dit de dragende balk is:** deze mapping bepaalt welke `A` en `I` bij
"HEA160 / S235" horen en welke krachten de solver in gaan. Wordt hij in de
sidecar nageschreven, dan is er een tweede waarheid over de doorsnede — even
gevaarlijk als een tweede solver, en veel moeilijker op te merken omdat beide
antwoorden plausibel ogen. Er is vandaag al een tweede lezer van
`resolveSection` in `FemCanvas.tsx:648`.

**Bijzonderheid:** `App.tsx` wordt op dit moment door meerdere parallelle taken
aangeraakt. Doe dit als **losse, apart gereviewde commit** en rebase kort voor
het mergen.

**Test:** de volledige batterij blijft groen. Aanvullend een nieuwe
`design-mockup/test-modelmapping.mjs` die `bouwMultiInput` op het
referentieportaal (§5.1) draait en de opgebouwde `MultiInput` vergelijkt met
een gouden JSON — inclusief `beamPointLoads`, thermische lasten, randlasten en
scheefstand, want precies die vielen in een prototype stilzwijgend weg.

**Commit:** `refactor(solver): modelmapping uit App.tsx naar pure module`

---

### T4 — `thermalAlphaForMaterial` en `liftSpringK` ontdubbelen

**Bestanden:** `design-mockup/src/lib/thermalAlpha.ts` (nieuw),
`design-mockup/src/components/fem/FemCanvas.tsx` (gewijzigd),
`design-mockup/src/lib/modelNaarSolverInput.ts` (gewijzigd).

**Wijziging:** `thermalAlphaForMaterial` verhuist uit `FemCanvas.tsx` (waar
`App.tsx:22` hem vandaan importeert — een React-bestand van 3.900+ regels als
bron voor een rekenconstante) naar een pure module. `liftSpringK` staat
gedupliceerd in `App.tsx:127` en `FemCanvas.tsx`; beide gaan naar één plek.

**Test:** batterij groen; `test-thermiek.mjs` in het bijzonder.

**Commit:** `refactor(solver): thermische alpha en veerstijfheid ontdubbeld`

---

### T5 — Barrel en bundelscript

**Bestanden:** `design-mockup/src/mcp/kernel-exports.ts` (nieuw),
`design-mockup/scripts/bouw-sidecar.mjs` (nieuw).

**Wijziging:** de barrel ontsluit de adapterlaag. **Let op de exportvorm** —
`projectFile.ts` met benoemde exports, niet met `export *`:

```ts
export * from "../components/fem/solver/engine";
export * from "../components/fem/solver/combinations";
export * from "../lib/steelCheckBuilder";
export * from "../lib/timberCheckBuilder";
export * from "../lib/sectionResolver";
export * from "../lib/modelNaarSolverInput";
export * from "../components/fem/femTypes";
export * from "../lib/wind/windGenerator";
export * from "../lib/wind/windEurocode";
// Benoemd, NIET `export *`: dat trekt de Tauri- en DOM-glue mee (gemeten:
// 4x window., 4x document.createElement). Zo is het exact 0.
export {
  PROJECT_FORMAT_VERSION, PROJECT_FILE_EXT,
  serializeProject, deserializeProject,
  combinationsToFile, combinationsFromFile,
} from "../io/projectFile";
```

`bouw-sidecar.mjs` draait esbuild
(`--bundle --platform=node --format=esm --target=node20`) naar
`src-tauri/crates/openaec-mcp-server/assets/fem-kernel.mjs`, berekent de
SHA-256 en schrijft die naast de bundel in `fem-kernel.sha256`. Het script
faalt hard als de bundel `window.`, `document.`, `__TAURI` of `triangle-wasm`
bevat, of als er een `^import`-regel in staat.

**Test:** `node scripts/bouw-sidecar.mjs` levert een bundel op; een assert
controleert de vier verboden strings en het aantal externe imports (0).
Gemeten referentie: ~230–260 kB, bouwtijd 12–15 ms.

**Commit:** `feat(mcp): barrel en bundelscript voor de solver-sidecar`

---

### T6 — Regressierunner tegen bron én bundel

**Bestanden:** `design-mockup/scripts/run-tests.mjs` (nieuw).

**Wijziging:** runner die alle `test-*.mjs` draait. Zonder vlag: tegen de bron
met `tsx`. Met `--bundel`: de 22 adapter-tests met **kaal `node`** tegen
`assets/fem-kernel.mjs`.

Twee mechanische valkuilen die ik zelf raakte en die de runner moet
respecteren:

1. **Niet kopiëren naar een andere map.** Fixture-paden worden relatief aan
   het testbestand opgelost (`test-checkconfig.mjs` leest
   `voorbeelden/houten-raamwerk.ifcfem2d`). Schrijf de herschreven kopie
   **naast** het origineel, of gebruik een loader-alias.
2. **Gebruik een `file://`-URL als specifier.** Een kaal `C:/...`-pad faalt in
   ESM; alle 22 tests vielen erom tot ik er `file:///C:/...` van maakte.

De 22 bundel-tests zijn: `checkconfig`, `doorbuiging-toets`, `leeg-geval`,
`n-teken`, `plaat-adapter`, `plaat-combinatie`, `plaat-polygoon`,
`plaat-project`, `plaat-randlast`, `plaat-randstaaf`, `plaat-validatie`,
`qrichting`, `releases`, `scheefstand`, `sectie-doorvoer`, `thermiek`,
`tweede-orde`, `v2-stations`, `veldzakking`, `veren`, `wind-generator`,
`wind-eurocode`.

De overige 13 blijven op de bron: zes raken kerninterne klassen
(`pendelstaaf`, `plaat-dkt`, `plaat-ids`, `plaat-lasten`, `plaat-mixed`,
`plaat-schijf`), vijf testen de zustand-store (`deellast`,
`puntlast-positie`, `splitsen`, `stramien-verplaatsen`, `transform`), twee
staan er los van (`ifc-export`, `plaat-gewicht`). Trek `PlateRegion` **niet**
in de barrel om dit getal op te hogen: dat haalt `TriangleService` en daarmee
`window.location.origin` de bundel in.

**Test:** `npm test` groen op de bron; `npm run test:bundel` groen op alle 22
(gemeten: 22/22).

**Commit:** `test(solver): runner voor bron- en bundelbatterij`

---

### T7 — Sidecar: protocol en hoofdlus

**Bestanden:** `design-mockup/src/mcp/protocol.ts` (nieuw),
`design-mockup/src/mcp/sidecar.ts` (nieuw).

**Wijziging:** de NDJSON-lus uit §2.1: lees regels van stdin, dispatch op `op`,
schrijf één antwoordregel per verzoek naar stdout. Altijd exit 0 bij een
afgehandelde fout; stdout uitsluitend protocol.

`op: "solve"` roept `bouwMultiInput` aan (T3), dan `solveAllCases` of
`solveAllCasesNonlinear`, dan `combineResults` en `computeEnvelope`, dan
`buildSteelCheckInputs`. **Nooit** rechtstreeks `solveNonlinear` of
`core/fem/Mesh` — dat levert andere eenheden én andere tekens, want de flip
naar trek-positief gebeurt pas op `engine.ts:1053/1059`.

Let op de argumentvolgorde: `combineResults(combo, perCase)` — combinatie
eerst.

**Test:** `design-mockup/test-sidecar.mjs` voert kapotte JSON in (verwacht
`ok:false`, code `INVOER_ONGELDIG`, exit 0), een model zonder opleggingen
(`MODEL_ONOPLOSBAAR`), en het referentieportaal (§5.1) met numerieke asserts.

**Commit:** `feat(mcp): NDJSON-sidecar op de bestaande solver`

---

### T8 — Nederlandse foutafbeelding en strenge validatie

**Bestanden:** `design-mockup/src/mcp/fouten.ts` (nieuw),
`design-mockup/src/mcp/valideerModel.ts` (nieuw).

**Wijziging:** afbeelding van bekende Engelse kernmeldingen op Nederlands
(bijvoorbeeld `Model has no constraints - add boundary conditions` →
"Model heeft geen opleggingen — voeg randvoorwaarden toe"). Onbekende
meldingen komen door met code `INTERN` en de originele tekst als `detail`,
zodat er nooit iets stil verdwijnt.

`valideerModel` implementeert §3.2, inclusief het **hard weigeren van
onbekende velden**. Hergebruikt `valideerPlaatPolygoon` en
`isAsgelijndeRechthoek` uit `femTypes.ts`.

**Test:** `design-mockup/test-validatie-mcp.mjs`: een model met `qq` in plaats
van `q` moet `ok:false` geven met een melding die het veld noemt — vandaag
levert dat een geslaagde solve met een leeg resultaat op.

**Commit:** `feat(mcp): strenge modelvalidatie en Nederlandse foutmeldingen`

---

### T9 — Rust: sidecar-aansturing

**Bestanden:** `src-tauri/crates/openaec-mcp-server/src/sidecar.rs` (nieuw),
`src-tauri/crates/openaec-mcp-server/build.rs` (nieuw),
`src-tauri/crates/openaec-mcp-server/Cargo.toml` (gewijzigd).

**Wijziging:** `tokio`-features `process` en `time` van `dev-dependencies` naar
`dependencies`. `sidecar.rs` doet:

- **Node zoeken:** `OPENAEC_NODE` → `node` op PATH → bekende locaties
  (`%ProgramFiles%\nodejs\node.exe`, `/opt/homebrew/bin/node`,
  `/usr/local/bin/node`). Daarna `node --version`, eis ≥ 20.
- **Bundel klaarzetten:** `include_str!("../assets/fem-kernel.mjs")`, bij eerste
  gebruik geschreven naar `%LOCALAPPDATA%/openaec-mcp/sidecar-<hash>.mjs`.
  Via de commandoregel meegeven kan niet — ~230 kB overschrijdt de
  Windows-limiet van ~32 kB — en stdin is bezet door het protocol.
- **Ontsnapping:** `OPENAEC_FEM_KERNEL` wijst naar een bestaand bestand voor
  dichtgetimmerde machines (virusscanner, AppLocker, alleen-lezen profiel).
  **De hash van dat bestand wordt geverifieerd** en bij verschil geweigerd,
  tenzij `OPENAEC_FEM_STA_DRIFT_TOE=1` erbij staat. Zonder die controle is de
  hele "één bron"-claim via een omgevingsvariabele te omzeilen.
- **Aanroep:** spawn, twee regels gepipelined schrijven, twee lezen, stdin
  sluiten, wachten met timeout (`OPENAEC_MCP_SOLVE_TIMEOUT`, default 60 s),
  proces killen bij overschrijding.

`build.rs` faalt de build als `assets/fem-kernel.mjs` niet overeenkomt met
`assets/fem-kernel.sha256`.

**Test:** `tests/sidecar.rs` — een run met `OPENAEC_NODE=/bestaat/niet` geeft
`available:false`; het referentieportaal geeft de gouden getallen; een
timeout-run ruimt het proces op.

**Commit:** `feat(mcp): Node-sidecar aansturing met hash-poort`

---

### T10 — Rust: de vijf FEM-tools

**Bestanden:** `src-tauri/crates/openaec-mcp-server/src/fem_tools.rs` (nieuw),
`src-tauri/crates/openaec-mcp-server/src/main.rs` (gewijzigd).

**Wijziging:** de vijf tooldefinities uit §3, toegevoegd aan
`tool_definitions()` (`main.rs:81`) en aan de `match` in `dispatch_tool`
(`main.rs:160`). `check_fem_model` roept na de solve
`steel_check::check_all_beams` aan — dezelfde functie die `src-tauri/src/lib.rs:19`
voor de app aanroept.

De FEM-tools blijven **altijd** in `tools/list`, ook zonder Node. Verbergen
maakt de storing ondiagnosticeerbaar: de client meldt dan dat de functie niet
bestaat, terwijl de gebruiker weet dat hij hem geïnstalleerd heeft.

**Test:** `tests/stdio_roundtrip.rs` uitbreiden van 5 naar 10 tools
(`main.rs`-assert op regel 99) en de vijf nieuwe namen asserten.

**Commit:** `feat(mcp): solve_fem_model, check_fem_model en drie hulptools`

---

### T11 — Foutcode behouden op het foutpad

**Bestanden:** `src-tauri/crates/openaec-mcp-server/src/main.rs` (gewijzigd,
regels 293-300).

**Wijziging:** bij een toolfout wordt vandaag alleen de messagetekst
teruggegeven, verpakt als geslaagd resultaat met `isError: true`; de foutcode
en `data` verdampen. Voeg `structuredContent: { error_code, remedie }` toe op
het foutpad.

**Waarom:** zonder deze fix leest "Node ontbreekt" voor een machine identiek
aan "je raamwerk is een mechanisme". Bij constructieve software mag een
ontbrekende runtime nooit op een rekenfout lijken.

**Test:** `tests/fout_paden.rs` — assert dat `structuredContent.error_code`
gelijk is aan `NODE_ONTBREEKT` bij `OPENAEC_NODE=/bestaat/niet`, en dat een
onoplosbaar model een andere code geeft. Meteen ook de foutpaddekking die
vandaag helemaal ontbreekt: `-32700`, `-32601`, `-32602`.

**Commit:** `fix(mcp): foutcode en remedie behouden op het toolfoutpad`

---

### T12 — `check_steel_beam`-schema repareren

**Bestanden:** `src-tauri/crates/openaec-mcp-server/src/main.rs` (regels
96-121), `src-tauri/crates/steel-check/src/input.rs`,
`src-tauri/crates/nen-en-1993-1-1-ltb/src/lib.rs`.

**Wijziging:** de vijf `#[serde(default)]`-velden toevoegen aan `properties`
(`pre_camber_mm`, `deflection_permanent_mm`, `q_equiv_n_per_mm`, `z_a_mm`,
`custom_section`), de enum-waarden opnemen voor `deflection_limit_class`
(`Floor`/`Roof`/`Cantilever`/`Custom`) en `consequence_class`
(`CC1`/`CC2`/`CC3`), `lateral_bracing` uitschrijven met beide verplichte
arrays, en `additionalProperties` op `false` zetten. Op de Rust-typen
`#[serde(deny_unknown_fields)]`.

**Waarom dit hier hoort:** dit is los van het hele plan een veiligheidsfout.
Een client die het huidige schema volgt, laat `q_equiv_n_per_mm` en `z_a_mm`
op 0 vallen en toetst kip daarmee **gunstiger** dan de app — onveilig aan de
verkeerde kant. Een typefout in een veldnaam wordt vandaag volledig stil
genegeerd, want nergens in de workspace staat `deny_unknown_fields`.

**Test:** `tests/schema_strikt.rs` — een invoer met `q_equiv_n_per_m` (typefout)
moet `-32602` geven in plaats van stil door te rekenen; een invoer met
`"lateral_bracing": {}` moet een begrijpelijke fout geven.

**Commit:** `fix(toetsing): volledig en strikt schema voor check_steel_beam`

---

### T13 — Gouden bestand met twee onafhankelijke lezers

**Bestanden:** `src-tauri/crates/openaec-mcp-server/tests/golden/portaal.ifcfem2d`
(nieuw), `.../golden/portaal.verwacht.json` (nieuw),
`design-mockup/scripts/genereer-golden.mjs` (nieuw),
`design-mockup/test-golden.mjs` (nieuw),
`src-tauri/crates/openaec-mcp-server/tests/fem_golden.rs` (nieuw).

**Wijziging:** het referentieportaal uit §5.1 als projectbestand, met een
verwachte-uitkomst-JSON die door `genereer-golden.mjs` wordt **gegenereerd**,
nooit met de hand geschreven. Twee lezers: de Node-test asserteert dat de
bundel dit oplevert, de Rust-integratietest dat de MCP-tool hetzelfde
oplevert.

**Waarom generatie verplicht is:** de profielgegevens zijn tussen de verkenning
en vandaag al gewijzigd (HEA160 ging van `A = 3877` naar `A = 3880`). Met de
hand overgeschreven verwachtingen verankeren zo'n wijziging als bug of
verbergen hem.

**Test:** beide lezers groen; `genereer-golden.mjs` opnieuw draaien geeft een
byte-identiek bestand (`git diff --exit-code`).

**Commit:** `test(mcp): gouden portaalmodel met twee onafhankelijke lezers`

---

### T14 — Gelijkheidstests (bron ↔ bundel ↔ MCP)

**Bestanden:** `design-mockup/test-gelijkheid-bundel.mjs` (nieuw),
`src-tauri/crates/openaec-mcp-server/tests/fem_gelijkheid.rs` (nieuw).

**Wijziging:** zie §5.2, laag A en laag B. Beide vergelijkingen lopen binnen
één runtime en moeten daarom **bit-identiek** zijn, niet op tolerantie.

**Test:** hetzelfde model door `solveAllCases` rechtstreeks (bron, via `tsx`)
én via de bundel, met volledige precisie geserialiseerd
(`toPrecision(17)`) en op string-gelijkheid vergeleken. Idem bundel ↔
MCP-tooluitvoer.

**Commit:** `test(mcp): bit-gelijkheid van bron, bundel en MCP-uitkomst`

---

### T15 — Driftpoort en release

**Bestanden:** `.github/workflows/mcp.yml` (gewijzigd),
`.github/workflows/release.yml` (gewijzigd).

**Wijziging:** in `mcp.yml` een stap die `npm run build:sidecar` draait en
daarna `git diff --exit-code` op `assets/fem-kernel.mjs` en
`assets/fem-kernel.sha256`. In `release.yml`
`cargo build --release -p openaec-mcp-server` plus release-assets voor
Windows, macOS en Linux.

**Waarom de release-stap er hoort:** vandaag bouwt en publiceert CI de
MCP-server helemaal niet; de gebruiker moet zelf een Rust-toolchain
installeren en compileren. Voor de doelgroep is dat geen realistische eis, en
een reken-server zonder release-poort levert constructieve resultaten uit een
ongecontroleerde binary.

**Test:** een opzettelijke wijziging in `engine.ts` zonder herbouw maakt de
workflow rood.

**Commit:** `ci(mcp): driftpoort op de bundel en release-assets voor de server`

---

### T16 — Documentatie

**Bestanden:** `src-tauri/crates/openaec-mcp-server/README.md`.

**Wijziging:** vier correcties en één toevoeging.

1. "fully self-contained" krijgt een uitzondering: de vijf staaltools werken
   zonder Node, de vijf FEM-tools vereisen Node ≥ 20.
2. "byte-identical results to clicking through the UI" wordt ingetrokken voor
   de FEM-route en vervangen door de tolerantie uit §5.2, laag C.
3. De profielcatalogus wordt ingebakken met `include_str!`
   (`steel-profiles/src/lib.rs:12`), niet `include_bytes!`; alleen de
   PDF-fonts gebruiken `include_bytes!` (`report/src/lib.rs:32-35`). De
   conclusie klopt, de formulering niet.
4. `fem_solver_status` als eerste stap bij storing.
5. De omgevingsvariabelen: `OPENAEC_NODE`, `OPENAEC_MCP_SOLVE_TIMEOUT`,
   `OPENAEC_FEM_KERNEL`, `OPENAEC_FEM_STA_DRIFT_TOE`, `OPENAEC_MCP_LOG`.

**Test:** handmatig nalopen; de genoemde regelnummers kloppen met de bron.

**Commit:** `docs(mcp): solver-tools, Node-eis en correcties op de README`

---

## 5. Verificatiestrategie

De kernvraag is: **hoe bewijzen we dat de MCP-uitkomst gelijk is aan wat de app
uitrekent?** Dat valt uiteen in drie lagen met verschillend bewijskarakter. Ze
door elkaar halen is precies hoe een tolerantie op de verkeerde plek terecht
komt.

### 5.1 Het referentiemodel

Portaal, door mij doorgerekend met de bundel in kaal `node`:

- knopen: (0,0), (0,4000), (6000,4000), (6000,0) mm
- staven: 1 en 3 = HEA160 (kolommen), 2 = IPE300 (ligger)
- opleggingen: knoop 1 en 4 ingeklemd
- belastinggeval 1 "G": q = −10 N/mm op staaf 2
- belastinggeval 2 "Q": q = −6 N/mm op staaf 2
- combinatie: 1,2·G + 1,5·Q

Doorsneden zoals de huidige database ze levert: HEA160 → E = 210.000 N/mm²,
A = 3.880 mm², I = 1,67·10⁷ mm⁴; IPE300 → A = 5.380 mm², I = 8,36·10⁷ mm⁴.

Gemeten uitkomsten:

| Grootheid | Waarde | Analytische controle |
|---|---|---|
| LC1 `R1.fz` = `R4.fz` | 30,00000 kN | ½·qL = 30 kN ✔ |
| LC1 ΣFz | 60,00000 kN | qL = 60 kN ✔ |
| LC1 ligger `M_start` | −11,2324 kNm | — |
| LC1 ligger max\|M\| | 33,7676 kNm | 33,7676 + 11,2324 = **45,0000** = qL²/8 ✔ |
| LC1 stations | 21 | — |
| LC2 ΣFz | 36,00000 kN | 6·6 = 36 kN ✔ |
| Combi ΣFz | 126,00000 kN | (1,2·10 + 1,5·6)·6 = 126 kN ✔ |
| Combi ligger max\|M\| | 70,9120 kNm | 1,2·33,7676 + 1,5·20,2606 = 70,912 ✔ |
| Combi max zakking | −14,4485 mm | — |

De identiteit `M_veld + |M_steun| = qL²/8` klopt tot op vier decimalen exact,
en de combinatie is exact de lineaire superpositie van de gevallen. Dat maakt
dit model geschikt als gouden bestand: een fout in eenheden, tekens of
combinatielogica breekt minstens één van deze identiteiten.

Tweede gouden model: `design-mockup/voorbeelden/houten-raamwerk.ifcfem2d`, om
het `load_fem_project`-pad en het overslaan van houten staven te dekken.

### 5.2 De drie vergelijkingslagen

**Laag A — bron ↔ bundel. Eis: bit-identiek.** Beide draaien in Node, dus
dezelfde V8. Elk verschil is per definitie een bundelfout. Test:
`test-gelijkheid-bundel.mjs` draait het referentiemodel één keer via `tsx` op
de bron en één keer met `node` op de bundel, serialiseert alle verplaatsingen,
reacties en staafkrachten met `toPrecision(17)` en vergelijkt op
string-gelijkheid. Dit is de test die bewijst dat de bundel een getrouwe
afgeleide is en geen kopie die achterloopt.

**Laag B — bundel ↔ MCP-tool. Eis: bit-identiek.** Ook één runtime; de
MCP-laag mag geen cijfer aanraken. Test: `tests/fem_gelijkheid.rs` roept
`solve_fem_model` aan over stdio en vergelijkt met het gouden bestand dat de
Node-runner produceerde.

**Laag C — app (WebView2-V8) ↔ sidecar (Node-V8). Eis: tolerantie.** Dit is de
enige laag waar bit-identiteit **niet** te beloven is. ECMAScript schrijft
`+`, `−`, `×`, `÷`, `sqrt`, `abs`, `min` en `max` exact voor volgens IEEE-754,
maar `sin`, `cos`, `atan2`, `pow` en `hypot` niet — en de solver gebruikt die
in de elementtransformatie. Verschillen zijn ~1 ulp (≈2,2·10⁻¹⁶ relatief);
door een stelsel met conditiegetal ~10⁶ kan dat oplopen tot ~10⁻¹⁰.

Vastgelegde tolerantie:

| Grootheid | Relatief | Absolute vloer |
|---|---|---|
| Verplaatsingen | 1·10⁻⁹ | 1·10⁻⁶ mm |
| Reacties | 1·10⁻⁹ | 1·10⁻⁶ kN |
| Staafkrachten N, V | 1·10⁻⁹ | 1·10⁻⁶ kN |
| Momenten M | 1·10⁻⁹ | 1·10⁻⁶ kNm |
| Unity checks | 1·10⁻⁹ | 1·10⁻⁹ |

De absolute vloer voorkomt dat een relatieve vergelijking op een grootheid die
nul hoort te zijn (bijvoorbeeld ΣFx in een symmetrisch geval) betekenisloos
wordt.

**Hoe laag C uitgevoerd wordt.** Deze laag kan niet in CI, want er is geen
WebView2 op een runner. Daarom een expliciete, per-release handmatige stap:
de app krijgt in ontwikkelmodus een exportknop die de rauwe
`solverOutputs` als JSON wegschrijft met `toPrecision(17)`. Procedure: open
`portaal.ifcfem2d` in de app, exporteer, draai `check_fem_model` op hetzelfde
bestand, en vergelijk met `design-mockup/scripts/vergelijk-app-mcp.mjs` op
bovenstaande tolerantie. Uitkomst wordt in de release-notities vastgelegd.
Omdat de app na T3 dezelfde `bouwMultiInput` en dezelfde `engine.ts` gebruikt,
is het JS-motorverschil het enige dat hier nog kan afwijken — laag A en B
sluiten al het andere uit.

### 5.3 Wat de verificatie bewust níét claimt

- Niet dat de solver **juist** rekent. Dat bewaken de 35 bestaande
  `test-*.mjs` met hun analytische controlegevallen; dit plan voegt daar geen
  natuurkunde aan toe en haalt er niets vanaf.
- Niet dat het taalmodel de tools juist aanroept. Daarom bestaat
  `check_fem_model`: de keten solve → toetsing loopt server-zijdig, zodat er
  geen veld tussenuit kan vallen.
- Niet dat een oude binary naast een nieuwe app juiste getallen geeft. Daarvoor
  is de hash-handshake, die weigert in plaats van te rekenen.

---

## 6. Buiten scope

**Polygoonplaten zonder voorgebouwde meshcache.** De CDT-mesher werkt in Node
alleen via een brose omweg: `globalThis.fetch` tijdelijk uitzetten rond de
init van een emscripten-glue uit ~2020 in een verlaten npm-pakket. Dat grijpt
in op een globale van de runtime en kan met een volgende Node- of
pakketversie stilletjes anders uitpakken. Dat wil je niet in een rekenserver.
De FEM-tools accepteren raamwerken, rechthoekige platen, en polygoonplaten
**mét** geldige `PlaatMeshCache` uit een projectbestand. Een polygoonplaat
zonder cache geeft een expliciete Nederlandse weigering, geen stille
benadering.

**Houttoetsing via MCP.** De MCP-server ontsluit vandaag alleen de
staaltoetsing; `check_timber_beams` zit wel in de app maar niet in de server.
`check_fem_model` meldt houten staven als `skipped` met reden, zoals
`checkStore.ts` dat al doet. Toevoegen is een eigen taak, want het vraagt de
`timber-check`-crate plus `timberCheckBuilder` in de keten.

**Een FEM-solver in Rust.** Expliciet afgewezen, zie §1. Zou 12.701 regels
kern plus 1.428 regels adapter naschrijven en per definitie een tweede
antwoord op hetzelfde model opleveren.

**Een langlevend sidecar-proces.** Bewust niet: bij ~80–110 ms opstart
tegenover 4 ms tot 5,7 s rekenen koopt het niets en kost het
levensduurbeheer, herstart, timeout-respawn, backpressure én het risico dat
de module-globale meshcache van model A naar model B lekt.

**Modellen wegschrijven via MCP.** Alle tools zijn read-only op de schijf.
`load_fem_project` leest; er is geen `save`. Een tool met neveneffecten zou
bovendien de bestaande val raken dat een `tools/call` zonder `id` volledig
wordt uitgevoerd waarna het antwoord wordt weggegooid (`main.rs:307-309`).

**De app omschakelen naar een andere rekenroute.** De app blijft
`engine.ts` rechtstreeks aanroepen. Dit plan voegt een tweede **consument**
toe, geen tweede pad.

**Sparse solver / prestatiewerk.** De dichte Gauss-eliminatie schaalt kubisch;
gemeten loopt een wandschijf met 540 elementen naar 5,7 s. Dit plan maakt dat
zichtbaar via `timeout_s` maar lost het niet op.

---

## 7. Volgorde in één oogopslag

| # | Taak | Blokkeert |
|---|---|---|
| T0 | CI-poort | alles |
| T1 | esbuild + tsx pinnen | T5, T6 |
| T2 | dode paden weg | — |
| T3 | modelmapping uit App.tsx | T5, T7 |
| T4 | alpha + veerstijfheid ontdubbelen | T5 |
| T5 | barrel + bundelscript | T6, T9 |
| T6 | regressierunner | T15 |
| T7 | sidecar-lus | T9 |
| T8 | validatie + foutafbeelding | T10 |
| T9 | Rust sidecar-aansturing | T10 |
| T10 | de vijf tools | T13, T14 |
| T11 | foutcode behouden | T10 |
| T12 | schema repareren | — |
| T13 | gouden bestand | T14 |
| T14 | gelijkheidstests | T15 |
| T15 | driftpoort + release | — |
| T16 | documentatie | — |

T2 en T12 zijn onafhankelijk en kunnen parallel; de rest volgt de
afhankelijkheden. Ruwe inspanning: 8 à 9 ontwikkeldagen, met het zwaartepunt
op T3 (de enige taak die levende UI-code aanraakt) en op T13–T15 (de tests en
poorten die de veiligheidsclaim dragen).
