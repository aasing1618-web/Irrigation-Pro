/**
 * Point d'entrée de l'application.
 *
 * Monte React, le routeur et le cache de requêtes. Rien de métier ici.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';

import { App } from './App';
import './styles/index.css';

/**
 * `HashRouter` et non `BrowserRouter` : l'application est servie depuis des
 * fichiers locaux par la coque Tauri, sans serveur capable de réécrire les
 * URL. Le routage par fragment fonctionne dans les deux cas.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
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
