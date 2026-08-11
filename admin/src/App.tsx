/**
 * Racine du dashboard d'administration.
 *
 * Trois barrages successifs, dans cet ordre — le suivant n'est même pas rendu
 * tant que le précédent n'est pas franchi :
 *   1. configuration valide (HTTPS obligatoire hors développement local) ;
 *   2. session en règle : connexion, puis changement de mot de passe si le
 *      serveur l'exige — c'est `SessionGate` ;
 *   3. le dashboard lui-même.
 *
 * Il n'y a pas d'écran de démarrage « liaison au serveur » comme dans
 * l'application cliente : le propriétaire ouvre son navigateur pour une action
 * précise (créer un compte, en suspendre un). Le faire patienter devant un
 * contrôle de santé préalable ne lui apprendrait rien qu'un échec de connexion
 * ne lui dira pas trois secondes plus tard.
 */

import { useState } from 'react';
import { Route, Routes } from 'react-router';

import { AuthProvider } from './auth/AuthProvider';
import { SessionGate } from './auth/SessionGate';
import { AdminShell } from './components/AdminShell';
import { ConfigurationErrorScreen } from './components/ConfigurationErrorScreen';
import { ConfigurationError, getConfig } from './lib/config';

import { Accueil } from './routes/Accueil';
import { Comptes } from './routes/Comptes';
import { FicheCompte } from './routes/FicheCompte';
import { NotFound } from './routes/NotFound';

export function App() {
  const configError = useConfigurationCheck();

  // Configuration invalide : aucun appel réseau ne doit être tenté.
  if (configError) {
    return <ConfigurationErrorScreen detail={configError} />;
  }

  return (
    <AuthProvider>
      <SessionGate>
        <AdminRoutes />
      </SessionGate>
    </AuthProvider>
  );
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

/**
 * Le plan du dashboard. Volontairement court : trois écrans, pas plus.
 *
 * Il n'y a **aucune** route vers les projets, les calculs ou les rapports d'un
 * client — l'API n'en offre aucune, délibérément.
 */
export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<Accueil />} />
        <Route path="comptes" element={<Comptes />} />
        <Route path="comptes/:compteId" element={<FicheCompte />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
