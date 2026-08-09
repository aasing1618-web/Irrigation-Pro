/**
 * Écran de démarrage : les trois états de la liaison au serveur.
 *
 * C'est la livraison de la Vague 0 côté application — « l'app peut contacter
 * le serveur » — donc c'est ce qui doit être vérifié automatiquement.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { App } from '../src/App';
import { HEALTH_DEGRADED, HEALTH_OK, fetchMock, jsonResponse, renderApp } from './helpers';

const LONG_WAIT = { timeout: 4000 };

/**
 * L'état de la liaison est affiché à deux endroits quand on est dans
 * l'application : en permanence dans l'en-tête, et en détail sur le tableau de
 * bord. Les tests visent l'indicateur d'en-tête, qui est la source permanente.
 */
function headerStatus() {
  return within(screen.getByRole('status', { name: 'État du serveur' }));
}

describe("écran de démarrage d'Irrigation Pro", () => {
  it('entre dans l’application quand /health répond correctement', async () => {
    fetchMock().mockResolvedValue(jsonResponse(HEALTH_OK));

    renderApp(<App />);

    // La coque applicative s'affiche, avec l'état « Connecté » en en-tête.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT),
    ).toBeDefined();
    expect(headerStatus().getByText('Connecté')).toBeDefined();

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

    // On reste sur l'écran de démarrage : pas d'accès à l'application.
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

  it('le bouton « Réessayer » relance l’appel et laisse entrer si le serveur revient', async () => {
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

    // Le serveur répond de nouveau : l'utilisateur entre dans l'application.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, LONG_WAIT),
    ).toBeDefined();
    expect(headerStatus().getByText('Connecté')).toBeDefined();
  });
});
