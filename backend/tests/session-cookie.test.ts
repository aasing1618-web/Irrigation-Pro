/**
 * Tests du transport de session par cookie — Vague 4.
 *
 * Implémentation littérale de `docs/API-VAGUE-4.md` § 1, dont les huit tests
 * attendus sont repris un à un, dans l'ordre, sous le titre « Contrat § 1 ».
 *
 * Deux propriétés dominent ce fichier, et méritent d'être énoncées avant de
 * lire le code :
 *
 * 1. **Rétrocompatibilité.** Sans `sessionTransport`, le serveur se comporte
 *    exactement comme avant : jeton dans le corps, aucun `Set-Cookie`. Les
 *    tests de la Vague 1 n'ont pas été touchés, et n'avaient pas à l'être.
 * 2. **Indiscernabilité.** Une session absente et une session invalide donnent
 *    la même réponse : même code, même message, et surtout aucun en-tête qui
 *    permettrait de les distinguer.
 *
 * Aucun PostgreSQL n'est requis : les dépôts sont remplacés par l'état en
 * mémoire de `tests/helpers/comptes.ts`, comme dans `auth.routes.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pino } from 'pino';
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

// --- Dépôts moqués -----------------------------------------------------------

const mockFindUserByEmail = vi.fn();
const mockFindUserById = vi.fn();
const mockRegisterFailedLogin = vi.fn();
const mockRegisterSuccessfulLogin = vi.fn();
const mockUpdatePassword = vi.fn();

const mockCreateRefreshToken = vi.fn();
const mockFindRefreshTokenByHash = vi.fn();
const mockRevokeRefreshToken = vi.fn();
const mockRevokeAllUserTokens = vi.fn();

const mockLogActivity = vi.fn();

vi.mock('../src/db/repositories/users.repo.js', () => ({
  findUserByEmail: (...a: unknown[]) => mockFindUserByEmail(...a),
  findUserById: (...a: unknown[]) => mockFindUserById(...a),
  registerFailedLogin: (...a: unknown[]) => mockRegisterFailedLogin(...a),
  registerSuccessfulLogin: (...a: unknown[]) => mockRegisterSuccessfulLogin(...a),
  updatePassword: (...a: unknown[]) => mockUpdatePassword(...a),
}));

vi.mock('../src/db/repositories/refresh-tokens.repo.js', () => ({
  createRefreshToken: (...a: unknown[]) => mockCreateRefreshToken(...a),
  findRefreshTokenByHash: (...a: unknown[]) => mockFindRefreshTokenByHash(...a),
  revokeRefreshToken: (...a: unknown[]) => mockRevokeRefreshToken(...a),
  revokeAllUserTokens: (...a: unknown[]) => mockRevokeAllUserTokens(...a),
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

const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/auth/password.js');
const { generateRefreshToken, hashRefreshToken, signAccessToken } = await import(
  '../src/auth/tokens.js'
);
const { analyserEnteteCookie, NOM_COOKIE_SESSION } = await import('../src/auth/cookies.js');

const app = createApp();

let etat: EtatFactice;
let empreinte: string;

beforeAll(async () => {
  empreinte = await hashPassword(MOT_DE_PASSE_TEST);
}, 30_000);

beforeEach(() => {
  etat = creerEtatFactice();
  const depots = implementationsDepots(etat);

  mockFindUserByEmail.mockImplementation(depots.findUserByEmail);
  mockFindUserById.mockImplementation(depots.findUserById);
  mockRegisterFailedLogin.mockImplementation(depots.registerFailedLogin);
  mockRegisterSuccessfulLogin.mockImplementation(depots.registerSuccessfulLogin);
  mockUpdatePassword.mockImplementation(depots.updatePassword);
  mockCreateRefreshToken.mockImplementation(depots.createRefreshToken);
  mockFindRefreshTokenByHash.mockImplementation(depots.findRefreshTokenByHash);
  mockRevokeRefreshToken.mockImplementation(depots.revokeRefreshToken);
  mockRevokeAllUserTokens.mockImplementation(depots.revokeAllUserTokens);
  mockLogActivity.mockImplementation(depots.logActivity);
});

// --- Outils ------------------------------------------------------------------

function ajouterCompte(surcharges: Partial<LigneUtilisateur> = {}): LigneUtilisateur {
  const ligne = creerLigneUtilisateur(empreinte, surcharges);
  etat.utilisateurs.push(ligne);
  return ligne;
}

/**
 * Ouvre une session sans passer par `/login` : chaque connexion réelle coûte
 * ~200 ms de `scrypt`, on ne la paie que dans les tests qui portent sur la
 * connexion elle-même.
 */
