//! NEN-EN 1993-1-1 cross-section resistance checks (article 6.2).
//! All check functions return ResistanceCalc with derivation steps.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;

/// De nationaal bepaalde parameters bij NEN-EN 1993-1-1, uit de normnaad.
///
/// γ_M0, γ_M1 en γ_M2 zijn nationaal bepaald (NB bij §6.1(1), OPMERKING 2B).
/// Ze staan per staalsoort in [`SteelGrade`] omdat dat type ook langs de drie
/// wegen naar buiten gaat, maar het GETAL hoort niet bij de staalsoort: het
/// hoort bij de bijlage. Daarom komt het hier uit de naad en staat het niet
/// meer vijf keer als los cijfer in de regels hieronder.
pub(crate) const NDP: nationale_bijlage::Ndp1993 =
    nationale_bijlage::Ndp1993::voor(nationale_bijlage::NationaleBijlage::NL);

pub mod classification;
pub mod compression;
pub mod bending;
pub mod shear;
pub mod combined_mv;
pub mod combined_mn;
pub mod combined_mnv;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct SteelGrade {
    pub name: &'static str,
    pub fy_mpa: f64,
    pub fu_mpa: f64,
    pub gamma_m0: f64,
    pub gamma_m1: f64,
    pub gamma_m2: f64,
}

// NEN-EN 1993-1-1+A1:2014+NB:2016 tabel 3.1, "Nominale waarden van de
// vloeigrens f_y en de treksterkte f_u voor warmgewalst constructiestaal",
// kolom t ≤ 40 mm. S235, S275 en S355 volgens EN 10025-2; S420 en S460
// volgens EN 10025-3 (N/NL). De kolom 40 mm < t ≤ 80 mm staat in
// [`SteelGrade::voor_dikte`].
//
// f_u van S355 was hier 510 N/mm². Dat is de waarde van S355H uit EN 10210-1
// (warmvervaardigde buisprofielen); voor het gewalste plaat- en profielstaal
// van EN 10025-2 geeft tabel 3.1 490 N/mm². De lastoets (NEN-EN 1993-1-8,
// f_vw,d = f_u/√3/(β_w·γ_M2)) was daarmee 4 % te gunstig. Zie basisaudit
// §3.2 punt 1.
pub const S235: SteelGrade = SteelGrade { name: "S235", fy_mpa: 235.0, fu_mpa: 360.0, gamma_m0: NDP.gamma_m0, gamma_m1: NDP.gamma_m1, gamma_m2: NDP.gamma_m2 };
pub const S275: SteelGrade = SteelGrade { name: "S275", fy_mpa: 275.0, fu_mpa: 430.0, gamma_m0: NDP.gamma_m0, gamma_m1: NDP.gamma_m1, gamma_m2: NDP.gamma_m2 };
pub const S355: SteelGrade = SteelGrade { name: "S355", fy_mpa: 355.0, fu_mpa: 490.0, gamma_m0: NDP.gamma_m0, gamma_m1: NDP.gamma_m1, gamma_m2: NDP.gamma_m2 };
pub const S420: SteelGrade = SteelGrade { name: "S420", fy_mpa: 420.0, fu_mpa: 520.0, gamma_m0: NDP.gamma_m0, gamma_m1: NDP.gamma_m1, gamma_m2: NDP.gamma_m2 };
pub const S460: SteelGrade = SteelGrade { name: "S460", fy_mpa: 460.0, fu_mpa: 540.0, gamma_m0: NDP.gamma_m0, gamma_m1: NDP.gamma_m1, gamma_m2: NDP.gamma_m2 };

/// Bovengrens van de dikteklasse t ≤ 40 mm in tabel 3.1.
pub const DIKTE_GRENS_40_MM: f64 = 40.0;
/// Bovengrens van tabel 3.1: boven 80 mm geeft de tabel geen waarde meer.
pub const DIKTE_GRENS_80_MM: f64 = 80.0;

/// De dikteklasse van tabel 3.1 waarin een element valt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Dikteklasse {
    /// t ≤ 40 mm — de kolom waaruit de constanten hierboven komen.
    TotEnMet40,
    /// 40 mm < t ≤ 80 mm — lagere f_y en f_u.
    Van40Tot80,
}

