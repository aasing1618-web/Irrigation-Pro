/**
 * Changement de mot de passe **obligatoire**.
 *
 * Un administrateur créé par un autre administrateur — ou le tout premier
 * compte, créé en ligne de commande sur le serveur — reçoit lui aussi un mot de
 * passe temporaire. Tant qu'il ne l'a pas remplacé, **toutes** les routes
 * d'administration lui répondent `403 PASSWORD_CHANGE_REQUIRED` (contrat § 2,
 * « deux refus qui restent en amont du contrôle de rôle »).
 *
 * Sans cet écran, il verrait un dashboard entièrement en erreur sans savoir
 * quoi faire. Il n'a donc ni croix, ni « plus tard », ni navigation : la seule
 * sortie est la déconnexion, pour celui qui s'est trompé de compte.
 *
 * Ce que le dashboard vérifie ici : des évidences qui évitent un aller-retour
 * (champs remplis, longueur minimale, concordance des deux saisies — que le
 * serveur ne voit pas, il ne reçoit qu'un mot de passe). Tout le reste est au
 * serveur : mots de passe trop courants, comparaison avec l'ancien, validité du
 * mot de passe actuel. Sa réponse est affichée telle quelle.
 */

import { useState, type FormEvent } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BrandBackdrop, BrandLockup } from '../components/BrandBackdrop';
import { Button } from '../components/Button';
import { PasswordField } from '../components/Field';
import { FormAlert } from '../components/FormAlert';
import { AlertIcon, KeyIcon } from '../components/icons';
import { ApiError, normalizeError } from '../lib/api';

/** Longueur minimale imposée par le serveur (contrat Vague 1, § 2). */
export const LONGUEUR_MINIMALE = 10;

export function ChangePassword() {
  const { user, logout, changePassword } = useAuth();

  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [leaving, setLeaving] = useState(false);

  const tropCourt = nouveau !== '' && nouveau.length < LONGUEUR_MINIMALE;
  const discordant = confirmation !== '' && confirmation !== nouveau;

  const canSubmit =
    actuel !== '' &&
    nouveau.length >= LONGUEUR_MINIMALE &&
    confirmation === nouveau &&
    !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);

    try {
      await changePassword(actuel, nouveau);
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      // Aucun des trois mots de passe ne survit à l'envoi.
      setActuel('');
      setNouveau('');
      setConfirmation('');
      setPending(false);
    }
  }

  return (
    <BrandBackdrop width="sm">
      <BrandLockup as="plain" compact tagline={null} />

      <section className="mt-7 rounded-xl border border-ink-100 bg-surface p-6 shadow-overlay">
        <header className="flex gap-3.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[1.125rem] text-brand-600"
          >
            <KeyIcon />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">
              Choisissez votre mot de passe
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              Le mot de passe qui vous a été communiqué est temporaire&nbsp;: une
              autre personne le connaît. Remplacez-le maintenant pour être le seul
              à pouvoir ouvrir l’administration.
            </p>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-5 flex flex-col gap-4 border-t border-ink-100 pt-5"
        >
          {error && (
            <FormAlert tone="danger" icon={<AlertIcon />}>
              {error.message}
            </FormAlert>
          )}

          <PasswordField
            label="Mot de passe actuel"
            value={actuel}
            onValueChange={setActuel}
            autoComplete="current-password"
            disabled={pending}
          />

          <PasswordField
            label="Nouveau mot de passe"
            value={nouveau}
            onValueChange={setNouveau}
            autoComplete="new-password"
            disabled={pending}
            invalid={tropCourt}
            hint={`${LONGUEUR_MINIMALE} caractères minimum. Une phrase de plusieurs mots est plus sûre — et plus facile à retenir — qu’un mot compliqué.`}
          />

          <PasswordField
            label="Confirmer le nouveau mot de passe"
            value={confirmation}
            onValueChange={setConfirmation}
            autoComplete="new-password"
            disabled={pending}
            invalid={discordant}
            hint={discordant ? 'Les deux saisies ne sont pas identiques.' : undefined}
          />

          <Button
            type="submit"
            variant="primary"
            className="mt-1 w-full"
            disabled={!canSubmit}
            loading={pending}
            loadingLabel="Enregistrement en cours"
          >
            Enregistrer et continuer
          </Button>
        </form>
      </section>

      <div className="mt-5 text-center text-xs leading-relaxed text-brand-300">
        {user && (
          <p>
            Connecté en tant que <span className="text-brand-200">{user.email}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setLeaving(true);
            void logout();
          }}
          disabled={leaving}
          className="mt-1.5 rounded-xs text-brand-300 underline underline-offset-2 transition-colors duration-150 hover:text-white disabled:opacity-60"
        >
          Ce n’est pas votre compte&nbsp;? Se déconnecter
        </button>
      </div>
    </BrandBackdrop>
  );
}
