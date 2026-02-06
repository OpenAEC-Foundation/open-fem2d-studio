import { useState } from 'react';
import { useFEM, BrowserTab } from '../../context/FEMContext';
import { DEFAULT_SECTIONS, calculateBeamLength } from '../../core/fem/Beam';
import { IBeamSection } from '../../core/fem/types';
import { NodePropertiesDialog } from '../NodePropertiesDialog/NodePropertiesDialog';
import { BarPropertiesDialog } from '../BarPropertiesDialog/BarPropertiesDialog';
import { SectionPropertiesDialog } from '../SectionPropertiesDialog/SectionPropertiesDialog';
import { useI18n } from '../../i18n/i18n';
import {
  ChevronRight, ChevronLeft, FolderOpen, CircleDot, Circle, Minus,
  Triangle, Diamond, Palette, Square, Box, RectangleHorizontal,
  ArrowDown, ClipboardList, BarChart3, TrendingUp, Move,
  Info, Hash, Layers, Plus
} from 'lucide-react';
import './ProjectBrowser.css';

interface ProjectBrowserProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ProjectBrowser({ collapsed, onToggleCollapse }: ProjectBrowserProps) {
  const { t } = useI18n();
  const { state, dispatch, pushUndo } = useFEM();
  const { mesh, selection, result, showMoment, showShear, showNormal, showDeflections, showDeformed, showReactions, loadCases, activeLoadCase, loadCombinations, activeCombination, stressType, showDiagramValues, analysisType, deformationScale, diagramScale, browserTab: activeTab } = state;

