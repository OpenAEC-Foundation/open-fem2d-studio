/**
 * paginate — echte paginering: de doorlopende rapportinhoud over losse vellen.
 *
 * OPZET (opmaakproef)
 * -------------------
 * Het rapport blijft één doorlopend document: hoofdstukken sluiten op elkaar
 * aan, niets begint geforceerd op een nieuw vel. Alleen de WEERGAVE is nu in
 * losse vellen verdeeld, precies zoals een drukproef.
 *
 * Dat gebeurt in drie stappen:
 *
 *  1. METEN — ReportShell rendert alle aangezette secties één keer in een
 *     onzichtbare meetcontainer (`.rpt-meet`) die exact zo breed is als de
 *     tekstkolom van het vel (papierbreedte − linker- en rechtermarge) en
 *     dezelfde typografie draagt. Die container is de ENIGE plek waar de
 *     live React-secties draaien.
 *
 *  2. VERDELEN — we lopen de meetcontainer af en verzamelen "atomen": de
 *     natuurlijke breekpunten. Een element dat in zijn geheel op een vel past
 *     is een atoom; een element dat te hoog is wordt opengebroken tot zijn
 *     kinderen (een lange tabel dus tot losse `<tr>`-rijen). Blokken die
 *     bijeen moeten blijven (figuur, profielblok, belastinggeval-blok) worden
 *     nooit opengebroken. Daarna vullen we vellen tot de beschikbare
 *     teksthoogte vol is; wat niet meer past schuift naar het volgende vel.
 *
 *  3. BOUWEN — per vel bouwen we de DOM op uit klonen van de atomen, mét de
 *     omhullende elementen (hoofdstuk, blok, tabel) zodat opmaak en
 *     CSS-tellers blijven kloppen. Een tabel die doorloopt krijgt op elk
 *     volgend vel automatisch zijn `<thead>` opnieuw — de herhaalde kopregel.
 *
 * WAAROM KLONEN
 * -------------
 * De secties zijn live React-componenten; hun DOM verplaatsen zou React's
 * reconciliatie breken. De meetcontainer blijft daarom de echte React-boom en
 * de vellen tonen klonen. Bedieningselementen in het rapport (de koptekst-
 * regel, de combinatie-keuze) blijven werken doordat elk formulierelement een
 * `data-rpt-ctl`-nummer krijgt: `koppelBedieningsDoorgifte` vangt de
 * interactie op een kloon op en speelt hem door naar het origineel, waar
 * React hem gewoon als eigen event ziet.
 *
 * GRENZEN
 * -------
 *  - Eén element dat hoger is dan een heel vel (bv. een extreem grote figuur)
 *    past nergens; dat krijgt een eigen vel en mag daar overlopen.
 *  - Scherm en print verschillen minimaal doordat `.rpt-screen-only` en
 *    `.rpt-print-only` elkaar afwisselen (invoerveld ↔ tekstregel). Dat
 *    scheelt hooguit een regel per vel; daarvoor houden we een kleine
 *    veiligheidsmarge (VEILIGHEID_MM) vrij onderaan elk vel.
 *
 * INHOUDSOPGAVE
 * -------------
 * Na het bouwen lezen we de koppen van de vellen af (hoofdstuk/subsectie,
 * nummer, titel, velnummer) en geven die door aan toc.ts, dat de
 * inhoudsopgave-sectie vult. Omdat die sectie zelf ruimte inneemt, is dat een
 * terugkoppeling — de convergentiebewaking staat in toc.ts.
 */
import { startPagineerslag, verwerkKoppen, type TocRegel } from "./toc";

/** Vrijgehouden ruimte onderaan elk vel (mm) — vangt afrondings- en
 *  scherm/print-verschillen op zodat één vel nooit twee printpagina's wordt. */
const VEILIGHEID_MM = 3;

/** Minimale teksthoogte (mm) — voorkomt eindeloos vullen bij absurde marges. */
const MIN_TEKSTHOOGTE_MM = 20;

