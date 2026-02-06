import { useI18n } from '../../i18n/i18n';
import './IFCPropertiesPanel.css';

export interface IFCPropertyData {
  ifcType: string;           // e.g. 'IfcBeam', 'IfcColumn', 'IfcWall', 'IfcStructuralPointConnection'
  elementId?: number;        // beam or plate ID
  nodeId?: number;           // node ID
  profileName?: string;      // e.g. 'HEA 200'
  materialName?: string;
  sectionProps?: {
    A?: number;              // mm²
    Iy?: number;             // mm⁴
    Iz?: number;             // mm⁴
    Wely?: number;           // mm³
    Welz?: number;           // mm³
  };
  geometry?: {
    length?: number;         // meters
    thickness?: number;      // meters (for plates)
    startCoord?: [number, number];
    endCoord?: [number, number];
  };
  forces?: {
    N?: number;    // kN
    Vy?: number;   // kN
    Mz?: number;   // kNm
  };
}

interface Props {
  data: IFCPropertyData;
  onClose: () => void;
}

export function IFCPropertiesPanel({ data, onClose }: Props) {
  const { t } = useI18n();

  const renderRow = (label: string, value: string | number | undefined, unit?: string) => {
    if (value === undefined || value === null) return null;
    const displayVal = typeof value === 'number' ? value.toFixed(value < 1 ? 4 : 1) : value;
    return (
      <div className="ifc-props-row">
        <span className="ifc-props-label">{label}</span>
        <span className="ifc-props-value">{displayVal}{unit ? ` ${unit}` : ''}</span>
      </div>
    );
  };

  return (
    <div className="ifc-props-panel">
      <div className="ifc-props-header">
        <span className="ifc-props-title">{data.ifcType}</span>
        <button className="ifc-props-close" onClick={onClose}>×</button>
      </div>

      <div className="ifc-props-section">
        <div className="ifc-props-section-title">{t('ifcProps.identity')}</div>
        {renderRow('IFC Type', data.ifcType)}
        {data.elementId !== undefined && renderRow(t('ifcProps.elementId'), data.elementId)}
        {data.nodeId !== undefined && renderRow(t('ifcProps.nodeId'), data.nodeId)}
        {data.profileName && renderRow(t('barProps.profile'), data.profileName)}
        {data.materialName && renderRow(t('materials.title'), data.materialName)}
      </div>

      {data.sectionProps && (
        <div className="ifc-props-section">
          <div className="ifc-props-section-title">{t('ifcProps.section')}</div>
          {renderRow('A', data.sectionProps.A, 'mm²')}
          {renderRow('Iy', data.sectionProps.Iy, 'mm⁴')}
          {renderRow('Iz', data.sectionProps.Iz, 'mm⁴')}
          {renderRow('Wely', data.sectionProps.Wely, 'mm³')}
          {renderRow('Welz', data.sectionProps.Welz, 'mm³')}
        </div>
      )}

      {data.geometry && (
        <div className="ifc-props-section">
          <div className="ifc-props-section-title">{t('ifcProps.geometry')}</div>
          {data.geometry.length !== undefined && renderRow(t('ifcProps.length'), (data.geometry.length * 1000).toFixed(0), 'mm')}
          {data.geometry.thickness !== undefined && renderRow(t('ifcProps.thickness'), (data.geometry.thickness * 1000).toFixed(0), 'mm')}
          {data.geometry.startCoord && renderRow(t('ifcProps.start'), `(${data.geometry.startCoord[0].toFixed(3)}, ${data.geometry.startCoord[1].toFixed(3)})`, 'm')}
          {data.geometry.endCoord && renderRow(t('ifcProps.end'), `(${data.geometry.endCoord[0].toFixed(3)}, ${data.geometry.endCoord[1].toFixed(3)})`, 'm')}
        </div>
      )}

      {data.forces && (
        <div className="ifc-props-section">
          <div className="ifc-props-section-title">{t('ifcProps.forces')}</div>
          {renderRow('N', data.forces.N, 'kN')}
          {renderRow('Vy', data.forces.Vy, 'kN')}
          {renderRow('Mz', data.forces.Mz, 'kNm')}
        </div>
      )}
    </div>
  );
}
