/**
 * IfcViewerPanel — het IFC-tabblad.
 *
 * Toont het GEOPENDE rekenmodel als IFC4 (Structural Analysis Domain): de
 * boomstructuur links, de STEP-tekst in het midden en rechts de validatie
 * plus wat er niet in IFC uit te drukken viel.
 *
 * Belangrijke regel: de tekst die hier in beeld staat is LETTERLIJK de tekst
 * die de exportknoppen wegschrijven — beide komen uit één aanroep van
 * `bouwIfcRekenmodel`. Er staat hier geen voorbeeldbestand meer.
 */
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  bouwIfcRekenmodel,
  bouwIfcBoom,
  verzamelIfcBeperkingen,
  valideerIfc,
  ifcStatistiek,
  downloadTekstbestand,
  type IfcRekenmodelInput,
  type IfcBoomKnoop,
} from "../../io/ifcExport";
import "./IfcViewerPanel.css";

// ── BuildingSMART documentation links ─────────────────────────

const IFC4_DOCS_BASE = "https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/";
function getIfcDocsUrl(entityType: string): string {
  // Normalize: IFCWALL -> IfcWall, IfcWall -> IfcWall
  const normalized = entityType.startsWith("IFC")
    ? "Ifc" + entityType.slice(3).toLowerCase().replace(/(^|_)(\w)/g, (_m, _p, c) => c.toUpperCase())
    : entityType;
  return `${IFC4_DOCS_BASE}${normalized}.htm`;
}

function openIfcDocs(entityType: string, e: React.MouseEvent) {
  e.stopPropagation();
  const url = getIfcDocsUrl(entityType);
  // Use Tauri shell opener if available, otherwise window.open
  import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
    openUrl(url);
  }).catch(() => {
    window.open(url, "_blank", "noopener");
  });
}

// ── Syntax highlighting for IFC4 STEP ─────────────────────────

const STEP_KEYWORDS = new Set([
  "ISO-10303-21", "HEADER", "ENDSEC", "DATA", "END-ISO-10303-21",
  "FILE_DESCRIPTION", "FILE_NAME", "FILE_SCHEMA",
]);