/** Blokken die nooit over een velgrens gesplitst worden. */
const ONDEELBAAR = [
  ".rpt-figuur",
  ".rpt-profile-block",
  ".rpt-profile-body",
  ".rpt-loadcase-block",
  "svg",
  "img",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "li",
].join(", ");

/** Koppen die niet los onderaan een vel mogen blijven staan. */
const KOP = ".rpt-h2, .rpt-h3, .rpt-uitgangspunten-kop, .rpt-doc-kind";

/** Containers die zelf nooit een atoom worden (altijd verder opensplitsen). */
const NOOIT_ATOOM = new Set(["TBODY", "TFOOT"]);

/** Eén natuurlijk breekpunt in de doorlopende inhoud. */
interface Atoom {
  /** Het originele element in de meetcontainer. */
  el: HTMLElement;
  /** Omhullende elementen (buiten → binnen) die op elk vel herbouwd worden. */
  keten: HTMLElement[];
  /** Bovenkant t.o.v. de meetcontainer (px). */
  top: number;
  /** Eigen hoogte (px). */
  hoogte: number;
  /** Hoogte + witruimte tot het volgende atoom (px) — de echte veldkosten. */
  kosten: number;
  /** Onzichtbaar op scherm (bv. `.rpt-print-only`): kost geen ruimte. */
  verborgen: boolean;
}

export interface PagineerOpties {
  /** De onzichtbare meetcontainer met de live secties. */
  meet: HTMLElement;
  /** Het kopblok binnen de meetcontainer (wordt per vel gekloond). */
  kop: HTMLElement;
  /** De inhoudscontainer binnen de meetcontainer (de secties zelf). */
  inhoud: HTMLElement;
  /** Container waarin de vellen gebouwd worden (`.rpt-vellen`). */
  doel: HTMLElement;
  /** Papierhoogte in mm (inclusief marges). */
  velHoogteMm: number;
  margeBovenMm: number;
  margeOnderMm: number;
  /** Linkerhelft van de voetregel (productnaam). */
  merk: string;
  /** Rechterhelft van de voetregel, bv. "Pagina 2 van 7". */
  paginaLabel: (nummer: number, totaal: number) => string;
}

/** Cachet metingen die tijdens één pagineerslag geldig blijven. */
interface Meting {
  theadHoogte: Map<HTMLElement, number>;
  margeTop: Map<HTMLElement, number>;
}

function theadHoogte(m: Meting, el: HTMLElement): number {
  if (el.tagName !== "TABLE") return 0;
  const bekend = m.theadHoogte.get(el);
  if (bekend !== undefined) return bekend;
  const thead = el.querySelector(":scope > thead");
  const h = thead ? (thead as HTMLElement).getBoundingClientRect().height : 0;
  m.theadHoogte.set(el, h);
  return h;
}

function margeTop(m: Meting, el: HTMLElement): number {
  const bekend = m.margeTop.get(el);
  if (bekend !== undefined) return bekend;
  const h = parseFloat(getComputedStyle(el).marginTop) || 0;
  m.margeTop.set(el, h);
  return h;
}

/** Aantal pixels per millimeter — één keer per slag gemeten (browserzoom-vast). */
function pxPerMm(host: HTMLElement): number {
  const proef = document.createElement("div");
  proef.style.cssText = "position:absolute;width:100mm;height:0;visibility:hidden";
  host.appendChild(proef);
  const px = proef.getBoundingClientRect().width / 100;
  proef.remove();
  return px > 0 ? px : 96 / 25.4;
}

/** Is dit element een eenheid die we niet verder opensplitsen? */
function isOndeelbaar(el: HTMLElement): boolean {
  if (NOOIT_ATOOM.has(el.tagName)) return false;
  if (el.children.length === 0) return true;
  return el.matches(ONDEELBAAR);
}

/**
 * Verzamel de natuurlijke breekpunten. Elementen die op één vel passen zijn
 * atomen; te hoge elementen worden opengebroken tot hun kinderen.
 */
