/**
 * Aansluiting van een staafeinde: de pure logica achter AansluitingKeuze
 * (zonder React en CSS, zodat tests en andere modules hem kunnen gebruiken).
 */
import i18next from "i18next";
import type { BeamEindVeren, BeamReleases } from "../components/fem/femTypes";

export type AansluitDof = "Tx" | "Tz" | "Ry";
export type AansluitSoort = "vast" | "scharnier" | "veer";

/** `titel` is een i18n-sleutel (naamruimte check), vertaald bij het tonen. */
export const AANSLUIT_DOFS: { dof: AansluitDof; label: string; titel: string; eenheid: string; stap: number; standaard: number }[] = [
  { dof: "Tx", label: "N", titel: "connection.dof.Tx", eenheid: "kN/mm", stap: 10, standaard: 100 },
  { dof: "Tz", label: "V", titel: "connection.dof.Tz", eenheid: "kN/mm", stap: 10, standaard: 100 },
  { dof: "Ry", label: "M", titel: "connection.dof.Ry", eenheid: "kNm/rad", stap: 100, standaard: 5000 },
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
    return `${d.label} ${a.soort === "veer" ? i18next.t("check:connection.springSummary", { k: a.k, eenheid: d.eenheid }) : i18next.t(`check:connection.type.${a.soort}`)}`;
  }).join(" · ");
}

/** De twee standaardaansluitingen van een staafeinde, of "anders". */
export type StandaardAansluiting = "momentvast" | "scharnier" | "anders";

/** Welke standaardaansluiting staat er nu op dit einde? */
export function standaardAansluitingVan(
  releases: BeamReleases | undefined,
  veren: BeamEindVeren | undefined,
  zijde: "start" | "end",
): StandaardAansluiting {
  const n = aansluitingVan(releases, veren, zijde, "Tx").soort;
  const v = aansluitingVan(releases, veren, zijde, "Tz").soort;
  const m = aansluitingVan(releases, veren, zijde, "Ry").soort;
  if (n !== "vast" || v !== "vast") return "anders";
  if (m === "vast") return "momentvast";
  if (m === "scharnier") return "scharnier";
  return "anders";
}

/**
 * Zet een einde op een standaardaansluiting: N en V vast, M vast
 * (momentvast) of los (scharnier). Veren op dit einde vervallen; het andere
 * einde blijft ongemoeid.
 */
export function zetStandaardAansluiting(
  releases: BeamReleases | undefined,
  veren: BeamEindVeren | undefined,
  zijde: "start" | "end",
  keuze: Exclude<StandaardAansluiting, "anders">,
): { releases: BeamReleases | undefined; veren: BeamEindVeren | undefined } {
  let w = { releases, veren };
  w = zetAansluiting(w.releases, w.veren, zijde, "Tx", "vast", null);
  w = zetAansluiting(w.releases, w.veren, zijde, "Tz", "vast", null);
  return zetAansluiting(w.releases, w.veren, zijde, "Ry", keuze === "scharnier" ? "scharnier" : "vast", null);
}
