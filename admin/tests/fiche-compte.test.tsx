/**
 * Fiche d'un compte : les trois actions lourdes.
 *
 * Deux garanties sont vérifiées ici, et ce sont celles qui protègent le
 * propriétaire de lui-même :
 *
 *  1. **Rien ne part sans confirmation.** Cliquer sur « Suspendre » ouvre un
 *     dialogue qui rappelle les conséquences ; aucune requête n'est envoyée tant
 *     que la confirmation n'a pas été actionnée.
 *  2. **Un motif vide est refusé**, avant même l'aller-retour réseau. Le champ
 *     existe pour qu'on puisse répondre, six mois plus tard, à « pourquoi ce
 *     client a-t-il été coupé ? ».
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import {
  COMPTE_ACTIF,
  COMPTE_SUSPENDU,
  activiteDuCompte,
  appelsEffectues,
  errorResponse,
  jsonResponse,
  mockApi,
  renderComptes,
} from './helpers';

const ROUTE_ACTIF = `/comptes/${COMPTE_ACTIF.id}`;

/** Le faux serveur minimal d'une fiche : la lecture, et rien d'autre. */
function lectureSeule(compte = COMPTE_ACTIF) {
  return {
    [`GET /api/admin/users/${compte.id}/activite`]: () =>
      jsonResponse(activiteDuCompte(compte)),
  };
}

