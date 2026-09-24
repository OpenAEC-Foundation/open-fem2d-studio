/**
 * BarPropertiesDialog — modal dialog opened by double-clicking a beam.
 *
 * Floating modal with tabs to edit beam properties:
 * (Algemeen / EN 1993 of EN 1995 op basis van het materiaal), footer met
 * Annuleer/OK. OK persists edits via onUpdate → updateBeam: materiaal,
 * profiel, releases én de per-staaf toetsconfiguratie (Beam.checkConfig).
 *
 * Toetsconfiguratie-conventies:
 *  - Kniklengte-velden leeg = systeemlengte (builder-default).
 *  - Kipsteunen: fracties 0..1 van de staaflengte (bovenflens), gescheiden
 *    door komma's en/of spaties — bijv. "0.5" of "0.25 0.5 0.75". Dit is
 *    dezelfde conventie als LateralBracing.top_flange_positions in de
 *    Rust-kern. Ongeldige waarden (buiten 0..1) worden bij OK verwijderd.
 *  - Hout toont géén zeeg-veld: de EN 1995-kern consumeert geen zeeg, dus
 *    dat veld zou schijninvoer zijn.
 */
import { useState, useId, isValidElement, cloneElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { parseLength, formatLength } from "../../lib/lengthInput";
import { HERKOMST_KIPSTEUNEN, voorspelKniklengte } from "../../lib/kniklengte";
import type { Beam, BeamCheckConfig, BeamEindVeren, BeamReleases, Node } from "./femTypes";
import AansluitingKeuze from "./AansluitingKeuze";
import { useCheckStore } from "../../stores/checkStore";
import { isSteelCheckResult } from "../../lib/checkTypes";
import { matchSupportedTimberGrade } from "../../lib/timberCheckBuilder";
import { isCltProfiel } from "../../lib/cltCheckBuilder";
import { sanitizeRestraintFractions } from "../../lib/steelCheckBuilder";
import { parseVrijMateriaal } from "../../lib/vrijMateriaal";
import ProfielKiezer, { profielenInGebruik } from "./ProfielKiezer";
// Één bron voor de doorsnedenaam en de begin-/eindmaten van een verlopende
// staaf — dezelfde keuring als de solver en de rekenkern; zie lib/verloopKeuze.
import { doorsnedeNaamVertaald, verloopMaten } from "../../lib/verloopKeuze";
import InfoTip from "../InfoTip";
import "./BarPropertiesDialog.css";

/**
 * Een dialoogregel label | veld, met de uitleg als InfoTip naast het label
 * (issue #43) en die uitleg als `aria-describedby` op het veld.
 */
function DialoogRij({ label, info, children }: { label: ReactNode; info: ReactNode; children: ReactNode }) {
  const id = useId();
  const veld = isValidElement<{ "aria-describedby"?: string }>(children)
    ? cloneElement(children, { "aria-describedby": id })
    : children;
  return (
    <div className="bar-props-row">
      <span>{label}<InfoTip id={id}>{info}</InfoTip></span>
      {veld}
    </div>
  );
}

/**
 * De staalsoorten die de kern kent. Stond hier als eigen lijst NAAST die in
 * `lib/steelCheckBuilder.ts`; sinds de plaatmateriaalkeuze dezelfde lijst
 * nodig heeft is er één bron, en dit is nog uitsluitend de doorgeefpost voor
 * de schermen die hem hier al importeerden.
 */
export { STEEL_GRADES } from "../../lib/steelCheckBuilder";

/** Suggesties voor de profiel-combobox: staalprofielen + houtdoorsneden. */
export const PROFILE_SUGGESTIONS = [
  "HEA100", "HEA140", "HEA160", "HEA200", "HEA240", "HEA300",
  "HEB160", "HEB200", "HEB240", "HEB300",
  "IPE160", "IPE200", "IPE240", "IPE300", "IPE360",
  "UNP160", "UNP200", "UNP240",
  // Houtdoorsneden — conventie b×h in mm; vrij typbaar (bijv. "96x450 GL").
  "38x89", "44x146", "60x100", "71x171", "96x281", "96x450 GL",
];

/** Kipsteun-invoer ("0.25, 0.5 0.75") → fracties; filtering/sortering bij OK. */
export function parseRestraintInput(text: string): number[] {
  return text
    .split(/[,;\s]+/)
    .filter((s) => s.length > 0)
    .map((s) => parseFloat(s.replace(",", ".")))
    .filter((f) => Number.isFinite(f));
}

interface Props {
  beam: Beam;
  nodes: Node[];
  /**
   * Alle staven van het model. Alleen nodig om in de profielwizard te tonen
   * welke profielen er al in het project staan; ontbreekt hij, dan blijft dat
   * lijstje weg en werkt de rest gewoon.
   */
  beams?: Beam[];
  /** Element forces from the most-recent solver result, if any. */
  beamForces?: { N: number; V: number; M_start: number; M_end: number } | null;
  /** Persist material/profile/releases/checkConfig edits back to the store. */
  onUpdate?: (updates: Partial<Beam>) => void;
  onClose: () => void;
}

export default function BarPropertiesDialog({ beam, nodes, beams, beamForces, onUpdate, onClose }: Props) {
  const { t } = useTranslation("check");
  const [tab, setTab] = useState<"general" | "norm">("general");
  // Normtoetsingsresultaat van deze staaf (staal of hout) uit de laatste run.
  const memberResult = useCheckStore(
    (s) => s.results.find((r) => r.beam_id === beam.id) ?? null,
  );
  // Hydrate from the beam so re-opening shows previously-saved values.
  const [material, setMaterial] = useState(beam.material ?? "S235");
  const [profile, setProfile]   = useState(beam.profile  ?? "HEA160");
  // Het EINDprofiel van een verlopende staaf (ontwerp 15-09-2026). Leeg =
  // prismatisch; de wizard levert het samen met `profile`, zodat de twee niet
  // los van elkaar kunnen raken.
  const [profileEnd, setProfileEnd] = useState<string | undefined>(beam.profileEnd);
  // ProfielKiezer-wizard (profiel + materiaal als één combinatie) — de keuze
  // landt in de lokale dialoogstate en wordt pas bij OK gecommit.
  const [kiezerOpen, setKiezerOpen] = useState(false);
  // Aansluitingen: scharnieren (releases) én veren, samen bewerkt per DOF
  // via AansluitingKeuze; pas bij OK gecommit.
  const [releases, setReleases] = useState<BeamReleases | undefined>(beam.releases);
  const [veren, setVeren] = useState<BeamEindVeren | undefined>(beam.veren);
  /** Begin- en eindmaten zolang de dialoogkeuze een geldig verloop oplevert. */
  const verlopendeMaten = verloopMaten({ material, profile, profileEnd });

  // ── Staaf op bedding ─────────────────────────────────────────────────────
  // Aan/uit plus k en b als tekst, zodat een leeg veld leeg kan blijven tot
  // OK; pas bij OK wordt er een `bedding` gezet of weggehaald.
  const [beddingAan, setBeddingAan] = useState(!!beam.bedding);
  const [beddingKStr, setBeddingKStr] = useState(beam.bedding?.k?.toString() ?? "50000");
  const [beddingBStr, setBeddingBStr] = useState(beam.bedding?.b?.toString() ?? "");
  const buildBedding = (): Beam["bedding"] => {
    if (!beddingAan) return undefined;
    const k = Number(beddingKStr.replace(",", "."));
    const b = Number(beddingBStr.replace(",", "."));
    if (!(k > 0) || !(b > 0)) return undefined;
    return { k, b };
  };

  // ── Toetsconfiguratie (Beam.checkConfig) ─────────────────────────────────
  // Getalvelden als string zodat "leeg" = builder-default kan blijven.
  const cfg0 = beam.checkConfig ?? {};
  const [lcyStr, setLcyStr] = useState(formatLength(cfg0.bucklingLengthY_m, "m"));
  const [lczStr, setLczStr] = useState(formatLength(cfg0.bucklingLengthZ_m, "m"));
  // Kipsteunafstand voor EN 1995-1-1 art. 6.3.3 (tabel 6.1 -> l_ef). Leeg =
  // staaflengte. Eigen veld, geen afgeleide van de kipsteunfracties: die zijn
  // per FLENS en horen bij het staalmodel.
  const [ltbStr, setLtbStr] = useState(formatLength(cfg0.ltbSupportSpacing_m, "m"));
  // Scheurfactor k_cr (6.13a). Leeg = 1,0, de NB-waarde bij 6.1.7 voor een
  // prismatische doorsnede; alleen een waarde in (0, 1] gaat het bestand in.
  const [kCrStr, setKCrStr] = useState(cfg0.kCr?.toString() ?? "");
  // Kiptoets art. 6.3.3 aan/uit. Uit = gedrukte rand doorgaand zijdelings
  // gesteund, k_crit = 1,0 (art. 6.3.3(5)); alleen `false` wordt bewaard.
  const [kiptoets, setKiptoets] = useState<boolean>(cfg0.performLtbCheck ?? true);
  // Kruislaaghout: k_def voor §7.2 met zijn bron. GEEN standaardwaarde — tabel
  // 3.2 kent geen rij voor kruislaaghout. Leeg = geen doorbuigingstoets, met
  // die reden in het rapport.
  const [cltKdefStr, setCltKdefStr] = useState(cfg0.cltKdef?.toString() ?? "");
  const [cltKdefBron, setCltKdefBron] = useState(cfg0.cltKdefBron ?? "");
  // Aangrijpingspunt van de belasting (tabel 6.1, voetnoot a); zwaartepunt =
  // geen correctie en wordt niet bewaard.
  const [ltbPositie, setLtbPositie] = useState<NonNullable<BeamCheckConfig["ltbLoadPosition"]>>(
    cfg0.ltbLoadPosition ?? "centreOfGravity",
  );
  const [restraintsStr, setRestraintsStr] = useState(
    cfg0.lateralRestraints?.join(", ") ?? "",
  );
  const [deflClass, setDeflClass] = useState<NonNullable<BeamCheckConfig["deflectionClass"]>>(
    cfg0.deflectionClass ?? "floor",
  );
  const [deflNStr, setDeflNStr] = useState(cfg0.deflectionLimitNumerator?.toString() ?? "");
  // Losse noemer voor w_add; leeg = de NB-waarde bij de klasse.
  const [deflAddNStr, setDeflAddNStr] = useState(
    cfg0.deflectionAddLimitNumerator?.toString() ?? "",
  );
  const [preCamberStr, setPreCamberStr] = useState(
    cfg0.preCamber_mm !== undefined && cfg0.preCamber_mm !== 0
      ? cfg0.preCamber_mm.toString() : "",
  );
  const [serviceClass, setServiceClass] = useState<1 | 2 | 3>(cfg0.serviceClass ?? 1);
  // Dwarsspanning voor de vergelijkspanning van een vrij materiaal. Leeg = 0:
  // een staafelement kent alleen N, V en M, dus σ_z kan alleen van de
  // gebruiker komen (bijvoorbeeld een oplegdruk).
  const [sigmaZStr, setSigmaZStr] = useState(
    cfg0.spanningSigmaZ !== undefined && cfg0.spanningSigmaZ !== 0
      ? String(cfg0.spanningSigmaZ)
      : "",
  );
  // "auto" = geen klasse opgegeven: de toetsing leidt de belastingduur per
  // UGT-combinatie af (EN 1995-1-1 3.1.3(2)). Een gekozen klasse is een
  // ondergrens. Een bestand zonder `loadDuration` opent dus als "auto".
  const [loadDuration, setLoadDuration] = useState<NonNullable<BeamCheckConfig["loadDuration"]> | "auto">(
    cfg0.loadDuration ?? "auto",
  );
  /**
   * De betonvelden van de toetsconfiguratie: wapeningskorf, milieuklasse,
   * constructieklasse, wapeningsstaal, stroken en staaldiagram.
   *
   * Ze staan hier als één blok in de state omdat `buildCheckConfig` de config
   * VAN NUL opbouwt. Alles wat deze dialoog niet kent zou daarmee verdwijnen —
   * en dat gebeurde: wie een betonstaaf dubbelklikte en op OK drukte, was zijn
   * wapeningskorf kwijt zonder melding. De profielkiezer hieronder schrijft in
   * deze state; OK zet hem terug.
   */
  const [betonCfg, setBetonCfg] = useState<
    Pick<
      BeamCheckConfig,
      | "betonKorf"
      | "betonMilieuklasse"
      | "betonConstructieklasse"
      | "betonStaalsoort"
      | "betonStroken"
      | "betonStaaltak"
      // §5.8: schoring, kniklengte, kruip en de twee keuzen van §9.5. Deze
      // dialoog TOONT het blok niet — dat doet het eigenschappenpaneel — maar
      // hij moet het wél bewaren. Zonder deze regel raakt wie een kolom
      // dubbelklikt en op OK drukt zijn ontwerpbesluit geschoord/ongeschoord
      // kwijt zonder melding, en meldt de toetsing daarna dat §5.8 niet is
      // getoetst. Precies de fout die hierboven al voor de korf beschreven
      // staat.
      | "betonKolom"
    >
  >({
    betonKorf: cfg0.betonKorf,
    betonMilieuklasse: cfg0.betonMilieuklasse,
    betonConstructieklasse: cfg0.betonConstructieklasse,
    betonStaalsoort: cfg0.betonStaalsoort,
    betonStroken: cfg0.betonStroken,
    betonStaaltak: cfg0.betonStaaltak,
    betonKolom: cfg0.betonKolom,
  });

  // Welke norm-velden tonen we? Live op het materiaal in de dialoog, zodat
  // wisselen van materiaal in het Algemeen-tabblad meteen doorwerkt.
  const isTimber = matchSupportedTimberGrade(material) !== null;
  // Vrij materiaal: geen norm, maar een toets op de vergelijkspanning.
  const vrij = parseVrijMateriaal(material);

  /**
   * Bouw een schone checkConfig: alleen expliciet ingevulde waarden; alles
   * op default → undefined zodat het Beam-object (en het projectbestand)
   * geen dode velden meesleept. Verborgen velden (bijv. de zeeg en de losse
   * w_add-noemer bij hout) behouden hun eerdere waarde — wisselen van
   * materiaal gooit geen configuratie weg.
   */
  const buildCheckConfig = (): BeamCheckConfig | undefined => {
    const cfg: BeamCheckConfig = {};
    const lcy = parseLength(lcyStr, "m");
    if (lcyStr.trim() !== "" && Number.isFinite(lcy) && lcy > 0) {
      cfg.bucklingLengthY_m = lcyStr === formatLength(cfg0.bucklingLengthY_m, "m")
        ? cfg0.bucklingLengthY_m : lcy;
    }
    const lcz = parseLength(lczStr, "m");
    if (lczStr.trim() !== "" && Number.isFinite(lcz) && lcz > 0) {
      cfg.bucklingLengthZ_m = lczStr === formatLength(cfg0.bucklingLengthZ_m, "m")
        ? cfg0.bucklingLengthZ_m : lcz;
    }
    const restraints = sanitizeRestraintFractions(parseRestraintInput(restraintsStr));
    if (restraints.length > 0) cfg.lateralRestraints = restraints;
    if (deflClass !== "floor") cfg.deflectionClass = deflClass;
    if (deflClass === "custom") {
      const n = parseFloat(deflNStr.replace(",", "."));
      if (Number.isFinite(n) && n > 0) cfg.deflectionLimitNumerator = n;
    }
    const addN = parseFloat(deflAddNStr.replace(",", "."));
    if (deflAddNStr.trim() !== "" && Number.isFinite(addN) && addN > 0) {
      cfg.deflectionAddLimitNumerator = addN;
    }
    const camber = parseFloat(preCamberStr.replace(",", "."));
    if (preCamberStr.trim() !== "" && Number.isFinite(camber) && camber !== 0) {
      cfg.preCamber_mm = camber;
    }
    // Onvoorwaardelijk, net als de zeeg hierboven: wie tijdelijk van
    // materiaal wisselt, hoort zijn kipsteunafstand niet kwijt te raken.
    const ltb = parseLength(ltbStr, "m");
    if (ltbStr.trim() !== "" && Number.isFinite(ltb) && ltb > 0) {
      cfg.ltbSupportSpacing_m = ltbStr === formatLength(cfg0.ltbSupportSpacing_m, "m") ? cfg0.ltbSupportSpacing_m : ltb;
    }
    // Ook onvoorwaardelijk (zie hierboven): de houtkeuzen blijven bewaard bij
    // een tijdelijke materiaalwissel. k_cr alleen binnen (0, 1] — daarbuiten
    // is het geen factor en schrijft de dialoog niets weg.
    const kCr = parseFloat(kCrStr.replace(",", "."));
    if (kCrStr.trim() !== "" && Number.isFinite(kCr) && kCr > 0 && kCr <= 1) {
      cfg.kCr = kCr;
    }
    // k_def voor kruislaaghout: een getal ≥ 0 en de bron gaan ONAFHANKELIJK
    // van elkaar het bestand in. Zo raakt niemand een half ingevulde opgave
    // kwijt; de kern weigert de toets zolang een van beide ontbreekt, en zegt
    // dan welke.
    const cltKdef = parseFloat(cltKdefStr.replace(",", "."));
    if (cltKdefStr.trim() !== "" && Number.isFinite(cltKdef) && cltKdef >= 0) {
      cfg.cltKdef = cltKdef;
    }
    if (cltKdefBron.trim() !== "") cfg.cltKdefBron = cltKdefBron.trim();
    if (!kiptoets) cfg.performLtbCheck = false;
    if (ltbPositie !== "centreOfGravity") cfg.ltbLoadPosition = ltbPositie;
    if (serviceClass !== 1) cfg.serviceClass = serviceClass;
    // Alleen een uitdrukkelijke keuze gaat het bestand in. Tot september 2026
    // werd "middellang" als standaard niet weggeschreven; zo'n bestand leest nu
    // als "automatisch". Wie middellang KIEST, krijgt het als ondergrens.
    if (loadDuration !== "auto") cfg.loadDuration = loadDuration;
    const sigmaZ = parseFloat(sigmaZStr.replace(",", "."));
    if (sigmaZStr.trim() !== "" && Number.isFinite(sigmaZ) && sigmaZ !== 0) {
      cfg.spanningSigmaZ = sigmaZ;
    }
    // De betonvelden gaan onveranderd mee; zie de toelichting bij `betonCfg`.
    for (const [k, v] of Object.entries(betonCfg)) {
      if (v !== undefined) (cfg as Record<string, unknown>)[k] = v;
    }
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  };

  const geldigeLengte = (text: string) => !text.trim() || parseLength(text) > 0;
  const lengtesGeldig = [lcyStr, lczStr, ...(isTimber ? [ltbStr] : [])].every(geldigeLengte);
  const handleConfirm = () => {
    if (!lengtesGeldig) return;
    onUpdate?.({
      material, profile, profileEnd,
      releases, veren, checkConfig: buildCheckConfig(), bedding: buildBedding(),
    });
    onClose();
  };

  /**
   * Staat er iets in deze dialoog dat nog niet op de staaf is gezet?
   *
   * Alles wat je hier invult blijft lokaal totdat je op OK drukt — ook de
   * profielwizard, die alleen `setMaterial`/`setProfile` doet. Wie een
   * profiel koos, in de regel "Profiel" netjes "HEB 200 — S235" zag staan en
   * daarna naast het kader klikte, verloor die toewijzing zonder melding: de
   * overlay beslaat het hele scherm en sloot meteen. In het rapport bleef het
   * oude profiel staan, terwijl de gebruiker het wel degelijk had toegewezen.
   */
  const huidigeInvoer = JSON.stringify({
    material, profile, profileEnd: profileEnd ?? null,
    releases, veren, cfg: buildCheckConfig() ?? null, bedding: buildBedding() ?? null,
  });
  const [beginInvoer] = useState(huidigeInvoer);
  const gewijzigd = huidigeInvoer !== beginInvoer;

  /**
   * Klik naast het kader. Is er niets veranderd, dan sluit de dialoog zoals
   * altijd; wacht er nog iets op OK, dan gebeurt er niets — een misklik hoort
   * geen werk weg te gooien. Weggooien kan nog steeds bewust, met × of
   * Annuleer. Er komt geen `window.confirm` aan te pas: die is in de
   * desktopschil niet betrouwbaar (App.tsx gebruikt hem alleen als
   * browser-terugval), en een dialoog die niet meer dicht kan is erger dan
   * de kwaal.
   */
  const overlayKlik = () => {
    if (!gewijzigd) onClose();
  };

  const nA = nodes.find(n => n.id === beam.from);
  const nB = nodes.find(n => n.id === beam.to);
  const length = nA && nB ? Math.hypot(nB.x - nA.x, nB.z - nA.z) : 0;
  const angle  = nA && nB ? (Math.atan2(nB.z - nA.z, nB.x - nA.x) * 180 / Math.PI) : 0;
  const systemLengthMm = formatLength(length);
  // L_cr,z die de kern gebruikt als het veld leeg blijft. Deze dialoog kent
  // alleen de bovenflenssteunen als tekstveld; de onderflenssteunen komen uit
  // de bestaande configuratie (het eigenschappenpaneel bewerkt ze).
  const voorspeldZ = voorspelKniklengte(undefined, length, {
    boven: sanitizeRestraintFractions(parseRestraintInput(restraintsStr)),
    onder: cfg0.lateralRestraintsBottom,
  });

  const deflClassOptions: Array<{ value: NonNullable<BeamCheckConfig["deflectionClass"]>; label: string }> = [
    { value: "floor",        label: t("cfg.deflFloor") },
    { value: "floorBrittle", label: t("cfg.deflFloorBrittle") },
    { value: "roof",         label: t("cfg.deflRoof") },
    { value: "cantilever",   label: t("cfg.deflCantilever") },
    { value: "custom",       label: t("cfg.deflCustom") },
  ];

  const durationOptions: Array<{ value: NonNullable<BeamCheckConfig["loadDuration"]> | "auto"; label: string }> = [
    { value: "auto",          label: t("cfg.durAuto", "Automatisch (per combinatie)") },
    { value: "permanent",     label: t("cfg.durPermanent") },
    { value: "long",          label: t("cfg.durLong") },
    { value: "medium",        label: t("cfg.durMedium") },
    { value: "short",         label: t("cfg.durShort") },
    { value: "instantaneous", label: t("cfg.durInstantaneous") },
  ];

  /** Gedeelde doorbuigingssectie (klasse + L/n; zeeg alleen voor staal). */
  const deflectionSection = (
    <div className="bar-props-section">
      <div className="bar-props-section-title">{t("cfg.deflectionTitle")}</div>
      <DialoogRij label={t("cfg.deflClass")} info={t("cfg.deflClassHint")}>
        <select
          className="bar-props-select"
          value={deflClass}
          onChange={(e) => setDeflClass(e.target.value as NonNullable<BeamCheckConfig["deflectionClass"]>)}
        >
          {deflClassOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </DialoogRij>
      {deflClass === "custom" && (
        <div className="bar-props-row">
          <span>{t("cfg.deflNumerator")}</span>
          <input
            type="number" className="bar-props-input" step="1" min="1"
            placeholder="333"
            value={deflNStr}
            onChange={(e) => setDeflNStr(e.target.value)}
          />
        </div>
      )}
      {deflClass === "custom" && isTimber && (
        <div className="bar-props-hint">{t("cfg.deflCustomTimberHint")}</div>
      )}
      {/* Losse w_add-noemer: alleen staal, want alleen de staalkern kent
          `deflection_add_limit_numerator`. De houtkern krijgt zijn noemers via
          timberDeflectionNumerators uit de klasse. */}
      {!isTimber && (
        <DialoogRij label={t("cfg.deflAddNumerator")} info={t("cfg.deflAddNumeratorHint")}>
          <input
            type="number" className="bar-props-input" step="1" min="1"
            placeholder="—"
            value={deflAddNStr}
            onChange={(e) => setDeflAddNStr(e.target.value)}
          />
        </DialoogRij>
      )}
      {!isTimber && (
        <DialoogRij label={t("cfg.preCamber")} info={t("cfg.preCamberHint")}>
          <input
            type="number" className="bar-props-input" step="1"
            placeholder="0"
            value={preCamberStr}
            onChange={(e) => setPreCamberStr(e.target.value)}
          />
        </DialoogRij>
      )}
    </div>
  );

  return (
    <div className="bar-props-overlay" onClick={overlayKlik}>
      <div className="bar-props-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="bar-props-header">
          <h2 className="bar-props-title">
            {t("barDialog.title", { id: beam.id })}
            {/* Zichtbaar dat er nog iets op OK wacht. */}
            {gewijzigd && <span className="bar-props-dirty" title={t("barDialog.unsaved")}> ●</span>}
          </h2>
          <button className="bar-props-close" onClick={onClose} aria-label={t("common:close")}>×</button>
        </div>

        <div className="bar-props-tabs">
          <button
            className={`bar-props-tab${tab === "general" ? " active" : ""}`}
            onClick={() => setTab("general")}
          >{t("barDialog.tabGeneral")}</button>
          <button
            className={`bar-props-tab${tab === "norm" ? " active" : ""}`}
            onClick={() => setTab("norm")}
          >{vrij ? t("barDialog.tabStress") : isTimber ? "EN 1995" : "EN 1993"}</button>
        </div>

        <div className="bar-props-body">
          {tab === "general" && (
            <>
              <div className="bar-props-section">
                <div className="bar-props-section-title">{t("barDialog.geometry")}</div>
                <div className="bar-props-row"><span>ID</span><code>{beam.id}</code></div>
                <div className="bar-props-row"><span>{t("barDialog.nodeA")}</span><code>{beam.from}</code></div>
                <div className="bar-props-row"><span>{t("barDialog.nodeB")}</span><code>{beam.to}</code></div>
                <div className="bar-props-row"><span>{t("barDialog.length")}</span><code>{formatLength(length)} mm</code></div>
                <div className="bar-props-row"><span>{t("barDialog.angle")}</span><code>{angle.toFixed(1)}°</code></div>
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">{t("barDialog.crossSection")}</div>
                {/* Profiel en materiaal zijn één combinatie — de wizard
                    (ProfielKiezer) vervangt de losse invoervelden. */}
                <div className="bar-props-row">
                  <span>{t("barDialog.profile")}</span>
                  <code>{doorsnedeNaamVertaald({ material, profile, profileEnd }, t)} — {material}</code>
                </div>
                {/* Begin en eind apart, met de maten erbij — alleen bij een
                    staaf die werkelijk verloopt. */}
                {verlopendeMaten && (
                  <>
                    <div className="bar-props-row">
                      <span>{t("barDialog.startNodeA")}</span>
                      <code>
                        h = {verlopendeMaten.begin.h} mm, b = {verlopendeMaten.begin.b} mm
                      </code>
                    </div>
                    <div className="bar-props-row">
                      <span>{t("barDialog.endNodeB")}</span>
                      <code>
                        h = {verlopendeMaten.eind.h} mm, b = {verlopendeMaten.eind.b} mm
                      </code>
                    </div>
                  </>
                )}
                <div className="bar-props-row">
                  <span></span>
                  <button
                    className="bar-props-btn-secondary"
                    onClick={() => setKiezerOpen(true)}
                    title={t("barDialog.chooseProfileTitle")}
                  >
                    {t("barDialog.chooseProfile")}
                  </button>
                </div>
                {kiezerOpen && (
                  <ProfielKiezer
                    open
                    onClose={() => setKiezerOpen(false)}
                    huidig={{ material, profile, profileEnd }}
                    huidigBeton={{
                      korf: betonCfg.betonKorf,
                      milieuklasse: betonCfg.betonMilieuklasse ?? null,
                      constructieklasse: betonCfg.betonConstructieklasse ?? null,
                    }}
                    inGebruik={beams ? profielenInGebruik(beams) : undefined}
                    onApply={(keuze) => {
                      setMaterial(keuze.material);
                      setProfile(keuze.profile);
                      // `profileEnd` komt ALTIJD mee uit de wizard, ook als
                      // `undefined`: wie een prismatisch profiel kiest op een
                      // staaf die verliep, hoort dat verloop kwijt te raken.
                      setProfileEnd(keuze.profileEnd);
                      if (keuze.beton) {
                        setBetonCfg((c) => ({
                          ...c,
                          betonKorf: keuze.beton!.korf,
                          betonMilieuklasse: keuze.beton!.milieuklasse ?? undefined,
                          betonConstructieklasse:
                            keuze.beton!.constructieklasse ?? undefined,
                        }));
                      }
                    }}
                  />
                )}
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">{t("barDialog.connections")}</div>
                <table className="bar-props-release-table">
                  <tbody>
                    <tr>
                      <td>{t("barDialog.startA")}</td>
                      <td>
                        <AansluitingKeuze zijde="start" releases={releases} veren={veren}
                          onChange={(w) => { setReleases(w.releases); setVeren(w.veren); }} />
                      </td>
                    </tr>
                    <tr>
                      <td>{t("barDialog.endB")}</td>
                      <td>
                        <AansluitingKeuze zijde="end" releases={releases} veren={veren}
                          onChange={(w) => { setReleases(w.releases); setVeren(w.veren); }} />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="bar-props-hint">
                  {t("barDialog.connectionsHint")}
                </div>
              </div>

              <div className="bar-props-section">
                <div className="bar-props-section-title">{t("barDialog.foundation")}</div>
                <label className="bar-props-hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={beddingAan}
                    onChange={(e) => setBeddingAan(e.target.checked)} />
                  {t("barDialog.foundationToggle")}
                </label>
                {beddingAan && (
                  <table className="bar-props-release-table">
                    <tbody>
                      <tr>
                        <td>{t("barDialog.foundationModulus")}</td>
                        <td>
                          <input type="text" inputMode="decimal" value={beddingKStr} style={{ width: 90 }}
                            onChange={(e) => setBeddingKStr(e.target.value)} />
                        </td>
                        <td>kN/m³</td>
                      </tr>
                      <tr>
                        <td>{t("barDialog.contactWidth")}</td>
                        <td>
                          <input type="text" inputMode="decimal" value={beddingBStr} style={{ width: 90 }}
                            placeholder={t("barDialog.contactWidthPlaceholder")}
                            onChange={(e) => setBeddingBStr(e.target.value)} />
                        </td>
                        <td>mm</td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <div className="bar-props-hint">
                  {beddingAan && !buildBedding()
                    ? t("barDialog.foundationIncomplete")
                    : t("barDialog.foundationHint")}
                </div>
              </div>

              {beamForces && (
                <div className="bar-props-section">
                  <div className="bar-props-section-title">{t("barDialog.forces")}</div>
                  <div className="bar-props-row"><span>N</span><code>{(beamForces.N / 1000).toFixed(2)} kN</code></div>
                  <div className="bar-props-row"><span>V</span><code>{(beamForces.V / 1000).toFixed(2)} kN</code></div>
                  <div className="bar-props-row"><span>M_start</span><code>{(beamForces.M_start / 1e6).toFixed(2)} kNm</code></div>
                  <div className="bar-props-row"><span>M_end</span><code>{(beamForces.M_end / 1e6).toFixed(2)} kNm</code></div>
                </div>
              )}
            </>
          )}

          {tab === "norm" && (
            <>
              <div className="bar-props-section">
                <div className="bar-props-section-title">{t("barDialog.materialAndSection")}</div>
                <div className="bar-props-row"><span>{t("barDialog.material")}</span><code>{material}</code></div>
                <div className="bar-props-row"><span>{t("barDialog.profile")}</span><code>{doorsnedeNaamVertaald({ material, profile, profileEnd }, t)}</code></div>
                <div className="bar-props-row">
                  <span>{t("barDialog.standard")}</span>
                  <code>
                    {vrij
                      ? t("barDialog.standardNone")
                      : isTimber ? "NEN-EN 1995-1-1" : "NEN-EN 1993-1-1"}
                  </code>
                </div>
              </div>

              {vrij && (
                <div className="bar-props-section">
                  <div className="bar-props-section-title">{t("barDialog.equivalentStress")}</div>
                  <div className="bar-props-row">
                    <span>f_toel</span>
                    <code>
                      {vrij.fToel} N/mm² · γ_M = {vrij.gammaM} → f_d ={" "}
                      {(vrij.fToel / vrij.gammaM).toFixed(2)} N/mm²
                    </code>
                  </div>
                  <DialoogRij label="σ_z [N/mm²]" info={t("barDialog.sigmaZHint")}>
                    <input
                      type="number" className="bar-props-input" step="1"
                      placeholder="0"
                      value={sigmaZStr}
                      onChange={(e) => setSigmaZStr(e.target.value)}
                    />
                  </DialoogRij>
                </div>
              )}

              {/* Kniklengtes: staal EN hout. Stond tot september 2026 achter
                  "niet hout", omdat de houtbuilder de velden niet las —
                  schijninvoer vermijden. Die reden is vervallen: de EN
                  1995-kern gebruikt beide assen echt
                  (nen-en-1995-1-1/src/stability.rs, art. 6.3.2 verg. (6.21)/
                  (6.22) → k_c,y en k_c,z in (6.23)/(6.24); L_cr,z ook in de
                  drukterm van de kiptoets (6.35)).
                  De kipsteunen hieronder blijven staal-alleen: fracties per
                  flens waar de staalkern op rekent, terwijl EN 1995 art. 6.3.3
                  één kipsteunafstand vraagt (tabel 6.1 → l_ef). Hout krijgt
                  daarvoor een eigen veld in het houtblok hieronder; afleiden
                  uit de flensfracties zou l_ef stilzwijgend verkleinen. */}
              <div className="bar-props-section">
                <div className="bar-props-section-title">{t("cfg.bucklingTitle")}</div>
                {/* In het vlak / uit het vlak in het label, zodat y en z niet
                    te verwisselen zijn; de placeholder is wat de kern gaat
                    gebruiken als het veld leeg blijft (lib/kniklengte.ts). */}
                <div className="bar-props-row">
                  <span>{t("cfg.bucklingInPlane")}</span>
                  <input
                    type="text" inputMode="decimal" className="bar-props-input"
                    placeholder={systemLengthMm}
                    value={lcyStr} aria-invalid={!geldigeLengte(lcyStr)}
                    onChange={(e) => setLcyStr(e.target.value)}
                  />
                </div>
                <DialoogRij
                  label={t("cfg.bucklingOutOfPlane")}
                  info={<>
                    {t("cfg.bucklingOutOfPlaneHint")}{" "}
                    {t("cfg.bucklingHint")}
                    {/* Inline terugval-tekst: zonder terugval zou i18next de
                        kale sleutelnaam tonen als een taal hem mist. */}
                    {isTimber && ` ${t(
                      "cfg.bucklingHintTimber",
                      "Bij hout telt L_cr,z ook mee in de drukterm van de kiptoets (6.35).",
                    )}`}
                  </>}
                >
                  <input
                    type="text" inputMode="decimal" className="bar-props-input"
                    placeholder={formatLength(voorspeldZ.lCrMm)}
                    value={lczStr} aria-invalid={!geldigeLengte(lczStr)}
                    onChange={(e) => setLczStr(e.target.value)}
                  />
                </DialoogRij>
                <div className="bar-props-hint">
                  {t("cfg.bucklingEmptyIs", {
                    waarde: formatLength(voorspeldZ.lCrMm),
                    herkomst:
                      voorspeldZ.herkomst === HERKOMST_KIPSTEUNEN
                        ? t("cfg.herkomstKipsteunen")
                        : t("cfg.herkomstStaaflengte"),
                  })}
                </div>
              </div>

              {!isTimber && (
                <div className="bar-props-section">
                  <div className="bar-props-section-title">{t("cfg.bracingTitle")}</div>
                  <DialoogRij label={t("cfg.bracingLabel")} info={t("cfg.bracingHint")}>
                    <input
                      type="text" className="bar-props-input"
                      placeholder="0.25, 0.5, 0.75"
                      value={restraintsStr}
                      onChange={(e) => setRestraintsStr(e.target.value)}
                      spellCheck={false}
                    />
                  </DialoogRij>
                </div>
              )}

              {isTimber && (
                <div className="bar-props-section">
                  <div className="bar-props-section-title">{t("cfg.timberTitle")}</div>
                  <DialoogRij label={t("cfg.serviceClass")} info={t("cfg.timberHint")}>
                    <select
                      className="bar-props-select"
                      value={serviceClass}
                      onChange={(e) => setServiceClass(Number(e.target.value) as 1 | 2 | 3)}
                    >
                      <option value={1}>{t("cfg.sc1")}</option>
                      <option value={2}>{t("cfg.sc2")}</option>
                      <option value={3}>{t("cfg.sc3")}</option>
                    </select>
                  </DialoogRij>
                  <DialoogRij
                    label={t("cfg.loadDuration")}
                    info={t(
                      "cfg.durHint",
                      "Automatisch: k_mod volgt per UGT-combinatie uit de kortstdurende belasting (EN 1995-1-1 3.1.3(2)). Een gekozen klasse werkt als ondergrens: zij kan de duur alleen verlengen.",
                    )}
                  >
                    <select
                      className="bar-props-select"
                      value={loadDuration}
                      onChange={(e) => setLoadDuration(e.target.value as typeof loadDuration)}
                    >
                      {durationOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </DialoogRij>
                  {/* Inline terugval-teksten, net als bij bucklingHintTimber:
                      zonder terugval zou i18next de kale sleutelnaam tonen als
                      een taal hem mist. */}
                  <DialoogRij
                    label={t("cfg.ltbSupportSpacing", "Kipsteunafstand (mm)")}
                    info={t(
                      "cfg.ltbSupportSpacingHint",
                      "Kipsteunafstand leeg = staaflengte. Dit is de ℓ waaruit tabel 6.1 de meewerkende lengte l_ef maakt; l_ef bepaalt σ_m,crit en daarmee k_crit (6.33)/(6.35).",
                    )}
                  >
                    <input
                      type="text" inputMode="decimal" className="bar-props-input"
                      placeholder={systemLengthMm}
                      value={ltbStr} aria-invalid={!geldigeLengte(ltbStr)}
                      onChange={(e) => setLtbStr(e.target.value)}
                    />
                  </DialoogRij>
                  {/* Aangrijpingspunt (tabel 6.1, voetnoot a), kiptoets aan/uit
                      (art. 6.3.3(5)) en scheurfactor k_cr (6.13a). Inline
                      terugval-teksten, net als hierboven: de sleutels staan nog
                      niet in de check.json-bestanden onder i18n/locales. */}
                  <div className="bar-props-row">
                    <span>{t("cfg.ltbLoadPosition", "Aangrijpingspunt belasting")}</span>
                    <select
                      className="bar-props-select"
                      value={ltbPositie}
                      onChange={(e) => setLtbPositie(e.target.value as typeof ltbPositie)}
                    >
                      <option value="centreOfGravity">{t("cfg.ltbPosCentroid", "Zwaartepunt (geen correctie)")}</option>
                      <option value="compressionEdge">{t("cfg.ltbPosCompression", "Drukzijde (l_ef + 2h)")}</option>
                      <option value="tensionEdge">{t("cfg.ltbPosTension", "Trekzijde (l_ef − 0,5h)")}</option>
                    </select>
                  </div>
                  <label className="bar-props-hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={kiptoets}
                      onChange={(e) => setKiptoets(e.target.checked)} />
                    {t("cfg.performLtbCheck", "Kiptoets (art. 6.3.3) uitvoeren")}
                  </label>
                  {!kiptoets && (
                    <div className="bar-props-hint" role="note">
                      {t(
                        "cfg.performLtbCheckOffHint",
                        "Kiptoets uit: u verklaart dat de gedrukte rand over de volle lengte zijdelings gesteund is (dakbeschot, vloerplaat) en de opleggingen torsievast zijn, zodat k_crit = 1,0 (art. 6.3.3(5)). Die aanname komt zo in het rapport te staan.",
                      )}
                    </div>
                  )}
                  <DialoogRij
                    label={t("cfg.kCr", "Scheurfactor k_cr (6.1.7)")}
                    info={t(
                      "cfg.kCrHint",
                      "b_ef = k_cr · b (6.13a). Leeg = 1,0: NEN-EN 1995-1-1/NB bij 6.1.7 voor een prismatische doorsnede. De Europese aanbeveling van 6.1.7(2) is 0,67 voor gezaagd en gelijmd gelamineerd hout; alleen waarden in (0, 1] worden bewaard.",
                    )}
                  >
                    <input
                      type="number" className="bar-props-input" step="0.01" min="0.01" max="1"
                      placeholder="1,00"
                      value={kCrStr}
                      onChange={(e) => setKCrStr(e.target.value)}
                    />
                  </DialoogRij>
                  {isCltProfiel(profile) && (
                    <>
                      <DialoogRij
                        label={t("cfg.cltKdef", "k_def kruislaaghout (§7.2)")}
                        info={t(
                          "cfg.cltKdefHint",
                          "Tabel 3.2 van EN 1995-1-1 kent geen k_def voor kruislaaghout, en de nationale bijlage voegt er geen toe. Er wordt daarom geen waarde aangenomen: vul k_def én de bron in (ETA of productverklaring van de plaat, bij deze klimaatklasse). Ontbreekt een van beide, dan worden w_fin en w_add niet getoetst en staat die reden in het rapport.",
                        )}
                      >
                        <input
                          type="number" className="bar-props-input" step="0.05" min="0"
                          placeholder={t("cfg.cltKdefLeeg", "verplicht")}
                          value={cltKdefStr}
                          onChange={(e) => setCltKdefStr(e.target.value)}
                        />
                      </DialoogRij>
                      <div className="bar-props-row">
                        <span>{t("cfg.cltKdefBron", "Bron k_def")}</span>
                        <input
                          type="text" className="bar-props-input"
                          placeholder={t("cfg.cltKdefBronLeeg", "ETA / productverklaring")}
                          value={cltKdefBron}
                          onChange={(e) => setCltKdefBron(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {deflectionSection}

              <div className="bar-props-section">
                <div className="bar-props-section-title">{t("barDialog.checkTitle")}</div>
                {memberResult ? (
                  <>
                    <table className="bar-props-uc-table">
                      <thead><tr><th>{t("barDialog.checkColumn")}</th><th>UC</th><th>{t("barDialog.statusColumn")}</th></tr></thead>
                      <tbody>
                        {memberResult.checks.map((named) => {
                          const calc = named.kind.data;
                          const uc = calc.uc?.uc ?? null;
                          const status = calc.status;
                          return (
                            <tr key={named.id}>
                              <td>{calc.title} ({calc.article})</td>
                              <td>{uc !== null ? uc.toFixed(2) : "—"}</td>
                              <td className={
                                status === "Ok" ? "bar-props-uc-ok" :
                                status === "NotOk" ? "bar-props-uc-notok" : "bar-props-uc-pending"
                              }>
                                {status === "Ok" ? `✓ ${t("statusOk")}` : status === "NotOk" ? `✗ ${t("statusNotOk")}` : t("statusNa")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="bar-props-hint">
                      {t("barDialog.governingLine", { toets: memberResult.governing_check_id, uc: memberResult.uc_max.toFixed(2) })}
                    </div>
                    {(isTimber === isSteelCheckResult(memberResult)) && (
                      <div className="bar-props-hint">{t("cfg.staleResultHint")}</div>
                    )}
                  </>
                ) : (
                  <div className="bar-props-hint">
                    {t("barDialog.notChecked")}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="bar-props-footer">
          {gewijzigd && (
            <span className="bar-props-dirty-hint">
              {t("barDialog.unsaved")}
            </span>
          )}
          <button className="bar-props-btn-secondary" onClick={onClose}>{t("barDialog.cancel")}</button>
          <button className="bar-props-btn-primary" disabled={!lengtesGeldig} onClick={handleConfirm}>{t("common:ok")}</button>
        </div>
      </div>
    </div>
  );
}
