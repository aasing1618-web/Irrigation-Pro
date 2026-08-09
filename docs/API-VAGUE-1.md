# Contrat d'API — Vague 1 : connexion et comptes

**Ce document fait autorité.** Le serveur l'implémente, l'application le
consomme, les tests le vérifient. Toute divergence est un défaut, pas une
interprétation. Il est figé par le lead : un agent qui souhaite s'en écarter le
signale au lieu de le modifier.

---

## 1. Règles générales

Toutes les routes sont préfixées par `/api`. Toutes les réponses sont en JSON.

### Format d'erreur — identique sur toute l'API

```json
{ "error": { "code": "CODE_MACHINE", "message": "Phrase lisible en français.", "details": {} } }
```

`details` est facultatif. Le `message` est destiné à être **affiché tel quel** à
l'utilisateur : il ne contient jamais de terme technique, de nom de table, de
trace, ni d'information sur l'existence d'un compte.

### Jetons

| Jeton | Durée | Transport | Stockage |
|---|---|---|---|
| Jeton d'accès | 15 min | En-tête `Authorization: Bearer <jeton>` | **Mémoire vive de l'application uniquement** |
| Jeton de rafraîchissement | 30 j | Corps JSON de la requête | Stockage sécurisé du système, jamais `localStorage` |

Aucun cookie n'est utilisé (cf. D-005b).

Le jeton d'accès est un JWT signé HS256. Sa charge utile contient `sub`
(identifiant du compte), `role`, `iat`, `exp`, `jti`, plus `iss` et `aud`, qui
sont **vérifiés** à la lecture au même titre que la signature.

> *Correction du lead (2026-08-09)* : la première version de ce document disait
> « exactement ces cinq claims » tout en exigeant un émetteur et un destinataire
> vérifiés — c'était contradictoire, l'agent Authentification a eu raison de le
> signaler. Ce qui compte réellement est la phrase suivante.

**La charge utile ne contient ni le statut du compte, ni `mustChangePassword`.**
Ces deux informations changent en cours de session : les inscrire dans un jeton
signé pour 15 minutes reviendrait à laisser un compte suspendu continuer à
travailler. Elles sont relues en base à chaque requête.

### Vérifications appliquées à chaque requête authentifiée

Dans cet ordre, sans exception :

1. Le jeton est présent, bien formé, signé, non expiré → sinon `401 TOKEN_INVALID`.
2. Le compte existe toujours → sinon `401 TOKEN_INVALID`.
3. **Le statut du compte est relu en base.** S'il vaut `SUSPENDU` →
   `403 ACCOUNT_SUSPENDED`. C'est ce qui rend une suspension effective sans
   attendre l'expiration du jeton (cf. D-010).
4. Si `mustChangePassword` est vrai, **toutes les routes sont refusées** avec
   `403 PASSWORD_CHANGE_REQUIRED`, sauf ces trois-là : `GET /api/auth/me`,
   `POST /api/auth/change-password`, `POST /api/auth/logout`.

Le compte authentifié est exposé au reste du serveur via
`res.locals.user: AuthenticatedUser`.

---

## 2. Les routes

### `POST /api/auth/login` — se connecter

Publique. Soumise au limiteur strict d'authentification.

**Requête**
```json
{ "email": "jean@bureau-etudes.sn", "password": "…" }
```

**Réponse `200`**
```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "jean@bureau-etudes.sn",
    "fullName": "Jean Diop",
    "company": "Bureau d'études Sahel",
    "role": "CLIENT",
    "mustChangePassword": true
  }
}
```

**Erreurs**

| Code HTTP | `code` | Quand | Message affiché |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Champ manquant ou mal formé | « Veuillez saisir votre adresse e-mail et votre mot de passe. » |
| 401 | `INVALID_CREDENTIALS` | E-mail inconnu **ou** mot de passe faux | « Adresse e-mail ou mot de passe incorrect. » |
| 403 | `ACCOUNT_SUSPENDED` | Compte `SUSPENDU` | « Votre compte est suspendu. Contactez votre fournisseur. » |
| 429 | `ACCOUNT_LOCKED` | Trop de tentatives | « Trop de tentatives. Réessayez dans X minutes. » |

