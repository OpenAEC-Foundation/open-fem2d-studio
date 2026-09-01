# @openaec/design-tokens

> Machine-readable counterpart to [`brandbook/DESIGN-SYSTEM.md`](../../brandbook/DESIGN-SYSTEM.md).
> Token values here MUST stay aligned with DESIGN-SYSTEM.md §2 (Design Tokens).

Design tokens, layout CSS en Tailwind preset voor alle OpenAEC applicaties.

---

## Wat zit er in

- **`tokens/*.json`** — source of truth: colors, typography, spacing, radius,
  shadow, semantic. Naming volgt DESIGN-SYSTEM.md §2 (amber, deep-forge,
  signal-orange, warm-gold, scaffold-gray, blueprint-white, concrete,
  night-build) plus aliases (`primary` → amber, `primary-hover` →
  signal-orange).
- **`extensions/warmteverlies.json`** — domein-kleuren voor ISSO 51
  warmteverliesberekening (exterior / unheated / adjacent-room / heated-zone /
  ground / water). Apart zodat andere apps ze niet meekrijgen.
- **`dist/tokens.css`** — alle tokens als CSS custom properties. Light op
  `:root`, dark via `[data-theme="dark"]` + `prefers-color-scheme` fallback.
- **`dist/tokens.js`** — zelfde tokens als CommonJS object (Tauri / Electron /
  JS-consumers).
- **`dist/tailwind.preset.js`** — Tailwind preset met `theme.extend` op colors,
  fontFamily, fontSize, lineHeight, letterSpacing, spacing, borderRadius,
  boxShadow.
- **`src/layouts.css`** — app-shell klassen (`.oa-app-shell`, `.oa-topbar`,
  `.oa-ribbon`, `.oa-sidebar`, `.oa-main`, `.oa-panel`).
- **`src/components.css`** — primitives (`.oa-btn`, `.oa-card`, `.oa-input`,
  `.oa-badge`).
- **`preview/index.html`** — visuele showcase met theme-toggle. Open met
  dubbelklik.

---

## Installatie

Vanuit GitHub (zolang het pakket niet op npm staat):

```bash
npm install github:OpenAEC-Foundation/OpenAEC-style-book#main
# of als subpath package:
npm install "github:OpenAEC-Foundation/OpenAEC-style-book#main&workspaces=packages/tokens"
```

Lokaal tijdens development:

```bash
npm install ../../OpenAEC-style-book/packages/tokens
```

---

## Hoe te gebruiken

### 1. Tailwind-app (Warmteverlies, BCF Platform, Cutlist, Reports)

```ts
// tailwind.config.ts
import openaecPreset from "@openaec/design-tokens/tailwind";

export default {
  presets: [openaecPreset],
  content: ["./src/**/*.{html,ts,tsx,svelte,vue}"],
  // eigen project-specifieke extends hier
};
```

In je root CSS:

```css
/* app.css */
@import "@openaec/design-tokens/css";        /* tokens.css met --vars */
@import "@openaec/design-tokens/layouts";    /* optioneel: app-shell klassen */
@import "@openaec/design-tokens/components"; /* optioneel: primitives */

@tailwind base;
@tailwind components;
@tailwind utilities;
```

Utility classes werken nu met style-book naming én aliases:

```html
<!-- style-book naming -->
<button class="bg-amber hover:bg-signal-orange text-blueprint-white px-4 py-2 rounded-md">
  Genereer rapport
</button>

<!-- of met aliases -->
<button class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md">
  Opslaan
</button>
```

### 2. Non-Tailwind-app (Rust/Askama templates, vanilla HTML)

Importeer `dist/tokens.css` + optioneel `src/layouts.css` en `src/components.css`:

```html
<link rel="stylesheet" href="/static/openaec/tokens.css" />
<link rel="stylesheet" href="/static/openaec/layouts.css" />
<link rel="stylesheet" href="/static/openaec/components.css" />

<div class="oa-app-shell">
  <aside class="oa-sidebar">...</aside>
  <div class="oa-main-col">
    <header class="oa-topbar">...</header>
    <main class="oa-main">
      <section class="oa-panel">
        <button class="oa-btn oa-btn--primary">Opslaan</button>
      </section>
    </main>
  </div>
</div>
```

CSS custom properties zijn direct beschikbaar met zowel style-book naming als
aliases:

```css
.my-custom-thing {
  background: var(--color-panel);             /* alias */
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);

  /* of direct op brand-niveau */
  accent-color: var(--color-brand-amber);
  outline-color: var(--color-brand-signal-orange);
}
```

### 3. JS consumer (Tauri Agent Dashboard, Electron, Node-scripts)

