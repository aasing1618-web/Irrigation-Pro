/**
 * Dépôt « sessions longues » — table `refresh_tokens`.
 *
 * L'application installée doit rester connectée plusieurs jours sans
 * redemander le mot de passe (cf. docs/DECISIONS.md, D-005). Elle conserve
 * pour cela un « jeton de rafraîchissement » de longue durée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QUI EST STOCKÉ ICI N'EST JAMAIS LE JETON LUI-MÊME
 * ═══════════════════════════════════════════════════════════════════════════
 *  La base ne contient que son EMPREINTE (sha256, calculée par `auth/`).
 *  Une empreinte ne permet pas de retrouver le jeton : même si la base
 *  fuitait entièrement, aucune session ne pourrait être usurpée avec son
 *  contenu. C'est le même principe que pour les mots de passe.
 *
 *  Conséquence pratique : toutes les fonctions de ce fichier prennent un
 *  `tokenHash`, jamais un jeton. Si vous vous apprêtez à passer ici la valeur
 *  brute envoyée par le client, c'est qu'il manque un hachage en amont.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce dépôt fournit l'accès aux données ; la rotation des jetons, la détection
 * de réutilisation et les décisions associées appartiennent à `auth/`.
 */

import { run } from '../executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Pourquoi une session a été fermée (migration 003, type `token_revocation_reason`).
 *
 * Ce motif n'est pas décoratif : il commande la réaction du serveur quand un
 * jeton déjà révoqué est présenté à `/api/auth/refresh`.
 *
 *   * `ROTATION`        — le jeton a été remplacé par un rafraîchissement.
 *                         S'il revient, deux copies circulent : c'est la
 *                         signature d'un vol, et le SEUL cas qui justifie de
 *                         couper toutes les sessions du compte.
 *   * `LOGOUT`          — déconnexion volontaire.
 *   * `PASSWORD_CHANGE` — changement de mot de passe (toutes les sessions sont
 *                         refermées, c'est normal et c'est voulu).
 *   * `ADMIN`           — fermeture décidée côté serveur ou par le propriétaire
 *                         (suspension du compte, ménage technique).
 *
 * Les trois derniers motifs décrivent des situations parfaitement banales : un
 * appareil resté allumé qui n'avait pas vu la nouvelle. Les traiter comme une
 * intrusion déconnecterait l'utilisateur légitime en plein travail.
 */
export type RevocationReason = 'ROTATION' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'ADMIN';

/**
 * Une ligne de `refresh_tokens`.
 * Déclarée en `type` (et non `interface`) : contrainte du driver `pg`.
 */
export type RefreshTokenRow = {
  id: string;
  user_id: string;
  /** Empreinte sha256 du jeton. Jamais le jeton en clair. */
  token_hash: string;
  expires_at: Date;
  /** Renseignée dès que la session est fermée ou invalidée. `null` = active. */
  revoked_at: Date | null;
  /**
   * Motif de la révocation. `null` si et seulement si `revoked_at` l'est —
   * la base fait respecter cette équivalence (`refresh_tokens_motif_coherent`).
   */
  revoked_reason: RevocationReason | null;
  user_agent: string | null;
  created_at: Date;
};

export type CreateRefreshTokenInput = {
  userId: string;
  /** Empreinte sha256 déjà calculée. */
  tokenHash: string;
  expiresAt: Date;
  /** Aide le propriétaire à reconnaître un appareil dans le dashboard. */
  userAgent?: string | null;
};

