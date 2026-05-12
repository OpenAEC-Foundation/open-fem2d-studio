# OpenAEC Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Open-FEM2D-Studio into a fully OpenAEC-Foundation-compliant desktop application with Tauri v2 wrapper, OpenAEC design tokens, modernized A4 reports per OpenAEC §4.3 spec, and proper organizational identity.

**Architecture:** Four sequential phases. Phase A lays the design-token foundation with backwards-compat shim so existing 42 component CSS files keep working unchanged. Phase B adds OpenAEC shell components (Backstage, SettingsDialog, Modal, AboutDialog, TitleBar). Phase D modernizes the report system (live preview + HTML export). Phase C migrates from Electron to Tauri v2 with a hard cutover. Each phase ends in a working app — you can stop, verify, and resume.

**Tech Stack:** React 18 + TypeScript + Vite (frontend), Tauri v2 + Rust (desktop wrapper, replaces Electron 40), Playwright (existing E2E tests), browser-print for PDF generation.

**Spec source-of-truth:** [docs/superpowers/specs/2026-05-12-openaec-migration-tauri-reports-design.md](../specs/2026-05-12-openaec-migration-tauri-reports-design.md) (commit 843a744)

**Testing approach:** This codebase has no unit-test runner (only Playwright E2E). For each task: TypeScript strict check (`npx tsc --noEmit`) is mandatory. For visible UI changes: visual smoke test by running app. For logic-heavy components: optional Playwright e2e snippet. The 3 existing `test-*.mjs` UI tests must stay green throughout.

**Commit cadence:** One commit per task. ~30 tasks total → ~30 commits.

---

## File Structure Overview

### Phase A — Design tokens & theming (5 new files, 4 modified)
```
NEW:
  src/styles/tokens.css            — OpenAEC raw tokens (locked values)
  src/styles/themes.css            — Semantic theme vars + legacy shim
  src/styles/canvas-tokens.css     — Canvas-specific tokens
MODIFIED:
  src/index.css                    — Imports + body base + h1-h6 typography (rewrite)
  index.html                       — Google Fonts + title
  src/core/report/ReportConfig.ts  — Remove 3BM, set OpenAEC defaults
  src/components/Ribbon/Ribbon.tsx — Theme key 'dark' → 'openaec'
  package.json                     — author, description
  README.md                        — OpenAEC badges + branding
```

### Phase B — Shell components (5 new component dirs, 5 modified)
```
NEW:
  src/components/Modal/Modal.tsx + .css
  src/components/Backstage/Backstage.tsx + .css
  src/components/SettingsDialog/SettingsDialog.tsx + .css
  src/components/AboutDialog/AboutDialog.tsx + .css
  src/components/TitleBar/TitleBar.tsx + .css
MODIFIED:
  src/components/Ribbon/Ribbon.tsx + .css   — 122px, file tab amber, animated indicator
  src/components/StatusBar/StatusBar.css    — 22px height
  src/components/FileTabs/FileTabs.css      — Amber active indicator (explicit)
  src/App.tsx                                — TitleBar swap, state hooks, escape stack
  src/i18n/en.ts + nl.ts + es.ts + fr.ts + it.ts + zh.ts — backstage/settings/about keys
```

### Phase D — Report modernization (4 new files, ~15 modified, 1 deleted)
```
NEW:
  public/openaec-assets/logo/openaec-logo-amber-on-dark.svg
  public/openaec-assets/logo/openaec-symbol-amber-on-dark.svg
  public/openaec-assets/illustrations/report-header-dark.svg
  public/openaec-assets/icons/footer-icons.svg
  src/core/report/ReportTheme.ts        — Hex constants + inline SVG strings
  src/core/report/ReportHeader.ts       — Header banner generator
  src/core/report/ReportFooter.ts       — Footer generator
MODIFIED:
  src/core/report/ReportConfig.ts                       — Colors + new fields
  src/core/report/ReportGenerator.ts                    — Full rewrite: §4.3 layout
  src/components/ReportPanel/sections/CoverSection.tsx + 11 others — Restyle
  src/components/ReportPanel/ReportPanel.css            — Print stylesheet
  src/components/ReportPanel/ReportPreview.tsx          — Print integration
  src/components/ReportPanel/ReportSettingsDialog.tsx   — Default amber
  src/i18n/*.ts                                          — ~30 report keys × 6 locales
DELETED (after audit):
  src/core/report/LegacyReportGenerator.ts (only if unused)
```

### Phase C — Tauri v2 migration (10 new files, 7 modified, 1 folder deleted)
```
NEW:
  src-tauri/Cargo.toml
  src-tauri/tauri.conf.json
  src-tauri/src/main.rs
  src-tauri/build.rs
  src-tauri/.gitignore
  src-tauri/icons/  (32, 128, 128@2x, .icns, .ico)
  src/lib/windowApi.ts
  src/lib/storeApi.ts
  src/lib/fileApi.ts
  src/lib/migrateLocalStorage.ts
MODIFIED:
  package.json                                — deps + scripts
  vite.config.ts                              — Tauri requirements
  src/components/TitleBar/TitleBar.tsx + .css — Window controls + drag region
  src/components/Backstage/Backstage.tsx     — Wire to fileApi/windowApi
  .gitignore                                  — /src-tauri/target
  README.md                                   — Tauri build + Rust prereq
DELETED:
  electron/main.cjs
  electron/  (whole folder)
```

---

# PHASE A — Design Tokens & Theming

**Phase goal:** Replace GitHub-dark palette with OpenAEC tokens. Backwards-compat shim ensures all existing components keep working without per-file refactor.

**Phase verification:** App opens with amber accents (not blue), theme toggle works (light ↔ openaec), existing `.json` projects open, `npx tsc --noEmit` PASS, no console warnings about missing fonts.

---

### Task A.1: Create raw tokens file

**Files:**
- Create: `src/styles/tokens.css`

- [ ] **Step 1: Create tokens.css with OpenAEC raw tokens**

```css
/* src/styles/tokens.css
 * OpenAEC Foundation — raw design tokens (locked per Style Book v0.4)
 * Source: github.com/OpenAEC-Foundation/OpenAEC-style-book
 */
:root {
  /* ─── Colors ─── */
  --c-amber:           #D97706;
  --c-deep-forge:      #36363E;
  --c-signal-orange:   #EA580C;
  --c-warm-gold:       #F59E0B;
  --c-scaffold-gray:   #A1A1AA;
  --c-blueprint-white: #FAFAF9;
  --c-concrete:        #F5F5F4;
  --c-night-build:     #2A2A32;
  --c-success:         #16A34A;
  --c-error:           #DC2626;
  --c-info:            #2563EB;
  --c-border:          #E7E5E4;
  --c-border-hover:    #D6D3D1;

  /* ─── Spacing (4px base) ─── */
  --sp-1:  0.25rem;  --sp-2:  0.5rem;   --sp-3:  0.75rem;
  --sp-4:  1rem;     --sp-5:  1.25rem;  --sp-6:  1.5rem;
  --sp-8:  2rem;     --sp-10: 2.5rem;   --sp-12: 3rem;
  --sp-16: 4rem;     --sp-20: 5rem;     --sp-24: 6rem;

  /* ─── Border radii ─── */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-full: 9999px;

  /* ─── Shadows ─── */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);

  /* ─── Typography ─── */
  --font-heading: "Space Grotesk", system-ui, sans-serif;
  --font-body:    "Inter", system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", monospace;

  /* ─── Brand gradient ─── */
  --grad-accent: linear-gradient(90deg, #D97706 0%, #F59E0B 40%, #EA580C 100%);
}
```

- [ ] **Step 2: Verify file is valid CSS**

Run: `node -e "const css = require('fs').readFileSync('src/styles/tokens.css', 'utf-8'); console.log(css.includes('--c-amber:') ? 'OK' : 'FAIL')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat(tokens): add OpenAEC raw design tokens

Locked-value tokens per OpenAEC Style Book v0.4: colors, spacing,
radii, shadows, typography, brand gradient."
```

---

### Task A.2: Create themes file with semantic vars + legacy shim

**Files:**
- Create: `src/styles/themes.css`

- [ ] **Step 1: Create themes.css**

```css
/* src/styles/themes.css
 * Semantic theme tokens that reference raw tokens from tokens.css.
 * Includes backwards-compat shim for existing component CSS that uses
 * --accent / --bg-primary / --text-primary / etc. — those keep working.
 */

:root,
[data-theme="light"] {
  /* ─── Semantic theme vars (preferred for new code) ─── */
  --theme-bg:             var(--c-blueprint-white);
  --theme-bg-elevated:    white;
  --theme-bg-subtle:      var(--c-concrete);
  --theme-fg:             var(--c-deep-forge);
  --theme-fg-muted:       #57534E;
  --theme-fg-subtle:      var(--c-scaffold-gray);
  --theme-accent:         var(--c-amber);
  --theme-accent-hover:   var(--c-signal-orange);
  --theme-accent-subtle:  rgba(217, 119, 6, 0.15);
  --theme-border:         var(--c-border);
  --theme-border-hover:   var(--c-border-hover);
  --theme-status-bg:      var(--c-deep-forge);
  --theme-status-fg:      var(--c-blueprint-white);
  --theme-success:        var(--c-success);
  --theme-error:          var(--c-error);
  --theme-warning:        var(--c-warm-gold);
  --theme-info:           var(--c-info);
}

[data-theme="openaec"] {
  --theme-bg:             var(--c-night-build);
  --theme-bg-elevated:    var(--c-deep-forge);
  --theme-bg-subtle:      #27272A;
  --theme-fg:             var(--c-blueprint-white);
  --theme-fg-muted:       var(--c-scaffold-gray);
  --theme-fg-subtle:      #71717A;
  --theme-accent:         var(--c-amber);
  --theme-accent-hover:   var(--c-warm-gold);
  --theme-accent-subtle:  rgba(217, 119, 6, 0.20);
  --theme-border:         #27272A;
  --theme-border-hover:   #3F3F46;
  --theme-status-bg:      #1F1F25;
  --theme-status-fg:      var(--c-blueprint-white);
  --theme-success:        var(--c-success);
  --theme-error:          var(--c-error);
  --theme-warning:        var(--c-warm-gold);
  --theme-info:           var(--c-info);
}

/* ─── Legacy compat shim — keeps existing 42 component CSS working unchanged ─── */
:root,
[data-theme="light"],
[data-theme="openaec"] {
  --accent:          var(--theme-accent);
  --accent-hover:    var(--theme-accent-hover);
  --accent-subtle:   var(--theme-accent-subtle);
  --bg-primary:      var(--theme-bg-elevated);
  --bg-secondary:    var(--theme-bg-subtle);
  --bg-tertiary:     var(--theme-bg-subtle);
  --bg-elevated:     var(--theme-bg-elevated);
  --bg-dark:         var(--theme-bg);
  --text-primary:    var(--theme-fg);
  --text-secondary:  var(--theme-fg-muted);
  --text-muted:      var(--theme-fg-subtle);
  --success:         var(--c-success);
  --success-hover:   #15803d;
  --warning:         var(--c-warm-gold);
  --danger:          var(--c-error);
  --border:          var(--theme-border);
  --border-light:    var(--theme-border);
  --border-accent:   rgba(217, 119, 6, 0.3);
}
```

- [ ] **Step 2: Verify file**

Run: `node -e "const css = require('fs').readFileSync('src/styles/themes.css', 'utf-8'); console.log(css.includes('[data-theme=\"openaec\"]') && css.includes('--accent: var(--theme-accent)') ? 'OK' : 'FAIL')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/styles/themes.css
git commit -m "feat(themes): add OpenAEC semantic theme tokens with legacy shim

Two themes: light (default) and openaec (dark). Legacy aliases
ensure existing 42 component CSS files keep working without refactor."
```

---

### Task A.3: Create canvas tokens file

**Files:**
- Create: `src/styles/canvas-tokens.css`

- [ ] **Step 1: Create canvas-tokens.css**

```css
/* src/styles/canvas-tokens.css
 * Canvas-specific tokens for MeshEditor (~10k LOC) and other canvas renderers.
 * Aligned with OpenAEC palette. MeshEditor reads these via
 * getComputedStyle(document.documentElement).getPropertyValue().
 */

:root,
[data-theme="light"] {
  --canvas-bg:           var(--theme-bg);
  --canvas-grid:         rgba(161, 161, 170, 0.15);
  --canvas-axis:         var(--c-scaffold-gray);
  --canvas-baseline:     #71717A;
  --canvas-dim-color:    var(--theme-fg-muted);
  --canvas-label-bg:     rgba(255, 255, 255, 0.90);

  /* Element-class tokens — used by MeshEditor draw functions */
  --canvas-beam:         var(--c-amber);
  --canvas-plate:        var(--c-warm-gold);
  --canvas-load:         var(--c-signal-orange);
  --canvas-reaction:     var(--c-info);
  --canvas-support:      var(--c-deep-forge);
  --canvas-selection:    var(--c-amber);
}

[data-theme="openaec"] {
  --canvas-bg:           var(--theme-bg);
  --canvas-grid:         rgba(161, 161, 170, 0.10);
  --canvas-axis:         #71717A;
  --canvas-baseline:     #52525B;
  --canvas-dim-color:    var(--theme-fg-subtle);
  --canvas-label-bg:     rgba(42, 42, 50, 0.90);

  --canvas-beam:         var(--c-amber);
  --canvas-plate:        var(--c-warm-gold);
  --canvas-load:         var(--c-signal-orange);
  --canvas-reaction:     #60A5FA;
  --canvas-support:      var(--c-blueprint-white);
  --canvas-selection:    var(--c-warm-gold);
}
```

