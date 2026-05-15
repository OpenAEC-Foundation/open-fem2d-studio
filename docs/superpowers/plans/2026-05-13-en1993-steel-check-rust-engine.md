# EN 1993-1-1 Steel Check Rust Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an 8-crate Rust workspace that performs NEN-EN 1993-1-1+C2+A1/NB:2016 nl steel checks, exposed via Tauri commands to the React UI, that reproduces de referentie output for 7 reference beams (Calc 2: 3 beams + portal-frame: 4 beams) to within 0.1% on resistances and 1% on UCs.

**Architecture:** Workspace with 8 path-deps crates (mechanics → section-properties → steel-profiles + nen-en-1990 → nen-en-1993-1-1-{section,stability,ltb} → steel-check). Tauri main package depends on steel-check, exposes 3 commands. Frontend uses ts-rs-generated TypeScript types. Single source of truth for steel profiles in JSON loaded by both Rust (`include_str!`) and TS (Vite alias).

**Tech Stack:** Rust 1.94 GNU/MinGW, Tauri 2, ts-rs 10, insta 1, approx 0.5, serde 1, serde_json 1, rayon 1 (future). Frontend: existing React 18 + TS + Vite + KaTeX 0.16.

**Spec:** `docs/superpowers/specs/2026-05-13-en1993-steel-check-rust-engine-design.md` (commit 2cdd0de)

**Verify-iterate loop is mandatory:** Phase 13 generates real PDF reports from the Tauri app and diffs them against the original referentie PDFs. Iterate until match.

---

## File Structure

```
src-tauri/
├── Cargo.toml                                 # workspace root + main package
├── crates/
│   ├── mechanics/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs                         # InternalForces, BeamAxis, ForceEnvelope
│   ├── section-properties/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                         # SectionProperties + dispatcher
│   │       ├── i_section.rs                   # i_section_props()
│   │       ├── rhs.rs                         # rhs_section_props()
│   │       └── channel.rs                     # channel_section_props()
│   ├── steel-profiles/
│   │   ├── Cargo.toml
│   │   ├── build.rs                           # JSON validation
│   │   ├── data/profiles.json                 # SINGLE SOURCE OF TRUTH
│   │   └── src/lib.rs                         # SteelProfileDb + find/all
│   ├── nen-en-1990/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs                         # LoadFactors, PsiFactors, CC1/2/3
│   ├── nen-en-1993-1-1-section/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                         # SteelGrade + ResistanceCalc + UnityCheck + dispatcher
│   │       ├── classification.rs              # 5.5 / Tabel 5.2
│   │       ├── compression.rs                 # 6.2.4
│   │       ├── bending.rs                     # 6.2.5
│   │       ├── shear.rs                       # 6.2.6
│   │       ├── combined_mv.rs                 # 6.2.8
│   │       ├── combined_mn.rs                 # 6.2.9
│   │       └── combined_mnv.rs                # 6.2.10
│   ├── nen-en-1993-1-1-stability/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                         # BucklingCurve + StabilityCalc
│   │       ├── buckling_curve.rs              # Table 6.1 + 6.2
│   │       ├── column_buckling.rs             # 6.3.1
│   │       ├── interaction_factors.rs         # Annex B Method 2
│   │       └── combined_n_m.rs                # 6.3.3 eqs 6.61, 6.62
│   ├── nen-en-1993-1-1-ltb/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                         # m_b_rd entry + LateralBracing
│   │       ├── nb_annex.rs                    # NB.148/153/157/159 + k_red
│   │       └── lambda_chi.rs                  # lambda_lt + chi_lt
│   └── steel-check/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                         # check_beam + check_all_beams
│           ├── input.rs                       # BeamCheckInput type
│           ├── result.rs                      # BeamCheckResult, NamedCheck
│           ├── orchestrator.rs                # check_beam logic
│           └── deflection.rs                  # SLS check
└── src/
    ├── main.rs                                # unchanged
    └── lib.rs                                 # add 3 Tauri commands

src/
├── lib/
│   ├── steelCheckBuilder.ts                   # buildSteelCheckInputs()
│   └── types/steel/                           # ts-rs generated
├── components/
│   ├── SteelCheckPanel/
│   │   ├── SteelCheckPanel.tsx
│   │   └── SteelCheckPanel.css
│   ├── BarPropertiesDialog/
│   │   ├── BarPropertiesDialog.tsx           # add tabs
│   │   ├── EN1993Tab.tsx                     # NEW
│   │   └── EN1993Tab.css                     # NEW
│   └── ReportPanel/sections/
│       ├── EN1993SummarySection.tsx          # NEW
│       ├── EN1993CalculationsSection.tsx     # NEW
│       └── CheckBlock.tsx                    # NEW (KaTeX renderer)

tests/fixtures/
├── calc2.femp                                 # rebuilt from Calc 2 PDF
└── portal_frame.femp                          # rebuilt from portal-frame PDF

docs/verification/
├── calc2-beam1.md ... calc2-beam3.md
└── portal-beam1.md ... portal-beam4.md
```

Total: ~80 tasks across 13 phases. Each task ~30-60 min of work, ends in a commit.

---

## Phase 1 — Workspace setup

### Task 1.1: Convert src-tauri to Cargo workspace

**Files:** Modify `src-tauri/Cargo.toml`

- [ ] **Step 1:** Read current `src-tauri/Cargo.toml`. Add `[workspace]` table at end:

```toml
[workspace]
resolver = "2"
members = [".", "crates/*"]
```

- [ ] **Step 2:** Run `cd src-tauri && cargo check` — must still pass (no crates exist yet, but workspace is valid).

- [ ] **Step 3:** Commit:
```bash
git add src-tauri/Cargo.toml
git commit -m "chore(tauri): convert Cargo.toml to workspace root for crate decomposition"
```

### Task 1.2: Add common dev-deps to workspace

**Files:** Modify `src-tauri/Cargo.toml`

- [ ] **Step 1:** Add workspace-shared dependency versions block:

```toml
[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
ts-rs = "10"
approx = "0.5"
insta = { version = "1", features = ["json"] }
```

- [ ] **Step 2:** `cargo check` — passes.

- [ ] **Step 3:** Commit:
```bash
git add src-tauri/Cargo.toml
git commit -m "chore(tauri): add workspace.dependencies for serde/ts-rs/approx/insta"
```

### Task 1.3: Scaffold all 8 empty crates

**Files:**
- Create: `src-tauri/crates/mechanics/{Cargo.toml,src/lib.rs}`
- Create: `src-tauri/crates/section-properties/{Cargo.toml,src/lib.rs}`
- Create: `src-tauri/crates/steel-profiles/{Cargo.toml,build.rs,src/lib.rs,data/profiles.json}`
- Create: `src-tauri/crates/nen-en-1990/{Cargo.toml,src/lib.rs}`
- Create: `src-tauri/crates/nen-en-1993-1-1-section/{Cargo.toml,src/lib.rs}`
- Create: `src-tauri/crates/nen-en-1993-1-1-stability/{Cargo.toml,src/lib.rs}`
- Create: `src-tauri/crates/nen-en-1993-1-1-ltb/{Cargo.toml,src/lib.rs}`
- Create: `src-tauri/crates/steel-check/{Cargo.toml,src/lib.rs}`

- [ ] **Step 1:** For each of the 8 crates, create `Cargo.toml` with this template (substitute name):

```toml
[package]
name = "<CRATE_NAME>"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["lib"]

[dependencies]
serde = { workspace = true }
ts-rs = { workspace = true }

[dev-dependencies]
approx = { workspace = true }
insta = { workspace = true }
```

For `steel-profiles`, additionally add:
```toml
serde_json = { workspace = true }
```
And add `build = "build.rs"` to `[package]`.

- [ ] **Step 2:** For each crate, create `src/lib.rs` with one-line stub:

```rust
//! <CRATE_NAME> — placeholder, contents arrive in subsequent tasks.
```

- [ ] **Step 3:** For `steel-profiles/build.rs`:

```rust
fn main() {
    let json = std::fs::read_to_string("data/profiles.json")
        .expect("data/profiles.json missing");
    let _: serde_json::Value = serde_json::from_str(&json)
        .expect("data/profiles.json malformed");
    println!("cargo:rerun-if-changed=data/profiles.json");
}
```

For `steel-profiles/Cargo.toml`, also add:
```toml
[build-dependencies]
serde_json = { workspace = true }
```

- [ ] **Step 4:** Create `src-tauri/crates/steel-profiles/data/profiles.json` with empty array `[]` (will be populated in Phase 4).

- [ ] **Step 5:** Add inter-crate path deps to relevant crate Cargo.tomls now (saves later edits):

In `section-properties/Cargo.toml [dependencies]`:
```toml
mechanics = { path = "../mechanics" }
```

In `steel-profiles/Cargo.toml [dependencies]`:
```toml
section-properties = { path = "../section-properties" }
```

In `nen-en-1993-1-1-section/Cargo.toml [dependencies]`:
```toml
mechanics = { path = "../mechanics" }
section-properties = { path = "../section-properties" }
nen-en-1990 = { path = "../nen-en-1990" }
```

In `nen-en-1993-1-1-stability/Cargo.toml [dependencies]`:
```toml
mechanics = { path = "../mechanics" }
section-properties = { path = "../section-properties" }
nen-en-1990 = { path = "../nen-en-1990" }
nen-en-1993-1-1-section = { path = "../nen-en-1993-1-1-section" }
```

In `nen-en-1993-1-1-ltb/Cargo.toml [dependencies]`:
```toml
mechanics = { path = "../mechanics" }
section-properties = { path = "../section-properties" }
nen-en-1993-1-1-section = { path = "../nen-en-1993-1-1-section" }
```

