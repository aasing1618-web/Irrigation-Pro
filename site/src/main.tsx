/**
 * Point d'entrée du site vitrine.
 *
 * Monte React et rien d'autre : ni routeur, ni cache de requêtes, ni client
 * d'API. Le site est un ensemble de fichiers statiques qui ne parle à aucun
 * serveur.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/index.css';

const conteneur = document.getElementById('root');
if (!conteneur) {
  throw new Error("L'élément racine #root est introuvable dans index.html.");
}

createRoot(conteneur).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
