/**
 * verloopSplitsen — wat er met een VERLOPEND profiel gebeurt als de staaf
 * eronder in tweeën gaat (ontwerp 15-09-2026, §6).
 *
 * # HET PROBLEEM
 *
 * Een verlopende staaf draagt twee profielen: `profile` op x = 0 en
 * `profileEnd` op x = L. Splits je zo'n staaf op t = x_s/L, dan zou het
 * letterlijk overnemen van beide velden — wat `computeBeamSplitOpKnoop` voor
 * elk ander veld terecht doet — van één verlopende staaf TWEE staven maken die
 * élk het volle verloop dragen. De doorsnede op de splitsplaats zou dan in het
 * ene deel de eindmaat zijn en in het andere de beginmaat: een sprong midden
 * in een ligger die er niet is, en een stijfheid die nergens meer op de
 * ingevoerde staaf slaat.
 *
 * # DE OPLOSSING
 *
 * Beide delen worden zelf verlopend, met de GEÏNTERPOLEERDE doorsnede op de
 * splitsplaats als eind (deel 1) respectievelijk begin (deel 2). Omdat het
 * verloop lineair is, is de doorsnedefunctie van de twee delen samen
 * WISKUNDIG DEZELFDE als die van de hele staaf: A(x) en I(x) veranderen op
 * geen enkele plaats. Zie `test-verlopend-splitsen.mjs`.
 *
 * * **Hout** — de tussendoorsnede is een rechthoek en past in de bestaande
 *   profielnaam: `"96x325"`. Geen nieuwe opslag nodig.
 * * **Staal** — de tussendoorsnede staat niet in de catalogus: h, b, t_w en
 *   t_f liggen ergens tussen begin- en eindprofiel in. Hij wordt daarom
 *   bewaard als EIGEN GELASTE DOORSNEDE (drie platen: lijf plus twee gelijke
 *   flenzen) en komt als `EIGEN:<naam>` op de staaf te staan — dezelfde vorm
 *   waarmee de rekenkern een verlopende stalen staaf sowieso al rekent
 *   (gelast, evenwijdige flenzen, geen afrondingsstraal; ontwerp §2).
 *
 * # DE EIGENSCHAPPEN VAN DIE GELASTE DOORSNEDE
 *
 * Een eigen doorsnede draagt zijn grootheden mee (`EigenDoorsnede.eigenschappen`),
 * en die worden hier met GESLOTEN FORMULES bepaald, niet met de
 * doorsnedemotor. Twee redenen: het splitsen is een synchrone bewerking in de
 * store (de motor is een asynchrone aanroep naar een Rust-binary), en een
 * gelast I-profiel uit drie rechthoeken zonder afrondingsstraal heeft voor
 * élke grootheid een exacte formule — er valt niets te benaderen. Welke
 * formule waar vandaan komt staat bij elk veld hieronder; `I_t` is de
 * open-profielformule ⅓·Σb·t³ en dat staat ook zo in de meldingen van de
 * bewaarde doorsnede, zodat niemand denkt dat er een mesh achter zit.
 *
 * De TOETSING rekent deze doorsnede trouwens zelf na: `naarCustomSection`
 * stuurt een samenstelling uit louter lamellen als GEOMETRIE naar de kern
 * (`eigenschappen: null`), en die klasseert en rekent per plaatdeel.
 */
import type { EigenDoorsnede, Lamel, MotorSamenvatting } from "./profieleditor/types";
import type { SectionProperties } from "./types/steel/SectionProperties";
import {
  EIGEN_PREFIX,
  eigenDoorsnedenStore,
} from "./profieleditor/eigenDoorsnedenStore";
import {
  bepaalVerloop,
  matenOpPositie,
  type VerloopMaten,
} from "./sectionResolver";

