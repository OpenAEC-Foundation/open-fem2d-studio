/**
 * wapeningskorf.ts — het korfmodel van de frontend en de geometrie die de
 * tekening nodig heeft.
 *
 * De kern (nen-en-1992-1-1/section.rs) kent alleen `ReinforcementCage`:
 * dekking, beugel, boven- en onderwapening. De frontend bundelt dat met de
 * doorsnedeafmetingen, de materiaalkeuzes en de rekeninstellingen tot één
 * `Wapeningskorf`, zodat de editor en de tekening één object doorgeven.
 *
 * De ligging van de staafassen volgt dezelfde regel als de kern:
 *   afstand staafas tot betonrand = c_nom + Ø_beugel + Ø_hoofd / 2,
 * met de dekking van DIE rand — zie `dekkingVanZijdeMm`.
 */
import type { ConcreteSectionInput } from "../../lib/types/concrete/ConcreteSectionInput";
import type { CoverSide } from "../../lib/types/concrete/CoverSide";
import type { FaceCover } from "../../lib/types/concrete/FaceCover";
import type { ReinforcementCage } from "../../lib/types/concrete/ReinforcementCage";
import type { RebarRow } from "../../lib/types/concrete/RebarRow";
import type { SteelBranch } from "../../lib/types/concrete/SteelBranch";
import type { ExposureClass } from "../../lib/types/concrete/ExposureClass";
import type { StructuralClass } from "../../lib/types/concrete/StructuralClass";
import { DEFAULT_N_STRIPS, DEFAULT_REINFORCEMENT_GRADE } from "../../lib/betonCheckBuilder";

export interface Wapeningskorf {
  /**
   * De doorsnede: rechthoek, T of L. Letterlijk het type dat de kern
   * verwacht — de editor en de tekening delen dus één beschrijving met de
   * berekening, en er is geen tweede plaats waar een T anders wordt bedoeld.
   */
  doorsnede: ConcreteSectionInput;
  /** Betonsterkteklasse, bijv. "C30/37". */
  betonklasse: string;
  /** Wapeningsstaal, bijv. "B500B". */
  staalsoort: string;
  korf: ReinforcementCage;
  /**
   * Milieuklasse van tabel 4.1; `null` = nog niet gekozen.
   *
   * Er is met opzet GEEN standaardklasse. Zonder milieuklasse is er geen
   * c_min,dur en dus geen dekkingstoets — en dat staat er dan ook, in plaats
   * van dat de app stilzwijgend XC1 aanneemt en een dekking goedkeurt die bij
   * een chloridemilieu ver te dun is.
   */
  milieuklasse: ExposureClass | null;
  /**
   * Constructieklasse; `null` = de waarde van de nationale bijlage bij
   * 4.4.1.2(5): S4 voor een ontwerplevensduur van 50 jaar.
   */
  constructieklasse: StructuralClass | null;
  /** In hoeveel stroken de doorsnede voor de integratie wordt opgeknipt. */
  aantalStroken: number;
  /** Bovenste tak van het staaldiagram (3.2.7(2)). */
  staaltak: SteelBranch;
}

/** Een rechthoek b × h als `ConcreteSectionInput`. */
export function rechthoek(bMm: number, hMm: number): ConcreteSectionInput {
  return {
    shape: "Rectangle",
    b_mm: bMm,
    h_mm: hMm,
    b_w_mm: null,
    h_f_mm: null,
    flange_at_bottom: false,
  };
}

/** Een gangbare balkkorf als startpunt voor de editor. Geen normwaarde. */
export const STANDAARD_KORF: Wapeningskorf = {
  doorsnede: rechthoek(300, 500),
  betonklasse: "C30/37",
  staalsoort: DEFAULT_REINFORCEMENT_GRADE,
  korf: {
    cover_mm: 30,
    stirrup_diameter_mm: 8,
    top: { count: 2, diameter_mm: 12 },
    bottom: { count: 3, diameter_mm: 16 },
  },
  // Geen milieuklasse: die moet de constructeur kiezen. Zie het veld zelf.
  milieuklasse: null,
  constructieklasse: null,
  aantalStroken: DEFAULT_N_STRIPS,
  staaltak: "Horizontal",
};

// ── De meetkunde van de doorsnede, zoals de tekening en de controle hem
//    nodig hebben ────────────────────────────────────────────────────────
//
// Spiegel van `ConcreteSection` in de kern: een reeks horizontale BANDEN met
// elk een breedte en een hoogtebereik. Twee banden volstaan voor rechthoek, T
// en L, en de tekening hoeft dan niet per vorm te vertakken.

/** Eén horizontale band: een breedte over een hoogtebereik, z vanaf onder. */
export interface Band {
  z0Mm: number;
  z1Mm: number;
  bMm: number;
}

