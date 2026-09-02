#!/usr/bin/env node
/**
 * genereer-profieldata.mjs — genereert doorsnedegrootheden van staalprofielen
 * UIT genormeerde basisgeometrie, in plaats van hele tabellen over te typen.
 *
 * Waarom: overtypen van afgeleide grootheden (Av;z, It, Iw, Wpl) is de
 * foutgevoeligste stap in een profieldatabase. Basisgeometrie (h, b, tw, tf, r
 * resp. h, b, t resp. d, t) is genormeerd, kort en goed te controleren; al het
 * andere volgt uit gesloten formules die hieronder expliciet staan.
 *
 * Gebruik:
 *   node scripts/genereer-profieldata.mjs --valideer
 *       Herberekent alle profielen die al in profiles.json staan en rapporteert
 *       de afwijking per grootheid en per reeks. Dit is het bewijs dat de
 *       formules kloppen.
 *   node scripts/genereer-profieldata.mjs --schrijf
 *       Schrijft de NIEUWE profielen naar
 *       src-tauri/crates/steel-profiles/data/profielen-uitbreiding.json.
 *   node scripts/genereer-profieldata.mjs --zelfcontrole
 *       Interne consistentiecontrole op de uitbreiding.
 *   zonder vlaggen: alle drie.
 *
 * Dit script SCHRIJFT NOOIT in profiles.json.
 *
 * Geen dependencies; alleen Node-ingebouwde modules.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const wortel = join(hier, "..");
const bestaandPad = join(
  wortel, "src-tauri", "crates", "steel-profiles", "data", "profiles.json",
);
const uitbreidingPad = join(
  wortel, "src-tauri", "crates", "steel-profiles", "data",
  "profielen-uitbreiding.json",
);

/* ==================================================================== *
 * 1. Meetkundige hulpgrootheden voor de walsuitronding                 *
 * ==================================================================== *
 *
 * Een walsuitronding (of buitenhoekafronding) is het gebied tussen een
 * scherpe hoek r x r en de kwartcirkel met straal r. Alle bijdragen aan
 * A, I, Wpl en het zwaartepunt volgen uit drie exacte momenten van dat
 * gebied, gemeten vanaf de SCHERPE hoek (coordinaat u loopt van 0 aan de
 * scherpe hoek tot r bij het middelpunt van de boog):
 *
 *   opp        = INT dA      = r^2 * (1 - pi/4)
 *   statisch   = INT u dA    = r^3 * (5/6 - pi/4)
 *   traagheid  = INT u^2 dA  = r^4 * (1 - 5*pi/16)
 *
 * Afleiding: vierkant [0,r]^2 minus kwartschijf met middelpunt (r,r).
 * Controle (zie zelftest onderaan): met r = h/2 = b/2 levert de afgeronde
 * rechthoek exact de cirkel op (I = pi*r^4/4).
 */
const K_A = 1 - Math.PI / 4;           // 0.2146018...
const K_S = 5 / 6 - Math.PI / 4;       // 0.0479351...
const K_I = 1 - (5 * Math.PI) / 16;    // 0.0182525...
/** Zwaartepunt van de uitronding, gemeten vanaf de scherpe hoek. */
const K_C = K_S / K_A;                 // 0.2233730...

/** Oppervlak van EEN uitronding. */
const uitrondingOpp = (r) => K_A * r * r;

/**
 * Traagheidsmoment van EEN uitronding om een as op afstand `d` van de scherpe
 * hoek, waarbij het materiaal VAN die as AF ligt (d = h_w/2 bij een I-profiel:
 * de scherpe hoek zit op h_w/2 van de neutrale lijn, de uitronding ligt naar
 * binnen). Volgt uit INT (d - u)^2 dA.
 */
function uitrondingTraagheidNaarBinnen(r, d) {
  return K_I * r ** 4 - 2 * d * K_S * r ** 3 + d * d * K_A * r * r;
}

/**
 * Idem, maar het materiaal ligt VAN de as AF gerekend naar BUITEN
 * (d = t_w/2 bij Iz van een I-profiel). Volgt uit INT (d + u)^2 dA.
 */
function uitrondingTraagheidNaarBuiten(r, d) {
  return K_I * r ** 4 + 2 * d * K_S * r ** 3 + d * d * K_A * r * r;
}

/** Statisch moment van EEN uitronding om een as op afstand d, naar binnen. */
const uitrondingStatischNaarBinnen = (r, d) => d * K_A * r * r - K_S * r ** 3;
/** Statisch moment van EEN uitronding om een as op afstand d, naar buiten. */
const uitrondingStatischNaarBuiten = (r, d) => d * K_A * r * r + K_S * r ** 3;

/* -------------------------------------------------------------------- *
 * Afgeronde rechthoek (gebruikt voor koker-buitenkant en -binnenkant)   *
 * -------------------------------------------------------------------- */

/** Oppervlak van een rechthoek B x H met hoekstraal R. */
const rechthoekOpp = (B, H, R) => B * H - 4 * uitrondingOpp(R);

/**
 * Traagheidsmoment van een rechthoek B x H met hoekstraal R om de as
 * evenwijdig aan B (dus met H^3). De vier uitrondingen liggen op afstand H/2
 * van de neutrale lijn, naar binnen gerekend.
 */
const rechthoekTraagheid = (B, H, R) =>
  (B * H ** 3) / 12 - 4 * uitrondingTraagheidNaarBinnen(R, H / 2);

/** Plastisch weerstandsmoment van een afgeronde rechthoek B x H, straal R. */
const rechthoekWpl = (B, H, R) =>
  2 * ((B * H * H) / 8 - 2 * uitrondingStatischNaarBinnen(R, H / 2));

/** Omtrek van een afgeronde rechthoek B x H met straal R. */
const rechthoekOmtrek = (B, H, R) => 2 * (B + H) - (8 - 2 * Math.PI) * R;

/* ==================================================================== *
 * 2. Knikkrommen — EN 1993-1-1 tabel 6.2                               *
 * ==================================================================== */

/**
 * Knikkromme volgens EN 1993-1-1 tabel 6.2 ("Keuze knikkromme voor een
 * doorsnede"), voor staalsoorten t/m S460 zoals de rest van de database.
 *
 * Gewalste I/H-profielen:
 *   h/b > 1,2  en  tf <= 40 mm   -> y-y: a   z-z: b
 *   h/b > 1,2  en  40 < tf <= 100 -> y-y: b   z-z: c
 *   h/b <= 1,2 en  tf <= 100 mm  -> y-y: b   z-z: c
 *   h/b <= 1,2 en  tf > 100 mm   -> y-y: d   z-z: d
 * U-, T- en massieve doorsneden (tabel 6.2, voorlaatste regel) -> c en c.
 * Warmgewalste holle doorsneden (koker en buis) -> a en a.
 * (Koudgevormde holle doorsneden zouden c/c zijn; die staan niet in deze
 *  database — alle koker- en buisreeksen hier zijn warmgewalst.)
 */
function knikkrommen(kind, g) {
  if (kind === "ISection") {
    const hb = g.h / g.b;
    if (hb > 1.2) {
      if (g.tf <= 40) return { y_axis: "a", z_axis: "b" };
      if (g.tf <= 100) return { y_axis: "b", z_axis: "c" };
      return { y_axis: "d", z_axis: "d" };
    }
    if (g.tf <= 100) return { y_axis: "b", z_axis: "c" };
    return { y_axis: "d", z_axis: "d" };
  }
  // U-profielen: tabel 6.2, regel "U-, T- en massieve doorsneden".
  if (kind === "Channel") return { y_axis: "c", z_axis: "c" };
  // Warmgewalste kokers en buizen: tabel 6.2, regel "warmgewalst".
  return { y_axis: "a", z_axis: "a" };
}

/* ==================================================================== *
 * 3. Torsieconstante van open gewalste doorsneden                      *
 * ==================================================================== */

/**
 * It van een gewalst I/H-profiel. Basis is de dunwandige som (1/3)*SOM(b*t^3);
 * de uitrondingen leveren een aanzienlijke extra bijdrage die met de
 * standaardbenadering van El Darwish & Johnston wordt meegenomen. Deze
 * benadering ligt op alle gecontroleerde profielen binnen ~1% van de
 * tabelwaarde (zie --valideer).
 *
 *   It = (1/3)*(2*b*tf^3 + h_w*tw^3) + 2*alpha*D^4 - 0,420*tf^4
 *   D  = ((tf + r)^2 + tw*(r + tw/4)) / (2r + tf)
 */
