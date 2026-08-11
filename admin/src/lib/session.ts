/**
 * La session du propriétaire — état et actions.
 *
 * C'est le seul endroit du dashboard qui détient les jetons. Aucun écran, aucun
 * composant, aucun autre module ne les lit ni ne les écrit directement.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  LA DIFFÉRENCE DE FOND AVEC L'APPLICATION CLIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dans l'application installée, le jeton de rafraîchissement (30 jours) part
 *  dans le trousseau de Windows : un secret durable y est protégé par le
 *  système d'exploitation.
 *
 *  Ici, il n'y a pas de trousseau — il y a un onglet de navigateur. Les seuls
 *  emplacements persistants disponibles (`localStorage`, `sessionStorage`,
 *  cookie lisible) sont accessibles à tout script s'exécutant dans la page :
 *  y ranger un jeton de 30 jours qui ouvre l'administration de tout le produit
 *  serait bien pire que la gêne qu'on veut éviter.
 *
 *  Décision : **les deux jetons vivent en mémoire vive, et rien d'autre.**
 *  Conséquences assumées et visibles pour le propriétaire :
 *    - fermer ou recharger l'onglet ferme la session ;
 *    - il n'y a rien à voler sur le disque de sa machine ;
 *    - tant que l'onglet reste ouvert, le rafraîchissement silencieux joue son
 *      rôle : la session ne se coupe pas au bout de quinze minutes de travail.
 *
 *  On n'invente donc **aucun** stockage persistant pour ce secret.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Le mot de passe n'est jamais conservé.** Il traverse `login()` et
 * `changePassword()` en paramètre, part dans le corps de la requête, et n'est
 * stocké nulle part — pas même en mémoire.
 */

import { apiRequest, normalizeError } from './api';

/* -------------------------------------------------------------------------- */
/* Formes échangées avec le serveur (contrat docs/API-VAGUE-1.md)             */
/* -------------------------------------------------------------------------- */

export interface CompteConnecte {
  id: string;
  email: string;
  fullName: string;
  company: string | null;
  role: string;
  /** Vrai tant que le mot de passe temporaire n'a pas été remplacé. */
  mustChangePassword: boolean;
}

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface SessionResponse extends TokenBundle {
  user: CompteConnecte;
}

interface MeResponse {
  user: CompteConnecte;
}

/* -------------------------------------------------------------------------- */
/* État publié                                                                */
/* -------------------------------------------------------------------------- */

export type SessionStatus = 'anonymous' | 'authenticated';

/**
 * Motif d'une fin de session **subie**, ou d'un refus, à afficher sur l'écran
 * de connexion. `message` vient du serveur quand le serveur en fournit un — il
 * est alors repris tel quel, sans reformulation.
 */
export interface SessionNotice {
  kind: 'expired' | 'suspended' | 'role';
  message: string;
}

export interface SessionSnapshot {
  status: SessionStatus;
  user: CompteConnecte | null;
  notice: SessionNotice | null;
}

const EXPIRED_MESSAGE =
  'Votre session a expiré. Veuillez vous reconnecter pour continuer.';

/**
 * Le refus opposé à un compte client.
 *
 * Côté serveur, ce compte se connecte **avec succès** — c'est le même
 * `/api/auth/login` que l'application cliente — mais toutes les routes
 * d'administration lui répondent `404`, délibérément (contrat § 2 : un `403`
 * lui apprendrait que le dashboard existe). Sans ce contrôle de rôle, il
 * arriverait sur un dashboard dont chaque écran affiche « introuvable », sans
 * jamais comprendre pourquoi.
 */
export const MESSAGE_ROLE_REFUSE =
  'Ce compte n’a pas accès à l’administration. Utilisez l’application Irrigation Pro pour ouvrir vos projets.';

/* -------------------------------------------------------------------------- */
/* État interne                                                               */
/* -------------------------------------------------------------------------- */

