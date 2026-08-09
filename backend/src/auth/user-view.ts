/**
 * Représentations d'un compte utilisées hors de la couche base de données.
 *
 * Une règle, une seule, mais absolue : **`password_hash` ne franchit jamais
 * cette frontière**. Les conversions ci-dessous sont le seul chemin autorisé
 * entre une ligne SQL et le reste du serveur, et aucune ne recopie l'empreinte.
 *
 * Les types de rôle et de statut sont redéfinis ici plutôt qu'importés de
 * `db/` : la couche d'authentification reste ainsi testable sans charger le
 * driver PostgreSQL.
 */

export type UserRole = 'CLIENT' | 'ADMIN';
export type UserStatus = 'ACTIF' | 'SUSPENDU';

/**
 * Forme minimale attendue d'une ligne `users`.
 *
 * Structurellement compatible avec `UserRow` du dépôt, sans en dépendre : on
 * ne cite ici que les colonnes réellement utilisées, et surtout pas
 * `password_hash`.
 */
export interface UserRowLike {
  id: string;
  email: string;
  full_name: string;
  company: string | null;
  role: UserRole;
  status: UserStatus;
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

/**
 * Compte authentifié, exposé au reste du serveur via `res.locals.user`.
 * En `camelCase`, et sans empreinte de mot de passe.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  company: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/**
 * Bloc `user` renvoyé par l'API (contrat, § 2).
 * Contient **exactement** les six champs prévus, ni plus, ni moins.
 */
export interface PublicUserView {
  id: string;
  email: string;
  fullName: string;
  company: string | null;
  role: UserRole;
  mustChangePassword: boolean;
}

/** Ligne SQL → compte authentifié interne. */
export function toAuthenticatedUser(row: UserRowLike): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    company: row.company,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

/** Compte authentifié → bloc `user` de la réponse HTTP. */
export function toPublicUserView(user: AuthenticatedUser): PublicUserView {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    company: user.company,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}
