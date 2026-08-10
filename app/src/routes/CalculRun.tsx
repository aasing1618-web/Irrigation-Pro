/**
 * Écran d'exécution d'un module de calcul.
 *
 * Le même écran sert dans les deux contextes :
 *   - depuis un projet (`/projets/:projectId/calculs/:moduleCode`) — le
 *     résultat peut être archivé dans ce projet ;
 *   - depuis le catalogue (`/calculs/:moduleCode`) — essai libre, archivable
 *     dans le projet de son choix.
 *
 * ## Ce qui n'est pas ici, et n'y sera jamais
 *
 * Aucune formule (décision D-007). L'écran assemble un corps de requête à
 * partir du descripteur du module, l'envoie, et affiche ce qui revient. Il ne
 * sait pas ce que le serveur calcule, et c'est exactement le but : le logiciel
 * installé chez le client ne contient pas le savoir-faire qu'il vend.
 *
 * ## Les trois réponses du serveur, et leur traitement
 *
 * | Réponse | Ce qu'on affiche |
 * |---|---|
 * | `200` | Les résultats, avec leurs unités, et les avertissements **en tête** |
 * | `400 VALIDATION_ERROR` | Le message général, et le détail sur le champ fautif |
 * | `422 CALCUL_IMPOSSIBLE` | Le message métier **tel quel** — il est rédigé pour un ingénieur agronome, le reformuler l'appauvrirait |
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { CalculResults } from '../calculs/CalculResults';
import { ModuleForm } from '../calculs/ModuleForm';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { SelectField } from '../components/Field';
import { FormAlert } from '../components/FormAlert';
import { PageHeader } from '../components/PageHeader';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { AlertIcon, ArchiveIcon, ArrowLeftIcon, CheckIcon } from '../components/icons';
import { useCalculModules, useRunCalcul, useSaveCalcul } from '../hooks/useCalculs';
import { useProject, useProjectList } from '../hooks/useProjects';
import type { ApiError } from '../lib/api';
import {
  initialInputs,
  toRequestBody,
  validateInputs,
  type CalculInputs,
  type CalculModule,
  type CalculOutcome,
} from '../lib/calculs';

/** Messages par champ envoyés par le serveur avec un `400 VALIDATION_ERROR`. */
function fieldErrorsFrom(error: ApiError | null | undefined): Record<string, string> {
  if (!error || error.code !== 'VALIDATION_ERROR' || !error.details) return {};
  const result: Record<string, string> = {};
  const details = error.details;

  if (Array.isArray(details)) {
    for (const entry of details) {
      const record = (entry ?? {}) as Record<string, unknown>;
      const champ = record.champ ?? record.field ?? record.path;
      const message = record.message ?? record.libelle;
      if (typeof champ === 'string' && typeof message === 'string') result[champ] = message;
    }
    return result;
  }

  if (typeof details === 'object') {
    for (const [champ, message] of Object.entries(details as Record<string, unknown>)) {
      if (typeof message === 'string') result[champ] = message;
    }
  }
  return result;
}

