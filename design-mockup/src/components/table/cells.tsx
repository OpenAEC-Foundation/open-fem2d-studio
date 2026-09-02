/**
 * cells — bewerkbare celcomponenten voor de tabel-editor.
 *
 * Conventies (zelfde gedrag als de invoervelden in FemProperties):
 *  - commit op blur of Enter; Escape draait de invoer terug zonder commit;
 *  - numerieke invoer accepteert zowel komma als punt als decimaalteken;
 *  - een commit-handler mag `false` retourneren om een ongeldige waarde te
 *    weigeren — de cel springt dan terug naar de modelwaarde;
 *  - klikken in een cel selecteert niet meteen de rij (stopPropagation),
 *    zodat bewerken en rij-selectie elkaar niet in de weg zitten.
 */
import { useState, useEffect, useRef } from "react";

/** Parseer numerieke invoer; accepteert komma én punt als decimaalteken. */
export function parseNum(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Formatteer een getal voor weergave/export: max `d` decimalen, geen
 *  trailing nullen, en nooit "-0". Undefined → lege string. */
export function fmtNum(v: number | undefined, d = 2): string {
  if (v === undefined || !Number.isFinite(v)) return "";
  const r = Number(v.toFixed(d));
  return String(Object.is(r, -0) ? 0 : r);
}

interface NumCellProps {
  value: number | undefined;
  /** Commit van een geldige numerieke waarde; `false` = weigeren (terugdraaien). */
  onCommit: (v: number) => boolean | void;
  /** Optioneel: lege invoer toestaan — bv. trapeziumwaarde wissen. */
  onClear?: () => void;
  /** Maximaal aantal decimalen in de weergave (default 2). */
  decimals?: number;
  disabled?: boolean;
  title?: string;
  placeholder?: string;
}

/** Numerieke cel — tekstinvoer met komma/punt-parsing en Escape-terugdraai. */
export function NumCell({ value, onCommit, onClear, decimals = 2, disabled, title, placeholder }: NumCellProps) {
  const [str, setStr] = useState(fmtNum(value, decimals));
  const skipCommitRef = useRef(false);
  useEffect(() => { setStr(fmtNum(value, decimals)); }, [value, decimals]);

  const commit = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setStr(fmtNum(value, decimals));
      return;
    }
    const v = parseNum(str);
    if (v === null) {
      if (str.trim() === "" && onClear) { onClear(); return; }
      setStr(fmtNum(value, decimals)); // ongeldige invoer → terugdraaien
      return;
    }
    if (v === value) { setStr(fmtNum(value, decimals)); return; }
    const ok = onCommit(v);
    if (ok === false) setStr(fmtNum(value, decimals)); // geweigerd → terugdraaien
  };

  return (
    <input
      className="ftable-input"
      type="text"
      inputMode="decimal"
      value={str}
      disabled={disabled}
      title={title}
      placeholder={placeholder}
      onChange={(e) => setStr(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          skipCommitRef.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export interface SelectOption { value: string; label: string }
export interface SelectGroup { label: string; options: SelectOption[] }

interface SelectCellProps {
  value: string;
  options?: SelectOption[];
  /** Alternatief voor `options`: optgroups (bv. Staal / Hout). */
  groups?: SelectGroup[];
  onCommit: (v: string) => void;
  disabled?: boolean;
  title?: string;
}

/** Select-cel — direct committen bij wijziging. */
export function SelectCell({ value, options, groups, onCommit, disabled, title }: SelectCellProps) {
  return (
    <select
      className="ftable-select"
      value={value}
      disabled={disabled}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onCommit(e.target.value)}
    >
      {options?.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
      {groups?.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

interface CheckCellProps {
  checked: boolean;
  onCommit: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}

/** Checkbox-cel (bv. scharnier-releases). */
export function CheckCell({ checked, onCommit, disabled, title }: CheckCellProps) {
  return (
    <input
      type="checkbox"
      className="ftable-checkbox"
      checked={checked}
      disabled={disabled}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onCommit(e.target.checked)}
    />
  );
}

interface TextCellProps {
  value: string;
  onCommit: (v: string) => void;
  /** id van een <datalist> voor suggesties (bv. profielnamen). */
  listId?: string;
  disabled?: boolean;
  title?: string;
}

/** Tekstcel met optionele datalist-suggesties (profiel-combobox). */
export function TextCell({ value, onCommit, listId, disabled, title }: TextCellProps) {
  const [str, setStr] = useState(value);
  const skipCommitRef = useRef(false);
  useEffect(() => { setStr(value); }, [value]);

  const commit = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setStr(value);
      return;
    }
    const t = str.trim();
    if (t === "" || t === value) { setStr(value); return; }
    onCommit(t);
  };

  return (
    <input
      className="ftable-input"
      type="text"
      value={str}
      list={listId}
      disabled={disabled}
      title={title}
      onChange={(e) => setStr(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          skipCommitRef.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
