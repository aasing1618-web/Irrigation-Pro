/**
 * Remise d'un mot de passe temporaire.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  C'EST LE MOMENT LE PLUS CRITIQUE DE TOUTE L'INTERFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *  Ce mot de passe n'existe en clair qu'ici, dans cette réponse HTTP, à cet
 *  instant. Le serveur n'en garde qu'une empreinte : il n'est ni journalisé, ni
 *  réaffichable, et **aucune route ne permet de le retrouver**.
 *
 *  Si le propriétaire ferme cette fenêtre sans l'avoir copié, la seule issue
 *  est de réinitialiser le compte — ce qui en tire un nouveau et révoque au
 *  passage toutes les sessions du client. Sur une création, cela veut dire
 *  rappeler un client à qui l'on vient d'annoncer ses accès.
 *
 *  Quatre garde-fous, pour rendre cette erreur difficile à commettre :
 *    1. `dismissible={false}` — ni `Échap`, ni le clic à côté ne ferment. C'est
 *       le seul endroit du produit où une modale se refuse à disparaître, et
 *       c'est assumé : partout ailleurs, ce serait un piège ;
 *    2. il n'y a **aucune croix** de fermeture ;
 *    3. le bouton « J'ai terminé » reste **inactif** tant qu'une case n'a pas
 *       été cochée : fermer devient un geste délibéré, pas un réflexe ;
 *    4. l'avertissement est écrit avant le mot de passe, pas après.
 *
 *  Le mot de passe est en `<output>` et non dans un champ : il n'est pas une
 *  saisie, il ne doit pas être modifiable, et un gestionnaire de mots de passe
 *  n'a rien à proposer d'enregistrer ici.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from 'react';

import { Button } from './Button';
import { CheckboxField } from './Field';
import { Dialog } from './Dialog';
import { FormAlert } from './FormAlert';
import { AlertIcon, CheckIcon, CopyIcon } from './icons';

export interface MotDePasseTemporaireProps {
  open: boolean;
  /** À qui ce mot de passe est destiné — pour ne pas se tromper de client. */
  email: string;
  nomComplet: string;
  motDePasse: string;
  /** Distingue une création (« le compte est créé ») d'une réinitialisation. */
  origine: 'creation' | 'reinitialisation';
  onClose: () => void;
}

type EtatCopie = 'repos' | 'copie' | 'echec';

export function MotDePasseTemporaire({
  open,
  email,
  nomComplet,
  motDePasse,
  origine,
  onClose,
}: MotDePasseTemporaireProps) {
  const [confirme, setConfirme] = useState(false);
  const [copie, setCopie] = useState<EtatCopie>('repos');
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chaque ouverture repart de zéro : un mot de passe déjà confirmé ne doit pas
  // laisser le suivant fermable d'un clic.
  useEffect(() => {
    if (open) {
      setConfirme(false);
      setCopie('repos');
    }
  }, [open, motDePasse]);

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    },
    [],
  );

  async function copier() {
    try {
      // `navigator.clipboard` n'existe pas hors contexte sécurisé (ni sous
      // jsdom) : l'absence est traitée comme un échec, avec une consigne de
      // repli — jamais comme un succès silencieux.
      const presse = navigator.clipboard;
      if (!presse?.writeText) throw new Error('presse-papiers indisponible');
      await presse.writeText(motDePasse);
      setCopie('copie');
    } catch {
      setCopie('echec');
      return;
    }

    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setCopie('repos'), 4000);
  }

  const titre =
    origine === 'creation' ? 'Compte créé — mot de passe temporaire' : 'Nouveau mot de passe temporaire';

  return (
    <Dialog
      open={open}
      title={titre}
      description={`À transmettre à ${nomComplet} (${email}). Ce compte devra le remplacer à sa première connexion.`}
      onClose={onClose}
      dismissible={false}
      width="md"
      footer={
        <>
          <p className="mr-auto text-xs text-ink-500">
            {confirme ? 'Vous pouvez fermer.' : 'Cochez la case pour pouvoir fermer.'}
          </p>
          <Button variant="primary" disabled={!confirme} onClick={onClose}>
            J’ai terminé
          </Button>
        </>
      }
    >
      <FormAlert tone="warning" title="Ce mot de passe ne sera plus jamais affiché" icon={<AlertIcon />}>
        Il n’est enregistré nulle part, pas même sur le serveur. Copiez-le
        maintenant&nbsp;: si vous fermez cette fenêtre sans l’avoir transmis, il
        faudra réinitialiser le compte pour en obtenir un autre.
      </FormAlert>

      <div className="mt-5 rounded-lg border border-ink-200 bg-surface-sunken p-4">
        <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
          Mot de passe temporaire
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <output
            aria-label="Mot de passe temporaire"
            className="min-w-0 flex-1 select-all break-all rounded-md border border-ink-200 bg-surface px-3 py-2.5 font-mono text-md text-ink-900"
          >
            {motDePasse}
          </output>

          <Button
            variant="secondary"
            icon={copie === 'copie' ? <CheckIcon /> : <CopyIcon />}
            onClick={() => void copier()}
          >
            {copie === 'copie' ? 'Copié' : 'Copier'}
          </Button>
        </div>

        {/* `role="status"` : le retour de copie est annoncé sans voler le focus,
            que la copie ait réussi ou échoué. */}
        <p role="status" className="mt-2 min-h-4 text-xs text-ink-500">
          {copie === 'copie' && 'Le mot de passe est dans le presse-papiers.'}
          {copie === 'echec' &&
            'La copie automatique a échoué. Sélectionnez le mot de passe ci-dessus et copiez-le à la main.'}
        </p>
      </div>

      {/* Emplacement réservé au bouton WhatsApp (Vague 4). Il ouvrira un lien
          « wa.me » avec un message pré-rempli — rien de plus, aucune API. Il est
          montré désactivé plutôt qu'absent : la place lui est gardée, et le
          propriétaire sait que ce n'est pas une fonction qu'il aurait manquée. */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-ink-200 px-3.5 py-3">
        <Button variant="secondary" size="sm" disabled>
          Envoyer par WhatsApp
        </Button>
        <p className="min-w-0 flex-1 text-xs text-ink-500">
          Disponible en Vague&nbsp;4&nbsp;: ouvrira WhatsApp avec les identifiants
          déjà rédigés. En attendant, copiez et transmettez comme d’habitude.
        </p>
      </div>

      <div className="mt-5 border-t border-ink-100 pt-4">
        <CheckboxField
          label="J’ai copié ou transmis ce mot de passe"
          checked={confirme}
          onCheckedChange={setConfirme}
          hint="Cette case n’envoie rien au serveur : elle est là pour vous empêcher de fermer trop vite."
        />
      </div>
    </Dialog>
  );
}
