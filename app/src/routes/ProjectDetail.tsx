/**
 * Fiche d'un projet : ses informations, ses modules de calcul, son historique.
 *
 * ## Le cas « introuvable »
 *
 * Le serveur répond `404` aussi bien pour un projet qui n'existe pas que pour
 * un projet appartenant à quelqu'un d'autre — c'est volontaire, un `403`
 * confirmerait son existence (contrat, § 1). Côté application, les deux
 * aboutissent donc au même écran, calme et sans jargon : rien ici ne doit
 * laisser deviner laquelle des deux situations s'est produite.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { CalculResults } from '../calculs/CalculResults';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { DeleteProjectDialog, ProjectFormDialog } from '../components/ProjectDialogs';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { StatusBadge } from '../components/StatusBadge';
import {
  AlertIcon,
  ArrowLeftIcon,
  CalculationsIcon,
  ChevronRightIcon,
  ClockIcon,
  PencilIcon,
  ProjectsIcon,
  TrashIcon,
} from '../components/icons';
import { useCalculModules, useDeleteCalcul, useProjectCalculs } from '../hooks/useCalculs';
import { useDeleteProject, useProject, useUpdateProject } from '../hooks/useProjects';
import { cn } from '../lib/cn';
import { readWarnings, type CalculModule } from '../lib/calculs';
import { formatDate, formatDateTime } from '../lib/format';
import {
  PROJECT_STATUS_LABELS,
  type ArchivedCalcul,
  type ProjectDetail as ProjectDetailData,
} from '../lib/projects';
import { statusTone } from './Projects';

export function ProjectDetail() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();

  const project = useProject(projectId);
  const modules = useCalculModules();
  const history = useProjectCalculs(projectId);
  const update = useUpdateProject(projectId);
  const remove = useDeleteProject();

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (project.isPending) {
    return (
      <Page>
        <Card flush>
          <LoadingRows rows={3} label="Ouverture du projet" />
        </Card>
      </Page>
    );
  }

  if (project.isError) {
    // Un projet inexistant ou appartenant à quelqu'un d'autre : même écran.
    if (project.error.status === 404) {
      return (
        <Page>
          <Card flush>
            <EmptyState
              icon={<AlertIcon />}
              title="Projet introuvable"
              description="Ce projet n’existe plus, ou il ne fait pas partie de vos projets. Revenez à votre liste pour retrouver vos travaux."
              className="py-16"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<ArrowLeftIcon />}
                  onClick={() => void navigate('/projets')}
                >
                  Revenir à mes projets
                </Button>
              }
            />
          </Card>
        </Page>
      );
    }

    return (
      <Page>
        <Card flush>
          <QueryError
            error={project.error}
            subject="ce projet"
            onRetry={() => void project.refetch()}
          />
        </Card>
      </Page>
    );
  }

  const data = project.data;
  // L'historique dédié fait autorité dès qu'il est chargé ; en attendant, les
  // calculs livrés avec la fiche évitent un blanc à l'ouverture.
  const calculs = history.data ?? data.calculs;

  return (
    <Page>
      <BackLink onClick={() => void navigate('/projets')} />

      <PageHeader
        title={data.nom}
        description={
          data.description ||
          'Retrouvez ici les informations du projet, ses calculs archivés et les modules de dimensionnement.'
        }
        action={
          <div className="flex items-center gap-2.5">
            <Button size="sm" icon={<PencilIcon />} onClick={() => setEditing(true)}>
              Modifier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<TrashIcon />}
              onClick={() => setConfirmingDelete(true)}
            >
              Supprimer
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title="Modules de calcul"
            description="Le serveur met ces modules à votre disposition. Le résultat peut être archivé dans ce projet."
            flush
          >
            <ModuleList
              modules={modules.data ?? []}
              loading={modules.isPending}
              onOpen={(code) => void navigate(`/projets/${projectId}/calculs/${code}`)}
              error={modules.isError ? modules.error.message : null}
            />
          </Card>

          <Card
            title="Calculs archivés"
            description="L’historique de ce projet, du plus récent au plus ancien."
            flush
          >
            {history.isPending && calculs.length === 0 ? (
              <LoadingRows rows={2} label="Chargement de l’historique" />
            ) : calculs.length === 0 ? (
              <EmptyState
                icon={<ClockIcon />}
                title="Aucun calcul archivé"
                description="Lancez un module ci-dessus, puis archivez son résultat : vous le retrouverez ici, avec ses entrées et ses avertissements."
                className="py-12"
              />
            ) : (
              <ul className="flex flex-col">
                {calculs.map((calcul, index) => (
                  <li key={calcul.id} className={cn(index > 0 && 'border-t border-ink-100')}>
                    <HistoryEntry
                      calcul={calcul}
                      projectId={projectId}
                      module={findModule(modules.data, calcul.module)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <InfoCard project={data} />
      </div>

      <ProjectFormDialog
        open={editing}
        project={data}
        onClose={() => {
          setEditing(false);
          update.reset();
        }}
        submitting={update.isPending}
        error={update.error ?? null}
        onSubmit={async (draft) => {
          try {
            await update.mutateAsync(draft);
            setEditing(false);
            update.reset();
          } catch {
            // L'échec est déjà affiché dans le dialogue via `update.error`.
            // On l'absorbe pour ne pas laisser filer une promesse rejetée ;
            // le dialogue reste ouvert avec la saisie de l'utilisateur.
          }
        }}
      />

      <DeleteProjectDialog
        open={confirmingDelete}
        project={data}
        onClose={() => {
          setConfirmingDelete(false);
          remove.reset();
        }}
        submitting={remove.isPending}
        error={remove.error ?? null}
        onConfirm={() => {
          remove.mutate(projectId, {
            onSuccess: () => {
              setConfirmingDelete(false);
              void navigate('/projets');
            },
          });
        }}
      />
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-8 py-7">{children}</div>;
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-500 transition-colors duration-150 hover:text-ink-900"
    >
      <span aria-hidden="true" className="text-[1.05rem]">
        <ArrowLeftIcon />
      </span>
      Mes projets
    </button>
  );
}

function findModule(modules: CalculModule[] | undefined, code: string): CalculModule | null {
  return modules?.find((module) => module.code === code) ?? null;
}

/* --- Informations ---------------------------------------------------------- */

