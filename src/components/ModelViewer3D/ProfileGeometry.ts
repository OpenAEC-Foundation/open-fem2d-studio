/**
 * Profile Geometry Generators for 3D Model Viewer
 * Creates Three.js Shape objects for various steel profile types
 * Supports fillet radii by looking up profile data from SteelProfileLibrary
 */

import * as THREE from 'three';
import { IBeamSection } from '../../core/fem/types';
import { SteelProfileLibrary } from '../../core/section/SteelProfileLibrary';

export type ProfileType = 'i-shape' | 'rhs' | 'chs' | 'channel' | 'angle' | 't-shape' | 'cold-formed' | 'rectangle';

/**
 * Detect profile type from profile name string
 */
export function detectProfileType(profileName?: string): ProfileType {
  if (!profileName) return 'rectangle';
  const n = profileName.toUpperCase();

  if (n.startsWith('IPE') || n.startsWith('HE') || n.startsWith('W ') || n.includes('WIDE FLANGE')) return 'i-shape';
  if (n.startsWith('RHS') || n.startsWith('SHS') || n.includes('KOKER') || n.includes('RECT')) return 'rhs';
  if (n.startsWith('CHS') || n.startsWith('TUBE') || n.includes('BUIS') || n.includes('PIPE')) return 'chs';
  if (n.startsWith('UNP') || n.startsWith('UPE')) return 'channel';
  if (n.startsWith('L') && /\d/.test(n.charAt(1))) return 'angle';
  if (n.startsWith('T') && /\d/.test(n.charAt(1))) return 't-shape';
  if (n.startsWith('CW') || n.startsWith('SIGMA') || n.startsWith('ZW')) return 'cold-formed';

  return 'i-shape';
}

// ── I-Shape with fillet radii ──────────────────────────────────────

function makeIShape(h: number, b: number, tw: number, tf: number, r: number): THREE.Shape {
  r = Math.min(r, (b - tw) / 2, (h - 2 * tf) / 2);
  if (r < 0.1) r = 0;

  const shape = new THREE.Shape();

  if (r === 0) {
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
  } else {
    shape.moveTo(-b / 2, -h / 2);
    shape.lineTo(b / 2, -h / 2);
    shape.lineTo(b / 2, -h / 2 + tf);
    shape.lineTo(tw / 2 + r, -h / 2 + tf);
    // Fillet bottom-right (LEFT→UP, right turn, clockwise)
    shape.absarc(tw / 2 + r, -h / 2 + tf + r, r, -Math.PI / 2, Math.PI, true);
    shape.lineTo(tw / 2, h / 2 - tf - r);
    // Fillet top-right (UP→RIGHT, right turn, clockwise)
    shape.absarc(tw / 2 + r, h / 2 - tf - r, r, Math.PI, Math.PI / 2, true);
    shape.lineTo(b / 2, h / 2 - tf);
    shape.lineTo(b / 2, h / 2);
    shape.lineTo(-b / 2, h / 2);
    shape.lineTo(-b / 2, h / 2 - tf);
    shape.lineTo(-tw / 2 - r, h / 2 - tf);
    // Fillet top-left (RIGHT→DOWN, right turn, clockwise)
    shape.absarc(-tw / 2 - r, h / 2 - tf - r, r, Math.PI / 2, 0, true);
    shape.lineTo(-tw / 2, -h / 2 + tf + r);
    // Fillet bottom-left (DOWN→LEFT, right turn, clockwise)
    shape.absarc(-tw / 2 - r, -h / 2 + tf + r, r, 0, -Math.PI / 2, true);
    shape.lineTo(-b / 2, -h / 2 + tf);
    shape.closePath();
  }

  return shape;
}

// ── RHS/SHS with rounded corners ───────────────────────────────────

