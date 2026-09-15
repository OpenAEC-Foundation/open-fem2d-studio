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
 *   - UGT 6.10a        γ_G,sup·G + Σ γ_Q·ψ₀,i·Q_i               (geen leidende)
 *   - UGT 6.10b        γ_G,sup·G + γ_Q·Q_1 + Σ γ_Q·ψ₀,i·Q_i     (per leidende last)
 *   - UGT 6.10b gunst. γ_G,inf·G + γ_Q·Q_1 + Σ γ_Q·ψ₀,i·Q_i     (per leidende last)
 *   - BGT 6.14b        G + Q_1 + Σ ψ₀,i·Q_i                      (per leidende last)
 *   - BGT 6.15b        G + ψ₁,1·Q_1 + Σ ψ₂,i·Q_i                 (per leidende last)
 *   - BGT 6.16b        G + Σ ψ₂,i·Q_i                            (geen leidende)
 * De factoren γ komen uit NB tabel NB.4 (CC2) en NB.5 (CC1, CC3); de kolom
 * "Gunstig 0,9 G_k,j,inf" staat in beide tabellen voor 6.10a én 6.10b. In
 * 6.10a krijgt ook de belangrijkste veranderlijke belasting ψ₀ (NB.4:
 * "1,5 ψ₀,1 Q_k,1"), dus daar is geen leidende last.
 * Elk van die uitdrukkingen komt in ELKE OPSTELLING van de veranderlijke
 * gevallen: ieder veranderlijk geval is aanwezig of afwezig (zie hieronder).
 *
 * WAAROM ELK VERANDERLIJK GEVAL OOK AFWEZIG MAG ZIJN
 * Een veranderlijke belasting telt alleen waar ze ongunstig werkt:
 *  - EN 1991-1-1 6.2.1(1)P: de gebruiksbelasting moet in rekening zijn
 *    gebracht "als een vrije belasting ter plaatse van het meest ongunstige
 *    deel van de invloedsoppervlakte"; 6.2.2(1): bij kolommen en wanden "op
 *    alle ongunstige plaatsen". Een vrije belasting is volgens EN 1990
 *    1.5.3.9 een "belasting die verscheidene ruimtelijke verdelingen over de
 *    constructie kan hebben".
 *  - EN 1990 tabel A1.2(B), opmerking 2: γ_Q "daar waar ongunstig (0 daar
 *    waar gunstig)". NB.4/NB.5 vervangen de getallen, en geven voor
 *    veranderlijke belastingen ook alleen de ongunstige waarde.
 * Wie een vloerlast per veld in een eigen geval zet, beschrijft zo'n
 * verdeling. Krijgen die gevallen altijd samen dezelfde factor, dan bestaat de
 * maatgevende verdeling nooit: een doorgaande ligger 2 × 6 m met q per veld gaf
 * 37,80 kNm veldmoment waar de belasting op één veld 1,5·49/512·q·L² =
 * 51,68 kNm geeft (gemeten in september 2026). De omhullende over
 * alle opstellingen is per snede precies de som van de ongunstige bijdragen.
 * Daarom maakt deze module per uitdrukking elke combinatie van aan- en
 * afwezige veranderlijke gevallen: de leidende last met minstens één aanwezig
 * geval, de begeleidende in elke deelverzameling, ook de lege. Opstellingen die
 * op dezelfde factoren uitkomen (een geval met ψ = 0 aan of uit) staan er één
 * keer in.
 * Grens: boven MAX_VRIJE_GEVALLEN veranderlijke gebruiksbelastinggevallen
 * groeit het aantal als 2ⁿ. Dan gaan de gevallen van één categorie weer samen
 * aan of uit, en `lib/combinatieBeheer.ts` meldt dat de patroonbelasting dan
 * niet volledig is beschouwd.
 *
 * WAT EEN "VERANDERLIJKE BELASTING" HIER IS — een expliciete keuze
 *  - Veranderlijke gevallen (type "live") met dezelfde gebruikscategorie
 *    vormen samen één belasting: als LEIDENDE last krijgen ze dezelfde γ_Q, als
 *    begeleidende dezelfde ψ. Hun gevallen zijn de delen van die vrije
 *    belasting, die elk aan- of afwezig zijn (zie hierboven). Gevallen met een
 *    ANDERE categorie zijn onafhankelijke belastingen (een dak, cat. H, naast
 *    een vloer, cat. A), elk met een eigen beurt als leidende last.
 *  - Sneeuwgevallen en windgevallen zijn elk een ALTERNATIEF binnen hun soort
 *    (wind van links óf van rechts; volle óf asymmetrische sneeuw): ze leiden
 *    elk apart en worden nooit bij elkaar opgeteld. Met de NB-waarden
 *    ψ₀ = ψ₂ = 0 voor sneeuw en wind zou optellen als begeleidende last toch
 *    al nul geven; de uitsluiting maakt het ook zonder dat toeval waar.
 *    `lib/combinatieBeheer.ts` meldt deze aanname zodra er twee of meer
 *    windgevallen (of sneeuwgevallen) zijn: wie één windrichting over twee
 *    gevallen verdeelt, krijgt ze anders nooit samen.
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

