/**
 * timberCheckBuilder.ts — bouwt TimberBeamCheckInput[] voor het Tauri-command
 * `check_timber_beams` — spiegel van steelCheckBuilder, aangesloten op het
 * design-mockup datamodel.
 *
 * Herkenning in dit datamodel:
 *  - Een staaf is hout wanneer `beam.material` een EN 338/EN 14080-
 *    sterkteklasse is ("C24", "GL28h", …). De lijst komt runtime uit het
 *    Tauri-command `list_timber_grades`; de statische lijst hieronder is de
 *    browser-fallback en moet daarmee overeenkomen.
 *  - De doorsnede is óf een rechthoek b × h, herkenbaar aan de profielnaam
 *    ("60x100", "38x89 SLS", "96x450 GL"), óf een eigen doorsnede uit de
 *    profieleditor ("EIGEN:…"). Geen van beide betekent eerlijk overslaan.
 *
 *    Die tweede weg is er sinds september 2026. Zonder hem viel een houten
 *    staaf met een eigen doorsnede door `isSteelProfile` — dat geeft `true`
 *    voor elke `EIGEN:`-naam — en werd hij overgeslagen met de misleidende
 *    reden "profiel is een staalprofiel". Erger nog was wat de SOLVER deed:
 *    die viel voor diezelfde staaf terug op HEA 160 / S235 (zie de toelichting
 *    in `sectionResolver.ts`). De eigen doorsnede gaat nu als `custom_section`
 *    naar de kern, die A, I, W én de maatgevende schuifvezel uit de lamellen
 *    berekent. Dat laatste is geen luxe: art. 6.1.7 toetst de dwarskracht met
 *    de breedte op de beschouwde vezel, en bij een samengestelde ligger is dat
 *    de lijfdikte en niet de omhullende breedte.
 *
 * Per-staaf toetsconfiguratie komt uit `beam.checkConfig` (EN 1995-sectie
 * van het staaf-eigenschappenvenster): klimaatklasse, belastingduur en
 * doorbuigingsklasse. Gedocumenteerde defaults voor ontbrekende velden:
 *  - klimaatklasse 1, belastingduur "middellang" (maatgevend voor de
 *    gebruikelijke UGT-combinatie met veranderlijke vloerbelasting);
 *  - kniklengte om beide assen: cfg.bucklingLengthY_m / _Z_m; leeg → 0 en
 *    de kern kiest (staaflengte, of om z uit steunen aan beide randen) en
 *    meldt de herkomst (zie de toelichting bij het `inputs.push`);
 *    kipsteunafstand = staaflengte;
 *    belastinggeval "gelijkmatig verdeeld" aangrijpend in het
 *    zwaartepunt; k_cr = 1,0; geen lastverdelend systeem;
 *  - doorbuiging: klasse "vloer" → w_fin ≤ L/250 en w_add ≤ L/333
 *    (NB-standaard); w_qp komt uit de quasi-blijvende BGT-combinatie
 *    (G + Σ ψ₂,i · Q_k,i), en valt alleen mét een notitie in het rapport terug
 *    op de volle last; blijvend deel 0 → w_add = w_fin. Zeeg kent de houtkern
 *    (nog) niet — preCamber_mm wordt hier bewust NIET geconsumeerd en de UI
 *    toont het veld niet voor hout.
 */
import type { Beam, BeamCheckConfig, Node, Support } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import { combinatiesVanSoort } from "../components/fem/solver/combinations";
import type { TimberBeamCheckInput } from "./types/timber/TimberBeamCheckInput";
import type { LoadDurationClass } from "./types/timber/LoadDurationClass";
import type { ServiceClass } from "./types/timber/ServiceClass";
import type { CheckSkip } from "./checkTypes";
import {
  isSteelProfile,
  sanitizeRestraintFractions,
  beamLengthMm,
  buildForcesEnvelope,
  deflectionNotesFor,
  extractFieldDeflectionMm,
} from "./steelCheckBuilder";
import { voegDoorgaandeLijnenSamen } from "./doorgaandeLijn";
import {
  eigenNaamVan,
  isEigenProfiel,
  naarCustomSection,
  zoekEigenDoorsnede,
} from "./profieleditor/eigenDoorsnedenStore";
import { toetsdataInReferentierichting } from "./referentierichting";
import type { CustomSection } from "./types/steel/CustomSection";

