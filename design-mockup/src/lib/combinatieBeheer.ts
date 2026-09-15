/**
 * combinatieBeheer.ts — belastinggevallen en belastingcombinaties in de pas
 * houden, en luid melden waar dat niet lukt.
 *
 * HET PROBLEEM DAT HIER OPGELOST WORDT
 * Combinaties waren een losse tabel naast de belastinggevallen. Gemeten in de
 * basisaudit van september 2026:
 *  - een nieuw geval kreeg in geen enkele combinatie een factor en telde in
 *    alle toetsen als nul, zonder melding (nr 1);
 *  - een verwijderd geval liet zijn factoren achter, en het volgende nieuwe
 *    geval kreeg hetzelfde id en ERFDE die factoren — een blijvende last met
 *    de factoren van wind (nr 14);
 *  - eigen gewicht zonder blijvend geval kwam stil in het eerste geval terecht,
 *    met de factoren van dát type (ruw 7).
 *
 * WAT HIER GEBEURT
 *  - Elke wijziging aan de gevallen of aan de gevolgklasse houdt de
 *    STANDAARDcombinaties bij (`synchroniseerStandaard`): een nieuw blijvend
 *    geval krijgt γ_G, een nieuw veranderlijk geval krijgt zijn beurt als
 *    leidende last en zijn ψ als begeleidende. Zie `normcombinaties.ts`.
 *  - EIGEN combinaties (zonder kenmerk `standaard`) blijven van de gebruiker:
 *    de app past ze niet aan, behalve dat de factor van een verwijderd geval
 *    eruit verdwijnt — uit ALLE combinaties, standaard of eigen.
 *  - Id's lopen via tellers die nooit teruglopen en in het projectbestand
 *    meereizen. Een verwijderd id komt nooit terug.
 *  - Een projectbestand van vóór september 2026 draagt geen tellers, en kan
 *    factoren dragen voor een geval dat toen al verwijderd was. Bij het openen
 *    (`openCombinatieStaat`) gaan die wees-factoren eruit — ze vermenigvuldigden
 *    geen last, dus geen uitkomst verandert — en komt de teller boven elk id
 *    dat in een factortabel stond. Dat wordt gemeld.
 *  - Wat dan nog niet meetelt, wordt gemeld (`meldingenBelastinggevallen`):
 *    een geval met last maar zonder UGT-factor is een FOUT, geen voetnoot.
 *
 * EEN COMBINATIESET IS NOOIT STIL EEN DEELVERZAMELING VAN DE JUISTE SET
 * Gemeten in september 2026 (na de eerste correctie): een oud projectbestand
 * met de acht combinaties van vóór september 2026, plus een nieuw veranderlijk
 * geval "Q vloer 2" in dezelfde categorie. De synchronisatie voegde alleen de
 * nieuwe opstellingen "… zonder Variabel (Q)" toe — de volledige 6.10b met
 * beide gevallen op γ_Q ontstond nooit. IPE-ligger 6 m, G = 4, Q = 5 en
 * Q vloer 2 = 10 kN/m: UGT 89,10 kNm waar (1,2·4 + 1,5·15)·36/8 = 122,85
 * hoort, BGT 63,0 waar 85,5 hoort, en geen melding. Hetzelfde na het hernoemen
 * van "UGT 6.10b — Variabel (Q) leidend": 117,45 waar 122,85 hoort. Daarom:
 *  - `synchroniseerStandaard` voegt nooit een opstelling met afwezige gevallen
 *    toe van een uitdrukking waarvan de VOLLEDIGE opstelling ontbreekt;
 *  - `ontbrekendeStandaardcombinaties` zoekt elke standaardcombinatie die in
 *    een project met standaardcombinaties ontbreekt en door geen andere
 *    combinatie met dezelfde factoren wordt vervangen; dat is een FOUT die naar
 *    "Vervang door standaardcombinaties" wijst — in de app, het rapport en de
 *    MCP-waarschuwingen, want alle drie lezen `meldingenBelastinggevallen`;
 *  - `blijvendeFactorAfwijkingen` zoekt een blijvend geval met factoren die bij
 *    geen blijvende belasting passen: het spoor van nr 14 in een oud bestand
 *    (UGT 47,25 en BGT 30,60 kNm waar 48,60 en 36,00 horen).
 *
 * PUUR
 * Geen React: de store roept deze functies aan, en de tests roepen precies
 * dezelfde functies aan. Zo bewijst een test het gedrag van de app en niet dat
 * van een nagebouwde kopie.
 */
import type { Load, LoadCase } from "../components/fem/femTypes";
import {
  defaultCombinations,
  soortVanCombinatie,
  type LoadCombination,
} from "../components/fem/solver/combinations";
import {
  aantalGebruiksgevallen,
  basisSleutel,
  genereerStandaardCombinaties,
  GEVOLGKLASSEN,
  MAX_VRIJE_GEVALLEN,
  PARTIELE_FACTOREN,
  type GevalInvoer,
  type Gevolgklasse,
  type StandaardCombinatie,
} from "../components/fem/solver/normcombinaties";
import { WIND_COMBI_PREFIX } from "./wind/windGenerator";

// ── Staat ─────────────────────────────────────────────────────────────────

/** Alles wat samen moet veranderen: gevallen, combinaties, klasse, tellers. */
export interface CombinatieStaat {
  loadCases: LoadCase[];
  combinations: LoadCombination[];
  gevolgklasse: Gevolgklasse;
  /** Eerstvolgend id voor een belastinggeval; loopt nooit terug. */
  volgendGevalId: number;
  /** Eerstvolgend id voor een combinatie; loopt nooit terug. */
  volgendCombinatieId: number;
}

/**
 * Het eerstvolgende id: nooit lager dan de teller, en nooit gelijk aan een id
 * dat er nog staat. Het tweede vangt een projectbestand zonder tellers op
 * (ouder dan september 2026) en een generator die zelf id's uitdeelde.
 */
export function volgendVrijId(bestaande: readonly { id: number }[], teller: number): number {
  const hoogste = bestaande.reduce((m, x) => Math.max(m, x.id), 0);
  return Math.max(teller, hoogste + 1);
}

/** Is dit een combinatie van de windbelastinggenerator? */
export function isWindgeneratorCombinatie(c: Pick<LoadCombination, "name">): boolean {
  return c.name.startsWith(WIND_COMBI_PREFIX);
}

// ── Vergelijken ───────────────────────────────────────────────────────────

function gelijkeFactoren(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, f] of a) if (b.get(id) !== f) return false;
  return true;
}

/**
 * Zelfde REKENINHOUD: naam, type, formule en factoren. Het id en het kenmerk
 * tellen niet — een BGT-combinatie heeft onder CC1 en CC3 dezelfde factoren,
 * en is dan voor de gebruiker niet "anders".
 */
