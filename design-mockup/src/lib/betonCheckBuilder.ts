/**
 * betonCheckBuilder.ts — bouwt ConcreteBeamCheckInput[] voor de kern-opdracht
 * `check_concrete_beams` (NEN-EN 1992-1-1) — spiegel van timberCheckBuilder,
 * aangesloten op het design-mockup datamodel.
 *
 * Herkenning in dit datamodel:
 *  - Een staaf is beton wanneer `beam.material` een betonsterkteklasse uit
 *    tabel 3.1 is ("C30/37", of kort "C30"). De lijst komt runtime uit de
 *    kern-opdracht `list_concrete_classes`; de statische lijst hieronder is
 *    de browser-fallback en moet daarmee overeenkomen.
 *  - De doorsnede komt uit de profielnaam: "300x500" voor een rechthoek,
 *    "T 400x450 bw=200 hf=50" voor een T- of L-ligger. Dit model slaat geen
 *    numerieke doorsnede-eigenschappen per staaf op, dus de naam is de enige
 *    bron — en een naam die niet parseert levert een REDEN, geen stille
 *    afkeur. Zie `parseConcreteSection`.
 *  - Bij een T of L is de flensbreedte in het verzoek de MEEWERKENDE breedte
 *    b_eff van 5.3.2.1(3), niet de ingevoerde flensbreedte — mits de
 *    aanroeper hem meelevert in `bEffPerStaaf`. De kern leidt hem af
 *    (`concrete_effective_flange_width`), de liggerlijn komt uit
 *    `beffLiggerlijn.ts`, en de gebruikte waarde staat daarna in
 *    `section_name` en in de aanname-tekst van het resultaat.
 *  - De wapeningskorf komt NIET uit `beam` (dat veld bestaat daar nog niet)
 *    maar uit de map `korven` die de aanroeper meegeeft, gesleuteld op
 *    staaf-id. Een betonstaaf zonder korf wordt overgeslagen met reden: een
 *    stilzwijgend aangenomen standaardkorf zou een toetsuitkomst zonder
 *    invoer zijn. Zie `components/beton/` voor het korfmodel en de editor.
 *
 * Gedocumenteerde defaults: wapeningsstaal B500B; 50 stroken; horizontale
 * bovenste tak (3.2.7(2)b); blijvende/tijdelijke ontwerpsituatie; minimale
 * excentriciteit 6.1(4) aan.
 *
 * TWEE GRENSTOESTANDEN, DRIE OMHULLENDEN
 *
 * `forces_envelope` draagt de UGT-combinaties en voedt §6.1 (buiging), §6.2
 * (dwarskracht), §7.4.2 (slankheid) en §9.2 (detaillering).
 * `sls_frequent_envelope` draagt de FREQUENTE BGT-combinatie — NEN-EN 1990
 * uitdrukking (6.15) — en voedt uitsluitend §7.3 (scheurbeheersing). De
 * nationale bijlage bij 7.3.1(5) vervangt tabel 7.1N door een tabel waarvan
 * alle kolommen die frequente combinatie noemen, waar de EN-tekst de
 * quasi-blijvende noemt; de scheurwijdte hoort dus onder (6.15) te worden
 * getoetst en onder niets anders.
 *
 * De frequente combinatie wordt op NAAM herkend, net als de quasi-blijvende
 * in `timberCheckBuilder`. Er is met opzet GEEN terugval op een andere
 * BGT-combinatie: de karakteristieke (6.14) als frequent lezen zou een te
 * hoge σ_s en dus een te hoge scheurwijdte geven, en de quasi-blijvende
 * (6.16) een te lage — beide zonder enig signaal. Ontbreekt de combinatie of
 * heeft de solver haar voor deze staaf niet doorgerekend, dan gaat er een
 * LEGE lijst mee en meldt de kern in het rapport dat §7.3 niet is uitgevoerd,
 * met de reden.
 *
 * `sls_quasi_permanent_envelope` is de DERDE, en zij hoort bij §5.8.4: M₀Eqp
 * in (5.19) is het eerste-orde-moment onder de QUASI-BLIJVENDE combinatie
 * (6.16). Dat is precies de combinatie die §7.3 in Nederland NIET gebruikt, en
 * dat maakt de twee onverwisselbaar: de frequente als quasi-blijvende lezen
 * geeft een te grote φ_ef en dus een te lage λ_lim, andersom een te hoge.
 * Ook zij wordt op naam herkend en heeft geen terugval.
 *
 * §5.8 ZELF — GESCHOORD IS INVOER
 *
 * Naast die derde omhullende reist het blok `column` mee: het ontwerpbesluit
 * geschoord/ongeschoord (§5.8.1), de kniklengte, φ(∞,t₀) en de twee keuzen van
 * §9.5. Het komt uit `checkConfig.betonKolom` van de staaf en wordt hier niet
 * afgeleid. Welke staaf de app als KOLOM aanbiedt is een andere vraag; die
 * beantwoordt het invoerscherm met `isOverwegendVerticaal` (75° t.o.v. de
 * horizontaal, dezelfde drempel als `bepaalStandaardRol`). Of §5.8 werkelijk
 * van toepassing is, beslist de kern uit de normaalDRUK — een schuine schoor
 * met 400 kN druk is voor §5.8 net zo goed een op druk belast element.
 */
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { ConcreteBeamCheckInput } from "./types/concrete/ConcreteBeamCheckInput";
import type { ConcreteColumnInput } from "./types/concrete/ConcreteColumnInput";
import type { ConcreteSectionInput } from "./types/concrete/ConcreteSectionInput";
import type { ConcreteShape } from "./types/concrete/ConcreteShape";
import type { ExposureClass } from "./types/concrete/ExposureClass";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";
import type { StructuralSystem } from "./types/concrete/StructuralSystem";
import type { SteelBranch } from "./types/concrete/SteelBranch";
import type { CheckSkip } from "./checkTypes";
import { isSteelProfile, beamLengthMm, buildForcesEnvelope } from "./steelCheckBuilder";

