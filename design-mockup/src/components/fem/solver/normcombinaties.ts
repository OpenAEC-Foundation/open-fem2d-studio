/**
 * normcombinaties.ts — de standaardbelastingcombinaties volgens NEN-EN 1990
 * met de Nederlandse nationale bijlage (NEN-EN 1990:2002/NB:2019), AFGELEID
 * uit de belastinggevallen en de gevolgklasse.
 *
 * WAAROM DIT BESTAAT
 * Tot september 2026 was de standaardset een vaste lijst van acht combinaties
 * met vaste case-id's (G = 1, Q = 2, S = 3, W = 4), vaste CC2-factoren en de
 * door EN 1990 AANBEVOLEN ψ-waarden. Gevolgen, gemeten in de basisaudit:
 *  - een nieuw belastinggeval kwam in geen enkele combinatie voor en telde
 *    in alle toetsen als nul (24,3 kNm waar 85,05 kNm hoort);
 *  - de gevolgklasse veranderde niets, terwijl dialoog en rapport K_FI
 *    noemden (CC3: 87,75 kNm waar NB tabel NB.5 95,625 kNm geeft);
 *  - de karakteristieke BGT-combinatie kende alleen Q als leidende last, dus
 *    wind telde met 0,6 in de horizontale verplaatsing waar A1.4.3(7) de
 *    karakteristieke combinatie met wind leidend (1,0) vraagt;
 *  - de ψ-waarden waren niet die van tabel NB.2–A1.1, terwijl het rapport
 *    "Nationale bijlage: Nederland" meldt.
 * Deze module maakt de set daarom uit wat er werkelijk in het model staat.
 *
 * WAT ER GEMAAKT WORDT
 * Blijvend (type "dead"): alle blijvende gevallen samen vormen G.
 * Veranderlijk: elke veranderlijke belasting krijgt een beurt als LEIDENDE
 * last, zoals 6.4.3.2(2) en 6.5.3(2) vragen ("de overheersende veranderlijke
 * belasting" met "de hiermee samengaande"):
 *   - UGT 6.10a        γ_G,sup·G + Σ γ_Q·ψ₀,i·Q_i               (één keer)
 *   - UGT 6.10b        γ_G,sup·G + γ_Q·Q_1 + Σ γ_Q·ψ₀,i·Q_i     (per leidende last)
 *   - UGT 6.10b gunst. γ_G,inf·G + γ_Q·Q_1                      (per leidende last)
 *   - BGT 6.14b        G + Q_1 + Σ ψ₀,i·Q_i                      (per leidende last)
 *   - BGT 6.15b        G + ψ₁,1·Q_1 + Σ ψ₂,i·Q_i                 (per leidende last)
 *   - BGT 6.16b        G + Σ ψ₂,i·Q_i                            (één keer)
 * De factoren γ komen uit NB tabel NB.4 (CC2) en NB.5 (CC1, CC3); de kolom
 * "Gunstig 0,9 G_k,j,inf" staat in beide tabellen voor 6.10a én 6.10b. In
 * 6.10a krijgt ook de belangrijkste veranderlijke belasting ψ₀ (NB.4:
 * "1,5 ψ₀,1 Q_k,1"), dus daar is geen leidende last en volstaat één
 * combinatie.
 *
 * WAT EEN "VERANDERLIJKE BELASTING" HIER IS — een expliciete keuze
 *  - Veranderlijke gevallen (type "live") met dezelfde gebruikscategorie
 *    vormen SAMEN één belasting. EN 1991-1-1 6.2.1(1) behandelt de opgelegde
 *    belasting op de vloeren van één bouwlaag als één veranderlijke
 *    belasting; wie een vloerlast over twee gevallen verdeelt, bedoelt meestal
 *    geen twee onafhankelijke belastingen. Gevallen met een ANDERE categorie
 *    zijn wel onafhankelijk (een dak, cat. H, naast een vloer, cat. A).
 *  - Sneeuwgevallen en windgevallen zijn elk een ALTERNATIEF binnen hun soort
 *    (wind van links óf van rechts; volle óf asymmetrische sneeuw): ze leiden
 *    elk apart en worden nooit bij elkaar opgeteld. Met de NB-waarden
 *    ψ₀ = ψ₂ = 0 voor sneeuw en wind zou optellen als begeleidende last toch
 *    al nul geven; de uitsluiting maakt het ook zonder dat toeval waar.
 *  - Type "other" krijgt GEEN factor: er bestaat geen normwaarde voor "overig".
 *    `lib/combinatieBeheer.ts` maakt daar een melding van, nooit een stille nul.
 *  - Windgevallen van de windgenerator (`gegenereerd.bron === "wind"`) blijven
 *    buiten deze set: de generator schrijft hun combinaties zelf, met dezelfde
 *    tabellen hieronder. Beide doen zou elke windcombinatie dubbel opleveren.
 *
 * WAT DEZE MODULE NIET DOET
 * K_FI wordt nergens nog eens op een uitkomst gezet: de gevolgklasse zit IN de
 * partiële factoren van NB.5 (de opmerking bij NB.4: "De toe te passen
 * partiële factoren in gevolgklassen 1 en 3 staan in tabel NB.5"). De
 * staalkern ontvangt de klasse alleen ter vermelding.
 */