> **Règle de sécurité — non négociable.** Un e-mail inconnu et un mot de passe
> faux renvoient **exactement la même réponse**, le même code et le même délai.
> Toute différence permettrait de découvrir quelles adresses possèdent un compte.
> En conséquence, un e-mail inconnu doit lui aussi déclencher une vérification de
> mot de passe factice, pour que le temps de réponse soit identique.

> **Exception assumée :** `ACCOUNT_SUSPENDED` révèle qu'un compte existe. C'est
> volontaire — le client suspendu doit comprendre pourquoi il n'entre plus, et
> il connaît déjà l'existence de son propre compte. Ce statut n'est renvoyé
> qu'**après** vérification réussie du mot de passe, jamais avant.

### `POST /api/auth/refresh` — prolonger la session

Publique (le jeton fait foi). Soumise au limiteur strict.

**Requête** `{ "refreshToken": "…" }` → **Réponse `200`** : même forme que
`login`, sans le bloc `user`.

**Rotation obligatoire :** le jeton fourni est révoqué et un nouveau est émis.

**Détection de réutilisation — avec discernement.** Présenter un jeton déjà
révoqué n'a pas la même signification selon la raison de sa révocation. Chaque
révocation enregistre donc son motif, et seul le premier cas déclenche l'alerte :

| Motif de la révocation | Que signifie sa réutilisation | Réaction |
|---|---|---|
| `ROTATION` — remplacé par un rafraîchissement | **Deux détenteurs du même jeton.** C'est la signature d'un vol | Révoquer **toutes** les sessions du compte, journaliser `REFRESH_TOKEN_REUSE` |
| `LOGOUT` — déconnexion volontaire | Un appareil qui n'avait pas vu la déconnexion | `401` seul |
| `PASSWORD_CHANGE` — changement de mot de passe | Un autre appareil, légitimement déconnecté | `401` seul |
| `ADMIN` — suspension du compte | Le compte a été fermé par le propriétaire | `401` seul |

> **Pourquoi c'est important.** Sans cette distinction, le scénario suivant se
> produit : un ingénieur change son mot de passe au bureau ; son portable, resté
> ouvert à la maison, tente un rafraîchissement avec son ancien jeton ; le
> serveur y voit un vol et révoque **tout** — y compris la session du bureau,
> en plein travail. L'utilisateur est éjecté sans comprendre, et appelle le
> support. Les autres appareils doivent bien être déconnectés après un
> changement de mot de passe : c'est le fait d'y voir une intrusion qui est faux.

**Erreurs :** `401 REFRESH_TOKEN_INVALID` (inconnu, expiré ou révoqué),
`403 ACCOUNT_SUSPENDED`.

### `POST /api/auth/logout` — fermer la session

Authentifiée. Requête `{ "refreshToken": "…" }` → `204`, sans contenu.
Révoque ce seul jeton. **Répondre `204` même si le jeton est déjà invalide** :
une déconnexion ne doit jamais échouer.

### `GET /api/auth/me` — qui suis-je

Authentifiée. → `200 { "user": { … } }`, même forme que dans `login`.
Autorisée même quand `mustChangePassword` est vrai.

### `POST /api/auth/change-password` — changer son mot de passe

Authentifiée. Autorisée quand `mustChangePassword` est vrai — c'est le seul
chemin de sortie de cet état.

**Requête** `{ "currentPassword": "…", "newPassword": "…" }`

**Réponse `200`** : nouveaux `accessToken`, `refreshToken`, `expiresIn` et
`user` (avec `mustChangePassword: false`).

**Effets de bord obligatoires**, dans l'ordre :
1. `mustChangePassword` passe à `false` ;
2. **toutes** les sessions longues existantes du compte sont révoquées ;
3. un nouveau couple de jetons est émis pour la session en cours ;
4. l'événement est journalisé.

