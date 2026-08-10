/**
 * Tests des routes « rapports » — Vague 3, contrat § 1.
 *
 * Aucun PostgreSQL : les dépôts sont remplacés par des implémentations en
 * mémoire qui **rejouent le même `WHERE` que le SQL réel** (mêmes conventions
 * que `tests/helpers/projets.ts`). Une route qui oublierait de transmettre
 * `ownerId`, ou qui le prendrait dans le corps de la requête plutôt que dans la
 * session, ne renverrait plus rien — et les tests d'isolation échoueraient au
 * lieu de passer par accident.
 *
 * Le **stockage sur disque n'est pas moqué** : les rapports sont réellement
 * écrits dans un dossier temporaire, puis relus par la route de téléchargement.
 * C'est le seul montage qui éprouve l'aller-retour complet — génération,
 * écriture, manifeste, relecture, en-têtes HTTP — et qui permet d'ouvrir le PDF
 * effectivement servi au client pour vérifier ce qu'il contient.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerEtatFactice,
  creerLigneUtilisateur,
  implementationsDepots,
  MOT_DE_PASSE_TEST,
  type EtatFactice,
  type LigneUtilisateur,
} from './helpers/comptes.js';
import {
  creerEtatProjets,
  creerLigneCalcul,
  creerLigneProjet,
  implementationsDepotsProjets,
  UUID_INCONNU,
  type EtatProjets,
  type LigneProjet,
} from './helpers/projets.js';
import { normaliser, texteDuPdf, textesParPage } from './helpers/pdf.js';

// ---------------------------------------------------------------------------
// Dépôts et moteur moqués
// ---------------------------------------------------------------------------

const mockFindUserById = vi.fn();
const mockGetProject = vi.fn();
const mockProjectBelongsToOwner = vi.fn();
const mockGetProjectData = vi.fn();
const mockListProjectData = vi.fn();
const mockLogActivity = vi.fn();

const mockCreateReport = vi.fn();
const mockSetReportFilePath = vi.fn();
const mockListReports = vi.fn();
const mockGetReport = vi.fn();
const mockDeleteReport = vi.fn();

const mockCalculer = vi.fn();
const mockListerModules = vi.fn();
const mockListerReferences = vi.fn();

vi.mock('../src/db/repositories/users.repo.js', () => ({
  findUserById: (...a: unknown[]) => mockFindUserById(...a),
}));

vi.mock('../src/db/repositories/projects.repo.js', () => ({
  PROJECT_STATUSES: ['BROUILLON', 'EN_COURS', 'TERMINE'],
  listProjects: vi.fn(),
  countProjects: vi.fn(),
  getProject: (...a: unknown[]) => mockGetProject(...a),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  softDeleteProject: vi.fn(),
  projectBelongsToOwner: (...a: unknown[]) => mockProjectBelongsToOwner(...a),
}));

vi.mock('../src/db/repositories/project-data.repo.js', () => ({
  saveProjectData: vi.fn(),
  listProjectData: (...a: unknown[]) => mockListProjectData(...a),
  countProjectData: vi.fn(),
  getProjectData: (...a: unknown[]) => mockGetProjectData(...a),
  getLatestProjectData: vi.fn(),
  deleteProjectData: vi.fn(),
}));

vi.mock('../src/db/repositories/reports.repo.js', () => ({
  createReport: (...a: unknown[]) => mockCreateReport(...a),
  setReportFilePath: (...a: unknown[]) => mockSetReportFilePath(...a),
  listReports: (...a: unknown[]) => mockListReports(...a),
  getReport: (...a: unknown[]) => mockGetReport(...a),
  deleteReport: (...a: unknown[]) => mockDeleteReport(...a),
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
    listerTablesDeReference: () => ['natures-paroi'],
  };
});

// Le stockage doit pointer sur un dossier jetable AVANT que `stockage.ts` ne
// soit chargé : sa racine est figée à l'import.
const DOSSIER_STOCKAGE = mkdtempSync(path.join(tmpdir(), 'irrigation-rapports-'));
process.env['REPORTS_STORAGE_DIR'] = DOSSIER_STOCKAGE;

const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/auth/password.js');
const { signAccessToken } = await import('../src/auth/tokens.js');

const app = createApp();

afterAll(() => {
  rmSync(DOSSIER_STOCKAGE, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Catalogue et moteur factices
// ---------------------------------------------------------------------------

/**
 * Catalogue minimal, à la forme exacte de `DescriptionModule` (champ `nom`, et
 * non `libelle`). Il ne contient **aucun coefficient** : le test D-007 sérieux,
 * lui, tourne sur le vrai moteur dans `reports.document.test.ts`.
 */