// ── Per-staaf toetsconfiguratie (Beam.checkConfig) ─────────────────────────
/** UI-klimaatklasse (1/2/3) → ts-rs/Rust-enum. Ontbreekt → Sc1. */
export function mapServiceClass(sc: BeamCheckConfig["serviceClass"]): ServiceClass {
  switch (sc) {
    case 2:  return "Sc2";
    case 3:  return "Sc3";
    case 1:
    default: return "Sc1";
  }
}

/** UI-belastingduurklasse → ts-rs/Rust-enum. Ontbreekt → MediumTerm. */
export function mapLoadDuration(d: BeamCheckConfig["loadDuration"]): LoadDurationClass {
  switch (d) {
    case "permanent":     return "Permanent";
    case "long":          return "LongTerm";
    case "short":         return "ShortTerm";
    case "instantaneous": return "Instantaneous";
    case "medium":
    default:              return "MediumTerm";
  }
}

/**
 * Doorbuigingsklasse → L/n-noemers (w_fin, w_add) voor de houtkern.
 *
 * De w_fin-noemers volgen NEN-EN 1990:2002/NB:2019 A1.4.3(4) — w_max ≤ 1/250
 * deel van ℓ_rep bij zowel vloeren als daken. De w_add-noemers volgen
 * A1.4.3(3), dat vier categorieën voor w2 + w3 kent:
 *  - "floor":        fin 250, add 333 — het tweede gedachtestreepje, "overige
 *    vloeren en daken die intensief door personen worden gebruikt", 3/1 000
 *    deel van ℓ_rep. De 333 is de afronding naar beneden van 333⅓ en dus een
 *    fractie strenger dan de norm; de staalkern rekent sinds september 2026
 *    met 1000/3 exact. Bewust niet gelijkgetrokken: 333 is veilig-zijdig en
 *    het wijzigen zou de bevroren houtreferenties verschuiven;
 *  - "floorBrittle": fin 250, add 500 — het eerste gedachtestreepje, "vloeren
 *    die scheurgevoelige scheidingswanden dragen", 1/500 deel van ℓ_rep;
 *  - "roof":         fin 250, add 250 — het derde gedachtestreepje, "overige
 *    daken", 1/250 deel van ℓ_rep;
 *  - "cantilever":   fin 125, add 167 — de NB-conventie "ℓ_rep = tweemaal de
 *    lengte van een uitkraging" uitgedrukt als gehalveerde noemers op de
 *    staaflengte;
 *  - "custom":       de opgegeven n geldt voor w_fin én w_add (één knop,
 *    transparant gedocumenteerd in de UI-hint).
 */
export function timberDeflectionNumerators(
  cls: BeamCheckConfig["deflectionClass"],
  customN: number | undefined,
): { fin: number; add: number } {
  switch (cls) {
    case "roof":         return { fin: 250, add: 250 };
    case "floorBrittle": return { fin: 250, add: 500 };
    case "cantilever":   return { fin: 125, add: 167 };
    case "custom": {
      const n = customN && customN > 0 ? customN : 333;
      return { fin: n, add: n };
    }
    case "floor":
    default:             return { fin: 250, add: 333 };
  }
}

/**
 * Sterkteklassen die de Rust EN 1995-kern kent (nen-en-1995-1-1/data.rs):
 * EN 338 naaldhout C14–C35 en EN 14080 gelamineerd hout GL24h–GL36h.
 * Browser-fallback voor `list_timber_grades`.
 */
export const SUPPORTED_TIMBER_GRADES = [
  "C14", "C16", "C18", "C20", "C22", "C24", "C27", "C30", "C35",
  "GL24h", "GL28h", "GL32h", "GL36h",
] as const;

/** Wel herkenbaar als hout, maar (nog) zonder normdata: EN 338 loofhout. */
const UNSUPPORTED_TIMBER_GRADES = ["D30", "D35", "D40", "D50", "D60", "D70"];

/** Generieke houtnamen zonder sterkteklasse — niet toetsbaar. */
const GENERIC_TIMBER_NAMES = ["timber (softwood)", "timber (hardwood)", "wood", "hout"];

/** Match een materiaalnaam op een ondersteunde sterkteklasse. */
export function matchSupportedTimberGrade(
  materialName: string | undefined,
  supportedGrades: readonly string[] = SUPPORTED_TIMBER_GRADES,
): string | null {
  if (!materialName) return null;
  const trimmed = materialName.trim();
  const hit = supportedGrades.find((g) => g.toLowerCase() === trimmed.toLowerCase());
  return hit ?? null;
}

