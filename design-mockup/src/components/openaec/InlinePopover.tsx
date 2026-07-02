/**
 * InlinePopover — small floating panel anchored at screen (x,y).
 *
 * Used by the FEM canvas to ask for spring stiffness / load magnitudes
 * right where the user clicked. Closes on Escape or outside-click.
 */
import { useEffect, useRef } from "react";
import "./InlinePopover.css";

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}

export default function InlinePopover({ x, y, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Defer to next tick so the click that opened us doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Anchor: top-left of popover sits 16 px below-right of the click
  return (
    <div
      ref={ref}
      className="oa-inline-popover"
      style={{ left: x + 16, top: y + 16 }}
    >
      {children}
    </div>
  );
}
