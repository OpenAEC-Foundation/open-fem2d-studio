/**
 * BetonKorfPaneel — wapeningskorf kiezen, zien en het M-N-κ-diagram erbij.
 *
 * Links de editor, rechts de doorsnedetekening met de kerngetallen (A_s, d,
 * f_cd, f_yd, N_Rd) en daaronder het M-κ-diagram bij de opgegeven N_Ed.
 * Het diagram komt uit de rekenkern (opdracht `concrete_mn_kappa`); na elke
 * wijziging wordt het met een korte vertraging opnieuw opgevraagd, en een
 * verouderd antwoord wordt genegeerd.
 *
 * Aangesloten op de staafeigenschappen: FemProperties monteert dit paneel op
 * het tabblad "Norm" van een betonstaaf, geeft de opgeslagen korf mee als
 * `initieel` en schrijft elke `onChange` terug naar `beam.checkConfig`
 * (doorsnede en betonklasse landen op `profile`/`material`). De check-store
 * leest die velden weer bij het toetsen.
 *
 * Het interactiediagram wordt hier bewust NIET opgevraagd
 * (`interaction_points: 0`): het paneel is voor het kiezen van een korf, en
 * elke toetsaanslag zou anders 21 extra M-κ-diagrammen kosten. Het rapport
 * tekent het interactiediagram wél — dat gebruikt de omhullende die
 * `check_concrete_beam` al berekent.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { vertaal } from "../../lib/vertaalbareTekst";
import type { ConcreteClass } from "../../lib/types/concrete/ConcreteClass";
import type { ExposureClassInfo } from "../../lib/types/concrete/ExposureClassInfo";
import type { ReinforcementGrade } from "../../lib/types/concrete/ReinforcementGrade";
import type { MnKappaRequest } from "../../lib/types/concrete/MnKappaRequest";
import type { MnKappaResponse } from "../../lib/types/concrete/MnKappaResponse";
import { STANDAARD_BIJLAGE } from "../../lib/normAanduidingen";
import DoorsnedeTekening from "./DoorsnedeTekening";
import MNKappaGrafiek from "./MNKappaGrafiek";
import WapeningskorfEditor from "./WapeningskorfEditor";
import {
  berekenMnKappa,
  haalBetonklassen,
  haalMilieuklassen,
  haalWapeningsstaal,
} from "./betonKern";
import {
  STANDAARD_KORF,
  controleerKorfMelding,
  korfSamenvatting,
  nl,
  nuttigeHoogteMm,
  rijBreedteMm,
  heeftZijstaven,
  rijOppervlakMm2,
  totaleWapeningMm2,
  zijstavenOppervlakMm2,
  vrijeStaafafstandMm,
  type Wapeningskorf,
} from "./wapeningskorf";
import "./beton.css";

interface Props {
  /** Startwaarde; ontbreekt → STANDAARD_KORF. */
  initieel?: Partial<Wapeningskorf>;
  /** Elke wijziging van de korf. */
  onChange?: (korf: Wapeningskorf) => void;
  /** Rekenmoment ter vergelijking in de grafiek, kNm. */
  mEdKnm?: number;
  /** Normaalkracht waarmee het diagram start, kN (druk negatief). */
  nEdKnInitieel?: number;
  /** Aanroep van de kern; standaard `berekenMnKappa` (Tauri of dev-brug). */
  berekenDiagram?: (verzoek: MnKappaRequest) => Promise<MnKappaResponse>;
}

const VERTRAGING_MS = 250;