In `steel-check/Cargo.toml [dependencies]`:
```toml
mechanics = { path = "../mechanics" }
section-properties = { path = "../section-properties" }
steel-profiles = { path = "../steel-profiles" }
nen-en-1990 = { path = "../nen-en-1990" }
nen-en-1993-1-1-section = { path = "../nen-en-1993-1-1-section" }
nen-en-1993-1-1-stability = { path = "../nen-en-1993-1-1-stability" }
nen-en-1993-1-1-ltb = { path = "../nen-en-1993-1-1-ltb" }
```

- [ ] **Step 6:** Run `cd src-tauri && cargo check --workspace` — all 9 crates compile (8 sub + 1 main).

- [ ] **Step 7:** Commit:
```bash
git add src-tauri/crates/
git commit -m "feat(crates): scaffold 8 empty crates with inter-crate path deps

mechanics, section-properties, steel-profiles, nen-en-1990,
nen-en-1993-1-1-{section,stability,ltb}, steel-check.
All lib-only (Phase C lesson). cargo check passes workspace."
```

---

## Phase 2 — Foundation crates

### Task 2.1: mechanics — InternalForces + BeamAxis

**Files:** Modify `src-tauri/crates/mechanics/src/lib.rs`

- [ ] **Step 1:** Replace `lib.rs` with:

```rust
//! Mechanics primitives — force/moment structures, beam axis, force envelopes.
//! Used as foundation by all higher crates. No application-specific deps.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Internal forces at a point along a beam.
/// Sign convention: N positive = tension; My positive = bottom fibre tension.
/// Units: kN (forces), kNm (moments).
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct InternalForces {
    pub n_ed: f64,
    pub vy_ed: f64,
    pub vz_ed: f64,
    pub mt_ed: f64,
    pub my_ed: f64,
    pub mz_ed: f64,
}

/// Beam local axis frame.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct BeamAxis {
    pub length_m: f64,
    pub orientation_rad: f64,
}

/// One sample point along a beam: position (mm from start) + governing
/// internal forces at that location for some load combination.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ForcePoint {
    pub combination_id: u32,
    pub position_mm: f64,
    pub forces: InternalForces,
}

/// Snapshot of force state at a single check location — used in derivation reports.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ForceStateSnapshot {
    pub combination_id: u32,
    pub position_mm: f64,
    pub forces: InternalForces,
}

impl ForceStateSnapshot {
    pub fn from_point(p: &ForcePoint) -> Self {
        Self {
            combination_id: p.combination_id,
            position_mm: p.position_mm,
            forces: p.forces,
        }
    }
}
```

- [ ] **Step 2:** `cd src-tauri && cargo check -p mechanics` — passes.

- [ ] **Step 3:** Commit:
```bash
git add src-tauri/crates/mechanics/
git commit -m "feat(mechanics): InternalForces, BeamAxis, ForcePoint, ForceStateSnapshot

Foundation types with serde + ts-rs derives for IPC type generation."
```

### Task 2.2: nen-en-1990 — load factors + Psi + ConsequenceClass

**Files:** Modify `src-tauri/crates/nen-en-1990/src/lib.rs`

- [ ] **Step 1:** Replace `lib.rs` with:

```rust
//! NEN-EN 1990 NB — partial factors, combination factors, consequence classes.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct LoadFactors {
    pub name: &'static str,
    pub gamma_g: f64,
    pub gamma_q: f64,
    pub gamma_q_acc: f64,
    pub psi0: f64,
}

pub const ULS_6_10A: LoadFactors = LoadFactors {
    name: "6.10a", gamma_g: 1.35, gamma_q: 1.5, gamma_q_acc: 1.5, psi0: 0.0,
};
pub const ULS_6_10B: LoadFactors = LoadFactors {
    name: "6.10b", gamma_g: 1.2, gamma_q: 1.5, gamma_q_acc: 1.5, psi0: 0.0,
};
pub const EQU: LoadFactors = LoadFactors {
    name: "EQU", gamma_g: 0.9, gamma_q: 1.5, gamma_q_acc: 1.5, psi0: 0.0,
};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct PsiFactors {
    pub category: &'static str,
    pub description: &'static str,
    pub psi0: f64,
    pub psi1: f64,
    pub psi2: f64,
}

pub const PSI_A: PsiFactors = PsiFactors { category: "A", description: "Woonruimten", psi0: 0.4, psi1: 0.5, psi2: 0.3 };
pub const PSI_B: PsiFactors = PsiFactors { category: "B", description: "Kantoorruimten", psi0: 0.5, psi1: 0.5, psi2: 0.3 };
pub const PSI_C: PsiFactors = PsiFactors { category: "C", description: "Bijeenkomstruimten", psi0: 0.6, psi1: 0.7, psi2: 0.6 };
pub const PSI_D: PsiFactors = PsiFactors { category: "D", description: "Winkelruimten", psi0: 0.6, psi1: 0.7, psi2: 0.6 };
pub const PSI_E: PsiFactors = PsiFactors { category: "E", description: "Opslagruimten", psi0: 1.0, psi1: 0.9, psi2: 0.8 };
pub const PSI_F: PsiFactors = PsiFactors { category: "F", description: "Verkeer < 30 kN", psi0: 0.6, psi1: 0.7, psi2: 0.6 };
pub const PSI_G: PsiFactors = PsiFactors { category: "G", description: "Verkeer 30-160 kN", psi0: 0.7, psi1: 0.5, psi2: 0.3 };
pub const PSI_H: PsiFactors = PsiFactors { category: "H", description: "Daken", psi0: 0.0, psi1: 0.0, psi2: 0.0 };
pub const PSI_WIND: PsiFactors = PsiFactors { category: "Wind", description: "Windbelasting", psi0: 0.0, psi1: 0.2, psi2: 0.0 };
pub const PSI_SNOW: PsiFactors = PsiFactors { category: "Sneeuw", description: "Sneeuwbelasting NL", psi0: 0.0, psi1: 0.2, psi2: 0.0 };

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub enum ConsequenceClass { CC1, CC2, CC3 }

impl ConsequenceClass {
    pub fn k_fi(self) -> f64 {
        match self { Self::CC1 => 0.9, Self::CC2 => 1.0, Self::CC3 => 1.1 }
    }
    pub fn name(self) -> &'static str {
        match self { Self::CC1 => "CC1", Self::CC2 => "CC2", Self::CC3 => "CC3" }
    }
}
```

- [ ] **Step 2:** `cargo check -p nen-en-1990` — passes.

- [ ] **Step 3:** Commit:
```bash
git add src-tauri/crates/nen-en-1990/
git commit -m "feat(nen-en-1990): ULS load factors, Psi factors, ConsequenceClass"
```

---

## Phase 3 — section-properties crate

### Task 3.1: SectionProperties type + I-section formulas

**Files:**
- Modify: `src-tauri/crates/section-properties/src/lib.rs`
- Create: `src-tauri/crates/section-properties/src/i_section.rs`

- [ ] **Step 1:** Replace `lib.rs` with:

```rust
//! Pure section-property calculations from geometric primitives.
//! Used by steel-profiles to validate catalog values and by EN-1993 checks.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub mod i_section;
pub mod rhs;
pub mod channel;

/// All cross-sectional properties needed for EN 1993 checks.
/// Units: mm² for areas, mm⁴ for I, mm³ for W, mm for radii.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct SectionProperties {
    pub area_mm2: f64,
    pub iy_mm4: f64,
    pub iz_mm4: f64,
    pub wel_y_mm3: f64,
    pub wel_z_mm3: f64,
    pub wpl_y_mm3: f64,
    pub wpl_z_mm3: f64,
    pub av_y_mm2: f64,
    pub av_z_mm2: f64,
    pub it_mm4: f64,
    pub iw_mm6: f64,
    pub iy_radius_mm: f64,
    pub iz_radius_mm: f64,
    // Geometry passthrough for downstream checks needing raw dimensions.
    pub h_mm: f64,
    pub b_mm: f64,
    pub tw_mm: f64,
    pub tf_mm: f64,
    pub r_mm: f64,
}
```

- [ ] **Step 2:** Create `src/i_section.rs`:

