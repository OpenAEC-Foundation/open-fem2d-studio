/**
 * alphaCr.ts — de kritieke lastfactor α_cr per UGT-combinatie, en wat de
 * norm daaraan verbindt.
 *
 * WAT DE NORM ZEGT (NEN-EN 1993-1-1)
 *
 *  * 5.2.1(3): een eerste-orde-berekening mag alleen wanneer de invloed van de
 *    vervormingen op de krachtsverdeling verwaarloosbaar is; het criterium is
 *    α_cr = F_cr/F_Ed ≥ 10 (elastisch). Daaronder moeten de tweede-orde-
 *    effecten in de berekening zitten.
 *  * 5.2.2(7)b: de staaftoets met kniklengte = systeemlengte veronderstelt
 *    krachten uit een tweede-orde-berekening mét de imperfecties van 5.3.
 *  * 5.2.2(8): wordt eerste orde gebruikt, dan hoort de kniklengte uit de
 *    zijdelingse knikvorm van het raamwerk te komen.
 *
 * WAT ER FOUT GING (basisaudit nr 27)
 *
 * De beginstand — eerste orde, scheefstand uit, kniklengte leeg (= systeem-
 * lengte) — volgde geen van beide routes en niets meldde dat. Gemeten op een
 * portaal 6 × 4 m HEA160 met scharnierende voeten: α_cr ≈ 1,0 bij N_Ed = 351 kN
 * per kolom, en de toets zei UC 0,474 "Ok"; met de zijdelingse kniklengte van
 * 9,96 m is het UC 1,272. Met q = 20 kN/m: α_cr = 4,64 (5.2) en χ_y 0,812 in
 * plaats van 0,300.
 *
 * HOE α_cr HIER WORDT BEPAALD
 *
 * Niet met de benadering (5.2) — die vraagt een verdiepingshoogte en een
 * horizontale belasting, en een algemeen 2D-model heeft die niet altijd —
 * maar rechtstreeks als de laagste kritieke lastfactor van het raamwerk: de
 * factor α waarbij K_e + α·K_g(N_Ed) singulier wordt, met N_Ed de normaal-
 * krachten van de combinatie. Dat is de definitie van α_cr in 5.2.1(3), en het
 * is dezelfde matrix waarmee de tweede-orde-berekening (P-Δ) van deze motor
 * rekent, zodat "α_cr < 1" hier precies betekent dat die berekening divergeert.
 * De zoektocht gaat met bisectie op het aantal niet-positieve pivots van de
 * gecondenseerde matrix (Sylvester): dat telt hoeveel knikvormen onder α
 * liggen, dus de functie is monotoon.
 *
 * Elke staaf wordt daarbij in TWEE elementen verdeeld (een extra snede op
 * L/2): met één cubisch element per staaf ligt de kritieke last van een
 * enkelvoudige knikvorm (halve sinus) 21,6 % te hoog, met twee ≤ 0,8 %.
 * Zwaaiknik van een portaal is met één element al nauwkeurig, maar de
 * tussenverdieping-knik van een doorgaande kolom niet.
 *
 * Alleen knik IN het vlak: knik uit het vlak kent het model niet, en die
 * blijft de zaak van de staaftoets (6.3.1 om de z-as).
 *
 * Wat NIET wordt bepaald, en waarom dat gemeld wordt in plaats van geraden:
 *  * modellen met wandschijven — de membraan-K_g zit in het gemengde pad en
 *    is hier niet losgekoppeld;
 *  * modellen boven `maxDofs` vrijheidsgraden — de dichte eliminatie is O(n³)
 *    en zou de live-herberekening onwerkbaar maken.
 */
import type { Mesh } from "../../../core/fem/Mesh";
import {
  applyBoundaryConditions,
  assembleGlobalStiffnessWithGeometric,
  countNonPositivePivots,
} from "../../../core/solver/NonlinearSolver";
import { buildMesh } from "./engine";
import type { LoadCombination } from "./combinations";
import type { ElementForces, MultiInput, SolverResult } from "./types";
import type { Analysetype } from "../femTypes";

