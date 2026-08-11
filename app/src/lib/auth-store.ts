/**
 * La session de l'utilisateur — état et actions.
 *
 * C'est le seul endroit du logiciel qui détient les jetons. Aucun écran, aucun
 * composant, aucun autre module ne les lit ni ne les écrit directement.
 *
 * ## Où vit chaque jeton, et pourquoi
 *
 * | Jeton                 | Durée  | Où il est rangé                       |
 * |-----------------------|--------|---------------------------------------|
 * | Accès (JWT)           | 15 min | **Mémoire vive uniquement** (`accessToken` ci-dessous) |
 * | Rafraîchissement      | 30 j   | `SecureStore` (voir `secure-store.ts`) |
 *
 * Le jeton d'accès n'est jamais écrit nulle part : ni disque, ni
 * `localStorage`, ni état de composant persisté. Fermer le logiciel le perd —
 * c'est voulu, il se regagne en une requête. Le jeton de rafraîchissement, lui,
 * est un secret durable : il passe par l'abstraction `SecureStore`.
 *
 * ## Deux transports de session (D-013)
 *
 * Le `SecureStore` annonce son `transport`, et ce module s'y conforme :
 *
 * - `body`   — coque Tauri. Le jeton circule dans le JSON, on le range
 *              nous-mêmes. C'est le comportement des Vagues 1 à 3, inchangé.
 * - `cookie` — navigateur. On ajoute `sessionTransport: "cookie"` au corps des
 *              quatre routes de session ; le serveur pose un cookie `HttpOnly`
 *              et **n'envoie plus** de `refreshToken`. Il n'y a donc rien à
 *              ranger, rien à relire, et rien à effacer localement : le secret
 *              de 30 jours n'entre jamais dans la mémoire du JavaScript.
 *
 * Une seule conséquence visible ici : en mode cookie, on ne peut pas savoir
 * d'avance si une session existe. Au démarrage, on tente donc systématiquement
 * un rafraîchissement, et un `401` signifie simplement « personne n'est
 * connecté » — pas « votre session a expiré ». Voir `performRestore`.
 *
 * **Le mot de passe n'est jamais conservé.** Il traverse `login()` et
 * `changePassword()` en paramètre, part dans le corps de la requête, et n'est
 * stocké nulle part — pas même en mémoire.
 *
 * ## Comment l'interface s'y branche
 *
 * L'état est publié sous forme d'un instantané immuable (`AuthSnapshot`) lu par
 * React via `useSyncExternalStore` (voir `auth/AuthProvider.tsx`). Ce module ne
 * dépend d'aucun composant : il est testable seul, sans rendu.
 */

import { apiRequest, normalizeError } from './api';
import {
  createMemorySecureStore,
  resolveSecureStore,
  type SecureStore,
  type SessionTransport,
} from './secure-store';

/* -------------------------------------------------------------------------- */
/* Formes échangées avec le serveur (contrat docs/API-VAGUE-1.md)             */
/* -------------------------------------------------------------------------- */

export interface AuthUser {
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
  /**
   * Absent en mode `cookie` : c'est tout l'objet de la manœuvre, le serveur
   * garde le secret pour lui et le range dans un cookie `HttpOnly`.
   */
  refreshToken?: string;
  expiresIn: number;
  /** Écho du serveur : le transport qu'il a effectivement appliqué. */
  sessionTransport?: SessionTransport;
}

interface SessionResponse extends TokenBundle {
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
}

/* -------------------------------------------------------------------------- */
/* État publié                                                                */
/* -------------------------------------------------------------------------- */

export type SessionStatus =
  /** Reprise silencieuse en cours au démarrage : on ne sait pas encore. */
  | 'restoring'
  /** Personne n'est connecté : l'écran de connexion s'impose. */
  | 'anonymous'
  /** Session ouverte. */
  | 'authenticated';

/**
 * Motif d'une fin de session **subie** (par opposition à une déconnexion
 * volontaire), à afficher sur l'écran de connexion.
 *
 * `message` vient du serveur quand le serveur en fournit un — il est alors
 * repris tel quel, sans reformulation.
 */
