/**
 * PlaatToetsKaart — de plaattoets (wandschijven) in het toetsingspaneel.
 *
 * Eén kaart per plaat, in dezelfde vorm als een staafkaart: kop met materiaal,
 * dikte en norm, de maatgevende UC en de status; uitklapbaar de afleiding op
 * het maatgevende element. Wat NIET getoetst is staat zonder klikken onder de
 * kop, net als bij een staaf — en een geweigerde plaat toont alleen haar reden,
 * nooit een UC.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlateCheckResult } from "../../lib/types/plaat/PlateCheckResult";
import type { PlaatSkip } from "../../lib/plaatCheckBuilder";
import CheckBlock from "./CheckBlock";
import "./CheckPanel.css";

function ucClass(uc: number): string {
  if (uc > 1.0) return "cp-uc-fail";
  if (uc > 0.9) return "cp-uc-warn";
  return "cp-uc-ok";
}

const nl = (v: number, d: number) => v.toLocaleString("nl-NL", { maximumFractionDigits: d });

export function PlaatToetsKaart({ result }: { result: PlateCheckResult }) {
  const { t } = useTranslation("check");
  const [open, setOpen] = useState(false);
  const geweigerd = result.geweigerd !== undefined;
  const status = result.status;
  const maatgevend = result.checks.find((c) => c.id === result.governing_check_id);

  return (
    <div className={`cp-card cp-status-${status.toLowerCase()}`}>
      <button className="cp-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <svg
          className={`cp-chevron${open ? " open" : ""}`}
          width="10" height="10" viewBox="0 0 10 10"
          fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="3,2 7,5 3,8" />
        </svg>
        <div className="cp-card-main">
          <div className="cp-card-id">
            {t("plaat.plaat")} {result.plate_id}
            {result.norm && <span className="cp-card-code">{result.norm}</span>}
          </div>
          <div className="cp-card-profile">
            {result.materiaal}{" "}
            <span className="cp-card-grade">(t = {nl(result.thickness_mm, 1)} mm)</span>
          </div>
          {!geweigerd && maatgevend && (
            <div className="cp-card-governing">
              {t("governing")}: {maatgevend.kind.data.title} —{" "}
              {t("plaat.elementInCombinatie", {
                element: result.governing_element_id,
                combinatie: result.governing_combination_id,
              })}
            </div>
          )}
        </div>
        {!geweigerd && (
          <div className={`cp-card-uc ${ucClass(result.uc_max)}`}>{result.uc_max.toFixed(2)}</div>
        )}
        <div className={`cp-card-badge cp-badge-${status.toLowerCase()}`}>
          {status === "Ok" ? t("statusOk") : status === "NotOk" ? t("statusNotOk") : t("statusNa")}
        </div>
      </button>

      {geweigerd && (
        <div className="cp-card-onuitgevoerd">
          {t("plaat.nietGetoetst")}: {result.geweigerd}
        </div>
      )}
      {result.niet_getoetst.length > 0 && (
        <div className="cp-card-onuitgevoerd">
          {t("nietUitgevoerd")}: {result.niet_getoetst.map((n) => n.titel).join(", ")}
        </div>
      )}

      {/* Beton: de benodigde wapening (bijlage F), zonder openklappen — zij
          is de reden dat een betonnen wand "n.v.t." heet. */}
      {result.wapening && (
        <div className="cp-card-onuitgevoerd">
          {t("plaat.wapening", {
            x: nl(result.wapening.max_x.n_td_x_kn_per_m, 1),
            ex: result.wapening.max_x.element_id,
            z: nl(result.wapening.max_z.n_td_z_kn_per_m, 1),
            ez: result.wapening.max_z.element_id,
          })}
        </div>
      )}

      {open && (
        <div className="cp-card-body">
          {result.niet_getoetst.length > 0 && (
            <ul className="cp-spanning-notes">
              {result.niet_getoetst.map((n) => (
                <li key={n.id}>
                  <strong>{n.titel}</strong> — {n.reden}
                </li>
              ))}
            </ul>
          )}
          {result.notes.length > 0 && (
            <ul className="cp-spanning-notes">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {[...result.checks]
            .sort((a, b) => (b.kind.data.uc?.uc ?? -1) - (a.kind.data.uc?.uc ?? -1))
            .map((named) => (
              <CheckBlock
                key={named.id}
                check={named.kind.data}
                krachtregel={t("plaat.krachtregel", {
                  combinatie: named.kind.data.force_state.combination_id,
                })}
              />
            ))}
        </div>
      )}
    </div>
  );
}

/** De platen die niet naar de kern gingen, met reden — zelfde vorm als de overgeslagen staven. */
export function OvergeslagenPlaten({ skipped, open }: { skipped: PlaatSkip[]; open: boolean }) {
  const { t } = useTranslation("check");
  if (skipped.length === 0) return null;
  return (
    <details className="cp-skipped" open={open}>
      <summary>
        {t("plaat.overgeslagenTitel")} ({skipped.length})
      </summary>
      <ul>
        {skipped.map((s) => (
          <li key={s.plateId}>
            <strong>{t("plaat.plaat")} {s.plateId}</strong> — {s.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}
