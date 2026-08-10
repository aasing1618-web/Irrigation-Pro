/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PROPRIÉTÉS DE SÉCURITÉ DE L'API D'ADMINISTRATION — Vague 3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le dashboard d'administration est le seul levier commercial du propriétaire :
 * il n'y a ni paiement automatique, ni licence, ni expiration. Un défaut ici ne
 * dégrade pas une fonctionnalité, il lui fait perdre le contrôle de son affaire.
 *
 * Ce fichier ne teste pas des routes une par une : il teste quatre propriétés
 * qui doivent tenir sur **toutes** les routes d'administration, sans exception,
 * et qui doivent continuer à tenir sur celles qu'on ajoutera plus tard.
 *
 *   1. L'empreinte du mot de passe ne sort jamais — y compris si le dépôt se
 *      remettait un jour à la ramener.
 *   2. Un compte CLIENT reçoit `404`, jamais `403`, sur chacune d'elles : un
 *      `403` lui apprendrait que le dashboard existe.
 *   3. Le mot de passe temporaire n'existe en clair qu'une fois, dans la
 *      réponse HTTP. Il n'entre dans aucun journal, sous aucune forme.
 *   4. Aucune route ne donne accès aux projets d'un client. La surface exposée
 *      est exactement celle du contrat, et rien d'autre.
 */

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { creerLigneUtilisateur, type LigneUtilisateur } from './helpers/comptes.js';
import {
  creerEtatAdmin,
  creerGestionnaireTransactions,
  creerLigneActivite,
  creerLigneProjetCompte,
  implementationsDepotsAdmin,
  type EtatAdmin,
} from './helpers/admin.js';

// --- Dépôts moqués -----------------------------------------------------------

const mockFindUserById = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockCreateUser = vi.fn();
const mockListUsers = vi.fn();
const mockCountUsers = vi.fn();
const mockGetUserForAdmin = vi.fn();
const mockUpdateUserProfile = vi.fn();
const mockSuspendUser = vi.fn();
const mockReactivateUser = vi.fn();
const mockResetUserPassword = vi.fn();
const mockLockActiveAdminIds = vi.fn();
const mockFindUserByIdForUpdate = vi.fn();

const mockRevokeAllUserTokens = vi.fn();

const mockLogAdminAction = vi.fn();
const mockListAdminActions = vi.fn();
const mockCountAdminActions = vi.fn();

const mockListActivityForUser = vi.fn();
const mockListRecentActivity = vi.fn();
const mockLogActivity = vi.fn();

const mockWithTransaction = vi.fn();

vi.mock('../src/db/repositories/users.repo.js', () => ({
  findUserById: (...a: unknown[]) => mockFindUserById(...a),
  findUserByEmail: (...a: unknown[]) => mockFindUserByEmail(...a),
  registerFailedLogin: vi.fn(),
  registerSuccessfulLogin: vi.fn(),
  updatePassword: vi.fn(),
  createUser: (...a: unknown[]) => mockCreateUser(...a),
  listUsers: (...a: unknown[]) => mockListUsers(...a),
  countUsers: (...a: unknown[]) => mockCountUsers(...a),
  getUserForAdmin: (...a: unknown[]) => mockGetUserForAdmin(...a),
  updateUserProfile: (...a: unknown[]) => mockUpdateUserProfile(...a),
  suspendUser: (...a: unknown[]) => mockSuspendUser(...a),
  reactivateUser: (...a: unknown[]) => mockReactivateUser(...a),
  resetUserPassword: (...a: unknown[]) => mockResetUserPassword(...a),
  lockActiveAdminIds: (...a: unknown[]) => mockLockActiveAdminIds(...a),
  findUserByIdForUpdate: (...a: unknown[]) => mockFindUserByIdForUpdate(...a),
}));

vi.mock('../src/db/repositories/refresh-tokens.repo.js', () => ({
  createRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllUserTokens: (...a: unknown[]) => mockRevokeAllUserTokens(...a),
}));

vi.mock('../src/db/repositories/admin-actions.repo.js', () => ({
  logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a),
  listAdminActions: (...a: unknown[]) => mockListAdminActions(...a),
  countAdminActions: (...a: unknown[]) => mockCountAdminActions(...a),
}));

