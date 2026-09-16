/**
 * houtEindstijfheid.ts — de eindstijfheid E_mean,fin van hout in een gemengd,
 * statisch onbepaald model (NEN-EN 1995-1-1 + NB, 2.2.2, 2.2.3 en 2.3.2.2).
 *
 * # WAAROM DIT BESTAAT
 *
 * De solver rekent elke houtstaaf met E_mean. Voor een enkel houten element of
 * een constructie waarin alles hetzelfde kruipgedrag heeft is dat juist:
 *
 *   2.2.2(1)P, eerste streepje — "de gemiddelde waarden bij een eerste-orde-
 *   berekening [...] als de verdeling van de inwendige krachten niet wordt
 *   beïnvloed door de stijfheidverdeling in de constructie (waarvan
 *   bijvoorbeeld alle elementen dezelfde tijdsafhankelijke eigenschappen
 *   hebben)";
 *
 *   2.2.3(5) — de vereenvoudiging u_fin = u_inst·(1 + k_def) enz. geldt "bij
 *   constructies die bestaan uit elementen, onderdelen en verbindingen met
 *   hetzelfde kruipgedrag".
 *
 * Staat hout naast staal of beton, of naast hout met een andere k_def, in een
 * STATISCH ONBEPAALDE constructie, dan kruipt het ene deel weg en neemt het
 * andere deel de kracht over. Daarvoor schrijft de norm voor:
 *
 *   2.2.2(1)P, tweede streepje — "de uiteindelijke gemiddelde waarden, die zijn
 *   aangepast voor de belastingscomponent die de grootste spanning teweegbrengt
 *   in relatie tot de sterkte, als de verdeling van de inwendige krachten wordt
 *   beïnvloed door de stijfheidverdeling in de constructie";
 *
 *   2.3.2.2(2), uitdrukking (2.10) — E_mean,fin = E_mean / (1 + ψ₂·k_def),
 *   met ψ₂ "voor de quasi-blijvende waarde van de belasting die de grootste
 *   spanning in verhouding tot de sterkte veroorzaakt (indien die belasting
 *   een blijvende belasting is, behoort ψ₂ te zijn vervangen door 1)";
 *
 *   2.3.2.2(1), uitdrukking (2.7) — voor de bruikbaarheidsgrenstoestand
 *   E_mean,fin = E_mean / (1 + k_def) voor de langeduurvervorming onder de
 *   quasi-blijvende combinatie, met 2.2.3(4) als rekenwijze.
 *
 * (Leesnoot: in het normdocument staat de afbeelding van (2.10) niet mee
 * afgedrukt; (2.11) en (2.12) voor G en K staan er wel, met dezelfde noemer
 * 1 + ψ₂·k_def, en de tekst van lid (2) noemt E_mean,fin uitdrukkelijk.)
 *
 * Tot september 2026 bestond E_mean,fin nergens, en was er ook geen melding.
 * De richting van die fout is niet op voorhand veilig: het houtdeel krijgt te
 * veel kracht, het staal- of betondeel te weinig.
 *
 * # WAT TELT ALS "VERSCHILLEND KRUIPGEDRAG"
 *
 * De maat voor kruip in EN 1995-1-1 is k_def (tabel 3.2). Twee delen hebben
 * hier hetzelfde kruipgedrag als ze dezelfde k_def hebben:
 *  - staal kruipt niet (k_def = 0) — anders dan hout;
 *  - beton kruipt met zijn eigen kruipcoëfficiënt φ (EN 1992-1-1 3.1.4), een
 *    andere wet dan k_def — anders dan hout en staal;
 *  - massief en gelamineerd hout hebben in tabel 3.2 dezelfde k_def per
 *    klimaatklasse; een andere klimaatklasse is dus ander kruipgedrag, een
 *    andere sterkteklasse niet;
 *  - kruislaaghout draagt een OPGEGEVEN k_def (`checkConfig.cltKdef`); gelijk
 *    aan die van het overige hout = hetzelfde gedrag;
 *  - een verende staafaansluiting aan een houtstaaf is een verbinding, en
 *    verbindingen kruipen met k_def verdubbeld (2.3.2.2(3)) — dus anders dan
 *    de staaf zelf;
 *  - vrij materiaal of een niet herkende staaf: onbekend, en dus niet
 *    aantoonbaar gelijk. Elke twijfel valt naar "verschillend".
 *
 * Statisch bepaald (telling `bepaalOnbepaaldheidVanModel`) = de krachtsverdeling
 * volgt uit evenwicht alleen en de kruip verschuift niets; dan geldt het eerste
 * streepje van 2.2.2(1)P en gebeurt er hier niets.
 *
 * # DE KEUZE: EEN TWEEDE DOORREKENING, NIET ALLEEN EEN MELDING
 *
 * Een melding zegt dat het getal niet klopt, maar niet hoeveel en niet welke
 * kant op. Omdat de solver lineair is, kost de eindtoestand weinig: alle
 * belastinggevallen nog eens met E_mean,fin per houtstaaf, en daarna dezelfde
 * superpositie. Elke UGT-combinatie krijgt daarom naast zichzelf een
 * EINDTOESTANDVARIANT met dezelfde factoren en de stijfheid volgens (2.10).
 * De toetsing, de omhullende en het rapport nemen per staaf de ongunstigste —
 * precies zoals bij de twee scheefstandrichtingen.
 *
 * WELKE ψ₂. De norm vraagt ψ₂ van "de belasting die de grootste spanning in
 * verhouding tot de sterkte veroorzaakt". Welke belasting dat is, verschilt per
 * staaf en per snede, en is pas na de doorrekening bekend. In plaats van te
 * raden rekent de app ELKE kandidaat van de combinatie door: 1 voor een
 * blijvend geval (en voor een geval van soort "overig", waarvan de ψ₂ niet
 * bekend is), ψ₂ van de gebruikscategorie voor een veranderlijk geval. Sneeuw
 * en wind hebben ψ₂ = 0, en dan is E_mean,fin = E_mean: die variant is de
 * combinatie zelf en vervalt. De juiste ψ₂ zit dus altijd tussen de
 * doorgerekende varianten, en de ongunstigste daarvan is nooit gunstiger dan
 * wat de norm vraagt. De combinatie met E_mean blijft er ook naast staan: dat
 * is de toestand direct na het aanbrengen van de last.
 *
 * NIET DOORGEREKEND, WEL GEMELD:
 *  - de BGT-langeduurvervorming volgens 2.2.3(4) met (2.7). De doorbuigings-
 *    toets rekent per staaf w_fin = w_inst + k_def·w_qp, en dat is de
 *    vereenvoudiging van 2.2.3(5) die hier niet geldt;
 *  - tweede orde: daar schrijft 2.2.2(1)P, derde streepje, rekenwaarden voor
 *    "die niet zijn aangepast aan de belastingsduur" — E_mean,fin is dan niet
 *    de regel, en er komt geen variant;
 *  - een houtdeel zonder bekende k_def (kruislaaghout zonder opgegeven k_def,
 *    een houten wandschijf): dan valt E_mean,fin niet te bepalen, en rekenen
 *    met een aangenomen k_def zou een getal verzinnen;
 *  - de kruip van beton (E_cm blijft staan), de stijfheid van vrij materiaal,
 *    verende opleggingen en bedding: die blijven in de eindtoestand ongewijzigd,
 *    en de melding zegt dat.
 *
 * # BIT-IDENTIEK
 *
 * Geldt 2.2.3(5) wél — geen hout, één kruipgedrag, of statisch bepaald — dan
 * geeft `metEindtoestandVarianten` DEZELFDE lijst terug (dezelfde referentie),
 * wordt er niets extra opgelost en blijft `combineResults` op zijn oude pad.
 * `test-hout-eindstijfheid.mjs` bewijst dat.
 */
