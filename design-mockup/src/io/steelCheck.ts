/**
 * steelCheck.ts — minimaal EN 1993-1-1 unity check (class 1 plastische
 * doorsnede, geen instabiliteit). Voor v2 MVP: enkel een eerste-orde-toetsing
 * per balk op buigmoment + normaalkracht via |M|/Mpl,Rd + |N|/Npl,Rd ≤ 1.
 *
 * Volledige toetsing (kniklengtes, LTB, 6.3.x interactie, klassen-bepaling)
 * is een groter traject dat in v1 in Rust zat — niet in scope voor MVP.
 * Deze module geeft wel een werkende UC-export zodat de Check-tab betekenis
 * heeft + de gebruiker de orde van grootte kan zien.
 */
import type { Beam } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import { PROFILE_AREA_CM2, PROFILE_WPL_Y_CM3, STEEL_FY } from "../components/fem/profileData";

export interface CheckResult {
  beamId: number;
  profile?: string;
  N_Ed: number;        // N
  M_Ed: number;        // N·mm — max |M(x)| over alle stations
  Npl_Rd: number;      // N
  Mpl_Rd: number;      // N·mm
  uc_N: number;        // |N_Ed| / Npl_Rd
  uc_M: number;        // |M_Ed| / Mpl_Rd
  uc_combined: number; // uc_N + uc_M  (simpele lineaire interactie, 6.2.1)
  pass: boolean;
}

/**
 * Run de minimale UC-check op alle beams in `result`.
 * fy default 235 N/mm² (S235). γM0 default 1.0.
 */
export function runMinimalSteelCheck(
  beams: Beam[],
  result: SolverResult,
  gammaM0 = 1.0,
): CheckResult[] {
  const out: CheckResult[] = [];
  for (const b of beams) {
    const ef = result.elements.get(b.id);
    if (!ef) continue;

    const profile = b.profile ?? "HEA160";
    const grade   = b.material ?? "S235";
    const A_cm2   = PROFILE_AREA_CM2[profile]   ?? PROFILE_AREA_CM2.HEA160;
    const Wpl_cm3 = PROFILE_WPL_Y_CM3[profile]  ?? PROFILE_WPL_Y_CM3.HEA160;
    const fy_Nmm2 = STEEL_FY[grade]             ?? 235;

    const A_mm2  = A_cm2 * 100;          // cm² → mm²
    const Wpl_mm3 = Wpl_cm3 * 1000;      // cm³ → mm³

    const Npl_Rd = A_mm2 * fy_Nmm2 / gammaM0;
    const Mpl_Rd = Wpl_mm3 * fy_Nmm2 / gammaM0;

    // Max |M(x)| uit stations; fallback naar M_start/M_end.
    let Mmax = Math.max(Math.abs(ef.M_start), Math.abs(ef.M_end));
    if (ef.bendingMoment?.length) {
      for (const m of ef.bendingMoment) if (Math.abs(m) > Mmax) Mmax = Math.abs(m);
    }

    const uc_N = Math.abs(ef.N) / Npl_Rd;
    const uc_M = Mmax / Mpl_Rd;
    const uc_combined = uc_N + uc_M;

    out.push({
      beamId: b.id,
      profile,
      N_Ed: ef.N,
      M_Ed: Mmax,
      Npl_Rd, Mpl_Rd,
      uc_N, uc_M, uc_combined,
      pass: uc_combined <= 1.0,
    });
  }
  return out;
}

/** Export check results as CSV (downloads via Blob). */
export function exportCheckResultsCsv(rows: CheckResult[]): void {
  const header = "Beam,Profile,N_Ed [kN],|M|_max [kNm],N_pl,Rd [kN],M_pl,Rd [kNm],UC_N,UC_M,UC_combined,Status";
  const lines = [header];
  for (const r of rows) {
    lines.push([
      r.beamId,
      r.profile ?? "—",
      (r.N_Ed / 1000).toFixed(3),
      (r.M_Ed / 1e6).toFixed(3),
      (r.Npl_Rd / 1000).toFixed(3),
      (r.Mpl_Rd / 1e6).toFixed(3),
      r.uc_N.toFixed(4),
      r.uc_M.toFixed(4),
      r.uc_combined.toFixed(4),
      r.pass ? "OK" : "NOT OK",
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `steel-check-${rows.length}beams.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
