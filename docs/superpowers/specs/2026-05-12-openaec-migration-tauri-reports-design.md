# OpenAEC Migration — Design Tokens, Shell, Reports & Tauri v2

**Date**: 2026-05-12
**Status**: Approved (sections 1-5)
**Scope**: Major multi-phase refactor of Open-FEM2D-Studio
**Source-of-truth references**:
- [OpenAEC Style Book](https://github.com/OpenAEC-Foundation/OpenAEC-style-book)
- `brandbook/DESIGN-SYSTEM.md` v0.4 (March 2026)
- `migratie-instructies.md`
- `project-templates/Tauri+React/`

---

## 1. Goal

Transform Open-FEM2D-Studio from its current state (Electron + GitHub-dark palette + 3BM branding + Dutch teal/purple reports) into a fully OpenAEC-Foundation-compliant desktop application: Tauri v2 wrapper, OpenAEC design tokens, modernized A4 reports per OpenAEC §4.3 spec, and proper organizational identity.

## 2. End State

After this project completes:

- App named **"Open FEM2D Studio"**, positioned as part of the **OpenAEC Foundation** portfolio
- `package.json`: `name: "open-fem2d-studio"`, `author: "OpenAEC Foundation"`, license `CC-BY-SA-4.0`
- README header with OpenAEC logo + badges (license, contributions welcome, build status)
- Full OpenAEC visual design system, no GitHub-dark palette
- Tauri v2 desktop wrapper instead of Electron
- `3BM Bouwtechniek V.O.F.` removed everywhere → `OpenAEC Foundation`
- About-dialog: "Built on the OpenAEC platform" + link to github.com/OpenAEC-Foundation
- Reports follow OpenAEC §4.3 A4 spec (38mm header banner + footer + Space Grotesk + amber gradient strip)

### Tech-stack transitions

| Component | Before | After |
|-----------|--------|-------|
| Desktop wrapper | Electron 40 | **Tauri v2** |
| Build | electron-builder | **tauri-builder** |
| Persistence | localStorage | **Tauri Store plugin** + localStorage migration |
| Fonts | system fallback | **Space Grotesk + Inter + JetBrains Mono** (Google Fonts) |
| Design tokens | 20 GitHub-dark CSS vars | **~80 OpenAEC tokens** (themes.css, `data-theme=light\|openaec`) |
| Routing | single-view | unchanged |
| State | React Context (FEMContext) | unchanged |

## 3. Out of Scope (YAGNI)

- Tailwind migration (existing manual CSS-vars pattern works)
- i18next library swap (custom `useI18n` hook stays)
- Splitting i18n monolithic files into namespaces
- `pdfmake`/`pdf-lib` (browser-print stays)
- MeshEditor canvas-internal color refactor (~10k LOC) — only canvas chrome tokens get OpenAEC palette
- Python backend (`backend/`) unchanged
- Existing dialog components (LoadCaseDialog etc.) keep their own overlay implementation — only NEW components use the new Modal

## 4. Strategic Choices Locked-In

| Decision | Choice |
|----------|--------|
| Project structure | One spec, one big plan, sequential execution A → B → D → C |
| Branding scope | Full OpenAEC product adoption |
| App name | "Open FEM2D Studio" (OpenAEC Foundation = org) |
| Tauri migration | Hard cutover (Electron deleted in same PR) |
| Report tech | Restructure HTML output per §4.3, browser-print stays |
| Verification | Self-tested by Claude before PR |

## 5. Phase A — Design Tokens & Theming

### 5.1 Files

| Action | Path | Purpose |
|--------|------|---------|
| NEW | `src/styles/tokens.css` | OpenAEC raw tokens (colors, fonts, spacing, radius, shadows, gradient) |
| NEW | `src/styles/themes.css` | `:root` + `[data-theme="openaec"]` semantic theme vars + legacy aliases |
| NEW | `src/styles/canvas-tokens.css` | Canvas-specific tokens aligned with OpenAEC palette |
| REWRITE | `src/index.css` | Imports tokens.css + themes.css, base body, h1-h6 typography |
| MODIFY | `index.html` | Google Fonts link, title "Open FEM2D Studio" |

### 5.2 Token taxonomy

`tokens.css` defines raw tokens (immutable OpenAEC source):
```css
:root {
  --c-amber: #D97706;
  --c-deep-forge: #36363E;
  --c-signal-orange: #EA580C;
  --c-warm-gold: #F59E0B;
  --c-scaffold-gray: #A1A1AA;
  --c-blueprint-white: #FAFAF9;
  --c-concrete: #F5F5F4;
  --c-night-build: #2A2A32;
  --c-success: #16A34A;
  --c-error: #DC2626;
  --c-info: #2563EB;
  --c-border: #E7E5E4;
  --c-border-hover: #D6D3D1;

  --sp-1..--sp-24: 0.25rem..6rem;     /* 4px increments */
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;
  --shadow-sm/md/lg: per spec;

  --font-heading: "Space Grotesk", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  --grad-accent: linear-gradient(90deg, #D97706 0%, #F59E0B 40%, #EA580C 100%);
}
```

`themes.css` defines semantic theme tokens that reference raw tokens:
```css
:root, [data-theme="light"] {
  --theme-bg: var(--c-blueprint-white);
  --theme-bg-elevated: white;
  --theme-bg-subtle: var(--c-concrete);
  --theme-fg: var(--c-deep-forge);
  --theme-fg-muted: #57534E;
  --theme-fg-subtle: var(--c-scaffold-gray);
  --theme-accent: var(--c-amber);
  --theme-accent-hover: var(--c-signal-orange);
  --theme-border: var(--c-border);
  --theme-status-bg: var(--c-deep-forge);
  --theme-status-fg: var(--c-blueprint-white);
}
[data-theme="openaec"] {
  --theme-bg: var(--c-night-build);
  --theme-bg-elevated: var(--c-deep-forge);
  --theme-bg-subtle: #27272A;
  --theme-fg: var(--c-blueprint-white);
  --theme-fg-muted: var(--c-scaffold-gray);
  --theme-fg-subtle: #71717A;
  --theme-accent: var(--c-amber);
  --theme-accent-hover: var(--c-warm-gold);
  --theme-border: #27272A;
}
```

### 5.3 Backwards-compat shim (critical)

`themes.css` ALSO defines legacy aliases so the existing 42 component CSS files keep working without touching them:
```css
:root, [data-theme="light"], [data-theme="openaec"] {
  --accent: var(--theme-accent);
  --accent-hover: var(--theme-accent-hover);
  --accent-subtle: rgba(217, 119, 6, 0.15);
  --bg-primary: var(--theme-bg-elevated);
  --bg-secondary: var(--theme-bg-subtle);
  --bg-dark: var(--theme-bg);
  --text-primary: var(--theme-fg);
  --text-secondary: var(--theme-fg-muted);
  --text-muted: var(--theme-fg-subtle);
  --success: var(--c-success);
  --warning: var(--c-warm-gold);
  --danger: var(--c-error);
  --border: var(--theme-border);
  --border-light: var(--theme-border);
  --border-accent: rgba(217, 119, 6, 0.3);
}
```

→ All existing components automatically see OpenAEC colors after Phase A. Component-by-component cleanup of legacy aliases is deferred.

### 5.4 Canvas tokens

10k-LOC `MeshEditor.tsx` reads colors from CSS custom properties. New `canvas-tokens.css`:
```css
--canvas-bg: var(--theme-bg);
--canvas-grid: rgba(161, 161, 170, 0.15);
--canvas-axis: var(--c-scaffold-gray);
--canvas-baseline: #71717A;
--canvas-dim-color: var(--theme-fg-muted);
--canvas-label-bg: var(--theme-bg-subtle);
--canvas-beam: var(--c-amber);
--canvas-plate: var(--c-warm-gold);
--canvas-load: var(--c-signal-orange);
--canvas-reaction: var(--c-info);
```

No logic changes in `MeshEditor.tsx` — only CSS values.

### 5.5 Theme switcher

Existing pattern in [src/components/Ribbon/Ribbon.tsx](src/components/Ribbon/Ribbon.tsx) uses `document.documentElement.dataset.theme`. Rename `'dark'` → `'openaec'`. Migration: on first load, if value is `'dark'`, map to `'openaec'`. localStorage key `fem2d-theme` unchanged. Toggle label changes to "Light / OpenAEC".

### 5.6 Fonts

In `index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<title>Open FEM2D Studio</title>
```

### 5.7 3BM removal

Single edit in `src/core/report/ReportConfig.ts:89`:
```diff
- companyName: '3BM Bouwtechniek V.O.F.',
+ companyName: 'OpenAEC Foundation',
```

Plus `package.json` author/copyright + README.

### 5.8 Phase A verification

1. `npx tsc --noEmit` → PASS
2. App opens, theme toggle switches light ↔ openaec
3. Visual smoke test: open 5+ dialogs, confirm amber accents (not blue)
4. Open existing saved `.json` project → mesh editor renders
5. No console warnings about missing fonts

## 6. Phase B — Shell Components

### 6.1 New components

| Component | Path | Specs |
|-----------|------|-------|
| Modal | `src/components/Modal/Modal.tsx` + `.css` | Generic overlay (z:10000), backdrop click-to-close (optional), Escape close, focus trap, sizes sm/md/lg (400/560/720px) |
| Backstage | `src/components/Backstage/Backstage.tsx` + `.css` | Fullscreen overlay (z:1000), 260px sidebar + content, items: New/Open/Save/Save As/Preferences/About/Exit, Esc closes, slide-in 200ms |
| SettingsDialog | `src/components/SettingsDialog/SettingsDialog.tsx` + `.css` | Modal (md), tabs: Appearance (theme), Language (6 locales), About info |
| AboutDialog | `src/components/AboutDialog/AboutDialog.tsx` + `.css` | Modal (sm), OpenAEC logo + version + "Built on the OpenAEC platform" + GitHub link + license |
| TitleBar | `src/components/TitleBar/TitleBar.tsx` + `.css` | Promoted from inline `.title-bar` div in [src/App.tsx:242](src/App.tsx:242), adds quick-access Save/Undo/Redo + theme toggle. Window controls deferred to Phase C. |

### 6.2 Component modifications

#### Ribbon — `src/components/Ribbon/Ribbon.tsx` + `.css`
- Height 130px → **122px** (28 tabs + 94 content)
- File tab: amber bg (`var(--theme-accent)`), white text, opens Backstage instead of showing tab content
- Tabs row: amber gradient strip (`var(--grad-accent)`) as 3px bottom-border
- **Animated tab indicator**: 2px amber bar under active tab, slides via `transform: translateX()` on active change (300ms cubic-bezier), `useLayoutEffect` hook
- Theme toggle + language switcher stay in ribbon (quick-access), also exist in SettingsDialog

#### StatusBar — `src/components/StatusBar/StatusBar.tsx` + `.css`
- Height 32px → **22px** (per OpenAEC spec)
- Font: 12px JetBrains Mono (already)
- Background: `var(--theme-status-bg)` (deep-forge)
- Items unchanged, only padding/font-size adjustments
- If 22px proves too cramped → document deviation, keep at 28px

#### FileTabs — `src/components/FileTabs/FileTabs.tsx` + `.css`
- Tab-active indicator: blue → amber via theme tokens (automatic via shim, made explicit)
- No structural changes

### 6.3 Backstage menu wiring

| Item | Handler | Existing function |
|------|---------|-------------------|
| New | `dispatch({ type: 'RESET_PROJECT' })` | Reuse Ribbon's "New" handler |
| Open | File picker (Electron dialog now → Tauri in Phase C) | Existing |
| Save | Trigger snapshot + download blob | Existing |
| Save As | Same with file dialog | Existing |
| Preferences | `setShowSettings(true)` | NEW |
| About | `setShowAbout(true)` | NEW |
| Exit | `window.close()` (Electron) → `tauri.window.close()` (Phase C) | Trivial |

### 6.4 State changes in App.tsx

```tsx
const [showBackstage, setShowBackstage] = useState(false);
const [showSettings, setShowSettings] = useState(false);
const [showAbout, setShowAbout] = useState(false);
```

Existing escape-handler in [src/App.tsx:198-220](src/App.tsx:198) gets extra cases for backstage/settings/about.

### 6.5 i18n additions

Per locale ([src/i18n/en.ts](src/i18n/en.ts), nl.ts, es.ts, fr.ts, it.ts, zh.ts) add:
```ts
backstage: { new, open, save, saveAs, preferences, about, exit },
settings: { appearance, language, theme: { light, openaec }, languageLabel },
about: { title, builtOn, license, github, version }
```

NL+EN translated by Claude with care; ES/FR/IT/ZH best-effort from context, user can correct.

### 6.6 Phase B verification

1. `npx tsc --noEmit` → PASS
2. Backstage: click File tab → overlay opens, Esc closes, all 7 items work
3. SettingsDialog: opens via Backstage > Preferences. Theme + language switches work.
4. AboutDialog: shows correct version + OpenAEC info
5. Modal: focus trap (Tab cycles), Escape closes, click-outside closes
6. Ribbon: animated indicator slides smoothly, File tab amber, height 122px
7. StatusBar: 22px height, all info still readable
8. TitleBar: quick-access Save/Undo/Redo work (Ctrl+S = save, Ctrl+Z = undo)
9. All 3 existing `test-*.mjs` UI tests stay green
10. Visual regression: open every existing dialog (15+) → all OpenAEC-compliant

## 7. Phase D — Report Modernization

### 7.1 Files

#### NEW
| Path | Content |
|------|---------|
| `public/openaec-assets/logo/openaec-logo-amber-on-dark.svg` | Main logo (TitleBar/About/Reports) |
| `public/openaec-assets/logo/openaec-symbol-amber-on-dark.svg` | Symbol-only |
| `public/openaec-assets/illustrations/report-header-dark.svg` | 520×200px header illustration (35% opacity) |
| `public/openaec-assets/icons/footer-icons.svg` | building, code, BIM cube, git-branch (24×24, stroke #A1A1AA) |
| `src/core/report/ReportTheme.ts` | Theme constants (hex values for static HTML — can't use CSS vars in print HTML strings) |
| `src/core/report/ReportHeader.ts` | Reusable header banner generator |
| `src/core/report/ReportFooter.ts` | Reusable footer generator |

#### MODIFY
| Path | What |
|------|------|
| `src/core/report/ReportConfig.ts` | `primaryColor: '#D97706'`, `accentColor: '#F59E0B'`, `companyName: 'OpenAEC Foundation'`. Add `documentTitle: string` (rendered in header banner subtitle, default `'Constructieadvies & berekeningen'`) and `tagline: string` (rendered under logo in header banner, default `'Build free. Build together.'`) — both user-editable via ReportSettingsDialog |
| `src/core/report/ReportGenerator.ts` | Full rewrite per §4.3: per-page header/footer, Space Grotesk titles, Inter body justify+hyphens, A4 page-break logic |
| `src/components/ReportPanel/sections/*.tsx` (12 files) | Visual restyle: Space Grotesk titles, amber accents, OpenAEC card styling, pill badges |
| `src/components/ReportPanel/ReportPanel.css` + `ReportPreview.tsx` | Print stylesheet update: `@media print` injects A4 styling |
| `src/components/ReportPanel/ReportSettingsDialog.tsx` | Default colors = amber/gold |

#### DELETE (after audit)
| Path | Reason |
|------|--------|
| `src/core/report/LegacyReportGenerator.ts` | If no callers remain. Else: deprecate with note, migrate callers |

### 7.2 A4 layout per OpenAEC §4.3

```
┌─────────────────────────────────────────────────────┐
│  [LOGO]                  Project: PRJ-2026-001     │  HEADER 38mm
│  Build free.             Engineer: ...             │  bg: #36363E
│  Build together.         Date: 12 mei 2026         │  illustration 35%
├═══════════════════════════════════════════════════  ┤  4px amber gradient
│                                                     │
│  Constructieadvies & berekeningen                   │  CONTENT
│  Inter 0.9rem justify+hyphens line-height 1.7       │  10mm 12mm 30mm padding
│                                                     │
│  3.1 Section Heading (Space Grotesk 1.1rem)         │
│                                                     │
├═══════════════════════════════════════════════════  ┤  3px amber gradient
│  [OpenAEC] [⌂][</>][BIM][⎇]    Document │ p. 5     │  FOOTER 15mm
│                                                     │  bg: #36363E
└─────────────────────────────────────────────────────┘
```

### 7.3 Implementation pattern

**Header/footer per page (browser print)**:
- `position: fixed; top: 0` for header, `bottom: 0` for footer in `@media print`
- `body { padding: 50mm 0 25mm 0 }` so content doesn't underlap
- Each `.report-page` div: `page-break-after: always` and `min-height: calc(297mm - 53mm - 25mm)`
- Tested target: Chromium (Electron + Tauri WebView2)

**Inline SVG**: assets pasted inline as string constants in `ReportTheme.ts` (not `<img>`) so no extra fetch on print.

**Font embedding**: Google Fonts `<link>` in HTML output. Requires internet at print time (acceptable). Offline embedding deferred to follow-up.

### 7.4 Section components restyle

Each of 12 [src/components/ReportPanel/sections/](src/components/ReportPanel/sections/):
- Title: `<h2>` Space Grotesk 700, `var(--c-deep-forge)`, 1.5rem, sentence case
- Subtitle: `<h3>` Space Grotesk 500, 1.125rem
- Tables: OpenAEC table-style (amber-tinted header, 12px 16px cells, hover #FAFAF9)
- Cards: 1px #E7E5E4 border, 12px radius, 24px padding
- Section number badge (`§3.1`): JetBrains Mono 0.75rem uppercase amber
- Diagrams: existing render unchanged, color tweaks only

No logic changes — JSX + CSS only.

### 7.5 i18n in reports

~30 hardcoded NL strings in [src/core/report/ReportGenerator.ts](src/core/report/ReportGenerator.ts) replaced by `t('report.coverTitle')` etc. ~30 keys × 6 locales = ~180 translations. Default locale = browser locale, fallback EN.

### 7.6 Phase D verification

1. `npx tsc --noEmit` → PASS
2. Live preview: all 12 sections render with OpenAEC styling
3. HTML export: print → A4 layout, OpenAEC header/footer on every page
4. Header banner: logo left, metadata right, gradient strip, illustration 35%
5. Footer: brand left, 4 SVG icons center, page number JetBrains Mono amber right
6. Cross-page (≥3 pages): header/footer repeat, no broken layout
7. Both themes: report preview looks correct in light + openaec
8. i18n: switch to EN → titles in EN
9. Existing project compatibility intact

## 8. Phase C — Tauri v2 Migration

### 8.1 Pre-requisites

User installs **Rust toolchain** (rustup-init.exe). Document in README. Tauri v2 requires Rust ≥1.77 + WebView2 (default Win11).

### 8.2 Files

#### NEW
| Path | Purpose |
|------|---------|
| `src-tauri/Cargo.toml` | Rust deps: tauri v2, tauri-plugin-store, tauri-plugin-dialog, tauri-plugin-fs |
| `src-tauri/tauri.conf.json` | App config |
| `src-tauri/src/main.rs` | Rust entry: builder + plugins |
| `src-tauri/build.rs` | Standard tauri-build |
| `src-tauri/icons/` | App icons (32, 128, 128@2x, .icns, .ico) from OpenAEC symbol |
| `src-tauri/.gitignore` | `/target`, `/gen` |
| `src/lib/windowApi.ts` | `windowApi.minimize/.maximize/.close/.toggleFullscreen` |
| `src/lib/storeApi.ts` | `store.get/.set/.save` (Tauri Store) with localStorage fallback |
| `src/lib/fileApi.ts` | `openFile/.saveFile/.saveFileAs` (Tauri dialog + fs) |
| `src/lib/migrateLocalStorage.ts` | One-shot migration from localStorage to Tauri Store |

#### MODIFY
| Path | What |
|------|------|
| `package.json` | Remove electron, electron-builder. Add @tauri-apps/api, @tauri-apps/cli, @tauri-apps/plugin-store, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs. Scripts: tauri:dev, tauri:build. Remove electron:* scripts. Drop `main: "electron/main.cjs"` |
| `vite.config.ts` | Tauri requirements: `clearScreen: false`, `server.port: 1420`, `server.strictPort: true`, `envPrefix: ['VITE_', 'TAURI_']` |
| `src/components/TitleBar/TitleBar.tsx` | Add window controls (min/max/close), wire to `windowApi`, `data-tauri-drag-region` |
| `src/components/TitleBar/TitleBar.css` | Force 32px height per spec |
| `src/components/Backstage/Backstage.tsx` | Open/Save/SaveAs/Exit handlers via `fileApi` and `windowApi` |
| `.gitignore` | `/src-tauri/target` |
| `README.md` | Tauri build instructions, Rust prereq, distributable paths |

#### DELETE
| Path | Reason |
|------|--------|
| `electron/main.cjs` | Replaced by Tauri |
| `electron/` | Whole folder removed |

### 8.3 tauri.conf.json (key parts)

```json
{
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
    "windows": [{
      "title": "Open FEM2D Studio",
      "width": 1400, "height": 900,
      "minWidth": 1024, "minHeight": 600,
      "decorations": false,
      "resizable": true
    }],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://nominatim.openstreetmap.org http://localhost:*"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "publisher": "OpenAEC Foundation",
    "copyright": "© 2026 OpenAEC Foundation. CC BY-SA 4.0",
    "category": "Productivity"
  },
  "plugins": {
    "store": {},
    "dialog": {},
    "fs": { "scope": ["$DOCUMENT/*", "$DESKTOP/*", "$DOWNLOAD/*"] }
  }
}
```

### 8.4 main.rs

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

No custom Rust commands — all file/window operations via plugin JS APIs from React.

### 8.5 API abstractions

**windowApi**:
```ts
import { getCurrentWindow } from '@tauri-apps/api/window';
export const windowApi = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
};
```

**storeApi**:
```ts
import { Store } from '@tauri-apps/plugin-store';
const store = await Store.load('settings.json');
export const storeApi = {
  async get<T>(key: string): Promise<T | null> { return await store.get<T>(key); },
  async set<T>(key: string, val: T) { await store.set(key, val); await store.save(); },
};
```

**fileApi**:
```ts
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
export const fileApi = {
  async openFile() {
    const path = await openDialog({ filters: [{ name: 'FEM Project', extensions: ['femp', 'json'] }] });
    if (!path) return null;
    return { path: path as string, content: await readTextFile(path as string) };
  },
  async saveFile(content: string, path: string) { await writeTextFile(path, content); },
  async saveFileAs(content: string) {
    const path = await saveDialog({ filters: [{ name: 'FEM Project', extensions: ['femp'] }] });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  },
};
```

### 8.6 TitleBar window controls

```tsx
<div className="title-bar" data-tauri-drag-region>
  <div className="title-bar-left" data-tauri-drag-region>
    <OpenAECSymbol size={14} />
    <span>Open FEM2D Studio</span>
    <QuickAccess /> {/* Save/Undo/Redo */}
  </div>
  <div className="title-bar-center" data-tauri-drag-region>{projectName}</div>
  <div className="title-bar-right">
    <ThemeToggle />
    <button onClick={windowApi.minimize}><MinusIcon /></button>
    <button onClick={windowApi.toggleMaximize}><SquareIcon /></button>
    <button onClick={windowApi.close} className="close-btn"><XIcon /></button>
  </div>
</div>
```

Window controls 46×32px each (Windows-style). Close hover bg = `#DC2626`.

### 8.7 Build pipeline

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server :1420 (frontend only) |
| `npm run tauri:dev` | Vite + Rust backend, opens Tauri window — primary dev workflow |
| `npm run build` | Vite build → `dist/` |
| `npm run tauri:build` | Vite build → Rust build → bundle .msi/.nsis |
| `npm run preview` | Vite preview (browser) |

Artifacts in `src-tauri/target/release/bundle/`:
- `msi/Open FEM2D Studio_1.0.0_x64_en-US.msi`
- `nsis/Open FEM2D Studio_1.0.0_x64-setup.exe`

### 8.8 Phase C verification

1. `cd src-tauri && cargo check` → PASS
2. `npm run tauri:dev`:
   - Window opens frameless (no Windows native bar)
   - Custom TitleBar with OpenAEC symbol, quick-access, window controls visible
   - Drag works through TitleBar
   - Min/Max/Close work
   - Theme toggle works
3. File IO:
   - Open via Backstage → native Windows file picker → loads project
   - Save → writes to disk (no download dialog)
   - Save As → file picker → writes
4. Persistence:
   - Change theme to openaec, close app
   - Reopen → theme remembered via Tauri Store
   - Existing localStorage settings auto-migrated
5. Production build: `npm run tauri:build` produces .msi + setup.exe
6. Distributable test: install .msi on clean Windows VM → app starts, all features work
7. DevTools blocking in production
8. CSP: no console errors for Leaflet tiles, Google Fonts, ERPNext API, Nominatim
9. Existing 3 .mjs UI tests stay green
10. End-user scenario: new project → mesh → solver → result → report export → save → quit → restart → open → result intact

## 9. Cross-Cutting Concerns

### 9.1 Testing strategy

- **Per-phase**: each phase has its own verification block above (run before declaring complete)
- **Integration test after each phase**: full end-to-end: new project → mesh → load case → solve → result → report
- **Visual regression**: screenshot every dialog after each phase, compare to OpenAEC palette expectations
- **TypeScript**: `npx tsc --noEmit` after every phase, must PASS
- **No new automated test suite** added in this project — existing 3 `test-*.mjs` UI tests must stay green

### 9.2 Sequencing & dependencies

```
Phase A (Design tokens)
  ↓ (everything depends on A)
Phase B (Shell components) ─────┐
  ↓                             │
Phase D (Report modernization)  │
  ↓                             │
Phase C (Tauri migration) ──────┘  (uses TitleBar from B, fileApi/windowApi NEW)
```

User chose strict sequential execution: A → B → D → C. No parallelism.

### 9.3 Rollback strategy

Each phase = own git branch off the previous phase's merge commit. If a phase breaks beyond repair:
- Revert phase merge commit
- Previous phase remains shippable
- Phases A and D are most "rollback-safe" (CSS + report-isolated)
- Phase C (Tauri) is highest risk — keep `electron/` folder + `electron:*` scripts in git history accessible for emergency recovery (delete only after Phase C confirmed stable)

### 9.4 Cross-cutting risks

| Risk | Mitigation |
|------|------------|
| Breaking change in MeshEditor canvas (10k LOC) | Phase A keeps backwards-compat shim; canvas tokens extend, don't replace |
| 6 i18n locales × growing key count → translation drift | NL+EN authoritative, others best-effort with explicit "review needed" comment |
| Tauri WebView2 rendering glitch on user's specific Win10/11 build | Test on Win10 + Win11 dev machines before marking Phase C done |
| Browser-print breaks header/footer over pages | Verified target = Chromium only; test 5+ page report |
| `LegacyReportGenerator.ts` deletion breaks unknown caller | Grep audit before delete; if found, deprecate first |
| Rust toolchain install blocks contributors | Document in README; consider tauri-action GitHub Action for CI builds |
| Bundle size MSI ~10-20MB vs Electron ~150MB | Benefit, not risk |
| CSP blocks ERPNext/OSM/fonts | Whitelisted in tauri.conf.json security; test specifically |

### 9.5 Brand compliance final check (Phase C completion gate)

Before marking project done, verify ALL items from OpenAEC `migratie-instructies.md` Phase 9 validation checklist:
- "OpenAEC" spelled correctly everywhere (one word, capital O, AEC caps)
- Zero 3BM references in shipped code
- Amber NEVER as background fill — only accent
- Text on dark = blueprint-white or warm-gold; on light = deep-forge
- WCAG AA contrast (4.5:1 minimum)
- Space Grotesk + Inter + JetBrains Mono loaded
- Amber gradient strip on header/footer
- Cards: white, 1px #E7E5E4 border, 12px radius
- Buttons: 8px radius, 600 weight, 0.15s transition
- Inputs: 1.5px border, amber focus ring
- Badges: 9999px pill, uppercase, semantic colors
- No hardcoded color literals — everything via design tokens (best-effort; legacy aliases acceptable transitional)

## 10. Definition of Done

Project complete when:
1. All 4 phases verified per their respective verification blocks
2. `npx tsc --noEmit` PASS on final commit
3. `npm run tauri:dev` opens working frameless app with OpenAEC branding
4. `npm run tauri:build` produces installable .msi
5. Existing user can open a `.json` project saved before this refactor and use all features
6. README updated with OpenAEC branding + Tauri build instructions + Rust prereq
7. Brand compliance checklist (§9.5) all green
8. Auto-memory updated with key decisions for future sessions

---

*This spec is the single source of truth for the OpenAEC migration. Any deviation during implementation requires updating this doc.*
