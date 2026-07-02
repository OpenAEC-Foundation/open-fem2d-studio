import { useTranslation } from "react-i18next";
import "./StatusBar.css";

export default function StatusBar() {
  const { t } = useTranslation();

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {/* App-logo (mini) — portaal-frame + scharnier-opleggingen, in lijn met
            de TitleBar / Backstage / taakbalk-icoon. */}
        <span className="status-bar-logo" title="Open FEM2D Studio">
          <svg width="14" height="14" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="Open FEM2D Studio">
            <rect x="0" y="0" width="64" height="64" rx="12" fill="var(--theme-accent)" />
            <line x1="14" y1="18" x2="14" y2="46" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="50" y1="18" x2="50" y2="46" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="14" y1="18" x2="50" y2="18" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="14" cy="18" r="2.5" fill="white" />
            <circle cx="50" cy="18" r="2.5" fill="white" />
            <circle cx="32" cy="18" r="2.2" fill="white" />
            <polygon points="14,46 10.5,52 17.5,52" fill="white" />
            <polygon points="50,46 46.5,52 53.5,52" fill="white" />
            <line x1="6" y1="54" x2="22" y2="54" stroke="white" strokeWidth="1.5" />
            <line x1="42" y1="54" x2="58" y2="54" stroke="white" strokeWidth="1.5" />
          </svg>
        </span>
        <div className="status-item">
          <span className="status-item-label">{t("ready")}</span>
        </div>
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-label">{t("items")}:</span>
          <span className="status-item-value">0</span>
        </div>
      </div>

      <div className="status-bar-center">
        <span className="status-item-label" style={{ fontSize: "11px" }}>
          {t("version")}
        </span>
      </div>

      <div className="status-bar-right">
        <div className="status-item">
          <span className="status-item-label">{t("zoom")}:</span>
          <span className="status-item-value">100%</span>
        </div>
      </div>
    </div>
  );
}
