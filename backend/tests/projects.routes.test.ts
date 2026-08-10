/**
 * Tests des routes « projets » et « calculs » — Vague 2.
 *
 * Vérifient le contrat `docs/API-VAGUE-2.md` route par route : validation des
 * entrées, pagination, filtres, suppression logique, archivage des calculs et
 * journalisation.
 *
 * Le cloisonnement entre clients a son propre fichier, `isolation.test.ts` :
 * c'est la propriété la plus importante de cette vague, elle mérite d'être
 * lisible d'un seul tenant.
 *
 * Aucun PostgreSQL n'est requis : les dépôts et le moteur sont remplacés par des
 * implémentations en mémoire (`tests/helpers/`).
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

// Le moteur est moqué, mais ses ERREURS sont les vraies : c'est la traduction
// `categorie` → statut HTTP que l'on veut éprouver, pas une imitation.
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
const { ErreurCalculImpossible, ErreurValidation } = await import('../src/engine/erreurs.js');

const app = createApp();

let comptes: EtatFactice;
let etat: EtatProjets;
let empreinte: string;
let client: LigneUtilisateur;
let jeton: string;

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
  mockCalculer.mockImplementation((module: string, entrees: Record<string, unknown>) => ({
    module,
    engineVersion: '1.0.0-test',
    resultats: { besoin: 42, echo: entrees['At'] ?? null },
    avertissements: [{ code: 'VITESSE_HORS_PLAGE', message: 'Vitesse élevée.', gravite: 'attention' }],
  }));

  client = creerLigneUtilisateur(empreinte);
  comptes.utilisateurs.push(client);
  jeton = await signAccessToken({ id: client.id, role: client.role });
});

/** Raccourci : requête authentifiée en tant que `client`. */
function connecte(requete: request.Test): request.Test {
  return requete.set('Authorization', `Bearer ${jeton}`);
}

function ajouterProjet(surcharges = {}) {
  const ligne = creerLigneProjet(client.id, surcharges);
  etat.projets.push(ligne);
  return ligne;
}

// ---------------------------------------------------------------------------

