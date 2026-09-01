/**
 * App-scoped wrapper around the @openaec/shell DocumentBar.
 *
 * Converts the App's numeric FileTab[] state into the package's string-id
 * DocTab[] shape, then forwards activate/close events back as numeric IDs.
 * Includes a "+" affordance for opening a fresh project tab (kept inline
 * because the package's DocumentBar is intentionally minimal).
 */
import { DocumentBar, type DocTab } from "@openaec/shell";
import type { FileTab } from "./types";

interface AppDocumentBarProps {
  tabs: FileTab[];
  activeTabId: number;
  onSelectTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onNewTab: () => void;
}

export function AppDocumentBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: AppDocumentBarProps) {
  const docs: DocTab[] = tabs.map((tab) => ({
    id: String(tab.id),
    title: tab.name || "Untitled",
  }));

  return (
    <div className="oa-document-bar-wrap">
      <DocumentBar
        docs={docs}
        activeId={String(activeTabId)}
        onActivate={(id) => onSelectTab(Number(id))}
        onClose={tabs.length > 1 ? (id) => onCloseTab(Number(id)) : undefined}
      />
      <button
        className="oa-document-add"
        onClick={onNewTab}
        title="New project tab"
        aria-label="New project tab"
      >
        +
      </button>
    </div>
  );
}