/**
 * Betonsterkteklassen die de Rust EN 1992-kern kent (nen-en-1992-1-1/data.rs,
 * tabel 3.1). Browser-fallback voor `list_concrete_classes`.
 */
export const SUPPORTED_CONCRETE_CLASSES = [
  "C12/15", "C16/20", "C20/25", "C25/30", "C30/37", "C35/45", "C40/50",
  "C45/55", "C50/60", "C55/67", "C60/75", "C70/85", "C80/95", "C90/105",
] as const;

/** Wapeningsstaal dat de kern kent (bijlage C, klasse A/B/C). */
export const SUPPORTED_REINFORCEMENT_GRADES = ["B500A", "B500B", "B500C"] as const;

/** Standaard wapeningsstaal voor staven in Nederland. */
export const DEFAULT_REINFORCEMENT_GRADE = "B500B";

/** Standaardaantal stroken (nen-en-1992-1-1/mnkappa.rs: DEFAULT_N_STRIPS). */
export const DEFAULT_N_STRIPS = 50;

/** Generieke betonnamen zonder sterkteklasse — niet toetsbaar. */
const GENERIC_CONCRETE_NAMES = ["concrete", "beton", "reinforced concrete", "gewapend beton"];

/**
 * Match een materiaalnaam op een ondersteunde betonsterkteklasse. "C30" en
 * "C30/37" leveren allebei "C30/37"; spaties en hoofdletters doen niet mee.
 */
export function matchSupportedConcreteClass(
  materialName: string | undefined,
  supportedClasses: readonly string[] = SUPPORTED_CONCRETE_CLASSES,
): string | null {
  if (!materialName) return null;
  const gezocht = materialName.replace(/\s/g, "").toLowerCase();
  if (!gezocht) return null;
  const hit = supportedClasses.find((c) => {
    const lang = c.toLowerCase();
    const kort = lang.split("/")[0];
    return lang === gezocht || kort === gezocht;
  });
  return hit ?? null;
}