import type { GebruiksCategorie, LoadCase } from "../femTypes";
import type { LoadCombination } from "./combinations";

// ── Gevolgklasse en partiële factoren ─────────────────────────────────────

export type Gevolgklasse = "CC1" | "CC2" | "CC3";

export const GEVOLGKLASSEN: readonly Gevolgklasse[] = ["CC1", "CC2", "CC3"];

/** De klasse die geldt als het project er geen noemt: NB.4 is de CC2-tabel. */
export const STANDAARD_GEVOLGKLASSE: Gevolgklasse = "CC2";

/**
 * K_FI per gevolgklasse, uit de opmerking bij NB tabel NB.4–A1.2(B): "Voor
 * gevolgklasse 2 geldt K_FI = 1 […] Voor gevolgklasse 1 geldt volgens tabel B3
 * K_FI = 0,9; voor gevolgklasse 3 geldt K_FI = 1,1." Alleen ter vermelding —
 * zie de kop van dit bestand.
 */
export const K_FI: Record<Gevolgklasse, number> = { CC1: 0.9, CC2: 1.0, CC3: 1.1 };

export interface PartieleFactoren {
  /** γ_G,sup in uitdrukking 6.10a. */
  gGsup610a: number;
  /** γ_G,sup in uitdrukking 6.10b. */
  gGsup610b: number;
  /** γ_G,inf — de kolom "Gunstig", in 6.10a en 6.10b gelijk. */
  gGinf: number;
  /** γ_Q voor de belangrijkste én de andere veranderlijke belastingen. */
  gQ: number;
  /** Vindplaats, zoals hij in de formule van de combinatie komt. */
  bron: string;
}

/**
 * NEN-EN 1990:2002/NB:2019 tabel NB.4–A1.2(B) (CC2) en tabel NB.5 (CC1, CC3),
 * STR/GEO groep B. Gelezen uit de PDF met `pdftotext -raw`:
 *   NB.4  6.10a 1,35 G_sup / 0,9 G_inf / 1,5 ψ₀,1 Q_k,1 / 1,5 ψ₀,i Q_k,i
 *         6.10b 1,2  G_sup / 0,9 G_inf / 1,5 Q_k,1     / 1,5 ψ₀,i Q_k,i
 *   NB.5  CC1 6.10a 1,2 / 0,9 / 1,35 ψ₀,1 / 1,35 ψ₀,i;  6.10b 1,1 / 0,9 / 1,35 / 1,35 ψ₀,i
 *         CC3 6.10a 1,5 / 0,9 / 1,65 ψ₀,1 / 1,65 ψ₀,i;  6.10b 1,3 / 0,9 / 1,65 / 1,65 ψ₀,i
 * Voetnoot a (vloeistofdrukken met een fysiek beperkte waarde) is hier niet
 * toegepast: de app kent geen vloeistofdruk als soort belasting.
 */