/**
 * De sleutel van de VOLLEDIGE opstelling waar deze sleutel bij hoort: zonder
 * het deel "|zonder:<ids>". "6.10b|Q:A|zonder:2+5" → "6.10b|Q:A", "6.10a" →
 * "6.10a". Een opstelling met afwezige gevallen is alleen zinvol naast de
 * volledige opstelling van dezelfde uitdrukking en leidende last; zie
 * `synchroniseerStandaard` in lib/combinatieBeheer.ts.
 */
export function basisSleutel(sleutel: string): string {
  const i = sleutel.indexOf("|zonder:");
  return i < 0 ? sleutel : sleutel.slice(0, i);
}

/** Het deel van een belastinggeval dat de generator leest. */
export type GevalInvoer = Pick<LoadCase, "id" | "name" | "type" | "categorie" | "gegenereerd">;

/** De vier gevallen van een nieuw model; gelijk aan `DEFAULT_LOAD_CASES` in de store. */
export const STANDAARD_BELASTINGGEVALLEN: readonly GevalInvoer[] = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)", type: "live" },
  { id: 3, name: "Sneeuw (S)", type: "snow" },
  { id: 4, name: "Wind (W)", type: "wind" },
];

/**
 * Tot en met dit aantal veranderlijke gebruiksbelastinggevallen (type "live")
 * zet de standaardset elk geval afzonderlijk aan en uit. Bij n gevallen zijn
 * dat tot 2ⁿ opstellingen per uitdrukking. Met vier gevallen is een doorgaande
 * ligger over vier velden nog volledig beschouwd en blijft de lijst te
 * overzien. Daarboven gaan de gevallen van één categorie samen aan of uit, en
 * `lib/combinatieBeheer.ts` meldt dat.
 */
export const MAX_VRIJE_GEVALLEN = 4;

/** Het aantal veranderlijke gebruiksbelastinggevallen dat de set aan- en uitzet. */
export function aantalGebruiksgevallen(gevallen: readonly GevalInvoer[]): number {
  return gevallen.filter((c) => c.type === "live" && c.gegenereerd?.bron !== "wind").length;
}

/** Eén belastinggeval als deel van een veranderlijke belasting. */
export interface Deel {
  id: number;
  naam: string;
}

