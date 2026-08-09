/**
 * Parcours de connexion — la livraison de la Vague 1 côté application.
 *
 * Ces tests montent l'application entière et n'interagissent avec elle que
 * comme le ferait un utilisateur : ils cliquent, ils tapent, ils lisent ce qui
 * est affiché. Le serveur est simulé (`mockApi`) : rien ici n'a besoin du
 * backend.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { App } from '../src/App';
import { apiRequest } from '../src/lib/api';
import { getAuthSnapshot, resetAuthStoreForTests } from '../src/lib/auth-store';
import {
  CLIENT_USER,
  HEALTH_OK,
  ROTATED_TOKENS,
  SESSION_TOKENS,
  errorResponse,
  jsonResponse,
  mockApi,
  renderApp,
} from './helpers';

const LONG_WAIT = { timeout: 4000 };

/** Le serveur répond toujours à l'appel de santé : sinon, pas d'écran de connexion. */
const HEALTH_ROUTE = { 'GET /health': () => jsonResponse(HEALTH_OK) };

beforeEach(() => {
  resetAuthStoreForTests();
});

/** Remplit le formulaire de connexion et le soumet. */
async function signIn(password = 'un-mot-de-passe-solide') {
  const emailField = await screen.findByLabelText('Adresse e-mail', {}, LONG_WAIT);
  fireEvent.change(emailField, { target: { value: CLIENT_USER.email } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('connexion', () => {
  it('laisse entrer un compte actif et affiche son nom dans la navigation', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': ({ body }) => {
        expect(body.email).toBe(CLIENT_USER.email);
        expect(body.password).toBe('un-mot-de-passe-solide');
        return jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER });
      },
    });

    renderApp(<App />);
    await signIn();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT),
    ).toBeDefined();
    expect(screen.getByText('Jean Diop')).toBeDefined();

    // Règle non négociable : aucun jeton n'est écrit sur le disque du poste.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('affiche le message du serveur quand les identifiants sont faux, sans ouvrir de session', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () =>
        errorResponse(
          401,
          'INVALID_CREDENTIALS',
          'Adresse e-mail ou mot de passe incorrect.',
        ),
    });

    renderApp(<App />);
    await signIn('mauvais-mot-de-passe');

    expect(
      await screen.findByText('Adresse e-mail ou mot de passe incorrect.', {}, LONG_WAIT),
    ).toBeDefined();

    // On reste sur l'écran de connexion, aucune session n'est ouverte.
    expect(screen.getByRole('heading', { level: 1, name: 'Connexion' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull();
    expect(getAuthSnapshot().user).toBeNull();

    // Le mot de passe saisi n'est pas conservé après l'envoi.
    const passwordField = screen.getByLabelText('Mot de passe') as HTMLInputElement;
    expect(passwordField.value).toBe('');
  });

  it('distingue un compte suspendu d’un simple mot de passe faux', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () =>
        errorResponse(
          403,
          'ACCOUNT_SUSPENDED',
          'Votre compte est suspendu. Contactez votre fournisseur.',
        ),
    });

    renderApp(<App />);
    await signIn();

    // Étiquette de catégorie propre à ce cas…
    expect(await screen.findByText('Compte suspendu', {}, LONG_WAIT)).toBeDefined();
    // …et message du serveur affiché tel quel.
    expect(
      screen.getByText('Votre compte est suspendu. Contactez votre fournisseur.'),
    ).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull();
  });

  it('distingue un compte temporairement verrouillé (429)', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () =>
        errorResponse(429, 'ACCOUNT_LOCKED', 'Trop de tentatives. Réessayez dans 15 minutes.'),
    });

    renderApp(<App />);
    await signIn();

    expect(
      await screen.findByText('Connexion temporairement bloquée', {}, LONG_WAIT),
    ).toBeDefined();
    expect(screen.getByText('Trop de tentatives. Réessayez dans 15 minutes.')).toBeDefined();
    expect(screen.queryByText('Compte suspendu')).toBeNull();
  });

  it('ferme la session et revient à l’écran de connexion sur « Se déconnecter »', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'POST /api/auth/logout': ({ body }) => {
        expect(body.refreshToken).toBe(SESSION_TOKENS.refreshToken);
        return jsonResponse(null, { status: 204 });
      },
    });

    renderApp(<App />);
    await signIn();

    await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT);
    fireEvent.click(screen.getByRole('button', { name: /Se déconnecter/ }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connexion' }, LONG_WAIT),
    ).toBeDefined();
    expect(getAuthSnapshot().user).toBeNull();
  });
});

