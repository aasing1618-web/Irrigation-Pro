/**
 * Accès aux rapports depuis les écrans.
 *
 * Trois actions, trois mutations distinctes — et c'est volontaire : produire un
 * document, le rapatrier et le supprimer n'échouent pas pour les mêmes raisons
 * et ne s'affichent pas au même endroit. Les fondre en une seule mutation
 * ferait apparaître l'erreur d'un téléchargement dans la fenêtre de génération.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, normalizeError } from '../lib/api';
import { saveFile } from '../lib/download';
import {
  deleteReport,
  fetchProjectReports,
  fetchReportFile,
  generateReport,
  reportFileName,
  type GeneratedReport,
  type ProjectReport,
  type ReportRequest,
} from '../lib/reports';

export const reportKeys = {
  all: ['reports'] as const,
  list: (projectId: string) => ['reports', 'list', projectId] as const,
};

export function useProjectReports(projectId: string): UseQueryResult<ProjectReport[], ApiError> {
  return useQuery<ProjectReport[], ApiError>({
    queryKey: reportKeys.list(projectId),
    queryFn: async ({ signal }) => {
      try {
        return await fetchProjectReports(projectId, signal);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    enabled: projectId !== '',
    retry: false,
  });
}

/**
 * Génération d'un rapport.
 *
 * React Query garantit déjà qu'une mutation en cours expose `isPending` ; les
 * écrans s'en servent pour neutraliser le bouton. Ce n'est pas suffisant contre
 * un double clic très rapide — la fenêtre de préparation ajoute son propre
 * verrou (voir `GenerateReportDialog`), parce que deux clics produiraient deux
 * documents identiques sous deux références différentes, dont une resterait
 * pour toujours dans la liste du client.
 */
export function useGenerateReport(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<GeneratedReport, ApiError, ReportRequest>({
    mutationFn: async (demande) => {
      try {
        return await generateReport(projectId, demande);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.list(projectId) });
    },
  });
}

export interface DownloadReportVariables {
  report: ProjectReport;
  /** Nom du projet : il compose le nom du fichier enregistré. */
  nomProjet: string;
}

/**
 * Téléchargement du PDF.
 *
 * La requête part avec le jeton d'accès (`apiFileRequest`), le fichier arrive
 * en mémoire, puis l'enregistrement est proposé à l'utilisateur. L'URL objet
 * créée au passage est libérée par `saveFile` : sans cela, chaque
 * téléchargement laisserait son document en mémoire jusqu'à la fermeture du
 * logiciel.
 */
export function useDownloadReport() {
  return useMutation<void, ApiError, DownloadReportVariables>({
    mutationFn: async ({ report, nomProjet }) => {
      try {
        const fichier = await fetchReportFile(report.id);
        saveFile(fichier, reportFileName(report.reference, nomProjet));
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
  });
}

export function useDeleteReport(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (reportId) => {
      try {
        await deleteReport(reportId);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.list(projectId) });
    },
  });
}