/**
 * Een maat als tekst, met decimaalkomma.
 *
 * `decimalen` rondt ALLEEN DE TEKST af; de maat in de platen blijft exact,
 * zodat splitsen geen enkel getal verandert (een hoogte die met 0,05 mm
 * verschuift, verschuift I(x) mee). `null` schrijft de maat onafgerond uit,
 * zoals het houtprofiel hieronder, waar de naam zelf de maat is.
 *
 * Waarom de naam van de stalen tussendoorsnede wel wordt afgerond:
 * `String(v)` schrijft ook de ruis van de drijvende komma uit. Halverwege
 * IPE 270 -> IPE 500 is t_w = 6,6 + 0,5*(10,2 - 6,6), in drijvende komma
 * 8,399999999999999, en die naam stond in het eigenschappenpaneel, de
 * profielkiezer en het rapport (issue #31). `Math.round` op het gevraagde
 * aantal decimalen en daarna `String` geeft de kortste schrijfwijze zonder
 * nullen achteraan: 8,4 en 6,35.
 */
function maatTekst(v: number, decimalen: number | null = null): string {
  const w = decimalen === null ? v : Math.round(v * 10 ** decimalen) / 10 ** decimalen;
  return String(w).replace(".", ",");
}

/**
 * De nauwkeurigheden waarmee de NAAM van de stalen tussendoorsnede wordt
 * geschreven, van grof naar fijn. Eerst 0,01 mm: ver onder de maattolerantie
 * van platen, en fijn genoeg om een maat als t_w = 6,35 niet als 6,3 of 6,4
 * te tonen. De fijnere stappen en ten slotte de onafgeronde schrijfwijze zijn
 * er alleen voor een naamsbotsing: de naam is de sleutel (`EIGEN:<naam>`), en
 * twee verschillende doorsneden mogen nooit dezelfde naam krijgen - dan zou
 * de tweede de eerste in de bibliotheek vervangen en rekent de staaf die naar
 * de eerste verwees stil met andere maten.
 */
const NAAM_DECIMALEN: readonly (number | null)[] = [2, 3, 4, 6, null];

/**
 * De naam van de tussendoorsnede, met de maten erin.
 *
 * De maten staan in de naam en niet alleen een volgnummer, omdat deze naam
 * in het eigenschappenpaneel, het rapport en de PDF terechtkomt: daar moet
 * te zien zijn wélke doorsnede het is zonder de bibliotheek erbij te pakken.
 */
export function gelasteINaam(
  m: VerloopMaten,
  decimalen: number | null = NAAM_DECIMALEN[0],
): string {
  return (
    `Gelast I ${maatTekst(m.h, decimalen)}×${maatTekst(m.b, decimalen)}×` +
    `${maatTekst(m.tw ?? 0, decimalen)}×${maatTekst(m.tf ?? 0, decimalen)}`
  );
}

/**
 * De drie platen van een gelast, dubbelsymmetrisch I-profiel, in het stelsel
 * waarin `gelasteIMatenVanEigen` ze terugleest: het lijf staand op de
 * oorsprong, de flenzen liggend op z = ±(h − t_f)/2.
 */
export function gelasteILamellen(m: VerloopMaten): Lamel[] {
  const h = m.h;
  const b = m.b;
  const tw = m.tw ?? 0;
  const tf = m.tf ?? 0;
  const hw = h - 2 * tf;
  const zFlens = (h - tf) / 2;
  return [
    { id: "lijf", b_mm: hw, t_mm: tw, y_mm: 0, z_mm: 0, alphaGraden: 90 },
    { id: "flens-onder", b_mm: b, t_mm: tf, y_mm: 0, z_mm: -zFlens, alphaGraden: 0 },
    { id: "flens-boven", b_mm: b, t_mm: tf, y_mm: 0, z_mm: zFlens, alphaGraden: 0 },
  ];
}

