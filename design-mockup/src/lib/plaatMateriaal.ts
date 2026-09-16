/**
 * plaatMateriaal — het MATERIAAL van een wandschijf: van de materiaalnaam
 * naar de stijfheidsgetallen (E₁, E₂, ν₁₂, G₁₂) en de volumieke massa ρ
 * waarmee de solver rekent.
 *
 * # ÉÉN GRAMMATICA VOOR STAAF EN PLAAT
 *
 * Een staaf draagt zijn materiaal als NAAM (`Beam.material`): "S355",
 * "C30/37", "C24", "VRIJ:… E=… rho=… f=…". Een plaat doet dat nu ook
 * (`Plate.materiaal`), met precies dezelfde namen en dezelfde tabellen —
 * `sectionResolver` voor staal, beton en hout, `vrijMateriaal` voor het vrije
 * materiaal, `cltCheckBuilder` voor de kruislaaghoutopbouw. Er komt hier geen
 * tweede materiaaltabel bij: staat een getal al in de app, dan wordt het
 * gelezen en niet overgeschreven.
 *
 * Eén verschil is onvermijdelijk. Bij een staaf staat de CLT-opbouw in het
 * PROFIEL ("CLT 40/20/40/20/40") en de sterkteklasse van de lamellen in het
 * materiaal ("C24"); een plaat heeft geen profielveld, dus moeten beide in
 * één naam. Daarom mag bij een plaat een sterkteklasse vóór de opbouw staan:
 *
 *     CLT C24 40/20/40/20/40           klasse voor alle lagen zonder eigen klasse
 *     CLT 40:C24/20:C16/40:C24         klasse per laag (de staafgrammatica)
 *     CLT C24 40L/20D/40L b=600        richting per laag en strookbreedte
 *
 * Ontbreekt de klasse én heeft niet elke laag er een, dan volgt een
 * WEIGERING met die reden — geen stille C24.
 *
 * # LEEG = ONGEWIJZIGD
 *
 * Zonder `materiaal` gebeurt er niets nieuws: de plaat rekent isotroop met
 * haar eigen E, ν en ρ (of de PLATE_DEFAULTS staal 210 000 / 0,3 / 7850).
 * Elk bestaand projectbestand valt in dat geval en geeft dus tot op de bit
 * dezelfde uitkomst als vóór deze uitbreiding.
 *
 * # RICHTINGSAFHANKELIJKHEID (hout en kruislaaghout)
 *
 * Staal, beton en een vrij materiaal zijn isotroop: één E, één ν, en
 * G = E/(2(1+ν)) volgt daaruit. Hout is dat niet. In het vlak van een
 * wandschijf is de stijfheid evenwijdig aan de vezel (E_0,mean) ruwweg
 * dertig keer die loodrecht erop (E_90,mean), en de afschuiving heeft een
 * eigen modulus G_mean. Een staaf merkt daar niets van — die spant per
 * definitie in de vezelrichting — maar een schijf draagt in twee richtingen
 * tegelijk. Hout isotroop rekenen zou de dwarsrichting een factor dertig te
 * stijf maken, en in een statisch onbepaalde constructie is dat geen
 * veilige fout maar een verkeerde krachtsverdeling.
 *
 * De hoofdrichting (`Plate.hoofdrichting`, graden tegen de klok in vanaf de
 * globale x-as) zegt waar richting 1 — de vezelrichting, bij kruislaaghout
 * de richting van de lengtelagen — naartoe wijst. 0° = de vezel ligt
 * horizontaal.
 *
 * # KRUISLAAGHOUT IN HET VLAK
 *
 * Elke laag draagt in het vlak naar rato van haar dikte: een laag met de
 * vezel in richting 1 draagt daar met E_0,mean en in richting 2 met
 * E_90,mean, een dwarslaag andersom. Uitgesmeerd over de volle dikte:
 *
 *     E₁ = Σ t_i·E_{i,1} / Σ t_i        E₂ = Σ t_i·E_{i,2} / Σ t_i
 *
 * Dat is bewust ANDERS dan de buigingskern (`nen-en-1995-1-1/src/clt.rs`),
 * die de dwarslagen op E = 0 zet. Daar is dat veilig-zijdig: de dwarslagen
 * liggen dicht bij de zwaartelijn, hun bijdrage aan (EI)_ef is klein, en ze
 * weglaten vergroot de berekende spanning in de lengtelagen. Bij een
 * membraan bestaat dat argument niet — elke laag staat even ver van "de
 * zwaartelijn" en draagt naar rato van haar rekstijfheid. E_90 weglaten zou
 * de schijf in béide richtingen te slap maken, en dat is in een statisch
 * onbepaalde constructie geen kant op veilig.
 *
 * # G₁₂ VAN KRUISLAAGHOUT: VERPLICHTE INVOER MET BRON
 *
 * De glijdingsmodulus in het VLAK van een kruislaaghouten schijf is niet de
 * uitgesmeerde G_mean van de lamellen. De lamellen zijn aan hun smalle zijden
 * doorgaans niet verlijmd, zodat de afschuiving in het vlak via de
 * kruisingsvlakken tussen de lagen loopt, en die vervormen daarbij ook door
 * wringing. De werkelijke G₁₂ ligt dus LAGER dan Σ t_i·G_mean,i / Σ t_i.
 *
 * Er is GEEN bron voor die reductie beschikbaar die hier gelezen kon worden
 * (gezocht in september 2026): NEN-EN 1995-1-1 kent kruislaaghout niet als
 * product (zie de kop van `clt.rs`) en geeft ook voor schijven (9.2.4) geen
 * G in het vlak voor een gekruiste opbouw; EN 338 en EN 14080 geven alleen
 * G_mean van de lamel. De productnorm voor kruislaaghout, een technische
 * goedkeuring (ETA) of een ontwerp-Eurocode met een regel voor kruislaaghout
 * stond niet op schijf. Een reductiefactor uit het hoofd overnemen zou een
 * verzonnen normwaarde zijn.
 *
 * Daarom — net als k_def van kruislaaghout (tabel 3.2 kent die rij niet) —
 * is G₁₂ bij kruislaaghout VERPLICHTE INVOER, op één van twee manieren:
 *
 *  - `cltG12` (N/mm²) MET `cltG12Bron`: de waarde uit de productverklaring of
 *    de ETA van de plaat. Zonder bron wordt hij geweigerd, want een waarde
 *    zonder herkomst is in het rapport niet van een aanname te onderscheiden.
 *  - `cltG12Bovengrens: true`: bewust rekenen met de uitgesmeerde G_mean,
 *    ZONDER reductie. Dat is een bovengrens (de schijf is te stijf in
 *    afschuiving) en komt als WAARSCHUWING in paneel en rapport. Dit is
 *    precies de G₁₂ van vóór issue #14, dus een plaat met deze keuze rekent
 *    bit-gelijk aan toen.
 *
 * Geen van beide, of beide tegelijk: WEIGERING met reden. Een kruislaaghouten
 * plaat uit een ouder projectbestand weigert daardoor nu; de reden noemt de
 * twee manieren om hem weer te laten rekenen.
 *
 * # DWARSCONTRACTIE VAN HOUT
 *
 * NEN-EN 1995-1-1 geeft geen dwarscontractiecoëfficiënt, en EN 338 evenmin.
 * Hem uit de literatuur overnemen zou een verzonnen normwaarde zijn. Daarom
 * ν₁₂ = 0 voor hout en kruislaaghout: de normaalspanningen in de twee
 * hoofdrichtingen zijn dan ontkoppeld. Dat is een AANNAME van deze
 * implementatie, geen normwaarde, en ze staat als zodanig in het rapport.
 * In paneel en rapport staat de bron van ν dan ook als "aanname", niet als
 * "materiaal".
 *
 * De gebruiker kan hem PER PLAAT overschrijven met het losse ν-veld (`nu`),
 * dat al door projectbestand, solverinvoer, MCP-veldpoort en -schema loopt.
 * De plaat blijft dan richtingsafhankelijk. Een waarde waarbij de
 * materiaalmatrix niet positief-definiet is (ν₁₂·ν₂₁ ≥ 1, met
 * ν₂₁ = ν₁₂·E₂/E₁) wordt hier al geweigerd — dezelfde grens als in
 * `core/fem/Triangle.ts`, maar dan vóór het rekenen, zodat paneel,
 * modelcontrole en MCP-poort hem ook zien.
 *
 * # OVERSCHRIJVEN
 *
 * De losse velden E, ν en ρ blijven bestaan als expliciete overschrijving
 * van het materiaal. Per veld:
 *
 *  - `rho` overschrijft alleen de volumieke massa (dus het eigen gewicht);
 *  - `nu`  overschrijft alleen ν₁₂;
 *  - `E`   overschrijft E₁ ÉN E₂ met dezelfde waarde, en daarmee vervalt de
 *          richtingsafhankelijkheid: G₁₂ volgt dan uit E en ν en de plaat is
 *          isotroop. Eén E kán immers geen twee richtingen beschrijven, en
 *          stilletjes alleen E₁ vervangen zou een plaat opleveren waarvan de
 *          dwarsrichting nog van het materiaal komt en de lengterichting
 *          niet.
 *
 * Elke uitkomst draagt daarom per grootheid een BRON ("materiaal" of
 * "handmatig"), die het eigenschappenpaneel en het rapport tonen.
 */
