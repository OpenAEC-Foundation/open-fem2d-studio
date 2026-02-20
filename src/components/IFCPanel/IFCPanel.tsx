/**
 * IFCPanel - IFC view with 4 panels: Canvas, Code, Graph, Node Tree (side by side)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import {
  exportMeshToIFC,
  generateIFCString,
  buildIFCGraph,
  IFCGraph,
  IFCGraphNode,
  IFCModel,
  IFCEntity
} from '../../core/ifc/IFCExporter';
import { Code, Network, Copy, Check, Download, ZoomIn, ZoomOut, Maximize2, List, ChevronRight, ChevronDown } from 'lucide-react';
import './IFCPanel.css';

interface IFCPanelProps {
  children?: React.ReactNode; // Canvas slot
}

export const IFCPanel: React.FC<IFCPanelProps> = ({ children }) => {
  const { state } = useFEM();
  const { t } = useI18n();
  const { mesh, projectInfo, loadCases, loadCombinations, result } = state;

  const [copied, setCopied] = useState(false);
  const [includeResults, setIncludeResults] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<number | null>(null);

  // Generate IFC model
  const ifcModel = useMemo(() => {
    if (mesh.getNodeCount() === 0) return null;
    return exportMeshToIFC(
      mesh,
      projectInfo.name || 'Unnamed Project',
      loadCases,
      loadCombinations,
      includeResults && result ? result : undefined
    );
  }, [mesh, projectInfo.name, loadCases, loadCombinations, result, includeResults]);

  // Generate IFC string
  const ifcString = useMemo(() => {
    if (!ifcModel) return '';
    return generateIFCString(ifcModel);
  }, [ifcModel]);

  // Generate IFC graph
  const ifcGraph = useMemo(() => {
    if (!ifcModel) return { nodes: [], edges: [] };
    return buildIFCGraph(ifcModel);
  }, [ifcModel]);

  // Filter IFC lines by search
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return ifcString.split('\n');
    const query = searchQuery.toLowerCase();
    return ifcString.split('\n').filter(line =>
      line.toLowerCase().includes(query)
    );
  }, [ifcString, searchQuery]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ifcString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [ifcString]);

  // Download IFC file
  const handleDownload = useCallback(() => {
    const blob = new Blob([ifcString], { type: 'application/x-step' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectInfo.name || 'model'}.ifc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [ifcString, projectInfo.name]);

  // Statistics
  const stats = useMemo(() => {
    if (!ifcModel) return null;
    const entityTypes = new Map<string, number>();
    for (const entity of ifcModel.entities.values()) {
      entityTypes.set(entity.type, (entityTypes.get(entity.type) || 0) + 1);
    }
    return {
      totalEntities: ifcModel.entities.size,
      entityTypes: Array.from(entityTypes.entries()).sort((a, b) => b[1] - a[1]),
      nodes: Array.from(ifcModel.entities.values()).filter(e => e.type === 'IFCSTRUCTURALPOINTCONNECTION').length,
      beams: Array.from(ifcModel.entities.values()).filter(e => e.type === 'IFCSTRUCTURALCURVEMEMBER').length,
      plates: Array.from(ifcModel.entities.values()).filter(e => e.type === 'IFCSTRUCTURALSURFACEMEMBER').length,
      loadCases: Array.from(ifcModel.entities.values()).filter(e => e.type === 'IFCSTRUCTURALLOADGROUP').length,
    };
  }, [ifcModel]);

  if (mesh.getNodeCount() === 0) {
    return (
      <div className="ifc-panel">
        <div className="ifc-panel-empty">
          <Network size={48} />
          <h3>{t('ifc.noModel')}</h3>
          <p>{t('ifc.createModelFirst')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ifc-panel ifc-panel-grid">
      {/* Top toolbar */}
      <div className="ifc-panel-toolbar">
        <div className="ifc-panel-toolbar-left">
          <span className="ifc-panel-title">IFC Export</span>
          {stats && (
            <span className="ifc-stats-mini">
              {stats.totalEntities} entities | {stats.nodes} nodes | {stats.beams} beams
            </span>
          )}
        </div>
        <div className="ifc-panel-toolbar-right">
          <label className="ifc-checkbox">
            <input
              type="checkbox"
              checked={includeResults}
              onChange={e => setIncludeResults(e.target.checked)}
            />
            <span>{t('ifc.includeResults')}</span>
          </label>
          <button
            className="ifc-toolbar-btn"
            onClick={handleCopy}
            title={t('ifc.copyToClipboard')}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? t('ifc.copied') : t('ifc.copy')}</span>
          </button>
          <button
            className="ifc-toolbar-btn primary"
            onClick={handleDownload}
            title={t('ifc.downloadIFC')}
          >
            <Download size={14} />
            <span>{t('ifc.download')}</span>
          </button>
        </div>
      </div>

      {/* 4-panel grid */}
      <div className="ifc-quad-grid">
        {/* Top-left: Canvas/Model */}
        <div className="ifc-quad-panel ifc-quad-model">
          <div className="ifc-quad-header">
            <span>Model</span>
          </div>
          <div className="ifc-quad-content ifc-canvas-slot">
            {children}
          </div>
        </div>

        {/* Top-right: Code viewer */}
        <div className="ifc-quad-panel ifc-quad-code">
          <div className="ifc-quad-header">
            <Code size={14} />
            <span>IFC Code</span>
            <input
              type="text"
              className="ifc-mini-search"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="ifc-quad-content">
            <IFCCodeViewer
              lines={filteredLines}
              searchQuery={searchQuery}
              onEntityClick={setSelectedEntity}
            />
          </div>
        </div>

        {/* Bottom-left: Graph viewer */}
        <div className="ifc-quad-panel ifc-quad-graph">
          <div className="ifc-quad-header">
            <Network size={14} />
            <span>Entity Graph</span>
          </div>
          <div className="ifc-quad-content">
            <IFCGraphViewer
              graph={ifcGraph}
              selectedEntity={selectedEntity}
              onEntitySelect={setSelectedEntity}
            />
          </div>
        </div>

        {/* Bottom-right: Node tree */}
        <div className="ifc-quad-panel ifc-quad-tree">
          <div className="ifc-quad-header">
            <List size={14} />
            <span>Node Tree</span>
          </div>
          <div className="ifc-quad-content">
            {ifcModel && (
              <IFCTreeViewer
                model={ifcModel}
                selectedEntity={selectedEntity}
                onEntitySelect={setSelectedEntity}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// === Code Viewer Component ===

interface CodeViewerProps {
  lines: string[];
  searchQuery: string;
  onEntityClick: (id: number | null) => void;
}

const IFCCodeViewer: React.FC<CodeViewerProps> = ({ lines, searchQuery, onEntityClick }) => {
  // Syntax highlighting for IFC
  const highlightLine = (line: string) => {
    let highlighted = line.replace(/(#\d+)/g, '<span class="ifc-ref">$1</span>');
    highlighted = highlighted.replace(/\b(IFC[A-Z0-9_]+)\(/g, '<span class="ifc-type">$1</span>(');
    highlighted = highlighted.replace(/'([^']*)'/g, '<span class="ifc-string">\'$1\'</span>');
    highlighted = highlighted.replace(/\.([A-Z_]+)\./g, '<span class="ifc-enum">.$1.</span>');
    highlighted = highlighted.replace(/\/\*([^*]*)\*\//g, '<span class="ifc-comment">/*$1*/</span>');
    highlighted = highlighted.replace(/\b(\d+\.?\d*E?[+-]?\d*)\b/g, '<span class="ifc-number">$1</span>');
    if (searchQuery) {
      const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="ifc-highlight">$1</mark>');
    }
    return highlighted;
  };

  const handleLineClick = (line: string) => {
    const match = line.match(/^#(\d+)=/);
    if (match) {
      onEntityClick(parseInt(match[1]));
    }
  };

  return (
    <div className="ifc-code-viewer compact">
      <div className="ifc-code-content">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="ifc-code-line"
            onClick={() => handleLineClick(line)}
          >
            <span className="ifc-line-number">{idx + 1}</span>
            <span
              className="ifc-line-content"
              dangerouslySetInnerHTML={{ __html: highlightLine(line) }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// === Graph Viewer Component ===

interface GraphViewerProps {
  graph: IFCGraph;
  selectedEntity: number | null;
  onEntitySelect: (id: number | null) => void;
}

const IFCGraphViewer: React.FC<GraphViewerProps> = ({ graph, selectedEntity, onEntitySelect }) => {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(0.6);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Calculate node positions
  const nodePositions = useMemo(() => {
    const positions = new Map<number, { x: number; y: number }>();
    const categoryGroups: Record<string, IFCGraphNode[]> = {
      project: [],
      spatial: [],
      structural: [],
      load: [],
      result: [],
      other: [],
    };

    for (const node of graph.nodes) {
      categoryGroups[node.category].push(node);
    }

    const categoryX: Record<string, number> = {
      project: 80,
      spatial: 220,
      structural: 360,
      load: 500,
      result: 640,
      other: 780,
    };

    for (const [category, nodes] of Object.entries(categoryGroups)) {
      const x = categoryX[category];
      const spacing = 60;
      const startY = 60;
      nodes.forEach((node, idx) => {
        positions.set(node.id, {
          x: x + (Math.random() - 0.5) * 30,
          y: startY + idx * spacing + (Math.random() - 0.5) * 15,
        });
      });
    }
    return positions;
  }, [graph.nodes]);

  const categoryColors: Record<string, string> = {
    project: '#6366f1',
    spatial: '#22c55e',
    structural: '#f59e0b',
    load: '#ef4444',
    result: '#8b5cf6',
    other: '#6b7280',
  };

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.2));
  const handleFitView = () => { setZoom(0.6); setPan({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(2, z * delta)));
  };

  return (
    <div className="ifc-graph-viewer compact">
      <div className="ifc-graph-mini-toolbar">
        <button className="ifc-mini-btn" onClick={handleZoomIn}><ZoomIn size={12} /></button>
        <button className="ifc-mini-btn" onClick={handleZoomOut}><ZoomOut size={12} /></button>
        <button className="ifc-mini-btn" onClick={handleFitView}><Maximize2 size={12} /></button>
        <span className="ifc-zoom-label">{Math.round(zoom * 100)}%</span>
      </div>

      <svg
        className="ifc-graph-svg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {graph.edges.map((edge, idx) => {
            const sourcePos = nodePositions.get(edge.source);
            const targetPos = nodePositions.get(edge.target);
            if (!sourcePos || !targetPos) return null;
            return (
              <line
                key={`edge-${idx}`}
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                className="ifc-graph-edge"
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            const isSelected = selectedEntity === node.id;
            return (
              <g
                key={node.id}
                className={`ifc-graph-node ${isSelected ? 'selected' : ''}`}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onEntitySelect(node.id)}
              >
                <circle
                  r={isSelected ? 18 : 14}
                  fill={categoryColors[node.category]}
                  className="ifc-node-circle"
                />
                <text className="ifc-node-label" dy={3} fontSize="8">
                  {node.type.length > 8 ? node.type.slice(0, 6) + '..' : node.type}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {graph.nodes.length === 0 && (
        <div className="ifc-graph-empty">
          <Network size={24} />
          <span>{t('ifc.noEntities')}</span>
        </div>
      )}
    </div>
  );
};

// === Tree Viewer Component ===

interface TreeViewerProps {
  model: IFCModel;
  selectedEntity: number | null;
  onEntitySelect: (id: number | null) => void;
}

const IFCTreeViewer: React.FC<TreeViewerProps> = ({ model, selectedEntity, onEntitySelect }) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set([80, 83, 76])); // P, S, L
  const [filterText, setFilterText] = useState('');

  const treeData = useMemo(() => {
    const groups: Record<string, IFCEntity[]> = {
      'Project': [],
      'Spatial': [],
      'Structural': [],
      'Loads': [],
      'Results': [],
      'Other': [],
    };

    for (const entity of model.entities.values()) {
      if (entity.type === 'IFCPROJECT') {
        groups['Project'].push(entity);
      } else if (entity.type.includes('SITE') || entity.type.includes('BUILDING')) {
        groups['Spatial'].push(entity);
      } else if (entity.type.includes('STRUCTURAL') && !entity.type.includes('LOAD') && !entity.type.includes('RESULT')) {
        groups['Structural'].push(entity);
      } else if (entity.type.includes('LOAD') || entity.type.includes('ACTION')) {
        groups['Loads'].push(entity);
      } else if (entity.type.includes('RESULT') || entity.type.includes('REACTION')) {
        groups['Results'].push(entity);
      } else {
        groups['Other'].push(entity);
      }
    }
    return groups;
  }, [model]);

  const toggleExpand = (id: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredEntities = useMemo(() => {
    if (!filterText.trim()) return null;
    const query = filterText.toLowerCase();
    const results: IFCEntity[] = [];
    for (const entity of model.entities.values()) {
      if (entity.type.toLowerCase().includes(query) ||
          entity.label?.toLowerCase().includes(query) ||
          `#${entity.id}`.includes(query)) {
        results.push(entity);
      }
    }
    return results;
  }, [model, filterText]);

  const renderEntity = (entity: IFCEntity) => {
    const isSelected = selectedEntity === entity.id;
    return (
      <div
        key={entity.id}
        className={`ifc-tree-item ${isSelected ? 'selected' : ''}`}
        onClick={() => onEntitySelect(entity.id)}
      >
        <span className="ifc-tree-id">#{entity.id}</span>
        <span className="ifc-tree-type">{entity.type.replace('IFC', '').substring(0, 20)}</span>
      </div>
    );
  };

  return (
    <div className="ifc-tree-viewer compact">
      <div className="ifc-tree-mini-search">
        <input
          type="text"
          placeholder="Filter..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
      </div>

      <div className="ifc-tree-content">
        {filteredEntities ? (
          <div className="ifc-tree-group">
            <div className="ifc-tree-group-header">Results ({filteredEntities.length})</div>
            {filteredEntities.slice(0, 50).map(renderEntity)}
          </div>
        ) : (
          Object.entries(treeData).map(([groupName, entities]) => {
            if (entities.length === 0) return null;
            const groupId = groupName.charCodeAt(0);
            const isExpanded = expandedNodes.has(groupId);

            return (
              <div key={groupName} className="ifc-tree-group">
                <div className="ifc-tree-group-header" onClick={() => toggleExpand(groupId)}>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>{groupName}</span>
                  <span className="ifc-tree-count">{entities.length}</span>
                </div>
                {isExpanded && (
                  <div className="ifc-tree-group-content">
                    {entities.slice(0, 30).map(renderEntity)}
                    {entities.length > 30 && (
                      <div className="ifc-tree-more">...+{entities.length - 30} more</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {selectedEntity && (
        <div className="ifc-tree-mini-details">
          {(() => {
            const entity = model.entities.get(selectedEntity);
            if (!entity) return null;
            return (
              <div>
                <strong>#{entity.id}</strong> {entity.type}
                {entity.label && <span className="ifc-tree-detail-label"> "{entity.label}"</span>}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
