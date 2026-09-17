/**
 * Windbelasting volgens NEN-EN 1991-1-4 + de Nederlandse nationale bijlage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VERANTWOORDING VAN ELKE NORMWAARDE IN DIT BESTAND
 * ═══════════════════════════════════════════════════════════════════════════
 * Elke constante hieronder draagt een `bron`-veld met het artikel-, formule-
 * of tabelnummer waar hij vandaan komt. De generator toont die bronnen in de
 * samenvatting, zodat een constructeur elke stap kan narekenen. Er staat
 * bewust GEEN getal in dit bestand zonder vindplaats.
 *
 * BEWUST NIET GEÏMPLEMENTEERD (de generator weigert of waarschuwt):
 *  • Vormfactoren van HELLENDE daken (EN 1991-1-4 tabel 7.4a/7.4b). Die
 *    tabellen hangen af van de dakhelling én de windrichting en zijn niet
 *    betrouwbaar uit de 2D-geometrie af te leiden; de generator vraagt de
 *    c_pe-waarden daarom aan de gebruiker en vult ze niet zelf in.
 *    (Open overkappingen, §7.3, zijn een ander geval: tabel 7.6/7.7 gelden
 *    voor alle windrichtingen en vult de generator wel zelf in — zie §9.)
 *  • Orografie (EN 1991-1-4 §4.3.3 / bijlage A.3): c_o(z) = 1,0 — vlak
 *    terrein. Bij heuvels/steilranden moet de gebruiker de stuwdruk zelf
 *    verhogen (of handmatig invoeren).
 *  • De rechtstreekse stuwdruktabel van de Nederlandse NB. Zie de
 *    waarschuwing bij TERREIN_CATEGORIEEN hieronder: de ruwheidslengtes die
 *    dit bestand gebruikt komen uit EN 1991-1-4 tabel 4.1, NIET uit de NB.
 *    Wie de NB-tabel aanhoudt, voert de stuwdruk handmatig in.
 */

// ── 1. Windgebied → basiswindsnelheid ────────────────────────────────────

export type Windgebied = "I" | "II" | "III";

export interface WindgebiedData {
  /** Basiswindsnelheid v_b,0 in m/s. */
  vb0: number;
  /**
   * Korte omschrijving (welke regio's), Nederlands. De interface toont
   * `common:wind.regionOption.<gebied>` en `common:wind.regionSource`
   * (issue #33); test-i18n-meldteksten houdt de Nederlandse vertaling gelijk.
   */
  omschrijving: string;
  bron: string;
}

/**
 * Basiswindsnelheid per Nederlands windgebied.
 * Bron: NEN-EN 1991-1-4+A1+C2/NB, bepaling bij §4.2(1)P, tabel NB.1.
 *
 * De gebiedsindeling zelf (welke gemeente in welk gebied ligt) staat op de
 * kaart in dezelfde nationale bijlage; die kaart zit NIET in dit programma —
 * de gebruiker kiest het gebied zelf.
 */
export const WINDGEBIEDEN: Record<Windgebied, WindgebiedData> = {
  I: {
    vb0: 29.5,
    omschrijving: "Gebied I — kuststrook en Waddengebied (v_b,0 = 29,5 m/s)",
    bron: "NEN-EN 1991-1-4/NB tabel NB.1",
  },
  II: {
    vb0: 27.0,
    omschrijving: "Gebied II — noordwestelijk binnenland (v_b,0 = 27,0 m/s)",
    bron: "NEN-EN 1991-1-4/NB tabel NB.1",
  },
  III: {
    vb0: 24.5,
    omschrijving: "Gebied III — zuidoostelijk binnenland (v_b,0 = 24,5 m/s)",
    bron: "NEN-EN 1991-1-4/NB tabel NB.1",
  },
};

// ── 2. Terreincategorie → ruwheidslengte ─────────────────────────────────

export type TerreinCategorie = "0" | "I" | "II" | "III" | "IV";

export interface TerreinData {
  /** Ruwheidslengte z_0 in m. */
  z0: number;
  /** Minimale hoogte z_min in m. */
  zmin: number;
  omschrijving: string;
  bron: string;
}

/**
 * Terreincategorieën met ruwheidslengte z_0 en minimale hoogte z_min.
 * Bron: NEN-EN 1991-1-4 tabel 4.1.
 *
 * ⚠ LET OP — dit is de EUROCODE-tabel, niet de Nederlandse NB-indeling.
 * De Nederlandse nationale bijlage werkt met de terreinsoorten
 * "kustgebied / onbebouwd / bebouwd" en geeft daarbij een eigen tabel met
 * rechtstreeks af te lezen extreme stuwdrukken. Die NB-tabel is hier NIET
 * overgenomen — de waarden ervan zijn in dit programma niet geverifieerd en
 * een verkeerd overgeschreven tabel is gevaarlijker dan geen tabel.
 * De namen tussen haakjes zijn dan ook alleen een LEESHULP en géén
 * normatieve gelijkstelling.
 *
 * Wie de nationale bijlage aanhoudt: kies in de generator "stuwdruk
 * handmatig" en voer de waarde uit de NB-tabel in. De generator rekent daar
 * dan mee en vermeldt dat in de samenvatting.
 */
