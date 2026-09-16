//! NDP's bij **NEN-EN 1990** — grondslagen van het constructief ontwerp.
//!
//! De Nederlandse rij komt uit NEN-EN 1990:2002/NB:2019:
//!
//! * **tabel NB.3–A1.2(A)** — EQU (groep A);
//! * **tabel NB.4–A1.2(B)** — STR/GEO, gevolgklasse 2;
//! * **tabel NB.5** — STR/GEO, gevolgklasse 1 en 3;
//! * **tabel NB.2–A1.1** — de ψ-factoren voor gebouwen;
//! * **A1.4.3(3)** — de grenswaarden voor w2 + w3 (de bijkomende doorbuiging);
//! * **A1.4.3(4)** — de grenswaarde voor w_max.
//!
//! De frontend stelt de belastingcombinaties op en gebruikt dezelfde tabellen
//! (`design-mockup/src/components/fem/solver/normcombinaties.ts`).
//! `design-mockup/test-belastingcombinaties.mjs` leest dit bestand als tekst en
//! legt beide naast elkaar — daarom staan de waarden hieronder als losse
//! struct-literalen op één regel, en niet in een lus of een afkorting.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::NationaleBijlage;

/// Partiële factoren voor één uitdrukking (STR/GEO of EQU).
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct LoadFactors {
    pub name: &'static str,
    /// γ_G,sup — ongunstig werkende blijvende belasting.
    pub gamma_g_sup: f64,
    /// γ_G,inf — gunstig werkende blijvende belasting.
    pub gamma_g_inf: f64,
    /// γ_Q — belangrijkste én andere veranderlijke belastingen.
    pub gamma_q: f64,
}

/// ψ-factoren voor één rij van tabel NB.2–A1.1.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct PsiFactors {
    pub category: &'static str,
    pub description: &'static str,
    pub psi0: f64,
    pub psi1: f64,
    pub psi2: f64,
}

/// De nationaal bepaalde parameters bij NEN-EN 1990.
#[derive(Clone, Copy, Debug)]
pub struct Ndp1990 {
    /// STR/GEO groep B, gevolgklasse 1: (6.10a, 6.10b).
    pub uls_cc1: (LoadFactors, LoadFactors),
    /// STR/GEO groep B, gevolgklasse 2: (6.10a, 6.10b).
    pub uls_cc2: (LoadFactors, LoadFactors),
    /// STR/GEO groep B, gevolgklasse 3: (6.10a, 6.10b).
    pub uls_cc3: (LoadFactors, LoadFactors),
    /// EQU, groep A.
    pub equ: LoadFactors,
    /// K_FI per gevolgklasse (CC1, CC2, CC3) — ter vermelding: de factor zit al
    /// in de tabellen NB.4/NB.5 verwerkt en wordt niet nóg eens toegepast.
    pub k_fi: (f64, f64, f64),
    /// De rijen van tabel NB.2–A1.1, in de volgorde van de tabel.
    pub psi: [PsiFactors; 13],
    /// w_max — A1.4.3(4): de eindzakking mag ℓ_rep/`w_max_noemer` niet
    /// overschrijden, voor zowel vloeren als daken.
    pub w_max_noemer: f64,
    /// w2 + w3 bij vloeren die scheurgevoelige scheidingswanden dragen —
    /// A1.4.3(3), eerste gedachtestreepje: ℓ_rep/500.
    pub w_add_noemer_scheurgevoelig: f64,
    /// w2 + w3 bij overige vloeren en daken die intensief door personen worden
    /// gebruikt — A1.4.3(3), tweede gedachtestreepje: 3/1 000 · ℓ_rep.
    ///
    /// Als noemer geschreven (1 000/3), zodat de hele module met één grootheid
    /// rekent; het rapport zet er de formulering van de norm zelf bij.
    pub w_add_noemer_intensief: f64,
    /// w2 + w3 bij overige daken — A1.4.3(3), derde gedachtestreepje:
    /// ℓ_rep/250.
    pub w_add_noemer_overige_daken: f64,
    /// w2 + w3 bij vloerafscheidingen ter plaatse van een hoogteverschil —
    /// A1.4.3(3), vierde gedachtestreepje: ℓ_rep/150.
    pub w_add_noemer_vloerafscheiding: f64,
}

