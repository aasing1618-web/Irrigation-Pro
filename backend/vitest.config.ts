import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Les tests ne doivent JAMAIS toucher une vraie base : la couche `db` est
    // moquée dans chaque fichier de test qui en a besoin.
    env: { NODE_ENV: 'test' },
    clearMocks: true,
    restoreMocks: true,
  },
});
