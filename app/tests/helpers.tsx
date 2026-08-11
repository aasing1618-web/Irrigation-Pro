/**
 * Outils partagés par les tests : montage de l'application et fausses réponses
 * HTTP. Regroupés ici pour que chaque test reste lisible.
 */

import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

import { CalculRun } from '../src/routes/CalculRun';
import { Calculations } from '../src/routes/Calculations';
import { ProjectDetail } from '../src/routes/ProjectDetail';
import { Projects } from '../src/routes/Projects';

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

/**
 * Réponse binaire — le PDF d'un rapport.
 *
 * Le client lit le corps par `blob()` et non par `json()` : il faut donc une
 * réponse distincte, sans quoi un test de téléchargement vérifierait un chemin
 * de code que l'application n'emprunte jamais.
 */
export function pdfResponse(contenu = 'PDF factice'): Response {
  const blob = new Blob([contenu], { type: 'application/pdf' });
  const headers = new Map<string, string>([
    ['content-type', 'application/pdf'],
    ['content-disposition', 'attachment; filename="Rapport.pdf"'],
  ]);

  return {
    ok: true,
    status: 200,
    url: 'http://localhost:4000/api/reports/x/fichier',
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    blob: () => Promise.resolve(blob),
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
  /** URL complète, chaîne de requête comprise. */
  url: string;
  /** Paramètres de requête (`?recherche=…&statut=…`). */
  query: URLSearchParams;
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
    const parsed = new URL(url);
    const path = parsed.pathname;
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
      handler({
        method,
        path,
        url,
        query: parsed.searchParams,
        body,
        headers: (init.headers ?? {}) as Record<string, string>,
      }),
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

/* --- Vague 2 : projets et calculs ------------------------------------------ */

/**
 * Monte les écrans de travail de la Vague 2 avec leur vrai routage.
 *
 * On n'y traverse pas l'écran de connexion : la session est déjà couverte par
 * `auth-flow.test.tsx`, et la rejouer dans chaque test des projets ne
 * vérifierait rien de plus tout en multipliant la durée de la suite. Les appels
 * partent donc sans jeton — sans importance ici, c'est le serveur qui contrôle
 * l'accès, et il est simulé.
 */
export function renderWorkspace(route: string): RenderResult {
  return renderApp(
    <Routes>
      <Route path="/projets" element={<Projects />} />
      <Route path="/projets/:projectId" element={<ProjectDetail />} />
      <Route path="/projets/:projectId/calculs/:moduleCode" element={<CalculRun />} />
      <Route path="/calculs" element={<Calculations />} />
      <Route path="/calculs/:moduleCode" element={<CalculRun />} />
    </Routes>,
    { route },
  );
}

/** Deux projets de référence, tels que le serveur les renvoie. */
export const PROJECT_NDIAYE = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  nom: 'Périmètre de Ndiaye',
  nomClient: 'SAED',
  localisation: 'Delta du fleuve Sénégal',
  description: 'Réhabilitation du réseau gravitaire.',
  statut: 'EN_COURS',
  creeLe: '2026-06-02T08:00:00.000Z',
  modifieLe: '2026-08-05T08:00:00.000Z',
  nombreCalculs: 2,
};

export const PROJECT_FANAYE = {
  id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  nom: 'Casier de Fanaye',
  nomClient: 'Coopérative de Fanaye',
  localisation: 'Podor',
  description: '',
  statut: 'BROUILLON',
  creeLe: '2026-07-20T08:00:00.000Z',
  modifieLe: '2026-07-21T08:00:00.000Z',
  nombreCalculs: 0,
};

/**
 * Catalogue de modules **entièrement inventé**.
 *
 * C'est délibéré : ce module n'existe pas dans le produit et n'existera jamais.
 * Si les tests passent avec lui, c'est que l'application construit bien ses
 * formulaires à partir de ce que le serveur déclare, et qu'aucun champ n'est
 * écrit en dur quelque part.
 */
export const FAKE_CATALOGUE = {
  modules: [
    {
      code: 'MODULE_FICTIF',
      famille: 'Famille inventée pour le test',
      nom: 'Module de démonstration',
      description: 'Ce module n’existe pas ; il sert à vérifier le rendu dynamique.',
      entrees: [
        {
          champ: 'superficie',
          libelle: 'Superficie irriguée',
          unite: 'ha',
          type: 'nombre',
          min: 0,
          obligatoire: true,
          aide: 'Surface réellement mise en eau.',
        },
        {
          champ: 'culture',
          libelle: 'Culture principale',
          type: 'liste',
          obligatoire: true,
          options: [
            { cle: 'RIZ', libelle: 'Riz irrigué' },
            { cle: 'TOMATE', libelle: 'Tomate industrielle' },
          ],
        },
        {
          champ: 'remarque',
          libelle: 'Remarque de terrain',
          type: 'texte',
          obligatoire: false,
        },
      ],
      sorties: [
        { champ: 'besoinBrut', libelle: 'Besoin brut', unite: 'm³/j', principal: true },
        { champ: 'coefficient', libelle: 'Coefficient retenu', unite: '' },
      ],
    },
  ],
};

/** Réponse type d'un calcul réussi, avec unités et avertissement. */
export const CALCUL_OK = {
  resultats: {
    besoinBrut: 1284.5,
    coefficient: 1.15,
  },
  avertissements: [
    'La vitesse d’écoulement dépasse la plage admise pour un canal en terre.',
  ],
  engineVersion: '1.0.0',
};
