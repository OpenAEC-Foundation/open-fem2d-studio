/**
 * blijvendeZakking.ts — w₁: de zakking onder ALLEEN de blijvende belasting.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * NEN-EN 1990:2002/NB:2019 vervangt de tekst van A1.4.3(2) en definieert bij
 * figuur NB.1 (die A1.1 vervangt):
 *
 *   w_c    zeeg van het onbelaste constructief element;
 *   w₁     "aanvangsdeel van de doorbuiging onder de blijvende belastingen uit
 *          de van toepassing zijnde belastingscombinatie overeenkomstig de
 *          formules (6.14a) tot en met (6.16b) bepaald met de korte-duur
 *          eigenschappen";
 *   w₂     "bijkomend deel van de doorbuiging bij lange-duurgedrag";
 *   w₃     "bijkomend deel van de doorbuiging bij korte-duurgedrag, gelijk aan
 *          de doorbuiging ten gevolge van de belastingen uit de van toepassing
 *          zijnde belastingscombinatie […] verminderd met w₁";
 *   w_tot  "totale doorbuiging als de som van w₁, w₂ en w₃";
 *   w_max  "maximale doorbuiging, rekening houdend met de zeeg, w_tot − w_c".
 *
 * A1.4.3(3) legt zijn grenswaarden op "de som van de vervorming w₂ en w₃".
 * Dus: w_add = w₂ + w₃ = w_tot − w₁. Met w₁ = 0 wordt w_add gelijk aan w_tot,
 * en dat is precies wat er tot september 2026 gebeurde — zowel in de
 * houtbouwer als in de staalbouwer stond er onvoorwaardelijk
 * `deflection_permanent_mm: 0`. Voor een C24-vloerligger 45 × 145 met
 * G = 0,5 kN/m naast Q = 1,5 kN/m (cat. A) betekende dat UC 2,39 waar UC 1,93
 * hoort: bijna een kwart te streng.
 *
 * LET OP DE ZEEG. Die hoort bij w_max (w_tot − w_c) en NIET bij w₁; een zeeg
 * mag w_add dus niet verkleinen. Deze module raakt de zeeg niet aan.
 *
 * WELKE COMBINATIE IS "ALLEEN DE BLIJVENDE BELASTING"?
 * ----------------------------------------------------
 * Geen verzonnen lastgeval en geen eigen sommatie: de standaardset van
 * `solver/normcombinaties.ts` bevat de combinatie al. Uitdrukking 6.16b wordt
 * daar in ÁL haar opstellingen gegenereerd — elk veranderlijk geval aan- of
 * afwezig — en de opstelling waarin alle veranderlijke gevallen afwezig zijn
 * is G alleen, met factor 1,0 ("BGT quasi-blijvend 6.16b — zonder Q"). Draagt
 * een veranderlijke belasting ψ₂ = 0 (sneeuw, wind, categorie H), dan is de
 * volledige 6.16b zelf al G alleen.
 *
 * Herkenning hier gebeurt daarom op de FACTOREN en niet op de naam of op de
 * soort: elke BGT-combinatie die uitsluitend blijvende belastinggevallen met
 * factor 1,0 draagt, is w₁ — of ze nu 6.14b, 6.15b, 6.16b of een eigen
 * combinatie is. Dat is ook wat de NB zegt: "de blijvende belastingen uit de
 * van toepassing zijnde belastingscombinatie overeenkomstig de formules
 * (6.14a) tot en met (6.16b)"; in al die uitdrukkingen staat G met factor 1,0.
 *
 * EISEN AAN DE KANDIDAAT, en waarom ze streng zijn:
 *  - ALLE blijvende gevallen van het model moeten erin staan. Een combinatie
 *    met maar een deel ervan geeft een te kleine w₁ en dus een te grote w_add;
 *    dat is veilig, maar het is niet w₁ en het zou als w₁ in het rapport komen.
 *  - Factor exact 1,0. Een BGT-combinatie met 0,9·G is geen uitdrukking 6.14a
 *    t/m 6.16b en dus geen w₁.
 *  - Geen enkel veranderlijk geval met een factor ≠ 0.
 *
 * Zonder kandidaat: w₁ = 0 MET een notitie die zegt dat w_add daardoor de
 * volledige zakking is. Een stille 0 is erger dan een fout.
 */
