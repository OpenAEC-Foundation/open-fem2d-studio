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
import type { Lassoort } from "../types/las/Lassoort";

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

/**
 * Eén doorlopende lasnaad tussen twee lamellen van een samenstelling.
 *
 * Een lasnaad in een doorsnedetekening is altijd een **langslas**: hij loopt
 * met de staaf mee. Wat hij overdraagt is daarom geen kracht maar een kracht
 * per strekkende millimeter — de schuifstroom `q = V_z·S/I_y`, met `S` het
 * statisch moment van het deel dat aan die naad hangt. Er hoort dus geen
 * laslengte bij: de lengte is de staaflengte.
 *
 * `soort` is dezelfde opsomming als de rekenkern gebruikt
 * (`nen-en-1993-1-8-las`), zodat er geen tweede lijst ontstaat.
 */
export interface Las {
  id: string;
  /** Lamel aan de ene kant van de naad. */
  aId: string;
  /** Lamel aan de andere kant. */
  bId: string;
  soort: Lassoort;
  /** Keeldikte `a` van één las (mm); bij een stompe las niet gebruikt. */
  a_mm: number;
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
      /**
       * Lasnaden tussen de lamellen. Optioneel omdat doorsneden die vóór de
       * lassen bewaard zijn het veld niet hebben; lees hem altijd als
       * `lassen ?? []`.
       */
      lassen?: Las[];
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

  // ══════════════════════════════════════════════════════════════════════════
  //  Uitgebreide doorsnedegrootheden
  //
  //  Eén geometrie erin, een volledige set eigenschappen eruit — en een
  //  eerlijke `*_bepaald`-vlag zodra iets voor deze doorsnede niet te bepalen
  //  is. Staat zo'n vlag op `false`, dan is het bijbehorende getal 0 en moet de
  //  UI "niet bepaald" tonen, NIET de nul.
  //
  //  Assenstelsels (zie `crate::uitgebreid` in de motor):
  //  * globaal   — het invoerstelsel, `y` rechts en `z` omhoog;
  //  * hoofdas   — het zwaartepuntsstelsel gedraaid over `alpha_hoofdas_rad`;
  //                `u` ligt langs de as met de grootste traagheid,
  //                `u =  y·cos α + z·sin α`, `v = −y·sin α + z·cos α`.
  // ══════════════════════════════════════════════════════════════════════════

  /** Lengte van de buitenrand(en) in mm — het conserveringsoppervlak per meter. */
  omtrek_mm: number;
  /** Lengte van de randen van de langsgaten (mm). */
  omtrek_gaten_mm: number;
  /**
   * `false` voor een lamellenmodel: overlappende platen en catalogusdelen
   * hebben geen gemeenschappelijke buitenrand.
   */
  omtrek_bepaald: boolean;
  /** Gebruikte soortelijke massa (kg/m³); staal (7850) tenzij anders opgegeven. */
  dichtheid_kg_m3: number;
  /** Massa per strekkende meter (kg/m). */
  massa_kg_per_m: number;

  /** Statisch moment om de y-as van het invoerstelsel: `∬z dA` (mm³). */
  qy_mm3: number;
  /** Statisch moment om de z-as van het invoerstelsel: `∬y dA` (mm³). */
  qz_mm3: number;

  /** Uiterste vezels in het hoofdasstelsel, t.o.v. het zwaartepunt (mm). */
  u_min_mm: number;
  u_max_mm: number;
  v_min_mm: number;
  v_max_mm: number;
  /** `I_u / v_max` — om de sterke hoofdas, naar de vezel aan de +v-zijde. */
  wel_u_plus_mm3: number;
  /** `I_u / |v_min|` — idem naar de −v-zijde. */
  wel_u_min_mm3: number;
  /** `I_v / u_max` — om de zwakke hoofdas, naar de vezel aan de +u-zijde. */
  wel_v_plus_mm3: number;
  /** `I_v / |u_min|` — idem naar de −u-zijde. */
  wel_v_min_mm3: number;
  /** De maatgevende (kleinste) van elk paar, zoals `wel_y_mm3` dat is. */
  wel_u_mm3: number;
  wel_v_mm3: number;
  /** Traagheidsstralen om de hoofdassen (mm). */
  iu_radius_mm: number;
  iv_radius_mm: number;

  /** Plastische neutrale as om de y-as, als z-coördinaat in het invoerstelsel. */
  z_pna_mm: number;
  /** Plastische neutrale as om de z-as, als y-coördinaat in het invoerstelsel. */
  y_pna_mm: number;
  /** Plastisch zwaartepunt in het hoofdasstelsel, t.o.v. het elastische (mm). */
  u_pna_mm: number;
  v_pna_mm: number;
  /** Plastische weerstandsmomenten om de hoofdassen (mm³). */
  wpl_u_mm3: number;
  wpl_v_mm3: number;
  /**
   * Vormfactor `W_pl / W_el` met de maatgevende `W_el`. Rechthoek exact 1,5;
   * IPE 300 om de sterke as 1,128 en om de zwakke as 1,555.
   */
  vormfactor_y: number;
  vormfactor_z: number;
  vormfactor_u: number;
  vormfactor_v: number;
  /** `false` als `W_pl` niet bepaald is; alle plastische velden zijn dan 0. */
  plastisch_bepaald: boolean;

  /**
   * Monosymmetrieconstante om de y-as (mm), in de literatuur `β_x`:
   * `β_y = ∬(y²+z²)z dA / I_y − 2·z_s`, in zwaartepuntscoördinaten.
   */
  beta_y_mm: number;
  /** Het spiegelbeeld om de z-as. */
  beta_z_mm: number;
  /**
   * `z_j = z_s − 0,5·∬(y²+z²)z dA / I_y = −β_y/2` (mm) — de
   * monosymmetrieparameter uit de kipbijlage van NEN-EN 1993-1-1. Nul voor een
   * dubbelsymmetrische doorsnede; positief als het meeste materiaal boven het
   * zwaartepunt zit.
   */
  z_j_mm: number;
  /** Het spiegelbeeld: `y_j = −β_z/2`. */
  y_j_mm: number;
  /**
   * `false` zonder schuifmiddelpunt (losse delen) of met een catalogusdeel in
   * de samenstelling; `β` en `z_j` zijn dan 0.
   */
  monosymmetrie_bepaald: boolean;

  /** Afschuifoppervlak voor een dwarskracht langs de u-as (mm²). */
  av_u_mm2: number;
  /** Idem langs de v-as. */
  av_v_mm2: number;
  /**
   * `false` zodra de hoofdassen niet met y en z samenvallen: de normregel van
   * EN 1993-1-1 §6.2.6(3) laat zich niet meedraaien. Dan zijn `av_u_mm2` en
   * `av_v_mm2` 0 in plaats van geraden.
   */
  av_hoofdas_bepaald: boolean;
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
