/**
 * Tests des routes d'authentification — Vague 1.
 *
 * Ces tests vérifient le contrat `docs/API-VAGUE-1.md` route par route, et
 * surtout les propriétés de sécurité qui n'apparaissent pas dans une
 * spécification fonctionnelle : indiscernabilité des échecs, verrouillage,
 * rotation des jetons, détection de vol, absence de fuite d'empreinte.
 *
 * Aucun PostgreSQL n'est requis : les trois dépôts sont remplacés par un état
 * en mémoire (`tests/helpers/comptes.ts`).
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
  type MotifRevocation,
} from './helpers/comptes.js';

// --- Dépôts moqués -----------------------------------------------------------
// Les noms sont préfixés `mock` : c'est la seule forme que Vitest autorise à
// l'intérieur d'une factory `vi.mock`, qui est remontée en tête de fichier.

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
 * Ouvre une session sans passer par `/login`.
 * Chaque connexion réelle coûte ~200 ms de `scrypt` ; on ne la paie que dans
 * les tests qui portent effectivement sur la connexion.
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

/**
 * Marque une session comme révoquée avec un motif donné, sans passer par le
 * serveur : c'est l'équivalent d'un état laissé en base par une déconnexion,
 * un changement de mot de passe ou une suspension survenus plus tôt.
 *
 * `motif` accepte `null` pour reproduire une ligne antérieure à la migration
 * 003, révoquée à une époque où le motif n'existait pas.
 */
function revoquerJeton(refreshToken: string, motif: MotifRevocation | null): void {
  const empreinte = hashRefreshToken(refreshToken);
  const ligne = etat.jetons.find((jeton) => jeton.token_hash === empreinte);
  if (!ligne) throw new Error('Jeton introuvable dans l’état de test.');
  ligne.revoked_at = new Date();
  ligne.revoked_reason = motif;
}

function actionsJournalisees(): string[] {
  return etat.journal.map((entree) => entree.action);
}

// =============================================================================
// POST /api/auth/login
// =============================================================================