describe('authentification exigée', () => {
  it('refuse toutes les routes de la vague sans jeton', async () => {
    const appels: [string, string][] = [
      ['get', '/api/projects'],
      ['post', '/api/projects'],
      ['get', `/api/projects/${UUID_INCONNU}`],
      ['patch', `/api/projects/${UUID_INCONNU}`],
      ['delete', `/api/projects/${UUID_INCONNU}`],
      ['get', `/api/projects/${UUID_INCONNU}/calculs`],
      ['post', `/api/projects/${UUID_INCONNU}/calculs`],
      ['delete', `/api/projects/${UUID_INCONNU}/calculs/${UUID_INCONNU}`],
      ['get', '/api/calculs/modules'],
      ['get', '/api/calculs/references/cultures'],
      ['post', '/api/calculs/BESOINS_EAU'],
    ];

    for (const [methode, chemin] of appels) {
      const reponse = await (request(app) as unknown as Record<string, (c: string) => request.Test>)[
        methode
      ]!(chemin);
      expect(reponse.status, `${methode} ${chemin}`).toBe(401);
      expect(reponse.body.error.code).toBe('TOKEN_INVALID');
    }
  });

  it('refuse un compte suspendu même sur les projets', async () => {
    client.status = 'SUSPENDU';
    const reponse = await connecte(request(app).get('/api/projects'));
    expect(reponse.status).toBe(403);
    expect(reponse.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('refuse un compte devant changer son mot de passe', async () => {
    client.must_change_password = true;
    const reponse = await connecte(request(app).get('/api/projects'));
    expect(reponse.status).toBe(403);
    expect(reponse.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
});

describe('GET /api/projects', () => {
  it('renvoie une liste vide et un total nul pour un nouveau compte', async () => {
    const reponse = await connecte(request(app).get('/api/projects'));

    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ projets: [], total: 0 });
  });

  it('renvoie les projets du compte avec leur nombre de calculs', async () => {
    const projet = ajouterProjet({ name: 'Casier de Ndiaye' });
    etat.calculs.push(creerLigneCalcul(projet.id), creerLigneCalcul(projet.id));

    const reponse = await connecte(request(app).get('/api/projects'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(1);
    expect(reponse.body.projets).toHaveLength(1);
    expect(reponse.body.projets[0]).toMatchObject({
      id: projet.id,
      nom: 'Casier de Ndiaye',
      nomClient: 'SAED',
      statut: 'BROUILLON',
      nombreCalculs: 2,
    });
  });

  it('n’expose jamais owner_id ni deleted_at', async () => {
    ajouterProjet();
    const reponse = await connecte(request(app).get('/api/projects'));

    expect(JSON.stringify(reponse.body)).not.toContain('owner_id');
    expect(JSON.stringify(reponse.body)).not.toContain('ownerId');
    expect(JSON.stringify(reponse.body)).not.toContain('deleted_at');
  });

  it('ne renvoie jamais un projet supprimé logiquement', async () => {
    const vivant = ajouterProjet({ name: 'Vivant' });
    ajouterProjet({ name: 'Supprimé', deleted_at: new Date() });

    const reponse = await connecte(request(app).get('/api/projects'));

    expect(reponse.body.total).toBe(1);
    expect(reponse.body.projets.map((p: { id: string }) => p.id)).toEqual([vivant.id]);
    expect(JSON.stringify(reponse.body)).not.toContain('Supprimé');
  });

  it('filtre par statut', async () => {
    ajouterProjet({ status: 'BROUILLON' });
    const enCours = ajouterProjet({ status: 'EN_COURS' });

    const reponse = await connecte(request(app).get('/api/projects?statut=EN_COURS'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(1);
    expect(reponse.body.projets[0].id).toBe(enCours.id);
  });

  it('refuse un statut inconnu', async () => {
    const reponse = await connecte(request(app).get('/api/projects?statut=ARCHIVE'));

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recherche sur le nom du projet et sur le nom du client', async () => {
    const parNom = ajouterProjet({ name: 'Périmètre de Podor', client_name: 'SAED' });
    const parClient = ajouterProjet({ name: 'Autre chose', client_name: 'Coopérative Podor' });
    ajouterProjet({ name: 'Sans rapport', client_name: 'Autre' });

    const reponse = await connecte(request(app).get('/api/projects?recherche=podor'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(2);
    const identifiants = reponse.body.projets.map((p: { id: string }) => p.id);
    expect(identifiants).toContain(parNom.id);
    expect(identifiants).toContain(parClient.id);
  });

  it('pagine : `total` compte l’ensemble, pas la page', async () => {
    for (let i = 0; i < 5; i += 1) ajouterProjet();

    const page1 = await connecte(request(app).get('/api/projects?limite=2&depuis=0'));
    const page2 = await connecte(request(app).get('/api/projects?limite=2&depuis=2'));
    const page3 = await connecte(request(app).get('/api/projects?limite=2&depuis=4'));

    expect(page1.body.total).toBe(5);
    expect(page1.body.projets).toHaveLength(2);
    expect(page2.body.projets).toHaveLength(2);
    expect(page3.body.projets).toHaveLength(1);

    const vus = [...page1.body.projets, ...page2.body.projets, ...page3.body.projets].map(
      (p: { id: string }) => p.id,
    );
    expect(new Set(vus).size).toBe(5);
  });

  it('refuse une limite hors bornes', async () => {
    for (const requete of ['limite=0', 'limite=201', 'limite=abc', 'depuis=-1']) {
      const reponse = await connecte(request(app).get(`/api/projects?${requete}`));
      expect(reponse.status, requete).toBe(400);
      expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('POST /api/projects', () => {
  it('crée un projet et le renvoie en 201', async () => {
    const reponse = await connecte(request(app).post('/api/projects')).send({
      nom: '  Casier B  ',
      nomClient: 'SAED',
      localisation: 'Podor',
      description: 'Réhabilitation',
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.projet).toMatchObject({
      nom: 'Casier B',
      nomClient: 'SAED',
      localisation: 'Podor',
      description: 'Réhabilitation',
      statut: 'BROUILLON',
      nombreCalculs: 0,
    });
    expect(etat.projets).toHaveLength(1);
    expect(etat.projets[0]!.owner_id).toBe(client.id);
  });

  it('accepte un nom seul', async () => {
    const reponse = await connecte(request(app).post('/api/projects')).send({ nom: 'Minimal' });

    expect(reponse.status).toBe(201);
    expect(reponse.body.projet.nomClient).toBeNull();
  });

  it('refuse un nom vide, absent, ou fait uniquement d’espaces', async () => {
    for (const corps of [{}, { nom: '' }, { nom: '   ' }, { nom: 123 }]) {
      const reponse = await connecte(request(app).post('/api/projects')).send(corps);
      expect(reponse.status, JSON.stringify(corps)).toBe(400);
      expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('refuse un nom de plus de 200 caractères et un texte de plus de 500', async () => {
    const trop = await connecte(request(app).post('/api/projects')).send({ nom: 'a'.repeat(201) });
    expect(trop.status).toBe(400);

    const tropLong = await connecte(request(app).post('/api/projects')).send({
      nom: 'ok',
      description: 'a'.repeat(501),
    });
    expect(tropLong.status).toBe(400);
  });

  it('journalise PROJECT_CREATED avec l’identifiant du projet', async () => {
    const reponse = await connecte(request(app).post('/api/projects')).send({ nom: 'Journalisé' });

    const entree = etat.journal.find((e) => e.action === 'PROJECT_CREATED');
    expect(entree).toBeDefined();
    expect(entree!.userId).toBe(client.id);
    expect(entree!.entityId).toBe(reponse.body.projet.id);
  });
});

describe('GET /api/projects/:id', () => {
  it('renvoie le projet et son historique de calculs', async () => {
    const projet = ajouterProjet();
    etat.calculs.push(creerLigneCalcul(projet.id, { module: 'CANAL_MANNING' }));

    const reponse = await connecte(request(app).get(`/api/projects/${projet.id}`));

    expect(reponse.status).toBe(200);
    expect(reponse.body.projet.id).toBe(projet.id);
    expect(reponse.body.projet.calculs).toHaveLength(1);
    expect(reponse.body.projet.calculs[0]).toMatchObject({
      module: 'CANAL_MANNING',
      engineVersion: '1.0.0-test',
    });
  });

  it('renvoie 404 pour un projet inexistant', async () => {
    const reponse = await connecte(request(app).get(`/api/projects/${UUID_INCONNU}`));

    expect(reponse.status).toBe(404);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
  });

  it('renvoie 400 — et non 500 — pour un identifiant mal formé', async () => {
    for (const identifiant of ['abc', '123', "1' OR '1'='1", '../../etc/passwd']) {
      const reponse = await connecte(
        request(app).get(`/api/projects/${encodeURIComponent(identifiant)}`),
      );
      expect(reponse.status, identifiant).toBe(400);
      expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('renvoie 404 pour un projet supprimé logiquement', async () => {
    const projet = ajouterProjet({ deleted_at: new Date() });

    const reponse = await connecte(request(app).get(`/api/projects/${projet.id}`));

    expect(reponse.status).toBe(404);
  });
});

describe('PATCH /api/projects/:id', () => {
  it('modifie les champs fournis et laisse les autres intacts', async () => {
    const projet = ajouterProjet({ name: 'Avant', description: 'Inchangée' });

    const reponse = await connecte(request(app).patch(`/api/projects/${projet.id}`)).send({
      nom: 'Après',
      statut: 'EN_COURS',
    });

    expect(reponse.status).toBe(200);
    expect(reponse.body.projet).toMatchObject({ nom: 'Après', statut: 'EN_COURS' });
    expect(reponse.body.projet.description).toBe('Inchangée');
  });

  it('accepte la remise à vide d’un champ facultatif', async () => {
    const projet = ajouterProjet({ client_name: 'SAED' });

    const reponse = await connecte(request(app).patch(`/api/projects/${projet.id}`)).send({
      nomClient: null,
    });

    expect(reponse.status).toBe(200);
    expect(reponse.body.projet.nomClient).toBeNull();
  });

  it('refuse un corps vide', async () => {
    const projet = ajouterProjet();

    const reponse = await connecte(request(app).patch(`/api/projects/${projet.id}`)).send({});

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuse un statut inconnu', async () => {
    const projet = ajouterProjet();

    const reponse = await connecte(request(app).patch(`/api/projects/${projet.id}`)).send({
      statut: 'ARCHIVE',
    });

    expect(reponse.status).toBe(400);
  });

  it('journalise PROJECT_UPDATED avec les NOMS des champs, pas leurs valeurs', async () => {
    const projet = ajouterProjet();

    await connecte(request(app).patch(`/api/projects/${projet.id}`)).send({
      nomClient: 'Client confidentiel',
    });

    const entree = etat.journal.find((e) => e.action === 'PROJECT_UPDATED');
    expect(entree).toBeDefined();
    expect(entree!.entityId).toBe(projet.id);
    expect(JSON.stringify(entree!.metadata)).toContain('nomClient');
    expect(JSON.stringify(entree!.metadata)).not.toContain('Client confidentiel');
  });
});

describe('DELETE /api/projects/:id', () => {
  it('supprime logiquement et répond 204 sans corps', async () => {
    const projet = ajouterProjet();

    const reponse = await connecte(request(app).delete(`/api/projects/${projet.id}`));

    expect(reponse.status).toBe(204);
    expect(reponse.text).toBe('');
    // La ligne est CONSERVÉE : c'est une suppression logique.
    expect(etat.projets).toHaveLength(1);
    expect(etat.projets[0]!.deleted_at).not.toBeNull();
  });

  it('disparaît ensuite de la liste et de la lecture', async () => {
    const projet = ajouterProjet();
    await connecte(request(app).delete(`/api/projects/${projet.id}`));

    const liste = await connecte(request(app).get('/api/projects'));
    const lecture = await connecte(request(app).get(`/api/projects/${projet.id}`));

    expect(liste.body.total).toBe(0);
    expect(lecture.status).toBe(404);
  });

  it('renvoie 404 à la seconde suppression', async () => {
    const projet = ajouterProjet();
    await connecte(request(app).delete(`/api/projects/${projet.id}`));

    const deuxieme = await connecte(request(app).delete(`/api/projects/${projet.id}`));

    expect(deuxieme.status).toBe(404);
    expect(deuxieme.body.error.code).toBe('NOT_FOUND');
  });

  it('journalise PROJECT_DELETED', async () => {
    const projet = ajouterProjet();
    await connecte(request(app).delete(`/api/projects/${projet.id}`));

    const entree = etat.journal.find((e) => e.action === 'PROJECT_DELETED');
    expect(entree?.entityId).toBe(projet.id);
  });
});

describe('GET /api/calculs/modules', () => {
  it('sert le catalogue des modules avec leurs champs de saisie', async () => {
    const reponse = await connecte(request(app).get('/api/calculs/modules'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.modules).toHaveLength(1);
    expect(reponse.body.modules[0]).toMatchObject({ code: 'BESOINS_EAU' });
    expect(reponse.body.modules[0].entrees[0]).toMatchObject({
      champ: 'At',
      unite: 'ha',
      type: 'nombre',
      obligatoire: true,
    });
  });

  it('n’expose aucun coefficient métier', async () => {
    const reponse = await connecte(request(app).get('/api/calculs/modules'));
    const texte = JSON.stringify(reponse.body);

    for (const interdit of ['coefficient', 'manning', 'hazen', 'formule']) {
      expect(texte.toLowerCase()).not.toContain(interdit);
    }
  });
});

describe('GET /api/calculs/references/:table', () => {
  it('sert les clés et les libellés d’une table connue', async () => {
    const reponse = await connecte(request(app).get('/api/calculs/references/materiaux-conduite'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.valeurs).toEqual([
      { cle: 'PVC', libelle: 'PVC' },
      { cle: 'FONTE', libelle: 'Fonte ductile' },
    ]);
    // Le C de Hazen-Williams du PVC reste sur le serveur.
    expect(JSON.stringify(reponse.body)).not.toContain('150');
  });

  it('renvoie 404 pour une table inconnue', async () => {
    const reponse = await connecte(request(app).get('/api/calculs/references/salaires'));

    expect(reponse.status).toBe(404);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
  });

  it('refuse un nom de table mal formé', async () => {
    const reponse = await connecte(
      request(app).get(`/api/calculs/references/${encodeURIComponent('../../secret')}`),
    );

    expect(reponse.status).toBe(400);
  });
});

describe('POST /api/calculs/:module — calculer sans enregistrer', () => {
  it('renvoie résultats, avertissements et version du moteur', async () => {
    const reponse = await connecte(request(app).post('/api/calculs/BESOINS_EAU')).send({ At: 12 });

    expect(reponse.status).toBe(200);
    expect(reponse.body.resultats).toMatchObject({ besoin: 42, echo: 12 });
    expect(reponse.body.engineVersion).toBe('1.0.0-test');
    expect(reponse.body.avertissements).toHaveLength(1);
  });

  it('n’archive rien', async () => {
    await connecte(request(app).post('/api/calculs/BESOINS_EAU')).send({ At: 12 });

    expect(etat.calculs).toHaveLength(0);
    expect(mockSaveProjectData).not.toHaveBeenCalled();
  });

  it('journalise CALCUL_RUN sans recopier les entrées', async () => {
    await connecte(request(app).post('/api/calculs/BESOINS_EAU')).send({ At: 12345 });

    const entree = etat.journal.find((e) => e.action === 'CALCUL_RUN');
    expect(entree).toBeDefined();
    expect(JSON.stringify(entree!.metadata)).toContain('BESOINS_EAU');
    expect(JSON.stringify(entree!.metadata)).not.toContain('12345');
  });

  it('renvoie 404 pour un module inconnu, sans appeler le moteur', async () => {
    const reponse = await connecte(request(app).post('/api/calculs/MODULE_FANTOME')).send({});

    expect(reponse.status).toBe(404);
    expect(mockCalculer).not.toHaveBeenCalled();
  });

  it('refuse un code de module mal formé', async () => {
    const reponse = await connecte(
      request(app).post(`/api/calculs/${encodeURIComponent('besoins eau')}`),
    ).send({});

    expect(reponse.status).toBe(400);
  });

  it('traduit une erreur de saisie du moteur en 400 avec le champ fautif', async () => {
    mockCalculer.mockImplementation(() => {
      throw new ErreurValidation('La superficie totale doit être strictement positive.', {
        code: 'SUPERFICIE_INVALIDE',
        champ: 'At',
      });
    });

    const reponse = await connecte(request(app).post('/api/calculs/BESOINS_EAU')).send({ At: -1 });

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    expect(reponse.body.error.message).toBe('La superficie totale doit être strictement positive.');
    expect(reponse.body.error.details).toMatchObject({ champ: 'At' });
  });

  it('traduit un calcul sans solution physique en 422 CALCUL_IMPOSSIBLE', async () => {
    mockCalculer.mockImplementation(() => {
      throw new ErreurCalculImpossible(
        'La superficie irriguée par jour est nulle : vérifiez le cycle d’irrigation.',
      );
    });

    const reponse = await connecte(request(app).post('/api/calculs/BESOINS_EAU')).send({ At: 12 });

    expect(reponse.status).toBe(422);
    expect(reponse.body.error.code).toBe('CALCUL_IMPOSSIBLE');
    expect(reponse.body.error.message).toContain('cycle d’irrigation');
  });

  it('ne maquille pas un vrai défaut du moteur en 422', async () => {
    mockCalculer.mockImplementation(() => {
      throw new TypeError('lecture de undefined');
    });

    const reponse = await connecte(request(app).post('/api/calculs/BESOINS_EAU')).send({ At: 12 });

    expect(reponse.status).toBe(500);
    expect(reponse.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(reponse.body)).not.toContain('lecture de undefined');
  });
});

describe('POST /api/projects/:id/calculs — calculer et archiver', () => {
  it('archive le calcul avec sa version de moteur', async () => {
    const projet = ajouterProjet();

    const reponse = await connecte(request(app).post(`/api/projects/${projet.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: { At: 12 },
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.calcul).toMatchObject({
      module: 'BESOINS_EAU',
      entrees: { At: 12 },
      engineVersion: '1.0.0-test',
    });
    expect(reponse.body.calcul.resultats).toMatchObject({ besoin: 42 });
    expect(reponse.body.calcul.calculeLe).toEqual(expect.any(String));

    expect(etat.calculs).toHaveLength(1);
    expect(etat.calculs[0]!.engine_version).toBe('1.0.0-test');
    expect(etat.calculs[0]!.project_id).toBe(projet.id);
  });

  it('remonte les avertissements du moteur', async () => {
    const projet = ajouterProjet();

    const reponse = await connecte(request(app).post(`/api/projects/${projet.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: {},
    });

    expect(reponse.body.avertissements).toHaveLength(1);
    expect(reponse.body.avertissements[0]).toMatchObject({ code: 'VITESSE_HORS_PLAGE' });
  });

  it('refuse un corps sans module', async () => {
    const projet = ajouterProjet();

    const reponse = await connecte(request(app).post(`/api/projects/${projet.id}/calculs`)).send({
      entrees: {},
    });

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('vérifie le projet AVANT d’appeler le moteur', async () => {
    const reponse = await connecte(request(app).post(`/api/projects/${UUID_INCONNU}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: {},
    });

    expect(reponse.status).toBe(404);
    expect(mockCalculer).not.toHaveBeenCalled();
    expect(mockSaveProjectData).not.toHaveBeenCalled();
  });

  it('n’archive rien quand le calcul échoue', async () => {
    const projet = ajouterProjet();
    mockCalculer.mockImplementation(() => {
      throw new ErreurCalculImpossible('Cycle d’irrigation nul.');
    });

    const reponse = await connecte(request(app).post(`/api/projects/${projet.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: {},
    });

    expect(reponse.status).toBe(422);
    expect(etat.calculs).toHaveLength(0);
  });

  it('renvoie 409 si le projet disparaît pendant le calcul', async () => {
    const projet = ajouterProjet();
    // Le projet passe la vérification initiale, puis est supprimé pendant que
    // le moteur travaille : l'INSERT … SELECT n'écrit alors aucune ligne.
    mockCalculer.mockImplementation((module: string) => {
      projet.deleted_at = new Date();
      return { module, engineVersion: '1.0.0-test', resultats: {}, avertissements: [] };
    });

    const reponse = await connecte(request(app).post(`/api/projects/${projet.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: {},
    });

    expect(reponse.status).toBe(409);
    expect(reponse.body.error.code).toBe('CONFLICT');
  });

  it('journalise CALCUL_SAVED avec l’identifiant du projet', async () => {
    const projet = ajouterProjet();

    await connecte(request(app).post(`/api/projects/${projet.id}/calculs`)).send({
      module: 'BESOINS_EAU',
      entrees: {},
    });

    const entree = etat.journal.find((e) => e.action === 'CALCUL_SAVED');
    expect(entree?.entityId).toBe(projet.id);
  });
});

describe('GET /api/projects/:id/calculs — historique', () => {
  it('renvoie du plus récent au plus ancien', async () => {
    const projet = ajouterProjet();
    const ancien = creerLigneCalcul(projet.id, {
      computed_at: new Date(Date.UTC(2026, 0, 1)),
    });
    const recent = creerLigneCalcul(projet.id, {
      computed_at: new Date(Date.UTC(2026, 5, 1)),
    });
    etat.calculs.push(ancien, recent);

    const reponse = await connecte(request(app).get(`/api/projects/${projet.id}/calculs`));

    expect(reponse.status).toBe(200);
    expect(reponse.body.calculs.map((c: { id: string }) => c.id)).toEqual([recent.id, ancien.id]);
  });

  it('filtre par module', async () => {
    const projet = ajouterProjet();
    const manning = creerLigneCalcul(projet.id, { module: 'CANAL_MANNING' });
    etat.calculs.push(creerLigneCalcul(projet.id, { module: 'BESOINS_EAU' }), manning);

    const reponse = await connecte(
      request(app).get(`/api/projects/${projet.id}/calculs?module=CANAL_MANNING`),
    );

    expect(reponse.body.calculs).toHaveLength(1);
    expect(reponse.body.calculs[0].id).toBe(manning.id);
  });

  it('distingue « projet vide » de « projet introuvable »', async () => {
    const projet = ajouterProjet();

    const vide = await connecte(request(app).get(`/api/projects/${projet.id}/calculs`));
    const inconnu = await connecte(request(app).get(`/api/projects/${UUID_INCONNU}/calculs`));

    expect(vide.status).toBe(200);
    expect(vide.body.calculs).toEqual([]);
    expect(inconnu.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id/calculs/:calculId', () => {
  it('retire le calcul et répond 204', async () => {
    const projet = ajouterProjet();
    const calcul = creerLigneCalcul(projet.id);
    etat.calculs.push(calcul);

    const reponse = await connecte(
      request(app).delete(`/api/projects/${projet.id}/calculs/${calcul.id}`),
    );

    expect(reponse.status).toBe(204);
    expect(etat.calculs).toHaveLength(0);
  });

  it('renvoie 404 pour un calcul appartenant à un AUTRE projet du même compte', async () => {
    const projetA = ajouterProjet();
    const projetB = ajouterProjet();
    const calcul = creerLigneCalcul(projetB.id);
    etat.calculs.push(calcul);

    const reponse = await connecte(
      request(app).delete(`/api/projects/${projetA.id}/calculs/${calcul.id}`),
    );

    expect(reponse.status).toBe(404);
    expect(etat.calculs).toHaveLength(1);
  });

  it('refuse un identifiant de calcul mal formé', async () => {
    const projet = ajouterProjet();

    const reponse = await connecte(
      request(app).delete(`/api/projects/${projet.id}/calculs/pas-un-uuid`),
    );

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('journalise CALCUL_DELETED', async () => {
    const projet = ajouterProjet();
    const calcul = creerLigneCalcul(projet.id);
    etat.calculs.push(calcul);

    await connecte(request(app).delete(`/api/projects/${projet.id}/calculs/${calcul.id}`));

    const entree = etat.journal.find((e) => e.action === 'CALCUL_DELETED');
    expect(entree?.entityId).toBe(projet.id);
  });
});
