/**
 * BetonStaafVenster — het venster onderin bij een geselecteerde betonstaaf.
 *
 * ── WAT ER TE ZIEN IS ──────────────────────────────────────────────────────
 *
 * Links de AANZICHT van de staaf met zijn opleggingen, zijn lengte en de
 * wapening die er werkelijk ligt, met daaromheen vier lagen die elk los aan en
 * uit gaan: de momentendekking (§9.2.1.3), de dwarskrachtdekking (§6.2), de
 * scheurwijdte over de lengte (§7.3.4) en de unity checks per snede als
 * kleurbalk. Rechts de DOORSNEDE — dezelfde `DoorsnedeTekening` die de
 * profielkiezer en het rapport gebruiken — met de korf die op de AANGEWEZEN
 * snede ligt, en daaronder wat er op die snede te lezen valt. Onderin de
 * zone-invoer: waar begint een staaflaag en waar houdt zij op.
 *
 * ── WAAR HET VENSTER VOOR IS ───────────────────────────────────────────────
 *
 * Niet om te laten zien DAT er een lijn is, maar waar de wapening tekortschiet
 * en waar zij ruimte heeft. Daarom: het vlak onder de weerstandslijn is groen
 * (dat is de ruimte), het stuk waar de benodigde lijn eroverheen komt is rood
 * (dat is het tekort), en de maatgevende plaats die de rekenkern zelf heeft
 * aangewezen staat er met zijn unity check bij. De aanwijzer springt bij het
 * openen naar díe plaats.
 *
 * ── WELKE GEGEVENS HET LEEST, EN WAAROM DIE EN GEEN ANDERE ─────────────────
 *
 * De tekening wordt gevoed uit `useCheckStore.lastRunData` — de knopen, staven,
 * combinaties en resultaten waarmee de laatste toetsing is gedraaid. Dat is één
 * samenhangende verzameling: de omhullende hoort bij de zones waarmee zij is
 * doorgerekend, want de zonegrenzen zijn REKENKNOPEN (zie
 * `lib/betonZoneSneden.ts`). Wie de live zones met de vorige omhullende zou
 * combineren, zet een benodigde kracht van elders naast een weerstand van hier.
 *
 * De zone-EDITOR werkt wél op de live staaf, want daar wordt getypt. Lopen de
 * twee uiteen — dat duurt tot de volgende rekengang, ongeveer een halve
 * seconde — dan staat dat er met zoveel woorden bij en niet als een lijn die er
 * al klopt.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Beam, Node, Support } from "../../fem/femTypes";
import type { ConcreteBeamCheckInput } from "../../../lib/types/concrete/ConcreteBeamCheckInput";
import type { DekkingslijnAntwoord } from "../../../lib/types/concrete/DekkingslijnAntwoord";
import type { ReinforcementCage } from "../../../lib/types/concrete/ReinforcementCage";
import type { ReinforcementZones } from "../../../lib/types/concrete/ReinforcementZones";
import { bEffWaardenPerStaaf } from "../../../lib/beffLiggerlijn";
import {
  bouwDekkingslijnVerzoeken,
  haalDekkingslijn,
  ontbrekendeZoneStations,
} from "../../../lib/betonDekkingslijnBuilder";
import { parseConcreteSection } from "../../../lib/betonCheckBuilder";
import { zoneGrenzenMm } from "../../../lib/betonZoneSneden";
import { getConcreteClasses, korvenUitStaven, roepKern, useCheckStore } from "../../../stores/checkStore";
import DoorsnedeTekening from "../DoorsnedeTekening";
import { STANDAARD_KORF, maat, nl, type Wapeningskorf } from "../wapeningskorf";
import AanzichtTekening, {
  type BeugelTekening,
  type BundelTekening,
  type OplegTekening,
} from "./AanzichtTekening";
import ZoneEditor from "./ZoneEditor";
import {
  LAGEN,
  STANDAARD_LAGEN,
  dwarskrachtLaan,
  momentLaan,
  omhullendeLijn,
  puntBijX,
  ucKlasse,
  ucVerloop,
  voegUcVakkenSamen,
  UC_KLEUR,
  type Laan,
  type LaagId,
  type LaagVlaggen,
  type LijnPunt,
} from "./dekkingLagen";
import { haalScheurwijdteLijn, type ScheurwijdteLijn } from "./scheurwijdteLijn";
import { korfOpX } from "./zoneModel";
// De laagschakelaars zijn LETTERLIJK de schakelaars van de resultatenlijst in
// de verkenner (`fem-results-toggle` + `fem-switch`). Een eigen soort
// schakelaar verzinnen zou betekenen dat dezelfde handeling er in dit venster
// anders uitziet dan drie centimeter verderop; daarom wordt de stylesheet van
// die lijst hier meegeladen in plaats van nagebouwd.
import "../../fem/FemProjectTree.css";
import "../beton.css";
import "./dekking.css";

/** Rust tussen de laatste wijziging en het opnieuw opvragen van de lijn. */
const VERTRAGING_MS = 250;

