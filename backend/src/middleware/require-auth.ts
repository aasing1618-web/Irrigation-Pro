/**
 * Garde d'authentification — appliquée à toute route non publique.
 *
 * Elle exécute, dans cet ordre et sans exception, les quatre vérifications du
 * contrat d'API (§ 1) :
 *
 *   1. jeton présent, bien formé, signé, non expiré  → sinon 401 TOKEN_INVALID
 *   2. le compte existe toujours                     → sinon 401 TOKEN_INVALID
 *   3. **statut relu en base**, SUSPENDU             → 403 ACCOUNT_SUSPENDED
 *   4. `mustChangePassword` vrai                     → 403 PASSWORD_CHANGE_REQUIRED
 *      (sauf sur `GET /auth/me`, `POST /auth/change-password`, `POST /auth/logout`)
 *
 * L'étape 3 est le cœur de la décision D-010 et la raison pour laquelle cette
 * garde touche la base à chaque requête. Un jeton d'accès est autoportant : si
 * l'on se contentait de le lire, un compte suspendu continuerait de travailler
 * jusqu'à l'expiration du jeton. Or c'est le seul levier commercial du
 * propriétaire, il doit être immédiat.
 *
 * L'ordre compte aussi : un compte suspendu reçoit `ACCOUNT_SUSPENDED`, pas
 * `PASSWORD_CHANGE_REQUIRED`. C'est le message que l'application attend pour
 * ramener l'utilisateur à l'écran de connexion.
 */

import type { RequestHandler, Response } from 'express';

import { accountSuspended, adminOnly, passwordChangeRequired, tokenInvalid } from '../auth/errors.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { toAuthenticatedUser, type AuthenticatedUser } from '../auth/user-view.js';
import { findUserById } from '../db/repositories/users.repo.js';

export type { AuthenticatedUser } from '../auth/user-view.js';

/** Extrait le jeton d'un en-tête `Authorization: Bearer …`. */
function lireJetonPorteur(entete: string | undefined): string | null {
  if (!entete) return null;
  const morceaux = entete.trim().split(/\s+/);
  if (morceaux.length !== 2) return null;
  const [schema, valeur] = morceaux;
  if (!schema || !valeur) return null;
  if (schema.toLowerCase() !== 'bearer') return null;
  return valeur;
}

/**
 * Récupère le compte authentifié dans un handler.
 * À n'appeler que derrière `requireAuth` : l'absence de compte est un défaut de
 * montage des middlewares, pas une situation normale.
 */
export function getAuthenticatedUser(res: Response): AuthenticatedUser {
  const utilisateur = res.locals['user'] as AuthenticatedUser | undefined;
  if (!utilisateur) {
    throw new Error(
      'requireAuth n’est pas monté sur cette route : res.locals.user est absent.',
    );
  }
  return utilisateur;
}

/** Compte authentifié éventuel, sans lever d'exception. */
export function getAuthenticatedUserOrNull(res: Response): AuthenticatedUser | null {
  return (res.locals['user'] as AuthenticatedUser | undefined) ?? null;
}

interface OptionsGarde {
  /**
   * Autorise la route même quand le compte doit encore changer son mot de
   * passe. Réservé aux trois routes listées par le contrat.
   */
  autoriserChangementDeMotDePasseEnAttente: boolean;
}

function construireGarde(options: OptionsGarde): RequestHandler {
  return async (req, res, next) => {
    try {
      // 1. Jeton présent, bien formé, signé, non expiré.
      const jeton = lireJetonPorteur(req.headers.authorization);
      if (!jeton) {
        next(tokenInvalid());
        return;
      }

      const charge = await verifyAccessToken(jeton);

      // 2. Le compte existe toujours (il a pu être supprimé depuis l'émission).
      const ligne = await findUserById(charge.sub);
      if (!ligne) {
        next(tokenInvalid());
        return;
      }

      const utilisateur = toAuthenticatedUser(ligne);

      // 3. Statut relu en base — D-010.
      if (utilisateur.status === 'SUSPENDU') {
        next(accountSuspended());
        return;
      }

      // 4. Obligation de changer le mot de passe temporaire.
      if (utilisateur.mustChangePassword && !options.autoriserChangementDeMotDePasseEnAttente) {
        next(passwordChangeRequired());
        return;
      }

      res.locals['user'] = utilisateur;
      next();
    } catch (erreur) {
      next(erreur);
    }
  };
}

/** Garde standard : toute route métier passe par là. */
export const requireAuth: RequestHandler = construireGarde({
  autoriserChangementDeMotDePasseEnAttente: false,
});

/**
 * Variante réservée aux trois routes que le contrat laisse ouvertes quand
 * `mustChangePassword` est vrai : `GET /auth/me`, `POST /auth/change-password`
 * et `POST /auth/logout`. C'est le seul chemin de sortie de cet état — sans
 * cette exception, un compte fraîchement créé serait enfermé dehors.
 *
 * Les vérifications 1 à 3 restent identiques : un compte suspendu est refusé
 * ici aussi.
 */
export const requireAuthAllowingPasswordChange: RequestHandler = construireGarde({
  autoriserChangementDeMotDePasseEnAttente: true,
});

/**
 * Garde administrateur (utilisée en Vague 3 pour le dashboard du propriétaire).
 * S'appuie sur `requireAuth` : toutes les vérifications précédentes s'appliquent
 * d'abord, le rôle n'est examiné qu'ensuite.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  requireAuth(req, res, (erreur?: unknown) => {
    if (erreur) {
      next(erreur);
      return;
    }
    const utilisateur = getAuthenticatedUserOrNull(res);
    if (!utilisateur || utilisateur.role !== 'ADMIN') {
      next(adminOnly());
      return;
    }
    next();
  });
};