```rust
//! Hot-rolled I-section properties (HEA, HEB, IPE, HEM).
//! Approximations follow standard structural-steel handbook formulas.

use crate::SectionProperties;

/// Compute properties for a rolled I-section (h, b, tw, tf, r in mm).
/// All formulas reference NEN-EN 1993-1-1 conventions.
pub fn i_section_props(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> SectionProperties {
    let hw = h - 2.0 * tf;  // web height clear of flanges

    // Area: 2 flanges + web + 4 root fillets (approx as squares - corners)
    let a_flanges = 2.0 * b * tf;
    let a_web = hw * tw;
    let a_fillets = 4.0 * (r * r - std::f64::consts::PI * r * r / 4.0);  // 4 × (r² - πr²/4)
    let area = a_flanges + a_web + a_fillets;

    // Iy (major axis): flanges parallel-axis + web central + fillets
    let iy_flanges = 2.0 * (b * tf.powi(3) / 12.0 + b * tf * ((h - tf) / 2.0).powi(2));
    let iy_web = tw * hw.powi(3) / 12.0;
    // Fillets contribution at distance (hw/2 - r/3) approx
    let fillet_area = r * r - std::f64::consts::PI * r * r / 4.0;
    let fillet_centroid_y = hw / 2.0 - r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI);
    let iy_fillets = 4.0 * fillet_area * fillet_centroid_y.powi(2);
    let iy = iy_flanges + iy_web + iy_fillets;

    // Iz (minor axis)
    let iz_flanges = 2.0 * (tf * b.powi(3) / 12.0);
    let iz_web = hw * tw.powi(3) / 12.0;
    let iz_fillets_arm = tw / 2.0 + r * (4.0 - std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI) * 0.0 + tw / 2.0;
    let iz_fillets = 4.0 * fillet_area * (tw / 2.0 + r / 2.0).powi(2);
    let iz = iz_flanges + iz_web + iz_fillets;

    // Elastic section moduli
    let wel_y = iy / (h / 2.0);
    let wel_z = iz / (b / 2.0);

    // Plastic section moduli — for I: Wpl,y = b*tf*(h-tf) + tw*(h/2-tf)² + ...
    let wpl_y = b * tf * (h - tf) + tw * (h / 2.0 - tf).powi(2)
        + 4.0 * fillet_area * fillet_centroid_y;
    let wpl_z = 2.0 * (tf * b.powi(2) / 4.0) + (hw * tw.powi(2) / 4.0)
        + 4.0 * fillet_area * (tw / 2.0 + r / 2.0);

    // Shear areas (NEN-EN 1993-1-1 §6.2.6(3))
    // Av,z = A - 2*b*tf + (tw + 2*r) * tf  (rolled I, load parallel to web)
    let av_z = area - 2.0 * b * tf + (tw + 2.0 * r) * tf;
    // Av,y = 2*b*tf  (load parallel to flanges)
    let av_y = 2.0 * b * tf;

    // Torsion constant It (St-Venant, approximation for rolled I)
    let it = (1.0 / 3.0) * (2.0 * b * tf.powi(3) + (h - tf) * tw.powi(3))
        + 2.0 * 0.0937 * r.powi(4);

    // Warping constant Iw (rolled I-section)
    let iw = iz * (h - tf).powi(2) / 4.0;

    // Radii of gyration
    let iy_radius = (iy / area).sqrt();
    let iz_radius = (iz / area).sqrt();

    SectionProperties {
        area_mm2: area,
        iy_mm4: iy,
        iz_mm4: iz,
        wel_y_mm3: wel_y,
        wel_z_mm3: wel_z,
        wpl_y_mm3: wpl_y,
        wpl_z_mm3: wpl_z,
        av_y_mm2: av_y,
        av_z_mm2: av_z,
        it_mm4: it,
        iw_mm6: iw,
        iy_radius_mm: iy_radius,
        iz_radius_mm: iz_radius,
        h_mm: h, b_mm: b, tw_mm: tw, tf_mm: tf, r_mm: r,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// HEB160 catalog values (from European steel section tables).
    /// h=160, b=160, tw=8.0, tf=13.0, r=15.
    #[test]
    fn heb160_matches_catalog_within_2pct() {
        let p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        assert_relative_eq!(p.area_mm2, 5427.5, max_relative = 0.02);
        assert_relative_eq!(p.iy_mm4, 24920000.0, max_relative = 0.02);
        assert_relative_eq!(p.iz_mm4, 8892600.0, max_relative = 0.02);
        assert_relative_eq!(p.wpl_y_mm3, 354100.0, max_relative = 0.02);
    }
}
```

- [ ] **Step 3:** Create stub `src/rhs.rs`:

```rust
//! Rectangular Hollow Section (RHS) and Square Hollow Section (SHS) properties.
use crate::SectionProperties;
pub fn rhs_section_props(_h: f64, _b: f64, _t: f64, _r: f64) -> SectionProperties {
    SectionProperties::default()  // implemented in Task 3.2
}
```

- [ ] **Step 4:** Create stub `src/channel.rs`:

```rust
//! UNP/UPE channel section properties.
use crate::SectionProperties;
pub fn channel_section_props(_h: f64, _b: f64, _tw: f64, _tf: f64, _r: f64) -> SectionProperties {
    SectionProperties::default()  // implemented in Task 3.3
}
```

- [ ] **Step 5:** `cargo test -p section-properties` — heb160 test passes.

- [ ] **Step 6:** Commit:
```bash
git add src-tauri/crates/section-properties/
git commit -m "feat(section-properties): SectionProperties type + I-section formulas

i_section_props() with HEB160 verification test matching catalog within 2%."
```

### Task 3.2: RHS section formulas

**Files:** Modify `src-tauri/crates/section-properties/src/rhs.rs`

- [ ] **Step 1:** Replace `rhs.rs` with:

```rust
//! Hot-formed Rectangular/Square Hollow Section properties.
//! NEN-EN 1993-1-1 conventions; r is the outer corner radius.

use crate::SectionProperties;

pub fn rhs_section_props(h: f64, b: f64, t: f64, r: f64) -> SectionProperties {
    // Outer rect minus inner rect with rounded corners
    let ri = (r - t).max(0.0);  // inner corner radius
    let area_outer = h * b - (4.0 - std::f64::consts::PI) * r * r;
    let area_inner = (h - 2.0 * t) * (b - 2.0 * t) - (4.0 - std::f64::consts::PI) * ri * ri;
    let area = area_outer - area_inner;

    // Iy / Iz: outer rect with rounded corners minus inner
    let iy_outer = b * h.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * r.powi(2) * (h / 2.0 - r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI)).powi(2)
        - (4.0 - std::f64::consts::PI) * r.powi(4) * 0.0;  // small term
    let iy_inner_h = h - 2.0 * t;
    let iy_inner_b = b - 2.0 * t;
    let iy_inner = iy_inner_b * iy_inner_h.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * ri.powi(2) * (iy_inner_h / 2.0).powi(2);
    let iy = iy_outer - iy_inner;

    let iz_outer = h * b.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * r.powi(2) * (b / 2.0 - r * (10.0 - 3.0 * std::f64::consts::PI) / (12.0 - 3.0 * std::f64::consts::PI)).powi(2);
    let iz_inner = iy_inner_h * iy_inner_b.powi(3) / 12.0
        - (4.0 - std::f64::consts::PI) * ri.powi(2) * (iy_inner_b / 2.0).powi(2);
    let iz = iz_outer - iz_inner;

    let wel_y = iy / (h / 2.0);
    let wel_z = iz / (b / 2.0);

    // Plastic moduli — exact for rectangular tube ignoring corners (close enough for thin walls)
    let wpl_y = b * h * h / 4.0 - (b - 2.0 * t) * (h - 2.0 * t).powi(2) / 4.0;
    let wpl_z = h * b * b / 4.0 - (h - 2.0 * t) * (b - 2.0 * t).powi(2) / 4.0;

    // Shear areas: NEN-EN 1993-1-1 §6.2.6(3) for hollow sections
    // Av,z = A * h / (b + h)
    let av_z = area * h / (b + h);
    let av_y = area * b / (b + h);

    // Torsion constant It for closed thin-walled section: It = 4 * Am² * t / um
    // Am = (b-t)*(h-t) ; um = 2*(b+h-2t)
    let am = (b - t) * (h - t);
    let um = 2.0 * (b + h - 2.0 * t);
    let it = 4.0 * am.powi(2) * t / um;

    // Iw negligible for closed sections
    let iw = 0.0;

    let iy_radius = (iy / area).sqrt();
    let iz_radius = (iz / area).sqrt();

    SectionProperties {
        area_mm2: area, iy_mm4: iy, iz_mm4: iz,
        wel_y_mm3: wel_y, wel_z_mm3: wel_z,
        wpl_y_mm3: wpl_y, wpl_z_mm3: wpl_z,
        av_y_mm2: av_y, av_z_mm2: av_z,
        it_mm4: it, iw_mm6: iw,
        iy_radius_mm: iy_radius, iz_radius_mm: iz_radius,
        h_mm: h, b_mm: b, tw_mm: t, tf_mm: t, r_mm: r,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// HFRHS200x200x16 — from Calc 2 PDF (Beam 3): area ~10770 mm², iy ~62.4e6 mm⁴.
    #[test]
    fn hfrhs_200x200x16_matches_catalog() {
        let p = rhs_section_props(200.0, 200.0, 16.0, 24.0);
        assert_relative_eq!(p.area_mm2, 10770.0, max_relative = 0.05);
        assert_relative_eq!(p.iy_mm4, 62400000.0, max_relative = 0.05);
    }
}
```

- [ ] **Step 2:** `cargo test -p section-properties` — both tests pass.

- [ ] **Step 3:** Commit:
```bash
git add src-tauri/crates/section-properties/src/rhs.rs
git commit -m "feat(section-properties): RHS/SHS section formulas with HFRHS200x200x16 test"
```

### Task 3.3: Channel section formulas

**Files:** Modify `src-tauri/crates/section-properties/src/channel.rs`

- [ ] **Step 1:** Replace `channel.rs` with:

