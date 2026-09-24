// De staafdialoog (OK) mag geen velden wissen die hij niet toont.
// Aanleiding: OK wiste de kipsteunen van de onderflens (lateralRestraintsBottom),
// eerder al de wapeningskorf en de kolomgegevens.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { dialoogBasis, onderflensNaDialoog, DIALOOG_VELDEN } = await import("./src/lib/staafDialoogConfig.ts");
const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };

log("[1] dialoogBasis");
const cfg0 = { lateralRestraints: [0.5], lateralRestraintsBottom: [0.25, 0.75], bucklingLengthY_m: 6, kCr: 0.67,
  betonKorf: { x: 1 }, iets_nieuws: "blijft" };
const basis = dialoogBasis(cfg0);
check("onderflenssteunen blijven", JSON.stringify(basis.lateralRestraintsBottom) === "[0.25,0.75]");
check("een onbekend (toekomstig) veld blijft", basis.iets_nieuws === "blijft");
check("de velden die de dialoog opnieuw invult zijn eruit", DIALOOG_VELDEN.every((k) => !(k in basis)));
check("het origineel is niet gewijzigd", cfg0.kCr === 0.67 && cfg0.lateralRestraints.length === 1);
check("geen configuratie → leeg object", JSON.stringify(dialoogBasis(undefined)) === "{}");
check("lateralRestraintsBottom hoort NIET bij de dialoogvelden", !DIALOOG_VELDEN.includes("lateralRestraintsBottom"));

log("\n[2] onderflensNaDialoog");
const L = 6000;
check("ongelijk: onderflens blijft zoals hij was",
  JSON.stringify(onderflensNaDialoog({ lateralRestraints: [0.5], lateralRestraintsBottom: [0.25, 0.75] }, [0.3], L)) === "[0.25,0.75]");
check("gelijk (vinkje): onderflens volgt de nieuwe bovenflens",
  JSON.stringify(onderflensNaDialoog({ lateralRestraints: [0.5], lateralRestraintsBottom: [0.5] }, [0.25, 0.75], L)) === "[0.25,0.75]");
check("gelijk en boven leeggemaakt: onderflens ook leeg",
  onderflensNaDialoog({ lateralRestraints: [0.5], lateralRestraintsBottom: [0.5] }, [], L) === undefined);
check("beide leeg: onderflens volgt (steunt beide flenzen)",
  JSON.stringify(onderflensNaDialoog({}, [0.5], L)) === "[0.5]");
check("gelijk binnen 1 mm telt als gelijk",
  JSON.stringify(onderflensNaDialoog({ lateralRestraints: [0.5], lateralRestraintsBottom: [0.5 + 0.5 / L] }, [0.4], L)) === "[0.4]");

log("\n[3] de dialoog gebruikt het");
const dlg = readFileSync(join(HIER, "src", "components", "fem", "BarPropertiesDialog.tsx"), "utf8").replace(/\r\n/g, "\n");
const b = dlg.indexOf("const buildCheckConfig");
const romp = dlg.slice(b, b + 1800);
check("buildCheckConfig start vanuit dialoogBasis(cfg0)", /const cfg: BeamCheckConfig = dialoogBasis\(cfg0\);/.test(romp));
check("en zet de onderflens met onderflensNaDialoog", /onderflensNaDialoog\(cfg0, restraints,/.test(romp));
check("en gebruikt geen variabele die pas later in de component bestaat", !/onderflensNaDialoog\(cfg0, restraints, length\)/.test(romp));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
