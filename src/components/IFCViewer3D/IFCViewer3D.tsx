import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as WebIFC from 'web-ifc';
import './IFCViewer3D.css';

interface IFCViewer3DProps {
  onClose?: () => void;
}

interface LoadedModel {
  modelID: number;
  mesh: THREE.Group;
  name: string;
}

export function IFCViewer3D({ onClose }: IFCViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const ifcApiRef = useRef<WebIFC.IfcAPI | null>(null);
  const animationFrameRef = useRef<number>(0);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<LoadedModel[]>([]);
  const [initialized, setInitialized] = useState(false);

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
      0.1,
      10000
    );
    camera.position.set(50, 50, 50);
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
    controls.minDistance = 1;
    controls.maxDistance = 5000;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-50, 50, -50);
    scene.add(directionalLight2);

    // Grid helper
    const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x333333);
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(10);
    scene.add(axesHelper);

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

    // Initialize IFC API
    const initIfcApi = async () => {
      try {
        const ifcApi = new WebIFC.IfcAPI();
        // Set WASM path to public folder
        ifcApi.SetWasmPath('/');
        await ifcApi.Init();
        ifcApiRef.current = ifcApi;
        setInitialized(true);
      } catch (err) {
        console.error('Failed to initialize IFC API:', err);
        setError('Failed to initialize IFC viewer. WASM files may be missing.');
      }
    };
    initIfcApi();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (ifcApiRef.current) {
        models.forEach(m => {
          try {
            ifcApiRef.current?.CloseModel(m.modelID);
          } catch {
            // Ignore close errors
          }
        });
      }
    };
  }, []);

  // Convert IFC geometry to Three.js mesh
  const createMeshFromGeometry = useCallback((
    ifcApi: WebIFC.IfcAPI,
    modelID: number,
    geometry: WebIFC.FlatMesh
  ): THREE.Mesh | null => {
    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < geometry.geometries.size(); i++) {
      const geom = geometry.geometries.get(i);
      const verts = ifcApi.GetVertexArray(geom.geometryExpressID, modelID);
      const idx = ifcApi.GetIndexArray(geom.geometryExpressID, modelID);

      if (!verts || !idx || verts.length === 0) continue;

      const baseIndex = positions.length / 6; // 6 floats per vertex (pos + normal)

      // Add vertices (positions include normals, 6 floats per vertex)
      for (let j = 0; j < verts.length; j++) {
        positions.push(verts[j]);
      }

      // Add indices with offset
      for (let j = 0; j < idx.length; j++) {
        indices.push(idx[j] + baseIndex);
      }
    }

    if (positions.length === 0 || indices.length === 0) return null;

    // Create BufferGeometry
    const bufferGeometry = new THREE.BufferGeometry();

    // Extract positions and normals from interleaved array
    const posArray: number[] = [];
    const normArray: number[] = [];
    for (let i = 0; i < positions.length; i += 6) {
      posArray.push(positions[i], positions[i + 1], positions[i + 2]);
      normArray.push(positions[i + 3], positions[i + 4], positions[i + 5]);
    }

    bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
    bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normArray, 3));
    bufferGeometry.setIndex(indices);

    // Material
    const material = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      side: THREE.DoubleSide,
      flatShading: false
    });

    const mesh = new THREE.Mesh(bufferGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }, []);

  // Load IFC file
  const loadIfcFile = useCallback(async (file: File) => {
    if (!ifcApiRef.current || !sceneRef.current) {
      setError('IFC viewer not initialized');
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setError(null);

    try {
      const ifcApi = ifcApiRef.current;
      const scene = sceneRef.current;

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      setLoadingProgress(20);

      // Open model
      const modelID = ifcApi.OpenModel(data);
      setLoadingProgress(40);

      // Create group for all meshes
      const modelGroup = new THREE.Group();
      modelGroup.name = file.name;

      // Get all flat meshes
      ifcApi.StreamAllMeshes(modelID, (mesh: WebIFC.FlatMesh) => {
        const threeMesh = createMeshFromGeometry(ifcApi, modelID, mesh);
        if (threeMesh) {
          modelGroup.add(threeMesh);
        }
      });

      setLoadingProgress(80);

      // Add to scene
      scene.add(modelGroup);

      // Center camera on model
      const box = new THREE.Box3().setFromObject(modelGroup);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.copy(center);
        cameraRef.current.position.x += maxDim * 1.5;
        cameraRef.current.position.y += maxDim * 0.5;
        cameraRef.current.position.z += maxDim * 1.5;
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }

      // Add to loaded models
      setModels(prev => [...prev, {
        modelID,
        mesh: modelGroup,
        name: file.name
      }]);

      setLoadingProgress(100);
    } catch (err) {
      console.error('Failed to load IFC file:', err);
      setError(`Failed to load IFC file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [createMeshFromGeometry]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const ifcFile = files.find(f => f.name.toLowerCase().endsWith('.ifc'));
    if (ifcFile) {
      loadIfcFile(ifcFile);
    }
  }, [loadIfcFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Handle file input
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      loadIfcFile(files[0]);
    }
  }, [loadIfcFile]);

  // Remove model
  const removeModel = useCallback((modelID: number) => {
    const model = models.find(m => m.modelID === modelID);
    if (model && sceneRef.current && ifcApiRef.current) {
      sceneRef.current.remove(model.mesh);
      model.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      try {
        ifcApiRef.current.CloseModel(modelID);
      } catch {
        // Ignore
      }
      setModels(prev => prev.filter(m => m.modelID !== modelID));
    }
  }, [models]);

  // Fit view to all models
  const fitView = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3();
    let hasObjects = false;

    sceneRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        box.expandByObject(child);
        hasObjects = true;
      }
    });

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
  }, []);

  // Reset view
  const resetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(50, 50, 50);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, []);

  return (
    <div className="ifc-viewer-3d" ref={containerRef}>
      <div className="ifc-viewer-toolbar">
        <div className="ifc-viewer-toolbar-left">
          <label className="ifc-viewer-btn primary">
            <input
              type="file"
              accept=".ifc"
              onChange={handleFileInput}
              style={{ display: 'none' }}
              disabled={!initialized || isLoading}
            />
            Load IFC
          </label>
          <button className="ifc-viewer-btn" onClick={fitView} disabled={models.length === 0}>
            Fit View
          </button>
          <button className="ifc-viewer-btn" onClick={resetView}>
            Reset View
          </button>
        </div>
        <div className="ifc-viewer-toolbar-right">
          {models.length > 0 && (
            <span className="ifc-viewer-model-count">
              {models.length} model{models.length !== 1 ? 's' : ''} loaded
            </span>
          )}
          {onClose && (
            <button className="ifc-viewer-btn close-btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <div
        className="ifc-viewer-canvas-container"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <canvas ref={canvasRef} />

        {!initialized && !error && (
          <div className="ifc-viewer-overlay">
            <div className="ifc-viewer-loading">
              <div className="ifc-viewer-spinner" />
              <span>Initializing IFC viewer...</span>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="ifc-viewer-overlay">
            <div className="ifc-viewer-loading">
              <div className="ifc-viewer-spinner" />
              <span>Loading IFC file... {loadingProgress}%</span>
              <div className="ifc-viewer-progress">
                <div
                  className="ifc-viewer-progress-bar"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="ifc-viewer-overlay error">
            <div className="ifc-viewer-error">
              <span className="ifc-viewer-error-icon">!</span>
              <span>{error}</span>
              <button className="ifc-viewer-btn" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {initialized && !isLoading && models.length === 0 && !error && (
          <div className="ifc-viewer-dropzone">
            <div className="ifc-viewer-dropzone-content">
              <span className="ifc-viewer-dropzone-icon">📁</span>
              <span className="ifc-viewer-dropzone-text">
                Drag & drop an IFC file here<br />
                or click "Load IFC" above
              </span>
            </div>
          </div>
        )}
      </div>

      {models.length > 0 && (
        <div className="ifc-viewer-models-panel">
          <div className="ifc-viewer-models-header">Loaded Models</div>
          <div className="ifc-viewer-models-list">
            {models.map(model => (
              <div key={model.modelID} className="ifc-viewer-model-item">
                <span className="ifc-viewer-model-name" title={model.name}>
                  {model.name}
                </span>
                <button
                  className="ifc-viewer-model-remove"
                  onClick={() => removeModel(model.modelID)}
                  title="Remove model"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