export function gelijkeInhoud(
  a: Omit<LoadCombination, "id">,
  b: Omit<LoadCombination, "id">,
): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.formula === b.formula &&
    gelijkeFactoren(a.factors, b.factors)
  );
}

/** Zelfde inhoud én zelfde kenmerk. Het id telt niet. */
export function gelijkeCombinatie(
  a: Omit<LoadCombination, "id">,
  b: Omit<LoadCombination, "id">,
): boolean {
  return (
    gelijkeInhoud(a, b) &&
    a.standaard?.sleutel === b.standaard?.sleutel &&
    a.standaard?.soort === b.standaard?.soort &&
    a.standaard?.gevolgklasse === b.standaard?.gevolgklasse
  );
}

function gelijkeLijst(a: readonly LoadCombination[], b: readonly LoadCombination[]): boolean {
  return a.length === b.length && a.every((c, i) => c.id === b[i].id && gelijkeCombinatie(c, b[i]));
}

/** De combinatie zonder factoren voor gevallen die niet (meer) bestaan. */
function zonderOnbekendeGevallen(c: LoadCombination, ids: ReadonlySet<number>): LoadCombination {
  if ([...c.factors.keys()].every((id) => ids.has(id))) return c;
  return { ...c, factors: new Map([...c.factors].filter(([id]) => ids.has(id))) };
}

function perSleutel(set: readonly StandaardCombinatie[]): Map<string, StandaardCombinatie> {
  return new Map(set.map((c) => [c.standaard.sleutel, c]));
}

/** Een combinatie met factoren voor belastinggevallen die er niet (meer) zijn. */
export interface WeesFactor {
  combinatieId: number;
  naam: string;
  caseIds: number[];
}

/**
 * Haal de factoren weg van gevallen die niet in `loadCases` staan, en zeg
 * welke dat waren. Zo'n factor vermenigvuldigt geen enkele last, dus het
 * weghalen verandert geen uitkomst. Blijft hij staan, dan erft het volgende
 * geval met dat id hem: een blijvende last met de factoren van wind
 * (basisaudit nr 14). Een projectbestand van vóór september 2026 kan zulke
 * factoren dragen, want daar liet het verwijderen van een geval ze staan.
 */
export function verwijderWeesFactoren(
  combinations: readonly LoadCombination[],
  loadCases: readonly Pick<LoadCase, "id">[],
): { combinaties: LoadCombination[]; wees: WeesFactor[] } {
  const ids = new Set(loadCases.map((c) => c.id));
  const wees: WeesFactor[] = [];
  const combinaties = combinations.map((c) => {
    const onbekend = [...c.factors.keys()].filter((id) => !ids.has(id)).sort((a, b) => a - b);
    if (onbekend.length === 0) return c;
    wees.push({ combinatieId: c.id, naam: c.name, caseIds: onbekend });
    return zonderOnbekendeGevallen(c, ids);
  });
  return { combinaties, wees };
}

/**
 * Een project openen: gevallen, combinaties, klasse en tellers in één keer, en
 * de melding over wat er afwijkt. De store (`loadProjectState`) roept precies
 * deze functie aan, zodat een test het gedrag van de app bewijst.
 *
 *  - Zonder combinaties in het bestand (v1, of Nieuw): de standaardset van
 *    zijn gevallen.
 *  - Met combinaties: die rekenen, ook als ze van de standaard afwijken —
 *    gemeld, niet overschreven. Alleen factoren voor gevallen die niet bestaan
 *    gaan eruit (zie `verwijderWeesFactoren`); ook dat staat in de melding.
 *  - De geval-teller komt boven het hoogste id van de gevallen, boven de teller
 *    uit het bestand, én boven elk id dat in een factortabel van het bestand
 *    stond. Het laatste is de tweede grendel tegen nr 14: een bestand zonder
 *    tellers waarin het hoogste geval al verwijderd was, gaf anders dat id
 *    opnieuw uit (gemeten: HEA200, "Permanent afbouw" kreeg id 4 en erfde de
 *    windfactoren — UGT 47,25 en BGT 30,60 kNm waar 48,60 en 36,00 horen).
 */
export function openCombinatieStaat(p: {
  loadCases: LoadCase[];
  combinations?: LoadCombination[];
  gevolgklasse: Gevolgklasse;
  idTellers?: { belastinggeval?: number; combinatie?: number };
}): { staat: CombinatieStaat; afwijking: CombinatieAfwijking | null } {
  const gevalTeller = volgendVrijId(p.loadCases, p.idTellers?.belastinggeval ?? 1);
  if (!p.combinations) {
    const combinations = defaultCombinations(p.loadCases, p.gevolgklasse);
    return {
      staat: {
        loadCases: p.loadCases,
        combinations,
        gevolgklasse: p.gevolgklasse,
        volgendGevalId: gevalTeller,
        volgendCombinatieId: volgendVrijId(combinations, p.idTellers?.combinatie ?? 1),
      },
      afwijking: null,
    };
  }
  const { combinaties, wees } = verwijderWeesFactoren(p.combinations, p.loadCases);
  const hoogsteFactorSleutel = p.combinations
    .flatMap((c) => [...c.factors.keys()])
    .filter((id) => Number.isFinite(id))
    .reduce((m, id) => Math.max(m, id), 0);
  return {
    staat: {
      loadCases: p.loadCases,
      combinations: combinaties,
      gevolgklasse: p.gevolgklasse,
      volgendGevalId: Math.max(gevalTeller, hoogsteFactorSleutel + 1),
      volgendCombinatieId: volgendVrijId(combinaties, p.idTellers?.combinatie ?? 1),
    },
    afwijking: beoordeelCombinatiesBijOpenen({
      combinations: combinaties,
      loadCases: p.loadCases,
      gevolgklasse: p.gevolgklasse,
      eigenCombinatiesBewust: p.idTellers !== undefined,
      weesFactoren: wees,
    }),
  };
}

// ── Bijhouden ─────────────────────────────────────────────────────────────