```rust
//! UNP/UPE channel section properties.
//! Mono-symmetric: Iy major (web vertical), Iz minor (asymmetric about z).

use crate::SectionProperties;

pub fn channel_section_props(h: f64, b: f64, tw: f64, tf: f64, r: f64) -> SectionProperties {
    let hw = h - 2.0 * tf;
    let area = 2.0 * b * tf + hw * tw + 2.0 * (r * r - std::f64::consts::PI * r * r / 4.0);

    // Centroid offset from web outer face (z-direction)
    let s_flanges = 2.0 * (b * tf) * (b / 2.0);
    let s_web = (hw * tw) * (tw / 2.0);
    let z_centroid = (s_flanges + s_web) / area;

    // Iy major axis (about horizontal centroidal)
    let iy_flanges = 2.0 * (b * tf.powi(3) / 12.0 + b * tf * ((h - tf) / 2.0).powi(2));
    let iy_web = tw * hw.powi(3) / 12.0;
    let iy = iy_flanges + iy_web;

    // Iz minor axis (about vertical centroidal — through z_centroid)
    let iz_flanges = 2.0 * (tf * b.powi(3) / 12.0 + b * tf * (b / 2.0 - z_centroid).powi(2));
    let iz_web = hw * tw.powi(3) / 12.0 + hw * tw * (z_centroid - tw / 2.0).powi(2);
    let iz = iz_flanges + iz_web;

    let wel_y = iy / (h / 2.0);
    let wel_z = iz / z_centroid.max(b - z_centroid);

    let wpl_y = b * tf * (h - tf) + tw * (h / 2.0 - tf).powi(2);
    // Wpl,z for channel — approx using neutral axis through web
    let wpl_z = 2.0 * tf * b.powi(2) / 4.0 + hw * tw.powi(2) / 4.0;

    // Shear areas — channel: Av,z ≈ hw*tw, Av,y ≈ 2*b*tf
    let av_z = hw * tw + 2.0 * (r * r - std::f64::consts::PI * r * r / 4.0);
    let av_y = 2.0 * b * tf;

    // Torsion constant — open thin-walled
    let it = (1.0 / 3.0) * (2.0 * b * tf.powi(3) + hw * tw.powi(3));

    // Warping constant Iw for channel — exact formula
    let alpha = 1.0 / (2.0 + (hw * tw) / (3.0 * b * tf));
    let iw = (b.powi(3) * tf * (h - tf).powi(2) / 12.0) * (3.0 * b * tf + 2.0 * hw * tw) / (6.0 * b * tf + hw * tw);
    let _ = alpha;  // kept for clarity, not used in simplified formula

    let iy_radius = (iy / area).sqrt();
    let iz_radius = (iz / area).sqrt();

    SectionProperties {
        area_mm2: area, iy_mm4: iy, iz_mm4: iz,
        wel_y_mm3: wel_y, wel_z_mm3: wel_z,
        wpl_y_mm3: wpl_y, wpl_z_mm3: wpl_z,
        av_y_mm2: av_y, av_z_mm2: av_z,
        it_mm4: it, iw_mm6: iw,
        iy_radius_mm: iy_radius, iz_radius_mm: iz_radius,
        h_mm: h, b_mm: b, tw_mm: tw, tf_mm: tf, r_mm: r,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// UNP350: h=350, b=100, tw=14, tf=16, r=16. Catalog area ≈ 7727 mm².
    #[test]
    fn unp350_matches_catalog() {
        let p = channel_section_props(350.0, 100.0, 14.0, 16.0, 16.0);
        assert_relative_eq!(p.area_mm2, 7727.0, max_relative = 0.05);
    }
}
```

- [ ] **Step 2:** `cargo test -p section-properties` — all 3 tests pass.

- [ ] **Step 3:** Commit:
```bash
git add src-tauri/crates/section-properties/src/channel.rs
git commit -m "feat(section-properties): channel section formulas with UNP350 test"
```

---

## Phase 4 — steel-profiles crate + JSON migration

### Task 4.1: SteelProfileDb types and loader

**Files:** Modify `src-tauri/crates/steel-profiles/src/lib.rs`

- [ ] **Step 1:** Replace `lib.rs` with:

```rust
//! Steel profile database — single source of truth shared with TS frontend.
//! JSON loaded at compile-time via include_str!, parsed once via OnceLock.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use ts_rs::TS;
use section_properties::SectionProperties;

const PROFILES_JSON: &str = include_str!("../data/profiles.json");

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub enum ProfileKind { ISection, Channel, Rhs, Shs, Chs }

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ProfileGeometry {
    pub h: f64, pub b: f64,
    #[serde(default)] pub tw: f64,
    #[serde(default)] pub tf: f64,
    #[serde(default)] pub t: f64,   // for tubes
    #[serde(default)] pub r: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct BucklingCurves {
    pub y_axis: char,
    pub z_axis: char,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct SteelProfile {
    pub name: String,
    pub kind: ProfileKind,
    pub geometry: ProfileGeometry,
    pub properties: SectionProperties,
    pub buckling_curves: BucklingCurves,
}

pub struct SteelProfileDb {
    profiles: Vec<SteelProfile>,
    by_name: HashMap<String, usize>,
}

impl SteelProfileDb {
    fn load() -> Self {
        let profiles: Vec<SteelProfile> = serde_json::from_str(PROFILES_JSON)
            .expect("profiles.json must parse — checked by build.rs");
        let by_name = profiles.iter().enumerate()
            .map(|(i, p)| (p.name.clone(), i))
            .collect();
        Self { profiles, by_name }
    }

    pub fn find(&self, name: &str) -> Option<&SteelProfile> {
        self.by_name.get(name).map(|&i| &self.profiles[i])
    }

    pub fn all(&self) -> &[SteelProfile] { &self.profiles }
}

pub fn db() -> &'static SteelProfileDb {
    static DB: OnceLock<SteelProfileDb> = OnceLock::new();
    DB.get_or_init(SteelProfileDb::load)
}
```

- [ ] **Step 2:** Seed `data/profiles.json` with minimum profiles needed for the 7 acceptance tests:

```json
[
  {
    "name": "HEB160",
    "kind": "ISection",
    "geometry": { "h": 160, "b": 160, "tw": 8.0, "tf": 13.0, "r": 15 },
    "properties": {
      "area_mm2": 5427.5, "iy_mm4": 24920000, "iz_mm4": 8892600,
      "wel_y_mm3": 311500, "wel_z_mm3": 111200,
      "wpl_y_mm3": 354100, "wpl_z_mm3": 170000,
      "av_y_mm2": 4160, "av_z_mm2": 1762,
      "it_mm4": 313664, "iw_mm6": 47940000000,
      "iy_radius_mm": 67.8, "iz_radius_mm": 40.5,
      "h_mm": 160, "b_mm": 160, "tw_mm": 8.0, "tf_mm": 13.0, "r_mm": 15
    },
    "buckling_curves": { "y_axis": "b", "z_axis": "c" }
  },
  {
    "name": "HEB300",
    "kind": "ISection",
    "geometry": { "h": 300, "b": 300, "tw": 11.0, "tf": 19.0, "r": 27 },
    "properties": {
      "area_mm2": 14910, "iy_mm4": 251700000, "iz_mm4": 85630000,
      "wel_y_mm3": 1678000, "wel_z_mm3": 570900,
      "wpl_y_mm3": 1869000, "wpl_z_mm3": 870100,
      "av_y_mm2": 11400, "av_z_mm2": 4742,
      "it_mm4": 1851000, "iw_mm6": 1688000000000,
      "iy_radius_mm": 129.9, "iz_radius_mm": 75.8,
      "h_mm": 300, "b_mm": 300, "tw_mm": 11.0, "tf_mm": 19.0, "r_mm": 27
    },
    "buckling_curves": { "y_axis": "b", "z_axis": "c" }
  },
  {
    "name": "UNP350",
    "kind": "Channel",
    "geometry": { "h": 350, "b": 100, "tw": 14.0, "tf": 16.0, "r": 16 },
    "properties": {
      "area_mm2": 7727, "iy_mm4": 128100000, "iz_mm4": 5703000,
      "wel_y_mm3": 734400, "wel_z_mm3": 75100,
      "wpl_y_mm3": 845000, "wpl_z_mm3": 144800,
      "av_y_mm2": 3200, "av_z_mm2": 4900,
      "it_mm4": 605000, "iw_mm6": 110600000000,
      "iy_radius_mm": 128.7, "iz_radius_mm": 27.2,
      "h_mm": 350, "b_mm": 100, "tw_mm": 14.0, "tf_mm": 16.0, "r_mm": 16
    },
    "buckling_curves": { "y_axis": "b", "z_axis": "c" }
  },
  {
    "name": "HFRHS200X200X16",
    "kind": "Shs",
    "geometry": { "h": 200, "b": 200, "t": 16.0, "r": 24 },
    "properties": {
      "area_mm2": 11280, "iy_mm4": 64400000, "iz_mm4": 64400000,
      "wel_y_mm3": 644000, "wel_z_mm3": 644000,
      "wpl_y_mm3": 768000, "wpl_z_mm3": 768000,
      "av_y_mm2": 5640, "av_z_mm2": 5640,
      "it_mm4": 102000000, "iw_mm6": 0,
      "iy_radius_mm": 75.6, "iz_radius_mm": 75.6,
      "h_mm": 200, "b_mm": 200, "tw_mm": 16.0, "tf_mm": 16.0, "r_mm": 24
    },
    "buckling_curves": { "y_axis": "c", "z_axis": "c" }
  }
]
```

- [ ] **Step 3:** `cargo check -p steel-profiles` — compiles; `cargo test -p steel-profiles` — no tests yet but loads OK.

- [ ] **Step 4:** Commit:
```bash
git add src-tauri/crates/steel-profiles/
git commit -m "feat(steel-profiles): SteelProfileDb loader + 4 seed profiles for tests

HEB160, HEB300, UNP350, HFRHS200X200X16 — minimum needed for the
7 reference beam acceptance tests. Full migration in Task 4.3."
```

### Task 4.2: Vite alias + thin TS wrapper

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/core/section/SteelProfileLibrary.ts`

- [ ] **Step 1:** Read current `vite.config.ts`. Add `path` import + `resolve.alias`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './vite-api-plugin';
import path from 'node:path';

const TAURI_DEV_HOST = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), apiPlugin()],
  clearScreen: false,
  server: { /* unchanged */ },
  envPrefix: ['VITE_', 'TAURI_'],
  optimizeDeps: { exclude: ['web-ifc'] },
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@profiles': path.resolve(__dirname, 'src-tauri/crates/steel-profiles/data/profiles.json'),
    },
  },
});
```