async function ouvrirSessionDirecte(
  compte: LigneUtilisateur,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken({ id: compte.id, role: compte.role });
  const rafraichissement = generateRefreshToken();
  etat.jetons.push({
    id: `jeton-${etat.jetons.length + 1}`,
    user_id: compte.id,
    token_hash: rafraichissement.tokenHash,
    expires_at: rafraichissement.expiresAt,
    revoked_at: null,
    revoked_reason: null,
    user_agent: null,
    created_at: new Date(),
  });
  return { accessToken, refreshToken: rafraichissement.token };
}

/** En-têtes `Set-Cookie` d'une réponse, toujours sous forme de tableau. */
function entetesSetCookie(reponse: { headers: Record<string, unknown> }): string[] {
  const brut = reponse.headers['set-cookie'];
  if (brut === undefined) return [];
  return Array.isArray(brut) ? (brut as string[]) : [String(brut)];
}

/** Le `Set-Cookie` portant le cookie de session, ou `undefined`. */
function setCookieSession(reponse: { headers: Record<string, unknown> }): string | undefined {
  return entetesSetCookie(reponse).find((ligne) => ligne.startsWith(`${NOM_COOKIE_SESSION}=`));
}

/** Valeur du cookie de session posé par une réponse. */
function valeurCookieSession(reponse: { headers: Record<string, unknown> }): string {
  const entete = setCookieSession(reponse);
  if (!entete) throw new Error('Aucun cookie de session dans la réponse.');
  const valeur = analyserEnteteCookie(entete.split(';')[0]).get(NOM_COOKIE_SESSION);
  if (valeur === undefined) throw new Error('Cookie de session illisible.');
  return valeur;
}

/** En-tête `Cookie` à renvoyer au serveur pour une valeur de session donnée. */
function enteteCookie(valeur: string): string {
  return `${NOM_COOKIE_SESSION}=${valeur}`;
}

/** Les attributs d'un `Set-Cookie`, sans la paire nom=valeur. */
function attributs(entete: string): string[] {
  return entete
    .split(';')
    .slice(1)
    .map((morceau) => morceau.trim());
}

function contientAttribut(entete: string, attendu: string): boolean {
  return attributs(entete).some((attribut) => attribut.toLowerCase() === attendu.toLowerCase());
}

function actionsJournalisees(): string[] {
  return etat.journal.map((entree) => entree.action);
}

const MESSAGE_SESSION_EXPIREE = 'Votre session a expiré. Veuillez vous reconnecter.';

// =============================================================================
// Contrat § 1 — test 1
// =============================================================================

describe('Contrat § 1.1 — login sans sessionTransport : comportement inchangé', () => {
  it('renvoie refreshToken dans le corps et ne pose AUCUN cookie', async () => {
    ajouterCompte({ email: 'jean@bureau-etudes.sn' });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(200);
    expect(typeof reponse.body.refreshToken).toBe('string');
    expect(entetesSetCookie(reponse)).toEqual([]);
    // Le champ est renvoyé dans les deux modes, pour que le client puisse
    // vérifier que le serveur a bien compris.
    expect(reponse.body.sessionTransport).toBe('body');
  }, 20_000);

  it('se comporte de même avec sessionTransport « body » explicite', async () => {
    ajouterCompte({ email: 'explicite@bureau-etudes.sn' });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'explicite@bureau-etudes.sn',
        password: MOT_DE_PASSE_TEST,
        sessionTransport: 'body',
      });

    expect(reponse.status).toBe(200);
    expect(typeof reponse.body.refreshToken).toBe('string');
    expect(reponse.body.sessionTransport).toBe('body');
    expect(entetesSetCookie(reponse)).toEqual([]);
  }, 20_000);
});