describe('POST /api/auth/login', () => {
  it('connecte un compte ACTIF et renvoie le couple de jetons', async () => {
    const compte = ajouterCompte({ email: 'jean@bureau-etudes.sn', must_change_password: true });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(200);
    expect(typeof reponse.body.accessToken).toBe('string');
    expect(typeof reponse.body.refreshToken).toBe('string');
    expect(reponse.body.expiresIn).toBe(900);
    expect(reponse.body.user).toEqual({
      id: compte.id,
      email: 'jean@bureau-etudes.sn',
      fullName: compte.full_name,
      company: compte.company,
      role: 'CLIENT',
      mustChangePassword: true,
    });
    expect(actionsJournalisees()).toContain('LOGIN_SUCCESS');
  }, 20_000);

  it('accepte l’adresse quelle que soit la casse et les espaces autour', async () => {
    ajouterCompte({ email: 'jean@bureau-etudes.sn' });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: '  JEAN@Bureau-Etudes.SN  ', password: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(200);
  }, 20_000);

  it('refuse un mot de passe faux', async () => {
    ajouterCompte({ email: 'jean@bureau-etudes.sn' });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: 'ce-nest-pas-le-bon' });

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(reponse.body.error.message).toBe('Adresse e-mail ou mot de passe incorrect.');
    expect(actionsJournalisees()).toContain('LOGIN_FAILED');
  }, 20_000);

  it('renvoie EXACTEMENT la même réponse pour un e-mail inconnu et un mot de passe faux', async () => {
    ajouterCompte({ email: 'jean@bureau-etudes.sn' });

    const motDePasseFaux = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: 'ce-nest-pas-le-bon' });

    const emailInconnu = await request(app)
      .post('/api/auth/login')
      .send({ email: 'personne@nulle-part.sn', password: 'ce-nest-pas-le-bon' });

    expect(emailInconnu.status).toBe(motDePasseFaux.status);
    expect(emailInconnu.body).toEqual(motDePasseFaux.body);
    // Rien dans la réponse ne permet de distinguer les deux situations.
    expect(JSON.stringify(emailInconnu.body)).toBe(JSON.stringify(motDePasseFaux.body));
  }, 20_000);

  it('ne journalise pas l’adresse saisie quand le compte est inconnu', async () => {
    // Un utilisateur tape parfois son mot de passe dans le champ e-mail :
    // journaliser cette saisie ferait du journal un dépôt de secrets en clair.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@exemple.sn', password: MOT_DE_PASSE_TEST });

    const journalise = JSON.stringify(etat.journal);
    expect(journalise).not.toContain('inconnu@exemple.sn');
    expect(journalise).not.toContain(MOT_DE_PASSE_TEST);
  }, 20_000);

  it('bloque un compte SUSPENDU, mais seulement après un mot de passe correct', async () => {
    ajouterCompte({ email: 'suspendu@bureau-etudes.sn', status: 'SUSPENDU' });

    const avecBonMotDePasse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'suspendu@bureau-etudes.sn', password: MOT_DE_PASSE_TEST });

    expect(avecBonMotDePasse.status).toBe(403);
    expect(avecBonMotDePasse.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(avecBonMotDePasse.body.error.message).toBe(
      'Votre compte est suspendu. Contactez votre fournisseur.',
    );
    expect(actionsJournalisees()).toContain('LOGIN_BLOCKED_SUSPENDED');
  }, 20_000);

  it('ne révèle pas la suspension quand le mot de passe est faux', async () => {
    ajouterCompte({ email: 'suspendu@bureau-etudes.sn', status: 'SUSPENDU' });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'suspendu@bureau-etudes.sn', password: 'mauvais' });

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('INVALID_CREDENTIALS');
  }, 20_000);

  it('refuse une requête incomplète avec le message du contrat', async () => {
    const entrees = [
      {},
      { email: 'jean@bureau-etudes.sn' },
      { password: MOT_DE_PASSE_TEST },
      { email: 'pas-une-adresse', password: MOT_DE_PASSE_TEST },
      { email: 'jean@bureau-etudes.sn', password: '' },
      { email: 42, password: MOT_DE_PASSE_TEST },
    ];

    for (const entree of entrees) {
      const reponse = await request(app).post('/api/auth/login').send(entree);
      expect(reponse.status).toBe(400);
      expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
      expect(reponse.body.error.message).toBe(
        'Veuillez saisir votre adresse e-mail et votre mot de passe.',
      );
    }
  });

  it('ne renvoie jamais la valeur des champs refusés', async () => {
    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pas-une-adresse', password: 'court' });

    expect(JSON.stringify(reponse.body)).not.toContain('court');
  });
});

// =============================================================================
// Verrouillage anti-force brute
// =============================================================================