export const PARTIELE_FACTOREN: Record<Gevolgklasse, PartieleFactoren> = {
  CC1: { gGsup610a: 1.2, gGsup610b: 1.1, gGinf: 0.9, gQ: 1.35, bron: "NB tabel NB.5, CC1" },
  CC2: { gGsup610a: 1.35, gGsup610b: 1.2, gGinf: 0.9, gQ: 1.5, bron: "NB tabel NB.4, CC2" },
  CC3: { gGsup610a: 1.5, gGsup610b: 1.3, gGinf: 0.9, gQ: 1.65, bron: "NB tabel NB.5, CC3" },
};

// ── ψ-factoren ────────────────────────────────────────────────────────────

export interface PsiWaarden {
  psi0: number;
  psi1: number;
  psi2: number;
}

/**
 * NEN-EN 1990:2002/NB:2019 tabel NB.2–A1.1 "ψ-factoren voor gebouwen",
 * letterlijk overgenomen (pdftotext -raw van de NB):
 *   A woon- en verblijfsruimtes              0,4    0,5 0,3
 *   B kantoorruimtes                         0,5    0,5 0,3
 *   C bijeenkomstruimtes                     0,6/0,4 a 0,7 0,6
 *   D winkelruimtes                          0,4    0,7 0,6
 *   E opslagruimtes                          1,0    0,9 0,8
 *   F verkeersruimte, voertuiggewicht ≤ 25 kN 0,7   0,7 0,6
 *   G verkeersruimte, 25 kN < gewicht ≤ 160 kN 0,7  0,5 0,3
 *   H daken                                  0      0   0
 *   Industrieel, niet langdurig aanwezig     0,5    0,5 0,3
 *   Industrieel, langdurig aanwezig          1,0    0,9 0,8
 * Voetnoot a: 0,6 voor delen die bij een calamiteit zwaar door een
 * mensenmenigte kunnen worden belast (vluchtroutes, trappen), 0,4 overige.
 */
export const PSI_GEBRUIK: Record<GebruiksCategorie, PsiWaarden & { omschrijving: string }> = {
  A: { psi0: 0.4, psi1: 0.5, psi2: 0.3, omschrijving: "categorie A, woon- en verblijfsruimtes" },
  B: { psi0: 0.5, psi1: 0.5, psi2: 0.3, omschrijving: "categorie B, kantoorruimtes" },
  C: { psi0: 0.4, psi1: 0.7, psi2: 0.6, omschrijving: "categorie C, bijeenkomstruimtes (overige delen, voetnoot a: ψ₀ = 0,4)" },
  "C-menigte": { psi0: 0.6, psi1: 0.7, psi2: 0.6, omschrijving: "categorie C, delen die bij een calamiteit zwaar door een mensenmenigte belast kunnen worden (voetnoot a: ψ₀ = 0,6)" },
  D: { psi0: 0.4, psi1: 0.7, psi2: 0.6, omschrijving: "categorie D, winkelruimtes" },
  E: { psi0: 1.0, psi1: 0.9, psi2: 0.8, omschrijving: "categorie E, opslagruimtes" },
  F: { psi0: 0.7, psi1: 0.7, psi2: 0.6, omschrijving: "categorie F, verkeersruimte, voertuiggewicht ≤ 25 kN" },
  G: { psi0: 0.7, psi1: 0.5, psi2: 0.3, omschrijving: "categorie G, verkeersruimte, 25 kN < voertuiggewicht ≤ 160 kN" },
  H: { psi0: 0, psi1: 0, psi2: 0, omschrijving: "categorie H, daken" },
  "industrie-kort": { psi0: 0.5, psi1: 0.5, psi2: 0.3, omschrijving: "industrieel gebruik, belasting niet langdurig aanwezig" },
  "industrie-lang": { psi0: 1.0, psi1: 0.9, psi2: 0.8, omschrijving: "industrieel gebruik, belasting langdurig aanwezig" },
};