/**
 * Breng de standaardcombinaties in lijn met `staat.loadCases` en
 * `staat.gevolgklasse`, gegeven hoe gevallen en klasse `vorig` waren.
 *
 * Regels:
 *  - Een standaardcombinatie waarvan de sleutel nog geldt, krijgt de nieuwe
 *    naam, formule en factoren en HOUDT haar id (resultaten, selectie en de
 *    rapportverwijzing blijven kloppen).
 *  - Een standaardcombinatie waarvan de sleutel niet meer geldt (de leidende
 *    last is verwijderd of van type veranderd), verdwijnt.
 *  - Een sleutel die nieuw is — hij bestond onder `vorig` niet — wordt
 *    toegevoegd met een nieuw id. Een sleutel die onder `vorig` WEL bestond
 *    maar niet in de lijst staat, heeft de gebruiker zelf weggehaald of tot een
 *    eigen combinatie gemaakt, of de lijst komt uit een ouder projectbestand;
 *    die komt niet ongevraagd terug.
 *  - NOOIT EEN DEEL ZONDER HET GEHEEL: een nieuwe opstelling met afwezige
 *    gevallen ("…|zonder:…") komt er alleen bij als de volledige opstelling van
 *    dezelfde uitdrukking en leidende last in de lijst staat of nu zelf wordt
 *    toegevoegd. Anders zou een oud bestand (acht eigen combinaties) na een
 *    nieuw veranderlijk geval alleen "… zonder Variabel (Q)"-combinaties
 *    krijgen: het nieuwe geval telt dan wél ergens mee, de FOUT dat het nergens
 *    meetelt verdwijnt, en de combinatie met beide gevallen op γ_Q ontbreekt
 *    stil (gemeten 89,10 kNm waar 122,85 hoort). Wat er dan ontbreekt, meldt
 *    `meldingenBelastinggevallen` als FOUT.
 *  - Eigen combinaties blijven staan; alleen factoren van verdwenen gevallen
 *    gaan eruit.
 * Volgorde: de standaardset in haar vaste volgorde, daarna de eigen
 * combinaties in hun oorspronkelijke volgorde. Verandert er niets, dan komt
 * dezelfde array terug (geen nieuwe identiteit, dus geen herberekening).
 */
export function synchroniseerStandaard(
  staat: CombinatieStaat,
  vorig: { loadCases: readonly LoadCase[]; gevolgklasse: Gevolgklasse },
): CombinatieStaat {
  const vorigeSleutels = perSleutel(genereerStandaardCombinaties(vorig.loadCases, vorig.gevolgklasse));
  const nieuweSet = genereerStandaardCombinaties(staat.loadCases, staat.gevolgklasse);
  const nieuwPerSleutel = perSleutel(nieuweSet);
  const geldigeIds = new Set(staat.loadCases.map((c) => c.id));
  let volgendId = volgendVrijId(staat.combinations, staat.volgendCombinatieId);

  const aanwezig = new Map<string, LoadCombination>();
  const eigen: LoadCombination[] = [];
  for (const c of staat.combinations) {
    if (c.standaard) {
      const n = nieuwPerSleutel.get(c.standaard.sleutel);
      if (!n || aanwezig.has(c.standaard.sleutel)) continue;
      const bijgewerkt: LoadCombination = { ...n, id: c.id };
      aanwezig.set(c.standaard.sleutel, gelijkeCombinatie(c, bijgewerkt) ? c : bijgewerkt);
    } else {
      eigen.push(zonderOnbekendeGevallen(c, geldigeIds));
    }
  }

  // De volledige opstellingen (sleutel zonder "|zonder:") in de nieuwe set, en
  // welke daarvan na deze stap in de lijst staan: al aanwezig, of nieuw en dus
  // hieronder toegevoegd.
  const volledigInSet = new Set<string>();
  const volledigInLijst = new Set<string>();
  for (const n of nieuweSet) {
    const s = n.standaard.sleutel;
    if (basisSleutel(s) !== s) continue;
    volledigInSet.add(s);
    if (aanwezig.has(s) || !vorigeSleutels.has(s)) volledigInLijst.add(s);
  }

  const standaard: LoadCombination[] = [];
  for (const n of nieuweSet) {
    const s = n.standaard.sleutel;
    const bestaand = aanwezig.get(s);
    if (bestaand) {
      standaard.push(bestaand);
      continue;
    }
    if (vorigeSleutels.has(s)) continue; // weggehaald, eigen gemaakt of uit een ouder bestand
    const basis = basisSleutel(s);
    // Nooit een deel zonder het geheel. Staat de volledige opstelling niet in
    // de set (samengevallen met een andere combinatie, zie `ontdubbel`), dan
    // is er geen geheel om op te wachten.
    if (basis !== s && volledigInSet.has(basis) && !volledigInLijst.has(basis)) continue;
    standaard.push({ ...n, id: volgendId++ });
  }

  const combinations = [...standaard, ...eigen];
  return {
    ...staat,
    combinations: gelijkeLijst(combinations, staat.combinations) ? staat.combinations : combinations,
    volgendCombinatieId: volgendId,
  };
}

/**
 * Nieuw belastinggeval. Het id komt van de teller — nooit het id van een
 * eerder verwijderd geval. Standaard is het type "other": de app raadt geen
 * type, en `meldingenBelastinggevallen` meldt het geval tot de gebruiker
 * kiest.
 */
export function voegBelastinggevalToe(
  staat: CombinatieStaat,
  naam: string,
  type: LoadCase["type"] = "other",
): { staat: CombinatieStaat; id: number } {
  const id = volgendVrijId(staat.loadCases, staat.volgendGevalId);
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  const volgend: CombinatieStaat = {
    ...staat,
    loadCases: [...staat.loadCases, { id, name: naam, type }],
    volgendGevalId: id + 1,
  };
  return { staat: synchroniseerStandaard(volgend, vorig), id };
}

/** Naam, type of categorie van een geval wijzigen; de standaardset volgt. */
export function wijzigBelastinggeval(
  staat: CombinatieStaat,
  id: number,
  patch: Partial<Omit<LoadCase, "id">>,
): CombinatieStaat {
  if (!staat.loadCases.some((c) => c.id === id)) return staat;
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  const volgend: CombinatieStaat = {
    ...staat,
    loadCases: staat.loadCases.map((c) => (c.id === id ? { ...c, ...patch, id } : c)),
  };
  return synchroniseerStandaard(volgend, vorig);
}

/**
 * Geval verwijderen. De factor van dit id verdwijnt uit ELKE combinatie, ook
 * uit eigen combinaties: een factor voor een geval dat er niet is, is een
 * wees die het volgende geval met hetzelfde id zou erven. Het laatste geval
 * blijft staan — een model zonder belastinggeval kent de store niet.
 */
export function verwijderBelastinggeval(staat: CombinatieStaat, id: number): CombinatieStaat {
  if (!staat.loadCases.some((c) => c.id === id)) return staat;
  if (staat.loadCases.length <= 1) return staat;
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  const volgend: CombinatieStaat = {
    ...staat,
    loadCases: staat.loadCases.filter((c) => c.id !== id),
    // De teller mag nooit onder het verwijderde id uitkomen.
    volgendGevalId: Math.max(staat.volgendGevalId, id + 1),
  };
  return synchroniseerStandaard(volgend, vorig);
}

