/**
 * InfoTip — een klein (i)-icoon naast een label met de uitleg bij dat veld.
 *
 * WAAROM (issue #43). In het eigenschappenpaneel stond bij veel velden de
 * normtoelichting als doorlopende tekst; het paneel werd lang en de velden
 * verdwenen tussen de tekst. De uitleg staat nu achter dit icoon. Wat over de
 * HUIDIGE invoer gaat ("Leeg = 8770 mm, staaflengte") en waarschuwingen
 * (`fem-prop-let-op`, `role="note"`) blijven gewoon in het paneel staan.
 *
 * BEDIENING. Niet alleen `title`: dat werkt niet met het toetsenbord en niet op
 * een aanraakscherm.
 *  - muis: hover toont, weg met de muis verbergt; klik zet de tip vast, nog een
 *    klik (of een klik ernaast) maakt hem weer los;
 *  - toetsenbord: focus toont, Enter/spatie zet vast, Esc sluit;
 *  - aanraken: een tik geeft focus én een klik en zet de tip dus vast; een
 *    tweede tik sluit.
 *
 * TOEGANKELIJKHEID. De tekst staat altijd in de DOM (verborgen zolang de tip
 * dicht is) onder `id`, zodat het veld hem met `aria-describedby={id}` als
 * beschrijving krijgt — ook als de tip dicht is. De knop verwijst er zelf ook
 * naar.
 *
 * PLAATSING. De tip hangt via een portal aan `document.body` met
 * `position: fixed`: het paneel scrolt (`overflow-y: auto`) en zou een tip aan
 * de rand anders afknippen. Hij komt onder het icoon, of erboven als er onder
 * geen plaats is, en wordt horizontaal binnen het venster gehouden. De kleuren
 * komen uit de thematokens, dus licht en donker volgen vanzelf.
 */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { infoTipPlaats } from "../lib/infoTipPlaats";
import "./InfoTip.css";

export interface InfoTipProps {
  /** Id van het tekstelement; het veld verwijst ernaar met `aria-describedby`. */
  id: string;
  /** De uitleg. */
  children: ReactNode;
  /** Toegankelijke naam van de knop; standaard "Uitleg". */
  label?: string;
}

export default function InfoTip({ id, children, label }: InfoTipProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  // Vast = geopend met een klik/tik of Enter: blijft staan als de muis weggaat.
  const [vast, setVast] = useState(false);
  const knopRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [plaats, setPlaats] = useState<{ left: number; top: number } | null>(null);

  const sluit = useCallback(() => {
    setOpen(false);
    setVast(false);
  }, []);

  const herplaats = useCallback(() => {
    const knop = knopRef.current;
    const tip = tipRef.current;
    if (!knop || !tip) return;
    const r = knop.getBoundingClientRect();
    const p = infoTipPlaats(
      { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPlaats({ left: p.left, top: p.top });
  }, []);

  useLayoutEffect(() => {
    if (open) herplaats();
    else setPlaats(null);
  }, [open, herplaats]);

  useEffect(() => {
    if (!open) return;
    // Esc sluit de tip, en alleen de tip: in de vangfase op window, zodat de
    // Esc-afhandeling van het tekenvlak (selectie opheffen) niet ook afgaat.
    const opToets = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      sluit();
    };
    // Een klik ernaast maakt een vastgezette tip los.
    const opWijzer = (e: PointerEvent) => {
      const doel = e.target as globalThis.Node | null;
      if (doel && (knopRef.current?.contains(doel) || tipRef.current?.contains(doel))) return;
      sluit();
    };
    window.addEventListener("keydown", opToets, true);
    document.addEventListener("pointerdown", opWijzer, true);
    window.addEventListener("scroll", herplaats, true);
    window.addEventListener("resize", herplaats);
    return () => {
      window.removeEventListener("keydown", opToets, true);
      document.removeEventListener("pointerdown", opWijzer, true);
      window.removeEventListener("scroll", herplaats, true);
      window.removeEventListener("resize", herplaats);
    };
  }, [open, sluit, herplaats]);

  return (
    <>
      <button
        ref={knopRef}
        type="button"
        className={`infotip-knop${open ? " open" : ""}`}
        aria-label={label ?? t("infoTip.label")}
        aria-describedby={id}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!vast) setOpen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={sluit}
        onClick={(e) => {
          // Niet doorgeven: de knop staat soms in een klikbaar label.
          e.preventDefault();
          e.stopPropagation();
          if (vast) sluit();
          else { setVast(true); setOpen(true); }
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.6" r="1" fill="currentColor" />
          <path d="M8 7v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          className="infotip-bubbel"
          hidden={!open}
          style={plaats ? { left: plaats.left, top: plaats.top } : { left: -9999, top: -9999 }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
