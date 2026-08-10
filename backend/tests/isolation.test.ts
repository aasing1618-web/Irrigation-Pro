/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TEST D'ISOLATION DES DONNÉES — le test le plus important de la Vague 2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce que ce fichier prouve, route par route, sans exception :
 *
 *   1. Un client A ne peut ni LIRE, ni MODIFIER, ni SUPPRIMER, ni ARCHIVER un
 *      calcul sur une ressource du client B.
 *   2. La réponse est toujours `404 NOT_FOUND` — **jamais `403`**. Un `403`
 *      confirmerait que la ressource existe, et apprendrait donc à un bureau
 *      d'études combien de projets ont ses concurrents. Du point de vue de A,
 *      ce qui appartient à B n'existe pas.
 *   3. La réponse à « le projet de B » est **indiscernable** de la réponse à
 *      « un identifiant qui n'existe nulle part » : même statut, même corps,
 *      au caractère près.
 *   4. Aucun corps de réponse ne contient une donnée de B — ni son nom de
 *      projet, ni son nom de client, ni son identifiant.
 *   5. Un `ownerId` glissé dans le corps d'une création n'est **pas honoré** :
 *      le propriétaire reste le compte connecté, silencieusement.
 *
 * Les faux dépôts (`tests/helpers/projets.ts`) reproduisent le `WHERE
 * owner_id = …` du SQL réel, y compris la jointure pour `project_data`. Une
 * route qui oublierait de transmettre l'identifiant de la session ferait donc
 * échouer ces tests, au lieu de les faire passer par accident.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerEtatFactice,
  creerLigneUtilisateur,
  implementationsDepots,
  MOT_DE_PASSE_TEST,
  type EtatFactice,
  type LigneUtilisateur,
} from './helpers/comptes.js';
import {
  CATALOGUE_FACTICE,
  creerEtatProjets,
  creerLigneCalcul,
  creerLigneProjet,
  implementationsDepotsProjets,
  REFERENCES_FACTICES,
  UUID_INCONNU,
  type EtatProjets,
  type LigneCalcul,
  type LigneProjet,
} from './helpers/projets.js';

// --- Dépôts et moteur moqués -------------------------------------------------

const mockFindUserById = vi.fn();

const mockListProjects = vi.fn();
const mockCountProjects = vi.fn();
const mockGetProject = vi.fn();
const mockCreateProject = vi.fn();
const mockUpdateProject = vi.fn();
const mockSoftDeleteProject = vi.fn();
const mockProjectBelongsToOwner = vi.fn();

const mockSaveProjectData = vi.fn();
const mockListProjectData = vi.fn();
const mockCountProjectData = vi.fn();
const mockGetProjectData = vi.fn();
const mockGetLatestProjectData = vi.fn();
const mockDeleteProjectData = vi.fn();

const mockLogActivity = vi.fn();

const mockCalculer = vi.fn();
const mockListerModules = vi.fn();
const mockListerReferences = vi.fn();
const mockListerTablesDeReference = vi.fn();

vi.mock('../src/db/repositories/users.repo.js', () => ({
  findUserById: (...a: unknown[]) => mockFindUserById(...a),
}));

vi.mock('../src/db/repositories/projects.repo.js', () => ({
  PROJECT_STATUSES: ['BROUILLON', 'EN_COURS', 'TERMINE'],
  listProjects: (...a: unknown[]) => mockListProjects(...a),
  countProjects: (...a: unknown[]) => mockCountProjects(...a),
  getProject: (...a: unknown[]) => mockGetProject(...a),
  createProject: (...a: unknown[]) => mockCreateProject(...a),
  updateProject: (...a: unknown[]) => mockUpdateProject(...a),
  softDeleteProject: (...a: unknown[]) => mockSoftDeleteProject(...a),
  projectBelongsToOwner: (...a: unknown[]) => mockProjectBelongsToOwner(...a),
}));

vi.mock('../src/db/repositories/project-data.repo.js', () => ({
  saveProjectData: (...a: unknown[]) => mockSaveProjectData(...a),
  listProjectData: (...a: unknown[]) => mockListProjectData(...a),
  countProjectData: (...a: unknown[]) => mockCountProjectData(...a),
  getProjectData: (...a: unknown[]) => mockGetProjectData(...a),
  getLatestProjectData: (...a: unknown[]) => mockGetLatestProjectData(...a),
  deleteProjectData: (...a: unknown[]) => mockDeleteProjectData(...a),
}));

