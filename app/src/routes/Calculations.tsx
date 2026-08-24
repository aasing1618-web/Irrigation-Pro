/**
 * Catalogue des modules de calcul.
 *
 * Cet écran ne connaît aucun module : il affiche ce que le serveur déclare dans
 * `GET /api/calculs/modules`. Un module ajouté côté serveur apparaît ici sans
 * qu'une ligne de cette application ne change.
 *
 * On y lance un calcul d'essai, sans projet — la façon dont un ingénieur
 * vérifie une hypothèse avant de la retenir. Pour conserver un résultat, on
 * l'archive dans un projet.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { CalculationsIcon, ChevronRightIcon } from '../components/icons';
import { useCalculModules } from '../hooks/useCalculs';
import { cn } from '../lib/cn';
import type { CalculModule } from '../lib/calculs';
import { WaterRippleImage } from '../components/ui/water-ripple-image';
import { ShaderBackground } from '../components/ui/oceanic-currents';

/** Regroupe par famille quand le serveur en déclare une. */
function byFamily(modules: CalculModule[]): Array<{ famille: string; modules: CalculModule[] }> {
  const groups: Array<{ famille: string; modules: CalculModule[] }> = [];
  for (const module of modules) {
    const famille = module.famille || 'Modules de calcul';
    const existing = groups.find((group) => group.famille === famille);
    if (existing) existing.modules.push(module);
    else groups.push({ famille, modules: [module] });
  }
  return groups;
}

function getFamilyPhoto(famille: string): string {
  const f = famille.toLowerCase();
  if (f.includes('agron') || f.includes('besoin') || f.includes('climat')) return '/photos/champ-mais.jpg';
  if (f.includes('canal') || f.includes('éco') || f.includes('libre')) return '/photos/rizicoles-irrigation.jpg';
  if (f.includes('réseau') || f.includes('goutte') || f.includes('aspersion')) return '/photos/aspersion-moderne.jpg';
  if (f.includes('pomp') || f.includes('énerg') || f.includes('solair')) return '/photos/pompage-solaire.jpg';
  return '/photos/bassin-stockage.jpg';
}

export function Calculations() {
  const navigate = useNavigate();
  const query = useCalculModules();
  const groups = useMemo(() => byFamily(query.data ?? []), [query.data]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      {/* En-tête illustré WebGL Water Ripple & Shader */}
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-ink-200/80 bg-brand-950 p-6 shadow-raised min-h-[10rem]">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <WaterRippleImage
            src="/photos/outils-maraichage.jpg"
            blueish={0.5}
            scale={6}
            illumination={0.15}
            surfaceDistortion={0.05}
            waterDistortion={0.03}
            className="size-full"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 opacity-25 mix-blend-screen">
          <ShaderBackground className="size-full" />
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/90 to-transparent" />
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/20 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-brand-300 backdrop-blur-md border border-brand-400/20">
            14 Modules Embarqués
          </span>
          <h1 className="mt-2 text-2xl font-bold text-white">Catalogue des Calculs</h1>
          <p className="mt-1 max-w-[64ch] text-sm text-brand-200/90">
            Modules de dimensionnement rigoureux. Lancez un essai libre ici, ou ouvrez un projet pour conserver et exporter vos résultats en PDF.
          </p>
        </div>
      </div>

      {query.isPending ? (
        <Card flush>
          <LoadingRows rows={3} label="Chargement des modules de calcul" />
        </Card>
      ) : query.isError ? (
        <Card flush>
          <QueryError
            error={query.error}
            subject="les modules de calcul"
            onRetry={() => void query.refetch()}
          />
        </Card>
      ) : groups.length === 0 ? (
        <Card flush>
          <EmptyState
            icon={<CalculationsIcon />}
            title="Aucun module disponible"
            description="Le serveur n’expose aucun module de calcul pour le moment. Cette liste se remplira d’elle-même dès qu’il en proposera."
            className="py-16"
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const photo = getFamilyPhoto(group.famille);
            return (
              <Card key={group.famille} className="overflow-hidden" flush>
                {/* En-tête de famille de calculs avec image */}
                <div className="relative h-20 overflow-hidden border-b border-ink-100 bg-brand-950 px-5 py-4 flex items-center justify-between">
                  <img src={photo} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full object-cover opacity-35" />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/85 to-transparent" />
                  <div className="relative">
                    <h2 className="text-md font-semibold text-white">{group.famille}</h2>
                    <p className="text-2xs text-brand-300 font-medium">
                      {group.modules.length} {group.modules.length === 1 ? 'module certifié' : 'modules certifiés'}
                    </p>
                  </div>
                </div>

                <ul className="flex flex-col">
                  {group.modules.map((module, index) => (
                    <li key={module.code}>
                      <button
                        type="button"
                        onClick={() => void navigate(`/calculs/${module.code}`)}
                        className={cn(
                          'group flex w-full items-start gap-3.5 px-5 py-4 text-left',
                          'transition-colors duration-150 ease-out-quart hover:bg-ink-50',
                          index > 0 && 'border-t border-ink-100',
                        )}
                      >
                        <span aria-hidden="true" className="mt-0.5 text-[1.25rem] text-brand-600 transition-transform duration-150 group-hover:scale-110">
                          <CalculationsIcon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-md font-semibold text-ink-900 group-hover:text-brand-700 transition-colors">
                            {module.nom}
                          </span>
                          {module.description && (
                            <span className="mt-1 block max-w-[68ch] text-sm leading-relaxed text-ink-600">
                              {module.description}
                            </span>
                          )}
                          <span className="mt-1.5 inline-flex items-center gap-1 text-2xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-100">
                            {module.entrees.length === 1
                              ? '1 paramètre de saisie'
                              : `${module.entrees.length} paramètres de saisie`}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-1 text-[1.125rem] text-ink-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600"
                        >
                          <ChevronRightIcon />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
