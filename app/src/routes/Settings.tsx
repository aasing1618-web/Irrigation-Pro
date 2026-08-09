/**
 * Paramètres.
 *
 * En Vague 1, cet écran porte ce qui existe réellement : le compte connecté et
 * le changement de mot de passe volontaire — le même formulaire que celui
 * imposé à la première connexion, sans le décor d'urgence.
 *
 * Les préférences d'affichage et les valeurs par défaut des projets arriveront
 * avec les vagues suivantes ; l'emplacement est annoncé, pas simulé.
 */

import { useAuth } from '../auth/AuthProvider';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PasswordChangeForm } from '../components/PasswordChangeForm';
import { SettingsIcon } from '../components/icons';

export function Settings() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title="Paramètres"
        description="Votre compte, votre mot de passe et les réglages appliqués par défaut à vos nouveaux projets."
      />

      <div className="flex flex-col gap-5">
        <Card
          title="Votre compte"
          description="Ces informations ont été enregistrées par votre fournisseur. Elles apparaîtront en en-tête de vos rapports."
        >
          <dl className="flex flex-col gap-3">
            <AccountRow label="Nom" value={user?.fullName} />
            <AccountRow label="Adresse e-mail" value={user?.email} />
            <AccountRow label="Structure" value={user?.company} />
          </dl>
          <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-500">
            Une information à corriger&nbsp;? Contactez votre fournisseur
            Irrigation&nbsp;Pro&nbsp;: lui seul peut modifier ces éléments.
          </p>
        </Card>

        <Card
          title="Mot de passe"
          description="Choisissez un nouveau mot de passe quand vous le souhaitez. Vos autres sessions seront fermées."
        >
          <div className="max-w-md">
            <PasswordChangeForm showSuccess submitLabel="Changer mon mot de passe" />
          </div>
        </Card>

        <Card flush>
          <EmptyState
            icon={<SettingsIcon />}
            title="Préférences d’affichage"
            description="Unités, arrondis et valeurs par défaut de vos nouveaux projets seront réglables ici."
            note="Disponible prochainement"
            className="py-12"
          />
        </Card>
      </div>
    </div>
  );
}

function AccountRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-base font-medium text-ink-900">{value || '—'}</dd>
    </div>
  );
}
