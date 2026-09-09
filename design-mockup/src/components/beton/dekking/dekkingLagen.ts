/**
 * dekkingLagen — de vier lagen van het betonvenster, als getallen.
 *
 * De tekening (`AanzichtTekening`) bevat geen enkele afleiding: zij zet neer
 * wat hier uitkomt. Dat is met opzet, want juist de afleidingen zijn te toetsen
 * zonder DOM — `test-dekkingsvenster.mjs` doet dat — en een tekening die zelf
 * rekent laat zich alleen met het oog controleren.
 *
 * ── DE VIER LAGEN ──────────────────────────────────────────────────────────
 *
 *   momentdekking     §9.2.1.3, figuur 9.2 — per plaats de benodigde
 *                     trekkracht F_s (regel B) naast de weerstandbiedende
 *                     F_Rs (regel C), per zijde van de doorsnede.
 *   dwarskrachtdekking §6.2 — per plaats |V_Ed| naast V_Rd.
 *   scheurwijdte      §7.3.4 — per plaats w_k naast w_max van tabel 7.1N.
 *   unity checks      de maatgevende UC per snede over de lagen hierboven.
 *
 * Alle vier komen uit de rekenkern; hier wordt niets nagerekend. Wat hier
 * gebeurt is uitsluitend: de vier vormen op één noemer brengen ([`LijnPunt`]),
 * de stukken aanwijzen waar de benodigde lijn boven de aanwezige uitkomt
 * ([`tekortVakken`]) en de vier UC-verlopen tot één balk samenvoegen
 * ([`ucVerloop`]).
 *
 * ── WAAROM ER NIET WORDT GEÏNTERPOLEERD OVER EEN SPRONG ────────────────────
 *
 * Op elke zonegrens staan TWEE punten met dezelfde x: één met `zijde: "Links"`
 * en één met `"Rechts"`. Daar SPRINGT de weerstand, en een waarde tussen die
 * twee in bestaat niet — de kern zegt dat met zoveel woorden. Elke functie
 * hieronder die twee opeenvolgende punten met elkaar verbindt, slaat een paar
 * met gelijke x dus over in plaats van er doorheen te rekenen.
 */
import type { Dwarskrachtpunt } from "../../../lib/types/concrete/Dwarskrachtpunt";
import type { Momentdekking } from "../../../lib/types/concrete/Momentdekking";
import type { Momentpunt } from "../../../lib/types/concrete/Momentpunt";

/** De vier lagen, elk los aan en uit te zetten. */
export type LaagId = "moment" | "dwarskracht" | "scheurwijdte" | "uc";

export interface LaagInfo {
  id: LaagId;
  label: string;
  /** Tooltip; noemt het normartikel, want dat is wat de laag beweert. */
  hint: string;
  /** Kleurstip vóór het label, zelfde rol als in de resultaten-vinkjes. */
  swatch: string;
}

/**
 * De volgorde waarin de lagen in de werkbalk staan — van boven naar beneden
 * dezelfde volgorde als waarin ze in de tekening liggen, zodat het vinkje en
 * de laan bij elkaar te vinden zijn.
 */
export const LAGEN: readonly LaagInfo[] = [
  {
    id: "moment",
    label: "Momentendekking",
    hint: "§9.2.1.3, figuur 9.2 — de benodigde trekkracht F_s (ná de verschuiving over a_l) naast de weerstandbiedende F_Rs van de staven die er werkelijk liggen, per zijde",
    swatch: "#2563eb",
  },
  {
    id: "dwarskracht",
    label: "Dwarskrachtdekking",
    hint: "§6.2 — |V_Ed| naast V_Rd per snede, met de route die V_Rd leverde; V_Rd,c en V_Rd,s worden nergens opgeteld",
    swatch: "#10b981",
  },
  {
    id: "scheurwijdte",
    label: "Scheurwijdte",
    hint: "§7.3.4 — w_k per snede onder de frequente BGT-combinatie, naast w_max van tabel 7.1N; wordt per snede bij de rekenkern opgevraagd en staat daarom standaard uit",
    swatch: "#8b5cf6",
  },
  {
    id: "uc",
    label: "Unity checks",
    hint: "De maatgevende unity check per snede over de andere drie lagen, als kleurbalk — groen ≤ 0,9, amber tot 1,0, rood daarboven",
    swatch: "#dc2626",
  },
] as const;

