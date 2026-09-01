/**
 * Sheet — right-docked panel (Phase 4 of OpenAEC UI big-bang).
 *
 * Visually similar to Modal but anchored to the right edge (not overlay) and
 * not modal — click-outside is a no-op so the user can keep working with the
 * mesh canvas while the Sheet is open. Esc closes.
 *
 * Slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1).
 */
import { useEffect, type ReactNode } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional footer (e.g. Apply/Close buttons). */
  footer?: ReactNode;
  /** Width in px. Default 380. */
  width?: number;
  children?: ReactNode;
}

export function Sheet({ open, onClose, title, footer, width = 380, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      className={`oa-sheet${open ? " oa-sheet--open" : ""}`}
      style={{ width }}
      role="complementary"
      aria-label={title}
      aria-hidden={!open}
    >
      <div className="oa-sheet-header">
        <span className="oa-sheet-title">{title}</span>
        <button
          className="oa-sheet-close"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
      <div className="oa-sheet-body">{children}</div>
      {footer && <div className="oa-sheet-footer">{footer}</div>}
    </aside>
  );
}

export default Sheet;
