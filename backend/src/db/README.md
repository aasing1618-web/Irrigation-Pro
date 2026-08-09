# Base de données — Irrigation Pro

Ce dossier contient **tout ce qui touche à la base de données** : la connexion,
le schéma (les tables), et les fonctions d'accès aux données.

La base est hébergée chez **Supabase**, qui nous fournit un PostgreSQL prêt à
l'emploi. **Il n'y a rien à installer sur l'ordinateur** — ni PostgreSQL, ni
outil en ligne de commande Supabase.

> **Supabase ne sert QUE de base de données.** Nous n'utilisons ni son système
> de comptes, ni son stockage de fichiers, ni son API. L'application installée
> chez le client ne parle jamais à Supabase : elle ne parle qu'à notre serveur.
> (Voir `docs/DECISIONS.md`, D-002.)

Ce document est écrit pour être suivi sans connaissance en développement.
Faites les étapes dans l'ordre.

---

## 1. Créer le projet Supabase

1. Créer un compte sur <https://supabase.com>, puis un projet (bouton
   **New project**).
2. Choisir un nom (`irrigation-pro`), une région proche des utilisateurs, et un
   **mot de passe de base de données** — le noter tout de suite dans un endroit
   sûr, il n'est plus affiché ensuite.
3. Attendre deux ou trois minutes que le projet soit prêt.
4. Créer un **second projet** pour les tests, par exemple `irrigation-pro-test`.

> ⚠ Le projet de test doit être **séparé** : les tests automatiques effacent son
> contenu. Ne jamais y mettre l'adresse du projet réel.

---

## 2. Récupérer la chaîne de connexion

Dans le tableau de bord du projet :
**Project Settings → Database → Connection string**.

Supabase y propose plusieurs onglets. Deux nous concernent :

| Onglet | Port | Ce que c'est | Quand l'utiliser |
|---|---|---|---|
| **Direct connection** | `5432` | Une vraie connexion à PostgreSQL, sans intermédiaire. | Pour les **migrations** (créer et modifier les tables). |
| **Transaction pooler** | `6543` | Un intermédiaire qui recycle les connexions entre plusieurs demandes. Économise les ressources. | Pour le **serveur au quotidien**, s'il gère beaucoup d'utilisateurs. |

**En pratique, pour démarrer : prenez la connexion directe (port 5432) et
mettez-la partout.** C'est le réglage le plus simple et il fonctionne pour tout.
Le pooler est une optimisation à envisager plus tard.

Choisir le format **URI**. On obtient une ligne de cette forme :

```
postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijkl.supabase.co:5432/postgres
```

Remplacer `[YOUR-PASSWORD]` par le mot de passe noté à l'étape 1.

> Si le mot de passe contient des caractères comme `@`, `:`, `/` ou `#`, il faut
> les encoder (`@` s'écrit `%40`, `:` s'écrit `%3A`…). Le plus simple est
> d'utiliser un mot de passe long composé uniquement de lettres et de chiffres :
> **Project Settings → Database → Reset database password** permet d'en générer
> un.

---

## 3. Coller la connexion dans `backend/.env`

Dans le dossier `backend/`, copier le fichier `.env.example` en `.env`, puis
remplir :

```
# Connexion utilisée par le serveur
DATABASE_URL=postgresql://postgres:motdepasse@db.abcdefghijkl.supabase.co:5432/postgres

# Connexion du projet Supabase de TEST (une base à part, vidée par les tests)
TEST_DATABASE_URL=postgresql://postgres:motdepasse@db.mnopqrstuvwx.supabase.co:5432/postgres
```

Deux variables **facultatives** existent en plus :

| Variable | À quoi elle sert | Quand la renseigner |
|---|---|---|
| `DIRECT_DATABASE_URL` | Connexion directe (port 5432) réservée aux migrations. | Uniquement si `DATABASE_URL` pointe sur le **pooler** (port 6543). Voir § 4. |
| `DATABASE_SSL_CA` | Chemin vers le certificat de sécurité de Supabase. | Uniquement si la connexion échoue avec un message parlant de « certificate ». Voir § 7. |

> Le fichier `.env` contient des secrets : **il ne doit jamais être partagé, ni
> envoyé sur un dépôt Git, ni collé dans une discussion.**

### 🔴 La clé `service_role` ne doit JAMAIS quitter le serveur

Supabase affiche aussi, dans **Project Settings → API**, une clé nommée
`service_role`. **Cette clé donne un accès total à toute la base, sans aucune
restriction.**

- Elle ne doit **jamais** être placée dans l'application installée chez le
  client (un logiciel installé peut être ouvert et lu : tout ce qu'il contient
  est public).
- Elle ne doit **jamais** être envoyée par WhatsApp, par e-mail, ni figurer dans
  une capture d'écran.
