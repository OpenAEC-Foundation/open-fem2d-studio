/**
 * AansluitingKeuze — per staafeinde de aansluiting kiezen. Bovenaan de twee
 * standaardgevallen, Momentvast (N, V en M vast) en Scharnier (M los, N en V
 * vast); onder "Anders…" per N, V en M: star, scharnier (los) of veer met een
 * stijfheid.
 *
 * Eén component voor het eigenschappenpaneel en de staafdialoog. Hij kent
 * de twee velden van de staaf waar dit in landt: `releases` (de scharnieren,
 * als vinkjes) en `veren` (de stijfheden, kN/mm voor N en V, kNm/rad voor
 * M — "K5000" op een moment is dus 5000 kNm/rad). Een DOF is één van de
 * drie: kiest de gebruiker een veer, dan gaat het vinkje weg; kiest hij een
 * scharnier, dan gaat de veer weg. Zo kan er nooit een veer op een los
 * einde staan.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BeamEindVeren, BeamReleases } from "./femTypes";
import "./AansluitingKeuze.css";

export {
  AANSLUIT_DOFS, aansluitingVan, zetAansluiting, aansluitingSamenvatting,
  standaardAansluitingVan, zetStandaardAansluiting,
} from "../../lib/aansluiting";
export type { AansluitDof, AansluitSoort, StandaardAansluiting } from "../../lib/aansluiting";
import {
  AANSLUIT_DOFS, aansluitingVan, zetAansluiting,
  standaardAansluitingVan, zetStandaardAansluiting,
  type AansluitDof, type AansluitSoort, type StandaardAansluiting,
} from "../../lib/aansluiting";

export default function AansluitingKeuze({
  zijde, releases, veren, onChange,
}: {
  zijde: "start" | "end";
  releases: BeamReleases | undefined;
  veren: BeamEindVeren | undefined;
  onChange: (waarde: { releases: BeamReleases | undefined; veren: BeamEindVeren | undefined }) => void;
}) {
  const { t } = useTranslation("check");
  // De ruwe tekst van het k-veld per DOF, zodat een leeg of half getypt veld
  // niet meteen terugvalt op "vast" (een veer zonder getal IS star, maar dat
  // hoort de gebruiker pas te merken als hij het veld leeg laat).
  const [tekst, setTekst] = useState<Partial<Record<AansluitDof, string>>>({});
  const standaard = standaardAansluitingVan(releases, veren, zijde);
  // De regels per N/V/M staan open bij een afwijkende aansluiting, of als de
  // gebruiker "Anders…" koos; bij Momentvast en Scharnier blijven ze dicht.
  const [verfijnen, setVerfijnen] = useState(standaard === "anders");
  const toonRegels = verfijnen || standaard === "anders" || Object.keys(tekst).length > 0;
  const kies = (keuze: Exclude<StandaardAansluiting, "anders">) => {
    setTekst({});
    setVerfijnen(false);
    onChange(zetStandaardAansluiting(releases, veren, zijde, keuze));
  };
  return (
    <div className="aansluiting-keuze">
      <div className="aansluiting-standaard" role="group" aria-label={t("connection.standaard.label")}>
        {(["momentvast", "scharnier"] as const).map((k) => (
          <button
            key={k} type="button"
            className={`aansluiting-knop${standaard === k && !verfijnen ? " actief" : ""}`}
            aria-pressed={standaard === k && !verfijnen}
            title={t(`connection.standaard.${k}Titel`)}
            onClick={() => kies(k)}
          >{t(`connection.standaard.${k}`)}</button>
        ))}
        <button
          type="button"
          className={`aansluiting-knop aansluiting-anders${toonRegels ? " actief" : ""}`}
          aria-pressed={toonRegels}
          aria-expanded={toonRegels}
          title={t("connection.standaard.andersTitel")}
          onClick={() => setVerfijnen((v) => !v || standaard === "anders")}
        >{t("connection.standaard.anders")}</button>
      </div>
      {toonRegels && AANSLUIT_DOFS.map((d) => {
        const a = aansluitingVan(releases, veren, zijde, d.dof);
        const bezig = tekst[d.dof] !== undefined;
        const soort: AansluitSoort = bezig ? "veer" : a.soort;
        return (
          <div className="aansluiting-rij" key={d.dof} title={t(d.titel)}>
            <span className="aansluiting-dof">{d.label}</span>
            <select
              value={soort}
              onChange={(e) => {
                const nieuw = e.target.value as AansluitSoort;
                if (nieuw === "veer") {
                  const k = a.k ?? d.standaard;
                  setTekst((x) => ({ ...x, [d.dof]: String(k) }));
                  onChange(zetAansluiting(releases, veren, zijde, d.dof, "veer", k));
                } else {
                  setTekst((x) => { const n = { ...x }; delete n[d.dof]; return n; });
                  onChange(zetAansluiting(releases, veren, zijde, d.dof, nieuw, null));
                }
              }}
            >
              <option value="vast">{t("connection.type.vast")}</option>
              <option value="scharnier">{t("connection.type.scharnier")}</option>
              <option value="veer">{t("connection.type.veer")}</option>
            </select>
            {soort === "veer" && (
              <label className="aansluiting-veer">
                k
                <input
                  type="number" min={0} step={d.stap}
                  value={bezig ? tekst[d.dof] : String(a.k ?? "")}
                  onChange={(e) => {
                    const waarde = e.target.value;
                    setTekst((x) => ({ ...x, [d.dof]: waarde }));
                    const k = Number(waarde.replace(",", "."));
                    if (waarde !== "" && Number.isFinite(k) && k > 0) {
                      onChange(zetAansluiting(releases, veren, zijde, d.dof, "veer", k));
                    }
                  }}
                  onBlur={() => setTekst((x) => { const n = { ...x }; delete n[d.dof]; return n; })}
                />
                <span className="aansluiting-eenheid">{d.eenheid}</span>
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