/** De banden van onder (z = 0) naar boven (z = h). */
export function banden(d: ConcreteSectionInput): Band[] {
  if (d.shape === "Rectangle" || d.b_w_mm === null || d.h_f_mm === null) {
    return [{ z0Mm: 0, z1Mm: d.h_mm, bMm: d.b_mm }];
  }
  const hF = d.h_f_mm;
  const bW = d.b_w_mm;
  return d.flange_at_bottom
    ? [
        { z0Mm: 0, z1Mm: hF, bMm: d.b_mm },
        { z0Mm: hF, z1Mm: d.h_mm, bMm: bW },
      ]
    : [
        { z0Mm: 0, z1Mm: d.h_mm - hF, bMm: bW },
        { z0Mm: d.h_mm - hF, z1Mm: d.h_mm, bMm: d.b_mm },
      ];
}

/**
 * De breedte die op hoogte `zMm` werkelijk aanwezig is, mm. Op een bandgrens
 * de KLEINSTE van de twee — een staaf die precies op de overgang ligt, moet
 * in het smalste deel passen. Zelfde regel als `width_at_mm` in de kern.
 */
export function breedteOpHoogteMm(d: ConcreteSectionInput, zMm: number): number {
  let w = Infinity;
  for (const b of banden(d)) {
    if (zMm >= b.z0Mm && zMm <= b.z1Mm) w = Math.min(w, b.bMm);
  }
  return Number.isFinite(w) ? w : 0;
}

/**
 * De omtrek van de doorsnede als SVG-punten (x vanaf de linkerrand van de
 * OMHULLENDE breedte b, z vanaf de onderrand), tegen de klok in.
 *
 * Bij een L ligt de flens aan één kant en bij een T aan beide kanten. Dat
 * verschil is voor de berekening geen verschil — b(z) is identiek — maar voor
 * de TEKENING wél: wie een L als een T tekent, laat de constructeur iets
 * anders zien dan hij heeft ingevoerd.
 */
export function omtrekPunten(d: ConcreteSectionInput): Array<[number, number]> {
  const b = d.b_mm;
  const h = d.h_mm;
  if (d.shape === "Rectangle" || d.b_w_mm === null || d.h_f_mm === null) {
    return [
      [0, 0],
      [b, 0],
      [b, h],
      [0, h],
    ];
  }
  const bW = d.b_w_mm;
  const hF = d.h_f_mm;
  // Links van het lijf: bij een T de halve uitkraging, bij een L niets — daar
  // staat het lijf tegen de rand aan.
  const x0 = d.shape === "Ell" ? 0 : (b - bW) / 2;
  const x1 = x0 + bW;
  const punten: Array<[number, number]> = d.flange_at_bottom
    ? [
        [0, 0],
        [b, 0],
        [b, hF],
        [x1, hF],
        [x1, h],
        [x0, h],
        [x0, hF],
        [0, hF],
      ]
    : [
        [x0, 0],
        [x1, 0],
        [x1, h - hF],
        [b, h - hF],
        [b, h],
        [0, h],
        [0, h - hF],
        [x0, h - hF],
      ];
  // Bij een L staat het lijf tegen de linkerrand (x0 = 0), en dan vallen de
  // laatste twee hoekpunten samen. De vorm klopt ook mét dat dubbele punt —
  // een polygoon met een nulzijde tekent hetzelfde — maar een omtrek met een
  // zijde van lengte nul is geen omtrek die je wilt doorgeven; hij komt terug
  // zodra er iets anders mee gebeurt dan tekenen.
  return punten.filter(
    (p, i) => i === 0 || p[0] !== punten[i - 1][0] || p[1] !== punten[i - 1][1],
  );
}

/** Waar het midden van de rij op hoogte `zMm` ligt, in x vanaf de linkerrand. */
export function hartXMm(d: ConcreteSectionInput, zMm: number): number {
  const breedte = breedteOpHoogteMm(d, zMm);
  if (d.shape === "Ell" && breedte < d.b_mm) return breedte / 2;
  return d.b_mm / 2;
}

/** Gangbare staafdiameters (handelsmaten, geen normwaarden). */
export const STAAFDIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32, 40] as const;

/** Gangbare beugeldiameters; 0 = geen beugel. */
export const BEUGELDIAMETERS = [0, 6, 8, 10, 12] as const;

/**
 * De AANDUIDINGEN van de milieuklassen van tabel 4.1, in de volgorde van de
 * tabel — als terugval voor de keuzelijst wanneer de rekenkern niet bereikbaar
 * is (browser zonder toetsbrug-binary).
 *
 * Alleen de aanduidingen: de omschrijvingen en de voorbeelden komen uit de
 * kern (`list_exposure_classes`), zodat de normtekst maar op één plaats staat.
 * Dezelfde afspraak als `SUPPORTED_CONCRETE_CLASSES` in `betonCheckBuilder`.
 */
export const MILIEUKLASSEN = [
  "X0",
  "XC1",
  "XC2",
  "XC3",
  "XC4",
  "XD1",
  "XD2",
  "XD3",
  "XS1",
  "XS2",
  "XS3",
  "XF1",
  "XF2",
  "XF3",
  "XF4",
  "XA1",
  "XA2",
  "XA3",
] as const;

/** De constructieklassen van 4.4.1.2(5); S4 is de NB-waarde voor 50 jaar. */
export const CONSTRUCTIEKLASSEN = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;

