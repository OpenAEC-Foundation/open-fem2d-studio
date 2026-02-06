import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { formatStress } from '../../utils/colors';
import './StatusBar.css';

export function StatusBar() {
  const { t } = useI18n();
  const { state } = useFEM();
  const { mesh, result, selectedTool, viewState, mouseWorldPos, solverError, stressUnit } = state;

  const toolHints: Record<string, string> = {
    select: t('status.clickSelect'),
    addNode: t('status.clickNode'),
    addElement: t('status.clickTriangle'),
    addConstraint: t('status.clickConstraint'),
    addLoad: t('status.clickForce'),
    delete: t('status.clickDelete'),
    pan: t('status.dragPan'),
    addBeam: t('status.clickBeam'),
    addLineLoad: t('status.clickDistLoad'),
    addPinned: t('status.clickPinned'),
    addXRoller: t('status.clickXRoller'),
    addZRoller: t('status.clickZRoller'),
    addZSpring: t('status.clickZSpring'),
    addRotSpring: t('status.clickRotSpring'),
    addXSpring: t('status.clickXSpring'),
    addFixed: t('status.clickFixed'),
    addPlate: t('status.clickPlate'),
    addThermalLoad: t('status.clickThermal'),
    addSubNode: t('status.clickSubNode'),
    rotate: t('status.clickRotate')
  };

  const zoomPercent = Math.round(viewState.scale);

  return (
    <div className="status-bar">
      <div className="status-section">
        <span className="status-label">{t('status.tool')}</span>
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
          <strong>{t('statusBar.nodes')}:</strong> {mesh.getNodeCount()}
        </span>
        <span>
          <strong>{t('statusBar.beams')}:</strong> {mesh.getBeamCount()}
        </span>
        <span>
          <strong>{t('status.elements')}</strong> {mesh.getElementCount()}
        </span>
        <span className="status-zoom">
          <strong>Zoom:</strong> {zoomPercent}%
        </span>
        {solverError && (
          <span className="status-error">{solverError}</span>
        )}
        {result && !solverError && (
          <>
            <span className="status-solved">{t('browser.solved')}</span>
            <span>
              <strong>Max Stress:</strong> {formatStress(result.maxVonMises, stressUnit)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
