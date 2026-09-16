#!/usr/bin/env node
/**
 * Regressierunner voor de solverbatterij.
 *
 * Twee standen, met verschillend bewijskarakter:
 *
 *   npm test           — alle `test-*.mjs` tegen de BRON, via `tsx`.
 *                        Dit bewaakt of de solver juist rekent.
 *   npm run test:bundel — de adaptertests tegen de gebundelde SIDECAR
 *                        (`assets/fem-kernel.mjs`), met kaal `node`.
 *                        Dit bewaakt of de bundel een getrouwe afgeleide van
 *                        de bron is, en of hij het zonder DOM, zonder Tauri en
 *                        zonder bundler daadwerkelijk doet.
 *
 * Waarom niet alle tests tegen de bundel draaien: dertien tests raken de
 * kern rechtstreeks (`Mesh`, `PlateRegion`, `Assembler`, `DKT`, `Quad4`,
 * `Triangle`, `Matrix`, `GaussElimination`), de zustand-store, of staan er
 * los van. Die horen op de bron te blijven — ze bewaken de kern, niet het
 * MCP-artefact. Ophogen door `PlateRegion` in de barrel te trekken mag NIET:
 * dat haalt `TriangleService` en daarmee `window.location.origin` de bundel
 * in, en het bundelscript keurt de bundel dan (terecht) af.
 *
 * Twee mechanische valkuilen die deze runner respecteert:
 *
 *  1. Testbestanden worden NIET naar een andere map gekopieerd. Fixturepaden
 *     worden relatief aan het testbestand opgelost — `test-checkconfig.mjs`
 *     leest `../voorbeelden/houten-raamwerk.ifcfem2d` via `import.meta.url`.
 *     Verplaatsen breekt dat stil. De herschreven kopie komt daarom NAAST het
 *     origineel te staan, met een naam die buiten `test-*.mjs` valt zodat hij
 *     nooit als testbestand wordt opgepikt.
 *  2. Het bundelpad gaat als `file://`-URL de import in. Een kaal
 *     `C:/...`-pad is op Windows geen geldige ESM-specifier; alle
 *     bundeltests vallen daarop om.
 *
 * Gebruik:
 *   node scripts/run-tests.mjs [--bundel] [--filter=<deel>] [--breed]
 *
 *   --bundel        draai de adaptertests tegen de sidecarbundel
 *   --filter=<deel> alleen tests waarvan de naam <deel> bevat
 *   --breed         toon de volledige uitvoer van elke test, ook bij succes
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const repoRoot = resolve(frontendRoot, "..");

const BUNDEL = join(
  repoRoot,
  "src-tauri",
  "crates",
  "openaec-mcp-server",
  "assets",
  "fem-kernel.mjs",
);

const TSX_CLI = join(frontendRoot, "node_modules", "tsx", "dist", "cli.mjs");

/** Voorvoegsel van de herschreven kopieën; valt buiten de `test-*.mjs`-glob. */
const KOPIE_PREFIX = ".bundelrun-";

/** Tijdslimiet per test. Ruim: `test-tweede-orde` start zelf drie subtests. */
const TIJDSLIMIET_MS = 300_000;

/**
 * De tests die tegen de bundel kunnen draaien: ze praten uitsluitend met de
 * adapterlaag (`engine`, `combinations`, de check-builders, `sectionResolver`,
 * `femTypes`, de windmodules en `projectFile`) — precies wat de barrel
 * ontsluit.
 */