/** Andere gevolgklasse: de factoren van de standaardcombinaties volgen NB.4/NB.5. */
export function zetGevolgklasse(staat: CombinatieStaat, gevolgklasse: Gevolgklasse): CombinatieStaat {
  if (gevolgklasse === staat.gevolgklasse) return staat;
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  return synchroniseerStandaard({ ...staat, gevolgklasse }, vorig);
}

/**
 * De expliciete actie bij een project met afwijkende combinaties: vervang
 * alles door de standaardset. Alleen de combinaties van de windgenerator
 * blijven staan — die horen bij haar gevallen en maakt zij zelf opnieuw.
 */
export function vervangDoorStandaard(staat: CombinatieStaat): CombinatieStaat {
  const geldigeIds = new Set(staat.loadCases.map((c) => c.id));
  let volgendId = volgendVrijId(staat.combinations, staat.volgendCombinatieId);
  const standaard = genereerStandaardCombinaties(staat.loadCases, staat.gevolgklasse)
    .map((c) => ({ ...c, id: volgendId++ }));
  const wind = staat.combinations
    .filter(isWindgeneratorCombinatie)
    .map((c) => zonderOnbekendeGevallen(c, geldigeIds));
  return { ...staat, combinations: [...standaard, ...wind], volgendCombinatieId: volgendId };
}

export function voegCombinatieToe(
  staat: CombinatieStaat,
  combo: Omit<LoadCombination, "id">,
): CombinatieStaat {
  const id = volgendVrijId(staat.combinations, staat.volgendCombinatieId);
  // Een handmatig toegevoegde combinatie is nooit een standaardcombinatie.
  const { standaard: _weg, ...rest } = combo;
  return {
    ...staat,
    combinations: [...staat.combinations, { ...rest, id }],
    volgendCombinatieId: id + 1,
  };
}

/**
 * Een combinatie wijzigen. Elke wijziging maakt er een EIGEN combinatie van:
 * het kenmerk `standaard` verdwijnt, en de app past haar daarna niet meer aan.
 * Anders zou de volgende wijziging aan een belastinggeval de aanpassing van
 * de gebruiker stil terugdraaien.
 */
export function wijzigCombinatie(
  staat: CombinatieStaat,
  id: number,
  patch: Partial<Omit<LoadCombination, "id">>,
): CombinatieStaat {
  if (!staat.combinations.some((c) => c.id === id)) return staat;
  return {
    ...staat,
    combinations: staat.combinations.map((c) => {
      if (c.id !== id) return c;
      const { standaard: _weg, ...rest } = { ...c, ...patch };
      return { ...rest, id };
    }),
  };
}

export function verwijderCombinatie(staat: CombinatieStaat, id: number): CombinatieStaat {
  if (!staat.combinations.some((c) => c.id === id)) return staat;
  return {
    ...staat,
    combinations: staat.combinations.filter((c) => c.id !== id),
    volgendCombinatieId: Math.max(staat.volgendCombinatieId, id + 1),
  };
}

// ── Meldingen ─────────────────────────────────────────────────────────────

export interface GevalMelding {
  /**
   * "fout" = een last telt als nul of met verkeerde factoren, of er ontbreekt
   * een combinatie; "waarschuwing" = het kan misgaan.
   */
  niveau: "fout" | "waarschuwing";
  /** Het geval waar de melding over gaat; null = het model als geheel. */
  caseId: number | null;
  tekst: string;
  /**
   * De combinaties zelf zijn het probleem, en "Vervang door
   * standaardcombinaties" lost het op. De interface toont die actie dan ook
   * zonder de melding bij het openen van een projectbestand.
   */
  vervangAdvies?: true;
}

const TYPE_TEKST: Record<string, string> = {
  dead: "blijvend", live: "veranderlijk", snow: "sneeuw", wind: "wind", other: "overig",
};

/** Getal met decimale komma, zonder overbodige nullen. */
function nl(x: number): string {
  return String(Number(x.toFixed(3))).replace(".", ",");
}

function gelijk(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9;
}

// ── Ontbrekende standaardcombinaties ──────────────────────────────────────

/**
 * De standaardcombinaties voor deze gevallen en deze klasse die in
 * `combinations` ontbreken — en door geen andere combinatie worden vervangen.
 *
 * Vervangen = een combinatie van hetzelfde type (UGT/BGT) met dezelfde
 * factoren voor de gevallen die een last dragen (`gevuld`), in de BGT ook van
 * dezelfde soort (6.14b/6.15b/6.16b, want elke bruikbaarheidstoets zoekt zijn
 * eigen soort; zie `soortVanCombinatie`). Een hernoemde standaardcombinatie
 * vervangt zichzelf dus zolang er niets verandert. Een factor voor een leeg
 * geval telt niet: "UGT 6.10a — zonder Variabel (Q)" vervangt 6.10a als Q
 * geen last draagt, want de uitkomst is dan dezelfde. Een standaardcombinatie
 * zonder enige factor voor een gevuld geval ontbreekt nooit.
 *
 * Een ontbrekende combinatie is een opstelling die de omhullende niet ziet.
 * Zonder deze controle werd een combinatieset stil een DEELVERZAMELING van de
 * juiste set — zie de kop van dit bestand.
 */
export function ontbrekendeStandaardcombinaties(p: {
  combinations: readonly LoadCombination[];
  loadCases: readonly GevalInvoer[];
  gevolgklasse: Gevolgklasse;
  /** Draagt dit geval een last? Zonder: elk geval (de strenge kant). */
  gevuld?: (caseId: number) => boolean;
}): StandaardCombinatie[] {
  const gevuld = p.gevuld ?? (() => true);
  const inhoud = (factors: ReadonlyMap<number, number>): string =>
    [...factors]
      .filter(([id, f]) => f !== 0 && gevuld(id))
      .sort((a, b) => a[0] - b[0])
      .map(([id, f]) => `${id}:${Math.round(f * 1e9) / 1e9}`)
      .join(",");
  const soortDeel = (type: string, soort: string | null): string =>
    type === "sls" ? soort ?? "?" : "";
  const aanwezig = new Set(
    p.combinations.map((c) => `${c.type}|${soortDeel(c.type, soortVanCombinatie(c))}|${inhoud(c.factors)}`),
  );
  return genereerStandaardCombinaties(p.loadCases, p.gevolgklasse).filter((n) => {
    const eigen = inhoud(n.factors);
    if (eigen === "") return false;
    return !aanwezig.has(`${n.type}|${soortDeel(n.type, n.standaard.soort)}|${eigen}`);
  });
}

