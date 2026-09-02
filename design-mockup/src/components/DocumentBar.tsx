import { useState, useEffect } from "react";
import {
  useWindowManager,
  EVT_DOCK_REQUEST,
  type DockBackPayload,
} from "../hooks/useWindowManager";
import { getDetachedParams } from "../hooks/useWindowManager";
import "./DocumentBar.css";

interface DocumentBarProps {
  /** Bestandsnaam van het actieve project — vervangt de placeholder-titel van de projecttab. */
  fileName?: string;
  /** Dirty-vlag: toont de wijzigingsindicator (●) op de projecttab. */
  modified?: boolean;
}

/**
 * DocumentBar — eerlijk één-document.
 *
 * De app kan (nog) maar één project tegelijk open hebben; deze balk toont dus
 * precies één tab: bestandsnaam + wijzigingsindicator. De eerdere
 * multi-tab-machinerie (sluitkruisje op de enige tab, tab-uitslepen,
 * fantoomtabs bij terugdocken) was schijn-UI: sluiten liet een lege balk
 * achter terwijl het project gewoon doordraaide, en gedockte tabs waren
 * nergens aan gebonden. Weg ermee — meerdere documenten komen terug zodra
 * de app dat echt kan.
 *
 * Terugdock-verzoeken van detached vensters (bv. het rapportvenster) worden
 * nog wél afgehandeld: kort oplichten + het venster netjes sluiten; de
 * inhoud leeft immers al in de bijbehorende hoofdvenster-tab.
 */
export default function DocumentBar({ fileName, modified }: DocumentBarProps) {
  const [dockIndicator, setDockIndicator] = useState(false);
  const { listenEvent, confirmDock } = useWindowManager();

  useEffect(() => {
    const { detached } = getDetachedParams();
    if (detached) return; // Niet luisteren in detached vensters zelf.

    listenEvent(EVT_DOCK_REQUEST, (payload) => {
      const data = payload as DockBackPayload;
      // Kort oplichten als visuele bevestiging, daarna het detached venster
      // sluiten — de inhoud (bv. het rapport) zit al in het hoofdvenster.
      setDockIndicator(true);
      setTimeout(() => setDockIndicator(false), 600);
      confirmDock(data.label);
    });
  }, [listenEvent, confirmDock]);

  return (
    <div className={`document-bar${dockIndicator ? " dock-flash" : ""}`}>
      <div className="document-tabs">
        <button className="document-tab active">
          <span className="document-tab-title">{fileName ?? "Naamloos project"}</span>
          {modified && <span className="document-tab-modified" />}
        </button>
      </div>
    </div>
  );
}
