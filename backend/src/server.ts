/**
 * Point d'entrée du serveur.
 *
 * Rôle unique : démarrer l'écoute HTTP, planifier le ménage périodique, et
 * s'arrêter proprement. Toute la construction de l'application est dans
 * `app.ts` (testable sans réseau).
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
import { deleteExpiredTokens } from './db/repositories/refresh-tokens.repo.js';
import { logger } from './logger.js';

/** Au-delà, on arrête de force : une requête bloquée ne doit pas figer l'arrêt. */
const DÉLAI_ARRÊT_FORCÉ_MS = 10_000;

/** Délai avant le premier ménage : le démarrage passe en premier. */
const DÉLAI_PREMIER_MÉNAGE_MS = 30_000;

/** Puis une fois par jour. Rien ne presse : ces lignes sont déjà inutilisables. */
const INTERVALLE_MÉNAGE_MS = 24 * 60 * 60 * 1000;

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    `Irrigation Pro API démarrée sur http://localhost:${config.port}`,
  );
});

// ---------------------------------------------------------------------------
// Ménage des jetons de rafraîchissement expirés
// ---------------------------------------------------------------------------

let premierMénage: NodeJS.Timeout | undefined;
let ménagePériodique: NodeJS.Timeout | undefined;

/**
 * Supprime les jetons dont la date d'expiration est passée.
 *
 * ⚠ EXPIRÉS UNIQUEMENT. Un jeton révoqué mais encore valide dans le temps
 *   reste en base : c'est lui, et son motif de révocation, qui permettent de
 *   reconnaître un jeton volé qu'on rejoue (`REFRESH_TOKEN_REUSE`). L'effacer
 *   transformerait un vol détectable en anodin « jeton inconnu ». La règle est
 *   appliquée dans `deleteExpiredTokens()` ; elle est rappelée ici parce que
 *   c'est ici qu'on serait tenté d'« optimiser » la requête.
 *
 * N'émet JAMAIS d'exception : une base momentanément injoignable ne doit pas
 * faire tomber un serveur qui, par ailleurs, répond parfaitement. On avertit et
 * on retentera dans 24 h — des lignes périmées qui traînent un jour de plus ne
 * gênent personne.
 */
async function nettoyerJetonsExpirés(): Promise<void> {
  try {
    const supprimés = await deleteExpiredTokens();
    logger.info({ supprimés }, 'Ménage : jetons de rafraîchissement expirés supprimés');
  } catch (err) {
    logger.warn(
      { err },
      'Ménage des jetons expirés impossible — le serveur continue, nouvelle tentative dans 24 h',
    );
  }
}

/**
 * Planifie le ménage : une fois peu après le démarrage, puis toutes les 24 h.
 *
 * Rien n'est planifié en environnement `test` : les tests remplacent la couche
 * base par un état en mémoire et ne doivent jamais ouvrir de connexion réelle.
 *
 * Les deux minuteries sont `unref()` : elles ne doivent pas, à elles seules,
 * maintenir le processus en vie et retarder son arrêt de vingt-quatre heures.
 */
function planifierMénage(): void {
  if (config.nodeEnv === 'test') return;

  premierMénage = setTimeout(() => {
    void nettoyerJetonsExpirés();
  }, DÉLAI_PREMIER_MÉNAGE_MS);
  premierMénage.unref();

  ménagePériodique = setInterval(() => {
    void nettoyerJetonsExpirés();
  }, INTERVALLE_MÉNAGE_MS);
  ménagePériodique.unref();
}

planifierMénage();

let arrêtEnCours = false;

async function arrêtPropre(signal: string): Promise<void> {
  if (arrêtEnCours) return;
  arrêtEnCours = true;

  logger.info({ signal }, 'Arrêt du serveur demandé');

  // Le ménage d'abord : inutile d'ouvrir une requête vers une base dont on
  // s'apprête à fermer le pool.
  if (premierMénage) clearTimeout(premierMénage);
  if (ménagePériodique) clearInterval(ménagePériodique);

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
