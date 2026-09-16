/**
 * rapportExport — de pagina-kant van de export van het standaardrapport naar PDF.
 *
 * Twee opdrachten van het bedieningskanaal, altijd in deze volgorde en altijd
 * allebei (gui_control.rs → `rapport_pdf`):
 *
 *  1. `rapport_voorbereiden` — controleert of er iets te printen valt (anders
 *     WEIGEREN met reden, zie rapportVoorwaarden.ts), zet rapporttype, papier
 *     en kop voor DEZE export, schakelt naar de rapportweergave en wacht op het
 *     expliciete klaar-signaal: geen rekengang gepland of lopend, toetsing klaar,
 *     de paginering heeft de nieuwe instellingen verwerkt, geen slag gepland,
 *     inhoudsopgave stabiel, fonts binnen, meer dan 0 vellen. Geeft terug wat
 *     Rust nodig heeft om te printen (vellen, papier, marges) en wat er in het
 *     document staat (kop, toetsing, analysetype).
 *  2. `rapport_afronden` — ná het printen: controleert dat er tussen "klaar" en
 *     de afdruk niets veranderde, en zet ALTIJD rapporttype, papier, kop en
 *     weergave terug zoals de gebruiker ze had. De API verandert zo niets aan
 *     wat bij Opslaan in het projectbestand komt (reportStore.rapportSnapshot).
 *
 * Er wordt niets nagebouwd: het type gaat via dezelfde `pasRapportTypeToe` als
 * de knoppen in de zijbalk, en wat geprint wordt is de ReportShell die de
 * gebruiker ziet — dezelfde vellen als Afdrukken → Opslaan als PDF.
 */
import { anyCheckableBeams, anyCheckablePlates, useCheckStore } from "../stores/checkStore";
import { useBetonStijfheidStore } from "../stores/betonStijfheidStore";
import {
  pageDimsMm,
  pasRapportSnapshotToe,
  rapportSnapshot,
  useReportStore,
  type RapportBestandInstellingen,
} from "../stores/reportStore";
import { pasRapportTypeToe } from "../components/report/reportSections";
import {
  beoordeelPaginering,
  leesPagineerToestand,
  vraagHerpaginering,
} from "../components/report/rapportGereedheid";
import { tocToestand } from "../components/report/toc";
import {
  kopMetOverschrijving,
  laatstBekendeProjectInfo,
  leesRapportKopOverschrijving,
  projectInfoLaadtNog,
  zetRapportKopOverschrijving,
  type RapportKop,
} from "../components/report/useProjectInfo";
import {
  beoordeelRekenVoorwaarden,
  leesExportOpties,
  vergelijkExportMoment,
  type ExportMoment,
  type RekenVoorwaarden,
} from "./rapportVoorwaarden";
import type { BedieningActies } from "./bediening";

/**
 * Hoe vaak een toestand opnieuw bekeken wordt. Dit is geen wachttijd maar een
 * bemonstering: er wordt gewacht op VOORWAARDEN, en de tijdslimiet van de
 * opdracht begrenst het geheel. Niet elke voorwaarde heeft een abonnement (de
 * rekentoestand zit in refs van App.tsx), vandaar bemonsteren.
 */
const BEMONSTER_MS = 50;

type Acties = () => BedieningActies;

function pauze(ms: number): Promise<void> {
  return new Promise((los) => window.setTimeout(los, ms));
}

