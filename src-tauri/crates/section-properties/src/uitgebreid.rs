//! **Uitgebreide doorsnedegrootheden** — alles wat een constructeur nog uit een
//! getekende doorsnede wil aflezen nadat `A`, `I` en `W` bekend zijn.
//!
//! De filosofie is die van een volwaardige doorsnedeanalyse: één geometrie
//! erin, een *volledige* set grootheden eruit, met een duidelijke scheiding
//! tussen wat om de **globale** assen geldt, wat om de **zwaartepuntsassen**
//! geldt en wat om de **hoofdassen** geldt — en met een eerlijke vlag zodra een
//! grootheid voor deze doorsnede niet te bepalen is.
//!
//! Deze module rekent niets opnieuw wat [`crate::contour`] al exact levert; hij
//! bouwt erop voort:
//!
//! | grootheid | herkomst | nauwkeurigheid |
//! |-----------|----------|----------------|
//! | omtrek, massa per meter | segmentlengtes uit de contour | **exact** |
//! | `Q_y`, `Q_z` om de globale assen | de Green-integralen `∬z dA`, `∬y dA` | **exact** |
//! | `W_u`, `W_v`, `i_u`, `i_v` | de om `−α` teruggedraaide contour | **exact** |
//! | plastisch zwaartepunt, `W_pl;u`, `W_pl;v` | bisectie op de gelijke-oppervlakte-as | **exact** tot machineprecisie |
//! | `β_y`, `β_z`, `z_j`, `y_j` | derde momenten (exact) + schuifmiddelpunt (numeriek) | **zo goed als het schuifmiddelpunt** |
//!
//! ## Assenstelsels
//!
//! * **globaal** — het invoerstelsel: `y` naar rechts, `z` omhoog, oorsprong
//!   waar de invoer hem legt (voor een catalogusprofiel linksonder in de
//!   omhullende rechthoek).
//! * **zwaartepunt** — hetzelfde stelsel, verschoven naar `(y_c, z_c)`.
//! * **hoofdassen** — het zwaartepuntsstelsel, gedraaid over `α`, de hoek van
//!   de y-as naar de hoofdas met de **grootste** traagheid. De coördinaten
//!   heten `u` (langs de sterke as) en `v` (er loodrecht op):
//!
//!   ```text
//!   u =  y·cos α + z·sin α
//!   v = −y·sin α + z·cos α
//!   ```
//!
//!   `I_u = ∬v² dA` is dus buiging **om** de u-as, precies zoals `I_y = ∬z² dA`
//!   buiging om de y-as is.
//!
//! ## De monosymmetrieconstante
//!
//! Voor kip van een doorsnede met ongelijke flenzen heeft NEN-EN 1993-1-1
//! (bijlage over kip, overgenomen uit ENV 1993-1-1 bijlage F) de parameter
//!
//! ```text
//! z_j = z_s − 0,5 · ∬(y² + z²)·z dA / I_y
//! ```
//!
//! waarin `y` en `z` **zwaartepuntscoördinaten** zijn (`z` omhoog positief),
//! `z_s` de z-coördinaat van het **schuifmiddelpunt ten opzichte van het
//! zwaartepunt**, en `I_y` het traagheidsmoment om de zwaartepunts-y-as.
//!
//! In de internationale literatuur staat dezelfde grootheid als de
//! monosymmetrieconstante `β_x` (hier `β_y` genoemd, omdat onze sterke as `y`
//! heet):
//!
//! ```text
//! β_y = ∬(y² + z²)·z dA / I_y − 2·z_s = −2·z_j
//! ```
//!
//! **Tekenafspraak.** Beide volgen rechtstreeks uit het assenstelsel hierboven;
//! er wordt nergens een teken omgeklapt. De gevolgen:
//!
//! * dubbelsymmetrisch (I-profiel, koker, buis, rechthoek): beide termen zijn
//!   nul, dus `z_j = 0` en `β_y = 0`;
//! * een doorsnede met het meeste materiaal **boven** het zwaartepunt (een
//!   T-profiel met de flens boven, een I met een zware bovenflens) krijgt
//!   `z_j > 0`;
//! * dezelfde doorsnede omgekeerd geplaatst krijgt exact `−z_j`.
//!
//! `y_j` en `β_z` zijn de spiegelbeeldige grootheden om de z-as; die zijn de
//! maatgevende voor een doorsnede die om de *andere* as monosymmetrisch is
//! (bijvoorbeeld een U-profiel).

