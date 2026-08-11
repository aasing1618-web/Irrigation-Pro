/**
 * Liste des comptes, filtres, et création d'un compte.
 *
 * Le test le plus important de ce fichier est celui du **mot de passe
 * temporaire** : il n'existe en clair qu'une fois, dans la réponse de création.
 * S'il n'était pas affiché — ou si la fenêtre se refermait trop facilement — le
 * propriétaire devrait recréer le compte d'un client à qui il vient d'annoncer
 * ses accès.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import {
  COMPTE_ACTIF,
  COMPTE_SUSPENDU,
  errorResponse,
  jsonResponse,
  mockApi,
  renderComptes,
} from './helpers';

/** Dernière valeur reçue par le faux serveur pour un paramètre de filtre. */
function listeAvecCapture(capture: URLSearchParams[]) {
  return (requete: { query: URLSearchParams }) => {
    capture.push(requete.query);
    const statut = requete.query.get('statut');
    const recherche = requete.query.get('recherche');

    let comptes = [COMPTE_ACTIF, COMPTE_SUSPENDU];
    if (statut) comptes = comptes.filter((compte) => compte.statut === statut);
    if (recherche) {
      const terme = recherche.toLowerCase();
      comptes = comptes.filter((compte) => compte.nomComplet.toLowerCase().includes(terme));
    }

    return jsonResponse({ comptes, total: comptes.length });
  };
}

describe('liste des comptes', () => {
  it('affiche les comptes et distingue nettement ACTIF de SUSPENDU', async () => {
    mockApi({ 'GET /api/admin/users': listeAvecCapture([]) });

    renderComptes();

    expect(await screen.findByText('Fatou Ndiaye')).toBeTruthy();
    expect(screen.getByText('Moussa Sow')).toBeTruthy();

    // Le statut est écrit en toutes lettres, jamais porté par la seule couleur.
    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.getByText('Suspendu')).toBeTruthy();

    // La société et le compteur de projets accompagnent chaque ligne — un
    // compteur, jamais le contenu des projets.
    expect(screen.getByText('Sahel Irrigation')).toBeTruthy();
    expect(screen.getByText('4 projets')).toBeTruthy();
  });

  it('envoie le filtre de statut au serveur, et non un tri local', async () => {
    const captures: URLSearchParams[] = [];
    mockApi({ 'GET /api/admin/users': listeAvecCapture(captures) });

    renderComptes();
    await screen.findByText('Fatou Ndiaye');

    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'SUSPENDU' } });

    await waitFor(() => {
      expect(captures.at(-1)?.get('statut')).toBe('SUSPENDU');
    });
    await waitFor(() => {
      expect(screen.queryByText('Fatou Ndiaye')).toBeNull();
    });
    expect(screen.getByText('Moussa Sow')).toBeTruthy();
  });

  it('envoie la recherche au serveur et propose de revenir à la liste complète', async () => {
    const captures: URLSearchParams[] = [];
    mockApi({ 'GET /api/admin/users': listeAvecCapture(captures) });

    renderComptes();
    await screen.findByText('Fatou Ndiaye');

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'zzz' } });

    // La recherche est temporisée : une frappe normale ne part qu'une fois.
    await waitFor(() => {
      expect(captures.at(-1)?.get('recherche')).toBe('zzz');
    });

    // Un résultat vide sur une recherche n'est pas la même chose qu'une liste
    // vide : il doit expliquer comment revenir en arrière.
    expect(await screen.findByText('Aucun compte ne correspond')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher tous les comptes' }));
    expect(await screen.findByText('Fatou Ndiaye')).toBeTruthy();
  });
});