// =============================================================================
// Contrat § 1 — test 2
// =============================================================================

describe('Contrat § 1.2 — login en mode cookie', () => {
  it('omet refreshToken du corps et pose le cookie avec ses six attributs', async () => {
    const compte = ajouterCompte({ email: 'web@bureau-etudes.sn' });

    const reponse = await request(app).post('/api/auth/login').send({
      email: 'web@bureau-etudes.sn',
      password: MOT_DE_PASSE_TEST,
      sessionTransport: 'cookie',
    });

    expect(reponse.status).toBe(200);

    // Le point entier de la manœuvre : le secret de 30 jours n'entre jamais
    // dans l'espace mémoire du JavaScript de la page.
    expect(reponse.body.refreshToken).toBeUndefined();
    expect(JSON.stringify(reponse.body)).not.toContain('refreshToken');

    expect(typeof reponse.body.accessToken).toBe('string');
    expect(reponse.body.expiresIn).toBe(900);
    expect(reponse.body.sessionTransport).toBe('cookie');
    expect(reponse.body.user.id).toBe(compte.id);

    const entete = setCookieSession(reponse);
    expect(entete).toBeDefined();

    // Les six attributs du contrat, un par un.
    expect(entete).toMatch(/^ip_refresh=[A-Za-z0-9_-]+;/); // 1. nom
    expect(contientAttribut(entete!, 'HttpOnly')).toBe(true); // 2. inaccessible au JS
    expect(contientAttribut(entete!, 'Secure')).toBe(true); // 3. hors development
    expect(contientAttribut(entete!, 'SameSite=Strict')).toBe(true); // 4. anti-CSRF
    expect(contientAttribut(entete!, 'Path=/api/auth')).toBe(true); // 5. portée réduite
    expect(contientAttribut(entete!, 'Max-Age=2592000')).toBe(true); // 6. 30 jours

    // Et la valeur posée est bien la session enregistrée en base.
    expect(hashRefreshToken(valeurCookieSession(reponse))).toBe(etat.jetons[0]?.token_hash);
  }, 20_000);

  it('pose un cookie utilisable pour rafraîchir la session', async () => {
    ajouterCompte({ email: 'suite@bureau-etudes.sn' });

    const connexion = await request(app).post('/api/auth/login').send({
      email: 'suite@bureau-etudes.sn',
      password: MOT_DE_PASSE_TEST,
      sessionTransport: 'cookie',
    });

    const suite = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(valeurCookieSession(connexion)))
      .send({});

    expect(suite.status).toBe(200);
  }, 20_000);
});

// =============================================================================
// Contrat § 1 — test 3
// =============================================================================

