/**
 * Dépôt « comptes » — toutes les requêtes SQL touchant la table `users`.
 *
 * Deux règles de sécurité tenues ici :
 *   1. Aucune fonction ne reçoit ni ne renvoie jamais de mot de passe en clair.
 *      Le hachage est réalisé en amont (module `auth/`), on ne manipule ici que
 *      des empreintes déjà calculées.
 *   2. `toPublicUser()` retire l'empreinte du mot de passe avant tout envoi
 *      vers l'API : c'est cette forme-là qui doit sortir du backend.
 *
 * Ce dépôt fournit l'accès aux données. Il ne contient AUCUNE décision
 * d'authentification : c'est `auth/` qui décide s'il faut verrouiller un
 * compte, à partir de combien de tentatives, et pour combien de temps.
 */

import type { Executor } from '../executor.js';
import { run } from '../executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = 'CLIENT' | 'ADMIN';
export type UserStatus = 'ACTIF' | 'SUSPENDU';

/**
 * Une ligne de la table `users`, telle qu'elle sort de PostgreSQL.
 * Déclarée en `type` (et non `interface`) : le driver `pg` exige un type
 * doté d'une signature d'index implicite, propre aux alias de type.
 */
export type UserRow = {
  id: string;
  email: string;
  /** Empreinte scrypt. Ne doit jamais quitter le backend. */
  password_hash: string;
  full_name: string;
  company: string | null;
  role: UserRole;
  status: UserStatus;
  must_change_password: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
};

/** Vue d'un compte destinée à sortir du backend (sans empreinte). */
export type PublicUser = Omit<UserRow, 'password_hash'>;

/** Données nécessaires à la création d'un compte par l'administrateur. */
export type CreateUserInput = {
  email: string;
  /** Empreinte déjà calculée du mot de passe temporaire. Jamais le mot de passe. */
  passwordHash: string;
  fullName: string;
  company?: string | null;
  role?: UserRole;
  /** Administrateur auteur de la création (NULL pour le tout premier compte). */
  createdBy?: string | null;
};

/** Colonnes renvoyées par toutes les lectures : liste explicite, pas de `SELECT *`. */
const USER_COLUMNS = `
  id, email, password_hash, full_name, company, role, status,
  must_change_password, failed_login_attempts, locked_until,
  last_login_at, created_at, updated_at, created_by
`;

