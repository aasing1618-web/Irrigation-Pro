/**
 * Formulaire de changement de mot de passe.
 *
 * Un seul formulaire pour deux situations, parce que c'est exactement le même
 * geste :
 *   - le changement **obligatoire** à la première connexion (`routes/ChangePassword`) ;
 *   - le changement **volontaire** depuis l'écran Paramètres.
 *
 * Ce qui change entre les deux, c'est l'habillage autour — pas ce formulaire.
 *
 * ## Ce que l'application vérifie, et ce qu'elle laisse au serveur
 *
 * Côté application, uniquement des contrôles triviaux qui évitent un
 * aller-retour inutile : champs remplis, longueur minimale, et concordance des
 * deux saisies (que le serveur, lui, ne voit pas — il ne reçoit qu'un mot de
 * passe).
 *
 * Tout le reste appartient au serveur : la liste des mots de passe trop
 * courants, la comparaison avec l'ancien, la validité du mot de passe actuel.
 * On ne réimplémente rien de tout cela ici — on affiche sa réponse.
 */

import { useState, type FormEvent } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { Button } from './Button';
import { PasswordField } from './Field';
import { FormAlert } from './FormAlert';
import { AlertIcon, CheckIcon } from './icons';
import { cn } from '../lib/cn';
import { ApiError, normalizeError } from '../lib/api';

/** Longueur minimale imposée par le serveur (contrat d'API, § 2). */
export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordChangeFormProps {
  /** Libellé du bouton, ajusté au contexte. */
  submitLabel?: string;
  /** Affiche une confirmation après un changement volontaire. */
  showSuccess?: boolean;
  onSuccess?: () => void;
}

export function PasswordChangeForm({
  submitLabel = 'Enregistrer le nouveau mot de passe',
  showSuccess = false,
  onSuccess,
}: PasswordChangeFormProps) {
  const { changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const tooShort = newPassword !== '' && newPassword.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmation !== '' && confirmation !== newPassword;

  const canSubmit =
    currentPassword !== '' &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmation === newPassword &&
    !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);
    setSucceeded(false);

    try {
      await changePassword(currentPassword, newPassword);
      // Aucun des trois mots de passe ne survit à l'envoi.
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setSucceeded(true);
      onSuccess?.();
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error && (
        <FormAlert tone="danger" icon={<AlertIcon />}>
          {error.message}
        </FormAlert>
      )}

      {showSuccess && succeeded && !error && (
        <FormAlert tone="success" icon={<CheckIcon />}>
          Votre mot de passe a été modifié. Vos autres sessions ont été fermées.
        </FormAlert>
      )}

      <PasswordField
        label="Mot de passe actuel"
        value={currentPassword}
        onValueChange={setCurrentPassword}
        autoComplete="current-password"
        disabled={pending}
      />

      <PasswordField
        label="Nouveau mot de passe"
        value={newPassword}
        onValueChange={setNewPassword}
        autoComplete="new-password"
        disabled={pending}
        invalid={tooShort}
        hint="Une phrase de plusieurs mots est plus sûre — et plus facile à retenir — qu’un mot compliqué."
      >
        <PasswordLengthMeter value={newPassword} />
      </PasswordField>

      <PasswordField
        label="Confirmer le nouveau mot de passe"
        value={confirmation}
        onValueChange={setConfirmation}
        autoComplete="new-password"
        disabled={pending}
        invalid={mismatch}
        hint={mismatch ? 'Les deux saisies ne sont pas identiques.' : undefined}
      />

      <Button
        type="submit"
        variant="primary"
        className="mt-1 w-full"
        disabled={!canSubmit}
        loading={pending}
        loadingLabel="Enregistrement en cours"
      >
        {submitLabel}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Jauge de longueur — honnête, et alignée sur la seule règle du serveur.
 *
 * Elle ne prétend pas mesurer une « force » : elle mesure ce qui est réellement
 * exigé et ce qui aide réellement, c'est-à-dire la longueur. Un mot de passe
 * peut donc être annoncé « bon » ici et refusé par le serveur s'il figure dans
 * sa liste de mots de passe trop courants — c'est le serveur qui tranche, et sa
 * réponse est affichée telle quelle.
 */
function PasswordLengthMeter({ value }: { value: string }) {
  const { filled, label, tone } = measure(value.length);

  return (
    <div className="mt-1 flex items-center gap-3">
      <div aria-hidden="true" className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-200 ease-out-quart',
              index < filled ? tone.bar : 'bg-ink-100',
            )}
          />
        ))}
      </div>
      {/* `aria-live` : la mention change au fil de la frappe et doit être
          annoncée sans voler le focus. */}
      <p aria-live="polite" className={cn('w-[13ch] shrink-0 text-right text-xs', tone.text)}>
        {label}
      </p>
    </div>
  );
}

const TONES = {
  empty: { bar: 'bg-ink-100', text: 'text-ink-400' },
  weak: { bar: 'bg-danger', text: 'text-danger' },
  fair: { bar: 'bg-warning', text: 'text-warning' },
  good: { bar: 'bg-success', text: 'text-success' },
};

function measure(length: number): {
  filled: number;
  label: string;
  tone: { bar: string; text: string };
} {
  if (length === 0) return { filled: 0, label: `${MIN_PASSWORD_LENGTH} caractères min.`, tone: TONES.empty };
  if (length < MIN_PASSWORD_LENGTH) {
    return { filled: 1, label: 'Trop court', tone: TONES.weak };
  }
  if (length < 14) return { filled: 2, label: 'Acceptable', tone: TONES.fair };
  if (length < 20) return { filled: 3, label: 'Bon', tone: TONES.good };
  return { filled: 4, label: 'Excellent', tone: TONES.good };
}