describe('Verrouillage du compte après échecs répétés', () => {
  async function echouer(email: string) {
    return request(app).post('/api/auth/login').send({ email, password: 'mauvais-mot-de-passe' });
  }

  it('verrouille le compte au bout de 5 échecs et refuse ensuite en 429', async () => {
    const compte = ajouterCompte({ email: 'jean@bureau-etudes.sn' });

    for (let tentative = 1; tentative <= 5; tentative += 1) {
      const reponse = await echouer('jean@bureau-etudes.sn');
      // Jusqu'au verrouillage inclus, la réponse reste indiscernable de celle
      // d'un e-mail inconnu (qui, lui, ne se verrouille jamais).
      expect(reponse.status).toBe(401);
      expect(reponse.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    expect(compte.failed_login_attempts).toBe(5);
    expect(compte.locked_until).toBeInstanceOf(Date);
    expect(actionsJournalisees()).toContain('ACCOUNT_LOCKED');

    const sixieme = await echouer('jean@bureau-etudes.sn');
    expect(sixieme.status).toBe(429);
    expect(sixieme.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(sixieme.body.error.message).toMatch(/^Trop de tentatives\. Réessayez dans \d+ minutes?\.$/);
  }, 30_000);

  it('refuse même le bon mot de passe pendant le verrouillage', async () => {
    const compte = ajouterCompte({
      email: 'jean@bureau-etudes.sn',
      failed_login_attempts: 5,
      locked_until: new Date(Date.now() + 10 * 60 * 1000),
    });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(429);
    expect(reponse.body.error.code).toBe('ACCOUNT_LOCKED');
    // Le compteur n'a pas bougé : le verrou est examiné avant le mot de passe.
    expect(compte.failed_login_attempts).toBe(5);
  }, 20_000);

  it('laisse entrer une fois le verrouillage expiré et remet le compteur à zéro', async () => {
    const compte = ajouterCompte({
      email: 'jean@bureau-etudes.sn',
      failed_login_attempts: 5,
      locked_until: new Date(Date.now() - 1000),
    });

    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(200);
    expect(compte.failed_login_attempts).toBe(0);
    expect(compte.locked_until).toBeNull();
  }, 20_000);

  it('double la durée de verrouillage à chaque échec supplémentaire, jusqu’à 2 h', async () => {
    const compte = ajouterCompte({ email: 'jean@bureau-etudes.sn', failed_login_attempts: 5 });

    await echouer('jean@bureau-etudes.sn');
    const premiereDuree = compte.locked_until!.getTime() - Date.now();
    // 6e échec → 30 minutes.
    expect(premiereDuree).toBeGreaterThan(29 * 60 * 1000);
    expect(premiereDuree).toBeLessThanOrEqual(30 * 60 * 1000);

    compte.locked_until = null;
    compte.failed_login_attempts = 20;
    await echouer('jean@bureau-etudes.sn');
    const dureePlafonnee = compte.locked_until!.getTime() - Date.now();
    // Plafond : jamais plus de 2 heures, sinon le verrou deviendrait une arme.
    expect(dureePlafonnee).toBeGreaterThan(119 * 60 * 1000);
    expect(dureePlafonnee).toBeLessThanOrEqual(120 * 60 * 1000);
  }, 20_000);
});

// =============================================================================
// POST /api/auth/refresh
// =============================================================================

describe('POST /api/auth/refresh', () => {
  it('émet un nouveau couple et révoque l’ancien jeton (rotation)', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(reponse.status).toBe(200);
    expect(typeof reponse.body.accessToken).toBe('string');
    expect(typeof reponse.body.refreshToken).toBe('string');
    expect(reponse.body.refreshToken).not.toBe(session.refreshToken);
    expect(reponse.body.expiresIn).toBe(900);
    // La réponse de /refresh ne contient PAS de bloc « user » (contrat).
    expect(reponse.body).not.toHaveProperty('user');

    expect(etat.jetons[0]?.revoked_at).toBeInstanceOf(Date);
    expect(actionsJournalisees()).toContain('TOKEN_REFRESHED');
  });

  it('refuse un jeton déjà utilisé et coupe TOUTES les sessions du compte', async () => {
    const compte = ajouterCompte();
    const premiere = await ouvrirSessionDirecte(compte);
    const seconde = await ouvrirSessionDirecte(compte);

    // Rotation normale du premier jeton.
    const rotation = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: premiere.refreshToken });
    expect(rotation.status).toBe(200);

    // Le voleur rejoue le jeton déjà consommé.
    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: premiere.refreshToken });

    expect(rejeu.status).toBe(401);
    expect(rejeu.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    expect(actionsJournalisees()).toContain('REFRESH_TOKEN_REUSE');

    // Toutes les sessions du compte sont tombées, y compris celles qui n'ont
    // rien à voir avec le jeton volé.
    expect(etat.jetons.every((jeton) => jeton.revoked_at !== null)).toBe(true);

    const apres = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: seconde.refreshToken });
    expect(apres.status).toBe(401);
  });

  it('refuse un jeton inconnu', async () => {
    const reponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'jeton-qui-nexiste-pas' });

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    // Un jeton inconnu n'est pas un vol : aucune session n'est coupée.
    expect(actionsJournalisees()).not.toContain('REFRESH_TOKEN_REUSE');
  });

  it('refuse un jeton expiré', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);
    etat.jetons[0]!.expires_at = new Date(Date.now() - 1000);

    const reponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('refuse un corps sans jeton, sans révéler la différence', async () => {
    for (const corps of [{}, { refreshToken: '' }, { refreshToken: 123 }]) {
      const reponse = await request(app).post('/api/auth/refresh').send(corps);
      expect(reponse.status).toBe(401);
      expect(reponse.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    }
  });

  it('refuse un compte suspendu entre-temps', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);
    compte.status = 'SUSPENDU';

    const reponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(reponse.status).toBe(403);
    expect(reponse.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

// =============================================================================
// Détection de réutilisation — avec discernement
//
// Un jeton révoqué qu'on représente ne veut pas dire la même chose selon la
// RAISON de sa révocation (contrat, § POST /api/auth/refresh). Seul un jeton
// révoqué par ROTATION qui revient signale deux détenteurs, donc un vol.
// =============================================================================

describe('POST /api/auth/refresh — motif de révocation', () => {
  it('enregistre le motif ROTATION quand un jeton est remplacé', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });

    expect(etat.jetons[0]?.revoked_reason).toBe('ROTATION');
  });

  it('traite le rejeu d’un jeton révoqué par ROTATION comme un vol', async () => {
    const compte = ajouterCompte();
    const vole = await ouvrirSessionDirecte(compte);
    const autre = await ouvrirSessionDirecte(compte);
    revoquerJeton(vole.refreshToken, 'ROTATION');

    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: vole.refreshToken });

    expect(rejeu.status).toBe(401);
    expect(rejeu.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    expect(actionsJournalisees()).toContain('REFRESH_TOKEN_REUSE');

    // Toutes les sessions du compte tombent, y compris celles qui n'ont rien à
    // voir avec le jeton rejoué : on ne sait pas laquelle est celle du voleur.
    expect(etat.jetons.every((jeton) => jeton.revoked_at !== null)).toBe(true);
    const apres = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: autre.refreshToken });
    expect(apres.status).toBe(401);
  });

  it('ne coupe PAS les autres sessions quand le motif est PASSWORD_CHANGE', async () => {
    const compte = ajouterCompte();
    const portableALaMaison = await ouvrirSessionDirecte(compte);
    const posteAuBureau = await ouvrirSessionDirecte(compte);

    // Le portable a été déconnecté par un changement de mot de passe fait au
    // bureau ; il l'ignore et tente un rafraîchissement.
    revoquerJeton(portableALaMaison.refreshToken, 'PASSWORD_CHANGE');

    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: portableALaMaison.refreshToken });

    expect(rejeu.status).toBe(401);
    expect(rejeu.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    // Ce n'est pas un vol : rien n'est journalisé comme tel.
    expect(actionsJournalisees()).not.toContain('REFRESH_TOKEN_REUSE');

    // ET SURTOUT — c'est le défaut corrigé : la session en cours survit.
    expect(etat.jetons[1]?.revoked_at).toBeNull();
    const bureau = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: posteAuBureau.refreshToken });
    expect(bureau.status).toBe(200);
    expect(typeof bureau.body.refreshToken).toBe('string');
  });

  it('ne coupe PAS les autres sessions quand le motif est LOGOUT', async () => {
    const compte = ajouterCompte();
    const appareilDeconnecte = await ouvrirSessionDirecte(compte);
    const appareilActif = await ouvrirSessionDirecte(compte);

    revoquerJeton(appareilDeconnecte.refreshToken, 'LOGOUT');

    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: appareilDeconnecte.refreshToken });

    expect(rejeu.status).toBe(401);
    expect(rejeu.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    expect(actionsJournalisees()).not.toContain('REFRESH_TOKEN_REUSE');

    expect(etat.jetons[1]?.revoked_at).toBeNull();
    const encore = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: appareilActif.refreshToken });
    expect(encore.status).toBe(200);
  });

  it('ne coupe PAS les autres sessions quand le motif est ADMIN', async () => {
    const compte = ajouterCompte();
    const ferme = await ouvrirSessionDirecte(compte);
    const actif = await ouvrirSessionDirecte(compte);

    revoquerJeton(ferme.refreshToken, 'ADMIN');

    const rejeu = await request(app).post('/api/auth/refresh').send({ refreshToken: ferme.refreshToken });

    expect(rejeu.status).toBe(401);
    expect(actionsJournalisees()).not.toContain('REFRESH_TOKEN_REUSE');
    expect(etat.jetons[1]?.revoked_at).toBeNull();

    const encore = await request(app).post('/api/auth/refresh').send({ refreshToken: actif.refreshToken });
    expect(encore.status).toBe(200);
  });

  it('traite un jeton révoqué SANS motif connu comme non suspect', async () => {
    // Cas d'une ligne antérieure à la migration 003 : révoquée à une époque où
    // le motif n'était pas enregistré. Dans le doute, on ne soupçonne pas —
    // supposer un vol sur des données historiques couperait les sessions d'un
    // client parfaitement honnête.
    const compte = ajouterCompte();
    const ancien = await ouvrirSessionDirecte(compte);
    const actif = await ouvrirSessionDirecte(compte);

    revoquerJeton(ancien.refreshToken, null);

    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: ancien.refreshToken });

    expect(rejeu.status).toBe(401);
    expect(rejeu.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    expect(actionsJournalisees()).not.toContain('REFRESH_TOKEN_REUSE');
    expect(etat.jetons[1]?.revoked_at).toBeNull();

    const encore = await request(app).post('/api/auth/refresh').send({ refreshToken: actif.refreshToken });
    expect(encore.status).toBe(200);
  });

  it('enregistre LOGOUT au motif d’une déconnexion', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ refreshToken: session.refreshToken });

    expect(etat.jetons[0]?.revoked_reason).toBe('LOGOUT');
  });
});

