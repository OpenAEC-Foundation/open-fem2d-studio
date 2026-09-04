/**
 * cltCheckBuilder.ts — kruislaaghout (CLT) in het model: profielnaam →
 * opbouw, opbouw → invoer voor het command `check_clt_beams`, en de
 * mechanica-spiegel (zwaartelijn, (EI)_ef, spanningsverloop) voor de solver
 * en voor de tekening in het rapport.
 *
 * HERKENNING IN HET DATAMODEL
 * ---------------------------
 * Een staaf is kruislaaghout wanneer de profielnaam met "CLT" begint. De
 * sterkteklasse van de lamellen komt uit `beam.material` ("C24", …), net als
 * bij massief hout; per laag kan die in de naam overschreven worden.
 *
 * Grammatica van de profielnaam (hoofdletterongevoelig):
 *
 *   CLT 40/20/40/20/40              lagen van boven naar beneden, afwisselend
 *                                   lengte/dwars/lengte/…, klasse = materiaal
 *   CLT 40L/20D/40L/20D/40L         richting per laag expliciet (L = lengte,
 *                                   D = dwars)
 *   CLT 40:C24/20:C16/40:C24        sterkteklasse per laag expliciet
 *   CLT 40/20/40/20/40 b600         strookbreedte in mm (standaard 1000)
 *
 * De vormen zijn combineerbaar ("40L:C24"). `formatCltProfiel` schrijft de
 * kortst mogelijke naam terug, zodat "CLT 40/20/40/20/40" ook zo blijft
 * heten na een rondreis door de kiezer.
 *
 * METHODE (zie de Rust-kern `nen-en-1995-1-1/src/clt.rs` voor de volledige
 * onderbouwing): samengestelde doorsnede met starre verbinding — bijlage B
 * met γ_i = 1. Alleen lengtelagen dragen in de spanrichting (E = E_0,mean);
 * dwarslagen zijn de schuifverbinding (E = 0). De spiegel hier rekent
 * hetzelfde uit als de kern en is daar tegen getest (zie
 * `test-clt-builder.mjs`); de TOETSING komt altijd uit de kern.
 */
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { CltBeamCheckInput } from "./types/timber/CltBeamCheckInput";
import type { CltBeamCheckResult } from "./types/timber/CltBeamCheckResult";
import type { CltLayup } from "./types/timber/CltLayup";
import type { CltLayer } from "./types/timber/CltLayer";
import type { CltLayerOrientation } from "./types/timber/CltLayerOrientation";
import type { CltLayupResult } from "./types/timber/CltLayupResult";
import type { CltPreset } from "./types/timber/CltPreset";
import type { CheckSkip, MemberCheckResult } from "./checkTypes";
import { beamLengthMm, buildForcesEnvelope } from "./steelCheckBuilder";
import {
  mapLoadDuration,
  mapServiceClass,
  matchSupportedTimberGrade,
  SUPPORTED_TIMBER_GRADES,
} from "./timberCheckBuilder";

/** Standaard strookbreedte van een CLT-plaat in het 2D-model (per meter). */
export const CLT_STROOKBREEDTE_MM = 1000;

/**
 * Standaardopbouwen — browser-fallback voor het command `list_clt_presets`
 * en moet daarmee overeenkomen (`nen-en-1995-1-1/src/clt.rs`). Het zijn
 * VOORINSTELLINGEN met ronde lameldikten, geen productmaten; de gebruiker
 * past ze vrij aan.
 */
export const CLT_VOORINSTELLINGEN: readonly CltPreset[] = [
  { name: "3-laags 60", thicknesses_mm: [20, 20, 20], height_mm: 60 },
  { name: "3-laags 90", thicknesses_mm: [30, 30, 30], height_mm: 90 },
  { name: "3-laags 120", thicknesses_mm: [40, 40, 40], height_mm: 120 },
  { name: "5-laags 100", thicknesses_mm: [20, 20, 20, 20, 20], height_mm: 100 },
  { name: "5-laags 140", thicknesses_mm: [40, 20, 20, 20, 40], height_mm: 140 },
  { name: "5-laags 160", thicknesses_mm: [40, 20, 40, 20, 40], height_mm: 160 },
  { name: "5-laags 200", thicknesses_mm: [40, 40, 40, 40, 40], height_mm: 200 },
  { name: "7-laags 200", thicknesses_mm: [30, 20, 30, 40, 30, 20, 30], height_mm: 200 },
  { name: "7-laags 240", thicknesses_mm: [40, 30, 30, 40, 30, 30, 40], height_mm: 240 },
  { name: "7-laags 280", thicknesses_mm: [40, 40, 40, 40, 40, 40, 40], height_mm: 280 },
];

