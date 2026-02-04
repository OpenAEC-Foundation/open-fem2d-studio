/**
 * Profile Geometry Generators for 3D Model Viewer
 * Creates Three.js Shape objects for various steel profile types
 */

import * as THREE from 'three';
import { IBeamSection } from '../../core/fem/types';

export type ProfileType = 'i-shape' | 'rhs' | 'chs' | 'channel' | 'rectangle';

/**
 * Detect profile type from profile name string
 */
export function detectProfileType(profileName?: string): ProfileType {
  if (!profileName) return 'rectangle';
  const name = profileName.toUpperCase();

  // I-Shapes: IPE, HEA, HEB, HEM, W sections
  if (name.startsWith('IPE') || name.startsWith('HE') || name.startsWith('W ') || name.includes('WIDE FLANGE')) {
    return 'i-shape';
  }

  // RHS/SHS: Rectangular/Square Hollow Section
  if (name.startsWith('RHS') || name.startsWith('SHS') || name.includes('KOKER') || name.includes('RECT')) {
    return 'rhs';
  }

  // CHS: Circular Hollow Section
  if (name.startsWith('CHS') || name.startsWith('TUBE') || name.includes('BUIS') || name.includes('PIPE')) {
    return 'chs';
  }

  // Channel: UNP, UPE, C-sections
  if (name.startsWith('UNP') || name.startsWith('UPE') || name.startsWith('C ') || name.includes('CHANNEL')) {
    return 'channel';
  }

  // Default to I-shape for profiles with h, b, tw, tf defined
  return 'i-shape';
}

/**
 * Create I-Shape profile (IPE, HEA, HEB, HEM)
 * Cross-section centered at origin
 */
export function createIShapeProfile(section: IBeamSection): THREE.Shape {
  const h = section.h * 1000;      // Convert m to mm for geometry
  const b = (section.b || h * 0.5) * 1000;
  const tw = (section.tw || h * 0.05) * 1000;
  const tf = (section.tf || h * 0.08) * 1000;

  const shape = new THREE.Shape();

  // Draw I-shape outline (centered at 0,0)
  // Start at bottom-left corner of bottom flange
  shape.moveTo(-b / 2, -h / 2);
  shape.lineTo(b / 2, -h / 2);
  shape.lineTo(b / 2, -h / 2 + tf);
  shape.lineTo(tw / 2, -h / 2 + tf);
  shape.lineTo(tw / 2, h / 2 - tf);
  shape.lineTo(b / 2, h / 2 - tf);
  shape.lineTo(b / 2, h / 2);
  shape.lineTo(-b / 2, h / 2);
  shape.lineTo(-b / 2, h / 2 - tf);
  shape.lineTo(-tw / 2, h / 2 - tf);
  shape.lineTo(-tw / 2, -h / 2 + tf);
  shape.lineTo(-b / 2, -h / 2 + tf);
  shape.closePath();

  return shape;
}

/**
 * Create RHS/SHS profile (Rectangular/Square Hollow Section)
 * Hollow rectangular with wall thickness
 */
export function createRHSProfile(section: IBeamSection): THREE.Shape {
  const h = section.h * 1000;
  const b = (section.b || section.h) * 1000;
  const t = (section.tw || section.h * 0.1) * 1000;

  // Outer rectangle
  const outer = new THREE.Shape();
  outer.moveTo(-b / 2, -h / 2);
  outer.lineTo(b / 2, -h / 2);
  outer.lineTo(b / 2, h / 2);
  outer.lineTo(-b / 2, h / 2);
  outer.closePath();

  // Inner hole (counter-clockwise for proper hole)
  const inner = new THREE.Path();
  inner.moveTo(-b / 2 + t, -h / 2 + t);
  inner.lineTo(b / 2 - t, -h / 2 + t);
  inner.lineTo(b / 2 - t, h / 2 - t);
  inner.lineTo(-b / 2 + t, h / 2 - t);
  inner.closePath();
  outer.holes.push(inner);

  return outer;
}

/**
 * Create CHS profile (Circular Hollow Section)
 * Hollow circular with wall thickness
 */
export function createCHSProfile(section: IBeamSection): THREE.Shape {
  const d = section.h * 1000;       // Diameter
  const t = (section.tw || d * 0.1) * 1000;

  // Outer circle
  const outer = new THREE.Shape();
  outer.absarc(0, 0, d / 2, 0, Math.PI * 2, false);

  // Inner hole (clockwise for proper hole)
  const inner = new THREE.Path();
  inner.absarc(0, 0, d / 2 - t, 0, Math.PI * 2, true);
  outer.holes.push(inner);

  return outer;
}

/**
 * Create Channel profile (UNP, UPE)
 * U-shaped cross-section
 */
export function createChannelProfile(section: IBeamSection): THREE.Shape {
  const h = section.h * 1000;
  const b = (section.b || h * 0.4) * 1000;
  const tw = (section.tw || h * 0.05) * 1000;
  const tf = (section.tf || h * 0.08) * 1000;

  const shape = new THREE.Shape();

  // Draw U-shape (opening to the right, centered vertically)
  shape.moveTo(-b / 2, -h / 2);
  shape.lineTo(b / 2, -h / 2);
  shape.lineTo(b / 2, -h / 2 + tf);
  shape.lineTo(-b / 2 + tw, -h / 2 + tf);
  shape.lineTo(-b / 2 + tw, h / 2 - tf);
  shape.lineTo(b / 2, h / 2 - tf);
  shape.lineTo(b / 2, h / 2);
  shape.lineTo(-b / 2, h / 2);
  shape.closePath();

  return shape;
}

/**
 * Create solid rectangle profile
 * Used as fallback for unknown profile types
 */
export function createRectangleProfile(section: IBeamSection): THREE.Shape {
  const h = section.h * 1000;
  const b = (section.b || section.h) * 1000;

  const shape = new THREE.Shape();
  shape.moveTo(-b / 2, -h / 2);
  shape.lineTo(b / 2, -h / 2);
  shape.lineTo(b / 2, h / 2);
  shape.lineTo(-b / 2, h / 2);
  shape.closePath();

  return shape;
}

/**
 * Create profile shape based on detected type
 */
export function createProfileShape(section: IBeamSection, profileName?: string): THREE.Shape {
  const profileType = detectProfileType(profileName);

  switch (profileType) {
    case 'i-shape':
      return createIShapeProfile(section);
    case 'rhs':
      return createRHSProfile(section);
    case 'chs':
      return createCHSProfile(section);
    case 'channel':
      return createChannelProfile(section);
    case 'rectangle':
    default:
      return createRectangleProfile(section);
  }
}