/** Eén veranderlijke belasting: de eenheid die als leidende last een beurt krijgt. */
interface Actie {
  sleutel: string;
  soort: "Q" | "S" | "W";
  /** De belastinggevallen van deze belasting; elk is aan- of afwezig. */
  delen: Deel[];
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
      delen: leden.map((c) => ({ id: c.id, naam: c.name })),
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
        delen: [{ id: c.id, naam: c.name }],
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

// ── Opstellingen ──────────────────────────────────────────────────────────

/** Een veranderlijke belasting in een uitdrukking, met haar factor en haar rol. */
interface Bijdrage {
  actie: Actie;
  factor: number;
  leidend: boolean;
  /** De tekst in de formule, gegeven het symbool van de aanwezige gevallen. */
  tekst: (symbool: string) => string;
}

/** Eén opstelling: per bijdrage de aanwezige gevallen, en alle afwezige. */
interface Opstelling {
  aanwezig: Deel[][];
  zonder: Deel[];
}

function aantalBits(m: number): number {
  let n = 0;
  for (let x = m; x > 0; x >>= 1) n += x & 1;
  return n;
}

/**
 * Alle opstellingen van de bijdragen. Wat samen aan- of uitgaat heet hier een
 * eenheid: één belastinggeval (`perGeval`), of — boven MAX_VRIJE_GEVALLEN —
 * een hele begeleidende belasting, terwijl de leidende dan volledig aanwezig
 * blijft. De leidende last houdt altijd minstens één aanwezig geval: zonder
 * leidende last is het een andere uitdrukking (6.10a of 6.16b). Een bijdrage
 * met factor 0 telt niet mee en wordt dus ook niet gevarieerd.
 * Volgorde: eerst alles aanwezig, dan steeds meer afwezig.
 */
function opstellingen(bijdragen: readonly Bijdrage[], perGeval: boolean): Opstelling[] {
  const eenheden: Deel[][] = [];
  for (const b of bijdragen) {
    if (b.factor === 0) continue;
    if (perGeval) for (const d of b.actie.delen) eenheden.push([d]);
    else if (!b.leidend) eenheden.push(b.actie.delen);
  }
  const maskers = Array.from({ length: 2 ** eenheden.length }, (_, m) => m)
    .sort((a, b) => aantalBits(a) - aantalBits(b) || a - b);
  const uit: Opstelling[] = [];
  for (const masker of maskers) {
    const zonder = eenheden.filter((_, j) => (masker & (1 << j)) !== 0).flat();
    const afwezig = new Set(zonder.map((d) => d.id));
    const aanwezig = bijdragen.map((b) =>
      b.factor === 0 ? [] : b.actie.delen.filter((d) => !afwezig.has(d.id)));
    if (bijdragen.some((b, i) => b.leidend && b.factor !== 0 && aanwezig[i].length === 0)) continue;
    uit.push({ aanwezig, zonder });
  }
  return uit;
}

/** Het symbool van een belasting waarvan alleen deze gevallen aanwezig zijn. */
function symboolVan(actie: Actie, aanwezig: readonly Deel[]): string {
  return aanwezig.length === actie.delen.length
    ? actie.symbool
    : `${actie.symbool}[${aanwezig.map((d) => d.naam).join(" + ")}]`;
}

/**
 * Eén uitdrukking in al haar opstellingen. `naam` en `sleutel` horen bij de
 * volledige opstelling; een opstelling met afwezige gevallen krijgt
 * "zonder …" in de naam en "|zonder:<ids>" in de sleutel. Zo houdt een
 * bestaande combinatie haar sleutel — en in de store haar id — als er een
 * belastinggeval bijkomt.
 */
function uitdrukking(
  naam: string,
  type: "uls" | "sls",
  soort: CombinatieSoort,
  sleutel: string,
  g: Term,
  bijdragen: Bijdrage[],
  bron: string,
  gevolgklasse: Gevolgklasse,
  perGeval: boolean,
): StandaardCombinatie[] {
  return opstellingen(bijdragen, perGeval).map((o) => {
    const termen: Term[] = [
      g,
      ...bijdragen.map((b, i) => ({
        ids: o.aanwezig[i].map((d) => d.id),
        factor: b.factor,
        tekst: b.tekst(symboolVan(b.actie, o.aanwezig[i])),
      })),
    ];
    const zonderNaam = o.zonder.length === 0
      ? ""
      : `${naam.includes(" — ") ? "," : " —"} zonder ${o.zonder.map((d) => d.naam).join(", ")}`;
    const zonderSleutel = o.zonder.length === 0
      ? ""
      : `|zonder:${o.zonder.map((d) => d.id).sort((a, b) => a - b).join("+")}`;
    return bouw(naam + zonderNaam, type, termen, bron, {
      sleutel: sleutel + zonderSleutel, soort, gevolgklasse,
    });
  });
}

/**
 * Opstellingen die op precies dezelfde factoren uitkomen staan er één keer in:
 * een geval met factor 0 aan of uit maakt geen andere combinatie. Een
 * combinatie zonder enige factor vervalt (6.10a zonder blijvend geval en
 * zonder aanwezige veranderlijke gevallen). Vergeleken binnen één soort:
 * 6.14b en 6.16b met gelijke factoren blijven allebei, want elke toets zoekt
 * zijn eigen soort.
 */
function ontdubbel(set: readonly StandaardCombinatie[]): StandaardCombinatie[] {
  const gezien = new Set<string>();
  return set.filter((c) => {
    if (c.factors.size === 0) return false;
    const inhoud = [...c.factors].sort((a, b) => a[0] - b[0]).map(([id, x]) => `${id}:${x}`).join(",");
    const k = `${c.type}|${c.standaard.soort}|${inhoud}`;
    if (gezien.has(k)) return false;
    gezien.add(k);
    return true;
  });
}

/**
 * De standaardcombinaties voor deze belastinggevallen in deze gevolgklasse,
 * in vaste volgorde: eerst de UGT (6.10a, 6.10b per leidende last, 6.10b met
 * gunstig werkende blijvende last), dan de BGT (6.14b, 6.15b per leidende
 * last, 6.16b); binnen elke uitdrukking de opstellingen, de volledige eerst.
 * Zonder id's; die deelt de store uit.
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
  const perGeval = aantalGebruiksgevallen(eigen) <= MAX_VRIJE_GEVALLEN;

  const ugtBron = `γ: NEN-EN 1990 ${f.bron}; ${PSI_BRON}`;
  const bgtBron = `NEN-EN 1990; ${PSI_BRON}`;
  const herkomst = (sleutel: string, soort: CombinatieSoort): StandaardHerkomst => ({
    sleutel, soort, gevolgklasse,
  });
  const g = (factor: number): Term => ({
    ids: G, factor, tekst: factor === 1 ? "G" : `${nlGetal(factor)}·G`,
  });
  const leidend = (a: Actie, factor: number): Bijdrage => ({
    actie: a, factor, leidend: true,
    tekst: (s) => (factor === 1 ? s : `${nlGetal(factor)}·${s}`),
  });
  /** Begeleidende lasten bij leidende last `hoofd` (null = geen leidende). */
  const begeleidend = (
    hoofd: Actie | null,
    ψ: (a: Actie) => number,
    γ: number,
  ): Bijdrage[] =>
    acties
      .filter((a) => a !== hoofd)
      // Sneeuw- en windgevallen zijn alternatieven binnen hun soort: ze gaan
      // nooit samen met de leidende last van dezelfde soort.
      .filter((a) => !(hoofd && a.soort === hoofd.soort && a.soort !== "Q"))
      .map((a) => ({
        actie: a,
        factor: product(γ, ψ(a)),
        leidend: false,
        tekst: (s: string) => (γ === 1
          ? `${nlGetal(ψ(a))}·${s}`
          : `${nlGetal(γ)}·${nlGetal(ψ(a))}·${s}`),
      }));
  const ψ0 = (a: Actie) => a.psi.psi0;
  const ψ2 = (a: Actie) => a.psi.psi2;