describe('fiche d’un compte', () => {
  it('affiche les informations du compte, sans aucun accès à ses projets', async () => {
    mockApi(lectureSeule());
    renderComptes(ROUTE_ACTIF);

    expect(await screen.findByRole('heading', { level: 1, name: 'Fatou Ndiaye' })).toBeTruthy();
    expect(screen.getByText('Dernière connexion')).toBeTruthy();
    expect(screen.getByText('Projets')).toBeTruthy();
    expect(
      screen.getByText('Leur contenu n’est jamais accessible depuis l’administration.'),
    ).toBeTruthy();
  });

  it('signale un verrouillage anti-force-brute — information de dépannage, pas un statut', async () => {
    const verrouille = {
      ...COMPTE_ACTIF,
      // Dans le futur, pour que le verrou soit encore en cours au moment du test.
      verrouilleJusqua: new Date(Date.now() + 12 * 60_000).toISOString(),
    };
    mockApi(lectureSeule(verrouille));
    renderComptes(ROUTE_ACTIF);

    expect(await screen.findByText('Connexion temporairement verrouillée')).toBeTruthy();
    // Le compte reste ACTIF : c'est toute la valeur de cette information.
    expect(screen.getByText('Actif')).toBeTruthy();
  });

  it('n’envoie rien tant que la suspension n’est pas confirmée', async () => {
    mockApi(lectureSeule());
    renderComptes(ROUTE_ACTIF);

    fireEvent.click(await screen.findByRole('button', { name: 'Suspendre le compte' }));

    const dialogue = await screen.findByRole('dialog');
    // La confirmation rappelle les conséquences, elle ne se contente pas de
    // demander « êtes-vous sûr ? ».
    expect(
      within(dialogue).getByText(/sessions en cours seront fermées immédiatement/i),
    ).toBeTruthy();

    // Aucune requête de suspension n'est partie à l'ouverture du dialogue.
    expect(appelsEffectues().some((appel) => appel.includes('suspendre'))).toBe(false);
  });

  it('refuse un motif vide, sans appeler le serveur', async () => {
    // `POST …/suspendre` n'est volontairement pas simulé : si la requête
    // partait, elle échouerait bruyamment.
    mockApi(lectureSeule());
    renderComptes(ROUTE_ACTIF);

    fireEvent.click(await screen.findByRole('button', { name: 'Suspendre le compte' }));
    const dialogue = await screen.findByRole('dialog');

    fireEvent.click(within(dialogue).getByRole('button', { name: 'Suspendre le compte' }));

    const erreur = await within(dialogue).findByText(/Indiquez un motif/i);
    expect(erreur.getAttribute('role')).toBe('alert');
    expect(appelsEffectues().some((appel) => appel.includes('suspendre'))).toBe(false);

    // Un motif réduit à un espace n'est pas un motif non plus.
    fireEvent.change(within(dialogue).getByLabelText('Motif'), { target: { value: '   ' } });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Suspendre le compte' }));
    expect(appelsEffectues().some((appel) => appel.includes('suspendre'))).toBe(false);
  });

  it('suspend le compte avec son motif et annonce les sessions fermées', async () => {
    const recus: Record<string, unknown>[] = [];
    let compteCourant = COMPTE_ACTIF as typeof COMPTE_ACTIF | typeof COMPTE_SUSPENDU;

    mockApi({
      [`GET /api/admin/users/${COMPTE_ACTIF.id}/activite`]: () =>
        jsonResponse(activiteDuCompte(compteCourant)),
      [`POST /api/admin/users/${COMPTE_ACTIF.id}/suspendre`]: (requete) => {
        recus.push(requete.body);
        compteCourant = { ...COMPTE_SUSPENDU, id: COMPTE_ACTIF.id };
        return jsonResponse({ compte: compteCourant, sessionsRevoquees: 2 });
      },
    });

    renderComptes(ROUTE_ACTIF);

    fireEvent.click(await screen.findByRole('button', { name: 'Suspendre le compte' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText('Motif'), {
      target: { value: 'Abonnement non renouvelé' },
    });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Suspendre le compte' }));

    await waitFor(() => {
      expect(recus).toEqual([{ motif: 'Abonnement non renouvelé' }]);
    });

    // Le propriétaire voit immédiatement l'effet de son action.
    expect(await screen.findByText(/2 sessions ont été fermées/i)).toBeTruthy();
  });

  it('affiche tel quel un 409 ACTION_IMPOSSIBLE du serveur', async () => {
    const MESSAGE =
      'Ce compte est le dernier administrateur actif : le suspendre rendrait le dashboard inaccessible. Créez un autre administrateur d’abord.';

    mockApi({
      ...lectureSeule(),
      [`POST /api/admin/users/${COMPTE_ACTIF.id}/suspendre`]: () =>
        errorResponse(409, 'ACTION_IMPOSSIBLE', MESSAGE),
    });

    renderComptes(ROUTE_ACTIF);

    fireEvent.click(await screen.findByRole('button', { name: 'Suspendre le compte' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText('Motif'), {
      target: { value: 'Test de garde-fou' },
    });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Suspendre le compte' }));

    // Le message du serveur explique POURQUOI le refus : on ne le reformule pas.
    const affiche = await screen.findByText(MESSAGE);
    expect(affiche.closest('[role="alert"]')).not.toBeNull();
    // Le dialogue reste ouvert : le motif saisi n'est pas perdu.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('propose « Réactiver » — et non « Suspendre » — sur un compte suspendu', async () => {
    mockApi({
      [`GET /api/admin/users/${COMPTE_SUSPENDU.id}/activite`]: () =>
        jsonResponse(activiteDuCompte(COMPTE_SUSPENDU)),
    });
    renderComptes(`/comptes/${COMPTE_SUSPENDU.id}`);

    expect(await screen.findByRole('button', { name: 'Réactiver le compte' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suspendre le compte' })).toBeNull();
  });

  it('exige une confirmation avant de réinitialiser un mot de passe, puis le remet une seule fois', async () => {
    mockApi({
      ...lectureSeule(),
      [`POST /api/admin/users/${COMPTE_ACTIF.id}/reinitialiser-mot-de-passe`]: () =>
        jsonResponse({
          compte: { ...COMPTE_ACTIF, doitChangerMotDePasse: true },
          motDePasseTemporaire: 'Km3pQ-8rTvB-2xLdN-9wZcF',
          sessionsRevoquees: 1,
        }),
    });

    renderComptes(ROUTE_ACTIF);

    fireEvent.click(await screen.findByRole('button', { name: 'Réinitialiser le mot de passe' }));

    // Rien n'est encore parti : la confirmation est un vrai barrage.
    const dialogue = await screen.findByRole('dialog');
    expect(appelsEffectues().some((appel) => appel.includes('reinitialiser'))).toBe(false);
    expect(
      within(dialogue).getByText(/toutes ses sessions seront fermées/i),
    ).toBeTruthy();

    // Cette action-là n'exige pas de motif (contrat § 4) : le champ est absent.
    expect(within(dialogue).queryByLabelText('Motif')).toBeNull();

    fireEvent.click(
      within(dialogue).getByRole('button', { name: 'Réinitialiser le mot de passe' }),
    );

    expect(await screen.findByText('Km3pQ-8rTvB-2xLdN-9wZcF')).toBeTruthy();
    expect(screen.getByText('Ce mot de passe ne sera plus jamais affiché')).toBeTruthy();
  });
});
