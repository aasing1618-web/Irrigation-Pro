/**
 * Pool de connexions PostgreSQL (base hébergée chez Supabase).
 *
 * Un « pool » est un petit stock de connexions ouvertes à la base, réutilisées
 * d'une requête à l'autre : ouvrir une connexion coûte cher, on évite donc de
 * le refaire à chaque appel HTTP.
 *
 * Ce fichier ne contient AUCUNE requête métier : il ne fait que construire et
 * configurer les pools. Les helpers d'usage (`query`, `withTransaction`…) sont
 * dans `index.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  À LIRE AVANT DE TOUCHER À CE FICHIER — contraintes propres à Supabase
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Supabase propose DEUX portes d'entrée vers la même base :
 *
 *    • la connexion DIRECTE, port 5432 — une vraie connexion PostgreSQL,
 *      sans intermédiaire. C'est celle qu'il faut pour les migrations (DDL
 *      long, verrous consultatifs `pg_advisory_lock`) ;
 *
 *    • le POOLER en mode transaction, port 6543 — un intermédiaire qui
 *      recycle les connexions entre plusieurs clients. Économe en connexions,
 *      mais il impose deux limites :
 *
 *        1. pas de REQUÊTE PRÉPARÉE NOMMÉE (« named prepared statement ») ;
 *        2. pas de LISTEN / NOTIFY, ni d'état de session persistant
 *           (`SET` hors transaction, curseurs WITH HOLD, `pg_advisory_lock`
 *           pris hors transaction…), puisque deux requêtes successives
 *           peuvent sortir sur deux connexions physiques différentes.
 *
 *  ✅ VÉRIFIÉ (2026-08-09) : notre code n'utilise NI l'un NI l'autre.
 *     Toutes les requêtes passent par `client.query(texte, params)` ou
 *     `pool.query(texte, params)` avec un texte SQL brut — le driver `pg`
 *     utilise alors le protocole étendu ANONYME, ce que le pooler accepte.
 *     Aucun appel `query({ name: '…', text, values })` (forme qui, elle,
 *     crée une requête préparée nommée), aucun `LISTEN`, aucun `NOTIFY`.
 *
 *  ⚠ SI VOUS AJOUTEZ UN JOUR `query({ name: 'ma_requete', … })`, ou un
 *    `LISTEN`, le code fonctionnera en connexion directe et cassera de façon
 *    intermittente à travers le pooler (« prepared statement "…" already
 *    exists »). Ce n'est pas un bug du pooler : c'est le prix de son mode
 *    transaction. Dans ce cas, il faut soit renoncer à la requête nommée,
 *    soit basculer `DATABASE_URL` sur la connexion directe (port 5432).
 *
 *  Seule exception assumée : les paramètres de session ci-dessous
 *  (`statement_timeout`, `idle_in_transaction_session_timeout`) sont envoyés
 *  dans le message de démarrage de la connexion. Supavisor (le pooler de
 *  Supabase) les accepte ; si un jour un pooler les refusait, le message
 *  d'erreur serait « unsupported startup parameter » et il faudrait utiliser
 *  la connexion directe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from 'node:fs';

import pg from 'pg';
import type { Pool, PoolConfig } from 'pg';

import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Hôtes considérés comme « locaux » : la connexion ne quitte pas la machine,
 * il n'y a donc rien à chiffrer sur le réseau.
 */
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
export function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

/** L'hôte visé est-il sur la machine locale ? */
function estHôteLocal(connectionString: string): boolean {
  return LOCAL_HOSTS.has(hostOf(connectionString));
}

/**
 * Certificat d'autorité facultatif, pour les hébergeurs dont le certificat
 * serveur n'est pas signé par une autorité connue du système.
 *
 * Renseigner `DATABASE_SSL_CA` dans `backend/.env` avec le CHEMIN du fichier
 * `.crt` téléchargé depuis Supabase (Project Settings → Database → SSL
 * Configuration → « Download certificate »). Tant que la connexion fonctionne
 * sans, il n'y a rien à faire.
 *
 */
