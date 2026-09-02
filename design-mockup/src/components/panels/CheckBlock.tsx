/**
 * CheckBlock — volledige afleiding van één toets (EN 1993 of EN 1995) in het
 * toetsingspaneel.
 *
 * Zet de afleiding in dezelfde drie stappen als het rapport: de formule
 * symbolisch, dan met ingevulde getallen, dan de uitkomst met eenheid — met
 * de is-gelijktekens onder elkaar — en sluit af met de unity check tegen 1,0.
 * De LaTeX daarvoor komt uit checkReportUtils, zodat paneel en rapport
 * gegarandeerd hetzelfde verhaal vertellen.
 *
 * Het datacontract (ResistanceCalc/StabilityCalc) is identiek voor staal en
 * hout.
 */
import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./CheckPanel.css";

import type { ResistanceCalc } from "../../lib/types/steel/ResistanceCalc";
import type { StabilityCalc } from "../../lib/types/steel/StabilityCalc";
import type { NamedValue } from "../../lib/types/steel/NamedValue";
import {
  afleidingLatex,
  splitsArtikel,
  unityCheckLatex,
} from "../report/checkReportUtils";

export type CheckLike = ResistanceCalc | StabilityCalc;

function isStability(c: CheckLike): c is StabilityCalc {
  return "intermediate_values" in c;
}

function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false });
  } catch {
    return `<code>${latex}</code>`;
  }
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "Ok" ? "check-status-ok" :
    status === "NotOk" ? "check-status-notok" : "check-status-na";
  const label =
    status === "Ok" ? "✓ OK" :
    status === "NotOk" ? "✗ NIET OK" : "N.v.t.";
  return <span className={`check-status ${cls}`}>{label}</span>;
}

/** Waardenlijst met uitgelijnde is-gelijktekens (symbool = getal eenheid). */
function VariableLine({ vars }: { vars: NamedValue[] }) {
  if (!vars.length) return null;
  return (
    <div className="check-variables">
      {vars.map((v, i) => (
        <div key={i} className="check-var">
          <span
            className="var-symbol"
            dangerouslySetInnerHTML={{ __html: renderLatex(v.symbol, false) }}
          />
          <span className="var-eq">=</span>
          <span>
            <span className="var-value">
              {v.value.toLocaleString("nl-NL", { maximumFractionDigits: 3 })}
            </span>
            {v.unit && v.unit !== "-" && <span className="var-unit"> {v.unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** nl-notatie, gelijk aan het rapport (decimaalkomma). */
function nl(v: number, digits: number): string {
  return v.toLocaleString("nl-NL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function CheckBlock({ check }: { check: CheckLike }) {
  const formulaRef = useRef<HTMLDivElement>(null);
  const ucRef = useRef<HTMLDivElement>(null);

  const { latex, ongebruikt } = afleidingLatex(check);
  const { artikel, vergelijking } = splitsArtikel(check.article);

  useEffect(() => {
    if (formulaRef.current) formulaRef.current.innerHTML = renderLatex(latex, true);
  }, [latex]);

  useEffect(() => {
    if (ucRef.current && check.uc) {
      ucRef.current.innerHTML = renderLatex(unityCheckLatex(check.uc), true);
    }
  }, [check.uc]);

  const intermediates = isStability(check) ? check.intermediate_values : [];

  return (
    <div className="check-block">
      <div className="check-header">
        <h3 className="check-title">{check.title}</h3>
        <span className="check-article">{artikel}</span>
      </div>

      <div className="check-force-state">
        Combinatie {check.force_state.combination_id}
        &nbsp;&nbsp; x = {nl(check.force_state.position_mm, 0)} mm
        &nbsp;&nbsp; N = {nl(check.force_state.forces.n_ed, 2)} kN
        &nbsp;&nbsp; V<sub>z</sub> = {nl(check.force_state.forces.vz_ed, 2)} kN
        &nbsp;&nbsp; M<sub>y</sub> = {nl(check.force_state.forces.my_ed, 2)} kNm
      </div>

      {/* Symbolisch → ingevuld → uitkomst, met het vergelijkingsnummer rechts. */}
      <div className="check-derivation">
        <div className="check-formula" ref={formulaRef} />
        {vergelijking && <span className="check-eq">({vergelijking})</span>}
      </div>

      {/* Wat niet in de formule ingevuld kon worden, staat hier alsnog. */}
      <VariableLine vars={ongebruikt} />

      {check.uc && (
        <div className="check-uc-line">
          <div className="check-uc-formula" ref={ucRef} />
          <StatusBadge status={check.status} />
        </div>
      )}

      {intermediates.length > 0 && (
        <details className="check-intermediates">
          <summary>Tussenwaarden ({intermediates.length})</summary>
          <VariableLine vars={intermediates} />
        </details>
      )}

      {check.notes.length > 0 && (
        <ul className="check-notes">
          {check.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