/** Retire l'empreinte du mot de passe avant exposition. */
export function toPublicUser(user: UserRow): PublicUser {
  const { password_hash: _passwordHash, ...rest } = user;
  return rest;
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/**
 * Recherche un compte par e-mail, sans tenir compte de la casse.
 *
 * La comparaison porte sur `lower(email)` des DEUX côtés : c'est exactement
 * l'expression de l'index unique `users_email_unique_idx` créé en migration
 * 001, donc PostgreSQL utilise cet index au lieu de parcourir la table.
 * Écrire `email ILIKE $1` donnerait le même résultat mais serait lent.
 */
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await run<UserRow>(
    undefined,
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

/** Recherche un compte par identifiant. */
export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await run<UserRow>(
    undefined,
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Liste des comptes pour le dashboard admin (du plus récent au plus ancien). */
export async function listUsers(
  options: { limit?: number; offset?: number } = {},
  client?: Executor,
): Promise<PublicUser[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const { rows } = await run<UserRow>(
    client,
    `SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map(toPublicUser);
}

/** Nombre total de comptes (pagination du dashboard admin). */
export async function countUsers(client?: Executor): Promise<number> {
  const { rows } = await run<{ total: string }>(client, 'SELECT count(*)::text AS total FROM users');
  return Number(rows[0]?.total ?? 0);
}

/**
 * Nombre de comptes administrateur, tous statuts confondus.
 *
 * Utilisé par la commande `npm run creer-admin`, qui refuse de créer un second
 * administrateur sans `--force`. On compte AUSSI les administrateurs suspendus :
 * un compte suspendu peut être réactivé, il existe donc bel et bien.
 *
 * `count(*)` renvoie un `bigint`, que le driver `pg` remonte en chaîne pour ne
 * pas perdre de précision : on le convertit explicitement en texte puis en
 * nombre plutôt que de dépendre du comportement par défaut.
 */
export async function countAdmins(): Promise<number> {
  const { rows } = await run<{ total: string }>(
    undefined,
    `SELECT count(*)::text AS total FROM users WHERE role = 'ADMIN'`,
  );
  return Number(rows[0]?.total ?? 0);
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/**
 * Crée un compte. Réservé à l'administrateur (il n'y a pas d'inscription libre).
 * `must_change_password` reste à `true` (valeur par défaut de la colonne) : le
 * client devra remplacer le mot de passe temporaire à sa première connexion.
 */
export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const { rows } = await run<UserRow>(
    undefined,
    `INSERT INTO users (email, password_hash, full_name, company, role, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${USER_COLUMNS}`,
    [
      input.email.trim(),
      input.passwordHash,
      input.fullName.trim(),
      input.company ?? null,
      input.role ?? 'CLIENT',
      input.createdBy ?? null,
    ],
  );
  const created = rows[0];
  if (!created) throw new Error('Création du compte impossible : aucune ligne renvoyée.');
  return created;
}

/**
 * Tentative de connexion ÉCHOUÉE : incrémente le compteur et renvoie sa
 * nouvelle valeur.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  POURQUOI UN SEUL `UPDATE … RETURNING` ET PAS UN `SELECT` PUIS UN `UPDATE`
 * ═══════════════════════════════════════════════════════════════════════
 *  Un attaquant peut envoyer dix tentatives EN MÊME TEMPS. Si l'on lisait
 *  le compteur, puis qu'on écrivait `compteur + 1`, les dix requêtes
 *  liraient la même valeur et écriraient toutes le même résultat : le
 *  compteur avancerait de 1 au lieu de 10, et le verrouillage anti
 *  brute-force serait contournable en parallélisant les essais.
 *
 *  Ici, `failed_login_attempts = failed_login_attempts + 1` est évalué par
 *  PostgreSQL lui-même : chaque UPDATE verrouille la ligne, attend son tour
 *  et repart de la valeur réellement à jour. Le compteur est exact même
 *  sous attaque, et `RETURNING` nous donne la valeur qui vient d'être
 *  écrite — celle sur laquelle `auth/` prendra sa décision.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * @param lockUntil  Date de fin de verrouillage décidée par `auth/`, ou
 *                   `null` pour ne PAS toucher au verrouillage en cours
 *                   (`COALESCE` conserve alors la valeur existante — un
 *                   verrou déjà posé ne doit jamais être levé par un échec).
 * @returns Le nouveau compteur, ou `0` si l'identifiant n'existe pas.
 */
export async function registerFailedLogin(
  userId: string,
  lockUntil: Date | null,
): Promise<number> {
  const { rows } = await run<{ failed_login_attempts: number }>(
    undefined,
    `UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until          = COALESCE($2::timestamptz, locked_until)
      WHERE id = $1
      RETURNING failed_login_attempts`,
    [userId, lockUntil],
  );
  return rows[0]?.failed_login_attempts ?? 0;
}

/**
 * Tentative de connexion RÉUSSIE : horodate la connexion, remet le compteur
 * d'échecs à zéro et lève tout verrouillage temporaire en cours.
 *
 * Un verrouillage n'est PAS une suspension : il disparaît dès que le client
 * retrouve son mot de passe, et le propriétaire n'a rien à faire.
 */
export async function registerSuccessfulLogin(userId: string): Promise<void> {
  await run(
    undefined,
    `UPDATE users
        SET last_login_at         = now(),
            failed_login_attempts = 0,
            locked_until          = NULL
      WHERE id = $1`,
    [userId],
  );
}

/**
 * Remplace l'empreinte du mot de passe.
 *
 * Effets de bord volontaires, tous nécessaires :
 *   * `must_change_password` passe à `false` — c'est le seul chemin de sortie
 *     de l'écran de changement obligatoire imposé à la première connexion ;
 *   * le compteur d'échecs et le verrouillage sont remis à zéro : le mot de
 *     passe ayant changé, les anciens échecs n'ont plus de sens.
 *
 * La révocation des sessions longues (exigée par le contrat d'API) n'est PAS
 * faite ici : elle relève de `refresh-tokens.repo.ts` (`revokeAllUserTokens`),
 * et c'est `auth/` qui enchaîne les deux.
 */
export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await run(
    undefined,
    `UPDATE users
        SET password_hash         = $2,
            must_change_password  = false,
            failed_login_attempts = 0,
            locked_until          = NULL
      WHERE id = $1`,
    [userId, passwordHash],
  );
}

/** Bascule un compte en ACTIF ou SUSPENDU (seul contrôle d'accès du produit). */
export async function updateUserStatus(
  id: string,
  status: UserStatus,
  client?: Executor,
): Promise<UserRow | null> {
  const { rows } = await run<UserRow>(
    client,
    `UPDATE users SET status = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, status],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Aide au calcul (fonction pure, sans accès à la base)
// ---------------------------------------------------------------------------

/** Un compte est-il actuellement verrouillé ? */
export function isLocked(user: UserRow, now: Date = new Date()): boolean {
  return user.locked_until !== null && user.locked_until.getTime() > now.getTime();
}
