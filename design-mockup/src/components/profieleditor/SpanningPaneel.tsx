/**
 * SpanningPaneel — een moment (en een normaalkracht en een dwarskracht) op de
 * getekende doorsnede zetten en het spanningsverloop erover zien.
 *
 * Er wordt hier niets nieuws gerekend. De doorsnede gaat als **lagenmodel**
 * (lib/profieleditor/lagenmodel.ts) naar de bestaande vrije spanningstoets in
 * `src-tauri/crates/spanning-check`, en die geeft σ_x, τ en σ_eq per vezel
 * terug. De figuur is dezelfde `SpanningDoorsnedeTekening` die het rapport en
 * het toetsingspaneel gebruiken.
 *
 * De lasnaden liften mee: met dezelfde dwarskracht volgt per naad de
 * schuifstroom q = V·S/I_y, en die gaat naar `nen-en-1993-1-8-las` voor de
 * toetsing volgens NEN-EN 1993-1-8 4.5.3.3.
 *
 * Drie kolommen, net als de andere tabbladen: links de invoer, in het midden
 * de figuur, rechts de uitkomsten.
 */
import { useMemo } from "react";
import SpanningDoorsnedeTekening from "../spanning/SpanningDoorsnedeTekening";
import { fmtGroep, fmtMaat, fmtMacht } from "../../lib/profieleditor/format";
import { doorsnedeVanOntwerp } from "../../lib/profieleditor/lagenmodel";
import {
  LASSOORT_KORT,
  lassenVan,
  schuifstroomVanLas,
} from "../../lib/profieleditor/lassen";
import { useSpanningBerekening } from "../../lib/profieleditor/useSpanningBerekening";
import type { LasInput } from "../../lib/types/las/LasInput";
import type { SpanningBeamCheckInput } from "../../lib/types/spanning/SpanningBeamCheckInput";
import type { DoorsnedeOntwerp, MotorUitvoer } from "../../lib/profieleditor/types";
import GetalVeld from "./GetalVeld";

/** De snedekrachten en materiaalgegevens die de gebruiker invult. */
export interface Belasting {
  /** Normaalkracht N_Ed in kN; trek positief. */
  n_kn: number;
  /** Dwarskracht V_z,Ed in kN. */
  vz_kn: number;
  /** Moment M_y,Ed in kNm; positief = trek in de onderste vezel. */
  my_knm: number;
  /** Dwarsspanning σ_z in N/mm² (bijvoorbeeld een oplegdruk), constant. */
  sigma_z_mpa: number;
  /** Toelaatbare spanning f_toel in N/mm². */
  f_toel_mpa: number;
  /** Materiaalfactor γ_M; de rekenwaarde is f_d = f_toel/γ_M. */
  gamma_m: number;
  /** Staalsoort voor de lastoetsing (f_u en β_w). */
  staalsoort: string;
}

export const STANDAARD_BELASTING: Belasting = {
  n_kn: 0,
  vz_kn: 100,
  my_knm: 200,
  sigma_z_mpa: 0,
  f_toel_mpa: 235,
  gamma_m: 1,
  staalsoort: "S235",
};

const STAALSOORTEN = ["S235", "S275", "S355", "S420", "S460"];

interface Props {
  ontwerp: DoorsnedeOntwerp;
  uitvoer: MotorUitvoer | null;
  belasting: Belasting;
  onWijzig: (b: Belasting) => void;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
}

function ucKlasse(uc: number): string {
  return uc > 1 ? "pe-uc pe-uc-fout" : "pe-uc pe-uc-ok";
}

