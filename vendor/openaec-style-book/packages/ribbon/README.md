# @openaec/ribbon

Office-style ribbon UI componenten voor OpenAEC desktop tools. Tab-based navigatie met animaties, groepen, en knoppen — alles styled met de OpenAEC theme tokens.

## Componenten

- **Ribbon** — container met tab-navigatie en animaties tussen tabs
- **RibbonTab** — single tab knop (intern gebruikt door Ribbon)
- **RibbonGroup** — gegroepeerd blok met label onderaan
- **RibbonButton** — large/small/medium knop met icon + label, active/disabled states
- **RibbonButtonStack** — verticale stapeling voor kleine knoppen
- **icons** — herbruikbare SVG-iconen (Bold, Italic, Cut, Copy, Paste, Pencil, etc.)

## Installatie

```bash
npm install @openaec/ribbon
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

## Gebruik

```tsx
import {
  Ribbon,
  RibbonGroup,
  RibbonButton,
  RibbonButtonStack,
  icons,
} from "@openaec/ribbon";
import "@openaec/ribbon/css";

function MyApp() {
  const homeTab = (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label="Klembord">
          <RibbonButton icon={icons.pasteIcon} label="Plakken" size="large" />
          <RibbonButtonStack>
            <RibbonButton icon={icons.cutIcon} label="Knippen" size="small" />
            <RibbonButton icon={icons.copyIcon} label="Kopiëren" size="small" />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );

  return (
    <Ribbon
      fileTabLabel="Bestand"
      onFileTabClick={() => alert("File menu")}
      tabs={[
        { id: "home", label: "Start", content: homeTab },
        { id: "view", label: "Beeld", content: <div /> },
      ]}
    />
  );
}
```

## API

### `<Ribbon tabs={...}>`

| Prop | Type | Default | Beschrijving |
|------|------|---------|--------------|
| `tabs` | `TabDef[]` | required | Array van `{ id, label, content }` |
| `defaultActiveId` | `string` | first tab | Standaard-actieve tab |
| `activeId` | `string` | — | Controlled: forceert de actieve tab |
| `onActiveChange` | `(id) => void` | — | Callback bij tab-wissel |
| `fileTabLabel` | `string` | `"File"` | Label voor de File-tab (oranje) |
| `onFileTabClick` | `() => void` | — | Click handler. Zonder dit wordt de File-tab niet gerenderd |
| `hiddenContentIds` | `string[]` | `[]` | Tabs waarbij content-area moet collapseren |

### Iconen

Beschikbaar via `import { icons } from "@openaec/ribbon"`:

`pasteIcon`, `cutIcon`, `copyIcon`, `undoIcon`, `redoIcon`, `boldIcon`, `italicIcon`, `underlineIcon`, `alignLeftIcon`, `alignCenterIcon`, `alignRightIcon`, `pencilIcon`, `lineIcon`, `arrowIcon`, `circleIcon`, `rectangleIcon`, `imageIcon`, `tableIcon`, `linkIcon`, `settingsIcon`, `helpIcon`, `infoIcon`, `projectIcon`, plus IFC/3D-viewer/Report-specific iconen.

## Theming

Gebruikt CSS variables uit `@openaec/design-tokens` (specifiek `--theme-ribbon-*`, `--theme-accent`, `--theme-file-tab-*`).

## Licentie

MIT — © OpenAEC Foundation