impl Ndp1990 {
    /// De rij van deze bijlage. Uitputtende `match`: een nieuwe variant dwingt
    /// hier een rij af in plaats van stil de Nederlandse te nemen.
    pub const fn voor(bijlage: NationaleBijlage) -> Self {
        match bijlage {
            NationaleBijlage::NL => NDP_1990_NL,
        }
    }
}

/// De Nederlandse rij — NEN-EN 1990:2002/NB:2019.
pub const NDP_1990_NL: Ndp1990 = Ndp1990 {
    // Tabel NB.5, gevolgklasse 1.
    uls_cc1: (
        LoadFactors { name: "6.10a", gamma_g_sup: 1.2, gamma_g_inf: 0.9, gamma_q: 1.35 },
        LoadFactors { name: "6.10b", gamma_g_sup: 1.1, gamma_g_inf: 0.9, gamma_q: 1.35 },
    ),
    // Tabel NB.4–A1.2(B), gevolgklasse 2.
    uls_cc2: (
        LoadFactors { name: "6.10a", gamma_g_sup: 1.35, gamma_g_inf: 0.9, gamma_q: 1.5 },
        LoadFactors { name: "6.10b", gamma_g_sup: 1.2, gamma_g_inf: 0.9, gamma_q: 1.5 },
    ),
    // Tabel NB.5, gevolgklasse 3.
    uls_cc3: (
        LoadFactors { name: "6.10a", gamma_g_sup: 1.5, gamma_g_inf: 0.9, gamma_q: 1.65 },
        LoadFactors { name: "6.10b", gamma_g_sup: 1.3, gamma_g_inf: 0.9, gamma_q: 1.65 },
    ),
    // Tabel NB.3–A1.2(A), EQU (groep A).
    equ: LoadFactors { name: "EQU", gamma_g_sup: 1.1, gamma_g_inf: 0.9, gamma_q: 1.5 },
    // Opmerking bij tabel NB.4: "Voor gevolgklasse 2 geldt K_FI = 1 […] Voor
    // gevolgklasse 1 geldt volgens tabel B3 K_FI = 0,9; voor gevolgklasse 3
    // geldt K_FI = 1,1."
    k_fi: (0.9, 1.0, 1.1),
    // Tabel NB.2–A1.1 "ψ-factoren voor gebouwen".
    psi: [
        PsiFactors { category: "A", description: "Woon- en verblijfsruimtes", psi0: 0.4, psi1: 0.5, psi2: 0.3 },
        PsiFactors { category: "B", description: "Kantoorruimtes", psi0: 0.5, psi1: 0.5, psi2: 0.3 },
        // Voetnoot a: ψ₀ = 0,4 voor de overige delen van een bijeenkomstruimte.
        PsiFactors { category: "C", description: "Bijeenkomstruimtes, overige delen", psi0: 0.4, psi1: 0.7, psi2: 0.6 },
        // Voetnoot a: ψ₀ = 0,6 voor delen die bij een calamiteit zwaar door een
        // mensenmenigte kunnen worden belast (vluchtroutes, trappen enz.).
        PsiFactors { category: "C-menigte", description: "Bijeenkomstruimtes, delen die bij een calamiteit zwaar door een mensenmenigte belast kunnen worden", psi0: 0.6, psi1: 0.7, psi2: 0.6 },
        PsiFactors { category: "D", description: "Winkelruimtes", psi0: 0.4, psi1: 0.7, psi2: 0.6 },
        PsiFactors { category: "E", description: "Opslagruimtes", psi0: 1.0, psi1: 0.9, psi2: 0.8 },
        PsiFactors { category: "F", description: "Verkeersruimte, voertuiggewicht ≤ 25 kN", psi0: 0.7, psi1: 0.7, psi2: 0.6 },
        PsiFactors { category: "G", description: "Verkeersruimte, 25 kN < voertuiggewicht ≤ 160 kN", psi0: 0.7, psi1: 0.5, psi2: 0.3 },
        PsiFactors { category: "H", description: "Daken", psi0: 0.0, psi1: 0.0, psi2: 0.0 },
        PsiFactors { category: "industrie-kort", description: "Industrieel gebruik, belasting niet langdurig aanwezig", psi0: 0.5, psi1: 0.5, psi2: 0.3 },
        PsiFactors { category: "industrie-lang", description: "Industrieel gebruik, belasting langdurig aanwezig", psi0: 1.0, psi1: 0.9, psi2: 0.8 },
        PsiFactors { category: "Wind", description: "Windbelasting", psi0: 0.0, psi1: 0.2, psi2: 0.0 },
        PsiFactors { category: "Sneeuw", description: "Sneeuwbelasting", psi0: 0.0, psi1: 0.2, psi2: 0.0 },
    ],
    // A1.4.3(4): w_max ≤ ℓ_rep/250, vloeren zowel als daken.
    w_max_noemer: 250.0,
    // A1.4.3(3), de vier gedachtestreepjes voor w2 + w3.
    w_add_noemer_scheurgevoelig: 500.0,
    w_add_noemer_intensief: 1000.0 / 3.0,
    w_add_noemer_overige_daken: 250.0,
    w_add_noemer_vloerafscheiding: 150.0,
};

