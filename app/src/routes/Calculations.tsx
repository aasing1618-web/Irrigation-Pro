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
import { PageHeader } from '../components/PageHeader';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { CalculationsIcon, ChevronRightIcon } from '../components/icons';
import { useCalculModules } from '../hooks/useCalculs';
import { cn } from '../lib/cn';
import type { CalculModule } from '../lib/calculs';

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

export function Calculations() {
  const navigate = useNavigate();
  const query = useCalculModules();
  const groups = useMemo(() => byFamily(query.data ?? []), [query.data]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title="Calculs"
        description="Les modules de dimensionnement mis à disposition par le serveur Irrigation Pro. Lancez un essai ici, ou ouvrez un projet pour archiver vos résultats."
      />

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
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <Card key={group.famille} title={group.famille} flush>
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
                      <span aria-hidden="true" className="mt-0.5 text-[1.25rem] text-brand-600">
                        <CalculationsIcon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-md font-medium text-ink-900">
                          {module.nom}
                        </span>
                        {module.description && (
                          <span className="mt-1 block max-w-[68ch] text-sm leading-relaxed text-ink-500">
                            {module.description}
                          </span>
                        )}
                        <span className="mt-1.5 block text-xs text-ink-400">
                          {module.entrees.length === 1
                            ? '1 paramètre de saisie'
                            : `${module.entrees.length} paramètres de saisie`}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-1 text-[1.125rem] text-ink-300 transition-colors duration-150 group-hover:text-ink-500"
                      >
                        <ChevronRightIcon />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