- [ ] **Step 2: Verify**

Run: `node -e "const css = require('fs').readFileSync('src/styles/canvas-tokens.css', 'utf-8'); console.log(css.includes('--canvas-beam') ? 'OK' : 'FAIL')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/styles/canvas-tokens.css
git commit -m "feat(tokens): add canvas-specific tokens for MeshEditor

Aligns 10k-LOC MeshEditor canvas colors with OpenAEC palette
without touching MeshEditor.tsx logic. Existing CSS-var read
pattern (getComputedStyle) continues to work."
```

---

### Task A.4: Rewrite index.css to use new tokens

**Files:**
- Modify: `src/index.css` (full rewrite)

- [ ] **Step 1: Read current index.css to confirm what we're replacing**

Run: `cat src/index.css | head -30` (verify GitHub-dark palette is what's there)

- [ ] **Step 2: Replace src/index.css with new content**

```css
/* src/index.css
 * Open FEM2D Studio — base styles
 * Imports OpenAEC design tokens + theme + canvas tokens.
 */

@import './styles/tokens.css';
@import './styles/themes.css';
@import './styles/canvas-tokens.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-body);
  background-color: var(--theme-bg);
  color: var(--theme-fg);
  overflow: hidden;
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ─── Typography per OpenAEC §2.2 ─── */
h1, h2, h3 {
  font-family: var(--font-heading);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

h4, h5, h6 {
  font-family: var(--font-heading);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

code, pre, kbd {
  font-family: var(--font-mono);
}

button, input, select, textarea {
  font-family: var(--font-body);
}

/* ─── App shell ─── */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--theme-bg);
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
```

(Use Edit tool with the full file content, or Write since this is essentially a rewrite of a small file.)

- [ ] **Step 3: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: no output (PASS)

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "refactor(styles): rewrite index.css to use OpenAEC tokens

Imports tokens.css, themes.css, canvas-tokens.css. Body uses
Inter via var(--font-body). h1-h6 use Space Grotesk per spec."
```

---

### Task A.5: Add Google Fonts and update title in index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Read current index.html**

Run: `cat index.html`
Expected: 13 lines, basic Vite template with `<title>Open FEM Studio</title>`

- [ ] **Step 2: Edit index.html — add font preconnect/link and update title**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Open FEM2D Studio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Visual verification — start dev server and confirm fonts load**

Run: `npm run dev` (in background), then open `http://localhost:3000` in browser, open DevTools → Network → filter "fonts" → verify Space Grotesk + Inter + JetBrains Mono download with status 200.

Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(fonts): load Space Grotesk + Inter + JetBrains Mono

Adds Google Fonts preconnect and stylesheet link per OpenAEC
spec. Updates title to 'Open FEM2D Studio' (matching repo name)."
```

---

### Task A.6: Rename theme key 'dark' → 'openaec' with migration

**Files:**
- Modify: `src/components/Ribbon/Ribbon.tsx` (find theme toggle)
- Modify: `src/main.tsx` or wherever initial theme load happens

- [ ] **Step 1: Locate theme toggle code**

Run: `grep -rn "data-theme\|fem2d-theme" src/ --include='*.tsx' --include='*.ts'`
Expected: ~3-5 matches across Ribbon.tsx, main.tsx, possibly App.tsx

- [ ] **Step 2: Update theme toggle to use 'light' / 'openaec' values + handle legacy 'dark'**

In each file with `data-theme = 'dark'` or `setItem('fem2d-theme', 'dark')`, replace `'dark'` with `'openaec'`. For the LOAD-time logic (probably in main.tsx or top of App.tsx), add migration:

```ts
// Migration: legacy 'dark' theme key → new 'openaec'
const stored = localStorage.getItem('fem2d-theme');
const theme = stored === 'dark' ? 'openaec' : (stored ?? 'light');
if (stored === 'dark') localStorage.setItem('fem2d-theme', 'openaec');
document.documentElement.dataset.theme = theme;
```

If toggle is a simple `theme === 'light' ? 'dark' : 'light'`, change to `theme === 'light' ? 'openaec' : 'light'`. Update i18n labels if "Dark mode" appears.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open app. Toggle theme → confirm dataset.theme switches between 'light' and 'openaec'. Reload → theme persists. Stop server.

- [ ] **Step 5: Commit**

```bash
git add -u src/
git commit -m "refactor(theme): rename 'dark' to 'openaec' with one-shot migration

Aligns with OpenAEC migratie-instructies.md theme naming. Existing
users with 'dark' in localStorage are migrated automatically."
```

---

### Task A.7: Remove 3BM references; set OpenAEC defaults in ReportConfig

**Files:**
- Modify: `src/core/report/ReportConfig.ts:89,96,97`

- [ ] **Step 1: Read current values**

Run: `sed -n '85,100p' src/core/report/ReportConfig.ts`
Expected: shows `companyName: '3BM Bouwtechniek V.O.F.',`, `primaryColor: '#00a8a8',`, `accentColor: '#8b5cf6',`

- [ ] **Step 2: Edit ReportConfig.ts**

Use Edit tool to replace these three lines:

```ts
  companyName: 'OpenAEC Foundation',
  showPageNumbers: true,
  showHeader: true,
  showFooter: true,
  includeFormulas: true,
  includeGraphics: true,
  unitSystem: 'metric',
  primaryColor: '#D97706',  // OpenAEC amber
  accentColor: '#F59E0B',   // OpenAEC warm-gold
};
```

- [ ] **Step 3: Verify no other 3BM references remain in src/**

Run: `grep -rn "3BM\|Bouwtechniek" src/ 2>/dev/null`
Expected: no output (zero matches)

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/report/ReportConfig.ts
git commit -m "fix(brand): remove 3BM reference, set OpenAEC defaults

OpenAEC Style Book §9 forbids 3BM references. companyName now
'OpenAEC Foundation', primaryColor amber, accentColor warm-gold."
```

---

### Task A.8: Update package.json metadata

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit package.json — update name, author, license, description**

Use Edit tool. Change:
- `"name": "open-fem-studio"` → `"name": "open-fem2d-studio"`
- `"description": "Web-based 2D Finite Element Method application for structural analysis"` → `"description": "Open FEM2D Studio — 2D Finite Element Method solver. Part of the OpenAEC Foundation portfolio."`
- Add (if not present): `"author": "OpenAEC Foundation"`, `"license": "CC-BY-SA-4.0"`, `"homepage": "https://github.com/OpenAEC-Foundation"`

The `main`, `scripts`, `dependencies`, `devDependencies` keep existing values.

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(brand): update package.json with OpenAEC identity

name=open-fem2d-studio, author=OpenAEC Foundation, license=CC-BY-SA-4.0."
```

---

### Task A.9: Update README with OpenAEC branding

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

Run: `cat README.md`
Expected: 14 lines, basic description

- [ ] **Step 2: Replace README.md**

```markdown
<p align="center">
  <strong>Open FEM2D Studio</strong>
</p>

<p align="center">
  Open-source 2D Finite Element Method solver for structural analysis.<br>
  Part of the <a href="https://github.com/OpenAEC-Foundation">OpenAEC Foundation</a> portfolio.
</p>

<p align="center">
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-CC--BY--SA--4.0-D97706?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/contributions-welcome-D97706?style=flat-square" alt="Contributions welcome">
</p>

---

## Features

- Beam and plate element analysis (2D)
- Steel, timber, and concrete profile libraries
- Nonlinear solver (Newton-Raphson)
- Canvas-based interactive mesh editor
- A4 report generation (HTML + browser-print to PDF)
- Multi-language UI (EN, NL, ES, FR, IT, ZH)

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Desktop wrapper:** Tauri v2 (Phase C — currently transitioning from Electron)
- **Solver backend:** Python (in `backend/` — runs as separate process)

## Development

```bash
npm install
npm run dev          # Vite dev server (browser only)
npm run tauri:dev    # Desktop app (Phase C onward)
npm run build        # Production frontend
npm run tauri:build  # Production desktop installer
```

## Build prerequisites

