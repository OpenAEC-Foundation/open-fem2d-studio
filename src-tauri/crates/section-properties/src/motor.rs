//! **De gezaghebbende doorsnedeberekening.** Eén ingang die uit geometrie een
//! volledig gevulde [`SectionProperties`] maakt.
//!
//! Dit is de laag die de rest van het programma hoort te gebruiken. Hij bundelt
//! de drie kernen die er onder zitten:
//!
//! | kern | wat | nauwkeurigheid |
//! |------|-----|----------------|
//! | [`crate::contour`] | `A`, zwaartepunt, `Iy`, `Iz`, `Iyz`, hoofdassen, `Wel`, `Wpl`, traagheidsstralen | **exact** — gesloten randintegralen per lijn- en boogsegment, geen discretisatie |
//! | [`crate::torsie`] | `It`, `Iw`, schuifmiddelpunt | **numeriek convergent** — driehoekselementen, met een meegeleverde insluiting van `It` |
//! | deze module | `Av;y`, `Av;z` | **normbepaald** — EN 1993-1-1 §6.2.6(3), geen meetkundige grootheid |
//!
//! Die driedeling is het hele punt. Wat als randintegraal te schrijven is,
//! wordt niet benaderd; wat een randwaardeprobleem is, wordt opgelost in plaats
//! van uit een tabel geraden; en wat een normkeuze is, wordt als normkeuze
//! benoemd in plaats van als meetkunde vermomd.
//!
//! ## Voor wie het overtypen wil overslaan
//!
//! ```no_run
//! use section_properties::motor::{Profielvorm, bereken};
//! let p = bereken(&Profielvorm::IProfiel { h: 200.0, b: 100.0, tw: 5.6, tf: 8.5, r: 12.0 });
//! println!("It = {:.0} mm⁴", p.it_mm4);
//! ```
//!
//! Voor een doorsnede die niet in de catalogus staat gaat dezelfde weg via
//! [`bereken_doorsnede`], met een zelf opgebouwde [`Doorsnede`].

use crate::contour::{self, ContourEigenschappen, Doorsnede};
use crate::torsie::{self, TorsieOpties, TorsieResultaat};
use crate::SectionProperties;

// ════════════════════════════════════════════════════════════════════════════
//  Profielvormen
// ════════════════════════════════════════════════════════════════════════════

/// De catalogusvormen, met **uitsluitend genormeerde basismaten** als invoer.
///
/// Alles wat verder in de database staat — oppervlak, traagheden, `Wpl`, `It`,
/// `Iw` — volgt hieruit; er hoeft nergens meer een getal overgetypt te worden.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Profielvorm {
    /// Gewalst I/H-profiel met vier walsuitrondingen (IPE, HEA, HEB, HEM).
    IProfiel { h: f64, b: f64, tw: f64, tf: f64, r: f64 },
    /// U-profiel met **evenwijdige** flenzen (UPE, DIN 1026-2).
    UProfiel { h: f64, b: f64, tw: f64, tf: f64, r: f64 },
    /// U-profiel met **toelopende** flenzen (UNP, DIN 1026-1, 8 % schuinte).
    UProfielSchuin { h: f64, b: f64, tw: f64, tf: f64, r: f64 },
    /// Warmgewalste koker volgens EN 10210-2 (`r_o = 1,5·t`, `r_i = 1,0·t`).
    Koker { h: f64, b: f64, t: f64 },
    /// Warmgewalste ronde buis; `d` is de **buiten**diameter.
    Buis { d: f64, t: f64 },
    /// Massieve rechthoek (hout, vrije maatvoering).
    Rechthoek { h: f64, b: f64 },
}

impl Profielvorm {
    /// De exacte contour van deze vorm, linkeronderhoek op de oorsprong.
    pub fn doorsnede(&self) -> Doorsnede {
        match *self {
            Profielvorm::IProfiel { h, b, tw, tf, r } => contour::i_profiel(h, b, tw, tf, r),
            Profielvorm::UProfiel { h, b, tw, tf, r } => contour::u_profiel(h, b, tw, tf, r),
            Profielvorm::UProfielSchuin { h, b, tw, tf, r } => contour::unp(h, b, tw, tf, r),
            Profielvorm::Koker { h, b, t } => contour::koker_en10210(h, b, t),
            Profielvorm::Buis { d, t } => contour::buis(d, t),
            Profielvorm::Rechthoek { h, b } => contour::rechthoek(h, b),
        }
    }