const BUNDEL_TESTS = new Set([
  // Belastinggevallen en combinaties tegen de NB-tabellen en de hand: de
  // afleiding van de standaardset (`normcombinaties`), het bijhouden bij
  // toevoegen/wijzigen/verwijderen (`combinatieBeheer`), de zijdelingse toets
  // (`steelCheckBuilder`) en de MCP-weg (`sidecar`). Alles staat in de barrel,
  // en juist de sidecar gebruikt deze afleiding voor zijn standaardset — dus
  // hoort hij ook tegen de bundel te bewijzen dat die dezelfde factoren geeft.
  "belastingcombinaties",
  // w₁, de zakking onder alleen de blijvende belasting (NEN-EN 1990:2002/NB:2019
  // A1.4.3(2), figuur NB.1), voor hout en staal: de bouwers vullen
  // `deflection_permanent_mm` uit de BGT-combinatie met alleen G, melden het
  // als die ontbreekt, en de selectie laat die combinatie ook in een zuivere
  // staalconstructie staan. Praat met `engine`, `combinations`,
  // `combinatieSelectie`, `bouwMultiInput` en de twee bouwers — alles in de
  // barrel — en start toetsbrug en de MCP-server als apart proces. Hoort juist
  // óók tegen de bundel: laat de bundel w₁ of de combinatie vallen, dan krijgt
  // de w_add-toets via `check_fem_model` stil weer de volledige zakking.
  "blijvende-zakking",
  "checkconfig",
  "combinatieselectie",
  // Rekent een externe referentie-berekening na (twee houten liggerlijnen) en
  // raakt daarbij uitsluitend de adapterlaag: `engine`, `combinations`,
  // `sectionResolver` en de twee check-builders — precies wat de barrel
  // ontsluit. Juist deze verificatie hoort óók in de bundelstand: zij is de
  // proef dat de sidecar dezelfde krachtsverdeling geeft als de bron, tegen
  // getallen van buiten dit project.
  "dakconstructie-referentie",
  "doorbuiging-toets",
  // Een door tussenknopen geknipte staaf als één staaf naar de kern
  // (`lib/doorgaandeLijn.ts`), en de staafeinden (vrij, doorlopend). Praat
  // alleen met engine, combinations en de bouwers; hoort óók tegen de bundel
  // te draaien, want juist de MCP-weg toetste tot september 2026 elk deel los
  // en nam de tussenknoop als gaffel.
  "doorgaande-lijn",
  // Scheefstand in beide richtingen: solveAllCases levert elk geval tweemaal,
  // metScheefstandRichtingen ontvouwt de combinaties en de omhullende neemt
  // de ongunstigste richting. Raakt alleen engine en combinations; de
  // MCP-weg gebruikt dezelfde ontvouwing, dus hoort dit ook tegen de bundel.
  "scheefstand-richting",
  // De kritieke lastfactor α_cr en de meldingen (basisaudit nr 27). Raakt
  // engine, combinations en alphaCr; de sidecar zet de FOUT in `warnings`,
  // dus hoort dit ook tegen de bundel.
  "alpha-cr",
  "hoekverdraaiing",
  // Bewaakt dat de kniklengte van een HOUTEN staaf tot in de toetsinvoer
  // komt (buckling_length_y_m/_z_m in TimberBeamCheckInput). Praat alleen met
  // `engine`, `combinations` en de twee check-builders — precies wat de
  // barrel ontsluit, dus hij kan óók tegen de sidecarbundel. Dat is hier de
  // bedoeling: als de bundel de kniklengte laat vallen, rekent de sidecar met
  // de volle systeemlengte terwijl de bron met de opgegeven steunafstand
  // rekent, en dat verschil hoort luid op te vallen.
  "hout-kniklengte",
  // Bewaakt dat de KIPSTEUNAFSTAND van een houten staaf tot in de
  // toetsinvoer komt (ltb_segment_length_m in TimberBeamCheckInput), en dat
  // de kipsteunfracties per flens hem nog steeds niet stilzwijgend vullen.
  // Praat alleen met `engine`, `combinations` en de houtbouwer — precies wat
  // de barrel ontsluit, dus hij kan óók tegen de sidecarbundel. Dat is hier
  // de bedoeling: laat de bundel dit veld vallen, dan rekent de sidecar de
  // kiptoets op de volle staaflengte terwijl de bron met de steunafstand
  // rekent, en dat scheelt in l_ef een factor die je in de UC terugziet.
  "hout-kipsteunafstand",
  // Bewaakt dat de drie houtkeuzen van de toetsconfiguratie — scheurfactor
  // k_cr (6.1.7), kiptoets aan/uit (6.3.3(5)) en het aangrijpingspunt van de
  // belasting (tabel 6.1) — tot in de toetsinvoer komen, en dat de veldpoort
  // (`keurCheckConfig`, ook die van `check_config` in `check_fem_model`)
  // onzin weigert. Praat met `engine`, `combinations`, de houtbouwer en
  // `valideerModel` — alle vier in de barrel. Hoort juist óók tegen de
  // bundel: laat de bundel een veld vallen, dan toetst de MCP-weg met de
  // standaard (k_cr 1,0, kiptoets aan) terwijl de bron de keuze van de
  // gebruiker volgt, en dat verschil hoort luid op te vallen.
  "hout-checkconfig",
  // De eindstijfheid E_mean,fin van hout in een gemengd, statisch onbepaald
  // model (EN 1995-1-1 2.2.3(5), 2.3.2.2): de bepaling, de eindtoestandvarianten
  // van de UGT-combinaties en de herverdeling tegen de handberekening. Praat met
  // `engine`, `combinations`, `bouwMultiInput`, `houtEindstijfheid` en de
  // in-proces sidecar — alles in de barrel. Hoort juist óók tegen de bundel:
  // laat de bundel de varianten vallen, dan toetst de MCP-weg het staal naast
  // weggekropen hout stil met de krachtsverdeling van E_mean.
  "hout-eindstijfheid",
  "lastomschrijving",
  "leeg-geval",
  "n-teken",
  "omhullende",
  // Oude projectbestanden en de windgenerator: herkennen en vervangen van de
  // standaardset van 0.3.11 bij het openen, ongedaan maken, de controles op
  // eigen combinaties en het meelopen van de gegenereerde windcombinaties —
  // tegen de hand. Praat met `combinatieBeheer`, `normcombinaties`,
  // `combinations`, `engine`, `bouwMultiInput`, de windgenerator, de
  // projectbestand-functies en de sidecar: allemaal in de barrel. Hoort juist
  // óók tegen de bundel: de MCP-weg leest `project_path` met dezelfde
  // `openCombinatieStaat`, en een bundel die nog "melden, niet overschrijven"
  // meedraagt, rekent een oud bestand stil met de oude factoren. Het slotblok
  // start de MCP-server als apart proces en faalt luid als die ontbreekt.
  // De normnaad: de nationale bijlage van het project reist door naar elke
  // toetsinvoer, en een bijlage die deze uitgave niet kent wordt geweigerd.
  // Praat uitsluitend met `sidecar` en `lib/normAanduidingen` — precies wat de
  // barrel ontsluit, dus hij hoort ÓÓK tegen de bundel te draaien: laat de
  // bundel het veld `bijlage` vallen, dan rekent de MCP-weg met de
  // standaardwaarde van de kern terwijl het project iets anders zegt, en dat
  // is precies de stille fout die deze naad moet voorkomen.
  "normnaad",
  "oude-projecten",
  "plaat-adapter",
  "plaat-combinatie",
  "plaat-polygoon",
  "plaat-project",
  // Randadressering, meshcache-randknopen en harde elementfouten van platen:
  // praat met `engine`, `femTypes`, `bouwMultiInput`, `valideerModel` en de
  // in-proces sidecar (`verwerkVerzoek`) — allemaal in de barrel. Hoort juist
  // óók tegen de bundel: de weigeringen moeten in het MCP-artefact net zo hard
  // zijn als in de bron, anders valt een last daar stil weg.
  "plaat-randadres",
  "plaat-randlast",
  // Deel- en trapeziumrandlasten, puntlasten op een plaatrand en staafeinden
  // die tussen twee randknopen op een plaatrand liggen (kinematische
  // koppeling): praat met `engine`, `combinations`, `bouwMultiInput`,
  // `valideerModel` en de in-proces sidecar — allemaal in de barrel. Hoort
  // óók tegen de bundel: het is de proef dat de MCP dezelfde knoopkrachten en
  // dezelfde koppeling rekent als de app.
  "plaat-randlasten",
  // Vierhoekmesher en openingen (stap 2): raster met Quad4/CST, de keuring
  // van een cache met vierhoeken, het rasterpad met rechthoekige openingen
  // (ook via de MCP zonder cache) en de O-grid-cache rond een 16-hoek. Praten
  // met `engine`, `femTypes`, `PlaatMesher` (pure kern, in de barrel),
  // `bouwMultiInput`, `valideerModel`, `projectFile` en de in-proces sidecar
  // — allemaal in de barrel. Horen juist óók tegen de bundel: de MCP moet een
  // opening precies zo meshen als de app, anders rekent de sidecar stil een
  // dichte wand.
  "plaat-vierhoeken",
  // Materiaalkeuze per plaat (stap 3): E, ν en ρ uit de materiaalnaam, de
  // richtingsafhankelijke stijfheid van hout en kruislaaghout, het eigen
  // gewicht ρ·t·A en de weigering van een onbekend materiaal. Praat met
  // `engine`, `femTypes`, `plaatMateriaal`, `sectionResolver`,
  // `bouwMultiInput` en `valideerModel` — allemaal in de barrel. Hoort juist
  // óók tegen de bundel: laat het MCP-artefact het materiaalveld vallen, dan
  // rekent de sidecar een houten wand stil met E = 210 000 in plaats van
  // 11 000/370, en dat is een factor dertig in de dwarsrichting. De
  // spiegeltest op de houttabellen leest src-tauri/.../data.rs van schijf;
  // de herschreven bundelkopie staat naast het origineel, dus dat pad blijft
  // kloppen.
  "plaat-materiaal",
  // Randlast en randpuntlast op een OPENINGSRAND: engine, mapping, poort,
  // sidecar (verwerkVerzoek), projectbestand en IFC-export — allemaal in de
  // barrel, en juist in de bundel van belang: de sidecar rekent de plaat met
  // opening zonder canvas, dus een adres dat daar stil op de omtrek zou
  // vallen, moet ook in de bundel weigeren.
  "plaat-opening-randlast",
  // Staafeinde op een OPENINGSRAND (issue #13): koppeling en evenwicht in
  // engine, weigering bij bijna-op-de-rand in engine en MCP-droogloop,
  // sidecar-solve en bit-identiek zonder zo'n staafeinde. De sidecar rekent
  // zulke platen zonder canvas; een staaf die in de bundel stil los zou
  // blijven, moet ook daar gekoppeld of geweigerd worden.
  "plaat-opening-staafeinde",
  "plaat-openingen",
  "plaat-randstaaf",
  "plaat-validatie",
  "qrichting",
  "releases",
  // Verende staafaansluitingen: engine + bouwMultiInput, allebei in de barrel.
  "staafveren",
  "scheefstand",
  // De MCP-weg rekent φ met de normkeuze uit het bestand of het model, via
  // dezelfde afleiding als de app. Praat met `sidecar`, `projectFile` en
  // `valideerModel` — alle drie in de barrel. Hoort juist óók tegen de bundel:
  // een bundel die de normkeuze nog laat liggen, rekent hetzelfde bestand
  // met een andere horizontale kracht dan de app (gemeten: tot factor 1,94).
  "scheefstand-mcp",
  "sectie-doorvoer",
  // Toetst waar de adapter zijn rekenknopen legt (deellastgrenzen,
  // `extraSneden`, de samenvoegregel) en praat daarvoor uitsluitend met
  // `engine` — solve/solveAllCases, precies wat de barrel ontsluit. Hoort
  // juist óók in de bundelstand: het stationsraster is wat de sidecar naar
  // buiten geeft, dus als de bundel daar afwijkt van de bron, moet dat hier
  // opvallen.
  "sneden",
  // Singulier stelsel: dezelfde Nederlandse melding (knoop, richting, oorzaak)
  // op het raamwerkpad en op het gemengde pad. Praat alleen met `engine` en
  // `bouwMultiInput` — allebei in de barrel. Hoort juist óók tegen de bundel:
  // de MCP-weg geeft deze melding door aan de client, en een bundel die het
  // gemengde pad nog als "column 5" meldt, laat de gebruiker raden.
  "singulier-melding",
  // Staal herkennen aan de profieldatabase: elke sleutel van profiles.json
  // moet door `isSteelProfile` en `buildSteelCheckInputs`. Praat met de
  // staalbouwer, `engine` en `combinations` — alle drie in de barrel. Hoort
  // juist óók tegen de bundel: in de MCP-weg verdwenen de 160 profielen die de
  // oude voorvoegsellijst miste zonder spoor, dus als de bundel een oude
  // herkenning meedraagt moet dat hier opvallen.
  "staalherkenning",
  "staafsegmenten",
  "thermiek",
  "tweede-orde",
  "v2-stations",
  "validatie-mcp",
  "veldzakking",
  // Verlopende profielen (deel 1): doorsnede op positie x, segmenten met A
  // en I, eigen gewicht per segment, de poorten en de in-proces sidecar.
  // Praat met `engine`, `sectionResolver`, `modelNaarSolverInput`,
  // `valideerModel`, `sidecar`, `referentierichting` en de
  // projectbestandfuncties — alles in de barrel. Hoort juist óók tegen de
  // bundel: de MCP-weg moet een verlopende staaf precies zo opdelen als de
  // app, anders rekent de sidecar stil prismatisch met het beginprofiel.
  "verlopend-profiel",
  // Verlopende profielen (deel 2): de TOETSING. Praat met `engine`,
  // `combinations`, `bouwMultiInput` en de twee toetsbouwers — alles in de
  // barrel — en start daarnaast toetsbrug en de MCP-server als apart proces.
  // Hoort juist óók tegen de bundel: `check_fem_model` bouwt de toetsinvoer
  // uit de bundel, en een bundel die `profile_end` of de eindmaten van een
  // houten staaf nog niet doorgeeft, toetst daar stil de BEGINdoorsnede over
  // de hele staaf.
  "verlopend-toetsing",
  "veren",
  "wind-generator",
  "wind-eurocode",
  // Vrijstaand dak (§7.3, tabel 7.6/7.7): praat alleen met de windmodules en
  // `engine` — alles in de barrel. Hoort óók tegen de bundel: de sidecar moet
  // dezelfde tabelcellen, zones en c_f-gevallen leveren, en de gebouwgevallen
  // moeten daar net zo bit-identiek blijven als in de bron.
  "wind-vrijstaand-dak",
]);