import type { LoadCase } from "../components/fem/femTypes";
import type { LoadCombination } from "../components/fem/solver/combinations";

/** Het deel van een belastinggeval dat deze module leest. */
export type GevalSoort = Pick<LoadCase, "id" | "type">;

/** Uitkomst van de w₁-bepaling: het getal, de herkomst en de toelichting. */
export interface BlijvendeZakking {
  /** w₁ in mm, teken behouden (negatief = omlaag); 0 = niet af te leiden. */
  mm: number;
  /** De combinatie waaruit w₁ komt; `null` als er geen bruikbare was. */
  combo: LoadCombination | null;
  /** Regels voor `deflection_notes`; belanden letterlijk in het rapport. */
  notes: string[];
}

/** Getal met decimale komma, zoals de rest van het rapport. */
function nl(x: number, cijfers = 2): string {
  return x.toFixed(cijfers).replace(".", ",");
}

/**
 * De BGT-combinaties die uitsluitend de blijvende belasting dragen — de
 * kandidaten voor w₁. Lege lijst = dit model kent er geen.
 *
 * `loadCases` is nodig om "blijvend" van "veranderlijk" te onderscheiden;
 * zonder die lijst is er niets af te leiden en komt er een lege uitkomst.
 */
export function blijvendeBgtCombinaties(
  combinations: readonly LoadCombination[],
  loadCases: readonly GevalSoort[] | undefined,
): LoadCombination[] {
  if (!loadCases || loadCases.length === 0) return [];
  const blijvend = new Set(loadCases.filter((c) => c.type === "dead").map((c) => c.id));
  if (blijvend.size === 0) return [];
  return combinations.filter((c) => {
    if (c.type !== "sls") return false;
    const werkzaam = [...c.factors].filter(([, f]) => f !== 0);
    if (werkzaam.length !== blijvend.size) return false;
    return werkzaam.every(([id, f]) => blijvend.has(id) && f === 1);
  });
}

/** Wat de aanroeper moet meegeven om w₁ te laten bepalen. */
export interface BlijvendeZakkingOpties {
  /** Alle combinaties van het model (UGT en BGT); hier wordt uit gekozen. */
  combinations: readonly LoadCombination[];
  /** De belastinggevallen; ontbreken → geen w₁, met reden. */
  loadCases: readonly GevalSoort[] | undefined;
  /**
   * De zakking van DEZE staaf onder één combinatie, in mm met teken.
   * `null` = die combinatie levert geen krachtsverloop voor de staaf.
   *
   * Als callback en niet als resultatenkaart, zodat elke bouwer zijn eigen
   * meting gebruikt (veldmaximum vanaf de koorde, of de zijdelingse
   * verplaatsing) en deze module niet van een bouwer hoeft te importeren.
   */
  meet: (combo: LoadCombination) => number | null;
}

/**
 * w₁ voor één staaf, met de herkomst in de notitie — of 0 met de reden
 * waarom hij niet af te leiden was.
 *
 * Bij meer dan één bruikbare kandidaat wint de KLEINSTE |w₁|: een kleinere w₁
 * geeft via w_add = w_tot − w₁ een grotere bijkomende zakking, en dat is de
 * veilige kant. Door de eisen in `blijvendeBgtCombinaties` dragen alle
 * kandidaten dezelfde last en zijn ze in de praktijk gelijk; de regel dekt het
 * geval waarin een eigen combinatie toch iets anders blijkt te doen.
 */