export const TERREIN_CATEGORIEEN: Record<TerreinCategorie, TerreinData> = {
  "0": {
    z0: 0.003, zmin: 1,
    omschrijving: "0 — zee, aan open zee blootgesteld kustgebied (leeshulp: “kustgebied”)",
    bron: "NEN-EN 1991-1-4 tabel 4.1",
  },
  I: {
    z0: 0.01, zmin: 1,
    omschrijving: "I — meren, vlak gebied zonder obstakels",
    bron: "NEN-EN 1991-1-4 tabel 4.1",
  },
  II: {
    z0: 0.05, zmin: 2,
    omschrijving: "II — lage begroeiing, losstaande obstakels (leeshulp: “onbebouwd”)",
    bron: "NEN-EN 1991-1-4 tabel 4.1",
  },
  III: {
    z0: 0.3, zmin: 5,
    omschrijving: "III — dorpen, voorstedelijk gebied, bos (leeshulp: “bebouwd”)",
    bron: "NEN-EN 1991-1-4 tabel 4.1",
  },
  IV: {
    z0: 1.0, zmin: 10,
    omschrijving: "IV — stedelijk gebied, gemiddelde gebouwhoogte > 15 m",
    bron: "NEN-EN 1991-1-4 tabel 4.1",
  },
};

/** Ruwheidslengte van referentiecategorie II — NEN-EN 1991-1-4 formule (4.5). */
export const Z0_II = 0.05; // m

/** Luchtdichtheid ρ. Bron: NEN-EN 1991-1-4 §4.5(1) opmerking 2 (ρ = 1,25 kg/m³). */
export const RHO_LUCHT = 1.25; // kg/m³

/** Richtingsfactor c_dir. Bron: NEN-EN 1991-1-4 §4.2(2)P opm. 2 — aanbevolen 1,0. */
export const C_DIR = 1.0;

/** Seizoensfactor c_season. Bron: NEN-EN 1991-1-4 §4.2(2)P opm. 3 — aanbevolen 1,0. */
export const C_SEASON = 1.0;

/** Turbulentiefactor k_I. Bron: NEN-EN 1991-1-4 §4.4(1) opm. 2 — aanbevolen 1,0. */
export const K_I = 1.0;

/** Orografiefactor c_o. Vlak terrein → 1,0. Bron: NEN-EN 1991-1-4 §4.3.3. */
export const C_O = 1.0;

// ── 3. Stuwdruk q_p(z) ───────────────────────────────────────────────────

/** Eén regel van de stuwdruk-afleiding, voor de controleerbare samenvatting. */
export interface AfleidingsRegel {
  symbool: string;
  waarde: string;
  bron: string;
}

export interface StuwdrukResultaat {
  /** Extreme stuwdruk q_p(z_e) in kN/m². */
  qp_kNm2: number;
  /** Gebruikte referentiehoogte in m. */
  ze_m: number;
  /** true wanneer de gebruiker de stuwdruk handmatig heeft opgegeven. */
  handmatig: boolean;
  /** Volledige afleiding, regel voor regel, met vindplaats. */
  afleiding: AfleidingsRegel[];
}

function nl(v: number, dec: number): string {
  return v.toFixed(dec).replace(".", ",");
}

/**
 * Extreme stuwdruk q_p(z) volgens NEN-EN 1991-1-4 §4.
 *
 *   v_b   = c_dir · c_season · v_b,0                      formule (4.1)
 *   k_r   = 0,19 · (z_0 / z_0,II)^0,07                    formule (4.5)
 *   c_r(z)= k_r · ln(z / z_0)   voor z_min ≤ z ≤ 200 m    formule (4.4)
 *           c_r(z_min)          voor z < z_min            formule (4.4)
 *   v_m(z)= c_r(z) · c_o(z) · v_b                         formule (4.3)
 *   I_v(z)= k_I / (c_o(z) · ln(z / z_0))                  formule (4.7)
 *   q_p(z)= [1 + 7·I_v(z)] · ½ · ρ · v_m(z)²              formule (4.8)
 *
 * Retourneert de stuwdruk in kN/m² plus de volledige afleiding.
 */
