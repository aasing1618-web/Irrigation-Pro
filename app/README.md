# `app/` — l'application Irrigation Pro

Ce dossier contient **le logiciel que le client installe sur son ordinateur** :
tout ce qu'il voit et manipule à l'écran.

Les trois autres dossiers du projet ont chacun leur rôle et ne se mélangent pas
avec celui-ci : `backend/` (le serveur et les calculs), `admin/` (le tableau de
bord du propriétaire), `site/` (le site vitrine public).

## Ce que fait l'application aujourd'hui (Vagues 0 et 1)

- Elle démarre et vérifie qu'elle arrive à joindre le serveur Irrigation Pro.
- Elle affiche clairement le résultat : liaison établie, serveur injoignable, ou
  service momentanément réduit — avec un bouton **Réessayer**.
- **Elle demande les identifiants du client et ouvre sa session.**
- **Elle impose le changement du mot de passe temporaire à la première
  connexion.**
- **Elle bloque un compte suspendu et explique pourquoi.**
- **Elle gère les projets** : création, recherche, filtre par avancement, fiche
  détaillée avec l'historique des calculs archivés.
- **Elle donne accès aux modules de calcul d'irrigation**, dont les formulaires
  sont construits à partir du catalogue servi par le serveur — ajouter un module
  côté serveur suffit à le faire apparaître ici, sans toucher à l'application.
- **Elle génère les rapports PDF** depuis la fiche d'un projet, et permet de les
  télécharger et de les supprimer.
- Elle affiche son numéro de version en bas de la barre de navigation.

Tous les calculs d'irrigation sont réalisés **par le serveur**, jamais par
l'application. C'est ce qui protège le savoir-faire du produit : même en
examinant le logiciel installé, on n'y trouve aucune formule.

---

## Le parcours de connexion, écran par écran

L'ordre est toujours le même, et chaque étape est un barrage : l'étape suivante
n'existe pas tant que la précédente n'est pas franchie.

```
1. Démarrage    « Le serveur répond-il ? »        → sinon : Réessayer
2. Reprise      « Une session est-elle encore ouverte ? »
3. Connexion    e-mail + mot de passe
4. Mot de passe « Choisissez le vôtre »           → seulement à la 1ʳᵉ connexion
5. L'application
```

**Étape 2 — la reprise silencieuse.** Au lancement, l'application regarde si un
accès mémorisé existe encore. Si oui, elle rouvre la session sans rien demander
et affiche brièvement « Ouverture de votre session… ». Si non, elle passe
directement à l'écran de connexion. On ne fait jamais clignoter l'écran de
connexion sous les yeux de quelqu'un qui est déjà connecté.

**Étape 4 — le changement obligatoire.** Le mot de passe communiqué par WhatsApp
est connu de deux personnes : le client et son fournisseur. Tant qu'il n'a pas
été remplacé, l'application ne montre aucun autre écran — quelle que soit
l'adresse demandée. Le serveur applique exactement la même règle de son côté :
c'est lui qui décide, l'interface ne fait que le refléter.

**Ce que l'application affiche en cas de problème.** Les messages viennent du
serveur et sont affichés **mot pour mot** : lui seul sait si le mot de passe est
faux, si le compte est suspendu, ou s'il est temporairement verrouillé après
trop de tentatives. L'interface se contente de distinguer visuellement ces trois
situations, parce qu'elles ne se règlent pas de la même façon : on recommence,
on attend, ou on téléphone.

---

## Où vivent les jetons de session (et pourquoi)

Après la connexion, le serveur remet deux jetons. Ils ne sont **jamais** rangés
au même endroit, parce qu'ils ne valent pas la même chose.

| Jeton | Durée | Où il est rangé | Pourquoi |
|---|---|---|---|
| **Jeton d'accès** | 15 minutes | Mémoire vive uniquement | Il accompagne chaque requête. Court, il limite à 15 minutes la fenêtre pendant laquelle une suspension de compte n'est pas encore effective. Fermer le logiciel le perd : sans importance, il se regagne en une requête. |
| **Jeton de rafraîchissement** | 30 jours | Stockage sécurisé du système (`src/lib/secure-store.ts`) | C'est lui qui évite de retaper son mot de passe chaque matin. C'est donc le seul secret durable du logiciel : il ne doit jamais toucher le disque en clair. |

**Ce qui n'est jamais stocké, nulle part :** le mot de passe. Il traverse le
formulaire, part dans la requête, et disparaît. Il n'y a pas de case « se
souvenir de moi », et il n'y en aura pas.

