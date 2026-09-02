/**
 * SectionsSection — "Profielen & doorsneden": per uniek profiel in het model
 * één blok met een parametrische doorsnede-tekening (SectionSketch) en een
 * eigenschappentabel.
 *
 * Bronnen — dezelfde als de solver, geen duplicatie:
 *  - staal: A/Iy via resolveSection → lib/steelSections.generated.ts;
 *    hoofdafmetingen (h/b/tw/tf) uit lib/steelSectionDims.generated.ts
 *    (beide gegenereerd uit de Rust-profieldatabase);
 *  - hout: b×h uit de profielnaam, A en Iy berekend door resolveSection
 *    (lib/sectionResolver.ts — geïmporteerd, niet gedupliceerd).
 * Onbekende combinaties worden eerlijk gemeld — geen verzonnen doorsnede.
 */
import { useTranslation } from "react-i18next";
import { resolveSection, parseRechthoek } from "../../../lib/sectionResolver";
import { profileLookupKey } from "../../../lib/steelCheckBuilder";
import {
  STEEL_SECTION_DIMS,
  type SteelSectionDims,
} from "../../../lib/steelSectionDims.generated";
import { useReportData } from "../ReportDataContext";
import { fmtNum } from "../reportFormat";
import SectionSketch, { type SectionShape } from "./SectionSketch";

interface ProfileUse {
  profile: string;
  material: string;
  beamIds: number[];
}

/** Staaldims → tekenvorm; null wanneer we de vorm niet kennen. */
function steelShape(dims: SteelSectionDims | undefined): SectionShape | null {
  if (!dims) return null;
  switch (dims.kind) {
    case "ISection":
      return { type: "isection", h: dims.h, b: dims.b, tw: dims.tw, tf: dims.tf };
    case "Channel":
      return { type: "channel", h: dims.h, b: dims.b, tw: dims.tw, tf: dims.tf };
    case "Shs":
    case "Rhs":
      return { type: "box", h: dims.h, b: dims.b, t: dims.tw };
    case "Chs":
      return { type: "tube", d: dims.h, t: dims.tw };
  }
}

/** Staaf-ids compact: "1, 2, 5" — boven de 12 alleen een aantal. */
function beamIdsText(ids: number[], manyLabel: string): string {
  if (ids.length > 12) return `${ids.length} ${manyLabel}`;
  return ids.join(", ");
}

export default function SectionsSection() {
  const { t } = useTranslation("ribbon");
  const { beams } = useReportData();

  // Unieke profielen, in volgorde van eerste gebruik; het materiaal van de
  // eerste staaf bepaalt de staal/hout-route (zelfde als de solver per staaf).
  const uses = new Map<string, ProfileUse>();
  for (const b of [...beams].sort((a, z) => a.id - z.id)) {
    const profile = b.profile ?? "HEA160";
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
          const shape: SectionShape | null = timberRect
            ? { type: "rect", b: timberRect.b, h: timberRect.h }
            : steelShape(steelDims);

          const rows: Array<{ label: string; value: string }> = [];
          rows.push({
            label: t("report.propMaterial", "Materiaal"),
            value: material,
          });
          if (sec.bron === "default") {
            // Onbekende combinatie: dat zegt de solver ook hardop — hier dus
            // geen eigenschappen tonen die niet van dit profiel zijn.
            return (
              <div className="rpt-profile-block" key={profile}>
                <h3 className="rpt-h3">{profile}</h3>
                <p className="rpt-empty-note">
                  {t(
                    "report.unknownSection",
                    "Doorsnede onbekend — dit profiel staat niet in de profieldatabase en is geen rechthoek b×h. De solver rekent met de default (HEA 160 / S235).",
                  )}
                </p>
              </div>
            );
          }
          if (steelDims) {
            rows.push({ label: "h [mm]", value: fmtNum(steelDims.h, Number.isInteger(steelDims.h) ? 0 : 1) });
            rows.push({ label: "b [mm]", value: fmtNum(steelDims.b, Number.isInteger(steelDims.b) ? 0 : 1) });
            rows.push({ label: steelDims.kind === "Shs" || steelDims.kind === "Rhs" || steelDims.kind === "Chs" ? "t [mm]" : "tw [mm]", value: fmtNum(steelDims.tw, Number.isInteger(steelDims.tw) ? 0 : 1) });
            if (steelDims.kind === "ISection" || steelDims.kind === "Channel") {
              rows.push({ label: "tf [mm]", value: fmtNum(steelDims.tf, Number.isInteger(steelDims.tf) ? 0 : 1) });
            }
          }
          if (timberRect) {
            rows.push({ label: "b [mm]", value: fmtNum(timberRect.b, 0) });
            rows.push({ label: "h [mm]", value: fmtNum(timberRect.h, 0) });
          }
          // Op 1 decimaal afronden en dáárna pas "is het een geheel getal?"
          // beslissen — de staaltabel bevat floats als 3879.9999999999995.
          const aRounded = Math.round(sec.A * 10) / 10;
          rows.push({
            label: "A [mm²]",
            value: Number.isInteger(aRounded) ? String(aRounded) : aRounded.toFixed(1),
          });
          rows.push({
            label: "Iy [×10⁶ mm⁴]",
            value: fmtNum(sec.I / 1e6, 2),
          });
          rows.push({ label: "E [N/mm²]", value: fmtNum(sec.E, 0) });
          rows.push({
            label: t("report.propUsedBy", "Toegepast op staaf"),
            value: beamIdsText(beamIds, t("report.beamsWord", "staven")),
          });

          return (
            <div className="rpt-profile-block" key={profile}>
              <h3 className="rpt-h3">{profile}</h3>
              <div className="rpt-profile-body">
                <div className="rpt-profile-sketch">
                  {shape ? (
                    <SectionSketch shape={shape} />
                  ) : (
                    <p className="rpt-note">
                      {t("report.noSketch", "Geen tekening beschikbaar voor deze profielvorm.")}
                    </p>
                  )}
                </div>
                <table className="rpt-meta-table rpt-profile-props">
                  <tbody>
                    {rows.map(({ label, value }) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{value}</td>
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