import type { Analysetype, Beam, Node, Plate, Support } from "../components/fem/femTypes";
import { PLATE_DEFAULTS } from "../components/fem/femTypes";
import type { LoadCase } from "../components/fem/femTypes";
import type { MultiInput, SolverResult } from "../components/fem/solver/types";
import {
  EINDTOESTAND_COMBO_OFFSET,
  zetEindtoestandGevallen,
  type LoadCombination,
} from "../components/fem/solver/combinations";
import { solveAllCases } from "../components/fem/solver/engine";
import { PSI_GEBRUIK, PSI_SNEEUW, PSI_WIND, STANDAARD_CATEGORIE } from "../components/fem/solver/normcombinaties";
import type { GevalMelding } from "./combinatieBeheer";
import { bepaalOnbepaaldheidVanModel, type OnbepaaldheidUitkomst } from "./statischeOnbepaaldheid";
import { materiaalVanStaaf } from "./variantInvoer";
import { plaatMateriaalSoort } from "./plaatMateriaal";

// ── k_def ─────────────────────────────────────────────────────────────────

/**
 * k_def volgens NEN-EN 1995-1-1 tabel 3.2 voor massief hout (EN 14081-1) en
 * gelijmd gelamineerd hout (EN 14080), per klimaatklasse 1/2/3.
 *
 * SPIEGEL van `k_def` in `src-tauri/crates/nen-en-1995-1-1/src/factors.rs`: de
 * sidecar rekent zonder de rekenkern, en de eindstijfheid moet vóór het rekenen
 * bekend zijn. `test-hout-eindstijfheid.mjs` leest het Rust-bestand en faalt
 * als de twee uiteenlopen.
 */