impl Dikteklasse {
    pub fn label(self) -> &'static str {
        match self {
            Self::TotEnMet40 => "t ≤ 40 mm",
            Self::Van40Tot80 => "40 mm < t ≤ 80 mm",
        }
    }
}

impl SteelGrade {
    /// Tabel 3.1, kolom 40 mm < t ≤ 80 mm, als `(f_y, f_u)` in N/mm².
    ///
    /// EN 10025-2: S235 215/360, S275 255/410, S355 335/470;
    /// EN 10025-3 (N/NL): S420 390/520, S460 430/540.
    fn dik(&self) -> Option<(f64, f64)> {
        match self.name {
            "S235" => Some((215.0, 360.0)),
            "S275" => Some((255.0, 410.0)),
            "S355" => Some((335.0, 470.0)),
            "S420" => Some((390.0, 520.0)),
            "S460" => Some((430.0, 540.0)),
            _ => None,
        }
    }

    /// De staalsoort voor een element met nominale dikte `t_mm`, volgens
    /// tabel 3.1: tot en met 40 mm de waarden van de constante, van 40 tot en
    /// met 80 mm de lagere kolom, en daarboven een fout — tabel 3.1 houdt bij
    /// 80 mm op en de kern raadt daar niets. Een dikte van nul of kleiner
    /// betekent "onbekend"; dan geldt de kolom t ≤ 40 mm en zegt de notitie
    /// dat.
    ///
    /// Geeft de aangepaste staalsoort (zelfde naam, andere f_y en f_u), de
    /// dikteklasse en een notitie voor het rapport.
    pub fn voor_dikte(&self, t_mm: f64) -> Result<(SteelGrade, Dikteklasse, String), String> {
        if !t_mm.is_finite() || t_mm <= 0.0 {
            return Ok((
                *self,
                Dikteklasse::TotEnMet40,
                format!(
                    "Tabel 3.1: de elementdikte is niet bekend; aangehouden is de kolom t ≤ 40 mm \
                     met f_y = {} N/mm² en f_u = {} N/mm². Bij platen dikker dan 40 mm gelden \
                     lagere waarden.",
                    self.fy_mpa, self.fu_mpa
                ),
            ));
        }
        if t_mm <= DIKTE_GRENS_40_MM {
            return Ok((
                *self,
                Dikteklasse::TotEnMet40,
                format!(
                    "Tabel 3.1: dikste element t = {} mm ≤ 40 mm, dus f_y = {} N/mm² en \
                     f_u = {} N/mm² ({}).",
                    nl_mm(t_mm), self.fy_mpa, self.fu_mpa, self.name
                ),
            ));
        }
        if t_mm <= DIKTE_GRENS_80_MM {
            let (fy, fu) = self.dik().ok_or_else(|| {
                format!(
                    "staalsoort {} heeft in tabel 3.1 geen kolom 40 mm < t ≤ 80 mm",
                    self.name
                )
            })?;
            return Ok((
                SteelGrade { fy_mpa: fy, fu_mpa: fu, ..*self },
                Dikteklasse::Van40Tot80,
                format!(
                    "Tabel 3.1: dikste element t = {} mm ligt in de klasse 40 mm < t ≤ 80 mm, dus \
                     f_y = {} N/mm² en f_u = {} N/mm² in plaats van {} en {} ({}).",
                    nl_mm(t_mm), fy, fu, self.fy_mpa, self.fu_mpa, self.name
                ),
            ));
        }
        Err(format!(
            "elementdikte t = {} mm ligt boven de 80 mm van NEN-EN 1993-1-1 tabel 3.1; voor \
             dikkere elementen geeft de norm geen f_y en f_u en toetst de kern niet",
            nl_mm(t_mm)
        ))
    }
}

/// Een maat in mm met decimaalkomma, zonder loze ",0".
fn nl_mm(v: f64) -> String {
    let s = format!("{v:.1}");
    s.strip_suffix(".0").unwrap_or(&s).replace('.', ",")
}

pub fn grade_by_name(name: &str) -> Option<SteelGrade> {
    match name {
        "S235" => Some(S235), "S275" => Some(S275), "S355" => Some(S355),
        "S420" => Some(S420), "S460" => Some(S460), _ => None,
    }
}

#[cfg(test)]
mod dikte_tests {
    use super::*;