function itIProfiel({ h, b, tw, tf, r }) {
  const hw = h - 2 * tf;
  const basis = (2 * b * tf ** 3 + hw * tw ** 3) / 3;
  if (r <= 0) return basis;
  const q = tw / tf;
  const p = r / tf;
  const alpha =
    -0.042 + 0.2204 * q + 0.1355 * p - 0.0865 * p * q - 0.0725 * q * q;
  const D = ((tf + r) ** 2 + tw * (r + tw / 4)) / (2 * r + tf);
  return basis + 2 * alpha * D ** 4 - 0.42 * tf ** 4;
}

/**
 * It van een gewalst U-profiel. Zelfde opbouw, maar een U heeft slechts TWEE
 * uitrondingen in plaats van vier en twee vrije flensuiteinden in plaats van
 * vier; de uitrondings- en uiteindetermen halveren daarom.
 */
function itUProfiel({ h, b, tw, tf, r }) {
  const hw = h - 2 * tf;
  const basis = (2 * b * tf ** 3 + hw * tw ** 3) / 3;
  if (r <= 0) return basis;
  const q = tw / tf;
  const p = r / tf;
  const alpha =
    -0.042 + 0.2204 * q + 0.1355 * p - 0.0865 * p * q - 0.0725 * q * q;
  const D = ((tf + r) ** 2 + tw * (r + tw / 4)) / (2 * r + tf);
  return basis + alpha * D ** 4 - 0.21 * tf ** 4;
}

/* ==================================================================== *
 * 4. Doorsnedegrootheden per profieltype                               *
 * ==================================================================== */

/** Afschuifoppervlak-ondergrens uit EN 1993-1-1 §6.2.6(3): eta * hw * tw. */
const ETA = 1.0; // conservatief; NEN-EN 1993-1-1 NB laat eta = 1,0 toe

/**
 * Gewalst I/H-profiel (dubbelsymmetrisch).
 * Geometrie: h (totale hoogte), b (flensbreedte), tw (lijf), tf (flens),
 * r (walsuitronding lijf-flens).
 */
function berekenIProfiel(g) {
  const { h, b, tw, tf, r } = g;
  const hw = h - 2 * tf;              // vrije lijfhoogte
  const nOpp = 4 * uitrondingOpp(r);  // vier uitrondingen

  // A = twee flenzen + lijf + vier uitrondingen
  const A = 2 * b * tf + hw * tw + nOpp;

  // Iy: volle rechthoek b*h minus de twee uitsparingen naast het lijf,
  // plus de vier uitrondingen (Steiner zit in uitrondingTraagheid...).
  const Iy =
    (b * h ** 3 - (b - tw) * hw ** 3) / 12 +
    4 * uitrondingTraagheidNaarBinnen(r, hw / 2);

  // Iz: twee flenzen om hun eigen as + lijf + vier uitrondingen naar buiten.
  const Iz =
    (2 * tf * b ** 3) / 12 +
    (hw * tw ** 3) / 12 +
    4 * uitrondingTraagheidNaarBuiten(r, tw / 2);

  const WelY = Iy / (h / 2);
  const WelZ = Iz / (b / 2);

  // Wpl;y = 2 * statisch moment van de bovenste helft om de middenlijn.
  const WplY =
    2 *
    ((b * tf * (h - tf)) / 2 +
      (tw * hw * hw) / 8 +
      2 * uitrondingStatischNaarBinnen(r, hw / 2));

  // Wpl;z = 2 * statisch moment van de rechterhelft om het lijfmidden.
  const WplZ =
    2 *
    ((tf * b * b) / 4 +
      (hw * tw * tw) / 8 +
      2 * uitrondingStatischNaarBuiten(r, tw / 2));

  // EN 1993-1-1 §6.2.6(3): Av;z = A - 2*b*tf + (tw + 2r)*tf,
  // met ondergrens eta*hw*tw. Av;y = A - SOM(hw*tw) = 2*b*tf.
  const AvZ = Math.max(A - 2 * b * tf + (tw + 2 * r) * tf, ETA * hw * tw);
  const AvY = 2 * b * tf;

  const It = itIProfiel(g);
  // Welvingsconstante van een dubbelsymmetrisch I-profiel:
  // Iw = Iz * hs^2 / 4 met hs = h - tf (hart-op-hart flenzen).
  const Iw = (Iz * (h - tf) ** 2) / 4;

  return props(g, { A, Iy, Iz, WelY, WelZ, WplY, WplZ, AvY, AvZ, It, Iw });
}

/**
 * U-profiel met evenwijdige flenzen (UPE) of nagenoeg evenwijdig (UNP).
 * Het lijf staat links; de flenzen steken naar rechts uit. De zwakke as ligt
 * dus niet in het midden: het zwaartepunt zit op z0 vanaf de lijfrug.
 * De flensschuinte van UNP wordt NIET gemodelleerd (zie verantwoording).
 */
function berekenUProfiel(g) {
  const { h, b, tw, tf, r } = g;
  const hw = h - 2 * tf;
  const oppUitr = uitrondingOpp(r);
  const A = tw * h + 2 * (b - tw) * tf + 2 * oppUitr;

  // Sterke as: symmetrisch om de halve hoogte.
  const Iy =
    (b * h ** 3 - (b - tw) * hw ** 3) / 12 +
    2 * uitrondingTraagheidNaarBinnen(r, hw / 2);
  const WelY = Iy / (h / 2);
  const WplY =
    2 *
    ((b * tf * (h - tf)) / 2 +
      (tw * hw * hw) / 8 +
      uitrondingStatischNaarBinnen(r, hw / 2));

  // Zwakke as: eerst het zwaartepunt z0 vanaf de lijfrug (z = 0).
  const zLijf = tw / 2;
  const zFlens = tw + (b - tw) / 2;
  const zUitr = tw + K_C * r;
  const z0 =
    (tw * h * zLijf + 2 * (b - tw) * tf * zFlens + 2 * oppUitr * zUitr) / A;

  // Eigen traagheidsmoment van EEN uitronding om zijn eigen zwaartepunt.
  const iUitrEigen = K_I * r ** 4 - K_A * r * r * (K_C * r) ** 2;

  const Iz =
    (h * tw ** 3) / 12 + tw * h * (zLijf - z0) ** 2 +
    2 * (((b - tw) ** 3 * tf) / 12 + (b - tw) * tf * (zFlens - z0) ** 2) +
    2 * (iUitrEigen + oppUitr * (zUitr - z0) ** 2);

  // Elastisch weerstandsmoment zwakke as: de MAATGEVENDE (kleinste) waarde,
  // dus gedeeld door de grootste randafstand.
  const WelZ = Iz / Math.max(z0, b - z0);

  // Wpl;z: de plastische neutrale lijn ligt waar het oppervlak zich haalveert.
  // De breedtefunctie w(z) (totale materiaalhoogte op positie z) is stuksgewijs
  // maar met een boog erin; numeriek integreren is hier eenvoudiger EN
  // nauwkeuriger dan de stuksgewijze primitieve met arcsin-termen.
  const WplZ = wplZUProfiel(g);

  // EN 1993-1-1 §6.2.6(3) voor U-profielen: Av;z = A - 2*b*tf + (tw + r)*tf.
  const AvZ = Math.max(A - 2 * b * tf + (tw + r) * tf, ETA * hw * tw);
  const AvY = 2 * b * tf;

  const It = itUProfiel(g);

  // Welvingsconstante van een U-profiel (standaardformule voor een kanaal),
  // met b' de flensuitkraging vanaf het lijfhart en hs de flenshartafstand:
  //   Iw = (tf * b'^3 * hs^2 / 12) * (3*b'*tf + 2*hs*tw)/(6*b'*tf + hs*tw)
  const bAcc = b - tw / 2;
  const hs = h - tf;
  const Iw =
    ((tf * bAcc ** 3 * hs * hs) / 12) *
    ((3 * bAcc * tf + 2 * hs * tw) / (6 * bAcc * tf + hs * tw));

  return props(g, { A, Iy, Iz, WelY, WelZ, WplY, WplZ, AvY, AvZ, It, Iw }, z0);
}

/**
 * Breedtefunctie van een U-profiel: totale materiaalhoogte op horizontale
 * positie z (z = 0 aan de lijfrug). Gebruikt voor Wpl;z.
 */