export const K_DEF_TABEL_3_2: Readonly<Record<1 | 2 | 3, number>> = { 1: 0.6, 2: 0.8, 3: 2.0 };

/** Getal met decimale komma, zonder overbodige nullen. */
function nl(x: number): string {
  return String(Number(x.toFixed(3))).replace(".", ",");
}

// ── Kruipgedrag per deel ──────────────────────────────────────────────────

export type KruipSoort = "geen" | "hout" | "beton" | "onbekend";

export interface Kruipgedrag {
  soort: KruipSoort;
  /** k_def van een houtdeel; null = geen hout, of hout zonder bekende k_def. */
  kDef: number | null;
  /** Gelijke sleutel = hetzelfde kruipgedrag. */
  sleutel: string;
  /** In woorden, voor de melding. */
  omschrijving: string;
}

/** Het kruipgedrag van één staaf — zie de kop van dit bestand. */
export function kruipgedragVanStaaf(b: Beam): Kruipgedrag {
  switch (materiaalVanStaaf(b)) {
    case "staal":
      return { soort: "geen", kDef: 0, sleutel: "staal", omschrijving: "staal (kruipt niet)" };
    case "hout": {
      const sc = b.checkConfig?.serviceClass ?? 1;
      const kDef = K_DEF_TABEL_3_2[sc];
      return {
        soort: "hout", kDef, sleutel: `hout:${kDef}`,
        omschrijving: `hout met k_def = ${nl(kDef)}`,
      };
    }
    case "clt": {
      const k = b.checkConfig?.cltKdef;
      if (typeof k === "number" && Number.isFinite(k) && k >= 0) {
        return { soort: "hout", kDef: k, sleutel: `hout:${k}`, omschrijving: `hout met k_def = ${nl(k)}` };
      }
      return {
        soort: "hout", kDef: null, sleutel: "hout:onbekend",
        omschrijving: "kruislaaghout zonder opgegeven k_def",
      };
    }
    case "beton":
      return { soort: "beton", kDef: null, sleutel: "beton", omschrijving: "beton (kruip volgens EN 1992-1-1 3.1.4)" };
    case "vrij":
      return {
        soort: "onbekend", kDef: null, sleutel: `vrij:${b.material ?? ""}`,
        omschrijving: "vrij materiaal (kruipgedrag onbekend)",
      };
    default:
      return { soort: "onbekend", kDef: null, sleutel: "onbekend", omschrijving: "niet herkend materiaal (kruipgedrag onbekend)" };
  }
}