/** Jeton d'accès : mémoire vive, et rien d'autre. */
let accessToken: string | null = null;

/** Jeton de rafraîchissement : mémoire vive également (voir l'en-tête). */
let refreshToken: string | null = null;

let snapshot: SessionSnapshot = { status: 'anonymous', user: null, notice: null };

const listeners = new Set<() => void>();

function publish(changes: Partial<SessionSnapshot>): void {
  snapshot = { ...snapshot, ...changes };
  for (const listener of [...listeners]) listener();
}

/** Abonnement bas niveau, consommé par `useSyncExternalStore`. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

/** Lu par le client HTTP pour l'en-tête `Authorization`. */
export function getAccessToken(): string | null {
  return accessToken;
}

/* -------------------------------------------------------------------------- */
/* Manipulation des jetons                                                    */
/* -------------------------------------------------------------------------- */

function rememberTokens(tokens: TokenBundle): void {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
}

function forgetTokens(): void {
  accessToken = null;
  refreshToken = null;
}

/**
 * Termine une session **subie** : jetons effacés, retour à l'écran de connexion
 * avec le motif.
 *
 * Le premier motif l'emporte : si le rafraîchissement a déjà constaté une
 * suspension, un 401 arrivé ensuite ne doit pas la transformer en banale
 * expiration.
 */
function endSession(kind: SessionNotice['kind'], message?: string): void {
  if (snapshot.status === 'anonymous' && snapshot.notice) return;

  forgetTokens();
  publish({
    status: 'anonymous',
    user: null,
    notice: { kind, message: message ?? EXPIRED_MESSAGE },
  });
}

/* -------------------------------------------------------------------------- */
/* Points d'entrée réservés au client HTTP (`api.ts`)                         */
/* -------------------------------------------------------------------------- */

/** Le serveur a répondu `403 ACCOUNT_SUSPENDED` sur une requête authentifiée. */
export function handleSuspendedResponse(message: string): void {
  endSession('suspended', message);
}

/** Le serveur refuse toujours le jeton après une tentative de rafraîchissement. */
export function handleAuthenticationFailure(): void {
  endSession('expired');
}

/**
 * Le serveur a répondu `403 PASSWORD_CHANGE_REQUIRED`. On ne déconnecte pas —
 * on impose l'écran de changement de mot de passe.
 */
export function markPasswordChangeRequired(): void {
  if (snapshot.user && !snapshot.user.mustChangePassword) {
    publish({ user: { ...snapshot.user, mustChangePassword: true } });
  }
}

/* -------------------------------------------------------------------------- */
/* Rafraîchissement mutualisé                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Rafraîchissement en cours, partagé par tous les appelants.
 *
 * **C'est le point délicat de tout ce fichier.** Un écran qui lance trois
 * requêtes reçoit trois `401` quasi simultanés. Sans mutualisation, trois
 * rafraîchissements partiraient en parallèle : le premier fait tourner le
 * jeton, les deux autres présentent alors un jeton déjà révoqué — et le
 * contrat impose au serveur de traiter cela comme un vol et de **révoquer
 * toutes les sessions du compte**. Le dashboard se déconnecterait lui-même.
 *
 * D'où la règle : **un seul rafraîchissement à la fois**, les autres attendent
 * son résultat.
 */
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Renvoie un jeton d'accès frais, ou `null` si la session est perdue.
 * Ne rejette jamais : l'échec est une valeur, pas une exception.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const run = performRefresh().finally(() => {
    if (refreshInFlight === run) refreshInFlight = null;
  });
  refreshInFlight = run;
  return run;
}