use std::f64::consts::FRAC_PI_2;

use crate::contour::{ContourEigenschappen, DerdeMomenten, Doorsnede};

/// Soortelijke massa van staal (kg/m³) — de standaard als de invoer er geen
/// geeft. Voor hout, aluminium of beton hoort de invoer een eigen waarde mee te
/// sturen; de motor verzint er geen.
pub const DICHTHEID_STAAL_KG_M3: f64 = 7850.0;

/// Massa per strekkende meter (kg/m) uit het oppervlak in mm² en de
/// soortelijke massa in kg/m³: `A[mm²]·10⁻⁶ [m²] · ρ`.
///
/// Controle: IPE 300 heeft `A = 5 381 mm²`, dus `5,381·10⁻³ · 7850 = 42,2 kg/m`
/// — de catalogusmassa.
pub fn massa_kg_per_m(area_mm2: f64, dichtheid_kg_m3: f64) -> f64 {
    area_mm2 * 1e-6 * dichtheid_kg_m3
}

// ════════════════════════════════════════════════════════════════════════════
//  Hoofdassen
// ════════════════════════════════════════════════════════════════════════════

/// De doorsnede gezien vanaf de hoofdassen: hoever het materiaal reikt, wat de
/// weerstandsmomenten naar die vier uiterste vezels zijn en de bijbehorende
/// traagheidsstralen.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Hoofdas {
    /// Uiterste vezels in het hoofdasstelsel, **ten opzichte van het
    /// zwaartepunt** (mm).
    pub u_min_mm: f64,
    pub u_max_mm: f64,
    pub v_min_mm: f64,
    pub v_max_mm: f64,
    /// `I_u / v_max` — naar de vezel aan de **+v**-zijde.
    pub wel_u_plus_mm3: f64,
    /// `I_u / |v_min|` — naar de vezel aan de **−v**-zijde.
    pub wel_u_min_mm3: f64,
    /// `I_v / u_max` — naar de vezel aan de **+u**-zijde.
    pub wel_v_plus_mm3: f64,
    /// `I_v / |u_min|` — naar de vezel aan de **−u**-zijde.
    pub wel_v_min_mm3: f64,
    /// De maatgevende (kleinste) van het paar, zoals `wel_y_mm3` dat is.
    pub wel_u_mm3: f64,
    pub wel_v_mm3: f64,
    /// `√(I_u/A)` en `√(I_v/A)`.
    pub iu_radius_mm: f64,
    pub iv_radius_mm: f64,
}

fn deel(teller: f64, noemer: f64) -> f64 {
    if noemer.abs() > 1e-12 {
        teller / noemer
    } else {
        0.0
    }
}

impl Hoofdas {
    /// Bouw de hoofdasgrootheden uit de uitersten in het hoofdasstelsel en de
    /// al bekende `I_u`, `I_v` en `A`.
    pub fn uit_uitersten(
        (u_min, u_max, v_min, v_max): (f64, f64, f64, f64),
        iu_mm4: f64,
        iv_mm4: f64,
        area_mm2: f64,
    ) -> Hoofdas {
        let wel_u_plus = deel(iu_mm4, v_max);
        let wel_u_min = deel(iu_mm4, -v_min);
        let wel_v_plus = deel(iv_mm4, u_max);
        let wel_v_min = deel(iv_mm4, -u_min);
        Hoofdas {
            u_min_mm: u_min,
            u_max_mm: u_max,
            v_min_mm: v_min,
            v_max_mm: v_max,
            wel_u_plus_mm3: wel_u_plus,
            wel_u_min_mm3: wel_u_min,
            wel_v_plus_mm3: wel_v_plus,
            wel_v_min_mm3: wel_v_min,
            wel_u_mm3: wel_u_plus.min(wel_u_min),
            wel_v_mm3: wel_v_plus.min(wel_v_min),
            iu_radius_mm: if area_mm2 > 0.0 { (iu_mm4 / area_mm2).sqrt() } else { 0.0 },
            iv_radius_mm: if area_mm2 > 0.0 { (iv_mm4 / area_mm2).sqrt() } else { 0.0 },
        }
    }
}

