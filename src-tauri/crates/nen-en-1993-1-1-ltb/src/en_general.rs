//! Algemene EN 1993-1-1-formule voor het kritieke kipmoment.
//!
//! Alternatief voor de Nederlandse NB-methode in [`crate::nb_annex`]. De
//! NB-methode is leidend voor toetsingen volgens NEN-EN 1993-1-1/NB:2016;
//! deze formule is bedoeld voor gevallen die buiten de NB-figuren vallen.
//!
//! ## Waarom er voor monosymmetrie een tweede formule nodig is
//!
//! NEN-EN 1993-1-1+A1:2014 geeft **zelf geen enkele uitdrukking** voor M_cr.
//! Art. 6.3.2.2(2) stelt alleen eisen: M_cr is gebaseerd op de brutodoorsnede
//! en houdt rekening met de belastingsvoorwaarden, de werkelijke
//! momentenverdeling en de zijdelingse steunen. De rekenregels komen uit de
//! Nederlandse nationale bijlage, die ze in de normatieve bijlage NB.NB zet —
//! en die bijlage begrenst zichzelf in NB.NB.1(1) tot **dubbelsymmetrische**
//! I-vormige doorsneden en tot buisprofielen met h/b > 3.
//!
//! Een monosymmetrische doorsnede (T-vorm, gelaste I met ongelijke flenzen,
//! SFB-ligger) valt daar buiten. De NB kan het rekentechnisch ook niet aan: de
//! symbolenlijst bij NB.NB.4.1(1) noemt E, G, I_z, I_t, L_g, k_red en C, en
//! NB.NB.4.3 kent alleen C₁ en C₂. De letters z_j en C₃ komen in de hele
//! bijlage niet voor. Er is dus geen NB-route voor monosymmetrie, en de
//! eerlijke uitkomst is: overstappen op de algemene elastische formule en dat
//! in de afleiding zeggen. Die voldoet aan art. 6.3.2.2(2), maar zij is
//! **géén Nederlandse NB-waarde**.
//!
//! ## Waar de algemene vorm staat
//!
//! Op de doorsneden die deze crate bedient staat hij in NEN-EN 1999-1-1
//! bijlage I (informatief), art. I.1.2(1), formules (I.2) en (I.3):
//!
//! ```text
//! M_cr   = μ_cr · π·√(E·I_z · G·I_t) / L
//! μ_cr   = C₁/k_z · [ √(1 + κ_wt² + (C₂·ζ_g − C₃·ζ_j)²) − (C₂·ζ_g − C₃·ζ_j) ]
//! ```
//!
//! met ζ_g = (π·z_g/(k_z·L))·√(E·I_z/(G·I_t)) en
//! κ_wt = (π/(k_w·L))·√(E·I_w/(G·I_t)). Uitgeschreven naar de dimensionele
//! vorm die [`m_cr_monosymmetrisch`] rekent — met k_z = k_w = 1, want deze
//! crate rekent op vorkopleggingen:
//!
//! ```text
//! M_cr = C₁ · π²·E·I_z / L²
//!        · { √[ I_w/I_z + L²·G·I_t/(π²·E·I_z) + (C₂·z_g − C₃·z_j)² ]
//!            − (C₂·z_g − C₃·z_j) }
//! ```
//!
//! Bijlage I van EN 1999-1-1 gaat over precies dit geval: de kop van I.1.2
//! luidt "Algemene formule voor liggers met uniforme dwarsdoorsneden,
//! symmetrisch om de zwakke of de sterke as", en lid (1) behandelt de ligger
//! die symmetrisch is om de **zwakke** as bij buiging om de sterke as. Dat is
//! de monosymmetrische I / T.
//!
//! ## Dat is de ALUMINIUM-Eurocode, en dat moet de lezer weten
//!
//! NEN-EN 1999-1-1 gaat over aluminium constructies. Dat deze staaltoetsing
//! haar bijlage I aanhaalt, is geen vergissing en ook geen verstopte aanname:
//! het is een keuze die verantwoord moet worden, en zij staat daarom ook in de
//! afleiding die de gebruiker leest.
//!
//! De verantwoording is dat (I.2)/(I.3) geen materiaalregel is. Zij is de
//! oplossing van het elastische kipprobleem van een prismatische staaf: er
//! komen alleen E, G en doorsnedegrootheden in voor, geen vloeigrens, geen
//! kipkromme, geen materiaalfactor. Datzelfde stelsel stond vroeger in bijlage
//! F van ENV 1993-1-1; EN 1993-1-1 heeft die bijlage laten vervallen zonder er
//! een uitdrukking voor terug te geven — art. 6.3.2.2(2) stelt alleen eisen
//! waaraan M_cr moet voldoen. Van de vigerende Eurocodes is EN 1999-1-1 bijlage
//! I de enige die de algemene vorm mét z_j en C₃ nog voluit geeft.
//!
//! Nagegaan is of er een Nederlandse route bestaat die vóórgaat:
//!
//!  * **NEN-EN 1993-1-1 zelf** geeft geen M_cr — zie hierboven.
//!  * **De Nederlandse nationale bijlage** begrenst zich in NB.NB.1(1) tot
//!    dubbelsymmetrische I-vormige doorsneden en tot buisprofielen met
//!    h/b > 3, en haar symbolenlijst kent z_j en C₃ niet.
//!
//! Er gaat dus niets vóór. Wat mét het materiaal meekomt — E, G, de kipkromme,
//! γ_M1, de doorsnedeklasse — blijft onverkort uit de staalnorm komen; alleen
//! de elastische vorm van M_cr komt hiervandaan.

