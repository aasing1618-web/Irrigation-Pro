/**
 * Écran d'échec de configuration.
 *
 * Se déclenche notamment quand l'adresse du serveur n'est pas en « https:// »
 * hors développement local. Le cahier des charges impose « HTTPS partout » :
 * l'application refuse alors de démarrer, plutôt que de communiquer en clair.
 *
 * Cet écran ne propose aucune façon de contourner le contrôle — c'est
 * volontaire. La correction se fait à l'installation, pas par l'utilisateur.
 */

import { BrandMark, LockIcon } from './icons';
import { APP_VERSION } from '../lib/version';

export interface ConfigurationErrorScreenProps {
  /** Message technique — affiché au technicien qui a installé le logiciel. */
  detail: string;
}

export function ConfigurationErrorScreen({ detail }: ConfigurationErrorScreenProps) {
  return (
    <div
      data-surface="dark"
      className="flex h-full flex-col items-center justify-center bg-brand-950 px-6"
    >
      <main className="w-full max-w-[32rem] animate-rise" role="alert">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="text-[3rem] text-brand-400" />
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white">
            Irrigation Pro ne peut pas démarrer
          </h1>
        </div>

        <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-5">
          <div className="flex gap-3.5">
            <span aria-hidden="true" className="mt-0.5 text-[1.25rem] text-warning-on-dark">
              <LockIcon />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-md font-semibold text-white">
                Configuration du logiciel incorrecte
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-200">
                L’installation de ce poste n’est pas conforme aux règles de sécurité
                d’Irrigation&nbsp;Pro. Contactez la personne qui vous a fourni le logiciel :
                la correction se fait en quelques minutes.
              </p>
              <p className="mt-4 select-all rounded-md bg-brand-950/60 px-3 py-2 font-mono text-xs leading-relaxed text-brand-300">
                {detail}
              </p>
            </div>
          </div>
        </div>
      </main>

      <p className="mt-10 text-xs text-brand-400" data-numeric>
        Version {APP_VERSION}
      </p>
    </div>
  );
}
