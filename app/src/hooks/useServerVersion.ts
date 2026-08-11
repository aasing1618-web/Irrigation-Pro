/**
 * Version publiée par le serveur (`GET /version`, route publique).
 *
 * Sert un seul écran — Paramètres — et un seul besoin : pouvoir dire au
 * téléphone « j'ai la version X, le serveur est en version Y ». C'est
 * l'information qui règle la moitié des dépannages à distance.
 *
 * Une indisponibilité n'est pas une erreur ici : si le serveur ne répond pas,
 * l'écran affiche « serveur injoignable » et passe à autre chose. On ne rejoue
 * donc aucune tentative automatique, et on ne remonte aucun message technique.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';

interface VersionResponse {
  name?: string;
  version?: string;
}

export interface ServerVersionState {
  /** Version du serveur, ou `null` tant qu'elle n'est pas connue. */
  version: string | null;
  isLoading: boolean;
  /** Vrai si le serveur n'a pas pu être interrogé. */
  isUnreachable: boolean;
}

export function useServerVersion(): ServerVersionState {
  const query = useQuery<VersionResponse>({
    queryKey: ['server-version'],
    queryFn: ({ signal }) => apiRequest<VersionResponse>('/version', { signal, auth: 'none' }),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const version = typeof query.data?.version === 'string' ? query.data.version : null;

  return {
    version,
    isLoading: query.isPending,
    isUnreachable: query.isError || (!query.isPending && version === null),
  };
}
