/**
 * Dépôt « journal des décisions administrateur » — table `admin_actions`.
 *
 * Deux journaux coexistent dans le produit, et la distinction n'est pas
 * cosmétique :
 *
 *   * `activity_logs`  → ce que font les COMPTES dans l'application
 *     (connexions, projets, calculs, rapports) ;
 *   * `admin_actions`  → ce que le PROPRIÉTAIRE décide SUR les comptes
 *     (création, modification, suspension, réactivation, réinitialisation).
 *
 * Le second est la mémoire commerciale du produit : c'est lui qui permet de
 * répondre, six mois plus tard, à « pourquoi ce client a-t-il été coupé ? ».
 * D'où le motif, obligatoire sur les actions de statut, et l'auteur, toujours
 * enregistré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Note de transition : `activity-logs.repo.ts` contient encore deux fonctions
 *  `logAdminAction` / `listAdminActions` écrites en Vague 0, que plus personne
 *  n'appelle. Les routes d'administration utilisent CE fichier, qui est typé
 *  (`AdminActionType`) et paginé. Le nettoyage de l'ancienne paire relève du
 *  propriétaire de `activity-logs.repo.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Executor } from '../executor.js';
import { run } from '../executor.js';
import { assainirMetadata } from './activity-logs.repo.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Les décisions journalisées, en liste FERMÉE (contrat Vague 3, § 4).
 *
 * Même raisonnement que pour `ActivityAction` : une faute de frappe devient une
 * erreur de compilation, et non une ligne de journal introuvable le jour où on
 * la cherche.
 */
export type AdminActionType =
  | 'CREATE_ACCOUNT'
  | 'UPDATE_ACCOUNT'
  | 'SUSPEND'
  | 'REACTIVATE'
  | 'RESET_PASSWORD';

/** Une ligne de `admin_actions`. `id` est un `bigserial`, lu en texte. */
export type AdminActionRow = {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  reason: string | null;
  metadata: unknown;
  created_at: Date;
};

export type LogAdminActionInput = {
  /** Auteur de la décision. Toujours le compte connecté, jamais une valeur reçue. */
  adminId: string;
  targetUserId?: string | null;
  action: AdminActionType;
  /**
   * Motif saisi par l'administrateur. Obligatoire côté API sur `SUSPEND` et
   * `REACTIVATE` ; la colonne reste nullable pour les actions qui n'en
   * demandent pas.
   */
  reason?: string | null;
  /**
   * Contexte libre. **Jamais de secret ici** — et surtout jamais le mot de
   * passe temporaire, que le contrat interdit de journaliser sous quelque
   * forme que ce soit. Le filtre ci-dessous est un filet, pas une permission.
   */
  metadata?: Record<string, unknown> | null;
};

export type ListAdminActionsOptions = {
  /** Restreint aux décisions visant un compte donné (fiche client). */
  targetUserId?: string | null;
  limit?: number;
  offset?: number;
};

const ADMIN_ACTION_COLUMNS = `
  id::text AS id, admin_id, target_user_id, action, reason, metadata, created_at
`;

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/**
 * Trace une décision du propriétaire sur un compte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CETTE FONCTION, ELLE, A LE DROIT D'ÉCHOUER
 * ═══════════════════════════════════════════════════════════════════════════
 *  `logActivity` avale ses erreurs : un journal cassé ne doit pas empêcher un
 *  client de se connecter. Ici, c'est l'inverse, et c'est voulu.
 *
 *  Une suspension et sa trace doivent être validées ENSEMBLE ou pas du tout :
 *  un compte suspendu sans trace serait inexplicable six mois plus tard, une
 *  trace sans suspension serait un mensonge. D'où le `client` de transaction :
 *  les routes d'administration écrivent le changement d'état et sa trace dans
 *  la même transaction, et un échec de l'un annule l'autre.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `metadata` traverse le même filtre défensif que le journal d'activité
 * (`assainirMetadata`) : toute clé dont le nom évoque un secret voit sa valeur
 * remplacée par « [retiré] ».
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
      input.reason?.trim() ? input.reason.trim() : null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  const créée = rows[0];
  if (!créée) throw new Error('Écriture du journal administrateur impossible.');
  return créée;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Historique des décisions, éventuellement restreint à un compte visé.
 *
 * `$1::uuid IS NULL` : un seul SQL sert les deux usages (fiche d'un compte et
 * accueil du dashboard), sans construction dynamique de requête.
 */
export async function listAdminActions(
  options: ListAdminActionsOptions = {},
  client?: Executor,
): Promise<AdminActionRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const { rows } = await run<AdminActionRow>(
    client,
    `SELECT ${ADMIN_ACTION_COLUMNS}
       FROM admin_actions
      WHERE ($1::uuid IS NULL OR target_user_id = $1)
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [options.targetUserId ?? null, limit, offset],
  );
  return rows;
}

/** Nombre de décisions correspondant au filtre (pagination de la fiche). */
export async function countAdminActions(
  options: Pick<ListAdminActionsOptions, 'targetUserId'> = {},
  client?: Executor,
): Promise<number> {
  const { rows } = await run<{ total: string }>(
    client,
    `SELECT count(*)::text AS total
       FROM admin_actions
      WHERE ($1::uuid IS NULL OR target_user_id = $1)`,
    [options.targetUserId ?? null],
  );
  return Number(rows[0]?.total ?? 0);
}