    /// γ_M0, γ_M1 en γ_M2 komen uit de normnaad en niet uit een los getal bij
    /// de staalsoort. De bron wordt naast de gebruikte waarde gelegd, ook voor
    /// de dikteklasse 40–80 mm: die bouwt een nieuwe `SteelGrade` en zou de
    /// factoren kunnen verliezen.
    #[test]
    fn gamma_m_komt_uit_de_normnaad() {
        let bron = nationale_bijlage::Ndp1993::voor(nationale_bijlage::NationaleBijlage::NL);
        for g in [S235, S275, S355, S420, S460] {
            assert_eq!((g.gamma_m0, g.gamma_m1, g.gamma_m2),
                       (bron.gamma_m0, bron.gamma_m1, bron.gamma_m2), "{}", g.name);
            let (dik, _, _) = g.voor_dikte(50.0).unwrap();
            assert_eq!((dik.gamma_m0, dik.gamma_m1, dik.gamma_m2),
                       (bron.gamma_m0, bron.gamma_m1, bron.gamma_m2), "{} dik", g.name);
        }
    }

    #[test]
    fn tabel_3_1_per_dikteklasse() {
        let (g, k, _) = S235.voor_dikte(15.0).unwrap();
        assert_eq!(k, Dikteklasse::TotEnMet40);
        assert_eq!((g.fy_mpa, g.fu_mpa), (235.0, 360.0));
        let (g, k, n) = S235.voor_dikte(50.0).unwrap();
        assert_eq!(k, Dikteklasse::Van40Tot80);
        assert_eq!((g.fy_mpa, g.fu_mpa), (215.0, 360.0));
        assert!(n.contains("40 mm < t ≤ 80 mm"));
        assert_eq!(S355.voor_dikte(40.0).unwrap().0.fy_mpa, 355.0);
        assert_eq!(S355.voor_dikte(40.5).unwrap().0.fy_mpa, 335.0);
        assert_eq!(S355.voor_dikte(80.0).unwrap().0.fu_mpa, 470.0);
        assert_eq!(S460.voor_dikte(60.0).unwrap().0.fy_mpa, 430.0);
        assert!(S355.voor_dikte(80.1).is_err());
        // Onbekende dikte: kolom t ≤ 40 mm, met een notitie die dat zegt.
        let (g, _, n) = S355.voor_dikte(0.0).unwrap();
        assert_eq!(g.fy_mpa, 355.0);
        assert!(n.contains("niet bekend"));
    }