/** De grens van EN 1993-1-1 5.2.1(3): eerste orde alleen bij α_cr ≥ 10. */
export const ALPHA_CR_GRENS_EERSTE_ORDE = 10;
/** Boven deze factor wordt niet verder gezocht; α_cr is dan "> 100". */
export const ALPHA_CR_ZOEKGRENS = 100;
/** Boven dit aantal vrijheidsgraden (na de halvering) wordt α_cr niet bepaald. */
export const ALPHA_CR_MAX_DOFS = 1500;

export interface AlphaCrUitkomst {
  combinatieId: number;
  naam: string;
  /** De kritieke lastfactor; `null` bij elke andere status dan "bepaald". */
  alphaCr: number | null;
  status:
    /** α_cr gevonden tussen 0 en de zoekgrens. */
    | "bepaald"
    /** Geen enkele staaf onder druk in deze combinatie: er is geen knikvorm. */
    | "geen_druk"
    /** Boven de zoekgrens geen singulariteit gevonden: α_cr > `grens`. */
    | "boven_grens"
    /** Niet bepaald, met `reden`. */
    | "niet_bepaald";
  grens?: number;
  reden?: string;
}

/** Lineaire interpolatie van N (trek positief) op x langs de staaf. */
function normaalkrachtOp(ef: ElementForces, xMm: number): number {
  const xs = ef.stations_mm;
  const ns = ef.normalForce;
  if (xs.length === 0) return ef.N;
  if (xMm <= xs[0]) return ns[0] ?? 0;
  for (let i = 1; i < xs.length; i++) {
    if (xMm <= xs[i]) {
      const t = xs[i] === xs[i - 1] ? 0 : (xMm - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return (ns[i - 1] ?? 0) + t * ((ns[i] ?? 0) - (ns[i - 1] ?? 0));
    }
  }
  return ns[ns.length - 1] ?? 0;
}

/**
 * α_cr per UGT-combinatie van `combinaties`, met de normaalkrachten uit
 * `combinationResults`. Combinaties zonder resultaat en BGT-combinaties
 * worden overgeslagen.
 */
export function bepaalAlphaCr(
  input: MultiInput,
  combinaties: LoadCombination[],
  combinationResults: Map<number, SolverResult>,
  opties: { maxDofs?: number } = {},
): AlphaCrUitkomst[] {
  const maxDofs = opties.maxDofs ?? ALPHA_CR_MAX_DOFS;
  const uls = combinaties.filter((c) => c.type === "uls");
  if (uls.length === 0) return [];
  const nietBepaald = (reden: string): AlphaCrUitkomst[] =>
    uls.map((c) => ({ combinatieId: c.id, naam: c.name, alphaCr: null, status: "niet_bepaald", reden }));

  if (input.plates && input.plates.length > 0) {
    return nietBepaald(
      "het model bevat wandschijven; de kritieke lastfactor van het gemengde staaf-schijfstelsel " +
        "wordt hier niet bepaald",
    );
  }

  // Elke staaf in twee elementen (zie de toelichting bovenaan). Een staaf die
  // al een snede op L/2 heeft, krijgt geen tweede: de adapter laat een snede
  // op een bestaande knoop vervallen.
  const fijner: MultiInput = {
    ...input,
    beams: input.beams.map((b) => ({
      ...b,
      extraSneden: [...new Set([...(b.extraSneden ?? []), 0.5])],
    })),
  };
  const gebouwd = buildMesh(fijner, () => 0);
  const mesh = gebouwd.mesh as Mesh;
  const numDofs = mesh.getNodeCount() * 3;
  if (numDofs > maxDofs) {
    return nietBepaald(
      `het model heeft na de verdeling in elementen ${numDofs} vrijheidsgraden, meer dan de ` +
        `${maxDofs} waarvoor de directe bepaling van α_cr is bedoeld`,
    );
  }
  const nul = new Array<number>(numDofs).fill(0);

  const uit: AlphaCrUitkomst[] = [];
  for (const combo of uls) {
    const res = combinationResults.get(combo.id);
    if (!res) {
      uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: null, status: "niet_bepaald", reden: "geen combinatieresultaat" });
      continue;
    }
    // N per rekenelement, in de tekenafspraak die de assemblage verwacht
    // (druk positief; zij klapt hem zelf om — zie NonlinearSolver).
    const axiaal = new Map<number, number>();
    let druk = false;
    for (const [uiId, eersteMeshId] of gebouwd.beamIdMap) {
      const ef = res.elements.get(uiId);
      if (!ef) continue;
      const segs = gebouwd.beamSegments.get(uiId) ?? [{ meshId: eersteMeshId, t0: 0, t1: 1 }];
      for (const seg of segs) {
        const n = normaalkrachtOp(ef, ((seg.t0 + seg.t1) / 2) * ef.L_mm);
        if (n < -1e-9) druk = true;
        axiaal.set(seg.meshId, -n);
      }
    }
    if (!druk) {
      uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: null, status: "geen_druk" });
      continue;
    }

    const instabiel = (alpha: number): boolean => {
      const geschaald = new Map<number, number>();
      for (const [id, n] of axiaal) geschaald.set(id, n * alpha);
      const k = assembleGlobalStiffnessWithGeometric(mesh, geschaald, true);
      const { K } = applyBoundaryConditions(k, nul, mesh);
      return countNonPositivePivots(K) > 0;
    };

    // Zonder normaalkracht hoort het stelsel stabiel te zijn; is het dat niet,
    // dan is het model een mechanisme en zegt α_cr niets.
    if (instabiel(1e-9)) {
      uit.push({
        combinatieId: combo.id, naam: combo.name, alphaCr: null, status: "niet_bepaald",
        reden: "het stelsel is zonder normaalkracht al niet positief definiet (mechanisme of ontbrekende oplegging)",
      });
      continue;
    }
    let laag: number;
    let hoog: number;
    if (!instabiel(ALPHA_CR_GRENS_EERSTE_ORDE)) {
      if (!instabiel(ALPHA_CR_ZOEKGRENS)) {
        uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: null, status: "boven_grens", grens: ALPHA_CR_ZOEKGRENS });
        continue;
      }
      laag = ALPHA_CR_GRENS_EERSTE_ORDE;
      hoog = ALPHA_CR_ZOEKGRENS;
    } else {
      laag = 0;
      hoog = ALPHA_CR_GRENS_EERSTE_ORDE;
    }
    // Bisectie tot een relatieve nauwkeurigheid van ~0,1 % op de grens van 10.
    for (let i = 0; i < 16; i++) {
      const mid = (laag + hoog) / 2;
      if (instabiel(mid)) hoog = mid; else laag = mid;
    }
    uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: (laag + hoog) / 2, status: "bepaald" });
  }
  return uit;
}

