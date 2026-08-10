/**
 * Accès aux projets depuis les écrans.
 *
 * Les clés de cache sont regroupées ici : c'est ce qui garantit qu'après une
 * création ou une suppression, la liste ET la fiche du projet se rafraîchissent
 * ensemble. Un écran qui affiche encore un projet supprimé est un écran qui
 * ment.
 *
 * Rappel : le cache est intégralement vidé au changement de compte
 * (`AuthProvider`). Sur un poste partagé par un bureau d'études, rien de la
 * session précédente ne subsiste.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, normalizeError } from '../lib/api';
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  updateProject,
  type Project,
  type ProjectDetail,
  type ProjectDraft,
  type ProjectListResult,
  type ProjectQuery,
} from '../lib/projects';

export const projectKeys = {
  all: ['projects'] as const,
  list: (query: ProjectQuery) => ['projects', 'list', query] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
};

export function useProjectList(
  query: ProjectQuery,
  options: { enabled?: boolean } = {},
): UseQueryResult<ProjectListResult, ApiError> {
  return useQuery<ProjectListResult, ApiError>({
    queryKey: projectKeys.list(query),
    enabled: options.enabled ?? true,
    queryFn: async ({ signal }) => {
      try {
        return await fetchProjects(query, signal);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    // La liste reste affichée pendant la frappe dans le champ de recherche :
    // sans cela, l'écran clignoterait à chaque lettre.
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useProject(id: string): UseQueryResult<ProjectDetail, ApiError> {
  return useQuery<ProjectDetail, ApiError>({
    queryKey: projectKeys.detail(id),
    queryFn: async ({ signal }) => {
      try {
        return await fetchProject(id, signal);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    // Un projet introuvable (404) le reste : réessayer ne ferait qu'allonger
    // l'attente avant l'écran « Projet introuvable ».
    retry: false,
    enabled: id !== '',
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation<Project, ApiError, ProjectDraft>({
    mutationFn: async (draft) => {
      try {
        return await createProject(draft);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();

  return useMutation<Project, ApiError, ProjectDraft>({
    mutationFn: async (draft) => {
      try {
        return await updateProject(id, draft);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      try {
        await deleteProject(id);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
