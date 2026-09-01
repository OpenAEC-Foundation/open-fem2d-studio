# EN 1993-1-1 Steel Check — Rust Crate Engine

**Date**: 2026-05-13
**Status**: Approved (sections 1-7)
**Scope**: Reproduce steel checks matching the reference calculation's style (NEN-EN 1993-1-1+C2+A1/NB:2016 nl) in a 8-crate Rust workspace, exposed via Tauri commands to the React UI, with OpenAEC §4.3 reporting.
**Source-of-truth references**:
- `verificatie calculations/original/Calc 2.pdf` — reference calculation output, 3 beams (HEB160, HEB160, HFRHS200×200×16, S 235), 59 pages, full art. 6.2 + 6.3 + LTB-NB derivation
- `verificatie calculations/original/portal-frame.pdf` — reference calculation output, 4 beams (UNP350, HEB160×2, HEB300, S 235)
- `verificatie calculations/Steel Properties.png` — Beam Properties dialog from the reference, with EN 1993-1-1 tab

---

## 1. Goal & Acceptance Criteria

Build a complete, **systematically-applicable** EN 1993-1-1 steel check engine that reproduces — to 3 decimal places — every Unity Check value in the two reference calculations, presented in OpenAEC-styled reports with full step-by-step derivation matching the reference layout (option (a) from brainstorming).

The original normtoetsing functionality was stripped in commit `87377a6` (Feb 2026). Old code recoverable from `87377a6^:src/core/standards/{EurocodeNL,SteelCheck,SteelConnection,ConcreteCheck}.ts` (~1957 deleted lines) — used as design reference but the new implementation lives in **Rust crates**, not TypeScript, for reusability + performance + Tauri-native architecture.

### Success criteria (HARD)

- All 7 reference beams (3 from Calc 2, 4 from portal-frame) reproduce in automated Rust tests with `assert_relative_eq!` matching the reference numbers to within 0.1% on resistances and 1% on UCs.
- Status verdicts (OK/NotOk) match the reference exactly.
- Generated report (PDF via browser print or HTML via tauri:build) contains step-by-step derivation per beam, OpenAEC §4.3 styled (header banner + footer + Space Grotesk titles).
- New checks (additional EN articles, alternative materials) can be added without touching unrelated crates — proven by the 8-crate dependency DAG.

## 2. Out of Scope (YAGNI v1)

- CHS (circular hollow sections) — extended in v2
- Built-up sections (welded/riveted composites) — v2
- Joint design (CHAPTER 8 / EN 1993-1-8) — separate subsystem
- Fatigue (EN 1993-1-9), plate buckling (EN 1993-1-5), fire (EN 1993-1-2) — separate trajectories
- Concrete, timber, aluminium — separate crates for later
- Profile optimizer — v2 feature
- WASM browser fallback (Tauri-only desktop)

## 3. Tech-stack Decisions Locked-In

| Item | Choice |
|------|--------|
| Backend | 8 Rust crates in `src-tauri/crates/`, workspace setup |
| Bridge | Tauri commands with serde-json over IPC |
| Type sharing | `ts-rs` crate auto-generates `.d.ts` from Rust types |
| Frontend | Existing React 18 + TS + Vite + OpenAEC tokens |
| Crate-type | `["lib"]` only (per Phase C lesson — no cdylib on Windows GNU) |
| Profile DB | Single source of truth: `crates/steel-profiles/data/profiles.json`, included via `include_str!` in Rust + Vite alias `@profiles` in TS |
| Math rendering | KaTeX (npm `katex` ^0.16) |
| Trigger | Auto-run after solver completes (toggleable) + manual Ribbon button |
| Coverage tool | `cargo tarpaulin` |
| Snapshot tool | `insta` for `BeamCheckResult` golden files |

## 4. Crate Architecture

### 4.1 Dep DAG

```
mechanics ─┬── section-properties ─┬── steel-profiles
           │                       └── nen-en-1993-1-1-section ─┬── stability
           │                       │                            ├── ltb
nen-en-1990 ──────────────────────┘                            └── steel-check ◄── Tauri main
                                                                     ▲
                                          steel-profiles ────────────┘
```