export function berekenStuwdruk(
  gebied: Windgebied,
  terrein: TerreinCategorie,
  ze_m: number,
): StuwdrukResultaat {
  const g = WINDGEBIEDEN[gebied];
  const t = TERREIN_CATEGORIEEN[terrein];
  const vb = C_DIR * C_SEASON * g.vb0;
  const kr = 0.19 * Math.pow(t.z0 / Z0_II, 0.07);
  // Onder z_min houdt de norm de waarde op z_min aan; boven 200 m geldt de
  // formule niet meer (§4.3.2(1)) — daar geeft de generator een melding.
  const zGebruikt = Math.max(ze_m, t.zmin);
  const cr = kr * Math.log(zGebruikt / t.z0);
  const vm = cr * C_O * vb;
  const iv = K_I / (C_O * Math.log(zGebruikt / t.z0));
  const qp_Nm2 = (1 + 7 * iv) * 0.5 * RHO_LUCHT * vm * vm;

  return {
    qp_kNm2: qp_Nm2 / 1000,
    ze_m,
    handmatig: false,
    afleiding: [
      { symbool: "windgebied", waarde: `${gebied} — v_b,0 = ${nl(g.vb0, 1)} m/s`, bron: g.bron },
      { symbool: "terreincategorie", waarde: `${terrein} — z₀ = ${nl(t.z0, 3)} m, z_min = ${nl(t.zmin, 0)} m`, bron: t.bron },
      { symbool: "v_b", waarde: `${nl(C_DIR, 1)} · ${nl(C_SEASON, 1)} · ${nl(g.vb0, 1)} = ${nl(vb, 2)} m/s`, bron: "EN 1991-1-4 (4.1)" },
      { symbool: "z_e", waarde: `${nl(ze_m, 2)} m${zGebruikt !== ze_m ? ` → gerekend met z_min = ${nl(zGebruikt, 2)} m` : ""}`, bron: "EN 1991-1-4 §7.2.2 fig. 7.4" },
      { symbool: "k_r", waarde: `0,19 · (${nl(t.z0, 3)}/${nl(Z0_II, 3)})^0,07 = ${nl(kr, 4)}`, bron: "EN 1991-1-4 (4.5)" },
      { symbool: "c_r(z_e)", waarde: `${nl(kr, 4)} · ln(${nl(zGebruikt, 2)}/${nl(t.z0, 3)}) = ${nl(cr, 4)}`, bron: "EN 1991-1-4 (4.4)" },
      { symbool: "c_o(z_e)", waarde: `${nl(C_O, 2)} (vlak terrein, orografie buiten beschouwing)`, bron: "EN 1991-1-4 §4.3.3" },
      { symbool: "v_m(z_e)", waarde: `${nl(cr, 4)} · ${nl(C_O, 2)} · ${nl(vb, 2)} = ${nl(vm, 3)} m/s`, bron: "EN 1991-1-4 (4.3)" },
      { symbool: "I_v(z_e)", waarde: `${nl(K_I, 1)} / (${nl(C_O, 2)} · ln(${nl(zGebruikt, 2)}/${nl(t.z0, 3)})) = ${nl(iv, 4)}`, bron: "EN 1991-1-4 (4.7)" },
      { symbool: "ρ", waarde: `${nl(RHO_LUCHT, 2)} kg/m³`, bron: "EN 1991-1-4 §4.5(1) opm. 2" },
      { symbool: "q_p(z_e)", waarde: `[1 + 7·${nl(iv, 4)}] · ½ · ${nl(RHO_LUCHT, 2)} · ${nl(vm, 3)}² = ${nl(qp_Nm2 / 1000, 4)} kN/m²`, bron: "EN 1991-1-4 (4.8)" },
    ],
  };
}

/** Stuwdruk die de gebruiker zelf opgeeft (bijvoorbeeld uit de NB-tabel). */
export function handmatigeStuwdruk(qp_kNm2: number, ze_m: number): StuwdrukResultaat {
  return {
    qp_kNm2,
    ze_m,
    handmatig: true,
    afleiding: [
      {
        symbool: "q_p(z_e)",
        waarde: `${nl(qp_kNm2, 4)} kN/m² — handmatig ingevoerd op z_e = ${nl(ze_m, 2)} m`,
        bron: "door de gebruiker opgegeven (bijv. NEN-EN 1991-1-4/NB stuwdruktabel)",
      },
    ],
  };
}

// ── 4. Uitwendige vormfactoren — verticale wanden ────────────────────────

/** Zonenamen van verticale wanden. Bron: NEN-EN 1991-1-4 figuur 7.5. */
export type WandZone = "A" | "B" | "C" | "D" | "E";

/**
 * c_pe,10 voor verticale wanden van rechthoekige gebouwen.
 * Bron: NEN-EN 1991-1-4 tabel 7.1 (belaste oppervlakte A ≥ 10 m²).
 *
 * Rijen op h/d = 5, h/d = 1 en h/d ≤ 0,25; tussenliggende h/d wordt lineair
 * geïnterpoleerd (toegestaan volgens de opmerking bij tabel 7.1).
 */
const TABEL_71: { hd: number; A: number; B: number; C: number; D: number; E: number }[] = [
  { hd: 5.0,  A: -1.2, B: -0.8, C: -0.5, D: 0.8, E: -0.7 },
  { hd: 1.0,  A: -1.2, B: -0.8, C: -0.5, D: 0.8, E: -0.5 },
  { hd: 0.25, A: -1.2, B: -0.8, C: -0.5, D: 0.7, E: -0.3 },
];

export const TABEL_71_BRON = "NEN-EN 1991-1-4 tabel 7.1 (c_pe,10)";

/**
 * Vormfactoren van de verticale wanden bij verhouding h/d, lineair
 * geïnterpoleerd tussen de rijen van tabel 7.1. Buiten het bereik wordt
 * geklemd op de uiterste rij (h/d > 5 → rij 5; h/d < 0,25 → rij 0,25),
 * conform de tabel die daar zelf ook geen verdere differentiatie geeft.
 */
export function cpeWand(hOverD: number): Record<WandZone, number> {
  const hd = Math.max(0.25, Math.min(5, hOverD));
  // Rijen liggen aflopend op hd; zoek het omsluitende paar.
  for (let i = 0; i < TABEL_71.length - 1; i++) {
    const hoog = TABEL_71[i], laag = TABEL_71[i + 1];
    if (hd <= hoog.hd && hd >= laag.hd) {
      const f = (hd - laag.hd) / (hoog.hd - laag.hd);
      const mix = (a: number, b: number) => b + (a - b) * f;
      return {
        A: mix(hoog.A, laag.A), B: mix(hoog.B, laag.B), C: mix(hoog.C, laag.C),
        D: mix(hoog.D, laag.D), E: mix(hoog.E, laag.E),
      };
    }
  }
  const r = TABEL_71[TABEL_71.length - 1];
  return { A: r.A, B: r.B, C: r.C, D: r.D, E: r.E };
}

