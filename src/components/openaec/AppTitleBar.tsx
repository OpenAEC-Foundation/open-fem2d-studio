/**
 * App-scoped wrapper around the @openaec/shell TitleBar.
 *
 * Provides FEM-aware quick-access actions (Save / Undo / Redo) and the
 * OpenAEC-branded icon. The package handles drag-region + window controls.
 */
import { TitleBar as ShellTitleBar, type QuickAccessAction } from "@openaec/shell";
import { useFEM } from "../../context/FEMContext";
import { useI18n } from "../../i18n/i18n";
import pkg from "../../../package.json";

const SAVE_ICON = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 3v4a1 1 0 01-1 1H8M7 14h10v7H7z"/></svg>`;
const UNDO_ICON = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5h-3M3 10l4-4m-4 4l4 4"/></svg>`;
const REDO_ICON = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h3M21 10l-4-4m4 4l-4 4"/></svg>`;

// Inline OpenAEC mark — amber rounded square with "OA" mark; matches the
// reference template's Backstage logo and the Tauri window icon spirit.
const OPENAEC_MARK = (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="4" fill="var(--theme-accent, #d97706)" />
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fill="var(--theme-accent-text, #fafaf9)"
      fontSize="9"
      fontFamily="Inter, sans-serif"
      fontWeight="700"
    >
      OA
    </text>
  </svg>
);

interface AppTitleBarProps {
  onSave?: () => void;
}

export function AppTitleBar({ onSave }: AppTitleBarProps) {
  const { state, dispatch } = useFEM();
  const { t } = useI18n();

  const actions: QuickAccessAction[] = [
    {
      id: "save",
      label: t("backstage.save") || "Save",
      title: "Save (Ctrl+S)",
      icon: SAVE_ICON,
      onClick: onSave,
    },
    {
      id: "undo",
      label: t("ribbon.undo") || "Undo",
      title: "Undo (Ctrl+Z)",
      icon: UNDO_ICON,
      onClick: () => dispatch({ type: "UNDO" }),
    },
    {
      id: "redo",
      label: t("ribbon.redo") || "Redo",
      title: "Redo (Ctrl+Y)",
      icon: REDO_ICON,
      onClick: () => dispatch({ type: "REDO" }),
    },
  ];

  const projectName = state.projectInfo.name || t("app.untitledProject") || "Untitled Project";

  return (
    <ShellTitleBar
      appName={`${projectName} — Open FEM2D Studio`}
      appVersion={pkg.version}
      appIcon={OPENAEC_MARK}
      actions={actions}
      minimizeLabel={t("common.minimize") || "Minimize"}
      maximizeLabel={t("common.maximize") || "Maximize"}
      closeLabel={t("common.close") || "Close"}
    />
  );
}
