/**
 * État de la liaison avec le serveur Irrigation Pro.
 *
 * L'application interroge `GET /health` au démarrage. Trois issues seulement
 * sont présentées à l'utilisateur : le serveur répond, le serveur est
 * injoignable, le serveur est en mode dégradé. Toute autre nuance (code HTTP,
 * pile d'appels, message technique) reste dans la console.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ApiError, apiRequest, normalizeError } from '../lib/api';

/**
 * Réponse attendue de `GET /health`.
 *
 * Tous les champs sont optionnels côté client : le backend est développé en
 * parallèle, et l'écran de démarrage ne doit jamais casser parce qu'un champ
 * d'affichage manque. Seul le code HTTP fait foi pour décider de l'état.
 */
export interface HealthResponse {
  /** « ok » (HTTP 200) ou « degraded » (HTTP 503) — toujours cohérent avec le code HTTP. */
  status?: string;
  /** Version du serveur ; toujours présente. */
  version?: string;
  /** Durée de fonctionnement du serveur, en secondes. */
  uptime?: number;
  timestamp?: string;
  database?: {
    /** Booléen — contrat confirmé par l'agent Backend (et non `status`). */
    ok?: boolean;
    latencyMs?: number;
  };
}

export type ConnectionState =
  /** Interrogation en cours. */
  | { kind: 'checking' }
  /** Serveur joignable et opérationnel. */
  | { kind: 'online'; health: HealthResponse }
  /** Serveur joignable mais dégradé (503) — typiquement la base est KO. */
  | { kind: 'degraded'; message: string; requestId: string | null }
  /** Serveur injoignable : réseau, serveur éteint, délai dépassé. */
  | { kind: 'offline'; message: string; requestId: string | null };

const HEALTH_QUERY_KEY = ['health'] as const;

/**
 * Vrai si le corps de la réponse s'annonce lui-même dégradé.
 *
 * Le contrat garantit que « degraded » s'accompagne d'un 503 (donc d'une
 * `ApiError`), mais on double la lecture ici : si un jour le serveur renvoyait
 * un 200 avec une base KO, l'application ne prétendrait pas que tout va bien.
 */
function bodySaysDegraded(health: HealthResponse): boolean {
  if (health.status?.toLowerCase() === 'degraded') return true;
  if (health.database?.ok === false) return true;
  return false;
}

export interface UseHealthResult {
  state: ConnectionState;
  /** Relance l'interrogation (bouton « Réessayer »). */
  retry: () => void;
  /** Vrai pendant une nouvelle tentative déclenchée manuellement. */
  isRetrying: boolean;
  query: UseQueryResult<HealthResponse, ApiError>;
}

export function useHealth(): UseHealthResult {
  const query = useQuery<HealthResponse, ApiError>({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await apiRequest<HealthResponse>('/health', { signal });
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    // Une seule tentative automatique : au-delà, on rend la main à
    // l'utilisateur avec un bouton « Réessayer » plutôt que de le faire
    // patienter devant un écran de chargement interminable.
    retry: 1,
    retryDelay: 800,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    state: toConnectionState(query),
    retry: () => {
      void query.refetch();
    },
    isRetrying: query.isFetching && !query.isLoading,
    query,
  };
}

function toConnectionState(query: UseQueryResult<HealthResponse, ApiError>): ConnectionState {
  if (query.isPending) {
    return { kind: 'checking' };
  }

  if (query.isError) {
    const error = query.error;
    if (error?.isUnavailable) {
      return {
        kind: 'degraded',
        message:
          "Le serveur d'Irrigation Pro est joignable, mais il n'est pas en mesure de traiter " +
          'les demandes pour le moment. Une maintenance est probablement en cours.',
        requestId: error.requestId,
      };
    }
    return {
      kind: 'offline',
      message:
        "Impossible de contacter le serveur d'Irrigation Pro. Vérifiez votre connexion internet.",
      requestId: error?.requestId ?? null,
    };
  }

  const health = query.data ?? {};
  if (bodySaysDegraded(health)) {
    return {
      kind: 'degraded',
      message:
        "Le serveur d'Irrigation Pro répond, mais certains services sont indisponibles. " +
        'Vos calculs et vos rapports peuvent être interrompus.',
      requestId: null,
    };
  }

  return { kind: 'online', health };
}
