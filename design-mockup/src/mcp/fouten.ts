/**
 * fouten.ts — Nederlandse afbeelding van rekenkern-foutmeldingen.
 *
 * WAAROM DIT BESTAAT
 * De rekenkern (`src/core`) meldt in het Engels: `Model has no constraints -
 * add boundary conditions`. Die tekst is voor een constructeur die via een
 * Nederlandstalige client rekent onbruikbaar, en erger: hij is niet te
 * onderscheiden van een willekeurige technische storing. De sidecar beeldt
 * daarom bekende kernmeldingen af op Nederlands VÓÓR ze de MCP-grens passeren,
 * met een foutcode waar de Rust-kant op kan beslissen.
 *
 * DE HARDE REGEL: NIETS VERDWIJNT STIL
 * Een onbekende melding wordt NIET gegokt en niet weggepoetst. Ze komt door met
 * code `INTERN` en de ORIGINELE tekst in `detail.originele_melding`. Dat is
 * bewust: een melding die deze tabel niet kent, kan net zo goed een programmafout
 * als een modelfout zijn, en "de solver kon dit model niet oplossen" zou dan een
 * bewering doen over de constructie die niemand heeft onderbouwd. `INTERN` zegt
 * eerlijk: hier is iets misgegaan dat wij niet hebben voorzien.
 *
 * Ook een HERKENDE melding draagt de originele tekst mee in `detail`. De
 * Nederlandse zin is een vertaling, geen vervanging — wie de kern debugt, wil
 * de oorspronkelijke woorden zien.
 *
 * DRIE SOORTEN REGELS staan in de tabel:
 *   1. Engelse kernmeldingen over het MODEL   → MODEL_ONOPLOSBAAR + NL-tekst;
 *   2. Engelse meldingen over de WISKUNDE die
 *      op een programmafout duiden (matrix-
 *      dimensies die niet kloppen)            → INTERN + NL-tekst;
 *   3. Meldingen die de adapterlaag (`engine.ts`)
 *      al in het Nederlands geeft             → MODEL_ONOPLOSBAAR, tekst
 *                                               ONGEWIJZIGD doorgegeven.
 * De derde soort staat er expliciet in: zonder die regels zou een keurige
 * Nederlandse engine-melding ("Plaat 3: de meshcache is beschadigd") als
 * onbekend gelden en als `INTERN` naar buiten komen — een nette diagnose die
 * verandert in een storingsmelding.
 */
import type { Foutcode } from "./protocol";

/** Uitkomst van de afbeelding; `detail` draagt altijd de originele tekst. */
export interface AfgebeeldeFout {
  code: Foutcode;
  /** Nederlandse melding voor de gebruiker. */
  melding: string;
  detail: Record<string, unknown>;
  /** Stond de melding in de tabel? `false` ⇒ code is `INTERN`. */
  herkend: boolean;
}

interface Afbeelding {
  patroon: RegExp;
  code: Foutcode;
  /** `m` is de treffer, zodat knoopnummers en aantallen mee kunnen. */
  nl: (m: RegExpExecArray) => string;
}

/**
 * De tabel. Volgorde is betekenisvol: de eerste treffer wint, dus specifiekere
 * patronen staan boven algemenere.
 *
 * Elke regel verwijst naar de plek waar de kern de melding gooit, zodat een
 * wijziging daar hier terug te vinden is. Verandert een kernmelding zonder dat
 * deze tabel meegaat, dan valt de melding terug op `INTERN` mét de originele
 * tekst — zichtbaar, niet stil.
 */
