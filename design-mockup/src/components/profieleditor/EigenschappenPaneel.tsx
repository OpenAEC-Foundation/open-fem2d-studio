/**
 * EigenschappenPaneel — de doorsnede-eigenschappen uit de motor, live.
 *
 * Alles wat hier staat komt uit `MotorUitvoer`; de enige TypeScript-getallen
 * zijn de schatting van A (en zwaartepunt) die getoond wordt zolang de
 * motor nog geen antwoord heeft gegeven — en die staat er nadrukkelijk als
 * schatting bij. Niet-bepaalde grootheden (Wpl bij catalogusdelen, Iw bij
 * gesloten of losse doorsneden) heten hier nb, geen nul.
 */
import { useTranslation } from "react-i18next";
import { fmtGroep, fmtMaat, fmtMacht } from "../../lib/profieleditor/format";
import type { SnelleSchatting } from "../../lib/profieleditor/geometrie";
import type { MotorUitvoer } from "../../lib/profieleditor/types";

interface Props {
  uitvoer: MotorUitvoer | null;
  verouderd: boolean;
  bezig: boolean;
  fout: string | null;
  schatting: SnelleSchatting;
}

function Rij({ label, waarde, eenheid, titel }: { label: string; waarde: string; eenheid?: string; titel?: string }) {
  const { t } = useTranslation("check");
  const nietBepaald = waarde === t("profileEditor.properties.notDetermined");
  return (
    <tr title={titel}>
      <th scope="row">{label}</th>
      <td className={nietBepaald ? "pe-niet-bepaald" : undefined}>
        {waarde}
        {!nietBepaald && eenheid ? <span className="pe-eenheid"> {eenheid}</span> : null}
      </td>
    </tr>
  );
}

function Groep({ titel }: { titel: string }) {
  return (
    <tr className="pe-groep">
      <th colSpan={2}>{titel}</th>
    </tr>
  );
}

