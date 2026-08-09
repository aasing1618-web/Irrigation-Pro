/**
 * Racine de l'application.
 *
 * Deux responsabilités, et rien d'autre :
 *   1. vérifier que le logiciel est correctement configuré (HTTPS obligatoire) ;
 *   2. établir la liaison avec le serveur avant de laisser entrer l'utilisateur.
 *
 * Pas d'authentification ici : elle arrive en Vague 1 et viendra s'insérer
 * entre l'écran de démarrage et la coque applicative.
 */

import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';

import { AppShell } from './components/AppShell';
import { ConfigurationErrorScreen } from './components/ConfigurationErrorScreen';
import { StartupScreen } from './components/StartupScreen';
import { useHealth } from './hooks/useHealth';
import { ConfigurationError, getConfig } from './lib/config';

import { Calculations } from './routes/Calculations';
import { Dashboard } from './routes/Dashboard';
import { NotFound } from './routes/NotFound';
import { Projects } from './routes/Projects';
import { Reports } from './routes/Reports';
import { Settings } from './routes/Settings';

export function App() {
  const configError = useConfigurationCheck();

  // Si la configuration est invalide, aucun appel réseau ne doit être tenté.
  if (configError) {
    return <ConfigurationErrorScreen detail={configError} />;
  }

  return <ConnectedApp />;
}

/** Valide la configuration une seule fois, au premier rendu. */
function useConfigurationCheck(): string | null {
  const [error] = useState<string | null>(() => {
    try {
      getConfig();
      return null;
    } catch (cause) {
      if (cause instanceof ConfigurationError) {
        console.error('[config] démarrage refusé', cause);
        return cause.message;
      }
      throw cause;
    }
  });

  return error;
}

function ConnectedApp() {
  const { state, retry, isRetrying } = useHealth();

  /**
   * Une fois la liaison établie, l'utilisateur reste dans l'application même si
   * le serveur se dégrade ensuite : on ne le renvoie pas sur l'écran de
   * démarrage au milieu de son travail. L'en-tête signale alors l'incident.
   */
  const [hasConnected, setHasConnected] = useState(false);
  useEffect(() => {
    if (state.kind === 'online') setHasConnected(true);
  }, [state.kind]);

  if (!hasConnected && state.kind !== 'online') {
    return <StartupScreen state={state} onRetry={retry} isRetrying={isRetrying} />;
  }

  return (
    <Routes>
      <Route element={<AppShell connection={state} />}>
        <Route
          index
          element={
            <Dashboard connection={state} onRefresh={retry} isRefreshing={isRetrying} />
          }
        />
        <Route path="projets" element={<Projects />} />
        <Route path="calculs" element={<Calculations />} />
        <Route path="rapports" element={<Reports />} />
        <Route path="parametres" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