/** Tabel NB.2–A1.1, rij "Sneeuwbelasting": 0 / 0,2 / 0. */
export const PSI_SNEEUW: PsiWaarden = { psi0: 0, psi1: 0.2, psi2: 0 };

/** Tabel NB.2–A1.1, rij "Windbelasting": 0 / 0,2 / 0. */
export const PSI_WIND: PsiWaarden = { psi0: 0, psi1: 0.2, psi2: 0 };

/** De categorie die geldt als een veranderlijk geval er geen noemt. */
export const STANDAARD_CATEGORIE: GebruiksCategorie = "A";

export const PSI_BRON = "ψ uit NB tabel NB.2–A1.1";

// ── De set ────────────────────────────────────────────────────────────────

/** Welke norm-uitdrukking een combinatie is. */
export type CombinatieSoort = "6.10a" | "6.10b" | "6.14b" | "6.15b" | "6.16b";

/**
 * Het kenmerk van een combinatie die door deze generator is gemaakt. Een
 * combinatie MET dit kenmerk is een standaardcombinatie: de app houdt haar bij
 * wanneer gevallen of gevolgklasse veranderen. Past de gebruiker haar aan, dan
 * verdwijnt het kenmerk en is het zijn combinatie geworden.
 */
export interface StandaardHerkomst {
  /** Stabiele sleutel binnen de set, bijvoorbeeld "6.10b|W:4". */
  sleutel: string;
  soort: CombinatieSoort;
  gevolgklasse: Gevolgklasse;
}

export type StandaardCombinatie = Omit<LoadCombination, "id"> & {
  standaard: StandaardHerkomst;
};

/** Het deel van een belastinggeval dat de generator leest. */
export type GevalInvoer = Pick<LoadCase, "id" | "name" | "type" | "categorie" | "gegenereerd">;

/** De vier gevallen van een nieuw model; gelijk aan `DEFAULT_LOAD_CASES` in de store. */
export const STANDAARD_BELASTINGGEVALLEN: readonly GevalInvoer[] = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)", type: "live" },
  { id: 3, name: "Sneeuw (S)", type: "snow" },
  { id: 4, name: "Wind (W)", type: "wind" },
];

/** Eén veranderlijke belasting: de eenheid die als leidende last een beurt krijgt. */
interface Actie {
  sleutel: string;
  soort: "Q" | "S" | "W";
  ids: number[];
  psi: PsiWaarden;
  /** Voor in de naam van de combinatie. */
  label: string;
  /** Voor in de formule. */
  symbool: string;
}

/** Getal met decimale komma, zonder overbodige nullen. */
function nlGetal(x: number): string {
  return String(Number(x.toFixed(3))).replace(".", ",");
}

/**
 * Product van factoren, afgerond op 1e-9: 1,5 · 0,4 is in drijvende komma
 * 0,6000000000000001, en zo'n factor zou in het projectbestand, de
 * factortabel en de vergelijking met de standaard als "anders" gelden.
 */
function product(...f: number[]): number {
  return Math.round(f.reduce((a, b) => a * b, 1) * 1e9) / 1e9;
}

