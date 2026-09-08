// Toegepaste normen in de rapportkop — het rapport mag geen materiaal noemen
// dat niet in het model zit.
//
// WAT HIER VASTLIGT
// Een zuiver stalen model meldde bij de uitgangspunten "Eurocode 5 — Hout
// (EN 1995-1-1)", omdat dat vinkje standaard aan stond. Dat is geen keuze van
// de constructeur maar een fabrieksstand, en ze staat in het hoofdstuk dat de
// lezer vertelt waarop de berekening rust.
//
// DE ZES MANIEREN WAAROP DE OPLOSSING MIS KAN GAAN, alle zes hier afgedekt:
//
//  1. De norm verdwijnt te breed. Wie EN 1995 bewust aanzet loopt vooruit op
//     wat hij gaat tekenen en moet hem blijven zien, ook in een leeg model.
//  2. De norm verdwijnt terwijl er wél op getoetst is. Een gedraaide toetsing
//     hoort verantwoord te worden; geen enkele keuze gaat daaroverheen.
//  3. Bestaande projectbestanden breken. Daarin staat alleen `en1995: true` en
//     is niet te achterhalen wie dat zette; ze moeten laden én van de fout af
//     zijn, zonder migratie.
//  4. De stand op het scherm is dubbelzinnig. "Volgt het model" en "niet
//     vermelden" leveren een verschillend rapport op en mogen dus nooit als
//     dezelfde stand verschijnen — dat deden ze wél, als leeg vinkje.
//  5. De stand is niet terug te draaien. Een vinkje kon zijn eigen spoor in
//     `normenHandmatig` niet uitwissen, dus na één klik was "volgt het model"
//     voorgoed weg.
//  6. De wiring wordt vergeten. De defaults, de dialoog en de rapportsectie
//     worden hier op de bron gecontroleerd — de React-bestanden zijn in Node
//     niet te importeren.
//
// Draaien met: npx tsx test-rapportnormen.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));

