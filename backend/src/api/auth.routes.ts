/**
 * Routes d'authentification — Vague 1.
 *
 * Implémentation littérale du contrat `docs/API-VAGUE-1.md` :
 *
 *   POST /api/auth/login            connexion               (publique, limitée)
 *   POST /api/auth/refresh          rotation de session     (publique, limitée)
 *   POST /api/auth/logout           fermeture de session    (authentifiée)
 *   GET  /api/auth/me               compte connecté         (authentifiée)
 *   POST /api/auth/change-password  changement obligatoire  (authentifiée)
 *
 * Ces handlers ne contiennent aucune règle de sécurité : ils valident l'entrée,
 * appellent `auth.service`, et mettent en forme la sortie. Toute la logique
 * sensible est dans le service, où elle est testable et où elle ne peut pas
 * être contournée par une nouvelle route distraite.
 */

import { Router, type Request, type RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';

import {
  changePassword,
  login,
  logout,
  refresh,
  type RequestContext,
} from '../auth/auth.service.js';
import { refreshTokenInvalid, validationError } from '../auth/errors.js';
import { requireAuthAllowingPasswordChange } from '../middleware/require-auth.js';
import { getAuthenticatedUser } from '../middleware/require-auth.js';
import { authRateLimiter } from '../middleware/rate-limit.js';

export const authRouter: Router = Router();

// ---------------------------------------------------------------------------
// Outils locaux
// ---------------------------------------------------------------------------

/**
 * Validation du corps avec un message figé par le contrat.
 *
 * On n'utilise pas `middleware/validate.ts` ici : ce dernier renvoie un message
 * générique, alors que le contrat impose des phrases précises, destinées à être
 * affichées telles quelles par l'application.
 */
function validerCorps<S extends ZodTypeAny>(schema: S, message: string): RequestHandler {
  return (req, res, next) => {
    const resultat = schema.safeParse(req.body);
    if (!resultat.success) {
      // Seuls les NOMS de champs fautifs sont renvoyés — jamais les valeurs,
      // qui contiendraient des mots de passe.
      const champs = [...new Set(resultat.error.issues.map((probleme) => probleme.path.join('.')))];
      next(validationError(message, { champs }));
      return;
    }
    res.locals['corps'] = resultat.data;
    next();
  };
}

function lireCorps<T>(res: { locals: Record<string, unknown> }): T {
  return res.locals['corps'] as T;
}

/** Contexte d'audit extrait de la requête (jamais le corps, jamais les jetons). */
function contexteDeRequete(req: Request): RequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

// ---------------------------------------------------------------------------
// Schémas
// ---------------------------------------------------------------------------

const MESSAGE_LOGIN_INVALIDE = 'Veuillez saisir votre adresse e-mail et votre mot de passe.';
const MESSAGE_CHANGEMENT_INVALIDE =
  'Veuillez saisir votre mot de passe actuel et le nouveau mot de passe.';

/**
 * Le mot de passe n'est ici borné qu'en longueur brute (1 à 512). La politique
 * réelle ne s'applique qu'au **nouveau** mot de passe : refuser une connexion
 * parce que l'ancien mot de passe ne respecte plus la politique du jour
 * enfermerait dehors les comptes créés avant son durcissement.
 */
const schemaConnexion = z.object({
  email: z.string().trim().min(3).max(254).email(),
  password: z.string().min(1).max(512),
});

const schemaChangementMotDePasse = z.object({
  currentPassword: z.string().min(1).max(512),
  newPassword: z.string().min(1).max(512),
});

/**
 * Le jeton de rafraîchissement est validé à la main plutôt qu'avec `validate()`
 * : le contrat ne prévoit que `401 REFRESH_TOKEN_INVALID` sur cette route, un
 * `400` distinct laisserait fuiter la différence entre « champ absent » et
 * « jeton refusé ».
 */
function lireJetonDeRafraichissement(corps: unknown): string {
  if (typeof corps !== 'object' || corps === null) throw refreshTokenInvalid();
  const valeur = (corps as { refreshToken?: unknown }).refreshToken;
  if (typeof valeur !== 'string' || valeur.length === 0 || valeur.length > 512) {
    throw refreshTokenInvalid();
  }
  return valeur;
}

/** Variante tolérante : une déconnexion ne doit jamais échouer (contrat). */
function lireJetonDeRafraichissementOptionnel(corps: unknown): string | null {
  if (typeof corps !== 'object' || corps === null) return null;
  const valeur = (corps as { refreshToken?: unknown }).refreshToken;
  if (typeof valeur !== 'string' || valeur.length === 0 || valeur.length > 512) return null;
  return valeur;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * `POST /api/auth/login` — se connecter.
 *
 * Publique, mais protégée par le limiteur strict : c'est la première barrière
 * anti-force brute, celle qui compte par adresse IP. La seconde (par compte)
 * est en base, dans le service.
 */
authRouter.post(
  '/login',
  authRateLimiter,
  validerCorps(schemaConnexion, MESSAGE_LOGIN_INVALIDE),
  async (req, res) => {
    const corps = lireCorps<z.infer<typeof schemaConnexion>>(res);
    const resultat = await login(
      { email: corps.email, password: corps.password },
      contexteDeRequete(req),
    );
    res.status(200).json(resultat);
  },
);

/** `POST /api/auth/refresh` — prolonger la session (rotation obligatoire). */
authRouter.post('/refresh', authRateLimiter, async (req, res) => {
  const refreshToken = lireJetonDeRafraichissement(req.body);
  const resultat = await refresh({ refreshToken }, contexteDeRequete(req));
  res.status(200).json(resultat);
});

/** `POST /api/auth/logout` — fermer la session courante. Toujours `204`. */
authRouter.post('/logout', requireAuthAllowingPasswordChange, async (req, res) => {
  const utilisateur = getAuthenticatedUser(res);
  await logout(
    { refreshToken: lireJetonDeRafraichissementOptionnel(req.body) },
    utilisateur,
    contexteDeRequete(req),
  );
  res.status(204).end();
});

/** `GET /api/auth/me` — qui suis-je. Autorisée même avant le changement de mot de passe. */
authRouter.get('/me', requireAuthAllowingPasswordChange, (_req, res) => {
  const utilisateur = getAuthenticatedUser(res);
  res.status(200).json({
    user: {
      id: utilisateur.id,
      email: utilisateur.email,
      fullName: utilisateur.fullName,
      company: utilisateur.company,
      role: utilisateur.role,
      mustChangePassword: utilisateur.mustChangePassword,
    },
  });
});

/**
 * `POST /api/auth/change-password` — changer son mot de passe.
 *
 * Volontairement autorisée quand `mustChangePassword` est vrai : c'est la seule
 * sortie de cet état.
 */
authRouter.post(
  '/change-password',
  requireAuthAllowingPasswordChange,
  validerCorps(schemaChangementMotDePasse, MESSAGE_CHANGEMENT_INVALIDE),
  async (req, res) => {
    const corps = lireCorps<z.infer<typeof schemaChangementMotDePasse>>(res);
    const utilisateur = getAuthenticatedUser(res);
    const resultat = await changePassword(
      { currentPassword: corps.currentPassword, newPassword: corps.newPassword },
      utilisateur,
      contexteDeRequete(req),
    );
    res.status(200).json(resultat);
  },
);