describe('Contrat § 1.3 — refresh avec le seul cookie', () => {
  it('ouvre une nouvelle session, repose un cookie neuf, et ne renvoie aucun jeton', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(session.refreshToken))
      .send({});

    expect(reponse.status).toBe(200);
    expect(reponse.body.refreshToken).toBeUndefined();
    expect(typeof reponse.body.accessToken).toBe('string');
    expect(reponse.body.sessionTransport).toBe('cookie');

    const nouveau = valeurCookieSession(reponse);
    expect(nouveau).not.toBe(session.refreshToken);

    // Rotation effective en base : l'ancien jeton est révoqué, le nouveau vit.
    expect(etat.jetons[0]?.revoked_reason).toBe('ROTATION');
    expect(etat.jetons[1]?.token_hash).toBe(hashRefreshToken(nouveau));
    expect(etat.jetons[1]?.revoked_at).toBeNull();
    expect(actionsJournalisees()).toContain('TOKEN_REFRESHED');
  });

  it('donne la priorité au corps JSON quand les deux canaux portent un jeton', async () => {
    // Ordre de recherche du contrat : corps d'abord, cookie ensuite.
    const compte = ajouterCompte();
    const duCorps = await ouvrirSessionDirecte(compte);
    const duCookie = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(duCookie.refreshToken))
      .send({ refreshToken: duCorps.refreshToken });

    expect(reponse.status).toBe(200);
    expect(typeof reponse.body.refreshToken).toBe('string');
    expect(reponse.body.sessionTransport).toBe('body');
    // C'est bien la session du CORPS qui a tourné, pas celle du cookie.
    expect(etat.jetons[0]?.revoked_reason).toBe('ROTATION');
    expect(etat.jetons[1]?.revoked_at).toBeNull();
  });

  it('efface le cookie quand le client réclame explicitement le mode corps', async () => {
    // Sinon le cookie garderait un jeton désormais révoqué par ROTATION : son
    // retour serait pris pour un vol et couperait toutes les sessions.
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(session.refreshToken))
      .send({ sessionTransport: 'body' });

    expect(reponse.status).toBe(200);
    expect(typeof reponse.body.refreshToken).toBe('string');
    expect(reponse.body.sessionTransport).toBe('body');
    expect(setCookieSession(reponse)).toContain('Max-Age=0');
  });
});

// =============================================================================
// Contrat § 1 — test 4
// =============================================================================

describe('Contrat § 1.4 — refresh sans corps ni cookie', () => {
  it('répond 401 REFRESH_TOKEN_INVALID, avec le message existant', async () => {
    const reponse = await request(app).post('/api/auth/refresh').send({});

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    expect(reponse.body.error.message).toBe(MESSAGE_SESSION_EXPIREE);
  });

  it('reste indistinguable d’une session invalide — même corps, aucun en-tête distinctif', async () => {
    const absente = await request(app).post('/api/auth/refresh').send({});
    const cookieInconnu = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie('jeton-qui-n-existe-pas'))
      .send({});
    const corpsInconnu = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'jeton-qui-n-existe-pas' });

    for (const reponse of [cookieInconnu, corpsInconnu]) {
      expect(reponse.status).toBe(absente.status);
      expect(reponse.body).toEqual(absente.body);
    }

    // Un `Set-Cookie` d'effacement sur l'un des trois cas suffirait à les
    // distinguer : il ne doit y en avoir sur aucun.
    expect(entetesSetCookie(absente)).toEqual([]);
    expect(entetesSetCookie(cookieInconnu)).toEqual([]);
    expect(entetesSetCookie(corpsInconnu)).toEqual([]);
  });

  it('traite un cookie vide comme une absence de cookie', async () => {
    const reponse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${NOM_COOKIE_SESSION}=`)
      .send({});

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });
});

// =============================================================================
// Contrat § 1 — test 5
// =============================================================================

describe('Contrat § 1.5 — rejeu d’un cookie déjà tourné', () => {
  it('déclenche la révocation en cascade, exactement comme en mode corps', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);
    const autreAppareil = await ouvrirSessionDirecte(compte);

    // Rotation normale : le cookie initial est remplacé.
    const rotation = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(session.refreshToken))
      .send({});
    expect(rotation.status).toBe(200);
    const cookieNeuf = valeurCookieSession(rotation);

    // Le cookie d'origine revient : deux copies circulent, on ne sait pas
    // laquelle est celle du voleur — on coupe tout.
    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(session.refreshToken))
      .send({});

    expect(rejeu.status).toBe(401);
    expect(rejeu.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    expect(actionsJournalisees()).toContain('REFRESH_TOKEN_REUSE');
    expect(etat.jetons.every((jeton) => jeton.revoked_at !== null)).toBe(true);

    // Toutes les sessions du compte sont bien tombées, y compris celles qui
    // n'ont rien à voir avec le cookie rejoué.
    const apresCookie = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(cookieNeuf))
      .send({});
    const apresAutre = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: autreAppareil.refreshToken });

    expect(apresCookie.status).toBe(401);
    expect(apresAutre.status).toBe(401);
  });

  it('ne coupe pas les autres sessions quand le cookie rejoué venait d’une déconnexion', async () => {
    const compte = ajouterCompte();
    const deconnecte = await ouvrirSessionDirecte(compte);
    const actif = await ouvrirSessionDirecte(compte);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${deconnecte.accessToken}`)
      .set('Cookie', enteteCookie(deconnecte.refreshToken))
      .send({});

    expect(etat.jetons[0]?.revoked_reason).toBe('LOGOUT');

    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(deconnecte.refreshToken))
      .send({});

    expect(rejeu.status).toBe(401);
    expect(actionsJournalisees()).not.toContain('REFRESH_TOKEN_REUSE');
    expect(etat.jetons[1]?.revoked_at).toBeNull();

    const encore = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(actif.refreshToken))
      .send({});
    expect(encore.status).toBe(200);
  });
});