function verzamelActies(gevallen: readonly GevalInvoer[]): Actie[] {
  const acties: Actie[] = [];

  const live = gevallen.filter((c) => c.type === "live");
  const categorieen: GebruiksCategorie[] = [];
  for (const c of live) {
    const cat = c.categorie ?? STANDAARD_CATEGORIE;
    if (!categorieen.includes(cat)) categorieen.push(cat);
  }
  for (const cat of categorieen) {
    const leden = live.filter((c) => (c.categorie ?? STANDAARD_CATEGORIE) === cat);
    acties.push({
      sleutel: `Q:${cat}`,
      soort: "Q",
      ids: leden.map((c) => c.id),
      psi: PSI_GEBRUIK[cat],
      label: leden.length === 1 ? leden[0].name : `Q cat. ${cat}`,
      symbool: categorieen.length === 1 ? "Q" : `Q(${cat})`,
    });
  }

  for (const [soort, type, psi] of [
    ["S", "snow", PSI_SNEEUW],
    ["W", "wind", PSI_WIND],
  ] as const) {
    const leden = gevallen.filter((c) => c.type === type);
    for (const c of leden) {
      acties.push({
        sleutel: `${soort}:${c.id}`,
        soort,
        ids: [c.id],
        psi,
        label: c.name,
        symbool: leden.length === 1 ? soort : `${soort}[${c.name}]`,
      });
    }
  }
  return acties;
}

/** Een term van een combinatie: gevallen, factor, en de tekst in de formule. */
interface Term {
  ids: number[];
  factor: number;
  tekst: string;
}

function bouw(
  naam: string,
  type: "uls" | "sls",
  termen: Term[],
  bron: string,
  herkomst: StandaardHerkomst,
): StandaardCombinatie {
  const werkzaam = termen.filter((t) => t.factor !== 0 && t.ids.length > 0);
  const factors = new Map<number, number>();
  for (const t of werkzaam) for (const id of t.ids) factors.set(id, t.factor);
  const formule = werkzaam.map((t) => t.tekst).join(" + ") || "0";
  return {
    name: naam,
    type,
    formula: `${formule}   [${bron}]`,
    factors,
    standaard: herkomst,
  };
}

/**
 * De standaardcombinaties voor deze belastinggevallen in deze gevolgklasse,
 * in vaste volgorde: eerst de UGT (6.10a, 6.10b per leidende last, 6.10b met
 * gunstig werkende blijvende last), dan de BGT (6.14b, 6.15b per leidende
 * last, 6.16b). Zonder id's; die deelt de store uit.
 */