/** De rekenvoorwaarden zoals ze NU in de app staan (render-toestand via de acties). */
export function rekenVoorwaardenNu(a: BedieningActies): RekenVoorwaarden {
  const f = a.fem;
  const r = a.rekenToestand();
  const c = useCheckStore.getState();
  return {
    heeftModel: f.nodes.length > 0 || f.beams.length > 0,
    heeftResultaten: f.combinationResults !== null,
    rekenfout: a.laatsteRekenfout(),
    herberekeningGepland: r.herberekeningGepland,
    lopendeRekengangen: r.lopendeRekengangen,
    toetsingLoopt: c.isRunning,
    toetsfout: c.error,
    toetsingGedraaid: c.lastRunAt !== null,
    toetsingHoortBijResultaten:
      f.combinationResults !== null && c.lastRunData?.combinationResults === f.combinationResults,
    // Platen tellen mee: een ontbrekende of verouderde plaattoets hoort de
    // export net zo te weigeren als een ontbrekende staaftoets.
    toetsbareStaven: anyCheckableBeams([...f.beams]) || anyCheckablePlates(f.plates),
    analysetype: f.analysetype,
    resultatenUitVolledigeRekengang:
      f.combinationResults !== null && r.volledigeRekengang === f.combinationResults,
  };
}

/** Is de rekengang in rust: niets gepland, niets lopend, geen toetsing bezig? */
function inRust(a: BedieningActies): string | null {
  const r = a.rekenToestand();
  if (r.lopendeRekengangen > 0) return "er loopt een rekengang";
  if (r.herberekeningGepland) return "er staat een herberekening gepland";
  if (useCheckStore.getState().isRunning) return "de toetsing loopt";
  return null;
}

/**
 * Wacht tot er geen rekengang gepland of lopend is en de toetsing stilstaat.
 * Die drie zitten in refs en in de toetsstore, dus niet in de render-toestand:
 * hier is geen verse render voor nodig.
 */
export async function wachtOpRekenrust(a: Acties, deadline: number): Promise<void> {
  for (;;) {
    const bezig = inRust(a());
    if (bezig === null) return;
    if (performance.now() >= deadline) {
      throw new Error(`wachten op rust in de rekengang verliep — ${bezig}`);
    }
    await pauze(BEMONSTER_MS);
  }
}

/**
 * Wacht op het oordeel over rekenen en toetsen. Eerst rust (refs en stores),
 * dan een VERSE render, en pas dan oordelen: de modelstate (resultaten,
 * analysetype) zit in de render van App.tsx, en direct na een rekengang kan de
 * laatste commit nog onderweg zijn — dan zou "geen resultaten" een weigering
 * geven over een toestand die al voorbij is.
 */
async function wachtOpRekenOordeel(
  a: Acties,
  verseRender: () => Promise<void>,
  deadline: number,
): Promise<void> {
  for (;;) {
    await wachtOpRekenrust(a, deadline);
    await verseRender();
    const o = beoordeelRekenVoorwaarden(rekenVoorwaardenNu(a()));
    if (o.soort === "ok") return;
    if (o.soort === "weiger") throw new Error(`rapport niet geëxporteerd: ${o.reden}`);
    if (performance.now() >= deadline) throw new Error(`wachten op de rekengang verliep — ${o.reden}`);
    await pauze(BEMONSTER_MS);
  }
}

// ── De lopende export ───────────────────────────────────────────────────────

interface LopendeExport {
  id: number;
  vorige: {
    rapport: RapportBestandInstellingen;
    weergave: string;
    kop: RapportKop | null;
  };
  /** De stand op het moment dat het rapport klaar was, of null als dat nooit werd. */
  moment: ExportMoment | null;
  /** De pagineerteller bij `beforeprint`, als de printpijplijn dat event stuurt. */
  slagenBijPrint: number | null;
  opPrint: () => void;
}

let lopende: LopendeExport | null = null;
let volgnummer = 0;

function momentNu(a: BedieningActies): ExportMoment {
  const p = leesPagineerToestand();
  return {
    generatie: a.rekenToestand().generatie,
    slagen: p.slagen,
    aantalVellen: p.aantalVellen,
    toetsingOp: useCheckStore.getState().lastRunAt,
    weergave: a.activeView,
  };
}