function verzamelAtomen(wortel: HTMLElement, beschikbaar: number): Atoom[] {
  const atomen: Atoom[] = [];
  const nul = wortel.getBoundingClientRect().top;

  const loop = (ouder: HTMLElement, keten: HTMLElement[]) => {
    for (const kind of Array.from(ouder.children) as HTMLElement[]) {
      // De tabelkop hoort bij de tabel-omhulling en wordt per vel opnieuw
      // gekloond — hij is dus geen los atoom.
      if (kind.tagName === "THEAD") continue;

      const rect = kind.getBoundingClientRect();
      const verborgen = rect.width === 0 && rect.height === 0;
      if (verborgen) {
        // `.rpt-print-only`-elementen: op scherm display:none, maar ze moeten
        // wél mee het vel op (ze verschijnen in de print). Kosten: nul.
        atomen.push({ el: kind, keten, top: NaN, hoogte: 0, kosten: 0, verborgen: true });
        continue;
      }
      if (rect.height <= beschikbaar || isOndeelbaar(kind)) {
        atomen.push({
          el: kind,
          keten,
          top: rect.top - nul,
          hoogte: rect.height,
          kosten: rect.height,
          verborgen: false,
        });
      } else {
        loop(kind, [...keten, kind]);
      }
    }
  };
  loop(wortel, []);

  // Kosten = afstand tot het volgende zichtbare atoom: dat vangt marges en
  // ingeklapte witruimte precies zoals de browser hem heeft neergezet.
  let vorige = -1;
  for (let i = 0; i < atomen.length; i++) {
    if (atomen[i].verborgen) continue;
    if (vorige >= 0) {
      atomen[vorige].kosten = Math.max(
        atomen[vorige].hoogte,
        atomen[i].top - atomen[vorige].top,
      );
    }
    vorige = i;
  }
  return atomen;
}

/** Verdeel de atomen over vellen tot de beschikbare teksthoogte vol is. */
function vulVellen(atomen: Atoom[], beschikbaar: number, m: Meting): Atoom[][] {
  const vellen: Atoom[][] = [];
  let huidig: Atoom[] = [];
  let gebruikt = 0;
  let omhullingen = new Set<HTMLElement>();

  /** Extra ruimte die de nog ontbrekende omhullingen op dit vel kosten. */
  const ketenKosten = (a: Atoom): number => {
    let extra = 0;
    for (const v of a.keten) {
      if (omhullingen.has(v)) continue;
      extra += theadHoogte(m, v); // herhaalde tabelkop
      if (huidig.length > 0) extra += margeTop(m, v);
    }
    return extra;
  };

  const plaats = (a: Atoom) => {
    gebruikt += ketenKosten(a) + a.kosten;
    for (const v of a.keten) omhullingen.add(v);
    huidig.push(a);
  };

  const nieuwVel = () => {
    if (huidig.length > 0) vellen.push(huidig);
    huidig = [];
    gebruikt = 0;
    omhullingen = new Set();
  };

  for (const a of atomen) {
    if (!a.verborgen && huidig.length > 0 && gebruikt + ketenKosten(a) + a.kosten > beschikbaar) {
      // Een kop mag niet los onderaan een vel achterblijven: neem hem mee.
      const meeneem: Atoom[] = [];
      while (huidig.length > 1 && meeneem.length < 2) {
        const laatste = huidig[huidig.length - 1];
        if (!laatste.verborgen && !laatste.el.matches(KOP)) break;
        huidig.pop();
        gebruikt -= laatste.kosten;
        meeneem.unshift(laatste);
      }
      nieuwVel();
      for (const k of meeneem) plaats(k);
    }
    plaats(a);
  }
  nieuwVel();
  return vellen;
}

/**
 * Bouw de inhoud van één vel: klonen van de atomen, genest in herbouwde
 * omhullingen. Een tabel krijgt daarbij automatisch zijn kopregel terug.
 */