- Node.js ≥ 18
- Rust toolchain (for Tauri builds — install via [rustup](https://rustup.rs/))
- WebView2 runtime (Windows — included in Win11 by default)

## License

CC BY-SA 4.0 — see [LICENSE.md](LICENSE.md)

## About OpenAEC Foundation

OpenAEC Foundation develops free, open-source tools for the built environment.
Build free. Build together. — [openaec.org](https://github.com/OpenAEC-Foundation)
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(brand): update README with OpenAEC branding

License badge, OpenAEC tagline, Tauri build instructions,
multi-language note. Mentions Phase C transition status."
```

---

### Task A.10: Phase A integration verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Start dev server and visual smoke**

Run: `npm run dev` (background)

Open `http://localhost:3000`. Verify:
- Page title in browser tab is "Open FEM2D Studio"
- App loads without console errors
- Body uses Inter font (inspect computed styles on body element → font-family contains "Inter")
- App background is `#FAFAF9` (light) or `#2A2A32` (openaec) — not `#0d1117` GitHub dark
- Open Ribbon → click theme toggle → switches between light and openaec, no flicker
- Open any dialog (e.g. Project Info via Ribbon → Project) → buttons/borders use amber color, not blue

- [ ] **Step 3: Open existing saved project (if any)**

If you have a `.json` project file from before this work, drag-drop or open via Ribbon. Mesh editor should render normally.

- [ ] **Step 4: Stop dev server, commit verification log**

If everything checks out, no commit needed. If you discovered an issue, document and fix in a follow-up task.

```bash
# Note: no code changes in this task — pure verification
echo "Phase A verification: PASS" > /tmp/phase-a-verify.log
```

---

# PHASE B — Shell Components

**Phase goal:** Add OpenAEC-required shell components (Backstage, SettingsDialog, Modal, AboutDialog, TitleBar) and bring Ribbon/StatusBar/FileTabs into spec compliance.

**Phase verification:** All 5 new components work; Backstage opens via File tab; SettingsDialog manages theme + language; AboutDialog shows OpenAEC info; Modal has focus trap; Ribbon is 122px with amber File tab and animated indicator; StatusBar is 22px; existing dialogs still work.

---

### Task B.1: Create Modal component

**Files:**
- Create: `src/components/Modal/Modal.tsx`
- Create: `src/components/Modal/Modal.css`

- [ ] **Step 1: Create Modal.css**

```css
.openaec-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: openaec-modal-fade 150ms ease;
}

.openaec-modal {
  background: var(--theme-bg-elevated);
  color: var(--theme-fg);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: openaec-modal-pop 150ms ease;
}

.openaec-modal--sm { width: 400px; }
.openaec-modal--md { width: 560px; }
.openaec-modal--lg { width: 720px; }

.openaec-modal-header {
  padding: var(--sp-5) var(--sp-6);
  border-bottom: 1px solid var(--theme-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.openaec-modal-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.125rem;
  color: var(--theme-fg);
}

.openaec-modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--theme-fg-muted);
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
}
.openaec-modal-close:hover { background: var(--theme-bg-subtle); color: var(--theme-fg); }

.openaec-modal-body {
  padding: var(--sp-6);
  overflow-y: auto;
  flex: 1;
}

.openaec-modal-footer {
  padding: var(--sp-4) var(--sp-6);
  border-top: 1px solid var(--theme-border);
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-3);
}

@keyframes openaec-modal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes openaec-modal-pop {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 2: Create Modal.tsx**

```tsx
import { useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  closeOnBackdrop?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  closeOnBackdrop = true,
  children,
  footer,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap: cycle Tab key within modal
  useEffect(() => {
    if (!isOpen) return;
    const modal = modalRef.current;
    if (!modal) return;

    const focusables = modal.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && focusables.length > 0) {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    first?.focus();
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="openaec-modal-overlay"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`openaec-modal openaec-modal--${size}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {title && (
          <div className="openaec-modal-header">
            <h2 id="modal-title" className="openaec-modal-title">{title}</h2>
            <button className="openaec-modal-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="openaec-modal-body">{children}</div>
        {footer && <div className="openaec-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Modal/
git commit -m "feat(modal): add reusable Modal component

z:10000 overlay, 3 sizes (sm/md/lg), focus trap, optional
backdrop click-to-close, fade+pop animations."
```

---

### Task B.2: Create Backstage component

**Files:**
- Create: `src/components/Backstage/Backstage.tsx`
- Create: `src/components/Backstage/Backstage.css`

- [ ] **Step 1: Create Backstage.css**

```css
.backstage-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--theme-bg);
  z-index: 1000;
  display: flex;
  animation: backstage-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes backstage-slide-in {
  from { transform: translateX(-30px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.backstage-sidebar {
  width: 260px;
  background: var(--theme-bg-elevated);
  border-right: 1px solid var(--theme-border);
  display: flex;
  flex-direction: column;
  padding-top: var(--sp-3);
}

.backstage-back {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-5);
  margin-bottom: var(--sp-2);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--theme-fg-muted);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.875rem;
}
.backstage-back:hover { color: var(--theme-accent); }

.backstage-menu {
  display: flex;
  flex-direction: column;
}

.backstage-item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  color: var(--theme-fg);
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
}
.backstage-item:hover { background: var(--theme-bg-subtle); }
.backstage-item.is-active {
  background: var(--theme-bg-subtle);
  border-left-color: var(--theme-accent);
  color: var(--theme-accent);
}
.backstage-item:disabled { opacity: 0.4; cursor: not-allowed; }

.backstage-content {
  flex: 1;
  padding: var(--sp-12);
  overflow-y: auto;
  background: var(--theme-bg);
}

.backstage-content h2 {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.5rem;
  color: var(--theme-fg);
  margin-bottom: var(--sp-4);
}

.backstage-content p {
  font-family: var(--font-body);
  color: var(--theme-fg-muted);
  line-height: 1.6;
  max-width: 70ch;
}
```

- [ ] **Step 2: Create Backstage.tsx**

```tsx
import { useState, useEffect } from 'react';
import { ArrowLeft, FilePlus, FolderOpen, Save, SaveAll, Settings, Info, LogOut } from 'lucide-react';
import './Backstage.css';

export type BackstageAction =
  | 'new' | 'open' | 'save' | 'saveAs' | 'preferences' | 'about' | 'exit';

interface BackstageProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: BackstageAction) => void;
  t: (key: string) => string;  // i18n
}

interface MenuItem {
  id: BackstageAction;
  icon: React.ReactNode;
  labelKey: string;
  shortcut?: string;
  description: string;
}

export function Backstage({ isOpen, onClose, onAction, t }: BackstageProps) {
  const [active, setActive] = useState<BackstageAction>('new');

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items: MenuItem[] = [
    { id: 'new',         icon: <FilePlus size={16} />,   labelKey: 'backstage.new',         shortcut: 'Ctrl+N', description: t('backstage.newDesc') },
    { id: 'open',        icon: <FolderOpen size={16} />, labelKey: 'backstage.open',        shortcut: 'Ctrl+O', description: t('backstage.openDesc') },
    { id: 'save',        icon: <Save size={16} />,       labelKey: 'backstage.save',        shortcut: 'Ctrl+S', description: t('backstage.saveDesc') },
    { id: 'saveAs',      icon: <SaveAll size={16} />,    labelKey: 'backstage.saveAs',      shortcut: 'Ctrl+Shift+S', description: t('backstage.saveAsDesc') },
    { id: 'preferences', icon: <Settings size={16} />,   labelKey: 'backstage.preferences', shortcut: 'Ctrl+,', description: t('backstage.preferencesDesc') },
    { id: 'about',       icon: <Info size={16} />,       labelKey: 'backstage.about',       description: t('backstage.aboutDesc') },
    { id: 'exit',        icon: <LogOut size={16} />,     labelKey: 'backstage.exit',        shortcut: 'Alt+F4', description: t('backstage.exitDesc') },
  ];

  const activeItem = items.find(i => i.id === active);

  return (
    <div className="backstage-overlay" role="dialog" aria-modal="true" aria-label="File menu">
      <div className="backstage-sidebar">
        <button className="backstage-back" onClick={onClose} aria-label={t('common.close')}>
          <ArrowLeft size={16} /> {t('common.close')}
        </button>
        <nav className="backstage-menu">
          {items.map(item => (
            <button
              key={item.id}
              className={`backstage-item ${active === item.id ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(item.id)}
              onClick={() => { onAction(item.id); onClose(); }}
            >
              {item.icon}
              <span style={{ flex: 1 }}>{t(item.labelKey)}</span>
              {item.shortcut && <span style={{ fontSize: '0.75rem', color: 'var(--theme-fg-subtle)' }}>{item.shortcut}</span>}
            </button>
          ))}
        </nav>
      </div>
      <div className="backstage-content">
        {activeItem && (
          <>
            <h2>{t(activeItem.labelKey)}</h2>
            <p>{activeItem.description}</p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Backstage/
git commit -m "feat(backstage): add OpenAEC file-menu overlay

z:1000, 260px sidebar + content area, slide-in animation,
7 menu items per OpenAEC spec, Esc closes."
```

---

### Task B.3: Create SettingsDialog component

**Files:**
- Create: `src/components/SettingsDialog/SettingsDialog.tsx`
- Create: `src/components/SettingsDialog/SettingsDialog.css`

- [ ] **Step 1: Create SettingsDialog.css**

```css
.settings-tabs {
  display: flex;
  gap: var(--sp-1);
  border-bottom: 1px solid var(--theme-border);
  margin-bottom: var(--sp-5);
}

.settings-tab {
  padding: var(--sp-3) var(--sp-4);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--theme-fg-muted);
}
.settings-tab:hover { color: var(--theme-fg); }
.settings-tab.is-active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

.settings-section { margin-bottom: var(--sp-5); }

.settings-section h3 {
  font-family: var(--font-heading);
  font-weight: 500;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-fg-muted);
  margin-bottom: var(--sp-3);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) 0;
  gap: var(--sp-4);
}

.settings-label {
  font-size: 0.875rem;
  color: var(--theme-fg);
  font-weight: 500;
}

.settings-select {
  font-family: var(--font-body);
  font-size: 0.875rem;
  padding: var(--sp-2) var(--sp-3);
  border: 1.5px solid var(--theme-border);
  border-radius: var(--radius-md);
  background: var(--theme-bg-elevated);
  color: var(--theme-fg);
  min-width: 140px;
}
.settings-select:focus {
  outline: none;
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px var(--theme-accent-subtle);
}

.settings-radio-group {
  display: flex;
  gap: var(--sp-2);
}

.settings-radio {
  padding: var(--sp-2) var(--sp-4);
  border: 1.5px solid var(--theme-border);
  border-radius: var(--radius-md);
  background: var(--theme-bg-elevated);
  color: var(--theme-fg);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.settings-radio.is-selected {
  background: var(--theme-accent);
  color: white;
  border-color: var(--theme-accent);
}
```

- [ ] **Step 2: Create SettingsDialog.tsx**

```tsx
import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import './SettingsDialog.css';

export type Theme = 'light' | 'openaec';
export type Locale = 'en' | 'nl' | 'es' | 'fr' | 'it' | 'zh';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  t: (key: string) => string;
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  nl: 'Nederlands',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  zh: '中文',
};

export function SettingsDialog({
  isOpen, onClose, theme, onThemeChange, locale, onLocaleChange, t,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<'appearance' | 'language'>('appearance');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.title')} size="md">
      <div className="settings-tabs">
        <button
          className={`settings-tab ${tab === 'appearance' ? 'is-active' : ''}`}
          onClick={() => setTab('appearance')}
        >
          {t('settings.appearance')}
        </button>
        <button
          className={`settings-tab ${tab === 'language' ? 'is-active' : ''}`}
          onClick={() => setTab('language')}
        >
          {t('settings.language')}
        </button>
      </div>

      {tab === 'appearance' && (
        <div className="settings-section">
          <h3>{t('settings.theme.label')}</h3>
          <div className="settings-row">
            <span className="settings-label">{t('settings.theme.help')}</span>
            <div className="settings-radio-group">
              <button
                className={`settings-radio ${theme === 'light' ? 'is-selected' : ''}`}
                onClick={() => onThemeChange('light')}
              >
                {t('settings.theme.light')}
              </button>
              <button
                className={`settings-radio ${theme === 'openaec' ? 'is-selected' : ''}`}
                onClick={() => onThemeChange('openaec')}
              >
                {t('settings.theme.openaec')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'language' && (
        <div className="settings-section">
          <h3>{t('settings.language')}</h3>
          <div className="settings-row">
            <span className="settings-label">{t('settings.languageHelp')}</span>
            <select
              className="settings-select"
              value={locale}
              onChange={e => onLocaleChange(e.target.value as Locale)}
            >
              {(Object.keys(LOCALE_LABELS) as Locale[]).map(l => (
                <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (note: i18n keys don't yet exist — will be added in Task B.10. The component uses `t()` so no hard-coded strings, but missing keys will show as `'settings.theme.label'` literal until B.10 is done. Acceptable.)

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsDialog/
git commit -m "feat(settings): add OpenAEC SettingsDialog (theme + language)

Modal-based, tabs for Appearance and Language. Theme = light or
openaec. Language = 6 locales. Uses i18n t() — keys added in B.10."
```

---

### Task B.4: Create AboutDialog component

**Files:**
- Create: `src/components/AboutDialog/AboutDialog.tsx`
- Create: `src/components/AboutDialog/AboutDialog.css`

- [ ] **Step 1: Create AboutDialog.css**

```css
.about-content {
  text-align: center;
}

.about-logo {
  width: 80px;
  height: 80px;
  margin: 0 auto var(--sp-4);
  color: var(--theme-accent);
}

.about-name {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.5rem;
  color: var(--theme-fg);
  margin-bottom: var(--sp-1);
}

.about-version {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--theme-fg-muted);
  margin-bottom: var(--sp-5);
}

.about-tagline {
  font-family: var(--font-body);
  font-style: italic;
  color: var(--theme-fg-muted);
  margin-bottom: var(--sp-4);
}

.about-meta {
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--theme-fg-muted);
  line-height: 1.8;
}

.about-meta a {
  color: var(--theme-accent);
  text-decoration: none;
}
.about-meta a:hover { text-decoration: underline; }

.about-license {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--theme-fg-subtle);
  margin-top: var(--sp-5);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--theme-border);
}
```

- [ ] **Step 2: Create AboutDialog.tsx**

```tsx
import { Modal } from '../Modal/Modal';
import { Box } from 'lucide-react';
import './AboutDialog.css';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: string) => string;
}

const APP_VERSION = '1.0.0';
const GITHUB_URL = 'https://github.com/OpenAEC-Foundation';

export function AboutDialog({ isOpen, onClose, t }: AboutDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('about.title')} size="sm">
      <div className="about-content">
        <Box className="about-logo" strokeWidth={1.5} size={80} />
        <div className="about-name">Open FEM2D Studio</div>
        <div className="about-version">v{APP_VERSION}</div>
        <div className="about-tagline">"Build free. Build together."</div>
        <div className="about-meta">
          {t('about.builtOn')}<br />
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">{GITHUB_URL}</a>
        </div>
        <div className="about-license">© 2026 OpenAEC Foundation · CC BY-SA 4.0</div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/AboutDialog/
git commit -m "feat(about): add OpenAEC AboutDialog

Logo, version, tagline, GitHub link, CC BY-SA 4.0 license.
Uses lucide Box icon as placeholder until OpenAEC SVG asset
is downloaded in Phase D."
```

---

### Task B.5: Create TitleBar component (no window controls yet — added in Phase C)

**Files:**
- Create: `src/components/TitleBar/TitleBar.tsx`
- Create: `src/components/TitleBar/TitleBar.css`
- Modify: `src/App.tsx` (replace inline `.title-bar` div with `<TitleBar />`)

- [ ] **Step 1: Locate the inline .title-bar in App.tsx**

Run: `grep -n "title-bar" src/App.tsx | head -10`
Expected: matches around line 242-249

- [ ] **Step 2: Create TitleBar.css**

```css
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 var(--sp-3);
  background: var(--theme-bg-elevated);
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
  font-family: var(--font-body);
  font-size: 0.75rem;
}

.title-bar-left,
.title-bar-center,
.title-bar-right {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.title-bar-left {
  color: var(--theme-fg);
  font-weight: 600;
}

.title-bar-center {
  color: var(--theme-fg-muted);
  font-weight: 500;
}

.title-bar-quick-access {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  margin-left: var(--sp-3);
  border-left: 1px solid var(--theme-border);
  padding-left: var(--sp-3);
}

.title-bar-qa-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--theme-fg-muted);
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
}
.title-bar-qa-btn:hover { background: var(--theme-bg-subtle); color: var(--theme-fg); }
.title-bar-qa-btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 3: Create TitleBar.tsx**

```tsx
import { Box, Save, Undo, Redo } from 'lucide-react';
import './TitleBar.css';

interface TitleBarProps {
  projectName: string;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  rightSlot?: React.ReactNode;  // Theme toggle, etc.
}

export function TitleBar({
  projectName,
  onSave,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  rightSlot,
}: TitleBarProps) {
  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <Box size={14} />
        <span>Open FEM2D Studio</span>
        {(onSave || onUndo || onRedo) && (
          <div className="title-bar-quick-access">
            {onSave && (
              <button className="title-bar-qa-btn" onClick={onSave} title="Save (Ctrl+S)" aria-label="Save">
                <Save size={14} />
              </button>
            )}
            {onUndo && (
              <button className="title-bar-qa-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
                <Undo size={14} />
              </button>
            )}
            {onRedo && (
              <button className="title-bar-qa-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
                <Redo size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="title-bar-center">{projectName || 'Untitled Project'}</div>
      <div className="title-bar-right">{rightSlot}</div>
    </div>
  );
}
```

- [ ] **Step 4: Replace .title-bar div in App.tsx**

In `src/App.tsx` around line 242, replace:
```tsx
<div className="title-bar">
  <div className="title-bar-left">
    <Box size={14} />
    <span>Open FEM Studio</span>
  </div>
  <div className="title-bar-center">{state.projectInfo.name || 'Untitled Project'}</div>
  <div className="title-bar-right" />
</div>
```

With:
```tsx
<TitleBar projectName={state.projectInfo.name || ''} />
```

Also add import at top: `import { TitleBar } from './components/TitleBar/TitleBar';`

Quick-access wiring (onSave/onUndo/onRedo) is left for Task B.11 once we know the existing handlers' shapes.

- [ ] **Step 5: TypeScript check + visual smoke**

Run: `npx tsc --noEmit`
Run: `npm run dev` → verify title bar shows "Open FEM2D Studio" + project name. Stop server.

- [ ] **Step 6: Commit**

```bash
git add src/components/TitleBar/ src/App.tsx
git commit -m "feat(titlebar): extract inline .title-bar to TitleBar component

Spec-compliant 32px height, slot for quick-access (Save/Undo/Redo)
and right slot (theme toggle). Window controls deferred to Phase C
(Tauri frameless mode)."
```

---

### Task B.6: Update Ribbon — 122px height, amber File tab, animated indicator

**Files:**
- Modify: `src/components/Ribbon/Ribbon.tsx`
- Modify: `src/components/Ribbon/Ribbon.css`

- [ ] **Step 1: Read current Ribbon.css to understand structure**

Run: `head -80 src/components/Ribbon/Ribbon.css`

Locate the height declaration (currently `min-height: 130px`).

- [ ] **Step 2: Update Ribbon.css**

Use Edit tool. Find `min-height: 130px` and replace with `min-height: 122px; height: 122px;`. Find tab row height (likely 28-30px) and confirm 28px. Find tab content area, set explicit height to 94px.

Add new CSS at end of file:
```css
/* OpenAEC: File tab amber + animated indicator */
.ribbon-tab.is-file-tab {
  background: var(--theme-accent);
  color: white;
}
.ribbon-tab.is-file-tab:hover {
  background: var(--theme-accent-hover);
}

.ribbon-tab-indicator {
  position: absolute;
  bottom: 0;
  height: 2px;
  background: var(--theme-accent);
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), width 300ms cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.ribbon-tabs {
  position: relative; /* anchor for indicator */
  border-bottom: 3px solid transparent;
  border-image: var(--grad-accent) 1;
  border-image-slice: 1;
  border-image-width: 0 0 3px 0;
}
```

- [ ] **Step 3: Update Ribbon.tsx — add animated indicator + File tab handling**

Locate the tabs render. Find where tabs map (likely `tabs.map(t => <RibbonTab .../>)`). Wrap in a container with `<div ref={tabsRef} className="ribbon-tabs">`. Add an indicator `<div ref={indicatorRef} className="ribbon-tab-indicator" />`.

Add hook:
```tsx
const tabsRef = useRef<HTMLDivElement>(null);
const indicatorRef = useRef<HTMLDivElement>(null);

useLayoutEffect(() => {
  const container = tabsRef.current;
  const indicator = indicatorRef.current;
  if (!container || !indicator) return;
  const activeEl = container.querySelector<HTMLElement>('.ribbon-tab.is-active');
  if (activeEl) {
    indicator.style.transform = `translateX(${activeEl.offsetLeft}px)`;
    indicator.style.width = `${activeEl.offsetWidth}px`;
  }
}, [activeTab]);
```

Add `is-file-tab` className to the File tab specifically:
```tsx
<RibbonTab
  className={tab.id === 'file' ? 'is-file-tab' : ''}
  ...
/>
```

If clicking File tab opens Backstage (per spec): add `if (tab.id === 'file') { onFileTabClick(); return; }` in the tab click handler. Add prop `onFileTabClick?: () => void` to Ribbon.

- [ ] **Step 4: TypeScript check + visual smoke**

Run: `npx tsc --noEmit`
Run: `npm run dev` → confirm Ribbon is 122px tall, File tab is amber, switching between tabs shows animated underline. Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/components/Ribbon/
git commit -m "feat(ribbon): 122px height, amber File tab, animated indicator

Per OpenAEC spec: tab row 28px + content 94px = 122px. File tab
amber with hover transition. 2px sliding underline on active tab
change (300ms cubic-bezier). Amber gradient strip as bottom border.
File tab onClick exposed via onFileTabClick prop for Backstage."
```

---

### Task B.7: Update StatusBar to 22px height

**Files:**
- Modify: `src/components/StatusBar/StatusBar.css`

- [ ] **Step 1: Read current StatusBar.css**

Run: `head -40 src/components/StatusBar/StatusBar.css`

Locate `height: 32px`.

- [ ] **Step 2: Update height to 22px**

Use Edit. Replace `height: 32px` (and any `min-height: 32px` / `max-height: 32px`) with `22px`. Also reduce padding if needed: `padding: 0 var(--sp-3)` is OpenAEC standard.

- [ ] **Step 3: Visual smoke test**

Run: `npm run dev` → confirm StatusBar is now compact (22px) and content (zoom, coords, tool hints) still visible. If text is clipped, document deviation: keep at 28px instead and update spec.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (CSS-only change but worth confirming nothing else regressed)

- [ ] **Step 5: Commit**

```bash
git add src/components/StatusBar/
git commit -m "feat(statusbar): reduce height to 22px per OpenAEC spec"
```

---

### Task B.8: Make FileTabs amber active indicator explicit

**Files:**
- Modify: `src/components/FileTabs/FileTabs.css`

- [ ] **Step 1: Read FileTabs.css to find the active indicator**

Run: `grep -n "active\|accent\|border-bottom" src/components/FileTabs/FileTabs.css`

The indicator currently uses `var(--accent)` which is shimmed to amber. We make it explicit using the new theme var.

- [ ] **Step 2: Replace --accent references with --theme-accent**

Use Edit to change `var(--accent)` references in FileTabs.css to `var(--theme-accent)` (more semantically correct, no behavior change due to shim).

- [ ] **Step 3: Visual smoke + commit**

Run: `npm run dev` → confirm file tabs still highlight amber when active. Stop server.

```bash
git add src/components/FileTabs/
git commit -m "refactor(filetabs): use --theme-accent instead of legacy --accent

Functionally identical (shim aliases match) but semantically clearer."
```

---

### Task B.9: Add i18n keys for new components (6 locales)

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/nl.ts`
- Modify: `src/i18n/es.ts`
- Modify: `src/i18n/fr.ts`
- Modify: `src/i18n/it.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Read current en.ts structure**

Run: `head -50 src/i18n/en.ts; echo '---'; tail -20 src/i18n/en.ts`

Determine if it's a flat object (`{ saveBtn: 'Save', ... }`) or nested (`{ common: { save: 'Save' } }`). Plan keys accordingly.

- [ ] **Step 2: Add keys to en.ts**

Add new top-level sections (or merge into existing) in `src/i18n/en.ts`:

```ts
backstage: {
  new: 'New',
  newDesc: 'Start a new empty FEM project.',
  open: 'Open',
  openDesc: 'Open an existing project file.',
  save: 'Save',
  saveDesc: 'Save the current project to disk.',
  saveAs: 'Save As',
  saveAsDesc: 'Save the current project under a new name.',
  preferences: 'Preferences',
  preferencesDesc: 'Open the settings dialog (theme, language).',
  about: 'About',
  aboutDesc: 'Information about Open FEM2D Studio.',
  exit: 'Exit',
  exitDesc: 'Close the application.',
},
settings: {
  title: 'Preferences',
  appearance: 'Appearance',
  language: 'Language',
  languageHelp: 'Choose your interface language.',
  theme: {
    label: 'Theme',
    help: 'Choose your visual theme.',
    light: 'Light',
    openaec: 'OpenAEC',
  },
},
about: {
  title: 'About Open FEM2D Studio',
  builtOn: 'Built on the OpenAEC platform',
},
common: {
  close: 'Close',
},
```

- [ ] **Step 3: Add same keys (translated) to nl.ts**

```ts
backstage: {
  new: 'Nieuw',
  newDesc: 'Begin met een nieuw, leeg FEM-project.',
  open: 'Openen',
  openDesc: 'Open een bestaand projectbestand.',
  save: 'Opslaan',
  saveDesc: 'Sla het huidige project op naar schijf.',
  saveAs: 'Opslaan als',
  saveAsDesc: 'Sla het huidige project op onder een nieuwe naam.',
  preferences: 'Voorkeuren',
  preferencesDesc: 'Open het instellingenvenster (thema, taal).',
  about: 'Over',
  aboutDesc: 'Informatie over Open FEM2D Studio.',
  exit: 'Afsluiten',
  exitDesc: 'Sluit de applicatie.',
},
settings: {
  title: 'Voorkeuren',
  appearance: 'Uiterlijk',
  language: 'Taal',
  languageHelp: 'Kies je interfacetaal.',
  theme: {
    label: 'Thema',
    help: 'Kies je visuele thema.',
    light: 'Licht',
    openaec: 'OpenAEC',
  },
},
about: {
  title: 'Over Open FEM2D Studio',
  builtOn: 'Gebouwd op het OpenAEC platform',
},
common: {
  close: 'Sluiten',
},
```

- [ ] **Step 4: Add to es.ts (Spanish)**

```ts
backstage: {
  new: 'Nuevo', newDesc: 'Iniciar un nuevo proyecto FEM vacío.',
  open: 'Abrir', openDesc: 'Abrir un archivo de proyecto existente.',
  save: 'Guardar', saveDesc: 'Guardar el proyecto actual en disco.',
  saveAs: 'Guardar como', saveAsDesc: 'Guardar el proyecto actual con un nuevo nombre.',
  preferences: 'Preferencias', preferencesDesc: 'Abrir el cuadro de diálogo de configuración (tema, idioma).',
  about: 'Acerca de', aboutDesc: 'Información sobre Open FEM2D Studio.',
  exit: 'Salir', exitDesc: 'Cerrar la aplicación.',
},
settings: {
  title: 'Preferencias', appearance: 'Apariencia', language: 'Idioma',
  languageHelp: 'Elige tu idioma de interfaz.',
  theme: { label: 'Tema', help: 'Elige tu tema visual.', light: 'Claro', openaec: 'OpenAEC' },
},
about: { title: 'Acerca de Open FEM2D Studio', builtOn: 'Construido sobre la plataforma OpenAEC' },
common: { close: 'Cerrar' },
```

- [ ] **Step 5: Add to fr.ts (French)**

```ts
backstage: {
  new: 'Nouveau', newDesc: 'Démarrer un nouveau projet FEM vide.',
  open: 'Ouvrir', openDesc: 'Ouvrir un fichier de projet existant.',
  save: 'Enregistrer', saveDesc: 'Enregistrer le projet actuel sur le disque.',
  saveAs: 'Enregistrer sous', saveAsDesc: 'Enregistrer le projet actuel sous un nouveau nom.',
  preferences: 'Préférences', preferencesDesc: 'Ouvrir la boîte de dialogue des paramètres (thème, langue).',
  about: 'À propos', aboutDesc: 'Informations sur Open FEM2D Studio.',
  exit: 'Quitter', exitDesc: 'Fermer l\'application.',
},
settings: {
  title: 'Préférences', appearance: 'Apparence', language: 'Langue',
  languageHelp: 'Choisissez votre langue d\'interface.',
  theme: { label: 'Thème', help: 'Choisissez votre thème visuel.', light: 'Clair', openaec: 'OpenAEC' },
},
about: { title: 'À propos d\'Open FEM2D Studio', builtOn: 'Construit sur la plateforme OpenAEC' },
common: { close: 'Fermer' },
```

- [ ] **Step 6: Add to it.ts (Italian)**

```ts
backstage: {
  new: 'Nuovo', newDesc: 'Avvia un nuovo progetto FEM vuoto.',
  open: 'Apri', openDesc: 'Apri un file di progetto esistente.',
  save: 'Salva', saveDesc: 'Salva il progetto corrente su disco.',
  saveAs: 'Salva con nome', saveAsDesc: 'Salva il progetto corrente con un nuovo nome.',
  preferences: 'Preferenze', preferencesDesc: 'Apri la finestra delle impostazioni (tema, lingua).',
  about: 'Informazioni', aboutDesc: 'Informazioni su Open FEM2D Studio.',
  exit: 'Esci', exitDesc: 'Chiudi l\'applicazione.',
},
settings: {
  title: 'Preferenze', appearance: 'Aspetto', language: 'Lingua',
  languageHelp: 'Scegli la lingua dell\'interfaccia.',
  theme: { label: 'Tema', help: 'Scegli il tema visivo.', light: 'Chiaro', openaec: 'OpenAEC' },
},
about: { title: 'Informazioni su Open FEM2D Studio', builtOn: 'Costruito sulla piattaforma OpenAEC' },
common: { close: 'Chiudi' },
```

- [ ] **Step 7: Add to zh.ts (Chinese — Simplified)**

```ts
backstage: {
  new: '新建', newDesc: '开始一个新的空白 FEM 项目。',
  open: '打开', openDesc: '打开现有的项目文件。',
  save: '保存', saveDesc: '将当前项目保存到磁盘。',
  saveAs: '另存为', saveAsDesc: '将当前项目以新名称保存。',
  preferences: '首选项', preferencesDesc: '打开设置对话框（主题、语言）。',
  about: '关于', aboutDesc: '关于 Open FEM2D Studio 的信息。',
  exit: '退出', exitDesc: '关闭应用程序。',
},
settings: {
  title: '首选项', appearance: '外观', language: '语言',
  languageHelp: '选择您的界面语言。',
  theme: { label: '主题', help: '选择您的视觉主题。', light: '浅色', openaec: 'OpenAEC' },
},
about: { title: '关于 Open FEM2D Studio', builtOn: '构建于 OpenAEC 平台之上' },
common: { close: '关闭' },
```

- [ ] **Step 8: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (if i18n type uses a strict shape, may need to update the type definition)

- [ ] **Step 9: Commit**

```bash
git add src/i18n/
git commit -m "feat(i18n): add backstage/settings/about keys for 6 locales

NL+EN authoritative. ES/FR/IT/ZH best-effort, may need user
review for terminology accuracy."
```

---

### Task B.10: Wire Backstage + SettingsDialog + AboutDialog into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add state hooks in AppContent**

In `src/App.tsx` near other useState hooks (around line 55-69), add:

```tsx
const [showBackstage, setShowBackstage] = useState(false);
const [showSettings, setShowSettings] = useState(false);
const [showAbout, setShowAbout] = useState(false);
```

- [ ] **Step 2: Add imports at top of App.tsx**

```tsx
import { Backstage, BackstageAction } from './components/Backstage/Backstage';
import { SettingsDialog, Theme, Locale } from './components/SettingsDialog/SettingsDialog';
import { AboutDialog } from './components/AboutDialog/AboutDialog';
```

- [ ] **Step 3: Define backstage action handler**

After existing handler defs, add:
```tsx
const handleBackstageAction = useCallback((action: BackstageAction) => {
  switch (action) {
    case 'new':         /* TODO: hook to existing New handler in Ribbon */ break;
    case 'open':        /* TODO: hook to existing Open handler */ break;
    case 'save':        /* TODO: hook to existing Save handler */ break;
    case 'saveAs':      /* TODO: hook to existing Save As handler */ break;
    case 'preferences': setShowSettings(true); break;
    case 'about':       setShowAbout(true); break;
    case 'exit':        window.close(); break;
  }
}, []);
```

The TODO comments are intentional — Phase C will replace these stubs with real fileApi/windowApi calls. For Phase B, Preferences/About/Exit work; New/Open/Save/Save As remain in Ribbon for now (no regression).

- [ ] **Step 4: Render the new components in JSX**

Just before the closing `</div>` of the `.app` div (after all other dialogs), add:

```tsx
<Backstage
  isOpen={showBackstage}
  onClose={() => setShowBackstage(false)}
  onAction={handleBackstageAction}
  t={t}
/>
<SettingsDialog
  isOpen={showSettings}
  onClose={() => setShowSettings(false)}
  theme={(document.documentElement.dataset.theme as Theme) ?? 'light'}
  onThemeChange={(theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fem2d-theme', theme);
  }}
  locale={locale}
  onLocaleChange={(l) => setLocale(l)}
  t={t}
/>
<AboutDialog
  isOpen={showAbout}
  onClose={() => setShowAbout(false)}
  t={t}
/>
```

(`t`, `locale`, `setLocale` come from `useI18n()` — confirm import + hook usage exists; if not, add `const { t, locale, setLocale } = useI18n();` near top.)

- [ ] **Step 5: Pass onFileTabClick to Ribbon**

Find the `<Ribbon ... />` JSX in App.tsx. Add prop:
```tsx
<Ribbon
  ...existing props...
  onFileTabClick={() => setShowBackstage(true)}
/>
```

- [ ] **Step 6: Update Escape-key handler stack**

In the existing escape handler ([src/App.tsx:198-220](src/App.tsx:198)), add new cases at the TOP (highest priority):
```tsx
if (showAbout)     { setShowAbout(false); return; }
if (showSettings)  { setShowSettings(false); return; }
if (showBackstage) { setShowBackstage(false); return; }
// ... existing cases below ...
```

Update the dep array at the end to include the new state.

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (may need to handle `useI18n` API shape; adapt as needed)

- [ ] **Step 8: Visual smoke**

Run: `npm run dev` → click File tab in Ribbon → Backstage opens → click Preferences → SettingsDialog opens → switch theme to OpenAEC → confirm app updates → close → click About → AboutDialog shows OpenAEC info → close all with Escape.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire Backstage, SettingsDialog, AboutDialog

File tab in Ribbon now opens Backstage. Preferences opens
SettingsDialog (theme + locale). About opens AboutDialog.
Escape stack updated for new dialogs (highest z-priority).
New/Open/Save/SaveAs handlers stubbed — to be wired in Phase C
via Tauri fileApi."
```

---

### Task B.11: Phase B integration verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run existing UI tests to ensure no regression**

Run: `npm run dev` (background) on port 3006 (matches test scripts), then:
```bash
node test-final.mjs
```
Expected: tests pass (or at minimum, no new failures vs baseline). If `port 3000` mismatch, adjust test scripts or vite config temporarily.

Actually our vite config uses port 3000 by default. The test scripts assume 3006. Document this as known and use port 3000 manually for now.

- [ ] **Step 3: Manual UX walkthrough**

With dev server running:
- Click File tab → Backstage slides in → all 7 menu items visible → hover changes active state → click About → AboutDialog opens with OpenAEC content → Escape closes
- Click Preferences → SettingsDialog opens with two tabs → switch theme → app updates immediately → switch language → UI strings change → close
- Click an existing dialog (e.g. Project Info) → still works, OpenAEC styled
- Verify: Ribbon = 122px, File tab amber, animated indicator slides between tabs
- Verify: StatusBar = 22px (or documented deviation)
- Verify: TitleBar shows "Open FEM2D Studio" + project name

- [ ] **Step 4: Stop dev server, no commit**

```bash
echo "Phase B verification: PASS" > /tmp/phase-b-verify.log
```

---

# PHASE D — Report Modernization

**Phase goal:** Reports follow OpenAEC §4.3 A4 spec (38mm header banner with logo + amber gradient + illustration; footer with 4 SVG icons + page number; Space Grotesk titles; Inter body justify+hyphens).

**Phase verification:** Live preview shows all 12 sections with OpenAEC styling. HTML print export produces A4 with proper header/footer on every page. Zero teal/purple colors. Light + openaec themes both render correctly.

---

### Task D.1: Audit and remove LegacyReportGenerator if unused

**Files:**
- Possibly delete: `src/core/report/LegacyReportGenerator.ts`

- [ ] **Step 1: Find imports of LegacyReportGenerator**

Run: `grep -rn "LegacyReportGenerator" src/ --include='*.ts' --include='*.tsx' | grep -v "LegacyReportGenerator.ts"`
Expected: zero matches → safe to delete. If non-zero: list callers and decide migration.

- [ ] **Step 2: If unused, delete the file**

Run (only if step 1 returned no matches):
```bash
git rm src/core/report/LegacyReportGenerator.ts
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(report): remove unused LegacyReportGenerator

No active callers — confirmed via grep audit. Modernization
work proceeds against ReportGenerator only."
```

(If file IS used, skip the delete step, document callers in the commit, and move on. The plan continues regardless.)

---

### Task D.2: Download OpenAEC SVG assets to public/

**Files:**
- Create: `public/openaec-assets/logo/openaec-logo-amber-on-dark.svg`
- Create: `public/openaec-assets/logo/openaec-symbol-amber-on-dark.svg`
- Create: `public/openaec-assets/illustrations/report-header-dark.svg`

- [ ] **Step 1: Create directory structure**

Run: `mkdir -p public/openaec-assets/logo public/openaec-assets/illustrations public/openaec-assets/icons`

- [ ] **Step 2: Download logo SVGs from OpenAEC repo**

Run:
```bash
curl -L -o public/openaec-assets/logo/openaec-logo-amber-on-dark.svg "https://raw.githubusercontent.com/OpenAEC-Foundation/OpenAEC-style-book/main/brandbook/assets/logo/svg/openaec-logo-amber-on-dark.svg"
curl -L -o public/openaec-assets/logo/openaec-symbol-amber-on-dark.svg "https://raw.githubusercontent.com/OpenAEC-Foundation/OpenAEC-style-book/main/brandbook/assets/logo/svg/openaec-symbol-amber-on-dark.svg"
curl -L -o public/openaec-assets/illustrations/report-header-dark.svg "https://raw.githubusercontent.com/OpenAEC-Foundation/OpenAEC-style-book/main/brandbook/assets/illustrations/svg/report-header-dark.svg"
```

- [ ] **Step 3: Verify downloads**

Run:
```bash
for f in public/openaec-assets/logo/openaec-logo-amber-on-dark.svg public/openaec-assets/logo/openaec-symbol-amber-on-dark.svg public/openaec-assets/illustrations/report-header-dark.svg; do
  if [ -s "$f" ] && head -1 "$f" | grep -q "svg\|xml"; then echo "OK: $f"; else echo "FAIL: $f"; fi
done
```
Expected: 3× `OK`. If any fails, the URL changed — search the OpenAEC repo manually via `gh api`.

- [ ] **Step 4: Commit**

```bash
git add public/openaec-assets/
git commit -m "chore(assets): download OpenAEC logo + report-header illustration

Source: github.com/OpenAEC-Foundation/OpenAEC-style-book/main
SVG masters used inline in reports + as TitleBar/About icons."
```

---

### Task D.3: Create ReportTheme.ts with hex constants and inline SVG strings

**Files:**
- Create: `src/core/report/ReportTheme.ts`

- [ ] **Step 1: Create ReportTheme.ts**

```ts
/**
 * Report theme constants — OpenAEC palette + inline SVG assets.
 * Static HTML in ReportGenerator can't use CSS vars, so hex literals are needed.
 */

import logoSvg from '../../../public/openaec-assets/logo/openaec-logo-amber-on-dark.svg?raw';
import headerIllustration from '../../../public/openaec-assets/illustrations/report-header-dark.svg?raw';

export const ReportColors = {
  amber:           '#D97706',
  deepForge:       '#36363E',
  signalOrange:    '#EA580C',
  warmGold:        '#F59E0B',
  scaffoldGray:    '#A1A1AA',
  blueprintWhite:  '#FAFAF9',
  concrete:        '#F5F5F4',
  nightBuild:      '#2A2A32',
  borderLight:     '#E7E5E4',
  textMuted:       '#57534E',
  gradient:        'linear-gradient(90deg, #D97706 0%, #F59E0B 40%, #EA580C 100%)',
} as const;

export const ReportFonts = {
  heading: '"Space Grotesk", system-ui, sans-serif',
  body:    '"Inter", system-ui, sans-serif',
  mono:    '"JetBrains Mono", monospace',
} as const;

export const ReportAssets = {
  logoAmberOnDark: logoSvg,
  headerIllustration,
} as const;

/**
 * Footer icon SVGs (24×24 viewBox, stroke-based).
 * Per OpenAEC §4.3: building, code, BIM cube, git-branch.
 */
export const FooterIcons = {
  building: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><rect x="6" y="3" width="12" height="18"/><circle cx="9.5" cy="8" r="0.5" fill="${ReportColors.scaffoldGray}"/><circle cx="14.5" cy="8" r="0.5" fill="${ReportColors.scaffoldGray}"/><circle cx="9.5" cy="13" r="0.5" fill="${ReportColors.scaffoldGray}"/><circle cx="14.5" cy="13" r="0.5" fill="${ReportColors.scaffoldGray}"/><rect x="10.5" y="17" width="3" height="4"/></svg>`,
  code:     `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>`,
  bimCube:  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4l8-4M12 11v10"/></svg>`,
  gitBranch:`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ReportColors.scaffoldGray}" stroke-width="1.5" opacity="0.5"><circle cx="6" cy="3" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="11" r="2"/><path d="M6 5v11"/><path d="M6 11h6a4 4 0 004-4V5"/></svg>`,
} as const;
```

- [ ] **Step 2: Add Vite type declaration for ?raw imports if missing**

Check `src/vite-env.d.ts` exists. If not, create:
```ts
/// <reference types="vite/client" />
```
Vite supports `?raw` import out of the box. If TypeScript complains, add to a new `src/raw-svg.d.ts`:
```ts
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/report/ReportTheme.ts src/raw-svg.d.ts 2>/dev/null
git commit -m "feat(report): add ReportTheme constants + footer SVG icons

Hex literals for static HTML. Inline SVGs for logo and header
illustration via Vite ?raw import. Footer icons inline as JSX."
```

---

### Task D.4: Create ReportHeader generator

**Files:**
- Create: `src/core/report/ReportHeader.ts`

- [ ] **Step 1: Create ReportHeader.ts**

```ts
/**
 * Report header banner generator.
 * Produces HTML for the 38mm A4 header per OpenAEC §4.3:
 * - Left: OpenAEC logo + "Build free. Build together." tagline
 * - Right: project metadata (project number, engineer, date)
 * - Background: deep-forge with illustration overlay at 35% opacity
 * - Bottom border: 4px amber gradient
 */

import { IReportConfig } from './ReportConfig';
import { IProjectInfo } from '../../context/FEMContext';
import { ReportColors, ReportFonts, ReportAssets } from './ReportTheme';

export function generateHeaderHTML(config: IReportConfig, projectInfo: IProjectInfo): string {
  const projNumber = projectInfo.projectNumber ?? '';
  const engineer = projectInfo.engineer ?? '';
  const date = projectInfo.date ?? new Date().toLocaleDateString();
  const projectName = projectInfo.name || 'Untitled Project';
  const tagline = config.tagline ?? 'Build free. Build together.';

  return `
  <header class="report-header" style="
    position: fixed; top: 0; left: 0; right: 0;
    height: 38mm;
    background: ${ReportColors.deepForge};
    color: ${ReportColors.blueprintWhite};
    overflow: hidden;
    z-index: 100;
  ">
    <div style="
      position: absolute; right: 0; top: 0; bottom: 0;
      width: 50%;
      opacity: 0.35;
      pointer-events: none;
    ">${ReportAssets.headerIllustration}</div>

    <div style="
      position: relative;
      display: flex; justify-content: space-between; align-items: center;
      padding: 5mm 12mm;
      height: 100%;
      box-sizing: border-box;
    ">
      <div style="display: flex; flex-direction: column; gap: 2mm; max-width: 80mm;">
        <div style="height: 14mm; display: flex; align-items: center;">
          ${ReportAssets.logoAmberOnDark}
        </div>
        <div style="
          font-family: ${ReportFonts.body};
          font-size: 0.7rem;
          color: ${ReportColors.scaffoldGray};
          font-style: italic;
        ">${escape(tagline)}</div>
      </div>

      <div style="
        font-family: ${ReportFonts.body};
        font-size: 0.7rem;
        color: ${ReportColors.scaffoldGray};
        text-align: right;
        line-height: 1.6;
      ">
        ${projNumber ? `<div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Project:</span> ${escape(projNumber)}</div>` : ''}
        <div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Name:</span> ${escape(projectName)}</div>
        ${engineer ? `<div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Engineer:</span> ${escape(engineer)}</div>` : ''}
        <div><span style="color: ${ReportColors.blueprintWhite}; font-weight: 600;">Date:</span> ${escape(date)}</div>
      </div>
    </div>

    <div style="
      position: absolute; bottom: 0; left: 0; right: 0;
      height: 4px;
      background: ${ReportColors.gradient};
    "></div>
  </header>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/report/ReportHeader.ts
git commit -m "feat(report): add header banner generator (OpenAEC §4.3)

38mm fixed-position header with logo + tagline (left), project
metadata (right), illustration overlay 35% opacity, 4px amber
gradient bottom border. Used per page in browser print."
```

---

### Task D.5: Create ReportFooter generator

**Files:**
- Create: `src/core/report/ReportFooter.ts`

- [ ] **Step 1: Create ReportFooter.ts**

```ts
/**
 * Report footer generator.
 * Per OpenAEC §4.3:
 * - Background: deep-forge
 * - Top border: 3px amber gradient
 * - Left: brand wordmark "Open" + "AEC"
 * - Center: 4 SVG icons (building, code, BIM cube, git-branch)
 * - Right: document title + page number (JetBrains Mono, amber)
 */

import { IReportConfig } from './ReportConfig';
import { ReportColors, ReportFonts, FooterIcons } from './ReportTheme';

export function generateFooterHTML(config: IReportConfig): string {
  const docTitle = config.documentTitle ?? 'Constructieadvies';

  return `
  <footer class="report-footer" style="
    position: fixed; bottom: 0; left: 0; right: 0;
    height: 15mm;
    background: ${ReportColors.deepForge};
    color: ${ReportColors.scaffoldGray};
    padding: 5mm 12mm;
    box-sizing: border-box;
    display: flex; justify-content: space-between; align-items: center;
    z-index: 100;
  ">
    <div style="
      position: absolute; top: 0; left: 0; right: 0;
      height: 3px;
      background: ${ReportColors.gradient};
    "></div>

    <div style="
      font-family: ${ReportFonts.heading};
      font-weight: 700;
      font-size: 0.75rem;
    ">
      <span style="color: ${ReportColors.blueprintWhite};">Open</span><span style="color: ${ReportColors.amber};">AEC</span>
    </div>

    <div style="display: flex; gap: 8mm; align-items: center;">
      ${FooterIcons.building}
      ${FooterIcons.code}
      ${FooterIcons.bimCube}
      ${FooterIcons.gitBranch}
    </div>

    <div style="
      font-family: ${ReportFonts.mono};
      font-size: 0.7rem;
      color: ${ReportColors.amber};
    ">
      ${escape(docTitle)} · <span class="page-number">p. <span class="pgnum"></span></span>
    </div>
  </footer>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

Note: page numbers in browser print are non-trivial — `<span class="pgnum">` is a placeholder; we'll use CSS `counter()` in the print stylesheet (Task D.7) to inject `counter(page)`.

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/report/ReportFooter.ts
git commit -m "feat(report): add footer generator (OpenAEC §4.3)

15mm fixed-position footer with brand wordmark (left), 4 SVG
icons (center), document title + page number (right) in
JetBrains Mono amber. 3px amber gradient top border."
```

---

### Task D.6: Update ReportConfig with new fields

**Files:**
- Modify: `src/core/report/ReportConfig.ts`

- [ ] **Step 1: Add new optional fields to IReportConfig interface**

Use Edit tool. In the interface (around lines 43-61), add after `accentColor`:

```ts
  // OpenAEC §4.3 fields
  documentTitle?: string;  // Header banner subtitle, e.g. "Constructieadvies & berekeningen"
  tagline?: string;        // Header tagline under logo, default "Build free. Build together."
```

In `DEFAULT_REPORT_CONFIG` (around line 63), add at the end before the closing `}`:
```ts
  documentTitle: 'Constructieadvies & berekeningen',
  tagline: 'Build free. Build together.',
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/report/ReportConfig.ts
git commit -m "feat(report): add documentTitle + tagline to ReportConfig

Used by ReportHeader and ReportFooter. User-editable via
ReportSettingsDialog (added in later task)."
```

---

### Task D.7: Rewrite ReportGenerator with §4.3 layout + page-break logic

**Files:**
- Modify: `src/core/report/ReportGenerator.ts` (substantial rewrite)

- [ ] **Step 1: Read current ReportGenerator.ts to understand existing structure**

Run: `wc -l src/core/report/ReportGenerator.ts`
Expected: large file (~500-1000 lines)

Run: `grep -n "^function\|^export function" src/core/report/ReportGenerator.ts`
Expected: list of section generators (generateCoverHTML, generateTocHTML, etc.) + main `generateReport()`

- [ ] **Step 2: Update the wrapping HTML template**

Find the function that wraps section HTML strings with the full HTML document (likely `generateReport()` at the end of the file). Replace the wrapper with OpenAEC-compliant version:

```ts
import { generateHeaderHTML } from './ReportHeader';
import { generateFooterHTML } from './ReportFooter';
import { ReportColors, ReportFonts } from './ReportTheme';

export function generateReport(data: ReportData): string {
  const { config, projectInfo } = data;
  const sections = getEnabledSections(config);
  const sectionHTMLs = sections.map(s => generateSectionHTML(s.id, data)).filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>${escape(projectInfo.name || 'Untitled Project')} — Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: ${ReportFonts.body};
      font-size: 0.9rem;
      line-height: 1.7;
      color: ${ReportColors.deepForge};
      background: ${ReportColors.blueprintWhite};
    }
    body {
      counter-reset: page;
    }
    h1, h2, h3 {
      font-family: ${ReportFonts.heading};
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: ${ReportColors.deepForge};
    }
    h2 { font-size: 1.5rem; margin-top: 8mm; }
    h3 { font-size: 1.1rem; margin-top: 6mm; }
    code, pre { font-family: ${ReportFonts.mono}; }

    .report-page {
      page-break-after: always;
      padding: 50mm 12mm 25mm 12mm;
      min-height: calc(297mm - 53mm - 25mm);
    }
    .report-page:last-child { page-break-after: auto; }

    .report-content p {
      text-align: justify;
      hyphens: auto;
      -webkit-hyphens: auto;
    }

    table.report-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid ${ReportColors.borderLight};
      border-radius: 8px;
      overflow: hidden;
      font-size: 0.85rem;
      margin: 4mm 0;
    }
    table.report-table thead {
      background: ${ReportColors.concrete};
      border-bottom: 2px solid ${ReportColors.borderLight};
    }
    table.report-table th {
      padding: 3mm 4mm;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${ReportColors.textMuted};
      font-weight: 600;
      text-align: left;
    }
    table.report-table td {
      padding: 3mm 4mm;
      border-bottom: 1px solid ${ReportColors.concrete};
    }
    table.report-table tr:hover td { background: ${ReportColors.blueprintWhite}; }

    .section-number {
      font-family: ${ReportFonts.mono};
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: ${ReportColors.amber};
    }

    /* Page counter for footer (Chromium-only) */
    .pgnum::before { content: counter(page); }

    @media print {
      .report-page { padding-top: 50mm; padding-bottom: 25mm; }
    }
  </style>
</head>
<body>
  ${generateHeaderHTML(config, projectInfo)}
  ${generateFooterHTML(config)}
  <main>
    ${sectionHTMLs}
  </main>
</body>
</html>`;
}

function generateSectionHTML(id: ReportSectionType, data: ReportData): string {
  // dispatcher to existing section generator functions, wrapped in <div class="report-page">
  const inner = (() => {
    switch (id) {
      case 'cover':                return generateCoverHTML(data);
      case 'toc':                  return generateTocHTML(data);
      case 'summary':              return generateSummaryHTML(data);
      case 'input_geometry':       return generateGeometryHTML(data);
      case 'input_nodes':          return generateNodesHTML(data);
      case 'input_members':        return generateMembersHTML(data);
      case 'input_profiles':       return generateProfilesHTML(data);
      case 'input_loadcases':      return generateLoadCasesHTML(data);
      case 'input_loads':          return generateLoadsHTML(data);
      case 'result_combinations':  return generateCombinationsHTML(data);
      case 'result_reactions':     return generateReactionsHTML(data);
      case 'result_displacements': return generateDisplacementsHTML(data);
      case 'result_forces_M':      return generateForcesHTML(data, 'M');
      case 'result_forces_V':      return generateForcesHTML(data, 'V');
      case 'result_forces_N':      return generateForcesHTML(data, 'N');
      case 'result_envelope':      return generateEnvelopeHTML(data);
      default: return '';
    }
  })();
  return `<div class="report-page" id="section-${id}"><div class="report-content">${inner}</div></div>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

Adapt the dispatcher to match actual section generator function names. If the existing file uses different naming (likely), keep the existing names.

- [ ] **Step 3: Update individual section generators (CoverSection, etc.) to use ReportColors instead of config.primaryColor literals**

Find each `generateXxxHTML()` function. Replace inline `${config.primaryColor}` with `${ReportColors.amber}` or `${ReportColors.deepForge}` per OpenAEC palette. Keep `config.primaryColor` as a user-overridable input (for white-label scenarios) but default it via the palette.

This is grunt work — ~10-15 functions, each with ~5-20 color references.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Visual verification**

Run: `npm run dev` → load any project with a mesh → open ReportPanel → trigger HTML export (download/print). Inspect rendered HTML. Verify:
- Header banner visible with logo, project metadata, amber gradient
- Footer with brand + 4 icons + page number
- Body text in Inter, justified
- Headings in Space Grotesk
- No teal/purple colors

- [ ] **Step 6: Commit**

```bash
git add src/core/report/ReportGenerator.ts
git commit -m "refactor(report): rewrite HTML output for OpenAEC §4.3 layout

Wrapping HTML now includes Google Fonts link, OpenAEC base
typography, fixed-position header (38mm) + footer (15mm) on
every page, page-break-after per section, justified+hyphenated
body. Section generators continue to be called by id dispatcher.
Color literals replaced with ReportColors constants."
```

---

### Task D.8: Restyle the 12 React section components in ReportPanel

**Files:**
- Modify: `src/components/ReportPanel/sections/CoverSection.tsx` + 11 others

- [ ] **Step 1: List all 12 section files**

Run: `ls src/components/ReportPanel/sections/`
Expected: ~12 .tsx files

- [ ] **Step 2: For each file, audit and restyle (12 sub-tasks, can be batched)**

For each section file, grep for inline color literals and font-family declarations. Replace with theme tokens:
- Color hexes → `var(--theme-fg)` / `var(--theme-accent)` / `var(--theme-bg-subtle)` etc.
- Font families → `var(--font-heading)` / `var(--font-body)` / `var(--font-mono)`
- Border-radius literals → `var(--radius-md)` etc.

Add to each section's `<h2>` className `report-section-title` (define in ReportPanel.css):

```css
/* In ReportPanel.css */
.report-section-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.5rem;
  color: var(--theme-fg);
  margin: 0 0 var(--sp-4) 0;
}
.report-section-number {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--theme-accent);
  margin-bottom: var(--sp-1);
}
.report-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: 0.85rem;
  font-family: var(--font-body);
}
.report-table thead {
  background: var(--theme-bg-subtle);
  border-bottom: 2px solid var(--theme-border);
}
.report-table th {
  padding: 8px 12px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-fg-muted);
  font-weight: 600;
  text-align: left;
}
.report-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--theme-bg-subtle);
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Visual smoke**

Run: `npm run dev` → open ReportPanel → scroll through all 12 sections → verify amber/gold accents, Space Grotesk titles, Inter body, no teal/purple.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportPanel/
git commit -m "refactor(report-sections): restyle 12 section components for OpenAEC

Replace hardcoded color literals with theme tokens. Apply
Space Grotesk titles + Inter body + JetBrains Mono section
numbers. Tables use OpenAEC table style with amber-tinted
header. No layout changes — visual restyle only."
```

---

### Task D.9: Update ReportPanel print stylesheet for A4 page-break

**Files:**
- Modify: `src/components/ReportPanel/ReportPanel.css`

- [ ] **Step 1: Add @media print block at end of ReportPanel.css**

```css
@media print {
  body { background: white !important; }
  .report-panel-sidebar,
  .report-panel-toolbar { display: none !important; }
  .report-preview {
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    box-shadow: none !important;
  }
  .report-section {
    page-break-after: always;
    padding: 50mm 12mm 25mm 12mm;
    min-height: calc(297mm - 75mm);
  }
  .report-section:last-child { page-break-after: auto; }
}
```

- [ ] **Step 2: Visual verification — print preview**

Run: `npm run dev` → open ReportPanel → press Ctrl+P → in print preview, confirm A4 page format, header/footer visible on every page, sections page-break correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportPanel/ReportPanel.css
git commit -m "feat(report): add @media print A4 styles to ReportPanel

Hides sidebar/toolbar in print, applies 50mm/25mm padding for
fixed header/footer, page-break-after per section."
```

---

### Task D.10: i18n the report's hardcoded NL strings

**Files:**
- Modify: `src/core/report/ReportGenerator.ts`
- Modify: `src/i18n/en.ts` + nl.ts + es.ts + fr.ts + it.ts + zh.ts

- [ ] **Step 1: Find all hardcoded NL strings in ReportGenerator.ts**

Run: `grep -E "(Constructieadvies|Inhoudsopgave|In opdracht van|Verantwoordelijk|Toegepaste Normen|Datum|Ter goedkeuring|Project|Adviseur|Naam)" src/core/report/ReportGenerator.ts | head -30`

Identify each unique Dutch string. Build a key map.

- [ ] **Step 2: Add report.* keys to en.ts**

```ts
report: {
  coverTitle: 'Structural Engineering Report',
  coverSubtitle: 'Calculations & Analysis',
  toc: 'Table of Contents',
  summary: 'Executive Summary',
  project: 'Project',
  client: 'Client',
  description: 'Description',
  consultant: 'Consultant',
  engineer: 'Responsible Engineer',
  appliedStandards: 'Applied Standards',
  date: 'Date',
  status: 'Status',
  statusForApproval: 'For approval',
  page: 'Page',
  // section titles
  inputGeometry: 'Model Geometry',
  inputNodes: 'Node Coordinates',
  inputMembers: 'Members',
  inputProfiles: 'Profile Properties',
  inputLoadCases: 'Load Cases',
  inputLoads: 'Load Graphics',
  resultCombinations: 'Load Combinations',
  resultReactions: 'Reactions',
  resultDisplacements: 'Displacements',
  resultForcesM: 'Bending Moments',
  resultForcesV: 'Shear Forces',
  resultForcesN: 'Axial Forces',
  resultEnvelope: 'Envelope Diagrams',
},
```

- [ ] **Step 3: Add Dutch translations to nl.ts**

```ts
report: {
  coverTitle: 'Constructieadvies',
  coverSubtitle: 'Berekeningen & analyse',
  toc: 'Inhoudsopgave',
  summary: 'Samenvatting',
  project: 'Project',
  client: 'In opdracht van',
  description: 'Omschrijving',
  consultant: 'Adviseur',
  engineer: 'Verantwoordelijk constructeur',
  appliedStandards: 'Toegepaste Normen',
  date: 'Datum rapport',
  status: 'Rapportstatus',
  statusForApproval: 'Ter goedkeuring',
  page: 'Pagina',
  inputGeometry: 'Modelgeometrie',
  inputNodes: 'Knooppuntcoördinaten',
  inputMembers: 'Staven',
  inputProfiles: 'Profieleigenschappen',
  inputLoadCases: 'Belastinggevallen',
  inputLoads: 'Belastingdiagrammen',
  resultCombinations: 'Belastingcombinaties',
  resultReactions: 'Reactiekrachten',
  resultDisplacements: 'Verplaatsingen',
  resultForcesM: 'Buigende momenten',
  resultForcesV: 'Dwarskrachten',
  resultForcesN: 'Normaalkrachten',
  resultEnvelope: 'Omhullende diagrammen',
},
```

- [ ] **Step 4: Add to es.ts, fr.ts, it.ts, zh.ts**

For brevity in this plan, translate each `report.*` key to the target language. Use the en.ts list as the canonical set. Best-effort translation, mark uncertain terms with a `// TODO review` comment.

Example for fr.ts:
```ts
report: {
  coverTitle: 'Étude structurelle',
  coverSubtitle: 'Calculs & analyse',
  toc: 'Table des matières',
  // ... etc
},
```

- [ ] **Step 5: Refactor ReportGenerator.ts to use t() function**

Pass a `t: (key: string) => string` function into `generateReport()` and threads through to section generators. Replace each hardcoded NL string with `t('report.coverTitle')` etc.

This is more invasive — function signatures change. Update `ReportPanel.tsx` (the caller) to pass `t` from `useI18n()`.

- [ ] **Step 6: TypeScript check + visual smoke**

Run: `npx tsc --noEmit`
Run: `npm run dev` → switch app to EN locale → open report → titles in EN. Switch to NL → titles in NL.

- [ ] **Step 7: Commit**

```bash
git add src/core/report/ src/components/ReportPanel/ReportPanel.tsx src/i18n/
git commit -m "feat(report): i18n the hardcoded report strings (6 locales)

~25 keys per locale. ReportGenerator now takes t() function.
Default fallback EN. ES/FR/IT/ZH are best-effort and may need
user review for engineering terminology."
```

---

### Task D.11: Phase D integration verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: End-to-end report generation test**

Run: `npm run dev` (background)

- Create new project, draw 3 nodes + 2 beams, add load case with simple point load
- Run solver
- Open ReportPanel → enable all sections → click Export/Print
- In print preview:
  - Verify A4 portrait
  - Header banner on every page (with OpenAEC logo + project metadata + amber gradient)
  - Footer on every page (brand + 4 icons + page number)
  - Body in Inter justified
  - Section titles in Space Grotesk
  - Tables styled per OpenAEC (amber-tinted header)
  - Page count = expected number based on enabled sections

- Switch theme to openaec → preview updates → print preview still shows valid layout (white page with amber accents — print is theme-agnostic)

- Switch locale to EN → titles change to English

- [ ] **Step 3: Stop server, no commit**

```bash
echo "Phase D verification: PASS" > /tmp/phase-d-verify.log
```

---

# PHASE C — Tauri v2 Migration

**Phase goal:** Replace Electron 40 with Tauri v2. Frameless window with custom TitleBar window controls. File IO and persistence via Tauri plugins. Hard cutover — Electron deleted in this phase.

**Phase verification:** `npm run tauri:dev` opens frameless window. Open/Save use native file pickers. Theme persistence via Tauri Store. `npm run tauri:build` produces `.msi` installer. Existing user can install and use the app on Windows.

**Pre-requisite:** Rust toolchain installed (rustc + cargo). Document this in README at start of phase if not already.

---

### Task C.1: Verify Rust toolchain installed

- [ ] **Step 1: Check Rust version**

Run: `rustc --version`
Expected: `rustc 1.77.0 (or later)`

If not installed: STOP and prompt user to install via https://rustup.rs/ then rerun this step.

- [ ] **Step 2: Check cargo**

Run: `cargo --version`
Expected: `cargo 1.77 (or later)`

---

### Task C.2: Initialize Tauri scaffold

**Files:**
- Create: `src-tauri/` (entire folder via cargo)

- [ ] **Step 1: Install Tauri CLI globally (or via npx)**

Run: `npm install --save-dev @tauri-apps/cli@^2 @tauri-apps/api@^2 @tauri-apps/plugin-store @tauri-apps/plugin-dialog @tauri-apps/plugin-fs`
Expected: packages added to package.json

- [ ] **Step 2: Initialize tauri (interactive — answer prompts as below)**

Run: `npx tauri init`
Prompts:
- App name: `Open FEM2D Studio`
- Window title: `Open FEM2D Studio`
- Web assets location: `../dist`
- Dev URL: `http://localhost:1420`
- Frontend dev command: `npm run dev`
- Frontend build command: `npm run build`

This creates `src-tauri/` with default Cargo.toml, tauri.conf.json, src/main.rs, build.rs.

- [ ] **Step 3: Verify scaffold created**

Run: `ls src-tauri/`
Expected: Cargo.toml, tauri.conf.json, src/, build.rs, capabilities/

- [ ] **Step 4: Commit scaffold**

```bash
git add src-tauri/ package.json package-lock.json
git commit -m "feat(tauri): initialize Tauri v2 scaffold

Default cargo project with placeholder config. Will be customized
in next tasks (frameless window, plugins, OpenAEC branding)."
```

---

### Task C.3: Configure tauri.conf.json with OpenAEC settings

**Files:**
- Modify: `src-tauri/tauri.conf.json` (full rewrite)

- [ ] **Step 1: Replace tauri.conf.json content**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Open FEM2D Studio",
  "version": "1.0.0",
  "identifier": "org.openaec.fem2d-studio",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Open FEM2D Studio",
        "label": "main",
        "width": 1400,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 600,
        "decorations": false,
        "resizable": true,
        "fullscreen": false,
        "transparent": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://nominatim.openstreetmap.org http://localhost:* ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "publisher": "OpenAEC Foundation",
    "copyright": "© 2026 OpenAEC Foundation. CC BY-SA 4.0",
    "category": "Productivity",
    "shortDescription": "2D Finite Element Method solver",
    "longDescription": "Open FEM2D Studio — open-source 2D Finite Element Method solver for structural analysis. Part of the OpenAEC Foundation portfolio."
  },
  "plugins": {
    "store": {},
    "dialog": {},
    "fs": {
      "scope": ["$DOCUMENT/*", "$DESKTOP/*", "$DOWNLOAD/*", "$HOME/*"]
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(tauri): configure OpenAEC branding and frameless window

Identifier org.openaec.fem2d-studio, frameless (decorations:false),
1400x900 default with 1024x600 minimum, MSI + NSIS bundles,
publisher OpenAEC Foundation, CC BY-SA 4.0. CSP allows
OSM tiles, Google Fonts, Nominatim. Plugins: store, dialog, fs."
```

---

### Task C.4: Update Cargo.toml with required dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Replace Cargo.toml dependencies**

```toml
[package]
name = "open-fem2d-studio"
version = "1.0.0"
description = "Open FEM2D Studio — 2D FEM solver"
authors = ["OpenAEC Foundation"]
license = "CC-BY-SA-4.0"
edition = "2021"

[lib]
name = "open_fem2d_studio_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-store = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Update src/main.rs**

```rust
fn main() {
    open_fem2d_studio_lib::run()
}
```

And create `src-tauri/src/lib.rs`:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: cargo check**

Run: `cd src-tauri && cargo check && cd ..`
Expected: `Finished dev profile` (may take 2-5 minutes first time)

If errors: read carefully, common cause is missing system dep or version mismatch.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/
git commit -m "feat(tauri): add Cargo deps and entry point

Plugins registered: store, dialog, fs. Library + binary
crate-type for desktop + future mobile compatibility."
```

---

### Task C.5: Generate icons from OpenAEC symbol

**Files:**
- Create: `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`

- [ ] **Step 1: Use Tauri CLI to generate icons from a single source PNG**

If you have a high-res square OpenAEC symbol PNG (e.g. 1024×1024), run:
```bash
npx tauri icon path/to/openaec-symbol-amber-on-dark-1024.png
```

Tauri will generate all required formats into `src-tauri/icons/`.

If no PNG source: download the OpenAEC symbol PNG @3x:
```bash
curl -L -o /tmp/openaec-symbol.png "https://raw.githubusercontent.com/OpenAEC-Foundation/OpenAEC-style-book/main/brandbook/assets/logo/png/openaec-symbol-amber-on-dark-3x.png"
npx tauri icon /tmp/openaec-symbol.png
```

- [ ] **Step 2: Verify icons present**

Run: `ls src-tauri/icons/`
Expected: 32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico (and possibly Square*.png variants)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/icons/
git commit -m "chore(tauri): add app icons generated from OpenAEC symbol

Source: OpenAEC-Foundation/OpenAEC-style-book symbol-amber-on-dark.
Generated by tauri icon CLI."
```

---

### Task C.6: Create windowApi abstraction

**Files:**
- Create: `src/lib/windowApi.ts`

- [ ] **Step 1: Create windowApi.ts**

```ts
/**
 * Window API abstraction for Tauri v2.
 * Used by TitleBar component for window controls.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';

export const windowApi = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  startDragging: () => getCurrentWindow().startDragging(),
};
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (requires @tauri-apps/api in deps — added in Task C.2)

- [ ] **Step 3: Commit**

```bash
git add src/lib/windowApi.ts
git commit -m "feat(tauri): add windowApi for window controls

Used by TitleBar window control buttons (min/max/close)."
```

---

### Task C.7: Create storeApi abstraction with localStorage migration

**Files:**
- Create: `src/lib/storeApi.ts`
- Create: `src/lib/migrateLocalStorage.ts`

- [ ] **Step 1: Create storeApi.ts**

```ts
/**
 * Persistent settings store via Tauri plugin-store.
 * Settings persist to ~/.local/share/org.openaec.fem2d-studio/settings.json
 * (or platform equivalent).
 */
import { Store } from '@tauri-apps/plugin-store';

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load('settings.json');
  }
  return storePromise;
}

export const storeApi = {
  async get<T>(key: string): Promise<T | null> {
    const store = await getStore();
    return await store.get<T>(key);
  },
  async set<T>(key: string, val: T): Promise<void> {
    const store = await getStore();
    await store.set(key, val);
    await store.save();
  },
  async delete(key: string): Promise<void> {
    const store = await getStore();
    await store.delete(key);
    await store.save();
  },
};
```

- [ ] **Step 2: Create migrateLocalStorage.ts**

```ts
/**
 * One-shot migration from localStorage (Electron era) to Tauri Store.
 * Runs on app startup; idempotent (safe to call repeatedly).
 */
import { storeApi } from './storeApi';

const MIGRATED_FLAG = 'openaec.migration-v1-complete';

const KEYS_TO_MIGRATE = [
  'fem2d-theme',
  'fem2d-locale',
  'fem2d-ribbon-tab',
  // add others as discovered
];

export async function migrateLocalStorageToTauriStore(): Promise<void> {
  // Check if migration already done
  const done = await storeApi.get<boolean>(MIGRATED_FLAG);
  if (done) return;

  for (const key of KEYS_TO_MIGRATE) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      // Try to JSON.parse — if fails, store as string
      try {
        await storeApi.set(key, JSON.parse(value));
      } catch {
        await storeApi.set(key, value);
      }
    }
  }

  // Special case: migrate 'dark' theme value to 'openaec'
  const theme = await storeApi.get<string>('fem2d-theme');
  if (theme === 'dark') {
    await storeApi.set('fem2d-theme', 'openaec');
  }

  await storeApi.set(MIGRATED_FLAG, true);
  console.log('[OpenAEC] localStorage → Tauri Store migration complete');
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/storeApi.ts src/lib/migrateLocalStorage.ts
git commit -m "feat(tauri): add storeApi + one-shot localStorage migration

