/**
 * ReactionsSection — oplegreacties per ondersteunde knoop.
 *
 * Twee tabellen:
 *  1. de gekozen combinatie (Fx, Fz en — waar het opleggingstype rotatie
 *     vasthoudt — My), overgeslagen wanneer de omhullende is gekozen;
 *  2. de omhullende: min/max per reactiecomponent over ALLE combinaties.
 *     De solver-Envelope kent geen My-extremen, dus die worden hier — net
 *     als bij de omhullende-keuze de Fx/Fz — rechtstreeks over de
 *     combinatieresultaten bepaald (zelfde uitkomst, één codepad).
 *
 * Eenheden: solverreacties zijn N en N·mm → hier kN en kNm.
 * Zonder (actuele) resultaten: de "Nog niet berekend"-melding.
 */
import { useTranslation } from "react-i18next";
import type { SupportType } from "../../fem/femTypes";
import { useReportData } from "../ReportDataContext";
import { fmtNum } from "../reportFormat";
import {
  NotComputedNote,
  ScopePrintLine,
  ScopeSelector,
  useResultScope,
} from "../resultScope";

/** Houdt dit opleggingstype rotatie vast (→ reactiemoment mogelijk)? */
function restrainsRotation(type: SupportType): boolean {
  return type === "fixed" || type === "rotSpring";
}

interface MinMax {
  min: number;
  max: number;
}
interface ReactionEnvelopeRow {
  fx: MinMax;
  fz: MinMax;
  my: MinMax;
}

export default function ReactionsSection() {
  const { t } = useTranslation("ribbon");
  const { supports, combinationResults } = useReportData();
  const rs = useResultScope();

  if (!rs.hasResults || !combinationResults) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{t("report.sectionReactions", "Oplegreacties")}</h2>
        <NotComputedNote />
      </div>
    );
  }

  const supportByNode = new Map(supports.map((s) => [s.nodeId, s]));
  const anyMy = supports.some((s) => restrainsRotation(s.type));

  // Rijvolgorde: alle knopen die in enig combinatieresultaat een reactie
  // hebben (unie), oplopend op knoopnummer.
  const nodeIds = new Set<number>();
  for (const c of rs.combosWithResults) {
    combinationResults.get(c.id)?.reactions.forEach((_, id) => nodeIds.add(id));
  }
  const sortedIds = [...nodeIds].sort((a, b) => a - b);

  // Omhullende min/max per component over alle combinaties.
  const envRows = new Map<number, ReactionEnvelopeRow>();
  for (const id of sortedIds) {
    let row: ReactionEnvelopeRow | null = null;
    for (const c of rs.combosWithResults) {
      const r = combinationResults.get(c.id)?.reactions.get(id);
      if (!r) continue;
      if (!row) {
        row = {
          fx: { min: r.fx, max: r.fx },
          fz: { min: r.fz, max: r.fz },
          my: { min: r.my, max: r.my },
        };
      } else {
        row.fx.min = Math.min(row.fx.min, r.fx); row.fx.max = Math.max(row.fx.max, r.fx);
        row.fz.min = Math.min(row.fz.min, r.fz); row.fz.max = Math.max(row.fz.max, r.fz);
        row.my.min = Math.min(row.my.min, r.my); row.my.max = Math.max(row.my.max, r.my);
      }
    }
    if (row) envRows.set(id, row);
  }

  const myCell = (nodeId: number, valueNmm: number): string => {
    const sup = supportByNode.get(nodeId);
    if (!sup || !restrainsRotation(sup.type)) return "—";
    return fmtNum(valueNmm / 1e6, 2);
  };

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionReactions", "Oplegreacties")}</h2>
      <ScopeSelector rs={rs} />
      <ScopePrintLine rs={rs} />

      {sortedIds.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noReactions", "Geen opleggingen met reacties in het model.")}
        </p>
      ) : (
        <>
          {/* ── Tabel 1: de gekozen combinatie ── */}
          {rs.scope !== "envelope" && rs.result && (
            <>
              <h3 className="rpt-h3">{rs.combo?.name}</h3>
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>{t("report.colNode", "Knoop")}</th>
                    <th className="rpt-num">Fx [kN]</th>
                    <th className="rpt-num">Fz [kN]</th>
                    {anyMy && <th className="rpt-num">My [kNm]</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedIds.map((id) => {
                    const r = rs.result!.reactions.get(id);
                    if (!r) return null;
                    return (
                      <tr key={id}>
                        <td>{id}</td>
                        <td className="rpt-num">{fmtNum(r.fx / 1e3, 2)}</td>
                        <td className="rpt-num">{fmtNum(r.fz / 1e3, 2)}</td>
                        {anyMy && <td className="rpt-num">{myCell(id, r.my)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {/* ── Tabel 2: omhullende min/max over alle combinaties ── */}
          <h3 className="rpt-h3">
            {t("report.envelopeReactionsTitle", "Omhullende (min/max over alle combinaties)")}
          </h3>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>{t("report.colNode", "Knoop")}</th>
                <th className="rpt-num">Fx,min [kN]</th>
                <th className="rpt-num">Fx,max [kN]</th>
                <th className="rpt-num">Fz,min [kN]</th>
                <th className="rpt-num">Fz,max [kN]</th>
                {anyMy && <th className="rpt-num">My,min [kNm]</th>}
                {anyMy && <th className="rpt-num">My,max [kNm]</th>}
              </tr>
            </thead>
            <tbody>
              {sortedIds.map((id) => {
                const row = envRows.get(id);
                if (!row) return null;
                return (
                  <tr key={id}>
                    <td>{id}</td>
                    <td className="rpt-num">{fmtNum(row.fx.min / 1e3, 2)}</td>
                    <td className="rpt-num">{fmtNum(row.fx.max / 1e3, 2)}</td>
                    <td className="rpt-num">{fmtNum(row.fz.min / 1e3, 2)}</td>
                    <td className="rpt-num">{fmtNum(row.fz.max / 1e3, 2)}</td>
                    {anyMy && <td className="rpt-num">{myCell(id, row.my.min)}</td>}
                    {anyMy && <td className="rpt-num">{myCell(id, row.my.max)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
            {t(
              "report.reactionSignNote",
              "Tekenconventie: Fx positief naar rechts, Fz positief omhoog (reactie op de constructie).",
            )}
          </p>
        </>
      )}
    </div>
  );
}