export interface SessionNotice {
  kind: 'expired' | 'suspended';
  message: string;
}

export interface AuthSnapshot {
  status: SessionStatus;
  user: AuthUser | null;
  notice: SessionNotice | null;
}

const EXPIRED_MESSAGE =
  'Votre session a expiré. Veuillez vous reconnecter pour continuer votre travail.';

/* -------------------------------------------------------------------------- */
/* État interne                                                               */
/* -------------------------------------------------------------------------- */

/** Jeton d'accès : mémoire vive, et rien d'autre. */
let accessToken: string | null = null;

/** Emplacement protégé du jeton de rafraîchissement. */
let secureStore: SecureStore = resolveSecureStore();

let snapshot: AuthSnapshot = { status: 'restoring', user: null, notice: null };

const listeners = new Set<() => void>();

/**
 * Publie un nouvel instantané. La référence change à chaque modification —
 * c'est ce qui permet à `useSyncExternalStore` de savoir qu'il doit rendre.
 */
function publish(changes: Partial<AuthSnapshot>): void {
  snapshot = { ...snapshot, ...changes };
  for (const listener of [...listeners]) listener();
}

/** Abonnement bas niveau, consommé par `useSyncExternalStore`. */
export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

/** Lu par le client HTTP pour l'en-tête `Authorization`. */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Transport de session en vigueur.
 *
 * Lu par le client HTTP (`api.ts`) pour décider s'il faut joindre le cookie
 * aux requêtes vers `/api/auth/*`. C'est la seule information de session
 * qu'`api.ts` a besoin de connaître en plus du jeton d'accès.
 */
export function getSessionTransport(): SessionTransport {
  return secureStore.transport;
}

/* -------------------------------------------------------------------------- */
/* Manipulation des jetons                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Complète le corps d'une requête de session selon le transport en cours.
 *
 * En mode `body`, on n'ajoute **rien** : le contrat fait de `body` la valeur
 * par défaut, et une requête muette doit continuer de se comporter comme avant
 * la Vague 4, y compris face à un serveur qui ne connaîtrait pas ce champ.
 */
function withTransport<T extends object>(body: T): T {
  return secureStore.transport === 'cookie'
    ? { ...body, sessionTransport: 'cookie' as const }
    : body;
}

/**
 * Vérifie que le serveur a bien compris où ranger le jeton.
 *
 * Le contrat impose au serveur de renvoyer `sessionTransport` dans les deux
 * modes, précisément pour permettre ce contrôle. Un désaccord n'est pas
 * rattrapable côté client — on ne peut pas ranger un jeton dans un cookie
 * `HttpOnly` depuis le JavaScript — mais il doit être visible : sans cette
 * trace, la panne se présenterait comme une déconnexion inexpliquée au
 * prochain rechargement de page.
 */
function checkTransportEcho(tokens: TokenBundle): void {
  const expected = secureStore.transport;
  const applied = tokens.sessionTransport ?? 'body';
  if (applied === expected) return;

  console.error('[session] transport de session inattendu', { demandé: expected, appliqué: applied });
}

async function rememberTokens(tokens: TokenBundle): Promise<void> {
  accessToken = tokens.accessToken;
  checkTransportEcho(tokens);

  // En mode cookie, il n'y a pas de jeton dans le corps : le serveur l'a posé
  // dans un cookie `HttpOnly`, et `secureStore.write()` serait sans objet.
  if (tokens.refreshToken) {
    await secureStore.write(tokens.refreshToken);
  }
}

async function forgetTokens(): Promise<void> {
  accessToken = null;
  await secureStore.clear();
}

/**
 * Vrai pendant la tentative de reprise silencieuse du mode cookie.
 *
 * En mode cookie, l'application n'a aucun moyen de savoir s'il existe une
 * session avant de la demander au serveur. Un `401` au démarrage est donc le
 * cas **normal** du visiteur qui n'est pas connecté : afficher « votre session
 * a expiré » à quelqu'un qui vient d'ouvrir l'application serait un mensonge.
 */
let silentProbe = false;

