/**
 * Branche la surveillance de version (voir `lib/update-check.ts`) sur le cycle
 * de vie de la coque de l'application.
 *
 * Toute la règle d'affichage tient ici, et elle est courte : on annonce la
 * version publiée tant qu'elle diffère de celle qui tourne **et** que
 * l'utilisateur n'a pas fermé le bandeau pour cette version-là. Fermer, c'est
 * dire « je sais, plus tard » — pas « ne me le dis plus jamais » : une version
 * encore plus récente rouvrira le bandeau.
 */

import { useCallback, useEffect, useState } from 'react';
import { startUpdateWatch, type UpdateWatchOptions } from '../lib/update-check';

export interface UpdateNotice {
  /** Version publiée à annoncer, ou `null` s'il n'y a rien à dire. */
  version: string | null;
  /** Referme le bandeau pour cette version. */
  dismiss: () => void;
}

export function useUpdateCheck(options: UpdateWatchOptions = {}): UpdateNotice {
  const [available, setAvailable] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { enabled, currentVersion } = options;

  useEffect(
    () => startUpdateWatch(setAvailable, { enabled, currentVersion }),
    [enabled, currentVersion],
  );

  const dismiss = useCallback(() => setDismissed(available), [available]);

  return {
    version: available !== null && available !== dismissed ? available : null,
    dismiss,
  };
}
