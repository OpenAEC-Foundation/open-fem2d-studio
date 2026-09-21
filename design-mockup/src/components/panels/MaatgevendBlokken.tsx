/**
 * MaatgevendBlokken — wat maatgevend is, zichtbaar zonder zoeken (issue #41).
 *
 * Vier bouwstenen voor het toetsingspaneel, alle gevoed door
 * `lib/maatgevend.ts` (de afleiding is daar getest; hier staat alleen beeld):
 *
 *  - `UcBalkje`        de unity check als balkje, 0–1 en daarboven;
 *  - `MaatgevendRegel` de samenvattingsregel van een staaf of plaat: toets met
 *                      artikel, combinatie en positie, en de knop naar het
 *                      tekenvlak;
 *  - `ToetsLijst`      alle toetsen met balkje, herkomst en het label
 *                      "maatgevend"; op UC of in normvolgorde;
 *  - `ModelMaatgevendBlok` het maatgevende onderdeel van het hele model en per
 *                      materiaal, met een klik naar die staaf of plaat.
 *
 * NIET ALLEEN KLEUR. De drie klassen goed / let op / overschreden hebben elk
 * een eigen teken (✓ ! ✗) en de overschrijding een gearceerd balkje; de
 * maatgevende toets draagt het WOORD "maatgevend". Wie geen kleur ziet, mist
 * zo niets.
 *
 * Combinatie en positie staan er alleen als de kern ze levert. De
 * doorbuigingstoetsen dragen bijvoorbeeld geen combinatie; daar staat dan
 * niets, in plaats van "combinatie 0, x = 0 mm".
 */
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  sorteerRegels,
  ucBalk,
  type MaatgevendOverzicht,
  type MaatgevendSoort,
  type ModelMaatgevend,
  type ToetsRegel,
  type ToetsVolgorde,
  type UcKlasse,
} from "../../lib/maatgevend";
import { splitsArtikel } from "../report/checkReportUtils";

/** Waar het tekenvlak naartoe moet: een staaf of plaat, met combinatie en plek. */
export interface TekenvlakDoel {
  beamId?: number;
  plateId?: number;
  combinatieId: number | null;
  positieMm: number | null;
}

/** Naam bij een combinatienummer, voor wie meer wil zien dan het nummer. */
export type CombinatieNamen = ReadonlyMap<number, string>;

const TEKEN: Record<UcKlasse, string> = { goed: "✓", letop: "!", overschreden: "✗" };