/**
 * Termine une session **subie** : jetons effacés, retour à l'écran de connexion
 * avec le motif.
 *
 * Le premier motif l'emporte : si le rafraîchissement a déjà constaté une
 * suspension, un 401 arrivé ensuite ne doit pas la transformer en banale
 * expiration.
 */
async function endSession(kind: SessionNotice['kind'], message?: string): Promise<void> {
  if (snapshot.status === 'anonymous' && snapshot.notice) return;

  await forgetTokens();

  // Sondage de démarrage sans session : écran de connexion nu, sans alarme.
  // Une suspension, elle, reste annoncée — c'est une information que le client
  // doit avoir, quel que soit le moment où elle arrive.
  if (silentProbe && kind === 'expired') {
    publish({ status: 'anonymous', user: null, notice: null });
    return;
  }

  publish({
    status: 'anonymous',
    user: null,
    notice: { kind, message: message ?? EXPIRED_MESSAGE },
  });
}

/* -------------------------------------------------------------------------- */
/* Points d'entrée réservés au client HTTP (`api.ts`)                         */
/* -------------------------------------------------------------------------- */

/**
 * Le serveur a répondu `403 ACCOUNT_SUSPENDED` sur une requête authentifiée.
 * C'est le chemin par lequel une suspension décidée dans le dashboard du
 * propriétaire devient visible pour le client (cf. D-010).
 */
export function handleSuspendedResponse(message: string): void {
  void endSession('suspended', message);
}

/** Le serveur refuse toujours le jeton après une tentative de rafraîchissement. */
export function handleAuthenticationFailure(): void {
  void endSession('expired');
}

/**
 * Le serveur a répondu `403 PASSWORD_CHANGE_REQUIRED` : le compte doit changer
 * de mot de passe (le propriétaire a pu le réinitialiser en cours de session).
 * On ne déconnecte pas — on impose l'écran de changement.
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
 * requêtes au démarrage reçoit trois `401` quasi simultanés. Sans mutualisation,
 * trois rafraîchissements partiraient en parallèle : le premier fait tourner le
 * jeton, les deux autres présentent alors un jeton déjà révoqué — et le contrat
 * (§ 2, `/api/auth/refresh`) impose au serveur de traiter cela comme un vol et
 * de **révoquer toutes les sessions du compte**. L'application se déconnecterait
 * donc elle-même.
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
  // En mode cookie, il n'y a rien à lire : le navigateur joindra le cookie
  // `HttpOnly` à la requête. On ne peut donc pas court-circuiter l'appel, et
  // c'est le serveur qui tranche.
  const cookieMode = secureStore.transport === 'cookie';
  const refreshToken = cookieMode ? null : await secureStore.read();

  if (!cookieMode && !refreshToken) {
    await endSession('expired');
    return null;
  }

  try {
    const tokens = await apiRequest<TokenBundle>('/api/auth/refresh', {
      method: 'POST',
      body: withTransport(cookieMode ? {} : { refreshToken }),
      // Route publique : ni en-tête, ni nouvelle tentative de rafraîchissement.
      auth: 'none',
    });
    await rememberTokens(tokens);
    return tokens.accessToken;
  } catch (cause) {
    const error = normalizeError(cause);
    if (error.status === 403 && error.code === 'ACCOUNT_SUSPENDED') {
      await endSession('suspended', error.message);
    } else {
      await endSession('expired');
    }
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Actions de session                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Ouvre une session.
 *
 * Laisse remonter l'`ApiError` : l'écran de connexion affiche le message du
 * serveur tel quel (identifiants incorrects, compte suspendu, compte
 * temporairement verrouillé).
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  const session = await apiRequest<SessionResponse>('/api/auth/login', {
    method: 'POST',
    body: withTransport({ email, password }),
    auth: 'none',
  });

  await rememberTokens(session);
  publish({ status: 'authenticated', user: session.user, notice: null });
  return session.user;
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
  const cookieMode = secureStore.transport === 'cookie';
  const refreshToken = cookieMode ? null : await secureStore.read();

  // En mode cookie, l'appel est **obligatoire** : lui seul efface le cookie,
  // que le JavaScript ne peut pas toucher. Le sauter laisserait la session
  // ouverte côté serveur alors que l'utilisateur croit être parti.
  if (cookieMode || refreshToken) {
    try {
      await apiRequest<void>('/api/auth/logout', {
        method: 'POST',
        body: withTransport(cookieMode ? {} : { refreshToken }),
        auth: 'best-effort',
      });
    } catch {
      // Sans conséquence : le jeton expirera de lui-même côté serveur.
    }
  }

  await forgetTokens();
  publish({ status: 'anonymous', user: null, notice: null });
}

/**
 * Change le mot de passe et adopte le couple de jetons renvoyé.
 *
 * Le serveur révoque au passage toutes les autres sessions du compte : c'est
 * son affaire, l'application se contente de repartir avec ses nouveaux jetons.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthUser> {
  const session = await apiRequest<SessionResponse>('/api/auth/change-password', {
    method: 'POST',
    body: withTransport({ currentPassword, newPassword }),
  });

  await rememberTokens(session);
  publish({ status: 'authenticated', user: session.user, notice: null });
  return session.user;
}

/** Efface le motif de fin de session (l'utilisateur relance une connexion). */
export function dismissSessionNotice(): void {
  if (snapshot.notice) publish({ notice: null });
}

