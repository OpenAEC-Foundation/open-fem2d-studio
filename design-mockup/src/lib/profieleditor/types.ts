/**
 * Typen van de profieleditor: het ontwerp (wat de gebruiker tekent), de
 * uitvoer van de doorsnedemotor en de opgeslagen eigen doorsnede.
 *
 * Assenstelsel — overal hetzelfde als in `section-properties`: `y` naar
 * rechts, `z` omhoog, millimeters. Voor een catalogusprofiel (en dus voor de
 * gaten daarin) ligt de oorsprong linksonder in de omhullende rechthoek:
 * `y ∈ [0, b]`, `z ∈ [0, h]`. Voor een samenstelling is het stelsel vrij te
 * kiezen; de motor geeft het zwaartepunt in datzelfde stelsel terug.
 */
import type { SectionProperties } from "../types/steel/SectionProperties";
import type { CustomDoorsnedevorm } from "../types/steel/CustomDoorsnedevorm";

/** Vormaanduidingen die de motor kent (`soort` in de JSON-invoer). */
export type MotorSoort =
  | "ISection"
  | "Channel"
  | "ChannelSchuin"
  | "Shs"
  | "Rhs"
  | "Chs"
  | "Rechthoek";

/** Een catalogusprofiel met de maten die de motor nodig heeft. */
export interface Basisprofiel {
  /** Naam zoals in de profieldatabase, bijvoorbeeld "IPE 300". */
  naam: string;
  soort: MotorSoort;
  /** Hoogte (buis: buitendiameter). */
  h: number;
  /** Breedte (buis: buitendiameter). */
  b: number;
  /** Lijfdikte (koker/buis: wanddikte). */
  tw: number;
  /** Flensdikte (koker/buis: wanddikte). */
  tf: number;
  /** Walsuitronding (koker: hoekstraal; buis: 0). */
  r: number;
}

/**
 * Waar een gat zit:
 * * `lijf` / `flensBoven` / `flensOnder` — een gat **door** die plaat
 *   (geboord loodrecht op de plaat). In het doorsnedevlak blijft een spleet
 *   over de volle plaatdikte over: de netto doorsnede ter plaatse.
 *   Bij een koker is "lijf" de linkerwand en zijn de flenzen de boven- en
 *   onderwand.
 * * `wand` — door de wand van een ronde buis, op hoek `hoekGraden`
 *   (0° = rechts, 90° = boven).
 * * `vlak` — een **langsgat** in het doorsnedevlak zelf (leidingdoorvoer),
 *   alleen bij een massieve doorsnede.
 */
export type GatPlaats = "lijf" | "flensBoven" | "flensOnder" | "wand" | "vlak";

/** Eén uitsparing in een catalogusprofiel. */
export interface Gat {
  id: string;
  plaats: GatPlaats;
  vorm: "rond" | "rechthoek";
  /**
   * Positie in het beschrijvingsassenstelsel van het profiel. Bij `lijf`
   * telt alleen `z` (hoogte in het lijf), bij een flens alleen `y`, bij
   * `wand` alleen `hoekGraden`; bij `vlak` het middelpunt.
   */
  y: number;
  z: number;
  /** Rond: diameter. */
  d: number;
  /**
   * Rechthoek: breedte (dwars op de plaatas: langs y in een lijf, langs z in
   * een flens) en hoogte (langs de plaatas). Bij `vlak`: langs y en z.
   */
  b: number;
  h: number;
  /** `vlak`, rechthoek: draaiing tegen de klok in; `wand`: hoekpositie. Graden. */
  hoekGraden: number;
}

/**
 * Eén lamel (rechthoekige plaat). Zelfde afspraken als `CustomLamella`:
 * `b_mm` de lengte langs de plaatas, `t_mm` de dikte, `(y_mm, z_mm)` het
 * zwaartepunt; de hoek hier in graden (0 = liggend, 90 = staand).
 */
export interface Lamel {
  id: string;
  b_mm: number;
  t_mm: number;
  y_mm: number;
  z_mm: number;
  alphaGraden: number;
}

