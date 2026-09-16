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
 * Voor G₁₂ wordt dezelfde uitsmering gebruikt (Σ t_i·G_mean,i / Σ t_i).
 * EXPLICIETE BEPERKING: NEN-EN 1995-1-1 kent kruislaaghout niet als apart
 * product (zie de kop van `clt.rs`), en de afschuiving in het VLAK van een
 * kruislaaghouten schijf wordt in de vakliteratuur met een reductie voor de
 * wringing in de kruisingsvlakken gerekend. Die reductiefactor staat niet in
 * de norm en wordt hier dus niet verzonnen: G₁₂ is de uitgesmeerde G_mean,
 * zonder reductie, en dat is een BOVENGRENS voor de schuifstijfheid. Het
 * rapport zegt dat erbij. Zolang platen niet getoetst worden raakt dit
 * alleen de stijfheidsverdeling; vóór er een plaattoets komt hoort hier een
 * onderbouwde waarde te staan.
 *
 * # DWARSCONTRACTIE VAN HOUT
 *
 * NEN-EN 1995-1-1 geeft geen dwarscontractiecoëfficiënt, en EN 338 evenmin.
 * Hem uit de literatuur overnemen zou een verzonnen normwaarde zijn. Daarom
 * ν₁₂ = 0 voor hout en kruislaaghout: de normaalspanningen in de twee
 * hoofdrichtingen zijn dan ontkoppeld. Dat is een AANNAME van deze
 * implementatie, geen normwaarde, en ze staat als zodanig in het rapport.
 * De gebruiker kan hem overschrijven met het losse ν-veld van de plaat.
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
  | "standaard";

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
  /** Eén zin met de herkomst en het normartikel — voor paneel en rapport. */
  herkomst: string;
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

/**
 * De stijfheid en de volumieke massa waarmee een plaat rekent.
 *
 * Zonder `materiaal` is dit het gedrag van vóór september 2026: isotroop met
 * E, ν en ρ van de plaat zelf (of de staaldefaults). Mét `materiaal` komen de
 * getallen uit de normtabellen, tenzij de plaat ze expliciet overschrijft.
 * Een materiaal dat niet herkend wordt levert een WEIGERING met reden op; er
 * wordt nooit stil op staal teruggevallen.
 */