/**
 * Herken een rechthoekige houtdoorsnede b × h (mm) uit de profielnaam:
 * "38x89 SLS", "60x100 GL", of kaal "96x450" (conventie: b×h).
 */
export function parseTimberRectMm(
  profileName: string | undefined,
): { bMm: number; hMm: number } | null {
  const name = profileName?.trim();
  if (!name) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s+(?:SLS|EU|CLS|GL))?$/i.exec(name);
  if (!m) return null;
  const bMm = parseFloat(m[1].replace(",", "."));
  const hMm = parseFloat(m[2].replace(",", "."));
  if (bMm > 0 && hMm > 0) return { bMm, hMm };
  return null;
}

// ── Quasi-blijvende zakking (w_qp) ─────────────────────────────────────────
//
// w_fin = w_inst + k_def · w_qp (EN 1995-1-1 §7.2). w_qp is de zakking onder de
// QUASI-BLIJVENDE belastingscombinatie: G + Σ ψ₂,i · Q_k,i (NEN-EN 1990,
// uitdrukking 6.16b). Die ψ₂-factoren zitten in dit project al in de
// combinatiedefinities — de standaardset (components/fem/solver/
// normcombinaties.ts) levert "BGT quasi-blijvend 6.16b" met ψ₂ uit NB tabel
// NB.2–A1.1 — dus w_qp hoeft niet geschat te worden; hij is gewoon het
// veldmaximum van diezelfde combinatie.
//
// Tot september 2026 stond hier `deflection_quasi_perm_mm: wInstMm`: de VOLLE
// karakteristieke last als quasi-blijvend. Dat is veilig-zijdig maar niet
// eerlijk — het rekent de kruip over lasten die er in de eindtoestand niet
// blijvend zijn. Voor de standaardcombinaties (G + Q, ψ₂ = 0,3) valt w_qp
// daarmee 1/0,65 ≈ 1,5 keer te hoog uit.
//
// Terugvallen op de volle last mag nog steeds — als de quasi-blijvende
// combinatie ontbreekt of niet is doorgerekend is er niets beters — maar dan
// mét een notitie in het rapport. Nooit stilzwijgend.

/** Uitkomst van de w_qp-bepaling: het getal én waar het vandaan komt. */
export interface QuasiPermanentDeflection {
  /** w_qp in mm, teken behouden (negatief = omlaag). */
  mm: number;
  /** Regels voor `deflection_notes` van de houtkern. */
  notes: string[];
}

/**
 * Zakking onder de quasi-blijvende BGT-combinatie, of een gedocumenteerde
 * terugval op de volle karakteristieke last.
 *
 * `combo` is de quasi-blijvende combinatie (of `null` als het model er geen
 * heeft), `result` haar solverresultaat.
 */
export function quasiPermanentDeflection(
  beam: Beam,
  combo: LoadCombination | null,
  result: SolverResult | null,
  wInstMm: number,
): QuasiPermanentDeflection {
  const terugval = (reden: string): QuasiPermanentDeflection => ({
    mm: wInstMm,
    notes: [
      `w_qp is gelijkgesteld aan de volledige zakking onder de karakteristieke ` +
        `BGT-combinatie omdat ${reden}. De kruip (k_def) wordt daarmee over de ` +
        `volle veranderlijke belasting gerekend in plaats van over het ` +
        `quasi-blijvende deel (Σ ψ₂,i · Q_k,i, NEN-EN 1990 uitdrukking 6.16b): ` +
        `veilig-zijdig, maar w_fin — en daarmee ook het daaruit afgeleide w_add — ` +
        `valt hoger uit dan de norm vraagt.`,
    ],
  });

  if (!combo) {
    return terugval(
      "het model geen quasi-blijvende BGT-combinatie kent (verwacht: een " +
        'BGT-combinatie met "quasi" in de naam)',
    );
  }
  if (!result || !result.elements.has(beam.id)) {
    return terugval(
      `combinatie "${combo.name}" geen krachtsverloop voor deze staaf oplevert — ` +
        "reken het model opnieuw door",
    );
  }
  return {
    mm: extractFieldDeflectionMm(beam, result),
    notes: [
      `w_qp is de zakking onder de quasi-blijvende BGT-combinatie "${combo.name}" ` +
        `(${combo.formula}); de ψ₂-factoren zitten in de combinatiefactoren. ` +
        "Kruip volgens EN 1995-1-1 §7.2: w_fin = w_inst + k_def · w_qp.",
    ],
  };
}