// ── De dekking per betonoppervlak (4.4.1.1(1)P) ──────────────────────────────
//
// De norm meet de dekking tot "het dichtstbijzijnde betonoppervlak"; een balk
// heeft er vier. De kern kent er drie — boven, onder en de twee zijkanten
// samen — en waarom, staat bij `CoverSide` in de gegenereerde typen (afkomstig
// uit nen-en-1992-1-1/src/dekking.rs). Deze frontend spiegelt die keuze; ze
// mogen niet uiteenlopen, want de tekening en de berekening moeten dezelfde
// staaf laten zien.

/** De drie zijden in de volgorde van de tekening. */
export const ZIJDEN = ["Top", "Bottom", "Sides"] as const satisfies readonly CoverSide[];

/** Nederlandse aanduiding per zijde; gelijk aan `CoverSide::label` in de kern. */
export const ZIJDE_LABEL: Record<CoverSide, string> = {
  Top: "bovenzijde",
  Bottom: "onderzijde",
  Sides: "zijkanten",
};

/** Kort label voor de smalle invoerkolom. */
export const ZIJDE_KORT: Record<CoverSide, string> = {
  Top: "Boven",
  Bottom: "Onder",
  Sides: "Zijkant",
};

/**
 * De zijde-gegevens van de korf; een ontbrekende zijde is een lege zijde —
 * spiegel van `ReinforcementCage::face` in de kern.
 */
export function zijdeVanKorf(korf: ReinforcementCage, zijde: CoverSide): FaceCover {
  const veld =
    zijde === "Top" ? korf.cover_top : zijde === "Bottom" ? korf.cover_bottom : korf.cover_sides;
  return veld ?? {};
}

/** De veldnaam op de korf die bij een zijde hoort. */
export function zijdeVeld(zijde: CoverSide): "cover_top" | "cover_bottom" | "cover_sides" {
  return zijde === "Top" ? "cover_top" : zijde === "Bottom" ? "cover_bottom" : "cover_sides";
}

/**
 * De nominale dekking c_nom aan één zijde, mm — spiegel van
 * `ReinforcementCage::cover_at_mm`.
 *
 * Zegt de zijde niets eigens, dan geldt de dekking van het element. Daarom
 * rekent een korf zonder zijde-gegevens precies zoals hij altijd deed.
 */
export function dekkingVanZijdeMm(korf: ReinforcementCage, zijde: CoverSide): number {
  const eigen = zijdeVanKorf(korf, zijde).cover_mm;
  return eigen === undefined || eigen === null ? korf.cover_mm : eigen;
}

/**
 * De milieuklasse aan één zijde, met die van het element als terugval;
 * `null` = nergens opgegeven, en dan is er geen dekkingstoets.
 */
export function milieuklasseVanZijde(
  korf: ReinforcementCage,
  zijde: CoverSide,
  element: ExposureClass | null,
): ExposureClass | null {
  return zijdeVanKorf(korf, zijde).exposure_class ?? element;
}

/** Is de dekking aan alle drie de zijden dezelfde? Vergelijkt de UITKOMST. */
export function dekkingIsRondomGelijk(korf: ReinforcementCage): boolean {
  const c = dekkingVanZijdeMm(korf, "Top");
  return ZIJDEN.every((z) => dekkingVanZijdeMm(korf, z) === c);
}

/**
 * Zet de dekking of de milieuklasse van één zijde, en geef een NIEUWE korf
 * terug.
 *
 * Wordt een zijde daarmee leeg — geen eigen dekking en geen eigen klasse meer —
 * dan verdwijnt het veld ook echt (`undefined`) in plaats van als leeg object
 * te blijven staan. Zo blijft "deze zijde volgt het element" één ding in
 * plaats van twee, precies zoals de kern het leest.
 */
export function zetZijde(
  korf: ReinforcementCage,
  zijde: CoverSide,
  patch: Partial<FaceCover>,
): ReinforcementCage {
  const nieuw: FaceCover = { ...zijdeVanKorf(korf, zijde), ...patch };
  const leeg =
    (nieuw.cover_mm === undefined || nieuw.cover_mm === null) &&
    (nieuw.exposure_class === undefined || nieuw.exposure_class === null);
  return { ...korf, [zijdeVeld(zijde)]: leeg ? undefined : nieuw };
}

/** De LEGE rij: geen staven, geen diameter. */
const LEGE_RIJ: RebarRow = { count: 0, diameter_mm: 0 };

/**
 * De zijstaven als rij, of de lege rij als er geen zijn — spiegel van
 * `ReinforcementCage::side_row` in de kern.
 *
 * `count` is het aantal staven op EEN zijkant; de korf is links-rechts
 * symmetrisch, dus er liggen er tweemaal zoveel in de doorsnede. De hoekstaven
 * zitten er NIET in: die horen bij `top` en `bottom`.
 */
export function zijstaafRij(korf: ReinforcementCage): RebarRow {
  return korf.sides ?? LEGE_RIJ;
}

