/**
 * sidecar.ts — de hoofdlus van de solver-sidecar.
 *
 * De Rust-MCP-server rekent niet zelf. Per tool-aanroep start hij een
 * kortlevend Node-proces op deze module en voert daarmee LETTERLIJK dezelfde
 * `solveAllCases` / `solveAllCasesNonlinear` uit die de app aanroept. Er komt
 * dus geen tweede rekenkern bij: een tweede implementatie zou betekenen dat
 * hetzelfde model twee plausibele antwoorden kan geven, en in constructieve
 * software is dat een veiligheidsprobleem, geen onderhoudslast.
 *
 * DE KETEN, en waarom precies deze
 *   bouwMultiInput  → solveAllCases / solveAllCasesNonlinear
 *                   → combineResults → computeEnvelope
 *                   → buildSteelCheckInputs
 * NOOIT rechtstreeks `solveNonlinear` of `core/fem/Mesh`: die leveren andere
 * EENHEDEN én andere TEKENS. De omslag naar trek-positief gebeurt pas in de
 * adapterlaag (`engine.ts`, convertResult), dus wie de kern rechtstreeks
 * aanroept krijgt getallen die er goed uitzien en het niet zijn.
 * Let ook op de argumentvolgorde: `combineResults(combinatie, perCase)`.
 *
 * STARTEN
 *   node fem-kernel.mjs --sidecar
 * De vlag is de betrouwbare schakelaar: de bundel wordt ook door de
 * regressierunner en het bundelscript geïMPORTEERD, en dan mag de lus juist
 * NIET starten. Wordt de bundel rechtstreeks als hoofdmodule gedraaid, dan
 * start hij ook zonder vlag (zie `draaitAlsHoofdmodule`).
 *
 * GEEN `node:`-IMPORTS
 * Het bundelscript keurt elke overgebleven `import`-regel af: de bundel moet
 * volledig zelfdragend zijn, want Rust bakt hem met `include_str!` in de
 * binary. Daarom praat deze module uitsluitend via de Node-GLOBAL `process`
 * met de buitenwereld, en haalt hij `node:fs`/`node:crypto` — enkel voor de
 * zelf-hash in de handshake — op via `process.getBuiltinModule`.
 *
 * STDOUT IS PROTOCOL
 * Er staan `console.log`-regels in de gebundelde solvercode. Op stdout zouden
 * die het NDJSON-kanaal corrumperen, dus alle console-uitvoer wordt hier naar
 * stderr omgeleid voordat er ook maar één verzoek wordt afgehandeld.
 */
import {
  solveAllCases,
  solveAllCasesNonlinear,
} from "../components/fem/solver/engine";
import {
  combineResults,
  computeEnvelope,
  defaultCombinations,
  type LoadCombination,
} from "../components/fem/solver/combinations";
import { buildSteelCheckInputs, profileLookupKey } from "../lib/steelCheckBuilder";
import { bouwMultiInput, type FemModelInvoer } from "../lib/modelNaarSolverInput";
import {
  PROJECT_FORMAT_VERSION,
  combinationsFromFile,
  deserializeProject,
} from "../io/projectFile";
import type {
  ElementForces,
  MultiLcResult,
  SolverResult,
} from "../components/fem/solver/types";
import type { Beam, BeamCheckConfig } from "../components/fem/femTypes";
import type { SteelProfile } from "../lib/types/steel/SteelProfile";
import { version as PAKKET_VERSIE } from "../../package.json";
import { beeldKernfoutAf } from "./fouten";
import { controleerVelden, valideerModel } from "./valideerModel";
import {
  SIDECAR_OPS,
  SIDECAR_PROTOCOL,
  mapNaarObject,
  maakFout,
  maakOk,
  ontleedVerzoek,
  serialiseerAntwoord,
  telNietEindig,
  type SidecarAntwoord,
  type SidecarVerzoek,
} from "./protocol";

/**
 * Minimale typering van de Node-global `process`. Dit project heeft bewust
 * geen `@types/node` (het is een browser-app); alleen de sidecar draait in
 * Node, en alleen deze paar velden worden gebruikt.
 */
