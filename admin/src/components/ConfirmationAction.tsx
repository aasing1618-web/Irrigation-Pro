/**
 * Confirmation d'une action lourde sur un compte.
 *
 * Trois actions passent par ici — suspendre, réactiver, réinitialiser le mot de
 * passe — et aucune des trois n'est réversible d'un clic :
 *
 *   - **Suspendre** coupe l'accès et ferme immédiatement toutes les sessions en
 *     cours. Si le client était en train de travailler, il est éjecté.
 *   - **Réactiver** rend l'accès et lève le verrou anti-force-brute.
 *   - **Réinitialiser** invalide le mot de passe actuel du client. Il ne pourra
 *     plus se connecter tant qu'on ne lui aura pas transmis le nouveau.
 *
 * Ce dialogue **rappelle les conséquences avant d'agir**, en toutes lettres —
 * ce n'est pas un « êtes-vous sûr ? » qu'on clique sans lire. Rien n'est envoyé
 * au serveur tant que le bouton de confirmation n'a pas été actionné.
 *
 * ## Le motif
 *
 * Obligatoire sur `suspendre` et `reactiver`, et sur elles seules (contrat § 4).
 * Couper l'accès à un client engage le propriétaire et doit pouvoir être
 * expliqué six mois plus tard ; remettre un mot de passe perdu n'a pas à
 * l'être. Exiger un motif partout produirait des « RAS » qui videraient le
 * champ de son sens là où il compte.
 *
 * Le refus d'un motif vide est prononcé **ici, avant tout appel réseau** — le
 * serveur le refuse aussi (`min(3)`), mais faire faire l'aller-retour pour
 * apprendre qu'un champ est vide est une perte de temps, et l'erreur revient
 * alors sous forme de `400 VALIDATION_ERROR` moins lisible que cette phrase.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import type { ApiError } from '../lib/api';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { TextAreaField } from './Field';
import { FormAlert } from './FormAlert';
import { AlertIcon } from './icons';

/** Longueur minimale du motif, alignée sur le schéma du serveur. */
export const MOTIF_MINIMUM = 3;

export interface ConfirmationActionProps {
  open: boolean;
  title: string;
  /** Ce qui va se passer, dit en toutes lettres. */
  consequences: ReactNode;
  /** Libellé du bouton qui déclenche réellement l'action. */
  confirmLabel: string;
  /** Un ton `danger` pour ce qui coupe un accès, `primary` pour ce qui le rend. */
  tone?: 'danger' | 'primary';
  /** Vrai pour `suspendre` et `reactiver` uniquement. */
  motifRequis: boolean;
  onConfirm: (motif: string) => void;
  onClose: () => void;
  submitting: boolean;
  error: ApiError | null;
}

export function ConfirmationAction({
  open,
  title,
  consequences,
  confirmLabel,
  tone = 'danger',
  motifRequis,
  onConfirm,
  onClose,
  submitting,
  error,
}: ConfirmationActionProps) {
  const [motif, setMotif] = useState('');
  const [motifFautif, setMotifFautif] = useState(false);

  useEffect(() => {
    if (open) {
      setMotif('');
      setMotifFautif(false);
    }
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (motifRequis && motif.trim().length < MOTIF_MINIMUM) {
      setMotifFautif(true);
      return;
    }

    onConfirm(motif.trim());
  }

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="formulaire-confirmation-action"
            variant={tone === 'danger' ? 'secondary' : 'primary'}
            className={
              tone === 'danger'
                ? 'border-danger-border bg-danger-soft text-danger hover:bg-danger-soft/70'
                : undefined
            }
            loading={submitting}
            loadingLabel="Action en cours"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id="formulaire-confirmation-action"
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {error && (
          <FormAlert tone="danger" icon={<AlertIcon />}>
            {error.message}
          </FormAlert>
        )}

        <div className="rounded-md border border-ink-200 bg-surface-sunken px-3.5 py-3 text-sm leading-relaxed text-ink-700">
          {consequences}
        </div>

        {motifRequis && (
          <TextAreaField
            label="Motif"
            value={motif}
            onValueChange={(valeur) => {
              setMotif(valeur);
              setMotifFautif(false);
            }}
            rows={3}
            disabled={submitting}
            error={
              motifFautif
                ? 'Indiquez un motif : il sera conservé dans le journal et c’est ce qui vous permettra, dans six mois, de dire pourquoi ce compte a été touché.'
                : undefined
            }
            hint="Par exemple : « abonnement non renouvelé », « à la demande du client », « reprise après paiement »."
          />
        )}
      </form>
    </Dialog>
  );
}
