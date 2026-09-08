# openaec-mcp-server

Model Context Protocol (MCP) server that exposes the **Open FEM2D Studio** /
**OpenAEC** check engines and the 2D FEM solver to MCP clients (Claude Desktop,
Claude Code, etc.). It speaks JSON-RPC 2.0 over stdio and wraps the same
Rust crates the Tauri desktop app uses, so a tool call from Claude returns
byte-identical results to clicking through the UI.

Twenty-two tools in five groups:

| group | tools |
|---|---|
| steel — EN 1993-1-1 | `list_steel_profiles`, `list_steel_grades`, `check_steel_beam`, `compute_section_properties` |
| timber — EN 1995-1-1 | `list_timber_grades`, `check_timber_beams`, `list_clt_presets`, `check_clt_beams` |
| concrete — EN 1992-1-1 | `list_concrete_classes`, `list_reinforcement_grades`, `check_concrete_beam`, `concrete_mn_kappa`, `concrete_segment_stiffness`, `concrete_effective_flange_width`, `list_exposure_classes`, `concrete_cover_check` |
| 2D FEM solver | `fem_solver_status`, `validate_fem_model`, `load_fem_project`, `solve_fem_model`, `check_fem_model` |
| reporting | `generate_steel_report_pdf` |

`generate_steel_report_pdf` sits in its own group on purpose: the name is
historical, but the report carries steel, timber, cross-laminated timber,
concrete and the norm-independent stress check. Filing it under steel would
suggest it only renders EN 1993-1-1.

**De drie wegen.** Elke rekenkern in dit project hoort langs drie wegen
bereikbaar te zijn: een Tauri-command (de desktop-app), een opdracht in
`crates/toetsbrug` (de dev-server) en deze MCP-server. Voor beton bestonden
alleen de eerste twee; sinds september 2026 is de derde er ook.
`tests/drie_wegen_beton.rs` stuurt dezelfde JSON door alle drie de wegen en
eist dat de antwoorden veld voor veld gelijk zijn. Voor staal bestaat zo'n
vergelijking nog niet.

Not exposed: timber (EN 1995), cross-laminated timber, the free stress check,
fillet welds — die zijn wel via de Tauri-commands en de toetsbrug bereikbaar.

## Build

The server lives in the same Cargo workspace as the rest of OpenAEC.

```bash
cd src-tauri
cargo build --release -p openaec-mcp-server
```

The binary is produced at:

```
src-tauri/target/release/openaec-mcp-server         # Linux/macOS
src-tauri/target/release/openaec-mcp-server.exe     # Windows
```

The binary is fully self-contained (the steel-profile catalogue and PDF fonts
are baked in via `include_bytes!`). No data files need to ship alongside it.

## Wire it into Claude Desktop / Claude Code

