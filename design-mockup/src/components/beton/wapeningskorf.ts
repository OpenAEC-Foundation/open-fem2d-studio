/**
 * wapeningskorf.ts — het korfmodel van de frontend en de geometrie die de
 * tekening nodig heeft.
 *
 * De kern (nen-en-1992-1-1/section.rs) kent alleen `ReinforcementCage`:
 * dekking, beugel, boven- en onderwapening. De frontend bundelt dat met de
 * doorsnedeafmetingen, de materiaalkeuzes en de rekeninstellingen tot één
 * `Wapeningskorf`, zodat de editor en de tekening één object doorgeven.
 *
 * De ligging van de staafassen volgt dezelfde regel als de kern:
 *   afstand staafas tot betonrand = c_nom + Ø_beugel + Ø_hoofd / 2.
 */
import type { ReinforcementCage } from "../../lib/types/concrete/ReinforcementCage";
import type { RebarRow } from "../../lib/types/concrete/RebarRow";
import type { SteelBranch } from "../../lib/types/concrete/SteelBranch";
import { DEFAULT_N_STRIPS, DEFAULT_REINFORCEMENT_GRADE } from "../../lib/betonCheckBuilder";

export interface Wapeningskorf {
  breedteMm: number;
  hoogteMm: number;
  /** Betonsterkteklasse, bijv. "C30/37". */
  betonklasse: string;
  /** Wapeningsstaal, bijv. "B500B". */
  staalsoort: string;
  korf: ReinforcementCage;
  /** In hoeveel stroken de doorsnede voor de integratie wordt opgeknipt. */
  aantalStroken: number;
  /** Bovenste tak van het staaldiagram (3.2.7(2)). */
  staaltak: SteelBranch;
}

/** Een gangbare balkkorf als startpunt voor de editor. Geen normwaarde. */
export const STANDAARD_KORF: Wapeningskorf = {
  breedteMm: 300,
  hoogteMm: 500,
  betonklasse: "C30/37",
  staalsoort: DEFAULT_REINFORCEMENT_GRADE,
  korf: {
    cover_mm: 30,
    stirrup_diameter_mm: 8,
    top: { count: 2, diameter_mm: 12 },
    bottom: { count: 3, diameter_mm: 16 },
  },
  aantalStroken: DEFAULT_N_STRIPS,
  staaltak: "Horizontal",
};

/** Gangbare staafdiameters (handelsmaten, geen normwaarden). */
export const STAAFDIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32, 40] as const;

/** Gangbare beugeldiameters; 0 = geen beugel. */
export const BEUGELDIAMETERS = [0, 6, 8, 10, 12] as const;

/** Oppervlakte van één rij hoofdwapening in mm². */
export function rijOppervlakMm2(rij: RebarRow): number {
  if (rij.count <= 0 || rij.diameter_mm <= 0) return 0;
  return rij.count * Math.PI * (rij.diameter_mm / 2) ** 2;
}

/** "3Ø16" of "—". */
export function rijLabel(rij: RebarRow): string {
  if (rij.count <= 0 || rij.diameter_mm <= 0) return "—";
  return `${rij.count}Ø${maat(rij.diameter_mm)}`;
}

/** Afstand van de staafas van een rij tot de betonrand waar hij tegenaan ligt. */
export function asAfstandMm(korf: ReinforcementCage, rij: RebarRow): number {
  return korf.cover_mm + korf.stirrup_diameter_mm + rij.diameter_mm / 2;
}

/** Nuttige hoogte d van de onderwapening, mm. */
export function nuttigeHoogteMm(korf: ReinforcementCage, hoogteMm: number): number {
  return hoogteMm - asAfstandMm(korf, korf.bottom);
}

/** "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm" — gelijk aan de kern. */
export function korfSamenvatting(korf: ReinforcementCage): string {
  const beugel = korf.stirrup_diameter_mm > 0 ? `beugel Ø${maat(korf.stirrup_diameter_mm)}` : "geen beugel";
  return `onder ${rijLabel(korf.bottom)}, boven ${rijLabel(korf.top)}, ${beugel}, dekking ${maat(korf.cover_mm)} mm`;
}

