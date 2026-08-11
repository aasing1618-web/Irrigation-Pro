/**
 * Point d'entrée du dashboard d'administration.
 *
 * Monte React, le routeur et le cache de requêtes. Aucune logique métier ici.
 *
 * `HashRouter` et non `BrowserRouter` : le dashboard est une application de
 * fichiers statiques, susceptible d'être servie depuis n'importe quel
 * hébergement — y compris un qui ne sait pas réécrire les URL. Le routage par
 * fragment (`#/comptes/…`) fonctionne partout, sans configuration serveur.
 * C'est le même choix que dans l'application cliente.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';

import { App } from './App';
import './styles/index.css';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Une seule reprise : au-delà, le propriétaire préfère voir l'erreur et
      // décider lui-même plutôt que d'attendre devant un écran qui charge.
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      // Aucune reprise automatique sur une action d'administration : rejouer
      // une suspension ou une réinitialisation de mot de passe n'est jamais
      // anodin. C'est au propriétaire de recommencer s'il le veut.
      retry: 0,
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error("L'élément racine #root est introuvable dans index.html.");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
