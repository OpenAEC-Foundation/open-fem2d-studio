/**
 * IFC Exporter - Generates IFC 4x3 STEP files from the FEM model
 * Supports structural analysis entities (IfcStructuralAnalysisModel)
 */

import { Mesh } from '../fem/Mesh';
import { ISolverResult } from '../fem/types';
import { ILoadCase, ILoadCombination } from '../fem/LoadCase';

// Allow arrays of numbers for coordinates
type IFCAttrValue = string | number | boolean | null | IFCEntity | IFCEntity[] | number[];

export interface IFCEntity {
  id: number;
  type: string;
  attributes: IFCAttrValue[];
  label?: string;
}

export interface IFCModel {
  entities: Map<number, IFCEntity>;
  nextId: number;
  header: {
    description: string;
    implementationLevel: string;
    fileName: string;
    timeStamp: string;
    author: string;
    organization: string;
    application: string;
    schema: string;
  };
}

/**
 * Create a new IFC model with header
 */
export function createIFCModel(projectName: string): IFCModel {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0];

  return {
    entities: new Map(),
    nextId: 1,
    header: {
      description: `ViewDefinition [StructuralAnalysisView]`,
      implementationLevel: '2;1',
      fileName: `${projectName}.ifc`,
      timeStamp: timestamp,
      author: 'Open-FEM2D-Studio User',
      organization: 'Open-FEM2D-Studio',
      application: 'Open-FEM2D-Studio',
      schema: 'IFC4X3_ADD2',
    },
  };
}

/**
 * Add an entity to the model and return its reference
 */
function addEntity(model: IFCModel, type: string, attributes: IFCAttrValue[], label?: string): IFCEntity {
  const entity: IFCEntity = {
    id: model.nextId++,
    type,
    attributes,
    label,
  };
  model.entities.set(entity.id, entity);
  return entity;
}

/**
 * Format a value for IFC STEP format
 */
function formatValue(value: IFCAttrValue | undefined): string {
  if (value === null || value === undefined) return '$';
  if (typeof value === 'boolean') return value ? '.T.' : '.F.';
  if (typeof value === 'string') {
    if (value.startsWith('.') && value.endsWith('.')) return value; // Enum
    if (value.startsWith('#')) return value; // Reference
    if (value === '*') return '*'; // Inherited
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    return value.toExponential(6).toUpperCase().replace('E+', 'E');
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '()';
    // Check if it's an array of numbers (coordinates)
    if (typeof value[0] === 'number') {
      return `(${(value as number[]).map(v => formatValue(v)).join(',')})`;
    }
    // Array of entities
    return `(${(value as IFCEntity[]).map(v => formatValue(v)).join(',')})`;
  }
  if (typeof value === 'object' && 'id' in value) {
    return `#${value.id}`;
  }
  return '$';
}

/**
 * Format an entity to IFC STEP line
 */
function formatEntity(entity: IFCEntity): string {
  const attrs = entity.attributes.map(a => formatValue(a)).join(',');
  return `#${entity.id}=${entity.type}(${attrs});`;
}

/**
 * Export mesh to IFC model
 */