// =============================================================================
// POST /api/auth/logout
// =============================================================================

describe('POST /api/auth/logout', () => {
  it('révoque le jeton et répond 204', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ refreshToken: session.refreshToken });

    expect(reponse.status).toBe(204);
    expect(reponse.body).toEqual({});
    expect(etat.jetons[0]?.revoked_at).toBeInstanceOf(Date);
    expect(actionsJournalisees()).toContain('LOGOUT');
  });

  it('reste idempotente : une déconnexion ne doit jamais échouer', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);
    const entete = `Bearer ${session.accessToken}`;

    const premiere = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', entete)
      .send({ refreshToken: session.refreshToken });
    const seconde = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', entete)
      .send({ refreshToken: session.refreshToken });
    const sansJeton = await request(app).post('/api/auth/logout').set('Authorization', entete).send({});
    const jetonFantaisiste = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', entete)
      .send({ refreshToken: 'nimportequoi' });

    expect(premiere.status).toBe(204);
    expect(seconde.status).toBe(204);
    expect(sansJeton.status).toBe(204);
    expect(jetonFantaisiste.status).toBe(204);
  });

  it('exige d’être authentifié', async () => {
    const reponse = await request(app).post('/api/auth/logout').send({ refreshToken: 'x' });
    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('TOKEN_INVALID');
  });

  it('ne permet pas de révoquer la session d’un autre compte', async () => {
    const victime = ajouterCompte({ email: 'victime@bureau-etudes.sn' });
    const attaquant = ajouterCompte({ email: 'attaquant@bureau-etudes.sn' });

    const sessionVictime = await ouvrirSessionDirecte(victime);
    const sessionAttaquant = await ouvrirSessionDirecte(attaquant);

    const reponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${sessionAttaquant.accessToken}`)
      .send({ refreshToken: sessionVictime.refreshToken });

    expect(reponse.status).toBe(204);
    // La session de la victime est intacte.
    expect(etat.jetons[0]?.revoked_at).toBeNull();
  });
});

// =============================================================================
// GET /api/auth/me
// =============================================================================

describe('GET /api/auth/me', () => {
  it('renvoie exactement les six champs du contrat', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(reponse.status).toBe(200);
    expect(Object.keys(reponse.body.user).sort()).toEqual([
      'company',
      'email',
      'fullName',
      'id',
      'mustChangePassword',
      'role',
    ]);
  });

  it('exige un jeton', async () => {
    const reponse = await request(app).get('/api/auth/me');
    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('TOKEN_INVALID');
  });
});

// =============================================================================
// Obligation de changer le mot de passe
// =============================================================================

describe('mustChangePassword', () => {
  it('laisse passer les trois routes autorisées par le contrat', async () => {
    const compte = ajouterCompte({ must_change_password: true });
    const session = await ouvrirSessionDirecte(compte);
    const entete = `Bearer ${session.accessToken}`;

    const moi = await request(app).get('/api/auth/me').set('Authorization', entete);
    expect(moi.status).toBe(200);
    expect(moi.body.user.mustChangePassword).toBe(true);

    const deconnexion = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', entete)
      .send({ refreshToken: session.refreshToken });
    expect(deconnexion.status).toBe(204);

    // La route de changement répond sur le fond (ici : ancien mot de passe
    // faux), et non par un refus PASSWORD_CHANGE_REQUIRED.
    const changement = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', entete)
      .send({ currentPassword: 'faux', newPassword: 'un-nouveau-mot-de-passe-solide' });
    expect(changement.status).toBe(401);
    expect(changement.body.error.code).toBe('INVALID_CREDENTIALS');
  }, 20_000);
});

// =============================================================================
// POST /api/auth/change-password
// =============================================================================

describe('POST /api/auth/change-password', () => {
  const NOUVEAU = 'ma-nouvelle-phrase-de-passe-2026';

  it('change le mot de passe, révoque toutes les sessions et émet un couple neuf', async () => {
    const compte = ajouterCompte({ must_change_password: true });
    const ancienneSession = await ouvrirSessionDirecte(compte);
    const autreSession = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${ancienneSession.accessToken}`)
      .send({ currentPassword: MOT_DE_PASSE_TEST, newPassword: NOUVEAU });

    expect(reponse.status).toBe(200);
    expect(reponse.body.user.mustChangePassword).toBe(false);
    expect(typeof reponse.body.accessToken).toBe('string');
    expect(typeof reponse.body.refreshToken).toBe('string');

    // L'empreinte a bien changé, et l'obligation est levée.
    expect(compte.password_hash).not.toBe(empreinte);
    expect(compte.must_change_password).toBe(false);

    // Les deux anciennes sessions sont révoquées, au motif PASSWORD_CHANGE…
    const anciennes = etat.jetons.slice(0, 2);
    expect(anciennes.every((jeton) => jeton.revoked_at !== null)).toBe(true);
    expect(anciennes.every((jeton) => jeton.revoked_reason === 'PASSWORD_CHANGE')).toBe(true);

    // …tandis que la session courante, elle, fonctionne.
    const nouvelle = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: reponse.body.refreshToken });
    expect(nouvelle.status).toBe(200);

    // L'autre appareil, resté allumé, tente un rafraîchissement avec son ancien
    // jeton. Il est refusé — c'est bien le but d'un changement de mot de passe —
    // mais ce n'est PAS une intrusion : la session en cours doit y survivre.
    const rejeu = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: autreSession.refreshToken });
    expect(rejeu.status).toBe(401);
    expect(actionsJournalisees()).not.toContain('REFRESH_TOKEN_REUSE');

    // Preuve que la session en cours a survécu : elle se rafraîchit encore.
    const encore = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: nouvelle.body.refreshToken });
    expect(encore.status).toBe(200);

    expect(actionsJournalisees()).toContain('PASSWORD_CHANGED');
  }, 30_000);

  it('permet ensuite de se connecter avec le nouveau mot de passe, plus avec l’ancien', async () => {
    const compte = ajouterCompte({ email: 'jean@bureau-etudes.sn', must_change_password: true });
    const session = await ouvrirSessionDirecte(compte);

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: MOT_DE_PASSE_TEST, newPassword: NOUVEAU });

    const avecNouveau = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: NOUVEAU });
    expect(avecNouveau.status).toBe(200);
    expect(avecNouveau.body.user.mustChangePassword).toBe(false);

    const avecAncien = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: MOT_DE_PASSE_TEST });
    expect(avecAncien.status).toBe(401);
  }, 30_000);

  it('refuse un mot de passe actuel faux', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'pas-le-bon', newPassword: NOUVEAU });

    expect(reponse.status).toBe(401);
    expect(reponse.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(compte.password_hash).toBe(empreinte);
  }, 20_000);

  it('refuse un nouveau mot de passe trop faible', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    for (const faible of ['court', 'password123']) {
      const reponse = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: MOT_DE_PASSE_TEST, newPassword: faible });

      expect(reponse.status).toBe(400);
      expect(reponse.body.error.code).toBe('PASSWORD_TOO_WEAK');
      expect(typeof reponse.body.error.message).toBe('string');
    }
    expect(compte.password_hash).toBe(empreinte);
  }, 30_000);

  it('refuse un nouveau mot de passe identique à l’ancien', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: MOT_DE_PASSE_TEST, newPassword: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('PASSWORD_UNCHANGED');
    expect(compte.password_hash).toBe(empreinte);
  }, 20_000);

  it('refuse une requête incomplète', async () => {
    const compte = ajouterCompte();
    const session = await ouvrirSessionDirecte(compte);

    const reponse = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ newPassword: NOUVEAU });

    expect(reponse.status).toBe(400);
    expect(reponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('exige d’être authentifié', async () => {
    const reponse = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: MOT_DE_PASSE_TEST, newPassword: NOUVEAU });

    expect(reponse.status).toBe(401);
  });
});

