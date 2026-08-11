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
 *
 * ── Vague 4 : transport de session (contrat `docs/API-VAGUE-4.md` § 1) ──────
 * Le client déclare, par un champ facultatif `sessionTransport`, **où il sait
 * ranger** son jeton de longue durée : dans le corps JSON (`"body"`, la valeur
 * par défaut, comportement historique) ou dans un cookie `HttpOnly` posé par le
 * serveur (`"cookie"`, l'application web). Le serveur ne devine rien.
 *
 * Ce choix est un détail de **transport HTTP** : il vit donc ici, dans la couche
 * route, et `auth.service` continue d'ignorer jusqu'à l'existence d'Express.
 */

import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z, type ZodTypeAny } from 'zod';

import {
  changePassword,
  login,
  logout,
  refresh,
  type RequestContext,
  type SessionTokens,
} from '../auth/auth.service.js';
import {
  effacerCookieSession,
  lireCookieSession,
  poserCookieSession,
  type TransportDeSession,
} from '../auth/cookies.js';
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
 * « jeton refusé ». (Voir `lireJetonDeSession`, qui ajoute la lecture du cookie.)
 *
 * Variante tolérante : une déconnexion ne doit jamais échouer (contrat). */
function lireJetonDeRafraichissementOptionnel(corps: unknown): string | null {
  if (typeof corps !== 'object' || corps === null) return null;
  const valeur = (corps as { refreshToken?: unknown }).refreshToken;
  if (typeof valeur !== 'string' || valeur.length === 0 || valeur.length > 512) return null;
  return valeur;
}

// ---------------------------------------------------------------------------
// Transport de session (Vague 4)
// ---------------------------------------------------------------------------

const MESSAGE_TRANSPORT_INVALIDE =
  'Le mode de transport de session doit valoir « body » ou « cookie ».';

const schemaTransport = z.enum(['body', 'cookie']);

/**
 * Lit le champ facultatif `sessionTransport`.
 *
 * Renvoie `undefined` quand le client n'a **rien déclaré** — ce qui n'est pas la
 * même chose que `"body"` déclaré explicitement : sur `/refresh`, un client
 * muet laisse le serveur déduire le mode du canal par lequel le jeton est
 * arrivé, alors qu'un client explicite est obéi.
 *
 * Toute autre valeur, `null` compris, est un `400 VALIDATION_ERROR` : le contrat
 * décrit `z.enum(['body','cookie']).optional()`, et `optional()` n'accepte que
 * l'absence.
 */
function lireTransportDeclare(corps: unknown): TransportDeSession | undefined {
  if (typeof corps !== 'object' || corps === null) return undefined;
  const valeur = (corps as { sessionTransport?: unknown }).sessionTransport;
  if (valeur === undefined) return undefined;

  const resultat = schemaTransport.safeParse(valeur);
  if (!resultat.success) {
    throw validationError(MESSAGE_TRANSPORT_INVALIDE, { champs: ['sessionTransport'] });
  }
  return resultat.data;
}

/**
 * Envoie une session au client selon le transport retenu.
 *
 * En mode `"cookie"`, `refreshToken` est **retiré du corps** : c'est tout
 * l'intérêt de la manœuvre, le secret de 30 jours n'entre jamais dans l'espace
 * mémoire du JavaScript de la page.
 *
 * `sessionTransport` est renvoyé dans les **deux** modes, pour que le client
 * puisse vérifier que le serveur a bien compris ce qu'il avait demandé.
 */
function envoyerSession<T extends SessionTokens>(
  res: Response,
  session: T,
  transport: TransportDeSession,
): void {
  if (transport === 'cookie') {
    const { refreshToken, ...sansJeton } = session;
    poserCookieSession(res, refreshToken);
    res.status(200).json({ ...sansJeton, sessionTransport: 'cookie' });
    return;
  }

  res.status(200).json({ ...session, sessionTransport: 'body' });
}

/** D'où vient le jeton de rafraîchissement présenté par le client. */
type ProvenanceDuJeton = { jeton: string; provenance: TransportDeSession };

