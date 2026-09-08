/**
 * profielVarianten.ts — welke naburige doorsneden er bij een staaf horen.
 *
 * DE VRAAG DIE DIT BEANTWOORDT. Na een berekening wil de constructeur weten:
 * wat wordt de unity check als ik een profiel hoger of lager ga zitten? Deze
 * module levert alléén de KEUZE van die naburige doorsneden — pure functies,
 * geen rekenkern, geen React. Het hertoetsen zelf gebeurt in
 * `stores/variantStore.ts`, dat de bestaande invoerbouwers en de bestaande
 * toetsroute hergebruikt.
 *
 * DE DRIE REEKSEN, EN WAAR ZE VANDAAN KOMEN.
 *
 *  - STAAL: uit de profieldatabase van de rekenkern
 *    (`src-tauri/crates/steel-profiles/data/profiles.json`, 496 profielen). De
 *    reeks volgt uit de NAAM: het voorvoegsel plus alle maten ná de eerste.
 *    "IPE 240" hoort dus in reeks "IPE" met maat 240; "SHS 200x200x8" in de
 *    reeks van de vierkante kokers met wanddikte 8, met maat 200; "RHS
 *    200x100x8" in de reeks met breedte 100 en wanddikte 8. Twee stappen op en
 *    neer binnen die reeks. Bestaat de stap niet, dan worden er minder
 *    varianten getoond — er wordt nooit een profielmaat verzonnen.
 *
 *  - HOUT: de HANDELSMATENLIJST van het kantoor van de gebruiker, hieronder
 *    letterlijk overgenomen. Dit is nadrukkelijk GEEN normlijst en ook geen
 *    volledige marktlijst: het is de voorraad waaruit dit kantoor kiest. Die
 *    twee mogen in dit project niet door elkaar lopen — normgegevens komen uit
 *    de rekenkern, handelsmaten uit deze lijst. Gevarieerd wordt binnen
 *    dezelfde BREEDTE: twee hoogtes op en twee neer.
 *
 *  - BETON: hoogte én wapening, allebei. De hoogte in stappen van 50 mm (twee
 *    op, twee neer) bij dezelfde korf; de wapening als een staaf erbij of eraf
 *    bij gelijke diameter, én een diameter op of neer bij gelijk aantal. De
 *    diameters komen uit `components/beton/wapeningskorf.ts` (STAAFDIAMETERS) —
 *    ook dat zijn handelsmaten, geen normwaarden.
 *
 * WAT HIER NIET GEBEURT. Er wordt geen krachtsverdeling herrekend. Zie
 * `statischeOnbepaaldheid.ts` en de waarschuwingsteksten in `variantStore.ts`
 * voor wat dat betekent en hoe het aan de gebruiker wordt gemeld.
 */
import type { ConcreteSectionInput } from "./types/concrete/ConcreteSectionInput";
import type { ReinforcementCage } from "./types/concrete/ReinforcementCage";
import type { SteelProfile } from "./types/steel/SteelProfile";
import { isEigenProfiel } from "./profieleditor/eigenDoorsnedenStore";
import { formatConcreteSection } from "./betonCheckBuilder";
import { banden } from "../components/beton/wapeningskorf";

// ═══════════════════════════════════════════════════════════════════════════
// Het contract
// ═══════════════════════════════════════════════════════════════════════════

/** Waarin een variant van de huidige doorsnede verschilt. */
export type VariantSoort =
  /** Een andere doorsnede: ander staalprofiel, andere houtmaat, andere hoogte. */
  | "maat"
  /** Beton: hetzelfde profiel, één staaf meer of minder in de onderwapening. */
  | "wapeningAantal"
  /** Beton: hetzelfde profiel, één diametermaat op of neer in de onderwapening. */
  | "wapeningDiameter";