/**
 * Herken een rechthoekige betondoorsnede b × h (mm) uit de profielnaam:
 * "300x500", "300 x 500", "300×500" (conventie: b×h).
 *
 * Blijft bestaan náást `parseConcreteSection`: de rechthoek is de enige vorm
 * waarvan boven- en onderrand samenvallen met b en h, en verschillende
 * aanroepers (de doorsnedetekening in het rapport, de eigenschappenbalk)
 * hebben alleen die twee getallen nodig.
 */
export function parseConcreteRectMm(
  profileName: string | undefined,
): { bMm: number; hMm: number } | null {
  const name = profileName?.trim();
  if (!name) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i.exec(name);
  if (!m) return null;
  const bMm = parseFloat(m[1].replace(",", "."));
  const hMm = parseFloat(m[2].replace(",", "."));
  if (bMm > 0 && hMm > 0) return { bMm, hMm };
  return null;
}

// ── De profielnaam van een betondoorsnede ──────────────────────────────────
//
// DE CONVENTIE, EN WAAROM DEZE
//
//   rechthoek   "300x500"                        b × h
//   T-ligger    "T 400x450 bw=200 hf=50"         b_f × h, lijf, flensdikte
//   L-ligger    "L 400x450 bw=200 hf=50"         idem
//   omgekeerd   "T 400x450 bw=200 hf=50 flens=onder"
//
// Dit model slaat geen numerieke doorsnede-eigenschappen per staaf op: de
// profielNAAM is de enige plaats waar de doorsnede staat, en die reist
// vanzelf mee in het projectbestand, de undo-historie, de staventabel en het
// rapport. Kruislaaghout doet hetzelfde ("CLT 40/20/40 b=1000"), een eigen
// doorsnede ook ("EIGEN:<naam>") en een vrij materiaal ook
// ("VRIJ:… E=… rho=…"). Vandaar dezelfde grammatica als daar: een kort
// voorvoegsel dat de vorm noemt, de hoofdmaten als "b x h", en de overige
// maten als benoemde sleutels.
//
// Vier getallen POSITIONEEL achter elkaar ("T 400/450/200/50") zou korter zijn
// maar niet na te lezen: welke van de twee laatste is de lijfbreedte? De
// sleutels bw en hf zijn de symbolen uit de norm (b_w, h_f), zodat de naam en
// de berekening dezelfde woorden gebruiken.
//
// EEN NAAM DIE NIET PARSEERT GEEFT EEN REDEN. Stil overslaan zou betekenen dat
// een staaf ongetoetst blijft omdat er "T 400x450" staat zonder lijfbreedte,
// en dat de gebruiker dat pas merkt als hij het rapport naleest.

/** De vormvoorvoegsels, met de `ConcreteShape` die erbij hoort. */
const VORM_VOORVOEGSEL: Record<string, ConcreteShape> = { T: "Tee", L: "Ell" };

/** Voorbeeldnamen voor in een foutmelding. */
export const BETON_PROFIEL_VOORBEELDEN =
  '"300x500" (rechthoek), "T 400x450 bw=200 hf=50" (T-ligger) of "L 400x450 bw=200 hf=50" (L-ligger)';

export type DoorsnedeUitkomst =
  | { ok: true; doorsnede: ConcreteSectionInput }
  | { ok: false; reden: string };

function getal(t: string): number {
  return parseFloat(t.replace(",", "."));
}

/**
 * Profielnaam → de doorsnede zoals de kern hem verwacht, of een reden waarom
 * die naam er geen oplevert.
 *
 * Er wordt hier niets aangevuld: een T zonder `bw=` krijgt geen aangenomen
 * lijfbreedte maar een melding. Een verzonnen lijfbreedte zou de weerstand,
 * de stijfheid, het scheurmoment én de tweede orde sturen zonder dat iemand
 * het ziet.
 */