function tekstOntbrekend(ontbrekend: readonly StandaardCombinatie[], klasse: Gevolgklasse): string {
  const MAX = 6;
  const namen =
    ontbrekend.slice(0, MAX).map((c) => `"${c.name}" (${c.formula.split("   [")[0]})`).join(", ") +
    (ontbrekend.length > MAX ? ` en nog ${ontbrekend.length - MAX}` : "");
  return (
    `${ontbrekend.length} standaardcombinatie(s) ontbreken, dus de omhullende kan te laag zijn. ` +
    `Ze horen bij deze belastinggevallen en ${klasse}, en geen andere combinatie in dit project ` +
    `heeft dezelfde factoren voor de gevallen met last: ${namen}. Een combinatieset die een deel ` +
    "van de standaardset mist, geeft een lagere omhullende zonder dat een getal dat verraadt. Dat " +
    "gebeurt als een standaardcombinatie is verwijderd of aangepast (dan is ze een eigen combinatie " +
    "en volgt ze de belastinggevallen niet meer), of als de combinaties uit een ouder projectbestand " +
    "komen en er daarna een belastinggeval bij kwam of van type of categorie veranderde. Kies " +
    '"Vervang door standaardcombinaties" in Belastinggevallen & combinaties, of voeg de ontbrekende ' +
    "combinaties als eigen combinatie toe."
  );
}

// ── Blijvende gevallen met factoren die niet bij hun type passen ──────────

/**
 * Elke factor die een blijvende belasting in een UGT-combinatie kan hebben:
 * γ_G,sup (6.10a en 6.10b) en γ_G,inf van NB tabel NB.4 en NB.5 in elke
 * gevolgklasse, en 1,0 uit tabel NB.10–A1.3 (buitengewone en
 * aardbevingscombinaties, "1,0 G_k,j,sup" en "1,0 G_k,j,inf"). Alle klassen
 * samen: een eigen combinatie uit een CC2-project blijft ook in CC3 een
 * blijvende combinatie.
 */
const UGT_FACTOREN_BLIJVEND: readonly number[] = [
  ...new Set([
    ...GEVOLGKLASSEN.flatMap((k) => [
      PARTIELE_FACTOREN[k].gGsup610a, PARTIELE_FACTOREN[k].gGsup610b, PARTIELE_FACTOREN[k].gGinf,
    ]),
    1.0,
  ]),
];

/**
 * De acht standaardcombinaties van vóór september 2026, met hun vaste
 * case-id's G = 1, Q = 2, S = 3, W = 4 (combinations.ts in versie 0.3.11).
 * Alleen om een geërfd factorpatroon bij naam te kunnen noemen.
 */
const OUDE_STANDAARDSET: readonly { naam: string; factoren: Readonly<Record<number, number>> }[] = [
  { naam: "ULS 6.10a", factoren: { 1: 1.35, 2: 1.05, 3: 1.05, 4: 0.9 } },
  { naam: "ULS 6.10b (Q leidend)", factoren: { 1: 1.2, 2: 1.5, 3: 1.05, 4: 0.9 } },
  { naam: "ULS 6.10b (S leidend)", factoren: { 1: 1.2, 3: 1.5, 2: 1.05, 4: 0.9 } },
  { naam: "ULS 6.10b (W leidend)", factoren: { 1: 1.2, 4: 1.5, 2: 1.05, 3: 1.05 } },
  { naam: "ULS uplift", factoren: { 1: 0.9, 4: 1.5 } },
  { naam: "SLS Karakteristiek", factoren: { 1: 1.0, 2: 1.0, 3: 0.7, 4: 0.6 } },
  { naam: "SLS Frequent", factoren: { 1: 1.0, 2: 0.5, 3: 0.2 } },
  { naam: "SLS Quasi-permanent", factoren: { 1: 1.0, 2: 0.3 } },
];

const OUDE_GEVALLEN: Readonly<Record<number, string>> = {
  2: "het veranderlijke geval (Q)", 3: "het sneeuwgeval (S)", 4: "het windgeval (W)",
};

/** Een blijvend geval met factoren die bij geen blijvende belasting passen. */
export interface BlijvendeAfwijking {
  caseId: number;
  naam: string;
  /**
   * Elke combinatie waarin dit geval afwijkt: een factor die niet past
   * (`pastNiet`), of een andere factor dan een ander blijvend geval in
   * dezelfde combinatie.
   */
  regels: { combinatieId: number; combinatie: string; factor: number; pastNiet: boolean; tekst: string }[];
  /**
   * Draagt dit geval in de oude standaardcombinaties precies de kolom van het
   * oude geval met dit id (2 = Q, 3 = S, 4 = W)? Dan dat id, anders null.
   */
  oudeKolom: number | null;
}

function oudeKolomVan(caseId: number, combinations: readonly LoadCombination[]): number | null {
  if (OUDE_GEVALLEN[caseId] === undefined) return null;
  const oud = combinations
    .map((c) => ({ c, o: OUDE_STANDAARDSET.find((x) => x.naam === c.name) }))
    .filter((x): x is { c: LoadCombination; o: (typeof OUDE_STANDAARDSET)[number] } => x.o !== undefined);
  if (oud.length < 3) return null;
  return oud.every(({ c, o }) => gelijk(c.factors.get(caseId) ?? 0, o.factoren[caseId] ?? 0)) ? caseId : null;
}

/**
 * Blijvende gevallen (type "dead") met een factor die bij geen blijvende
 * belasting past: in de BGT anders dan 1,0 (6.14b–6.16b), in de UGT geen γ_G
 * uit NB.4/NB.5 en geen 1,0. Ontbreekt een blijvend geval in een combinatie,
 * dan is dat op zich geen fout — een eigen BGT-combinatie voor de bijkomende
 * zakking laat het eigen gewicht bewust weg — maar het staat wel in de regels
 * als een ander blijvend geval er een factor heeft.
 *
 * Het spoor van basisaudit nr 14 in een projectbestand van vóór september
 * 2026: "Permanent afbouw" kreeg het id van het verwijderde windgeval en erfde
 * zijn factoren — 0,9 in 6.10a, 1,5 met wind leidend, 0,6 in de
 * karakteristieke BGT-combinatie. HEA200 6 m, G = 5 en afbouw 3 kN/m: UGT
 * 47,25 en BGT 30,60 kNm waar 1,35·8·36/8 = 48,60 en 8·36/8 = 36,00 horen.
 * Alleen gevallen met minstens één factor die niet past komen in de lijst.
 */
