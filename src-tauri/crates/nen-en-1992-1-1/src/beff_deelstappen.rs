//! De afleiding van de meewerkende flensbreedte als uitgeschreven stappen,
//! voor het rapport (NEN-EN 1992-1-1 art. 5.3.2.1).
//!
//! # Waarom deze module bestaat
//!
//! [`crate::beff`] rekende de hele gang al: welk geval van figuur 5.2 in welk
//! gebied geldt, l₀ per gebied, en per uitkragend flensdeel alle drie de
//! kandidaten van (5.7a)/(5.7b) met de grens die won. Maar wie alleen het
//! ANTWOORD ziet — "b_eff = 2780 mm" in de doorsnedenaam — leest een getal dat
//! uit de lucht valt: hij voerde 4300 mm in. Deze module schrijft de weg
//! ertussen op, in hetzelfde patroon als de betontoetsing zelf
//! ([`crate::deelstappen`]) en de kipketen van EN 1993.
//!
//! **Deze module rekent niets opnieuw uit.** Zij krijgt de [`BeffDistribution`]
//! aangereikt die [`crate::beff::beff_distribution`] heeft geleverd en zet die
//! om in tekst. Elke l₀, elke b_eff,i, elke gewonnen grens komt ONVERANDERD uit
//! dat antwoord. Dezelfde reden als daar: een afleiding die zijn eigen som
//! maakt, kan van de kern af gaan drijven zonder dat een test dat ziet, en dan
//! beschrijft het rapport een berekening die niet is uitgevoerd.
//!
//! Er wordt op twee plaatsen wél iets bepaald, en beide keren is dat een
//! OPZOEKING in de meegegeven gegevens en geen tweede afleiding:
//!
//! * welke twee overspanningen bij een steunpuntgebied horen — dat is de
//!   overspanningsgrens die binnen het x-bereik van dat gebied valt
//!   ([`steunpunt_overspanningen`]);
//! * of de geldigheidsvoorwaarden van de OPMERKING bij figuur 5.2 gehaald zijn.
//!   Die zijn per definitie gehaald, want anders had `beff_distribution` een
//!   [`crate::beff::BeffError`] gegeven en was er geen verdeling om op te
//!   schrijven. De stap rekent ze toch uit, mét de getallen, omdat "voldaan"
//!   zonder getallen niet na te vertellen is.
//!
//! # Vindplaatsen
//!
//! Elk artikelnummer hieronder komt uit [`crate::beff`], waar de tekst van
//! 5.3.2.1 en van de OPMERKING bij figuur 5.2 letterlijk in de moduledoc staat,
//! en uit [`L0Case::source`], die per geval zijn eigen vindplaats draagt. Er is
//! hier geen enkele vindplaats bijverzonnen en geen enkele normwaarde uit het
//! hoofd opgeschreven; de grenzen 2/3, 1,5 en ½ komen uit de constanten
//! [`SPAN_RATIO_MIN`], [`SPAN_RATIO_MAX`] en [`CANTILEVER_MAX_RATIO`] van
//! dezelfde module.

use nen_en_1993_1_1_section::Deelstap;

use crate::beff::{
    BeamLine, BeffBound, BeffDistribution, BeffZone, FlangeGeometry, L0Case, L0Zone, LineEnd,
    CANTILEVER_MAX_RATIO, SPAN_RATIO_MAX, SPAN_RATIO_MIN,
};
use crate::deelstappen::{lx, nl, nv, stap};

/// Speling waarmee een overspanningsgrens binnen een gebied wordt herkend.
/// Relatief aan de lijnlengte, zodat hij met de maatvoering meeschaalt.
const X_TOL: f64 = 1e-9;

// ───────────────────────────────────────────────────────────────────────────
// De keten
// ───────────────────────────────────────────────────────────────────────────

/// De hele afleiding van b_eff voor één gebied uit de verdeling, als keten van
/// deelstappen: de liggerlijn en het geval van figuur 5.2, l₀, b_eff,i per
/// flensdeel, b_eff volgens (5.7), en de geldigheidsvoorwaarden.
///
/// `zone_index` wijst het gebied aan waarvoor de afleiding geldt. Ligt hij
/// buiten `verdeling.zones`, dan komt er een lege keten terug — geen paniek en
/// geen keten die over een ander gebied gaat dan de aanroeper bedoelde.
pub fn beff_deelstappen(
    line: &BeamLine,
    flange: &FlangeGeometry,
    verdeling: &BeffDistribution,
    zone_index: usize,
) -> Vec<Deelstap> {
    let Some(zone) = verdeling.zones.get(zone_index) else {
        return Vec::new();
    };
    let mut keten = vec![
        liggerlijn_stap(line, flange, verdeling, zone),
        l0_stap(line, zone),
    ];
    for (i, deel) in zone.parts.iter().enumerate() {
        keten.push(flensdeel_stap(i, deel, zone.zone.l0_mm));
    }
    keten.push(b_eff_stap(flange, zone));
    keten.push(geldigheid_stap(line));
    keten
}