/** Eén voorgestelde variant van de doorsnede van één staaf. */
export interface VariantVoorstel {
  /** Sleutel, uniek binnen de staaf. */
  id: string;
  /** Korte aanduiding voor de tabel: "IPE 240", "71 x 171", "h = 550", "4Ø16". */
  label: string;
  /**
   * Positie ten opzichte van de huidige doorsnede: −2, −1, +1, +2. Het teken
   * volgt de reeks — positief is de zwaardere/hogere/rijkere kant.
   */
  stap: number;
  soort: VariantSoort;
  /** De profielnaam waarmee getoetst moet worden; `null` = ongewijzigd. */
  profielnaam: string | null;
  /** De wapeningskorf waarmee getoetst moet worden; `null` = ongewijzigd. */
  korf: ReinforcementCage | null;
  /**
   * Traagheidsmoment van de variant om de sterke as (mm⁴). Nodig om de
   * doorbuiging te schalen en om te kunnen zeggen of de variant stijver of
   * slapper is dan de huidige doorsnede. `null` = niet af te leiden.
   */
  iMm4: number | null;
  /**
   * Doorsnedeoppervlak (mm²) — de maat voor het eigen gewicht. `null` = niet
   * af te leiden.
   */
  aMm2: number | null;
  /**
   * Waarom deze variant niet doorgerekend kan worden; `null` = wél. Een
   * variant die niet past wordt MÉT die reden getoond en niet weggelaten: dat
   * de betonstaven niet meer naast elkaar passen, is precies wat de
   * constructeur wil weten.
   */
  onmogelijk: string | null;
}

