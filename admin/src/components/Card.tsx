/**
 * Panneau de contenu.
 *
 * Élévation déclarée une seule fois : une bordure fine OU une ombre, jamais les
 * deux au même niveau d'intensité. Pas de carte dans une carte.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps {
  /** Titre du panneau ; rendu en <h2>. */
  title?: string;
  /** Phrase d'explication sous le titre. */
  description?: string;
  /** Zone d'action alignée à droite de l'en-tête. */
  action?: ReactNode;
  /** Retire le rembourrage interne du corps (tableaux, listes pleine largeur). */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, description, action, flush, className, children }: CardProps) {
  const hasHeader = Boolean(title || description || action);

  return (
    <section
      className={cn(
        'rounded-lg border border-ink-100 bg-surface shadow-subtle',
        className,
      )}
    >
      {hasHeader && (
        // Un <div> et non un <header> : l'en-tête d'une carte n'est pas un
        // repère de navigation, il ne doit pas polluer les lecteurs d'écran.
        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold text-ink-900">{title}</h2>}
            {description && (
              <p className="mt-1 max-w-[68ch] text-sm text-ink-500">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children && (
        <div className={cn(hasHeader && 'border-t border-ink-100', !flush && 'p-5')}>
          {children}
        </div>
      )}
    </section>
  );
}
