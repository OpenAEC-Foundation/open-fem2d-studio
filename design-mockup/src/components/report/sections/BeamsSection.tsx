/**
 * BeamsSection — invoertabel staven: id, knopen, lengte (afgeleid uit de
 * knoopcoördinaten), materiaal, profiel, scharnieren en — waar ingesteld —
 * de kernvelden van de toetsconfiguratie (kniklengtes/kipsteunen) compact.
 * Leest live uit de ReportDataContext.
 */
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { Beam } from "../../fem/femTypes";
import { beamLengthMm } from "../../../lib/steelCheckBuilder";
import { useReportData } from "../ReportDataContext";
import {
  HERKOMST_KIPSTEUNEN,
  HERKOMST_OPGEGEVEN,
  HERKOMST_STAAFLENGTE,
  voorspelKniklengte,
} from "../../../lib/kniklengte";
import { fmtLenM, fmtNum } from "../reportFormat";

/** Scharnieren compact: "begin: Ry · einde: Ry" — leeg = star ("—"). */
function releasesText(t: TFunction, beam: Beam): string {
  const r = beam.releases;
  if (!r) return "—";
  const side = (tx?: boolean, tz?: boolean, ry?: boolean): string =>
    [tx && "Tx", tz && "Tz", ry && "Ry"].filter(Boolean).join(",");
  const start = side(r.startTx, r.startTz, r.startRy);
  const end = side(r.endTx, r.endTz, r.endRy);
  if (!start && !end) return "—";
  const parts: string[] = [];
  if (start) parts.push(t("report.releaseStart", { scharnieren: start }));
  if (end) parts.push(t("report.releaseEnd", { scharnieren: end }));
  return parts.join(" · ");
}

/**
 * Kern van de toetsconfig: expliciet ingestelde velden, compact — plus een
 * AFGELEIDE kniklengte om z.
 *
 * Een kniklengte staat hier met haar herkomst. Een opgegeven waarde heet
 * "opgegeven"; een L_cr,z die de rekenkern uit kipsteunen aan boven- én
 * onderflens afleidt, staat er ook als niemand haar invulde — anders zou deze
 * tabel zwijgen over een kniklengte die de toetsing wél gebruikt. De terugval op
 * de staaflengte wordt hier niet herhaald: die staat bij elke knikcontrole zelf,
 * en in deze tabel zou hij bij elke staaf dezelfde ruis geven.
 */
/** De herkomst van een kniklengte, vertaald waar de tekst een bekende herkomst is. */
function herkomstTekst(t: TFunction, herkomst: string): string {
  if (herkomst === HERKOMST_OPGEGEVEN) return t("report.herkomstOpgegeven");
  if (herkomst === HERKOMST_KIPSTEUNEN) return t("report.herkomstKipsteunen");
  if (herkomst === HERKOMST_STAAFLENGTE) return t("report.herkomstStaaflengte");
  return herkomst;
}

function checkConfigText(
  t: TFunction,
  beam: Beam,
  nodes: Parameters<typeof beamLengthMm>[1],
): string {
  const cfg = beam.checkConfig;
  if (!cfg) return "—";
  const parts: string[] = [];
  if (cfg.bucklingLengthY_m !== undefined) {
    parts.push(
      t("report.lcrInHetVlak", {
        l: fmtNum(cfg.bucklingLengthY_m, 2),
        herkomst: herkomstTekst(t, HERKOMST_OPGEGEVEN),
      }),
    );
  }
  const z = voorspelKniklengte(cfg.bucklingLengthZ_m, beamLengthMm(beam, nodes), {
    boven: cfg.lateralRestraints,
    onder: cfg.lateralRestraintsBottom,
  });
  if (z.herkomst !== HERKOMST_STAAFLENGTE) {
    parts.push(
      t("report.lcrUitHetVlak", {
        l: fmtNum(z.lCrMm / 1000, 2),
        herkomst: herkomstTekst(t, z.herkomst),
      }),
    );
  }
  if (cfg.lateralRestraints && cfg.lateralRestraints.length > 0) {
    const pos = cfg.lateralRestraints.map((f) => `${fmtNum(f, 2)}·L`).join(", ");
    parts.push(t("report.kipsteunen", { posities: pos }));
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function BeamsSection() {
  const { t } = useTranslation("ribbon");
  const { nodes, beams } = useReportData();

  const sorted = [...beams].sort((a, b) => a.id - b.id);
  const anyCheckConfig = sorted.some((b) => checkConfigText(t, b, nodes) !== "—");

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
                <td>{releasesText(t, b)}</td>
                {anyCheckConfig && <td>{checkConfigText(t, b, nodes)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