/** Zijn er zijstaven? */
export function heeftZijstaven(korf: ReinforcementCage): boolean {
  const r = zijstaafRij(korf);
  return r.count > 0 && r.diameter_mm > 0;
}

/**
 * Staaldoorsnede van de zijstaven in mm² — BEIDE zijkanten samen, dus tweemaal
 * het rijoppervlak. Spiegel van `a_s_sides_mm2` in de kern.
 */
export function zijstavenOppervlakMm2(korf: ReinforcementCage): number {
  return 2 * rijOppervlakMm2(zijstaafRij(korf));
}

/**
 * De TOTALE langswapening: onder + boven + beide zijkanten, mm². Dat is de
 * A_s die §9.5.2(2) en (3) bedoelen. Spiegel van `a_s_total_mm2` in de kern.
 */
export function totaleWapeningMm2(korf: ReinforcementCage): number {
  return (
    rijOppervlakMm2(korf.bottom) + rijOppervlakMm2(korf.top) + zijstavenOppervlakMm2(korf)
  );
}

/**
 * De grootste diameter van de hoofdwapening in de korf, mm; 0 als er geen
 * hoofdwapening is. Die maat stelt de aanhechtingseis c_min,b van tabel 4.2.
 *
 * De zijstaven tellen mee: zij raken de ZIJKANT en stellen daar dus hun eigen
 * aanhechtingseis.
 */
export function grootsteStaafdiameterMm(korf: ReinforcementCage): number {
  const rijen = [korf.top, korf.bottom, zijstaafRij(korf)].filter(
    (r) => r.count > 0 && r.diameter_mm > 0,
  );
  return rijen.length === 0 ? 0 : Math.max(...rijen.map((r) => r.diameter_mm));
}

/** Oppervlakte van één rij hoofdwapening in mm². */
export function rijOppervlakMm2(rij: RebarRow): number {
  if (rij.count <= 0 || rij.diameter_mm <= 0) return 0;
  return rij.count * Math.PI * (rij.diameter_mm / 2) ** 2;
}

/** "3Ø16" of "—". */
export function rijLabel(rij: RebarRow): string {
  if (rij.count <= 0 || rij.diameter_mm <= 0) return "—";
  return `${rij.count}Ø${maat(rij.diameter_mm)}`;
}

/**
 * Afstand van de staafas van een rij tot de betonrand waar hij tegenaan ligt:
 * c_nom van DIE rand + Ø_beugel + Ø_staaf / 2.
 *
 * De zijde mag als derde argument mee. Blijft hij weg, dan wordt hij afgeleid
 * uit de IDENTITEIT van de rij — is het `korf.top` of `korf.bottom`, dan is de
 * zijde bekend. Dat is dezelfde truc als `ReinforcementCage::axis_offset_mm`
 * in de kern gebruikt, en om dezelfde reden: elke bestaande aanroeper geeft
 * inderdaad `korf.top` of `korf.bottom` door en hoeft dus niet te veranderen.
 *
 * Is de rij een LOSSE kopie, dan is de zijde niet vast te stellen. Er wordt
 * dan niet gegokt maar de grootste van de twee dekkingen genomen: de grootste
 * asafstand, dus de kleinste nuttige hoogte, en daarmee de veilige kant.
 */
export function asAfstandMm(
  korf: ReinforcementCage,
  rij: RebarRow,
  kant?: "onder" | "boven",
): number {
  const zijde: CoverSide | null =
    kant === "onder" || rij === korf.bottom
      ? "Bottom"
      : kant === "boven" || rij === korf.top
        ? "Top"
        : null;
  const dekking =
    zijde === null
      ? Math.max(dekkingVanZijdeMm(korf, "Top"), dekkingVanZijdeMm(korf, "Bottom"))
      : dekkingVanZijdeMm(korf, zijde);
  return dekking + korf.stirrup_diameter_mm + rij.diameter_mm / 2;
}

/** Nuttige hoogte d van de onderwapening, mm — met de dekking van de ONDERzijde. */
export function nuttigeHoogteMm(korf: ReinforcementCage, hoogteMm: number): number {
  return hoogteMm - asAfstandMm(korf, korf.bottom, "onder");
}

/**
 * Nuttige hoogte van de BOVENwapening, mm: de afstand van de onderrand tot de
 * as van de bovenwapening — de d die bij een negatief moment geldt.
 *
 * Met één dekking rondom is dit gewoon h − d₂; met een eigen dekking boven is
 * het een ander getal, en juist dat is de reden dat het hier apart staat.
 */
export function nuttigeHoogteBovenMm(korf: ReinforcementCage, hoogteMm: number): number {
  return hoogteMm - asAfstandMm(korf, korf.top, "boven");
}

/**
 * "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm" — gelijk aan de kern.
 *
 * Zijn de beugelgegevens ingevuld, dan staan ze erbij: "beugel Ø8 h.o.h.
 * 150 mm, 2-benig". Letterlijk dezelfde regel als
 * `ReinforcementCage::summary()` in de kern; die twee moeten gelijk blijven,
 * want het rapport zet de kernversie neer en de editor deze.
 */
