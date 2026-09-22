/**
 * kipsteunen.ts — ÉÉN bron voor de kipsteunen van een staaf: wat de toetsing
 * krijgt én wat het tekenvlak laat zien.
 *
 * WAAROM DIT BESTAND BESTAAT (issue #40)
 * Kipsteunen (zijdelingse steunen tegen kip, NEN-EN 1993-1-1 art. 6.3.2 en
 * NEN-EN 1995-1-1 art. 6.3.3) stonden alleen als getallen in het
 * eigenschappenpaneel. Op de tekening was niet te zien waar ze zitten en aan
 * welke flens, en dus ook niet of de aanname klopt. Een tekening die haar
 * posities ZELF uit `checkConfig` zou afleiden, is een tweede afleiding naast
 * die van de invoerbouwers — en twee afleidingen lopen vroeg of laat uiteen
 * (een ander filter op de randen, een andere afronding). Daarom leidt
 * `kipsteunenVanStaaf` alles in één keer af:
 *  - `lateral_bracing` en `ltb_segment_length_m`: letterlijk wat de staal- en
 *    de houtbouwer in de toetsinvoer zetten (zij roepen deze functie aan);
 *  - `steunen` en `kettingen`: dezelfde getallen, als posities met flens en als
 *    kipveldlengtes in mm, voor de tekening.
 *
 * Bladmodule: alleen typen en `kniklengte.ts` (dat zelf niets importeert). De
 * bouwers importeren dit bestand; zou het op zijn beurt een bouwer importeren,
 * dan ontstond er een kring.
 *
 * STAAL EN HOUT VERSCHILLEN
 *  - STAAL: de kern krijgt de fracties per flens en beoordeelt PER STEUN of hij
 *    aan de gedrukte flens zit, op het moment ter plaatse
 *    (`LateralBracing::kipsteunen_op_de_gedrukte_flens`). Welke flens gedrukt
 *    is, hangt dus van de momentenlijn af en is zonder berekening niet bekend.
 *    De tekening toont daarom twee kettingen: de kipvelden als de BOVENflens
 *    gedrukt is (doorhangen) en die als de ONDERflens gedrukt is (steunpunts-
 *    moment). Zijn ze gelijk, dan één ketting. De grenzen volgen dezelfde
 *    regel als `kipveld_grenzen_mm` in `nen-en-1993-1-1-ltb/src/lambda_chi.rs`.
 *  - HOUT: art. 6.3.3 kent geen flenzen en vraagt één afstand ℓ
 *    (`ltbSupportSpacing_m`), waaruit tabel 6.1 de meewerkende lengte maakt.
 *    De fracties per rand gaan wel mee naar de kern, maar alleen voor de
 *    kniklengte om z. De ketting van hout is daarom die van de steunafstand:
 *    steunen op ℓ, 2ℓ, … vanaf het staafbegin, en de lengte waarmee de toets
 *    rekent (`toetsLengteMm`) is ℓ zelf — ook als ℓ niet op de staaf past.
 */
import type { BeamCheckConfig } from "../components/fem/femTypes";
import type { LateralBracing } from "./types/steel/LateralBracing";
import { TOLERANTIE_STEUNPAAR_MM } from "./kniklengte";

/**
 * Kipsteunfracties opschonen voor LateralBracing.top_flange_positions:
 * alleen 0 < f < 1 (de uiteinden zelf zijn geen kipsteun), gesorteerd en
 * ontdubbeld — de Rust-kern (lambda_chi.rs) vermenigvuldigt de fracties
 * met de staaflengte.
 */
export function sanitizeRestraintFractions(fractions: number[] | undefined): number[] {
  if (!Array.isArray(fractions)) return [];
  return [...new Set(fractions.filter((f) => Number.isFinite(f) && f > 0 && f < 1))]
    .sort((a, b) => a - b);
}

/**
 * Een kipveld korter dan één promille van de staaflengte is invoerruis en
 * geen kipveld. Zelfde waarde en zelfde reden als `MIN_VELDFRACTIE` in
 * `lambda_chi.rs`: zonder deze drempel maakt een steun op f = 10⁻⁹ van het
 * gaffelgeval (L_kip = L_st) het geval met β.
 */
export const MIN_VELDFRACTIE = 1e-3;