use std::f64::consts::PI;
use crate::nb_annex::{E_MPA, G_MPA};

/// Kritiek kipmoment voor een dubbelsymmetrisch profiel, belast op het
/// zwaartepunt, met vorkopleggingen:
///
/// M_cr = C₁ · π²·E·I_z / L_cr² · √( I_w/I_z + L_cr²·G·I_t / (π²·E·I_z) )
///
/// Dit is het bijzondere geval van [`m_cr_monosymmetrisch`] met z_g = 0 en
/// z_j = 0 — het equivalent van EN 1999-1-1 (I.8). Zie
/// `reduceert_exact_naar_de_dubbelsymmetrische_vorm` in
/// `tests/en_monosymmetrie.rs`, die dat bit-identiek vastlegt.
///
/// Resultaat in kNm.
pub fn m_cr_algemeen(c1: f64, l_cr_mm: f64, iz_mm4: f64, iw_mm6: f64, it_mm4: f64) -> f64 {
    if l_cr_mm <= 0.0 || iz_mm4 <= 0.0 { return 0.0; }
    let voorfactor = c1 * PI.powi(2) * E_MPA * iz_mm4 / l_cr_mm.powi(2);
    let onder_wortel = iw_mm6 / iz_mm4
        + l_cr_mm.powi(2) * G_MPA * it_mm4 / (PI.powi(2) * E_MPA * iz_mm4);
    voorfactor * onder_wortel.sqrt() * 1e-6
}

// ═══════════════════════════════════════════════════════════════════════════
//  Monosymmetrie: z_j, zijn teken, en de C₃ die ervoor staat
// ═══════════════════════════════════════════════════════════════════════════

