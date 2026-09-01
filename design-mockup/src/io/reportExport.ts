/**
 * reportExport.ts — standalone HTML-rapport uit de huidige model-state.
 * Werkt overal (browser én Tauri): opent een print-vriendelijk venster;
 * de gebruiker print naar PDF met de native dialog (Ctrl+P).
 *
 * Secties: projectinfo, model-overzicht (knopen/staven/opleggingen),
 * belastingen per geval, reacties, element-krachten (N/V/M per staaf),
 * en de minimale EN 1993-toetsing indien resultaten beschikbaar zijn.
 */
import type { Node, Beam, Support, Load, LoadCase } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import { runMinimalSteelCheck } from "./steelCheck";

interface ReportInput {
  projectName?: string;
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  loads: Load[];
  loadCases: LoadCase[];
  /** Active result (single LC or combination) — null = geen resultaten-sectie. */
  result: SolverResult | null;
  /** Naam van actieve scope, bv. "ULS 6.10b" of "Eigen gewicht". */
  scopeName?: string;
}

const esc = (s: unknown): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt = (v: number, dec = 2): string =>
  Number.isFinite(v) ? v.toFixed(dec) : "—";

export function buildReportHtml(input: ReportInput): string {
  const { nodes, beams, supports, loads, loadCases, result } = input;
  const title = input.projectName?.trim() || "Open FEM2D Studio — rapport";
  const now = new Date().toLocaleString("nl-NL");

  const sections: string[] = [];

  // ── 1. Model-overzicht ─────────────────────────────────────────────────
  sections.push(`
    <h2>1. Model</h2>
    <table>
      <tr><th>Onderdeel</th><th>Aantal</th></tr>
      <tr><td>Knopen</td><td>${nodes.length}</td></tr>
      <tr><td>Staven</td><td>${beams.length}</td></tr>
      <tr><td>Opleggingen</td><td>${supports.length}</td></tr>
      <tr><td>Belastingen</td><td>${loads.length}</td></tr>
      <tr><td>Belastinggevallen</td><td>${loadCases.length}</td></tr>
    </table>

    <h3>1.1 Knopen</h3>
    <table>
      <tr><th>ID</th><th>x (m)</th><th>z (m)</th></tr>
      ${nodes.map(n => `<tr><td>${n.id}</td><td>${fmt(n.x / 1000, 3)}</td><td>${fmt(n.z / 1000, 3)}</td></tr>`).join("")}
    </table>

    <h3>1.2 Staven</h3>
    <table>
      <tr><th>ID</th><th>Van</th><th>Naar</th><th>Profiel</th><th>Materiaal</th><th>Scharnieren</th></tr>
      ${beams.map(b => {
        const rel: string[] = [];
        if (b.releases?.startRy) rel.push("A:φY");
        if (b.releases?.endRy) rel.push("B:φY");
        return `<tr><td>${b.id}</td><td>${b.from}</td><td>${b.to}</td><td>${esc(b.profile ?? "HEA160")}</td><td>${esc(b.material ?? "S235")}</td><td>${rel.join(", ") || "—"}</td></tr>`;
      }).join("")}
    </table>

    <h3>1.3 Opleggingen</h3>
    <table>
      <tr><th>Knoop</th><th>Type</th><th>k</th></tr>
      ${supports.map(s => `<tr><td>${s.nodeId}</td><td>${esc(s.type)}</td><td>${s.k !== undefined ? fmt(s.k, 1) : "—"}</td></tr>`).join("")}
    </table>
  `);

  // ── 2. Belastingen per geval ───────────────────────────────────────────
  const loadRows = (caseId: number) => loads.filter(l => l.caseId === caseId).map(l => {
    if (l.type === "lineLoad") {
      const dir = l.qDir === "x" ? "horizontaal" : "verticaal";
      const q = l.qStart !== undefined && l.qEnd !== undefined && l.qStart !== l.qEnd
        ? `${fmt(l.qStart ?? l.q ?? 0, 2)} → ${fmt(l.qEnd ?? 0, 2)}`
        : fmt(l.q ?? 0, 2);
      return `<tr><td>Lijnlast</td><td>staaf ${l.beamId}</td><td>q = ${q} kN/m (${dir})</td></tr>`;
    }
    if (l.type === "pointForce")
      return `<tr><td>Puntlast</td><td>knoop ${l.nodeId}</td><td>Fx=${fmt(l.fx ?? 0, 1)} kN, Fz=${fmt(l.fz ?? 0, 1)} kN</td></tr>`;
    if (l.type === "pointMoment")
      return `<tr><td>Moment</td><td>knoop ${l.nodeId}</td><td>My=${fmt(l.my ?? 0, 1)} kNm</td></tr>`;
    if (l.type === "thermal")
      return `<tr><td>Thermisch</td><td>staaf ${l.beamId}</td><td>ΔT=${fmt(l.deltaT ?? 0, 1)} K</td></tr>`;
    return "";
  }).join("");

  sections.push(`
    <h2>2. Belastingen</h2>
    ${loadCases.map(lc => `
      <h3>2.${lc.id} ${esc(lc.name)} (${esc(lc.type)})</h3>
      <table>
        <tr><th>Type</th><th>Op</th><th>Waarde</th></tr>
        ${loadRows(lc.id) || `<tr><td colspan="3">— geen belastingen —</td></tr>`}
      </table>
    `).join("")}
  `);

  // ── 3. Resultaten ─────────────────────────────────────────────────────
  if (result) {
    const scope = input.scopeName ? ` — ${esc(input.scopeName)}` : "";
    sections.push(`
      <h2>3. Resultaten${scope}</h2>
      <p>Max. verplaatsing: <strong>${fmt(result.maxDisplacement, 2)} mm</strong></p>

      <h3>3.1 Reacties</h3>
      <table>
        <tr><th>Knoop</th><th>Fx (kN)</th><th>Fz (kN)</th><th>My (kNm)</th></tr>
        ${Array.from(result.reactions.entries()).map(([nid, r]) =>
          `<tr><td>${nid}</td><td>${fmt(r.fx / 1000, 2)}</td><td>${fmt(r.fz / 1000, 2)}</td><td>${fmt(r.my / 1e6, 2)}</td></tr>`
        ).join("")}
      </table>

      <h3>3.2 Element-krachten</h3>
      <table>
        <tr><th>Staaf</th><th>N (kN)</th><th>V (kN)</th><th>M_start (kNm)</th><th>M_eind (kNm)</th><th>|M|max (kNm)</th></tr>
        ${Array.from(result.elements.entries()).map(([bid, ef]) => {
          let mMax = Math.max(Math.abs(ef.M_start), Math.abs(ef.M_end));
          if (ef.bendingMoment?.length) for (const m of ef.bendingMoment) if (Math.abs(m) > mMax) mMax = Math.abs(m);
          return `<tr><td>${bid}</td><td>${fmt(ef.N / 1000, 2)}</td><td>${fmt(ef.V / 1000, 2)}</td><td>${fmt(ef.M_start / 1e6, 2)}</td><td>${fmt(ef.M_end / 1e6, 2)}</td><td><strong>${fmt(mMax / 1e6, 2)}</strong></td></tr>`;
        }).join("")}
      </table>
    `);

    // ── 4. Toetsing (minimale EN 1993 UC) ────────────────────────────────
    const checks = runMinimalSteelCheck(beams, result);
    if (checks.length > 0) {
      sections.push(`
        <h2>4. Toetsing — EN 1993-1-1 (doorsnede, plastisch)</h2>
        <p class="small">UC = |N<sub>Ed</sub>|/N<sub>pl,Rd</sub> + |M<sub>Ed</sub>|/M<sub>pl,Rd</sub> ≤ 1,0 &nbsp;(vereenvoudigde lineaire interactie; stabiliteit niet inbegrepen)</p>
        <table>
          <tr><th>Staaf</th><th>Profiel</th><th>N<sub>Ed</sub> (kN)</th><th>|M|<sub>max</sub> (kNm)</th><th>UC<sub>N</sub></th><th>UC<sub>M</sub></th><th>UC</th><th>Status</th></tr>
          ${checks.map(c => `
            <tr class="${c.pass ? "ok" : "fail"}">
              <td>${c.beamId}</td><td>${esc(c.profile ?? "—")}</td>
              <td>${fmt(c.N_Ed / 1000, 2)}</td><td>${fmt(c.M_Ed / 1e6, 2)}</td>
              <td>${fmt(c.uc_N, 3)}</td><td>${fmt(c.uc_M, 3)}</td>
              <td><strong>${fmt(c.uc_combined, 3)}</strong></td>
              <td>${c.pass ? "✓ OK" : "✗ NIET OK"}</td>
            </tr>`).join("")}
        </table>
      `);
    }
  } else {
    sections.push(`<h2>3. Resultaten</h2><p><em>Geen berekening uitgevoerd — klik eerst op Berekenen.</em></p>`);
  }

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { font: 13px/1.5 "Segoe UI", system-ui, sans-serif; color: #1a1a1a; max-width: 900px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 22px; border-bottom: 3px solid #f59e0b; padding-bottom: 8px; }
  h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 13.5px; margin-top: 18px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  tr.ok td { background: #f0fdf4; }
  tr.fail td { background: #fef2f2; font-weight: 600; }
  .meta { color: #666; font-size: 11.5px; margin-bottom: 24px; }
  .small { color: #666; font-size: 11.5px; }
  @media print {
    body { margin: 0; max-width: none; }
    h2 { break-after: avoid; }
    table { break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<div class="meta">Gegenereerd: ${esc(now)} · Open FEM2D Studio v2 · ${nodes.length} knopen · ${beams.length} staven</div>
${sections.join("\n")}
</body>
</html>`;
}

/** Open het rapport in een nieuw venster (print-vriendelijk; Ctrl+P → PDF). */
export function openReportWindow(input: ReportInput): void {
  const html = buildReportHtml(input);
  const win = window.open("", "_blank");
  if (!win) {
    // Popup blocked → fallback: download als HTML-file
    downloadReportHtml(input);
    return;
  }
  win.document.write(html);
  win.document.close();
}

/** Download het rapport als losstaand .html bestand. */
export function downloadReportHtml(input: ReportInput): void {
  const html = buildReportHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(input.projectName?.trim() || "rapport").replace(/[^\w-]+/g, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