const CATALOGUE = [
  {
    code: 'CANAL_MANNING',
    nom: 'Canal trapézoïdal',
    famille: 'GRAVITAIRE',
    origine: 'Feuille 6',
    description: 'Dimensionnement d’un canal à surface libre.',
    entrees: [
      { champ: 'qCible', libelle: 'Débit cible', type: 'nombre', unite: 'm³/s', obligatoire: true },
      {
        champ: 'natureParoi',
        libelle: 'Nature de la paroi',
        type: 'liste',
        unite: null,
        obligatoire: true,
        table: 'natures-paroi',
      },
      {
        champ: 'troncons',
        libelle: 'Tronçons du réseau',
        type: 'tableau',
        unite: null,
        obligatoire: false,
      },
    ],
    sorties: [
      { champ: 'tirantEau', libelle: 'Tirant d’eau', unite: 'm', principal: true },
      { champ: 'vitesse', libelle: 'Vitesse moyenne', unite: 'm/s', principal: false },
    ],
  },
];

const AVERTISSEMENTS_MOTEUR = [
  {
    code: 'VITESSE_HORS_PLAGE',
    message:
      'La vitesse d’écoulement dépasse la plage admissible pour cette nature de paroi : risque d’affouillement.',
    gravite: 'attention' as const,
  },
  {
    code: 'REVANCHE_MINIMALE',
    message: 'La revanche retenue est la revanche minimale réglementaire.',
    gravite: 'info' as const,
  },
];

// ---------------------------------------------------------------------------
// Faux dépôt de rapports
// ---------------------------------------------------------------------------

type LigneRapport = {
  id: string;
  project_id: string;
  owner_id: string;
  reference: string;
  file_path: string | null;
  generated_at: Date;
};

let rapports: LigneRapport[] = [];
let compteurRapport = 0;
let compteurReference = 0;

function uuidRapport(numero: number): string {
  return `dddddddd-0000-4000-8000-${String(numero).padStart(12, '0')}`;
}

/**
 * Reproduit le comportement du SQL réel : l'`INSERT … SELECT` filtré sur
 * `projects.owner_id` ne produit rien si le projet n'est pas celui du compte,
 * ou s'il a été supprimé. La référence est attribuée **par le dépôt**, jamais
 * par l'appelant, et reste unique.
 */
function fauxDepotRapports(etat: EtatProjets) {
  const projetVivant = (id: string, ownerId: string): LigneProjet | null =>
    etat.projets.find((p) => p.id === id && p.owner_id === ownerId && p.deleted_at === null) ?? null;

  const projetDe = (id: string, ownerId: string): LigneProjet | null =>
    etat.projets.find((p) => p.id === id && p.owner_id === ownerId) ?? null;

  return {
    createReport: async (projectId: string, ownerId: string, annee?: number) => {
      if (!projetVivant(projectId, ownerId)) return null;
      compteurRapport += 1;
      compteurReference += 1;
      const ligne: LigneRapport = {
        id: uuidRapport(compteurRapport),
        project_id: projectId,
        owner_id: ownerId,
        reference: `RAP-${annee ?? new Date().getFullYear()}-${String(compteurReference).padStart(4, '0')}`,
        file_path: null,
        generated_at: new Date(Date.UTC(2026, 7, 10, 14, 32, compteurRapport)),
      };
      rapports.push(ligne);
      return ligne;
    },

    setReportFilePath: async (id: string, ownerId: string, filePath: string | null) => {
      const ligne = rapports.find((r) => r.id === id && r.owner_id === ownerId);
      if (!ligne) return false;
      ligne.file_path = filePath;
      return true;
    },

    listReports: async (projectId: string, ownerId: string) =>
      rapports
        .filter(
          (r) =>
            r.project_id === projectId &&
            r.owner_id === ownerId &&
            projetDe(r.project_id, r.owner_id) !== null,
        )
        .sort((a, b) => b.generated_at.getTime() - a.generated_at.getTime()),

    // La jointure `projects p ON p.id = r.project_id AND p.owner_id = r.owner_id`
    // du SQL réel : les deux `owner_id` doivent concorder.
    getReport: async (id: string, ownerId: string) => {
      const ligne = rapports.find((r) => r.id === id && r.owner_id === ownerId);
      if (!ligne) return null;
      const projet = projetDe(ligne.project_id, ligne.owner_id);
      if (!projet) return null;
      return { ...ligne, project_name: projet.name, project_deleted_at: projet.deleted_at };
    },

    deleteReport: async (id: string, ownerId: string) => {
      const index = rapports.findIndex((r) => r.id === id && r.owner_id === ownerId);
      if (index === -1) return null;
      const ligne = rapports[index] as LigneRapport;
      if (!projetDe(ligne.project_id, ligne.owner_id)) return null;
      rapports.splice(index, 1);
      return ligne;
    },
  };
}

