/**
 * Erreurs d'authentification — codes et messages figés par le contrat d'API
 * (`docs/API-VAGUE-1.md`, § 1 et § 2).
 *
 * Les messages sont **affichés tels quels** par l'application : ils sont en
 * français, sans terme technique, et surtout sans jamais indiquer si un compte
 * existe ou non.
 *
 * Ces fabriques sont regroupées ici pour une raison précise : c'est le seul
 * moyen de garantir qu'un e-mail inconnu et un mot de passe faux renvoient
 * *littéralement* la même chose. S'il y avait deux messages écrits à deux
 * endroits, ils finiraient par diverger.
 */

import { AppError } from '../errors.js';

/** Codes machine des routes d'authentification. Stables : l'application s'y fie. */
export const AuthErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
  FORBIDDEN: 'FORBIDDEN',
} as const;

/** 400 — champ manquant ou mal formé. */
export function validationError(message: string, details?: unknown): AppError {
  return new AppError(message, 400, AuthErrorCode.VALIDATION_ERROR, details);
}

/**
 * 401 — e-mail inconnu **ou** mot de passe faux.
 *
 * Une seule fabrique pour les deux cas, volontairement : c'est ce qui rend les
 * deux réponses indiscernables.
 */
export function invalidCredentials(): AppError {
  return new AppError(
    'Adresse e-mail ou mot de passe incorrect.',
    401,
    AuthErrorCode.INVALID_CREDENTIALS,
  );
}

/**
 * 403 — compte suspendu.
 *
 * Révèle qu'un compte existe : exception assumée par le contrat, le client
 * suspendu doit comprendre pourquoi il n'entre plus. N'est renvoyée
 * qu'**après** vérification réussie du mot de passe.
 */
export function accountSuspended(): AppError {
  return new AppError(
    'Votre compte est suspendu. Contactez votre fournisseur.',
    403,
    AuthErrorCode.ACCOUNT_SUSPENDED,
  );
}

/** 429 — verrouillage temporaire après trop d'échecs (ce n'est pas une suspension). */
export function accountLocked(minutesRestantes: number): AppError {
  const minutes = Math.max(1, Math.ceil(minutesRestantes));
  return new AppError(
    `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    429,
    AuthErrorCode.ACCOUNT_LOCKED,
    { retryAfterMinutes: minutes },
  );
}

/** 401 — jeton d'accès absent, mal formé, expiré, ou compte disparu. */
export function tokenInvalid(): AppError {
  return new AppError(
    'Votre session a expiré. Veuillez vous reconnecter.',
    401,
    AuthErrorCode.TOKEN_INVALID,
  );
}

/** 401 — jeton de rafraîchissement inconnu, expiré ou déjà révoqué. */
export function refreshTokenInvalid(): AppError {
  return new AppError(
    'Votre session a expiré. Veuillez vous reconnecter.',
    401,
    AuthErrorCode.REFRESH_TOKEN_INVALID,
  );
}

/** 403 — le mot de passe temporaire doit être remplacé avant toute autre action. */
export function passwordChangeRequired(): AppError {
  return new AppError(
    'Vous devez changer votre mot de passe avant de continuer.',
    403,
    AuthErrorCode.PASSWORD_CHANGE_REQUIRED,
  );
}

/** 400 — le nouveau mot de passe ne respecte pas la politique. */
export function passwordTooWeak(raison: string): AppError {
  return new AppError(raison, 400, AuthErrorCode.PASSWORD_TOO_WEAK);
}

/** 400 — le nouveau mot de passe est identique à l'ancien. */
export function passwordUnchanged(): AppError {
  return new AppError(
    'Le nouveau mot de passe doit être différent de l’ancien.',
    400,
    AuthErrorCode.PASSWORD_UNCHANGED,
  );
}

/** 403 — route réservée à l'administrateur (Vague 3). */
export function adminOnly(): AppError {
  return new AppError('Accès refusé.', 403, AuthErrorCode.FORBIDDEN);
}
