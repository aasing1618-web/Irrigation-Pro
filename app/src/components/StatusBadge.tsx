/**
 * Pastille d'état.
 *
 * La couleur ne porte jamais l'information seule : chaque variante a aussi une
 * forme de pastille distincte et un libellé écrit. Un utilisateur daltonien lit
 * la même chose que les autres.
 */

import { cn } from '../lib/cn';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'pending';

export interface StatusBadgeProps {
  tone: StatusTone;
  children: string;
  className?: string;
}

const tones: Record<StatusTone, { wrapper: string; dot: string }> = {
  success: {
    wrapper: 'bg-success-soft text-success border-success-border',
    dot: 'bg-success',
  },
  warning: {
    wrapper: 'bg-warning-soft text-warning border-warning-border',
    dot: 'bg-warning',
  },
  danger: {
    wrapper: 'bg-danger-soft text-danger border-danger-border',
    dot: 'bg-danger',
  },
  neutral: {
    wrapper: 'bg-ink-50 text-ink-600 border-ink-200',
    dot: 'bg-ink-400',
  },
  pending: {
    wrapper: 'bg-info-soft text-info border-info-border',
    dot: 'bg-brand-500 animate-pulse-soft',
  },
};

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  const style = tones[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-xs font-medium tracking-[0.005em]',
        style.wrapper,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', style.dot)} aria-hidden="true" />
      {children}
    </span>
  );
}
