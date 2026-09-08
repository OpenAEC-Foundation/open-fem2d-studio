/**
 * variantInvoer.ts — de invoerkant van de profielvarianten: welke staaf gaat
 * de bestaande toetsbouwer in, wat gebeurt er met de doorbuiging, en welke
 * mededeling hoort er bij het getal dat eruit komt.
 *
 * Puur en zonder store, zodat de tests hem kunnen draaien zonder zustand of
 * Tauri. `stores/variantStore.ts` doet de orkestratie: de kern aanroepen en de
 * uitkomsten in een tabel zetten.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DE AANNAME, EN WAAROM ZE NOOIT STILZWIJGEND MAG BLIJVEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Alleen de WEERSTAND wordt opnieuw bepaald. De krachtsverdeling — N, V en M
 * per station, uit de doorgerekende combinaties — blijft staan zoals ze is.
 *
 * Voor een STATISCH BEPAALDE constructie is dat exact juist: daar volgen de
 * staafkrachten uit evenwicht alleen, en de doorsnede doet er niet aan mee.
 *
 * Voor een STATISCH ONBEPAALDE constructie is het aantoonbaar fout. Een
 * stijvere ligger trekt méér moment naar zich toe, een slappere stoot het af
 * naar zijn buren. De getoonde unity check van een variant is dan te gunstig of
 * te ongunstig, en aan het getal alleen is niet te zien welke van de twee.
 * Daarom levert `afwijkingTekst` in dat geval voor ELKE variant een mededeling
 * die bij het getal hoort te staan — geen voetnoot onderaan — met de richting
 * van de fout erbij:
 *
 *   stijvere variant  → trekt méér moment aan → werkelijke UC HOGER dan getoond
 *                       (de onveilige kant);
 *   slappere variant  → stoot moment af       → werkelijke UC LAGER dan getoond.
 *
 * Er is nog een tweede afwijking, die óók voor een statisch bepaalde
 * constructie geldt: het EIGEN GEWICHT. Staat dat in het model aan, dan volgt
 * het uit de doorsnede, en een zwaardere variant belast zichzelf meer dan hier
 * gerekend. Ook die richting staat bij elke regel.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DE DOORBUIGING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Doorbuiging is geen weerstand maar een uitkomst: de rekenkern KRIJGT hem als
 * invoer. Onder dezelfde aanname ("de belasting en de krachtsverdeling blijven
 * gelijk") schaalt hij met de traagheid:
 *
 *     w_variant = w_huidig · I_huidig / I_variant
 *
 * Dat doet `schaalDoorbuiging`, en de aanname gaat als notitie mee naar de
 * doorbuigingstoets zodat ze ook in het opengeklapte blok en in het rapport
 * staat. Zonder die schaling zou de doorbuigingstoets van een variant helemaal
 * niet gemeld kunnen worden — en juist die is bij hout vaak maatgevend.
 */
import type { Beam } from "../components/fem/femTypes";
import type { VariantVoorstel } from "./profielVarianten";
import { isSteelProfile } from "./steelCheckBuilder";
import { matchSupportedTimberGrade } from "./timberCheckBuilder";
import { matchSupportedConcreteClass } from "./betonCheckBuilder";
import { isCltProfiel } from "./cltCheckBuilder";
import { isVrijMateriaal } from "./vrijMateriaal";

/** Materiaalsoort van een staaf, met dezelfde regels als de toetsbouwers. */
export type StaafMateriaal = "staal" | "hout" | "beton" | "clt" | "vrij" | "onbekend";

/**
 * Welke bouwer deze staaf toetst. Dezelfde volgorde als `checkStore.run`: een
 * vrij materiaal en een CLT-opbouw worden er eerst uitgehaald, want hun profiel
 * respectievelijk hun materiaal zou anders bij de verkeerde bouwer belanden.
 */
export function materiaalVanStaaf(beam: Beam): StaafMateriaal {
  if (isVrijMateriaal(beam.material)) return "vrij";
  if (isCltProfiel(beam.profile)) return "clt";
  if (matchSupportedConcreteClass(beam.material) !== null) return "beton";
  if (matchSupportedTimberGrade(beam.material) !== null) return "hout";
  if (isSteelProfile(beam.profile)) return "staal";
  return "onbekend";
}

/** De staaf zoals hij er met de variantdoorsnede uitziet. */
export function staafMetVariant(beam: Beam, voorstel: VariantVoorstel): Beam {
  const uit: Beam = { ...beam };
  if (voorstel.profielnaam !== null) uit.profile = voorstel.profielnaam;
  if (voorstel.korf !== null) {
    uit.checkConfig = { ...(beam.checkConfig ?? {}), betonKorf: voorstel.korf };
  }
  return uit;
}

/** De notitie die bij de geschaalde doorbuiging van een variant hoort. */
export function doorbuigingNotitie(iNu: number, iVar: number): string {
  return (
    `De zakking is niet opnieuw uitgerekend maar GESCHAALD: w_variant = w_huidig · ` +
    `I_huidig / I_variant = w_huidig · ${Math.round(iNu)} / ${Math.round(iVar)} = ` +
    `${(iNu / iVar).toLocaleString("nl-NL", { maximumFractionDigits: 3 })} · w_huidig. ` +
    "Dat geldt onder dezelfde aanname als de rest van deze variant: de belasting en " +
    "de krachtsverdeling blijven gelijk. In een statisch onbepaalde constructie " +
    "verandert de krachtsverdeling wél mee, en dan klopt ook deze schaling niet."
  );
}