// ---------------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------------

let comptes: EtatFactice;
let etat: EtatProjets;
let empreinte: string;
let client: LigneUtilisateur;
let autreClient: LigneUtilisateur;
let jeton: string;
let jetonAutre: string;
let projet: LigneProjet;

beforeAll(async () => {
  empreinte = await hashPassword(MOT_DE_PASSE_TEST);
}, 30_000);

beforeEach(async () => {
  comptes = creerEtatFactice();
  etat = creerEtatProjets();
  rapports = [];
  compteurRapport = 0;
  compteurReference = 0;

  mockFindUserById.mockImplementation(implementationsDepots(comptes).findUserById);

  const depots = implementationsDepotsProjets(etat);
  mockGetProject.mockImplementation(depots.getProject);
  mockProjectBelongsToOwner.mockImplementation(depots.projectBelongsToOwner);
  mockGetProjectData.mockImplementation(depots.getProjectData);
  mockListProjectData.mockImplementation(depots.listProjectData);
  mockLogActivity.mockImplementation(depots.logActivity);

  const depotRapports = fauxDepotRapports(etat);
  mockCreateReport.mockImplementation(depotRapports.createReport);
  mockSetReportFilePath.mockImplementation(depotRapports.setReportFilePath);
  mockListReports.mockImplementation(depotRapports.listReports);
  mockGetReport.mockImplementation(depotRapports.getReport);
  mockDeleteReport.mockImplementation(depotRapports.deleteReport);

  mockListerModules.mockReturnValue(CATALOGUE);
  mockListerReferences.mockReturnValue([
    { cle: 'TERRE_PIERREUX', libelle: 'Canal de terre — pierreux, galets' },
  ]);
  mockCalculer.mockImplementation((module: string) => ({
    module,
    engineVersion: '1.0.0-test',
    resultats: { tirantEau: 0.246, vitesse: 0.71 },
    avertissements: AVERTISSEMENTS_MOTEUR,
  }));

  client = creerLigneUtilisateur(empreinte, { full_name: 'Aïssatou Bâ' });
  autreClient = creerLigneUtilisateur(empreinte);
  comptes.utilisateurs.push(client, autreClient);

  jeton = await signAccessToken({ id: client.id, role: client.role });
  jetonAutre = await signAccessToken({ id: autreClient.id, role: autreClient.role });

  projet = creerLigneProjet(client.id, {
    name: 'Périmètre irrigué de Ndiaye',
    client_name: 'Société d’Aménagement du Delta',
    location: 'Dagana',
  });
  etat.projets.push(projet);
  etat.calculs.push(
    creerLigneCalcul(projet.id, {
      module: 'CANAL_MANNING',
      inputs: { qCible: 0.09, natureParoi: 'TERRE_PIERREUX' },
      results: { tirantEau: 0.246, vitesse: 0.71 },
      engine_version: '1.0.0-test',
    }),
  );
});

