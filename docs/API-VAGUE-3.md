# Contrat d'API — Vague 3 : rapports PDF et administration

**Ce document fait autorité.** Il complète [API-VAGUE-1.md](API-VAGUE-1.md) et
[API-VAGUE-2.md](API-VAGUE-2.md), dont toutes les règles restent valables :
préfixe `/api`, format d'erreur `{ error: { code, message, details? } }`,
`Authorization: Bearer`, statut du compte relu en base à chaque requête,
**une ressource appartenant à un autre client renvoie `404`, jamais `403`**.

---

## 1. Rapports PDF

Le PDF est **généré côté serveur**. Deux raisons : les résultats de calcul ne
transitent pas deux fois, et la mise en page — qui fait la qualité perçue du
document remis au client final — reste hors de l'application décompilable.

### `POST /api/projects/:id/reports` — générer un rapport

Corps : `{ "calculIds": ["uuid", …], "notes": "…" }`. `calculIds` facultatif —
à défaut, le rapport reprend **le dernier calcul de chaque module** du projet.

Vérifie que le projet appartient à l'utilisateur, **et** que chaque calcul
demandé appartient à ce projet. → `201 { "rapport": { "id", "reference",
"genereLe" } }`, ou `404`.

La `reference` est lisible et unique, de la forme `RAP-2026-0042` : elle est
imprimée sur le document et sert de repère au client final. Elle est attribuée
par le serveur, jamais par le client.

### `GET /api/projects/:id/reports` — lister les rapports d'un projet

→ `200 { "rapports": [ { "id", "reference", "genereLe", "nombreCalculs" } ] }`

### `GET /api/reports/:id/fichier` — télécharger le PDF

→ `200` avec `Content-Type: application/pdf` et un
`Content-Disposition: attachment` portant un nom de fichier lisible.
`404` si le rapport n'appartient pas à l'utilisateur.

### `DELETE /api/reports/:id` — supprimer un rapport

→ `204`, ou `404`.

### Contenu obligatoire du document

Un document qu'un bureau d'études remet à son propre client. Il doit contenir :

- une **page de garde** : nom du projet, nom du client final, localisation,
  date de génération, référence du rapport, et le nom de l'utilisateur qui l'a
  produit ;
- les **hypothèses retenues** — les entrées de chaque calcul, avec leurs unités.
  Un rapport qui donne des résultats sans dire sur quoi ils reposent n'est pas
  défendable devant un client ;
- les **résultats** par module, avec unités, mis en forme en tableaux lisibles ;
- les **avertissements métier** émis par le moteur. Ils ne doivent **jamais**
  être omis du document au prétexte qu'ils sont gênants ;
- la **version du moteur de calcul** et la date, en pied de page ;
- une **numérotation des pages** et le titre du projet en en-tête courant.

**Interdits dans le document :** aucune formule détaillée (le savoir-faire reste
protégé), aucun prix, aucune mention de licence.

---

## 2. Administration — réservé au rôle `ADMIN`

Toutes ces routes exigent `requireAdmin`. **Un compte `CLIENT` qui les appelle
reçoit `404`**, comme pour toute ressource qui ne le concerne pas : un `403`
lui apprendrait que ces routes existent.

Toute action d'administration est enregistrée dans `admin_actions` avec son
auteur, sa cible, son motif et sa date.

### `GET /api/admin/users` — liste des comptes

Filtres facultatifs : `statut`, `role`, `recherche`, `limite`, `depuis`.

```json
{ "comptes": [ { "id", "email", "nomComplet", "societe", "role", "statut",
  "doitChangerMotDePasse", "verrouilleJusqua", "derniereConnexion", "creeLe",
  "nombreProjets" } ], "total": 12 }
```

`verrouilleJusqua` est nul la plupart du temps ; il porte la date de fin du
verrouillage anti-force-brute quand il y en a un. **C'est une information de
dépannage indispensable** : sans elle, le propriétaire reçoit un appel « je ne
peux plus me connecter » sans pouvoir distinguer un compte verrouillé pour
quinze minutes d'un compte suspendu ou d'un mot de passe oublié.

**Ne renvoie jamais `password_hash`**, sous aucune forme.

### `POST /api/admin/users` — créer un compte client

Corps : `{ "email", "nomComplet", "societe"?, "role"? }` (`role` par défaut
`CLIENT`).

Le serveur tire un **mot de passe temporaire aléatoire**, ne stocke que son
empreinte, positionne `doitChangerMotDePasse = true`, et **le renvoie une seule
fois** dans la réponse de création :

```json
{ "compte": { … }, "motDePasseTemporaire": "Y7tJW-uAXw6-CgKDj-PQWjC" }
```

C'est la **seule et unique fois** où ce mot de passe existe en clair. Il n'est
ni journalisé, ni stocké, ni réaffichable. L'interface doit le dire clairement
et proposer de le copier.

→ `409 CONFLICT` si l'adresse est déjà utilisée.

### `PATCH /api/admin/users/:id` — modifier un compte

Champs modifiables : `nomComplet`, `societe`, `role`. **Pas l'e-mail** (c'est
l'identifiant de connexion), **pas le statut** (il a sa propre route, parce
qu'il exige un motif).

### `POST /api/admin/users/:id/suspendre` — suspendre

Corps : `{ "motif": "…" }`, motif obligatoire.

Effets, dans cet ordre : statut à `SUSPENDU` ; **toutes les sessions du compte
sont révoquées** avec le motif `ADMIN` ; l'action est journalisée. → `200`.