/** Nederlandse benaming van de laagrichting. */
export function richtingLabel(r: CltLayerOrientation): string {
  return r === "Longitudinal" ? "lengte" : "dwars";
}

/** Afwisselende richting, beginnend met een lengtelaag (index 0 = boven). */
export function standaardRichting(index: number): CltLayerOrientation {
  return index % 2 === 0 ? "Longitudinal" : "Transverse";
}

/** Herkent een CLT-profielnaam ("CLT …"). */
export function isCltProfiel(profileName: string | undefined): boolean {
  return /^\s*CLT\b/i.test(profileName ?? "");
}

/** Opbouw uit een voorinstelling: afwisselend, één klasse, standaardbreedte. */
export function cltVanVoorinstelling(
  preset: CltPreset,
  klasse: string,
  breedteMm: number = CLT_STROOKBREEDTE_MM,
): CltLayup {
  return {
    width_mm: breedteMm,
    layers: preset.thicknesses_mm.map((t, i) => ({
      thickness_mm: t,
      orientation: standaardRichting(i),
      strength_class: klasse,
    })),
  };
}

const LAAG_TOKEN = /^(\d+(?:[.,]\d+)?)([LD])?(?::([A-Za-z]+\d+[A-Za-z]*))?$/i;

/**
 * Profielnaam → opbouw. `standaardKlasse` (het staafmateriaal) geldt voor
 * lagen zonder eigen klasse. null wanneer de naam geen geldige CLT-naam is.
 */
export function parseCltProfiel(
  profileName: string | undefined,
  standaardKlasse: string,
): CltLayup | null {
  const naam = profileName?.trim();
  if (!naam) return null;
  const m = /^CLT\s+(\S+)(?:\s+b\s*=?\s*(\d+(?:[.,]\d+)?))?$/i.exec(naam);
  if (!m) return null;
  const breedte = m[2] ? parseFloat(m[2].replace(",", ".")) : CLT_STROOKBREEDTE_MM;
  if (!(breedte > 0)) return null;

  const tokens = m[1].split("/");
  if (tokens.length < 3) return null;
  const layers: CltLayer[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tm = LAAG_TOKEN.exec(tokens[i]);
    if (!tm) return null;
    const dikte = parseFloat(tm[1].replace(",", "."));
    if (!(dikte > 0)) return null;
    const richting: CltLayerOrientation = tm[2]
      ? tm[2].toUpperCase() === "L"
        ? "Longitudinal"
        : "Transverse"
      : standaardRichting(i);
    layers.push({
      thickness_mm: dikte,
      orientation: richting,
      strength_class: tm[3] ?? standaardKlasse,
    });
  }
  return { width_mm: breedte, layers };
}

/**
 * Opbouw → kortst mogelijke profielnaam. Richting en klasse worden alleen
 * geschreven waar ze van de standaard (afwisselend, `standaardKlasse`)
 * afwijken; de breedte alleen wanneer die niet 1000 mm is.
 */
export function formatCltProfiel(layup: CltLayup, standaardKlasse: string): string {
  const tokens = layup.layers.map((l, i) => {
    let tok = maatTekst(l.thickness_mm);
    if (l.orientation !== standaardRichting(i)) tok += l.orientation === "Longitudinal" ? "L" : "D";
    if (l.strength_class.toLowerCase() !== standaardKlasse.toLowerCase()) tok += `:${l.strength_class}`;
    return tok;
  });
  const b = layup.width_mm !== CLT_STROOKBREEDTE_MM ? ` b${maatTekst(layup.width_mm)}` : "";
  return `CLT ${tokens.join("/")}${b}`;
}

function maatTekst(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r);
}

/** Totale dikte h = Σ t_i (mm). */
export function cltHoogteMm(layup: CltLayup): number {
  return layup.layers.reduce((s, l) => s + l.thickness_mm, 0);
}

/** Voorkomende sterkteklassen, in volgorde van eerste voorkomen ("C24/C16"). */
export function cltKlassenLabel(layup: CltLayup): string {
  const uniek: string[] = [];
  for (const l of layup.layers) {
    if (!uniek.some((u) => u.toLowerCase() === l.strength_class.toLowerCase())) uniek.push(l.strength_class);
  }
  return uniek.join("/");
}

// ── Mechanica-spiegel ───────────────────────────────────────────────────────

export interface CltLaagMechanica {
  /** Boven- en onderkant vanaf de bovenkant van de plaat (mm). */
  zBoven: number;
  zOnder: number;
  /** E in de spanrichting (N/mm²); 0 voor een dwarslaag. */
  e: number;
  richting: CltLayerOrientation;
}

