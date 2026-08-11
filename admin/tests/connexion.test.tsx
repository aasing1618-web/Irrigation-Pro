/**
 * Connexion à l'administration.
 *
 * Le cas qui compte vraiment ici est le second : **un compte `CLIENT` réussit sa
 * connexion côté serveur**, parce que c'est la même route que l'application
 * cliente. Ce sont les routes d'administration qui lui répondront `404`, pour ne
 * pas lui apprendre que ce dashboard existe.
 *
 * Sans le contrôle de rôle vérifié ci-dessous, ce client arriverait donc sur un
 * outil dont chaque écran affiche « introuvable » — et il n'aurait aucun moyen
 * de comprendre pourquoi.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { App } from '../src/App';
import {
  ACTIVITE_RECENTE,
  ADMIN_USER,
  CLIENT_USER,
  SESSION_TOKENS,
  appelsEffectues,
  errorResponse,
  jsonResponse,
  mockApi,
  renderAdmin,
} from './helpers';

/** Remplit le formulaire de connexion et l'envoie. */
function seConnecter(email: string, motDePasse = 'un-mot-de-passe-solide') {
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: motDePasse } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('connexion au dashboard', () => {
  it('ouvre le dashboard pour un compte ADMIN', async () => {
    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: ADMIN_USER }),
      'GET /api/auth/me': () => jsonResponse({ user: ADMIN_USER }),
      'GET /api/admin/activite': () => jsonResponse(ACTIVITE_RECENTE),
    });

    renderAdmin(<App />);
    seConnecter(ADMIN_USER.email);

    // L'écran de connexion cède la place à l'accueil du dashboard.
    await screen.findByRole('heading', { level: 1, name: 'Accueil' });
    expect(screen.getByText('Comptes actifs')).toBeTruthy();
    // Le nom du propriétaire connecté apparaît dans la barre latérale.
    expect(screen.getByText(ADMIN_USER.fullName)).toBeTruthy();
  });

  it('refuse un compte CLIENT avec un message clair, et referme sa session', async () => {
    mockApi({
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
      'GET /api/auth/me': () => jsonResponse({ user: CLIENT_USER }),
      'POST /api/auth/logout': () => jsonResponse({}, { status: 204 }),
    });

    renderAdmin(<App />);
    seConnecter(CLIENT_USER.email);

    const message = await screen.findByText(/n’a pas accès à l’administration/i);
    expect(message).toBeTruthy();
    // Le refus est annoncé, pas seulement affiché.
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByText('Accès réservé à l’administration')).toBeTruthy();

    // On reste sur l'écran de connexion : aucun écran d'administration n'est monté.
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'Accueil' })).toBeNull();

    // La session ouverte à l'étape 1 a été refermée côté serveur : on ne laisse
    // pas traîner un jeton de 30 jours qu'on vient de décider de ne pas utiliser.
    await waitFor(() => {
      expect(appelsEffectues()).toContain('POST /api/auth/logout');
    });
    // Et aucune route d'administration n'a été appelée.
    expect(appelsEffectues().some((appel) => appel.includes('/api/admin/'))).toBe(false);
  });

  it('affiche le message du serveur, mot pour mot, sur des identifiants refusés', async () => {
    mockApi({
      'POST /api/auth/login': () =>
        errorResponse(401, 'INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.'),
    });

    renderAdmin(<App />);
    seConnecter('inconnu@exemple.sn');

    expect(
      await screen.findByText('Adresse e-mail ou mot de passe incorrect.'),
    ).toBeTruthy();
  });
});
