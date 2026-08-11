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
- [ ] **Regénérer `JWT_SECRET`** — tout secret ayant existé en prototype est brûlé
- [ ] Écrire le service statique dans Express (le morceau manquant ci-dessus)
- [ ] Recalibrer `trust proxy`, sinon le limiteur de débit voit la même adresse IP pour tout le monde
- [ ] Renseigner `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` en production
- [ ] Créer le bucket `rapports` (public ou privé avec politique d'accès) sur Supabase
- [ ] Activer RLS sur `schema_migrations`
- [ ] Brancher une supervision gratuite sur `/health` (UptimeRobot ou équivalent)
- [ ] **Essayer la chaîne complète dans un navigateur** : connexion, F5, fermeture de l'onglet, retour le lendemain

Le dernier point n'est pas une formalité. C'est là, et nulle part avant, que se
manifeste un problème de cookie.
