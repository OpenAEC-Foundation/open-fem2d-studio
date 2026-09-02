/**
 * Staalprofiel-hoofdafmetingen voor de doorsnede-tekening in het rapport
 * (h, b, tw, tf in mm; bij buisprofielen geldt tw = tf = wanddikte t,
 * bij CHS is h = b = uitwendige diameter).
 *
 * GEGENEREERD uit src-tauri/crates/steel-profiles/data/profiles.json —
 * de bron van waarheid die ook de Rust-toetsing gebruikt. Niet met de hand
 * bijwerken; opnieuw genereren bij wijziging van de database.
 * Sleutels genormaliseerd (hoofdletters, zonder spaties/koppeltekens);
 * dubbelen ontdubbeld met dezelfde eerste-wint-regel als de Rust-lookup.
 */
export type SteelSectionKind = "ISection" | "Channel" | "Shs" | "Rhs" | "Chs";

export interface SteelSectionDims {
  kind: SteelSectionKind;
  /** Hoogte in mm (CHS: uitwendige diameter). */
  h: number;
  /** Breedte in mm (CHS: uitwendige diameter). */
  b: number;
  /** Lijfdikte in mm (buisprofielen: wanddikte t). */
  tw: number;
  /** Flensdikte in mm (buisprofielen: wanddikte t). */
  tf: number;
}

