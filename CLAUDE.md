# Open-FEM-Studio - Claude Instructions

## Communicatie Regels (VERPLICHT)

### 1. Meld ALTIJD wat je doet
Na ELKE actie, expliciet melden:
- Welke bestanden je hebt aangepast
- Welke specifieke wijzigingen je hebt gemaakt
- Wat je NIET hebt gedaan
- Aannames die je hebt gemaakt

### 2. Vraag VROEG om verduidelijking
Stop en vraag VOORDAT je codeert als iets onduidelijk is:
- Exacte requirement
- Welke bestanden
- Verwacht gedrag
- Edge cases
- Aanpak keuze

Format:
```
❓ VERDUIDELIJKING NODIG:
1. [Vraag]
2. [Vraag]
Mijn aanname als je niet reageert: [aanname]
```

### 3. Verificatie na afronding
Na ELKE taak:
1. `npx tsc --noEmit` uitvoeren
2. Tests uitvoeren indien beschikbaar
3. Samenvatting geven:
```
✅ VERIFICATIE:
- TypeScript: [PASS/FAIL]
- Tests: [PASS/FAIL/N.v.t.]
- Gewijzigde bestanden: [lijst]
- Klaar voor testen: [JA/NEE]
```

### 4. Meerdere instructies (tot 30)
Bij meerdere taken:
1. EERST alle taken oplijsten met nummers
2. Dependencies identificeren
3. Groeperen in parallelle batches
4. Uitvoeren in optimale volgorde
5. Voortgang bijhouden met checkboxes

## Project Kennis

Het programma is **v2 in `design-mockup/`** (de mapnaam is historisch). `src/` in de root is v1: bevroren,
niet meer gebouwd door `src-tauri/tauri.conf.json` of de release-workflow. Nieuw werk nooit in `src/`.

### Tech Stack
- Frontend: React 19 + TypeScript 5.9 + Vite 7, i18next (nl/en/de/fr), zustand voor deelstores
- Tekenvlak: SVG in React (`FemCanvas.tsx`)
- FEM-kern in TypeScript: `design-mockup/src/core/` (staven, Quad4/Triangle/DKT, lineair, tweede orde, fysisch niet-lineair)
- Normtoetsing en PDF-rapport in Rust: `src-tauri/crates/` (Cargo-workspace)
- Desktop: Tauri v2 (`src-tauri/`), devserver op poort 1440

### Kritieke Bestanden
| Bestand | Functie |
|---------|---------|
| `design-mockup/src/hooks/useFemStore.ts` | Modelstate (knopen, staven, platen, lasten, combinaties) + undo/redo |
| `design-mockup/src/stores/` | zustand-stores (o.a. `checkStore.ts`, `reportStore.ts`) |
| `design-mockup/src/components/fem/solver/engine.ts` | Adapter UI ↔ kern: eenheden, tekens; geen FEM-wiskunde |
| `design-mockup/src/core/fem/Mesh.ts` | Datamodel van de kern |
| `design-mockup/src/core/solver/NonlinearSolver.ts`, `Assembler.ts` | Oplossen en assembleren |
| `design-mockup/src/components/fem/FemCanvas.tsx` | Tekenvlak (~5,5k regels) |
| `design-mockup/src/core/fem/PlaatMesher.ts`, `PlateRegion.ts` | Plaatmesh (raster; polygonen via `generatePolygonPlateMeshV2`, triangle-wasm) |
| `design-mockup/src/lib/*CheckBuilder.ts` | Invoer voor de Rust-toetskernen (staal, hout, clt, beton, plaat, spanning) |
| `design-mockup/src/mcp/kernel-exports.ts` | Ingang van de sidecarbundel (`npm run build:sidecar`) |
| `src-tauri/crates/openaec-mcp-server/assets/fem-kernel.mjs` | Gebundelde solver voor de MCP-server; `.sha256` wordt in `build.rs` gecontroleerd |
| `src-tauri/src/lib.rs` | Tauri-commando's (`generate_handler!`) |
| `design-mockup/scripts/run-tests.mjs` | Testrunner (`BUNDEL_TESTS` / `ALLEEN_BRON`) |

