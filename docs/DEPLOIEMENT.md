# Déploiement — Irrigation Pro

Document de préparation. **Rien n'est déployé à ce jour.** Il décrit la
topologie retenue, les contraintes qui la rendent obligatoire, et ce qu'il reste
à faire.

Deux décisions du propriétaire, prises le **2026-08-11**, commandent tout ce
document :

1. **Pas de nom de domaine pour l'instant.** On se débrouille avec les
   sous-domaines gratuits des hébergeurs.
2. **Les PDF vont sur Supabase Storage.**

---

## Ce qu'il faut héberger

| Composant | Nature | Contrainte |
|---|---|---|
| `backend/` | Processus Node en continu | **Écrit sur Supabase Storage** et tient son limiteur de débit en mémoire → hébergement Node "stateless" classique |
| Base PostgreSQL | Déjà chez **Supabase** | Rien à faire |
| `app/` | Fichiers statiques | Doit partager l'origine de l'API — voir plus bas |
| `admin/` | Fichiers statiques | Idem : il s'authentifie par le même cookie |
| `site/` | Fichiers statiques | Public, aucun cookie, aucun secret → **libre d'aller n'importe où** |

---

## Le problème que « pas de domaine » aurait posé

Depuis D-013, la session repose sur un cookie `SameSite=Strict`. `SameSite`
raisonne en **domaine enregistrable** :

- ❌ `irrigation-pro.vercel.app` + `irrigation-pro.onrender.com` → deux sites
  différents. Le cookie ne partira **jamais**, et le client ne restera jamais
  connecté.

Sans domaine à soi, on ne peut donc **pas** répartir l'interface et l'API sur
deux hébergeurs. Passer à `SameSite=None` rouvrirait la CSRF : refusé.

## Le contournement : ne déployer qu'**une seule chose**

> **Un seul processus Node sert l'API *et* les interfaces.**
> Il n'y a plus qu'une origine, donc plus de problème de cookie du tout —
> et plus de CORS non plus.

```
        https://irrigation-pro.onrender.com          (sous-domaine gratuit)
                          │
        ┌─────────────────▼──────────────────┐
        │   un seul processus Node/Express    │
        ├─────────────────────────────────────┤
        │  /api/*    → l'API                  │
        │  /admin/*  → admin/dist  (dashboard)│
        │  /*        → app/dist    (logiciel) │
        └─────────────────┬───────────────────┘
                          │
         ┌────────────────┼─────────────────┐
         ▼                ▼                 ▼
  Supabase Storage    Supabase        (rien d'autre)
      les PDF         la base
```

Le **site vitrine** reste à part, sur n'importe quel hébergement statique
gratuit (Vercel, Netlify, Cloudflare Pages) : il n'a ni cookie, ni secret, ni
appel réseau. Il pointe simplement vers l'adresse ci-dessus.

**Ce n'est pas un pis-aller.** C'est la topologie la plus simple : un
déploiement, un certificat TLS, une facture, aucune configuration CORS. Le jour
où vous prendrez un domaine, il suffira de le brancher sur ce même service.

### Ce que cela demande au code — la seule chose qui manque

Express doit servir `app/dist` et `admin/dist` en statique, avec repli sur
`index.html` pour les routes du navigateur, et l'interface doit viser sa
**propre origine** au lieu d'une adresse absolue. C'est le dernier morceau
manquant. Tout le reste est prêt.

### ⚠️ Une conséquence à connaître

Le logiciel client et le dashboard partagent alors la même origine, donc **le
même cookie de session**. Se connecter comme administrateur dans le même
navigateur remplace la session client ouverte. Ce n'est pas un défaut — c'est le
comportement de n'importe quel site — mais il faut le savoir : pour travailler
sur les deux à la fois, utilisez une fenêtre de navigation privée.

### Alternative, si vous voulez garder l'interface chez Vercel

Vercel sait **relayer** `/api/*` vers un autre serveur (`rewrites` dans
`vercel.json`). Le navigateur ne voit alors qu'une seule origine, et le cookie
fonctionne aussi.

C'est valable, mais cela ajoute un intermédiaire sur **chaque** requête, y
compris le téléchargement des PDF. À réserver au cas où vous tiendriez à
héberger l'interface chez Vercel. Sinon, la topologie ci-dessus est plus simple.

---

## Les PDF — décidé : Supabase Storage

Les rapports sont **figés** sur Supabase et non régénérés : une référence déjà
imprimée ne doit jamais désigner un document différent. Le bucket `rapports`
contient donc des données **irremplaçables**, au même titre que la base.

**Décision du propriétaire (2026-08-11, annule D-015) : Supabase Storage.** Le
backend a été modifié pour utiliser le SDK Supabase.

Conséquence majeure :
**Le serveur Node n'a plus besoin de disque persistant.** On peut l'héberger sur
une offre 100% gratuite (ex. Render Free).

---

## Hébergeurs compatibles, sans domaine

Ce qu'il faut : un processus Node en continu, un disque qui persiste, un
sous-domaine gratuit, TLS automatique.

| Hébergeur | Sous-domaine | Remarque |
|---|---|---|
| **Render** | `*.onrender.com` | L'offre gratuite convient parfaitement puisqu'on n'a plus besoin de disque. Idéal pour ce projet. |
| **Fly.io** | `*.fly.dev` | Un peu plus technique |
| **Railway** | `*.up.railway.app` | Facturation à l'usage |