const AFBEELDINGEN: Afbeelding[] = [
  // ── 1. Model: randvoorwaarden, lasten, minimale opbouw ──────────────────
  {
    // NonlinearSolver.ts:789, :1158, :1441
    patroon: /^Model has no constraints - add boundary conditions$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Model heeft geen opleggingen — voeg randvoorwaarden toe. Zonder " +
      "opleggingen kan de constructie vrij zweven en is er geen oplossing.",
  },
  {
    // NonlinearSolver.ts:796, :1198
    patroon: /^No loads applied - add forces to nodes(?: or elements)?$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Geen werkzame belasting in dit belastinggeval — voeg lasten toe op " +
      "knopen, staven of platen.",
  },
  {
    // NonlinearSolver.ts:774
    patroon: /^Model must have at least 2 nodes$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Model heeft minstens twee knopen nodig.",
  },
  {
    // NonlinearSolver.ts:777
    patroon: /^Model must have at least 1 beam element$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Model heeft minstens één staaf nodig.",
  },
  {
    // NonlinearSolver.ts:1074
    patroon: /^Model must have at least 1 plate element$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Model heeft minstens één plaatelement nodig.",
  },
  {
    // NonlinearSolver.ts:768
    patroon:
      /^Model must have plate elements for this analysis type, or beams for frame analysis$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Dit analysetype vraagt plaatelementen, of staven voor een " +
      "raamwerkberekening — het model bevat geen van beide.",
  },
  {
    // NonlinearSolver.ts:1422
    patroon: /^Mixed analysis requires at least one plate or beam element$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Een gemengde berekening (staven én platen) vraagt minstens één staaf " +
      "of plaat.",
  },

  // ── 2. Mechanisme, singulariteit en opleggingen op het plaatmesh ────────
  {
    // NonlinearSolver.ts:1179, :1455
    patroon:
      /^Insufficient constraints: (\d+) DOFs constrained, need at least 3 to prevent rigid body motion$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) =>
      `Te weinig opleggingen: ${m[1]} vrijheidsgraad/-graden vastgezet, er ` +
      "zijn er minstens drie nodig om starre-lichaamsbeweging te voorkomen. " +
      "De constructie is een mechanisme.",
  },
  {
    // NonlinearSolver.ts:1169
    patroon:
      /^Constraints are not on mesh nodes and couldn't be transferred\. Problem nodes: (.*)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) =>
      "Opleggingen liggen niet op rekenknopen van het plaatmesh en konden " +
      `niet worden overgezet. Probleemknopen: ${m[1]}. Verplaats de ` +
      "steunpunten naar hoek- of randknopen van de plaat, of pas de meshSize aan.",
  },
  {
    // NonlinearSolver.ts:1445
    patroon:
      /^Constraints are not on mesh nodes - place supports on plate corner\/edge nodes or beam nodes$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Opleggingen liggen niet op rekenknopen — zet steunpunten op hoek- of " +
      "randknopen van een plaat, of op knopen van een staaf.",
  },
  {
    // NonlinearSolver.ts:1196
    patroon:
      /^Loads on (\d+) node\(s\) not connected to elements \(inactive\)\. Loads: (.*?)\. Total elements: (\d+)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) =>
      `Lasten op ${m[1]} knoop/knopen die niet met een element verbonden zijn ` +
      `en dus niet meetellen: ${m[2]}. Het model telt ${m[3]} element(en). ` +
      "Verbind die knopen met een staaf of plaat, of verplaats de lasten.",
  },
  {
    // NonlinearSolver.ts:1246
    patroon:
      /^Singular matrix at DOF (\d+): node (\S+) at \(([^)]*)\), direction=([^.]*)\. Check boundary conditions and element connectivity\.$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) =>
      `Het stelsel is singulier bij vrijheidsgraad ${m[1]}: knoop ${m[2]} op ` +
      `(${m[3]}), richting ${m[4]}. Die knoop kan vrij bewegen — controleer ` +
      "de opleggingen en of alle elementen daadwerkelijk aan elkaar vastzitten.",
  },
  {
    // GaussElimination.ts:37
    patroon: /^Matrix is singular or nearly singular at column (\d+)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) =>
      `Het stelsel is (bijna) singulier bij kolom ${m[1]}. Dat wijst op een ` +
      "mechanisme: een ontbrekende oplegging, een los constructiedeel of een " +
      "staaf met stijfheid nul.",
  },

  // ── 3. Ontaarde elementgeometrie ───────────────────────────────────────
  {
    // Beam.ts:134, Assembler.ts:103 en :213
    patroon: /^Beam element has zero length$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Een staaf heeft lengte nul — begin- en eindknoop vallen samen. " +
      "Verwijder de staaf of verplaats een van beide knopen.",
  },
  {
    // Triangle.ts:43 en DKT.ts:237
    patroon: /^(?:DKT triangle|Triangle) has zero or negative area$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Een driehoekselement van het plaatmesh heeft geen oppervlakte. Het mesh " +
      "is ontaard: wijzig de plaatgeometrie of de meshSize zodat het opnieuw " +
      "wordt gegenereerd.",
  },
  {
    // Quad4.ts:132
    patroon:
      /^Quad element has non-positive Jacobian determinant \(bad element shape\)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "Een vierhoekselement van het plaatmesh heeft een ontaarde vorm " +
      "(niet-positieve Jacobiaan). Pas de plaatgeometrie of de meshSize aan.",
  },

  // ── 4. Tweede orde (P-Δ) ───────────────────────────────────────────────
  {
    // NonlinearSolver.ts:992
    patroon:
      /^Second-order \(P-Delta\) analysis did not converge within (\d+) iterations — the load is at, above, or very close to the critical \(buckling\) load$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) =>
      `De tweede-orde-berekening (P-Δ) convergeerde niet binnen ${m[1]} ` +
      "iteraties — de belasting ligt op, boven of vlak onder de kritieke " +
      "(knik)waarde. Verlaag de belasting of verzwaar de constructie.",
  },
  {
    // NonlinearSolver.ts:905 (DIVERGENCE_MSG)
    patroon:
      /^Second-order \(P-Delta\) analysis did not converge — the applied load is at or above the critical \(buckling\) load$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "De tweede-orde-berekening (P-Δ) divergeert — de belasting ligt op of " +
      "boven de kritieke (knik)waarde. Verlaag de belasting of verzwaar de " +
      "constructie.",
  },
  {
    // NonlinearSolver.ts:1024
    patroon:
      /^Second-order \(P-Delta\) analysis is unstable — the applied load is at or above the critical \(buckling\) load$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () =>
      "De tweede-orde-berekening (P-Δ) is instabiel — de belasting ligt op of " +
      "boven de kritieke (knik)waarde. De gevonden oplossing zou fysisch " +
      "betekenisloos zijn; verlaag de belasting of verzwaar de constructie.",
  },

  // ── 5. Wiskundige dimensiefouten: dit zijn PROGRAMMAFOUTEN ─────────────
  // Ze zeggen niets over de constructie van de gebruiker, dus krijgen ze code
  // INTERN. Een gebruiker kan hier niets aan doen; dit hoort als bug gemeld.
  {
    // GaussElimination.ts:7, Matrix.ts:40/53/66/83, Vector.ts:30/41/60
    patroon:
      /^(?:Matrix must be square|Vector length must match matrix size|Matrix dimensions must match for \w+|Cannot multiply \d+x\d+ by \d+x\d+|Matrix columns must match vector length|Vector dimensions must match for [\w ]+)$/,
    code: "INTERN",
    nl: () =>
      "Interne rekenfout: de afmetingen van matrix en vector komen niet " +
      "overeen. Dit is een programmafout in de solver, geen modelfout — meld " +
      "hem met de originele melding uit `detail`.",
  },

  // ── 6. Meldingen die de adapterlaag al in het Nederlands geeft ──────────
  // Tekst ONGEWIJZIGD doorgeven: hij is al gericht aan de constructeur en
  // bevat de remedie. Zonder deze regels zou hij als onbekend gelden.
  {
    // engine.ts:245/249/274/285/299
    patroon: /^Plaat \d+[:\s]/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input,
  },
  {
    // engine.ts:582
    patroon: /^Model te groot voor de ingebouwde solver:/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input,
  },
  {
    // engine.ts:593
    patroon: /^Steunpunt op knoop \d+ ligt niet op een rekenknoop/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input,
  },
  {
    // engine.ts:604
    patroon: /^Puntlast op knoop \d+ ligt niet op een rekenknoop/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input,
  },
  {
    // engine.ts:1268 en :1289
    patroon: /^2e-orde-berekening/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input,
  },
];