/**
 * De grootheden van een gelast, dubbelsymmetrisch I-profiel uit drie
 * rechthoeken, zonder afrondingsstraal.
 *
 * Alle formules zijn exact voor deze vorm:
 *  - `A   = 2·b·t_f + h_w·t_w`
 *  - `I_y = [b·h³ − (b − t_w)·h_w³] / 12` (volle rechthoek min de twee
 *    uitsparingen naast het lijf, om dezelfde as) — dezelfde formule als
 *    `sectionResolver.doorsnedeOpPositie` voor het verloop gebruikt
 *  - `I_z = [2·t_f·b³ + h_w·t_w³] / 12`
 *  - `W_pl,y = b·t_f·(h − t_f) + t_w·h_w²/4`
 *  - `W_pl,z = t_f·b²/2 + h_w·t_w²/4`
 *  - `I_t = ⅓·(2·b·t_f³ + h_w·t_w³)` — de open-profielformule; voor een
 *    gelast I zonder uitronding is dat de gangbare waarde
 *  - `I_w = I_z·(h − t_f)²/4` — de welvingsconstante van een
 *    dubbelsymmetrisch I-profiel (afstand tussen de flensmiddellijnen)
 *  - `A_v,z = η·h_w·t_w` met η = 1,0 — NEN-EN 1993-1-1 art. 6.2.6(3)b voor
 *    GELASTE I- en H-profielen, belast evenwijdig aan het lijf. η = 1,0 is de
 *    veilige waarde uit NEN-EN 1993-1-5 art. 5.1(2); de kern rekent deze
 *    doorsnede zelf na uit de geometrie.
 *  - `A_v,y = A − h_w·t_w = 2·b·t_f` — art. 6.2.6(3)f, belast evenwijdig aan
 *    de flenzen
 *
 * De doorsnede is dubbelsymmetrisch: zwaartepunt en schuifmiddelpunt vallen
 * samen op (b/2, h/2) in het beschrijvingsassenstelsel, `I_yz = 0` en de
 * hoofdassen vallen met y en z samen.
 */
export function gelasteIEigenschappen(m: VerloopMaten): SectionProperties {
  const h = m.h;
  const b = m.b;
  const tw = m.tw ?? 0;
  const tf = m.tf ?? 0;
  const hw = h - 2 * tf;
  const area = 2 * b * tf + hw * tw;
  const iy = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
  const iz = (2 * tf * b ** 3 + hw * tw ** 3) / 12;
  const welY = iy / (h / 2);
  const welZ = iz / (b / 2);
  const wplY = b * tf * (h - tf) + (tw * hw ** 2) / 4;
  const wplZ = (tf * b ** 2) / 2 + (hw * tw ** 2) / 4;
  const it = (2 * b * tf ** 3 + hw * tw ** 3) / 3;
  const iw = (iz * (h - tf) ** 2) / 4;
  // I_y ≥ I_z geldt voor elk I-profiel met h ≥ b; is de doorsnede breder dan
  // hoog, dan is de sterke as de z-as en draait de hoofdas mee.
  const sterkY = iy >= iz;
  return {
    area_mm2: area,
    iy_mm4: iy,
    iz_mm4: iz,
    wel_y_mm3: welY,
    wel_z_mm3: welZ,
    wpl_y_mm3: wplY,
    wpl_z_mm3: wplZ,
    av_y_mm2: 2 * b * tf,
    av_z_mm2: hw * tw,
    it_mm4: it,
    iw_mm6: iw,
    iy_radius_mm: Math.sqrt(iy / area),
    iz_radius_mm: Math.sqrt(iz / area),
    h_mm: h,
    b_mm: b,
    tw_mm: tw,
    tf_mm: tf,
    // Een gelaste plaatconstructie heeft geen walsuitronding; dat is hier geen
    // vergeten getal maar de vorm zelf (ontwerp §2).
    r_mm: 0,
    y_c_mm: b / 2,
    z_c_mm: h / 2,
    wel_y_top_mm3: welY,
    wel_y_bot_mm3: welY,
    wel_z_left_mm3: welZ,
    wel_z_right_mm3: welZ,
    iyz_mm4: 0,
    iu_mm4: Math.max(iy, iz),
    iv_mm4: Math.min(iy, iz),
    alpha_hoofdas_rad: sterkY ? 0 : Math.PI / 2,
    y_s_mm: b / 2,
    z_s_mm: h / 2,
  };
}

