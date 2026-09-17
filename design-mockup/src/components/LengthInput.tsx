import { useEffect, useState, type InputHTMLAttributes } from "react";
import { formatLength, parseLength, type LengthUnit } from "../lib/lengthInput";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max"> & {
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
  storedUnit?: LengthUnit;
  min?: number;
  max?: number;
  positive?: boolean;
};

/** Lokale tekst bewaart een nog onvolledige decimaal (bv. '3000,').
 * Bevestigen op blur/Enter; ongeldige invoer herstelt de opgeslagen waarde.
 * Leegmaken geeft undefined aan optionele modelvelden. Verplichte callers
 * geven required mee: leeg bevestigen herstelt dan de opgeslagen waarde.
 */
export default function LengthInput({
  value, onChange, storedUnit = "mm", min = 0, max = Infinity, positive = false,
  required = false, onBlur, onKeyDown, ...props
}: Props) {
  const [text, setText] = useState(() => formatLength(value, storedUnit));
  useEffect(() => setText(formatLength(value, storedUnit)), [value, storedUnit]);
  const commit = () => {
    if (text === formatLength(value, storedUnit)) return;
    if (!text.trim()) {
      if (required) setText(formatLength(value, storedUnit));
      else onChange(undefined);
      return;
    }
    const mm = parseLength(text);
    if (!Number.isFinite(mm) || mm < min || mm > max || (positive && mm <= 0)) {
      setText(formatLength(value, storedUnit));
      return;
    }
    const parsed = parseLength(text, storedUnit);
    if (parsed !== value) onChange(parsed);
    setText(formatLength(parsed, storedUnit));
  };
  return <input {...props} required={required} type="text" inputMode="decimal" value={text}
    onChange={e => setText(e.target.value)}
    onBlur={e => { commit(); onBlur?.(e); }}
    onKeyDown={e => {
      if (e.key === "Enter") e.currentTarget.blur();
      onKeyDown?.(e);
    }} />;
}