// ── C₃ ───────────────────────────────────────────────────────────────────────
//
// C₃ komt niet voor in NEN-EN 1993-1-1 en niet in de Nederlandse nationale
// bijlage. Hij staat in NEN-EN 1999-1-1 tabel I.1 (eindmomentbelasting) en
// tabel I.2 (dwarsbelasting), en is daar geen constante. Beide tabellen
// splitsen de C₃-kolom naar de monosymmetrische dwarsdoorsnedefactor
//
//     ψ_f = (I_fc − I_ft) / (I_fc + I_ft),
//
// met I_fc het traagheidsmoment van de op DRUK belaste flens om de zwakke as.
// Binnen elke ψ_f-band varieert C₃ nog met de momentenlijn en met de
// kniklengtefactor k_z. De banden zijn:
//
//     tabel I.1:  ψ_f = −1  |  −0,9 ≤ ψ_f ≤ 0  |  ψ_f > 0
//     tabel I.2:  ψ_f = −1  |  −0,9 ≤ ψ_f ≤ 0,9  |  ψ_f = 1
//
// Deze berekening beweegt zich uitsluitend in ψ_f ≤ 0: [`z_j_rekenwaarde`]
// kapt af op z_j ≤ 0, en art. I.1.2(7) koppelt het teken van z_j aan dat van
// ψ_f. Voor ψ_f > 0 is z_j dus nul en valt het product C₃·z_j weg — welke C₃
// daar staat, kán de uitkomst niet raken.
//
// Dat is precies het deel van de tabel dat leesbaar is. In het exemplaar op
// schijf loopt de rechterkant van beide tabellen weg bij ongeveer x = 442 pt:
// de band ψ_f > 0 (I.1) respectievelijk ψ_f = 1 (I.2) is afgekapt, en de kop
// "Waarden van factoren" staat er als "Waarden van facto". De twee linker
// banden — samen heel ψ_f ≤ 0 — zijn wél volledig leesbaar.
//
// Een eerdere versie van deze module hield C₃ = 1,0 aan met als motivering dat
// de tabellen onleesbaar zouden zijn. Dat was ONWAAR én onveilig: M_cr is
// dalend in D = C₂·z_g − C₃·z_j en z_j is hier nooit positief, dus een te
// kleine C₃ geeft een te HOGE M_cr.

/// C₃ voor de band **ψ_f = −1**: de ongunstigste waarde die in die kolom van
/// tabel I.1 en I.2 voorkomt.
///
/// Geen aflezing van één regel, maar een **veilige bovengrens** over de hele
/// kolom. Aflezen kan hier niet: de tabellen zijn gesleuteld op de
/// momentenlijn ψ en op k_z, terwijl deze crate C₁ en C₂ uit de figuren
/// NB.NB.5/NB.NB.6 haalt en de eindcondities via L_kip verrekent. Er is geen
/// eenduidige regel die zegt welke tabelregel bij een gegeven (β, B*, L_kip)
/// hoort, en een regel verzinnen zou hetzelfde zijn als een normwaarde
/// verzinnen.
///
/// Dat de bovengrens juist hier valt, is geen toeval: ψ_f = −1 is de zuivere
/// T — de gedrukte flens ontbreekt (I_fc = 0) — en dat is precies de doorsnede
/// waarvoor deze route bestaat.
///
/// **De waarde is 2,00 en niet hoger.** De tabelregels lopen als
/// `k_z | C₁,₀ | C₁,₁ | C₃(ψ_f = −1) | C₃(−0,9 ≤ ψ_f ≤ 0) | …`, bijvoorbeeld
/// `0,7L  2,592  2,770  2,00  0,850`. Wie de vierde kolom mist leest 2,770 —
/// een C₁-waarde — als C₃. Dat is hier eerder gebeurd; 2,70 staat nergens in
/// de tabel. Over alle leesbare regels is 2,00 de grootste C₃ in deze band.
pub const C3_BAND_PSI_F_MIN_EEN: f64 = 2.00;