/** De motorsamenvatting die bij een analytisch bepaalde gelaste I hoort. */
function gelasteIMotor(m: VerloopMaten, decimalen: number | null): MotorSamenvatting {
  const tf = m.tf ?? 0;
  return {
    methode: "lamellen",
    wpl_bepaald: true,
    iw_bepaald: true,
    schuifmiddelpunt_bepaald: true,
    // De torsieconstante komt uit de open-profielformule ⅓·Σb·t³ en niet uit
    // een mesh; dat is voor deze vorm de gangbare waarde, maar het is geen
    // meting en dus geen onzekerheid van nul.
    it_onzekerheid: 0,
    a_gaten_mm2: 0,
    y_min_mm: -m.b / 2,
    y_max_mm: m.b / 2,
    z_min_mm: -m.h / 2,
    z_max_mm: m.h / 2,
    delen: [],
    meldingen: [
      "Tussendoorsnede van een verlopende staaf, ontstaan bij het splitsen. De maten liggen " +
        "lineair tussen het begin- en het eindprofiel van de oorspronkelijke staaf.",
      "De grootheden zijn met gesloten formules bepaald voor een gelast I-profiel uit drie " +
        `rechthoeken zonder afrondingsstraal (lijf ${maatTekst(m.h - 2 * tf, decimalen)}×` +
        `${maatTekst(m.tw ?? 0, decimalen)}, flenzen ${maatTekst(m.b, decimalen)}×` +
        `${maatTekst(tf, decimalen)}); I_t is de open-profielformule ⅓·Σb·t³, ` +
        "niet een uitkomst van de doorsnedemotor.",
    ],
  };
}

/**
 * De tussendoorsnede als bewaarde eigen doorsnede. De `id` is afgeleid van de
 * maten en niet willekeurig: splits je twee staven op dezelfde plaats van
 * hetzelfde verloop, dan is het één doorsnede in de bibliotheek en niet twee
 * met dezelfde naam. `decimalen`: zie `NAAM_DECIMALEN`; de platen en de
 * grootheden zijn bij elke keuze exact.
 */
export function gelasteIDoorsnede(
  m: VerloopMaten,
  decimalen: number | null = NAAM_DECIMALEN[0],
): EigenDoorsnede {
  const naam = gelasteINaam(m, decimalen);
  return {
    id: `verloop-${naam.replace(/[^0-9A-Za-z]+/g, "-").toLowerCase()}`,
    naam,
    ontwerp: {
      soort: "samenstelling",
      lamellen: gelasteILamellen(m),
      catalogusdelen: [],
      // Een I-profiel heeft geen gesloten cel; de open formule is hier de
      // juiste en niet een terugval.
      celMeenemen: false,
      lassen: [],
    },
    eigenschappen: gelasteIEigenschappen(m),
    vorm: "GelasteIDubbelsymmetrisch",
    motor: gelasteIMotor(m, decimalen),
    berekendOp: new Date(0).toISOString(),
  };
}

/** Beschrijven twee doorsneden dezelfde platen? Exact: de platen zijn de maat. */
function zelfdePlaten(a: EigenDoorsnede, b: EigenDoorsnede): boolean {
  return JSON.stringify(a.ontwerp) === JSON.stringify(b.ontwerp);
}

/**
 * De tussendoorsnede met de grofste naam uit `NAAM_DECIMALEN` die vrij is, of
 * die al bij precies deze platen hoort (dezelfde splitsplaats van hetzelfde
 * verloop: één doorsnede). Een naam die een ANDERE doorsnede draagt, wordt
 * overgeslagen. Botst zelfs de onafgeronde schrijfwijze, dan heeft iemand een
 * andere doorsnede met de hand zo genoemd; dan wordt hier geweigerd in plaats
 * van die doorsnede stil te vervangen.
 */
