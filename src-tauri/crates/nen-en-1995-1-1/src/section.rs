//! Doorsnedegrootheden voor de EN 1995-toetsen.
//!
//! WAAROM HIER MEER STAAT DAN `b` EN `h`
//! Deze module hield tot september 2026 alleen een rechthoek bij, en elke
//! toets leidde zijn grootheden daaruit af. Dat werkt zolang elke houten staaf
//! een rechthoek is — en breekt zodra er één samengestelde ligger in het model
//! staat. Bij het narekenen van een externe referentie-berekening bleek dat
//! niet alleen een gemis maar een gevaar: de dwarskrachttoets van art. 6.1.7
//! rekent met `τ = V·S/(I·b)`, en `b` is daar de breedte op de beschouwde
//! vezel. Een I-vormige ligger met flenzen van 1000 mm en een lijf van 71 mm
//! als een rechthoek van 1000 × 120 behandelen levert een schuifspanning die
//! een orde van grootte te laag is.
//!
//! [`TimberSection`] draagt daarom de grootheden zélf, en niet alleen de twee
//! maten waaruit ze te herleiden zouden zijn. Een rechthoek maakt hem met
//! [`TimberSection::rechthoek`] — dan zijn alle formules exact die van vroeger.
//! Een samengestelde doorsnede krijgt zijn grootheden van de doorsnedemotor
//! (`section-properties`), inclusief de maatgevende schuifvezel.
//!
//! `rechthoekig` is geen sierveld. Drie normregels hangen eraan:
//!  * §3.2(3) / §3.3(3): de hoogtefactor `k_h` geldt alleen bij een
//!    **rechthoekige** doorsnede;
//!  * §6.1.6(2): `k_m = 0,7` geldt alleen bij een **rechthoekige** doorsnede,
//!    anders 1,0;
//!  * §6.3.3(2): de eenvoudige `σ_m,crit` van (6.32) geldt alleen voor
//!    naaldhout met een **gezaagde rechthoekige** doorsnede.
//!
//! Verificatie: alle afgeleiden van de rechthoek zijn getoetst aan de
//! profieltabel van de referentie-uitwerking (96 × 450): A = 43200 mm²,
//! W_y = 3,24e6 mm³, I_y = 7,29e8 mm⁴, i_y = 129,9 mm, S_y = 2,43e6 mm³,
//! W_z = 691200 mm³, I_z = 33.177.600 mm⁴, i_z = 27,7 mm.

/// Doorsnede van een houten staaf, met alle grootheden die de EN 1995-toetsen
/// nodig hebben. Alle lengtematen in mm.
#[derive(Clone, Copy, Debug)]
pub struct TimberSection {
    /// Breedte: bij een rechthoek de maat dwars op het buigvlak om y. Bij een
    /// samengestelde doorsnede de omhullende breedte — hij dient alleen nog
    /// voor de meldingen en voor (6.32), die daar niet meer wordt toegepast.
    pub b_mm: f64,
    /// Hoogte (totale hoogte van de doorsnede).
    pub h_mm: f64,
    /// Oppervlakte A (mm²).
    pub a_mm2: f64,
    /// Elastisch weerstandsmoment om de sterke as (mm³).
    pub w_y_mm3: f64,
    /// Elastisch weerstandsmoment om de zwakke as (mm³).
    pub w_z_mm3: f64,
    /// Traagheidsmoment om de sterke as (mm⁴).
    pub i_y_mm4: f64,
    /// Traagheidsmoment om de zwakke as (mm⁴).
    pub i_z_mm4: f64,
    /// Traagheidsstraal om de sterke as (mm).
    pub radius_y_mm: f64,
    /// Traagheidsstraal om de zwakke as (mm).
    pub radius_z_mm: f64,
    /// Statisch moment van het deel bóven de maatgevende schuifvezel, om de
    /// neutrale lijn (mm³) — de `S` van `τ = V·S/(I·b)`.
    pub s_y_mm3: f64,
    /// Breedte op diezelfde vezel (mm) — de `b` van (6.13a).
    pub b_schuif_mm: f64,
    /// Grootste koordelengte van de doorsnede (mm). De Nederlandse nationale
    /// bijlage bij 6.1.7 leidt `k_cr` af uit lijfdikte / flensbreedte; dit is
    /// die flensbreedte. Bij een rechthoek gelijk aan `b_schuif_mm`.
    pub b_flens_mm: f64,
    /// Is dit een prismatische rechthoek? Zie de moduledocumentatie voor de
    /// drie normregels die hieraan hangen.
    pub rechthoekig: bool,
}

impl TimberSection {
    /// Rechthoek `b × h`. Conventie conform de referentie-uitwerking:
    /// `b` = breedte (dwars op het buigvlak om y), `h` = hoogte. Buiging om y
    /// is de sterke as.
    ///
    /// `S_y = b·h²/8` is het statisch moment van de halve doorsnede; daarmee
    /// levert `V·S/(I·b)` exact `1,5·V/A`, de bekende rechthoekwaarde.
    pub fn rechthoek(b_mm: f64, h_mm: f64) -> Self {
        Self {
            b_mm,
            h_mm,
            a_mm2: b_mm * h_mm,
            w_y_mm3: b_mm * h_mm * h_mm / 6.0,
            w_z_mm3: h_mm * b_mm * b_mm / 6.0,
            i_y_mm4: b_mm * h_mm.powi(3) / 12.0,
            i_z_mm4: h_mm * b_mm.powi(3) / 12.0,
            radius_y_mm: h_mm / 12.0_f64.sqrt(),
            radius_z_mm: b_mm / 12.0_f64.sqrt(),
            s_y_mm3: b_mm * h_mm * h_mm / 8.0,
            b_schuif_mm: b_mm,
            b_flens_mm: b_mm,
            rechthoekig: true,
        }
    }

    /// Doorsnedenaam zoals in de referentie-uitwerking ("96 x 450"). Een
    /// samengestelde doorsnede draagt zijn eigen naam mee vanuit de invoer;
    /// die zet de orchestrator in het resultaat, niet deze functie.
    pub fn name(&self) -> String {
        format!("{:.0} x {:.0}", self.b_mm, self.h_mm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn profiel_96x450_referentiewaarden() {
        let s = TimberSection::rechthoek(96.0, 450.0);
        assert_relative_eq!(s.a_mm2, 43200.0);
        assert_relative_eq!(s.w_y_mm3, 3.24e6);
        assert_relative_eq!(s.w_z_mm3, 691200.0);
        assert_relative_eq!(s.i_y_mm4, 7.29e8);
        assert_relative_eq!(s.i_z_mm4, 33_177_600.0);
        assert_relative_eq!(s.radius_y_mm, 129.9, max_relative = 1e-3);
        assert_relative_eq!(s.radius_z_mm, 27.7, max_relative = 1e-3);
        assert_relative_eq!(s.s_y_mm3, 2.43e6);
        assert_eq!(s.name(), "96 x 450");
        assert!(s.rechthoekig);
    }
}