### `POST /api/admin/users/:id/reactiver` — réactiver

Corps : `{ "motif": "…" }`. Statut à `ACTIF`, compteur de tentatives remis à
zéro, verrou éventuel levé. → `200`.

### `POST /api/admin/users/:id/reinitialiser-mot-de-passe`

Tire un nouveau mot de passe temporaire, le renvoie **une seule fois**,
repositionne `doitChangerMotDePasse = true`, et **révoque toutes les sessions**.
→ `200 { "motDePasseTemporaire": "…" }`.

### `GET /api/admin/users/:id/activite` — activité d'un compte

Les dernières entrées de `activity_logs` pour ce compte, paginées.
Ne contient jamais de secret : le filtre défensif de la Vague 1 reste actif.

### `GET /api/admin/activite` — activité récente, tous comptes

Pour la page d'accueil du dashboard : dernières connexions, échecs, créations.

### Réponses des actions

`suspendre`, `reactiver` et `reinitialiser-mot-de-passe` renvoient, en plus de
ce qui est décrit ci-dessus, le `compte` mis à jour et le nombre de
`sessionsRevoquees`. Le dashboard s'évite ainsi un aller-retour pour rafraîchir
la fiche, et le propriétaire voit immédiatement l'effet de son action.

### Deux refus qui restent en amont du contrôle de rôle

La règle « une route d'administration appelée par un client renvoie `404` »
s'applique **après** l'authentification. Deux refus lui sont donc antérieurs et
ne peuvent pas devenir des `404` :

- `401` — jeton absent, mal formé ou expiré. Le dashboard en a besoin pour
  savoir qu'il doit rafraîchir sa session ;
- `403 PASSWORD_CHANGE_REQUIRED` — compte qui n'a pas encore remplacé son mot
  de passe temporaire.

*Arbitrage du lead :* accepté. Ces réponses sont **identiques sur une URL
d'administration existante et inexistante**, elles ne permettent donc aucune
énumération. Elles révèlent seulement qu'un routeur vit sous `/api/admin`, ce
qui n'est pas un secret exploitable. Le comportement est figé par un test.

### Garde-fous non négociables

- **Un administrateur ne peut ni se suspendre lui-même, ni retirer son propre
  rôle `ADMIN`.** Sinon le propriétaire peut se verrouiller hors de son propre
  produit, sans recours. → `409 CONFLICT` avec un message explicite.
- **Le dernier compte `ADMIN` actif ne peut pas être suspendu ni rétrogradé.**
- Un administrateur **ne peut pas lire les projets d'un client**. Le dashboard
  gère des comptes, pas des données métier. C'est une limite de conception
  assumée : la confidentialité des études de vos clients est un argument
  commercial, pas une contrainte.

---

## 3. Codes d'erreur ajoutés

| HTTP | `code` | Quand |
|---|---|---|
| 409 | `EMAIL_DEJA_UTILISE` | Création d'un compte sur une adresse existante |
| 409 | `ACTION_IMPOSSIBLE` | Auto-suspension, retrait du dernier administrateur |
| 404 | `NOT_FOUND` | Ressource inexistante, ou route d'administration appelée par un client |

---

## 4. Journalisation

`activity_logs` : `REPORT_GENERATED`, `REPORT_DOWNLOADED`, `REPORT_DELETED`.

`admin_actions` : `CREATE_ACCOUNT`, `UPDATE_ACCOUNT`, `SUSPEND`, `REACTIVATE`,
`RESET_PASSWORD`.

**Le motif n'est obligatoire que pour `SUSPEND` et `REACTIVATE`.** Une version
antérieure de ce document disait « chacune avec son motif », en contradiction
avec la section 2 qui ne prévoit de champ `motif` que sur ces deux routes.
*Arbitrage du lead, 2026-08-10 :* couper l'accès à un client engage le
propriétaire et doit être justifié ; créer un compte ou renommer une société
n'a pas à l'être. Exiger un motif partout produirait des « RAS » qui videraient
le champ de son sens là où il compte.

**Aucun mot de passe temporaire ne doit apparaître dans un journal**, sous
aucune forme, même partielle.

---

## 5. Le dashboard administrateur (`admin/`)

Application web **séparée**, réservée au propriétaire, servie sur un autre port
en développement (`5174`, déjà dans la liste blanche CORS).

Écrans attendus :

- **Connexion** — la même API que l'application cliente ; un compte `CLIENT`
  qui s'y connecte doit être refusé avec un message clair.
- **Liste des comptes** — recherche, filtre par statut, indicateur visuel net
  entre ACTIF et SUSPENDU.
- **Création d'un compte** — formulaire court, puis affichage du mot de passe
  temporaire avec un bouton « copier » et un avertissement qu'il ne sera plus
  jamais affiché. Idéalement, un bouton qui ouvre WhatsApp avec le message
  pré-rempli (Vague 4, prévoir l'emplacement).
- **Fiche d'un compte** — informations, dernière connexion, nombre de projets,
  historique d'activité, et les actions : suspendre, réactiver, réinitialiser
  le mot de passe. Chaque action demande un **motif**, et une confirmation
  explicite pour les actions lourdes.
- **Accueil** — activité récente et quelques chiffres utiles (comptes actifs,
  suspendus, connexions du jour).

L'interface doit être **sobre et rapide**, dans la même identité visuelle que
l'application cliente. C'est un outil de travail quotidien pour une personne,
pas une vitrine.