Tauri Store at settings.json in app data dir. Migration moves
fem2d-* keys from localStorage to Tauri Store on first launch.
Includes 'dark' → 'openaec' theme value migration."
```

---

### Task C.8: Create fileApi abstraction

**Files:**
- Create: `src/lib/fileApi.ts`

- [ ] **Step 1: Create fileApi.ts**

```ts
/**
 * File IO abstraction via Tauri plugin-dialog and plugin-fs.
 * Replaces previous browser-blob download/upload patterns.
 */
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export interface OpenedFile {
  path: string;
  content: string;
}

export const fileApi = {
  async openProject(): Promise<OpenedFile | null> {
    const path = await openDialog({
      title: 'Open FEM Project',
      filters: [{ name: 'FEM Project', extensions: ['femp', 'json'] }],
      multiple: false,
    });
    if (!path || Array.isArray(path)) return null;
    const content = await readTextFile(path);
    return { path, content };
  },

  async saveProject(content: string, path: string): Promise<void> {
    await writeTextFile(path, content);
  },

  async saveProjectAs(content: string, defaultName?: string): Promise<string | null> {
    const path = await saveDialog({
      title: 'Save FEM Project As',
      defaultPath: defaultName,
      filters: [{ name: 'FEM Project', extensions: ['femp'] }],
    });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  },
};
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/fileApi.ts
git commit -m "feat(tauri): add fileApi for project open/save via Tauri dialogs

