/**
 * matrixExport.ts — download the global system stiffness matrix K and the
 * per-beam local K matrices as CSV. Uses the same `buildMatricesOnly()`
 * pipeline as InsightsView (i.e. the canonical solver assembler).
 */
import { buildMatricesOnly } from "../components/fem/solver/solver";
import type { Node, Beam } from "../components/fem/femTypes";

interface SupportLite { nodeId: number; type: string; k?: number }

function matrixToCsv(M: number[][], rowLabels?: string[], colLabels?: string[]): string {
  const lines: string[] = [];
  if (colLabels) {
    lines.push(["", ...colLabels].join(","));
  }
  M.forEach((row, i) => {
    const label = rowLabels?.[i] ?? `r${i}`;
    lines.push([label, ...row.map(v => Number(v).toExponential(6))].join(","));
  });
  return lines.join("\n");
}

function downloadText(text: string, filename: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build DOF labels (u_x N, u_z N, ry N) from a node-index map. */
function dofLabels(nodeIds: number[]): string[] {
  const out: string[] = [];
  for (const nid of nodeIds) {
    out.push(`u_x${nid}`, `u_z${nid}`, `ry_${nid}`);
  }
  return out;
}

export function exportMatricesAsCsv(
  nodes: Node[], beams: Beam[], supports: SupportLite[],
): void {
  const asm = buildMatricesOnly({ nodes, beams, supports });

  // Build node order list for DOF labels (matches Assembler order).
  const nodeIdOrder: number[] = [];
  asm.nodeIndex.forEach((idx, nid) => { nodeIdOrder[idx] = nid; });
  const labels = dofLabels(nodeIdOrder);

  // 1) Global stiffness matrix
  const globalCsv = matrixToCsv(asm.K, labels, labels);
  downloadText(globalCsv, `system-K-${asm.nDof}dof.csv`);

  // 2) One CSV per beam (local 6×6) — concatenated into a single file with
  //    section headers, much friendlier than dropping N files at once.
  const dofNames = ["u_x1", "u_z1", "ry_1", "u_x2", "u_z2", "ry_2"];
  const sections: string[] = [];
  for (const bc of asm.beams) {
    sections.push(`# Beam ${bc.id}  (E=${bc.E.toExponential(3)} Pa, A=${(bc.A * 1e6).toFixed(1)} mm², L=${bc.L.toFixed(4)} m, c=${bc.c.toFixed(3)}, s=${bc.s.toFixed(3)})`);
    sections.push(matrixToCsv(bc.kLocal, dofNames, dofNames));
    sections.push(""); // blank line between beams
  }
  downloadText(sections.join("\n"), `element-K-${asm.beams.length}beams.csv`);
}
