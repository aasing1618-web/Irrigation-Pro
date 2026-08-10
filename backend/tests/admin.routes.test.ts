/**
 * Tests des routes d'administration — **Vague 3**, contrat `docs/API-VAGUE-3.md` § 2.
 *
 * Ce fichier couvre le comportement nominal de chaque route, les entrées
 * invalides, les conflits, et les garde-fous d'auto-verrouillage. Les propriétés
 * transversales de sécurité (empreinte qui ne sort jamais, `404` et non `403`
 * pour un compte CLIENT, mot de passe temporaire absent de tout journal, absence
 * de toute route donnant accès aux projets) sont dans `admin.securite.test.ts`.
 *
 * Aucun PostgreSQL : les dépôts sont remplacés par un état en mémoire
 * (`tests/helpers/admin.ts`), fidèle au SQL réel — en particulier, les lectures
 * « publiques » ne ramènent pas `password_hash`, comme le vrai `SELECT`.
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
  UUID_ABSENT,
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
  // Utilisées par l'authentification (Vague 1) : la garde relit le compte.
  findUserById: (...a: unknown[]) => mockFindUserById(...a),
  findUserByEmail: (...a: unknown[]) => mockFindUserByEmail(...a),
  registerFailedLogin: vi.fn(),
  registerSuccessfulLogin: vi.fn(),
  updatePassword: vi.fn(),
  // Administration (Vague 3).
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

// `assainirMetadata` reste la VRAIE fonction : le contrat exige que le filtre
// défensif de la Vague 1 s'applique encore à la lecture du journal.
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
const { hashPassword, verifyPassword } = await import('../src/auth/password.js');
const { signAccessToken } = await import('../src/auth/tokens.js');

const app = createApp();

// ---------------------------------------------------------------------------

let etat: EtatAdmin;
let depots: ReturnType<typeof implementationsDepotsAdmin>;
let empreinte: string;

let administrateur: LigneUtilisateur;
let secondAdministrateur: LigneUtilisateur;
let cible: LigneUtilisateur;
let jetonAdmin: string;

beforeAll(async () => {
  empreinte = await hashPassword('mot-de-passe-de-test-tres-solide-2026');
}, 30_000);

beforeEach(async () => {
  etat = creerEtatAdmin();
  const gestionnaire = creerGestionnaireTransactions();
  depots = implementationsDepotsAdmin(etat, {
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

  administrateur = creerLigneUtilisateur(empreinte, {
    email: 'proprietaire@irrigation-pro.sn',
    full_name: 'Propriétaire',
    role: 'ADMIN',
  });
  secondAdministrateur = creerLigneUtilisateur(empreinte, {
    email: 'associe@irrigation-pro.sn',
    full_name: 'Associé',
    role: 'ADMIN',
  });
  cible = creerLigneUtilisateur(empreinte, {
    email: 'client@bureau-etudes.sn',
    full_name: 'Awa Ndiaye',
    company: 'Hydro Sahel',
  });
  etat.utilisateurs.push(administrateur, secondAdministrateur, cible);

  jetonAdmin = await signAccessToken({ id: administrateur.id, role: 'ADMIN' });
});

/** Requête émise par le propriétaire. */
function commeAdmin(requete: request.Test): request.Test {
  return requete.set('Authorization', `Bearer ${jetonAdmin}`);
}

/** Ouvre une session longue pour un compte, sans passer par `/login`. */
function ajouterSession(compte: LigneUtilisateur, marqueur = 'a'): void {
  etat.jetons.push({
    id: `jeton-${etat.jetons.length + 1}`,
    user_id: compte.id,
    token_hash: `empreinte-${compte.id}-${marqueur}`,
    expires_at: new Date(Date.now() + 86_400_000),
    revoked_at: null,
    revoked_reason: null,
    user_agent: 'Irrigation Pro Desktop',
    created_at: new Date(),
  });
}

// ===========================================================================
// GET /api/admin/users
// ===========================================================================