// ── 5. Uitwendige vormfactoren — plat dak ────────────────────────────────

/** Zonenamen van een plat dak. Bron: NEN-EN 1991-1-4 figuur 7.6. */
export type PlatDakZone = "F" | "G" | "H" | "I";

/**
 * c_pe,10 voor een PLAT dak met SCHERPE DAKRAND.
 * Bron: NEN-EN 1991-1-4 tabel 7.2, rij "scherpe dakrand".
 *
 * Zone I geeft de tabel als ±0,2. Deze generator gebruikt −0,2 (opwaarts,
 * ongunstig samen met de zuiging in F/G/H) en meldt dat expliciet — zie
 * MELDING_ZONE_I. De andere dakrandvormen uit tabel 7.2 (borstwering,
 * afgeronde rand, mansarde) zijn NIET geïmplementeerd.
 */
export const CPE_PLAT_DAK: Record<PlatDakZone, number> = {
  F: -1.8, G: -1.2, H: -0.7, I: -0.2,
};

export const CPE_PLAT_DAK_BRON = "NEN-EN 1991-1-4 tabel 7.2, scherpe dakrand (c_pe,10)";

export const MELDING_ZONE_I =
  "Zone I van een plat dak geeft in tabel 7.2 zowel +0,2 als −0,2. De generator " +
  "gebruikt −0,2 (opwaarts). Controleer of +0,2 (neerwaarts) voor uw geval " +
  "maatgevend is; die variant wordt niet automatisch aangemaakt.";

// ── 6. Inwendige druk c_pi ───────────────────────────────────────────────

/**
 * Inwendige drukcoëfficiënten wanneer de openingsverhouding μ niet bekend is.
 * Bron: NEN-EN 1991-1-4 §7.2.9 — "wanneer het niet mogelijk is μ te bepalen,
 * moet c_pi worden genomen als de meest ongunstige van +0,2 en −0,3".
 *
 * Een 2D-raamwerk bevat geen gevelopeningen, dus μ is per definitie onbekend:
 * de generator maakt daarom standaard BEIDE varianten aan als afzonderlijke
 * belastinggevallen. Dat is de expliciete, controleerbare route; één van de
 * twee stilzwijgend kiezen zou een verzonnen aanname zijn.
 */
export const CPI_ONBEKEND: readonly number[] = [0.2, -0.3];

export const CPI_BRON = "NEN-EN 1991-1-4 §7.2.9 (μ onbekend → meest ongunstige van +0,2 en −0,3)";

// ── 7. Constructiefactor c_s·c_d ─────────────────────────────────────────

/**
 * Grenshoogte waaronder c_s·c_d = 1,0 mag worden aangehouden.
 * Bron: NEN-EN 1991-1-4 §6.2(1)a — gebouwen lager dan 15 m.
 */
export const CSCD_GRENSHOOGTE_M = 15;
export const CSCD_BRON = "NEN-EN 1991-1-4 §6.2(1)a (c_s·c_d = 1,0 voor gebouwen < 15 m)";

/**
 * Ondergrens van de belaste oppervlakte waarboven c_pe,10 geldt.
 * Bron: NEN-EN 1991-1-4 §7.2.1(1) — A ≥ 10 m² ⇒ c_pe = c_pe,10.
 */
export const CPE10_MIN_OPPERVLAK_M2 = 10;
export const CPE10_BRON = "NEN-EN 1991-1-4 §7.2.1(1)";

/**
 * Bovengrens van het geldigheidsbereik van de snelheidsprofielformules.
 * Bron: NEN-EN 1991-1-4 §4.3.2(1) — z ≤ z_max = 200 m.
 */
export const ZMAX_M = 200;

// ── 8. Zone-indeling e = min(b; 2h) ──────────────────────────────────────

/**
 * Karakteristieke maat e voor de zone-indeling van wanden en daken.
 * Bron: NEN-EN 1991-1-4 §7.2.2(2) / figuur 7.5 en §7.2.3 / figuur 7.6:
 *   e = min(b; 2h), met b de afmeting LOODRECHT op de windrichting.
 */
export function berekenE(b_m: number, h_m: number): number {
  return Math.min(b_m, 2 * h_m);
}

// ── 9. Open overkappingen (vrijstaande daken) — §7.3 ─────────────────────