/** Twee decimalen, decimaalkomma; een onbegrensde UC als ∞. */
export function fmtUcPaneel(uc: number): string {
  if (!Number.isFinite(uc) || uc === Number.MAX_VALUE) return "∞";
  return uc.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const fmtMm = (v: number) => v.toLocaleString("nl-NL", { maximumFractionDigits: 0 });

/** De unity check als balkje met het streepje UC = 1,0 op twee derde. */
export function UcBalkje({ uc }: { uc: number }) {
  const { t } = useTranslation("check");
  const b = ucBalk(uc);
  const label = `UC ${fmtUcPaneel(uc)} — ${t(`maatgevend.klasse.${b.klasse}`)}`;
  return (
    <span className={`cp-ucbalk cp-ucbalk-${b.klasse}`} role="img" aria-label={label} title={label}>
      <span className="cp-ucbalk-vulling" style={{ width: `${b.vullingPct}%` }} />
      <span className="cp-ucbalk-grens" style={{ left: `${b.grensPct}%` }} />
      {b.afgekapt && <span className="cp-ucbalk-afgekapt" aria-hidden="true">›</span>}
    </span>
  );
}

/** "✓ 0,79" — teken en getal, in de kleur van de klasse. */
export function UcWaarde({ uc }: { uc: number }) {
  const { t } = useTranslation("check");
  const klasse = ucBalk(uc).klasse;
  return (
    <span className={`cp-ucwaarde cp-ucwaarde-${klasse}`} title={t(`maatgevend.klasse.${klasse}`)}>
      <span aria-hidden="true">{TEKEN[klasse]}</span> {fmtUcPaneel(uc)}
      <span className="cp-sr-only"> {t(`maatgevend.klasse.${klasse}`)}</span>
    </span>
  );
}

/** "comb. 4 (UGT 6.10b) · x = 3 000 mm" — alleen wat de kern levert. */
export function herkomstTekst(regel: ToetsRegel, namen: CombinatieNamen | undefined, t: TFunction): string {
  const delen: string[] = [];
  if (regel.combinatieId !== null) {
    const naam = namen?.get(regel.combinatieId);
    delen.push(
      naam
        ? t("maatgevend.combinatieMetNaam", { id: regel.combinatieId, naam })
        : t("maatgevend.combinatie", { id: regel.combinatieId }),
    );
  }
  if (regel.elementId !== null) delen.push(t("maatgevend.element", { id: regel.elementId }));
  if (regel.positieMm !== null) delen.push(t("maatgevend.positie", { x: fmtMm(regel.positieMm) }));
  return delen.join(" · ");
}

function doelVan(o: MaatgevendOverzicht, regel: ToetsRegel): TekenvlakDoel {
  return {
    ...(o.isPlaat ? { plateId: o.objectId } : { beamId: o.objectId }),
    combinatieId: regel.combinatieId,
    positieMm: regel.positieMm,
  };
}

/**
 * De samenvattingsregel onder de kop van een kaart. Staat BUITEN de knop van
 * de kop: een knop in een knop is ongeldige HTML, en deze regel heeft zijn
 * eigen handeling (naar het tekenvlak), los van open- en dichtklappen.
 */
export function MaatgevendRegel({ overzicht, namen, onToon }: {
  overzicht: MaatgevendOverzicht;
  namen?: CombinatieNamen;
  onToon?: (doel: TekenvlakDoel) => void;
}) {
  const { t } = useTranslation("check");
  const m = overzicht.maatgevend;
  if (!m) {
    return (
      <div className="cp-maatgevend cp-maatgevend-leeg">
        {overzicht.kernMelding ?? t("maatgevend.geen")}
      </div>
    );
  }
  const artikel = m.artikel ? splitsArtikel(m.artikel).artikel : "";
  const herkomst = herkomstTekst(m, namen, t);
  const inhoud = (
    <>
      <span className="cp-maatgevend-label">{t("maatgevend.label")}</span>
      <span className="cp-maatgevend-tekst">
        <span className="cp-maatgevend-titel">{m.titel}</span>
        {artikel && <span className="cp-maatgevend-artikel"> — {artikel}</span>}
        {herkomst && <span className="cp-maatgevend-herkomst"> · {herkomst}</span>}
      </span>
      <UcBalkje uc={m.uc as number} />
      <UcWaarde uc={m.uc as number} />
    </>
  );
  // Een geweigerde staaf: de kern zet zijn reden waar anders de maatgevende
  // toets staat ("NIET TOETSBAAR: …"). Die reden blijft voorop staan; de
  // hoogste UC van wat wél gerekend is staat eronder.
  const melding = overzicht.kernMelding ? (
    <div className="cp-card-onuitgevoerd">{overzicht.kernMelding}</div>
  ) : null;
  // Zonder combinatie valt er op het tekenvlak niets in te stellen; dan is de
  // regel gewone tekst en geen knop die niets doet.
  if (!onToon || m.combinatieId === null) {
    return <>{melding}<div className="cp-maatgevend">{inhoud}</div></>;
  }
  return (
    <>
    {melding}
    <button
      type="button"
      className="cp-maatgevend cp-maatgevend-knop"
      title={t("maatgevend.toonOpTekenvlak")}
      onClick={() => onToon(doelVan(overzicht, m))}
    >
      {inhoud}
      <span className="cp-maatgevend-pijl" aria-hidden="true">⌖</span>
      <span className="cp-sr-only">{t("maatgevend.toonOpTekenvlak")}</span>
    </button>
    </>
  );
}

/** Alle toetsen van één staaf of plaat, met de keuze van de volgorde. */
export function ToetsLijst({ overzicht, volgorde, onVolgorde, namen, onToon }: {
  overzicht: MaatgevendOverzicht;
  volgorde: ToetsVolgorde;
  onVolgorde: (v: ToetsVolgorde) => void;
  namen?: CombinatieNamen;
  onToon?: (doel: TekenvlakDoel) => void;
}) {
  const { t } = useTranslation("check");
  if (overzicht.regels.length === 0) return null;
  const regels = sorteerRegels(overzicht.regels, volgorde);
  return (
    <div className="cp-toetslijst">
      <div className="cp-toetslijst-kop">
        <span className="cp-toetslijst-titel">{t("maatgevend.lijstTitel")}</span>
        <span className="cp-toetslijst-volgorde" role="group" aria-label={t("maatgevend.volgorde")}>
          <span className="cp-toetslijst-volgorde-label">{t("maatgevend.volgorde")}:</span>
          {(["uc", "norm"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`cp-volgorde-knop${volgorde === v ? " actief" : ""}`}
              aria-pressed={volgorde === v}
              onClick={() => onVolgorde(v)}
            >
              {t(v === "uc" ? "maatgevend.volgordeUc" : "maatgevend.volgordeNorm")}
            </button>
          ))}
        </span>
      </div>
      <ul className="cp-toetslijst-regels">
        {regels.map((r) => {
          const herkomst = herkomstTekst(r, namen, t);
          const artikel = r.artikel ? splitsArtikel(r.artikel).artikel : "";
          return (
            <li
              key={r.id}
              className={`cp-toetsregel${r.maatgevend ? " cp-toetsregel-maatgevend" : ""}${r.teltMee ? "" : " cp-toetsregel-nietmee"}`}
            >
              <div className="cp-toetsregel-hoofd">
                <span className="cp-toetsregel-naam">
                  {r.titel}
                  {artikel && <span className="cp-toetsregel-artikel"> — {artikel}</span>}
                  {r.maatgevend && <span className="cp-maatgevend-label">{t("maatgevend.label")}</span>}
                </span>
                {r.teltMee && r.uc !== null ? (
                  <>
                    <UcBalkje uc={r.uc} />
                    <UcWaarde uc={r.uc} />
                  </>
                ) : (
                  <span className="cp-toetsregel-geenuc">
                    {t(r.nietMeeReden === "nvt" ? "maatgevend.nvt" : "maatgevend.geenUc")}
                    {" — "}
                    {t("maatgevend.teltNietMee")}
                  </span>
                )}
              </div>
              {herkomst && (
                <div className="cp-toetsregel-herkomst">
                  {herkomst}
                  {onToon && r.combinatieId !== null && (
                    <button
                      type="button"
                      className="cp-toetsregel-toon"
                      title={t("maatgevend.toonOpTekenvlak")}
                      aria-label={`${t("maatgevend.toonOpTekenvlak")}: ${r.titel}`}
                      onClick={() => onToon(doelVan(overzicht, r))}
                    >
                      ⌖
                    </button>
                  )}
                </div>
              )}
              {r.redenen.length > 0 && (
                <ul className="cp-toetsregel-redenen">
                  {r.redenen.map((reden, i) => (
                    <li key={i}>{reden}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {overzicht.aantalTeltNietMee > 0 && (
        <div className="cp-toetslijst-voet">
          {t("maatgevend.nietMeeVoet", { count: overzicht.aantalTeltNietMee })}
        </div>
      )}
    </div>
  );
}

function objectNaam(o: MaatgevendOverzicht, t: TFunction): string {
  return `${o.isPlaat ? t("plaat.plaat") : t("beam")} ${o.objectId}`;
}

/** Het maatgevende onderdeel van het model, en per materiaal. */
export function ModelMaatgevendBlok({ model, namen, onKies }: {
  model: ModelMaatgevend;
  namen?: CombinatieNamen;
  /** Klik: naar die staaf of plaat (kaart open, tekenvlak erop). */
  onKies: (o: MaatgevendOverzicht) => void;
}) {
  const { t } = useTranslation("check");
  const top = model.model;
  if (!top || !top.maatgevend) return null;
  const m = top.maatgevend;
  const artikel = m.artikel ? splitsArtikel(m.artikel).artikel : "";
  const herkomst = herkomstTekst(m, namen, t);
  const soortNaam = (s: MaatgevendSoort) => t(`maatgevend.soort.${s}`);
  return (
    <section className="cp-model" aria-label={t("maatgevend.modelTitel")}>
      <div className="cp-model-titel">{t("maatgevend.modelTitel")}</div>
      <button
        type="button"
        className="cp-model-top"
        title={t("maatgevend.naarOnderdeel", { onderdeel: objectNaam(top, t) })}
        onClick={() => onKies(top)}
      >
        <span className="cp-model-object">{objectNaam(top, t)}</span>
        <span className="cp-maatgevend-tekst">
          <span className="cp-maatgevend-titel">{m.titel}</span>
          {artikel && <span className="cp-maatgevend-artikel"> — {artikel}</span>}
          {herkomst && <span className="cp-maatgevend-herkomst"> · {herkomst}</span>}
        </span>
        <UcBalkje uc={m.uc as number} />
        <UcWaarde uc={m.uc as number} />
      </button>
      {model.perSoort.length > 1 && (
        <ul className="cp-model-soorten">
          {model.perSoort.map(({ soort, overzicht }) => (
            <li key={soort}>
              <button
                type="button"
                className="cp-model-soort"
                title={t("maatgevend.naarOnderdeel", { onderdeel: objectNaam(overzicht, t) })}
                onClick={() => onKies(overzicht)}
              >
                <span className="cp-model-soort-naam">{soortNaam(soort)}</span>
                <span className="cp-model-soort-object">{objectNaam(overzicht, t)}</span>
                <span className="cp-model-soort-toets">{overzicht.maatgevend!.titel}</span>
                <UcWaarde uc={overzicht.maatgevend!.uc as number} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {model.aantalZonderMaatgevend > 0 && (
        <div className="cp-model-voet">
          {t("maatgevend.zonderMaatgevend", { count: model.aantalZonderMaatgevend })}
        </div>
      )}
    </section>
  );
}