/**
 * De combinatie met de grootste |zakking| voor deze staaf, plus alle gemeten
 * zakkingen (voor de notitie). `null` als geen enkele combinatie een
 * krachtsverloop voor de staaf heeft.
 */
function grootsteZakking(
  beam: Beam,
  combos: readonly LoadCombination[],
  results: Map<number, SolverResult>,
): { combo: LoadCombination; w: number; alle: { combo: LoadCombination; w: number }[] } | null {
  const alle: { combo: LoadCombination; w: number }[] = [];
  for (const combo of combos) {
    const r = results.get(combo.id);
    if (!r || !r.elements.has(beam.id)) continue;
    alle.push({ combo, w: extractFieldDeflectionMm(beam, r) });
  }
  if (alle.length === 0) return null;
  let max = alle[0];
  for (const a of alle) if (Math.abs(a.w) > Math.abs(max.w)) max = a;
  return { ...max, alle };
}

export interface TimberBuildData {
  nodes: Node[];
  beams: Beam[];
  /** Opleggingen; zie `SteelBuildData.supports`. */
  supports?: Support[];
  /** Alle staven van het model; zie `SteelBuildData.alleBeams`. */
  alleBeams?: Beam[];
  /** Platen; zie `SteelBuildData.plates`. */
  plates?: { nodeIds: number[] }[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
  /** Runtime-lijst uit `list_timber_grades`; leeg → statische fallback. */
  supportedGrades?: string[];
}

export interface TimberBuildResult {
  inputs: TimberBeamCheckInput[];
  /** Houtstaven die herkend maar niet toetsbaar zijn, met reden. */
  skipped: CheckSkip[];
}

export function buildTimberCheckInputs(ruweData: TimberBuildData): TimberBuildResult {
  // Eerst de doorgaande lijnen (een door tussenknopen geknipte staaf als één
  // staaf), dan elke staaf in zijn referentierichting — zie
  // `lib/doorgaandeLijn.ts` en `lib/referentierichting.ts`.
  const lijn = voegDoorgaandeLijnenSamen(ruweData);
  const data = toetsdataInReferentierichting(lijn.data);
  const inputs: TimberBeamCheckInput[] = [];
  const skipped: CheckSkip[] = [...lijn.overgeslagen];

  const grades =
    data.supportedGrades && data.supportedGrades.length > 0
      ? data.supportedGrades
      : SUPPORTED_TIMBER_GRADES;

  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  // w_inst: de GROOTSTE zakking over alle karakteristieke combinaties (6.14b),
  // per staaf bepaald — er is er een per leidende veranderlijke last, en welke
  // maatgevend is hangt van de staaf af. Tot september 2026 was dit de eerste
  // combinatie met "karakter" in de naam, en daarmee afhankelijk van de
  // volgorde van de lijst. Geen karakteristieke combinatie → de grootste over
  // alle BGT-combinaties, met een notitie (zie `grootsteZakking`).
  const slsKarakteristiek = combinatiesVanSoort(slsCombos, "6.14b");
  // Quasi-blijvende BGT-combinatie(s) voor w_qp. Herkend via het kenmerk of de
  // naam — de ψ₂-factoren zelf zijn uit `combo.factors` niet terug te lezen als
  // "dit is de quasi-blijvende". GEEN terugval op een andere BGT-combinatie:
  // dat zou de karakteristieke combinatie stilzwijgend als quasi-blijvend
  // doorgeven, precies de aanname die hier wordt weggehaald.
  const slsQuasiLijst = combinatiesVanSoort(slsCombos, "6.16b");

  for (const beam of data.beams) {
    const materialName = beam.material?.trim() ?? "";
    const grade = matchSupportedTimberGrade(materialName, grades);

    if (!grade) {
      // Wel hout, maar niet toetsbaar → expliciet melden. Al het overige
      // (staal, generiek) is geen zaak van deze builder.
      const lower = materialName.toLowerCase();
      if (UNSUPPORTED_TIMBER_GRADES.some((g) => g.toLowerCase() === lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" (loofhout) wordt nog niet ondersteund door de EN 1995-kern`,
        });
      } else if (GENERIC_TIMBER_NAMES.includes(lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" heeft geen sterkteklasse — kies bijv. C24 of GL28h`,
        });
      }
      continue;
    }