export default function SpanningPaneel({
  ontwerp,
  uitvoer,
  belasting,
  onWijzig,
  geselecteerd,
  onSelecteer,
}: Props) {
  const zet = (patch: Partial<Belasting>) => onWijzig({ ...belasting, ...patch });

  // ── De doorsnede als lagenmodel ─────────────────────────────────────────
  const doorsnede = useMemo(
    () => doorsnedeVanOntwerp(ontwerp, uitvoer?.delen ?? []),
    [ontwerp, uitvoer],
  );
  const kan = typeof doorsnede !== "string" ? doorsnede : null;

  // ── Schuifstroom per lasnaad ────────────────────────────────────────────
  const lassen = ontwerp.soort === "samenstelling" ? lassenVan(ontwerp) : [];
  const naden = useMemo(() => {
    if (ontwerp.soort !== "samenstelling" || !uitvoer) return [];
    return lassen.map((las, i) => ({
      las,
      nummer: i + 1,
      stroom: schuifstroomVanLas(
        las,
        ontwerp.lamellen,
        lassen,
        uitvoer.z_c_mm,
        uitvoer.iy_mm4,
        belasting.vz_kn,
        ontwerp.catalogusdelen.length,
      ),
    }));
  }, [ontwerp, lassen, uitvoer, belasting.vz_kn]);

  const lasInvoer: LasInput[] = useMemo(
    () =>
      naden
        .filter((n) => typeof n.stroom !== "string")
        .map((n) => ({
          id: n.las.id,
          soort: n.las.soort,
          a_mm: n.las.a_mm,
          f_w_ed_n_per_mm: (n.stroom as { q_n_per_mm: number }).q_n_per_mm,
          staalsoort: belasting.staalsoort,
        })),
    [naden, belasting.staalsoort],
  );

  // ── De kern aanroepen ───────────────────────────────────────────────────
  const invoer: SpanningBeamCheckInput | null = useMemo(() => {
    if (!kan || !(belasting.f_toel_mpa > 0) || !(belasting.gamma_m > 0)) return null;
    return {
      beam_id: 0,
      section: kan.doorsnede,
      material_name: belasting.staalsoort,
      f_toel_mpa: belasting.f_toel_mpa,
      gamma_m: belasting.gamma_m,
      sigma_z_mpa: belasting.sigma_z_mpa,
      length_m: 1,
      forces_envelope: [
        {
          combination_id: 1,
          position_mm: 0,
          forces: {
            n_ed: belasting.n_kn,
            vy_ed: 0,
            vz_ed: belasting.vz_kn,
            mt_ed: 0,
            my_ed: belasting.my_knm,
            mz_ed: 0,
          },
        },
      ],
      fiber_count: 41,
    };
  }, [kan, belasting]);

  const res = useSpanningBerekening(invoer, lasInvoer);
  const verloop = res.uitvoer?.verloop ?? null;
  const sectie = res.uitvoer?.section ?? null;

  // Wat het strokenmodel kost ten opzichte van de exacte motor.
  const afwijking =
    sectie && uitvoer && uitvoer.area_mm2 > 0 && uitvoer.iy_mm4 > 0 && sectie.bron === "lagenmodel"
      ? {
          a: ((sectie.a_mm2 - uitvoer.area_mm2) / uitvoer.area_mm2) * 100,
          iy: ((sectie.iy_mm4 - uitvoer.iy_mm4) / uitvoer.iy_mm4) * 100,
        }
      : null;

  const checks = res.uitvoer?.checks ?? [];
  const uc = (id: string) => {
    const c = checks.find((x) => x.id === id);
    if (!c || c.kind.type !== "Resistance") return null;
    return c.kind.data.uc ?? null;
  };

  const status = res.fout
    ? null
    : res.bezig
      ? "Rekent…"
      : res.verouderd
        ? "Wordt herberekend…"
        : res.uitvoer
          ? "Berekend"
          : "";

  return (
    <div className="pe-kolommen">
      {/* ── Links: de belasting ───────────────────────────────────────── */}
      <div className="pe-kolom pe-kolom-links">
        <div
          className="pe-kop"
          title={
            "Snedekrachten op déze doorsnede. Trek positief; M_y positief geeft trek in de " +
            "onderste vezel. Het verloop wordt met deze ene set gerekend — geen staaf, geen " +
            "combinaties, alleen de doorsnede."
          }
        >
          Snedekrachten
        </div>
        <div className="pe-velden pe-velden-3">
          <GetalVeld
            label="N"
            eenheid="kN"
            waarde={belasting.n_kn}
            stap={10}
            titel="Normaalkracht N_Ed; trek positief. Geeft σ = N/A over de hele doorsnede."
            onWijzig={(v) => zet({ n_kn: v })}
          />
          <GetalVeld
            label="V_z"
            eenheid="kN"
            waarde={belasting.vz_kn}
            stap={10}
            titel="Dwarskracht V_z,Ed. Bepaalt τ = V·S(z)/(I_y·b(z)) én de schuifstroom door de lasnaden."
            onWijzig={(v) => zet({ vz_kn: v })}
          />
          <GetalVeld
            label="M_y"
            eenheid="kNm"
            waarde={belasting.my_knm}
            stap={10}
            titel="Moment M_y,Ed om de sterke as; positief geeft trek in de onderste vezel."
            onWijzig={(v) => zet({ my_knm: v })}
          />
          <GetalVeld
            label="σ_z"
            eenheid="N/mm²"
            waarde={belasting.sigma_z_mpa}
            stap={5}
            titel="Dwarsspanning, constant over de doorsnede aangenomen — bijvoorbeeld een oplegdruk. Een staafmodel rekent die niet zelf uit."
            onWijzig={(v) => zet({ sigma_z_mpa: v })}
          />
        </div>

        <div
          className="pe-kop"
          title={
            "Dit is de VRIJE spanningstoets: geen doorsnedeklassificatie, geen plooi, geen knik " +
            "of kip. De toelaatbare spanning geef je zelf op; f_d = f_toel/γ_M is de streeplijn " +
            "in het σ_eq-paneel."
          }
        >
          Materiaal
        </div>
        <div className="pe-velden pe-velden-3">
          <GetalVeld
            label="f_toel"
            eenheid="N/mm²"
            waarde={belasting.f_toel_mpa}
            min={0.1}
            stap={5}
            titel="Toelaatbare spanning. Voor staal doorgaans f_y."
            onWijzig={(v) => zet({ f_toel_mpa: v })}
          />
          <GetalVeld
            label="γ_M"
            waarde={belasting.gamma_m}
            min={0.1}
            stap={0.05}
            titel="Materiaalfactor; f_d = f_toel/γ_M. 1,0 laat f_toel zelf de rekenwaarde zijn."
            onWijzig={(v) => zet({ gamma_m: v })}
          />
          <label
            className="pe-veld"
            title="Staalsoort van het zwakste verbonden onderdeel — hieruit volgen f_u (EN 1993-1-1 tabel 3.1) en de correlatiefactor β_w (EN 1993-1-8 tabel 4.1) voor de lastoetsing."
          >
            <span>Staal (las)</span>
            <select
              value={belasting.staalsoort}
              onChange={(e) => zet({ staalsoort: e.target.value })}
            >
              {STAALSOORTEN.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {typeof doorsnede === "string" && (
          <div className="pe-melding pe-melding-fout">{doorsnede}</div>
        )}
        {res.fout && <div className="pe-melding pe-melding-fout">{res.fout}</div>}
        {res.uitvoer?.notes.map((n, i) => (
          <div key={i} className="pe-melding">
            {n}
          </div>
        ))}
      </div>

      {/* ── Midden: de figuur ─────────────────────────────────────────── */}
      <div className="pe-kolom pe-kolom-midden pe-spanningsvlak">
        {verloop && sectie ? (
          <SpanningDoorsnedeTekening
            className={`pe-spanningsfiguur${res.verouderd ? " verouderd" : ""}`}
            naam={sectie.naam}
            lagen={sectie.lagen}
            hoogteMm={sectie.hoogte_mm}
            breedteMaxMm={sectie.breedte_max_mm}
            zCMm={sectie.z_c_mm}
            vezels={verloop.vezels}
            zMaatgevendMm={verloop.z_maatgevend_mm}
            fDMpa={res.uitvoer?.f_d_mpa ?? 0}
          />
        ) : (
          <div className="pe-tekenvlak-leeg">
            {typeof doorsnede === "string"
              ? "Geen spanningsverloop: zie de melding links."
              : "Vul links een moment of een dwarskracht in."}
          </div>
        )}
      </div>

      {/* ── Rechts: de uitkomsten ─────────────────────────────────────── */}
      <div className="pe-kolom pe-kolom-rechts">
        <div className="pe-kop">Uitkomst</div>
        <div className="pe-status">{status}</div>

        {res.uitvoer && sectie && (
          <table className={`pe-eig-tabel${res.verouderd ? " pe-eig-verouderd" : ""}`}>
            <tbody>
              <tr className="pe-groep">
                <th colSpan={2}>Toetsing</th>
              </tr>
              {[
                ["spanning_vergelijk", "σ_eq (von Mises)"],
                ["spanning_normaal", "σ_x"],
                ["spanning_schuif", "τ"],
              ].map(([id, label]) => {
                const u = uc(id);
                return (
                  <tr key={id}>
                    <th scope="row">{label}</th>
                    <td>
                      {u ? (
                        <span className={ucKlasse(u.uc)} title={`${fmtMaat(u.ed, 1)} / ${fmtMaat(u.rd, 1)} N/mm²`}>
                          UC = {fmtMaat(u.uc, 2)}
                        </span>
                      ) : (
                        <span className="pe-niet-bepaald">niet bepaald</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row">f_d</th>
                <td>
                  {fmtMaat(res.uitvoer.f_d_mpa, 1)}
                  <span className="pe-eenheid"> N/mm²</span>
                </td>
              </tr>

              <tr className="pe-groep">
                <th colSpan={2}>Rekenmodel</th>
              </tr>
              <tr title="Uit hoeveel horizontale stroken de doorsnede is opgebouwd; uit die stroken volgen A, z_c, I_y en S(z).">
                <th scope="row">Stroken</th>
                <td>{sectie.lagen.length}</td>
              </tr>
              <tr>
                <th scope="row">A</th>
                <td>
                  {fmtGroep(sectie.a_mm2, 0)}
                  <span className="pe-eenheid"> mm²</span>
                </td>
              </tr>
              <tr>
                <th scope="row">I_y</th>
                <td>
                  {fmtMacht(sectie.iy_mm4, 6, 3)}
                  <span className="pe-eenheid"> mm⁴</span>
                </td>
              </tr>
              {afwijking && (
                <tr
                  title={
                    "Verschil tussen het strokenmodel achter dit verloop en de exacte contour van " +
                    "de doorsnedemotor. Bij losse platen hoort dit nul te zijn; een catalogusdeel " +
                    "gaat als rechte platen mee en dan zit hier de walsuitronding in."
                  }
                >
                  <th scope="row">t.o.v. de motor</th>
                  <td>
                    A {afwijking.a >= 0 ? "+" : "−"}
                    {fmtMaat(Math.abs(afwijking.a), 2)} %, I_y {afwijking.iy >= 0 ? "+" : "−"}
                    {fmtMaat(Math.abs(afwijking.iy), 2)} %
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">Bron A, I_y</th>
                <td>{sectie.bron}</td>
              </tr>
            </tbody>
          </table>
        )}

        {naden.length > 0 && (
          <>
            <div
              className="pe-kop"
              title="Per lasnaad de schuifstroom q = V_z·S/I_y en de toetsing volgens NEN-EN 1993-1-8 4.5.3.3 (vereenvoudigde methode)."
            >
              Lassen
            </div>
            <table className="pe-eig-tabel">
              <tbody>
                {naden.map((n) => {
                  const r = res.lassen.find((x) => x.id === n.las.id);
                  const reden = typeof n.stroom === "string" ? n.stroom : null;
                  const stroom = typeof n.stroom === "string" ? null : n.stroom;
                  return (
                    <tr
                      key={n.las.id}
                      className={geselecteerd === n.las.id ? "pe-rij-actief" : undefined}
                      onClick={() => onSelecteer(n.las.id)}
                      title={
                        reden ??
                        (stroom
                          ? `Afgesneden deel: ${stroom.platen} plaat${stroom.platen === 1 ? "" : "en"}, ` +
                            `S = ${fmtGroep(stroom.s_mm3, 0)} mm³. ` +
                            (r?.getoetst
                              ? `f_vw,d = ${fmtMaat(r.f_vw_d_mpa, 1)} N/mm² (f_u = ${fmtMaat(r.f_u_mpa, 0)}, ` +
                                `β_w = ${fmtMaat(r.beta_w, 2)}, γ_M2 = ${fmtMaat(r.gamma_m2, 2)}); ` +
                                `F_w,Rd = ${fmtMaat(r.f_w_rd_n_per_mm, 0)} N/mm.`
                              : (r?.meldingen.join(" ") ?? ""))
                          : "")
                      }
                    >
                      <th scope="row">
                        Las {n.nummer}
                        <span className="pe-item-sub"> a = {fmtMaat(n.las.a_mm, 1)} · {LASSOORT_KORT[n.las.soort]}</span>
                      </th>
                      <td>
                        {reden ? (
                          <span className="pe-niet-bepaald">niet bepaald</span>
                        ) : (
                          <>
                            q = {fmtMaat(stroom?.q_n_per_mm ?? 0, 0)}
                            <span className="pe-eenheid"> N/mm</span>
                            {r?.getoetst ? (
                              <>
                                {" · "}
                                <span className={ucKlasse(r.uc)}>UC = {fmtMaat(r.uc, 2)}</span>
                              </>
                            ) : (
                              <>
                                {" · "}
                                <span className="pe-niet-bepaald">geen toets</span>
                              </>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {naden.map((n) =>
              typeof n.stroom === "string" ? (
                <div key={`m-${n.las.id}`} className="pe-melding">
                  Las {n.nummer}: {n.stroom}
                </div>
              ) : null,
            )}
            {res.lassen
              .filter((r) => r.meldingen.length > 0)
              .map((r) => (
                <div key={`w-${r.id}`} className="pe-melding">
                  {r.meldingen.join(" ")}
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