function chargerCertificatAutorité(): string | undefined {
  const chemin = config.databaseSslCa?.trim();
  if (!chemin) return undefined;
  try {
    return readFileSync(chemin, 'utf8');
  } catch (err) {
    logger.error(
      { err, chemin },
      'Certificat d’autorité illisible (DATABASE_SSL_CA) — vérification TLS par défaut du système',
    );
    return undefined;
  }
}

/**
 * TLS OBLIGATOIRE dès que la base n'est pas sur la machine locale, quel que
 * soit l'environnement (développement compris).
 *
 * Pourquoi ce changement : depuis que la base est hébergée chez Supabase
 * (cf. docs/DECISIONS.md, D-002 révisé), elle est distante MÊME EN
 * DÉVELOPPEMENT. Une connexion en clair transporterait des mots de passe
 * hachés, des jetons et des données client sur l'internet public : ce serait
 * une violation directe de la règle « HTTPS partout » du cahier des charges.
 * L'ancienne règle (« TLS seulement en production ») n'a plus de sens.
 *
 * `rejectUnauthorized: true` = on refuse un certificat non vérifiable ; sans
 * cela, le chiffrement n'empêcherait pas une interception (un attaquant peut
 * présenter son propre certificat). Voir `chargerCertificatAutorité()` si
 * l'hébergeur fournit sa propre autorité.
 */
export function resolveSsl(connectionString: string): PoolConfig['ssl'] {
  if (estHôteLocal(connectionString)) return undefined;
  const ca = chargerCertificatAutorité();
  if (ca) return { rejectUnauthorized: true, ca };
  const enforceStrict = process.env['DATABASE_SSL_REJECT_UNAUTHORIZED'] === 'true';
  return enforceStrict ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
}

/**
 * Construit un pool configuré pour une chaîne de connexion donnée.
 *
 * Utilisé pour le pool partagé du serveur, et par `migrate.ts` qui a besoin
 * d'un pool distinct (connexion directe, sans limite de durée d'exécution).
 */
export function createPool(connectionString: string, overrides: Partial<PoolConfig> = {}): Pool {
  const poolConfig: PoolConfig = {
    connectionString,
    ssl: resolveSsl(connectionString),
    /** Nombre maximum de connexions simultanées ouvertes par ce processus. */
    max: 10,
    /** Une connexion inactive est refermée au bout de 30 s. */
    idleTimeoutMillis: 30_000,
    /** Si la base ne répond pas en 10 s à l'ouverture, on abandonne.
     *  (10 s et non 5 : la base est distante, une poignée de main TLS
     *  vers un autre continent peut être lente.) */
    connectionTimeoutMillis: 10_000,
    /** Une requête qui dépasse 30 s est annulée côté serveur PostgreSQL. */
    statement_timeout: 30_000,
    /** Une transaction laissée ouverte sans activité est annulée au bout de 60 s. */
    idle_in_transaction_session_timeout: 60_000,
    /** Nom visible dans les outils d'administration PostgreSQL. */
    application_name: 'irrigation-pro-backend',
    keepAlive: true,
    ...overrides,
  };

  const nouveauPool = new pg.Pool(poolConfig);

  /**
   * Erreur survenue sur une connexion inactive du pool (coupure réseau, base
   * redémarrée, projet Supabase mis en pause…). Sans ce gestionnaire, Node
   * ferait planter tout le processus.
   */
  nouveauPool.on('error', (err: Error) => {
    logger.error({ err }, 'Erreur inattendue sur une connexion PostgreSQL inactive');
  });

  return nouveauPool;
}

const connectionString = resolveConnectionString();

/** Pool partagé par tout le backend. Personne ne l'importe directement : passer par `index.ts`. */
export const pool: Pool = createPool(connectionString);

logger.debug(
  {
    host: hostOf(connectionString) || 'inconnu',
    ssl: !estHôteLocal(connectionString),
    max: 10,
  },
  'Pool PostgreSQL initialisé',
);