declare const process: {
  argv: string[];
  versions: { node: string };
  exitCode?: number;
  stdin: {
    setEncoding(codering: string): void;
    on(gebeurtenis: string, luisteraar: (brok?: string) => void): void;
    resume(): void;
  };
  stdout: { write(regel: string): boolean };
  stderr: { write(regel: string): boolean };
  getBuiltinModule?: (naam: string) => unknown;
};

// ── Eenheden ───────────────────────────────────────────────────────────────
// De solver rekent in N, mm, rad en N·mm. Naar buiten toe gelden de eenheden
// uit het contract: kN, kNm, mm, rad — dezelfde eenheden die `check_steel_beam`
// gebruikt, zodat een client geen enkele grootheid zelf hoeft om te rekenen.

/** N → kN. */
const naarKN = (n: number) => n / 1000;
/** N·mm → kNm. */
const naarKNm = (nmm: number) => nmm / 1e6;

/** Eenheden- en tekenafspraak; gaat mee in elk solve-antwoord. */
const EENHEDEN = {
  kracht: "kN",
  moment: "kNm",
  verplaatsing: "mm",
  rotatie: "rad",
  teken: "N positief = trek; z positief omhoog",
} as const;

// ── Zelf-hash ──────────────────────────────────────────────────────────────

/**
 * SHA-256 van het bestand dat dit proces draait, in `sha256:<hex>`-vorm.
 *
 * Dit is een TWEEDE lezer naast de Rust-kant: `build.rs` bewaakt dat de
 * ingebakken bundel bij `fem-kernel.sha256` hoort, en met deze waarde kan de
 * server bovendien controleren dat het bestand dat Node daadwerkelijk laadde
 * hetzelfde is — relevant bij de ontsnappingsklep `OPENAEC_FEM_KERNEL`.
 *
 * `process.getBuiltinModule` bestaat pas vanaf Node 22.3. Op oudere (maar
 * toegestane) Node 20/21 komt hier `null` uit; de bindende hash-poort blijft
 * dan de Rust-kant. Bewust geen `import` van `node:crypto`: het bundelscript
 * eist nul externe imports in de bundel.
 */
function zelfHash(): string | null {
  const haal = process.getBuiltinModule;
  const pad = process.argv[1];
  if (typeof haal !== "function" || !pad) return null;
  try {
    const fs = haal("node:fs") as {
      readFileSync(pad: string): { length: number };
    };
    const crypto = haal("node:crypto") as {
      createHash(alg: string): {
        update(data: unknown): { digest(codering: string): string };
      };
    };
    const bytes = fs.readFileSync(pad);
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    return null;
  }
}

// ── Payload lezen ──────────────────────────────────────────────────────────

/** Payload deugt niet (vorm, veld, type) → INVOER_ONGELDIG. */
class InvoerFout extends Error {
  constructor(
    melding: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(melding);
  }
}

/** Meegestuurde bestandsinhoud is niet te lezen → BESTAND_ONLEESBAAR. */
class BestandFout extends Error {
  constructor(
    melding: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(melding);
  }
}

/** De rekenkern weigerde het model → MODEL_ONOPLOSBAAR. */
class ModelFout extends Error {}

function eisObject(waarde: unknown, veld: string): Record<string, unknown> {
  if (typeof waarde !== "object" || waarde === null || Array.isArray(waarde)) {
    throw new InvoerFout(`Veld \`${veld}\` moet een JSON-object zijn.`);
  }
  return waarde as Record<string, unknown>;
}

function eisArray(waarde: unknown, veld: string): unknown[] {
  if (!Array.isArray(waarde)) {
    throw new InvoerFout(`Veld \`${veld}\` moet een array zijn.`);
  }
  return waarde;
}

function leesTekst(payload: Record<string, unknown>, veld: string): string {
  const waarde = payload[veld];
  if (typeof waarde !== "string" || waarde.length === 0) {
    throw new InvoerFout(`Veld \`${veld}\` ontbreekt of is geen tekst.`);
  }
  return waarde;
}