/** Heeft de staaf een verende aansluiting (een waarde > 0)? */
function heeftVeren(b: Beam): boolean {
  const v = b.veren;
  if (!v) return false;
  return [v.startTx, v.startTz, v.startRy, v.endTx, v.endTz, v.endRy].some((x) => typeof x === "number" && x > 0);
}

/** Het kruipgedrag van één wandschijf. Een schijf draagt geen klimaatklasse. */
export function kruipgedragVanPlaat(p: Plate): Kruipgedrag {
  if ((p.materiaal ?? "").trim() === "") {
    return (p.E ?? PLATE_DEFAULTS.E) === PLATE_DEFAULTS.E
      ? { soort: "geen", kDef: 0, sleutel: "staal", omschrijving: "staal (kruipt niet)" }
      : { soort: "onbekend", kDef: null, sleutel: `plaat-E:${p.E}`, omschrijving: "wandschijf met een eigen E zonder materiaal (kruipgedrag onbekend)" };
  }
  // Alleen de SOORT telt voor het kruipgedrag. Een kruislaaghouten wand
  // waarvan de G₁₂-keuze nog ontbreekt (issue #14) is nog steeds hout en geen
  // "niet herkend materiaal"; de weigering daarvan komt uit de berekening.
  const soort = plaatMateriaalSoort(p.materiaal);
  if (soort === "onbekend" || soort === null) {
    return { soort: "onbekend", kDef: null, sleutel: "onbekend", omschrijving: "wandschijf met een niet herkend materiaal" };
  }
  switch (soort) {
    case "staal":
      return { soort: "geen", kDef: 0, sleutel: "staal", omschrijving: "staal (kruipt niet)" };
    case "beton":
      return { soort: "beton", kDef: null, sleutel: "beton", omschrijving: "beton (kruip volgens EN 1992-1-1 3.1.4)" };
    case "hout":
    case "clt":
      return {
        soort: "hout", kDef: null, sleutel: "hout:onbekend",
        omschrijving: "houten wandschijf (zonder klimaatklasse, dus zonder bekende k_def)",
      };
    default:
      return { soort: "onbekend", kDef: null, sleutel: `vrij:${p.materiaal}`, omschrijving: "vrij materiaal (kruipgedrag onbekend)" };
  }
}

// ── De bepaling ───────────────────────────────────────────────────────────

export interface KruipGroep {
  sleutel: string;
  omschrijving: string;
  staven: number[];
  /** Staven waarvan de VERENDE AANSLUITING in deze groep valt. */
  verbindingen: number[];
  /** Index in de platenlijst (een plaat draagt hier geen id-plicht). */
  platen: number[];
}

export interface EindstijfheidUitkomst {
  /**
   * - "nvt": 2.2.3(5) en het eerste streepje van 2.2.2(1)P gelden; er gebeurt
   *   niets (bit-identiek).
   * - "doorrekenen": elke UGT-combinatie krijgt eindtoestandvarianten.
   * - "alleenMelding": de eindstijfheid is nodig maar hier niet te bepalen
   *   (tweede orde, of hout zonder bekende k_def); er komt een melding.
   */
  status: "nvt" | "doorrekenen" | "alleenMelding";
  /** Waarom deze status, in één zin. */
  reden: string;
  groepen: KruipGroep[];
  onbepaaldheid: OnbepaaldheidUitkomst | null;
  /** k_def per houtstaaf — alleen gevuld bij "doorrekenen". */
  kDefPerStaaf: Map<number, number>;
  /** Voor de projectboom, het rapport en de MCP-antwoorden. */
  meldingen: GevalMelding[];
}