/// C₃ voor de band **−0,9 ≤ ψ_f ≤ 0**: idem de ongunstigste waarde in die
/// kolom.
///
/// Deze constante geldt ook voor ψ_f > 0, waar zij niets doet: daar is
/// z_j = 0 en dus C₃·z_j = 0.
///
/// De grootste waarde die in deze kolom leesbaar is, is 1,26 (regel
/// `0,7L  1,853  2,059  1,600  1,260`). De tekstlagen van de tabel lopen in
/// het exemplaar op schijf door elkaar, dus een regel kan aan het oog
/// ontsnappen; wie deze band scherper wil, heeft de gedrukte tabel nodig.
/// Zolang ψ_f nergens wordt geproduceerd is dit een dode tak — de aanroeper
/// geeft `None` en dan geldt de band hierboven.
pub const C3_BAND_PSI_F_NUL: f64 = 1.26;

/// De C₃ waarmee [`m_cr_monosymmetrisch`] rekent, gekozen op de ψ_f-band
/// waarin de doorsnede valt.
///
/// `None` betekent: de aanroeper kent ψ_f niet. Dan geldt de ongunstigste band
/// over heel ψ_f ≤ 0, dus [`C3_BAND_PSI_F_MIN_EEN`]. Dat is de normale gang van
/// zaken zolang de doorsnedemotor ψ_f niet levert — hij geeft z_j en het
/// schuifmiddelpunt, niet de opsplitsing naar I_fc en I_ft.
///
/// Waarom een te ruime C₃ hier weinig kwaad kan: C₃ komt alleen voor als het
/// product C₃·z_j. Een doorsnede die nauwelijks monosymmetrisch is, heeft een
/// kleine |z_j| en merkt dus weinig van de bovengrens; een doorsnede die er
/// veel van merkt, heeft een grote |z_j| en zit daarmee juist tegen ψ_f = −1
/// aan, waar 2,00 de ongunstigste waarde van de eigen band is. Het
/// overconservatisme begrenst zichzelf.
pub fn c3_bovengrens(psi_f: Option<f64>) -> f64 {
    match psi_f {
        Some(p) if p > -0.9 => C3_BAND_PSI_F_NUL,
        _ => C3_BAND_PSI_F_MIN_EEN,
    }
}

/// z_j met het teken dat de norm wil, uit z_j zoals de doorsnedemotor hem
/// meetkundig levert.
///
/// De motor rekent `z_j = z_s − 0,5·∬(y²+z²)·z dA / I_y` in het
/// beschrijvingsassenstelsel, met **z omhoog positief**. Dat is een vaste
/// doorsnede-eigenschap: een T met de flens boven houdt zijn positieve z_j,
/// hoe de ligger ook belast wordt.
///
/// NEN-EN 1999-1-1 art. I.1.2(7) meet z echter naar de **gedrukte** flens: de
/// positieve z is opwaarts gericht voor liggers onder neerwaartse belasting en
/// neerwaarts in het omgekeerde geval, en het teken van z_j is gelijk aan dat
/// van ψ_f = (I_fc − I_ft)/(I_fc + I_ft), met I_fc het traagheidsmoment van de
/// op **druk** belaste flens.
///
/// In de tekenafspraak van deze kern (`mechanics`) is M_y positief = trek in
/// de onderste vezel, dus:
///  * M_y > 0 (veldmoment) → **boven**flens gedrukt → teken ongewijzigd;
///  * M_y < 0 (steunmoment) → **onder**flens gedrukt → teken omgeklapt.
///
/// **Waarom dit een eigen, zichtbare stap is.** M_cr is dalend in
/// D = C₂·z_g − C₃·z_j, dus een positieve z_j verhóógt M_cr. Wie bij een
/// steunmoment de meetkundige (positieve) z_j laat staan waar de norm de
/// negatieve wil, krijgt een te HOGE M_cr — de onveilige kant. Voor de
/// T-startvorm scheelt dat een factor van orde 1,6, en de verkeerde kant op.
///
/// **Onbekend teken.** Is het maatgevende moment in dit kipveld numeriek nul,
/// dan is niet te zeggen welke flens gedrukt is. Dan wordt de **ongunstige**
/// tak genomen (−|z_j|), niet een aanname die toevallig gunstig uitpakt.
///
/// Deze functie kijkt naar **één doorsnede**. Een heel kipveld heeft er drie
/// bekende, en die kunnen van teken verschillen; daarvoor is
/// [`z_j_kipveld`] de ingang.
pub fn z_j_gedrukte_flens(z_j_geometrisch_mm: f64, m_y_maatgevend_knm: f64) -> f64 {
    if m_y_maatgevend_knm > 1e-9 {
        z_j_geometrisch_mm
    } else if m_y_maatgevend_knm < -1e-9 {
        -z_j_geometrisch_mm
    } else {
        -z_j_geometrisch_mm.abs()
    }
}