export type LaagVlaggen = Record<LaagId, boolean>;

/**
 * De beginstand. De scheurwijdte staat UIT: zij is de enige laag die de
 * rekenkern per snede opnieuw moet aanroepen (§7.3.4 wordt door
 * `check_concrete_beams` voor de maatgevende snede bepaald, niet als lijn), en
 * dat mag niet ongevraagd gebeuren bij elke selectie. Zie `scheurwijdteLijn.ts`.
 */
export const STANDAARD_LAGEN: LaagVlaggen = {
  moment: true,
  dwarskracht: true,
  scheurwijdte: false,
  uc: true,
};

/**
 * Eén plaats op een lijn, op de noemer waarop alle vier de lagen te tekenen
 * zijn: een benodigde waarde, een aanwezige, en de verhouding ertussen.
 *
 * `aanwezig` mag ontbreken — de dwarskrachtdekking kan een snede hebben waar
 * geen V_Rd te bepalen was, en dan is er geen weerstand om naast te zetten,
 * alleen een reden. Diezelfde snede heeft dan ook geen `uc`.
 */
export interface LijnPunt {
  xMm: number;
  /** De optredende waarde: F_s in kN, |V_Ed| in kN, w_k in mm. */
  benodigd: number;
  /** De opneembare waarde: F_Rs in kN, V_Rd in kN, w_max in mm. */
  aanwezig: number | null;
  /** benodigd/aanwezig zoals de kern hem geeft; niet hier uitgerekend. */
  uc: number | null;
  /**
   * Ligt dit punt binnen l_bd van een staafeinde? Daar geldt niet de vrije
   * dekkingslijn maar §9.2.1.4/§9.2.1.5, en de kern sluit die stukken uit bij
   * het aanwijzen van de maatgevende plaats. De tekening moet dat laten zien
   * in plaats van er een tekort te suggereren dat een ander artikel regelt.
   */
  eindzone: boolean;
  /** Korte reden waarom er geen aanwezige waarde is; leeg als die er wel is. */
  reden?: string;
}

/** Eén te tekenen lijn, met alles wat de laan eromheen nodig heeft. */
export interface Laan {
  /** "Momentendekking onder", "Dwarskracht", … */
  titel: string;
  /** "kN" of "mm". */
  eenheid: string;
  /** Wat de dikke lijn is: "F_s", "|V_Ed|", "w_k". */
  benodigdLabel: string;
  /** Wat de trapjeslijn is: "F_Rs", "V_Rd", "w_max". */
  aanwezigLabel: string;
  punten: LijnPunt[];
  /** Index in `punten` van de maatgevende plaats; van de kern, niet herzocht. */
  maatgevend?: number;
  /** Naar welke kant de laan zich uitstrekt: omhoog (boven de staaf) of omlaag. */
  richting: "omhoog" | "omlaag";
  /** Kleur van de reeks. */
  kleur: string;
}

/** Een aaneengesloten stuk van de staaf, in mm vanaf de beginknoop. */
export interface Vak {
  x0Mm: number;
  x1Mm: number;
}

/** Ligt tussen deze twee punten een SPRONG (dezelfde x, twee waarden)? */
function isSprong(a: LijnPunt, b: LijnPunt): boolean {
  return Math.abs(b.xMm - a.xMm) < 1e-9;
}

/**
 * De momentdekking van één zijde als laan.
 *
 * `benodigd_kn` is regel B van figuur 9.2 — de trekkracht ná de verschuiving
 * over a_l — en `aanwezig_kn` regel C, de weerstand van de staven die er
 * werkelijk liggen, met het lineaire krachtverloop van §9.2.1.3(3) binnen
 * l_bd al verrekend. De omhullende zelf (regel A) wordt apart doorgegeven; zie
 * [`omhullendeLijn`].
 */
