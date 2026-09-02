/**
 * protocol.ts — het INTERNE kanaal tussen de Rust-MCP-server en de
 * Node-sidecar.
 *
 * WAAROM DIT BEWUST GEEN JSON-RPC IS
 * De MCP-server spreekt naar buiten JSON-RPC 2.0 over stdio. Zou het interne
 * kanaal dat ook doen, dan is een verdwaald bericht niet meer te onderscheiden
 * van een echt MCP-bericht en kan een fout uit de sidecar er als antwoord van
 * de server uitzien. Daarom een eigen, minimaal NDJSON-formaat: één client,
 * geen notificaties, geen batching, één antwoordregel per verzoekregel.
 *
 * VORM — één JSON-object per regel, altijd afgesloten met "\n":
 *
 *   verzoek : { "v": 1, "id": 7, "op": "solve", "payload": { … } }
 *   goed    : { "v": 1, "id": 7, "ok": true,  "result": { … } }
 *   fout    : { "v": 1, "id": 7, "ok": false, "error": { "code": …,
 *                                                        "melding": "<NL>",
 *                                                        "detail": { … } } }
 *
 * De sidecar antwoordt op ELK verzoek precies één regel, in dezelfde volgorde
 * als de verzoeken binnenkwamen, en eindigt met exitcode 0 zodra stdin sluit —
 * ook wanneer elk verzoek een fout opleverde. Een niet-nul exitcode of lege
 * stdout betekent daarmee per definitie een crash, niet een afgehandelde fout.
 * Dat onderscheid is de reden dat "Node ontbreekt" bij de client nooit op een
 * rekenfout kan lijken.
 *
 * TAAL — veldnamen Engels (gelijk aan de bestaande tools en aan
 * `BeamCheckInput`), meldingen en commentaar Nederlands.
 *
 * MODELVORM — het `model` in een payload is de STORE-EIGEN vorm: exact de
 * velden die `bouwMultiInput` leest en die ook in een `.ifcfem2d`-projectbestand
 * staan (nodes, beams, supports, plates, loads, loadCases + de vlaggen).
 * Bewust geen eigen, vereenvoudigd modelvocabulaire: dat zou een tweede,
 * handgeschreven vertaling van model naar solver-invoer betekenen, en juist
 * die tweede vertaling is wat dit ontwerp elimineert. Wie een andere vorm aan
 * de buitenkant wil, vertaalt aan de Rust-kant — niet hier.
 */

/** Versie van dit interne protocol. Ophogen bij elke brekende wijziging. */
export const SIDECAR_PROTOCOL = 1;

/** Alle bewerkingen die de sidecar kent. */
export const SIDECAR_OPS = [
  "handshake",
  "validate",
  "solve",
  "check",
  "load_project",
] as const;

export type SidecarOp = (typeof SIDECAR_OPS)[number];

/**
 * Foutcodes. Vast en klein: de Rust-kant beslist hierop welke MCP-foutcode en
 * welke remedie de gebruiker ziet, dus een nieuwe code is een protocolwijziging.
 *
 *  - PROTOCOL_MISMATCH  de regel spreekt een andere protocolversie
 *  - INVOER_ONGELDIG    de regel of de payload deugt niet (vorm, veld, type)
 *  - BESTAND_ONLEESBAAR de meegestuurde projectinhoud is niet te lezen
 *  - MODEL_ONOPLOSBAAR  de solver weigerde het model (mechanisme, singulier, …)
 *  - TIJD_OVERSCHREDEN  gereserveerd voor de Rust-kant, die de klok bewaakt
 *  - INTERN             onverwachte fout; originele tekst gaat mee in `detail`
 */
export const FOUTCODES = [
  "PROTOCOL_MISMATCH",
  "INVOER_ONGELDIG",
  "BESTAND_ONLEESBAAR",
  "MODEL_ONOPLOSBAAR",
  "TIJD_OVERSCHREDEN",
  "INTERN",
] as const;

export type Foutcode = (typeof FOUTCODES)[number];

export interface SidecarVerzoek {
  v: number;
  id: number;
  op: SidecarOp;
  payload: Record<string, unknown>;
}

export interface SidecarFout {
  code: Foutcode;
  melding: string;
  detail?: Record<string, unknown>;
}

export type SidecarAntwoord =
  | { v: number; id: number; ok: true; result: unknown }
  | { v: number; id: number; ok: false; error: SidecarFout };

/** Geslaagd antwoord op verzoek `id`. */
export function maakOk(id: number, result: unknown): SidecarAntwoord {
  return { v: SIDECAR_PROTOCOL, id, ok: true, result };
}

/** Foutantwoord op verzoek `id`. `melding` is ALTIJD Nederlands. */
export function maakFout(
  id: number,
  code: Foutcode,
  melding: string,
  detail?: Record<string, unknown>,
): SidecarAntwoord {
  return detail === undefined
    ? { v: SIDECAR_PROTOCOL, id, ok: false, error: { code, melding } }
    : { v: SIDECAR_PROTOCOL, id, ok: false, error: { code, melding, detail } };
}

export type OntleedUitkomst =
  | { ok: true; verzoek: SidecarVerzoek }
  | { ok: false; antwoord: SidecarAntwoord };

