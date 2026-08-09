# `app/` — l'application Irrigation Pro

Ce dossier contient **le logiciel que le client installe sur son ordinateur** :
tout ce qu'il voit et manipule à l'écran.

Les trois autres dossiers du projet ont chacun leur rôle et ne se mélangent pas
avec celui-ci : `backend/` (le serveur et les calculs), `admin/` (le tableau de
bord du propriétaire), `site/` (le site vitrine public).

## Ce que fait l'application aujourd'hui (Vague 0)

- Elle démarre et vérifie qu'elle arrive à joindre le serveur Irrigation Pro.
- Elle affiche clairement le résultat : liaison établie, serveur injoignable, ou
  service momentanément réduit — avec un bouton **Réessayer**.
- Elle présente la coque du logiciel : navigation, tableau de bord, et les
  écrans à venir (Projets, Calculs, Rapports, Paramètres) annoncés par un
  message « Disponible prochainement ».
- Elle affiche son numéro de version en bas de la barre de navigation.

**Il n'y a pas encore de connexion par identifiants** (c'est la Vague 1), ni de
projets, ni de calculs (Vague 2). C'est normal et prévu.

Tous les calculs d'irrigation sont réalisés **par le serveur**, jamais par
l'application. C'est ce qui protège le savoir-faire du produit : même en
examinant le logiciel installé, on n'y trouve aucune formule.

---

## Travailler sur l'interface au quotidien

Il faut avoir **Node.js** installé (version 20 ou plus récente).

La première fois, depuis ce dossier `app/` :

```bash
npm install
```

Puis, pour lancer l'interface :

```bash
npm run dev
```

L'interface s'ouvre dans le navigateur à l'adresse <http://localhost:5173>.
Elle se met à jour toute seule à chaque modification du code.

C'est la façon normale de développer et de montrer l'interface : **elle ne
nécessite rien d'autre**. On travaille dans le navigateur, exactement comme dans
la vraie fenêtre du logiciel.

### Indiquer où se trouve le serveur

Copiez le fichier `.env.example` en `.env` et ajustez l'adresse si besoin :

```
VITE_API_URL=http://localhost:4000
```

> **Règle de sécurité :** en dehors du développement sur votre propre machine,
> cette adresse **doit** commencer par `https://`. Si ce n'est pas le cas,
> l'application refuse de démarrer et affiche un message d'erreur explicite.
> C'est volontaire : aucune donnée client ne doit circuler en clair.

---

## Vérifier que tout fonctionne

```bash
npm test          # les tests automatiques
npm run typecheck # cohérence du code
npm run build     # fabrique la version optimisée de l'interface
```

Les tests simulent le serveur : **ils fonctionnent même si le backend n'est pas
démarré**.

---

## Produire le fichier `.exe` pour Windows

C'est l'étape qui transforme l'interface en **vrai logiciel installable**, celui
que vous enverrez aux clients par WhatsApp.

### ⚠️ Ce n'est pas encore possible sur cet ordinateur

Deux outils gratuits manquent sur le poste. Ils ne servent qu'à fabriquer le
`.exe` : ils ne sont pas nécessaires pour développer ou montrer l'interface.

**1. Rust** — le moteur qui construit l'application

- Téléchargement : <https://rustup.rs>
- Lancez le programme, acceptez l'installation par défaut (touche `1`).
- Environ 5 minutes.

**2. Visual Studio Build Tools** — les outils de compilation de Microsoft

- Téléchargement :
  <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
- À l'installation, cochez **« Développement Desktop en C++ »**.
- Environ 15 minutes et 6 Go d'espace disque.

Redémarrez l'ordinateur après ces deux installations.

**3. Une icône** — voir `src-tauri/icons/README.md`

Il faut fournir un visuel carré de 1024 × 1024 pixels. Tant qu'il manque, la
fabrication du `.exe` s'arrête sur une erreur d'icône.

### Une fois les outils installés

```bash
npm run tauri:dev    # ouvre le logiciel dans une vraie fenêtre Windows
npm run tauri:build  # fabrique l'installateur .exe
```

L'installateur apparaît dans :
`src-tauri/target/release/bundle/nsis/`

Pour vérifier à tout moment ce qui manque encore sur le poste :

```bash
npm run tauri info
```

---

## Comment le code est rangé

| Dossier | Contenu |
|---|---|
| `src/routes/` | Les écrans (tableau de bord, projets, calculs…) |
| `src/components/` | Les éléments réutilisables (boutons, cartes, navigation) |
| `src/lib/` | La liaison avec le serveur et la configuration |
| `src/hooks/` | La logique partagée entre écrans |
| `src/styles/` | **Toutes les couleurs et tailles du produit**, à un seul endroit |
| `tests/` | Les tests automatiques |
| `src-tauri/` | La coque Windows (fenêtre, installateur) |

Pour changer une couleur ou une taille dans tout le logiciel, il n'y a qu'un
fichier à modifier : `src/styles/index.css`.
