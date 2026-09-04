//! Materiaalgegevens.
//!
//! * Beton: **tabel 3.1** "Sterkte- en vervormingseigenschappen voor beton"
//!   (NEN-EN 1992-1-1, §3.1.3). De tabel is in de tekstextractie van de norm
//!   rij voor rij leesbaar; de kolommen f_ctk,0,95 en ε_c1 stonden door elkaar
//!   (tekenverwisseling per cijferpaar) en zijn met de bijbehorende formules
//!   uit de rechterkolom van de tabel ontward: f_ctk,0,95 = 1,3·f_ctm en
//!   ε_c1 = 0,7·f_cm^0,31 ≤ 2,8 ‰.
//! * Wapeningsstaal: **bijlage C, tabel C.1** (normatief): vloeigrens 400 tot
//!   en met 600 N/mm², minimumwaarde van k = (f_t/f_y)_k en karakteristieke
//!   rek bij maximale kracht ε_uk per ductiliteitsklasse A, B en C. De
//!   productnaam B500 (f_yk = 500 N/mm²) is de gangbare aanduiding van
//!   betonstaal volgens NEN-EN 10080 / NEN 6008; 500 N/mm² ligt binnen het
//!   toepassingsgebied van 3.2.2(3).
//!
//! Rekken zijn dimensieloos opgeslagen (0,0035 en niet 3,5 ‰), zodat ze
//! zonder omrekening in de spanning-rekrelaties passen. E_cm staat in N/mm².

use serde::Serialize;
use ts_rs::TS;

/// Eén sterkteklasse voor beton — één kolom uit tabel 3.1.
///
/// Sterkten in N/mm², E_cm in N/mm², rekken dimensieloos.
#[derive(Clone, Copy, Debug, Serialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteClass {
    /// Aanduiding "C30/37": cilinder-/kubusdruksterkte.
    pub name: &'static str,
    /// Karakteristieke cilinderdruksterkte f_ck na 28 dagen (tabel 3.1).
    pub f_ck: f64,
    /// Karakteristieke kubusdruksterkte f_ck,cube (tabel 3.1).
    pub f_ck_cube: f64,
    /// Gemiddelde druksterkte f_cm = f_ck + 8 (tabel 3.1).
    pub f_cm: f64,
    /// Gemiddelde axiale treksterkte f_ctm (tabel 3.1).
    pub f_ctm: f64,
    /// 5 %-fractiel van de treksterkte f_ctk,0,05 = 0,7·f_ctm (tabel 3.1).
    pub f_ctk_005: f64,
    /// 95 %-fractiel van de treksterkte f_ctk,0,95 = 1,3·f_ctm (tabel 3.1).
    pub f_ctk_095: f64,
    /// Secans-elasticiteitsmodulus E_cm in N/mm² (tabel 3.1 geeft GPa).
    pub e_cm: f64,
    /// Rek bij de maximale spanning in de niet-lineaire relatie van 3.1.5 (tabel 3.1).
    pub eps_c1: f64,
    /// Grensrek in de niet-lineaire relatie van 3.1.5 (tabel 3.1).
    pub eps_cu1: f64,
    /// Rek bij het bereiken van f_cd in het parabool-rechthoekdiagram (3.1.7(1), tabel 3.1).
    pub eps_c2: f64,
    /// Grensrek van het parabool-rechthoekdiagram (3.1.7(1), tabel 3.1).
    pub eps_cu2: f64,
    /// Exponent n van het parabool-rechthoekdiagram (3.1.7(1), tabel 3.1).
    pub n: f64,
    /// Rek bij het bereiken van f_cd in het bilineaire diagram (3.1.7(2), tabel 3.1).
    pub eps_c3: f64,
    /// Grensrek van het bilineaire diagram en de rechthoekige spanningsverdeling
    /// (3.1.7(2) en (3), tabel 3.1).
    pub eps_cu3: f64,
}

/// Hulp om de tabelregels compact te houden; rekken in ‰ zoals in de tabel,
/// E_cm in GPa zoals in de tabel.
#[allow(clippy::too_many_arguments)]
const fn klasse(
    name: &'static str,
    f_ck: f64,
    f_ck_cube: f64,
    f_ctm: f64,
    f_ctk_005: f64,
    f_ctk_095: f64,
    e_cm_gpa: f64,
    eps_c1_pm: f64,
    eps_cu1_pm: f64,
    eps_c2_pm: f64,
    eps_cu2_pm: f64,
    n: f64,
    eps_c3_pm: f64,
    eps_cu3_pm: f64,
) -> ConcreteClass {
    ConcreteClass {
        name,
        f_ck,
        f_ck_cube,
        f_cm: f_ck + 8.0,
        f_ctm,
        f_ctk_005,
        f_ctk_095,
        e_cm: e_cm_gpa * 1000.0,
        eps_c1: eps_c1_pm / 1000.0,
        eps_cu1: eps_cu1_pm / 1000.0,
        eps_c2: eps_c2_pm / 1000.0,
        eps_cu2: eps_cu2_pm / 1000.0,
        n,
        eps_c3: eps_c3_pm / 1000.0,
        eps_cu3: eps_cu3_pm / 1000.0,
    }
}

