/**
 * PlateCheckSection — de normtoets van de platen (wandschijven), uitgeschreven.
 *
 * Opbouw:
 *  1. een overzicht per plaat: materiaal, dikte, norm, maatgevende UC met
 *     element en combinatie, status — of de reden waarom de plaat niet
 *     getoetst is;
 *  2. per getoetste plaat: het maatgevende element per combinatie, wat NIET
 *     getoetst is (met reden), de toelichting en de afleiding op het
 *     maatgevende punt — met dezelfde afleidingsblokken als de staaftoetsing.
 *
 * Detailniveau (reportStore.toetsingDetail): beknopt schrijft per plaat alleen
 * de maatgevende toets uit, zonder deelstappen — dezelfde afspraak als bij de
 * staven. Het overzicht en "niet getoetst" staan er altijd: die zijn de
 * conclusie en haar grens.
 *
 * Rekent niets: alles komt uit de kern (`check_plates`) via de checkStore.
 */
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import { useCheckStore } from "../../../stores/checkStore";
import { useReportStore } from "../../../stores/reportStore";
import { useReportData } from "../ReportDataContext";
import { CHECK_REPORT_CSS, fmtCheckedAt, fmtUc, fmtValue, statusClass, statusLabel } from "../checkReportUtils";
import { DerivationBlock } from "./CheckDetailSection";
import type { PlateCheckResult } from "../../../lib/types/plaat/PlateCheckResult";
import type { PlaatSkip } from "../../../lib/plaatCheckBuilder";

export default function PlateCheckSection() {
  const plateResults = useCheckStore((s) => s.plateResults);
  const plateSkipped = useCheckStore((s) => s.plateSkipped);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const gedetailleerd = useReportStore((s) => s.toetsingDetail === "gedetailleerd");
  const { plates, combinations } = useReportData();
  return (
    <PlaatToetsRapport
      plateResults={plateResults}
      plateSkipped={plateSkipped}
      lastRunAt={lastRunAt}
      gedetailleerd={gedetailleerd}
      aantalPlaten={plates.length}
      combinations={combinations}
    />
  );
}

/**
 * De inhoud van de sectie, los van de stores — zodat hij zonder app te renderen
 * en te toetsen is (`test-plaat-toets-weergave.mjs`).
 */
