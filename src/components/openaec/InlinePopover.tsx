/**
 * InlinePopover — anchored to a DOM element, single-input editor.
 * Enter commits, Esc cancels. Phase 4 of OpenAEC UI big-bang.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface InlinePopoverProps {
  open: boolean;
  /** DOMRect that anchors the popover (typically the source element). */
  anchorRect?: DOMRect | null;
  /** Initial input value. */
  value: string;
  /** Called when the user presses Enter or clicks "OK". */
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** Optional placeholder. */
  placeholder?: string;
  /** Optional label rendered before the input. */
  label?: ReactNode;
}

export function InlinePopover({
  open,
  anchorRect,
  value,
  onCommit,
  onCancel,
  placeholder,
  label,
}: InlinePopoverProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      // Defer focus so the popover is in the DOM
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !anchorRect) return null;

  const top = anchorRect.bottom + 4;
  const left = anchorRect.left;

  return (
    <div
      className="oa-inline-popover"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(draft);
          }
        }}
      />
      <button
        className="oa-side-panel-action-btn"
        onClick={() => onCommit(draft)}
        title="Commit"
        aria-label="Commit"
      >
        OK
      </button>
    </div>
  );
}

export default InlinePopover;
