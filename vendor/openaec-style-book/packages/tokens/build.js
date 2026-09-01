#!/usr/bin/env node
/**
 * Build script voor @openaec/design-tokens.
 *
 * Leest tokens/*.json (+ extensions/*.json) en genereert:
 *   - dist/tokens.css           :root light vars + [data-theme="dark"] overrides + prefers-color-scheme fallback
 *   - dist/tokens.js            CommonJS export als JS object
 *   - dist/tailwind.preset.js   Tailwind preset met theme.extend
 *
 * We doen het bewust zonder Style Dictionary's format-engine omdat onze theme-
 * splitsing (surface/text/border hebben light+dark varianten in dezelfde JSON)
 * een maatwerk walker vraagt. De JSON-files volgen wel de SD-conventie
 * { path.to.token: { value, comment } } zodat een latere SD-migratie triviaal is.
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const TOKENS_DIR = path.join(ROOT, "tokens");
const EXT_DIR = path.join(ROOT, "extensions");
const DIST_DIR = path.join(ROOT, "dist");

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isTokenLeaf(obj) {
  return obj && typeof obj === "object" && "value" in obj;
}

/**
 * Walk een token tree en yield { path: [..], value, comment } voor elke leaf.
 */
function* walkTokens(tree, prefix = []) {
  for (const [key, val] of Object.entries(tree)) {
    if (key.startsWith("$")) continue; // skip metadata
    if (isTokenLeaf(val)) {
      yield { path: [...prefix, key], value: val.value, comment: val.comment };
    } else if (val && typeof val === "object") {
      yield* walkTokens(val, [...prefix, key]);
    }
  }
}

function kebab(segments) {
  return segments.map((s) => s.toString().toLowerCase()).join("-");
}

// -----------------------------------------------------------------------------
// Load all token files
// -----------------------------------------------------------------------------

