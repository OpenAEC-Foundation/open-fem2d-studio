// Het klaar-signaal en de weigerregels van de PDF-export via het bedieningskanaal.
//
// ── WAAROM DEZE TEST BESTAAT ───────────────────────────────────────────────
//
// Het standaardrapport komt via de API als PDF uit de draaiende app
// (`rapport_pdf` in gui_control.rs → `rapport_voorbereiden` in
// bediening/rapportExport.ts). Twee dingen kunnen daar een document opleveren
// dat er af uitziet maar niet klopt, en geen van beide is in een PDF te zien:
//
//  * PRINTEN TE VROEG — midden in een pagineerslag, met een inhoudsopgave die
//    zich nog bijstelt, of over de vellen van vóór het wisselen van rapporttype.
//    Vroeger was er geen signaal; de GUI-test wachtte een vaste tijd.
//  * PRINTEN ZONDER VERSE UITKOMST — geen resultaten, een toetsing die hoort bij
//    een vorige berekening, of bij tweede orde fysisch niet-lineair resultaten
//    zonder die ronde. Het rapport print "Nog niet berekend" zonder de balk
//    "Model gewijzigd" (die print niet mee).
//
// De oordelen daarover zijn zuiver gemaakt zodat ze hier zonder app getoetst
// kunnen worden. De referentie-GUI-test (referentie-gui/rapport-pdf.mjs) doet de
// keten door de echte app.
//
//   [1] toc.ts        — de leesbare toestand: stabiel na convergentie, stabiel
//                       na bevriezen, niet stabiel zolang een eigen slag komt.
//   [2] paginering    — beoordeelPaginering: elke wachtreden, de handdruk met
//                       het herpagineerverzoek, de stilte, en geen vellen.
//   [3] rekenen       — beoordeelRekenVoorwaarden: wachten gaat vóór weigeren,
//                       elke weigerreden, en een model zonder toetsbare staven
//                       is GELDIG.
//   [4] argumenten    — leesExportOpties: strikt, kop zonder lekken.
//   [5] na de afdruk  — vergelijkExportMoment.
//   [6] de kop        — kopMetOverschrijving: niets van een vorig project.
//   [7] bronteksten   — `rekenen` via het kanaal IS de knop (rekenDoor), en de
//                       zijbalk en de export delen pasRapportTypeToe.
//
// Uitvoeren: npx tsx test-rapport-gereedheid.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=rapport-gereedheid

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));

