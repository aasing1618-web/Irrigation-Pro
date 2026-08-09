/**
 * Écran de démarrage.
 *
 * C'est le premier écran que voit l'utilisateur au lancement du logiciel, le
 * temps que l'application vérifie qu'elle peut parler au serveur. Il présente
 * trois issues et rien d'autre : liaison établie, serveur injoignable, serveur
 * en mode dégradé.
 *
 * Règle : aucune trace technique à l'écran (code HTTP, URL, pile d'appels).
 * Le détail part dans la console du développeur, via `lib/api.ts`.
 */

import type { ReactNode } from 'react';
import { Button } from './Button';
import { AlertIcon, BrandMark, DisconnectedIcon, RetryIcon } from './icons';
import { cn } from '../lib/cn';
import { APP_VERSION } from '../lib/version';
import type { ConnectionState } from '../hooks/useHealth';

export interface StartupScreenProps {
  state: Exclude<ConnectionState, { kind: 'online' }>;
  onRetry: () => void;
  isRetrying: boolean;
}

export function StartupScreen({ state, onRetry, isRetrying }: StartupScreenProps) {
  return (
    <div
      data-surface="dark"
      className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-brand-950 px-6"
    >
      {/* Halo unique et sourd derrière la marque : donne de la profondeur à un
          fond plat sans devenir un dégradé décoratif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[38%] size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
        style={{
          background:
            'radial-gradient(circle, var(--color-brand-900) 0%, transparent 68%)',
        }}
      />

      <main className="relative w-full max-w-[30rem] animate-rise">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="text-[3rem] text-brand-300" />
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white">
            Irrigation Pro
          </h1>
          <p className="mt-1.5 text-sm text-brand-300">
            Dimensionnement et suivi des projets d’irrigation
          </p>
        </div>

        <div className="mt-10">
          <StatusPanel state={state} onRetry={onRetry} isRetrying={isRetrying} />
        </div>
      </main>

      <p className="relative mt-10 text-xs text-brand-400" data-numeric>
        Version {APP_VERSION}
      </p>
    </div>
  );
}

function StatusPanel({ state, onRetry, isRetrying }: StartupScreenProps) {
  if (state.kind === 'checking') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-3 rounded-lg border border-white/8 bg-white/4 px-5 py-4"
      >
        <ConnectingDots />
        <p className="text-base text-brand-200">Connexion au serveur…</p>
      </div>
    );
  }

  const isOffline = state.kind === 'offline';

  return (
    <div
      role="alert"
      className="rounded-lg border border-white/10 bg-white/5 p-5 text-left"
    >
      <div className="flex gap-3.5">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 text-[1.25rem] leading-none',
            isOffline ? 'text-danger-on-dark' : 'text-warning-on-dark',
          )}
        >
          {isOffline ? <DisconnectedIcon /> : <AlertIcon />}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-md font-semibold text-white">
            {isOffline ? 'Serveur injoignable' : 'Service momentanément réduit'}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-brand-200">{state.message}</p>

          <ul className="mt-4 space-y-1.5 text-sm text-brand-300">
            {isOffline ? (
              <>
                <Hint>Vérifiez que votre ordinateur est bien connecté à internet.</Hint>
                <Hint>
                  Si le problème persiste, contactez votre interlocuteur Irrigation&nbsp;Pro.
                </Hint>
              </>
            ) : (
              <Hint>
                Vous pouvez réessayer dans quelques minutes : l’interruption est
                généralement brève.
              </Hint>
            )}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              variant="onDark"
              size="sm"
              icon={<RetryIcon />}
              onClick={onRetry}
              loading={isRetrying}
              loadingLabel="Nouvelle tentative de connexion en cours"
            >
              Réessayer
            </Button>

            {/* Référence de l'incident : le seul élément « technique » montré,
                parce que c'est ce que le support demandera. Sélectionnable. */}
            {state.requestId && (
              <p className="text-2xs text-brand-400">
                Référence&nbsp;:{' '}
                <span className="select-all font-mono text-brand-300" data-numeric>
                  {state.requestId}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className="mt-[0.5em] size-1 shrink-0 rounded-full bg-brand-500" />
      <span>{children}</span>
    </li>
  );
}

/** Trois points qui s'allument en cascade — l'attente, sans tourniquet. */
function ConnectingDots() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
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