/** Wat `leesModel` uit een payload haalt. */
interface GelezenModel {
  model: FemModelInvoer;
  /**
   * Het model zoals de aanroeper het aanleverde, ONGEFILTERD. `model` hierboven
   * is genormaliseerd — daar zijn onbekende sleutels al uit weggevallen, en
   * juist die moet de strenge validatie kunnen zien. Bij een projectbestand
   * bevat dit de modelvelden van het bestand; de bestandsvelden eromheen
   * (`format`, `version`, `savedAt`, …) blijven er buiten, want die horen bij
   * het bestandsformaat en niet bij het model.
   */
  rauw: Record<string, unknown>;
  beams: Beam[];
  /** Combinaties uit het projectbestand, of `null` als het bestand ze niet had. */
  combinatiesUitBestand: LoadCombination[] | null;
  /** Tweede-orde-vlag uit het projectbestand, of `null` bij een los model. */
  nonlinearUitBestand: boolean | null;
  formatVersion: number | null;
}

/**
 * Model uit een payload: ofwel `model` (store-eigen vorm), ofwel `project`
 * (de INHOUD van een `.ifcfem2d`-bestand). De sidecar leest zelf nooit van
 * schijf: Rust levert de bytes aan. Zo blijft alle bestandstoegang aan één
 * kant, zijn de FEM-tools aantoonbaar alleen-lezen, en heeft de bundel geen
 * `node:fs` nodig — wat hij ook niet mag hebben, want de bundel moet nul
 * externe imports bevatten.
 */
function leesModel(payload: Record<string, unknown>): GelezenModel {
  const heeftModel = payload.model !== undefined;
  const heeftProject = payload.project !== undefined;
  if (heeftModel === heeftProject) {
    throw new InvoerFout(
      "Geef precies één van `model` (het model zelf) of `project` " +
        "(de inhoud van een .ifcfem2d-bestand).",
    );
  }

  if (heeftProject) {
    const project = eisObject(payload.project, "project");
    const inhoud = leesTekst(project, "inhoud");
    let bestand;
    try {
      bestand = deserializeProject(inhoud);
    } catch (err) {
      throw new BestandFout(
        "Het projectbestand kon niet worden gelezen.",
        { originele_melding: String(err) },
      );
    }
    const uitBestand = {
      nodes: bestand.nodes ?? [],
      beams: bestand.beams ?? [],
      supports: bestand.supports ?? [],
      plates: bestand.plates ?? [],
      loadCases: bestand.loadCases ?? [],
      loads: bestand.loads ?? [],
      selfWeightEnabled: bestand.selfWeightEnabled ?? false,
      scheefstandEnabled: bestand.scheefstandEnabled ?? false,
      scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
      scheefstandRichting: bestand.scheefstandRichting ?? 1,
    };
    return {
      model: uitBestand,
      // De arrays zijn dezelfde objecten als in het bestand, dus een onbekend
      // veld BINNEN een knoop, staaf of last blijft zichtbaar voor de validatie.
      rauw: uitBestand as unknown as Record<string, unknown>,
      beams: bestand.beams ?? [],
      combinatiesUitBestand: combinationsFromFile(bestand.combinations) ?? null,
      nonlinearUitBestand: bestand.nonlinearEnabled ?? null,
      formatVersion: bestand.version,
    };
  }

  const rauw = eisObject(payload.model, "model");
  const beams = eisArray(rauw.beams ?? [], "model.beams") as Beam[];

  // Doorsnedegrootheden horen NIET in de invoer: `bouwMultiInput` leidt E, A
  // en I af uit (materiaal, profiel) via `resolveSection` — dezelfde route als
  // de app. Zou de sidecar hier losse E/A/I accepteren, dan bestond er een
  // tweede waarheid over de doorsnede; even gevaarlijk als een tweede solver
  // en moeilijker op te merken, omdat beide antwoorden plausibel ogen.
  for (const beam of beams) {
    const b = beam as unknown as Record<string, unknown>;
    for (const veld of ["E", "A", "I"]) {
      if (b[veld] !== undefined) {
        throw new InvoerFout(
          `Staaf ${String(b.id)} geeft \`${veld}\` rechtstreeks op. Dat wordt ` +
            "niet ondersteund: de doorsnede volgt uit `material` en `profile`, " +
            "zodat er één bron voor A en I is.",
        );
      }
    }
  }

  return {
    model: {
      nodes: eisArray(rauw.nodes ?? [], "model.nodes") as FemModelInvoer["nodes"],
      beams,
      supports: eisArray(
        rauw.supports ?? [],
        "model.supports",
      ) as FemModelInvoer["supports"],
      plates: eisArray(rauw.plates ?? [], "model.plates") as FemModelInvoer["plates"],
      loadCases: eisArray(
        rauw.loadCases ?? [],
        "model.loadCases",
      ) as FemModelInvoer["loadCases"],
      loads: eisArray(rauw.loads ?? [], "model.loads") as FemModelInvoer["loads"],
      selfWeightEnabled: rauw.selfWeightEnabled === true,
      scheefstandEnabled: rauw.scheefstandEnabled === true,
      scheefstandNoemer:
        typeof rauw.scheefstandNoemer === "number" ? rauw.scheefstandNoemer : 200,
      scheefstandRichting: rauw.scheefstandRichting === -1 ? -1 : 1,
    },
    rauw,
    beams,
    combinatiesUitBestand: null,
    nonlinearUitBestand: null,
    formatVersion: null,
  };
}

