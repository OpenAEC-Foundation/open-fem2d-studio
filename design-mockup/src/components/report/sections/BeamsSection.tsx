/**
 * BeamsSection — invoertabel staven: id, knopen, lengte (afgeleid uit de
 * knoopcoördinaten), materiaal, profiel, scharnieren en — waar ingesteld —
 * de kernvelden van de toetsconfiguratie (kniklengtes/kipsteunen) compact.
 * Leest live uit de ReportDataContext.
 */
import { useTranslation } from "react-i18next";
import type { Beam } from "../../fem/femTypes";
import { beamLengthMm } from "../../../lib/steelCheckBuilder";
import { useReportData } from "../ReportDataContext";
import { fmtLenM, fmtNum } from "../reportFormat";

/** Scharnieren compact: "begin: Ry · einde: Ry" — leeg = star ("—"). */
function releasesText(beam: Beam): string {
  const r = beam.releases;
  if (!r) return "—";
  const side = (tx?: boolean, tz?: boolean, ry?: boolean): string =>
    [tx && "Tx", tz && "Tz", ry && "Ry"].filter(Boolean).join(",");
  const start = side(r.startTx, r.startTz, r.startRy);
  const end = side(r.endTx, r.endTz, r.endRy);
  if (!start && !end) return "—";
  const parts: string[] = [];
  if (start) parts.push(`begin: ${start}`);
  if (end) parts.push(`einde: ${end}`);
  return parts.join(" · ");
}

/** Kern van de toetsconfig: alleen expliciet ingestelde velden, compact. */
function checkConfigText(beam: Beam): string {
  const cfg = beam.checkConfig;
  if (!cfg) return "—";
  const parts: string[] = [];
  if (cfg.bucklingLengthY_m !== undefined) {
    parts.push(`Lcr,y = ${fmtNum(cfg.bucklingLengthY_m, 2)} m`);
  }
  if (cfg.bucklingLengthZ_m !== undefined) {
    parts.push(`Lcr,z = ${fmtNum(cfg.bucklingLengthZ_m, 2)} m`);
  }
  if (cfg.lateralRestraints && cfg.lateralRestraints.length > 0) {
    const pos = cfg.lateralRestraints.map((f) => `${fmtNum(f, 2)}·L`).join(", ");
    parts.push(`kipsteunen: ${pos}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function BeamsSection() {
  const { t } = useTranslation("ribbon");
  const { nodes, beams } = useReportData();

  const sorted = [...beams].sort((a, b) => a.id - b.id);
  const anyCheckConfig = sorted.some((b) => checkConfigText(b) !== "—");

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionBeams", "Staven")}</h2>

      {sorted.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noBeams", "Geen staven in het model.")}
        </p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              <th>{t("report.colId", "Id")}</th>
              <th>{t("report.colNodes", "Knopen")}</th>
              <th className="rpt-num">{t("report.colLength", "Lengte [m]")}</th>
              <th>{t("report.colMaterial", "Materiaal")}</th>
              <th>{t("report.colProfile", "Profiel")}</th>
              <th>{t("report.colHinges", "Scharnieren")}</th>
              {anyCheckConfig && (
                <th>{t("report.colCheckConfig", "Toetsconfiguratie")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id}>
                <td>{b.id}</td>
                <td>{b.from} → {b.to}</td>
                <td className="rpt-num">{fmtLenM(beamLengthMm(b, nodes))}</td>
                <td>{b.material ?? "S235"}</td>
                <td>{b.profile ?? "HEA160"}</td>
                <td>{releasesText(b)}</td>
                {anyCheckConfig && <td>{checkConfigText(b)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