import {
  CONCRETE_E_CM,
  E_STAAL,
  NU_BETON,
  NU_STAAL,
  RHO_BETON,
  RHO_STAAL,
  TIMBER_E_MEAN,
  TIMBER_E90_MEAN,
  TIMBER_G_MEAN,
  TIMBER_RHO_MEAN,
} from "./sectionResolver";
import { STEEL_GRADES } from "./steelCheckBuilder";
import { matchSupportedConcreteClass } from "./betonCheckBuilder";
import { matchSupportedTimberGrade, SUPPORTED_TIMBER_GRADES } from "./timberCheckBuilder";
import { isCltProfiel, parseCltProfiel } from "./cltCheckBuilder";
import { isVrijMateriaal, parseVrijMateriaal } from "./vrijMateriaal";
import type { CltLayup } from "./types/timber/CltLayup";

/** Materiaalsoort van een plaat — dezelfde vijf soorten als bij een staaf. */
export type PlaatMateriaalSoort = "staal" | "beton" | "hout" | "clt" | "vrij";

/** Waar één stijfheidsgetal vandaan komt. */
export type PlaatBron =
  /** Uit de materiaalnaam en de bijbehorende normtabel. */
  | "materiaal"
  /** Uit het losse veld op de plaat — de gebruiker heeft het zelf ingevuld. */
  | "handmatig"
  /** Uit de standaardwaarde van de app, omdat noch materiaal noch gebruiker hem geeft. */
  | "standaard"
  /**
   * Een AANNAME van deze implementatie, geen normwaarde: ν₁₂ = 0 voor hout en
   * kruislaaghout, omdat NEN-EN 1995-1-1 en EN 338 geen dwarscontractie geven.
   */
  | "aanname";

