//! Spanning-rekrelaties voor de doorsnedeberekening (3.1.7 en 3.2.7).
//!
//! Tekenconventie in deze module: **druk positief**, voor beton én staal.
//! Betontrek levert geen spanning (6.1(2): de treksterkte van beton wordt
//! verwaarloosd).

use crate::data::{ConcreteClass, ReinforcementGrade};
use crate::factors::{self, DesignSituation};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Parabool-rechthoekdiagram voor beton onder druk, 3.1.7(1), figuur 3.3.
///
/// Vergelijkingen (3.17) en (3.18):
///
/// * σ_c = f_cd·[1 − (1 − ε_c/ε_c2)^n]   voor 0 ≤ ε_c ≤ ε_c2   (3.17)
/// * σ_c = f_cd                          voor ε_c2 ≤ ε_c ≤ ε_cu2 (3.18)
///
/// met n, ε_c2 en ε_cu2 uit tabel 3.1.
///
/// Leesbaarheid van de bron: in de tekstextractie van de norm zijn de
/// geldigheidsbereiken "voor 0 ≤ ε_c ≤ ε_c2 (3.17)" en "voor ε_c2 ≤ ε_c ≤
/// ε_cu2 (3.18)" en de verklaring "n is de exponent volgens tabel 3.1" wél
/// leesbaar, de formule-inhoud van (3.17) zelf niet (formulebeeld). De hier
/// gebruikte vorm is de algemeen bekende parabool-rechthoekformule; hij is
/// gecontroleerd op de randvoorwaarden die uit de leesbare tekst volgen
/// (σ_c(0) = 0, σ_c(ε_c2) = f_cd, gladde overgang naar het plateau) en op de
/// analytische integraal van de parabool (zie de tests in `mnkappa`).
///
/// Boven ε_cu2 geeft `sigma` het plateau f_cd terug; de grensrek wordt niet
/// hier maar in de doorsnedeberekening bewaakt (6.1(3)), zodat het
/// evenwichtsalgoritme overal een gedefinieerde spanning heeft.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ConcreteDesignCurve {
    pub f_cd: f64,
    pub eps_c2: f64,
    pub eps_cu2: f64,
    pub n: f64,
}

impl ConcreteDesignCurve {
    /// Spanning in N/mm² bij rek `eps` (druk positief).
    pub fn sigma(&self, eps: f64) -> f64 {
        if eps <= 0.0 {
            0.0
        } else if eps < self.eps_c2 {
            self.f_cd * (1.0 - (1.0 - eps / self.eps_c2).powf(self.n))
        } else {
            self.f_cd
        }
    }
}

/// Keuze van de bovenste tak van het staaldiagram, 3.2.7(2), figuur 3.8.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum SteelBranch {
    /// 3.2.7(2)b: horizontale bovenste tak op f_yd, zonder rekgrens.
    #[default]
    Horizontal,
    /// 3.2.7(2)a: hellende bovenste tak van (ε_yd, f_yd) naar
    /// (ε_uk, k·f_yk/γ_S), met rekgrens ε_ud = 0,9·ε_uk (NB).
    Inclined,
}

/// Bilineair rekendiagram voor betonstaal, 3.2.7(2), figuur 3.8.
///
/// Elastisch tot ε_yd = f_yd/E_s, daarboven volgens [`SteelBranch`]. Het
/// diagram is oneven (trek en druk gelijk).
///
/// Leesbaarheid van de bron: leesbaar zijn "k = (f_t/f_y)_k", de maximale
/// spanning k·f_yk/γ_S bij ε_uk, "een horizontale bovenste tak waarbij de
/// maximale rek niet hoeft te zijn gecontroleerd", de NB-bepaling ε_ud =
/// 0,9·ε_uk en E_s = 200 GPa (3.2.7(4)). Figuur 3.8 zelf is niet leesbaar;
/// de hellende tak is de rechte tussen de twee punten die de tekst noemt.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SteelDesignCurve {
    pub f_yd: f64,
    pub e_s: f64,
    /// ε_yd = f_yd / E_s.
    pub eps_yd: f64,
    /// k·f_yk/γ_S — spanning aan het eind van de hellende tak (bij ε_uk).
    pub f_ud_inclined: f64,
    pub eps_uk: f64,
    /// ε_ud = 0,9·ε_uk (NB bij 3.2.7(2)).
    pub eps_ud: f64,
    pub branch: SteelBranch,
}

impl SteelDesignCurve {
    /// Spanning in N/mm² bij rek `eps`; teken volgt de rek.
    pub fn sigma(&self, eps: f64) -> f64 {
        let a = eps.abs();
        let s = if a <= self.eps_yd {
            self.e_s * a
        } else {
            match self.branch {
                SteelBranch::Horizontal => self.f_yd,
                SteelBranch::Inclined => {
                    if a >= self.eps_uk {
                        self.f_ud_inclined
                    } else {
                        self.f_yd
                            + (self.f_ud_inclined - self.f_yd) * (a - self.eps_yd)
                                / (self.eps_uk - self.eps_yd)
                    }
                }
            }
        };
        if eps < 0.0 {
            -s
        } else {
            s
        }
    }

    /// Geldt er een rekgrens voor het staal? Alleen bij de hellende tak
    /// (3.2.7(2)b: bij de horizontale tak hoeft de rek niet te worden
    /// gecontroleerd). De M-N-κ-berekening gebruikt ε_ud bij de horizontale
    /// tak wél als praktisch eindpunt van het diagram — zie `mnkappa`.
    pub fn has_strain_limit(&self) -> bool {
        matches!(self.branch, SteelBranch::Inclined)
    }
}

