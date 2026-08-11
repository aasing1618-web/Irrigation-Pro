/**
 * Préparation commune des tests du site.
 *
 * Le site est statique : il ne doit appeler personne, jamais. `fetch` est donc
 * remplacé par un double qui échoue — un appel réseau glissé par inadvertance
 * (mesure d'audience, police distante, sonde quelconque) ferait tomber les
 * tests plutôt que de partir en production.
 */

import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Le site vitrine ne doit effectuer aucun appel réseau.'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
