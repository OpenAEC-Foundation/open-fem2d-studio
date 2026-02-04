export function getStressColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgb(0, 128, 255)';

  const normalized = (value - min) / (max - min);

  // Blue -> Cyan -> Green -> Yellow -> Red
  let r: number, g: number, b: number;

  if (normalized < 0.25) {
    const t = normalized / 0.25;
    r = 0;
    g = Math.round(255 * t);
    b = 255;
  } else if (normalized < 0.5) {
    const t = (normalized - 0.25) / 0.25;
    r = 0;
    g = 255;
    b = Math.round(255 * (1 - t));
  } else if (normalized < 0.75) {
    const t = (normalized - 0.5) / 0.25;
    r = Math.round(255 * t);
    g = 255;
    b = 0;
  } else {
    const t = (normalized - 0.75) / 0.25;
    r = 255;
    g = Math.round(255 * (1 - t));
    b = 0;
  }

  return `rgb(${r}, ${g}, ${b})`;
}

export function generateColorScale(min: number, max: number, steps: number = 10): { value: number; color: string }[] {
  const scale: { value: number; color: string }[] = [];

  for (let i = 0; i <= steps; i++) {
    const value = min + (max - min) * (i / steps);
    const color = getStressColor(value, min, max);
    scale.push({ value, color });
  }

  return scale;
}

export function formatStress(value: number, unit: 'MPa' | 'kPa' | 'Pa' | 'N/mm²' = 'N/mm²'): string {
  // Convert from Pa (internal) to the target unit
  let converted: number;
  let unitStr: string;

  switch (unit) {
    case 'MPa':
      converted = value / 1e6;
      unitStr = 'MPa';
      break;
    case 'kPa':
      converted = value / 1e3;
      unitStr = 'kPa';
      break;
    case 'Pa':
      converted = value;
      unitStr = 'Pa';
      break;
    case 'N/mm²':
    default:
      converted = value / 1e6; // 1 N/mm² = 1 MPa = 1e6 Pa
      unitStr = 'N/mm²';
      break;
  }

  // Format with appropriate precision
  const absVal = Math.abs(converted);
  if (absVal >= 1000) {
    return `${converted.toFixed(1)} ${unitStr}`;
  } else if (absVal >= 100) {
    return `${converted.toFixed(2)} ${unitStr}`;
  } else if (absVal >= 1) {
    return `${converted.toFixed(3)} ${unitStr}`;
  }
  return `${converted.toFixed(4)} ${unitStr}`;
}

export function formatMomentPerLength(value: number, unit: 'kNm/m' | 'Nm/m' = 'kNm/m'): string {
  let converted: number;
  let unitStr: string;

  switch (unit) {
    case 'Nm/m':
      converted = value;
      unitStr = 'Nm/m';
      break;
    case 'kNm/m':
    default:
      converted = value / 1e3;
      unitStr = 'kNm/m';
      break;
  }

  const absVal = Math.abs(converted);
  if (absVal >= 100) return `${converted.toFixed(1)} ${unitStr}`;
  if (absVal >= 1) return `${converted.toFixed(2)} ${unitStr}`;
  return `${converted.toFixed(3)} ${unitStr}`;
}

export function formatForcePerLength(value: number, unit: 'kN/m' | 'N/m' = 'kN/m'): string {
  let converted: number;
  let unitStr: string;

  switch (unit) {
    case 'N/m':
      converted = value;
      unitStr = 'N/m';
      break;
    case 'kN/m':
    default:
      converted = value / 1e3;
      unitStr = 'kN/m';
      break;
  }

  const absVal = Math.abs(converted);
  if (absVal >= 100) return `${converted.toFixed(1)} ${unitStr}`;
  if (absVal >= 1) return `${converted.toFixed(2)} ${unitStr}`;
  return `${converted.toFixed(3)} ${unitStr}`;
}

/** Format a result value using the appropriate unit for the given stress type */
export function formatResultValue(
  value: number,
  stressType: string,
  units?: {
    stress?: 'MPa' | 'kPa' | 'Pa' | 'N/mm²';
    bendingMoment?: 'kNm/m' | 'Nm/m';
    shearForce?: 'kN/m' | 'N/m';
    membraneForce?: 'kN/m' | 'N/m';
  }
): string {
  switch (stressType) {
    case 'mx': case 'my': case 'mxy':
      return formatMomentPerLength(value, units?.bendingMoment);
    case 'vx': case 'vy':
      return formatForcePerLength(value, units?.shearForce);
    case 'nx': case 'ny': case 'nxy':
      return formatForcePerLength(value, units?.membraneForce);
    default:
      return formatStress(value, units?.stress);
  }
}

export function formatDisplacement(value: number): string {
  // Always display in mm for structural engineering convention
  const mm = value * 1e3;
  const absMm = Math.abs(mm);

  if (absMm >= 100) {
    return `${mm.toFixed(1)} mm`;
  } else if (absMm >= 1) {
    return `${mm.toFixed(2)} mm`;
  } else if (absMm >= 0.01) {
    return `${mm.toFixed(3)} mm`;
  }
  return `${mm.toFixed(4)} mm`;
}