(Preserve existing `server`, `optimizeDeps`, `assetsInclude` blocks verbatim.)

- [ ] **Step 2:** Read `src/core/section/SteelProfileLibrary.ts`. The class likely has a hardcoded array. Add at top:

```ts
import profilesData from '@profiles';
```

And add to `package.json` (if not present, JSON imports work natively in Vite — no extra dep needed). For the TS type assertion add interface:

```ts
export interface SharedSteelProfile {
  name: string;
  kind: 'ISection' | 'Channel' | 'Rhs' | 'Shs' | 'Chs';
  geometry: { h: number; b: number; tw?: number; tf?: number; t?: number; r?: number };
  properties: {
    area_mm2: number; iy_mm4: number; iz_mm4: number;
    wel_y_mm3: number; wel_z_mm3: number; wpl_y_mm3: number; wpl_z_mm3: number;
    av_y_mm2: number; av_z_mm2: number;
    it_mm4: number; iw_mm6: number;
    iy_radius_mm: number; iz_radius_mm: number;
    h_mm: number; b_mm: number; tw_mm: number; tf_mm: number; r_mm: number;
  };
  buckling_curves: { y_axis: string; z_axis: string };
}

export const SHARED_PROFILES: SharedSteelProfile[] = profilesData as SharedSteelProfile[];
```

(Leave existing `SteelProfileLibrary` class unchanged for backwards compat — full refactor in Phase 12.)

- [ ] **Step 3:** Add JSON import declaration at `src/raw-svg.d.ts` (or new `src/profiles-json.d.ts`):

```ts
declare module '@profiles' {
  const value: unknown;
  export default value;
}
```

- [ ] **Step 4:** `npx tsc --noEmit` — passes.

- [ ] **Step 5:** Commit:
```bash
git add vite.config.ts src/core/section/SteelProfileLibrary.ts src/profiles-json.d.ts
git commit -m "feat(profiles): Vite @profiles alias + SharedSteelProfile shim

Both Rust crate and TS now read the same profiles.json — single
source of truth. Existing SteelProfileLibrary class untouched
(refactored in Phase 12)."
```


---

## Phase 5 — nen-en-1993-1-1-section (cross-section resistance, art. 6.2)

**Reference: spec section 8.1 (matrix) + 8.2 (ResistanceCalc pattern). Spec has complete formulas.**

### Task 5.1: Types module

**Files:** Modify `src-tauri/crates/nen-en-1993-1-1-section/src/lib.rs` + create stub sub-modules.

- [ ] Implement `SteelGrade` const constants (S235/S275/S355/S420/S460), `grade_by_name()`, `CheckStatus` enum, `NamedValue`/`UnityCheck`/`ResistanceCalc` structs per spec §8.2. All with `serde + ts-rs` derives, export to `../../../../src/lib/types/steel/`.
- [ ] Declare `pub mod` for: classification, compression, bending, shear, combined_mv, combined_mn, combined_mnv. Stub each with one-line doc comment.
- [ ] `cargo check -p nen-en-1993-1-1-section` PASS.
- [ ] Commit: `feat(en-1993-1-1-section): grade constants + ResistanceCalc/UnityCheck types`

### Task 5.2: classification.rs (Tabel 5.2 + §5.5)

- [ ] Implement `CrossSectionClass` enum + `classify_section(props, grade, forces) -> CrossSectionClass` per spec §8.1.
- [ ] Use `epsilon = sqrt(235/fy)`, web slenderness `c/t = (h - 2·tf - 2·r)/tw`, flange slenderness `(b/2 - tw/2 - r)/tf`. Limits per Tabel 5.2 (pure bending: 72/83/124·ε for web, 9/10/14·ε for flange; compression: 33/38/42·ε for web).
- [ ] Add `Ord/PartialOrd` derive so `worst = web.max(flange)`.
- [ ] Test: HEB160 S235 pure bending → Class 1.
- [ ] `cargo test -p nen-en-1993-1-1-section`. Commit.

### Task 5.3: compression.rs (art. 6.2.4)

- [ ] Implement `n_c_rd(p, grade, force_state) -> ResistanceCalc`. Formula: `N_c,Rd = A · fy / γM0 × 10⁻³` (kN). UC = |N_Ed| / N_c,Rd. Status NotApplicable for tension (positive N_Ed).
- [ ] Test: Calc 2 Beam 1 — N_Ed=-226.027 kN, expect N_c,Rd=1275.472 kN, UC=0.18.
- [ ] Commit: `feat(en-1993-1-1-section): 6.2.4 compression + Calc 2 Beam 1 test`

### Task 5.4: bending.rs (art. 6.2.5)

- [ ] Implement `m_y_c_rd` and `m_z_c_rd`. W = Wpl for Class 1/2, Wel for Class 3, Weff for Class 4 (fallback to Wel with note). Formula: `M_c,Rd = W · fy / γM0 × 10⁻⁶` (kNm).
- [ ] Test: Calc 2 Beam 1 — Wpl,y=354113, expect M_y,c,Rd=83.217 kNm, UC for M_Ed=-87.84 = 1.06 → NotOk.
- [ ] Commit: `feat(en-1993-1-1-section): 6.2.5 bending y/z + Calc 2 Beam 1 test (UC=1.06)`

### Task 5.5: shear.rs (art. 6.2.6)

- [ ] Implement `v_z_c_rd` and `v_y_c_rd`. Formula: `V_c,Rd = A_v · (fy/√3) / γM0 × 10⁻³` (kN).
- [ ] Test: Calc 2 Beam 1 — A_v=1762, expect V_c,z,Rd=239.1 kN, UC=0.15.
- [ ] Commit: `feat(en-1993-1-1-section): 6.2.6 shear + Calc 2 test (V_c=239.1 kN)`

### Task 5.6: combined_mv.rs (art. 6.2.8)

- [ ] Implement `check_combined_mv(p, grade, class, v_pl_rd, m_c_rd, force_state) -> ResistanceCalc`. If `V_Ed ≤ V_pl,Rd/2` → no shear effect (note "can be neglected"). Else `ρ = (2·V_Ed/V_pl,Rd - 1)²`, `M_y,V,Rd = (1-ρ)·M_y,c,Rd`.
- [ ] Commit: `feat(en-1993-1-1-section): 6.2.8 M+V interaction with V/2 threshold`

### Task 5.7: combined_mn.rs (art. 6.2.9)

- [ ] Implement `check_combined_mn`. Class 1/2: I-section eq. 6.36 with `n = N_Ed/N_pl,Rd`, `a = (A - 2·b·tf)/A ≤ 0.5`. If n ≤ a: no reduction. Else `M_N,y,Rd = M_pl,y,Rd · (1-n)/(1-0.5a)`. Class 3/4: linear `N_Ed/N_Rd + M_Ed/M_Rd ≤ 1`.
- [ ] Commit: `feat(en-1993-1-1-section): 6.2.9 M+N interaction`

### Task 5.8: combined_mnv.rs (art. 6.2.10)

- [ ] Implement `check_combined_mnv` — delegate to 6.2.9 if V_Ed ≤ V_pl,Rd/2 (no shear effect); else compute `ρ`, reduce M_pl_y_rd to (1-ρ)·M_pl_y_rd, then call 6.2.9 with reduced moment.
- [ ] Commit: `feat(en-1993-1-1-section): 6.2.10 M+N+V combined via shear reduction`


---

## Phase 6 — nen-en-1993-1-1-stability (member buckling + interaction)

### Task 6.1: BucklingCurve + StabilityCalc + chi formula

- [ ] In `lib.rs`: declare modules + `StabilityCalc` struct (mirror of ResistanceCalc but with `intermediate_values: Vec<NamedValue>` field for λ, χ, M_cr etc).
- [ ] Create `buckling_curve.rs`: `BucklingCurve` enum (A0/A/B/C/D), `alpha()` method (Tabel 6.1: 0.13/0.21/0.34/0.49/0.76), `from_char()`, `chi(lambda_bar, alpha)` — eq. 6.49 with cap at 1.0.
- [ ] Stub `column_buckling.rs`, `interaction_factors.rs`, `combined_n_m.rs`.
- [ ] Commit: `feat(en-1993-1-1-stability): BucklingCurve + StabilityCalc + chi`

### Task 6.2: column_buckling.rs (art. 6.3.1)

- [ ] Implement `n_b_rd(p, grade, length_y_m, length_z_m, curve_y, curve_z, force_state)`. Compute `λ = L_cr / i` for both axes, `λ̄ = λ / λ_1` where `λ_1 = π·√(E/fy)`, `χ` per axis, `N_b,Rd = χ · A · fy / γM1 × 10⁻³` (use lower of y/z).
- [ ] Include all intermediate λ_y, λ_z, λ̄_y, λ̄_z, χ_y, χ_z, χ values in StabilityCalc.intermediate_values.
- [ ] Commit: `feat(en-1993-1-1-stability): 6.3.1 column buckling N_b,Rd`

### Task 6.3: interaction_factors.rs (Annex B Method 2)

- [ ] Implement `InteractionFactors { k_yy, k_yz, k_zy, k_zz }` struct + `interaction_factors_method_2(...)`. Class 1/2: Tabel B.1 formulas with `Cm·(1 + (λ̄_y - 0.2)·n)` capped by `Cm·(1 + 0.8·n)`. `k_yz = 0.6·k_zz`, `k_zy = 0.6·k_yy`.
- [ ] Add `cm_uniform_or_psi(psi) = max(0.4, 0.6 + 0.4·psi)` helper.
- [ ] Commit: `feat(en-1993-1-1-stability): Annex B Method 2 interaction factors`

