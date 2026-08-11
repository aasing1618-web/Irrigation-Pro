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
      {/* La scène du produit : pompage vers un canal en terre.
          C'est la même image que l'ouverture du site vitrine, et ce n'est pas
          un hasard — le client qui a découvert Irrigation Pro sur le web
          retrouve exactement ce qu'il a vu au moment de se connecter.

          Très voilée, pour deux raisons. D'abord parce que ces écrans sont des
          écrans de travail : ce sont les champs de saisie qui doivent attirer
          l'œil, pas le décor. Ensuite parce que le fichier fait 736 px de
          large — nette et plein cadre, la photo serait floue sur un grand
          écran. Voilée, sa douceur devient une texture. */}
      <img
        src="/photos/canal-pompage.jpg"
        alt=""
        aria-hidden="true"
        width={736}
        height={414}
        decoding="async"
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.13]"
      />

      {/* Voile de lisibilité : sans lui, le ciel clair de la photo passerait
          sous le texte blanc et le contraste tomberait sous le seuil lisible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, var(--color-brand-950) 0%, transparent 40%, var(--color-brand-950) 100%)',
        }}
      />

      {/* Halo unique et sourd derrière la marque : donne de la profondeur à un
          fond plat sans devenir un dégradé décoratif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[38%] size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
        style={{
          background: 'radial-gradient(circle, var(--color-brand-900) 0%, transparent 68%)',
        }}
      />

      <main className={cn('relative w-full animate-rise', widths[width], className)}>
        {children}
      </main>

      <p className="relative mt-10 text-xs text-brand-400" data-numeric>
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