- Elle n'est en réalité **pas nécessaire à ce projet** : notre serveur se
  connecte avec la chaîne PostgreSQL classique (`DATABASE_URL`). Le plus sûr est
  donc de ne la copier nulle part.

Si elle a été exposée, la remplacer immédiatement depuis le tableau de bord
Supabase.

---

## 4. Créer les tables (les « migrations »)

Une « migration » est un fichier qui décrit une modification de la base. Nous
avons notre propre programme pour les appliquer — pas besoin d'installer quoi
que ce soit.

Depuis le dossier `backend/` :

```bash
npm run migrate           # applique les migrations manquantes
npm run migrate:status    # affiche ce qui est appliqué et ce qui reste à faire
```

Sortie attendue la première fois :

```
Base visée : db.abcdefghijkl.supabase.co (DATABASE_URL)
→ 2 migration(s) à appliquer.
  ✔ 001_init.sql appliquée (842 ms)
  ✔ 002_verrouillage_supabase.sql appliquée (96 ms)
✔ Toutes les migrations sont appliquées.
```

Faire la même chose pour le projet de test si l'on veut lancer les tests.

**Les migrations doivent passer par la connexion directe (port 5432).** Si
`DATABASE_URL` pointe sur le pooler (port 6543), renseigner en plus, dans
`.env` :

```
DIRECT_DATABASE_URL=postgresql://postgres:motdepasse@db.abcdefghijkl.supabase.co:5432/postgres
```

Le programme de migration l'utilisera automatiquement. La raison est technique :
le pooler mélange les connexions entre plusieurs demandes, ce qui empêche le
verrou qui protège contre deux migrations lancées en même temps, et supporte mal
les opérations longues de création de tables.

---

## 5. La migration 002 — pourquoi elle est indispensable

**En une phrase :** elle ferme la porte que Supabase ouvre automatiquement sur
nos tables, pour que nos données soient accessibles **uniquement à travers notre
serveur**.

En détail, et en français simple : Supabase publie tout seul une adresse web
permettant de lire les tables de la base, utilisable avec une clé dite « anon »
qui est **publique par nature**. Sans précaution, quelqu'un connaissant
l'adresse du projet pourrait donc télécharger la liste de tous les comptes
clients et de tous les projets **sans jamais passer par notre logiciel ni par
aucun mot de passe**.

La migration `002_verrouillage_supabase.sql` verrouille les sept tables : elle
active un mécanisme de PostgreSQL (*Row Level Security*) sans y associer la
moindre autorisation, ce qui revient à « personne ne passe », et elle retire
en plus explicitement tous les droits des deux rôles publics de Supabase.

Notre serveur, lui, se connecte avec le compte propriétaire de la base : son
accès est inchangé.

**Elle doit être appliquée sur chaque projet Supabase, y compris celui de test.**
Le fichier lui-même est abondamment commenté : tout y est expliqué, y compris
pourquoi nous n'activons volontairement pas l'option `FORCE`, qui bloquerait
notre propre serveur.

---

## 6. Ajouter une migration (pour le développeur)

1. Créer un fichier dans `migrations/`, en respectant la numérotation :
   `003_ce_que_ca_fait.sql`.
2. Y écrire du SQL pur, commenté en français.
   **Ne pas écrire `BEGIN` / `COMMIT`** : le programme encadre déjà chaque
   fichier dans sa propre transaction.
3. Lancer `npm run migrate`, d'abord sur le projet de test, puis sur le projet
   réel.

**Règle absolue : une migration déjà appliquée ne se modifie plus jamais.**
Une empreinte de chaque fichier est enregistrée en base ; si un fichier déjà
appliqué change, le programme s'arrête et le signale. Sans cela, la base de
test et la base réelle pourraient diverger sans que personne ne s'en aperçoive.
Pour corriger quelque chose, on crée un nouveau fichier.

---

## 7. Le modèle de données en un coup d'œil

| Table | À quoi elle sert |
|---|---|
| `users` | Les comptes. Créés uniquement par l'administrateur — il n'y a pas d'inscription libre. Contient le statut `ACTIF` / `SUSPENDU`, seul contrôle d'accès du produit. |
| `refresh_tokens` | Les sessions longues de l'application installée, pour rester connecté plusieurs jours. Révocables une par une (déconnexion, suspension d'un compte). |
| `projects` | Les projets d'irrigation du client : nom, client final, lieu, description, avancement. |
| `project_data` | Les résultats des modules de calcul, rattachés à un projet (besoins en eau, canaux, pertes de charge, pompage) avec leurs données d'entrée. |
| `reports` | Les rapports PDF générés, avec leur référence imprimée sur le document. |
| `activity_logs` | Le journal de ce que font les comptes : connexions, changements de mot de passe, déconnexions. |
| `admin_actions` | Le journal des décisions de l'administrateur : création, suspension, réactivation, réinitialisation de mot de passe. |
| `schema_migrations` | Table technique : la liste des migrations déjà appliquées. Ne pas y toucher à la main. |

