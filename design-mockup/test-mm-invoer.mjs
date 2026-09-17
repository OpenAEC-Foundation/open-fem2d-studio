import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Een verkeerd eenheidslabel kan een geldige maat een factor 1000 veranderen.
const keys = {
  common: ["canvas.dim.distance", "canvas.beam.lengthPointDirection",
    "canvas.hud.beamLengthTyped", "canvas.hud.beamClickSecondNode",
    "canvas.popover.positionM", "canvas.popover.beginM", "canvas.popover.endM",
    "canvas.popover.invalidRange", "canvas.popover.invalidPosition",
    "canvas.popover.positionAlongBeam", "canvas.popover.positionAlongEdge",
    "loadCases.swayHeightTitle"],
  check: ["cfg.bucklingInPlane", "cfg.bucklingOutOfPlane", "cfg.bucklingEmptyIs",
    "cfg.ltbSupportSpacing", "props.beam.ltbSpacing", "props.beam.ltbSpacingHint",
    "props.beam.bracingPositions", "props.load.position", "props.load.start",
    "props.load.end", "props.load.startTitleBeam", "props.load.endTitleBeam",
    "props.load.startTitleEdge", "props.load.endTitleEdge", "concrete.column.l0Info"],
};
for (const language of ["nl", "en", "de", "fr"]) {
  for (const [namespace, paths] of Object.entries(keys)) {
    const data = JSON.parse(readFileSync(new URL(`./src/i18n/locales/${language}/${namespace}.json`, import.meta.url), "utf8"));
    for (const path of paths) {
      const label = path.split(".").reduce((obj, key) => obj[key], data);
      assert.match(label, /\bmm\b/, `${language}:${namespace}:${path}`);
    }
  }
}

const { parseLength, formatLength } = await import("./src/lib/lengthInput.ts");
for (const [raw, unit, expected] of [
  ["6000", "mm", 6000], ["3000", "mm", 3000],
  ["3000,25", "mm", 3000.25], ["3000.25", "mm", 3000.25],
  ["3000,25", "m", 3.00025], ["-25,5", "mm", -25.5],
  [" 250 ", "mm", 250], [",5", "mm", 0.5],
]) assert.equal(parseLength(raw, unit), expected, `${raw} naar ${unit}`);
for (const raw of ["", " ", "12mm", "1,2.3", "NaN", "Infinity", "--2", "2e3"]) {
  assert.ok(Number.isNaN(parseLength(raw)), `ongeldige maat: ${raw}`);
}
for (const [stored, unit, expected] of [
  [6, "m", "6000"], [3.00025, "m", "3000.25"],
  [0.3, "m", "300"], [300, "mm", "300"], [undefined, "m", ""],
  [1.001, "m", "1001"], [1.0001, "m", "1000.1"],
  [1e-7, "m", "0.0001"], [1.2345678901234567, "m", "1234.5678901234567"],
]) {
  assert.equal(formatLength(stored, unit), expected);
  if (stored !== undefined) assert.ok(Math.abs(parseLength(expected, unit) - stored) < 1e-12);
}
for (const language of ["nl", "fr"]) {
  for (const namespace of ["common", "check"]) {
    const text = readFileSync(new URL(`./src/i18n/locales/${language}/${namespace}.json`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /t\/mm\b|mmètre/, "Geen eenheidsvervanging in gewone woorden");
  }
}
console.log("PASS: mm-labels in vier talen, komma/punt, ongeldige invoer en oude opslageenheden");