### Task 6.4: combined_n_m.rs (eqs 6.61 + 6.62)

- [ ] Implement `check_combined_n_my(...)`: `N_Ed/(χ_y·N_Rk/γM1) + k_yy·M_y,Ed/(χ_LT·M_y,Rk/γM1) + k_yz·M_z,Ed/(M_z,Rk/γM1) ≤ 1`.
- [ ] Implement `check_combined_n_mz(...)`: same with k_zy, k_zz around z-axis.
- [ ] Both return StabilityCalc with intermediate values for each term.
- [ ] Commit: `feat(en-1993-1-1-stability): 6.3.3 eqs 6.61 + 6.62`

---

## Phase 7 — nen-en-1993-1-1-ltb (LTB + NB-annex Mcr)

### Task 7.1: lib.rs + LateralBracing struct + m_b_rd skeleton

- [ ] Implement `LateralBracing { top_flange_positions: Vec<f64>, bottom_flange_positions: Vec<f64> }` (positions as 0..1 fractions).
- [ ] `m_b_rd(p, grade, length_m, bracing, m_y_ed_max_knm, m_y_ed_quarter, m_y_ed_half, force_state) -> StabilityCalc`.
- [ ] Compute L_st via `lambda_chi::unbraced_length_mm(length, bracing)`. Compute β = M_quarter/M_max. Compute (C1, C2) via NB.153. Compute S via NB.157, C via NB.159, k_red, M_cr via NB.148. Compute λ_LT, χ_LT (skip to 1.0 if λ_LT < 0.4 = λ_LT,0). M_b,Rd = χ_LT · Wpl,y · fy / γM1 × 10⁻⁶.
- [ ] Buckling curve b for rolled sections (h/b ≤ 2): α_LT = 0.34.
- [ ] Stub `nb_annex.rs` and `lambda_chi.rs`.
- [ ] Commit: `feat(en-1993-1-1-ltb): m_b_rd skeleton + LateralBracing`

### Task 7.2: nb_annex.rs (NB.148/153/157/159 + k_red)

- [ ] `s_parameter(h, e, iz, g, it) = (h/2) · √(E·Iz / (G·It))` — NB.157.
- [ ] `c1_c2_factors(beta, q) -> (f64, f64)`: `C1 = min(2.7, 1.88 - 1.40·β + 0.52·β²)`. C2=0 when q≈0, else 0.46. NB.153.
- [ ] `c_coefficient(c1, l_g, l_kip, s, c2)` — NB.159 formula: `(π·C1·L_g/L_kip)·√(1 + (π²·S²/L_kip²)·(C2²+1) + π·C2·S/L_kip)`.
- [ ] `k_red(h, tw)` — 1.0 if h/tw ≤ 75, else (75/ratio).max(0.5).
- [ ] `m_cr_i_section(c, l_g, iz, it, k_red)` — NB.148: `k_red · (C/L_g) · √(E·Iz · G·It) × 10⁻⁶`. E=210000, G=80769 MPa.
- [ ] **Test (acceptance critical)**: Calc 2 Beam 1 — h=160, Iz=8892613, It=313664, L=2500, β=0, C1=1.803 (use this exact value), C2=0 → S≈687, C≈7.481, M_cr≈650.886 kNm. `assert_relative_eq!(s, 687.0, max_relative=0.01)`, `c=7.481, max_relative=0.005`, `m_cr=650.886, max_relative=0.005`.
- [ ] Commit: `feat(en-1993-1-1-ltb): NB.148/153/157/159 + k_red, Calc 2 LTB intermediates verified`

### Task 7.3: lambda_chi.rs (λ_LT + χ_LT + unbraced_length)

- [ ] `unbraced_length_mm(length_m, bracing)`: returns longest gap between consecutive top-flange supports including beam ends.
- [ ] `lambda_lt(wpl_y, fy, m_cr_knm) = √(Wpl,y · fy / (M_cr × 10⁶))`. Returns ∞ if M_cr ≤ 0.
- [ ] `chi_lt(lambda_lt, alpha_lt)`: eq. 6.57 with β=0.75, λ̄_LT,0=0.4. `Φ_LT = 0.5·[1 + α_LT·(λ̄_LT - 0.4) + 0.75·λ̄_LT²]`. χ_LT = min(1.0, 1/(Φ_LT + √(Φ_LT² - 0.75·λ̄_LT²)), 1/λ̄_LT²).
- [ ] **Test**: λ_LT for Calc 2 Beam 1 = √(354113·235/650886230) ≈ 0.358.
- [ ] Commit: `feat(en-1993-1-1-ltb): lambda_lt + chi_lt + unbraced_length helpers`


---

## Phase 8 — steel-check (orchestrator)

### Task 8.1: BeamCheckInput / BeamCheckResult / NamedCheck types

**Files:** Modify `src-tauri/crates/steel-check/src/lib.rs`, create `src/{input,result,orchestrator,deflection}.rs`

- [ ] In `lib.rs`: declare modules + re-export key types.
- [ ] `input.rs`:
  ```rust
  pub enum DeflectionClass { Floor, Roof, Cantilever, Custom }
  pub struct BeamCheckInput {
    pub beam_id: u32, pub profile_name: String, pub steel_grade: String,
    pub length_m: f64, pub forces_envelope: Vec<ForcePoint>,
    pub lateral_bracing: LateralBracing,
    pub buckling_length_y_m: f64, pub buckling_length_z_m: f64,
    pub deflection_limit_class: DeflectionClass, pub deflection_limit_numerator: u32,
    pub deflection_actual_max_mm: f64, pub is_cantilever: bool,
    pub consequence_class: ConsequenceClass,
  }
  ```
  Use `mechanics::ForcePoint`, `nen_en_1993_1_1_ltb::LateralBracing`, `nen_en_1990::ConsequenceClass`. All with serde+ts-rs derives.
- [ ] `result.rs`:
  ```rust
  pub enum CheckKind { Resistance(ResistanceCalc), Stability(StabilityCalc) }
  pub struct NamedCheck { pub id: String, pub kind: CheckKind }
  pub struct BeamCheckResult {
    pub beam_id: u32, pub profile_name: String, pub steel_grade: String,
    pub classification: CrossSectionClass,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64, pub status: CheckStatus,
    pub governing_check_id: String,
  }
  ```
- [ ] Stub `orchestrator.rs` with `pub fn check_beam(input: BeamCheckInput) -> BeamCheckResult { todo!() }`.
- [ ] Stub `deflection.rs`.
- [ ] Commit: `feat(steel-check): BeamCheckInput / BeamCheckResult / NamedCheck types`

### Task 8.2: deflection.rs (SLS)

- [ ] `check_deflection(actual_mm, length_m, class, limit_numerator) -> ResistanceCalc`. Limit = length / numerator (default 333 for floor, 250 final, 150 cantilever). UC = actual / limit.
- [ ] Commit: `feat(steel-check): SLS deflection check helper`

### Task 8.3: orchestrator.rs (check_beam logic)

- [ ] Implement `check_beam(input)`:
  1. Look up profile via `steel_profiles::db().find(profile_name)` → return error if not found.
  2. Look up grade via `nen_en_1993_1_1_section::grade_by_name(steel_grade)`.
  3. Find governing force point (max |N|, max |M_y|, max |V_z| — track separately).
  4. Classify section using governing combo.
  5. Run all 6.2.x checks at relevant governing locations.
  6. Run 6.3.1 column buckling (uses full buckling lengths).
  7. Run 6.3.2 LTB (uses lateral_bracing + force_diagram).
  8. Compute interaction factors, run 6.3.3 (eqs 6.61 + 6.62).
  9. Run SLS deflection.
  10. Aggregate: max UC across all checks, governing check id, status.
- [ ] Order matches referentie: Compression, Bending decisive, Shear, M+V, M+N, LTB, 6.3.3 N+M, Deflection.
- [ ] `pub fn check_all_beams(inputs: Vec<BeamCheckInput>) -> Vec<BeamCheckResult>` — simple `inputs.into_iter().map(check_beam).collect()` (parallelize later with rayon).
- [ ] Commit: `feat(steel-check): orchestrator check_beam + check_all_beams`

### Task 8.4: ts-rs export verification

- [ ] Run `cd src-tauri && cargo test --workspace` — all unit tests pass + ts-rs generates files in `src/lib/types/steel/`.
- [ ] Verify generated TS files exist: `ls src/lib/types/steel/` shows `BeamCheckInput.ts`, `BeamCheckResult.ts`, `NamedCheck.ts`, etc.
- [ ] Commit (if any types generated/changed): `chore(types): regenerate TS types from Rust via ts-rs`

---

## Phase 9 — Tauri commands

### Task 9.1: list_steel_profiles + list_steel_grades commands

**Files:** Modify `src-tauri/src/lib.rs`

- [ ] Add `use steel_check::*; use steel_profiles::*;` etc imports.
- [ ] Add commands:
  ```rust
  #[tauri::command]
  fn list_steel_profiles() -> Vec<SteelProfile> {
      steel_profiles::db().all().to_vec()
  }
  #[tauri::command]
  fn list_steel_grades() -> Vec<SteelGrade> {
      vec![S235, S275, S355, S420, S460]
  }
  ```
- [ ] Register in `Builder::default().invoke_handler(tauri::generate_handler![list_steel_profiles, list_steel_grades])`.
- [ ] Commit: `feat(tauri): add list_steel_profiles + list_steel_grades commands`

### Task 9.2: check_steel_beams command

- [ ] Add command:
  ```rust
  #[tauri::command]
  async fn check_steel_beams(inputs: Vec<BeamCheckInput>) -> Result<Vec<BeamCheckResult>, String> {
      Ok(steel_check::check_all_beams(inputs))
  }
  ```