export function blijvendeFactorAfwijkingen(p: {
  loadCases: readonly Pick<LoadCase, "id" | "name" | "type">[];
  combinations: readonly LoadCombination[];
}): BlijvendeAfwijking[] {
  const blijvend = p.loadCases.filter((c) => c.type === "dead");
  const uit: BlijvendeAfwijking[] = [];
  for (const g of blijvend) {
    const regels: BlijvendeAfwijking["regels"] = [];
    for (const c of p.combinations) {
      const f = c.factors.get(g.id) ?? 0;
      const ander = blijvend.find((o) => {
        const fo = c.factors.get(o.id) ?? 0;
        return o.id !== g.id && fo !== 0 && !gelijk(fo, f);
      });
      const pastNiet = f !== 0 && (c.type === "sls"
        ? !gelijk(f, 1)
        : !UGT_FACTOREN_BLIJVEND.some((x) => gelijk(x, f)));
      if (!pastNiet && !ander) continue;
      const waarom: string[] = [];
      if (pastNiet) {
        waarom.push(c.type === "sls"
          ? "in de BGT telt een blijvende belasting met 1,0"
          : "geen γ_G uit NB tabel NB.4/NB.5 en geen 1,0");
      }
      if (ander) waarom.push(`blijvend geval ${ander.id} heeft daar ${nl(c.factors.get(ander.id) ?? 0)}`);
      regels.push({
        combinatieId: c.id, combinatie: c.name, factor: f, pastNiet,
        tekst: `"${c.name}" ${f === 0 ? "geen factor" : nl(f)} (${waarom.join("; ")})`,
      });
    }
    if (regels.some((r) => r.pastNiet)) {
      uit.push({ caseId: g.id, naam: g.name, regels, oudeKolom: oudeKolomVan(g.id, p.combinations) });
    }
  }
  return uit;
}

/** De regels en de herkomst van een afwijking, voor in een melding. */
function regelsEnHerkomst(a: BlijvendeAfwijking): { lijst: string; herkomst: string } {
  const MAX = 8;
  const lijst =
    a.regels.slice(0, MAX).map((r) => r.tekst).join("; ") +
    (a.regels.length > MAX ? `; en nog ${a.regels.length - MAX}` : "");
  const herkomst = a.oudeKolom !== null
    ? `Het zijn precies de factoren die de standaardcombinaties van vóór september 2026 aan ` +
      `belastinggeval ${a.oudeKolom} gaven, ${OUDE_GEVALLEN[a.oudeKolom]}. Zo'n geval heeft het id ` +
      "van een verwijderd geval gekregen (tot september 2026 erfde het dan diens factoren), of zijn " +
      "type is later gewijzigd zonder dat de factoren meegingen."
    : "Zo'n patroon ontstaat in een projectbestand van vóór september 2026 wanneer een verwijderd " +
      "geval zijn id aan een nieuw geval doorgaf, of wanneer het type later is gewijzigd zonder dat " +
      "de factoren meegingen.";
  return { lijst, herkomst };
}

function tekstBlijvendeAfwijking(a: BlijvendeAfwijking): string {
  const { lijst, herkomst } = regelsEnHerkomst(a);
  return (
    `Belastinggeval ${a.caseId} ("${a.naam}") is van type blijvend, maar draagt factoren die niet ` +
    `bij een blijvende belasting passen: ${lijst}. Alle blijvende gevallen samen zijn één blijvende ` +
    "belasting G, met in elke combinatie dezelfde factor: γ_G uit NEN-EN 1990 NB tabel NB.4/NB.5 in " +
    "de UGT (0,9 waar zij gunstig werkt), 1,0 in de BGT (6.14b–6.16b). " +
    `${herkomst} De last van dit geval telt daardoor met de verkeerde factoren. Kies "Vervang door ` +
    'standaardcombinaties" in Belastinggevallen & combinaties, of corrigeer de factoren van dit geval.'
  );
}

/**
 * Welke belastinggevallen niet (volledig) in de doorgerekende combinaties
 * meetellen, en of het eigen gewicht een blijvend geval heeft.
 *
 * `combinations` hoort de ACTIEF doorgerekende lijst te zijn: wat daar niet in
 * staat, telt ook niet mee. `loads` bepaalt of een geval een last draagt: een
 * leeg geval zonder factor is een waarschuwing, een gevuld geval zonder factor
 * een fout. Zonder `loads` wordt elk geval als gevuld beschouwd — de strenge
 * kant.
 *
 * `alleCombinaties` is de VOLLEDIGE lijst van het project (ook wat de selectie
 * overslaat) en `gevolgklasse` de klasse van het project. Samen bepalen ze of
 * er standaardcombinaties ontbreken (`ontbrekendeStandaardcombinaties`). Dat
 * gebeurt alleen in een project MET standaardcombinaties: een set die de
 * gebruiker helemaal zelf opstelt, of de acht combinaties van een ouder
 * bestand (die bij het openen al worden gemeld), is geen deel van de
 * standaardset maar een andere set. Zonder `gevolgklasse` geldt de klasse uit
 * het kenmerk van de standaardcombinaties.
 */
