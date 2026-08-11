import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * Version du dashboard, lue depuis package.json et injectée à la compilation.
 * Une seule source de vérité : le numéro n'est recopié nulle part à la main.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  define: {
    __ADMIN_VERSION__: JSON.stringify(pkg.version),
  },

  envPrefix: ['VITE_'],

  server: {
    // 5174 est figé : c'est cette origine exacte qui figure dans la liste
    // blanche CORS du serveur (`CORS_ORIGINS`). `strictPort` fait échouer le
    // démarrage plutôt que de glisser en silence sur 5175, où toutes les
    // requêtes seraient refusées sans que la cause soit lisible.
    port: 5174,
    strictPort: true,
    host: false,
  },

  build: {
    target: 'es2022',
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