### 4.2 Crate responsibilities

#### `mechanics` (foundation, no deps)
```rust
pub struct InternalForces { n_ed: f64, vy_ed: f64, vz_ed: f64, mt_ed: f64, my_ed: f64, mz_ed: f64 }  // kN, kNm
pub struct BeamAxis { length: f64, orientation_rad: f64 }
pub struct ForceEnvelope { /* min/max per location per combination */ }
```

#### `section-properties` (deps: mechanics)
```rust
pub struct SectionProperties {
    area: f64,            // mm²
    iy: f64, iz: f64,     // mm⁴
    wel_y: f64, wel_z: f64, wpl_y: f64, wpl_z: f64,  // mm³
    av_y: f64, av_z: f64,
    it: f64, iw: f64,
    h: f64, b: f64, tw: f64, tf: f64, r: f64,
}
pub fn i_section_props(h, b, tw, tf, r) -> SectionProperties;
pub fn rhs_section_props(h, b, t, r) -> SectionProperties;
pub fn channel_section_props(h, b, tw, tf, r) -> SectionProperties;
```

#### `steel-profiles` (deps: section-properties)
```rust
const PROFILES_JSON: &str = include_str!("../data/profiles.json");
pub enum ProfileKind { ISection, Channel, RHS, SHS, CHS }
pub struct SteelProfile { name, kind, geometry, properties, buckling_curves }
pub fn db() -> &'static SteelProfileDb;
```
JSON loaded once via OnceLock singleton. `build.rs` validates JSON parses at compile-time.

#### `nen-en-1990` (foundation)
```rust
pub struct LoadFactors { gamma_g, gamma_q, psi0 }
pub const ULS_6_10A, ULS_6_10B, EQU;
pub struct PsiFactors { category, psi0, psi1, psi2 }
pub const PSI_CATEGORY_A..H, WIND, SNOW;
pub struct ConsequenceClass { name, k_fi }
pub const CC1, CC2, CC3;
```

#### `nen-en-1993-1-1-section` (deps: mechanics, section-properties, nen-en-1990)
```rust
pub enum CrossSectionClass { Class1, Class2, Class3, Class4 }
pub fn classify_section(props, grade, force_state) -> CrossSectionClass;
// Articles 6.2.4 / 6.2.5 / 6.2.6 / 6.2.8 / 6.2.9 / 6.2.10
pub fn n_c_rd(...) -> ResistanceCalc;
pub fn m_y_c_rd(...) -> ResistanceCalc;
pub fn v_z_c_rd(...) -> ResistanceCalc;
pub fn check_combined_mv(...) -> ResistanceCalc;
pub fn check_combined_mn(...) -> ResistanceCalc;
pub fn check_combined_mnv(...) -> ResistanceCalc;
```

#### `nen-en-1993-1-1-stability` (deps: section)
```rust
pub enum BucklingCurve { A0, A, B, C, D }
pub fn buckling_curve_from_profile(...) -> BucklingCurve;
pub fn alpha_imperfection(curve) -> f64;
pub fn n_b_rd(...) -> StabilityCalc;          // 6.3.1
pub fn check_combined_n_my(...) -> StabilityCalc;  // 6.3.3 eq. 6.61
pub fn check_combined_n_mz(...) -> StabilityCalc;  // 6.3.3 eq. 6.62
pub fn interaction_factors_method_2(...) -> InteractionFactors;  // Annex B
```

#### `nen-en-1993-1-1-ltb` (deps: mechanics, section-properties)
```rust
pub struct LateralBracing {
    top_flange_positions: Vec<f64>,    // 0..1 fractions of length
    bottom_flange_positions: Vec<f64>,
}
pub fn m_cr_nb_annex(...) -> McrCalc;          // NB.148 / NB.153 / NB.157 / NB.159
pub fn lambda_lt(...) -> f64;
pub fn chi_lt(...) -> f64;
pub fn m_b_rd(...) -> StabilityCalc;           // 6.3.2
```

