/**
 * Fond des écrans « avant l'application » : démarrage, connexion, changement
 * de mot de passe obligatoire, reprise de session.
 *
 * Ces quatre écrans occupent toute la fenêtre et partagent la même scène :
 * fond sombre de marque, halo unique et sourd, numéro de version en pied.
 * L'utilisateur passe de l'un à l'autre sans rupture visuelle — c'est ce qui
 * fait qu'un lancement de logiciel paraît continu plutôt que saccadé.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { APP_VERSION } from '../lib/version';
import { BrandMark } from './icons';
import DiagonalMarqueeCarousel from './ui/great-ui-diagonal-marquee-carousel';
import { ShaderBackground } from './ui/oceanic-currents';
import { HandwritingSvg } from './ui/handwriting-svg';

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
      className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-brand-950 px-6 py-10"
    >
      {/* Fond WebGL Shader de courants d'eau fluides ("vue mer / oceanic currents") */}
      <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-screen">
        <ShaderBackground className="size-full" />
      </div>

      {/* Carrousel diagonal animé d'installations hydrauliques & agricoles - HAUTE VISIBILITÉ */}
      <div className="pointer-events-none absolute inset-0 opacity-55 transition-opacity duration-1000">
        <DiagonalMarqueeCarousel angle={-15} baseSpeed={75} />
      </div>

      {/* Voile de lisibilité & dégradé lumineux de marque avec effet dépoli */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-950/75 via-brand-950/45 to-brand-950/85 backdrop-blur-[2px]"
      />

      {/* Halo émeraude éclatant derrière la marque : apporte une vraie lumière agronomique */}
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
        Version {APP_VERSION}
      </p>
    </div>
  );
}

/**
 * Trois points qui s'allument en cascade — l'attente, sans tourniquet.
 * Partagé par tous les écrans de la scène sombre.
 */
export function WaitingDots({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex items-center gap-1', className)}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 rounded-full bg-brand-300 animate-pulse-soft"
          style={{ animationDelay: `${index * 0.18}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Bloc de marque : la goutte, le nom du produit, la phrase d'intention.
 *
 * `as` permet de le rendre en `<h1>` sur l'écran de démarrage (où il est le
 * titre de l'écran) et en simple bloc sur l'écran de connexion (où le titre est
 * « Connexion »). Un seul `<h1>` par écran, toujours.
 */
export function BrandLockup({
  as = 'heading',
  tagline = 'Dimensionnement et suivi des projets d’irrigation',
  compact = false,
}: {
  as?: 'heading' | 'plain';
  tagline?: string | null;
  compact?: boolean;
}) {
  const name = compact ? 'text-lg' : 'text-2xl';

  return (
    <div className="flex flex-col items-center text-center">
      <BrandGlyph compact={compact} />
      {as === 'heading' ? (
        <h1 className={cn('mt-5 font-semibold tracking-[-0.02em] text-white', name)}>
          Irrigation Pro
        </h1>
      ) : (
        <p className={cn('mt-3 font-semibold tracking-[-0.02em] text-white', name)}>
          Irrigation Pro
        </p>
      )}
      <HandwritingSvg
        text="Hydraulique & Agronomie"
        width={220}
        height={32}
        fontSize={22}
        strokeWidth={1.5}
        duration={2.2}
        className="mt-1 text-emerald-400 opacity-90"
      />
      {tagline && <p className="mt-1.5 text-sm text-brand-300">{tagline}</p>}
    </div>
  );
}

function BrandGlyph({ compact }: { compact: boolean }) {
  return (
    <span className={cn('text-brand-300', compact ? 'text-[2rem]' : 'text-[3rem]')}>
      <BrandMark />
    </span>
  );
}