describe('fin de session subie, en plein travail', () => {
  it('ramène à l’écran de connexion quand le rafraîchissement échoue', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'POST /api/auth/refresh': () =>
        errorResponse(401, 'REFRESH_TOKEN_INVALID', 'Session expirée.'),
      'GET /api/auth/me': () => errorResponse(401, 'TOKEN_INVALID', 'Session invalide.'),
    });

    renderApp(<App />);
    await signIn();
    await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT);

    // Une requête quelconque part pendant que l'utilisateur travaille.
    await expect(apiRequest('/api/auth/me')).rejects.toBeDefined();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connexion' }, LONG_WAIT),
    ).toBeDefined();
    expect(screen.getByText('Session terminée')).toBeDefined();
    expect(getAuthSnapshot().user).toBeNull();
  });

  it('ramène à l’écran de connexion, message du serveur à l’appui, si le compte est suspendu', async () => {
    const message = 'Votre compte est suspendu. Contactez votre fournisseur.';

    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'GET /api/auth/me': () => errorResponse(403, 'ACCOUNT_SUSPENDED', message),
    });

    renderApp(<App />);
    await signIn();
    await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT);

    await expect(apiRequest('/api/auth/me')).rejects.toBeDefined();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connexion' }, LONG_WAIT),
    ).toBeDefined();
    expect(screen.getByText('Compte suspendu')).toBeDefined();
    expect(screen.getByText(message)).toBeDefined();
  });
});

describe('changement de mot de passe obligatoire', () => {
  const FIRST_LOGIN_USER = { ...CLIENT_USER, mustChangePassword: true };

  it('s’impose quelle que soit la page demandée, et ne laisse atteindre aucun écran', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () =>
        jsonResponse({ ...SESSION_TOKENS, user: FIRST_LOGIN_USER }),
    });

    // L'utilisateur demande explicitement un autre écran : sans effet.
    renderApp(<App />, { route: '/projets' });
    await signIn();

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Choisissez votre mot de passe' },
        LONG_WAIT,
      ),
    ).toBeDefined();

    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Projets' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).toBeNull();
  });

  it('débloque l’accès une fois le mot de passe changé', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () =>
        jsonResponse({ ...SESSION_TOKENS, user: FIRST_LOGIN_USER }),
      'POST /api/auth/change-password': ({ body }) => {
        expect(body.currentPassword).toBe('temporaire-recu');
        expect(body.newPassword).toBe('une phrase bien plus longue');
        return jsonResponse({
          accessToken: 'acces-3',
          refreshToken: 'rafraichissement-3',
          expiresIn: 900,
          user: { ...CLIENT_USER, mustChangePassword: false },
        });
      },
    });

    renderApp(<App />);
    await signIn('temporaire-recu');

    await screen.findByRole(
      'heading',
      { level: 1, name: 'Choisissez votre mot de passe' },
      LONG_WAIT,
    );

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'temporaire-recu' },
    });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'une phrase bien plus longue' },
    });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), {
      target: { value: 'une phrase bien plus longue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT),
    ).toBeDefined();
  });

  it('affiche le refus du serveur sans réinventer sa règle de mot de passe', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () =>
        jsonResponse({ ...SESSION_TOKENS, user: FIRST_LOGIN_USER }),
      'POST /api/auth/change-password': () =>
        errorResponse(
          400,
          'PASSWORD_TOO_WEAK',
          'Ce mot de passe est trop courant. Choisissez-en un autre.',
        ),
    });

    renderApp(<App />);
    await signIn('temporaire-recu');
    await screen.findByRole(
      'heading',
      { level: 1, name: 'Choisissez votre mot de passe' },
      LONG_WAIT,
    );

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'temporaire-recu' },
    });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'motdepasse123' },
    });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), {
      target: { value: 'motdepasse123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));

    expect(
      await screen.findByText(
        'Ce mot de passe est trop courant. Choisissez-en un autre.',
        {},
        LONG_WAIT,
      ),
    ).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull();
  });

  it('refuse de soumettre tant que les deux saisies diffèrent', async () => {
    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/login': () =>
        jsonResponse({ ...SESSION_TOKENS, user: FIRST_LOGIN_USER }),
    });

    renderApp(<App />);
    await signIn('temporaire-recu');
    await screen.findByRole(
      'heading',
      { level: 1, name: 'Choisissez votre mot de passe' },
      LONG_WAIT,
    );

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
      target: { value: 'temporaire-recu' },
    });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'une phrase bien plus longue' },
    });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), {
      target: { value: 'une phrase differente' },
    });

    const submit = screen.getByRole('button', { name: 'Enregistrer et continuer' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Les deux saisies ne sont pas identiques.')).toBeDefined();
  });
});

