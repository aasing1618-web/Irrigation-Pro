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

import type { PoolClient } from 'pg';

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

/**
 * Mêmes colonnes, **sans l'empreinte**, préfixées `u.` pour les requêtes qui
 * joignent une autre table.
 *
 * Utilisée par les lectures du dashboard administrateur. `toPublicUser()`
 * suffirait à retirer l'empreinte après coup ; ne pas la SÉLECTIONNER du tout
 * est une barrière de plus : l'empreinte ne quitte même pas PostgreSQL, et un
 * futur `res.json(ligne)` maladroit ne pourrait rien divulguer.
 */
const USER_PUBLIC_COLUMNS_PREFIXED = `
  u.id, u.email, u.full_name, u.company, u.role, u.status,
  u.must_change_password, u.failed_login_attempts, u.locked_until,
  u.last_login_at, u.created_at, u.updated_at, u.created_by
`;

/** Retire l'empreinte du mot de passe avant exposition. */
export function toPublicUser(user: UserRow): PublicUser {
  const { password_hash: _passwordHash, ...rest } = user;
  return rest;
}

/**
 * Prépare un motif `ILIKE` à partir d'un texte saisi par l'administrateur.
 *
 * Le texte part en paramètre `$n` : aucun risque d'injection SQL. L'échappement
 * sert à autre chose — empêcher qu'un `%` ou un `_` tapé dans la barre de
 * recherche ne devienne un joker et ne ramène toute la liste des comptes.
 */
function motifRecherche(texte: string): string {
  const échappé = texte.replace(/[\\%_]/g, (caractère) => `\\${caractère}`);
  return `%${échappé}%`;
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
export async function findUserByEmail(email: string, client?: Executor): Promise<UserRow | null> {
  const { rows } = await run<UserRow>(
    client,
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

/** Filtres de la liste des comptes (contrat d'API Vague 3, § 2). */
export type ListUsersOptions = {
  status?: UserStatus | null;
  role?: UserRole | null;
  /** Texte libre, cherché dans l'e-mail, le nom complet et la société. */
  search?: string | null;
  limit?: number;
  offset?: number;
};

/**
 * Un compte tel que le dashboard administrateur le lit : sans empreinte, avec
 * le nombre de projets vivants du compte.
 *
 * ⚠ `project_count` est un COMPTEUR, pas un accès au contenu : le propriétaire
 * voit combien de projets un client possède, jamais ce qu'ils contiennent
 * (contrat Vague 3, § 2 — garde-fous).
 */
export type AdminUserRow = PublicUser & { project_count: string };

/** Bornes de pagination communes à la liste et au comptage. */
function bornerPagination(options: ListUsersOptions): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(options.limit ?? 50, 1), 200),
    offset: Math.max(options.offset ?? 0, 0),
  };
}

/**
 * Liste filtrée des comptes pour le dashboard admin (du plus récent au plus
 * ancien).
 *
 * L'empreinte du mot de passe n'est pas sélectionnée — voir
 * `USER_PUBLIC_COLUMNS_PREFIXED`.
 */
export async function listUsers(
  options: ListUsersOptions = {},
  client?: Executor,
): Promise<AdminUserRow[]> {
  const { limit, offset } = bornerPagination(options);
  const recherche = options.search?.trim() ? motifRecherche(options.search.trim()) : null;

  const { rows } = await run<AdminUserRow>(
    client,
    `SELECT ${USER_PUBLIC_COLUMNS_PREFIXED},
            (SELECT count(*) FROM projects p
              WHERE p.owner_id = u.id AND p.deleted_at IS NULL)::text AS project_count
       FROM users u
      WHERE ($1::user_status IS NULL OR u.status = $1)
        AND ($2::user_role   IS NULL OR u.role = $2)
        AND ($3::text IS NULL
             OR u.email ILIKE $3 ESCAPE '\\'
             OR u.full_name ILIKE $3 ESCAPE '\\'
             OR coalesce(u.company, '') ILIKE $3 ESCAPE '\\')
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT $4 OFFSET $5`,
    [options.status ?? null, options.role ?? null, recherche, limit, offset],
  );
  return rows;
}

/**
 * Un compte précis, dans la même forme que la liste du dashboard : sans
 * empreinte, avec son nombre de projets.
 *
 * `findUserById` existe déjà, mais elle ramène `password_hash` — c'est
 * nécessaire à l'authentification, et hors de question pour une lecture
 * destinée à être affichée. Deux fonctions, deux usages, aucune confusion
 * possible.
 */
