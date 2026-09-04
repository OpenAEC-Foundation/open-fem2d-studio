/**
 * GetalVeld — numeriek invoerveld dat tijdens het typen niet terugspringt.
 *
 * Houdt de tekst lokaal bij en geeft elke geldige tussenstand direct door
 * (live-herberekening), maar laat een half getypt getal ("1," of leeg)
 * gewoon staan. Komma en punt zijn beide een decimaalteken.
 */
import { useEffect, useState } from "react";
import { leesGetal } from "../../lib/profieleditor/format";

interface Props {
  label: string;
  waarde: number;
  onWijzig: (v: number) => void;
  stap?: number;
  min?: number;
  eenheid?: string;
  titel?: string;
}

function tekstVan(v: number): string {
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * 1000) / 1000).replace(".", ",");
}

export default function GetalVeld({ label, waarde, onWijzig, stap = 1, min, eenheid, titel }: Props) {
  const [tekst, setTekst] = useState(tekstVan(waarde));
  const [focus, setFocus] = useState(false);

  // Van buiten gewijzigd (slepen, preset): overnemen zolang het veld geen focus heeft.
  useEffect(() => {
    if (!focus) setTekst(tekstVan(waarde));
  }, [waarde, focus]);

  return (
    <label className="pe-veld" title={titel}>
      <span>
        {label}
        {eenheid ? ` [${eenheid}]` : ""}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={tekst}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setTekst(tekstVan(waarde));
        }}
        onChange={(e) => {
          setTekst(e.target.value);
          const v = leesGetal(e.target.value);
          if (Number.isFinite(v) && (min === undefined || v >= min)) onWijzig(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const f = e.shiftKey ? 10 : 1;
            const v = (Number.isFinite(waarde) ? waarde : 0) + (e.key === "ArrowUp" ? stap * f : -stap * f);
            if (min === undefined || v >= min) {
              onWijzig(Math.round(v * 1000) / 1000);
              setTekst(tekstVan(Math.round(v * 1000) / 1000));
            }
          }
        }}
      />
    </label>
  );
}