export function parseConcreteSection(profileName: string | undefined): DoorsnedeUitkomst {
  const naam = profileName?.trim();
  if (!naam) {
    return { ok: false, reden: `er is geen doorsnede opgegeven — gebruik ${BETON_PROFIEL_VOORBEELDEN}` };
  }

  const rect = parseConcreteRectMm(naam);
  if (rect) {
    return {
      ok: true,
      doorsnede: {
        shape: "Rectangle",
        b_mm: rect.bMm,
        h_mm: rect.hMm,
        b_w_mm: null,
        h_f_mm: null,
        flange_at_bottom: false,
      },
    };
  }

  const kop = /^([TL])\s+(.*)$/i.exec(naam);
  if (!kop) {
    return {
      ok: false,
      reden: `doorsnede "${naam}" is geen herkenbare betondoorsnede — gebruik ${BETON_PROFIEL_VOORBEELDEN}`,
    };
  }
  const shape = VORM_VOORVOEGSEL[kop[1].toUpperCase()];
  const rest = kop[2].trim();

  const maten = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i.exec(rest);
  if (!maten) {
    return {
      ok: false,
      reden: `doorsnede "${naam}": na "${kop[1].toUpperCase()}" horen de flensbreedte en de totale hoogte te staan als "b×h", bijvoorbeeld "${kop[1].toUpperCase()} 400x450 bw=200 hf=50"`,
    };
  }
  const bMm = getal(maten[1]);
  const hMm = getal(maten[2]);

  let bW: number | null = null;
  let hF: number | null = null;
  let flensOnder = false;
  const tokens = maten[3].trim().split(/\s+/).filter((t) => t.length > 0);
  for (const token of tokens) {
    const kv = /^([A-Za-z_]+)\s*=\s*(.+)$/.exec(token);
    if (!kv) {
      return {
        ok: false,
        reden: `doorsnede "${naam}": "${token}" is geen sleutel=waarde — verwacht bw=…, hf=… of flens=onder`,
      };
    }
    const sleutel = kv[1].toLowerCase();
    const waarde = kv[2];
    if (sleutel === "bw") bW = getal(waarde);
    else if (sleutel === "hf") hF = getal(waarde);
    else if (sleutel === "flens") {
      const w = waarde.toLowerCase();
      if (w !== "onder" && w !== "boven") {
        return {
          ok: false,
          reden: `doorsnede "${naam}": flens="${waarde}" bestaat niet — gebruik flens=onder of flens=boven (standaard boven)`,
        };
      }
      flensOnder = w === "onder";
    } else {
      return {
        ok: false,
        reden: `doorsnede "${naam}": sleutel "${kv[1]}" is onbekend — verwacht bw=…, hf=… of flens=onder`,
      };
    }
  }

  const vorm = shape === "Tee" ? "T-vorm" : "L-vorm";
  if (bW === null) {
    return { ok: false, reden: `doorsnede "${naam}": de ${vorm} mist de lijfbreedte — voeg bw=… toe (in mm)` };
  }
  if (hF === null) {
    return { ok: false, reden: `doorsnede "${naam}": de ${vorm} mist de flensdikte — voeg hf=… toe (in mm)` };
  }
  // Dezelfde grenzen als `ConcreteSectionInput::build` in de kern, zodat de
  // melding hier komt en niet pas als de kern het verzoek terugstuurt.
  if (!(bMm > 0 && hMm > 0 && bW > 0 && hF > 0)) {
    return { ok: false, reden: `doorsnede "${naam}": alle maten moeten groter dan nul zijn` };
  }
  if (bW >= bMm) {
    return {
      ok: false,
      reden: `doorsnede "${naam}": de lijfbreedte bw=${bW} is niet kleiner dan de flensbreedte ${bMm} — dan is het een rechthoek, schrijf "${bMm}x${hMm}"`,
    };
  }
  if (hF >= hMm) {
    return {
      ok: false,
      reden: `doorsnede "${naam}": de flensdikte hf=${hF} laat geen lijf over binnen de hoogte ${hMm}`,
    };
  }

  return {
    ok: true,
    doorsnede: {
      shape,
      b_mm: bMm,
      h_mm: hMm,
      b_w_mm: bW,
      h_f_mm: hF,
      flange_at_bottom: flensOnder,
    },
  };
}

/**
 * De doorsnede terug naar een profielnaam. De editor schrijft hiermee naar
 * `beam.profile`; `parseConcreteSection` leest hem weer.
 */
