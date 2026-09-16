// Combinatieselectie — welke belastingcombinaties een model werkelijk nodig
// heeft, en wanneer de app er met haar handen vanaf blijft.
//
// WAT HIER VASTLIGT
// `defaultCombinations()` levert voor de vier startgevallen vierentwintig
// combinaties (sinds september 2026 afgeleid uit de gevallen, in elke
// opstelling van het veranderlijke geval — zie normcombinaties.ts en blok [2]
// van test-belastingcombinaties.mjs). Zeven daarvan — de frequente (6.15b,
// id 18–22: Q leidend, S en W leidend met en zonder Q) en de quasi-blijvende
// (6.16b, id 23–24: met en zonder Q) BGT-combinatie — worden bij een zuivere
// staalconstructie ZONDER vloer- of dakeis (alleen overwegend verticale staven
// zonder gekozen doorbuigingsklasse) door geen enkele toets gelezen: de
// zijdelingse eis van NEN-EN 1990 A1.4.3(7) gebruikt de karakteristieke
// (6.14b). 6.15 voedt de SCHEURBEHEERSING van beton (EN 1992-1-1 §7.3; de
// nationale bijlage bij 7.3.1(5) schrijft juist die combinatie voor) en 6.16
// de kruipvervorming van hout en de BGT-tak van de betonstijfheid.
// `selecteerCombinaties` laat ze in dat geval weg, mét reden.
//
// ZODRA ÉÉN STAAF DE VLOER- OF DAKEIS KRIJGT, BLIJVEN ZE (issue #10). Tot
// september 2026 vielen ze in élke zuivere staalconstructie weg, omdat staal
// geen kruip kent. Maar A1.4.3(4) schrijft voor w_max de quasi-blijvende
// combinatie voor "bij zowel vloeren als daken", en A1.4.3(3) voor w₂ + w₃ van
// een vloer de frequente — los van kruip. Een stalen ligger zag daardoor alleen
// G (3,995 mm) waar G + ψ₂·Q (5,793 mm) hoort; blok [1b] pint dat vast, en
// test-blijvende-zakking.mjs blok [6] rekent het na tot in de kern.
//
// OP ÉÉN NA, SINDS SEPTEMBER 2026. Id 24 — 6.16b zonder Q — is "alleen de
// blijvende belasting", en daar leest de STAALtoetsing w₁ uit: de zakking die
// NEN-EN 1990:2002/NB:2019 A1.4.3(2) van w_tot aftrekt om w₂ + w₃ te krijgen
// (figuur NB.1). Viel zij weg, dan kreeg w_add in zuiver staal weer de volledige
// zakking. Zij blijft dus altijd staan; de andere zes vallen nog wel weg. Daarom
// staan hieronder zes overgeslagen combinaties waar er tot dan zeven stonden.
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

/** De combinaties die bij zuiver staal mogen wegvallen. */
// Id's in de standaardset van de vier startgevallen (G, Q, S, W): 18 is de
// frequente met Q leidend, 19–20 met S leidend (met en zonder Q), 21–22 met W
// leidend (met en zonder Q); 23 de quasi-blijvende met Q. Id 24 — de
// quasi-blijvende ZONDER Q, dus alleen G — valt niet weg: zij levert w₁ aan de
// staaldoorbuiging (zie de kop).
const BUITEN_STAAL = [18, 19, 20, 21, 22, 23];
const BLIJVEND = 24;

const staal = (id) => ({ id, from: 1, to: 2, material: "S235", profile: "IPE300" });
const hout = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "100x200" });
const beton = (id) => ({ id, from: 1, to: 2, material: "C30/37", profile: "300x500" });
const clt = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "CLT 40/20/40" });
const eigenStaal = (id) => ({ id, from: 1, to: 2, material: "S355", profile: "EIGEN:koker" });
const vrij = (id) => ({ id, from: 1, to: 2, material: "E=15000", profile: "200x200" });
const ids = (lijst) => lijst.map((c) => c.id);

