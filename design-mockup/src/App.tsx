import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/TitleBar";
import Ribbon from "./components/ribbon/Ribbon";
import DocumentBar from "./components/DocumentBar";
import StatusBar, { type SolverStatus } from "./components/StatusBar";
import Backstage from "./components/backstage/Backstage";
import ToastHost from "./components/feedback/Toast";
import { useRecentFiles } from "./hooks/useRecentFiles";
import SettingsDialog, { applyTheme } from "./components/settings/SettingsDialog";
import FeedbackDialog from "./components/feedback/FeedbackDialog";
import WelcomeScreen from "./components/welcome/WelcomeScreen";
import ProjectSettingsDialog from "./components/project/ProjectSettingsDialog";
import IfcViewerPanel from "./components/panels/IfcViewerPanel";
import type { IfcRekenmodelInput } from "./io/ifcExport";
import { useProjectInfo } from "./components/report/useProjectInfo";
import ReportPreview, { DetachedReportPreview } from "./components/panels/ReportPreview";
import { ReportWindowSync } from "./components/report/reportSync";
import type { ReportData } from "./components/report/ReportDataContext";
import InsightsView from "./components/panels/InsightsView";
import CheckPanel from "./components/panels/CheckPanel";
import FemProjectTree from "./components/fem/FemProjectTree";
import FemProperties from "./components/fem/FemProperties";
import FemCanvas from "./components/fem/FemCanvas";
import LibraryDialog, { type LibraryTab } from "./components/settings/LibraryDialog";
import TableView from "./components/table/TableView";
import type { TableDataset, TableViewApi } from "./components/table/tableTypes";
import LoadCaseTabBar from "./components/fem/LoadCaseTabBar";
import LoadCasesDialog from "./components/fem/LoadCasesDialog";
import WindGeneratorDialog from "./lib/wind/WindGeneratorDialog";
import { useWindGenerator } from "./stores/windStore";
import { pasRapportSnapshotToe, rapportSnapshot } from "./stores/reportStore";
import { setSetting as zetInstelling } from "./store";
import Sheet from "./components/openaec/Sheet";
import { getDetachedParams, useWindowManager } from "./hooks/useWindowManager";
// Het bedieningskanaal (OPENAEC_GUI_CONTROL=1): dezelfde closures als de knoppen,
// aangesproken van buiten. Doet niets zolang Rust zegt dat het kanaal uit staat.
import { useBediening } from "./bediening/bediening";
import { useFemStore } from "./hooks/useFemStore";
import type { GridSettings, Tool } from "./components/fem/femTypes";
import { DEFAULT_GRID, nonlinearVoorBestand } from "./components/fem/femTypes";
import type { SolverResult } from "./components/fem/solver/types";
import { solveAllCases, solveAllCasesNonlinear } from "./components/fem/solver/solver";
import { zetCombinatieResultaat, getSecondOrderInput, zetSolverLogOpvanger } from "./components/fem/solver/engine";
import { maakSolverLogOpvanger } from "./stores/solverLogStore";
import { combineResults, computeEnvelope } from "./components/fem/solver/combinations";
import {
  betonStavenUitModel,
  losCombinatieFysischOp,
  schatVrijheidsgraden,
  segmentWaarschuwing,
} from "./lib/betonStijfheid";
import { DEFAULT_DISPLAY_FLAGS, type DisplayFlags } from "./components/fem/FemResultsOverlay";
import { bouwMultiInput } from "./lib/modelNaarSolverInput";
// Scheefstand: φ komt óf uit de vaste noemer (het oude gedrag, en de stand van
// elk bestaand projectbestand) óf uit de normformule van EN 1993-1-1 (5.5),
// EN 1992-1-1 (5.1) of EN 1995-1-1 (5.1) — zie lib/scheefstandNorm.ts.
import {
  bepaalScheefstand,
  leidScheefstandGeometrieAf,
  scheefstandToelichting,
  toepasselijkeScheefstandNormen,
} from "./lib/scheefstandNorm";
import { useCheckStore, anyCheckableBeams, roepKern } from "./stores/checkStore";
// Het venster onderin bij een betonstaaf: de aanzicht met de dekkingslijnen,
// de doorsnede op de aangewezen snede en de invoer van de wapeningszones.
import BetonStaafVenster from "./components/beton/dekking/BetonStaafVenster";
import { matchSupportedConcreteClass } from "./lib/betonCheckBuilder";
import { bEffWaardenPerStaaf, bepaalBeffPerStaaf } from "./lib/beffLiggerlijn";
import {
  useBetonStijfheidStore,
  type StijfheidCombinatie,
} from "./stores/betonStijfheidStore";
import { combinationsToFile, combinationsFromFile } from "./io/projectFile";
import {
  exporteer as exporteerEigenDoorsneden,
  importeer as importeerEigenDoorsneden,
} from "./lib/profieleditor/eigenDoorsnedenStore";
import {
  exporteer as exporteerCltOpbouwen,
  importeer as importeerCltOpbouwen,
} from "./lib/profieleditor/cltOpbouwenStore";
import { isTauriApp } from "./lib/tauri";
import { getSetting, setSetting } from "./store";
import "./themes.css";
import "./App.css";

const ThreeViewer = lazy(() => import("./components/panels/ThreeViewer"));

/**
 * Rust tussen de laatste modelwijziging en de live-herberekening. Lang genoeg
 * om een sleepbeweging (tientallen updates per seconde) als één wijziging te
 * behandelen, kort genoeg om als directe reactie te voelen.
 */
const HERBEREKEN_VERTRAGING_MS = 300;

/**
 * De bibliotheken uit een geopend projectbestand samenvoegen met de lokale.
 *
 * Beide winkels voegen SAMEN in plaats van te vervangen, en het PROJECT wint
 * bij een gelijke naam — het bestand beschrijft immers waarmee dít model is
 * doorgerekend. Vroeger verving het openen de lokale lijst compleet: twee
 * projecten na elkaar openen wiste de doorsneden van het eerste.
 *
 * Wat het project overschrijft is geen bijzaak, dus geeft deze functie de
 * overschreven namen terug om te MELDEN. Stil overschrijven is precies het
 * probleem dat het samenvoegen oplost; het zou er anders alleen zachter
 * uitzien.
 *
 * Een ouder bestand zonder deze velden laat de lokale bibliotheken ongemoeid.
 */
function voegBibliothekenSamen(parsed: {
  eigenDoorsneden?: Parameters<typeof importeerEigenDoorsneden>[0];
  eigenCltOpbouwen?: Parameters<typeof importeerCltOpbouwen>[0];
}): string | null {
  const delen: string[] = [];
  if (parsed.eigenDoorsneden) {
    const namen = importeerEigenDoorsneden(parsed.eigenDoorsneden);
    if (namen.length > 0) delen.push(`doorsneden: ${namen.join(", ")}`);
  }
  if (parsed.eigenCltOpbouwen) {
    const namen = importeerCltOpbouwen(parsed.eigenCltOpbouwen);
    if (namen.length > 0) delen.push(`CLT-opbouwen: ${namen.join(", ")}`);
  }
  return delen.length > 0 ? delen.join(" · ") : null;
}

/**
 * Detached window — shows only one view, no ribbon/backstage/etc.
 * Has a "dock back" button to re-attach to the main window.
 */
function DetachedApp({ view, title }: { view: string; title: string }) {
  const { requestDockBack } = useWindowManager();

  useEffect(() => {
    getSetting("theme", "light").then((saved) => applyTheme(saved));
    // Browservenster (window.open-fallback): venstertitel zelf zetten.
    document.title = `${title} — Open FEM2D Studio`;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().show();
    }).catch(() => {});
  }, [title]);

  const handleDockBack = () => {
    // Browser-fallback: het venster is met window.open geopend en mag
    // zichzelf sluiten — het rapport leeft gewoon door in het hoofdvenster.
    if (!isTauriApp()) {
      window.close();
      return;
    }
    requestDockBack(title, view);
  };

  const renderView = () => {
    switch (view) {
      case "ifc":
        return <IfcViewerPanel />;
      case "report":
        // R5 — live gesynchroniseerd rapport (snapshot-push via reportSync).
        return <DetachedReportPreview />;
      case "viewer":
        return (
          <Suspense fallback={<div className="placeholder"><p>Loading 3D Viewer...</p></div>}>
            <ThreeViewer />
          </Suspense>
        );
      default:
        return <div className="placeholder"><p>Detached view</p></div>;
    }
  };

  return (
    <>
      <TitleBar onSettingsClick={() => {}} onFeedbackClick={() => {}} />
      {/* Dock-back bar */}
      <div className="detached-dock-bar">
        <span className="detached-dock-title">{title}</span>
        <button className="detached-dock-btn" onClick={handleDockBack} title="Dock back to main window">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          <span>Dock back</span>
        </button>
      </div>
      <main className="main-view" style={{ flex: 1 }}>
        {renderView()}
      </main>
      <StatusBar />
    </>
  );
}

