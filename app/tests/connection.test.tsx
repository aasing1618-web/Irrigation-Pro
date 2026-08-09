/**
 * Écran de démarrage : les trois états de la liaison au serveur.
 *
 * C'est la livraison de la Vague 0 côté application — « l'app peut contacter
 * le serveur » — donc c'est ce qui doit être vérifié automatiquement.
 *
 * Depuis la Vague 1, l'écran de démarrage ne débouche plus sur le tableau de
 * bord mais sur l'écran de connexion : on ne demande jamais un mot de passe
 * avant de savoir que le serveur est joignable.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { App } from '../src/App';
import { resetAuthStoreForTests } from '../src/lib/auth-store';
import {
  CLIENT_USER,
  HEALTH_DEGRADED,
  HEALTH_OK,
  SESSION_TOKENS,
  fetchMock,
  jsonResponse,
  mockApi,
  renderApp,
} from './helpers';

const LONG_WAIT = { timeout: 4000 };

/**
 * L'état de la liaison est affiché à deux endroits quand on est dans
 * l'application : en permanence dans l'en-tête, et en détail sur le tableau de
 * bord. Les tests visent l'indicateur d'en-tête, qui est la source permanente.
 */
function headerStatus() {
  return within(screen.getByRole('status', { name: 'État du serveur' }));
}

beforeEach(() => {
  resetAuthStoreForTests();
});

describe("écran de démarrage d'Irrigation Pro", () => {
  it('passe la main à l’écran de connexion quand /health répond correctement', async () => {
    fetchMock().mockResolvedValue(jsonResponse(HEALTH_OK));

    renderApp(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connexion' }, LONG_WAIT),
    ).toBeDefined();

    // L'appel a bien porté sur l'endpoint de santé du serveur configuré.
    const [url] = fetchMock().mock.calls[0] as [string];
    expect(url).toBe('http://localhost:4000/health');
  });

  it('affiche un message non technique quand le serveur est injoignable', async () => {
    fetchMock().mockRejectedValue(new TypeError('Failed to fetch'));

    renderApp(<App />);

    expect(await screen.findByText('Serveur injoignable', {}, LONG_WAIT)).toBeDefined();
    expect(
      screen.getByText(/Impossible de contacter le serveur d'Irrigation Pro/),
    ).toBeDefined();

    // On reste sur l'écran de démarrage : on ne demande même pas de mot de passe.
    expect(screen.queryByRole('heading', { name: 'Connexion' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeNull();

    // Aucune trace technique n'a fuité à l'écran.
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.queryByText(/localhost:4000/)).toBeNull();
  });

  it('distingue le mode dégradé (503) du serveur injoignable', async () => {
    fetchMock().mockResolvedValue(jsonResponse(HEALTH_DEGRADED, { status: 503 }));

    renderApp(<App />);

    expect(
      await screen.findByText('Service momentanément réduit', {}, LONG_WAIT),
    ).toBeDefined();
    expect(screen.queryByText('Serveur injoignable')).toBeNull();
  });

  it('affiche la référence d’incident fournie par le serveur', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(HEALTH_DEGRADED, { status: 503, requestId: 'req-2f8a91' }),
    );

    renderApp(<App />);

    expect(await screen.findByText('req-2f8a91', {}, LONG_WAIT)).toBeDefined();
  });

  it('le bouton « Réessayer » relance l’appel et laisse passer si le serveur revient', async () => {
    fetchMock().mockRejectedValue(new TypeError('Failed to fetch'));

    renderApp(<App />);

    const retryButton = await screen.findByRole('button', { name: /Réessayer/ }, LONG_WAIT);
    const callsBeforeRetry = fetchMock().mock.calls.length;
    expect(callsBeforeRetry).toBeGreaterThan(0);

    // Le serveur redevient joignable entre-temps.
    fetchMock().mockResolvedValue(jsonResponse(HEALTH_OK));
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(fetchMock().mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    }, LONG_WAIT);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connexion' }, LONG_WAIT),
    ).toBeDefined();
  });

  it('affiche l’état de la liaison en permanence une fois l’utilisateur entré', async () => {
    mockApi({
      'GET /health': () => jsonResponse(HEALTH_OK),
      'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
    });

    renderApp(<App />);

    fireEvent.change(await screen.findByLabelText('Adresse e-mail', {}, LONG_WAIT), {
      target: { value: CLIENT_USER.email },
    });
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'un-mot-de-passe-solide' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT),
    ).toBeDefined();
    expect(headerStatus().getByText('Connecté')).toBeDefined();
  });
});