export interface EindstijfheidModel {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates?: Plate[];
  analysetype: Analysetype;
}

const NVT_LEEG: Omit<EindstijfheidUitkomst, "reden"> = {
  status: "nvt", groepen: [], onbepaaldheid: null, kDefPerStaaf: new Map(), meldingen: [],
};

/** De naam van de soort, als opsomming. */
function groepTekst(g: KruipGroep): string {
  const delen: string[] = [];
  if (g.staven.length > 0) delen.push(`staaf ${g.staven.join(", ")}`);
  if (g.verbindingen.length > 0) delen.push(`verende aansluiting van staaf ${g.verbindingen.join(", ")}`);
  if (g.platen.length > 0) delen.push(`wandschijf ${g.platen.map((i) => i + 1).join(", ")}`);
  return `${g.omschrijving}: ${delen.join("; ")}`;
}

/**
 * Geldt 2.2.3(5), of hoort er een eindtoestand met E_mean,fin bij? Zie de kop
 * van dit bestand voor de regels.
 */
export function bepaalEindstijfheidHout(model: EindstijfheidModel): EindstijfheidUitkomst {
  const plates = model.plates ?? [];
  const groepen = new Map<string, KruipGroep>();
  const groep = (k: Kruipgedrag): KruipGroep => {
    let g = groepen.get(k.sleutel);
    if (!g) {
      g = { sleutel: k.sleutel, omschrijving: k.omschrijving, staven: [], verbindingen: [], platen: [] };
      groepen.set(k.sleutel, g);
    }
    return g;
  };

  let metHout = false;
  const kDefPerStaaf = new Map<number, number>();
  for (const b of model.beams) {
    const k = kruipgedragVanStaaf(b);
    groep(k).staven.push(b.id);
    if (k.soort !== "hout") continue;
    metHout = true;
    if (k.kDef !== null) kDefPerStaaf.set(b.id, k.kDef);
    // Een verbinding van hout kruipt met k_def verdubbeld (2.3.2.2(3)).
    if (heeftVeren(b)) {
      const kv = k.kDef === null ? null : 2 * k.kDef;
      groep({
        soort: "hout", kDef: kv,
        sleutel: kv === null ? "verbinding:onbekend" : `hout:${kv}`,
        omschrijving: kv === null
          ? "verende aansluiting aan hout zonder bekende k_def"
          : `verbinding met k_def = 2·${nl(k.kDef!)} = ${nl(kv)} (2.3.2.2(3))`,
      }).verbindingen.push(b.id);
    }
  }
  plates.forEach((p, i) => {
    const k = kruipgedragVanPlaat(p);
    if (k.soort === "hout") metHout = true;
    groep(k).platen.push(i);
  });

  const lijst = [...groepen.values()];
  if (!metHout) return { ...NVT_LEEG, groepen: lijst, reden: "Het model bevat geen hout." };
  if (lijst.length <= 1) {
    return {
      ...NVT_LEEG, groepen: lijst,
      reden: "Alle delen hebben hetzelfde kruipgedrag; E_mean volstaat (EN 1995-1-1 2.2.2(1)P, 2.2.3(5)).",
    };
  }

  const onb = bepaalOnbepaaldheidVanModel(model.nodes, model.beams, model.supports, plates.length > 0);
  if (onb.statischBepaald) {
    return {
      ...NVT_LEEG, groepen: lijst, onbepaaldheid: onb,
      reden: "De constructie is statisch bepaald: de krachtsverdeling hangt niet van de stijfheid af (EN 1995-1-1 2.2.2(1)P).",
    };
  }

  const opsomming = lijst.map(groepTekst).join(" — ");
  const kop =
    "Hout in een statisch onbepaalde constructie met verschillend kruipgedrag " +
    `(${opsomming}). ${onb.toelichting} De vereenvoudiging van EN 1995-1-1 2.2.3(5) ` +
    "geldt daarom niet: in de eindtoestand kruipt het hout weg en verschuift de " +
    "krachtsverdeling naar de stijvere delen (2.2.2(1)P, tweede streepje).";

  // ── Tweede orde: E_mean,fin is dan niet de regel ────────────────────────
  if (model.analysetype !== "eersteOrde") {
    return {
      status: "alleenMelding", groepen: lijst, onbepaaldheid: onb, kDefPerStaaf: new Map(),
      reden: "tweede orde",
      meldingen: [{
        niveau: "waarschuwing", caseId: null,
        tekst:
          `Eindstijfheid hout niet doorgerekend. ${kop} Bij een tweede-orde-berekening ` +
          "schrijft 2.2.2(1)P (derde streepje) rekenwaarden voor die niet zijn aangepast " +
          "aan de belastingsduur, en niet E_mean,fin; er is geen eindtoestandvariant " +
          "berekend. Beoordeel de krachtsverdeling in de eindtoestand apart, bijvoorbeeld " +
          "met een eerste-orde-berekening.",
      }],
    };
  }

  // ── Hout zonder bekende k_def: niet te bepalen ──────────────────────────
  const zonderKdef = lijst.filter((g) => g.sleutel === "hout:onbekend" || g.sleutel === "verbinding:onbekend");
  if (zonderKdef.length > 0) {
    return {
      status: "alleenMelding", groepen: lijst, onbepaaldheid: onb, kDefPerStaaf: new Map(),
      reden: "k_def onbekend",
      meldingen: [{
        niveau: "waarschuwing", caseId: null,
        tekst:
          `Eindstijfheid hout niet doorgerekend. ${kop} Voor ` +
          `${zonderKdef.map(groepTekst).join("; ")} is k_def niet bekend, en zonder k_def ` +
          "valt E_mean,fin = E_mean/(1 + ψ₂·k_def) (2.3.2.2(2)) niet te bepalen; er wordt " +
          "geen k_def aangenomen. De krachtsverdeling is alleen met E_mean berekend, en " +
          "welke kant de fout op gaat is niet te zeggen. Vul k_def in (kruislaaghout: " +
          "ETA of productverklaring) of beoordeel de eindtoestand apart.",
      }],
    };
  }

  // ── Doorrekenen ─────────────────────────────────────────────────────────
  const bijzonder: string[] = [];
  if (lijst.some((g) => g.sleutel === "beton")) {
    bijzonder.push(
      "Beton houdt in de eindtoestand E_cm: zijn eigen kruip (EN 1992-1-1 3.1.4) zit " +
        "niet in deze variant.",
    );
  }
  if (lijst.some((g) => g.sleutel.startsWith("vrij:") || g.sleutel === "onbekend" || g.sleutel.startsWith("plaat-E:"))) {
    bijzonder.push("Vrij of niet herkend materiaal houdt zijn opgegeven E; zijn kruip is onbekend.");
  }
  if (model.supports.some((s) => s.type === "zSpring" || s.type === "xSpring" || s.type === "rotSpring") ||
      model.beams.some((b) => b.bedding && b.bedding.k > 0)) {
    bijzonder.push("Verende opleggingen en bedding houden hun stijfheid.");
  }

  return {
    status: "doorrekenen", groepen: lijst, onbepaaldheid: onb, kDefPerStaaf,
    reden: "doorrekenen",
    meldingen: [
      {
        niveau: "waarschuwing", caseId: null,
        tekst:
          `Eindstijfheid hout doorgerekend (UGT). ${kop} Elke UGT-combinatie is daarom ` +
          "ook doorgerekend in de eindtoestand, met per houtstaaf E_mean,fin = " +
          "E_mean/(1 + ψ₂·k_def) (2.3.2.2(2), uitdrukking 2.10) en per verende " +
          "aansluiting aan hout K_fin = K/(1 + ψ₂·2·k_def) (2.3.2.2(3)). Omdat vooraf " +
          "niet vaststaat welke belasting de grootste spanning geeft, is elke ψ₂ van de " +
          "combinatie doorgerekend (1 voor blijvend en overig, ψ₂ van de categorie voor " +
          "veranderlijk; sneeuw en wind hebben ψ₂ = 0 en veranderen niets). De varianten " +
          "heten \"… (eindtoestand ψ₂ = …)\"; de toetsing en de omhullende nemen de " +
          "ongunstigste, ook de combinatie met E_mean zelf." +
          (bijzonder.length > 0 ? ` ${bijzonder.join(" ")}` : ""),
      },
      {
        niveau: "waarschuwing", caseId: null,
        tekst:
          "Eindstijfheid hout niet doorgerekend (BGT). De doorbuigingstoets rekent per " +
          "staaf w_fin = w_inst + k_def·w_qp, de vereenvoudiging van EN 1995-1-1 2.2.3(5). " +
          "In deze constructie met verschillend kruipgedrag schrijft 2.2.3(4) de " +
          "langeduurvervorming onder de quasi-blijvende combinatie voor met E_mean,fin = " +
          "E_mean/(1 + k_def) (2.3.2.2(1), uitdrukking 2.7); die is niet berekend. De " +
          "getoonde w_fin en w_add van de houtstaven én de zakkingen van de delen die de " +
          "kracht overnemen kunnen daardoor te klein zijn. Beoordeel de doorbuiging in de " +
          "eindtoestand apart.",
      },
    ],
  };
}