/// Welke flens er in een kipveld gedrukt is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GedrukteFlens {
    /// Overal in het veld is M_y ≥ 0: de bovenflens is gedrukt.
    Boven,
    /// Overal in het veld is M_y ≤ 0: de onderflens is gedrukt.
    Onder,
    /// Het veld wisselt van kromming: op het ene stuk is de bovenflens
    /// gedrukt, op het andere de onderflens.
    Beide,
    /// Alle bekende momenten zijn nul; er valt niets over te zeggen.
    Onbekend,
}

/// Bepaalt uit de drie bekende momenten van een kipveld welke flens er gedrukt
/// is: begin, midden, eind (kNm, mét teken, sagging positief).
///
/// De drempel is dezelfde 1e-9 kNm als in [`z_j_gedrukte_flens`].
pub fn gedrukte_flens_in_kipveld(momenten_knm: [f64; 3]) -> GedrukteFlens {
    let positief = momenten_knm.iter().any(|m| *m > 1e-9);
    let negatief = momenten_knm.iter().any(|m| *m < -1e-9);
    match (positief, negatief) {
        (true, true) => GedrukteFlens::Beide,
        (true, false) => GedrukteFlens::Boven,
        (false, true) => GedrukteFlens::Onder,
        (false, false) => GedrukteFlens::Onbekend,
    }
}

/// z_j met het teken dat bij een **heel kipveld** hoort, uit de meetkundige
/// z_j en de drie bekende momenten (begin, midden, eind).
///
/// ## Waarom niet gewoon het grootste moment
///
/// z_j hoort bij de gedrukte flens, en die kan binnen één kipveld wisselen.
/// Wie het teken van het moment met de grootste absolute waarde overneemt,
/// rekent het hele veld door alsof daar overal dezelfde flens gedrukt is. Dat
/// gaat mis, en het gaat naar de onveilige kant mis. Getallenvoorbeeld:
///
/// ```text
/// M_begin = +100 kNm   M_midden = 0   M_eind = −99 kNm
/// ```
///
/// Het grootste is +100, dus "bovenflens gedrukt", dus z_j > 0 voor een T met
/// de flens boven, dus [`z_j_rekenwaarde`] kapt af op nul en de
/// monosymmetriestraf verdwijnt helemaal. Maar over de laatste meters van dat
/// veld is de onderflens — bij een T de lijftip — wel degelijk gedrukt, en
/// juist dáár hoort de straf te staan.
///
/// Erger nog: het spiegelbeeld van dat veld,
///
/// ```text
/// M_begin = −100 kNm   M_midden = 0   M_eind = +99 kNm
/// ```
///
/// is fysiek hetzelfde geval en zou hetzelfde M_cr moeten geven. Met de
/// grootste-waarde-regel geeft het dat niet: daar wint −100, komt de straf er
/// wél op, en verschillen twee spiegelbeeldige belastinggevallen in uitkomst.
/// Dat kan niet.
///
/// ## De regel
///
/// Wisselt het veld van kromming, dan wordt de **ongunstige** tak genomen —
/// dezelfde keuze als bij een onbekend teken:
///
/// ```text
/// beide flenzen ergens gedrukt  →  z_j = −|z_j|
/// ```
///
/// Dat is veilig-zijdig en spiegelsymmetrisch: de regel kijkt alleen naar
/// welke tekens er vóórkomen, niet naar hun volgorde of onderlinge grootte,
/// dus het spiegelbeeld geeft per constructie dezelfde uitkomst.
///
/// Het is bewust **niet** verfijnd tot "de straf geldt alleen over het stuk
/// waar de kleine flens gedrukt is". Zo'n verfijning zou een kiplengte per
/// deelstuk vragen, en L_kip komt hier uit NB.NB.4.3, die het veld als geheel
/// neemt.
pub fn z_j_kipveld(z_j_geometrisch_mm: f64, momenten_knm: [f64; 3]) -> f64 {
    match gedrukte_flens_in_kipveld(momenten_knm) {
        GedrukteFlens::Boven => z_j_gedrukte_flens(z_j_geometrisch_mm, 1.0),
        GedrukteFlens::Onder => z_j_gedrukte_flens(z_j_geometrisch_mm, -1.0),
        // Eén regel voor beide: bij "beide" en bij "onbekend" is er geen
        // gedrukte flens aan te wijzen, en dan geldt de ongunstige tak. 0.0
        // stuurt `z_j_gedrukte_flens` precies daarheen.
        GedrukteFlens::Beide | GedrukteFlens::Onbekend => {
            z_j_gedrukte_flens(z_j_geometrisch_mm, 0.0)
        }
    }
}

