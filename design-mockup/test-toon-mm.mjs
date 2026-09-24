// Weergave van lengtes in hele mm (labels, tekening, placeholders), los van
// invoervelden die de exacte waarde houden. Aanleiding: "h = 7183.821405597214 mm"
// in de windtekening.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { toonMm, formatLength } = await import("./src/lib/lengthInput.ts");
const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };

check("afgeleide hoogte in m → hele mm", toonMm(7.183821405597214, "m") === "7184", toonMm(7.183821405597214, "m"));
check("1,001 m → 1001", toonMm(1.001, "m") === "1001");
check("mm blijft mm, afgerond", toonMm(2500.4) === "2500" && toonMm(2500.5) === "2501");
check("0 en −0 → 0", toonMm(0) === "0" && toonMm(-0.0001, "m") === "0");
check("negatief", toonMm(-1.5, "m") === "-1500");
check("leeg of ongeldig → lege tekst", toonMm(null) === "" && toonMm(undefined) === "" && toonMm(NaN) === "");
check("formatLength houdt de exacte waarde (invoervelden)", formatLength(7.183821405597214, "m") === "7183.821405597214");

const schema = readFileSync(join(HIER, "src", "lib", "wind", "WindSchema.tsx"), "utf8");
const dlg = readFileSync(join(HIER, "src", "lib", "wind", "WindGeneratorDialog.tsx"), "utf8");
check("de windtekening toont maten met toonMm", !/formatLength/.test(schema) && (schema.match(/toonMm\(m, "m"\)/g) ?? []).length === 2);
check("het windvenster toont z_e en de belastingbreedte met toonMm", /z_e = \$\{toonMm\(s\.hoogte_m, "m"\)\} mm/.test(dlg) && !/formatLength/.test(dlg));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
