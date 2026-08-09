/**
 * Middleware d'erreur final.
 *
 * Il est le SEUL endroit du backend qui décide de ce que voit le client quand
 * quelque chose se passe mal. Deux règles :
 *
 * 1. La réponse a toujours la même forme : `{ error: { code, message, details? } }`.
 * 2. Rien ne fuit. Une erreur qui n'est pas une `AppError` (bug, panne, erreur
 *    SQL) devient un 500 générique ; le détail réel — message, trace, requête
 *    SQL — part uniquement dans les journaux serveur, associé à l'identifiant
 *    de requête.
 *
 * Express 5 propage automatiquement les rejets de promesse d'un handler
 * `async` vers ce middleware : aucun `asyncHandler` n'est nécessaire.
 */

import type { ErrorRequestHandler } from 'express';

import { ErrorCode, isAppError } from '../errors.js';
import { logger } from '../logger.js';
import { getRequestId } from './request-id.js';

/** Corps de réponse d'erreur, identique pour tous les endpoints. */
export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Détecte l'erreur levée par `express.json()` sur un corps illisible. */
function estJsonInvalide(erreur: unknown): boolean {
  return (
    erreur instanceof SyntaxError &&
    'body' in erreur &&
    (erreur as unknown as { status?: number }).status === 400
  );
}

/** Détecte un corps de requête au-delà de la limite de taille. */
function estCorpsTropVolumineux(erreur: unknown): boolean {
  return (
    typeof erreur === 'object' &&
    erreur !== null &&
    (erreur as { type?: string }).type === 'entity.too.large'
  );
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // Si la réponse a déjà commencé à partir, seul Express sait finir proprement.
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = getRequestId(res);

  if (isAppError(err)) {
    const corps: ErrorResponseBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    };

    // 5xx volontaire = incident ; 4xx = comportement client normal.
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, 'Erreur applicative serveur');
    } else {
      logger.warn({ requestId, code: err.code, statusCode: err.statusCode }, err.message);
    }

    res.status(err.statusCode).json(corps);
    return;
  }

  if (estJsonInvalide(err)) {
    logger.warn({ requestId }, 'Corps de requête JSON illisible');
    res.status(400).json({
      error: { code: ErrorCode.BAD_REQUEST, message: 'Le corps de la requête n’est pas un JSON valide.' },
    } satisfies ErrorResponseBody);
    return;
  }

  if (estCorpsTropVolumineux(err)) {
    logger.warn({ requestId }, 'Corps de requête trop volumineux');
    res.status(413).json({
      error: { code: ErrorCode.BAD_REQUEST, message: 'Le corps de la requête est trop volumineux.' },
    } satisfies ErrorResponseBody);
    return;
  }

  // Erreur non maîtrisée : détail complet côté serveur, message neutre côté client.
  logger.error({ err, requestId }, 'Erreur non gérée');

  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Une erreur interne est survenue.',
      ...(requestId ? { details: { requestId } } : {}),
    },
  } satisfies ErrorResponseBody);
};