/**
 * De grenzen van de kipvelden in mm vanaf het staafbegin: 0, de kipsteunen en
 * L. Spiegel van `kipveld_grenzen_mm` in de kern (NB.NB.4.3: L_st is de
 * ongesteunde lengte tussen twee gaffels, tussen een gaffel en een kipsteun of
 * tussen twee kipsteunen). Altijd minstens twee grenzen, dus minstens één veld.
 */
export function kipveldGrenzenMm(lengthMm: number, fracties: readonly number[]): number[] {
  const tolMm = Math.max(MIN_VELDFRACTIE * Math.abs(lengthMm), 1e-9);
  const ruw = [
    0,
    ...fracties
      .filter((f) => Number.isFinite(f) && f > MIN_VELDFRACTIE && f < 1 - MIN_VELDFRACTIE)
      .map((f) => f * lengthMm),
    lengthMm,
  ].sort((a, b) => a - b);
  // Zelfde ontdubbeling als `dedup_by` in de kern: een grens die binnen de
  // tolerantie van de vorige BEWAARDE grens ligt, vervalt.
  const grenzen: number[] = [];
  for (const g of ruw) {
    if (grenzen.length === 0 || Math.abs(g - grenzen[grenzen.length - 1]) >= tolMm) grenzen.push(g);
  }
  return grenzen.length >= 2 ? grenzen : [0, Math.max(lengthMm, 1e-9)];
}

/** Welke toetskern de staaf krijgt; bepaalt wat de kipsteunafstand betekent. */
export type KipsteunSoort = "staal" | "hout";

/**
 * Aan welke flens (bij hout: rand) een steun zit. `gedrukt` is de steun uit
 * de kipsteunafstand van hout: art. 6.3.3 steunt de gedrukte rand en zegt niet
 * welke dat is.
 */
export type KipsteunFlens = "boven" | "onder" | "beide" | "gedrukt";

/** Eén kipsteun langs de staaf, in de referentierichting van de toetsing. */
export interface Kipsteun {
  /** Fractie 0..1 van de staaflengte, vanaf het begin in de referentierichting. */
  fractie: number;
  /** Dezelfde plaats in mm. */
  xMm: number;
  flens: KipsteunFlens;
  /** Uit een opgegeven positie, of uit de regelmatige kipsteunafstand (hout). */
  herkomst: "positie" | "afstand";
}

/**
 * Een reeks kipvelden langs de staaf. `zijde` zegt voor welke gedrukte flens
 * de reeks geldt; `beide` = voor beide flenzen dezelfde velden, `kip` = de
 * steunafstand van hout.
 */
export interface Kipveldketting {
  zijde: "boven" | "onder" | "beide" | "kip";
  /** Oplopend, van 0 tot en met de staaflengte (mm). */
  grenzenMm: number[];
  /** De veldlengtes tussen de grenzen (mm); één minder dan de grenzen. */
  lengtesMm: number[];
  /**
   * Alleen bij `kip`: de ℓ waarmee de houttoets rekent (mm). Gelijk aan de
   * opgegeven afstand, of aan de staaflengte als er geen is opgegeven — ook
   * als het laatste getekende veld korter is of de afstand langer dan de staaf.
   */
  toetsLengteMm?: number;
}

export interface KipsteunenVanStaaf {
  /** Woordelijk het veld `lateral_bracing` van de staal- en de houtinvoer. */
  lateral_bracing: LateralBracing;
  /**
   * Woordelijk het veld `ltb_segment_length_m` van de houtinvoer: de opgegeven
   * kipsteunafstand in m, of 0 = "niet opgegeven, de kern neemt de
   * staaflengte". De staalinvoer kent dit veld niet.
   */
  ltb_segment_length_m: number;
  steunen: Kipsteun[];
  kettingen: Kipveldketting[];
}

function ketting(zijde: Kipveldketting["zijde"], grenzenMm: number[]): Kipveldketting {
  return {
    zijde,
    grenzenMm,
    lengtesMm: grenzenMm.slice(1).map((g, i) => g - grenzenMm[i]),
  };
}

/**
 * De kipsteunen van één staaf, uit zijn toetsconfiguratie.
 *
 * `cfg` is de configuratie ZOALS DE TOETSING HEM ZIET: van de staaf in zijn
 * referentierichting (`lib/referentierichting.ts`) en, bij een doorgaande
 * lijn, van de virtuele staaf (`lib/doorgaandeLijn.ts`). De bouwers geven hem
 * zo al door; de tekening doet dat via `lib/kipsteunBeeld.ts`.
 *
 * `lengthMm` mag 0 zijn (de bouwers roepen dit aan vóór ze de lengte keuren):
 * de invoervelden hangen er niet van af, en steunen en kettingen blijven dan
 * leeg.
 */