NB-annex sub-items in `src/nb_annex.rs`:
- NB.148: `m_cr_i_section(props, length, restraints, c1, c2)`
- NB.153: `c1_c2_factors(force_diagram, beta_ratio, load_application_z)`
- NB.157: `s_parameter(h, e, iz, g, it)`
- NB.159: `c_coefficient(c1, lg, lkip, s, c2)`
- `k_red(h, tw)` for slender webs (h/tw > 75)

#### `steel-check` (orchestrator, deps: ALL)
```rust
pub struct BeamCheckInput {
    beam_id: u32,
    profile_name: String, steel_grade: String,
    length: f64,
    forces_envelope: Vec<(f64 /*x*/, InternalForces)>,
    lateral_bracing: LateralBracing,
    buckling_length_y: f64, buckling_length_z: f64,
    deflection_limit_class: DeflectionClass,
    deflection_actual_max: f64,
    is_cantilever: bool,
    consequence_class: ConsequenceClass,
}
pub struct BeamCheckResult {
    beam_id: u32,
    classification: CrossSectionClass,
    checks: Vec<NamedCheck>,
    uc_max: f64,
    status: CheckStatus,
    governing_check_id: String,
}
pub fn check_beam(input: BeamCheckInput) -> BeamCheckResult;
pub fn check_all_beams(inputs: Vec<BeamCheckInput>) -> Vec<BeamCheckResult>;
```

### 4.3 Workspace Cargo.toml setup

`src-tauri/Cargo.toml` becomes workspace root:
```toml
[package]
name = "open-fem2d-studio"
... (existing main package)

[workspace]
resolver = "2"
members = [".", "crates/*"]

[lib]
crate-type = ["lib"]

[dependencies]
... (existing tauri/plugins)
steel-check = { path = "crates/steel-check" }
mechanics = { path = "crates/mechanics" }
ts-rs = "10"
```

Each sub-crate Cargo.toml:
```toml
[package]
name = "mechanics"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["lib"]

[dependencies]
serde = { version = "1", features = ["derive"] }
ts-rs = "10"
```

## 5. Tauri Command Interface + TS↔Rust Data Flow

### 5.1 Commands
```rust
#[tauri::command]
async fn list_steel_profiles() -> Vec<SteelProfileSummary>;

#[tauri::command]
async fn list_steel_grades() -> Vec<SteelGrade>;

#[tauri::command]
async fn check_steel_beams(inputs: Vec<BeamCheckInput>) -> Result<Vec<BeamCheckResult>, String>;
```

One batch command for all beams: minimal IPC overhead, future Rust parallelization with `rayon`, UI typically wants all beams together (report section).

### 5.2 Type generation via `ts-rs`

```rust
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct BeamCheckInput { ... }
```

Generated TS interfaces appear in `src/lib/types/steel/*.ts` after `cargo test --features ts-export`. Single source of truth in Rust.

### 5.3 TS state additions (FEMContext)

```ts
interface IBeamSteelConfig {
  beamId: number;
  profileName: string; steelGrade: string;
  lateralBracing: {
    topFlangePositions: number[];
    bottomFlangePositions: number[];
  };
  bucklingLengthY: number; bucklingLengthZ: number;
  deflectionClass: 'floor' | 'roof' | 'cantilever' | 'custom';
  deflectionLimitNumerator: number;
  isCantilever: boolean;
}

interface FEMState {
  // ...existing
  beamSteelConfigs: Map<number, IBeamSteelConfig>;
  steelCheckResults: BeamCheckResult[] | null;
  steelCheckAutoRun: boolean;
}
```

Reducer actions: `SET_BEAM_STEEL_CONFIG`, `SET_STEEL_CHECK_RESULTS`, `CLEAR_STEEL_CHECK_RESULTS`, `SET_STEEL_CHECK_AUTO_RUN`.

`ProjectSerializer` extends version to `'1.1.0'` adding `beamSteelConfigs` field; v1.0.0 files load with default configs.

### 5.4 Auto-run trigger flow