export function korfSamenvatting(korf: ReinforcementCage): string {
  let beugel = "geen beugel";
  if (korf.stirrup_diameter_mm > 0) {
    beugel = `beugel Ø${maat(korf.stirrup_diameter_mm)}`;
    const s = korf.stirrup_spacing_mm;
    if (s !== undefined && s !== null && s > 0) beugel += ` h.o.h. ${maat(s)} mm`;
    const n = korf.stirrup_legs;
    if (n !== undefined && n !== null && n >= 1) beugel += `, ${n}-benig`;
  }
  // Eén dekking rondom leest als "dekking 30 mm" — precies zoals vroeger.
  // Verschillen de zijden, dan mag die regel niet blijven staan alsof er één
  // dekking is.
  const dekking = dekkingIsRondomGelijk(korf)
    ? `dekking ${maat(dekkingVanZijdeMm(korf, "Bottom"))} mm`
    : `dekking boven ${maat(dekkingVanZijdeMm(korf, "Top"))} / onder ${maat(
        dekkingVanZijdeMm(korf, "Bottom"),
      )} / opzij ${maat(dekkingVanZijdeMm(korf, "Sides"))} mm`;
  // De zijstaven staan er alleen als ze er zijn; een balkkorf leest dus
  // letterlijk zoals hij altijd las. Zelfde volgorde als `summary()` in de kern.
  const zijstaven = heeftZijstaven(korf)
    ? `opzij ${rijLabel(zijstaafRij(korf))} per zijde, `
    : "";
  return `onder ${rijLabel(korf.bottom)}, boven ${rijLabel(korf.top)}, ${zijstaven}${beugel}, ${dekking}`;
}

/**
 * De dwarsafstand s_t van de beugelbenen (§9.2.2(8)), met de herkomst erbij —
 * spiegel van `ReinforcementCage::leg_spacing_mm` in de kern.
 *
 * Opgegeven gaat vóór. Anders, en alleen bij een gesloten TWEEBENIGE beugel:
 *
 *     s_t = b_w − 2·c_nom − Ø_beugel
 *
 * Dat is zuivere meetkunde en staat als zodanig niet in de norm; daarom draagt
 * de uitkomst zijn herkomst mee. Bij meer benen wordt niets afgeleid: hoe die
 * over de breedte staan is een ontwerpkeuze en gelijkmatig verdelen zou een
 * aanname zijn. `null` = niet bekend en niet af te leiden.
 */
export function beugelDwarsafstandMm(
  korf: ReinforcementCage,
  doorsnede: ConcreteSectionInput,
): { mm: number; afgeleid: boolean } | null {
  const opgegeven = korf.stirrup_leg_spacing_mm;
  if (opgegeven !== undefined && opgegeven !== null && opgegeven > 0) {
    return { mm: opgegeven, afgeleid: false };
  }
  if (korf.stirrup_legs !== 2 || !(korf.stirrup_diameter_mm > 0)) return null;
  // b_w: de kleinste breedte van de doorsnede (§6.2.3(1)) — de beugel zit in
  // het lijf, niet in de flens. De dekking is die van de ZIJKANTEN: het zijn
  // die randen waar de twee benen tegenaan liggen.
  const bW = Math.min(...banden(doorsnede).map((b) => b.bMm));
  const st = bW - 2 * dekkingVanZijdeMm(korf, "Sides") - korf.stirrup_diameter_mm;
  return st > 0 ? { mm: st, afgeleid: true } : null;
}

/** Uit welke rij van de korf een staaf komt. */
export type Staafrij = "boven" | "onder" | "opzij";

/**
 * De drie rijen van de korf, met de veldnaam van `ReinforcementCage` als
 * waarde. Zo is een rij overal met hetzelfde woord aan te wijzen — in de
 * tekening, in de rij-invoer en in de aanroeper die hem wegschrijft.
 */
export type KorfRij = "top" | "bottom" | "sides";

/** Het opschrift van een rij, in lopende tekst. */
export const KORFRIJ_LABEL: Record<KorfRij, string> = {
  top: "bovenwapening",
  bottom: "onderwapening",
  sides: "zijstaven",
};

/**
 * De rij zelf uit de korf. `sides` kan ontbreken — dan is het de lege rij, en
 * betekent dat "er zijn geen zijstaven".
 */
export function korfRij(korf: ReinforcementCage, rij: KorfRij): RebarRow {
  if (rij === "sides") return zijstaafRij(korf);
  return rij === "top" ? korf.top : korf.bottom;
}

/**
 * Eén rij van de korf vervangen, met de korf als uitkomst.
 *
 * Voor de zijstaven geldt één afspraak die hier één keer staat in plaats van
 * bij elke aanroeper: NUL zijstaven betekent dat het veld WEG gaat. Zo is de
 * korf daarna bit voor bit de korf die hij was voordat er zijstaven in kwamen,
 * en leest een projectbestand zonder zijstaven ook weer zonder.
 */
