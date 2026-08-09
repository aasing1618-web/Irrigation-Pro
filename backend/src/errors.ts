/**
 * Erreurs applicatives.
 *
 * Une `AppError` est une erreur **volontaire** : son message est destiné à
 * l'utilisateur final et peut être affiché tel quel dans l'application.
 * Tout ce qui n'est pas une `AppError` (bug, panne, erreur SQL…) est considéré
 * comme une fuite potentielle d'information et transformé en 500 générique par
 * le middleware d'erreur — voir `middleware/error-handler.ts`.
 */

/** Codes machine renvoyés au client. Stables : l'application peut s'y fier. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  /** Statut HTTP à renvoyer. */
  readonly statusCode: number;

  /** Code machine, lisible par l'application cliente. */
  readonly code: string;

  /** Détails optionnels (liste de champs invalides, par exemple). Jamais de trace. */
  readonly details: unknown;

  /** Marqueur de reconnaissance, robuste même sans `instanceof`. */
  readonly isAppError = true as const;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

/** Reconnaît une `AppError` sans dépendre de `instanceof`. */
export function isAppError(erreur: unknown): erreur is AppError {
  return (
    erreur instanceof AppError ||
    (typeof erreur === 'object' &&
      erreur !== null &&
      (erreur as { isAppError?: unknown }).isAppError === true)
  );
}

/** 400 — la requête est mal formée ou les données envoyées sont invalides. */
export function badRequest(message = 'Requête invalide.', details?: unknown): AppError {
  return new AppError(message, 400, ErrorCode.BAD_REQUEST, details);
}

/** 401 — identité non établie (absente, expirée ou invalide). */
export function unauthorized(message = 'Authentification requise.', details?: unknown): AppError {
  return new AppError(message, 401, ErrorCode.UNAUTHORIZED, details);
}

/** 403 — identité connue, mais droit refusé sur cette ressource. */
export function forbidden(message = 'Accès refusé.', details?: unknown): AppError {
  return new AppError(message, 403, ErrorCode.FORBIDDEN, details);
}

/**
 * 404 — ressource inexistante.
 *
 * Également utilisé volontairement quand une ressource existe mais appartient à
 * un autre utilisateur : renvoyer 403 révélerait son existence.
 */
export function notFound(message = 'Ressource introuvable.', details?: unknown): AppError {
  return new AppError(message, 404, ErrorCode.NOT_FOUND, details);
}

/** 409 — conflit avec l'état actuel (doublon, transition impossible…). */
export function conflict(message = 'Conflit avec l’état actuel de la ressource.', details?: unknown): AppError {
  return new AppError(message, 409, ErrorCode.CONFLICT, details);
}

/** 429 — trop de requêtes (protection anti-force brute). */
export function tooManyRequests(
  message = 'Trop de requêtes. Réessayez dans quelques instants.',
  details?: unknown,
): AppError {
  return new AppError(message, 429, ErrorCode.TOO_MANY_REQUESTS, details);
}

/** 500 — erreur interne assumée. Le message reste volontairement vague. */
export function internal(message = 'Une erreur interne est survenue.', details?: unknown): AppError {
  return new AppError(message, 500, ErrorCode.INTERNAL_ERROR, details);
}

/** 503 — dépendance indisponible (base de données, service externe). */
export function serviceUnavailable(
  message = 'Service temporairement indisponible.',
  details?: unknown,
): AppError {
  return new AppError(message, 503, ErrorCode.SERVICE_UNAVAILABLE, details);
}
