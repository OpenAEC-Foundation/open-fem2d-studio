/**
 * TableEditorPanel — Spreadsheet-style editor for nodes, elements, loads, etc.
 * Like een extern pakket or extern table view
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
import { INode } from '../../core/fem/types';
import { calculateBeamLength } from '../../core/fem/Beam';
import { Trash2, Download } from 'lucide-react';
import './TableEditorPanel.css';

type TableType = 'nodes' | 'beams' | 'materials' | 'loads' | 'supports';

export const TableEditorPanel: React.FC = () => {
  const { state, dispatch } = useFEM();
  const { mesh, loadCases, activeLoadCase } = state;
  const [activeTable, setActiveTable] = useState<TableType>('nodes');
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const nodes = useMemo(() => Array.from(mesh.nodes.values()), [mesh.nodes]);
  const beams = useMemo(() => Array.from(mesh.beamElements.values()), [mesh.beamElements]);
  const materials = useMemo(() => Array.from(mesh.materials.values()), [mesh.materials]);
  const activeLC = useMemo(() => loadCases.find(lc => lc.id === activeLoadCase), [loadCases, activeLoadCase]);

  // Start editing a cell
  const startEdit = useCallback((id: number, field: string, value: string) => {
    setEditingCell({ id, field });
    setEditValue(value);
  }, []);

  // Commit edit
  const commitEdit = useCallback(() => {
    if (!editingCell) return;

    const { id, field } = editingCell;
    const numValue = parseFloat(editValue);

    if (activeTable === 'nodes') {
      const node = mesh.nodes.get(id);
      if (!node) return;

      if (field === 'x' || field === 'y') {
        if (isNaN(numValue)) return;
        const updates: Partial<INode> = {};
        if (field === 'x') updates.x = numValue / 1000; // mm to m
        if (field === 'y') updates.y = numValue / 1000;
        mesh.updateNode(id, updates);
        dispatch({ type: 'REFRESH_MESH' });
      } else if (field === 'fx' || field === 'fy' || field === 'moment') {
        if (isNaN(numValue)) return;
        const loads = { ...node.loads };
        if (field === 'fx') loads.fx = numValue * 1000; // kN to N
        if (field === 'fy') loads.fy = numValue * 1000;
        if (field === 'moment') loads.moment = numValue * 1000; // kNm to Nm
        mesh.updateNode(id, { loads });
        dispatch({ type: 'REFRESH_MESH' });
      } else if (field === 'support') {
        // Parse support type
        const val = editValue.toLowerCase().trim();
        let constraints = { x: false, y: false, rotation: false };
        if (val === 'fixed' || val === 'f') {
          constraints = { x: true, y: true, rotation: true };
        } else if (val === 'pinned' || val === 'p') {
          constraints = { x: true, y: true, rotation: false };
        } else if (val === 'roller z' || val === 'rz' || val === 'z') {
          constraints = { x: false, y: true, rotation: false };
        } else if (val === 'roller x' || val === 'rx' || val === 'x') {
          constraints = { x: true, y: false, rotation: false };
        }
        mesh.updateNode(id, { constraints });
        dispatch({ type: 'REFRESH_MESH' });
      }
    } else if (activeTable === 'beams') {
      const beam = mesh.beamElements.get(id);
      if (!beam) return;

      if (field === 'qy') {
        if (isNaN(numValue)) return;
        const distributedLoad = beam.distributedLoad || { qx: 0, qy: 0 };
        mesh.updateBeamElement(id, { distributedLoad: { ...distributedLoad, qy: numValue * 1000 } });
        dispatch({ type: 'REFRESH_MESH' });
      }
    }

    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, activeTable, mesh, dispatch]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // Get support type string
  const getSupportType = (node: INode): string => {
    const { x, y, rotation } = node.constraints;
    if (x && y && rotation) return 'Fixed';
    if (x && y) return 'Pinned';
    if (y) return 'Roller Z';
    if (x) return 'Roller X';
    return 'Free';
  };

  // Delete selected node
  const deleteNode = useCallback((id: number) => {
    // First remove any beam elements connected to this node
    const connectedBeams = Array.from(mesh.beamElements.values()).filter(
      b => b.nodeIds[0] === id || b.nodeIds[1] === id
    );
    for (const beam of connectedBeams) {
      mesh.removeElement(beam.id);
    }
    mesh.removeNode(id);
    dispatch({ type: 'REFRESH_MESH' });
  }, [mesh, dispatch]);

  // Delete selected beam
  const deleteBeam = useCallback((id: number) => {
    mesh.removeElement(id);
    dispatch({ type: 'REFRESH_MESH' });
  }, [mesh, dispatch]);

  // Export table to CSV
  const exportToCSV = useCallback(() => {
    let csv = '';
    if (activeTable === 'nodes') {
      csv = 'Node,X (mm),Z (mm),Support,Fx (kN),Fz (kN),M (kNm)\n';
      nodes.forEach(n => {
        csv += `${n.id},${(n.x * 1000).toFixed(1)},${(n.y * 1000).toFixed(1)},${getSupportType(n)},${(n.loads.fx / 1000).toFixed(2)},${(n.loads.fy / 1000).toFixed(2)},${(n.loads.moment / 1000).toFixed(2)}\n`;
      });
    } else if (activeTable === 'beams') {
      csv = 'Beam,Node i,Node j,Profile,L (mm),qy (kN/m)\n';
      beams.forEach(b => {
        const beamNodes = mesh.getBeamElementNodes(b);
        const L = beamNodes ? calculateBeamLength(beamNodes[0], beamNodes[1]) * 1000 : 0;
        const qy = b.distributedLoad?.qy ?? 0;
        csv += `${b.id},${b.nodeIds[0]},${b.nodeIds[1]},${b.profileName || 'Custom'},${L.toFixed(0)},${(qy / 1000).toFixed(2)}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTable}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeTable, nodes, beams, mesh]);

  // Render editable cell
  const renderCell = (id: number, field: string, value: string, editable = true) => {
    const isEditing = editingCell?.id === id && editingCell?.field === field;

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          autoFocus
          className="table-cell-input"
        />
      );
    }

    return (
      <span
        className={editable ? 'editable-cell' : ''}
        onDoubleClick={() => editable && startEdit(id, field, value)}
      >
        {value}
      </span>
    );
  };

  return (
    <div className="table-editor-panel">
      {/* Table selector */}
      <div className="table-editor-toolbar">
        <div className="table-selector">
          <button
            className={activeTable === 'nodes' ? 'active' : ''}
            onClick={() => setActiveTable('nodes')}
          >
            Nodes ({nodes.length})
          </button>
          <button
            className={activeTable === 'beams' ? 'active' : ''}
            onClick={() => setActiveTable('beams')}
          >
            Beams ({beams.length})
          </button>
          <button
            className={activeTable === 'materials' ? 'active' : ''}
            onClick={() => setActiveTable('materials')}
          >
            Materials ({materials.length})
          </button>
        </div>
        <div className="table-actions">
          <button onClick={exportToCSV} title="Export CSV">
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Active load case indicator */}
      {activeLC && (
        <div className="table-loadcase-info">
          Load case: <strong>{activeLC.name}</strong> ({activeLC.type})
        </div>
      )}

      {/* Nodes table */}
      {activeTable === 'nodes' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Node</th>
                <th>X (mm)</th>
                <th>Z (mm)</th>
                <th>Support</th>
                <th>Fx (kN)</th>
                <th>Fz (kN)</th>
                <th>M (kNm)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(node => (
                <tr key={node.id}>
                  <td className="id-cell">{node.id}</td>
                  <td className="numeric">{renderCell(node.id, 'x', (node.x * 1000).toFixed(1))}</td>
                  <td className="numeric">{renderCell(node.id, 'y', (node.y * 1000).toFixed(1))}</td>
                  <td>{renderCell(node.id, 'support', getSupportType(node))}</td>
                  <td className="numeric">{renderCell(node.id, 'fx', (node.loads.fx / 1000).toFixed(2))}</td>
                  <td className="numeric">{renderCell(node.id, 'fy', (node.loads.fy / 1000).toFixed(2))}</td>
                  <td className="numeric">{renderCell(node.id, 'moment', (node.loads.moment / 1000).toFixed(2))}</td>
                  <td className="actions-cell">
                    <button className="delete-btn" onClick={() => deleteNode(node.id)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {nodes.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-message">No nodes defined</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Beams table */}
      {activeTable === 'beams' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Beam</th>
                <th>Node i</th>
                <th>Node j</th>
                <th>Profile</th>
                <th>L (mm)</th>
                <th>A (mm²)</th>
                <th>I (mm⁴)</th>
                <th>qy (kN/m)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {beams.map(beam => {
                const beamNodes = mesh.getBeamElementNodes(beam);
                const L = beamNodes ? calculateBeamLength(beamNodes[0], beamNodes[1]) : 0;
                const qy = beam.distributedLoad?.qy ?? 0;

                return (
                  <tr key={beam.id}>
                    <td className="id-cell">{beam.id}</td>
                    <td className="numeric">{beam.nodeIds[0]}</td>
                    <td className="numeric">{beam.nodeIds[1]}</td>
                    <td>{beam.profileName || 'Custom'}</td>
                    <td className="numeric">{(L * 1000).toFixed(0)}</td>
                    <td className="numeric">{(beam.section.A * 1e6).toFixed(0)}</td>
                    <td className="numeric">{(beam.section.I * 1e12).toExponential(2)}</td>
                    <td className="numeric">{renderCell(beam.id, 'qy', (qy / 1000).toFixed(2))}</td>
                    <td className="actions-cell">
                      <button className="delete-btn" onClick={() => deleteBeam(beam.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {beams.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-message">No beams defined</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Materials table */}
      {activeTable === 'materials' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>E (GPa)</th>
                <th>ν</th>
                <th>ρ (kg/m³)</th>
                <th>Color</th>
              </tr>
            </thead>
            <tbody>
              {materials.map(mat => (
                <tr key={mat.id}>
                  <td className="id-cell">{mat.id}</td>
                  <td>{mat.name}</td>
                  <td className="numeric">{(mat.E / 1e9).toFixed(0)}</td>
                  <td className="numeric">{mat.nu.toFixed(2)}</td>
                  <td className="numeric">{mat.rho.toFixed(0)}</td>
                  <td>
                    <span className="color-swatch" style={{ backgroundColor: mat.color }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Help text */}
      <div className="table-help">
        Double-click a cell to edit. Press Enter to confirm, Escape to cancel.
      </div>
    </div>
  );
};