export function formatConcreteSection(d: ConcreteSectionInput): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(v).replace(".", ","));
  if (d.shape === "Rectangle") return `${n(d.b_mm)}x${n(d.h_mm)}`;
  const letter = d.shape === "Tee" ? "T" : "L";
  const staart = d.flange_at_bottom ? " flens=onder" : "";
  return `${letter} ${n(d.b_mm)}x${n(d.h_mm)} bw=${n(d.b_w_mm ?? 0)} hf=${n(d.h_f_mm ?? 0)}${staart}`;
}

/** Is dit een betondoorsnede met een flens (T of L)? */
export function isFlensProfiel(profileName: string | undefined): boolean {
  return /^\s*[TL]\s+\d/i.test(profileName ?? "");
}

/**
 * De doorsnedeNAAM uit een KERNRESULTAAT terug naar de doorsnede.
 *
 * Dit is een andere grammatica dan de profielnaam hierboven: hij komt uit
 * `ConcreteSection::name()` in de kern en luidt "300 x 500" of
 * "T 400 x 450 (flens 400 x 50, lijf 200)", met " onder" achter de flensdikte
 * bij een omgekeerde T. Het rapport heeft hem nodig omdat een resultaat de
 * maten niet los draagt — alleen deze naam, en die is dus ook de plaats waar
 * de gebruikte b_eff staat.
 *
 * `null` als de naam niet past; het rapport laat de tekening dan weg in
 * plaats van een verzonnen doorsnede te tekenen.
 */
export function parseSectionNaam(naam: string | undefined): ConcreteSectionInput | null {
  const t = naam?.trim();
  if (!t) return null;
  const rect = /^(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)$/i.exec(t);
  if (rect) {
    const b = getal(rect[1]);
    const h = getal(rect[2]);
    if (!(b > 0 && h > 0)) return null;
    return { shape: "Rectangle", b_mm: b, h_mm: h, b_w_mm: null, h_f_mm: null, flange_at_bottom: false };
  }
  const flens =
    /^([TL])\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*\(flens\s+\d+(?:[.,]\d+)?\s*x\s*(\d+(?:[.,]\d+)?)(\s+onder)?,\s*lijf\s+(\d+(?:[.,]\d+)?)\)$/i.exec(
      t,
    );
  if (!flens) return null;
  const b = getal(flens[2]);
  const h = getal(flens[3]);
  const hF = getal(flens[4]);
  const bW = getal(flens[6]);
  if (!(b > 0 && h > 0 && hF > 0 && bW > 0)) return null;
  return {
    shape: flens[1].toUpperCase() === "T" ? "Tee" : "Ell",
    b_mm: b,
    h_mm: h,
    b_w_mm: bW,
    h_f_mm: hF,
    flange_at_bottom: flens[5] !== undefined,
  };
}

