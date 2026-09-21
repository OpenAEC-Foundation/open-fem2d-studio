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
 *
 * DE DERDE RIJ ZIJN DE ZIJSTAVEN van een kolomkorf. Daar telt het aantal PER
 * ZIJKANT: "2Ø16 per zijde" zijn er vier in de doorsnede, want de korf is
 * links-rechts symmetrisch. Dat staat met zoveel woorden in het opschrift en
 * onder het veld, want wie het als totaal leest voert de helft van de wapening
 * in — en bij A_s,max van §9.5.2(3) werkt dat naar de onveilige kant.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./beton.css";

/** De gangbare staafdiameters van bijlage C, in mm. */
export const STAAFDIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32, 40];

export interface Rij {
  count: number;
  diameter_mm: number;
}

/** De drie rijen van de korf, met de veldnaam van `ReinforcementCage`. */
export type RijZijde = "top" | "bottom" | "sides";

/** Vertaalsleutel van het opschrift per rij; vertaald bij het renderen. */
const TITEL: Record<RijZijde, string> = {
  bottom: "concrete.rows.titleBottom",
  top: "concrete.rows.titleTop",
  sides: "concrete.rows.titleSides",
};

export default function RijBewerker({
  zijde, rij, onOpslaan, onSluiten, context,
}: {
  zijde: RijZijde;
  rij: Rij;
  onOpslaan: (rij: Rij) => void;
  onSluiten: () => void;
  context?: string;
}) {
  const { t } = useTranslation("check");
  const { t: tCommon } = useTranslation("common");
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
      <span className="beton-rijbewerker-titel">{t(TITEL[zijde])}</span>
      {context && <span className="beton-rijbewerker-hint">{context}</span>}
      <label>
        {t("concrete.rows.count")}
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
      <button type="submit" disabled={!geldig}>{tCommon("ok")}</button>
      <button type="button" onClick={onSluiten}>{tCommon("cancel")}</button>
      {!geldig && <span className="beton-rijbewerker-fout">{t("concrete.rows.countRange")}</span>}
      {zijde === "sides" && (
        <span className="beton-rijbewerker-hint">
          {n >= 1
            ? t("concrete.rows.sidesTotal", { n, totaal: 2 * n })
            : t("concrete.rows.countPerSide")}
        </span>
      )}
    </form>
  );
}