function uBreedte({ h, b, tw, tf, r }, z) {
  if (z <= tw) return h;
  if (z >= b) return 0;
  let w = 2 * tf;
  if (z < tw + r) {
    // Uitrondingdikte op positie z: r - sqrt(r^2 - (z - tw - r)^2).
    const u = z - tw - r;
    w += 2 * (r - Math.sqrt(Math.max(0, r * r - u * u)));
  }
  return w;
}

/** Wpl;z van een U-profiel via numerieke integratie van de breedtefunctie. */
function wplZUProfiel(g) {
  const N = 200000;
  const dz = g.b / N;
  const w = new Float64Array(N);
  let A = 0;
  for (let i = 0; i < N; i += 1) {
    w[i] = uBreedte(g, (i + 0.5) * dz);
    A += w[i] * dz;
  }
  // Plastische neutrale lijn: cumulatief oppervlak = A/2.
  let cum = 0;
  let zPl = 0;
  for (let i = 0; i < N; i += 1) {
    const volgend = cum + w[i] * dz;
    if (volgend >= A / 2) {
      zPl = i * dz + ((A / 2 - cum) / (w[i] * dz)) * dz;
      break;
    }
    cum = volgend;
  }
  let S = 0;
  for (let i = 0; i < N; i += 1) {
    S += w[i] * Math.abs((i + 0.5) * dz - zPl) * dz;
  }
  return S;
}

/**
 * Warmgewalste rechthoekige of vierkante koker (SHS/RHS).
 * Conform EN 10210-2: buitenhoekstraal 1,5*t, binnenhoekstraal 1,0*t.
 * Die combinatie is geometrisch niet exact (de wand is in de hoek dikker),
 * maar het is de normconventie waarmee de gepubliceerde tabellen zijn
 * opgesteld; de spotchecks onderaan bevestigen dat.
 */
function berekenKoker(g) {
  const { h, b, t } = g;
  const ro = 1.5 * t;
  const ri = 1.0 * t;
  const bi = b - 2 * t;
  const hi = h - 2 * t;

  const A = rechthoekOpp(b, h, ro) - rechthoekOpp(bi, hi, ri);
  const Iy = rechthoekTraagheid(b, h, ro) - rechthoekTraagheid(bi, hi, ri);
  const Iz = rechthoekTraagheid(h, b, ro) - rechthoekTraagheid(hi, bi, ri);
  const WelY = Iy / (h / 2);
  const WelZ = Iz / (b / 2);
  const WplY = rechthoekWpl(b, h, ro) - rechthoekWpl(bi, hi, ri);
  const WplZ = rechthoekWpl(h, b, ro) - rechthoekWpl(hi, bi, ri);

  // Av;z = A*h/(b+h) (afschuiving evenwijdig aan de hoogte), Av;y = A*b/(b+h).
  const AvZ = (A * h) / (b + h);
  const AvY = (A * b) / (b + h);

  // It van een GESLOTEN doorsnede volgens Bredt: It = 4*Am^2*t/Um, met Am het
  // door de wandmiddellijn omsloten oppervlak en Um de lengte van die lijn.
  const rm = (ro + ri) / 2;
  const Am = rechthoekOpp(b - t, h - t, rm);
  const Um = rechthoekOmtrek(b - t, h - t, rm);
  const It = (4 * Am * Am * t) / Um;

  // Iw van een gesloten koker is verwaarloosbaar t.o.v. de St.-Venanttorsie
  // en wordt in EN 1993-1-1 voor kokers niet gebruikt -> 0.
  const Iw = 0;

  return props(g, { A, Iy, Iz, WelY, WelZ, WplY, WplZ, AvY, AvZ, It, Iw });
}

/** Warmgewalste ronde buis (CHS). Geometrie: d (uitwendig) en t. */
function berekenBuis(g) {
  const d = g.h; // h = b = uitwendige diameter
  const { t } = g;
  const di = d - 2 * t;
  const A = (Math.PI / 4) * (d * d - di * di);
  const I = (Math.PI / 64) * (d ** 4 - di ** 4);
  const Wel = (2 * I) / d;
  const Wpl = (d ** 3 - di ** 3) / 6;
  // It van een dunwandige gesloten ronde buis = polair traagheidsmoment = 2*I.
  const It = 2 * I;
  const Av = (2 * A) / Math.PI;
  return props(g, {
    A, Iy: I, Iz: I, WelY: Wel, WelZ: Wel, WplY: Wpl, WplZ: Wpl,
    AvY: Av, AvZ: Av, It, Iw: 0, // Iw van een ronde buis is exact 0
  });
}

/** Zet de berekende grootheden om in het JSON-formaat van profiles.json. */
function props(g, v, z0) {
  const o = {
    area_mm2: v.A,
    iy_mm4: v.Iy,
    iz_mm4: v.Iz,
    wel_y_mm3: v.WelY,
    wel_z_mm3: v.WelZ,
    wpl_y_mm3: v.WplY,
    wpl_z_mm3: v.WplZ,
    av_y_mm2: v.AvY,
    av_z_mm2: v.AvZ,
    it_mm4: v.It,
    iw_mm6: v.Iw,
    iy_radius_mm: Math.sqrt(v.Iy / v.A),
    iz_radius_mm: Math.sqrt(v.Iz / v.A),
    h_mm: g.h,
    b_mm: g.b,
    tw_mm: g.tw ?? g.t,
    tf_mm: g.tf ?? g.t,
    r_mm: g.r ?? 0,
  };
  if (z0 !== undefined) o._z0_mm = z0; // alleen voor interne controle
  return o;
}

/** Rekenkern per profielsoort. */
function bereken(kind, g) {
  if (kind === "ISection") return berekenIProfiel(g);
  if (kind === "Channel") return berekenUProfiel(g);
  if (kind === "Shs" || kind === "Rhs") return berekenKoker(g);
  if (kind === "Chs") return berekenBuis(g);
  throw new Error(`Onbekende profielsoort: ${kind}`);
}

/* ==================================================================== *
 * 5. Brontabellen — UITSLUITEND genormeerde basisgeometrie             *
 * ==================================================================== *
 *
 * I/H en U: [naam, h, b, tw, tf, r]  (alle maten in mm)
 * Koker   : [h, b, t]                (hoekstralen volgen uit t)
 * Buis    : [d, t]
 *
 * Bronnen: EN 10365 (walsprofielreeksen IPE/HE/UPE), DIN 1026-1 (UNP),
 * DIN 1026-2 (UPE), EN 10210-2 (warmgewalste holle doorsneden).
 */

/** IPE — EN 10365. Volledig aanwezig in de database; dient ter validatie. */
const IPE = [
  ["IPE 80", 80, 46, 3.8, 5.2, 5],
  ["IPE 100", 100, 55, 4.1, 5.7, 7],
  ["IPE 120", 120, 64, 4.4, 6.3, 7],
  ["IPE 140", 140, 73, 4.7, 6.9, 7],
  ["IPE 160", 160, 82, 5.0, 7.4, 9],
  ["IPE 180", 180, 91, 5.3, 8.0, 9],
  ["IPE 200", 200, 100, 5.6, 8.5, 12],
  ["IPE 220", 220, 110, 5.9, 9.2, 12],
  ["IPE 240", 240, 120, 6.2, 9.8, 15],
  ["IPE 270", 270, 135, 6.6, 10.2, 15],
  ["IPE 300", 300, 150, 7.1, 10.7, 15],
  ["IPE 330", 330, 160, 7.5, 11.5, 18],
  ["IPE 360", 360, 170, 8.0, 12.7, 18],
  ["IPE 400", 400, 180, 8.6, 13.5, 21],
  ["IPE 450", 450, 190, 9.4, 14.6, 21],
  ["IPE 500", 500, 200, 10.2, 16.0, 21],
  ["IPE 550", 550, 210, 11.1, 17.2, 24],
  ["IPE 600", 600, 220, 12.0, 19.0, 24],
];

