//! Onmogelijke maten worden geweigerd, met reden en zonder te hangen.
//!
//! Basisaudit nr 35: de doorsnedemotor controleerde zijn invoer niet. Een
//! flens dikker dan de halve hoogte liet de mesher tot boven een gigabyte
//! doorgroeien, een negatieve hoogte gaf stil A = 484,8 mm² met een negatieve
//! torsieconstante, een lijf breder dan de flens een oppervlak groter dan h·b,
//! en een buis met wanddikte 60 mm op d = 100 mm werd een massieve staaf.
//! Sinds september 2026 weigert `opdracht::reken` zulke maten vóór er een
//! contour van wordt gemaakt (`Profielvorm::controleer_maten`), en is het
//! randherstel van de mesher begrensd zodat ook een rechtstreekse aanroeper
//! met een ontaarde contour een antwoord krijgt in plaats van een hangend
//! proces.

use section_properties::motor::Profielvorm;
use section_properties::opdracht::{reken, Invoer};
use std::time::Instant;

fn lees(json: &str) -> Invoer {
    serde_json::from_str(json).expect("de JSON hoort op Invoer te passen")
}

/// Rekent en eist een fout, binnen een halve seconde, met de verwachte tekst.
fn weigert(json: &str, verwacht: &str) {
    let t0 = Instant::now();
    let uit = reken(&lees(json));
    let duur = t0.elapsed();
    let fout = match uit {
        Err(e) => e,
        Ok(u) => panic!(
            "hoort geweigerd te worden maar gaf A = {} mm² voor {json}",
            serde_json::to_value(&u).unwrap()["area_mm2"]
        ),
    };
    assert!(
        fout.contains(verwacht),
        "verwachtte \"{verwacht}\" in de fout, kreeg: {fout}"
    );
    assert!(
        duur.as_millis() < 500,
        "de weigering hoort direct te komen, duurde {duur:?}"
    );
}

#[test]
fn referentie_ipe200_komt_gewoon_door() {
    let u = reken(&lees(
        r#"{ "naam": "IPE 200", "soort": "ISection", "h": 200, "b": 100, "tw": 5.6, "tf": 8.5, "r": 12 }"#,
    ))
    .expect("IPE 200 is een geldige doorsnede");
    let v = serde_json::to_value(&u).unwrap();
    let a = v["area_mm2"].as_f64().unwrap();
    // Catalogus: A = 2848 mm² (afgerond); de contour geeft 2848,4.
    assert!((a - 2848.0).abs() < 2.0, "A = {a}");
    assert!(v["meldingen"].as_array().unwrap().is_empty(), "onverwachte meldingen: {}", v["meldingen"]);
}

#[test]
fn flens_dikker_dan_de_halve_hoogte() {
    weigert(
        r#"{ "soort": "ISection", "h": 100, "b": 100, "tw": 10, "tf": 60, "r": 10 }"#,
        "laat geen lijf over",
    );
    // Precies de helft is ook geen lijf.
    weigert(
        r#"{ "soort": "ISection", "h": 100, "b": 100, "tw": 10, "tf": 50, "r": 10 }"#,
        "laat geen lijf over",
    );
    weigert(
        r#"{ "soort": "Channel", "h": 100, "b": 50, "tw": 5, "tf": 60, "r": 8 }"#,
        "laat geen lijf over",
    );
}

#[test]
fn negatieve_of_nul_maten() {
    weigert(
        r#"{ "soort": "ISection", "h": -200, "b": 100, "tw": 5.6, "tf": 8.5, "r": 12 }"#,
        "h = -200",
    );
    weigert(
        r#"{ "soort": "ISection", "h": 0, "b": 0, "tw": 0, "tf": 0, "r": 0 }"#,
        "positief",
    );
    weigert(r#"{ "soort": "Shs", "h": 100, "b": -100, "t": 5 }"#, "b = -100");
    weigert(r#"{ "soort": "Rechthoek", "h": 300, "b": 0 }"#, "b = 0");
}

#[test]
fn lijf_breder_dan_de_flens() {
    weigert(
        r#"{ "soort": "ISection", "h": 200, "b": 100, "tw": 120, "tf": 10, "r": 10 }"#,
        "niet kleiner dan de flensbreedte",
    );
}

#[test]
fn uitronding_die_niet_past() {
    weigert(
        r#"{ "soort": "ISection", "h": 200, "b": 100, "tw": 10, "tf": 10, "r": 60 }"#,
        "walsuitronding",
    );
}

#[test]
fn holle_doorsneden_zonder_holte() {
    weigert(r#"{ "soort": "Shs", "h": 30, "b": 30, "t": 16 }"#, "laat geen holte over");
    weigert(r#"{ "soort": "Chs", "h": 100, "t": 60 }"#, "laat geen holte over");
    weigert(r#"{ "soort": "Chs", "h": 100, "t": 50 }"#, "laat geen holte over");
    // Wand die de hoekafronding 1,5·t niet toelaat.
    weigert(r#"{ "soort": "Shs", "h": 30, "b": 30, "t": 12 }"#, "hoekafronding");
}

#[test]
fn hoeklijn_met_been_dunner_dan_de_dikte() {
    weigert(
        r#"{ "soort": "Angle", "h": 50, "b": 30, "t": 30, "r": 5, "r2": 2.5 }"#,
        "kortste been",
    );
}

#[test]
fn catalogusdeel_in_een_samenstelling_wordt_ook_gecontroleerd() {
    weigert(
        r#"{ "soort": "Samenstelling", "catalogusdelen": [
            { "soort": "ISection", "h": 100, "b": 100, "tw": 10, "tf": 60, "r": 10, "y_mm": 0, "z_mm": 0 }
        ] }"#,
        "laat geen lijf over",
    );
}

/// Wie de motor rechtstreeks aanroept (zonder `opdracht`), kan de controle
/// zelf aanroepen — en de mesher hangt ook zónder die controle niet meer.
#[test]
fn controleer_maten_op_de_vorm_zelf_en_begrensd_randherstel() {
    let fout = Profielvorm::IProfiel { h: 100.0, b: 100.0, tw: 10.0, tf: 60.0, r: 10.0 };
    assert!(fout.controleer_maten().is_err());
    let goed = Profielvorm::IProfiel { h: 200.0, b: 100.0, tw: 5.6, tf: 8.5, r: 12.0 };
    assert!(goed.controleer_maten().is_ok());

    // De zelfsnijdende contour van de foute vorm door de mesher: vóór de
    // begrenzing groeide dit tot boven een gigabyte; nu is het binnen enkele
    // seconden klaar en zegt de mesh dat het randherstel onvolledig is.
    let t0 = Instant::now();
    let d = fout.doorsnede();
    let mesh = section_properties::mesh2d::genereer(&d, 5.0);
    assert!(
        t0.elapsed().as_secs() < 20,
        "de mesher hoort binnen de begrenzing te stoppen, duurde {:?}",
        t0.elapsed()
    );
    assert!(mesh.randherstel_onvolledig || !mesh.driehoeken.is_empty());
    // En een geldige contour blijft randconform.
    let mesh = section_properties::mesh2d::genereer(&goed.doorsnede(), 3.0);
    assert!(!mesh.randherstel_onvolledig);
}
