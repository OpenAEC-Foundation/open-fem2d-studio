import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './vite-api-plugin';
import path from 'node:path';

const TAURI_DEV_HOST = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), apiPlugin()],
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: TAURI_DEV_HOST || false,
    hmr: TAURI_DEV_HOST
      ? { protocol: 'ws', host: TAURI_DEV_HOST, port: 1421 }
      : undefined,
    watch: {
      ignored: [
        '**/src-tauri/**',
        // ts-rs schrijft deze .ts-bestanden opnieuw weg bij ELKE `cargo test`
        // (de export_bindings_*-tests). Zonder deze regel hot-reload't de app
        // tijdens een testrun om de paar seconden. De gegenereerde types
        // veranderen alleen als de Rust-structs veranderen; ververs het
        // venster daarna handmatig.
        '**/src/lib/types/steel/**',
        '**/src/lib/types/timber/**',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  optimizeDeps: {
    // Exclude web-ifc from Vite's dependency optimization so the WASM
    // module is loaded at runtime from public/ rather than pre-bundled.
    // Exclude OpenAEC packages so Vite compiles their .tsx sources at
    // dev time rather than pre-bundling (they ship raw src/, no dist/).
    exclude: [
      'web-ifc',
      '@openaec/shell',
      '@openaec/ribbon',
      '@openaec/ui-primitives',
    ],
  },
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@profiles': path.resolve(__dirname, 'src-tauri/crates/steel-profiles/data/profiles.json'),
    },
  },
});