/** Colonnes renvoyées par toutes les lectures : liste explicite, pas de `SELECT *`. */
const TOKEN_COLUMNS = `
  id, user_id, token_hash, expires_at, revoked_at, revoked_reason, user_agent, created_at
`;

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/** Ouvre une session longue pour un compte. */
export async function createRefreshToken(
  input: CreateRefreshTokenInput,
): Promise<RefreshTokenRow> {
  const { rows } = await run<RefreshTokenRow>(
    undefined,
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)
     RETURNING ${TOKEN_COLUMNS}`,
    [input.userId, input.tokenHash, input.expiresAt, input.userAgent ?? null],
  );
  const created = rows[0];
  if (!created) throw new Error('Création de la session impossible : aucune ligne renvoyée.');
  return created;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Retrouve une session à partir de l'empreinte du jeton présenté.
 *
 * ⚠ Cette fonction ne filtre NI sur l'expiration NI sur la révocation :
 *   elle renvoie la ligne telle quelle, y compris si elle est expirée ou
 *   déjà révoquée. C'est VOULU — le contrat d'API impose de distinguer
 *   « jeton inconnu » de « jeton déjà révoqué », et parmi les jetons révoqués
 *   de distinguer le motif : seul un jeton révoqué pour `ROTATION` qui revient
 *   signale un vol et déclenche `REFRESH_TOKEN_REUSE`. Filtrer ici rendrait
 *   cette détection impossible.
 *
 *   C'est donc à `auth/` de vérifier `revoked_at`, `revoked_reason` et
 *   `expires_at`.
 */
export async function findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  const { rows } = await run<RefreshTokenRow>(
    undefined,
    `SELECT ${TOKEN_COLUMNS} FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Révocation
// ---------------------------------------------------------------------------

/**
 * Révoque une session précise (déconnexion, rotation d'un jeton).
 *
 * La condition `revoked_at IS NULL` rend l'opération à la fois idempotente et
 * informative : une session déjà révoquée n'est ni ré-horodatée ni
 * re-motivée — son motif d'origine est justement ce qui permettra de juger un
 * éventuel rejeu — et la fonction renvoie `false`.
 *
 * @param reason Pourquoi cette session est fermée. Obligatoire : c'est le
 *               motif, et lui seul, qui distinguera plus tard un vol d'une
 *               déconnexion banale.
 * @returns `true` si une session ACTIVE vient d'être révoquée ;
 *          `false` si le jeton est inconnu ou était déjà révoqué.
 */
export async function revokeRefreshToken(
  tokenHash: string,
  reason: RevocationReason,
): Promise<boolean> {
  const résultat = await run(
    undefined,
    `UPDATE refresh_tokens
        SET revoked_at = now(),
            revoked_reason = $2
      WHERE token_hash = $1
        AND revoked_at IS NULL`,
    [tokenHash, reason],
  );
  return (résultat.rowCount ?? 0) > 0;
}

/**
 * Révoque TOUTES les sessions actives d'un compte.
 *
 * Appelée dans trois situations, toutes imposées par le cahier des charges :
 *   * changement de mot de passe (`PASSWORD_CHANGE` : les anciens appareils
 *     doivent se reconnecter) ;
 *   * suspension du compte par le propriétaire (`ADMIN`, cf. D-010 : la
 *     suspension doit prendre effet, pas attendre l'expiration des jetons) ;
 *   * réutilisation d'un jeton révoqué pour `ROTATION`, c'est-à-dire vol
 *     probable.
 *
 * @param reason Motif appliqué à toutes les sessions fermées par cet appel.
 * @returns Le nombre de sessions effectivement révoquées.
 */
export async function revokeAllUserTokens(
  userId: string,
  reason: RevocationReason,
): Promise<number> {
  const résultat = await run(
    undefined,
    `UPDATE refresh_tokens
        SET revoked_at = now(),
            revoked_reason = $2
      WHERE user_id = $1
        AND revoked_at IS NULL`,
    [userId, reason],
  );
  return résultat.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Ménage
// ---------------------------------------------------------------------------

/**
 * Supprime les jetons EXPIRÉS, et uniquement eux.
 *
 * ⚠ On ne supprime volontairement PAS les jetons révoqués mais encore valides
 *   dans le temps : ce sont précisément eux, et leur motif, qui permettent de
 *   reconnaître qu'un jeton volé est rejoué (`REFRESH_TOKEN_REUSE`). Les
 *   effacer transformerait un vol détectable en simple « jeton inconnu ».
 *   Une fois la date d'expiration passée, le jeton est de toute façon refusé :
 *   la ligne ne sert plus à rien et peut partir.
 *   D'où le `WHERE expires_at < now()` seul — aucune condition sur
 *   `revoked_at`.
 *
 * Aucune planification n'est mise en place ici : cette fonction est exposée,
 * c'est au serveur de décider quand l'appeler. En pratique, `src/server.ts`
 * l'appelle peu après le démarrage puis toutes les 24 h.
 *
 * @returns Le nombre de lignes supprimées.
 */
export async function deleteExpiredTokens(): Promise<number> {
  const résultat = await run(
    undefined,
    'DELETE FROM refresh_tokens WHERE expires_at < now()',
  );
  return résultat.rowCount ?? 0;
}
