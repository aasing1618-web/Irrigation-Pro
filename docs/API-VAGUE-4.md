# Contrat de la Vague 4 — Finitions, cible **web**

Écrit **avant** l'implémentation. En cas de désaccord entre ce document et le
code, c'est ce document qui a raison : le code doit être corrigé.

Rappel du périmètre (`CLAUDE.md`, Vague 4) : bouton WhatsApp, affichage de la
version, détection d'une nouvelle version, site vitrine public. **Rien d'autre.**

---

## D-013 — La cible est le **web** (décision du propriétaire)

Le produit est livré comme **application web** accessible par navigateur. La
coque Tauri reste dans le dépôt, intacte : la décision est réversible et le
propriétaire a écrit « pour l'instant ».

**Conséquence unique mais bloquante :** dans un navigateur, appuyer sur F5 vide
la mémoire vive. Or le jeton de rafraîchissement y vit aujourd'hui
(`secure-store.ts`, implémentation mémoire). Tel quel, le client serait
déconnecté à chaque rechargement de page. Une application web professionnelle ne
peut pas se comporter ainsi. Il faut donc un rangement du jeton qui survive au
rechargement **sans jamais être lisible par du JavaScript** — donc un cookie
`HttpOnly`, posé et lu par le serveur seul.

Ceci amende la décision D-005b (« aucun cookie »), qui visait un logiciel
installé. Le raisonnement de D-005b tenait pour Tauri ; il ne tient plus pour le
navigateur. `localStorage` et `sessionStorage` restent **interdits** : ils sont
lisibles par tout script de la page, c'est-à-dire par toute faille XSS.

---

## 1. Transport de session — nouveau champ `sessionTransport`

### Principe

Le client déclare au serveur **où il sait ranger** son jeton de longue durée.
Le serveur ne devine rien.

| Valeur | Qui l'utilise | Comportement |
|---|---|---|
| `"body"` | Coque Tauri, scripts, tests existants | **Comportement actuel, inchangé** : `refreshToken` renvoyé dans le JSON |
| `"cookie"` | Application web dans un navigateur | Le serveur pose un cookie `HttpOnly` et **omet** `refreshToken` du JSON |

**`"body"` est la valeur par défaut.** Toute requête qui ne précise rien se
comporte exactement comme aujourd'hui. Aucun test existant ne doit être modifié
pour passer : si un test existant casse, c'est l'implémentation qui est fautive.

### Routes concernées

`POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/change-password`
(toutes celles qui émettent aujourd'hui un couple de jetons) et
`POST /api/auth/logout`.

### Requête

Champ **optionnel** dans le corps JSON :

```json
{ "sessionTransport": "cookie" }
```

Validation : `z.enum(['body', 'cookie']).optional().default('body')`. Toute
autre valeur → `400 VALIDATION_ERROR`, message en français, comme partout.

### Réponse en mode `"cookie"`

```http
HTTP/1.1 200 OK
Set-Cookie: ip_refresh=<jeton opaque>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=2592000
Content-Type: application/json
```

```json
{
  "accessToken": "...",
  "expiresIn": 900,
  "sessionTransport": "cookie",
  "user": { "...": "inchangé" }
}
```

**`refreshToken` est absent du corps.** C'est le point entier de la manœuvre :
le secret de 30 jours n'entre jamais dans l'espace mémoire du JavaScript.

Le champ `sessionTransport` est renvoyé **dans les deux modes** (`"body"` ou
`"cookie"`), pour que le client puisse vérifier que le serveur a bien compris.

### Attributs du cookie — chacun est délibéré

| Attribut | Valeur | Pourquoi |
|---|---|---|
| Nom | `ip_refresh` | Court, sans information |
| `HttpOnly` | toujours | Une faille XSS ne peut pas le lire. C'est la raison d'être du dispositif |
| `Secure` | dès que `NODE_ENV !== 'development'` | Jamais en clair sur le réseau. Omis en dev local, sinon `http://localhost` refuserait le cookie |
| `SameSite` | `Strict` | Un site tiers ne peut déclencher aucune requête portant ce cookie. Voir la contrainte de déploiement ci-dessous |
| `Path` | `/api/auth` | Le cookie n'est envoyé qu'aux quatre routes qui en ont besoin. Il n'accompagne ni les projets, ni les calculs, ni les rapports |
| `Max-Age` | `2592000` (30 j) | Aligné sur la durée de vie du jeton en base. Le cookie ne survit jamais au jeton |

### ⚠️ Contrainte de déploiement induite par `SameSite=Strict`

`SameSite` raisonne en **domaine enregistrable**, pas en origine. L'application
web et l'API doivent donc partager le même domaine :

- ✅ `app.irrigation-pro.com` + `api.irrigation-pro.com` → même site, le cookie circule
- ✅ `localhost:5173` + `localhost:4000` → même site (le port ne compte pas), le développement fonctionne
- ❌ `irrigation-pro.vercel.app` + `irrigation-pro.onrender.com` → **sites différents, le cookie ne partira jamais**

Le troisième cas est le piège classique de l'hébergement gratuit. Il n'existe
qu'une porte de sortie propre : **un domaine à soi, avec deux sous-domaines.**
Passer à `SameSite=None` rouvrirait la CSRF et est **refusé**.

Cette contrainte doit figurer dans `docs/DEPLOIEMENT.md`.

### Lecture du jeton par `POST /api/auth/refresh`

Ordre de recherche, strictement :

1. `refreshToken` dans le corps JSON — mode `"body"` ;
2. à défaut, cookie `ip_refresh` — mode `"cookie"` ;
3. aucun des deux → `401 REFRESH_TOKEN_INVALID`, **exactement la réponse
   actuelle** : même code, même message. Une session absente et une session
   invalide restent indistinguables.

Si le jeton vient du cookie, la rotation **repose un cookie neuf** et le corps
JSON reste sans `refreshToken`. La détection de réutilisation de jeton et la
révocation en cascade fonctionnent à l'identique : elles opèrent en base, sur la
valeur du jeton, sans savoir par quel canal il est arrivé.

### `POST /api/auth/logout`

Efface le cookie **systématiquement**, quel que soit le transport annoncé, en
reposant `ip_refresh` vide avec `Max-Age=0` et **exactement les mêmes
attributs** (`Path`, `SameSite`, `Secure`, `HttpOnly`) — un navigateur n'efface
pas un cookie dont les attributs diffèrent. Réponse toujours `204`.

### CORS

`credentials: true` doit être activé sur le middleware CORS, et la liste blanche
d'origines reste **stricte** : avec `Access-Control-Allow-Credentials: true`, un
navigateur refuse `Access-Control-Allow-Origin: *`. La liste blanche actuelle
convient telle quelle. Ajouter `Vary: Origin` si ce n'est pas déjà fait.

### Pas de nouvelle dépendance

Express 5 sait poser un cookie (`res.cookie`). Pour le lire, un module maison de
quelques lignes suffit — `cookie-parser` n'apporte rien ici et ajoute une
dépendance à surveiller.

### Tests attendus (backend)

1. `login` sans `sessionTransport` → `refreshToken` présent dans le corps, **aucun** `Set-Cookie`.
2. `login` avec `"cookie"` → `refreshToken` **absent** du corps, `Set-Cookie` présent avec les six attributs.
3. `refresh` avec le seul cookie → nouvelle session, nouveau cookie, corps sans jeton.
4. `refresh` sans corps ni cookie → `401`, code et message identiques à l'existant.
5. Rejouer un cookie déjà tourné → révocation en cascade, comme en mode corps.
6. `logout` → `Set-Cookie` d'effacement avec les mêmes attributs.
7. `sessionTransport: "chose"` → `400 VALIDATION_ERROR`.
8. La suspension d'un compte invalide la session ouverte en mode cookie, comme en mode corps.

---

## 2. Bouton WhatsApp — application cliente

Cahier des charges : « lien simple, message pré-rempli avec le nom du client ».
**Aucune API WhatsApp**, aucune dépendance, aucun appel réseau.

- Numéro : `221778608247` (Sénégal). Constante unique, surchargeable par
  `VITE_WHATSAPP_NUMBER`, **jamais recopiée à la main** ailleurs.
- Lien : `https://wa.me/221778608247?text=<message encodé>`.
- Message pré-rempli, construit à partir de l'utilisateur connecté :

  ```
  Bonjour, je suis {fullName} ({company}) — client Irrigation Pro.
  ```

  Sans société : `Bonjour, je suis {fullName} — client Irrigation Pro.`
  Le message s'arrête là : c'est au client d'écrire sa demande.

- Un seul module : `app/src/lib/whatsapp.ts`, fonction pure, testée
  (encodage des accents, des espaces, société absente, nom contenant `&` ou `#`).
- Emplacement à l'écran : dans **Paramètres**, section « Assistance », plus une
  entrée discrète en bas de la barre latérale. Pas de bouton flottant.
- `target="_blank"` avec `rel="noopener noreferrer"`.

---

## 3. Affichage de la version

Déjà présent dans la barre latérale (`APP_VERSION`). À compléter dans
**Paramètres** : version de l'application **et** version du serveur, lue par
`GET /version` (route publique existante, inchangée).

Si `/version` ne répond pas : afficher « serveur injoignable », pas une erreur.

---

## 4. Détection d'une nouvelle version — mécanisme web

Sur le web, « nouvelle version » signifie : *le serveur de fichiers sert un
build plus récent que celui qui tourne dans cet onglet.* Le client n'a donc rien
à demander au backend.

### Publication

La compilation écrit `dist/version.json` (petit greffon Vite dans
`vite.config.ts`, aucune dépendance) :

```json
{ "version": "0.1.0", "builtAt": "2026-08-11T09:00:00.000Z" }
```

### Consultation

Module `app/src/lib/update-check.ts` :

- lit `${import.meta.env.BASE_URL}version.json` avec `cache: 'no-store'` ;
- au démarrage (après 30 s), puis toutes les 30 minutes, et au retour sur
  l'onglet (`visibilitychange`), **au plus une fois toutes les 5 minutes** ;
- si `version` diffère de `APP_VERSION` → signale « mise à jour disponible » ;
- **toute erreur est avalée en silence** : hors ligne, fichier absent, JSON
  cassé. Une bannière ne doit jamais apparaître à cause d'un réseau capricieux ;
- **inactif en développement** (`import.meta.env.DEV`).

### Affichage

Bandeau **discret**, en bas de l'écran, dans `AppShell` : « Une nouvelle version
d'Irrigation Pro est disponible. » + bouton **Recharger** + croix pour fermer.

**Jamais de rechargement automatique.** Un ingénieur en train de saisir une
étude ne doit pas voir son écran se réinitialiser sous ses doigts. Fermé, le
bandeau ne revient pas avant le prochain changement de version.

### Tests attendus

version identique → rien ; version différente → bandeau ; fichier absent ou
JSON invalide → rien ; bandeau fermé → ne réapparaît pas ; `Recharger` appelle
bien le rechargement.

---

## 5. Site vitrine public — `site/`

Dossier vide aujourd'hui. **Ce n'est pas une boutique.**

### Interdits absolus (`CLAUDE.md`)

❌ prix · ❌ panier · ❌ paiement · ❌ formulaire d'inscription · ❌ création de
compte · ❌ mouchard analytique · ❌ police ou script chargé depuis un tiers.

Le seul appel à l'action est **le lien WhatsApp**, identique à celui de
l'application, sans nom de client puisque le visiteur est inconnu :

```
Bonjour, je découvre Irrigation Pro et je souhaite en savoir plus.
```

### Technique

Vite 6 + React 19 + Tailwind v4, mêmes jetons de couleur que l'application
(cohérence visuelle), build **entièrement statique**, aucun backend, aucune
variable d'environnement obligatoire. Port de développement : **5175**
(5173 = application, 5174 = dashboard).

### Contenu

Une page unique : ce qu'est Irrigation Pro · pour qui · ce qu'il remplace (le
classeur Excel) · les modules de calcul disponibles · comment on l'obtient
(échange WhatsApp, pas de vente en ligne) · pied de page avec la version.

Ton : professionnel, sobre, français. Pas de superlatif publicitaire, pas de
chiffre inventé, **aucun témoignage client fictif**, aucune capture d'écran qui
ne serait pas une vraie capture.

### Tests attendus

Le lien WhatsApp pointe le bon numéro et porte le bon message · la page ne
contient ni prix, ni panier, ni formulaire de compte · aucune URL externe autre
que `wa.me`.

---

## 6. Ce qui n'entre PAS dans cette vague

- La migration du stockage des PDF (`backend/storage/`) vers un disque
  persistant ou un stockage objet. **C'est une décision de déploiement**, à
  prendre avec le propriétaire — elle est documentée dans `docs/DEPLOIEMENT.md`,
  pas implémentée ici.
- Les durcissements reportés de **D-011** (mot de passe Supabase, `JWT_SECRET`,
  limiteur de débit partagé) : ils appartiennent à la Vague 5.
- Toute fonctionnalité absente de `CLAUDE.md`.