    /// De drie maten die als `h_mm`, `b_mm`, `tw_mm`, `tf_mm` en `r_mm` in
    /// [`SectionProperties`] terechtkomen. Die velden zijn *administratie* —
    /// ze beschrijven de invoer en worden niet uit de contour teruggerekend.
    fn maten(&self) -> (f64, f64, f64, f64, f64) {
        match *self {
            Profielvorm::IProfiel { h, b, tw, tf, r }
            | Profielvorm::UProfiel { h, b, tw, tf, r }
            | Profielvorm::UProfielSchuin { h, b, tw, tf, r } => (h, b, tw, tf, r),
            // De opgeslagen `r` van een koker is de BUITENhoekstraal 1,5·t.
            Profielvorm::Koker { h, b, t } => (h, b, t, t, 1.5 * t),
            Profielvorm::Buis { d, t } => (d, d, t, t, 0.0),
            Profielvorm::Rechthoek { h, b } => (h, b, b, h, 0.0),
        }
    }

    /// `(Av;y, Av;z)` volgens EN 1993-1-1 §6.2.6(3), met `a` het **gemeten**
    /// oppervlak uit de contour.
    ///
    /// Dit is de enige grootheid in de motor die niet uit de meetkunde volgt
    /// maar uit een normregel: §6.2.6(3) geeft per doorsnedesoort een aparte
    /// uitdrukking, met een ondergrens `η·h_w·t_w`. `η = 1,0` is de waarde die
    /// de Nederlandse nationale bijlage toelaat en die de rest van de database
    /// gebruikt; hoger zou onveilig zijn zolang lijfplooien niet wordt getoetst.
    pub fn afschuifoppervlakken(&self, a: f64) -> (f64, f64) {
        const ETA: f64 = 1.0;
        match *self {
            // (a) gewalste I/H, belasting evenwijdig aan het lijf.
            Profielvorm::IProfiel { h, b, tw, tf, r } => {
                let hw = h - 2.0 * tf;
                let av_z = (a - 2.0 * b * tf + (tw + 2.0 * r) * tf).max(ETA * hw * tw);
                (2.0 * b * tf, av_z)
            }
            // (b) gewalste U: dezelfde vorm, met één uitronding per flens.
            Profielvorm::UProfiel { h, b, tw, tf, r }
            | Profielvorm::UProfielSchuin { h, b, tw, tf, r } => {
                let hw = h - 2.0 * tf;
                let av_z = (a - 2.0 * b * tf + (tw + r) * tf).max(ETA * hw * tw);
                (2.0 * b * tf, av_z)
            }
            // (c) holle doorsnede van gelijkmatige dikte: A·h/(b+h) resp. A·b/(b+h).
            Profielvorm::Koker { h, b, .. } => (a * b / (b + h), a * h / (b + h)),
            // (d) ronde holle doorsnede: 2A/π.
            Profielvorm::Buis { .. } => {
                let av = 2.0 * a / std::f64::consts::PI;
                (av, av)
            }
            // Massieve rechthoek: de schuifspanning is parabolisch, dus ⅔A.
            Profielvorm::Rechthoek { .. } => (2.0 * a / 3.0, 2.0 * a / 3.0),
        }
    }