function App() {
  // Check if this is a detached window
  const detachedParams = getDetachedParams();
  if (detachedParams.detached && detachedParams.view) {
    return <DetachedApp view={detachedParams.view} title={detachedParams.title ?? "Untitled"} />;
  }
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  // Currently-open project path (Tauri only; empty string = unsaved).
  // Save → write back to this path; Save As → always opens dialog and updates this.
  const [projectPath, setProjectPath] = useState<string>("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  // Bibliotheek-dialoog (Instellingen-ribbon: Materialen / Profielen) —
  // alleen-lezen naslag, geen editor.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("sections");
  // Themawissel vanaf de ribbon (Instellingen-tab): direct toepassen +
  // persist — zelfde route als Opslaan in SettingsDialog.
  const handleThemeSelect = useCallback((value: string) => {
    setTheme(value);
    applyTheme(value);
    void setSetting("theme", value);
  }, []);
  const [activeView, setActiveView] = useState("default");
  // FEM tool state — shared between Ribbon (active highlight) + FemCanvas (action)
  const [femTool, setFemTool] = useState<Tool>("select");
  // FEM model state lifted to App.tsx via useFemStore.
  const fem = useFemStore();
  // Projectgegevens uit de projectinstellingen — voeden onder meer de
  // IFC-export (projectnaam, nummer, ingenieur, bedrijf, locatie) en reizen
  // mee in het projectbestand.
  const projectInfo = useProjectInfo();
  // Windbelastinggenerator — de hook draait de generator mee met wijzigingen
  // in de constructie (idempotent, zie windStore.ts). Staat hier boven de
  // snapshot-opbouw omdat zijn instellingen in het projectbestand gaan.
  const windGenerator = useWindGenerator(fem);
  const { addRecentFile } = useRecentFiles();
  // Normtoetsing (EN 1993 staal + EN 1995 hout) — resultaten in checkStore.
  const checkRun = useCheckStore((s) => s.run);
  const checksRunning = useCheckStore((s) => s.isRunning);
  const checkClear = useCheckStore((s) => s.clear);
  // Toetsingsuitkomst voor de CSV-export en het losse HTML-rapport: exact
  // wat het toetsingspaneel toont, zodat er nooit twee verschillende unity
  // checks voor hetzelfde model in omloop zijn.
  const checkResults = useCheckStore((s) => s.results);
  const checkSkipped = useCheckStore((s) => s.skipped);
  // Het spoor van de fysisch niet-lineaire tweede orde (segmentstijfheden per
  // combinatie) — bron van het rapporthoofdstuk. Wordt op dezelfde momenten
  // gewist als de toetsresultaten: verse gegevens of niets.
  const stijfheidZet = useBetonStijfheidStore((s) => s.zet);
  const stijfheidClear = useBetonStijfheidStore((s) => s.clear);
  // R5 — losgekoppeld rapportvenster ("Naast je scherm").
  const { createDetachedWindow } = useWindowManager();
  const { t: tRibbon } = useTranslation("ribbon");

  // ── Tabel-editor (ribbon-tab "Tabel") ──────────────────────────────────
  // De ribbon-knoppen kiezen de dataset; de hoofdweergave "table" toont hem.
  const [tableDataset, setTableDataset] = useState<TableDataset>("nodes");
  // Imperatieve API van de gemonteerde TableView (Export CSV / Kopiëren /
  // Filter-focus vanaf de ribbon).
  const tableApiRef = useRef<TableViewApi | null>(null);
  const handleTableDataset = useCallback((d: TableDataset) => {
    setTableDataset(d);
    setActiveView("table");
  }, []);
  /** Roep een TableViewApi-actie aan; schakelt zo nodig eerst naar de
   *  tabelweergave (de view moet gemonteerd zijn vóór de api-ref bestaat). */
  const invokeTableApi = useCallback((fn: keyof TableViewApi) => {
    if (tableApiRef.current) {
      tableApiRef.current[fn]();
    } else {
      setActiveView("table");
      setTimeout(() => tableApiRef.current?.[fn](), 60);
    }
  }, []);

  const handleDetachReport = useCallback(() => {
    void createDetachedWindow({
      view: "report",
      title: tRibbon("report.report", "Rapport"),
      width: 860,
      height: 1100,
    });
  }, [createDetachedWindow, tRibbon]);

  // R5 — doorgeef-regels naar het live rapport (ReportDataContext): één
  // object voor het Rapport-tabblad én de snapshot-sync naar losgekoppelde
  // vensters. useMemo op veld-identiteiten: alleen echte mutaties leveren
  // een nieuw object (en dus een nieuw snapshot) op.
  const reportData: ReportData = useMemo(() => ({
    nodes: fem.nodes,
    beams: fem.beams,
    plates: fem.plates,
    supports: fem.supports,
    loads: fem.loads,
    loadCases: fem.loadCases,
    // De VOLLEDIGE lijst: het rapport somt ook op wat er NIET is doorgerekend,
    // met de reden erbij (`overgeslagenCombinaties`). Een lezer die zes
    // combinaties ziet waar hij er acht verwacht, moet dat in het rapport zelf
    // kunnen nazien.
    combinations: fem.combinations,
    overgeslagenCombinaties: fem.overgeslagenCombinaties,
    structuralGrid: fem.structuralGrid,
    selfWeightEnabled: fem.selfWeightEnabled,
    // R3 — resultaten voor de resultaatsecties. useFemStore zet deze op null
    // bij elke modelwijziging, dus het rapport valt dan automatisch terug op
    // "Nog niet berekend" (nooit verouderd).
    combinationResults: fem.combinationResults,
    // Per-belastinggeval-resultaten (zelfde run/invalidatie) — de
    // plaatspanningssectie superponeert hier zelf combinaties uit.
    caseResults: fem.multiLcResult,
    envelope: fem.envelope,
  }), [
    fem.nodes, fem.beams, fem.plates, fem.supports, fem.loads, fem.loadCases,
    fem.combinations, fem.overgeslagenCombinaties,
    fem.structuralGrid, fem.selfWeightEnabled,
    fem.combinationResults, fem.multiLcResult, fem.envelope,
  ]);

  // ── File-menu handlers (after `fem` is declared) ────────────────────────
  const buildProjectSnapshot = useCallback(() => ({
    nodes: fem.nodes,
    beams: fem.beams,
    supports: fem.supports,
    plates: fem.plates,
    loads: fem.loads,
    loadCases: fem.loadCases,
    activeLoadCaseId: fem.activeLoadCaseId,
    selfWeightEnabled: fem.selfWeightEnabled,
    // Het analysetype gaat er als eigen veld in; de oude booleaan blijft
    // ernaast staan zodat een oudere versie van de app (en de sidecar) het
    // bestand nog kan lezen — beide tweede-orde-standen zijn daar "aan".
    nonlinearEnabled: nonlinearVoorBestand(fem.analysetype),
    analysetype: fem.analysetype,
    betonSegmentLengteMm: fem.betonSegmentLengteMm,
    // v2: combinaties (Map-factoren → JSON-object) + stramien + scheefstand.
    combinations: combinationsToFile(fem.combinations),
    structuralGrid: fem.structuralGrid,
    scheefstandEnabled: fem.scheefstandEnabled,
    scheefstandNoemer: fem.scheefstandNoemer,
    scheefstandRichting: fem.scheefstandRichting,
    // De normkeuze voor φ reist mee. De vaste noemer hierboven blijft óók in
    // het bestand staan: hij is de stand waarop een lezer die deze velden niet
    // kent terugvalt, en dan verandert er niets aan zijn berekening.
    scheefstandBron: fem.scheefstandBron,
    scheefstandHoogteM: fem.scheefstandHoogteM,
    scheefstandAantalElementen: fem.scheefstandAantalElementen,
    // Eigen doorsneden reizen mee in het projectbestand: een staaf met
    // `EIGEN:<naam>` moet op een andere machine dezelfde doorsnede vinden.
    // Alleen de doorsneden die dit model daadwerkelijk gebruikt — anders
    // draagt elk projectbestand de complete persoonlijke bibliotheek mee.
    eigenDoorsneden: exporteerEigenDoorsneden(fem.beams),
    // Idem voor de eigen CLT-vloeropbouwen; die reizen als BIJSCHRIFT mee
    // (de opbouw zelf staat al in de profielnaam van de staaf), en alleen
    // voor de opbouwen die in dit model voorkomen.
    eigenCltOpbouwen: exporteerCltOpbouwen(fem.beams),
    // Projectgegevens, windinstellingen en rapportinstellingen horen bij het
    // project en niet bij de machine; zie projectFile.ts voor de motivatie.
    projectInfo: projectInfo as unknown as Record<string, unknown>,
    windInstellingen: windGenerator.instellingen as unknown as Record<string, unknown>,
    rapport: rapportSnapshot() as unknown as Record<string, unknown>,
  }), [fem, projectInfo, windGenerator.instellingen]);

  /**
   * De JSON waarop de dirty-vlag rust: het MODEL, zonder projectgegevens,
   * wind- en rapportinstellingen. Die drie komen na het openen van een
   * bestand pas even later uit hun stores terug (instellingen zijn
   * asynchroon), en zouden een net geopend project meteen "gewijzigd"
   * maken. Ze gaan wél altijd mee bij het opslaan.
   */
  const modelJson = useCallback((snap: ReturnType<typeof buildProjectSnapshot>) => {
    const { projectInfo: _p, windInstellingen: _w, rapport: _r, ...model } = snap;
    return JSON.stringify(model);
  }, []);

  // ── C2: dirty-vlag ("niet-opgeslagen wijzigingen") ──────────────────────
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const setDirty = useCallback((v: boolean) => {
    isDirtyRef.current = v;
    setIsDirty(v);
  }, []);
  // JSON van de laatst opgeslagen/geladen snapshot; null = nog geen baseline.
  const lastSavedRef = useRef<string | null>(null);
  // Na Openen/Nieuw is de fem-state in de handler zelf nog oud (React-flush) —
  // deze vlag vraagt de dirty-check-effect om de eerstvolgende run als nieuwe
  // baseline te nemen.
  const baselineResetRef = useRef(false);

  /** Opslaan als — retourneert true als er daadwerkelijk is opgeslagen. */
  const handleSaveProjectAs = useCallback(async (): Promise<boolean> => {
    const { serializeProject, saveProjectAs } = await import("./io/projectFile");
    const { notifySuccess, notifyWarning } = await import("./io/notify");
    try {
      const snap = buildProjectSnapshot();
      const text = serializeProject(snap);
      const suggested = projectPath || "project.ifcfem2d";
      const newPath = await saveProjectAs(text, suggested);
      if (newPath) {
        setProjectPath(newPath);
        addRecentFile(newPath);
      } else if (isTauriApp()) {
        // Native dialoog geannuleerd — er is niets weggeschreven.
        return false;
      }
      lastSavedRef.current = modelJson(snap);
      setDirty(false);
      notifySuccess("Bestand opgeslagen", newPath || "Download gestart in browser.");
      return true;
    } catch (e) {
      notifyWarning("Opslaan mislukt", e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [buildProjectSnapshot, projectPath, addRecentFile, setDirty]);

  /** Opslaan — naar het bekende pad, of via Opslaan-als zonder pad. */
  const handleSaveProject = useCallback(async (): Promise<boolean> => {
    if (!projectPath) {
      return handleSaveProjectAs();
    }
    const { serializeProject, saveProjectTo } = await import("./io/projectFile");
    const { notifySuccess, notifyWarning } = await import("./io/notify");
    try {
      const snap = buildProjectSnapshot();
      const text = serializeProject(snap);
      await saveProjectTo(projectPath, text);
      lastSavedRef.current = modelJson(snap);
      setDirty(false);
      notifySuccess("Bestand opgeslagen", projectPath.split(/[\\/]/).pop());
      return true;
    } catch (e) {
      notifyWarning("Opslaan mislukt", e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [buildProjectSnapshot, projectPath, handleSaveProjectAs, setDirty]);

  /**
   * C2: sluitbeveiliging. Vraagt bij niet-opgeslagen wijzigingen wat er moet
   * gebeuren: Opslaan / Niet opslaan / Annuleren (twee dialogen, want de
   * Tauri dialog-plugin kent alleen twee-knops dialogen). Retourneert true
   * wanneer de aanroeper mag doorgaan (schoon, opgeslagen of bewust
   * weggegooid), false bij Annuleren of mislukt opslaan.
   */
  const confirmUnsavedAction = useCallback(async (): Promise<boolean> => {
    if (!isDirtyRef.current) return true;
    if (isTauriApp()) {
      const { ask, confirm } = await import("@tauri-apps/plugin-dialog");
      const wantsSave = await ask(t("unsaved.askSave"), {
        title: t("unsaved.title"),
        kind: "warning",
        okLabel: t("unsaved.saveBtn"),
        cancelLabel: t("unsaved.dontSaveBtn"),
      });
      if (wantsSave) return handleSaveProject();
      // "Niet opslaan" → één extra bevestiging zodat Esc of een misklik geen
      // werk weggooit.
      return confirm(t("unsaved.confirmDiscard"), {
        title: t("unsaved.title"),
        kind: "warning",
        okLabel: t("unsaved.proceedBtn"),
        cancelLabel: t("unsaved.cancelBtn"),
      });
    }
    // Browser-fallback: window.confirm kent maar twee knoppen.
    return window.confirm(t("unsaved.confirmDiscard"));
  }, [handleSaveProject, t]);

  /**
   * Eén gelezen projectbestand → de store. DE ENIGE plek waar die mapping
   * staat: "Openen…", een recent bestand én de GUI-bediening lopen er alle
   * drie doorheen. Twee openpaden die zich anders gedragen is een bug die zich
   * als een instelling vermomt — en drie is dat nog meer.
   *
   * Geeft terug wat `voegBibliothekenSamen` meldde (overschreven doorsneden),
   * zodat de aanroeper dat kan tonen; met `path` worden ook het projectpad en
   * de recente-lijst bijgewerkt.
   */
  const pasProjectToe = useCallback(
    (parsed: ReturnType<(typeof import("./io/projectFile"))["deserializeProject"]>, path?: string) => {
      baselineResetRef.current = true;
      // Vóór het model: de staven verwijzen naar deze doorsneden.
      const overschreven = voegBibliothekenSamen(parsed);
      fem.loadProjectState({
        nodes: parsed.nodes,
        beams: parsed.beams,
        supports: parsed.supports,
        plates: parsed.plates,
        loads: parsed.loads,
        loadCases: parsed.loadCases,
        activeLoadCaseId: parsed.activeLoadCaseId,
        selfWeightEnabled: parsed.selfWeightEnabled,
        // Beide velden gaan mee: ontbreekt `analysetype` (elk bestand van
        // vóór de drie standen), dan bepaalt de oude booleaan de stand.
        nonlinearEnabled: parsed.nonlinearEnabled,
        analysetype: parsed.analysetype,
        betonSegmentLengteMm: parsed.betonSegmentLengteMm,
        // v2-velden; undefined bij v1-bestanden → store-defaults.
        combinations: combinationsFromFile(parsed.combinations),
        structuralGrid: parsed.structuralGrid,
        scheefstandEnabled: parsed.scheefstandEnabled,
        scheefstandNoemer: parsed.scheefstandNoemer,
        scheefstandRichting: parsed.scheefstandRichting,
        // Ontbreekt `scheefstandBron` (elk bestand van vóór de normkeuze),
        // dan valt de store terug op "vast" en rekent het bestand precies
        // zoals het altijd deed.
        scheefstandBron: parsed.scheefstandBron,
        scheefstandHoogteM: parsed.scheefstandHoogteM,
        scheefstandAantalElementen: parsed.scheefstandAantalElementen,
      });
      // Projectgegevens, wind- en rapportinstellingen uit het bestand — elk
      // optioneel; een ouder bestand laat de huidige stand staan.
      if (parsed.projectInfo && typeof parsed.projectInfo === "object") {
        void zetInstelling("projectInfo", parsed.projectInfo);
      }
      if (parsed.windInstellingen && typeof parsed.windInstellingen === "object") {
        windGenerator.setInstellingen(parsed.windInstellingen as Partial<typeof windGenerator.instellingen>);
      }
      pasRapportSnapshotToe(parsed.rapport as Parameters<typeof pasRapportSnapshotToe>[0]);
      if (path) {
        setProjectPath(path);
        addRecentFile(path);
      }
      return overschreven;
    },
    [fem, addRecentFile, windGenerator],
  );

  const handleOpenProject = useCallback(async () => {
    if (!(await confirmUnsavedAction())) return;
    const { openProject, deserializeProject } = await import("./io/projectFile");
    const opened = await openProject();
    if (!opened) return;
    try {
      const overschreven = pasProjectToe(deserializeProject(opened.text), opened.path);
      const { notifySuccess, notifyWarning } = await import("./io/notify");
      notifySuccess("Project geopend", opened.path.split(/[\\/]/).pop());
      if (overschreven) {
        notifyWarning("Bibliotheek bijgewerkt door dit project", overschreven);
      }
    } catch (e) {
      const { notifyWarning } = await import("./io/notify");
      notifyWarning("Kan bestand niet openen", e instanceof Error ? e.message : String(e));
    }
  }, [pasProjectToe, confirmUnsavedAction]);

  /**
   * Voor de GUI-bediening: projecttekst → store, langs precies dezelfde weg.
   * De tekst komt van Rust (die mag elk pad lezen; de pagina niet).
   */
  const laadProjectTekst = useCallback(async (tekst: string, pad?: string) => {
    const { deserializeProject } = await import("./io/projectFile");
    pasProjectToe(deserializeProject(tekst), pad);
  }, [pasProjectToe]);

  /**
   * Open een project via een bekend pad (recente bestanden — backstage én
   * welkomstscherm). Zelfde route en sluitbeveiliging als Openen/Nieuw.
   */
  const handleOpenFilePath = useCallback(async (path: string) => {
    if (!(await confirmUnsavedAction())) return;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const { deserializeProject } = await import("./io/projectFile");
    const { notifyWarning, notifySuccess } = await import("./io/notify");
    try {
      const text = await readTextFile(path);
      // Zelfde route als "Openen…" — via `pasProjectToe`, de enige mapping.
      const overschreven = pasProjectToe(deserializeProject(text), path);
      notifySuccess("Project geopend", path.split(/[\\/]/).pop());
      if (overschreven) {
        notifyWarning("Bibliotheek bijgewerkt door dit project", overschreven);
      }
    } catch (e) {
      notifyWarning("Kan bestand niet openen", e instanceof Error ? e.message : String(e));
    }
  }, [pasProjectToe, confirmUnsavedAction]);

  // Bestand → Nieuw: direct een LEEG project (geen confirm, geen reload,
  // geen demo-model). Standaard belastinggevallen blijven beschikbaar zodat
  // de tab-bar en de solver-flow meteen bruikbaar zijn; undo-history wordt
  // door loadProjectState gereset. Ctrl+Z kan dus niet terug — maar het oude
  // model is via Recent/opslaan altijd nog te openen.
  const handleNewProject = useCallback(async () => {
    if (!(await confirmUnsavedAction())) return;
    baselineResetRef.current = true;
    fem.loadProjectState({
      nodes: [], beams: [], supports: [], plates: [], loads: [],
      loadCases: [
        { id: 1, name: "Permanent (G)", type: "dead" },
        { id: 2, name: "Variabel (Q)",  type: "live" },
        { id: 3, name: "Sneeuw (S)",    type: "snow" },
        { id: 4, name: "Wind (W)",      type: "wind" },
      ],
      activeLoadCaseId: 1,
      selfWeightEnabled: false,
      analysetype: "eersteOrde",
    });
    setProjectPath("");
    setActiveView("default");
  }, [fem, setActiveView, confirmUnsavedAction]);

  /**
   * De scheefstand φ die deze berekening in gaat — DE ENIGE plek waar hij
   * wordt bepaald, zodat het canvas-pad (single-LC), het multi-LC-pad en het
   * scherm nooit een ander getal kunnen tonen dan er is gerekend.
   *
   * Bij `scheefstandBron = "vast"` (de beginstand en de stand van élk bestand
   * van vóór deze keuze) is de uitkomst exact 1/noemer: het oude gedrag,
   * ongewijzigd. Kiest de gebruiker een norm, dan volgt φ uit (5.5)/(5.1) met
   * h en m uit het model — of uit de handmatige waarden die hij ervoor in de
   * plaats heeft gezet.
   */
  const scheefstandGeometrie = useMemo(
    () => leidScheefstandGeometrieAf({
      nodes: fem.nodes, beams: fem.beams, supports: fem.supports,
    }),
    [fem.nodes, fem.beams, fem.supports]);

  const scheefstandUitkomst = useMemo(
    () => bepaalScheefstand(
      {
        bron: fem.scheefstandBron,
        noemer: fem.scheefstandNoemer,
        hoogteM: fem.scheefstandHoogteM,
        aantalElementen: fem.scheefstandAantalElementen,
      },
      scheefstandGeometrie,
      toepasselijkeScheefstandNormen(fem.beams),
    ),
    [fem.scheefstandBron, fem.scheefstandNoemer, fem.scheefstandHoogteM,
     fem.scheefstandAantalElementen, scheefstandGeometrie, fem.beams]);

  // Scheefstand voor het canvas-pad (single-LC) — zelfde afleiding als het
  // multi-LC-pad in computeAndStoreSolverOutputs. Beide gaan via de NOEMER
  // van dezelfde uitkomst, zodat de twee paden bit voor bit dezelfde φ zien.
  const scheefstandInput = useMemo(() =>
    fem.scheefstandEnabled
      ? { phi: 1 / scheefstandUitkomst.noemer, richting: fem.scheefstandRichting }
      : undefined,
    [fem.scheefstandEnabled, scheefstandUitkomst.noemer, fem.scheefstandRichting]);

  /**
   * Wat de interface over de fysisch niet-lineaire stand moet zeggen: hoeveel
   * betonstaven mét wapeningskorf er zijn (zonder die staven doet de derde
   * stand niets), en of de segmentlengte het model te groot maakt (besluit B3,
   * gemeten drempel — de applicatie grijpt niet zelf in).
   */
  const betonSegmentInfo = useMemo(() => {
    const { staven } = betonStavenUitModel({ nodes: fem.nodes, beams: fem.beams });
    const dof = schatVrijheidsgraden(fem.nodes.length, staven, fem.betonSegmentLengteMm);
    return {
      aantalBetonstaven: staven.length,
      dof,
      waarschuwing:
        staven.length > 0 ? segmentWaarschuwing(dof, fem.betonSegmentLengteMm) : null,
    };
  }, [fem.nodes, fem.beams, fem.betonSegmentLengteMm]);

  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  // Solverstatus voor de StatusBar: Gereed / Berekend om HH:MM / Fout.
  const [solverStatus, setSolverStatus] = useState<SolverStatus>({ kind: "ready" });
  // STABIELE identiteit is essentieel: FemCanvas invalideert zijn resultaten
  // (mede) wanneer deze callback wisselt. Een inline arrow kreeg bij élke
  // App-render een nieuwe identiteit, waardoor resultaten direct na Berekenen
  // weer verdwenen (de setSolverOutputs-render wiste ze meteen).
  const handleSolveResult = useCallback((r: SolverResult | null) => {
    setSolverResult(r);
    // Single-LC solve geslaagd → de canvas toont resultaten, dus de StatusBar
    // meldt "Berekend om ..." — ook als de multi-LC-pipeline faalde. r === null
    // laat de status met rust: invalidatie zet hem al op "Gereed", een
    // solve-fout op "Fout" (via handleSolve).
    if (r) setSolverStatus({ kind: "solved", at: Date.now() });
  }, []);
  // Actuele canvas-zoom in % (gemeld door FemCanvas) — getoond in de StatusBar.
  const [zoomPct, setZoomPct] = useState(100);

  // HTML-rapport export — altijd werkend (browser + Tauri). Kiest het actieve
  // resultaat: combinatie indien geselecteerd, anders single-LC solverResult.
  const handleExportHtmlReport = useCallback(async () => {
    const { openReportWindow } = await import("./io/reportExport");
    let result = solverResult;
    let scopeName: string | undefined;
    if (fem.activeCombinationId != null && fem.combinationResults) {
      const r = fem.combinationResults.get(fem.activeCombinationId);
      if (r) {
        result = r;
        scopeName = fem.combinations.find(c => c.id === fem.activeCombinationId)?.name;
      }
    } else if (result) {
      scopeName = fem.loadCases.find(lc => lc.id === fem.activeLoadCaseId)?.name;
    }
    openReportWindow({
      projectName: projectPath ? projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") : undefined,
      nodes: fem.nodes,
      beams: fem.beams,
      supports: fem.supports,
      loads: fem.loads,
      loadCases: fem.loadCases,
      result,
      scopeName,
      checks: checkResults,
    });
  }, [fem, solverResult, projectPath, checkResults]);
  // IFC4-export van het rekenmodel (Structural Analysis Domain). ÉÉN bron:
  // dit object voedt zowel het IFC-tabblad als de exportknoppen, zodat wat er
  // op het scherm staat letterlijk het bestand is dat wordt weggeschreven.
  // Projectnaam en -gegevens komen uit de projectinstellingen; zonder
  // ingevulde naam valt hij terug op de bestandsnaam van het project.
  const ifcModel: IfcRekenmodelInput = useMemo(() => ({
    projectNaam: (projectPath
      ? projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "")
      : undefined) || "Naamloos project",
    project: {
      naam: projectInfo.name,
      projectnummer: projectInfo.projectNumber,
      ingenieur: projectInfo.engineer,
      bedrijf: projectInfo.company,
      locatie: projectInfo.location,
      omschrijving: projectInfo.description,
    },
    nodes: fem.nodes,
    beams: fem.beams,
    supports: fem.supports,
    loads: fem.loads,
    loadCases: fem.loadCases,
    plates: fem.plates,
    eigenGewicht: fem.selfWeightEnabled,
    aantalCombinaties: fem.combinations.length,
    combinations: fem.combinations,
    // De toetsuitslag reist mee: elke getoetste staaf krijgt in het bestand
    // de eigenschappenset OpenFEM2D_Toetsing met de maatgevende toets, het
    // normartikel en de unity check. Is er niet getoetst, dan is de lijst
    // leeg en meldt `verzamelIfcBeperkingen` dat er geen uitslag in staat.
    toetsresultaten: checkResults,
  }), [
    projectPath, projectInfo,
    fem.nodes, fem.beams, fem.supports, fem.loads, fem.loadCases,
    fem.plates, fem.selfWeightEnabled, fem.combinations, checkResults,
  ]);

  /**
   * Schrijft het IFC-bestand weg en valideert het meteen. `zonderLasten`
   * levert de knop "Export structureel": alleen het draagsysteem, zonder
   * belastinggevallen — het bestand dat je aan een BIM-model overhandigt.
   */
  const handleExportIfc = useCallback(async (zonderLasten = false) => {
    const { downloadIfc, valideerIfc, verzamelIfcBeperkingen } = await import("./io/ifcExport");
    const { notifySuccess, notifyWarning } = await import("./io/notify");
    const basis = ifcModel.project?.naam?.trim() || ifcModel.projectNaam || "rekenmodel";
    const inhoud = downloadIfc(
      ifcModel,
      `${basis}${zonderLasten ? " - structureel" : ""}.ifc`,
      { zonderLasten },
    );
    const uitslag = valideerIfc(inhoud);
    const beperkingen = verzamelIfcBeperkingen(ifcModel, { zonderLasten });
    if (uitslag.fouten.length > 0) {
      notifyWarning("IFC-export bevat fouten", uitslag.fouten.slice(0, 3).join("\n"));
    } else if (beperkingen.length > 0) {
      notifySuccess(
        "IFC geëxporteerd — met kanttekeningen",
        `${uitslag.entiteiten} entiteiten. Niet meegenomen: ${beperkingen.length} punt(en); ` +
        "zie het IFC-tabblad.",
      );
    } else {
      notifySuccess("IFC geëxporteerd", `${uitslag.entiteiten} entiteiten, geldig IFC4.`);
    }
  }, [ifcModel]);

  /** "Valideren" in het lint: controleert de export en meldt de uitslag. */
  const handleValidateIfc = useCallback(async () => {
    const { bouwIfcRekenmodel, valideerIfc, verzamelIfcBeperkingen } = await import("./io/ifcExport");
    const { notifySuccess, notifyWarning } = await import("./io/notify");
    const uitslag = valideerIfc(bouwIfcRekenmodel(ifcModel));
    const beperkingen = verzamelIfcBeperkingen(ifcModel);
    setActiveView("ifc");
    if (uitslag.fouten.length > 0) {
      notifyWarning(
        `IFC-validatie: ${uitslag.fouten.length} fout(en)`,
        uitslag.fouten.slice(0, 3).join("\n"),
      );
    } else {
      notifySuccess(
        "IFC-validatie geslaagd",
        `${uitslag.entiteiten} entiteiten, geldig IFC4.` +
        (beperkingen.length > 0
          ? ` ${beperkingen.length} punt(en) niet in IFC uitgedrukt — zie het IFC-tabblad.`
          : ""),
      );
    }
  }, [ifcModel]);

  // Model of belastingen gewijzigd → de oude uitkomst telt niet meer. Zodra
  // er live gerekend wordt volgt meteen een verse berekening in plaats van
  // een leeg canvas: de gebruiker wil het effect van zijn wijziging zien,
  // niet zijn resultaten kwijtraken.
  //
  // De vertraging vangt een reeks wijzigingen op (een knoop verslepen levert
  // tientallen updates per seconde); elke nieuwe wijziging annuleert de
  // vorige geplande berekening, zodat er pas gerekend wordt als de gebruiker
  // even stilzit.
  useEffect(() => {
    setSolverResult(null);
    // Also flip the envelope-view off; otherwise the user lingers on stale
    // envelope colors after editing the model.
    fem.setEnvelopeView(false);
    fem.setActiveCombinationId(null);
    // Normtoetsingsresultaten horen bij het oude model → wissen.
    checkClear();
    // Idem het segmentspoor van de fysisch niet-lineaire berekening: die
    // stijfheden horen bij de krachtsverdeling van het oude model.
    stijfheidClear();
    if (!liveRekenenRef.current) {
      // Nog niet gerekend: status terug naar Gereed en verder niets doen.
      setSolverStatus({ kind: "ready" });
      return;
    }
    setSolverStatus({ kind: "rekenen" });
    const id = window.setTimeout(() => { rekenDoorRef.current(); }, HERBEREKEN_VERTRAGING_MS);
    return () => window.clearTimeout(id);
    // `fem.plates` doet mee sinds platen meerekenen (P2): een dikte- of
    // meshSize-wijziging maakt ook de single-LC-resultaten ongeldig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fem.nodes, fem.beams, fem.supports, fem.loads, fem.plates]);

  // Result display toggles — lifted so both the FemCanvas HUD and the
  // FemProjectTree "Resultaten" tab can mutate the same flags.
  const [displayFlags, setDisplayFlags] = useState<DisplayFlags>(DEFAULT_DISPLAY_FLAGS);
  // Results-tab active flag — toggled door de Resultaten-tab onderaan.
  // Wanneer true: alle krachten-overlays aan (M+V+N+vervorming+reacties).
  // Wordt uit-gezet zodra de gebruiker op Model of een LC-tab klikt.
  const [resultsTabActive, setResultsTabActive] = useState(false);
  // Tab in the project-tree (verkenner) — controlled door App zodat Berekenen
  // automatisch naar "results" springt.
  const [treeTab, setTreeTab] = useState<"project" | "results">("project");
  // Grid settings (mutated by Grids dialog)
  const [grid, setGrid] = useState<GridSettings>(DEFAULT_GRID);
  const [gridsOpen, setGridsOpen] = useState(false);
  const [loadCasesOpen, setLoadCasesOpen] = useState(false);
  // Windbelastinggenerator — de hook draait de generator mee met wijzigingen
  // in de constructie (idempotent, zie windStore.ts).
  const [windGeneratorOpen, setWindGeneratorOpen] = useState(false);
  // Check-tab state.
  const [activeCode, setActiveCode] = useState<"EN1993" | "EN1995" | "EN1992">("EN1993");
  // UC-badge op het canvas geklikt → toetsingspaneel openen gefocust op die
  // staaf. Elke klik maakt een nieuw object zodat een herhaalde klik op
  // dezelfde badge opnieuw scrollt (identiteit als trigger).
  const [checkFocus, setCheckFocus] = useState<{ beamId: number } | null>(null);
  /**
   * UC-badge op het canvas aangeklikt: toon de toetsing van díé staaf naast
   * het model. `activeView` op "check" levert de split-weergave (canvas links,
   * toetsingspaneel rechts); de focus klapt de kaart van die staaf open en
   * scrollt hem in beeld.
   */
  const handleOpenCheckForBeam = useCallback((beamId: number) => {
    setCheckFocus({ beamId });
    setActiveView("check");
    // Ruimte maken voor de afleiding: het eigenschappenpaneel klapt in. Anders
    // staan er drie kolommen naast elkaar en houdt de toetsing te weinig
    // breedte over voor de formules.
    //
    // Dat inklappen wordt ONTHOUDEN als door de app gedaan, zodat het paneel
    // terugkomt zodra je de toetsing verlaat. Eerder bleef het ingeklapt: je
    // klikte één UC-badge aan en was daarna je eigenschappenpaneel kwijt, met
    // alleen nog een smalle strook waarvan niet te zien was dat je erop kon
    // klikken. Wie het paneel ZELF dichtdoet houdt het dicht — zie het effect
    // hieronder, dat alleen de eigen ingreep terugdraait.
    setRightPanelOpen((open) => {
      if (open) paneelDoorAppIngeklapt.current = true;
      return false;
    });
  }, []);
  // Normtoetsing draait ALTIJD mee met een berekening: de toetsing hoort bij
  // het resultaat en is geen losse handeling. Er is bewust geen schakelaar —
  // een model waarvan je de krachten ziet maar de unity checks niet, nodigt
  // uit tot verkeerde conclusies.
  //
  // Live rekenen gaat aan zodra er één keer met succes is gerekend. Daarna
  // levert elke modelwijziging een verse berekening in plaats van lege
  // resultaten. Vóór die eerste keer blijft het stil: een half getekend
  // model is meestal nog een mechanisme, en dan zou elke muisklik een
  // foutmelding opleveren.
  const liveRekenenRef = useRef(false);
  // Insights view mode (element-K / system-K / dof / logs / errors), controlled from Ribbon.
  const [insightsMode, setInsightsMode] = useState<"element" | "system" | "dof" | "logs" | "errors">("element");
  // Last solver error text — shown in InsightsView Errors-tab.
  const [solverErrorText] = useState<string | null>(null);
  const [loadCasesTab, setLoadCasesTab] = useState<"cases" | "combos">("cases");
  // FEM solve trigger — increments on each "Berekenen" click. FemCanvas
  // watches this and re-runs the solver against the current model.
  const [solveTrigger, setSolveTrigger] = useState(0);
  /**
   * Draai de multi-LC pipeline (alle belastinggevallen + combinaties +
   * envelope) en schrijf de uitkomst in de fem-store. Retourneert de verse
   * outputs zodat aanroepers (normtoetsing) niet op een React re-render
   * hoeven te wachten. Fouten zijn non-fataal → null.
   */
  const computeAndStoreSolverOutputs = useCallback(() => {
    try {
      // Modelmapping (doorsneden, eenheden, eigen gewicht, scheefstand) staat
      // in een pure module, zodat de app en elke tweede consument van de
      // solver exact dezelfde vertaling gebruiken — zie modelNaarSolverInput.ts.
      const multiInput = bouwMultiInput({
        nodes: fem.nodes,
        beams: fem.beams,
        supports: fem.supports,
        plates: fem.plates,
        loadCases: fem.loadCases,
        loads: fem.loads,
        selfWeightEnabled: fem.selfWeightEnabled,
        scheefstandEnabled: fem.scheefstandEnabled,
        // De NORMNOEMER, niet de ingetikte: bij `scheefstandBron = "vast"` is
        // dat exact `fem.scheefstandNoemer` (dus ongewijzigd gedrag), en bij
        // een normkeuze de 1/φ uit (5.5)/(5.1). Zo rekent het multi-LC-pad met
        // hetzelfde getal als het canvas-pad hierboven.
        scheefstandNoemer: scheefstandUitkomst.noemer,
        scheefstandRichting: fem.scheefstandRichting,
      });
      // Vanaf hier meldt de solver wat hij doet: assembly, randvoorwaarden en
      // elke Newton-Raphson-iteratie met zijn twee normen. `maakSolverLogOpvanger`
      // leegt het log eerst, zodat het paneel één berekening toont en niet twee
      // achter elkaar. De opvanger blijft daarna staan — dat kost niets zolang
      // er niet gerekend wordt, en het tweede-orde-pad rekent verderop nog door
      // vanuit `combineResults`, dat zijn eigen aanroepketen heeft.
      zetSolverLogOpvanger(maakSolverLogOpvanger());
      // Beide tweede-orde-standen lopen via hetzelfde per-combinatie-pad. De
      // fysisch niet-lineaire stand doet daar ná deze (synchrone) rekengang
      // nog een ronde overheen — zie `rekenFysischNietlineair`.
      const { perCase } = fem.analysetype !== "eersteOrde"
        ? solveAllCasesNonlinear(multiInput)
        : solveAllCases(multiInput);
      // `actieveCombinaties`, niet `combinations`: een combinatie die dit model
      // niet nodig heeft (zuiver staal → 6.15/6.16, zie lib/combinatieSelectie)
      // wordt niet doorgerekend. Alles wat resultaten toont filtert op de
      // sleutels van deze Map, dus die volgen vanzelf.
      const combinationResults = new Map(
        fem.actieveCombinaties.map(c => [c.id, combineResults(c, perCase)])
      );
      const envelope = computeEnvelope(fem.actieveCombinaties, perCase);
      const outputs = { perCase, combinationResults, envelope };
      fem.setSolverOutputs(outputs);
      return outputs;
    } catch (e) {
      console.warn("[FEM multi-LC]", e);
      fem.setSolverOutputs(null);
      return null;
    }
  }, [fem, scheefstandUitkomst.noemer]);

  /**
   * De fysisch niet-lineaire ronde over de zojuist berekende uitkomsten.
   *
   * Dit is het ENIGE asynchrone punt van de rekengang: de segmentstijfheden
   * komen uit de rekenkern (apart proces). Per COMBINATIE draait de lus uit
   * `lib/betonStijfheid.ts`; het resultaat gaat via `zetCombinatieResultaat`
   * naar dezelfde plek waar het geometrische 2e-orde-resultaat landt, zodat
   * `combineResults` en `computeEnvelope` daarna gewoon hun werk doen.
   *
   * Loopt één combinatie vast (niet geconvergeerd, of een segment zonder
   * stijfheid), dan verdwijnen ALLE resultaten. Een half fysisch niet-lineaire
   * set — sommige combinaties met de gescheurde stijfheid, andere met de
   * ongescheurde — is geen krachtsverdeling, en de melding zegt waarom.
   *
   * Retourneert de verse outputs, of null wanneer er niets te verfijnen viel
   * of de berekening niet doorging.
   */
  const rekenFysischNietlineair = useCallback(async (outputs: {
    perCase: Map<number, SolverResult>;
    combinationResults: Map<number, SolverResult>;
    envelope: ReturnType<typeof computeEnvelope>;
  }) => {
    const { notifyInfo, notifyWarning } = await import("./io/notify");
    // Dezelfde b_eff als de toetsing gebruikt: de meewerkende flensbreedte
    // stuurt ook de ONGESCHEURDE stijfheid waarmee ronde 0 begint, dus twee
    // verschillende breedtes in dezelfde rekengang zou betekenen dat de
    // krachtsverdeling en de toetsing over een andere doorsnede gaan.
    const { staven, overgeslagen } = betonStavenUitModel({
      nodes: fem.nodes,
      beams: fem.beams,
      bEffPerStaaf: bEffWaardenPerStaaf(
        await bepaalBeffPerStaaf(
          { nodes: fem.nodes, beams: fem.beams, supports: fem.supports },
          roepKern,
        ),
      ),
    });
    // Een vorige rekengang mag nooit als spoor van deze blijven staan.
    stijfheidClear();
    if (staven.length === 0) {
      notifyInfo(
        "Fysisch niet-lineair: niets te doen",
        overgeslagen.length > 0
          ? `Geen betonstaaf met wapeningskorf. ${overgeslagen.length} betonstaaf/-staven ` +
            `overgeslagen: ${overgeslagen[0].reason}. De uitkomst is die van 2e orde (P-Δ).`
          : "Het model bevat geen betonstaven met een wapeningskorf; de uitkomst " +
            "is die van 2e orde (P-Δ).",
      );
      return null;
    }
    const dof = schatVrijheidsgraden(fem.nodes.length, staven, fem.betonSegmentLengteMm);
    const waarschuwing = segmentWaarschuwing(dof, fem.betonSegmentLengteMm);
    if (waarschuwing) notifyWarning("Segmentlengte", waarschuwing);

    // Dezelfde model-invoer waarmee de synchrone gang gerekend heeft — niet
    // opnieuw opgebouwd, zodat er geen tweede vertaling van het model bestaat.
    const input = getSecondOrderInput(outputs.perCase);
    if (!input) {
      notifyWarning(
        "Fysisch niet-lineair",
        "De 2e-orde-status ontbreekt bij de resultaten; de berekening is niet uitgevoerd.",
      );
      return null;
    }
    // Het spoor voor het rapporthoofdstuk: per combinatie de segmenttabel van
    // de laatste ronde plus het convergentieverloop. Wordt pas weggeschreven
    // als ALLE combinaties gelukt zijn — een half spoor hoort bij een
    // krachtsverdeling die er niet is.
    const spoor: StijfheidCombinatie[] = [];
    try {
      // Dezelfde lijst als het lineaire pad: een niet-doorgerekende combinatie
      // hoort ook geen fysisch niet-lineaire ronde te krijgen. In een model
      // met beton valt er trouwens niets weg — de selectie grijpt alleen bij
      // een zuivere staalconstructie.
      for (const combo of fem.actieveCombinaties) {
        // Besluit B2: in de UGT rekenwaarden zonder betontrek (5.8.6(3)/(5)),
        // in de BGT gemiddelde waarden mét tension stiffening (7.4.3). De
        // grenstoestand van de combinatie bepaalt dus welk diagram de kern
        // gebruikt; nooit impliciet, en de gebruikte variant staat per
        // segment in het antwoord.
        const grenstoestand = combo.type === "sls" ? "MeanValues" : "DesignValues";
        const uit = await losCombinatieFysischOp(input, combo, staven, {
          segmentLengteMm: fem.betonSegmentLengteMm,
          grenstoestand,
        });
        if (uit.zonderLasten) continue;
        zetCombinatieResultaat(outputs.perCase, combo, uit.resultaat);
        spoor.push({
          combinatieId: combo.id,
          combinatieNaam: combo.name,
          grenstoestand,
          ronden: uit.ronden,
          verloop: uit.geschiedenis.map((g) => ({
            ronde: g.ronde,
            maxRelatieveVerandering: g.maxRelatieveVerandering,
            geconvergeerd: g.geconvergeerd,
          })),
          staven: [...uit.laatsteRonde.values()],
        });
      }
    } catch (e) {
      console.warn("[FEM fysisch niet-lineair]", e);
      fem.setSolverOutputs(null);
      notifyWarning(
        "Fysisch niet-lineaire berekening mislukt",
        e instanceof Error ? e.message : String(e),
      );
      return null;
    }
    stijfheidZet({
      segmentLengteMm: fem.betonSegmentLengteMm,
      combinaties: spoor,
      overgeslagen,
      // De doorsnede en de korf waarmee gerekend is. Alleen om te TEKENEN in de
      // PDF-uitdraai; het kernantwoord draagt ze niet, en ze uit `section_name`
      // en `reinforcement_summary` terugparsen zou een tweede waarheid zijn.
      staafdoorsneden: staven.map((s) => ({
        beamId: s.beamId,
        doorsnede: s.doorsnede,
        korf: s.korf,
      })),
    });
    const combinationResults = new Map(
      fem.actieveCombinaties.map(c => [c.id, combineResults(c, outputs.perCase)]),
    );
    const envelope = computeEnvelope(fem.actieveCombinaties, outputs.perCase);
    const verse = { perCase: outputs.perCase, combinationResults, envelope };
    fem.setSolverOutputs(verse);
    return verse;
  }, [fem, stijfheidZet, stijfheidClear]);

  /**
   * Eén run voor staal én hout: zorgt eerst voor verse combinatieresultaten
   * (zo nodig wordt het model direct doorgerekend), bouwt daarna de
   * check-inputs en invoket beide Rust-commands parallel (checkStore.run).
   * In de browser (zonder Tauri) volgt een nette melding i.p.v. een kale
   * invoke-fout.
   */
  const handleRunMemberChecks = useCallback(async (opts?: {
    openPanel?: boolean;
    outputs?: { combinationResults: Map<number, SolverResult> } | null;
  }) => {
    const openPanel = opts?.openPanel ?? true;
    const { notifyInfo, notifyWarning } = await import("./io/notify");
    // Geen omgevingscontrole meer: de toetsing loopt overal mee. In de
    // desktop-app via Tauri, in de browser via de dev-brug (zie checkStore).
    // Lukt het niet, dan meldt de check-store dat als fout — beter dan een
    // toetsing die er stilzwijgend niet is.
    if (!anyCheckableBeams(fem.beams)) {
      notifyInfo(
        "Geen toetsbare staven",
        "Het model bevat geen staalprofielen (HEA/HEB/IPE/…) en geen houtklassen (C24, GL28h, …).",
      );
      if (openPanel) setActiveView("check");
      return;
    }
    let combinationResults = opts?.outputs?.combinationResults ?? fem.combinationResults;
    if (!combinationResults) {
      combinationResults = computeAndStoreSolverOutputs()?.combinationResults ?? null;
    }
    if (!combinationResults) {
      notifyWarning(
        "Toetsing",
        "Doorrekenen mislukt — controleer het model (opleggingen, belastingen).",
      );
      return;
    }
    if (openPanel) setActiveView("check");
    await checkRun({
      nodes: fem.nodes,
      beams: fem.beams,
      // De doorbuigingstoets onderscheidt hiermee een echt tussensteunpunt van
      // een knoop waar een ligger alleen is doorgeknipt.
      supports: fem.supports,
      // De toetsbouwers zoeken hun combinaties in deze lijst (de karakteristieke
      // BGT voor de doorbuiging, de quasi-blijvende voor de kruip). Ze moet dus
      // gelijklopen met de sleutels van `combinationResults`; een combinatie
      // noemen die niet is doorgerekend levert een lege zakking op.
      combinations: fem.actieveCombinaties,
      combinationResults,
    });
  }, [fem, computeAndStoreSolverOutputs, checkRun]);

  /**
   * Eén rekengang: canvas-pad triggeren, multi-LC doorrekenen en de
   * normtoetsing er direct achteraan. Gedeeld door de knop Berekenen en de
   * live-herberekening na een modelwijziging — de knop doet daarnaast de
   * weergave-omschakeling die bij een handmatige actie hoort, want tijdens
   * het bewerken mag de app niet onder de handen van de gebruiker van tab
   * wisselen of de selectie wissen.
   */
  const rekenDoor = useCallback(() => {
    setSolveTrigger((n) => n + 1);
    const outputs = computeAndStoreSolverOutputs();
    setSolverStatus(outputs ? { kind: "solved", at: Date.now() } : { kind: "error" });
    if (outputs) {
      liveRekenenRef.current = true;
      if (fem.analysetype === "tweedeOrdeFysisch") {
        // De fysisch niet-lineaire ronde is asynchroon (de rekenkern is een
        // apart proces). De toetsing wacht erop: hij hoort op de gescheurde
        // krachtsverdeling te draaien, niet op de ongescheurde ertussenin.
        void rekenFysischNietlineair(outputs).then((verse) => {
          void handleRunMemberChecks({ openPanel: false, outputs: verse ?? outputs });
        });
      } else {
        // Er is NIET fysisch gerekend: een segmentspoor van een vorige
        // rekengang zou dan bij een andere krachtsverdeling horen dan die nu
        // op het scherm staat. Het invalidatie-effect kijkt alleen naar het
        // model, en het analysetype staat daar niet in.
        stijfheidClear();
        // De normtoetsing hoort bij het resultaat en loopt altijd mee.
        void handleRunMemberChecks({ openPanel: false, outputs });
      }
    }
    return outputs;
  }, [
    fem.analysetype, computeAndStoreSolverOutputs, handleRunMemberChecks,
    rekenFysischNietlineair, stijfheidClear,
  ]);

  // Het invalidatie-effect leest deze functie uit een ref: zou het effect op
  // `rekenDoor` deppen, dan startte het opnieuw bij elke modelwijziging (die
  // verandert `fem` en dus de callback-identiteit) en herberekende het zich
  // in een kringetje.
  const rekenDoorRef = useRef(rekenDoor);
  useEffect(() => { rekenDoorRef.current = rekenDoor; }, [rekenDoor]);

  // Het rapport hoort cijfers te tonen, geen lege tabellen. Wie de
  // rapportweergave opent zonder verse resultaten, krijgt ze meteen: dan
  // rekent de app eerst door. Mislukt dat, dan blijft `combinationResults`
  // leeg en probeert dit effect het niet opnieuw — de melding daarover komt
  // uit de rekengang zelf.
  useEffect(() => {
    if (activeView !== "report") return;
    if (fem.combinationResults) return;
    rekenDoorRef.current();
  }, [activeView, fem.combinationResults]);

  const handleSolve = useCallback(() => {
    // Make sure the user is looking at the canvas (not the report/IFC view).
    setActiveView("default");
    // Spring direct naar de Resultaten-tab in BEIDE plekken:
    //   1. verkenner (FemProjectTree) — links
    //   2. belastinggevallen-strip (LoadCaseTabBar) — onder
    setTreeTab("results");
    setResultsTabActive(true);
    // Zet alle resultaten-overlays standaard aan zodat M/V/N + reacties +
    // vervorming meteen zichtbaar zijn op de canvas. De unity checks horen
    // daarbij: de toetsing loopt altijd mee met de berekening, dus de badges
    // horen er ook te staan — en zij zijn de ingang naar de afleiding per
    // staaf (klikken opent die naast het model).
    setDisplayFlags(prev => ({ ...prev, M: true, V: true, N: true, deflection: true, reactions: true, uc: true }));
    // Clear selection so the results overlay isn't visually competing with
    // selection-halos. User wants a clean view after computing.
    fem.setSelection(null);
    // Rekenen + toetsen; vanaf nu blijft het model live.
    rekenDoor();
  }, [fem, rekenDoor]);

  // Keyboard: Ctrl+Z / Ctrl+Y for undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        fem.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        fem.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fem]);

  // C1: Ctrl+S / Cmd+S = Opslaan, Ctrl+Shift+S = Opslaan als. Altijd
  // preventDefault zodat de browser-save-dialoog nooit verschijnt; opslaan
  // mag óók vuren terwijl een input/dialog focus heeft.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) void handleSaveProjectAs();
        else void handleSaveProject();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSaveProject, handleSaveProjectAs]);

  // C2: dirty-detectie. Draait alléén wanneer persisteerbare modelstate
  // wijzigt (array-identiteiten veranderen per mutatie), nooit per render —
  // de JSON-vergelijking is dus event-gedreven en goedkoop.
  useEffect(() => {
    const json = modelJson(buildProjectSnapshot());
    if (baselineResetRef.current || lastSavedRef.current === null) {
      baselineResetRef.current = false;
      lastSavedRef.current = json;
      setDirty(false);
      return;
    }
    setDirty(json !== lastSavedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fem.nodes, fem.beams, fem.supports, fem.plates, fem.loads,
      fem.loadCases, fem.activeLoadCaseId, fem.selfWeightEnabled,
      fem.analysetype, fem.betonSegmentLengteMm,
      // v2: combinaties + stramien + scheefstand reizen mee in de snapshot-JSON.
      fem.combinations, fem.structuralGrid,
      fem.scheefstandEnabled, fem.scheefstandNoemer, fem.scheefstandRichting,
      // De normkeuze staat óók in de snapshot; zonder deze drie zou een
      // gewijzigde scheefstandbron het bestand niet als "gewijzigd" markeren
      // en stil verloren gaan bij het afsluiten.
      fem.scheefstandBron, fem.scheefstandHoogteM, fem.scheefstandAantalElementen]);

  // C2: sluitbeveiliging. Tauri: onCloseRequested + native dialoog (dekt de
  // titelbalk-sluitknop, Bestand → Afsluiten en Alt+F4). Browser: beforeunload.
  const confirmUnsavedRef = useRef(confirmUnsavedAction);
  useEffect(() => { confirmUnsavedRef.current = confirmUnsavedAction; });
  useEffect(() => {
    if (isTauriApp()) {
      let unlisten: (() => void) | undefined;
      let disposed = false;
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested(async (event) => {
            if (!isDirtyRef.current) return;
            const proceed = await confirmUnsavedRef.current();
            if (!proceed) event.preventDefault();
          })
        )
        .then((u) => { if (disposed) u(); else unlisten = u; })
        .catch(() => {});
      return () => { disposed = true; unlisten?.(); };
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // C2: wijzigingsindicator in de venster-/tabtitel ("● bestandsnaam").
  // Zonder pad: "Naamloos project" — zelfde tekst als de DocumentBar-tab,
  // zodat venstertitel en documenttab nooit verschillende namen tonen.
  useEffect(() => {
    const name = projectPath ? projectPath.split(/[\\/]/).pop() : "Naamloos project";
    document.title = `${isDirty ? "● " : ""}${name} — Open FEM2D Studio`;
  }, [isDirty, projectPath]);

  // Startvenster verwijderd op verzoek: de app opent direct in het model.

  // Left panel state (Explorer)
  const [leftPanelWidth, setLeftPanelWidth] = useState(240);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const isLeftResizing = useRef(false);

  // Right panel state (Properties)
  const [rightPanelWidth, setRightPanelWidth] = useState(240);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const isRightResizing = useRef(false);
  /**
   * Heeft de APP het eigenschappenpaneel ingeklapt, of de gebruiker zelf?
   *
   * Alleen het eerste wordt teruggedraaid bij het verlaten van de toetsing.
   * Zonder dit onderscheid zou het paneel zich opdringen aan wie het bewust
   * dicht heeft gezet.
   */
  const paneelDoorAppIngeklapt = useRef(false);

  /**
   * Verlaat je de toetsing, dan komt het eigenschappenpaneel terug — maar
   * alleen als de app het zelf had ingeklapt om ruimte te maken.
   */
  useEffect(() => {
    if (activeView === "check") return;
    if (!paneelDoorAppIngeklapt.current) return;
    paneelDoorAppIngeklapt.current = false;
    setRightPanelOpen(true);
  }, [activeView]);

  // Onderpaneel (Betonstaaf) — het derde dock, onder de tekening en over de
  // volle breedte. Zelfde drie stukken state als de zijpanelen: een maat, een
  // open/dicht-vlag en een ref voor het slepen.
  const [bottomPanelHeight, setBottomPanelHeight] = useState(380);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const isBottomResizing = useRef(false);
  /**
   * Heeft de GEBRUIKER het venster dichtgedaan?
   *
   * Zo ja, dan blijft het dicht bij de volgende betonstaaf die hij aanklikt —
   * anders duwt het zich bij elke selectie opnieuw op. Zelfde onderscheid als
   * `paneelDoorAppIngeklapt` hierboven maakt, alleen andersom: dáár gaat het
   * om wat de app zelf heeft dichtgeklapt, hier om wat de gebruiker zelf koos.
   */
  const bottomDoorGebruikerGesloten = useRef(false);

  const [isResizing, setIsResizing] = useState(false);

  // ── Tabel als split-view: canvas links, tabel rechts (start 50/50) ──────
  // De scheidingsbalk is versleepbaar (zelfde patroon als leftPanelWidth);
  // percentage van de beschikbare breedte zodat venster-resize netjes schaalt.
  const [tableSplitPct, setTableSplitPct] = useState(50);
  const splitWrapRef = useRef<HTMLDivElement>(null);
  const isSplitResizing = useRef(false);

  useEffect(() => {
    getSetting("theme", "light").then((saved) => {
      setTheme(saved);
      applyTheme(saved);
    });
    // Welcome modal is no longer auto-shown — the persistent StartSidebar
    // replaces it. Users can still open it via the help menu.
    getSetting("showWelcome", false).then((show) => {
      if (show) setWelcomeOpen(true);
    });
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().show();
    }).catch(() => {});
  }, []);

  // Left panel resize handler
  const handleLeftResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isLeftResizing.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isLeftResizing.current) return;
      const newWidth = Math.max(160, Math.min(480, ev.clientX));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isLeftResizing.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Right panel resize handler
  const handleRightResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isRightResizing.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isRightResizing.current) return;
      const newWidth = Math.max(160, Math.min(480, window.innerWidth - ev.clientX));
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isRightResizing.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Onderpaneel verslepen. Zelfde patroon als de twee handlers hierboven; het
  // paneel groeit naar BOVEN, dus de hoogte is de afstand van de muis tot de
  // onderkant van het venster en niet omgekeerd.
  const handleBottomResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isBottomResizing.current = true;
    setIsResizing(true);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isBottomResizing.current) return;
      const nieuw = Math.max(140, Math.min(window.innerHeight - 220, window.innerHeight - ev.clientY));
      setBottomPanelHeight(nieuw);
    };

    const handleMouseUp = () => {
      isBottomResizing.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Split-divider tussen canvas en tabel (Tabel-weergave) verslepen.
  const handleSplitResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isSplitResizing.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isSplitResizing.current) return;
      const rect = splitWrapRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setTableSplitPct(Math.max(20, Math.min(80, pct)));
    };

    const handleMouseUp = () => {
      isSplitResizing.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Volledige-breedteweergaven verbergen de zijpanelen. De toetsing hoort daar
  // NIET bij: klikken op een UC-badge moet de toetsing van díé staaf NAAST het
  // model tonen, niet in de plaats daarvan. Zo blijft het model in beeld
  // terwijl je de afleiding leest, en zie je welke staaf je voor je hebt.
  const isFullWidthView = activeView === "viewer" || activeView === "ifc" || activeView === "report" || activeView === "insights";

  /**
   * De geselecteerde BETONstaaf, of `null`.
   *
   * Alleen bij één staaf: het venster onderin toont één aanzicht met één
   * doorsnede, en bij een groepsselectie zou het willekeurig één staaf moeten
   * kiezen. Herkenning gaat via `matchSupportedConcreteClass` — dezelfde
   * functie waarmee de toetsing en de staafeigenschappen een betonstaaf
   * herkennen, zodat het venster niet opengaat bij een staaf die de
   * betontoetsing vervolgens overslaat.
   */
  const geselecteerdeBetonStaaf = useMemo(() => {
    const sel = fem.selection;
    const id =
      sel?.type === "beam"
        ? sel.id
        : sel?.type === "multi" &&
            sel.beamIds.length === 1 &&
            sel.nodeIds.length === 0 &&
            sel.plateIds.length === 0
          ? sel.beamIds[0]
          : null;
    if (id === null) return null;
    const staaf = fem.beams.find((b) => b.id === id);
    if (!staaf) return null;
    return matchSupportedConcreteClass(staaf.material) !== null ? staaf : null;
  }, [fem.selection, fem.beams]);

  // Het venster opent bij het selecteren van een betonstaaf — tenzij de
  // gebruiker het zelf had dichtgedaan; dat onthoudt het.
  useEffect(() => {
    if (!geselecteerdeBetonStaaf) return;
    if (bottomDoorGebruikerGesloten.current) return;
    setBottomPanelOpen(true);
  }, [geselecteerdeBetonStaaf]);

  const renderMainContent = () => {
    switch (activeView) {
      case "ifc":
        return <IfcViewerPanel model={ifcModel} />;
      case "report":
        // Doorgeef-regels naar het live rapport (ReportDataContext) — de
        // secties lezen deze modelstate en volgen elke wijziging direct.
        return <ReportPreview data={reportData} onDetach={handleDetachReport} />;
      case "insights":
        return <InsightsView nodes={fem.nodes} beams={fem.beams} supports={fem.supports} initialMode={insightsMode} solverError={solverErrorText} />;
      case "viewer":
        return (
          <Suspense fallback={<div className="placeholder"><p>Loading 3D Viewer...</p></div>}>
            <ThreeViewer />
          </Suspense>
        );
      default: {
        // FEM canvas (Start-tab). In de Tabel-weergave wordt dit een
        // split-view: canvas links, tabel rechts, met een versleepbare
        // scheidingsbalk — het model blijft zichtbaar terwijl je in de
        // tabel werkt en rij-selectie licht direct op in het canvas.
        // De canvas staat in beide gevallen op dezelfde plek in de boom,
        // dus zoom/selectie overleven het wisselen tussen Start en Tabel.
        const isTableSplit = activeView === "table";
        // Toetsing naast het model: klikken op een UC-badge opent de volledige
        // afleiding van die staaf rechts, met het model links in beeld.
        const isCheckSplit = activeView === "check";
        const isSplit = isTableSplit || isCheckSplit;
        return (
          <div className="canvas-split" ref={splitWrapRef}>
            <div
              className="canvas-split-canvas"
              style={isSplit ? { flex: `0 0 ${tableSplitPct}%` } : undefined}
            >
              <FemCanvas
                tool={femTool}
                onToolChange={setFemTool}
                solveTrigger={solveTrigger}
                scheefstand={scheefstandInput}
                onSolveResult={handleSolveResult}
                nodes={fem.nodes}
                beams={fem.beams}
                supports={fem.supports}
                plates={fem.plates}
                loads={fem.loads}
                selection={fem.selection}
                activeLoadCaseId={fem.activeLoadCaseId}
                showLoads={fem.showLoads}
                setPendingLoadFocus={fem.setPendingLoadFocus}
                setSelection={fem.setSelection}
                addNode={fem.addNode}
                updateNode={fem.updateNode}
                addBeam={fem.addBeam}
                updateBeam={fem.updateBeam}
                addPlate={fem.addPlate}
                addSupport={fem.addSupport}
                addLoad={fem.addLoad}
                updateLoad={fem.updateLoad}
                deleteSelected={fem.deleteSelected}
                splitBeamAt={fem.splitBeamAt}
                addNodeMetSplitsing={fem.addNodeMetSplitsing}
                verbindKnoopMetStaaf={fem.verbindKnoopMetStaaf}
                voegKnopenSamen={fem.voegKnopenSamen}
                herstelModel={fem.herstelModel}
                translateSelection={fem.translateSelection}
                copySelection={fem.copySelection}
                rotateSelection={fem.rotateSelection}
                mirrorSelection={fem.mirrorSelection}
                plakLasten={fem.plakLasten}
                translateNodes={fem.translateNodes}
                structuralGrid={fem.structuralGrid}
                setStructuralGrid={fem.setStructuralGrid}
                verplaatsStramienAs={fem.verplaatsStramienAs}
                grid={grid}
                combinations={fem.actieveCombinaties}
                activeCombinationId={fem.activeCombinationId}
                envelopeView={fem.envelopeView}
                combinationResults={fem.combinationResults}
                envelope={fem.envelope}
                displayFlags={displayFlags}
                setDisplayFlags={setDisplayFlags}
                resultsMode={resultsTabActive}
                onZoomChange={setZoomPct}
                onOpenCheckForBeam={handleOpenCheckForBeam}
              />
            </div>
            {isCheckSplit && (
              <>
                <div
                  className="canvas-split-divider"
                  onMouseDown={handleSplitResizeMouseDown}
                  title="Sleep om de verdeling model/toetsing aan te passen"
                />
                <div className="canvas-split-table">
                  {/* Toetsing van de aangeklikte staaf, naast het model. De
                      focus komt van de UC-badge op het canvas: die klapt de
                      kaart van die staaf open en scrollt hem in beeld. */}
                  <CheckPanel
                    onRun={() => { void handleRunMemberChecks(); }}
                    focus={checkFocus}
                  />
                </div>
              </>
            )}
            {isTableSplit && (
              <>
                <div
                  className="canvas-split-divider"
                  onMouseDown={handleSplitResizeMouseDown}
                  title="Sleep om de verdeling canvas/tabel aan te passen"
                />
                <div className="canvas-split-table">
                  {/* Tabel-editor (ribbon-tab "Tabel") — model en lasten als
                      bewerkbare tabellen, resultaten alleen-lezen. Zelfde
                      store-mutators als het canvas, dus selectie/undo werken
                      gewoon door. */}
                  <TableView
                    dataset={tableDataset}
                    apiRef={tableApiRef}
                    nodes={fem.nodes}
                    beams={fem.beams}
                    plates={fem.plates}
                    supports={fem.supports}
                    loads={fem.loads}
                    loadCases={fem.loadCases}
                    activeLoadCaseId={fem.activeLoadCaseId}
                    selection={fem.selection}
                    setSelection={fem.setSelection}
                    addNode={fem.addNode}
                    updateNode={fem.updateNode}
                    removeNode={fem.removeNode}
                    addBeam={fem.addBeam}
                    updateBeam={fem.updateBeam}
                    removeBeam={fem.removeBeam}
                    updatePlate={fem.updatePlate}
                    removePlate={fem.removePlate}
                    addSupport={fem.addSupport}
                    removeSupport={fem.removeSupport}
                    addLoad={fem.addLoad}
                    updateLoad={fem.updateLoad}
                    removeLoad={fem.removeLoad}
                    combinations={fem.actieveCombinaties}
                    combinationResults={fem.combinationResults}
                    caseResults={fem.multiLcResult}
                    envelope={fem.envelope}
                  />
                </div>
              </>
            )}
          </div>
        );
      }
    }
  };

  // Het bedieningskanaal. Ná alle closures hierboven, want het krijgt ze mee;
  // luistert alleen als Rust zegt dat OPENAEC_GUI_CONTROL=1 gezet was.
  const bedieningActief = useBediening({
    fem,
    activeView,
    selection: fem.selection,
    setSelection: fem.setSelection,
    setActiveView,
    setBottomPanelOpen,
    handleRunMemberChecks,
    computeAndStoreSolverOutputs,
    createDetachedWindow,
    laadProjectTekst,
  });

  return (
    <>
      <TitleBar
        onSettingsClick={() => setSettingsOpen(true)}
        onFeedbackClick={() => setFeedbackOpen(true)}
        onSaveClick={() => { void handleSaveProject(); }}
        onUndoClick={fem.undo}
        onRedoClick={fem.redo}
        canUndo={fem.canUndo}
        canRedo={fem.canRedo}
        onPrintClick={() => setActiveView("report")}
      />
      <ToastHost />
      {/* R5 — houdt losgekoppelde rapportvensters synchroon met het model,
          de solver-uitkomsten, de toetsresultaten en de rapportinstellingen.
          Altijd gemonteerd (ook buiten het Rapport-tabblad), zodat het
          losgekoppelde venster live blijft terwijl hier gemodelleerd wordt. */}
      <ReportWindowSync data={reportData} />
      <Ribbon
        onFileTabClick={() => setBackstageOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
        onProjectSettingsClick={() => setProjectSettingsOpen(true)}
        theme={theme}
        onThemeSelect={handleThemeSelect}
        onOpenLibrary={(tab) => { setLibraryTab(tab); setLibraryOpen(true); }}
        activeView={activeView}
        onViewChange={setActiveView}
        femTool={femTool}
        onFemToolChange={setFemTool}
        onSolve={handleSolve}
        onShowEnvelope={() => {
          fem.setEnvelopeView(true);
          fem.setActiveCombinationId(null);
          setActiveView("default");
        }}
        hasEnvelope={fem.envelope !== null}
        hasResults={solverResult !== null || fem.envelope !== null}
        onDelete={fem.deleteSelected}
        onUndo={fem.undo}
        onRedo={fem.redo}
        canUndo={fem.canUndo}
        canRedo={fem.canRedo}
        onOpenGrids={() => setGridsOpen(true)}
        onOpenLoadCases={() => { setLoadCasesTab("cases"); setLoadCasesOpen(true); }}
        onOpenLoadCombinations={() => { setLoadCasesTab("combos"); setLoadCasesOpen(true); }}
        onOpenWindGenerator={() => setWindGeneratorOpen(true)}
        onExportHtml={handleExportHtmlReport}
        onExportIfc={() => { void handleExportIfc(false); }}
        onExportIfcStructural={() => { void handleExportIfc(true); }}
        onValidateIfc={() => { void handleValidateIfc(); }}
        onOpenIfcView={() => setActiveView("ifc")}
        onFilterSelection={() => {
          // Filter current selection: if multi-selection, keep only the first
          // type (nodes / beams / plates) — quickest visible effect for now.
          const sel = fem.selection as any;
          if (sel && sel.type === "multi") {
            if (sel.nodeIds.length > 0)        fem.setSelection({ type: "node", id: sel.nodeIds[0] } as any);
            else if (sel.beamIds.length > 0)   fem.setSelection({ type: "beam", id: sel.beamIds[0] } as any);
            else if (sel.plateIds.length > 0)  fem.setSelection({ type: "plate", id: sel.plateIds[0] } as any);
          }
        }}
        onRunMemberChecks={() => { void handleRunMemberChecks(); }}
        checksRunning={checksRunning}
        onOpenCheckPanel={() => setActiveView(activeView === "check" ? "default" : "check")}
        checkPanelActive={activeView === "check"}
        activeCode={activeCode}
        onSelectCode={setActiveCode}
        resultsPanelActive={resultsTabActive}
        onToggleResultsPanel={() => {
          const next = !resultsTabActive;
          setResultsTabActive(next);
          setTreeTab(next ? "results" : "project");
          if (next) setDisplayFlags(f => ({ ...f, M: true, V: true, N: true, deflection: true, reactions: true }));
        }}
        onExportCheck={async () => {
          // Exporteert de toetsing zoals die in het paneel staat — dezelfde
          // Rust-uitkomst, geen tweede berekening met eigen aannames.
          const { exportCheckResultsCsv } = await import("./io/steelCheck");
          const { notifyInfo } = await import("./io/notify");
          if (checkResults.length === 0) {
            notifyInfo(
              "Nog geen toetsing",
              "Reken het model eerst door; de normtoetsing loopt dan mee en is daarna te exporteren.",
            );
            return;
          }
          exportCheckResultsCsv(checkResults, checkSkipped);
        }}
        onShowInsightsMode={(m) => { setInsightsMode(m); setActiveView("insights"); }}
        onExportMatrixCsv={async () => {
          try {
            const { exportMatricesAsCsv } = await import("./io/matrixExport");
            exportMatricesAsCsv(fem.nodes, fem.beams, fem.supports);
          } catch (e) { console.error("CSV export failed:", e); }
        }}
        onNewProject={() => { void handleNewProject(); }}
        onOpenProject={() => { void handleOpenProject(); }}
        onSaveProject={() => { void handleSaveProject(); }}
        onSaveProjectAs={() => { void handleSaveProjectAs(); }}
        tableDataset={tableDataset}
        onTableDataset={handleTableDataset}
        onTableExportCsv={() => invokeTableApi("exportCsv")}
        onTableCopy={() => invokeTableApi("copyTable")}
        onTableFocusFilter={() => invokeTableApi("focusFilter")}
      />
      <DocumentBar
        fileName={projectPath ? projectPath.split(/[\\/]/).pop() : undefined}
        modified={isDirty}
      />
      <div className="content">
        {/* Left panel — Explorer (hidden in full-width views) */}
        {!isFullWidthView && (
          <aside className={`left-panel${leftPanelOpen ? "" : " collapsed"}${isResizing ? " no-transition" : ""}`} style={{ width: leftPanelOpen ? leftPanelWidth : 28 }}>
            {leftPanelOpen ? (
              <>
                <div className="left-panel-toolbar">
                  <span className="left-panel-title">{t("explorer")}</span>
                  <button className="left-panel-close-btn" onClick={() => setLeftPanelOpen(false)} title={t("close")}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A1.5 1.5 0 013.5 1h9A1.5 1.5 0 0114 2.5v11a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5v-11zM3.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5H6V2H3.5zM7 2v12h5.5a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5H7z" /></svg>
                  </button>
                </div>
                <div className="left-panel-body">
                  <FemProjectTree
                    nodes={fem.nodes}
                    beams={fem.beams}
                    supports={fem.supports}
                    plates={fem.plates}
                    loads={fem.loads}
                    loadCases={fem.loadCases}
                    activeLoadCaseId={fem.activeLoadCaseId}
                    selection={fem.selection}
                    setSelection={fem.setSelection}
                    setActiveLoadCaseId={(id) => {
                      // Selecting an LC = leave combination/envelope view, show LC's loads
                      fem.setActiveLoadCaseId(id);
                      fem.setActiveCombinationId(null);
                      fem.setEnvelopeView(false);
                      fem.setShowLoads(true);
                      setResultsTabActive(false);
                    }}
                    addLoadCase={fem.addLoadCase}
                    combinations={fem.combinations}
                    overgeslagenCombinaties={fem.overgeslagenCombinaties}
                    activeCombinationId={fem.activeCombinationId}
                    setActiveCombinationId={(id) => {
                      // Picking a combination must enable the results overlay
                      // path: ensure showLoads is true and the bottom Resultaten-
                      // tab is highlighted so the user sees the change land.
                      fem.setActiveCombinationId(id);
                      if (id !== null) {
                        fem.setEnvelopeView(false);
                        fem.setShowLoads(true);
                        setResultsTabActive(true);
                        // Default all relevant overlays on so the change is visible.
                        setDisplayFlags(prev => ({ ...prev, M: true, V: true, N: true, deflection: true, reactions: true }));
                      }
                    }}
                    envelopeView={fem.envelopeView}
                    setEnvelopeView={(v) => {
                      fem.setEnvelopeView(v);
                      if (v) {
                        fem.setActiveCombinationId(null);
                        fem.setShowLoads(true);
                        setResultsTabActive(true);
                        setDisplayFlags(prev => ({ ...prev, M: true, V: true, N: true, deflection: true, reactions: true }));
                      }
                    }}
                    envelope={fem.envelope}
                    displayFlags={displayFlags}
                    setDisplayFlags={setDisplayFlags}
                    hasResults={solverResult !== null || fem.envelope !== null}
                    activeTab={treeTab}
                    setActiveTab={setTreeTab}
                  />
                </div>
                <div className="left-panel-resize" onMouseDown={handleLeftResizeMouseDown} />
              </>
            ) : (
              <button className="left-panel-collapsed-tab" onClick={() => setLeftPanelOpen(true)} title={t("explorer")}>
                <span>{t("explorer")}</span>
              </button>
            )}
          </aside>
        )}

        <main className="main-view">
          {renderMainContent()}
        </main>

        {/* Right panel — Properties (hidden in full-width views) */}
        {!isFullWidthView && (
          <aside className={`right-panel${rightPanelOpen ? "" : " collapsed"}${isResizing ? " no-transition" : ""}`} style={{ width: rightPanelOpen ? rightPanelWidth : 28 }}>
            {rightPanelOpen ? (
              <>
                <div className="right-panel-resize" onMouseDown={handleRightResizeMouseDown} />
                <div className="right-panel-toolbar">
                  <span className="right-panel-title">{t("properties")}</span>
                  <button className="right-panel-close-btn" onClick={() => setRightPanelOpen(false)} title={t("close")}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A1.5 1.5 0 013.5 1h9A1.5 1.5 0 0114 2.5v11a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5v-11zM3.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5H9V2H3.5zM10 2v12h2.5a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5H10z" /></svg>
                  </button>
                </div>
                <div className="right-panel-body">
                  <FemProperties
                    selection={fem.selection}
                    nodes={fem.nodes}
                    beams={fem.beams}
                    plates={fem.plates}
                    supports={fem.supports}
                    loads={fem.loads}
                    updateNode={fem.updateNode}
                    updateBeam={fem.updateBeam}
                    updateBeams={fem.updateBeams}
                    updatePlate={fem.updatePlate}
                    addSupport={fem.addSupport}
                    removeSupport={fem.removeSupport}
                    updateLoad={fem.updateLoad}
                    pendingLoadFocus={fem.pendingLoadFocus}
                    clearPendingLoadFocus={() => fem.setPendingLoadFocus(null)}
                    results={solverResult}
                  />
                </div>
              </>
            ) : (
              <button className="right-panel-collapsed-tab" onClick={() => setRightPanelOpen(true)} title={t("properties")}>
                <span>{t("properties")}</span>
              </button>
            )}
          </aside>
        )}
      </div>

      {/* Onderpaneel — het betonvenster. Het staat NAAST `.content` en niet
          erin: alleen zo beslaat het de volle breedte onder de tekening, zoals
          een dekkingslijn hem nodig heeft. Het verschijnt bij een geselecteerde
          betonstaaf en verdwijnt weer bij het loslaten van die selectie: het
          venster hoort bij die ene staaf. */}
      {!isFullWidthView && geselecteerdeBetonStaaf && (
        <aside
          className={`bottom-panel${bottomPanelOpen ? "" : " collapsed"}${isResizing ? " no-transition" : ""}`}
          style={{ height: bottomPanelOpen ? bottomPanelHeight : 26 }}
        >
          {bottomPanelOpen ? (
            <>
              <div
                className="bottom-panel-resize"
                onMouseDown={handleBottomResizeMouseDown}
                title="Sleep om het betonvenster hoger of lager te maken"
              />
              <div className="bottom-panel-body">
                <BetonStaafVenster
                  key={geselecteerdeBetonStaaf.id}
                  beam={geselecteerdeBetonStaaf}
                  nodes={fem.nodes}
                  supports={fem.supports}
                  updateBeam={fem.updateBeam}
                  beams={fem.beams}
                  onSluiten={() => {
                    bottomDoorGebruikerGesloten.current = true;
                    setBottomPanelOpen(false);
                  }}
                />
              </div>
            </>
          ) : (
            <button
              className="bottom-panel-collapsed-tab"
              onClick={() => {
                bottomDoorGebruikerGesloten.current = false;
                setBottomPanelOpen(true);
              }}
              title="Betonstaaf — aanzicht, doorsnede en dekkingslijnen"
            >
              <span>{`Betonstaaf ${geselecteerdeBetonStaaf.id} — dekkingslijnen`}</span>
            </button>
          )}
        </aside>
      )}

      {/* Load case tab strip — hidden on full-width IFC/Report views. */}
      {!isFullWidthView && (
        <LoadCaseTabBar
          loadCases={fem.loadCases}
          activeLoadCaseId={fem.activeLoadCaseId}
          setActiveLoadCaseId={(id) => { fem.setActiveLoadCaseId(id); setResultsTabActive(false); }}
          addLoadCase={fem.addLoadCase}
          loads={fem.loads}
          selfWeightEnabled={fem.selfWeightEnabled}
          setSelfWeightEnabled={fem.setSelfWeightEnabled}
          analysetype={fem.analysetype}
          setAnalysetype={fem.setAnalysetype}
          betonSegmentLengteMm={fem.betonSegmentLengteMm}
          setBetonSegmentLengteMm={fem.setBetonSegmentLengteMm}
          aantalBetonstaven={betonSegmentInfo.aantalBetonstaven}
          segmentWaarschuwing={betonSegmentInfo.waarschuwing}
          scheefstandEnabled={fem.scheefstandEnabled}
          setScheefstandEnabled={fem.setScheefstandEnabled}
          scheefstandNoemer={fem.scheefstandNoemer}
          setScheefstandNoemer={fem.setScheefstandNoemer}
          scheefstandRichting={fem.scheefstandRichting}
          setScheefstandRichting={fem.setScheefstandRichting}
          scheefstandBron={fem.scheefstandBron}
          setScheefstandBron={fem.setScheefstandBron}
          scheefstandHoogteM={fem.scheefstandHoogteM}
          setScheefstandHoogteM={fem.setScheefstandHoogteM}
          scheefstandAantalElementen={fem.scheefstandAantalElementen}
          setScheefstandAantalElementen={fem.setScheefstandAantalElementen}
          // De uitkomst en de afleiding gaan als GEGEVEN mee naar de balk: de
          // balk toont wat er is gerekend en rekent niets zelf, zodat er geen
          // tweede plek is waar φ kan ontstaan.
          scheefstandPhiNoemer={scheefstandUitkomst.noemer}
          scheefstandAfgeleideHoogteM={scheefstandGeometrie.hoogteM}
          scheefstandAfgeleidAantal={scheefstandGeometrie.aantalElementen}
          scheefstandToelichting={
            scheefstandToelichting(scheefstandUitkomst, scheefstandGeometrie)
          }
          scheefstandWaarschuwingen={scheefstandUitkomst.waarschuwingen}
          showLoads={fem.showLoads}
          setShowLoads={(v) => { fem.setShowLoads(v); setResultsTabActive(false); }}
          hasResults={solverResult !== null || fem.envelope !== null}
          resultsActive={resultsTabActive}
          onShowResults={() => {
            setResultsTabActive(true);
            fem.setShowLoads(true);
            setDisplayFlags({
              ...displayFlags,
              M: true, V: true, N: true,
              deflection: true,
              reactions: true,
            });
          }}
        />
      )}
      <StatusBar
        nodeCount={fem.nodes.length}
        beamCount={fem.beams.length}
        loadCount={fem.loads.length}
        zoomPct={activeView === "default" ? zoomPct : undefined}
        solverStatus={solverStatus}
        // Snapknopjes horen bij de tekenweergave; in de rapport-/IFC-weergave
        // valt er niets te snappen.
        toonSnap={!isFullWidthView}
        bedieningActief={bedieningActief}
      />
      <Backstage
        open={backstageOpen}
        onClose={() => setBackstageOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFile={(path) => { void handleOpenFilePath(path); }}
        onNew={() => { void handleNewProject(); }}
        onOpen={() => { void handleOpenProject(); }}
        onSave={() => { void handleSaveProject(); }}
        onSaveAs={() => { void handleSaveProjectAs(); }}
      />
      <LoadCasesDialog
        open={loadCasesOpen}
        onClose={() => setLoadCasesOpen(false)}
        initialTab={loadCasesTab}
        loadCases={fem.loadCases}
        combinations={fem.combinations}
        overgeslagenCombinaties={fem.overgeslagenCombinaties}
        addLoadCase={fem.addLoadCase}
        updateLoadCase={fem.updateLoadCase}
        removeLoadCase={fem.removeLoadCase}
        addCombination={fem.addCombination}
        updateCombination={fem.updateCombination}
        removeCombination={fem.removeCombination}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} onThemeChange={setTheme} />
      <LibraryDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} initialTab={libraryTab} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <ProjectSettingsDialog open={projectSettingsOpen} onClose={() => setProjectSettingsOpen(false)} />
      {/* Windbelastinggenerator (EN 1991-1-4 + NL NB) — invoer, controleerbare
          samenvatting en het wegschrijven van gevallen/lasten/combinaties. */}
      <WindGeneratorDialog
        open={windGeneratorOpen}
        onClose={() => setWindGeneratorOpen(false)}
        wind={windGenerator}
      />
      {welcomeOpen && (
        <WelcomeScreen
          onClose={() => setWelcomeOpen(false)}
          onNewProject={() => { void handleNewProject(); }}
          onOpenProject={() => { void handleOpenProject(); }}
          onOpenFile={(path) => { void handleOpenFilePath(path); }}
        />
      )}
      {/* Grids dialog — right-docked sheet, controls grid show/hide/spacing + stramien */}
      {!isFullWidthView && (
        <Sheet open={gridsOpen} title="Stramien" onClose={() => setGridsOpen(false)}>
          <div className="oa-grid-form">
            <div className="oa-grid-section-title">Achtergrondgrid</div>
            <label className="oa-grid-row">
              <span>Toon grid</span>
              <input type="checkbox" checked={grid.show}
                onChange={e => setGrid(g => ({ ...g, show: e.target.checked }))} />
            </label>
            <label className="oa-grid-row">
              <span>Toon gridlijnen</span>
              <input type="checkbox" checked={grid.showLines}
                onChange={e => setGrid(g => ({ ...g, showLines: e.target.checked }))} />
            </label>
            <label className="oa-grid-row">
              <span>Spacing (mm)</span>
              <input type="number" step="50" min="50" value={grid.spacingMm}
                onChange={e => {
                  const v = Math.max(50, Number(e.target.value) || 500);
                  setGrid(g => ({ ...g, spacingMm: v }));
                }} />
            </label>

            <div className="oa-grid-section-title" style={{ marginTop: 14 }}>Stramien (structureel)</div>
            <label className="oa-grid-row">
              <span>Stramien actief</span>
              <input type="checkbox" checked={fem.structuralGrid.enabled}
                onChange={e => fem.setStructuralGrid(prev => ({ ...prev, enabled: e.target.checked }))} />
            </label>

            <div className="oa-grid-subtitle">X-as (verticale lijnen)</div>
            <table className="oa-grid-table">
              <thead><tr><th>Label</th><th>X (mm)</th><th></th></tr></thead>
              <tbody>
                {fem.structuralGrid.xAxes.map((ax, i) => (
                  <tr key={ax.id}>
                    <td><input type="text" value={ax.label}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, xAxes: p.xAxes.map((a, j) => j === i ? { ...a, label: e.target.value } : a) }))} /></td>
                    <td><input type="number" step="100" value={ax.position}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, xAxes: p.xAxes.map((a, j) => j === i ? { ...a, position: Number(e.target.value) || 0 } : a) }))} /></td>
                    <td><button className="oa-grid-x-btn"
                      onClick={() => fem.setStructuralGrid(p => ({ ...p, xAxes: p.xAxes.filter((_, j) => j !== i) }))}
                      title="Verwijderen">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="oa-grid-add-btn"
              onClick={() => fem.setStructuralGrid(p => {
                const used = new Set(p.xAxes.map(a => a.label));
                let lbl = "";
                for (let k = 0; k < 26; k++) {
                  const l = String.fromCharCode(65 + k);
                  if (!used.has(l)) { lbl = l; break; }
                }
                const maxPos = p.xAxes.length ? Math.max(...p.xAxes.map(a => a.position)) : 0;
                return { ...p, xAxes: [...p.xAxes, { id: `x-${Date.now()}`, label: lbl || `X${p.xAxes.length + 1}`, position: maxPos + 3000 }] };
              })}
            >+ Toevoegen</button>

            <div className="oa-grid-subtitle">Z-as (horizontale lijnen)</div>
            <table className="oa-grid-table">
              <thead><tr><th>Label</th><th>Z (mm)</th><th></th></tr></thead>
              <tbody>
                {fem.structuralGrid.zAxes.map((ax, i) => (
                  <tr key={ax.id}>
                    <td><input type="text" value={ax.label}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, zAxes: p.zAxes.map((a, j) => j === i ? { ...a, label: e.target.value } : a) }))} /></td>
                    <td><input type="number" step="100" value={ax.position}
                      onChange={e => fem.setStructuralGrid(p => ({ ...p, zAxes: p.zAxes.map((a, j) => j === i ? { ...a, position: Number(e.target.value) || 0 } : a) }))} /></td>
                    <td><button className="oa-grid-x-btn"
                      onClick={() => fem.setStructuralGrid(p => ({ ...p, zAxes: p.zAxes.filter((_, j) => j !== i) }))}
                      title="Verwijderen">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="oa-grid-add-btn"
              onClick={() => fem.setStructuralGrid(p => {
                const used = new Set(p.zAxes.map(a => a.label));
                let lbl = "";
                for (let k = 1; k <= 99; k++) {
                  const l = String(k);
                  if (!used.has(l)) { lbl = l; break; }
                }
                const maxPos = p.zAxes.length ? Math.max(...p.zAxes.map(a => a.position)) : 0;
                return { ...p, zAxes: [...p.zAxes, { id: `z-${Date.now()}`, label: lbl || `Z${p.zAxes.length + 1}`, position: maxPos + 3000 }] };
              })}
            >+ Toevoegen</button>

            {/* Afronden — het paneel blijft anders openstaan zolang je het
                niet met het kruisje of Escape wegklikt, en dat leest als "de
                stramienmodus staat nog aan". Elke wijziging hierboven is al
                doorgevoerd; deze knop sluit alleen het paneel. */}
            <div className="oa-grid-afronden">
              <span className="oa-grid-afronden-hint">
                Wijzigingen zijn direct doorgevoerd.
              </span>
              <button
                className="oa-grid-done-btn"
                onClick={() => setGridsOpen(false)}
                title="Stramieninvoer afronden en dit paneel sluiten"
              >Afronden</button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

// @ts-expect-error — kept for future use (collapsible accordion primitive)
function PanelSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <button className="panel-section-header" onClick={() => setOpen(!open)}>
        <svg className={`panel-section-chevron${open ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,3 5,6 8,3" /></svg>
        <span className="panel-section-title">{title}</span>
      </button>
      {open && <div className="panel-section-body">{children}</div>}
    </div>
  );
}

export default App;