function bouwInhoud(atomen: Atoom[]): HTMLElement {
  const wortel = document.createElement("div");
  wortel.className = "rpt-vel-inhoud";
  const schillen = new Map<HTMLElement, HTMLElement>();

  for (const a of atomen) {
    let ouder: HTMLElement = wortel;
    for (const origineel of a.keten) {
      let schil = schillen.get(origineel);
      if (!schil) {
        schil = origineel.cloneNode(false) as HTMLElement;
        if (origineel.tagName === "TABLE") {
          // Herhaalde kopregel bij een tabel die over vellen doorloopt.
          const thead = origineel.querySelector(":scope > thead");
          if (thead) schil.appendChild(thead.cloneNode(true));
        }
        schillen.set(origineel, schil);
        ouder.appendChild(schil);
      }
      ouder = schil;
    }
    ouder.appendChild(a.el.cloneNode(true));
  }
  return wortel;
}

/**
 * Lees de koppen van de gebouwde vellen af voor de inhoudsopgave: nummer
 * (zoals de CSS-tellers het zetten), titel en het vel waarop de kop staat.
 * Elke kop krijgt tegelijk `data-rpt-kop="<nummer>"` als spring-anker.
 *
 * `.rpt-h2-vrij` telt niet mee: dat is voorwerk (de inhoudsopgave zelf) en
 * die kop krijgt ook geen hoofdstuknummer.
 */
function leesKoppen(doel: HTMLElement): TocRegel[] {
  const uit: TocRegel[] = [];
  let hoofdstuk = 0;
  let subsectie = 0;
  doel.querySelectorAll<HTMLElement>(".rpt-vel").forEach((vel, index) => {
    vel.querySelectorAll<HTMLElement>(".rpt-h2, .rpt-h3").forEach((kop) => {
      if (kop.classList.contains("rpt-h2-vrij")) return;
      const niveau: 2 | 3 = kop.classList.contains("rpt-h2") ? 2 : 3;
      let nummer: string;
      if (niveau === 2) {
        hoofdstuk += 1;
        subsectie = 0;
        nummer = String(hoofdstuk);
      } else {
        subsectie += 1;
        nummer = `${hoofdstuk}.${subsectie}`;
      }
      kop.dataset.rptKop = nummer;
      // Bijvoegsels als `.rpt-h3-tag` ("permanent", "veranderlijk", …) horen
      // niet in de inhoudsopgave.
      const titel = Array.from(kop.childNodes)
        .filter((n) => !(n instanceof HTMLElement && n.classList.contains("rpt-h3-tag")))
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      uit.push({ niveau, nummer, titel, pagina: index + 1 });
    });
  });
  return uit;
}

/** Kopieer de actuele waarden van de originele bedieningen naar hun klonen. */
function herstelWaarden(doel: HTMLElement, meet: HTMLElement): void {
  doel.querySelectorAll<HTMLElement>("[data-rpt-ctl]").forEach((kloon) => {
    const id = kloon.getAttribute("data-rpt-ctl");
    const origineel = meet.querySelector<HTMLElement>(`[data-rpt-ctl="${id}"]`);
    if (!origineel) return;
    if (kloon instanceof HTMLInputElement && origineel instanceof HTMLInputElement) {
      kloon.value = origineel.value;
      kloon.checked = origineel.checked;
    } else if (kloon instanceof HTMLSelectElement && origineel instanceof HTMLSelectElement) {
      kloon.selectedIndex = origineel.selectedIndex;
    } else if (kloon instanceof HTMLTextAreaElement && origineel instanceof HTMLTextAreaElement) {
      kloon.value = origineel.value;
    }
  });
}

/**
 * Herpagineer: meet, verdeel en bouw de vellen opnieuw op.
 * Retourneert het aantal vellen.
 */
