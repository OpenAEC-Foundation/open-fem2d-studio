// Combinatieselectie — welke belastingcombinaties een model werkelijk nodig
// heeft, en wanneer de app er met haar handen vanaf blijft.
//
// WAT HIER VASTLIGT
// `defaultCombinations()` levert acht combinaties. Twee daarvan — de frequente
// (6.15, id 7) en de quasi-blijvende (6.16, id 8) BGT-combinatie — worden bij
// een zuivere staalconstructie door geen enkele toets gelezen: de
// doorbuigingstoets van staal gebruikt de karakteristieke (6.14). 6.15 voedt
// de SCHEURBEHEERSING van beton (EN 1992-1-1 §7.3; de nationale bijlage bij
// 7.3.1(5) schrijft juist die combinatie voor) en 6.16 de kruipvervorming van
// hout en de BGT-tak van de betonstijfheid. `selecteerCombinaties` laat ze bij
// zuiver staal weg, mét reden.
//
// SINDS SEPTEMBER 2026 IS 6.15 GEEN LOZE COMBINATIE MEER. Tot dan las geen
// enkele toets haar; nu hangt de scheurwijdte van elke betonstaaf eraan.
// Wegvallen bij een model MET beton kost dus een toets — vandaar dat blok [4]
// haar terugkomst apart vastpint.
//
// DE DRIE MANIEREN WAAROP DIT MIS KAN GAAN, en die hier alle drie afgedekt zijn:
//
//  1. Het weglaten grijpt te breed. Eén houten of betonnen staaf erbij en de
//     twee combinaties zijn weer nodig; verdwijnen ze dan tóch, dan valt de
//     kruipvervorming van die houten staaf stil terug op de volle last.
//  2. Het weglaten pakt werk van de gebruiker af. Een hernoemde of bijgestelde
//     combinatie is ZIJN combinatie en blijft staan, ook in zuiver staal.
//  3. Het weglaten is een mutatie in plaats van een afleiding. De functie mag
//     de meegegeven lijst niet aanraken: het projectbestand draagt de volledige
//     lijst, zodat een later toegevoegde houten staaf de combinatie terugbrengt.
//
// Draaien met: npx tsx test-combinatieselectie.mjs

const { defaultCombinations } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { selecteerCombinaties, isZuivereStaalconstructie } = await import(
  "./src/lib/combinatieSelectie.ts"
);

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}