export function momentLaan(dekking: Momentdekking, kleur: string): Laan {
  return {
    titel: `Momentendekking ${dekking.side === "Bottom" ? "onder" : "boven"}`,
    eenheid: "kN",
    benodigdLabel: "F_s",
    aanwezigLabel: "F_Rs",
    punten: dekking.punten.map(momentPunt),
    maatgevend: dekking.maatgevend ?? undefined,
    // De ONDERwapening neemt het positieve moment op, en dat trekt volgens de
    // tekenconventie van deze app (zie het blok SNEDETEKENS in
    // FemResultsOverlay) aan de ONDERvezel. De momentenlijn op het canvas
    // wordt op de trekzijde uitgezet, dus naar beneden; deze laan hoort daar
    // aan dezelfde kant te liggen. Een dekkingslijn die andersom staat dan het
    // diagram erboven is onbruikbaar.
    richting: dekking.side === "Bottom" ? "omlaag" : "omhoog",
    kleur,
  };
}

function momentPunt(p: Momentpunt): LijnPunt {
  return {
    xMm: p.x_mm,
    benodigd: p.benodigd_kn,
    aanwezig: p.aanwezig_kn,
    uc: p.uc ?? null,
    eindzone: p.in_eindzone,
  };
}

/**
 * Regel A van figuur 9.2: de omhullende van M_Ed/z + N_Ed op de plaats zelf,
 * dus vóór de verschuiving over a_l.
 *
 * Zij wordt als dunne stippellijn onder de benodigde lijn getekend. Dat is de
 * enige manier om a_l te ZIEN: het verschil tussen de twee lijnen ís de
 * verschuiving, en zonder regel A lijkt de benodigde kracht bij het steunpunt
 * uit de lucht te komen.
 */
export function omhullendeLijn(dekking: Momentdekking): { xMm: number; waarde: number }[] {
  return dekking.punten.map((p) => ({ xMm: p.x_mm, waarde: p.omhullende_kn }));
}

/** De dwarskrachtdekking als laan: |V_Ed| naast V_Rd. */
export function dwarskrachtLaan(
  punten: readonly Dwarskrachtpunt[],
  maatgevend: number | null | undefined,
  kleur: string,
): Laan {
  return {
    titel: "Dwarskrachtdekking",
    eenheid: "kN",
    benodigdLabel: "|V_Ed|",
    aanwezigLabel: "V_Rd",
    punten: punten.map((p) => ({
      xMm: p.x_mm,
      benodigd: p.benodigd_kn,
      aanwezig: p.aanwezig_kn ?? null,
      uc: p.uc ?? null,
      // De dwarskrachtdekking kent GEEN eindzone: 6.2.1(8) is niet toegepast
      // (het model heeft geen oplegvlak), dus de lijn toetst tot in de
      // oplegging. Dat staat in de kanttekeningen van het antwoord.
      eindzone: false,
      ...(p.reden ? { reden: p.reden } : {}),
    })),
    maatgevend: maatgevend ?? undefined,
    richting: "omlaag",
    kleur,
  };
}

/**
 * De stukken waar de BENODIGDE lijn boven de AANWEZIGE uitkomt — het tekort.
 *
 * Dit is waarvoor het venster bestaat: niet dát er een lijn is, maar wáár de
 * wapening tekortschiet. Op een snijpunt binnen een segment wordt lineair
 * teruggerekend waar de twee lijnen elkaar kruisen, zodat de rode vlek precies
 * op de goede millimeter begint; over een SPRONG wordt niet geïnterpoleerd —
 * daar begint of eindigt het tekort op de sprong zelf.
 *
 * Punten in de EINDZONE tellen niet mee: daar geldt §9.2.1.4/§9.2.1.5 en niet
 * de vrije dekkingslijn, en de weerstandslijn begint er per definitie bij nul.
 * Zonder die uitzondering zou elke staaf twee rode vlekken bij de opleggingen
 * hebben en zou de tekening niets meer onderscheiden.
 */
export function tekortVakken(punten: readonly LijnPunt[]): Vak[] {
  const uit: Vak[] = [];
  const tekort = (p: LijnPunt) =>
    !p.eindzone && p.aanwezig !== null && p.benodigd > p.aanwezig;
  const marge = (p: LijnPunt) => (p.aanwezig ?? 0) - p.benodigd;
  let start: number | null = null;
  for (let i = 0; i < punten.length; i++) {
    const p = punten[i];
    const nu = tekort(p);
    if (nu && start === null) {
      // Waar begint het? Op het vorige punt kruisten de lijnen elkaar ergens
      // tussen dat punt en dit; bij een sprong is dat de sprong zelf.
      const vorige = i > 0 ? punten[i - 1] : null;
      start = vorige && !vorige.eindzone && vorige.aanwezig !== null && !isSprong(vorige, p)
        ? kruising(vorige, p, marge)
        : p.xMm;
    } else if (!nu && start !== null) {
      const vorige = punten[i - 1];
      const eind = !p.eindzone && p.aanwezig !== null && !isSprong(vorige, p)
        ? kruising(vorige, p, marge)
        : vorige.xMm;
      if (eind > start) uit.push({ x0Mm: start, x1Mm: eind });
      start = null;
    }
  }
  if (start !== null) {
    const laatste = punten[punten.length - 1];
    if (laatste.xMm > start) uit.push({ x0Mm: start, x1Mm: laatste.xMm });
  }
  return uit;
}

