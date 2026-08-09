/**
 * Point d'entrée du serveur.
 *
 * Rôle unique : démarrer l'écoute HTTP et s'arrêter proprement. Toute la
 * construction de l'application est dans `app.ts` (testable sans réseau).
 *
 * Arrêt propre : à la réception de SIGINT (Ctrl+C) ou SIGTERM (arrêt de
 * service), on cesse d'accepter de nouvelles connexions, on laisse finir les
 * requêtes en cours, puis on ferme le pool PostgreSQL. Sans cela, des
 * connexions restent ouvertes côté base à chaque redémarrage.
 *
 * Limite connue (Windows) : Windows n'a pas de vrais signaux POSIX. SIGTERM y
 * termine le processus sans passer par ce code — c'est une contrainte du
 * système, pas un défaut d'implémentation. SIGINT (Ctrl+C dans une console) et
 * tout déploiement Linux/Docker déclenchent bien l'arrêt propre ci-dessous.
 */

import { createApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/index.js';
import { logger } from './logger.js';

/** Au-delà, on arrête de force : une requête bloquée ne doit pas figer l'arrêt. */
const DÉLAI_ARRÊT_FORCÉ_MS = 10_000;

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    `Irrigation Pro API démarrée sur http://localhost:${config.port}`,
  );
});

let arrêtEnCours = false;

async function arrêtPropre(signal: string): Promise<void> {
  if (arrêtEnCours) return;
  arrêtEnCours = true;

  logger.info({ signal }, 'Arrêt du serveur demandé');

  const minuterie = setTimeout(() => {
    logger.error('Arrêt trop long : sortie forcée');
    process.exit(1);
  }, DÉLAI_ARRÊT_FORCÉ_MS);
  minuterie.unref();

  await new Promise<void>((resolve) => {
    server.close((err) => {
      if (err) logger.error({ err }, 'Erreur à la fermeture du serveur HTTP');
      resolve();
    });
  });

  await closePool();

  logger.info('Serveur arrêté proprement');
  clearTimeout(minuterie);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void arrêtPropre(signal);
  });
}

// Filet de sécurité : on veut une trace exploitable plutôt qu'un arrêt muet.
process.on('unhandledRejection', (raison) => {
  logger.error({ err: raison }, 'Promesse rejetée sans gestionnaire');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Exception non interceptée — arrêt du processus');
  void arrêtPropre('uncaughtException').finally(() => process.exit(1));
});
