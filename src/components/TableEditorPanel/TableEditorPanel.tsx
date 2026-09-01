/**
 * TableEditorPanel — Spreadsheet-style editor for nodes, elements, loads, supports, etc.
 * A familiar spreadsheet-like table view of the model data.
 *
 * TODO(phase-9): Canvas-replacement view (activeView === 'table'), not a side
 * dock. SidePanel migration deferred.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
import { INode } from '../../core/fem/types';
import { IPointLoad, IDistributedLoad } from '../../core/fem/LoadCase';
import { calculateBeamLength } from '../../core/fem/Beam';
import { Trash2, Download, Plus, CheckSquare, Square } from 'lucide-react';
import './TableEditorPanel.css';

type TableType = 'nodes' | 'beams' | 'materials' | 'pointLoads' | 'distLoads' | 'supports';

// Unit conversion helpers
function getForceMultiplier(unit: 'N' | 'kN' | 'MN'): number {
  switch (unit) {
    case 'N': return 1;
    case 'kN': return 1000;
    case 'MN': return 1e6;
  }
}

function getMomentMultiplier(unit: 'kNm' | 'Nm'): number {
  return unit === 'kNm' ? 1000 : 1;
}

function getLengthMultiplier(unit: 'm' | 'mm' | 'cm'): number {
  switch (unit) {
    case 'm': return 1;
    case 'mm': return 0.001;
    case 'cm': return 0.01;
  }
}

function getDistLoadMultiplier(unit: 'kN/m' | 'N/m'): number {
  return unit === 'kN/m' ? 1000 : 1;
}

export const TableEditorPanel: React.FC = () => {
  const { state, dispatch, pushUndo } = useFEM();
  const { mesh, loadCases, activeLoadCase, forceUnit, momentUnit, lengthUnit, distributedLoadUnit } = state;
  const [activeTable, setActiveTable] = useState<TableType>('nodes');
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const nodes = useMemo(() => Array.from(mesh.nodes.values()), [mesh.nodes]);
  const beams = useMemo(() => Array.from(mesh.beamElements.values()), [mesh.beamElements]);
  const materials = useMemo(() => Array.from(mesh.materials.values()), [mesh.materials]);
  const activeLC = useMemo(() => loadCases.find(lc => lc.id === activeLoadCase), [loadCases, activeLoadCase]);

  // Get nodes with supports
  const supportedNodes = useMemo(() => {
    return nodes.filter(n => n.constraints.x || n.constraints.y || n.constraints.rotation);
  }, [nodes]);

  // Unit multipliers
  const forceMultiplier = getForceMultiplier(forceUnit);
  const momentMultiplier = getMomentMultiplier(momentUnit);
  const lengthMult = getLengthMultiplier(lengthUnit);
  const distLoadMult = getDistLoadMultiplier(distributedLoadUnit);

  // Start editing a cell
  const startEdit = useCallback((id: string, field: string, value: string) => {
    setEditingCell({ id, field });
    setEditValue(value);
  }, []);

  // Commit edit for nodes table
  const commitNodeEdit = useCallback((nodeId: number, field: string, numValue: number) => {
    const node = mesh.nodes.get(nodeId);
    if (!node) return;

    if (field === 'x' || field === 'y') {
      if (isNaN(numValue)) return;
      const updates: Partial<INode> = {};
      if (field === 'x') updates.x = numValue * lengthMult;
      if (field === 'y') updates.y = numValue * lengthMult;
      mesh.updateNode(nodeId, updates);
      dispatch({ type: 'REFRESH_MESH' });
    } else if (field === 'support') {
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
      mesh.updateNode(nodeId, { constraints });
      dispatch({ type: 'REFRESH_MESH' });
    }
  }, [mesh, dispatch, editValue, lengthMult]);

  // Commit edit for point loads
  const commitPointLoadEdit = useCallback((nodeId: number, field: string, numValue: number) => {
    if (!activeLC || isNaN(numValue)) return;

    const existingLoad = activeLC.pointLoads.find(pl => pl.nodeId === nodeId);
    const fx = field === 'fx' ? numValue * forceMultiplier : (existingLoad?.fx ?? 0);
    const fy = field === 'fy' ? numValue * forceMultiplier : (existingLoad?.fy ?? 0);
    const mz = field === 'mz' ? numValue * momentMultiplier : (existingLoad?.mz ?? 0);

    pushUndo();
    dispatch({
      type: 'ADD_POINT_LOAD',
      payload: { lcId: activeLC.id, nodeId, fx, fy, mz }
    });
  }, [activeLC, dispatch, pushUndo, forceMultiplier, momentMultiplier]);

  // Commit edit for distributed loads
  const commitDistLoadEdit = useCallback((loadId: number, field: string, numValue: number) => {
    if (!activeLC || isNaN(numValue)) return;

    const existingLoad = activeLC.distributedLoads.find(dl => dl.id === loadId);
    if (!existingLoad) return;

    pushUndo();
    const qx = field === 'qx' ? numValue * distLoadMult : existingLoad.qx;
    const qy = field === 'qy' ? numValue * distLoadMult : existingLoad.qy;
    const qxEnd = field === 'qxEnd' ? numValue * distLoadMult : existingLoad.qxEnd;
    const qyEnd = field === 'qyEnd' ? numValue * distLoadMult : existingLoad.qyEnd;
    const startT = field === 'startT' ? numValue : existingLoad.startT;
    const endT = field === 'endT' ? numValue : existingLoad.endT;

    dispatch({
      type: 'UPDATE_DISTRIBUTED_LOAD',
      payload: {
        lcId: activeLC.id,
        loadId,
        qx,
        qy,
        qxEnd,
        qyEnd,
        startT,
        endT,
        coordSystem: existingLoad.coordSystem
      }
    });
  }, [activeLC, dispatch, pushUndo, distLoadMult]);

  // Commit edit for supports
  const commitSupportEdit = useCallback((nodeId: number, field: string) => {
    const node = mesh.nodes.get(nodeId);
    if (!node) return;

    if (field === 'type') {
      const val = editValue.toLowerCase().trim();
      let constraints = { ...node.constraints };
      if (val === 'fixed' || val === 'f') {
        constraints = { x: true, y: true, rotation: true };
      } else if (val === 'pinned' || val === 'p') {
        constraints = { x: true, y: true, rotation: false };
      } else if (val === 'roller z' || val === 'rz' || val === 'z') {
        constraints = { x: false, y: true, rotation: false };
      } else if (val === 'roller x' || val === 'rx' || val === 'x') {
        constraints = { x: true, y: false, rotation: false };
      } else if (val === 'spring x' || val === 'sx') {
        constraints = { ...constraints, x: true, springX: constraints.springX ?? 1e6 };
      } else if (val === 'spring z' || val === 'sz') {
        constraints = { ...constraints, y: true, springY: constraints.springY ?? 1e6 };
      } else if (val === 'spring rot' || val === 'sr') {
        constraints = { ...constraints, rotation: true, springRot: constraints.springRot ?? 1e6 };
      } else if (val === 'free' || val === 'none') {
        constraints = { x: false, y: false, rotation: false };
      }
      pushUndo();
      mesh.updateNode(nodeId, { constraints });
      dispatch({ type: 'REFRESH_MESH' });
    } else if (field === 'springX' || field === 'springY' || field === 'springRot') {
      const numValue = parseFloat(editValue);
      if (isNaN(numValue)) return;
      pushUndo();
      const constraints = { ...node.constraints };
      if (field === 'springX') constraints.springX = numValue * 1000; // kN/m to N/m
      if (field === 'springY') constraints.springY = numValue * 1000;
      if (field === 'springRot') constraints.springRot = numValue * 1000; // kNm/rad to Nm/rad
      mesh.updateNode(nodeId, { constraints });
      dispatch({ type: 'REFRESH_MESH' });
    }
  }, [mesh, dispatch, pushUndo, editValue]);

  // Commit edit
  const commitEdit = useCallback(() => {
    if (!editingCell) return;

    const { id, field } = editingCell;
    const numValue = parseFloat(editValue);

    if (activeTable === 'nodes') {
      commitNodeEdit(parseInt(id), field, numValue);
    } else if (activeTable === 'beams') {
      const beamId = parseInt(id);
      const beam = mesh.beamElements.get(beamId);
      if (!beam) return;

      if (field === 'qy') {
        if (isNaN(numValue)) return;
        const distributedLoad = beam.distributedLoad || { qx: 0, qy: 0 };
        mesh.updateBeamElement(beamId, { distributedLoad: { ...distributedLoad, qy: numValue * distLoadMult } });
        dispatch({ type: 'REFRESH_MESH' });
      }
    } else if (activeTable === 'pointLoads') {
      commitPointLoadEdit(parseInt(id), field, numValue);
    } else if (activeTable === 'distLoads') {
      commitDistLoadEdit(parseInt(id), field, numValue);
    } else if (activeTable === 'supports') {
      commitSupportEdit(parseInt(id), field);
    }

    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, activeTable, mesh, dispatch, commitNodeEdit, commitPointLoadEdit, commitDistLoadEdit, commitSupportEdit, distLoadMult]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // Get support type string
  const getSupportType = (node: INode): string => {
    const { x, y, rotation, springX, springY, springRot } = node.constraints;
    if (springX || springY || springRot) {
      const parts = [];
      if (springX) parts.push('Spring X');
      if (springY) parts.push('Spring Z');
      if (springRot) parts.push('Spring Rot');
      return parts.join(' + ');
    }
    if (x && y && rotation) return 'Fixed';
    if (x && y) return 'Pinned';
    if (y) return 'Roller Z';
    if (x) return 'Roller X';
    return 'Free';
  };

  // Toggle row selection
  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Select all rows
  const selectAllRows = useCallback(() => {
    let allIds: string[] = [];
    if (activeTable === 'nodes') {
      allIds = nodes.map(n => String(n.id));
    } else if (activeTable === 'beams') {
      allIds = beams.map(b => String(b.id));
    } else if (activeTable === 'pointLoads' && activeLC) {
      allIds = activeLC.pointLoads.map(pl => String(pl.nodeId));
    } else if (activeTable === 'distLoads' && activeLC) {
      allIds = activeLC.distributedLoads.map(dl => String(dl.id ?? 0));
    } else if (activeTable === 'supports') {
      allIds = supportedNodes.map(n => String(n.id));
    }
    setSelectedRows(new Set(allIds));
  }, [activeTable, nodes, beams, activeLC, supportedNodes]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
  }, []);

  // Delete selected node
  const deleteNode = useCallback((id: number) => {
    pushUndo();
    const connectedBeams = Array.from(mesh.beamElements.values()).filter(
      b => b.nodeIds[0] === id || b.nodeIds[1] === id
    );
    for (const beam of connectedBeams) {
      mesh.removeElement(beam.id);
    }
    mesh.removeNode(id);
    dispatch({ type: 'REFRESH_MESH' });
  }, [mesh, dispatch, pushUndo]);

  // Delete selected beam
  const deleteBeam = useCallback((id: number) => {
    pushUndo();
    mesh.removeElement(id);
    dispatch({ type: 'REFRESH_MESH' });
  }, [mesh, dispatch, pushUndo]);

  // Delete point load
  const deletePointLoad = useCallback((nodeId: number) => {
    if (!activeLC) return;
    pushUndo();
    dispatch({ type: 'REMOVE_POINT_LOAD', payload: { lcId: activeLC.id, nodeId } });
  }, [activeLC, dispatch, pushUndo]);

  // Delete distributed load
  const deleteDistLoad = useCallback((loadId: number) => {
    if (!activeLC) return;
    pushUndo();
    dispatch({ type: 'REMOVE_DISTRIBUTED_LOAD', payload: { lcId: activeLC.id, loadId } });
  }, [activeLC, dispatch, pushUndo]);

  // Remove support from node
  const removeSupport = useCallback((nodeId: number) => {
    pushUndo();
    mesh.updateNode(nodeId, {
      constraints: { x: false, y: false, rotation: false, springX: undefined, springY: undefined, springRot: undefined }
    });
    dispatch({ type: 'REFRESH_MESH' });
  }, [mesh, dispatch, pushUndo]);

  // Delete selected rows
  const deleteSelectedRows = useCallback(() => {
    if (selectedRows.size === 0) return;
    pushUndo();

    if (activeTable === 'nodes') {
      for (const id of selectedRows) {
        const nodeId = parseInt(id);
        const connectedBeams = Array.from(mesh.beamElements.values()).filter(
          b => b.nodeIds[0] === nodeId || b.nodeIds[1] === nodeId
        );
        for (const beam of connectedBeams) {
          mesh.removeElement(beam.id);
        }
        mesh.removeNode(nodeId);
      }
      dispatch({ type: 'REFRESH_MESH' });
    } else if (activeTable === 'beams') {
      for (const id of selectedRows) {
        mesh.removeElement(parseInt(id));
      }
      dispatch({ type: 'REFRESH_MESH' });
    } else if (activeTable === 'pointLoads' && activeLC) {
      for (const id of selectedRows) {
        dispatch({ type: 'REMOVE_POINT_LOAD', payload: { lcId: activeLC.id, nodeId: parseInt(id) } });
      }
    } else if (activeTable === 'distLoads' && activeLC) {
      for (const id of selectedRows) {
        dispatch({ type: 'REMOVE_DISTRIBUTED_LOAD', payload: { lcId: activeLC.id, loadId: parseInt(id) } });
      }
    } else if (activeTable === 'supports') {
      for (const id of selectedRows) {
        mesh.updateNode(parseInt(id), {
          constraints: { x: false, y: false, rotation: false }
        });
      }
      dispatch({ type: 'REFRESH_MESH' });
    }

    setSelectedRows(new Set());
  }, [selectedRows, activeTable, mesh, dispatch, activeLC, pushUndo]);

  // Add new point load
  const addNewPointLoad = useCallback(() => {
    if (!activeLC) return;
    // Find a node that doesn't have a point load yet
    const existingNodeIds = new Set(activeLC.pointLoads.map(pl => pl.nodeId));
    const availableNode = nodes.find(n => !existingNodeIds.has(n.id));
    if (!availableNode) {
      alert('All nodes already have point loads in this load case');
      return;
    }
    pushUndo();
    dispatch({
      type: 'ADD_POINT_LOAD',
      payload: { lcId: activeLC.id, nodeId: availableNode.id, fx: 0, fy: -10000, mz: 0 } // Default 10 kN downward
    });
  }, [activeLC, nodes, dispatch, pushUndo]);

  // Add new distributed load
  const addNewDistLoad = useCallback(() => {
    if (!activeLC) return;
    // Find a beam that doesn't have a distributed load yet in this case
    const existingBeamIds = new Set(activeLC.distributedLoads.filter(dl => dl.elementId > 0).map(dl => dl.elementId));
    const availableBeam = beams.find(b => !existingBeamIds.has(b.id));
    if (!availableBeam) {
      alert('All beams already have distributed loads in this load case');
      return;
    }
    pushUndo();
    dispatch({
      type: 'ADD_DISTRIBUTED_LOAD',
      payload: { lcId: activeLC.id, beamId: availableBeam.id, qx: 0, qy: -5000, coordSystem: 'local' } // Default 5 kN/m downward
    });
  }, [activeLC, beams, dispatch, pushUndo]);

  // Add new support
  const addNewSupport = useCallback(() => {
    // Find a node that doesn't have a support yet
    const availableNode = nodes.find(n => !n.constraints.x && !n.constraints.y && !n.constraints.rotation);
    if (!availableNode) {
      alert('All nodes already have supports');
      return;
    }
    pushUndo();
    mesh.updateNode(availableNode.id, { constraints: { x: true, y: true, rotation: false } }); // Default pinned
    dispatch({ type: 'REFRESH_MESH' });
  }, [nodes, mesh, dispatch, pushUndo]);

  // Export table to CSV
  const exportToCSV = useCallback(() => {
    let csv = '';
    const forceSuffix = ` (${forceUnit})`;
    const momentSuffix = ` (${momentUnit})`;
    const lengthSuffix = ` (${lengthUnit})`;
    const distLoadSuffix = ` (${distributedLoadUnit})`;

    if (activeTable === 'nodes') {
      csv = `Node,X${lengthSuffix},Z${lengthSuffix},Support\n`;
      nodes.forEach(n => {
        csv += `${n.id},${(n.x / lengthMult).toFixed(3)},${(n.y / lengthMult).toFixed(3)},${getSupportType(n)}\n`;
      });
    } else if (activeTable === 'beams') {
      csv = `Beam,Node i,Node j,Profile,L${lengthSuffix},A (mm²),I (mm⁴)\n`;
      beams.forEach(b => {
        const beamNodes = mesh.getBeamElementNodes(b);
        const L = beamNodes ? calculateBeamLength(beamNodes[0], beamNodes[1]) : 0;
        csv += `${b.id},${b.nodeIds[0]},${b.nodeIds[1]},${b.profileName || 'Custom'},${(L / lengthMult).toFixed(3)},${(b.section.A * 1e6).toFixed(0)},${(b.section.I * 1e12).toExponential(2)}\n`;
      });
    } else if (activeTable === 'pointLoads' && activeLC) {
      csv = `Node,Fx${forceSuffix},Fz${forceSuffix},Mz${momentSuffix}\n`;
      activeLC.pointLoads.forEach(pl => {
        csv += `${pl.nodeId},${(pl.fx / forceMultiplier).toFixed(2)},${(pl.fy / forceMultiplier).toFixed(2)},${(pl.mz / momentMultiplier).toFixed(2)}\n`;
      });
    } else if (activeTable === 'distLoads' && activeLC) {
      csv = `ID,Element,qy Start${distLoadSuffix},qy End${distLoadSuffix},Start T,End T,Coord System\n`;
      activeLC.distributedLoads.forEach(dl => {
        csv += `${dl.id},${dl.elementId},${(dl.qy / distLoadMult).toFixed(2)},${((dl.qyEnd ?? dl.qy) / distLoadMult).toFixed(2)},${dl.startT ?? 0},${dl.endT ?? 1},${dl.coordSystem ?? 'local'}\n`;
      });
    } else if (activeTable === 'supports') {
      csv = `Node,Type,Spring X (kN/m),Spring Z (kN/m),Spring Rot (kNm/rad)\n`;
      supportedNodes.forEach(n => {
        const springX = n.constraints.springX ? (n.constraints.springX / 1000).toFixed(1) : '-';
        const springY = n.constraints.springY ? (n.constraints.springY / 1000).toFixed(1) : '-';
        const springRot = n.constraints.springRot ? (n.constraints.springRot / 1000).toFixed(1) : '-';
        csv += `${n.id},${getSupportType(n)},${springX},${springY},${springRot}\n`;
      });
    } else if (activeTable === 'materials') {
      csv = 'ID,Name,E (GPa),ν,ρ (kg/m³)\n';
      materials.forEach(mat => {
        csv += `${mat.id},${mat.name},${(mat.E / 1e9).toFixed(0)},${mat.nu.toFixed(2)},${mat.rho.toFixed(0)}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTable}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeTable, nodes, beams, materials, activeLC, supportedNodes, mesh, forceUnit, momentUnit, lengthUnit, distributedLoadUnit, forceMultiplier, momentMultiplier, lengthMult, distLoadMult]);

  // Render editable cell
  const renderCell = (id: string, field: string, value: string, editable = true) => {
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

  // Render checkbox cell
  const renderCheckbox = (id: string) => {
    const isSelected = selectedRows.has(id);
    return (
      <button
        className="row-checkbox"
        onClick={() => toggleRowSelection(id)}
        title={isSelected ? 'Deselect row' : 'Select row'}
      >
        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>
    );
  };

  // Count helpers
  const pointLoadCount = activeLC?.pointLoads.length ?? 0;
  const distLoadCount = activeLC?.distributedLoads.length ?? 0;

  return (
    <div className="table-editor-panel">
      {/* Table selector */}
      <div className="table-editor-toolbar">
        <div className="table-selector">
          <button
            className={activeTable === 'nodes' ? 'active' : ''}
            onClick={() => { setActiveTable('nodes'); clearSelection(); }}
          >
            Nodes ({nodes.length})
          </button>
          <button
            className={activeTable === 'beams' ? 'active' : ''}
            onClick={() => { setActiveTable('beams'); clearSelection(); }}
          >
            Beams ({beams.length})
          </button>
          <button
            className={activeTable === 'pointLoads' ? 'active' : ''}
            onClick={() => { setActiveTable('pointLoads'); clearSelection(); }}
          >
            Point Loads ({pointLoadCount})
          </button>
          <button
            className={activeTable === 'distLoads' ? 'active' : ''}
            onClick={() => { setActiveTable('distLoads'); clearSelection(); }}
          >
            Dist. Loads ({distLoadCount})
          </button>
          <button
            className={activeTable === 'supports' ? 'active' : ''}
            onClick={() => { setActiveTable('supports'); clearSelection(); }}
          >
            Supports ({supportedNodes.length})
          </button>
          <button
            className={activeTable === 'materials' ? 'active' : ''}
            onClick={() => { setActiveTable('materials'); clearSelection(); }}
          >
            Materials ({materials.length})
          </button>
        </div>
        <div className="table-actions">
          {(activeTable === 'pointLoads' || activeTable === 'distLoads' || activeTable === 'supports') && (
            <button
              onClick={activeTable === 'pointLoads' ? addNewPointLoad : activeTable === 'distLoads' ? addNewDistLoad : addNewSupport}
              title="Add new row"
              className="add-btn"
            >
              <Plus size={16} />
            </button>
          )}
          {selectedRows.size > 0 && (
            <button onClick={deleteSelectedRows} title="Delete selected" className="delete-selected-btn">
              <Trash2 size={16} />
              <span>({selectedRows.size})</span>
            </button>
          )}
          {selectedRows.size === 0 && (
            <button onClick={selectAllRows} title="Select all" className="select-all-btn">
              <CheckSquare size={16} />
            </button>
          )}
          {selectedRows.size > 0 && (
            <button onClick={clearSelection} title="Clear selection" className="clear-selection-btn">
              <Square size={16} />
            </button>
          )}
          <button onClick={exportToCSV} title="Export CSV">
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Active load case indicator */}
      {activeLC && (activeTable === 'pointLoads' || activeTable === 'distLoads') && (
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
                <th className="checkbox-col"></th>
                <th>Node</th>
                <th>X ({lengthUnit})</th>
                <th>Z ({lengthUnit})</th>
                <th>Support</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(node => (
                <tr key={node.id} className={selectedRows.has(String(node.id)) ? 'selected' : ''}>
                  <td className="checkbox-col">{renderCheckbox(String(node.id))}</td>
                  <td className="id-cell">{node.id}</td>
                  <td className="numeric">{renderCell(String(node.id), 'x', (node.x / lengthMult).toFixed(3))}</td>
                  <td className="numeric">{renderCell(String(node.id), 'y', (node.y / lengthMult).toFixed(3))}</td>
                  <td>{renderCell(String(node.id), 'support', getSupportType(node))}</td>
                  <td className="actions-cell">
                    <button className="delete-btn" onClick={() => deleteNode(node.id)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {nodes.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-message">No nodes defined</td>
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
                <th className="checkbox-col"></th>
                <th>Beam</th>
                <th>Node i</th>
                <th>Node j</th>
                <th>Profile</th>
                <th>L ({lengthUnit})</th>
                <th>A (mm²)</th>
                <th>I (mm⁴)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {beams.map(beam => {
                const beamNodes = mesh.getBeamElementNodes(beam);
                const L = beamNodes ? calculateBeamLength(beamNodes[0], beamNodes[1]) : 0;

                return (
                  <tr key={beam.id} className={selectedRows.has(String(beam.id)) ? 'selected' : ''}>
                    <td className="checkbox-col">{renderCheckbox(String(beam.id))}</td>
                    <td className="id-cell">{beam.id}</td>
                    <td className="numeric">{beam.nodeIds[0]}</td>
                    <td className="numeric">{beam.nodeIds[1]}</td>
                    <td>{beam.profileName || 'Custom'}</td>
                    <td className="numeric">{(L / lengthMult).toFixed(3)}</td>
                    <td className="numeric">{(beam.section.A * 1e6).toFixed(0)}</td>
                    <td className="numeric">{(beam.section.I * 1e12).toExponential(2)}</td>
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

      {/* Point Loads table */}
      {activeTable === 'pointLoads' && activeLC && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="checkbox-col"></th>
                <th>Node</th>
                <th>Fx ({forceUnit})</th>
                <th>Fz ({forceUnit})</th>
                <th>Mz ({momentUnit})</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeLC.pointLoads.map((pl: IPointLoad) => (
                <tr key={pl.nodeId} className={selectedRows.has(String(pl.nodeId)) ? 'selected' : ''}>
                  <td className="checkbox-col">{renderCheckbox(String(pl.nodeId))}</td>
                  <td className="id-cell">{pl.nodeId}</td>
                  <td className="numeric">{renderCell(String(pl.nodeId), 'fx', (pl.fx / forceMultiplier).toFixed(2))}</td>
                  <td className="numeric">{renderCell(String(pl.nodeId), 'fy', (pl.fy / forceMultiplier).toFixed(2))}</td>
                  <td className="numeric">{renderCell(String(pl.nodeId), 'mz', (pl.mz / momentMultiplier).toFixed(2))}</td>
                  <td className="actions-cell">
                    <button className="delete-btn" onClick={() => deletePointLoad(pl.nodeId)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {activeLC.pointLoads.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-message">No point loads in this load case</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Distributed Loads table */}
      {activeTable === 'distLoads' && activeLC && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="checkbox-col"></th>
                <th>ID</th>
                <th>Element</th>
                <th>qy Start ({distributedLoadUnit})</th>
                <th>qy End ({distributedLoadUnit})</th>
                <th>Start T</th>
                <th>End T</th>
                <th>Coord</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeLC.distributedLoads.map((dl: IDistributedLoad) => (
                <tr key={dl.id ?? dl.elementId} className={selectedRows.has(String(dl.id ?? 0)) ? 'selected' : ''}>
                  <td className="checkbox-col">{renderCheckbox(String(dl.id ?? 0))}</td>
                  <td className="id-cell">{dl.id ?? '-'}</td>
                  <td className="numeric">{dl.edgeId !== undefined ? `Edge ${dl.edgeId}` : dl.elementId}</td>
                  <td className="numeric">{renderCell(String(dl.id ?? 0), 'qy', (dl.qy / distLoadMult).toFixed(2))}</td>
                  <td className="numeric">{renderCell(String(dl.id ?? 0), 'qyEnd', ((dl.qyEnd ?? dl.qy) / distLoadMult).toFixed(2))}</td>
                  <td className="numeric">{renderCell(String(dl.id ?? 0), 'startT', (dl.startT ?? 0).toFixed(2))}</td>
                  <td className="numeric">{renderCell(String(dl.id ?? 0), 'endT', (dl.endT ?? 1).toFixed(2))}</td>
                  <td>{dl.coordSystem ?? 'local'}</td>
                  <td className="actions-cell">
                    <button className="delete-btn" onClick={() => deleteDistLoad(dl.id ?? 0)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {activeLC.distributedLoads.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-message">No distributed loads in this load case</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Supports table */}
      {activeTable === 'supports' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="checkbox-col"></th>
                <th>Node</th>
                <th>X ({lengthUnit})</th>
                <th>Z ({lengthUnit})</th>
                <th>Type</th>
                <th>Spring X (kN/m)</th>
                <th>Spring Z (kN/m)</th>
                <th>Spring Rot (kNm/rad)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {supportedNodes.map(node => (
                <tr key={node.id} className={selectedRows.has(String(node.id)) ? 'selected' : ''}>
                  <td className="checkbox-col">{renderCheckbox(String(node.id))}</td>
                  <td className="id-cell">{node.id}</td>
                  <td className="numeric">{(node.x / lengthMult).toFixed(3)}</td>
                  <td className="numeric">{(node.y / lengthMult).toFixed(3)}</td>
                  <td>{renderCell(String(node.id), 'type', getSupportType(node))}</td>
                  <td className="numeric">
                    {node.constraints.springX !== undefined
                      ? renderCell(String(node.id), 'springX', (node.constraints.springX / 1000).toFixed(1))
                      : '-'}
                  </td>
                  <td className="numeric">
                    {node.constraints.springY !== undefined
                      ? renderCell(String(node.id), 'springY', (node.constraints.springY / 1000).toFixed(1))
                      : '-'}
                  </td>
                  <td className="numeric">
                    {node.constraints.springRot !== undefined
                      ? renderCell(String(node.id), 'springRot', (node.constraints.springRot / 1000).toFixed(1))
                      : '-'}
                  </td>
                  <td className="actions-cell">
                    <button className="delete-btn" onClick={() => removeSupport(node.id)} title="Remove support">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {supportedNodes.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-message">No supports defined</td>
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
                <th className="checkbox-col"></th>
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
                  <td className="checkbox-col"></td>
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
        Double-click a cell to edit. Press Enter to confirm, Escape to cancel. Use checkboxes to select multiple rows for batch delete.
      </div>
    </div>
  );
};
