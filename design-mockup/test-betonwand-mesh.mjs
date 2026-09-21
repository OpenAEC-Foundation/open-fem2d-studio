// Gerichte contracttest tegen de bron; geen sidecar- of toetsbrugbuild nodig.
// Uitvoeren: node --import tsx --test test-betonwand-mesh.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { buildPlaatCheckInputs } from "./src/lib/plaatCheckBuilder.ts";

function data() {
  const laag = { diameter_mm: 12, hoh_mm: 100, dekking_mm: 30 };
  const result = () => ({
    plateElements: [{ plateId: 1, expectedElementIds: [7, 8], elements: [7, 8].map(elementId => ({
      elementId, sigmaX: 1, sigmaY: 0, tauXY: 0,
    })) }],
  });
  return {
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 200, materiaal: "C30/37",
      wapening: { staalsoort: "B500B", horizontaal: { zijde_1: laag, zijde_2: laag }, verticaal: {} } }],
    combinations: [
      { id: 1, name: "UGT", type: "uls", factors: {} },
      { id: 2, name: "BGT frequent", type: "sls", factors: {} },
    ],
    combinationResults: new Map([[1, result()], [2, result()]]),
  };
}
const build = d => buildPlaatCheckInputs(d).inputs[0];

test("onafhankelijke mesh wordt doorgegeven, ook als een element overal ontbreekt", () => {
  const d = data();
  for (const r of d.combinationResults.values()) r.plateElements[0].elements.pop();
  const i = build(d);
  assert.deepEqual(i.expected_element_ids, [7, 8]);
  assert.deepEqual(i.combinations[0].elements.map(e => e.element_id), [7]);
  assert.deepEqual(i.frequente_combinaties[0].elements.map(e => e.element_id), [7]);
});

test("metadata is een set: andere volgorde blijft geldig", () => {
  const d = data();
  d.combinationResults.get(2).plateElements[0].expectedElementIds.reverse();
  const i = build(d);
  assert.deepEqual(i.expected_element_ids, [7, 8]);
  assert.equal(i.mesh_fout, undefined);
});

for (const id of [1, 2]) {
  for (const ids of [undefined, [], [7, 7], [7], [7, 9], [7, -1], [7, 1.5]]) {
    test(`ongeldige of afwijkende meshmetadata blijft zichtbaar: combinatie ${id}, ${JSON.stringify(ids)}`, () => {
      const d = data();
      d.combinationResults.get(id).plateElements[0].expectedElementIds = ids;
      const i = build(d);
      assert.ok(i.mesh_fout?.includes(String(id)), "de kern moet de metadatafout krijgen");
    });
  }
  test(`ontbrekend solverresultaat blijft als lege combinatie zichtbaar: ${id}`, () => {
    const d = data();
    d.combinationResults.delete(id);
    const i = build(d);
    assert.ok(i.mesh_fout);
    const cs = id === 1 ? i.combinations : i.frequente_combinaties;
    assert.deepEqual(cs, [{ combination_id: id, elements: [] }]);
  });
}

test("geen metadata wordt nooit uit resultaat-unie afgeleid", () => {
  const d = data();
  for (const r of d.combinationResults.values()) delete r.plateElements[0].expectedElementIds;
  const i = build(d);
  assert.equal(i.expected_element_ids, undefined);
  assert.ok(i.mesh_fout);
});

test("beton zonder wapening bewaart ook ontbrekende UGT-combinaties", () => {
  const d = data();
  delete d.plates[0].wapening;
  d.combinationResults.delete(1);
  const i = build(d);
  assert.deepEqual(i.combinations, [{ combination_id: 1, elements: [] }]);
  assert.ok(i.mesh_fout);
});

test("lege en dubbele resultaten blijven zichtbaar voor kernvalidatie", () => {
  for (const id of [1, 2]) {
    for (const ids of [[], [7, 7], [7, 8, 9]]) {
      const d = data();
      d.combinationResults.get(id).plateElements[0].elements = ids.map(elementId => ({
        elementId, sigmaX: 1, sigmaY: 0, tauXY: 0,
      }));
      const i = build(d);
      assert.deepEqual(i.expected_element_ids, [7, 8]);
      const cs = id === 1 ? i.combinations : i.frequente_combinaties;
      assert.deepEqual(cs[0].elements.map(e => e.element_id), ids);
    }
  }
});

test("dubbele combinatie-ids worden niet stil samengevoegd", () => {
  const d = data();
  d.combinations.push({ ...d.combinations[0] });
  assert.deepEqual(build(d).combinations.map(c => c.combination_id), [1, 1]);
  d.combinations[1].id = 1;
  assert.deepEqual(build(d).frequente_combinaties.map(c => c.combination_id), [1]);
});

test("onbekende of quasi-blijvende BGT wordt niet als frequent aangenomen", () => {
  for (const name of ["BGT eigen", "BGT quasi-blijvend"]) {
    const d = data();
    d.combinations[1].name = name;
    d.combinationResults.get(2).plateElements[0].expectedElementIds = [99];
    const i = build(d);
    assert.deepEqual(i.frequente_combinaties, []);
    assert.equal(i.mesh_fout, undefined);
  }
});
