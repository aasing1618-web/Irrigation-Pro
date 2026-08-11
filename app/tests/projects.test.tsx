/**
 * Gestion des projets — la première moitié de la livraison de la Vague 2.
 *
 * Ces tests n'interagissent avec l'application que comme le ferait un
 * ingénieur : ils lisent l'écran, tapent, cliquent. Le serveur est simulé ;
 * aucun de ces tests n'a besoin du backend.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import {
  CALCUL_OK,
  FAKE_CATALOGUE,
  PROJECT_FANAYE,
  PROJECT_NDIAYE,
  errorResponse,
  jsonResponse,
  mockApi,
  renderWorkspace,
  type MockHandler,
} from './helpers';

const LONG_WAIT = { timeout: 4000 };

/** Réponse d'une liste, telle que le serveur la renvoie une fois filtrée. */
function listResponse(projets: unknown[]) {
  return jsonResponse({ projets, total: projets.length });
}

describe('liste des projets', () => {
  it('accueille un nouveau client par un état vide qui donne envie de commencer', async () => {
    mockApi({ 'GET /api/projects': () => listResponse([]) });

    renderWorkspace('/projets');

    expect(await screen.findByText('Créez votre premier projet', {}, LONG_WAIT)).toBeDefined();
    // L'état vide explique le produit au lieu de constater un vide.
    expect(screen.getByText(/Un projet regroupe un périmètre irrigué/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Créer un projet/ })).toBeDefined();
  });

  it('affiche les projets reçus, avec leur client, leur statut et leurs calculs', async () => {
    mockApi({ 'GET /api/projects': () => listResponse([PROJECT_NDIAYE, PROJECT_FANAYE]) });

    renderWorkspace('/projets');

    expect(await screen.findByText('Périmètre de Ndiaye', {}, LONG_WAIT)).toBeDefined();
    expect(screen.getByText('Casier de Fanaye')).toBeDefined();
    expect(screen.getByText('SAED')).toBeDefined();
    // Le filtre de statut contient les mêmes libellés dans ses <option> :
    // on cible donc les badges des cartes, pas le contenu du menu déroulant.
    expect(screen.getByText('En cours', { selector: ':not(option)' })).toBeDefined();
    expect(screen.getByText('Brouillon', { selector: ':not(option)' })).toBeDefined();
    expect(screen.getByText('2 calculs')).toBeDefined();
  });

  it('envoie la recherche au serveur — ce n’est pas un tri local', async () => {
    const recherches: string[] = [];

    mockApi({
      'GET /api/projects': ({ query }) => {
        const recherche = query.get('recherche');
        if (recherche) recherches.push(recherche);
        return listResponse(recherche ? [PROJECT_FANAYE] : [PROJECT_NDIAYE, PROJECT_FANAYE]);
      },
    });

    renderWorkspace('/projets');
    await screen.findByText('Périmètre de Ndiaye', {}, LONG_WAIT);

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'Fanaye' } });

    await waitFor(() => expect(recherches).toContain('Fanaye'), LONG_WAIT);
    await waitFor(() => expect(screen.queryByText('Périmètre de Ndiaye')).toBeNull(), LONG_WAIT);
    expect(screen.getByText('Casier de Fanaye')).toBeDefined();
  });

  it('envoie le filtre de statut au serveur et sait revenir à la liste complète', async () => {
    mockApi({
      'GET /api/projects': ({ query }) =>
        query.get('statut') === 'TERMINE'
          ? listResponse([])
          : listResponse([PROJECT_NDIAYE, PROJECT_FANAYE]),
    });

    renderWorkspace('/projets');
    await screen.findByText('Périmètre de Ndiaye', {}, LONG_WAIT);

    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'TERMINE' } });

    // État vide de recherche : distinct de « aucun projet », et réversible.
    expect(await screen.findByText('Aucun projet ne correspond', {}, LONG_WAIT)).toBeDefined();
    expect(screen.queryByText('Créez votre premier projet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher tous les projets' }));
    expect(await screen.findByText('Périmètre de Ndiaye', {}, LONG_WAIT)).toBeDefined();
  });
});

