// Wat is maatgevend: toets, combinatie en positie (issue #41).
//
// WAT HIER MISGING
//  Het toetsingspaneel zette alle toetsen van een staaf onder elkaar. Welke
//  toets maatgevend is, in welke combinatie en op welke plaats langs de staaf,
//  moest de gebruiker zelf uit de lijst opmaken; het rapport noemde alleen de
//  toets.
//
// WAT DEZE TEST VASTLEGT
//  [1] maatgevendVanStaaf: de hoogste UC onder de toetsen die MEETELLEN; een
//      toets met status n.v.t. of zonder UC telt niet mee, ook niet als zijn
//      UC-veld een groot getal draagt; combinatie en positie komen uit
//      `force_state`; combinatie 0 (zo schrijft de kern "geen combinatie")
//      geeft geen combinatie EN geen positie.
//  [2] gelijke UC's: de toets die de kern noemt wint als hij bij de hoogste
//      hoort, anders de eerste in normvolgorde — elke keer hetzelfde.
//  [3] een geweigerde staaf: de reden van de kern komt als melding mee.
//  [4] maatgevendVanPlaat: element en combinatie alleen bij de maatgevende
//      toets, nooit een positie; `niet_getoetst` staat als regel in de lijst.
//  [5] sorteerRegels: op UC aflopend met de niet-meetellende onderaan, en de
//      normvolgorde van de kern.
//  [6] ucKlasse en ucBalk: de grenzen 0,90 en 1,00, het streepje op twee
//      derde, afkappen boven 1,5.
//  [7] modelMaatgevend: het maatgevende onderdeel van het model en per soort;
//      wie geen meetellende toets heeft doet niet mee.
//  [8] DE ECHTE KERN (toetsbrug), ligger op twee steunpunten, L = 6000 mm,
//      gelijkmatige last. Handberekening: M is maximaal op x = L/2 = 3000 mm,
//      V op het steunpunt x = 0. De buigingstoets hoort dus x = 3000 te
//      noemen, de dwarskrachttoets x = 0, beide in een UGT-combinatie; de
//      doorbuigingstoetsen dragen geen combinatie.
//  [9] puntOpStaaf: de markering op het tekenvlak ligt op de staaf.
//  [10] paneel, plaatkaart en rapport gebruiken deze ene afleiding; het label
//      "maatgevend" en "telt niet mee" staan als TEKST in de weergave (niet
//      alleen kleur); de vertalingen bestaan in nl/en/de/fr.
//
// Uitvoeren: npx tsx test-maatgevend.mjs   (vanuit design-mockup/)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const {
  maatgevendVanStaaf, maatgevendVanPlaat, modelMaatgevend, sorteerRegels, ucKlasse, ucBalk,
} = await import("./src/lib/maatgevend.ts");
const { puntOpStaaf } = await import("./src/stores/maatgevendMarkeringStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}
const bron = (pad) => readFileSync(join(HIER, pad), "utf8").replace(/\r\n/g, "\n");

// ── Bouwstenen in de vorm van het kernantwoord (NamedCheck) ─────────────────
const krachten = { n_ed: 0, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: 0, mz_ed: 0 };
/** Eén toets. `uc: null` = geen unity check; `comb: 0` = de kern levert geen combinatie. */
function toets(id, uc, { status, comb = 3, x = 0, titel = id, artikel = "art. 6.2 (6.1)", notes = [], soort = "Resistance" } = {}) {
  return {
    id,
    kind: {
      type: soort,
      data: {
        id, title: titel, article: artikel,
        force_state: { combination_id: comb, position_mm: x, forces: krachten },
        formula_latex: "", variables: [], deelstappen: [], value: 0, unit: "-",
        uc: uc === null ? null : { ed: uc, rd: 1, uc, formula_latex: "" },
        status: status ?? (uc !== null && uc > 1 ? "NotOk" : "Ok"),
        notes,
      },
    },
  };
}
const staal = (beam_id, checks, governing_check_id, extra = {}) => ({
  beam_id, profile_name: "HEA 200", steel_grade: "S235", classification: "Class1", checks,
  uc_max: Math.max(0, ...checks.map((c) => (c.kind.data.status === "NotApplicable" ? 0 : c.kind.data.uc?.uc ?? 0))),
  status: "Ok", governing_check_id, ...extra,
});
const hout = (beam_id, checks, governing_check_id) => ({
  beam_id, section_name: "96 x 450", strength_class: "C24", service_class: "Sc1", load_duration: "MediumTerm",
  checks, uc_max: Math.max(0, ...checks.map((c) => c.kind.data.uc?.uc ?? 0)), status: "Ok", governing_check_id,
});
const plaat = (plate_id, checks, governing_check_id, extra = {}) => ({
  plate_id, soort: "Staal", materiaal: "S355", thickness_mm: 20, norm: "EN 1993-1-1", checks,
  uc_max: Math.max(0, ...checks.map((c) => c.kind.data.uc?.uc ?? 0)), status: "Ok", governing_check_id,
  combinaties: [], elementen: [], niet_getoetst: [], notes: [], ...extra,
});

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] maatgevendVanStaaf");
{
  const r = staal(7, [
    toets("druk", null, { status: "NotApplicable", comb: 1, x: 0, notes: ["Geen drukkracht: toets niet van toepassing."] }),
    toets("buiging", 0.42, { comb: 3, x: 3000, titel: "Buiging om de y-as", artikel: "art. 6.2.5 (6.12)" }),
    toets("kip", 0.79, { comb: 4, x: 2500, titel: "Kipstabiliteit", artikel: "art. 6.3.2 (6.54)", soort: "Stability" }),
    // Een n.v.t.-toets met een UC-veld dat niets betekent: mag nooit winnen.
    toets("plooi", 9.99, { status: "NotApplicable", comb: 4, x: 100, notes: ["Niet getoetst: klasse 4."] }),
    toets("melding", null, { status: "Ok", comb: 0 }),
    toets("doorbuiging", 0.66, { comb: 0, x: 0, titel: "Doorbuiging (BGT)" }),
  ], "kip");
  const o = maatgevendVanStaaf(r);
  check("soort staal, staafnummer en status uit het resultaat", o.soort === "staal" && o.objectId === 7 && !o.isPlaat && o.status === "Ok");
  check("maatgevend is de hoogste UC die meetelt: kip 0,79", o.maatgevend?.id === "kip" && o.maatgevend.uc === 0.79, JSON.stringify(o.maatgevend));
  check("titel en artikel woordelijk uit de kern", o.maatgevend.titel === "Kipstabiliteit" && o.maatgevend.artikel === "art. 6.3.2 (6.54)");
  check("combinatie 4 en positie 2500 mm uit force_state", o.maatgevend.combinatieId === 4 && o.maatgevend.positieMm === 2500);
  check("precies één regel draagt `maatgevend`", o.regels.filter((x) => x.maatgevend).length === 1);
  const plooi = o.regels.find((x) => x.id === "plooi");
  check("n.v.t. met UC-veld 9,99 telt NIET mee en toont geen UC", plooi.teltMee === false && plooi.uc === null && plooi.nietMeeReden === "nvt");
  check("de reden van een niet-meetellende toets zijn zijn notities", plooi.redenen.join("|") === "Niet getoetst: klasse 4.");
  check("zonder UC ook geen herkomst: het krachtenpunt van een n.v.t.-toets is geen uitkomst",
    plooi.combinatieId === null && plooi.positieMm === null);
  const melding = o.regels.find((x) => x.id === "melding");
  check("een toets zonder UC telt niet mee (reden: geen UC)", melding.teltMee === false && melding.nietMeeReden === "geenUc");
  check("drie toetsen tellen niet mee", o.aantalTeltNietMee === 3, String(o.aantalTeltNietMee));
  const doorb = o.regels.find((x) => x.id === "doorbuiging");
  check("combinatie 0 = geen combinatie, en dan ook GEEN positie (geen 'x = 0 mm')",
    doorb.teltMee && doorb.combinatieId === null && doorb.positieMm === null);
  check("een meetellende toets draagt geen redenen (die staan bij de afleiding)", o.maatgevend.redenen.length === 0);
  check("normIndex volgt de volgorde van de kern", o.regels.map((x) => x.normIndex).join(",") === "0,1,2,3,4,5");
  check("de kern wijst een toets aan: geen kernmelding", o.kernMelding === null);
  check("de invoer wordt niet aangepast", r.checks[2].kind.data.uc.uc === 0.79 && !("maatgevend" in r.checks[2]));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] gelijke unity checks: deterministisch");
{
  const drie = () => [toets("a", 0.5), toets("b", 0.8), toets("c", 0.8), toets("d", 0.8)];
  check("kern noemt c (een van de hoogste): c wint", maatgevendVanStaaf(staal(1, drie(), "c")).maatgevend.id === "c");
  check("kern noemt b: b wint", maatgevendVanStaaf(staal(1, drie(), "b")).maatgevend.id === "b");
  check("kern noemt a (NIET de hoogste): de eerste hoogste in normvolgorde, b", maatgevendVanStaaf(staal(1, drie(), "a")).maatgevend.id === "b");
  check("kern noemt niets: de eerste hoogste in normvolgorde, b", maatgevendVanStaaf(staal(1, drie(), "")).maatgevend.id === "b");
  const keren = Array.from({ length: 5 }, () => maatgevendVanStaaf(staal(1, drie(), "")).maatgevend.id).join("");
  check("vijf keer hetzelfde antwoord", keren === "bbbbb", keren);
  const nul = maatgevendVanStaaf(staal(1, [toets("a", 0), toets("b", 0)], ""));
  check("alle UC's nul: de eerste toets, niet 'niets'", nul.maatgevend?.id === "a");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] geweigerde staaf en lege resultaten");
{
  const geweigerd = maatgevendVanStaaf(staal(4, [], "ERROR: profiel onbekend — niet getoetst", { status: "NotApplicable" }));
  check("geen toetsen: niets maatgevend", geweigerd.maatgevend === null && geweigerd.regels.length === 0);
  check("de reden van de kern komt als melding mee", geweigerd.kernMelding === "ERROR: profiel onbekend — niet getoetst");
  const klasse4 = maatgevendVanStaaf(staal(5, [toets("doorbuiging", 0.7, { comb: 0 })], "NIET TOETSBAAR: klasse 4", { status: "NotApplicable" }));
  check("klasse 4: melding van de kern EN de hoogste UC van wat wel gerekend is",
    klasse4.kernMelding === "NIET TOETSBAAR: klasse 4" && klasse4.maatgevend?.id === "doorbuiging");
  const alleenNvt = maatgevendVanStaaf(staal(6, [toets("a", null, { status: "NotApplicable" })], ""));
  check("alleen n.v.t.: niets maatgevend, geen melding", alleenNvt.maatgevend === null && alleenNvt.kernMelding === null);
  check("soort hout herkend", maatgevendVanStaaf(hout(2, [toets("6.1.6_bending", 0.5)], "6.1.6_bending")).soort === "hout");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] maatgevendVanPlaat");
{
  const p = plaat(3, [toets("vloei", 0.68, { comb: 4, x: 0 }), toets("detail", 0.2, { comb: 0 })], "vloei", {
    governing_element_id: 7, governing_combination_id: 4,
    niet_getoetst: [{ id: "en1993_1_5_plooi", titel: "Plooi van plaatvelden", reden: "Niet getoetst: geen plaatveld opgegeven.", bepaalt_status: false }],
  });
  const o = maatgevendVanPlaat(p);
  check("soort plaat, plaatnummer", o.soort === "plaat" && o.isPlaat && o.objectId === 3);
  check("maatgevend: element 7 in combinatie 4", o.maatgevend.id === "vloei" && o.maatgevend.elementId === 7 && o.maatgevend.combinatieId === 4);
  check("een plaat heeft nooit een positie x", o.regels.every((x) => x.positieMm === null));
  check("het element staat alleen bij de maatgevende toets", o.regels.filter((x) => x.elementId !== null).length === 1);
  const plooi = o.regels.find((x) => x.id === "en1993_1_5_plooi");
  check("`niet_getoetst` staat als regel in de lijst, met de reden van de kern, en telt niet mee",
    plooi && !plooi.teltMee && plooi.nietMeeReden === "nvt" && plooi.redenen[0] === "Niet getoetst: geen plaatveld opgegeven.");
  const weiger = maatgevendVanPlaat(plaat(9, [], "", { status: "NotApplicable", geweigerd: "geen normgrondslag" }));
  check("geweigerde plaat: niets maatgevend", weiger.maatgevend === null);
  const detail = maatgevendVanPlaat(plaat(8, [toets("wand", 0.9, { comb: 0 })], "wand"));
  check("maatgevende detaillering zonder element of combinatie: beide leeg", detail.maatgevend.elementId === null && detail.maatgevend.combinatieId === null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] sorteerRegels");
{
  const o = maatgevendVanStaaf(staal(1, [
    toets("a", 0.3), toets("nvt", null, { status: "NotApplicable" }), toets("b", 0.9), toets("c", 0.9), toets("d", 0.1),
  ], "c"));
  const opUc = sorteerRegels(o.regels, "uc").map((x) => x.id).join(",");
  check("op UC: aflopend, de maatgevende vooraan bij gelijke UC, n.v.t. onderaan", opUc === "c,b,a,d,nvt", opUc);
  const opNorm = sorteerRegels(o.regels, "norm").map((x) => x.id).join(",");
  check("normvolgorde: zoals de kern ze levert", opNorm === "a,nvt,b,c,d", opNorm);
  check("sorteren geeft een nieuwe lijst; het overzicht blijft in normvolgorde",
    o.regels.map((x) => x.id).join(",") === "a,nvt,b,c,d");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] ucKlasse en ucBalk");
{
  check("0,90 is nog goed; 0,91 let op; 1,00 let op; 1,01 overschreden",
    ucKlasse(0.9) === "goed" && ucKlasse(0.91) === "letop" && ucKlasse(1.0) === "letop" && ucKlasse(1.01) === "overschreden");
  const b = ucBalk(0.75);
  // Bereik 0–1,5: 0,75 / 1,5 = 50 %; het streepje UC = 1,0 op 1 / 1,5 = 66,7 %.
  check("UC 0,75 vult de helft van het spoor", b.vullingPct === 50 && !b.afgekapt, JSON.stringify(b));
  check("het streepje UC = 1,0 staat op twee derde", b.grensPct === 66.7);
  check("UC 1,2 → 80 %, overschreden, niet afgekapt", ucBalk(1.2).vullingPct === 80 && ucBalk(1.2).klasse === "overschreden" && !ucBalk(1.2).afgekapt);
  check("UC 3 → vol en afgekapt", ucBalk(3).vullingPct === 100 && ucBalk(3).afgekapt);
  check("nulweerstand (MAX_VALUE) → vol, afgekapt, overschreden",
    ucBalk(Number.MAX_VALUE).vullingPct === 100 && ucBalk(Number.MAX_VALUE).afgekapt && ucBalk(Number.MAX_VALUE).klasse === "overschreden");
  check("UC 0 → leeg", ucBalk(0).vullingPct === 0 && ucBalk(0).klasse === "goed");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] modelMaatgevend");
{
  const staven = [
    staal(1, [toets("a", 0.6)], "a"),
    hout(2, [toets("b", 1.07, { comb: 5, x: 1200 })], "b"),
    staal(3, [toets("c", 1.07)], "c"),
    staal(4, [], "ERROR: geweigerd", { status: "NotApplicable" }),
  ];
  const platen = [plaat(1, [toets("vloei", 1.07, { comb: 4 })], "vloei", { governing_element_id: 2, governing_combination_id: 4 })];
  const m = modelMaatgevend(staven, platen);
  check("gelijke UC 1,07: eerst staven, dan het laagste nummer → staaf 2", m.model?.objectId === 2 && !m.model.isPlaat, `${m.model?.objectId}`);
  check("per soort, in vaste volgorde staal, hout, plaat", m.perSoort.map((s) => `${s.soort}:${s.overzicht.objectId}`).join(" ") === "staal:3 hout:2 plaat:1",
    m.perSoort.map((s) => `${s.soort}:${s.overzicht.objectId}`).join(" "));
  check("de geweigerde staaf doet niet mee en wordt geteld", m.aantalZonderMaatgevend === 1);
  const leeg = modelMaatgevend([], []);
  check("leeg model: niets maatgevend", leeg.model === null && leeg.perSoort.length === 0 && leeg.aantalZonderMaatgevend === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] de echte kern via de toetsbrug");
if (!existsSync(TOETSBRUG)) {
  check(`toetsbrug aanwezig (${TOETSBRUG}) — bouw hem met cargo build --release -p toetsbrug`, false);
} else {
  const { solve } = await import("./src/components/fem/solver/engine.ts");
  const { defaultCombinations, combineResults } = await import("./src/components/fem/solver/combinations.ts");
  const { buildSteelCheckInputs } = await import("./src/lib/steelCheckBuilder.ts");
  const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");
  const L = 6000;
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }];
  const supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
  const solverBeams = [{ id: 1, from: 1, to: 2, E: 210000, A: 3877, I: 1.673e7 }];
  const loads = [{ beamId: 1, q: -2 }];
  const perCase = new Map([
    [1, solve({ nodes, beams: solverBeams, supports, loads })],
    [2, solve({ nodes, beams: solverBeams, supports, loads })],
  ]);
  const combinations = defaultCombinations();
  const ugt = new Set(combinations.filter((c) => c.type === "uls").map((c) => c.id));
  const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
  const kern = (opdracht, inputs) => {
    const r = spawnSync(TOETSBRUG, [], { input: JSON.stringify({ opdracht, inputs }), encoding: "utf8", maxBuffer: 256 << 20 });
    return JSON.parse(r.stdout);
  };
  const staalInvoer = buildSteelCheckInputs({
    nodes, combinations, combinationResults, profileDb: new Map([["HEA160", { geometry: { h: 152 } }]]),
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" }],
  }).inputs;
  const houtInvoer = buildTimberCheckInputs({
    nodes, combinations, combinationResults,
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "96x450" }],
  }).inputs;
  for (const [naam, r, buigId, dwarsId] of [
    ["staal", kern("check_steel_beams", staalInvoer)[0], "6.2.5_bending_y", "6.2.6_shear_z"],
    ["hout", kern("check_timber_beams", houtInvoer)[0], "6.1.6_bending", "6.1.7_shear"],
  ]) {
    const o = maatgevendVanStaaf(r);
    check(`${naam}: maatgevend is de toets die de kern noemt, met de UC van de kern`,
      o.maatgevend?.id === r.governing_check_id && Math.abs(o.maatgevend.uc - r.uc_max) < 1e-12,
      `${o.maatgevend?.id} / ${r.governing_check_id}`);
    const buig = o.regels.find((x) => x.id === buigId);
    check(`${naam}: buiging op x = L/2 = 3000 mm in een UGT-combinatie`,
      buig?.positieMm === 3000 && ugt.has(buig.combinatieId), JSON.stringify(buig));
    const dwars = o.regels.find((x) => x.id === dwarsId);
    check(`${naam}: dwarskracht op het steunpunt x = 0 mm in een UGT-combinatie`,
      dwars?.positieMm === 0 && ugt.has(dwars.combinatieId), JSON.stringify(dwars));
    const doorb = o.regels.filter((x) => x.id.startsWith("deflection_"));
    check(`${naam}: de doorbuigingstoetsen tellen mee maar dragen geen combinatie of positie`,
      doorb.length === 2 && doorb.every((x) => x.teltMee && x.combinatieId === null && x.positieMm === null));
    check(`${naam}: elke positie ligt op de staaf (0 ≤ x ≤ L)`,
      o.regels.every((x) => x.positieMm === null || (x.positieMm >= 0 && x.positieMm <= L)));
    // De kern zet bij "geen drukkracht" soms GEEN notitie; dan is er ook geen
    // reden om te tonen. Er wordt er geen verzonnen: de redenen zijn woordelijk
    // de notities van de kern.
    const nvt = o.regels.filter((x) => x.status === "NotApplicable");
    check(`${naam}: een toets met status n.v.t. telt niet mee; de redenen zijn woordelijk de notities van de kern`,
      nvt.length > 0 && nvt.every((x) => !x.teltMee && x.uc === null &&
        JSON.stringify(x.redenen) === JSON.stringify(r.checks.find((c) => c.id === x.id).kind.data.notes)));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] puntOpStaaf: de markering ligt op de staaf");
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 4000 }];   // lengte 5000 mm
  const staaf = { from: 1, to: 2 };
  const p = puntOpStaaf(staaf, nodes, 2500);
  check("x = 2500 mm op een staaf van 5000 mm: het midden (1500, 2000)", p?.x === 1500 && p?.z === 2000, JSON.stringify(p));
  check("x = 0: de beginknoop", puntOpStaaf(staaf, nodes, 0)?.x === 0);
  check("voorbij het eind: op het eind gezet", puntOpStaaf(staaf, nodes, 9000)?.x === 3000);
  check("onbekende staaf of knoop: geen punt", puntOpStaaf(undefined, nodes, 10) === null && puntOpStaaf({ from: 1, to: 9 }, nodes, 10) === null);
  check("staaf zonder lengte: geen punt", puntOpStaaf({ from: 1, to: 1 }, nodes, 10) === null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[10] paneel, plaatkaart, rapport en vertalingen");
{
  const paneel = bron("src/components/panels/CheckPanel.tsx");
  check("het paneel leidt maatgevend af via lib/maatgevend", /maatgevendVanStaaf\(result\)/.test(paneel) && /modelMaatgevend\(results, plateResults\)/.test(paneel));
  check("het paneel toont het modeloverzicht, de regel per kaart en de toetslijst",
    paneel.includes("<ModelMaatgevendBlok") && paneel.includes("<MaatgevendRegel") && paneel.includes("<ToetsLijst"));
  check("de volgorde staat standaard op unity check", /useState<ToetsVolgorde>\("uc"\)/.test(paneel));
  check("de afleidingen volgen dezelfde volgorde als de lijst", /sorteerRegels\(overzicht\.regels, volgorde\)\.map/.test(paneel));
  const kaart = bron("src/components/panels/PlaatToetsKaart.tsx");
  check("de plaatkaart gebruikt dezelfde afleiding", kaart.includes("maatgevendVanPlaat(result)") && kaart.includes("<ToetsLijst"));
  const rapport = bron("src/components/report/sections/CheckTableSection.tsx");
  check("het rapport toont combinatie en positie uit dezelfde afleiding",
    rapport.includes("maatgevendVanStaaf(result)") && rapport.includes("report.maatgevendPositie") && rapport.includes("report.maatgevendToelichting"));
  const app = bron("src/App.tsx");
  check("App zet het tekenvlak op de combinatie en markeert de positie",
    app.includes("onToonOpTekenvlak={handleToonMaatgevend}") && /fem\.setActiveCombinationId\(id\)/.test(app) && app.includes("markering.zet("));
  check("het tekenvlak toont de markering", bron("src/components/fem/FemCanvas.tsx").includes("<MaatgevendMarkering"));

  // De weergave zelf: het onderscheid staat als TEKST, niet alleen als kleur.
  register(
    "data:text/javascript," +
      encodeURIComponent(
        "export async function load(url, ctx, next) {" +
          " if (url.split('?')[0].endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };" +
          " return next(url, ctx); }",
      ),
  );
  await import("./scripts/i18n-voor-tests.mjs");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MaatgevendRegel, ToetsLijst, ModelMaatgevendBlok } = await import("./src/components/panels/MaatgevendBlokken.tsx");
  const tekst = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  const r = staal(7, [
    toets("kip", 1.07, { comb: 4, x: 2500, titel: "Kipstabiliteit", artikel: "art. 6.3.2 (6.54)" }),
    toets("druk", null, { status: "NotApplicable", comb: 0, titel: "Druk", notes: ["Geen drukkracht."] }),
    toets("doorbuiging", 0.66, { comb: 0, titel: "Doorbuiging (BGT)" }),
  ], "kip");
  const o = maatgevendVanStaaf(r);
  const namen = new Map([[4, "UGT 6.10b"]]);
  const regel = tekst(renderToStaticMarkup(React.createElement(MaatgevendRegel, { overzicht: o, namen, onToon: () => {} })));
  check("samenvattingsregel: label, toets, artikel, combinatie met naam, positie in mm en UC",
    regel.includes("maatgevend") && regel.includes("Kipstabiliteit") && regel.includes("art. 6.3.2") &&
    regel.includes("comb. 4 (UGT 6.10b)") && /x = 2[.\s ]?500 mm/.test(regel) && regel.includes("1,07"), regel);
  check("samenvattingsregel: de klasse staat als woord erbij (niet alleen kleur)", regel.includes("overschreden"), regel);
  const regelHtml = renderToStaticMarkup(React.createElement(MaatgevendRegel, { overzicht: o, namen, onToon: () => {} }));
  check("met een combinatie is de regel een knop", regelHtml.includes("<button"));
  const zonder = maatgevendVanStaaf(staal(8, [toets("doorbuiging", 0.66, { comb: 0, titel: "Doorbuiging (BGT)" })], "doorbuiging"));
  const zonderHtml = renderToStaticMarkup(React.createElement(MaatgevendRegel, { overzicht: zonder, namen, onToon: () => {} }));
  check("zonder combinatie: geen knop, geen 'comb.', geen 'x ='",
    !zonderHtml.includes("<button") && !tekst(zonderHtml).includes("comb.") && !tekst(zonderHtml).includes("x ="), tekst(zonderHtml));
  const lijst = tekst(renderToStaticMarkup(React.createElement(ToetsLijst, { overzicht: o, volgorde: "uc", onVolgorde: () => {}, namen })));
  check("lijst: de n.v.t.-toets staat erin met reden en 'telt niet mee als maatgevend'",
    lijst.includes("Druk") && lijst.includes("Geen drukkracht.") && lijst.includes("telt niet mee als maatgevend"), lijst);
  check("lijst: keuze normvolgorde aanwezig", lijst.includes("normvolgorde") && lijst.includes("unity check, hoog naar laag"));
  check("lijst: het label maatgevend staat precies bij één toets", (lijst.match(/maatgevend(?! in| ;|;)/g) ?? []).length >= 1 &&
    renderToStaticMarkup(React.createElement(ToetsLijst, { overzicht: o, volgorde: "norm", onVolgorde: () => {}, namen }))
      .split("cp-toetsregel-maatgevend").length - 1 === 1);
  const blok = tekst(renderToStaticMarkup(React.createElement(ModelMaatgevendBlok, {
    model: modelMaatgevend([r, hout(2, [toets("b", 0.5, { titel: "Buiging" })], "b")], []), namen, onKies: () => {},
  })));
  check("modeloverzicht: maatgevende staaf van het model en per materiaal",
    blok.includes("Maatgevend in het model") && blok.includes("Staaf 7") && blok.includes("Staal") && blok.includes("Hout") && blok.includes("Staaf 2"), blok);

  // Het live rapport en de markering op het tekenvlak lezen uit een zustand-
  // store; bij renderen op de server geeft zustand de BEGINstand terug. Die twee
  // staan daarom in de browsertest (test-maatgevend-ui.mjs).

  // Vertalingen: dezelfde sleutels in alle vier de talen.
  const sleutels = (o, voor = "") => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? sleutels(v, `${voor}${k}.`) : [`${voor}${k}`]);
  const nlCheck = sleutels(JSON.parse(bron("src/i18n/locales/nl/check.json")).maatgevend).sort().join(",");
  const RAPPORT = ["maatgevendCombinatie", "maatgevendCombinatieMetNaam", "maatgevendPositie", "maatgevendGeen", "maatgevendToelichting"];
  for (const taal of ["nl", "en", "de", "fr"]) {
    const c = JSON.parse(bron(`src/i18n/locales/${taal}/check.json`)).maatgevend;
    check(`${taal}: check.maatgevend heeft dezelfde sleutels als nl`, c && sleutels(c).sort().join(",") === nlCheck);
    const rb = JSON.parse(bron(`src/i18n/locales/${taal}/ribbon.json`)).report;
    check(`${taal}: de rapportteksten bestaan`, RAPPORT.every((k) => typeof rb[k] === "string" && rb[k].length > 0));
  }
  // Elke sleutel die de componenten vragen, bestaat.
  const gevraagd = new Set();
  for (const pad of ["src/components/panels/MaatgevendBlokken.tsx", "src/components/panels/CheckBlock.tsx", "src/components/fem/MaatgevendMarkering.tsx"]) {
    for (const m of bron(pad).matchAll(/"maatgevend\.([A-Za-z.]+)"/g)) gevraagd.add(m[1]);
  }
  const aanwezig = new Set(nlCheck.split(",").map((k) => k.replace(/_(one|other)$/, "")));
  const mist = [...gevraagd].filter((k) => !aanwezig.has(k));
  check("elke gevraagde vertaalsleutel bestaat", gevraagd.size >= 15 && mist.length === 0, `mist: ${mist.join(", ")} (${gevraagd.size} gevraagd)`);
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed > 0 ? 1 : 0);