vi.mock('../src/db/repositories/activity-logs.repo.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    listActivityForUser: (...a: unknown[]) => mockListActivityForUser(...a),
    listRecentActivity: (...a: unknown[]) => mockListRecentActivity(...a),
    logActivity: (...a: unknown[]) => mockLogActivity(...a),
  };
});

vi.mock('../src/db/index.js', () => ({
  checkDatabase: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
  query: vi.fn(),
  withTransaction: (...a: unknown[]) => mockWithTransaction(...a),
  closePool: vi.fn(),
  pool: {},
}));

const { createApp } = await import('../src/app.js');
const { adminRouter } = await import('../src/api/admin.routes.js');
const { hashPassword } = await import('../src/auth/password.js');
const { signAccessToken } = await import('../src/auth/tokens.js');

const app = createApp();

// ---------------------------------------------------------------------------
// Décor
// ---------------------------------------------------------------------------

/**
 * Empreinte volontairement reconnaissable : si un seul de ses fragments
 * apparaît dans une réponse, le test le voit.
 */
const EMPREINTE_MARQUEE = 'scrypt$65536$8$1$U0VMLU1BUlFVRQ==$RU1QUkVJTlRFLU1BUlFVRUUtQS1ORS1KQU1BSVMtU09SVElS';

let etat: EtatAdmin;
let depots: ReturnType<typeof implementationsDepotsAdmin>;
let empreinteAdmin: string;

let administrateur: LigneUtilisateur;
let client: LigneUtilisateur;
let cible: LigneUtilisateur;
let jetonAdmin: string;
let jetonClient: string;

beforeAll(async () => {
  empreinteAdmin = await hashPassword('mot-de-passe-de-test-tres-solide-2026');
}, 30_000);

/** (Re)branche les doublures. `options` permet de simuler un dépôt bavard. */
function brancherDepots(options: { fuiteEmpreinte?: boolean } = {}): void {
  const gestionnaire = creerGestionnaireTransactions();
  depots = implementationsDepotsAdmin(etat, {
    ...options,
    acquerirVerrouAdmins: gestionnaire.acquerirVerrouAdmins,
  });

  mockWithTransaction.mockImplementation(gestionnaire.withTransaction);
  mockFindUserById.mockImplementation(depots.findUserById);
  mockFindUserByEmail.mockImplementation(depots.findUserByEmail);
  mockCreateUser.mockImplementation(depots.createUser);
  mockListUsers.mockImplementation(depots.listUsers);
  mockCountUsers.mockImplementation(depots.countUsers);
  mockGetUserForAdmin.mockImplementation(depots.getUserForAdmin);
  mockUpdateUserProfile.mockImplementation(depots.updateUserProfile);
  mockSuspendUser.mockImplementation(depots.suspendUser);
  mockReactivateUser.mockImplementation(depots.reactivateUser);
  mockResetUserPassword.mockImplementation(depots.resetUserPassword);
  mockLockActiveAdminIds.mockImplementation(depots.lockActiveAdminIds);
  mockFindUserByIdForUpdate.mockImplementation(depots.findUserByIdForUpdate);
  mockRevokeAllUserTokens.mockImplementation(depots.revokeAllUserTokens);
  mockLogAdminAction.mockImplementation(depots.logAdminAction);
  mockListAdminActions.mockImplementation(depots.listAdminActions);
  mockCountAdminActions.mockImplementation(depots.countAdminActions);
  mockListActivityForUser.mockImplementation(depots.listActivityForUser);
  mockListRecentActivity.mockImplementation(depots.listRecentActivity);
  mockLogActivity.mockImplementation(depots.logActivity);
}

beforeEach(async () => {
  etat = creerEtatAdmin();
  brancherDepots();

  administrateur = creerLigneUtilisateur(empreinteAdmin, {
    email: 'proprietaire@irrigation-pro.sn',
    full_name: 'Propriétaire',
    role: 'ADMIN',
  });
  client = creerLigneUtilisateur(empreinteAdmin, {
    email: 'client-curieux@bureau.sn',
    full_name: 'Client curieux',
  });
  cible = creerLigneUtilisateur(EMPREINTE_MARQUEE, {
    email: 'cible@bureau.sn',
    full_name: 'Awa Ndiaye',
  });
  etat.utilisateurs.push(administrateur, client, cible);
  etat.projets.push(creerLigneProjetCompte(cible.id));
  etat.activites.push(creerLigneActivite(cible.id));

  jetonAdmin = await signAccessToken({ id: administrateur.id, role: 'ADMIN' });
  jetonClient = await signAccessToken({ id: client.id, role: 'CLIENT' });
});