export default function BetonKorfPaneel({
  initieel,
  onChange,
  mEdKnm,
  nEdKnInitieel = 0,
  berekenDiagram = berekenMnKappa,
}: Props) {
  const { t } = useTranslation("check");
  const [korf, setKorf] = useState<Wapeningskorf>({ ...STANDAARD_KORF, ...initieel });
  const [nEd, setNEd] = useState<number>(nEdKnInitieel);
  const [betonklassen, setBetonklassen] = useState<ConcreteClass[] | undefined>(undefined);
  const [staalsoorten, setStaalsoorten] = useState<ReinforcementGrade[] | undefined>(undefined);
  const [milieuklassen, setMilieuklassen] = useState<ExposureClassInfo[] | undefined>(undefined);
  const [antwoord, setAntwoord] = useState<MnKappaResponse | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const volgnummer = useRef(0);

  // Materiaaltabellen één keer ophalen; zonder kern blijven de namen over.
  // NIET STIL: een kern die niet bereikbaar is (webversie zonder dev-brug)
  // liet de keuzelijsten leeg zonder te zeggen waarom. De reden komt nu in
  // het paneel te staan, naast de rekenfout.
  const [lijstFout, setLijstFout] = useState<string | null>(null);
  useEffect(() => {
    let actief = true;
    const meld = (e: unknown) => {
      if (actief) setLijstFout(e instanceof Error ? e.message : String(e));
    };
    haalBetonklassen().then((k) => actief && setBetonklassen(k)).catch(meld);
    haalWapeningsstaal().then((g) => actief && setStaalsoorten(g)).catch(meld);
    haalMilieuklassen().then((m) => actief && setMilieuklassen(m)).catch(meld);
    return () => {
      actief = false;
    };
  }, []);

  const geometrieMelding = useMemo(() => controleerKorfMelding(korf), [korf]);
  const geometrieFout = geometrieMelding ? vertaal(t, geometrieMelding) : null;

  // Diagram opvragen, met vertraging en bescherming tegen verouderde antwoorden.
  useEffect(() => {
    const nummer = ++volgnummer.current;
    setAntwoord(null);
    setFout(null);
    setBezig(false);
    if (geometrieFout) {
      return;
    }
    const timer = window.setTimeout(() => {
      setBezig(true);
      const verzoek: MnKappaRequest = {
        // Het diagram in dit paneel is een voorvertoning terwijl de gebruiker
        // de korf invult; het paneel kent de projectinstellingen niet en houdt
        // de enige gevulde bijlage aan (zelfde afspraak als de dekkingstoets in
        // KorfVelden). De TOETSING zelf krijgt de bijlage van het project.
        bijlage: STANDAARD_BIJLAGE,
        section: korf.doorsnede,
        concrete_class: korf.betonklasse,
        reinforcement_grade: korf.staalsoort,
        cage: korf.korf,
        n_ed_kn: nEd,
        moment_sign: mEdKnm !== undefined && mEdKnm < 0 ? -1 : 1,
        n_strips: korf.aantalStroken,
        steel_branch: korf.staaltak,
        design_situation: "PersistentTransient",
        interaction_points: 0,
      };
      berekenDiagram(verzoek)
        .then((r) => {
          if (nummer !== volgnummer.current) return;
          setAntwoord(r);
          setFout(null);
        })
        .catch((e: unknown) => {
          if (nummer !== volgnummer.current) return;
          setAntwoord(null);
          setFout(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (nummer === volgnummer.current) setBezig(false);
        });
    }, VERTRAGING_MS);
    return () => {
      window.clearTimeout(timer);
      // Ook een al verstuurd verzoek vervalt bij nieuwe invoer of unmount.
      ++volgnummer.current;
    };
  }, [korf, nEd, mEdKnm, geometrieFout, berekenDiagram]);

  const wijzig = (k: Wapeningskorf) => {
    setKorf(k);
    onChange?.(k);
  };

  const aOnder = rijOppervlakMm2(korf.korf.bottom);
  const aBoven = rijOppervlakMm2(korf.korf.top);
  // De zijstaven van een KOLOMkorf. A_s,opzij is die van BEIDE zijkanten
  // samen, want het ingevoerde aantal geldt per zijkant. A_s,tot is wat
  // §9.5.2(2) "de totale hoeveelheid langswapening" noemt — het getal waarmee
  // A_s,min en A_s,max worden getoetst.
  const heeftZij = heeftZijstaven(korf.korf);
  const aZij = zijstavenOppervlakMm2(korf.korf);
  const aTotaal = totaleWapeningMm2(korf.korf);
  const d = nuttigeHoogteMm(korf.korf, korf.doorsnede.h_mm);
  // Het wapeningspercentage van de trekwapening rekent met de breedte waarin
  // die wapening LIGT — bij een T-lijf dus b_w en niet de flensbreedte, anders
  // komt er een ρ uit die tien keer te laag is.
  const bOnder = rijBreedteMm(korf, "onder");
  const bBoven = rijBreedteMm(korf, "boven");
  const rho = bOnder > 0 && d > 0 ? (aOnder / (bOnder * d)) * 100 : 0;
  const vrijOnder = vrijeStaafafstandMm(korf.korf, korf.korf.bottom, bOnder);
  const vrijBoven = vrijeStaafafstandMm(korf.korf, korf.korf.top, bBoven);
  const diagram = antwoord?.diagram ?? null;

  return (
    <div className="beton-paneel-container">
    <div className="beton-paneel">
      <div className="beton-kolom-invoer">
        <WapeningskorfEditor
          waarde={korf}
          onChange={wijzig}
          nEdKn={nEd}
          onNEdChange={setNEd}
          betonklassen={betonklassen}
          staalsoorten={staalsoorten}
          milieuklassen={milieuklassen}
        />
        {geometrieFout && <div className="beton-fout" role="alert">{geometrieFout}</div>}
      </div>

      <div className="beton-kolom-uitvoer">
        <div className="beton-tekening-blok">
          <DoorsnedeTekening korf={korf} className="beton-tekening" />
          <dl className="beton-kerngetallen">
            <dt>{t("concrete.cagePanel.cage")}</dt>
            <dd>{korfSamenvatting(korf.korf)}</dd>
            <dt>A<sub>{t("concrete.cagePanel.asBottomSub")}</sub></dt>
            <dd>{nl(aOnder, 0)} mm² (ρ = {nl(rho, 2)} %)</dd>
            <dt>A<sub>{t("concrete.cagePanel.asTopSub")}</sub></dt>
            <dd>{nl(aBoven, 0)} mm²</dd>
            {heeftZij && (
              <>
                <dt>A<sub>{t("concrete.cagePanel.asSidesSub")}</sub></dt>
                <dd>{t("concrete.cagePanel.bothSidesArea", { a: nl(aZij, 0) })}</dd>
                <dt>A<sub>s,tot</sub></dt>
                <dd>{nl(aTotaal, 0)} mm²</dd>
              </>
            )}
            <dt>d</dt>
            <dd>{nl(d, 0)} mm</dd>
            {vrijOnder !== null && (
              <>
                <dt>{t("concrete.cagePanel.clearSpacingBottom")}</dt>
                <dd className={vrijOnder < 20 ? "beton-waarschuwing" : undefined}>{nl(vrijOnder, 0)} mm</dd>
              </>
            )}
            {vrijBoven !== null && (
              <>
                <dt>{t("concrete.cagePanel.clearSpacingTop")}</dt>
                <dd className={vrijBoven < 20 ? "beton-waarschuwing" : undefined}>{nl(vrijBoven, 0)} mm</dd>
              </>
            )}
            {antwoord && (
              <>
                <dt>f<sub>cd</sub> / f<sub>yd</sub></dt>
                <dd>{nl(antwoord.f_cd_mpa, 1)} / {nl(antwoord.f_yd_mpa, 1)} N/mm²</dd>
                <dt>N<sub>Rd</sub> {t("concrete.cagePanel.compressionTension")}</dt>
                <dd>{nl(antwoord.n_rd_compression_kn, 0)} / {nl(antwoord.n_rd_tension_kn, 0)} kN</dd>
              </>
            )}
          </dl>
        </div>

        <div className="beton-grafiek-blok">
          <div className="beton-grafiek-kop">
            <span>{t("concrete.cagePanel.diagramAt")}<sub>Ed</sub> = {nl(nEd, 0)} kN</span>
            {bezig && <span className="beton-bezig">{t("concrete.cagePanel.calculating")}</span>}
          </div>
          <MNKappaGrafiek diagram={diagram} mEdKnm={mEdKnm} className="beton-grafiek" />
          {diagram && diagram.points.length > 1 && (
            <div className="beton-grafiek-samenvatting">
              M<sub>Rd</sub> = <strong>{nl(diagram.m_max_knm, 1)} kNm</strong> {t("concrete.cagePanel.at")} κ<sub>u</sub> = {nl(diagram.kappa_u_per_m * 1e3, 2)}·10⁻³/m,
              x<sub>u</sub> = {nl(diagram.x_u_mm, 0)} mm, ε<sub>c</sub> = {nl(diagram.eps_c_u * 1e3, 2)} ‰, ε<sub>s</sub> = {nl(diagram.eps_s_u * 1e3, 1)} ‰
              {diagram.m_y_knm !== null && diagram.kappa_y_per_m !== null && (
                <> · {t("concrete.cagePanel.yieldingAt")}<sub>y</sub> = {nl(diagram.m_y_knm, 1)} kNm, κ<sub>y</sub> = {nl(diagram.kappa_y_per_m * 1e3, 2)}·10⁻³/m</>
              )}
              {mEdKnm !== undefined && Math.abs(mEdKnm) > 0 && diagram.m_max_knm > 0 && (
                <> · UC = <strong>{nl(Math.abs(mEdKnm) / diagram.m_max_knm, 2)}</strong></>
              )}
            </div>
          )}
          {diagram && diagram.points.length <= 1 && (
            <div className="beton-fout" role="alert">
              {diagram.failure_mode === "AxialCapacityExceeded"
                ? t("concrete.cagePanel.noEquilibriumAxial", {
                    druk: nl(antwoord?.n_rd_compression_kn ?? 0, 0),
                    trek: nl(antwoord?.n_rd_tension_kn ?? 0, 0),
                  })
                : t("concrete.cagePanel.noEquilibrium")}
            </div>
          )}
          {fout && <div className="beton-fout" role="alert">{t("concrete.cagePanel.engineError", { fout })}</div>}
          {lijstFout && (
            <div className="beton-fout" role="alert">
              {t("concrete.cagePanel.classListsNotLoaded", { fout: lijstFout })}
            </div>
          )}
          {diagram && diagram.points.length > 1 && (
            <details className="beton-tabel">
              <summary>{t("concrete.cagePanel.diagramValues")}</summary>
              <table>
                <thead>
                  <tr>
                    <th>κ [10⁻³/m]</th>
                    <th>M [kNm]</th>
                    <th>ε<sub>c</sub> [‰]</th>
                    <th>x [mm]</th>
                  </tr>
                </thead>
                <tbody>
                  {diagram.points
                    .filter((_, i, arr) => i % 6 === 0 || i === arr.length - 1)
                    .map((p, i) => (
                      <tr key={i}>
                        <td>{nl(p.kappa_per_m * 1e3, 2)}</td>
                        <td>{nl(p.m_knm, 1)}</td>
                        <td>{nl(Math.max(p.eps_top, p.eps_bottom) * 1e3, 2)}</td>
                        <td>{nl(p.x_mm, 0)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
