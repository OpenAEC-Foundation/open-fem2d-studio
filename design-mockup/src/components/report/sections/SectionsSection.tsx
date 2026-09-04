/**
 * SectionsSection — "Profielen & doorsneden": per uniek profiel in het model
 * één blok met een parametrische doorsnede-tekening (SectionSketch, met
 * afrondingsstralen en assenweergave) en een volledige doorsnedegegevens-
 * tabel zoals in het referentie-rapport.
 *
 * Bronnen — dezelfde als de solver, geen duplicatie:
 *  - staal: A/Iy via resolveSection → lib/steelSections.generated.ts;
 *    afmetingen (h/b/tw/tf/r) en aanvullende grootheden (Iz, Wel, Wpl,
 *    Av;z, It, Iw, traagheidsstralen) uit lib/steelSectionDims.generated.ts
 *    (beide gegenereerd uit de Rust-profieldatabase met
 *    scripts/genereer-staalprofielen.mjs);
 *  - hout: b×h uit de profielnaam, A en Iy berekend door resolveSection
 *    (lib/sectionResolver.ts — geïmporteerd, niet gedupliceerd); Iz/Wy/Wz
 *    hier uit dezelfde b×h afgeleid.
 * Onbekende combinaties worden eerlijk gemeld — geen verzonnen doorsnede.
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { resolveSection, parseRechthoek } from "../../../lib/sectionResolver";
import { profileLookupKey } from "../../../lib/steelCheckBuilder";
import { STEEL_SECTION_DIMS } from "../../../lib/steelSectionDims.generated";
import { useReportData } from "../ReportDataContext";
import { fmtNum } from "../reportFormat";
import SectionSketch from "./SectionSketch";
import { steelShape, type SectionShape } from "../../shared/profielVorm";
import { zoekEigenDoorsnede } from "../../../lib/profieleditor/eigenDoorsnedenStore";
import EigenDoorsnedeTekening from "../../profieleditor/EigenDoorsnedeTekening";

interface ProfileUse {
  profile: string;
  material: string;
  beamIds: number[];
}

/** Soortelijke massa constructiestaal in kg/m³ (voor G = A·ρ). */
const DICHTHEID_STAAL = 7850;

/** Staaf-ids compact: "1, 2, 5" — boven de 12 alleen een aantal. */
function beamIdsText(ids: number[], manyLabel: string): string {
  if (ids.length > 12) return `${ids.length} ${manyLabel}`;
  return ids.join(", ");
}

/**
 * Getal met vaste decimalen en duizendtal-groepering (smalle spatie),
 * zodat grote mm⁴-waarden leesbaar blijven: 251688299 → "251 688 299".
 */
function fmtGroep(v: number, decimals = 0): string {
  const vast = v.toFixed(decimals);
  const [heel, frac] = vast.split(".");
  const gegroepeerd = heel.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac ? `${gegroepeerd}.${frac}` : gegroepeerd;
}

/** mm-maat: integer waar mogelijk, anders 1 decimaal. */
function fmtMaat(v: number): string {
  return fmtNum(v, Number.isInteger(v) ? 0 : 1);
}

/** Enkelwaardige rij (waarde over beide y/z-kolommen). */
interface EnkelRij { label: string; value: string }
/** y/z-paar-rij. */
interface PaarRij { label: string; y: string; z: string }

const CEL_STIJL: CSSProperties = { paddingRight: "6mm", whiteSpace: "nowrap" };