/// Tabel 3.1, alle veertien sterkteklassen. Kolomvolgorde in de aanroep:
/// f_ck, f_ck,cube, f_ctm, f_ctk,0,05, f_ctk,0,95, E_cm [GPa], ε_c1, ε_cu1,
/// ε_c2, ε_cu2, n, ε_c3, ε_cu3 (rekken in ‰).
pub const CONCRETE_CLASSES: &[ConcreteClass] = &[
    klasse("C12/15", 12.0, 15.0, 1.6, 1.1, 2.0, 27.0, 1.8, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C16/20", 16.0, 20.0, 1.9, 1.3, 2.5, 29.0, 1.9, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C20/25", 20.0, 25.0, 2.2, 1.5, 2.9, 30.0, 2.0, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C25/30", 25.0, 30.0, 2.6, 1.8, 3.3, 31.0, 2.1, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C30/37", 30.0, 37.0, 2.9, 2.0, 3.8, 33.0, 2.2, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C35/45", 35.0, 45.0, 3.2, 2.2, 4.2, 34.0, 2.25, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C40/50", 40.0, 50.0, 3.5, 2.5, 4.6, 35.0, 2.3, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C45/55", 45.0, 55.0, 3.8, 2.7, 4.9, 36.0, 2.4, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C50/60", 50.0, 60.0, 4.1, 2.9, 5.3, 37.0, 2.45, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5),
    klasse("C55/67", 55.0, 67.0, 4.2, 3.0, 5.5, 38.0, 2.5, 3.2, 2.2, 3.1, 1.75, 1.8, 3.1),
    klasse("C60/75", 60.0, 75.0, 4.4, 3.1, 5.7, 39.0, 2.6, 3.0, 2.3, 2.9, 1.6, 1.9, 2.9),
    klasse("C70/85", 70.0, 85.0, 4.6, 3.2, 6.0, 41.0, 2.7, 2.8, 2.4, 2.7, 1.45, 2.0, 2.7),
    klasse("C80/95", 80.0, 95.0, 4.8, 3.4, 6.3, 42.0, 2.8, 2.8, 2.5, 2.6, 1.4, 2.2, 2.6),
    klasse("C90/105", 90.0, 105.0, 5.0, 3.5, 6.6, 44.0, 2.8, 2.8, 2.6, 2.6, 1.4, 2.3, 2.6),
];

/// Zoek een betonsterkteklasse op naam ("C30/37"; ook "C30" wordt herkend).
pub fn concrete_class_by_name(name: &str) -> Option<&'static ConcreteClass> {
    let gezocht = name.trim().replace(' ', "");
    CONCRETE_CLASSES.iter().find(|c| {
        c.name.eq_ignore_ascii_case(&gezocht)
            || c.name
                .split('/')
                .next()
                .map(|kort| kort.eq_ignore_ascii_case(&gezocht))
                .unwrap_or(false)
    })
}

/// Ductiliteitsklasse van betonstaal — bijlage C, tabel C.1.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum DuctilityClass {
    A,
    B,
    C,
}

/// Eén wapeningsstaalsoort: vloeigrens plus de ductiliteitseigenschappen
/// van tabel C.1.
#[derive(Clone, Copy, Debug, Serialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ReinforcementGrade {
    /// Aanduiding, bijv. "B500B".
    pub name: &'static str,
    /// Karakteristieke vloeigrens f_yk in N/mm² (3.2.2(3): 400 t/m 600).
    pub f_yk: f64,
    pub ductility_class: DuctilityClass,
    /// Minimumwaarde van k = (f_t/f_y)_k (tabel C.1): A ≥ 1,05; B ≥ 1,08;
    /// C ≥ 1,15 (en < 1,35). Gebruikt voor de hellende bovenste tak van
    /// 3.2.7(2)a; de minimumwaarde is de veilige keuze.
    pub k: f64,
    /// Karakteristieke rek bij maximale kracht ε_uk (tabel C.1):
    /// A ≥ 2,5 %; B ≥ 5,0 %; C ≥ 7,5 %. Dimensieloos.
    pub eps_uk: f64,
}

/// De drie B500-klassen. Tabel C.1 geeft per klasse ondergrenzen; hier zijn
/// die ondergrenzen als rekenwaarde genomen (veilig-zijdig).
pub const REINFORCEMENT_GRADES: &[ReinforcementGrade] = &[
    ReinforcementGrade { name: "B500A", f_yk: 500.0, ductility_class: DuctilityClass::A, k: 1.05, eps_uk: 0.025 },
    ReinforcementGrade { name: "B500B", f_yk: 500.0, ductility_class: DuctilityClass::B, k: 1.08, eps_uk: 0.050 },
    ReinforcementGrade { name: "B500C", f_yk: 500.0, ductility_class: DuctilityClass::C, k: 1.15, eps_uk: 0.075 },
];