/**
 * Retrouve le jeton de rafraîchissement d'une requête, dans l'ordre du contrat :
 *
 *   1. `refreshToken` dans le corps JSON ;
 *   2. à défaut, cookie `ip_refresh` ;
 *   3. aucun des deux → `401 REFRESH_TOKEN_INVALID`, **exactement** la réponse
 *      d'un jeton refusé. Une session absente et une session invalide restent
 *      indistinguables : même code, même message, aucun en-tête distinctif.
 */
function lireJetonDeSession(req: Request): ProvenanceDuJeton {
  const duCorps = lireJetonDeRafraichissementOptionnel(req.body);
  if (duCorps !== null) return { jeton: duCorps, provenance: 'body' };

  const duCookie = lireCookieSession(req);
  if (duCookie !== null) return { jeton: duCookie, provenance: 'cookie' };

  throw refreshTokenInvalid();
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
    const transport = lireTransportDeclare(req.body) ?? 'body';
    const resultat = await login(
      { email: corps.email, password: corps.password },
      contexteDeRequete(req),
    );
    envoyerSession(res, resultat, transport);
  },
);

/**
 * `POST /api/auth/refresh` — prolonger la session (rotation obligatoire).
 *
 * Le mode de réponse suit le client quand il se déclare, et à défaut le canal
 * par lequel le jeton est arrivé. La détection de réutilisation et la révocation
 * en cascade sont indifférentes à tout cela : elles opèrent en base, sur la
 * valeur du jeton, sans savoir par quel canal il est parvenu au serveur.
 *
 * Un point mérite l'attention : si le jeton vient du cookie mais que le client
 * réclame explicitement le mode `"body"`, le cookie est **effacé**. Le laisser
 * en place serait dangereux — il porte désormais un jeton révoqué par
 * `ROTATION`, et son retour lors d'un prochain rafraîchissement serait pris pour
 * un vol, coupant toutes les sessions du compte.
 *
 * En cas d'échec, en revanche, **aucun** en-tête `Set-Cookie` n'est émis : sans
 * cette précaution, une session invalide se distinguerait d'une session absente
 * par la seule présence de l'en-tête.
 */
authRouter.post('/refresh', authRateLimiter, async (req, res) => {
  const declare = lireTransportDeclare(req.body);
  const source = lireJetonDeSession(req);

  const resultat = await refresh({ refreshToken: source.jeton }, contexteDeRequete(req));

  const transport = declare ?? source.provenance;
  if (transport === 'body' && source.provenance === 'cookie') {
    effacerCookieSession(res);
  }

  envoyerSession(res, resultat, transport);
});

/**
 * `POST /api/auth/logout` — fermer la session courante. Toujours `204`.
 *
 * Le jeton est cherché dans le corps puis dans le cookie, afin que la session
 * soit réellement révoquée en base quel que soit le transport utilisé.
 *
 * Le cookie est ensuite effacé **systématiquement**, sans regarder ce que le
 * client a déclaré : effacer un cookie absent ne coûte rien, alors qu'oublier
 * d'en effacer un laisserait un secret de 30 jours dans le navigateur.
 *
 * `sessionTransport` n'est volontairement **pas** validé ici. Le contrat exige
 * de cette route qu'elle réponde *toujours* `204` — un utilisateur qui veut
 * partir doit pouvoir partir — et la valeur n'est de toute façon pas utilisée.
 */
authRouter.post('/logout', requireAuthAllowingPasswordChange, async (req, res) => {
  const utilisateur = getAuthenticatedUser(res);
  const jeton = lireJetonDeRafraichissementOptionnel(req.body) ?? lireCookieSession(req);

  await logout({ refreshToken: jeton }, utilisateur, contexteDeRequete(req));

  effacerCookieSession(res);
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
    const transport = lireTransportDeclare(req.body) ?? 'body';
    const utilisateur = getAuthenticatedUser(res);
    const resultat = await changePassword(
      { currentPassword: corps.currentPassword, newPassword: corps.newPassword },
      utilisateur,
      contexteDeRequete(req),
    );
    envoyerSession(res, resultat, transport);
  },
);