vi.mock('../src/db/repositories/activity-logs.repo.js', () => ({
  logActivity: (...a: unknown[]) => mockLogActivity(...a),
}));

vi.mock('../src/db/index.js', () => ({
  checkDatabase: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
  query: vi.fn(),
  withTransaction: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

vi.mock('../src/engine/index.js', async () => {
  const erreurs = await import('../src/engine/erreurs.js');
  return {
    ENGINE_VERSION: '1.0.0-test',
    CategorieErreur: erreurs.CategorieErreur,
    estErreurMoteur: erreurs.estErreurMoteur,
    calculer: (...a: unknown[]) => mockCalculer(...a),
    listerModules: () => mockListerModules(),
    listerReferences: (...a: unknown[]) => mockListerReferences(...a),
    listerTablesDeReference: () => mockListerTablesDeReference(),
  };
});

const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/auth/password.js');
const { signAccessToken } = await import('../src/auth/tokens.js');

const app = createApp();

/** Données de B que A ne doit jamais voir apparaître, où que ce soit. */
const SECRET_B_PROJET = 'Barrage confidentiel de Diama';
const SECRET_B_CLIENT = 'Consortium concurrent';

let comptes: EtatFactice;
let etat: EtatProjets;
let empreinte: string;

let clientA: LigneUtilisateur;
let clientB: LigneUtilisateur;
let jetonA: string;
let jetonB: string;

let projetA: LigneProjet;
let projetB: LigneProjet;
let calculB: LigneCalcul;

beforeAll(async () => {
  empreinte = await hashPassword(MOT_DE_PASSE_TEST);
}, 30_000);

beforeEach(async () => {
  comptes = creerEtatFactice();
  etat = creerEtatProjets();

  mockFindUserById.mockImplementation(implementationsDepots(comptes).findUserById);

  const depots = implementationsDepotsProjets(etat);
  mockListProjects.mockImplementation(depots.listProjects);
  mockCountProjects.mockImplementation(depots.countProjects);
  mockGetProject.mockImplementation(depots.getProject);
  mockCreateProject.mockImplementation(depots.createProject);
  mockUpdateProject.mockImplementation(depots.updateProject);
  mockSoftDeleteProject.mockImplementation(depots.softDeleteProject);
  mockProjectBelongsToOwner.mockImplementation(depots.projectBelongsToOwner);
  mockSaveProjectData.mockImplementation(depots.saveProjectData);
  mockListProjectData.mockImplementation(depots.listProjectData);
  mockCountProjectData.mockImplementation(depots.countProjectData);
  mockGetProjectData.mockImplementation(depots.getProjectData);
  mockGetLatestProjectData.mockImplementation(depots.getLatestProjectData);
  mockDeleteProjectData.mockImplementation(depots.deleteProjectData);
  mockLogActivity.mockImplementation(depots.logActivity);

  mockListerModules.mockReturnValue(CATALOGUE_FACTICE);
  mockListerTablesDeReference.mockReturnValue(Object.keys(REFERENCES_FACTICES));
  mockListerReferences.mockImplementation((table: string) => REFERENCES_FACTICES[table] ?? []);
  mockCalculer.mockImplementation((module: string) => ({
    module,
    engineVersion: '1.0.0-test',
    resultats: { besoin: 42 },
    avertissements: [],
  }));

  clientA = creerLigneUtilisateur(empreinte);
  clientB = creerLigneUtilisateur(empreinte);
  comptes.utilisateurs.push(clientA, clientB);
  jetonA = await signAccessToken({ id: clientA.id, role: clientA.role });
  jetonB = await signAccessToken({ id: clientB.id, role: clientB.role });

  projetA = creerLigneProjet(clientA.id, { name: 'Casier de A' });
  projetB = creerLigneProjet(clientB.id, {
    name: SECRET_B_PROJET,
    client_name: SECRET_B_CLIENT,
    description: 'Étude de faisabilité',
  });
  etat.projets.push(projetA, projetB);

  calculB = creerLigneCalcul(projetB.id, { module: 'BESOINS_EAU' });
  etat.calculs.push(calculB);
});

/** Requête émise par A. */
function commeA(requete: request.Test): request.Test {
  return requete.set('Authorization', `Bearer ${jetonA}`);
}

/** Requête émise par B (le propriétaire légitime). */
function commeB(requete: request.Test): request.Test {
  return requete.set('Authorization', `Bearer ${jetonB}`);
}

/**
 * Les routes qui touchent une ressource identifiée, décrites une fois pour
 * toutes. Chaque cas est joué deux fois : sur la ressource de B, et sur un
 * identifiant qui n'existe nulle part. Les deux réponses doivent être
 * identiques.
 */
type CasDeRoute = {
  nom: string;
  methode: 'get' | 'patch' | 'delete' | 'post';
  chemin: (projectId: string, calculId: string) => string;
  corps?: Record<string, unknown>;
};

const ROUTES_RESSOURCE: CasDeRoute[] = [
  {
    nom: 'GET /api/projects/:id (lire)',
    methode: 'get',
    chemin: (p) => `/api/projects/${p}`,
  },
  {
    nom: 'PATCH /api/projects/:id (modifier)',
    methode: 'patch',
    chemin: (p) => `/api/projects/${p}`,
    corps: { nom: 'Détourné par A' },
  },
  {
    nom: 'DELETE /api/projects/:id (supprimer)',
    methode: 'delete',
    chemin: (p) => `/api/projects/${p}`,
  },
  {
    nom: 'POST /api/projects/:id/calculs (archiver un calcul)',
    methode: 'post',
    chemin: (p) => `/api/projects/${p}/calculs`,
    corps: { module: 'BESOINS_EAU', entrees: { At: 12 } },
  },
  {
    nom: 'GET /api/projects/:id/calculs (historique)',
    methode: 'get',
    chemin: (p) => `/api/projects/${p}/calculs`,
  },
  {
    nom: 'DELETE /api/projects/:id/calculs/:calculId (retirer un calcul)',
    methode: 'delete',
    chemin: (p, c) => `/api/projects/${p}/calculs/${c}`,
  },
];

function jouer(cas: CasDeRoute, projectId: string, calculId: string): request.Test {
  const chemin = cas.chemin(projectId, calculId);
  const requete = commeA(request(app)[cas.methode](chemin));
  return cas.corps ? requete.send(cas.corps) : requete;
}

// ---------------------------------------------------------------------------

describe('404, jamais 403 — sur chaque route qui touche une ressource', () => {
  for (const cas of ROUTES_RESSOURCE) {
    it(`${cas.nom} : la ressource de B renvoie 404 à A`, async () => {
      const reponse = await jouer(cas, projetB.id, calculB.id);

      expect(reponse.status).toBe(404);
      expect(reponse.body.error.code).toBe('NOT_FOUND');
      // La formulation exacte compte : un 403 déguisé serait tout aussi bavard.
      expect(reponse.status).not.toBe(403);
      expect(reponse.body.error.code).not.toBe('FORBIDDEN');
    });

    it(`${cas.nom} : la réponse est indiscernable d’un identifiant inexistant`, async () => {
      const surProjetDeB = await jouer(cas, projetB.id, calculB.id);
      const surIdentifiantInconnu = await jouer(cas, UUID_INCONNU, UUID_INCONNU);

      expect(surProjetDeB.status).toBe(surIdentifiantInconnu.status);
      expect(surProjetDeB.body).toEqual(surIdentifiantInconnu.body);
    });

    it(`${cas.nom} : aucune donnée de B ne fuite dans la réponse`, async () => {
      const reponse = await jouer(cas, projetB.id, calculB.id);
      const texte = JSON.stringify(reponse.body);

      expect(texte).not.toContain(SECRET_B_PROJET);
      expect(texte).not.toContain(SECRET_B_CLIENT);
      expect(texte).not.toContain(projetB.id);
      expect(texte).not.toContain(calculB.id);
      expect(texte).not.toContain(clientB.id);
      expect(texte).not.toContain(clientB.email);
    });

    it(`${cas.nom} : le dépôt n’est jamais interrogé avec l’identifiant de B`, async () => {
      await jouer(cas, projetB.id, calculB.id);

      const tousLesAppels = [
        ...mockGetProject.mock.calls,
        ...mockUpdateProject.mock.calls,
        ...mockSoftDeleteProject.mock.calls,
        ...mockProjectBelongsToOwner.mock.calls,
        ...mockListProjectData.mock.calls,
        ...mockSaveProjectData.mock.calls,
        ...mockDeleteProjectData.mock.calls,
      ];

      // L'identifiant du projet visé peut apparaître (il vient de l'URL), mais
      // le propriétaire transmis doit TOUJOURS être A, jamais B.
      expect(tousLesAppels.length).toBeGreaterThan(0);
      for (const appel of tousLesAppels) {
        expect(appel).toContain(clientA.id);
        expect(appel).not.toContain(clientB.id);
      }
    });
  }
});

describe('aucun effet de bord sur les données de B', () => {
  it('A ne modifie pas le projet de B', async () => {
    await commeA(request(app).patch(`/api/projects/${projetB.id}`)).send({
      nom: 'Détourné',
      statut: 'TERMINE',
    });

    expect(projetB.name).toBe(SECRET_B_PROJET);
    expect(projetB.status).toBe('BROUILLON');
  });

  it('A ne supprime pas le projet de B', async () => {
    const reponse = await commeA(request(app).delete(`/api/projects/${projetB.id}`));

    expect(reponse.status).toBe(404);
    expect(projetB.deleted_at).toBeNull();

    // Et B, lui, voit toujours son projet.
    const chezB = await commeB(request(app).get(`/api/projects/${projetB.id}`));
    expect(chezB.status).toBe(200);
    expect(chezB.body.projet.nom).toBe(SECRET_B_PROJET);
  });

  it('A ne supprime pas un calcul de B', async () => {
    const reponse = await commeA(
      request(app).delete(`/api/projects/${projetB.id}/calculs/${calculB.id}`),
    );

    expect(reponse.status).toBe(404);
    expect(etat.calculs.some((c) => c.id === calculB.id)).toBe(true);
  });

  it('A n’archive pas un calcul dans le projet de B', async () => {
    const avant = etat.calculs.length;

    const reponse = await commeA(request(app).post(`/api/projects/${projetB.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: { At: 12 },
    });

    expect(reponse.status).toBe(404);
    expect(etat.calculs).toHaveLength(avant);
    // Le moteur n'est même pas sollicité : la vérification vient avant.
    expect(mockCalculer).not.toHaveBeenCalled();
  });

  it('A ne retire pas un calcul de B en le présentant comme le sien', async () => {
    // Attaque plus fine : A donne SON projet et le calcul de B. Les deux
    // appartenances doivent être vérifiées, pas seulement celle du projet.
    const reponse = await commeA(
      request(app).delete(`/api/projects/${projetA.id}/calculs/${calculB.id}`),
    );

    expect(reponse.status).toBe(404);
    expect(etat.calculs.some((c) => c.id === calculB.id)).toBe(true);
  });
});

describe('la liste ne laisse rien filtrer', () => {
  it('A ne voit que ses projets', async () => {
    const reponse = await commeA(request(app).get('/api/projects'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(1);
    expect(reponse.body.projets.map((p: { id: string }) => p.id)).toEqual([projetA.id]);
  });

  it('la recherche ne traverse pas la frontière entre comptes', async () => {
    const reponse = await commeA(
      request(app).get(`/api/projects?recherche=${encodeURIComponent('Diama')}`),
    );

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(0);
    expect(JSON.stringify(reponse.body)).not.toContain(SECRET_B_PROJET);
  });

  it('le filtre par statut ne fait pas apparaître les projets de B', async () => {
    projetB.status = 'EN_COURS';

    const reponse = await commeA(request(app).get('/api/projects?statut=EN_COURS'));

    expect(reponse.body.total).toBe(0);
    expect(reponse.body.projets).toEqual([]);
  });

  it('la pagination ne permet pas d’atteindre les projets de B', async () => {
    const reponse = await commeA(request(app).get('/api/projects?limite=200&depuis=0'));

    expect(reponse.body.projets).toHaveLength(1);
    expect(JSON.stringify(reponse.body)).not.toContain(projetB.id);
  });
});

describe('un ownerId envoyé par le client est ignoré, jamais honoré', () => {
  it('à la création : le propriétaire reste le compte connecté', async () => {
    const reponse = await commeA(request(app).post('/api/projects')).send({
      nom: 'Projet piégé',
      ownerId: clientB.id,
      owner_id: clientB.id,
      id: UUID_INCONNU,
    });

    expect(reponse.status).toBe(201);

    const cree = etat.projets.find((p) => p.name === 'Projet piégé');
    expect(cree).toBeDefined();
    expect(cree!.owner_id).toBe(clientA.id);
    expect(cree!.id).not.toBe(UUID_INCONNU);

    // `createProject(ownerId, input)` : le premier argument vient de la session.
    expect(mockCreateProject).toHaveBeenCalledWith(clientA.id, expect.anything());
    const [, entree] = mockCreateProject.mock.calls[0] as [string, Record<string, unknown>];
    expect(entree).not.toHaveProperty('ownerId');
    expect(entree).not.toHaveProperty('owner_id');
  });

  it('le projet piégé n’apparaît pas chez B', async () => {
    await commeA(request(app).post('/api/projects')).send({
      nom: 'Projet piégé',
      ownerId: clientB.id,
    });

    const chezB = await commeB(request(app).get('/api/projects'));

    expect(chezB.body.projets.map((p: { nom: string }) => p.nom)).not.toContain('Projet piégé');
  });

  it('à la modification : un ownerId seul est refusé, sans changer de propriétaire', async () => {
    const reponse = await commeA(request(app).patch(`/api/projects/${projetA.id}`)).send({
      ownerId: clientB.id,
    });

    // Vu comme un corps vide : la clé inconnue a été retirée avant le contrôle.
    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    expect(projetA.owner_id).toBe(clientA.id);
  });

  it('à la modification avec un champ légitime : l’ownerId est ignoré en silence', async () => {
    const reponse = await commeA(request(app).patch(`/api/projects/${projetA.id}`)).send({
      nom: 'Renommé',
      ownerId: clientB.id,
    });

    expect(reponse.status).toBe(200);
    expect(projetA.owner_id).toBe(clientA.id);
    expect(projetA.name).toBe('Renommé');
    // Aucune erreur n'a été renvoyée à propos d'`ownerId` : signaler le champ
    // apprendrait qu'il existe.
    expect(JSON.stringify(reponse.body)).not.toContain('ownerId');
  });

  it('à l’archivage d’un calcul : le projet cible reste celui de l’URL', async () => {
    const reponse = await commeA(request(app).post(`/api/projects/${projetA.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: {},
      projectId: projetB.id,
      ownerId: clientB.id,
    });

    expect(reponse.status).toBe(201);
    expect(etat.calculs.filter((c) => c.project_id === projetB.id)).toHaveLength(1); // seulement calculB
    expect(mockSaveProjectData).toHaveBeenCalledWith(
      projetA.id,
      clientA.id,
      expect.objectContaining({ module: 'BESOINS_EAU' }),
    );
  });
});

describe('le journal d’activité ne trace pas l’action sous le mauvais compte', () => {
  it('une tentative de A sur une ressource de B ne journalise rien', async () => {
    await commeA(request(app).delete(`/api/projects/${projetB.id}`));
    await commeA(request(app).patch(`/api/projects/${projetB.id}`)).send({ nom: 'x' });
    await commeA(request(app).post(`/api/projects/${projetB.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: {},
    });

    expect(etat.journal).toHaveLength(0);
  });

  it('une action légitime de A est journalisée sous A', async () => {
    await commeA(request(app).delete(`/api/projects/${projetA.id}`));

    expect(etat.journal).toHaveLength(1);
    expect(etat.journal[0]!.userId).toBe(clientA.id);
    expect(etat.journal[0]!.entityId).toBe(projetA.id);
  });
});

describe('le cloisonnement tient aussi dans l’autre sens', () => {
  it('B accède normalement à ses propres ressources', async () => {
    const projet = await commeB(request(app).get(`/api/projects/${projetB.id}`));
    const historique = await commeB(request(app).get(`/api/projects/${projetB.id}/calculs`));
    const suppression = await commeB(
      request(app).delete(`/api/projects/${projetB.id}/calculs/${calculB.id}`),
    );

    expect(projet.status).toBe(200);
    expect(projet.body.projet.nom).toBe(SECRET_B_PROJET);
    expect(historique.status).toBe(200);
    expect(historique.body.calculs).toHaveLength(1);
    expect(suppression.status).toBe(204);
  });

  it('A ne récupère pas le projet de B après que B l’a supprimé', async () => {
    await commeB(request(app).delete(`/api/projects/${projetB.id}`));

    const reponse = await commeA(request(app).get(`/api/projects/${projetB.id}`));

    expect(reponse.status).toBe(404);
  });
});
