/**
 * Tableau de bord — écran d'accueil de l'application.
 *
 * En Vague 0, il porte deux choses : l'état réel de la liaison au serveur, et
 * les emplacements réservés aux projets récents. Les emplacements ne font pas
 * semblant d'avoir du contenu : ils annoncent ce qui arrive.
 */

import { useNavigate } from 'react-router';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { CalculationsIcon, ProjectsIcon, RetryIcon, ServerIcon } from '../components/icons';
import type { ConnectionState, HealthResponse } from '../hooks/useHealth';

export interface DashboardProps {
  connection: ConnectionState;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Dashboard({ connection, onRefresh, isRefreshing }: DashboardProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      {/* Hero Banner Immersif avec Photo d'Ingénierie */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-brand-950 shadow-overlay">
        <img
          src="/photos/fraisier-aspersion.jpg"
          alt="Irrigation par aspersion"
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-35"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/80 to-transparent" />
        
        <div className="relative p-7 sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/20 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-brand-300 backdrop-blur-md border border-brand-400/20">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Plateforme d'Ingénierie
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-2xs font-medium text-brand-200 backdrop-blur-md">
              14 Modules Certifiés
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Tableau de bord
          </h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-brand-200/90 sm:text-base">
            Conçu pour les ingénieurs agronomes, hydrauliciens et bureaux d'études. Pilotez vos chantiers d'irrigation et générez vos notes de calcul professionnelles.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" onClick={() => void navigate('/projets')}>
              <ProjectsIcon /> Ouvrir mes projets
            </Button>
            <Button variant="secondary" size="md" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => void navigate('/calculs')}>
              <CalculationsIcon /> Explorer les 14 modules
            </Button>
          </div>
        </div>
      </div>

      {/* Galerie des Grandes Familles de Dimensionnement (Cartes Photo) */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-ink-900 flex items-center justify-between">
          <span>Domaines d'application & Calculs</span>
          <span className="text-xs font-normal text-ink-500">14 modules prêts à l'emploi</span>
        </h2>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleCategoryCard
            title="Besoins en eau FAO 56"
            subtitle="Evapotranspiration ET0, KC & Bilan"
            photo="/photos/champ-mais.jpg"
            onClick={() => void navigate('/calculs')}
          />
          <ModuleCategoryCard
            title="Hydraulique des Canaux"
            subtitle="Manning-Strickler & Écoulement"
            photo="/photos/rizicoles-irrigation.jpg"
            onClick={() => void navigate('/calculs')}
          />
          <ModuleCategoryCard
            title="Réseaux sous pression"
            subtitle="Goutte-à-goutte & Aspersion"
            photo="/photos/aspersion-moderne.jpg"
            onClick={() => void navigate('/calculs')}
          />
          <ModuleCategoryCard
            title="Pompage & Énergie Solaire"
            subtitle="HMT, Puissance & Solaires"
            photo="/photos/pompage-solaire.jpg"
            onClick={() => void navigate('/calculs')}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <Card title="Vos projets" flush>
            <EmptyState
              icon={<ProjectsIcon />}
              title="Vos chantiers, au même endroit"
              description="Un projet regroupe un périmètre irrigué : ses données de terrain, ses calculs de dimensionnement et ses rapports. Vous seul y avez accès."
              action={
                <Button variant="primary" size="sm" onClick={() => void navigate('/projets')}>
                  Ouvrir mes projets
                </Button>
              }
            />
          </Card>

          {/* Bandeau Photo Galerie de Terrain */}
          <Card title="Galerie de terrain & Équipements" className="overflow-hidden">
            <div className="grid grid-cols-3 gap-2">
              <div className="group relative h-28 overflow-hidden rounded-lg">
                <img src="/photos/goutte-a-goutte.jpg" alt="Goutte-à-goutte" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-2 text-2xs font-medium text-white">Goutte-à-goutte</span>
              </div>
              <div className="group relative h-28 overflow-hidden rounded-lg">
                <img src="/photos/bassin-stockage.jpg" alt="Bassin de stockage" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-2 text-2xs font-medium text-white">Bassin de stockage</span>
              </div>
              <div className="group relative h-28 overflow-hidden rounded-lg">
                <img src="/photos/outils-maraichage.jpg" alt="Outils maraîchage" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-2 text-2xs font-medium text-white">Maraîchage pro</span>
              </div>
            </div>
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

function ModuleCategoryCard({
  title,
  subtitle,
  photo,
  onClick,
}: {
  title: string;
  subtitle: string;
  photo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-36 flex-col justify-end overflow-hidden rounded-xl border border-ink-200/80 bg-brand-950 p-4 text-left shadow-subtle transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-raised"
    >
      <img
        src={photo}
        alt={title}
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-40 transition-transform duration-500 group-hover:scale-110 group-hover:opacity-50"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/50 to-transparent" />
      <div className="relative">
        <h3 className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors">{title}</h3>
        <p className="mt-0.5 text-2xs text-brand-200/80 line-clamp-1">{subtitle}</p>
      </div>
    </button>
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
