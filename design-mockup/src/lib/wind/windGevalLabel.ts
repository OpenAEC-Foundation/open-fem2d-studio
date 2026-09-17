/**
 * windGevalLabel — de naam van een gegenereerd windbelastinggeval in de
 * interface, vertaalbaar (issue #33).
 *
 * De generator geeft elk geval een Nederlandse naam ("Wind vrijstaand dak c_f
 * neerwaarts, van links"). Die naam gaat het model in, de combinaties, het
 * rapport en de MCP-uitvoer, en blijft dus Nederlands. Het venster van de
 * windgenerator toont dezelfde naam in de tabs en boven de tabel per staaf;
 * daar hoort hij in de gekozen taal.
 *
 * De vertaalbare vorm wordt afgeleid uit de STABIELE sleutel van het geval
 * (`wind:links:cpi+0.20`, `luifel:cf:max:rechts`) en niet uit de naam. Twee
 * uitzonderingen, allebei omdat de sleutel het niet zegt: bij een c_f-geval
 * bepaalt de dakvorm of `links` een windrichting (lessenaarsdak) of een
 * dakvlak (zadeldak) is, en bij een horizontaal geval staat in de naam of er
 * wrijving, kolommen of beide in zitten. test-i18n-meldteksten legt vast dat
 * de Nederlandse vertaling voor elk gegenereerd geval gelijk is aan de naam.
 */
import { vt, type VertaalbareTekst } from "../vertaalbareTekst";
import type { OverkappingDakvorm } from "./windEurocode";

const nl = (v: number, d: number) => v.toFixed(d).replace(".", ",");

const RICHTING: Record<string, VertaalbareTekst> = {
  links: vt("common:wind.case.dir.links", "van links"),
  rechts: vt("common:wind.case.dir.rechts", "van rechts"),
  haaks: vt("common:wind.case.dir.haaks", "haaks op het spant"),
};
const ZIN = {
  max: vt("common:wind.case.down", "neerwaarts"),
  min: vt("common:wind.case.up", "opwaarts"),
};

/**
 * Het korte label van een geval, zoals in de tabs van het venster: de naam
 * zonder "Wind " (gebouw) of "Wind vrijstaand dak " (vrijstaand dak).
 * `null` voor een sleutel die dit bestand niet kent — de aanroeper toont dan
 * de naam zelf.
 */
export function windGevalTab(
  gv: { sleutel: string; naam: string },
  dakvorm: OverkappingDakvorm | null,
): VertaalbareTekst | null {
  const d = gv.sleutel.split(":");
  if (d[0] === "wind" && d.length === 3 && RICHTING[d[1]] && d[2].startsWith("cpi")) {
    const cpiGetal = Number(d[2].slice(3));
    if (!Number.isFinite(cpiGetal)) return null;
    const cpi = nl(cpiGetal, 2);
    const richting = RICHTING[d[1]];
    return vt("common:wind.case.buildingTab", `${richting.tekst} (c_pi = ${cpi})`, { richting, cpi });
  }
  if (d[0] !== "luifel") return null;
  if (d[1] === "cpnet" && (d[2] === "max" || d[2] === "min") && d.length === 3) {
    const zin = ZIN[d[2]];
    return vt("common:wind.case.cpnet", `c_p,net ${zin.tekst}`, { zin });
  }
  if (d[1] === "cf" && (d[2] === "max" || d[2] === "min") && d.length === 4) {
    const zin = ZIN[d[2]];
    if (dakvorm === "lessenaar" && (d[3] === "links" || d[3] === "rechts")) {
      const richting = RICHTING[d[3]];
      return vt("common:wind.case.cfDirection", `c_f ${zin.tekst}, ${richting.tekst}`, { zin, richting });
    }
    if (dakvorm === "zadel") {
      if (d[3] === "beide") return vt("common:wind.case.cfBoth", `c_f ${zin.tekst}, beide dakvlakken`, { zin });
      if (d[3] === "links") return vt("common:wind.case.cfLeft", `c_f ${zin.tekst}, alleen linkerdakvlak`, { zin });
      if (d[3] === "rechts") return vt("common:wind.case.cfRight", `c_f ${zin.tekst}, alleen rechterdakvlak`, { zin });
    }
    return null;
  }
  if (d[1] === "horizontaal" && (d[2] === "links" || d[2] === "rechts") && d.length === 3) {
    const wrijving = gv.naam.includes("wrijving");
    const kolommen = gv.naam.includes("kolommen");
    const delen = wrijving && kolommen
      ? vt("common:wind.case.frictionColumns", "wrijving + kolommen")
      : wrijving ? vt("common:wind.case.friction", "wrijving")
        : kolommen ? vt("common:wind.case.columns", "kolommen") : null;
    if (!delen) return null;
    const richting = RICHTING[d[2]];
    return vt("common:wind.case.horizontal", `${delen.tekst}, ${richting.tekst}`, { delen, richting });
  }
  return null;
}

/** De volledige naam van een geval, zoals boven de tabel per staaf. */
export function windGevalNaam(
  gv: { sleutel: string; naam: string },
  dakvorm: OverkappingDakvorm | null,
): VertaalbareTekst | null {
  const tab = windGevalTab(gv, dakvorm);
  if (!tab) return null;
  return gv.sleutel.startsWith("luifel:")
    ? vt("common:wind.case.canopyName", `Wind vrijstaand dak ${tab.tekst}`, { deel: tab })
    : vt("common:wind.case.buildingName", `Wind ${tab.tekst}`, { deel: tab });
}