/** Génère un rapport et renvoie le corps de la réponse. */
async function genererRapport(
  corps: Record<string, unknown> = {},
): Promise<{ id: string; reference: string; genereLe: string }> {
  const reponse = await request(app)
    .post(`/api/projects/${projet.id}/reports`)
    .set('Authorization', `Bearer ${jeton}`)
    .send(corps);
  expect(reponse.status).toBe(201);
  return reponse.body.rapport;
}

// ===========================================================================
// POST /api/projects/:id/reports
// ===========================================================================

describe('POST /api/projects/:id/reports', () => {
  it('génère un rapport, lui attribue une référence et écrit le PDF', async () => {
    const reponse = await request(app)
      .post(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({});

    expect(reponse.status).toBe(201);
    expect(reponse.body.rapport).toMatchObject({
      id: expect.any(String),
      reference: expect.stringMatching(/^RAP-\d{4}-\d{4}$/),
      genereLe: expect.any(String),
    });

    const ligne = rapports[0];
    expect(ligne?.file_path).toBeTruthy();
  });

  it('n’accepte jamais une référence fournie par le client', async () => {
    const reponse = await request(app)
      .post(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({ reference: 'RAP-1999-9999' });

    expect(reponse.status).toBe(201);
    expect(reponse.body.rapport.reference).not.toBe('RAP-1999-9999');
    expect(reponse.body.rapport.reference).toMatch(/^RAP-\d{4}-\d{4}$/);
  });

  it('attribue une référence distincte à chaque rapport, même demandés ensemble', async () => {
    const reponses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post(`/api/projects/${projet.id}/reports`)
          .set('Authorization', `Bearer ${jeton}`)
          .send({}),
      ),
    );

    const references = reponses.map((r) => r.body.rapport.reference as string);
    expect(references).toHaveLength(8);
    expect(new Set(references).size).toBe(8);
  });

  it('reprend le dernier calcul de chaque module quand `calculIds` est omis', async () => {
    etat.calculs.push(
      creerLigneCalcul(projet.id, {
        module: 'BESOINS_EAU',
        computed_at: new Date(Date.UTC(2026, 2, 1)),
      }),
    );
    const rapport = await genererRapport({});
    const pdf = await telecharger(rapport.id);
    expect(normaliser(texteDuPdf(pdf))).toContain('MODULES RETENUS 2 modules de calcul');
  });

  it('accepte une sélection explicite de calculs', async () => {
    const calcul = etat.calculs[0];
    const rapport = await genererRapport({ calculIds: [calcul?.id] });
    expect(rapport.reference).toMatch(/^RAP-/);
  });

  it('refuse un projet qui n’existe pas — 404', async () => {
    const reponse = await request(app)
      .post(`/api/projects/${UUID_INCONNU}/reports`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({});

    expect(reponse.status).toBe(404);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
  });

  it('refuse le projet d’un autre client — 404, jamais 403', async () => {
    const reponse = await request(app)
      .post(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jetonAutre}`)
      .send({});

    expect(reponse.status).toBe(404);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
    expect(rapports).toHaveLength(0);
  });

  it('refuse un calcul appartenant à un AUTRE projet — 404', async () => {
    const autreProjet = creerLigneProjet(client.id);
    etat.projets.push(autreProjet);
    const calculAilleurs = creerLigneCalcul(autreProjet.id, { module: 'CANAL_MANNING' });
    etat.calculs.push(calculAilleurs);

    const reponse = await request(app)
      .post(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({ calculIds: [calculAilleurs.id] });

    expect(reponse.status).toBe(404);
    // Aucun rapport n'a été créé : on refuse plutôt que de produire un document
    // amputé du calcul demandé.
    expect(rapports).toHaveLength(0);
  });

  it('refuse un calcul appartenant au projet d’un autre client — 404', async () => {
    const projetTiers = creerLigneProjet(autreClient.id);
    etat.projets.push(projetTiers);
    const calculTiers = creerLigneCalcul(projetTiers.id, { module: 'CANAL_MANNING' });
    etat.calculs.push(calculTiers);

    const reponse = await request(app)
      .post(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({ calculIds: [calculTiers.id] });

    expect(reponse.status).toBe(404);
    expect(rapports).toHaveLength(0);
  });

  it('refuse de produire un rapport vide sur un projet sans calcul', async () => {
    const projetVide = creerLigneProjet(client.id);
    etat.projets.push(projetVide);

    const reponse = await request(app)
      .post(`/api/projects/${projetVide.id}/reports`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({});

    expect(reponse.status).toBe(400);
  });

  it('refuse un identifiant de projet mal formé — 400, pas une erreur SQL', async () => {
    const reponse = await request(app)
      .post('/api/projects/pas-un-uuid/reports')
      .set('Authorization', `Bearer ${jeton}`)
      .send({});

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('exige une authentification', async () => {
    const reponse = await request(app).post(`/api/projects/${projet.id}/reports`).send({});
    expect(reponse.status).toBe(401);
  });

  /**
   * Le routeur des rapports est monté à la racine de `/api`. Il ne doit pas
   * pour autant intercepter les chemins inconnus : ceux-là restent des `404`,
   * et non des `401` — sans quoi le montage aurait changé le comportement de
   * toutes les routes inexistantes de l'API.
   */
  it('ne capte pas les chemins inconnus de l’API', async () => {
    for (const chemin of ['/api/inconnu', '/api/reports', '/api/reports/x/y']) {
      const reponse = await request(app).get(chemin);
      expect(reponse.status, chemin).toBe(404);
    }
  });

  it('journalise REPORT_GENERATED sans recopier l’étude du client', async () => {
    const rapport = await genererRapport({ notes: 'Observation confidentielle du bureau.' });

    const entree = etat.journal.find((e) => e.action === 'REPORT_GENERATED');
    expect(entree).toBeDefined();
    expect(entree?.userId).toBe(client.id);
    expect(entree?.entityId).toBe(rapport.id);
    expect(JSON.stringify(entree?.metadata)).not.toContain('Observation confidentielle');
  });
});

// ===========================================================================
// GET /api/projects/:id/reports
// ===========================================================================

describe('GET /api/projects/:id/reports', () => {
  it('liste les rapports du projet avec leur nombre de calculs', async () => {
    await genererRapport({});
    await genererRapport({});

    const reponse = await request(app)
      .get(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.rapports).toHaveLength(2);
    for (const rapport of reponse.body.rapports) {
      expect(rapport).toMatchObject({
        id: expect.any(String),
        reference: expect.stringMatching(/^RAP-/),
        genereLe: expect.any(String),
        nombreCalculs: 1,
      });
    }
  });

  it('ne montre jamais les rapports d’un autre client — 404 sur son projet', async () => {
    await genererRapport({});

    const reponse = await request(app)
      .get(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jetonAutre}`);

    expect(reponse.status).toBe(404);
    expect(JSON.stringify(reponse.body)).not.toContain('RAP-');
  });

  it('renvoie une liste vide — et non 404 — sur un projet sans rapport', async () => {
    const reponse = await request(app)
      .get(`/api/projects/${projet.id}/reports`)
      .set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.rapports).toEqual([]);
  });
});

