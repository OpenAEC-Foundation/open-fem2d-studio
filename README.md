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

### Windows toolchain note

This project builds on both `x86_64-pc-windows-gnu` (MinGW, no extra
install) and `x86_64-pc-windows-msvc` (Visual Studio Build Tools).

The Tauri dependency tree (~366 crates) can overflow the GNU `ld.exe`
symbol table — `src-tauri/Cargo.toml` ships profile tweaks
(`debug=0`, `strip="debuginfo"`) that keep MinGW happy at the cost
of slightly less dev debug info.

For full debug builds, switch to MSVC:

```bash
rustup default stable-x86_64-pc-windows-msvc
```

This requires Visual Studio Build Tools 2022 (or full VS) with the
"Desktop development with C++" workload.

## License

CC BY-SA 4.0 — see [LICENSE.md](LICENSE.md)

## About OpenAEC Foundation

OpenAEC Foundation develops free, open-source tools for the built environment.
Build free. Build together. — [openaec.org](https://github.com/OpenAEC-Foundation)
