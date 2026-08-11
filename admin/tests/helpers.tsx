/**
 * Outils partagés par les tests : faux serveur, comptes de référence, montage.
 *
 * Repris de `app/tests/helpers.tsx` — c'est le même client HTTP, le même
 * contrat d'erreur, la même façon de simuler. Ce qui change tient aux réponses
 * d'administration, propres à la Vague 3.
 */

import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

import type { Compte } from '../src/lib/comptes';
import { Comptes } from '../src/routes/Comptes';
import { FicheCompte } from '../src/routes/FicheCompte';

/* -------------------------------------------------------------------------- */
/* Réponses HTTP simulées                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Réponse HTTP minimale mais fidèle : le client lit `ok`, `status`,
 * `headers.get()` et `json()`.
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
    url: 'http://localhost:4000/api/admin/users',
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

/* -------------------------------------------------------------------------- */
/* Faux serveur                                                               */
/* -------------------------------------------------------------------------- */

/** Requête telle que la voit le faux serveur. */
export interface MockRequest {
  method: string;
  path: string;
  /** URL complète, chaîne de requête comprise. */
  url: string;
  /** Paramètres de requête (`?recherche=…&statut=…`). */
  query: URLSearchParams;
  /** Corps JSON déjà relu. */
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export type MockHandler = (request: MockRequest) => Response | Promise<Response>;

/** Accès au double de `fetch` installé par `setup.ts`. */
export function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<typeof import('vitest').vi.fn>;
}

/**
 * Installe un faux serveur, route par route.
 *
 * La clé est `"MÉTHODE /chemin"`. Tout appel vers une route non déclarée échoue
 * bruyamment : un test ne doit jamais réussir parce qu'une requête inattendue
 * est passée inaperçue — c'est précisément ce qu'on veut détecter quand on
 * vérifie qu'une action lourde n'est **pas** partie sans confirmation.
 */
export function mockApi(routes: Record<string, MockHandler>): void {
  fetchMock().mockImplementation((input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const parsed = new URL(url);
    const key = `${method} ${parsed.pathname}`;

    const handler = routes[key];
    if (!handler) {
      return Promise.reject(new Error(`Appel réseau non simulé dans ce test : ${key}`));
    }

    const body =
      typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};

    return Promise.resolve(
      handler({
        method,
        path: parsed.pathname,
        url,
        query: parsed.searchParams,
        body,
        headers: (init.headers ?? {}) as Record<string, string>,
      }),
    );
  });
}

/** Les appels réellement partis, sous la forme « MÉTHODE /chemin ». */
export function appelsEffectues(): string[] {
  return fetchMock().mock.calls.map((appel: unknown[]) => {
    const url = new URL(String(appel[0]));
    const init = (appel[1] ?? {}) as RequestInit;
    return `${(init.method ?? 'GET').toUpperCase()} ${url.pathname}`;
  });
}

/* -------------------------------------------------------------------------- */
/* Comptes et jetons de référence                                             */
/* -------------------------------------------------------------------------- */

/** Le propriétaire, tel que `/api/auth/me` le renvoie. */
export const ADMIN_USER = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'proprietaire@irrigation-pro.sn',
  fullName: 'Amadou Ba',
  company: 'Irrigation Pro',
  role: 'ADMIN',
  mustChangePassword: false,
};

/** Un client ordinaire : il s'authentifie, mais n'a rien à faire ici. */
export const CLIENT_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'jean@bureau-etudes.sn',
  fullName: 'Jean Diop',
  company: "Bureau d'études Sahel",
  role: 'CLIENT',
  mustChangePassword: false,
};

export const SESSION_TOKENS = {
  accessToken: 'acces-1',
  refreshToken: 'rafraichissement-1',
  expiresIn: 900,
};

/* -------------------------------------------------------------------------- */
/* Comptes clients de référence (forme exacte du contrat § 2)                 */
/* -------------------------------------------------------------------------- */

export const COMPTE_ACTIF: Compte = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  email: 'fatou@sahel-irrigation.sn',
  nomComplet: 'Fatou Ndiaye',
  societe: 'Sahel Irrigation',
  role: 'CLIENT',
  statut: 'ACTIF',
  doitChangerMotDePasse: false,
  verrouilleJusqua: null,
  derniereConnexion: '2026-08-10T09:12:00.000Z',
  creeLe: '2026-03-02T08:00:00.000Z',
  nombreProjets: 4,
};

export const COMPTE_SUSPENDU: Compte = {
  id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  email: 'moussa@agro-delta.sn',
  nomComplet: 'Moussa Sow',
  societe: 'Agro Delta',
  role: 'CLIENT',
  statut: 'SUSPENDU',
  doitChangerMotDePasse: false,
  verrouilleJusqua: null,
  derniereConnexion: '2026-07-01T09:12:00.000Z',
  creeLe: '2026-01-15T08:00:00.000Z',
  nombreProjets: 1,
};

/** Réponse type de `GET /api/admin/activite`. */
export const ACTIVITE_RECENTE = {
  activites: [
    {
      id: 'act-1',
      compteId: COMPTE_ACTIF.id,
      action: 'LOGIN_SUCCESS',
      typeEntite: null,
      entiteId: null,
      adresseIp: '41.82.0.14',
      appareil: null,
      contexte: null,
      dateHeure: '2026-08-10T09:12:00.000Z',
    },
  ],
  actionsAdmin: [
    {
      id: 'adm-1',
      auteurId: ADMIN_USER.id,
      compteCibleId: COMPTE_SUSPENDU.id,
      action: 'SUSPEND',
      motif: 'Abonnement non renouvelé',
      contexte: null,
      dateHeure: '2026-08-09T15:00:00.000Z',
    },
  ],
  statistiques: { comptes: 2, comptesActifs: 1, comptesSuspendus: 1 },
};

/** Réponse type de `GET /api/admin/users/:id/activite`. */
export function activiteDuCompte(compte: Compte) {
  return {
    compte,
    activites: [
      {
        id: 'act-fiche-1',
        compteId: compte.id,
        action: 'LOGIN_SUCCESS',
        typeEntite: null,
        entiteId: null,
        adresseIp: '41.82.0.14',
        appareil: null,
        contexte: null,
        dateHeure: '2026-08-10T09:12:00.000Z',
      },
    ],
    actionsAdmin: [],
    totalActionsAdmin: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Montage                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Monte un arbre React dans les mêmes conditions que le dashboard réel, mais
 * avec un cache de requêtes neuf et silencieux à chaque test.
 */
export function renderAdmin(ui: ReactElement, options: { route?: string } = {}): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, staleTime: 0, retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Monte les écrans de gestion des comptes avec leur vrai routage, mais **sans
 * la coque** (qui exige une session) ni l'écran de connexion.
 *
 * La connexion est couverte à part, dans `connexion.test.tsx` ; la rejouer
 * avant chaque test de liste ne vérifierait rien de plus. Les appels partent
 * donc sans jeton — sans importance ici : c'est le serveur qui contrôle
 * l'accès, et il est simulé.
 */
export function renderComptes(route = '/comptes'): RenderResult {
  return renderAdmin(
    <Routes>
      <Route path="/comptes" element={<Comptes />} />
      <Route path="/comptes/:compteId" element={<FicheCompte />} />
    </Routes>,
    { route },
  );
}
