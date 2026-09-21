// Eén klik of Tab in een tekst- of getalveld selecteert de hele waarde.
//   [1] welke elementen wel en niet
//   [2] de luisteraar: selecteert een tik later, alleen als het veld de focus nog heeft
//   [3] main.tsx installeert hem
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { moetSelecteren, installeerSelecteerBijFocus } = await import("./src/lib/selecteerBijFocus.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };
const veld = (o = {}) => ({ tagName: "INPUT", type: "number", value: "2000", select() { this.geselecteerd = (this.geselecteerd ?? 0) + 1; }, closest: () => null, ...o });

log("[1] welke velden");
check("getalveld met waarde", moetSelecteren(veld()));
check("tekstveld met waarde", moetSelecteren(veld({ type: "text", value: "HEA160" })));
check("veld zonder type telt als tekst", moetSelecteren(veld({ type: undefined })));
check("leeg veld niet", !moetSelecteren(veld({ value: "" })));
check("alleen-lezen niet", !moetSelecteren(veld({ readOnly: true })));
check("uitgeschakeld niet", !moetSelecteren(veld({ disabled: true })));
check("selectievakje niet", !moetSelecteren(veld({ type: "checkbox" })));
check("schuifregelaar niet", !moetSelecteren(veld({ type: "range" })));
check("tekstvlak (textarea) niet", !moetSelecteren(veld({ tagName: "TEXTAREA" })));
check("keuzelijst niet", !moetSelecteren(veld({ tagName: "SELECT" })));
check("data-geen-selectie op een voorouder zet het uit", !moetSelecteren(veld({ closest: (s) => (s === "[data-geen-selectie]" ? {} : null) })));
check("null is geen veld", !moetSelecteren(null));

log("\n[2] de luisteraar");
{
  const luisteraars = {};
  const wachtrij = [];
  const doc = { activeElement: null, addEventListener: (t, f) => { luisteraars[t] = f; }, removeEventListener: (t) => { delete luisteraars[t]; } };
  const opruimen = installeerSelecteerBijFocus(doc, (f) => wachtrij.push(f));
  check("luistert naar focusin (borrelt, focus niet)", typeof luisteraars.focusin === "function");

  const a = veld();
  doc.activeElement = a;
  luisteraars.focusin({ target: a });
  check("selecteert niet direct (de klik zet de cursor pas na de focus)", !a.geselecteerd);
  wachtrij.splice(0).forEach((f) => f());
  check("selecteert een tik later", a.geselecteerd === 1);

  const b = veld(), c = veld();
  doc.activeElement = b;
  luisteraars.focusin({ target: b });
  doc.activeElement = c; // snelle Tab door naar het volgende veld
  wachtrij.splice(0).forEach((f) => f());
  check("een veld dat de focus alweer kwijt is wordt niet geselecteerd", !b.geselecteerd);

  const vink = veld({ type: "checkbox" });
  doc.activeElement = vink;
  luisteraars.focusin({ target: vink });
  check("een selectievakje plant niets in", wachtrij.length === 0);

  opruimen();
  check("opruimen haalt de luisteraar weg", luisteraars.focusin === undefined);
}

log("\n[3] de app installeert hem");
const main = readFileSync(join(HIER, "src", "main.tsx"), "utf8").replace(/\r\n/g, "\n");
check("main.tsx roept installeerSelecteerBijFocus() aan", /installeerSelecteerBijFocus\(\);/.test(main));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
