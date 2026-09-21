/**
 * CheckPanel — uitklapbaar toetsingspaneel naast het model.
 *
 * Per staaf een kaart met profiel/klasse, maatgevende UC en status;
 * uitklapbaar de volledige afleiding per toets (CheckBlock, KaTeX).
 * Staal (EN 1993), hout en kruislaaghout (EN 1995), beton (EN 1992) en de
 * vrije spanningstoets staan gemerged in één lijst — het NamedCheck-contract
 * is identiek. Bij de vrije spanningstoets komt daar de doorsnedetekening met
 * het spanningsverloop bovenop, want daar zit de uitleg in het BEELD.
 * Niet-toetsbare staven staan er met expliciete reden bij.
 *
 * WAT MAATGEVEND IS staat er zonder zoeken (issue #41): bovenaan het paneel
 * het maatgevende onderdeel van het model en per materiaal, per kaart een
 * regel met de maatgevende toets, haar combinatie en positie, en in de kaart
 * de lijst van alle toetsen met een balkje per unity check. De afleiding
 * daarvan staat in `lib/maatgevend.ts`; hier wordt alleen getoond.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCheckStore } from "../../stores/checkStore";
import {
  gradeLabel,
  isSteelCheckResult,
  isStressCheckResult,
  normLabel,
  sectionLabel,
  type MemberCheckResult,
} from "../../lib/checkTypes";
import type { SpanningBeamCheckResult } from "../../lib/types/spanning/SpanningBeamCheckResult";
import SpanningDoorsnedeTekening from "../spanning/SpanningDoorsnedeTekening";
import CheckBlock from "./CheckBlock";
import VariantenBlok from "./VariantenBlok";
import { OvergeslagenPlaten, PlaatToetsKaart } from "./PlaatToetsKaart";
import {
  maatgevendVanStaaf,
  modelMaatgevend,
  sorteerRegels,
  ucKlasse,
  type MaatgevendOverzicht,
  type ToetsVolgorde,
} from "../../lib/maatgevend";
import {
  MaatgevendRegel,
  ModelMaatgevendBlok,
  ToetsLijst,
  type CombinatieNamen,
  type TekenvlakDoel,
} from "./MaatgevendBlokken";
import "./CheckPanel.css";

interface CheckPanelProps {
  /** Draait de gecombineerde normtoetsing (staal + hout). */
  onRun?: () => void;
  onClose?: () => void;
  onExport?: () => void;
  /** Omvat ook de FEM- en fysische ronde vóór de normtoetsing. */
  running?: boolean;
  /**
   * Focus op één staaf (UC-badge op het canvas geklikt): de kaart van deze
   * staaf klapt open en scrollt in beeld. Elke klik levert een NIEUW object
   * zodat een tweede klik op dezelfde badge opnieuw scrollt.
   */
  focus?: { beamId: number } | null;
  /**
   * Klik op een maatgevende regel: zet het tekenvlak op die staaf of plaat, op
   * de combinatie van de toets, en markeer de positie. Ontbreekt de prop, dan
   * zijn de regels gewone tekst.
   */
  onToonOpTekenvlak?: (doel: TekenvlakDoel) => void;
}

/** De bestaande kleurklassen van het paneel, op de grenzen uit `lib/maatgevend`. */
const UC_CSS = { goed: "cp-uc-ok", letop: "cp-uc-warn", overschreden: "cp-uc-fail" } as const;
function ucClass(uc: number): string {
  return UC_CSS[ucKlasse(uc)];
}

/**
 * De doorsnede met het spanningsverloop, boven de afleidingen. Alleen de
 * vrije spanningstoets levert dit; bij de normkernen valt het weg.
 */