/**
 * Een open overkapping is "een dak van een constructie die geen blijvende
 * gevels heeft" (NEN-EN 1991-1-4 §7.3(1)): luifel, carport, kapschuur.
 * Anders dan bij de hellende daken van §7.2.5 (zie de kop van dit bestand)
 * vult de generator deze tabellen WEL zelf in: hun enige ingangen zijn de
 * dakhelling α — die uit de 2D-geometrie volgt — en de blokkering φ, en ze
 * gelden "voor alle windrichtingen" (§7.3(3)). Er is dus geen keuze per
 * windrichting of per zone die de gebruiker zelf zou moeten maken.
 *
 * Elke rij is overgenomen uit NEN-EN 1991-1-4:2005+C2:2011 (uitgave met
 * NB:2019), tabel 7.6 resp. tabel 7.7, en gecontroleerd tegen de weergave
 * van de tabelpagina zelf. De nationale bijlage wijzigt §7.3 niet: bij 7.3(6)
 * staat alleen dat de plaats van het aangrijpingspunt in de bijlage "kan"
 * staan, en er staat geen NB-bepaling bij. Dan geldt de aanbevolen plaats uit
 * figuur 7.16.
 *
 * Per coëfficiënt een drietal, in de volgorde van de tabelcel:
 *   [ maximaal voor alle φ ; minimaal voor φ = 0 ; minimaal voor φ = 1 ].
 * Positief = netto neerwaarts, negatief = netto opwaarts (opmerking onder
 * beide tabellen).
 */
export type OverkappingDrietal = readonly [max: number, min0: number, min1: number];

export type OverkappingZone = "A" | "B" | "C" | "D";

export interface OverkappingRij {
  /** Dakhelling α in graden; in tabel 7.7 negatief voor een kiel (V-dak). */
  alpha: number;
  /** Globale krachtcoëfficiënt c_f. */
  cf: OverkappingDrietal;
  /** Nettodrukcoëfficiënten c_p,net per zone; zone D alleen in tabel 7.7. */
  zones: Partial<Record<OverkappingZone, OverkappingDrietal>>;
}

/** Tabel 7.6 — eenzijdig hellende overkappingen (lessenaarsdak), α = 0°…30°. */
export const TABEL_76: readonly OverkappingRij[] = [
  { alpha: 0,  cf: [0.2, -0.5, -1.3], zones: { A: [0.5, -0.6, -1.5], B: [1.8, -1.3, -1.8], C: [1.1, -1.4, -2.2] } },
  { alpha: 5,  cf: [0.4, -0.7, -1.4], zones: { A: [0.8, -1.1, -1.6], B: [2.1, -1.7, -2.2], C: [1.3, -1.8, -2.5] } },
  { alpha: 10, cf: [0.5, -0.9, -1.4], zones: { A: [1.2, -1.5, -1.6], B: [2.4, -2.0, -2.6], C: [1.6, -2.1, -2.7] } },
  { alpha: 15, cf: [0.7, -1.1, -1.4], zones: { A: [1.4, -1.8, -1.6], B: [2.7, -2.4, -2.9], C: [1.8, -2.5, -3.0] } },
  { alpha: 20, cf: [0.8, -1.3, -1.4], zones: { A: [1.7, -2.2, -1.6], B: [2.9, -2.8, -2.9], C: [2.1, -2.9, -3.0] } },
  { alpha: 25, cf: [1.0, -1.6, -1.4], zones: { A: [2.0, -2.6, -1.5], B: [3.1, -3.2, -2.5], C: [2.3, -3.2, -2.8] } },
  { alpha: 30, cf: [1.2, -1.8, -1.4], zones: { A: [2.2, -3.0, -1.5], B: [3.2, -3.8, -2.2], C: [2.4, -3.6, -2.7] } },
];

/**
 * Tabel 7.7 — tweezijdig hellende overkappingen. α > 0 is een zadeldak (nok
 * boven), α < 0 een kiel- of V-dak (figuur 7.17, onderste helft). De tabel
 * heeft geen rijen tussen −5° en +5°.
 */
export const TABEL_77: readonly OverkappingRij[] = [
  { alpha: -20, cf: [0.7, -0.7, -1.3], zones: { A: [0.8, -0.9, -1.5], B: [1.6, -1.3, -2.4], C: [0.6, -1.6, -2.4], D: [1.7, -0.6, -0.6] } },
  { alpha: -15, cf: [0.5, -0.6, -1.4], zones: { A: [0.6, -0.8, -1.6], B: [1.5, -1.3, -2.7], C: [0.7, -1.6, -2.6], D: [1.4, -0.6, -0.6] } },
  { alpha: -10, cf: [0.4, -0.6, -1.4], zones: { A: [0.6, -0.8, -1.6], B: [1.4, -1.3, -2.7], C: [0.8, -1.5, -2.6], D: [1.1, -0.6, -0.6] } },
  { alpha: -5,  cf: [0.3, -0.5, -1.3], zones: { A: [0.5, -0.7, -1.5], B: [1.5, -1.3, -2.4], C: [0.8, -1.6, -2.4], D: [0.8, -0.6, -0.6] } },
  { alpha: 5,   cf: [0.3, -0.6, -1.3], zones: { A: [0.6, -0.6, -1.3], B: [1.8, -1.4, -2.0], C: [1.3, -1.4, -1.8], D: [0.4, -1.1, -1.5] } },
  { alpha: 10,  cf: [0.4, -0.7, -1.3], zones: { A: [0.7, -0.7, -1.3], B: [1.8, -1.5, -2.0], C: [1.4, -1.4, -1.8], D: [0.4, -1.4, -1.8] } },
  { alpha: 15,  cf: [0.4, -0.8, -1.3], zones: { A: [0.9, -0.9, -1.3], B: [1.9, -1.7, -2.2], C: [1.4, -1.4, -1.6], D: [0.4, -1.8, -2.1] } },
  { alpha: 20,  cf: [0.6, -0.9, -1.3], zones: { A: [1.1, -1.2, -1.4], B: [1.9, -1.8, -2.2], C: [1.5, -1.4, -1.6], D: [0.4, -2.0, -2.1] } },
  { alpha: 25,  cf: [0.7, -1.0, -1.3], zones: { A: [1.2, -1.4, -1.4], B: [1.9, -1.9, -2.0], C: [1.6, -1.4, -1.5], D: [0.5, -2.0, -2.0] } },
  { alpha: 30,  cf: [0.9, -1.0, -1.3], zones: { A: [1.3, -1.4, -1.4], B: [1.9, -1.9, -1.8], C: [1.6, -1.4, -1.4], D: [0.7, -2.0, -2.0] } },
];

