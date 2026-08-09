# Base de données — Irrigation Pro

Ce dossier contient **tout ce qui touche à la base de données** : la connexion,
le schéma (les tables), et les fonctions d'accès aux données.

Ce document est écrit pour être compréhensible sans connaissance en
développement. Suivez les étapes dans l'ordre.

---

## 1. Installer PostgreSQL

PostgreSQL est le logiciel qui stocke les données (comptes, projets, calculs).
Il s'installe une seule fois sur la machine qui héberge le serveur.

**Sur Windows :**

1. Télécharger l'installeur sur <https://www.postgresql.org/download/windows/>
   (choisir la version 16 ou plus récente).
2. Lancer l'installeur, tout laisser par défaut.
3. **Noter le mot de passe** demandé pour l'utilisateur `postgres` : il sera
   redemandé juste après.
4. Laisser le port proposé (`5432`).

Pour vérifier que l'installation a réussi, ouvrir l'application
**« SQL Shell (psql) »** installée avec PostgreSQL : elle doit demander le mot
de passe puis afficher une invite `postgres=#`.

---

## 2. Créer la base et son utilisateur

Toujours dans **SQL Shell (psql)**, copier-coller ces quatre lignes une par une
(en remplaçant `un_mot_de_passe_solide` par un vrai mot de passe) :

```sql
CREATE USER irrigation WITH PASSWORD 'un_mot_de_passe_solide';
CREATE DATABASE irrigation_pro OWNER irrigation;
CREATE DATABASE irrigation_pro_test OWNER irrigation;
GRANT ALL PRIVILEGES ON DATABASE irrigation_pro, irrigation_pro_test TO irrigation;
```

Trois choses ont été créées :

| Élément | À quoi ça sert |
|---|---|
| `irrigation` | le compte que le serveur utilise pour parler à la base |
| `irrigation_pro` | la vraie base, celle qui contient les données de travail |
| `irrigation_pro_test` | une base séparée, **vidée à chaque exécution des tests** |

> ⚠ La base de test est volontairement distincte : les tests automatiques
> effacent son contenu. Elle ne doit jamais pointer sur la base de travail.

---

## 3. Renseigner la connexion dans le fichier `.env`

Dans le dossier `backend/`, copier le fichier `.env.example` en `.env`, puis
remplacer le mot de passe dans les deux lignes suivantes :

```
DATABASE_URL=postgresql://irrigation:un_mot_de_passe_solide@localhost:5432/irrigation_pro
TEST_DATABASE_URL=postgresql://irrigation:un_mot_de_passe_solide@localhost:5432/irrigation_pro_test
```

Le fichier `.env` contient des secrets : **il ne doit jamais être partagé ni
envoyé sur un dépôt Git.**

---

## 4. Créer les tables (les « migrations »)

Une **migration** est un fichier qui décrit une modification du schéma de la
base : créer une table, ajouter une colonne… Les fichiers sont numérotés et
appliqués dans l'ordre, une seule fois chacun.

Depuis le dossier `backend/`, dans un terminal :

```bash
npm run migrate           # applique les migrations manquantes
npm run migrate:status    # affiche l'état : appliquées / en attente
```

Sortie attendue la première fois :

```
→ 1 migration(s) à appliquer.
  ✔ 001_init.sql appliquée (84 ms)
✔ Toutes les migrations sont appliquées.
```

Si un message d'erreur apparaît, il indique quoi vérifier (PostgreSQL démarré,
mot de passe correct dans `.env`, base existante).

---

## 5. Ajouter une migration (pour le développeur)

1. Créer un nouveau fichier dans `migrations/`, en respectant la numérotation :
   `002_ajout_xxx.sql`, `003_…`, etc.
2. Y écrire du SQL pur, commenté en français.
   **Ne pas écrire `BEGIN` / `COMMIT`** : le runner encadre déjà chaque fichier
   dans sa propre transaction.
3. Lancer `npm run migrate`.

**Règle absolue : une migration déjà appliquée ne se modifie plus jamais.**
Le runner enregistre l'empreinte (sha256) de chaque fichier appliqué et refuse
de continuer si l'un d'eux a changé — sans quoi deux machines pourraient avoir
un schéma différent sans que personne ne s'en aperçoive. Pour corriger quelque
chose, on crée un nouveau fichier.