/**
 * De stijfheid van een plaat zoals de solver hem gebruikt. Eenheden als in de
 * rest van de invoer: N/mm² en kg/m³, hoek in graden.
 */
export interface PlaatStijfheid {
  /** `null` wanneer de plaat geen materiaal draagt (het oude gedrag). */
  soort: PlaatMateriaalSoort | null;
  /** Leesbare naam voor paneel en rapport ("C24", "Natuursteen", "CLT C24 40/20/40"). */
  naam: string;
  /** Rekent deze plaat richtingsafhankelijk (E₁ ≠ E₂ of een eigen G₁₂)? */
  orthotroop: boolean;
  /** E in hoofdrichting 1 (N/mm²). */
  E1: number;
  /** E loodrecht op hoofdrichting 1 (N/mm²). */
  E2: number;
  /** Dwarscontractie ν₁₂ (rek in 2 door spanning in 1). */
  nu12: number;
  /** Glijdingsmodulus in het vlak (N/mm²). */
  G12: number;
  /** Volumieke massa (kg/m³) — stuurt het eigen gewicht ρ·t·A. */
  rho: number;
  /** Hoek van de globale x-as naar hoofdrichting 1, graden tegen de klok in. */
  hoekGraden: number;
  bronE: PlaatBron;
  bronNu: PlaatBron;
  bronRho: PlaatBron;
  /**
   * Waar G₁₂ vandaan komt. "bovengrens" alleen bij kruislaaghout met de
   * expliciete keuze `cltG12Bovengrens` (uitgesmeerde G_mean, niet
   * gereduceerd); "handmatig" bij `cltG12` met bron.
   */
  bronG12: PlaatBron | "bovengrens";
  /** Eén zin met de herkomst en het normartikel — voor paneel en rapport. */
  herkomst: string;
  /**
   * Waarschuwingen die bij deze stijfheid horen en APART getoond moeten
   * worden (paneel, rapport), bijvoorbeeld de niet-gereduceerde G₁₂ van
   * kruislaaghout. Leeg als er niets te melden is.
   */
  waarschuwingen: string[];
}

/** Uitkomst van de materiaalbepaling: gelukt, of geweigerd met reden. */
export type PlaatMateriaalUitkomst =
  | { ok: true; stijfheid: PlaatStijfheid }
  | { ok: false; reden: string };

/** De plaatvelden die de stijfheid bepalen — losgeknipt van het UI-type. */
export interface PlaatMateriaalInvoer {
  materiaal?: string;
  E?: number;
  nu?: number;
  rho?: number;
  hoofdrichting?: number;
  /** Kruislaaghout: G₁₂ in het vlak (N/mm²), alleen samen met `cltG12Bron`. */
  cltG12?: number;
  /** Kruislaaghout: herkomst van `cltG12` (productverklaring, ETA met tabel). */
  cltG12Bron?: string;
  /** Kruislaaghout: bewust de niet-gereduceerde G_mean als bovengrens gebruiken. */
  cltG12Bovengrens?: boolean;
}

// De standaardwaarden zonder materiaal zijn die van staal, net als
// PLATE_DEFAULTS: E = 210 000 N/mm², ν = 0,3 en ρ = 7850 kg/m³.
//
// BEWUST FUNCTIES EN GEEN MODULE-CONSTANTEN. Dit bestand zit met
// `sectionResolver`, de check-bouwers en `combinatieSelectie` in één
// importkring; een `const X = E_STAAL` op moduleniveau wordt dan soms
// uitgevoerd vóórdat `sectionResolver` klaar is met initialiseren, en dat
// geeft een "Cannot access before initialization" in willekeurige tests
// (gemeten). In een functielichaam wordt de waarde pas bij de aanroep
// gelezen, en dan is elke module af.
const nuStandaard = () => NU_STAAL;
const eStandaard = () => E_STAAL;
const rhoStandaard = () => RHO_STAAL;

/** Isotrope glijdingsmodulus G = E / (2(1+ν)). */
export function gIsotroop(E: number, nu: number): number {
  return E / (2 * (1 + nu));
}

