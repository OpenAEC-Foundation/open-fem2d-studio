/**
 * valideerModel.ts — strenge modelvalidatie voor de MCP-sidecar.
 *
 * WAAROM STRENG, EN WAAROM DIT BESTAND BESTAAT
 * De rekenketen is vergevingsgezind op precies de verkeerde plek. Een lijnlast
 * met `qq` in plaats van `q` valt in `bouwMultiInput` door alle takken heen en
 * verdwijnt zonder een woord; een onbekende profielnaam valt in
 * `resolveSection` terug op HEA 160 / S235; een puntlast op een knoop die aan
 * geen enkele staaf hangt wordt bij het opbouwen van de krachtvector
 * overgeslagen. In alle drie de gevallen SLAAGT de berekening en komt er een
 * plausibel ogend antwoord uit dat bij een ander model hoort. Voor een
 * constructeur is dat gevaarlijker dan een foutmelding: nul leest als nul.
 *
 * Daarom weigert deze validatie ONBEKENDE VELDEN in plaats van ze te negeren.
 * Een tikfout in een sleutel is de enige waarneembare aanwijzing dat de
 * aanroeper iets anders bedoelde dan er staat; hem opeten maakt het verschil
 * tussen "u bedoelde `q`" en een stille nul onzichtbaar.
 *
 * TWEE INGANGEN, met verschillend gebruik:
 *
 *   controleerVelden(rauw) → string[]
 *       De HARDE POORT. Alleen vorm, veldnamen en types. Draait ook vóór elke
 *       `solve` en `check`: een model dat hier faalt mag nooit doorgerekend
 *       worden, want dan is niet te zeggen wélk model er is doorgerekend.
 *
 *   valideerModel(rauw) → { ok, errors, warnings }
 *       De VOLLEDIGE droogloop (`op: "validate"`, plan §3.2): de veldcontrole
 *       plus de constructieve controles — losse knopen, mechanisme, staven met
 *       lengte 0, dubbele knopen, onbekende profiel/materiaalcombinaties,
 *       lasten die stil wegvallen, belastinggevallen zonder werkzame last en
 *       polygoonplaten zonder geldige meshcache.
 *
 * WAT DEZE VALIDATIE NIET CLAIMT
 * `ok: true` betekent "geen van de bekende valkuilen aangetroffen", niet "dit
 * model is oplosbaar". De mechanismecontrole toetst NOODZAKELIJKE voorwaarden
 * (er moet in x én z gesteund zijn, rotatie moet verhinderd zijn, elk
 * losstaand constructiedeel moet ergens steunen). Dat een stelsel niet
 * singulier is, bewijst alleen de ontbinding zelf — en die hoort in de solver,
 * niet hier. Een tweede, benaderende stelselcontrole zou een tweede antwoord
 * op dezelfde vraag zijn, en dat is precies wat dit ontwerp vermijdt.
 *
 * GEEN TWEEDE WAARHEID
 * De controle "valt deze last stilzwijgend weg?" wordt niet nageschreven maar
 * GEMETEN: de last gaat door `bouwMultiInput` — dezelfde functie die de app
 * gebruikt — en levert die daar geen invoerregel op, dan telt hij niet mee.
 * Zo kan deze validatie per definitie niet uit de pas lopen met de mapping.
 * Om dezelfde reden komt de doorsnedecontrole uit `resolveSection` en de
 * plaatvormcontrole uit `valideerPlaatPolygoon` / `isAsgelijndeRechthoek`.
 */
import {
  berekenPlaatMeshSignatuur,
  isAsgelijndeRechthoek,
  leesPlaatMeshCache,
  valideerPlaatPolygoon,
  type PlaatPunt,
} from "../components/fem/femTypes";
import { bouwMultiInput, type FemModelInvoer } from "../lib/modelNaarSolverInput";
import { resolveSection } from "../lib/sectionResolver";

/** Uitkomst van de volledige droogloop; alle teksten zijn Nederlands. */
export interface ValidatieUitkomst {
  ok: boolean;
  /** Blokkerend: doorrekenen levert een fout of een antwoord bij een ánder model. */
  errors: string[];
  /** Niet blokkerend, wel het melden waard. */
  warnings: string[];
}

// ── Toegestane velden per objectsoort ──────────────────────────────────────
// Deze lijsten zijn de spiegel van `femTypes.ts` en `FemModelInvoer`. Wordt
// daar een veld toegevoegd, dan hoort het hier ook; tot die tijd weigert de
// validatie het — luidruchtig, en dat is de bedoeling.

const MODEL_VELDEN = [
  "nodes", "beams", "supports", "plates", "loadCases", "loads",
  "selfWeightEnabled", "scheefstandEnabled", "scheefstandNoemer",
  "scheefstandRichting",
] as const;

const NODE_VELDEN = ["id", "x", "z"] as const;

const BEAM_VELDEN = [
  "id", "from", "to", "material", "profile", "releases", "checkConfig",
  "loadRole",
] as const;