/**
 * Waarom de overige tests op de bron blijven. Expliciet opgeschreven zodat een
 * ontbrekende test in de bundelstand een gedocumenteerde keuze is en geen
 * vergeten regel.
 */
const ALLEEN_BRON = new Map([
  ["pendelstaaf", "raakt kerninterne klassen (Assembler, Matrix)"],
  ["plaat-dkt", "raakt kerninterne klassen (Mesh, PlateRegion, DKT)"],
  ["plaat-ids", "raakt kerninterne klassen (Mesh, PlateRegion)"],
  ["plaat-lasten", "raakt kerninterne klassen (Mesh, PlateRegion, PlateLoads)"],
  ["plaat-mixed", "raakt kerninterne klassen (Mesh, PlateRegion, NonlinearSolver)"],
  [
    "tweede-orde-platen",
    "toetst de geometrische stijfheid van de wandschijven op matrixniveau en bouwt zijn modellen met Mesh + PlateRegion; Triangle, Quad4 en PlateRegion staan bewust niet in de barrel (PlateRegion zou TriangleService en window.location de bundel in trekken). Het engine-pad dat hij aan het eind wél aanroept, is daar niet los van te knippen",
  ],
  [
    "bedding",
    "toetst de staaf op bedding door de adapter en de projectserialisatie (io/projectFile, lib/modelNaarSolverInput) — die twee staan niet in de barrel; de engine-kant zelf zit erin, maar de test is één geheel",
  ],
  [
    "solverlog",
    "leest het solverlogboek uit de zustand-store en geeft de kern rechtstreeks een onLog-callback; de store hoort niet in de barrel en de sidecar zet juist géén opvanger — tegen de bundel zou deze test dus het tegenovergestelde bewijzen van wat hij moet bewaken",
  ],
  ["plaat-schijf", "raakt kerninterne klassen (Triangle, Quad4, GaussElimination)"],
  [
    "plaat-orthotroop",
    "meet de materiaalmatrix zelf (core/fem/Triangle.getConstitutiveMatrix met core/math/Matrix): kerninterne code die bewust buiten de barrel blijft. De uitkomsten ervan worden wél tegen de bundel bewezen, in test-plaat-materiaal",
  ],
  [
    "oplossers",
    "vergelijkt de twee stelseloplossers rechtstreeks (Matrix, GaussElimination, SkylineSolver, LinearSolver); die staan bewust niet in de barrel",
  ],
  ["deellast", "test de zustand-store, niet de solver"],
  ["puntlast-positie", "test de zustand-store, niet de solver"],
  ["splitsen", "test de zustand-store, niet de solver"],
  [
    "verlopend-splitsen",
    "splitst een verlopende staaf met `computeBeamSplitOpKnoop` uit de zustand-store en met de bibliotheek van eigen doorsneden; geen van beide staat in de barrel, en de sidecar splitst ook niets — tegen de bundel zou deze test dus niets bewaken. De solver dient er alleen als bewijs dat het splitsen geen enkel getal verandert",
  ],
  ["stramien-verplaatsen", "test de zustand-store, niet de solver"],
  ["transform", "test de zustand-store, niet de solver"],
  [
    "lasten-kopieren",
    "test de store-logica voor het kopiëren van lasten tussen belastinggevallen; de solver dient er alleen als eindcontrole",
  ],
  [
    "modelcontrole",
    "test de modelcontrole en de herstelbewerkingen in de store; de acceptatieproef gebruikt de solver alleen als eindcontrole",
  ],
  ["ifc-export", "staat los van de solver (IFC-export)"],
  ["ifc-spiegel", "staat los van de solver (IFC-export spiegelt het model)"],
  ["profieleditor-snap", "test de objectsnap van de profieleditor, niet de solver"],
  ["oude-profielen", "controleert de overgetypte profieltabellen tegen de doorsnedemotor, niet de solver"],
  [
    "hoeklijnen",
    "houdt de hoeklijnreeksen (L-profielen) in profiles.json en in de gegenereerde TS-tabellen tegen de gedrukte profieltabel, en controleert de as-afspraak van NEN-EN 1993-1-1 1.7(2) (lang been langs z, hoofdassen u-u/v-v) plus de tekenvorm. Hij leest profiles.json rechtstreeks als bronbestand en importeert de tekenmodule; de solver en de barrel komen er niet aan te pas",
  ],
  [
    "csp-wasm",
    "leest src-tauri/tauri.conf.json rechtstreeks en controleert dat het CSP WebAssembly toestaat; raakt de solver noch de barrel, en de sidecar heeft geen CSP",
  ],
  [
    "unp-tabel",
    "houdt de UNP-reeks in profiles.json en de gegenereerde TS-tabellen tegen de gedrukte profieltabel; leest die twee bestanden rechtstreeks en raakt de solver noch de barrel",
  ],
  ["profieleditor-lassen", "test de schuifstroom per lasnaad uit de doorsnedemeetkunde, niet de solver"],
  ["profieleditor-transform", "test het verplaatsen en roteren in de editor, niet de solver"],
  ["clt-builder", "test de invoerbouwer voor de houttoetsing, niet de solver"],
  [
    "doorbuigingsnoemer",
    "issue #9: een doorbuigingsnoemer van 0 of kleiner wordt geweigerd. Raakt de MCP-modelkeuring `keurCheckConfig` (src/mcp, niet in de barrel) en start de toetsbrug en de MCP-server als apart proces voor de echte EN 1993- en EN 1995-kern; tegen de bundel zou de test juist de kernen overslaan die de weigering doen. De sidecarweg zelf loopt mee in het slotblok via `check_fem_model`",
  ],
  [
    "clt-doorbuiging",
    "de doorbuigingstoets van kruislaaghout met een opgegeven k_def (tabel 3.2 kent er geen): de CLT-bouwer staat niet in de barrel, dus de bouwerkant kan alleen tegen de bron. De bundelweg is er wél in afgedekt: het slotblok stuurt hetzelfde model door `check_fem_model` van de gebouwde MCP-server, en die bouwt de CLT-invoer uit de sidecarbundel",
  ],
  [
    "hout-kmod-combinatie",
    "leidt de belastingduur per UGT-combinatie af (lib/belastingduur) en bouwt daarmee de hout- en CLT-invoer; de afleiding en de CLT-bouwer staan niet in de barrel, en het slotblok start de toetsbrug als apart proces voor de echte EN 1995-kern (k_mod 0,60 bij alleen G, UC 1,068). De sidecarweg van dezelfde afleiding bewaakt hout_in_check_fem_model.rs tegen de gebouwde MCP-server",
  ],
  [
    "clt-opbouwen",
    "test de bibliotheken van eigen CLT-opbouwen en eigen doorsneden: de winkels op localStorage, het samenvoegen bij het openen van een project en wat er in een projectbestand terechtkomt. Dat is invoerbeheer van de frontend — de solver komt er niet aan te pas en de winkels horen niet in de barrel",
  ],
  [
    "clt-voorinstellingen",
    "houdt de gegenereerde CLT-voorinstellingen tegen de Rust-kern aan: hij leest clt.rs als BRONBESTAND en importeert de generator uit scripts/ — allebei staan ze buiten de barrel, en tegen de bundel zou hij juist de generatiestap overslaan die hij moet bewaken",
  ],
  ["spanning-builder", "test de invoerbouwer voor de spanningstoets, niet de solver"],
  [
    "rapportpdf-invoer",
    "zet de stores om naar de invoer van de PDF-uitdraai (`lib/rapportPdfInvoer`) — rapportagelogica van de frontend die de solver niet raakt en dus niet in de barrel hoort",
  ],
  [
    "rapport-gereedheid",
    "toetst het klaar-signaal en de weigerregels van de PDF-export via het bedieningskanaal: de leesbare toestand van de inhoudsopgave (`components/report/toc`), de gereedheid van de paginering (`components/report/rapportGereedheid`), de kop van één export (`components/report/useProjectInfo`) en de oordelen van `bediening/rapportVoorwaarden`, plus een bronteksttoets op App.tsx en bediening.ts. Rapport- en bedieningslogica van de frontend — de solver komt er niet aan te pas en geen van die modules hoort in de barrel",
  ],
  [
    "sectierelevantie",
    "beoordeelt welke RAPPORTSECTIES een model kan vullen — presentatielogica van de frontend die niets met de solver of de sidecar te maken heeft en dus niet in de barrel hoort; de test leest bovendien de sectieregistry als bronbestand",
  ],
  ["plaat-gewicht", "vraagt een extra kernmodule (PlateLoads)"],
  [
    "plaat-openingen-store",
    "test de modelcontrole (lib/modelControle) en het meereizen van openingen bij verplaatsen, roteren, spiegelen en kopiëren in de zustand-store; geen van beide hoort in de barrel",
  ],
  [
    "plaat-opening-randlast-doorvoer",
    "test de doorvoer van een last op een openingsrand BUITEN de rekenkern: de modelcontrole van het canvas (lib/modelControle) en de IFC-export (io/ifcExport). Geen van beide staat in de barrel; de rekenkant van hetzelfde adres — evenwicht, weigeringen in engine en MCP-poort, bit-identiek zonder openingen — staat in `plaat-opening-randlast` en draait wél tegen de bundel",
  ],
  [
    "plaat-opening-staafeinde-controle",
    "test de modelcontrole van het canvas (lib/modelControle) voor een staafeinde op of bijna op een openingsrand: geen vals vrij uiteinde, en de fout of waarschuwing bij 1–50 mm. De module staat niet in de barrel (de MCP-droogloop gebruikt de regel alleen intern via valideerModel); de rekenkant en de droogloop staan in `plaat-opening-staafeinde` en draaien wél tegen de bundel",
  ],
  [
    "materiaal-dubbelzinnig",
    "bewaakt dat een korte naam als \"C30\" overal hout is en nooit stil beton (basisaudit nr 16); leest daarvoor de modelcontrole (lib/modelControle) en de betonstijfheidslus (lib/betonStijfheid), die allebei buiten de barrel staan",
  ],
  ["modelmapping", "vergelijkt de bronmapping met een gouden JSON"],
  [
    "fysisch-nietlineair",
    "drijft de lus uit lib/betonStijfheid, die de Rust-rekenkern nodig heeft en dus niet in de barrel hoort; het echte-kernblok start de toetsbrug als apart proces en wordt luid overgeslagen als die binary ontbreekt",
  ],
  [
    "beton-kruip",
    "bewaakt β van (7.19) per combinatiesoort en de kruipcoëfficiënt in de fysisch niet-lineaire betonstijfheid: drijft de lus uit lib/betonStijfheid (buiten de barrel), leest App.tsx als bronbestand voor de doorvoer, en start de toetsbrug als apart proces voor de vergelijking met de handberekening — dat blok wordt luid overgeslagen als de binary ontbreekt",
  ],
  [
    "kolomtoets",
    "de §5.8-invoer van een betonnen kolom: de gevallen van figuur 5.7 uit components/beton/kolomgegevens, de doorvoer via korvenUitStaven (een zustand-store) en betonCheckBuilder — inclusief de φ(∞,t₀) van het project uit lib/kruipcoefficient, vergeleken met lib/betonStijfheid en met App.tsx en checkStore als bronbestand gelezen — en een blok dat de toetsbrug als apart proces aanroept. Twee van die drie modules staan buiten de barrel — het korfmodel en de store — en de Rust-kern hoort er sowieso niet in, dus tegen de sidecarbundel zou de test juist de laag overslaan die hij moet bewaken",
  ],
  [
    "kruip-bijlage-b",
    "φ(∞,t₀) volgens bijlage B van projectinvoer tot kolomtoets en BGT-stijfheid: de voorrangsregel en de kernaanroep uit lib/kruipcoefficient, de doorvoer via korvenUitStaven (een zustand-store) en lib/betonStijfheid (buiten de barrel), projectFile, rekenInstellingen en App.tsx als bronbestand, en een blok dat de toetsbrug als apart proces aanroept en tegen de handberekening legt. De Rust-kern hoort niet in de sidecarbundel, en de store en de stijfheidslus staan buiten de barrel",
  ],
  [
    "dubbele-buiging",
    "dubbele buiging bij kolommen (art. 5.8.9): `maakZConsistent` uit components/beton/kolomgegevens (buiten de barrel), de modelpoort uit mcp/valideerModel voor de drie velden om de z-as, en een blok dat de toetsbrug als apart proces aanroept en de imperfectie van art. 5.2, de grens van (5.38a) en de exponent a van (5.39) met de hand narekent. De Rust-kern hoort niet in de sidecarbundel, en de twee frontendmodules staan buiten de barrel",
  ],
  [
    "sidecar",
    "start de sidecar als eigen proces — en draait daarin zelf al bron én bundel",
  ],
  [
    "golden",
    "spreekt de bundel rechtstreeks als proces aan; herschrijven zou hem juist van het gouden artefact afhalen",
  ],
  [
    "beff-liggerlijn",
    "leidt de liggerlijn van 5.3.2.1 uit de modeltopologie af (knopen, staven, opleggingen); dat is invoerbouw voor de betontoetsing en geen solverwerk, dus hij hoort niet in de barrel",
  ],
  [
    "profielvarianten",
    "kiest naburige doorsneden uit de profieldatabase en de handelsmatenlijst en bouwt daarmee toetsinvoer; dat is invoerbouw en geen solverwerk, en de korfcontrole die hij meeneemt hoort niet in de barrel",
  ],
  [
    "beton-doorsnede",
    "test de profielnaam-grammatica en het korfmodel van de betontoetsing; alleen de solverstijfheid daarvan (resolveSection) zit in de barrel, de rest is invoerbouw en tekenmeetkunde",
  ],
  [
    "betonfiguren-referentie",
    "legt de tekenmeetkunde van wapeningskorf.ts naast de gedeelde referentie die de Rust-kant óók leest (src-tauri/crates/report/tests/golden/betonfiguren-referentie.json); tekenwerk in plaats van solverwerk, en de referentie ligt buiten de bundel",
  ],
  [
    "dekking-per-zijde",
    "test het korfmodel van components/beton/wapeningskorf.ts met een eigen dekking en milieuklasse per betonoppervlak (4.4.1.1(1)P): de nuttige hoogte per trekzijde, de staafposities, s_t en de korfcontrole. Dat is invoerbouw en tekenmeetkunde van de frontend — de solver komt er niet aan te pas en wapeningskorf zit niet in de barrel van de sidecarbundel",
  ],
  [
    "cltmeetkunde-referentie",
    "legt de CLT-mechanica van cltCheckBuilder.ts (zwaartelijn, (EI)_ef, I_ef,net, de opbouw van I_y per laag en de bemonstering van het τ-verloop) naast de gedeelde referentie die de Rust-kant óók leest (src-tauri/crates/report/tests/golden/cltmeetkunde-referentie.json); die referentie is een bronbestand buiten de bundel, en de test importeert daarnaast TIMBER_E_MEAN uit sectionResolver om de tweede E-tabel te toetsen — rapport- en tekenwerk, geen solverwerk",
  ],
  [
    "doorsnede-kleur",
    "rendert ProfielMiniatuur én DoorsnedeTekening met react-dom/server en rekent de composietkleur na uit themes.css en ProfielKiezer.css; React en losse stylesheets bestaan in de sidecarbundel niet, en er komt geen rekenwerk aan te pas",
  ],
  [
    "bgvloer-referentie",
    "legt een betonnen plaatstrook uit een externe referentie-berekening naast de hele keten: hij bouwt de toetsinvoer met `lib/betonCheckBuilder` én `stores/checkStore` (de toetsstore valt buiten de barrel) en start de toetsbrug als apart proces voor de echte EN 1992-toetsing; zonder die binary faalt hij luid",
  ],
  [
    "startmodel",
    "bewaakt het model waarmee de app opent (`hooks/useFemStore`): samenstelling, opleggingen, evenwicht en toetsbaarheid. Hij leest de React-hook en de toetsstore, die allebei buiten de barrel van de sidecarbundel vallen, en stubt de staalprofieldatabase omdat die uit de Rust-kern komt",
  ],
  [
    "snedetekens",
    "rendert de resultatenoverlay met react-dom/server en meet de RICHTING van de afschuif- en buigtekens in de gerenderde SVG; dat is canvasweergave in plaats van solverwerk, en React bestaat in de sidecarbundel niet",
  ],
  [
    "korftekening",
    "rendert DoorsnedeTekening met react-dom/server en meet de LIGGING van de beugel en de staven terug uit de gerenderde SVG (schaal uit de omtrek, staafharten in millimeters, ligt-de-staaf-in-de-polygoon); tekenwerk in plaats van solverwerk, en React bestaat in de sidecarbundel niet",
  ],
  [
    "dekkingsvenster",
    "het betonvenster onderin: het zonemodel (de TS-spiegel van ReinforcementZones), de afleiding van de vier lagen, en AanzichtTekening gerenderd met react-dom/server waaruit de LIGGING van de trapjes en van het rode tekortvak in millimeters wordt teruggemeten. Drie redenen om op de bron te blijven: React bestaat in de sidecarbundel niet, het korf- en zonemodel van de frontend zit niet in de barrel, en het laatste blok start de toetsbrug als apart proces voor de echte EN 1992-uitkomsten",
  ],
  [
    "unp-flenshelling",
    "meet het oppervlak van de GETEKENDE contour van de U-profielen tegen de cataloguswaarde, om vast te leggen dat een UNP taps toeloopt en een UPE niet; tekenmeetkunde in plaats van solverwerk, en de contourfuncties zitten niet in de barrel",
  ],
  [
    "i18n-talen",
    "leest alleen de JSON-taalbestanden en config.ts van schijf en importeert geen enkele bronmodule; de bundelstand heeft er dus niets in te toetsen, en de runner weigert terecht een test zonder ./src-import",
  ],
  [
    "i18n-vaste-tekst",
    "scant de .tsx-bronbestanden met de TypeScript-parser op vaste Nederlandse teksten in JSX; hij importeert geen enkele bronmodule en rekent niets, dus de bundelstand heeft er niets in te toetsen (en de runner weigert terecht een test zonder ./src-import)",
  ],
  [
    "projectbestand",
    "serialiseert en leest het projectbestand terug (io/projectFile) en zet de rapportinstellingen in de zustand-store; projectFile en de rapportstore staan niet in de barrel",
  ],
  [
    "wind-schema",
    "rendert de doorsnede- en plattegrondtekening van het windvenster met react-dom/server en leest de staven, pijlen en maten terug uit de SVG; tekenwerk, en React bestaat in de sidecarbundel niet",
  ],
  [
    "inp-flenshelling",
    "hetzelfde voor de I-profielen: de getekende INP-contour (14 %, tf op b/4 vanaf de tip) tegen de cataloguswaarde, en een IPE die evenwijdig blijft; tekenmeetkunde, niet in de barrel",
  ],
  [
    "rapportnormen",
    "bepaalt welke normen het rapport mag noemen (`lib/normenInRapport`) uit de uitgangspunten, de toetsresultaten en de materialen in het model — presentatielogica van de frontend die de solver niet raakt en dus niet in de barrel hoort",
  ],
  [
    "hout-eigen-doorsnede",
    "legt de terugval van `resolveSection` vast: een HOUTEN staaf met een eigen doorsnede (profielnaam met het voorvoegsel EIGEN) kreeg stilzwijgend HEA 160 / S235, dus E = 210 000 in plaats van 11 000. De test zet daarvoor een doorsnede in de winkel `profieleditor/eigenDoorsnedenStore` — een localStorage-winkel die net als de CLT-opbouwen buiten de barrel valt — en gaat verder door `lib/modelNaarSolverInput` (ook niet in de barrel, zie het bedding-punt hierboven) en `lib/timberCheckBuilder`. Tegen de sidecarbundel zou hij juist de winkel overslaan waar de doorsnede vandaan moet komen",
  ],
  [
    "dekkingslijn",
    "legt de hele keten van de dekkingslijn vast: de zonegrenzen uit `lib/betonZoneSneden` worden rekenknopen via `bouwMultiInput`, de zones reizen door `lib/betonCheckBuilder` en `lib/betonDekkingslijnBuilder` naar de kern, en het slotblok start de toetsbrug als apart proces voor het echte `concrete_dekkingslijn`. Hij leest daarvoor `stores/checkStore` (de toetsstore) en de twee invoerbouwers, en die vallen alle drie buiten de barrel van de sidecarbundel; tegen de bundel zou hij juist de aansluiting overslaan die hij moet bewaken. De solverkant van hetzelfde mechanisme — `extraSneden` als zodanig — staat in `test-sneden` en draait wél tegen de bundel",
  ],
  [
    "rapport-gevuld",
    "loopt de hele rapportketen van het model tot een gezette PDF: `lib/rapportPdfInvoer` en `lib/scheefstandNorm` (rapportagelogica van de frontend), de toetsstore `stores/checkStore` voor de korven, en twee Rust-binaries als apart proces — de toetsbrug voor `check_concrete_beams` en `concrete_dekkingslijn`, en de MCP-server voor `generate_steel_report_pdf`. Geen van die vier hoort in de barrel van de sidecarbundel, en tegen de bundel zou de test juist de rapportlaag overslaan die hij moet bewaken; de solverkant die hij aanroept (`bouwMultiInput` + `solveAllCases`) staat al in `test-sneden` en `test-scheefstand`",
  ],
  [
    "scheefstand-norm",
    "rekent φ uit volgens EN 1993-1-1 (5.5), EN 1992-1-1 (5.1) en EN 1995-1-1 (5.1) en leidt h en m uit het model af (`lib/scheefstandNorm`). Dat is een PROJECTINSTELLING van de frontend: de gebruiker kiest de norm, en de sidecar krijgt het resultaat gewoon als getal (`scheefstandNoemer`) binnen. De module zit daarom niet in de barrel — de motorkant van dezelfde zaak (H = φ·V) staat in `test-scheefstand`, en die draait wél tegen de bundel",
  ],
  [
    "verouderd",
    "bewaakt dat resultaten en toetsuitslagen vervallen na een wijziging van de rekeninstellingen en na een mislukte toetsronde: `lib/rekenInstellingen`, de toetsstore `stores/checkStore` (zustand) en een bronteksttoets op de afhankelijkheden van de invalidatie-effecten in App.tsx en `hooks/useFemStore`. Geen van die modules staat in de barrel, en React-effecten bestaan in de sidecar niet; het slotblok start de toetsbrug als apart proces",
  ],
  [
    "zwakke-as",
    "knik om de zwakke as over de hele keten: de invoerbouwers (een leeg kniklengteveld gaat als 0 door), de spiegel `lib/kniklengte.ts` die de placeholder in het eigenschappenpaneel voedt — die staat buiten de barrel — en de toetsbrug als apart proces voor de echte EN 1993- en EN 1995-kern, die zelf de kniklengte kiest en haar herkomst noemt. Tegen de sidecarbundel zou de test juist de spiegel en de Rust-kern overslaan die hij tegen elkaar moet houden",
  ],
  [
    "tekenrichting",
    "stuurt dezelfde constructie in beide tekenrichtingen door de hele toetsketen en eist gelijke uitkomsten plus de handberekening: de grens `lib/referentierichting.ts`, de invoerbouwers voor staal en beton, de dekkingslijnbouwer, en de toetsbrug als apart proces voor de echte EN 1992- en EN 1993-kern. De toetsbrug hoort niet in de sidecarbundel, en de betonbouwer met zijn korven staat buiten de barrel; tegen de bundel zou de test juist de kernen overslaan die de wereldtermen in de afleiding zetten",
  ],
]);