/** HE-A (HEA) — EN 10365, volledige reeks 100 t/m 1000. */
const HEA = [
  ["HEA 100", 96, 100, 5.0, 8.0, 12],
  ["HEA 120", 114, 120, 5.0, 8.0, 12],
  ["HEA 140", 133, 140, 5.5, 8.5, 12],
  ["HEA 160", 152, 160, 6.0, 9.0, 15],
  ["HEA 180", 171, 180, 6.0, 9.5, 15],
  ["HEA 200", 190, 200, 6.5, 10.0, 18],
  ["HEA 220", 210, 220, 7.0, 11.0, 18],
  ["HEA 240", 230, 240, 7.5, 12.0, 21],
  ["HEA 260", 250, 260, 7.5, 12.5, 24],
  ["HEA 280", 270, 280, 8.0, 13.0, 24],
  ["HEA 300", 290, 300, 8.5, 14.0, 27],
  ["HEA 320", 310, 300, 9.0, 15.5, 27],
  ["HEA 340", 330, 300, 9.5, 16.5, 27],
  ["HEA 360", 350, 300, 10.0, 17.5, 27],
  ["HEA 400", 390, 300, 11.0, 19.0, 27],
  ["HEA 450", 440, 300, 11.5, 21.0, 27],
  ["HEA 500", 490, 300, 12.0, 23.0, 27],
  ["HEA 550", 540, 300, 12.5, 24.0, 27],
  ["HEA 600", 590, 300, 13.0, 25.0, 27],
  ["HEA 650", 640, 300, 13.5, 26.0, 27],
  ["HEA 700", 690, 300, 14.5, 27.0, 27],
  ["HEA 800", 790, 300, 15.0, 28.0, 30],
  ["HEA 900", 890, 300, 16.0, 30.0, 30],
  ["HEA 1000", 990, 300, 16.5, 31.0, 30],
];

/** HE-B (HEB) — EN 10365, volledige reeks 100 t/m 1000. */
const HEB = [
  ["HEB 100", 100, 100, 6.0, 10.0, 12],
  ["HEB 120", 120, 120, 6.5, 11.0, 12],
  ["HEB 140", 140, 140, 7.0, 12.0, 12],
  ["HEB 160", 160, 160, 8.0, 13.0, 15],
  ["HEB 180", 180, 180, 8.5, 14.0, 15],
  ["HEB 200", 200, 200, 9.0, 15.0, 18],
  ["HEB 220", 220, 220, 9.5, 16.0, 18],
  ["HEB 240", 240, 240, 10.0, 17.0, 21],
  ["HEB 260", 260, 260, 10.0, 17.5, 24],
  ["HEB 280", 280, 280, 10.5, 18.0, 24],
  ["HEB 300", 300, 300, 11.0, 19.0, 27],
  ["HEB 320", 320, 300, 11.5, 20.5, 27],
  ["HEB 340", 340, 300, 12.0, 21.5, 27],
  ["HEB 360", 360, 300, 12.5, 22.5, 27],
  ["HEB 400", 400, 300, 13.5, 24.0, 27],
  ["HEB 450", 450, 300, 14.0, 26.0, 27],
  ["HEB 500", 500, 300, 14.5, 28.0, 27],
  ["HEB 550", 550, 300, 15.0, 29.0, 27],
  ["HEB 600", 600, 300, 15.5, 30.0, 27],
  ["HEB 650", 650, 300, 16.0, 31.0, 27],
  ["HEB 700", 700, 300, 17.0, 32.0, 27],
  ["HEB 800", 800, 300, 17.5, 33.0, 30],
  ["HEB 900", 900, 300, 18.5, 35.0, 30],
  ["HEB 1000", 1000, 300, 19.0, 36.0, 30],
];

/** HE-M (HEM) — EN 10365, volledige reeks 100 t/m 1000. */
const HEM = [
  ["HEM 100", 120, 106, 12.0, 20.0, 12],
  ["HEM 120", 140, 126, 12.5, 21.0, 12],
  ["HEM 140", 160, 146, 13.0, 22.0, 12],
  ["HEM 160", 180, 166, 14.0, 23.0, 15],
  ["HEM 180", 200, 186, 14.5, 24.0, 15],
  ["HEM 200", 220, 206, 15.0, 25.0, 18],
  ["HEM 220", 240, 226, 15.5, 26.0, 18],
  ["HEM 240", 270, 248, 18.0, 32.0, 21],
  ["HEM 260", 290, 268, 18.0, 32.5, 24],
  ["HEM 280", 310, 288, 18.5, 33.0, 24],
  ["HEM 300", 340, 310, 21.0, 39.0, 27],
  ["HEM 320", 359, 309, 21.0, 40.0, 27],
  ["HEM 340", 377, 309, 21.0, 40.0, 27],
  ["HEM 360", 395, 308, 21.0, 40.0, 27],
  ["HEM 400", 432, 307, 21.0, 40.0, 27],
  ["HEM 450", 478, 307, 21.0, 40.0, 27],
  ["HEM 500", 524, 306, 21.0, 40.0, 27],
  ["HEM 550", 572, 306, 21.0, 40.0, 27],
  ["HEM 600", 620, 305, 21.0, 40.0, 27],
  ["HEM 650", 668, 305, 21.0, 40.0, 27],
  ["HEM 700", 716, 304, 21.0, 40.0, 27],
  ["HEM 800", 814, 303, 21.0, 40.0, 30],
  ["HEM 900", 910, 302, 21.0, 40.0, 30],
  ["HEM 1000", 1008, 302, 21.0, 40.0, 30],
];

/** UNP — DIN 1026-1 (schuine flenzen, 8%). Alleen ter validatie. */
const UNP = [
  ["UNP 80", 80, 45, 6.0, 8.0, 8],
  ["UNP 100", 100, 50, 6.0, 8.5, 8.5],
  ["UNP 120", 120, 55, 7.0, 9.0, 9],
  ["UNP 140", 140, 60, 7.0, 10.0, 10],
  ["UNP 160", 160, 65, 7.5, 10.5, 10.5],
  ["UNP 180", 180, 70, 8.0, 11.0, 11],
  ["UNP 200", 200, 75, 8.5, 11.5, 11.5],
  ["UNP 220", 220, 80, 9.0, 12.5, 12.5],
  ["UNP 240", 240, 85, 9.5, 13.0, 13],
  ["UNP 260", 260, 90, 10.0, 14.0, 14],
  ["UNP 280", 280, 95, 10.0, 15.0, 15],
  ["UNP 300", 300, 100, 10.0, 16.0, 16],
  ["UNP 350", 350, 100, 14.0, 16.0, 16],
];

/** UPE — DIN 1026-2 (evenwijdige flenzen). Nieuwe reeks. */
const UPE = [
  ["UPE 80", 80, 50, 4.0, 7.0, 10],
  ["UPE 100", 100, 55, 4.5, 7.5, 10],
  ["UPE 120", 120, 60, 5.0, 8.0, 12],
  ["UPE 140", 140, 65, 5.0, 9.0, 12],
  ["UPE 160", 160, 70, 5.5, 9.5, 12],
  ["UPE 180", 180, 75, 5.5, 10.5, 12],
  ["UPE 200", 200, 80, 6.0, 11.0, 13],
  ["UPE 220", 220, 85, 6.5, 12.0, 13],
  ["UPE 240", 240, 90, 7.0, 12.5, 15],
  ["UPE 270", 270, 95, 7.5, 13.5, 15],
  ["UPE 300", 300, 100, 9.5, 15.0, 15],
  ["UPE 330", 330, 105, 11.0, 16.0, 18],
  ["UPE 360", 360, 110, 12.0, 17.0, 18],
  ["UPE 400", 400, 115, 13.5, 18.0, 18],
];

/** SHS warmgewalst — EN 10210-2. [maat, [wanddikten]] */
const SHS = [
  [40, [3.0, 4.0, 5.0]],
  [50, [3.0, 4.0, 5.0, 6.3]],
  [60, [3.0, 4.0, 5.0, 6.3, 8.0]],
  [70, [3.6, 4.0, 5.0, 6.3, 8.0]],
  [80, [3.6, 4.0, 5.0, 6.3, 8.0, 10.0]],
  [90, [4.0, 5.0, 6.3, 8.0, 10.0]],
  [100, [4.0, 5.0, 6.3, 8.0, 10.0, 12.5]],
  [120, [5.0, 6.3, 8.0, 10.0, 12.5]],
  [140, [5.0, 6.3, 8.0, 10.0, 12.5]],
  [150, [5.0, 6.3, 8.0, 10.0, 12.5, 16.0]],
  [160, [6.3, 8.0, 10.0, 12.5, 16.0]],
  [180, [6.3, 8.0, 10.0, 12.5, 16.0]],
  [200, [6.3, 8.0, 10.0, 12.5, 16.0, 20.0]],
  [220, [8.0, 10.0, 12.5, 16.0]],
  [250, [6.3, 8.0, 10.0, 12.5, 16.0, 20.0]],
  [260, [8.0, 10.0, 12.5, 16.0]],
  [300, [8.0, 10.0, 12.5, 16.0, 20.0]],
  [350, [8.0, 10.0, 12.5, 16.0, 20.0]],
  [400, [10.0, 12.5, 16.0, 20.0]],
];