/** Een compleet catalogusprofiel als bouwsteen, geplaatst op zijn zwaartepunt. */
export interface Catalogusdeel {
  id: string;
  profiel: Basisprofiel;
  y_mm: number;
  z_mm: number;
  alphaGraden: number;
  /** Spiegelen om de eigen z-as (`y → −y`): twee U's rug-aan-rug. */
  gespiegeld: boolean;
}

/** Gesloten cel voor de Bredt-torsie, zoals de motor hem verwacht. */
export interface GeslotenCelDef {
  /** Hoekpunten van de wandmiddellijn `[y, z]`, in volgorde. */
  midlijn: [number, number][];
  /** Wanddikte van zijde i → i+1. */
  dikte_mm: number[];
  /** Indices van de lamellen die de celwanden vormen. */
  lamellen: number[];
}

/** Wat de gebruiker heeft getekend. */
export type DoorsnedeOntwerp =
  | {
      soort: "samenstelling";
      lamellen: Lamel[];
      catalogusdelen: Catalogusdeel[];
      /**
       * Een automatisch herkende gesloten cel meenemen in de torsie
       * (Bredt). Uit = open formule ⅓·Σb·t³, wat een koker sterk onderschat.
       */
      celMeenemen: boolean;
    }
  | {
      soort: "gat";
      basis: Basisprofiel;
      gaten: Gat[];
    };

/** Grootheden van een catalogusdeel die de tekening nodig heeft. */
export interface DeelUitvoer {
  area_mm2: number;
  y_c_mm: number;
  z_c_mm: number;
  h_mm: number;
  b_mm: number;
}

/**
 * De uitvoer van `doorsnedemotor` voor één geometrie — alle velden van
 * `SectionProperties` plus diagnostiek en vlaggen. Zie het commentaar in
 * `src-tauri/crates/section-properties/src/bin/doorsnedemotor.rs`.
 */
export interface MotorUitvoer extends SectionProperties {
  naam: string;
  soort: string;

  it_ondergrens_mm4: number;
  it_bovengrens_mm4: number;
  it_onzekerheid: number;
  a_mesh_mm2: number;
  a_mesh_afwijking: number;
  h_mesh_mm: number;
  driehoeken: number;
  kleinste_hoek_graden: number;
  tijd_ms: number;
  losse_delen: boolean;

  methode: "contour" | "lamellen";
  wpl_bepaald: boolean;
  iw_bepaald: boolean;
  schuifmiddelpunt_bepaald: boolean;
  a_gaten_mm2: number;
  y_min_mm: number;
  y_max_mm: number;
  z_min_mm: number;
  z_max_mm: number;
  delen: DeelUitvoer[];
  meldingen: string[];
}

/** Diagnostiek die met de opgeslagen doorsnede meereist. */
export interface MotorSamenvatting {
  methode: "contour" | "lamellen";
  wpl_bepaald: boolean;
  iw_bepaald: boolean;
  schuifmiddelpunt_bepaald: boolean;
  it_onzekerheid: number;
  a_gaten_mm2: number;
  y_min_mm: number;
  y_max_mm: number;
  z_min_mm: number;
  z_max_mm: number;
  delen: DeelUitvoer[];
  meldingen: string[];
  /** De gesloten cel die in de torsie is meegenomen (samenstelling). */
  cel?: GeslotenCelDef;
}

/**
 * Een opgeslagen eigen doorsnede: het ontwerp, de door de motor berekende
 * eigenschappen en de vormaanduiding waarmee de toetsing tabel 5.2 kiest.
 * De eigenschappen staan erbij zodat solver, rapport en toetsing ze zonder
 * herberekening kunnen lezen; het ontwerp blijft de bron voor de tekening en
 * voor bewerken.
 */
export interface EigenDoorsnede {
  id: string;
  /** Naam zoals hij in staafeigenschappen en rapport verschijnt. */
  naam: string;
  ontwerp: DoorsnedeOntwerp;
  eigenschappen: SectionProperties;
  /** Vormaanduiding voor de toetsing (alleen gebruikt zonder lamellen). */
  vorm: CustomDoorsnedevorm;
  motor: MotorSamenvatting;
  /** ISO-tijdstip van de berekening. */
  berekendOp: string;
}
