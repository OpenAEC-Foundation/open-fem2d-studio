import React from 'react';
import ReactDOM from 'react-dom/client';

// OpenAEC design system — load BEFORE local CSS so app overrides win where needed.
// Tokens (colors / typography / spacing / shadows) — sets all --theme-* + --color-* CSS vars.
import '@openaec/design-tokens/css';
// Layout primitives (.oa-app-shell, .oa-topbar, .oa-ribbon, .oa-sidebar, .oa-panel).
import '@openaec/design-tokens/layouts';
// Component primitives (.oa-btn, .oa-card, .oa-input, .oa-badge).
import '@openaec/design-tokens/components';
// Shell components (TitleBar, StatusBar, DocumentBar) styles.
import '@openaec/shell/css';
// Ribbon component styles.
import '@openaec/ribbon/css';
// UI primitives (Modal, ThemedSelect) styles.
import '@openaec/ui-primitives/css';
// CANONICAL OpenAEC theme tokens — vendored from project-templates/Tauri+React/src/themes.css.
// Loads AFTER the package tokens so it supersedes them where keys overlap.
import './styles/openaec-themes.css';
// CANONICAL OpenAEC component CSS — 17 files concatenated from project-templates/Tauri+React/src/components/.
// Same class names as @openaec/shell + @openaec/ribbon packages, so these rules
// win at equal specificity (later-loaded wins). This is what produces the
// pixel-perfect match with the reference app screenshot.
import './styles/openaec-components.css';
// Local glue styles for OpenAEC shell wrappers (Phase 2-7).
import './components/openaec/openaec-shell.css';

import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
