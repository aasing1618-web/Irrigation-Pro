/**
 * Runner de migrations SQL — utilisable en ligne de commande :
 *
 *   npm run migrate          → applique les migrations en attente
 *   npm run migrate:status   → affiche ce qui est appliqué / en attente
 *
 * Principe : le dossier `migrations/` contient des fichiers `.sql` numérotés
 * (001_init.sql, 002_…). Le runner les applique dans l'ordre, une fois chacun,
 * et note dans la table `schema_migrations` ceux qui sont déjà passés.
 *
 * Garanties :
 *   * chaque fichier est exécuté dans SA PROPRE transaction : en cas d'erreur,
 *     rien de ce fichier n'est appliqué à moitié ;
 *   * une empreinte sha256 est enregistrée : si un fichier déjà appliqué est
 *     modifié après coup, le runner s'arrête et le signale (deux bases ne
 *     doivent jamais diverger silencieusement) ;
 *   * un verrou PostgreSQL empêche deux migrations simultanées.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CONNEXION UTILISÉE PAR LES MIGRATIONS — pourquoi elle est à part
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Les migrations doivent passer par la CONNEXION DIRECTE de Supabase
 *  (port 5432), pas par le pooler en mode transaction (port 6543), pour deux
 *  raisons :
 *
 *    1. `pg_advisory_lock` est un verrou de SESSION. À travers un pooler
 *       transactionnel, deux requêtes successives peuvent sortir sur deux
 *       connexions physiques différentes : le verrou serait posé sur une
 *       session et le `CREATE TABLE` exécuté sur une autre — la protection
 *       contre deux migrations simultanées deviendrait illusoire.
 *       (Ici le verrou est bien pris sur LE MÊME `client` que les migrations,
 *       cf. `main()` : c'est correct en connexion directe, et c'est la seule
 *       chose qu'on puisse garantir côté code.)
 *
 *    2. le DDL long (création d'index, `ALTER TABLE`) supporte mal les
 *       délais courts d'un pooler. Le pool créé ici désactive donc
 *       `statement_timeout`.
 *
 *  Variable d'environnement FACULTATIVE `DIRECT_DATABASE_URL` :
 *    * si elle est définie → les migrations l'utilisent ;
 *    * sinon               → repli sur `DATABASE_URL`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool, PoolClient } from 'pg';

import { config } from '../config.js';
import { createPool, hostOf, pool as poolPartagé, resolveConnectionString } from './pool.js';

/** Clé arbitraire mais stable du verrou consultatif PostgreSQL. */
const LOCK_KEY = 918_273_645;

/**
 * Chaîne de connexion des migrations : connexion directe si elle est fournie,
 * sinon la chaîne habituelle.
 */
export function resolveMigrationConnectionString(): string {
  const direct = config.directDatabaseUrl?.trim();
  return direct && direct.length > 0 ? direct : resolveConnectionString();
}

interface MigrationFile {
  /** Nom du fichier sans extension, ex. « 001_init ». */
  version: string;
  fileName: string;
  path: string;
  sql: string;
  checksum: string;
}

/**
 * Ligne de `schema_migrations`.
 * Déclarée en `type` (et non `interface`) : le driver `pg` exige un type
 * possédant une signature d'index implicite, ce que seules les alias de type
 * fournissent en TypeScript.
 */
type AppliedRow = {
  version: string;
  applied_at: Date;
  checksum: string;
};

// ---------------------------------------------------------------------------
// Localisation du dossier des migrations
// ---------------------------------------------------------------------------

/**
 * Retrouve le dossier `migrations/`, aussi bien quand le code tourne depuis
 * les sources (`tsx src/db/migrate.ts`) que depuis `dist/` après compilation
 * (les fichiers `.sql` ne sont pas copiés par `tsc`).
 */
