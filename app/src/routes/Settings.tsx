/**
 * Paramètres.
 *
 * Cet écran ne porte que ce qui existe réellement : le compte connecté, le
 * changement de mot de passe volontaire — le même formulaire que celui imposé à
 * la première connexion, sans le décor d'urgence —, le contact du fournisseur
 * et les numéros de version.
 *
 * Les préférences d'affichage et les valeurs par défaut des projets arriveront
 * avec les vagues suivantes ; l'emplacement est annoncé, pas simulé.
 */

import { useAuth } from '../auth/AuthProvider';
import { ButtonLink } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PasswordChangeForm } from '../components/PasswordChangeForm';
import { ChatIcon, SettingsIcon } from '../components/icons';
import { useServerVersion } from '../hooks/useServerVersion';
import { APP_VERSION } from '../lib/version';
import { buildWhatsAppLink } from '../lib/whatsapp';

export function Settings() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-8 py-4 sm:py-7">
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

        <Card
          title="Assistance"
          description="Une question sur un calcul, un problème d’accès, un besoin de formation : votre fournisseur Irrigation Pro répond directement sur WhatsApp."
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <ButtonLink
              variant="primary"
              icon={<ChatIcon />}
              href={buildWhatsAppLink(user ?? {})}
              target="_blank"
            >
              Écrire sur WhatsApp
            </ButtonLink>
            <p className="text-sm text-ink-500">
              La conversation s’ouvre avec votre nom déjà indiqué&nbsp;; le reste du message
              vous appartient.
            </p>
          </div>
        </Card>

        <VersionCard />

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

/**
 * Les deux versions qui comptent en cas de dépannage : celle de l'écran que
 * l'utilisateur a sous les yeux, et celle du serveur qui fait les calculs.
 *
 * Un serveur muet n'est pas une erreur d'écran : on l'écrit en clair et on
 * n'affiche ni code HTTP, ni message technique.
 */
function VersionCard() {
  const server = useServerVersion();

  return (
    <Card
      title="Version"
      description="À communiquer à votre fournisseur en cas de problème technique."
    >
      <dl className="flex flex-col gap-3">
        <AccountRow label="Application" value={APP_VERSION} numeric />
        <AccountRow
          label="Serveur Irrigation Pro"
          value={
            server.version ??
            (server.isLoading ? 'Vérification en cours…' : 'Serveur injoignable')
          }
          numeric={server.version !== null}
        />
      </dl>
    </Card>
  );
}

function AccountRow({
  label,
  value,
  numeric,
}: {
  label: string;
  value?: string | null;
  /** Chiffres alignés : utile pour les numéros de version. */
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-base font-medium text-ink-900" data-numeric={numeric || undefined}>
        {value || '—'}
      </dd>
    </div>
  );
}
