// Bouwt de MCP-server en zet hem klaar als meegeleverde binary voor de installer.
//
// Tauri verwacht een `externalBin` als `<naam>-<doeltriple>[.exe]`; in de
// installatiemap komt hij zonder triple naast de app te staan
// (`openaec-mcp-server[.exe]`). De koppeling staat in
// `src-tauri/tauri.bundel.conf.json`, dat alleen bij een release-build wordt
// meegegeven: `tauri dev` en `cargo check` hebben de binary dus niet nodig.
//
// Gebruik: node scripts/mcp-sidecar.mjs [--target <triple>]
//   zonder --target: de triple van de lokale Rust-toolchain
//   universal-apple-darwin: bouwt aarch64 en x86_64 en voegt ze samen met lipo
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAURI = join(ROOT, "src-tauri");
const NAAM = "openaec-mcp-server";

function draai(cmd, args, opties = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: TAURI, ...opties });
  if (r.status !== 0) {
    console.error(`mislukt: ${cmd} (exit ${r.status ?? r.signal})`);
    process.exit(r.status ?? 1);
  }
}

function hostTriple() {
  const r = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
  const m = /^host:\s*(\S+)/m.exec(r.stdout ?? "");
  if (!m) { console.error("kan de Rust-doeltriple niet bepalen (rustc -vV)"); process.exit(1); }
  return m[1];
}

const i = process.argv.indexOf("--target");
const expliciet = i > 0 ? process.argv[i + 1] : undefined;
const doel = expliciet ?? hostTriple();
const exe = doel.includes("windows") ? ".exe" : "";

/** Bouwt voor één triple en geeft het pad van de binary terug. */
function bouw(triple, metTargetVlag) {
  const map = metTargetVlag ? join(TAURI, "target", triple, "release") : join(TAURI, "target", "release");
  const pad = join(map, NAAM + exe);
  // Windows: een draaiende server houdt de exe vast en cargo kan hem dan niet
  // vervangen. Hernoemen mag wel, ook terwijl hij draait.
  if (exe && existsSync(pad)) {
    try { renameSync(pad, `${pad}.oud${Date.now()}`); } catch { /* niet vergrendeld of al weg */ }
  }
  draai("cargo", ["build", "--release", "-p", NAAM, ...(metTargetVlag ? ["--target", triple] : [])]);
  return pad;
}

// De solverbundel draagt het versienummer uit design-mockup/package.json en zit
// ingebakken in de server. Eerst herbouwen, anders meldt `fem_solver_status`
// na een versieverhoging nog de vorige versie.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
draai(npm, ["run", "build:sidecar"], { cwd: join(ROOT, "design-mockup"), shell: process.platform === "win32" });

const uitMap = join(TAURI, "binaries");
mkdirSync(uitMap, { recursive: true });
const uit = join(uitMap, `${NAAM}-${doel}${exe}`);

if (doel === "universal-apple-darwin") {
  const delen = ["aarch64-apple-darwin", "x86_64-apple-darwin"].map((t) => bouw(t, true));
  draai("lipo", ["-create", "-output", uit, ...delen]);
} else {
  copyFileSync(bouw(doel, Boolean(expliciet)), uit);
  // Windows met de GNU-toolchain en zonder --target: de compile-stap van Tauri
  // (tauri-build) zoekt de binary onder de triple van de toolchain (…-gnu), maar
  // de bundler van de Tauri-CLI rekent met zijn eigen bouwtriple (…-msvc). Zonder
  // de tweede naam strandt de installer op "resource path … doesn't exist".
  if (!expliciet && doel.endsWith("-windows-gnu")) {
    const msvc = join(uitMap, `${NAAM}-${doel.replace(/-gnu$/, "-msvc")}${exe}`);
    copyFileSync(uit, msvc);
    console.log(`ook als: ${msvc}`);
  }
}

console.log(`klaar: ${uit} (${(statSync(uit).size / 1e6).toFixed(1)} MB)`);