- [ ] Add to `invoke_handler`. Add capability to `src-tauri/capabilities/default.json` if needed (`"core:default"` should cover it; otherwise add `"shell:allow-execute"` style entries — verify by running tauri:dev).
- [ ] Commit: `feat(tauri): add check_steel_beams batch command`

### Task 9.3: cargo-test full workspace

- [ ] Run `cd src-tauri && cargo test --workspace --all-features` → ALL tests pass (~30+ unit tests across crates).
- [ ] Run `cd src-tauri && cargo build` → binary builds.
- [ ] Commit: nothing (verification only)

---

## Phase 10 — Acceptance integration tests (the 7 reference beams)

### Task 10.1: calc2_beam1.rs (HEB160 S235 — page 50-52)

**Files:** Create `src-tauri/crates/steel-check/tests/calc2_beam1.rs`

- [ ] Build BeamCheckInput from referentie Calc 2 PDF: profile=HEB160, grade=S235, length=5.0 m, forces_envelope from PDF (3 force points: x=0 combo 2, x=2500 combo 2, x=2500 combo 1), lateral_bracing=empty, buckling_length=5.0 both axes, deflection_class=Floor 333.
- [ ] Run `check_beam(input)`. Verify with assert_relative_eq:
  - compression: value=1275.472 (max_rel=1e-3), uc=0.18 (max_rel=0.01), status=Ok
  - bending_y: value=83.217 (max_rel=1e-3), uc=1.06 (max_rel=0.005), status=NotOk
  - shear_z: value=239.1 (max_rel=1e-3), uc=0.15 (max_rel=0.01)
  - LTB: M_cr intermediate=650.886 (max_rel=0.005), λ_LT=0.358 (max_rel=0.01), χ_LT=1.0
  - uc_max=1.06, governing_check_id="6.2.5_bending_y"
- [ ] Use shared OnceLock fixture pattern (build input once, run check once, query result in each test fn).
- [ ] Commit: `test(steel-check): calc2_beam1 acceptance — HEB160 S235`

### Task 10.2: calc2_beam2.rs (HEB160 S235 — page 53)

- [ ] Read referentie Calc 2 PDF page 53 for Beam 2 inputs (similar structure to Beam 1 but different forces). Use `pdftotext -layout` on calc2.pdf, extract section 2.6.2.
- [ ] Build BeamCheckInput, run check_beam, verify all UC values from PDF match.
- [ ] Commit: `test(steel-check): calc2_beam2 acceptance`

### Task 10.3: calc2_beam3.rs (HFRHS200X200X16 S235 — page 57)

- [ ] Read referentie Calc 2 PDF page 57 for Beam 3 (hollow section). Note: no LTB applies for closed hollow (M_b,Rd should equal M_c,Rd).
- [ ] Build input, verify all UCs.
- [ ] Commit: `test(steel-check): calc2_beam3 acceptance — HFRHS hollow section`

### Task 10.4-10.7: portal_beam1..4 tests

- [ ] Run `pdftotext -layout` on portal-frame.pdf, extract 2.6.1 (UNP350), 2.6.2 (HEB160), 2.6.3 (HEB160), 2.6.4 (HEB300).
- [ ] One test file per beam, same pattern as Task 10.1.
- [ ] Special attention for portal_beam1 (UNP350): channel section asymmetry affects LTB Mcr formula — verify Channel-specific S/C results match referentie.
- [ ] Commit per file: `test(steel-check): portal_beamN acceptance — <PROFILE>`

### Task 10.8: insta snapshot tests

**Files:** Create `src-tauri/crates/steel-check/tests/snapshots/calc2_beam1.json` (etc) golden files via first run.

- [ ] Add snapshot tests to each calc2/portal test file:
  ```rust
  #[test] fn calc2_beam1_snapshot() {
      insta::assert_json_snapshot!(run_calc2_beam1());
  }
  ```
- [ ] Run `cargo insta review --workspace` to accept initial snapshots.
- [ ] Commit golden files: `test(steel-check): insta snapshots for 7 reference beams`


---

## Phase 11 - TS state additions

### Task 11.1: IBeamSteelConfig type + state fields

Files: Modify src/context/FEMContext.tsx

- [ ] Add interface IBeamSteelConfig per spec section 5.3 (beamId, profileName, steelGrade, lateralBracing top/bottom positions, bucklingLengthY/Z, deflectionClass, deflectionLimitNumerator, isCantilever).
- [ ] Import generated BeamCheckResult from ./lib/types/steel/BeamCheckResult.
- [ ] Add to FEMState: beamSteelConfigs Map, steelCheckResults array or null, steelCheckError string or null, steelCheckAutoRun bool.
- [ ] Initial: empty Map, null, null, true.
- [ ] Commit: feat(state) IBeamSteelConfig + steelCheckResults state fields

### Task 11.2: Reducer actions

- [ ] Add 5 actions: SET_BEAM_STEEL_CONFIG, SET_STEEL_CHECK_RESULTS, CLEAR_STEEL_CHECK_RESULTS, SET_STEEL_CHECK_ERROR, SET_STEEL_CHECK_AUTO_RUN.
- [ ] Reducer cases handle each. SET_AUTO_RUN persists to localStorage fem2d-steel-autorun.
- [ ] On init: read localStorage to set initial steelCheckAutoRun.
- [ ] Commit: feat(state) reducer actions for beam steel config + check results

### Task 11.3: ProjectSerializer v1.1.0 with backwards compat

Files: Modify src/core/io/ProjectSerializer.ts

- [ ] Bump version to 1.1.0. Add beamSteelConfigs optional array field.
- [ ] In serializeProject: include Array.from(state.beamSteelConfigs.values()).
- [ ] In deserializeProject: if version 1.0.0 or field missing, init empty Map. If 1.1.0, rebuild Map.
- [ ] Commit: feat(io) ProjectSerializer v1.1.0 with beamSteelConfigs


---

## Phase 12 - Frontend components

### Task 12.1: Install KaTeX
- [ ] Run: npm install katex@^0.16 @types/katex
- [ ] Commit: chore(deps) add katex 0.16 + types

### Task 12.2: CheckBlock component (KaTeX renderer)
Files: Create src/components/ReportPanel/sections/CheckBlock.tsx + .css

- [ ] CheckBlock takes props from a single check (title, article, forceState, formulaLatex, variables, value, unit, uc, status, notes, intermediateValues).
- [ ] Render structure referentie-style: title + article (top right), force state line, KaTeX formula, variables expanded with arithmetic, UC formula with values, status badge, intermediate values list, notes (italic).
- [ ] Use katex.renderToString(formulaLatex) then dangerouslySetInnerHTML.
- [ ] CSS: OpenAEC styling, Space Grotesk h3 for title, JetBrains Mono for numbers, amber accent.
- [ ] Commit: feat(report) CheckBlock with KaTeX formula rendering

### Task 12.3: EN1993Tab in BarPropertiesDialog
Files: Create src/components/BarPropertiesDialog/EN1993Tab.tsx + .css, modify BarPropertiesDialog.tsx

- [ ] EN1993Tab content per Steel Properties.png reference: Steel grade dropdown, Cantilever checkbox, Consequence class dropdown, Lateral-torsional buckling section (Number/Distances/Node Numbers radio for top + bottom flange, as-top-flange copy checkbox), Buckling section (length Y/Z with override checkbox), Deflection (enabled, Type dropdown Floor/Roof/Cantilever/Custom, Additional/Final/Pre-camber inputs), Input-per-beam bulk-apply checkbox.
- [ ] OK button dispatches SET_BEAM_STEEL_CONFIG for selected beam(s).
- [ ] In BarPropertiesDialog.tsx: introduce activeTab state with tab buttons styled per OpenAEC.
- [ ] Commit: feat(properties) EN 1993 tab in BarPropertiesDialog

### Task 12.4: SteelCheckPanel sidebar
Files: Create src/components/SteelCheckPanel/SteelCheckPanel.tsx + .css

- [ ] Render per spec section 6.3: header with title + close button, stats (Total, OK, NotOk counts), card list per beam with id, profile (grade), big UC right-side in JetBrains Mono, status icon, governing check label.
- [ ] Click card dispatches SET_SELECTION to highlight beam in MeshEditor.
- [ ] Empty state when no results.
- [ ] Commit: feat(panel) SteelCheckPanel sidebar with click-to-highlight

### Task 12.5: EN1993SummarySection (report)
Files: Create src/components/ReportPanel/sections/EN1993SummarySection.tsx

- [ ] Render table: Beam, Profile, Grade, Class, UC_max, Governing, Status. Row colored amber-ish on NotOk.
- [ ] Get data from state.steelCheckResults. Empty state if null.
- [ ] Commit: feat(report) EN1993SummarySection table

### Task 12.6: EN1993CalculationsSection (report)
Files: Create src/components/ReportPanel/sections/EN1993CalculationsSection.tsx

- [ ] For each result in state.steelCheckResults, render a .report-page div with H2 like 2.6.N Beam {id} - {profile} ({grade}) and a CheckBlock per check.
- [ ] Commit: feat(report) EN1993CalculationsSection with per-beam derivation

### Task 12.7: ReportSection wiring
Files: Modify src/core/report/ReportConfig.ts, src/components/ReportPanel/ReportPreview.tsx

- [ ] Add en1993_summary and en1993_calculations to ReportSectionType union + DEFAULT_REPORT_CONFIG sections (enabled true).
- [ ] Add to ReportPreview.tsx SECTION_COMPONENTS map.
- [ ] i18n: report.en1993Summary and report.en1993Calculations in 6 locales.
- [ ] Commit: feat(report) wire EN 1993 sections into ReportPreview