// ───────────────────────────────────────────────────────────────────────────
// 1. De liggerlijn en het geval van figuur 5.2
// ───────────────────────────────────────────────────────────────────────────

/// Wat er aan een uiteinde van de liggerlijn zit, in woorden.
///
/// De omschrijvingen zijn die van [`LineEnd`] zelf; `Restrained` staat niet in
/// figuur 5.2 en dat wordt hier — net als daar — met zoveel woorden gezegd.
fn uiteinde_tekst(eind: LineEnd) -> &'static str {
    match eind {
        LineEnd::Support => {
            "een vrij opgelegd buitensteunpunt dat de hoekverdraaiing niet verhindert — \
             het linker steunpunt van figuur 5.2"
        }
        LineEnd::Restrained => {
            "een momentvast buitenuiteinde (een inklemming, of een raamwerkknoop waar de \
             ligger op een kolom aansluit); dat geval staat niet in figuur 5.2"
        }
        LineEnd::Free => "een vrij einde: de buitenste overspanning is een uitkraging",
    }
}

/// Welk gebied van figuur 5.2 dit is, in woorden.
fn geval_tekst(case: L0Case) -> &'static str {
    match case {
        L0Case::EndSpan => {
            "het VELDGEBIED VAN EEN EINDVELD — het eerste gebied van figuur 5.2: aan de ene \
             kant een vrij opgelegd buitensteunpunt, aan de andere kant een steunpunt"
        }
        L0Case::InteriorSpan => {
            "het VELDGEBIED VAN EEN BINNENVELD — het derde gebied van figuur 5.2: aan beide \
             kanten een steunpunt"
        }
        L0Case::SingleSpan => {
            "het VELDGEBIED VAN EEN ENKELE OVERSPANNING die aan beide zijden vrij is opgelegd; \
             de momentnulpunten liggen dan in de steunpunten zelf"
        }
        L0Case::InteriorSupport => {
            "het GEBIED ROND EEN TUSSENSTEUNPUNT — het tweede gebied van figuur 5.2, dat aan \
             weerszijden van het steunpunt 0,15 maal de aangrenzende overspanning beslaat"
        }
        L0Case::RestrainedEnd => {
            "het GEBIED BIJ EEN MOMENTVAST BUITENUITEINDE: mechanisch hetzelfde beeld als een \
             tussensteunpunt, maar met één aangrenzende overspanning in plaats van twee"
        }
        L0Case::Cantilever => {
            "het GEBIED DAT OVER HET STEUNPUNT TOT HET VRIJE EINDE LOOPT — het vierde gebied \
             van figuur 5.2"
        }
    }
}

/// Stap 1: uit welke overspanningen en uiteinden de liggerlijn bestaat, en welk
/// geval van figuur 5.2 daaruit volgt voor het beschouwde gebied.
///
/// Geen formule, dus het rapport toont de grootheden als lijst — dezelfde
/// weergave als de uitgangspuntenstap van de doorsnedetoetsing.
fn liggerlijn_stap(
    line: &BeamLine,
    flange: &FlangeGeometry,
    verdeling: &BeffDistribution,
    zone: &BeffZone,
) -> Deelstap {
    let mut variables = Vec::new();
    for (i, l) in line.spans_mm.iter().enumerate() {
        variables.push(nv(&format!("l_{}", i + 1), *l, "mm"));
    }
    variables.push(nv("b_w", flange.b_w_mm, "mm"));
    for (i, b_i) in flange.b_i_mm.iter().enumerate() {
        variables.push(nv(&format!("b_{}", i + 1), *b_i, "mm"));
    }
    variables.push(nv("b", flange.b_mm(), "mm"));

    let overspanningen = line
        .spans_mm
        .iter()
        .enumerate()
        .map(|(i, l)| format!("l{} = {} mm", i + 1, nl(*l, 0)))
        .collect::<Vec<_>>()
        .join(", ");

    let mut notes = vec![
        format!(
            "De liggerlijn telt {} overspanning{}: {}. Aan het begin van de lijn (x = 0) zit {}. \
             Aan het eind (x = {} mm) zit {}.",
            line.spans_mm.len(),
            if line.spans_mm.len() == 1 { "" } else { "en" },
            overspanningen,
            uiteinde_tekst(line.start),
            nl(line.total_length_mm(), 0),
            uiteinde_tekst(line.end)
        ),
        format!(
            "Daarmee is het gebied waarin deze doorsnede ligt {}. Het loopt van x = {} mm tot \
             x = {} mm langs de liggerlijn.",
            geval_tekst(zone.zone.case),
            nl(zone.zone.x_start_mm, 0),
            nl(zone.zone.x_end_mm, 0)
        ),
    ];
    if flange.b_i_mm.is_empty() {
        notes.push(
            "Er zijn geen uitkragende flensdelen opgegeven; b_eff is dan gelijk aan b_w."
                .to_string(),
        );
    } else {
        notes.push(format!(
            "b_i is het uitkragende flensdeel aan één zijde van het lijf (figuur 5.3): de halve \
             vrije afstand tot het naastliggende lijf, of bij een randligger het werkelijke \
             overstek. De totale beschikbare breedte is b = b_w + Σb_i = {} mm.",
            nl(flange.b_mm(), 0)
        ));
    }
    // De keuzes die de rekengang zelf heeft gemeld reizen woordelijk mee. Ze
    // hier herformuleren zou een tweede versie van dezelfde mededeling maken.
    notes.extend(verdeling.notes.iter().cloned());

    stap(
        "beff_liggerlijn",
        "Liggerlijn en het geval uit figuur 5.2",
        "",
        "NEN-EN 1992-1-1, 5.3.2.1(2), figuur 5.2",
        String::new(),
        String::new(),
        variables,
        None,
        "",
        notes,
    )
}