// ── ψ₂ per belastinggeval ─────────────────────────────────────────────────

/**
 * ψ₂ van één belastinggeval voor (2.10): 1 voor blijvend (de norm: "indien die
 * belasting een blijvende belasting is, behoort ψ₂ te zijn vervangen door 1"),
 * ψ₂ van de gebruikscategorie voor veranderlijk (NB tabel NB.2–A1.1), 0 voor
 * sneeuw en wind (dezelfde tabel). Een geval van soort "overig" heeft geen ψ₂
 * in de tabel; het krijgt 1, de grootste kruip, en valt zo mee in de
 * ongunstigste variant in plaats van stil weg te vallen.
 */
export function psi2VoorEindstijfheid(
  lc: Pick<LoadCase, "type" | "categorie" | "gegenereerd">,
): number {
  if (lc.gegenereerd?.bron === "wind") return PSI_WIND.psi2;
  switch (lc.type) {
    case "dead":  return 1;
    case "live":  return PSI_GEBRUIK[lc.categorie ?? STANDAARD_CATEGORIE].psi2;
    case "snow":  return PSI_SNEEUW.psi2;
    case "wind":  return PSI_WIND.psi2;
    default:      return 1;
  }
}

/**
 * De ψ₂-kandidaten van een combinatie: van elk geval met een factor ≠ 0, zonder
 * dubbelen en zonder 0 (E_mean,fin = E_mean — dat is de combinatie zelf).
 * Oplopend. Een geval dat niet in de lijst staat telt als "overig".
 */
