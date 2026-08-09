/**
 * Outils partagés par les tests : montage de l'application et fausses réponses
 * HTTP. Regroupés ici pour que chaque test reste lisible.
 */

import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

/**
 * Fabrique une réponse HTTP minimale mais fidèle : le client lit `ok`,
 * `status`, `headers.get()` et `json()`.
 */
export function jsonResponse(
  body: unknown,
  init: { status?: number; requestId?: string } = {},
): Response {
  const status = init.status ?? 200;
  const headers = new Map<string, string>([['content-type', 'application/json']]);
  if (init.requestId) headers.set('x-request-id', init.requestId);

  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'http://localhost:4000/health',
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Réponse type du serveur en bonne santé (contrat confirmé côté backend). */
export const HEALTH_OK = {
  status: 'ok',
  version: '0.1.0',
  uptime: 1234,
  timestamp: '2026-08-09T12:14:47.000Z',
  database: { ok: true, latencyMs: 4 },
};

/** Réponse type du serveur dont la base est injoignable (HTTP 503). */
export const HEALTH_DEGRADED = {
  status: 'degraded',
  version: '0.1.0',
  uptime: 1234,
  timestamp: '2026-08-09T12:14:47.000Z',
  database: { ok: false, latencyMs: 42 },
};

/** Accès au double de `fetch` installé par `setup.ts`. */
export function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<
    typeof import('vitest').vi.fn
  >;
}

/**
 * Monte un arbre React dans les mêmes conditions que l'application réelle,
 * mais avec un cache de requêtes neuf et silencieux à chaque test.
 */
export function renderApp(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, staleTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
