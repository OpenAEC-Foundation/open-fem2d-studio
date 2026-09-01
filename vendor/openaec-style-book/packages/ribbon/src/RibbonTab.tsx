export interface RibbonTabProps {
  label: string;
  isActive?: boolean;
  isFileTab?: boolean;
  onClick: () => void;
}

export function RibbonTab({ label, isActive, isFileTab, onClick }: RibbonTabProps) {
  return (
    <button
      className={`ribbon-tab${isActive ? " active" : ""}${isFileTab ? " file-tab" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default RibbonTab;