// ===========================================================================
// GET /api/reports/:id/fichier
// ===========================================================================

/** Télécharge un rapport et renvoie le PDF servi. */
async function telecharger(reportId: string, jetonUtilise = jeton): Promise<Buffer> {
  const reponse = await request(app)
    .get(`/api/reports/${reportId}/fichier`)
    .set('Authorization', `Bearer ${jetonUtilise}`)
    .buffer(true)
    .parse((res, callback) => {
      const morceaux: Buffer[] = [];
      res.on('data', (morceau: Buffer) => morceaux.push(Buffer.from(morceau)));
      res.on('end', () => callback(null, Buffer.concat(morceaux)));
    });
  expect(reponse.status).toBe(200);
  return reponse.body as Buffer;
}

describe('GET /api/reports/:id/fichier', () => {
  it('sert un PDF valide, non vide, avec les bons en-têtes', async () => {
    const rapport = await genererRapport({});

    const reponse = await request(app)
      .get(`/api/reports/${rapport.id}/fichier`)
      .set('Authorization', `Bearer ${jeton}`)
      .buffer(true)
      .parse((res, callback) => {
        const morceaux: Buffer[] = [];
        res.on('data', (m: Buffer) => morceaux.push(Buffer.from(m)));
        res.on('end', () => callback(null, Buffer.concat(morceaux)));
      });

    expect(reponse.status).toBe(200);
    expect(reponse.headers['content-type']).toContain('application/pdf');
    expect(reponse.headers['content-disposition']).toMatch(/^attachment;/);
    expect(reponse.headers['cache-control']).toContain('no-store');

    const pdf = reponse.body as Buffer;
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(Number(reponse.headers['content-length'])).toBe(pdf.length);
  });

  it('propose un nom de fichier lisible, portant la référence', async () => {
    const rapport = await genererRapport({});
    const reponse = await request(app)
      .get(`/api/reports/${rapport.id}/fichier`)
      .set('Authorization', `Bearer ${jeton}`);

    const disposition = reponse.headers['content-disposition'] as string;
    expect(disposition).toContain(`Rapport ${rapport.reference}`);
    expect(disposition).toContain('.pdf');
    // Forme UTF-8 percent-encodée : les accents survivent au gestionnaire de
    // téléchargement.
    expect(disposition).toContain("filename*=UTF-8''");
  });

  it('assainit le nom du projet : ni chemin, ni retour à la ligne dans l’en-tête', async () => {
    // Un nom de projet hostile : séparateurs de chemin, remontée de dossier,
    // injection d'en-tête HTTP, guillemets, et des accents à préserver.
    projet.name = 'Périmètre/2026\\..\\..\\etc\r\nSet-Cookie: vole=1\r\nX: "y" éàç';

    const rapport = await genererRapport({});
    const reponse = await request(app)
      .get(`/api/reports/${rapport.id}/fichier`)
      .set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(200);
    const disposition = reponse.headers['content-disposition'] as string;

    // Aucun caractère capable de couper l'en-tête ou de désigner un chemin.
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).not.toContain('/');
    expect(disposition).not.toContain('\\');
    expect(disposition).not.toContain('..');
    // Le guillemet de la forme historique n'est pas refermé par le contenu.
    expect(disposition.match(/"/g)).toHaveLength(2);
    // Aucun en-tête parasite n'a été créé.
    expect(reponse.headers['set-cookie']).toBeUndefined();
    // Les accents survivent, sous forme percent-encodée.
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1] ?? '')).toContain('é');
  });

  it('refuse le rapport d’un autre client — 404, jamais 403', async () => {
    const rapport = await genererRapport({});

    const reponse = await request(app)
      .get(`/api/reports/${rapport.id}/fichier`)
      .set('Authorization', `Bearer ${jetonAutre}`);

    expect(reponse.status).toBe(404);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
    expect(reponse.headers['content-type']).not.toContain('application/pdf');
  });

  it('refuse un identifiant inconnu — 404', async () => {
    const reponse = await request(app)
      .get(`/api/reports/${UUID_INCONNU}/fichier`)
      .set('Authorization', `Bearer ${jeton}`);
    expect(reponse.status).toBe(404);
  });

  it('journalise REPORT_DOWNLOADED', async () => {
    const rapport = await genererRapport({});
    await telecharger(rapport.id);

    const entree = etat.journal.find((e) => e.action === 'REPORT_DOWNLOADED');
    expect(entree?.userId).toBe(client.id);
    expect(entree?.entityId).toBe(rapport.id);
  });
});

