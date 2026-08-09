/**
 * Limitation du débit de requêtes.
 *
 * Deux limiteurs :
 * - `apiRateLimiter`  : garde-fou général sur `/api`, contre les boucles et les
 *   scripts trop bavards. Volontairement large : un utilisateur légitime ne doit
 *   jamais le rencontrer.
 * - `authRateLimiter` : protection anti-force brute des routes de connexion,
 *   beaucoup plus stricte. Exporté ici mais branché en Vague 1.
 *
 * Le compteur est en mémoire : suffisant pour un serveur unique, ce qui est le
 * cas du déploiement V1. Si l'API est un jour répliquée, il faudra un magasin
 * partagé (Redis) — arbitrage à faire à ce moment-là.
 */

import rateLimit, { type Options } from 'express-rate-limit';

import { config } from '../config.js';
import { tooManyRequests } from '../errors.js';

const QUINZE_MINUTES_MS = 15 * 60 * 1000;

/** Réglages communs : réponse au format d'erreur standard, en-têtes normalisés. */
const communs: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // On délègue au middleware d'erreur pour garder une réponse de forme constante.
  handler: (_req, _res, next, options) => {
    next(
      tooManyRequests('Trop de requêtes. Réessayez dans quelques instants.', {
        retryAfterSeconds: Math.ceil(options.windowMs / 1000),
      }),
    );
  },
  // Les tests enchaînent des dizaines de requêtes : le limiteur les fausserait.
  skip: () => config.nodeEnv === 'test',
};

/** Limiteur général appliqué à tout `/api`. */
export const apiRateLimiter = rateLimit({
  ...communs,
  windowMs: QUINZE_MINUTES_MS,
  limit: 600,
});

/**
 * Limiteur strict des routes d'authentification (Vague 1).
 * Compte aussi les tentatives réussies : on veut plafonner le rythme, pas
 * seulement les échecs.
 */
export const authRateLimiter = rateLimit({
  ...communs,
  windowMs: QUINZE_MINUTES_MS,
  limit: 10,
});