In `App.tsx` after solver-completion:
```ts
const handleSolveComplete = useCallback(async (result) => {
  dispatch({ type: 'SET_RESULT', payload: result });
  if (state.steelCheckAutoRun) {
    const inputs = buildSteelCheckInputs(state.mesh, state.beamSteelConfigs, result);
    if (inputs.length > 0) {
      try {
        const checkResults = await invoke<BeamCheckResult[]>('check_steel_beams', { inputs });
        dispatch({ type: 'SET_STEEL_CHECK_RESULTS', payload: checkResults });
      } catch (err) {
        dispatch({ type: 'SET_STEEL_CHECK_ERROR', payload: String(err) });
      }
    }
  }
}, [state.mesh, state.beamSteelConfigs, state.steelCheckAutoRun]);
```

### 5.5 `buildSteelCheckInputs` helper

`src/lib/steelCheckBuilder.ts` — pure function that:
- Filters mesh.beamElements for steel beams
- Resolves per-beam config (from state, with defaults)
- Extracts force envelope from solver result
- Returns `BeamCheckInput[]` ready for the Tauri command

### 5.6 Error handling

- Rust returns `Result<T, String>` with user-readable Dutch error messages
- TS try/catch → toast + graceful empty results
- Profile not found → "Profiel HEB123 onbekend in steel-profiles database"
- Numerical errors guarded in Rust (NaN, division by zero)
- Solver result missing → button disabled, tooltip "Run solver first"

## 6. Frontend Integration

### 6.1 Check ribbon-tab (new)

Position: between IFC and Report tabs.
Three RibbonGroups:
- **Run check**: large "▶ Run all checks" button (icon ShieldCheck), disabled when `state.result === null`
- **View**: toggle SteelCheckPanel visible/hidden (icon Sidebar)
- **Settings**: checkbox "Auto-run after solve" bound to `state.steelCheckAutoRun`

### 6.2 EN 1993 tab in BarPropertiesDialog

`BarPropertiesDialog` becomes tabbed (`General` + `EN 1993`). EN 1993 tab content modeled after Steel Properties.png:
- Steel grade dropdown
- Cantilever checkbox
- Consequence class dropdown (override projectInfo)
- Lateral-torsional buckling section (top/bottom flange — Number / Distances / Node Numbers radio)
- Buckling section (length Y-axis / Z-axis)
- Deflection section (Type, Additional, Final, Pre-camber)
- "Input per beam" bulk-apply checkbox

OpenAEC styling: amber accent on checkboxes/radios, Inter 500 labels, `1px solid var(--theme-border)` dividers, Space Grotesk 500 section headings + amber section-number badges.

### 6.3 SteelCheckPanel (new sidebar component)

Path: `src/components/SteelCheckPanel/SteelCheckPanel.tsx + .css`. Compact card-list:
- Per beam: profile + grade + UC (large JetBrains Mono, color per status) + governing check label
- Click card → highlight beam in MeshEditor + scroll ReportPanel to relevant detail
- Status colors: OK = success-green, NotOk = error-red
- Empty state with prompt to solve first

### 6.4 Report sections (new)

Two new entries in `ReportSectionType`:
- `'en1993_summary'` → table with Beam | Profile | Grade | UC_max | Governing | Status
- `'en1993_calculations'` → per-beam page with full reference-style derivation

Per-beam render iterates `BeamCheckResult.checks[]` with reusable `<CheckBlock>` component:
```tsx
<CheckBlock
  title={check.title}
  article={check.article}        // "art. 6.2.4 (6.10)"
  forceState={check.force_state}
  formula={check.formula_latex}  // KaTeX rendered
  variables={check.variables}
  value={check.value}
  uc={check.uc}
  status={check.status}
/>
```

### 6.5 SettingsDialog extension

New "Checks" tab/section with auto-run toggle bound to `steelCheckAutoRun` setting (persists via localStorage / Tauri Store per Phase A pattern).

### 6.6 i18n keys (~25 per locale)

New `'check.*'`, `'beam.props.*'`, `'ribbon.check.*'`, `'report.en1993*'` namespaces in 6 locale files. NL/EN authoritative; ES/FR/IT/ZH best-effort.

### 6.7 Files added/modified