/** Een getal in de Nederlandse schrijfwijze. */
const nl = (v: number, d = 2): string => v.toFixed(d).replace(".", ",");

/** Kort: "α_cr = 4,64", "α_cr > 100", "geen druk", "niet bepaald". */
export function alphaCrLabel(u: AlphaCrUitkomst): string {
  switch (u.status) {
    case "bepaald": return `α_cr = ${nl(u.alphaCr ?? NaN)}`;
    case "boven_grens": return `α_cr > ${u.grens ?? ALPHA_CR_ZOEKGRENS}`;
    case "geen_druk": return "geen staaf onder druk";
    default: return `α_cr niet bepaald (${u.reden ?? "onbekende reden"})`;
  }
}

export interface StabiliteitsMelding {
  niveau: "fout" | "waarschuwing" | "info";
  tekst: string;
}

/**
 * Wat de gebruiker over α_cr hoort te horen, gegeven het analysetype en of de
 * scheefstand aanstaat. Een FOUT is de blokkerende melding: eerste orde waar
 * de norm dat niet toestaat.
 */
export function stabiliteitsMeldingen(
  uitkomsten: AlphaCrUitkomst[],
  analysetype: Analysetype,
  scheefstandAan: boolean,
): StabiliteitsMelding[] {
  const meldingen: StabiliteitsMelding[] = [];
  const eersteOrde = analysetype === "eersteOrde";
  const teLaag = uitkomsten.filter(
    (u) => u.status === "bepaald" && (u.alphaCr ?? Infinity) < ALPHA_CR_GRENS_EERSTE_ORDE,
  );
  if (teLaag.length > 0) {
    const laagste = teLaag.reduce((a, b) => ((b.alphaCr ?? Infinity) < (a.alphaCr ?? Infinity) ? b : a));
    const lijst = teLaag.map((u) => `${nl(u.alphaCr ?? NaN)} ("${u.naam}")`).join(", ");
    if (eersteOrde) {
      meldingen.push({
        niveau: "fout",
        tekst:
          `EERSTE ORDE NIET TOEGESTAAN: α_cr = ${nl(laagste.alphaCr ?? NaN)} in combinatie ` +
          `"${laagste.naam}" is kleiner dan ${ALPHA_CR_GRENS_EERSTE_ORDE}` +
          (teLaag.length > 1 ? ` (alle combinaties onder de grens: ${lijst})` : "") +
          ". NEN-EN 1993-1-1 5.2.1(3) staat een eerste-orde-berekening dan niet toe: de " +
          "tweede-orde-effecten (P-Δ) zijn niet verwaarloosbaar, en de terugval van de " +
          "kniklengte op de systeemlengte in de staaftoets veronderstelt juist krachten uit een " +
          "tweede-orde-berekening met imperfecties (5.2.2(7)b). De krachten en de unity checks " +
          "van deze berekening zijn daarom NIET bruikbaar als toetsing. Kies het analysetype " +
          "tweede orde (P-Δ) met de scheefstand aan, of geef per op druk belaste staaf de " +
          "kniklengte uit de zijdelingse knikvorm op (5.2.2(8)).",
      });
    } else if (!scheefstandAan) {
      meldingen.push({
        niveau: "waarschuwing",
        tekst:
          `α_cr = ${nl(laagste.alphaCr ?? NaN)} in combinatie "${laagste.naam}" (< ${ALPHA_CR_GRENS_EERSTE_ORDE}): ` +
          "de tweede-orde-berekening dekt de vergroting, maar zij rekent ZONDER scheefstand. " +
          "NEN-EN 1993-1-1 5.2.2(3) en 5.3.2 eisen de imperfecties in de tweede-orde-berekening; " +
          "zet de scheefstand aan.",
      });
    } else {
      meldingen.push({
        niveau: "info",
        tekst:
          `α_cr = ${nl(laagste.alphaCr ?? NaN)} in combinatie "${laagste.naam}" (< ${ALPHA_CR_GRENS_EERSTE_ORDE}): ` +
          "tweede orde met scheefstand — de route van NEN-EN 1993-1-1 5.2.2(3)a/5.2.2(7)b; de " +
          "kniklengte-terugval op de systeemlengte in de staaftoets is dan toegestaan.",
      });
    }
  }
  const nietBepaald = uitkomsten.filter((u) => u.status === "niet_bepaald");
  if (nietBepaald.length > 0 && eersteOrde) {
    const redenen = [...new Set(nietBepaald.map((u) => u.reden ?? "onbekende reden"))].join("; ");
    meldingen.push({
      niveau: "waarschuwing",
      tekst:
        `α_cr is voor ${nietBepaald.length} combinatie(s) niet bepaald (${redenen}). De voorwaarde ` +
        `α_cr ≥ ${ALPHA_CR_GRENS_EERSTE_ORDE} voor een eerste-orde-berekening (NEN-EN 1993-1-1 ` +
        "5.2.1(3)) is daar dus niet gecontroleerd.",
    });
  }
  return meldingen;
}

