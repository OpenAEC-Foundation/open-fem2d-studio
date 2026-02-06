/**
 * ModelViewer3D - 3D visualization of the structural model
 * Renders beam elements with parametric steel profile geometry,
 * plate regions as extruded walls, and supports raycaster selection
 * with an IFC properties panel.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useFEM } from '../../context/FEMContext';
import { useI18n } from '../../i18n/i18n';
import { IBeamElement, INode, IPlateRegion } from '../../core/fem/types';
import { createProfileShape, detectProfileType } from './ProfileGeometry';
import { IFCPropertiesPanel, IFCPropertyData } from './IFCPropertiesPanel';
import './ModelViewer3D.css';

// Scale factor: model is in meters, we display in mm for better Three.js precision
const SCALE = 1000;

interface ModelViewer3DProps {
  onClose?: () => void;
}

export function ModelViewer3D({ onClose }: ModelViewer3DProps) {
  const { t } = useI18n();
  const { state } = useFEM();
  const { mesh, meshVersion, result, showDeformed, deformationScale } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Refs for mesh objects
  const beamMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const nodeMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const plateMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const beamGroupRef = useRef<THREE.Group | null>(null);
  const nodeGroupRef = useRef<THREE.Group | null>(null);
  const plateGroupRef = useRef<THREE.Group | null>(null);

  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showPlates, setShowPlates] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Selection state
  const [selectedProps, setSelectedProps] = useState<IFCPropertyData | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const prevSelectedRef = useRef<THREE.Mesh | null>(null);
  const prevColorRef = useRef<number>(0);

  // Refs for display helpers
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);

  // Stable ref for click handler (avoids stale closure in init useEffect)
  const handleCanvasClickFnRef = useRef<(e: MouseEvent) => void>(() => {});
  const handleCanvasClickRef = (e: MouseEvent) => handleCanvasClickFnRef.current(e);

  /**
   * Create a beam mesh from beam element data
   */
  const createBeamMesh = useCallback((
    beam: IBeamElement,
    startNode: INode,
    endNode: INode
  ): THREE.Mesh | null => {
    // Get deformed positions if showing deformed shape
    let startX = startNode.x;
    let startY = startNode.y;
    let endX = endNode.x;
    let endY = endNode.y;

    if (showDeformed && result) {
      const dofPerNode = state.analysisType === 'frame' ? 3 : 2;
      const startIdx = (startNode.id - 1) * dofPerNode;
      const endIdx = (endNode.id - 1) * dofPerNode;

      if (startIdx >= 0 && startIdx + 1 < result.displacements.length) {
        startX += result.displacements[startIdx] * deformationScale;
        startY += result.displacements[startIdx + 1] * deformationScale;
      }
      if (endIdx >= 0 && endIdx + 1 < result.displacements.length) {
        endX += result.displacements[endIdx] * deformationScale;
        endY += result.displacements[endIdx + 1] * deformationScale;
      }
    }

    // Calculate beam length and direction
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy) * SCALE; // Convert to mm

    if (length < 0.001) return null;

    // Create profile shape
    const shape = createProfileShape(beam.section, beam.profileName);

    // Create extruded geometry along the beam length
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: 1,
      depth: length,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Determine color based on profile type
    const profileType = detectProfileType(beam.profileName);
    const profileColors: Record<string, number> = {
      'i-shape': 0x4a90d9,
      'rhs': 0x5cb85c,
      'chs': 0xf0ad4e,
      'channel': 0xd9534f,
      'angle': 0x9b59b6,
      't-shape': 0xe67e22,
      'cold-formed': 0x1abc9c,
      'rectangle': 0x95a5a6,
    };
    const color = profileColors[profileType] || 0x4a90d9;

    // Material
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.6,
      roughness: 0.4,
      wireframe,
      side: THREE.DoubleSide
    });

    const beamMesh = new THREE.Mesh(geometry, material);
    beamMesh.castShadow = true;
    beamMesh.receiveShadow = true;

    // Position and rotate beam using quaternion to avoid gimbal lock
    // Profile is extruded along +Z, we need to rotate it to align with the beam direction
    const beamDir = new THREE.Vector3(dx, dy, 0).normalize();
    const extrudeDir = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(extrudeDir, beamDir);
    beamMesh.quaternion.copy(quaternion);

    // Position at start node (in mm)
    beamMesh.position.set(startX * SCALE, startY * SCALE, 0);

    // Store beam ID in userData for picking
    beamMesh.userData.beamId = beam.id;
    beamMesh.userData.profileName = beam.profileName;

    return beamMesh;
  }, [wireframe, showDeformed, result, deformationScale, state.analysisType]);

  /**
   * Create a node marker sphere
   */
  const createNodeMesh = useCallback((node: INode): THREE.Mesh => {
    // Get deformed position if showing deformed shape
    let x = node.x;
    let y = node.y;

    if (showDeformed && result) {
      const dofPerNode = state.analysisType === 'frame' ? 3 : 2;
      const idx = (node.id - 1) * dofPerNode;

      if (idx >= 0 && idx + 1 < result.displacements.length) {
        x += result.displacements[idx] * deformationScale;
        y += result.displacements[idx + 1] * deformationScale;
      }
    }

    const geometry = new THREE.SphereGeometry(20, 16, 16); // 20mm radius
    const color = node.constraints.x || node.constraints.y ? 0xff6b6b : 0x69db7c;
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.3,
      roughness: 0.7,
      wireframe
    });

    const nodeMesh = new THREE.Mesh(geometry, material);
    nodeMesh.position.set(x * SCALE, y * SCALE, 0);
    nodeMesh.userData.nodeId = node.id;

    return nodeMesh;
  }, [wireframe, showDeformed, result, deformationScale, state.analysisType]);

  /**
   * Create a plate mesh from a plate region (extruded polygon)
   */
  const createPlateMesh = useCallback((plate: IPlateRegion): THREE.Mesh | null => {
    const thicknessMM = plate.thickness * SCALE;
    if (thicknessMM < 0.01) return null;

    let shape: THREE.Shape;

    if (plate.isPolygon && plate.polygon && plate.polygon.length >= 3) {
      // Polygon plate
      shape = new THREE.Shape();
      shape.moveTo(plate.polygon[0].x * SCALE, plate.polygon[0].y * SCALE);
      for (let i = 1; i < plate.polygon.length; i++) {
        shape.lineTo(plate.polygon[i].x * SCALE, plate.polygon[i].y * SCALE);
      }
      shape.closePath();
    } else {
      // Rectangular plate
      const x = plate.x * SCALE;
      const y = plate.y * SCALE;
      const w = plate.width * SCALE;
      const h = plate.height * SCALE;
      shape = new THREE.Shape();
      shape.moveTo(x, y);
      shape.lineTo(x + w, y);
      shape.lineTo(x + w, y + h);
      shape.lineTo(x, y + h);
      shape.closePath();
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: thicknessMM,
      bevelEnabled: false,
    });

    const material = new THREE.MeshStandardMaterial({
      color: 0xb0b0b0,
      metalness: 0.2,
      roughness: 0.8,
      wireframe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });

    const plateMesh = new THREE.Mesh(geometry, material);
    // Offset plate in Z so it is centered around z=0
    plateMesh.position.set(0, 0, -thicknessMM / 2);
    plateMesh.castShadow = true;
    plateMesh.receiveShadow = true;

    plateMesh.userData.plateId = plate.id;
    plateMesh.userData.ifcType = 'IfcWall';
    plateMesh.userData.thickness = plate.thickness;

    return plateMesh;
  }, [wireframe]);

  /**
   * Handle click-selection via raycaster
   */
  const handleCanvasClick = useCallback((event: MouseEvent) => {
    if (!canvasRef.current || !cameraRef.current || !sceneRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // Collect all pickable groups
    const groups: THREE.Object3D[] = [];
    if (beamGroupRef.current) groups.push(beamGroupRef.current);
    if (nodeGroupRef.current) groups.push(nodeGroupRef.current);
    if (plateGroupRef.current) groups.push(plateGroupRef.current);

    const intersects = raycasterRef.current.intersectObjects(
      groups.flatMap(g => g.children),
      false
    );

    // Restore previous selection color
    if (prevSelectedRef.current) {
      const mat = prevSelectedRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0x000000);
      prevSelectedRef.current = null;
    }

    if (intersects.length === 0) {
      setSelectedProps(null);
      return;
    }

    const hit = intersects[0].object as THREE.Mesh;

    // Highlight
    const mat = hit.material as THREE.MeshStandardMaterial;
    prevColorRef.current = mat.color.getHex();
    mat.emissive.setHex(0x333333);
    prevSelectedRef.current = hit;

    // Build IFC property data
    const ud = hit.userData;
    if (ud.beamId !== undefined) {
      const beam = mesh.beamElements.get(ud.beamId);
      const nodes = beam ? mesh.getBeamElementNodes(beam) : null;
      const section = beam?.section;
      const props: IFCPropertyData = {
        ifcType: beam?.elementType === 'column' ? 'IfcColumn' : 'IfcBeam',
        elementId: ud.beamId,
        profileName: ud.profileName || beam?.profileName,
        sectionProps: section ? {
          A: section.A * 1e6,
          Iy: (section.Iy ?? section.I) * 1e12,
          Iz: section.Iz ? section.Iz * 1e12 : undefined,
          Wely: section.Wy ? section.Wy * 1e9 : undefined,
          Welz: section.Wz ? section.Wz * 1e9 : undefined,
        } : undefined,
        geometry: nodes ? {
          length: Math.sqrt((nodes[1].x - nodes[0].x) ** 2 + (nodes[1].y - nodes[0].y) ** 2),
          startCoord: [nodes[0].x, nodes[0].y],
          endCoord: [nodes[1].x, nodes[1].y],
        } : undefined,
      };
      // Add forces if result available
      if (result && beam) {
        const forces = result.beamForces?.get(beam.id);
        if (forces) {
          props.forces = {
            N: forces.N1 / 1000,
            Vy: forces.V1 / 1000,
            Mz: forces.M1 / 1000,
          };
        }
      }
      setSelectedProps(props);
    } else if (ud.nodeId !== undefined) {
      const node = mesh.nodes.get(ud.nodeId);
      const props: IFCPropertyData = {
        ifcType: 'IfcStructuralPointConnection',
        nodeId: ud.nodeId,
        geometry: node ? {
          startCoord: [node.x, node.y],
        } : undefined,
      };
      setSelectedProps(props);
    } else if (ud.plateId !== undefined) {
      const plate = mesh.plateRegions.get(ud.plateId);
      const props: IFCPropertyData = {
        ifcType: 'IfcWall',
        elementId: ud.plateId,
        geometry: plate ? {
          thickness: plate.thickness,
        } : undefined,
      };
      setSelectedProps(props);
    }
  }, [mesh, result]);

  /**
   * Rebuild all meshes from current mesh data
   */
  const rebuildMeshes = useCallback(() => {
    if (!sceneRef.current || !beamGroupRef.current || !nodeGroupRef.current) return;

    const beamGroup = beamGroupRef.current;
    const nodeGroup = nodeGroupRef.current;
    const plateGroup = plateGroupRef.current;

    // Clear existing meshes
    beamMeshesRef.current.forEach(m => {
      beamGroup.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    beamMeshesRef.current.clear();

    nodeMeshesRef.current.forEach(m => {
      nodeGroup.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    nodeMeshesRef.current.clear();

    if (plateGroup) {
      plateMeshesRef.current.forEach(m => {
        plateGroup.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      plateMeshesRef.current.clear();
    }

    // Clear selection
    prevSelectedRef.current = null;
    setSelectedProps(null);

    // Create new beam meshes
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;

      const beamMesh = createBeamMesh(beam, nodes[0], nodes[1]);
      if (beamMesh) {
        beamGroup.add(beamMesh);
        beamMeshesRef.current.set(beam.id, beamMesh);
      }
    }

    // Create node markers
    for (const node of mesh.nodes.values()) {
      const nodeMesh = createNodeMesh(node);
      nodeGroup.add(nodeMesh);
      nodeMeshesRef.current.set(node.id, nodeMesh);
    }

    // Create plate meshes
    if (plateGroup) {
      for (const plate of mesh.plateRegions.values()) {
        const plateMesh = createPlateMesh(plate);
        if (plateMesh) {
          plateGroup.add(plateMesh);
          plateMeshesRef.current.set(plate.id, plateMesh);
        }
      }
    }
  }, [mesh, createBeamMesh, createNodeMesh, createPlateMesh]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      1,
      100000
    );
    camera.position.set(5000, 5000, 5000);
    camera.up.set(0, 1, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 100;
    controls.maxDistance = 50000;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5000, 10000, 5000);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-5000, 5000, -5000);
    scene.add(directionalLight2);

    // Grid helper (in mm, 10m x 10m grid with 1m spacing)
    const gridHelper = new THREE.GridHelper(10000, 10, 0x444444, 0x333333);
    gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane
    scene.add(gridHelper);
    gridRef.current = gridHelper;

    // Axes helper (1m = 1000mm)
    const axesHelper = new THREE.AxesHelper(1000);
    scene.add(axesHelper);
    axesRef.current = axesHelper;

    // Create groups for beams, nodes, and plates
    const beamGroup = new THREE.Group();
    beamGroup.name = 'beams';
    scene.add(beamGroup);
    beamGroupRef.current = beamGroup;

    const nodeGroup = new THREE.Group();
    nodeGroup.name = 'nodes';
    scene.add(nodeGroup);
    nodeGroupRef.current = nodeGroup;

    const plateGroup = new THREE.Group();
    plateGroup.name = 'plates';
    scene.add(plateGroup);
    plateGroupRef.current = plateGroup;

    // Click handler for selection
    canvas.addEventListener('click', handleCanvasClickRef);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('click', handleCanvasClickRef);
      controls.dispose();
      renderer.dispose();

      // Clean up meshes
      beamMeshesRef.current.forEach(m => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      nodeMeshesRef.current.forEach(m => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      plateMeshesRef.current.forEach(m => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    };
  }, []);

  // Keep click handler ref updated
  useEffect(() => {
    handleCanvasClickFnRef.current = handleCanvasClick;
  }, [handleCanvasClick]);

  // Toggle plate group visibility
  useEffect(() => {
    if (plateGroupRef.current) plateGroupRef.current.visible = showPlates;
  }, [showPlates]);

  // Toggle grid/axes visibility
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    if (axesRef.current) axesRef.current.visible = showAxes;
  }, [showAxes]);

  // Rebuild meshes when mesh data changes
  useEffect(() => {
    rebuildMeshes();
  }, [mesh, meshVersion, rebuildMeshes, wireframe, showDeformed, result, deformationScale]);

  // Fit view to model
  const fitView = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3();
    let hasObjects = false;

    // Calculate bounding box from beam, node, and plate groups
    const traverseGroup = (group: THREE.Group | null) => {
      if (!group) return;
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          child.geometry.computeBoundingBox();
          const childBox = child.geometry.boundingBox;
          if (childBox) {
            childBox.applyMatrix4(child.matrixWorld);
            box.union(childBox);
            hasObjects = true;
          }
        }
      });
    };
    traverseGroup(beamGroupRef.current);
    traverseGroup(plateGroupRef.current);

    if (!hasObjects) {
      // Use nodes if no beams
      for (const node of mesh.nodes.values()) {
        box.expandByPoint(new THREE.Vector3(node.x * SCALE, node.y * SCALE, 0));
        hasObjects = true;
      }
    }

    if (!hasObjects) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    cameraRef.current.position.copy(center);
    cameraRef.current.position.x += maxDim * 1.5;
    cameraRef.current.position.y += maxDim * 0.5;
    cameraRef.current.position.z += maxDim * 1.5;
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  }, [mesh]);

  // Reset view
  const resetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(5000, 5000, 5000);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, []);

  // Set view: top
  const setTopView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const target = controlsRef.current.target;
    cameraRef.current.position.set(target.x, target.y + 10000, target.z);
    cameraRef.current.up.set(0, 0, -1);
    controlsRef.current.update();
  }, []);

  // Set view: front
  const setFrontView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const target = controlsRef.current.target;
    cameraRef.current.position.set(target.x, target.y, target.z + 10000);
    cameraRef.current.up.set(0, 1, 0);
    controlsRef.current.update();
  }, []);

  const beamCount = mesh.beamElements.size;
  const nodeCount = mesh.nodes.size;
  const plateCount = mesh.plateRegions.size;

  return (
    <div className="model-viewer-3d" ref={containerRef}>
      <div className="model-viewer-toolbar">
        <div className="model-viewer-toolbar-left">
          <button className="model-viewer-btn" onClick={fitView} title={t('viewer.zoomToFit')}>
            {t('viewer.fit')}
          </button>
          <button className="model-viewer-btn" onClick={resetView} title={t('viewer.resetView')}>
            {t('viewer.reset')}
          </button>
          <button className="model-viewer-btn" onClick={setTopView} title={t('viewer.topView')}>
            {t('viewer.top')}
          </button>
          <button className="model-viewer-btn" onClick={setFrontView} title={t('viewer.frontView')}>
            {t('viewer.front')}
          </button>
          <div className="model-viewer-separator" />
          <button
            className={`model-viewer-btn ${wireframe ? 'active' : ''}`}
            onClick={() => setWireframe(!wireframe)}
            title={t('viewer.toggleWireframe')}
          >
            Wireframe
          </button>
          <button
            className={`model-viewer-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title={t('viewer.displaySettings')}
          >
            Settings
          </button>
        </div>
        <div className="model-viewer-toolbar-right">
          <span className="model-viewer-stats">
            {nodeCount} nodes | {beamCount} beams{plateCount > 0 ? ` | ${plateCount} plates` : ''}
          </span>
          {onClose && (
            <button className="model-viewer-btn close-btn" onClick={onClose}>
              {t('common.close')}
            </button>
          )}
        </div>
      </div>

      <div className="model-viewer-canvas-container">
        <canvas ref={canvasRef} />

        {beamCount === 0 && plateCount === 0 && (
          <div className="model-viewer-empty">
            <div className="model-viewer-empty-content">
              <span className="model-viewer-empty-icon">3D</span>
              <span className="model-viewer-empty-text">
                {t('viewer.noElements')}<br />
                {t('viewer.addElements')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="model-viewer-legend">
        <div className="model-viewer-legend-title">{t('viewer.profileTypes')}</div>
        {[
          ['#4a90d9', t('viewer.iShape')],
          ['#5cb85c', t('viewer.rhs')],
          ['#f0ad4e', t('viewer.chs')],
          ['#d9534f', t('viewer.channel')],
          ['#9b59b6', t('viewer.angle')],
          ['#e67e22', t('viewer.tShape')],
          ['#1abc9c', t('viewer.coldFormed')],
          ['#b0b0b0', t('viewer.plateWall')],
          ['#69db7c', t('viewer.freeNode')],
          ['#ff6b6b', t('viewer.supportedNode')],
        ].map(([color, label]) => (
          <div className="model-viewer-legend-item" key={label}>
            <span className="model-viewer-legend-color" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {showSettings && (
        <div className="model-viewer-settings">
          <div className="model-viewer-settings-title">{t('viewer.displaySettings')}</div>
          <label className="model-viewer-settings-row">
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
            <span>{t('display.grid')}</span>
          </label>
          <label className="model-viewer-settings-row">
            <input type="checkbox" checked={showAxes} onChange={e => setShowAxes(e.target.checked)} />
            <span>{t('visibility.showAxes')}</span>
          </label>
          <label className="model-viewer-settings-row">
            <input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)} />
            <span>{t('ribbon.wireframe')}</span>
          </label>
          <label className="model-viewer-settings-row">
            <input type="checkbox" checked={showPlates} onChange={e => setShowPlates(e.target.checked)} />
            <span>{t('3d.plates')}</span>
          </label>
        </div>
      )}

      {selectedProps && (
        <IFCPropertiesPanel
          data={selectedProps}
          onClose={() => {
            setSelectedProps(null);
            if (prevSelectedRef.current) {
              const mat = prevSelectedRef.current.material as THREE.MeshStandardMaterial;
              mat.emissive.setHex(0x000000);
              prevSelectedRef.current = null;
            }
          }}
        />
      )}

      <div className="model-viewer-nav-hint">
        <b>{t('viewer.rotate')}</b> {t('viewer.leftClick')} &nbsp;|&nbsp;
        <b>{t('viewer.pan')}</b> {t('viewer.rightClick')} &nbsp;|&nbsp;
        <b>{t('viewer.zoom')}</b> {t('viewer.scrollWheel')}
      </div>
    </div>
  );
}
