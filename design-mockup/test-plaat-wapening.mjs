// Wandwapening: UI, projectbestand, MCP-poort en UGT/BGT-doorgifte.
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { keurPlaatWapening } from "./src/lib/plaatWapening.ts";
import { buildPlaatCheckInputs } from "./src/lib/plaatCheckBuilder.ts";
import { controleerVelden } from "./src/mcp/valideerModel.ts";
import { serializeProject, deserializeProject } from "./src/io/projectFile.ts";
import { PlaatWapeningVenster } from "./src/components/fem/PlaatWapeningVenster.tsx";
import { verwerkVerzoek } from "./src/mcp/sidecar.ts";
import { verwerkVerzoek as viaBundel } from "../src-tauri/crates/openaec-mcp-server/assets/fem-kernel.mjs";
import { zetTaal } from "./scripts/i18n-voor-tests.mjs";

const h = { diameter_mm: 12, hoh_mm: 100, dekking_mm: 30 };
const v = { diameter_mm: 12, hoh_mm: 100, dekking_mm: 42 };
const wapening = { staalsoort: "B500B", horizontaal: { zijde_1: h, zijde_2: h },
  verticaal: { zijde_1: v, zijde_2: v }, milieuklasse: "XC3", f_ct_eff_mpa: 2.9,
  langdurend: true, hoge_aanhechting: true };
const plaat = { id: 1, nodeIds: [1, 2, 3, 4], thickness: 200, materiaal: "C30/37", wapening };
const model = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 },
  { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }], beams: [],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }], plates: [plaat],
  loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: 100, qDir: "z" }],
  loadCases: [{ id: 1, name: "Q", type: "live" }] };
const combinaties = [
  { id: 1, name: "UGT", type: "uls", formula: "1,5Q", factors: new Map([[1, 1.5]]) },
  { id: 2, name: "BGT frequent 1", type: "sls", formula: "0,5Q", factors: new Map([[1, 0.5]]) },
  { id: 3, name: "BGT frequent 2", type: "sls", formula: "0,8Q", factors: new Map([[1, 0.8]]) },
  { id: 4, name: "BGT quasi", type: "sls", formula: "0,3Q", factors: new Map([[1, 0.3]]) },
];

test("geldige UI-data reist exact door project en MCP-poort", () => {
  assert.deepEqual(keurPlaatWapening(wapening, "wapening", 200), []);
  assert.deepEqual(controleerVelden(model), []);
  const terug = deserializeProject(serializeProject({ ...model, activeLoadCaseId: 1,
    selfWeightEnabled: false, nonlinearEnabled: false }));
  assert.equal(terug.version, 2);
  assert.deepEqual(terug.plates[0].wapening, wapening);
  assert.deepEqual(controleerVelden({ ...model, plates: terug.plates }), []);
});

test("invoerbouwer houdt alle frequente combinaties apart van UGT en quasi", () => {
  const resultaten = new Map(combinaties.map(c => [c.id, { plateElements: [{ plateId: 1,
    elements: [{ elementId: 7, sigmaX: c.id, sigmaY: -c.id, tauXY: -0.2 }] }] }]));
  const input = buildPlaatCheckInputs({ plates: [plaat], combinations: combinaties,
    combinationResults: resultaten }).inputs[0];
  assert.deepEqual(input.wapening_aanwezig, wapening);
  assert.deepEqual(input.combinations.map(c => c.combination_id), [1]);
  assert.deepEqual(input.frequente_combinaties.map(c => c.combination_id), [2, 3]);
  assert.deepEqual(input.frequente_combinaties[1].elements[0], {
    element_id: 7, sigma_x_mpa: 3, sigma_y_mpa: -3, tau_xy_mpa: -0.2 });
  const { wapening: _, ...oud } = plaat;
  const invoerOud = buildPlaatCheckInputs({ plates: [oud], combinations: combinaties,
    combinationResults: resultaten }).inputs[0];
  assert.ok(!("wapening_aanwezig" in invoerOud));
  assert.ok(!("frequente_combinaties" in invoerOud));
});