Replaces browser blob downloads. Uses Tauri plugin-dialog +
plugin-fs. .femp extension primary, .json fallback."
```

---

### Task C.9: Update vite.config.ts for Tauri requirements

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Read current vite.config.ts**

Run: `cat vite.config.ts`

- [ ] **Step 2: Update with Tauri-required settings**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const TAURI_DEV_HOST = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: TAURI_DEV_HOST || false,
    hmr: TAURI_DEV_HOST
      ? { protocol: 'ws', host: TAURI_DEV_HOST, port: 1421 }
      : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
```

(Preserve any custom vite plugins/aliases from the existing config.)

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "feat(tauri): configure Vite for Tauri dev requirements

Port 1420 (Tauri default), strictPort to fail-fast on conflict,
clearScreen:false to preserve Rust output, ignore src-tauri
in file watcher, TAURI_ env prefix."
```

---

### Task C.10: Update package.json scripts; remove Electron deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update scripts section**

Use Edit tool. Replace the `"scripts"` block:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

(Remove `electron:dev`, `electron:build`, `electron:preview`.)

- [ ] **Step 2: Remove `main` field**

Remove the `"main": "electron/main.cjs"` line from package.json.

- [ ] **Step 3: Remove electron deps**

```bash
npm uninstall electron electron-builder
```

This updates package.json + package-lock.json.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): remove Electron, add Tauri scripts

npm uninstall electron electron-builder. Scripts now expose
tauri:dev (primary dev workflow) and tauri:build (produces
.msi + setup.exe). Removed main field (no Electron entry)."
```