// ───────────────────────────────────────────────────────────────────────────
// 2. l₀
// ───────────────────────────────────────────────────────────────────────────

/// De twee overspanningen (0-gebaseerd) waar een steunpunt- of
/// uitkraginggebied op ligt.
///
/// Het gebied strekt zich over de grens tussen twee overspanningen uit; die
/// grens is de enige overspanningsovergang die BINNEN het x-bereik van het
/// gebied valt. Dit is dus een opzoeking in de lijn die de aanroeper meegaf,
/// geen tweede afleiding van de gebiedsgrenzen.
fn steunpunt_overspanningen(line: &BeamLine, zone: &L0Zone) -> Option<(usize, usize)> {
    let eps = X_TOL * line.total_length_mm().max(1.0);
    let mut x = 0.0;
    for i in 0..line.spans_mm.len().saturating_sub(1) {
        x += line.spans_mm[i];
        if x > zone.x_start_mm + eps && x < zone.x_end_mm - eps {
            return Some((i, i + 1));
        }
    }
    None
}

/// Stap 2: l₀ uit figuur 5.2, symbolisch en met de overspanningen ingevuld.
///
/// De ingevulde regel eindigt VÓÓR de uitkomst; het rapport zet die er zelf
/// achter uit `value` en `unit`. Dezelfde afspraak als in
/// [`crate::deelstappen`], zodat de getallen van staal, beton en b_eff in
/// hetzelfde rapport op dezelfde manier worden afgerond.
fn l0_stap(line: &BeamLine, zone: &BeffZone) -> Deelstap {
    let z = &zone.zone;
    let l0 = z.l0_mm;
    // De overspanningsnummers zoals figuur 5.2 ze schrijft: 1-gebaseerd.
    let veld = z.span_index.map(|i| i as usize + 1);
    let steun = steunpunt_overspanningen(line, z).map(|(a, b)| (a + 1, b + 1));

    let (formule, ingevuld) = match z.case {
        L0Case::EndSpan => {
            let i = veld.unwrap_or(1);
            let l = line.spans_mm[i - 1];
            (
                format!(r"l_0 = 0{{,}}85 \, l_{{{i}}}"),
                format!(r"l_0 = 0{{,}}85 \cdot {}", lx(l, 1)),
            )
        }
        L0Case::InteriorSpan => {
            let i = veld.unwrap_or(1);
            let l = line.spans_mm[i - 1];
            (
                format!(r"l_0 = 0{{,}}7 \, l_{{{i}}}"),
                format!(r"l_0 = 0{{,}}7 \cdot {}", lx(l, 1)),
            )
        }
        L0Case::SingleSpan => {
            let i = veld.unwrap_or(1);
            (
                format!(r"l_0 = l_{{{i}}}"),
                // Geen tussenstap: de momentnulpunten liggen in de steunpunten
                // zelf, dus l_0 IS de overspanning. Het rapport zet de waarde
                // erachter.
                format!(r"l_0 = l_{{{i}}}"),
            )
        }
        L0Case::InteriorSupport => {
            let (a, b) = steun.unwrap_or((1, 2));
            (
                format!(r"l_0 = 0{{,}}15 \,\left( l_{{{a}}} + l_{{{b}}} \right)"),
                format!(
                    r"l_0 = 0{{,}}15 \cdot \left( {} + {} \right)",
                    lx(line.spans_mm[a - 1], 1),
                    lx(line.spans_mm[b - 1], 1)
                ),
            )
        }
        L0Case::RestrainedEnd => {
            let i = veld.unwrap_or(1);
            let l = line.spans_mm[i - 1];
            (
                format!(r"l_0 = 0{{,}}15 \, l_{{{i}}}"),
                format!(r"l_0 = 0{{,}}15 \cdot {}", lx(l, 1)),
            )
        }
        L0Case::Cantilever => {
            let (a, b) = steun.unwrap_or((1, 2));
            // Welke van de twee is de uitkraging? Die kan alleen de eerste of
            // de laatste overspanning zijn, en dan hoort het bijbehorende
            // uiteinde vrij te zijn.
            let links_uitkraging = a == 1 && line.start == LineEnd::Free;
            if links_uitkraging {
                (
                    format!(r"l_0 = l_{{{a}}} + 0{{,}}15 \, l_{{{b}}}"),
                    format!(
                        r"l_0 = {} + 0{{,}}15 \cdot {}",
                        lx(line.spans_mm[a - 1], 1),
                        lx(line.spans_mm[b - 1], 1)
                    ),
                )
            } else {
                (
                    format!(r"l_0 = 0{{,}}15 \, l_{{{a}}} + l_{{{b}}}"),
                    format!(
                        r"l_0 = 0{{,}}15 \cdot {} + {}",
                        lx(line.spans_mm[a - 1], 1),
                        lx(line.spans_mm[b - 1], 1)
                    ),
                )
            }
        }
    };

    let mut notes = vec![
        "5.3.2.1(2): de meewerkende flensbreedte behoort te zijn gebaseerd op de afstand l₀ \
         tussen de momentnulpunten, die uit figuur 5.2 mag zijn verkregen."
            .to_string(),
        format!(
            "Het gebied is even lang als zijn eigen l₀ — dat is wat figuur 5.2 tekent — dus van \
             x = {} mm tot x = {} mm.",
            nl(z.x_start_mm, 0),
            nl(z.x_end_mm, 0)
        ),
    ];
    if z.case == L0Case::SingleSpan {
        notes.push(
            "Dit geval staat niet als zodanig in figuur 5.2, maar volgt rechtstreeks uit \
             5.3.2.1(2): bij twee vrij opgelegde buitensteunpunten liggen de momentnulpunten in \
             de steunpunten zelf, dus l₀ = l."
                .to_string(),
        );
    }
    if z.case == L0Case::RestrainedEnd {
        notes.push(
            "Figuur 5.2 tekent alleen vrij opgelegde buitensteunpunten. Een momentvast \
             buitenuiteinde is hier gelezen als een tussensteunpunt met één aangrenzende \
             overspanning; dat levert een kleinere l₀ en dus een kleinere b_eff, en dat is de \
             veilige kant."
                .to_string(),
        );
    }

    stap(
        "beff_l0",
        "Afstand tussen de momentnulpunten",
        "l_0",
        z.case.source(),
        formule,
        ingevuld,
        Vec::new(),
        Some(l0),
        "mm",
        notes,
    )
}

