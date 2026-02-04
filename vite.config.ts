import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './vite-api-plugin';

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Proxy unhandled /api requests to Python backend (e.g. /api/chat for AI)
      '/api/chat': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    },
    // Ensure proper MIME types for WASM files
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // Exclude web-ifc from Vite's dependency optimization so the WASM
    // module is loaded at runtime from public/ rather than pre-bundled.
    exclude: ['web-ifc'],
  },
  assetsInclude: ['**/*.wasm'],
});