**Ce qui n'est jamais utilisé :** `localStorage`, `sessionStorage`, les cookies,
les fichiers en clair. Un test automatique vérifie qu'ils restent vides après une
connexion réussie.

**Rafraîchissement automatique.** Quand le jeton d'accès expire en cours de
travail, l'application le renouvelle et rejoue la requête sans que l'utilisateur
s'en aperçoive. Si plusieurs requêtes expirent en même temps, **un seul**
renouvellement part : le serveur considère qu'un jeton de rafraîchissement
présenté deux fois est un vol et ferme alors toutes les sessions du compte.
C'est le piège classique de ce mécanisme ; il est traité explicitement et
couvert par un test.

### ⚠️ Ce qui reste à brancher avant de livrer la Vague 1

Le rangement sécurisé du jeton de rafraîchissement est aujourd'hui **en mémoire
vive**. Conséquence unique et visible : *à la fermeture du logiciel, la session
est perdue et le client doit ressaisir son mot de passe au lancement suivant.*
Tout le reste — connexion, compte suspendu, mot de passe obligatoire,
rafraîchissement, déconnexion — fonctionne et est testé.

L'implémentation définitive s'appuie sur le gestionnaire d'identifiants de
Windows et demande un greffon Rust, donc les deux outils listés plus bas
(Rust + Build Tools), qui manquent sur ce poste. Le travail est déjà borné à un
seul fichier, `src/lib/secure-store.ts`, qui explique exactement les deux gestes
à faire. **Aucun autre fichier de l'application ne changera** — ni les écrans,
ni les tests.

---

## Générer un rapport PDF (Vague 3)

Tout se passe **dans la fiche d'un projet**, panneau « Rapports ». On clique sur
**Générer un rapport** : une fenêtre propose les calculs à reprendre — par
défaut le dernier calcul de chaque module, c'est presque toujours le bon choix —
et un champ de notes libres qui figureront dans le document. À la validation, le
serveur compose le PDF, lui attribue une **référence** du type `RAP-2026-0042`
(c'est ce numéro qui est imprimé sur le document remis au client final), et le
rapport apparaît dans la liste, d'où il se télécharge ou se supprime.

Deux refus sont annoncés **avant** le clic plutôt que subis après : tant qu'aucun
calcul n'est archivé, le bouton reste inactif et explique pourquoi (un rapport
sans résultat n'est pas défendable devant un client) ; et si le fichier d'un
ancien rapport n'est plus sur le serveur, le téléchargement est grisé et le dit.

**L'application ne fabrique aucun PDF.** Mise en page, page de garde,
hypothèses, tableaux de résultats, avertissements du moteur, référence : tout
vient du serveur. C'est la même règle que pour les calculs — ce qui fait la
valeur du produit ne descend pas sur un poste Windows.

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

Deux outils gratuits manquent sur le poste. Ils servent à fabriquer le `.exe` —
et, depuis la Vague 1, au rangement sécurisé du jeton de session (voir plus
haut). Ils ne sont pas nécessaires pour développer ou montrer l'interface.

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
| `src/routes/` | Les écrans (connexion, tableau de bord, paramètres…) |
| `src/components/` | Les éléments réutilisables (boutons, champs, cartes, navigation) |
| `src/auth/` | La session vue par l'interface : contexte React et barrage d'accès |
| `src/lib/` | La liaison avec le serveur, la session, la configuration |
| `src/hooks/` | La logique partagée entre écrans |
| `src/styles/` | **Toutes les couleurs et tailles du produit**, à un seul endroit |
| `tests/` | Les tests automatiques |
| `src-tauri/` | La coque Windows (fenêtre, installateur) |

Les quatre fichiers qui portent la session, si vous devez y revenir :

| Fichier | Rôle |
|---|---|
| `src/lib/secure-store.ts` | Où est rangé le jeton de longue durée (et ce qu'il reste à brancher) |
| `src/lib/auth-store.ts` | L'état de la session : jetons, utilisateur connecté, connexion / déconnexion |
| `src/lib/api.ts` | Toutes les requêtes au serveur, le rafraîchissement automatique, la fin de session |
| `src/auth/SessionGate.tsx` | Le barrage : ce qui décide quel écran a le droit de s'afficher |

Pour changer une couleur ou une taille dans tout le logiciel, il n'y a qu'un
fichier à modifier : `src/styles/index.css`.
