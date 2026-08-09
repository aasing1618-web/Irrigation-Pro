/**
 * Préparation commune des tests.
 *
 * Aucun test ne touche le réseau : `fetch` est systématiquement remplacé par
 * un double. Un test qui appellerait le vrai serveur échouerait ici.
 */

import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  // Filet de sécurité : tout appel réseau non explicitement simulé échoue.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Appel réseau non simulé dans ce test.'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