/** RHS warmgewalst — EN 10210-2. [h, b, [wanddikten]] */
const RHS = [
  [50, 30, [3.0, 3.2, 4.0, 5.0]],
  [60, 40, [3.0, 3.2, 4.0, 5.0, 6.3]],
  [70, 50, [3.0, 3.6, 4.0, 5.0, 6.3]],
  [80, 40, [3.0, 3.2, 4.0, 5.0, 6.3, 8.0]],
  [90, 50, [3.6, 4.0, 5.0, 6.3, 8.0]],
  [100, 50, [3.0, 3.2, 4.0, 5.0, 6.3, 8.0]],
  [100, 60, [3.6, 4.0, 5.0, 6.3, 8.0]],
  [120, 60, [3.6, 4.0, 5.0, 6.3, 8.0, 10.0]],
  [120, 80, [4.0, 5.0, 6.3, 8.0, 10.0]],
  [140, 80, [4.0, 5.0, 6.3, 8.0, 10.0]],
  [150, 100, [4.0, 5.0, 6.3, 8.0, 10.0, 12.5]],
  [160, 80, [4.0, 5.0, 6.3, 8.0, 10.0, 12.5]],
  [180, 100, [5.0, 6.3, 8.0, 10.0, 12.5]],
  [200, 100, [5.0, 6.3, 8.0, 10.0, 12.5, 16.0]],
  [200, 120, [6.3, 8.0, 10.0, 12.5]],
  [250, 150, [6.3, 8.0, 10.0, 12.5, 16.0]],
  [260, 180, [8.0, 10.0, 12.5, 16.0]],
  [300, 200, [6.3, 8.0, 10.0, 12.5, 16.0]],
  [350, 250, [8.0, 10.0, 12.5, 16.0]],
  [400, 200, [8.0, 10.0, 12.5, 16.0, 20.0]],
  [450, 250, [8.0, 10.0, 12.5, 16.0, 20.0]],
  [500, 300, [10.0, 12.5, 16.0, 20.0]],
];

/** CHS warmgewalst — EN 10210-2. [d, [wanddikten]] */
const CHS = [
  [33.7, [2.6, 3.2, 4.0]],
  [42.4, [2.6, 3.2, 4.0]],
  [48.3, [3.2, 4.0, 5.0]],
  [60.3, [3.2, 4.0, 5.0, 6.3]],
  [76.1, [3.2, 4.0, 5.0, 6.3, 8.0]],
  [88.9, [3.2, 4.0, 5.0, 6.3, 8.0]],
  [114.3, [3.6, 4.0, 5.0, 6.3, 8.0, 10.0]],
  [139.7, [4.0, 5.0, 6.3, 8.0, 10.0, 12.5]],
  [168.3, [4.0, 5.0, 6.3, 8.0, 10.0, 12.5]],
  [193.7, [5.0, 6.3, 8.0, 10.0, 12.5, 16.0]],
  [219.1, [5.0, 6.3, 8.0, 10.0, 12.5, 16.0, 20.0]],
  [244.5, [6.3, 8.0, 10.0, 12.5, 16.0, 20.0]],
  [273.0, [6.3, 8.0, 10.0, 12.5, 16.0, 20.0]],
  [323.9, [6.3, 8.0, 10.0, 12.5, 16.0, 20.0]],
  [355.6, [8.0, 10.0, 12.5, 16.0, 20.0]],
  [406.4, [8.0, 10.0, 12.5, 16.0, 20.0]],
  [457.0, [10.0, 12.5, 16.0, 20.0]],
  [508.0, [10.0, 12.5, 16.0, 20.0]],
];

/* ==================================================================== *
 * 6. Van brontabel naar profielrecords                                 *
 * ==================================================================== */

/** Maatgetal netjes formatteren: 4.0 -> "4", 6.3 -> "6.3", 273.0 -> "273". */
const fmt = (x) => String(Number(x.toFixed(2)));

function openProfiel(kind, [name, h, b, tw, tf, r]) {
  return { name, kind, geometry: { h, b, tw, tf, r } };
}

function kokerProfiel(kind, h, b, t) {
  const naam =
    kind === "Shs" ? `SHS ${fmt(b)}x${fmt(h)}x${fmt(t)}`
      : `RHS ${fmt(h)}x${fmt(b)}x${fmt(t)}`;
  return {
    name: naam,
    kind,
    geometry: { h, b, tw: t, tf: t, t, r: 1.5 * t },
  };
}

function buisProfiel(d, t) {
  return {
    name: `CHS ${fmt(d)}x${fmt(t)}`,
    kind: "Chs",
    geometry: { h: d, b: d, tw: t, tf: t, t, r: 0 },
  };
}

/** Alle profielen die de brontabellen beschrijven, in vaste volgorde. */
function alleKandidaten() {
  const uit = [];
  for (const rij of IPE) uit.push(openProfiel("ISection", rij));
  for (const rij of HEA) uit.push(openProfiel("ISection", rij));
  for (const rij of HEB) uit.push(openProfiel("ISection", rij));
  for (const rij of HEM) uit.push(openProfiel("ISection", rij));
  for (const rij of UNP) uit.push(openProfiel("Channel", rij));
  for (const rij of UPE) uit.push(openProfiel("Channel", rij));
  for (const [a, dikten] of SHS) {
    for (const t of dikten) uit.push(kokerProfiel("Shs", a, a, t));
  }
  for (const [h, b, dikten] of RHS) {
    for (const t of dikten) uit.push(kokerProfiel("Rhs", h, b, t));
  }
  for (const [d, dikten] of CHS) {
    for (const t of dikten) uit.push(buisProfiel(d, t));
  }
  return uit;
}

/** Reeksnaam (IPE, HEA, ... ) uit de profielnaam. */
const reeksVan = (naam) => naam.split(/[\s0-9]/)[0].toUpperCase();

/** Zelfde normalisatie als lookup_key in de Rust-crate. */
const sleutel = (naam) => naam.replace(/[\s\-.]/g, "").toUpperCase();

/**
 * Meetkundige vingerafdruk: twee profielen met dezelfde soort en dezelfde
 * hoofdmaten zijn hetzelfde profiel, ook als de naam anders geschreven is
 * ("CHS 273x10" vs "CHS 273.0x10.0"). Dit vangt naamvarianten die de
 * lookup-sleutel NIET vangt.
 */
function vingerafdruk(p) {
  const g = p.geometry;
  const n = (x) => Number((x ?? 0).toFixed(2));
  return [p.kind, n(g.h), n(g.b), n(g.tw || g.t), n(g.tf || g.t)].join("|");
}

/* ==================================================================== *
 * 7. Validatie tegen de bestaande database                             *
 * ==================================================================== */

const GROOTHEDEN = [
  "area_mm2", "iy_mm4", "iz_mm4", "wel_y_mm3", "wel_z_mm3",
  "wpl_y_mm3", "wpl_z_mm3", "av_y_mm2", "av_z_mm2", "it_mm4",
  "iw_mm6", "iy_radius_mm", "iz_radius_mm",
];

function statistiek(afwijkingen) {
  if (afwijkingen.length === 0) return null;
  const abs = afwijkingen.map((a) => Math.abs(a.pct)).sort((x, y) => x - y);
  const gem = abs.reduce((s, x) => s + x, 0) / abs.length;
  const mediaan = abs[Math.floor(abs.length / 2)];
  const ergste = afwijkingen.reduce(
    (a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a),
  );
  return { n: abs.length, gem, mediaan, max: Math.abs(ergste.pct), ergste };
}