export function resolveMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'migrations'), // src/db/migrations (exécution via tsx)
    resolve(here, '..', '..', 'src', 'db', 'migrations'), // depuis dist/db
    resolve(process.cwd(), 'src', 'db', 'migrations'), // depuis la racine backend
    resolve(process.cwd(), 'backend', 'src', 'db', 'migrations'), // depuis la racine du repo
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Dossier des migrations introuvable. Emplacements testés :\n  - ${candidates.join('\n  - ')}`,
    );
  }
  return found;
}

/**
 * Empreinte sha256 du contenu.
 * Les fins de ligne sont normalisées : un fichier récupéré sous Windows
 * (CRLF) doit donner la même empreinte que sous Linux (LF).
 */
function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** Lit et trie les migrations disponibles (ordre lexicographique des noms). */
export async function loadMigrations(): Promise<MigrationFile[]> {
  const dir = resolveMigrationsDir();
  const entries = await readdir(dir);
  const sqlFiles = entries.filter((name) => name.toLowerCase().endsWith('.sql')).sort();

  const migrations: MigrationFile[] = [];
  for (const fileName of sqlFiles) {
    const path = join(dir, fileName);
    const sql = await readFile(path, 'utf8');
    migrations.push({
      version: fileName.replace(/\.sql$/i, ''),
      fileName,
      path,
      sql,
      checksum: checksumOf(sql),
    });
  }
  return migrations;
}

// ---------------------------------------------------------------------------
// Table de suivi
// ---------------------------------------------------------------------------

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      checksum   text        NOT NULL
    )
  `);
}

async function fetchApplied(client: PoolClient): Promise<Map<string, AppliedRow>> {
  const { rows } = await client.query<AppliedRow>(
    'SELECT version, applied_at, checksum FROM schema_migrations ORDER BY version',
  );
  return new Map(rows.map((row) => [row.version, row]));
}

/**
 * Vérifie qu'aucune migration déjà appliquée n'a été modifiée depuis.
 * Lève une erreur explicite le cas échéant.
 */
function assertNoDrift(migrations: MigrationFile[], applied: Map<string, AppliedRow>): void {
  const modifiees = migrations.filter((migration) => {
    const row = applied.get(migration.version);
    return row !== undefined && row.checksum !== migration.checksum;
  });

  if (modifiees.length > 0) {
    const liste = modifiees.map((m) => `  - ${m.fileName}`).join('\n');
    throw new Error(
      'Des migrations DÉJÀ APPLIQUÉES ont été modifiées :\n' +
        `${liste}\n\n` +
        'Une migration appliquée ne doit plus jamais être retouchée : sinon la base\n' +
        'de développement et celle de production divergent sans que personne ne le voie.\n' +
        'Solution : remettez ces fichiers dans leur état d’origine et créez une NOUVELLE\n' +
        'migration (fichier suivant, ex. 002_…) contenant vos changements.',
    );
  }

  // Migration enregistrée en base mais dont le fichier a disparu : anomalie
  // qui mérite un avertissement, sans bloquer.
  const connues = new Set(migrations.map((m) => m.version));
  for (const version of applied.keys()) {
    if (!connues.has(version)) {
      console.warn(
        `⚠ La migration « ${version} » est enregistrée en base mais son fichier .sql est introuvable.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

async function commandUp(client: PoolClient): Promise<void> {
  const migrations = await loadMigrations();
  await ensureMigrationsTable(client);
  const applied = await fetchApplied(client);
  assertNoDrift(migrations, applied);

  const enAttente = migrations.filter((migration) => !applied.has(migration.version));

  if (enAttente.length === 0) {
    console.log(`✔ Base à jour — ${applied.size} migration(s) déjà appliquée(s), aucune en attente.`);
    return;
  }

  console.log(`→ ${enAttente.length} migration(s) à appliquer.`);

  for (const migration of enAttente) {
    const startedAt = Date.now();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
        [migration.version, migration.checksum],
      );
      await client.query('COMMIT');
      console.log(`  ✔ ${migration.fileName} appliquée (${Date.now() - startedAt} ms)`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Échec de la migration « ${migration.fileName} » : ${message}\n` +
          'Aucune modification de ce fichier n’a été conservée (transaction annulée).',
      );
    }
  }

  console.log('✔ Toutes les migrations sont appliquées.');
}

