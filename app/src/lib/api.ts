/**
 * Client HTTP unique de l'application.
 *
 * Tout appel au serveur Irrigation Pro passe par ici — aucun `fetch` direct
 * ailleurs dans le code. Cela garantit un seul endroit où sont appliqués :
 *   - l'adresse de base validée (HTTPS obligatoire hors développement local) ;
 *   - le délai d'expiration des requêtes ;
 *   - la normalisation des erreurs ;
 *   - l'injection du jeton d'accès ;
 *   - le rafraîchissement automatique de la session, et la fin de session.
 *
 * Rappel décision D-007 : aucune formule de calcul métier ne vit côté client.
 * Ce module envoie des paramètres et reçoit des résultats, rien de plus.
 *
 * ## Transport des jetons (D-005b — à conserver tel quel)
 *
 * Jeton d'accès dans l'en-tête `Authorization: Bearer …`, jeton de
 * rafraîchissement dans le corps JSON de `/api/auth/login` et
 * `/api/auth/refresh`. **Aucun cookie**, d'où le `credentials: 'omit'` :
 * l'application est servie depuis `tauri://localhost` et appelle une autre
 * origine ; un cookie y serait un cookie tierce-partie, soumis au bon vouloir
 * de la WebView de Windows.
 *
 * ## Cycle d'import assumé
 *
 * `api.ts` ⇄ `auth-store.ts` s'importent mutuellement. C'est volontaire et sans
 * danger : aucun des deux modules n'appelle l'autre pendant son évaluation,
 * uniquement depuis le corps de fonctions. Le client HTTP a besoin de la
 * session (jeton, rafraîchissement) et la session a besoin du client HTTP
 * (login, refresh) — les séparer artificiellement coûterait plus cher en
 * indirection que ce cycle ne coûte en lisibilité.
 */

import { getConfig } from './config';
import {
  getAccessToken,
  handleAuthenticationFailure,
  handleSuspendedResponse,
  markPasswordChangeRequired,
  refreshAccessToken,
} from './auth-store';

/** Format d'erreur renvoyé par le backend. */
interface BackendErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

/**
 * Erreur normalisée exposée au reste de l'application.
 *
 * `status` vaut 0 lorsque la requête n'a jamais atteint le serveur
 * (serveur éteint, pas de réseau, délai dépassé).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  /**
   * Identifiant de la requête (en-tête `X-Request-Id`), fourni par le serveur.
   * Affiché discrètement dans les écrans d'erreur : c'est ce que l'utilisateur
   * communique au support pour qu'on retrouve la trace exacte côté serveur.
   */
  readonly requestId: string | null;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
    requestId?: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId ?? null;
  }

  /** Le serveur n'a pas pu être contacté du tout. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** Le serveur répond mais s'annonce indisponible (maintenance, base KO). */
  get isUnavailable(): boolean {
    return this.status === 503;
  }
}

export const ApiErrorCode = {
  NETWORK: 'NETWORK_UNREACHABLE',
  TIMEOUT: 'REQUEST_TIMEOUT',
  ABORTED: 'REQUEST_ABORTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  UNKNOWN: 'UNKNOWN_ERROR',
} as const;

/** Codes d'erreur d'authentification définis par le contrat d'API. */
export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

/**
 * Comportement d'authentification d'une requête.
 *
 * - `required` (défaut) : joint le jeton, rafraîchit une fois sur `401`,
 *   termine la session si le rafraîchissement échoue à son tour.
 * - `none` : route publique (`login`, `refresh`) — aucun jeton, aucun effet de
 *   session. L'appelant traite l'erreur lui-même.
 * - `best-effort` : joint le jeton s'il existe, mais ne rafraîchit rien et ne
 *   termine aucune session. Réservé à la déconnexion.
 */
export type AuthMode = 'required' | 'none' | 'best-effort';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Corps de requête ; sérialisé en JSON automatiquement. */
  body?: unknown;
  /** Permet à React Query d'annuler une requête devenue inutile. */
  signal?: AbortSignal;
  /** Surcharge ponctuelle du délai d'expiration. */
  timeoutMs?: number;
  /** Voir `AuthMode`. */
  auth?: AuthMode;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/** Lit un en-tête sans jamais faire échouer l'appel (mocks de test compris). */
function safeHeader(response: Response, name: string): string | null {
  try {
    return response.headers?.get(name) ?? null;
  } catch {
    return null;
  }
}

/**
 * Message par défaut lorsque le serveur ne fournit pas de libellé exploitable.
 * Volontairement non technique : l'utilisateur est un agronome, pas un
 * administrateur système. Le détail brut part dans la console.
 */
function defaultMessageForStatus(status: number): string {
  if (status === 503) return "Le serveur d'Irrigation Pro est momentanément indisponible.";
  if (status === 401 || status === 403) return "Vous n'avez pas accès à cette ressource.";
  if (status === 404) return 'La ressource demandée est introuvable.';
  if (status === 429) return 'Trop de tentatives. Veuillez patienter avant de réessayer.';
  if (status >= 500) return "Le serveur d'Irrigation Pro a rencontré un problème.";
  return 'La demande n’a pas pu être traitée.';
}