// ---------------------------------------------------------------------------
// Le catalogue des routes d'administration — décrit une seule fois
// ---------------------------------------------------------------------------

interface RouteAdmin {
  nom: string;
  methode: 'get' | 'post' | 'patch';
  chemin: (id: string) => string;
  corps?: Record<string, unknown>;
  /** Statut attendu quand un administrateur légitime l'appelle. */
  succes: number;
}

const ROUTES_ADMIN: RouteAdmin[] = [
  { nom: 'GET /api/admin/users', methode: 'get', chemin: () => '/api/admin/users', succes: 200 },
  {
    nom: 'POST /api/admin/users',
    methode: 'post',
    chemin: () => '/api/admin/users',
    corps: { email: 'creation@bureau.sn', nomComplet: 'Compte créé' },
    succes: 201,
  },
  {
    nom: 'PATCH /api/admin/users/:id',
    methode: 'patch',
    chemin: (id) => `/api/admin/users/${id}`,
    corps: { nomComplet: 'Nom corrigé' },
    succes: 200,
  },
  {
    nom: 'POST /api/admin/users/:id/suspendre',
    methode: 'post',
    chemin: (id) => `/api/admin/users/${id}/suspendre`,
    corps: { motif: 'Impayé de 60 jours' },
    succes: 200,
  },
  {
    nom: 'POST /api/admin/users/:id/reactiver',
    methode: 'post',
    chemin: (id) => `/api/admin/users/${id}/reactiver`,
    corps: { motif: 'Paiement régularisé' },
    succes: 200,
  },
  {
    nom: 'POST /api/admin/users/:id/reinitialiser-mot-de-passe',
    methode: 'post',
    chemin: (id) => `/api/admin/users/${id}/reinitialiser-mot-de-passe`,
    succes: 200,
  },
  {
    nom: 'GET /api/admin/users/:id/activite',
    methode: 'get',
    chemin: (id) => `/api/admin/users/${id}/activite`,
    succes: 200,
  },
  {
    nom: 'GET /api/admin/activite',
    methode: 'get',
    chemin: () => '/api/admin/activite',
    succes: 200,
  },
];

function appeler(route: RouteAdmin, jeton: string, id: string): request.Test {
  const requete = request(app)
    [route.methode](route.chemin(id))
    .set('Authorization', `Bearer ${jeton}`);
  return route.corps ? requete.send(route.corps) : requete;
}

// ===========================================================================
// 1. L'empreinte du mot de passe ne sort jamais
// ===========================================================================

/** Tout ce qui, dans un corps de réponse, trahirait une empreinte. */
function verifierAucuneEmpreinte(texte: string, contexte: string): void {
  expect(texte, contexte).not.toContain(EMPREINTE_MARQUEE);
  // Fragments : une empreinte tronquée reste une fuite.
  expect(texte, contexte).not.toContain('U0VMLU1BUlFVRQ==');
  expect(texte, contexte).not.toContain('RU1QUkVJTlRFLU1BUlFVRUUt');
  expect(texte, contexte).not.toContain('scrypt$');
  expect(texte, contexte).not.toContain('password_hash');
  expect(texte, contexte).not.toContain('passwordHash');
  expect(texte, contexte).not.toContain('empreinte');
}