interface Props {
  /** De geselecteerde betonstaaf, zoals hij nu in het model staat. */
  beam: Beam;
  nodes: Node[];
  supports: Support[];
  updateBeam?: (id: number, updates: Partial<Beam>) => void;
  /** Sluit het venster (de kruisknop in de werkbalk van het dock). */
  onSluiten?: () => void;
}

export default function BetonStaafVenster({ beam, nodes, supports, updateBeam, onSluiten }: Props) {
  const [lagen, setLagen] = useState<LaagVlaggen>(STANDAARD_LAGEN);
  const [cursorXMm, setCursorXMm] = useState<number | null>(null);
  const [antwoord, setAntwoord] = useState<DekkingslijnAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [scheur, setScheur] = useState<ScheurwijdteLijn | null>(null);
  const [scheurBezig, setScheurBezig] = useState(false);
  const [scheurFout, setScheurFout] = useState<string | null>(null);
  const [klassen, setKlassen] = useState<string[] | undefined>(undefined);
  const volgnummer = useRef(0);
  const scheurVolgnummer = useRef(0);

  const lastRunData = useCheckStore((s) => s.lastRunData);
  const beff = useCheckStore((s) => s.beff);

  // De betonsterkteklassen van de kern; zonder deze lijst valt de bouwer op
  // zijn statische lijst terug en herkent hij een klasse die de kern wél kent
  // mogelijk niet.
  useEffect(() => {
    let actief = true;
    getConcreteClasses()
      .then((k) => actief && setKlassen(k))
      .catch(() => undefined);
    return () => {
      actief = false;
    };
  }, []);

  // ── De staaf zoals hij is doorgerekend, en zoals hij nu is ───────────────
  const gerekendeStaaf = lastRunData?.beams.find((b) => b.id === beam.id) ?? null;
  const liveZones = beam.checkConfig?.betonZones;
  const gerekendeZones = gerekendeStaaf?.checkConfig?.betonZones;
  const looptAchter =
    lastRunData !== null &&
    JSON.stringify(liveZones ?? null) !== JSON.stringify(gerekendeZones ?? null);

  const knoopVan = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const a = knoopVan.get(beam.from);
  const b = knoopVan.get(beam.to);
  const lengteMm = a && b ? Math.hypot(b.x - a.x, b.z - a.z) * 1000 : 0;

  const doorsnede = parseConcreteSection(beam.profile);
  const korf: ReinforcementCage = beam.checkConfig?.betonKorf ?? STANDAARD_KORF.korf;
  const restKorf: Omit<Wapeningskorf, "korf" | "doorsnede"> = {
    betonklasse: beam.material ?? STANDAARD_KORF.betonklasse,
    staalsoort: beam.checkConfig?.betonStaalsoort ?? STANDAARD_KORF.staalsoort,
    milieuklasse: beam.checkConfig?.betonMilieuklasse ?? null,
    constructieklasse: beam.checkConfig?.betonConstructieklasse ?? null,
    aantalStroken: beam.checkConfig?.betonStroken ?? STANDAARD_KORF.aantalStroken,
    staaltak: beam.checkConfig?.betonStaaltak ?? STANDAARD_KORF.staaltak,
  };

  // ── De toetsinvoer van deze staaf, uit dezelfde bouwer als de toetsing ───
  const verzoek = useMemo(() => {
    if (!lastRunData) return null;
    const { verzoeken, skipped } = bouwDekkingslijnVerzoeken({
      nodes: lastRunData.nodes,
      beams: lastRunData.beams,
      combinations: lastRunData.combinations,
      combinationResults: lastRunData.combinationResults,
      korven: korvenUitStaven(lastRunData.beams),
      supportedClasses: klassen,
      bEffPerStaaf: bEffWaardenPerStaaf(beff),
    });
    const eigen = verzoeken.find((v) => v.beam.beam_id === beam.id);
    if (eigen) return { verzoek: eigen, reden: null as string | null };
    const over = skipped.find((s) => s.beamId === beam.id);
    return { verzoek: null, reden: over?.reason ?? "deze staaf is niet als betonstaaf herkend" };
  }, [lastRunData, klassen, beff, beam.id]);

  // ── De dekkingslijn opvragen ─────────────────────────────────────────────
  useEffect(() => {
    if (!verzoek) return;
    if (!verzoek.verzoek) {
      setAntwoord(null);
      setFout(verzoek.reden);
      return;
    }
    const nummer = ++volgnummer.current;
    const v = verzoek.verzoek;
    const timer = window.setTimeout(() => {
      setBezig(true);
      haalDekkingslijn(v)
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
    return () => window.clearTimeout(timer);
  }, [verzoek]);

  // ── De scheurwijdtelijn: alleen wanneer de laag aan staat ────────────────
  //
  // Zij is de enige laag die de rekenkern per snede opnieuw moet aanroepen
  // (§7.3.4 komt uit `check_concrete_beams` voor de maatgevende snede, niet als
  // lijn). Ongevraagd ophalen zou elke selectie seconden kosten.
  useEffect(() => {
    if (!lagen.scheurwijdte || !verzoek?.verzoek) {
      setScheur(null);
      setScheurFout(null);
      return;
    }
    const nummer = ++scheurVolgnummer.current;
    const invoer: ConcreteBeamCheckInput = verzoek.verzoek.beam;
    const zones = invoer.reinforcement_zones;
    setScheurBezig(true);
    haalScheurwijdteLijn(invoer, zones, roepKern)
      .then((r) => {
        if (nummer !== scheurVolgnummer.current) return;
        setScheur(r);
        setScheurFout(null);
      })
      .catch((e: unknown) => {
        if (nummer !== scheurVolgnummer.current) return;
        setScheur(null);
        setScheurFout(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (nummer === scheurVolgnummer.current) setScheurBezig(false);
      });
  }, [lagen.scheurwijdte, verzoek]);

  // ── De lanen ─────────────────────────────────────────────────────────────
  const kleurVan = (id: LaagId) => LAGEN.find((l) => l.id === id)?.swatch ?? "#666";

  const laanBoven: Laan | null = useMemo(
    () => (antwoord && lagen.moment ? momentLaan(antwoord.boven, kleurVan("moment")) : null),
    [antwoord, lagen.moment],
  );
  const laanOnder: Laan | null = useMemo(
    () => (antwoord && lagen.moment ? momentLaan(antwoord.onder, kleurVan("moment")) : null),
    [antwoord, lagen.moment],
  );
  const laanV: Laan | null = useMemo(
    () =>
      antwoord && lagen.dwarskracht
        ? dwarskrachtLaan(
            antwoord.dwarskracht.punten,
            antwoord.dwarskracht.maatgevend,
            kleurVan("dwarskracht"),
          )
        : null,
    [antwoord, lagen.dwarskracht],
  );
  const laanScheur: Laan | null = useMemo(() => {
    if (!lagen.scheurwijdte || !scheur || scheur.punten.length === 0) return null;
    return {
      titel: "Scheurwijdte",
      eenheid: "mm",
      benodigdLabel: "w_k",
      aanwezigLabel: "w_max",
      punten: scheur.punten,
      richting: "omlaag",
      kleur: kleurVan("scheurwijdte"),
    };
  }, [lagen.scheurwijdte, scheur]);

  const lanenOnder = [laanOnder, laanV, laanScheur].filter((l): l is Laan => l !== null);
  const lanenBoven = [laanBoven].filter((l): l is Laan => l !== null);

  // Regel A van figuur 9.2 per laan, op de TITEL van de laan gesleuteld — dat
  // is de enige sleutel die de tekening ook heeft; zij kent de zijden niet.
  const omhullenden = useMemo((): Record<string, { xMm: number; waarde: number }[]> => {
    if (!antwoord || !lagen.moment) return {};
    return {
      "Momentendekking boven": omhullendeLijn(antwoord.boven),
      "Momentendekking onder": omhullendeLijn(antwoord.onder),
    };
  }, [antwoord, lagen.moment]);

  // De kleurbalk verzamelt de unity checks van alle lijnen die er ZIJN, ook
  // wanneer hun eigen laan uit staat: de balk is bedoeld als samenvatting, en
  // een samenvatting die stilletjes een toets weglaat omdat de gebruiker zijn
  // laan heeft dichtgeklapt, zou een groen stuk kunnen tonen waar het rood is.
  const ucVakken = useMemo(() => {
    if (!lagen.uc || !antwoord) return [];
    const bronnen = [
      { naam: "momentendekking onder", punten: momentLaan(antwoord.onder, "").punten },
      { naam: "momentendekking boven", punten: momentLaan(antwoord.boven, "").punten },
      {
        naam: "dwarskrachtdekking",
        punten: dwarskrachtLaan(antwoord.dwarskracht.punten, null, "").punten,
      },
      ...(scheur && scheur.punten.length > 0
        ? [{ naam: "scheurwijdte", punten: scheur.punten }]
        : []),
    ];
    // Samengevoegd per kleurklasse: zie `voegUcVakkenSamen` voor waarom een
    // balk van tweehonderd losse vakjes als streepjescode leest.
    return voegUcVakkenSamen(ucVerloop(bronnen));
  }, [lagen.uc, antwoord, scheur]);

  // ── De aanwijzer ─────────────────────────────────────────────────────────
  //
  // Bij het openen springt hij naar de maatgevende plaats die de KERN heeft
  // aangewezen — de hoogste unity check buiten de eindzones. Dat is de plaats
  // waar de gebruiker naar op zoek is, en hij hoeft er niet naar te zoeken.
  const maatgevendeX = useMemo(() => {
    if (!antwoord) return null;
    const kandidaten: { x: number; uc: number }[] = [];
    for (const dek of [antwoord.onder, antwoord.boven]) {
      const i = dek.maatgevend;
      if (i !== undefined && i !== null && dek.punten[i]?.uc !== undefined) {
        kandidaten.push({ x: dek.punten[i].x_mm, uc: dek.punten[i].uc as number });
      }
    }
    const iv = antwoord.dwarskracht.maatgevend;
    if (iv !== undefined && iv !== null) {
      const p = antwoord.dwarskracht.punten[iv];
      if (p?.uc !== undefined && p.uc !== null) kandidaten.push({ x: p.x_mm, uc: p.uc });
    }
    if (kandidaten.length === 0) return null;
    return kandidaten.reduce((m, k) => (k.uc > m.uc ? k : m)).x;
  }, [antwoord]);

  useEffect(() => {
    // Alleen bij een NIEUWE staaf naar de maatgevende plaats springen. Zou de
    // aanwijzer ook bij elke herberekening terugspringen, dan zou hij tijdens
    // het bewerken van de zones onder de muis vandaan lopen.
    setCursorXMm(null);
  }, [beam.id]);
  useEffect(() => {
    setCursorXMm((huidig) => (huidig === null ? maatgevendeX : huidig));
  }, [maatgevendeX]);

  // ── De breedte van het tekenvlak ─────────────────────────────────────────
  const vlakRef = useRef<HTMLDivElement>(null);
  const [breedtePx, setBreedtePx] = useState(900);
  useLayoutEffect(() => {
    const el = vlakRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const meet = () => setBreedtePx(Math.max(320, Math.round(el.clientWidth - 2)));
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Wat er in de staaf getekend wordt ────────────────────────────────────
  const bundels: BundelTekening[] = useMemo(() => {
    if (antwoord) {
      return [...antwoord.onder.bundels, ...antwoord.boven.bundels].map((s) => ({
        zijde: s.side === "Bottom" ? ("onder" as const) : ("boven" as const),
        xStartMm: s.x_start_mm,
        xEindMm: s.x_end_mm,
        label: `${s.aantal}Ø${maat(s.diameter_mm)}`,
        lBdMm: s.l_bd_mm,
      }));
    }
    // Zonder lijn tekenen we wat er in het MODEL staat. Niet niets: de aanzicht
    // met de wapening is ook zonder dekkingslijn het halve venster.
    const uit: BundelTekening[] = [];
    const zones = liveZones;
    if (zones && zones.longitudinal.length > 0) {
      for (const z of zones.longitudinal) {
        if (z.row.count <= 0 || z.row.diameter_mm <= 0) continue;
        uit.push({
          zijde: z.side === "Bottom" ? "onder" : "boven",
          xStartMm: z.x_start_mm,
          xEindMm: z.x_end_mm,
          label: `${z.row.count}Ø${maat(z.row.diameter_mm)}`,
          lBdMm: 0,
        });
      }
      return uit;
    }
    for (const [rij, zijde] of [
      [korf.bottom, "onder"],
      [korf.top, "boven"],
    ] as const) {
      if (rij.count <= 0 || rij.diameter_mm <= 0) continue;
      uit.push({
        zijde,
        xStartMm: 0,
        xEindMm: lengteMm,
        label: `${rij.count}Ø${maat(rij.diameter_mm)}`,
        lBdMm: 0,
      });
    }
    return uit;
  }, [antwoord, liveZones, korf, lengteMm]);

  const beugels: BeugelTekening[] = useMemo(() => {
    const zones = liveZones;
    if (zones && zones.stirrups.length > 0) {
      return zones.stirrups.map((z) => ({
        xStartMm: z.x_start_mm,
        xEindMm: z.x_end_mm,
        spacingMm: z.spacing_mm,
        benen: z.legs,
        diameterMm: z.diameter_mm,
      }));
    }
    const s = korf.stirrup_spacing_mm;
    if (!(korf.stirrup_diameter_mm > 0) || s === undefined || s === null || !(s > 0)) return [];
    return [
      {
        xStartMm: 0,
        xEindMm: lengteMm,
        spacingMm: s,
        benen: korf.stirrup_legs ?? 2,
        diameterMm: korf.stirrup_diameter_mm,
      },
    ];
  }, [liveZones, korf, lengteMm]);

  const opleggingen: OplegTekening[] = useMemo(() => {
    const uit: OplegTekening[] = [];
    for (const [nodeId, x] of [
      [beam.from, 0],
      [beam.to, lengteMm],
    ] as const) {
      const s = supports.find((k) => k.nodeId === nodeId);
      if (s) uit.push({ xMm: x, type: s.type });
    }
    return uit;
  }, [beam.from, beam.to, lengteMm, supports]);

  // ── De doorsnede bij de aanwijzer ────────────────────────────────────────
  const korfBijCursor = korfOpX(korf, liveZones, cursorXMm ?? 0);
  const tekenKorf: Wapeningskorf | null = doorsnede.ok
    ? { ...restKorf, doorsnede: doorsnede.doorsnede, korf: korfBijCursor }
    : null;

  const aflezing = useMemo(() => {
    if (cursorXMm === null) return [];
    const rijen: { naam: string; punt: LijnPunt | null; eenheid: string; benodigd: string; aanwezig: string }[] = [];
    if (antwoord) {
      rijen.push({
        naam: "Momentendekking onder",
        punt: puntBijX(momentLaan(antwoord.onder, "").punten, cursorXMm),
        eenheid: "kN",
        benodigd: "F_s",
        aanwezig: "F_Rs",
      });
      rijen.push({
        naam: "Momentendekking boven",
        punt: puntBijX(momentLaan(antwoord.boven, "").punten, cursorXMm),
        eenheid: "kN",
        benodigd: "F_s",
        aanwezig: "F_Rs",
      });
      rijen.push({
        naam: "Dwarskracht",
        punt: puntBijX(dwarskrachtLaan(antwoord.dwarskracht.punten, null, "").punten, cursorXMm),
        eenheid: "kN",
        benodigd: "|V_Ed|",
        aanwezig: "V_Rd",
      });
    }
    if (scheur && scheur.punten.length > 0) {
      rijen.push({
        naam: "Scheurwijdte",
        punt: puntBijX(scheur.punten, cursorXMm),
        eenheid: "mm",
        benodigd: "w_k",
        aanwezig: "w_max",
      });
    }
    return rijen;
  }, [antwoord, scheur, cursorXMm]);

  const gemisteGrenzen = useMemo(() => {
    if (!verzoek?.verzoek) return [];
    return ontbrekendeZoneStations(gerekendeZones, verzoek.verzoek);
  }, [verzoek, gerekendeZones]);

  const zetZones = (zones: ReinforcementZones | undefined) => {
    const cfg = { ...(beam.checkConfig ?? {}) };
    if (zones === undefined) delete cfg.betonZones;
    else cfg.betonZones = zones;
    updateBeam?.(beam.id, {
      checkConfig: Object.keys(cfg).length > 0 ? cfg : undefined,
    });
  };

  return (
    <div className="dek-venster">
      {/* ── Werkbalk: de vier lagen, elk los aan en uit ─────────────────── */}
      <div className="dek-werkbalk">
        <span className="dek-staafnaam">
          {`Staaf ${beam.id} · ${beam.profile ?? "—"} · ${beam.material ?? "—"} · L = ${nl(lengteMm / 1000, 2)} m`}
        </span>
        <div className="dek-lagen">
          {LAGEN.map((laag) => {
            const aan = lagen[laag.id];
            return (
              <button
                key={laag.id}
                type="button"
                className={`fem-results-toggle dek-laagknop${aan ? " active" : ""}`}
                onClick={() => setLagen((v) => ({ ...v, [laag.id]: !v[laag.id] }))}
                title={laag.hint}
              >
                <span className="fem-results-toggle-swatch" style={{ background: laag.swatch }} />
                <span className="fem-results-toggle-label">{laag.label}</span>
                <span className={`fem-switch${aan ? " on" : ""}`} aria-hidden="true">
                  <span className="fem-switch-dot" />
                </span>
              </button>
            );
          })}
        </div>
        <div className="dek-werkbalk-rechts">
          {maatgevendeX !== null && (
            <button
              type="button"
              className="dek-knop"
              onClick={() => setCursorXMm(maatgevendeX)}
              title="Zet de aanwijzer op de plaats die de rekenkern als maatgevend heeft aangewezen — de hoogste unity check buiten de eindzones."
            >
              Naar de maatgevende snede
            </button>
          )}
          {(bezig || scheurBezig) && <span className="dek-bezig">rekenkern…</span>}
          {onSluiten && (
            <button
              type="button"
              className="dek-knop dek-sluit"
              onClick={onSluiten}
              title="Venster sluiten"
              aria-label="Venster sluiten"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="dek-body">
        <div className="dek-links">
          <div className="dek-tekenvlak" ref={vlakRef}>
            {lengteMm > 0 ? (
              <AanzichtTekening
                lengteMm={lengteMm}
                hoogteMm={doorsnede.ok ? doorsnede.doorsnede.h_mm : 0}
                opleggingen={opleggingen}
                bundels={bundels}
                beugels={beugels}
                zoneGrenzenMm={zoneGrenzenMm(liveZones)}
                lanenBoven={lanenBoven}
                lanenOnder={lanenOnder}
                omhullenden={omhullenden}
                ucVakken={ucVakken}
                lagen={lagen}
                cursorXMm={cursorXMm}
                onCursorX={setCursorXMm}
                breedtePx={breedtePx}
              />
            ) : (
              <p className="beton-hint">Deze staaf heeft geen lengte; er valt niets te tekenen.</p>
            )}
          </div>

          <Meldingen
            fout={fout}
            scheurFout={scheurFout}
            scheurBezig={scheurBezig}
            scheur={scheur}
            antwoord={antwoord}
            looptAchter={looptAchter}
            gemisteGrenzen={gemisteGrenzen}
            geenRun={lastRunData === null}
            lagen={lagen}
          />

          <ZoneEditor
            zones={liveZones}
            korf={korf}
            doorsnede={doorsnede.ok ? doorsnede.doorsnede : STANDAARD_KORF.doorsnede}
            restKorf={restKorf}
            lengteMm={lengteMm}
            cursorXMm={cursorXMm}
            onChange={zetZones}
          />
        </div>

        <aside className="dek-rechts">
          <div className="dek-snedekop">
            {cursorXMm === null
              ? "Klik in de aanzicht om een snede aan te wijzen"
              : `Doorsnede op x = ${maat(Math.round(cursorXMm))} mm`}
          </div>
          {tekenKorf ? (
            <DoorsnedeTekening korf={tekenKorf} className="dek-doorsnede" />
          ) : (
            <p className="beton-hint">
              De doorsnede is niet uit de profielnaam &ldquo;{beam.profile ?? "—"}&rdquo; te lezen;
              vul haar in bij de staafeigenschappen.
            </p>
          )}

          <table className="dek-aflezing">
            <tbody>
              {aflezing.map((r) => (
                <tr key={r.naam}>
                  <th>{r.naam}</th>
                  <td>
                    {r.punt === null ? (
                      "—"
                    ) : (
                      <>
                        <span className="dek-aflezing-paar">
                          {`${r.benodigd} ${nl(r.punt.benodigd, r.eenheid === "mm" ? 3 : 1)}`}
                          {" / "}
                          {r.punt.aanwezig === null
                            ? `${r.aanwezig} —`
                            : `${r.aanwezig} ${nl(r.punt.aanwezig, r.eenheid === "mm" ? 3 : 1)}`}
                          {` ${r.eenheid}`}
                        </span>
                        {r.punt.uc !== null && (
                          <span
                            className="dek-uc"
                            style={{ color: UC_KLEUR[ucKlasse(r.punt.uc)] }}
                          >
                            {`UC ${nl(r.punt.uc, 2)}`}
                          </span>
                        )}
                        {r.punt.eindzone && (
                          <span className="dek-eindzone-tag" title="Binnen l_bd van een staafeinde geldt §9.2.1.4/§9.2.1.5 en niet de vrije dekkingslijn; de kern sluit dit stuk uit bij het aanwijzen van de maatgevende plaats.">
                            eindzone
                          </span>
                        )}
                        {r.punt.reden && <span className="dek-reden">{r.punt.reden}</span>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {aflezing.length === 0 && (
                <tr>
                  <td className="beton-hint">
                    Nog geen dekkingslijn. Reken het model door; de lijn komt uit de rekenkern.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </aside>
      </div>
    </div>
  );
}

/**
 * Alles wat de gebruiker moet weten voordat hij de tekening gelooft.
 *
 * Ze staan bij elkaar en niet verspreid: een lijn die om een van deze redenen
 * niet klopt, ziet er precies zo uit als een lijn die wel klopt.
 */
function Meldingen({
  fout,
  scheurFout,
  scheurBezig,
  scheur,
  antwoord,
  looptAchter,
  gemisteGrenzen,
  geenRun,
  lagen,
}: {
  fout: string | null;
  scheurFout: string | null;
  scheurBezig: boolean;
  scheur: ScheurwijdteLijn | null;
  antwoord: DekkingslijnAntwoord | null;
  looptAchter: boolean;
  gemisteGrenzen: number[];
  geenRun: boolean;
  lagen: LaagVlaggen;
}) {
  return (
    <div className="dek-meldingen">
      {geenRun && (
        <p className="beton-hint">
          Er is nog niet gerekend. De dekkingslijn komt uit de rekenkern en heeft de
          krachtsverdeling van de UGT-combinaties nodig; druk op Berekenen.
        </p>
      )}
      {looptAchter && (
        <p className="dek-let-op">
          De zone-indeling is zojuist gewijzigd. De tekening toont nog de vorige berekening —
          de zonegrenzen zijn rekenknopen, dus de lijn wacht op de nieuwe krachtsverdeling.
        </p>
      )}
      {gemisteGrenzen.length > 0 && (
        <p className="dek-let-op">
          {`Op ${gemisteGrenzen.map((x) => `${maat(x)} mm`).join(", ")} ligt een zonegrens zonder rekenknoop. ` +
            "Daar staat de benodigde kracht van een station ernaast naast de weerstand van hier; de sprong is op die plaats niet betrouwbaar."}
        </p>
      )}
      {fout && <div className="beton-fout">{fout}</div>}
      {scheurFout && <div className="beton-fout">{scheurFout}</div>}
      {lagen.scheurwijdte && scheurBezig && (
        <p className="beton-hint">
          De scheurwijdte wordt per snede bij de rekenkern opgevraagd (§7.3.4 is geen lijn maar
          een doorsnedetoets); dat duurt even.
        </p>
      )}
      {scheur && scheur.toelichting.length > 0 && (
        <details className="beton-notities">
          <summary>{`Scheurwijdte — ${scheur.punten.length} van ${scheur.aantalSneden} sneden leverden een w_k`}</summary>
          <ul>
            {scheur.toelichting.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>
      )}
      {antwoord && (
        <details className="beton-notities">
          <summary>
            {`Kanttekeningen van de rekenkern (${antwoord.notes.length}) — a_l = ${maat(antwoord.a_l_mm)} mm volgens ${antwoord.a_l_artikel}`}
          </summary>
          <ul>
            {antwoord.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
            {antwoord.onder.toelichting.map((n, i) => (
              <li key={`o${i}`}>{`Onderwapening: ${n}`}</li>
            ))}
            {antwoord.boven.toelichting.map((n, i) => (
              <li key={`b${i}`}>{`Bovenwapening: ${n}`}</li>
            ))}
            {antwoord.dwarskracht.toelichting.map((n, i) => (
              <li key={`v${i}`}>{`Dwarskracht: ${n}`}</li>
            ))}
            {antwoord.steunpunten.map((s, i) => (
              <li key={`s${i}`}>
                {`Steunpunt ${s.uiteinde === "Begin" ? "begin" : "eind"} (x = ${maat(s.x_mm)} mm): ` +
                  `A_s vereist ${maat(s.a_s_vereist_mm2)} mm², aanwezig ${maat(s.a_s_aanwezig_mm2)} mm², ` +
                  `F_Ed = ${nl(s.f_ed_kn, 1)} kN, l_bd = ${s.l_bd_mm !== undefined && s.l_bd_mm !== null ? `${maat(s.l_bd_mm)} mm` : "niet bepaald"} — ` +
                  `${s.voldoet_oppervlakte ? "de oppervlakte-eis is gehaald" : "de oppervlakte-eis is NIET gehaald"}.`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
