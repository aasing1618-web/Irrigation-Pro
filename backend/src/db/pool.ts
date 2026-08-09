/**
 * Pool de connexions PostgreSQL.
 *
 * Un « pool » est un petit stock de connexions ouvertes à la base, réutilisées
 * d'une requête à l'autre : ouvrir une connexion coûte cher, on évite donc de
 * le refaire à chaque appel HTTP.
 *
 * Ce fichier ne contient AUCUNE requête métier : il ne fait que construire et
 * configurer le pool. Les helpers d'usage (`query`, `withTransaction`…) sont
 * dans `index.ts`.
 */

import pg from 'pg';
import type { Pool, PoolConfig } from 'pg';

import { config } from '../config.js';
import { logger } from '../logger.js';

/** Hôtes considérés comme « locaux » : on n'y impose jamais TLS. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * Choisit la chaîne de connexion à utiliser.
 * En environnement `test`, on bascule sur la base de test si elle est
 * configurée : les tests vident les tables, ils ne doivent JAMAIS toucher la
 * base de travail.
 */
export function resolveConnectionString(): string {
  if (config.nodeEnv === 'test' && config.testDatabaseUrl) {
    return config.testDatabaseUrl;
  }
  return config.databaseUrl;
}

/** Extrait l'hôte d'une URL PostgreSQL (sans jamais exposer le mot de passe). */
function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

/**
 * TLS obligatoire en production, sauf si la base tourne sur la même machine.
 * `rejectUnauthorized: true` = on refuse un certificat non vérifiable.
 * (Voir README si l'hébergeur fournit un certificat auto-signé.)
 */
function resolveSsl(connectionString: string): PoolConfig['ssl'] {
  if (!config.isProduction) return undefined;
  if (LOCAL_HOSTS.has(hostOf(connectionString))) return undefined;
  return { rejectUnauthorized: true };
}

const connectionString = resolveConnectionString();

const poolConfig: PoolConfig = {
  connectionString,
  ssl: resolveSsl(connectionString),
  /** Nombre maximum de connexions simultanées ouvertes par ce processus. */
  max: 10,
  /** Une connexion inactive est refermée au bout de 30 s. */
  idleTimeoutMillis: 30_000,
  /** Si la base ne répond pas en 5 s à l'ouverture, on abandonne. */
  connectionTimeoutMillis: 5_000,
  /** Une requête qui dépasse 30 s est annulée côté serveur PostgreSQL. */
  statement_timeout: 30_000,
  /** Une transaction laissée ouverte sans activité est annulée au bout de 60 s. */
  idle_in_transaction_session_timeout: 60_000,
  /** Nom visible dans les outils d'administration PostgreSQL. */
  application_name: 'irrigation-pro-backend',
  keepAlive: true,
};

export const pool: Pool = new pg.Pool(poolConfig);

/**
 * Erreur survenue sur une connexion inactive du pool (coupure réseau, base
 * redémarrée…). Sans ce gestionnaire, Node ferait planter tout le processus.
 */
pool.on('error', (err: Error) => {
  logger.error({ err }, 'Erreur inattendue sur une connexion PostgreSQL inactive');
});

logger.debug(
  { host: hostOf(connectionString) || 'inconnu', ssl: Boolean(poolConfig.ssl), max: poolConfig.max },
  'Pool PostgreSQL initialisé',
);
