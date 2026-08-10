/**
 * Affichage d'un résultat de calcul.
 *
 * ## Ce que cet écran doit faire mieux qu'un tableur
 *
 * Le produit remplace des classeurs Excel. Un classeur affiche cinquante
 * cellules de la même taille, et laisse passer en silence une vitesse
 * d'écoulement hors plage. Ici :
 *
 *   1. **Les avertissements du serveur passent en premier, en grand.** Ils ne
 *      sont jamais repliés, jamais en gris clair au bas de l'écran. C'est la
 *      valeur ajoutée du logiciel : le tableur ne dit rien, lui le dit.
 *   2. **Deux ou trois grandeurs sont mises en évidence**, en gros caractères,
 *      avec leur unité. Ce sont celles qu'on relève pour dimensionner.
 *   3. Le reste est accessible sans être imposé : groupé par sens, jamais en
 *      grille de tableur.
 *   4. **Chaque valeur porte son unité.** Un résultat sans unité est une faute
 *      (contrat d'API, § 6).
 *
 * Les entrées retenues sont rappelées en bas, repliées : elles servent à
 * vérifier ce qui a été calculé, pas à être lues à chaque fois.
 */

import { useMemo, type ReactNode } from 'react';

import { Card } from '../components/Card';
import { AlertIcon, InfoIcon } from '../components/icons';
import { cn } from '../lib/cn';
import {
  groupResults,
  readResults,
  type CalculModule,
  type CalculWarning,
  type ResultValue,
} from '../lib/calculs';
import { formatNumber } from '../lib/format';

/* --- Avertissements -------------------------------------------------------- */