/// De uitersten `(u_min, u_max, v_min, v_max)` van een doorsnede in haar eigen
/// hoofdasstelsel.
///
/// De contour wordt naar het zwaartepunt verschoven en dán over `−α` gedraaid;
/// in dat stelsel is de nieuwe y-coördinaat `u` en de nieuwe z-coördinaat `v`.
/// De omhullende rechthoek daarvan is exact wat we zoeken — inclusief de
/// uiterste punten *op* een boog, want [`Doorsnede::uitersten`] neemt de
/// kardinale punten van elke boog mee.
pub fn hoofdas_uitersten(d: &Doorsnede, e: &ContourEigenschappen) -> (f64, f64, f64, f64) {
    d.verschoven(-e.y_c_mm, -e.z_c_mm)
        .gedraaid(-e.alpha_hoofdas_rad)
        .uitersten()
}

/// Hoofdasgrootheden van een doorsnede die als contour bekend is.
pub fn hoofdas_van_doorsnede(d: &Doorsnede, e: &ContourEigenschappen) -> Hoofdas {
    Hoofdas::uit_uitersten(hoofdas_uitersten(d, e), e.iu_mm4, e.iv_mm4, e.a_mm2)
}

// ════════════════════════════════════════════════════════════════════════════
//  Plastisch
// ════════════════════════════════════════════════════════════════════════════

/// Het plastische gedrag om de **hoofdassen**: de gelijke-oppervlakte-assen en
/// de weerstandsmomenten daaromheen.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PlastischHoofdas {
    pub wpl_u_mm3: f64,
    pub wpl_v_mm3: f64,
    /// Plastisch zwaartepunt in het hoofdasstelsel, **ten opzichte van het
    /// elastische zwaartepunt** (mm). `u_pna` is de plek waar de as loodrecht
    /// op `u` het oppervlak doormidden deelt, `v_pna` idem loodrecht op `v`.
    pub u_pna_mm: f64,
    pub v_pna_mm: f64,
}

/// Plastische grootheden om de hoofdassen.
///
/// [`Doorsnede::wpl_om_as`] draait de doorsnede zelf over `−α` en zoekt de
/// gelijke-oppervlakte-as met bisectie; de teruggegeven `as_afstand_mm` is de
/// coördinaat van die as in de richting **loodrecht** op de gevraagde as.
///
/// * `α` geeft dus `W_pl;u` met `as_afstand = v_pna`;
/// * `α + π/2` geeft `W_pl;v`, en daar is de vezelrichting `−u`, dus
///   `u_pna = −as_afstand`. Dat is dezelfde correctie die
///   [`ContourEigenschappen::y_pna_mm`] om de z-as maakt.
pub fn plastisch_hoofdas(d: &Doorsnede, alpha_rad: f64) -> PlastischHoofdas {
    let pu = d.wpl_om_as(alpha_rad);
    let pv = d.wpl_om_as(alpha_rad + FRAC_PI_2);
    PlastischHoofdas {
        wpl_u_mm3: pu.wpl_mm3,
        wpl_v_mm3: pv.wpl_mm3,
        u_pna_mm: -pv.as_afstand_mm,
        v_pna_mm: pu.as_afstand_mm,
    }
}

/// Vormfactor `W_pl / W_el`: hoeveel reserve er tussen eerste vloei en volledig
/// plastisch zit. Voor een rechthoek exact 1,5; voor een gewalst I-profiel om
/// de sterke as ongeveer 1,13.
///
/// `W_el` is hier de **maatgevende** (kleinste) waarde, dus de vezel het verst
/// van de neutrale as — dezelfde afspraak als `wel_y_mm3`.
pub fn vormfactor(wpl_mm3: f64, wel_mm3: f64) -> f64 {
    deel(wpl_mm3, wel_mm3)
}

// ════════════════════════════════════════════════════════════════════════════
//  Monosymmetrie
// ════════════════════════════════════════════════════════════════════════════

