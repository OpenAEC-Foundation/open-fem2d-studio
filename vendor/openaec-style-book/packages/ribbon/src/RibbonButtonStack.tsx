import type { ReactNode } from "react";

export interface RibbonButtonStackProps {
  children: ReactNode;
}

export function RibbonButtonStack({ children }: RibbonButtonStackProps) {
  return <div className="ribbon-btn-stack">{children}</div>;
}

export default RibbonButtonStack;