function checkGelijk(naam, actueel, verwacht) {
  const ok = JSON.stringify(actueel) === JSON.stringify(verwacht);
  if (ok) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(actueel)}`); }
  else { failed++; log(`  ✗ ${naam}: ${JSON.stringify(actueel)} vs ${JSON.stringify(verwacht)}`); }
}

/** De twee combinaties die bij zuiver staal mogen wegvallen. */
const BUITEN_STAAL = [7, 8];

const staal = (id) => ({ id, from: 1, to: 2, material: "S235", profile: "IPE300" });
const hout = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "100x200" });
const beton = (id) => ({ id, from: 1, to: 2, material: "C30/37", profile: "300x500" });
const clt = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "CLT 40/20/40" });
const eigenStaal = (id) => ({ id, from: 1, to: 2, material: "S355", profile: "EIGEN:koker" });
const vrij = (id) => ({ id, from: 1, to: 2, material: "E=15000", profile: "200x200" });
const ids = (lijst) => lijst.map((c) => c.id);

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Zuiver staal: 6.15 en 6.16 vallen weg, de rest blijft");
{
  const alles = defaultCombinations();
  const s = selecteerCombinaties(alles, [staal(1), staal(2), staal(3)]);
  checkGelijk("actieve combinaties", ids(s.actief), [1, 2, 3, 4, 5, 6]);
  checkGelijk("overgeslagen", s.overgeslagen.map((o) => o.id), BUITEN_STAAL);
  checkWaar("de karakteristieke BGT (6.14, id 6) blijft — die voedt de doorbuigingstoets",
    s.actief.some((c) => c.id === 6));
  checkWaar("elke overgeslagen combinatie draagt een reden",
    s.overgeslagen.every((o) => typeof o.reden === "string" && o.reden.length > 40));
  checkWaar("de reden noemt de norm-uitdrukking",
    s.overgeslagen.some((o) => o.reden.includes("6.15")) &&
    s.overgeslagen.some((o) => o.reden.includes("6.16")));
  checkWaar("de reden zegt hoe je hem terugkrijgt",
    s.overgeslagen.every((o) => /houten of betonnen staaf/.test(o.reden)));
  // De reden bij 6.15 hoort te noemen WAT er verloren gaat. "Door geen enkele
  // toets gelezen" was waar tot §7.3 er was; blijft die tekst staan, dan leest
  // een gebruiker dat een combinatie overbodig is terwijl zijn scheurwijdte
  // eraan hangt.
  checkWaar("de reden bij 6.15 noemt de scheurbeheersing van beton",
    /scheurbeheersing/.test(s.redenPerId.get(7) ?? ""));
  checkWaar("de reden bij 6.15 noemt het artikel",
    /7\.3/.test(s.redenPerId.get(7) ?? ""));
  checkWaar("redenPerId is opzoekbaar voor de lijstweergave",
    s.redenPerId.get(7) === s.overgeslagen[0].reden && s.redenPerId.size === 2);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De lijst zelf wordt niet aangeraakt (afleiding, geen mutatie)");
{
  const alles = defaultCombinations();
  const voor = alles.map((c) => c.id);
  const s = selecteerCombinaties(alles, [staal(1)]);
  checkGelijk("de meegegeven lijst is ongewijzigd", alles.map((c) => c.id), voor);
  checkWaar("het projectbestand houdt dus alle acht combinaties", alles.length === 8);
  checkWaar("en de selectie is een NIEUWE array", s.actief !== alles);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Gemengd model: één niet-stalen staaf houdt ze allebei");
{
  for (const [naam, staaf] of [
    ["hout (C24)", hout(2)],
    ["beton (C30/37)", beton(2)],
    ["kruislaaghout (CLT)", clt(2)],
    ["vrij materiaal (spanningstoets)", vrij(2)],
    ["onbekend materiaal/profiel", { id: 2, from: 1, to: 2, material: "??", profile: "??" }],
  ]) {
    const s = selecteerCombinaties(defaultCombinations(), [staal(1), staaf]);
    checkWaar(`staal + ${naam} → alle acht combinaties`,
      s.actief.length === 8 && s.overgeslagen.length === 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Terugkomen: een houten staaf toevoegen brengt ze terug");
{
  const alles = defaultCombinations();
  const staalModel = [staal(1), staal(2)];
  const eerst = selecteerCombinaties(alles, staalModel);
  const daarna = selecteerCombinaties(alles, [...staalModel, hout(3)]);
  checkWaar("eerst zes", eerst.actief.length === 6);
  checkWaar("na het toevoegen van hout weer acht", daarna.actief.length === 8);
  checkWaar("de quasi-blijvende (6.16) is er weer — anders zou de kruip stil terugvallen",
    daarna.actief.some((c) => c.id === 8));

  // EN MET BETON DE FREQUENTE (6.15). Die combinatie voedt sinds §7.3 de
  // scheurwijdtetoets; valt zij weg, dan komt die toets als "niet uitgevoerd"
  // in het rapport terwijl er niets aan de hand is.
  const metBeton = selecteerCombinaties(alles, [...staalModel, beton(4)]);
  checkWaar("na het toevoegen van beton weer acht", metBeton.actief.length === 8);
  checkWaar("de frequente (6.15) is er weer — anders vervalt de scheurwijdtetoets",
    metBeton.actief.some((c) => c.id === 7));
  checkWaar("de quasi-blijvende (6.16) ook", metBeton.actief.some((c) => c.id === 8));
  checkWaar("er wordt niets overgeslagen zodra er beton in staat",
    metBeton.overgeslagen.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Aangepaste combinaties blijven met rust");
{
  // Hernoemd
  const hernoemd = defaultCombinations();
  hernoemd[6] = { ...hernoemd[6], name: "BGT frequent (eigen keuze)" };
  const a = selecteerCombinaties(hernoemd, [staal(1)]);
  checkGelijk("hernoemde 6.15 blijft, ongewijzigde 6.16 valt weg",
    a.overgeslagen.map((o) => o.id), [8]);

  // Factor bijgesteld
  const bijgesteld = defaultCombinations();
  bijgesteld[7] = { ...bijgesteld[7], factors: new Map([[1, 1.0], [2, 0.5]]) };
  const b = selecteerCombinaties(bijgesteld, [staal(1)]);
  checkGelijk("bijgestelde 6.16 blijft, ongewijzigde 6.15 valt weg",
    b.overgeslagen.map((o) => o.id), [7]);

  // Een geval eruit gehaald (kleinere factorenkaart)
  const uitgedund = defaultCombinations();
  uitgedund[6] = { ...uitgedund[6], factors: new Map([[1, 1.0]]) };
  const c = selecteerCombinaties(uitgedund, [staal(1)]);
  checkGelijk("uitgedunde 6.15 blijft", c.overgeslagen.map((o) => o.id), [8]);

  // Formule aangepast (wat de gebruiker leest, telt ook mee)
  const anderFormule = defaultCombinations();
  anderFormule[7] = { ...anderFormule[7], formula: "G + 0,3·Q (projectkeuze)" };
  const d = selecteerCombinaties(anderFormule, [staal(1)]);
  checkGelijk("aangepaste formule blijft", d.overgeslagen.map((o) => o.id), [7]);

  // Zelf toegevoegde combinatie met hetzelfde id-bereik
  const eigen = [
    ...defaultCombinations(),
    { id: 9, name: "BGT eigen", type: "sls", formula: "G + Q", factors: new Map([[1, 1], [2, 1]]) },
  ];
  const e = selecteerCombinaties(eigen, [staal(1)]);
  checkWaar("een eigen combinatie erbij verandert niets aan het oordeel over de standaardtwee",
    e.actief.length === 7 && e.actief.some((c2) => c2.id === 9) && e.overgeslagen.length === 2);

  // Volledig eigen lijst (zoals de windgenerator die schrijft)
  const windAchtig = [
    { id: 1, name: "UGT — wind leidend", type: "uls", formula: "1,2G + 1,5W", factors: new Map([[1, 1.2], [4, 1.5]]) },
    { id: 7, name: "BGT karakteristiek — wind leidend", type: "sls", formula: "G + W", factors: new Map([[1, 1], [4, 1]]) },
    { id: 8, name: "BGT karakteristiek — sneeuw leidend", type: "sls", formula: "G + S", factors: new Map([[1, 1], [3, 1]]) },
  ];
  const f = selecteerCombinaties(windAchtig, [staal(1)]);
  checkWaar("een eigen lijst wordt nooit opgeruimd, ook niet op id 7 en 8",
    f.actief.length === 3 && f.overgeslagen.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Wat telt als 'zuiver staal'");
{
  checkWaar("catalogusprofiel + S235", isZuivereStaalconstructie([staal(1)]));
  checkWaar("eigen doorsnede uit de profieleditor is staal",
    isZuivereStaalconstructie([eigenStaal(1)]));
  checkWaar("een model zónder staven is géén bewijs van staal",
    isZuivereStaalconstructie([]) === false);
  checkWaar("hout is geen staal", isZuivereStaalconstructie([hout(1)]) === false);
  checkWaar("stalen plaat (E = 210000) telt mee als staal",
    isZuivereStaalconstructie([staal(1)], [{ id: 1, nodeIds: [1, 2, 3, 4] }]));
  checkWaar("plaat met expliciete staal-E telt ook mee",
    isZuivereStaalconstructie([staal(1)], [{ id: 1, nodeIds: [1, 2, 3, 4], E: 210000 }]));
  checkWaar("plaat met een andere E-modulus houdt de combinaties aan",
    isZuivereStaalconstructie([staal(1)], [{ id: 1, nodeIds: [1, 2, 3, 4], E: 33000 }]) === false);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Leeg model en lege lijst leveren geen verrassingen");
{
  const leeg = selecteerCombinaties(defaultCombinations(), []);
  checkWaar("geen staven → niets wordt weggelaten",
    leeg.actief.length === 8 && leeg.overgeslagen.length === 0);
  const geen = selecteerCombinaties([], [staal(1)]);
  checkWaar("lege combinatielijst blijft leeg zonder te klagen",
    geen.actief.length === 0 && geen.overgeslagen.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Dezelfde beslissing langs de sidecar (de MCP-weg)");
{
  // Hetzelfde model hoort langs elke weg hetzelfde antwoord te geven: zou de
  // sidecar wél acht combinaties doorrekenen, dan levert een MCP-solve andere
  // getallen dan het scherm van de constructeur.
  const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
  const portaal = (staven) => ({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 4000 },
      { id: 3, x: 6000, z: 4000 }, { id: 4, x: 6000, z: 0 },
    ],
    beams: staven,
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }],
    plates: [],
    loadCases: [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live" }],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -10 },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 2, q: -6 },
    ],
    selfWeightEnabled: false,
  });
  const stalenStaven = [
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE300" },
    { id: 3, from: 3, to: 4, material: "S235", profile: "HEA160" },
  ];
  // Geen `combinations` in de payload en geen projectbestand → de sidecar valt
  // terug op defaultCombinations(), precies zoals de store bij een nieuw model.
  const solve = (staven) =>
    verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model: portaal(staven) } });

  const staalUit = solve(stalenStaven);
  checkWaar("de solve slaagt", staalUit.ok === true, JSON.stringify(staalUit.error ?? {}));
  const r = staalUit.result ?? {};
  checkGelijk("zes doorgerekende combinaties",
    Object.keys(r.combinations ?? {}).map(Number), [1, 2, 3, 4, 5, 6]);
  checkGelijk("combinations_skipped noemt 6.15 en 6.16",
    (r.combinations_skipped ?? []).map((c) => c.id), BUITEN_STAAL);
  checkWaar("elke overgeslagen combinatie draagt naam én reden",
    (r.combinations_skipped ?? []).every((c) => c.name && c.reason?.length > 40));
  checkWaar("en het staat ook in de waarschuwingen — nooit stil",
    (r.warnings ?? []).filter((w) => w.includes("niet doorgerekend")).length === 2,
    JSON.stringify(r.warnings));

  const gemengd = solve([
    ...stalenStaven,
    { id: 4, from: 2, to: 3, material: "C24", profile: "100x200" },
  ]);
  const rg = gemengd.result ?? {};
  checkWaar("één houten staaf erbij → alle acht combinaties, niets overgeslagen",
    Object.keys(rg.combinations ?? {}).length === 8 &&
    (rg.combinations_skipped ?? []).length === 0);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