describe('l’empreinte du mot de passe ne sort par aucune route', () => {
  it('aucune réponse nominale ne contient d’empreinte', async () => {
    for (const route of ROUTES_ADMIN) {
      const reponse = await appeler(route, jetonAdmin, cible.id);

      expect(reponse.status, route.nom).toBe(route.succes);
      verifierAucuneEmpreinte(reponse.text, route.nom);
    }
  }, 30_000);

  it('même si le dépôt se remettait à ramener l’empreinte, `vueCompte` la retiendrait', async () => {
    // Deux barrières : le SQL qui ne sélectionne pas la colonne, et la vue qui
    // énumère les champs un par un. On coupe la première pour éprouver la
    // seconde — c'est elle qui protège le jour où quelqu'un écrira `SELECT *`.
    brancherDepots({ fuiteEmpreinte: true });

    for (const route of ROUTES_ADMIN) {
      const reponse = await appeler(route, jetonAdmin, cible.id);

      expect(reponse.status, route.nom).toBe(route.succes);
      verifierAucuneEmpreinte(reponse.text, `${route.nom} (dépôt bavard)`);
    }
  }, 30_000);

  it('aucune réponse d’erreur ne contient d’empreinte non plus', async () => {
    const erreurs = await Promise.all([
      appeler(ROUTES_ADMIN[0]!, jetonAdmin, cible.id).query({ limite: 'abc' }),
      request(app)
        .patch('/api/admin/users/pas-un-uuid')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ nomComplet: 'X' }),
      request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ email: cible.email, nomComplet: 'Doublon' }),
    ]);

    for (const reponse of erreurs) {
      expect(reponse.status).toBeGreaterThanOrEqual(400);
      verifierAucuneEmpreinte(reponse.text, `erreur ${reponse.status}`);
    }
  }, 20_000);
});

// ===========================================================================
// 2. Un compte CLIENT reçoit 404, jamais 403
// ===========================================================================