  const ugt: StandaardCombinatie[] = [];
  const bgt: StandaardCombinatie[] = [];

  // UGT 6.10a — geen leidende last: alle veranderlijke lasten met ψ₀.
  ugt.push(...uitdrukking(
    "UGT 6.10a", "uls", "6.10a", "6.10a",
    g(f.gGsup610a), begeleidend(null, ψ0, f.gQ), ugtBron, gevolgklasse, perGeval,
  ));

  for (const a of acties) {
    ugt.push(...uitdrukking(
      `UGT 6.10b — ${a.label} leidend`, "uls", "6.10b", `6.10b|${a.sleutel}`,
      g(f.gGsup610b), [leidend(a, f.gQ), ...begeleidend(a, ψ0, f.gQ)],
      ugtBron, gevolgklasse, perGeval,
    ));
  }
  // Blijvende last gunstig (γ_G,inf): maatgevend waar de veranderlijke last
  // de blijvende tegenwerkt — opwaartse wind, een omkerend moment. Zonder
  // blijvend geval valt deze combinatie samen met 6.10b en blijft ze weg.
  // De begeleidende veranderlijke lasten staan erin zoals in 6.10b, in al hun
  // opstellingen: de opstelling zonder begeleidende lasten dekt de gewone
  // opwaartse wind, die met een ongunstig werkende begeleidende last het
  // geval waarin blijvende en begeleidende last elkaar tegenwerken.
  if (G.length > 0) {
    for (const a of acties) {
      ugt.push(...uitdrukking(
        `UGT 6.10b — ${a.label} leidend, blijvend gunstig`, "uls", "6.10b",
        `6.10b-gunstig|${a.sleutel}`,
        g(f.gGinf), [leidend(a, f.gQ), ...begeleidend(a, ψ0, f.gQ)],
        ugtBron, gevolgklasse, perGeval,
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
      bgt.push(...uitdrukking(
        `BGT karakteristiek 6.14b — ${a.label} leidend`, "sls", "6.14b", `6.14b|${a.sleutel}`,
        g(1), [leidend(a, 1), ...begeleidend(a, ψ0, 1)], bgtBron, gevolgklasse, perGeval,
      ));
    }
    for (const a of acties) {
      bgt.push(...uitdrukking(
        `BGT frequent 6.15b — ${a.label} leidend`, "sls", "6.15b", `6.15b|${a.sleutel}`,
        g(1), [leidend(a, a.psi.psi1), ...begeleidend(a, ψ2, 1)], bgtBron, gevolgklasse, perGeval,
      ));
    }
  }
  bgt.push(...uitdrukking(
    "BGT quasi-blijvend 6.16b", "sls", "6.16b", "6.16b",
    g(1), begeleidend(null, ψ2, 1), bgtBron, gevolgklasse, perGeval,
  ));

  return ontdubbel([...ugt, ...bgt]);
}

// ── Voor de windgenerator ─────────────────────────────────────────────────

/** Eén opstelling van de begeleidende veranderlijke belastingen. */
export interface BegeleidendeOpstelling {
  /** [caseId, factor] van elk aanwezig begeleidend geval (factor ≠ 0). */
  factoren: [number, number][];
  /** De begeleidende gevallen die in deze opstelling afwezig zijn. */
  zonder: Deel[];
}

/**
 * De opstellingen van de begeleidende veranderlijke belastingen bij een
 * leidende last van soort `leidendeSoort` die zelf niet in `gevallen` staat:
 * de windgenerator laat zijn eigen windgevallen leiden. Dezelfde regels als de
 * standaardset — ψ per soort en gebruikscategorie, sneeuw en wind als
 * alternatieven binnen hun soort, elk veranderlijk geval aan- of afwezig
 * (EN 1991-1-1 6.2.1(1)P) — zodat een gegenereerde windcombinatie geen
 * opstelling mist die de standaardset wel heeft.
 * `factor` krijgt de ψ-waarden van een belasting en geeft haar factor
 * (γ_Q·ψ₀, ψ₀ of ψ₂).
 */
export function begeleidendeOpstellingen(
  gevallen: readonly GevalInvoer[],
  leidendeSoort: "Q" | "S" | "W",
  factor: (psi: PsiWaarden) => number,
): BegeleidendeOpstelling[] {
  const eigen = gevallen.filter((c) => c.gegenereerd?.bron !== "wind");
  const bijdragen: Bijdrage[] = verzamelActies(eigen)
    .filter((a) => !(a.soort === leidendeSoort && a.soort !== "Q"))
    .map((a) => ({ actie: a, factor: product(factor(a.psi)), leidend: false, tekst: (s: string) => s }));
  const perGeval = aantalGebruiksgevallen(eigen) <= MAX_VRIJE_GEVALLEN;
  return opstellingen(bijdragen, perGeval).map((o) => ({
    factoren: bijdragen.flatMap((b, i) =>
      b.factor === 0 ? [] : o.aanwezig[i].map((d) => [d.id, b.factor] as [number, number])),
    zonder: o.zonder,
  }));
}
