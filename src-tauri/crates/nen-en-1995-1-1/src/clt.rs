//! Kruislaaghout (CLT) — doorsnedemodel, effectieve stijfheid en de
//! spanningsverdeling over de lagen bij buiging om de sterke as.
//!
//! # Methode: samengestelde doorsnede met starre verbinding
//!
//! NEN-EN 1995-1-1 kent kruislaaghout niet als apart product. Twee routes
//! zijn gangbaar om een CLT-plaat toch met deze norm te toetsen:
//!
//! 1. de gamma-methode van bijlage B (mechanisch verbonden liggers), waarbij
//!    de dwarslaag de "verbinding" is en de slipmodulus K/s wordt vervangen
//!    door de rolschuifstijfheid G_R·b/t_dwars van die laag;
//! 2. de samengestelde doorsnede met starre verbinding: alleen de
//!    lengtelagen dragen in de spanrichting (E = E_0,mean), de dwarslagen
//!    brengen als schuifverbinding de lengtelagen tot samenwerking maar
//!    dragen zelf niet mee (E in spanrichting = 0).
//!
//! Hier is route 2 gekozen, om twee redenen:
//!
//! - De gamma-methode vraagt om G_R. Die waarde staat niet in NEN-EN
//!   1995-1-1+A2:2014/NB:2013 en niet in de sterkteklassen van EN 338
//!   (`data.rs` kent alleen G_mean). Hem aannemen zou een verzonnen
//!   normwaarde zijn; hem als vrije invoer opnemen zou een getal uit een
//!   productverklaring vragen dat de gebruiker hier niet heeft.
//! - Bijlage B is geschreven voor drie delen (B.4: γ_2 = 1, γ_1 en γ_3 uit
//!   B.5); 5- en 7-laags opbouwen vallen daar niet onder zonder de
//!   uitgebreide gamma-methode, die de norm niet geeft.
//!
//! Route 2 is precies bijlage B met γ_i = 1 voor alle lagen (starre
//! verbinding): (B.1) wordt (EI)_ef = Σ E_i·(I_i + A_i·a_i²), (B.7)+(B.8)
//! worden samen σ_i(z) = E_i·M·(z − z_0)/(EI)_ef en (B.9) wordt
//! τ(z) = V·(ES)(z)/((EI)_ef·b). De verwijzingen naar bijlage B hieronder
//! zijn zo te lezen.
//!
//! # Beperking (expliciet)
//!
//! De starre verbinding verwaarloost de schuifvervorming van de dwarslagen.
//! (EI)_ef is daarmee een bovengrens en de randspanningen een ondergrens;
//! het verschil met de gamma-methode is klein voor slanke platen en groeit
//! bij korte, dikke platen. De orkestratie rapporteert daarom de slankheid
//! L/h en waarschuwt beneden L/h = 20. Dat is een aanname van deze
//! implementatie, geen normgrens.
//!
//! # Aannamen met vindplaats
//!
//! - Lengtelagen: E_i = E_0,mean van de sterkteklasse (EN 338 via
//!   `data.rs`; bijlage B.2 (1): "met gemiddelde waarden voor E").
//! - Dwarslagen: E_i = 0 in de spanrichting. E_90,mean (≈ 3 % van E_0) is
//!   bewust niet meegenomen: verwaarlozen is veilig-zijdig voor de
//!   spanningen in de lengtelagen en verwaarloosbaar voor de stijfheid.
//! - Zwaartelijn: E-gewogen (bijlage B.2, vergelijking (B.6) met γ_i = 1).
//! - Sterkteklassen van de lamellen: de bestaande C- en GL-klassen uit
//!   `data.rs`; er zijn geen CLT-specifieke sterktewaarden ingevoerd.
//!
//! # Conventies
//!
//! z loopt van de bovenkant (z = 0) naar de onderkant (z = h). Momenten
//! volgen `mechanics::InternalForces`: M_y positief = trek in de onderste
//! vezel. Spanningen zijn trek-positief.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::data::{strength_class_by_name, StrengthClass};