export function exportMeshToIFC(
  mesh: Mesh,
  projectName: string,
  loadCases: ILoadCase[],
  loadCombinations: ILoadCombination[],
  result?: ISolverResult
): IFCModel {
  const model = createIFCModel(projectName);

  // === Base setup ===

  // IfcPerson
  const person = addEntity(model, 'IFCPERSON', [null, null, null, null, null, null, null, null]);

  // IfcOrganization
  const org = addEntity(model, 'IFCORGANIZATION', [null, 'Open-FEM2D-Studio', null, null, null]);

  // IfcPersonAndOrganization
  const personOrg = addEntity(model, 'IFCPERSONANDORGANIZATION', [person, org, null]);

  // IfcApplication
  const app = addEntity(model, 'IFCAPPLICATION', [org, '1.0', 'Open-FEM2D-Studio', 'FEM2D']);

  // IfcOwnerHistory
  const ownerHistory = addEntity(model, 'IFCOWNERHISTORY', [
    personOrg, app, null, '.READWRITE.', null, null, null, Math.floor(Date.now() / 1000)
  ]);

  // IfcSIUnit for length (meter)
  const unitLength = addEntity(model, 'IFCSIUNIT', ['*', '.LENGTHUNIT.', null, '.METRE.']);

  // IfcSIUnit for force (newton)
  const unitForce = addEntity(model, 'IFCSIUNIT', ['*', '.FORCEUNIT.', '.KILO.', '.NEWTON.']);

  // IfcSIUnit for moment (newton meter)
  const unitMoment = addEntity(model, 'IFCDERIVEDUNIT', [
    [addEntity(model, 'IFCDERIVEDUNITELEMENT', [unitForce, 1]),
     addEntity(model, 'IFCDERIVEDUNITELEMENT', [unitLength, 1])],
    '.TORQUEUNIT.', null
  ]);

  // IfcUnitAssignment
  const units = addEntity(model, 'IFCUNITASSIGNMENT', [[unitLength, unitForce, unitMoment]]);

  // Geometric context
  const origin = addEntity(model, 'IFCCARTESIANPOINT', [[0.0, 0.0, 0.0]]);
  const axis = addEntity(model, 'IFCDIRECTION', [[0.0, 0.0, 1.0]]);
  const refDir = addEntity(model, 'IFCDIRECTION', [[1.0, 0.0, 0.0]]);
  const worldCS = addEntity(model, 'IFCAXIS2PLACEMENT3D', [origin, axis, refDir]);

  const context = addEntity(model, 'IFCGEOMETRICREPRESENTATIONCONTEXT', [
    'Model', 'Model', 3, 1.0E-5, worldCS, null
  ]);

  // IfcProject
  const project = addEntity(model, 'IFCPROJECT', [
    generateGUID(), ownerHistory, projectName, null, null, null, null, [context], units
  ], 'Project');

  // IfcSite
  const site = addEntity(model, 'IFCSITE', [
    generateGUID(), ownerHistory, 'Site', null, null, null, null, null, '.ELEMENT.', null, null, null, null, null
  ], 'Site');

  // IfcBuilding
  const building = addEntity(model, 'IFCBUILDING', [
    generateGUID(), ownerHistory, 'Building', null, null, null, null, null, '.ELEMENT.', null, null, null
  ], 'Building');

  // Spatial hierarchy
  addEntity(model, 'IFCRELAGGREGATES', [generateGUID(), ownerHistory, null, null, project, [site]]);
  addEntity(model, 'IFCRELAGGREGATES', [generateGUID(), ownerHistory, null, null, site, [building]]);

  // === Structural Analysis Model ===

  const analysisModel = addEntity(model, 'IFCSTRUCTURALANALYSISMODEL', [
    generateGUID(), ownerHistory, 'StructuralAnalysisModel', 'FEM Analysis Model',
    null, null, null, '.LOADING_3D.', null, null, null
  ], 'StructuralAnalysisModel');

  // Map to store node entity references
  const nodeEntities = new Map<number, IFCEntity>();
  const beamEntities = new Map<number, IFCEntity>();

  // === Export Nodes as IfcStructuralPointConnection ===
  for (const node of mesh.nodes.values()) {
    const pointCoord = addEntity(model, 'IFCCARTESIANPOINT', [[node.x, node.y, 0.0]]);

    const c = node.constraints;

    // Create vertex point
    const vertexPoint = addEntity(model, 'IFCVERTEXPOINT', [pointCoord]);

    // IfcStructuralPointConnection
    const nodeEntity = addEntity(model, 'IFCSTRUCTURALPOINTCONNECTION', [
      generateGUID(), ownerHistory, `Node_${node.id}`,
      `Node at (${node.x.toFixed(3)}, ${node.y.toFixed(3)})`,
      null, null, null, vertexPoint, null
    ], `Node_${node.id}`);

    nodeEntities.set(node.id, nodeEntity);

    // Add boundary condition if constrained
    if (c.x || c.y || c.rotation) {
      // Create boundary condition
      const translationalX = c.x ? (c.springX ?? true) : false;
      const translationalY = c.y ? (c.springY ?? true) : false;
      const rotationalZ = c.rotation ? (c.springRot ?? true) : false;

      const bc = addEntity(model, 'IFCBOUNDARYNODECONDITION', [
        `BC_Node_${node.id}`,
        typeof translationalX === 'number' ? translationalX : (translationalX ? '.FIXED.' : '.FREE.'),
        typeof translationalY === 'number' ? translationalY : (translationalY ? '.FIXED.' : '.FREE.'),
        '.FREE.', // Z translation (2D model)
        '.FREE.', // X rotation
        '.FREE.', // Y rotation
        typeof rotationalZ === 'number' ? rotationalZ : (rotationalZ ? '.FIXED.' : '.FREE.')
      ]);

      // Relate boundary condition to node
      addEntity(model, 'IFCRELCONNECTSSTRUCTURALACTIVITY', [
        generateGUID(), ownerHistory, null, null, nodeEntity, bc
      ]);
    }
  }

  // === Export Beams as IfcStructuralCurveMember ===
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [n1, n2] = nodes;

    const startPoint = addEntity(model, 'IFCCARTESIANPOINT', [[n1.x, n1.y, 0.0]]);
    const endPoint = addEntity(model, 'IFCCARTESIANPOINT', [[n2.x, n2.y, 0.0]]);

    // Create edge curve (straight line between nodes)
    addEntity(model, 'IFCEDGECURVE', [
      addEntity(model, 'IFCVERTEXPOINT', [startPoint]),
      addEntity(model, 'IFCVERTEXPOINT', [endPoint]),
      addEntity(model, 'IFCPOLYLINE', [[startPoint, endPoint]]),
      '.T.'
    ]);

    // Determine predefined type based on connections
    let predefinedType = '.RIGID_JOINED_MEMBER.';
    const startConn = beam.startConnection;
    const endConn = beam.endConnection;
    if (startConn || endConn) {
      // Check if connections indicate hinges (rotation released)
      const startHinge = startConn === 'hinge';
      const endHinge = endConn === 'hinge';
      if (startHinge && endHinge) {
        predefinedType = '.PIN_JOINED_MEMBER.';
      } else if (startHinge || endHinge) {
        predefinedType = '.TENSION_MEMBER.'; // Approximation
      }
    }

    const material = mesh.getMaterial(beam.materialId);
    const description = [
      beam.profileName || 'Unknown Profile',
      material ? `E=${(material.E / 1e9).toFixed(0)}GPa` : '',
      `A=${(beam.section.A * 1e6).toFixed(0)}mm²`,
      `I=${(beam.section.I * 1e12).toFixed(0)}mm⁴`
    ].filter(s => s).join(', ');

    // IfcStructuralCurveMember
    const beamEntity = addEntity(model, 'IFCSTRUCTURALCURVEMEMBER', [
      generateGUID(), ownerHistory, `Beam_${beam.id}`, description,
      null, null, null, predefinedType, addEntity(model, 'IFCDIRECTION', [[0.0, 0.0, 1.0]])
    ], `Beam_${beam.id}`);

    beamEntities.set(beam.id, beamEntity);

    // Connect to nodes
    const node1Entity = nodeEntities.get(n1.id);
    const node2Entity = nodeEntities.get(n2.id);

    if (node1Entity) {
      addEntity(model, 'IFCRELCONNECTSSTRUCTURALMEMBER', [
        generateGUID(), ownerHistory, null, null, beamEntity, node1Entity, null, null, null, null
      ]);
    }
    if (node2Entity) {
      addEntity(model, 'IFCRELCONNECTSSTRUCTURALMEMBER', [
        generateGUID(), ownerHistory, null, null, beamEntity, node2Entity, null, null, null, null
      ]);
    }
  }

  // === Export Plates as IfcStructuralSurfaceMember ===
  for (const plate of mesh.plateRegions.values()) {
    const points: IFCEntity[] = [];

    if (plate.isPolygon && plate.polygon) {
      for (const pt of plate.polygon) {
        points.push(addEntity(model, 'IFCCARTESIANPOINT', [[pt.x, pt.y, 0.0]]));
      }
    } else {
      // Rectangular plate from corner nodes
      for (const nodeId of plate.cornerNodeIds) {
        const node = mesh.getNode(nodeId);
        if (node) {
          points.push(addEntity(model, 'IFCCARTESIANPOINT', [[node.x, node.y, 0.0]]));
        }
      }
    }

    if (points.length < 3) continue;

    // Close the polyline
    addEntity(model, 'IFCPOLYLINE', [[...points, points[0]]]);

    addEntity(model, 'IFCSTRUCTURALSURFACEMEMBER', [
      generateGUID(), ownerHistory, `Plate_${plate.id}`,
      `Thickness: ${(plate.thickness * 1000).toFixed(0)}mm`,
      null, null, null, '.SHELL.', plate.thickness
    ], `Plate_${plate.id}`);
  }

  // === Export Load Cases as IfcStructuralLoadGroup ===
  const loadGroupEntities = new Map<number, IFCEntity>();

  for (const lc of loadCases) {
    const loadGroup = addEntity(model, 'IFCSTRUCTURALLOADGROUP', [
      generateGUID(), ownerHistory, lc.name, null, null,
      '.LOAD_CASE.', '.PERMANENT_G.', '.ULTIMATE.', null, null
    ], lc.name);

    loadGroupEntities.set(lc.id, loadGroup);

    // Add point loads for this load case (loads are stored in ILoadCase)
    for (const load of lc.pointLoads) {
      const nodeEntity = nodeEntities.get(load.nodeId);
      if (!nodeEntity) continue;

      // IfcStructuralLoadSingleForce
      const loadValue = addEntity(model, 'IFCSTRUCTURALLOADSINGLEFORCE', [
        `Load_${load.nodeId}`,
        load.fx ?? 0, load.fy ?? 0, 0, // Forces (FZ = 0 for 2D)
        0, 0, load.mz ?? 0 // Moments
      ]);

      // IfcStructuralPointAction
      addEntity(model, 'IFCSTRUCTURALPOINTACTION', [
        generateGUID(), ownerHistory, `PointLoad_${load.nodeId}`, null,
        null, null, null, '.GLOBAL_COORDS.', '.T.', nodeEntity, loadValue
      ]);
    }

    // Add distributed loads (loads are stored in ILoadCase)
    for (const dload of lc.distributedLoads) {
      const beamEntity = beamEntities.get(dload.elementId);
      if (!beamEntity) continue;

      // IfcStructuralLoadLinearForce
      const loadValue = addEntity(model, 'IFCSTRUCTURALLOADLINEARFORCE', [
        `DistLoad_${dload.elementId}`,
        dload.qx ?? 0, dload.qy ?? 0, 0, // Linear forces
        0, 0, 0 // Moments per length
      ]);

      // IfcStructuralLinearAction
      addEntity(model, 'IFCSTRUCTURALLINEARACTION', [
        generateGUID(), ownerHistory, `DistLoad_${dload.elementId}`, null,
        null, null, null, '.GLOBAL_COORDS.', '.T.', beamEntity, loadValue, '.CONST.', null
      ]);
    }
  }

  // === Export Load Combinations ===
  for (const combo of loadCombinations) {
    const comboGroup = addEntity(model, 'IFCSTRUCTURALLOADGROUP', [
      generateGUID(), ownerHistory, combo.name, null, null,
      '.LOAD_COMBINATION.', '.NOTDEFINED.', '.ULTIMATE.', null, null
    ], combo.name);

    // Link to component load cases (factors is a Map<loadCaseId, factor>)
    const componentGroups: IFCEntity[] = [];
    for (const [loadCaseId] of combo.factors.entries()) {
      const lcGroup = loadGroupEntities.get(loadCaseId);
      if (lcGroup) componentGroups.push(lcGroup);
    }

    if (componentGroups.length > 0) {
      addEntity(model, 'IFCRELASSIGNSTOGROUP', [
        generateGUID(), ownerHistory, null, null, componentGroups, null, comboGroup
      ]);
    }
  }

  // === Export Results (if available) ===
  if (result) {
    // IfcStructuralResultGroup
    addEntity(model, 'IFCSTRUCTURALRESULTGROUP', [
      generateGUID(), ownerHistory, 'AnalysisResults', 'Linear elastic analysis results',
      null, '.LINEAR.', null, '.T.'
    ]);

    // Nodal displacements
    for (const node of mesh.nodes.values()) {
      const nodeEntity = nodeEntities.get(node.id);
      if (!nodeEntity) continue;

      const idx = Array.from(mesh.nodes.keys()).indexOf(node.id);
      if (idx < 0) continue;

      const ux = result.displacements[idx * 3] ?? 0;
      const uy = result.displacements[idx * 3 + 1] ?? 0;
      const rz = result.displacements[idx * 3 + 2] ?? 0;

      // IfcStructuralPointReaction (used for displacement results)
      addEntity(model, 'IFCSTRUCTURALLOADSINGLEFORCE', [
        `Disp_${node.id}`,
        ux * 1000, uy * 1000, 0, // Displacements in mm
        0, 0, rz * 1000 // Rotations in mrad
      ]);
    }

    // Reaction forces (reactions is just number[], not structured per node)
    // We skip detailed reaction export as we don't have per-node structured data

    // Beam internal forces
    for (const [beamId, forces] of result.beamForces.entries()) {
      const beamEntity = beamEntities.get(beamId);
      if (!beamEntity) continue;

      // Store max/min forces as custom properties
      const maxN = Math.max(...forces.normalForce.map(Math.abs));
      const maxV = Math.max(...forces.shearForce.map(Math.abs));
      const maxM = Math.max(...forces.bendingMoment.map(Math.abs));

      // Use property set for internal forces
      const propN = addEntity(model, 'IFCPROPERTYSINGLEVALUE', [
        'MaxAxialForce', null, addEntity(model, 'IFCFORCEMEASURE', [maxN / 1000]), null
      ]);
      const propV = addEntity(model, 'IFCPROPERTYSINGLEVALUE', [
        'MaxShearForce', null, addEntity(model, 'IFCFORCEMEASURE', [maxV / 1000]), null
      ]);
      const propM = addEntity(model, 'IFCPROPERTYSINGLEVALUE', [
        'MaxBendingMoment', null, addEntity(model, 'IFCFORCEMEASURE', [maxM / 1000]), null
      ]);

      const pset = addEntity(model, 'IFCPROPERTYSET', [
        generateGUID(), ownerHistory, 'Pset_InternalForces', null, [propN, propV, propM]
      ]);

      addEntity(model, 'IFCRELDEFINESBYPROPERTIES', [
        generateGUID(), ownerHistory, null, null, [beamEntity], pset
      ]);
    }
  }

  // === Assign all structural items to analysis model ===
  const allStructuralItems = [
    ...nodeEntities.values(),
    ...beamEntities.values()
  ];

  if (allStructuralItems.length > 0) {
    addEntity(model, 'IFCRELASSIGNSTOGROUP', [
      generateGUID(), ownerHistory, null, null, allStructuralItems, null, analysisModel
    ]);
  }

  return model;
}