export function bepaalPlaatStijfheid(p: PlaatMateriaalInvoer): PlaatMateriaalUitkomst {
  const hoekGraden = gegeven(p.hoofdrichting) ? p.hoofdrichting : 0;
  const naam = (p.materiaal ?? "").trim();

  // ── Geen materiaal: precies het oude gedrag ────────────────────────────
  if (naam === "") {
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
        herkomst:
          "Geen materiaal gekozen: de plaat rekent isotroop met de ingevoerde " +
          "E, ν en ρ (standaard staal 210 000 N/mm², 0,3 en 7850 kg/m³).",
      },
    };
  }

  // ── Materiaal herkennen. Zelfde volgorde als `materiaalVanStaaf`: het
  //    vrije materiaal en de kruislaaghoutopbouw eerst, want hun naam zou
  //    anders bij de verkeerde tabel belanden. ─────────────────────────────
  let basis: {
    soort: PlaatMateriaalSoort;
    naam: string;
    E1: number; E2: number; nu12: number; G12: number; rho: number;
    orthotroop: boolean;
    nuUitMateriaal: boolean;
    herkomst: string;
  };

  if (isVrijMateriaal(naam)) {
    const vrij = parseVrijMateriaal(naam);
    if (!vrij) {
      return {
        ok: false,
        reden:
          `vrij materiaal "${naam}" is niet volledig. Vorm: ` +
          `"VRIJ:<naam> E=<N/mm²> rho=<kg/m³> f=<N/mm²>[ gM=<γ_M>]", ` +
          `bijvoorbeeld "VRIJ:Natuursteen E=60000 rho=2700 f=8".`,
      };
    }
    const nu = gegeven(p.nu) ? p.nu : nuStandaard();
    basis = {
      soort: "vrij", naam: vrij.naam,
      E1: vrij.eMod, E2: vrij.eMod, nu12: nu, G12: gIsotroop(vrij.eMod, nu), rho: vrij.dichtheid,
      orthotroop: false, nuUitMateriaal: false,
      herkomst:
        `Vrij materiaal "${vrij.naam}": E = ${vrij.eMod} N/mm² en ρ = ${vrij.dichtheid} kg/m³ ` +
        `uit de materiaalnaam zelf (geen norm, geen tabel). Isotroop; ν is niet in de naam ` +
        `opgenomen en komt daarom uit het ν-veld van de plaat.`,
    };
  } else if (isCltProfiel(naam)) {
    const uit = ontleedPlaatClt(naam);
    if ("fout" in uit) return { ok: false, reden: uit.fout };
    const v = cltVlakStijfheid(uit.layup);
    const diktes = uit.layup.layers.map((l) => l.thickness_mm).join("/");
    basis = {
      soort: "clt", naam,
      E1: v.E1, E2: v.E2, nu12: 0, G12: v.G12, rho: v.rho,
      orthotroop: true, nuUitMateriaal: true,
      herkomst:
        `Kruislaaghout, opbouw ${diktes} mm: E₁ en E₂ zijn per laag over de dikte ` +
        `uitgesmeerd (E_0,mean langs de vezel, E_90,mean dwars — EN 338 / EN 14080), ` +
        `G₁₂ eveneens (Σt·G_mean/Σt, ZONDER reductie voor de wringing in de ` +
        `kruisingsvlakken: NEN-EN 1995-1-1 kent kruislaaghout niet als product en geeft ` +
        `die reductie niet — G₁₂ is dus een bovengrens). ν₁₂ = 0, want de norm geeft ` +
        `geen dwarscontractie voor hout.`,
    };
  } else if (matchSupportedConcreteClass(naam) !== null) {
    const klasse = matchSupportedConcreteClass(naam)!;
    const E = CONCRETE_E_CM[klasse];
    // De twee lijsten (toetsbare klassen en E_cm-tabel) lopen vandaag gelijk.
    // Raken ze uit de pas, dan hoort dat op te vallen en niet als E = NaN de
    // stijfheidsmatrix in te glijden.
    if (!(E > 0)) {
      return { ok: false, reden: `betonklasse "${klasse}" staat niet in de E_cm-tabel (NEN-EN 1992-1-1 tabel 3.1).` };
    }
    const nu = NU_BETON;
    basis = {
      soort: "beton", naam: klasse,
      E1: E, E2: E, nu12: nu, G12: gIsotroop(E, nu), rho: RHO_BETON,
      orthotroop: false, nuUitMateriaal: true,
      herkomst:
        `Beton ${klasse}: E = E_cm = ${E} N/mm² (NEN-EN 1992-1-1 tabel 3.1, ongescheurd), ` +
        `ν = ${NU_BETON} (3.1.3(4), ongescheurd beton) en ρ = ${RHO_BETON} kg/m³ voor ` +
        `gewapend beton (NEN-EN 1991-1-1 tabel A.1). Isotroop.`,
    };
  } else if (matchSupportedTimberGrade(naam) !== null) {
    const klasse = matchSupportedTimberGrade(naam)!;
    const e0 = TIMBER_E_MEAN[klasse];
    const e90 = TIMBER_E90_MEAN[klasse];
    const g = TIMBER_G_MEAN[klasse];
    // Zelfde reden als bij beton: een klasse die de toetslijst wél kent en
    // deze tabellen niet, hoort te weigeren in plaats van NaN te leveren.
    if (!(e0 > 0) || !(e90 > 0) || !(g > 0) || !(TIMBER_RHO_MEAN[klasse] > 0)) {
      return { ok: false, reden: `sterkteklasse "${klasse}" mist E_0,mean, E_90,mean, G_mean of ρ_mean in de houttabellen (EN 338 / EN 14080).` };
    }
    basis = {
      soort: "hout", naam: klasse,
      E1: e0, E2: e90, nu12: 0, G12: g, rho: TIMBER_RHO_MEAN[klasse],
      orthotroop: true, nuUitMateriaal: true,
      herkomst:
        `Massief hout ${klasse}: E₁ = E_0,mean = ${e0} N/mm² langs de vezel, ` +
        `E₂ = E_90,mean = ${e90} N/mm² dwars en G₁₂ = G_mean = ${g} N/mm² ` +
        `(EN 338 / EN 14080, dezelfde getallen als de toetsingskern); ` +
        `ρ = ρ_mean = ${TIMBER_RHO_MEAN[klasse]} kg/m³. ν₁₂ = 0, want de norm geeft ` +
        `geen dwarscontractie voor hout.`,
    };
  } else if (STEEL_GRADES.includes(naam.toUpperCase())) {
    basis = {
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
  } else {
    return {
      ok: false,
      reden:
        `materiaal "${naam}" wordt niet herkend. Bekend zijn: ${plaatMateriaalVoorbeelden()}. ` +
        `Laat het veld leeg om met de losse E, ν en ρ te rekenen; er wordt geen ` +
        `materiaal aangenomen.`,
    };
  }

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
  const G12 = eOverschreven || !basis.orthotroop
    ? gIsotroop(E1, nu12)
    : basis.G12;
  const rho = rhoOverschreven ? p.rho! : basis.rho;

  const aanvullingen: string[] = [];
  if (eOverschreven) {
    aanvullingen.push(
      `E is handmatig op ${p.E} N/mm² gezet: die waarde geldt in BEIDE richtingen, ` +
      `dus de plaat rekent isotroop en de richtingsafhankelijkheid van het materiaal vervalt.`,
    );
  }
  if (nuOverschreven && basis.nuUitMateriaal) {
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
      bronNu: nuOverschreven ? "handmatig" : basis.nuUitMateriaal ? "materiaal" : "standaard",
      bronRho: rhoOverschreven ? "handmatig" : "materiaal",
      herkomst: [basis.herkomst, ...aanvullingen].join(" "),
    },
  };
}

/**
 * De materiaalnaam van een plaat keuren zonder de stijfheid te willen: geeft
 * de reden terug waarom hij geweigerd wordt, of `null` als hij goed is. Voor
 * de modelvalidatie (`valideerModel`) en het eigenschappenpaneel, zodat die
 * niet elk hun eigen oordeel vellen.
 */
export function keurPlaatMateriaal(materiaal: string | undefined): string | null {
  const uit = bepaalPlaatStijfheid({ materiaal });
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
