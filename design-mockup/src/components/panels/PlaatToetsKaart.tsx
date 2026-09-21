/**
 * PlaatToetsKaart — de plaattoets (wandschijven) in het toetsingspaneel.
 *
 * Eén kaart per plaat, in dezelfde vorm als een staafkaart: kop met materiaal,
 * dikte en norm, de maatgevende UC en de status; uitklapbaar de afleiding op
 * het maatgevende element. Wat NIET getoetst is staat zonder klikken onder de
 * kop, net als bij een staaf — en een geweigerde plaat toont alleen haar reden,
 * nooit een UC.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlateCheckResult } from "../../lib/types/plaat/PlateCheckResult";
import type { PlaatSkip } from "../../lib/plaatCheckBuilder";
import { maatgevendVanPlaat, sorteerRegels, ucKlasse, type ToetsVolgorde } from "../../lib/maatgevend";
import CheckBlock from "./CheckBlock";
import { ToetsLijst, type CombinatieNamen, type TekenvlakDoel } from "./MaatgevendBlokken";
import "./CheckPanel.css";

const UC_CSS = { goed: "cp-uc-ok", letop: "cp-uc-warn", overschreden: "cp-uc-fail" } as const;
function ucClass(uc: number): string {
  return UC_CSS[ucKlasse(uc)];
}

const nl = (v: number, d: number) => v.toLocaleString("nl-NL", { maximumFractionDigits: d });

export function PlaatToetsKaart({ result, focusToken, namen, onToon }: {
  result: PlateCheckResult;
  /** Niet-null → kaart openklappen en in beeld scrollen (klik in het modeloverzicht). */
  focusToken?: object | null;
  namen?: CombinatieNamen;
  onToon?: (doel: TekenvlakDoel) => void;
}) {
  const { t } = useTranslation("check");
  const [open, setOpen] = useState(false);
  const [volgorde, setVolgorde] = useState<ToetsVolgorde>("uc");
  const cardRef = useRef<HTMLDivElement>(null);
  // Zelfde afleiding als bij een staaf (`lib/maatgevend`): een plaat heeft
  // geen positie x maar een element, en alleen bij haar maatgevende toets.
  const overzicht = useMemo(() => maatgevendVanPlaat(result), [result]);
  useEffect(() => {
    if (!focusToken) return;
    setOpen(true);
    requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [focusToken]);
  const geweigerd = result.geweigerd !== undefined;
  const status = result.status;
  const maatgevend = result.checks.find((c) => c.id === result.governing_check_id);

  return (
    <div ref={cardRef} className={`cp-card cp-status-${status.toLowerCase()}`}>
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
              {t("governing")}: {maatgevend.kind.data.title}
              {result.governing_element_id != null && result.governing_combination_id != null && (
                <> — {t("plaat.elementInCombinatie", {
                  element: result.governing_element_id,
                  combinatie: result.governing_combination_id,
                })}</>
              )}
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

      {/* Benodigde wapening (bijlage F); de uitgevoerde controles en
          beperkingen volgen uit het kernresultaat, niet uit deze samenvatting. */}
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
          {/* Wat niet getoetst is staat met zijn reden in de toetslijst
              hieronder, op dezelfde plek als bij een staaf. */}
          {result.notes.length > 0 && (
            <ul className="cp-spanning-notes">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <ToetsLijst
            overzicht={overzicht}
            volgorde={volgorde}
            onVolgorde={setVolgorde}
            namen={namen}
            onToon={onToon}
          />
          {sorteerRegels(overzicht.regels, volgorde).map((regel) => {
            const named = result.checks.find((c) => c.id === regel.id);
            return named ? (
              <CheckBlock
                key={named.id}
                check={named.kind.data}
                maatgevend={regel.maatgevend}
                krachtregel={t("plaat.krachtregel", {
                  combinatie: named.kind.data.force_state.combination_id,
                })}
              />
            ) : null;
          })}
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
