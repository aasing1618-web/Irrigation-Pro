/**
 * Bouton du produit — un seul composant, donc une seule forme de bouton dans
 * toute l'application. Tous les états sont couverts : repos, survol, focus
 * clavier, appui, désactivé, chargement.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'onDark';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Icône affichée avant le libellé. */
  icon?: ReactNode;
  /** Affiche l'état d'attente et neutralise le bouton. */
  loading?: boolean;
  /** Libellé lu par les lecteurs d'écran pendant le chargement. */
  loadingLabel?: string;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-quart ' +
  'select-none whitespace-nowrap active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-55';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-subtle hover:bg-brand-700 active:bg-brand-800 ' +
    'border border-brand-700/60',
  secondary:
    'bg-surface text-ink-800 border border-ink-200 shadow-subtle ' +
    'hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-50 hover:text-ink-900 active:bg-ink-100',
  onDark:
    'bg-white/10 text-brand-50 border border-white/15 hover:bg-white/16 active:bg-white/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  loadingLabel = 'Chargement en cours',
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      {...props}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {loading ? (
        <Spinner />
      ) : icon ? (
        <span className="text-[1.15em] leading-none" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
      {loading ? <span className="sr-only">{loadingLabel}</span> : null}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className="text-[1.15em] animate-spin"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.28" />
      <path
        d="M8 1.75A6.25 6.25 0 0 1 14.25 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
