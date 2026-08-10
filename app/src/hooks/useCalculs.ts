/**
 * Accès au catalogue des modules et à l'exécution des calculs.
 *
 * Le catalogue est mis en cache longuement : il ne change qu'à la mise à jour
 * du serveur, et le recharger à chaque ouverture d'un formulaire ferait
 * attendre l'utilisateur pour rien.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, normalizeError } from '../lib/api';
import {
  deleteCalcul,
  fetchModules,
  fetchProjectCalculs,
  fetchReferenceTable,
  runCalcul,
  saveCalcul,
  type CalculModule,
  type CalculOutcome,
  type ReferenceOption,
} from '../lib/calculs';
import { projectKeys } from './useProjects';
import type { ArchivedCalcul } from '../lib/projects';

export const calculKeys = {
  modules: ['calculs', 'modules'] as const,
  references: (table: string) => ['calculs', 'references', table] as const,
  history: (projectId: string) => ['calculs', 'history', projectId] as const,
};

/** Une demi-heure : le catalogue ne bouge qu'avec une version du serveur. */
const CATALOGUE_STALE_TIME = 30 * 60 * 1000;

export function useCalculModules(): UseQueryResult<CalculModule[], ApiError> {
  return useQuery<CalculModule[], ApiError>({
    queryKey: calculKeys.modules,
    queryFn: async ({ signal }) => {
      try {
        return await fetchModules(signal);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    staleTime: CATALOGUE_STALE_TIME,
    retry: false,
  });
}

/**
 * Options d'une liste déroulante.
 *
 * `table` peut être `null` quand le champ fournit ses options directement : la
 * requête est alors désactivée plutôt que d'appeler une URL vide.
 */
export function useReferenceTable(table: string | null): UseQueryResult<ReferenceOption[], ApiError> {
  return useQuery<ReferenceOption[], ApiError>({
    queryKey: calculKeys.references(table ?? ''),
    queryFn: async ({ signal }) => {
      try {
        return await fetchReferenceTable(table ?? '', signal);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    enabled: Boolean(table),
    staleTime: CATALOGUE_STALE_TIME,
    retry: false,
  });
}

export function useProjectCalculs(projectId: string): UseQueryResult<ArchivedCalcul[], ApiError> {
  return useQuery<ArchivedCalcul[], ApiError>({
    queryKey: calculKeys.history(projectId),
    queryFn: async ({ signal }) => {
      try {
        return await fetchProjectCalculs(projectId, signal);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    enabled: projectId !== '',
    retry: false,
  });
}

export interface RunCalculVariables {
  module: string;
  entrees: Record<string, unknown>;
}

/** Calcul d'essai : rien n'est enregistré côté serveur. */
export function useRunCalcul() {
  return useMutation<CalculOutcome, ApiError, RunCalculVariables>({
    mutationFn: async ({ module, entrees }) => {
      try {
        return await runCalcul(module, entrees);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
  });
}

export interface SaveCalculVariables extends RunCalculVariables {
  projectId: string;
}

/** Archivage : le serveur recalcule puis enregistre dans le projet. */
export function useSaveCalcul() {
  const queryClient = useQueryClient();

  return useMutation<ArchivedCalcul, ApiError, SaveCalculVariables>({
    mutationFn: async ({ projectId, module, entrees }) => {
      try {
        return await saveCalcul(projectId, module, entrees);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    onSuccess: (_calcul, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: calculKeys.history(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteCalcul(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (calculId) => {
      try {
        await deleteCalcul(projectId, calculId);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calculKeys.history(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