**NEW:**
- `src/components/SteelCheckPanel/SteelCheckPanel.tsx + .css`
- `src/components/BarPropertiesDialog/EN1993Tab.tsx`
- `src/components/ReportPanel/sections/EN1993SummarySection.tsx`
- `src/components/ReportPanel/sections/EN1993CalculationsSection.tsx`
- `src/components/ReportPanel/sections/CheckBlock.tsx`
- `src/lib/steelCheckBuilder.ts`
- `src/lib/types/steel/*.ts` (ts-rs generated)

**MODIFIED:**
- `src/components/Ribbon/Ribbon.tsx` — `'check'` tab + content
- `src/components/BarPropertiesDialog/BarPropertiesDialog.tsx` — tabs introduced
- `src/components/SettingsDialog/SettingsDialog.tsx` — auto-run toggle
- `src/context/FEMContext.tsx` — state + reducers
- `src/core/io/ProjectSerializer.ts` — version 1.1.0 with steel configs
- `src/core/report/ReportConfig.ts` — new section types
- `src/components/ReportPanel/ReportPreview.tsx` — dispatch new sections
- `src/App.tsx` — auto-run hook + render SteelCheckPanel
- `src/i18n/{en,nl,es,fr,it,zh}.ts` — ~25 keys per locale
- `package.json` — `katex` ^0.16
- `vite.config.ts` — alias `@profiles`

## 7. Steel Profile Data Strategy

### 7.1 Single source of truth: `crates/steel-profiles/data/profiles.json`

Schema per entry:
```json
{
  "name": "HEB160",
  "kind": "ISection",
  "geometry": { "h": 160, "b": 160, "tw": 8.0, "tf": 13.0, "r": 15 },
  "properties": {
    "area_mm2": 5427.5, "iy_mm4": 24920000, "iz_mm4": 8892600,
    "wel_y_mm3": 311500, "wel_z_mm3": 111200, "wpl_y_mm3": 354100, "wpl_z_mm3": 170000,
    "av_z_mm2": 1762, "av_y_mm2": 4160,
    "it_mm4": 313664, "iw_mm6": 47940000000,
    "iy_radius_mm": 67.8, "iz_radius_mm": 40.5
  },
  "buckling_curves": { "y_axis": "b", "z_axis": "c" }
}
```

### 7.2 Rust consumption

`include_str!("../data/profiles.json")` baked into binary, parsed once via `OnceLock` singleton, `find()` / `all()` lookups. `build.rs` validates JSON parses at compile-time.

### 7.3 TS consumption

Vite alias `@profiles` → `src-tauri/crates/steel-profiles/data/profiles.json`. `SteelProfileLibrary.ts` becomes thin wrapper:
```ts
import profilesData from '@profiles';
export class SteelProfileLibrary {
  private static profiles: ISteelProfile[] = profilesData as ISteelProfile[];
  static findProfile(name: string): ISteelProfile | undefined { ... }
  static getAllProfiles(): ISteelProfile[] { ... }
  static getProfilesByKind(kind: string): ISteelProfile[] { ... }
}
```

### 7.4 Migration

One-shot script `scripts/migrate-profiles.ts` converts existing `SteelProfileLibrary.ts` + `SteelSections.ts` data → `profiles.json`. Verifies each profile's catalog properties match `crates/section-properties` computed values within 0.5% tolerance (manual review on mismatches).

### 7.5 Catalog scope

All existing TS profiles migrated (~150: HEA40-1000, HEB100-1000, IPE80-600, UPE80-300, UNP65-400, RHS-series, SHS-series). CHS and built-up sections explicit out-of-scope for v1.

### 7.6 Cross-validation test

`crates/steel-profiles/tests/properties_match_geometry.rs` iterates every profile, recomputes properties from geometry, asserts within tolerance. Catches catalog drift / computation bugs.

## 8. NEN-EN 1993-1-1 Calculation Scope (v1)

### 8.1 Implementation matrix