/// Zoek een wapeningsstaalsoort op naam ("B500B"; "B500" → B500B, de in
/// Nederland gebruikelijke klasse voor staven).
pub fn reinforcement_grade_by_name(name: &str) -> Option<&'static ReinforcementGrade> {
    let gezocht = name.trim();
    if gezocht.eq_ignore_ascii_case("B500") {
        return REINFORCEMENT_GRADES.iter().find(|g| g.name == "B500B");
    }
    REINFORCEMENT_GRADES.iter().find(|g| g.name.eq_ignore_ascii_case(gezocht))
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn c30_37_komt_overeen_met_tabel_3_1() {
        let c = concrete_class_by_name("C30/37").expect("C30/37 aanwezig");
        assert_relative_eq!(c.f_ck, 30.0);
        assert_relative_eq!(c.f_ck_cube, 37.0);
        assert_relative_eq!(c.f_cm, 38.0);
        assert_relative_eq!(c.f_ctm, 2.9);
        assert_relative_eq!(c.f_ctk_005, 2.0);
        assert_relative_eq!(c.f_ctk_095, 3.8);
        assert_relative_eq!(c.e_cm, 33_000.0);
        assert_relative_eq!(c.eps_c2, 0.002);
        assert_relative_eq!(c.eps_cu2, 0.0035);
        assert_relative_eq!(c.n, 2.0);
        assert_relative_eq!(c.eps_c3, 0.00175);
        assert_relative_eq!(c.eps_cu3, 0.0035);
    }

    #[test]
    fn hogesterktebeton_volgt_de_formules_van_tabel_3_1() {
        // Tabel 3.1, rechterkolom: voor f_ck ≥ 50 MPa
        //   ε_c2  = 2,0 + 0,085·(f_ck − 50)^0,53  [‰]
        //   ε_cu2 = 2,6 + 35·[(90 − f_ck)/100]^4   [‰]
        //   n     = 1,4 + 23,4·[(90 − f_ck)/100]^4
        //   ε_c3  = 1,75 + 0,55·(f_ck − 50)/40    [‰]
        //   ε_cu3 = ε_cu2
        for c in CONCRETE_CLASSES.iter().filter(|c| c.f_ck > 50.0) {
            let t = ((90.0 - c.f_ck) / 100.0).powi(4);
            let eps_c2 = 2.0 + 0.085 * (c.f_ck - 50.0).powf(0.53);
            let eps_cu2 = 2.6 + 35.0 * t;
            let n = 1.4 + 23.4 * t;
            let eps_c3 = 1.75 + 0.55 * (c.f_ck - 50.0) / 40.0;
            // De tabel rondt af op twee decimalen (resp. 0,05 voor n).
            assert!((c.eps_c2 * 1000.0 - eps_c2).abs() < 0.06, "{}: ε_c2", c.name);
            assert!((c.eps_cu2 * 1000.0 - eps_cu2).abs() < 0.06, "{}: ε_cu2", c.name);
            assert!((c.n - n).abs() < 0.03, "{}: n", c.name);
            assert!((c.eps_c3 * 1000.0 - eps_c3).abs() < 0.06, "{}: ε_c3", c.name);
            assert_relative_eq!(c.eps_cu3, c.eps_cu2);
        }
    }

    #[test]
    fn treksterktes_volgen_de_formules_van_tabel_3_1() {
        // Tabel 3.1, rechterkolom:
        //   f_ctm = 0,30·f_ck^(2/3) (≤ C50/60), f_ctm = 2,12·ln(1 + f_cm/10) (> C50/60);
        //   f_ctk,0,05 = 0,7·f_ctm; f_ctk,0,95 = 1,3·f_ctm.
        // De tabel rondt de uitkomsten op 0,1 af (uit de ongeronde f_ctm).
        for c in CONCRETE_CLASSES {
            let f_ctm = if c.f_ck <= 50.0 {
                0.30 * c.f_ck.powf(2.0 / 3.0)
            } else {
                2.12 * (1.0 + c.f_cm / 10.0).ln()
            };
            assert!((c.f_ctm - f_ctm).abs() <= 0.06, "{}: f_ctm {f_ctm}", c.name);
            assert!((c.f_ctk_005 - 0.7 * f_ctm).abs() <= 0.06, "{}: f_ctk,0,05", c.name);
            assert!((c.f_ctk_095 - 1.3 * f_ctm).abs() <= 0.06, "{}: f_ctk,0,95", c.name);
        }
    }

    #[test]
    fn opzoeken_kent_korte_en_lange_naam() {
        assert_eq!(concrete_class_by_name("C30").unwrap().name, "C30/37");
        assert_eq!(concrete_class_by_name("c20/25").unwrap().name, "C20/25");
        assert!(concrete_class_by_name("C24").is_none());
        assert!(concrete_class_by_name("S235").is_none());
        assert_eq!(reinforcement_grade_by_name("B500").unwrap().name, "B500B");
        assert_eq!(reinforcement_grade_by_name("b500a").unwrap().eps_uk, 0.025);
        assert!(reinforcement_grade_by_name("B400").is_none());
    }
}
