/**
 * L'ossature d'une section de la page.
 *
 * Une seule largeur de contenu pour tout le site, une seule respiration
 * verticale, une seule façon d'écrire un titre de section. C'est ce qui fait
 * qu'une page paraît construite plutôt qu'assemblée bloc par bloc.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Largeur de lecture commune à toutes les sections. */
export function Contenu({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-6 sm:px-8', className)}>{children}</div>;
}

export interface SectionProps {
  id: string;
  titre: string;
  /** Phrase d'introduction sous le titre. */
  chapeau?: string;
  fond?: 'canvas' | 'surface' | 'creux';
  children: ReactNode;
}

const fonds = {
  canvas: 'bg-canvas',
  surface: 'bg-surface',
  creux: 'bg-surface-sunken',
} as const;

export function Section({ id, titre, chapeau, fond = 'canvas', children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className={cn('border-t border-ink-100 py-16 sm:py-20 lg:py-24', fonds[fond])}
    >
      <Contenu>
        <header className="max-w-[58ch]">
          <h2 id={`${id}-titre`} className="text-3xl">
            {titre}
          </h2>
          {chapeau && <p className="mt-4 text-ink-600">{chapeau}</p>}
        </header>
        <div className="mt-10 sm:mt-12">{children}</div>
      </Contenu>
    </section>
  );
}
