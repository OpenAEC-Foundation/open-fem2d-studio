import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  fileNewIcon,
  fileOpenIcon,
  fileSaveIcon,
  projectInfoIcon,
  calcSettingsIcon,
  selectIcon,
  barIcon,
  nodeIcon,
  plateIcon,
  gridIcon,
  bcPinnedIcon,
  bcXRollerIcon,
  bcZRollerIcon,
  bcZSpringIcon,
  bcXSpringIcon,
  bcRotSpringIcon,
  bcFixedIcon,
  loadPointIcon,
  loadPointHIcon,
  loadLineIcon,
  loadMomentIcon,
  loadTempIcon,
  loadCasesIcon,
  loadCombinationsIcon,
  moveIcon,
  rotateIcon,
  undoIcon,
  redoIcon,
  copyIcon,
  filterIcon,
} from "./icons";

interface HomeTabProps {
  onSettingsClick?: () => void;
  onProjectSettingsClick?: () => void;
  femTool?: import("../fem/femTypes").Tool;
  onFemToolChange?: (t: import("../fem/femTypes").Tool) => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onOpenGrids?: () => void;
  /** Run linear analysis (all load cases + envelope). Same handler as Toetsing > Toetsen uitvoeren. */
  onSolve?: () => void;
  hasResults?: boolean;
  /** Opens the load-cases + combinations dialog (Gevallen tab). */
  onOpenLoadCases?: () => void;
  /** Opens the same dialog but jumps straight to the Combinaties tab. */
  onOpenLoadCombinations?: () => void;
  /** Quick filter: reduce current selection to one type only. */
  onFilterSelection?: () => void;
  /** Wired file-menu actions. */
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  onSaveProjectAs?: () => void;
}

const stub = (label: string) => () => console.log(`TODO: ${label}`);

// Reusable trash icon — there isn't one in icons.ts yet.
const deleteIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>`;
const subnodeIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12h18M12 8v8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`;
const mirrorIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16M6 8l-3 4 3 4M18 8l3 4-3 4"/></svg>`;
// Solve / "play" icon — used for the Berekenen button.
const solveIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"/></svg>`;