/**
 * Het tekstblok voor het rapport en de tooltip: analysetype, α_cr per
 * combinatie en de meldingen — één bron, zodat scherm en rapport niet uiteen
 * kunnen lopen. Regels die met "!" beginnen zijn waarschuwingen of fouten.
 */
export function analyseToelichting(
  analysetype: Analysetype,
  label: string,
  omschrijving: string,
  uitkomsten: AlphaCrUitkomst[],
  scheefstandAan: boolean,
): string {
  const regels: string[] = [];
  regels.push(`Analysetype: ${label}. ${omschrijving}`);
  regels.push("");
  if (uitkomsten.length === 0) {
    regels.push("Kritieke lastfactor α_cr: geen UGT-combinaties doorgerekend.");
  } else {
    regels.push(
      "Kritieke lastfactor α_cr per UGT-combinatie (NEN-EN 1993-1-1 5.2.1(3)): de factor op de " +
        "belasting van de combinatie waarbij K_e + α·K_g(N_Ed) singulier wordt — de laagste " +
        "knikvorm van het vlakke raamwerk met de normaalkrachten van die combinatie, elke staaf in " +
        "twee elementen. Alleen knik in het vlak; knik uit het vlak blijft de zaak van de staaftoets.",
    );
    for (const u of uitkomsten) regels.push(`    ${alphaCrLabel(u)}   [${u.naam}]`);
    regels.push(
      `Eerste orde is toegestaan wanneer α_cr ≥ ${ALPHA_CR_GRENS_EERSTE_ORDE} (5.2.1(3)); daaronder ` +
        "moeten de tweede-orde-effecten in de berekening zitten, met de imperfecties van 5.3.",
    );
  }
  const meldingen = stabiliteitsMeldingen(uitkomsten, analysetype, scheefstandAan);
  if (meldingen.length > 0) {
    regels.push("");
    for (const m of meldingen) regels.push(m.niveau === "info" ? m.tekst : `! ${m.tekst}`);
  }
  return regels.join("\n");
}