// Knopen: staaf 1 → 2 staat bij KOLOM verticaal (90°), bij LIGGER horizontaal.
// De vraag "krijgt een staaf een vloer- of dakeis" hangt aan die stand.
const KOLOM = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 4000 }];
const LIGGER = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }];
const metKnopen = (nodes) => ({ nodes });

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Zuiver staal, alleen kolommen: 6.15b en 6.16b vallen weg, op 6.16b zonder Q na; de rest blijft");
{
  const alles = defaultCombinations();
  const s = selecteerCombinaties(alles, [staal(1), staal(2), staal(3)], [], metKnopen(KOLOM));
  checkGelijk("actieve combinaties", ids(s.actief), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, BLIJVEND]);
  checkGelijk("overgeslagen", s.overgeslagen.map((o) => o.id), BUITEN_STAAL);
  checkWaar("de karakteristieke BGT (6.14b, id 13–17) blijft — die voedt de doorbuigingstoets",
    [13, 14, 15, 16, 17].every((id) => s.actief.some((c) => c.id === id)));
  const blijvend = s.actief.find((c) => c.id === BLIJVEND);
  checkWaar("6.16b zonder Q (id 24, alleen G) blijft — die levert w₁ voor w_add = w_tot − w₁",
    blijvend !== undefined && blijvend.factors.size === 1 && blijvend.factors.get(1) === 1,
    blijvend?.name);
  checkWaar("elke overgeslagen combinatie draagt een reden",
    s.overgeslagen.every((o) => typeof o.reden === "string" && o.reden.length > 40));
  checkWaar("de reden noemt de norm-uitdrukking",
    s.overgeslagen.some((o) => o.reden.includes("6.15")) &&
    s.overgeslagen.some((o) => o.reden.includes("6.16")));
  checkWaar("de reden zegt hoe je hem terugkrijgt",
    s.overgeslagen.every((o) => /houten of betonnen staaf/.test(o.reden) && /doorbuigingsklasse/.test(o.reden)));
  checkWaar("de reden noemt waarom: alleen de zijdelingse eis A1.4.3(7)",
    s.overgeslagen.every((o) => /A1\.4\.3\(7\)/.test(o.reden)));
  // De reden bij 6.15 hoort te noemen WAT er verloren gaat. "Door geen enkele
  // toets gelezen" was waar tot §7.3 er was; blijft die tekst staan, dan leest
  // een gebruiker dat een combinatie overbodig is terwijl zijn scheurwijdte
  // eraan hangt.
  checkWaar("de reden bij 6.15 noemt de scheurbeheersing van beton",
    /scheurbeheersing/.test(s.redenPerId.get(18) ?? ""));
  checkWaar("de reden bij 6.15 noemt het artikel",
    /7\.3/.test(s.redenPerId.get(18) ?? ""));
  checkWaar("redenPerId is opzoekbaar voor de lijstweergave",
    s.redenPerId.get(18) === s.overgeslagen[0].reden && s.redenPerId.size === 6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1b] Zuiver staal met een vloer- of dakeis: niets valt weg (issue #10)");
{
  // NEN-EN 1990 A1.4.3(4): w_max bij de quasi-blijvende combinatie (6.16b),
  // "bij zowel vloeren als daken"; A1.4.3(3): w₂ + w₃ van een vloer bij de
  // frequente (6.15b). De staalbouwer weegt ze allebei.
  const alles = defaultCombinations();
  const ligger = selecteerCombinaties(alles, [staal(1)], [], metKnopen(LIGGER));
  checkWaar("stalen ligger → alle vierentwintig combinaties, niets overgeslagen",
    ligger.actief.length === 24 && ligger.overgeslagen.length === 0, ids(ligger.overgeslagen).join(","));
  checkWaar("de quasi-blijvende MET ψ₂·Q (6.16b, id 23) is actief",
    ligger.actief.some((c) => c.id === 23 && c.factors.get(2) > 0 && c.factors.get(2) < 1), JSON.stringify([...alles[22].factors]));
  checkWaar("de frequente (6.15b, id 18–22) is actief",
    [18, 19, 20, 21, 22].every((id) => ligger.actief.some((c) => c.id === id)));

  const kolomMetKlasse = { ...staal(1), checkConfig: { deflectionClass: "floor" } };
  const k = selecteerCombinaties(alles, [kolomMetKlasse], [], metKnopen(KOLOM));
  checkWaar("verticale staaf MET gekozen doorbuigingsklasse → vloer-/dakeis, niets overgeslagen",
    k.actief.length === 24 && k.overgeslagen.length === 0);

  const portaal = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 4000 }, { id: 3, x: 6000, z: 4000 },
  ];
  const p = selecteerCombinaties(alles,
    [{ ...staal(1), from: 1, to: 2 }, { ...staal(2), from: 2, to: 3 }], [], metKnopen(portaal));
  checkWaar("kolom + ligger → de ligger vraagt ze, niets overgeslagen",
    p.actief.length === 24 && p.overgeslagen.length === 0);

  const schuin = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 4000 }];
  const sch = selecteerCombinaties(alles, [staal(1)], [], metKnopen(schuin));
  checkWaar("schoor van 45° (onder de 75°-grens) → vloer-/dakeis, niets overgeslagen",
    sch.actief.length === 24 && sch.overgeslagen.length === 0);

  const zonder = selecteerCombinaties(alles, [staal(1)]);
  checkWaar("zonder knopen is de stand niet te zien → niets overgeslagen",
    zonder.actief.length === 24 && zonder.overgeslagen.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De lijst zelf wordt niet aangeraakt (afleiding, geen mutatie)");
{
  const alles = defaultCombinations();
  const voor = alles.map((c) => c.id);
  const s = selecteerCombinaties(alles, [staal(1)], [], metKnopen(KOLOM));
  checkGelijk("de meegegeven lijst is ongewijzigd", alles.map((c) => c.id), voor);
  checkWaar("het projectbestand houdt dus alle vierentwintig combinaties", alles.length === 24);
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
    checkWaar(`staal + ${naam} → alle vierentwintig combinaties`,
      s.actief.length === 24 && s.overgeslagen.length === 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Terugkomen: een houten staaf toevoegen brengt ze terug");
{
  const alles = defaultCombinations();
  const staalModel = [staal(1), staal(2)];
  const eerst = selecteerCombinaties(alles, staalModel, [], metKnopen(KOLOM));
  const daarna = selecteerCombinaties(alles, [...staalModel, hout(3)], [], metKnopen(KOLOM));
  checkWaar("eerst achttien (zeventien plus de blijvende 6.16b)", eerst.actief.length === 18);
  checkWaar("na het toevoegen van hout weer vierentwintig", daarna.actief.length === 24);
  checkWaar("de quasi-blijvende (6.16, id 23 en 24) is er weer — anders zou de kruip stil terugvallen",
    [23, 24].every((id) => daarna.actief.some((c) => c.id === id)));

  // EN MET BETON DE FREQUENTE (6.15). Die combinatie voedt sinds §7.3 de
  // scheurwijdtetoets; valt zij weg, dan komt die toets als "niet uitgevoerd"
  // in het rapport terwijl er niets aan de hand is.
  const metBeton = selecteerCombinaties(alles, [...staalModel, beton(4)], [], metKnopen(KOLOM));
  checkWaar("na het toevoegen van beton weer vierentwintig", metBeton.actief.length === 24);
  checkWaar("de frequente (6.15b, alle vijf) zijn er weer — anders vervalt de scheurwijdtetoets",
    [18, 19, 20, 21, 22].every((id) => metBeton.actief.some((c) => c.id === id)));
  checkWaar("de quasi-blijvende (6.16b) ook", [23, 24].every((id) => metBeton.actief.some((c) => c.id === id)));
  checkWaar("er wordt niets overgeslagen zodra er beton in staat",
    metBeton.overgeslagen.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Aangepaste combinaties blijven met rust");
{
  // Hernoemd
  // Index 17 = id 18 (6.15b, Q leidend), index 22 = id 23 (6.16b met Q).
  const hernoemd = defaultCombinations();
  hernoemd[17] = { ...hernoemd[17], name: "BGT frequent (eigen keuze)" };
  const a = selecteerCombinaties(hernoemd, [staal(1)], [], metKnopen(KOLOM));
  checkGelijk("hernoemde 6.15b blijft, de andere 6.15b en de 6.16b vallen weg",
    a.overgeslagen.map((o) => o.id), [19, 20, 21, 22, 23]);

  // Factor bijgesteld
  const bijgesteld = defaultCombinations();
  bijgesteld[22] = { ...bijgesteld[22], factors: new Map([[1, 1.0], [2, 0.5]]) };
  const b = selecteerCombinaties(bijgesteld, [staal(1)], [], metKnopen(KOLOM));
  checkGelijk("bijgestelde 6.16b blijft, de ongewijzigde 6.15b en 6.16b vallen weg",
    b.overgeslagen.map((o) => o.id), [18, 19, 20, 21, 22]);

  // Een geval eruit gehaald (kleinere factorenkaart)
  const uitgedund = defaultCombinations();
  uitgedund[17] = { ...uitgedund[17], factors: new Map([[1, 1.0]]) };
  const c = selecteerCombinaties(uitgedund, [staal(1)], [], metKnopen(KOLOM));
  checkGelijk("uitgedunde 6.15b blijft", c.overgeslagen.map((o) => o.id), [19, 20, 21, 22, 23]);

  // Formule aangepast (wat de gebruiker leest, telt ook mee)
  const anderFormule = defaultCombinations();
  anderFormule[22] = { ...anderFormule[22], formula: "G + 0,3·Q (projectkeuze)" };
  const d = selecteerCombinaties(anderFormule, [staal(1)], [], metKnopen(KOLOM));
  checkGelijk("aangepaste formule blijft", d.overgeslagen.map((o) => o.id), [18, 19, 20, 21, 22]);

  // Zelf toegevoegde combinatie met hetzelfde id-bereik
  const eigen = [
    ...defaultCombinations(),
    { id: 99, name: "BGT eigen", type: "sls", formula: "G + Q", factors: new Map([[1, 1], [2, 1]]) },
  ];
  const e = selecteerCombinaties(eigen, [staal(1)], [], metKnopen(KOLOM));
  checkWaar("een eigen combinatie erbij verandert niets aan het oordeel over de standaardzes",
    e.actief.length === 19 && e.actief.some((c2) => c2.id === 99) && e.overgeslagen.length === 6);

  // Volledig eigen lijst (zoals de windgenerator die schrijft)
  const windAchtig = [
    { id: 1, name: "UGT — wind leidend", type: "uls", formula: "1,2G + 1,5W", factors: new Map([[1, 1.2], [4, 1.5]]) },
    { id: 7, name: "BGT karakteristiek — wind leidend", type: "sls", formula: "G + W", factors: new Map([[1, 1], [4, 1]]) },
    { id: 8, name: "BGT karakteristiek — sneeuw leidend", type: "sls", formula: "G + S", factors: new Map([[1, 1], [3, 1]]) },
  ];
  const f = selecteerCombinaties(windAchtig, [staal(1)], [], metKnopen(KOLOM));
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
    leeg.actief.length === 24 && leeg.overgeslagen.length === 0);
  const geen = selecteerCombinaties([], [staal(1)], [], metKnopen(KOLOM));
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
  // Geen `combinations` in de payload en geen projectbestand → de sidecar leidt
  // de standaardset af uit de gevallen van het MODEL (G = 1 blijvend, Q = 2
  // veranderlijk), precies zoals de store: UGT 6.10a met en zonder Q, 6.10b,
  // 6.10b gunstig (id 1–4), BGT 6.14b (id 5), 6.15b (id 6), 6.16b met en
  // zonder Q (id 7–8). Id 8 is alleen G en blijft staan: de staaltoets leest
  // er w₁ uit (zie de kop).
  const solve = (staven) =>
    verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model: portaal(staven) } });

  // Het stalen portaal heeft een LIGGER (staaf 2): die krijgt de vloer-/dakeis
  // en leest 6.15b en 6.16b. Er valt dus niets weg (issue #10).
  const staalUit = solve(stalenStaven);
  checkWaar("de solve slaagt", staalUit.ok === true, JSON.stringify(staalUit.error ?? {}));
  const r = staalUit.result ?? {};
  checkGelijk("stalen portaal met ligger: alle acht combinaties doorgerekend",
    Object.keys(r.combinations ?? {}).map(Number), [1, 2, 3, 4, 5, 6, 7, 8]);
  checkGelijk("combinations_skipped is leeg", (r.combinations_skipped ?? []).map((c) => c.id), []);

  // Alleen de twee kolommen, zonder ligger: dan leest geen toets 6.15b of de
  // volledige 6.16b, en die vallen weg — zichtbaar.
  const kolommen = {
    ...portaal([
      { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" },
      { id: 3, from: 4, to: 3, material: "S235", profile: "HEA160" },
    ]),
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -1 },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -2 },
    ],
  };
  kolommen.supports = [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }];
  const kolomUit = verwerkVerzoek({ v: 1, id: 2, op: "solve", payload: { model: kolommen } });
  checkWaar("de solve met alleen kolommen slaagt", kolomUit.ok === true, JSON.stringify(kolomUit.error ?? {}));
  const rk = kolomUit.result ?? {};
  checkGelijk("alleen kolommen: zes doorgerekende combinaties (vijf plus de blijvende 6.16b)",
    Object.keys(rk.combinations ?? {}).map(Number), [1, 2, 3, 4, 5, 8]);
  checkGelijk("combinations_skipped noemt 6.15b en de volledige 6.16b",
    (rk.combinations_skipped ?? []).map((c) => c.id), [6, 7]);
  checkWaar("elke overgeslagen combinatie draagt naam én reden",
    (rk.combinations_skipped ?? []).every((c) => c.name && c.reason?.length > 40));
  checkWaar("en het staat ook in de waarschuwingen — nooit stil",
    (rk.warnings ?? []).filter((w) => w.includes("niet doorgerekend")).length === 2,
    JSON.stringify(rk.warnings));

  const gemengd = solve([
    ...stalenStaven,
    { id: 4, from: 2, to: 3, material: "C24", profile: "100x200" },
  ]);
  const rg = gemengd.result ?? {};
  // Sinds september 2026 (EN 1995-1-1 2.3.2.2) staan er in dit ingeklemde,
  // dus statisch onbepaalde portaal met hout naast staal ook de
  // eindtoestandvarianten van de UGT-combinaties bij, onder id + 10 000 000 ·
  // round(100·ψ₂). Die tellen hier niet mee: het gaat om de selectie.
  const gewoon = Object.keys(rg.combinations ?? {}).map(Number).filter((id) => id < 10_000_000);
  checkWaar("één houten staaf erbij → alle acht combinaties, niets overgeslagen",
    gewoon.length === 8 &&
    (rg.combinations_skipped ?? []).length === 0);
  checkWaar("… plus eindtoestandvarianten, met de melding in `warnings` (EN 1995-1-1 2.3.2.2)",
    Object.keys(rg.combinations ?? {}).length > 8 &&
    (rg.warnings ?? []).some((w) => w.startsWith("Eindstijfheid hout doorgerekend (UGT).")));
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
