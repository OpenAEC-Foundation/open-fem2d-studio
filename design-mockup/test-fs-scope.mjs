// Recente bestanden openen zonder dialoog: de fs-rechten moeten projectbestanden
// (.ifcfem2d) toestaan, en verder niets extra.
//
// Aanleiding: "forbidden path" bij openen via de lijst met recente bestanden.
// Bestand → Openen werkt altijd, omdat de dialoogplugin het gekozen pad voor de
// looptijd vrijgeeft. `handleOpenFilePath` (recente bestanden, welkomstscherm)
// en `saveProjectTo` (Opslaan) roepen readTextFile/writeTextFile rechtstreeks
// aan; zonder scope in de capability weigert tauri-plugin-fs dat pad.
//
//   [1] default.json geeft read- en write-text-file vrij voor **/*.<projectext>
//   [2] geen ongescoopte read-/write-text-file-vrijgave ernaast
//   [3] de extensie is die van het projectbestand, en de twee aanroepen bestaan nog
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };
const lees = (...p) => readFileSync(join(HIER, ...p), "utf8").replace(/\r\n/g, "\n");

const cap = JSON.parse(lees("..", "src-tauri", "capabilities", "default.json"));
const ext = /PROJECT_FILE_EXT\s*=\s*"([^"]+)"/.exec(lees("src", "io", "projectFile.ts"))?.[1];
const patroon = `**/*.${ext}`;

log("[1] vrijgave voor projectbestanden");
for (const id of ["fs:allow-read-text-file", "fs:allow-write-text-file"]) {
  const item = cap.permissions.find((p) => typeof p === "object" && p.identifier === id);
  const paden = (item?.allow ?? []).map((a) => a.path);
  check(`${id} is gescoopt op ${patroon}`, paden.includes(patroon), JSON.stringify(paden));
  check(`${id} staat verder niets toe`, paden.length === 1 && !item?.deny, JSON.stringify(item));
}

log("\n[2] geen ongescoopte vrijgave");
for (const id of ["fs:allow-read-text-file", "fs:allow-write-text-file", "fs:allow-read-file", "fs:read-all", "fs:write-all"]) {
  check(`geen kale "${id}"`, !cap.permissions.includes(id));
}
check("geen globale fs:scope met jokers", !cap.permissions.some((p) => (typeof p === "string" ? p : p.identifier).startsWith("fs:scope")));

log("\n[3] extensie en aanroepen");
check("projectextensie gevonden", ext === "ifcfem2d", String(ext));
const app = lees("src", "App.tsx");
check("handleOpenFilePath leest nog met readTextFile(path)", /const handleOpenFilePath[\s\S]{0,400}readTextFile\(path\)/.test(app));
check("saveProjectTo schrijft nog met writeTextFile(path, …)", /export async function saveProjectTo[\s\S]{0,300}writeTextFile\(path/.test(lees("src", "io", "projectFile.ts")));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
