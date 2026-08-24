/**
 * Liste des projets — le premier écran de travail du logiciel.
 *
 * ## Deux états vides, pas un seul
 *
 * « Aucun projet » et « aucun résultat pour cette recherche » ne sont pas la
 * même situation et ne se règlent pas de la même façon. Le premier est l'écran
 * qu'un client découvre le jour où il achète le logiciel : il doit donner envie
 * de commencer, pas constater un vide. Le second doit expliquer comment revenir
 * en arrière.
 *
 * ## Ce que fait le serveur, et ce que fait cet écran
 *
 * La recherche et le filtre par statut sont **envoyés au serveur** : c'est lui
 * qui détient la liste et qui la filtre sur le propriétaire connecté. Le tri
 * par date est fait ici, sur les projets déjà reçus : c'est de la présentation,
 * pas de la sélection de données.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { SelectField, TextField } from '../components/Field';
import { ProjectFormDialog } from '../components/ProjectDialogs';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import {
  CalculationsIcon,
  ChevronRightIcon,
  MapPinIcon,
  PlusIcon,
  ProjectsIcon,
  SearchIcon,
} from '../components/icons';
import { useCreateProject, useProjectList } from '../hooks/useProjects';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { cn } from '../lib/cn';
import { formatRelativeDate } from '../lib/format';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from '../lib/projects';
import { WaterRippleImage } from '../components/ui/water-ripple-image';
import { ShaderBackground } from '../components/ui/oceanic-currents';

type StatusFilter = ProjectStatus | 'TOUS';
type SortOrder = 'MODIFIE' | 'CREE' | 'NOM';

const STATUS_FILTER_OPTIONS = [
  { value: 'TOUS', label: 'Tous les statuts' },
  ...PROJECT_STATUSES.map((statut) => ({
    value: statut,
    label: PROJECT_STATUS_LABELS[statut],
  })),
];

const SORT_OPTIONS = [
  { value: 'MODIFIE', label: 'Modifiés récemment' },
  { value: 'CREE', label: 'Créés récemment' },
  { value: 'NOM', label: 'Nom (A → Z)' },
];

/** Le statut décide de la pastille ; le libellé écrit reste toujours présent. */
export function statusTone(statut: ProjectStatus): StatusTone {
  if (statut === 'TERMINE') return 'success';
  if (statut === 'EN_COURS') return 'pending';
  return 'neutral';
}

function sortProjects(projects: Project[], order: SortOrder): Project[] {
  const sorted = [...projects];
  if (order === 'NOM') {
    return sorted.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }
  const key = order === 'CREE' ? 'creeLe' : 'modifieLe';
  return sorted.sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0));
}

