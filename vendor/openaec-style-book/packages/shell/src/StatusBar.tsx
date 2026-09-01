import type { ReactNode } from "react";
import "./StatusBar.css";

export interface StatusBarProps {
  /** Content in the left slot (typical: status messages, item counts). */
  left?: ReactNode;
  /** Content in the center slot (typical: app name / version). */
  center?: ReactNode;
  /** Content in the right slot (typical: zoom %, line/col, encoding). */
  right?: ReactNode;
}

/**
 * Bottom status bar with three slots. Fully prop-driven —
 * the helper components below can be used inside each slot.
 */
export function StatusBar({ left, center, right }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-bar-left">{left}</div>
      <div className="status-bar-center">{center}</div>
      <div className="status-bar-right">{right}</div>
    </div>
  );
}

/** Helper: labelled status item, e.g. `<StatusItem label="Items">12</StatusItem>`. */
export function StatusItem({
  label,
  children,
}: {
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="status-item">
      {label && <span className="status-item-label">{label}</span>}
      {children !== undefined && <span className="status-item-value">{children}</span>}
    </div>
  );
}

export function StatusSeparator() {
  return <div className="status-separator" />;
}

export default StatusBar;
