/**
 * Tableau de bord — écran d'accueil de l'application.
 *
 * En Vague 0, il porte deux choses : l'état réel de la liaison au serveur, et
 * les emplacements réservés aux projets récents. Les emplacements ne font pas
 * semblant d'avoir du contenu : ils annoncent ce qui arrive.
 */

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { ClockIcon, ProjectsIcon, RetryIcon, ServerIcon } from '../components/icons';
import type { ConnectionState, HealthResponse } from '../hooks/useHealth';

export interface DashboardProps {
  connection: ConnectionState;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Dashboard({ connection, onRefresh, isRefreshing }: DashboardProps) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title="Tableau de bord"
        description="Votre point de départ : l’état du service et vos projets les plus récents."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <Card
            title="Projets récents"
            description="Les projets que vous ouvrez apparaîtront ici, du plus récent au plus ancien."
            flush
          >
            <EmptyState
              icon={<ProjectsIcon />}
              title="Aucun projet pour l’instant"
              description="La création de projets arrive avec la prochaine étape du logiciel. Vous pourrez y regrouper vos parcelles, vos calculs et vos rapports."
              note="Disponible prochainement"
            />
          </Card>

          <Card
            title="Activité"
            description="Le journal de vos derniers calculs et rapports générés."
            flush
          >
            <EmptyState
              icon={<ClockIcon />}
              title="Rien à afficher"
              description="Dès que vous lancerez des calculs, leur historique s’affichera ici pour vous permettre de revenir sur un résultat."
              note="Disponible prochainement"
              className="py-10"
            />
          </Card>
        </div>

        <ServerCard
          connection={connection}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />
      </div>
    </div>
  );
}

function ServerCard({ connection, onRefresh, isRefreshing }: DashboardProps) {
  const { tone, label } = describe(connection);
  const health = connection.kind === 'online' ? connection.health : undefined;

  return (
    <Card className="h-fit">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[1.25rem] text-brand-600" aria-hidden="true">
            <ServerIcon />
          </span>
          <h2 className="text-md font-semibold text-ink-900">Serveur</h2>
        </div>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        {connection.kind === 'online'
          ? 'Vos calculs et vos rapports sont réalisés par le serveur Irrigation Pro. La liaison fonctionne normalement.'
          : connection.kind === 'checking'
            ? 'Vérification de la liaison en cours…'
            : connection.message}
      </p>

      {health && <ServerFacts health={health} />}

      <div className="mt-5">
        <Button
          size="sm"
          variant="secondary"
          icon={<RetryIcon />}
          onClick={onRefresh}
          loading={isRefreshing}
          loadingLabel="Vérification de la liaison en cours"
        >
          Vérifier à nouveau
        </Button>
      </div>
    </Card>
  );
}

/** Les quelques faits utiles que le serveur transmet, présentés lisiblement. */
function ServerFacts({ health }: { health: HealthResponse }) {
  const rows: Array<{ label: string; value: string }> = [];

  if (health.version) {
    rows.push({ label: 'Version du serveur', value: health.version });
  }
  if (typeof health.uptime === 'number') {
    rows.push({ label: 'En service depuis', value: formatUptime(health.uptime) });
  }
  if (health.database?.ok === true) {
    rows.push({ label: 'Base de données', value: 'Opérationnelle' });
  }

  if (rows.length === 0) return null;

  return (
    <dl className="mt-5 flex flex-col gap-2.5 border-t border-ink-100 pt-4">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-ink-500">{row.label}</dt>
          <dd className="text-sm font-medium text-ink-800" data-numeric>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Convertit des secondes en une durée lisible en français. */
export function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${total} s`;
}

function describe(connection: ConnectionState): { tone: StatusTone; label: string } {
  switch (connection.kind) {
    case 'online':
      return { tone: 'success', label: 'Connecté' };
    case 'degraded':
      return { tone: 'warning', label: 'Service réduit' };
    case 'offline':
      return { tone: 'danger', label: 'Hors ligne' };
    case 'checking':
    default:
      return { tone: 'pending', label: 'Vérification' };
  }
}