---

## 6. Le modèle de données en un coup d'œil

| Table | À quoi elle sert |
|---|---|
| `users` | Les comptes. Créés uniquement par l'administrateur — il n'y a pas d'inscription libre. Contient le statut `ACTIF` / `SUSPENDU`, seul contrôle d'accès du produit. |
| `refresh_tokens` | Les sessions longues de l'application installée, pour rester connecté plusieurs jours. Révocables une par une (déconnexion, suspension d'un compte). |
| `projects` | Les projets d'irrigation du client : nom, client final, lieu, description, avancement. |
| `project_data` | Les résultats des modules de calcul, rattachés à un projet (besoins en eau, canaux, pertes de charge, pompage) avec leurs données d'entrée. |
| `reports` | Les rapports PDF générés, avec leur référence imprimée sur le document. |
| `activity_logs` | Le journal de ce que font les comptes : connexions, créations de projet, générations de rapport. |
| `admin_actions` | Le journal des décisions de l'administrateur : création, suspension, réactivation, réinitialisation de mot de passe. |
| `schema_migrations` | Table technique : la liste des migrations déjà appliquées. Ne pas y toucher à la main. |

### Comment les clients sont cloisonnés

C'est le point de sécurité le plus important du produit : **un client ne doit
jamais pouvoir voir les données d'un autre client.**

La colonne qui garantit ce cloisonnement est **`owner_id`** :

- `projects.owner_id` → le compte propriétaire du projet ;
- `reports.owner_id` → le compte propriétaire du rapport (l'information est
  volontairement répétée ici pour pouvoir filtrer sans détour) ;
- `project_data` n'a pas de `owner_id` : elle est rattachée à un projet, et
  toutes les requêtes qui la lisent passent par `projects.owner_id`.

Concrètement, dans le code (`repositories/projects.repo.ts`), **aucune fonction
ne peut lire ou modifier un projet sans qu'on lui donne l'identifiant du
propriétaire**, et cet identifiant est intégré à la requête envoyée à la base.
Si un client tente d'ouvrir le projet d'un autre, la base ne renvoie aucune
ligne — comme si le projet n'existait pas.

### Ce que la base ne contient jamais

- **Aucun mot de passe en clair**, y compris les mots de passe temporaires
  créés par l'administrateur : seule une empreinte irréversible est stockée
  (`users.password_hash`).
- **Aucun jeton de session en clair** : seule son empreinte est conservée
  (`refresh_tokens.token_hash`).
- Aucune donnée de paiement, aucune clé de licence, aucune date d'expiration
  automatique — ces notions sont volontairement absentes du produit
  (voir `docs/DECISIONS.md`, D-008).

---

## 7. Les fichiers de ce dossier

| Fichier | Rôle |
|---|---|
| `pool.ts` | Ouvre et configure les connexions à PostgreSQL. |
| `index.ts` | Les outils utilisés par tout le backend : exécuter une requête, une transaction, vérifier que la base répond. |
| `executor.ts` | Petit utilitaire permettant à une requête de rejoindre une transaction en cours. |
| `migrate.ts` | Le programme lancé par `npm run migrate`. |
| `migrations/*.sql` | Le schéma de la base, fichier par fichier. |
| `repositories/*.repo.ts` | Les requêtes SQL regroupées par sujet (comptes, projets, journaux). |

---

## 8. En cas de problème

| Message | Cause probable |
|---|---|
| `ECONNREFUSED` / `connexion refusée` | PostgreSQL n'est pas démarré, ou le port n'est pas `5432`. |
| `password authentication failed` | Le mot de passe de `DATABASE_URL` dans `.env` ne correspond pas. |
| `database "irrigation_pro" does not exist` | L'étape 2 n'a pas été faite, ou le nom de la base diffère. |
| `Des migrations DÉJÀ APPLIQUÉES ont été modifiées` | Un fichier `.sql` déjà passé a été retouché : le remettre en l'état et créer un nouveau fichier. |

Sur un poste où PostgreSQL n'est pas installé, le serveur démarre quand même :
l'endpoint `/health` signale simplement que la base est injoignable.