export type OverkappingDakvorm = "lessenaar" | "zadel";

export const OVERKAPPING_TABEL_BRON: Record<OverkappingDakvorm, string> = {
  lessenaar: "NEN-EN 1991-1-4 §7.3, tabel 7.6 (eenzijdig hellende overkapping)",
  zadel: "NEN-EN 1991-1-4 §7.3, tabel 7.7 (tweezijdig hellende overkapping)",
};

/** Eén coëfficiënt zoals de generator hem gebruikt, met de afleiding erbij. */
export interface OverkappingCoefficient {
  /** "c_f" of de zone. */
  naam: "c_f" | OverkappingZone;
  /** Maximaal voor alle φ (neerwaarts), over α geïnterpoleerd. */
  max: number;
  /** Minimaal voor φ = 0, over α geïnterpoleerd. */
  min0: number;
  /** Minimaal voor φ = 1, over α geïnterpoleerd. */
  min1: number;
  /** Minimaal bij de gekozen φ: min0 + φ·(min1 − min0), §7.3(3). */
  minPhi: number;
}

export interface OverkappingOpzoeking {
  ok: boolean;
  /** Reden van weigering (α buiten de tabel, φ buiten 0…1). */
  reden?: string;
  tabel: "7.6" | "7.7";
  bron: string;
  /** De tabelrijen (α) waartussen is geïnterpoleerd; gelijk op een tabelrij. */
  rijOnder: number;
  rijBoven: number;
  coefficienten: OverkappingCoefficient[];
}

/**
 * Coëfficiënten van tabel 7.6/7.7 bij dakhelling α en blokkering φ.
 *
 * INTERPOLATIE
 *  • Over φ: lineair tussen "minimaal voor φ = 0" en "minimaal voor φ = 1",
 *    uitdrukkelijk toegestaan in §7.3(3). "Maximaal" geldt voor alle φ.
 *  • Over α: lineair tussen de twee omsluitende tabelrijen, elk drietal
 *    afzonderlijk. §7.3 zegt daar zelf niets over; de generator volgt de regel
 *    die NEN-EN 1991-1-4 bij de andere dakvormtabellen geeft (opmerking bij
 *    tabel 7.3a en 7.4a: "voor tussenliggende hellingshoeken mag lineaire
 *    interpolatie zijn toegepast, tussen waarden met hetzelfde teken"). In
 *    tabel 7.6 en 7.7 heeft elke kolom van een drietal in alle rijen hetzelfde
 *    teken, dus aan die voorwaarde is overal voldaan. Tussen −5° en +5° in
 *    tabel 7.7 wordt NIET geïnterpoleerd — dezelfde regel als bij tabel 7.4a
 *    ("maak geen interpolatie tussen α = +5° en α = −5°"); de dakvorm slaat
 *    daar om van kiel naar nok.
 *  • Buiten de tabel (lessenaar α > 30°; zadel α > 30°, α < −20° of
 *    |α| < 5°) wordt GEWEIGERD in plaats van geklemd.
 */
export function overkappingCoefficienten(
  dakvorm: OverkappingDakvorm, alpha_graden: number, phi: number,
): OverkappingOpzoeking {
  const tabel = dakvorm === "lessenaar" ? "7.6" : "7.7";
  const rijen = dakvorm === "lessenaar" ? TABEL_76 : TABEL_77;
  const bron = OVERKAPPING_TABEL_BRON[dakvorm];
  const graden = (x: number) => `${x.toFixed(1).replace(".", ",").replace("-", "−")}°`;
  const weiger = (reden: string): OverkappingOpzoeking =>
    ({ ok: false, reden, tabel, bron, rijOnder: NaN, rijBoven: NaN, coefficienten: [] });
  if (!(phi >= 0 && phi <= 1)) {
    return weiger("De blokkering φ ligt tussen 0 (leeg eronder) en 1 (volledig geblokkeerd), §7.3(2).");
  }
  // Een uit de geometrie berekende hoek als 29,9999999° hoort bij de rij 30°.
  const a = Math.abs(alpha_graden - Math.round(alpha_graden)) < 1e-6 ? Math.round(alpha_graden) : alpha_graden;
  if (dakvorm === "lessenaar" && (a < 0 || a > 30)) {
    return weiger(`Tabel 7.6 geeft dakhellingen van 0° tot 30°; deze helling is ${graden(a)}.`);
  }
  if (dakvorm === "zadel" && (a < -20 || a > 30 || (a > -5 && a < 5))) {
    return weiger(
      `Tabel 7.7 geeft dakhellingen van −20° tot −5° en van +5° tot +30°; deze helling is ${graden(a)}. ` +
      "Tussen −5° en +5° staat er geen rij, en daartussen wordt niet geïnterpoleerd.",
    );
  }
  let i = 0;
  while (i < rijen.length - 2 && !(a >= rijen[i].alpha && a <= rijen[i + 1].alpha)) i++;
  const onder = rijen[i];
  const boven = rijen[i + 1];
  const f = (a - onder.alpha) / (boven.alpha - onder.alpha);
  // Precies op een tabelrij: de celwaarde zelf, zonder drijvende-kommaruis.
  const mix = (x: number, y: number) => (f === 0 ? x : f === 1 ? y : x + (y - x) * f);
  const namen: ("c_f" | OverkappingZone)[] = dakvorm === "lessenaar" ? ["c_f", "A", "B", "C"] : ["c_f", "A", "B", "C", "D"];
  const coefficienten = namen.map((naam): OverkappingCoefficient => {
    const o = naam === "c_f" ? onder.cf : onder.zones[naam]!;
    const b = naam === "c_f" ? boven.cf : boven.zones[naam]!;
    const max = mix(o[0], b[0]), min0 = mix(o[1], b[1]), min1 = mix(o[2], b[2]);
    const minPhi = phi === 0 ? min0 : phi === 1 ? min1 : min0 + phi * (min1 - min0);
    return { naam, max, min0, min1, minPhi };
  });
  const rijOnder = f === 1 ? boven.alpha : onder.alpha;
  const rijBoven = f === 0 ? onder.alpha : boven.alpha;
  return { ok: true, tabel, bron, rijOnder, rijBoven, coefficienten };
}

