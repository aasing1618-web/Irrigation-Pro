/**
 * Dépôt « journalisation » — tables `activity_logs` et `admin_actions`.
 *
 * Le cahier des charges impose de tracer les actions sensibles : connexions,
 * créations de compte, suspensions, générations de rapport.
 *
 * Deux journaux distincts :
 *   * `activity_logs`  → ce que font les comptes dans l'application ;
 *   * `admin_actions`  → ce que le propriétaire décide sur les comptes.
 */

import { logger } from '../../logger.js';
import type { Executor } from '../executor.js';
import { run } from '../executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Les actions journalisées en Vague 1 (connexion et comptes).
 *
 * C'est volontairement une liste FERMÉE : le contrat d'API (docs/API-VAGUE-1.md,
 * § 4) énumère exactement ces huit événements. Une faute de frappe dans un
 * appel (`'LOGIN_SUCESS'`) devient ainsi une erreur de compilation, et non une
 * ligne de journal introuvable le jour où on la cherche.
 *
 * Les vagues suivantes ajouteront leurs propres actions à cette union
 * (`PROJECT_CREATED`, `REPORT_GENERATED`…).
 */
export type ActivityAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED_SUSPENDED'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_CHANGED'
  | 'LOGOUT'
  | 'TOKEN_REFRESHED'
  | 'REFRESH_TOKEN_REUSE';

/** Une ligne de `activity_logs`. `id` est un `bigserial`, lu en texte. */
export type ActivityLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: Date;
};

/** Une ligne de `admin_actions`. */
export type AdminActionRow = {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  reason: string | null;
  metadata: unknown;
  created_at: Date;
};

export type LogActivityInput = {
  /** `null` accepté : action anonyme, ex. tentative de connexion sur un e-mail inconnu. */
  userId?: string | null;
  action: ActivityAction;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Contexte libre. Filtré avant écriture (voir `assainirMetadata`). */
  metadata?: Record<string, unknown> | null;
};

export type LogAdminActionInput = {
  adminId: string;
  targetUserId?: string | null;
  /** CREATE_ACCOUNT | SUSPEND | REACTIVATE | RESET_PASSWORD. */
  action: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ACTIVITY_COLUMNS = `
  id::text AS id, user_id, action, entity_type, entity_id,
  host(ip_address) AS ip_address, user_agent, metadata, created_at
`;

const ADMIN_ACTION_COLUMNS = `
  id::text AS id, admin_id, target_user_id, action, reason, metadata, created_at
`;

// ---------------------------------------------------------------------------
// Filtrage défensif du contexte libre (`metadata`)
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CEINTURE DE SÉCURITÉ SUR `metadata`
 * ═══════════════════════════════════════════════════════════════════════════
 *  Le contrat d'API est formel (§ 4) : « Aucune entrée ne doit jamais contenir
 *  un mot de passe, un jeton, ni même un fragment de l'un des deux — y compris
 *  dans le champ libre `metadata` ».
 *
 *  Cette règle est facile à respecter et facile à oublier. Le journal est
 *  consulté depuis le dashboard admin ; un secret qui y atterrit y reste, en
 *  clair, pour toujours. On ne se contente donc pas de la règle écrite : on la
 *  fait appliquer par le code, au dernier moment avant l'écriture.
 *
 *  RÈGLE APPLIQUÉE — toute clé dont le nom CONTIENT, en quelque casse que ce
 *  soit, l'un des mots ci-dessous voit sa VALEUR remplacée par « [retiré] ».
 *  La clé, elle, est conservée : voir « refreshToken: [retiré] » dans un
 *  journal apprend qu'un filtrage a eu lieu, alors qu'une clé disparue ne
 *  raconte rien.
 *
 *  Exemples de ce que ça donne :
 *      { email: 'jean@x.sn', password: 'Soleil123' }
 *          → { email: 'jean@x.sn', password: '[retiré]' }
 *      { session: { refreshToken: 'abc', appareil: 'PC' } }
 *          → { session: { refreshToken: '[retiré]', appareil: 'PC' } }
 *      { Authorization: 'Bearer …' }   (casse différente)
 *          → { Authorization: '[retiré]' }
 *      { tentatives: 3 }               (rien à filtrer)
 *          → { tentatives: 3 }
 *
 *  Le filtrage descend dans les objets et les tableaux imbriqués, jusqu'à
 *  `PROFONDEUR_MAX` niveaux : au-delà, la branche entière est remplacée, car
 *  une structure aussi profonde n'a rien à faire dans un journal et pourrait
 *  être cyclique.
 *
 *  ⚠ Ce filtre est un FILET, pas une autorisation : il ne dispense personne de
 *    ne jamais mettre de secret dans `metadata`. Il attrape les erreurs, il ne
 *    les rend pas acceptables.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const MOTS_SENSIBLES = ['password', 'token', 'secret', 'hash', 'authorization'] as const;

const VALEUR_RETIRÉE = '[retiré]';

/** Profondeur maximale explorée dans `metadata`. */
const PROFONDEUR_MAX = 6;

/** Le nom de cette clé évoque-t-il un secret ? */
function cléSensible(clé: string): boolean {
  const normalisée = clé.toLowerCase();
  return MOTS_SENSIBLES.some((mot) => normalisée.includes(mot));
}

function assainirValeur(valeur: unknown, profondeur: number): unknown {
  if (valeur === null || typeof valeur !== 'object') return valeur;
  if (profondeur >= PROFONDEUR_MAX) return VALEUR_RETIRÉE;

  if (Array.isArray(valeur)) {
    return valeur.map((élément) => assainirValeur(élément, profondeur + 1));
  }

  // `Date`, `Error` et consorts : on les laisse à `JSON.stringify`.
  if (!(valeur.constructor === Object || valeur.constructor === undefined)) {
    return valeur;
  }

  const sortie: Record<string, unknown> = {};
  for (const [clé, sousValeur] of Object.entries(valeur as Record<string, unknown>)) {
    sortie[clé] = cléSensible(clé) ? VALEUR_RETIRÉE : assainirValeur(sousValeur, profondeur + 1);
  }
  return sortie;
}

/** Retire les valeurs des clés qui ressemblent à un secret. Voir le bloc ci-dessus. */
export function assainirMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const assainie = assainirValeur(metadata, 0);
  return assainie !== null && typeof assainie === 'object' && !Array.isArray(assainie)
    ? (assainie as Record<string, unknown>)
    : null;
}