---

## Variables d'environnement de production

À poser chez l'hébergeur, **jamais dans le dépôt** :

```
NODE_ENV=production
DATABASE_URL=            # pooler Supabase, port 6543
JWT_SECRET=              # REGÉNÉRÉ (D-011), jamais celui du prototype
PORT=
TRUST_PROXY=             # à recalibrer selon l'hébergeur (D-011)
SUPABASE_URL=            # URL de l'API Supabase
SUPABASE_SERVICE_ROLE_KEY= # Clé secrète de rôle service pour écrire les PDF
CORS_ORIGINS=            # inutile en origine unique ; à laisser vide
```

Le site vitrine, à la compilation : `VITE_WHATSAPP_NUMBER=221778608247`.

---

## À faire avant la première mise en ligne — liste bloquante

Reprise de **D-011**, à ne pas rogner :

- [ ] **Réinitialiser le mot de passe de la base Supabase** — l'actuel a transité en clair dans une sortie de terminal
- [x] JWT_SECRET : tiré au sort par Render (generateValue), personne ne le voit passer
- [x] Écrire le service statique dans Express — fait, couvert par backend/tests/static.routes.test.ts
- [x] trust proxy : déjà réglé à 1 en production, ce qui convient à Render
- [x] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_BUCKET renseignés en local ; à reporter chez l'hébergeur
- [x] Bucket Supabase créé (« Rapport », privé) et **écriture réelle vérifiée** : 8 contrôles, 0 échec
- [ ] Activer RLS sur `schema_migrations`
- [ ] Brancher une supervision gratuite sur `/health` (UptimeRobot ou équivalent)
- [ ] **Essayer la chaîne complète dans un navigateur** : connexion, F5, fermeture de l'onglet, retour le lendemain

Le dernier point n'est pas une formalité. C'est là, et nulle part avant, que se
manifeste un problème de cookie.

---

## Le commutateur de stockage (à ne pas retirer)

`backend/src/reports/stockage.ts` a **deux rangements** derrière la même porte :
Supabase Storage en production, disque local ailleurs. Le choix est **sûr par
défaut** : Supabase seulement si `NODE_ENV=production`, ou sur demande explicite.

| Variable | Valeur | Effet |
|---|---|---|
| `REPORTS_STORAGE` | `supabase` \| `disque` | Force le rangement. À laisser vide en principe |
| `REPORTS_STORAGE_DIR` | chemin | Racine du rangement disque. Utilisé par les tests |

⚠️ **Pourquoi ce garde-fou existe.** Sans lui, lancer la suite de tests — ou
même `npm run dev` — avec les identifiants de production écrit les PDF de test
**dans le bucket des vrais clients**, au milieu de leurs rapports. D-011 prévoit
un projet Supabase séparé pour les tests ; tant qu'il n'existe pas, ce
commutateur est la seule protection.

En production, il n'y a **rien à régler** : `NODE_ENV=production` suffit.

---

## Render, pas à pas (offre gratuite)

`render.yaml` est prêt et vérifié. Le serveur compilé a été démarré localement
en `NODE_ENV=production` : `/health` répond 200, `/` sert le logiciel, `/admin/`
le dashboard, `/api/inconnu` renvoie du JSON.

### Avant de cliquer

1. **Bucket Supabase.** Storage → New bucket → nom exact `rapports` → **privé**.
2. **Relever la clé secrète.** Project Settings → API Keys → `sb_secret_…`
   (anciennement `service_role`). ⚠️ **Pas** la clé `sb_publishable_…` : celle-là
   est publique, soumise aux règles RLS, et toutes les tables sont verrouillées.
   Elle ne pourrait rien écrire.
3. **Relever la chaîne du pooler.** Project Settings → Database → Connection
   pooling, **port 6543**. Le 5432 n'est joignable qu'en IPv6 (D-002b).

### Le déploiement

1. Render → New → Blueprint → choisir le dépôt `Irrigation-Pro`.
   Render lit `render.yaml` et propose le service.
2. Il demande les trois valeurs marquées `sync: false` :
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   `JWT_SECRET` est tiré au sort par Render, personne ne le voit passer.
3. Déployer. La première compilation installe et construit les trois interfaces.

### Après le premier déploiement

- **Vérifier l'adresse attribuée.** Si ce n'est pas
  `irrigation-pro.onrender.com`, corriger `CORS_ORIGINS` dans le tableau de bord.
- **Essayer la chaîne complète dans un navigateur** : connexion, **F5**,
  fermeture de l'onglet, retour. C'est là, et nulle part avant, qu'un problème
  de cookie se manifeste.
- **Générer un vrai rapport** : c'est le seul moyen de savoir que Supabase
  Storage fonctionne. Rien avant ne le prouve.

### Ce que l'offre gratuite implique, et qu'il faut savoir

- **Le service s'endort après 15 minutes sans visite.** Le réveil prend environ
  50 secondes : le premier client de la journée attendra devant un écran de
  chargement. Acceptable pour essayer, pas pour vendre.
- Une supervision qui appelle `/health` toutes les 10 minutes garde le service
  éveillé — et prévient quand il tombe.
- Le passage à l'offre payante (7 $/mois) supprime la mise en veille sans rien
  changer au code.