const toc = await import("./src/components/report/toc.ts");
const { beoordeelPaginering, STILTE_NA_SLAG_MS } = await import(
  "./src/components/report/rapportGereedheid.ts"
);
const { beoordeelRekenVoorwaarden, leesExportOpties, vergelijkExportMoment } = await import(
  "./src/bediening/rapportVoorwaarden.ts"
);
const { kopMetOverschrijving, EMPTY_PROJECT_INFO } = await import(
  "./src/components/report/useProjectInfo.ts"
);

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}
function gooit(fn) {
  try { fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] toc.ts — wanneer is de inhoudsopgave stabiel?");
{
  const regel = (nummer, titel, pagina, niveau = 2) => ({ niveau, nummer, titel, pagina });
  toc.resetTocVoorTest();
  check("begintoestand is stabiel (er komt geen eigen slag)", toc.tocToestand().stabiel);

  // Slag 1: nieuwe hoofdstukken → publiceren → er komt een eigen vervolgslag.
  toc.startPagineerslag();
  const s1 = toc.verwerkKoppen([regel("1", "Knopen", 2), regel("2", "Staven", 3)]);
  check("nieuwe koppen: slag 1 gepubliceerd", s1 === 1, `slag ${s1}`);
  check("… en NIET stabiel: de eigen vervolgslag komt nog", !toc.tocToestand().stabiel);

  // Slag 2 (intern): dezelfde nummers → convergentie.
  toc.startPagineerslag();
  const s2 = toc.verwerkKoppen([regel("1", "Knopen", 2), regel("2", "Staven", 3)]);
  check("zelfde nummers: 0 (geconvergeerd)", s2 === 0, `slag ${s2}`);
  check("… en stabiel", toc.tocToestand().stabiel);

  // Grensgeval: nummers springen heen en weer tot MAX_SLAGEN (4) → bovengrens.
  toc.resetTocVoorTest();
  const koppen = (p) => [regel("1", "Knopen", 2), regel("2", "Staven", p)];
  toc.startPagineerslag();
  toc.verwerkKoppen(koppen(3)); // slag 1 (structuur nieuw)
  let laatste = 0;
  for (let i = 0; i < 3; i++) {
    toc.startPagineerslag();
    laatste = toc.verwerkKoppen(koppen(i % 2 === 0 ? 4 : 3)); // slag 2, 3, 4
  }
  const t4 = toc.tocToestand();
  check("na 4 slagen bevroren op de bovengrens", laatste === 4 && t4.bevroren, JSON.stringify(t4));
  check("… maar nog niet stabiel: de bovengrens is net gepubliceerd", !t4.stabiel);
  toc.startPagineerslag();
  const s5 = toc.verwerkKoppen(koppen(3)); // springt weer, maar bevroren
  check("bevroren: het slagnummer blijft (geen 0 — data-toc-slag is dus geen eindcriterium)", s5 === 4, `slag ${s5}`);
  check("… en stabiel: er wordt niet meer gepubliceerd", toc.tocToestand().stabiel);

  // Een slag van buiten (geen eigen publicatie verwacht) begint een nieuwe reeks.
  toc.startPagineerslag();
  const t6 = toc.tocToestand();
  check("een niet-eigen slag zet teller en bevriezing terug", t6.slag === 0 && !t6.bevroren, JSON.stringify(t6));
  toc.resetTocVoorTest();
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] beoordeelPaginering — het klaar-signaal van de opmaakproef");
{
  const nu = 100_000;
  const klaar = {
    pagineer: {
      gemonteerd: true, timerGepland: false, fontsBinnen: true, slagen: 5,
      aantalVellen: 12, laatsteSlagOp: nu - STILTE_NA_SLAG_MS - 1, beantwoordVerzoek: 3,
    },
    toc: { slag: 0, bevroren: false, eigenSlagVerwacht: false, stabiel: true },
    verzoek: 3,
    projectInfoLaadt: false,
    nu,
  };
  const met = (patch = {}, p = {}) => ({ ...klaar, ...patch, pagineer: { ...klaar.pagineer, ...p } });
  const o0 = beoordeelPaginering(klaar);
  check("alles in orde → klaar met het aantal vellen", o0.soort === "klaar" && o0.aantalVellen === 12, JSON.stringify(o0));

  const gevallen = [
    ["niet gemonteerd", met({}, { gemonteerd: false }), /niet in beeld/],
    ["projectgegevens laden nog", met({ projectInfoLaadt: true }), /projectgegevens/],
    ["fonts niet binnen", met({}, { fontsBinnen: false }), /lettertypen/],
    ["slag gepland", met({}, { timerGepland: true }), /gepland/],
    ["nog nooit gepagineerd", met({}, { slagen: 0 }), /nog niet gepagineerd/],
    ["verzoek nog niet beantwoord", met({ verzoek: 4 }), /nieuwe rapportinstellingen/],
    ["inhoudsopgave stelt zich bij", met({ toc: { slag: 2, bevroren: false, eigenSlagVerwacht: true, stabiel: false } }), /inhoudsopgave/],
    ["laatste slag te recent", met({}, { laatsteSlagOp: nu - STILTE_NA_SLAG_MS + 1 }), /net gedaan/],
  ];
  for (const [naam, invoer, reden] of gevallen) {
    const o = beoordeelPaginering(invoer);
    check(`${naam} → wacht`, o.soort === "wacht" && reden.test(o.reden), JSON.stringify(o));
  }
  const bevroren = beoordeelPaginering(met({ toc: { slag: 4, bevroren: true, eigenSlagVerwacht: false, stabiel: true } }));
  check("bevroren inhoudsopgave telt als stabiel → klaar", bevroren.soort === "klaar", JSON.stringify(bevroren));
  const leeg = beoordeelPaginering(met({}, { aantalVellen: 0 }));
  check("geen enkel vel → weigeren (niet eeuwig wachten)", leeg.soort === "weiger" && /geen enkel vel/.test(leeg.reden), JSON.stringify(leeg));
  // Een geplande slag gaat vóór "geen vellen": het rapport kan nog vol lopen.
  const geplandLeeg = beoordeelPaginering(met({}, { aantalVellen: 0, timerGepland: true }));
  check("geen vellen maar een slag gepland → eerst wachten", geplandLeeg.soort === "wacht", JSON.stringify(geplandLeeg));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] beoordeelRekenVoorwaarden — wachten, weigeren of printen");
{
  const vers = {
    heeftModel: true, heeftResultaten: true, rekenfout: null,
    herberekeningGepland: false, lopendeRekengangen: 0, toetsingLoopt: false,
    toetsfout: null, toetsingGedraaid: true, toetsingHoortBijResultaten: true,
    toetsbareStaven: true, analysetype: "eersteOrde", resultatenUitVolledigeRekengang: true,
  };
  const met = (p) => ({ ...vers, ...p });
  check("verse berekening en toetsing → ok", beoordeelRekenVoorwaarden(vers).soort === "ok");

  const wachten = [
    ["rekengang loopt", { lopendeRekengangen: 1 }],
    ["herberekening gepland", { herberekeningGepland: true }],
    ["toetsing loopt", { toetsingLoopt: true }],
    // Wachten gaat VÓÓR weigeren: direct na een modelwijziging zijn de
    // resultaten gewist én staat de herberekening gepland — dat is geen
    // "geen berekening", dat is "even geduld".
    ["gepland terwijl de resultaten al gewist zijn", { herberekeningGepland: true, heeftResultaten: false, toetsingGedraaid: false }],
  ];
  for (const [naam, p] of wachten) {
    const o = beoordeelRekenVoorwaarden(met(p));
    check(`${naam} → wacht`, o.soort === "wacht", JSON.stringify(o));
  }

  const weigeren = [
    ["geen model", { heeftModel: false }, /geen model/],
    ["rekenfout", { rekenfout: "kolom knikt", heeftResultaten: false }, /mislukte: kolom knikt/],
    ["geen resultaten", { heeftResultaten: false }, /geen resultaten.*`rekenen`/],
    ["toetsfout", { toetsfout: "kern onbereikbaar" }, /toetsing gaf een fout: kern onbereikbaar/],
    ["fysisch zonder volledige rekengang", { analysetype: "tweedeOrdeFysisch", resultatenUitVolledigeRekengang: false }, /fysisch niet-lineaire ronde/],
    ["toetsbare staven, geen toetsing", { toetsingGedraaid: false }, /toetsing ontbreekt/],
    ["toetsing hoort bij een andere berekening", { toetsingHoortBijResultaten: false }, /verouderd/],
  ];
  for (const [naam, p, reden] of weigeren) {
    const o = beoordeelRekenVoorwaarden(met(p));
    check(`${naam} → weiger met reden`, o.soort === "weiger" && reden.test(o.reden), JSON.stringify(o));
  }

  // DE GELDIGE UITZONDERING. Zonder toetsbare staven keert de toetsing terug
  // zonder te draaien; lastRunAt blijft leeg. Dat mag geen weigering geven.
  const zonder = beoordeelRekenVoorwaarden(met({
    toetsbareStaven: false, toetsingGedraaid: false, toetsingHoortBijResultaten: false,
  }));
  check("model zonder toetsbare staven, zonder toetsing → ok", zonder.soort === "ok", JSON.stringify(zonder));
  // Bij de andere analysetypen is de herkomst van de resultaten niet relevant:
  // de toets-knop rekent dan hetzelfde door als de knop Berekenen.
  const geo = beoordeelRekenVoorwaarden(met({ analysetype: "tweedeOrdeGeometrisch", resultatenUitVolledigeRekengang: false }));
  check("P-Δ zonder volledige rekengang → ok", geo.soort === "ok", JSON.stringify(geo));
  const fys = beoordeelRekenVoorwaarden(met({ analysetype: "tweedeOrdeFysisch" }));
  check("fysisch uit de volledige rekengang → ok", fys.soort === "ok", JSON.stringify(fys));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] leesExportOpties — strikte argumenten, kop zonder lekken");
{
  const o = leesExportOpties({
    type: "beperkt", formaat: "A3", orientatie: "landscape",
    project: { naam: "Loods Noord", nummer: "P-12", datum: "2026-09-15" },
    tijdslimiet_ms: 5_000,
  });
  check("type, formaat en oriëntatie gelezen",
    o.type === "beperkt" && o.formaat === "A3" && o.orientatie === "landscape", JSON.stringify(o));
  check("projectvelden vertaald, niet genoemde velden leeg",
    o.kop && o.kop.name === "Loods Noord" && o.kop.projectNumber === "P-12" && o.kop.date === "2026-09-15"
      && o.kop.engineer === "" && o.kop.company === "", JSON.stringify(o.kop));
  const leeg = leesExportOpties({});
  check("zonder argumenten: niets overschreven",
    leeg.type === null && leeg.formaat === null && leeg.orientatie === null && leeg.kop === null
      && leeg.tijdslimietMs === 120_000, JSON.stringify(leeg));
  check("tijdslimiet begrensd op 1 s … 600 s",
    leesExportOpties({ tijdslimiet_ms: 1 }).tijdslimietMs === 1_000
      && leesExportOpties({ tijdslimiet_ms: 9e9 }).tijdslimietMs === 600_000);
  const fouten = [
    ["onbekend argument", { rapporttype: "beperkt" }, /onbekend argument `rapporttype`/],
    ["onbekend type", { type: "kort" }, /`type` moet een van volledig \| beperkt/],
    ["onbekend formaat", { formaat: "A5" }, /`formaat`/],
    ["onbekende oriëntatie", { orientatie: "staand" }, /`orientatie`/],
    ["onbekend projectveld", { project: { name: "Engels" } }, /project\.name/],
    ["project geen object", { project: "Loods" }, /object/],
    ["projectveld geen tekst", { project: { nummer: 12 } }, /project\.nummer/],
  ];
  for (const [naam, args, reden] of fouten) {
    const fout = gooit(() => leesExportOpties(args));
    check(`${naam} → fout met naam`, fout !== null && reden.test(fout), fout ?? "geen fout");
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] vergelijkExportMoment — veranderde er iets tussen klaar en afdruk?");
{
  const voor = { generatie: 7, slagen: 12, aantalVellen: 9, toetsingOp: 1234, weergave: "report" };
  check("niets veranderd → null", vergelijkExportMoment(voor, { ...voor }) === null);
  const gevallen = [
    ["weergave gewisseld", { weergave: "default" }, /weergave/],
    ["model gewijzigd", { generatie: 8 }, /model of de rekengang/],
    ["toetsing opnieuw", { toetsingOp: 5678 }, /toetsing/],
    ["opnieuw gepagineerd", { slagen: 13 }, /opnieuw gepagineerd \(slag 12 → 13\)/],
    ["ander aantal vellen", { aantalVellen: 10 }, /aantal vellen/],
  ];
  for (const [naam, p, reden] of gevallen) {
    const r = vergelijkExportMoment(voor, { ...voor, ...p });
    check(`${naam} → reden`, r !== null && reden.test(r), r ?? "null");
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] kopMetOverschrijving — de kop van één export");
{
  const vorigProject = {
    ...EMPTY_PROJECT_INFO,
    name: "Project A", projectNumber: "A-1", engineer: "Ing. A", company: "Bureau A",
    date: "2026-01-01", description: "Omschrijving van A", location: "Plaats A",
    reportHeader: "Briefhoofd A", notes: "Notitie A",
    uitgangspunten: { gevolgklasse: "CC3", levensduurklasse: 4 },
  };
  check("zonder overschrijving: de projectgegevens zelf", kopMetOverschrijving(vorigProject, null) === vorigProject);
  const kop = { name: "Project B", projectNumber: "B-2", engineer: "", company: "Bureau B", date: "2026-09-15" };
  const b = kopMetOverschrijving(vorigProject, kop);
  check("naam, nummer, bedrijf en datum uit de export",
    b.name === "Project B" && b.projectNumber === "B-2" && b.company === "Bureau B" && b.date === "2026-09-15");
  check("niets van project A lekt in de kop (omschrijving, locatie, briefhoofd, constructeur)",
    b.description === "" && b.location === "" && b.reportHeader === "" && b.engineer === "" && b.notes === "",
    JSON.stringify(b));
  check("de uitgangspunten blijven die waarmee gerekend is",
    b.uitgangspunten === vorigProject.uitgangspunten);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Bronteksten — kanaal en knop zijn één weg");
{
  const bediening = readFileSync(join(HIER, "src", "bediening", "bediening.ts"), "utf8");
  const app = readFileSync(join(HIER, "src", "App.tsx"), "utf8");
  const preview = readFileSync(join(HIER, "src", "components", "panels", "ReportPreview.tsx"), "utf8");
  const shell = readFileSync(join(HIER, "src", "components", "report", "ReportShell.tsx"), "utf8");

  const rekenen = /case "rekenen": \{([\s\S]*?)\n    \}/.exec(bediening)?.[1] ?? "";
  check("`rekenen` via het kanaal roept rekenDoor aan (de knop Berekenen)",
    /a\(\)\.rekenDoor\(\)/.test(rekenen), "geen a().rekenDoor() in case rekenen");
  check("… en niet meer alleen computeAndStoreSolverOutputs",
    !/computeAndStoreSolverOutputs\s*\(/.test(rekenen) && !/computeAndStoreSolverOutputs\s*:/.test(bediening));
  check("App.tsx: rekenDoor geeft een belofte (Promise<RekengangUitkomst>)",
    /const rekenDoor = useCallback\(\(\): Promise<RekengangUitkomst> =>/.test(app));
  check("App.tsx: de bediening krijgt rekenDoor en de rekentoestand",
    /useBediening\(\{[\s\S]{0,400}?rekenDoor,[\s\S]{0,200}?rekenToestand:/.test(app));
  check("App.tsx: de geplande herberekening is leesbaar (herberekeningGeplandRef)",
    /herberekeningGeplandRef\.current = true;[\s\S]{0,200}?window\.setTimeout/.test(app));
  check("zijbalk en export delen pasRapportTypeToe",
    /pasRapportTypeToe\(type\)/.test(preview) && /pasRapportTypeToe\(opties\.type\)/.test(
      readFileSync(join(HIER, "src", "bediening", "rapportExport.ts"), "utf8")));
  check("ReportShell toont de kop via useRapportProjectInfo (met de kop van de export)",
    /const info = useRapportProjectInfo\(\);/.test(shell));
  check("ReportShell plant een vervolgslag zolang de inhoudsopgave niet stabiel is",
    /if \(!tocToestand\(\)\.stabiel\) planRef\.current\(HERPAGINEER_MS, "inhoudsopgave bijgesteld"\);/.test(shell));
  const paginate = readFileSync(join(HIER, "src", "components", "report", "paginate.ts"), "utf8");
  check("paginate.ts meet px/mm buiten de geobserveerde meetcontainer (anders eeuwig herpagineren)",
    /pxPerMm\(o\.meet\.parentElement \?\? document\.body\)/.test(paginate) && !/pxPerMm\(o\.meet\)/.test(paginate));
}

log(`\nrapport-gereedheid: ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
