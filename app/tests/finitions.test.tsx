/**
 * Vague 4 — les finitions : lien WhatsApp, détection de mise à jour, et le
 * choix du transport de session imposé par la cible web (D-013).
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *
 * 1. **Le lien WhatsApp est le seul canal commercial du produit.** Une URL mal
 *    encodée n'échoue pas bruyamment : elle ouvre une conversation avec un
 *    message tronqué, et personne ne s'en aperçoit avant un client mécontent.
 * 2. **Le bandeau de mise à jour ne doit jamais mentir.** Un réseau capricieux
 *    ne doit pas l'afficher, et rien ne doit recharger la page sous les doigts
 *    de quelqu'un qui saisit une étude.
 * 3. **Le transport de session doit rester déclaré, pas deviné.**
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  WHATSAPP_NUMBER,
  buildWhatsAppLink,
  buildWhatsAppMessage,
} from '../src/lib/whatsapp';
import {
  MIN_INTERVAL_MS,
  fetchPublishedVersion,
  startUpdateWatch,
} from '../src/lib/update-check';
import { UpdateBanner } from '../src/components/UpdateBanner';
import {
  createCookieSecureStore,
  createMemorySecureStore,
} from '../src/lib/secure-store';

/* -------------------------------------------------------------------------- */
/* Lien WhatsApp                                                              */
/* -------------------------------------------------------------------------- */