export function PlaatToetsRapport({
  plateResults,
  plateSkipped,
  lastRunAt,
  gedetailleerd,
  aantalPlaten,
  combinations,
}: {
  plateResults: PlateCheckResult[];
  plateSkipped: PlaatSkip[];
  lastRunAt: number | null;
  gedetailleerd: boolean;
  aantalPlaten: number;
  combinations: readonly { id: number; name: string }[];
}) {
  const { t } = useTranslation("ribbon");

  const title = t("report.sectionPlateCheck", "Toetsing platen");
  const comboNaam = (id: number | undefined) =>
    id === undefined ? "—" : combinations.find((c) => c.id === id)?.name ?? String(id);

  if (aantalPlaten === 0) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{title}</h2>
        <p className="rpt-empty-note">{t("report.noPlates", "Geen platen in het model.")}</p>
      </div>
    );
  }
  if (plateResults.length === 0 && plateSkipped.length === 0) {
    return (
      <div className="rpt-block">
        <h2 className="rpt-h2">{title}</h2>
        <p className="rpt-empty-note">
          {t("report.notChecked", "Nog niet getoetst — voer de normtoetsing uit via het tabblad Toetsing.")}
        </p>
      </div>
    );
  }

  const checkedTime = fmtCheckedAt(lastRunAt);
  const getoetst = plateResults.filter((r) => r.geweigerd === undefined);

  return (
    <div className="rpt-block rpt-chk-detail">
      <style>{CHECK_REPORT_CSS}</style>
      <h2 className="rpt-h2">{title}</h2>
      <p className="rpt-note">
        {checkedTime && `${t("report.checkedAt", "Toetsing uitgevoerd op")} ${checkedTime}. `}
        {t("report.plaatToetsNoot")}
      </p>

      {/* ── 1. Overzicht ── */}
      <table className="rpt-table">
        <thead>
          <tr>
            <th>{t("report.colPlate", "Plaat")}</th>
            <th>{t("report.plaatMateriaal")}</th>
            <th className="rpt-num">t [mm]</th>
            <th>{t("report.plaatNorm")}</th>
            <th className="rpt-num">{t("report.colUc", "UC")}</th>
            <th>{t("report.colGoverningElem", "Maatgevend element")}</th>
            <th>{t("report.colGoverningCombo", "Maatgevende combinatie")}</th>
            <th>{t("report.plaatStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {plateResults.map((r) => (
            <tr key={r.plate_id}>
              <td>{r.plate_id}</td>
              <td>{r.materiaal}</td>
              <td className="rpt-num">{fmtValue(r.thickness_mm, 1)}</td>
              {r.geweigerd !== undefined ? (
                <td colSpan={5}>
                  {t("report.plaatGeweigerd")}: {r.geweigerd}
                </td>
              ) : (
                <>
                  <td>{r.norm}</td>
                  <td className={`rpt-num${r.uc_max > 1 ? " rpt-uc-fail" : ""}`}>{fmtUc(r.uc_max)}</td>
                  <td className="rpt-num">{r.governing_element_id ?? "—"}</td>
                  <td>{comboNaam(r.governing_combination_id)}</td>
                  <td>
                    <span className={`rpt-chk-status ${statusClass(r.status)}`}>{statusLabel(t, r.status)}</span>
                  </td>
                </>
              )}
            </tr>
          ))}
          {plateSkipped.map((s) => (
            <tr key={`s${s.plateId}`}>
              <td>{s.plateId}</td>
              <td colSpan={7}>
                {t("report.plaatOvergeslagen")}: {s.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── 2. Per getoetste plaat ── */}
      {getoetst.map((r) => {
        const toetsen = gedetailleerd
          ? r.checks
          : r.checks.filter((c) => c.id === r.governing_check_id);
        return (
          <div className="rpt-chk-member" key={r.plate_id}>
            <h3 className="rpt-h3">
              {t("report.colPlate", "Plaat")} {r.plate_id} — {r.materiaal} (t = {fmtValue(r.thickness_mm, 1)} mm)
            </h3>
            <div className="rpt-chk-member-meta">
              <span>{r.norm}</span>
              <span className={`rpt-chk-member-uc${r.uc_max > 1 ? " rpt-uc-fail" : ""}`}>
                {t("report.colUc", "UC")} = {fmtUc(r.uc_max)}
              </span>
              <span className={`rpt-chk-status ${statusClass(r.status)}`}>{statusLabel(t, r.status)}</span>
            </div>

            {r.niet_getoetst.length > 0 && (
              <>
                <p className="rpt-note"><strong>{t("report.plaatNietGetoetst")}</strong></p>
                <ul className="rpt-chk-notes">
                  {r.niet_getoetst.map((n) => (
                    <li key={n.id}>
                      <strong>{n.titel}</strong> — {n.reden}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <table className="rpt-table">
              <thead>
                <tr>
                  <th>{t("report.colGoverningCombo", "Maatgevende combinatie")}</th>
                  <th className="rpt-num">{t("report.colUc", "UC")}</th>
                  <th>{t("report.colGoverningElem", "Maatgevend element")}</th>
                </tr>
              </thead>
              <tbody>
                {r.combinaties.map((c) => (
                  <tr key={c.combination_id}>
                    <td>{comboNaam(c.combination_id)}</td>
                    <td className={`rpt-num${c.uc > 1 ? " rpt-uc-fail" : ""}`}>{fmtUc(c.uc)}</td>
                    <td className="rpt-num">{c.element_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {r.notes.length > 0 && (
              <ul className="rpt-chk-notes">
                {r.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}

            {toetsen.map((named) => (
              <DerivationBlock
                key={named.id}
                check={named.kind.data}
                governing={named.id === r.governing_check_id}
                metTussenwaarden={gedetailleerd}
                krachtregel={`${t("report.combination", "Combinatie")} ${comboNaam(named.kind.data.force_state.combination_id)} — ${t("report.plaatElementgemiddeld")}`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