function InfoCard({ project }: { project: ProjectDetailData }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Client', value: project.nomClient || '—' },
    { label: 'Localisation', value: project.localisation || '—' },
    { label: 'Créé le', value: formatDate(project.creeLe) },
    { label: 'Dernière modification', value: formatDate(project.modifieLe) },
  ];

  return (
    <Card className="h-fit">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[1.25rem] text-brand-600" aria-hidden="true">
            <ProjectsIcon />
          </span>
          <h2 className="text-md font-semibold text-ink-900">Informations</h2>
        </div>
        <StatusBadge tone={statusTone(project.statut)}>
          {PROJECT_STATUS_LABELS[project.statut]}
        </StatusBadge>
      </div>

      <dl className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-sm text-ink-500">{row.label}</dt>
            <dd className="min-w-0 truncate text-right text-sm font-medium text-ink-800">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* --- Modules --------------------------------------------------------------- */

function ModuleList({
  modules,
  loading,
  error,
  onOpen,
}: {
  modules: CalculModule[];
  loading: boolean;
  error: string | null;
  onOpen: (code: string) => void;
}) {
  if (loading) return <LoadingRows rows={2} label="Chargement des modules" />;

  if (error) {
    return (
      <EmptyState
        icon={<AlertIcon />}
        title="Modules indisponibles"
        description={error}
        className="py-10"
      />
    );
  }

  if (modules.length === 0) {
    return (
      <EmptyState
        icon={<CalculationsIcon />}
        title="Aucun module disponible"
        description="Le serveur n’expose aucun module de calcul pour le moment."
        className="py-10"
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {modules.map((module, index) => (
        <li key={module.code}>
          <button
            type="button"
            onClick={() => onOpen(module.code)}
            className={cn(
              'group flex w-full items-center gap-3 px-5 py-3.5 text-left',
              'transition-colors duration-150 ease-out-quart hover:bg-ink-50',
              index > 0 && 'border-t border-ink-100',
            )}
          >
            <span aria-hidden="true" className="text-[1.125rem] text-brand-600">
              <CalculationsIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-ink-900">
                {module.nom}
              </span>
              {module.famille && (
                <span className="mt-0.5 block truncate text-xs text-ink-500">
                  {module.famille}
                </span>
              )}
            </span>
            <span
              aria-hidden="true"
              className="text-[1.125rem] text-ink-300 transition-colors duration-150 group-hover:text-ink-500"
            >
              <ChevronRightIcon />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* --- Historique ------------------------------------------------------------ */

/**
 * Une entrée d'historique.
 *
 * Repliée par défaut : l'historique sert à retrouver, pas à tout relire. Une
 * fois dépliée, elle réutilise exactement le même affichage que le résultat
 * frais — mêmes avertissements, mêmes unités.
 */
function HistoryEntry({
  calcul,
  projectId,
  module,
}: {
  calcul: ArchivedCalcul;
  projectId: string;
  module: CalculModule | null;
}) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteCalcul(projectId);
  const warnings = useMemo(() => readWarnings(calcul.avertissements), [calcul.avertissements]);

  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            aria-hidden="true"
            className={cn(
              'text-ink-400 transition-transform duration-150',
              open && 'rotate-90',
            )}
          >
            <ChevronRightIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium text-ink-900">
              {module?.nom ?? calcul.module}
            </span>
            <span className="mt-0.5 block text-xs text-ink-500">
              {formatDateTime(calcul.calculeLe)}
            </span>
          </span>
        </button>

        {warnings.length > 0 && (
          <StatusBadge tone="warning">
            {warnings.length === 1 ? '1 avertissement' : `${warnings.length} avertissements`}
          </StatusBadge>
        )}

        <Button
          size="sm"
          variant="ghost"
          icon={<TrashIcon />}
          aria-label={`Retirer le calcul du ${formatDateTime(calcul.calculeLe)}`}
          loading={remove.isPending}
          loadingLabel="Retrait en cours"
          onClick={() => remove.mutate(calcul.id)}
        >
          Retirer
        </Button>
      </div>

      {open && (
        <div className="border-t border-ink-100 bg-surface-sunken px-5 py-5">
          <CalculResults
            module={module}
            resultats={calcul.resultats}
            avertissements={warnings}
            entrees={calcul.entrees}
            engineVersion={calcul.engineVersion}
            title="Résultats archivés"
          />
        </div>
      )}
    </div>
  );
}
