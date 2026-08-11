# Déploiement — Irrigation Pro

Document de préparation. **Rien n'est déployé à ce jour** : ce fichier décrit la
topologie retenue, les contraintes qui la rendent obligatoire, et ce qu'il reste
à faire. Il sera exécuté en Vague 5.

---

## Ce qu'il faut héberger

| Composant | Nature | Contrainte particulière |
|---|---|---|
| `backend/` | Processus Node en continu | **Écrit des fichiers sur disque** (`backend/storage/`, les PDF figés) et tient son limiteur de débit en mémoire → **une seule instance, avec un disque qui persiste** |
| Base PostgreSQL | Déjà hébergée chez **Supabase** | Rien à faire |
| `app/` | Fichiers statiques (build Vite) | Doit partager le domaine de l'API — voir plus bas |
| `admin/` | Fichiers statiques | Accès propriétaire uniquement |
| `site/` | Fichiers statiques | Public, aucun secret, aucun cookie |

---

## La contrainte qui commande tout le reste

Depuis D-013, la session du client repose sur un cookie `SameSite=Strict`. Or
`SameSite` raisonne en **domaine enregistrable**, pas en origine :

- ✅ `app.irrigation-pro.com` + `api.irrigation-pro.com` → même site, le cookie circule
- ❌ `irrigation-pro.vercel.app` + `irrigation-pro.onrender.com` → **sites différents : le client ne restera jamais connecté**

C'est le piège classique de l'hébergement gratuit, et il ne se voit qu'une fois
en production. Deux issues propres, une seule mauvaise :

| Issue | Verdict |
|---|---|
| Un nom de domaine à soi, deux sous-domaines | ✅ correct |
| **Une seule origine** qui sert à la fois l'interface et l'API | ✅ **le plus simple, retenu** |
| `SameSite=None` | ❌ refusé : rouvre la faille CSRF que `Strict` ferme |

---

## Topologie retenue — une seule origine

```
                    https://app.irrigation-pro.com
                                │
                    ┌───────────▼────────────┐
                    │   un seul processus     │
                    │   Node (Express 5)      │
                    ├─────────────────────────┤
                    │  /api/*  → l'API        │
                    │  /*      → app/dist     │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
      disque persistant   Supabase (base)    (rien d'autre)
      backend/storage/
```

Le dashboard `admin/` va sur `admin.irrigation-pro.com`, le site vitrine
`site/` sur `irrigation-pro.com` (hébergement statique gratuit, il n'a ni
cookie ni secret).

**Pourquoi cette forme :** l'interface et l'API partagent la même origine. Le
cookie fonctionne sans discussion, **CORS disparaît entièrement**, il n'y a
qu'un certificat TLS, qu'un déploiement, qu'une facture. Pour un produit à
quelques dizaines de clients, tout le reste est de la complexité gratuite.

**Ce que cela demande au code, et qui n'est pas encore fait :** Express doit
servir `app/dist` en statique avec un repli sur `index.html` pour les routes du
navigateur. C'est une vingtaine de lignes, à écrire en Vague 5.

---

## Le point à trancher : où vont les PDF

Les rapports sont **figés sur disque** et non régénérés (Vague 3) : une
référence déjà imprimée ne doit jamais désigner un document différent. Donc
`backend/storage/` contient des données irremplaçables, au même titre que la
base.

| Option | Pour | Contre |
|---|---|---|
| **Disque persistant** de l'hébergeur | Zéro ligne de code à changer | Interdit tout hébergement « sans serveur » ; il faut penser à le sauvegarder |
| **Supabase Storage** (déjà dans le contrat) | Sauvegardé avec le reste, survit à la destruction du serveur | Demande de réécrire la couche de stockage des rapports |

**Recommandation :** disque persistant pour le lancement, Supabase Storage le
jour où il y a assez de clients pour que la perte fasse mal. **Décision du
propriétaire attendue.**

⚠️ Un hébergement « serverless » (Vercel Functions, Netlify Functions, Cloudflare
Workers) est **incompatible en l'état** : pas de disque, et le limiteur de débit
en mémoire ne fonctionne plus dès qu'il y a plusieurs instances.

---

## Hébergeurs compatibles

Ce dont on a besoin : un processus Node qui tourne en continu, un disque qui
persiste, un domaine à soi, TLS automatique.

- **Render**, plan payant + disque persistant — le plus simple à tenir pour
  quelqu'un qui ne veut pas administrer un serveur.
- **Fly.io** ou **Railway** — volumes persistants, même principe.
- **Un petit VPS** (Hetzner, OVH, Contabo) avec **Caddy** — le moins cher et le
  plus contrôlable, mais c'est une machine à entretenir.

Comptez de l'ordre de 5 à 10 € par mois. Supabase reste sur son offre actuelle.

---

## Variables d'environnement de production

À poser chez l'hébergeur, **jamais dans le dépôt** :

```
NODE_ENV=production
DATABASE_URL=          # pooler Supabase, port 6543
DATABASE_SSL_CA=       # ou le certificat versionné dans backend/certs/
JWT_SECRET=            # REGÉNÉRÉ (D-011), jamais celui du prototype
CORS_ORIGINS=          # inutile en origine unique ; sinon la liste stricte
PORT=
TRUST_PROXY=           # à recalibrer selon l'hébergeur (D-011)
```

Côté interfaces, à la compilation :

```
VITE_API_URL=https://app.irrigation-pro.com   # même origine
VITE_WHATSAPP_NUMBER=221778608247
```

---

## À faire avant la première mise en ligne — liste bloquante

Reprise de **D-011**, à ne pas rogner :

- [ ] **Réinitialiser le mot de passe de la base Supabase** — le mot de passe actuel a transité en clair dans une sortie de terminal
- [ ] **Regénérer `JWT_SECRET`** — tout secret ayant existé en prototype est brûlé
- [ ] Recalibrer `trust proxy` selon l'hébergeur retenu, sinon le limiteur de débit voit la même adresse IP pour tout le monde
- [ ] Activer RLS sur `schema_migrations`
- [ ] Mettre en place la **sauvegarde de `backend/storage/`** en même temps que celle de la base
- [ ] Vérifier que `/health` répond et brancher une supervision gratuite (UptimeRobot ou équivalent)
- [ ] Essayer la chaîne complète **sur le domaine réel**, dans un navigateur : connexion, F5, fermeture de l'onglet, retour le lendemain

Le dernier point n'est pas une formalité : c'est exactement là que le piège
`SameSite` se manifeste, et nulle part avant.
