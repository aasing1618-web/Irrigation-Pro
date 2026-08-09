/**
 * Route inexistante → 404 au format d'erreur standard.
 *
 * On délègue au middleware d'erreur pour garantir une réponse strictement
 * identique à toutes les autres erreurs de l'API.
 */

import type { RequestHandler } from 'express';

import { notFound } from '../errors.js';

/** Longueur maximale du chemin renvoyé en détail (on ne renvoie pas n'importe quoi). */
const LONGUEUR_MAX_CHEMIN = 200;

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    notFound('Cette ressource n’existe pas.', {
      method: req.method,
      path: req.path.slice(0, LONGUEUR_MAX_CHEMIN),
    }),
  );
};