describe('reprise de session au démarrage', () => {
  /**
   * Emplacement sécurisé dont la lecture est suspendue à la demande : il rejoue
   * la lenteur réelle du trousseau de Windows, et rend le test déterministe.
   */
  function deferredSecureStore() {
    let release: (value: string | null) => void = () => {};
    const first = new Promise<string | null>((resolve) => {
      release = resolve;
    });
    let value: string | null = null;
    let read = () =>
      first.then((stored) => {
        value = stored;
        return stored;
      });

    return {
      store: {
        kind: 'memory' as const,
        survivesRestart: false,
        read: () => read(),
        write: (next: string) => {
          value = next;
          read = () => Promise.resolve(value);
          return Promise.resolve();
        },
        clear: () => {
          value = null;
          read = () => Promise.resolve(null);
          return Promise.resolve();
        },
      },
      release,
    };
  }

  it('affiche une attente propre plutôt qu’un clignotement de l’écran de connexion', async () => {
    const { store, release } = deferredSecureStore();
    resetAuthStoreForTests(store);
    mockApi(HEALTH_ROUTE);

    renderApp(<App />);

    // Tant que le trousseau n'a pas répondu, l'écran de connexion ne s'affiche pas.
    expect(await screen.findByText('Ouverture de votre session…', {}, LONG_WAIT)).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Connexion' })).toBeNull();

    release(null); // aucun jeton mémorisé

    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Connexion' })).toBeDefined(),
      LONG_WAIT,
    );
  });

  it('rouvre la session sans redemander le mot de passe quand un jeton a survécu', async () => {
    const { store, release } = deferredSecureStore();
    resetAuthStoreForTests(store);

    mockApi({
      ...HEALTH_ROUTE,
      'POST /api/auth/refresh': ({ body }) => {
        expect(body.refreshToken).toBe('rafraichissement-conserve');
        return jsonResponse(ROTATED_TOKENS);
      },
      'GET /api/auth/me': ({ headers }) => {
        expect(headers.Authorization).toBe(`Bearer ${ROTATED_TOKENS.accessToken}`);
        return jsonResponse({ user: CLIENT_USER });
      },
    });

    renderApp(<App />);
    await screen.findByText('Ouverture de votre session…', {}, LONG_WAIT);

    release('rafraichissement-conserve');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT),
    ).toBeDefined();
    // Aucun écran de connexion n'a été traversé.
    expect(screen.queryByRole('heading', { name: 'Connexion' })).toBeNull();
  });
});
