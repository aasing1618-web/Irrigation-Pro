/**
 * Création d'un compte client.
 *
 * Formulaire court, volontairement : le serveur ne demande que l'adresse
 * e-mail et le nom complet. La société est facultative, et le rôle est
 * `CLIENT` par défaut — créer un second administrateur est un geste rare, il
 * ne doit pas occuper la moitié du formulaire.
 *
 * Ce que ce formulaire vérifie : que les deux champs obligatoires sont
 * remplis. C'est tout. La validité de l'adresse, son unicité (`409
 * EMAIL_DEJA_UTILISE`) et le reste appartiennent au serveur, dont le message
 * est affiché **tel quel** — il est déjà rédigé en français pour être lu ici.
 *
 * Le mot de passe temporaire n'apparaît pas dans ce dialogue : il est remis par
 * `MotDePasseTemporaire`, qui a ses propres garde-fous. Ce dialogue se ferme, le
 * second s'ouvre.
 */

import { useEffect, useState, type FormEvent } from 'react';

import type { ApiError } from '../lib/api';
import type { BrouillonCompte, RoleCompte } from '../lib/comptes';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { SelectField, TextField } from './Field';
import { FormAlert } from './FormAlert';
import { AlertIcon } from './icons';

export interface CreationCompteDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (brouillon: BrouillonCompte) => void;
  submitting: boolean;
  error: ApiError | null;
}

const ROLES = [
  { value: 'CLIENT', label: 'Client — accès à l’application Irrigation Pro' },
  { value: 'ADMIN', label: 'Administrateur — accès à ce dashboard' },
];

export function CreationCompteDialog({
  open,
  onClose,
  onSubmit,
  submitting,
  error,
}: CreationCompteDialogProps) {
  const [email, setEmail] = useState('');
  const [nomComplet, setNomComplet] = useState('');
  const [societe, setSociete] = useState('');
  const [role, setRole] = useState<RoleCompte>('CLIENT');
  const [manquants, setManquants] = useState(false);

  // Chaque ouverture repart d'un formulaire vierge : la saisie précédente,
  // abandonnée ou réussie, n'a rien à faire dans la suivante.
  useEffect(() => {
    if (open) {
      setEmail('');
      setNomComplet('');
      setSociete('');
      setRole('CLIENT');
      setManquants(false);
    }
  }, [open]);

  const emailVide = email.trim() === '';
  const nomVide = nomComplet.trim() === '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (emailVide || nomVide) {
      setManquants(true);
      return;
    }

    onSubmit({ email, nomComplet, societe, role });
  }

  return (
    <Dialog
      open={open}
      title="Créer un compte client"
      description="Le serveur tire un mot de passe temporaire et vous l’affiche une seule fois, juste après."
      onClose={onClose}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="formulaire-creation-compte"
            variant="primary"
            loading={submitting}
            loadingLabel="Création en cours"
          >
            Créer le compte
          </Button>
        </>
      }
    >
      <form
        id="formulaire-creation-compte"
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {error && (
          <FormAlert tone="danger" icon={<AlertIcon />}>
            {error.message}
          </FormAlert>
        )}

        <TextField
          label="Adresse e-mail"
          type="email"
          value={email}
          onValueChange={(valeur) => {
            setEmail(valeur);
            setManquants(false);
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
          disabled={submitting}
          error={manquants && emailVide ? 'L’adresse e-mail est obligatoire.' : undefined}
          hint="C’est son identifiant de connexion. Elle ne pourra plus être modifiée ensuite."
        />

        <TextField
          label="Nom complet"
          value={nomComplet}
          onValueChange={(valeur) => {
            setNomComplet(valeur);
            setManquants(false);
          }}
          autoComplete="off"
          disabled={submitting}
          error={manquants && nomVide ? 'Le nom complet est obligatoire.' : undefined}
        />

        <TextField
          label="Société"
          value={societe}
          onValueChange={setSociete}
          autoComplete="off"
          optional
          disabled={submitting}
          hint="Bureau d’études, coopérative, entreprise d’installation…"
        />

        <SelectField
          label="Rôle"
          value={role}
          onValueChange={(valeur) => setRole(valeur as RoleCompte)}
          options={ROLES}
          disabled={submitting}
          hint={
            role === 'ADMIN'
              ? 'Un administrateur pourra créer et suspendre des comptes, comme vous.'
              : 'Un client ne voit que ses propres projets. Il n’a aucun accès à ce dashboard.'
          }
        />
      </form>
    </Dialog>
  );
}