| Article | Check | Crate | Function |
|---------|-------|-------|----------|
| 5.5 / Tabel 5.2 | Cross-section classification | section | `classify_section(props, grade, force_state)` |
| 6.2.4 (6.10) | Compression resistance | section | `n_c_rd(...)` |
| 6.2.5 (6.13/6.12) | Bending resistance major (y) | section | `m_y_c_rd(...)` |
| 6.2.5 | Bending resistance minor (z) | section | `m_z_c_rd(...)` |
| 6.2.6 (6.17/6.18) | Shear resistance z-axis | section | `v_z_c_rd(...)` |
| 6.2.6 | Shear resistance y-axis | section | `v_y_c_rd(...)` |
| 6.2.8 | M+V interaction | section | `check_combined_mv(...)` |
| 6.2.9 | M+N interaction | section | `check_combined_mn(...)` |
| 6.2.10 | M+N+V combined | section | `check_combined_mnv(...)` |
| 6.3.1 (6.46-6.50) | Column buckling | stability | `n_b_rd(...)` |
| 6.3.2.1 + NB Annex | Lateral-torsional buckling | ltb | `m_b_rd(...)` |
| 6.3.3 (6.61) | Combined N+M, member y | stability | `check_combined_n_my(...)` |
| 6.3.3 (6.62) | Combined N+M, member z | stability | `check_combined_n_mz(...)` |
| Annex B | Interaction factors k_yy/k_yz/k_zy/k_zz | stability | `interaction_factors_method_2(...)` |
| NEN-EN 1990 (SLS) | Deflection check | steel-check | `check_deflection(...)` |

NB-annex Mcr formulation (in `crates/nen-en-1993-1-1-ltb/src/nb_annex.rs`):
- NB.148: Mcr base for I-section
- NB.153: C1, C2 from moment distribution + load type
- NB.157: S parameter
- NB.159: C-coefficient substitution
- `k_red` for slender webs (h/tw > 75)

### 8.2 Pivotal `ResistanceCalc` / `StabilityCalc` pattern

```rust
pub struct ResistanceCalc {
    pub title: String,                  // "Compression"
    pub article: String,                // "art. 6.2.4 (6.10)"
    pub force_state: ForceStateSnapshot,
    pub formula_latex: String,          // KaTeX-compatible
    pub variables: Vec<NamedValue>,     // ordered [(symbol, value, unit)]
    pub value: f64, pub unit: String,
    pub uc: Option<UnityCheck>,
    pub status: CheckStatus,
    pub notes: Vec<String>,
}

pub struct UnityCheck { ed, rd, uc, formula_latex }
pub struct NamedValue { symbol, value, unit }
pub struct ForceStateSnapshot { combination_id, position_mm, forces }
```

`StabilityCalc` mirrors structure; separate type for type-safety.

### 8.3 Steel-check orchestrator flow

`steel_check::check_beam(input)`:
1. Load profile + grade
2. Cross-section classification for governing combo/location
3. Iterate force-envelope → track max-UC location per check
4. Run cross-section checks at governing location (6.2.4 / 6.2.5 / 6.2.6 / 6.2.8 / 6.2.9 / 6.2.10)
5. Run member stability:
   - 6.3.1 column buckling (full beam length)
   - 6.3.2 LTB (uses lateral-bracing input + force-diagram)
   - 6.3.3 combined N+M
6. SLS deflection check
7. Aggregate max UC + governing check id
8. Return `BeamCheckResult` with all `NamedCheck` entries (one per article)

Order matches the reference layout. Notes rendered inline (e.g., "V_z,Ed < V_z,pl,Rd / 2 — shear effect on moment can be neglected").

### 8.4 Numerical conventions

- Units in interface: kN, kNm, mm, MPa
- f64 throughout; output formatted to 3 decimals
- Locale-neutral computation; comma vs period in TS rendering layer
- Division-by-zero guarded; NaN never propagated; errors as `Result::Err`
- Sign conventions match solver (negative N_Ed = compression, negative My = bottom fibre tension); abs values for UC comparisons

## 9. Verification Strategy

### 9.1 Reference calculations as integration tests

Seven Rust integration tests = the **acceptance suite** (all must pass for v1):