function valideer() {
  const bestaand = JSON.parse(readFileSync(bestaandPad, "utf8"));
  const perSleutel = new Map();
  for (const p of bestaand) {
    if (!perSleutel.has(sleutel(p.name))) perSleutel.set(sleutel(p.name), p);
  }

  const perGrootheid = new Map(GROOTHEDEN.map((k) => [k, []]));
  const perReeksGrootheid = new Map();
  let gematcht = 0;
  const nietGevonden = [];
  const krommeVerschil = [];

  for (const kand of alleKandidaten()) {
    const ref = perSleutel.get(sleutel(kand.name));
    if (!ref) continue;
    gematcht += 1;
    const reeks = reeksVan(kand.name);
    const eigen = bereken(kand.kind, kand.geometry);
    const krommen = knikkrommen(kand.kind, kand.geometry);
    if (
      krommen.y_axis !== ref.buckling_curves.y_axis ||
      krommen.z_axis !== ref.buckling_curves.z_axis
    ) {
      krommeVerschil.push(
        `${kand.name}: berekend ${krommen.y_axis}/${krommen.z_axis}, ` +
        `database ${ref.buckling_curves.y_axis}/${ref.buckling_curves.z_axis}`,
      );
    }
    for (const k of GROOTHEDEN) {
      const dbW = ref.properties[k];
      const eigenW = eigen[k];
      if (!Number.isFinite(dbW) || dbW === 0) continue;
      const pct = ((eigenW - dbW) / dbW) * 100;
      perGrootheid.get(k).push({ naam: kand.name, pct });
      const rk = `${reeks}|${k}`;
      if (!perReeksGrootheid.has(rk)) perReeksGrootheid.set(rk, []);
      perReeksGrootheid.get(rk).push({ naam: kand.name, pct });
    }
  }
  for (const [k, p] of perSleutel) {
    if (!alleKandidaten().some((c) => sleutel(c.name) === k)) {
      nietGevonden.push(p.name);
    }
  }

  console.log("=".repeat(74));
  console.log("VALIDATIE TEGEN DE BESTAANDE DATABASE");
  console.log("=".repeat(74));
  console.log(
    `Bestaande database: ${bestaand.length} regels, ${perSleutel.size} unieke ` +
    `sleutels. Daarvan opnieuw berekend: ${gematcht}.`,
  );
  if (nietGevonden.length) {
    console.log(
      `Niet in de brontabellen (dus niet gevalideerd): ${nietGevonden.join(", ")}`,
    );
  }

  console.log("\n-- Afwijking per grootheid (|berekend - database| / database) --");
  console.log(
    "grootheid".padEnd(16) + "n".padStart(5) + "gem%".padStart(9) +
    "med%".padStart(9) + "max%".padStart(9) + "  slechtste",
  );
  for (const k of GROOTHEDEN) {
    const s = statistiek(perGrootheid.get(k));
    if (!s) continue;
    console.log(
      k.padEnd(16) + String(s.n).padStart(5) +
      s.gem.toFixed(2).padStart(9) + s.mediaan.toFixed(2).padStart(9) +
      s.max.toFixed(2).padStart(9) + `  ${s.ergste.naam} (${s.ergste.pct.toFixed(1)}%)`,
    );
  }

  console.log("\n-- Afwijking per reeks (gemiddelde absolute % per grootheid) --");
  const reeksen = [...new Set([...perReeksGrootheid.keys()].map((x) => x.split("|")[0]))];
  const kern = ["area_mm2", "iy_mm4", "iz_mm4", "wel_y_mm3", "wpl_y_mm3", "wpl_z_mm3", "it_mm4", "iw_mm6"];
  console.log(
    "reeks".padEnd(8) + kern.map((k) => k.replace(/_mm\d?$|_mm$/, "").padStart(9)).join(""),
  );
  for (const r of reeksen) {
    let regel = r.padEnd(8);
    for (const k of kern) {
      const s = statistiek(perReeksGrootheid.get(`${r}|${k}`) ?? []);
      regel += (s ? s.gem.toFixed(2) : "-").padStart(9);
    }
    console.log(regel);
  }

  if (krommeVerschil.length) {
    console.log("\n-- Knikkrommen die afwijken van de database --");
    for (const v of krommeVerschil) console.log(`   ${v}`);
  } else {
    console.log("\nKnikkrommen: alle berekende krommen gelijk aan de database.");
  }

  // Waar generator en database uiteenlopen: wie heeft gelijk? Twee harde,
  // formulevrije bovengrenzen wijzen dat aan.
  console.log("\n-- Harde bovengrenzen op de bestaande database --");
  let onmogelijkKoker = 0;
  let onmogelijkIw = 0;
  const voorbeelden = [];
  for (const p of bestaand) {
    const g = p.geometry;
    const t = g.t || g.tw;
    if (["Shs", "Rhs", "Chs"].includes(p.kind)) {
      // Een doorsnede met afgeronde hoeken kan nooit stijver zijn dan dezelfde
      // doorsnede met scherpe hoeken; bij een CHS is de ringformule exact.
      const scherp = p.kind === "Chs"
        ? (Math.PI / 64) * (g.h ** 4 - (g.h - 2 * t) ** 4)
        : (g.b * g.h ** 3 - (g.b - 2 * t) * (g.h - 2 * t) ** 3) / 12;
      if (p.properties.iy_mm4 > scherp * 1.0001) {
        onmogelijkKoker += 1;
        if (voorbeelden.length < 4) {
          voorbeelden.push(
            `${p.name}: Iy = ${p.properties.iy_mm4.toExponential(3)} > ` +
            `scherpe-hoek bovengrens ${scherp.toExponential(3)} ` +
            `(+${(((p.properties.iy_mm4 - scherp) / scherp) * 100).toFixed(1)}%)`,
          );
        }
      }
    }
    if (p.kind === "Channel") {
      // Iw van een U-profiel is altijd kleiner dan Iz*hs^2/4 (de waarde die
      // een I-profiel met dezelfde Iz en flenshartafstand zou hebben).
      const grens = (p.properties.iz_mm4 * (g.h - g.tf) ** 2) / 4;
      if (p.properties.iw_mm6 > grens) onmogelijkIw += 1;
    }
  }
  console.log(
    `Holle doorsneden met Iy boven de scherpe-hoek bovengrens: ` +
    `${onmogelijkKoker} van ${bestaand.filter((p) => ["Shs", "Rhs", "Chs"].includes(p.kind)).length}`,
  );
  for (const v of voorbeelden) console.log(`   ${v}`);
  console.log(
    `U-profielen met Iw boven de bovengrens Iz*hs^2/4: ` +
    `${onmogelijkIw} van ${bestaand.filter((p) => p.kind === "Channel").length}`,
  );
  return { perGrootheid, perReeksGrootheid };
}

/* ==================================================================== *
 * 8. Zelftests op de formules (onafhankelijk van de database)          *
 * ==================================================================== */

/**
 * Onafhankelijke numerieke bepaling van Iw van een U-profiel via de
 * sectoriale-oppervlakmethode op de dunwandige middellijn. Dient uitsluitend
 * als controle op de gesloten formule in berekenUProfiel(): de pool wordt naar
 * het dwarskrachtcentrum verschoven met
 *     x_S = INT omega_0 * y * t ds / Iy
 * (het profiel is symmetrisch om y = 0), daarna wordt omega genormaliseerd op
 * INT omega t ds = 0 en geldt Iw = INT omega^2 t ds.
 */
function iwSectoriaal({ h, b, tw, tf }, N = 20000) {
  const bf = b - tw / 2;
  const hs = h - tf;
  const pts = [];
  // onderflens tip -> lijf, lijf onder -> boven, bovenflens lijf -> tip
  for (let i = 0; i < N; i += 1) {
    const s = (i + 0.5) / N;
    pts.push({ x: bf * (1 - s), y: -hs / 2, t: tf, ds: bf / N, dx: -bf / N, dy: 0 });
  }
  for (let i = 0; i < N; i += 1) {
    const s = (i + 0.5) / N;
    pts.push({ x: 0, y: -hs / 2 + hs * s, t: tw, ds: hs / N, dx: 0, dy: hs / N });
  }
  for (let i = 0; i < N; i += 1) {
    const s = (i + 0.5) / N;
    pts.push({ x: bf * s, y: hs / 2, t: tf, ds: bf / N, dx: bf / N, dy: 0 });
  }
  const A = pts.reduce((a, p) => a + p.t * p.ds, 0);
  const Iy = pts.reduce((a, p) => a + p.y * p.y * p.t * p.ds, 0);
  const om = new Float64Array(pts.length);
  let w = 0;
  pts.forEach((p, i) => {
    const d = p.x * p.dy - p.y * p.dx;
    om[i] = w + d / 2;
    w += d;
  });
  let num = 0;
  pts.forEach((p, i) => { num += om[i] * p.y * p.t * p.ds; });
  const xS = num / Iy;
  const yStart = pts[0].y;
  let gem = 0;
  pts.forEach((p, i) => {
    om[i] -= xS * (p.y - yStart);
    gem += om[i] * p.t * p.ds;
  });
  gem /= A;
  let Iw = 0;
  pts.forEach((p, i) => { Iw += (om[i] - gem) ** 2 * p.t * p.ds; });
  return Iw;
}