export function kipsteunenVanStaaf(
  cfg: BeamCheckConfig | undefined,
  lengthMm: number,
  soort: KipsteunSoort,
): KipsteunenVanStaaf {
  const boven = sanitizeRestraintFractions(cfg?.lateralRestraints);
  const onder = sanitizeRestraintFractions(cfg?.lateralRestraintsBottom);
  // Alleen een eindige waarde > 0 gaat door; al het andere (leeg, 0, negatief,
  // NaN) wordt 0 en dan neemt de houtkern de staaflengte — de veilige kant,
  // want de volle lengte geeft de laagste σ_m,crit.
  const afstandM =
    Number.isFinite(cfg?.ltbSupportSpacing_m) && (cfg?.ltbSupportSpacing_m as number) > 0
      ? (cfg?.ltbSupportSpacing_m as number)
      : 0;
  const uit: KipsteunenVanStaaf = {
    lateral_bracing: { top_flange_positions: boven, bottom_flange_positions: onder },
    ltb_segment_length_m: afstandM,
    steunen: [],
    kettingen: [],
  };
  if (!(Number.isFinite(lengthMm) && lengthMm > 0)) return uit;

  // Steunen uit de posities. Een boven- en een ondersteun binnen 1 mm van
  // elkaar zijn één plaats waar de hele doorsnede gesteund is — dezelfde
  // tolerantie als de kern voor de kniklengte om z aanhoudt.
  const onderGebruikt = onder.map(() => false);
  for (const f of boven) {
    const j = onder.findIndex(
      (g, i) => !onderGebruikt[i] && Math.abs(f - g) * lengthMm <= TOLERANTIE_STEUNPAAR_MM,
    );
    if (j >= 0) onderGebruikt[j] = true;
    uit.steunen.push({ fractie: f, xMm: f * lengthMm, flens: j >= 0 ? "beide" : "boven", herkomst: "positie" });
  }
  onder.forEach((f, i) => {
    if (!onderGebruikt[i]) uit.steunen.push({ fractie: f, xMm: f * lengthMm, flens: "onder", herkomst: "positie" });
  });

  if (soort === "staal") {
    const gBoven = kipveldGrenzenMm(lengthMm, boven);
    const gOnder = kipveldGrenzenMm(lengthMm, onder);
    const gelijk =
      gBoven.length === gOnder.length &&
      gBoven.every((g, i) => Math.abs(g - gOnder[i]) <= TOLERANTIE_STEUNPAAR_MM);
    if (gelijk) uit.kettingen.push(ketting("beide", gBoven));
    else uit.kettingen.push(ketting("boven", gBoven), ketting("onder", gOnder));
  } else {
    // Hout: steunen op ℓ, 2ℓ, … zolang ze vóór het staafeind vallen. Dezelfde
    // drempel als bij staal houdt een steun die praktisch op het eind ligt
    // (6 m met ℓ = 1,2 m: 5 · 1200 = 6000) buiten de tekening.
    const afstandMm = afstandM * 1000;
    const fracties: number[] = [];
    if (afstandMm > 0) {
      for (let k = 1; k * afstandMm < lengthMm * (1 - MIN_VELDFRACTIE); k++) {
        fracties.push((k * afstandMm) / lengthMm);
      }
    }
    for (const f of fracties) {
      uit.steunen.push({ fractie: f, xMm: f * lengthMm, flens: "gedrukt", herkomst: "afstand" });
    }
    uit.kettingen.push({
      ...ketting("kip", kipveldGrenzenMm(lengthMm, fracties)),
      toetsLengteMm: afstandMm > 0 ? afstandMm : lengthMm,
    });
  }
  uit.steunen.sort((a, b) => a.xMm - b.xMm);
  return uit;
}

/**
 * Een veldlengte voor op de tekening: hele millimeters, zonder eenheid (die
 * staat in het bijschrift van de ketting). Derdepunten op 8 m geven 2666,67 mm;
 * op een maatlijn hoort 2667 — de toets rekent met de onafgeronde waarde.
 */
export function kipveldLabelMm(lengteMm: number): string {
  return String(Math.round(lengteMm));
}