/** Waar tussen `a` en `b` wordt `f` nul? Lineair; nooit over een sprong. */
function kruising(a: LijnPunt, b: LijnPunt, f: (p: LijnPunt) => number): number {
  const fa = f(a);
  const fb = f(b);
  if (fa === fb) return b.xMm;
  const t = fa / (fa - fb);
  return a.xMm + t * (b.xMm - a.xMm);
}

/**
 * De stukken die binnen l_bd van een staafeinde liggen — de EINDZONES.
 *
 * Ze worden gearceerd getekend met de artikelen erbij. Zonder die markering
 * leest de lezer daar een tekort dat er niet is: de weerstandslijn begint bij
 * het staafeinde bij nul, terwijl §9.2.1.4/§9.2.1.5 de verankering op het
 * steunpunt met een eigen eis regelen.
 */
export function eindzoneVakken(punten: readonly LijnPunt[]): Vak[] {
  const uit: Vak[] = [];
  let start: number | null = null;
  for (let i = 0; i < punten.length; i++) {
    if (punten[i].eindzone && start === null) start = punten[i].xMm;
    else if (!punten[i].eindzone && start !== null) {
      uit.push({ x0Mm: start, x1Mm: punten[i - 1].xMm });
      start = null;
    }
  }
  if (start !== null) uit.push({ x0Mm: start, x1Mm: punten[punten.length - 1].xMm });
  return uit;
}

/**
 * Het punt dat op plaats `xMm` geldt.
 *
 * Op een sprong staan twee punten met dezelfde x. Er wordt dan gekozen voor de
 * kant met de LAAGSTE marge (aanwezig − benodigd): dat is de ongunstige kant
 * van de sprong, en de aanwijzer hoort te melden wat er misgaat en niet wat er
 * net nog goed ging. Tussen twee punten wordt het dichtstbijzijnde genomen en
 * niet geïnterpoleerd — de lezer wijst een snede aan, en die snede bestaat.
 */
export function puntBijX(punten: readonly LijnPunt[], xMm: number): LijnPunt | null {
  if (punten.length === 0) return null;
  let beste = punten[0];
  let besteAfstand = Infinity;
  for (const p of punten) {
    const d = Math.abs(p.xMm - xMm);
    if (d < besteAfstand - 1e-9) {
      beste = p;
      besteAfstand = d;
    } else if (Math.abs(d - besteAfstand) <= 1e-9) {
      const marge = (q: LijnPunt) => (q.aanwezig === null ? -Infinity : q.aanwezig - q.benodigd);
      if (marge(p) < marge(beste)) beste = p;
    }
  }
  return beste;
}

/** Eén bron voor de kleurbalk: een lijn met een naam. */
export interface UcBron {
  naam: string;
  punten: readonly LijnPunt[];
}

/** Eén stukje kleurbalk: van x0 tot x1 met de maatgevende UC en zijn bron. */
export interface UcVak {
  x0Mm: number;
  x1Mm: number;
  uc: number;
  bron: string;
}

/**
 * De maatgevende unity check per snede, over alle meegegeven bronnen.
 *
 * De bronnen hebben elk hun eigen stationsraster — de momentendekking en de
 * dwarskrachtdekking delen dat van de omhullende, de scheurwijdte heeft een
 * eigen, grover raster. Er wordt daarom eerst één x-lijst gemaakt uit alle
 * bronnen samen, en per plaats de HOOGSTE unity check genomen met de naam van
 * de bron die hem levert.
 *
 * Punten in de eindzone doen niet mee, om dezelfde reden als bij
 * [`tekortVakken`]: daar geldt een ander artikel. Ligt er op een plaats van
 * geen enkele bron een unity check, dan komt er geen vak — een gat in de balk
 * is eerlijker dan een groen vak dat "niet bepaald" betekent.
 */