---

### Task C.11: Add window controls to TitleBar

**Files:**
- Modify: `src/components/TitleBar/TitleBar.tsx`
- Modify: `src/components/TitleBar/TitleBar.css`

- [ ] **Step 1: Update TitleBar.css with window control styles + drag region**

Add to TitleBar.css:

```css
.title-bar { -webkit-user-select: none; user-select: none; }

.title-bar-window-controls {
  display: flex;
  margin-left: var(--sp-3);
  /* ensure controls are above drag region */
  -webkit-app-region: no-drag;
}

.title-bar-wc-btn {
  width: 46px;
  height: 32px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--theme-fg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}
.title-bar-wc-btn:hover { background: var(--theme-bg-subtle); color: var(--theme-fg); }
.title-bar-wc-btn.is-close:hover { background: #DC2626; color: white; }
```

- [ ] **Step 2: Update TitleBar.tsx — add window controls (Tauri-only)**

```tsx
import { Box, Save, Undo, Redo, Minus, Square, X } from 'lucide-react';
import { windowApi } from '../../lib/windowApi';
import './TitleBar.css';

interface TitleBarProps {
  projectName: string;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  rightSlot?: React.ReactNode;
}

export function TitleBar({
  projectName, onSave, onUndo, onRedo, canUndo = false, canRedo = false, rightSlot,
}: TitleBarProps) {
  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar-left" data-tauri-drag-region>
        <Box size={14} />
        <span>Open FEM2D Studio</span>
        {(onSave || onUndo || onRedo) && (
          <div className="title-bar-quick-access" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {onSave && <button className="title-bar-qa-btn" onClick={onSave} title="Save (Ctrl+S)" aria-label="Save"><Save size={14} /></button>}
            {onUndo && <button className="title-bar-qa-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo size={14} /></button>}
            {onRedo && <button className="title-bar-qa-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo size={14} /></button>}
          </div>
        )}
      </div>
      <div className="title-bar-center" data-tauri-drag-region>{projectName || 'Untitled Project'}</div>
      <div className="title-bar-right">
        {rightSlot}
        <div className="title-bar-window-controls">
          <button className="title-bar-wc-btn" onClick={() => windowApi.minimize()} aria-label="Minimize"><Minus size={14} /></button>
          <button className="title-bar-wc-btn" onClick={() => windowApi.toggleMaximize()} aria-label="Maximize"><Square size={12} /></button>
          <button className="title-bar-wc-btn is-close" onClick={() => windowApi.close()} aria-label="Close"><X size={14} /></button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/TitleBar/
git commit -m "feat(titlebar): add window controls (min/max/close) for Tauri

Frameless window with custom controls — minimize, toggle maximize,
close. Close button hover = #DC2626. data-tauri-drag-region
on title bar enables window dragging. Quick-access buttons
explicitly no-drag so they remain clickable."
```

