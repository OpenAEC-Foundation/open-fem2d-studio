/**
 * kolomgegevens.ts — de figuur 5.7-gevallen en de regels eromheen, zónder
 * React.
 *
 * WAAROM APART VAN `KolomVelden.tsx`
 * Dezelfde reden als bij `wapeningskorf.ts` naast `KorfVelden.tsx`: dit zijn
 * pure functies over gegevens, en een test moet ze kunnen aanroepen zonder een
 * DOM, zonder React en zonder de CSS-import die een `.tsx`-component
 * meebrengt. Ze horen ook inhoudelijk niet in een component thuis — welke
 * knikgevallen bij welke schoring horen is een uitspraak over de NORM en niet
 * over een keuzelijst.
 *
 * WAT HIER NIET IN ZIT
 * De factoren hieronder staan er om te TONEN wat de gebruiker kiest. Gerekend
 * wordt er in de Rust-kern (`nen_en_1992_1_1::kolom::Knikgeval::l0_factor`),
 * zodat er niet twee plaatsen zijn waar deze getallen kunnen verschuiven.
 */
import type { Knikgeval } from "../../lib/types/concrete/Knikgeval";
import type { Kniklengtekeuze } from "../../lib/types/concrete/Kniklengtekeuze";
import type { Schoring } from "../../lib/types/concrete/Schoring";

/**
 * De vijf vakjes van figuur 5.7 met een VASTE l₀, met hun factor en de
 * schoring waar ze bij horen.
 *
 * De factoren zijn de bijschriften van de figuur zelf: a) l₀ = l, b) l₀ = 2l,
 * c) l₀ = 0,7l, d) l₀ = l/2, e) l₀ = l.
 *
 * De vakjes f) en g) staan er NIET bij. Hun bijschrift geeft een BEREIK
 * (l/2 < l₀ < l respectievelijk l₀ > 2l) en niet een waarde, want zij horen bij
 * de vergelijkingen (5.15) en (5.16). Die vragen k = (θ/M)·(EI/l) per
 * staafeind — de relatieve flexibiliteit van de verhindering, mét het effect
 * van scheurvorming in de verhinderende elementen (§5.8.3.2(5)) — en dat getal
 * is uit een raamwerkmodel niet af te lezen. Wie k wél heeft, rekent
 * (5.15)/(5.16) door en geeft l₀ rechtstreeks op.
 *
 * WELKE SCHORING BIJ WELK VAKJE. Dat is een lezing van de TEKENING en geen zin
 * uit de norm: a), c) en d) tekenen een bovenste einde dat zijdelings wordt
 * gehouden, b), e) en g) niet. De Rust-kern doet dezelfde lezing
 * (`Knikgeval::schoring`) en WEIGERT een tegenspraak; deze lijst zorgt dat het
 * invoerscherm er geen kan maken.
 */
export const KNIKGEVALLEN: {
  geval: Knikgeval;
  schoring: Schoring;
  letter: string;
  factor: number;
  label: string;
}[] = [
  {
    geval: "ScharnierendScharnierend",
    schoring: "Geschoord",
    letter: "a",
    factor: 1.0,
    label: "a) beide einden scharnierend, zijdelings gesteund — l₀ = l",
  },
  {
    geval: "IngeklemdScharnierend",
    schoring: "Geschoord",
    letter: "c",
    factor: 0.7,
    label: "c) onder ingeklemd, boven scharnierend en gesteund — l₀ = 0,7·l",
  },
  {
    geval: "TweezijdigIngeklemdGeschoord",
    schoring: "Geschoord",
    letter: "d",
    factor: 0.5,
    label: "d) beide einden ingeklemd, zijdelings gesteund — l₀ = l/2",
  },
  {
    geval: "Console",
    schoring: "Ongeschoord",
    letter: "b",
    factor: 2.0,
    label: "b) onder ingeklemd, boven volledig vrij (console) — l₀ = 2·l",
  },
  {
    geval: "TweezijdigIngeklemdOngeschoord",
    schoring: "Ongeschoord",
    letter: "e",
    factor: 1.0,
    label: "e) beide einden ingeklemd, boven zijdelings vrij — l₀ = l",
  },
];

/** De gevallen die bij één schoring horen, in de volgorde van de figuur. */
export function knikgevallenVoor(schoring: Schoring) {
  return KNIKGEVALLEN.filter((g) => g.schoring === schoring);
}

/** De l₀-factor van een vakje, of `null` als het er niet bij staat. */
export function l0FactorVan(geval: Knikgeval): number | null {
  return KNIKGEVALLEN.find((g) => g.geval === geval)?.factor ?? null;
}

/**
 * De kniklengte die bij een nieuwe schoring hoort.
 *
 * Blijft de huidige keuze geldig, dan verandert er niets — wisselen tussen
 * geschoord en ongeschoord mag een handmatig opgegeven l₀ niet wissen, en een
 * geval dat bij allebei zou passen evenmin. Is zij ongeldig geworden (geval b)
 * bij "geschoord" bijvoorbeeld), dan valt hij terug op het EERSTE geval van de
 * nieuwe lijst: a) l₀ = l voor geschoord, b) de console voor ongeschoord.
 *
 * Zonder deze regel zou het scherm een combinatie kunnen opleveren die de kern
 * terecht weigert — een console die "geschoord" heet — en zou de gebruiker een
 * foutmelding krijgen op een keuze die hij niet bewust heeft gemaakt.
 */
export function kniklengteVoorSchoring(
  huidig: Kniklengtekeuze | undefined,
  schoring: Schoring,
): Kniklengtekeuze {
  if (huidig && huidig.soort === "Opgegeven") return huidig;
  const lijst = knikgevallenVoor(schoring);
  if (huidig && huidig.soort === "Figuur57") {
    if (lijst.some((g) => g.geval === huidig.geval)) return huidig;
  }
  return { soort: "Figuur57", geval: lijst[0].geval };
}
