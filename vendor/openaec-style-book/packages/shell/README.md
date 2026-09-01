# @openaec/shell

Window chrome voor OpenAEC desktop tools — TitleBar, StatusBar en DocumentBar als losse, prop-driven componenten. Werkt zowel in Tauri als in een browser (window controls vallen terug naar no-op).

## Componenten

- **TitleBar** — sleepbalk, quick-access buttons, app-naam/versie, min/max/close
- **StatusBar** — drie slots (left/center/right) met helper-componenten `StatusItem` en `StatusSeparator`
- **DocumentBar** — controlled tab strip met optioneel drag-to-detach

## Installatie

```bash
npm install @openaec/shell
```

Peer dependencies: `react >= 18`, `react-dom >= 18`. Optioneel: `@tauri-apps/api >= 2` (alleen vereist als je window controls wilt).

## Gebruik

```tsx
import {
  TitleBar,
  StatusBar,
  StatusItem,
  StatusSeparator,
  DocumentBar,
  type DocTab,
} from "@openaec/shell";
import "@openaec/shell/css";
import { icons } from "@openaec/ribbon";

function App() {
  const [docs, setDocs] = useState<DocTab[]>([
    { id: "1", title: "Project.oaec", view: "default" },
  ]);
  const [activeId, setActiveId] = useState("1");

  return (
    <>
      <TitleBar
        appName="OpenAEC Desktop"
        appVersion="0.1.0"
        appIcon={<MyLogo />}
        actions={[
          { id: "save", label: "Opslaan", icon: icons.imageIcon, onClick: handleSave },
          { id: "undo", label: "Ongedaan", icon: icons.undoIcon, onClick: handleUndo },
        ]}
        feedbackLabel="Send Feedback"
        onFeedbackClick={openFeedback}
      />

      <DocumentBar
        docs={docs}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={(id) => setDocs((d) => d.filter((t) => t.id !== id))}
        onDetach={({ tab, screenX, screenY }) => {
          // Spawn a Tauri WebviewWindow at (screenX-400, screenY-50) with tab.view
          // and remove the tab from this bar
        }}
      />

      <main>{/* ... */}</main>

      <StatusBar
        left={
          <>
            <StatusItem>Ready</StatusItem>
            <StatusSeparator />
            <StatusItem label="Items:">0</StatusItem>
          </>
        }
        center={<StatusItem>OpenAEC Desktop v0.1.0</StatusItem>}
        right={<StatusItem label="Zoom:">100%</StatusItem>}
      />
    </>
  );
}
```

## TitleBar in web-only mode

```tsx
<TitleBar
  appName="My Web App"
  enableWindowControls={false}
  actions={[...]}
/>
```

## Theming

Gebruikt CSS variables uit `@openaec/design-tokens` (`--theme-*` tokens). Zie de README van design-tokens voor de volledige lijst.

## Licentie

MIT — © OpenAEC Foundation
