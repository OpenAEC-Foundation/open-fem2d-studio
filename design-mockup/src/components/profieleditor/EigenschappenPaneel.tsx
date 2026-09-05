/**
 * EigenschappenPaneel — de doorsnede-eigenschappen uit de motor, live.
 *
 * Alles wat hier staat komt uit `MotorUitvoer`; de enige TypeScript-getallen
 * zijn de schatting van A (en zwaartepunt) die getoond wordt zolang de
 * motor nog geen antwoord heeft gegeven — en die staat er nadrukkelijk als
 * schatting bij. Niet-bepaalde grootheden (Wpl bij catalogusdelen, Iw bij
 * gesloten of losse doorsneden) heten hier "niet bepaald", geen nul.
 */
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
  const nietBepaald = waarde === "niet bepaald";
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
  const status = fout
    ? null
    : bezig
      ? "Motor rekent…"
      : verouderd
        ? "Wordt herberekend…"
        : uitvoer
          ? `Berekend in ${fmtMaat(uitvoer.tijd_ms, 0)} ms`
          : "";

  return (
    <>
      <div className="pe-kop">Eigenschappen</div>
      <div className="pe-status">{status}</div>
      {fout && <div className="pe-melding pe-melding-fout">{fout}</div>}

      {!uitvoer && (
        <table className="pe-eig-tabel">
          <tbody>
            <Groep titel="Schatting (wacht op de motor)" />
            <Rij label="A" waarde={fmtGroep(schatting.a_mm2, 0)} eenheid="mm²" />
            {schatting.y_c_mm !== undefined && (
              <Rij label="Zwaartepunt y, z" waarde={`${fmtMaat(schatting.y_c_mm)}; ${fmtMaat(schatting.z_c_mm ?? 0)}`} eenheid="mm" />
            )}
          </tbody>
        </table>
      )}

      {uitvoer && (
        <table className={`pe-eig-tabel${verouderd ? " pe-eig-verouderd" : ""}`}>
          <tbody>
            <Groep titel="Doorsnede" />
            <Rij label="A" waarde={fmtGroep(uitvoer.area_mm2, 1)} eenheid="mm²" />
            {uitvoer.a_gaten_mm2 > 0 && (
              <Rij label="waarvan gaten" waarde={`− ${fmtGroep(uitvoer.a_gaten_mm2, 1)}`} eenheid="mm²" />
            )}
            <Rij
              label="Buitenmaten b × h"
              waarde={`${fmtMaat(uitvoer.y_max_mm - uitvoer.y_min_mm)} × ${fmtMaat(uitvoer.z_max_mm - uitvoer.z_min_mm)}`}
              eenheid="mm"
            />
            <Rij label="Zwaartepunt y_c, z_c" waarde={`${fmtMaat(uitvoer.y_c_mm, 2)}; ${fmtMaat(uitvoer.z_c_mm, 2)}`} eenheid="mm" />
            <Rij
              label="Schuifmiddelpunt y_s, z_s"
              waarde={
                uitvoer.schuifmiddelpunt_bepaald
                  ? `${fmtMaat(uitvoer.y_s_mm, 2)}; ${fmtMaat(uitvoer.z_s_mm, 2)}`
                  : "niet bepaald"
              }
              eenheid="mm"
            />
            <Rij
              label="Omtrek"
              waarde={uitvoer.omtrek_bepaald ? fmtMaat(uitvoer.omtrek_mm, 1) : "niet bepaald"}
              eenheid="mm"
              titel={
                uitvoer.omtrek_bepaald
                  ? `Buitenrand; conserveringsoppervlak ${fmtMaat(uitvoer.omtrek_mm / 1000, 3)} m²/m.${
                      uitvoer.omtrek_gaten_mm > 0
                        ? ` Randen van gaten: ${fmtMaat(uitvoer.omtrek_gaten_mm, 1)} mm.`
                        : ""
                    }`
                  : "Een samenstelling is een som van platen die bij de lasnaden overlappen; er is geen eenduidige buitenrand."
              }
            />
            <Rij
              label="Massa"
              waarde={fmtMaat(uitvoer.massa_kg_per_m, 2)}
              eenheid="kg/m"
              titel={`Bij ρ = ${fmtGroep(uitvoer.dichtheid_kg_m3, 0)} kg/m³`}
            />

            <Groep titel="Buiging om y (sterke as)" />
            <Rij label="I_y" waarde={fmtMacht(uitvoer.iy_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label="i_y" waarde={fmtMaat(uitvoer.iy_radius_mm, 1)} eenheid="mm" />
            <Rij
              label="W_el,y (maatgevend)"
              waarde={fmtGroep(uitvoer.wel_y_mm3, 0)}
              eenheid="mm³"
              titel={`Boven: ${fmtGroep(uitvoer.wel_y_top_mm3, 0)} mm³ · onder: ${fmtGroep(uitvoer.wel_y_bot_mm3, 0)} mm³`}
            />
            {Math.abs(uitvoer.wel_y_top_mm3 - uitvoer.wel_y_bot_mm3) > 0.5 && (
              <Rij
                label="  boven / onder"
                waarde={`${fmtGroep(uitvoer.wel_y_top_mm3, 0)} / ${fmtGroep(uitvoer.wel_y_bot_mm3, 0)}`}
                eenheid="mm³"
              />
            )}
            <Rij label="W_pl,y" waarde={uitvoer.wpl_bepaald ? fmtGroep(uitvoer.wpl_y_mm3, 0) : "niet bepaald"} eenheid="mm³" />
            <Rij
              label="  vormfactor"
              waarde={uitvoer.plastisch_bepaald ? fmtMaat(uitvoer.vormfactor_y, 3) : "niet bepaald"}
              titel="W_pl/W_el: hoeveel de doorsnede na intreden van vloeien nog bijdraagt. Rechthoek 1,5; gewalste I om de sterke as ongeveer 1,13."
            />
            <Rij label="A_v,z" waarde={fmtGroep(uitvoer.av_z_mm2, 0)} eenheid="mm²" />

            <Groep titel="Buiging om z (zwakke as)" />
            <Rij label="I_z" waarde={fmtMacht(uitvoer.iz_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label="i_z" waarde={fmtMaat(uitvoer.iz_radius_mm, 1)} eenheid="mm" />
            <Rij
              label="W_el,z (maatgevend)"
              waarde={fmtGroep(uitvoer.wel_z_mm3, 0)}
              eenheid="mm³"
              titel={`Links: ${fmtGroep(uitvoer.wel_z_left_mm3, 0)} mm³ · rechts: ${fmtGroep(uitvoer.wel_z_right_mm3, 0)} mm³`}
            />
            {Math.abs(uitvoer.wel_z_left_mm3 - uitvoer.wel_z_right_mm3) > 0.5 && (
              <Rij
                label="  links / rechts"
                waarde={`${fmtGroep(uitvoer.wel_z_left_mm3, 0)} / ${fmtGroep(uitvoer.wel_z_right_mm3, 0)}`}
                eenheid="mm³"
              />
            )}
            <Rij label="W_pl,z" waarde={uitvoer.wpl_bepaald ? fmtGroep(uitvoer.wpl_z_mm3, 0) : "niet bepaald"} eenheid="mm³" />
            <Rij
              label="  vormfactor"
              waarde={uitvoer.plastisch_bepaald ? fmtMaat(uitvoer.vormfactor_z, 3) : "niet bepaald"}
              titel="W_pl/W_el om de zwakke as."
            />
            <Rij label="A_v,y" waarde={fmtGroep(uitvoer.av_y_mm2, 0)} eenheid="mm²" />

            <Groep titel="Hoofdassen" />
            <Rij label="I_yz" waarde={fmtMacht(uitvoer.iyz_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label="I_u (grootste)" waarde={fmtMacht(uitvoer.iu_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij label="I_v (kleinste)" waarde={fmtMacht(uitvoer.iv_mm4, 6, 3)} eenheid="mm⁴" />
            <Rij
              label="α (y → u)"
              waarde={
                // Iy = Iz en Iyz = 0: elke as is hoofdas; de hoek is dan
                // willekeurig en wordt niet als getal getoond.
                Math.abs(uitvoer.iyz_mm4) <= 1e-9 * (uitvoer.iy_mm4 + uitvoer.iz_mm4) &&
                Math.abs(uitvoer.iy_mm4 - uitvoer.iz_mm4) <= 1e-9 * (uitvoer.iy_mm4 + uitvoer.iz_mm4)
                  ? "0 (elke as)"
                  : fmtMaat((uitvoer.alpha_hoofdas_rad * 180) / Math.PI, 2)
              }
              eenheid="°"
            />
            <Rij label="i_u / i_v" waarde={`${fmtMaat(uitvoer.iu_radius_mm, 1)} / ${fmtMaat(uitvoer.iv_radius_mm, 1)}`} eenheid="mm" />
            <Rij
              label="W_el,u / W_el,v"
              waarde={`${fmtGroep(uitvoer.wel_u_mm3, 0)} / ${fmtGroep(uitvoer.wel_v_mm3, 0)}`}
              eenheid="mm³"
              titel={`Maatgevend van beide vezels. u: ${fmtGroep(uitvoer.wel_u_plus_mm3, 0)} / ${fmtGroep(uitvoer.wel_u_min_mm3, 0)} · v: ${fmtGroep(uitvoer.wel_v_plus_mm3, 0)} / ${fmtGroep(uitvoer.wel_v_min_mm3, 0)} mm³`}
            />
            <Rij
              label="W_pl,u / W_pl,v"
              waarde={
                uitvoer.plastisch_bepaald
                  ? `${fmtGroep(uitvoer.wpl_u_mm3, 0)} / ${fmtGroep(uitvoer.wpl_v_mm3, 0)}`
                  : "niet bepaald"
              }
              eenheid="mm³"
            />

            <Groep titel="Plastisch" />
            <Rij
              label="Plastisch zwaartepunt"
              waarde={
                uitvoer.plastisch_bepaald
                  ? `${fmtMaat(uitvoer.y_pna_mm, 2)}; ${fmtMaat(uitvoer.z_pna_mm, 2)}`
                  : "niet bepaald"
              }
              eenheid="mm"
              titel="De lijn die het oppervlak in tweeën deelt. Bij een symmetrische doorsnede valt hij samen met het elastische zwaartepunt; bij een T-profiel ligt hij hoger."
            />
            {uitvoer.plastisch_bepaald && (
              <Rij
                label="  t.o.v. hoofdassen u, v"
                waarde={`${fmtMaat(uitvoer.u_pna_mm, 2)}; ${fmtMaat(uitvoer.v_pna_mm, 2)}`}
                eenheid="mm"
              />
            )}
            <Rij
              label="Vormfactor u / v"
              waarde={
                uitvoer.plastisch_bepaald
                  ? `${fmtMaat(uitvoer.vormfactor_u, 3)} / ${fmtMaat(uitvoer.vormfactor_v, 3)}`
                  : "niet bepaald"
              }
            />

            <Groep titel="Kip (monosymmetrie)" />
            <Rij
              label="z_j"
              waarde={uitvoer.monosymmetrie_bepaald ? fmtMaat(uitvoer.z_j_mm, 3) : "niet bepaald"}
              eenheid="mm"
              titel="z_j = z_s − ½·∬(y²+z²)z dA / I_y, de monosymmetrieterm uit de kiptoetsing. Nul bij een dubbelsymmetrische doorsnede; positief wanneer het meeste materiaal boven het zwaartepunt zit."
            />
            <Rij
              label="y_j"
              waarde={uitvoer.monosymmetrie_bepaald ? fmtMaat(uitvoer.y_j_mm, 3) : "niet bepaald"}
              eenheid="mm"
              titel="Het spiegelbeeld van z_j; maatgevend bij een U-profiel."
            />
            {uitvoer.monosymmetrie_bepaald && (
              <Rij
                label="  β_y / β_z"
                waarde={`${fmtMaat(uitvoer.beta_y_mm, 3)} / ${fmtMaat(uitvoer.beta_z_mm, 3)}`}
                eenheid="mm"
                titel="De monosymmetrieconstanten waaruit z_j en y_j volgen: z_j = −β_y/2."
              />
            )}

            <Groep titel="Statische momenten (globale assen)" />
            <Rij
              label="Q_y / Q_z"
              waarde={`${fmtGroep(uitvoer.qy_mm3, 0)} / ${fmtGroep(uitvoer.qz_mm3, 0)}`}
              eenheid="mm³"
              titel="∬z dA en ∬y dA om de assen van het beschrijvingsstelsel. Om de zwaartepuntsassen zijn ze per definitie nul; Q_y = A·z_c is dus meteen een controle op de rekengang."
            />
            {uitvoer.av_hoofdas_bepaald && (
              <Rij
                label="A_v,u / A_v,v"
                waarde={`${fmtGroep(uitvoer.av_u_mm2, 0)} / ${fmtGroep(uitvoer.av_v_mm2, 0)}`}
                eenheid="mm²"
              />
            )}

            <Groep titel="Torsie en welving" />
            <Rij
              label="I_t"
              waarde={fmtGroep(uitvoer.it_mm4, 0)}
              eenheid="mm⁴"
              titel={
                uitvoer.methode === "contour"
                  ? `Numeriek, insluiting ${fmtGroep(uitvoer.it_ondergrens_mm4, 0)} – ${fmtGroep(uitvoer.it_bovengrens_mm4, 0)} mm⁴ (±${fmtMaat(uitvoer.it_onzekerheid * 100, 2)} %)`
                  : "Dunwandig: ⅓·Σb·t³ plus Bredt voor gedeclareerde cellen"
              }
            />
            {uitvoer.methode === "contour" && (
              <Rij label="  onzekerheid" waarde={`± ${fmtMaat(uitvoer.it_onzekerheid * 100, 2)}`} eenheid="%" />
            )}
            <Rij label="I_w" waarde={uitvoer.iw_bepaald ? fmtMacht(uitvoer.iw_mm6, 9, 3) : "niet bepaald"} eenheid="mm⁶" />

            <Groep titel="Berekening" />
            <Rij
              label="Methode"
              waarde={
                uitvoer.methode === "contour"
                  ? "exacte contour + numerieke torsie"
                  : "dunwandige samenstelling"
              }
            />
            {uitvoer.methode === "contour" && (
              <Rij label="Driehoeken" waarde={fmtGroep(uitvoer.driehoeken, 0)} />
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
