import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { fetchAppVersion } from "../lib/appVersion";
import "./TitleBar.css";

interface TitleBarProps {
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
  /** Quick-access Opslaan (ook via Ctrl+S) — gewired vanuit App.tsx. */
  onSaveClick?: () => void;
  /** Ongedaan maken / Opnieuw — zelfde handlers als de ribbon (fem.undo/redo).
   *  Weggelaten (bijv. DetachedApp) → knoppen worden niet gerenderd. */
  onUndoClick?: () => void;
  onRedoClick?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Afdrukken — opent de rapportweergave (de echte print/PDF-route).
   *  Weggelaten → knop wordt niet gerenderd. */
  onPrintClick?: () => void;
}

function TitleBar({
  onSettingsClick, onFeedbackClick, onSaveClick,
  onUndoClick, onRedoClick, canUndo, canRedo, onPrintClick,
}: TitleBarProps) {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appWindowRef = useRef<any>(null);

  const getWindow = useCallback(async () => {
    if (!appWindowRef.current) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      appWindowRef.current = getCurrentWindow();
    }
    return appWindowRef.current;
  }, []);

  useEffect(() => {
    fetchAppVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  const updateMaximizedState = useCallback(async () => {
    try {
      const win = await getWindow();
      const maximized = await win.isMaximized();
      setIsMaximized(maximized);
    } catch { /* not in Tauri */ }
  }, [getWindow]);

  useEffect(() => {
    updateMaximizedState();

    let cleanup: (() => void) | undefined;
    getWindow()
      .then((win) => win.onResized(() => updateMaximizedState()))
      .then((unlisten) => { cleanup = unlisten; })
      .catch(() => {});

    return () => { cleanup?.(); };
  }, [updateMaximizedState, getWindow]);

  const handleMinimize = async () => (await getWindow()).minimize();
  const handleMaximize = async () => (await getWindow()).toggleMaximize();
  const handleClose = async () => (await getWindow()).close();

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".titlebar-button")) return;
    (await getWindow()).toggleMaximize();
  };

  return (
    <div className="titlebar" onDoubleClick={handleDoubleClick}>
      <div className="titlebar-drag" data-tauri-drag-region />

      <div className="titlebar-left">
        <div className="titlebar-icon" title="Open FEM2D Studio">
          {/* Logo — gestyleerd portaal-frame met scharnier-opleggingen, FE-knopen
              en een doorbuigingscurve. Accent-tile + wit lijnwerk. */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Open FEM2D Studio"
          >
            <rect x="0" y="0" width="64" height="64" rx="12" fill="var(--theme-accent)" />
            {/* Portaal-frame: kolommen + bovenligger */}
            <line x1="14" y1="18" x2="14" y2="46" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="50" y1="18" x2="50" y2="46" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="14" y1="18" x2="50" y2="18" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            {/* FE-knopen (op hoeken + midden balk) */}
            <circle cx="14" cy="18" r="2.5" fill="white" />
            <circle cx="50" cy="18" r="2.5" fill="white" />
            <circle cx="32" cy="18" r="2.2" fill="white" />
            {/* Pinned-opleggingen (driehoekjes) */}
            <polygon points="14,46 10.5,52 17.5,52" fill="white" />
            <polygon points="50,46 46.5,52 53.5,52" fill="white" />
            {/* Gearceerde grond */}
            <line x1="6" y1="54" x2="22" y2="54" stroke="white" strokeWidth="1.5" />
            <line x1="42" y1="54" x2="58" y2="54" stroke="white" strokeWidth="1.5" />
            {/* Doorbuigingscurve (subtiel, suggereert berekening) */}
            <path
              d="M 14 18 Q 32 27 50 18"
              stroke="white"
              strokeWidth="1.2"
              fill="none"
              opacity="0.55"
              strokeDasharray="2 2"
            />
          </svg>
        </div>

        <div className="titlebar-quick-access">
        <button
          className="titlebar-quick-btn"
          title={`${t("save")} (Ctrl+S)`}
          aria-label={t("save")}
          tabIndex={-1}
          onClick={onSaveClick}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        </button>
        {onUndoClick && (
          <button
            className="titlebar-quick-btn"
            title={`${t("undo")} (Ctrl+Z)`}
            aria-label={t("undo")}
            tabIndex={-1}
            onClick={onUndoClick}
            disabled={canUndo === false}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
          </button>
        )}
        {onRedoClick && (
          <button
            className="titlebar-quick-btn"
            title={`${t("redo")} (Ctrl+Y)`}
            aria-label={t("redo")}
            tabIndex={-1}
            onClick={onRedoClick}
            disabled={canRedo === false}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.13-9.36L23 10" />
            </svg>
          </button>
        )}
        {onPrintClick && (
          <button
            className="titlebar-quick-btn"
            title={t("printReport")}
            aria-label={t("printReport")}
            tabIndex={-1}
            onClick={onPrintClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>
        )}
          <button
            className="titlebar-quick-btn"
            title={t("preferences")}
            aria-label={t("preferences")}
            tabIndex={-1}
            onClick={onSettingsClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      <span className="titlebar-title" data-tauri-drag-region>
        {t("appName")}
        {appVersion && <span className="titlebar-version">v{appVersion}</span>}
      </span>

      <div className="titlebar-controls">
        <button
          className="send-feedback-btn"
          onClick={onFeedbackClick}
          tabIndex={-1}
        >
          {t("sendFeedback")}
        </button>
        <button
          className="titlebar-button titlebar-minimize"
          onClick={handleMinimize}
          aria-label={t("minimize")}
          tabIndex={-1}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        <button
          className="titlebar-button titlebar-maximize"
          onClick={handleMaximize}
          aria-label={isMaximized ? t("restore") : t("maximize")}
          tabIndex={-1}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <polyline points="2.5 2.5 2.5 0.5 9.5 0.5 9.5 7.5 7.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>

        <button
          className="titlebar-button titlebar-close"
          onClick={handleClose}
          aria-label={t("close")}
          tabIndex={-1}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
