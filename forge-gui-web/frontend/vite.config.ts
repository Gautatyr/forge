/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
  server: { port: 5173, strictPort: true },
  // Vitest blanks CSS by default; the keyword-icon test reads mana-font's codepoints.
  test: { css: { include: [/mana-font/] } },
});