/** Een getal dat werkelijk is ingevuld (en niet NaN of oneindig). */
function gegeven(v: number | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Voorbeelden van wat er wél begrepen wordt — gaat mee in elke weigering,
 * zodat de gebruiker niet hoeft te raden. Bewust de volledige lijst voor
 * staal, beton en hout: het zijn er weinig genoeg om te tonen, en een
 * afgekapte lijst laat juist de klasse weg die iemand zoekt.
 */
export function plaatMateriaalVoorbeelden(): string {
  return (
    `staal ${STEEL_GRADES.join(", ")}; ` +
    `beton ${Object.keys(CONCRETE_E_CM).join(", ")}; ` +
    `hout ${SUPPORTED_TIMBER_GRADES.join(", ")}; ` +
    `kruislaaghout "CLT C24 40/20/40/20/40"; ` +
    `vrij materiaal "VRIJ:<naam> E=<N/mm²> rho=<kg/m³> f=<N/mm²>"`
  );
}

/**
 * Plaatnaam voor kruislaaghout → opbouw. Accepteert zowel de staafvorm
 * ("CLT 40:C24/20:C24/40:C24") als de plaatvorm met een klasse vóór de
 * opbouw ("CLT C24 40/20/40"). `null` met een reden wanneer de naam niet
 * ontleed kan worden of een laag geen bekende sterkteklasse heeft.
 */
export function ontleedPlaatClt(
  naam: string,
): { layup: CltLayup; standaardKlasse: string | null } | { fout: string } {
  const m = /^\s*CLT\s*(.*)$/i.exec(naam);
  if (!m) return { fout: `"${naam}" is geen kruislaaghoutopbouw.` };
  const rest = m[1].trim();
  // Staat er een sterkteklasse vóór de opbouw ("C24 40/20/40")? Dan is dat de
  // standaardklasse voor elke laag die er zelf geen draagt.
  const eerste = rest.split(/\s+/)[0] ?? "";
  const klasse = matchSupportedTimberGrade(eerste);
  const opbouw = klasse !== null ? rest.slice(eerste.length).trim() : rest;
  if (opbouw === "") {
    return { fout: `kruislaaghout "${naam}" mist de laagopbouw, bijvoorbeeld "CLT C24 40/20/40".` };
  }
  // `parseCltProfiel` verwacht de staafvorm: "CLT <opbouw>[ b<breedte>]".
  // Zonder standaardklasse gaat er bewust een lege tekst in — dan blijft een
  // laag zonder eigen klasse herkenbaar leeg en wordt hij hieronder geweigerd
  // in plaats van stil op C24 gezet.
  const layup = parseCltProfiel(`CLT ${opbouw}`, klasse ?? "");
  if (!layup) {
    return {
      fout:
        `kruislaaghout "${naam}" is niet te lezen. Vorm: "CLT <klasse> <laagdiktes>", ` +
        `bijvoorbeeld "CLT C24 40/20/40/20/40"; een laag mag een eigen richting (L/D) ` +
        `en klasse dragen ("40L:C24") en "b=600" zet de strookbreedte.`,
    };
  }
  for (const laag of layup.layers) {
    if (matchSupportedTimberGrade(laag.strength_class) === null) {
      return {
        fout:
          laag.strength_class === ""
            ? `kruislaaghout "${naam}": geen sterkteklasse. Zet hem vóór de opbouw ` +
              `("CLT C24 40/20/40") of per laag ("40:C24"); er wordt geen klasse aangenomen.`
            : `kruislaaghout "${naam}": "${laag.strength_class}" is geen bekende sterkteklasse ` +
              `(${SUPPORTED_TIMBER_GRADES.join(", ")}).`,
      };
    }
  }
  return { layup, standaardKlasse: klasse };
}

/** Stijfheid in het vlak van een kruislaaghoutopbouw, uitgesmeerd over de dikte. */
export function cltVlakStijfheid(layup: CltLayup): {
  E1: number;
  E2: number;
  G12: number;
  rho: number;
} {
  let tTotaal = 0, tE1 = 0, tE2 = 0, tG = 0, tRho = 0;
  for (const laag of layup.layers) {
    const klasse = matchSupportedTimberGrade(laag.strength_class)!;
    const e0 = TIMBER_E_MEAN[klasse];
    const e90 = TIMBER_E90_MEAN[klasse];
    const g = TIMBER_G_MEAN[klasse];
    const rho = TIMBER_RHO_MEAN[klasse];
    const t = laag.thickness_mm;
    const langs = laag.orientation === "Longitudinal";
    tTotaal += t;
    tE1 += t * (langs ? e0 : e90);
    tE2 += t * (langs ? e90 : e0);
    tG += t * g;
    tRho += t * rho;
  }
  return { E1: tE1 / tTotaal, E2: tE2 / tTotaal, G12: tG / tTotaal, rho: tRho / tTotaal };
}

/** Wat een materiaalnaam oplevert vóór de losse velden en de G₁₂-keuze. */
interface PlaatBasis {
  soort: PlaatMateriaalSoort;
  naam: string;
  E1: number; E2: number; nu12: number; G12: number; rho: number;
  orthotroop: boolean;
  nuUitMateriaal: boolean;
  herkomst: string;
}

/**
 * Een materiaalnaam herkennen en de tabelgetallen erbij zoeken. Nog zonder de
 * losse velden en zonder de G₁₂-plicht van kruislaaghout: die komen in
 * `bepaalPlaatStijfheid`. `nu` is alleen nodig voor het vrije materiaal, dat
 * geen eigen ν in de naam draagt.
 */
function herkenPlaatBasis(naam: string, nu: number | undefined): PlaatBasis | { fout: string } {
  // Zelfde volgorde als `materiaalVanStaaf`: het vrije materiaal en de
  // kruislaaghoutopbouw eerst, want hun naam zou anders bij de verkeerde
  // tabel belanden.
  if (isVrijMateriaal(naam)) {
    const vrij = parseVrijMateriaal(naam);
    if (!vrij) {
      return {
        fout:
          `vrij materiaal "${naam}" is niet volledig. Vorm: ` +
          `"VRIJ:<naam> E=<N/mm²> rho=<kg/m³> f=<N/mm²>[ gM=<γ_M>]", ` +
          `bijvoorbeeld "VRIJ:Natuursteen E=60000 rho=2700 f=8".`,
      };
    }
    const nuVrij = gegeven(nu) ? nu : nuStandaard();
    return {
      soort: "vrij", naam: vrij.naam,
      E1: vrij.eMod, E2: vrij.eMod, nu12: nuVrij, G12: gIsotroop(vrij.eMod, nuVrij), rho: vrij.dichtheid,
      orthotroop: false, nuUitMateriaal: false,
      herkomst:
        `Vrij materiaal "${vrij.naam}": E = ${vrij.eMod} N/mm² en ρ = ${vrij.dichtheid} kg/m³ ` +
        `uit de materiaalnaam zelf (geen norm, geen tabel). Isotroop; ν is niet in de naam ` +
        `opgenomen en komt daarom uit het ν-veld van de plaat.`,
    };
  }
  if (isCltProfiel(naam)) {
    const uit = ontleedPlaatClt(naam);
    if ("fout" in uit) return { fout: uit.fout };
    const v = cltVlakStijfheid(uit.layup);
    const diktes = uit.layup.layers.map((l) => l.thickness_mm).join("/");
    return {
      soort: "clt", naam,
      // G12 is hier de uitgesmeerde G_mean — de BOVENGRENS. Of hij zo
      // gebruikt mag worden, beslist de G₁₂-plicht in `bepaalPlaatStijfheid`.
      E1: v.E1, E2: v.E2, nu12: 0, G12: v.G12, rho: v.rho,
      orthotroop: true, nuUitMateriaal: true,
      herkomst:
        `Kruislaaghout, opbouw ${diktes} mm: E₁ en E₂ zijn per laag over de dikte ` +
        `uitgesmeerd (E_0,mean langs de vezel, E_90,mean dwars — EN 338 / EN 14080); ` +
        `ρ eveneens. AANNAME ν₁₂ = 0: NEN-EN 1995-1-1 en EN 338 geven geen ` +
        `dwarscontractie voor hout.`,
    };
  }
  const beton = matchSupportedConcreteClass(naam);
  if (beton !== null) {
    const E = CONCRETE_E_CM[beton];
    // De twee lijsten (toetsbare klassen en E_cm-tabel) lopen vandaag gelijk.
    // Raken ze uit de pas, dan hoort dat op te vallen en niet als E = NaN de
    // stijfheidsmatrix in te glijden.
    if (!(E > 0)) {
      return { fout: `betonklasse "${beton}" staat niet in de E_cm-tabel (NEN-EN 1992-1-1 tabel 3.1).` };
    }
    return {
      soort: "beton", naam: beton,
      E1: E, E2: E, nu12: NU_BETON, G12: gIsotroop(E, NU_BETON), rho: RHO_BETON,
      orthotroop: false, nuUitMateriaal: true,
      herkomst:
        `Beton ${beton}: E = E_cm = ${E} N/mm² (NEN-EN 1992-1-1 tabel 3.1, ongescheurd), ` +
        `ν = ${NU_BETON} (3.1.3(4), ongescheurd beton) en ρ = ${RHO_BETON} kg/m³ voor ` +
        `gewapend beton (NEN-EN 1991-1-1 tabel A.1). Isotroop.`,
    };
  }
  const klasse = matchSupportedTimberGrade(naam);
  if (klasse !== null) {
    const e0 = TIMBER_E_MEAN[klasse];
    const e90 = TIMBER_E90_MEAN[klasse];
    const g = TIMBER_G_MEAN[klasse];
    // Zelfde reden als bij beton: een klasse die de toetslijst wél kent en
    // deze tabellen niet, hoort te weigeren in plaats van NaN te leveren.
    if (!(e0 > 0) || !(e90 > 0) || !(g > 0) || !(TIMBER_RHO_MEAN[klasse] > 0)) {
      return { fout: `sterkteklasse "${klasse}" mist E_0,mean, E_90,mean, G_mean of ρ_mean in de houttabellen (EN 338 / EN 14080).` };
    }
    return {
      soort: "hout", naam: klasse,
      E1: e0, E2: e90, nu12: 0, G12: g, rho: TIMBER_RHO_MEAN[klasse],
      orthotroop: true, nuUitMateriaal: true,
      herkomst:
        `Massief hout ${klasse}: E₁ = E_0,mean = ${e0} N/mm² langs de vezel, ` +
        `E₂ = E_90,mean = ${e90} N/mm² dwars en G₁₂ = G_mean = ${g} N/mm² ` +
        `(EN 338 / EN 14080, dezelfde getallen als de toetsingskern); ` +
        `ρ = ρ_mean = ${TIMBER_RHO_MEAN[klasse]} kg/m³. AANNAME ν₁₂ = 0: ` +
        `NEN-EN 1995-1-1 en EN 338 geven geen dwarscontractie voor hout.`,
    };
  }
  if (STEEL_GRADES.includes(naam.toUpperCase())) {
    return {
      soort: "staal", naam: naam.toUpperCase(),
      E1: E_STAAL, E2: E_STAAL, nu12: NU_STAAL,
      G12: gIsotroop(E_STAAL, NU_STAAL), rho: RHO_STAAL,
      orthotroop: false, nuUitMateriaal: true,
      herkomst:
        `Staal ${naam.toUpperCase()}: E = ${E_STAAL} N/mm² en ν = ${NU_STAAL} ` +
        `(NEN-EN 1993-1-1 3.2.6(1)), ρ = ${RHO_STAAL} kg/m³ ` +
        `(NEN-EN 1991-1-1 tabel A.4). Isotroop; de staalsoort bepaalt de sterkte, ` +
        `niet de stijfheid.`,
    };
  }
  return {
    fout:
      `materiaal "${naam}" wordt niet herkend. Bekend zijn: ${plaatMateriaalVoorbeelden()}. ` +
      `Laat het veld leeg om met de losse E, ν en ρ te rekenen; er wordt geen ` +
      `materiaal aangenomen.`,
  };
}

/** Is er iets van de G₁₂-invoer van kruislaaghout ingevuld? */
function heeftCltG12Invoer(p: PlaatMateriaalInvoer): boolean {
  return p.cltG12 !== undefined
    || (p.cltG12Bron !== undefined && p.cltG12Bron.trim() !== "")
    || p.cltG12Bovengrens === true;
}

/**
 * De materiaalsoort van een plaat zonder de rest van de bepaling: "clt" voor
 * een leesbare kruislaaghoutopbouw, ook als de G₁₂-invoer nog ontbreekt.
 * `null` zonder materiaal, "onbekend" als de naam niet herkend wordt. Voor
 * wie alleen wil weten WAT voor plaat het is (kruipgedrag, paneel), zodat een
 * ontbrekende G₁₂ een kruislaaghouten wand niet tot "onbekend materiaal"
 * maakt.
 */
export function plaatMateriaalSoort(materiaal: string | undefined): PlaatMateriaalSoort | null | "onbekend" {
  const naam = (materiaal ?? "").trim();
  if (naam === "") return null;
  const basis = herkenPlaatBasis(naam, undefined);
  return "fout" in basis ? "onbekend" : basis.soort;
}

/**
 * De stijfheid en de volumieke massa waarmee een plaat rekent.
 *
 * Zonder `materiaal` is dit het gedrag van vóór september 2026: isotroop met
 * E, ν en ρ van de plaat zelf (of de staaldefaults). Mét `materiaal` komen de
 * getallen uit de normtabellen, tenzij de plaat ze expliciet overschrijft.
 * Een materiaal dat niet herkend wordt levert een WEIGERING met reden op; er
 * wordt nooit stil op staal teruggevallen. Kruislaaghout weigert bovendien
 * zonder G₁₂-keuze (zie de kop van dit bestand).
 */
export function bepaalPlaatStijfheid(p: PlaatMateriaalInvoer): PlaatMateriaalUitkomst {
  const hoekGraden = gegeven(p.hoofdrichting) ? p.hoofdrichting : 0;
  const naam = (p.materiaal ?? "").trim();

  // ── Geen materiaal: precies het oude gedrag ────────────────────────────
  if (naam === "") {
    if (heeftCltG12Invoer(p)) {
      return {
        ok: false,
        reden:
          `cltG12, cltG12Bron en cltG12Bovengrens horen alleen bij kruislaaghout, maar deze ` +
          `plaat heeft geen materiaal. Kies een kruislaaghoutopbouw ("CLT C24 40/20/40") of ` +
          `laat de G₁₂-velden leeg; ze worden niet stil genegeerd.`,
      };
    }
    const E = gegeven(p.E) ? p.E : eStandaard();
    const nu = gegeven(p.nu) ? p.nu : nuStandaard();
    const rho = gegeven(p.rho) ? p.rho : rhoStandaard();
    return {
      ok: true,
      stijfheid: {
        soort: null,
        naam: "—",
        orthotroop: false,
        E1: E, E2: E, nu12: nu, G12: gIsotroop(E, nu), rho,
        hoekGraden,
        bronE: gegeven(p.E) ? "handmatig" : "standaard",
        bronNu: gegeven(p.nu) ? "handmatig" : "standaard",
        bronRho: gegeven(p.rho) ? "handmatig" : "standaard",
        // Isotroop: G = E/(2(1+ν)) volgt uit E, dus ook de herkomst.
        bronG12: gegeven(p.E) ? "handmatig" : "standaard",
        herkomst:
          "Geen materiaal gekozen: de plaat rekent isotroop met de ingevoerde " +
          "E, ν en ρ (standaard staal 210 000 N/mm², 0,3 en 7850 kg/m³).",
        waarschuwingen: [],
      },
    };
  }

  const basis = herkenPlaatBasis(naam, p.nu);
  if ("fout" in basis) return { ok: false, reden: basis.fout };

  // ── Overschrijven met de losse velden ─────────────────────────────────
  const nuOverschreven = gegeven(p.nu);
  const eOverschreven = gegeven(p.E);
  const rhoOverschreven = gegeven(p.rho);

  const nu12 = nuOverschreven ? p.nu! : basis.nu12;
  // Een handmatige E vervangt BEIDE richtingen: één getal kan er geen twee
  // beschrijven, en dan is de plaat per definitie isotroop.
  const E1 = eOverschreven ? p.E! : basis.E1;
  const E2 = eOverschreven ? p.E! : basis.E2;
  const orthotroop = eOverschreven ? false : basis.orthotroop;
  const rho = rhoOverschreven ? p.rho! : basis.rho;

  // ── G₁₂ ───────────────────────────────────────────────────────────────
  const waarschuwingen: string[] = [];
  const g12Aanvulling: string[] = [];
  let G12: number;
  let bronG12: PlaatStijfheid["bronG12"];
  if (heeftCltG12Invoer(p) && basis.soort !== "clt") {
    return {
      ok: false,
      reden:
        `cltG12, cltG12Bron en cltG12Bovengrens horen alleen bij kruislaaghout; materiaal ` +
        `"${naam}" is dat niet. Laat de G₁₂-velden leeg; ze worden niet stil genegeerd.`,
    };
  }
  if (eOverschreven || !basis.orthotroop) {
    if (heeftCltG12Invoer(p)) {
      return {
        ok: false,
        reden:
          `E is handmatig gezet, dus de plaat rekent isotroop met G = E/(2(1+ν)); de ` +
          `G₁₂-invoer van kruislaaghout zou dan niets doen. Laat óf E óf de G₁₂-velden leeg.`,
      };
    }
    G12 = gIsotroop(E1, nu12);
    bronG12 = eOverschreven ? "handmatig" : "materiaal";
  } else if (basis.soort === "clt") {
    const heeftWaarde = p.cltG12 !== undefined;
    const bron = (p.cltG12Bron ?? "").trim();
    const bovengrens = p.cltG12Bovengrens === true;
    const bovengrensTekst = Math.round(basis.G12 * 10) / 10;
    if (heeftWaarde && bovengrens) {
      return {
        ok: false,
        reden:
          `kruislaaghout "${naam}": cltG12 en cltG12Bovengrens zijn allebei gezet. Kies één: ` +
          `de G₁₂ uit de productverklaring met bron, óf bewust de niet-gereduceerde bovengrens.`,
      };
    }
    if (heeftWaarde) {
      if (!gegeven(p.cltG12) || !(p.cltG12 > 0)) {
        return {
          ok: false,
          reden: `kruislaaghout "${naam}": cltG12 moet een positief getal in N/mm² zijn (kreeg ${String(p.cltG12)}).`,
        };
      }
      if (bron === "") {
        return {
          ok: false,
          reden:
            `kruislaaghout "${naam}": cltG12 = ${p.cltG12} N/mm² is opgegeven zonder cltG12Bron. ` +
            `Een waarde zonder herkomst is in het rapport niet van een aanname te onderscheiden; ` +
            `noem de productverklaring of de ETA met tabel, bijvoorbeeld "ETA-00/0000, tabel 3".`,
        };
      }
      G12 = p.cltG12;
      bronG12 = "handmatig";
      g12Aanvulling.push(
        `G₁₂ = ${p.cltG12} N/mm² in het vlak, volgens ${bron}.`,
      );
      if (p.cltG12 > basis.G12) {
        waarschuwingen.push(
          `G₁₂ = ${p.cltG12} N/mm² is groter dan de uitgesmeerde G_mean van de lamellen ` +
          `(${bovengrensTekst} N/mm²), terwijl de afschuiving in het vlak van kruislaaghout ` +
          `daaronder hoort te liggen. Controleer de waarde in ${bron}.`,
        );
      }
    } else if (bron !== "") {
      return {
        ok: false,
        reden: `kruislaaghout "${naam}": cltG12Bron "${bron}" is opgegeven zonder cltG12.`,
      };
    } else if (bovengrens) {
      G12 = basis.G12;
      bronG12 = "bovengrens";
      g12Aanvulling.push(
        `G₁₂ = Σt·G_mean/Σt = ${bovengrensTekst} N/mm², op verzoek als BOVENGRENS gebruikt ` +
        `(niet gereduceerd).`,
      );
      waarschuwingen.push(
        `G₁₂ van kruislaaghout is de uitgesmeerde G_mean (${bovengrensTekst} N/mm²) ZONDER ` +
        `reductie voor de niet-verlijmde smalle zijden en de wringing in de kruisingsvlakken: ` +
        `een bovengrens, de schijf is in afschuiving te stijf. NEN-EN 1995-1-1 geeft die ` +
        `reductie niet; vul voor een onderbouwde waarde cltG12 met bron in.`,
      );
    } else {
      return {
        ok: false,
        reden:
          `kruislaaghout "${naam}": G₁₂ in het vlak ontbreekt. NEN-EN 1995-1-1 en EN 338 geven ` +
          `geen glijdingsmodulus in het vlak voor een gekruiste opbouw — de uitgesmeerde G_mean ` +
          `(${bovengrensTekst} N/mm²) is zonder reductie voor de kruisingsvlakken een ` +
          `bovengrens — en er wordt geen reductie aangenomen. Vul cltG12 (N/mm²) met cltG12Bron ` +
          `in uit de productverklaring of de ETA, of kies bewust cltG12Bovengrens.`,
      };
    }
  } else {
    // Massief hout: G_mean uit EN 338 / EN 14080 is de glijdingsmodulus van
    // het materiaal zelf, zonder kruisingsvlakken.
    G12 = basis.G12;
    bronG12 = "materiaal";
  }

  // ── Dwarscontractie: positief-definiet? ────────────────────────────────
  // Dezelfde grens als `orthotropeVlakspanning` in core/fem/Triangle.ts, maar
  // hier al, zodat paneel, modelcontrole en MCP-poort hem zien vóór er
  // gerekend wordt.
  if (orthotroop) {
    const nu21 = (nu12 * E2) / E1;
    if (!(1 - nu12 * nu21 > 0)) {
      return {
        ok: false,
        reden:
          `ν₁₂ = ${nu12} is onmogelijk bij E₁ = ${Math.round(E1)} en E₂ = ${Math.round(E2)} N/mm²: ` +
          `ν₁₂·ν₂₁ ≥ 1, de materiaalmatrix is dan niet positief-definiet. ` +
          `Er moet gelden ν₁₂ < √(E₁/E₂) = ${Math.sqrt(E1 / E2).toFixed(3)}.`,
      };
    }
  }

  const aanvullingen: string[] = [...g12Aanvulling];
  if (eOverschreven) {
    aanvullingen.push(
      `E is handmatig op ${p.E} N/mm² gezet: die waarde geldt in BEIDE richtingen, ` +
      `dus de plaat rekent isotroop en de richtingsafhankelijkheid van het materiaal vervalt.`,
    );
  }
  // Hout en kruislaaghout: ν₁₂ = 0 is een aanname, geen tabelwaarde.
  const nuAanname = basis.soort === "hout" || basis.soort === "clt";
  if (nuOverschreven && nuAanname) {
    aanvullingen.push(
      `ν₁₂ is handmatig op ${p.nu} gezet in plaats van de aanname ν₁₂ = 0; de plaat blijft ` +
      `richtingsafhankelijk (ν₂₁ = ν₁₂·E₂/E₁).`,
    );
  } else if (nuOverschreven && basis.nuUitMateriaal) {
    aanvullingen.push(`ν is handmatig op ${p.nu} gezet in plaats van de materiaalwaarde.`);
  }
  if (rhoOverschreven) {
    aanvullingen.push(`ρ is handmatig op ${p.rho} kg/m³ gezet; het eigen gewicht volgt die waarde.`);
  }

  return {
    ok: true,
    stijfheid: {
      soort: basis.soort,
      naam: basis.naam,
      orthotroop,
      E1, E2, nu12, G12, rho,
      hoekGraden,
      bronE: eOverschreven ? "handmatig" : "materiaal",
      bronNu: nuOverschreven ? "handmatig"
        : nuAanname ? "aanname"
        : basis.nuUitMateriaal ? "materiaal" : "standaard",
      bronRho: rhoOverschreven ? "handmatig" : "materiaal",
      bronG12,
      herkomst: [basis.herkomst, ...aanvullingen].join(" "),
      waarschuwingen,
    },
  };
}

/**
 * Het materiaal van een plaat keuren zonder de stijfheid te willen: geeft de
 * reden terug waarom het geweigerd wordt, of `null` als het goed is. Voor de
 * modelvalidatie (`valideerModel`, `modelControle`) en het
 * eigenschappenpaneel, zodat die niet elk hun eigen oordeel vellen.
 *
 * Neemt de HELE plaat (of in elk geval de materiaalvelden): de G₁₂-plicht van
 * kruislaaghout en de grens op ν₁₂ hangen van meer af dan de naam. Een losse
 * naam mag nog, voor wie alleen die wil keuren — dan geldt de G₁₂-plicht
 * gewoon, want een kruislaaghoutnaam zonder G₁₂-keuze rekent niet.
 */
export function keurPlaatMateriaal(invoer: string | undefined | PlaatMateriaalInvoer): string | null {
  const p = typeof invoer === "object" && invoer !== null ? invoer : { materiaal: invoer };
  const uit = bepaalPlaatStijfheid(p);
  return uit.ok ? null : uit.reden;
}

/** Korte weergave voor tabel en rapport: "C24 (hout)", "—" zonder materiaal. */
export function plaatMateriaalLabel(s: PlaatStijfheid): string {
  if (s.soort === null) return "—";
  const soortNaam: Record<PlaatMateriaalSoort, string> = {
    staal: "staal", beton: "beton", hout: "hout",
    clt: "kruislaaghout", vrij: "vrij materiaal",
  };
  return `${s.naam} (${soortNaam[s.soort]})`;
}

/**
 * Spanning van de globale assen (σx, σy, τxy) naar de MATERIAALASSEN
 * (σ₁, σ₂, τ₁₂) van een plaat met hoofdrichting θ — de hoek van de globale
 * x-as naar richting 1, tegen de klok in, dezelfde θ als in de materiaalmatrix
 * van `core/fem/Triangle.ts`.
 *
 * WAAROM. Een houttoets kijkt naar de spanning LANGS en DWARS op de vezel
 * (NEN-EN 1995-1-1 6.1.2 en 6.1.3 met f_t,0 en f_t,90, 6.1.7 met f_v): die
 * sterktes horen bij de materiaalassen, niet bij de globale assen van het
 * model. Bij hoofdrichting 0° vallen beide samen; bij elke andere hoek niet.
 *
 * De spanningstransformatie is Tσ(θ) · {σx, σy, τxy}, de tegenhanger van de
 * rektransformatie Tε van de materiaalmatrix (Tσ⁻¹ = Tεᵀ). Met c = cos θ en
 * s = sin θ:
 *
 *     σ₁  = σx·c² + σy·s² + 2·τxy·s·c
 *     σ₂  = σx·s² + σy·c² − 2·τxy·s·c
 *     τ₁₂ = (σy − σx)·s·c + τxy·(c² − s²)
 *
 * Twee invarianten volgen er direct uit en worden getest: σ₁ + σ₂ = σx + σy,
 * en σ₁·σ₂ − τ₁₂² = σx·σy − τxy².
 */
export function spanningInMateriaalassen(
  sigmaX: number,
  sigmaY: number,
  tauXY: number,
  hoekGraden: number,
): { sigma1: number; sigma2: number; tau12: number } {
  const theta = (hoekGraden * Math.PI) / 180;
  const c = Math.cos(theta), s = Math.sin(theta);
  return {
    sigma1: sigmaX * c * c + sigmaY * s * s + 2 * tauXY * s * c,
    sigma2: sigmaX * s * s + sigmaY * c * c - 2 * tauXY * s * c,
    tau12: (sigmaY - sigmaX) * s * c + tauXY * (c * c - s * s),
  };
}

/**
 * Min/max van σ₁, σ₂ en τ₁₂ over de elementen van één plaat, plus de hoek
 * waarin ze zijn uitgedrukt — het `materiaalassen`-blok van een plaatresultaat.
 * Elementen zonder materiaalasspanning tellen niet mee; zonder elementen
 * staan de grenzen op 0 (zelfde afspraak als de globale ranges).
 */
export function materiaalasRanges(
  elementen: readonly { materiaalassen?: { sigma1: number; sigma2: number; tau12: number } }[],
  hoekGraden: number,
): {
  hoekGraden: number;
  ranges: Record<"sigma1" | "sigma2" | "tau12", { min: number; max: number }>;
} {
  const mk = () => ({ min: Infinity, max: -Infinity });
  const ranges = { sigma1: mk(), sigma2: mk(), tau12: mk() };
  for (const el of elementen) {
    const m = el.materiaalassen;
    if (!m) continue;
    for (const k of ["sigma1", "sigma2", "tau12"] as const) {
      if (m[k] < ranges[k].min) ranges[k].min = m[k];
      if (m[k] > ranges[k].max) ranges[k].max = m[k];
    }
  }
  for (const r of Object.values(ranges)) {
    if (!Number.isFinite(r.min)) { r.min = 0; r.max = 0; }
  }
  return { hoekGraden, ranges };
}