// ---------------------------------------------------------------------------
// Journal d'activité
// ---------------------------------------------------------------------------

/**
 * Enregistre une action sensible.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CETTE FONCTION NE FAIT JAMAIS ÉCHOUER SON APPELANT
 * ═══════════════════════════════════════════════════════════════════════════
 *  Elle n'émet aucune exception, quoi qu'il arrive. Si l'écriture du journal
 *  échoue (base momentanément injoignable, disque plein…), l'erreur est
 *  consignée dans les logs techniques du serveur et la fonction retourne
 *  normalement.
 *
 *  Pourquoi : un journal cassé ne doit pas empêcher un client de se connecter.
 *  Le journal sert à comprendre après coup ; il n'est pas ce qui autorise ou
 *  refuse l'accès. Inverser cette priorité transformerait une panne mineure de
 *  la journalisation en panne totale du produit — et donnerait même un levier
 *  à un attaquant : saturer le journal pour bloquer les connexions.
 *
 *  Corollaire : cette fonction ne prend PAS de client de transaction. Écrire
 *  le journal dans la transaction de l'appelant aurait deux défauts — une
 *  erreur d'insertion avorterait la transaction métier (exactement ce qu'on
 *  veut éviter), et un `ROLLBACK` effacerait la trace de l'événement, alors
 *  qu'une tentative de connexion échouée doit justement rester tracée.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const metadata = assainirMetadata(input.metadata);
    await run(
      undefined,
      `INSERT INTO activity_logs
         (user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5::inet, $6, $7::jsonb)`,
      [
        input.userId ?? null,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (err) {
    // On journalise l'échec du journal — sans jamais y remettre `metadata`,
    // dont on ne sait pas ce que l'appelant y avait mis.
    logger.error(
      { err, action: input.action },
      'Écriture du journal d’activité impossible — l’action métier n’est pas interrompue',
    );
  }
}

/** Dernières actions d'un compte donné (fiche client du dashboard admin). */
export async function listActivityForUser(
  userId: string,
  options: { limit?: number } = {},
  client?: Executor,
): Promise<ActivityLogRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const { rows } = await run<ActivityLogRow>(
    client,
    `SELECT ${ACTIVITY_COLUMNS}
       FROM activity_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

/** Dernières actions tous comptes confondus (accueil du dashboard admin). */
export async function listRecentActivity(
  options: { limit?: number } = {},
  client?: Executor,
): Promise<ActivityLogRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const { rows } = await run<ActivityLogRow>(
    client,
    `SELECT ${ACTIVITY_COLUMNS}
       FROM activity_logs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Journal des actions administrateur
// ---------------------------------------------------------------------------

/**
 * Trace une décision du propriétaire sur un compte.
 *
 * Contrairement à `logActivity`, cette fonction PEUT échouer et accepte un
 * client de transaction : une suspension de compte et sa trace doivent être
 * validées ensemble ou pas du tout — un compte suspendu sans trace serait
 * inexplicable, une trace sans suspension serait un mensonge.
 *
 * `metadata` est filtré ici aussi.
 */
export async function logAdminAction(
  input: LogAdminActionInput,
  client?: Executor,
): Promise<AdminActionRow> {
  const metadata = assainirMetadata(input.metadata);
  const { rows } = await run<AdminActionRow>(
    client,
    `INSERT INTO admin_actions (admin_id, target_user_id, action, reason, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING ${ADMIN_ACTION_COLUMNS}`,
    [
      input.adminId,
      input.targetUserId ?? null,
      input.action,
      input.reason ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  const created = rows[0];
  if (!created) throw new Error('Écriture du journal administrateur impossible.');
  return created;
}

/** Historique des décisions administrateur, éventuellement filtré par compte visé. */
export async function listAdminActions(
  options: { targetUserId?: string | null; limit?: number } = {},
  client?: Executor,
): Promise<AdminActionRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const { rows } = await run<AdminActionRow>(
    client,
    `SELECT ${ADMIN_ACTION_COLUMNS}
       FROM admin_actions
      WHERE ($1::uuid IS NULL OR target_user_id = $1)
      ORDER BY created_at DESC
      LIMIT $2`,
    [options.targetUserId ?? null, limit],
  );
  return rows;
}