export function Projects() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState<StatusFilter>('TOUS');
  const [order, setOrder] = useState<SortOrder>('MODIFIE');
  const [creating, setCreating] = useState(false);

  const debouncedSearch = useDebouncedValue(search);
  const query = useProjectList({ recherche: debouncedSearch, statut });
  const create = useCreateProject();

  const projects = useMemo(
    () => sortProjects(query.data?.projets ?? [], order),
    [query.data, order],
  );

  const filtering = debouncedSearch.trim() !== '' || statut !== 'TOUS';

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      {/* En-tête illustré WebGL Projets */}
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-ink-200/80 bg-brand-950 p-6 shadow-raised min-h-[10rem]">
        <div className="pointer-events-none absolute inset-0 opacity-45">
          <WaterRippleImage
            src="/photos/rizicoles-irrigation.jpg"
            blueish={0.55}
            scale={6.5}
            illumination={0.16}
            surfaceDistortion={0.06}
            waterDistortion={0.03}
            className="size-full"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 opacity-25 mix-blend-screen">
          <ShaderBackground className="size-full" />
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/90 to-transparent" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/20 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-brand-300 backdrop-blur-md border border-brand-400/20">
              Gestion de Chantiers
            </span>
            <h1 className="mt-2 text-2xl font-bold text-white">Vos Projets d'Irrigation</h1>
            <p className="mt-1 max-w-[64ch] text-sm text-brand-200/90">
              Regroupez les périmètres irrigués, conservez vos jeux de données terrain et générez les dossiers complets pour vos clients.
            </p>
          </div>
          <Button variant="primary" size="md" icon={<PlusIcon />} onClick={() => setCreating(true)}>
            Nouveau projet
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <TextField
          label="Rechercher"
          type="search"
          value={search}
          onValueChange={setSearch}
          placeholder="Nom du projet ou du client"
          hint="La recherche porte sur le nom du projet et celui du client."
          autoComplete="off"
        />
        <SelectField
          label="Statut"
          value={statut}
          onValueChange={(value) => setStatut(value as StatusFilter)}
          options={STATUS_FILTER_OPTIONS}
        />
        <SelectField
          label="Trier par"
          value={order}
          onValueChange={(value) => setOrder(value as SortOrder)}
          options={SORT_OPTIONS}
        />
      </div>

      <Card flush>
        {query.isPending ? (
          <LoadingRows rows={4} label="Chargement de vos projets" />
        ) : query.isError ? (
          <QueryError
            error={query.error}
            subject="vos projets"
            onRetry={() => void query.refetch()}
          />
        ) : projects.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={<SearchIcon />}
              title="Aucun projet ne correspond"
              description="Essayez un autre mot, ou revenez à la liste complète."
              className="py-14"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatut('TOUS');
                  }}
                >
                  Afficher tous les projets
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ProjectsIcon />}
              title="Créez votre premier projet"
              description="Un projet regroupe un périmètre irrigué : ses données de terrain, ses calculs de dimensionnement et les rapports que vous remettrez à votre client. Vous seul y avez accès."
              className="py-16"
              action={
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
                  Créer un projet
                </Button>
              }
            />
          )
        ) : (
          <>
            <ul className="flex flex-col">
              {projects.map((project, index) => (
                <li key={project.id}>
                  <ProjectRow
                    project={project}
                    first={index === 0}
                    onOpen={() => void navigate(`/projets/${project.id}`)}
                  />
                </li>
              ))}
            </ul>
            <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-400">
              {projects.length === 1
                ? '1 projet affiché'
                : `${projects.length} projets affichés`}
              {query.data && query.data.total > projects.length
                ? ` sur ${query.data.total}`
                : ''}
            </p>
          </>
        )}
      </Card>

      <ProjectFormDialog
        open={creating}
        onClose={() => {
          setCreating(false);
          create.reset();
        }}
        submitting={create.isPending}
        error={create.error ?? null}
        onSubmit={async (draft) => {
          try {
            const project = await create.mutateAsync(draft);
            setCreating(false);
            create.reset();
            // On entre directement dans le projet créé : c'est là que la personne
            // voulait aller en cliquant sur « Nouveau projet ».
            if (project.id) void navigate(`/projets/${project.id}`);
          } catch {
            // L'échec est déjà affiché dans le dialogue via `create.error` :
            // on l'absorbe ici pour ne pas laisser filer une promesse rejetée,
            // qui remonterait en erreur non traitée dans la console du client.
            // Le dialogue reste ouvert, la saisie est conservée.
          }
        }}
      />
    </div>
  );
}

/**
 * Une ligne de projet.
 *
 * C'est un bouton, pas une ligne de tableau : elle s'atteint à la tabulation,
 * s'active à l'Entrée, et se lit d'un coup d'œil — nom, client, lieu, statut.
 */
function ProjectRow({
  project,
  first,
  onOpen,
}: {
  project: Project;
  first: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full items-center gap-4 px-5 py-4 text-left',
        'transition-colors duration-150 ease-out-quart hover:bg-ink-50',
        !first && 'border-t border-ink-100',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-md font-medium text-ink-900">{project.nom}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
          {project.nomClient && <span className="truncate">{project.nomClient}</span>}
          {project.localisation && (
            <span className="inline-flex items-center gap-1 truncate">
              <span aria-hidden="true" className="text-ink-400">
                <MapPinIcon />
              </span>
              {project.localisation}
            </span>
          )}
          {project.nombreCalculs > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="text-ink-400">
                <CalculationsIcon />
              </span>
              {project.nombreCalculs === 1 ? '1 calcul' : `${project.nombreCalculs} calculs`}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className="hidden text-sm text-ink-400 sm:inline">
          Modifié {formatRelativeDate(project.modifieLe)}
        </span>
        <StatusBadge tone={statusTone(project.statut)}>
          {PROJECT_STATUS_LABELS[project.statut]}
        </StatusBadge>
        <span
          aria-hidden="true"
          className="text-[1.125rem] text-ink-300 transition-colors duration-150 group-hover:text-ink-500"
        >
          <ChevronRightIcon />
        </span>
      </div>
    </button>
  );
}