async function commandStatus(client: PoolClient): Promise<void> {
  const migrations = await loadMigrations();
  await ensureMigrationsTable(client);
  const applied = await fetchApplied(client);

  console.log(`Dossier : ${resolveMigrationsDir()}`);
  console.log('');

  if (migrations.length === 0) {
    console.log('Aucun fichier de migration trouvé.');
    return;
  }

  console.log('Migrations :');
  for (const migration of migrations) {
    const row = applied.get(migration.version);
    if (!row) {
      console.log(`  ○ ${migration.version.padEnd(28)} en attente`);
    } else if (row.checksum !== migration.checksum) {
      console.log(
        `  ✖ ${migration.version.padEnd(28)} appliquée le ${row.applied_at.toISOString()} — FICHIER MODIFIÉ DEPUIS`,
      );
    } else {
      console.log(`  ● ${migration.version.padEnd(28)} appliquée le ${row.applied_at.toISOString()}`);
    }
  }

  const enAttente = migrations.filter((m) => !applied.has(m.version)).length;
  console.log('');
  console.log(`Total : ${migrations.length - enAttente} appliquée(s), ${enAttente} en attente.`);
}

// ---------------------------------------------------------------------------
// Point d'entrée CLI
// ---------------------------------------------------------------------------

/** Pool dédié aux migrations. Créé dans `main()`, refermé dans le `finally`. */
let poolMigrations: Pool | undefined;

async function main(): Promise<void> {
  const commande = process.argv[2] ?? 'up';

  if (commande !== 'up' && commande !== 'status') {
    throw new Error(`Commande inconnue « ${commande} ». Commandes disponibles : up, status.`);
  }

  const chaîne = resolveMigrationConnectionString();
  const utiliseConnexionDirecte = Boolean(config.directDatabaseUrl?.trim());

  console.log(
    `Base visée : ${hostOf(chaîne) || 'inconnue'} ` +
      `(${utiliseConnexionDirecte ? 'DIRECT_DATABASE_URL — connexion directe' : 'DATABASE_URL'})`,
  );

  poolMigrations = createPool(chaîne, {
    // Une seule connexion : les migrations sont strictement séquentielles et
    // le verrou consultatif ci-dessous doit rester sur CETTE session.
    max: 1,
    // 0 = aucune limite. Une création d'index sur une grosse table peut
    // dépasser les 30 s appliquées aux requêtes de l'application.
    statement_timeout: 0,
    idle_in_transaction_session_timeout: 0,
    application_name: 'irrigation-pro-migrate',
  });

  const client = await poolMigrations.connect();
  try {
    // Verrou : empêche deux exécutions simultanées d'appliquer la même
    // migration deux fois (déploiement, ou deux terminaux ouverts).
    //
    // ⚠ Il est pris sur `client`, et TOUTES les requêtes qui suivent utilisent
    //   ce même `client` : c'est ce qui rend le verrou effectif. Un
    //   `pg_advisory_lock` posé sur le pool (`pool.query(...)`) ne protégerait
    //   rien, puisque la requête suivante pourrait partir sur une autre
    //   connexion. À travers un pooler en mode transaction, même pris sur un
    //   client, le verrou n'offre aucune garantie : d'où `DIRECT_DATABASE_URL`.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      if (commande === 'up') {
        await commandUp(client);
      } else {
        await commandStatus(client);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('');
    console.error('✖ Migration interrompue.');
    console.error(message);
    console.error('');
    console.error('À vérifier, dans l’ordre :');
    console.error('  1. le projet Supabase est actif (il se met en pause après inactivité) ;');
    console.error('  2. DATABASE_URL (ou DIRECT_DATABASE_URL) dans backend/.env est correcte,');
    console.error('     mot de passe compris — voir backend/src/db/README.md ;');
    console.error('  3. la connexion internet fonctionne.');
    process.exitCode = 1;
  })
  .finally(async () => {
    // On referme les deux pools : celui des migrations, et le pool partagé
    // créé par le simple fait d'importer `pool.ts` (sans quoi le processus
    // resterait en vie).
    await Promise.allSettled([poolMigrations?.end(), poolPartagé.end()]);
  });