/**
 * Combinaties uit de payload (`{ id, name, type, formula, factors }` met
 * `factors` als `{ "<caseId>": factor }`), anders die uit het projectbestand,
 * anders de EN 1990-standaardset van de app.
 */
function leesCombinaties(
  payload: Record<string, unknown>,
  uitBestand: LoadCombination[] | null,
): LoadCombination[] {
  if (payload.combinations !== undefined) {
    const rauw = eisArray(payload.combinations, "combinations");
    const uit = combinationsFromFile(
      rauw as Parameters<typeof combinationsFromFile>[0],
    );
    if (!uit) throw new InvoerFout("Veld `combinations` is geen geldige lijst.");
    return uit;
  }
  return uitBestand ?? defaultCombinations();
}

/**
 * Profieldatabase uit de payload. De bron is de Rust-crate `steel-profiles`;
 * de sidecar draagt bewust geen eigen kopie, zodat er één profielwaarheid is.
 * Ontbreekt de lijst, dan blijft `steel_check_inputs` leeg — mét waarschuwing,
 * nooit stil.
 */
function leesProfielen(payload: Record<string, unknown>): Map<string, SteelProfile> {
  const db = new Map<string, SteelProfile>();
  if (payload.profiles === undefined) return db;
  for (const item of eisArray(payload.profiles, "profiles")) {
    const profiel = item as SteelProfile;
    if (!profiel || typeof profiel.name !== "string") {
      throw new InvoerFout("Elk item in `profiles` heeft een `name` nodig.");
    }
    const sleutel = profileLookupKey(profiel.name);
    if (!db.has(sleutel)) db.set(sleutel, profiel);
  }
  return db;
}

/** `check_config`: per staaf-id de store-eigen `BeamCheckConfig`. */
function pasCheckConfigToe(beams: Beam[], payload: Record<string, unknown>): Beam[] {
  if (payload.check_config === undefined) return beams;
  const configs = eisObject(payload.check_config, "check_config");
  return beams.map((beam) => {
    const extra = configs[String(beam.id)];
    if (extra === undefined) return beam;
    return {
      ...beam,
      checkConfig: {
        ...(beam.checkConfig ?? {}),
        ...(eisObject(extra, `check_config.${beam.id}`) as BeamCheckConfig),
      },
    };
  });
}

// ── Resultaten vormgeven ───────────────────────────────────────────────────

function vormStaafkrachten(ef: ElementForces, metStations: boolean) {
  const basis = {
    N: naarKN(ef.N),
    V: naarKN(ef.V),
    M_start: naarKNm(ef.M_start),
    M_end: naarKNm(ef.M_end),
    L_mm: ef.L_mm,
  };
  if (!metStations) return basis;
  return {
    ...basis,
    stations_mm: ef.stations_mm,
    N_x: ef.normalForce.map(naarKN),
    V_x: ef.shearForce.map(naarKN),
    M_x: ef.bendingMoment.map(naarKNm),
    w_x: ef.deflection,
    u_x: ef.axialDisp,
  };
}