function highlightStepLine(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  const re = /(#\d+)|(IFC[A-Z][A-Z0-9_]+)|([A-Z_][A-Z_0-9]{3,})|('(?:[^'\\]|\\.)*')|(\.[A-Z_]+\.)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) tokens.push(text.slice(last, match.index));
    const [full] = match;
    if (match[1]) {
      tokens.push(<span key={key++} className="step-entity-ref">{full}</span>);
    } else if (match[2]) {
      // IFC entity type -> clickable link to BuildingSMART docs
      tokens.push(
        <a
          key={key++}
          className="step-entity-type step-link"
          title={`${full} — BuildingSMART docs`}
          onClick={(e) => openIfcDocs(full, e)}
        >
          {full}
        </a>
      );
    } else if (STEP_KEYWORDS.has(full)) {
      tokens.push(<span key={key++} className="step-keyword">{full}</span>);
    } else if (match[4]) {
      tokens.push(<span key={key++} className="step-string">{full}</span>);
    } else if (match[5]) {
      tokens.push(<span key={key++} className="step-enum">{full}</span>);
    } else {
      tokens.push(full);
    }
    last = match.index + full.length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return <>{tokens}</>;
}

// ── STEP-weergave ─────────────────────────────────────────────

function StepViewer({ content, bestandsnaam }: { content: string; bestandsnaam: string }) {
  const { t } = useTranslation("ribbon");
  const [copied, setCopied] = useState(false);

  const lines = useMemo(
    () => content.split("\n").map((text, i) => ({ lineNumber: i + 1, text })),
    [content]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  // Schrijft PRECIES weg wat hierboven staat — zelfde string, geen tweede
  // opbouw die er stiekem naast kan gaan zitten.
  const handleExport = useCallback(() => {
    downloadTekstbestand(content, bestandsnaam);
  }, [content, bestandsnaam]);

  const size = new Blob([content]).size;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;

  return (
    <div className="ifc-viewer-pane">
      <div className="ifc-viewer-toolbar">
        <span className="ifc-viewer-label">IFC4 STEP</span>
        <span className="ifc-viewer-stats">{lines.length} {t("ifc.lines")} &middot; {sizeLabel}</span>
        <div className="ifc-viewer-actions">
          <button onClick={handleCopy} title="Kopieer naar klembord">
            {copied ? "✓" : "⎘"}
          </button>
          <button onClick={handleExport} title={`Opslaan als ${bestandsnaam}`}>
            .ifc
          </button>
        </div>
      </div>
      <div className="ifc-viewer-code">
        <table className="ifc-viewer-table">
          <tbody>
            {lines.map((line) => (
              <tr key={line.lineNumber}>
                <td className="ifc-viewer-linenum">{line.lineNumber}</td>
                <td className="ifc-viewer-text">{highlightStepLine(line.text)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── IFC Spatial Structure Browser ─────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  IfcProject: "#c084fc",
  IfcSite: "#34d399",
  IfcBuilding: "#60a5fa",
  IfcStructuralAnalysisModel: "#fbbf24",
  IfcStructuralPointConnection: "#38bdf8",
  IfcStructuralCurveMember: "#a78bfa",
  IfcBoundaryNodeCondition: "#fb923c",
  IfcStructuralLoadGroup: "#f472b6",
  IfcStructuralPointAction: "#f472b6",
  IfcStructuralLinearAction: "#f472b6",
  IfcStructuralCurveAction: "#f472b6",
  IfcVertexPoint: "#4ade80",
  IfcMaterialProfile: "#4ade80",
};

function TreeItem({ node, depth = 0 }: { node: IfcBoomKnoop; depth?: number }) {
  // Standaard staat de hiërarchie tot en met het analysemodel open; de lange
  // lijsten met knopen en staven vouwt de gebruiker zelf open.
  const [expanded, setExpanded] = useState(depth < 4);
  const hasChildren = node.kinderen && node.kinderen.length > 0;
  const color = TYPE_COLORS[node.type] || "var(--theme-text-secondary)";

  return (
    <div className="ifc-tree-item">
      <button
        className="ifc-tree-row"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          <svg className={`ifc-tree-chevron${expanded ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="3,2 7,5 3,8" />
          </svg>
        ) : (
          <span className="ifc-tree-dot" style={{ background: color }} />
        )}
        <a
          className="ifc-tree-type step-link"
          style={{ color }}
          title={`${node.type} — BuildingSMART docs`}
          onClick={(e) => openIfcDocs(node.type, e)}
        >{node.type}</a>
        <span className="ifc-tree-name">{node.naam}</span>
        {node.aantal != null && <span className="ifc-tree-count">{node.aantal}</span>}
      </button>
      {expanded && hasChildren && (
        <div className="ifc-tree-children">
          {node.kinderen!.map((child, i) => (
            <TreeItem key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function StructureBrowser({ boom }: { boom: IfcBoomKnoop }) {
  const { t } = useTranslation("ribbon");

  return (
    <div className="ifc-structure-pane">
      <div className="ifc-viewer-toolbar">
        <span className="ifc-viewer-label">{t("ifc.structure")}</span>
      </div>
      <div className="ifc-structure-tree">
        <TreeItem node={boom} />
      </div>
    </div>
  );
}

// ── Validatie, beperkingen en statistieken ────────────────────

function RapportPane({
  ifc,
  beperkingen,
}: {
  ifc: string;
  beperkingen: string[];
}) {
  const validatie = useMemo(() => valideerIfc(ifc), [ifc]);
  const statistiek = useMemo(() => ifcStatistiek(ifc), [ifc]);
  const geldig = validatie.fouten.length === 0;

  return (
    <div className="ifc-viewer-pane">
      <div className="ifc-viewer-toolbar">
        <span className="ifc-viewer-label">Validatie</span>
        <span className="ifc-viewer-stats">
          {validatie.entiteiten} entiteiten
        </span>
      </div>
      <div className="ifc-viewer-code ifc-rapport">
        <div className={`ifc-rapport-kop ${geldig ? "ok" : "fout"}`}>
          {geldig
            ? "Geldig IFC4-bestand — geen fouten gevonden."
            : `${validatie.fouten.length} fout(en) gevonden.`}
        </div>

        {validatie.fouten.length > 0 && (
          <ul className="ifc-rapport-lijst fout">
            {validatie.fouten.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        {validatie.waarschuwingen.length > 0 && (
          <>
            <div className="ifc-rapport-titel">Waarschuwingen</div>
            <ul className="ifc-rapport-lijst waarschuwing">
              {validatie.waarschuwingen.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </>
        )}

        <div className="ifc-rapport-titel">Niet in IFC uitgedrukt</div>
        {beperkingen.length === 0 ? (
          <p className="ifc-rapport-tekst">
            Het volledige model staat in het bestand.
          </p>
        ) : (
          <ul className="ifc-rapport-lijst waarschuwing">
            {beperkingen.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}

        <div className="ifc-rapport-titel">Entiteiten</div>
        <table className="ifc-rapport-tabel">
          <tbody>
            {statistiek.map(({ type, aantal }) => (
              <tr key={type}>
                <td>
                  <a
                    className="step-entity-type step-link"
                    title={`${type} — BuildingSMART docs`}
                    onClick={(e) => openIfcDocs(type, e)}
                  >{type}</a>
                </td>
                <td className="ifc-rapport-getal">{aantal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────

export interface IfcViewerPanelProps {
  /**
   * Het geopende rekenmodel. Ontbreekt het (bijvoorbeeld in een
   * losgekoppeld venster, dat de modelstate van het hoofdvenster niet kan
   * lezen), dan zegt het paneel dat eerlijk in plaats van een voorbeeld te
   * tonen.
   */
  model?: IfcRekenmodelInput;
}

export default function IfcViewerPanel({ model }: IfcViewerPanelProps) {
  const ifc = useMemo(
    () => (model ? bouwIfcRekenmodel(model) : ""),
    [model],
  );
  const boom = useMemo(() => (model ? bouwIfcBoom(model) : null), [model]);
  const beperkingen = useMemo(
    () => (model ? verzamelIfcBeperkingen(model) : []),
    [model],
  );
  const bestandsnaam = useMemo(() => {
    const basis = model?.project?.naam?.trim() || model?.projectNaam?.trim() || "rekenmodel";
    return `${basis.replace(/[\\/:*?"<>|]/g, "_")}.ifc`;
  }, [model]);

  if (!model || !boom) {
    return (
      <div className="ifc-viewer-panel">
        <div className="ifc-viewer-pane">
          <div className="ifc-viewer-toolbar">
            <span className="ifc-viewer-label">IFC4 STEP</span>
          </div>
          <div className="ifc-viewer-code ifc-rapport">
            <p className="ifc-rapport-tekst">
              Geen model beschikbaar in dit venster. Koppel de weergave terug
              naar het hoofdvenster om de IFC-export van het geopende model te
              zien.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ifc-viewer-panel">
      <StructureBrowser boom={boom} />
      <div className="ifc-viewer-divider" />
      <StepViewer content={ifc} bestandsnaam={bestandsnaam} />
      <div className="ifc-viewer-divider" />
      <RapportPane ifc={ifc} beperkingen={beperkingen} />
    </div>
  );
}
