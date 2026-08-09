/**
 * Client HTTP unique de l'application.
 *
 * Tout appel au serveur Irrigation Pro passe par ici — aucun `fetch` direct
 * ailleurs dans le code. Cela garantit un seul endroit où sont appliqués :
 *   - l'adresse de base validée (HTTPS obligatoire hors développement local) ;
 *   - le délai d'expiration des requêtes ;
 *   - la normalisation des erreurs ;
 *   - (Vague 1) l'injection du jeton d'authentification.
 *
 * Rappel décision D-007 : aucune formule de calcul métier ne vit côté client.
 * Ce module envoie des paramètres et reçoit des résultats, rien de plus.
 */

import { getConfig } from './config';

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

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Corps de requête ; sérialisé en JSON automatiquement. */
  body?: unknown;
  /** Permet à React Query d'annuler une requête devenue inutile. */
  signal?: AbortSignal;
  /** Surcharge ponctuelle du délai d'expiration. */
  timeoutMs?: number;
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

/**
 * Exécute un appel typé vers le backend.
 *
 * `T` décrit la forme attendue de la réponse. Le client ne valide pas le schéma
 * en profondeur : chaque appelant reste responsable de lire défensivement les
 * champs optionnels.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const config = getConfig();
  const { method = 'GET', body, signal, timeoutMs = config.requestTimeoutMs } = options;

  const url = `${config.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // --- Vague 1 : authentification ------------------------------------------
  // Contrat arrêté avec l'agent Backend — à appliquer tel quel, ne pas le
  // rediscuter :
  //
  //   * Jeton d'accès (JWT, 15 min) : ajouté ICI, et nulle part ailleurs.
  //       const token = getAccessToken();
  //       if (token) headers.Authorization = `Bearer ${token}`;
  //     Il vit UNIQUEMENT en mémoire — jamais sur le disque.
  //
  //   * Jeton de rafraîchissement (30 j) : transite dans le CORPS JSON de
  //     POST /api/auth/login et POST /api/auth/refresh. Aucun cookie n'est
  //     émis ni lu, d'où le `credentials: 'omit'` ci-dessous — l'application
  //     est servie depuis `tauri://localhost` et appelle une API d'un autre
  //     domaine : un cookie y serait un cookie tierce-partie, donc soumis au
  //     bon vouloir de la WebView. À conserver.
  //     C'est le seul secret de longue durée du logiciel : il doit être
  //     rangé dans le stockage sécurisé de l'OS via Tauri, jamais dans
  //     `localStorage`.
  //     Ce rangement est un choix purement client — le serveur ne fait que
  //     délivrer et accepter le jeton. Toute la Vague 1 (connexion, compte
  //     SUSPENDU, mot de passe à changer, rafraîchissement, révocation) est
  //     donc développable et testable en navigateur, avec un simple stockage
  //     en mémoire derrière l'abstraction. Le plugin Rust ne comble qu'un
  //     seul trou : « je relance le logiciel demain et je suis encore
  //     connecté ». Il est requis pour LIVRER la Vague 1, pas pour la
  //     développer.
  //
  //   * Sur 401 : UN SEUL essai de rafraîchissement, puis retour à l'écran de
  //     connexion s'il échoue à son tour. Un compte passé SUSPENDU fait
  //     échouer le rafraîchissement — c'est par ce chemin qu'une suspension
  //     prend effet côté application, en 15 minutes au maximum.
  //     Cette logique viendra s'insérer autour de l'appel `fetch` ci-dessous.
  // -------------------------------------------------------------------------

  const timeout = withTimeout(timeoutMs, signal);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
      // L'authentification passera par un en-tête, pas par un cookie.
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (cause) {
    if (timeout.timedOut()) {
      console.error('[api] délai dépassé', { url, timeoutMs });
      throw new ApiError(
        ApiErrorCode.TIMEOUT,
        "Le serveur d'Irrigation Pro met trop de temps à répondre.",
        0,
        cause,
      );
    }
    if (signal?.aborted) {
      throw new ApiError(ApiErrorCode.ABORTED, 'Requête annulée.', 0, cause);
    }
    console.error('[api] serveur injoignable', { url, cause });
    throw new ApiError(
      ApiErrorCode.NETWORK,
      "Impossible de contacter le serveur d'Irrigation Pro.",
      0,
      cause,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    console.error('[api] réponse illisible', { url, cause });
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