function vormResultaat(res: SolverResult, metStations: boolean) {
  return {
    reactions: mapNaarObject(res.reactions, (r) => ({
      fx: naarKN(r.fx),
      fz: naarKN(r.fz),
      my: naarKNm(r.my),
    })),
    displacements: mapNaarObject(res.displacements, (d) => ({
      ux: d.ux,
      uz: d.uz,
      ry: d.ry,
    })),
    elements: mapNaarObject(res.elements, (ef) => vormStaafkrachten(ef, metStations)),
    maxDisplacement: res.maxDisplacement,
  };
}

function vormEnvelop(env: ReturnType<typeof computeEnvelope>) {
  return {
    elements: mapNaarObject(env.elements, (e) => ({
      N_min: naarKN(e.N_min),
      N_max: naarKN(e.N_max),
      V_min: naarKN(e.V_min),
      V_max: naarKN(e.V_max),
      M_min: naarKNm(e.M_min),
      M_max: naarKNm(e.M_max),
      governingCombinationId: e.governingCombinationId,
      governingMAbs: naarKNm(e.governingMAbs),
    })),
    reactions: mapNaarObject(env.reactions, (r) => ({
      fx_min: naarKN(r.fx_min),
      fx_max: naarKN(r.fx_max),
      fz_min: naarKN(r.fz_min),
      fz_max: naarKN(r.fz_max),
    })),
    maxDisplacement: env.maxDisplacement,
    maxDisplacementCombinationId: env.maxDisplacementCombinationId,
  };
}

// ── Bewerkingen ────────────────────────────────────────────────────────────

function opHandshake() {
  return {
    protocol: SIDECAR_PROTOCOL,
    node_version: `v${process.versions.node}`,
    bundle_version: PAKKET_VERSIE,
    bundle_hash: zelfHash(),
    project_format_version: PROJECT_FORMAT_VERSION,
    ops: [...SIDECAR_OPS],
  };
}