export interface CltMechanica {
  breedte: number;
  hoogte: number;
  /** Zwaartelijn (E-gewogen) vanaf boven (mm). */
  z0: number;
  /** (EI)_ef in N·mm². */
  eiEf: number;
  /** (EA)_ef in N. */
  eaEf: number;
  lagen: CltLaagMechanica[];
}

/**
 * Zwaartelijn en effectieve stijfheden van een opbouw — bijlage B (B.1),
 * (B.6) met γ_i = 1. `eVanKlasse` levert E_0,mean per sterkteklasse (de
 * aanroeper geeft de tabel mee, zodat dit bestand niet aan een bepaalde
 * materiaaltabel vastzit). null bij een onbekende klasse of een opbouw
 * zonder lengtelaag.
 */
export function cltMechanica(
  layup: CltLayup,
  eVanKlasse: (klasse: string) => number | undefined,
): CltMechanica | null {
  if (!(layup.width_mm > 0) || layup.layers.length === 0) return null;
  const lagen: CltLaagMechanica[] = [];
  let z = 0;
  let ea = 0;
  let eaz = 0;
  for (const l of layup.layers) {
    if (!(l.thickness_mm > 0)) return null;
    const e0 = eVanKlasse(l.strength_class);
    if (e0 === undefined) return null;
    const e = l.orientation === "Longitudinal" ? e0 : 0;
    const zBoven = z;
    const zOnder = z + l.thickness_mm;
    z = zOnder;
    const a = layup.width_mm * l.thickness_mm;
    ea += e * a;
    eaz += e * a * (zBoven + zOnder) / 2;
    lagen.push({ zBoven, zOnder, e, richting: l.orientation });
  }
  if (!(ea > 0)) return null;
  const z0 = eaz / ea;
  return { breedte: layup.width_mm, hoogte: z, z0, eiEf: eiEfVan(layup.width_mm, z0, lagen), eaEf: ea, lagen };
}

function eiEfVan(b: number, z0: number, lagen: CltLaagMechanica[]): number {
  let ei = 0;
  for (const l of lagen) {
    if (l.e === 0) continue;
    const t = l.zOnder - l.zBoven;
    const arm = (l.zBoven + l.zOnder) / 2 - z0;
    ei += l.e * ((b * t * t * t) / 12 + b * t * arm * arm);
  }
  return ei;
}

/** Dezelfde mechanica, opgebouwd uit het resultaat van de kern. */
export function cltMechanicaUitResultaat(res: CltLayupResult): CltMechanica {
  const lagen: CltLaagMechanica[] = res.layers.map((l) => ({
    zBoven: l.z_top_mm,
    zOnder: l.z_bot_mm,
    e: l.e_mpa,
    richting: l.orientation,
  }));
  return {
    breedte: res.width_mm,
    hoogte: res.height_mm,
    z0: res.z0_mm,
    eiEf: res.ei_ef_knm2 * 1e9,
    eaEf: res.ea_ef_kn * 1e3,
    lagen,
  };
}

/** (ES)(z): E-gewogen statisch moment van het deel bóven z om z₀ (N·mm). */
export function cltEsBoven(mech: CltMechanica, z: number): number {
  let es = 0;
  for (const l of mech.lagen) {
    if (l.e === 0 || z <= l.zBoven) continue;
    const za = l.zBoven;
    const zb = Math.min(z, l.zOnder);
    es += l.e * mech.breedte * ((zb * zb - za * za) / 2 - mech.z0 * (zb - za));
  }
  return es;
}

/** Buigspanning in laag `laag` op hoogte z (N/mm², trek +); M in kNm. */
export function cltSigmaOpZ(mech: CltMechanica, laag: number, z: number, mKnm: number): number {
  if (!(mech.eiEf > 0)) return 0;
  return (mech.lagen[laag].e * mKnm * 1e6 * (z - mech.z0)) / mech.eiEf;
}

/** Schuifspanning op hoogte z (N/mm²); V in kN, b_ef = k_cr·b. */
export function cltTauOpZ(mech: CltMechanica, z: number, vKn: number, kCr = 1): number {
  const bEf = kCr * mech.breedte;
  if (!(mech.eiEf > 0) || !(bEf > 0)) return 0;
  return (Math.abs(vKn) * 1e3 * Math.abs(cltEsBoven(mech, z))) / (mech.eiEf * bEf);
}

/**
 * Doorsnede-grootheden voor de solver: E, A en I zó dat E·A = (EA)_ef en
 * E·I = (EI)_ef, met E de E-modulus van de bovenste lengtelaag. `aBruto` is
 * de volle doorsnede (alle lagen) voor het eigen gewicht — het gewicht van
 * de dwarslagen telt wél mee, hun stijfheid niet.
 */
