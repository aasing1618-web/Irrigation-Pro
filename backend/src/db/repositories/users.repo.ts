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
 * Squelette de Vague 0 : les fonctions existent et sont typées, elles seront
 * appelées par les Vagues 1 (connexion) et 3 (dashboard admin).
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

/** Recherche un compte par e-mail, sans tenir compte de la casse. */
export async function findUserByEmail(email: string, client?: Executor): Promise<UserRow | null> {
  const { rows } = await run<UserRow>(
    client,
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

/** Recherche un compte par identifiant. */
export async function findUserById(id: string, client?: Executor): Promise<UserRow | null> {
  const { rows } = await run<UserRow>(
    client,
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

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/**
 * Crée un compte. Réservé à l'administrateur (il n'y a pas d'inscription libre).
 * `must_change_password` reste à `true` : le client devra remplacer le mot de
 * passe temporaire à sa première connexion.
 */
export async function createUser(input: CreateUserInput, client?: Executor): Promise<UserRow> {
  const { rows } = await run<UserRow>(
    client,
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
 * Remplace l'empreinte du mot de passe et lève l'obligation de changement.
 * Utilisé au premier changement de mot de passe, et lors d'une réinitialisation.
 */
export async function updatePasswordHash(
  id: string,
  passwordHash: string,
  options: { mustChangePassword?: boolean } = {},
  client?: Executor,
): Promise<UserRow | null> {
  const { rows } = await run<UserRow>(
    client,
    `UPDATE users
        SET password_hash = $2,
            must_change_password = $3,
            failed_login_attempts = 0,
            locked_until = NULL
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [id, passwordHash, options.mustChangePassword ?? false],
  );
  return rows[0] ?? null;
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

/** Connexion réussie : horodatage et remise à zéro du compteur anti brute-force. */
export async function markLoginSuccess(id: string, client?: Executor): Promise<void> {
  await run(
    client,
    `UPDATE users
        SET last_login_at = now(),
            failed_login_attempts = 0,
            locked_until = NULL
      WHERE id = $1`,
    [id],
  );
}

/**
 * Connexion échouée : incrémente le compteur et renvoie sa nouvelle valeur.
 * C'est la couche `auth/` qui décide, à partir de ce nombre, s'il faut
 * verrouiller le compte (`lockUser`).
 */
export async function markLoginFailure(id: string, client?: Executor): Promise<number> {
  const { rows } = await run<{ failed_login_attempts: number }>(
    client,
    `UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1
      WHERE id = $1
      RETURNING failed_login_attempts`,
    [id],
  );
  return rows[0]?.failed_login_attempts ?? 0;
}

/** Verrouille temporairement la connexion d'un compte (anti brute-force). */
export async function lockUser(id: string, until: Date, client?: Executor): Promise<void> {
  await run(client, 'UPDATE users SET locked_until = $2 WHERE id = $1', [id, until]);
}

/** Un compte est-il actuellement verrouillé ? */
export function isLocked(user: UserRow, now: Date = new Date()): boolean {
  return user.locked_until !== null && user.locked_until.getTime() > now.getTime();
}
