/**
 * "Niet uitgevoerd" in het toetsingsoverzicht van het rapport (issue #18).
 *
 * WAAROM. Een betonstaaf waarvan een draagkrachttoets niet kon (bijvoorbeeld
 * de dwarskracht zonder beugelgegevens), krijgt terecht de status N.v.t. in
 * plaats van Voldoet. Maar de samenvattingstabel zei niet WELKE toets ontbrak;
 * dat stond pas verderop, in de afleiding van die toets. En een ontbrekende
 * detailleringseis, die de status niet raakt, was in de samenvatting helemaal
 * onzichtbaar.
 *
 * De kern zet die toetsen al in `niet_uitgevoerd` (EN 1992-1-1; zie
 * `concrete-check/src/result.rs`). Dit is de ene plek die ze voor het rapport
 * verzamelt, zodat het live rapport dezelfde regels toont als de PDF
 * (`niet_uitgevoerd_overzicht` in `report/src/lib.rs`): per staaf, op
 * staafnummer, met doorsnede en klasse.
 */
import {
  gradeLabel,
  isConcreteCheckResult,
  sectionLabel,
  type MemberCheckResult,
} from "./checkTypes";
import type { NietUitgevoerdeToets } from "./types/concrete/NietUitgevoerdeToets";

export interface NietUitgevoerdRegel {
  beamId: number;
  sectie: string;
  klasse: string;
  /** In de volgorde van de kern. Nooit leeg. */
  toetsen: NietUitgevoerdeToets[];
}

/**
 * Alle staven met minstens één niet-uitgevoerde toets, op staafnummer.
 * Alleen de betonkern levert het veld; de andere kernen weigeren een toets die
 * niet kan in plaats van hem over te slaan. Een antwoord van vóór het veld
 * (zonder `niet_uitgevoerd`) telt als leeg.
 */
export function nietUitgevoerdOverzicht(results: readonly MemberCheckResult[]): NietUitgevoerdRegel[] {
  return results
    .filter(isConcreteCheckResult)
    .filter((r) => Array.isArray(r.niet_uitgevoerd) && r.niet_uitgevoerd.length > 0)
    .map((r) => ({
      beamId: r.beam_id,
      sectie: sectionLabel(r),
      klasse: gradeLabel(r),
      toetsen: r.niet_uitgevoerd,
    }))
    .sort((a, b) => a.beamId - b.beamId);
}

/**
 * De toetsen van één regel als tekst: "Dwarskracht; Minimumwapening
 * (detailleringseis)". `detailleringseis` is het vertaalde woord.
 */
export function nietUitgevoerdToetsen(regel: NietUitgevoerdRegel, detailleringseis: string): string {
  return regel.toetsen
    .map((t) => (t.detaillering ? `${t.titel} (${detailleringseis})` : t.titel))
    .join("; ");
}