#[cfg(test)]
mod tests {
    use super::*;

    /// De getallen uit NB tabel NB.3, NB.4 en NB.5, letterlijk uit de PDF.
    #[test]
    fn partiele_factoren_per_gevolgklasse() {
        let n = Ndp1990::voor(NationaleBijlage::NL);
        assert_eq!((n.uls_cc1.0.gamma_g_sup, n.uls_cc1.0.gamma_q), (1.2, 1.35));
        assert_eq!((n.uls_cc1.1.gamma_g_sup, n.uls_cc1.1.gamma_q), (1.1, 1.35));
        assert_eq!((n.uls_cc2.0.gamma_g_sup, n.uls_cc2.0.gamma_q), (1.35, 1.5));
        assert_eq!((n.uls_cc2.1.gamma_g_sup, n.uls_cc2.1.gamma_q), (1.2, 1.5));
        assert_eq!((n.uls_cc3.0.gamma_g_sup, n.uls_cc3.0.gamma_q), (1.5, 1.65));
        assert_eq!((n.uls_cc3.1.gamma_g_sup, n.uls_cc3.1.gamma_q), (1.3, 1.65));
        for (a, b) in [n.uls_cc1, n.uls_cc2, n.uls_cc3] {
            assert_eq!((a.gamma_g_inf, b.gamma_g_inf), (0.9, 0.9));
        }
        assert_eq!((n.equ.gamma_g_sup, n.equ.gamma_g_inf, n.equ.gamma_q), (1.1, 0.9, 1.5));
        assert_eq!(n.k_fi, (0.9, 1.0, 1.1));
    }

    /// De rijen van tabel NB.2 die tot september 2026 afweken.
    #[test]
    fn psi_volgens_nb2() {
        let n = Ndp1990::voor(NationaleBijlage::NL);
        let rij = |c: &str| *n.psi.iter().find(|p| p.category == c).expect(c);
        assert_eq!((rij("D").psi0, rij("D").psi1, rij("D").psi2), (0.4, 0.7, 0.6));
        assert_eq!((rij("F").psi0, rij("F").psi1, rij("F").psi2), (0.7, 0.7, 0.6));
        assert_eq!((rij("C").psi0, rij("C-menigte").psi0), (0.4, 0.6));
        assert_eq!((rij("Wind").psi1, rij("Sneeuw").psi1), (0.2, 0.2));
        assert_eq!(n.psi.len(), 13);
    }

    /// A1.4.3(3) en A1.4.3(4) — de doorbuigingsgrenzen.
    #[test]
    fn doorbuigingsgrenzen_volgens_a1_4_3() {
        let n = Ndp1990::voor(NationaleBijlage::NL);
        assert_eq!(n.w_max_noemer, 250.0);
        assert_eq!(n.w_add_noemer_scheurgevoelig, 500.0);
        assert_eq!(n.w_add_noemer_intensief, 1000.0 / 3.0);
        assert_eq!(n.w_add_noemer_overige_daken, 250.0);
        assert_eq!(n.w_add_noemer_vloerafscheiding, 150.0);
    }
}
