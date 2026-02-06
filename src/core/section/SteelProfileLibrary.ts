/**
 * Steel Profile Library
 *
 * Loads and provides access to standard steel profiles from JSON database.
 * Supports IFC profile type mapping and SVG rendering with fillets.
 */

import {
  ProfileGeometry,
  createIShapeParallelFlange,
  createRectangleHollowSection,
  createRoundTube,
  createRound,
  createCChannelParallelFlange,
  createCChannelSlopedFlange,
  createRectangle,
  createLAngle,
  createTProfile,
  createCProfileColdFormed,
  createCProfileWithLips,
  createSigmaProfile,
  createZProfileColdFormed,
  createZProfileWithLips,
} from './SteelProfiles';

// Import the profile database
import steelProfilesJson from '../../data/steelprofile.json';

/** Profile data from JSON */
export interface ProfileData {
  shape_coords: number[];
  shape_name: string;
  synonyms: string[];
}

/** Parsed profile entry */
export interface ProfileEntry {
  name: string;
  data: ProfileData;
}

/** IFC Profile type mapping */
export type IfcProfileType =
  | 'IfcIShapeProfileDef'
  | 'IfcRectangleHollowProfileDef'
  | 'IfcCircleHollowProfileDef'
  | 'IfcCircleProfileDef'
  | 'IfcRectangleProfileDef'
  | 'IfcCShapeProfileDef'
  | 'IfcLShapeProfileDef'
  | 'IfcTShapeProfileDef'
  | 'IfcUShapeProfileDef'
  | 'IfcAsymmetricIShapeProfileDef'
  | 'IfcZShapeProfileDef'
  | 'IfcArbitraryClosedProfileDef';

/** Shape name to IFC type mapping */
const shapeToIfcType: Record<string, IfcProfileType> = {
  'I-shape parallel flange': 'IfcIShapeProfileDef',
  'I-shape sloped flange': 'IfcIShapeProfileDef',
  'Rectangle Hollow Section': 'IfcRectangleHollowProfileDef',
  'Round tube profile': 'IfcCircleHollowProfileDef',
  'Round': 'IfcCircleProfileDef',
  'Rectangle': 'IfcRectangleProfileDef',
  'C-channel parallel flange': 'IfcUShapeProfileDef',
  'C-channel sloped flange': 'IfcUShapeProfileDef',
  'LAngle': 'IfcLShapeProfileDef',
  'TProfile': 'IfcTShapeProfileDef',
  'C-Cold-Formed': 'IfcCShapeProfileDef',
  'C-Cold-Formed-Lips': 'IfcCShapeProfileDef',
  'Sigma': 'IfcArbitraryClosedProfileDef',
  'Z-Cold-Formed': 'IfcZShapeProfileDef',
  'Z-Cold-Formed-Lips': 'IfcZShapeProfileDef',
};

/** Profile category for UI grouping */
export type ProfileCategory =
  | 'I-Profiles'
  | 'Hollow Sections'
  | 'Channels'
  | 'Angles'
  | 'T-Profiles'
  | 'Solid Sections'
  | 'Cold-Formed';

/** Shape name to category mapping */
const shapeToCategory: Record<string, ProfileCategory> = {
  'I-shape parallel flange': 'I-Profiles',
  'I-shape sloped flange': 'I-Profiles',
  'Rectangle Hollow Section': 'Hollow Sections',
  'Round tube profile': 'Hollow Sections',
  'Round': 'Solid Sections',
  'Rectangle': 'Solid Sections',
  'C-channel parallel flange': 'Channels',
  'C-channel sloped flange': 'Channels',
  'LAngle': 'Angles',
  'TProfile': 'T-Profiles',
  'C-Cold-Formed': 'Cold-Formed',
  'C-Cold-Formed-Lips': 'Cold-Formed',
  'Sigma': 'Cold-Formed',
  'Z-Cold-Formed': 'Cold-Formed',
  'Z-Cold-Formed-Lips': 'Cold-Formed',
};

/** Profile series (e.g., HEA, HEB, IPE) */
export interface ProfileSeries {
  name: string;
  category: ProfileCategory;
  profiles: ProfileEntry[];
}

/**
 * Steel Profile Library singleton
 */
class SteelProfileLibraryClass {
  private profiles: Map<string, ProfileEntry> = new Map();
  private synonymMap: Map<string, string> = new Map();
  private seriesMap: Map<string, ProfileSeries> = new Map();
  private loaded = false;

  constructor() {
    this.loadProfiles();
  }

  /**
   * Load profiles from JSON database
   */
  private loadProfiles(): void {
    if (this.loaded) return;

    const jsonArray = steelProfilesJson as Record<string, ProfileData[]>[];

    for (const item of jsonArray) {
      const [name, dataArray] = Object.entries(item)[0];
      const data = dataArray[0];

      const entry: ProfileEntry = { name, data };
      this.profiles.set(name, entry);

      // Build synonym map
      for (const synonym of data.synonyms) {
        this.synonymMap.set(synonym.toLowerCase(), name);
      }

      // Extract series name (e.g., "HEA" from "HEA200")
      const seriesMatch = name.match(/^([A-Za-z]+)/);
      if (seriesMatch) {
        const seriesName = seriesMatch[1];
        if (!this.seriesMap.has(seriesName)) {
          this.seriesMap.set(seriesName, {
            name: seriesName,
            category: shapeToCategory[data.shape_name] || 'I-Profiles',
            profiles: []
          });
        }
        this.seriesMap.get(seriesName)!.profiles.push(entry);
      }
    }

    this.loaded = true;
  }

