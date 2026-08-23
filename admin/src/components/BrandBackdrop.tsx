/**
 * Fond des écrans « avant le dashboard » : connexion, changement de mot de
 * passe obligatoire, configuration invalide.
 *
 * Même scène que dans l'application cliente — fond sombre de marque, halo
 * unique et sourd, version en pied. Le propriétaire doit reconnaître son
 * produit avant même d'avoir lu un mot.
 *
 * La seule différence assumée : une mention « Administration », pour qu'on ne
 * confonde pas cet écran avec celui qu'utilisent les clients.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { ADMIN_VERSION } from '../lib/version';
import { BrandMark } from './icons';

export interface BrandBackdropProps {
  children: ReactNode;
  /** Largeur du bloc central. */
  width?: 'sm' | 'md';
  className?: string;
}

const widths = {
  sm: 'max-w-[25rem]',
  md: 'max-w-[30rem]',
};

export function BrandBackdrop({ children, width = 'md', className }: BrandBackdropProps) {
  return (
    <div
      data-surface="dark"
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-brand-950 px-6 py-10"
    >
      {/* Un asperseur au travail, très voilé.
          Volontairement une autre image que celle de l'application cliente :
          les deux interfaces partagent la même scène, mais le propriétaire doit
          voir au premier coup d'œil qu'il n'est pas sur l'écran de ses clients.
          C'est la mention « Administration » en pied qui le dit, et cette photo
          qui le confirme sans avoir à lire. */}
      <img
        src="/photos/asperseur-rampe.jpg"
        alt=""
        aria-hidden="true"
        width={736}
        height={736}
        decoding="async"
        className="pointer-events-none absolute inset-0 size-full object-cover filter brightness-110 contrast-105 opacity-60"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-950/75 via-brand-950/45 to-brand-950/85 backdrop-blur-[2px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[38%] size-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 filter blur-2xl"
        style={{
          background: 'radial-gradient(circle, var(--color-brand-600) 0%, transparent 65%)',
        }}
      />

      <main className={cn('relative z-20 w-full animate-rise', widths[width], className)}>
        {children}
      </main>

      <p className="relative z-20 mt-10 text-xs font-medium text-emerald-300 drop-shadow" data-numeric>
        Administration · Version {ADMIN_VERSION}
      </p>
    </div>
  );
}

/**
 * Bloc de marque : la goutte, le nom du produit, la mention d'espace.
 *
 * `as` permet de le rendre en `<h1>` là où il est le titre de l'écran, et en
 * simple bloc là où le titre est « Connexion ». Un seul `<h1>` par écran.
 */
export function BrandLockup({
  as = 'heading',
  tagline = 'Espace d’administration',
  compact = false,
}: {
  as?: 'heading' | 'plain';
  tagline?: string | null;
  compact?: boolean;
}) {
  const name = compact ? 'text-lg' : 'text-2xl';

  return (
    <div className="flex flex-col items-center text-center">
      <span className={cn('text-brand-300', compact ? 'text-[2rem]' : 'text-[3rem]')}>
        <BrandMark />
      </span>
      {as === 'heading' ? (
        <h1 className={cn('mt-5 font-semibold tracking-[-0.02em] text-white', name)}>
          Irrigation Pro
        </h1>
      ) : (
        <p className={cn('mt-3 font-semibold tracking-[-0.02em] text-white', name)}>
          Irrigation Pro
        </p>
      )}
      {tagline && <p className="mt-1.5 text-sm text-brand-300">{tagline}</p>}
    </div>
  );
}