const {
  NORM_SLEUTELS,
  normOordelen,
  normStanden,
  normVanMateriaal,
  normenInModel,
  normenUitToetsen,
  normenVoorRapport,
  zetNormStand,
} = await import("./src/lib/normenInRapport.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}

function checkGelijk(naam, actueel, verwacht) {
  const ok = JSON.stringify(actueel) === JSON.stringify(verwacht);
  if (ok) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(actueel)}`); }
  else { failed++; log(`  ✗ ${naam}: ${JSON.stringify(actueel)} vs ${JSON.stringify(verwacht)}`); }
}

// ── Staven zoals de app ze kent; `materiaalVanStaaf` classificeert ze. ──
const staal = (id) => ({ id, from: 1, to: 2, material: "S235", profile: "IPE300" });
const hout = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "100x200" });
const beton = (id) => ({ id, from: 1, to: 2, material: "C30/37", profile: "300x500" });
const clt = (id) => ({ id, from: 1, to: 2, material: "C24", profile: "CLT 40/20/40" });
const vrij = (id) => ({
  id, from: 1, to: 2, profile: "200x200",
  material: "VRIJ: natuursteen E=15000 rho=2400 f=8",
});
const onbekend = (id) => ({ id, from: 1, to: 2, material: "?", profile: "?" });

/** De stand van een nieuw project: niemand heeft een vinkje aangeraakt. */
const STANDAARD = { en1993: false, en1995: false, en1992: false, normenHandmatig: [] };

/** Een bestaand projectbestand van vóór deze wijziging: geen spoor van wie. */
const BESTAAND_BESTAND = { en1993: true, en1995: true, en1992: false };

const NIETS_GETOETST = normenUitToetsen({ steel: false, timber: false, concrete: false });

/** De normen in de rapportkop, gegeven keuze + model + toetsresultaten. */
const inRapport = (keuze, beams, getoetst = NIETS_GETOETST) =>
  NORM_SLEUTELS.filter((s) => normenVoorRapport(keuze, normenInModel(beams), getoetst)[s]);

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Zuiver stalen model, niets aangeraakt: geen hout in de kop");
{
  const beams = [staal(1), staal(2), staal(3)];
  checkGelijk("toegepaste normen", inRapport(STANDAARD, beams), ["en1993"]);
  checkWaar("EN 1995 wordt niet genoemd",
    !inRapport(STANDAARD, beams).includes("en1995"),
    "dit was de gemelde fout");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Een leeg model noemt geen enkele norm");
{
  checkGelijk("toegepaste normen", inRapport(STANDAARD, []), []);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Elk materiaal brengt zijn eigen norm mee, en alleen die");
{
  checkGelijk("hout", inRapport(STANDAARD, [hout(1)]), ["en1995"]);
  checkGelijk("beton", inRapport(STANDAARD, [beton(1)]), ["en1992"]);
  checkGelijk("kruislaaghout valt onder EN 1995", inRapport(STANDAARD, [clt(1)]), ["en1995"]);
  checkGelijk("gemengd staal + hout", inRapport(STANDAARD, [staal(1), hout(2)]),
    ["en1993", "en1995"]);
  checkGelijk("een vrij materiaal heeft geen norm", inRapport(STANDAARD, [vrij(1)]), []);
  checkGelijk("een onbekend materiaal evenmin", inRapport(STANDAARD, [onbekend(1)]), []);
  checkWaar("de materiaal-naar-normtabel kent geen andere uitzonderingen",
    normVanMateriaal("staal") === "en1993" &&
    normVanMateriaal("hout") === "en1995" &&
    normVanMateriaal("clt") === "en1995" &&
    normVanMateriaal("beton") === "en1992" &&
    normVanMateriaal("vrij") === null &&
    normVanMateriaal("onbekend") === null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De gebruiker mag vooruitlopen op wat hij gaat tekenen");
{
  const keuze = { en1993: false, en1995: true, en1992: false, normenHandmatig: ["en1995"] };
  checkGelijk("EN 1995 op 'altijd vermelden', leeg model", inRapport(keuze, []), ["en1995"]);
  checkGelijk("EN 1995 op 'altijd vermelden', stalen model", inRapport(keuze, [staal(1)]),
    ["en1993", "en1995"]);
  checkWaar("een uitspraak over EN 1995 zet EN 1993 niet uit",
    inRapport(keuze, [staal(1)]).includes("en1993"),
    "en1993 staat in deze keuze op false, maar volgt het model");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] 'Niet vermelden' is óók een keuze — behalve tegen een toetsing in");
{
  const uit = { en1993: false, en1995: false, en1992: false, normenHandmatig: ["en1995"] };
  checkGelijk("hout in het model, EN 1995 bewust uitgezet", inRapport(uit, [hout(1)]), []);
  const houtGetoetst = normenUitToetsen({ steel: false, timber: true, concrete: false });
  checkGelijk("maar er is op getoetst", inRapport(uit, [hout(1)], houtGetoetst), ["en1995"]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Wat getoetst is staat er altijd bij");
{
  // Beton staat standaard uit en zit hier niet in het model; zonder deze regel
  // zou een rapport mét betontoetsing beweren dat EN 1992 niet is toegepast.
  const betonGetoetst = normenUitToetsen({ steel: true, timber: false, concrete: true });
  checkGelijk("betontoetsing zonder betonstaaf in het model",
    inRapport(STANDAARD, [staal(1)], betonGetoetst), ["en1993", "en1992"]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Bestaande projectbestanden: laden, en van de fout af");
{
  checkGelijk("zuiver staal", inRapport(BESTAAND_BESTAND, [staal(1)]), ["en1993"]);
  checkGelijk("hout erin", inRapport(BESTAAND_BESTAND, [hout(1)]), ["en1995"]);
  checkGelijk("leeg model", inRapport(BESTAAND_BESTAND, []), []);
  checkWaar("`en1995: true` zonder spoor telt niet als keuze van de gebruiker",
    normStanden(BESTAAND_BESTAND).en1995 === "model",
    "anders toont de dialoog een keuze die het rapport negeert");
  const naAanraken = { ...BESTAAND_BESTAND, normenHandmatig: ["en1995"] };
  checkWaar("zodra de gebruiker er zelf iets over zegt telt het weer",
    normStanden(naAanraken).en1995 === "aan" &&
    inRapport(naAanraken, [staal(1)]).includes("en1995"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Het oordeel is afgeleid, niet gemuteerd");
{
  const keuze = { ...STANDAARD };
  const beams = [staal(1), hout(2)];
  const voor = JSON.stringify({ keuze, beams });
  normenVoorRapport(keuze, normenInModel(beams), NIETS_GETOETST);
  checkWaar("keuze en model blijven onaangeraakt",
    JSON.stringify({ keuze, beams }) === voor);

  // Twee aanroepen mogen niet hetzelfde object teruggeven: één per ongeluk
  // gemuteerde uitkomst zou daarna in élk rapport blijven staan.
  const a = normenInModel([staal(1)]);
  const b = normenInModel([]);
  a.en1995 = true;
  checkWaar("elke aanroep levert een eigen vlaggenset", b.en1995 === false);
  checkGelijk("tweede beoordeling geeft hetzelfde",
    inRapport(STANDAARD, beams), inRapport(STANDAARD, beams));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Drie standen: uit elkaar te houden, en alle drie bereikbaar");
{
  // "Volgt het model" en "niet vermelden" waren op het scherm hetzelfde lege
  // hokje. Ze zijn niet hetzelfde: met hout in het model levert de eerste wél
  // en de tweede géén EN 1995 in het rapport. Eén hokje voor twee uitkomsten
  // is een leugen op het scherm.
  const geenUitspraak = STANDAARD;
  const bewustUit = zetNormStand(STANDAARD, "en1995", "uit");
  checkGelijk("zonder uitspraak", normStanden(geenUitspraak).en1995, "model");
  checkGelijk("bewust uitgezet", normStanden(bewustUit).en1995, "uit");
  checkWaar("de twee standen leveren een verschillend rapport op",
    inRapport(geenUitspraak, [hout(1)]).includes("en1995") &&
    !inRapport(bewustUit, [hout(1)]).includes("en1995"),
    "en mogen dus nooit als dezelfde stand op het scherm staan");

  // De weg terug — dit is de vastloper die hier gerepareerd is.
  const aan = zetNormStand(STANDAARD, "en1995", "aan");
  const uit = zetNormStand(aan, "en1995", "uit");
  const terug = zetNormStand(uit, "en1995", "model");
  checkGelijk("stand na 'altijd vermelden'", normStanden(aan).en1995, "aan");
  checkGelijk("stand na 'niet vermelden'", normStanden(uit).en1995, "uit");
  checkGelijk("stand na 'volgt het model'", normStanden(terug).en1995, "model");
  checkWaar("terug is ook echt terug: hout in het model telt weer mee",
    inRapport(terug, [hout(1)]).includes("en1995"),
    "vroeger zat de gebruiker na één klik vast aan zijn eigen keuze");
  checkGelijk("het spoor is opgeruimd", terug.normenHandmatig, []);

  checkGelijk("één norm zetten laat de andere twee met rust",
    [normStanden(bewustUit).en1993, normStanden(bewustUit).en1992],
    ["model", "model"]);

  const drie = zetNormStand(
    zetNormStand(zetNormStand(STANDAARD, "en1992", "aan"), "en1995", "uit"),
    "en1993", "aan");
  checkGelijk("normenHandmatig houdt de vaste volgorde", drie.normenHandmatig,
    ["en1993", "en1995", "en1992"]);
  checkGelijk("en de standen staan los van elkaar",
    [normStanden(drie).en1993, normStanden(drie).en1995, normStanden(drie).en1992],
    ["aan", "uit", "aan"]);

  const voor = JSON.stringify(STANDAARD);
  zetNormStand(STANDAARD, "en1993", "uit");
  checkWaar("de meegegeven keuze wordt niet gemuteerd",
    JSON.stringify(STANDAARD) === voor);

  // Een bestaand bestand hoeft niet gemigreerd te worden; kiest de gebruiker
  // daar "volgt het model", dan verdwijnt ook de betekenisloze `true`.
  const opgeschoond = zetNormStand(BESTAAND_BESTAND, "en1995", "model");
  checkWaar("een oude `true` blijft niet zinloos in het bestand staan",
    opgeschoond.en1995 === false && opgeschoond.normenHandmatig.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Wat het scherm zegt klopt met wat het rapport doet");
{
  const houtGetoetst = normenUitToetsen({ steel: false, timber: true, concrete: false });
  const uit = zetNormStand(STANDAARD, "en1995", "uit");

  checkGelijk("zonder uitspraak", normOordelen(STANDAARD, NIETS_GETOETST).en1995, "model");
  checkGelijk("altijd vermelden",
    normOordelen(zetNormStand(STANDAARD, "en1995", "aan"), NIETS_GETOETST).en1995, "keuze-aan");
  checkGelijk("niet vermelden", normOordelen(uit, NIETS_GETOETST).en1995, "keuze-uit");

  // Het enige geval waarin de keuze het aflegt tegen de berekening. Zwijgt het
  // scherm daarover, dan toont het "niet vermelden" terwijl het rapport de
  // norm wél noemt — precies de onwaarheid die hier weg moest.
  checkGelijk("uitgezet, maar er is op getoetst",
    normOordelen(uit, houtGetoetst).en1995, "getoetst");
  checkWaar("en het rapport noemt hem dan inderdaad",
    inRapport(uit, [], houtGetoetst).includes("en1995"));

  // Kruiscontrole over alle standen × modellen × toetsuitkomsten: het oordeel
  // dat het scherm toont moet dezelfde uitkomst voorspellen als het rapport
  // draait. Bij "model" doet het scherm bewust geen uitspraak (de dialoog
  // heeft de staven niet in handen) en valt er niets te vergelijken.
  const modellen = { "leeg model": [], "hout in het model": [hout(1)] };
  const toetsingen = { "niets getoetst": NIETS_GETOETST, "hout getoetst": houtGetoetst };
  let afwijkingen = 0;
  let vergeleken = 0;
  for (const stand of ["model", "aan", "uit"]) {
    for (const [modelNaam, beams] of Object.entries(modellen)) {
      for (const [toetsNaam, getoetst] of Object.entries(toetsingen)) {
        const keuze = zetNormStand(STANDAARD, "en1995", stand);
        const oordeel = normOordelen(keuze, getoetst).en1995;
        const voorspeld = oordeel === "model" ? null : oordeel !== "keuze-uit";
        if (voorspeld === null) continue;
        vergeleken++;
        const werkelijk = inRapport(keuze, beams, getoetst).includes("en1995");
        if (voorspeld !== werkelijk) {
          afwijkingen++;
          log(`      ${stand} / ${modelNaam} / ${toetsNaam}: `
            + `scherm zegt ${voorspeld}, rapport doet ${werkelijk}`);
        }
      }
    }
  }
  // 12 combinaties, waarvan er 2 overblijven zonder voorspelling: de stand
  // "volgt het model" zonder toetsresultaat. Bij een toetsresultaat wint
  // "getoetst" ook in die stand, en valt er dus wél te vergelijken.
  checkWaar(`het scherm voorspelt in alle ${vergeleken} vergelijkbare gevallen wat het`
    + " rapport doet", afwijkingen === 0 && vergeleken === 10);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[11] De uitgangspunten en de rapportsectie zijn gewired zoals hierboven");
{
  // De React-bestanden zijn in Node niet te importeren (CSS, hooks), dus wordt
  // de bron gelezen. Valt een van deze checks om, dan klopt de logica hierboven
  // nog wel maar draait de app er niet meer op.
  const dialoog = readFileSync(
    join(hier, "src/components/project/ProjectSettingsDialog.tsx"), "utf8");
  const start = dialoog.indexOf("export const DEFAULT_UITGANGSPUNTEN");
  const defaults = dialoog.slice(start, dialoog.indexOf("};", start));
  checkWaar("geen enkele norm staat standaard aan",
    /en1993: false/.test(defaults) &&
    /en1995: false/.test(defaults) &&
    /en1992: false/.test(defaults),
    "een stand die de gebruiker niet heeft aangeraakt mag niet onwaar zijn");
  checkWaar("de defaults dragen een (lege) lijst eigen uitspraken",
    /normenHandmatig: \[\]/.test(defaults));
  checkWaar("de dialoog toont de stand zoals het rapport hem leest",
    dialoog.includes("normStanden(uitgangspunten)") && dialoog.includes("value={stand}"),
    "een vinkje kon 'volgt het model' en 'niet vermelden' niet uit elkaar houden");
  checkWaar("alle drie de standen zijn te kiezen, inclusief de weg terug",
    /stand: "model"/.test(dialoog) &&
    /stand: "aan"/.test(dialoog) &&
    /stand: "uit"/.test(dialoog));
  checkWaar("de keuze loopt via zetNormStand — die kan het spoor ook wissen",
    dialoog.includes("zetNormStand(vorige, sleutel, stand)"));
  checkWaar("het scherm zegt per norm wat de stand voor het rapport betekent",
    dialoog.includes("normOordelen(uitgangspunten") && dialoog.includes("normGevolg("),
    "anders zwijgt het als een toetsing de keuze van de gebruiker overrulet");

  // Kleine bevinding erbij: het EN 1992-hokje stond hard op disabled met de
  // mededeling "betontoetsing volgt later". Die klopt niet meer — de
  // betontoetsing draait mee in checkStore — dus het hokje is bruikbaar
  // gemaakt. Die tweede check bewaakt de eerste: gaat de betontoetsing er ooit
  // weer uit, dan valt hier op dat de mededeling terug moet.
  checkWaar("EN 1992 is niet langer uitgeschakeld met 'volgt later'",
    !/betontoetsing volgt later/.test(dialoog) && !/disabled=\{!beschikbaar\}/.test(dialoog));
  const checkStore = readFileSync(join(hier, "src/stores/checkStore.ts"), "utf8");
  checkWaar("en dat mag, want de betontoetsing draait echt mee",
    checkStore.includes('"check_concrete_beams"'));

  const sectie = readFileSync(
    join(hier, "src/components/report/sections/ProjectSection.tsx"), "utf8");
  checkWaar("de rapportkop laat de regels hier gelden",
    sectie.includes("normenVoorRapport(") &&
    sectie.includes("normenInModel(beams)"));
  checkWaar("de oude 'vinkje OF getoetst'-regel is weg",
    !/u\.en199\d \|\|/.test(sectie),
    "die noemde EN 1995 in elk zuiver stalen rapport");
}

// ── Toetsresultaten zoals de vijf rekenkernen ze leveren. Alleen de velden
//    waaraan ze zich laten herkennen doen hier iets. ──
const eenToets = {
  id: "toets",
  kind: { data: {
    title: "Vergelijkspanning", article: "vrije spanningstoets", status: "Ok",
    uc: { formula_latex: "", ed: 1, rd: 2, uc: 0.5 },
  } },
};
const kaleToets = {
  checks: [eenToets], uc_max: 0.5, status: "Ok", governing_check_id: "toets",
};
const staalToets = {
  ...kaleToets, beam_id: 1, profile_name: "IPE300", steel_grade: "S235",
};
const houtToets = {
  ...kaleToets, beam_id: 2, section_name: "96 x 450", strength_class: "C24",
  service_class: "Sc1", load_duration: "MediumTerm",
};
const cltToets = { ...houtToets, beam_id: 3, layup: { lagen: [] }, notes: [] };
const betonToets = {
  ...kaleToets, beam_id: 4, section_name: "300 x 500", concrete_class: "C30/37",
};
const spanningToets = {
  ...kaleToets, beam_id: 5, section_name: "200 x 200",
  material_name: "natuursteen", f_toel_mpa: 8, gamma_m: 1, f_d_mpa: 8, notes: [],
};
/** Een zesde resultaatsoort die er later bijkomt en nog geen eigen tak heeft. */
const nieuweSoort = { ...kaleToets, beam_id: 6, section_name: "?" };

const ALLE_TOETSEN = [
  staalToets, houtToets, cltToets, betonToets, spanningToets, nieuweSoort,
];

// ─────────────────────────────────────────────────────────────────────────
// Van TOETSRESULTAAT naar norm — het pad dat het rapport werkelijk loopt.
//
// De secties hierboven voeden `normenUitToetsen` met booleans die met de hand
// gezet zijn. Wie die booleans MAAKT is `usedNorms`, en daar zat een tweede
// fout van dezelfde soort: de classificatie was een keten if / else-if / else
// met hout als laatste emmer. Alles wat geen staal en geen beton was werd
// hout, dus ook de vrije spanningstoets, die géén norm heeft. Het rapport
// zette vervolgens "Eurocode 5 — Hout" bij de toegepaste normen van een model
// zonder één houten staaf, en daar kwam de gebruiker niet meer vanaf: wat
// getoetst is telt altijd, daar gaat geen keuze overheen.
log("\n[12] Elk toetsresultaat krijgt de norm van zijn eigen rekenkern");
{
  const { checkSoort } = await import("./src/lib/checkTypes.ts");
  const { basisText, usedNorms } = await import(
    "./src/components/report/checkReportUtils.ts");

  checkGelijk("staal", checkSoort(staalToets), "staal");
  checkGelijk("hout", checkSoort(houtToets), "hout");
  checkGelijk("kruislaaghout", checkSoort(cltToets), "clt");
  checkGelijk("beton", checkSoort(betonToets), "beton");
  checkGelijk("vrije spanningstoets", checkSoort(spanningToets), "spanning");
  checkGelijk("een onbekende vorm", checkSoort(nieuweSoort), null);

  const geen = { steel: false, timber: false, concrete: false, vrij: false };
  checkGelijk("staal zet de staalvlag", usedNorms([staalToets]), { ...geen, steel: true });
  checkGelijk("hout zet de houtvlag", usedNorms([houtToets]), { ...geen, timber: true });
  checkGelijk("kruislaaghout deelt de houtvlag",
    usedNorms([cltToets]), { ...geen, timber: true });
  checkGelijk("beton zet de betonvlag", usedNorms([betonToets]), { ...geen, concrete: true });
  checkGelijk("de vrije spanningstoets telt NIET als hout",
    usedNorms([spanningToets]), { ...geen, vrij: true });
  checkGelijk("een nieuwe resultaatsoort valt niet in de laatste emmer",
    usedNorms([nieuweSoort]), geen);
  checkGelijk("alles door elkaar", usedNorms(ALLE_TOETSEN),
    { steel: true, timber: true, concrete: true, vrij: true });

  // De gemelde fout, van toetsresultaat tot in de rapportkop: één staaf van
  // een vrij materiaal, geen enkele stand aangeraakt.
  checkGelijk("een model met alleen een spanningstoets noemt geen enkele norm",
    inRapport(STANDAARD, [vrij(1)], normenUitToetsen(usedNorms([spanningToets]))),
    []);

  // Dezelfde classificatie zet de voetregel onder de toetsingstabel.
  const terugval = (_sleutel, tekst) => tekst;
  checkWaar("geen toetsbasis onder een model zonder norm",
    basisText(terugval, [spanningToets]) === null,
    "hier stond 'Toetsbasis: hout: NEN-EN 1995-1-1…'");
  const gemengd = basisText(terugval, [staalToets, spanningToets]);
  checkWaar("staal naast een spanningstoets noemt alleen de staalnorm",
    /1993/.test(gemengd) && !/1995/.test(gemengd), gemengd);
  checkWaar("en hout noemt zijn norm gewoon",
    /1995/.test(basisText(terugval, [houtToets])));
}

// ─────────────────────────────────────────────────────────────────────────
// Scherm, CSV-export en PDF gaan over hetzelfde model en moeten hetzelfde
// zeggen. De CSV stelde haar normkolom samen uit een kort label plus de
// deelnummers van de norm; voor de vrije spanningstoets, waarvan het label
// "spanning" was, leverde dat een aanduiding op die niet bestaat — in een
// bestand dat de gebruiker aan derden geeft.
log("\n[13] Scherm, CSV en PDF noemen dezelfde norm, of géén");
{
  const { normLabel } = await import("./src/lib/checkTypes.ts");

  // De rapportkern is de bron van deze aanduidingen; ze hier overtypen zou de
  // twee kanten uit elkaar kunnen laten lopen zonder dat er iets omvalt.
  const kern = readFileSync(
    join(hier, "../src-tauri/crates/report/src/lib.rs"), "utf8");
  const kernConstante = (naam) => {
    const m = kern.match(new RegExp(`const ${naam}: &str = "([^"]+)"`));
    return m === null ? null : m[1];
  };
  const NORM_STEEL = kernConstante("NORM_STEEL");
  const NORM_TIMBER = kernConstante("NORM_TIMBER");
  const NORM_CONCRETE = kernConstante("NORM_CONCRETE");
  const GEEN_NORM = kernConstante("GEEN_NORM");
  checkWaar("de aanduidingen van de rapportkern zijn gevonden",
    [NORM_STEEL, NORM_TIMBER, NORM_CONCRETE, GEEN_NORM].every((s) => Boolean(s)),
    "zonder die bron zegt de rest van deze sectie niets");

  checkGelijk("staal", normLabel(staalToets), NORM_STEEL);
  checkGelijk("hout", normLabel(houtToets), NORM_TIMBER);
  checkGelijk("kruislaaghout draagt dezelfde norm", normLabel(cltToets), NORM_TIMBER);
  checkGelijk("beton", normLabel(betonToets), NORM_CONCRETE);
  checkGelijk("de vrije spanningstoets", normLabel(spanningToets), GEEN_NORM);
  checkGelijk("een onbekende vorm claimt geen norm", normLabel(nieuweSoort), GEEN_NORM);
  checkWaar("geen enkel label doet zich voor als norm zonder er een te zijn",
    ALLE_TOETSEN.every((r) => !/spanning/.test(normLabel(r))));

  // En dan de CSV zoals hij het bestand in gaat, niet zijn broncode. De export
  // schrijft naar een Blob en hangt een download aan de pagina; hier staan
  // allebei even kort in de weg, zodat de regels te lezen zijn.
  const { exportCheckResultsCsv } = await import("./src/io/steelCheck.ts");
  const geschreven = [];
  const echt = {
    Blob: globalThis.Blob, URL: globalThis.URL, document: globalThis.document,
  };
  try {
    globalThis.Blob = class { constructor(delen) { geschreven.push(delen.join("")); } };
    globalThis.URL = { createObjectURL: () => "blob:test", revokeObjectURL: () => {} };
    globalThis.document = {
      createElement: () => ({ click() {} }),
      body: { appendChild() {}, removeChild() {} },
    };
    exportCheckResultsCsv([staalToets, spanningToets]);
  } finally {
    globalThis.Blob = echt.Blob;
    globalThis.URL = echt.URL;
    globalThis.document = echt.document;
  }
  // "sep=;", de kopregel, dan één regel per toets.
  const regels = geschreven.join("").split("\r\n");
  const kolomNorm = (regel) => regel.split(";")[3];
  checkGelijk("de kopregel heeft de kolom Norm op de vierde plaats",
    kolomNorm(regels[1]), "Norm");
  checkGelijk("kolom Norm van de stalen staaf", kolomNorm(regels[2]), NORM_STEEL);
  checkGelijk("kolom Norm van de vrije spanningstoets",
    kolomNorm(regels[3]), GEEN_NORM);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