/** Eén staaf in de tekening: hart (mm vanaf linkerrand resp. onderrand) en diameter. */
export interface StaafPositie {
  x: number;
  z: number;
  diameter: number;
  rij: "boven" | "onder";
}

/**
 * Staafposities in de doorsnede: elke rij gelijkmatig verdeeld tussen de
 * binnenhoeken van de beugel; één staaf staat in het midden.
 */
export function staafPosities(korf: ReinforcementCage, breedteMm: number, hoogteMm: number): StaafPositie[] {
  const uit: StaafPositie[] = [];
  const rijen: Array<[RebarRow, "boven" | "onder"]> = [
    [korf.bottom, "onder"],
    [korf.top, "boven"],
  ];
  for (const [rij, kant] of rijen) {
    if (rij.count <= 0 || rij.diameter_mm <= 0) continue;
    const as = asAfstandMm(korf, rij);
    const z = kant === "onder" ? as : hoogteMm - as;
    const xEerste = as;
    const xLaatste = breedteMm - as;
    for (let i = 0; i < rij.count; i++) {
      const x = rij.count === 1 ? breedteMm / 2 : xEerste + ((xLaatste - xEerste) * i) / (rij.count - 1);
      uit.push({ x, z, diameter: rij.diameter_mm, rij: kant });
    }
  }
  return uit;
}

/**
 * Directe geometriecontrole voor de editor (spiegel van `validate` in de
 * kern): meldt waarom de kern de korf zou weigeren, vóórdat hij wordt
 * aangeroepen. `null` = in orde.
 */
export function controleerKorf(k: Wapeningskorf): string | null {
  const { korf } = k;
  if (!(k.breedteMm > 0) || !(k.hoogteMm > 0)) return "Doorsnedeafmetingen moeten positief zijn.";
  if (korf.cover_mm < 0 || korf.stirrup_diameter_mm < 0) return "Dekking en beugeldiameter mogen niet negatief zijn.";
  const leeg = (r: RebarRow) => r.count <= 0 || r.diameter_mm <= 0;
  if (leeg(korf.top) && leeg(korf.bottom)) return "De korf bevat geen hoofdwapening.";
  const binnenbreedte = k.breedteMm - 2 * (korf.cover_mm + korf.stirrup_diameter_mm);
  for (const [naam, rij] of [["Onderwapening", korf.bottom], ["Bovenwapening", korf.top]] as const) {
    if (leeg(rij)) continue;
    const benodigd = rij.count * rij.diameter_mm;
    if (benodigd > binnenbreedte + 1e-9) {
      return `${naam} ${rijLabel(rij)} past niet in de breedte: ${maat(benodigd)} mm staal in ${maat(binnenbreedte)} mm binnenmaat.`;
    }
  }
  const onder = leeg(korf.bottom) ? 0 : asAfstandMm(korf, korf.bottom);
  const boven = leeg(korf.top) ? 0 : asAfstandMm(korf, korf.top);
  if (onder + boven >= k.hoogteMm) return "Boven- en onderwapening overlappen elkaar in de hoogte.";
  return null;
}

/**
 * Kleinste vrije tussenafstand tussen de staven van een rij, mm; `null` bij
 * één of geen staaf. Alleen ter informatie in de editor — de eis van §8.2
 * (minimale staafafstand) is hier niet als normtoets geïmplementeerd.
 */
export function vrijeStaafafstandMm(korf: ReinforcementCage, rij: RebarRow, breedteMm: number): number | null {
  if (rij.count < 2 || rij.diameter_mm <= 0) return null;
  const as = asAfstandMm(korf, rij);
  const hartAfstand = (breedteMm - 2 * as) / (rij.count - 1);
  return hartAfstand - rij.diameter_mm;
}

/** Maat in mm als tekst: integer waar mogelijk, anders één decimaal (nl). */
export function maat(v: number): string {
  const afgerond = Math.round(v * 10) / 10;
  return Number.isInteger(afgerond) ? String(afgerond) : afgerond.toFixed(1).replace(".", ",");
}

/** Getal in nl-notatie met vast aantal decimalen. */
export function nl(v: number, decimalen: number): string {
  return v.toLocaleString("nl-NL", { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
}
