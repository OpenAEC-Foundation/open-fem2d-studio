import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './CheckBlock.css';

import type { ResistanceCalc } from '../../../lib/types/steel/ResistanceCalc';
import type { StabilityCalc } from '../../../lib/types/steel/StabilityCalc';
import type { NamedValue } from '../../../lib/types/steel/NamedValue';

type CheckLike = ResistanceCalc | StabilityCalc;

interface CheckBlockProps {
  check: CheckLike;
}

function isStability(c: CheckLike): c is StabilityCalc {
  return 'intermediate_values' in c;
}

function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false });
  } catch {
    return `<code>${latex}</code>`;
  }
}

function statusBadge(status: string) {
  const cls =
    status === 'Ok' ? 'check-status-ok' :
    status === 'NotOk' ? 'check-status-notok' : 'check-status-na';
  const label =
    status === 'Ok' ? '✓ OK' :
    status === 'NotOk' ? '✗ NOT OK' : 'N.A.';
  return <span className={`check-status ${cls}`}>{label}</span>;
}

function VariableLine({ vars }: { vars: NamedValue[] }) {
  if (!vars.length) return null;
  return (
    <div className="check-variables">
      {vars.map((v, i) => (
        <span key={i} className="check-var">
          <span className="var-symbol" dangerouslySetInnerHTML={{ __html: renderLatex(v.symbol, false) }} />
          <span className="var-eq"> = </span>
          <span className="var-value">{v.value.toLocaleString('nl-NL', { maximumFractionDigits: 3 })}</span>
          {v.unit && v.unit !== '-' && <span className="var-unit"> {v.unit}</span>}
          {i < vars.length - 1 && <span className="var-sep">, </span>}
        </span>
      ))}
    </div>
  );
}

export const CheckBlock: React.FC<CheckBlockProps> = ({ check }) => {
  const formulaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formulaRef.current && check.formula_latex) {
      formulaRef.current.innerHTML = renderLatex(check.formula_latex, true);
    }
  }, [check.formula_latex]);

  const intermediates = isStability(check) ? check.intermediate_values : [];

  return (
    <div className="check-block">
      <div className="check-header">
        <h3 className="check-title">{check.title}</h3>
        <span className="check-article">{check.article}</span>
      </div>

      <div className="check-force-state">
        Combination: {check.force_state.combination_id}
        &nbsp;&nbsp; x = {check.force_state.position_mm.toFixed(0)} mm
        &nbsp;&nbsp; N<sub>x</sub> = {check.force_state.forces.n_ed.toFixed(2)} kN
        &nbsp;&nbsp; V<sub>z</sub> = {check.force_state.forces.vz_ed.toFixed(2)} kN
        &nbsp;&nbsp; M<sub>y</sub> = {check.force_state.forces.my_ed.toFixed(2)} kNm
      </div>

      {check.formula_latex && (
        <div className="check-formula" ref={formulaRef} />
      )}

      <VariableLine vars={check.variables} />

      <div className="check-result">
        <span className="check-result-label">=</span>
        <span className="check-result-value">
          {check.value.toLocaleString('nl-NL', { maximumFractionDigits: 3 })}
        </span>
        <span className="check-result-unit"> {check.unit}</span>
      </div>

      {check.uc && (
        <div className="check-uc-line">
          <span className="check-uc-formula" dangerouslySetInnerHTML={{ __html: renderLatex(check.uc.formula_latex, false) }} />
          <span> = {check.uc.ed.toLocaleString('nl-NL', { maximumFractionDigits: 3 })} / {check.uc.rd.toLocaleString('nl-NL', { maximumFractionDigits: 3 })} = </span>
          <strong className="check-uc-value">{check.uc.uc.toFixed(2)}</strong>
          {statusBadge(check.status)}
        </div>
      )}

      {intermediates.length > 0 && (
        <details className="check-intermediates">
          <summary>Intermediate values ({intermediates.length})</summary>
          <VariableLine vars={intermediates} />
        </details>
      )}

      {check.notes.length > 0 && (
        <ul className="check-notes">
          {check.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  );
};