export function blijvendeZakking(opties: BlijvendeZakkingOpties): BlijvendeZakking {
  const { combinations, loadCases, meet } = opties;

  const terugval = (reden: string): BlijvendeZakking => ({
    mm: 0,
    combo: null,
    notes: [
      `w₁ — de zakking onder alleen de blijvende belasting — is op 0 gezet omdat ` +
        `${reden}. NEN-EN 1990:2002/NB:2019 A1.4.3(2) meet de bijkomende doorbuiging ` +
        `w₂ + w₃ vanaf w₁ (figuur NB.1: w_tot = w₁ + w₂ + w₃), dus krijgt de ` +
        `w_add-toets nu de VOLLEDIGE zakking in plaats van alleen het deel bovenop ` +
        `de blijvende belasting. Veilig-zijdig, maar strenger dan de norm vraagt, ` +
        `en de twee doorbuigingsregels tonen daardoor dicht bij elkaar liggende ` +
        `getallen. Terug te krijgen met een BGT-combinatie die alleen de blijvende ` +
        `belastinggevallen draagt, elk met factor 1,0 — de standaardset heeft er ` +
        `een: uitdrukking 6.16b in de opstelling zonder veranderlijke gevallen.`,
    ],
  });

  if (!loadCases || loadCases.length === 0) {
    return terugval("de belastinggevallen niet zijn meegegeven, zodat niet te zien is welk geval blijvend is");
  }
  if (!loadCases.some((c) => c.type === "dead")) {
    return terugval('dit model geen blijvend belastinggeval (type "dead") kent');
  }

  const kandidaten = blijvendeBgtCombinaties(combinations, loadCases);
  if (kandidaten.length === 0) {
    return terugval(
      "dit model geen BGT-combinatie kent die uitsluitend de blijvende " +
        "belastinggevallen met factor 1,0 draagt",
    );
  }

  const gemeten: { combo: LoadCombination; w: number }[] = [];
  for (const combo of kandidaten) {
    const w = meet(combo);
    if (w !== null) gemeten.push({ combo, w });
  }
  if (gemeten.length === 0) {
    return terugval(
      `de blijvende BGT-combinatie${kandidaten.length > 1 ? "s" : ""} ` +
        kandidaten.map((c) => `"${c.name}"`).join(", ") +
        " geen krachtsverloop voor deze staaf oplevert — reken het model opnieuw door",
    );
  }

  let gekozen = gemeten[0];
  for (const g of gemeten) if (Math.abs(g.w) < Math.abs(gekozen.w)) gekozen = g;

  const notes = [
    `w₁ = ${nl(gekozen.w)} mm, de zakking onder de BGT-combinatie ` +
      `"${gekozen.combo.name}" (${gekozen.combo.formula}) — de enige werkzame ` +
      `factoren daarin zijn de blijvende belastinggevallen met factor 1,0. ` +
      `NEN-EN 1990:2002/NB:2019 A1.4.3(2) noemt w₁ het "aanvangsdeel van de ` +
      `doorbuiging onder de blijvende belastingen uit de van toepassing zijnde ` +
      `belastingscombinatie", en legt de grenswaarden van A1.4.3(3) op w₂ + w₃ = ` +
      `w_tot − w₁ (figuur NB.1). De zeeg w_c zit hier NIET in: die trekt de norm ` +
      `pas van w_tot af in w_max, niet in w₂ + w₃.`,
  ];
  if (gemeten.length > 1) {
    notes.push(
      "Meer dan één BGT-combinatie draagt alleen de blijvende belasting: " +
        gemeten.map((g) => `"${g.combo.name}" ${nl(g.w)} mm`).join("; ") +
        ". Genomen is de kleinste |w₁|, want een kleinere w₁ geeft een grotere " +
        "bijkomende zakking w₂ + w₃ — de veilige kant.",
    );
  }
  return { mm: gekozen.w, combo: gekozen.combo, notes };
}
