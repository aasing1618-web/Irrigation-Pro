/**
 * Les deux fenêtres des rapports : la préparation d'un document, et la
 * confirmation avant d'en supprimer un.
 *
 * Elles vivent ensemble parce qu'elles s'ouvrent depuis le même panneau et
 * partagent la même façon d'afficher les refus du serveur : son message, tel
 * quel, sans reformulation.
 */

import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/Button';
import { CheckboxField, TextAreaField } from '../components/Field';
import { Dialog } from '../components/Dialog';
import { FormAlert } from '../components/FormAlert';
import { AlertIcon, ReportsIcon } from '../components/icons';
import type { ApiError } from '../lib/api';
import type { CalculModule } from '../lib/calculs';
import { formatDateTime } from '../lib/format';
import type { ArchivedCalcul } from '../lib/projects';
import {
  MAX_CALCULS_PAR_RAPPORT,
  derniersCalculsParModule,
  type ProjectReport,
  type ReportRequest,
} from '../lib/reports';

/* --- Préparation ----------------------------------------------------------- */

export interface GenerateReportDialogProps {
  open: boolean;
  /** Historique du projet, du plus récent au plus ancien. */
  calculs: ArchivedCalcul[];
  /** Catalogue du serveur : il fournit le nom lisible de chaque module. */
  modules: CalculModule[];
  onClose: () => void;
  onSubmit: (demande: ReportRequest) => Promise<unknown>;
  submitting: boolean;
  error: ApiError | null;
}

/**
 * Fenêtre de préparation d'un rapport.
 *
 * Deux décisions à y prendre, et deux seulement : **ce que le document
 * reprend** et **ce qu'on veut y ajouter en commentaire**. Tout le reste — mise
 * en page, référence, date, avertissements du moteur — appartient au serveur.
 *
 * La sélection s'ouvre sur le dernier calcul de chaque module : c'est ce que le
 * serveur retiendrait de lui-même, et c'est presque toujours ce qu'on veut. Le
 * choix reste modifiable, parce qu'un ingénieur qui a essayé trois hypothèses
 * ne remet pas les trois à son client.
 *
 * ## Le double clic
 *
 * Générer prend un instant. Sans verrou, deux clics rapprochés produisent deux
 * documents identiques sous deux références différentes — et la seconde reste
 * pour toujours dans la liste, à côté de la première, sans qu'on sache laquelle
 * a été remise au client. Le `useRef` ferme la porte dès le premier clic, avant
 * même que React n'ait redessiné le bouton.
 */
export function GenerateReportDialog({
  open,
  calculs,
  modules,
  onClose,
  onSubmit,
  submitting,
  error,
}: GenerateReportDialogProps) {
  const [selection, setSelection] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const envoiEnCours = useRef(false);

  /**
   * L'historique le plus récent, lu sans être observé.
   *
   * Il change d'identité à chaque rafraîchissement de la liste des calculs — y
   * compris pendant que la fenêtre est ouverte. S'il figurait dans les
   * dépendances de l'effet ci-dessous, une simple revalidation en arrière-plan
   * effacerait les notes en cours de frappe et rétablirait la sélection par
   * défaut sous les doigts de l'utilisateur.
   */
  const derniersCalculs = useRef(calculs);
  derniersCalculs.current = calculs;

  // Chaque ouverture — et elle seule — repart de la sélection par défaut : sans
  // cela, une préparation abandonnée laisserait ses cases cochées dans la
  // suivante.
  useEffect(() => {
    if (!open) return;
    setSelection(derniersCalculsParModule(derniersCalculs.current));
    setNotes('');
    envoiEnCours.current = false;
  }, [open]);

  const trop = selection.length > MAX_CALCULS_PAR_RAPPORT;
  const vide = selection.length === 0;
  const peutGenerer = !vide && !trop;

  const basculer = (id: string, coche: boolean) => {
    setSelection((actuelle) =>
      coche ? [...actuelle, id] : actuelle.filter((autre) => autre !== id),
    );
  };

  const submit = () => {
    if (envoiEnCours.current || submitting || !peutGenerer) return;
    envoiEnCours.current = true;
    void Promise.resolve(onSubmit({ calculIds: selection, notes })).finally(() => {
      envoiEnCours.current = false;
    });
  };

  return (
    <Dialog
      open={open}
      title="Générer un rapport"
      description="Le document reprendra les informations du projet, les hypothèses retenues et les résultats des calculs choisis. Il est mis en page par le serveur."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="primary"
            icon={<ReportsIcon />}
            onClick={submit}
            disabled={!peutGenerer}
            loading={submitting}
            loadingLabel="Génération du rapport en cours"
          >
            Générer le rapport
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <FormAlert tone="danger" icon={<AlertIcon />}>
            {error.message}
          </FormAlert>
        )}

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="text-sm font-medium text-ink-700">Calculs à inclure</legend>
          <p className="mt-1 text-xs text-ink-500">
            Par défaut, le dernier calcul de chaque module de ce projet.
          </p>

          <div className="mt-3 flex max-h-64 flex-col gap-3 overflow-y-auto rounded-md border border-ink-100 bg-surface-sunken px-4 py-3.5">
            {calculs.map((calcul) => (
              <CheckboxField
                key={calcul.id}
                label={nomDuModule(modules, calcul.module)}
                hint={`Calculé le ${formatDateTime(calcul.calculeLe)}`}
                checked={selection.includes(calcul.id)}
                onCheckedChange={(coche) => basculer(calcul.id, coche)}
                disabled={submitting}
              />
            ))}
          </div>

          {vide && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              Sélectionnez au moins un calcul : un rapport sans résultat n’est pas un document
              défendable devant un client.
            </p>
          )}

          {trop && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              Un rapport ne peut pas reprendre plus de {MAX_CALCULS_PAR_RAPPORT} calculs.
              Retirez-en {selection.length - MAX_CALCULS_PAR_RAPPORT}.
            </p>
          )}
        </fieldset>

        <TextAreaField
          label="Notes"
          optional
          value={notes}
          onValueChange={setNotes}
          hint="Elles figureront dans le document remis à votre client."
          maxLength={4000}
          rows={3}
          disabled={submitting}
        />
      </div>
    </Dialog>
  );
}

/** Le nom lisible du module ; son code technique en dernier recours seulement. */
function nomDuModule(modules: CalculModule[], code: string): string {
  return modules.find((module) => module.code === code)?.nom ?? code;
}

/* --- Suppression ----------------------------------------------------------- */

export interface DeleteReportDialogProps {
  open: boolean;
  report: ProjectReport | null;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  error: ApiError | null;
}

/**
 * Confirmation de suppression d'un rapport.
 *
 * On rappelle la référence : c'est elle qui est imprimée sur le document, et
 * c'est le seul repère fiable quand un client a plusieurs rapports du même
 * projet sous les yeux. On dit aussi ce que la suppression **ne fait pas** —
 * un PDF déjà envoyé reste chez son destinataire.
 */
export function DeleteReportDialog({
  open,
  report,
  onClose,
  onConfirm,
  submitting,
  error,
}: DeleteReportDialogProps) {
  return (
    <Dialog
      open={open}
      width="sm"
      title="Supprimer ce rapport ?"
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
          Le rapport{' '}
          <span className="font-medium text-ink-900" data-numeric>
            {report?.reference}
          </span>{' '}
          disparaîtra de ce projet, avec son fichier. Le document que vous avez déjà remis à
          votre client reste valable.
        </p>
        <p className="text-sm text-ink-500">
          Vous pourrez en générer un nouveau à tout moment ; il portera une autre référence.
        </p>
      </div>
    </Dialog>
  );
}
