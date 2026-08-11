import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

import { retirerToleranceDevCsp } from './build/csp';

/**
 * Version du site, lue depuis package.json et injectée à la compilation.
 * Une seule source de vérité : le numéro n'est recopié nulle part à la main.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

/**
 * Retire de la CSP la tolérance réservée au développement.
 * La règle et sa justification vivent dans `build/csp.ts`.
 */
function cspProductionPlugin(): Plugin {
  return {
    name: 'irrigation-pro:csp-production',
    apply: 'build',
    transformIndexHtml: (html) => retirerToleranceDevCsp(html),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspProductionPlugin()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  define: {
    __SITE_VERSION__: JSON.stringify(pkg.version),
  },

  envPrefix: ['VITE_'],

  server: {
    // 5175 : 5173 est l'application cliente, 5174 le dashboard. `strictPort`
    // fait échouer le démarrage plutôt que de glisser en silence sur un autre
    // port et de laisser croire qu'on regarde le bon site.
    port: 5175,
    strictPort: true,
    host: false,
  },

  preview: {
    port: 5175,
    strictPort: true,
  },

  build: {
    // Le site ne parle à aucun serveur : le résultat est un dossier de
    // fichiers statiques, déployable tel quel sur n'importe quel hébergement.
    target: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
    sourcemap: false,
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
