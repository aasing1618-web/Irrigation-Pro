/**
 * Le panneau « Rapports » de la fiche projet.
 *
 * C'est le seul endroit du logiciel d'où part la production d'un document. Tout
 * ce qui fait la qualité du PDF — mise en page, page de garde, tableaux,
 * avertissements du moteur, pied de page — est composé par le serveur (contrat
 * `docs/API-VAGUE-3.md`, § 1). L'application demande, liste, rapatrie et
 * supprime : rien d'autre ne descend sur le poste du client.
 *
 * ## Deux refus anticipés plutôt que subis
 *
 * 1. **Projet sans calcul archivé.** Le serveur répond `400` : il n'imprime pas
 *    une référence sur un document vide. On le sait avant de cliquer, donc le
 *    bouton est neutralisé et la raison est écrite à côté — plutôt que de
 *    laisser l'ingénieur remplir une fenêtre pour se faire refouler ensuite.
 * 2. **Fichier absent du serveur** (`fichierDisponible: false`). Le
 *    téléchargement est grisé et expliqué, au lieu d'échouer une fois lancé.
 *
 * Dans les deux cas, aucune requête ne part : un refus prévisible ne se
 * transforme pas en aller-retour réseau.
 */

import { useId, useState } from 'react';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FormAlert } from '../components/FormAlert';
import { LoadingRows, QueryError } from '../components/QueryStates';
import {
  AlertIcon,
  DownloadIcon,
  InfoIcon,
  ReportsIcon,
  TrashIcon,
} from '../components/icons';
import {
  useDeleteReport,
  useDownloadReport,
  useGenerateReport,
  useProjectReports,
} from '../hooks/useReports';
import type { CalculModule } from '../lib/calculs';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';
import type { ArchivedCalcul } from '../lib/projects';
import type { ProjectReport } from '../lib/reports';
import { DeleteReportDialog, GenerateReportDialog } from './ReportDialogs';

export interface ReportsPanelProps {
  projectId: string;
  /** Nom du projet : il compose le nom du fichier enregistré sur le poste. */
  nomProjet: string;
  /** Historique du projet, du plus récent au plus ancien. */
  calculs: ArchivedCalcul[];
  /** Catalogue du serveur : il donne le nom lisible de chaque module. */
  modules: CalculModule[];
}

const RAISON_SANS_CALCUL =
  'Archivez d’abord un calcul dans ce projet : un rapport sans résultat n’est pas un document défendable devant un client.';