function vrijeGelasteIDoorsnede(
  m: VerloopMaten,
  bestaande: readonly EigenDoorsnede[],
): EigenDoorsnede {
  for (const decimalen of NAAM_DECIMALEN) {
    const d = gelasteIDoorsnede(m, decimalen);
    const bezet = bestaande.find((x) => x.naam === d.naam);
    if (!bezet || zelfdePlaten(bezet, d)) return d;
  }
  throw new Error(
    `De tussendoorsnede "${gelasteINaam(m, null)}" kan niet bewaard worden: de bibliotheek ` +
      "bevat al een andere eigen doorsnede met die naam. Hernoem die doorsnede en splits opnieuw.",
  );
}

/** De profielnamen van de twee delen van een gesplitste verlopende staaf. */
export interface VerloopSplitsing {
  /** Eindprofiel van deel 1 én beginprofiel van deel 2 — dezelfde doorsnede. */
  tussenProfiel: string;
  /** De eigen doorsnede die daarvoor bewaard moet worden (alleen bij staal). */
  bewaren?: EigenDoorsnede;
}

/**
 * Wat er van een verlopend profiel wordt op de splitsfractie `t` (0 < t < 1).
 *
 * `null` wanneer de staaf niet verlopend is (prismatisch, of een eindprofiel
 * dat niet bij het begin past — dan verandert het splitsen niets aan de
 * profielvelden en blijft de bestaande melding van `bepaalVerloop` staan waar
 * hij hoorde: bij het rekenen).
 *
 * `bestaande` is de bibliotheek waartegen de naam van een stalen
 * tussendoorsnede op een botsing wordt gecontroleerd (standaard de winkel);
 * zie `vrijeGelasteIDoorsnede`.
 */
export function tussenProfielVoorSplitsing(
  material: string | undefined,
  profile: string | undefined,
  profileEnd: string | undefined,
  t: number,
  bestaande: readonly EigenDoorsnede[] = eigenDoorsnedenStore.getState().items,
): VerloopSplitsing | null {
  const v = bepaalVerloop(material, profile, profileEnd);
  if (v.status !== "verlopend") return null;
  if (!(t > 0 && t < 1)) return null;
  const m = matenOpPositie(v.verloop, t);
  if (v.verloop.soort === "rechthoek") {
    // Hout: de rechthoek past in de gewone profielnaam. Hier NIET afgerond:
    // anders dan bij staal is de naam hier zelf de maat waarmee gerekend
    // wordt (er is geen bewaarde doorsnede achter), en afronden zou de
    // doorsnede op de splitsplaats verschuiven.
    return { tussenProfiel: `${maatTekst(m.b)}x${maatTekst(m.h)}` };
  }
  const doorsnede = vrijeGelasteIDoorsnede(m, bestaande);
  return { tussenProfiel: `${EIGEN_PREFIX}${doorsnede.naam}`, bewaren: doorsnede };
}

/**
 * Hetzelfde, maar met de eigen doorsnede meteen in de bibliotheek gezet.
 *
 * Het bewaren gebeurt HIER en niet bij de aanroeper, omdat elke aanroeper het
 * anders zou kunnen vergeten — en een staaf die naar een doorsnede verwijst
 * die niet bestaat, is een staaf die niet meer te rekenen is. De store is de
 * losse (niet-React) zustand-store, zodat deze functie ook in de sidecar en in
 * een test buiten de browser werkt.
 */
export function splitsVerlopendProfiel(
  material: string | undefined,
  profile: string | undefined,
  profileEnd: string | undefined,
  t: number,
): string | null {
  const uit = tussenProfielVoorSplitsing(material, profile, profileEnd, t);
  if (!uit) return null;
  if (uit.bewaren) eigenDoorsnedenStore.getState().bewaar(uit.bewaren);
  return uit.tussenProfiel;
}
