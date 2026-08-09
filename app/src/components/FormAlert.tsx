/**
 * Message d'erreur ou de confirmation attaché à un formulaire.
 *
 * `role="alert"` : le contenu est annoncé immédiatement aux lecteurs d'écran
 * quand il apparaît. C'est indispensable ici — un utilisateur qui n'a pas vu
 * pourquoi sa connexion a échoué la retente indéfiniment.
 *
 * Le corps du message vient du serveur et est affiché **tel quel** : les
 * libellés du backend sont déjà rédigés en français pour l'utilisateur final
 * (contrat d'API, § 1). Le titre, lui, n'est pas une reformulation : c'est une
 * étiquette de catégorie qui permet de distinguer d'un coup d'œil un simple
 * mot de passe faux d'un compte suspendu ou verrouillé.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type AlertTone = 'danger' | 'warning' | 'success' | 'neutral';

export interface FormAlertProps {
  tone: AlertTone;
  /** Étiquette de catégorie, seulement pour les situations qui sortent de l'ordinaire. */
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const tones: Record<AlertTone, { box: string; icon: string; title: string }> = {
  danger: {
    box: 'border-danger-border bg-danger-soft text-ink-800',
    icon: 'text-danger',
    title: 'text-danger',
  },
  warning: {
    box: 'border-warning-border bg-warning-soft text-ink-800',
    icon: 'text-warning',
    title: 'text-warning',
  },
  success: {
    box: 'border-success-border bg-success-soft text-ink-800',
    icon: 'text-success',
    title: 'text-success',
  },
  neutral: {
    box: 'border-ink-200 bg-ink-50 text-ink-700',
    icon: 'text-ink-500',
    title: 'text-ink-800',
  },
};

export function FormAlert({ tone, title, icon, children, className }: FormAlertProps) {
  const style = tones[tone];

  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-md border px-3.5 py-3 text-sm', style.box, className)}
    >
      {icon && (
        <span aria-hidden="true" className={cn('mt-px text-[1.125rem] leading-none', style.icon)}>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className={cn('font-semibold', style.title)}>{title}</p>}
        <p className={cn('leading-relaxed', title && 'mt-1')}>{children}</p>
      </div>
    </div>
  );
}