export function pagineer(o: PagineerOpties): number {
  startPagineerslag();
  const mm = pxPerMm(o.meet);
  // Het kopblok staat bovenaan élk vel en eet dus van de teksthoogte —
  // inclusief zijn ondermarge (de scheidingslijn naar de inhoud).
  const kopHoogte =
    o.kop.getBoundingClientRect().height +
    (parseFloat(getComputedStyle(o.kop).marginBottom) || 0);
  const bruto = (o.velHoogteMm - o.margeBovenMm - o.margeOnderMm - VEILIGHEID_MM) * mm;
  const beschikbaar = Math.max(MIN_TEKSTHOOGTE_MM * mm, bruto - kopHoogte);

  // Nummer elk bedieningselement zodat een kloon zijn origineel terugvindt.
  // (Attributen worden niet door de MutationObserver bekeken — geen lus.)
  Array.from(o.inhoud.querySelectorAll<HTMLElement>("input, select, textarea, button")).forEach(
    (el, i) => el.setAttribute("data-rpt-ctl", String(i)),
  );

  // Focus + cursorpositie onthouden: herpagineren vervangt de klonen.
  const actief = document.activeElement as HTMLElement | null;
  const focusId =
    actief && o.doel.contains(actief) ? actief.getAttribute("data-rpt-ctl") : null;
  const selStart = actief instanceof HTMLInputElement ? actief.selectionStart : null;
  const selEind = actief instanceof HTMLInputElement ? actief.selectionEnd : null;

  const meting: Meting = { theadHoogte: new Map(), margeTop: new Map() };
  const atomen = verzamelAtomen(o.inhoud, beschikbaar);
  const vellen = atomen.length > 0 ? vulVellen(atomen, beschikbaar, meting) : [];

  o.doel.textContent = "";
  vellen.forEach((velAtomen, i) => {
    const vel = document.createElement("div");
    vel.className = "rpt-vel";
    vel.dataset.vel = String(i + 1);

    const binnen = document.createElement("div");
    binnen.className = "rpt-vel-binnen";
    binnen.appendChild(o.kop.cloneNode(true));
    binnen.appendChild(bouwInhoud(velAtomen));
    vel.appendChild(binnen);

    const voet = document.createElement("div");
    voet.className = "rpt-vel-voet";
    const links = document.createElement("span");
    links.textContent = o.merk;
    const rechts = document.createElement("span");
    rechts.textContent = o.paginaLabel(i + 1, vellen.length);
    voet.append(links, rechts);
    vel.appendChild(voet);

    o.doel.appendChild(vel);
  });

  herstelWaarden(o.doel, o.meet);

  // Koppen + velnummers doorgeven aan de inhoudsopgave. Wijzigt er iets, dan
  // rerendert die sectie en volgt er (gedebouncet) nog één pagineerslag —
  // toc.ts bewaakt dat dat convergeert. `data-toc-slag` maakt zichtbaar
  // hoeveel bijstelslagen die reeks nodig had (0 = niets veranderd).
  o.doel.dataset.tocSlag = String(verwerkKoppen(leesKoppen(o.doel)));

  if (focusId !== null) {
    const terug = o.doel.querySelector<HTMLElement>(`[data-rpt-ctl="${focusId}"]`);
    if (terug) {
      terug.focus();
      if (terug instanceof HTMLInputElement && selStart !== null && selEind !== null) {
        try {
          terug.setSelectionRange(selStart, selEind);
        } catch {
          /* type ondersteunt geen selectie — niet erg */
        }
      }
    }
  }

  return vellen.length;
}

// ── Bedieningselementen: interactie op een kloon → het echte React-element ──

function zetWaarde(el: HTMLElement, waarde: string): void {
  const proto =
    el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, waarde);
  else (el as HTMLInputElement).value = waarde;
}

/**
 * Speel interactie met een gekloond formulierelement door naar het origineel
 * in de meetcontainer. React luistert op de root van het document, dus een
 * echt afgevuurd event op het origineel komt gewoon in `onChange`/`onBlur`
 * terecht — de klonen gedragen zich daardoor als het echte veld.
 *
 * Retourneert de opruimfunctie.
 */
