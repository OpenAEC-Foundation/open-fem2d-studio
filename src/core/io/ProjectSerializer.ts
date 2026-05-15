import { Mesh } from '../fem/Mesh';
import { ILoadCase, ILoadCombination, LoadCombinationType } from '../fem/LoadCase';
import { IProjectInfo, IGraphState, IVersioningState, IBeamSteelConfig } from '../../context/FEMContext';
import { IStructuralGrid } from '../fem/StructuralGrid';

export interface IProjectFile {
  version: string;
  projectInfo: IProjectInfo;
  mesh: object;
  loadCases: ILoadCase[];
  loadCombinations: { id: number; name: string; type: string; factors: [number, number][] }[];
  structuralGrid?: IStructuralGrid;
  graphState?: IGraphState | null;
  versioning?: IVersioningState;
  beamSteelConfigs?: IBeamSteelConfig[];
}

export function serializeProject(
  mesh: Mesh,
  loadCases: ILoadCase[],
  loadCombinations: ILoadCombination[],
  projectInfo: IProjectInfo,
  structuralGrid?: IStructuralGrid,
  graphState?: IGraphState | null,
  versioning?: IVersioningState,
  beamSteelConfigs?: Map<number, IBeamSteelConfig>
): string {
  const file: IProjectFile = {
    version: '1.1.0',
    projectInfo,
    mesh: mesh.toJSON(),
    loadCases,
    loadCombinations: loadCombinations.map(lc => ({
      id: lc.id,
      name: lc.name,
      type: lc.type,
      factors: Array.from(lc.factors.entries())
    })),
    structuralGrid,
    graphState: graphState ?? undefined,
    versioning,
    beamSteelConfigs: beamSteelConfigs ? Array.from(beamSteelConfigs.values()) : [],
  };
  return JSON.stringify(file, null, 2);
}

export function deserializeProject(json: string): {
  mesh: Mesh;
  loadCases: ILoadCase[];
  loadCombinations: ILoadCombination[];
  projectInfo: IProjectInfo;
  structuralGrid?: IStructuralGrid;
  graphState?: IGraphState | null;
  versioning?: IVersioningState;
  beamSteelConfigs: Map<number, IBeamSteelConfig>;
} {
  const file: IProjectFile = JSON.parse(json);

  const mesh = Mesh.fromJSON(file.mesh as Parameters<typeof Mesh.fromJSON>[0]);

  const loadCases = file.loadCases;

  // Backward compatibility: convert old 'ULS'/'SLS' to new Eurocode types
  const mapLegacyType = (t: string): LoadCombinationType => {
    if (t === 'ULS') return '6.10b';
    if (t === 'SLS') return '6.16';
    return t as LoadCombinationType;
  };

  const loadCombinations: ILoadCombination[] = file.loadCombinations.map(lc => ({
    id: lc.id,
    name: lc.name,
    type: mapLegacyType(lc.type),
    factors: new Map(lc.factors)
  }));

  const projectInfo = file.projectInfo;
  const structuralGrid = file.structuralGrid;

  const graphState = file.graphState ?? null;

  // Versioning state with defaults
  const versioning = file.versioning ?? {
    versions: [],
    currentBranch: 'main',
    branches: ['main']
  };

  // Backwards compat: v1.0.0 files don't have beamSteelConfigs
  const beamSteelConfigs = new Map<number, IBeamSteelConfig>();
  if (file.beamSteelConfigs && Array.isArray(file.beamSteelConfigs)) {
    for (const config of file.beamSteelConfigs) {
      beamSteelConfigs.set(config.beamId, config);
    }
  }

  return { mesh, loadCases, loadCombinations, projectInfo, structuralGrid, graphState, versioning, beamSteelConfigs };
}