/** Traduit une réponse HTTP en échec en `ApiError`. */
async function toApiError(response: Response): Promise<ApiError> {
  let body: BackendErrorBody | null = null;
  try {
    body = (await response.json()) as BackendErrorBody;
  } catch {
    body = null;
  }

  const fallbackCode =
    response.status === 503 ? ApiErrorCode.SERVICE_UNAVAILABLE : `HTTP_${response.status}`;

  // Exposé par le serveur via Access-Control-Expose-Headers.
  const requestId = safeHeader(response, 'X-Request-Id');

  const error = new ApiError(
    asString(body?.error?.code, fallbackCode),
    // Les messages du backend sont rédigés en français et affichables tels
    // quels ; on peut donc les reprendre sans les reformuler.
    asString(body?.error?.message, defaultMessageForStatus(response.status)),
    response.status,
    body?.error?.details,
    requestId,
  );

  // Le détail technique reste pour le développeur, jamais pour l'écran.
  console.error('[api] réponse en erreur', {
    status: response.status,
    url: response.url,
    code: error.code,
    requestId,
    details: error.details,
  });

  return error;
}

/**
 * Combine le signal d'annulation de l'appelant (React Query) avec le
 * déclencheur de délai d'expiration interne.
 */
function withTimeout(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
    timedOut: () => timedOut,
  };
}

interface SendOptions {
  url: string;
  method: string;
  /** Corps déjà sérialisé — identique entre la première tentative et la reprise. */
  payload: string | undefined;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Un aller-retour réseau, sans aucune logique de session.
 *
 * Renvoie la réponse brute, quel que soit son code. Seule l'impossibilité de
 * joindre le serveur lève une `ApiError`.
 */
async function sendOnce(options: SendOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.payload !== undefined) headers['Content-Type'] = 'application/json';
  // Le jeton d'accès est ajouté ICI, et nulle part ailleurs.
  if (token) headers.Authorization = `Bearer ${token}`;

  const timeout = withTimeout(options.timeoutMs, options.signal);

  try {
    return await fetch(options.url, {
      method: options.method,
      headers,
      body: options.payload,
      signal: timeout.signal,
      // L'authentification passe par un en-tête, pas par un cookie.
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (cause) {
    if (timeout.timedOut()) {
      console.error('[api] délai dépassé', { url: options.url, timeoutMs: options.timeoutMs });
      throw new ApiError(
        ApiErrorCode.TIMEOUT,
        "Le serveur d'Irrigation Pro met trop de temps à répondre.",
        0,
        cause,
      );
    }
    if (options.signal?.aborted) {
      throw new ApiError(ApiErrorCode.ABORTED, 'Requête annulée.', 0, cause);
    }
    console.error('[api] serveur injoignable', { url: options.url, cause });
    throw new ApiError(
      ApiErrorCode.NETWORK,
      "Impossible de contacter le serveur d'Irrigation Pro.",
      0,
      cause,
    );
  } finally {
    timeout.cleanup();
  }
}

/**
 * Obtient un jeton d'accès utilisable après un `401`, ou `null` si la session
 * est perdue.
 *
 * `tokenUsed` est le jeton avec lequel la requête vient d'échouer. S'il a déjà
 * changé, c'est qu'un autre appel a rafraîchi entre-temps : on rejoue
 * directement, sans redemander de rotation.
 */
async function obtainFreshAccessToken(tokenUsed: string | null): Promise<string | null> {
  const current = getAccessToken();
  if (current && current !== tokenUsed) return current;
  return refreshAccessToken();
}

/**
 * Répercute sur la session ce que dit une réponse en erreur.
 *
 * C'est le seul endroit qui décide de renvoyer l'utilisateur à l'écran de
 * connexion.
 */
function applySessionSideEffects(error: ApiError, auth: AuthMode): void {
  if (auth !== 'required') return;

  if (error.status === 403 && error.code === AuthErrorCode.ACCOUNT_SUSPENDED) {
    handleSuspendedResponse(error.message);
    return;
  }
  if (error.status === 403 && error.code === AuthErrorCode.PASSWORD_CHANGE_REQUIRED) {
    markPasswordChangeRequired();
    return;
  }
  if (error.status === 401) {
    handleAuthenticationFailure();
  }
}

/**
 * Exécute un appel typé vers le backend.
 *
 * `T` décrit la forme attendue de la réponse. Le client ne valide pas le schéma
 * en profondeur : chaque appelant reste responsable de lire défensivement les
 * champs optionnels.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const config = getConfig();
  const {
    method = 'GET',
    body,
    signal,
    timeoutMs = config.requestTimeoutMs,
    auth = 'required',
  } = options;

  const send: SendOptions = {
    url: `${config.apiUrl}${path.startsWith('/') ? path : `/${path}`}`,
    method,
    payload: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs,
    signal,
  };

  const tokenUsed = auth === 'none' ? null : getAccessToken();
  let response = await sendOnce(send, tokenUsed);

  // Sur 401 : UNE SEULE tentative de rafraîchissement, puis reprise de la
  // requête d'origine. Le rafraîchissement lui-même est mutualisé entre tous
  // les appels en cours (voir `refreshAccessToken`).
  if (response.status === 401 && auth === 'required') {
    const freshToken = await obtainFreshAccessToken(tokenUsed);
    if (freshToken) {
      response = await sendOnce(send, freshToken);
    }
  }

  if (!response.ok) {
    const error = await toApiError(response);
    applySessionSideEffects(error, auth);
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    console.error('[api] réponse illisible', { url: send.url, cause });
    throw new ApiError(
      ApiErrorCode.INVALID_RESPONSE,
      "La réponse du serveur d'Irrigation Pro est illisible.",
      response.status,
      cause,
    );
  }
}

/** Convertit n'importe quelle valeur levée en `ApiError` exploitable. */
export function normalizeError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  console.error('[api] erreur inattendue', cause);
  return new ApiError(
    ApiErrorCode.UNKNOWN,
    'Une erreur inattendue est survenue.',
    0,
    cause,
  );
}