export function koppelBedieningsDoorgifte(doel: HTMLElement, meet: HTMLElement): () => void {
  const origineelVan = (e: Event): HTMLElement | null => {
    const bron = (e.target as HTMLElement | null)?.closest?.("[data-rpt-ctl]");
    if (!bron || !doel.contains(bron)) return null;
    const id = bron.getAttribute("data-rpt-ctl");
    return meet.querySelector<HTMLElement>(`[data-rpt-ctl="${id}"]`);
  };

  const opWaarde = (e: Event) => {
    const bron = e.target as HTMLElement;
    const origineel = origineelVan(e);
    if (!origineel) return;
    if (
      bron instanceof HTMLInputElement ||
      bron instanceof HTMLSelectElement ||
      bron instanceof HTMLTextAreaElement
    ) {
      if (bron instanceof HTMLInputElement && bron.type === "checkbox") {
        (origineel as HTMLInputElement).checked = bron.checked;
      } else {
        zetWaarde(origineel, bron.value);
      }
      origineel.dispatchEvent(new Event("input", { bubbles: true }));
      origineel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const opKlik = (e: Event) => {
    const bron = e.target as HTMLElement;
    if (!(bron instanceof HTMLButtonElement)) return;
    origineelVan(e)?.click();
  };

  const opToets = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== "Escape") return;
    const origineel = origineelVan(e);
    if (!origineel) return;
    origineel.dispatchEvent(
      new KeyboardEvent("keydown", { key: e.key, bubbles: true, cancelable: true }),
    );
    if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLElement).blur();
  };

  const opFocusUit = (e: Event) => {
    origineelVan(e)?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  };

  doel.addEventListener("input", opWaarde);
  doel.addEventListener("change", opWaarde);
  doel.addEventListener("click", opKlik);
  doel.addEventListener("keydown", opToets);
  doel.addEventListener("focusout", opFocusUit);
  return () => {
    doel.removeEventListener("input", opWaarde);
    doel.removeEventListener("change", opWaarde);
    doel.removeEventListener("click", opKlik);
    doel.removeEventListener("keydown", opToets);
    doel.removeEventListener("focusout", opFocusUit);
  };
}

/** Loopt er een sprong, dan wordt die afgebroken door de volgende. */
let lopendeSprong = 0;

/** Zachte sprong naar een positie in de scrollcontainer (eigen animatie:
 *  `scroll-behavior: smooth` wordt niet in elke webview gehonoreerd). */
function animeerScroll(scroller: HTMLElement, eind: number, ms = 350): void {
  if (lopendeSprong) cancelAnimationFrame(lopendeSprong);
  const start = scroller.scrollTop;
  const verschil = eind - start;
  // In een verborgen venster/tab loopt requestAnimationFrame niet — dan
  // gewoon direct springen in plaats van blijven staan.
  if (Math.abs(verschil) < 2 || document.hidden) {
    scroller.scrollTop = eind;
    return;
  }
  const t0 = performance.now();
  const stap = (nu: number) => {
    const p = Math.min(1, (nu - t0) / ms);
    const soepel = 1 - (1 - p) * (1 - p); // ease-out
    scroller.scrollTop = start + verschil * soepel;
    lopendeSprong = p < 1 ? requestAnimationFrame(stap) : 0;
  };
  lopendeSprong = requestAnimationFrame(stap);
}

/**
 * Spring naar een sectie in de opmaakproef. Werkt per venster (ook in het
 * losgekoppelde rapportvenster), want elk venster heeft zijn eigen document
 * met precies één opmaakproef.
 */
export function scrollNaarSectie(id: string): void {
  springNaar(`.rpt-vellen [data-section="${CSS.escape(id)}"]`);
}

/**
 * Spring naar een genummerde kop ("3" of "3.2") — de klikbare regels van de
 * inhoudsopgave. De ankers zet `leesKoppen` bij elke pagineerslag.
 */
export function scrollNaarKop(nummer: string): void {
  springNaar(`.rpt-vellen [data-rpt-kop="${CSS.escape(nummer)}"]`);
}

function springNaar(selector: string): void {
  const doel = document.querySelector<HTMLElement>(selector);
  if (!doel) return;
  const scroller = doel.closest<HTMLElement>(".report-scroll");
  if (!scroller) {
    doel.scrollIntoView({ block: "start" });
    return;
  }
  const marge = 12; // een streepje lucht boven het hoofdstuk
  const positie =
    scroller.scrollTop +
    doel.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    marge;
  const maximum = scroller.scrollHeight - scroller.clientHeight;
  animeerScroll(scroller, Math.max(0, Math.min(positie, maximum)));
}
