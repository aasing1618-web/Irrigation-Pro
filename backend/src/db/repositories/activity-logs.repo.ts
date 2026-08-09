/**
 * Dépôt « journalisation » — tables `activity_logs` et `admin_actions`.
 *
 * Le cahier des charges impose de tracer les actions sensibles : connexions,
 * créations de compte, suspensions, générations de rapport.
 *
 * Deux journaux distincts :
 *   * `activity_logs`  → ce que font les comptes dans l'application ;
 *   * `admin_actions`  → ce que le propriétaire décide sur les comptes.
 *
 * ⚠ Ne JAMAIS placer dans `metadata` un mot de passe (même temporaire), un
 *   jeton, ou une empreinte : ces journaux sont consultés depuis le dashboard.
 *
 * Ces fonctions acceptent un `client` de transaction : écrire la trace dans la
 * même transaction que l'action elle-même garantit qu'on n'a jamais l'un sans
 * l'autre.
 */

import type { Executor } from '../executor.js';
import { run } from '../executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** ex. LOGIN_SUCCESS, LOGIN_FAILED, PROJECT_CREATED, REPORT_GENERATED. */
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Contexte libre. Aucune donnée secrète. */
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
// Journal d'activité
// ---------------------------------------------------------------------------

/**
 * Enregistre une action. Ne doit jamais faire échouer l'action métier :
 * en cas de problème d'écriture, l'erreur remonte à l'appelant, qui décide
 * (hors transaction, on se contente en général de la consigner).
 */
export async function logActivity(
  input: LogActivityInput,
  client?: Executor,
): Promise<ActivityLogRow> {
  const { rows } = await run<ActivityLogRow>(
    client,
    `INSERT INTO activity_logs
       (user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5::inet, $6, $7::jsonb)
     RETURNING ${ACTIVITY_COLUMNS}`,
    [
      input.userId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
  const created = rows[0];
  if (!created) throw new Error('Écriture du journal d’activité impossible.');
  return created;
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

/** Trace une décision du propriétaire sur un compte. */
export async function logAdminAction(
  input: LogAdminActionInput,
  client?: Executor,
): Promise<AdminActionRow> {
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
      input.metadata ? JSON.stringify(input.metadata) : null,
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
