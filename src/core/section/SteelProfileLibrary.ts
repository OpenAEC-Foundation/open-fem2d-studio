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
};

/** Profile category for UI grouping */
export type ProfileCategory =
  | 'I-Profiles'
  | 'Hollow Sections'
  | 'Channels'
  | 'Angles'
  | 'T-Profiles'
  | 'Solid Sections';

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
    return ['I-Profiles', 'Hollow Sections', 'Channels', 'Angles', 'T-Profiles', 'Solid Sections'];
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
          // shape_coords: [h, b, tw, tf, r1, r2, slope]
          const [h, b, tw, tf, r1] = shape_coords;
          const r2 = shape_coords[5] || r1 * 0.5;
          const slope = shape_coords[6] || 8; // degrees
          const tl = b * 0.5; // Estimate flange thickness location
          const ex = b * 0.35;
          return createCChannelSlopedFlange(name, h, b, tw, tf, r1, r2, tl, slope, ex);
        }

        case 'LAngle': {
          // shape_coords: [h, b, t, r1, r2]
          const [h, b, t] = shape_coords;
          const r1 = shape_coords[3] || t;
          const r2 = shape_coords[4] || t * 0.5;
          // Estimate centroid position
          const A = (h + b - t) * t;
          const ex = (b * t * b / 2 + (h - t) * t * t / 2) / A;
          const ey = (h * t * h / 2 + (b - t) * t * t / 2) / A;
          return createLAngle(name, h, b, t, t, r1, r2, ex, ey);
        }

        case 'TProfile': {
          // shape_coords: [h, b, tw, tf]
          const [h, b, tw, tf] = shape_coords;
          return createTProfile(name, h, b, tw, tf);
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
        const [h, b, t] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: t / 1000, tf: t / 1000 };
      }

      case 'TProfile': {
        const [h, b, tw, tf] = shape_coords;
        return { h: h / 1000, b: b / 1000, tw: tw / 1000, tf: tf / 1000 };
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