/** Per-staaf betoninstellingen zoals de aanroeper ze bijhoudt. */
export interface BetonStaafConfig {
  /**
   * De wapeningskorf (dekking, beugel, boven- en onderwapening, en de
   * beugelgegevens voor §6.2.3/§9.2.2).
   *
   * Hij gaat als GEHEEL het verzoek in (`cage: cfg.korf`) en wordt hier niet
   * veld voor veld overgeschreven. Dat is met opzet: een bouwer die de velden
   * opsomt, laat een nieuw veld stilzwijgend vallen, en dan rekent de kern
   * zonder dwarskrachtwapening terwijl de gebruiker haar wél heeft ingevoerd.
   */
  korf: ReinforcementCage;
  /** Wapeningsstaal; ontbreekt → B500B. */
  staalsoort?: string;
  /** Aantal stroken voor de integratie; ontbreekt → 50. */
  aantalStroken?: number;
  /** Bovenste tak van het staaldiagram; ontbreekt → horizontaal. */
  staaltak?: SteelBranch;
  /**
   * Milieuklasse van tabel 4.1. Dezelfde die de dekkingstoets van 4.4.1
   * gebruikt; §7.3 heeft haar nodig als ingang van de door de nationale
   * bijlage vervangen tabel 7.1N, want daar staat w_max in.
   *
   * Ontbreekt zij, dan gaat er niets mee en meldt de kern dat de
   * scheurtoetsen niet konden worden uitgevoerd. Er is met opzet geen
   * standaardklasse: die zou een scheurwijdte kunnen goedkeuren die bij het
   * werkelijke milieu veel te groot is.
   */
  milieuklasse?: ExposureClass;
  /**
   * Grootste nominale korrelafmeting d_g in mm (§8.2(2), §9.2(1)e). Ontbreekt
   * hij, dan wordt er GEEN waarde aangenomen — de norm kent er geen — en doet
   * §8.2(2) alleen de uitspraak die hoe dan ook geldt.
   */
  korrelafmetingMm?: number;
  /**
   * De regel uit tabel 7.4N voor de slankheidstoets van 7.4.2. Niet uit een
   * raamwerkmodel af te leiden: of een staaf een eindveld, een tussenveld of
   * een uitkraging is, hangt van de constructie af. Ontbreekt hij, dan blijft
   * 7.4.2 ongetoetst, met de reden in het rapport.
   */
  constructievorm?: StructuralSystem;
  /**
   * Werkelijke hart-op-hartafstand van de trekstaven in mm, voor (7.11) en
   * tabel 7.3N. Ontbreekt hij, dan leidt de kern hem uit de korf af (zuivere
   * meetkunde) en meldt dat in de afleiding.
   */
  staafafstandMm?: number;
  /**
   * De §5.8-gegevens: geschoord of ongeschoord, de kniklengte, φ(∞,t₀) en de
   * twee keuzen van §9.5.
   *
   * Gaat als GEHEEL het verzoek in (`column: cfg.kolom`), om dezelfde reden
   * als de korf hierboven: een bouwer die de velden opsomt, laat een nieuw
   * veld stilzwijgend vallen, en dan rekent de kern met een andere kniklengte
   * dan de gebruiker heeft ingevoerd.
   *
   * Ontbreekt het blok, dan wordt §5.8 niet getoetst en staat de reden in het
   * rapport. Er wordt niets aangenomen: §5.8.1 noemt geschoord uitdrukkelijk
   * een aanname in de berekening, en een aangenomen "geschoord" levert een
   * groene kolom op die in werkelijkheid twee keer zo slank is.
   */
  kolom?: ConcreteColumnInput;
}

export interface BetonBuildData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
  /** Wapeningskorf per staaf-id. Betonstaven zonder korf worden overgeslagen. */
  korven: Map<number, BetonStaafConfig>;
  /** Runtime-lijst uit `list_concrete_classes` (namen); leeg → statische fallback. */
  supportedClasses?: string[];
  /**
   * De meewerkende flensbreedte b_eff per staaf-id, in mm, zoals de kern hem
   * heeft afgeleid (5.3.2.1). Alleen van toepassing op een T of een L.
   *
   * Ontbreekt een staaf in deze map, dan gaat de INGEVOERDE flensbreedte het
   * verzoek in. Dat is geen stille aanname: `ConcreteSection::assumptions()`
   * in de kern drukt de gebruikte flensbreedte met zoveel woorden af als
   * "verondersteld de meewerkende breedte b_eff te zijn", en `section_name`
   * noemt hem ook. Wat er in het rapport staat, is dus altijd de breedte
   * waarmee gerekend is.
   */
  bEffPerStaaf?: Map<number, number>;
}

export interface BetonBuildResult {
  inputs: ConcreteBeamCheckInput[];
  /** Betonstaven die herkend maar niet toetsbaar zijn, met reden. */
  skipped: CheckSkip[];
}

/**
 * Zet de afgeleide meewerkende flensbreedte in de doorsnede.
 *
 * Alleen bij een T of een L, en alleen als er een waarde is. b_eff kan nooit
 * groter zijn dan de werkelijke flensbreedte — (5.7) begrenst hem op b — dus
 * een grotere waarde zou betekenen dat de liggerlijn niet bij deze staaf
 * hoort; die wordt niet overgenomen. Kleiner mag wél, en dat is juist het
 * punt: boven een tussensteunpunt is b_eff aanzienlijk kleiner dan in het
 * veld, en met de volle flensbreedte rekenen is daar de onveilige kant.
 */
