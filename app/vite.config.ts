import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * Version de l'application, lue depuis package.json et injectée à la
 * compilation. C'est la seule source de vérité du numéro de version :
 * on ne le recopie nulle part à la main.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Tauri lit les variables préfixées TAURI_ ; Vite expose les VITE_.
  envPrefix: ['VITE_', 'TAURI_'],

  server: {
    port: 5173,
    strictPort: true,
    host: false,
  },

  build: {
    // La WebView de Tauri v2 sur Windows est basée sur Edge/Chromium 110+.
    target: 'chrome110',
    // Pas de sourcemaps en production : le bundle livré au client reste opaque.
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    outDir: 'dist',
    emptyOutDir: true,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
});