function zelftests() {
  const fouten = [];
  const bijna = (a, b, tol, wat) => {
    const rel = Math.abs(a - b) / Math.abs(b);
    if (!(rel <= tol)) {
      fouten.push(`${wat}: ${a.toPrecision(6)} vs ${b.toPrecision(6)} (${(rel * 100).toFixed(2)}%)`);
    }
  };

  // (1) Afgeronde rechthoek met R = H/2 = B/2 moet de cirkel opleveren.
  const R = 50;
  bijna(rechthoekTraagheid(2 * R, 2 * R, R), (Math.PI * R ** 4) / 4, 1e-12,
    "afgeronde rechthoek -> cirkel, I");
  bijna(rechthoekOpp(2 * R, 2 * R, R), Math.PI * R * R, 1e-12,
    "afgeronde rechthoek -> cirkel, A");
  // Wpl van een cirkel = d^3/6 = (2R)^3/6.
  bijna(rechthoekWpl(2 * R, 2 * R, R), (2 * R) ** 3 / 6, 1e-12,
    "afgeronde rechthoek -> cirkel, Wpl");

  // (2) Scherpe hoeken (R = 0) moeten de gewone rechthoekformules geven.
  bijna(rechthoekTraagheid(100, 200, 0), (100 * 200 ** 3) / 12, 1e-12,
    "rechthoek zonder afronding, I");

  // (3) EN 10210 spotchecks tegen gepubliceerde tabelwaarden.
  const shs = berekenKoker({ h: 100, b: 100, t: 5 });
  bijna(shs.area_mm2, 1870, 0.005, "SHS 100x100x5 A (tabel 18,7 cm2)");
  bijna(shs.iy_mm4, 2.79e6, 0.01, "SHS 100x100x5 Iy (tabel 279 cm4)");
  bijna(shs.it_mm4, 4.39e6, 0.01, "SHS 100x100x5 It (tabel 439 cm4)");

  const chs = berekenBuis({ h: 114.3, b: 114.3, t: 6.3 });
  bijna(chs.area_mm2, 2137, 0.005, "CHS 114.3x6.3 A (tabel 21,4 cm2)");

  // (4) Bovengrens: een afgeronde koker mag nooit stijver zijn dan dezelfde
  //     koker met scherpe hoeken.
  for (const [h, b, t] of [[100, 100, 5], [200, 100, 8], [300, 200, 10]]) {
    const p = berekenKoker({ h, b, t });
    const scherpI = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12;
    if (p.iy_mm4 > scherpI) {
      fouten.push(`koker ${h}x${b}x${t}: Iy boven de scherpe-hoek bovengrens`);
    }
  }

  // (5) I-profiel: A uit de losse delen moet gelijk zijn aan een fijne
  //     numerieke integratie van de breedtefunctie (controle op de
  //     uitrondingsbijdrage).
  const g = { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15 };
  const N = 400000;
  const dz = g.h / N;
  let Anum = 0;
  let Inum = 0;
  for (let i = 0; i < N; i += 1) {
    const z = (i + 0.5) * dz - g.h / 2;
    const az = Math.abs(z);
    let w;
    if (az >= g.h / 2 - g.tf) w = g.b;
    else if (az >= g.h / 2 - g.tf - g.r) {
      const u = az - (g.h / 2 - g.tf - g.r);
      w = g.tw + 2 * (g.r - Math.sqrt(Math.max(0, g.r * g.r - u * u)));
    } else w = g.tw;
    Anum += w * dz;
    Inum += w * z * z * dz;
  }
  const ip = berekenIProfiel(g);
  bijna(ip.area_mm2, Anum, 1e-4, "IPE 300 A analytisch vs numeriek");
  bijna(ip.iy_mm4, Inum, 1e-4, "IPE 300 Iy analytisch vs numeriek");

  // (6) Iw van een U-profiel: de gesloten formule moet gelijk zijn aan een
  //     directe sectoriale-oppervlakintegratie over de wandmiddellijn.
  for (const u of [
    { h: 80, b: 45, tw: 6, tf: 8 },
    { h: 200, b: 75, tw: 8.5, tf: 11.5 },
    { h: 300, b: 100, tw: 10, tf: 16 },
    { h: 400, b: 115, tw: 13.5, tf: 18 },
  ]) {
    const bAcc = u.b - u.tw / 2;
    const hs = u.h - u.tf;
    const gesloten =
      ((u.tf * bAcc ** 3 * hs * hs) / 12) *
      ((3 * bAcc * u.tf + 2 * hs * u.tw) / (6 * bAcc * u.tf + hs * u.tw));
    bijna(gesloten, iwSectoriaal(u), 2e-3,
      `Iw U-profiel h=${u.h} gesloten vs sectoriaal`);
  }

  console.log("=".repeat(74));
  console.log("ZELFTESTS OP DE FORMULES");
  console.log("=".repeat(74));
  if (fouten.length === 0) {
    console.log("Alle zelftests geslaagd (cirkellimiet, scherpe hoek, EN 10210-");
    console.log("spotchecks, bovengrens koker, analytisch vs numeriek I-profiel).");
  } else {
    for (const f of fouten) console.log(`FOUT  ${f}`);
    process.exitCode = 1;
  }
  return fouten.length === 0;
}

/* ==================================================================== *
 * 9. Uitbreiding schrijven                                             *
 * ==================================================================== */

function bouwUitbreiding() {
  const bestaand = JSON.parse(readFileSync(bestaandPad, "utf8"));
  const sleutelsBestaand = new Set(bestaand.map((p) => sleutel(p.name)));
  const vingersBestaand = new Set(bestaand.map(vingerafdruk));

  const nieuw = [];
  const eigenSleutels = new Set();
  const eigenVingers = new Set();
  const overgeslagen = [];

  for (const kand of alleKandidaten()) {
    const s = sleutel(kand.name);
    const v = vingerafdruk(kand);
    if (sleutelsBestaand.has(s) || vingersBestaand.has(v)) {
      overgeslagen.push(kand.name);
      continue;
    }
    if (eigenSleutels.has(s) || eigenVingers.has(v)) {
      overgeslagen.push(`${kand.name} (dubbel in de brontabel)`);
      continue;
    }
    eigenSleutels.add(s);
    eigenVingers.add(v);
    const p = bereken(kand.kind, kand.geometry);
    delete p._z0_mm; // interne hulpwaarde hoort niet in het bestand
    nieuw.push({
      name: kand.name,
      kind: kand.kind,
      geometry: kand.geometry,
      properties: p,
      buckling_curves: knikkrommen(kand.kind, kand.geometry),
    });
  }
  return { nieuw, overgeslagen };
}

/** Getallen afronden op zinvolle precisie (6 significante cijfers). */
function afgerond(x) {
  if (!Number.isFinite(x)) throw new Error(`Niet-eindig getal: ${x}`);
  if (x === 0) return 0;
  return Number(x.toPrecision(6));
}

function schrijf() {
  const { nieuw, overgeslagen } = bouwUitbreiding();
  const uit = nieuw.map((p) => ({
    ...p,
    properties: Object.fromEntries(
      Object.entries(p.properties).map(([k, v]) => [k, afgerond(v)]),
    ),
  }));
  writeFileSync(uitbreidingPad, `${JSON.stringify(uit, null, 2)}\n`, "utf8");

  const perReeks = new Map();
  for (const p of nieuw) {
    const r = reeksVan(p.name);
    perReeks.set(r, (perReeks.get(r) ?? 0) + 1);
  }
  console.log("=".repeat(74));
  console.log("UITBREIDING GESCHREVEN");
  console.log("=".repeat(74));
  console.log(`Bestand: ${uitbreidingPad}`);
  console.log(`Nieuwe profielen: ${nieuw.length}`);
  for (const [r, n] of [...perReeks].sort()) console.log(`   ${r.padEnd(6)} ${n}`);
  console.log(
    `Overgeslagen omdat ze al bestaan of dubbel zijn: ${overgeslagen.length}`,
  );
  return nieuw;
}