export function cltSolverDoorsnede(
  layup: CltLayup,
  eVanKlasse: (klasse: string) => number | undefined,
): { E: number; A: number; I: number; aBruto: number } | null {
  const mech = cltMechanica(layup, eVanKlasse);
  if (!mech) return null;
  const eRef = mech.lagen.find((l) => l.e > 0)?.e;
  if (!eRef) return null;
  return {
    E: eRef,
    A: mech.eaEf / eRef,
    I: mech.eiEf / eRef,
    aBruto: mech.breedte * mech.hoogte,
  };
}

// ── Invoer voor de kern ─────────────────────────────────────────────────────

export interface CltBuildData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
  /** Runtime-lijst uit `list_timber_grades`; leeg → statische fallback. */
  supportedGrades?: string[];
}

export interface CltBuildResult {
  inputs: CltBeamCheckInput[];
  /** CLT-staven die herkend maar niet toetsbaar zijn, met reden. */
  skipped: CheckSkip[];
}

/**
 * Bouwt CltBeamCheckInput[] voor alle staven met een CLT-profiel. Staven
 * zonder CLT-profiel zijn geen zaak van deze bouwer (die gaan naar de
 * staal- of houtbouwer). Defaults, gedocumenteerd:
 *  - klimaatklasse 1 en belastingduur "middellang" wanneer `checkConfig`
 *    ze niet geeft (zelfde keuze als de houtbouwer);
 *  - k_cr = 1,0 (NB bij 6.1.7, prismatische doorsnede); geen lastverdelend
 *    systeem (k_sys = 1,0).
 */
export function buildCltCheckInputs(data: CltBuildData): CltBuildResult {
  const inputs: CltBeamCheckInput[] = [];
  const skipped: CheckSkip[] = [];
  const grades =
    data.supportedGrades && data.supportedGrades.length > 0
      ? data.supportedGrades
      : SUPPORTED_TIMBER_GRADES;
  const ulsCombos = data.combinations.filter((c) => c.type === "uls");

  for (const beam of data.beams) {
    if (!isCltProfiel(beam.profile)) continue;

    const materialName = beam.material?.trim() ?? "";
    const grade = matchSupportedTimberGrade(materialName, grades);
    if (!grade) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${materialName || "—"}" is geen ondersteunde sterkteklasse voor de lamellen — kies bijv. C24`,
      });
      continue;
    }

    const layup = parseCltProfiel(beam.profile, grade);
    if (!layup) {
      skipped.push({
        beamId: beam.id,
        reason: `profiel "${beam.profile}" is geen geldige CLT-opbouw — gebruik bijv. "CLT 40/20/40/20/40" (lagen van boven naar beneden, optioneel L/D en :klasse per laag, optioneel b600)`,
      });
      continue;
    }
    const onbekend = layup.layers.find((l) => !matchSupportedTimberGrade(l.strength_class, grades));
    if (onbekend) {
      skipped.push({
        beamId: beam.id,
        reason: `sterkteklasse "${onbekend.strength_class}" in de opbouw is onbekend — bekend zijn ${grades.join(", ")}`,
      });
      continue;
    }
    if (!layup.layers.some((l) => l.orientation === "Longitudinal")) {
      skipped.push({ beamId: beam.id, reason: "de CLT-opbouw heeft geen lengtelaag — niets draagt in de spanrichting" });
      continue;
    }

    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 — knopen ontbreken" });
      continue;
    }
    const hasAnyResult = ulsCombos.some((c) => data.combinationResults.get(c.id)?.elements.has(beam.id));
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties — reken het model eerst door",
      });
      continue;
    }

    const cfg = beam.checkConfig ?? {};
    inputs.push({
      beam_id: beam.id,
      layup,
      service_class: mapServiceClass(cfg.serviceClass),
      load_duration: mapLoadDuration(cfg.loadDuration),
      length_m: lengthMm / 1000,
      forces_envelope: buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults),
      // NB bij 6.1.7: k_cr = 1,0 voor liggers met een prismatische doorsnede.
      k_cr: 1.0,
      load_sharing: false,
    });
  }

  return { inputs, skipped };
}

/**
 * Type-guard: een CLT-resultaat draagt de opbouw (`layup`). Het resultaat
 * is structureel een superset van TimberBeamCheckResult, zodat het door het
 * toetsingsoverzicht en "Toetsing per staaf" loopt als houtresultaat; deze
 * guard haalt het eruit voor de CLT-sectie.
 */
export function isCltCheckResult(r: MemberCheckResult | CltBeamCheckResult): r is CltBeamCheckResult {
  return "layup" in r && typeof (r as CltBeamCheckResult).layup === "object" && (r as CltBeamCheckResult).layup !== null;
}
