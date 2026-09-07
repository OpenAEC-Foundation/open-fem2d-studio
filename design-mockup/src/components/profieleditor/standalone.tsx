/**
 * Losse ingang voor de profieleditor op de dev-server:
 * http://localhost:1440/profieleditor.html
 *
 * Alleen om de editor los van de app te kunnen bekijken en testen; in de
 * app opent hij vanuit het profielkeuzescherm.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "../../themes.css";
import { naarCustomSection } from "../../lib/profieleditor/eigenDoorsnedenStore";
import { useEigenDoorsneden } from "../../lib/profieleditor/useEigenDoorsneden";
import EigenDoorsnedeTekening from "./EigenDoorsnedeTekening";
import ProfielEditor from "./ProfielEditor";

/** Rapportweergave van de bewaarde doorsneden (papierstijl), ter controle. */
function RapportProef() {
  const items = useEigenDoorsneden((s) => s.items);
  if (items.length === 0) return null;
  return (
    <div style={{ background: "#fff", color: "#111", padding: 16, marginTop: 16, border: "1px solid #ccc" }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Rapportweergave (papierstijl) van de bewaarde doorsneden</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {items.map((d) => (
          <div key={d.id} style={{ width: 300 }}>
            <EigenDoorsnedeTekening doorsnede={d} stijl="rapport" className="pe-rapportproef" />
            <div style={{ fontWeight: 700, textAlign: "center", fontSize: 12 }}>Doorsnede {d.naam}</div>
            <pre style={{ fontSize: 9, whiteSpace: "pre-wrap", opacity: 0.7 }}>
              custom_section: {JSON.stringify(naarCustomSection(d), null, 0).slice(0, 400)}…
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pagina() {
  const [thema, setThema] = React.useState<string>(() => {
    try {
      return localStorage.getItem("openaec.profieleditor.thema") ?? "light";
    } catch {
      return "light";
    }
  });
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", thema);
    try {
      localStorage.setItem("openaec.profieleditor.thema", thema);
    } catch {
      // geen opslag
    }
  }, [thema]);

  return (
    <div className="pe-standalone">
      <div className="pe-standalone-balk">
        <strong>Profieleditor</strong>
        <span style={{ opacity: 0.6, fontSize: 12 }}>losse testpagina — de app opent de editor vanuit het profielkeuzescherm</span>
        <select value={thema} onChange={(e) => setThema(e.target.value)} style={{ marginLeft: "auto" }}>
          {["light", "forge", "openaec", "blueprint", "contrast"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="pe-kader">
        <ProfielEditor open inModal={false} onClose={() => undefined} />
      </div>
      <RapportProef />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Pagina />
  </React.StrictMode>,
);
