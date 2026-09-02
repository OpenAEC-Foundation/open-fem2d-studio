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
  /** Korte omschrijving voor de UI (welke regio's). */
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