> Ce schéma garde une table `users` à nous plutôt que le système de comptes de
> Supabase, parce que les comptes sont créés uniquement par le propriétaire et
> que le produit impose un statut `ACTIF`/`SUSPENDU` et un changement de mot de
> passe obligatoire à la première connexion (cf. D-002).

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

Le verrouillage de la migration 002 (§ 5) et ce cloisonnement par `owner_id`
répondent à deux questions différentes : le premier garantit qu'on ne peut pas
contourner notre serveur, le second qu'à travers notre serveur, chacun ne voit
que ses données.

### Ce que la base ne contient jamais

- **Aucun mot de passe en clair**, y compris les mots de passe temporaires créés
  par l'administrateur : seule une empreinte irréversible est stockée
  (`users.password_hash`).
- **Aucun jeton de session en clair** : seule son empreinte est conservée
  (`refresh_tokens.token_hash`).
- **Aucun secret dans les journaux** : avant d'écrire une ligne de journal, le
  code remplace automatiquement la valeur de toute information dont le nom
  évoque un mot de passe, un jeton ou une empreinte par `[retiré]`.
- Aucune donnée de paiement, aucune clé de licence, aucune date d'expiration
  automatique — ces notions sont volontairement absentes du produit
  (voir `docs/DECISIONS.md`, D-008).

---

## 8. Les fichiers de ce dossier

| Fichier | Rôle |
|---|---|
| `pool.ts` | Ouvre et configure les connexions au PostgreSQL de Supabase. C'est là qu'est imposé le chiffrement TLS. |
| `index.ts` | Les outils utilisés par tout le backend : exécuter une requête, une transaction, vérifier que la base répond. |
| `executor.ts` | Petit utilitaire permettant à une requête de rejoindre une transaction en cours. |
| `migrate.ts` | Le programme lancé par `npm run migrate`. |
| `migrations/*.sql` | Le schéma de la base, fichier par fichier, numéroté. |
| `repositories/users.repo.ts` | Les requêtes sur les comptes. |
| `repositories/refresh-tokens.repo.ts` | Les requêtes sur les sessions longues. |
| `repositories/projects.repo.ts` | Les requêtes sur les projets et leurs calculs. |
| `repositories/activity-logs.repo.ts` | Les requêtes sur les deux journaux. |

### Deux règles de code, valables partout dans ce dossier

1. **Toutes les requêtes sont paramétrées** (`$1`, `$2`…). On ne construit
   jamais du SQL en collant bout à bout des morceaux de texte venant de
   l'utilisateur : c'est la porte ouverte aux injections SQL.
2. **Pas de requête préparée nommée, pas de `LISTEN`/`NOTIFY`.** Ces deux
   mécanismes de PostgreSQL ne fonctionnent pas à travers le pooler de Supabase.
   L'explication complète est en tête de `pool.ts`.

---

## 9. En cas de problème

| Message | Cause probable et solution |
|---|---|
| `ECONNREFUSED` / `ETIMEDOUT` | Le projet Supabase est en pause (offre gratuite, après une semaine sans activité) : le rouvrir depuis le tableau de bord. Sinon, vérifier la connexion internet. |
| `password authentication failed` | Le mot de passe dans `DATABASE_URL` ne correspond pas. Le réinitialiser depuis **Project Settings → Database → Reset database password**, puis remettre la nouvelle valeur dans `.env`. |
| `self-signed certificate in certificate chain` ou tout message contenant « certificate » | Le certificat de Supabase n'est pas reconnu par le système. Télécharger le certificat depuis **Project Settings → Database → SSL Configuration**, l'enregistrer par exemple dans `backend/supabase-ca.crt`, et ajouter dans `.env` : `DATABASE_SSL_CA=./supabase-ca.crt`. **Ne jamais désactiver la vérification** : ce serait accepter n'importe quel interlocuteur. |
| `prepared statement "…" already exists` | Une requête préparée nommée a été introduite quelque part et le serveur passe par le pooler. Voir la règle 2 du § 8. |
| `unsupported startup parameter` | La connexion passe par un pooler qui refuse nos réglages de sécurité : utiliser la connexion directe (port 5432). |
| `Des migrations DÉJÀ APPLIQUÉES ont été modifiées` | Un fichier `.sql` déjà passé a été retouché : le remettre en l'état et créer un nouveau fichier. |
| `permission denied for table users` | La migration 002 a été appliquée et quelque chose tente d'accéder aux tables autrement que par notre serveur. C'est le comportement attendu — voir § 5. |

Sur un poste sans connexion internet, le serveur démarre quand même :
l'endpoint `/health` signale simplement que la base est injoignable.
