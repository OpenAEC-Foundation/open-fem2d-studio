import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import RibbonTab from "./RibbonTab";
import "./Ribbon.css";

/** Definition of a single ribbon tab. */
export interface TabDef {
  /** Unique id (used for active/animation tracking). */
  id: string;
  /** Visible label on the tab button. */
  label: string;
  /** Tab content (typically a row of RibbonGroups). */
  content: ReactNode;
}

export interface RibbonProps {
  /** Ordered tabs. */
  tabs: TabDef[];
  /** Initial active tab id. Defaults to the first tab. */
  defaultActiveId?: string;
  /** Controlled active tab id. If provided, overrides internal state. */
  activeId?: string;
  /** Fired when the user switches to another tab. */
  onActiveChange?: (id: string) => void;
  /** Label shown on the File tab (orange). */
  fileTabLabel?: string;
  /** Click handler for the File tab. If omitted, the File tab is not rendered. */
  onFileTabClick?: () => void;
  /**
   * Optional ids whose content area should be hidden (the tab still shows,
   * but the button row collapses). Useful for view-only tabs like a 3D viewer.
   */
  hiddenContentIds?: string[];
}

/**
 * Office-style ribbon with animated tab transitions.
 *
 * Consumer apps supply their own `tabs` array — typically importing from
 * `RibbonGroup` / `RibbonButton` / `RibbonButtonStack` to compose the content.
 */
export function Ribbon({
  tabs,
  defaultActiveId,
  activeId: controlledActiveId,
  onActiveChange,
  fileTabLabel = "File",
  onFileTabClick,
  hiddenContentIds = [],
}: RibbonProps) {
  const [internalActiveId, setInternalActiveId] = useState<string>(
    defaultActiveId ?? tabs[0]?.id ?? ""
  );
  const activeId = controlledActiveId ?? internalActiveId;

  const [prevId, setPrevId] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const tabsRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);

  const updateHighlight = useCallback(() => {
    const tabsEl = tabsRef.current;
    const borderEl = borderRef.current;
    const gapEl = gapRef.current;
    if (!tabsEl || !borderEl || !gapEl) return;

    const activeEl = tabsEl.querySelector(".ribbon-tab.active") as HTMLElement | null;
    if (!activeEl) {
      borderEl.style.opacity = "0";
      gapEl.style.opacity = "0";
      return;
    }

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const left = activeRect.left - tabsRect.left;
    const top = activeRect.top - tabsRect.top;
    const width = activeRect.width;
    const height = activeRect.height;

    borderEl.style.opacity = "1";
    borderEl.style.left = `${left}px`;
    borderEl.style.top = `${top}px`;
    borderEl.style.width = `${width}px`;
    borderEl.style.height = `${height}px`;

    gapEl.style.opacity = "1";
    gapEl.style.left = `${left + 1}px`;
    gapEl.style.width = `${width - 2}px`;
  }, []);

  const switchTab = useCallback(
    (newId: string) => {
      if (newId === activeId) return;
      const oldIndex = tabs.findIndex((t) => t.id === activeId);
      const newIndex = tabs.findIndex((t) => t.id === newId);
      setDirection(newIndex > oldIndex ? "right" : "left");
      setPrevId(activeId);
      if (controlledActiveId === undefined) setInternalActiveId(newId);
      onActiveChange?.(newId);
      setAnimating(true);
    },
    [activeId, controlledActiveId, onActiveChange, tabs]
  );

  useEffect(() => {
    updateHighlight();
    requestAnimationFrame(updateHighlight);
  }, [activeId, tabs.length, updateHighlight]);

  useEffect(() => {
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [updateHighlight]);

  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => {
      setAnimating(false);
      setPrevId(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [animating]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const prevTab = prevId ? tabs.find((t) => t.id === prevId) : null;
  const hideContent = hiddenContentIds.includes(activeId);

  return (
    <div className="ribbon-container">
      <div className="ribbon-tabs" ref={tabsRef}>
        {onFileTabClick && (
          <RibbonTab label={fileTabLabel} isFileTab onClick={onFileTabClick} />
        )}
        {tabs.map((tab) => (
          <RibbonTab
            key={tab.id}
            label={tab.label}
            isActive={activeId === tab.id}
            onClick={() => switchTab(tab.id)}
          />
        ))}
        <div className="ribbon-tab-border" ref={borderRef} />
        <div className="ribbon-tab-gap" ref={gapRef} />
      </div>

      {!hideContent && (
        <div className="ribbon-content-wrapper">
          {animating && prevTab && !hiddenContentIds.includes(prevTab.id) && (
            <div
              className={`ribbon-content-panel ribbon-panel-exit-${direction}`}
              key={`prev-${prevTab.id}`}
            >
              {prevTab.content}
            </div>
          )}
          {activeTab && (
            <div
              className={`ribbon-content-panel${animating ? ` ribbon-panel-enter-${direction}` : ""}`}
              key={`active-${activeTab.id}`}
            >
              {activeTab.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Ribbon;
