# @openaec/ui-primitives

Basis UI primitives voor OpenAEC desktop tools — generieke bouwstenen zonder domein-coupling.

## Componenten

- **Modal** — versleepbare dialoog met overlay, ESC-handler en footer slot
- **ThemedSelect** — custom dropdown gestijld via de OpenAEC theme tokens

Beide componenten gebruiken CSS custom properties (`--theme-*`) uit `@openaec/design-tokens`.

## Installatie

```bash
npm install @openaec/ui-primitives
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

## Gebruik

```tsx
import { Modal, ThemedSelect } from "@openaec/ui-primitives";
import "@openaec/ui-primitives/css";

function MyApp() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("nl");

  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Voorbeeld dialoog"
        width={420}
      >
        <ThemedSelect
          value={lang}
          options={[
            { value: "nl", label: "Nederlands" },
            { value: "en", label: "English" },
          ]}
          onChange={setLang}
        />
      </Modal>
    </>
  );
}
```

## Theming

Beide componenten verwachten dat de volgende CSS variables gedefinieerd zijn (zie [`@openaec/design-tokens`](../tokens)):

- `--theme-dialog-bg`, `--theme-dialog-border`, `--theme-dialog-overlay`
- `--theme-dialog-header-bg`, `--theme-dialog-header-text`
- `--theme-dialog-content-bg`, `--theme-dialog-content-text`
- `--theme-dialog-input-bg`, `--theme-dialog-input-border`, `--theme-dialog-input-text`
- `--theme-dialog-shadow`
- `--theme-accent`, `--theme-focus-color`
- `--theme-ribbon-btn-hover`

## Licentie

MIT — © OpenAEC Foundation
