# openaec-mcp-server

Model Context Protocol (MCP) server that exposes the **Open FEM2D Studio** /
**OpenAEC** EN 1993-1-1 steel-check engine to MCP clients (Claude Desktop,
Claude Code, etc.). It speaks JSON-RPC 2.0 over stdio and wraps the same
Rust crates the Tauri desktop app uses, so a tool call from Claude returns
byte-identical results to clicking through the UI.

This is **v1**: only the steel-check engine. The 2D FEM solver pipeline
(node/beam/plate mesh, nonlinear solver) is not yet exposed — see "Roadmap"
below.

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

Restart Claude Desktop after editing. The five tools below should appear in
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
`src/lib/types/steel/`, so the same JSON shapes work for both Tauri and MCP
callers.

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

Renders a complete EN 1993-1-1 PDF report (OpenAEC-branded, A4 portrait,
multi-page) from a list of `BeamCheckResult` objects — typically the output
of one or more prior `check_steel_beam` calls. Returns the PDF as base64
because MCP transports JSON, not binary.

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
    "steel_check_results": [ /* one or more BeamCheckResult objects */ ]
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

The single integration test in `tests/stdio_roundtrip.rs` spawns the actual
binary, drives a full handshake (`initialize` →
`notifications/initialized` → `tools/list` → `tools/call list_steel_profiles`)
and asserts every response is well-formed and the profile array is
non-empty.

## Known limitations (v1)

- **Engine scope**: only the steel-check pipeline is wrapped. The 2D FEM
  solver (node/beam/plate mesh, nonlinear solver, plate-region mesh
  generation) is not yet exposed — see roadmap.
- **CHS section properties**: `compute_section_properties` returns the
  catalogue values for CHS profiles because no `chs_section_props` analytical
  helper exists in the `section-properties` crate yet.
- **Tool input schemas**: kept loose (`additionalProperties: true` on
  engine-types) because re-deriving JSON-Schema from the existing serde/ts-rs
  type definitions would mean duplicating every field. Validation happens
  server-side via serde and produces -32602 errors with the offending field
  named.
- **No streaming**: tool results are returned in one chunk. The PDF tool
  returns the entire base64-encoded document in a single response — fine for
  reports up to ~1 MB, may need chunking later.
- **No auth**: stdio transport is trusted by definition. Do not expose this
  server over TCP without adding authentication.

## Roadmap (v2 idea)

Wrap the 2D FEM solver pipeline as additional tools:

- `solve_fem_model` — accept a `Mesh` (nodes, beams, plates, supports, loads)
  and return the solved nodal displacements, reactions and per-beam force
  envelopes — i.e. exactly the input shape that `check_steel_beam` expects.
  This would let an MCP client describe a steel frame in natural language,
  have Claude solve it, and pipe the result straight into the steel checks
  already exposed here — closing the loop end-to-end without ever opening
  the desktop app.
