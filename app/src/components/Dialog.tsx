/**
 * Fenêtre modale : création d'un projet, modification, confirmation de
 * suppression.
 *
 * Ce que ce composant garantit, et qu'une simple `<div>` posée par-dessus
 * l'écran ne garantit pas :
 *   - `role="dialog"` + `aria-modal` : un lecteur d'écran annonce qu'on entre
 *     dans une fenêtre et cesse de lire ce qu'il y a derrière ;
 *   - le focus entre dans la fenêtre à l'ouverture et **revient d'où il
 *     venait** à la fermeture — sans quoi la tabulation repart du haut de la
 *     page, ce qui perd un utilisateur au clavier ;
 *   - `Échap` ferme, et la tabulation tourne en boucle à l'intérieur ;
 *   - le titre est relié par `aria-labelledby`.
 *
 * Il n'y a pas de portail React : la fenêtre est rendue là où elle est
 * déclarée, avec un empilement suffisant. Une application de bureau n'a pas de
 * contexte d'empilement compliqué à gérer.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DialogProps {
  open: boolean;
  title: string;
  /** Phrase d'explication sous le titre. */
  description?: string;
  onClose: () => void;
  /** Zone d'actions en bas, alignée à droite. */
  footer?: ReactNode;
  /** Largeur : `md` pour un formulaire, `sm` pour une confirmation. */
  width?: 'sm' | 'md';
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  description,
  onClose,
  footer,
  width = 'md',
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Entrée dans la fenêtre : on mémorise d'où l'on vient, puis on place le
  // focus sur le premier élément utile (souvent le premier champ).
  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    return () => {
      returnFocusTo.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6 sm:p-10">
      {/* Voile : cliquer à côté ferme, comme partout ailleurs sous Windows. */}
      <div
        className="fixed inset-0 bg-ink-900/40"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative my-auto w-full rounded-xl border border-ink-100 bg-surface shadow-overlay',
          'animate-rise',
          width === 'sm' ? 'max-w-md' : 'max-w-xl',
        )}
      >
        <div className="px-6 pb-4 pt-5">
          <h2 id={titleId} className="text-lg font-semibold text-ink-900">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-ink-500">
              {description}
            </p>
          )}
        </div>

        <div className="border-t border-ink-100 px-6 py-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-ink-100 bg-surface-sunken px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