/** Gedeelde kern van `solve` en `check`. */
function rekenDoor(payload: Record<string, unknown>) {
  const gelezen = leesModel(payload);

  // Strenge veldpoort VÓÓR het rekenen. Een onbekende of verkeerd getypte
  // sleutel is geen schoonheidsfoutje: `bouwMultiInput` laat zo'n last door
  // alle takken heen vallen en de solve slaagt met een resultaat waarin die
  // last ontbreekt — nul, en niet te onderscheiden van een echte nul. Weigeren
  // is daarom het enige veilige antwoord. Dit staat NA `leesModel`, zodat de
  // specifiekere melding over losse E/A/I op een staaf voorrang houdt.
  const veldFouten = controleerVelden(gelezen.rauw);
  if (veldFouten.length > 0) {
    throw new InvoerFout(
      `Het model bevat ${veldFouten.length} invoerfout(en) — zie ` +
        "`detail.fouten`. Onbekende velden worden geweigerd, niet genegeerd: " +
        "een genegeerd veld levert een geslaagde berekening op die bij een " +
        "ander model hoort.",
      { fouten: veldFouten },
    );
  }

  const combinaties = leesCombinaties(payload, gelezen.combinatiesUitBestand);
  const profileDb = leesProfielen(payload);

  // Tweede orde: uit het projectbestand als dat er is — een projectbestand
  // draagt de keuze van de constructeur, en die mag een tool-vlag niet
  // stilzwijgend overrulen.
  const nonlinear =
    gelezen.nonlinearUitBestand !== null
      ? gelezen.nonlinearUitBestand
      : payload.nonlinear === true;

  const detail = payload.detail ?? "samenvatting";
  if (detail !== "samenvatting" && detail !== "stations") {
    throw new InvoerFout(
      "Veld `detail` moet \"samenvatting\" of \"stations\" zijn.",
    );
  }
  const metStations = detail === "stations";

  const multiInput = bouwMultiInput(gelezen.model);

  const start = Date.now();
  let perCaseResultaat: MultiLcResult;
  try {
    perCaseResultaat = nonlinear
      ? solveAllCasesNonlinear(multiInput)
      : solveAllCases(multiInput);
  } catch (err) {
    throw new ModelFout(String((err as Error)?.message ?? err));
  }
  const { perCase } = perCaseResultaat;

  let combinationResults: Map<number, SolverResult>;
  let envelope: ReturnType<typeof computeEnvelope>;
  try {
    combinationResults = new Map(
      combinaties.map((c) => [c.id, combineResults(c, perCase)] as const),
    );
    envelope = computeEnvelope(combinaties, perCase);
  } catch (err) {
    throw new ModelFout(String((err as Error)?.message ?? err));
  }
  const solveMs = Date.now() - start;

  const gevraagd = gelezen.model.loadCases.map((lc) => lc.id);
  const opgelost = [...perCase.keys()];
  // `solveAllCases` slaat een belastinggeval zonder werkzame last stilzwijgend
  // over. Zonder deze lijst krijgt een client een ontbrekende sleutel die als
  // "nul" leest; daarom staat hij expliciet in het antwoord.
  const legeGevallen = gevraagd.filter((id) => !perCase.has(id));

  const teToetsen = pasCheckConfigToe(gelezen.beams, payload);
  const beamIds =
    payload.beam_ids === undefined
      ? null
      : new Set(
          (eisArray(payload.beam_ids, "beam_ids") as unknown[]).map(Number),
        );
  const staafSelectie =
    beamIds === null ? teToetsen : teToetsen.filter((b) => beamIds.has(b.id));

  const staal = buildSteelCheckInputs({
    nodes: gelezen.model.nodes,
    beams: staafSelectie,
    combinations: combinaties,
    combinationResults,
    profileDb,
  });

  const waarschuwingen: string[] = [];
  if (profileDb.size === 0) {
    waarschuwingen.push(
      "Geen profieldatabase meegegeven (`profiles`); `steel_check_inputs` " +
        "blijft daardoor leeg. Lever de lijst uit de staalprofielendatabase mee.",
    );
  }
  if (legeGevallen.length > 0) {
    waarschuwingen.push(
      `Belastinggeval(len) ${legeGevallen.join(", ")} zonder werkzame last ` +
        "overgeslagen; ze tellen als nulbijdrage in de combinaties.",
    );
  }

  return {
    combinaties,
    combinationResults,
    envelope,
    perCase,
    metStations,
    nonlinear,
    solveMs,
    gevraagd,
    opgelost,
    legeGevallen,
    staal,
    waarschuwingen,
    formatVersion: gelezen.formatVersion,
  };
}

function opSolve(payload: Record<string, unknown>) {
  const d = rekenDoor(payload);

  const antwoord = {
    solver_version: PAKKET_VERSIE,
    bundle_hash: zelfHash(),
    units: EENHEDEN,
    nonlinear_used: d.nonlinear,
    cases_requested: d.gevraagd,
    cases_solved: d.opgelost,
    cases_skipped_empty: d.legeGevallen,
    per_case: mapNaarObject(d.perCase, (r) => vormResultaat(r, d.metStations)),
    combinations: mapNaarObject(d.combinationResults, (r) =>
      vormResultaat(r, d.metStations),
    ),
    envelope: vormEnvelop(d.envelope),
    steel_check_inputs: d.staal.inputs,
    skipped_beams: d.staal.skipped.map((s) => ({
      beam_id: s.beamId,
      reason: s.reason,
    })),
    warnings: d.waarschuwingen,
    solve_ms: d.solveMs,
  };

  const ontspoord = telNietEindig(antwoord.per_case) +
    telNietEindig(antwoord.combinations) +
    telNietEindig(antwoord.envelope);
  if (ontspoord > 0) {
    antwoord.warnings.push(
      `${ontspoord} resultaatwaarde(n) zijn NaN of oneindig. JSON schrijft die ` +
        "als null weg, wat als nul kan worden gelezen — vertrouw dit resultaat niet.",
    );
  }

  return antwoord;
}

/**
 * `check`: dezelfde doorrekening, maar het antwoord is toegespitst op de
 * toetsing. De normtoetsing zelf gebeurt in Rust (`steel_check::check_all_beams`)
 * — dezelfde functie die de app aanroept. De sidecar levert alleen de invoer,
 * en levert die ook zichtbaar mee terug, zodat te zien is wát er getoetst is.
 */
