/**
 * Identifiant de requête.
 *
 * Chaque requête reçoit un identifiant unique, renvoyé au client dans l'en-tête
 * `X-Request-Id` et repris dans tous les journaux. Quand un utilisateur signale
 * « ça a planté », cet identifiant permet de retrouver la trace exacte côté
 * serveur — sans jamais lui exposer le détail technique de l'erreur.
 *
 * L'identifiant est TOUJOURS généré par le serveur. On ne fait pas confiance à
 * un `X-Request-Id` envoyé par le client : il pourrait servir à polluer les
 * journaux ou à falsifier une piste d'audit.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RequestHandler, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export const requestId: RequestHandler = (_req, res, next) => {
  const identifiant = randomUUID();
  res.locals.requestId = identifiant;
  res.setHeader(REQUEST_ID_HEADER, identifiant);
  next();
};

/** Récupère l'identifiant de la requête en cours (chaîne vide si absent). */
export function getRequestId(res: Response): string {
  const valeur: unknown = res.locals.requestId;
  return typeof valeur === 'string' ? valeur : '';
}

/**
 * Identifiant utilisé par `pino-http` : on reprend celui déjà posé par le
 * middleware ci-dessus (via l'en-tête de réponse) pour que journaux et en-tête
 * HTTP concordent. Signature imposée par `pino-http`, d'où les types `node:http`.
 */
export function genReqId(_req: IncomingMessage, res: ServerResponse): string {
  const entête = res.getHeader(REQUEST_ID_HEADER);
  return typeof entête === 'string' ? entête : randomUUID();
}