export function metBeff(
  doorsnede: ConcreteSectionInput,
  bEffMm: number | undefined,
): ConcreteSectionInput {
  if (doorsnede.shape === "Rectangle") return doorsnede;
  if (bEffMm === undefined || !(bEffMm > 0) || bEffMm > doorsnede.b_mm + 1e-9) return doorsnede;
  if (doorsnede.b_w_mm !== null && bEffMm <= doorsnede.b_w_mm) {
    // b_eff ≤ b_w zou geen flens meer overlaten; de kern zou de doorsnede
    // dan terecht weigeren. Dat is geen reden om de staaf te laten vallen —
    // wél om de ingevoerde breedte te houden en de kern zijn aanname-tekst
    // te laten afdrukken.
    return doorsnede;
  }
  return { ...doorsnede, b_mm: bEffMm };
}

export function buildBetonCheckInputs(data: BetonBuildData): BetonBuildResult {
  const inputs: ConcreteBeamCheckInput[] = [];
  const skipped: CheckSkip[] = [];

  const klassen =
    data.supportedClasses && data.supportedClasses.length > 0
      ? data.supportedClasses
      : SUPPORTED_CONCRETE_CLASSES;

  const ulsCombos = data.combinations.filter((c) => c.type === "uls");

  // DE FREQUENTE BGT-COMBINATIE (6.15) voor §7.3. Herkend op de naam, zoals
  // `timberCheckBuilder` de quasi-blijvende herkent — en om dezelfde reden
  // GEEN terugval op een willekeurige andere BGT-combinatie: die zou de
  // scheurwijdte onder de verkeerde belasting toetsen zonder dat er iets
  // opvalt.
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  const slsFrequent = slsCombos.find((c) => /frequent/i.test(c.name)) ?? null;
  const frequentResult = slsFrequent
    ? data.combinationResults.get(slsFrequent.id) ?? null
    : null;

  // DE QUASI-BLIJVENDE BGT-COMBINATIE (6.16) voor §5.8.4. Herkend op de naam,
  // net als de frequente hierboven en net als in `timberCheckBuilder`. Zij
  // voedt uitsluitend M₀Eqp in (5.19), de effectieve kruipcoëfficiënt — §5.8.4
  // koppelt φ_ef uitdrukkelijk aan déze combinatie, waar §7.3 (in de versie van
  // de nationale bijlage) juist de frequente vraagt.
  //
  // De twee zijn dus niet uitwisselbaar, en er is opnieuw GEEN terugval: de
  // frequente als quasi-blijvende lezen geeft een te grote M₀Eqp en dus een te
  // grote φ_ef, wat A = 1/(1+0,2·φ_ef) verlaagt en λ_lim mee. Ontbreekt de
  // combinatie, dan gaat er een lege lijst mee en meldt de kern dat φ_ef
  // onbekend blijft, met de reden.
  const slsQuasi = slsCombos.find((c) => /quasi/i.test(c.name)) ?? null;
  const quasiResult = slsQuasi ? data.combinationResults.get(slsQuasi.id) ?? null : null;

  for (const beam of data.beams) {
    const materialName = beam.material?.trim() ?? "";
    const klasse = matchSupportedConcreteClass(materialName, klassen);

    if (!klasse) {
      // Wel beton, maar zonder sterkteklasse → expliciet melden. Al het
      // overige (staal, hout) is geen zaak van deze builder.
      if (GENERIC_CONCRETE_NAMES.includes(materialName.toLowerCase())) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" heeft geen sterkteklasse — kies bijv. C30/37`,
        });
      }
      continue;
    }

    if (isSteelProfile(beam.profile)) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${materialName}" is beton maar profiel "${beam.profile}" is een staalprofiel — kies ${BETON_PROFIEL_VOORBEELDEN}, of een staalsoort als materiaal`,
      });
      continue;
    }

    const vorm = parseConcreteSection(beam.profile);
    if (!vorm.ok) {
      skipped.push({ beamId: beam.id, reason: vorm.reden });
      continue;
    }

    const cfg = data.korven.get(beam.id);
    if (!cfg) {
      skipped.push({
        beamId: beam.id,
        reason: "geen wapeningskorf opgegeven — vul dekking, beugel en hoofdwapening in bij de staafeigenschappen",
      });
      continue;
    }

    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 — knopen ontbreken" });
      continue;
    }

    const hasAnyResult = ulsCombos.some((c) =>
      data.combinationResults.get(c.id)?.elements.has(beam.id),
    );
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties — reken het model eerst door",
      });
      continue;
    }

    inputs.push({
      beam_id: beam.id,
      section: metBeff(vorm.doorsnede, data.bEffPerStaaf?.get(beam.id)),
      concrete_class: klasse,
      reinforcement_grade: cfg.staalsoort ?? DEFAULT_REINFORCEMENT_GRADE,
      cage: cfg.korf,
      // De wapening die LANGS de staaf verandert (§9.2.1.3 inkorting van de
      // langswapening, §9.2.2 beugelverdichting). LEEG betekent: de korf
      // hierboven geldt over de hele staaf — precies het gedrag van vóór dit
      // veld, en dus ook het gedrag van elk model dat geen zones draagt.
      //
      // De zones komen uit `checkConfig.betonZones`, DEZELFDE bron waaruit
      // `bouwMultiInput` de rekenknopen op de zonegrenzen haalt
      // (`lib/betonZoneSneden.ts`) en waaruit `betonDekkingslijnBuilder` de
      // dekkingslijn voedt. Eén bron voor die drie: zouden de toetsing en de
      // dekkingslijn elk hun eigen zonelijst lezen, dan kunnen zij over
      // dezelfde staaf iets anders zeggen.
      reinforcement_zones: beam.checkConfig?.betonZones ?? { longitudinal: [], stirrups: [] },
      length_m: lengthMm / 1000,
      forces_envelope: buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults),
      // LEEG ALS ER GEEN ECHT RESULTAAT IS. `buildForcesEnvelope` levert bij
      // een ontbrekend resultaat één punt met alle krachten nul; dat zou hier
      // een frequente combinatie met M = 0 voorwenden, en dan komt er een
      // scheurwijdte van nul uit die er geloofwaardig uitziet. Een lege lijst
      // laat de kern juist zeggen dat §7.3 niet kon worden uitgevoerd.
      sls_frequent_envelope:
        slsFrequent && frequentResult?.elements.has(beam.id)
          ? buildForcesEnvelope(beam.id, [slsFrequent], data.combinationResults)
          : [],
      // Idem voor de QUASI-BLIJVENDE combinatie (6.16), die alleen M₀Eqp in
      // (5.19) voedt. Dezelfde regel: liever leeg dan een verzonnen nulpunt,
      // want dat zou een φ_ef van nul opleveren die er geloofwaardig uitziet.
      sls_quasi_permanent_envelope:
        slsQuasi && quasiResult?.elements.has(beam.id)
          ? buildForcesEnvelope(beam.id, [slsQuasi], data.combinationResults)
          : [],
      ...(cfg.milieuklasse ? { exposure_class: cfg.milieuklasse } : {}),
      ...(cfg.korrelafmetingMm && cfg.korrelafmetingMm > 0
        ? { aggregate_size_mm: cfg.korrelafmetingMm }
        : {}),
      ...(cfg.constructievorm ? { structural_system: cfg.constructievorm } : {}),
      ...(cfg.staafafstandMm && cfg.staafafstandMm > 0
        ? { bar_spacing_mm: cfg.staafafstandMm }
        : {}),
      // §5.8 als GEHEEL. Geen veld-voor-veld overschrijving — zie `kolom` in
      // `BetonStaafConfig`. Zonder blok geen §5.8-toets, met de reden uit de
      // kern in plaats van een aangenomen schoring.
      ...(cfg.kolom ? { column: cfg.kolom } : {}),
      n_strips: cfg.aantalStroken && cfg.aantalStroken > 0 ? Math.round(cfg.aantalStroken) : DEFAULT_N_STRIPS,
      steel_branch: cfg.staaltak ?? "Horizontal",
      design_situation: "PersistentTransient",
      apply_min_eccentricity: true,
    });
  }

  return { inputs, skipped };
}