const tokenFiles = fs
  .readdirSync(TOKENS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

let merged = {};
for (const f of tokenFiles) {
  const data = readJson(path.join(TOKENS_DIR, f));
  merged = deepMerge(merged, data);
}

function deepMerge(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return b;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = k in a ? deepMerge(a[k], v) : v;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Split tokens into (themed-light, themed-dark, static)
//
// Themed tokens zijn de paden: color.surface.light/dark, color.text.light/dark,
// color.border.light/dark, color.semantic.light/dark.
// -----------------------------------------------------------------------------

const THEMED_ROOTS = [
  ["color", "surface"],
  ["color", "text"],
  ["color", "border"],
  ["color", "semantic"],
];

function pathStartsWith(pathArr, prefix) {
  if (pathArr.length < prefix.length) return false;
  return prefix.every((seg, i) => pathArr[i] === seg);
}

function isThemedPath(pathArr) {
  return THEMED_ROOTS.some((root) => pathStartsWith(pathArr, root));
}

function stripTheme(pathArr) {
  // ["color","surface","light","bg"] -> ["color","surface","bg"]
  // themed root length+1 is de mode segment
  for (const root of THEMED_ROOTS) {
    if (pathStartsWith(pathArr, root)) {
      const out = pathArr.slice();
      out.splice(root.length, 1);
      return out;
    }
  }
  return pathArr;
}

function themeOf(pathArr) {
  for (const root of THEMED_ROOTS) {
    if (pathStartsWith(pathArr, root)) return pathArr[root.length];
  }
  return null;
}

// -----------------------------------------------------------------------------
// Collect vars
// -----------------------------------------------------------------------------

const lightVars = []; // {name, value, comment}
const darkVars = [];
const staticVars = [];

for (const leaf of walkTokens(merged)) {
  if (isThemedPath(leaf.path)) {
    const mode = themeOf(leaf.path);
    const cssName = "--" + kebab(stripTheme(leaf.path));
    const entry = { name: cssName, value: leaf.value, comment: leaf.comment };
    if (mode === "light") lightVars.push(entry);
    else if (mode === "dark") darkVars.push(entry);
  } else {
    const cssName = "--" + kebab(leaf.path);
    staticVars.push({ name: cssName, value: leaf.value, comment: leaf.comment });
  }
}

// -----------------------------------------------------------------------------
// Render tokens.css
// -----------------------------------------------------------------------------

function renderVarBlock(vars, indent = "  ") {
  const lines = [];
  for (const v of vars) {
    if (v.comment) lines.push(`${indent}/* ${v.comment} */`);
    lines.push(`${indent}${v.name}: ${v.value};`);
  }
  return lines.join("\n");
}

const css = `/**
 * @openaec/design-tokens — tokens.css
 * Auto-gegenereerd door build.js. Niet handmatig bewerken.
 *
 * Light theme is default op :root.
 * Dark via [data-theme="dark"] attribute selector.
 * Voor OS-voorkeur ondersteuning ook prefers-color-scheme fallback (alleen als er geen expliciete data-theme is gezet).
 */

:root {
  /* --- Statische tokens (brand, neutral, typography, spacing, radius, shadow) --- */
${renderVarBlock(staticVars)}

  /* --- Light theme (default) --- */
${renderVarBlock(lightVars)}

  /* --- Aliases voor snelle consumption --- */
  --color-bg:        var(--color-surface-bg);
  --color-panel:     var(--color-surface-panel);
  --color-elevated:  var(--color-surface-elevated);
  --color-muted:     var(--color-surface-muted);

  --color-text:           var(--color-text-primary);
  --color-text-secondary: var(--color-text-secondary);
  --color-text-muted:     var(--color-text-muted);
  --color-text-inverse:   var(--color-text-inverse);

  --color-border:        var(--color-border-default);
  --color-border-strong: var(--color-border-strong);
  --color-border-focus:  var(--color-border-focus);
}

/* Expliciete dark-mode via attribuut */
[data-theme="dark"] {
${renderVarBlock(darkVars)}
}

/* OS-voorkeur fallback (alleen als er geen expliciete data-theme="light" is) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${renderVarBlock(darkVars, "    ")}
  }
}
`;

// -----------------------------------------------------------------------------
// Render tokens.js — flat object of vars en theme-splitsing
// -----------------------------------------------------------------------------

const jsObj = {
  static: Object.fromEntries(staticVars.map((v) => [v.name.slice(2), v.value])),
  light: Object.fromEntries(lightVars.map((v) => [v.name.slice(2), v.value])),
  dark: Object.fromEntries(darkVars.map((v) => [v.name.slice(2), v.value])),
};

const js = `/**
 * @openaec/design-tokens — tokens.js
 * Auto-gegenereerd door build.js. Niet handmatig bewerken.
 *
 * JS object met alle tokens, opgesplitst in static / light / dark.
 * Handig voor Tauri / Electron / JS-consumers die programmatic access nodig hebben.
 */
module.exports = ${JSON.stringify(jsObj, null, 2)};
`;

// -----------------------------------------------------------------------------
// Render tailwind.preset.js
// -----------------------------------------------------------------------------

function pickBrand() {
  const out = {};
  for (const v of walkTokens(merged.color.brand || {})) {
    out[v.path.join("-")] = v.value;
  }
  return out;
}
function pickNeutral() {
  const out = {};
  for (const v of walkTokens(merged.color.neutral || {})) {
    out[v.path.join("-")] = v.value;
  }
  return out;
}
function pickSemanticLight() {
  const out = {};
  for (const v of walkTokens(merged.color.semantic?.light || {})) {
    out[v.path.join("-")] = v.value;
  }
  return out;
}

const brandColors = pickBrand();
const neutralColors = pickNeutral();
const semanticColors = pickSemanticLight();

const twColors = {
  // Style-book naming (DESIGN-SYSTEM.md §2.1)
  amber: brandColors["amber"],
  "deep-forge": brandColors["deep-forge"],
  "signal-orange": brandColors["signal-orange"],
  "warm-gold": brandColors["warm-gold"],
  "scaffold-gray": brandColors["scaffold-gray"],
  "blueprint-white": brandColors["blueprint-white"],
  concrete: brandColors["concrete"],
  "night-build": brandColors["night-build"],
  // Aliases — amber blijft ook onder `primary` naam beschikbaar
  primary: brandColors["primary"],
  "primary-hover": brandColors["primary-hover"],
  accent: brandColors["accent"],
  neutral: neutralColors,
  success: semanticColors["success"],
  error: semanticColors["error"],
  danger: semanticColors["danger"],
  warning: semanticColors["warning"],
  info: semanticColors["info"],
  // CSS-var bridge — consumer kan bv. `bg-surface` gebruiken en dark-mode volgt automatisch
  surface: "var(--color-surface-bg)",
  panel: "var(--color-surface-panel)",
  "text-primary": "var(--color-text-primary)",
  "text-secondary": "var(--color-text-secondary)",
  "text-muted": "var(--color-text-muted)",
  "border-default": "var(--color-border-default)",
};

const twFontFamily = {
  heading: splitFontStack(merged.font.family.heading.value),
  body: splitFontStack(merged.font.family.body.value),
  mono: splitFontStack(merged.font.family.mono.value),
  sans: splitFontStack(merged.font.family.body.value),
};

function splitFontStack(stack) {
  return stack.split(",").map((s) => s.trim().replace(/^'(.*)'$/, "$1"));
}

const twFontSize = Object.fromEntries(
  Object.entries(merged.font.size).map(([k, v]) => [k, v.value])
);

const twLineHeight = Object.fromEntries(
  Object.entries(merged.font["line-height"] || {}).map(([k, v]) => [k, v.value])
);

const twLetterSpacing = Object.fromEntries(
  Object.entries(merged.font["letter-spacing"] || {}).map(([k, v]) => [k, v.value])
);

const twSpacing = Object.fromEntries(
  Object.entries(merged.spacing).map(([k, v]) => [k, v.value])
);

const twBorderRadius = Object.fromEntries(
  Object.entries(merged.radius).map(([k, v]) => [k, v.value])
);

const twBoxShadow = Object.fromEntries(
  Object.entries(merged.shadow).map(([k, v]) => [k, v.value])
);

const preset = `/**
 * @openaec/design-tokens — tailwind.preset.js
 * Auto-gegenereerd door build.js. Niet handmatig bewerken.
 *
 * Gebruik in je Tailwind project:
 *   // tailwind.config.ts
 *   import oaPreset from "@openaec/design-tokens/tailwind";
 *   export default { presets: [oaPreset], content: [...] };
 *
 * Dark mode staat ingesteld op 'class' via [data-theme="dark"] selector.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: ${JSON.stringify(twColors, null, 6).replace(/\n/g, "\n      ")},
      fontFamily: ${JSON.stringify(twFontFamily, null, 6).replace(/\n/g, "\n      ")},
      fontSize: ${JSON.stringify(twFontSize, null, 6).replace(/\n/g, "\n      ")},
      lineHeight: ${JSON.stringify(twLineHeight, null, 6).replace(/\n/g, "\n      ")},
      letterSpacing: ${JSON.stringify(twLetterSpacing, null, 6).replace(/\n/g, "\n      ")},
      spacing: ${JSON.stringify(twSpacing, null, 6).replace(/\n/g, "\n      ")},
      borderRadius: ${JSON.stringify(twBorderRadius, null, 6).replace(/\n/g, "\n      ")},
      boxShadow: ${JSON.stringify(twBoxShadow, null, 6).replace(/\n/g, "\n      ")}
    }
  }
};
`;

// -----------------------------------------------------------------------------
// Write outputs
// -----------------------------------------------------------------------------

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

fs.writeFileSync(path.join(DIST_DIR, "tokens.css"), css, "utf8");
fs.writeFileSync(path.join(DIST_DIR, "tokens.js"), js, "utf8");
fs.writeFileSync(path.join(DIST_DIR, "tailwind.preset.js"), preset, "utf8");

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------

console.log("build: @openaec/design-tokens");
console.log("  input:");
for (const f of tokenFiles) console.log(`    - tokens/${f}`);
console.log("  output:");
console.log(`    - dist/tokens.css         (${staticVars.length} static + ${lightVars.length} light + ${darkVars.length} dark vars)`);
console.log(`    - dist/tokens.js          (CommonJS export)`);
console.log(`    - dist/tailwind.preset.js (theme.extend)`);
console.log("done.");
