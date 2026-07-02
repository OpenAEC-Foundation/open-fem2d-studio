/**
 * Sheet — right-docked side panel. Slides in from the right edge.
 *
 * Used by the Grids dialog and load editors so the user doesn't lose
 * sight of the canvas while configuring.
 */
import { useEffect } from "react";
import "./Sheet.css";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Sheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="oa-sheet">
      <div className="oa-sheet-header">
        <span className="oa-sheet-title">{title}</span>
        <button className="oa-sheet-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="oa-sheet-body">{children}</div>
    </div>
  );
}