// =============================================================================
// Propriétés transverses
// =============================================================================

describe('Aucune fuite d’information', () => {
  it('aucune réponse ne contient d’empreinte de mot de passe', async () => {
    const compte = ajouterCompte({ email: 'jean@bureau-etudes.sn' });
    const session = await ouvrirSessionDirecte(compte);

    const reponses = [
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'jean@bureau-etudes.sn', password: MOT_DE_PASSE_TEST }),
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${session.accessToken}`),
      await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken }),
    ];

    for (const reponse of reponses) {
      const corps = JSON.stringify(reponse.body);
      expect(corps).not.toContain('password_hash');
      expect(corps).not.toContain('passwordHash');
      expect(corps).not.toContain('scrypt$');
      expect(corps).not.toContain(empreinte);
      expect(corps).not.toContain(MOT_DE_PASSE_TEST);
    }
  }, 20_000);

  it('aucune réponse d’erreur ne révèle l’existence d’un compte', async () => {
    ajouterCompte({ email: 'existe@bureau-etudes.sn' });

    const existant = await request(app)
      .post('/api/auth/login')
      .send({ email: 'existe@bureau-etudes.sn', password: 'faux' });
    const inexistant = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nexiste-pas@bureau-etudes.sn', password: 'faux' });

    expect(existant.status).toBe(inexistant.status);
    expect(existant.body).toEqual(inexistant.body);
    expect(existant.headers['content-length']).toBe(inexistant.headers['content-length']);
  }, 20_000);

  it('le journal d’activité ne contient ni mot de passe ni jeton', async () => {
    const compte = ajouterCompte({ email: 'jean@bureau-etudes.sn' });

    const connexion = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jean@bureau-etudes.sn', password: MOT_DE_PASSE_TEST });

    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: connexion.body.refreshToken });

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${connexion.body.accessToken}`)
      .send({ refreshToken: connexion.body.refreshToken });

    const journalise = JSON.stringify(etat.journal);
    expect(journalise).not.toContain(MOT_DE_PASSE_TEST);
    expect(journalise).not.toContain(connexion.body.accessToken);
    expect(journalise).not.toContain(connexion.body.refreshToken);
    expect(journalise).not.toContain(compte.password_hash);
    // Pas même un fragment de jeton.
    expect(journalise).not.toContain(String(connexion.body.refreshToken).slice(0, 12));
  }, 20_000);
});