function opCheck(payload: Record<string, unknown>) {
  const d = rekenDoor(payload);
  return {
    solve_summary: {
      cases_requested: d.gevraagd,
      cases_solved: d.opgelost,
      cases_skipped_empty: d.legeGevallen,
      nonlinear_used: d.nonlinear,
      solve_ms: d.solveMs,
    },
    units: EENHEDEN,
    steel_check_inputs: d.staal.inputs,
    skipped_beams: d.staal.skipped.map((s) => ({
      beam_id: s.beamId,
      reason: s.reason,
    })),
    warnings: d.waarschuwingen,
  };
}

/**
 * `validate`: droogloop zonder rekenen (plan §3.2). Bestaat omdat een tikfout
 * in een lastveld vandaag een gesláágde solve met een ontbrekende last
 * oplevert — een fout die als "nul" leest. Deze bewerking rekent bewust niet:
 * ze zegt alleen of het model doorgerekend mag worden, en waarom niet.
 */
function opValidate(payload: Record<string, unknown>) {
  const gelezen = leesModel(payload);
  const uitkomst = valideerModel(gelezen.rauw);
  return {
    ok: uitkomst.ok,
    errors: uitkomst.errors,
    warnings: uitkomst.warnings,
    counts: {
      nodes: gelezen.model.nodes.length,
      beams: gelezen.model.beams.length,
      supports: gelezen.model.supports.length,
      plates: gelezen.model.plates.length,
      loads: gelezen.model.loads.length,
      load_cases: gelezen.model.loadCases.length,
    },
  };
}

/**
 * `load_project`: het gedeserialiseerde model plus tellingen. Alleen-lezen —
 * en de sidecar raakt de schijf niet eens aan: Rust levert de inhoud in
 * `payload.inhoud`, `payload.path` is er alleen om het antwoord te labelen.
 */
function opLoadProject(payload: Record<string, unknown>) {
  const gelezen = leesModel({
    project: { inhoud: leesTekst(payload, "inhoud") },
  });
  const m = gelezen.model;
  return {
    path: typeof payload.path === "string" ? payload.path : null,
    format_version: gelezen.formatVersion,
    supported_format_version: PROJECT_FORMAT_VERSION,
    model: m,
    combinations: (gelezen.combinatiesUitBestand ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      formula: c.formula,
      factors: Object.fromEntries([...c.factors].map(([k, v]) => [String(k), v])),
    })),
    nonlinear_enabled: gelezen.nonlinearUitBestand,
    counts: {
      nodes: m.nodes.length,
      beams: m.beams.length,
      supports: m.supports.length,
      plates: m.plates.length,
      loads: m.loads.length,
      load_cases: m.loadCases.length,
      combinations: (gelezen.combinatiesUitBestand ?? []).length,
    },
  };
}

// ── Hoofdlus ───────────────────────────────────────────────────────────────

/**
 * Eén verzoek afhandelen. Gooit nooit: elke fout wordt een net antwoord met
 * een Nederlandse melding en een foutcode waar de Rust-kant op kan beslissen.
 */
export function verwerkVerzoek(verzoek: SidecarVerzoek): SidecarAntwoord {
  try {
    switch (verzoek.op) {
      case "handshake":
        return maakOk(verzoek.id, opHandshake());
      case "solve":
        return maakOk(verzoek.id, opSolve(verzoek.payload));
      case "check":
        return maakOk(verzoek.id, opCheck(verzoek.payload));
      case "load_project":
        return maakOk(verzoek.id, opLoadProject(verzoek.payload));
      case "validate":
        // Een gevonden modelfout is GEEN protocolfout: de bewerking is
        // geslaagd, het antwoord luidt alleen `ok: false`. Daarom `maakOk` —
        // wie een lijst bevindingen vraagt en er een krijgt, kreeg antwoord.
        return maakOk(verzoek.id, opValidate(verzoek.payload));
    }
  } catch (err) {
    if (err instanceof InvoerFout) {
      return maakFout(verzoek.id, "INVOER_ONGELDIG", err.message, err.detail);
    }
    if (err instanceof BestandFout) {
      return maakFout(verzoek.id, "BESTAND_ONLEESBAAR", err.message, err.detail);
    }
    if (err instanceof ModelFout) {
      // De kern meldt in het Engels; `fouten.ts` beeldt bekende meldingen af op
      // Nederlands en kiest de foutcode. Een ONBEKENDE melding wordt niet
      // gegokt: die komt door als `INTERN`, want "de solver kon dit model niet
      // oplossen" zou een uitspraak over de constructie zijn die niemand heeft
      // onderbouwd. De originele tekst gaat in beide gevallen mee in `detail`.
      const afgebeeld = beeldKernfoutAf(err.message);
      return maakFout(
        verzoek.id,
        afgebeeld.code,
        afgebeeld.melding,
        afgebeeld.detail,
      );
    }
    return maakFout(
      verzoek.id,
      "INTERN",
      "Onverwachte fout in de sidecar.",
      { originele_melding: String((err as Error)?.stack ?? err) },
    );
  }
}