export function meldingenBelastinggevallen(p: {
  loadCases: readonly (Pick<LoadCase, "id" | "name" | "type"> &
    Partial<Pick<LoadCase, "categorie" | "gegenereerd">>)[];
  combinations: readonly LoadCombination[];
  alleCombinaties?: readonly LoadCombination[];
  gevolgklasse?: Gevolgklasse;
  loads?: readonly Pick<Load, "caseId">[];
  selfWeightEnabled?: boolean;
}): GevalMelding[] {
  const meldingen: GevalMelding[] = [];
  const blijvend = p.loadCases.find((c) => c.type === "dead");
  const gevuld = (id: number): boolean =>
    p.loads === undefined ||
    p.loads.some((l) => l.caseId === id) ||
    (p.selfWeightEnabled === true && blijvend?.id === id);
  const heeftFactor = (id: number, type: "uls" | "sls") =>
    p.combinations.some((c) => c.type === type && (c.factors.get(id) ?? 0) !== 0);
  const heeftBgt = p.combinations.some((c) => c.type === "sls");

  if (p.selfWeightEnabled && !blijvend) {
    meldingen.push({
      niveau: "fout",
      caseId: null,
      tekst:
        'Eigen gewicht staat aan, maar er is geen belastinggeval van type "blijvend". ' +
        "Het eigen gewicht wordt daarom NIET meegerekend. Tot september 2026 kwam het " +
        "stil in het eerste belastinggeval terecht, met de factoren van dát type — " +
        "bij een veranderlijk geval ψ₂ = 0,3 in de quasi-blijvende combinatie in plaats " +
        'van 1,0. Maak een belastinggeval van type "blijvend" aan.',
    });
  }

  // Nooit stil een deelverzameling van de standaardset.
  const alle = p.alleCombinaties ?? p.combinations;
  const eenStandaard = alle.find((c) => c.standaard);
  if (eenStandaard?.standaard) {
    const klasse = p.gevolgklasse ?? eenStandaard.standaard.gevolgklasse;
    const ontbrekend = ontbrekendeStandaardcombinaties({
      combinations: alle, loadCases: p.loadCases, gevolgklasse: klasse, gevuld,
    });
    if (ontbrekend.length > 0) {
      meldingen.push({
        niveau: "fout", caseId: null, vervangAdvies: true, tekst: tekstOntbrekend(ontbrekend, klasse),
      });
    }
  }
  const blijvendAfwijkend = new Map(
    blijvendeFactorAfwijkingen({ loadCases: p.loadCases, combinations: p.combinations })
      .map((a) => [a.caseId, a] as const),
  );

  // Twee aannames van de standaardset die de gebruiker moet kunnen zien. Alleen
  // als er standaardcombinaties worden doorgerekend: eigen combinaties stelt de
  // gebruiker zelf op.
  if (p.combinations.some((c) => c.standaard)) {
    const eigen = p.loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
    const aantal = aantalGebruiksgevallen(eigen);
    if (aantal > MAX_VRIJE_GEVALLEN) {
      meldingen.push({
        niveau: "waarschuwing",
        caseId: null,
        tekst:
          `Er zijn ${aantal} veranderlijke belastinggevallen (gebruiksbelasting). De ` +
          `standaardcombinaties zetten er hoogstens ${MAX_VRIJE_GEVALLEN} afzonderlijk aan en uit; ` +
          "bij meer gaan de gevallen van één gebruikscategorie samen aan of uit. Een " +
          "gebruiksbelasting is een vrije belasting die op het meest ongunstige deel moet staan " +
          "(NEN-EN 1991-1-1 6.2.1(1)P): een per veld verdeelde vloerlast op alleen het " +
          "ongunstigste veld zit nu NIET in de set, en de omhullende kan daardoor te laag zijn. " +
          "Voeg die opstellingen toe als eigen combinaties, of beperk het aantal veranderlijke gevallen.",
      });
    }
    const soorten = [
      { type: "wind", meervoud: "windgevallen", voorbeeld: "druk op de gevel en zuiging op het dak bij één windrichting" },
      { type: "snow", meervoud: "sneeuwgevallen", voorbeeld: "de sneeuw op twee dakvlakken bij één sneeuwverdeling" },
    ] as const;
    for (const s of soorten) {
      const alternatieven = eigen.filter((c) => c.type === s.type);
      if (alternatieven.length < 2) continue;
      meldingen.push({
        niveau: "waarschuwing",
        caseId: null,
        tekst:
          `De ${s.meervoud} ${alternatieven.map((c) => `${c.id} ("${c.name}")`).join(", ")} gelden ` +
          "in de standaardcombinaties als ALTERNATIEVEN: elk leidt apart, en ze staan nooit samen " +
          "in één combinatie (zoals wind van links óf van rechts). Horen ze bij dezelfde " +
          `belasting — bijvoorbeeld ${s.voorbeeld} — zet ze dan in één belastinggeval; anders ` +
          "telt steeds maar een deel ervan mee.",
      });
    }
  }

  for (const c of p.loadCases) {
    const naam = `Belastinggeval ${c.id} ("${c.name}")`;
    const metLast = gevuld(c.id);
    if (!heeftFactor(c.id, "uls")) {
      const typeloos = c.type === undefined || c.type === "other";
      const oorzaak = typeloos
        ? `heeft ${c.type === undefined ? "geen type" : 'type "overig"'} en telt daardoor in geen ` +
          "enkele UGT-combinatie mee. Voor zo'n geval bestaat geen normfactor (NEN-EN 1990 NB " +
          "tabel NB.4 en NB.2–A1.1 kennen alleen blijvende en veranderlijke belastingen): " +
          "kies het type — blijvend, veranderlijk, sneeuw of wind — zodat de " +
          "standaardcombinaties het opnemen, of geef het in een eigen combinatie zelf een factor."
        : `(type ${TYPE_TEKST[c.type] ?? c.type}) telt in geen enkele UGT-combinatie mee: in elke ` +
          "doorgerekende combinatie is zijn factor 0. De combinaties van dit project zijn geen " +
          "(volledige) standaardset; controleer ze, of vervang ze door de standaardcombinaties.";
      meldingen.push({
        niveau: metLast ? "fout" : "waarschuwing",
        caseId: c.id,
        tekst:
          `${naam} ${oorzaak}` +
          (metLast
            ? " Zolang dat zo is, telt de last van dit geval in elke toets als NUL."
            : " Het geval is nog leeg; een last die u erin zet, telt pas mee als dit is opgelost."),
        ...(typeloos ? {} : { vervangAdvies: true as const }),
      });
      continue;
    }
    const afwijking = blijvendAfwijkend.get(c.id);
    if (afwijking) {
      meldingen.push({
        niveau: metLast ? "fout" : "waarschuwing",
        caseId: c.id,
        vervangAdvies: true,
        tekst: tekstBlijvendeAfwijking(afwijking),
      });
    }
    if (metLast && heeftBgt && !heeftFactor(c.id, "sls")) {
      meldingen.push({
        niveau: "waarschuwing",
        caseId: c.id,
        tekst:
          `${naam} telt wel in de UGT maar in geen enkele BGT-combinatie mee: doorbuiging, ` +
          "horizontale verplaatsing en scheurwijdte zien de last van dit geval niet.",
      });
    }
  }
  return meldingen;
}

// ── Afwijkende combinaties bij het openen ─────────────────────────────────

export interface CombinatieAfwijking {
  gevolgklasse: Gevolgklasse;
  /** Combinaties uit het bestand die niet gelijk zijn aan de huidige standaard. */
  afwijkend: { id: number; naam: string; formule: string; reden: string }[];
  /** Standaardcombinaties die in het bestand ontbreken. */
  ontbrekend: { naam: string; formule: string }[];
  /** De standaardset voor deze gevallen en deze klasse — "wat het zou worden". */
  standaard: { naam: string; formule: string }[];
  /** Factoren voor gevallen die niet bestaan; bij het openen weggehaald. */
  weesFactoren: WeesFactor[];
  /**
   * Blijvende gevallen met factoren die bij geen blijvende belasting passen —
   * het spoor van een geërfd id (basisaudit nr 14). NIET weggehaald: die
   * factoren vermenigvuldigen wél een last; alleen de gebruiker kan kiezen.
   */
  blijvend: BlijvendeAfwijking[];
  /** Eén alinea voor de melding bij het openen. */
  samenvatting: string;
}

