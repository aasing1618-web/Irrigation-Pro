/**
 * Jetons de session (décision D-005).
 *
 * Deux objets de nature très différente — ne pas les confondre :
 *
 * 1. **Le jeton d'accès** est un JWT signé HS256, valable 15 minutes. Il est
 *    autoportant : le serveur le vérifie sans toucher la base. C'est ce qui le
 *    rend rapide, et c'est aussi ce qui le rend **non révocable** — d'où sa
 *    durée courte.
 *
 * 2. **Le jeton de rafraîchissement n'est PAS un JWT.** C'est une simple valeur
 *    aléatoire de 32 octets. Sa validité ne se déduit pas de son contenu : elle
 *    se lit en base, ce qui permet de le révoquer à tout instant (rotation,
 *    déconnexion, suspension de compte). En base on ne range que son empreinte
 *    SHA-256 : une fuite de la table ne donne aucune session utilisable.
 *
 * Pourquoi SHA-256 et pas `scrypt` pour le jeton de rafraîchissement : `scrypt`
 * sert à compenser la faible entropie d'un mot de passe humain. Un tirage
 * aléatoire de 256 bits n'a rien à compenser — le forcer coûterait un temps
 * astronomique quelle que soit la fonction de hachage.
 *
 * Ce que la charge utile du JWT ne contient PAS, volontairement : le statut du
 * compte et `mustChangePassword`. Ces deux valeurs changent en cours de session
 * (une suspension doit prendre effet tout de suite, cf. D-010) ; les figer dans
 * un jeton de 15 minutes reviendrait à laisser un compte suspendu travailler
 * jusqu'à l'expiration.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

import { config } from '../config.js';
import { tokenInvalid } from './errors.js';
import type { UserRole } from './user-view.js';

/** Émetteur attendu dans tout jeton d'accès. */
export const JWT_ISSUER = 'irrigation-pro';
/** Destinataire attendu dans tout jeton d'accès. */
export const JWT_AUDIENCE = 'irrigation-pro-app';

const ALGORITHME = 'HS256';

const cleDeSignature = new TextEncoder().encode(config.jwtSecret);

/** Charge utile d'un jeton d'accès, telle que définie par le contrat (§ 1). */
export interface AccessTokenPayload {
  /** Identifiant du compte. */
  sub: string;
  role: UserRole;
  /** Émission (secondes Unix). */
  iat: number;
  /** Expiration (secondes Unix). */
  exp: number;
  /** Identifiant unique du jeton, utile pour tracer une session. */
  jti: string;
}

/** Résultat d'un tirage de jeton de rafraîchissement. */
export interface RefreshTokenMaterial {
  /** Valeur remise au client. N'est jamais stockée ni journalisée. */
  token: string;
  /** Empreinte SHA-256 : la seule chose qui va en base. */
  tokenHash: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Durées
// ---------------------------------------------------------------------------

const SECONDES_PAR_UNITE: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
};

/**
 * Convertit une durée du type « 15m », « 2h », « 7d » en secondes.
 * Le format est déjà validé par `config.ts` ; la valeur de repli couvre le cas
 * où quelqu'un contournerait cette validation.
 */
function dureeEnSecondes(duree: string): number {
  const correspondance = /^(\d+)([smhd])$/.exec(duree);
  if (!correspondance) return 900;
  const [, nombre, unite] = correspondance;
  const facteur = unite ? SECONDES_PAR_UNITE[unite] : undefined;
  if (!nombre || !facteur) return 900;
  return Number(nombre) * facteur;
}

/** Durée de vie du jeton d'accès, en secondes (`expiresIn` des réponses). */
export const ACCESS_TOKEN_TTL_SECONDS: number = dureeEnSecondes(config.accessTokenTtl);

/** Durée de vie du jeton de rafraîchissement, en millisecondes. */
const REFRESH_TOKEN_TTL_MS = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Jeton d'accès
// ---------------------------------------------------------------------------

/** Signe un jeton d'accès pour un compte donné. */
export async function signAccessToken(user: { id: string; role: UserRole }): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);

  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: ALGORITHME, typ: 'JWT' })
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt(maintenant)
    .setExpirationTime(maintenant + ACCESS_TOKEN_TTL_SECONDS)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(cleDeSignature);
}

/**
 * Vérifie un jeton d'accès et renvoie sa charge utile.
 *
 * Lève systématiquement `tokenInvalid()` (401 `TOKEN_INVALID`) en cas de
 * problème, quel qu'il soit : signature fausse, jeton expiré, émetteur ou
 * destinataire inattendu, charge utile incomplète. On ne distingue jamais les
 * causes vis-à-vis du client — cela ne l'aiderait pas, et renseignerait un
 * attaquant sur ce qui lui manque.
 *
 * `algorithms: ['HS256']` n'est pas décoratif : sans cette contrainte, un
 * attaquant pourrait présenter un jeton annonçant `alg: none`.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  if (typeof token !== 'string' || token.length === 0) {
    throw tokenInvalid();
  }

  let charge: Record<string, unknown>;
  try {
    const resultat = await jwtVerify(token, cleDeSignature, {
      algorithms: [ALGORITHME],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    charge = resultat.payload as Record<string, unknown>;
  } catch {
    throw tokenInvalid();
  }

  const sub = charge['sub'];
  const role = charge['role'];
  const iat = charge['iat'];
  const exp = charge['exp'];
  const jti = charge['jti'];

  if (typeof sub !== 'string' || sub.length === 0) throw tokenInvalid();
  if (role !== 'CLIENT' && role !== 'ADMIN') throw tokenInvalid();
  if (typeof iat !== 'number' || typeof exp !== 'number') throw tokenInvalid();
  if (typeof jti !== 'string' || jti.length === 0) throw tokenInvalid();

  return { sub, role, iat, exp, jti };
}

// ---------------------------------------------------------------------------
// Jeton de rafraîchissement
// ---------------------------------------------------------------------------

/** Empreinte SHA-256, en hexadécimal, d'un jeton de rafraîchissement. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Tire un jeton de rafraîchissement neuf, avec son empreinte et son échéance. */
export function generateRefreshToken(): RefreshTokenMaterial {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  };
}
