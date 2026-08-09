/**
 * En-tête d'écran : le titre de la page et sa phrase d'intention.
 *
 * Un seul <h1> par écran, toujours au même endroit, toujours à la même taille.
 */

import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-7">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>
        <p className="mt-1.5 max-w-[70ch] text-base text-ink-500">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