/// Vezelrichting van een laag ten opzichte van de spanrichting van de staaf.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub enum CltLayerOrientation {
    /// Lengtelaag: vezels in de spanrichting — draagt buiging en dwarskracht.
    Longitudinal,
    /// Dwarslaag: vezels loodrecht op de spanrichting — schuifverbinding;
    /// ondervindt rolschuiving.
    Transverse,
}

impl CltLayerOrientation {
    /// Nederlandse benaming voor rapport en meldingen.
    pub fn label_nl(self) -> &'static str {
        match self {
            CltLayerOrientation::Longitudinal => "lengte",
            CltLayerOrientation::Transverse => "dwars",
        }
    }
}

/// Eén lamel (laag) van de opbouw.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CltLayer {
    /// Laagdikte in mm.
    pub thickness_mm: f64,
    pub orientation: CltLayerOrientation,
    /// Sterkteklasse van de lamellen in deze laag, bijv. "C24" (EN 338).
    pub strength_class: String,
}

/// De opbouw van een CLT-doorsnede: een plaatstrook van breedte `width_mm`
/// met lagen van boven (index 0) naar beneden.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CltLayup {
    /// Breedte van de beschouwde plaatstrook in mm (gebruikelijk 1000).
    pub width_mm: f64,
    /// Lagen van boven naar beneden.
    pub layers: Vec<CltLayer>,
}

/// Voorinstelling: een gangbare symmetrische opbouw, vrij aanpasbaar.
/// De lagen wisselen af lengte/dwars/lengte/…, beginnend met een lengtelaag.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CltPreset {
    /// Naam zoals in de keuzelijst, bijv. "5-laags 160".
    pub name: String,
    /// Laagdikten van boven naar beneden in mm.
    pub thicknesses_mm: Vec<f64>,
    /// Totale dikte in mm.
    pub height_mm: f64,
}

/// Standaardopbouwen (3-, 5- en 7-laags). Dit zijn VOORINSTELLINGEN — ronde
/// lameldikten van 20/30/40 mm in symmetrische opbouw — geen normwaarden en
/// geen productmaten. De gebruiker past ze vrij aan.
pub fn clt_presets() -> Vec<CltPreset> {
    let maak = |name: &str, t: &[f64]| CltPreset {
        name: name.to_string(),
        thicknesses_mm: t.to_vec(),
        height_mm: t.iter().sum(),
    };
    vec![
        maak("3-laags 60", &[20.0, 20.0, 20.0]),
        maak("3-laags 90", &[30.0, 30.0, 30.0]),
        maak("3-laags 120", &[40.0, 40.0, 40.0]),
        maak("5-laags 100", &[20.0, 20.0, 20.0, 20.0, 20.0]),
        maak("5-laags 140", &[40.0, 20.0, 20.0, 20.0, 40.0]),
        maak("5-laags 160", &[40.0, 20.0, 40.0, 20.0, 40.0]),
        maak("5-laags 200", &[40.0, 40.0, 40.0, 40.0, 40.0]),
        maak("7-laags 200", &[30.0, 20.0, 30.0, 40.0, 30.0, 20.0, 30.0]),
        maak("7-laags 240", &[40.0, 30.0, 30.0, 40.0, 30.0, 30.0, 40.0]),
        maak("7-laags 280", &[40.0, 40.0, 40.0, 40.0, 40.0, 40.0, 40.0]),
    ]
}

impl CltLayup {
    pub fn new(width_mm: f64, layers: Vec<CltLayer>) -> Self {
        Self { width_mm, layers }
    }

    /// Opbouw met afwisselende richting (lengte/dwars/lengte/…), één
    /// sterkteklasse voor alle lagen — de gebruikelijke CLT-opbouw.
    pub fn alternating(width_mm: f64, thicknesses_mm: &[f64], strength_class: &str) -> Self {
        let layers = thicknesses_mm
            .iter()
            .enumerate()
            .map(|(i, &t)| CltLayer {
                thickness_mm: t,
                orientation: if i % 2 == 0 {
                    CltLayerOrientation::Longitudinal
                } else {
                    CltLayerOrientation::Transverse
                },
                strength_class: strength_class.to_string(),
            })
            .collect();
        Self { width_mm, layers }
    }