### Task 12.8: Check ribbon-tab
Files: Modify src/components/Ribbon/Ribbon.tsx

- [ ] Add check to RibbonTab type. Add tab button between IFC and Report.
- [ ] Add ribbon content for check tab: 3 RibbonGroups - Run check (large button Run all, icon ShieldCheck, disabled when state.result is null), View (toggle SteelCheckPanel visibility), Settings (Auto-run checkbox bound to state.steelCheckAutoRun).
- [ ] Add i18n keys: ribbon.check, ribbon.check.run, ribbon.check.autoRun, ribbon.check.viewPanel.
- [ ] Commit: feat(ribbon) Check tab with Run/View/AutoRun groups

### Task 12.9: buildSteelCheckInputs helper
Files: Create src/lib/steelCheckBuilder.ts

- [ ] Pure function buildSteelCheckInputs(mesh, configs, result, projectInfo) returns BeamCheckInput[]:
  - Filter mesh.beamElements for steel beams (heuristic: profile prefix HE/IPE/UPE/UNP/RHS/SHS/HFRHS/KKR)
  - Resolve config (state value OR sensible default: empty bracing, length-based bucking length, Floor 333, CC1, S235)
  - Extract force envelope from result
  - Return BeamCheckInput per ts-rs generated type
- [ ] Export defaultConfigForBeam(beam, mesh).
- [ ] Commit: feat(lib) steelCheckBuilder + default config

### Task 12.10: Wire auto-run + manual trigger in App.tsx
Files: Modify src/App.tsx

- [ ] Import invoke from @tauri-apps/api/core, buildSteelCheckInputs, BeamCheckResult.
- [ ] Add async handleRunSteelChecks: build inputs, invoke check_steel_beams, dispatch results or error.
- [ ] In existing solver-completion handler, after SET_RESULT, if state.steelCheckAutoRun: await handleRunSteelChecks.
- [ ] Pass onRunSteelChecks prop to Ribbon.
- [ ] Render SteelCheckPanel conditionally based on showSteelCheckPanel state (default true when results exist).
- [ ] Add escape handler case for SteelCheckPanel close.
- [ ] Commit: feat(app) wire auto-run + manual trigger + SteelCheckPanel rendering

### Task 12.11: i18n keys (6 locales)
Files: Modify src/i18n/{en,nl,es,fr,it,zh}.ts

- [ ] Add about 25 keys per locale: ribbon.check.*, check.panel.*, check.status.*, check.governing, beam.props.en1993, beam.props.steelGrade, beam.props.cantilever, beam.props.consequenceClass, beam.props.lateralBracing.*, beam.props.bucklingLength.*, beam.props.deflection.*, beam.props.inputPerBeam, report.en1993Summary, report.en1993Calculations, settings.checks.title, settings.checks.autoRun.
- [ ] NL/EN authoritative, ES/FR/IT/ZH best-effort.
- [ ] Commit: feat(i18n) EN 1993 check keys for 6 locales

### Task 12.12: SettingsDialog auto-run toggle
Files: Modify src/components/SettingsDialog/SettingsDialog.tsx

- [ ] Add new Checks section with Auto-run-after-solver checkbox bound to state.steelCheckAutoRun via dispatch SET_STEEL_CHECK_AUTO_RUN.
- [ ] Commit: feat(settings) add Checks section with auto-run toggle

### Task 12.13: Phase 12 verification
- [ ] npx tsc --noEmit PASS.
- [ ] npm run tauri:dev opens app, Ribbon shows Check tab, BarPropertiesDialog has EN 1993 tab, no console errors.
- [ ] No commit.


---

## Phase 13 - Verify-iterate loop (THE acceptance phase)

This is where we close the loop: build real test fixtures, run end-to-end, generate PDFs, diff against referentie originals, fix any discrepancies, repeat until match.

### Task 13.1: Build calc2.femp fixture
Files: Create tests/fixtures/calc2.femp

- [ ] Open npm run tauri:dev. Build the Calc 2 model manually: 3 beams matching referentie Calc 2 layout (read pages 2-4 of the PDF for exact node coords, beam connectivity, profiles, supports).
- [ ] Add load cases per PDF pages 5-6: Dead load (with self-weight), Live load.
- [ ] Set per-beam EN 1993 config (lateral bracing 0, S235 grade) for each of the 3 beams.
- [ ] Save project as tests/fixtures/calc2.femp.
- [ ] Commit: test(fixtures) add calc2.femp matching referentie Calc 2 model

### Task 13.2: Build portal_frame.femp fixture
- [ ] Same as 13.1 but for portal-frame.pdf - 4 beams (UNP350, HEB160 x2, HEB300).
- [ ] Save as tests/fixtures/portal_frame.femp.
- [ ] Commit: test(fixtures) add portal_frame.femp matching referentie model

### Task 13.3: First end-to-end test (Calc 2)
- [ ] Open tests/fixtures/calc2.femp in tauri:dev.
- [ ] Solve the model.
- [ ] Auto-run triggers, SteelCheckPanel shows results.
- [ ] Verify panel shows 3 beams with UC values matching referentie:
  - Beam 1: UC about 1.06 (governing 6.2.5 bending)
  - Beam 2: UC value per PDF page 53
  - Beam 3: UC value per PDF page 57
- [ ] Open Report tab, scroll to EN 1993 Calculations section, verify per-beam derivation matches referentie layout.
- [ ] DOCUMENT discrepancies (if any) in docs/verification/iteration-log.md.
- [ ] Commit verification log: docs(verification) first iteration end-to-end log for calc2

### Task 13.4: Generate PDF and compare against referentie
- [ ] In Report tab, Print to PDF (Ctrl+P, Save as PDF). Save as tests/output/calc2-iteration-1.pdf.
- [ ] Open both PDFs side-by-side: verificatie calculations/original/Calc 2.pdf vs tests/output/calc2-iteration-1.pdf.
- [ ] Visual + numeric diff: header, footer, all UC values per beam, intermediate values for LTB.
- [ ] Document EVERY discrepancy in docs/verification/iteration-log.md with location, referentie value vs Our value, hypothesized cause.
- [ ] Commit: docs(verification) calc2 iteration-1 PDF diff log

### Task 13.5: Iteration loop - fix discrepancies
For each discrepancy in iteration-log.md:
- [ ] Identify the responsible Rust crate (e.g., NB.153 C1 formula for LTB).
- [ ] Write a failing unit test in that crate using the referentie value as expected.
- [ ] Fix the implementation. Test passes.
- [ ] Re-run the orchestrator, BeamCheckResult should now match.
- [ ] Update iteration-log.md: mark the discrepancy resolved, note the fix commit.
- [ ] Commit per fix: fix(crate-name) align function-name with referentie value-N (issue from calc2 iter 1)
- [ ] Re-generate PDF after each batch of fixes, new iteration: tests/output/calc2-iteration-N.pdf.

Continue until ALL 7 reference beams UC values match referentie within tolerance (max_relative 0.01).

### Task 13.6: Per-beam verification log files
- [ ] For each of the 7 acceptance beams, create docs/verification/{calc2|portal}-beamN.md:
  - Brief summary of beam (profile, grade, length, key forces)
  - For each check (6.2.4, 6.2.5, ..., LTB, 6.3.3): referentie value | Our value | Difference | Status
  - Reference to the integration test file
  - Notes on any approximations or known minor deviations
- [ ] Commit: docs(verification) per-beam verification logs for 7 acceptance beams

### Task 13.7: Final acceptance - green CI run
- [ ] cd src-tauri && cargo test --workspace - all unit tests + 7 integration tests + 7 snapshot tests pass.
- [ ] npx tsc --noEmit PASS.
- [ ] npm run tauri:build - produces .msi installer with steel checks enabled.
- [ ] Install MSI on a clean session (or run release binary directly), open both fixture .femp files, verify checks produce expected UCs in the GUI.
- [ ] Commit (memory updates): chore(memory) update memory files with EN 1993 engine details
- [ ] Tag: git tag -a v1.1.0-en1993 -m "EN 1993-1-1 steel check engine - Calc 2 + portal-frame reproduced"

---

## Cross-phase notes

### Stop and resume
After each phase commit, can stop. Resume by reading the plan + last commit message + spec.

### Iteration philosophy
Phase 13 verify-iterate is where implementation correctness is proven. Do not declare done until the PDFs match. If a formula needs revisiting (e.g., C1/C2 from NB.153 needs more precise table interpolation), log the issue, fix the crate, re-test. Each fix should add a test case that pins the correct value forever.

### Tolerance philosophy
- Resistance values (kN/kNm): match referentie to 0.1% (3 significant decimals)
- Unity checks: match to 1% (referentie rounds to 2 decimals)
- LTB intermediates (S, C, M_cr): match to 0.5%
- Status verdict (Ok/NotOk): exact

### Common-cause discrepancy fixes (in priority order)
1. C1 from NB.153 table interpolation - Calc 2 uses C1=1.803 for beta=0; my formula gives 1.88. Likely needs the actual NB.153 table (not the simplified formula). Implement lookup table.
2. k_red threshold - currently 75 from spec; verify against actual NEN-EN 1993-1-1 NB Tabel.
3. Cm factor (interaction factors) - 6.3.3 uses Cm depending on moment shape. Default Cm=0.9 might be wrong; needs psi-based formula per Tabel B.3.
4. Section properties from catalog vs computed - minor differences in Wpl, Av - tighten section-properties tests.
5. Sign conventions - solver vs EN convention for N/M may differ; verify with absolute values.