/**
 * Convert IFC model to STEP format string
 */
export function generateIFCString(model: IFCModel): string {
  const lines: string[] = [];

  // ISO header
  lines.push('ISO-10303-21;');
  lines.push('HEADER;');
  lines.push(`FILE_DESCRIPTION(('${model.header.description}'),'${model.header.implementationLevel}');`);
  lines.push(`FILE_NAME('${model.header.fileName}','${model.header.timeStamp}',('${model.header.author}'),('${model.header.organization}'),'','${model.header.application}','');`);
  lines.push(`FILE_SCHEMA(('${model.header.schema}'));`);
  lines.push('ENDSEC;');
  lines.push('');
  lines.push('DATA;');

  // Sort entities by ID
  const sortedEntities = Array.from(model.entities.values()).sort((a, b) => a.id - b.id);

  for (const entity of sortedEntities) {
    const line = formatEntity(entity);
    // Add comment with label if available
    if (entity.label) {
      lines.push(`${line} /* ${entity.label} */`);
    } else {
      lines.push(line);
    }
  }

  lines.push('ENDSEC;');
  lines.push('END-ISO-10303-21;');

  return lines.join('\n');
}

/**
 * Generate a pseudo-GUID for IFC
 */
function generateGUID(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let guid = '';
  for (let i = 0; i < 22; i++) {
    guid += chars[Math.floor(Math.random() * 64)];
  }
  return guid;
}