function SpanningFiguur({ r }: { r: SpanningBeamCheckResult }) {
  const { t } = useTranslation("check");
  const v = r.verloop;
  if (!v) {
    return r.notes.length > 0 ? (
      <ul className="cp-spanning-notes">
        {r.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    ) : null;
  }
  const g = (x: number, d = 2) => x.toLocaleString("nl-NL", { maximumFractionDigits: d });
  return (
    <>
      <div className="cp-spanning-figuur">
        <SpanningDoorsnedeTekening
          naam={r.section.naam}
          lagen={r.section.lagen}
          hoogteMm={r.section.hoogte_mm}
          breedteMaxMm={r.section.breedte_max_mm}
          zCMm={r.section.z_c_mm}
          vezels={v.vezels}
          zMaatgevendMm={v.z_maatgevend_mm}
          fDMpa={r.f_d_mpa}
        />
        <div className="cp-spanning-bijschrift">
          {t("panel.stressAt", { x: g(v.position_mm, 0), combinatie: v.combination_id })} — N = {g(v.n_ed_kn)} kN, V<sub>z</sub> ={" "}
          {g(v.vz_ed_kn)} kN, M<sub>y</sub> = {g(v.my_ed_knm)} kNm
          {v.sigma_z_mpa !== 0 && <>, σ<sub>z</sub> = {g(v.sigma_z_mpa)} N/mm²</>}. {t("panel.tensionPositive")}; f<sub>d</sub> = {g(r.f_d_mpa)} N/mm².
        </div>
      </div>
      {r.notes.length > 0 && (
        <ul className="cp-spanning-notes">
          {r.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function MemberCard({ result, focusToken, namen, onToon }: {
  result: MemberCheckResult;
  /** Niet-null → kaart openklappen + in beeld scrollen (badge-klik). */
  focusToken?: { beamId: number } | null;
  namen?: CombinatieNamen;
  onToon?: (doel: TekenvlakDoel) => void;
}) {
  const { t } = useTranslation("check");
  const [open, setOpen] = useState(false);
  // Standaard op unity check, hoogste eerst: wie een kaart openklapt wil eerst
  // zien wat er knelt. De kern levert de toetsen in de volgorde waarin ze
  // berekend zijn (druk, buiging, afschuiving, …); die normvolgorde blijft een
  // keuze, voor wie het rapport ernaast legt.
  const [volgorde, setVolgorde] = useState<ToetsVolgorde>("uc");
  const cardRef = useRef<HTMLDivElement>(null);
  const overzicht = useMemo(() => maatgevendVanStaaf(result), [result]);

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
            <span className="cp-card-code">{normLabel(result)}</span>
          </div>
          <div className="cp-card-profile">
            {sectionLabel(result)}{" "}
            <span className="cp-card-grade">
              ({gradeLabel(result)})
            </span>
          </div>
        </div>
        <div className={`cp-card-uc ${ucClass(result.uc_max)}`}>
          {result.uc_max.toFixed(2)}
        </div>
        <div className={`cp-card-badge cp-badge-${result.status.toLowerCase()}`}>
          {result.status === "Ok" ? t("statusOk") : result.status === "NotOk" ? t("statusNotOk") : t("statusNa")}
        </div>
      </button>

      {/* De maatgevende toets met haar combinatie en positie — buiten de knop
          van de kop, want deze regel heeft zijn eigen handeling (naar het
          tekenvlak). De leesbare toetsnaam, niet de interne sleutel. */}
      <MaatgevendRegel overzicht={overzicht} namen={namen} onToon={onToon} />

      {/* Toetsen die NIET uitgevoerd konden worden (basisaudit ruw 55). Ze
          staan BUITEN het openklapbare deel: de badge zegt "n.v.t." en dan
          hoort er zonder klikken bij te staan wat er niet getoetst is. De reden
          zelf staat in de notes van die toets, een klik verderop. */}
      {"niet_uitgevoerd" in result
        && Array.isArray((result as { niet_uitgevoerd?: unknown[] }).niet_uitgevoerd)
        && (result as { niet_uitgevoerd: { titel: string }[] }).niet_uitgevoerd.length > 0 && (
        <div className="cp-card-onuitgevoerd">
          {t("nietUitgevoerd")}:{" "}
          {(result as { niet_uitgevoerd: { titel: string }[] }).niet_uitgevoerd
            .map((n) => n.titel).join(", ")}
        </div>
      )}

      {open && (
        <div className="cp-card-body">
          {isStressCheckResult(result) && <SpanningFiguur r={result} />}
          {/* Naburige doorsneden — staat vóór de afleidingen omdat de vraag
              "kan het een maatje kleiner?" bij het OPENVOUWEN gesteld wordt,
              niet na twintig KaTeX-blokken. Rekent pas op verzoek. */}
          <VariantenBlok beamId={result.beam_id} />
          <ToetsLijst
            overzicht={overzicht}
            volgorde={volgorde}
            onVolgorde={setVolgorde}
            namen={namen}
            onToon={onToon}
          />
          {/* De afleidingen in dezelfde volgorde als de lijst erboven. */}
          {sorteerRegels(overzicht.regels, volgorde).map((regel) => {
            const named = result.checks.find((c) => c.id === regel.id);
            return named ? (
              <CheckBlock key={named.id} check={named.kind.data} maatgevend={regel.maatgevend} />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

export function CheckPanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation("common");
  return <button className="properties-check-toggle" aria-expanded={open}
    aria-controls={open ? "member-check-panel" : undefined} onClick={onToggle}>
    {t("checkPanelControls.open")} <span aria-hidden="true">{open ? "▾" : "▸"}</span>
  </button>;
}

export default function CheckPanel({
  onRun, onClose, onExport, running = false, focus, onToonOpTekenvlak,
}: CheckPanelProps) {
  const { t } = useTranslation("check");
  const results = useCheckStore((s) => s.results);
  const skipped = useCheckStore((s) => s.skipped);
  const checkRunning = useCheckStore((s) => s.isRunning);
  const isRunning = running || checkRunning;
  const { t: tCommon } = useTranslation("common");
  const error = useCheckStore((s) => s.error);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  const plateResults = useCheckStore((s) => s.plateResults);
  const plateSkipped = useCheckStore((s) => s.plateSkipped);
  const heeftPlaten = plateResults.length > 0 || plateSkipped.length > 0;
  const combinaties = useCheckStore((s) => s.lastRunData?.combinations);
  const namen = useMemo<CombinatieNamen>(
    () => new Map((combinaties ?? []).map((c) => [c.id, c.name])),
    [combinaties],
  );
  const model = useMemo(() => modelMaatgevend(results, plateResults), [results, plateResults]);

  // De focus komt van twee kanten: de UC-badge op het tekenvlak (prop) en het
  // modeloverzicht hierboven. Beide maken een NIEUW object, zodat een tweede
  // klik op hetzelfde onderdeel opnieuw openklapt en scrollt.
  const [kaartFocus, setKaartFocus] = useState<{ beamId?: number; plateId?: number } | null>(null);
  useEffect(() => { setKaartFocus(focus ?? null); }, [focus]);
  const kiesOnderdeel = (o: MaatgevendOverzicht) => {
    setKaartFocus(o.isPlaat ? { plateId: o.objectId } : { beamId: o.objectId });
    const m = o.maatgevend;
    onToonOpTekenvlak?.({
      ...(o.isPlaat ? { plateId: o.objectId } : { beamId: o.objectId }),
      combinatieId: m?.combinatieId ?? null,
      positieMm: m?.positieMm ?? null,
    });
  };

  const okCount = results.filter((r) => r.status === "Ok").length;
  const notOkCount = results.filter((r) => r.status === "NotOk").length;
  const lastRunTime = lastRunAt
    ? new Date(lastRunAt).toLocaleTimeString("nl-NL", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : null;

  return (
    <div className="check-panel" id="member-check-panel">
      <div className="cp-toolbar">
        <span className="cp-title">{t("title")}</span>
        {onClose && <button className="cp-close-btn" onClick={onClose}
          title={tCommon("close")} aria-label={tCommon("close")}>×</button>}
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
        {onExport && <button className="cp-export-btn" onClick={onExport}
          disabled={isRunning || results.length === 0}>{tCommon("checkPanelControls.export")}</button>}
      </div>
      <div className="cp-provenance">{tCommon("resultView.ucCombinations")}</div>

      <div className="cp-body">
        {error && <div className="cp-error">{error}</div>}

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

        {results.length === 0 && !error && !heeftPlaten && (
          <div className="cp-empty">
            <p className="cp-empty-title">{t("emptyTitle")}</p>
            <p className="cp-empty-hint">{t("emptyHint")}</p>
          </div>
        )}

        <ModelMaatgevendBlok model={model} namen={namen} onKies={kiesOnderdeel} />

        {results.map((r) => (
          <MemberCard
            key={`${isSteelCheckResult(r) ? "s" : "t"}-${r.beam_id}`}
            result={r}
            focusToken={
              kaartFocus && kaartFocus.beamId === r.beam_id
                ? (kaartFocus as { beamId: number })
                : null
            }
            namen={namen}
            onToon={onToonOpTekenvlak}
          />
        ))}

        {/* Platen (wandschijven): een eigen lijst na de staven. Het
            staafcontract is per staaf-id, en een plaatnummer kan gelijk zijn
            aan een staafnummer — daarom niet in dezelfde lijst. */}
        {heeftPlaten && (
          <>
            <div className="cp-title" style={{ margin: "10px 0 4px" }}>{t("plaat.titel")}</div>
            <OvergeslagenPlaten skipped={plateSkipped} open={plateResults.length === 0} />
            {plateResults.map((r) => (
              <PlaatToetsKaart
                key={`p-${r.plate_id}`}
                result={r}
                focusToken={kaartFocus && kaartFocus.plateId === r.plate_id ? kaartFocus : null}
                namen={namen}
                onToon={onToonOpTekenvlak}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