async function performRefresh(): Promise<string | null> {
  if (!refreshToken) {
    endSession('expired');
    return null;
  }

  try {
    const tokens = await apiRequest<TokenBundle>('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      // Route publique : ni en-tête, ni nouvelle tentative de rafraîchissement.
      auth: 'none',
    });
    rememberTokens(tokens);
    return tokens.accessToken;
  } catch (cause) {
    const error = normalizeError(cause);
    if (error.status === 403 && error.code === 'ACCOUNT_SUSPENDED') {
      endSession('suspended', error.message);
    } else {
      endSession('expired');
    }
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Actions de session                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Ouvre une session d'administration.
 *
 * Deux temps, et le second n'est pas une formalité :
 *
 *  1. `/api/auth/login` — laisse remonter l'`ApiError` : l'écran de connexion
 *     affiche le message du serveur tel quel (identifiants incorrects, compte
 *     suspendu, compte temporairement verrouillé).
 *
 *  2. `/api/auth/me` — **le rôle fait foi tel que le serveur vient de le
 *     relire.** Un compte `CLIENT` s'authentifie parfaitement ici : c'est la
 *     même API que l'application cliente. Il faut donc le refuser explicitement,
 *     sinon il atterrit sur un dashboard où chaque écran répond « introuvable »
 *     (le `404` volontaire du contrat), ce qui est incompréhensible.
 *
 * Le refus n'est pas qu'un affichage : la session ouverte à l'étape 1 est
 * **refermée côté serveur**. On ne laisse pas traîner un jeton de 30 jours
 * qu'on vient de décider de ne pas utiliser.
 */
export async function login(email: string, password: string): Promise<void> {
  const session = await apiRequest<SessionResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: 'none',
  });

  rememberTokens(session);

  let compte: CompteConnecte;
  try {
    compte = (await apiRequest<MeResponse>('/api/auth/me')).user;
  } catch (cause) {
    // Le compte s'est authentifié mais on ne peut pas confirmer son rôle : on
    // ne devine pas, on referme et on laisse l'écran afficher l'erreur.
    await revokeCurrentSession();
    forgetTokens();
    publish({ status: 'anonymous', user: null, notice: null });
    throw cause;
  }

  if (compte.role !== 'ADMIN') {
    await revokeCurrentSession();
    forgetTokens();
    publish({
      status: 'anonymous',
      user: null,
      notice: { kind: 'role', message: MESSAGE_ROLE_REFUSE },
    });
    return;
  }

  publish({ status: 'authenticated', user: compte, notice: null });
}

/**
 * Ferme la session côté serveur sans toucher à l'état publié.
 * Ne lève jamais : une révocation qui échoue laisse un jeton qui expirera seul.
 */
async function revokeCurrentSession(): Promise<void> {
  if (!refreshToken) return;
  try {
    await apiRequest<void>('/api/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      auth: 'best-effort',
    });
  } catch {
    // Sans conséquence : le jeton expirera de lui-même côté serveur.
  }
}

/**
 * Ferme la session en cours.
 *
 * Une déconnexion ne doit jamais échouer côté client : même si le serveur est
 * injoignable, les jetons locaux sont effacés. `auth: 'best-effort'` évite au
 * passage qu'un `401` déclenche un rafraîchissement inutile — puis un message
 * « session expirée » après un départ volontaire.
 */
export async function logout(): Promise<void> {
  await revokeCurrentSession();
  forgetTokens();
  publish({ status: 'anonymous', user: null, notice: null });
}

/**
 * Change le mot de passe et adopte le couple de jetons renvoyé.
 *
 * Le serveur révoque au passage toutes les autres sessions du compte : c'est
 * son affaire, le dashboard se contente de repartir avec ses nouveaux jetons.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const session = await apiRequest<SessionResponse>('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });

  rememberTokens(session);
  publish({ status: 'authenticated', user: session.user, notice: null });
}

/** Efface le motif de fin de session (le propriétaire relance une connexion). */
export function dismissSessionNotice(): void {
  if (snapshot.notice) publish({ notice: null });
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

/** Réservé aux tests : remet la session à son état de premier démarrage. */
export function resetSessionForTests(): void {
  accessToken = null;
  refreshToken = null;
  refreshInFlight = null;
  snapshot = { status: 'anonymous', user: null, notice: null };
}
