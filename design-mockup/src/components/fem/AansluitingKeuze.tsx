/**
 * AansluitingKeuze — per staafeinde de aansluiting van N, V en M kiezen:
 * star, scharnier (los) of veer met een stijfheid.
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
import type { BeamEindVeren, BeamReleases } from "./femTypes";
import "./AansluitingKeuze.css";

export type AansluitDof = "Tx" | "Tz" | "Ry";
export type AansluitSoort = "vast" | "scharnier" | "veer";

export const AANSLUIT_DOFS: { dof: AansluitDof; label: string; titel: string; eenheid: string; stap: number; standaard: number }[] = [
  { dof: "Tx", label: "N", titel: "Normaalkracht — verplaatsing langs de staafas", eenheid: "kN/mm", stap: 10, standaard: 100 },
  { dof: "Tz", label: "V", titel: "Dwarskracht — verplaatsing loodrecht op de staaf", eenheid: "kN/mm", stap: 10, standaard: 100 },
  { dof: "Ry", label: "M", titel: "Moment — rotatie", eenheid: "kNm/rad", stap: 100, standaard: 5000 },
];

type Sleutel = keyof BeamReleases & keyof BeamEindVeren;
const sleutel = (zijde: "start" | "end", dof: AansluitDof): Sleutel => `${zijde}${dof}` as Sleutel;

/** Wat er nu op één DOF staat, uit de twee velden van de staaf. */
export function aansluitingVan(
  releases: BeamReleases | undefined,
  veren: BeamEindVeren | undefined,
  zijde: "start" | "end",
  dof: AansluitDof,
): { soort: AansluitSoort; k: number | null } {
  const s = sleutel(zijde, dof);
  if (releases?.[s]) return { soort: "scharnier", k: null };
  const k = veren?.[s];
  if (k !== undefined && k > 0) return { soort: "veer", k };
  return { soort: "vast", k: null };
}

/** Eén DOF zetten; geeft de twee velden terug zoals ze op de staaf horen. */
export function zetAansluiting(
  releases: BeamReleases | undefined,
  veren: BeamEindVeren | undefined,
  zijde: "start" | "end",
  dof: AansluitDof,
  soort: AansluitSoort,
  k: number | null,
): { releases: BeamReleases | undefined; veren: BeamEindVeren | undefined } {
  const s = sleutel(zijde, dof);
  const rel: BeamReleases = { ...releases };
  const v: BeamEindVeren = { ...veren };
  delete rel[s];
  delete v[s];
  if (soort === "scharnier") rel[s] = true;
  if (soort === "veer" && k !== null && k > 0) v[s] = k;
  const relUit = Object.values(rel).some(Boolean) ? rel : undefined;
  const vUit = Object.values(v).some((x) => x !== undefined && x > 0) ? v : undefined;
  return { releases: relUit, veren: vUit };
}

/** Korte samenvatting van een einde: "N vast · V vast · M veer 5000 kNm/rad". */
export function aansluitingSamenvatting(
  releases: BeamReleases | undefined,
  veren: BeamEindVeren | undefined,
  zijde: "start" | "end",
): string {
  return AANSLUIT_DOFS.map((d) => {
    const a = aansluitingVan(releases, veren, zijde, d.dof);
    return `${d.label} ${a.soort === "veer" ? `veer ${a.k} ${d.eenheid}` : a.soort}`;
  }).join(" · ");
}

export default function AansluitingKeuze({
  zijde, releases, veren, onChange,
}: {
  zijde: "start" | "end";
  releases: BeamReleases | undefined;
  veren: BeamEindVeren | undefined;
  onChange: (waarde: { releases: BeamReleases | undefined; veren: BeamEindVeren | undefined }) => void;
}) {
  // De ruwe tekst van het k-veld per DOF, zodat een leeg of half getypt veld
  // niet meteen terugvalt op "vast" (een veer zonder getal IS star, maar dat
  // hoort de gebruiker pas te merken als hij het veld leeg laat).
  const [tekst, setTekst] = useState<Partial<Record<AansluitDof, string>>>({});
  return (
    <div className="aansluiting-keuze">
      {AANSLUIT_DOFS.map((d) => {
        const a = aansluitingVan(releases, veren, zijde, d.dof);
        const bezig = tekst[d.dof] !== undefined;
        const soort: AansluitSoort = bezig ? "veer" : a.soort;
        return (
          <div className="aansluiting-rij" key={d.dof} title={d.titel}>
            <span className="aansluiting-dof">{d.label}</span>
            <select
              value={soort}
              onChange={(e) => {
                const nieuw = e.target.value as AansluitSoort;
                if (nieuw === "veer") {
                  const k = a.k ?? d.standaard;
                  setTekst((t) => ({ ...t, [d.dof]: String(k) }));
                  onChange(zetAansluiting(releases, veren, zijde, d.dof, "veer", k));
                } else {
                  setTekst((t) => { const n = { ...t }; delete n[d.dof]; return n; });
                  onChange(zetAansluiting(releases, veren, zijde, d.dof, nieuw, null));
                }
              }}
            >
              <option value="vast">vast</option>
              <option value="scharnier">scharnier</option>
              <option value="veer">veer</option>
            </select>
            {soort === "veer" && (
              <label className="aansluiting-veer">
                k
                <input
                  type="number" min={0} step={d.stap}
                  value={bezig ? tekst[d.dof] : String(a.k ?? "")}
                  onChange={(e) => {
                    const t = e.target.value;
                    setTekst((x) => ({ ...x, [d.dof]: t }));
                    const k = Number(t.replace(",", "."));
                    if (t !== "" && Number.isFinite(k) && k > 0) {
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