```js
const tokens = require("@openaec/design-tokens");

// Structuur:
// tokens.static  — brand, neutral, spacing, radius, shadow, font-*
// tokens.light   — surface, text, border, semantic (light variant)
// tokens.dark    — idem (dark variant)

console.log(tokens.static["color-brand-amber"]);   // "#D97706"
console.log(tokens.static["color-brand-primary"]); // "#D97706" (alias)
console.log(tokens.light["color-surface-bg"]);     // "#FAFAF9"
console.log(tokens.dark["color-surface-bg"]);      // "#36363E"
```

ESM:

```js
import tokens from "@openaec/design-tokens";
```

---

## Building

```bash
npm install
npm run build
```

Dit regenereert `dist/tokens.css`, `dist/tokens.js` en
`dist/tailwind.preset.js` uit `tokens/*.json`. `dist/` wordt bewust
gecommit zodat consumers zonder build-stap kunnen gebruiken.

---

## Preview

Open `preview/index.html` direct in de browser (dubbelklik) — er is geen
dev-server nodig. De theme-toggle rechtsboven schakelt tussen light en dark.

Of:

```bash
npm run preview
```

De preview toont: alle brand swatches met style-book naming, neutral scale,
theme-aware surfaces, semantic kleuren, warmteverlies extension, type-samples,
spacing-schaal, radius, shadows, alle button-varianten, input/card/badge, en
een complete app-shell met ribbon + sidebar + panels.

---

## Warmteverlies extension

Domein-kleuren voor ISSO 51 begrenzingstypes zitten bewust niet in de core
tokens — alleen de warmteverlies-app heeft ze nodig.

```js
import wv from "@openaec/design-tokens/extensions/warmteverlies";

wv.color.warmteverlies.exterior.value;        // "#3B82F6"
wv.color.warmteverlies.unheated.value;        // "#A855F7"
wv.color.warmteverlies["adjacent-room"].value; // "#EAB308"
```

Of kopieer de hex-waarden handmatig uit `extensions/warmteverlies.json` in je
eigen Tailwind config / CSS:

```css
:root {
  --wv-exterior:      #3B82F6;
  --wv-unheated:      #A855F7;
  --wv-adjacent-room: #EAB308;
  --wv-heated-zone:   #EF4444;
  --wv-ground:        #92400E;
  --wv-water:         #0EA5E9;
}
```

---

## Theme switching (dark / light)

**Light is default.** Om dark te activeren zet je `data-theme="dark"` op
`<html>` of `<body>`:

```js
document.documentElement.setAttribute("data-theme", "dark");
```

`tokens.css` bevat ook een `prefers-color-scheme: dark` fallback die dark
activeert als er geen expliciete `data-theme` is gezet. Voor "volg systeem"-
gedrag is dus geen JS nodig.

Onthoud als keuze in `localStorage`:

```js
const saved = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", saved);

function setTheme(mode) {
  localStorage.setItem("theme", mode);
  document.documentElement.setAttribute("data-theme", mode);
}
```

Brand-kleuren (amber, deep-forge etc.) **wisselen niet** tussen themes —
alleen surfaces, text en borders kantelen.

---

## Relation to other parts of this repo

| Pad | Doel |
|-----|------|
| [`../../brandbook/DESIGN-SYSTEM.md`](../../brandbook/DESIGN-SYSTEM.md) | **Authoritative** tokens spec (documentatie) — waarden in deze package MOETEN aligned blijven met §2 |
| [`../../brandbook/LAYOUTS.md`](../../brandbook/LAYOUTS.md) | Layout-patronen documentatie (website, web tools, desktop tools, print) |
| [`../../brandbook/styleguide.html`](../../brandbook/styleguide.html) | Visuele gerenderde styleguide |
| [`../../project-templates/Tauri+React/`](../../project-templates/Tauri+React/) | Kant-en-klare desktop-app template die deze tokens consumeert |

Wanneer je een token-waarde wilt aanpassen:

1. Eerst bijwerken in `brandbook/DESIGN-SYSTEM.md` §2 (de norm).
2. Dan de overeenkomstige waarde in `tokens/*.json` aanpassen.
3. `npm run build` draaien om `dist/*` te regenereren.
4. Beide files in één commit.

---

## Tokens bewerken

1. Edit een JSON-file in `tokens/` of `extensions/`.
2. Run `npm run build` — regenereert `dist/*`.
3. Commit `tokens/*` en `dist/*` samen.

Het JSON-formaat is Style Dictionary-compatible:

```json
{
  "color": {
    "brand": {
      "amber": { "value": "#D97706", "comment": "Primary brand" }
    }
  }
}
```

Themed tokens leven onder `color.surface.{light|dark}`, `color.text.{light|dark}`,
`color.border.{light|dark}` en `color.semantic.{light|dark}`. De build splitst
de `light`-tak naar `:root` en de `dark`-tak naar `[data-theme="dark"]`.

---

## License

CC-BY-SA 4.0 — zie de root [`LICENSE`](../../LICENSE) van de style-book repo.