**Erreurs :** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` (mot de passe
actuel faux), `400 PASSWORD_TOO_WEAK`, `400 PASSWORD_UNCHANGED` (le nouveau est
identique à l'ancien).

**Politique de mot de passe :** au moins 10 caractères, et pas plus de 200.
Aucune exigence de « une majuscule, un chiffre, un symbole » : ces règles
poussent aux mots de passe faibles et notés sur un papier. La longueur est le
seul critère qui compte réellement. Refuser les mots de passe manifestement
courants (une courte liste embarquée suffit).

---

## 3. Protection contre les tentatives répétées

Deux barrières complémentaires :

1. **Par adresse IP** — le limiteur existant sur les routes d'authentification.
2. **Par compte**, en base : `failed_login_attempts` et `locked_until`.
   - Chaque échec incrémente le compteur.
   - Au **5ᵉ** échec, le verrou est posé pour **15 minutes** — mais la réponse
     reste `401 INVALID_CREDENTIALS`. C'est la **6ᵉ** tentative qui reçoit
     `429 ACCOUNT_LOCKED` avec le délai restant.

     *Pourquoi ce décalage :* un e-mail inconnu ne se verrouille jamais.
     Répondre `429` dès le 5ᵉ échec ferait du verrouillage un détecteur de
     comptes existants. Le décalage ne supprime pas complètement cette fuite
     — elle réapparaît à la 6ᵉ tentative — mais le limiteur par adresse IP
     (10 tentatives par quart d'heure) la rend inexploitable à grande échelle.
     Le compromis est assumé : un client légitime bloqué doit comprendre qu'il
     doit attendre, plutôt que de croire à un mot de passe oublié.
   - Chaque échec supplémentaire pendant le verrouillage double le délai,
     plafonné à **2 heures**.
   - Une connexion réussie remet le compteur à zéro et efface `locked_until`.
   - Un verrouillage **n'est pas une suspension** : il expire tout seul, et le
     propriétaire n'a rien à faire.

---

## 4. Journalisation

Sont enregistrés dans `activity_logs` : `LOGIN_SUCCESS`, `LOGIN_FAILED`,
`LOGIN_BLOCKED_SUSPENDED`, `ACCOUNT_LOCKED`, `PASSWORD_CHANGED`, `LOGOUT`,
`TOKEN_REFRESHED`, `REFRESH_TOKEN_REUSE`.

Chaque entrée porte l'adresse IP et le `User-Agent`. **Aucune entrée ne doit
jamais contenir un mot de passe, un jeton, ni même un fragment de l'un des
deux** — y compris dans le champ libre `metadata`.

---

## 5. Création du premier compte administrateur

Il n'existe aucune inscription. Le tout premier compte est créé en ligne de
commande, sur le serveur :

```bash
npm run creer-admin -- --email "proprietaire@exemple.sn" --nom "Nom Prénom"
```

La commande tire un mot de passe temporaire aléatoirement, **l'affiche une seule
fois à l'écran**, n'en stocke que l'empreinte, et positionne
`mustChangePassword = true`. Elle refuse de s'exécuter si un compte
administrateur existe déjà, sauf `--force`.

---

## 6. Ce que l'application doit faire de son côté

- **Écran de connexion** : e-mail, mot de passe, bouton. Les messages d'erreur
  du serveur sont affichés tels quels, sans reformulation.
- **Écran de changement de mot de passe obligatoire** : présenté dès que
  `mustChangePassword` est vrai, sans possibilité de le contourner ni de
  naviguer ailleurs.
- **Rafraîchissement automatique** : sur `401`, l'application tente **une seule
  fois** de rafraîchir, rejoue la requête, et en cas de nouvel échec revient à
  l'écran de connexion en effaçant les jetons.
- **Sur `403 ACCOUNT_SUSPENDED`** : retour immédiat à l'écran de connexion avec
  le message du serveur. C'est le chemin par lequel une suspension devient
  visible pour l'utilisateur.
- **Le mot de passe n'est jamais conservé**, ni en mémoire après envoi, ni
  ailleurs. Aucun champ « se souvenir de moi » ne stocke de mot de passe.
