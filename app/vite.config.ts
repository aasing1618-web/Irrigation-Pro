import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
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

/**
 * Vrai lorsque la compilation est pilotée par la CLI Tauri.
 *
 * La CLI v2 exporte `TAURI_ENV_*` avant d'appeler Vite. C'est ce qui permet de
 * viser la WebView de Windows quand on fabrique le `.exe`, et les navigateurs
 * du marché quand on publie la version web — sans deux fichiers de
 * configuration à tenir en parallèle.
 */
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM ?? process.env.TAURI_ENV_DEBUG);

/**
 * Cibles de compilation.
 *
 * - Tauri : la WebView v2 sur Windows est un Edge/Chromium 110+.
 * - Web   : les versions minimales exigées par Tailwind v4, qui s'appuie sur
 *   des primitives CSS récentes (`@property`, `color-mix`). Viser plus bas en
 *   JavaScript ne servirait à rien : la feuille de style ne suivrait pas.
 */
const BUILD_TARGET_TAURI = 'chrome110';
const BUILD_TARGET_WEB = ['chrome111', 'edge111', 'firefox128', 'safari16.4'];

/**
 * Dépose `version.json` à côté de l'application compilée.
 *
 * C'est tout le mécanisme de détection de mise à jour côté web : l'onglet
 * ouvert relit ce fichier de temps en temps et compare avec la version figée
 * dans son propre code (voir `src/lib/update-check.ts`). Écrit à la main plutôt
 * qu'avec un greffon du marché : trois lignes ne justifient pas une dépendance
 * de plus à surveiller.
 */
function versionManifestPlugin(version: string): Plugin {
  return {
    name: 'irrigation-pro:version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2)}\n`,
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), versionManifestPlugin(pkg.version)],

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
    target: isTauriBuild ? BUILD_TARGET_TAURI : BUILD_TARGET_WEB,
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