  /**
   * Get all available profile series
   */
  getSeries(): ProfileSeries[] {
    return Array.from(this.seriesMap.values());
  }

  /**
   * Get series by category
   */
  getSeriesByCategory(category: ProfileCategory): ProfileSeries[] {
    return this.getSeries().filter(s => s.category === category);
  }

  /**
   * Get all categories
   */
  getCategories(): ProfileCategory[] {
    return ['I-Profiles', 'Hollow Sections', 'Channels', 'Angles', 'T-Profiles', 'Solid Sections', 'Cold-Formed'];
  }

  /**
   * Find profile by name (supports synonyms)
   */
  findProfile(name: string): ProfileEntry | undefined {
    // Try exact match first
    if (this.profiles.has(name)) {
      return this.profiles.get(name);
    }
    // Try synonym match
    const canonicalName = this.synonymMap.get(name.toLowerCase());
    if (canonicalName) {
      return this.profiles.get(canonicalName);
    }
    return undefined;
  }

  /**
   * Search profiles by partial name
   */
  searchProfiles(query: string, limit = 50): ProfileEntry[] {
    const q = query.toLowerCase();
    const results: ProfileEntry[] = [];

    for (const [name, entry] of this.profiles) {
      if (results.length >= limit) break;

      if (name.toLowerCase().includes(q)) {
        results.push(entry);
        continue;
      }

      // Check synonyms
      for (const syn of entry.data.synonyms) {
        if (syn.toLowerCase().includes(q)) {
          results.push(entry);
          break;
        }
      }
    }

    return results;
  }

  /**
   * Get IFC profile type for a profile
   */
  getIfcProfileType(entry: ProfileEntry): IfcProfileType {
    return shapeToIfcType[entry.data.shape_name] || 'IfcArbitraryClosedProfileDef';
  }

  /**
   * Generate profile geometry for SVG rendering
   */
  createProfileGeometry(entry: ProfileEntry): ProfileGeometry | null {
    const { shape_name, shape_coords } = entry.data;
    const name = entry.name;

    try {
      switch (shape_name) {
        case 'I-shape parallel flange': {
          // shape_coords: [h, b, tw, tf, r]
          const [h, b, tw, tf, r] = shape_coords;
          return createIShapeParallelFlange(name, h, b, tw, tf, r);
        }

        case 'I-shape sloped flange': {
          // shape_coords: [h, b, tw, tf, r] - approximate with parallel flange for now
          const [h, b, tw, tf, r] = shape_coords;
          return createIShapeParallelFlange(name, h, b, tw, tf, r);
        }

        case 'Rectangle Hollow Section': {
          // shape_coords: [h, b, t, r_outer, r_inner]
          const [h, b, t] = shape_coords;
          const r1 = shape_coords[3] || t * 2;
          const r2 = shape_coords[4] || Math.max(r1 - t, t * 0.5);
          return createRectangleHollowSection(name, h, b, t, r1, r2);
        }

        case 'Round tube profile': {
          // shape_coords: [diameter, thickness]
          const [d, t] = shape_coords;
          return createRoundTube(name, d, t);
        }

        case 'Round': {
          // shape_coords: [diameter]
          const [d] = shape_coords;
          return createRound(name, d / 2);
        }

        case 'Rectangle': {
          // shape_coords: [h, b]
          const [h, b] = shape_coords;
          return createRectangle(name, b, h);
        }

        case 'C-channel parallel flange': {
          // shape_coords: [h, b, tw, tf, r]
          const [h, b, tw, tf, r] = shape_coords;
          const ex = b * 0.35; // Approximate centroid offset
          return createCChannelParallelFlange(name, h, b, tw, tf, r, ex);
        }

        case 'C-channel sloped flange': {
          // shape_coords: [h, b, tw, tf, r1, r2, slopeDeg, tl, ex]
          const [h, b, tw, tf, r1] = shape_coords;
          const r2 = shape_coords[5] || r1 * 0.5;
          const slope = shape_coords[6] || 8; // degrees
          const tl = shape_coords[7] || b * 0.5; // flange tip thickness from JSON
          const ex = shape_coords[8] || b * 0.35; // centroid offset from JSON
          return createCChannelSlopedFlange(name, h, b, tw, tf, r1, r2, tl, slope, ex);
        }

        case 'LAngle': {
          // shape_coords: [h, b, tw, tf, r1, r2, ex, ey]
          const [h, b, tw] = shape_coords;
          const tf = shape_coords[3] || tw;
          const r1 = shape_coords[4] || tw;         // root fillet radius
          const r2 = shape_coords[5] || tw * 0.5;   // toe fillet radius
          // Use centroid from JSON if available, otherwise estimate
          let ex: number, ey: number;
          if (shape_coords[6] != null && shape_coords[7] != null) {
            ex = shape_coords[6];
            ey = shape_coords[7];
          } else {
            const A = (h + b - tw) * tw;
            ex = (b * tw * b / 2 + (h - tw) * tw * tw / 2) / A;
            ey = (h * tw * h / 2 + (b - tw) * tw * tw / 2) / A;
          }
          return createLAngle(name, h, b, tw, tf, r1, r2, ex, ey);
        }

        case 'TProfile': {
          // shape_coords: [h, b, tw, tf]
          const [h, b, tw, tf] = shape_coords;
          return createTProfile(name, h, b, tw, tf);
        }

        case 'C-Cold-Formed': {
          // shape_coords: [h, b, t, r, ex]
          const [h, b, t] = shape_coords;
          const r = shape_coords[3] || t * 2.5;
          const ex = shape_coords[4] || b * 0.35;
          return createCProfileColdFormed(name, b, h, t, r, ex);
        }

        case 'C-Cold-Formed-Lips': {
          // shape_coords: [h, b, lip, t, r, ex]
          const [h, b, lip, t] = shape_coords;
          const r = shape_coords[4] || t * 2.5;
          const ex = shape_coords[5] || b * 0.35;
          return createCProfileWithLips(name, b, h, lip, t, r, ex);
        }

        case 'Sigma': {
          // shape_coords: [h, b, lip, webDepth, webHeight, t, r]
          const [h, b, lip, webDepth, webHeight, t] = shape_coords;
          const r = shape_coords[6] || t * 2.5;
          return createSigmaProfile(name, b, h, lip, webDepth, webHeight, t, r);
        }

        case 'Z-Cold-Formed': {
          // shape_coords: [h, b, t, r]
          const [h, b, t] = shape_coords;
          const r = shape_coords[3] || t * 2.5;
          return createZProfileColdFormed(name, b, h, t, r);
        }

        case 'Z-Cold-Formed-Lips': {
          // shape_coords: [h, b, lip, t, r]
          const [h, b, lip, t] = shape_coords;
          const r = shape_coords[4] || t * 2.5;
          return createZProfileWithLips(name, b, h, lip, t, r);
        }

        default:
          console.warn(`Unknown shape type: ${shape_name}`);
          return null;
      }
    } catch (error) {
      console.error(`Error creating profile geometry for ${name}:`, error);
      return null;
    }
  }

