/**
 * Typedeclaraties voor `triangle-wasm` (Shewchuk's Triangle, gecompileerd
 * naar WASM). De npm-module zelf levert geen typings; deze declaraties zijn
 * 1-op-1 afgeleid uit node_modules/triangle-wasm/index.js (v1.0.x) en
 * vervangen de eerdere any-stub (P4.1). Consument: core/mesher/
 * TriangleService.ts (dynamische import), dat zelf weer alleen door
 * core/fem/PlateRegion.ts wordt gebruikt.
 *
 * RUNTIME-VEREISTEN (P4.1):
 *  - `triangle-wasm` staat in design-mockup/package.json (dependencies);
 *  - het WASM-binary staat als `public/triangle.out.wasm` en wordt door
 *    Vite ongewijzigd naar de dist-root gekopieerd;
 *  - TriangleService laadt het via
 *    `new URL('/triangle.out.wasm', window.location.origin)`.
 *
 * TAURI-PAD-RISICO: onder de gebouwde desktop-app serveert de WebView de
 * dist-map vanaf een eigen origin (Windows/WebView2: http://tauri.localhost).
 * `/triangle.out.wasm` hoort daar net als in de browser vanaf de dist-root te
 * resolven, maar dit is niet in CI verifieerbaar — expliciet te testen op de
 * desktopbuild (polygonplaat tekenen → mesh verschijnt). Faalt de fetch, dan
 * meldt de meshgeneratie dat en blijft het model ongewijzigd (P4.3).
 */
declare module 'triangle-wasm' {
  /**
   * Switches voor triangulate() — samengesteld tot de Triangle-switchstring
   * (getSwitchesStr): p (pslg, default aan), z (altijd, 0-based), Q (quiet,
   * default aan), D (ccdt), q<hoek> (quality), a<opp> (area), enz.
   */
  export interface TriangulateSwitches {
    /** PSLG-invoer (default true → switch "p"). */
    pslg?: boolean;
    /** Geen console-uitvoer (default true → switch "Q"). */
    quiet?: boolean;
    /** Verfijn een bestaand mesh (switch "r"). */
    refine?: boolean;
    /** Regio-attributen toekennen (switch "A"). */
    regionAttr?: boolean;
    /** Convex hull van de puntenwolk (switch "c"). */
    convexHull?: boolean;
    /** Conforming Constrained Delaunay (switch "D") — nodig zodat
     *  randsegmenten exact in het mesh terugkomen. */
    ccdt?: boolean;
    /** Verwijder ongebruikte punten (switch "j"). */
    jettison?: boolean;
    /** Lever ook de edge-lijst (switch "e"). */
    edges?: boolean;
    /** Lever buur-driehoeken (switch "n"). */
    neighbors?: boolean;
    /** Kwadratische (6-knoops) elementen (switch "o2"). */
    quadratic?: boolean;
    /** false → géén randmarkers (switch "B"). */
    bndMarkers?: boolean;
    /** false → gaten negeren (switch "O"). */
    holes?: boolean;
    /** Maximum aantal Steiner-punten (switch "S<n>"). */
    steiner?: number;
    /** Kwaliteitseis: minimale hoek in graden (switch "q<hoek>"),
     *  of true voor de Triangle-default. */
    quality?: number | boolean;
    /** Maximale driehoeksoppervlakte (switch "a<opp>"), of true. */
    area?: number | boolean;
  }

  /**
   * Invoervelden voor makeIO(). Vlakke arrays: pointlist = [x0, y0, x1, y1, …],
   * segmentlist = [a0, b0, a1, b1, …] (0-based puntindices), holelist =
   * [x, y, …] (één binnenpunt per gat). Gewone number-arrays worden intern
   * naar typed arrays gekopieerd.
   */
  export interface TriangulateIOInput {
    pointlist?: Float64Array | number[];
    pointattributelist?: Float64Array | number[];
    pointmarkerlist?: Int32Array | number[];
    trianglelist?: Int32Array | number[];
    triangleattributelist?: Float64Array | number[];
    trianglearealist?: Float64Array | number[];
    neighborlist?: Int32Array | number[];
    segmentlist?: Int32Array | number[];
    segmentmarkerlist?: Int32Array | number[];
    holelist?: Float64Array | number[];
    regionlist?: Float64Array | number[];
    edgelist?: Int32Array | number[];
    edgemarkerlist?: Int32Array | number[];
    normlist?: Float64Array | number[];
  }

