/**
 * Retarde la propagation d'une valeur qui change vite.
 *
 * Utilisé par le champ de recherche : sans cela, chaque lettre tapée
 * déclencherait une requête au serveur. 250 ms est assez court pour paraître
 * instantané et assez long pour qu'une frappe normale ne parte qu'une fois.
 */

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