// ===========================================================================
// Le contenu du document réellement servi
// ===========================================================================

describe('Le document servi au client', () => {
  it('contient les avertissements métier émis par le moteur', async () => {
    const rapport = await genererRapport({});
    const texte = normaliser(texteDuPdf(await telecharger(rapport.id)));

    for (const avertissement of AVERTISSEMENTS_MOTEUR) {
      expect(texte).toContain(normaliser(avertissement.message));
    }
    expect(texte).toContain('Avertissements techniques');
  });

  it('porte la référence, le projet, le client final et l’auteur', async () => {
    const rapport = await genererRapport({});
    const texte = normaliser(texteDuPdf(await telecharger(rapport.id)));

    expect(texte).toContain(rapport.reference);
    expect(texte).toContain('Périmètre irrigué de Ndiaye');
    expect(texte).toContain('Société d’Aménagement du Delta');
    expect(texte).toContain('Dagana');
    expect(texte).toContain('Aïssatou Bâ');
    expect(texte).toContain('moteur de calcul v1.0.0-test');
  });

  it('affiche le libellé d’une liste de référence, pas sa clé technique', async () => {
    const rapport = await genererRapport({});
    const texte = normaliser(texteDuPdf(await telecharger(rapport.id)));

    expect(texte).toContain('Canal de terre — pierreux, galets');
    expect(texte).not.toContain('TERRE_PIERREUX');
  });

  it('reprend les observations libres saisies par l’ingénieur', async () => {
    const rapport = await genererRapport({
      notes: 'La reprise du canal secondaire est conditionnée à l’accord de la SAED.',
    });
    const texte = normaliser(texteDuPdf(await telecharger(rapport.id)));
    expect(texte).toContain('conditionnée à l’accord de la SAED');
  });

  it('s’étale sur plusieurs pages, en-têtes de tableau répétés, quand le rapport est long', async () => {
    etat.calculs.push(
      creerLigneCalcul(projet.id, {
        module: 'CANAL_MANNING',
        inputs: {
          qCible: 0.09,
          natureParoi: 'TERRE_PIERREUX',
          troncons: Array.from({ length: 150 }, (_, index) => ({
            rang: index + 1,
            designation: `Tronçon aval n° ${index + 1}`,
            longueur: 12.5 * (index + 1),
          })),
        },
        computed_at: new Date(Date.UTC(2026, 6, 1)),
      }),
    );

    const rapport = await genererRapport({});
    const pdf = await telecharger(rapport.id);
    const pages = textesParPage(pdf).map(normaliser);

    expect(pages.length).toBeGreaterThanOrEqual(4);

    const pagesAvecLignes = pages.filter((page) => /Tronçon aval n° \d+/.test(page));
    expect(pagesAvecLignes.length).toBeGreaterThanOrEqual(3);
    for (const page of pagesAvecLignes) {
      expect(page).toContain('N° rang designation longueur');
    }

    pages.forEach((page, index) => {
      expect(page).toContain(`Page ${index + 1} / ${pages.length}`);
    });
  });
});