export function genereerStandaardCombinaties(
  loadCases: readonly GevalInvoer[],
  gevolgklasse: Gevolgklasse = STANDAARD_GEVOLGKLASSE,
): StandaardCombinatie[] {
  const f = PARTIELE_FACTOREN[gevolgklasse];
  const eigen = loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
  const G = eigen.filter((c) => c.type === "dead").map((c) => c.id);
  const acties = verzamelActies(eigen);
  if (G.length === 0 && acties.length === 0) return [];

  const ugtBron = `γ: NEN-EN 1990 ${f.bron}; ${PSI_BRON}`;
  const bgtBron = `NEN-EN 1990; ${PSI_BRON}`;
  const herkomst = (sleutel: string, soort: CombinatieSoort): StandaardHerkomst => ({
    sleutel, soort, gevolgklasse,
  });
  const g = (factor: number): Term => ({
    ids: G, factor, tekst: factor === 1 ? "G" : `${nlGetal(factor)}·G`,
  });
  /** Begeleidende lasten bij leidende last `leidend` (null = geen leidende). */
  const begeleidend = (
    leidend: Actie | null,
    ψ: (a: Actie) => number,
    γ: number,
  ): Term[] =>
    acties
      .filter((a) => a !== leidend)
      // Sneeuw- en windgevallen zijn alternatieven binnen hun soort: ze gaan
      // nooit samen met de leidende last van dezelfde soort.
      .filter((a) => !(leidend && a.soort === leidend.soort && a.soort !== "Q"))
      .map((a) => ({
        ids: a.ids,
        factor: product(γ, ψ(a)),
        tekst: γ === 1
          ? `${nlGetal(ψ(a))}·${a.symbool}`
          : `${nlGetal(γ)}·${nlGetal(ψ(a))}·${a.symbool}`,
      }));

  const ugt: StandaardCombinatie[] = [];
  const bgt: StandaardCombinatie[] = [];

  // UGT 6.10a — geen leidende last: alle veranderlijke lasten met ψ₀.
  ugt.push(bouw(
    "UGT 6.10a", "uls",
    [g(f.gGsup610a), ...begeleidend(null, (a) => a.psi.psi0, f.gQ)],
    ugtBron, herkomst("6.10a", "6.10a"),
  ));

  for (const a of acties) {
    ugt.push(bouw(
      `UGT 6.10b — ${a.label} leidend`, "uls",
      [
        g(f.gGsup610b),
        { ids: a.ids, factor: f.gQ, tekst: `${nlGetal(f.gQ)}·${a.symbool}` },
        ...begeleidend(a, (b) => b.psi.psi0, f.gQ),
      ],
      ugtBron, herkomst(`6.10b|${a.sleutel}`, "6.10b"),
    ));
  }
  // Blijvende last gunstig (γ_G,inf): maatgevend waar de veranderlijke last
  // de blijvende tegenwerkt — opwaartse wind, een omkerend moment. Zonder
  // blijvend geval valt deze combinatie samen met 6.10b en blijft ze weg.
  // De begeleidende veranderlijke lasten ontbreken hier bewust: werkt de
  // blijvende last gunstig, dan werken neerwaartse begeleidende lasten dat
  // doorgaans ook, en een gunstige veranderlijke last telt voor 0 mee.
  if (G.length > 0) {
    for (const a of acties) {
      ugt.push(bouw(
        `UGT 6.10b — ${a.label} leidend, blijvend gunstig`, "uls",
        [g(f.gGinf), { ids: a.ids, factor: f.gQ, tekst: `${nlGetal(f.gQ)}·${a.symbool}` }],
        ugtBron, herkomst(`6.10b-gunstig|${a.sleutel}`, "6.10b"),
      ));
    }
  }

  if (acties.length === 0) {
    // Alleen blijvende belasting: de drie BGT-uitdrukkingen vallen samen met
    // G, maar elke toets zoekt zijn eigen soort — dus alle drie aanwezig.
    bgt.push(bouw("BGT karakteristiek 6.14b — alleen blijvend", "sls", [g(1)], bgtBron,
      herkomst("6.14b|G", "6.14b")));
    bgt.push(bouw("BGT frequent 6.15b — alleen blijvend", "sls", [g(1)], bgtBron,
      herkomst("6.15b|G", "6.15b")));
  } else {
    for (const a of acties) {
      bgt.push(bouw(
        `BGT karakteristiek 6.14b — ${a.label} leidend`, "sls",
        [g(1), { ids: a.ids, factor: 1, tekst: a.symbool }, ...begeleidend(a, (b) => b.psi.psi0, 1)],
        bgtBron, herkomst(`6.14b|${a.sleutel}`, "6.14b"),
      ));
    }
    for (const a of acties) {
      bgt.push(bouw(
        `BGT frequent 6.15b — ${a.label} leidend`, "sls",
        [
          g(1),
          { ids: a.ids, factor: a.psi.psi1, tekst: `${nlGetal(a.psi.psi1)}·${a.symbool}` },
          ...begeleidend(a, (b) => b.psi.psi2, 1),
        ],
        bgtBron, herkomst(`6.15b|${a.sleutel}`, "6.15b"),
      ));
    }
  }
  bgt.push(bouw(
    "BGT quasi-blijvend 6.16b", "sls",
    [g(1), ...begeleidend(null, (b) => b.psi.psi2, 1)],
    bgtBron, herkomst("6.16b", "6.16b"),
  ));

  return [...ugt, ...bgt];
}
