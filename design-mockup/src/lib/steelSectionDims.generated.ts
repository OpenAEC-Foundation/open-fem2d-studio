/**
 * Staalprofiel-hoofdafmetingen voor de doorsnede-tekening in het rapport
 * (h, b, tw, tf, r in mm; bij buisprofielen geldt tw = tf = wanddikte t,
 * bij CHS is h = b = uitwendige diameter en r = 0), plus de aanvullende
 * doorsnedegrootheden (props) voor de eigenschappentabel.
 *
 * GEGENEREERD uit src-tauri/crates/steel-profiles/data/profiles.json —
 * de bron van waarheid die ook de Rust-toetsing gebruikt. Niet met de hand
 * bijwerken; opnieuw genereren met: node scripts/genereer-staalprofielen.mjs
 * Sleutels genormaliseerd (hoofdletters, zonder spaties/koppeltekens/punten);
 * dubbelen ontdubbeld met dezelfde eerste-wint-regel als de Rust-lookup.
 */
export type SteelSectionKind = "ISection" | "Channel" | "Shs" | "Rhs" | "Chs";

/** Aanvullende doorsnedegrootheden voor de eigenschappentabel in het rapport. */
export interface SteelSectionProps {
  /** Traagheidsmoment zwakke as Iz in mm⁴. */
  iz: number;
  /** Elastisch weerstandsmoment sterke as Wel;y in mm³. */
  welY: number;
  /** Elastisch weerstandsmoment zwakke as Wel;z in mm³. */
  welZ: number;
  /** Plastisch weerstandsmoment sterke as Wpl;y in mm³. */
  wplY: number;
  /** Plastisch weerstandsmoment zwakke as Wpl;z in mm³. */
  wplZ: number;
  /** Afschuifoppervlak Av;z in mm². */
  avZ: number;
  /** Torsietraagheidsmoment It in mm⁴. */
  it: number;
  /** Welvingsconstante Iw in mm⁶. */
  iw: number;
  /** Traagheidsstraal sterke as iy in mm. */
  iRadY: number;
  /** Traagheidsstraal zwakke as iz in mm. */
  iRadZ: number;
}

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
  /** Afrondingsstraal in mm (walsuitronding; SHS/RHS: hoekstraal; CHS: 0). */
  r: number;
  /** Aanvullende grootheden voor de eigenschappentabel (uit de database). */
  props?: SteelSectionProps;
}

