/**
 * SidePanel — generic right/left dock chrome (Phase 3 of OpenAEC UI big-bang).
 *
 * Provides: titled header bar (uppercase 0.75rem Inter 600 amber), 4px
 * resize handle (2px amber on hover), collapse/close affordances, scrollable
 * body area. Width is controlled by the parent so it can persist via Tauri
 * Store (see DockSplitter for width persistence helpers).
 *
 * Per LAYOUTS.md §3.2 (Inspector spec):
 *   - default width 280px, range 220-400 (parent enforces clamp)
 *   - header 32px, uppercase title in --theme-accent
 *   - resize handle 4px hit zone, 2px amber active
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface SidePanelAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}

export interface SidePanelProps {
  /** Edge of the screen — affects border + resize handle placement. */
  side?: "left" | "right" | "bottom";
  /** Alias for `side`. Accepted for v0.5 ergonomics. */
  dockEdge?: "left" | "right" | "bottom";
  /** Header title (rendered uppercase amber). */
  title: string;
  /** Optional action buttons rendered to the right of the title. */
  actions?: SidePanelAction[];
  /** Controlled width in px (or height when dockEdge === "bottom"). Optional — defaults to defaultWidth. */
  width?: number;
  /** Optional default width if width is not controlled. */
  defaultWidth?: number;
  /** Min/max width clamp. Defaults to 220 / 400 per LAYOUTS §3.2. */
  minWidth?: number;
  maxWidth?: number;
  /** Notifies parent of a new width (after live drag). */
  onWidthChange?: (w: number) => void;
  /** Collapsed state — when true, renders a vertical-tab strip only. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Optional close handler — shows an X in the header. */
  onClose?: () => void;
  /** Panel body. */
  children?: ReactNode;
  /** Extra className for the body wrapper. */
  bodyClassName?: string;
}

export function SidePanel({
  side,
  dockEdge,
  title,
  actions = [],
  width,
  defaultWidth,
  minWidth = 220,
  maxWidth = 400,
  onWidthChange,
  collapsed = false,
  onToggleCollapse,
  onClose,
  children,
  bodyClassName,
}: SidePanelProps) {
  const effectiveSide: "left" | "right" | "bottom" = dockEdge ?? side ?? "right";
  const [localWidth, setLocalWidth] = useState<number>(width ?? defaultWidth ?? 280);
  const effectiveWidth = width ?? localWidth;
  const [dragging, setDragging] = useState(false);
  const startPos = useRef(0);
  const startW = useRef(0);

  const onResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startPos.current = effectiveSide === "bottom" ? e.clientY : e.clientX;
      startW.current = effectiveWidth;
      setDragging(true);
    },
    [effectiveWidth, effectiveSide]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      let delta = 0;
      if (effectiveSide === "left") delta = e.clientX - startPos.current;
      else if (effectiveSide === "right") delta = startPos.current - e.clientX;
      else delta = startPos.current - e.clientY; // bottom: drag up grows
      const next = Math.max(minWidth, Math.min(maxWidth, startW.current + delta));
      if (onWidthChange) onWidthChange(next);
      else setLocalWidth(next);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, effectiveSide, minWidth, maxWidth, onWidthChange]);

  if (collapsed) {
    return (
      <aside
        className={`oa-side-panel oa-side-panel--${effectiveSide} oa-side-panel--collapsed`}
        style={{ width: 28 } as CSSProperties}
      >
        <button
          className="oa-side-panel-collapsed-tab"
          onClick={onToggleCollapse}
          title={title}
        >
          {title}
        </button>
      </aside>
    );
  }

  const dimStyle: CSSProperties =
    effectiveSide === "bottom" ? { height: effectiveWidth } : { width: effectiveWidth };

  return (
    <aside
      className={`oa-side-panel oa-side-panel--${effectiveSide}`}
      style={dimStyle}
    >
      <div className="oa-side-panel-header">
        <span className="oa-side-panel-title">{title}</span>
        <div className="oa-side-panel-actions">
          {actions.map((a) => (
            <button
              key={a.id}
              className={`oa-side-panel-action-btn${a.active ? " is-active" : ""}`}
              title={a.label}
              aria-label={a.label}
              onClick={a.onClick}
            >
              {a.icon}
            </button>
          ))}
          {onToggleCollapse && (
            <button
              className="oa-side-panel-action-btn"
              title="Collapse"
              aria-label="Collapse"
              onClick={onToggleCollapse}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d={side === "right" ? "M4 2l4 4-4 4" : "M8 2l-4 4 4 4"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              className="oa-side-panel-action-btn"
              title="Close"
              aria-label="Close"
              onClick={onClose}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className={`oa-side-panel-body${bodyClassName ? " " + bodyClassName : ""}`}>
        {children}
      </div>
      <div
        className={`oa-side-panel-resize${dragging ? " is-active" : ""}`}
        onMouseDown={onResizeDown}
      />
    </aside>
  );
}

export default SidePanel;