/**
 * Beeldt één kernmelding af op een Nederlandse melding plus foutcode.
 *
 * Onbekend ⇒ `{ code: "INTERN", herkend: false }` met de originele tekst in
 * `detail.originele_melding`. Zie de kopregels van dit bestand voor waarom dat
 * bewust NIET `MODEL_ONOPLOSBAAR` is.
 */
export function beeldKernfoutAf(origineel: string): AfgebeeldeFout {
  const tekst = origineel.trim();
  for (const regel of AFBEELDINGEN) {
    // `exec` op een patroon zonder /g-vlag houdt geen lastIndex bij, dus deze
    // lus is herbruikbaar en heeft geen resetbeurt nodig.
    const treffer = regel.patroon.exec(tekst);
    if (treffer) {
      return {
        code: regel.code,
        melding: regel.nl(treffer),
        detail: { originele_melding: origineel },
        herkend: true,
      };
    }
  }
  return {
    code: "INTERN",
    melding:
      "De rekenkern gaf een melding die de sidecar niet kent. De originele " +
      "tekst staat in `detail.originele_melding`; behandel dit resultaat niet " +
      "als een uitspraak over de constructie.",
    detail: { originele_melding: origineel },
    herkend: false,
  };
}

/** Aantal regels in de afbeeldingstabel — voor tests en diagnose. */
export function aantalAfbeeldingen(): number {
  return AFBEELDINGEN.length;
}