    /// Totale dikte h = Σ t_i (mm).
    pub fn height_mm(&self) -> f64 {
        self.layers.iter().map(|l| l.thickness_mm).sum()
    }

    /// Aantal lengtelagen.
    pub fn n_longitudinal(&self) -> usize {
        self.layers
            .iter()
            .filter(|l| l.orientation == CltLayerOrientation::Longitudinal)
            .count()
    }

    /// Korte naam: "CLT 40/20/40/20/40".
    pub fn name(&self) -> String {
        let dikten: Vec<String> = self.layers.iter().map(|l| format!("{:.0}", l.thickness_mm)).collect();
        format!("CLT {}", dikten.join("/"))
    }

    /// Sterkteklassen die voorkomen, in volgorde van eerste voorkomen,
    /// als "C24" of "C24/C16".
    pub fn strength_classes_label(&self) -> String {
        let mut uniek: Vec<&str> = Vec::new();
        for l in &self.layers {
            if !uniek.iter().any(|u| u.eq_ignore_ascii_case(&l.strength_class)) {
                uniek.push(&l.strength_class);
            }
        }
        uniek.join("/")
    }

    /// Controleer of de opbouw rekenbaar is. Een fout is een Nederlandse
    /// melding voor de gebruiker.
    pub fn validate(&self) -> Result<(), String> {
        if !(self.width_mm > 0.0) {
            return Err(format!("plaatbreedte b = {} mm is niet positief", self.width_mm));
        }
        if self.layers.len() < 3 {
            return Err(format!(
                "een CLT-opbouw heeft minstens 3 lagen (nu {})",
                self.layers.len()
            ));
        }
        for (i, l) in self.layers.iter().enumerate() {
            if !(l.thickness_mm > 0.0) {
                return Err(format!("laag {} heeft dikte {} mm — moet positief zijn", i + 1, l.thickness_mm));
            }
            if strength_class_by_name(&l.strength_class).is_none() {
                return Err(format!(
                    "laag {}: sterkteklasse \"{}\" onbekend (bekend: EN 338 C14–C35, EN 14080 GL24h–GL36h)",
                    i + 1,
                    l.strength_class
                ));
            }
        }
        if self.n_longitudinal() == 0 {
            return Err("de opbouw heeft geen enkele lengtelaag — niets draagt in de spanrichting".to_string());
        }
        Ok(())
    }

    /// Mechanische grootheden van de opbouw (zwaartelijn, (EI)_ef, …).
    pub fn mechanics(&self) -> Result<CltMechanics, String> {
        self.validate()?;
        CltMechanics::from_layup(self)
    }
}

/// Geometrie en stijfheidsbijdrage van één laag.
#[derive(Clone, Copy, Debug)]
pub struct LayerGeometry {
    /// Index 0 = bovenste laag.
    pub index: usize,
    pub orientation: CltLayerOrientation,
    /// Sterkteklasse van de lamellen.
    pub class: &'static StrengthClass,
    /// Bovenkant en onderkant van de laag, vanaf de bovenkant van de plaat (mm).
    pub z_top_mm: f64,
    pub z_bot_mm: f64,
    /// Rekenwaarde van E in de spanrichting: E_0,mean voor lengtelagen,
    /// 0 voor dwarslagen (N/mm²).
    pub e_mpa: f64,
    /// A_i = b·t_i (mm²), bijlage B (B.2).
    pub area_mm2: f64,
    /// I_i = b·t_i³/12 (mm⁴), bijlage B (B.3).
    pub i_own_mm4: f64,
    /// a_i: afstand van het laagzwaartepunt tot de zwaartelijn (mm),
    /// positief naar beneden.
    pub arm_mm: f64,
}

impl LayerGeometry {
    pub fn thickness_mm(&self) -> f64 {
        self.z_bot_mm - self.z_top_mm
    }