export function zetKorfRij(
  korf: ReinforcementCage,
  rij: KorfRij,
  waarde: RebarRow,
): ReinforcementCage {
  if (rij === "sides") {
    return waarde.count > 0 && waarde.diameter_mm > 0
      ? { ...korf, sides: waarde }
      : { ...korf, sides: undefined };
  }
  return { ...korf, [rij]: waarde };
}

/** Eén staaf in de tekening: hart (mm vanaf linkerrand resp. onderrand) en diameter. */
export interface StaafPositie {
  x: number;
  z: number;
  diameter: number;
  rij: Staafrij;
  /**
   * Ligt deze staaf in een HOEK van de doorsnede? Alleen de buitenste staven
   * van de onder- en de bovenrij; een rij met één staaf staat in het midden en
   * bezet dus geen hoek, en een zijstaaf ligt per definitie tussen de hoeken
   * in. Dit is wat §9.5.2(4) en §9.5.3(6) van de tekening moeten kunnen
   * aflezen — spiegel van `Staafpositie::in_hoek` in de kern.
   */
  inHoek: boolean;
}

/**
 * Staafposities in de doorsnede: elke rij gelijkmatig verdeeld tussen de
 * binnenhoeken van de beugel; één staaf staat in het midden.
 *
 * De rij wordt verdeeld over de breedte die op ZIJN EIGEN hoogte aanwezig is,
 * niet over de grootste breedte van de doorsnede. Bij een T-lijf zou dat
 * laatste staven buiten het beton tekenen; dezelfde regel als de
 * korfcontrole in de kern, die ook naar `width_at_mm` kijkt.
 */
export function staafPosities(korf: ReinforcementCage, d: ConcreteSectionInput): StaafPositie[] {
  const uit: StaafPositie[] = [];
  const rijen: Array<[RebarRow, "boven" | "onder"]> = [
    [korf.bottom, "onder"],
    [korf.top, "boven"],
  ];
  // De inzet vanaf de ZIJKANT is een andere maat dan de asafstand tot boven-
  // of onderrand zodra de dekkingen verschillen: hij hangt aan de zijkant, de
  // asafstand aan de eigen rand.
  const inzetZijkant = (rij: RebarRow) =>
    dekkingVanZijdeMm(korf, "Sides") + korf.stirrup_diameter_mm + rij.diameter_mm / 2;
  for (const [rij, kant] of rijen) {
    if (rij.count <= 0 || rij.diameter_mm <= 0) continue;
    const as = asAfstandMm(korf, rij, kant);
    const zijkant = inzetZijkant(rij);
    const z = kant === "onder" ? as : d.h_mm - as;
    const breedte = breedteOpHoogteMm(d, z);
    const hart = hartXMm(d, z);
    const xEerste = hart - breedte / 2 + zijkant;
    const xLaatste = hart + breedte / 2 - zijkant;
    for (let i = 0; i < rij.count; i++) {
      const x = rij.count === 1 ? hart : xEerste + ((xLaatste - xEerste) * i) / (rij.count - 1);
      // De buitenste staaf van de onder- en de bovenrij ligt in een hoek van de
      // doorsnede — dat is wat §9.5.2(4) vraagt. Eén staaf in een rij staat in
      // het MIDDEN en bezet dus geen hoek.
      const inHoek = rij.count >= 2 && (i === 0 || i === rij.count - 1);
      uit.push({ x, z, diameter: rij.diameter_mm, rij: kant, inHoek });
    }
  }
  // De zijstaven: op elke hoogte één links en één rechts, gelijkmatig verdeeld
  // tussen de as van de onderrij en die van de bovenrij. Die verdeling is een
  // MODELKEUZE en geen normvoorschrift; zij staat zo in `layers()` van de kern
  // en in de aannames die met de afleiding meereizen.
  const zij = zijstaafRij(korf);
  if (zij.count > 0 && zij.diameter_mm > 0) {
    const [zOnder, zBoven] = zijstaafSpanMm(korf, d, zij);
    const zijkant = inzetZijkant(zij);
    for (let k = 1; k <= zij.count; k++) {
      const z = zOnder + ((zBoven - zOnder) * k) / (zij.count + 1);
      const hart = hartXMm(d, z);
      const halveBinnenmaat = breedteOpHoogteMm(d, z) / 2 - zijkant;
      for (const teken of [-1, 1]) {
        uit.push({
          x: hart + teken * halveBinnenmaat,
          z,
          diameter: zij.diameter_mm,
          rij: "opzij",
          inHoek: false,
        });
      }
    }
  }
  return uit;
}

/**
 * De hoogte van de as van de onderste en die van de bovenste staaflaag, mm —
 * de twee einden waartussen de zijstaven worden verdeeld. Spiegel van
 * `zijstaaf_span_mm` in de kern.
 *
 * Is een van beide rijen leeg, dan wordt de as genomen waar een staaf van de
 * ZIJRIJ zou liggen als hij die rand raakte: de plaats van het eerste
 * staafhart dat de dekking van die rand toelaat.
 */