export default function SectionsSection() {
  const { t } = useTranslation("ribbon");
  const { beams } = useReportData();

  // Unieke profielen, in volgorde van eerste gebruik; het materiaal van de
  // eerste staaf bepaalt de staal/hout-route (zelfde als de solver per staaf).
  // De profielnaam wordt hier NIET aangevuld met een default. Dat gebeurde
  // wel — `b.profile ?? "HEA160"` — en dan liep zo'n staaf verderop door
  // `resolveSection` als een echte HEA160: het rapport drukte de volledige
  // eigenschappentabel van dat profiel af, met de staafnummers erbij, terwijl
  // niemand het gekozen had. De eerlijke melding "doorsnede onbekend" verderop
  // kon daardoor nooit afgaan. Een staaf zonder profiel hoort als zodanig in
  // het rapport te staan.
  const uses = new Map<string, ProfileUse>();
  for (const b of [...beams].sort((a, z) => a.id - z.id)) {
    const profile = b.profile ?? "";
    const material = b.material ?? "S235";
    const existing = uses.get(profile);
    if (existing) existing.beamIds.push(b.id);
    else uses.set(profile, { profile, material, beamIds: [b.id] });
  }
  const profiles = [...uses.values()];

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionSections", "Profielen & doorsneden")}</h2>

      {profiles.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noBeams", "Geen staven in het model.")}
        </p>
      ) : (
        profiles.map(({ profile, material, beamIds }) => {
          const sec = resolveSection(material, profile);
          const timberRect = sec.bron === "hout-bxh" ? parseRechthoek(profile) : null;
          const steelDims =
            sec.bron === "staal-db"
              ? STEEL_SECTION_DIMS[profileLookupKey(profile)]
              : undefined;
          // Eigen doorsnede uit de profieleditor: tekening uit het ontwerp,
          // eigenschappen zoals de motor ze heeft bepaald — geen herberekening.
          const eigen = sec.bron === "eigen" ? zoekEigenDoorsnede(profile) : undefined;
          const eigenProps = eigen?.eigenschappen;
          const shape: SectionShape | null = timberRect
            ? { type: "rect", b: timberRect.b, h: timberRect.h }
            : steelShape(steelDims);

          if (sec.bron === "default") {
            // Onbekende of ontbrekende doorsnede: dat zegt de solver ook
            // hardop — hier dus geen eigenschappen tonen die niet van dit
            // profiel zijn.
            return (
              <div className="rpt-profile-block" key={profile || "(geen profiel)"}>
                <h3 className="rpt-h3">
                  {profile || t("report.noProfileTitle", "Geen profiel toegewezen")}
                </h3>
                <p className="rpt-empty-note">
                  {profile
                    ? t(
                        "report.unknownSection",
                        "Doorsnede onbekend — dit profiel staat niet in de profieldatabase en is geen rechthoek b×h. De solver rekent met de default (HEA 160 / S235).",
                      )
                    : t(
                        "report.noProfileNote",
                        "Aan deze staven is nog geen profiel toegewezen. De solver rekent ze door met de default (HEA 160 / S235) en de normtoetsing slaat ze over. Wijs een profiel toe via de staafeigenschappen.",
                      )}
                </p>
                <p className="rpt-note">
                  {t("report.propUsedBy", "Toegepast op staaf")}:{" "}
                  {beamIdsText(beamIds, t("report.beamsWord", "staven"))}
                </p>
              </div>
            );
          }

          // Op 1 decimaal afronden en dáárna pas "is het een geheel getal?"
          // beslissen — de staaltabel bevat floats als 3879.9999999999995.
          const aAfgerond = Math.round(sec.A * 10) / 10;

          // --- Bovendeel: materiaal + hoofdafmetingen + A (+ G bij staal) ---
          const kopRijen: EnkelRij[] = [
            { label: t("report.propMaterial", "Materiaal"), value: material },
          ];
          if (steelDims) {
            const isBuis =
              steelDims.kind === "Shs" || steelDims.kind === "Rhs" || steelDims.kind === "Chs";
            if (steelDims.kind === "Chs") {
              kopRijen.push({ label: "d [mm]", value: fmtMaat(steelDims.h) });
            } else {
              kopRijen.push({ label: "h [mm]", value: fmtMaat(steelDims.h) });
              kopRijen.push({ label: "b [mm]", value: fmtMaat(steelDims.b) });
            }
            kopRijen.push({
              label: isBuis ? "t [mm]" : "tw [mm]",
              value: fmtMaat(steelDims.tw),
            });
            if (steelDims.kind === "ISection" || steelDims.kind === "Channel") {
              kopRijen.push({ label: "tf [mm]", value: fmtMaat(steelDims.tf) });
              kopRijen.push({ label: "r [mm]", value: fmtMaat(steelDims.r) });
            }
          }
          if (timberRect) {
            kopRijen.push({ label: "b [mm]", value: fmtNum(timberRect.b, 0) });
            kopRijen.push({ label: "h [mm]", value: fmtNum(timberRect.h, 0) });
          }
          if (eigenProps) {
            kopRijen.push({ label: "h [mm]", value: fmtMaat(eigenProps.h_mm) });
            kopRijen.push({ label: "b [mm]", value: fmtMaat(eigenProps.b_mm) });
          }
          kopRijen.push({
            label: "A [mm²]",
            value: Number.isInteger(aAfgerond) ? fmtGroep(aAfgerond) : fmtGroep(aAfgerond, 1),
          });
          if (steelDims || eigenProps) {
            // Massa per meter: G = A × ρ (7850 kg/m³ voor constructiestaal).
            kopRijen.push({
              label: "G [kg/m]",
              value: fmtNum((sec.A * DICHTHEID_STAAL) / 1e6, 1),
            });
          }

          // --- Middendeel: grootheden per as (y = sterke as, z = zwakke as) ---
          const paarRijen: PaarRij[] = [];
          const props = steelDims?.props;
          if (props) {
            paarRijen.push({
              label: "I [mm⁴]",
              y: fmtGroep(sec.I),
              z: fmtGroep(props.iz),
            });
            paarRijen.push({
              label: "i [mm]",
              y: fmtNum(props.iRadY, 1),
              z: fmtNum(props.iRadZ, 1),
            });
            paarRijen.push({
              label: "Wel [mm³]",
              y: fmtGroep(props.welY),
              z: fmtGroep(props.welZ),
            });
            paarRijen.push({
              label: "Wpl [mm³]",
              y: fmtGroep(props.wplY),
              z: fmtGroep(props.wplZ),
            });
          } else if (eigenProps && eigen) {
            // Eigen doorsnede: wat de motor niet kon bepalen (Wpl bij losse
            // delen) staat als "—", niet als nul.
            const wpl = eigen.motor.wpl_bepaald;
            paarRijen.push({
              label: "I [mm⁴]",
              y: fmtGroep(eigenProps.iy_mm4),
              z: fmtGroep(eigenProps.iz_mm4),
            });
            paarRijen.push({
              label: "i [mm]",
              y: fmtNum(eigenProps.iy_radius_mm, 1),
              z: fmtNum(eigenProps.iz_radius_mm, 1),
            });
            paarRijen.push({
              label: "Wel [mm³]",
              y: fmtGroep(eigenProps.wel_y_mm3),
              z: fmtGroep(eigenProps.wel_z_mm3),
            });
            paarRijen.push({
              label: "Wpl [mm³]",
              y: wpl ? fmtGroep(eigenProps.wpl_y_mm3) : "—",
              z: wpl ? fmtGroep(eigenProps.wpl_z_mm3) : "—",
            });
          } else if (timberRect) {
            // Hout: rechthoek b×h — alles daaruit berekend (zelfde formules
            // als de solver: I = b·h³/12, en W = I/(h/2)).
            const { b, h } = timberRect;
            paarRijen.push({
              label: "I [mm⁴]",
              y: fmtGroep((b * h * h * h) / 12),
              z: fmtGroep((h * b * b * b) / 12),
            });
            paarRijen.push({
              label: "W [mm³]",
              y: fmtGroep((b * h * h) / 6),
              z: fmtGroep((h * b * b) / 6),
            });
          }

          // --- Onderdeel: afschuiving/torsie/welving (alleen staal) + E ---
          const slotRijen: EnkelRij[] = [];
          if (props) {
            slotRijen.push({ label: "Av;z [mm²]", value: fmtGroep(props.avZ) });
            slotRijen.push({ label: "It [mm⁴]", value: fmtGroep(props.it) });
            slotRijen.push({
              label: "Iw [×10⁹ mm⁶]",
              value: fmtGroep(props.iw / 1e9, props.iw >= 1e11 ? 0 : 2),
            });
          } else if (eigenProps && eigen) {
            slotRijen.push({ label: "Av;z [mm²]", value: fmtGroep(eigenProps.av_z_mm2) });
            slotRijen.push({ label: "It [mm⁴]", value: fmtGroep(eigenProps.it_mm4) });
            slotRijen.push({
              label: "Iw [×10⁹ mm⁶]",
              value: eigen.motor.iw_bepaald
                ? fmtGroep(eigenProps.iw_mm6 / 1e9, eigenProps.iw_mm6 >= 1e11 ? 0 : 2)
                : t("report.notDetermined", "niet bepaald"),
            });
          }
          slotRijen.push({ label: "E [N/mm²]", value: fmtGroep(sec.E) });
          slotRijen.push({
            label: t("report.propUsedBy", "Toegepast op staaf"),
            value: beamIdsText(beamIds, t("report.beamsWord", "staven")),
          });

          return (
            <div className="rpt-profile-block" key={profile}>
              <h3 className="rpt-h3">{eigen ? eigen.naam : profile}</h3>
              <div className="rpt-profile-body">
                {/* Generieke figuurconventie: figuurblok + vet bijschrift. */}
                <div className="rpt-profile-sketch rpt-figuur">
                  {eigen ? (
                    <>
                      <EigenDoorsnedeTekening doorsnede={eigen} stijl="rapport" />
                      <div className="rpt-figuur-bijschrift">
                        {t("report.figSection", "Doorsnede")} {eigen.naam}
                      </div>
                      {eigen.motor.meldingen.length > 0 && (
                        <p className="rpt-note">{eigen.motor.meldingen.join(" ")}</p>
                      )}
                    </>
                  ) : shape ? (
                    <>
                      <SectionSketch shape={shape} />
                      <div className="rpt-figuur-bijschrift">
                        {t("report.figSection", "Doorsnede")} {profile}
                      </div>
                    </>
                  ) : (
                    <p className="rpt-note">
                      {t("report.noSketch", "Geen tekening beschikbaar voor deze profielvorm.")}
                    </p>
                  )}
                </div>
                <table className="rpt-meta-table rpt-profile-props">
                  <tbody>
                    {kopRijen.map(({ label, value }) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td colSpan={2}>{value}</td>
                      </tr>
                    ))}
                    {paarRijen.length > 0 && (
                      <tr>
                        <th scope="row" aria-hidden="true" />
                        <td style={{ ...CEL_STIJL, fontStyle: "italic", color: "#555" }}>y</td>
                        <td style={{ fontStyle: "italic", color: "#555" }}>z</td>
                      </tr>
                    )}
                    {paarRijen.map(({ label, y, z }) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td style={CEL_STIJL}>{y}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{z}</td>
                      </tr>
                    ))}
                    {slotRijen.map(({ label, value }) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td colSpan={2}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
