/**
 * Petit utilitaire partagé par les dépôts (`repositories/`).
 *
 * Chaque fonction de dépôt accepte un `client` optionnel :
 *   * sans client  → la requête part sur le pool (cas courant) ;
 *   * avec client  → la requête rejoint une transaction ouverte par
 *     `withTransaction`, ce qui permet d'enchaîner plusieurs écritures
 *     validées ou annulées ensemble.
 */

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { query } from './index.js';

/** Client de transaction, ou `undefined` pour utiliser le pool. */
export type Executor = PoolClient | undefined;

/** Exécute une requête paramétrée sur le client fourni, ou sur le pool. */
export async function run<T extends QueryResultRow = QueryResultRow>(
  client: Executor,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  if (client) return client.query<T>(text, params);
  return query<T>(text, params);
}