export function eindtoestandKandidaten(
  combo: LoadCombination,
  loadCases: readonly Pick<LoadCase, "id" | "type" | "categorie" | "gegenereerd">[],
): number[] {
  const uit = new Set<number>();
  for (const [id, f] of combo.factors) {
    if (f === 0) continue;
    const lc = loadCases.find((c) => c.id === id);
    const psi = lc ? psi2VoorEindstijfheid(lc) : 1;
    if (psi > 0) uit.add(psi);
  }
  return [...uit].sort((a, b) => a - b);
}

/**
 * Elke UGT-combinatie met haar eindtoestandvarianten erachter. Bij een andere
 * status dan "doorrekenen" DEZELFDE lijst (dezelfde referentie).
 *
 * Het id van een variant is id + EINDTOESTAND_COMBO_OFFSET · round(100·ψ₂): uniek
 * per ψ₂, en naast de verschuiving van de scheefstand (1 000 000) blijft het
 * binnen een u32 van de rekenkern.
 */
export function metEindtoestandVarianten(
  combinaties: LoadCombination[],
  loadCases: readonly Pick<LoadCase, "id" | "type" | "categorie" | "gegenereerd">[],
  uitkomst: Pick<EindstijfheidUitkomst, "status">,
): LoadCombination[] {
  if (uitkomst.status !== "doorrekenen") return combinaties;
  const uit: LoadCombination[] = [];
  for (const c of combinaties) {
    uit.push(c);
    if (c.type !== "uls" || c.eindtoestand !== undefined) continue;
    for (const psi2 of eindtoestandKandidaten(c, loadCases)) {
      uit.push({
        ...c,
        id: c.id + EINDTOESTAND_COMBO_OFFSET * Math.round(psi2 * 100),
        name: `${c.name} (eindtoestand ψ₂ = ${nl(psi2)})`,
        eindtoestand: { psi2 },
      });
    }
  }
  return uit;
}