/** Alle varianten van één staaf, met de huidige doorsnede als ijkpunt. */
export interface VariantenVoorStaaf {
  beamId: number;
  materiaal: "staal" | "hout" | "beton";
  /** De doorsnede waarmee gerekend is, als ijkpunt voor stijfheid en gewicht. */
  huidig: { label: string; iMm4: number | null; aMm2: number | null };
  voorstellen: VariantVoorstel[];
  /** Waarom de lijst leeg is; `null` wanneer er varianten zijn. */
  reden: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Staal — reeksen uit de profieldatabase
// ═══════════════════════════════════════════════════════════════════════════

/** Een profielnaam ontleed in reeks en maat. */
export interface ProfielOntleding {
  /** Voorvoegsel in hoofdletters: "HEA", "IPE", "SHS", "CHS". */
  voorvoegsel: string;
  /**
   * Reekssleutel: het voorvoegsel plus alle maten NA de eerste. Een maat die
   * gelijk is aan de eerste wordt als "=" opgeschreven, zodat "SHS 200x200x8"
   * en "SHS 250x250x8" in dezelfde reeks vallen (vierkante koker, wand 8) en
   * niet elk in een eigen reeks van één.
   */
  reeks: string;
  /** De eerste maat: de hoogte (of de diameter bij een ronde buis). */
  maat: number;
}

/**
 * Ontleed een profielnaam in reeks en maat. Werkt met en zonder spatie na het
 * voorvoegsel ("UNP350" én "UNP 350") en met x, X of × als scheidingsteken —
 * beide komen in de database voor.
 *
 * `null` wanneer de naam niet uit een voorvoegsel plus maten bestaat; dan is er
 * geen reeks en dus ook geen buurprofiel.
 */
export function ontleedProfielnaam(naam: string): ProfielOntleding | null {
  const t = naam.trim();
  const m = /^([A-Za-z]+)\s*([0-9]+(?:[.,][0-9]+)?(?:\s*[xX×]\s*[0-9]+(?:[.,][0-9]+)?)*)$/.exec(t);
  if (!m) return null;
  const maten = m[2]
    .split(/[xX×]/)
    .map((s) => parseFloat(s.trim().replace(",", ".")))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (maten.length === 0) return null;
  const voorvoegsel = m[1].toUpperCase();
  const eerste = maten[0];
  const staart = maten.slice(1).map((v) => (v === eerste ? "=" : String(v)));
  return {
    voorvoegsel,
    reeks: [voorvoegsel, ...staart].join("|"),
    maat: eerste,
  };
}

/**
 * Twee staalprofielen hoger en twee lager binnen dezelfde reeks.
 *
 * `profielen` is de volledige database zoals `list_steel_profiles` hem levert.
 * Het huidige profiel moet erin voorkomen; staat het er niet in, dan is er geen
 * reeks om in te stappen en komt dat als reden terug.
 */
export function staalVarianten(
  beamId: number,
  profielnaam: string,
  profielen: readonly SteelProfile[],
): VariantenVoorStaaf {
  const leeg = (reden: string): VariantenVoorStaaf => ({
    beamId,
    materiaal: "staal",
    huidig: { label: profielnaam, iMm4: null, aMm2: null },
    voorstellen: [],
    reden,
  });

  if (isEigenProfiel(profielnaam)) {
    return leeg(
      "een eigen doorsnede uit de profieleditor staat in geen enkele reeks — " +
        "er is geen naburig profiel om mee te vergelijken",
    );
  }

  const sleutel = (n: string) => n.replace(/[\s\-.]/g, "").toUpperCase();
  const huidigProfiel = profielen.find((p) => sleutel(p.name) === sleutel(profielnaam));
  if (!huidigProfiel) {
    return leeg(`profiel "${profielnaam}" staat niet in de EN 1993-profieldatabase`);
  }

  const ontleed = ontleedProfielnaam(huidigProfiel.name);
  if (!ontleed) {
    return leeg(
      `uit de profielnaam "${huidigProfiel.name}" is geen maatreeks af te leiden`,
    );
  }

  // Alles uit dezelfde reeks, op maat gesorteerd. Ontdubbeld op maat: staan er
  // twee schrijfwijzen van hetzelfde profiel in de database, dan zou een
  // "stap" anders een profiel met dezelfde afmetingen opleveren.
  const reeks = profielen
    .map((p) => ({ p, o: ontleedProfielnaam(p.name) }))
    .filter((x): x is { p: SteelProfile; o: ProfielOntleding } => x.o !== null)
    .filter((x) => x.o.reeks === ontleed.reeks)
    .sort((a, b) => a.o.maat - b.o.maat);
  const uniek: typeof reeks = [];
  for (const x of reeks) {
    if (uniek.length === 0 || uniek[uniek.length - 1].o.maat !== x.o.maat) uniek.push(x);
  }

  const index = uniek.findIndex((x) => sleutel(x.p.name) === sleutel(huidigProfiel.name));
  if (index < 0) {
    return leeg(`profiel "${huidigProfiel.name}" is niet in zijn eigen reeks terug te vinden`);
  }

  const voorstellen: VariantVoorstel[] = [];
  for (const stap of [-2, -1, 1, 2]) {
    const j = index + stap;
    if (j < 0 || j >= uniek.length) continue; // bestaat niet — niets verzinnen
    const p = uniek[j].p;
    voorstellen.push({
      id: `staal:${p.name}`,
      label: p.name,
      stap,
      soort: "maat",
      profielnaam: p.name,
      korf: null,
      iMm4: p.properties.iy_mm4,
      aMm2: p.properties.area_mm2,
      onmogelijk: null,
    });
  }

  return {
    beamId,
    materiaal: "staal",
    huidig: {
      label: huidigProfiel.name,
      iMm4: huidigProfiel.properties.iy_mm4,
      aMm2: huidigProfiel.properties.area_mm2,
    },
    voorstellen,
    reden:
      voorstellen.length === 0
        ? `reeks "${ontleed.voorvoegsel}" bevat maar één maat met deze overige afmetingen`
        : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Hout — de handelsmatenlijst van het kantoor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * De houtmaten waaruit dit kantoor kiest, letterlijk zoals aangeleverd.
 *
 * HERKOMST: dit is een HANDELSMATENLIJST — de voorraad van het kantoor van de
 * gebruiker — en NADRUKKELIJK GEEN NORMGEGEVEN. In EN 338 of EN 14080 staat
 * geen maatreeks; die normen geven sterkteklassen. Wie deze lijst uitbreidt,
 * breidt dus een inkooplijst uit en niet een normtabel, en hoeft er geen norm
 * bij te zoeken. Omgekeerd mag er nooit een normwaarde uit worden afgeleid.
 *
 * De reeksnamen zijn die van de gebruiker; de variatie loopt binnen dezelfde
 * BREEDTE, want dat is wat er in de praktijk uit hetzelfde pak komt.
 */
export const HOUT_HANDELSMATEN: { reeks: string; bMm: number; hoogtesMm: number[] }[] = [
  {
    reeks: "SLS 38",
    bMm: 38,
    hoogtesMm: [
      33, 38, 44, 58, 60, 62, 73, 86, 89, 96, 100,
      120, 121, 130, 140, 146, 156, 184, 203, 235, 245, 286,
    ],
  },
  { reeks: "geschaafd vuren 46", bMm: 46, hoogtesMm: [28, 71, 96, 121, 136, 146, 171, 196] },
  { reeks: "geschaafd 71", bMm: 71, hoogtesMm: [96, 100, 121, 146, 171, 196, 221, 246, 271] },
  { reeks: "geschaafd 96", bMm: 96, hoogtesMm: [96, 121, 146, 196, 221, 246, 271, 296] },
  { reeks: "azobe 50", bMm: 50, hoogtesMm: [50, 100, 150, 200] },
  { reeks: "azobe 80", bMm: 80, hoogtesMm: [200] },
  { reeks: "azobe 100", bMm: 100, hoogtesMm: [200] },
];

/** Een houtprofielnaam ontleed: b × h plus het eventuele achtervoegsel. */
export interface HoutOntleding {
  bMm: number;
  hMm: number;
  /** " SLS", " GL", … inclusief voorafgaande spatie; "" wanneer afwezig. */
  achtervoegsel: string;
}

/**
 * Ontleed "38x89 SLS", "71x146" of "96x450 GL". Zelfde grammatica als
 * `parseTimberRectMm` in `timberCheckBuilder.ts`, maar met behoud van het
 * achtervoegsel — de variant hoort dezelfde aanduiding te dragen als het
 * origineel, anders leest de gebruiker ineens een ander soort hout.
 */
export function ontleedHoutnaam(naam: string | undefined): HoutOntleding | null {
  const t = naam?.trim();
  if (!t) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(\s+(?:SLS|EU|CLS|GL))?$/i.exec(t);
  if (!m) return null;
  const bMm = parseFloat(m[1].replace(",", "."));
  const hMm = parseFloat(m[2].replace(",", "."));
  if (!(bMm > 0 && hMm > 0)) return null;
  return { bMm, hMm, achtervoegsel: m[3] ?? "" };
}

/** Traagheidsmoment van een rechthoek om de sterke as: b·h³/12 (mm⁴). */
export function rechthoekIMm4(bMm: number, hMm: number): number {
  return (bMm * hMm ** 3) / 12;
}

/**
 * Twee houtmaten hoger en twee lager binnen dezelfde breedtereeks.
 *
 * Een balk waarvan de maat niet in de lijst voorkomt krijgt geen varianten maar
 * een reden: raden welke maten "ernaast" liggen zou betekenen dat de app een
 * handelsmaat verzint die het kantoor niet voert.
 */
export function houtVarianten(beamId: number, profielnaam: string | undefined): VariantenVoorStaaf {
  const ontleed = ontleedHoutnaam(profielnaam);
  const label = ontleed
    ? `${ontleed.bMm} x ${ontleed.hMm}`
    : (profielnaam ?? "—");

  const leeg = (reden: string): VariantenVoorStaaf => ({
    beamId,
    materiaal: "hout",
    huidig: {
      label,
      iMm4: ontleed ? rechthoekIMm4(ontleed.bMm, ontleed.hMm) : null,
      aMm2: ontleed ? ontleed.bMm * ontleed.hMm : null,
    },
    voorstellen: [],
    reden,
  });

  if (!ontleed) {
    return leeg(`doorsnede "${profielnaam ?? "—"}" is geen herkenbare rechthoek b×h`);
  }

  const reeks = HOUT_HANDELSMATEN.find((r) => r.bMm === ontleed.bMm);
  if (!reeks) {
    return leeg(
      `breedte ${ontleed.bMm} mm komt niet voor in de handelsmatenlijst ` +
        `(${HOUT_HANDELSMATEN.map((r) => r.bMm).join(", ")} mm)`,
    );
  }

  const hoogtes = [...reeks.hoogtesMm].sort((a, b) => a - b);
  const index = hoogtes.indexOf(ontleed.hMm);
  if (index < 0) {
    return leeg(
      `hoogte ${ontleed.hMm} mm komt niet voor in reeks "${reeks.reeks}" ` +
        `(${hoogtes.join(", ")} mm)`,
    );
  }

  const voorstellen: VariantVoorstel[] = [];
  for (const stap of [-2, -1, 1, 2]) {
    const j = index + stap;
    if (j < 0 || j >= hoogtes.length) continue; // bestaat niet — niets verzinnen
    const h = hoogtes[j];
    const naam = `${ontleed.bMm}x${h}${ontleed.achtervoegsel}`;
    voorstellen.push({
      id: `hout:${naam}`,
      label: `${ontleed.bMm} x ${h}`,
      stap,
      soort: "maat",
      profielnaam: naam,
      korf: null,
      iMm4: rechthoekIMm4(ontleed.bMm, h),
      aMm2: ontleed.bMm * h,
      onmogelijk: null,
    });
  }

  return {
    beamId,
    materiaal: "hout",
    huidig: {
      label,
      iMm4: rechthoekIMm4(ontleed.bMm, ontleed.hMm),
      aMm2: ontleed.bMm * ontleed.hMm,
    },
    voorstellen,
    reden:
      voorstellen.length === 0
        ? `reeks "${reeks.reeks}" bevat maar één hoogte`
        : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Beton — hoogte én wapening
// ═══════════════════════════════════════════════════════════════════════════

/** De stap waarmee de balkhoogte varieert (mm); twee stappen op en neer. */
export const BETON_HOOGTESTAP_MM = 50;

/**
 * Oppervlakte en traagheidsmoment van de BRUTO betondoorsnede (ongescheurd,
 * zonder wapening), uit dezelfde bandenbeschrijving die de tekening en de
 * korfcontrole gebruiken.
 *
 * Bruto en ongescheurd — dat is een BENADERING van de werkelijke stijfheid van
 * een gewapende balk, die in gescheurde toestand lager ligt en van de wapening
 * afhangt. Hier is hij goed genoeg: hij dient alleen om te kunnen zeggen of een
 * variant stijver of slapper is dan de huidige doorsnede, en die volgorde
 * verandert niet door de scheurvorming.
 */
export function brutoDoorsnede(d: ConcreteSectionInput): { aMm2: number; iMm4: number } {
  const bs = banden(d);
  let a = 0;
  let sz = 0;
  for (const b of bs) {
    const opp = b.bMm * (b.z1Mm - b.z0Mm);
    a += opp;
    sz += opp * (b.z0Mm + b.z1Mm) / 2;
  }
  if (a <= 0) return { aMm2: 0, iMm4: 0 };
  const zc = sz / a;
  let i = 0;
  for (const b of bs) {
    const h = b.z1Mm - b.z0Mm;
    const opp = b.bMm * h;
    const zb = (b.z0Mm + b.z1Mm) / 2;
    i += (b.bMm * h ** 3) / 12 + opp * (zb - zc) ** 2;
  }
  return { aMm2: a, iMm4: i };
}

/** De doorsnede met een andere totale hoogte; flensdikte en lijfbreedte blijven. */
export function metHoogte(d: ConcreteSectionInput, hMm: number): ConcreteSectionInput {
  return { ...d, h_mm: hMm };
}

/**
 * De acht betonvarianten: vier hoogtes (2 × 50 mm op en neer, zelfde korf) en
 * vier wapeningsvarianten (een staaf erbij of eraf bij gelijke diameter, een
 * diametermaat op of neer bij gelijk aantal).
 *
 * ALLEEN DE ONDERWAPENING varieert. Dat is de trekwapening van een normaal
 * belaste ligger en dus de wapening die de buigcapaciteit bepaalt; de
 * bovenwapening meebewegen zou twee dingen tegelijk veranderen en de tabel
 * onleesbaar maken. Staat er geen onderwapening, dan vervallen de
 * wapeningsvarianten met die reden.
 *
 * `controleer` is de geometriecontrole die bepaalt of de staven nog naast
 * elkaar passen — in de app is dat `controleerKorf` uit
 * `components/beton/wapeningskorf.ts`, dat naar de breedte OP DE HOOGTE VAN DE
 * RIJ kijkt. Hij wordt als parameter meegegeven zodat deze module puur blijft
 * en de test hem kan meesturen. Een variant die niet past wordt MÉT die reden
 * getoond, niet weggelaten.
 */
export function betonVarianten(
  beamId: number,
  doorsnede: ConcreteSectionInput,
  korf: ReinforcementCage,
  diameters: readonly number[],
  controleer: (d: ConcreteSectionInput, k: ReinforcementCage) => string | null,
): VariantenVoorStaaf {
  const huidigeMaten = brutoDoorsnede(doorsnede);
  const voorstellen: VariantVoorstel[] = [];

  // ── Hoogte: 2 × 50 mm op en neer, zelfde korf ───────────────────────────
  for (const stap of [-2, -1, 1, 2]) {
    const h = doorsnede.h_mm + stap * BETON_HOOGTESTAP_MM;
    if (h <= 0) continue; // een hoogte ≤ 0 is geen doorsnede, geen "past niet"
    const d = metHoogte(doorsnede, h);
    const maten = brutoDoorsnede(d);
    // Een flens die niet meer binnen de hoogte past is dezelfde fout die
    // parseConcreteSection en de kern melden; die tekst hoort hier ook.
    const geometrie =
      d.shape !== "Rectangle" && d.h_f_mm !== null && d.h_f_mm >= d.h_mm
        ? `de flensdikte h_f = ${d.h_f_mm} mm laat geen lijf over binnen de hoogte ${h} mm`
        : controleer(d, korf);
    voorstellen.push({
      id: `beton:h${h}`,
      label: `h = ${h} mm`,
      stap,
      soort: "maat",
      // Terug naar de profielnaam-grammatica van `betonCheckBuilder`, want dat
      // is in dit datamodel de enige plaats waar een betondoorsnede staat. De
      // meewerkende flensbreedte wordt bewust NIET hier verwerkt: die leidt de
      // bouwer zelf af uit de liggerlijn, en die hangt van de overspanningen af
      // en niet van de hoogte.
      profielnaam: formatConcreteSection(d),
      korf: null,
      iMm4: maten.iMm4,
      aMm2: maten.aMm2,
      onmogelijk: geometrie,
    });
  }

  // ── Wapening: alleen de onderwapening ───────────────────────────────────
  const onder = korf.bottom;
  if (onder.count > 0 && onder.diameter_mm > 0) {
    const wapening = (
      id: string,
      label: string,
      stap: number,
      soort: VariantSoort,
      nieuw: ReinforcementCage,
    ) => {
      voorstellen.push({
        id,
        label,
        stap,
        soort,
        profielnaam: null,
        korf: nieuw,
        // De BRUTO betondoorsnede verandert niet door meer of minder staal;
        // de stijfheid van de gescheurde doorsnede wél, maar dat is een
        // tweede-orde-effect naast een hoogtewijziging. Zie de toelichting bij
        // `brutoDoorsnede`.
        iMm4: huidigeMaten.iMm4,
        aMm2: huidigeMaten.aMm2,
        onmogelijk: controleer(doorsnede, nieuw),
      });
    };

    // Een staaf erbij of eraf, gelijke diameter.
    for (const stap of [-1, 1]) {
      const n = onder.count + stap;
      if (n < 1) continue; // nul staven is geen wapeningsvariant maar een andere balk
      const nieuw: ReinforcementCage = {
        ...korf,
        bottom: { count: n, diameter_mm: onder.diameter_mm },
      };
      wapening(
        `beton:n${n}`,
        `onder ${n}Ø${onder.diameter_mm}`,
        stap,
        "wapeningAantal",
        nieuw,
      );
    }

    // Een diametermaat op of neer, gelijk aantal.
    const gesorteerd = [...diameters].sort((a, b) => a - b);
    const di = gesorteerd.indexOf(onder.diameter_mm);
    if (di >= 0) {
      for (const stap of [-1, 1]) {
        const j = di + stap;
        if (j < 0 || j >= gesorteerd.length) continue; // bestaat niet in de handelsmaten
        const d = gesorteerd[j];
        const nieuw: ReinforcementCage = {
          ...korf,
          bottom: { count: onder.count, diameter_mm: d },
        };
        wapening(
          `beton:d${d}`,
          `onder ${onder.count}Ø${d}`,
          stap,
          "wapeningDiameter",
          nieuw,
        );
      }
    }
  }

  const label =
    doorsnede.shape === "Rectangle"
      ? `${doorsnede.b_mm} x ${doorsnede.h_mm}`
      : `${doorsnede.shape === "Tee" ? "T" : "L"} ${doorsnede.b_mm} x ${doorsnede.h_mm}`;

  return {
    beamId,
    materiaal: "beton",
    huidig: { label, iMm4: huidigeMaten.iMm4, aMm2: huidigeMaten.aMm2 },
    voorstellen,
    reden: voorstellen.length === 0 ? "geen variant af te leiden uit deze doorsnede" : null,
  };
}