// =============================================================================
// Contrat § 1 — test 6
// =============================================================================

describe('Contrat § 1.6 — logout efface le cookie', () => {
  it('repose un cookie vide, Max-Age=0, avec exactement les mêmes attributs', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const pose = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(session.refreshToken))
      .send({});
    const entetePose = setCookieSession(pose);
    expect(entetePose).toBeDefined();

    const deconnexion = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({});

    expect(deconnexion.status).toBe(204);

    const enteteEffacement = setCookieSession(deconnexion);
    expect(enteteEffacement).toBeDefined();
    expect(enteteEffacement).toMatch(/^ip_refresh=;/);
    expect(contientAttribut(enteteEffacement!, 'Max-Age=0')).toBe(true);

    // Un navigateur n'efface pas un cookie dont les attributs diffèrent : ceux
    // qui décrivent la portée et la protection doivent être identiques à la pose.
    for (const attribut of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/auth']) {
      expect(contientAttribut(entetePose!, attribut)).toBe(true);
      expect(contientAttribut(enteteEffacement!, attribut)).toBe(true);
    }
  });

  it('efface le cookie systématiquement, même sans session et sans cookie présenté', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ sessionTransport: 'body' });

    expect(reponse.status).toBe(204);
    expect(setCookieSession(reponse)).toContain('Max-Age=0');
  });

  it('révoque en base la session portée par le cookie', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Cookie', enteteCookie(session.refreshToken))
      .send({});

    expect(reponse.status).toBe(204);
    expect(etat.jetons[0]?.revoked_reason).toBe('LOGOUT');
    expect(actionsJournalisees()).toContain('LOGOUT');
  });

  it('ne révoque pas la session d’un autre compte présentée dans un cookie', async () => {
    const victime = ajouterCompte({ email: 'victime-cookie@bureau-etudes.sn' });
    const attaquant = ajouterCompte({ email: 'attaquant-cookie@bureau-etudes.sn' });
    const sessionVictime = await ouvrirSessionDirecte(victime);
    const sessionAttaquant = await ouvrirSessionDirecte(attaquant);

    const reponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${sessionAttaquant.accessToken}`)
      .set('Cookie', enteteCookie(sessionVictime.refreshToken))
      .send({});

    expect(reponse.status).toBe(204);
    expect(etat.jetons[0]?.revoked_at).toBeNull();
  });
});

// =============================================================================
// Contrat § 1 — test 7
// =============================================================================

describe('Contrat § 1.7 — valeur de sessionTransport invalide', () => {
  it('refuse « chose » sur login avec un 400 VALIDATION_ERROR en français', async () => {
    ajouterCompte({ email: 'valide@bureau-etudes.sn' });

    const reponse = await request(app).post('/api/auth/login').send({
      email: 'valide@bureau-etudes.sn',
      password: MOT_DE_PASSE_TEST,
      sessionTransport: 'chose',
    });

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    expect(reponse.body.error.message).toBe(
      'Le mode de transport de session doit valoir « body » ou « cookie ».',
    );
    expect(reponse.body.error.details).toEqual({ champs: ['sessionTransport'] });
    expect(entetesSetCookie(reponse)).toEqual([]);
  });

  it('refuse aussi sur refresh, avant toute lecture de jeton', async () => {
    const reponse = await request(app)
      .post('/api/auth/refresh')
      .send({ sessionTransport: 'chose', refreshToken: 'peu-importe' });

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuse sur change-password', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        currentPassword: MOT_DE_PASSE_TEST,
        newPassword: 'un-autre-mot-de-passe-solide-2026',
        sessionTransport: 'chose',
      });

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuse les valeurs non textuelles, y compris null', async () => {
    for (const valeur of [null, 42, true, ['cookie'], { mode: 'cookie' }, 'COOKIE', '']) {
      const reponse = await request(app)
        .post('/api/auth/refresh')
        .send({ sessionTransport: valeur, refreshToken: 'peu-importe' });

      expect(reponse.status).toBe(400);
      expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

// =============================================================================
// Contrat § 1 — test 8
// =============================================================================

describe('Contrat § 1.8 — suspension d’un compte en mode cookie', () => {
  it('invalide la session ouverte, comme en mode corps', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    // Le propriétaire suspend le compte depuis son dashboard.
    compte.status = 'SUSPENDU';

    const parCookie = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', enteteCookie(session.refreshToken))
      .send({});

    expect(parCookie.status).toBe(403);
    expect(parCookie.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(actionsJournalisees()).toContain('LOGIN_BLOCKED_SUSPENDED');
    // Aucune session neuve n'a été ouverte, et aucun cookie n'a été reposé.
    expect(entetesSetCookie(parCookie)).toEqual([]);
    expect(etat.jetons).toHaveLength(1);
  });

  it('bloque aussi la connexion en mode cookie, sans poser de cookie', async () => {
    ajouterCompte({ email: 'suspendu@bureau-etudes.sn', status: 'SUSPENDU' });

    const reponse = await request(app).post('/api/auth/login').send({
      email: 'suspendu@bureau-etudes.sn',
      password: MOT_DE_PASSE_TEST,
      sessionTransport: 'cookie',
    });

    expect(reponse.status).toBe(403);
    expect(reponse.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(entetesSetCookie(reponse)).toEqual([]);
  }, 20_000);
});

// =============================================================================
// change-password en mode cookie
// =============================================================================

describe('POST /api/auth/change-password — mode cookie', () => {
  it('émet la session neuve dans un cookie et jamais dans le corps', async () => {
    const compte = ajouterCompte({ must_change_password: true });
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        currentPassword: MOT_DE_PASSE_TEST,
        newPassword: 'un-autre-mot-de-passe-solide-2026',
        sessionTransport: 'cookie',
      });

    expect(reponse.status).toBe(200);
    expect(reponse.body.refreshToken).toBeUndefined();
    expect(reponse.body.sessionTransport).toBe('cookie');
    expect(reponse.body.user.mustChangePassword).toBe(false);

    // La session neuve est bien celle du cookie, et les anciennes sont tombées.
    const valeur = valeurCookieSession(reponse);
    const neuf = etat.jetons.find((jeton) => jeton.token_hash === hashRefreshToken(valeur));
    expect(neuf?.revoked_at).toBeNull();
    expect(etat.jetons[0]?.revoked_reason).toBe('PASSWORD_CHANGE');
  }, 30_000);
});

// =============================================================================
// Analyseur d'en-tête Cookie (module maison, aucune dépendance)
// =============================================================================

describe('analyserEnteteCookie', () => {
  it('renvoie une table vide quand l’en-tête est absent', () => {
    expect(analyserEnteteCookie(undefined).size).toBe(0);
  });

  it('lit plusieurs cookies, avec ou sans espaces', () => {
    const cookies = analyserEnteteCookie('a=1;b=2;  ip_refresh=xyz  ;c=3');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('b')).toBe('2');
    expect(cookies.get('ip_refresh')).toBe('xyz');
    expect(cookies.get('c')).toBe('3');
  });

  it('décode les valeurs encodées en pourcent', () => {
    expect(analyserEnteteCookie('x=a%20b%3Bc').get('x')).toBe('a b;c');
  });

  it('retire les guillemets d’une valeur citée', () => {
    expect(analyserEnteteCookie('x="valeur"').get('x')).toBe('valeur');
  });

  it('accepte un en-tête Cookie répété, sous forme de tableau', () => {
    const cookies = analyserEnteteCookie(['a=1', 'ip_refresh=xyz']);
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('ip_refresh')).toBe('xyz');
  });

  it('garde la première occurrence d’un nom répété (RFC 6265 § 5.4)', () => {
    expect(analyserEnteteCookie('x=precis; x=general').get('x')).toBe('precis');
  });

  it('ignore les segments sans « = » ou au nom vide, sans lever d’exception', () => {
    const cookies = analyserEnteteCookie('drapeau; =sansnom; ; x=1');
    expect(cookies.get('x')).toBe('1');
    expect(cookies.has('drapeau')).toBe(false);
    expect(cookies.size).toBe(1);
  });

  it('conserve la valeur brute quand l’échappement est invalide', () => {
    expect(analyserEnteteCookie('x=%E0%A4%A').get('x')).toBe('%E0%A4%A');
  });

  it('accepte une valeur contenant un « = »', () => {
    expect(analyserEnteteCookie('x=a=b').get('x')).toBe('a=b');
  });

  it('ne confond pas un cookie de nom voisin', () => {
    const cookies = analyserEnteteCookie('ip_refresh_bis=faux; ip_refresh=vrai');
    expect(cookies.get('ip_refresh')).toBe('vrai');
  });
});

// =============================================================================
// Journalisation : le jeton ne doit apparaître nulle part
// =============================================================================

describe('Journalisation du cookie de session', () => {
  const cheminLogger = fileURLToPath(new URL('../src/logger.ts', import.meta.url));
  const sourceLogger = readFileSync(cheminLogger, 'utf8');

  it('le filtre de rédaction couvre l’en-tête Cookie et Set-Cookie', () => {
    expect(sourceLogger).toContain("'req.headers.cookie'");
    expect(sourceLogger).toContain('\'res.headers["set-cookie"]\'');
  });

  it('pino masque effectivement ces deux chemins', async () => {
    const lignes: string[] = [];
    const destination = {
      write(ligne: string) {
        lignes.push(ligne);
      },
    };

    const journal = pino(
      {
        level: 'info',
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          censor: '[masqué]',
        },
      },
      destination,
    );

    journal.info(
      {
        req: { headers: { cookie: 'ip_refresh=SECRET-DE-30-JOURS', authorization: 'Bearer SECRET' } },
        res: { headers: { 'set-cookie': ['ip_refresh=SECRET-DE-30-JOURS; HttpOnly'] } },
      },
      'requête',
    );

    const sortie = lignes.join('');
    expect(sortie).not.toContain('SECRET-DE-30-JOURS');
    expect(sortie).not.toContain('Bearer SECRET');
    expect(sortie).toContain('[masqué]');
  });
});

// =============================================================================
// CORS — le cookie ne circule que si les credentials sont autorisés
// =============================================================================

describe('CORS et cookie de session', () => {
  it('autorise les credentials pour une origine de la liste blanche', async () => {
    const reponse = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .send({});

    expect(reponse.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(reponse.headers['access-control-allow-credentials']).toBe('true');
    // Jamais « * » : un navigateur refuse le joker dès que les credentials sont
    // autorisés.
    expect(reponse.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('pose Vary: Origin même sans en-tête Origin', async () => {
    const reponse = await request(app).post('/api/auth/refresh').send({});

    expect(String(reponse.headers['vary'])).toContain('Origin');
  });

  it('ne mentionne Origin qu’une fois dans Vary quand CORS s’applique aussi', async () => {
    const reponse = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .send({});

    const occurrences = String(reponse.headers['vary'])
      .split(',')
      .map((valeur) => valeur.trim().toLowerCase())
      .filter((valeur) => valeur === 'origin');
    expect(occurrences).toHaveLength(1);
  });
});