export const STEEL_SECTION_DIMS: Record<string, SteelSectionDims> = {
  "HEB160": { kind: "ISection", h: 160, b: 160, tw: 8, tf: 13, r: 15,
    props: { iz: 8892613, welY: 311614, welZ: 111158, wplY: 354113, wplZ: 169986, avZ: 1762, it: 313664, iw: 47940000000, iRadY: 67.8, iRadZ: 40.5 } },
  "HEB300": { kind: "ISection", h: 300, b: 300, tw: 11, tf: 19, r: 27,
    props: { iz: 85628952, welY: 1677922, welZ: 570860, wplY: 1868933, wplZ: 870174, avZ: 4745, it: 1857719, iw: 1688000000000, iRadY: 129.9, iRadZ: 75.8 } },
  "UNP350": { kind: "Channel", h: 350, b: 100, tw: 14, tf: 16, r: 16,
    props: { iz: 5603739, welY: 725384, welZ: 73447, wplY: 889763, wplZ: 139730, avZ: 4946, it: 605000, iw: 110600000000, iRadY: 128.7, iRadZ: 27 } },
  "HFRHS200X200X16": { kind: "Shs", h: 200, b: 200, tw: 16, tf: 16, r: 24,
    props: { iz: 64400000, welY: 644000, welZ: 644000, wplY: 768000, wplZ: 768000, avZ: 5640, it: 102000000, iw: 0, iRadY: 75.6, iRadZ: 75.6 } },
  "IPE80": { kind: "ISection", h: 80, b: 46, tw: 3.8, tf: 5.2, r: 5,
    props: { iz: 84900, welY: 20000, welZ: 3690, wplY: 23200, wplZ: 5820, avZ: 304, it: 7000, iw: 118000000, iRadY: 32.37945829336445, iRadZ: 10.541615362469917 } },
  "IPE100": { kind: "ISection", h: 100, b: 55, tw: 4.1, tf: 5.7, r: 7,
    props: { iz: 159000, welY: 34200, welZ: 5790, wplY: 39400, wplZ: 9150, avZ: 409.99999999999994, it: 12000, iw: 351000000, iRadY: 40.745480421235456, iRadZ: 12.424529449393042 } },
  "IPE120": { kind: "ISection", h: 120, b: 64, tw: 4.4, tf: 6.3, r: 7,
    props: { iz: 277000, welY: 53000, welZ: 8650, wplY: 60700, wplZ: 13600, avZ: 528, it: 17400, iw: 890000000, iRadY: 49.08249086070214, iRadZ: 14.486148033500308 } },
  "IPE140": { kind: "ISection", h: 140, b: 73, tw: 4.7, tf: 6.9, r: 7,
    props: { iz: 449000, welY: 77300, welZ: 12300, wplY: 88300, wplZ: 19300, avZ: 658, it: 24500, iw: 1980000000, iRadY: 57.43501099333819, iRadZ: 16.5463134203628 } },
  "IPE160": { kind: "ISection", h: 160, b: 82, tw: 5, tf: 7.4, r: 9,
    props: { iz: 683000, welY: 109000, welZ: 16700, wplY: 124000, wplZ: 26100, avZ: 800, it: 36000, iw: 3960000000, iRadY: 65.75243786033423, iRadZ: 18.43369184468688 } },
  "IPE180": { kind: "ISection", h: 180, b: 91, tw: 5.3, tf: 8, r: 9,
    props: { iz: 1010000, welY: 146000, welZ: 22200, wplY: 166000, wplZ: 34600, avZ: 954, it: 47900, iw: 7430000000, iRadY: 74.31697351413912, iRadZ: 20.55709469403238 } },
  "IPE200": { kind: "ISection", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12,
    props: { iz: 1420000, welY: 194000, welZ: 28500, wplY: 221000, wplZ: 44600, avZ: 1120, it: 69800, iw: 13000000000, iRadY: 82.50465164982911, iRadZ: 22.321416040096732 } },
  "IPE220": { kind: "ISection", h: 220, b: 110, tw: 5.9, tf: 9.2, r: 12,
    props: { iz: 2050000, welY: 252000, welZ: 37300, wplY: 285000, wplZ: 58100, avZ: 1298, it: 90700, iw: 22700000000, iRadY: 91.06817871052816, iRadZ: 24.774431478639833 } },
  "IPE240": { kind: "ISection", h: 240, b: 120, tw: 6.2, tf: 9.8, r: 15,
    props: { iz: 2840000, welY: 324000, welZ: 47300, wplY: 367000, wplZ: 73900, avZ: 1488, it: 129000, iw: 37400000000, iRadY: 99.74391763340427, iRadZ: 26.950746019311644 } },
  "IPE270": { kind: "ISection", h: 270, b: 135, tw: 6.6, tf: 10.2, r: 15,
    props: { iz: 4200000, welY: 429000, welZ: 62200, wplY: 484000, wplZ: 97000, avZ: 1782, it: 159000, iw: 70600000000, iRadY: 112.31375287544851, iRadZ: 30.249507099101006 } },
  "IPE300": { kind: "ISection", h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15,
    props: { iz: 6040000, welY: 557000, welZ: 80500, wplY: 628000, wplZ: 125000, avZ: 2130, it: 201000, iw: 126000000000, iRadY: 124.65565954760767, iRadZ: 33.50636625964759 } },
  "IPE330": { kind: "ISection", h: 330, b: 160, tw: 7.5, tf: 11.5, r: 18,
    props: { iz: 7880000, welY: 713000, welZ: 98500, wplY: 804000, wplZ: 154000, avZ: 2475, it: 282000, iw: 199000000000, iRadY: 137.12008216489426, iRadZ: 35.47937347941777 } },
  "IPE360": { kind: "ISection", h: 360, b: 170, tw: 8, tf: 12.7, r: 18,
    props: { iz: 10400000, welY: 904000, welZ: 123000, wplY: 1020000, wplZ: 191000, avZ: 2880, it: 373000, iw: 314000000000, iRadY: 149.59826992945878, iRadZ: 37.82243317357027 } },
  "IPE400": { kind: "ISection", h: 400, b: 180, tw: 8.6, tf: 13.5, r: 21,
    props: { iz: 13200000, welY: 1160000, welZ: 146000, wplY: 1310000, wplZ: 229000, avZ: 3440, it: 511000, iw: 490000000000, iRadY: 165.44721534401467, iRadZ: 39.52379254973886 } },
  "IPE450": { kind: "ISection", h: 450, b: 190, tw: 9.4, tf: 14.6, r: 21,
    props: { iz: 16800000, welY: 1500000, welZ: 176000, wplY: 1700000, wplZ: 276000, avZ: 4230, it: 669000, iw: 791000000000, iRadY: 184.79663841869584, iRadZ: 41.23596559193922 } },
  "IPE500": { kind: "ISection", h: 500, b: 200, tw: 10.2, tf: 16, r: 21,
    props: { iz: 21400000, welY: 1930000, welZ: 214000, wplY: 2190000, wplZ: 336000, avZ: 5100, it: 893000, iw: 1249000000000, iRadY: 203.84240024570707, iRadZ: 42.951456159330576 } },
  "IPE550": { kind: "ISection", h: 550, b: 210, tw: 11.1, tf: 17.2, r: 24,
    props: { iz: 26700000, welY: 2440000, welZ: 254000, wplY: 2780000, wplZ: 401000, avZ: 6105, it: 1230000, iw: 1884000000000, iRadY: 223.80695306179825, iRadZ: 44.63784620064946 } },
  "IPE600": { kind: "ISection", h: 600, b: 220, tw: 12, tf: 19, r: 24,
    props: { iz: 33900000, welY: 3070000, welZ: 308000, wplY: 3510000, wplZ: 486000, avZ: 7200, it: 1650000, iw: 2846000000000, iRadY: 242.95193151247227, iRadZ: 46.616273157309806 } },
  "HEA100": { kind: "ISection", h: 96, b: 100, tw: 5, tf: 8, r: 12,
    props: { iz: 1340000, welY: 72800, welZ: 26800, wplY: 83000, wplZ: 41100, avZ: 480, it: 52400, iw: 5750000000, iRadY: 40.57371581571424, iRadZ: 25.141111186622464 } },
  "HEA120": { kind: "ISection", h: 114, b: 120, tw: 5, tf: 8, r: 12,
    props: { iz: 2310000, welY: 106000, welZ: 38500, wplY: 119000, wplZ: 58900, avZ: 570, it: 59900, iw: 13280000000, iRadY: 48.941362026368324, iRadZ: 30.216609311120095 } },
  "HEA140": { kind: "ISection", h: 133, b: 140, tw: 5.5, tf: 8.5, r: 12,
    props: { iz: 3890000, welY: 155000, welZ: 55600, wplY: 174000, wplZ: 85200, avZ: 731.5, it: 81300.00000000001, iw: 28500000000, iRadY: 57.273508510218434, iRadZ: 35.197350797818764 } },
  "HEA160": { kind: "ISection", h: 152, b: 160, tw: 6, tf: 9, r: 15,
    props: { iz: 6160000, welY: 220000, welZ: 77000, wplY: 245000, wplZ: 118000, avZ: 912, it: 122000, iw: 54400000000, iRadY: 65.60582071234386, iRadZ: 39.84506074759307 } },
  "HEA180": { kind: "ISection", h: 171, b: 180, tw: 6, tf: 9.5, r: 15,
    props: { iz: 9250000, welY: 294000, welZ: 103000, wplY: 325000, wplZ: 157000, avZ: 1026, it: 148000, iw: 94580000000, iRadY: 74.43681113600401, iRadZ: 45.18785904262905 } },
  "HEA200": { kind: "ISection", h: 190, b: 200, tw: 6.5, tf: 10, r: 18,
    props: { iz: 13400000, welY: 389000, welZ: 134000, wplY: 430000, wplZ: 204000, avZ: 1235, it: 209800, iw: 155000000000, iRadY: 82.81748643541141, iRadZ: 49.9069766636149 } },
  "HEA220": { kind: "ISection", h: 210, b: 220, tw: 7, tf: 11, r: 18,
    props: { iz: 19500000, welY: 515000, welZ: 177000, wplY: 569000, wplZ: 271000, avZ: 1470, it: 285000, iw: 267000000000, iRadY: 91.72614593227726, iRadZ: 55.06958696976234 } },
  "HEA240": { kind: "ISection", h: 230, b: 240, tw: 7.5, tf: 12, r: 21,
    props: { iz: 27700000, welY: 675000, welZ: 231000, wplY: 745000, wplZ: 352000, avZ: 1725, it: 416000, iw: 449000000000, iRadY: 100.51948401512348, iRadZ: 60.056397105831564 } },
  "HEA260": { kind: "ISection", h: 250, b: 260, tw: 7.5, tf: 12.5, r: 24,
    props: { iz: 36700000, welY: 836000, welZ: 282000, wplY: 920000, wplZ: 430000, avZ: 1875, it: 524000, iw: 682000000000, iRadY: 109.72315392346522, iRadZ: 65.02392328272988 } },
  "HEA280": { kind: "ISection", h: 270, b: 280, tw: 8, tf: 13, r: 24,
    props: { iz: 47600000, welY: 1010000, welZ: 340000, wplY: 1110000, wplZ: 518000, avZ: 2160, it: 621000, iw: 1000000000000, iRadY: 118.52987793379789, iRadZ: 69.9434509510022 } },
  "HEA300": { kind: "ISection", h: 290, b: 300, tw: 8.5, tf: 14, r: 27,
    props: { iz: 63100000, welY: 1260000, welZ: 421000, wplY: 1380000, wplZ: 641000, avZ: 2465, it: 852000, iw: 1520000000000, iRadY: 127.68543937572298, iRadZ: 75.05950020769238 } },
  "HEA320": { kind: "ISection", h: 310, b: 300, tw: 9, tf: 15.5, r: 27,
    props: { iz: 69852972, welY: 1479497, welZ: 465686, wplY: 1628366, wplZ: 709770, avZ: 4116, it: 1084313, iw: 1512000000000, iRadY: 135.8, iRadZ: 74.9 } },
  "HEA340": { kind: "ISection", h: 330, b: 300, tw: 9.5, tf: 16.5, r: 27,
    props: { iz: 74400000, welY: 1680000, welZ: 496000, wplY: 1850000, wplZ: 756000, avZ: 3135, it: 1270000, iw: 2450000000000, iRadY: 144.01934951147317, iRadZ: 74.65275418807512 } },
  "HEA360": { kind: "ISection", h: 350, b: 300, tw: 10, tf: 17.5, r: 27,
    props: { iz: 78900000, welY: 1890000, welZ: 526000, wplY: 2090000, wplZ: 803000, avZ: 3500, it: 1490000, iw: 2990000000000, iRadY: 152.2244031276294, iRadZ: 74.33175690129767 } },
  "HEA400": { kind: "ISection", h: 390, b: 300, tw: 11, tf: 19, r: 27,
    props: { iz: 85638935, welY: 2311600, welZ: 570926, wplY: 2562154, wplZ: 872900, avZ: 5735, it: 1897649, iw: 2942000000000, iRadY: 168.4, iRadZ: 73.4 } },
  "HEB100": { kind: "ISection", h: 100, b: 100, tw: 6, tf: 10, r: 12,
    props: { iz: 1670000, welY: 89900, welZ: 33500, wplY: 104000, wplZ: 51400, avZ: 600, it: 92500, iw: 8460000000, iRadY: 41.60251471689218, iRadZ: 25.34379001467011 } },
  "HEB120": { kind: "ISection", h: 120, b: 120, tw: 6.5, tf: 11, r: 12,
    props: { iz: 3180000, welY: 144000, welZ: 53000, wplY: 165000, wplZ: 81000, avZ: 780, it: 138000, iw: 22400000000, iRadY: 50.410083025008355, iRadZ: 30.582578662484607 } },
  "HEB140": { kind: "ISection", h: 140, b: 140, tw: 7, tf: 12, r: 12,
    props: { iz: 5500000, welY: 216000, welZ: 78500, wplY: 246000, wplZ: 120000, avZ: 980, it: 201000, iw: 48700000000, iRadY: 59.25899009413461, iRadZ: 35.764084881929534 } },
  "HEB180": { kind: "ISection", h: 180, b: 180, tw: 8.5, tf: 14, r: 15,
    props: { iz: 13600000, welY: 426000, welZ: 151000, wplY: 481000, wplZ: 231000, avZ: 1530, it: 422000, iw: 167000000000, iRadY: 76.58483770305361, iRadZ: 45.6365561001259 } },
  "HEB200": { kind: "ISection", h: 200, b: 200, tw: 9, tf: 15, r: 18,
    props: { iz: 20000000, welY: 570000, welZ: 200000, wplY: 642000, wplZ: 306000, avZ: 1800, it: 593000, iw: 283000000000, iRadY: 85.43029595728645, iRadZ: 50.604539936925754 } },
  "HEB220": { kind: "ISection", h: 220, b: 220, tw: 9.5, tf: 16, r: 18,
    props: { iz: 28400000, welY: 736000, welZ: 258000, wplY: 827000, wplZ: 396000, avZ: 2090, it: 766000, iw: 466000000000, iRadY: 94.28737927267832, iRadZ: 55.86482901503522 } },
  "HEB240": { kind: "ISection", h: 240, b: 240, tw: 10, tf: 17, r: 21,
    props: { iz: 39200000, welY: 938000, welZ: 327000, wplY: 1050000, wplZ: 500000, avZ: 2400, it: 1030000, iw: 753000000000, iRadY: 103.06619964582939, iRadZ: 60.81211398682971 } },
  "HEB260": { kind: "ISection", h: 260, b: 260, tw: 10, tf: 17.5, r: 24,
    props: { iz: 51300000, welY: 1150000, welZ: 395000, wplY: 1280000, wplZ: 602000, avZ: 2600, it: 1240000, iw: 1130000000000, iRadY: 112.4458438387572, iRadZ: 65.93525329532483 } },
  "HEB280": { kind: "ISection", h: 280, b: 280, tw: 10.5, tf: 18, r: 24,
    props: { iz: 65900000, welY: 1380000, welZ: 471000, wplY: 1530000, wplZ: 718000, avZ: 2940, it: 1440000, iw: 1680000000000, iRadY: 121.28447412641957, iRadZ: 70.92625995458268 } },
  "HEB320": { kind: "ISection", h: 320, b: 300, tw: 11.5, tf: 20.5, r: 27,
    props: { iz: 92400000, welY: 1930000, welZ: 616000, wplY: 2150000, wplZ: 940000, avZ: 3680, it: 2250000, iw: 3260000000000, iRadY: 138.22898959619909, iRadZ: 75.68656613047285 } },
  "HEB340": { kind: "ISection", h: 340, b: 300, tw: 12, tf: 21.5, r: 27,
    props: { iz: 96900000, welY: 2160000, welZ: 646000, wplY: 2410000, wplZ: 986000, avZ: 4080, it: 2570000, iw: 4060000000000, iRadY: 146.46208047866608, iRadZ: 75.29928582579505 } },
  "HEB360": { kind: "ISection", h: 360, b: 300, tw: 12.5, tf: 22.5, r: 27,
    props: { iz: 101400000, welY: 2400000, welZ: 676000, wplY: 2680000, wplZ: 1030000, avZ: 4500, it: 2930000, iw: 4970000000000, iRadY: 154.64387696307455, iRadZ: 74.93075430155055 } },
  "HEB400": { kind: "ISection", h: 400, b: 300, tw: 13.5, tf: 24, r: 27,
    props: { iz: 108200000, welY: 2880000, welZ: 721000, wplY: 3230000, wplZ: 1100000, avZ: 5400, it: 3560000, iw: 7160000000000, iRadY: 170.76524369139878, iRadZ: 73.96061040039345 } },
  "HEM100": { kind: "ISection", h: 120, b: 106, tw: 12, tf: 20, r: 12,
    props: { iz: 3990000, welY: 190000, welZ: 75300, wplY: 235000, wplZ: 117000, avZ: 1440, it: 1180000, iw: 25370000000, iRadY: 46.29100498862757, iRadZ: 27.386127875258307 } },
  "HEM120": { kind: "ISection", h: 140, b: 126, tw: 12.5, tf: 21, r: 12,
    props: { iz: 7030000, welY: 288000, welZ: 112000, wplY: 350000, wplZ: 172000, avZ: 1750, it: 1530000, iw: 60560000000, iRadY: 55.15585802703821, iRadZ: 32.53820738392077 } },
  "HEM140": { kind: "ISection", h: 160, b: 146, tw: 13, tf: 22, r: 12,
    props: { iz: 11400000, welY: 411000, welZ: 156000, wplY: 496000, wplZ: 241000, avZ: 2080, it: 1930000, iw: 128400000000, iRadY: 63.88963809632517, iRadZ: 37.60840410803615 } },
  "HEM160": { kind: "ISection", h: 180, b: 166, tw: 14, tf: 23, r: 15,
    props: { iz: 17600000, welY: 566000, welZ: 212000, wplY: 675000, wplZ: 327000, avZ: 2520, it: 2580000, iw: 246100000000, iRadY: 72.47287215754707, iRadZ: 42.57422185586412 } },
  "HEM180": { kind: "ISection", h: 200, b: 186, tw: 14.5, tf: 24, r: 15,
    props: { iz: 25800000, welY: 748000, welZ: 277000, wplY: 884000, wplZ: 428000, avZ: 2900, it: 3240000, iw: 439400000000, iRadY: 81.36011938627347, iRadZ: 47.78269394569507 } },
  "HEM200": { kind: "ISection", h: 220, b: 206, tw: 15, tf: 25, r: 18,
    props: { iz: 36500000, welY: 967000, welZ: 354000, wplY: 1140000, wplZ: 549000, avZ: 3300, it: 4060000, iw: 727000000000, iRadY: 90.12290166533784, iRadZ: 52.78503141975699 } },
  "HEM220": { kind: "ISection", h: 240, b: 226, tw: 15.5, tf: 26, r: 18,
    props: { iz: 50200000, welY: 1220000, welZ: 444000, wplY: 1430000, wplZ: 690000, avZ: 3720, it: 4950000, iw: 1160000000000, iRadY: 98.9881695866774, iRadZ: 58.04418589986876 } },
  "HEM240": { kind: "ISection", h: 270, b: 248, tw: 18, tf: 32, r: 21,
    props: { iz: 81500000, welY: 1800000, welZ: 657000, wplY: 2120000, wplZ: 1020000, avZ: 4860, it: 9260000, iw: 2380000000000, iRadY: 110.20435563080073, iRadZ: 63.835726674018524 } },
  "HEM260": { kind: "ISection", h: 290, b: 268, tw: 18, tf: 32.5, r: 24,
    props: { iz: 104500000, welY: 2160000, welZ: 780000, wplY: 2530000, wplZ: 1210000, avZ: 5220, it: 10300000, iw: 3700000000000, iRadY: 119.29718429962286, iRadZ: 68.92024376045111 } },
  "HEM280": { kind: "ISection", h: 310, b: 288, tw: 18.5, tf: 33, r: 24,
    props: { iz: 131600000, welY: 2550000, welZ: 914000, wplY: 2970000, wplZ: 1420000, avZ: 5735, it: 11300000, iw: 5590000000000, iRadY: 128.3712065327216, iRadZ: 74.04953297174353 } },
  "HEM300": { kind: "ISection", h: 340, b: 310, tw: 21, tf: 39, r: 27,
    props: { iz: 194000000, welY: 3480000, welZ: 1250000, wplY: 4080000, wplZ: 1950000, avZ: 7140, it: 19300000, iw: 10290000000000, iRadY: 139.77823076351888, iRadZ: 80.01649994861312 } },
  "SHS80X80X4": { kind: "Shs", h: 80, b: 80, tw: 4, tf: 4, r: 4,
    props: { iz: 1150000, welY: 28700, welZ: 28700, wplY: 34100, wplZ: 34100, avZ: 585, it: 1820000, iw: 0, iRadY: 31.35133143753201, iRadZ: 31.35133143753201 } },
  "SHS100X100X5": { kind: "Shs", h: 100, b: 100, tw: 5, tf: 5, r: 5,
    props: { iz: 2930000, welY: 58600, welZ: 58600, wplY: 69600, wplZ: 69600, avZ: 935, it: 4670000, iw: 0, iRadY: 39.583391969184454, iRadZ: 39.583391969184454 } },
  "SHS120X120X5": { kind: "Shs", h: 120, b: 120, tw: 5, tf: 5, r: 5,
    props: { iz: 5180000, welY: 86300, welZ: 86300, wplY: 102000, wplZ: 102000, avZ: 1135, it: 8180000, iw: 0, iRadY: 47.76963811869616, iRadZ: 47.76963811869616 } },
  "SHS150X150X6": { kind: "Shs", h: 150, b: 150, tw: 6, tf: 6, r: 6,
    props: { iz: 12000000, welY: 160000, welZ: 160000, wplY: 189000, wplZ: 189000, avZ: 1670, it: 19000000, iw: 0, iRadY: 59.94008985026203, iRadZ: 59.94008985026203 } },
  "SHS200X200X8": { kind: "Shs", h: 200, b: 200, tw: 8, tf: 8, r: 8,
    props: { iz: 37200000, welY: 372000, welZ: 372000, wplY: 440000, wplZ: 440000, avZ: 2940, it: 58800000, iw: 0, iRadY: 79.53949089757174, iRadZ: 79.53949089757174 } },
  "SHS250X250X10": { kind: "Shs", h: 250, b: 250, tw: 10, tf: 10, r: 10,
    props: { iz: 90600000, welY: 725000, welZ: 725000, wplY: 860000, wplZ: 860000, avZ: 4550, it: 143000000, iw: 0, iRadY: 99.779977731226, iRadZ: 99.779977731226 } },
  "SHS300X300X10": { kind: "Shs", h: 300, b: 300, tw: 10, tf: 10, r: 10,
    props: { iz: 157000000, welY: 1050000, welZ: 1050000, wplY: 1240000, wplZ: 1240000, avZ: 5500, it: 247000000, iw: 0, iRadY: 119.46852000726916, iRadZ: 119.46852000726916 } },
  "RHS100X50X4": { kind: "Rhs", h: 100, b: 50, tw: 4, tf: 4, r: 4,
    props: { iz: 553000, welY: 33800, welZ: 22100, wplY: 41500, wplZ: 24600, avZ: 733.3333333333334, it: 1220000, iw: 0, iRadY: 39.19647479510927, iRadZ: 22.421580513587188 } },
  "RHS120X60X5": { kind: "Rhs", h: 120, b: 60, tw: 5, tf: 5, r: 5,
    props: { iz: 1180000, welY: 60200, welZ: 39400, wplY: 74100, wplZ: 43800, avZ: 1113.3333333333333, it: 2680000, iw: 0, iRadY: 46.49383450207766, iRadZ: 26.581700967908457 } },
  "RHS150X100X6": { kind: "Rhs", h: 150, b: 100, tw: 6, tf: 6, r: 6,
    props: { iz: 5480000, welY: 139000, welZ: 110000, wplY: 165000, wplZ: 126000, avZ: 1686, it: 11300000, iw: 0, iRadY: 60.83640041667787, iRadZ: 44.16081901349952 } },
  "RHS200X100X8": { kind: "Rhs", h: 200, b: 100, tw: 8, tf: 8, r: 8,
    props: { iz: 8830000, welY: 259000, welZ: 177000, wplY: 316000, wplZ: 198000, avZ: 2880, it: 22600000, iw: 0, iRadY: 77.42977702647974, iRadZ: 45.21041341860835 } },
  "RHS250X150X8": { kind: "Rhs", h: 250, b: 150, tw: 8, tf: 8, r: 8,
    props: { iz: 28100000, welY: 517000, welZ: 375000, wplY: 618000, wplZ: 432000, avZ: 3650, it: 65000000, iw: 0, iRadY: 105.17434970379631, iRadZ: 69.36601354854146 } },
  "RHS300X200X10": { kind: "Rhs", h: 300, b: 200, tw: 10, tf: 10, r: 10,
    props: { iz: 72200000, welY: 960000, welZ: 722000, wplY: 1140000, wplZ: 831000, avZ: 5460, it: 152000000, iw: 0, iRadY: 125.79418040663019, iRadZ: 89.07337387831413 } },
  "CHS424X32": { kind: "Chs", h: 42.4, b: 42.4, tw: 3.2, tf: 3.2, r: 0,
    props: { iz: 80000, welY: 3770, welZ: 3770, wplY: 5040, wplZ: 5040, avZ: 250.82819031282705, it: 160000, iw: 0, iRadY: 14.249409997581928, iRadZ: 14.249409997581928 } },
  "CHS483X32": { kind: "Chs", h: 48.3, b: 48.3, tw: 3.2, tf: 3.2, r: 0,
    props: { iz: 122000, welY: 5050, welZ: 5050, wplY: 6750, wplZ: 6750, avZ: 288.3887568825144, it: 244000, iw: 0, iRadY: 16.41084011527695, iRadZ: 16.41084011527695 } },
  "CHS603X40": { kind: "Chs", h: 60.3, b: 60.3, tw: 4, tf: 4, r: 0,
    props: { iz: 295000, welY: 9780, welZ: 9780, wplY: 13100, wplZ: 13100, avZ: 450.09017906388004, it: 590000, iw: 0, iRadY: 20.42684535887559, iRadZ: 20.42684535887559 } },
  "CHS761X50": { kind: "Chs", h: 76.1, b: 76.1, tw: 5, tf: 5, r: 0,
    props: { iz: 737000, welY: 19400, welZ: 19400, wplY: 26000, wplZ: 26000, avZ: 713.0141450516911, it: 1470000, iw: 0, iRadY: 25.652206811222193, iRadZ: 25.652206811222193 } },
  "CHS889X50": { kind: "Chs", h: 88.9, b: 88.9, tw: 5, tf: 5, r: 0,
    props: { iz: 1210000, welY: 27200, welZ: 27200, wplY: 36500, wplZ: 36500, avZ: 840.3380995252074, it: 2420000, iw: 0, iRadY: 30.276503540974915, iRadZ: 30.276503540974915 } },
  "CHS1143X63": { kind: "Chs", h: 114.3, b: 114.3, tw: 6.3, tf: 6.3, r: 0,
    props: { iz: 3260000, welY: 57100, welZ: 57100, wplY: 76500, wplZ: 76500, avZ: 1362.3663128666242, it: 6520000, iw: 0, iRadY: 39.03030215078162, iRadZ: 39.03030215078162 } },
  "CHS1397X80": { kind: "Chs", h: 139.7, b: 139.7, tw: 8, tf: 8, r: 0,
    props: { iz: 7660000, welY: 110000, welZ: 110000, wplY: 147000, wplZ: 147000, avZ: 2107.2114465366944, it: 15320000, iw: 0, iRadY: 48.10612638500831, iRadZ: 48.10612638500831 } },
  "CHS1683X80": { kind: "Chs", h: 168.3, b: 168.3, tw: 8, tf: 8, r: 0,
    props: { iz: 14000000, welY: 166000, welZ: 166000, wplY: 222000, wplZ: 222000, avZ: 2565.5776826413526, it: 28000000, iw: 0, iRadY: 58.94018501353114, iRadZ: 58.94018501353114 } },
  "CHS2191X10": { kind: "Chs", h: 219.1, b: 219.1, tw: 10, tf: 10, r: 0,
    props: { iz: 38700000, welY: 353000, welZ: 353000, wplY: 473000, wplZ: 473000, avZ: 4182.591904455009, it: 77400000, iw: 0, iRadY: 76.74901275524077, iRadZ: 76.74901275524077 } },
  "CHS273X10": { kind: "Chs", h: 273, b: 273, tw: 10, tf: 10, r: 0,
    props: { iz: 76800000, welY: 563000, welZ: 563000, wplY: 754000, wplZ: 754000, avZ: 5258.479319756222, it: 154000000, iw: 0, iRadY: 96.42520844283693, iRadZ: 96.42520844283693 } },
  "CHS3239X125": { kind: "Chs", h: 323.9, b: 323.9, tw: 12.5, tf: 12.5, r: 0,
    props: { iz: 155000000, welY: 957000, welZ: 957000, wplY: 1280000, wplZ: 1280000, avZ: 7766.761222884493, it: 310000000, iw: 0, iRadY: 112.71609482583614, iRadZ: 112.71609482583614 } },
  "CHS4064X16": { kind: "Chs", h: 406.4, b: 406.4, tw: 16, tf: 16, r: 0,
    props: { iz: 395000000, welY: 1940000, welZ: 1940000, wplY: 2600000, wplZ: 2600000, avZ: 12477.747538404596, it: 790000000, iw: 0, iRadY: 141.96147795965564, iRadZ: 141.96147795965564 } },
  "UNP80": { kind: "Channel", h: 80, b: 45, tw: 6, tf: 8, r: 8,
    props: { iz: 194000, welY: 26500, welZ: 6360, wplY: 31000, wplZ: 11200, avZ: 480, it: 29500, iw: 1120000000, iRadY: 31.042492870843404, iRadZ: 13.280197150781925 } },
  "UNP100": { kind: "Channel", h: 100, b: 50, tw: 6, tf: 8.5, r: 8.5,
    props: { iz: 293000, welY: 41200, welZ: 8490, wplY: 48400, wplZ: 14800, avZ: 600, it: 39100, iw: 2520000000, iRadY: 39.063101847215435, iRadZ: 14.732176927970864 } },
  "UNP120": { kind: "Channel", h: 120, b: 55, tw: 7, tf: 9, r: 9,
    props: { iz: 432000, welY: 60700, welZ: 11100, wplY: 71900, wplZ: 19300, avZ: 840, it: 57900, iw: 4950000000, iRadY: 46.272848092463846, iRadZ: 15.941067939721716 } },
  "UNP140": { kind: "Channel", h: 140, b: 60, tw: 7, tf: 10, r: 10,
    props: { iz: 627000, welY: 86400, welZ: 14800, wplY: 103000, wplZ: 25100, avZ: 980, it: 84600.00000000001, iw: 9120000000, iRadY: 54.45811486371709, iRadZ: 17.531484283324975 } },
  "UNP160": { kind: "Channel", h: 160, b: 65, tw: 7.5, tf: 10.5, r: 10.5,
    props: { iz: 853000, welY: 116000, welZ: 18300, wplY: 138000, wplZ: 31300, avZ: 1200, it: 110000, iw: 15400000000, iRadY: 62.08193510729725, iRadZ: 18.852497624099218 } },
  "UNP180": { kind: "Channel", h: 180, b: 70, tw: 8, tf: 11, r: 11,
    props: { iz: 1140000, welY: 150000, welZ: 22400, wplY: 180000, wplZ: 38400, avZ: 1440, it: 145000, iw: 24300000000, iRadY: 69.43650748294137, iRadZ: 20.177781274036477 } },
  "UNP200": { kind: "Channel", h: 200, b: 75, tw: 8.5, tf: 11.5, r: 11.5,
    props: { iz: 1480000, welY: 191000, welZ: 27000, wplY: 228000, wplZ: 46400, avZ: 1700, it: 184000, iw: 36700000000, iRadY: 77.01738127613493, iRadZ: 21.438920896177272 } },
  "UNP220": { kind: "Channel", h: 220, b: 80, tw: 9, tf: 12.5, r: 12.5,
    props: { iz: 1970000, welY: 245000, welZ: 33600, wplY: 292000, wplZ: 57400, avZ: 1980, it: 245000, iw: 55500000000, iRadY: 84.80868687218283, iRadZ: 22.95077270843922 } },
  "UNP240": { kind: "Channel", h: 240, b: 85, tw: 9.5, tf: 13, r: 13,
    props: { iz: 2480000, welY: 300000, welZ: 39600, wplY: 358000, wplZ: 67800, avZ: 2280, it: 294000, iw: 79000000000, iRadY: 92.2531208028885, iRadZ: 24.2133933201369 } },
  "UNP260": { kind: "Channel", h: 260, b: 90, tw: 10, tf: 14, r: 14,
    props: { iz: 3170000, welY: 371000, welZ: 47700, wplY: 442000, wplZ: 81200, avZ: 2600, it: 395000, iw: 109000000000, iRadY: 99.79317454590976, iRadZ: 25.592160473198632 } },
  "UNP280": { kind: "Channel", h: 280, b: 95, tw: 10, tf: 15, r: 15,
    props: { iz: 3990000, welY: 448000, welZ: 57200, wplY: 532000, wplZ: 96900, avZ: 2800, it: 510000, iw: 148000000000, iRadY: 108.54659818477008, iRadZ: 27.360425262486146 } },
  "UNP300": { kind: "Channel", h: 300, b: 100, tw: 10, tf: 16, r: 16,
    props: { iz: 4950000, welY: 535000, welZ: 67800, wplY: 633000, wplZ: 114000, avZ: 3000, it: 630000, iw: 200000000000, iRadY: 116.86086849340978, iRadZ: 29.01442287369986 } },
};