    // Eigen doorsnede uit de profieleditor. Deze tak moet VÓÓR de
    // staalprofielcontrole staan: `isSteelProfile` geeft `true` voor elke
    // `EIGEN:`-naam — dat klopt voor de staalbouwer, waar een eigen doorsnede
    // altijd staal is, maar het maakte elke houten staaf met een eigen
    // doorsnede onbereikbaar voor deze bouwer.
    let custom: CustomSection | undefined;
    let bMm: number;
    let hMm: number;
    if (isEigenProfiel(beam.profile)) {
      const eigen = zoekEigenDoorsnede(beam.profile);
      if (!eigen) {
        skipped.push({
          beamId: beam.id,
          reason: `eigen doorsnede "${eigenNaamVan(beam.profile)}" is niet (meer) bewaard — open de profieleditor en bewaar hem opnieuw`,
        });
        continue;
      }
      const cs = naarCustomSection(eigen);
      if (cs.lamellen.length === 0) {
        // Geen lamellen betekent geen contour, en zonder contour is er geen
        // breedte op een vezel te meten. De houtkern weigert zo'n doorsnede
        // (zie `doorsnede_uit` in timber-check); dat hier al melden geeft de
        // gebruiker de reden bij zijn staaf in plaats van in een toetsfout.
        skipped.push({
          beamId: beam.id,
          reason: `eigen doorsnede "${eigen.naam}" is niet uit platen opgebouwd — de houttoetsing heeft de vorm zelf nodig voor de dwarskracht (art. 6.1.7 vraagt de breedte op de beschouwde vezel); teken hem als samenstelling van lamellen`,
        });
        continue;
      }
      custom = cs;
      // De omhullende maten uit de doorsnedemotor. Ze sturen de toetsing niet
      // meer — de kern rekent met de lamellen — maar ze staan wél in de invoer
      // en horen dus bij deze doorsnede te passen.
      bMm = eigen.motor.y_max_mm - eigen.motor.y_min_mm;
      hMm = eigen.motor.z_max_mm - eigen.motor.z_min_mm;
    } else {
      // Staalprofiel + houtmateriaal is een inconsistent model — niet toetsen
      // met verzonnen eigenschappen (de staalbouwer slaat hem ook over omdat
      // het materiaal geen staalsoort is).
      if (isSteelProfile(beam.profile)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" is hout maar profiel "${beam.profile}" is een staalprofiel — kies een houtdoorsnede (bijv. "60x100") of een staalsoort`,
        });
        continue;
      }

      const rect = parseTimberRectMm(beam.profile);
      if (!rect) {
        skipped.push({
          beamId: beam.id,
          reason: `doorsnede "${beam.profile ?? "—"}" is geen herkenbare rechthoek b×h — gebruik bijv. "60x100" of "96x450 GL" als profielnaam, of teken hem in de profieleditor`,
        });
        continue;
      }
      bMm = rect.bMm;
      hMm = rect.hMm;
    }

    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 — knopen ontbreken" });
      continue;
    }

    const hasAnyResult = ulsCombos.some((c) =>
      data.combinationResults.get(c.id)?.elements.has(beam.id),
    );
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties — reken het model eerst door",
      });
      continue;
    }

    const forcesEnvelope = buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults);

    // Zakking onder de karakteristieke BGT-combinatie: veldmaximum
    // max |w(x)| over de 21 stations, teken behouden (mm, negatief =
    // omlaag conform de tekenconventie van de kern — de lokale
    // stationsconventie van de solver valt daar voor horizontale staven
    // mee samen; zie extractFieldDeflectionMm).
    const inst = grootsteZakking(
      beam,
      slsKarakteristiek.length > 0 ? slsKarakteristiek : slsCombos,
      data.combinationResults,
    );
    const wInstMm = inst ? inst.w : 0;
    const instNotes: string[] = inst
      ? [
          (slsKarakteristiek.length > 0
            ? "w_inst is de grootste zakking over de karakteristieke BGT-combinaties (6.14b): "
            : "LET OP: het model kent GEEN karakteristieke BGT-combinatie (6.14b); w_inst is " +
              "daarom de grootste zakking over alle BGT-combinaties: ") +
            inst.alle.map((a) => `"${a.combo.name}" ${a.w.toFixed(2).replace(".", ",")} mm`).join("; ") +
            `. Maatgevend is "${inst.combo.name}".`,
        ]
      : [
          "GEEN UITKOMST voor w_inst: geen enkele BGT-combinatie levert een zakking voor " +
            "deze staaf — reken het model opnieuw door. De 0 is een ontbrekende uitkomst.",
        ];
    const quasi = grootsteZakking(beam, slsQuasiLijst, data.combinationResults);
    const wQuasi = quasiPermanentDeflection(
      beam,
      quasi?.combo ?? slsQuasiLijst[0] ?? null,
      quasi ? data.combinationResults.get(quasi.combo.id) ?? null : null,
      wInstMm,
    );

    // Per-staaf toetsconfiguratie; ontbrekende velden → defaults hierboven.
    // preCamber_mm wordt voor hout bewust niet geconsumeerd: de houtkern
    // kent geen zeeg, en de EN 1995-sectie van de dialoog biedt het veld
    // daarom niet aan.
    const cfg = beam.checkConfig ?? {};
    const defl = timberDeflectionNumerators(cfg.deflectionClass, cfg.deflectionLimitNumerator);
    const staafNotities = lijn.notities.get(beam.id);

    inputs.push({
      beam_id: beam.id,
      width_mm: bMm,
      height_mm: hMm,
      // Aanwezig = samengestelde doorsnede uit de profieleditor; de kern
      // rekent dan met de lamellen in plaats van met b × h. Afwezig = de
      // rechthoek hierboven, precies zoals voorheen.
      ...(custom ? { custom_section: custom } : {}),
      strength_class: grade,
      service_class: mapServiceClass(cfg.serviceClass),
      load_duration: mapLoadDuration(cfg.loadDuration),
      length_m: lengthMm / 1000,
      forces_envelope: forcesEnvelope,
      // Kniklengtes per as; leeg → systeemlengte, net als bij staal.
      //
      // De houtkern gebruikt ze allebei echt: in
      // nen-en-1995-1-1/src/stability.rs volgt lambda = L_cr / i, en daaruit
      // via art. 6.3.2 verg. (6.21)/(6.22) de relatieve slankheid en de
      // knikfactoren k_c,y en k_c,z van (6.23)/(6.24). L_cr,z gaat daarnaast
      // naar de drukterm van de kiptoets (6.35).
      //
      // Tot september 2026 stond hier de systeemlengte hard ingevuld en waren
      // de invoervelden voor hout verborgen. Gevolg: een houten kolom die
      // halverwege om de zwakke as gesteund is, of een spant met een
      // gordingsteun, viel niet te modelleren — de toetsing rekende altijd
      // met de volle systeemlengte. Dat is veilig-zijdig maar onbruikbaar.
      // De velden zijn nu zichtbaar (FemProperties / BarPropertiesDialog) en
      // komen hier binnen.
      //
      // Geen extra validatie hier: beide invoerpaden schrijven alleen een
      // eindige waarde > 0 weg (BarPropertiesDialog.buildCheckConfig, en
      // valideerModel keurt het veld met `positief: true`).
      //
      // Sinds september 2026 gaat een leeg veld als 0 = "niet opgegeven" door.
      // De kern kiest dan zelf en zet de herkomst in de kolomtoets en in de
      // drukterm van de kiptoets: om y de staaflengte, om z de grootste
      // afstand tussen plaatsen met een steun aan de boven- ÉN onderrand
      // (`lateral_bracing` hieronder), anders de staaflengte.
      buckling_length_y_m: cfg.bucklingLengthY_m ?? 0,
      buckling_length_z_m: cfg.bucklingLengthZ_m ?? 0,
      // Zijdelingse steunen per rand — ALLEEN voor de kniklengte om z. Dezelfde
      // twee lijsten als bij staal (boven = bovenrand, onder = onderrand). De
      // kipsteunafstand hieronder blijft er uitdrukkelijk los van.
      lateral_bracing: {
        top_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraints),
        bottom_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraintsBottom),
      },
      // Kipsteunafstand voor tabel 6.1; 0 → staaflengte.
      //
      // Dit is de ℓ waaruit tabel 6.1 de meewerkende lengte l_ef maakt
      // (l_ef = verhouding · ℓ, met 1,0 / 0,9 / 0,8 voor een ligger op twee
      // steunpunten en 0,5 / 0,8 voor een uitkraging). l_ef gaat naar
      // σ_m,crit in (6.31)/(6.32) en daarmee naar k_crit in (6.33)/(6.35):
      // een kleinere steunafstand geeft een hogere kritieke buigspanning en
      // dus een lichtere kiptoets.
      //
      // Het is een EIGEN veld en geen afgeleide van cfg.lateralRestraints.
      // Die fracties zijn per FLENS en horen bij het staalmodel; art. 6.3.3
      // kent dat onderscheid niet en vraagt één afstand. Uit de fracties
      // afleiden zou l_ef stilzwijgend verkleinen op grond van invoer die
      // over iets anders gaat — precies de stille gunst die deze bouwer
      // nergens maakt.
      //
      // Terugval is de STAAFLENGTE en niet L_cr,z: dat zijn twee
      // verschillende grootheden. L_cr,z is de kniklengte om de zwakke as
      // (art. 6.3.2) en kan door een steun aan één flens al korter zijn,
      // terwijl kip de hele doorsnede laat uitwijken en torderen.
      //
      // Geen eigen validatie: alleen een eindige waarde > 0 gaat door; al
      // het andere (leeg, 0, negatief, NaN) wordt 0 en dan neemt de kern de
      // staaflengte — de veilige kant, want de volle lengte geeft de laagste
      // σ_m,crit.
      ltb_segment_length_m:
        Number.isFinite(cfg.ltbSupportSpacing_m) && (cfg.ltbSupportSpacing_m as number) > 0
          ? (cfg.ltbSupportSpacing_m as number)
          : 0,
      ltb_load_case: "UniformLoad",
      ltb_load_position: "CentreOfGravity",
      ltb_effective_length_override_m: 0,
      perform_ltb_check: true,
      // Scheurfactor voor dwarskracht, b_ef = k_cr · b uit EN 1995-1-1+A2
      // (6.13a). De Eurocode beveelt 0,67 aan voor gezaagd en gelijmd
      // gelamineerd hout, maar laat de keuze uitdrukkelijk aan de nationale
      // bijlage. NEN-EN 1995-1-1/NB:2013 bij 6.1.7 schrijft voor liggers met
      // een prismatische doorsnede k_cr = 1,0 voor; de 0,8 daar geldt alleen
      // voor I- en T-profielen met een dun lijf, en deze toetsing rekent
      // uitsluitend met rechthoekige doorsneden.
      //
      // Dus: 1,0 is hier de normwaarde. Naar 0,67 gaan zou de
      // dwarskrachtcapaciteit een derde lager maken dan de norm toestaat.
      //
      // LET OP — dit geldt alleen voor de RECHTHOEK. Sinds een eigen
      // doorsnede hier ook binnenkomt, is de zin "deze toetsing rekent
      // uitsluitend met rechthoekige doorsneden" niet meer waar. Voor een
      // samengestelde doorsnede leest de NB k_cr af uit de verhouding
      // lijfdikte / flensbreedte (0,8 zodra het lijf dunner is dan de halve
      // flens), en die verhouding kent deze bouwer niet — de kern wél. De
      // kern negeert dit veld daarom bij een niet-rechthoekige doorsnede en
      // bepaalt k_cr zelf; zie `shear::k_cr_nb` en de toelichting bij
      // `check_timber_beam`.
      k_cr: 1.0,
      load_sharing: false,
      deflection_inst_mm: wInstMm,
      // Zakking onder de quasi-blijvende BGT-combinatie (G + Σ ψ₂,i · Q_k,i),
      // of de volle last mét notitie als die combinatie ontbreekt — zie
      // `quasiPermanentDeflection`.
      deflection_quasi_perm_mm: wQuasi.mm,
      // Blijvend deel onbekend → 0, dus w_add = w_fin (veilig-zijdig).
      deflection_permanent_mm: 0,
      deflection_limit_fin: defl.fin,
      deflection_limit_add: defl.add,
      // Referentielijn + eventuele waarschuwing over een doorgeknipte staaf
      // (gedeeld met de staalbouwer), gevolgd door de herkomst van w_qp.
      deflection_notes: [
        ...deflectionNotesFor(beam, data.nodes, data.beams, data.supports),
        ...instNotes,
        ...wQuasi.notes,
      ],
      // De toelichting bij een doorgaande lijn die als een staaf is getoetst;
      // de kern zet hem bij de kolomtoets, de kiptoets en de eindzakking.
      ...(staafNotities && staafNotities.length > 0 ? { staaf_notities: staafNotities } : {}),
    });
  }

  return { inputs, skipped };
}