---

### Task C.12: Wire Backstage open/save/exit to Tauri APIs

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace stub handlers in handleBackstageAction**

Update Task B.10's stubbed handler:

```tsx
import { fileApi } from './lib/fileApi';
import { windowApi } from './lib/windowApi';

// in AppContent body
const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

const handleBackstageAction = useCallback(async (action: BackstageAction) => {
  switch (action) {
    case 'new':
      // Reset project — adapt to existing reducer action
      dispatch({ type: 'RESET_PROJECT' as any });
      setCurrentFilePath(null);
      break;
    case 'open': {
      const opened = await fileApi.openProject();
      if (opened) {
        const project = deserializeProject(opened.content);
        // Apply project — adapt to existing dispatcher pattern
        dispatch({ type: 'LOAD_PROJECT' as any, payload: project });
        setCurrentFilePath(opened.path);
      }
      break;
    }
    case 'save':
      if (currentFilePath && getSnapshot) {
        await fileApi.saveProject(getSnapshot(), currentFilePath);
      } else {
        // Fall through to saveAs
        const path = await fileApi.saveProjectAs(getSnapshot?.() ?? '', state.projectInfo.name);
        if (path) setCurrentFilePath(path);
      }
      break;
    case 'saveAs': {
      const path = await fileApi.saveProjectAs(getSnapshot?.() ?? '', state.projectInfo.name);
      if (path) setCurrentFilePath(path);
      break;
    }
    case 'preferences': setShowSettings(true); break;
    case 'about':       setShowAbout(true); break;
    case 'exit':        windowApi.close(); break;
  }
}, [currentFilePath, getSnapshot, dispatch, state.projectInfo.name]);
```

