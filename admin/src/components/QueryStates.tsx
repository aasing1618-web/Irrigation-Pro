/**
 * Les deux moments où un écran n'a pas encore ses données : il charge, ou il a
 * échoué.
 *
 * Traités une fois pour toutes ici, parce qu'ils reviennent sur chaque écran et
 * qu'ils doivent se ressembler partout. Un chargement dessine la forme de ce
 * qui va arriver plutôt qu'un rond qui tourne.
 *
 * Le message d'erreur affiché vient du serveur, **tel quel** — c'est
 * particulièrement important ici : un `409 ACTION_IMPOSSIBLE` explique pourquoi
 * le refus (« ce compte est le dernier administrateur actif… »), et le
 * reformuler ferait perdre l'explication.
 */

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { AlertIcon, DisconnectedIcon, RetryIcon } from './icons';
import type { ApiError } from '../lib/api';
import { cn } from '../lib/cn';

export interface LoadingRowsProps {
  /** Nombre de lignes fantômes ; caler sur la densité réelle de l'écran. */
  rows?: number;
  label?: string;
  className?: string;
}

export function LoadingRows({
  rows = 3,
  label = 'Chargement en cours',
  className,
}: LoadingRowsProps) {
  return (
    <div role="status" aria-busy="true" className={cn('flex flex-col', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={cn(
            'flex items-center gap-4 px-5 py-4',
            index > 0 && 'border-t border-ink-100',
          )}
        >
          <div className="h-3.5 w-2/5 rounded-xs bg-ink-100 animate-pulse-soft" />
          <div className="h-3 w-1/5 rounded-xs bg-ink-50 animate-pulse-soft" />
          <div className="ml-auto h-5 w-20 rounded-full bg-ink-50 animate-pulse-soft" />
        </div>
      ))}
    </div>
  );
}

export interface QueryErrorProps {
  error: ApiError;
  onRetry?: () => void;
  /** Ce que le propriétaire essayait d'obtenir : « les comptes », « ce compte ». */
  subject: string;
}

export function QueryError({ error, onRetry, subject }: QueryErrorProps) {
  const offline = error.isNetworkError;

  return (
    <div className="px-6 py-10">
      <EmptyState
        icon={offline ? <DisconnectedIcon /> : <AlertIcon />}
        title={offline ? 'Le serveur ne répond pas' : `Impossible d’afficher ${subject}`}
        description={error.message}
        action={
          onRetry && (
            <Button variant="secondary" size="sm" icon={<RetryIcon />} onClick={onRetry}>
              Réessayer
            </Button>
          )
        }
      />
      {error.requestId && (
        <p className="mt-4 text-center text-2xs text-ink-400" data-numeric>
          Référence de l’incident : {error.requestId}
        </p>
      )}
    </div>
  );
}