function zijstaafSpanMm(
  korf: ReinforcementCage,
  d: ConcreteSectionInput,
  zij: RebarRow,
): [number, number] {
  const diameter = (r: RebarRow) =>
    r.count > 0 && r.diameter_mm > 0 ? r.diameter_mm : zij.diameter_mm;
  const zOnder =
    dekkingVanZijdeMm(korf, "Bottom") + korf.stirrup_diameter_mm + diameter(korf.bottom) / 2;
  const zBoven =
    d.h_mm -
    (dekkingVanZijdeMm(korf, "Top") + korf.stirrup_diameter_mm + diameter(korf.top) / 2);
  return [zOnder, zBoven];
}

/**
 * Directe geometriecontrole voor de editor (spiegel van `validate` in de
 * kern): meldt waarom de kern de korf zou weigeren, vóórdat hij wordt
 * aangeroepen. `null` = in orde.
 */
export function controleerKorf(k: Wapeningskorf): string | null {
  const { korf } = k;
  const d = k.doorsnede;
  if (!(d.b_mm > 0) || !(d.h_mm > 0)) return "Doorsnedeafmetingen moeten positief zijn.";
  if (d.shape !== "Rectangle") {
    if (!(d.b_w_mm !== null && d.b_w_mm > 0)) return "De lijfbreedte b_w moet positief zijn.";
    if (!(d.h_f_mm !== null && d.h_f_mm > 0)) return "De flensdikte h_f moet positief zijn.";
    if (d.b_w_mm >= d.b_mm) return "De lijfbreedte b_w moet kleiner zijn dan de flensbreedte b_f.";
    if (d.h_f_mm >= d.h_mm) return "De flensdikte h_f laat geen lijf over binnen de hoogte h.";
  }
  if (korf.cover_mm < 0 || korf.stirrup_diameter_mm < 0) return "Dekking en beugeldiameter mogen niet negatief zijn.";
  // De dekking per zijde. Leeg mag — dat betekent "volg het element" — maar
  // wat er staat moet een maat zijn. Zelfde grens als `validate` in de kern.
  for (const zijde of ZIJDEN) {
    const eigen = zijdeVanKorf(korf, zijde).cover_mm;
    if (eigen === undefined || eigen === null) continue;
    if (!Number.isFinite(eigen) || eigen < 0) {
      return `De dekking aan de ${ZIJDE_LABEL[zijde]} is ${eigen} mm; dat is geen maat. Laat het veld leeg als deze zijde de dekking van het element volgt.`;
    }
  }
  const leeg = (r: RebarRow) => r.count <= 0 || r.diameter_mm <= 0;
  const zij = zijstaafRij(korf);
  if (leeg(korf.top) && leeg(korf.bottom)) {
    if (leeg(zij)) return "De korf bevat geen hoofdwapening.";
    // Zijstaven worden verdeeld TUSSEN de onder- en de bovenrij, en §9.5.2(4)
    // eist in iedere hoek een staaf. Zonder die twee rijen is er geen korf.
    return "De korf heeft alleen zijstaven en geen boven- of onderwapening.";
  }
  if (zij.count > 0 && !(zij.diameter_mm > 0)) {
    return `Er zijn ${zij.count} zijstaven per zijkant opgegeven zonder diameter; kies een staafdiameter of zet het aantal op 0.`;
  }
  // De breedte OP DE HOOGTE VAN DE RIJ, net als `ReinforcementCage::validate`
  // in de kern: in een T-lijf past minder dan in de flens. De rij ligt in de
  // HOOGTE op de dekking van zijn eigen rand en in de BREEDTE tussen de twee
  // zijkanten; die twee dekkingen hoeven niet dezelfde te zijn.
  const cZij = dekkingVanZijdeMm(korf, "Sides");
  for (const [naam, rij, z] of [
    ["Onderwapening", korf.bottom, asAfstandMm(korf, korf.bottom, "onder")],
    ["Bovenwapening", korf.top, d.h_mm - asAfstandMm(korf, korf.top, "boven")],
  ] as const) {
    if (leeg(rij)) continue;
    const breedte = breedteOpHoogteMm(d, z);
    const binnenbreedte = breedte - 2 * (cZij + korf.stirrup_diameter_mm);
    const benodigd = rij.count * rij.diameter_mm;
    if (benodigd > binnenbreedte + 1e-9) {
      const waar =
        d.shape === "Rectangle" ? "" : ` (de doorsnede is op z = ${maat(z)} mm ${maat(breedte)} mm breed)`;
      return `${naam} ${rijLabel(rij)} past niet in de breedte: ${maat(benodigd)} mm staal in ${maat(binnenbreedte)} mm binnenmaat${waar}.`;
    }
  }
  const onder = leeg(korf.bottom) ? 0 : asAfstandMm(korf, korf.bottom, "onder");
  const boven = leeg(korf.top) ? 0 : asAfstandMm(korf, korf.top, "boven");
  if (onder + boven >= d.h_mm) return "Boven- en onderwapening overlappen elkaar in de hoogte.";

  // De zijstaven: passen ze naast elkaar in de breedte en onder elkaar in de
  // hoogte? Geen normregel, zuivere meetkunde — zelfde grenzen als
  // `ReinforcementCage::validate` in de kern.
  if (!leeg(zij)) {
    const [zOnder, zBoven] = zijstaafSpanMm(korf, d, zij);
    const inzet = cZij + korf.stirrup_diameter_mm + zij.diameter_mm / 2;
    for (const z of [zOnder, zBoven]) {
      const hartOpHart = breedteOpHoogteMm(d, z) - 2 * inzet;
      if (hartOpHart < zij.diameter_mm - 1e-9) {
        return `De zijstaven ${rijLabel(zij)} per zijde passen niet naast elkaar: hun harten liggen ${maat(hartOpHart)} mm uit elkaar terwijl Ø${maat(zij.diameter_mm)} mm nodig is.`;
      }
    }
    const steek = (zBoven - zOnder) / (zij.count + 1);
    if (steek < zij.diameter_mm - 1e-9) {
      return `De zijstaven ${rijLabel(zij)} per zijde passen niet in de hoogte: zij komen op ${maat(steek)} mm uit elkaar te liggen, minder dan hun eigen Ø${maat(zij.diameter_mm)} mm.`;
    }
  }

  // De beugelvelden. Leeglaten mag — dat betekent "niet opgegeven" — maar wat
  // er staat moet een echte maat zijn. Zelfde grenzen als
  // `ReinforcementCage::validate` in de kern.
  for (const [naam, waarde] of [
    ["De beugelafstand s", korf.stirrup_spacing_mm],
    ["De dwarsafstand van de beugelbenen", korf.stirrup_leg_spacing_mm],
    ["De vloeigrens f_ywk van de beugels", korf.stirrup_fywk_mpa],
  ] as const) {
    if (waarde === undefined || waarde === null) continue;
    if (!(waarde > 0)) return `${naam} moet groter dan nul zijn; laat het veld leeg als hij niet is opgegeven.`;
  }
  if (korf.stirrup_legs !== undefined && korf.stirrup_legs !== null && korf.stirrup_legs < 1) {
    return "Het aantal beugelbenen moet ten minste 1 zijn; laat het veld leeg als er geen beugels zijn.";
  }
  const beugelgegeven =
    (korf.stirrup_spacing_mm ?? null) !== null ||
    (korf.stirrup_legs ?? null) !== null ||
    (korf.stirrup_leg_spacing_mm ?? null) !== null;
  if (beugelgegeven && !(korf.stirrup_diameter_mm > 0)) {
    return "Er zijn beugelgegevens opgegeven terwijl er geen beugel is; kies een beugeldiameter of laat de beugelgegevens leeg.";
  }
  const st = korf.stirrup_leg_spacing_mm;
  if (st !== undefined && st !== null && st > 0) {
    const bW = Math.min(...banden(d).map((b) => b.bMm));
    const ruimte = bW - 2 * cZij - korf.stirrup_diameter_mm;
    if (st > ruimte + 1e-9) {
      return `De dwarsafstand van de beugelbenen is ${maat(st)} mm, maar tussen de buitenste beenassen past hoogstens ${maat(ruimte)} mm.`;
    }
  }
  return null;
}

