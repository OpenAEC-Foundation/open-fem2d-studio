/**
 * RijBewerker — aantal en diameter van één wapeningsrij, geopend door een
 * klik op het rijlabel ("4Ø20", "2Ø12") in de doorsnedetekening.
 *
 * Eén component voor twee plekken: het betonvenster (schrijft naar de
 * basiskorf van de staaf) en de profielkiezer (schrijft naar de korf die de
 * wizard aan het samenstellen is). De bewerker weet van geen van beide: hij
 * krijgt een rij en geeft een rij terug. Enter slaat op, Esc sluit; een aantal
 * onder 1 wordt geweigerd — een rij zonder staven is geen rij maar het
 * weghalen ervan, en dat is een ander besluit dan hier wordt genomen.
 */
import { useState } from "react";
import "./beton.css";

/** De gangbare staafdiameters van bijlage C, in mm. */
export const STAAFDIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32, 40];

export interface Rij {
  count: number;
  diameter_mm: number;
}

export default function RijBewerker({
  zijde, rij, onOpslaan, onSluiten,
}: {
  zijde: "top" | "bottom";
  rij: Rij;
  onOpslaan: (rij: Rij) => void;
  onSluiten: () => void;
}) {
  const [aantal, setAantal] = useState(String(rij.count));
  const [diameter, setDiameter] = useState(rij.diameter_mm);
  const n = Math.round(Number(aantal));
  const geldig = Number.isFinite(n) && n >= 1 && n <= 40;
  const opslaan = () => { if (geldig) onOpslaan({ count: n, diameter_mm: diameter }); };
  return (
    <form
      className="beton-rijbewerker"
      onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); opslaan(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onSluiten(); } }}
    >
      <span className="beton-rijbewerker-titel">
        {zijde === "bottom" ? "Onderwapening" : "Bovenwapening"}
      </span>
      <label>
        aantal
        <input
          type="number" min={1} max={40} step={1} value={aantal} autoFocus
          onChange={(e) => setAantal(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <label>
        Ø
        <select value={diameter} onChange={(e) => setDiameter(Number(e.target.value))}>
          {STAAFDIAMETERS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        mm
      </label>
      <button type="submit" disabled={!geldig}>OK</button>
      <button type="button" onClick={onSluiten}>Annuleren</button>
      {!geldig && <span className="beton-rijbewerker-fout">aantal 1–40</span>}
    </form>
  );
}