  /**
   * Get beam section properties for FEM analysis
   */
  getBeamSection(entry: ProfileEntry): {
    h: number;
    b: number;
    tw?: number;
    tf?: number;
    r?: number;
  } {
    const { shape_name, shape_coords } = entry.data;

    switch (shape_name) {
      case 'I-shape parallel flange':
      case 'I-shape sloped flange': {
        const [h, b, tw, tf, r] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: tw / 1000, tf: tf / 1000, r: r / 1000 };
      }

      case 'Rectangle Hollow Section': {
        const [h, b, t] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: t / 1000, tf: t / 1000 };
      }

      case 'Round tube profile': {
        const [d, t] = shape_coords;
        return { h: d / 1000, b: d / 1000, tw: t / 1000 };
      }

      case 'Round': {
        const [d] = shape_coords;
        return { h: d / 1000, b: d / 1000 };
      }

      case 'Rectangle': {
        const [h, b] = shape_coords;
        return { h: h / 1000, b: b / 1000 };
      }

      case 'C-channel parallel flange':
      case 'C-channel sloped flange': {
        const [h, b, tw, tf, r] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: tw / 1000, tf: tf / 1000, r: r / 1000 };
      }

      case 'LAngle': {
        const [h, b, tw] = shape_coords;
        const tf = shape_coords[3] || tw;
        return { h: h / 1000, b: b / 1000, tw: tw / 1000, tf: tf / 1000 };
      }

      case 'TProfile': {
        const [h, b, tw, tf] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: tw / 1000, tf: tf / 1000 };
      }

      case 'C-Cold-Formed': {
        const [h, b, t] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: t / 1000, tf: t / 1000 };
      }

      case 'C-Cold-Formed-Lips': {
        const [h, b, , t] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: t / 1000, tf: t / 1000 };
      }

      case 'Sigma': {
        const [h, b, , , , t] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: t / 1000, tf: t / 1000 };
      }

      case 'Z-Cold-Formed': {
        const [h, b, t] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: t / 1000, tf: t / 1000 };
      }

      case 'Z-Cold-Formed-Lips': {
        const [h, b, , t] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: t / 1000, tf: t / 1000 };
      }

      default:
        return { h: 0.1, b: 0.1 };
    }
  }

  /**
   * Get total number of profiles
   */
  get count(): number {
    return this.profiles.size;
  }

  /**
   * Get all profile names
   */
  getAllProfileNames(): string[] {
    return Array.from(this.profiles.keys());
  }
}

// Export singleton instance
export const SteelProfileLibrary = new SteelProfileLibraryClass();

// Export type for external use
export type { SteelProfileLibraryClass };
