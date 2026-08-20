#!/usr/bin/env bash
#
# Compilation complète, telle que l'hébergeur l'exécute.
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │  LE PIÈGE QUI A FAIT ÉCHOUER LE PREMIER DÉPLOIEMENT                       │
# └──────────────────────────────────────────────────────────────────────────┘
#
# `NODE_ENV=production` est posé chez l'hébergeur pour l'exécution. Or cette
# variable vaut AUSSI pendant la compilation, et dans ce cas `npm install`
# ignore purement et simplement les `devDependencies`.
#
# Sauf que TypeScript et Vite SONT des `devDependencies` : ce sont des outils
# de compilation, ils n'ont rien à faire dans le paquet livré. Résultat, la
# compilation s'arrêtait sur « tsc: not found » avant d'avoir produit quoi que
# ce soit. Mesuré : `NODE_ENV=production npm install` retire 101 paquets.
#
# D'où `--include=dev`, explicite et non négociable ci-dessous. Ne pas le
# retirer « pour alléger » : c'est la compilation entière qui tomberait.
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │  POURQUOI `npm ci` ET NON `npm install`                                   │
# └──────────────────────────────────────────────────────────────────────────┘
#
# `npm ci` installe exactement ce que décrit `package-lock.json`, sans jamais
# le modifier. Deux compilations du même commit produisent donc rigoureusement
# le même résultat. `npm install` peut, lui, faire glisser une version au
# passage — et livrer en production un code qui n'a jamais été testé.

set -euo pipefail

# Sans cela, une erreur au milieu d'un `cd` laisserait le script continuer dans
# le mauvais dossier. On part toujours de la racine du dépôt.
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

construire() {
  local dossier="$1"
  local role="$2"

  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  $role  ($dossier)"
  echo "══════════════════════════════════════════════════════════════"

  cd "$RACINE/$dossier"
  npm ci --include=dev
  npm run build
  cd "$RACINE"
}

construire backend "Serveur, moteur de calcul et rapports"
construire app     "Logiciel client"
construire admin   "Tableau de bord du propriétaire"

# Contrôle final : mieux vaut échouer ici, avec un message clair, que démarrer
# un serveur qui répondra 404 sur toutes les pages sans qu'on comprenne
# pourquoi.
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Vérification de ce qui a été produit"
echo "══════════════════════════════════════════════════════════════"

manquant=0
for attendu in \
  "backend/dist/server.js" \
  "app/dist/index.html" \
  "admin/dist/index.html"
do
  if [ -f "$RACINE/$attendu" ]; then
    echo "  ✓ $attendu"
  else
    echo "  ✗ $attendu — MANQUANT"
    manquant=1
  fi
done

if [ "$manquant" -ne 0 ]; then
  echo ""
  echo "La compilation est incomplète : le serveur ne pourrait pas servir les"
  echo "interfaces. On s'arrête ici plutôt que de déployer un produit cassé."
  exit 1
fi

echo ""
echo "Compilation terminée."