/// z_j zoals hij werkelijk in [`m_cr_monosymmetrisch`] meerekent: **alleen de
/// ongunstige helft**.
///
/// M_cr is dalend in D = C₂·z_g − C₃·z_j. Een positieve z_j (de grote flens is
/// de gedrukte) verlaagt D en verhoogt dus M_cr; een negatieve z_j (de kleine
/// flens is de gedrukte) verhoogt D en verlaagt M_cr.
///
/// De **verhoging** wordt hier afgekapt, de **verlaging** niet:
///
/// ```text
/// z_j,reken = min(z_j,norm ; 0)
/// ```
///
/// Dat is een expliciete veilig-zijdige keuze, en zij hangt samen met
/// [`c3_bovengrens`]. C₃ is daar geen aflezing maar een bovengrens over een
/// hele tabelkolom. Een bovengrens werkt maar één kant op: in de ongunstige
/// tak (z_j < 0) vergroot een te ruime C₃ de term D en verlaagt hij M_cr, wat
/// veilig is; in de gunstige tak (z_j > 0) zou diezelfde te ruime C₃ D
/// verkleinen en M_cr **verhogen**, en dan werkt de bovengrens juist tegen de
/// veiligheid in. De gunstige tak wordt daarom niet gecrediteerd.
///
/// Bijkomend voordeel, en de reden dat dit twee keer klopt: door af te kappen
/// blijft de berekening binnen ψ_f ≤ 0, en dat is precies het deel van tabel
/// I.1 en I.2 dat in het beschikbare exemplaar volledig leesbaar is. De
/// afgekapte rechterband van de tabel wordt zo nooit gebruikt.
///
/// Prijs van de keuze: een doorsnede waarvan de grote flens werkelijk de
/// gedrukte is, krijgt geen stabiliteitswinst die de norm haar wel gunt. De
/// uitkomst kan daardoor nooit boven die met z_j = 0 uitkomen — precies de
/// waarde waarmee de app een symmetrische doorsnede vandaag al rekent.
///
/// Dezelfde houding staat al in [`crate::nb_annex::c2_gecorrigeerd`], die de
/// schaalfactor bij −1 afkapt omdat "doorschalen daar een stabiliserend effect
/// zou crediteren dat de bijlage niet toekent".
pub fn z_j_rekenwaarde(z_j_norm_mm: f64) -> f64 {
    z_j_norm_mm.min(0.0)
}

