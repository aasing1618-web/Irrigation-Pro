/**
 * Préparation commune des tests du dashboard.
 *
 * Deux filets de sécurité, à chaque test :
 *
 *  1. **Aucun test ne touche le réseau.** `fetch` est systématiquement remplacé
 *     par un double qui échoue. Un test qui appellerait le vrai serveur — ou
 *     une route qu'il a oublié de simuler — échoue bruyamment plutôt que de
 *     passer par accident.
 *
 *  2. **La session repart de zéro.** `lib/session.ts` détient les jetons dans
 *     des variables de module : sans cette remise à zéro, un test connecté
 *     laisserait le suivant croire qu'il l'est déjà. La configuration mise en
 *     cache est oubliée pour la même raison.
 */

import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

import { resetConfigCache } from '../src/lib/config';
import { resetSessionForTests } from '../src/lib/session';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Appel réseau non simulé dans ce test.'))),
  );
  resetSessionForTests();
  resetConfigCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSessionForTests();
  resetConfigCache();
});