// ───────────────────────────────────────────────────────────────────────────
// 3. b_eff,i per uitkragend flensdeel — (5.7a) en (5.7b)
// ───────────────────────────────────────────────────────────────────────────

/// Stap 3..n: één uitkragend flensdeel, met de drie grenzen naast elkaar en de
/// grens die won.
fn flensdeel_stap(index: usize, deel: &crate::beff::BeffPart, l0_mm: f64) -> Deelstap {
    let nr = index + 1;
    // LET OP: dit zijn RAUWE strings, dus een backslash aan het regeleinde is
    // géén regelvoortzetting — hij zou letterlijk in de LaTeX belanden. De
    // uitdrukkingen staan daarom op één regel, hoe lang ook.
    let formule = format!(
        r"b_{{eff,{nr}}} = \min\!\left( 0{{,}}2 \, b_{{{nr}}} + 0{{,}}1 \, l_0 \;;\; 0{{,}}2 \, l_0 \;;\; b_{{{nr}}} \right)"
    );
    // De ingevulde regel eindigt vóór de uitkomst; het rapport zet die er zelf
    // achter. De drie kandidaten staan er wél in: eerst als uitdrukking, dan
    // als getal, zodat te zien is welke won.
    let ingevuld = format!(
        r"b_{{eff,{nr}}} = \min\!\left( 0{{,}}2 \cdot {b_i} + 0{{,}}1 \cdot {l0} \;;\; 0{{,}}2 \cdot {l0} \;;\; {b_i} \right) = \min\!\left( {f} \;;\; {c} \;;\; {b_i} \right)",
        b_i = lx(deel.b_i_mm, 1),
        l0 = lx(l0_mm, 1),
        f = lx(deel.formula_mm, 1),
        c = lx(deel.cap_l0_mm, 1),
    );

    let winnaar = match deel.governing {
        BeffBound::Formula => format!(
            "Maatgevend is (5.7a), eerste lid: 0,2·b{nr} + 0,1·l₀ = {} mm. Dat is kleiner dan de \
             bovengrens 0,2·l₀ = {} mm van (5.7a) en dan het flensdeel zelf b{nr} = {} mm van \
             (5.7b).",
            nl(deel.formula_mm, 1),
            nl(deel.cap_l0_mm, 1),
            nl(deel.b_i_mm, 1)
        ),
        BeffBound::CapL0 => format!(
            "Maatgevend is de bovengrens van (5.7a), tweede lid: 0,2·l₀ = {} mm. De eerste term \
             0,2·b{nr} + 0,1·l₀ zou {} mm geven en ligt daarboven. Dat is het beeld bij een korte \
             l₀ — boven een steunpunt — waar maar een smalle strook flens meewerkt.",
            nl(deel.cap_l0_mm, 1),
            nl(deel.formula_mm, 1)
        ),
        BeffBound::CapBi => format!(
            "Maatgevend is (5.7b): b_eff,{nr} ≤ b{nr} = {} mm. De flens is er eenvoudigweg niet \
             breder dan dat; (5.7a) zou {} mm geven.",
            nl(deel.b_i_mm, 1),
            nl(deel.formula_mm.min(deel.cap_l0_mm), 1)
        ),
    };

    stap(
        &format!("beff_deel_{nr}"),
        &format!("Meewerkend flensdeel b_eff,{nr}"),
        &format!("b_{{eff,{nr}}}"),
        "NEN-EN 1992-1-1, 5.3.2.1(3), (5.7a) en (5.7b)",
        formule,
        ingevuld,
        vec![nv(&format!("b_{{{nr}}}"), deel.b_i_mm, "mm"), nv("l_0", l0_mm, "mm")],
        Some(deel.b_eff_i_mm),
        "mm",
        vec![winnaar],
    )
}