export const STEEL_SECTION_DIMS: Record<string, SteelSectionDims> = {
  "HEB160": { kind: "ISection", h: 160, b: 160, tw: 8, tf: 13 },
  "HEB300": { kind: "ISection", h: 300, b: 300, tw: 11, tf: 19 },
  "UNP350": { kind: "Channel", h: 350, b: 100, tw: 14, tf: 16 },
  "HFRHS200X200X16": { kind: "Shs", h: 200, b: 200, tw: 16, tf: 16 },
  "IPE80": { kind: "ISection", h: 80, b: 46, tw: 3.8, tf: 5.2 },
  "IPE100": { kind: "ISection", h: 100, b: 55, tw: 4.1, tf: 5.7 },
  "IPE120": { kind: "ISection", h: 120, b: 64, tw: 4.4, tf: 6.3 },
  "IPE140": { kind: "ISection", h: 140, b: 73, tw: 4.7, tf: 6.9 },
  "IPE160": { kind: "ISection", h: 160, b: 82, tw: 5, tf: 7.4 },
  "IPE180": { kind: "ISection", h: 180, b: 91, tw: 5.3, tf: 8 },
  "IPE200": { kind: "ISection", h: 200, b: 100, tw: 5.6, tf: 8.5 },
  "IPE220": { kind: "ISection", h: 220, b: 110, tw: 5.9, tf: 9.2 },
  "IPE240": { kind: "ISection", h: 240, b: 120, tw: 6.2, tf: 9.8 },
  "IPE270": { kind: "ISection", h: 270, b: 135, tw: 6.6, tf: 10.2 },
  "IPE300": { kind: "ISection", h: 300, b: 150, tw: 7.1, tf: 10.7 },
  "IPE330": { kind: "ISection", h: 330, b: 160, tw: 7.5, tf: 11.5 },
  "IPE360": { kind: "ISection", h: 360, b: 170, tw: 8, tf: 12.7 },
  "IPE400": { kind: "ISection", h: 400, b: 180, tw: 8.6, tf: 13.5 },
  "IPE450": { kind: "ISection", h: 450, b: 190, tw: 9.4, tf: 14.6 },
  "IPE500": { kind: "ISection", h: 500, b: 200, tw: 10.2, tf: 16 },
  "IPE550": { kind: "ISection", h: 550, b: 210, tw: 11.1, tf: 17.2 },
  "IPE600": { kind: "ISection", h: 600, b: 220, tw: 12, tf: 19 },
  "HEA100": { kind: "ISection", h: 96, b: 100, tw: 5, tf: 8 },
  "HEA120": { kind: "ISection", h: 114, b: 120, tw: 5, tf: 8 },
  "HEA140": { kind: "ISection", h: 133, b: 140, tw: 5.5, tf: 8.5 },
  "HEA160": { kind: "ISection", h: 152, b: 160, tw: 6, tf: 9 },
  "HEA180": { kind: "ISection", h: 171, b: 180, tw: 6, tf: 9.5 },
  "HEA200": { kind: "ISection", h: 190, b: 200, tw: 6.5, tf: 10 },
  "HEA220": { kind: "ISection", h: 210, b: 220, tw: 7, tf: 11 },
  "HEA240": { kind: "ISection", h: 230, b: 240, tw: 7.5, tf: 12 },
  "HEA260": { kind: "ISection", h: 250, b: 260, tw: 7.5, tf: 12.5 },
  "HEA280": { kind: "ISection", h: 270, b: 280, tw: 8, tf: 13 },
  "HEA300": { kind: "ISection", h: 290, b: 300, tw: 8.5, tf: 14 },
  "HEA320": { kind: "ISection", h: 310, b: 300, tw: 9, tf: 15.5 },
  "HEA340": { kind: "ISection", h: 330, b: 300, tw: 9.5, tf: 16.5 },
  "HEA360": { kind: "ISection", h: 350, b: 300, tw: 10, tf: 17.5 },
  "HEA400": { kind: "ISection", h: 390, b: 300, tw: 11, tf: 19 },
  "HEB100": { kind: "ISection", h: 100, b: 100, tw: 6, tf: 10 },
  "HEB120": { kind: "ISection", h: 120, b: 120, tw: 6.5, tf: 11 },
  "HEB140": { kind: "ISection", h: 140, b: 140, tw: 7, tf: 12 },
  "HEB180": { kind: "ISection", h: 180, b: 180, tw: 8.5, tf: 14 },
  "HEB200": { kind: "ISection", h: 200, b: 200, tw: 9, tf: 15 },
  "HEB220": { kind: "ISection", h: 220, b: 220, tw: 9.5, tf: 16 },
  "HEB240": { kind: "ISection", h: 240, b: 240, tw: 10, tf: 17 },
  "HEB260": { kind: "ISection", h: 260, b: 260, tw: 10, tf: 17.5 },
  "HEB280": { kind: "ISection", h: 280, b: 280, tw: 10.5, tf: 18 },
  "HEB320": { kind: "ISection", h: 320, b: 300, tw: 11.5, tf: 20.5 },
  "HEB340": { kind: "ISection", h: 340, b: 300, tw: 12, tf: 21.5 },
  "HEB360": { kind: "ISection", h: 360, b: 300, tw: 12.5, tf: 22.5 },
  "HEB400": { kind: "ISection", h: 400, b: 300, tw: 13.5, tf: 24 },
  "HEM100": { kind: "ISection", h: 120, b: 106, tw: 12, tf: 20 },
  "HEM120": { kind: "ISection", h: 140, b: 126, tw: 12.5, tf: 21 },
  "HEM140": { kind: "ISection", h: 160, b: 146, tw: 13, tf: 22 },
  "HEM160": { kind: "ISection", h: 180, b: 166, tw: 14, tf: 23 },
  "HEM180": { kind: "ISection", h: 200, b: 186, tw: 14.5, tf: 24 },
  "HEM200": { kind: "ISection", h: 220, b: 206, tw: 15, tf: 25 },
  "HEM220": { kind: "ISection", h: 240, b: 226, tw: 15.5, tf: 26 },
  "HEM240": { kind: "ISection", h: 270, b: 248, tw: 18, tf: 32 },
  "HEM260": { kind: "ISection", h: 290, b: 268, tw: 18, tf: 32.5 },
  "HEM280": { kind: "ISection", h: 310, b: 288, tw: 18.5, tf: 33 },
  "HEM300": { kind: "ISection", h: 340, b: 310, tw: 21, tf: 39 },
  "SHS80X80X4": { kind: "Shs", h: 80, b: 80, tw: 4, tf: 4 },
  "SHS100X100X5": { kind: "Shs", h: 100, b: 100, tw: 5, tf: 5 },
  "SHS120X120X5": { kind: "Shs", h: 120, b: 120, tw: 5, tf: 5 },
  "SHS150X150X6": { kind: "Shs", h: 150, b: 150, tw: 6, tf: 6 },
  "SHS200X200X8": { kind: "Shs", h: 200, b: 200, tw: 8, tf: 8 },
  "SHS250X250X10": { kind: "Shs", h: 250, b: 250, tw: 10, tf: 10 },
  "SHS300X300X10": { kind: "Shs", h: 300, b: 300, tw: 10, tf: 10 },
  "RHS100X50X4": { kind: "Rhs", h: 100, b: 50, tw: 4, tf: 4 },
  "RHS120X60X5": { kind: "Rhs", h: 120, b: 60, tw: 5, tf: 5 },
  "RHS150X100X6": { kind: "Rhs", h: 150, b: 100, tw: 6, tf: 6 },
  "RHS200X100X8": { kind: "Rhs", h: 200, b: 100, tw: 8, tf: 8 },
  "RHS250X150X8": { kind: "Rhs", h: 250, b: 150, tw: 8, tf: 8 },
  "RHS300X200X10": { kind: "Rhs", h: 300, b: 200, tw: 10, tf: 10 },
  "CHS424X32": { kind: "Chs", h: 42.4, b: 42.4, tw: 3.2, tf: 3.2 },
  "CHS483X32": { kind: "Chs", h: 48.3, b: 48.3, tw: 3.2, tf: 3.2 },
  "CHS603X40": { kind: "Chs", h: 60.3, b: 60.3, tw: 4, tf: 4 },
  "CHS761X50": { kind: "Chs", h: 76.1, b: 76.1, tw: 5, tf: 5 },
  "CHS889X50": { kind: "Chs", h: 88.9, b: 88.9, tw: 5, tf: 5 },
  "CHS1143X63": { kind: "Chs", h: 114.3, b: 114.3, tw: 6.3, tf: 6.3 },
  "CHS1397X80": { kind: "Chs", h: 139.7, b: 139.7, tw: 8, tf: 8 },
  "CHS1683X80": { kind: "Chs", h: 168.3, b: 168.3, tw: 8, tf: 8 },
  "CHS2191X10": { kind: "Chs", h: 219.1, b: 219.1, tw: 10, tf: 10 },
  "CHS273X10": { kind: "Chs", h: 273, b: 273, tw: 10, tf: 10 },
  "CHS3239X125": { kind: "Chs", h: 323.9, b: 323.9, tw: 12.5, tf: 12.5 },
  "CHS4064X16": { kind: "Chs", h: 406.4, b: 406.4, tw: 16, tf: 16 },
  "UNP80": { kind: "Channel", h: 80, b: 45, tw: 6, tf: 8 },
  "UNP100": { kind: "Channel", h: 100, b: 50, tw: 6, tf: 8.5 },
  "UNP120": { kind: "Channel", h: 120, b: 55, tw: 7, tf: 9 },
  "UNP140": { kind: "Channel", h: 140, b: 60, tw: 7, tf: 10 },
  "UNP160": { kind: "Channel", h: 160, b: 65, tw: 7.5, tf: 10.5 },
  "UNP180": { kind: "Channel", h: 180, b: 70, tw: 8, tf: 11 },
  "UNP200": { kind: "Channel", h: 200, b: 75, tw: 8.5, tf: 11.5 },
  "UNP220": { kind: "Channel", h: 220, b: 80, tw: 9, tf: 12.5 },
  "UNP240": { kind: "Channel", h: 240, b: 85, tw: 9.5, tf: 13 },
  "UNP260": { kind: "Channel", h: 260, b: 90, tw: 10, tf: 14 },
  "UNP280": { kind: "Channel", h: 280, b: 95, tw: 10, tf: 15 },
  "UNP300": { kind: "Channel", h: 300, b: 100, tw: 10, tf: 16 },
};
