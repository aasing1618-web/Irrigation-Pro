/**
 * Client HTTP unique du dashboard.
 *
 * Adapté de `app/src/lib/api.ts` : même contrat d'erreur, même transport de
 * jetons, même rafraîchissement mutualisé. Tout appel au serveur passe par ici
 * — aucun `fetch` direct ailleurs dans le code. C'est ce qui garantit un seul
 * endroit où sont appliqués :
 *   - l'adresse de base validée (HTTPS obligatoire hors développement local) ;
 *   - le délai d'expiration des requêtes ;
 *   - la normalisation des erreurs ;
 *   - l'injection du jeton d'accès ;
 *   - le rafraîchissement automatique de la session, et la fin de session.
 *
 * ## Transport des jetons
 *
 * Jeton d'accès dans l'en-tête `Authorization: Bearer …`, jeton de
 * rafraîchissement dans le corps JSON de `/api/auth/login` et
 * `/api/auth/refresh`. **Aucun cookie**, d'où le `credentials: 'omit'` : le
 * dashboard est servi depuis `http://localhost:5174` et appelle une autre
 * origine. Un en-tête ne part que si on le met ; un cookie partirait tout seul,
 * y compris sur une requête déclenchée par un autre site — l'authentification
 * par en-tête est ce qui rend le CSRF sans objet ici.
 */

import { getConfig } from './config';
import {
  getAccessToken,
  handleAuthenticationFailure,
  handleSuspendedResponse,
  markPasswordChangeRequired,
  refreshAccessToken,
} from './session';

/** Format d'erreur renvoyé par le backend. */
interface BackendErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

/**
 * Erreur normalisée exposée au reste du dashboard.
 *
 * `status` vaut 0 lorsque la requête n'a jamais atteint le serveur
 * (serveur éteint, pas de réseau, délai dépassé).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  /** En-tête `X-Request-Id` fourni par le serveur, pour retrouver la trace. */
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

/** Codes d'erreur définis par les contrats d'API (Vagues 1 et 3). */
export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

/** Codes propres à l'administration (contrat Vague 3, § 3). */
export const AdminErrorCode = {
  EMAIL_DEJA_UTILISE: 'EMAIL_DEJA_UTILISE',
  ACTION_IMPOSSIBLE: 'ACTION_IMPOSSIBLE',
  NOT_FOUND: 'NOT_FOUND',
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

/** Message par défaut lorsque le serveur ne fournit pas de libellé exploitable. */
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

  const requestId = safeHeader(response, 'X-Request-Id');

  const error = new ApiError(
    asString(body?.error?.code, fallbackCode),
    // Les messages du backend sont rédigés en français et affichables tels
    // quels — un `409 ACTION_IMPOSSIBLE` explique *pourquoi* le refus, et c'est
    // exactement ce que le propriétaire doit lire. On ne les reformule jamais.
    asString(body?.error?.message, defaultMessageForStatus(response.status)),
    response.status,
    body?.error?.details,
    requestId,
  );

  console.error('[api] réponse en erreur', {
    status: response.status,
    url: response.url,
    code: error.code,
    requestId,
    details: error.details,
  });

  return error;
}

/** Combine le signal d'annulation de l'appelant avec le délai d'expiration. */
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

/** Répercute sur la session ce que dit une réponse en erreur. */
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
  return new ApiError(ApiErrorCode.UNKNOWN, 'Une erreur inattendue est survenue.', 0, cause);
}

/**
 * Construit une chaîne de requête en ignorant les valeurs vides.
 *
 * Un filtre non renseigné doit être **absent** de l'URL, pas présent et vide :
 * `?statut=` serait refusé par le schéma `zod` du serveur, qui n'accepte que
 * `ACTIF` ou `SUSPENDU`.
 */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered === '' ? '' : `?${rendered}`;
}