| File | Beam | Profile |
|------|------|---------|
| `crates/steel-check/tests/calc2_beam1.rs` | 1 | HEB160 (S 235) |
| `crates/steel-check/tests/calc2_beam2.rs` | 2 | HEB160 (S 235) |
| `crates/steel-check/tests/calc2_beam3.rs` | 3 | HFRHS200×200×16 (S 235) |
| `crates/steel-check/tests/portal_beam1.rs` | 1 | UNP350 (S 235) |
| `crates/steel-check/tests/portal_beam2.rs` | 2 | HEB160 (S 235) |
| `crates/steel-check/tests/portal_beam3.rs` | 3 | HEB160 (S 235) |
| `crates/steel-check/tests/portal_beam4.rs` | 4 | HEB300 (S 235) |

Each test file ≈ 5-7 individual assertions per beam (compression, bending, shear, M+V, M+N, LTB intermediate steps, governing UC) → ~35-50 acceptance assertions total.

### 9.2 Tolerance choices

| Type | Tolerance | Reason |
|------|-----------|--------|
| Resistance values | `max_relative = 1e-3` (0.1%) | Reference shows 3 decimals |
| Unity checks | `max_relative = 0.01` (1%) | Reference rounds to 2 decimals |
| Geometric properties | `max_relative = 0.005` (0.5%) | Catalog values are hand-rounded |
| LTB intermediate (S, C, λ_LT) | `max_relative = 0.005` (0.5%) | Multi-step accumulated rounding |
| Status enum | exact | Hard threshold |

### 9.3 Snapshot regression with `insta`

Each beam also gets one snapshot test dumping full `BeamCheckResult` JSON to `crates/steel-check/tests/snapshots/calc2_beam1.json` (golden file in git). Catches regressions in derivation steps that assert-tests don't see.

### 9.4 Frontend tests

- **Vitest** unit tests for `steelCheckBuilder.test.ts` (no Tauri mock needed, pure TS)
- **Playwright** E2E in `test-en1993.mjs`: launch tauri:dev → load Calc 2 fixture → solve → verify panel UCs → open report → screenshot regression

### 9.5 Test fixtures

`tests/fixtures/calc2.femp` and `tests/fixtures/portal_frame.femp` — `.femp` projects manually built in app, exported, committed to git. Used by E2E tests.

### 9.6 CI strategy

GitHub Actions (extending existing):
- `cargo-test`: `cargo test --workspace --all-features` on Windows + macOS + Linux runners — required to pass
- `cargo-tarpaulin`: coverage report uploaded; fail at <85% for steel-check crate
- `vitest`: TS unit tests
- `playwright-e2e`: Windows runner only, optional v1 / required v2
- Nightly cron: `cargo build --release` + tauri build for installer tests

### 9.7 Per-check verification log

`docs/verification/` (new folder, in git):
- `calc2-beam1.md`, `calc2-beam2.md`, `calc2-beam3.md`
- `portal-beam1.md`, `portal-beam2.md`, `portal-beam3.md`, `portal-beam4.md`

Each file: snippet from the reference PDF → corresponding Rust test → explanation of any deviations (e.g. NB.157 √-rounding). Provides audit trail for structural-engineering review.

## 10. Definition of Done

Project complete when:

1. All 8 Rust crates compile with `cargo build --workspace` and pass `cargo test --workspace`
2. All 7 acceptance integration tests pass with stated tolerances
3. All 7 snapshot tests committed and stable
4. `cargo tarpaulin` shows ≥85% coverage on steel-check, ≥90% elsewhere
5. `npx tsc --noEmit` PASS
6. `vitest` PASS
7. `npm run tauri:dev` opens app; "▶ Run all checks" produces non-empty SteelCheckPanel results for the calc2 fixture
8. Report tab shows EN 1993 summary + per-beam derivation, OpenAEC §4.3 styled
9. `npm run tauri:build` produces working .msi installer
10. README updated with EN 1993 build prerequisites
11. 7 verification log files in `docs/verification/`
12. Memory file updated with key decisions for future sessions
13. Brand audit clean: no 3BM, OpenAEC consistent, no Eurocode hardcoded outside crates

---

*This spec is the single source of truth for the EN 1993-1-1 Steel Check engine. Any deviation during implementation requires updating this doc.*