/**
 * Vergelijk de combinaties van een geopend project met de standaardset die bij
 * zijn gevallen en gevolgklasse hoort. Er wordt NIETS overschreven: dit levert
 * alleen de melding — welke combinaties afwijken en wat de standaard zou zijn.
 * `null` = niets te melden.
 *
 * `eigenCombinatiesBewust`: het bestand is door deze versie geschreven (het
 * draagt id-tellers). Een combinatie zonder kenmerk is dan een bewuste eigen
 * combinatie, en een ontbrekende standaardcombinatie is bewust weggehaald —
 * geen van beide wordt dan gemeld. Bij een ouder bestand kan de app dat
 * onderscheid niet maken, en meldt ze alles.
 *
 * `weesFactoren`: wat `verwijderWeesFactoren` bij het openen weghaalde. Dat
 * komt in de melding, ook als de combinaties verder gelijk zijn aan de
 * standaard.
 */
export function beoordeelCombinatiesBijOpenen(p: {
  combinations: readonly LoadCombination[];
  loadCases: readonly LoadCase[];
  gevolgklasse: Gevolgklasse;
  eigenCombinatiesBewust: boolean;
  weesFactoren?: readonly WeesFactor[];
}): CombinatieAfwijking | null {
  const set = genereerStandaardCombinaties(p.loadCases, p.gevolgklasse);
  const perS = perSleutel(set);
  const gezien = new Set<string>();
  const afwijkend: CombinatieAfwijking["afwijkend"] = [];

  for (const c of p.combinations) {
    const regel = (reden: string) =>
      afwijkend.push({ id: c.id, naam: c.name, formule: c.formula, reden });
    if (isWindgeneratorCombinatie(c)) {
      if (!/NB\.2/.test(c.formula)) {
        regel(
          "gemaakt door de windgenerator van een eerdere versie, met de door EN 1990 " +
            "aanbevolen ψ₀ (tabel A1.1) en vaste CC2-factoren; genereer de windbelasting " +
            "opnieuw om de NB-waarden en de gevolgklasse te krijgen",
        );
      }
      continue;
    }
    if (c.standaard) {
      const n = perS.get(c.standaard.sleutel);
      if (!n) {
        regel("standaardcombinatie die bij de huidige belastinggevallen niet meer hoort");
        continue;
      }
      gezien.add(c.standaard.sleutel);
      if (!gelijkeInhoud(c, n)) {
        regel(
          `standaardcombinatie met andere factoren dan de standaard voor ${p.gevolgklasse} ` +
            "(een andere gevolgklasse, of gemaakt door een eerdere versie)",
        );
      }
      continue;
    }
    if (!p.eigenCombinatiesBewust) {
      regel(
        "geen standaardcombinatie: een eigen combinatie, of een combinatie van vóór " +
          "september 2026 met de door EN 1990 aanbevolen ψ-waarden (tabel A1.1) en vaste " +
          "CC2-factoren, ongeacht de gevolgklasse",
      );
    }
  }

  const ontbrekend = p.eigenCombinatiesBewust
    ? []
    : set.filter((c) => !gezien.has(c.standaard.sleutel)).map((c) => ({ naam: c.name, formule: c.formula }));
  const weesFactoren = [...(p.weesFactoren ?? [])];
  // Een blijvend geval met factoren die niet bij zijn type passen. Een
  // algemeen "8 afwijkend" zegt niet dat een BLIJVENDE last in de BGT met 0,6
  // telt; deze regel noemt het geval, zijn type en de factoren.
  const blijvend = blijvendeFactorAfwijkingen({ loadCases: p.loadCases, combinations: p.combinations });
  if (afwijkend.length === 0 && ontbrekend.length === 0 && weesFactoren.length === 0 && blijvend.length === 0) {
    return null;
  }

  const standaard = set.map((c) => ({ naam: c.name, formule: c.formula }));
  const bron = PARTIELE_FACTOREN[p.gevolgklasse].bron;
  const weesIds = [...new Set(weesFactoren.flatMap((w) => w.caseIds))].sort((a, b) => a - b);
  const teVervangen = afwijkend.length > 0 || ontbrekend.length > 0 || blijvend.length > 0;
  const samenvatting =
    blijvend.map((a) => {
      const { lijst, herkomst } = regelsEnHerkomst(a);
      return (
        `LET OP: belastinggeval ${a.caseId} ("${a.naam}") is van type blijvend, maar draagt factoren ` +
        `die niet bij een blijvende belasting passen: ${lijst}. Een blijvende belasting telt in de ` +
        "BGT met 1,0 en heeft in elke combinatie dezelfde factor als de andere blijvende gevallen. " +
        `${herkomst} Zolang dat zo is, telt de last van dit geval met de verkeerde factoren. `
      );
    }).join("") +
    (afwijkend.length > 0
      ? `${afwijkend.length} belastingcombinatie(s) in dit project wijken af van de ` +
        `standaardcombinaties voor ${p.gevolgklasse} (γ uit NEN-EN 1990 ${bron}, ψ uit tabel ` +
        `NB.2–A1.1): ${afwijkend.map((a) => `"${a.naam}"`).join(", ")}. `
      : "") +
    (ontbrekend.length > 0
      ? `De standaardset voor deze belastinggevallen zou bestaan uit ${standaard.length} ` +
        `combinaties: ${standaard.map((s) => `"${s.naam}"`).join(", ")}. `
      : "") +
    (weesFactoren.length > 0
      ? `In ${weesFactoren.length} belastingcombinatie(s) ` +
        `(${weesFactoren.map((w) => `"${w.naam}"`).join(", ")}) stonden factoren voor ` +
        (weesIds.length === 1
          ? `belastinggeval ${weesIds[0]}, dat in dit project niet (meer) bestaat`
          : `belastinggevallen ${weesIds.join(", ")}, die in dit project niet (meer) bestaan`) +
        ": een rest van een verwijderd geval. Die factoren zijn bij het openen weggehaald. Ze " +
        "vermenigvuldigden geen enkele last, dus geen uitkomst van dit project verandert; een " +
        `nieuw belastinggeval krijgt een id boven ${weesIds[weesIds.length - 1]} en kan ze niet ` +
        "meer erven. "
      : "") +
    (teVervangen
      ? `${weesFactoren.length > 0 ? "Verder is er" : "Er is"} NIETS overschreven: het project ` +
        "rekent met de combinaties uit het bestand. " +
        'Kies "Vervang door standaardcombinaties" in Belastinggevallen & combinaties om de ' +
        "standaardset te gebruiken."
      : "Verder is er niets veranderd.");

  return { gevolgklasse: p.gevolgklasse, afwijkend, ontbrekend, standaard, weesFactoren, blijvend, samenvatting };
}
