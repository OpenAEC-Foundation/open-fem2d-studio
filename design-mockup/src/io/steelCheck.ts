/**
 * steelCheck.ts — export van de normtoetsing naar CSV.
 *
 * Hier stond ooit een vereenvoudigde eigen toetsing (|N|/Npl + |M|/Mpl, geen
 * klassen, geen stabiliteit) die naast de echte toetsing meeliep. Die is
 * weg: de toetsing komt uit de Rust-kern (EN 1993-1-1 met de Nederlandse
 * nationale bijlage, en EN 1995-1-1 voor hout) en staat in de check-store.
 * Twee toetsingen naast elkaar betekende dat het rapport een andere unity
 * check kon tonen dan het toetsingspaneel, en de vereenvoudigde variant
 * werkte bovendien op een verouderde profieltabel van 45 profielen die
 * alles wat zij niet kende stilzwijgend als HEA 160 doorrekende.
 */
import { isSteelCheckResult, type CheckSkip, type MemberCheckResult } from "../lib/checkTypes";

/** Nederlandse notatie: decimaalkomma, vaste precisie. */
function getal(v: number, cijfers = 3): string {
  return v.toFixed(cijfers).replace(".", ",");
}

/** Veld dat het scheidingsteken of een aanhalingsteken bevat, veilig maken. */
function veld(s: string): string {
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exporteer de toetsingsresultaten als CSV: één regel per toets, niet per
 * staaf, zodat ook de niet-maatgevende toetsen na te lopen zijn. Overgeslagen
 * staven komen er onderaan bij met hun reden — een staaf die stil uit de
 * export verdwijnt, leest als "getoetst en goed".
 *
 * Puntkomma als scheidingsteken en decimaalkomma: dat opent in een
 * Nederlandse Excel zonder importstappen.
 */
export function exportCheckResultsCsv(
  results: MemberCheckResult[],
  skipped: CheckSkip[] = [],
): void {
  const regels: string[] = ["sep=;"];
  regels.push(
    [
      "Staaf", "Doorsnede", "Materiaal", "Norm", "Toets", "Artikel",
      "Ed", "Rd", "UC", "Status", "Maatgevend",
    ].join(";"),
  );

  for (const r of results) {
    const staal = isSteelCheckResult(r);
    const doorsnede = staal ? r.profile_name : r.section_name;
    const materiaal = staal ? r.steel_grade : r.strength_class;
    const norm = staal ? "EN 1993-1-1" : "EN 1995-1-1";
    for (const named of r.checks) {
      const d = named.kind.data;
      regels.push(
        [
          String(r.beam_id),
          veld(doorsnede),
          veld(materiaal),
          norm,
          veld(d.title),
          veld(d.article),
          d.uc ? getal(d.uc.ed) : "",
          d.uc ? getal(d.uc.rd) : "",
          d.uc ? getal(d.uc.uc, 4) : "",
          String(d.status),
          named.id === r.governing_check_id ? "ja" : "",
        ].join(";"),
      );
    }
  }

  if (skipped.length > 0) {
    regels.push("");
    regels.push(["Staaf", "Niet getoetst — reden"].join(";"));
    for (const s of skipped) {
      regels.push([String(s.beamId), veld(s.reason)].join(";"));
    }
  }

  const blob = new Blob([regels.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `toetsing-${results.length}staven.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