/* -------------------------------------------------------------------------- */
/* Reprise silencieuse au démarrage                                           */
/* -------------------------------------------------------------------------- */

let restoreInFlight: Promise<void> | null = null;

/**
 * Tente de rouvrir la session sans redemander le mot de passe.
 *
 * Appelée une seule fois au lancement. Idempotente : le mode strict de React
 * déclenche les effets deux fois en développement, et deux rafraîchissements
 * concurrents feraient révoquer la session (voir `refreshInFlight`).
 */
export function restoreSession(): Promise<void> {
  if (!restoreInFlight) restoreInFlight = performRestore();
  return restoreInFlight;
}

async function performRestore(): Promise<void> {
  const cookieMode = secureStore.transport === 'cookie';

  if (!cookieMode) {
    const refreshToken = await secureStore.read();

    // Cas courant tant que le trousseau Windows n'est pas branché : rien à
    // reprendre, on va directement à l'écran de connexion.
    if (!refreshToken) {
      publish({ status: 'anonymous', user: null });
      return;
    }
  }

  // Mode cookie : on ne sait pas s'il y a une session, on la demande. Le
  // `401` du visiteur non connecté ne doit alors produire aucun message —
  // d'où le sondage silencieux. Pendant tout ce temps, le statut reste
  // `restoring` : l'écran de connexion ne clignote pas devant quelqu'un qui,
  // lui, est déjà connecté.
  silentProbe = cookieMode;
  let token: string | null;
  try {
    token = await refreshAccessToken();
  } finally {
    silentProbe = false;
  }
  if (!token) return; // `endSession` a déjà publié le motif (ou l'absence de motif).

  try {
    const { user } = await apiRequest<MeResponse>('/api/auth/me');
    publish({ status: 'authenticated', user, notice: null });
  } catch (cause) {
    // Compte suspendu ou jeton refusé : le client HTTP a déjà terminé la
    // session. Ce filet ne sert qu'aux échecs réseau.
    if (snapshot.status === 'restoring') {
      const error = normalizeError(cause);
      publish({
        status: 'anonymous',
        user: null,
        notice: { kind: 'expired', message: error.isNetworkError ? error.message : EXPIRED_MESSAGE },
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Réservé aux tests : remet la session à son état de premier démarrage.
 * Les abonnés ne sont pas touchés — `@testing-library` démonte les composants
 * lui-même entre deux tests.
 */
export function resetAuthStoreForTests(store: SecureStore = createMemorySecureStore()): void {
  accessToken = null;
  secureStore = store;
  refreshInFlight = null;
  restoreInFlight = null;
  silentProbe = false;
  snapshot = { status: 'restoring', user: null, notice: null };
}

/** Réservé aux tests : le jeton de rafraîchissement effectivement rangé. */
export function readStoredRefreshTokenForTests(): Promise<string | null> {
  return secureStore.read();
}
