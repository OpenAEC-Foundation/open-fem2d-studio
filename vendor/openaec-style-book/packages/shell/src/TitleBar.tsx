import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import "./TitleBar.css";

/** Single quick-access button definition. */
export interface QuickAccessAction {
  id: string;
  label: string;
  /** Tooltip text. Defaults to `label`. */
  title?: string;
  /** Inline SVG markup (e.g. icons from `@openaec/ribbon/icons`). */
  icon: string;
  onClick?: () => void;
}

export interface TitleBarProps {
  /** App name (centered). Defaults to empty string. */
  appName?: string;
  /** Version label, rendered next to the app name. */
  appVersion?: string;
  /** App icon rendered top-left. ReactNode lets you supply any SVG. */
  appIcon?: ReactNode;
  /** Quick-access action buttons next to the icon (Save / Undo / Redo / etc.). */
  actions?: QuickAccessAction[];
  /** Optional "Send feedback" button label on the right. */
  feedbackLabel?: string;
  onFeedbackClick?: () => void;
  /** Optional minimize/maximize/close labels (for a11y/i18n). */
  minimizeLabel?: string;
  maximizeLabel?: string;
  restoreLabel?: string;
  closeLabel?: string;
  /**
   * If true (default), Tauri window controls are wired via dynamic import.
   * Set to false to render the chrome without window control wiring (web mode).
   */
  enableWindowControls?: boolean;
}

/**
 * Window titlebar with drag region, quick-access actions and (in Tauri) window controls.
 *
 * Designed to work in both Tauri and web contexts:
 * - Tauri: window controls (min/max/close) call `@tauri-apps/api/window`
 * - Web: controls render but no-op (or you can hide via `enableWindowControls={false}`)
 */
export function TitleBar({
  appName = "",
  appVersion,
  appIcon,
  actions = [],
  feedbackLabel,
  onFeedbackClick,
  minimizeLabel = "Minimize",
  maximizeLabel = "Maximize",
  restoreLabel = "Restore",
  closeLabel = "Close",
  enableWindowControls = true,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appWindowRef = useRef<any>(null);

  const getWindow = useCallback(async () => {
    if (!enableWindowControls) return null;
    if (!appWindowRef.current) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        appWindowRef.current = getCurrentWindow();
      } catch {
        return null;
      }
    }
    return appWindowRef.current;
  }, [enableWindowControls]);

  const updateMaximizedState = useCallback(async () => {
    try {
      const win = await getWindow();
      if (!win) return;
      const maximized = await win.isMaximized();
      setIsMaximized(maximized);
    } catch {
      /* not in Tauri */
    }
  }, [getWindow]);

  useEffect(() => {
    updateMaximizedState();

    let cleanup: (() => void) | undefined;
    getWindow()
      .then((win) => (win ? win.onResized(() => updateMaximizedState()) : undefined))
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch(() => {});

    return () => {
      cleanup?.();
    };
  }, [updateMaximizedState, getWindow]);

  const handleMinimize = async () => (await getWindow())?.minimize();
  const handleMaximize = async () => (await getWindow())?.toggleMaximize();
  const handleClose = async () => (await getWindow())?.close();

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".titlebar-button")) return;
    (await getWindow())?.toggleMaximize();
  };

  return (
    <div className="titlebar" onDoubleClick={handleDoubleClick}>
      <div className="titlebar-drag" data-tauri-drag-region />

      <div className="titlebar-left">
        {appIcon && <div className="titlebar-icon">{appIcon}</div>}

        {actions.length > 0 && (
          <div className="titlebar-quick-access">
            {actions.map((a) => (
              <button
                key={a.id}
                className="titlebar-quick-btn"
                title={a.title || a.label}
                aria-label={a.label}
                tabIndex={-1}
                onClick={a.onClick}
                dangerouslySetInnerHTML={{ __html: a.icon }}
              />
            ))}
          </div>
        )}
      </div>

      <span className="titlebar-title" data-tauri-drag-region>
        {appName}
        {appVersion && <span className="titlebar-version">v{appVersion}</span>}
      </span>

      <div className="titlebar-controls">
        {feedbackLabel && (
          <button
            className="send-feedback-btn"
            onClick={onFeedbackClick}
            tabIndex={-1}
          >
            {feedbackLabel}
          </button>
        )}
        {enableWindowControls && (
          <>
            <button
              className="titlebar-button titlebar-minimize"
              onClick={handleMinimize}
              aria-label={minimizeLabel}
              tabIndex={-1}
            >
              <svg width="10" height="1" viewBox="0 0 10 1">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </button>

            <button
              className="titlebar-button titlebar-maximize"
              onClick={handleMaximize}
              aria-label={isMaximized ? restoreLabel : maximizeLabel}
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
              aria-label={closeLabel}
              tabIndex={-1}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default TitleBar;