test("MCP-sidecar rekent geldig wandmodel en bewaart wapeningsbasis", () => {
  const antwoord = verwerkVerzoek({ v: 1, id: 1, op: "check", payload: { model,
    combinations: combinaties.map(c => ({ ...c, factors: Object.fromEntries(c.factors) })) } });
  assert.equal(antwoord.ok, true, JSON.stringify(antwoord.error));
  const input = antwoord.result.plate_check_inputs[0];
  assert.deepEqual(input.wapening_aanwezig, wapening);
  assert.deepEqual(input.frequente_combinaties.map(c => c.combination_id), [2, 3]);
  assert.ok(input.combinations[0].elements.some(e => e.sigma_y_mpa > 0));
});

test("ontbrekende resultaten blijven zichtbaar als onvolledige combinaties", () => {
  const input = buildPlaatCheckInputs({ plates: [plaat], combinations: combinaties,
    combinationResults: new Map() }).inputs[0];
  assert.deepEqual(input.combinations, [{ combination_id: 1, elements: [] }]);
  assert.deepEqual(input.frequente_combinaties, [
    { combination_id: 2, elements: [] }, { combination_id: 3, elements: [] }]);
});

test("herbouwde MCP-bundel geeft hetzelfde geldige wapeningsmodel als de bron",
  { skip: process.env.TEST_PLAAT_BUNDEL !== "1" }, () => {
  const verzoek = { v: 1, id: 1, op: "check", payload: { model,
    combinations: combinaties.map(c => ({ ...c, factors: Object.fromEntries(c.factors) })) } };
  const bron = verwerkVerzoek(verzoek), bundel = viaBundel(verzoek);
  assert.equal(bundel.ok, true, JSON.stringify(bundel.error));
  assert.deepEqual(bundel.result.plate_check_inputs, bron.result.plate_check_inputs);
});

test("lege optionele scheurbasis blijft geldig en wordt niet aangevuld", () => {
  const { f_ct_eff_mpa, langdurend, hoge_aanhechting, ...oud } = wapening;
  assert.deepEqual(keurPlaatWapening(oud, "w", 200), []);
  const terug = deserializeProject(serializeProject({ ...model,
    plates: [{ ...plaat, wapening: oud }], activeLoadCaseId: 1,
    selfWeightEnabled: false, nonlinearEnabled: false }));
  assert.deepEqual(terug.plates[0].wapening, oud);
});

test("onjuist ingevulde laag of scheurbasis wordt bij MCP geweigerd", () => {
  for (const wijzig of [
    w => { w.horizontaal.zijde_1.hoh_mm = 0; },
    w => { w.horizontaal.zijde_1.dekking_mm = 199; },
    w => { w.verticaal.zijde_2.dekking_mm = 31; },
    w => { w.horizontaal.zijde_1.as_mm2_per_m = 100; },
    w => { w.f_ct_eff_mpa = 0; },
    w => { w.langdurend = "true"; },
    w => { w.onbekend = 1; },
  ]) {
    const kopie = structuredClone(wapening); wijzig(kopie);
    assert.ok(controleerVelden({ ...model, plates: [{ ...plaat, wapening: kopie }] }).length > 0);
  }
});

test("UI rendert alle lagen, scheurbasis en domein in vier talen", async () => {
  for (const taal of ["nl", "en", "de", "fr"]) {
    await zetTaal(taal);
    const html = renderToStaticMarkup(React.createElement(PlaatWapeningVenster, { plate: plaat }));
    assert.ok(!html.includes("props.plate.wapening."));
    assert.equal((html.match(/value="12"/g) ?? []).length, 4);
    assert.ok(html.includes('value="2.9"'));
    assert.ok(!html.includes('role="alert"'));
  }
  await zetTaal("nl");
  const w = structuredClone(wapening); w.horizontaal.zijde_1.hoh_mm = 0;
  assert.ok(renderToStaticMarkup(React.createElement(PlaatWapeningVenster, {
    plate: { ...plaat, wapening: w } })).includes('role="alert"'));
});