/// Alle rekenwaarden van één beton-staalcombinatie, klaar voor de
/// doorsnedeberekening.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DesignMaterial {
    pub concrete_name: &'static str,
    pub steel_name: &'static str,
    pub f_ck: f64,
    pub gamma_c: f64,
    pub alpha_cc: f64,
    pub concrete: ConcreteDesignCurve,
    /// ε_c3 en ε_cu3 (tabel 3.1) voor de rechthoekige spanningsverdeling (3.1.7(3)).
    pub eps_c3: f64,
    pub eps_cu3: f64,
    /// λ en η (3.19)–(3.22).
    pub lambda: f64,
    pub eta: f64,
    pub f_yk: f64,
    pub gamma_s: f64,
    pub k: f64,
    pub steel: SteelDesignCurve,
}

impl DesignMaterial {
    pub fn new(
        concrete: &ConcreteClass,
        steel: &ReinforcementGrade,
        situation: DesignSituation,
        branch: SteelBranch,
    ) -> Self {
        let gamma_c = factors::gamma_c(situation);
        let gamma_s = factors::gamma_s(situation);
        let f_cd = factors::f_cd(concrete.f_ck, factors::ALPHA_CC, gamma_c);
        let f_yd = factors::f_yd(steel.f_yk, gamma_s);
        DesignMaterial {
            concrete_name: concrete.name,
            steel_name: steel.name,
            f_ck: concrete.f_ck,
            gamma_c,
            alpha_cc: factors::ALPHA_CC,
            concrete: ConcreteDesignCurve {
                f_cd,
                eps_c2: concrete.eps_c2,
                eps_cu2: concrete.eps_cu2,
                n: concrete.n,
            },
            eps_c3: concrete.eps_c3,
            eps_cu3: concrete.eps_cu3,
            lambda: factors::lambda(concrete.f_ck),
            eta: factors::eta(concrete.f_ck),
            f_yk: steel.f_yk,
            gamma_s,
            k: steel.k,
            steel: SteelDesignCurve {
                f_yd,
                e_s: factors::E_S,
                eps_yd: f_yd / factors::E_S,
                f_ud_inclined: steel.k * steel.f_yk / gamma_s,
                eps_uk: steel.eps_uk,
                eps_ud: factors::eps_ud(steel.eps_uk),
                branch,
            },
        }
    }

    pub fn f_cd(&self) -> f64 {
        self.concrete.f_cd
    }

    pub fn f_yd(&self) -> f64 {
        self.steel.f_yd
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use approx::assert_relative_eq;

    fn c30_b500b(branch: SteelBranch) -> DesignMaterial {
        DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            branch,
        )
    }

    #[test]
    fn parabool_rechthoek_randwaarden() {
        let m = c30_b500b(SteelBranch::Horizontal);
        let c = m.concrete;
        assert_relative_eq!(c.sigma(0.0), 0.0);
        assert_relative_eq!(c.sigma(-0.001), 0.0); // trek: geen spanning (6.1(2))
        assert_relative_eq!(c.sigma(0.002), 20.0); // ε_c2 → f_cd
        assert_relative_eq!(c.sigma(0.0035), 20.0); // plateau tot ε_cu2
        // Halverwege de parabool: 1 − (1 − 0,5)² = 0,75 → 15 N/mm².
        assert_relative_eq!(c.sigma(0.001), 15.0);
        // Gladde overgang: de helling bij ε_c2 is verwaarloosbaar ten opzichte
        // van de beginhelling f_cd·n/ε_c2 = 20 000 N/mm² per eenheid rek.
        let d = (c.sigma(0.002) - c.sigma(0.002 - 1e-7)) / 1e-7;
        let beginhelling = c.f_cd * c.n / c.eps_c2;
        assert!(d.abs() < 1e-3 * beginhelling, "helling bij ε_c2 = {d}");
    }

    #[test]
    fn staal_bilineair_horizontaal() {
        let s = c30_b500b(SteelBranch::Horizontal).steel;
        assert_relative_eq!(s.eps_yd, 434.7826 / 200_000.0, max_relative = 1e-5);
        assert_relative_eq!(s.sigma(0.001), 200.0);
        assert_relative_eq!(s.sigma(-0.001), -200.0);
        assert_relative_eq!(s.sigma(0.010), 434.7826, max_relative = 1e-5);
        assert_relative_eq!(s.sigma(0.100), 434.7826, max_relative = 1e-5);
        assert!(!s.has_strain_limit());
    }

    #[test]
    fn staal_bilineair_hellend() {
        let s = c30_b500b(SteelBranch::Inclined).steel;
        // Eindpunt: k·f_yk/γ_S = 1,08 · 500 / 1,15 = 469,57 N/mm² bij ε_uk = 5 %.
        assert_relative_eq!(s.sigma(0.05), 469.5652, max_relative = 1e-5);
        assert_relative_eq!(s.eps_ud, 0.045);
        // Halverwege de hellende tak ligt de spanning tussen f_yd en het eindpunt.
        let mid = s.sigma(0.5 * (s.eps_yd + s.eps_uk));
        assert!(mid > s.f_yd && mid < s.f_ud_inclined);
        assert!(s.has_strain_limit());
    }
}