export function WarningPanel({ warnings }: { warnings: CalculWarning[] }) {
  if (warnings.length === 0) return null;

  const blocking = warnings.some((warning) => warning.niveau === 'avertissement');

  return (
    <section
      // `alert` : l'utilisateur qui n'a pas les yeux sur l'écran doit être
      // averti au moment où le résultat arrive, pas en relisant la page.
      role="alert"
      aria-label="Points de vigilance signalés par le serveur"
      className={cn(
        'rounded-lg border px-5 py-4',
        blocking
          ? 'border-warning-border bg-warning-soft'
          : 'border-info-border bg-info-soft',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn('text-[1.25rem]', blocking ? 'text-warning' : 'text-info')}
        >
          {blocking ? <AlertIcon /> : <InfoIcon />}
        </span>
        <h3
          className={cn(
            'text-md font-semibold',
            blocking ? 'text-warning' : 'text-info',
          )}
        >
          {blocking
            ? warnings.length > 1
              ? `${warnings.length} points de vigilance`
              : 'Point de vigilance'
            : 'À noter'}
        </h3>
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {warnings.map((warning, index) => (
          <li key={`${warning.code ?? 'avert'}-${index}`} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                'mt-2 size-1.5 shrink-0 rounded-full',
                warning.niveau === 'avertissement' ? 'bg-warning' : 'bg-info',
              )}
            />
            <p className="text-base leading-relaxed text-ink-800">{warning.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --- Grandeurs ------------------------------------------------------------- */

/** Grandeur mise en évidence : valeur en gros, unité juste à côté. */
function HeadlineValue({ value }: { value: ResultValue }) {
  return (
    <div className="min-w-0 rounded-lg border border-ink-100 bg-surface-sunken px-4 py-3.5">
      <p className="truncate text-sm text-ink-500" title={value.libelle}>
        {value.libelle}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-[-0.02em] text-ink-900" data-numeric>
          {value.texte}
        </span>
        {value.unite && (
          <span className="text-base font-medium text-ink-500">{value.unite}</span>
        )}
      </p>
    </div>
  );
}

/**
 * Liste de grandeurs secondaires.
 *
 * Une liste de définitions, pas un tableau : deux colonnes alignées suffisent
 * et ne donnent pas l'aspect d'une feuille de calcul.
 */
function ValueList({ values }: { values: ResultValue[] }) {
  return (
    <dl className="flex flex-col">
      {values.map((value, index) => (
        <div
          key={value.champ}
          className={cn(
            'flex items-baseline justify-between gap-6 py-2.5',
            index > 0 && 'border-t border-ink-100',
          )}
        >
          <dt className="min-w-0 text-base text-ink-600">{value.libelle}</dt>
          <dd className="shrink-0 text-base font-medium text-ink-900">
            <span data-numeric>{value.texte}</span>
            {value.unite && <span className="ml-1 font-normal text-ink-500">{value.unite}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* --- Rappel des entrées ---------------------------------------------------- */

function InputRecap({
  module,
  entrees,
}: {
  module: CalculModule | null;
  entrees: Record<string, unknown>;
}) {
  const rows = useMemo(() => {
    const labels = new Map((module?.entrees ?? []).map((field) => [field.champ, field]));
    return Object.entries(entrees).map(([champ, raw]) => {
      const field = labels.get(champ);
      const option = field?.options.find((item) => item.cle === raw);
      return {
        champ,
        libelle: field?.libelle ?? champ,
        unite: field?.unite ?? '',
        texte:
          option?.libelle ??
          (typeof raw === 'number'
            ? formatNumber(raw)
            : typeof raw === 'boolean'
              ? raw
                ? 'Oui'
                : 'Non'
              : String(raw ?? '—')),
      };
    });
  }, [module, entrees]);

  if (rows.length === 0) return null;

  return (
    <details className="group rounded-lg border border-ink-100 bg-surface">
      <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-medium text-ink-700 hover:text-ink-900">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="text-ink-400 transition-transform duration-150 group-open:rotate-90"
          >
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" focusable="false">
              <path
                d="m6 3.5 5 4.5-5 4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Entrées retenues pour ce calcul
        </span>
      </summary>
      <div className="border-t border-ink-100 px-5 py-4">
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.champ} className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0 truncate text-sm text-ink-500" title={row.libelle}>
                {row.libelle}
              </dt>
              <dd className="shrink-0 text-sm text-ink-800">
                <span data-numeric>{row.texte}</span>
                {row.unite && <span className="ml-1 text-ink-500">{row.unite}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

/* --- Le bloc complet ------------------------------------------------------- */

export interface CalculResultsProps {
  module: CalculModule | null;
  resultats: Record<string, unknown>;
  avertissements: CalculWarning[];
  /** Entrées envoyées au serveur, rappelées en bas de l'écran. */
  entrees: Record<string, unknown>;
  engineVersion?: string;
  /** Date de l'archivage, si ce résultat vient de l'historique. */
  calculeLe?: string;
  /** Bouton « Archiver dans le projet », fourni par l'écran appelant. */
  actions?: ReactNode;
  title?: string;
}

export function CalculResults({
  module,
  resultats,
  avertissements,
  entrees,
  engineVersion,
  actions,
  title = 'Résultats',
}: CalculResultsProps) {
  const values = useMemo(() => readResults(resultats, module), [resultats, module]);
  const groups = useMemo(() => groupResults(values), [values]);

  if (values.length === 0 && avertissements.length === 0) {
    return null;
  }

  const [principal, ...secondaires] = groups;

  return (
    <div className="flex flex-col gap-5">
      <WarningPanel warnings={avertissements} />

      {principal && (
        <Card title={title} action={actions}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {principal.valeurs.map((value) => (
              <HeadlineValue key={value.champ} value={value} />
            ))}
          </div>

          {secondaires.map((group) => (
            <div key={group.titre} className="mt-6">
              <h3 className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
                {group.titre}
              </h3>
              <div className="mt-2">
                <ValueList values={group.valeurs} />
              </div>
            </div>
          ))}

          {engineVersion && (
            <p className="mt-6 text-2xs text-ink-400">
              Calculé par le moteur Irrigation Pro, version {engineVersion}.
            </p>
          )}
        </Card>
      )}

      <InputRecap module={module} entrees={entrees} />
    </div>
  );
}