export default function EigenschappenPaneel({ uitvoer, verouderd, bezig, fout, schatting }: Props) {
  const { t } = useTranslation("check");
  const nb = t("profileEditor.properties.notDetermined");
  const status = fout
    ? null
    : bezig
      ? t("profileEditor.properties.engineBusy")
      : verouderd
        ? t("profileEditor.properties.recalculating")
        : uitvoer
          ? t("profileEditor.properties.calculatedIn", { ms: fmtMaat(uitvoer.tijd_ms, 0) })
          : "";

  return (
    <>
      <div className="pe-kop">{t("profileEditor.properties.title")}</div>
      <div className="pe-status">{status}</div>
      {fout && <div className="pe-melding pe-melding-fout">{fout}</div>}

      {!uitvoer && (
        <table className="pe-eig-tabel">
          <tbody>
            <Groep titel={t("profileEditor.properties.estimateGroup")} />
            <Rij label="A" waarde={fmtGroep(schatting.a_mm2, 0)} eenheid="mm²" />
            {schatting.y_c_mm !== undefined && (
              <Rij label={t("profileEditor.properties.centroidYZ")} waarde={`${fmtMaat(schatting.y_c_mm)}; ${fmtMaat(schatting.z_c_mm ?? 0)}`} eenheid="mm" />
            )}
          </tbody>
        </table>
      )}

      {uitvoer && (
        <table className={`pe-eig-tabel${verouderd ? " pe-eig-verouderd" : ""}`}>
          <tbody>
            <Groep titel={t("profileEditor.properties.sectionGroup")} />
            <Rij label="A" waarde={fmtGroep(uitvoer.area_mm2, 1)} eenheid="mm²" />
            {uitvoer.a_gaten_mm2 > 0 && (
              <Rij label={t("profileEditor.properties.ofWhichHoles")} waarde={`− ${fmtGroep(uitvoer.a_gaten_mm2, 1)}`} eenheid="mm²" />
            )}
            <Rij
              label={t("profileEditor.properties.outerDims")}
              waarde={`${fmtMaat(uitvoer.y_max_mm - uitvoer.y_min_mm)} × ${fmtMaat(uitvoer.z_max_mm - uitvoer.z_min_mm)}`}
              eenheid="mm"
            />
            <Rij label={t("profileEditor.properties.centroid")} waarde={`${fmtMaat(uitvoer.y_c_mm, 2)}; ${fmtMaat(uitvoer.z_c_mm, 2)}`} eenheid="mm" />
            <Rij
              label={t("profileEditor.properties.shearCentre")}
              waarde={
                uitvoer.schuifmiddelpunt_bepaald
                  ? `${fmtMaat(uitvoer.y_s_mm, 2)}; ${fmtMaat(uitvoer.z_s_mm, 2)}`
                  : nb
              }
              eenheid="mm"
            />
            <Rij
              label={t("profileEditor.properties.perimeter")}
              waarde={uitvoer.omtrek_bepaald ? fmtMaat(uitvoer.omtrek_mm, 1) : nb}
              eenheid="mm"
              titel={
                uitvoer.omtrek_bepaald
                  ? t("profileEditor.properties.perimeterTitle", { opp: fmtMaat(uitvoer.omtrek_mm / 1000, 3) }) + `${
                      uitvoer.omtrek_gaten_mm > 0
                        ? t("profileEditor.properties.holeEdges", { omtrek: fmtMaat(uitvoer.omtrek_gaten_mm, 1) })
                        : ""
                    }`
                  : t("profileEditor.properties.perimeterAssembly")
              }
            />
            <Rij
              label={t("profileEditor.properties.mass")}
              waarde={fmtMaat(uitvoer.massa_kg_per_m, 2)}
              eenheid="kg/m"
              titel={t("profileEditor.properties.densityTitle", { rho: fmtGroep(uitvoer.dichtheid_kg_m3, 0) })}
            />

            <Groep titel={t("profileEditor.properties.bendingYGroup")} />
            <Rij label="I_y" waarde={fmtMacht(uitvoer.iy_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label="i_y" waarde={fmtMaat(uitvoer.iy_radius_mm, 1)} eenheid="mm" />
            <Rij
              label={t("profileEditor.properties.welYGov")}
              waarde={fmtGroep(uitvoer.wel_y_mm3, 0)}
              eenheid="mm³"
              titel={t("profileEditor.properties.welYTitle", { boven: fmtGroep(uitvoer.wel_y_top_mm3, 0), onder: fmtGroep(uitvoer.wel_y_bot_mm3, 0) })}
            />
            {Math.abs(uitvoer.wel_y_top_mm3 - uitvoer.wel_y_bot_mm3) > 0.5 && (
              <Rij
                label={t("profileEditor.properties.topBottom")}
                waarde={`${fmtGroep(uitvoer.wel_y_top_mm3, 0)} / ${fmtGroep(uitvoer.wel_y_bot_mm3, 0)}`}
                eenheid="mm³"
              />
            )}
            <Rij label="W_pl,y" waarde={uitvoer.wpl_bepaald ? fmtGroep(uitvoer.wpl_y_mm3, 0) : nb} eenheid="mm³" />
            <Rij
              label={t("profileEditor.properties.shapeFactor")}
              waarde={uitvoer.plastisch_bepaald ? fmtMaat(uitvoer.vormfactor_y, 3) : nb}
              titel={t("profileEditor.properties.shapeFactorYTitle")}
            />
            <Rij label="A_v,z" waarde={fmtGroep(uitvoer.av_z_mm2, 0)} eenheid="mm²" />

            <Groep titel={t("profileEditor.properties.bendingZGroup")} />
            <Rij label="I_z" waarde={fmtMacht(uitvoer.iz_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label="i_z" waarde={fmtMaat(uitvoer.iz_radius_mm, 1)} eenheid="mm" />
            <Rij
              label={t("profileEditor.properties.welZGov")}
              waarde={fmtGroep(uitvoer.wel_z_mm3, 0)}
              eenheid="mm³"
              titel={t("profileEditor.properties.welZTitle", { links: fmtGroep(uitvoer.wel_z_left_mm3, 0), rechts: fmtGroep(uitvoer.wel_z_right_mm3, 0) })}
            />
            {Math.abs(uitvoer.wel_z_left_mm3 - uitvoer.wel_z_right_mm3) > 0.5 && (
              <Rij
                label={t("profileEditor.properties.leftRight")}
                waarde={`${fmtGroep(uitvoer.wel_z_left_mm3, 0)} / ${fmtGroep(uitvoer.wel_z_right_mm3, 0)}`}
                eenheid="mm³"
              />
            )}
            <Rij label="W_pl,z" waarde={uitvoer.wpl_bepaald ? fmtGroep(uitvoer.wpl_z_mm3, 0) : nb} eenheid="mm³" />
            <Rij
              label={t("profileEditor.properties.shapeFactor")}
              waarde={uitvoer.plastisch_bepaald ? fmtMaat(uitvoer.vormfactor_z, 3) : nb}
              titel={t("profileEditor.properties.shapeFactorZTitle")}
            />
            <Rij label="A_v,y" waarde={fmtGroep(uitvoer.av_y_mm2, 0)} eenheid="mm²" />

            <Groep titel={t("profileEditor.properties.principalAxesGroup")} />
            <Rij label="I_yz" waarde={fmtMacht(uitvoer.iyz_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label={t("profileEditor.properties.iuMax")} waarde={fmtMacht(uitvoer.iu_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label={t("profileEditor.properties.ivMin")} waarde={fmtMacht(uitvoer.iv_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij
              label="α (y → u)"
              waarde={
                // Iy = Iz en Iyz = 0: elke as is hoofdas; de hoek is dan
                // willekeurig en wordt niet als getal getoond.
                Math.abs(uitvoer.iyz_mm4) <= 1e-9 * (uitvoer.iy_mm4 + uitvoer.iz_mm4) &&
                Math.abs(uitvoer.iy_mm4 - uitvoer.iz_mm4) <= 1e-9 * (uitvoer.iy_mm4 + uitvoer.iz_mm4)
                  ? t("profileEditor.properties.anyAxis")
                  : fmtMaat((uitvoer.alpha_hoofdas_rad * 180) / Math.PI, 2)
              }
              eenheid="°"
            />
            <Rij label="i_u / i_v" waarde={`${fmtMaat(uitvoer.iu_radius_mm, 1)} / ${fmtMaat(uitvoer.iv_radius_mm, 1)}`} eenheid="mm" />
            <Rij
              label="W_el,u / W_el,v"
              waarde={`${fmtGroep(uitvoer.wel_u_mm3, 0)} / ${fmtGroep(uitvoer.wel_v_mm3, 0)}`}
              eenheid="mm³"
              titel={t("profileEditor.properties.welUVTitle", { uPlus: fmtGroep(uitvoer.wel_u_plus_mm3, 0), uMin: fmtGroep(uitvoer.wel_u_min_mm3, 0), vPlus: fmtGroep(uitvoer.wel_v_plus_mm3, 0), vMin: fmtGroep(uitvoer.wel_v_min_mm3, 0) })}
            />
            <Rij
              label="W_pl,u / W_pl,v"
              waarde={
                uitvoer.plastisch_bepaald
                  ? `${fmtGroep(uitvoer.wpl_u_mm3, 0)} / ${fmtGroep(uitvoer.wpl_v_mm3, 0)}`
                  : nb
              }
              eenheid="mm³"
            />

            <Groep titel={t("profileEditor.properties.plasticGroup")} />
            <Rij
              label={t("profileEditor.properties.plasticCentroid")}
              waarde={
                uitvoer.plastisch_bepaald
                  ? `${fmtMaat(uitvoer.y_pna_mm, 2)}; ${fmtMaat(uitvoer.z_pna_mm, 2)}`
                  : nb
              }
              eenheid="mm"
              titel={t("profileEditor.properties.plasticCentroidTitle")}
            />
            {uitvoer.plastisch_bepaald && (
              <Rij
                label={t("profileEditor.properties.relPrincipal")}
                waarde={`${fmtMaat(uitvoer.u_pna_mm, 2)}; ${fmtMaat(uitvoer.v_pna_mm, 2)}`}
                eenheid="mm"
              />
            )}
            <Rij
              label={t("profileEditor.properties.shapeFactorUV")}
              waarde={
                uitvoer.plastisch_bepaald
                  ? `${fmtMaat(uitvoer.vormfactor_u, 3)} / ${fmtMaat(uitvoer.vormfactor_v, 3)}`
                  : nb
              }
            />

            <Groep titel={t("profileEditor.properties.ltbGroup")} />
            <Rij
              label="z_j"
              waarde={uitvoer.monosymmetrie_bepaald ? fmtMaat(uitvoer.z_j_mm, 3) : nb}
              eenheid="mm"
              titel={t("profileEditor.properties.zjTitle")}
            />
            <Rij
              label="y_j"
              waarde={uitvoer.monosymmetrie_bepaald ? fmtMaat(uitvoer.y_j_mm, 3) : nb}
              eenheid="mm"
              titel={t("profileEditor.properties.yjTitle")}
            />
            {uitvoer.monosymmetrie_bepaald && (
              <Rij
                label="  β_y / β_z"
                waarde={`${fmtMaat(uitvoer.beta_y_mm, 3)} / ${fmtMaat(uitvoer.beta_z_mm, 3)}`}
                eenheid="mm"
                titel={t("profileEditor.properties.betaTitle")}
              />
            )}

            <Groep titel={t("profileEditor.properties.staticMomentsGroup")} />
            <Rij
              label="Q_y / Q_z"
              waarde={`${fmtGroep(uitvoer.qy_mm3, 0)} / ${fmtGroep(uitvoer.qz_mm3, 0)}`}
              eenheid="mm³"
              titel={t("profileEditor.properties.staticMomentsTitle")}
            />
            {uitvoer.av_hoofdas_bepaald && (
              <Rij
                label="A_v,u / A_v,v"
                waarde={`${fmtGroep(uitvoer.av_u_mm2, 0)} / ${fmtGroep(uitvoer.av_v_mm2, 0)}`}
                eenheid="mm²"
              />
            )}

            <Groep titel={t("profileEditor.properties.torsionGroup")} />
            <Rij
              label="I_t"
              waarde={fmtGroep(uitvoer.it_mm4, 0)}
              eenheid="mm⁴"
              titel={
                uitvoer.methode === "contour"
                  ? t("profileEditor.properties.itNumericTitle", { onder: fmtGroep(uitvoer.it_ondergrens_mm4, 0), boven: fmtGroep(uitvoer.it_bovengrens_mm4, 0), pct: fmtMaat(uitvoer.it_onzekerheid * 100, 2) })
                  : t("profileEditor.properties.itThinWalledTitle")
              }
            />
            {uitvoer.methode === "contour" && (
              <Rij label={t("profileEditor.properties.uncertainty")} waarde={`± ${fmtMaat(uitvoer.it_onzekerheid * 100, 2)}`} eenheid="%" />
            )}
            <Rij label="I_w" waarde={uitvoer.iw_bepaald ? fmtMacht(uitvoer.iw_mm6, 9, 3) : nb} eenheid="mm⁶" />

            <Groep titel={t("profileEditor.properties.calculationGroup")} />
            <Rij
              label={t("profileEditor.properties.method")}
              waarde={
                uitvoer.methode === "contour"
                  ? t("profileEditor.properties.methodContour")
                  : t("profileEditor.properties.methodThinWalled")
              }
            />
            {uitvoer.methode === "contour" && (
              <Rij label={t("profileEditor.properties.triangles")} waarde={fmtGroep(uitvoer.driehoeken, 0)} />
            )}
          </tbody>
        </table>
      )}

      {/*
        De motor is eerlijk over wat hij niet weet, en dat moet zichtbaar
        blijven — maar niet als drie alinea's naast de tabel. Elke melding is
        één regel; de volledige zin staat in de tooltip (en blijft dus
        vindbaar, ook bij kopiëren).
      */}
      {uitvoer && uitvoer.meldingen.length > 0 && (
        <div className="pe-meldingen">
          {uitvoer.meldingen.map((m, i) => (
            <div key={i} className="pe-melding pe-melding-regel" title={m}>
              <span className="pe-melding-merk" aria-hidden="true">!</span>
              <span className="pe-melding-tekst">{m}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