describe('création d’un projet', () => {
  const CREATED = { ...PROJECT_FANAYE, nom: 'Nouveau casier', nombreCalculs: 0 };

  it('crée le projet, l’ouvre, et n’envoie que ce qui a été saisi', async () => {
    let existe = false;
    const envoye: Record<string, unknown>[] = [];

    mockApi({
      'GET /api/projects': () => listResponse(existe ? [CREATED] : []),
      'POST /api/projects': ({ body }) => {
        envoye.push(body);
        existe = true;
        return jsonResponse({ projet: CREATED }, { status: 201 });
      },
      [`GET /api/projects/${CREATED.id}`]: () =>
        jsonResponse({ projet: { ...CREATED, calculs: [] } }),
      [`GET /api/projects/${CREATED.id}/calculs`]: () => jsonResponse({ calculs: [] }),
      [`GET /api/projects/${CREATED.id}/reports`]: () => jsonResponse({ rapports: [] }),
      'GET /api/calculs/modules': () => jsonResponse(FAKE_CATALOGUE),
    });

    renderWorkspace('/projets');
    fireEvent.click(await screen.findByRole('button', { name: /Créer un projet/ }, LONG_WAIT));

    await screen.findByRole('dialog', {}, LONG_WAIT);
    fireEvent.change(screen.getByLabelText('Nom du projet'), {
      target: { value: 'Nouveau casier' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));

    // Aucun propriétaire envoyé : c'est le serveur qui le décide (contrat, § 2).
    await waitFor(() => expect(envoye).toHaveLength(1), LONG_WAIT);
    expect(envoye[0]).toEqual({ nom: 'Nouveau casier' });

    // On entre directement dans le projet créé.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouveau casier' }, LONG_WAIT),
    ).toBeDefined();
  });

  it('refuse d’envoyer un projet sans nom, et le dit sur le champ', async () => {
    const cree = vi.fn();

    mockApi({
      'GET /api/projects': () => listResponse([]),
      'POST /api/projects': () => {
        cree();
        return jsonResponse({ projet: CREATED }, { status: 201 });
      },
    });

    renderWorkspace('/projets');
    fireEvent.click(await screen.findByRole('button', { name: /Créer un projet/ }, LONG_WAIT));
    await screen.findByRole('dialog', {}, LONG_WAIT);

    fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));

    expect(await screen.findByText('Donnez un nom à ce projet.', {}, LONG_WAIT)).toBeDefined();
    expect(cree).not.toHaveBeenCalled();
  });

  it('affiche le message du serveur quand il refuse la création', async () => {
    mockApi({
      'GET /api/projects': () => listResponse([]),
      'POST /api/projects': () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Le nom du projet est déjà utilisé.'),
    });

    renderWorkspace('/projets');
    fireEvent.click(await screen.findByRole('button', { name: /Créer un projet/ }, LONG_WAIT));
    await screen.findByRole('dialog', {}, LONG_WAIT);

    fireEvent.change(screen.getByLabelText('Nom du projet'), { target: { value: 'Doublon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));

    expect(
      await screen.findByText('Le nom du projet est déjà utilisé.', {}, LONG_WAIT),
    ).toBeDefined();
  });
});

describe('fiche projet', () => {
  function mockProjectScreen(extra: Record<string, MockHandler> = {}) {
    mockApi({
      [`GET /api/projects/${PROJECT_NDIAYE.id}`]: () =>
        jsonResponse({ projet: { ...PROJECT_NDIAYE, calculs: [] } }),
      [`GET /api/projects/${PROJECT_NDIAYE.id}/calculs`]: () => jsonResponse({ calculs: [] }),
      // La fiche projet porte aussi le panneau des rapports (Vague 3) : sans
      // cette route, l'écran afficherait une erreur de liaison sans rapport
      // avec ce que ces tests-ci vérifient.
      [`GET /api/projects/${PROJECT_NDIAYE.id}/reports`]: () => jsonResponse({ rapports: [] }),
      'GET /api/calculs/modules': () => jsonResponse(FAKE_CATALOGUE),
      'GET /api/projects': () => listResponse([PROJECT_NDIAYE]),
      ...extra,
    });
  }

  it('présente les informations du projet et les modules du serveur', async () => {
    mockProjectScreen();

    renderWorkspace(`/projets/${PROJECT_NDIAYE.id}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Périmètre de Ndiaye' }, LONG_WAIT),
    ).toBeDefined();
    expect(screen.getByText('SAED')).toBeDefined();
    expect(screen.getByText('Delta du fleuve Sénégal')).toBeDefined();
    // Les modules viennent du catalogue, pas d'une liste écrite dans l'application.
    expect(await screen.findByText('Module de démonstration', {}, LONG_WAIT)).toBeDefined();
    expect(screen.getByText('Aucun calcul archivé')).toBeDefined();
  });

  it('explique la suppression sans jargon et n’appelle le serveur qu’après confirmation', async () => {
    const supprime = vi.fn();
    mockProjectScreen({
      [`DELETE /api/projects/${PROJECT_NDIAYE.id}`]: () => {
        supprime();
        return jsonResponse(null, { status: 204 });
      },
    });

    renderWorkspace(`/projets/${PROJECT_NDIAYE.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Périmètre de Ndiaye' }, LONG_WAIT);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    const dialog = await screen.findByRole('dialog', {}, LONG_WAIT);
    // La phrase promise à l'utilisateur, sans le mot « logique ».
    expect(within(dialog).getByText(/sera retiré de votre liste/)).toBeDefined();
    expect(within(dialog).queryByText(/logique/i)).toBeNull();
    expect(supprime).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(supprime).toHaveBeenCalledTimes(1), LONG_WAIT);
  });

  it('mène à un écran « introuvable » propre quand le projet n’est pas le vôtre', async () => {
    mockApi({
      'GET /api/projects/inconnu': () =>
        errorResponse(404, 'NOT_FOUND', 'Ce projet est introuvable.'),
      'GET /api/projects/inconnu/calculs': () =>
        errorResponse(404, 'NOT_FOUND', 'Ce projet est introuvable.'),
      'GET /api/calculs/modules': () => jsonResponse(FAKE_CATALOGUE),
    });

    renderWorkspace('/projets/inconnu');

    expect(await screen.findByText('Projet introuvable', {}, LONG_WAIT)).toBeDefined();
    expect(screen.getByRole('button', { name: /Revenir à mes projets/ })).toBeDefined();
    // Rien ne laisse deviner que le projet existe chez quelqu'un d'autre.
    expect(screen.queryByText(/403/)).toBeNull();
    expect(screen.queryByText(/autre utilisateur/i)).toBeNull();
  });

  it('affiche l’historique des calculs archivés, unités comprises', async () => {
    const calcul = {
      id: 'calc-1',
      module: 'MODULE_FICTIF',
      entrees: { superficie: 120, culture: 'RIZ' },
      resultats: CALCUL_OK.resultats,
      avertissements: CALCUL_OK.avertissements,
      engineVersion: '1.0.0',
      calculeLe: '2026-08-06T10:30:00.000Z',
    };

    mockProjectScreen({
      [`GET /api/projects/${PROJECT_NDIAYE.id}/calculs`]: () =>
        jsonResponse({ calculs: [calcul] }),
    });

    renderWorkspace(`/projets/${PROJECT_NDIAYE.id}`);

    // Le nom lisible du module vient du catalogue, jamais le code technique.
    await waitFor(
      () => expect(screen.getAllByText('Module de démonstration').length).toBeGreaterThan(1),
      LONG_WAIT,
    );
    expect(screen.queryByText('MODULE_FICTIF')).toBeNull();
    expect(screen.getByText('1 avertissement')).toBeDefined();

    // Dépliée, l'entrée réutilise l'affichage exact du résultat frais.
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(await screen.findByText('Besoin brut', {}, LONG_WAIT)).toBeDefined();
    expect(screen.getByText('m³/j')).toBeDefined();
  });
});
