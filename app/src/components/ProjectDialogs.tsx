/**
 * Les deux fenêtres qui accompagnent un projet : le formulaire (création ou
 * modification) et la confirmation de suppression.
 *
 * Elles sont dans le même fichier parce qu'elles ne servent qu'ensemble, sur
 * les mêmes écrans, et qu'elles partagent la même lecture des erreurs du
 * serveur.
 */

import { useEffect, useState } from 'react';

import { ApiError } from '../lib/api';
import {
  EMPTY_PROJECT_DRAFT,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  asProjectStatus,
  type Project,
  type ProjectDraft,
} from '../lib/projects';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { FormAlert } from './FormAlert';
import { SelectField, TextAreaField, TextField } from './Field';
import { AlertIcon } from './icons';

/**
 * Extrait, si le serveur en fournit, un message par champ.
 *
 * Le contrat annonce `details` sans en figer la forme (§ 4 : « `details` liste
 * les champs »). On accepte donc l'objet `{ champ: message }` et le tableau
 * `[{ champ, message }]`, et on ignore silencieusement tout le reste : le
 * message général, lui, est toujours affiché.
 */
function fieldErrorsFrom(error: ApiError | null): Record<string, string> {
  if (!error || error.code !== 'VALIDATION_ERROR') return {};
  const details = error.details;
  const result: Record<string, string> = {};

  if (Array.isArray(details)) {
    for (const entry of details) {
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const champ = record.champ ?? record.field ?? record.path;
        const message = record.message ?? record.libelle;
        if (typeof champ === 'string' && typeof message === 'string') {
          result[champ] = message;
        }
      }
    }
    return result;
  }

  if (details && typeof details === 'object') {
    for (const [champ, message] of Object.entries(details as Record<string, unknown>)) {
      if (typeof message === 'string') result[champ] = message;
    }
  }

  return result;
}

/** Le projet tel que le formulaire le manipule. */
function toDraft(project?: Project | null): ProjectDraft {
  if (!project) return EMPTY_PROJECT_DRAFT;
  return {
    nom: project.nom,
    nomClient: project.nomClient,
    localisation: project.localisation,
    description: project.description,
    statut: asProjectStatus(project.statut),
  };
}

const STATUS_OPTIONS = PROJECT_STATUSES.map((statut) => ({
  value: statut,
  label: PROJECT_STATUS_LABELS[statut],
}));

export interface ProjectFormDialogProps {
  open: boolean;
  /** Projet à modifier ; absent pour une création. */
  project?: Project | null;
  onClose: () => void;
  onSubmit: (draft: ProjectDraft) => Promise<unknown>;
  submitting: boolean;
  error: ApiError | null;
}

export function ProjectFormDialog({
  open,
  project,
  onClose,
  onSubmit,
  submitting,
  error,
}: ProjectFormDialogProps) {
  const editing = Boolean(project);
  const [draft, setDraft] = useState<ProjectDraft>(() => toDraft(project));
  const [touchedName, setTouchedName] = useState(false);

  // Repartir d'un formulaire propre à chaque ouverture : sans cela, une
  // création annulée laisse ses valeurs dans la suivante.
  useEffect(() => {
    if (open) {
      setDraft(toDraft(project));
      setTouchedName(false);
    }
  }, [open, project]);

  const serverFieldErrors = fieldErrorsFrom(error);
  const nameEmpty = draft.nom.trim() === '';
  const nameError = touchedName && nameEmpty ? 'Donnez un nom à ce projet.' : serverFieldErrors.nom;

  const update = <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = () => {
    setTouchedName(true);
    if (nameEmpty) return;
    void onSubmit(draft);
  };

  return (
    <Dialog
      open={open}
      title={editing ? 'Modifier le projet' : 'Nouveau projet'}
      description={
        editing
          ? 'Ces informations apparaîtront en tête des rapports que vous générerez.'
          : 'Seul le nom est obligatoire. Vous pourrez compléter le reste à tout moment.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={submitting}
            loadingLabel="Enregistrement en cours"
          >
            {editing ? 'Enregistrer' : 'Créer le projet'}
          </Button>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-5"
      >
        {error && (
          <FormAlert tone="danger" icon={<AlertIcon />}>
            {error.message}
          </FormAlert>
        )}

        <TextField
          label="Nom du projet"
          value={draft.nom}
          onValueChange={(value) => update('nom', value)}
          onBlur={() => setTouchedName(true)}
          error={nameError}
          maxLength={200}
          autoComplete="off"
          disabled={submitting}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Nom du client"
            optional
            value={draft.nomClient}
            onValueChange={(value) => update('nomClient', value)}
            error={serverFieldErrors.nomClient}
            maxLength={500}
            autoComplete="off"
            disabled={submitting}
          />
          <TextField
            label="Localisation"
            optional
            value={draft.localisation}
            onValueChange={(value) => update('localisation', value)}
            error={serverFieldErrors.localisation}
            hint="Commune, périmètre, coordonnées…"
            maxLength={500}
            autoComplete="off"
            disabled={submitting}
          />
        </div>

        <TextAreaField
          label="Description"
          optional
          value={draft.description}
          onValueChange={(value) => update('description', value)}
          error={serverFieldErrors.description}
          maxLength={500}
          rows={3}
          disabled={submitting}
        />

        <SelectField
          label="Statut"
          value={draft.statut}
          onValueChange={(value) => update('statut', asProjectStatus(value))}
          options={STATUS_OPTIONS}
          hint="Sert à retrouver vos projets en cours parmi les autres."
          disabled={submitting}
        />

        {/* Permet la validation à la touche Entrée sans dupliquer le bouton. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

/* --- Suppression ----------------------------------------------------------- */

export interface DeleteProjectDialogProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  error: ApiError | null;
}

/**
 * Confirmation de suppression.
 *
 * Le serveur fait une suppression **logique** : la ligne reste en base pour que
 * les rapports déjà remis à un client final restent traçables. On le dit en une
 * phrase simple — « le projet sera retiré de votre liste » — sans employer le
 * mot « logique », qui n'a aucun sens pour un agronome et laisserait croire à
 * une manipulation incomplète.
 */
export function DeleteProjectDialog({
  open,
  project,
  onClose,
  onConfirm,
  submitting,
  error,
}: DeleteProjectDialogProps) {
  return (
    <Dialog
      open={open}
      width="sm"
      title="Supprimer ce projet ?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={submitting}
            loadingLabel="Suppression en cours"
            className="bg-danger border-danger hover:bg-danger active:bg-danger"
          >
            Supprimer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <FormAlert tone="danger" icon={<AlertIcon />}>
            {error.message}
          </FormAlert>
        )}

        <p className="text-base leading-relaxed text-ink-700">
          <span className="font-medium text-ink-900">{project?.nom}</span> sera retiré de votre
          liste, avec ses calculs. Les rapports que vous avez déjà remis à votre client restent
          valables.
        </p>
        <p className="text-sm text-ink-500">Cette action ne peut pas être annulée depuis le logiciel.</p>
      </div>
    </Dialog>
  );
}