export function ucVerloop(bronnen: readonly UcBron[]): UcVak[] {
  const xen = new Set<number>();
  for (const b of bronnen) for (const p of b.punten) if (!p.eindzone) xen.add(p.xMm);
  const lijst = [...xen].sort((a, b) => a - b);
  const vakken: UcVak[] = [];
  for (let i = 0; i + 1 < lijst.length; i++) {
    const x0 = lijst[i];
    const x1 = lijst[i + 1];
    if (x1 - x0 < 1e-9) continue;
    let hoogste = -Infinity;
    let bron = "";
    for (const b of bronnen) {
      for (const x of [x0, x1]) {
        const p = puntBijX(b.punten, x);
        if (!p || p.eindzone || p.uc === null) continue;
        // Alleen punten die werkelijk op deze x liggen tellen mee; een bron
        // met een grover raster mag geen waarde van 300 mm verderop lenen.
        if (Math.abs(p.xMm - x) > 1e-6) continue;
        if (p.uc > hoogste) {
          hoogste = p.uc;
          bron = b.naam;
        }
      }
    }
    if (hoogste > -Infinity) vakken.push({ x0Mm: x0, x1Mm: x1, uc: hoogste, bron });
  }
  return vakken;
}

/**
 * Voeg opeenvolgende vakken met DEZELFDE kleurklasse samen tot één vak.
 *
 * Waarom dat moet: de omhullende levert per staaf een paar honderd stations,
 * dus [`ucVerloop`] geeft evenzoveel vakjes. Naast elkaar getekend laten die
 * een haarlijn tussen elke twee vakjes staan, en een kleurbalk met tweehonderd
 * witte streepjes leest als een streepjescode en niet als een balk. Samenvoegen
 * kost niets: de balk TOONT de klasse, en binnen één klasse is de grens tussen
 * twee vakjes geen informatie.
 *
 * Het samengevoegde vak draagt de HOOGSTE unity check van de vakken waaruit hij
 * bestaat, met de bron die hem levert — niet een gemiddelde, want een balk die
 * de ergste snede wegmiddelt is precies wat hij niet mag doen.
 */
export function voegUcVakkenSamen(vakken: readonly UcVak[]): UcVak[] {
  const uit: UcVak[] = [];
  for (const v of vakken) {
    const vorig = uit[uit.length - 1];
    if (
      vorig !== undefined &&
      ucKlasse(vorig.uc) === ucKlasse(v.uc) &&
      Math.abs(vorig.x1Mm - v.x0Mm) < 1e-6
    ) {
      vorig.x1Mm = v.x1Mm;
      if (v.uc > vorig.uc) {
        vorig.uc = v.uc;
        vorig.bron = v.bron;
      }
      continue;
    }
    uit.push({ ...v });
  }
  return uit;
}

/**
 * De drie klassen waarin de app een unity check indeelt — dezelfde grenzen en
 * dezelfde kleuren als het toetsingspaneel (`CheckPanel.ucClass`), zodat een
 * plek die hier amber is, daar niet groen heet.
 */
export type UcKlasse = "ok" | "waarschuwing" | "onvoldoende";

export function ucKlasse(uc: number): UcKlasse {
  if (uc > 1.0) return "onvoldoende";
  if (uc > 0.9) return "waarschuwing";
  return "ok";
}

export const UC_KLEUR: Record<UcKlasse, string> = {
  ok: "#16a34a",
  waarschuwing: "var(--theme-accent, #d97706)",
  onvoldoende: "var(--theme-danger-color, #dc2626)",
};

/**
 * De grootste waarde die op een laan voorkomt, voor de schaal van de laan.
 *
 * Zowel de benodigde als de aanwezige lijn telt mee: schaalde de laan alleen
 * op de benodigde, dan liep de weerstandslijn bij een ruim gedimensioneerde
 * staaf buiten beeld en was juist de RUIMTE niet te zien.
 */
export function laanMaximum(punten: readonly LijnPunt[]): number {
  let m = 0;
  for (const p of punten) {
    if (p.benodigd > m) m = p.benodigd;
    if (p.aanwezig !== null && p.aanwezig > m) m = p.aanwezig;
  }
  return m;
}
