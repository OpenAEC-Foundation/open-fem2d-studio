import { useFEM } from '../../context/FEMContext';
import { formatStress } from '../../utils/colors';
import './StatusBar.css';

export function StatusBar() {
  const { state } = useFEM();
  const { mesh, result, selectedTool, viewState, mouseWorldPos, solverError, stressUnit } = state;

  const toolHints: Record<string, string> = {
    select: 'Click to select nodes/elements. Shift+click to multi-select. Drag to move nodes.',
    addNode: 'Click to place a new node on the grid.',
    addElement: 'Click 3 nodes to create a triangular element.',
    addConstraint: 'Click a node to toggle fixed constraint.',
    addLoad: 'Click a node to apply a force.',
    delete: 'Click a node or element to delete it.',
    pan: 'Drag to pan the view. Scroll to zoom.',
    addBeam: 'Click two nodes to create a beam element.',
    addLineLoad: 'Click a beam or plate edge to apply a distributed load.',
    addPinned: 'Click a node to add a pinned support.',
    addXRoller: 'Click a node to add an X-roller support.',
    addZRoller: 'Click a node to add a Z-roller support.',
    addZSpring: 'Click a node to add a Z-spring support.',
    addRotSpring: 'Click a node to add a rotational spring.',
    addXSpring: 'Click a node to add an X-spring support.',
    addFixed: 'Click a node to add a fixed support.',
    addPlate: 'Click two corners to create a plate element.',
    addThermalLoad: 'Click elements to apply a thermal load.',
    addSubNode: 'Click a beam to add a sub-node.',
    rotate: 'Click rotation center, then enter angle.'
  };

  const zoomPercent = Math.round(viewState.scale);

  return (
    <div className="status-bar">
      <div className="status-section">
        <span className="status-label">Tool:</span>
        <span className="status-hint">{toolHints[selectedTool] ?? selectedTool}</span>
      </div>

      <div className="status-section status-coords">
        {mouseWorldPos ? (
          <span className="status-coord-value">
            X: {mouseWorldPos.x.toFixed(3)} m | Z: {mouseWorldPos.y.toFixed(3)} m
          </span>
        ) : (
          <span className="status-coord-value status-coord-empty">
            X: --- | Z: ---
          </span>
        )}
      </div>

      <div className="status-section status-stats">
        <span>
          <strong>Nodes:</strong> {mesh.getNodeCount()}
        </span>
        <span>
          <strong>Beams:</strong> {mesh.getBeamCount()}
        </span>
        <span>
          <strong>Elements:</strong> {mesh.getElementCount()}
        </span>
        <span className="status-zoom">
          <strong>Zoom:</strong> {zoomPercent}%
        </span>
        {solverError && (
          <span className="status-error">{solverError}</span>
        )}
        {result && !solverError && (
          <>
            <span className="status-solved">Solved</span>
            <span>
              <strong>Max Stress:</strong> {formatStress(result.maxVonMises, stressUnit)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