const RELEASE_VELDEN = [
  "startTx", "startTz", "startRy", "endTx", "endTz", "endRy",
] as const;

const CHECKCONFIG_VELDEN = [
  "bucklingLengthY_m", "bucklingLengthZ_m", "lateralRestraints",
  "lateralRestraintsBottom", "deflectionClass", "deflectionLimitNumerator",
  "preCamber_mm", "serviceClass", "loadDuration",
] as const;

const SUPPORT_VELDEN = ["nodeId", "type", "k"] as const;

const PLATE_VELDEN = [
  "id", "nodeIds", "thickness", "E", "nu", "rho", "meshSize", "meshCache",
] as const;

const MESHCACHE_VELDEN = [
  "signature", "points", "triangles", "edgeNodeIndices",
] as const;

const LOAD_VELDEN = [
  "id", "type", "caseId", "nodeId", "fx", "fz", "my", "beamId", "posFrac",
  "q", "qStart", "qEnd", "qDir", "qCoord", "startFrac", "endFrac", "deltaT",
  "plateId", "edge", "edgeIndex", "gegenereerdDoor",
] as const;

const LOADCASE_VELDEN = ["id", "name", "type", "gegenereerd"] as const;

const SUPPORT_TYPES = [
  "pinned", "fixed", "xRoller", "zRoller", "zSpring", "xSpring", "rotSpring",
] as const;

const LOAD_TYPES = [
  "pointForce", "pointMoment", "lineLoad", "thermal", "edgeLoad",
] as const;

const LOADCASE_TYPES = ["dead", "live", "snow", "wind", "other"] as const;

const LOADROLLEN = [
  "gevelLinks", "gevelRechts", "dakPlat", "dakHellend", "overstek", "vloer",
  "binnen",
] as const;

/** Welke vrijheidsgraad elk oplegtype vastzet (veren tellen als vastgezet). */
const VASTGEZET: Record<string, ("x" | "z" | "ry")[]> = {
  fixed: ["x", "z", "ry"],
  pinned: ["x", "z"],
  xRoller: ["x"],
  zRoller: ["z"],
  xSpring: ["x"],
  zSpring: ["z"],
  rotSpring: ["ry"],
};

// ── Kleine hulpjes ─────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isGetal = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isGeheel = (v: unknown): v is number => isGetal(v) && Number.isInteger(v);

/** Levenshtein-afstand, alleen voor de "bedoelde u …?"-hint. */
function afstand(a: string, b: string): number {
  const rij = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let vorige = rij[0];
    rij[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tijdelijk = rij[j];
      rij[j] = Math.min(
        rij[j] + 1,
        rij[j - 1] + 1,
        vorige + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      vorige = tijdelijk;
    }
  }
  return rij[b.length];
}

/**
 * Dichtstbijzijnde bekende veldnaam, of null als niets in de buurt komt. De
 * drempel schaalt mee met de lengte: bij `qq` (2 tekens) telt één afwijking,
 * bij `deflectionLimitNumerato` mogen er meer zijn.
 */
function dichtstbij(veld: string, bekend: readonly string[]): string | null {
  let beste: string | null = null;
  let besteAfstand = Number.POSITIVE_INFINITY;
  for (const kandidaat of bekend) {
    const d = afstand(veld.toLowerCase(), kandidaat.toLowerCase());
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = kandidaat;
    }
  }
  const drempel = Math.max(1, Math.floor(veld.length / 3));
  return beste !== null && besteAfstand <= drempel ? beste : null;
}

/** Elk veld dat niet in `toegestaan` staat is een fout, mét hint. */
function keurVelden(
  obj: Record<string, unknown>,
  toegestaan: readonly string[],
  pad: string,
  fouten: string[],
): void {
  for (const veld of Object.keys(obj)) {
    if (toegestaan.includes(veld)) continue;
    const hint = dichtstbij(veld, toegestaan);
    fouten.push(
      `${pad}: onbekend veld \`${veld}\`. ` +
        (hint !== null
          ? `Bedoelde u \`${hint}\`? Een onbekend veld wordt niet meegerekend.`
          : `Bekende velden: ${toegestaan.join(", ")}.`),
    );
  }
}

/** Waarde moet een van de toegestane teksten zijn (als hij er staat). */
function keurEnum(
  waarde: unknown,
  toegestaan: readonly string[],
  pad: string,
  fouten: string[],
): void {
  if (waarde === undefined) return;
  if (typeof waarde !== "string" || !toegestaan.includes(waarde)) {
    fouten.push(
      `${pad}: ${JSON.stringify(waarde)} is geen geldige waarde. ` +
        `Toegestaan: ${toegestaan.join(", ")}.`,
    );
  }
}

