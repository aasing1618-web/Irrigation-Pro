/**
 * Journalisation centralisée (pino).
 *
 * - développement : sortie colorée et lisible (`pino-pretty`), niveau `debug`
 * - production    : JSON sur une ligne (exploitable par un agrégateur), niveau `info`
 * - test          : silence complet, pour ne pas polluer la sortie des tests
 *
 * Sécurité : certains champs ne doivent JAMAIS apparaître dans un journal
 * (jeton d'authentification, cookie de session, mot de passe, empreinte de mot
 * de passe). Ils sont systématiquement remplacés par « [masqué] ».
 */

import { pino, type Logger, type LoggerOptions } from 'pino';

import { config } from './config.js';

/** Remplace la valeur des champs sensibles au lieu de les supprimer. */
const VALEUR_MASQUÉE = '[masqué]';

/**
 * Champs occultés dans tous les journaux.
 *
 * Chaque champ sensible est décliné en trois variantes : à la racine de l'objet
 * journalisé, à un niveau d'imbrication (`*.champ`, typiquement `body.password`),
 * et à deux niveaux (`*.*.champ`). pino n'accepte pas de joker « profondeur
 * illimitée » ; ces trois formes couvrent tout ce que l'on journalise réellement.
 */
const CHAMPS_SENSIBLES = [
  'password',
  'newPassword',
  'currentPassword',
  'temporaryPassword',
  'token',
  'refreshToken',
  'accessToken',
  'password_hash',
  'refresh_token_hash',
] as const;

const CHEMINS_MASQUÉS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  ...CHAMPS_SENSIBLES.flatMap((champ) => [champ, `*.${champ}`, `*.*.${champ}`]),
];

function niveauDeJournalisation(): LoggerOptions['level'] {
  switch (config.nodeEnv) {
    case 'test':
      return 'silent';
    case 'production':
      return 'info';
    default:
      return 'debug';
  }
}

const options: LoggerOptions = {
  level: niveauDeJournalisation(),
  redact: { paths: CHEMINS_MASQUÉS, censor: VALEUR_MASQUÉE },
  base: { service: 'irrigation-pro-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // Niveau écrit en toutes lettres (« info ») plutôt qu'en nombre (30).
    level: (label) => ({ level: label }),
  },
};

// `pino-pretty` est une dépendance de développement : on ne l'active qu'en
// développement, sinon le serveur planterait au démarrage en production.
if (config.nodeEnv === 'development') {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname,service',
      singleLine: false,
    },
  };
}

export const logger: Logger = pino(options);
