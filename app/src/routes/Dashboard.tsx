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
import { WaterRippleImage } from '../components/ui/water-ripple-image';
import { ShaderBackground } from '../components/ui/oceanic-currents';
import { HandwritingSvg } from '../components/ui/handwriting-svg';

export interface DashboardProps {
  connection: ConnectionState;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Dashboard({ connection, onRefresh, isRefreshing }: DashboardProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      {/* Hero Banner Immersif avec Water Ripple WebGL & Photo d'Ingénierie */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-950 shadow-overlay min-h-[16rem]">
        {/* WebGL Water Ripple Image background */}
        <div className="pointer-events-none absolute inset-0 opacity-75">
          <WaterRippleImage
            src="/photos/fraisier-aspersion.jpg"
            blueish={0.45}
            scale={7}
            illumination={0.18}
            surfaceDistortion={0.06}
            waterDistortion={0.03}
            className="size-full"
          />
        </div>

        {/* Ambient Oceanic Currents Shader Overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen">
          <ShaderBackground className="size-full" />
        </div>

        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-950/95 via-emerald-950/75 to-transparent" />
        
        <div className="relative z-10 p-7 sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/30 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-emerald-200 backdrop-blur-md border border-emerald-400/30 shadow-sm">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Plateforme d'Ingénierie Ondulatoire & Hydraulique
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-2xs font-medium text-white backdrop-blur-md border border-white/20">
              14 Modules Certifiés
            </span>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl drop-shadow-md">
              Tableau de bord
            </h1>
            <HandwritingSvg
              text="Irrigation Pro"
              width={200}
              height={45}
              fontSize={32}
              strokeWidth={1.5}
              duration={2.5}
              className="hidden sm:block text-emerald-400"
            />
          </div>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-emerald-100/90 sm:text-base drop-shadow">
            Conçu pour les ingénieurs agronomes, hydrauliciens et bureaux d'études. Pilotez vos chantiers d'irrigation et générez vos notes de calcul professionnelles.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" onClick={() => void navigate('/projets')}>
              <ProjectsIcon /> Ouvrir mes projets
            </Button>
            <Button variant="secondary" size="md" className="border-white/30 bg-white/15 text-white hover:bg-white/25 backdrop-blur-md" onClick={() => void navigate('/calculs')}>
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

          {/* Carte Visuelle Ondulée Centrée avec Nature Heals */}
          <Card title="Aperçu Hydraulique Ondulé" className="overflow-hidden">
            <div className="relative h-64 w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-brand-950">
              <WaterRippleImage
                src="/photos/Nature_Heals_Quietly___Organic_Heal.jpeg"
                blueish={0.4}
                scale={6}
                illumination={0.18}
                surfaceDistortion={0.05}
                waterDistortion={0.03}
                className="size-full"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-950/90 via-brand-950/30 to-transparent p-4 flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300">Animation WebGL Centrée</span>
                <span className="text-2xs text-white/80">Nature & Écosystème Irrigué</span>
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
      className="group relative flex h-40 flex-col justify-end overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-950 p-4 text-left shadow-subtle transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-raised"
    >
      <img
        src={photo}
        alt={title}
        className="pointer-events-none absolute inset-0 size-full object-cover filter brightness-105 contrast-105 opacity-70 transition-all duration-500 group-hover:scale-110 group-hover:opacity-85"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-emerald-950/95 via-emerald-950/40 to-transparent" />
      <div className="relative z-10">
        <h3 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors drop-shadow-sm">{title}</h3>
        <p className="mt-0.5 text-2xs text-emerald-100/80 line-clamp-1">{subtitle}</p>
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