    /// Bijdrage E_i·(I_i + A_i·a_i²) aan (EI)_ef (N·mm²).
    pub fn ei_contribution_nmm2(&self) -> f64 {
        self.e_mpa * (self.i_own_mm4 + self.area_mm2 * self.arm_mm * self.arm_mm)
    }
}

/// Uitgewerkte doorsnede: zwaartelijn, effectieve stijfheden en per laag de
/// geometrie. Alle inwendige grootheden in N en mm; de `*_knm2`/`*_kn`-
/// hulpjes rekenen om naar de eenheden van het rapport.
#[derive(Clone, Debug)]
pub struct CltMechanics {
    pub width_mm: f64,
    pub height_mm: f64,
    /// Zwaartelijn (E-gewogen) vanaf de bovenkant (mm).
    pub z0_mm: f64,
    /// (EI)_ef = Σ E_i·(I_i + A_i·a_i²) over de lengtelagen (N·mm²).
    pub ei_ef_nmm2: f64,
    /// (EA)_ef = Σ E_i·A_i over de lengtelagen (N).
    pub ea_ef_n: f64,
    pub layers: Vec<LayerGeometry>,
}

impl CltMechanics {
    fn from_layup(layup: &CltLayup) -> Result<Self, String> {
        let b = layup.width_mm;

        // Eerste doorgang: laaggrenzen en E-gewogen zwaartelijn (B.6, γ = 1).
        let mut z = 0.0;
        let mut ea_sum = 0.0;
        let mut eaz_sum = 0.0;
        let mut voorlopig: Vec<(usize, &CltLayer, &'static StrengthClass, f64, f64)> = Vec::new();
        for (i, l) in layup.layers.iter().enumerate() {
            let class = strength_class_by_name(&l.strength_class)
                .ok_or_else(|| format!("laag {}: sterkteklasse \"{}\" onbekend", i + 1, l.strength_class))?;
            let z_top = z;
            let z_bot = z + l.thickness_mm;
            z = z_bot;
            let e = match l.orientation {
                CltLayerOrientation::Longitudinal => class.e0_mean,
                CltLayerOrientation::Transverse => 0.0,
            };
            let a = b * l.thickness_mm;
            ea_sum += e * a;
            eaz_sum += e * a * (z_top + z_bot) / 2.0;
            voorlopig.push((i, l, class, z_top, z_bot));
        }
        if ea_sum <= 0.0 {
            return Err("geen axiale stijfheid in de spanrichting — geen lengtelagen".to_string());
        }
        let z0 = eaz_sum / ea_sum;

        // Tweede doorgang: Steiner-termen en (EI)_ef (B.1 met γ_i = 1).
        let mut layers = Vec::with_capacity(voorlopig.len());
        let mut ei = 0.0;
        for (i, l, class, z_top, z_bot) in voorlopig {
            let e = match l.orientation {
                CltLayerOrientation::Longitudinal => class.e0_mean,
                CltLayerOrientation::Transverse => 0.0,
            };
            let t = z_bot - z_top;
            let geom = LayerGeometry {
                index: i,
                orientation: l.orientation,
                class,
                z_top_mm: z_top,
                z_bot_mm: z_bot,
                e_mpa: e,
                area_mm2: b * t,
                i_own_mm4: b * t * t * t / 12.0,
                arm_mm: (z_top + z_bot) / 2.0 - z0,
            };
            ei += geom.ei_contribution_nmm2();
            layers.push(geom);
        }

        Ok(Self {
            width_mm: b,
            height_mm: z,
            z0_mm: z0,
            ei_ef_nmm2: ei,
            ea_ef_n: ea_sum,
            layers,
        })
    }

    /// (EI)_ef in kNm² (1 N·mm² = 10⁻⁹ kNm²).
    pub fn ei_ef_knm2(&self) -> f64 {
        self.ei_ef_nmm2 * 1e-9
    }

    /// (EA)_ef in kN.
    pub fn ea_ef_kn(&self) -> f64 {
        self.ea_ef_n * 1e-3
    }

    /// Netto traagheidsmoment I_ef = (EI)_ef / E_ref (mm⁴), met E_ref de
    /// E-modulus van de bovenste lengtelaag. Alleen een hulpgrootheid voor
    /// de vergelijking met een massieve rechthoek; de toetsing rekent met
    /// (EI)_ef zelf.
    pub fn i_ef_net_mm4(&self) -> f64 {
        match self.reference_e_mpa() {
            Some(e) if e > 0.0 => self.ei_ef_nmm2 / e,
            _ => 0.0,
        }
    }

    /// E van de bovenste lengtelaag (referentiestijfheid).
    pub fn reference_e_mpa(&self) -> Option<f64> {
        self.layers
            .iter()
            .find(|l| l.orientation == CltLayerOrientation::Longitudinal)
            .map(|l| l.e_mpa)
    }

    /// Buigspanning in laag `idx` op hoogte `z_mm` (bijlage B (B.7)+(B.8)
    /// met γ = 1): σ = E_i·M·(z − z_0)/(EI)_ef. M in kNm, resultaat N/mm²,
    /// trek-positief. Nul in dwarslagen (E_i = 0).
    pub fn sigma_mpa(&self, idx: usize, z_mm: f64, m_knm: f64) -> f64 {
        if self.ei_ef_nmm2 <= 0.0 {
            return 0.0;
        }
        let e = self.layers[idx].e_mpa;
        e * (m_knm * 1e6) * (z_mm - self.z0_mm) / self.ei_ef_nmm2
    }

    /// Spanningen aan boven- en onderkant van laag `idx` (N/mm², trek-positief).
    pub fn layer_edge_stresses(&self, idx: usize, m_knm: f64) -> (f64, f64) {
        let l = &self.layers[idx];
        (self.sigma_mpa(idx, l.z_top_mm, m_knm), self.sigma_mpa(idx, l.z_bot_mm, m_knm))
    }

    /// (ES)(z) = ∫₀ᶻ E(ζ)·b·(ζ − z_0) dζ — het E-gewogen statisch moment van
    /// het deel bóven z om de zwaartelijn (N·mm). Negatief boven de
    /// zwaartelijn; voor de schuifspanning telt de absolute waarde.
    pub fn es_above_nmm(&self, z_mm: f64) -> f64 {
        let b = self.width_mm;
        let z0 = self.z0_mm;
        let mut es = 0.0;
        for l in &self.layers {
            if l.e_mpa == 0.0 || z_mm <= l.z_top_mm {
                continue;
            }
            let za = l.z_top_mm;
            let zb = z_mm.min(l.z_bot_mm);
            es += l.e_mpa * b * ((zb * zb - za * za) / 2.0 - z0 * (zb - za));
        }
        es
    }

    /// Schuifspanning op hoogte z (bijlage B (B.9) met γ = 1, §6.1.7 (6.13a)
    /// voor b_ef = k_cr·b): τ(z) = V·|(ES)(z)| / ((EI)_ef·b_ef).
    /// V in kN, resultaat N/mm².
    pub fn tau_mpa(&self, z_mm: f64, v_kn: f64, k_cr: f64) -> f64 {
        let b_ef = k_cr * self.width_mm;
        if self.ei_ef_nmm2 <= 0.0 || b_ef <= 0.0 {
            return 0.0;
        }
        (v_kn.abs() * 1e3) * self.es_above_nmm(z_mm).abs() / (self.ei_ef_nmm2 * b_ef)
    }

    /// Maximale schuifspanning in laag `idx` en de hoogte waar die optreedt.
    ///
    /// In een lengtelaag verloopt τ parabolisch; het maximum ligt op de
    /// zwaartelijn als die in de laag ligt, anders op de laaggrens die het
    /// dichtst bij de zwaartelijn ligt. In een dwarslaag (E = 0) is (ES)
    /// constant, dus τ ook: dat is de rolschuifspanning, gelijk aan τ op de
    /// grens met de aangrenzende lengtelaag.
    pub fn layer_max_shear(&self, idx: usize, v_kn: f64, k_cr: f64) -> LayerShear {
        let l = &self.layers[idx];
        let mut kandidaten = vec![l.z_top_mm, l.z_bot_mm];
        if l.e_mpa > 0.0 && self.z0_mm > l.z_top_mm && self.z0_mm < l.z_bot_mm {
            kandidaten.push(self.z0_mm);
        }
        let mut best = LayerShear { tau_mpa: 0.0, z_mm: l.z_top_mm, es_nmm: 0.0 };
        for z in kandidaten {
            let tau = self.tau_mpa(z, v_kn, k_cr);
            if tau > best.tau_mpa || (tau == best.tau_mpa && best.es_nmm == 0.0) {
                best = LayerShear { tau_mpa: tau, z_mm: z, es_nmm: self.es_above_nmm(z).abs() };
            }
        }
        best
    }
}

/// Maatgevende schuifspanning in een laag met vindplaats en het gebruikte (ES).
#[derive(Clone, Copy, Debug)]
pub struct LayerShear {
    pub tau_mpa: f64,
    /// Hoogte (vanaf boven) waar τ maximaal is (mm).
    pub z_mm: f64,
    /// |(ES)| op die hoogte (N·mm).
    pub es_nmm: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// Handberekening — 5-laags 40/20/40/20/40, b = 1000 mm, C24
    /// (E_0,mean = 11000 N/mm²), M = 20 kNm, V = 10 kN per strekkende meter.
    ///
    ///   h = 160, z_0 = 80 (symmetrisch)
    ///   lengtelagen 1, 3, 5: A = 40 000 mm², I_i = 1000·40³/12 = 5,333·10⁶ mm⁴
    ///   armen a = −60, 0, +60 → A·a² = 1,44·10⁸ (twee keer)
    ///   I_ef,net = 3·5,333·10⁶ + 2·1,44·10⁸ = 3,04·10⁸ mm⁴
    ///   (EI)_ef = 11000 · 3,04·10⁸ = 3,344·10¹² N·mm² = 3344 kNm²
    ///   σ_rand = M·(h/2)/I_ef = 20·10⁶·80/3,04·10⁸ = 5,263 N/mm²
    ///   σ op 40 mm van de rand (binnenkant buitenlaag) = 2,632 N/mm²
    ///   σ_max middenlaag (z − z_0 = 20) = 1,316 N/mm²
    ///   S op de grens laag 1/2: 1000·40·60 = 2,4·10⁶ mm³ → τ_rol =
    ///     V·S/(I·b) = 10 000·2,4·10⁶/(3,04·10⁸·1000) = 0,0789 N/mm²
    ///   S op de zwaartelijn: 2,4·10⁶ + 1000·20·10 = 2,6·10⁶ mm³ →
    ///     τ_max = 10 000·2,6·10⁶/(3,04·10⁸·1000) = 0,0855 N/mm²
    fn vijflaags() -> CltMechanics {
        CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0, 20.0, 40.0], "C24")
            .mechanics()
            .expect("geldige opbouw")
    }

    #[test]
    fn vijflaags_geometrie_en_stijfheid() {
        let m = vijflaags();
        assert_relative_eq!(m.height_mm, 160.0);
        assert_relative_eq!(m.z0_mm, 80.0);
        assert_relative_eq!(m.i_ef_net_mm4(), 3.04e8, max_relative = 1e-12);
        assert_relative_eq!(m.ei_ef_nmm2, 3.344e12, max_relative = 1e-12);
        assert_relative_eq!(m.ei_ef_knm2(), 3344.0, max_relative = 1e-12);
        // (EA)_ef = 11000 · 3 · 40 000 = 1,32·10⁹ N = 1,32·10⁶ kN.
        assert_relative_eq!(m.ea_ef_n, 11000.0 * 3.0 * 40000.0);
        assert_relative_eq!(m.ea_ef_kn(), 1.32e6);
        // Dwarslagen dragen niet mee.
        assert_relative_eq!(m.layers[1].e_mpa, 0.0);
        assert_relative_eq!(m.layers[1].ei_contribution_nmm2(), 0.0);
        // Armen van de lengtelagen.
        assert_relative_eq!(m.layers[0].arm_mm, -60.0);
        assert_relative_eq!(m.layers[2].arm_mm, 0.0);
        assert_relative_eq!(m.layers[4].arm_mm, 60.0);
    }

    #[test]
    fn vijflaags_buigspanningen_handberekening() {
        let m = vijflaags();
        let (s_top, s_bot) = m.layer_edge_stresses(0, 20.0);
        // Bovenste laag bij positief moment: druk aan de rand.
        assert_relative_eq!(s_top, -5.263, max_relative = 1e-3);
        assert_relative_eq!(s_bot, -2.632, max_relative = 1e-3);
        let (s_top5, s_bot5) = m.layer_edge_stresses(4, 20.0);
        assert_relative_eq!(s_top5, 2.632, max_relative = 1e-3);
        assert_relative_eq!(s_bot5, 5.263, max_relative = 1e-3);
        // Middenlaag: ±1,316.
        let (s3t, s3b) = m.layer_edge_stresses(2, 20.0);
        assert_relative_eq!(s3t, -1.316, max_relative = 1e-3);
        assert_relative_eq!(s3b, 1.316, max_relative = 1e-3);
        // Dwarslaag: spanningsloos in de spanrichting.
        let (d_t, d_b) = m.layer_edge_stresses(1, 20.0);
        assert_relative_eq!(d_t, 0.0);
        assert_relative_eq!(d_b, 0.0);
    }

    #[test]
    fn vijflaags_schuifspanningen_handberekening() {
        let m = vijflaags();
        // (ES) op de grens laag 1/2: 11000 · 2,4e6 = 2,64e10 N·mm.
        assert_relative_eq!(m.es_above_nmm(40.0).abs(), 2.64e10, max_relative = 1e-12);
        // Rolschuifspanning in de dwarslaag: constant 0,0789.
        let rol = m.layer_max_shear(1, 10.0, 1.0);
        assert_relative_eq!(rol.tau_mpa, 0.07895, max_relative = 1e-3);
        assert_relative_eq!(m.tau_mpa(40.0, 10.0, 1.0), m.tau_mpa(60.0, 10.0, 1.0), max_relative = 1e-12);
        // Middenlaag: maximum op de zwaartelijn, 0,0855.
        let mid = m.layer_max_shear(2, 10.0, 1.0);
        assert_relative_eq!(mid.tau_mpa, 0.08553, max_relative = 1e-3);
        assert_relative_eq!(mid.z_mm, 80.0);
        // Buitenlaag: maximum aan de binnenkant, gelijk aan de rolschuifspanning.
        let buiten = m.layer_max_shear(0, 10.0, 1.0);
        assert_relative_eq!(buiten.tau_mpa, rol.tau_mpa, max_relative = 1e-12);
        assert_relative_eq!(buiten.z_mm, 40.0);
        // Onder en boven de plaat is (ES) nul.
        assert_relative_eq!(m.es_above_nmm(0.0), 0.0);
        assert_relative_eq!(m.es_above_nmm(160.0), 0.0, epsilon = 1e-3);
    }

    #[test]
    fn k_cr_verkleint_de_werkzame_breedte() {
        let m = vijflaags();
        let vol = m.tau_mpa(80.0, 10.0, 1.0);
        let gereduceerd = m.tau_mpa(80.0, 10.0, 0.67);
        assert_relative_eq!(gereduceerd, vol / 0.67, max_relative = 1e-12);
    }

    #[test]
    fn alleen_lengtelagen_is_een_massieve_rechthoek() {
        // Drie lengtelagen van 40 mm zonder dwarslagen = rechthoek 1000 x 120.
        let layup = CltLayup::new(
            1000.0,
            (0..3)
                .map(|_| CltLayer {
                    thickness_mm: 40.0,
                    orientation: CltLayerOrientation::Longitudinal,
                    strength_class: "C24".into(),
                })
                .collect(),
        );
        let m = layup.mechanics().unwrap();
        assert_relative_eq!(m.i_ef_net_mm4(), 1000.0 * 120.0_f64.powi(3) / 12.0, max_relative = 1e-12);
        // Schuifspanning op de zwaartelijn = 1,5·V/A.
        assert_relative_eq!(m.tau_mpa(60.0, 10.0, 1.0), 1.5 * 10e3 / 120e3, max_relative = 1e-12);
    }

    #[test]
    fn asymmetrische_opbouw_verschuift_de_zwaartelijn() {
        // Lengte 40 / dwars 20 / lengte 20: zwaartelijn E-gewogen over de
        // lengtelagen: (40·20 + 20·70)/(40 + 20) = 36,67 mm.
        let layup = CltLayup::new(
            1000.0,
            vec![
                CltLayer { thickness_mm: 40.0, orientation: CltLayerOrientation::Longitudinal, strength_class: "C24".into() },
                CltLayer { thickness_mm: 20.0, orientation: CltLayerOrientation::Transverse, strength_class: "C24".into() },
                CltLayer { thickness_mm: 20.0, orientation: CltLayerOrientation::Longitudinal, strength_class: "C24".into() },
            ],
        );
        let m = layup.mechanics().unwrap();
        assert_relative_eq!(m.z0_mm, 36.6667, max_relative = 1e-4);
    }

    #[test]
    fn gemengde_sterkteklassen_wegen_mee_in_de_zwaartelijn() {
        // Boven C24 (11000), onder C16 (8000), gelijke dikten: zwaartelijn
        // trekt naar de stijve laag: (11000·20 + 8000·70)/(19000) = 41,05.
        let layup = CltLayup::new(
            1000.0,
            vec![
                CltLayer { thickness_mm: 40.0, orientation: CltLayerOrientation::Longitudinal, strength_class: "C24".into() },
                CltLayer { thickness_mm: 20.0, orientation: CltLayerOrientation::Transverse, strength_class: "C16".into() },
                CltLayer { thickness_mm: 40.0, orientation: CltLayerOrientation::Longitudinal, strength_class: "C16".into() },
            ],
        );
        let m = layup.mechanics().unwrap();
        assert_relative_eq!(m.z0_mm, (11000.0 * 20.0 + 8000.0 * 80.0) / 19000.0, max_relative = 1e-9);
        assert_eq!(layup.strength_classes_label(), "C24/C16");
    }

    #[test]
    fn validatie_wijst_onbruikbare_opbouwen_af() {
        assert!(CltLayup::alternating(1000.0, &[40.0, 20.0], "C24").validate().is_err());
        assert!(CltLayup::alternating(1000.0, &[40.0, 0.0, 40.0], "C24").validate().is_err());
        assert!(CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0], "S235").validate().is_err());
        assert!(CltLayup::alternating(0.0, &[40.0, 20.0, 40.0], "C24").validate().is_err());
        let alleen_dwars = CltLayup::new(
            1000.0,
            (0..3)
                .map(|_| CltLayer {
                    thickness_mm: 20.0,
                    orientation: CltLayerOrientation::Transverse,
                    strength_class: "C24".into(),
                })
                .collect(),
        );
        assert!(alleen_dwars.validate().is_err());
        assert!(CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0], "c24").validate().is_ok());
    }

    #[test]
    fn naam_en_voorinstellingen() {
        let l = CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0, 20.0, 40.0], "C24");
        assert_eq!(l.name(), "CLT 40/20/40/20/40");
        assert_eq!(l.n_longitudinal(), 3);
        let presets = clt_presets();
        assert!(presets.iter().any(|p| p.name == "5-laags 160" && p.height_mm == 160.0));
        for p in &presets {
            assert_relative_eq!(p.height_mm, p.thicknesses_mm.iter().sum::<f64>());
            assert!(p.thicknesses_mm.len() % 2 == 1, "symmetrische opbouw met oneven aantal lagen");
            assert!(CltLayup::alternating(1000.0, &p.thicknesses_mm, "C24").validate().is_ok());
        }
    }
}