/** Eén stdin-regel → één stdout-regel. Lege regels worden overgeslagen. */
export function verwerkRegel(regel: string): string | null {
  const opgeschoond = regel.replace(/\r$/, "");
  if (opgeschoond.trim().length === 0) return null;
  const ontleed = ontleedVerzoek(opgeschoond);
  const antwoord = ontleed.ok
    ? verwerkVerzoek(ontleed.verzoek)
    : ontleed.antwoord;
  return serialiseerAntwoord(antwoord);
}

/**
 * Leidt alle console-uitvoer naar stderr. stdout is uitsluitend protocol: één
 * `console.log` uit de gebundelde solvercode (die er zijn) zou het NDJSON-
 * kanaal ongeldig maken en de aanroeper laten stikken op een regel die geen
 * antwoord is.
 */
function leidConsoleOm(): void {
  const naarStderr = (...delen: unknown[]) => {
    process.stderr.write(
      `${delen.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join(" ")}\n`,
    );
  };
  console.log = naarStderr;
  console.info = naarStderr;
  console.debug = naarStderr;
  console.warn = naarStderr;
  console.error = naarStderr;
}

/**
 * De hoofdlus: leest NDJSON van stdin, schrijft per regel één antwoordregel
 * naar stdout, en eindigt met exitcode 0 zodra stdin sluit.
 *
 * Er wordt bewust NIET met `process.exit()` afgesloten: dat kan een nog niet
 * geleegde stdout-pipe afkappen, waardoor het laatste antwoord verdwijnt en de
 * aanroeper een crash ziet waar een geldig antwoord stond.
 */
export function startSidecar(): void {
  leidConsoleOm();
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (brok?: string) => {
    buffer += brok ?? "";
    let grens = buffer.indexOf("\n");
    while (grens >= 0) {
      const regel = buffer.slice(0, grens);
      buffer = buffer.slice(grens + 1);
      const antwoord = verwerkRegel(regel);
      if (antwoord !== null) process.stdout.write(antwoord);
      grens = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => {
    // Laatste regel zonder afsluitende "\n" telt gewoon mee.
    const antwoord = verwerkRegel(buffer);
    if (antwoord !== null) process.stdout.write(antwoord);
    buffer = "";
    process.exitCode = 0;
  });
  process.stdin.resume();
}

/**
 * Draait dit bestand als hoofdmodule? Vergelijkt `process.argv[1]` met de
 * eigen module-URL, zonder `node:path`/`node:url` te importeren (de bundel
 * mag geen enkele externe import bevatten).
 */
function draaitAlsHoofdmodule(): boolean {
  const pad = process.argv[1];
  if (!pad) return false;
  try {
    const eigen = decodeURIComponent(new URL(import.meta.url).pathname)
      .replace(/^\/([A-Za-z]:)/, "$1")
      .toLowerCase();
    return pad.replace(/\\/g, "/").toLowerCase() === eigen;
  } catch {
    return false;
  }
}

// Starten gebeurt ALLEEN met de expliciete vlag of als hoofdmodule. De bundel
// wordt ook geïmporteerd — door het bundelscript en door de bundelstand van de
// regressierunner — en dan mag de lus niet aanslaan.
if (process.argv.includes("--sidecar") || draaitAlsHoofdmodule()) {
  startSidecar();
}