// ── 10. Wrijving, geschakelde overkappingen, kolommen — §7.3(7)/(9), §7.5–7.7 ─

/**
 * Oppervlakteruwheid voor de wrijvingscoëfficiënt c_fr.
 * Bron: NEN-EN 1991-1-4 §7.5(2), tabel 7.10 (afgelezen van de tabelpagina):
 *   glad (bijvoorbeeld staal, glad beton)                    c_fr = 0,01
 *   ruw (bijvoorbeeld ruw beton, beteerde boorden)           c_fr = 0,02
 *   zeer ruw (bijvoorbeeld rimpels, ribben, kronkelingen)    c_fr = 0,04
 * De nationale bijlage wijzigt §7.5 niet (geen NB-bepaling bij 7.5).
 */
export type Oppervlakteruwheid = "glad" | "ruw" | "zeerRuw";

export const TABEL_710_CFR: Record<Oppervlakteruwheid, number> = {
  glad: 0.01,
  ruw: 0.02,
  zeerRuw: 0.04,
};

export const TABEL_710_OMSCHRIJVING: Record<Oppervlakteruwheid, string> = {
  glad: "glad (bijvoorbeeld staal, glad beton)",
  ruw: "ruw (bijvoorbeeld ruw beton, beteerde boorden)",
  zeerRuw: "zeer ruw (bijvoorbeeld rimpels, ribben, kronkelingen)",
};

export const WRIJVING_BRON = "NEN-EN 1991-1-4 §7.3(7), §7.5, tabel 7.10, figuur 7.22";

/**
 * Tabel 7.8 — reductiefactoren ψ_mc voor geschakelde overkappingen, "voor
 * alle φ" (afgelezen van de tabelpagina, per cel):
 *   overkapping 1 (eerste)               op maximaal 1,0 ; op minimaal 0,8
 *   overkapping 2 (tweede)               op maximaal 0,9 ; op minimaal 0,7
 *   overkapping 3 (derde en volgende)    op maximaal 0,7 ; op minimaal 0,7
 * "Op maximaal" = op de maximale (neerwaartse) kracht- en drukcoëfficiënten,
 * "op minimaal" = op de minimale (opwaartse).
 */
export const TABEL_78_PSI_MC: readonly { rang: 1 | 2 | 3; locatie: string; max: number; min: number }[] = [
  { rang: 1, locatie: "eerste overkapping", max: 1.0, min: 0.8 },
  { rang: 2, locatie: "tweede overkapping", max: 0.9, min: 0.7 },
  { rang: 3, locatie: "derde en volgende overkapping", max: 0.7, min: 0.7 },
];

export interface GeschakeldeReductie {
  ok: boolean;
  reden?: string;
  /** Rangnummer in tabel 7.8 (1, 2 of 3). */
  rang: 1 | 2 | 3;
  locatie: string;
  psiMax: number;
  psiMin: number;
}

/**
 * ψ_mc voor overkapping `positie` (1…aantal) in een rij van `aantal`
 * tweezijdig hellende overkappingen (§7.3(9), figuur 7.18).
 *
 * WAAROM VAN BEIDE KANTEN GETELD: figuur 7.18 nummert een rij van zeven
 * overkappingen als 1, 2, 3, 3, 3, 2, 1. De tabelwaarden gelden voor alle
 * windrichtingen, dus de wind kan van beide kanten komen en elke eindoverkapping
 * is een "eerste". Het rangnummer is daarom min(positie, aantal + 1 − positie),
 * begrensd op 3.
 *
 * Eén overkapping is niet geschakeld: dan geldt tabel 7.8 niet en is de
 * aanroeper verantwoordelijk om niet te reduceren (zie de generator).
 */
