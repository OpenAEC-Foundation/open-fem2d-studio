/**
 * opslaan — van motoruitvoer naar een bewaarde eigen doorsnede, en de
 * vormaanduiding die de toetsing nodig heeft.
 */
import type { CustomDoorsnedevorm } from "../types/steel/CustomDoorsnedevorm";
import type { SectionProperties } from "../types/steel/SectionProperties";
import { gatenDubbelsymmetrisch } from "./geometrie";
import { celVoorOntwerp } from "./motorInvoer";
import type { DoorsnedeOntwerp, EigenDoorsnede, MotorSamenvatting, MotorUitvoer } from "./types";

/** Precies de velden van `SectionProperties` — niets erbij verzonnen. */
export function naarSectionProperties(u: MotorUitvoer): SectionProperties {
  return {
    area_mm2: u.area_mm2,
    iy_mm4: u.iy_mm4,
    iz_mm4: u.iz_mm4,
    wel_y_mm3: u.wel_y_mm3,
    wel_z_mm3: u.wel_z_mm3,
    wpl_y_mm3: u.wpl_y_mm3,
    wpl_z_mm3: u.wpl_z_mm3,
    av_y_mm2: u.av_y_mm2,
    av_z_mm2: u.av_z_mm2,
    it_mm4: u.it_mm4,
    iw_mm6: u.iw_mm6,
    iy_radius_mm: u.iy_radius_mm,
    iz_radius_mm: u.iz_radius_mm,
    h_mm: u.h_mm,
    b_mm: u.b_mm,
    tw_mm: u.tw_mm,
    tf_mm: u.tf_mm,
    r_mm: u.r_mm,
    y_c_mm: u.y_c_mm,
    z_c_mm: u.z_c_mm,
    wel_y_top_mm3: u.wel_y_top_mm3,
    wel_y_bot_mm3: u.wel_y_bot_mm3,
    wel_z_left_mm3: u.wel_z_left_mm3,
    wel_z_right_mm3: u.wel_z_right_mm3,
    iyz_mm4: u.iyz_mm4,
    iu_mm4: u.iu_mm4,
    iv_mm4: u.iv_mm4,
    alpha_hoofdas_rad: u.alpha_hoofdas_rad,
    y_s_mm: u.y_s_mm,
    z_s_mm: u.z_s_mm,
  };
}

export function naarMotorSamenvatting(u: MotorUitvoer, o: DoorsnedeOntwerp): MotorSamenvatting {
  const cel = celVoorOntwerp(o);
  return {
    methode: u.methode,
    wpl_bepaald: u.wpl_bepaald,
    iw_bepaald: u.iw_bepaald,
    schuifmiddelpunt_bepaald: u.schuifmiddelpunt_bepaald,
    it_onzekerheid: u.it_onzekerheid,
    a_gaten_mm2: u.a_gaten_mm2,
    y_min_mm: u.y_min_mm,
    y_max_mm: u.y_max_mm,
    z_min_mm: u.z_min_mm,
    z_max_mm: u.z_max_mm,
    delen: u.delen,
    meldingen: u.meldingen,
    ...(cel ? { cel } : {}),
  };
}

export const VORM_LABEL: Record<CustomDoorsnedevorm, string> = {
  Onbekend: "Onbekend — de toetsing weigert classificatie",
  GelasteIDubbelsymmetrisch: "Gelast I, dubbelsymmetrisch (kip toegestaan)",
  GelasteIMonosymmetrisch: "Gelast I, monosymmetrisch (geen kip)",
  Koker: "Koker (geen kip)",
  RondeBuis: "Ronde buis (geen kip)",
};

/**
 * Vormaanduiding voor de toetsing, afgeleid uit het ontwerp. Alleen van
 * belang als de doorsnede als eigenschappen meegaat (gat in profiel, of
 * samenstelling met catalogusdelen); bij uitsluitend lamellen leidt de kern
 * alles zelf uit de geometrie af.
 */
export function stelVormVoor(o: DoorsnedeOntwerp): CustomDoorsnedevorm {
  if (o.soort === "gat") {
    switch (o.basis.soort) {
      case "ISection":
        return gatenDubbelsymmetrisch(o.basis, o.gaten)
          ? "GelasteIDubbelsymmetrisch"
          : "GelasteIMonosymmetrisch";
      case "Shs":
      case "Rhs":
        return "Koker";
      case "Chs":
        return "RondeBuis";
      case "Channel":
      case "ChannelSchuin":
      case "Rechthoek":
        return "Onbekend";
    }
  }
  return "Onbekend";
}

/** Gaat de doorsnede als lamellen (geometrie) naar de toetsing? */
export function gaatAlsLamellen(o: DoorsnedeOntwerp): boolean {
  return o.soort === "samenstelling" && o.catalogusdelen.length === 0 && o.lamellen.length > 0;
}

export function maakEigenDoorsnede(
  id: string,
  naam: string,
  ontwerp: DoorsnedeOntwerp,
  uitvoer: MotorUitvoer,
  vorm: CustomDoorsnedevorm,
): EigenDoorsnede {
  return {
    id,
    naam,
    ontwerp,
    eigenschappen: naarSectionProperties(uitvoer),
    vorm,
    motor: naarMotorSamenvatting(uitvoer, ontwerp),
    berekendOp: new Date().toISOString(),
  };
}
