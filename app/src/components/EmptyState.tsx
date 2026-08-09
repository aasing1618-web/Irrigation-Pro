/**
 * État vide.
 *
 * Un état vide explique à quoi sert l'écran ; il ne se contente pas d'annoncer
 * qu'il n'y a rien. En Vague 0, la plupart des écrans sont vides par
 * construction : c'est ce composant qui porte la promesse du produit.
 *
 * Il est toujours posé DANS une carte, jamais dans une seconde boîte : pas de
 * fond, pas de bordure, pas d'ombre propres. La carte fournit déjà la surface.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  /** Une à deux phrases : ce que l'écran fera, dit simplement. */
  description: string;
  /** Mention discrète du type « Disponible prochainement ». */
  note?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  note,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
    >
      <span
        className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-[1.375rem] text-brand-600"
        aria-hidden="true"
      >
        {icon}
      </span>

      <h3 className="mt-4 text-md font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 max-w-[46ch] text-balance text-sm leading-relaxed text-ink-500">
        {description}
      </p>

      {note && (
        <p className="mt-4 text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
          {note}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
