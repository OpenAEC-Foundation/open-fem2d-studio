// Strenge modelvalidatie en Nederlandse foutafbeelding voor de MCP-sidecar.
//
// WAAROM DEZE TEST BESTAAT
// De rekenketen is vergevingsgezind op precies de verkeerde plek. Schrijf `qq`
// in plaats van `q` en de lijnlast valt in `bouwMultiInput` door alle takken
// heen: de solve SLAAGT en levert een raamwerk zonder die last. Voor een
// constructeur leest dat als "nul", niet als "er is iets misgegaan". Deze test
// legt drie dingen vast:
//
//   1. de AANLEIDING — dat de tikfout in de mapping daadwerkelijk stil
//      verdwijnt (zonder dat bewijs is de rest van deze test een mening);
//   2. de POORT      — dat onbekende velden geweigerd worden, op elk niveau,
//      met een melding die het veld noemt, en dat `solve` ze net zo hard
//      weigert als `validate` (een poort die alleen op de droogloop staat,
//      bewaakt niets);
//   3. de AFBEELDING — dat een bekende Engelse kernmelding Nederlands wordt en
//      dat een ONBEKENDE melding niet gegokt maar doorgegeven wordt.
//
// Draaien met: npx tsx test-validatie-mcp.mjs
//         of : node scripts/run-tests.mjs --filter=validatie-mcp

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { controleerVelden, valideerModel } from "./src/mcp/valideerModel.ts";
import { beeldKernfoutAf } from "./src/mcp/fouten.ts";
import { verwerkVerzoek } from "./src/mcp/sidecar.ts";
import { bouwMultiInput } from "./src/lib/modelNaarSolverInput.ts";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const HOUTEN_RAAMWERK = join(REPO, "voorbeelden", "houten-raamwerk.ifcfem2d");

let passed = 0;
let failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) {
    passed++;
    log(`  ✓ ${naam}${extra ? " — " + extra : ""}`);
  } else {
    failed++;
    log(`  ✗ ${naam}${extra ? " — " + extra : ""}`);
  }
}

/** Bevat één van de meldingen deze deeltekst? */
const noemt = (lijst, deel) => lijst.some((m) => m.includes(deel));

// ── Referentieportaal, plan §5.1 ───────────────────────────────────────────
// Portaal 6 × 4 m: kolommen HEA160, ligger IPE300, beide voeten ingeklemd.
const PORTAAL = () => ({
  nodes: [
    { id: 1, x: 0, z: 0 },
    { id: 2, x: 0, z: 4000 },
    { id: 3, x: 6000, z: 4000 },
    { id: 4, x: 6000, z: 0 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE300" },
    { id: 3, from: 3, to: 4, material: "S235", profile: "HEA160" },
  ],
  supports: [
    { nodeId: 1, type: "fixed" },
    { nodeId: 4, type: "fixed" },
  ],
  plates: [],
  loadCases: [
    { id: 1, name: "G", type: "dead" },
    { id: 2, name: "Q", type: "live" },
  ],
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -10 },
    { id: 2, type: "lineLoad", caseId: 2, beamId: 2, q: -6 },
  ],
  selfWeightEnabled: false,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
});