function makeRHS(h: number, b: number, t: number, rOuter: number, rInner: number): THREE.Shape {
  rOuter = Math.min(rOuter, h / 2, b / 2);
  rInner = Math.min(rInner, (h - 2 * t) / 2, (b - 2 * t) / 2);
  if (rOuter < 0.1) rOuter = 0;
  if (rInner < 0.1) rInner = 0;

  const outer = new THREE.Shape();

  if (rOuter === 0) {
    outer.moveTo(-b / 2, -h / 2);
    outer.lineTo(b / 2, -h / 2);
    outer.lineTo(b / 2, h / 2);
    outer.lineTo(-b / 2, h / 2);
    outer.closePath();
  } else {
    outer.moveTo(-b / 2 + rOuter, -h / 2);
    outer.lineTo(b / 2 - rOuter, -h / 2);
    outer.absarc(b / 2 - rOuter, -h / 2 + rOuter, rOuter, -Math.PI / 2, 0, false);
    outer.lineTo(b / 2, h / 2 - rOuter);
    outer.absarc(b / 2 - rOuter, h / 2 - rOuter, rOuter, 0, Math.PI / 2, false);
    outer.lineTo(-b / 2 + rOuter, h / 2);
    outer.absarc(-b / 2 + rOuter, h / 2 - rOuter, rOuter, Math.PI / 2, Math.PI, false);
    outer.lineTo(-b / 2, -h / 2 + rOuter);
    outer.absarc(-b / 2 + rOuter, -h / 2 + rOuter, rOuter, Math.PI, 3 * Math.PI / 2, false);
  }

  // Inner hole
  const iw = b - 2 * t;
  const ih = h - 2 * t;
  const inner = new THREE.Path();

  if (rInner === 0) {
    inner.moveTo(-iw / 2, -ih / 2);
    inner.lineTo(iw / 2, -ih / 2);
    inner.lineTo(iw / 2, ih / 2);
    inner.lineTo(-iw / 2, ih / 2);
    inner.closePath();
  } else {
    inner.moveTo(-iw / 2 + rInner, -ih / 2);
    inner.lineTo(iw / 2 - rInner, -ih / 2);
    inner.absarc(iw / 2 - rInner, -ih / 2 + rInner, rInner, -Math.PI / 2, 0, false);
    inner.lineTo(iw / 2, ih / 2 - rInner);
    inner.absarc(iw / 2 - rInner, ih / 2 - rInner, rInner, 0, Math.PI / 2, false);
    inner.lineTo(-iw / 2 + rInner, ih / 2);
    inner.absarc(-iw / 2 + rInner, ih / 2 - rInner, rInner, Math.PI / 2, Math.PI, false);
    inner.lineTo(-iw / 2, -ih / 2 + rInner);
    inner.absarc(-iw / 2 + rInner, -ih / 2 + rInner, rInner, Math.PI, 3 * Math.PI / 2, false);
  }

  outer.holes.push(inner);
  return outer;
}

// ── CHS (Circular Hollow Section) ──────────────────────────────────

function makeCHS(d: number, t: number): THREE.Shape {
  const outer = new THREE.Shape();
  outer.absarc(0, 0, d / 2, 0, Math.PI * 2, false);

  const inner = new THREE.Path();
  inner.absarc(0, 0, d / 2 - t, 0, Math.PI * 2, true);
  outer.holes.push(inner);

  return outer;
}

// ── Channel (UNP, UPE) with fillet radii ───────────────────────────

function makeChannel(h: number, b: number, tw: number, tf: number, r: number): THREE.Shape {
  r = Math.min(r, (b - tw), (h - 2 * tf) / 2);
  if (r < 0.1) r = 0;

  const shape = new THREE.Shape();

  if (r === 0) {
    shape.moveTo(-b / 2, -h / 2);
    shape.lineTo(b / 2, -h / 2);
    shape.lineTo(b / 2, -h / 2 + tf);
    shape.lineTo(-b / 2 + tw, -h / 2 + tf);
    shape.lineTo(-b / 2 + tw, h / 2 - tf);
    shape.lineTo(b / 2, h / 2 - tf);
    shape.lineTo(b / 2, h / 2);
    shape.lineTo(-b / 2, h / 2);
    shape.closePath();
  } else {
    shape.moveTo(-b / 2, -h / 2);
    shape.lineTo(b / 2, -h / 2);
    shape.lineTo(b / 2, -h / 2 + tf);
    shape.lineTo(-b / 2 + tw + r, -h / 2 + tf);
    // Fillet bottom inner (LEFT→UP, right turn, clockwise)
    shape.absarc(-b / 2 + tw + r, -h / 2 + tf + r, r, -Math.PI / 2, Math.PI, true);
    shape.lineTo(-b / 2 + tw, h / 2 - tf - r);
    // Fillet top inner (UP→RIGHT, right turn, clockwise)
    shape.absarc(-b / 2 + tw + r, h / 2 - tf - r, r, Math.PI, Math.PI / 2, true);
    shape.lineTo(b / 2, h / 2 - tf);
    shape.lineTo(b / 2, h / 2);
    shape.lineTo(-b / 2, h / 2);
    shape.closePath();
  }

  return shape;
}