// ───────────────────────────────────────────────────────────────────────────
// 4. b_eff — (5.7)
// ───────────────────────────────────────────────────────────────────────────

/// Stap n+1: Σ b_eff,i + b_w, begrensd op de werkelijke flensbreedte b.
fn b_eff_stap(flange: &FlangeGeometry, zone: &BeffZone) -> Deelstap {
    let som: f64 = zone.parts.iter().map(|p| p.b_eff_i_mm).sum();
    let ongelimiteerd = som + flange.b_w_mm;

    let termen = if zone.parts.is_empty() {
        lx(flange.b_w_mm, 1)
    } else {
        let mut t: Vec<String> = zone.parts.iter().map(|p| lx(p.b_eff_i_mm, 1)).collect();
        t.push(lx(flange.b_w_mm, 1));
        t.join(" + ")
    };
    // Deze regel sluit ZELF af met "b_eff = …", omdat de begrenzing op b er
    // tussen staat: zonder die afsluiting zou het rapport achter "… ≤ b = 4300"
    // nog eens de uitkomst zetten en dan leest de regel als een keten van
    // gelijkheden die niet klopt.
    let ingevuld = format!(
        r"b_{{eff}} = {termen} = {tot} \le b = {b} \quad \Rightarrow \quad b_{{eff}} = {uit} \;\mathrm{{mm}}",
        tot = lx(ongelimiteerd, 1),
        b = lx(zone.b_mm, 1),
        uit = lx(zone.b_eff_mm, 1),
    );

    let mut notes = vec![format!(
        "De beschikbare breedte is b = b_w + Σb_i = {} mm (figuur 5.3); dat is de flensbreedte \
         die is ingevoerd.",
        nl(zone.b_mm, 0)
    )];
    if zone.limited_by_b {
        notes.push(format!(
            "De bovengrens b van (5.7) heeft INGEGREPEN: Σb_eff,i + b_w = {} mm is groter dan \
             b = {} mm, dus b_eff is op b afgekapt.",
            nl(ongelimiteerd, 1),
            nl(zone.b_mm, 1)
        ));
    } else {
        notes.push(
            "De bovengrens b van (5.7) grijpt niet in, en kan dat met (5.7b) toegepast ook niet: \
             elke b_eff,i is al ten hoogste b_i, en b = b_w + Σb_i. De grens is toch uitgerekend, \
             zodat die redenering na te gaan is in plaats van als aanname te blijven."
                .to_string(),
        );
    }

    stap(
        "beff_totaal",
        "Meewerkende flensbreedte",
        "b_{eff}",
        "NEN-EN 1992-1-1, 5.3.2.1(3), (5.7)",
        r"b_{eff} = \sum_i b_{eff,i} + b_w \le b".to_string(),
        ingevuld,
        vec![nv("b_w", flange.b_w_mm, "mm"), nv("b", zone.b_mm, "mm")],
        Some(zone.b_eff_mm),
        "mm",
        notes,
    )
}

// ───────────────────────────────────────────────────────────────────────────
// 5. De geldigheidsvoorwaarden — OPMERKING bij figuur 5.2
// ───────────────────────────────────────────────────────────────────────────

