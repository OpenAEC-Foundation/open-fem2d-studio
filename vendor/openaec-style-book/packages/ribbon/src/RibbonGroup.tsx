import type { ReactNode } from "react";

export interface RibbonGroupProps {
  label: string;
  children: ReactNode;
}

export function RibbonGroup({ label, children }: RibbonGroupProps) {
  return (
    <div className="ribbon-group">
      <div className="ribbon-group-content">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}

export default RibbonGroup;