/* ==================================================================== *
 * 10. Zelfcontrole op de uitbreiding                                   *
 * ==================================================================== */

function zelfcontrole(nieuw) {
  const fouten = [];
  const waarschuwingen = [];
  const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

  for (const p of nieuw) {
    const q = p.properties;
    const g = p.geometry;
    const naam = p.name;

    // Interne consistentie van de traagheidsstralen.
    if (rel(q.iy_radius_mm, Math.sqrt(q.iy_mm4 / q.area_mm2)) > 1e-6) {
      fouten.push(`${naam}: iy != sqrt(Iy/A)`);
    }
    if (rel(q.iz_radius_mm, Math.sqrt(q.iz_mm4 / q.area_mm2)) > 1e-6) {
      fouten.push(`${naam}: iz != sqrt(Iz/A)`);
    }
    // Wel;y = Iy/(h/2) geldt voor alle dubbelsymmetrische doorsneden en ook
    // voor het U-profiel (dat om de sterke as symmetrisch is).
    if (rel(q.wel_y_mm3, q.iy_mm4 / (g.h / 2)) > 1e-5) {
      fouten.push(`${naam}: Wel;y != Iy/(h/2)`);
    }
    // Wel;z = Iz/(b/2) alleen bij dubbelsymmetrie; bij een U-profiel is het
    // Iz gedeeld door de GROOTSTE randafstand en dus kleiner.
    if (p.kind !== "Channel" && rel(q.wel_z_mm3, q.iz_mm4 / (g.b / 2)) > 1e-5) {
      fouten.push(`${naam}: Wel;z != Iz/(b/2)`);
    }
    if (p.kind === "Channel" && q.wel_z_mm3 >= q.iz_mm4 / (g.b / 2)) {
      fouten.push(`${naam}: Wel;z van een U-profiel moet kleiner zijn dan Iz/(b/2)`);
    }
    // Vormfactoren.
    if (!(q.wpl_y_mm3 >= q.wel_y_mm3)) fouten.push(`${naam}: Wpl;y < Wel;y`);
    if (!(q.wpl_z_mm3 >= q.wel_z_mm3)) fouten.push(`${naam}: Wpl;z < Wel;z`);
    const fy = q.wpl_y_mm3 / q.wel_y_mm3;
    if (fy > 1.8) waarschuwingen.push(`${naam}: vormfactor sterke as ${fy.toFixed(2)}`);
    // Afschuifoppervlak.
    if (!(q.av_z_mm2 > 0 && q.av_z_mm2 < q.area_mm2)) {
      fouten.push(`${naam}: Av;z buiten (0, A)`);
    }
    if (!(q.av_y_mm2 > 0 && q.av_y_mm2 < q.area_mm2)) {
      fouten.push(`${naam}: Av;y buiten (0, A)`);
    }
    // Positieve grootheden.
    for (const k of ["area_mm2", "iy_mm4", "iz_mm4", "it_mm4"]) {
      if (!(q[k] > 0)) fouten.push(`${naam}: ${k} niet positief`);
    }
    if (!(q.iw_mm6 >= 0)) fouten.push(`${naam}: Iw negatief`);
    // Iy >= Iz voor alle profielen waar h >= b.
    if (g.h >= g.b && q.iy_mm4 < q.iz_mm4) {
      fouten.push(`${naam}: Iy < Iz terwijl h >= b`);
    }
    // Bovengrens: A mag nooit boven de omhullende rechthoek liggen.
    if (q.area_mm2 > g.h * g.b) fouten.push(`${naam}: A groter dan h*b`);
    // Kokers en buizen zijn GESLOTEN doorsneden: hun torsiestijfheid ligt in
    // dezelfde orde als de buigstijfheid. De maatgevende ondergrens is Iz (de
    // zwakke as); It mag wel onder Iy liggen zodra h/b flink groter dan 1 is,
    // want de schuifstroom loopt om de KLEINSTE maat rond.
    if ((p.kind === "Shs" || p.kind === "Rhs" || p.kind === "Chs")
      && !(q.it_mm4 > q.iz_mm4)) {
      waarschuwingen.push(`${naam}: It niet groter dan Iz (gesloten doorsnede)`);
    }
    // Open profielen: It moet juist veel kleiner zijn dan Iy.
    if ((p.kind === "ISection" || p.kind === "Channel")
      && !(q.it_mm4 < q.iy_mm4 / 5)) {
      waarschuwingen.push(`${naam}: It verdacht groot voor een open profiel`);
    }
  }

  // Monotonie binnen een reeks: een groter profiel moet zwaarder en stijver
  // zijn dan het kleinere met dezelfde reeksnaam.
  const reeksen = new Map();
  for (const p of nieuw) {
    const r = reeksVan(p.name);
    if (!reeksen.has(r)) reeksen.set(r, []);
    reeksen.get(r).push(p);
  }
  let monoGecontroleerd = 0;
  for (const [r, lijst] of reeksen) {
    if (r !== "HEA" && r !== "HEB" && r !== "HEM" && r !== "UPE") continue;
    const gesorteerd = [...lijst].sort((a, b) => a.geometry.h - b.geometry.h);
    for (let i = 1; i < gesorteerd.length; i += 1) {
      const v = gesorteerd[i - 1];
      const n = gesorteerd[i];
      monoGecontroleerd += 1;
      if (!(n.properties.area_mm2 > v.properties.area_mm2)) {
        fouten.push(`${r}: A niet monotoon bij ${v.name} -> ${n.name}`);
      }
      if (!(n.properties.iy_mm4 > v.properties.iy_mm4)) {
        fouten.push(`${r}: Iy niet monotoon bij ${v.name} -> ${n.name}`);
      }
      if (!(n.properties.wpl_y_mm3 > v.properties.wpl_y_mm3)) {
        fouten.push(`${r}: Wpl;y niet monotoon bij ${v.name} -> ${n.name}`);
      }
    }
  }
  // Kokers: bij gelijke buitenmaat moet een dikkere wand meer oppervlak geven.
  const perMaat = new Map();
  for (const p of nieuw) {
    if (p.kind !== "Shs" && p.kind !== "Rhs" && p.kind !== "Chs") continue;
    const k = `${p.kind}|${p.geometry.h}x${p.geometry.b}`;
    if (!perMaat.has(k)) perMaat.set(k, []);
    perMaat.get(k).push(p);
  }
  for (const [k, lijst] of perMaat) {
    const s = [...lijst].sort((a, b) => a.geometry.t - b.geometry.t);
    for (let i = 1; i < s.length; i += 1) {
      monoGecontroleerd += 1;
      if (!(s[i].properties.area_mm2 > s[i - 1].properties.area_mm2)) {
        fouten.push(`${k}: A niet monotoon in wanddikte (${s[i - 1].name})`);
      }
      if (!(s[i].properties.iy_mm4 > s[i - 1].properties.iy_mm4)) {
        fouten.push(`${k}: Iy niet monotoon in wanddikte (${s[i - 1].name})`);
      }
    }
  }

  console.log("=".repeat(74));
  console.log("ZELFCONTROLE OP DE UITBREIDING");
  console.log("=".repeat(74));
  console.log(
    `${nieuw.length} profielen gecontroleerd, ${monoGecontroleerd} ` +
    `monotonie-vergelijkingen.`,
  );
  if (fouten.length === 0) console.log("Geen fouten.");
  else {
    for (const f of fouten) console.log(`FOUT  ${f}`);
    process.exitCode = 1;
  }
  if (waarschuwingen.length) {
    console.log(`Waarschuwingen (${waarschuwingen.length}):`);
    for (const w of waarschuwingen.slice(0, 20)) console.log(`   ${w}`);
    if (waarschuwingen.length > 20) console.log("   ...");
  } else console.log("Geen waarschuwingen.");
}

/* ==================================================================== *
 * 11. Aansturing                                                       *
 * ==================================================================== */

const vlaggen = process.argv.slice(2);
const alles = vlaggen.length === 0;
if (alles || vlaggen.includes("--zelftests")) zelftests();
if (alles || vlaggen.includes("--valideer")) valideer();
if (alles || vlaggen.includes("--schrijf") || vlaggen.includes("--zelfcontrole")) {
  const nieuw = (alles || vlaggen.includes("--schrijf"))
    ? schrijf()
    : bouwUitbreiding().nieuw;
  if (alles || vlaggen.includes("--zelfcontrole")) zelfcontrole(nieuw);
}