/// Stap n+2: de twee voorwaarden uit de OPMERKING bij figuur 5.2, met de
/// getallen erbij.
///
/// Ze zijn hier per definitie gehaald — `beff_distribution` weigert anders — maar
/// "voldaan" zonder getallen is niet na te vertellen, en een lezer moet kunnen
/// zien HOE ruim of hoe krap de liggerlijn binnen de voorwaarden valt.
fn geldigheid_stap(line: &BeamLine) -> Deelstap {
    let n = line.spans_mm.len();
    let mut notes = Vec::new();

    // Voorwaarde 1: de uitkraging kleiner dan de helft van de aangrenzende
    // overspanning.
    let mut uitkragingen = Vec::new();
    if line.start == LineEnd::Free && n >= 2 {
        uitkragingen.push((1usize, line.spans_mm[0], 2usize, line.spans_mm[1]));
    }
    if line.end == LineEnd::Free && n >= 2 {
        uitkragingen.push((n, line.spans_mm[n - 1], n - 1, line.spans_mm[n - 2]));
    }
    if uitkragingen.is_empty() {
        notes.push(
            "Voorwaarde 1 — de lengte van de uitkraging behoort kleiner te zijn dan de helft van \
             de aangrenzende overspanning. Deze liggerlijn heeft geen uitkraging, dus de \
             voorwaarde is niet van toepassing."
                .to_string(),
        );
    } else {
        for (i, uit, j, naast) in uitkragingen {
            notes.push(format!(
                "Voorwaarde 1 — uitkraging l{i} = {} mm tegenover de helft van de aangrenzende \
                 overspanning l{j}: ½ · {} = {} mm. {} — voldaan.",
                nl(uit, 0),
                nl(naast, 0),
                nl(naast * CANTILEVER_MAX_RATIO, 0),
                if uit < naast * CANTILEVER_MAX_RATIO {
                    format!("{} < {}", nl(uit, 0), nl(naast * CANTILEVER_MAX_RATIO, 0))
                } else {
                    format!(
                        "{} is gelijk aan {}",
                        nl(uit, 0),
                        nl(naast * CANTILEVER_MAX_RATIO, 0)
                    )
                }
            ));
        }
    }

    // Voorwaarde 2: de verhouding van AANGRENZENDE OVERSPANNINGEN tussen 2/3 en
    // 1,5. Een uitkraging telt daar niet in mee — daarvoor geldt voorwaarde 1.
    let is_uitkraging = |i: usize| {
        (i == 0 && line.start == LineEnd::Free) || (i + 1 == n && line.end == LineEnd::Free)
    };
    let mut paren = Vec::new();
    for i in 0..n.saturating_sub(1) {
        if is_uitkraging(i) || is_uitkraging(i + 1) {
            continue;
        }
        paren.push((i + 1, line.spans_mm[i], i + 2, line.spans_mm[i + 1]));
    }
    if paren.is_empty() {
        notes.push(format!(
            "Voorwaarde 2 — de verhouding van aangrenzende overspanningen behoort te liggen \
             tussen {} en {}. Deze liggerlijn heeft geen twee aangrenzende overspanningen om te \
             vergelijken, dus de voorwaarde is niet van toepassing.",
            nl(SPAN_RATIO_MIN, 3),
            nl(SPAN_RATIO_MAX, 1)
        ));
    } else {
        for (a, la, b, lb) in paren {
            notes.push(format!(
                "Voorwaarde 2 — l{a}/l{b} = {} / {} = {}, ligt tussen {} en {} — voldaan.",
                nl(la, 0),
                nl(lb, 0),
                nl(la / lb, 3),
                nl(SPAN_RATIO_MIN, 3),
                nl(SPAN_RATIO_MAX, 1)
            ));
        }
    }

    notes.push(
        "Beide voorwaarden zijn hard: haalt de liggerlijn er één niet, dan geldt l₀ uit figuur \
         5.2 niet en levert de rekenkern een fout met de reden in plaats van een b_eff."
            .to_string(),
    );

    stap(
        "beff_geldigheid",
        "Geldigheidsvoorwaarden van figuur 5.2",
        "",
        "NEN-EN 1992-1-1, OPMERKING bij figuur 5.2",
        String::new(),
        String::new(),
        Vec::new(),
        None,
        "",
        notes,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beff::beff_distribution;

    fn t_ligger() -> FlangeGeometry {
        FlangeGeometry { b_w_mm: 300.0, b_i_mm: vec![2000.0, 2000.0] }
    }

    /// Het portaal uit de opdracht: één overspanning van 12 m tussen twee
    /// kolommen, dus twee momentvaste buitenuiteinden.
    fn portaal() -> BeamLine {
        BeamLine {
            spans_mm: vec![12000.0],
            start: LineEnd::Restrained,
            end: LineEnd::Restrained,
        }
    }

    /// Handberekening, uit figuur 5.2 en (5.7a):
    ///   l0      = 0,7 · 12000                        = 8400 mm
    ///   b_i     = (4300 − 300) / 2                   = 2000 mm
    ///   b_eff,i = min(0,2·2000 + 0,1·8400 = 1240 ;
    ///                 0,2·8400 = 1680 ; 2000)        = 1240 mm
    ///   b_eff   = 2 · 1240 + 300                     = 2780 mm
    #[test]
    fn portaalgeval_schrijft_de_handberekening_op() {
        let lijn = portaal();
        let flens = t_ligger();
        let v = beff_distribution(&lijn, &flens).unwrap();
        // Het staafmidden ligt op x = 6000 mm, in het binnenveldgebied.
        let idx = v
            .zones
            .iter()
            .position(|z| z.zone.case == L0Case::InteriorSpan)
            .expect("binnenveldgebied");
        assert!((v.zones[idx].zone.l0_mm - 8400.0).abs() < 1e-9);
        assert!((v.zones[idx].b_eff_mm - 2780.0).abs() < 1e-9);

        let keten = beff_deelstappen(&lijn, &flens, &v, idx);
        let ids: Vec<&str> = keten.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![
                "beff_liggerlijn",
                "beff_l0",
                "beff_deel_1",
                "beff_deel_2",
                "beff_totaal",
                "beff_geldigheid"
            ]
        );

        let l0 = &keten[1];
        assert_eq!(l0.value, Some(8400.0));
        assert_eq!(l0.unit, "mm");
        assert!(l0.formula_latex.contains(r"0{,}7"), "{}", l0.formula_latex);
        assert_eq!(l0.ingevuld_latex, r"l_0 = 0{,}7 \cdot 12000");

        let deel = &keten[2];
        assert_eq!(deel.value, Some(1240.0));
        // De drie kandidaten staan naast elkaar in de ingevulde regel, eerst
        // als uitdrukking en dan als getal.
        for verwacht in ["2000", "8400", "1240", "1680"] {
            assert!(
                deel.ingevuld_latex.contains(verwacht),
                "{verwacht} ontbreekt in {}",
                deel.ingevuld_latex
            );
        }
        assert!(deel.notes[0].contains("(5.7a), eerste lid"), "{}", deel.notes[0]);

        let totaal = &keten[4];
        assert_eq!(totaal.value, Some(2780.0));
        assert!(
            totaal.ingevuld_latex.contains("1240 + 1240 + 300"),
            "{}",
            totaal.ingevuld_latex
        );
        // De begrenzing op de INGEVOERDE flensbreedte staat erbij: dat is het
        // getal dat de gebruiker intikte, en het verschil met 2780 is precies
        // wat verantwoord moet worden.
        assert!(totaal.ingevuld_latex.contains("4300"), "{}", totaal.ingevuld_latex);
        // Deze regel sluit zichzelf af, dus het rapport plakt er niets achter.
        assert!(
            totaal.ingevuld_latex.contains(r"b_{eff} = 2780"),
            "{}",
            totaal.ingevuld_latex
        );
    }

    /// Elke stap draagt een vindplaats. Zonder deze test kan er een stap
    /// binnensluipen die een formule toont zonder te zeggen waar hij staat.
    #[test]
    fn elke_stap_heeft_een_vindplaats_uit_de_norm() {
        let lijn = BeamLine {
            spans_mm: vec![6000.0, 5000.0, 2000.0],
            start: LineEnd::Support,
            end: LineEnd::Free,
        };
        let flens = FlangeGeometry { b_w_mm: 300.0, b_i_mm: vec![1000.0, 1000.0] };
        let v = beff_distribution(&lijn, &flens).unwrap();
        for idx in 0..v.zones.len() {
            for d in beff_deelstappen(&lijn, &flens, &v, idx) {
                assert!(
                    d.article.starts_with("NEN-EN 1992-1-1"),
                    "stap {} heeft vindplaats {:?}",
                    d.id,
                    d.article
                );
                // Een stap met een formule heeft ook een ingevulde regel, en
                // andersom — anders staat er een halve afleiding.
                assert_eq!(
                    d.formula_latex.is_empty(),
                    d.ingevuld_latex.is_empty(),
                    "stap {} heeft een formule zonder ingevulde regel of andersom",
                    d.id
                );
                assert!(!d.notes.is_empty(), "stap {} heeft geen kanttekening", d.id);
                // Een rauwe string met een backslash aan het regeleinde levert
                // een letterlijke `\` plus een regeleinde op — in LaTeX een
                // spatie, maar in het rapport een tijdbom. Geen enkele regel
                // mag een regeleinde bevatten.
                for regel in [&d.formula_latex, &d.ingevuld_latex] {
                    assert!(
                        !regel.contains('\n'),
                        "stap {} draagt een regeleinde in zijn LaTeX: {regel:?}",
                        d.id
                    );
                }
                // De ingevulde regel eindigt vóór de uitkomst, tenzij hij zelf
                // met "<symbool> = …" afsluit — de afspraak die
                // `deelstapRegels` in de frontend aanhoudt. Sluit hij noch af
                // noch eindigt hij vóór de uitkomst, dan zet het rapport het
                // eindgetal er een tweede keer achter.
                if let Some(waarde) = d.value {
                    let staart = format!("{}", waarde.round() as i64);
                    let dubbel = d.ingevuld_latex.trim_end().ends_with(&staart)
                        && !d.ingevuld_latex[1..].contains(&format!("{} =", d.symbol));
                    assert!(
                        !dubbel,
                        "stap {} eindigt op zijn eigen uitkomst zonder zichzelf af te \
                         sluiten; het rapport zet hem dan twee keer neer: {}",
                        d.id, d.ingevuld_latex
                    );
                }
            }
        }
    }

    /// De vier gevallen van figuur 5.2 leveren vier verschillende l₀-formules,
    /// elk met de juiste overspanningsnummers.
    #[test]
    fn de_vier_gevallen_van_figuur_5_2_krijgen_hun_eigen_formule() {
        let lijn = BeamLine {
            spans_mm: vec![6000.0, 5000.0, 2000.0],
            start: LineEnd::Support,
            end: LineEnd::Free,
        };
        let flens = FlangeGeometry { b_w_mm: 300.0, b_i_mm: vec![1000.0, 1000.0] };
        let v = beff_distribution(&lijn, &flens).unwrap();
        let formule = |i: usize| beff_deelstappen(&lijn, &flens, &v, i)[1].formula_latex.clone();

        assert_eq!(v.zones[0].zone.case, L0Case::EndSpan);
        assert_eq!(formule(0), r"l_0 = 0{,}85 \, l_{1}");
        assert_eq!(v.zones[1].zone.case, L0Case::InteriorSupport);
        assert_eq!(formule(1), r"l_0 = 0{,}15 \,\left( l_{1} + l_{2} \right)");
        assert_eq!(v.zones[2].zone.case, L0Case::InteriorSpan);
        assert_eq!(formule(2), r"l_0 = 0{,}7 \, l_{2}");
        assert_eq!(v.zones[3].zone.case, L0Case::Cantilever);
        assert_eq!(formule(3), r"l_0 = 0{,}15 \, l_{2} + l_{3}");
    }

    /// Boven een steunpunt wint de bovengrens 0,2·l₀ van (5.7a); dat moet ook
    /// zo in de tekst komen te staan en niet als "eerste lid".
    #[test]
    fn boven_het_steunpunt_meldt_de_afleiding_de_bovengrens() {
        let lijn = BeamLine {
            spans_mm: vec![6000.0, 5000.0],
            start: LineEnd::Support,
            end: LineEnd::Support,
        };
        let flens = FlangeGeometry { b_w_mm: 300.0, b_i_mm: vec![1000.0, 1000.0] };
        let v = beff_distribution(&lijn, &flens).unwrap();
        let idx = v
            .zones
            .iter()
            .position(|z| z.zone.case == L0Case::InteriorSupport)
            .unwrap();
        assert_eq!(v.zones[idx].parts[0].governing, BeffBound::CapL0);
        let keten = beff_deelstappen(&lijn, &flens, &v, idx);
        assert!(
            keten[2].notes[0].contains("tweede lid"),
            "{}",
            keten[2].notes[0]
        );
    }

    /// De geldigheidsvoorwaarden staan er mét getallen, ook wanneer ze niet van
    /// toepassing zijn.
    #[test]
    fn de_geldigheidsvoorwaarden_staan_er_met_getallen() {
        let lijn = BeamLine {
            spans_mm: vec![6000.0, 5000.0, 2000.0],
            start: LineEnd::Support,
            end: LineEnd::Free,
        };
        let flens = FlangeGeometry { b_w_mm: 300.0, b_i_mm: vec![1000.0, 1000.0] };
        let v = beff_distribution(&lijn, &flens).unwrap();
        let keten = beff_deelstappen(&lijn, &flens, &v, 0);
        let g = keten.last().unwrap();
        assert_eq!(g.id, "beff_geldigheid");
        let tekst = g.notes.join(" ");
        // Uitkraging 2000 tegen de helft van 5000 = 2500.
        assert!(tekst.contains("2500"), "{tekst}");
        // Verhouding 6000/5000 = 1,200.
        assert!(tekst.contains("1,200"), "{tekst}");

        // Bij het portaal is geen van beide voorwaarden van toepassing, en dat
        // moet er staan in plaats van dat de stap leeg blijft.
        let p = portaal();
        let vp = beff_distribution(&p, &t_ligger()).unwrap();
        let gp = beff_deelstappen(&p, &t_ligger(), &vp, 1);
        let tp = gp.last().unwrap().notes.join(" ");
        assert!(tp.contains("geen uitkraging"), "{tp}");
        assert!(tp.contains("geen twee aangrenzende overspanningen"), "{tp}");
    }

    /// De meldingen van de rekengang reizen woordelijk mee; een tweede versie
    /// van dezelfde mededeling mag niet ontstaan.
    #[test]
    fn de_meldingen_van_de_verdeling_staan_woordelijk_in_de_keten() {
        let lijn = portaal();
        let flens = t_ligger();
        let v = beff_distribution(&lijn, &flens).unwrap();
        let keten = beff_deelstappen(&lijn, &flens, &v, 1);
        for melding in &v.notes {
            assert!(
                keten[0].notes.iter().any(|n| n == melding),
                "melding ontbreekt woordelijk: {melding}"
            );
        }
    }

    #[test]
    fn een_gebied_dat_niet_bestaat_levert_een_lege_keten() {
        let lijn = portaal();
        let flens = t_ligger();
        let v = beff_distribution(&lijn, &flens).unwrap();
        assert!(beff_deelstappen(&lijn, &flens, &v, 99).is_empty());
    }
}