/// De monosymmetrieconstanten en de daaruit volgende `z_j` / `y_j`.
///
/// Zie de moduledocumentatie voor de definitie en de tekenafspraak.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Monosymmetrie {
    /// `β_y = ∬(y² + z²)·z dA / I_y − 2·z_s` (mm). In de literatuur `β_x`.
    pub beta_y_mm: f64,
    /// `β_z = ∬(y² + z²)·y dA / I_z − 2·y_s` (mm). In de literatuur `β_y`.
    pub beta_z_mm: f64,
    /// `z_j = z_s − 0,5·∬(y² + z²)·z dA / I_y = −β_y/2` (mm) — de parameter uit
    /// de kipbijlage van NEN-EN 1993-1-1.
    pub z_j_mm: f64,
    /// Het spiegelbeeld om de z-as: `y_j = −β_z/2` (mm).
    pub y_j_mm: f64,
}

/// Bereken `β` en `z_j` uit de derde momenten **om het zwaartepunt** en het
/// schuifmiddelpunt, eveneens ten opzichte van het zwaartepunt.
///
/// De aanroeper moet dus zelf naar het zwaartepunt verschuiven; dat is met
/// opzet, want de derde momenten om de oorsprong hebben grote Steiner-termen en
/// het zou verkeerd gaan als hier stilzwijgend het invoerstelsel werd gebruikt.
pub fn monosymmetrie(
    m3: DerdeMomenten,
    iy_mm4: f64,
    iz_mm4: f64,
    y_s_rel_mm: f64,
    z_s_rel_mm: f64,
) -> Monosymmetrie {
    // ∬(y² + z²)·z dA = ∬y²z dA + ∬z³ dA
    let integraal_z = m3.iyyz_mm5 + m3.izzz_mm5;
    // ∬(y² + z²)·y dA = ∬y³ dA + ∬yz² dA
    let integraal_y = m3.iyyy_mm5 + m3.iyzz_mm5;

    let beta_y = deel(integraal_z, iy_mm4) - 2.0 * z_s_rel_mm;
    let beta_z = deel(integraal_y, iz_mm4) - 2.0 * y_s_rel_mm;
    Monosymmetrie {
        beta_y_mm: beta_y,
        beta_z_mm: beta_z,
        z_j_mm: -0.5 * beta_y,
        y_j_mm: -0.5 * beta_z,
    }
}

