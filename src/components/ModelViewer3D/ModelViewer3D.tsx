/**
 * ModelViewer3D - 3D visualization of the structural model
 * Renders beam elements with parametric steel profile geometry
 * Directly binds to FEM mesh data via useFEM() hook
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useFEM } from '../../context/FEMContext';
import { IBeamElement, INode } from '../../core/fem/types';
import { createProfileShape, detectProfileType } from './ProfileGeometry';
import './ModelViewer3D.css';

// Scale factor: model is in meters, we display in mm for better Three.js precision
const SCALE = 1000;

interface ModelViewer3DProps {
  onClose?: () => void;
}

export function ModelViewer3D({ onClose }: ModelViewer3DProps) {
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
  const beamGroupRef = useRef<THREE.Group | null>(null);
  const nodeGroupRef = useRef<THREE.Group | null>(null);

  const [wireframe, setWireframe] = useState(false);

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
    let color = 0x4a90d9; // Default blue for I-shapes
    if (profileType === 'rhs') color = 0x5cb85c;
    if (profileType === 'chs') color = 0xf0ad4e;
    if (profileType === 'channel') color = 0xd9534f;

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

    // Position and rotate beam
    // Profile is extruded along Z, so we need to:
    // 1. Rotate to align with beam direction in XY plane
    // 2. Position at start node

    const angle = Math.atan2(dy, dx);

    // Transform: rotate profile from XY plane to align with beam axis
    // The extrusion goes along +Z, so rotate around Y by -90 deg to make it go along +X
    // Then rotate around Z by the beam angle
    beamMesh.rotation.set(0, -Math.PI / 2, angle);

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
   * Rebuild all meshes from current mesh data
   */
  const rebuildMeshes = useCallback(() => {
    if (!sceneRef.current || !beamGroupRef.current || !nodeGroupRef.current) return;

    const beamGroup = beamGroupRef.current;
    const nodeGroup = nodeGroupRef.current;

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
  }, [mesh, createBeamMesh, createNodeMesh]);

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

    // Axes helper (1m = 1000mm)
    const axesHelper = new THREE.AxesHelper(1000);
    scene.add(axesHelper);

    // Create groups for beams and nodes
    const beamGroup = new THREE.Group();
    beamGroup.name = 'beams';
    scene.add(beamGroup);
    beamGroupRef.current = beamGroup;

    const nodeGroup = new THREE.Group();
    nodeGroup.name = 'nodes';
    scene.add(nodeGroup);
    nodeGroupRef.current = nodeGroup;

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
    };
  }, []);

  // Rebuild meshes when mesh data changes
  useEffect(() => {
    rebuildMeshes();
  }, [mesh, meshVersion, rebuildMeshes, wireframe, showDeformed, result, deformationScale]);

  // Fit view to model
  const fitView = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3();
    let hasObjects = false;

    // Calculate bounding box from beam and node groups
    if (beamGroupRef.current) {
      beamGroupRef.current.traverse((child) => {
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
    }

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

  return (
    <div className="model-viewer-3d" ref={containerRef}>
      <div className="model-viewer-toolbar">
        <div className="model-viewer-toolbar-left">
          <button className="model-viewer-btn" onClick={fitView} title="Zoom to Fit">
            Fit
          </button>
          <button className="model-viewer-btn" onClick={resetView} title="Reset View">
            Reset
          </button>
          <button className="model-viewer-btn" onClick={setTopView} title="Top View">
            Top
          </button>
          <button className="model-viewer-btn" onClick={setFrontView} title="Front View">
            Front
          </button>
          <div className="model-viewer-separator" />
          <button
            className={`model-viewer-btn ${wireframe ? 'active' : ''}`}
            onClick={() => setWireframe(!wireframe)}
            title="Toggle Wireframe"
          >
            Wireframe
          </button>
        </div>
        <div className="model-viewer-toolbar-right">
          <span className="model-viewer-stats">
            {nodeCount} nodes | {beamCount} beams
          </span>
          {onClose && (
            <button className="model-viewer-btn close-btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="model-viewer-canvas-container">
        <canvas ref={canvasRef} />

        {beamCount === 0 && (
          <div className="model-viewer-empty">
            <div className="model-viewer-empty-content">
              <span className="model-viewer-empty-icon">3D</span>
              <span className="model-viewer-empty-text">
                No beam elements in the model.<br />
                Add beams in the 2D editor to see them here.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="model-viewer-legend">
        <div className="model-viewer-legend-title">Profile Types</div>
        <div className="model-viewer-legend-item">
          <span className="model-viewer-legend-color" style={{ background: '#4a90d9' }} />
          <span>I-Shape (IPE, HE)</span>
        </div>
        <div className="model-viewer-legend-item">
          <span className="model-viewer-legend-color" style={{ background: '#5cb85c' }} />
          <span>RHS/SHS</span>
        </div>
        <div className="model-viewer-legend-item">
          <span className="model-viewer-legend-color" style={{ background: '#f0ad4e' }} />
          <span>CHS (Tube)</span>
        </div>
        <div className="model-viewer-legend-item">
          <span className="model-viewer-legend-color" style={{ background: '#d9534f' }} />
          <span>Channel (UNP)</span>
        </div>
        <div className="model-viewer-legend-item">
          <span className="model-viewer-legend-color" style={{ background: '#69db7c' }} />
          <span>Free node</span>
        </div>
        <div className="model-viewer-legend-item">
          <span className="model-viewer-legend-color" style={{ background: '#ff6b6b' }} />
          <span>Supported node</span>
        </div>
      </div>

      <div className="model-viewer-nav-hint">
        <b>Rotate:</b> Left-click drag &nbsp;|&nbsp;
        <b>Pan:</b> Right-click drag &nbsp;|&nbsp;
        <b>Zoom:</b> Scroll wheel
      </div>
    </div>
  );
}