// ── De eindtoestand doorrekenen ───────────────────────────────────────────

/**
 * De solverinvoer in de eindtoestand voor één ψ₂: elke houtstaaf met
 * E_mean,fin = E/(1 + ψ₂·k_def) (2.10), elke verende aansluiting van een
 * houtstaaf met K/(1 + ψ₂·2·k_def) (2.12 met 2.3.2.2(3)). De rest van de invoer
 * wordt gedeeld, niet gekopieerd: alleen de staven zijn nieuw.
 */
export function eindstijfheidInvoer(
  input: MultiInput,
  uitkomst: Pick<EindstijfheidUitkomst, "kDefPerStaaf">,
  psi2: number,
): MultiInput {
  return {
    ...input,
    beams: input.beams.map((b) => {
      const kDef = uitkomst.kDefPerStaaf.get(b.id);
      if (kDef === undefined) return b;
      if (b.E === undefined) {
        // bouwMultiInput vult E altijd; zonder E zou hier de staal-default van de
        // engine geschaald worden — dat is geen hout meer.
        throw new Error(`Staaf ${b.id}: geen E in de solverinvoer; E_mean,fin (EN 1995-1-1 2.3.2.2(2)) is niet te bepalen.`);
      }
      const fStaaf = 1 / (1 + psi2 * kDef);
      const fVerbinding = 1 / (1 + psi2 * 2 * kDef);
      const veren = b.veren
        ? Object.fromEntries(
            Object.entries(b.veren).map(([k, v]) => [k, typeof v === "number" ? v * fVerbinding : v]),
          )
        : undefined;
      return { ...b, E: b.E * fStaaf, ...(veren ? { veren } : {}) };
    }),
  };
}

/**
 * Los de eindtoestand op voor elke ψ₂ die in de combinaties voorkomt en hang de
 * gevallen aan `perCase`, waar `combineResults` ze voor een variant leest.
 * Doet niets als er geen varianten zijn.
 */
export function losEindtoestandOp(
  input: MultiInput,
  perCase: Map<number, SolverResult>,
  combinaties: readonly LoadCombination[],
  uitkomst: Pick<EindstijfheidUitkomst, "kDefPerStaaf">,
): void {
  const psis = [...new Set(combinaties.flatMap((c) => (c.eindtoestand ? [c.eindtoestand.psi2] : [])))];
  for (const psi2 of psis) {
    const { perCase: fin } = solveAllCases(eindstijfheidInvoer(input, uitkomst, psi2));
    zetEindtoestandGevallen(perCase, psi2, fin);
  }
}
