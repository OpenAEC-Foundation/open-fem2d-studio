// "Niet uitgevoerd" in het toetsingsoverzicht van het live rapport (issue #18).
//
// WAT HIER MISGING
//  Een betonstaaf waarvan een draagkrachttoets niet kon, krijgt de status
//  N.v.t. in plaats van Voldoet. De samenvattingstabel zei niet WELKE toets
//  ontbrak, en een ontbrekende detailleringseis (die de status niet raakt) was
//  er helemaal niet te zien. Het veld `niet_uitgevoerd` stond al in het
//  kernantwoord, maar werd alleen in het toetsingspaneel getoond.
//
// WAT DEZE TEST VASTLEGT
//  [1] nietUitgevoerdOverzicht: alleen betonstaven met iets in de lijst, op
//      staafnummer, met doorsnede en klasse; een antwoord zonder het veld telt
//      als leeg; staal/hout komen er niet in.
//  [2] nietUitgevoerdToetsen: de titels in kernvolgorde, een detailleringseis
//      met het (vertaalde) woord erachter — dezelfde vorm als de PDF-regel
//      (`niet_uitgevoerd_tekst`, report/tests/niet_uitgevoerd_pdf.rs, die met
//      een ECHTE uitkomst van de betonkern werkt).
//  [3] CheckTableSection toont het overzicht onder de tabel, en de teksten
//      bestaan in alle vier de talen.
//
// Uitvoeren: npx tsx test-niet-uitgevoerd.mjs   (vanuit design-mockup/)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const { nietUitgevoerdOverzicht, nietUitgevoerdToetsen } =
  await import("./src/lib/nietUitgevoerd.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

/** Een betonuitslag met alleen de velden die het overzicht leest. */
const beton = (beam_id, niet_uitgevoerd) => ({
  beam_id, section_name: "300 x 600", concrete_class: "C30/37",
  checks: [], uc_max: 0.7, status: niet_uitgevoerd?.some((n) => !n.detaillering) ? "NotApplicable" : "Ok",
  governing_check_id: "6.1_mn_kappa",
  ...(niet_uitgevoerd === undefined ? {} : { niet_uitgevoerd }),
});
const staal = (beam_id) => ({
  beam_id, profile_name: "HEB160", steel_grade: "S235", checks: [], uc_max: 0.1,
  status: "Ok", governing_check_id: "comp",
});
const dwarskracht = { check_id: "6.2_shear", titel: "Dwarskracht", detaillering: false };
const minWap = { check_id: "9.2.1.1_min_wapening", titel: "Minimumwapening", detaillering: true };

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] nietUitgevoerdOverzicht");
{
  const regels = nietUitgevoerdOverzicht([
    beton(9, [minWap]),
    staal(1),
    beton(5, []),
    beton(4),                       // antwoord van vóór het veld
    beton(3, [dwarskracht, minWap]),
  ]);
  check("alleen staven met een overgeslagen toets, op staafnummer",
    JSON.stringify(regels.map((r) => r.beamId)) === "[3,9]", JSON.stringify(regels.map((r) => r.beamId)));
  check("doorsnede en klasse zoals in de tabel",
    regels[0].sectie === "300 x 600" && regels[0].klasse === "C30/37");
  check("de toetsen in de volgorde van de kern",
    regels[0].toetsen.map((t) => t.check_id).join(",") === "6.2_shear,9.2.1.1_min_wapening");
  check("zonder resultaten: leeg", nietUitgevoerdOverzicht([]).length === 0);
  check("alleen staal: leeg", nietUitgevoerdOverzicht([staal(1), staal(2)]).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] nietUitgevoerdToetsen");
{
  const [r3, r9] = nietUitgevoerdOverzicht([beton(3, [dwarskracht, minWap]), beton(9, [minWap])]);
  check("draagkracht- en detailleringstoets naast elkaar",
    nietUitgevoerdToetsen(r3, "detailleringseis") === "Dwarskracht; Minimumwapening (detailleringseis)",
    nietUitgevoerdToetsen(r3, "detailleringseis"));
  check("het woord voor een detailleringseis komt van de aanroeper (vertaling)",
    nietUitgevoerdToetsen(r9, "detailing requirement") === "Minimumwapening (detailing requirement)");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Het live rapport en de vertalingen");
{
  const bron = readFileSync(join(HIER, "src", "components", "report", "sections", "CheckTableSection.tsx"), "utf8");
  check("CheckTableSection gebruikt het overzicht",
    /nietUitgevoerdOverzicht\(results\)/.test(bron) && /nietUitgevoerdToetsen\(r, detailleringseis\)/.test(bron));
  check("het overzicht staat onder de tabel (na de toetsbasis)",
    /rpt-check-basis[\s\S]{0,200}<NietUitgevoerdeToetsen results=\{results\} \/>/.test(bron));
  for (const taal of ["nl", "en", "de", "fr"]) {
    const r = JSON.parse(readFileSync(join(HIER, "src", "i18n", "locales", taal, "ribbon.json"), "utf8")).report;
    check(`${taal}: titel, toelichting en detailleringseis vertaald`,
      ["nietUitgevoerdTitel", "nietUitgevoerdToelichting", "detailleringseis"]
        .every((k) => typeof r?.[k] === "string" && r[k].length > 0));
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