    #[test]
    fn f_u_van_s355_is_de_waarde_van_en_10025_2() {
        assert_eq!(S355.fu_mpa, 490.0);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum CheckStatus { Ok, NotOk, NotApplicable }

// `PartialEq`: een antwoordtype dat deelstappen draagt moet vergelijkbaar
// blijven — de drie-wegen-tests zetten twee antwoorden naast elkaar. Puur
// gegevens, dus de afgeleide vergelijking is de bedoelde.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct NamedValue {
    pub symbol: String,
    pub value: f64,
    pub unit: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct UnityCheck {
    pub ed: f64,
    pub rd: f64,
    pub uc: f64,
    pub formula_latex: String,
}

/// Eén stap uit de afleiding die aan een toets voorafgaat.
///
/// Een toets is zelden één formule. Een kiptoets is een keten van veertien
/// (B*, β, C₁, C₂, L_kip, S, C, k_red, M_cr, λ̄_LT, χ_LT); een betonnen
/// doorsnedetoets is er een van rekenwaarden, nuttige hoogte, krachtenevenwicht,
/// drukzonehoogte, rekverdeling, hefboomsarm en momentenevenwicht. Van zo'n
/// keten alleen de UITKOMSTEN afleveren — een rij losse getallen — is voor een
/// rapport dat een normtoets moet verantwoorden te weinig: het moet per stap
/// tonen wélke formule is gebruikt, met wélke getallen, en wáár die formule
/// staat. Een `Deelstap` draagt daarom de hele stap: de formule symbolisch,
/// dezelfde formule met de getallen ingevuld, de uitkomst met haar eenheid, en
/// de vindplaats in de norm.
///
/// **Waarom dit type hier staat en niet bij de stabiliteitstoetsen.** Het is
/// daar begonnen — de kipketen was de eerste die een afleiding nodig had — maar
/// een afleiding is geen eigenschap van stabiliteit. De betontoetsen zijn
/// weerstandstoetsen ([`ResistanceCalc`]) en hebben dezelfde keten nodig. Omdat
/// `nen-en-1993-1-1-stability` van deze crate afhangt en niet andersom, kan het
/// type alleen hier staan; de stabiliteitscrate exporteert hem onveranderd door,
/// zodat `nen_en_1993_1_1_stability::Deelstap` blijft werken. Het ts-rs-pad is
/// hetzelfde gebleven, dus de frontend ziet exact dezelfde `Deelstap.ts`.
///
/// **Waarom de ingevulde regel uit de rekenkern komt en niet uit de frontend.**
/// De frontend maakt zo'n regel voor een gewone toets door de symbolen in
/// `formula_latex` door hun waarde te vervangen (`vulGetallenIn`). Dat werkt
/// voor een formule als `N_{c,Rd} = A f_y / \gamma_{M0}`, maar de ketens hier
/// bevatten wortels met losse hoofdletters (`\sqrt{E I_z / (G I_t)}`), sommaties
/// over wapeningslagen, en eenheidsomrekeningen (kNm → N·mm) die helemaal geen
/// symbool hebben. Wie de formule kent kan de ingevulde regel exact opschrijven;
/// een tekstvervanging achteraf kan dat niet. `ingevuld_latex` is daarom in de
/// kern gevuld. Is hij leeg, dan hoort er geen ingevulde regel te staan
/// (bijvoorbeeld bij een stap die alleen uitgangspunten opsomt).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct Deelstap {
    /// Stabiele sleutel, bedoeld om een stap in code of test op terug te vinden
    /// (`"m_cr"`, `"k_red"`, `"uitgangspunten"`). Geen rapporttekst.
    pub id: String,
    /// Nederlandse kop boven de stap, bijvoorbeeld "Kritiek kipmoment".
    pub titel: String,
    /// Het LaTeX-symbool van de grootheid die deze stap oplevert (`"M_{cr}"`).
    /// Leeg als de stap geen enkele grootheid oplevert.
    pub symbol: String,
    /// De vindplaats: vergelijking- of artikelnummer, bijvoorbeeld `"NB.148"`
    /// of `"art. 3.1.7(3) (3.19)"`. Apart veld, niet als achtervoegsel in de
    /// titel — het rapport zet hem in de rechtermarge.
    pub article: String,
    /// De formule symbolisch.
    pub formula_latex: String,
    /// Dezelfde formule met de getallen ingevuld. Leeg = geen ingevulde regel.
    pub ingevuld_latex: String,
    /// De grootheden die in de formule voorkomen, mét de eenheid waarin ze in
    /// díe formule staan (dus N·mm waar de formule N·mm rekent, ook als de
    /// uitgangspuntenlijst dezelfde grootheid in kNm toont).
    pub variables: Vec<NamedValue>,
    /// De uitkomst van de stap. `None` voor een stap zonder uitkomst.
    pub value: Option<f64>,
    pub unit: String,
    /// Kanttekeningen bij déze stap: welke tak van de norm geldt, waar een
    /// benadering buiten de norm om is aangehouden, welke aanname eronder ligt.
    ///
    /// Dit veld is niet decoratief. Een afleiding die stilzwijgend een aanname
    /// doet is erger dan geen afleiding: de lezer denkt dan dat hij de hele
    /// redenering ziet. Elke aangenomen bezwijkvorm, elke vereenvoudiging en
    /// elke normgrens die NIET getoetst is, hoort hier te staan.
    pub notes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct ResistanceCalc {
    pub id: String,
    pub title: String,
    pub article: String,
    pub force_state: ForceStateSnapshot,
    pub formula_latex: String,
    pub variables: Vec<NamedValue>,
    /// De afleiding die aan deze toets voorafgaat, in de volgorde waarin het
    /// rapport haar toont. Leeg voor toetsen die geen voorafgaande keten
    /// hebben — dan verandert er niets aan de weergave. De betontoetsen vullen
    /// hem; de staal- en houttoetsen zijn één formule en laten hem leeg.
    #[serde(default)]
    pub deelstappen: Vec<Deelstap>,
    pub value: f64,
    pub unit: String,
    pub uc: Option<UnityCheck>,
    pub status: CheckStatus,
    pub notes: Vec<String>,
}
