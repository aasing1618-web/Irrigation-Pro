/**
 * Tests de la garde d'authentification.
 *
 * Le test qui compte le plus ici est celui du **compte suspendu en cours de
 * session** : c'est la décision D-010, et c'est le seul levier commercial du
 * propriétaire. Si un jeton d'accès déjà émis continuait de fonctionner après
 * une suspension, un client cessant de payer pourrait travailler tant qu'il
 * garde l'application ouverte.
 *
 * Tourne sans PostgreSQL : le dépôt `users` est remplacé par un état en mémoire.
 */

import express, { type Express } from 'express';
import { SignJWT } from 'jose';
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

const mockFindUserById = vi.fn();

vi.mock('../src/db/repositories/users.repo.js', () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

const { config } = await import('../src/config.js');
const { hashPassword } = await import('../src/auth/password.js');
const { JWT_AUDIENCE, JWT_ISSUER, signAccessToken } = await import('../src/auth/tokens.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const {
  getAuthenticatedUser,
  requireAdmin,
  requireAuth,
  requireAuthAllowingPasswordChange,
} = await import('../src/middleware/require-auth.js');

/** Application minimale : trois routes, une par variante de garde. */
function creerApplicationDeTest(): Express {
  const app = express();
  app.use(express.json());

  app.get('/protege', requireAuth, (_req, res) => {
    res.status(200).json({ user: getAuthenticatedUser(res) });
  });

  app.get('/tolere-changement', requireAuthAllowingPasswordChange, (_req, res) => {
    res.status(200).json({ user: getAuthenticatedUser(res) });
  });

  app.get('/admin', requireAdmin, (_req, res) => {
    res.status(200).json({ user: getAuthenticatedUser(res) });
  });

  app.use(errorHandler);
  return app;
}

const app = creerApplicationDeTest();
let etat: EtatFactice;
let empreinte: string;

beforeAll(async () => {
  empreinte = await hashPassword(MOT_DE_PASSE_TEST);
}, 30_000);

beforeEach(() => {
  etat = creerEtatFactice();
  const depots = implementationsDepots(etat);
  mockFindUserById.mockImplementation(depots.findUserById);
});

function ajouterCompte(surcharges: Partial<LigneUtilisateur> = {}): LigneUtilisateur {
  const ligne = creerLigneUtilisateur(empreinte, surcharges);
  etat.utilisateurs.push(ligne);
  return ligne;
}

describe('requireAuth — jeton absent ou mal formé', () => {
  it('refuse une requête sans en-tête Authorization', async () => {
    const reponse = await request(app).get('/protege');

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('TOKEN_INVALID');
    expect(mockFindUserById).not.toHaveBeenCalled();
  });

  it('refuse un en-tête Authorization mal formé', async () => {
    const entetes = [
      'Bearer',
      'Basic abcdef',
      'abcdef',
      'Bearer  ',
      'Bearer a.b.c d.e.f',
      'Token quelque-chose',
    ];

    for (const entete of entetes) {
      const reponse = await request(app).get('/protege').set('Authorization', entete);
      expect(reponse.status).toBe(401);
      expect(reponse.body.error.code).toBe('TOKEN_INVALID');
    }
  });

  it('accepte le mot-clé « bearer » quelle que soit sa casse', async () => {
    const compte = ajouterCompte();
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    const reponse = await request(app).get('/protege').set('Authorization', `bEaReR ${jeton}`);
    expect(reponse.status).toBe(200);
  });
});

describe('requireAuth — jeton invalide', () => {
  it('refuse un jeton expiré', async () => {
    ajouterCompte();
    const maintenant = Math.floor(Date.now() / 1000);
    const jetonExpire = await new SignJWT({ role: 'CLIENT' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(etat.utilisateurs[0]!.id)
      .setJti('expire')
      .setIssuedAt(maintenant - 7200)
      .setExpirationTime(maintenant - 3600)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .sign(new TextEncoder().encode(config.jwtSecret));

    const reponse = await request(app).get('/protege').set('Authorization', `Bearer ${jetonExpire}`);

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('TOKEN_INVALID');
    // La base n'est même pas interrogée : le jeton est écarté avant.
    expect(mockFindUserById).not.toHaveBeenCalled();
  });

  it('refuse un jeton valide dont le compte a disparu', async () => {
    const jeton = await signAccessToken({
      id: '99999999-9999-4999-8999-999999999999',
      role: 'CLIENT',
    });

    const reponse = await request(app).get('/protege').set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('requireAuth — statut relu en base (D-010)', () => {
  it('laisse passer un compte ACTIF', async () => {
    const compte = ajouterCompte();
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    const reponse = await request(app).get('/protege').set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.user.id).toBe(compte.id);
  });

  it('refuse un compte passé à SUSPENDU PENDANT la session', async () => {
    const compte = ajouterCompte({ status: 'ACTIF' });
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    // Le jeton fonctionne…
    const avant = await request(app).get('/protege').set('Authorization', `Bearer ${jeton}`);
    expect(avant.status).toBe(200);

    // …le propriétaire suspend le compte depuis son dashboard…
    compte.status = 'SUSPENDU';

    // …et le MÊME jeton, toujours valide cryptographiquement, ne passe plus.
    const apres = await request(app).get('/protege').set('Authorization', `Bearer ${jeton}`);

    expect(apres.status).toBe(403);
    expect(apres.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(apres.body.error.message).toBe('Votre compte est suspendu. Contactez votre fournisseur.');
  });

  it('refuse aussi un compte suspendu sur les routes tolérant le changement de mot de passe', async () => {
    const compte = ajouterCompte({ status: 'SUSPENDU', must_change_password: true });
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    const reponse = await request(app)
      .get('/tolere-changement')
      .set('Authorization', `Bearer ${jeton}`);

    // La suspension prime sur l'obligation de changer le mot de passe : c'est
    // le message dont l'application a besoin pour revenir à l'écran de connexion.
    expect(reponse.status).toBe(403);
    expect(reponse.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('requireAuth — obligation de changer le mot de passe', () => {
  it('bloque les routes ordinaires', async () => {
    const compte = ajouterCompte({ must_change_password: true });
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    const reponse = await request(app).get('/protege').set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(403);
    expect(reponse.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('laisse passer les routes explicitement autorisées', async () => {
    const compte = ajouterCompte({ must_change_password: true });
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    const reponse = await request(app)
      .get('/tolere-changement')
      .set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.user.mustChangePassword).toBe(true);
  });
});

describe('requireAdmin', () => {
  it('refuse un compte CLIENT', async () => {
    const compte = ajouterCompte({ role: 'CLIENT' });
    const jeton = await signAccessToken({ id: compte.id, role: 'CLIENT' });

    const reponse = await request(app).get('/admin').set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(403);
    expect(reponse.body.error.code).toBe('FORBIDDEN');
  });

  it('accepte un compte ADMIN', async () => {
    const compte = ajouterCompte({ role: 'ADMIN' });
    const jeton = await signAccessToken({ id: compte.id, role: 'ADMIN' });

    const reponse = await request(app).get('/admin').set('Authorization', `Bearer ${jeton}`);

    expect(reponse.status).toBe(200);
  });

  it('se fie au rôle lu en base, pas à celui inscrit dans le jeton', async () => {
    // Jeton parfaitement signé annonçant ADMIN, alors que le compte est CLIENT.
    const compte = ajouterCompte({ role: 'CLIENT' });
    const jetonMenteur = await signAccessToken({ id: compte.id, role: 'ADMIN' });

    const reponse = await request(app).get('/admin').set('Authorization', `Bearer ${jetonMenteur}`);

    expect(reponse.status).toBe(403);
  });

  it('refuse sans jeton', async () => {
    const reponse = await request(app).get('/admin');
    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('res.locals.user', () => {
  it('n’expose jamais l’empreinte du mot de passe', async () => {
    const compte = ajouterCompte();
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    const reponse = await request(app).get('/protege').set('Authorization', `Bearer ${jeton}`);

    expect(reponse.body.user).not.toHaveProperty('password_hash');
    expect(reponse.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(reponse.body)).not.toContain(empreinte);
    expect(JSON.stringify(reponse.body)).not.toContain('scrypt$');
  });

  it('expose le compte en camelCase', async () => {
    const compte = ajouterCompte({ company: 'Sahel Irrigation' });
    const jeton = await signAccessToken({ id: compte.id, role: compte.role });

    const reponse = await request(app).get('/protege').set('Authorization', `Bearer ${jeton}`);

    expect(reponse.body.user).toMatchObject({
      id: compte.id,
      email: compte.email,
      fullName: compte.full_name,
      company: 'Sahel Irrigation',
      role: 'CLIENT',
      status: 'ACTIF',
      mustChangePassword: false,
    });
    expect(reponse.body.user).not.toHaveProperty('full_name');
    expect(reponse.body.user).not.toHaveProperty('must_change_password');
  });
});