export function geschakeldeReductie(aantal: number, positie: number): GeschakeldeReductie {
  const weiger = (reden: string): GeschakeldeReductie =>
    ({ ok: false, reden, rang: 1, locatie: "", psiMax: 1, psiMin: 1 });
  if (!Number.isInteger(aantal) || aantal < 2) {
    return weiger("Tabel 7.8 geldt voor geschakelde overkappingen: vul een aantal van 2 of meer in.");
  }
  if (!Number.isInteger(positie) || positie < 1 || positie > aantal) {
    return weiger(`De positie van deze overkapping ligt tussen 1 en ${aantal} (figuur 7.18).`);
  }
  const rang = Math.min(3, positie, aantal + 1 - positie) as 1 | 2 | 3;
  const rij = TABEL_78_PSI_MC.find((r) => r.rang === rang)!;
  return { ok: true, rang, locatie: rij.locatie, psiMax: rij.max, psiMin: rij.min };
}

export const GESCHAKELD_BRON = "NEN-EN 1991-1-4 §7.3(6)/(9), tabel 7.8, figuur 7.18";

/**
 * Doorsnedevorm van de kolommen van een open overkapping, voor c_f,0:
 *  • "scherphoekig" — I-, H-, U-, L- en T-profielen en platen (figuur 7.25),
 *    §7.7(1): c_f = c_f,0 · ψ_λ met c_f,0 = 2,0. De NB-tekst bij 7.7(1)
 *    opmerking 1: "moet voor alle elementen met doorsneden met scherpe randen
 *    2 zijn aangehouden", tenzij nader onderzoek een lagere waarde geeft.
 *  • "rechthoekig" — massieve of kokervormige rechthoekige doorsnede, §7.6(1):
 *    c_f = c_f,0 · ψ_r · ψ_λ met c_f,0 uit figuur 7.23.
 * Cirkelvormig (§7.9.2, figuur 7.28) ontbreekt bewust: zie de generator.
 */
export type KolomDoorsnede = "scherphoekig" | "rechthoekig";

export const CF0_SCHERPHOEKIG = 2.0;

/**
 * Figuur 7.23 — c_f,0 van rechthoekige doorsneden met scherpe hoeken, als de
 * gelabelde snijpunten van de grafiek (afgelezen van de figuurpagina): de
 * lijn loopt vlak op 2,0 tot d/b = 0,2, stijgt naar 2,4 bij d/b = 0,7, daalt
 * naar 1,0 bij d/b = 5 en 0,9 bij d/b = 10, en blijft daarna vlak op 0,9. De
 * hulplijnen van de figuur geven de tussenwaarden 2,35 (d/b = 0,6), 2,1
 * (d/b = 1) en 1,65 (d/b = 2).
 *
 * WAAROM LOGARITMISCH INTERPOLEREN: de d/b-as van figuur 7.23 is
 * logaritmisch (de afstand 0,1→0,2 is gelijk aan 1→2 en 10→20), en de
 * stukken zijn daarop rechte lijnen. Nagerekend: de rechte van (0,7; 2,4) naar
 * (5; 1,0) op een log-as gaat door 2,146 bij d/b = 1 en 1,652 bij d/b = 2 —
 * de gelabelde 2,1 en 1,65; die van (0,2; 2,0) naar (0,7; 2,4) door 2,351 bij
 * 0,6 — de gelabelde 2,35. Tussen de gelabelde punten wordt daarom lineair in
 * log(d/b) geïnterpoleerd; op een gelabeld punt is het de afgelezen waarde.
 */
export const FIGUUR_723_CF0: readonly (readonly [dOverB: number, cf0: number])[] = [
  [0.2, 2.0], [0.6, 2.35], [0.7, 2.4], [1, 2.1], [2, 1.65], [5, 1.0], [10, 0.9],
];

/** c_f,0 uit figuur 7.23 bij d/b (d in de windrichting, b loodrecht erop). */
export function cf0Rechthoekig(dOverB: number): number {
  const p = FIGUUR_723_CF0;
  if (dOverB <= p[0][0]) return p[0][1];
  if (dOverB >= p[p.length - 1][0]) return p[p.length - 1][1];
  for (let k = 0; k < p.length - 1; k++) {
    const [x0, y0] = p[k], [x1, y1] = p[k + 1];
    if (dOverB === x0) return y0;
    if (dOverB === x1) return y1;
    if (dOverB > x0 && dOverB < x1) {
      const f = Math.log(dOverB / x0) / Math.log(x1 / x0);
      return y0 + (y1 - y0) * f;
    }
  }
  return p[p.length - 1][1];
}

/**
 * §7.6(3): plaatachtige doorsneden (d/b < 0,2) "kunnen" bij bepaalde
 * aanstroomrichtingen tot 25 % hogere c_f geven. De generator rekent die
 * toename aan de veilige kant mee (factor 1,25) en meldt dat.
 */
export const PLAATACHTIG_GRENS_DB = 0.2;
export const PLAATACHTIG_TOESLAG = 1.25;

export const KOLOM_BRON: Record<KolomDoorsnede, string> = {
  scherphoekig: "NEN-EN 1991-1-4 §7.7(1), (7.11), figuur 7.25; c_f,0 = 2,0 (NB)",
  rechthoekig: "NEN-EN 1991-1-4 §7.6(1), (7.9), figuur 7.23",
};
