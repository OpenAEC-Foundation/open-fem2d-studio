import { Mesh } from '../fem/Mesh';
import { ILoadCase, ILoadCombination } from '../fem/LoadCase';
import { IProjectInfo, IGraphState, IVersioningState } from '../../context/FEMContext';
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
}

export function serializeProject(
  mesh: Mesh,
  loadCases: ILoadCase[],
  loadCombinations: ILoadCombination[],
  projectInfo: IProjectInfo,
  structuralGrid?: IStructuralGrid,
  graphState?: IGraphState | null,
  versioning?: IVersioningState
): string {
  const file: IProjectFile = {
    version: '1.0.0',
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
} {
  const file: IProjectFile = JSON.parse(json);

  const mesh = Mesh.fromJSON(file.mesh as Parameters<typeof Mesh.fromJSON>[0]);

  const loadCases = file.loadCases;

  const loadCombinations: ILoadCombination[] = file.loadCombinations.map(lc => ({
    id: lc.id,
    name: lc.name,
    type: lc.type as 'ULS' | 'SLS',
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

  return { mesh, loadCases, loadCombinations, projectInfo, structuralGrid, graphState, versioning };
}