/**
 * Build entity relationship graph for visualization
 */
export interface IFCGraphNode {
  id: number;
  type: string;
  label: string;
  category: 'project' | 'spatial' | 'structural' | 'load' | 'result' | 'other';
}

export interface IFCGraphEdge {
  source: number;
  target: number;
  relationship: string;
}

export interface IFCGraph {
  nodes: IFCGraphNode[];
  edges: IFCGraphEdge[];
}

export function buildIFCGraph(model: IFCModel): IFCGraph {
  const nodes: IFCGraphNode[] = [];
  const edges: IFCGraphEdge[] = [];

  // Categorize entities
  const getCategory = (type: string): IFCGraphNode['category'] => {
    if (type.includes('PROJECT') || type.includes('PERSON') || type.includes('ORGANIZATION') || type.includes('APPLICATION')) return 'project';
    if (type.includes('SITE') || type.includes('BUILDING') || type.includes('STOREY')) return 'spatial';
    if (type.includes('STRUCTURALPOINT') || type.includes('STRUCTURALCURVE') || type.includes('STRUCTURALSURFACE') || type.includes('STRUCTURALANALYSIS') || type.includes('BOUNDARY')) return 'structural';
    if (type.includes('LOAD') || type.includes('ACTION')) return 'load';
    if (type.includes('RESULT') || type.includes('REACTION')) return 'result';
    return 'other';
  };

  // Build nodes (filter to important entity types)
  const importantTypes = new Set([
    'IFCPROJECT', 'IFCSITE', 'IFCBUILDING',
    'IFCSTRUCTURALANALYSISMODEL',
    'IFCSTRUCTURALPOINTCONNECTION', 'IFCSTRUCTURALCURVEMEMBER', 'IFCSTRUCTURALSURFACEMEMBER',
    'IFCSTRUCTURALLOADGROUP', 'IFCSTRUCTURALRESULTGROUP',
    'IFCSTRUCTURALPOINTACTION', 'IFCSTRUCTURALLINEARACTION',
    'IFCSTRUCTURALPOINTREACTION',
    'IFCBOUNDARYNODECONDITION'
  ]);

  for (const entity of model.entities.values()) {
    if (importantTypes.has(entity.type)) {
      nodes.push({
        id: entity.id,
        type: entity.type.replace('IFC', ''),
        label: entity.label || `#${entity.id}`,
        category: getCategory(entity.type),
      });
    }
  }

  // Build edges from relationships
  const relTypes = ['IFCRELAGGREGATES', 'IFCRELASSIGNSTOGROUP', 'IFCRELCONNECTSSTRUCTURALMEMBER', 'IFCRELCONNECTSSTRUCTURALACTIVITY', 'IFCRELDEFINESBYPROPERTIES'];

  for (const entity of model.entities.values()) {
    if (relTypes.includes(entity.type)) {
      // Extract source and targets from relationship attributes
      // Most relationships have format: (GUID, OwnerHistory, Name, Description, RelatingObject, RelatedObjects)
      const attrs = entity.attributes;

      if (entity.type === 'IFCRELAGGREGATES') {
        // attrs[4] = RelatingObject, attrs[5] = RelatedObjects
        const relating = attrs[4] as IFCEntity | undefined;
        const related = attrs[5] as IFCEntity[] | undefined;
        if (relating && related && typeof relating === 'object' && 'id' in relating) {
          for (const rel of related) {
            if (typeof rel === 'object' && 'id' in rel && importantTypes.has(relating.type) && importantTypes.has(rel.type)) {
              edges.push({ source: relating.id, target: rel.id, relationship: 'aggregates' });
            }
          }
        }
      } else if (entity.type === 'IFCRELASSIGNSTOGROUP') {
        // attrs[4] = RelatedObjects, attrs[6] = RelatingGroup
        const related = attrs[4] as IFCEntity[] | undefined;
        const relating = attrs[6] as IFCEntity | undefined;
        if (relating && related && typeof relating === 'object' && 'id' in relating) {
          for (const rel of related) {
            if (typeof rel === 'object' && 'id' in rel && importantTypes.has(relating.type) && importantTypes.has(rel.type)) {
              edges.push({ source: relating.id, target: rel.id, relationship: 'contains' });
            }
          }
        }
      } else if (entity.type === 'IFCRELCONNECTSSTRUCTURALMEMBER') {
        // attrs[4] = RelatingStructuralMember, attrs[5] = RelatedStructuralConnection
        const member = attrs[4] as IFCEntity | undefined;
        const connection = attrs[5] as IFCEntity | undefined;
        if (member && connection && typeof member === 'object' && 'id' in member && typeof connection === 'object' && 'id' in connection) {
          edges.push({ source: member.id, target: connection.id, relationship: 'connects' });
        }
      }
    }
  }

  return { nodes, edges };
}