### Drie wegen naar de rekenkern
Rekengang in de bibliotheek van de crate; alle drie roepen dezelfde functie aan:
1. Tauri-commando in `src-tauri/src/lib.rs`, kale naam in `generate_handler!` (geen commentaar of padkwalificatie
   erin: `tests/drie_wegen_kruistabel.rs` splitst de macro op komma's)
2. `crates/toetsbrug` (JSON over stdin/stdout), in de browser via Vite `POST /api/toetsing`
   (doorsnedegrootheden: `doorsnedemotor`, `POST /api/doorsnede`)
3. `crates/openaec-mcp-server`; FEM-berekeningen lopen via de Node-sidecar `fem-kernel.mjs`
Nieuwe invoervelden: ook het MCP-schema en `design-mockup/src/mcp/valideerModel.ts` bijwerken (strikte schema's: `tests/schema_strikt.rs`).

### Knoopnummering
- Reguliere knopen: `Mesh.addNode`, teller vanaf 1
- Plaatknopen: `Mesh.addPlateNode` begint op 1000 of boven het hoogste reguliere id, en slaat bestaande id's over.
  Ga er dus niet van uit dat id >= 1000 een plaatknoop is.

### Testen en verificatievolgorde
```bash
cd design-mockup && npm run build:sidecar                          # na wijziging aan core/ of engine.ts
cd src-tauri && cargo build --release -p toetsbrug -p openaec-mcp-server
cd design-mockup && npx tsc --noEmit
cd design-mockup && node scripts/run-tests.mjs                      # alle test-*.mjs tegen de bron
cd design-mockup && node scripts/run-tests.mjs --bundel             # adaptertests tegen de bundel
cd src-tauri && cargo test --workspace --exclude open-fem2d-studio
```
- Solvertests zijn analytisch opgezet (`design-mockup/test-*.mjs`); nieuwe test registreren in `run-tests.mjs`.
- Geen snapshot, gouden fixture of referentiewaarde blind bijwerken: elk veranderd getal verantwoorden.

### Veelvoorkomende Fouten (VERMIJD)
1. **Oude binaries**: `run-tests.mjs` bouwt `toetsbrug`/`openaec-mcp-server` niet; zonder herbouw test je een oude kern.
2. **Oude sidecar**: na een wijziging aan de kern of `engine.ts` rekent de MCP-server met de vorige bundel tot `npm run build:sidecar` gedraaid is. `build.rs` vergelijkt alleen bundel en hashbestand, niet de TypeScript-bron.
3. **Normaalkrachtteken**: de kern rekent N druk-positief, `engine.ts` (`convertResult`) zet om naar trek-positief. Nooit een tweede omkering toevoegen (`test-n-teken.mjs`).
4. **Vergrendelde DLL**: een draaiende debug-app vergrendelt `WebView2Loader.dll`; test met `--exclude open-fem2d-studio`.
5. **ts-rs-typen**: `cargo test` herschrijft `design-mockup/src/lib/types/`; alleen regeleinden veranderd → `git checkout`.
6. **Versienummer** staat in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`) en `design-mockup/package.json`; release bouwen vanuit de root (`npm run tauri:build`), niet vanuit `design-mockup/` (daar staat een oude `src-tauri/`-sjabloonmap).
7. **Windows-crate-type**: de app-crate blijft `crate-type = ["lib"]` (64K-exportlimiet van PE/COFF).
8. **WebView2**: `embedBootstrapper` en `WebView2Loader.dll` als resource (in `src-tauri/tauri.conf.json` en `tauri.windows.conf.json`) niet weghalen.

## Zelf-Check

Voor elke response, verifieer:
- [ ] Vraag beantwoord?
- [ ] Alleen gevraagde wijzigingen gemaakt?
- [ ] ALLE wijzigingen gerapporteerd?
- [ ] Code compileert?
- [ ] Niet-gedaan dingen vermeld?
- [ ] Onduidelijkheden gevraagd?
- [ ] Test instructies gegeven?
