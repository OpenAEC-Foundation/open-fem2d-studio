/**
 * verloopKeuze — wat de INTERFACE over een verlopend profiel moet weten
 * (ontwerp 15-09-2026, §6).
 *
 * De profielkiezer, het eigenschappenpaneel en de staafdialoog stellen alle
 * drie dezelfde twee vragen: "mag dit eindprofiel bij dit beginprofiel?" en
 * "hoe noem ik deze staaf in één regel?". Die antwoorden staan hier, in één
 * module, en ze komen ALLEMAAL van `bepaalVerloop` — dezelfde keuring waarmee
 * de solver en de rekenkern werken.
 *
 * # ÉÉN REDEN, NIET TWEE
 *
 * De verleiding is groot om in de interface een eigen, vriendelijker
 * foutmelding te schrijven ("kies een profiel van dezelfde soort"). Dat zou
 * een tweede waarheid maken: de kiezer keurt dan iets goed of af op andere
 * gronden dan de kern, en bij de eerste uitbreiding lopen ze uit elkaar. De
 * reden die hier naar boven komt is daarom letterlijk de reden van
 * `bepaalVerloop`, ongewijzigd.
 */
import {
  bepaalVerloop,
  matenOpPositie,
  type VerloopMaten,
  type VerlopendeDoorsnede,
} from "./sectionResolver";
import { isEigenProfiel } from "./profieleditor/eigenDoorsnedenStore";

/** Uitkomst van de keuring van één gekozen eindprofiel. */
export type EindProfielKeuring =
  /** Geen eindprofiel gekozen, of hetzelfde profiel: de staaf is prismatisch. */
  | { status: "prismatisch" }
  | { status: "verlopend"; verloop: VerlopendeDoorsnede }
  /** Afgekeurd, met de reden van `bepaalVerloop` — ongewijzigd. */
  | { status: "fout"; reden: string };

/**
 * Mag dit eindprofiel bij dit begin? Eén doorgeefluik naar `bepaalVerloop`,
 * zodat elke plek in de interface dezelfde grens en dezelfde reden gebruikt.
 */
export function keurEindProfiel(
  material: string | undefined,
  profile: string | undefined,
  profileEnd: string | undefined,
): EindProfielKeuring {
  return bepaalVerloop(material, profile, profileEnd);
}

/** Is deze staaf verlopend? Kort, voor tekening en legenda. */
export function isVerlopend(b: {
  material?: string;
  profile?: string;
  profileEnd?: string;
}): boolean {
  return bepaalVerloop(b.material, b.profile, b.profileEnd).status === "verlopend";
}

/**
 * Opent de profielkiezer deze staaf in de stap "Eigen doorsnede"?
 *
 * Alleen als hij PRISMATISCH een eigen doorsnede draagt. Een verlopende staaf
 * die met een eigen doorsnede begint — het tweede deel van een gesplitste
 * verlopende stalen staaf, `EIGEN:Gelast I …` → `IPE500` — opent in de
 * staalstap: daar staan de schakelaar Verlopend profiel en het eindprofiel.
 * De stap "Eigen doorsnede" kent geen verloop; wie de staaf daar opende, zag
 * het verloop niet en kon het niet aanpassen (issue #31).
 */
export function kiezerOpentEigenStap(b: { profile?: string; profileEnd?: string }): boolean {
  return isEigenProfiel(b.profile) && (b.profileEnd?.trim() ?? "") === "";
}

/**
 * De eigen doorsneden aan het begin en het eind van een verlopende staaf.
 *
 * Ze staan in geen catalogusreeks, dus de staalstap van de profielkiezer zou
 * ze niet tonen: het beginprofiel van het tweede deel en het eindprofiel van
 * het eerste deel van een gesplitste staaf vielen daar weg. De kiezer zet ze
 * met deze functie als extra keuze in de profiellijst en in de lijst met
 * eindprofielen. Een prismatische staaf geeft twee keer `null`.
 */
export function eigenVerloopProfielen(b: {
  profile?: string;
  profileEnd?: string;
}): { begin: string | null; eind: string | null } {
  const eind = b.profileEnd?.trim() ?? "";
  if (eind === "") return { begin: null, eind: null };
  return {
    begin: isEigenProfiel(b.profile) ? b.profile! : null,
    eind: isEigenProfiel(eind) ? eind : null,
  };
}

/**
 * Hoe de doorsnede van een staaf in één regel heet.
 *
 * Prismatisch: de profielnaam zelf. Verlopend: `"IPE 300 → IPE 200
 * (verlopend)"` — precies dezelfde schrijfwijze als de rekenkern in het
 * resultaat zet (`steel_check::verlopend::naam_van`), zodat het scherm en het
 * rapport dezelfde naam tonen en een lezer ze aan elkaar kan knopen.
 *
 * Een eindprofiel dat NIET bij het begin past, wordt hier niet verzwegen: de
 * naam wordt dan `"IPE 300 → SHS 100x100x5 (ongeldig verloop)"`. Stil alleen
 * het beginprofiel tonen zou de staaf er prismatisch uit laten zien terwijl
 * hij niet te rekenen is.
 */
export function doorsnedeNaam(b: {
  material?: string;
  profile?: string;
  profileEnd?: string;
}): string {
  const profiel = b.profile ?? "";
  const eind = b.profileEnd?.trim() ?? "";
  if (eind === "") return profiel;
  const v = bepaalVerloop(b.material, b.profile, b.profileEnd);
  if (v.status === "prismatisch") return profiel;
  if (v.status === "fout") return `${profiel} → ${eind} (ongeldig verloop)`;
  return `${profiel} → ${eind} (verlopend)`;
}

/**
 * De hoogte van de doorsnede op relatieve positie `t`, in mm — of `null` als
 * de staaf niet verlopend is.
 *
 * Alleen de HOOGTE, want dat is wat de staafweergave op het canvas tekent: de
 * dikte van de balk in het vlak van de tekening. De breedte staat loodrecht op
 * dat vlak en is in een 2D-aanzicht niet te zien.
 */
export function hoogteOpPositie(
  b: { material?: string; profile?: string; profileEnd?: string },
  t: number,
): number | null {
  const v = bepaalVerloop(b.material, b.profile, b.profileEnd);
  if (v.status !== "verlopend") return null;
  return matenOpPositie(v.verloop, t).h;
}

/** Begin- en eindmaten van een verlopende staaf, of `null`. */
export function verloopMaten(b: {
  material?: string;
  profile?: string;
  profileEnd?: string;
}): { begin: VerloopMaten; eind: VerloopMaten } | null {
  const v = bepaalVerloop(b.material, b.profile, b.profileEnd);
  if (v.status !== "verlopend") return null;
  return { begin: v.verloop.begin, eind: v.verloop.eind };
}
