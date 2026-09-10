# GUI-bediening: API in de app, MCP-tools erop, en de wapeningsworkflow end-to-end

Datum: 2026-09-10. Status: ontwerp goedgekeurd (delen 1–3), uitvoering gestart.

## Waarom

De rekenkern is langs drie wegen bereikbaar (Tauri-command, toetsbrug, MCP),
maar de **GUI** langs geen enkele. De wapeningsworkflow — korf invoeren →
toetsen → dekkingslijn → rapport — is alleen op kernniveau beproefd; niemand
heeft hem ooit machinaal door de echte interface heen gelopen. Dit werk geeft
de geïnstalleerde app een eigen bedieningskanaal, zet MCP-tools op dat kanaal,
en loopt de wapeningsworkflow er als test doorheen, met screenshots.

Doelapp is de **geïnstalleerde Tauri-app**, niet de browser/dev-modus.

## Deel 1 — Architectuur en kanaal

* **Rust, module `gui_control` in de app-crate.** Alleen actief met
  `OPENAEC_GUI_CONTROL=1` bij het starten. Bindt `127.0.0.1:0`, maakt een
  sessietoken (32 willekeurige bytes, hex), schrijft `gui-control.json`
  (`{pid, poort, token, versie}`) in Tauri's `app_local_data_dir` —
  `%LOCALAPPDATA%\org.openaec.fem2d-studio\` (de identifier-map, níét de
  installatiemap); het bestand verdwijnt bij afsluiten.
  Empirisch geverifieerd vóór de bouw: `PrintWindow` met
  `PW_RENDERFULLCONTENT` levert op de geïnstalleerde 0.3.6 een echte,
  niet-zwarte capture van de WebView2 (1415×909, gemiddelde helderheid 239).
  HTTP-server: `tiny_http` (synchroon; de app-crate heeft geen tokio).
* **Protocol.** `POST /opdracht` met `{naam, args}` en
  `Authorization: Bearer <token>` → `{ok: true, uitkomst}` of
  `{ok: false, fout}`. `GET /status` zonder token → `{versie, gereed}`.
  Paginaopdrachten: Rust `emit_to("main", "gui-control:opdracht",
  {id, naam, args})` → pagina voert uit → `invoke("gui_control_antwoord",
  {id, uitkomst})` → Rust maakt de wachtende HTTP-aanroep wakker.
  Tijdslimiet standaard 60 s, per opdracht te verhogen; bij verlopen een fout
  mét opdrachtnaam.
* **Screenshots in Rust.** `gui_screenshot {venster, pad}` →
  `PrintWindow(hwnd, PW_RENDERFULLCONTENT)` op het venster met dat
  Tauri-label → PNG. Terugval `screenshot_dom` (html2canvas in de pagina).
  De WebView2-capture wordt vóór alles empirisch geverifieerd.
* **Zichtbaar.** Statusbalk toont "bediening op afstand actief" zolang het
  kanaal leeft.
* **Niet:** geen andere adressen dan loopback, geen kanaal zonder token,
  niet standaard aan, geen muis-/klikautomatisering.

## Deel 2 — De pagina: `bediening.ts`

Hook `useBediening(acties)` in `App.tsx` krijgt de bestaande closures
(`fem`, `setSelection`, `setActiveView`, `setBottomPanelOpen`,
`handleRunMemberChecks`, `computeAndStoreSolverOutputs`,
`createDetachedWindow`) en luistert alleen als `invoke("gui_control_actief")`
ja zegt.

| Actie | Doet | Geeft terug |
|---|---|---|
| `status` | — | versie, weergave, selectie, aantal staven, toetsingLoopt |
| `model_laden {pad}` | projectlader `io/projectFile` | tellingen |
| `model_bouwen {...}` | `add*` van de store | ids |
| `staaf_selecteren {id}` | `setSelection` | staaf |
| `korf_zetten {beamId, korf}` | `updateBeam(id, {betonKorf})` | staaf |
| `analysetype_zetten {analysetype}` | `setAnalysetype` | — |
| `rekenen` | `computeAndStoreSolverOutputs` | per combinatie max M/V/N/w |
| `toetsen` | `handleRunMemberChecks`; wacht op `checkStore.isRunning=false` | per staaf uc's/statussen of `error` |
| `dekkingslijn_openen {beamId}` | selecteren + onderpaneel; wacht op klaar | antwoord of fout |
| `weergave_zetten {view}` | `setActiveView` | — |
| `rapport_losmaken` | `createDetachedWindow({view:"report"})` | label |
| `toetsen_uitlezen` | `checkStore` | als `toetsen` |
| `screenshot_dom` | html2canvas | PNG data-URL |

*Klaar betekent klaar*: `wachtOp(predicaat)` abonneert zich op de store —
geen timers. `BetonStaafVenster` zet zijn laatste antwoord in een
`dekkingslijnStore` (`{beamId, antwoord, fout, bezig}`). Fouten reizen
letterlijk mee als `fout`.

## Deel 3 — MCP: `gui_tools.rs`

Zelfde patroon als `fem_tools.rs` (`GUI_TOOLS`, `is_gui_tool`, `dispatch`,
`tool_definitions`). Leest `gui-control.json` (override
`OPENAEC_GUI_CONTROL_FILE`), controleert de pid, spreekt de poort aan met
`ureq`. App weg → één fout: *start hem met `OPENAEC_GUI_CONTROL=1`*. De MCP
start de app niet zelf.

Tools: `gui_status`, `gui_load_model`, `gui_build_model`,
`gui_select_member`, `gui_set_cage`, `gui_set_analysis`, `gui_solve`,
`gui_run_checks` (300 s), `gui_open_curtailment`, `gui_set_view`,
`gui_detach_report`, `gui_read_checks`, `gui_screenshot {window, path, dom?}`.
Eén-op-één, `structuredContent` = wat de actie teruggaf, toolfout = de tekst
van de app. In `drie_wegen_kruistabel.rs` krijgen `gui_*` een eigen rij-soort
(bedieningsopdracht, geen rekenkern-opdracht).

## Deel 4 — De GUI-test en de screenshots

`design-mockup/referentie-gui/wapening-workflow.mjs`:

1. Start de gebouwde app (`target/release/open-fem2d-studio.exe`, of het
   pad uit `OPENAEC_APP`) met `OPENAEC_GUI_CONTROL=1`; wacht op
   `gui-control.json` en `GET /status` gereed.
2. Loopt via de **MCP-server over stdio** (niet rechtstreeks HTTP — zo wordt
   de MCP-laag zelf getoetst): startmodel → betonstaaf selecteren → korf
   zetten (3Ø16 onder, 2Ø12 boven, Ø8-200, dekking 30) → analysetype
   `tweedeOrdeFysisch` → rekenen → toetsen → dekkingslijn openen →
   rapportweergave → rapport losmaken.
3. Na elke stap `gui_screenshot` naar `docs/verificatie/gui/NN-stap.png`;
   controleert dat de PNG niet leeg/zwart is (gemiddelde helderheid,
   variantie > drempel).
4. Ankers: de toetsuitkomst van de betonstaaf via de GUI moet gelijk zijn aan
   dezelfde staaf via `check_concrete_beam` rechtstreeks (drie wegen + GUI =
   vier wegen, één antwoord). Daarvoor bewaart `checkStore` sinds dit werk de
   kerninvoer van de laatste run (`lastRunInputs`, per kern), en geeft
   `toetsen_uitlezen` die mee; de test speelt de betoninvoer één-op-één door
   `check_concrete_beam` en eist een bit-identiek `ConcreteBeamCheckResult`.
   Het dekkingslijn-anker tegen `concrete_dekkingslijn` is nog niet gebouwd:
   het venster houdt zijn verzoek niet vast.
5. Sluit de app; verifieert dat `gui-control.json` weg is.

Verificatie van het geheel: `npx tsc --noEmit`, `npm test`,
`cargo test --workspace`, de referentiereeks, de nieuwe GUI-test, en een
verse build + installatie waarin de test tegen het geïnstalleerde artefact
draait.

## Wat de eerste run vond

De eerste run tegen de geïnstalleerde 0.3.6 slaagde op 25 van 26 stappen. De
ene fout was geen fout in het kanaal maar een bestaand gat dat pas zichtbaar
wordt als een machine de keten loopt: `capabilities/default.json` gaf alleen
`main` rechten en bevatte `core:webview:allow-create-webview-window` niet,
zodat het losmaken van het rapport (en van panelen) in de gebouwde app
stilletjes mislukte — alleen een `console.error`, geen melding. Beide zijn
verholpen: de permissie is toegevoegd en `detached-*` valt nu onder dezelfde
capability, anders had het losse rapportvenster geen eventrechten voor
`reportSync`.

De vier-wegen-stap (⑥b) vond bij zijn eerste run een tweede bestaand gat:
het GUI-antwoord en de directe kernaanroep verschilden in het láátste
cijfer (1,0643803254979285 tegen …83; 52,2 tegen 52,199999999999996), bij
verder identieke structuur. Oorzaak: de app-crate gebruikte `serde_json`
zonder `float_roundtrip`, en dan komt elk getal dat de pagina naar Rust
stuurt — elk Tauri-command, niet alleen het kanaal — tot 1 ULP verschoven
aan. De MCP-crate had de feature al. Verholpen in `src-tauri/Cargo.toml`;
de test blijft bit-identieke gelijkheid eisen.

Twee andere feiten die de run vastlegde: `PrintWindow` levert echte pixels
(2122×1363 op 150 % DPI), en de korf uit de test (3Ø16 onder) is voor de
startbalk te licht — UC 1,14 op de momentendekking op x = 2375 mm. Dat laatste
is geen testfout maar een uitkomst; de test eist alleen dat de keten
antwoordt, niet dat de balk voldoet.

## Buiten scope

Muis-/toetsenbordautomatisering; bediening over het netwerk; een
bedieningskanaal in de browser/dev-modus (de pagina-module is er wél
transportneutraal voor geschreven).
