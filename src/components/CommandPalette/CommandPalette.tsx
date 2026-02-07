/**
 * Command Palette - searchable command list at the bottom of the canvas
 * Activated with Ctrl+K or Ctrl+P
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { Tool } from '../../core/fem/types';
import './CommandPalette.css';

interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  onToggleDialog: (dialog: string) => void;
}

export function CommandPalette({ onToggleDialog }: CommandPaletteProps) {
  const { state, dispatch } = useFEM();
  const { t, setLocale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const setTool = useCallback((tool: Tool) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
    setIsOpen(false);
  }, [dispatch]);

  const closeAndRun = useCallback((fn: () => void) => {
    fn();
    setIsOpen(false);
  }, []);

  const dialog = useCallback((name: string) => {
    onToggleDialog(name);
    setIsOpen(false);
  }, [onToggleDialog]);

  const commands = useMemo((): Command[] => [
    // ══════════════════════════════════════════════════════════════════
    // ── FILE OPERATIONS ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'newProject', label: t('cmd.newProject'), category: t('cmd.catFile'), shortcut: 'Ctrl+N', action: () => dialog('newProject') },
    { id: 'openProject', label: t('cmd.openProject'), category: t('cmd.catFile'), shortcut: 'Ctrl+O', action: () => dialog('openProject') },
    { id: 'saveProject', label: t('cmd.saveProject'), category: t('cmd.catFile'), shortcut: 'Ctrl+S', action: () => dialog('saveProject') },
    { id: 'saveProjectAs', label: t('cmd.saveProjectAs'), category: t('cmd.catFile'), shortcut: 'Ctrl+Shift+S', action: () => dialog('saveProjectAs') },
    { id: 'importDXF', label: t('cmd.importDXF'), category: t('cmd.catFile'), action: () => dialog('importDXF') },
    { id: 'importIFC', label: t('cmd.importIFC'), category: t('cmd.catFile'), action: () => dialog('importIFC') },
    { id: 'exportDXF', label: t('cmd.exportDXF'), category: t('cmd.catFile'), action: () => dialog('exportDXF') },
    { id: 'exportIFC', label: t('cmd.exportIFC'), category: t('cmd.catFile'), action: () => dialog('exportIFC') },
    { id: 'exportHtml', label: t('cmd.exportHTML'), category: t('cmd.catFile'), action: () => dialog('exportHtml') },
    { id: 'exportPdf', label: t('cmd.exportPDF'), category: t('cmd.catFile'), action: () => dialog('exportPdf') },
    { id: 'print', label: t('cmd.print'), category: t('cmd.catFile'), shortcut: 'Ctrl+P', action: () => dialog('print') },

    // ══════════════════════════════════════════════════════════════════
    // ── DRAWING TOOLS ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'select', label: t('cmd.select'), category: t('cmd.catTools'), shortcut: 'V', action: () => setTool('select') },
    { id: 'addNode', label: t('cmd.addNode'), category: t('cmd.catTools'), shortcut: 'N', action: () => setTool('addNode') },
    { id: 'addBeam', label: t('cmd.addBeam'), category: t('cmd.catTools'), shortcut: 'B', action: () => setTool('addBeam') },
    { id: 'addPlate', label: t('cmd.addPlate'), category: t('cmd.catTools'), action: () => setTool('addPlate') },
    { id: 'rotate', label: t('cmd.rotate'), category: t('cmd.catTools'), shortcut: 'R', action: () => setTool('rotate') },
    { id: 'delete', label: t('cmd.delete'), category: t('cmd.catTools'), shortcut: 'Del', action: () => setTool('delete') },
    { id: 'addSubNode', label: t('cmd.addSubNode'), category: t('cmd.catTools'), action: () => setTool('addSubNode') },
    { id: 'pan', label: t('cmd.pan'), category: t('cmd.catTools'), shortcut: 'Space', action: () => setTool('pan') },

    // ══════════════════════════════════════════════════════════════════
    // ── SUPPORTS ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'addPinned', label: t('cmd.addPinned'), category: t('cmd.catSupports'), action: () => setTool('addPinned') },
    { id: 'addFixed', label: t('cmd.addFixed'), category: t('cmd.catSupports'), action: () => setTool('addFixed') },
    { id: 'addXRoller', label: t('cmd.addXRoller'), category: t('cmd.catSupports'), action: () => setTool('addXRoller') },
    { id: 'addZRoller', label: t('cmd.addZRoller'), category: t('cmd.catSupports'), action: () => setTool('addZRoller') },
    { id: 'addZSpring', label: t('cmd.addZSpring'), category: t('cmd.catSupports'), action: () => setTool('addZSpring') },
    { id: 'addXSpring', label: t('cmd.addXSpring'), category: t('cmd.catSupports'), action: () => setTool('addXSpring') },
    { id: 'addRotSpring', label: t('cmd.addRotSpring'), category: t('cmd.catSupports'), action: () => setTool('addRotSpring') },
    { id: 'removeSupport', label: t('cmd.removeSupport'), category: t('cmd.catSupports'), action: () => dialog('removeSupport') },

    // ══════════════════════════════════════════════════════════════════
    // ── LOADS ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'addLoad', label: t('cmd.addPointLoad'), category: t('cmd.catLoads'), shortcut: 'P', action: () => setTool('addLoad') },
    { id: 'addLineLoad', label: t('cmd.addLineLoad'), category: t('cmd.catLoads'), shortcut: 'L', action: () => setTool('addLineLoad') },
    { id: 'addMoment', label: t('cmd.addMoment'), category: t('cmd.catLoads'), action: () => setTool('addLoad') },
    { id: 'addThermalLoad', label: t('cmd.addThermalLoad'), category: t('cmd.catLoads'), action: () => setTool('addThermalLoad') },
    { id: 'removeLoads', label: t('cmd.removeLoads'), category: t('cmd.catLoads'), action: () => dialog('removeLoads') },
    { id: 'loadGenerator', label: t('cmd.loadGenerator'), category: t('cmd.catLoads'), action: () => dialog('loadGenerator') },

    // ══════════════════════════════════════════════════════════════════
    // ── EDIT OPERATIONS ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'undo', label: t('cmd.undo'), category: t('cmd.catEdit'), shortcut: 'Ctrl+Z', action: () => closeAndRun(() => dispatch({ type: 'UNDO' })) },
    { id: 'redo', label: t('cmd.redo'), category: t('cmd.catEdit'), shortcut: 'Ctrl+Y', action: () => closeAndRun(() => dispatch({ type: 'REDO' })) },
    { id: 'copy', label: t('cmd.copy'), category: t('cmd.catEdit'), shortcut: 'Ctrl+C', action: () => closeAndRun(() => dispatch({ type: 'COPY_SELECTED' })) },
    { id: 'paste', label: t('cmd.paste'), category: t('cmd.catEdit'), shortcut: 'Ctrl+V', action: () => closeAndRun(() => dispatch({ type: 'PASTE' })) },
    { id: 'deleteSelected', label: t('cmd.deleteSelected'), category: t('cmd.catEdit'), shortcut: 'Delete', action: () => dialog('deleteSelected') },
    { id: 'duplicateSelected', label: t('cmd.duplicateSelected'), category: t('cmd.catEdit'), shortcut: 'Ctrl+D', action: () => dialog('duplicateSelected') },
    { id: 'move', label: t('cmd.move'), category: t('cmd.catEdit'), shortcut: 'M', action: () => closeAndRun(() => dispatch({ type: 'SET_TOOL', payload: 'select' })) },
    { id: 'mirrorX', label: t('cmd.mirrorX'), category: t('cmd.catEdit'), action: () => dialog('mirrorX') },
    { id: 'mirrorZ', label: t('cmd.mirrorZ'), category: t('cmd.catEdit'), action: () => dialog('mirrorZ') },
    { id: 'arrayLinear', label: t('cmd.arrayLinear'), category: t('cmd.catEdit'), action: () => dialog('arrayLinear') },
    { id: 'arrayPolar', label: t('cmd.arrayPolar'), category: t('cmd.catEdit'), action: () => dialog('arrayPolar') },

    // ══════════════════════════════════════════════════════════════════
    // ── SELECTION ─────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'selectAll', label: t('cmd.selectAll'), category: t('cmd.catSelection'), shortcut: 'Ctrl+A', action: () => dialog('selectAll') },
    { id: 'deselectAll', label: t('cmd.deselectAll'), category: t('cmd.catSelection'), shortcut: 'Escape', action: () => closeAndRun(() => dispatch({ type: 'CLEAR_SELECTION' })) },
    { id: 'invertSelection', label: t('cmd.invertSelection'), category: t('cmd.catSelection'), shortcut: 'Ctrl+I', action: () => dialog('invertSelection') },
    { id: 'selectNodes', label: t('cmd.selectNodes'), category: t('cmd.catSelection'), action: () => dialog('selectNodes') },
    { id: 'selectBeams', label: t('cmd.selectBeams'), category: t('cmd.catSelection'), action: () => dialog('selectBeams') },
    { id: 'selectPlates', label: t('cmd.selectPlates'), category: t('cmd.catSelection'), action: () => dialog('selectPlates') },
    { id: 'selectByProfile', label: t('cmd.selectByProfile'), category: t('cmd.catSelection'), action: () => dialog('selectByProfile') },
    { id: 'selectByMaterial', label: t('cmd.selectByMaterial'), category: t('cmd.catSelection'), action: () => dialog('selectByMaterial') },
    { id: 'selectByLayer', label: t('cmd.selectByLayer'), category: t('cmd.catSelection'), action: () => dialog('selectByLayer') },
    { id: 'filterNodes', label: t('cmd.filterNodes'), category: t('cmd.catSelection'), action: () => closeAndRun(() => dispatch({ type: 'TOGGLE_SELECTION_FILTER', payload: 'nodes' })) },
    { id: 'filterBeams', label: t('cmd.filterBeams'), category: t('cmd.catSelection'), action: () => closeAndRun(() => dispatch({ type: 'TOGGLE_SELECTION_FILTER', payload: 'beams' })) },
    { id: 'filterPlates', label: t('cmd.filterPlates'), category: t('cmd.catSelection'), action: () => closeAndRun(() => dispatch({ type: 'TOGGLE_SELECTION_FILTER', payload: 'plates' })) },
    { id: 'filterLoads', label: t('cmd.filterLoads'), category: t('cmd.catSelection'), action: () => closeAndRun(() => dispatch({ type: 'TOGGLE_SELECTION_FILTER', payload: 'loads' })) },

    // ══════════════════════════════════════════════════════════════════
    // ── VIEW MODE ─────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'viewGeometry', label: t('cmd.viewGeometry'), category: t('cmd.catView'), shortcut: '1', action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_MODE', payload: 'geometry' })) },
    { id: 'viewLoads', label: t('cmd.viewLoads'), category: t('cmd.catView'), shortcut: '2', action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_MODE', payload: 'loads' })) },
    { id: 'viewResults', label: t('cmd.viewResults'), category: t('cmd.catView'), shortcut: '3', action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_MODE', payload: 'results' })) },
    { id: 'view3dMode', label: t('cmd.view3DMode'), category: t('cmd.catView'), shortcut: '4', action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_MODE', payload: '3d' })) },

    // ══════════════════════════════════════════════════════════════════
    // ── VIEW OPERATIONS ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'zoomIn', label: t('cmd.zoomIn'), category: t('cmd.catViewOps'), shortcut: 'Ctrl++', action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_STATE', payload: { scale: state.viewState.scale * 1.25 } })) },
    { id: 'zoomOut', label: t('cmd.zoomOut'), category: t('cmd.catViewOps'), shortcut: 'Ctrl+-', action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_STATE', payload: { scale: state.viewState.scale * 0.8 } })) },
    { id: 'zoomToFit', label: t('cmd.zoomToFit'), category: t('cmd.catViewOps'), shortcut: 'F', action: () => dialog('zoomToFit') },
    { id: 'zoomToSelection', label: t('cmd.zoomToSelection'), category: t('cmd.catViewOps'), action: () => dialog('zoomToSelection') },
    { id: 'resetView', label: t('cmd.resetView'), category: t('cmd.catViewOps'), shortcut: 'Home', action: () => dialog('resetView') },
    { id: 'panLeft', label: t('cmd.panLeft'), category: t('cmd.catViewOps'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_STATE', payload: { offsetX: state.viewState.offsetX + 50 } })) },
    { id: 'panRight', label: t('cmd.panRight'), category: t('cmd.catViewOps'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_STATE', payload: { offsetX: state.viewState.offsetX - 50 } })) },
    { id: 'panUp', label: t('cmd.panUp'), category: t('cmd.catViewOps'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_STATE', payload: { offsetY: state.viewState.offsetY + 50 } })) },
    { id: 'panDown', label: t('cmd.panDown'), category: t('cmd.catViewOps'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_STATE', payload: { offsetY: state.viewState.offsetY - 50 } })) },

    // ══════════════════════════════════════════════════════════════════
    // ── DIAGRAM TOGGLES ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'showMoment', label: t('cmd.toggleMoment'), category: t('cmd.catDiagrams'), shortcut: 'Shift+M', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_MOMENT', payload: !state.showMoment })) },
    { id: 'showShear', label: t('cmd.toggleShear'), category: t('cmd.catDiagrams'), shortcut: 'Shift+V', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_SHEAR', payload: !state.showShear })) },
    { id: 'showNormal', label: t('cmd.toggleNormal'), category: t('cmd.catDiagrams'), shortcut: 'Shift+N', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_NORMAL', payload: !state.showNormal })) },
    { id: 'showDeformed', label: t('cmd.toggleDeformed'), category: t('cmd.catDiagrams'), shortcut: 'Shift+D', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_DEFORMED', payload: !state.showDeformed })) },
    { id: 'showReactions', label: t('cmd.toggleReactions'), category: t('cmd.catDiagrams'), shortcut: 'Shift+R', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_REACTIONS', payload: !state.showReactions })) },
    { id: 'showRotation', label: t('cmd.toggleRotation'), category: t('cmd.catDiagrams'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_ROTATION', payload: !state.showRotation })) },
    { id: 'showEnvelope', label: t('cmd.toggleEnvelope'), category: t('cmd.catDiagrams'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_ENVELOPE', payload: !state.showEnvelope })) },
    { id: 'showDeflections', label: t('cmd.toggleDeflections'), category: t('cmd.catDiagrams'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_DEFLECTIONS', payload: !state.showDeflections })) },
    { id: 'showDisplacements', label: t('cmd.toggleDisplacements'), category: t('cmd.catDiagrams'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_DISPLACEMENTS', payload: !state.showDisplacements })) },
    { id: 'showDiagramValues', label: t('cmd.toggleDiagramValues'), category: t('cmd.catDiagrams'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_DIAGRAM_VALUES', payload: !state.showDiagramValues })) },
    { id: 'increaseDiagramScale', label: t('cmd.increaseDiagramScale'), category: t('cmd.catDiagrams'), shortcut: 'Ctrl+]', action: () => closeAndRun(() => dispatch({ type: 'SET_DIAGRAM_SCALE', payload: state.diagramScale * 1.5 })) },
    { id: 'decreaseDiagramScale', label: t('cmd.decreaseDiagramScale'), category: t('cmd.catDiagrams'), shortcut: 'Ctrl+[', action: () => closeAndRun(() => dispatch({ type: 'SET_DIAGRAM_SCALE', payload: state.diagramScale / 1.5 })) },
    { id: 'increaseDeformScale', label: t('cmd.increaseDeformScale'), category: t('cmd.catDiagrams'), action: () => closeAndRun(() => dispatch({ type: 'SET_DEFORMATION_SCALE', payload: state.deformationScale * 1.5 })) },
    { id: 'decreaseDeformScale', label: t('cmd.decreaseDeformScale'), category: t('cmd.catDiagrams'), action: () => closeAndRun(() => dispatch({ type: 'SET_DEFORMATION_SCALE', payload: state.deformationScale / 1.5 })) },

    // ══════════════════════════════════════════════════════════════════
    // ── DISPLAY TOGGLES ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'showNodes', label: t('cmd.showNodes'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_NODES', payload: !state.showNodes })) },
    { id: 'showMembers', label: t('cmd.showMembers'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_MEMBERS', payload: !state.showMembers })) },
    { id: 'showSupports', label: t('cmd.showSupports'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_SUPPORTS', payload: !state.showSupports })) },
    { id: 'showLoads', label: t('cmd.showLoads'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_LOADS', payload: !state.showLoads })) },
    { id: 'showNodeLabels', label: t('cmd.showNodeLabels'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_NODE_LABELS', payload: !state.showNodeLabels })) },
    { id: 'showMemberLabels', label: t('cmd.showMemberLabels'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_MEMBER_LABELS', payload: !state.showMemberLabels })) },
    { id: 'showProfileNames', label: t('cmd.toggleProfileNames'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_PROFILE_NAMES', payload: !state.showProfileNames })) },
    { id: 'showDimensions', label: t('cmd.toggleDimensions'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_DIMENSIONS', payload: !state.showDimensions })) },
    { id: 'showElementTypes', label: t('cmd.showElementTypes'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_ELEMENT_TYPES', payload: !state.showElementTypes })) },
    { id: 'toggleGrid', label: t('cmd.toggleGrid'), category: t('cmd.catDisplay'), shortcut: 'G', action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_GRID_LINES', payload: !state.structuralGrid.showGridLines })) },
    { id: 'snapGrid', label: t('cmd.toggleSnap'), category: t('cmd.catDisplay'), shortcut: 'S', action: () => closeAndRun(() => dispatch({ type: 'SET_SNAP_TO_GRID', payload: !state.snapToGrid })) },
    { id: 'snapGridLines', label: t('cmd.toggleSnapGridLines'), category: t('cmd.catDisplay'), action: () => closeAndRun(() => dispatch({ type: 'SET_SNAP_TO_GRID_LINES', payload: !state.structuralGrid.snapToGridLines })) },

    // ══════════════════════════════════════════════════════════════════
    // ── STRESS DISPLAY ────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'showStress', label: t('cmd.showStress'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_SHOW_STRESS', payload: !state.showStress })) },
    { id: 'stressVonMises', label: t('cmd.stressVonMises'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_TYPE', payload: 'vonMises' })) },
    { id: 'stressSigmaX', label: t('cmd.stressSigmaX'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_TYPE', payload: 'sigmaX' })) },
    { id: 'stressSigmaY', label: t('cmd.stressSigmaY'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_TYPE', payload: 'sigmaY' })) },
    { id: 'stressTauXY', label: t('cmd.stressTauXY'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_TYPE', payload: 'tauXY' })) },
    { id: 'stressMx', label: t('cmd.stressMx'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_TYPE', payload: 'mx' })) },
    { id: 'stressMy', label: t('cmd.stressMy'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_TYPE', payload: 'my' })) },
    { id: 'stressSmoothed', label: t('cmd.stressSmoothed'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_DISPLAY_MODE', payload: 'smoothed' })) },
    { id: 'stressElement', label: t('cmd.stressElement'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_DISPLAY_MODE', payload: 'element' })) },
    { id: 'toggleStressGradient', label: t('cmd.toggleStressGradient'), category: t('cmd.catStress'), action: () => closeAndRun(() => dispatch({ type: 'TOGGLE_STRESS_GRADIENT' })) },

    // ══════════════════════════════════════════════════════════════════
    // ── ANALYSIS ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'solve', label: t('cmd.solve'), category: t('cmd.catAnalysis'), shortcut: 'Ctrl+Enter', action: () => dialog('solve') },
    { id: 'solveAllCombos', label: t('cmd.solveAllCombos'), category: t('cmd.catAnalysis'), action: () => dialog('solveAllCombos') },
    { id: 'toggleAutoRecalc', label: t('cmd.toggleAutoRecalc'), category: t('cmd.catAnalysis'), action: () => closeAndRun(() => dispatch({ type: 'SET_AUTO_RECALCULATE', payload: !state.autoRecalculate })) },
    { id: 'analysisFrame', label: t('cmd.analysisFrame'), category: t('cmd.catAnalysis'), action: () => closeAndRun(() => dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' })) },
    { id: 'analysisPlaneStress', label: t('cmd.analysisPlaneStress'), category: t('cmd.catAnalysis'), action: () => closeAndRun(() => dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'plane_stress' })) },
    { id: 'analysisPlaneStrain', label: t('cmd.analysisPlaneStrain'), category: t('cmd.catAnalysis'), action: () => closeAndRun(() => dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'plane_strain' })) },
    { id: 'analysisPlateBending', label: t('cmd.analysisPlateBending'), category: t('cmd.catAnalysis'), action: () => closeAndRun(() => dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'plate_bending' })) },
    { id: 'analysisMixed', label: t('cmd.analysisMixed'), category: t('cmd.catAnalysis'), action: () => closeAndRun(() => dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'mixed_beam_plate' })) },

    // ══════════════════════════════════════════════════════════════════
    // ── CODE CHECKS ───────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'steelCheck', label: t('cmd.steelCheck'), category: t('cmd.catCodeCheck'), action: () => dialog('steelCheck') },
    { id: 'steelConnection', label: t('cmd.steelConnection'), category: t('cmd.catCodeCheck'), action: () => dialog('steelConnection') },
    { id: 'concreteCheck', label: t('cmd.concreteCheck'), category: t('cmd.catCodeCheck'), action: () => dialog('concreteCheck') },
    { id: 'concreteDesign', label: t('cmd.concreteDesign'), category: t('cmd.catCodeCheck'), action: () => dialog('concreteDesign') },
    { id: 'checkAllBeams', label: t('cmd.checkAllBeams'), category: t('cmd.catCodeCheck'), action: () => dialog('checkAllBeams') },
    { id: 'setCodeCheckBeam', label: t('cmd.setCodeCheckBeam'), category: t('cmd.catCodeCheck'), action: () => dialog('setCodeCheckBeam') },

    // ══════════════════════════════════════════════════════════════════
    // ── LOAD CASES ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'loadCases', label: t('cmd.loadCases'), category: t('cmd.catLoadCases'), action: () => dialog('loadCases') },
    { id: 'combinations', label: t('cmd.combinations'), category: t('cmd.catLoadCases'), action: () => dialog('combinations') },
    { id: 'addLoadCase', label: t('cmd.addLoadCase'), category: t('cmd.catLoadCases'), action: () => dialog('addLoadCase') },
    { id: 'deleteLoadCase', label: t('cmd.deleteLoadCase'), category: t('cmd.catLoadCases'), action: () => dialog('deleteLoadCase') },
    { id: 'renameLoadCase', label: t('cmd.renameLoadCase'), category: t('cmd.catLoadCases'), action: () => dialog('renameLoadCase') },
    { id: 'nextLoadCase', label: t('cmd.nextLoadCase'), category: t('cmd.catLoadCases'), shortcut: 'Ctrl+Right', action: () => dialog('nextLoadCase') },
    { id: 'prevLoadCase', label: t('cmd.prevLoadCase'), category: t('cmd.catLoadCases'), shortcut: 'Ctrl+Left', action: () => dialog('prevLoadCase') },
    { id: 'addCombination', label: t('cmd.addCombination'), category: t('cmd.catLoadCases'), action: () => dialog('addCombination') },

    // ══════════════════════════════════════════════════════════════════
    // ── DIALOGS ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'materials', label: t('cmd.materials'), category: t('cmd.catDialogs'), action: () => dialog('materials') },
    { id: 'projectInfo', label: t('cmd.projectInfo'), category: t('cmd.catDialogs'), action: () => dialog('projectInfo') },
    { id: 'grids', label: t('cmd.grids'), category: t('cmd.catDialogs'), action: () => dialog('grids') },
    { id: 'standards', label: t('cmd.standards'), category: t('cmd.catDialogs'), action: () => dialog('standards') },
    { id: 'calcSettings', label: t('cmd.calcSettings'), category: t('cmd.catDialogs'), action: () => dialog('calcSettings') },
    { id: 'reportSettings', label: t('cmd.reportSettings'), category: t('cmd.catDialogs'), action: () => dialog('reportSettings') },

    // ══════════════════════════════════════════════════════════════════
    // ── VIEWS / PANELS ────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'view3d', label: t('cmd.view3D'), category: t('cmd.catViews'), action: () => dialog('view3d') },
    { id: 'viewReport', label: t('cmd.viewReport'), category: t('cmd.catViews'), action: () => dialog('viewReport') },
    { id: 'viewTable', label: t('cmd.viewTable'), category: t('cmd.catViews'), action: () => dialog('viewTable') },
    { id: 'viewInsights', label: t('cmd.viewInsights'), category: t('cmd.catViews'), action: () => dialog('viewInsights') },
    { id: 'viewVersions', label: t('cmd.viewVersions'), category: t('cmd.catViews'), action: () => dialog('viewVersions') },
    { id: 'viewGraph', label: t('cmd.viewGraph'), category: t('cmd.catViews'), action: () => dialog('viewGraph') },
    { id: 'viewAgent', label: t('cmd.viewAgent'), category: t('cmd.catViews'), action: () => dialog('viewAgent') },
    { id: 'viewConsole', label: t('cmd.viewConsole'), category: t('cmd.catViews'), action: () => dialog('viewConsole') },
    { id: 'toggleProjectBrowser', label: t('cmd.toggleProjectBrowser'), category: t('cmd.catViews'), action: () => dialog('toggleProjectBrowser') },
    { id: 'toggleDisplayPanel', label: t('cmd.toggleDisplayPanel'), category: t('cmd.catViews'), action: () => dialog('toggleDisplayPanel') },

    // ══════════════════════════════════════════════════════════════════
    // ── INSIGHTS VIEWS ────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'insightsElementK', label: t('cmd.insightsElementK'), category: t('cmd.catInsights'), action: () => closeAndRun(() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'element-matrix' })) },
    { id: 'insightsSystemK', label: t('cmd.insightsSystemK'), category: t('cmd.catInsights'), action: () => closeAndRun(() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'system-matrix' })) },
    { id: 'insightsSolver', label: t('cmd.insightsSolver'), category: t('cmd.catInsights'), action: () => closeAndRun(() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'solver-info' })) },
    { id: 'insightsDOFMap', label: t('cmd.insightsDOFMap'), category: t('cmd.catInsights'), action: () => closeAndRun(() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'dof-mapping' })) },
    { id: 'insightsLogs', label: t('cmd.insightsLogs'), category: t('cmd.catInsights'), action: () => closeAndRun(() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'logs' })) },
    { id: 'insightsErrors', label: t('cmd.insightsErrors'), category: t('cmd.catInsights'), action: () => closeAndRun(() => dispatch({ type: 'SET_INSIGHTS_VIEW', payload: 'errors' })) },

    // ══════════════════════════════════════════════════════════════════
    // ── NAVIGATION ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'goToNode', label: t('cmd.goToNode'), category: t('cmd.catNav'), action: () => dialog('goToNode') },
    { id: 'goToBeam', label: t('cmd.goToBeam'), category: t('cmd.catNav'), action: () => dialog('goToBeam') },
    { id: 'goToPlate', label: t('cmd.goToPlate'), category: t('cmd.catNav'), action: () => dialog('goToPlate') },
    { id: 'goToOrigin', label: t('cmd.goToOrigin'), category: t('cmd.catNav'), action: () => closeAndRun(() => dispatch({ type: 'SET_VIEW_STATE', payload: { offsetX: 400, offsetY: 300 } })) },

    // ══════════════════════════════════════════════════════════════════
    // ── UNITS ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'unitsForceN', label: t('cmd.unitsForceN'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_FORCE_UNIT', payload: 'N' })) },
    { id: 'unitsForcekN', label: t('cmd.unitsForcekN'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_FORCE_UNIT', payload: 'kN' })) },
    { id: 'unitsForceMN', label: t('cmd.unitsForceMN'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_FORCE_UNIT', payload: 'MN' })) },
    { id: 'unitsLengthm', label: t('cmd.unitsLengthm'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_LENGTH_UNIT', payload: 'm' })) },
    { id: 'unitsLengthmm', label: t('cmd.unitsLengthmm'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_LENGTH_UNIT', payload: 'mm' })) },
    { id: 'unitsLengthcm', label: t('cmd.unitsLengthcm'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_LENGTH_UNIT', payload: 'cm' })) },
    { id: 'unitsStressMPa', label: t('cmd.unitsStressMPa'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_UNIT', payload: 'MPa' })) },
    { id: 'unitsStresskPa', label: t('cmd.unitsStresskPa'), category: t('cmd.catUnits'), action: () => closeAndRun(() => dispatch({ type: 'SET_STRESS_UNIT', payload: 'kPa' })) },

    // ══════════════════════════════════════════════════════════════════
    // ── SETTINGS ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'lightMode', label: t('cmd.lightMode'), category: t('cmd.catSettings'), action: () => closeAndRun(() => document.documentElement.setAttribute('data-theme', 'light')) },
    { id: 'darkMode', label: t('cmd.darkMode'), category: t('cmd.catSettings'), action: () => closeAndRun(() => document.documentElement.setAttribute('data-theme', 'dark')) },
    { id: 'langEN', label: t('cmd.langEN'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('en')) },
    { id: 'langNL', label: t('cmd.langNL'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('nl')) },
    { id: 'langFR', label: t('cmd.langFR'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('fr')) },
    { id: 'langES', label: t('cmd.langES'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('es')) },
    { id: 'langZH', label: t('cmd.langZH'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('zh')) },
    { id: 'langIT', label: t('cmd.langIT'), category: t('cmd.catSettings'), action: () => closeAndRun(() => setLocale('it')) },
    // German language not yet supported - removed to avoid TypeScript error

    // ══════════════════════════════════════════════════════════════════
    // ── LAYERS ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'addLayer', label: t('cmd.addLayer'), category: t('cmd.catLayers'), action: () => dialog('addLayer') },
    { id: 'deleteLayer', label: t('cmd.deleteLayer'), category: t('cmd.catLayers'), action: () => dialog('deleteLayer') },
    { id: 'renameLayer', label: t('cmd.renameLayer'), category: t('cmd.catLayers'), action: () => dialog('renameLayer') },
    { id: 'hideLayer', label: t('cmd.hideLayer'), category: t('cmd.catLayers'), action: () => dialog('hideLayer') },
    { id: 'showAllLayers', label: t('cmd.showAllLayers'), category: t('cmd.catLayers'), action: () => dialog('showAllLayers') },
    { id: 'lockLayer', label: t('cmd.lockLayer'), category: t('cmd.catLayers'), action: () => dialog('lockLayer') },
    { id: 'unlockAllLayers', label: t('cmd.unlockAllLayers'), category: t('cmd.catLayers'), action: () => dialog('unlockAllLayers') },

    // ══════════════════════════════════════════════════════════════════
    // ── HELP ──────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    { id: 'helpDocs', label: t('cmd.helpDocs'), category: t('cmd.catHelp'), shortcut: 'F1', action: () => dialog('helpDocs') },
    { id: 'helpShortcuts', label: t('cmd.helpShortcuts'), category: t('cmd.catHelp'), action: () => dialog('helpShortcuts') },
    { id: 'helpAbout', label: t('cmd.helpAbout'), category: t('cmd.catHelp'), action: () => dialog('helpAbout') },
    { id: 'helpTutorial', label: t('cmd.helpTutorial'), category: t('cmd.catHelp'), action: () => dialog('helpTutorial') },
    { id: 'helpEurocodes', label: t('cmd.helpEurocodes'), category: t('cmd.catHelp'), action: () => dialog('helpEurocodes') },
    { id: 'helpFEMTheory', label: t('cmd.helpFEMTheory'), category: t('cmd.catHelp'), action: () => dialog('helpFEMTheory') },
  ], [state, dispatch, setTool, dialog, closeAndRun, t, setLocale]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  };

  if (!isOpen) {
    return (
      <div className="command-palette-hint" onClick={() => { setIsOpen(true); setQuery(''); }}>
        <span className="command-palette-hint-icon">&#x2315;</span>
        <span>{t('cmd.searchCommands')}</span>
        <span className="command-palette-hint-shortcut">Ctrl+K</span>
      </div>
    );
  }

  return (
    <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('cmdPalette.placeholder')}
        />
        <div className="command-palette-results">
          {filtered.slice(0, 15).map((cmd, i) => (
            <div
              key={cmd.id}
              className={`command-palette-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => cmd.action()}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="command-palette-item-category">{cmd.category}</span>
              <span className="command-palette-item-label">{cmd.label}</span>
              {cmd.shortcut && <span className="command-palette-item-shortcut">{cmd.shortcut}</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="command-palette-empty">{t('cmd.noResults')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
