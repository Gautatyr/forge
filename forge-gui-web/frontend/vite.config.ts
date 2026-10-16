/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Live mode through the dev server (`?live=1#token=…`): /ws and /img are proxied to the bridge. `make web-dev`
// sets FORGE_BRIDGE to this worktree's `make web-server` port.
// (No @types/node in this project: read the environment through globalThis.)
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const bridge = env.FORGE_BRIDGE ?? 'http://127.0.0.1:7655';

export default defineConfig({
  plugins: [react()],
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
  // Recorded game streams (src/adapter/fixtures/), imported with ?inline.
  assetsInclude: ['**/*.jsonl.gz'],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': {
        target: bridge,
        ws: true,
        changeOrigin: true,
        // The bridge accepts browser upgrades only from its own page's Origin (plus the per-launch
        // token): present the dev page's upgrade as coming from the bridge's page.
        headers: { origin: bridge },
      },
      // Card images (src/adapter/images.ts), from the bridge's Forge image cache.
      '/img': { target: bridge, changeOrigin: true },
    },
  },
  // Vitest blanks CSS by default; the keyword-icon test reads mana-font's codepoints.
  test: { css: { include: [/mana-font/] } },
});