NOTE: `RESET_PROJECT` and `LOAD_PROJECT` may not be the exact action names — adapt to the actual reducer in `FEMContext.tsx`.

- [ ] **Step 2: Initial localStorage migration call**

Near the top of `AppContent` (or in `main.tsx` before render):

```tsx
import { migrateLocalStorageToTauriStore } from './lib/migrateLocalStorage';

useEffect(() => {
  migrateLocalStorageToTauriStore().catch(err => console.error('Migration failed:', err));
}, []);
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire Backstage actions to Tauri APIs

New/Open/Save/SaveAs use fileApi (native dialogs).
Exit uses windowApi.close(). One-shot localStorage → Tauri Store
migration runs on app mount."
```

---

### Task C.13: Delete electron/ folder

**Files:**
- Delete: `electron/main.cjs`
- Delete: `electron/` (entire folder)

- [ ] **Step 1: Verify no remaining electron references**

Run: `grep -rn "electron" src/ --include='*.ts' --include='*.tsx' --include='*.json' 2>/dev/null | grep -v node_modules`
Expected: zero matches (or only comments)

- [ ] **Step 2: Delete electron folder**

```bash
git rm -r electron/
```

- [ ] **Step 3: Update .gitignore**

Edit `.gitignore`, add:
```
/src-tauri/target
/src-tauri/gen
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore(electron): remove electron folder; gitignore Tauri target

Hard cutover complete. Electron 40 fully replaced by Tauri v2.
src-tauri/target and gen ignored."
```

---

### Task C.14: First end-to-end Tauri dev test

- [ ] **Step 1: Run tauri:dev**

Run: `npm run tauri:dev`

Expected:
- Vite starts on :1420
- Rust backend compiles (~2-5 min first time)
- Tauri window opens — frameless, with custom TitleBar visible
- Mesh editor and ribbon all visible
- Console shows no errors

- [ ] **Step 2: Test window controls**

In the Tauri window:
- Click minimize button → window minimizes
- Click maximize → window fills screen
- Click maximize again → restores
- Drag the title bar → window moves
- Click close → app quits cleanly

- [ ] **Step 3: Test Backstage file IO**

- Click File tab in Ribbon → Backstage opens
- Click Open → native Windows file picker → cancel
- Click Save As → native save dialog → choose location → save → file written
- Verify file exists on disk: `ls path/to/saved/file.femp`
- Reopen via Open → mesh restores

- [ ] **Step 4: Test theme persistence via Tauri Store**

- Change theme to OpenAEC dark
- Close window (click X)
- Run `npm run tauri:dev` again
- Theme is OpenAEC dark on launch (persisted via Tauri Store)

- [ ] **Step 5: Stop, no commit (verification only)**

```bash
echo "Phase C dev test: PASS" > /tmp/phase-c-dev.log
```

---

### Task C.15: Production build verification

- [ ] **Step 1: Run tauri:build**

Run: `npm run tauri:build`

Expected:
- Vite builds frontend → `dist/`
- Rust release build (~5-10 min first time)
- Bundle creates `.msi` and `.exe` installers
- Output: `src-tauri/target/release/bundle/msi/Open FEM2D Studio_1.0.0_x64_en-US.msi`
- Output: `src-tauri/target/release/bundle/nsis/Open FEM2D Studio_1.0.0_x64-setup.exe`

- [ ] **Step 2: Install and run**

Either:
- Install on the dev machine (`Open FEM2D Studio_1.0.0_x64_en-US.msi` double-click)
- Or use Tauri's preview: `cd src-tauri && cargo run --release`

Verify:
- App launches from Start menu (after install)
- Frameless window with OpenAEC TitleBar
- File IO works
- Theme persists
- DevTools blocked (F12 does nothing in production build)

- [ ] **Step 3: Stop after testing**

```bash
echo "Phase C production build: PASS" > /tmp/phase-c-prod.log
```

---

### Task C.16: Final brand compliance check

- [ ] **Step 1: Run brand-compliance grep audit**

```bash
echo "=== 3BM check ===" && grep -rn "3BM\|Bouwtechniek" src/ public/ docs/ 2>/dev/null | grep -v PROMPT_HISTORY
echo "=== OpenAEC spelling check ===" && grep -rn "Open AEC\|OPENAEC\|OpenAec" src/ public/ docs/ 2>/dev/null | grep -v PROMPT_HISTORY
echo "=== Hardcoded blue accent leftovers ===" && grep -rn "#3b82f6" src/ 2>/dev/null
```

Expected: zero matches (or document any acceptable historical references)

- [ ] **Step 2: Verify all 4 phase verification logs exist**

```bash
ls /tmp/phase-*.log
```
Expected: 4 logs (a, b, d, c-dev, c-prod) — total 5

- [ ] **Step 3: Update memory with key project decisions**

Run the auto-memory pattern: save brand identity (full OpenAEC), tech stack (Tauri v2 with brand-locked theming), and design-token approach to memory file.

- [ ] **Step 4: Final commit + tag**

```bash
git tag -a v1.0.0-openaec -m "OpenAEC migration complete: Phase A+B+D+C done"
```

(No git push without user authorization.)

---

## Cross-Phase Notes

### Stop & resume between phases

After each phase's verification commit, you can stop. To resume:
1. Read this plan
2. Locate last completed task (last commit message)
3. Re-read the spec sections relevant to next task
4. Continue

### If a task fails repeatedly

- Read the spec section that motivated the task
- Check if the design assumption was wrong (file structure, API shape, etc.)
- If yes: update the spec doc + plan, re-commit, then continue
- Don't bypass — root-cause the issue

### Rollback per phase

Each phase's commits are sequential and self-contained. To roll back Phase C:
```bash
git log --oneline | head -20  # find first Phase C commit
git revert <first-phase-c>..HEAD
```
Phases A, B, D remain functional.

### Test-after-phase manual checklist (carry between phases)

For every phase completion: open all 15 existing dialogs (LoadCase, ProjectInfo, Grids, Materials, Calculation, Section Properties, Bar Properties, Plate, Edge Load, Line Load, Thermal Load, Load Generator, Load Combination, Concrete Reinforcement, Dimension Edit). Verify they open, escape closes, content is OpenAEC styled, no console errors.
