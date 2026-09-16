/**
 * materiaalDubbelzinnig.ts — één plek voor de vraag "is deze materiaalnaam
 * tegelijk een houtsterkteklasse en de korte naam van een betonklasse?"
 *
 * WAAROM DIT BESTAND BESTAAT (basisaudit nr 16)
 * "C16", "C20", "C30" en "C35" zijn houtsterkteklassen (EN 338, tabel 1) én
 * de korte vorm van de betonklassen C16/20, C20/25, C30/37 en C35/45
 * (NEN-EN 1992-1-1, tabel 3.1). Tot september 2026 las elk deel van de app
 * zo'n naam anders: de solver rekende hout (E = 12 000 N/mm², eigen gewicht
 * van hout), de houtbouwer toetste hout, de betonbouwer toetste C30/37, en
 * de fysisch niet-lineaire stand nam betonstijfheid. Eén staaf, vier
 * interpretaties, en geen melding — de dekkingscontrole zweeg omdat twee
 * bouwers de staaf "dekten". Gemeten met "C30" 300×500 en een korf: solver
 * E 12 000 tegen 33 000 N/mm² voor "C30/37", eigen gewicht 0,68 tegen
 * 3,68 kN/m, en tóch een betontoets.
 *
 * De keuze: een korte naam is HOUT, nooit stil beton. Beton vraagt de
 * volledige naam ("C30/37"). Dat is de regel die de Rust-kant al hanteerde
 * (`is_betonklasse` in fem_tools.rs) en die `resolveSection` voor de
 * stijfheid al volgde; de betonbouwer sluit zich daar nu bij aan. Zo verandert
 * geen bestaand houtproject: een houten C30-staaf rekende al als hout en
 * blijft dat, en krijgt alleen een melding erbij. Wat wél verandert is de
 * spooktoets: de betonbouwer neemt "C30" niet meer aan.
 */
import { SUPPORTED_CONCRETE_CLASSES } from "./betonCheckBuilder";
import { SUPPORTED_TIMBER_GRADES } from "./timberCheckBuilder";

/** De twee lezingen van een dubbelzinnige naam. */
export interface DubbelzinnigMateriaal {
  /** De houtsterkteklasse zoals de app hem rekent, bv. "C30". */
  hout: string;
  /** De betonklasse waarvan dit de korte naam is, bv. "C30/37". */
  beton: string;
}

/**
 * Is `material` zowel een ondersteunde houtsterkteklasse als de korte naam
 * van een ondersteunde betonklasse? Zo ja: beide lezingen; anders `null`.
 */
export function dubbelzinnigMateriaal(material: string | undefined): DubbelzinnigMateriaal | null {
  if (!material) return null;
  const naam = material.trim();
  const hout = (SUPPORTED_TIMBER_GRADES as readonly string[]).find(
    (g) => g.toLowerCase() === naam.toLowerCase(),
  );
  if (!hout) return null;
  const beton = (SUPPORTED_CONCRETE_CLASSES as readonly string[]).find(
    (c) => c.split("/")[0].toLowerCase() === naam.toLowerCase(),
  );
  return beton ? { hout, beton } : null;
}

/**
 * De melding bij een dubbelzinnige naam. Met een wapeningskorf op de staaf
 * botsen de twee lezingen hard (de korf zegt beton, de naam rekent hout) en
 * is het een fout; zonder korf is het een waarschuwing.
 */
export function dubbelzinnigMateriaalTekst(
  beamId: number,
  d: DubbelzinnigMateriaal,
  metKorf: boolean,
): string {
  const basis =
    `Staaf ${beamId}: materiaal "${d.hout}" is dubbelzinnig — het is houtsterkteklasse ` +
    `${d.hout} (EN 338) én de korte naam van betonklasse ${d.beton} (NEN-EN 1992-1-1 ` +
    `tabel 3.1). Er wordt met HOUT gerekend (stijfheid en eigen gewicht van hout, ` +
    `houttoets); de betontoets slaat deze staaf over. Bedoelt u beton, schrijf dan ` +
    `"${d.beton}".`;
  return metKorf
    ? basis +
        " Deze staaf heeft bovendien een wapeningskorf, en die hoort bij beton: dat " +
        `botst. Schrijf "${d.beton}" voor beton, of haal de korf weg voor hout.`
    : basis;
}