// ── Argumenten ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const bundelStand = args.includes("--bundel");
const breed = args.includes("--breed");
const filterArg = args.find((a) => a.startsWith("--filter="));
const filter = filterArg ? filterArg.slice("--filter=".length) : null;

const onbekend = args.filter(
  (a) => !["--bundel", "--breed"].includes(a) && !a.startsWith("--filter="),
);
if (onbekend.length > 0) {
  console.error(`Onbekende optie(s): ${onbekend.join(", ")}`);
  console.error(
    "Gebruik: node scripts/run-tests.mjs [--bundel] [--filter=<deel>] [--breed]",
  );
  process.exit(2);
}

/** Basisnaam zonder `test-`-voorvoegsel en zonder `.mjs`. */
const basisnaam = (bestand) => bestand.replace(/^test-/, "").replace(/\.mjs$/, "");

// ── Testbestanden verzamelen ──────────────────────────────────────────────
const alleTests = readdirSync(frontendRoot)
  .filter((n) => n.startsWith("test-") && n.endsWith(".mjs"))
  .sort();

if (alleTests.length === 0) {
  console.error(`Geen test-*.mjs gevonden in ${frontendRoot}.`);
  process.exit(2);
}

let tests = alleTests;
if (bundelStand) {
  tests = tests.filter((n) => BUNDEL_TESTS.has(basisnaam(n)));

  // Bewaak dat de lijst en de werkboom niet uit elkaar lopen: een test die in
  // BUNDEL_TESTS staat maar niet bestaat, of een nieuwe test die in geen van
  // beide lijsten staat, is een stille gat in de dekking.
  const aanwezig = new Set(alleTests.map(basisnaam));
  const ontbrekend = [...BUNDEL_TESTS].filter((n) => !aanwezig.has(n));
  if (ontbrekend.length > 0) {
    console.error(
      `Bundellijst noemt tests die niet bestaan: ${ontbrekend.join(", ")}`,
    );
    process.exit(2);
  }
  const ongeplaatst = [...aanwezig].filter(
    (n) => !BUNDEL_TESTS.has(n) && !ALLEEN_BRON.has(n),
  );
  if (ongeplaatst.length > 0) {
    console.error(
      `Test(s) zonder plaatsbepaling: ${ongeplaatst.join(", ")}.\n` +
        "Zet elke nieuwe test in BUNDEL_TESTS of in ALLEEN_BRON (met reden) " +
        "in scripts/run-tests.mjs.",
    );
    process.exit(2);
  }
}
if (filter) tests = tests.filter((n) => n.includes(filter));