describe('un compte CLIENT ne doit pas apprendre que le dashboard existe', () => {
  for (const route of ROUTES_ADMIN) {
    it(`${route.nom} : 404 pour un CLIENT, jamais 403`, async () => {
      const reponse = await appeler(route, jetonClient, cible.id);

      expect(reponse.status).toBe(404);
      expect(reponse.body.error.code).toBe('NOT_FOUND');
      expect(reponse.status).not.toBe(403);
      expect(reponse.body.error.code).not.toBe('FORBIDDEN');
    });

    it(`${route.nom} : la réponse au CLIENT ne trahit rien`, async () => {
      const reponse = await appeler(route, jetonClient, cible.id);

      // Le message et le code sont ceux d'une URL inexistante, mot pour mot.
      expect(reponse.body.error.message).toBe('Cette ressource n’existe pas.');
      expect(reponse.body.error.code).toBe('NOT_FOUND');
      const message = String(reponse.body.error.message).toLowerCase();
      for (const indice of ['admin', 'rôle', 'role', 'droit', 'refus', 'autoris', 'privil']) {
        expect(message, `${route.nom} / ${indice}`).not.toContain(indice);
      }

      // `details.path` ne fait que renvoyer l'URL demandée : rien d'autre du
      // corps ne doit évoquer un refus de droit.
      const texte = reponse.text.toLowerCase();
      for (const indice of ['forbidden', 'droit', 'refus', 'autoris', 'privil']) {
        expect(texte, `${route.nom} / ${indice}`).not.toContain(indice);
      }

      // Aucune donnée du compte visé ne transparaît.
      expect(reponse.text).not.toContain(cible.email);
      expect(reponse.text).not.toContain('Awa Ndiaye');
    });

    it(`${route.nom} : aucun effet, aucun dépôt sollicité`, async () => {
      await appeler(route, jetonClient, cible.id);

      // La garde tranche avant tout : rien n'est lu, rien n'est écrit, rien
      // n'est journalisé.
      expect(mockListUsers).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockUpdateUserProfile).not.toHaveBeenCalled();
      expect(mockSuspendUser).not.toHaveBeenCalled();
      expect(mockReactivateUser).not.toHaveBeenCalled();
      expect(mockResetUserPassword).not.toHaveBeenCalled();
      expect(mockRevokeAllUserTokens).not.toHaveBeenCalled();
      expect(mockLogAdminAction).not.toHaveBeenCalled();
      expect(etat.actionsAdmin).toHaveLength(0);
      expect(cible.status).toBe('ACTIF');
    });
  }

  it('la réponse est indiscernable de celle d’une URL qui n’existe pas', async () => {
    const surRouteExistante = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${jetonClient}`);
    const surRouteInexistante = await request(app)
      .get('/api/admin/inexistante')
      .set('Authorization', `Bearer ${jetonClient}`);

    expect(surRouteExistante.status).toBe(surRouteInexistante.status);
    expect(surRouteExistante.body.error.code).toBe(surRouteInexistante.body.error.code);
    expect(surRouteExistante.body.error.message).toBe(surRouteInexistante.body.error.message);
  });

  it('le chemin renvoyé dans le 404 est celui qui a été demandé, comme partout ailleurs', async () => {
    // Un détail qui trahirait tout : si le 404 des routes d'administration
    // renvoyait un chemin tronqué (`/users`) là où le 404 ordinaire renvoie le
    // chemin complet, la seule forme de la réponse apprendrait qu'un routeur est
    // monté sous `/api/admin`.
    const admin404 = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${jetonClient}`);
    const ordinaire404 = await request(app)
      .get('/api/route-qui-nexiste-pas')
      .set('Authorization', `Bearer ${jetonClient}`);

    expect(admin404.body.error.details).toEqual({ method: 'GET', path: '/api/admin/users' });
    expect(ordinaire404.body.error.details).toEqual({
      method: 'GET',
      path: '/api/route-qui-nexiste-pas',
    });
  });

  it('les refus antérieurs au contrôle de rôle ne permettent pas d’énumérer les routes', async () => {
    // Un client qui doit encore changer son mot de passe temporaire est arrêté
    // par la garde d'authentification AVANT le contrôle de rôle : il reçoit donc
    // un 403 PASSWORD_CHANGE_REQUIRED, et non le 404 du contrat. Ce n'est pas
    // une fuite : il reçoit exactement la même chose sur une URL
    // d'administration qui n'existe pas, donc il n'apprend rien de la carte du
    // dashboard. C'est également le cas du 401 (jeton absent ou expiré), que le
    // dashboard doit conserver pour rafraîchir sa session.
    client.must_change_password = true;

    const surRouteExistante = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${jetonClient}`);
    const surRouteInexistante = await request(app)
      .get('/api/admin/rien-du-tout')
      .set('Authorization', `Bearer ${jetonClient}`);
    const horsAdministration = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${jetonClient}`);

    expect(surRouteExistante.status).toBe(403);
    expect(surRouteExistante.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(surRouteInexistante.status).toBe(surRouteExistante.status);
    expect(surRouteInexistante.body.error.code).toBe(surRouteExistante.body.error.code);
    expect(horsAdministration.body.error.code).toBe(surRouteExistante.body.error.code);
  });

  it('un compte suspendu et un jeton absent gardent leurs codes propres', async () => {
    // Le dashboard a besoin du 401 pour rafraîchir sa session, et l'application
    // cliente du 403 ACCOUNT_SUSPENDED pour savoir quoi afficher : ces deux
    // refus-là ne sont pas traduits en 404.
    const sansJeton = await request(app).get('/api/admin/users');
    administrateur.status = 'SUSPENDU';
    const suspendu = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${jetonAdmin}`);

    expect(sansJeton.status).toBe(401);
    expect(suspendu.status).toBe(403);
    expect(suspendu.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

// ===========================================================================
// 3. Le mot de passe temporaire n'existe en clair qu'une fois
// ===========================================================================

describe('le mot de passe temporaire n’existe en clair que dans la réponse HTTP', () => {
  /** Tout ce qui a été écrit ou transmis à un journal, en un seul texte. */
  function toutCeQuiAEteJournalise(): string {
    return JSON.stringify({
      adminActions: etat.actionsAdmin,
      activityLogs: etat.activites,
      appelsLogAdminAction: mockLogAdminAction.mock.calls,
      appelsLogActivity: mockLogActivity.mock.calls,
      comptesEnBase: etat.utilisateurs,
    });
  }

  it('à la création : absent de admin_actions, d’activity_logs, de metadata et de la base', async () => {
    const reponse = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({ email: 'nouveau@bureau.sn', nomComplet: 'Moussa Fall' });

    expect(reponse.status).toBe(201);
    const motDePasse = reponse.body.motDePasseTemporaire as string;
    expect(motDePasse).toBeTruthy();

    const journaux = toutCeQuiAEteJournalise();
    expect(journaux).not.toContain(motDePasse);
    // « Sous aucune forme, même partielle » : aucun des blocs non plus.
    for (const bloc of motDePasse.split('-')) {
      expect(journaux, `bloc ${bloc}`).not.toContain(bloc);
    }

    // Une trace a bien été écrite — le test ne passe pas parce qu'il n'y a rien.
    expect(etat.actionsAdmin).toHaveLength(1);
    expect(etat.actionsAdmin[0]!.action).toBe('CREATE_ACCOUNT');
  }, 20_000);

  it('à la réinitialisation : même exigence', async () => {
    const reponse = await request(app)
      .post(`/api/admin/users/${cible.id}/reinitialiser-mot-de-passe`)
      .set('Authorization', `Bearer ${jetonAdmin}`);

    expect(reponse.status).toBe(200);
    const motDePasse = reponse.body.motDePasseTemporaire as string;

    const journaux = toutCeQuiAEteJournalise();
    expect(journaux).not.toContain(motDePasse);
    for (const bloc of motDePasse.split('-')) {
      expect(journaux, `bloc ${bloc}`).not.toContain(bloc);
    }
    expect(etat.actionsAdmin[0]!.action).toBe('RESET_PASSWORD');
  }, 20_000);

  it('il n’est réaffichable par aucune route : la fiche du compte ne le contient pas', async () => {
    const creation = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({ email: 'nouveau2@bureau.sn', nomComplet: 'Compte neuf' });
    const motDePasse = creation.body.motDePasseTemporaire as string;
    const idCree = creation.body.compte.id as string;

    // On repasse ensuite par toutes les lectures : aucune ne le rend.
    const relectures = await Promise.all([
      request(app).get('/api/admin/users').set('Authorization', `Bearer ${jetonAdmin}`),
      request(app)
        .get(`/api/admin/users/${idCree}/activite`)
        .set('Authorization', `Bearer ${jetonAdmin}`),
      request(app).get('/api/admin/activite').set('Authorization', `Bearer ${jetonAdmin}`),
    ]);

    for (const reponse of relectures) {
      expect(reponse.status).toBe(200);
      expect(reponse.text).not.toContain(motDePasse);
    }
  }, 20_000);
});

// ===========================================================================
// 4. Aucune route ne donne accès aux projets d'un client
// ===========================================================================

describe('le dashboard gère des comptes, jamais des données métier', () => {
  /** Les chemins réellement déclarés sur le routeur d'administration. */
  function cheminsDeclares(): string[] {
    const couches = adminRouter.stack as { route?: { path?: unknown } }[];
    const chemins = couches
      .filter((couche) => couche.route !== undefined)
      .map((couche) => String(couche.route?.path));
    return [...new Set(chemins)].sort();
  }

  it('la surface exposée est exactement celle du contrat', async () => {
    expect(cheminsDeclares()).toEqual([
      '/activite',
      '/users',
      '/users/:id',
      '/users/:id/activite',
      '/users/:id/reactiver',
      '/users/:id/reinitialiser-mot-de-passe',
      '/users/:id/suspendre',
    ]);
  });

  it('aucun chemin ne mène à un projet, un calcul ou un rapport', async () => {
    for (const chemin of cheminsDeclares()) {
      expect(chemin, chemin).not.toMatch(/projet|project|calcul|rapport|report|fichier|data/i);
    }
  });

  it('les URL qu’un développeur pressé aurait pu ajouter n’existent pas', async () => {
    const tentatives = [
      `/api/admin/users/${cible.id}/projets`,
      `/api/admin/users/${cible.id}/projects`,
      `/api/admin/users/${cible.id}/calculs`,
      `/api/admin/users/${cible.id}/rapports`,
      '/api/admin/projets',
      '/api/admin/projects',
    ];

    for (const url of tentatives) {
      const reponse = await request(app).get(url).set('Authorization', `Bearer ${jetonAdmin}`);
      expect(reponse.status, url).toBe(404);
    }
  });

  it('des projets du client, l’administrateur ne voit qu’un compteur', async () => {
    etat.projets.push(creerLigneProjetCompte(cible.id), creerLigneProjetCompte(cible.id));

    const liste = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${jetonAdmin}`);
    const fiche = await request(app)
      .get(`/api/admin/users/${cible.id}/activite`)
      .set('Authorization', `Bearer ${jetonAdmin}`);

    const compte = (liste.body.comptes as Record<string, unknown>[]).find(
      (c) => c['id'] === cible.id,
    )!;
    expect(compte['nombreProjets']).toBe(3);
    expect(fiche.body.compte.nombreProjets).toBe(3);

    // Ni identifiant, ni nom, ni contenu de projet nulle part.
    for (const projet of etat.projets) {
      expect(liste.text, projet.id).not.toContain(projet.id);
      expect(fiche.text, projet.id).not.toContain(projet.id);
    }
  });
});
