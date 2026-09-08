/**
 * betonDoorsnedeTerugval.ts — de doorsnede en de wapeningskorf terughalen uit
 * een BETONTOETSRESULTAAT, voor het geval de exacte invoergegevens er niet
 * bij zitten.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Een `ConcreteBeamCheckResult` draagt de doorsnede alleen als NAAM
 * ("300 x 500", of "T 400 x 450 (flens 400 x 50, lijf 200)") en de korf alleen
 * als ZIN ("onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm"). Beide worden
 * door de rekenkern zelf samengesteld en hebben dus een vaste vorm. Wie de
 * doorsnede wil TEKENEN heeft daar de maten en de staven uit nodig.
 *
 * De exacte invoer is er niet altijd: het losgekoppelde rapportvenster heeft
 * geen modelstate, en de PDF-uitdraai krijgt de doorsneden alleen mee ná een
 * fysisch niet-lineaire rekengang — die vult `staafdoorsneden` in het
 * segmentspoor. Bij eerste orde bestaat dat spoor niet, en dan is dit de weg.
 *
 * WAAROM ÉÉN PLAATS EN NIET TWEE
 * ------------------------------
 * Het live rapport (`components/report/sections/BetonSection.tsx`) deed dit al;
 * de PDF (`lib/rapportPdfInvoer.ts`) deed het niet en liet de doorsnedefiguur
 * dus weg bij elk ander analysetype dan "2e orde + fysisch". Twee rapporten die
 * hetzelfde model verschillend afbeelden is erger dan één ontbrekende figuur,
 * en twee parsers op dezelfde zin lopen gegarandeerd uit elkaar. Daarom staat
 * de terugval hier, en gebruiken beide kanten hem.
 *
 * `null` betekent: niet te herleiden. Dan blijft de tekening WEG — een
 * verzonnen korf op papier is erger dan een lege plek.
 */
import { parseSectionNaam } from "./betonCheckBuilder";
import type { ConcreteBeamCheckResult } from "./types/concrete/ConcreteBeamCheckResult";
import type { ConcreteSectionInput } from "./types/concrete/ConcreteSectionInput";
import type { RebarRow } from "./types/concrete/RebarRow";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";

/** Wat er nodig is om één betondoorsnede te tekenen. */
export interface DoorsnedeVoorFiguur {
  /** Bij een T of L mét de flensmaten waarmee de kern werkelijk gerekend heeft. */
  doorsnede: ConcreteSectionInput;
  korf: ReinforcementCage;
}

/** "3Ø16" (of "—") uit de samenvattingsregel van de kern. */
function rijUitTekst(s: string | undefined): RebarRow {
  const m = s ? /(\d+)\s*Ø\s*([\d.,]+)/.exec(s) : null;
  if (!m) return { count: 0, diameter_mm: 0 };
  return { count: parseInt(m[1], 10), diameter_mm: parseFloat(m[2].replace(",", ".")) };
}

/**
 * De korf uit `reinforcement_summary`: "onder 3Ø16, boven 2Ø12, beugel Ø8,
 * dekking 30 mm". Die regel komt uit `ReinforcementCage::summary()` in de kern
 * en heeft dus een vaste vorm. `null` = niet te herleiden.
 */
export function korfUitSamenvatting(s: string): ReinforcementCage | null {
  const dekking = /dekking\s+([\d.,]+)\s*mm/.exec(s);
  if (!dekking) return null;
  const beugel = /beugel\s*Ø\s*([\d.,]+)/.exec(s);
  const cage: ReinforcementCage = {
    cover_mm: parseFloat(dekking[1].replace(",", ".")),
    stirrup_diameter_mm: beugel ? parseFloat(beugel[1].replace(",", ".")) : 0,
    top: rijUitTekst(/boven\s+([^,]+)/.exec(s)?.[1]),
    bottom: rijUitTekst(/onder\s+([^,]+)/.exec(s)?.[1]),
  };
  if (cage.bottom.count === 0 && cage.top.count === 0) return null;
  return cage;
}

/**
 * De doorsnede en de korf waarmee de figuur van staaf `r` getekend wordt.
 *
 * De doorsnede komt ALTIJD uit `section_name` van het kernresultaat: die naam
 * draagt bij een T of L de meewerkende flensbreedte waarmee werkelijk gerekend
 * is, en niet de ingevoerde flensbreedte. De korf komt bij voorkeur uit het
 * model (exacte getallen) en anders uit de samenvattingsregel.
 */
export function doorsnedeUitToets(
  r: Pick<ConcreteBeamCheckResult, "section_name" | "reinforcement_summary">,
  korfUitModel?: ReinforcementCage,
): DoorsnedeVoorFiguur | null {
  const doorsnede = parseSectionNaam(r.section_name);
  const korf = korfUitModel ?? korfUitSamenvatting(r.reinforcement_summary);
  if (!doorsnede || !korf) return null;
  return { doorsnede, korf };
}