/**
 * Schaal de doorbuiging in de toetsinvoer met I_huidig / I_variant en zet de
 * aanname in de notities. Zonder bruikbare traagheden gebeurt er niets aan de
 * getallen — dan staat er liever de ongeschaalde waarde mét een melding dat ze
 * niet bij deze variant hoort, dan een verzonnen factor.
 *
 * `velden` noemt de doorbuigingsvelden van de betreffende kern: de staalkern
 * heeft er één (`deflection_actual_max_mm`), de houtkern twee
 * (`deflection_inst_mm` en `deflection_quasi_perm_mm`). De betonkern kent geen
 * doorbuigingstoets en komt hier dus niet langs.
 */
export function schaalDoorbuiging<T extends { deflection_notes: string[] }>(
  invoer: T,
  velden: (keyof T)[],
  iNu: number | null,
  iVar: number | null,
): T {
  if (iNu === null || iVar === null || !(iNu > 0) || !(iVar > 0)) {
    invoer.deflection_notes = [
      ...invoer.deflection_notes,
      "De zakking van deze variant kon niet worden geschaald omdat het " +
        "traagheidsmoment van de huidige of de variantdoorsnede niet bekend is. " +
        "De hier getoetste zakking is die van de OORSPRONKELIJKE doorsnede en " +
        "hoort niet bij deze variant.",
    ];
    return invoer;
  }
  const factor = iNu / iVar;
  for (const veld of velden) {
    const w = invoer[veld];
    if (typeof w === "number") (invoer as Record<keyof T, unknown>)[veld] = w * factor;
  }
  invoer.deflection_notes = [...invoer.deflection_notes, doorbuigingNotitie(iNu, iVar)];
  return invoer;
}

/**
 * De afwijkingstekst van één variantregel: wat er niet is herrekend, en welke
 * kant het getoonde getal daardoor op zit. Zie de kop van dit bestand.
 *
 * `kort` hoort naast het getal in de tabel te staan, `vol` in de tooltip en in
 * het rapport. Beide zijn leeg wanneer er niets af te wijken valt — statisch
 * bepaald én even zwaar, wat in de praktijk alleen bij een wapeningsvariant
 * van een statisch bepaalde ligger voorkomt.
 */
export function afwijkingTekst(
  voorstel: Pick<VariantVoorstel, "iMm4" | "aMm2">,
  huidig: { iMm4: number | null; aMm2: number | null },
  statischBepaald: boolean,
): { kort: string; vol: string } {
  const korte: string[] = [];
  const volle: string[] = [];

  const iVar = voorstel.iMm4;
  const iNu = huidig.iMm4;
  const stijver = iVar !== null && iNu !== null && iVar > iNu * (1 + 1e-9);
  const slapper = iVar !== null && iNu !== null && iVar < iNu * (1 - 1e-9);

  if (!statischBepaald) {
    if (stijver) {
      korte.push("stijver → werkelijke UC hoger");
      volle.push(
        "De krachtsverdeling is niet herrekend. Deze variant is stijver dan de " +
          "doorsnede waarmee gerekend is en trekt in een statisch onbepaalde " +
          "constructie méér moment naar zich toe; de werkelijke unity check ligt " +
          "dus HOGER dan hier getoond — de onveilige kant.",
      );
    } else if (slapper) {
      korte.push("slapper → werkelijke UC lager");
      volle.push(
        "De krachtsverdeling is niet herrekend. Deze variant is slapper dan de " +
          "doorsnede waarmee gerekend is en stoot in een statisch onbepaalde " +
          "constructie moment af naar de omliggende staven; de werkelijke unity " +
          "check ligt dus LAGER dan hier getoond.",
      );
    } else {
      korte.push("krachtsverdeling niet herrekend");
      volle.push(
        "De krachtsverdeling is niet herrekend. De bruto doorsnede is gelijk " +
          "gebleven, dus de richting van de afwijking volgt niet uit de traagheid; " +
          "in gescheurde toestand verandert de stijfheid wél met de wapening, en " +
          "daarmee ook de momentverdeling in een statisch onbepaalde constructie.",
      );
    }
  }

  const aVar = voorstel.aMm2;
  const aNu = huidig.aMm2;
  if (aVar !== null && aNu !== null && Math.abs(aVar - aNu) > aNu * 1e-9) {
    const zwaarder = aVar > aNu;
    korte.push(zwaarder ? "zwaarder → werkelijke UC hoger" : "lichter → werkelijke UC lager");
    volle.push(
      `Het eigen gewicht is niet herrekend. De doorsnede is ${zwaarder ? "groter" : "kleiner"} ` +
        `(${Math.round(aVar)} mm² tegen ${Math.round(aNu)} mm²), dus als het eigen gewicht in ` +
        `het model meedoet is de werkelijke belasting ${zwaarder ? "hoger" : "lager"} dan hier ` +
        `gerekend en ligt de werkelijke unity check ${zwaarder ? "hoger" : "lager"}.`,
    );
  }

  return { kort: korte.join(" · "), vol: volle.join(" ") };
}