/// De combinatie D = C₂·z_g − C₃·z_j waarin het kritieke kipmoment **dalend**
/// is.
///
/// Bestaat als eigen functie zodat de afleiding in het rapport exact hetzelfde
/// getal toont als [`m_cr_monosymmetrisch`] invult — dezelfde uitdrukking, in
/// dezelfde volgorde, dus tot in de laatste bit gelijk. Een tweede som op een
/// andere plek kan afdrijven zonder dat een test dat ziet.
pub fn d_parameter(c2: f64, z_g_mm: f64, c3: f64, z_j_mm: f64) -> f64 {
    c2 * z_g_mm - c3 * z_j_mm
}

/// Kritiek kipmoment volgens de **algemene** elastische formule, mét het
/// aangrijpingspunt van de belasting (z_g) en de monosymmetrieparameter (z_j).
///
/// ```text
/// D    = C₂·z_g − C₃·z_j
/// M_cr = C₁ · π²·E·I_z / L_cr²
///        · { √[ I_w/I_z + L_cr²·G·I_t/(π²·E·I_z) + D² ] − D }  · 10⁻⁶
/// ```
///
/// Vorm: NEN-EN 1999-1-1 art. I.1.2(1), formules (I.2) en (I.3), uitgeschreven
/// met k_z = k_w = 1 (vorkopleggingen aan beide einden, geen welvingsklemming).
/// Zie de moduledocstring voor de herleiding.
///
/// **Tekenafspraken.**
///  * `z_g_mm` is de afstand van het **dwarskrachtencentrum** (schuifmiddelpunt)
///    tot het aangrijpingspunt van de belasting, positief naar boven —
///    destabiliserend voor een neerwaartse belasting (EN 1999-1-1 art.
///    I.1.2(8)). Let op: dat is een ander referentiepunt dan de `z_a` van
///    NB.NB.4.3, die vanaf het **zwaartepunt** meet. Voor een
///    dubbelsymmetrische doorsnede vallen die twee samen; voor een
///    monosymmetrische niet, en dan is de omrekening z_g = z_a − (z_s − z_c)
///    dragend.
///  * `z_j_mm` moet het teken van de gedrukte flens dragen én door
///    [`z_j_rekenwaarde`] zijn gehaald. Geef hier niet de rauwe meetkundige
///    z_j van de doorsnedemotor door.
///
/// **Reductie.** Met z_g = 0 en z_j = 0 is D = 0 en levert deze functie
/// bit-identiek hetzelfde als [`m_cr_algemeen`]; de bewerkingsvolgorde is
/// daarvoor gelijk gehouden.
///
/// Resultaat in kNm.
#[allow(clippy::too_many_arguments)]
pub fn m_cr_monosymmetrisch(
    c1: f64,
    c2: f64,
    c3: f64,
    l_cr_mm: f64,
    iz_mm4: f64,
    iw_mm6: f64,
    it_mm4: f64,
    z_g_mm: f64,
    z_j_mm: f64,
) -> f64 {
    if l_cr_mm <= 0.0 || iz_mm4 <= 0.0 { return 0.0; }
    let d = d_parameter(c2, z_g_mm, c3, z_j_mm);
    let voorfactor = c1 * PI.powi(2) * E_MPA * iz_mm4 / l_cr_mm.powi(2);
    let onder_wortel = iw_mm6 / iz_mm4
        + l_cr_mm.powi(2) * G_MPA * it_mm4 / (PI.powi(2) * E_MPA * iz_mm4)
        + d.powi(2);
    voorfactor * (onder_wortel.sqrt() - d) * 1e-6
}

/// Keuze van de M_cr-methode.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum McrMethode {
    /// NEN-EN 1993-1-1/NB:2016 nl — NB.NB.2 e.v. (standaard).
    #[default]
    NederlandseBijlage,
    /// Algemene EN 1993-1-1-formule.
    AlgemeenEN,
}
