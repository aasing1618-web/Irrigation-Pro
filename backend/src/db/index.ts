/**
 * Point d'entrée de la couche « base de données ».
 *
 * Tout le reste du backend passe par ici : personne d'autre ne doit importer
 * `pool.ts` ni le driver `pg` directement.
 *
 * Règle absolue : toutes les requêtes sont **paramétrées** (`$1`, `$2`…).
 * On ne construit JAMAIS du SQL par concaténation de chaînes avec des valeurs
 * venant de l'utilisateur — c'est la porte ouverte aux injections SQL.
 */

import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { logger } from '../logger.js';
import { pool } from './pool.js';

export { pool };
export type { Pool, PoolClient, QueryResult, QueryResultRow };

/** Au-delà de cette durée, une requête est jugée lente et signalée. */
const SLOW_QUERY_MS = 200;

/**
 * Réduit une requête SQL à une ligne courte pour les journaux.
 * On ne journalise QUE le texte SQL (fixe, écrit par nous) — jamais les
 * paramètres, qui contiennent des données client (e-mails, noms de projets…).
 */
function summarize(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

/**
 * Exécute une requête paramétrée sur le pool.
 *
 * @param text   SQL avec des marqueurs `$1`, `$2`…
 * @param params Valeurs correspondantes (jamais journalisées).
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const startedAt = performance.now();
  try {
    const result = await pool.query<T>(text, params);
    const durationMs = Math.round(performance.now() - startedAt);
    const details = { sql: summarize(text), durationMs, rows: result.rowCount ?? 0 };
    if (durationMs > SLOW_QUERY_MS) {
      logger.warn(details, 'Requête SQL lente');
    } else {
      logger.debug(details, 'Requête SQL');
    }
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt);
    logger.error({ err, sql: summarize(text), durationMs }, 'Échec d’une requête SQL');
    throw err;
  }
}

/**
 * Exécute plusieurs requêtes dans une seule transaction.
 *
 * Tout est validé ensemble (`COMMIT`) ou annulé ensemble (`ROLLBACK`) : utile
 * dès qu'une opération touche plusieurs tables (créer un compte + écrire la
 * trace administrateur, par exemple).
 *
 * ```ts
 * const projet = await withTransaction(async (client) => {
 *   const { rows } = await client.query('INSERT INTO projects (...) VALUES ($1) RETURNING *', [x]);
 *   return rows[0];
 * });
 * ```
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const startedAt = performance.now();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs > SLOW_QUERY_MS) {
      logger.warn({ durationMs }, 'Transaction SQL lente');
    }
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'Échec du ROLLBACK de la transaction');
    }
    logger.error({ err }, 'Transaction annulée');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Vérifie que la base répond. Utilisée par l'endpoint `/health`.
 *
 * Ne lève JAMAIS d'exception : en cas de problème elle retourne
 * `{ ok: false, latencyMs, error }` pour que `/health` puisse répondre
 * proprement au lieu de planter.
 */
export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = performance.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Base de données injoignable');
    return { ok: false, latencyMs, error: message };
  }
}

/**
 * Ferme proprement toutes les connexions (arrêt du serveur, fin des tests).
 * Ne lève jamais d'exception : on est déjà en train de s'arrêter.
 */
export async function closePool(): Promise<void> {
  try {
    await pool.end();
    logger.debug('Pool PostgreSQL fermé');
  } catch (err) {
    logger.error({ err }, 'Échec de la fermeture du pool PostgreSQL');
  }
}
