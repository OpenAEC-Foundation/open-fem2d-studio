/**
 * resultaatInfoStore — wat draagt het resultaat dat NU op het canvas staat?
 *
 * Eén vlaggetje, geen resultaatdata. Het bestaat omdat de weergavelijst
 * ("Weergave op canvas", FemProjectTree) standen kan aanbieden die alleen
 * inhoud hebben bij een bepaald soort berekening. De EI-stand is daar het
 * eerste geval van: de buigstijfheid per staafdeel komt uit
 * `ElementForces.segmenten`, en dat veld is er alleen na een fysisch
 * niet-lineaire (beton)berekening. Ontbreekt het, dan is er niets gescheurd
 * gerekend — een geldige toestand, geen fout — en hoort de gebruiker dat te
 * lezen in plaats van een lege canvas-laag aan te zetten.
 *
 * De weergavelijst zit in een andere tak van de boom dan het canvas: de
 * boom krijgt het model, het canvas krijgt het resultaat. Dit vlaggetje is de
 * kortste verbinding daartussen, en bewust het ENIGE dat er doorheen gaat —
 * wie hier resultaatdata in wil hangen, hoort die via props te laten lopen.
 *
 * Schrijver: FemCanvas (die kent `overlayResult`). Lezer: FemProjectTree.
 */
import { create } from "zustand";

interface ResultaatInfoState {
  /**
   * True zodra ten minste één staaf in het getoonde resultaat
   * segmentuitkomsten draagt (`ElementForces.segmenten`), dus zodra er een
   * EI-verloop langs de staaf te tekenen valt.
   */
  heeftSegmentStijfheid: boolean;
  setHeeftSegmentStijfheid: (v: boolean) => void;
}

export const useResultaatInfoStore = create<ResultaatInfoState>((set) => ({
  heeftSegmentStijfheid: false,
  setHeeftSegmentStijfheid: (v) =>
    // Alleen schrijven bij een echte wisseling: de aanroeper draait dit in een
    // effect dat bij elke solve opnieuw langskomt, en een gelijke set zou
    // iedere abonnee onnodig laten hertekenen.
    set((s) => (s.heeftSegmentStijfheid === v ? s : { heeftSegmentStijfheid: v })),
}));
