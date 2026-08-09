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

/** Erreur au format du contrat d'API : `{ error: { code, message } }`. */
export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, { status });
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

/* --- Comptes et jetons de référence ---------------------------------------- */

/** Client type, tel que le serveur le renvoie (contrat d'API, § 2). */
export const CLIENT_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'jean@bureau-etudes.sn',
  fullName: 'Jean Diop',
  company: "Bureau d'études Sahel",
  role: 'CLIENT',
  mustChangePassword: false,
};

/** Couple de jetons initial. */
export const SESSION_TOKENS = {
  accessToken: 'acces-1',
  refreshToken: 'rafraichissement-1',
  expiresIn: 900,
};

/** Couple de jetons émis après rotation. */
export const ROTATED_TOKENS = {
  accessToken: 'acces-2',
  refreshToken: 'rafraichissement-2',
  expiresIn: 900,
};

/** Accès au double de `fetch` installé par `setup.ts`. */
export function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<
    typeof import('vitest').vi.fn
  >;
}

/** Requête telle que la voit un faux serveur. */
export interface MockRequest {
  method: string;
  path: string;
  /** Corps JSON déjà relu. */
  body: Record<string, unknown>;
  /** En-têtes envoyés — dont `Authorization`. */
  headers: Record<string, string>;
}

export type MockHandler = (request: MockRequest) => Response | Promise<Response>;

/**
 * Installe un faux serveur, route par route.
 *
 * La clé est `"MÉTHODE /chemin"`, par exemple `"POST /api/auth/login"`. Tout
 * appel vers une route non déclarée échoue bruyamment : un test ne doit jamais
 * réussir par accident parce qu'une requête inattendue est passée inaperçue.
 */
export function mockApi(routes: Record<string, MockHandler>): void {
  fetchMock().mockImplementation((input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    const key = `${method} ${path}`;

    const handler = routes[key];
    if (!handler) {
      return Promise.reject(new Error(`Appel réseau non simulé dans ce test : ${key}`));
    }

    const body =
      typeof init.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};

    return Promise.resolve(
      handler({ method, path, body, headers: (init.headers ?? {}) as Record<string, string> }),
    );
  });
}

/**
 * Monte un arbre React dans les mêmes conditions que l'application réelle,
 * mais avec un cache de requêtes neuf et silencieux à chaque test.
 */
export function renderApp(ui: ReactElement, options: { route?: string } = {}): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, staleTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