// ── L-Angle with root fillet ───────────────────────────────────────

function makeAngle(h: number, b: number, tw: number, tf: number, r1: number, ex: number, ey: number): THREE.Shape {
  r1 = Math.min(r1, Math.min(b - tw, h - tf));
  if (r1 < 0.1) r1 = 0;

  const shape = new THREE.Shape();

  if (r1 === 0) {
    shape.moveTo(-ex, -ey);
    shape.lineTo(b - ex, -ey);
    shape.lineTo(b - ex, tf - ey);
    shape.lineTo(tw - ex, tf - ey);
    shape.lineTo(tw - ex, h - ey);
    shape.lineTo(-ex, h - ey);
    shape.closePath();
  } else {
    shape.moveTo(-ex, -ey);
    shape.lineTo(b - ex, -ey);
    shape.lineTo(b - ex, tf - ey);
    shape.lineTo(tw - ex + r1, tf - ey);
    // Root fillet (LEFT→UP, right turn, clockwise)
    shape.absarc(tw - ex + r1, tf - ey + r1, r1, -Math.PI / 2, Math.PI, true);
    shape.lineTo(tw - ex, h - ey);
    shape.lineTo(-ex, h - ey);
    shape.closePath();
  }

  return shape;
}

// ── T-Shape with fillet radii ──────────────────────────────────────

function makeTShape(h: number, b: number, tw: number, tf: number, r: number): THREE.Shape {
  r = Math.min(r, (b - tw) / 2, h - tf);
  if (r < 0.1) r = 0;

  const shape = new THREE.Shape();

  if (r === 0) {
    shape.moveTo(-b / 2, h / 2);
    shape.lineTo(b / 2, h / 2);
    shape.lineTo(b / 2, h / 2 - tf);
    shape.lineTo(tw / 2, h / 2 - tf);
    shape.lineTo(tw / 2, -h / 2);
    shape.lineTo(-tw / 2, -h / 2);
    shape.lineTo(-tw / 2, h / 2 - tf);
    shape.lineTo(-b / 2, h / 2 - tf);
    shape.closePath();
  } else {
    shape.moveTo(-b / 2, h / 2);
    shape.lineTo(b / 2, h / 2);
    shape.lineTo(b / 2, h / 2 - tf);
    shape.lineTo(tw / 2 + r, h / 2 - tf);
    // Right fillet (LEFT→DOWN, left turn, counterclockwise)
    shape.absarc(tw / 2 + r, h / 2 - tf - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(tw / 2, -h / 2);
    shape.lineTo(-tw / 2, -h / 2);
    shape.lineTo(-tw / 2, h / 2 - tf - r);
    // Left fillet (UP→LEFT, left turn, counterclockwise)
    shape.absarc(-tw / 2 - r, h / 2 - tf - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-b / 2, h / 2 - tf);
    shape.closePath();
  }

  return shape;
}

// ── Cold-formed C-profile with lips ────────────────────────────────

function makeColdFormedC(h: number, b: number, lip: number, t: number, ex: number): THREE.Shape {
  // Simplified cold-formed C as a closed thin-walled shape
  // Web on left, flanges extending right, lips going inward
  const shape = new THREE.Shape();

  // Outer outline (centered at centroid)
  const ox = -ex;  // offset so centroid is at origin

  // Bottom-left (web bottom-left)
  shape.moveTo(ox, -h / 2);
  shape.lineTo(ox + b, -h / 2);           // right along bottom flange
  shape.lineTo(ox + b, -h / 2 + lip);     // up (bottom lip)
  shape.lineTo(ox + b - t, -h / 2 + lip); // left (lip inner)
  shape.lineTo(ox + b - t, -h / 2 + t);   // down to flange inner
  shape.lineTo(ox + t, -h / 2 + t);       // left to web inner
  shape.lineTo(ox + t, h / 2 - t);        // up web inner
  shape.lineTo(ox + b - t, h / 2 - t);    // right top flange inner
  shape.lineTo(ox + b - t, h / 2 - lip);  // up to lip inner
  shape.lineTo(ox + b, h / 2 - lip);      // right (top lip outer)
  shape.lineTo(ox + b, h / 2);            // up to top
  shape.lineTo(ox, h / 2);                // left along top flange
  shape.closePath();                       // down web outer back to start

  return shape;
}

// ── Solid Rectangle ────────────────────────────────────────────────

function makeRectangle(h: number, b: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-b / 2, -h / 2);
  shape.lineTo(b / 2, -h / 2);
  shape.lineTo(b / 2, h / 2);
  shape.lineTo(-b / 2, h / 2);
  shape.closePath();
  return shape;
}