/** Optioneel getalveld; leeg is goed, aanwezig-maar-geen-getal niet. */
function keurGetal(
  waarde: unknown,
  pad: string,
  fouten: string[],
  { positief = false } = {},
): void {
  if (waarde === undefined) return;
  if (!isGetal(waarde)) {
    fouten.push(`${pad}: moet een getal zijn, maar is ${JSON.stringify(waarde)}.`);
    return;
  }
  if (positief && waarde <= 0) {
    fouten.push(`${pad}: moet groter dan nul zijn, maar is ${waarde}.`);
  }
}

/** Verplicht geheel getal (identiteiten en verwijzingen). */
function eisGeheel(
  waarde: unknown,
  pad: string,
  fouten: string[],
): void {
  if (!isGeheel(waarde)) {
    fouten.push(
      `${pad}: verplicht en moet een geheel getal zijn, maar is ` +
        `${JSON.stringify(waarde)}.`,
    );
  }
}

/** Array-veld uit het model halen; ontbreken mag, iets anders dan array niet. */
function leesArray(
  model: Record<string, unknown>,
  veld: string,
  fouten: string[],
): unknown[] {
  const waarde = model[veld];
  if (waarde === undefined) return [];
  if (!Array.isArray(waarde)) {
    fouten.push(`model.${veld}: moet een array zijn.`);
    return [];
  }
  return waarde;
}

// ── De harde poort: vorm, veldnamen en types ───────────────────────────────

/**
 * Controleert uitsluitend de VORM van het model: onbekende velden, ontbrekende
 * verplichte velden, verkeerde types en onbekende enum-waarden. Geeft een lege
 * lijst als het model qua vorm deugt.
 *
 * Bewust gescheiden van de constructieve controles: dit is de poort die ook
 * vóór `solve` draait, en die mag nooit weigeren om iets dat alleen maar
 * verdacht is.
 */