export function CalculRun() {
  const { moduleCode = '', projectId } = useParams();
  const navigate = useNavigate();

  const catalogue = useCalculModules();
  const module = useMemo(
    () => catalogue.data?.find((item) => item.code === moduleCode) ?? null,
    [catalogue.data, moduleCode],
  );

  if (catalogue.isPending) {
    return (
      <Page>
        <Card flush>
          <LoadingRows rows={3} label="Chargement du module de calcul" />
        </Card>
      </Page>
    );
  }

  if (catalogue.isError) {
    return (
      <Page>
        <Card flush>
          <QueryError
            error={catalogue.error}
            subject="ce module de calcul"
            onRetry={() => void catalogue.refetch()}
          />
        </Card>
      </Page>
    );
  }

  if (!module) {
    return (
      <Page>
        <Card flush>
          <EmptyState
            icon={<AlertIcon />}
            title="Module introuvable"
            description="Ce module de calcul n’est pas proposé par le serveur. Il a peut-être été retiré lors d’une mise à jour."
            className="py-16"
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<ArrowLeftIcon />}
                onClick={() => void navigate('/calculs')}
              >
                Voir les modules disponibles
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  // Remonter le module dans la clé remet l'écran à zéro quand on passe de l'un
  // à l'autre : jamais de valeur d'un module dans le formulaire d'un autre.
  return (
    <ModuleRunner
      key={`${projectId ?? 'libre'}-${module.code}`}
      module={module}
      projectId={projectId ?? null}
    />
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-8 py-7">{children}</div>;
}

function ModuleRunner({ module, projectId }: { module: CalculModule; projectId: string | null }) {
  const navigate = useNavigate();

  const [inputs, setInputs] = useState<CalculInputs>(() => initialInputs(module));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, unknown>>({});
  const [outcome, setOutcome] = useState<CalculOutcome | null>(null);

  const run = useRunCalcul();
  const project = useProject(projectId ?? '');

  const serverFieldErrors = fieldErrorsFrom(run.error);
  const errors = { ...serverFieldErrors, ...localErrors };

  const submit = () => {
    const found = validateInputs(module, inputs);
    setLocalErrors(found);
    if (Object.keys(found).length > 0) return;

    const body = toRequestBody(module, inputs);
    setSent(body);
    setOutcome(null);

    run.mutate(
      { module: module.code, entrees: body },
      { onSuccess: (result) => setOutcome(result) },
    );
  };

  const impossible = run.error?.status === 422;

  return (
    <Page>
      <button
        type="button"
        onClick={() => void navigate(projectId ? `/projets/${projectId}` : '/calculs')}
        className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-500 transition-colors duration-150 hover:text-ink-900"
      >
        <span aria-hidden="true" className="text-[1.05rem]">
          <ArrowLeftIcon />
        </span>
        {projectId ? project.data?.nom || 'Retour au projet' : 'Tous les modules'}
      </button>

      <PageHeader
        title={module.nom}
        description={
          module.description ||
          'Renseignez les paramètres du périmètre, le serveur réalise le calcul et vous renvoie ses résultats.'
        }
      />

      <div className="flex flex-col gap-5">
        <Card title="Paramètres">
          <ModuleForm
            module={module}
            values={inputs}
            onChange={(champ, value) => {
              setInputs((current) => ({ ...current, [champ]: value }));
              // L'erreur disparaît dès qu'on corrige : la laisser affichée
              // pendant la frappe donne l'impression que la correction ne
              // compte pas.
              setLocalErrors((current) => {
                if (!current[champ]) return current;
                const next = { ...current };
                delete next[champ];
                return next;
              });
            }}
            errors={errors}
            onSubmit={submit}
            submitting={run.isPending}
          />
        </Card>

        {run.isError && (
          <FormAlert
            tone={impossible ? 'warning' : 'danger'}
            icon={<AlertIcon />}
            title={impossible ? 'Calcul impossible' : 'Le calcul n’a pas pu être lancé'}
          >
            {/* Message du moteur, affiché tel quel : il est écrit pour un
                ingénieur agronome, pas pour un développeur. */}
            {run.error.message}
          </FormAlert>
        )}

        {outcome && (
          <CalculResults
            module={module}
            resultats={outcome.resultats}
            avertissements={outcome.avertissements}
            entrees={sent}
            engineVersion={outcome.engineVersion}
            actions={
              <ArchiveControl
                module={module}
                entrees={sent}
                projectId={projectId}
                projectName={project.data?.nom ?? null}
              />
            }
          />
        )}
      </div>
    </Page>
  );
}

/* --- Archivage ------------------------------------------------------------- */

/**
 * Bouton d'archivage.
 *
 * Dans un projet, il archive dans ce projet. Depuis le catalogue, il demande
 * d'abord dans lequel — sans quoi l'ingénieur qui a fait un essai concluant
 * devrait tout ressaisir ailleurs.
 *
 * L'archivage relance le calcul **côté serveur** (`POST
 * /api/projects/:id/calculs`) : ce qui est enregistré vient du moteur, jamais
 * de ce que l'écran affichait.
 */
function ArchiveControl({
  module,
  entrees,
  projectId,
  projectName,
}: {
  module: CalculModule;
  entrees: Record<string, unknown>;
  projectId: string | null;
  projectName: string | null;
}) {
  const navigate = useNavigate();
  const save = useSaveCalcul();
  const [target, setTarget] = useState(projectId ?? '');

  // Le choix du projet n'est proposé — donc chargé — que hors contexte projet.
  const list = useProjectList({}, { enabled: !projectId });
  const options = useMemo(
    () => (list.data?.projets ?? []).map((item) => ({ value: item.id, label: item.nom })),
    [list.data],
  );

  useEffect(() => {
    if (projectId) setTarget(projectId);
  }, [projectId]);

  if (save.isSuccess) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-success">
        <span aria-hidden="true" className="text-[1.05rem]">
          <CheckIcon />
        </span>
        <span role="status">
          Archivé{projectName ? ` dans « ${projectName} »` : ''}
        </span>
        {!projectId && target && (
          <Button size="sm" variant="ghost" onClick={() => void navigate(`/projets/${target}`)}>
            Ouvrir le projet
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end justify-end gap-2.5">
      {!projectId && (
        <div className="w-56">
          <SelectField
            label="Archiver dans"
            value={target}
            onValueChange={setTarget}
            options={options}
            placeholder={list.isPending ? 'Chargement…' : 'Choisir un projet…'}
            disabled={list.isPending || save.isPending}
          />
        </div>
      )}

      <Button
        variant="primary"
        size="sm"
        icon={<ArchiveIcon />}
        disabled={target === ''}
        loading={save.isPending}
        loadingLabel="Archivage en cours"
        onClick={() =>
          save.mutate({ projectId: target, module: module.code, entrees })
        }
      >
        Archiver dans le projet
      </Button>

      {save.isError && (
        <p role="alert" className="w-full text-right text-xs font-medium text-danger">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