/**
 * Eén stdin-regel → verzoek, of een kant-en-klaar foutantwoord.
 *
 * Onbekende `id` (de regel is niet eens te parsen) wordt `0`: de aanroeper
 * krijgt dan wél een antwoordregel, zodat een client nooit op een antwoord
 * blijft wachten dat niet komt.
 */
export function ontleedVerzoek(regel: string): OntleedUitkomst {
  let rauw: unknown;
  try {
    rauw = JSON.parse(regel);
  } catch (err) {
    return {
      ok: false,
      antwoord: maakFout(
        0,
        "INVOER_ONGELDIG",
        "De regel is geen geldige JSON.",
        { originele_melding: String(err), regel_lengte: regel.length },
      ),
    };
  }

  if (typeof rauw !== "object" || rauw === null || Array.isArray(rauw)) {
    return {
      ok: false,
      antwoord: maakFout(
        0,
        "INVOER_ONGELDIG",
        "Een verzoekregel moet een JSON-object zijn.",
      ),
    };
  }

  const obj = rauw as Record<string, unknown>;

  // `id` eerst: ook een protocolfout hoort met het juiste id terug te komen.
  const id =
    typeof obj.id === "number" && Number.isFinite(obj.id) ? obj.id : 0;
  if (typeof obj.id !== "number" || !Number.isFinite(obj.id)) {
    return {
      ok: false,
      antwoord: maakFout(
        0,
        "INVOER_ONGELDIG",
        "Veld `id` ontbreekt of is geen eindig getal.",
      ),
    };
  }

  if (obj.v !== SIDECAR_PROTOCOL) {
    return {
      ok: false,
      antwoord: maakFout(
        id,
        "PROTOCOL_MISMATCH",
        `Deze sidecar spreekt protocolversie ${SIDECAR_PROTOCOL}; ` +
          `de aanroeper stuurde ${JSON.stringify(obj.v)}. ` +
          "Server en solverbundel horen bij elkaar — herbouw de MCP-server.",
        { verwacht: SIDECAR_PROTOCOL, ontvangen: obj.v ?? null },
      ),
    };
  }

  const op = obj.op;
  if (
    typeof op !== "string" ||
    !(SIDECAR_OPS as readonly string[]).includes(op)
  ) {
    return {
      ok: false,
      antwoord: maakFout(
        id,
        "INVOER_ONGELDIG",
        `Onbekende bewerking ${JSON.stringify(op)}. Bekend zijn: ` +
          `${SIDECAR_OPS.join(", ")}.`,
      ),
    };
  }

  const payload = obj.payload ?? {};
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return {
      ok: false,
      antwoord: maakFout(
        id,
        "INVOER_ONGELDIG",
        "Veld `payload` moet een JSON-object zijn (of ontbreken).",
      ),
    };
  }

  return {
    ok: true,
    verzoek: {
      v: SIDECAR_PROTOCOL,
      id,
      op: op as SidecarOp,
      payload: payload as Record<string, unknown>,
    },
  };
}

/**
 * Antwoord → één stdout-regel.
 *
 * `JSON.stringify` escapet regeleindes in strings, dus een antwoord kan het
 * regelformaat niet van binnenuit breken. Kan de serialisatie zelf niet (een
 * cyclus, een BigInt), dan komt er een INTERN-fout terug in plaats van een
 * kapotte regel: een halve regel zou de lezer aan de andere kant laten hangen.
 */
export function serialiseerAntwoord(antwoord: SidecarAntwoord): string {
  try {
    return `${JSON.stringify(antwoord)}\n`;
  } catch (err) {
    const id = antwoord.id;
    return `${JSON.stringify(
      maakFout(
        id,
        "INTERN",
        "Het antwoord kon niet als JSON worden weggeschreven.",
        { originele_melding: String(err) },
      ),
    )}\n`;
  }
}

/** `Map<number, T>` → `{ "<sleutel>": … }`, want een Map serialiseert als `{}`. */
export function mapNaarObject<T, U>(
  bron: Map<number, T>,
  vorm: (waarde: T, sleutel: number) => U,
): Record<string, U> {
  const uit: Record<string, U> = {};
  for (const [sleutel, waarde] of bron) uit[String(sleutel)] = vorm(waarde, sleutel);
  return uit;
}

/**
 * Telt NaN- en Infinity-waarden in een resultaatstructuur.
 *
 * `JSON.stringify` maakt van beide stilzwijgend `null`, en `null` leest bij een
 * kracht of zakking als "nul". Dat is precies de klasse fout die als veilig
 * resultaat kan worden gelezen terwijl de berekening is ontspoord, dus wordt
 * hij geteld en als Nederlandse waarschuwing meegestuurd in plaats van
 * weggepoetst.
 */
export function telNietEindig(waarde: unknown): number {
  if (typeof waarde === "number") return Number.isFinite(waarde) ? 0 : 1;
  if (Array.isArray(waarde)) {
    let n = 0;
    for (const item of waarde) n += telNietEindig(item);
    return n;
  }
  if (typeof waarde === "object" && waarde !== null) {
    let n = 0;
    for (const item of Object.values(waarde as Record<string, unknown>)) {
      n += telNietEindig(item);
    }
    return n;
  }
  return 0;
}