/// Idem, maar rechtstreeks vanaf een contour: de derde momenten worden om het
/// zwaartepunt genomen en het schuifmiddelpunt komt in het **invoerstelsel**
/// binnen (zoals de torsiemotor het teruggeeft).
pub fn monosymmetrie_van_doorsnede(
    d: &Doorsnede,
    e: &ContourEigenschappen,
    y_s_mm: f64,
    z_s_mm: f64,
) -> Monosymmetrie {
    let m3 = d
        .verschoven(-e.y_c_mm, -e.z_c_mm)
        .derde_momenten_om_oorsprong();
    monosymmetrie(m3, e.iy_mm4, e.iz_mm4, y_s_mm - e.y_c_mm, z_s_mm - e.z_c_mm)
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contour::{i_profiel, rechthoek, Contour, Segment};
    use crate::motor::{bereken_uitgebreid, Profielvorm};
    use std::f64::consts::PI;

    fn rel(gemeten: f64, verwacht: f64) -> f64 {
        ((gemeten - verwacht) / verwacht).abs()
    }

    /// Een T-profiel uit twee rechthoeken: flens `b × tf` bovenop een lijf
    /// `tw × (h − tf)`. Zonder walsuitrondingen, zodat elke grootheid met de
    /// hand na te rekenen is. De linkeronderhoek van het lijf ligt op de
    /// oorsprong van de omhullende rechthoek.
    fn t_profiel(h: f64, b: f64, tw: f64, tf: f64) -> Doorsnede {
        let hw = h - tf;
        Doorsnede::nieuw()
            .met(Contour::rechthoek((b - tw) / 2.0, 0.0, tw, hw))
            .met(Contour::rechthoek(0.0, hw, b, tf))
    }

    /// Twee rechthoeken die op één lijn aansluiten tellen bij de contourkern
    /// gewoon op — controleer dat het T-profiel klopt voordat er conclusies
    /// aan worden verbonden.
    #[test]
    fn t_profiel_klopt_met_de_hand() {
        let (h, b, tw, tf) = (200.0, 150.0, 10.0, 20.0);
        let e = t_profiel(h, b, tw, tf).bereken();
        let a_lijf = tw * (h - tf);
        let a_flens = b * tf;
        assert!(rel(e.a_mm2, a_lijf + a_flens) < 1e-12);
        // Zwaartepunt: (A_lijf·z_lijf + A_flens·z_flens)/A.
        let z_c = (a_lijf * (h - tf) / 2.0 + a_flens * (h - tf / 2.0)) / (a_lijf + a_flens);
        assert!(rel(e.z_c_mm, z_c) < 1e-12, "z_c = {}", e.z_c_mm);
        // Symmetrisch om de z-as door het midden.
        assert!((e.y_c_mm - b / 2.0).abs() < 1e-9);
        assert!(e.iyz_mm4.abs() < 1e-6 * e.iy_mm4);
    }

    // ── Massa ───────────────────────────────────────────────────────────────

    #[test]
    fn massa_van_ipe300_is_de_catalogusmassa() {
        let a = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0).bereken().a_mm2;
        let m = massa_kg_per_m(a, DICHTHEID_STAAL_KG_M3);
        // Catalogus IPE 300: 42,2 kg/m.
        assert!((m - 42.2).abs() < 0.1, "massa = {m:.3} kg/m");
    }

    // ── Hoofdassen ──────────────────────────────────────────────────────────

    /// Voor een rechthoek vallen de hoofdassen samen met y en z, dus `W_u` en
    /// `W_v` moeten letterlijk `W_y` en `W_z` zijn.
    #[test]
    fn hoofdas_van_een_rechthoek_valt_samen_met_yz() {
        let (b, h) = (100.0, 300.0);
        let d = rechthoek(h, b);
        let e = d.bereken();
        let hf = hoofdas_van_doorsnede(&d, &e);
        assert!(rel(hf.wel_u_plus_mm3, b * h * h / 6.0) < 1e-12);
        assert!(rel(hf.wel_u_min_mm3, b * h * h / 6.0) < 1e-12);
        assert!(rel(hf.wel_v_plus_mm3, h * b * b / 6.0) < 1e-12);
        assert!(rel(hf.iu_radius_mm, h / 12f64.sqrt()) < 1e-12);
        assert!(rel(hf.iv_radius_mm, b / 12f64.sqrt()) < 1e-12);
    }

    /// Draai een rechthoek over 30°: `I_u + I_v` is invariant, de hoofdassen
    /// draaien mee, en elke hoofdas-grootheid komt op precies dezelfde waarde
    /// uit als bij het ongedraaide profiel.
    #[test]
    fn gedraaide_rechthoek_geeft_dezelfde_hoofdasgrootheden() {
        let (b, h) = (100.0, 300.0);
        let recht = rechthoek(h, b);
        let e0 = recht.bereken();
        let hf0 = hoofdas_van_doorsnede(&recht, &e0);
        let pl0 = plastisch_hoofdas(&recht, e0.alpha_hoofdas_rad);

        let hoek = 30f64.to_radians();
        let gedraaid = recht.gedraaid(hoek);
        let e1 = gedraaid.bereken();
        let hf1 = hoofdas_van_doorsnede(&gedraaid, &e1);
        let pl1 = plastisch_hoofdas(&gedraaid, e1.alpha_hoofdas_rad);

        // I_y + I_z is de spoor van de traagheidstensor en dus invariant.
        assert!(rel(e1.iy_mm4 + e1.iz_mm4, e0.iy_mm4 + e0.iz_mm4) < 1e-12);
        assert!(rel(e1.iu_mm4, e0.iu_mm4) < 1e-12);
        assert!(rel(e1.iv_mm4, e0.iv_mm4) < 1e-12);
        // α draait mee: 0° → 30°.
        assert!((e1.alpha_hoofdas_rad - hoek).abs() < 1e-9, "α = {}", e1.alpha_hoofdas_rad);
        // En alle hoofdas-grootheden zijn onveranderd.
        assert!(rel(hf1.wel_u_plus_mm3, hf0.wel_u_plus_mm3) < 1e-9);
        assert!(rel(hf1.wel_v_plus_mm3, hf0.wel_v_plus_mm3) < 1e-9);
        assert!(rel(hf1.iu_radius_mm, hf0.iu_radius_mm) < 1e-12);
        assert!(rel(hf1.iv_radius_mm, hf0.iv_radius_mm) < 1e-12);
        assert!(rel(pl1.wpl_u_mm3, pl0.wpl_u_mm3) < 1e-9);
        assert!(rel(pl1.wpl_v_mm3, pl0.wpl_v_mm3) < 1e-9);
    }

    /// Bij een gedraaide doorsnede hoort `I_u` óók te volgen uit het
    /// traagheidsmoment van de teruggedraaide contour — dat is een
    /// onafhankelijke weg naar hetzelfde getal.
    #[test]
    fn iu_is_iy_van_de_teruggedraaide_contour() {
        let d = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0).gedraaid(0.7);
        let e = d.bereken();
        let terug = d
            .verschoven(-e.y_c_mm, -e.z_c_mm)
            .gedraaid(-e.alpha_hoofdas_rad)
            .bereken();
        assert!(rel(terug.iy_mm4, e.iu_mm4) < 1e-10);
        assert!(rel(terug.iz_mm4, e.iv_mm4) < 1e-10);
        assert!(terug.iyz_mm4.abs() < 1e-9 * e.iu_mm4);
    }

    // ── Plastisch ───────────────────────────────────────────────────────────

    /// Rechthoek: `W_pl/W_el = 1,5` exact, en de plastische neutrale as ligt op
    /// halve hoogte — samen met het elastische zwaartepunt.
    #[test]
    fn vormfactor_van_een_rechthoek_is_anderhalf() {
        let (b, h) = (100.0, 300.0);
        let d = rechthoek(h, b);
        let e = d.bereken();
        assert!(rel(vormfactor(e.wpl_y_mm3, e.wel_y_boven_mm3), 1.5) < 1e-9);
        assert!(rel(vormfactor(e.wpl_z_mm3, e.wel_z_links_mm3), 1.5) < 1e-9);
        assert!((e.z_pna_mm - h / 2.0).abs() < 1e-6, "z_pna = {}", e.z_pna_mm);
        assert!((e.y_pna_mm - b / 2.0).abs() < 1e-6);
        let pl = plastisch_hoofdas(&d, e.alpha_hoofdas_rad);
        assert!(pl.u_pna_mm.abs() < 1e-6 && pl.v_pna_mm.abs() < 1e-6);
    }

    /// IPE 300: `W_pl;y` uit de catalogus is 628 356 mm³ en de vormfactor ligt
    /// rond 1,13. Dat is de controle dat de plastische rekengang niet alleen op
    /// een rechthoek klopt.
    #[test]
    fn vormfactor_van_ipe300() {
        let d = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0);
        let e = d.bereken();
        assert!(
            rel(e.wpl_y_mm3, 628_356.0) < 5e-3,
            "Wpl;y = {:.0} mm³ tegen 628 356",
            e.wpl_y_mm3
        );
        let f = vormfactor(e.wpl_y_mm3, e.wel_y_boven_mm3.min(e.wel_y_onder_mm3));
        assert!((1.10..1.16).contains(&f), "vormfactor = {f:.4}");
    }

    /// Een T-profiel: de plastische neutrale as ligt NIET op het elastische
    /// zwaartepunt. Met de hand: de gelijke-oppervlakte-as ligt daar waar het
    /// halve oppervlak boven ligt; bij een flens die groter is dan de helft van
    /// het totaal ligt die as in de flens, dus hoog — boven het elastische
    /// zwaartepunt.
    #[test]
    fn plastische_as_van_een_t_profiel_ligt_niet_op_het_zwaartepunt() {
        let (h, b, tw, tf) = (200.0, 150.0, 10.0, 20.0);
        let d = t_profiel(h, b, tw, tf);
        let e = d.bereken();
        let a_lijf = tw * (h - tf);
        let a_flens = b * tf;
        let a = a_lijf + a_flens;
        // De flens (3000 mm²) is groter dan de helft (2400 mm²): de PNA ligt in
        // de flens, op (A/2 − A_lijf)/b boven de flensonderkant.
        assert!(a_flens > a / 2.0);
        let z_pna = (h - tf) + (a / 2.0 - a_lijf) / b;
        assert!(rel(e.z_pna_mm, z_pna) < 1e-9, "z_pna = {}", e.z_pna_mm);
        assert!(e.z_pna_mm > e.z_c_mm + 1.0, "de PNA hoort boven het zwaartepunt te liggen");
        // Wpl = A/2 · afstand tussen de zwaartepunten van beide helften.
        assert!(e.wpl_y_mm3 > 0.0);
        // Om de z-as is het T-profiel wél symmetrisch: de PNA valt samen.
        assert!((e.y_pna_mm - e.y_c_mm).abs() < 1e-6);
    }

    // ── Monosymmetrie ───────────────────────────────────────────────────────

    /// Dubbelsymmetrisch: `z_j = 0` en `β_y = 0`, ongeacht waar de doorsnede in
    /// het vlak ligt. Het schuifmiddelpunt komt hier uit de numerieke torsie,
    /// dus de tolerantie is die van de mesh, niet die van de contour.
    #[test]
    fn zj_is_nul_voor_een_i_profiel() {
        let vorm = Profielvorm::IProfiel { h: 300.0, b: 150.0, tw: 7.1, tf: 10.7, r: 15.0 };
        let m = bereken_uitgebreid(&vorm, None);
        let d = vorm.doorsnede();
        let mono = monosymmetrie_van_doorsnede(&d, &m.contour, m.props.y_s_mm, m.props.z_s_mm);
        // Schaal: een halve profielhoogte. z_j hoort verwaarloosbaar te zijn.
        assert!(mono.z_j_mm.abs() < 0.5, "z_j = {:.4} mm", mono.z_j_mm);
        assert!(mono.y_j_mm.abs() < 0.5, "y_j = {:.4} mm", mono.y_j_mm);
        // De vaste betrekking β_y = −2·z_j hoort er altijd te staan.
        assert!((mono.beta_y_mm + 2.0 * mono.z_j_mm).abs() < 1e-12);
        assert!((mono.beta_z_mm + 2.0 * mono.y_j_mm).abs() < 1e-12);
    }

    /// De exacte helft van `z_j` — de contourterm `0,5·∬(y²+z²)z dA / I_y` — is
    /// voor een dubbelsymmetrisch profiel exact nul. Die kan zonder mesh
    /// getoetst worden en sluit uit dat een fout in de derde momenten door de
    /// meshtolerantie heen glipt.
    #[test]
    fn contourterm_van_zj_is_exact_nul_bij_dubbele_symmetrie() {
        let d = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0);
        let e = d.bereken();
        // Schuifmiddelpunt exact op het zwaartepunt gezet: dan is z_j puur de
        // contourterm.
        let mono = monosymmetrie_van_doorsnede(&d, &e, e.y_c_mm, e.z_c_mm);
        assert!(mono.z_j_mm.abs() < 1e-9, "z_j = {:.3e}", mono.z_j_mm);
        assert!(mono.y_j_mm.abs() < 1e-9);
    }

    /// Een T-profiel met de flens **boven**: `z_j` is ongelijk nul en positief
    /// (het meeste materiaal zit boven het zwaartepunt). Draai je hetzelfde
    /// profiel om, dan komt er exact `−z_j` uit — dat is de tekencontrole.
    #[test]
    fn zj_van_een_t_profiel_heeft_teken_en_keert_om() {
        let (h, b, tw, tf) = (200.0, 150.0, 10.0, 20.0);
        let d = t_profiel(h, b, tw, tf);
        let e = d.bereken();
        // Het T-profiel is symmetrisch om zijn verticale as, dus het
        // schuifmiddelpunt ligt op y_c; de z-ligging doet er voor de
        // tekencontrole niet toe zolang beide oriëntaties hem consistent
        // krijgen. Hier: schuifmiddelpunt in het snijpunt van de plaatmiddens,
        // wat voor een T exact klopt (beide platen gaan door dat punt).
        let z_s = h - tf / 2.0;
        let mono = monosymmetrie_van_doorsnede(&d, &e, b / 2.0, z_s);
        assert!(mono.z_j_mm > 1.0, "z_j = {:.3} mm, verwacht duidelijk positief", mono.z_j_mm);

        // Omgekeerd: spiegel om z = h/2 door 180° te draaien en terug te
        // schuiven. Alles wat met z te maken heeft klapt om.
        let om = d.gedraaid(PI).verschoven(b, h);
        let eo = om.bereken();
        assert!(rel(eo.a_mm2, e.a_mm2) < 1e-12);
        assert!((eo.z_c_mm - (h - e.z_c_mm)).abs() < 1e-9);
        let mono_om = monosymmetrie_van_doorsnede(&om, &eo, b / 2.0, h - z_s);
        assert!(
            rel(mono_om.z_j_mm, -mono.z_j_mm) < 1e-9,
            "omgekeerd z_j = {:.6}, verwacht {:.6}",
            mono_om.z_j_mm,
            -mono.z_j_mm
        );
        // Om de z-as blijft het T-profiel symmetrisch: y_j = 0.
        assert!(mono.y_j_mm.abs() < 1e-9);
    }

    /// `z_j` uitgeschreven voor een T-profiel, met de integraal met de hand
    /// opgebouwd uit twee rechthoeken. Voor een rechthoek `[y₀,y₁]×[z₀,z₁]`
    /// splitst de integraal in twee producten van enkelvoudige integralen:
    ///
    /// ```text
    /// ∬(y² + z²)·z dA = ⅓(y₁³−y₀³)·½(z₁²−z₀²) + (y₁−y₀)·¼(z₁⁴−z₀⁴)
    /// ```
    ///
    /// alles in zwaartepuntscoördinaten van de héle doorsnede.
    #[test]
    fn zj_van_een_t_profiel_tegen_handberekening() {
        let (h, b, tw, tf) = (200.0, 150.0, 10.0, 20.0);
        let d = t_profiel(h, b, tw, tf);
        let e = d.bereken();
        let hw = h - tf;

        // Rechthoeken in zwaartepuntscoördinaten.
        let integraal = |y0: f64, y1: f64, z0: f64, z1: f64| {
            let (y0, y1) = (y0 - e.y_c_mm, y1 - e.y_c_mm);
            let (z0, z1) = (z0 - e.z_c_mm, z1 - e.z_c_mm);
            (y1.powi(3) - y0.powi(3)) / 3.0 * (z1 * z1 - z0 * z0) / 2.0
                + (y1 - y0) * (z1.powi(4) - z0.powi(4)) / 4.0
        };
        let met_de_hand =
            integraal((b - tw) / 2.0, (b + tw) / 2.0, 0.0, hw) + integraal(0.0, b, hw, h);

        let m3 = d
            .verschoven(-e.y_c_mm, -e.z_c_mm)
            .derde_momenten_om_oorsprong();
        let gemeten = m3.iyyz_mm5 + m3.izzz_mm5;
        assert!(
            rel(gemeten, met_de_hand) < 1e-10,
            "∬(y²+z²)z dA = {gemeten:.6e}, met de hand {met_de_hand:.6e}"
        );

        // En daarmee z_j = z_s − 0,5·integraal/I_y. Met de hand:
        //   A = 1800 + 3000 = 4800 mm², z_c = 152,5 mm, I_y = 16 210 000 mm⁴,
        //   ∬(y²+z²)z dA = −971 250 000 mm⁵, z_s − z_c = 37,5 mm
        //   ⇒ z_j = 37,5 + 0,5·971 250 000/16 210 000 = 67,46 mm.
        let z_s = h - tf / 2.0;
        assert!(rel(e.iy_mm4, 16_210_000.0) < 1e-12, "I_y = {:.1}", e.iy_mm4);
        assert!(rel(met_de_hand, -971_250_000.0) < 1e-12);
        let verwacht = (z_s - e.z_c_mm) - 0.5 * met_de_hand / e.iy_mm4;
        let mono = monosymmetrie_van_doorsnede(&d, &e, b / 2.0, z_s);
        assert!(rel(mono.z_j_mm, verwacht) < 1e-10, "z_j = {:.6}", mono.z_j_mm);
        assert!((mono.z_j_mm - 67.46).abs() < 0.01, "z_j = {:.4} mm", mono.z_j_mm);
    }

    /// Segmentlengtes: een kwartcirkel met straal `r` is `πr/2` lang.
    #[test]
    fn segmentlengte_van_een_boog() {
        let s = Segment::Boog { centrum: (0.0, 0.0), straal: 10.0, theta1: 0.0, theta2: PI / 2.0 };
        assert!(rel(s.lengte_mm(), PI * 5.0) < 1e-12);
        let l = Segment::Lijn { van: (0.0, 0.0), naar: (3.0, 4.0) };
        assert!(rel(l.lengte_mm(), 5.0) < 1e-12);
    }
}