export async function getUserForAdmin(
  id: string,
  client?: Executor,
): Promise<AdminUserRow | null> {
  const { rows } = await run<AdminUserRow>(
    client,
    `SELECT ${USER_PUBLIC_COLUMNS_PREFIXED},
            (SELECT count(*) FROM projects p
              WHERE p.owner_id = u.id AND p.deleted_at IS NULL)::text AS project_count
       FROM users u
      WHERE u.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Nombre de comptes correspondant aux MÊMES filtres que `listUsers`, page mise
 * à part : sans cela le dashboard ne pourrait pas paginer.
 */
export async function countUsers(
  options: Pick<ListUsersOptions, 'status' | 'role' | 'search'> = {},
  client?: Executor,
): Promise<number> {
  const recherche = options.search?.trim() ? motifRecherche(options.search.trim()) : null;

  const { rows } = await run<{ total: string }>(
    client,
    `SELECT count(*)::text AS total
       FROM users u
      WHERE ($1::user_status IS NULL OR u.status = $1)
        AND ($2::user_role   IS NULL OR u.role = $2)
        AND ($3::text IS NULL
             OR u.email ILIKE $3 ESCAPE '\\'
             OR u.full_name ILIKE $3 ESCAPE '\\'
             OR coalesce(u.company, '') ILIKE $3 ESCAPE '\\')`,
    [options.status ?? null, options.role ?? null, recherche],
  );
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
 *
 * Le `client` optionnel permet à la route d'administration de valider la
 * création du compte et sa trace dans `admin_actions` en une seule transaction :
 * un compte créé sans trace, ou une trace sans compte, seraient tous deux
 * incompréhensibles à la relecture.
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

/**
 * Bascule un compte en ACTIF ou SUSPENDU (seul contrôle d'accès du produit).
 *
 * ⚠ Les routes d'administration n'utilisent PAS cette fonction : elles passent
 * par `suspendUser` / `reactivateUser`, qui portent en plus les effets exigés
 * par le contrat (remise à zéro du compteur d'échecs et levée du verrou à la
 * réactivation) et ne ramènent jamais l'empreinte du mot de passe.
 */
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
// Administration des comptes (Vague 3)
//
// Toutes les fonctions ci-dessous renvoient la forme PUBLIQUE d'un compte :
// l'empreinte n'est pas dans le `RETURNING`, elle ne remonte donc jamais
// jusqu'à la couche API.
// ---------------------------------------------------------------------------

/** Mêmes colonnes que `USER_PUBLIC_COLUMNS_PREFIXED`, sans préfixe de table. */
const USER_PUBLIC_COLUMNS = `
  id, email, full_name, company, role, status,
  must_change_password, failed_login_attempts, locked_until,
  last_login_at, created_at, updated_at, created_by
`;

/** Champs qu'un administrateur peut modifier (contrat Vague 3, § 2). */
export type UpdateUserProfileInput = {
  fullName?: string;
  company?: string | null;
  role?: UserRole;
};

/**
 * Modifie le profil d'un compte.
 *
 * Ni l'e-mail (identifiant de connexion) ni le statut (il exige un motif, donc
 * sa propre route) ne figurent ici : ce n'est pas un oubli, c'est le contrat.
 * `COALESCE($n, colonne)` laisse inchangé tout champ non fourni.
 *
 * `company` est le seul champ légitimement effaçable ; `$3::boolean` dit
 * explicitement « on touche à la société », ce qu'un simple `NULL` ne saurait
 * distinguer de « on n'y touche pas ».
 */
export async function updateUserProfile(
  id: string,
  patch: UpdateUserProfileInput,
  client?: Executor,
): Promise<PublicUser | null> {
  const { rows } = await run<PublicUser>(
    client,
    `UPDATE users
        SET full_name = COALESCE($2::text, full_name),
            company   = CASE WHEN $4::boolean THEN $3::text ELSE company END,
            role      = COALESCE($5::user_role, role)
      WHERE id = $1
      RETURNING ${USER_PUBLIC_COLUMNS}`,
    [
      id,
      patch.fullName?.trim() ?? null,
      patch.company ?? null,
      patch.company !== undefined,
      patch.role ?? null,
    ],
  );
  return rows[0] ?? null;
}

/**
 * Suspend un compte. Le compteur d'échecs et le verrou ne sont pas touchés :
 * une suspension n'est pas un verrouillage anti brute-force, les deux états
 * sont indépendants.
 *
 * La révocation des sessions longues, qui rend la suspension immédiate
 * (D-010), relève de `refresh-tokens.repo.ts` : c'est la route qui enchaîne
 * les deux.
 */
export async function suspendUser(id: string, client?: Executor): Promise<PublicUser | null> {
  const { rows } = await run<PublicUser>(
    client,
    `UPDATE users SET status = 'SUSPENDU' WHERE id = $1 RETURNING ${USER_PUBLIC_COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Réactive un compte : statut `ACTIF`, compteur de tentatives remis à zéro et
 * verrou éventuel levé — les trois effets exigés par le contrat.
 *
 * Le verrou est levé parce qu'un compte réactivé qui resterait bloqué « encore
 * 12 minutes » sans explication ferait passer une décision commerciale du
 * propriétaire pour une panne.
 */
export async function reactivateUser(id: string, client?: Executor): Promise<PublicUser | null> {
  const { rows } = await run<PublicUser>(
    client,
    `UPDATE users
        SET status                = 'ACTIF',
            failed_login_attempts = 0,
            locked_until          = NULL
      WHERE id = $1
      RETURNING ${USER_PUBLIC_COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Réinitialise le mot de passe depuis le dashboard : nouvelle empreinte, et
 * `must_change_password` remis à **vrai**.
 *
 * C'est exactement l'inverse de `updatePassword`, qui passe ce même drapeau à
 * `false` : là, c'est le client qui choisit son mot de passe ; ici, c'est le
 * propriétaire qui en communique un temporaire, que le client devra remplacer
 * dès sa prochaine connexion. Deux fonctions distinctes plutôt qu'un
 * paramètre booléen : l'erreur d'inattention deviendrait invisible.
 */
export async function resetUserPassword(
  id: string,
  passwordHash: string,
  client?: Executor,
): Promise<PublicUser | null> {
  const { rows } = await run<PublicUser>(
    client,
    `UPDATE users
        SET password_hash         = $2,
            must_change_password  = true,
            failed_login_attempts = 0,
            locked_until          = NULL
      WHERE id = $1
      RETURNING ${USER_PUBLIC_COLUMNS}`,
    [id, passwordHash],
  );
  return rows[0] ?? null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VERROU ANTI-AUTO-ENFERMEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *  Renvoie les identifiants de TOUS les administrateurs actifs, en **verrouillant
 *  leurs lignes** jusqu'à la fin de la transaction en cours.
 *
 *  Pourquoi verrouiller l'ensemble, et pas seulement le compte visé : il n'y a
 *  aucune inscription dans Irrigation Pro. Si le dernier administrateur actif
 *  perd son accès, personne — pas même le propriétaire — ne peut le lui rendre
 *  depuis le produit ; il faut repasser par la ligne de commande sur le
 *  serveur. Ce n'est donc pas une règle de confort, c'est ce qui empêche le
 *  propriétaire d'être enfermé hors de son propre logiciel.
 *
 *  Le cas que ce verrou traite, et qu'un simple `SELECT count(*)` laisserait
 *  passer : deux suspensions SIMULTANÉES des deux derniers administrateurs.
 *  Chacune lit « il en reste un autre », chacune s'autorise, et il n'en reste
 *  aucun. En verrouillant l'ensemble des administrateurs actifs — toujours dans
 *  le même ordre (`ORDER BY id`), ce qui exclut tout interblocage — la seconde
 *  transaction attend la première, puis relit l'état réel : en READ COMMITTED,
 *  `FOR UPDATE` réévalue la condition après obtention du verrou, si bien que
 *  l'administrateur que la première vient de suspendre ne fait plus partie du
 *  résultat. La seconde voit alors qu'elle est en train de retirer le dernier,
 *  et se voit refusée.
 *
 *  ⚠ À n'appeler QUE dans une transaction (`withTransaction`) : hors
 *    transaction, le verrou serait relâché immédiatement et ne protégerait
 *    rien. C'est pourquoi le paramètre `client` est obligatoire ici.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function lockActiveAdminIds(client: PoolClient): Promise<string[]> {
  const { rows } = await run<{ id: string }>(
    client,
    `SELECT id
       FROM users
      WHERE role = 'ADMIN' AND status = 'ACTIF'
      ORDER BY id
      FOR UPDATE`,
  );
  return rows.map((ligne) => ligne.id);
}

/**
 * Relit un compte en verrouillant sa ligne, pour que son rôle et son statut ne
 * changent pas entre la vérification des garde-fous et l'écriture.
 *
 * ⚠ Ordre d'acquisition imposé : `lockActiveAdminIds` d'abord, cette fonction
 *   ensuite. Toutes les transactions prenant leurs verrous dans le même ordre,
 *   aucune ne peut en attendre une autre en sens inverse (interblocage).
 */
export async function findUserByIdForUpdate(
  id: string,
  client: PoolClient,
): Promise<PublicUser | null> {
  const { rows } = await run<PublicUser>(
    client,
    `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
    [id],
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