describe('création d’un compte', () => {
  const NOUVEAU = {
    ...COMPTE_ACTIF,
    id: 'cccccccc-3333-4333-8333-cccccccccccc',
    email: 'awa@perimetre-nord.sn',
    nomComplet: 'Awa Fall',
    societe: 'Périmètre Nord',
    doitChangerMotDePasse: true,
    derniereConnexion: null,
    nombreProjets: 0,
  };

  /** Ouvre le dialogue et remplit les deux champs obligatoires. */
  async function remplirFormulaire() {
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un compte' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText('Adresse e-mail'), {
      target: { value: NOUVEAU.email },
    });
    fireEvent.change(within(dialogue).getByLabelText('Nom complet'), {
      target: { value: NOUVEAU.nomComplet },
    });
    return dialogue;
  }

  it('affiche le mot de passe temporaire, avertit qu’il ne reviendra pas, et empêche de fermer trop vite', async () => {
    mockApi({
      'GET /api/admin/users': listeAvecCapture([]),
      'POST /api/admin/users': () =>
        jsonResponse(
          { compte: NOUVEAU, motDePasseTemporaire: 'Y7tJW-uAXw6-CgKDj-PQWjC' },
          { status: 201 },
        ),
    });

    renderComptes();
    const formulaire = await remplirFormulaire();
    fireEvent.click(within(formulaire).getByRole('button', { name: 'Créer le compte' }));

    // Le mot de passe est affiché en clair, une seule fois.
    expect(await screen.findByText('Y7tJW-uAXw6-CgKDj-PQWjC')).toBeTruthy();
    expect(screen.getByText('Ce mot de passe ne sera plus jamais affiché')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copier/ })).toBeTruthy();

    // La fenêtre ne se ferme pas d'un réflexe : le bouton est inactif tant que
    // la case n'a pas été cochée.
    const terminer = screen.getByRole('button', { name: 'J’ai terminé' }) as HTMLButtonElement;
    expect(terminer.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('J’ai copié ou transmis ce mot de passe'));
    expect((screen.getByRole('button', { name: 'J’ai terminé' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByRole('button', { name: 'J’ai terminé' }));
    await waitFor(() => {
      expect(screen.queryByText('Y7tJW-uAXw6-CgKDj-PQWjC')).toBeNull();
    });
  });

  it('copie le mot de passe dans le presse-papiers', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    mockApi({
      'GET /api/admin/users': listeAvecCapture([]),
      'POST /api/admin/users': () =>
        jsonResponse(
          { compte: NOUVEAU, motDePasseTemporaire: 'Y7tJW-uAXw6-CgKDj-PQWjC' },
          { status: 201 },
        ),
    });

    renderComptes();
    const formulaire = await remplirFormulaire();
    fireEvent.click(within(formulaire).getByRole('button', { name: 'Créer le compte' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Copier' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Y7tJW-uAXw6-CgKDj-PQWjC');
    });
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeTruthy();
  });

  it('affiche le message du serveur, tel quel, sur un 409 EMAIL_DEJA_UTILISE', async () => {
    mockApi({
      'GET /api/admin/users': listeAvecCapture([]),
      'POST /api/admin/users': () =>
        errorResponse(409, 'EMAIL_DEJA_UTILISE', 'Un compte utilise déjà cette adresse e-mail.'),
    });

    renderComptes();
    const formulaire = await remplirFormulaire();
    fireEvent.click(within(formulaire).getByRole('button', { name: 'Créer le compte' }));

    const message = await screen.findByText('Un compte utilise déjà cette adresse e-mail.');
    expect(message.closest('[role="alert"]')).not.toBeNull();

    // Le dialogue reste ouvert et la saisie est conservée : le refus se corrige
    // sur place, sans tout retaper.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Nom complet') as HTMLInputElement).value).toBe(
      NOUVEAU.nomComplet,
    );
    // Et aucun mot de passe temporaire n'est inventé côté dashboard.
    expect(screen.queryByText('Ce mot de passe ne sera plus jamais affiché')).toBeNull();
  });

  it('refuse un formulaire incomplet sans appeler le serveur', async () => {
    mockApi({ 'GET /api/admin/users': listeAvecCapture([]) });

    renderComptes();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un compte' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Créer le compte' }));

    // `POST /api/admin/users` n'est pas simulé dans ce test : s'il partait, la
    // requête échouerait bruyamment.
    expect(await screen.findByText('L’adresse e-mail est obligatoire.')).toBeTruthy();
    expect(screen.getByText('Le nom complet est obligatoire.')).toBeTruthy();
  });
});