export function ReportsPanel({ projectId, nomProjet, calculs, modules }: ReportsPanelProps) {
  const reports = useProjectReports(projectId);
  const generate = useGenerateReport(projectId);
  const download = useDownloadReport();
  const remove = useDeleteReport(projectId);

  const [preparing, setPreparing] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<ProjectReport | null>(null);

  const raisonId = useId();
  const sansCalcul = calculs.length === 0;

  const fermerPreparation = () => {
    setPreparing(false);
    generate.reset();
  };

  const fermerSuppression = () => {
    setPendingDeletion(null);
    remove.reset();
  };

  return (
    <>
      <Card
        title="Rapports"
        description="Les documents que vous remettez à votre client. Le serveur les met en page et leur attribue une référence."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<ReportsIcon />}
            disabled={sansCalcul}
            // Un bouton neutralisé ne se survole pas : la raison est écrite
            // dans le panneau, et rattachée ici pour les lecteurs d'écran.
            aria-describedby={sansCalcul ? raisonId : undefined}
            onClick={() => setPreparing(true)}
          >
            Générer un rapport
          </Button>
        }
        flush
      >
        {(sansCalcul || download.isError) && (
          <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4">
            {sansCalcul && (
              <p id={raisonId} className="flex gap-2.5 text-sm leading-relaxed text-ink-500">
                <span aria-hidden="true" className="mt-px shrink-0 text-[1.125rem] text-ink-400">
                  <InfoIcon />
                </span>
                <span>{RAISON_SANS_CALCUL}</span>
              </p>
            )}

            {download.isError && (
              <FormAlert tone="danger" icon={<AlertIcon />}>
                {download.error.message}
              </FormAlert>
            )}
          </div>
        )}

        {reports.isPending ? (
          <LoadingRows rows={2} label="Chargement des rapports" />
        ) : reports.isError ? (
          <QueryError
            error={reports.error}
            subject="les rapports de ce projet"
            onRetry={() => void reports.refetch()}
          />
        ) : reports.data.length === 0 ? (
          <EmptyState
            icon={<ReportsIcon />}
            title="Aucun rapport pour ce projet"
            description="Un rapport reprend les informations du projet, les hypothèses retenues et les résultats de vos calculs, sous une référence unique."
            className="py-12"
          />
        ) : (
          <ul className="flex flex-col">
            {reports.data.map((report, index) => (
              <li key={report.id} className={cn(index > 0 && 'border-t border-ink-100')}>
                <ReportRow
                  report={report}
                  downloading={download.isPending && download.variables?.report.id === report.id}
                  onDownload={() => download.mutate({ report, nomProjet })}
                  onDelete={() => {
                    remove.reset();
                    setPendingDeletion(report);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <GenerateReportDialog
        open={preparing}
        calculs={calculs}
        modules={modules}
        onClose={fermerPreparation}
        submitting={generate.isPending}
        error={generate.error ?? null}
        onSubmit={async (demande) => {
          try {
            await generate.mutateAsync(demande);
            fermerPreparation();
          } catch {
            // Le refus du serveur est déjà affiché dans la fenêtre, mot pour
            // mot, via `generate.error`. On l'absorbe ici pour ne pas laisser
            // filer une promesse rejetée ; la saisie de l'utilisateur reste à
            // l'écran, il peut corriger sa sélection et réessayer.
          }
        }}
      />

      <DeleteReportDialog
        open={pendingDeletion !== null}
        report={pendingDeletion}
        onClose={fermerSuppression}
        submitting={remove.isPending}
        error={remove.error ?? null}
        onConfirm={() => {
          if (!pendingDeletion) return;
          remove.mutate(pendingDeletion.id, { onSuccess: fermerSuppression });
        }}
      />
    </>
  );
}

/* --- Une ligne de la liste -------------------------------------------------- */

/**
 * Un rapport produit.
 *
 * La **référence** ouvre la ligne, en chiffres tabulaires : c'est elle qui est
 * imprimée sur le document remis au client final, et le seul repère commun
 * quand celui-ci rappelle six mois plus tard.
 */
function ReportRow({
  report,
  downloading,
  onDownload,
  onDelete,
}: {
  report: ProjectReport;
  downloading: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const explicationId = useId();
  const indisponible = !report.fichierDisponible;

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="shrink-0 text-[1.125rem] text-brand-600">
          <ReportsIcon />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-ink-900" data-numeric>
            {report.reference}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-500">
            {formatDateTime(report.genereLe)} · {libelleCalculs(report.nombreCalculs)}
          </span>
        </span>

        <Button
          size="sm"
          icon={<DownloadIcon />}
          onClick={onDownload}
          disabled={indisponible}
          aria-describedby={indisponible ? explicationId : undefined}
          loading={downloading}
          loadingLabel="Téléchargement en cours"
        >
          Télécharger
        </Button>

        <Button
          size="sm"
          variant="ghost"
          icon={<TrashIcon />}
          aria-label={`Supprimer le rapport ${report.reference}`}
          onClick={onDelete}
        >
          Supprimer
        </Button>
      </div>

      {indisponible && (
        <p id={explicationId} className="mt-2 pl-8 text-xs leading-relaxed text-ink-500">
          Le fichier n’est plus disponible sur le serveur. Générez un nouveau rapport pour
          obtenir un document téléchargeable.
        </p>
      )}
    </div>
  );
}

function libelleCalculs(nombre: number): string {
  return nombre === 1 ? '1 calcul' : `${nombre} calculs`;
}