// ── Main entry point ───────────────────────────────────────────────

/**
 * Create profile shape based on detected type.
 * Looks up SteelProfileLibrary for fillet radii when available.
 */
export function createProfileShape(section: IBeamSection, profileName?: string): THREE.Shape {
  const profileType = detectProfileType(profileName);

  // Try to look up full profile data for fillet radii
  let shapeCoords: number[] | null = null;
  let shapeName = '';
  if (profileName) {
    try {
      const entry = SteelProfileLibrary.findProfile(profileName);
      if (entry) {
        shapeCoords = entry.data.shape_coords;
        shapeName = entry.data.shape_name;
      }
    } catch { /* library not available, use defaults */ }
  }

  // Convert section dimensions to mm
  const h = section.h * 1000;
  const b = (section.b || section.h * 0.5) * 1000;
  const tw = (section.tw || section.h * 0.05) * 1000;
  const tf = (section.tf || section.h * 0.08) * 1000;

  switch (profileType) {
    case 'i-shape': {
      // Fillet radius from library (shape_coords[4] is r in mm)
      const r = shapeCoords ? (shapeCoords[4] || 0) : 0;
      return makeIShape(h, b, tw, tf, r);
    }

    case 'rhs': {
      const t = tw;
      let rOuter = 0, rInner = 0;
      if (shapeCoords && shapeName === 'Rectangle Hollow Section') {
        rOuter = shapeCoords[3] || t * 2;
        rInner = shapeCoords[4] || Math.max(rOuter - t, t * 0.5);
      }
      return makeRHS(h, b, t, rOuter, rInner);
    }

    case 'chs': {
      const t = tw;
      return makeCHS(h, t);
    }

    case 'channel': {
      let r = 0;
      if (shapeCoords) {
        r = shapeCoords[4] || 0;
      }
      return makeChannel(h, b, tw, tf, r);
    }

    case 'angle': {
      let r1 = 0, ex = 0, ey = 0;
      if (shapeCoords && shapeName === 'LAngle') {
        r1 = shapeCoords[4] || 0;
        ex = shapeCoords[6] || b * 0.3;
        ey = shapeCoords[7] || h * 0.3;
      } else {
        // Estimate centroid for angles
        const A = (h + b - tw) * tw;
        ex = (b * tw * b / 2) / (A * 1000) * 1000;
        ey = (h * tw * h / 2) / (A * 1000) * 1000;
      }
      return makeAngle(h, b, tw, tf, r1, ex, ey);
    }

    case 't-shape': {
      let r = 0;
      if (shapeCoords && shapeName === 'TProfile') {
        r = shapeCoords[4] || 0;
      }
      return makeTShape(h, b, tw, tf, r);
    }

    case 'cold-formed': {
      let lip = 0, ex = b * 0.35;
      if (shapeCoords) {
        if (shapeName === 'C-Cold-Formed-Lips') {
          lip = shapeCoords[2] || 0;
          const t = shapeCoords[3] || tw;
          ex = shapeCoords[5] || b * 0.35;
          return makeColdFormedC(h, b, lip, t, ex);
        }
        if (shapeName === 'Sigma' || shapeName === 'C-Cold-Formed') {
          return makeChannel(h, b, tw, tf, 0);
        }
      }
      // Fallback: draw as simple channel
      return makeChannel(h, b, tw, tf, 0);
    }

    case 'rectangle':
    default:
      return makeRectangle(h, b);
  }
}
