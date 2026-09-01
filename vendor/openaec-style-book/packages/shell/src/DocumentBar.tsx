import { useRef, useCallback } from "react";
import "./DocumentBar.css";

export interface DocTab {
  id: string;
  title: string;
  /** Optional: view identifier (e.g. "ifc", "report"). */
  view?: string;
  /** Show modified-indicator dot. */
  modified?: boolean;
}

/** Detail of a drag-out event. */
export interface DetachEventDetail {
  tab: DocTab;
  /** Screen position of the cursor when the threshold was crossed. */
  screenX: number;
  screenY: number;
}

export interface DocumentBarProps {
  docs: DocTab[];
  activeId?: string;
  onActivate?: (id: string) => void;
  onClose?: (id: string) => void;
  /**
   * Called when a tab is dragged out beyond the threshold. The consumer
   * can use this to spawn a detached window (e.g. via Tauri WebviewWindow).
   * Returning truthy causes the tab to be removed from this bar; if you
   * want to keep it visible (no detach happened), don't call setDocs.
   */
  onDetach?: (detail: DetachEventDetail) => void;
  /** Pixel threshold for drag-detach activation. Default 60. */
  detachThreshold?: number;
  /** Brief dock-flash animation when set; toggle via parent. */
  dockFlash?: boolean;
}

/**
 * Top tab strip for open documents/views. Controlled component: the consumer
 * owns the `docs` array. Optional drag-to-detach via `onDetach`.
 */
export function DocumentBar({
  docs,
  activeId,
  onActivate,
  onClose,
  onDetach,
  detachThreshold = 60,
  dockFlash = false,
}: DocumentBarProps) {
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragTabId = useRef<string | null>(null);
  const isDragging = useRef(false);

  const handleClose = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onClose?.(id);
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      dragStartPos.current = { x: e.screenX, y: e.screenY };
      dragTabId.current = tabId;
      isDragging.current = false;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStartPos.current || !dragTabId.current) return;
        const dy = ev.screenY - dragStartPos.current.y;

        if (Math.abs(dy) > detachThreshold && !isDragging.current) {
          isDragging.current = true;

          const tab = docs.find((d) => d.id === dragTabId.current);
          if (tab && onDetach && docs.length > 1) {
            onDetach({ tab, screenX: ev.screenX, screenY: ev.screenY });
          }

          cleanup();
        }
      };

      const handleMouseUp = () => {
        if (!isDragging.current && dragTabId.current) {
          onActivate?.(dragTabId.current);
        }
        cleanup();
      };

      const cleanup = () => {
        dragStartPos.current = null;
        dragTabId.current = null;
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [docs, onActivate, onDetach, detachThreshold]
  );

  return (
    <div className={`document-bar${dockFlash ? " dock-flash" : ""}`}>
      <div className="document-tabs">
        {docs.map((doc) => (
          <button
            key={doc.id}
            className={`document-tab${activeId === doc.id ? " active" : ""}`}
            onMouseDown={(e) => handleMouseDown(e, doc.id)}
          >
            <span className="document-tab-title">{doc.title}</span>
            {doc.modified && <span className="document-tab-modified" />}
            <span
              className="document-tab-close"
              onClick={(e) => handleClose(doc.id, e)}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default DocumentBar;
