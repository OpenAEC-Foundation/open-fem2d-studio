/**
 * DrawingView - Construction drawing canvas for steel, concrete, and timber structures
 * Shows beams with actual profile shapes, grid lines, dimensions, and annotations
 * No loads, supports, or force diagrams - this is a fabrication/construction drawing
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useFEM } from '../../context/FEMContext';
import { SteelProfileLibrary } from '../../core/section/SteelProfileLibrary';
import { calculateBeamAngle } from '../../core/fem/Beam';
import './DrawingView.css';

interface DrawingSettings {
  showSteel: boolean;
  showConcrete: boolean;
  showTimber: boolean;
  showGridLines: boolean;
  showDimensions: boolean;
  showCenterlines: boolean;
  showProfileNames: boolean;
  scale: number; // Drawing scale factor (e.g., 1:50 = 0.02)
}

export function DrawingView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state } = useFEM();
  const { mesh, structuralGrid } = state;

  const [viewState, setViewState] = useState({
    offsetX: 100,
    offsetY: 100,
    scale: 100 // pixels per meter
  });

  const [settings] = useState<DrawingSettings>({
    showSteel: true,
    showConcrete: true,
    showTimber: true,
    showGridLines: true,
    showDimensions: true,
    showCenterlines: true,
    showProfileNames: true,
    scale: 100
  });

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Convert world coordinates to screen
  const worldToScreen = useCallback((wx: number, wy: number) => {
    return {
      x: wx * viewState.scale + viewState.offsetX,
      y: -wy * viewState.scale + viewState.offsetY // Y inverted for screen
    };
  }, [viewState]);

  // Get profile dimensions from SteelProfileLibrary
  const getProfileDimensions = useCallback((profileName: string): { h: number; b: number; tw: number; tf: number } | null => {
    const profile = SteelProfileLibrary.findProfile(profileName);
    if (!profile || !profile.data) return null;

    const coords = profile.data.shape_coords;
    const shapeName = profile.data.shape_name;

    // Extract dimensions based on shape type
    if ((shapeName.includes('I-shape') || shapeName.includes('parallel') || shapeName.includes('sloped')) && coords.length >= 5) {
      return { h: coords[0], b: coords[1], tw: coords[2], tf: coords[3] };
    } else if (shapeName.includes('Rectangle Hollow') && coords.length >= 5) {
      return { h: coords[0], b: coords[1], tw: coords[2], tf: coords[2] };
    } else if (shapeName.includes('Round Tube') && coords.length >= 2) {
      const d = coords[0];
      return { h: d, b: d, tw: coords[1], tf: coords[1] };
    } else if (shapeName.includes('L-Angle') && coords.length >= 8) {
      return { h: coords[0], b: coords[1], tw: coords[2], tf: coords[3] };
    } else if (shapeName.includes('Channel') && coords.length >= 5) {
      return { h: coords[0], b: coords[1], tw: coords[2], tf: coords[3] };
    }

    // Default fallback
    return { h: 200, b: 100, tw: 6, tf: 10 };
  }, []);

  // Get beams connected to a node
  const getConnectedBeams = useCallback((nodeId: number) => {
    const connected: Array<{ beam: any; isStart: boolean; angle: number }> = [];
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;
      if (n1.id === nodeId) {
        connected.push({ beam, isStart: true, angle: calculateBeamAngle(n1, n2) });
      } else if (n2.id === nodeId) {
        connected.push({ beam, isStart: false, angle: calculateBeamAngle(n1, n2) });
      }
    }
    return connected;
  }, [mesh]);

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = canvas;

    // Clear with white background (drawing paper)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines (stramienen)
    if (settings.showGridLines && structuralGrid.showGridLines) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 5]);

      // Vertical grid lines
      for (const line of structuralGrid.verticalLines) {
        const s = worldToScreen(line.position, 0);
        ctx.beginPath();
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, height);
        ctx.stroke();

        // Label
        ctx.setLineDash([]);
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(line.name, s.x, 20);
        ctx.setLineDash([10, 5]);
      }

      // Horizontal grid lines
      for (const line of structuralGrid.horizontalLines) {
        const s = worldToScreen(0, line.position);
        ctx.beginPath();
        ctx.moveTo(0, s.y);
        ctx.lineTo(width, s.y);
        ctx.stroke();

        // Label
        ctx.setLineDash([]);
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(line.name, 5, s.y - 5);
        ctx.setLineDash([10, 5]);
      }

      ctx.setLineDash([]);
    }

    // Draw centerlines (hart-lijnen) - extended beyond beam endpoints
    if (settings.showCenterlines) {
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([15, 5, 3, 5]); // Dash-dot pattern

      for (const beam of mesh.beamElements.values()) {
        const nodes = mesh.getBeamElementNodes(beam);
        if (!nodes) continue;
        const [n1, n2] = nodes;
        const s1 = worldToScreen(n1.x, n1.y);
        const s2 = worldToScreen(n2.x, n2.y);

        // Extend centerline 30px beyond each endpoint
        const dx = s2.x - s1.x;
        const dy = s2.y - s1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const extend = 30;
        const ex = (dx / len) * extend;
        const ey = (dy / len) * extend;

        ctx.beginPath();
        ctx.moveTo(s1.x - ex, s1.y - ey);
        ctx.lineTo(s2.x + ex, s2.y + ey);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }

    // Draw steel beams with profile shapes and proper connections
    if (settings.showSteel) {
      // First pass: collect beam info for connection calculations
      const beamInfos: Array<{
        beam: any;
        n1: any;
        n2: any;
        s1: { x: number; y: number };
        s2: { x: number; y: number };
        angle: number;
        hScreen: number;
        tfScreen: number;
        profileName: string;
      }> = [];

      for (const beam of mesh.beamElements.values()) {
        const nodes = mesh.getBeamElementNodes(beam);
        if (!nodes) continue;
        const [n1, n2] = nodes;
        const profileName = beam.profileName || 'IPE 200';
        const dims = getProfileDimensions(profileName);
        if (!dims) continue;

        beamInfos.push({
          beam,
          n1,
          n2,
          s1: worldToScreen(n1.x, n1.y),
          s2: worldToScreen(n2.x, n2.y),
          angle: calculateBeamAngle(n1, n2),
          hScreen: (dims.h / 1000) * viewState.scale,
          tfScreen: (dims.tf / 1000) * viewState.scale,
          profileName
        });
      }

      // Second pass: draw beams with proper extensions at connections
      for (const info of beamInfos) {
        const { n1, n2, s1, s2, angle, hScreen, tfScreen, profileName } = info;

        // Check connections at each end
        const startConnections = getConnectedBeams(n1.id);
        const endConnections = getConnectedBeams(n2.id);

        // Calculate extension at start (to fill gap at angled connections)
        let startExtend = 0;
        if (startConnections.length > 1) {
          // Find the other beam at this node
          for (const conn of startConnections) {
            if (conn.beam.id !== info.beam.id) {
              const angleDiff = Math.abs(conn.angle - angle);
              // Extend by half the profile height for perpendicular connections
              if (angleDiff > 0.1 && angleDiff < Math.PI - 0.1) {
                startExtend = (hScreen / 2) / Math.abs(Math.tan(angleDiff / 2));
                startExtend = Math.min(startExtend, hScreen); // Limit extension
              }
            }
          }
        }

        // Calculate extension at end
        let endExtend = 0;
        if (endConnections.length > 1) {
          for (const conn of endConnections) {
            if (conn.beam.id !== info.beam.id) {
              const angleDiff = Math.abs(conn.angle - angle);
              if (angleDiff > 0.1 && angleDiff < Math.PI - 0.1) {
                endExtend = (hScreen / 2) / Math.abs(Math.tan(angleDiff / 2));
                endExtend = Math.min(endExtend, hScreen);
              }
            }
          }
        }

        ctx.save();
        ctx.translate(s1.x, s1.y);
        ctx.rotate(-angle);

        const beamLen = Math.sqrt((s2.x - s1.x) ** 2 + (s2.y - s1.y) ** 2);
        const drawStart = -startExtend;
        const drawEnd = beamLen + endExtend;
        const drawLen = drawEnd - drawStart;

        // Draw beam outline
        ctx.strokeStyle = '#1e3a5f';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = '#f1f5f9';

        // For I-profile, show side view (web + flanges)
        if (profileName.startsWith('IPE') || profileName.startsWith('HE') || profileName.startsWith('UNP')) {
          // Web (center rectangle)
          ctx.fillRect(drawStart, -hScreen / 2 + tfScreen, drawLen, hScreen - 2 * tfScreen);
          ctx.strokeRect(drawStart, -hScreen / 2 + tfScreen, drawLen, hScreen - 2 * tfScreen);

          // Top flange
          ctx.fillRect(drawStart, -hScreen / 2, drawLen, tfScreen);
          ctx.strokeRect(drawStart, -hScreen / 2, drawLen, tfScreen);

          // Bottom flange
          ctx.fillRect(drawStart, hScreen / 2 - tfScreen, drawLen, tfScreen);
          ctx.strokeRect(drawStart, hScreen / 2 - tfScreen, drawLen, tfScreen);
        } else {
          // Simple rectangle for other profiles
          ctx.fillRect(drawStart, -hScreen / 2, drawLen, hScreen);
          ctx.strokeRect(drawStart, -hScreen / 2, drawLen, hScreen);
        }

        // Draw endplates (kopplaten) at free ends
        const endplateThickness = 4;
        const endplateExtend = 3;
        ctx.fillStyle = '#1e3a5f';

        // Endplate at start if only 1 connection (free end)
        if (startConnections.length === 1) {
          ctx.fillRect(drawStart - endplateThickness, -hScreen / 2 - endplateExtend, endplateThickness, hScreen + 2 * endplateExtend);
        }

        // Endplate at end if only 1 connection (free end)
        if (endConnections.length === 1) {
          ctx.fillRect(drawEnd, -hScreen / 2 - endplateExtend, endplateThickness, hScreen + 2 * endplateExtend);
        }

        // Profile name annotation
        if (settings.showProfileNames) {
          ctx.fillStyle = '#374151';
          ctx.font = '11px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(profileName, beamLen / 2, -hScreen / 2 - 8);
        }

        ctx.restore();
      }
    }

    // Draw dimensions
    if (settings.showDimensions) {
      ctx.strokeStyle = '#1e3a5f';
      ctx.fillStyle = '#1e3a5f';
      ctx.lineWidth = 0.75;
      ctx.font = '10px Arial';

      for (const beam of mesh.beamElements.values()) {
        const nodes = mesh.getBeamElementNodes(beam);
        if (!nodes) continue;
        const [n1, n2] = nodes;

        const s1 = worldToScreen(n1.x, n1.y);
        const s2 = worldToScreen(n2.x, n2.y);
        const angle = calculateBeamAngle(n1, n2);

        // Get profile height for dimension offset
        const profileName = beam.profileName || 'IPE 200';
        const dims = getProfileDimensions(profileName);
        const hScreen = dims ? (dims.h / 1000) * viewState.scale : 20;

        // Length dimension below beam
        const midX = (s1.x + s2.x) / 2;
        const midY = (s1.y + s2.y) / 2;
        const perpOffset = hScreen / 2 + 25;
        const perpAngle = angle - Math.PI / 2;

        const dimY = midY + perpOffset * Math.sin(-perpAngle);
        const dimX = midX + perpOffset * Math.cos(-perpAngle);

        const beamLen = Math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2);
        const lenText = `${(beamLen * 1000).toFixed(0)}`;

        ctx.save();
        ctx.translate(dimX, dimY);
        ctx.rotate(-angle);
        ctx.textAlign = 'center';
        ctx.fillText(lenText, 0, 4);

        // Dimension line
        const halfLen = Math.sqrt((s2.x - s1.x) ** 2 + (s2.y - s1.y) ** 2) / 2;
        ctx.beginPath();
        ctx.moveTo(-halfLen, 0);
        ctx.lineTo(-20, 0);
        ctx.moveTo(20, 0);
        ctx.lineTo(halfLen, 0);
        ctx.stroke();

        // Tick marks
        ctx.beginPath();
        ctx.moveTo(-halfLen, -5);
        ctx.lineTo(-halfLen, 5);
        ctx.moveTo(halfLen, -5);
        ctx.lineTo(halfLen, 5);
        ctx.stroke();

        ctx.restore();
      }
    }

    // Draw scale indicator
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Scale: 1:${Math.round(1000 / viewState.scale)}`, 10, height - 10);

  }, [mesh, viewState, settings, worldToScreen, structuralGrid, getProfileDimensions, getConnectedBeams]);

  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width;
        canvas.height = height;
        draw();
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [draw]);

  // Redraw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;

    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;

    setViewState(prev => ({
      ...prev,
      offsetX: prev.offsetX + dx,
      offsetY: prev.offsetY + dy
    }));

    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(10, Math.min(500, viewState.scale * zoomFactor));

    // Zoom towards mouse position
    const worldX = (mouseX - viewState.offsetX) / viewState.scale;
    const worldY = (mouseY - viewState.offsetY) / viewState.scale;

    setViewState({
      scale: newScale,
      offsetX: mouseX - worldX * newScale,
      offsetY: mouseY - worldY * newScale
    });
  };

  return (
    <div className="drawing-view" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      />
      <div className="drawing-legend">
        <span>Construction Drawing</span>
        <span className="separator">|</span>
        <span>Scroll to zoom</span>
        <span className="separator">|</span>
        <span>Drag to pan</span>
      </div>
    </div>
  );
}