/** Portaal met één tikfout: `qq` in plaats van `q` op de eerste lijnlast. */
function portaalMetTikfout() {
  const m = PORTAAL();
  m.loads[0] = { id: 1, type: "lineLoad", caseId: 1, beamId: 2, qq: -10 };
  return m;
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De aanleiding: een tikfout verdwijnt stil in de mapping");
{
  const goed = bouwMultiInput(PORTAAL());
  const fout = bouwMultiInput(portaalMetTikfout());
  ok("het goede model levert twee lijnlasten", goed.loads.length === 2, String(goed.loads.length));
  ok(
    "`qq` levert er één minder op, zonder enige melding",
    fout.loads.length === 1,
    `${fout.loads.length} lijnlast(en) — de last met de tikfout is weg`,
  );
  ok(
    "belastinggeval 1 heeft daardoor geen enkele last meer",
    !fout.loads.some((l) => l.caseId === 1),
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De poort: onbekende velden worden geweigerd, niet genegeerd");
{
  const uitkomst = valideerModel(portaalMetTikfout());
  ok("ok = false", uitkomst.ok === false);
  ok("er is minstens één fout", uitkomst.errors.length > 0, String(uitkomst.errors.length));
  ok(
    "de melding noemt het veld `qq`",
    noemt(uitkomst.errors, "`qq`"),
    uitkomst.errors[0],
  );
  ok(
    "de melding wijst het juiste veld aan als bedoeling",
    noemt(uitkomst.errors, "Bedoelde u `q`?"),
    uitkomst.errors[0],
  );
  ok(
    "de melding noemt de plaats in de invoer",
    noemt(uitkomst.errors, "model.loads[0]"),
    uitkomst.errors[0],
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Onbekende velden op elk niveau van het model");
{
  const gevallen = [
    ["modelniveau", (m) => { m.eigenwijsVeld = 1; }, "`eigenwijsVeld`"],
    ["knoop", (m) => { m.nodes[0].y = 100; }, "model.nodes[0]"],
    ["staaf", (m) => { m.beams[0].materiaal = "S235"; }, "model.beams[0]"],
    ["oplegging", (m) => { m.supports[0].nodeid = 1; }, "model.supports[0]"],
    ["belastinggeval", (m) => { m.loadCases[0].naam = "G"; }, "model.loadCases[0]"],
    ["releases", (m) => { m.beams[0].releases = { startRz: true }; }, "releases"],
    ["checkConfig", (m) => { m.beams[0].checkConfig = { bucklingLength_m: 4 }; }, "checkConfig"],
  ];
  for (const [naam, mutatie, verwachtDeel] of gevallen) {
    const model = PORTAAL();
    mutatie(model);
    const uitkomst = valideerModel(model);
    ok(
      `onbekend veld op ${naam} wordt geweigerd`,
      uitkomst.ok === false && noemt(uitkomst.errors, verwachtDeel),
      (uitkomst.errors[0] ?? "(geen fout gemeld)"),
    );
  }
  // Hoofdlettergevoelig: `Q` is niet `q`.
  const model = PORTAAL();
  model.loads[0] = { id: 1, type: "lineLoad", caseId: 1, beamId: 2, Q: -10 };
  ok(
    "veldnamen zijn hoofdlettergevoelig (`Q` ≠ `q`)",
    valideerModel(model).ok === false,
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Types en toegestane waarden");
{
  const gevallen = [
    ["knoop zonder x", (m) => { delete m.nodes[0].x; }, "model.nodes[0].x"],
    ["knoop-id als tekst", (m) => { m.nodes[0].id = "1"; }, "model.nodes[0].id"],
    ["onbekend oplegtype", (m) => { m.supports[0].type = "vastgeklemd"; }, "model.supports[0].type"],
    ["onbekend lasttype", (m) => { m.loads[0].type = "lijnlast"; }, "model.loads[0].type"],
    ["fractie buiten 0..1", (m) => { m.loads[0].startFrac = 1.5; }, "startFrac"],
    ["qDir met verkeerde waarde", (m) => { m.loads[0].qDir = "y"; }, "qDir"],
    ["scheefstandRichting 0", (m) => { m.scheefstandRichting = 0; }, "scheefstandRichting"],
  ];
  for (const [naam, mutatie, verwachtDeel] of gevallen) {
    const model = PORTAAL();
    mutatie(model);
    const fouten = controleerVelden(model);
    ok(
      `${naam} wordt geweigerd`,
      fouten.length > 0 && noemt(fouten, verwachtDeel),
      (fouten[0] ?? "(geen fout gemeld)"),
    );
  }
  ok("een model dat geen object is wordt geweigerd", controleerVelden(null).length === 1);
  ok("het referentieportaal komt schoon door de veldpoort", controleerVelden(PORTAAL()).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Constructieve controles");
{
  const zonderSteun = PORTAAL();
  zonderSteun.supports = [];
  const u1 = valideerModel(zonderSteun);
  ok("model zonder opleggingen is een mechanisme", u1.ok === false && noemt(u1.errors, "mechanisme"), u1.errors[0]);

  const alleenVerticaal = PORTAAL();
  alleenVerticaal.supports = [
    { nodeId: 1, type: "zRoller" },
    { nodeId: 4, type: "zRoller" },
  ];
  const u2 = valideerModel(alleenVerticaal);
  ok(
    "alleen verticale steun: horizontaal mechanisme",
    u2.ok === false && noemt(u2.errors, "x-richting"),
    u2.errors[0],
  );

  const eenPunt = PORTAAL();
  eenPunt.supports = [{ nodeId: 1, type: "pinned" }];
  const u3 = valideerModel(eenPunt);
  ok(
    "één scharnier laat het geheel roteren",
    u3.ok === false && noemt(u3.errors, "roteert"),
    u3.errors[0],
  );

  const losDeel = PORTAAL();
  losDeel.nodes.push({ id: 5, x: 9000, z: 0 }, { id: 6, x: 9000, z: 2000 });
  losDeel.beams.push({ id: 4, from: 5, to: 6, material: "S235", profile: "HEA160" });
  const u4 = valideerModel(losDeel);
  ok(
    "een constructiedeel zonder oplegging wordt gemeld",
    u4.ok === false && noemt(u4.errors, "constructiedeel"),
    u4.errors.find((e) => e.includes("constructiedeel")),
  );

  const nulLengte = PORTAAL();
  nulLengte.nodes.push({ id: 5, x: 6000, z: 4000 });
  nulLengte.beams.push({ id: 4, from: 3, to: 5, material: "S235", profile: "HEA160" });
  const u5 = valideerModel(nulLengte);
  ok(
    "samenvallende knopen worden gemeld",
    u5.ok === false && noemt(u5.errors, "dezelfde"),
    u5.errors.find((e) => e.includes("dezelfde")),
  );
  ok(
    "een staaf met lengte nul wordt gemeld",
    noemt(u5.errors, "lengte nul"),
    u5.errors.find((e) => e.includes("lengte nul")),
  );

  const zelfdeKnoop = PORTAAL();
  zelfdeKnoop.beams.push({ id: 4, from: 2, to: 2, material: "S235", profile: "HEA160" });
  ok(
    "een staaf van een knoop naar zichzelf wordt gemeld",
    noemt(valideerModel(zelfdeKnoop).errors, "lengte nul"),
  );

  const dubbelId = PORTAAL();
  dubbelId.beams.push({ id: 2, from: 1, to: 4, material: "S235", profile: "HEA160" });
  ok(
    "dubbele staaf-id's worden gemeld",
    noemt(valideerModel(dubbelId).errors, "id 2"),
  );

  const onbekendProfiel = PORTAAL();
  onbekendProfiel.beams[1].profile = "IPE301";
  const u6 = valideerModel(onbekendProfiel);
  ok(
    "onbekend profiel wordt geweigerd i.p.v. stil vervangen door HEA 160",
    u6.ok === false && noemt(u6.errors, "IPE301") && noemt(u6.errors, "HEA 160"),
    u6.errors.find((e) => e.includes("IPE301")),
  );

  const losseKnoop = PORTAAL();
  losseKnoop.nodes.push({ id: 5, x: 3000, z: 6000 });
  const u7 = valideerModel(losseKnoop);
  ok(
    "een losse knoop is een waarschuwing, geen fout",
    u7.ok === true && noemt(u7.warnings, "Knoop 5"),
    u7.warnings.join(" | "),
  );

  const lastOpLosseKnoop = PORTAAL();
  lastOpLosseKnoop.nodes.push({ id: 5, x: 3000, z: 6000 });
  lastOpLosseKnoop.loads.push({ id: 3, type: "pointForce", caseId: 1, nodeId: 5, fz: -10 });
  const u8 = valideerModel(lastOpLosseKnoop);
  ok(
    "een last op een losse knoop is wél een fout (hij valt stil weg)",
    u8.ok === false && noemt(u8.errors, "valt bij het rekenen weg"),
    u8.errors.find((e) => e.includes("valt bij het rekenen weg")),
  );

  const veerZonderK = PORTAAL();
  veerZonderK.supports[1] = { nodeId: 4, type: "zSpring" };
  const u9 = valideerModel(veerZonderK);
  ok(
    "veer zonder stijfheid: waarschuwing dat hij star rekent",
    noemt(u9.warnings, "starre oplegging"),
    u9.warnings.join(" | "),
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Verwijzingen en lasten die niet meetellen");
{
  const gevallen = [
    ["staaf naar onbekende knoop", (m) => { m.beams[0].from = 99; }, "knoop 99"],
    ["oplegging op onbekende knoop", (m) => { m.supports[0].nodeId = 99; }, "knoop 99"],
    ["last op onbekend belastinggeval", (m) => { m.loads[0].caseId = 9; }, "belastinggeval 9"],
    ["last op onbekende staaf", (m) => { m.loads[0].beamId = 9; }, "staaf 9"],
    ["lijnlast zonder q", (m) => { delete m.loads[0].q; }, "telt dus niet mee"],
    ["thermische last zonder deltaT", (m) => {
      m.loads.push({ id: 3, type: "thermal", caseId: 1, beamId: 2 });
    }, "telt dus niet mee"],
  ];
  for (const [naam, mutatie, verwachtDeel] of gevallen) {
    const model = PORTAAL();
    mutatie(model);
    const uitkomst = valideerModel(model);
    ok(
      `${naam} wordt gemeld`,
      uitkomst.ok === false && noemt(uitkomst.errors, verwachtDeel),
      uitkomst.errors.find((e) => e.includes(verwachtDeel)) ?? uitkomst.errors[0],
    );
  }

  const leegGeval = PORTAAL();
  leegGeval.loads = leegGeval.loads.filter((l) => l.caseId !== 2);
  const u = valideerModel(leegGeval);
  ok(
    "belastinggeval zonder werkzame last is een waarschuwing",
    u.ok === true && noemt(u.warnings, "geen werkzame last"),
    u.warnings.join(" | "),
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Geldige modellen blijven schoon");
{
  const u = valideerModel(PORTAAL());
  ok("referentieportaal: ok", u.ok === true, u.errors.join(" | "));
  ok("referentieportaal: geen fouten", u.errors.length === 0, u.errors.join(" | "));
  ok("referentieportaal: geen waarschuwingen", u.warnings.length === 0, u.warnings.join(" | "));

  // Een écht projectbestand van de app moet door de veldpoort komen. Dit is de
  // bewaking op de veldlijsten zelf: raakt de lijst achter op `femTypes.ts`,
  // dan weigert de validatie ineens werk dat de app gewoon opslaat.
  const bestand = JSON.parse(readFileSync(HOUTEN_RAAMWERK, "utf8"));
  const uitBestand = {
    nodes: bestand.nodes,
    beams: bestand.beams,
    supports: bestand.supports,
    plates: bestand.plates ?? [],
    loadCases: bestand.loadCases,
    loads: bestand.loads,
    selfWeightEnabled: bestand.selfWeightEnabled ?? false,
    scheefstandEnabled: bestand.scheefstandEnabled ?? false,
    scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
    scheefstandRichting: bestand.scheefstandRichting ?? 1,
  };
  const veldFouten = controleerVelden(uitBestand);
  ok("voorbeeldproject komt door de veldpoort", veldFouten.length === 0, veldFouten.join(" | "));
  const uh = valideerModel(uitBestand);
  ok("voorbeeldproject is geldig", uh.ok === true, uh.errors.join(" | "));
  ok(
    "voorbeeldproject: lege belastinggevallen worden wél gemeld",
    uh.warnings.filter((w) => w.includes("geen werkzame last")).length === 3,
    uh.warnings.join(" | "),
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] De sidecar-bewerkingen: `validate` antwoordt, `solve` weigert");
{
  const vraag = (op, payload) => verwerkVerzoek({ v: 1, id: 1, op, payload });

  const goed = vraag("validate", { model: PORTAAL() });
  ok("validate op een geldig model: ok=true (protocol)", goed.ok === true);
  ok("validate meldt het model als geldig", goed.result?.ok === true, JSON.stringify(goed.result?.errors));
  ok("validate telt het model", goed.result?.counts?.beams === 3, String(goed.result?.counts?.beams));

  const fout = vraag("validate", { model: portaalMetTikfout() });
  ok("validate op een tikfout: protocol blijft ok=true", fout.ok === true);
  ok("validate meldt het model als ongeldig", fout.result?.ok === false);
  ok(
    "validate noemt het onbekende veld",
    (fout.result?.errors ?? []).some((e) => e.includes("`qq`")),
    (fout.result?.errors ?? [])[0],
  );

  const geweigerd = vraag("solve", { model: portaalMetTikfout() });
  ok("solve weigert het model", geweigerd.ok === false);
  ok("solve geeft INVOER_ONGELDIG", geweigerd.error?.code === "INVOER_ONGELDIG", geweigerd.error?.code);
  ok(
    "solve levert de volledige foutenlijst in `detail`",
    Array.isArray(geweigerd.error?.detail?.fouten) &&
      geweigerd.error.detail.fouten.some((e) => e.includes("`qq`")),
    JSON.stringify(geweigerd.error?.detail?.fouten),
  );
  ok(
    "solve legt uit dat weigeren de bedoeling is",
    /geweigerd, niet genegeerd/.test(geweigerd.error?.melding ?? ""),
    geweigerd.error?.melding,
  );

  const goedeSolve = vraag("solve", { model: PORTAAL() });
  ok("solve op het geldige model gaat gewoon door", goedeSolve.ok === true, goedeSolve.error?.melding ?? "");

  // De specifiekere melding over losse E/A/I houdt voorrang op de generieke
  // veldpoort: die zegt WAAROM een doorsnede niet los mag worden opgegeven.
  const metA = PORTAAL();
  metA.beams[0].A = 1234;
  const eigenDoorsnede = vraag("solve", { model: metA });
  ok(
    "losse `A` houdt zijn eigen melding over de doorsnede",
    eigenDoorsnede.ok === false && /doorsnede/.test(eigenDoorsnede.error?.melding ?? ""),
    eigenDoorsnede.error?.melding,
  );

  const validateOpProject = vraag("validate", {
    project: { inhoud: readFileSync(HOUTEN_RAAMWERK, "utf8") },
  });
  ok(
    "validate werkt ook op een projectbestand",
    validateOpProject.ok === true && validateOpProject.result?.ok === true,
    JSON.stringify(validateOpProject.result?.errors ?? validateOpProject.error),
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Nederlandse foutafbeelding van kernmeldingen");
{
  const engelse = [
    ["Model has no constraints - add boundary conditions", "opleggingen"],
    ["No loads applied - add forces to nodes", "belasting"],
    ["Model must have at least 2 nodes", "twee knopen"],
    ["Beam element has zero length", "lengte nul"],
    [
      "Insufficient constraints: 2 DOFs constrained, need at least 3 to prevent rigid body motion",
      "mechanisme",
    ],
    ["Matrix is singular or nearly singular at column 7", "singulier"],
    [
      "Second-order (P-Delta) analysis is unstable — the applied load is at or above the critical (buckling) load",
      "knik",
    ],
  ];
  for (const [origineel, verwachtDeel] of engelse) {
    const af = beeldKernfoutAf(origineel);
    ok(
      `herkend: "${origineel.slice(0, 40)}…"`,
      af.herkend === true &&
        af.code === "MODEL_ONOPLOSBAAR" &&
        af.melding.includes(verwachtDeel) &&
        af.melding !== origineel,
      `${af.code} — ${af.melding.slice(0, 70)}`,
    );
    ok(
      "  originele tekst blijft bewaard",
      af.detail.originele_melding === origineel,
    );
  }

  const metGetal = beeldKernfoutAf(
    "Insufficient constraints: 2 DOFs constrained, need at least 3 to prevent rigid body motion",
  );
  ok("het aantal uit de kernmelding komt mee", metGetal.melding.includes("2"), metGetal.melding);

  const kolom = beeldKernfoutAf("Matrix is singular or nearly singular at column 7");
  ok("het kolomnummer komt mee", kolom.melding.includes("7"), kolom.melding);

  const dimensie = beeldKernfoutAf("Matrix must be square");
  ok(
    "een dimensiefout is een programmafout, geen modelfout",
    dimensie.herkend === true && dimensie.code === "INTERN",
    dimensie.code,
  );

  const nederlands = "Plaat 3: de meshcache is beschadigd. Wijzig de plaat.";
  const doorgegeven = beeldKernfoutAf(nederlands);
  ok(
    "een al Nederlandse engine-melding gaat ongewijzigd door",
    doorgegeven.herkend === true &&
      doorgegeven.code === "MODEL_ONOPLOSBAAR" &&
      doorgegeven.melding === nederlands,
    doorgegeven.melding,
  );

  const onbekend = beeldKernfoutAf("Something nobody anticipated went wrong");
  ok("een onbekende melding wordt niet gegokt", onbekend.herkend === false);
  ok("een onbekende melding krijgt code INTERN", onbekend.code === "INTERN", onbekend.code);
  ok(
    "de originele tekst van een onbekende melding blijft bewaard",
    onbekend.detail.originele_melding === "Something nobody anticipated went wrong",
  );
  ok(
    "de melding claimt niets over de constructie",
    !/onoplosbaar/i.test(onbekend.melding),
    onbekend.melding,
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