/** Alles terug zoals het vóór de export stond. Geeft terug wat er is teruggezet. */
function herstel(exp: LopendeExport, a: BedieningActies) {
  window.removeEventListener("beforeprint", exp.opPrint);
  pasRapportSnapshotToe(exp.vorige.rapport);
  zetRapportKopOverschrijving(exp.vorige.kop);
  if (a.activeView !== exp.vorige.weergave) a.setActiveView(exp.vorige.weergave);
  return {
    weergave: exp.vorige.weergave,
    rapportType: exp.vorige.rapport.rapportType,
    formaat: exp.vorige.rapport.pageSize,
    orientatie: exp.vorige.rapport.orientation,
    kopOverschrijving: exp.vorige.kop !== null,
  };
}

/** `status` toont of er een export openstaat (een afgebroken export laat dat zien). */
export function lopendeExportId(): number | null {
  return lopende?.id ?? null;
}

// ── rapport_voorbereiden ────────────────────────────────────────────────────

export async function rapportVoorbereiden(
  args: Record<string, unknown>,
  a: Acties,
  wachtOpRender: () => Promise<void>,
  verseRender: () => Promise<void>,
): Promise<unknown> {
  const begin = performance.now();
  const opties = leesExportOpties(args);
  const deadline = begin + opties.tijdslimietMs;

  // Een eerdere export die nooit werd afgerond (Rust brak af, of de tijd
  // verliep): eerst die terugzetten, anders zou "de vorige toestand" van deze
  // export de tijdelijke toestand van de vorige zijn.
  if (lopende) {
    herstel(lopende, a());
    lopende = null;
  }

  // 1. Is er iets te printen? Wachten zolang er gerekend of getoetst wordt;
  //    weigeren met reden als er niets (vers) is. Dit gebeurt VÓÓR het
  //    wisselen van weergave: de rapportweergave rekent zelf door als er geen
  //    resultaten zijn (App.tsx), en dan zou de weigering nooit komen.
  await wachtOpRekenOordeel(a, verseRender, deadline);

  // 2. De toestand van de gebruiker vastleggen.
  const exp: LopendeExport = {
    id: ++volgnummer,
    vorige: {
      rapport: rapportSnapshot(),
      weergave: a().activeView,
      kop: leesRapportKopOverschrijving(),
    },
    moment: null,
    slagenBijPrint: null,
    opPrint: () => {},
  };
  lopende = exp;

  try {
    // 3. Toepassen, alleen voor deze export.
    if (opties.type) pasRapportTypeToe(opties.type);
    const rs = useReportStore.getState();
    if (opties.formaat) rs.setPageSize(opties.formaat);
    if (opties.orientatie) rs.setOrientation(opties.orientatie);
    zetRapportKopOverschrijving(opties.kop);
    if (a().activeView !== "report") {
      a().setActiveView("report");
      await wachtOpRender();
    }
    // Pas NA alle wijzigingen: de slag die dit nummer beantwoordt, heeft ze gezien.
    const verzoek = vraagHerpaginering();

    // 4. Het klaar-signaal: rekenen/toetsen nog steeds in orde, en de paginering klaar.
    let laatsteReden = "";
    let aantalVellen = 0;
    for (;;) {
      const r = beoordeelRekenVoorwaarden(rekenVoorwaardenNu(a()));
      if (r.soort === "weiger") throw new Error(`rapport niet geëxporteerd: ${r.reden}`);
      if (a().activeView !== "report") {
        throw new Error(`de weergave werd tijdens het voorbereiden gewisseld (naar "${a().activeView}")`);
      }
      if (r.soort === "wacht") {
        laatsteReden = r.reden;
      } else {
        const p = beoordeelPaginering({
          pagineer: leesPagineerToestand(),
          toc: tocToestand(),
          verzoek,
          projectInfoLaadt: projectInfoLaadtNog(),
          nu: performance.now(),
        });
        if (p.soort === "weiger") throw new Error(`rapport niet geëxporteerd: ${p.reden}`);
        if (p.soort === "klaar") {
          aantalVellen = p.aantalVellen;
          break;
        }
        laatsteReden = p.reden;
      }
      if (performance.now() >= deadline) {
        throw new Error(
          `het rapport werd niet klaar binnen ${Math.round(opties.tijdslimietMs / 1000)} s — ${laatsteReden}`,
        );
      }
      await pauze(BEMONSTER_MS);
    }

    // 5. De stand vastleggen waartegen na het printen vergeleken wordt, en
    //    luisteren of de printpijplijn `beforeprint` stuurt: dan telt de stand
    //    OP DAT MOMENT, en niet een slag die ná de afdruk nog volgt.
    exp.moment = momentNu(a());
    exp.opPrint = () => {
      if (exp.slagenBijPrint === null) exp.slagenBijPrint = leesPagineerToestand().slagen;
    };
    window.addEventListener("beforeprint", exp.opPrint);

    const s = useReportStore.getState();
    const dims = pageDimsMm(s.pageSize, s.orientation);
    const c = useCheckStore.getState();
    const st = useBetonStijfheidStore.getState();
    const f = a().fem;
    const kop = kopMetOverschrijving(laatstBekendeProjectInfo(), leesRapportKopOverschrijving());
    return {
      exportId: exp.id,
      aantalVellen,
      formaat: s.pageSize,
      orientatie: s.orientation,
      // Het vel zoals het op scherm staat (bij liggend dus breedte > hoogte).
      velMm: { breedte: dims.w, hoogte: dims.h },
      // Enkelzijdig drukwerk: binnen = links, buiten = rechts (reportStore).
      margesMm: { boven: s.margeBoven, onder: s.margeOnder, links: s.margeBinnen, rechts: s.margeBuiten },
      rapportType: s.rapportType,
      toetsingDetail: s.toetsingDetail,
      projectKop: {
        naam: kop.name,
        nummer: kop.projectNumber,
        constructeur: kop.engineer,
        bedrijf: kop.company,
        datum: kop.date,
        bron: opties.kop ? "argument" : "projectgegevens",
      },
      analysetype: f.analysetype,
      toetsing: {
        toetsbareStaven: anyCheckableBeams([...f.beams]),
        getoetst: c.results.length,
        overgeslagen: c.skipped.length,
        platenGetoetst: c.plateResults.filter((r) => r.geweigerd === undefined).length,
        platenNietGetoetst:
          c.plateResults.filter((r) => r.geweigerd !== undefined).length + c.plateSkipped.length,
        uitgevoerdOp: c.lastRunAt,
      },
      fysischeRonde:
        f.analysetype === "tweedeOrdeFysisch"
          ? { combinaties: st.combinaties.length, overgeslagenStaven: st.overgeslagen.length }
          : null,
      vorigeToestand: {
        weergave: exp.vorige.weergave,
        rapportType: exp.vorige.rapport.rapportType,
        formaat: exp.vorige.rapport.pageSize,
        orientatie: exp.vorige.rapport.orientation,
        kopOverschrijving: exp.vorige.kop !== null,
      },
      wachttijdMs: Math.round(performance.now() - begin),
    };
  } catch (e) {
    herstel(exp, a());
    lopende = null;
    throw e;
  }
}

// ── rapport_afronden ────────────────────────────────────────────────────────

export function rapportAfronden(args: Record<string, unknown>, a: Acties): unknown {
  const id = args.exportId;
  const exp = lopende;
  if (!exp || typeof id !== "number" || exp.id !== id) {
    throw new Error(
      `geen lopende export met id ${String(id)} — al afgerond, of vervangen door een nieuwere export`,
    );
  }
  window.removeEventListener("beforeprint", exp.opPrint);
  const nu = momentNu(a());
  const beforeprintGezien = exp.slagenBijPrint !== null;
  const bijPrint: ExportMoment = { ...nu, slagen: exp.slagenBijPrint ?? nu.slagen };
  const afwijking = exp.moment
    ? vergelijkExportMoment(exp.moment, bijPrint)
    : "het rapport werd nooit klaar gemeld";
  const hersteld = herstel(exp, a());
  lopende = null;
  return {
    ongewijzigd: afwijking === null,
    reden: afwijking,
    beforeprintGezien,
    hersteld,
  };
}