if (tests.length === 0) {
  console.error("Geen tests over na filtering.");
  process.exit(2);
}

// ── Voorwaarden per stand ─────────────────────────────────────────────────
if (bundelStand && !existsSync(BUNDEL)) {
  console.error(
    `Sidecarbundel ontbreekt: ${BUNDEL}\n` +
      "Bouw hem eerst met: npm run build:sidecar",
  );
  process.exit(2);
}
if (!bundelStand && !existsSync(TSX_CLI)) {
  console.error(
    `tsx ontbreekt: ${TSX_CLI}\nDraai eerst: npm ci (in design-mockup/)`,
  );
  process.exit(2);
}

/** Bundelpad als `file://`-URL — een kaal `C:/...`-pad is geen ESM-specifier. */
const bundelUrl = pathToFileURL(BUNDEL).href;

/** Elke `"./src/…​.ts"`-specifier in een testbestand, ongeacht de aanhalingsvorm. */
const BRON_SPECIFIER = /(["'])\.\/src\/[^"']*\.ts\1/g;

/** Restanten van een afgebroken eerdere run opruimen. */
function ruimKopieënOp() {
  for (const naam of readdirSync(frontendRoot)) {
    if (naam.startsWith(KOPIE_PREFIX)) {
      rmSync(join(frontendRoot, naam), { force: true });
    }
  }
}

/**
 * Schrijft een kopie van `bestand` NAAST het origineel waarin elke
 * bron-import naar de bundel wijst. Naast het origineel, want fixturepaden
 * worden relatief aan het testbestand opgelost.
 */
function schrijfBundelKopie(bestand) {
  const bron = readFileSync(join(frontendRoot, bestand), "utf8");
  let vervangingen = 0;
  const herschreven = bron.replace(BRON_SPECIFIER, () => {
    vervangingen++;
    return JSON.stringify(bundelUrl);
  });
  if (vervangingen === 0) {
    throw new Error(
      `${bestand} importeert geen enkele "./src/…" module; hij hoort niet in ` +
        "de bundelstand thuis.",
    );
  }
  const kopie = join(frontendRoot, `${KOPIE_PREFIX}${bestand}`);
  writeFileSync(kopie, herschreven);
  return { kopie, vervangingen };
}

/** Start een testproces en verzamelt uitvoer, exitcode en looptijd. */
function draai(commando, argumenten) {
  return new Promise((klaar) => {
    const start = process.hrtime.bigint();
    const kind = spawn(commando, argumenten, {
      cwd: frontendRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let uit = "";
    let fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));

    const wekker = setTimeout(() => {
      kind.kill("SIGKILL");
      fout += `\n[runner] tijdslimiet van ${TIJDSLIMIET_MS / 1000} s overschreden.\n`;
    }, TIJDSLIMIET_MS);

    kind.on("error", (err) => {
      clearTimeout(wekker);
      klaar({ code: -1, uit, fout: `${fout}${err.message}`, ms: 0 });
    });
    kind.on("close", (code) => {
      clearTimeout(wekker);
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      klaar({ code, uit, fout, ms });
    });
  });
}

/**
 * Haalt "<n> geslaagd, <m> gefaald" uit de uitvoer. De batterij schrijft die
 * regel in wisselende opmaak; de laatste treffer is de eindstand. Valt terug
 * op het tellen van vinkjes, zodat een test zonder slotregel geen nul meldt.
 */
function telChecks(tekst) {
  const treffers = [...tekst.matchAll(/(\d+)\s+geslaagd,\s+(\d+)\s+gefaald/g)];
  if (treffers.length > 0) {
    const laatste = treffers[treffers.length - 1];
    return { geslaagd: Number(laatste[1]), gefaald: Number(laatste[2]) };
  }
  return {
    geslaagd: (tekst.match(/✓/g) ?? []).length,
    gefaald: (tekst.match(/✗/g) ?? []).length,
  };
}

// ── Uitvoeren ─────────────────────────────────────────────────────────────
const stand = bundelStand ? "BUNDEL (kaal node)" : "BRON (tsx)";
console.log(`Solverbatterij — stand: ${stand}`);
console.log(`  map     : ${frontendRoot}`);
if (bundelStand) console.log(`  bundel  : ${BUNDEL}`);
console.log(`  tests   : ${tests.length}${filter ? ` (filter "${filter}")` : ""}`);
console.log("");

ruimKopieënOp();

const uitslagen = [];
let totaalGeslaagd = 0;
let totaalGefaald = 0;

for (const bestand of tests) {
  const naam = basisnaam(bestand);
  let kopie = null;
  let uitslag;

  try {
    let commando;
    let argumenten;
    if (bundelStand) {
      const geschreven = schrijfBundelKopie(bestand);
      kopie = geschreven.kopie;
      commando = process.execPath;
      argumenten = [kopie];
    } else {
      commando = process.execPath;
      argumenten = [TSX_CLI, join(frontendRoot, bestand)];
    }
    uitslag = await draai(commando, argumenten);
  } catch (err) {
    uitslag = { code: -1, uit: "", fout: String(err), ms: 0 };
  } finally {
    if (kopie) rmSync(kopie, { force: true });
  }

  const alles = `${uitslag.uit}${uitslag.fout}`;
  const { geslaagd, gefaald } = telChecks(alles);
  const ok = uitslag.code === 0;
  totaalGeslaagd += geslaagd;
  totaalGefaald += gefaald;
  uitslagen.push({ naam, ok, geslaagd, gefaald, ms: uitslag.ms, alles });

  const merk = ok ? "PASS" : "FAAL";
  console.log(
    `  ${merk}  ${naam.padEnd(24)} ${String(geslaagd).padStart(4)} geslaagd, ` +
      `${String(gefaald).padStart(3)} gefaald  (${uitslag.ms.toFixed(0)} ms)`,
  );
  if (breed || !ok) {
    console.log(
      alles
        .trimEnd()
        .split("\n")
        .map((r) => `        │ ${r}`)
        .join("\n"),
    );
    console.log("");
  }
}

// ── Samenvatting ──────────────────────────────────────────────────────────
const gefaaldeTests = uitslagen.filter((u) => !u.ok);

console.log("");
console.log("─".repeat(72));
console.log(
  `${stand}: ${uitslagen.length - gefaaldeTests.length}/${uitslagen.length} ` +
    `testbestanden geslaagd — ${totaalGeslaagd} checks geslaagd, ` +
    `${totaalGefaald} gefaald.`,
);

if (bundelStand && !filter) {
  console.log(
    `Op de bron gebleven: ${ALLEEN_BRON.size} test(s) — zie ALLEEN_BRON in ` +
      "scripts/run-tests.mjs voor de reden per test.",
  );
}

if (gefaaldeTests.length > 0) {
  console.log("");
  console.log("Gefaald:");
  for (const u of gefaaldeTests) console.log(`  - ${u.naam}`);
  process.exit(1);
}

process.exit(0);