/** Wat de toetsbouwers over de stabiliteit van de berekening meekrijgen. */
export interface StabiliteitVoorToets {
  analysetype: Analysetype;
  alphaCr: AlphaCrUitkomst[];
  scheefstandAan: boolean;
}

/**
 * De kanttekening bij een op DRUK belaste staaf waarvan de kniklengte in het
 * vlak op de systeemlengte terugvalt, terwijl de berekening eerste orde is en
 * α_cr < 10: dan is de knikweerstand van 6.3.1 om de y-as niet volgens
 * 5.2.2(7)b bepaald. `null` als er niets te melden is.
 */
export function alphaCrStaafNotitie(
  stabiliteit: StabiliteitVoorToets | undefined,
  nEdMinKn: number,
  kniklengteYOpgegeven: boolean,
): string | null {
  if (!stabiliteit || stabiliteit.analysetype !== "eersteOrde") return null;
  if (!(nEdMinKn < 0) || kniklengteYOpgegeven) return null;
  const teLaag = stabiliteit.alphaCr.filter(
    (u) => u.status === "bepaald" && (u.alphaCr ?? Infinity) < ALPHA_CR_GRENS_EERSTE_ORDE,
  );
  if (teLaag.length === 0) return null;
  const laagste = teLaag.reduce((a, b) => ((b.alphaCr ?? Infinity) < (a.alphaCr ?? Infinity) ? b : a));
  return (
    `EERSTE ORDE MET α_cr = ${nl(laagste.alphaCr ?? NaN)} (combinatie "${laagste.naam}") < ` +
    `${ALPHA_CR_GRENS_EERSTE_ORDE}: deze staaf staat onder druk en de kniklengte in het vlak valt ` +
    "terug op de systeemlengte. NEN-EN 1993-1-1 5.2.2(7)b staat die terugval alleen toe bij krachten " +
    "uit een tweede-orde-berekening met imperfecties, en 5.2.1(3) staat eerste orde bij α_cr < 10 " +
    "niet toe. De knikweerstand om de y-as hieronder is daarom NIET normconform bepaald: kies tweede " +
    "orde (P-Δ) met scheefstand, of geef L_cr,y uit de zijdelingse knikvorm op (5.2.2(8))."
  );
}
