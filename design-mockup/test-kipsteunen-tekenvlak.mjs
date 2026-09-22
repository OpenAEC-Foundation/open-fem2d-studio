// Kipsteunen op het tekenvlak: de getekende posities ZIJN de kipveldgrenzen
// die de toetsinvoer krijgt (issue #40).
//
// Waarom deze test bestaat. Kipsteunen stonden alleen als getallen in het
// eigenschappenpaneel; op de tekening was niet te zien waar ze zitten en aan
// welke flens. De tekening leidt haar posities nu af met dezelfde functie als
// de invoerbouwers (`lib/kipsteunen.ts`), langs dezelfde weg (doorgaande
// lijnen samenvoegen, referentierichting — `lib/kipsteunBeeld.ts`). Deze test
// legt vast dat dat ook werkelijk ÉÉN bron is: elke vergelijking hieronder
// houdt het beeld tegen de invoer die `buildSteelCheckInputs` en
// `buildTimberCheckInputs` opleveren, en het slotblok houdt de getekende
// veldlengtes tegen de L_st en de ℓ die de rekenkern zelf rapporteert.
//
//   [1] de veldgrenzen volgen de regel van de kern (dezelfde gevallen als de
//       eenheidstests van `kipveld_grenzen_mm` in lambda_chi.rs)
//   [2] staal, van links naar rechts: posities, flens (boven/onder/beide),
//       wereldcoördinaten, twee kettingen
//   [3] staal, van rechts naar links getekend: de invoer krijgt 1 − f, de
//       tekening zet de steun op de plaats die de gebruiker bedoelde
//   [4] staande en schuine staaf: waar "boven" is, en het punt op de staaf
//   [5] hout: kipsteunafstand → steunen op ℓ, 2ℓ, …; ℓ langer dan de staaf;
//       geen ℓ; de fracties per rand gaan wel mee maar maken geen kipveld
//   [6] doorgaande lijn (gesplitste staaf): één beeld over de hele lijn, de
//       tussenknoop is geen gaffel
//   [7] staafeinden: vrij eind van een uitkraging = wat de staalinvoer krijgt
//   [8] verlopende staaf en staven zonder kiptoets (beton)
//   [9] de rekenkern zelf (toetsbrug): L_st en ℓ = een getekende veldlengte
//
// Draaien: npx tsx test-kipsteunen-tekenvlak.mjs
//      of: node scripts/run-tests.mjs --filter=kipsteunen-tekenvlak

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { buildSteelCheckInputs, profileLookupKey, sanitizeRestraintFractions } = await import(
  "./src/lib/steelCheckBuilder.ts"
);
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");
const kipsteunen = await import("./src/lib/kipsteunen.ts");
const { kipveldGrenzenMm, kipsteunenVanStaaf } = kipsteunen;
const { kipsteunBeelden, kipsteunSoortVanStaaf, puntOpStaaf } = await import(
  "./src/lib/kipsteunBeeld.ts"
);

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
const gelijk = (a, b, tol = 1e-9) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const j = (v) => JSON.stringify(v);

// ─────────────────────────────────────────────────────────────────────────
// Fixture: één overspanning van 6 m op twee steunpunten, q omlaag. Dezelfde
// geometrie voor staal en hout; `model` maakt er een doorgerekend model van.
// ─────────────────────────────────────────────────────────────────────────
const L = 6000;
const combos = defaultCombinations();
const profileDb = new Map([[profileLookupKey("IPE200"), { geometry: { h: 200 } }]]);
const STAAL = { E: 210000, A: 2850, I: 1.94e7 };
const HOUT = { E: 11000, A: 16000, I: 3.4133e7 };

function reken(nodes, beams, supports, q = -2) {
  const solverBeams = beams.map((b) => ({
    id: b.id, from: b.from, to: b.to, ...(b.material === "C24" ? HOUT : STAAL),
  }));
  const loads = beams.map((b) => ({ beamId: b.id, q }));
  const r = solve({ nodes, beams: solverBeams, supports, loads });
  const perCase = new Map([[1, r], [2, r]]);
  return new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
}

const liggerNodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }];
const liggerSupports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
const staalStaaf = (checkConfig, extra = {}) => ({
  id: 1, from: 1, to: 2, material: "S235", profile: "IPE200", ...(checkConfig ? { checkConfig } : {}), ...extra,
});
const houtStaaf = (checkConfig) => ({
  id: 1, from: 1, to: 2, material: "C24", profile: "100x160", ...(checkConfig ? { checkConfig } : {}),
});
const staalInvoer = (nodes, beams, supports) =>
  buildSteelCheckInputs({
    nodes, beams, supports, combinations: combos, profileDb,
    combinationResults: reken(nodes, beams, supports),
  });
const houtInvoer = (nodes, beams, supports) =>
  buildTimberCheckInputs({
    nodes, beams, supports, combinations: combos,
    combinationResults: reken(nodes, beams, supports),
  });
/** De fracties van een beeld per flens, zoals `lateral_bracing` ze draagt. */
const fractiesVanBeeld = (beeld) => ({
  top_flange_positions: beeld.steunen
    .filter((s) => s.herkomst === "positie" && (s.flens === "boven" || s.flens === "beide")).map((s) => s.fractie),
  bottom_flange_positions: beeld.steunen
    .filter((s) => s.herkomst === "positie" && (s.flens === "onder" || s.flens === "beide")).map((s) => s.fractie),
});

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Veldgrenzen: dezelfde regel als kipveld_grenzen_mm in de kern");
{
  ok("zonder kipsteunen precies één veld", gelijk(kipveldGrenzenMm(5700, []), [0, 5700]));
  const g = kipveldGrenzenMm(8000, [1 / 3, 2 / 3]);
  ok("derdepunten → drie velden", g.length === 4 && Math.abs(g[1] - 2666.667) < 0.01 && Math.abs(g[2] - 5333.333) < 0.01 && g[3] === 8000, j(g));
  ok("een steun op 1e-9 maakt geen kipveld", gelijk(kipveldGrenzenMm(6000, [1e-9]), [0, 6000]));
  ok("een steun op 1 − 1e-9 maakt geen kipveld", gelijk(kipveldGrenzenMm(6000, [1 - 1e-9]), [0, 6000]));
  ok("boven één promille telt de steun", gelijk(kipveldGrenzenMm(6000, [0.01]), [0, 60, 6000]));
  ok("ongesorteerd, dubbel en de uiteinden",
    gelijk(kipveldGrenzenMm(1000, [0.75, 0, 0.25, 1, 0.25]), [0, 250, 750, 1000]));
  ok("de bouwers halen het opschonen uit dezelfde module",
    sanitizeRestraintFractions === kipsteunen.sanitizeRestraintFractions);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Staal, links → rechts: beeld = lateral_bracing van de toetsinvoer");
{
  const cfg = { lateralRestraints: [0.75, 0.25, 0.5, 0, 1, 0.25], lateralRestraintsBottom: [0.5, 0.9] };
  const beams = [staalStaaf(cfg)];
  const { inputs } = staalInvoer(liggerNodes, beams, liggerSupports);
  const [beeld] = kipsteunBeelden({ nodes: liggerNodes, beams, supports: liggerSupports });
  ok("er is staalinvoer en één beeld", inputs.length === 1 && beeld?.soort === "staal");
  ok("getekende fracties = lateral_bracing", j(fractiesVanBeeld(beeld)) === j(inputs[0].lateral_bracing),
    j(inputs[0].lateral_bracing));
  ok("flens per steun: 0,25 boven · 0,5 beide · 0,75 boven · 0,9 onder",
    j(beeld.steunen.map((s) => [s.fractie, s.flens])) === j([[0.25, "boven"], [0.5, "beide"], [0.75, "boven"], [0.9, "onder"]]),
    j(beeld.steunen.map((s) => [s.fractie, s.flens])));
  ok("wereldcoördinaten: x = f · L op de staafas",
    beeld.steunen.every((s) => Math.abs(s.x - s.fractie * L) < 1e-9 && s.z === 0 && Math.abs(s.xMm - s.x) < 1e-9));
  ok("boven = omhoog (0, 1), liggend", beeld.boven.x === 0 && beeld.boven.z === 1 && beeld.staafstand === "Liggend");
  const boven = beeld.kettingen.find((k) => k.zijde === "boven");
  const onder = beeld.kettingen.find((k) => k.zijde === "onder");
  ok("ketting bovenflens 1500 · 1500 · 1500 · 1500 mm", gelijk(boven?.lengtesMm, [1500, 1500, 1500, 1500]), j(boven?.lengtesMm));
  ok("ketting onderflens 3000 · 2400 · 600 mm", gelijk(onder?.lengtesMm, [3000, 2400, 600], 1e-6), j(onder?.lengtesMm));
  ok("ketting = kipveld_grenzen van de invoerfracties",
    gelijk(boven.grenzenMm, kipveldGrenzenMm(inputs[0].length_m * 1000, inputs[0].lateral_bracing.top_flange_positions)) &&
    gelijk(onder.grenzenMm, kipveldGrenzenMm(inputs[0].length_m * 1000, inputs[0].lateral_bracing.bottom_flange_positions)));
  ok("beide einden gaffel (opgelegd)", j(beeld.einden) === j({ begin: "Gaffel", eind: "Gaffel" }));

  // Geen steunen: één veld over de hele staaf, voor beide flenzen gelijk.
  const [kaal] = kipsteunBeelden({ nodes: liggerNodes, beams: [staalStaaf()], supports: liggerSupports });
  ok("zonder kipsteunen: geen symbolen, één ketting 'beide' van 6000 mm",
    kaal.steunen.length === 0 && kaal.kettingen.length === 1 && kaal.kettingen[0].zijde === "beide" &&
    gelijk(kaal.kettingen[0].lengtesMm, [6000]));
  // Gelijke steunen aan beide flenzen: één ketting.
  const [dubbel] = kipsteunBeelden({
    nodes: liggerNodes, supports: liggerSupports,
    beams: [staalStaaf({ lateralRestraints: [1 / 3, 2 / 3], lateralRestraintsBottom: [1 / 3, 2 / 3] })],
  });
  ok("boven = onder: één ketting 'beide', alle steunen 'beide'",
    dubbel.kettingen.length === 1 && dubbel.kettingen[0].zijde === "beide" && dubbel.steunen.every((s) => s.flens === "beide"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Staal, rechts → links getekend: de toets ziet 1 − f, de tekening de bedoelde plaats");
{
  // Knoop 1 rechts, knoop 2 links; de gebruiker zet een steun op 0,2 vanaf
  // de BEGINknoop, dus 1200 mm vanaf het rechter eind: x = 4800.
  const nodes = [{ id: 1, x: L, z: 0 }, { id: 2, x: 0, z: 0 }];
  const beams = [staalStaaf({ lateralRestraints: [0.2] })];
  const { inputs } = staalInvoer(nodes, beams, liggerSupports);
  const [beeld] = kipsteunBeelden({ nodes, beams, supports: liggerSupports });
  ok("de invoer krijgt 0,8", gelijk(inputs[0].lateral_bracing.top_flange_positions, [0.8]));
  ok("het beeld draagt dezelfde 0,8", j(fractiesVanBeeld(beeld)) === j(inputs[0].lateral_bracing));
  ok("getekend op x = 4800 (1200 mm vanaf de beginknoop)", Math.abs(beeld.steunen[0].x - 4800) < 1e-6, `${beeld.steunen[0].x}`);
  ok("het beeld loopt van links naar rechts", beeld.begin.x === 0 && beeld.eind.x === L);
  ok("boven blijft omhoog", beeld.boven.x === 0 && beeld.boven.z === 1);
  ok("ketting 4800 · 1200 mm vanaf links", gelijk(beeld.kettingen.find((k) => k.zijde === "boven").lengtesMm, [4800, 1200], 1e-6));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Staande en schuine staaf");
{
  // Kolom van kop naar voet getekend: de toets rekent van voet naar kop, en
  // "boven" is dan LINKS.
  const nodes = [{ id: 1, x: 0, z: 4000 }, { id: 2, x: 0, z: 0 }];
  const supports = [{ nodeId: 2, type: "fixed" }, { nodeId: 1, type: "xRoller" }];
  const beams = [staalStaaf({ lateralRestraints: [0.25] })];
  const { inputs } = staalInvoer(nodes, beams, supports);
  const [beeld] = kipsteunBeelden({ nodes, beams, supports });
  ok("kolom: staand, begin = voet", beeld.staafstand === "Staand" && beeld.begin.z === 0 && beeld.eind.z === 4000);
  ok("kolom: boven = links (−1, 0)", Math.abs(beeld.boven.x + 1) < 1e-12 && Math.abs(beeld.boven.z) < 1e-12);
  ok("kolom: de invoer krijgt 0,75 en staafstand Staand",
    gelijk(inputs[0].lateral_bracing.top_flange_positions, [0.75]) && inputs[0].staafstand === "Staand");
  ok("kolom: getekend op z = 3000 (1000 mm onder de kop)", Math.abs(beeld.steunen[0].z - 3000) < 1e-6 && beeld.steunen[0].x === 0);

  // Schuine ligger 3-4-5: 8000 horizontaal, 6000 omhoog → L = 10000.
  const schuin = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 6000 }];
  const sb = [staalStaaf({ lateralRestraints: [0.5], lateralRestraintsBottom: [0.25] })];
  const [sBeeld] = kipsteunBeelden({ nodes: schuin, beams: sb, supports: liggerSupports });
  ok("schuin: lengte 10000 mm", Math.abs(sBeeld.lengteMm - 10000) < 1e-9);
  ok("schuin: steun 0,5 op (4000, 3000)", j(sBeeld.steunen.filter((s) => s.fractie === 0.5).map((s) => [s.x, s.z])) === j([[4000, 3000]]));
  ok("schuin: boven = (−0,6; 0,8), loodrecht op de staaf",
    Math.abs(sBeeld.boven.x + 0.6) < 1e-12 && Math.abs(sBeeld.boven.z - 0.8) < 1e-12);
  ok("schuin: ketting onder 2500 · 7500 mm langs de staaf", gelijk(sBeeld.kettingen.find((k) => k.zijde === "onder").lengtesMm, [2500, 7500], 1e-6));
  const p = puntOpStaaf(sBeeld, 2500);
  ok("puntOpStaaf(2500) = (2000, 1500)", Math.abs(p.x - 2000) < 1e-9 && Math.abs(p.z - 1500) < 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Hout: de kipsteunafstand is de ketting, de fracties per rand niet");
{
  const geval = (cfg) => {
    const beams = [houtStaaf(cfg)];
    const { inputs } = houtInvoer(liggerNodes, beams, liggerSupports);
    const [beeld] = kipsteunBeelden({ nodes: liggerNodes, beams, supports: liggerSupports });
    return { invoer: inputs[0], beeld, ketting: beeld.kettingen[0] };
  };
  {
    const { invoer, beeld, ketting } = geval({ ltbSupportSpacing_m: 1.2 });
    ok("ℓ = 1,2 m: de invoer krijgt 1,2", invoer.ltb_segment_length_m === 1.2);
    ok("ℓ = 1,2 m: steunen op 1200 · 2400 · 3600 · 4800, geen op het eind",
      gelijk(beeld.steunen.map((s) => s.xMm), [1200, 2400, 3600, 4800], 1e-6), j(beeld.steunen.map((s) => s.xMm)));
    ok("ℓ = 1,2 m: steunen aan de gedrukte rand, uit de afstand",
      beeld.steunen.every((s) => s.flens === "gedrukt" && s.herkomst === "afstand"));
    ok("ℓ = 1,2 m: één ketting 'kip', vijf velden van 1200", beeld.kettingen.length === 1 && ketting.zijde === "kip" &&
      gelijk(ketting.lengtesMm, [1200, 1200, 1200, 1200, 1200], 1e-6));
    ok("ℓ = 1,2 m: toetslengte = ltb_segment_length_m · 1000", ketting.toetsLengteMm === invoer.ltb_segment_length_m * 1000);
  }
  {
    const { invoer, beeld, ketting } = geval({ ltbSupportSpacing_m: 2.5 });
    ok("ℓ = 2,5 m past niet: velden 2500 · 2500 · 1000, toets rekent met 2500",
      gelijk(ketting.lengtesMm, [2500, 2500, 1000], 1e-6) && ketting.toetsLengteMm === 2500 &&
      invoer.ltb_segment_length_m === 2.5 && beeld.steunen.length === 2);
  }
  {
    const { invoer, beeld, ketting } = geval({ ltbSupportSpacing_m: 9 });
    ok("ℓ = 9 m > staaf: geen tussensteunen, één veld, toets rekent met 9000",
      beeld.steunen.length === 0 && gelijk(ketting.lengtesMm, [6000]) && ketting.toetsLengteMm === 9000 &&
      invoer.ltb_segment_length_m === 9);
  }
  {
    const { invoer, ketting } = geval(undefined);
    ok("geen ℓ: de invoer krijgt 0 (= staaflengte), de ketting toont 6000",
      invoer.ltb_segment_length_m === 0 && gelijk(ketting.lengtesMm, [6000]) && ketting.toetsLengteMm === invoer.length_m * 1000);
  }
  for (const [naam, waarde] of [["nul", 0], ["negatief", -2], ["NaN", NaN]]) {
    const { invoer, ketting } = geval({ ltbSupportSpacing_m: waarde });
    ok(`ℓ ${naam}: terugval op de staaflengte, in invoer én beeld`,
      invoer.ltb_segment_length_m === 0 && ketting.toetsLengteMm === 6000);
  }
  {
    const { invoer, beeld, ketting } = geval({ lateralRestraints: [0.5], lateralRestraintsBottom: [0.5, 0.25] });
    ok("fracties per rand: getekend = lateral_bracing van de houtinvoer",
      j(fractiesVanBeeld(beeld)) === j(invoer.lateral_bracing), j(invoer.lateral_bracing));
    ok("fracties per rand maken GEEN kipveld (art. 6.3.3 vraagt één afstand)",
      invoer.ltb_segment_length_m === 0 && beeld.kettingen.length === 1 && gelijk(ketting.lengtesMm, [6000]));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Doorgaande lijn: een gesplitste staaf tekent als de ene staaf die de toets ziet");
{
  // 6 m, geknipt op 2 m door een knoop zonder oplegging. Deel 2 is van rechts
  // naar links getekend. Steunen: deel 1 op de helft (1000 mm), deel 2 op een
  // kwart vanaf ZIJN beginknoop (= 1000 mm vanaf het rechter eind: x = 5000).
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: L, z: 0 }];
  const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }];
  const beams = [
    { id: 1, from: 1, to: 2, material: "S235", profile: "IPE200", checkConfig: { lateralRestraints: [0.5] } },
    { id: 2, from: 3, to: 2, material: "S235", profile: "IPE200", checkConfig: { lateralRestraints: [0.25] } },
  ];
  const { inputs } = staalInvoer(nodes, beams, supports);
  const beelden = kipsteunBeelden({ nodes, beams, supports });
  ok("één getoetste staaf, één beeld", inputs.length === 1 && beelden.length === 1);
  const [beeld] = beelden;
  ok("het beeld hoort bij staaf 1 en bestaat uit de staven 1 en 2", beeld.toetsId === 1 && j(beeld.staafIds) === j([1, 2]));
  ok("lengte = de hele lijn, 6000 mm", Math.abs(beeld.lengteMm - 6000) < 1e-9 && inputs[0].length_m === 6);
  ok("getekende fracties = lateral_bracing van de lijn", j(fractiesVanBeeld(beeld)) === j(inputs[0].lateral_bracing),
    j(inputs[0].lateral_bracing));
  ok("elke steun weet op welk deel hij ligt, en de einden ook",
    j(beeld.steunen.map((s) => s.staafId)) === j([1, 2]) && j(beeld.eindStaafIds) === j({ begin: 1, eind: 2 }),
    `${j(beeld.steunen.map((s) => s.staafId))} ${j(beeld.eindStaafIds)}`);
  ok("steunen op x = 1000 en x = 5000", gelijk(beeld.steunen.map((s) => s.x), [1000, 5000], 1e-6), j(beeld.steunen.map((s) => s.x)));
  ok("de tussenknoop (x = 2000) is geen veldgrens: 1000 · 4000 · 1000",
    gelijk(beeld.kettingen.find((k) => k.zijde === "boven").lengtesMm, [1000, 4000, 1000], 1e-6));

  // Met een oplegging op de tussenknoop zijn het twee overspanningen.
  const metSteun = [...supports, { nodeId: 2, type: "zRoller" }];
  const los = kipsteunBeelden({ nodes, beams, supports: metSteun });
  const losInvoer = staalInvoer(nodes, beams, metSteun).inputs;
  ok("met een steunpunt op de tussenknoop: twee beelden, twee invoeren", los.length === 2 && losInvoer.length === 2);
  ok("… elk gelijk aan zijn eigen invoer",
    los.every((b) => j(fractiesVanBeeld(b)) === j(losInvoer.find((i) => i.beam_id === b.toetsId).lateral_bracing)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Staafeinden: wat de tekening als gaffel toont = wat de staalinvoer aanneemt");
{
  // Uitkraging: ingeklemd in knoop 1, knoop 2 vrij.
  const supports = [{ nodeId: 1, type: "fixed" }];
  const beams = [staalStaaf({ lateralRestraints: [0.5] })];
  const { inputs } = staalInvoer(liggerNodes, beams, supports);
  const [beeld] = kipsteunBeelden({ nodes: liggerNodes, beams, supports });
  ok("uitkraging: eind 'Vrij', begin 'Gaffel'", j(beeld.einden) === j({ begin: "Gaffel", eind: "Vrij" }));
  ok("… en dat is het veld `staafeinden` van de invoer", j(inputs[0].staafeinden) === j(beeld.einden), j(inputs[0].staafeinden));
  // Opgelegde ligger: de invoer laat het veld weg (= twee gaffels).
  const gewoon = staalInvoer(liggerNodes, [staalStaaf()], liggerSupports).inputs[0];
  ok("opgelegde ligger: de invoer laat `staafeinden` weg = twee gaffels", gewoon.staafeinden === undefined);
  // Zonder opleggingenlijst doet niemand een uitspraak: alles gaffel.
  const [zonder] = kipsteunBeelden({ nodes: liggerNodes, beams });
  ok("zonder opleggingenlijst: beide einden gaffel", j(zonder.einden) === j({ begin: "Gaffel", eind: "Gaffel" }));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Verlopende staaf, en staven zonder kiptoets");
{
  const cfg = { lateralRestraints: [0.25, 0.5, 0.75] };
  const [prismatisch] = kipsteunBeelden({ nodes: liggerNodes, beams: [staalStaaf(cfg)], supports: liggerSupports });
  const [verlopend] = kipsteunBeelden({
    nodes: liggerNodes, beams: [staalStaaf(cfg, { profileEnd: "IPE300" })], supports: liggerSupports,
  });
  ok("verlopend: zelfde steunen en kettingen als prismatisch",
    j(verlopend.steunen) === j(prismatisch.steunen) && j(verlopend.kettingen) === j(prismatisch.kettingen));
  ok("soort: staal, hout, en geen beeld voor beton of onbekend materiaal",
    kipsteunSoortVanStaaf(staalStaaf()) === "staal" && kipsteunSoortVanStaaf(houtStaaf()) === "hout" &&
    kipsteunSoortVanStaaf({ id: 9, from: 1, to: 2, material: "C30/37", profile: "300x500" }) === null &&
    kipsteunSoortVanStaaf({ id: 9, from: 1, to: 2 }) === null);
  ok("een betonstaaf met (oude) kipsteunen in de config krijgt geen beeld",
    kipsteunBeelden({
      nodes: liggerNodes, supports: liggerSupports,
      beams: [{ id: 1, from: 1, to: 2, material: "C30/37", profile: "300x500", checkConfig: cfg }],
    }).length === 0);
  ok("lengte 0: invoervelden wel, tekening leeg",
    j(kipsteunenVanStaaf(cfg, 0, "staal")) === j({
      lateral_bracing: { top_flange_positions: [0.25, 0.5, 0.75], bottom_flange_positions: [] },
      ltb_segment_length_m: 0, steunen: [], kettingen: [],
    }));
}

// ─────────────────────────────────────────────────────────────────────────
// [9] De rekenkern zelf. De L_st van het maatgevende kipveld (staal) en de ℓ
// van tabel 6.1 (hout) moeten een veldlengte zijn die op de tekening staat.
// ─────────────────────────────────────────────────────────────────────────
const kern = (opdracht, inputs) => {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht, inputs }), maxBuffer: 256 * 1024 * 1024, encoding: "utf8",
  });
  if (r.error) throw r.error;
  const data = JSON.parse(r.stdout);
  if (data && !Array.isArray(data) && typeof data === "object" && "fout" in data) throw new Error(data.fout);
  return data;
};
/** Alle waarden van een variabele met dit symbool, waar ook in het resultaat. */
function waardenVan(obj, symbool, uit = []) {
  if (Array.isArray(obj)) obj.forEach((o) => waardenVan(o, symbool, uit));
  else if (obj && typeof obj === "object") {
    if (obj.symbol === symbool && typeof obj.value === "number") uit.push(obj.value);
    Object.values(obj).forEach((o) => waardenVan(o, symbool, uit));
  }
  return uit;
}

if (!existsSync(TOETSBRUG)) {
  failed++;
  log(`\n  ✗ de rekenkern ontbreekt: ${TOETSBRUG}`);
  log("    bouw hem met  cargo build --release -p toetsbrug  vanuit src-tauri;");
  log("    zonder hem is de tekening niet tegen de kern gehouden.");
} else {
  log("\n[9] De kern rekent met een veldlengte die op de tekening staat");
  for (const [naam, cfg, verwachtMm] of [
    ["bovenflens op 0,2 en 0,5 (doorhangen: bovenflens gedrukt)", { lateralRestraints: [0.2, 0.5] }, [1200, 1800, 3000]],
    ["alleen de onderflens gesteund: bij doorhangen telt hij niet", { lateralRestraintsBottom: [0.5] }, [6000]],
    ["geen kipsteunen", {}, [6000]],
  ]) {
    const beams = [staalStaaf(cfg)];
    const { inputs } = staalInvoer(liggerNodes, beams, liggerSupports);
    const [beeld] = kipsteunBeelden({ nodes: liggerNodes, beams, supports: liggerSupports });
    const [r] = kern("check_steel_beams", inputs);
    const kip = r.checks.find((c) => c.id === "6.3.2_ltb");
    const lSt = [...new Set(waardenVan(kip, "L_{st}").map((v) => Math.round(v * 1e6) / 1e6))];
    const ketting = beeld.kettingen.find((k) => k.zijde === "boven" || k.zijde === "beide");
    ok(`staal, ${naam}: ketting bovenflens = ${verwachtMm.join(" · ")}`, gelijk(ketting.lengtesMm, verwachtMm, 1e-6), j(ketting.lengtesMm));
    ok(`staal, ${naam}: L_st van de kern (${lSt.join(", ")}) staat in die ketting`,
      lSt.length > 0 && lSt.every((v) => ketting.lengtesMm.some((l) => Math.abs(l - v) < 1e-3)));
  }
  for (const [naam, cfg] of [["ℓ = 1,2 m", { ltbSupportSpacing_m: 1.2 }], ["geen ℓ", {}]]) {
    const beams = [houtStaaf(cfg)];
    const { inputs } = houtInvoer(liggerNodes, beams, liggerSupports);
    const [beeld] = kipsteunBeelden({ nodes: liggerNodes, beams, supports: liggerSupports });
    const [r] = kern("check_timber_beams", inputs);
    const kip = r.checks.find((c) => c.id === "6.3.3_beam_stability");
    const lef = waardenVan(kip, "l_{ef}")[0];
    const l = beeld.kettingen[0].toetsLengteMm;
    // Tabel 6.1, gelijkmatig verdeelde belasting op twee steunpunten, last in
    // het zwaartepunt: l_ef = 0,9 · ℓ.
    ok(`hout, ${naam}: l_ef van de kern = 0,9 · de getekende ℓ (${l} mm)`, Math.abs(lef - 0.9 * l) < 1e-6, `${lef}`);
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