    /// `true` als de doorsnede gesloten is; `Iw` speelt dan geen rol in de
    /// kiptoetsing en wordt op nul gezet in plaats van numeriek bepaald.
    fn is_gesloten(&self) -> bool {
        matches!(*self, Profielvorm::Koker { .. } | Profielvorm::Buis { .. })
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Rekenen
// ════════════════════════════════════════════════════════════════════════════

/// Wat er in `Av;y` / `Av;z` moet komen als de doorsnede niet uit de catalogus
/// komt maar uit losse contouren.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Afschuiving {
    /// Neem `Av = A` — geen normregel, gewoon het volle oppervlak.
    VolOppervlak,
    /// Neem de regel van een genoemde catalogusvorm.
    AlsVorm(Profielvorm),
    /// Zelf uitgerekende waarden `(Av;y, Av;z)`.
    Gegeven(f64, f64),
}

/// De volledige uitkomst, inclusief de diagnostiek die nodig is om te kunnen
/// *bewijzen* dat het getal klopt.
#[derive(Clone, Copy, Debug)]
pub struct MotorResultaat {
    /// Wat de rest van het programma gebruikt.
    pub props: SectionProperties,
    /// De exacte contourgrootheden, met de uiterste vezels en de PNA.
    pub contour: ContourEigenschappen,
    /// De numerieke torsie-uitkomst, met de insluiting van `It` en het
    /// meshverslag (aantal driehoeken, oppervlakcontrole, rekentijd).
    pub torsie: TorsieResultaat,
}

/// Reken een catalogusvorm door met de standaardinstellingen van de
/// torsiemotor (acht elementen door de dunste wand).
pub fn bereken(vorm: &Profielvorm) -> SectionProperties {
    bereken_uitgebreid(vorm, None).props
}

/// Idem, maar met de volledige diagnostiek erbij en desgewenst eigen
/// mesh-instellingen.
pub fn bereken_uitgebreid(vorm: &Profielvorm, opties: Option<TorsieOpties>) -> MotorResultaat {
    let d = vorm.doorsnede();
    let mut r = bereken_doorsnede_uitgebreid(
        &d,
        Afschuiving::AlsVorm(*vorm),
        opties,
    );
    let (h, b, tw, tf, straal) = vorm.maten();
    r.props.h_mm = h;
    r.props.b_mm = b;
    r.props.tw_mm = tw;
    r.props.tf_mm = tf;
    r.props.r_mm = straal;
    if vorm.is_gesloten() {
        // Een gesloten doorsnede wringt via St.-Venant; de welvingsstijfheid is
        // verwaarloosbaar en wordt in EN 1993-1-1 niet gebruikt. Nul zetten is
        // hier dus geen gebrek maar de juiste modelkeuze — en conservatief.
        r.props.iw_mm6 = 0.0;
    }
    r
}

/// Reken een **willekeurige** doorsnede door: catalogusprofiel, samengestelde
/// vorm of een met de hand opgebouwde contour, het maakt niet uit.
pub fn bereken_doorsnede(d: &Doorsnede, av: Afschuiving) -> SectionProperties {
    bereken_doorsnede_uitgebreid(d, av, None).props
}

/// De kern. Alles wat hierboven staat is verpakking.
pub fn bereken_doorsnede_uitgebreid(
    d: &Doorsnede,
    av: Afschuiving,
    opties: Option<TorsieOpties>,
) -> MotorResultaat {
    let e = d.bereken();
    let t = match opties {
        Some(o) => torsie::bereken_met(d, o),
        None => torsie::bereken(d),
    };

    let (av_y, av_z) = match av {
        Afschuiving::VolOppervlak => (e.a_mm2, e.a_mm2),
        Afschuiving::AlsVorm(v) => v.afschuifoppervlakken(e.a_mm2),
        Afschuiving::Gegeven(y, z) => (y, z),
    };

    // Wel;y en Wel;z zijn per conventie de MAATGEVENDE (kleinste) waarde: de
    // uiterste vezel het verst van de zwaartepuntsas. De vezelgewijze waarden
    // staan er los naast, want een U-profiel op zijn kant heeft er twee.
    let wel_y = e.wel_y_boven_mm3.min(e.wel_y_onder_mm3);
    let wel_z = e.wel_z_links_mm3.min(e.wel_z_rechts_mm3);

    let props = SectionProperties {
        area_mm2: e.a_mm2,
        iy_mm4: e.iy_mm4,
        iz_mm4: e.iz_mm4,
        wel_y_mm3: wel_y,
        wel_z_mm3: wel_z,
        wpl_y_mm3: e.wpl_y_mm3,
        wpl_z_mm3: e.wpl_z_mm3,
        av_y_mm2: av_y,
        av_z_mm2: av_z,
        it_mm4: t.it_beste_mm4,
        iw_mm6: if t.losse_delen { 0.0 } else { t.iw_mm6 },
        iy_radius_mm: e.i_y_straal_mm,
        iz_radius_mm: e.i_z_straal_mm,
        // De vijf maatvelden beschrijven de invoergeometrie. Voor een losse
        // contour is er geen "flensdikte", dus alleen de omhullende maat.
        h_mm: e.z_max_mm - e.z_min_mm,
        b_mm: e.y_max_mm - e.y_min_mm,
        tw_mm: 0.0,
        tf_mm: 0.0,
        r_mm: 0.0,
        y_c_mm: e.y_c_mm,
        z_c_mm: e.z_c_mm,
        wel_y_top_mm3: e.wel_y_boven_mm3,
        wel_y_bot_mm3: e.wel_y_onder_mm3,
        wel_z_left_mm3: e.wel_z_links_mm3,
        wel_z_right_mm3: e.wel_z_rechts_mm3,
        iyz_mm4: e.iyz_mm4,
        iu_mm4: e.iu_mm4,
        iv_mm4: e.iv_mm4,
        alpha_hoofdas_rad: e.alpha_hoofdas_rad,
        y_s_mm: if t.losse_delen { e.y_c_mm } else { t.y_s_mm },
        z_s_mm: if t.losse_delen { e.z_c_mm } else { t.z_s_mm },
    };

    MotorResultaat { props, contour: e, torsie: t }
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn rel(gemeten: f64, verwacht: f64) -> f64 {
        ((gemeten - verwacht) / verwacht).abs()
    }

    /// De ronde buis is het enige catalogusprofiel waarvan **elke** grootheid
    /// een gesloten vorm heeft — inclusief `It = 2·I`. Als de motor daar
    /// exact op uitkomt, zit de fout nergens in de keten.
    #[test]
    fn buis_reproduceert_alle_gesloten_vormen() {
        let (d, t) = (219.1, 10.0);
        let p = bereken(&Profielvorm::Buis { d, t });
        let (ro, ri) = (d / 2.0, d / 2.0 - t);
        let a = PI * (ro * ro - ri * ri);
        let i = PI * (ro.powi(4) - ri.powi(4)) / 4.0;

        assert!(rel(p.area_mm2, a) < 1e-9, "A: {:.3e}", rel(p.area_mm2, a));
        assert!(rel(p.iy_mm4, i) < 1e-9);
        assert!(rel(p.iz_mm4, i) < 1e-9);
        assert!(rel(p.wel_y_mm3, 2.0 * i / d) < 1e-9);
        assert!(rel(p.wpl_y_mm3, (d.powi(3) - (d - 2.0 * t).powi(3)) / 6.0) < 1e-9);
        assert!(rel(p.iy_radius_mm, (i / a).sqrt()) < 1e-9);
        // Av = 2A/π volgens EN 1993-1-1 §6.2.6(3)(d).
        assert!(rel(p.av_z_mm2, 2.0 * a / PI) < 1e-9);
        // It = 2·I exact; de numerieke oplossing haalt dat op 0,1 %.
        let f = rel(p.it_mm4, 2.0 * i);
        assert!(f < 1e-3, "It wijkt {:.4} % af", f * 100.0);
        // Gesloten doorsnede: Iw op nul.
        assert_eq!(p.iw_mm6, 0.0);
        // Dubbelsymmetrisch: schuifmiddelpunt = zwaartepunt.
        assert!((p.y_s_mm - p.y_c_mm).abs() < 1e-6 * d);
        assert!((p.z_s_mm - p.z_c_mm).abs() < 1e-6 * d);
    }

    /// De EN 10210-2-koker moet de gepubliceerde waarde van de seed
    /// HFRHS200X200X16 raken; die is op een externe referentie-berekening
    /// geijkt en staat dus los van zowel de motor als de generator.
    #[test]
    fn koker_en10210_raakt_de_geijkte_seed() {
        let p = bereken(&Profielvorm::Koker { h: 200.0, b: 200.0, t: 16.0 });
        // A = 11501,30 mm² uit de externe referentie-berekening.
        let f = rel(p.area_mm2, 11_501.30);
        assert!(f < 1e-4, "A = {:.2} mm², {:.4} % naast 11501,30", p.area_mm2, f * 100.0);
        // Het concentrische model zou hier 1,4 % lager uitkomen; dat mag niet
        // ongemerkt terugsluipen.
        let concentrisch = contour::koker(200.0, 200.0, 16.0, 24.0).bereken().a_mm2;
        assert!(concentrisch < 11_400.0, "concentrisch model verschilt niet meer");
    }

    /// De UNP-contour met 8 % schuinte moet het genormeerde oppervlak halen
    /// dat uit de DIN 1026-1 massa per meter volgt; het prismatische model
    /// ligt daar ~2 % boven.
    #[test]
    fn unp_schuinte_haalt_de_genormeerde_massa() {
        // DIN 1026-1 massa per meter (kg/m) bij ρ = 7850 kg/m³.
        for &(h, b, tw, tf, r, massa) in &[
            (80.0, 45.0, 6.0, 8.0, 8.0, 8.64),
            (140.0, 60.0, 7.0, 10.0, 10.0, 16.0),
            (200.0, 75.0, 8.5, 11.5, 11.5, 25.3),
            (300.0, 100.0, 10.0, 16.0, 16.0, 46.2),
        ] {
            let a_norm = massa / 7850.0 * 1e6; // kg/m → mm²
            let schuin =
                bereken(&Profielvorm::UProfielSchuin { h, b, tw, tf, r }).area_mm2;
            let recht = bereken(&Profielvorm::UProfiel { h, b, tw, tf, r }).area_mm2;
            let f_schuin = rel(schuin, a_norm);
            let f_recht = rel(recht, a_norm);
            assert!(
                f_schuin < 0.01,
                "UNP {h}: schuin {schuin:.0} mm² tegen {a_norm:.0} mm² = {:.2} %",
                f_schuin * 100.0
            );
            assert!(
                f_recht > f_schuin,
                "UNP {h}: het prismatische model ({:.2} %) hoort slechter te zijn \
                 dan het schuine ({:.2} %)",
                f_recht * 100.0,
                f_schuin * 100.0
            );
        }
    }

    /// Een UNP is niet symmetrisch om de z-as: het schuifmiddelpunt moet aan
    /// de andere kant van het lijf liggen dan de flenzen, en `Iw` moet onder
    /// de formulevrije bovengrens `Iz·h_s²/4` blijven.
    #[test]
    fn unp_schuifmiddelpunt_ligt_achter_het_lijf() {
        let (h, b, tw, tf, r) = (200.0, 75.0, 8.5, 11.5, 11.5);
        let m = bereken_uitgebreid(
            &Profielvorm::UProfielSchuin { h, b, tw, tf, r },
            None,
        );
        let p = m.props;
        assert!(p.y_s_mm < 0.0, "schuifmiddelpunt op y = {:.2} mm", p.y_s_mm);
        assert!(p.y_c_mm > 0.0 && p.y_c_mm < b);
        let grens = p.iz_mm4 * (h - tf).powi(2) / 4.0;
        assert!(p.iw_mm6 < grens, "Iw {:.3e} ≥ bovengrens {:.3e}", p.iw_mm6, grens);
    }

    /// De motor moet dezelfde uitkomst geven als je hem via de contour
    /// aanroept in plaats van via de vorm — dat is de garantie dat er maar
    /// één rekenweg is.
    #[test]
    fn vorm_en_losse_contour_geven_hetzelfde() {
        let v = Profielvorm::IProfiel { h: 300.0, b: 150.0, tw: 7.1, tf: 10.7, r: 15.0 };
        let a = bereken(&v);
        let b = bereken_doorsnede(&v.doorsnede(), Afschuiving::AlsVorm(v));
        assert_eq!(a.area_mm2, b.area_mm2);
        assert_eq!(a.iy_mm4, b.iy_mm4);
        assert_eq!(a.wpl_y_mm3, b.wpl_y_mm3);
        assert_eq!(a.av_z_mm2, b.av_z_mm2);
    }
}
