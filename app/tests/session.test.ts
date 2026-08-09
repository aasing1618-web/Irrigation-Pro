/**
 * Le client HTTP et la session, sans interface.
 *
 * Ces tests couvrent le mécanisme le plus délicat de la Vague 1 : le
 * rafraîchissement automatique du jeton d'accès. Il doit être invisible pour
 * l'utilisateur, et surtout **mutualisé** — le contrat d'API révoque toutes les
 * sessions d'un compte si un jeton de rafraîchissement déjà utilisé est
 * présenté une seconde fois.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError, apiRequest } from '../src/lib/api';
import {
  getAccessToken,
  getAuthSnapshot,
  login,
  readStoredRefreshTokenForTests,
  resetAuthStoreForTests,
} from '../src/lib/auth-store';
import {
  CLIENT_USER,
  ROTATED_TOKENS,
  SESSION_TOKENS,
  errorResponse,
  jsonResponse,
  mockApi,
} from './helpers';

beforeEach(() => {
  resetAuthStoreForTests();
});

/** Ouvre une session valide, comme le ferait l'écran de connexion. */
async function openSession() {
  await login(CLIENT_USER.email, 'un-mot-de-passe-solide');
}

describe('jetons', () => {
  it('range le jeton d’accès en mémoire et le jeton de rafraîchissement dans le stockage sécurisé', async () => {
    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
    });

    await openSession();

    expect(getAccessToken()).toBe(SESSION_TOKENS.accessToken);
    expect(await readStoredRefreshTokenForTests()).toBe(SESSION_TOKENS.refreshToken);
    // Ni l'un ni l'autre ne sont écrits dans un stockage du navigateur.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('joint le jeton d’accès à chaque requête authentifiée', async () => {
    let seen: string | undefined;
    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'GET /api/auth/me': ({ headers }) => {
        seen = headers.Authorization;
        return jsonResponse({ user: CLIENT_USER });
      },
    });

    await openSession();
    await apiRequest('/api/auth/me');

    expect(seen).toBe(`Bearer ${SESSION_TOKENS.accessToken}`);
  });
});

describe('rafraîchissement automatique', () => {
  /**
   * Faux serveur : `/api/auth/me` n'accepte que le jeton en cours de validité.
   * Toute requête présentant un jeton périmé reçoit `401`, exactement comme le
   * vrai serveur.
   */
  function serverWithExpiredAccessToken() {
    const counters = { refresh: 0, me: 0 };

    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'POST /api/auth/refresh': () => {
        counters.refresh += 1;
        return jsonResponse(ROTATED_TOKENS);
      },
      'GET /api/auth/me': ({ headers }) => {
        counters.me += 1;
        if (headers.Authorization !== `Bearer ${ROTATED_TOKENS.accessToken}`) {
          return errorResponse(401, 'TOKEN_INVALID', 'Session invalide.');
        }
        return jsonResponse({ user: CLIENT_USER });
      },
    });

    return counters;
  }

  it('rafraîchit puis rejoue la requête, sans que l’appelant s’en aperçoive', async () => {
    const counters = serverWithExpiredAccessToken();
    await openSession();

    const result = await apiRequest<{ user: typeof CLIENT_USER }>('/api/auth/me');

    expect(result.user.email).toBe(CLIENT_USER.email);
    expect(counters.refresh).toBe(1);
    expect(counters.me).toBe(2); // l'échec, puis la reprise
    expect(getAccessToken()).toBe(ROTATED_TOKENS.accessToken);
    expect(await readStoredRefreshTokenForTests()).toBe(ROTATED_TOKENS.refreshToken);
    expect(getAuthSnapshot().status).toBe('authenticated');
  });

  it('ne déclenche QU’UN SEUL rafraîchissement quand plusieurs requêtes échouent ensemble', async () => {
    const counters = serverWithExpiredAccessToken();
    await openSession();

    // Le cas réel : un écran qui lance trois appels au démarrage. Sans
    // mutualisation, trois rotations partiraient en parallèle et le serveur
    // révoquerait toutes les sessions du compte (REFRESH_TOKEN_REUSE).
    const responses = await Promise.all([
      apiRequest<{ user: typeof CLIENT_USER }>('/api/auth/me'),
      apiRequest<{ user: typeof CLIENT_USER }>('/api/auth/me'),
      apiRequest<{ user: typeof CLIENT_USER }>('/api/auth/me'),
    ]);

    expect(counters.refresh).toBe(1);
    for (const response of responses) {
      expect(response.user.email).toBe(CLIENT_USER.email);
    }
    expect(getAuthSnapshot().status).toBe('authenticated');
  });

  it('n’essaie de rafraîchir qu’une seule fois : si le jeton neuf est refusé, la session tombe', async () => {
    let refreshCalls = 0;
    let meCalls = 0;

    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'POST /api/auth/refresh': () => {
        refreshCalls += 1;
        return jsonResponse(ROTATED_TOKENS);
      },
      // Le serveur refuse tout, même le jeton fraîchement émis.
      'GET /api/auth/me': () => {
        meCalls += 1;
        return errorResponse(401, 'TOKEN_INVALID', 'Session invalide.');
      },
    });

    await openSession();
    await expect(apiRequest('/api/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(refreshCalls).toBe(1);
    expect(meCalls).toBe(2);
    expect(getAccessToken()).toBeNull();
    expect(getAuthSnapshot().status).toBe('anonymous');
  });

  it('efface les jetons et renvoie à la connexion quand le rafraîchissement échoue', async () => {
    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'POST /api/auth/refresh': () =>
        errorResponse(401, 'REFRESH_TOKEN_INVALID', 'Session expirée.'),
      'GET /api/auth/me': () => errorResponse(401, 'TOKEN_INVALID', 'Session invalide.'),
    });

    await openSession();
    await expect(apiRequest('/api/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(getAccessToken()).toBeNull();
    expect(await readStoredRefreshTokenForTests()).toBeNull();

    const snapshot = getAuthSnapshot();
    expect(snapshot.status).toBe('anonymous');
    expect(snapshot.user).toBeNull();
    expect(snapshot.notice?.kind).toBe('expired');
  });
});

describe('suspension en cours de session', () => {
  it('termine la session avec le message du serveur, sans le reformuler', async () => {
    const message = 'Votre compte est suspendu. Contactez votre fournisseur.';

    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'GET /api/auth/me': () => errorResponse(403, 'ACCOUNT_SUSPENDED', message),
    });

    await openSession();
    await expect(apiRequest('/api/auth/me')).rejects.toBeInstanceOf(ApiError);

    const snapshot = getAuthSnapshot();
    expect(snapshot.status).toBe('anonymous');
    expect(snapshot.notice).toEqual({ kind: 'suspended', message });
    expect(getAccessToken()).toBeNull();
    expect(await readStoredRefreshTokenForTests()).toBeNull();
  });

  it('conserve le motif « suspendu » même si le rafraîchissement échoue ensuite', async () => {
    const message = 'Votre compte est suspendu. Contactez votre fournisseur.';

    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'POST /api/auth/refresh': () => errorResponse(403, 'ACCOUNT_SUSPENDED', message),
      'GET /api/auth/me': () => errorResponse(401, 'TOKEN_INVALID', 'Session invalide.'),
    });

    await openSession();
    await expect(apiRequest('/api/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(getAuthSnapshot().notice).toEqual({ kind: 'suspended', message });
  });
});