export default function HomeTab({
  onSettingsClick,
  onProjectSettingsClick,
  femTool = "select",
  onFemToolChange,
  onDelete, onUndo, onRedo, canUndo, canRedo, onOpenGrids,
  onSolve, hasResults,
  onOpenLoadCases, onOpenLoadCombinations, onNewProject, onOpenProject,
  onSaveProject, onSaveProjectAs,
  onFilterSelection,
}: HomeTabProps) {
  const { t } = useTranslation("ribbon");
  const setTool = (tool: import("../fem/femTypes").Tool) => onFemToolChange?.(tool);

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {/* Berekening — Berekenen (large primary action) */}
        <RibbonGroup label="Berekening">
          <RibbonButton
            icon={solveIcon}
            label="Berekenen"
            size="large"
            active={hasResults}
            onClick={() => onSolve?.()}
          />
        </RibbonGroup>

        {/* File — large New, stacked Open/Save */}
        <RibbonGroup label={t("home.file")}>
          <RibbonButton
            icon={fileNewIcon}
            label={t("home.new")}
            size="large"
            onClick={onNewProject ?? stub("New project (no handler)")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={fileOpenIcon}
              label={t("home.open")}
              size="small"
              onClick={onOpenProject ?? stub("Open project (no handler)")}
            />
            <RibbonButton
              icon={fileSaveIcon}
              label={t("home.save")}
              size="small"
              onClick={onSaveProject ?? stub("Save project (no handler)")}
            />
            <RibbonButton
              icon={fileSaveIcon}
              label={t("home.saveAs")}
              size="small"
              onClick={onSaveProjectAs ?? stub("Save project as (no handler)")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Project — gegevens en uitgangspunten horen bij de start van elk
            project (rapportkop, normkeuzes, rekeninstellingen), dus die
            knoppen staan hier vooraan in plaats van verstopt onder
            Instellingen. Zelfde handlers als de Instellingen-tab. */}
        <RibbonGroup label={t("home.projectGroep", "Project")}>
          <RibbonButton
            icon={projectInfoIcon}
            label={t("home.projectInfo", "Projectgegevens")}
            size="large"
            onClick={onProjectSettingsClick ?? stub("Project info dialog")}
          />
          <RibbonButton
            icon={calcSettingsIcon}
            label={t("home.assumptions", "Uitgangspunten")}
            size="large"
            onClick={onSettingsClick ?? stub("Calculation settings")}
          />
        </RibbonGroup>

        {/* Draw — Select (large), Bar/Node/Plate/Grids (mix) */}
        <RibbonGroup label={t("home.draw")}>
          <RibbonButton
            icon={selectIcon}
            label={t("home.select")}
            size="large"
            active={femTool === "select"}
            onClick={() => setTool("select")}
          />
          <RibbonButton
            icon={barIcon}
            label={t("home.bar")}
            size="large"
            active={femTool === "addBeam"}
            onClick={() => setTool("addBeam")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={nodeIcon}
              label={t("home.node")}
              size="small"
              active={femTool === "addNode"}
              onClick={() => setTool("addNode")}
            />
            <RibbonButton
              icon={subnodeIcon}
              label="Sub-knoop"
              size="small"
              active={femTool === "addSubNode"}
              onClick={() => setTool("addSubNode")}
            />
            <RibbonButton
              icon={plateIcon}
              label={t("home.plate")}
              size="small"
              active={femTool === "addPlate"}
              onClick={() => setTool("addPlate")}
            />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton
              icon={gridIcon}
              label={t("home.grids")}
              size="small"
              onClick={() => onOpenGrids?.()}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Boundary Conditions — Pinned large, others stacked */}
        <RibbonGroup label={t("home.boundaryConditions")}>
          <RibbonButton
            icon={bcPinnedIcon}
            label={t("home.pinned")}
            size="large"
            active={femTool === "addPinned"}
            onClick={() => setTool("addPinned")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={bcXRollerIcon}
              label={t("home.xRoller")}
              size="small"
              active={femTool === "addXRoller"}
              onClick={() => setTool("addXRoller")}
            />
            <RibbonButton
              icon={bcZRollerIcon}
              label={t("home.zRoller")}
              size="small"
              active={femTool === "addZRoller"}
              onClick={() => setTool("addZRoller")}
            />
            <RibbonButton
              icon={bcFixedIcon}
              label={t("home.fixed")}
              size="small"
              active={femTool === "addFixed"}
              onClick={() => setTool("addFixed")}
            />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton
              icon={bcZSpringIcon}
              label={t("home.zSpring")}
              size="small"
              active={femTool === "addZSpring"}
              onClick={() => setTool("addZSpring")}
            />
            <RibbonButton
              icon={bcXSpringIcon}
              label={t("home.xSpring")}
              size="small"
              active={femTool === "addXSpring"}
              onClick={() => setTool("addXSpring")}
            />
            <RibbonButton
              icon={bcRotSpringIcon}
              label={t("home.rotSpring")}
              size="small"
              active={femTool === "addRotSpring"}
              onClick={() => setTool("addRotSpring")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Loads — Point + Line large, rest stacked */}
        <RibbonGroup label={t("home.loads")}>
          <RibbonButton
            icon={loadPointIcon}
            label={t("home.pointLoad")}
            size="large"
            active={femTool === "addPointLoad"}
            onClick={() => setTool("addPointLoad")}
          />
          <RibbonButton
            icon={loadLineIcon}
            label={t("home.lineLoad")}
            size="large"
            active={femTool === "addLineLoad"}
            onClick={() => setTool("addLineLoad")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={loadPointHIcon}
              label="Puntlast H"
              size="small"
              active={femTool === "addPointLoadH"}
              onClick={() => setTool("addPointLoadH")}
            />
            <RibbonButton
              icon={loadMomentIcon}
              label={t("home.moment")}
              size="small"
              active={femTool === "addMoment"}
              onClick={() => setTool("addMoment")}
            />
            <RibbonButton
              icon={loadTempIcon}
              label={t("home.temp")}
              size="small"
              active={femTool === "addThermal"}
              onClick={() => setTool("addThermal")}
            />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton
              icon={loadCasesIcon}
              label={t("home.loadCases")}
              size="small"
              onClick={onOpenLoadCases ?? stub("Load cases dialog (no handler)")}
            />
            <RibbonButton
              icon={loadCombinationsIcon}
              label="Combinaties"
              size="small"
              onClick={onOpenLoadCombinations ?? stub("Load combinations dialog (no handler)")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Modify — Move/Rotate large, Undo/Redo/Copy stacked, + Delete */}
        <RibbonGroup label={t("home.modify")}>
          <RibbonButton
            icon={moveIcon}
            label={t("home.move")}
            size="large"
            active={femTool === "move"}
            onClick={() => setTool("move")}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={rotateIcon}
              label={t("home.rotate")}
              size="small"
              active={femTool === "rotate"}
              onClick={() => setTool("rotate")}
            />
            <RibbonButton
              icon={copyIcon}
              label={t("home.copy")}
              size="small"
              active={femTool === "copy"}
              onClick={() => setTool("copy")}
            />
            <RibbonButton
              icon={mirrorIcon}
              label="Spiegelen"
              size="small"
              active={femTool === "mirror"}
              onClick={() => setTool("mirror")}
            />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton
              icon={undoIcon}
              label={t("home.undo")}
              size="small"
              onClick={() => onUndo?.()}
              disabled={!canUndo}
            />
            <RibbonButton
              icon={redoIcon}
              label={t("home.redo")}
              size="small"
              onClick={() => onRedo?.()}
              disabled={!canRedo}
            />
            <RibbonButton
              icon={deleteIcon}
              label="Verwijderen"
              size="small"
              onClick={() => onDelete?.()}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Selection — Filter (large) */}
        <RibbonGroup label={t("home.selection")}>
          <RibbonButton
            icon={filterIcon}
            label={t("home.filterSelection")}
            size="large"
            onClick={onFilterSelection ?? stub("Filter selection (no handler)")}
          />
        </RibbonGroup>

        {/* De vroegere View-groep (Grafiek / Agent / Console) is verwijderd:
            de toggles zetten alleen App-state die nergens werd geconsumeerd —
            er bestond geen grafiek-split-, agent- of consolepaneel. */}
      </div>
    </div>
  );
}
