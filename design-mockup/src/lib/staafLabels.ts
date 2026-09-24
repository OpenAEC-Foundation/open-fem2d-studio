/**
 * staafLabels.ts — waar de labels van een staaf op het tekenvlak staan
 * (issue #47): de profielnaam, het staafnummer en, met het aanzicht aan, de
 * profielbreedte b. Alles in schermpixels; geen React.
 *
 * Alle drie staan op het staafmidden en draaien mee met de staaf (nooit
 * ondersteboven). Ze liggen op een lijn loodrecht op de staaf, zodat ze
 * elkaar nooit raken:
 *
 *   - profielnaam: aan de kant die op het scherm omhoog wijst, op
 *     `PROFIEL_LABEL_OFFSET_PX` van de systeemlijn (met het aanzicht aan: net
 *     buiten het aanzicht) — zoals hij altijd stond;
 *   - staafnummer: dezelfde kant, een regel verder naar buiten
 *     (`NUMMER_STAPEL_PX`) als de profielnaam er staat, anders op diens plek;
 *   - breedte b: de ANDERE kant, net buiten het aanzicht. Zo leest het aanzicht
 *     als een doorsnede met aan de ene zijde de naam en aan de andere de maat
 *     die in het zijaanzicht niet te zien is.
 *
 * Een label dat langer is dan de staaf op het scherm, vervalt: een naam die
 * over drie staven heen loopt, hoort bij geen van drieën meer.
 */

export interface SchermPunt {
  x: number;
  y: number;
}

export interface LabelPlaats {
  x: number;
  y: number;
  /** Draaiing in graden, altijd tussen −90 en 90 (leesbaar). */
  hoek: number;
  /** Afstand van de systeemlijn, loodrecht (px); + = de kant die omhoog wijst. */
  afstand: number;
}

/** Afstand van de profielnaam tot de systeemlijn (px). */
export const PROFIEL_LABEL_OFFSET_PX = 9;
/** Letterhoogte van profielnaam (9 px) en staafnummer (10 px), zie FemCanvas.css. */
export const PROFIEL_LETTER_PX = 9;
export const NUMMER_LETTER_PX = 10;
/**
 * Verschuiving van het staafnummer ten opzichte van de profielnaam (px). Een
 * tekstregel is hoger dan de letterhoogte (stok en staart): de onderstok van
 * de naam (~0,25 × 9) plus de bovenstok van het nummer (~0,95 × 10) is bijna
 * 12 px, in welke richting de staaf ook loopt. 14 laat daartussen een kiertje.
 */
export const NUMMER_STAPEL_PX = 14;
/** Ruimte tussen de rand van het aanzicht en een label (px). */
export const AANZICHT_MARGE_PX = 7;
/** Halve letterhoogte van het breedtelabel (dat midden op zijn plaats staat). */
const BREEDTE_HALF_PX = 5;

/** Ruwe schatting van de labelbreedte (px) bij `letterPx` letterhoogte. */
function breedteSchatting(tekst: string, letterPx: number): number {
  return tekst.length * letterPx * 0.61 + 10;
}

export function staafLabelPlaatsen(
  p1: SchermPunt,
  p2: SchermPunt,
  labels: {
    profiel?: string | null;
    nummer?: string | null;
    breedte?: string | null;
    /** Halve hoogte van het aanzicht op het scherm (px); ontbreekt = geen aanzicht. */
    aanzichtHalfPx?: number;
  },
): { profiel: LabelPlaats | null; nummer: LabelPlaats | null; breedte: LabelPlaats | null } {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const leeg = { profiel: null, nummer: null, breedte: null };
  if (!(len > 0)) return leeg;
  let hoek = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (hoek > 90) hoek -= 180;
  if (hoek < -90) hoek += 180;
  // Loodrecht op de staaf, naar de kant die op het scherm omhoog wijst (bij
  // een verticale staaf: rechts), zodat het label niet op de diagrammen valt.
  const nx = -dy / len, ny = dx / len;
  const teken = ny > 0 ? -1 : 1;
  const ox = nx * teken, oy = ny * teken;
  const mx = p1.x + dx / 2, my = p1.y + dy / 2;
  const plaats = (afstand: number): LabelPlaats => ({ x: mx + ox * afstand, y: my + oy * afstand, hoek, afstand });

  const half = labels.aanzichtHalfPx;
  const basis = half !== undefined
    ? Math.max(PROFIEL_LABEL_OFFSET_PX, half + AANZICHT_MARGE_PX)
    : PROFIEL_LABEL_OFFSET_PX;
  const past = (t: string | null | undefined, letterPx: number): t is string =>
    !!t && len >= breedteSchatting(t, letterPx);

  const profiel = past(labels.profiel, PROFIEL_LETTER_PX) ? plaats(basis) : null;
  const nummer = past(labels.nummer, NUMMER_LETTER_PX)
    ? plaats(profiel ? basis + NUMMER_STAPEL_PX : basis)
    : null;
  const breedte = half !== undefined && past(labels.breedte, PROFIEL_LETTER_PX)
    ? plaats(-(Math.max(PROFIEL_LABEL_OFFSET_PX, half + AANZICHT_MARGE_PX) + BREEDTE_HALF_PX))
    : null;
  return { profiel, nummer, breedte };
}
