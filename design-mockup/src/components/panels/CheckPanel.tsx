/**
 * CheckPanel — toetsingspaneel achter het ribbon-tabblad "Toetsing".
 *
 * Per staaf een kaart met profiel/klasse, maatgevende UC en status;
 * uitklapbaar de volledige afleiding per toets (CheckBlock, KaTeX).
 * Staal (EN 1993) en hout (EN 1995) staan gemerged in één lijst — het
 * NamedCheck-contract is identiek. Niet-toetsbare staven staan er met
 * expliciete reden bij.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCheckStore } from "../../stores/checkStore";
import { isSteelCheckResult, type MemberCheckResult } from "../../lib/checkTypes";
import { isTauriApp, DESKTOP_ONLY_MSG } from "../../lib/tauri";
import CheckBlock from "./CheckBlock";
import "./CheckPanel.css";

interface CheckPanelProps {
  /** Draait de gecombineerde normtoetsing (staal + hout). */
  onRun?: () => void;
  /**
   * Focus op één staaf (UC-badge op het canvas geklikt): de kaart van deze
   * staaf klapt open en scrollt in beeld. Elke klik levert een NIEUW object
   * zodat een tweede klik op dezelfde badge opnieuw scrollt.
   */
  focus?: { beamId: number } | null;
}

function ucClass(uc: number): string {
  if (uc > 1.0) return "cp-uc-fail";
  if (uc > 0.9) return "cp-uc-warn";
  return "cp-uc-ok";
}

function MemberCard({ result, focusToken }: {
  result: MemberCheckResult;
  /** Niet-null → kaart openklappen + in beeld scrollen (badge-klik). */
  focusToken?: { beamId: number } | null;
}) {
  const { t } = useTranslation("check");
  const [open, setOpen] = useState(false);
  const steel = isSteelCheckResult(result);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusToken) return;
    setOpen(true);
    // Na de render scrollen, zodat het opengeklapte blok al bestaat.
    requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [focusToken]);

  return (
    <div ref={cardRef} className={`cp-card cp-status-${result.status.toLowerCase()}`}>
      <button
        className="cp-card-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
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
            {t("beam")} {result.beam_id}
            <span className="cp-card-code">{steel ? "EN 1993" : "EN 1995"}</span>
          </div>
          <div className="cp-card-profile">
            {steel ? result.profile_name : result.section_name}{" "}
            <span className="cp-card-grade">
              ({steel ? result.steel_grade : result.strength_class})
            </span>
          </div>
          <div className="cp-card-governing">
            {t("governing")}: {result.governing_check_id}
          </div>
        </div>
        <div className={`cp-card-uc ${ucClass(result.uc_max)}`}>
          {result.uc_max.toFixed(2)}
        </div>
        <div className={`cp-card-badge cp-badge-${result.status.toLowerCase()}`}>
          {result.status === "Ok" ? t("statusOk") : result.status === "NotOk" ? t("statusNotOk") : t("statusNa")}
        </div>
      </button>

      {open && (
        <div className="cp-card-body">
          {result.checks.map((named) => (
            <CheckBlock key={named.id} check={named.kind.data} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CheckPanel({ onRun, focus }: CheckPanelProps) {
  const { t } = useTranslation("check");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const isRunning = useCheckStore((s) => s.isRunning);
  const error = useCheckStore((s) => s.error);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);

  const okCount = results.filter((r) => r.status === "Ok").length;
  const notOkCount = results.filter((r) => r.status === "NotOk").length;
  const lastRunTime = lastRunAt
    ? new Date(lastRunAt).toLocaleTimeString("nl-NL", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : null;

  return (
    <div className="check-panel">
      <div className="cp-toolbar">
        <span className="cp-title">{t("title")}</span>
        {results.length > 0 && (
          <span className="cp-stats">
            {t("total")}: <strong>{results.length}</strong>
            <span className="cp-stat-ok">✓ {okCount}</span>
            <span className="cp-stat-notok">✗ {notOkCount}</span>
            {lastRunTime && <span className="cp-stat-time">· {lastRunTime}</span>}
          </span>
        )}
        <button className="cp-run-btn" onClick={onRun} disabled={isRunning || !onRun}>
          {isRunning ? t("running") : t("run")}
        </button>
      </div>

      <div className="cp-body">
        {error && <div className="cp-error">{error}</div>}

        {!isTauriApp() && (
          <div className="cp-desktop-note">{DESKTOP_ONLY_MSG}</div>
        )}

        {skipped.length > 0 && (
          <details className="cp-skipped" open={results.length === 0}>
            <summary>
              {t("skippedTitle")} ({skipped.length})
            </summary>
            <ul>
              {skipped.map((s, i) => (
                <li key={i}>
                  <strong>{t("beam")} {s.beamId}</strong> — {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        {results.length === 0 && !error && isTauriApp() && (
          <div className="cp-empty">
            <p className="cp-empty-title">{t("emptyTitle")}</p>
            <p className="cp-empty-hint">{t("emptyHint")}</p>
          </div>
        )}

        {results.map((r) => (
          <MemberCard
            key={`${isSteelCheckResult(r) ? "s" : "t"}-${r.beam_id}`}
            result={r}
            focusToken={focus && focus.beamId === r.beam_id ? focus : null}
          />
        ))}
      </div>
    </div>
  );
}