export function controleerVelden(rauw: unknown): string[] {
  const fouten: string[] = [];
  if (!isObject(rauw)) {
    return ["model: moet een JSON-object zijn."];
  }
  keurVelden(rauw, MODEL_VELDEN, "model", fouten);

  // Vlaggen op modelniveau.
  for (const vlag of ["selfWeightEnabled", "scheefstandEnabled"] as const) {
    if (rauw[vlag] !== undefined && typeof rauw[vlag] !== "boolean") {
      fouten.push(`model.${vlag}: moet true of false zijn.`);
    }
  }
  keurGetal(rauw.scheefstandNoemer, "model.scheefstandNoemer", fouten, {
    positief: true,
  });
  if (
    rauw.scheefstandRichting !== undefined &&
    rauw.scheefstandRichting !== 1 &&
    rauw.scheefstandRichting !== -1
  ) {
    fouten.push("model.scheefstandRichting: moet 1 (+x) of −1 (−x) zijn.");
  }

  // Knopen.
  const nodes = leesArray(rauw, "nodes", fouten);
  nodes.forEach((n, i) => {
    const pad = `model.nodes[${i}]`;
    if (!isObject(n)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(n, NODE_VELDEN, pad, fouten);
    eisGeheel(n.id, `${pad}.id`, fouten);
    if (!isGetal(n.x)) fouten.push(`${pad}.x: verplicht getal (mm).`);
    if (!isGetal(n.z)) fouten.push(`${pad}.z: verplicht getal (mm).`);
  });

  // Staven.
  const beams = leesArray(rauw, "beams", fouten);
  beams.forEach((b, i) => {
    const pad = `model.beams[${i}]`;
    if (!isObject(b)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(b, BEAM_VELDEN, pad, fouten);
    eisGeheel(b.id, `${pad}.id`, fouten);
    eisGeheel(b.from, `${pad}.from`, fouten);
    eisGeheel(b.to, `${pad}.to`, fouten);
    for (const veld of ["material", "profile"] as const) {
      if (b[veld] !== undefined && typeof b[veld] !== "string") {
        fouten.push(`${pad}.${veld}: moet tekst zijn.`);
      }
    }
    keurEnum(b.loadRole, LOADROLLEN, `${pad}.loadRole`, fouten);
    if (b.releases !== undefined) {
      if (!isObject(b.releases)) {
        fouten.push(`${pad}.releases: moet een object zijn.`);
      } else {
        keurVelden(b.releases, RELEASE_VELDEN, `${pad}.releases`, fouten);
        for (const [veld, waarde] of Object.entries(b.releases)) {
          if (waarde !== undefined && typeof waarde !== "boolean") {
            fouten.push(`${pad}.releases.${veld}: moet true of false zijn.`);
          }
        }
      }
    }
    if (b.checkConfig !== undefined) {
      if (!isObject(b.checkConfig)) {
        fouten.push(`${pad}.checkConfig: moet een object zijn.`);
      } else {
        const cc = b.checkConfig;
        const cpad = `${pad}.checkConfig`;
        keurVelden(cc, CHECKCONFIG_VELDEN, cpad, fouten);
        keurGetal(cc.bucklingLengthY_m, `${cpad}.bucklingLengthY_m`, fouten, { positief: true });
        keurGetal(cc.bucklingLengthZ_m, `${cpad}.bucklingLengthZ_m`, fouten, { positief: true });
        keurGetal(cc.deflectionLimitNumerator, `${cpad}.deflectionLimitNumerator`, fouten, { positief: true });
        keurGetal(cc.preCamber_mm, `${cpad}.preCamber_mm`, fouten);
        keurEnum(cc.deflectionClass, ["floor", "roof", "cantilever", "custom"], `${cpad}.deflectionClass`, fouten);
        keurEnum(cc.loadDuration, ["permanent", "long", "medium", "short", "instantaneous"], `${cpad}.loadDuration`, fouten);
        if (cc.serviceClass !== undefined && ![1, 2, 3].includes(cc.serviceClass as number)) {
          fouten.push(`${cpad}.serviceClass: moet 1, 2 of 3 zijn.`);
        }
        for (const veld of ["lateralRestraints", "lateralRestraintsBottom"] as const) {
          const lijst = cc[veld];
          if (lijst === undefined) continue;
          if (!Array.isArray(lijst) || !lijst.every(isGetal)) {
            fouten.push(`${cpad}.${veld}: moet een array van getallen (fracties 0..1) zijn.`);
          }
        }
      }
    }
  });

  // Opleggingen.
  const supports = leesArray(rauw, "supports", fouten);
  supports.forEach((s, i) => {
    const pad = `model.supports[${i}]`;
    if (!isObject(s)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(s, SUPPORT_VELDEN, pad, fouten);
    eisGeheel(s.nodeId, `${pad}.nodeId`, fouten);
    if (s.type === undefined) {
      fouten.push(`${pad}.type: verplicht. Toegestaan: ${SUPPORT_TYPES.join(", ")}.`);
    } else {
      keurEnum(s.type, SUPPORT_TYPES, `${pad}.type`, fouten);
    }
    keurGetal(s.k, `${pad}.k`, fouten);
  });

  // Platen.
  const plates = leesArray(rauw, "plates", fouten);
  plates.forEach((p, i) => {
    const pad = `model.plates[${i}]`;
    if (!isObject(p)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(p, PLATE_VELDEN, pad, fouten);
    eisGeheel(p.id, `${pad}.id`, fouten);
    if (!Array.isArray(p.nodeIds) || !p.nodeIds.every(isGeheel)) {
      fouten.push(`${pad}.nodeIds: verplichte array van knoop-id's.`);
    } else if (p.nodeIds.length < 3) {
      fouten.push(`${pad}.nodeIds: een plaat heeft minstens drie hoekknopen nodig.`);
    }
    keurGetal(p.thickness, `${pad}.thickness`, fouten, { positief: true });
    keurGetal(p.E, `${pad}.E`, fouten, { positief: true });
    keurGetal(p.nu, `${pad}.nu`, fouten);
    keurGetal(p.rho, `${pad}.rho`, fouten, { positief: true });
    keurGetal(p.meshSize, `${pad}.meshSize`, fouten, { positief: true });
    if (p.meshCache !== undefined) {
      if (!isObject(p.meshCache)) {
        fouten.push(`${pad}.meshCache: moet een object zijn.`);
      } else {
        keurVelden(p.meshCache, MESHCACHE_VELDEN, `${pad}.meshCache`, fouten);
        if (typeof p.meshCache.signature !== "string") {
          fouten.push(`${pad}.meshCache.signature: verplichte tekst (geometrie-handtekening).`);
        }
        if (!Array.isArray(p.meshCache.points) || !Array.isArray(p.meshCache.triangles)) {
          fouten.push(`${pad}.meshCache: \`points\` en \`triangles\` zijn verplichte arrays.`);
        }
      }
    }
  });

  // Belastinggevallen.
  const loadCases = leesArray(rauw, "loadCases", fouten);
  loadCases.forEach((lc, i) => {
    const pad = `model.loadCases[${i}]`;
    if (!isObject(lc)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(lc, LOADCASE_VELDEN, pad, fouten);
    eisGeheel(lc.id, `${pad}.id`, fouten);
    if (typeof lc.name !== "string" || lc.name.length === 0) {
      fouten.push(`${pad}.name: verplichte naam.`);
    }
    // `type` mag ontbreken (oude bestanden); een verkeerde waarde niet — die
    // zou het eigengewicht in het verkeerde geval kunnen zetten.
    keurEnum(lc.type, LOADCASE_TYPES, `${pad}.type`, fouten);
  });

  // Lasten.
  const loads = leesArray(rauw, "loads", fouten);
  loads.forEach((l, i) => {
    const pad = `model.loads[${i}]`;
    if (!isObject(l)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(l, LOAD_VELDEN, pad, fouten);
    eisGeheel(l.id, `${pad}.id`, fouten);
    eisGeheel(l.caseId, `${pad}.caseId`, fouten);
    if (l.type === undefined) {
      fouten.push(`${pad}.type: verplicht. Toegestaan: ${LOAD_TYPES.join(", ")}.`);
    } else {
      keurEnum(l.type, LOAD_TYPES, `${pad}.type`, fouten);
    }
    for (const veld of ["nodeId", "beamId", "plateId", "edgeIndex"] as const) {
      if (l[veld] !== undefined && !isGeheel(l[veld])) {
        fouten.push(`${pad}.${veld}: moet een geheel getal zijn.`);
      }
    }
    for (const veld of ["fx", "fz", "my", "q", "qStart", "qEnd", "deltaT"] as const) {
      keurGetal(l[veld], `${pad}.${veld}`, fouten);
    }
    for (const veld of ["posFrac", "startFrac", "endFrac"] as const) {
      const waarde = l[veld];
      if (waarde === undefined) continue;
      if (!isGetal(waarde) || waarde < 0 || waarde > 1) {
        fouten.push(`${pad}.${veld}: moet een fractie tussen 0 en 1 zijn.`);
      }
    }
    keurEnum(l.qDir, ["x", "z"], `${pad}.qDir`, fouten);
    keurEnum(l.qCoord, ["global", "local"], `${pad}.qCoord`, fouten);
    keurEnum(l.edge, ["bottom", "top", "left", "right"], `${pad}.edge`, fouten);
    keurEnum(l.gegenereerdDoor, ["wind"], `${pad}.gegenereerdDoor`, fouten);
  });

  return fouten;
}

// ── De constructieve controles ─────────────────────────────────────────────

/** Dubbele id's binnen één lijst. */
function meldDubbeleIds(
  items: { id?: unknown }[],
  soort: string,
  fouten: string[],
): void {
  const gezien = new Set<number>();
  for (const item of items) {
    const id = item.id;
    if (typeof id !== "number") continue;
    if (gezien.has(id)) {
      fouten.push(
        `Er zijn twee ${soort} met id ${id}. Id's moeten uniek zijn — anders ` +
          "is niet te zeggen op welke van beide een verwijzing slaat.",
      );
    }
    gezien.add(id);
  }
}

/**
 * Levert deze last een invoerregel op? Gemeten met `bouwMultiInput` zelf, op
 * een model dat alleen deze last bevat en waarin eigengewicht en scheefstand
 * uit staan — dan komt elke geproduceerde regel gegarandeerd van deze last.
 * Zo blijft de mapping de enige waarheid over wat meetelt.
 */
function teltLastMee(last: unknown, loadCases: unknown[]): boolean {
  const proef: FemModelInvoer = {
    nodes: [],
    beams: [],
    supports: [],
    plates: [],
    loadCases: loadCases as FemModelInvoer["loadCases"],
    loads: [last] as FemModelInvoer["loads"],
    selfWeightEnabled: false,
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  };
  const mi = bouwMultiInput(proef);
  return (
    mi.loads.length +
      (mi.pointLoads?.length ?? 0) +
      (mi.beamPointLoads?.length ?? 0) +
      (mi.thermalLoads?.length ?? 0) +
      (mi.edgeLoads?.length ?? 0) >
    0
  );
}

/**
 * Rauw model → `FemModelInvoer` met dezelfde defaults die de sidecar hanteert.
 * Nodig omdat `bouwMultiInput` op de arrays itereert: een ontbrekende
 * `plates`-sleutel zou hem laten struikelen, terwijl dat gewoon "geen platen"
 * betekent.
 */
function alsModelInvoer(m: Record<string, unknown>): FemModelInvoer {
  const arr = <T>(waarde: unknown): T[] => (Array.isArray(waarde) ? (waarde as T[]) : []);
  return {
    nodes: arr(m.nodes),
    beams: arr(m.beams),
    supports: arr(m.supports),
    plates: arr(m.plates),
    loadCases: arr(m.loadCases),
    loads: arr(m.loads),
    selfWeightEnabled: m.selfWeightEnabled === true,
    scheefstandEnabled: m.scheefstandEnabled === true,
    scheefstandNoemer:
      typeof m.scheefstandNoemer === "number" ? m.scheefstandNoemer : 200,
    scheefstandRichting: m.scheefstandRichting === -1 ? -1 : 1,
  };
}

/** Alle belastinggeval-id's waarvoor de mapping daadwerkelijk invoer oplevert. */
function gevallenMetLast(model: FemModelInvoer): Set<number> {
  const mi = bouwMultiInput(model);
  const ids = new Set<number>();
  const noteer = (caseId: number | undefined) => {
    if (typeof caseId === "number") ids.add(caseId);
  };
  for (const l of mi.loads) noteer(l.caseId);
  for (const l of mi.pointLoads ?? []) noteer(l.caseId);
  for (const l of mi.beamPointLoads ?? []) noteer(l.caseId);
  for (const l of mi.thermalLoads ?? []) noteer(l.caseId);
  for (const l of mi.edgeLoads ?? []) noteer(l.caseId);
  for (const p of mi.plates ?? []) noteer(p.selfWeightCaseId);
  return ids;
}

/**
 * Vindt de samenhangende delen van de constructie (staven + platen als
 * verbindingen) en geeft per deel de knoopverzameling terug.
 */
function samenhangendeDelen(
  knoopIds: number[],
  verbindingen: number[][],
): number[][] {
  const ouder = new Map<number, number>();
  for (const id of knoopIds) ouder.set(id, id);
  const zoek = (a: number): number => {
    let wortel = a;
    while (ouder.get(wortel) !== wortel) wortel = ouder.get(wortel)!;
    let loop = a;
    while (ouder.get(loop) !== wortel) {
      const volgende = ouder.get(loop)!;
      ouder.set(loop, wortel);
      loop = volgende;
    }
    return wortel;
  };
  for (const groep of verbindingen) {
    const aanwezig = groep.filter((id) => ouder.has(id));
    for (let i = 1; i < aanwezig.length; i++) {
      const a = zoek(aanwezig[0]);
      const b = zoek(aanwezig[i]);
      if (a !== b) ouder.set(b, a);
    }
  }
  const perWortel = new Map<number, number[]>();
  for (const id of knoopIds) {
    const wortel = zoek(id);
    const lijst = perWortel.get(wortel);
    if (lijst) lijst.push(id);
    else perWortel.set(wortel, [id]);
  }
  return [...perWortel.values()];
}

/**
 * Volledige droogloop (plan §3.2). Draait eerst de harde veldpoort; faalt die,
 * dan stoppen we daar — constructieve controles op een model met verkeerde
 * types leveren alleen ruis op boven de echte oorzaak.
 */
export function valideerModel(rauw: unknown): ValidatieUitkomst {
  const veldFouten = controleerVelden(rauw);
  if (veldFouten.length > 0) {
    return { ok: false, errors: veldFouten, warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const m = rauw as Record<string, unknown>;

  const nodes = (m.nodes ?? []) as { id: number; x: number; z: number }[];
  const beams = (m.beams ?? []) as {
    id: number; from: number; to: number; material?: string; profile?: string;
  }[];
  const supports = (m.supports ?? []) as { nodeId: number; type: string; k?: number }[];
  const plates = (m.plates ?? []) as {
    id: number; nodeIds: number[]; meshSize?: number; meshCache?: { signature: string };
  }[];
  const loadCases = (m.loadCases ?? []) as { id: number; name: string; type?: string }[];
  const loads = (m.loads ?? []) as Record<string, unknown>[];

  meldDubbeleIds(nodes, "knopen", errors);
  meldDubbeleIds(beams, "staven", errors);
  meldDubbeleIds(plates, "platen", errors);
  meldDubbeleIds(loadCases, "belastinggevallen", errors);
  meldDubbeleIds(loads, "lasten", errors);

  const knoopById = new Map<number, { x: number; z: number }>();
  for (const n of nodes) knoopById.set(n.id, { x: n.x, z: n.z });
  const caseIds = new Set(loadCases.map((lc) => lc.id));
  const beamIds = new Set(beams.map((b) => b.id));
  const plateIds = new Set(plates.map((p) => p.id));

  if (nodes.length === 0) errors.push("Het model bevat geen knopen.");
  if (beams.length === 0 && plates.length === 0) {
    errors.push("Het model bevat geen staven en geen platen — er valt niets te rekenen.");
  }
  if (loadCases.length === 0) {
    errors.push("Het model bevat geen belastinggevallen.");
  }

  // Samenvallende knopen: twee knopen op dezelfde plek zijn niet met elkaar
  // verbonden, maar zien er in het model uit alsof ze dat wel zijn. De staven
  // die eraan hangen vormen dan stilzwijgend twee losse constructies.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (
        Math.abs(nodes[i].x - nodes[j].x) <= 1e-6 &&
        Math.abs(nodes[i].z - nodes[j].z) <= 1e-6
      ) {
        errors.push(
          `Knoop ${nodes[i].id} en knoop ${nodes[j].id} liggen op dezelfde ` +
            `plek (${nodes[i].x}, ${nodes[i].z}) mm. Ze zijn NIET met elkaar ` +
            "verbonden; voeg ze samen of verplaats er één.",
        );
      }
    }
  }

  // Staven: verwijzingen, lengte en doorsnede.
  for (const b of beams) {
    const van = knoopById.get(b.from);
    const naar = knoopById.get(b.to);
    if (!van) errors.push(`Staaf ${b.id} verwijst naar knoop ${b.from}, die niet bestaat.`);
    if (!naar) errors.push(`Staaf ${b.id} verwijst naar knoop ${b.to}, die niet bestaat.`);
    if (b.from === b.to) {
      errors.push(`Staaf ${b.id} begint en eindigt op knoop ${b.from} — lengte nul.`);
    } else if (van && naar) {
      const lengte = Math.hypot(naar.x - van.x, naar.z - van.z);
      if (lengte < 1e-6) {
        errors.push(
          `Staaf ${b.id} heeft lengte nul: knoop ${b.from} en knoop ${b.to} ` +
            "liggen op dezelfde plek.",
        );
      }
    }
    // Onbekende materiaal-/profielcombinatie: `resolveSection` valt dan terug
    // op HEA 160 / S235 en rekent gewoon door, met de doorsnede van een ander
    // profiel. Dat is een fout, geen waarschuwing — het antwoord hoort dan bij
    // een model dat de gebruiker niet heeft ingevoerd.
    if (resolveSection(b.material, b.profile).bron === "default") {
      errors.push(
        `Staaf ${b.id}: onbekende combinatie materiaal "${b.material ?? "(leeg)"}" ` +
          `+ profiel "${b.profile ?? "(leeg)"}". De solver zou terugvallen op ` +
          "HEA 160 / S235 en met een andere doorsnede rekenen dan opgegeven.",
      );
    }
  }

  // Welke knopen doen mee in het rekenmodel? Alleen knopen die aan een staaf
  // of plaat hangen: `getActiveNodeIds` (Assembler.ts) laat de rest weg, en
  // daarmee vallen ook lasten en opleggingen op die knopen stilzwijgend weg.
  const actief = new Set<number>();
  for (const b of beams) {
    actief.add(b.from);
    actief.add(b.to);
  }
  for (const p of plates) for (const id of p.nodeIds ?? []) actief.add(id);

  for (const n of nodes) {
    if (!actief.has(n.id)) {
      warnings.push(
        `Knoop ${n.id} hangt aan geen enkele staaf of plaat en telt niet mee ` +
          "in de berekening.",
      );
    }
  }

  // Opleggingen.
  const heeftPlaten = plates.length > 0;
  const gesteund = new Set<number>();
  const vastgezetteRichtingen = { x: [] as number[], z: [] as number[], ry: 0 };
  for (const s of supports) {
    if (!knoopById.has(s.nodeId)) {
      errors.push(`Oplegging op knoop ${s.nodeId}, die niet bestaat.`);
      continue;
    }
    if (!actief.has(s.nodeId)) {
      const melding =
        `Oplegging op knoop ${s.nodeId}, die aan geen enkele staaf of plaat ` +
        "hangt. Die knoop zit niet in het rekenmodel, dus de oplegging doet niets.";
      if (heeftPlaten) warnings.push(melding);
      else errors.push(melding);
      continue;
    }
    if ((s.type === "zSpring" || s.type === "xSpring" || s.type === "rotSpring")) {
      if (s.k === undefined || s.k <= 0) {
        warnings.push(
          `Oplegging op knoop ${s.nodeId} is een veer zonder positieve ` +
            "stijfheid (`k`) en rekent daarom als een starre oplegging.",
        );
      }
    }
    gesteund.add(s.nodeId);
    const knoop = knoopById.get(s.nodeId)!;
    for (const richting of VASTGEZET[s.type] ?? []) {
      if (richting === "x") vastgezetteRichtingen.x.push(knoop.z);
      else if (richting === "z") vastgezetteRichtingen.z.push(knoop.x);
      else vastgezetteRichtingen.ry++;
    }
  }

  // Mechanismecontrole — noodzakelijke voorwaarden voor een vlak raamwerk:
  // verplaatsing in x en in z moet ergens verhinderd zijn, en rotatie van het
  // geheel ook (door een inklemming/rotatieveer, of door twee steunpunten die
  // dezelfde richting op verschillende plaatsen vasthouden).
  if (supports.length === 0) {
    errors.push(
      "Het model heeft geen opleggingen — voeg randvoorwaarden toe. Zonder " +
        "opleggingen is de constructie een mechanisme.",
    );
  } else {
    if (vastgezetteRichtingen.x.length === 0) {
      errors.push(
        "Geen enkele oplegging houdt de constructie in x-richting tegen — " +
          "het geheel kan horizontaal wegschuiven (mechanisme).",
      );
    }
    if (vastgezetteRichtingen.z.length === 0) {
      errors.push(
        "Geen enkele oplegging houdt de constructie in z-richting tegen — " +
          "het geheel kan verticaal zakken (mechanisme).",
      );
    }
    const tweeVerschillend = (waarden: number[]) =>
      waarden.some((w) => Math.abs(w - waarden[0]) > 1e-6);
    const rotatieVerhinderd =
      vastgezetteRichtingen.ry > 0 ||
      tweeVerschillend(vastgezetteRichtingen.z) ||
      tweeVerschillend(vastgezetteRichtingen.x);
    if (!rotatieVerhinderd) {
      errors.push(
        "Niets verhindert dat de constructie als geheel roteert: er is geen " +
          "inklemming of rotatieveer, en de opleggingen houden hem maar op één " +
          "plaats per richting vast (mechanisme).",
      );
    }
  }

  // Elk samenhangend constructiedeel moet ergens steunen.
  if (actief.size > 0) {
    const verbindingen: number[][] = [
      ...beams.map((b) => [b.from, b.to]),
      ...plates.map((p) => p.nodeIds ?? []),
    ];
    for (const deel of samenhangendeDelen([...actief], verbindingen)) {
      if (!deel.some((id) => gesteund.has(id))) {
        errors.push(
          `Het constructiedeel met knopen ${deel.slice(0, 6).join(", ")}` +
            `${deel.length > 6 ? ", …" : ""} heeft geen enkele oplegging en ` +
            "kan vrij bewegen (mechanisme).",
        );
      }
    }
  }

  // Platen: vorm en meshcache — zelfde regels als de engine hanteert, zodat
  // de droogloop niet iets goedkeurt dat de solve daarna weigert.
  for (const p of plates) {
    const hoeken = (p.nodeIds ?? []).map((id) => knoopById.get(id));
    if (hoeken.some((h) => !h)) {
      errors.push(`Plaat ${p.id}: één of meer hoekknopen bestaan niet.`);
      continue;
    }
    const punten = hoeken.map((h) => ({ x: h!.x, z: h!.z })) as PlaatPunt[];
    if (punten.length === 4 && isAsgelijndeRechthoek(punten, 1)) continue;
    const vormFout = valideerPlaatPolygoon(punten, 1);
    if (vormFout) {
      errors.push(`Plaat ${p.id}: ${vormFout}`);
      continue;
    }
    const meshSize = (p.meshSize ?? 0) > 0 ? p.meshSize! : 500;
    const handtekening = berekenPlaatMeshSignatuur(punten, meshSize);
    const cache = [p.meshCache, leesPlaatMeshCache(p.id)].find(
      (c) => c && c.signature === handtekening,
    );
    if (!cache) {
      errors.push(
        `Plaat ${p.id} is geen asgelijnde rechthoek en rekent daarom als ` +
          "polygoonplaat, maar het CDT-rekenmesh ontbreekt of is verouderd. " +
          "Reken via een projectbestand waarin het mesh is opgeslagen; de " +
          "MCP-server genereert zelf geen meshes.",
      );
    }
  }

  // Lasten: verwijzingen en stille wegval.
  for (const l of loads) {
    const id = l.id;
    if (!caseIds.has(l.caseId as number)) {
      errors.push(
        `Last ${id} verwijst naar belastinggeval ${l.caseId}, dat niet bestaat.`,
      );
    }
    if (l.beamId !== undefined && !beamIds.has(l.beamId as number)) {
      errors.push(`Last ${id} verwijst naar staaf ${l.beamId}, die niet bestaat.`);
    }
    if (l.plateId !== undefined && !plateIds.has(l.plateId as number)) {
      errors.push(`Last ${id} verwijst naar plaat ${l.plateId}, die niet bestaat.`);
    }
    if (l.nodeId !== undefined) {
      if (!knoopById.has(l.nodeId as number)) {
        errors.push(`Last ${id} verwijst naar knoop ${l.nodeId}, die niet bestaat.`);
      } else if (!actief.has(l.nodeId as number)) {
        errors.push(
          `Last ${id} staat op knoop ${l.nodeId}, die aan geen enkele staaf of ` +
            "plaat hangt. Die last valt bij het rekenen weg zonder melding.",
        );
      }
    }
    if (!teltLastMee(l, loadCases)) {
      errors.push(
        `Last ${id} (type "${String(l.type)}") levert geen invoer voor de ` +
          "solver op en telt dus niet mee. Controleer of alle velden voor dit " +
          "lasttype ingevuld zijn (een lijnlast heeft `beamId` en `q` nodig, " +
          "een puntlast `nodeId` of `beamId`, een thermische last `beamId` en " +
          "`deltaT`, een randlast `plateId` en `q`).",
      );
    }
  }

  // Belastinggevallen zonder werkzame last: `solveAllCases` slaat die
  // stilzwijgend over, waarna de client een ontbrekende sleutel krijgt die als
  // "nul" leest. Alleen zinvol te bepalen als het model verder klopt.
  if (errors.length === 0) {
    const metLast = gevallenMetLast(alsModelInvoer(m));
    for (const lc of loadCases) {
      if (!metLast.has(lc.id)) {
        warnings.push(
          `Belastinggeval ${lc.id} ("${lc.name}") heeft geen werkzame last en ` +
            "wordt bij het rekenen overgeslagen; het telt als nulbijdrage in " +
            "de combinaties.",
        );
      }
    }
  }

  for (const lc of loadCases) {
    if (lc.type === undefined) {
      warnings.push(
        `Belastinggeval ${lc.id} ("${lc.name}") heeft geen \`type\`. Zonder ` +
          "type kan het eigengewicht niet aan het permanente geval worden " +
          "toegewezen.",
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
