/**
 * Changement de mot de passe **obligatoire** — première connexion.
 *
 * Le client a reçu un mot de passe temporaire par WhatsApp. Tant qu'il ne l'a
 * pas remplacé, deux personnes le connaissent : lui et son fournisseur. Cet
 * écran est donc incontournable — il n'a ni croix, ni bouton « plus tard », ni
 * navigation. Il n'est même pas monté dans le routeur : tant que
 * `mustChangePassword` est vrai, le reste de l'application n'existe pas
 * (voir `auth/SessionGate.tsx`).
 *
 * Le serveur applique exactement la même règle de son côté : toutes les routes
 * sont refusées en `403 PASSWORD_CHANGE_REQUIRED`, sauf celles qui permettent
 * précisément d'en sortir (contrat d'API, § 1).
 *
 * Seule sortie prévue : se déconnecter. Ce n'est pas un contournement — on
 * n'accède à rien — mais la porte de secours de celui qui s'est trompé de
 * compte.
 */

import { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BrandBackdrop, BrandLockup } from '../components/BrandBackdrop';
import { PasswordChangeForm } from '../components/PasswordChangeForm';
import { KeyIcon } from '../components/icons';

export function ChangePassword() {
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

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
            {/* Un utilisateur non technique doit comprendre que ce n'est pas
                une panne, mais une précaution qui le protège. */}
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              Le mot de passe qui vous a été communiqué est temporaire&nbsp;: votre
              fournisseur le connaît. Remplacez-le maintenant pour être le seul à
              pouvoir ouvrir votre espace de travail.
            </p>
          </div>
        </header>

        <div className="mt-5 border-t border-ink-100 pt-5">
          <PasswordChangeForm submitLabel="Enregistrer et continuer" />
        </div>
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