  const setActiveTab = (tab: BrowserTab) => dispatch({ type: 'SET_BROWSER_TAB', payload: tab });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    model: true,
    nodes: true,
    members: true,
    supports: false,
    materials: false,
    sections: false,
    loads: true,
    diagrams: true,
    stresses: false,
    stressesStress: false,
    stressesBending: false,
    stressesShear: false,
    stressesMembrane: false,
    reactions: true,
    displacements: true
  });

  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingBarId, setEditingBarId] = useState<number | null>(null);
  const [viewingSection, setViewingSection] = useState<{ name: string; section: IBeamSection } | null>(null);
  const [showNewSectionDialog, setShowNewSectionDialog] = useState(false);
  const [customSections, setCustomSections] = useState<{ name: string; section: IBeamSection }[]>([]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectNode = (nodeId: number) => {
    dispatch({
      type: 'SET_SELECTION',
      payload: { nodeIds: new Set([nodeId]), elementIds: new Set() }
    });
  };

  const selectElement = (elementId: number) => {
    dispatch({
      type: 'SET_SELECTION',
      payload: { nodeIds: new Set(), elementIds: new Set([elementId]) }
    });
  };

  const activateResultView = (opts: { moment?: boolean; shear?: boolean; normal?: boolean; deflections?: boolean; deformed?: boolean; reactions?: boolean }) => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
    if (opts.moment !== undefined) dispatch({ type: 'SET_SHOW_MOMENT', payload: opts.moment });
    if (opts.shear !== undefined) dispatch({ type: 'SET_SHOW_SHEAR', payload: opts.shear });
    if (opts.normal !== undefined) dispatch({ type: 'SET_SHOW_NORMAL', payload: opts.normal });
    if (opts.deflections !== undefined) dispatch({ type: 'SET_SHOW_DEFLECTIONS', payload: opts.deflections });
    if (opts.deformed !== undefined) dispatch({ type: 'SET_SHOW_DEFORMED', payload: opts.deformed });
    if (opts.reactions !== undefined) dispatch({ type: 'SET_SHOW_REACTIONS', payload: opts.reactions });
  };

  const nodes = Array.from(mesh.nodes.values());
  const structuralNodes = nodes.filter(n => n.id < 1000);
  const plateNodes = nodes.filter(n => n.id >= 1000);
  const beams = Array.from(mesh.beamElements.values());
  const materials = Array.from(mesh.materials.values());
  const supportedNodes = nodes.filter(n => n.constraints.x || n.constraints.y || n.constraints.rotation);
  const loadedNodes = nodes.filter(n => n.loads.fx !== 0 || n.loads.fy !== 0 || n.loads.moment !== 0);

  const isResultActive = (check: string) => {
    if (state.viewMode !== 'results') return false;
    switch (check) {
      case 'moment': return showMoment;
      case 'shear': return showShear;
      case 'normal': return showNormal;
      case 'deflections': return showDeflections;
      case 'reactions': return showReactions;
      case 'displacement': return showDeformed;
      default: return false;
    }
  };

  if (collapsed) {
    return (
      <div className="project-browser collapsed-panel" onClick={onToggleCollapse}>
        <ChevronRight size={14} />
        <span className="collapsed-label">Browser</span>
      </div>
    );
  }

  return (
    <div className="project-browser">
      <div className="browser-header">
        {onToggleCollapse && (
          <button className="browser-collapse-btn" onClick={onToggleCollapse} title="Collapse">
            <ChevronLeft size={14} />
          </button>
        )}
        <span className="browser-title">{t('browser.title')}</span>
        <button
          className="project-info-btn"
          onClick={() => setShowProjectInfo(!showProjectInfo)}
          title={t('browser.projectInfo')}
        >
          <Info size={14} />
        </button>
      </div>

      {/* Horizontal tabs */}
      <div className="browser-tabs">
        <button
          className={`browser-tab ${activeTab === 'project' ? 'active' : ''}`}
          onClick={() => setActiveTab('project')}
        >
          {t('browser.title')}
        </button>
        <button
          className={`browser-tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          {t('loadCaseTabs.results')}
        </button>
      </div>

      {showProjectInfo && (
        <div className="project-info-panel">
          <div className="project-info-row">
            <span className="project-info-label">{t('browser.title')}</span>
            <span className="project-info-value">{t('browser.untitled')}</span>
          </div>
          <div className="project-info-row">
            <span className="project-info-label">{t('browser.nodes')}</span>
            <span className="project-info-value">{nodes.length}</span>
          </div>
          <div className="project-info-row">
            <span className="project-info-label">{t('browser.members')}</span>
            <span className="project-info-value">{beams.length}</span>
          </div>
          <div className="project-info-row">
            <span className="project-info-label">{t('browser.supports')}</span>
            <span className="project-info-value">{supportedNodes.length}</span>
          </div>
          <div className="project-info-row">
            <span className="project-info-label">{t('browser.analysis')}</span>
            <span className="project-info-value">{state.analysisType}</span>
          </div>
          <div className="project-info-row">
            <span className="project-info-label">{t('browser.status')}</span>
            <span className="project-info-value">{result ? t('browser.solved') : t('browser.notSolved')}</span>
          </div>
        </div>
      )}

      <div className="browser-tree">
        {activeTab === 'project' && (
          <>
            {/* Model Section */}
            <div className="tree-section">
              <div className="tree-item root" onClick={() => toggleExpand('model')}>
                <span className={`tree-arrow ${expanded.model ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                <span className="tree-icon"><FolderOpen size={14} /></span>
                <span className="tree-label">{t('browser.model')}</span>
              </div>

              {expanded.model && (
                <div className="tree-children">
                  {/* Nodes */}
                  <div className="tree-item" onClick={() => toggleExpand('nodes')}>
                    <span className={`tree-arrow ${expanded.nodes ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                    <span className="tree-icon"><CircleDot size={14} /></span>
                    <span className="tree-label">{t('browser.nodes')}</span>
                    <span className="tree-count">{structuralNodes.length}</span>
                  </div>
                  {expanded.nodes && (
                    <div className="tree-children">
                      {structuralNodes.map(node => (
                        <div
                          key={node.id}
                          className={`tree-item leaf ${selection.nodeIds.has(node.id) ? 'selected' : ''}`}
                          onClick={() => selectNode(node.id)}
                          onDoubleClick={() => setEditingNodeId(node.id)}
                        >
                          <span className="tree-icon small"><Circle size={10} /></span>
                          <span className="tree-label">Node {node.id}</span>
                          <span className="tree-info">X:{(node.x * 1000).toFixed(0)} Z:{(node.y * 1000).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Plate Nodes */}
                  {plateNodes.length > 0 && (
                    <>
                      <div className="tree-item" onClick={() => toggleExpand('plateNodes' as keyof typeof expanded)}>
                        <span className={`tree-arrow ${(expanded as Record<string, boolean>)['plateNodes'] ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                        <span className="tree-icon" style={{ color: '#8b949e' }}><CircleDot size={14} /></span>
                        <span className="tree-label" style={{ color: '#8b949e' }}>{t('browser.plateNodes')}</span>
                        <span className="tree-count">{plateNodes.length}</span>
                      </div>
                      {(expanded as Record<string, boolean>)['plateNodes'] && (
                        <div className="tree-children">
                          {plateNodes.map(node => (
                            <div
                              key={node.id}
                              className={`tree-item leaf ${selection.nodeIds.has(node.id) ? 'selected' : ''}`}
                              onClick={() => selectNode(node.id)}
                            >
                              <span className="tree-icon small" style={{ color: '#8b949e' }}><Circle size={8} /></span>
                              <span className="tree-label" style={{ color: '#8b949e' }}>Node {node.id}</span>
                              <span className="tree-info">X:{(node.x * 1000).toFixed(0)} Z:{(node.y * 1000).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Plates */}
                  {mesh.plateRegions.size > 0 && (
                    <>
                      <div className="tree-item" onClick={() => toggleExpand('plates' as keyof typeof expanded)}>
                        <span className={`tree-arrow ${(expanded as Record<string, boolean>)['plates'] ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                        <span className="tree-icon"><RectangleHorizontal size={14} /></span>
                        <span className="tree-label">{t('browser.plates')}</span>
                        <span className="tree-count">{mesh.plateRegions.size}</span>
                      </div>
                      {(expanded as Record<string, boolean>)['plates'] && (
                        <div className="tree-children">
                          {Array.from(mesh.plateRegions.values()).map(p => (
                            <div
                              key={p.id}
                              className={`tree-item leaf ${selection.plateIds.has(p.id) ? 'selected' : ''}`}
                              onClick={() => dispatch({ type: 'SELECT_PLATE', payload: p.id })}
                            >
                              <span className="tree-icon small"><RectangleHorizontal size={10} /></span>
                              <span className="tree-label">Plate {p.id}</span>
                              <span className="tree-info">{p.elementIds.length} elem, {p.edgeIds?.length ?? 0} edges</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Members */}
                  <div className="tree-item" onClick={() => toggleExpand('members')}>
                    <span className={`tree-arrow ${expanded.members ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                    <span className="tree-icon"><Minus size={14} /></span>
                    <span className="tree-label">{t('browser.members')}</span>
                    <span className="tree-count">{beams.length}</span>
                  </div>
                  {expanded.members && (
                    <div className="tree-children">
                      {beams.map(beam => {
                        const n1 = mesh.getNode(beam.nodeIds[0]);
                        const n2 = mesh.getNode(beam.nodeIds[1]);
                        return (
                          <div
                            key={beam.id}
                            className={`tree-item leaf ${selection.elementIds.has(beam.id) ? 'selected' : ''}`}
                            onClick={() => selectElement(beam.id)}
                            onDoubleClick={() => setEditingBarId(beam.id)}
                          >
                            <span className="tree-icon small"><Minus size={10} /></span>
                            <span className="tree-label">Beam {beam.id}</span>
                            <span className="tree-info">{n1?.id}-{n2?.id}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Supports */}
                  <div className="tree-item" onClick={() => toggleExpand('supports')}>
                    <span className={`tree-arrow ${expanded.supports ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                    <span className="tree-icon"><Triangle size={14} /></span>
                    <span className="tree-label">{t('browser.supports')}</span>
                    <span className="tree-count">{supportedNodes.length}</span>
                  </div>
                  {expanded.supports && (
                    <div className="tree-children">
                      {supportedNodes.map(node => {
                        let type = t('browser.custom');
                        if (node.constraints.x && node.constraints.y && node.constraints.rotation) {
                          type = t('browser.fixed');
                        } else if (node.constraints.x && node.constraints.y) {
                          type = t('browser.pinned');
                        } else if (node.constraints.y) {
                          type = t('browser.rollerZ');
                        } else if (node.constraints.x) {
                          type = t('browser.rollerX');
                        }
                        return (
                          <div
                            key={node.id}
                            className={`tree-item leaf ${selection.nodeIds.has(node.id) ? 'selected' : ''}`}
                            onClick={() => selectNode(node.id)}
                          >
                            <span className="tree-icon small"><Diamond size={10} /></span>
                            <span className="tree-label">Node {node.id}</span>
                            <span className="tree-info">{type}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Materials */}
                  <div className="tree-item" onClick={() => toggleExpand('materials')}>
                    <span className={`tree-arrow ${expanded.materials ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                    <span className="tree-icon"><Palette size={14} /></span>
                    <span className="tree-label">{t('browser.materials')}</span>
                    <span className="tree-count">{materials.length}</span>
                  </div>
                  {expanded.materials && (
                    <div className="tree-children">
                      {materials.slice(0, 5).map(mat => (
                        <div key={mat.id} className="tree-item leaf">
                          <span className="tree-icon small" style={{ color: mat.color }}><Square size={10} /></span>
                          <span className="tree-label">{mat.name}</span>
                          <span className="tree-info">E={mat.E / 1e9}GPa</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sections */}
                  <div className="tree-item" onClick={() => toggleExpand('sections')}>
                    <span className={`tree-arrow ${expanded.sections ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                    <span className="tree-icon"><Box size={14} /></span>
                    <span className="tree-label">{t('browser.sections')}</span>
                    <span className="tree-count">{DEFAULT_SECTIONS.length + customSections.length}</span>
                    <button
                      className="tree-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowNewSectionDialog(true);
                      }}
                      title="Add custom section"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {expanded.sections && (
                    <div className="tree-children">
                      {[...DEFAULT_SECTIONS, ...customSections].map(sec => (
                        <div
                          key={sec.name}
                          className="tree-item leaf"
                          onDoubleClick={() => setViewingSection(sec)}
                          title={t('browser.doubleClickProps')}
                        >
                          <span className="tree-icon small"><RectangleHorizontal size={10} /></span>
                          <span className="tree-label">{sec.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Loads Section */}
            <div className="tree-section">
              <div className="tree-item root" onClick={() => toggleExpand('loads')}>
                <span className={`tree-arrow ${expanded.loads ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                <span className="tree-icon"><ArrowDown size={14} /></span>
                <span className="tree-label">{t('ribbon.loads')}</span>
              </div>

              {expanded.loads && (
                <div className="tree-children">
                  {loadCases.map(lc => (
                    <div key={lc.id}>
                      <div
                        className={`tree-item ${activeLoadCase === lc.id ? 'active-result' : ''}`}
                        onClick={() => dispatch({ type: 'SET_ACTIVE_LOAD_CASE', payload: lc.id })}
                      >
                        <span className="tree-arrow" />
                        <span className="tree-icon"><ClipboardList size={14} /></span>
                        <span className="tree-label">{lc.name}</span>
                      </div>
                      {activeLoadCase === lc.id && (
                        <div className="tree-children">
                          {loadedNodes.map(node => (
                            <div
                              key={node.id}
                              className={`tree-item leaf ${selection.nodeIds.has(node.id) ? 'selected' : ''}`}
                              onClick={() => selectNode(node.id)}
                            >
                              <span className="tree-icon small"><ArrowDown size={10} /></span>
                              <span className="tree-label">Node {node.id}</span>
                              <span className="tree-info">
                                {node.loads.fy !== 0 && `Fz=${(node.loads.fy / 1000).toFixed(1)}kN`}
                              </span>
                            </div>
                          ))}
                          {(() => {
                            const activeLcLoads = loadCases.find(l => l.id === lc.id);
                            return (activeLcLoads?.distributedLoads ?? []).map((dl, idx) => {
                              const isIndividuallySelected = dl.id != null && selection.selectedDistLoadIds.has(dl.id);
                              return (
                                <div
                                  key={dl.id ?? `dl-${dl.elementId}-${idx}`}
                                  className={`tree-item leaf ${isIndividuallySelected ? 'selected' : ''}`}
                                  onClick={() => {
                                    dispatch({
                                      type: 'SET_SELECTION',
                                      payload: {
                                        nodeIds: new Set(),
                                        elementIds: new Set(),
                                        pointLoadNodeIds: new Set(),
                                        distLoadBeamIds: new Set([dl.elementId]),
                                        selectedDistLoadIds: new Set(dl.id != null ? [dl.id] : [])
                                      }
                                    });
                                  }}
                                >
                                  <span className="tree-icon small"><ArrowDown size={10} /></span>
                                  <span className="tree-label">
                                    {dl.description ? dl.description : `Beam ${dl.elementId}`}
                                  </span>
                                  <span className="tree-info">
                                    qy={(dl.qy / 1000).toFixed(1)}kN/m
                                    {dl.qyEnd != null && dl.qyEnd !== dl.qy ? `→${(dl.qyEnd / 1000).toFixed(1)}` : ''}
                                    {(dl.startT != null && dl.startT > 0) || (dl.endT != null && dl.endT < 1)
                                      ? ` (${((dl.startT ?? 0) * 100).toFixed(0)}%-${((dl.endT ?? 1) * 100).toFixed(0)}%)`
                                      : ''}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inline properties for individually selected distributed load */}
            {(() => {
              if (selection.selectedDistLoadIds.size !== 1) return null;
              const selectedLoadId = Array.from(selection.selectedDistLoadIds)[0];
              const activeLc = loadCases.find(lc => lc.id === activeLoadCase);
              const dl = activeLc?.distributedLoads.find(d => d.id === selectedLoadId);
              if (!dl || !activeLc) return null;
              const beam = mesh.getBeamElement(dl.elementId);
              const beamNodes = beam ? mesh.getBeamElementNodes(beam) : null;
              const beamLen = beamNodes ? calculateBeamLength(beamNodes[0], beamNodes[1]) : undefined;
              return (
                <div className="tree-section dist-load-properties">
                  <h4 className="dist-load-props-title">
                    Distributed Load{dl.description ? `: ${dl.description}` : ''} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(Beam {dl.elementId})</span>
                  </h4>
                  <div className="dist-load-props-grid">
                    <label>Description</label>
                    <input
                      type="text"
                      value={dl.description ?? ''}
                      placeholder="e.g. Self-weight"
                      onChange={(e) => {
                        pushUndo();
                        dispatch({
                          type: 'UPDATE_DISTRIBUTED_LOAD',
                          payload: { lcId: activeLc.id, loadId: selectedLoadId, qx: dl.qx, qy: dl.qy, qxEnd: dl.qxEnd, qyEnd: dl.qyEnd, startT: dl.startT, endT: dl.endT, coordSystem: dl.coordSystem, description: e.target.value }
                        });
                        dispatch({ type: 'REFRESH_MESH' });
                      }}
                    />

                    <label>qy start (kN/m)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={(dl.qy / 1000).toFixed(1)}
                      onChange={(e) => {
                        pushUndo();
                        const qy = (parseFloat(e.target.value) || 0) * 1000;
                        dispatch({
                          type: 'UPDATE_DISTRIBUTED_LOAD',
                          payload: { lcId: activeLc.id, loadId: selectedLoadId, qx: dl.qx, qy, qxEnd: dl.qxEnd, qyEnd: dl.qyEnd, startT: dl.startT, endT: dl.endT, coordSystem: dl.coordSystem, description: dl.description }
                        });
                        dispatch({ type: 'REFRESH_MESH' });
                        dispatch({ type: 'SET_RESULT', payload: null });
                      }}
                    />

                    <label>qy end (kN/m)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={((dl.qyEnd ?? dl.qy) / 1000).toFixed(1)}
                      onChange={(e) => {
                        pushUndo();
                        const qyEnd = (parseFloat(e.target.value) || 0) * 1000;
                        dispatch({
                          type: 'UPDATE_DISTRIBUTED_LOAD',
                          payload: { lcId: activeLc.id, loadId: selectedLoadId, qx: dl.qx, qy: dl.qy, qxEnd: dl.qxEnd, qyEnd, startT: dl.startT, endT: dl.endT, coordSystem: dl.coordSystem, description: dl.description }
                        });
                        dispatch({ type: 'REFRESH_MESH' });
                        dispatch({ type: 'SET_RESULT', payload: null });
                      }}
                    />

                    <label>Start position</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={(dl.startT ?? 0).toFixed(2)}
                      onChange={(e) => {
                        pushUndo();
                        const startT = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                        dispatch({
                          type: 'UPDATE_DISTRIBUTED_LOAD',
                          payload: { lcId: activeLc.id, loadId: selectedLoadId, qx: dl.qx, qy: dl.qy, qxEnd: dl.qxEnd, qyEnd: dl.qyEnd, startT, endT: dl.endT, coordSystem: dl.coordSystem, description: dl.description }
                        });
                        dispatch({ type: 'REFRESH_MESH' });
                        dispatch({ type: 'SET_RESULT', payload: null });
                      }}
                    />
                    {beamLen && <span className="dist-load-props-hint">= {((dl.startT ?? 0) * beamLen * 1000).toFixed(0)} mm</span>}

                    <label>End position</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={(dl.endT ?? 1).toFixed(2)}
                      onChange={(e) => {
                        pushUndo();
                        const endT = Math.max(0, Math.min(1, parseFloat(e.target.value) || 1));
                        dispatch({
                          type: 'UPDATE_DISTRIBUTED_LOAD',
                          payload: { lcId: activeLc.id, loadId: selectedLoadId, qx: dl.qx, qy: dl.qy, qxEnd: dl.qxEnd, qyEnd: dl.qyEnd, startT: dl.startT, endT, coordSystem: dl.coordSystem, description: dl.description }
                        });
                        dispatch({ type: 'REFRESH_MESH' });
                        dispatch({ type: 'SET_RESULT', payload: null });
                      }}
                    />
                    {beamLen && <span className="dist-load-props-hint">= {((dl.endT ?? 1) * beamLen * 1000).toFixed(0)} mm</span>}

                    <label>Coord. system</label>
                    <select
                      value={dl.coordSystem ?? 'local'}
                      onChange={(e) => {
                        pushUndo();
                        const coordSystem = e.target.value as 'local' | 'global';
                        dispatch({
                          type: 'UPDATE_DISTRIBUTED_LOAD',
                          payload: { lcId: activeLc.id, loadId: selectedLoadId, qx: dl.qx, qy: dl.qy, qxEnd: dl.qxEnd, qyEnd: dl.qyEnd, startT: dl.startT, endT: dl.endT, coordSystem, description: dl.description }
                        });
                        dispatch({ type: 'REFRESH_MESH' });
                        dispatch({ type: 'SET_RESULT', payload: null });
                      }}
                    >
                      <option value="local">Local</option>
                      <option value="global">Global</option>
                    </select>

                    <label>Load case</label>
                    <span className="dist-load-props-value">{activeLc.name}</span>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {activeTab === 'results' && (
          <>
            {/* Load Case / Combination Selector */}
            <div className="results-lc-selector">
              <span className="results-lc-label">{t('browser.loadCases')}</span>
              <select
                className="results-lc-select"
                value={activeCombination !== null ? `combo-${activeCombination}` : `lc-${activeLoadCase}`}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('combo-')) {
                    const comboId = parseInt(val.replace('combo-', ''));
                    dispatch({ type: 'SET_ACTIVE_COMBINATION', payload: comboId });
                  } else {
                    dispatch({ type: 'SET_ACTIVE_COMBINATION', payload: null });
                    dispatch({ type: 'SET_ACTIVE_LOAD_CASE', payload: parseInt(val.replace('lc-', '')) });
                  }
                }}
              >
                <optgroup label="Load Cases">
                  {loadCases.map(lc => (
                    <option key={`lc-${lc.id}`} value={`lc-${lc.id}`}>{lc.name}</option>
                  ))}
                </optgroup>
                {loadCombinations.length > 0 && (
                  <optgroup label="Combinations">
                    {loadCombinations.map(combo => (
                      <option key={`combo-${combo.id}`} value={`combo-${combo.id}`}>{combo.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Values toggle */}
            <div className="results-values-toggle">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showDiagramValues}
                  onChange={(e) => dispatch({ type: 'SET_SHOW_DIAGRAM_VALUES', payload: e.target.checked })}
                />
                <span className="toggle-text"><Hash size={10} style={{ marginRight: 4 }} />{t('browser.showValues')}</span>
              </label>
            </div>

            {!result && (
              <div className="results-empty">
                <BarChart3 size={24} />
                <span>{t('browser.noResults')}</span>
                <span className="results-empty-hint">{t('browser.runAnalysis')}</span>
              </div>
            )}

            {result && (
              <>
                {/* Diagrams (frame analysis) */}
                {analysisType === 'frame' && (
                  <div className="tree-section">
                    <div className="tree-item root" onClick={() => toggleExpand('diagrams')}>
                      <span className={`tree-arrow ${expanded.diagrams ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                      <span className="tree-icon"><BarChart3 size={14} /></span>
                      <span className="tree-label">{t('browser.diagrams')}</span>
                    </div>

                    {expanded.diagrams && (
                      <div className="tree-children">
                        <div
                          className={`tree-item leaf result-option ${isResultActive('moment') ? 'active-result' : ''}`}
                          onClick={() => activateResultView({ moment: !showMoment })}
                        >
                          <span className="tree-icon small" style={{ color: '#ef4444' }}><TrendingUp size={10} /></span>
                          <span className="tree-label">{t('browser.bendingMoment')}</span>
                        </div>
                        <div
                          className={`tree-item leaf result-option ${isResultActive('shear') ? 'active-result' : ''}`}
                          onClick={() => activateResultView({ shear: !showShear })}
                        >
                          <span className="tree-icon small" style={{ color: '#3b82f6' }}><TrendingUp size={10} /></span>
                          <span className="tree-label">{t('browser.shearForce')}</span>
                        </div>
                        <div
                          className={`tree-item leaf result-option ${isResultActive('normal') ? 'active-result' : ''}`}
                          onClick={() => activateResultView({ normal: !showNormal })}
                        >
                          <span className="tree-icon small" style={{ color: '#22c55e' }}><TrendingUp size={10} /></span>
                          <span className="tree-label">{t('browser.normalForce')}</span>
                        </div>
                        <div
                          className={`tree-item leaf result-option ${isResultActive('deflections') ? 'active-result' : ''}`}
                          onClick={() => activateResultView({ deflections: !showDeflections })}
                        >
                          <span className="tree-icon small" style={{ color: '#8b5cf6' }}><Move size={10} /></span>
                          <span className="tree-label">{t('browser.deflections')} ({'\u03B4'})</span>
                        </div>
                      </div>
                    )}

                    {(showMoment || showShear || showNormal || showDeflections) && (
                      <div className="results-scale-row">
                        <span>Diagram Scale</span>
                        <input
                          type="range"
                          min="10"
                          max="200"
                          value={diagramScale}
                          onChange={(e) => dispatch({ type: 'SET_DIAGRAM_SCALE', payload: parseInt(e.target.value) })}
                        />
                        <span className="results-scale-value">{diagramScale}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Plate stresses/forces */}
                <div className="tree-section">
                  <div className="tree-item root" style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`tree-arrow ${expanded.stresses ? 'expanded' : ''}`} onClick={() => toggleExpand('stresses')}><ChevronRight size={12} /></span>
                    <span className="tree-icon" onClick={() => toggleExpand('stresses')}><Layers size={14} /></span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flex: 1 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={state.showStressGradient}
                        onChange={() => dispatch({ type: 'TOGGLE_STRESS_GRADIENT' })}
                        style={{ margin: 0 }}
                      />
                      <span className="tree-label" onClick={() => toggleExpand('stresses')}>{t('browser.plateStresses')}</span>
                    </label>
                  </div>

                  {expanded.stresses && (
                    <div className="tree-children">
                      {/* Display mode toggle */}
                      <div className="tree-item" style={{ paddingLeft: 12, gap: 8 }}>
                        <span className="tree-label" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('browser.display')}</span>
                        <select
                          value={state.stressDisplayMode}
                          onChange={(e) => dispatch({ type: 'SET_STRESS_DISPLAY_MODE', payload: e.target.value as 'element' | 'smoothed' })}
                          style={{
                            flex: 1,
                            padding: '2px 4px',
                            fontSize: 10,
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            borderRadius: 3,
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="element">{t('browser.perElement')}</option>
                          <option value="smoothed">{t('browser.smoothed')}</option>
                        </select>
                      </div>

                      {/* Stresses sub-group */}
                      <div className="tree-item root" onClick={() => toggleExpand('stressesStress')} style={{ paddingLeft: 8 }}>
                        <span className={`tree-arrow ${expanded.stressesStress ? 'expanded' : ''}`}><ChevronRight size={10} /></span>
                        <span className="tree-label" style={{ fontSize: 11 }}>{t('browser.stresses')}</span>
                      </div>
                      {expanded.stressesStress && (
                        <div className="tree-children" style={{ paddingLeft: 12 }}>
                          {([
                            { key: 'vonMises', label: '\u03C3 Von Mises', color: '#f59e0b' },
                            { key: 'sigmaX', label: '\u03C3x', color: '#ef4444' },
                            { key: 'sigmaY', label: '\u03C3y', color: '#3b82f6' },
                            { key: 'tauXY', label: '\u03C4xy', color: '#22c55e' },
                          ] as const).map(item => (
                            <div
                              key={item.key}
                              className={`tree-item leaf result-option ${stressType === item.key ? 'active-result' : ''}`}
                              onClick={() => {
                                dispatch({ type: 'SET_STRESS_TYPE', payload: item.key });
                                dispatch({ type: 'SET_SHOW_STRESS', payload: true });
                                dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
                              }}
                            >
                              <span className="tree-icon small" style={{ color: item.color }}><Layers size={10} /></span>
                              <span className="tree-label">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Bending moments sub-group */}
                      <div className="tree-item root" onClick={() => toggleExpand('stressesBending')} style={{ paddingLeft: 8 }}>
                        <span className={`tree-arrow ${expanded.stressesBending ? 'expanded' : ''}`}><ChevronRight size={10} /></span>
                        <span className="tree-label" style={{ fontSize: 11 }}>{t('browser.bendingMoments')}</span>
                      </div>
                      {expanded.stressesBending && (
                        <div className="tree-children" style={{ paddingLeft: 12 }}>
                          {([
                            { key: 'mx', label: 'mxx', color: '#a855f7' },
                            { key: 'my', label: 'myy', color: '#6366f1' },
                            { key: 'mxy', label: 'mxy', color: '#8b5cf6' },
                            { key: 'momentTrajectory', label: 'Trajectory', color: '#7c3aed' },
                          ] as const).map(item => (
                            <div
                              key={item.key}
                              className={`tree-item leaf result-option ${stressType === item.key ? 'active-result' : ''}`}
                              onClick={() => {
                                dispatch({ type: 'SET_STRESS_TYPE', payload: item.key });
                                dispatch({ type: 'SET_SHOW_STRESS', payload: true });
                                dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
                              }}
                            >
                              <span className="tree-icon small" style={{ color: item.color }}><Layers size={10} /></span>
                              <span className="tree-label">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Shear forces sub-group */}
                      <div className="tree-item root" onClick={() => toggleExpand('stressesShear')} style={{ paddingLeft: 8 }}>
                        <span className={`tree-arrow ${expanded.stressesShear ? 'expanded' : ''}`}><ChevronRight size={10} /></span>
                        <span className="tree-label" style={{ fontSize: 11 }}>{t('browser.shearForces')}</span>
                      </div>
                      {expanded.stressesShear && (
                        <div className="tree-children" style={{ paddingLeft: 12 }}>
                          {([
                            { key: 'vx', label: 'vx', color: '#f97316' },
                            { key: 'vy', label: 'vy', color: '#fb923c' },
                            { key: 'shearTrajectory', label: 'Trajectory', color: '#ea580c' },
                          ] as const).map(item => (
                            <div
                              key={item.key}
                              className={`tree-item leaf result-option ${stressType === item.key ? 'active-result' : ''}`}
                              onClick={() => {
                                dispatch({ type: 'SET_STRESS_TYPE', payload: item.key });
                                dispatch({ type: 'SET_SHOW_STRESS', payload: true });
                                dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
                              }}
                            >
                              <span className="tree-icon small" style={{ color: item.color }}><Layers size={10} /></span>
                              <span className="tree-label">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Membrane forces sub-group */}
                      <div className="tree-item root" onClick={() => toggleExpand('stressesMembrane')} style={{ paddingLeft: 8 }}>
                        <span className={`tree-arrow ${expanded.stressesMembrane ? 'expanded' : ''}`}><ChevronRight size={10} /></span>
                        <span className="tree-label" style={{ fontSize: 11 }}>{t('browser.membraneForces')}</span>
                      </div>
                      {expanded.stressesMembrane && (
                        <div className="tree-children" style={{ paddingLeft: 12 }}>
                          {([
                            { key: 'nx', label: 'nxx', color: '#14b8a6' },
                            { key: 'ny', label: 'nyy', color: '#2dd4bf' },
                            { key: 'nxy', label: 'nxy', color: '#5eead4' },
                            { key: 'normals', label: 'Normals', color: '#0d9488' },
                          ] as const).map(item => (
                            <div
                              key={item.key}
                              className={`tree-item leaf result-option ${stressType === item.key ? 'active-result' : ''}`}
                              onClick={() => {
                                dispatch({ type: 'SET_STRESS_TYPE', payload: item.key });
                                dispatch({ type: 'SET_SHOW_STRESS', payload: true });
                                dispatch({ type: 'SET_VIEW_MODE', payload: 'results' });
                              }}
                            >
                              <span className="tree-icon small" style={{ color: item.color }}><Layers size={10} /></span>
                              <span className="tree-label">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Reactions */}
                <div className="tree-section">
                  <div className="tree-item root" onClick={() => toggleExpand('reactions')}>
                    <span className={`tree-arrow ${expanded.reactions ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                    <span className="tree-icon"><Triangle size={14} /></span>
                    <span className="tree-label">{t('browser.reactions')}</span>
                  </div>

                  {expanded.reactions && (
                    <div className="tree-children">
                      <div
                        className={`tree-item leaf result-option ${isResultActive('reactions') ? 'active-result' : ''}`}
                        onClick={() => activateResultView({ reactions: !showReactions })}
                      >
                        <span className="tree-icon small" style={{ color: '#10b981' }}><Triangle size={10} /></span>
                        <span className="tree-label">{t('browser.showReactions')}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Displacements */}
                <div className="tree-section">
                  <div className="tree-item root" onClick={() => toggleExpand('displacements')}>
                    <span className={`tree-arrow ${expanded.displacements ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
                    <span className="tree-icon"><Move size={14} /></span>
                    <span className="tree-label">{t('browser.displacements')}</span>
                  </div>

                  {expanded.displacements && (
                    <div className="tree-children">
                      <div className="results-values-toggle">
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={state.showDisplacements}
                            onChange={(e) => dispatch({ type: 'SET_SHOW_DISPLACEMENTS', payload: e.target.checked })}
                          />
                          <span className="toggle-text">{t('browser.showDisplacements')}</span>
                        </label>
                      </div>
                      <div
                        className={`tree-item leaf result-option ${isResultActive('displacement') ? 'active-result' : ''}`}
                        onClick={() => activateResultView({ deformed: !showDeformed })}
                      >
                        <span className="tree-icon small" style={{ color: '#f59e0b' }}><Move size={10} /></span>
                        <span className="tree-label">{t('browser.deformedShape')}</span>
                      </div>
                      {showDeformed && (
                        <div className="results-scale-row">
                          <span>{t('browser.deformationScale')}</span>
                          <input
                            type="range"
                            min="1"
                            max="500"
                            value={deformationScale}
                            onChange={(e) => dispatch({ type: 'SET_DEFORMATION_SCALE', payload: parseInt(e.target.value) })}
                          />
                          <span className="results-scale-value">{deformationScale}x</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {editingNodeId !== null && (() => {
        const node = mesh.getNode(editingNodeId);
        if (!node) return null;
        return (
          <NodePropertiesDialog
            node={node}
            onUpdate={(updates) => {
              pushUndo();
              if (updates.x !== undefined || updates.y !== undefined) {
                mesh.updateNode(editingNodeId, {
                  x: updates.x ?? node.x,
                  y: updates.y ?? node.y
                });
              }
              if (updates.constraints) {
                mesh.updateNode(editingNodeId, { constraints: updates.constraints });
              }
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
            }}
            onClose={() => setEditingNodeId(null)}
          />
        );
      })()}
      {editingBarId !== null && (() => {
        const beam = mesh.getBeamElement(editingBarId);
        if (!beam) return null;
        const nodes = mesh.getBeamElementNodes(beam);
        if (!nodes) return null;
        const length = calculateBeamLength(nodes[0], nodes[1]);
        const beamMaterial = mesh.getMaterial(beam.materialId);
        const editBarForces = result?.beamForces.get(editingBarId);
        return (
          <BarPropertiesDialog
            beam={beam}
            length={length}
            material={beamMaterial}
            beamForces={editBarForces}
            layers={Array.from(mesh.layers.values())}
            onUpdate={(updates) => {
              pushUndo();
              mesh.updateBeamElement(editingBarId, updates);
              dispatch({ type: 'REFRESH_MESH' });
              dispatch({ type: 'SET_RESULT', payload: null });
            }}
            onClose={() => setEditingBarId(null)}
          />
        );
      })()}

      {/* Section properties dialog (view) */}
      {viewingSection && (
        <SectionPropertiesDialog
          section={viewingSection}
          onClose={() => setViewingSection(null)}
        />
      )}

      {/* New section dialog */}
      {showNewSectionDialog && (
        <SectionPropertiesDialog
          isNew
          onSave={(name, section) => {
            setCustomSections(prev => [...prev, { name, section }]);
            mesh.sections.set(name, section);
          }}
          onClose={() => setShowNewSectionDialog(false)}
        />
      )}
    </div>
  );
}