describe('GET /api/admin/users — liste des comptes', () => {
  it('renvoie les comptes et le total, avec exactement les champs du contrat', async () => {
    etat.projets.push(creerLigneProjetCompte(cible.id), creerLigneProjetCompte(cible.id));
    cible.last_login_at = new Date('2026-02-01T10:30:00.000Z');

    const reponse = await commeAdmin(request(app).get('/api/admin/users'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(3);
    expect(reponse.body.comptes).toHaveLength(3);

    const compte = (reponse.body.comptes as Record<string, unknown>[]).find(
      (c) => c['id'] === cible.id,
    );
    expect(compte).toMatchObject({
      id: cible.id,
      email: cible.email,
      nomComplet: 'Awa Ndiaye',
      societe: 'Hydro Sahel',
      role: 'CLIENT',
      statut: 'ACTIF',
      doitChangerMotDePasse: false,
      derniereConnexion: '2026-02-01T10:30:00.000Z',
      nombreProjets: 2,
    });
    expect(typeof compte!['creeLe']).toBe('string');
  });

  it('`nombreProjets` est un compteur : jamais le contenu des projets', async () => {
    etat.projets.push(creerLigneProjetCompte(cible.id));

    const reponse = await commeAdmin(request(app).get('/api/admin/users'));
    const compte = (reponse.body.comptes as Record<string, unknown>[]).find(
      (c) => c['id'] === cible.id,
    );

    expect(compte!['nombreProjets']).toBe(1);
    expect(compte).not.toHaveProperty('projets');
    expect(compte).not.toHaveProperty('projects');
  });

  it('filtre par statut', async () => {
    cible.status = 'SUSPENDU';

    const reponse = await commeAdmin(request(app).get('/api/admin/users?statut=SUSPENDU'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(1);
    expect(reponse.body.comptes.map((c: { id: string }) => c.id)).toEqual([cible.id]);
  });

  it('filtre par rôle', async () => {
    const reponse = await commeAdmin(request(app).get('/api/admin/users?role=ADMIN'));

    expect(reponse.body.total).toBe(2);
    expect(reponse.body.comptes.every((c: { role: string }) => c.role === 'ADMIN')).toBe(true);
  });

  it('cherche dans l’e-mail, le nom et la société', async () => {
    const parSociete = await commeAdmin(request(app).get('/api/admin/users?recherche=Hydro'));
    const parNom = await commeAdmin(request(app).get('/api/admin/users?recherche=Awa'));

    expect(parSociete.body.total).toBe(1);
    expect(parNom.body.total).toBe(1);
    expect(parSociete.body.comptes[0].id).toBe(cible.id);
  });

  it('pagine sans fausser le total', async () => {
    const premiere = await commeAdmin(request(app).get('/api/admin/users?limite=2&depuis=0'));
    const seconde = await commeAdmin(request(app).get('/api/admin/users?limite=2&depuis=2'));

    expect(premiere.body.comptes).toHaveLength(2);
    expect(seconde.body.comptes).toHaveLength(1);
    // `total` porte sur l'ensemble, pas sur la page : sans cela, pas de pagination.
    expect(premiere.body.total).toBe(3);
    expect(seconde.body.total).toBe(3);
  });

  it('refuse les filtres invalides en 400', async () => {
    for (const requete of [
      '/api/admin/users?statut=INCONNU',
      '/api/admin/users?role=SUPERADMIN',
      '/api/admin/users?limite=0',
      '/api/admin/users?limite=201',
      '/api/admin/users?limite=abc',
      '/api/admin/users?depuis=-1',
    ]) {
      const reponse = await commeAdmin(request(app).get(requete));
      expect(reponse.status, requete).toBe(400);
      expect(reponse.body.error.code, requete).toBe('VALIDATION_ERROR');
    }
  });
});

// ===========================================================================
// POST /api/admin/users
// ===========================================================================

describe('POST /api/admin/users — créer un compte', () => {
  const nouveau = { email: 'nouveau@bureau.sn', nomComplet: 'Moussa Fall' };

  it('crée le compte, renvoie le mot de passe temporaire une fois, et n’en stocke que l’empreinte', async () => {
    const reponse = await commeAdmin(request(app).post('/api/admin/users')).send({
      ...nouveau,
      societe: 'Fall Ingénierie',
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.compte).toMatchObject({
      email: 'nouveau@bureau.sn',
      nomComplet: 'Moussa Fall',
      societe: 'Fall Ingénierie',
      role: 'CLIENT',
      statut: 'ACTIF',
      doitChangerMotDePasse: true,
      nombreProjets: 0,
    });

    const motDePasse = reponse.body.motDePasseTemporaire as string;
    expect(typeof motDePasse).toBe('string');
    expect(motDePasse.length).toBeGreaterThan(15);

    const cree = etat.utilisateurs.find((u) => u.email === 'nouveau@bureau.sn');
    expect(cree).toBeDefined();
    // Seule l'empreinte est en base — et c'est bien celle du mot de passe rendu.
    expect(cree!.password_hash).not.toContain(motDePasse);
    expect(await verifyPassword(motDePasse, cree!.password_hash)).toBe(true);
    expect(cree!.must_change_password).toBe(true);
  }, 20_000);

  it('normalise l’adresse (casse et espaces) et accepte le rôle ADMIN', async () => {
    const reponse = await commeAdmin(request(app).post('/api/admin/users')).send({
      email: '  NOUVEL.ADMIN@Irrigation-Pro.SN ',
      nomComplet: 'Second propriétaire',
      role: 'ADMIN',
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.compte.email).toBe('nouvel.admin@irrigation-pro.sn');
    expect(reponse.body.compte.role).toBe('ADMIN');
  }, 20_000);

  it('journalise CREATE_ACCOUNT sous l’auteur, avec le compte visé', async () => {
    const reponse = await commeAdmin(request(app).post('/api/admin/users')).send(nouveau);

    expect(etat.actionsAdmin).toHaveLength(1);
    expect(etat.actionsAdmin[0]).toMatchObject({
      admin_id: administrateur.id,
      target_user_id: reponse.body.compte.id,
      action: 'CREATE_ACCOUNT',
    });
  }, 20_000);

  it('refuse une adresse déjà utilisée en 409 EMAIL_DEJA_UTILISE', async () => {
    const reponse = await commeAdmin(request(app).post('/api/admin/users')).send({
      email: cible.email.toUpperCase(),
      nomComplet: 'Doublon',
    });

    expect(reponse.status).toBe(409);
    expect(reponse.body.error.code).toBe('EMAIL_DEJA_UTILISE');
    expect(etat.utilisateurs).toHaveLength(3);
    expect(etat.actionsAdmin).toHaveLength(0);
  }, 20_000);

  it('traduit aussi la violation d’unicité de la base en 409 (deux créations simultanées)', async () => {
    // La lecture préalable ne voit rien : c'est l'index unique qui tranche.
    mockFindUserByEmail.mockResolvedValueOnce(null);

    const reponse = await commeAdmin(request(app).post('/api/admin/users')).send({
      email: cible.email,
      nomComplet: 'Doublon simultané',
    });

    expect(reponse.status).toBe(409);
    expect(reponse.body.error.code).toBe('EMAIL_DEJA_UTILISE');
    // Aucun détail technique PostgreSQL ne remonte au dashboard.
    expect(reponse.text).not.toContain('23505');
    expect(reponse.text).not.toContain('constraint');
  }, 20_000);

  it('refuse les entrées invalides en 400', async () => {
    const corpsRefuses = [
      {},
      { nomComplet: 'Sans adresse' },
      { email: 'pas-une-adresse', nomComplet: 'X' },
      { email: 'a@b.sn' },
      { email: 'a@b.sn', nomComplet: '   ' },
      { email: 'a@b.sn', nomComplet: 'X', role: 'SUPERADMIN' },
      { email: 'a@b.sn', nomComplet: 'X'.repeat(200) },
    ];

    for (const corps of corpsRefuses) {
      const reponse = await commeAdmin(request(app).post('/api/admin/users')).send(corps);
      expect(reponse.status, JSON.stringify(corps)).toBe(400);
      expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    }

    expect(etat.utilisateurs).toHaveLength(3);
  });
});

// ===========================================================================
// PATCH /api/admin/users/:id
// ===========================================================================

describe('PATCH /api/admin/users/:id — modifier un compte', () => {
  it('modifie le nom, la société et le rôle', async () => {
    const reponse = await commeAdmin(request(app).patch(`/api/admin/users/${cible.id}`)).send({
      nomComplet: 'Awa Ndiaye Sow',
      societe: 'Hydro Sahel SARL',
      role: 'ADMIN',
    });

    expect(reponse.status).toBe(200);
    expect(reponse.body.compte).toMatchObject({
      nomComplet: 'Awa Ndiaye Sow',
      societe: 'Hydro Sahel SARL',
      role: 'ADMIN',
    });
    expect(cible.role).toBe('ADMIN');
  });

  it('efface la société avec `null`', async () => {
    const reponse = await commeAdmin(request(app).patch(`/api/admin/users/${cible.id}`)).send({
      societe: null,
    });

    expect(reponse.status).toBe(200);
    expect(reponse.body.compte.societe).toBeNull();
    expect(cible.company).toBeNull();
  });

  it('n’expose ni ne modifie l’e-mail — c’est l’identifiant de connexion', async () => {
    const seul = await commeAdmin(request(app).patch(`/api/admin/users/${cible.id}`)).send({
      email: 'usurpation@ailleurs.sn',
    });

    // Clé inconnue retirée par zod : le corps devient vide, donc refusé — et on
    // n'apprend pas au passage quels champs existent.
    expect(seul.status).toBe(400);
    expect(seul.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(seul.body)).not.toContain('email');

    const avecChampValide = await commeAdmin(
      request(app).patch(`/api/admin/users/${cible.id}`),
    ).send({ nomComplet: 'Awa N.', email: 'usurpation@ailleurs.sn' });

    expect(avecChampValide.status).toBe(200);
    expect(cible.email).toBe('client@bureau-etudes.sn');
  });

  it('ne modifie pas le statut — il a sa propre route, parce qu’il exige un motif', async () => {
    const reponse = await commeAdmin(request(app).patch(`/api/admin/users/${cible.id}`)).send({
      statut: 'SUSPENDU',
    });

    expect(reponse.status).toBe(400);
    expect(cible.status).toBe('ACTIF');
  });

  it('refuse un corps vide', async () => {
    const reponse = await commeAdmin(request(app).patch(`/api/admin/users/${cible.id}`)).send({});

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('renvoie 404 sur un compte inexistant et 400 sur un identifiant mal formé', async () => {
    const inexistant = await commeAdmin(
      request(app).patch(`/api/admin/users/${UUID_ABSENT}`),
    ).send({ nomComplet: 'Fantôme' });
    const malForme = await commeAdmin(request(app).patch('/api/admin/users/pas-un-uuid')).send({
      nomComplet: 'Fantôme',
    });

    expect(inexistant.status).toBe(404);
    expect(inexistant.body.error.code).toBe('NOT_FOUND');
    expect(malForme.status).toBe(400);
    expect(malForme.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('journalise UPDATE_ACCOUNT avec les champs touchés et le changement de rôle', async () => {
    await commeAdmin(request(app).patch(`/api/admin/users/${cible.id}`)).send({
      nomComplet: 'Awa N.',
      role: 'ADMIN',
    });

    expect(etat.actionsAdmin).toHaveLength(1);
    const trace = etat.actionsAdmin[0]!;
    expect(trace.action).toBe('UPDATE_ACCOUNT');
    expect(trace.admin_id).toBe(administrateur.id);
    expect(trace.target_user_id).toBe(cible.id);
    expect(trace.metadata).toMatchObject({ ancienRole: 'CLIENT', nouveauRole: 'ADMIN' });
    expect((trace.metadata as { champs: string[] }).champs).toContain('nomComplet');
  });
});

// ===========================================================================
// POST /api/admin/users/:id/suspendre
// ===========================================================================

describe('POST /api/admin/users/:id/suspendre', () => {
  it('suspend le compte, révoque TOUTES ses sessions avec le motif ADMIN, et le journalise', async () => {
    ajouterSession(cible, 'poste-bureau');
    ajouterSession(cible, 'portable');
    ajouterSession(secondAdministrateur, 'autre-compte');

    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${cible.id}/suspendre`),
    ).send({ motif: 'Facture impayée depuis 60 jours' });

    expect(reponse.status).toBe(200);
    expect(reponse.body.compte.statut).toBe('SUSPENDU');
    expect(cible.status).toBe('SUSPENDU');

    // Sans révocation, le client garderait sa session : la suspension ne serait
    // pas immédiate, et c'est le seul levier commercial du propriétaire.
    const sessionsCible = etat.jetons.filter((j) => j.user_id === cible.id);
    expect(sessionsCible).toHaveLength(2);
    for (const session of sessionsCible) {
      expect(session.revoked_at).not.toBeNull();
      expect(session.revoked_reason).toBe('ADMIN');
    }
    expect(reponse.body.sessionsRevoquees).toBe(2);
    expect(mockRevokeAllUserTokens).toHaveBeenCalledWith(cible.id, 'ADMIN');

    // Les sessions des autres comptes ne sont pas touchées.
    const autre = etat.jetons.find((j) => j.user_id === secondAdministrateur.id)!;
    expect(autre.revoked_at).toBeNull();

    expect(etat.actionsAdmin).toHaveLength(1);
    expect(etat.actionsAdmin[0]).toMatchObject({
      action: 'SUSPEND',
      admin_id: administrateur.id,
      target_user_id: cible.id,
      reason: 'Facture impayée depuis 60 jours',
    });
  });

  it('exige un motif : absent, vide ou dérisoire → 400, sans rien changer', async () => {
    for (const corps of [{}, { motif: '' }, { motif: '   ' }, { motif: '.' }, { motif: 'ab' }]) {
      const reponse = await commeAdmin(
        request(app).post(`/api/admin/users/${cible.id}/suspendre`),
      ).send(corps);

      expect(reponse.status, JSON.stringify(corps)).toBe(400);
      expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    }

    expect(cible.status).toBe('ACTIF');
    expect(etat.actionsAdmin).toHaveLength(0);
    expect(mockRevokeAllUserTokens).not.toHaveBeenCalled();
  });

  it('renvoie 404 sur un compte inexistant, 400 sur un identifiant mal formé', async () => {
    const inexistant = await commeAdmin(
      request(app).post(`/api/admin/users/${UUID_ABSENT}/suspendre`),
    ).send({ motif: 'Test' });
    const malForme = await commeAdmin(
      request(app).post('/api/admin/users/12345/suspendre'),
    ).send({ motif: 'Test' });

    expect(inexistant.status).toBe(404);
    expect(malForme.status).toBe(400);
    expect(mockRevokeAllUserTokens).not.toHaveBeenCalled();
  });

  it('reste cohérent quand le compte n’a aucune session ouverte', async () => {
    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${cible.id}/suspendre`),
    ).send({ motif: 'Fin de contrat' });

    expect(reponse.status).toBe(200);
    expect(reponse.body.sessionsRevoquees).toBe(0);
  });
});

// ===========================================================================
// POST /api/admin/users/:id/reactiver
// ===========================================================================

describe('POST /api/admin/users/:id/reactiver', () => {
  it('réactive, remet le compteur d’échecs à zéro et lève le verrou', async () => {
    cible.status = 'SUSPENDU';
    cible.failed_login_attempts = 5;
    cible.locked_until = new Date(Date.now() + 3_600_000);

    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${cible.id}/reactiver`),
    ).send({ motif: 'Paiement régularisé' });

    expect(reponse.status).toBe(200);
    expect(reponse.body.compte.statut).toBe('ACTIF');
    expect(cible.status).toBe('ACTIF');
    expect(cible.failed_login_attempts).toBe(0);
    expect(cible.locked_until).toBeNull();

    expect(etat.actionsAdmin[0]).toMatchObject({
      action: 'REACTIVATE',
      reason: 'Paiement régularisé',
    });
  });

  it('ne rouvre aucune session : le client se reconnecte', async () => {
    cible.status = 'SUSPENDU';
    ajouterSession(cible);
    etat.jetons[0]!.revoked_at = new Date();
    etat.jetons[0]!.revoked_reason = 'ADMIN';

    await commeAdmin(request(app).post(`/api/admin/users/${cible.id}/reactiver`)).send({
      motif: 'Reprise de la collaboration',
    });

    expect(etat.jetons[0]!.revoked_at).not.toBeNull();
    expect(mockRevokeAllUserTokens).not.toHaveBeenCalled();
  });

  it('exige un motif', async () => {
    cible.status = 'SUSPENDU';

    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${cible.id}/reactiver`),
    ).send({});

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    expect(cible.status).toBe('SUSPENDU');
  });

  it('renvoie 404 sur un compte inexistant', async () => {
    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${UUID_ABSENT}/reactiver`),
    ).send({ motif: 'Test' });

    expect(reponse.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/admin/users/:id/reinitialiser-mot-de-passe
// ===========================================================================

describe('POST /api/admin/users/:id/reinitialiser-mot-de-passe', () => {
  it('tire un nouveau mot de passe, repose l’obligation de changement et révoque les sessions', async () => {
    ajouterSession(cible, 'poste-vole');
    ajouterSession(cible, 'portable');
    const empreinteAvant = cible.password_hash;

    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${cible.id}/reinitialiser-mot-de-passe`),
    );

    expect(reponse.status).toBe(200);
    const motDePasse = reponse.body.motDePasseTemporaire as string;
    expect(typeof motDePasse).toBe('string');

    // Nouvelle empreinte, correspondant au mot de passe rendu une seule fois.
    expect(cible.password_hash).not.toBe(empreinteAvant);
    expect(await verifyPassword(motDePasse, cible.password_hash)).toBe(true);

    expect(cible.must_change_password).toBe(true);
    expect(reponse.body.compte.doitChangerMotDePasse).toBe(true);

    // Sans révocation, un appareil resté connecté continuerait de travailler
    // avec l'ancien mot de passe qu'on vient précisément de remplacer.
    for (const session of etat.jetons) {
      expect(session.revoked_at).not.toBeNull();
      expect(session.revoked_reason).toBe('ADMIN');
    }
    expect(reponse.body.sessionsRevoquees).toBe(2);
    expect(mockRevokeAllUserTokens).toHaveBeenCalledWith(cible.id, 'ADMIN');

    expect(etat.actionsAdmin[0]).toMatchObject({
      action: 'RESET_PASSWORD',
      admin_id: administrateur.id,
      target_user_id: cible.id,
    });
  }, 20_000);

  it('renvoie 404 sur un compte inexistant, sans rien révoquer', async () => {
    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${UUID_ABSENT}/reinitialiser-mot-de-passe`),
    );

    expect(reponse.status).toBe(404);
    expect(mockRevokeAllUserTokens).not.toHaveBeenCalled();
  }, 20_000);

  it('refuse un identifiant mal formé en 400', async () => {
    const reponse = await commeAdmin(
      request(app).post('/api/admin/users/xyz/reinitialiser-mot-de-passe'),
    );

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ===========================================================================
// Journaux
// ===========================================================================

describe('GET /api/admin/users/:id/activite — fiche d’un compte', () => {
  it('renvoie le compte, son activité et les décisions le concernant', async () => {
    etat.activites.push(
      creerLigneActivite(cible.id, { action: 'LOGIN_SUCCESS' }),
      creerLigneActivite(cible.id, { action: 'PROJECT_CREATED', entity_type: 'project' }),
      creerLigneActivite(secondAdministrateur.id, { action: 'LOGIN_SUCCESS' }),
    );
    await commeAdmin(request(app).post(`/api/admin/users/${cible.id}/suspendre`)).send({
      motif: 'Impayé',
    });

    const reponse = await commeAdmin(request(app).get(`/api/admin/users/${cible.id}/activite`));

    expect(reponse.status).toBe(200);
    expect(reponse.body.compte.id).toBe(cible.id);
    expect(reponse.body.activites).toHaveLength(2);
    expect(reponse.body.activites.every((a: { compteId: string }) => a.compteId === cible.id)).toBe(
      true,
    );
    expect(reponse.body.actionsAdmin).toHaveLength(1);
    expect(reponse.body.actionsAdmin[0]).toMatchObject({
      action: 'SUSPEND',
      motif: 'Impayé',
      auteurId: administrateur.id,
    });
    expect(reponse.body.totalActionsAdmin).toBe(1);
  });

  it('le filtre défensif de la Vague 1 s’applique encore à la lecture', async () => {
    // Une ligne écrite avant le filtre, ou par un appelant distrait, ne doit pas
    // remonter jusqu'au dashboard avec son secret.
    etat.activites.push(
      creerLigneActivite(cible.id, {
        action: 'LOGIN_FAILED',
        metadata: { tentatives: 2, password: 'Soleil123', session: { refreshToken: 'abc' } },
      }),
    );

    const reponse = await commeAdmin(request(app).get(`/api/admin/users/${cible.id}/activite`));

    expect(reponse.status).toBe(200);
    expect(reponse.text).not.toContain('Soleil123');
    expect(reponse.text).not.toContain('abc');
    expect(reponse.body.activites[0].contexte).toMatchObject({
      tentatives: 2,
      password: '[retiré]',
    });
  });

  it('pagine et refuse les paramètres invalides', async () => {
    for (let index = 0; index < 5; index += 1) {
      etat.activites.push(creerLigneActivite(cible.id));
    }

    const page = await commeAdmin(
      request(app).get(`/api/admin/users/${cible.id}/activite?limite=2&depuis=2`),
    );
    const invalide = await commeAdmin(
      request(app).get(`/api/admin/users/${cible.id}/activite?limite=999`),
    );

    expect(page.status).toBe(200);
    expect(page.body.activites).toHaveLength(2);
    expect(invalide.status).toBe(400);
  });

  it('renvoie 404 sur un compte inexistant', async () => {
    const reponse = await commeAdmin(request(app).get(`/api/admin/users/${UUID_ABSENT}/activite`));

    expect(reponse.status).toBe(404);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/admin/activite — accueil du dashboard', () => {
  it('renvoie l’activité récente, les décisions et les compteurs', async () => {
    cible.status = 'SUSPENDU';
    etat.activites.push(
      creerLigneActivite(cible.id, { action: 'LOGIN_BLOCKED_SUSPENDED' }),
      creerLigneActivite(null, { action: 'LOGIN_FAILED' }),
    );

    const reponse = await commeAdmin(request(app).get('/api/admin/activite'));

    expect(reponse.status).toBe(200);
    expect(reponse.body.activites).toHaveLength(2);
    expect(reponse.body.statistiques).toEqual({
      comptes: 3,
      comptesActifs: 2,
      comptesSuspendus: 1,
    });
  });

  it('refuse une limite hors bornes', async () => {
    const reponse = await commeAdmin(request(app).get('/api/admin/activite?limite=0'));

    expect(reponse.status).toBe(400);
  });
});

// ===========================================================================
// Garde-fous d'auto-verrouillage — § 2 « Garde-fous non négociables »
// ===========================================================================

describe('garde-fous : le propriétaire ne peut pas s’enfermer dehors', () => {
  it('un administrateur ne peut pas se suspendre lui-même → 409 ACTION_IMPOSSIBLE', async () => {
    ajouterSession(administrateur);

    const reponse = await commeAdmin(
      request(app).post(`/api/admin/users/${administrateur.id}/suspendre`),
    ).send({ motif: 'Erreur de manipulation' });

    expect(reponse.status).toBe(409);
    expect(reponse.body.error.code).toBe('ACTION_IMPOSSIBLE');
    // Le message doit dire POURQUOI : sans inscription libre, l'erreur serait
    // sans recours.
    expect(reponse.body.error.message.length).toBeGreaterThan(30);

    expect(administrateur.status).toBe('ACTIF');
    expect(etat.actionsAdmin).toHaveLength(0);
    expect(mockRevokeAllUserTokens).not.toHaveBeenCalled();
    expect(etat.jetons[0]!.revoked_at).toBeNull();
  });

  it('un administrateur ne peut pas retirer son propre rôle ADMIN → 409', async () => {
    const reponse = await commeAdmin(
      request(app).patch(`/api/admin/users/${administrateur.id}`),
    ).send({ role: 'CLIENT' });

    expect(reponse.status).toBe(409);
    expect(reponse.body.error.code).toBe('ACTION_IMPOSSIBLE');
    expect(administrateur.role).toBe('ADMIN');
    expect(etat.actionsAdmin).toHaveLength(0);
  });

  it('mais il peut modifier son propre nom, et se « promouvoir » ADMIN sans effet', async () => {
    const nom = await commeAdmin(request(app).patch(`/api/admin/users/${administrateur.id}`)).send({
      nomComplet: 'Propriétaire — nom réel',
    });
    const memeRole = await commeAdmin(
      request(app).patch(`/api/admin/users/${administrateur.id}`),
    ).send({ role: 'ADMIN' });

    expect(nom.status).toBe(200);
    expect(memeRole.status).toBe(200);
    expect(administrateur.role).toBe('ADMIN');
  });

  it('tant qu’il reste un autre administrateur actif, suspendre ou rétrograder est permis', async () => {
    const suspension = await commeAdmin(
      request(app).post(`/api/admin/users/${secondAdministrateur.id}/suspendre`),
    ).send({ motif: 'Départ de l’associé' });

    expect(suspension.status).toBe(200);
    expect(secondAdministrateur.status).toBe('SUSPENDU');
    // Il reste `administrateur`, actif : le produit garde un accès.
    expect(etat.utilisateurs.filter((u) => u.role === 'ADMIN' && u.status === 'ACTIF')).toHaveLength(
      1,
    );
  });

  it('rétrograder un autre administrateur reste possible tant qu’il en reste un', async () => {
    const reponse = await commeAdmin(
      request(app).patch(`/api/admin/users/${secondAdministrateur.id}`),
    ).send({ role: 'CLIENT' });

    expect(reponse.status).toBe(200);
    expect(secondAdministrateur.role).toBe('CLIENT');
  });

  it('un compte suspendu ne compte pas comme administrateur actif', async () => {
    secondAdministrateur.status = 'SUSPENDU';

    // `administrateur` est alors le dernier ADMIN actif : il ne peut plus rien
    // se retirer.
    const autoSuspension = await commeAdmin(
      request(app).post(`/api/admin/users/${administrateur.id}/suspendre`),
    ).send({ motif: 'Vacances' });

    expect(autoSuspension.status).toBe(409);
    expect(autoSuspension.body.error.code).toBe('ACTION_IMPOSSIBLE');
  });
});

// ===========================================================================
// Concurrence
// ===========================================================================

/** Petite promesse que le test résout à la main, pour ordonnancer deux requêtes. */
function differe(): { promesse: Promise<void>; resoudre: () => void } {
  let resoudre!: () => void;
  const promesse = new Promise<void>((r) => {
    resoudre = r;
  });
  return { promesse, resoudre };
}

describe('concurrence : deux suspensions simultanées des deux derniers administrateurs', () => {
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS
   * ═════════════════════════════════════════════════════════════════════════
   *  Il n'y a que deux administrateurs, A et B. A suspend B pendant que B
   *  suspend A. Si les deux passaient, le produit n'aurait plus aucun
   *  administrateur actif — et comme il n'existe ni inscription ni
   *  réinitialisation en libre-service, le propriétaire serait enfermé dehors
   *  sans recours.
   *
   *  Le test place les deux requêtes dans l'ordonnancement exact qui met en
   *  défaut un simple « reste-t-il un autre administrateur ? » : la seconde
   *  entre dans sa transaction AVANT que la première soit validée. La doublure
   *  de `lockActiveAdminIds` modélise le `SELECT … FOR UPDATE` réel — attente,
   *  puis relecture de l'état validé.
   *
   *  Ce qui est prouvé : la logique de la route conclut au refus dès lors que
   *  la base lui fournit ces deux propriétés.
   *  Ce qui ne l'est pas : que PostgreSQL les fournisse. Cela ne se vérifie que
   *  sur la vraie base, et reste à faire au contrôle de fin de vague.
   * ═════════════════════════════════════════════════════════════════════════
   */
  it('une seule des deux aboutit, l’autre reçoit 409 — un administrateur actif subsiste', async () => {
    // Seuls A et B sont administrateurs ; `cible` est un client.
    const jetonSecond = await signAccessToken({ id: secondAdministrateur.id, role: 'ADMIN' });

    const premiereAAcquisLeVerrou = differe();
    const secondeEstArrivee = differe();
    const relacher = differe();

    let acquisitions = 0;
    mockLockActiveAdminIds.mockImplementation(async (client: object) => {
      acquisitions += 1;
      if (acquisitions === 1) {
        const ids = await depots.lockActiveAdminIds(client);
        premiereAAcquisLeVerrou.resoudre();
        // La première transaction retient le verrou : la seconde devra attendre.
        await relacher.promesse;
        return ids;
      }
      secondeEstArrivee.resoudre();
      return depots.lockActiveAdminIds(client);
    });

    // `.then()` déclenche l'envoi : une requête supertest reste dormante tant
    // qu'on ne l'attend pas, ce qui rendrait tout l'ordonnancement illusoire.
    const requeteA = commeAdmin(
      request(app).post(`/api/admin/users/${secondAdministrateur.id}/suspendre`),
    )
      .send({ motif: 'A suspend B' })
      .then((reponse) => reponse);

    await premiereAAcquisLeVerrou.promesse;

    const requeteB = request(app)
      .post(`/api/admin/users/${administrateur.id}/suspendre`)
      .set('Authorization', `Bearer ${jetonSecond}`)
      .send({ motif: 'B suspend A' })
      .then((reponse) => reponse);

    await secondeEstArrivee.promesse;
    // Laisse la seconde transaction se mettre effectivement en attente du verrou.
    await new Promise((r) => setImmediate(r));
    relacher.resoudre();

    const [reponseA, reponseB] = await Promise.all([requeteA, requeteB]);

    expect(reponseA.status).toBe(200);
    expect(reponseB.status).toBe(409);
    expect(reponseB.body.error.code).toBe('ACTION_IMPOSSIBLE');

    const adminsActifs = etat.utilisateurs.filter(
      (u) => u.role === 'ADMIN' && u.status === 'ACTIF',
    );
    expect(adminsActifs).toHaveLength(1);
    expect(adminsActifs[0]!.id).toBe(administrateur.id);
  });
});