/**
 * Kleinste vrije tussenafstand tussen de staven van een rij, mm; `null` bij
 * één of geen staaf. Alleen ter informatie in de editor — de eis van §8.2
 * (minimale staafafstand) is hier niet als normtoets geïmplementeerd.
 */
export function vrijeStaafafstandMm(korf: ReinforcementCage, rij: RebarRow, breedteMm: number): number | null {
  if (rij.count < 2 || rij.diameter_mm <= 0) return null;
  // De inzet is die vanaf de ZIJKANT — de staven staan naast elkaar in de
  // breedte, niet in de hoogte.
  const inzet =
    dekkingVanZijdeMm(korf, "Sides") + korf.stirrup_diameter_mm + rij.diameter_mm / 2;
  const hartAfstand = (breedteMm - 2 * inzet) / (rij.count - 1);
  return hartAfstand - rij.diameter_mm;
}

/**
 * De breedte waarin een rij werkelijk ligt: die op de hoogte van de rij zelf.
 * Voor de vrije-staafafstand van de editor; in een T-lijf is dat b_w en niet
 * de flensbreedte.
 */
export function rijBreedteMm(k: Wapeningskorf, kant: "onder" | "boven"): number {
  const rij = kant === "onder" ? k.korf.bottom : k.korf.top;
  const as = asAfstandMm(k.korf, rij, kant);
  return breedteOpHoogteMm(k.doorsnede, kant === "onder" ? as : k.doorsnede.h_mm - as);
}

/** Maat in mm als tekst: integer waar mogelijk, anders één decimaal (nl). */
export function maat(v: number): string {
  const afgerond = Math.round(v * 10) / 10;
  return Number.isInteger(afgerond) ? String(afgerond) : afgerond.toFixed(1).replace(".", ",");
}

/** Getal in nl-notatie met vast aantal decimalen. */
export function nl(v: number, decimalen: number): string {
  return v.toLocaleString("nl-NL", { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
}