describe('lien WhatsApp', () => {
  it('utilise le numéro du propriétaire, en chiffres uniquement', () => {
    expect(WHATSAPP_NUMBER).toBe('221778608247');
  });

  it('présente le client par son nom et sa structure', () => {
    expect(buildWhatsAppMessage({ fullName: 'Jean Diop', company: 'Bureau Sahel' })).toBe(
      'Bonjour, je suis Jean Diop (Bureau Sahel) — client Irrigation Pro.',
    );
  });

  it('omet proprement la structure quand elle est absente ou vide', () => {
    const attendu = 'Bonjour, je suis Jean Diop — client Irrigation Pro.';
    expect(buildWhatsAppMessage({ fullName: 'Jean Diop' })).toBe(attendu);
    expect(buildWhatsAppMessage({ fullName: 'Jean Diop', company: '   ' })).toBe(attendu);
    expect(buildWhatsAppMessage({ fullName: 'Jean Diop', company: null })).toBe(attendu);
  });

  it('reste une phrase correcte même sans nom, plutôt qu’un message amputé', () => {
    const attendu = 'Bonjour, je suis client Irrigation Pro.';
    expect(buildWhatsAppMessage()).toBe(attendu);
    expect(buildWhatsAppMessage({ fullName: '  ' })).toBe(attendu);
  });

  it('encode accents, espaces et caractères qui casseraient l’URL', () => {
    const lien = buildWhatsAppLink({ fullName: 'Aïssatou & Fils', company: 'Sénégal #1' });

    expect(lien.startsWith(`https://wa.me/${WHATSAPP_NUMBER}?text=`)).toBe(true);
    // Ni « & » ni « # » ne doivent survivre en clair : ils tronqueraient l'URL.
    const texte = lien.slice(lien.indexOf('?text=') + 6);
    expect(texte).not.toContain('&');
    expect(texte).not.toContain('#');
    expect(texte).not.toContain(' ');
    // Et le message doit arriver intact de l'autre côté.
    expect(decodeURIComponent(texte)).toBe(
      'Bonjour, je suis Aïssatou & Fils (Sénégal #1) — client Irrigation Pro.',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Lecture de la version publiée                                              */
/* -------------------------------------------------------------------------- */

/** Réponse `version.json` factice. */
function manifeste(corps: unknown, status = 200): Response {
  return new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('lecture de version.json', () => {
  it('renvoie la version publiée et refuse le cache du navigateur', async () => {
    const appels = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(manifeste({ version: '0.2.0' })),
    );
    vi.stubGlobal('fetch', appels);

    await expect(fetchPublishedVersion()).resolves.toBe('0.2.0');

    // Sans `no-store`, le navigateur resservirait indéfiniment l'ancien
    // fichier et le mécanisme entier ne servirait à rien.
    expect(appels.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('se tait devant tout ce qui n’est pas une réponse nette', async () => {
    const cas: Array<[string, () => Promise<Response>]> = [
      ['fichier absent', () => Promise.resolve(manifeste({}, 404))],
      ['JSON illisible', () => Promise.resolve(manifeste('<html>oups</html>'))],
      ['version absente', () => Promise.resolve(manifeste({ builtAt: 'hier' }))],
      ['version vide', () => Promise.resolve(manifeste({ version: '   ' }))],
      ['hors ligne', () => Promise.reject(new Error('Failed to fetch'))],
    ];

    for (const [nom, réponse] of cas) {
      vi.stubGlobal('fetch', vi.fn(réponse));
      await expect(fetchPublishedVersion(), nom).resolves.toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Surveillance de version                                                    */
/* -------------------------------------------------------------------------- */

describe('surveillance d’une nouvelle version', () => {
  /** Rend l'onglet visible puis déclenche l'événement de retour. */
  function revientSurLOnglet(): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('ne surveille rien en développement', async () => {
    const appels = vi.fn(() => Promise.resolve(manifeste({ version: '9.9.9' })));
    vi.stubGlobal('fetch', appels);
    const signalé = vi.fn();

    const arrêter = startUpdateWatch(signalé, { enabled: false, currentVersion: '0.1.0' });
    revientSurLOnglet();
    await Promise.resolve();

    expect(appels).not.toHaveBeenCalled();
    expect(signalé).not.toHaveBeenCalled();
    arrêter();
  });

  it('reste muet quand la version publiée est celle qui tourne', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(manifeste({ version: '0.1.0' }))));
    const signalé = vi.fn();

    const arrêter = startUpdateWatch(signalé, { enabled: true, currentVersion: '0.1.0' });
    revientSurLOnglet();
    await vi.waitFor(() => expect(signalé).not.toHaveBeenCalled());

    arrêter();
  });

  it('signale une version différente au retour sur l’onglet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(manifeste({ version: '0.2.0' }))));
    const signalé = vi.fn();

    const arrêter = startUpdateWatch(signalé, { enabled: true, currentVersion: '0.1.0' });
    revientSurLOnglet();

    await vi.waitFor(() => expect(signalé).toHaveBeenCalledWith('0.2.0'));
    arrêter();
  });

  it('ne relit pas le fichier à chaque va-et-vient entre onglets', async () => {
    const appels = vi.fn(() => Promise.resolve(manifeste({ version: '0.2.0' })));
    vi.stubGlobal('fetch', appels);

    const arrêter = startUpdateWatch(vi.fn(), { enabled: true, currentVersion: '0.1.0' });

    revientSurLOnglet();
    await vi.waitFor(() => expect(appels).toHaveBeenCalledTimes(1));

    // Quatre allers-retours de plus, tous dans la fenêtre de garde.
    for (let i = 0; i < 4; i += 1) revientSurLOnglet();
    await Promise.resolve();

    expect(appels).toHaveBeenCalledTimes(1);
    expect(MIN_INTERVAL_MS).toBeGreaterThan(0);
    arrêter();
  });

  it('ne signale plus rien une fois arrêtée', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(manifeste({ version: '0.2.0' }))));
    const signalé = vi.fn();

    const arrêter = startUpdateWatch(signalé, { enabled: true, currentVersion: '0.1.0' });
    arrêter();

    revientSurLOnglet();
    await Promise.resolve();
    await Promise.resolve();

    expect(signalé).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Bandeau de mise à jour                                                     */
/* -------------------------------------------------------------------------- */

describe('bandeau de mise à jour', () => {
  it('annonce la version sans interrompre : c’est un statut, pas une alerte', () => {
    render(<UpdateBanner version="0.2.0" onReload={vi.fn()} onDismiss={vi.fn()} />);

    const bandeau = screen.getByRole('status');
    expect(bandeau.textContent).toContain('nouvelle version');
    expect(bandeau.textContent).toContain('0.2.0');
    // Un `alert` couperait la lecture en cours d'un lecteur d'écran.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ne recharge que sur un clic explicite', () => {
    const recharger = vi.fn();
    render(<UpdateBanner version="0.2.0" onReload={recharger} onDismiss={vi.fn()} />);

    expect(recharger).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('offre de le fermer', () => {
    const fermer = vi.fn();
    render(<UpdateBanner version="0.2.0" onReload={vi.fn()} onDismiss={fermer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fermer cette information' }));
    expect(fermer).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Transport de session                                                       */
/* -------------------------------------------------------------------------- */

describe('rangement du jeton de rafraîchissement', () => {
  it('déclare le transport « corps » pour la coque installée', async () => {
    const store = createMemorySecureStore();

    expect(store.transport).toBe('body');
    await store.write('jeton-de-30-jours');
    await expect(store.read()).resolves.toBe('jeton-de-30-jours');
  });

  it('déclare le transport « cookie » et ne rend jamais le jeton au JavaScript', async () => {
    const store = createCookieSecureStore();

    expect(store.transport).toBe('cookie');
    expect(store.survivesRestart).toBe(true);

    // C'est toute la garantie du dispositif : même après une écriture, rien
    // n'est lisible depuis la page. Le cookie est `HttpOnly`, le serveur seul
    // le voit. Une faille XSS n'obtient donc pas 30 jours d'accès au compte.
    await store.write('jeton-de-30-jours');
    await expect(store.read()).resolves.toBeNull();

    await expect(store.clear()).resolves.toBeUndefined();
  });

  it('n’écrit le jeton ni dans localStorage ni dans sessionStorage', async () => {
    const store = createCookieSecureStore();
    await store.write('jeton-de-30-jours');

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('jeton-de-30-jours');
  });
});