Add an entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openaec-fem": {
      "command": "C:\\Users\\you\\path\\to\\target\\release\\openaec-mcp-server.exe"
    }
  }
}
```

The config file lives at:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Restart Claude Desktop after editing. All fourteen tools should appear in
the tools picker.

To raise the log level (logs go to **stderr** so they never collide with
JSON-RPC traffic on stdout), set the env var `OPENAEC_MCP_LOG=debug`:

```json
{
  "mcpServers": {
    "openaec-fem": {
      "command": "C:\\path\\to\\openaec-mcp-server.exe",
      "env": { "OPENAEC_MCP_LOG": "debug" }
    }
  }
}
```

## Tools

All tool I/O matches the existing `ts-rs`-generated TypeScript types in
`src/lib/types/steel/` and `src/lib/types/concrete/`, so the same JSON shapes
work for both Tauri and MCP callers.

### `list_steel_profiles`

Returns every profile in the catalogue (HEA, HEB, HEM, IPE, UNP, RHS, SHS,
CHS) with geometry, section properties, and EN 1993-1-1 buckling curves.

**Request**:
```json
{ "name": "list_steel_profiles", "arguments": {} }
```

**Response** (truncated):
```json
{
  "profiles": [
    {
      "name": "HEA200",
      "kind": "ISection",
      "geometry": { "h": 190, "b": 200, "tw": 6.5, "tf": 10, "r": 18 },
      "properties": { "area_mm2": 5380, "iy_mm4": 36900000, ... },
      "buckling_curves": { "y_axis": "b", "z_axis": "c" }
    },
    ...
  ]
}
```

### `list_steel_grades`

Returns the supported EN 10025 grades and their material constants.

**Request**:
```json
{ "name": "list_steel_grades", "arguments": {} }
```

**Response**:
```json
{
  "grades": [
    { "name": "S235", "fy_mpa": 235, "fu_mpa": 360,
      "gamma_m0": 1.0, "gamma_m1": 1.0, "gamma_m2": 1.25 },
    ...
  ]
}
```

### `check_steel_beam`

Runs the full §6.2 cross-section + §6.3 stability + SLS-deflection check on
one beam. Input matches `BeamCheckInput` exactly; output matches
`BeamCheckResult` exactly (including all derivation steps with LaTeX
formulae, intermediate values, and unity-check ratios per check).

**Minimal request**:
```json
{
  "name": "check_steel_beam",
  "arguments": {
    "beam_id": 1,
    "profile_name": "HEA200",
    "steel_grade": "S235",
    "length_m": 5.0,
    "forces_envelope": [
      { "combination_id": 1, "position_mm": 0,
        "forces": { "n_ed": -100, "vy_ed": 0, "vz_ed": 25,
                    "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } },
      { "combination_id": 1, "position_mm": 2500,
        "forces": { "n_ed": -100, "vy_ed": 0, "vz_ed": 0,
                    "mt_ed": 0, "my_ed": 31.25, "mz_ed": 0 } },
      { "combination_id": 1, "position_mm": 5000,
        "forces": { "n_ed": -100, "vy_ed": 0, "vz_ed": -25,
                    "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } }
    ],
    "lateral_bracing": { "top_flange_positions": [], "bottom_flange_positions": [] },
    "buckling_length_y_m": 5.0,
    "buckling_length_z_m": 5.0,
    "deflection_limit_class": "Floor",
    "deflection_limit_numerator": 250,
    "deflection_actual_max_mm": 8.0,
    "is_cantilever": false,
    "consequence_class": "CC2"
  }
}
```

`deflection_limit_class` kiest de NB-categorie voor de **bijkomende**
doorbuiging w_add (= w2 + w3), volgens NEN-EN 1990:2002/NB:2019 A1.4.3(3):

| klasse | grens voor w_add | NB-categorie |
|---|---|---|
| `Floor` | 3/1 000 · ℓ_rep | overige vloeren en daken die intensief door personen worden gebruikt (2e streepje) |
| `FloorBrittlePartitions` | ℓ_rep/500 | vloeren die scheurgevoelige scheidingswanden dragen (1e streepje) |
| `Roof` | ℓ_rep/250 | overige daken (3e streepje) |
| `Cantilever` | als `Floor`, maar met ℓ_rep = 2 × de uitkraaglengte | verklaring bij ℓ_rep |
| `Custom` | de opgegeven `deflection_limit_numerator`, op de staaflengte | geen |

Het optionele veld `deflection_add_limit_numerator` (default 0 = de tabel
hierboven) overschrijft die noemer en rekent op de staaflengte. Gebruik het
alleen om een externe referentie-uitwerking met een vaste noemer na te rekenen;
het antwoord vermeldt dan in `notes` dat de noemer is opgegeven en niet uit de
norm volgt.

**Response shape**:
```json
{
  "beam_id": 1,
  "profile_name": "HEA200",
  "steel_grade": "S235",
  "classification": "Class1",
  "checks": [ ... 12 NamedCheck entries ... ],
  "uc_max": 0.42,
  "status": "Ok",
  "governing_check_id": "EN1993-1-1_6.3.3_NMy"
}
```

### `compute_section_properties`

Recomputes section properties from the catalogue **geometry** (so the result
is independent of the catalogue's stored property values — useful for
spot-checking). Dispatches to `i_section_props`, `channel_section_props`, or
`rhs_section_props` based on `ProfileKind`. CHS profiles fall back to
catalogue values (no analytical helper exists yet — see "Known limitations").

**Request**:
```json
{ "name": "compute_section_properties", "arguments": { "profile_name": "HEA200" } }
```

**Response**: a `SectionProperties` object — `area_mm2`, `iy_mm4`, `iz_mm4`,
`wel_y_mm3`, `wpl_y_mm3`, `it_mm4`, `iw_mm6`, `iy_radius_mm`, etc.

### `generate_steel_report_pdf`

Renders a complete constructive-check PDF report (OpenAEC-branded, A4 portrait,
multi-page) from check results — typically the output of one or more prior
`check_steel_beam` / `check_concrete_beam` calls. Returns the PDF as base64
because MCP transports JSON, not binary.

Despite the name, the report is material-neutral. Five result arrays feed it:
`steel_check_results` (EN 1993-1-1), `timber_check_results` (EN 1995-1-1),
`clt_check_results` (EN 1995-1-1, cross-laminated timber), `concrete_check_results`
(EN 1992-1-1) and `stress_check_results` (no standard — von Mises against an
allowable stress). Only `steel_check_results` is schema-required; for a report
without steel, pass it as `[]`. The cover and the page header name **only** the
standards actually present, and claim none when nothing was checked.

`concrete_stiffness_trace` is optional as well and adds the chapter "Beton —
fysisch niet-lineaire tweede orde": per load combination the assumptions
(analysis type, segment length, number of rounds, convergence criterion with
the value reached), the segment stiffness table per member, and the four
concrete figures — cross-section with cage, M-κ, N-M interaction and the EI
distribution along the member. Its shape mirrors
`design-mockup/src/stores/betonStijfheidStore.ts`; see `report::betonspoor`.
Omit it and the chapter states, honestly, that no physically non-linear round
was run.

**Request**:
```json
{
  "name": "generate_steel_report_pdf",
  "arguments": {
    "project_name":   "Demo Project",
    "project_number": "P-2026-001",
    "engineer":       "M. Vroegindeweij",
    "company":        "OpenAEC Foundation",
    "date":           "2026-05-16",
    "steel_check_results": [ /* BeamCheckResult objects; [] for a report without steel */ ],
    "timber_check_results":     [ /* optional TimberBeamCheckResult objects */ ],
    "clt_check_results":        [ /* optional CltBeamCheckResult objects */ ],
    "concrete_check_results":   [ /* optional ConcreteBeamCheckResult objects */ ],
    "stress_check_results":     [ /* optional SpanningBeamCheckResult objects */ ],
    "concrete_stiffness_trace": { /* optional BetonStijfheidSpoor */ }
  }
}
```

**Response**:
```json
{
  "pdf_base64": "JVBERi0xLjcK...",
  "byte_count": 124852
}
```

Decode the base64 and write to disk to view. The PDF renders the OpenAEC
header/footer, a project information block, and one section per beam with all
checks, formulae and unity-check ratios.

## Concrete tools (EN 1992-1-1)

Same engine as the Tauri commands `list_concrete_classes`,
`list_reinforcement_grades`, `check_concrete_beams` and `concrete_mn_kappa`, and
as the toetsbrug opdrachten of those names: `concrete_check` is called directly,
so there is no second implementation. `check_concrete_beam` is **singular** here
and takes one beam, exactly like `check_steel_beam`; the other two ways take a
list. Input and output types are identical (`ConcreteBeamCheckInput` /
`ConcreteBeamCheckResult`, `MnKappaRequest` / `MnKappaResponse`).

Scope today: a rectangular section `b × h` with a cage (cover, stirrup, one top
row and one bottom row), checked for bending with the rectangular stress block
(§3.1.7(3)) and for bending **with axial force** through the M-N-κ relation,
including the minimum eccentricity of §6.1(4). **Not** included: shear, torsion,
crack width, deflection, second-order effects.

### `list_concrete_classes` / `list_reinforcement_grades`

```json
{ "name": "list_concrete_classes", "arguments": {} }
```

Return `{ "classes": [ … ] }` and `{ "grades": [ … ] }`. The list is wrapped in
an object because `structuredContent` must be an object; the array inside is the
same one the other two ways return bare.

### `check_concrete_beam`

`n_strips` (50), `steel_branch` (`"Horizontal"`), `design_situation`
(`"PersistentTransient"`) and `apply_min_eccentricity` (`true`) may be omitted;
everything else is required. The schema is complete and strict
(`additionalProperties: false`), mirroring `#[serde(deny_unknown_fields)]`: a
typo in a field name is an error, not a silent fallback.

```json
{
  "name": "check_concrete_beam",
  "arguments": {
    "beam_id": 7,
    "width_mm": 300,
    "height_mm": 500,
    "concrete_class": "C30/37",
    "reinforcement_grade": "B500B",
    "cage": {
      "cover_mm": 30,
      "stirrup_diameter_mm": 8,
      "top":    { "count": 2, "diameter_mm": 12 },
      "bottom": { "count": 3, "diameter_mm": 16 }
    },
    "length_m": 5,
    "forces_envelope": [
      { "combination_id": 1, "position_mm": 2500,
        "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0,
                    "mt_ed": 0, "my_ed": 100, "mz_ed": 0 } }
    ]
  }
}
```

Response (`ConcreteBeamCheckResult`, abridged) — these are the numbers all three
ways produce for this input:

```json
{
  "beam_id": 7,
  "section_name": "300 x 500",
  "reinforcement_summary": "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm",
  "d_mm": 454.0,
  "f_cd_mpa": 20.0,
  "f_yd_mpa": 434.7826086956522,
  "checks": [ "6.1_bending_stress_block", "6.1_mn_kappa" ],
  "uc_max": 0.8839946123262402,
  "status": "Ok",
  "governing_check_id": "6.1_mn_kappa",
  "mn_kappa": { "n_kn": 0.0, "m_max_knm": 113.12286139035288, "failure_mode": "ConcreteCrushing" },
  "interaction_positive": [ /* 21 points */ ],
  "interaction_negative": [ /* 21 points */ ]
}
```

An unknown strength class or a cage that does not fit the section does **not**
throw: the result comes back with `governing_check_id` = `"ERROR: …"` and an
empty `checks` list. Check that field before reading `uc_max`.

### `concrete_mn_kappa`

The M-N-κ diagram of one cage without a beam or a force envelope — what the
reinforcement editor draws. `n_ed_kn` is **tension-positive**, so a compressed
column takes a negative value.

```json
{
  "name": "concrete_mn_kappa",
  "arguments": {
    "width_mm": 300, "height_mm": 500,
    "concrete_class": "C30/37", "reinforcement_grade": "B500B",
    "cage": { "cover_mm": 30, "stirrup_diameter_mm": 8,
              "top": { "count": 2, "diameter_mm": 12 },
              "bottom": { "count": 3, "diameter_mm": 16 } },
    "n_ed_kn": -800,
    "interaction_points": 11
  }
}
```

Response (abridged): `n_rd_compression_kn` = 3331.7521842190818,
`n_rd_tension_kn` = 360.6002002381328, `diagram.m_max_knm` =
235.12985457846818, `diagram.kappa_u_per_m` = 0.017642178136855355,
`diagram.failure_mode` = `"ConcreteCrushing"`, 61 diagram points and 11
interaction points per moment direction.

Unlike `check_concrete_beam`, an invalid request here **is** a tool error
(`isError: true`) with the reason — an empty diagram would read as "no
capacity".

## Architecture

- **Transport**: newline-delimited JSON-RPC 2.0 on stdin/stdout. One message
  per line.
- **Protocol**: implements `initialize`, `notifications/initialized`,
  `tools/list`, `tools/call`, and `ping`. Other methods return -32601.
- **Concurrency**: each request is dispatched on its own `tokio::spawn`, so a
  long-running PDF render does not block subsequent reads. CPU-bound work
  (the steel-check orchestrator and PDF generation) runs on
  `tokio::task::spawn_blocking` so it does not starve the I/O scheduler.
- **Error mapping**: malformed request → `-32700`, unknown method → `-32601`,
  invalid `tools/call` params → `-32602`. Per the MCP spec, **tool execution
  errors** (e.g. unknown profile name, malformed `BeamCheckInput`) are
  returned in `result.isError = true` rather than as JSON-RPC errors, so the
  model can read them and self-correct.
- **Logging**: `tracing` to stderr. Set `OPENAEC_MCP_LOG=debug` for verbose
  output.

## Test

```bash
cargo test -p openaec-mcp-server
```

| test | what it pins down |
|---|---|
| `stdio_roundtrip.rs` | the full handshake against the real binary: `initialize` → `notifications/initialized` → `tools/list` → `tools/call`, and the complete tool roster |
| `schema_strikt.rs` | the input schemas of `check_steel_beam`, `check_concrete_beam` and `concrete_mn_kappa` are complete and strict; a typo in a field name is refused, not silently defaulted |
| `drie_wegen_beton.rs` | **the three ways give the same answer**: the same JSON through the Tauri command's engine call, through `toetsbrug::behandel` and through the real MCP binary, compared field by field, plus anchor values so all three cannot drift together |
| `beton_in_check_fem_model.rs` | a concrete beam in a mixed model is reported in `skipped_beams` instead of vanishing; `beam_ids` is respected; a model carrying a reinforcement cage is refused by the field gate |
| `fem_golden.rs`, `sidecar.rs`, `fout_paden.rs` | the FEM chain: golden values, the Node sidecar, and the error paths |

`beton_in_check_fem_model.rs` and the FEM tests need Node ≥ 20, because the
solve runs in the Node sidecar; they fail with that message rather than skipping
silently. The steel and concrete check tools run entirely in Rust, so
`schema_strikt.rs` and `drie_wegen_beton.rs` need nothing beyond cargo.

## Known limitations

- **`check_fem_model` checks steel only.** The solve covers every beam —
  `resolveSection` knows concrete (E_cm on an uncracked rectangular section) and
  timber, so those beams do carry their share of the force distribution. The
  *check* afterwards is `steel_check::check_all_beams` and nothing else.
  Concrete beams are therefore listed in `skipped_beams` with a pointer to
  `check_concrete_beam`. **Timber beams are not**: a timber beam is only
  reported when it carries a steel profile; with a timber cross-section it drops
  out of `buildSteelCheckInputs` without a word. Fixing that needs a change in
  the solver bundle, not in this crate. Always read `skipped_beams`, and never
  read `governing` as a verdict on a mixed model.
- **Concrete cages are not part of the model.** The `.ifcfem2d` model shape this
  server accepts has no cage fields in `checkConfig` (the sidecar's field gate
  rejects unknown ones), so a project saved with reinforcement cages is refused
  by `validate_fem_model` / `solve_fem_model` / `check_fem_model` on those
  fields. Feed the cage to `check_concrete_beam` directly instead.
- **Concrete scope**: rectangular sections with one top and one bottom
  reinforcement row; bending and bending-with-axial-force only. No shear, no
  torsion, no crack width, no deflection, no second-order effects.
- **CHS section properties**: `compute_section_properties` returns the
  catalogue values for CHS profiles because no `chs_section_props` analytical
  helper exists in the `section-properties` crate yet.
- **Tool input schemas**: `check_steel_beam`, `check_concrete_beam` and
  `concrete_mn_kappa` have complete, strict schemas
  (`additionalProperties: false`, every field listed) that mirror
  `#[serde(deny_unknown_fields)]` on the Rust types; so do the five FEM tools.
  `generate_steel_report_pdf` is still loose — it is a reporting input with no
  effect on any calculation.
- **No streaming**: tool results are returned in one chunk. The PDF tool
  returns the entire base64-encoded document in a single response — fine for
  reports up to ~1 MB, may need chunking later.
- **No auth**: stdio transport is trusted by definition. Do not expose this
  server over TCP without adding authentication.

## Roadmap

- **Timber (EN 1995) and CLT** as their own tools, the same way concrete was
  added: `timber_check` is already a crate and already reachable through the
  Tauri command and the toetsbrug, so the MCP way is the missing third.
- **A three-ways test for steel**, in the shape of `tests/drie_wegen_beton.rs`.
  Steel is the oldest engine here and the only one without that comparison.
- ~~**A concrete PDF report tool**, next to `generate_steel_report_pdf`.~~
  Done differently, and better: `generate_steel_report_pdf` itself now carries
  concrete — the checks, the segment stiffness chapter and the four figures.
  A second tool would have meant a second report for the same structure.
