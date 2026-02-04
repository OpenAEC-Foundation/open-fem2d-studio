/**
 * SVG Preview Component for Steel Profiles
 * Renders parametric profiles with proper fillets and arcs
 */

import { useMemo } from 'react';
import { ProfileGeometry } from '../../core/section/SteelProfiles';

interface ProfileSvgPreviewProps {
  profile: ProfileGeometry;
  width?: number;
  height?: number;
  showDimensions?: boolean;
  showAxes?: boolean;
  showNeutralAxes?: boolean;
  rotation?: number;
  strokeColor?: string;
  fillColor?: string;
}

export function ProfileSvgPreview({
  profile,
  width = 200,
  height = 200,
  showDimensions = false,
  showAxes = true,
  showNeutralAxes = true,
  rotation = 0,
  strokeColor = '#4a90d9',
  fillColor = '#4a90d920'
}: ProfileSvgPreviewProps) {
  const { svgPath, viewBox, scale, bbox } = useMemo(() => {
    const bbox = profile.curve.getBoundingBox();
    const padding = 0.2;

    // Calculate dimensions with padding
    const bboxW = bbox.maxX - bbox.minX;
    const bboxH = bbox.maxY - bbox.minY;
    const paddedW = bboxW * (1 + padding * 2);
    const paddedH = bboxH * (1 + padding * 2);

    // Calculate scale to fit
    const scaleX = width / paddedW;
    const scaleY = height / paddedH;
    const scale = Math.min(scaleX, scaleY);

    // Center the viewbox
    const centerX = (bbox.minX + bbox.maxX) / 2;
    const centerY = (bbox.minY + bbox.maxY) / 2;
    const viewW = width / scale;
    const viewH = height / scale;

    // SVG viewBox (note: Y is flipped in SVG)
    const viewBox = `${centerX - viewW / 2} ${-(centerY + viewH / 2)} ${viewW} ${viewH}`;

    // Generate SVG path from profile curve
    const svgPath = profile.curve.toSvgPath();

    return { svgPath, viewBox, scale, bbox };
  }, [profile, width, height]);

  // Transform path to flip Y axis (SVG y goes down, our geometry y goes up)
  const transformedPath = useMemo(() => {
    // Replace all Y coordinates in the path with negated values
    // This is needed because SVG has Y pointing down, but our geometry has Y pointing up
    let path = svgPath;

    // Handle Move and Line commands: M x y, L x y
    path = path.replace(
      /([ML])\s*([-\d.e]+)\s+([-\d.e]+)/gi,
      (_match, cmd, x, y) => `${cmd} ${x} ${-parseFloat(y)}`
    );

    // Handle Arc commands: A rx ry rotation large-arc sweep x y
    path = path.replace(
      /A\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([\d])\s+([\d])\s+([-\d.e]+)\s+([-\d.e]+)/gi,
      (_match, rx, ry, rot, large, sweep, x, y) =>
        `A ${rx} ${ry} ${rot} ${large} ${1 - parseInt(sweep)} ${x} ${-parseFloat(y)}`
    );

    return path;
  }, [svgPath]);

  // Axis extent
  const axisExtent = Math.max(profile.height, profile.width) * 0.7;

  // Rotation transform
  const rotationTransform = rotation !== 0 ? `rotate(${-rotation})` : '';

  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      className="profile-svg-preview"
      style={{ background: '#1a1a2e' }}
    >
      {/* Definitions */}
      <defs>
        {/* Grid pattern */}
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M 10 0 L 0 0 0 10"
            fill="none"
            stroke="#2a2a4a"
            strokeWidth={0.5 / scale}
          />
        </pattern>

        {/* Arrow marker for axes */}
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#888" />
        </marker>
      </defs>

      {/* Background grid */}
      <rect
        x={bbox.minX - profile.width}
        y={-(bbox.maxY + profile.height)}
        width={profile.width * 3}
        height={profile.height * 3}
        fill="url(#grid)"
      />

      {/* Main content group with rotation */}
      <g transform={rotationTransform}>
        {/* Neutral axes (through centroid at 0,0) */}
        {showNeutralAxes && (
          <g className="neutral-axes">
            {/* Horizontal neutral axis (y-y axis for bending about y) */}
            <line
              x1={-axisExtent * 0.8}
              y1="0"
              x2={axisExtent * 0.8}
              y2="0"
              stroke="#ff6b6b"
              strokeWidth={1.5 / scale}
              strokeDasharray={`${4 / scale} ${2 / scale}`}
            />
            <text
              x={axisExtent * 0.85}
              y={8 / scale}
              fontSize={9 / scale}
              fill="#ff6b6b"
              fontWeight="bold"
            >
              y-y
            </text>

            {/* Vertical neutral axis (z-z axis for bending about z) */}
            <line
              x1="0"
              y1={axisExtent * 0.8}
              x2="0"
              y2={-axisExtent * 0.8}
              stroke="#4ecdc4"
              strokeWidth={1.5 / scale}
              strokeDasharray={`${4 / scale} ${2 / scale}`}
            />
            <text
              x={8 / scale}
              y={-axisExtent * 0.85 + 4 / scale}
              fontSize={9 / scale}
              fill="#4ecdc4"
              fontWeight="bold"
            >
              z-z
            </text>
          </g>
        )}

        {/* Coordinate axes (if not showing neutral axes separately) */}
        {showAxes && !showNeutralAxes && (
          <g className="axes" stroke="#666" strokeWidth={1 / scale}>
            {/* X axis (horizontal, becomes z in structural) */}
            <line x1={-axisExtent} y1="0" x2={axisExtent} y2="0" />
            <polygon
              points={`${axisExtent},0 ${axisExtent - 3 / scale},${-2 / scale} ${axisExtent - 3 / scale},${2 / scale}`}
              fill="#666"
            />
            <text
              x={axisExtent - 8 / scale}
              y={12 / scale}
              fontSize={10 / scale}
              fill="#888"
            >
              z
            </text>

            {/* Y axis (vertical, becomes y in structural) */}
            <line x1="0" y1={axisExtent} x2="0" y2={-axisExtent} />
            <polygon
              points={`0,${-axisExtent} ${-2 / scale},${-axisExtent + 3 / scale} ${2 / scale},${-axisExtent + 3 / scale}`}
              fill="#666"
            />
            <text
              x={8 / scale}
              y={-axisExtent + 12 / scale}
              fontSize={10 / scale}
              fill="#888"
            >
              y
            </text>
          </g>
        )}

        {/* Profile shape */}
        <path
          d={transformedPath}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.5 / scale}
          strokeLinejoin="round"
        />

        {/* Centroid marker */}
        <circle
          cx="0"
          cy="0"
          r={4 / scale}
          fill="none"
          stroke="#ff6b6b"
          strokeWidth={1.5 / scale}
        />
        <line
          x1={-6 / scale}
          y1="0"
          x2={6 / scale}
          y2="0"
          stroke="#ff6b6b"
          strokeWidth={1 / scale}
        />
        <line
          x1="0"
          y1={-6 / scale}
          x2="0"
          y2={6 / scale}
          stroke="#ff6b6b"
          strokeWidth={1 / scale}
        />
      </g>

      {/* Dimensions (outside rotation group) */}
      {showDimensions && (
        <g className="dimensions" fontSize={9 / scale} fill="#aaa">
          {/* Height dimension */}
          <line
            x1={bbox.maxX + 15 / scale}
            y1={-bbox.minY}
            x2={bbox.maxX + 15 / scale}
            y2={-bbox.maxY}
            stroke="#666"
            strokeWidth={0.5 / scale}
          />
          <line
            x1={bbox.maxX + 10 / scale}
            y1={-bbox.minY}
            x2={bbox.maxX + 20 / scale}
            y2={-bbox.minY}
            stroke="#666"
            strokeWidth={0.5 / scale}
          />
          <line
            x1={bbox.maxX + 10 / scale}
            y1={-bbox.maxY}
            x2={bbox.maxX + 20 / scale}
            y2={-bbox.maxY}
            stroke="#666"
            strokeWidth={0.5 / scale}
          />
          <text
            x={bbox.maxX + 22 / scale}
            y={-(bbox.minY + bbox.maxY) / 2 + 3 / scale}
            textAnchor="start"
          >
            h={profile.height.toFixed(0)}
          </text>

          {/* Width dimension */}
          <line
            x1={bbox.minX}
            y1={-bbox.minY + 15 / scale}
            x2={bbox.maxX}
            y2={-bbox.minY + 15 / scale}
            stroke="#666"
            strokeWidth={0.5 / scale}
          />
          <line
            x1={bbox.minX}
            y1={-bbox.minY + 10 / scale}
            x2={bbox.minX}
            y2={-bbox.minY + 20 / scale}
            stroke="#666"
            strokeWidth={0.5 / scale}
          />
          <line
            x1={bbox.maxX}
            y1={-bbox.minY + 10 / scale}
            x2={bbox.maxX}
            y2={-bbox.minY + 20 / scale}
            stroke="#666"
            strokeWidth={0.5 / scale}
          />
          <text
            x={(bbox.minX + bbox.maxX) / 2}
            y={-bbox.minY + 28 / scale}
            textAnchor="middle"
          >
            b={profile.width.toFixed(0)}
          </text>
        </g>
      )}

      {/* Rotation indicator */}
      {rotation !== 0 && (
        <text
          x={-width / scale / 2 + 10 / scale}
          y={-height / scale / 2 + 15 / scale}
          fontSize={9 / scale}
          fill="#888"
        >
          {rotation}°
        </text>
      )}
    </svg>
  );
}