// ===========================================================================
// DELETE /api/reports/:id
// ===========================================================================

describe('DELETE /api/reports/:id', () => {
  it('supprime le rapport et son fichier', async () => {
    const rapport = await genererRapport({});

    const reponse = await request(app)
      .delete(`/api/reports/${rapport.id}`)
      .set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(204);
    expect(rapports).toHaveLength(0);

    // Le fichier a bien disparu : un second téléchargement n'aboutit pas.
    const apres = await request(app)
      .get(`/api/reports/${rapport.id}/fichier`)
      .set('Authorization', `Bearer ${jeton}`);
    expect(apres.status).toBe(404);
  });

  it('refuse le rapport d’un autre client — 404, et ne le supprime pas', async () => {
    const rapport = await genererRapport({});

    const reponse = await request(app)
      .delete(`/api/reports/${rapport.id}`)
      .set('Authorization', `Bearer ${jetonAutre}`);

    expect(reponse.status).toBe(404);
    expect(rapports).toHaveLength(1);
  });

  it('renvoie 404 sur une seconde suppression', async () => {
    const rapport = await genererRapport({});
    await request(app)
      .delete(`/api/reports/${rapport.id}`)
      .set('Authorization', `Bearer ${jeton}`);

    const reponse = await request(app)
      .delete(`/api/reports/${rapport.id}`)
      .set('Authorization', `Bearer ${jeton}`);
    expect(reponse.status).toBe(404);
  });

  it('journalise REPORT_DELETED', async () => {
    const rapport = await genererRapport({});
    await request(app)
      .delete(`/api/reports/${rapport.id}`)
      .set('Authorization', `Bearer ${jeton}`);

    const entree = etat.journal.find((e) => e.action === 'REPORT_DELETED');
    expect(entree?.userId).toBe(client.id);
    expect(entree?.entityId).toBe(rapport.id);
  });
});