  /**
   * In/uit-structuur om Triangle's struct triangulateio heen. De getters
   * lezen rechtstreeks uit het WASM-geheugen (subarray-views!) en geven
   * null terug zolang het betreffende veld niet gevuld is. Na freeIO() zijn
   * de views ongeldig — kopieer resultaten er dus eerst uit.
   */
  export interface TriangulateIO {
    /** Heap-pointer van de struct (intern, voor triangulate()). */
    readonly ptr: number;
    readonly pointlist: Float64Array | null;
    readonly pointattributelist: Float64Array | null;
    readonly pointmarkerlist: Int32Array | null;
    readonly numberofpoints: number;
    readonly numberofpointattributes: number;
    readonly trianglelist: Int32Array | null;
    readonly triangleattributelist: Float64Array | null;
    readonly trianglearealist: Float64Array | null;
    readonly neighborlist: Int32Array | null;
    readonly numberoftriangles: number;
    readonly numberofcorners: number;
    readonly numberoftriangleattributes: number;
    readonly segmentlist: Int32Array | null;
    readonly segmentmarkerlist: Int32Array | null;
    readonly numberofsegments: number;
    readonly holelist: Float64Array | null;
    readonly numberofholes: number;
    readonly regionlist: Float64Array | null;
    readonly numberofregions: number;
    readonly edgelist: Int32Array | null;
    readonly edgemarkerlist: Int32Array | null;
    readonly normlist: Float64Array | null;
    readonly numberofedges: number;
  }

  /**
   * Laad en instantieer de WASM-module (éénmalig). `path` is de volledige
   * URL/het pad naar triangle.out.wasm; zonder argument zoekt Emscripten
   * naast het script.
   */
  export function init(path?: string): Promise<void>;

  /**
   * Draai Triangle: switches (object of rauwe switchstring) + input-IO →
   * output-IO. Optioneel een vierde IO voor het Voronoi-diagram.
   * Synchrone aanroep; init() moet eerst voltooid zijn.
   */
  export function triangulate(
    switches: TriangulateSwitches | string,
    input: TriangulateIO,
    output: TriangulateIO,
    vorout?: TriangulateIO | null,
  ): void;

  /** Alloceer een IO-struct in WASM-geheugen, optioneel gevuld met invoer. */
  export function makeIO(data?: TriangulateIOInput): TriangulateIO;

  /**
   * Geef het WASM-geheugen van een IO-struct vrij. `all` = true geeft ook
   * hole-/regionlijsten vrij — precies één keer doen (de pointers worden
   * door Triangle van input naar output gekopieerd; dubbel vrijgeven is een
   * double-free).
   */
  export function freeIO(io: TriangulateIO, all?: boolean): void;

  /** Bouw de Triangle-switchstring (voor debugging/logging). */
  export function getSwitchesStr(
    obj: TriangulateSwitches | string,
    input?: TriangulateIO,
    vorout?: TriangulateIO | null,
  ): string;

  /**
   * CJS-module (module.exports = {…}): bij een dynamische import onder
   * Vite/esbuild verschijnt hetzelfde object ook als default-export —
   * TriangleService gebruikt `lib.default ?? lib`.
   */
  const triangleWasm: {
    init: typeof init;
    triangulate: typeof triangulate;
    makeIO: typeof makeIO;
    freeIO: typeof freeIO;
    getSwitchesStr: typeof getSwitchesStr;
  };
  export default triangleWasm;
}
