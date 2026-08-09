# Décisions d'architecture — Irrigation Pro

Registre des choix techniques arbitrés par le lead. Chaque décision indique
**ce qui a été choisi**, **pourquoi**, et **ce que ça exclut**.

---

## D-001 — Backend : Express 5 + TypeScript (plutôt que NestJS)

**Choisi :** Express 5 + TypeScript, en modules ESM, organisé en dossiers métier
(`api/`, `auth/`, `db/`, `engine/`, `reports/`).

**Pourquoi :** le cadrage autorise « NestJS ou Express + TypeScript ». Le projet
a un périmètre borné (≈ 20 endpoints) et un seul développeur. NestJS impose une
couche de décorateurs et d'injection de dépendances qui coûte plus qu'elle ne
rapporte à cette échelle, et rend la relecture plus difficile pour un
non-spécialiste. Express reste explicite : une route = une fonction.

**Exclut :** décorateurs, modules Nest, `@nestjs/*`.

---

## D-002 — Base de données : PostgreSQL **hébergé chez Supabase**, avec `pg` et migrations SQL manuelles

> **Révisé le 2026-08-09** à la demande du propriétaire : la base n'est plus
> installée localement, elle est hébergée par Supabase (projet `irrigation-pro`).
> **Supabase sert de base de données, et de rien d'autre.**

**Ce que ça change :** l'adresse de connexion (`DATABASE_URL`), et le fait que
le chiffrement TLS devient obligatoire même en développement, puisque la base
n'est plus sur la machine.

**Ce que ça ne change pas :** le schéma, les migrations, les repositories et
toute la logique d'isolation restent identiques — Supabase, c'est du PostgreSQL
standard. L'authentification reste **la nôtre**, dans le backend :
l'authentification intégrée de Supabase n'est pas utilisée, car le cahier des
charges impose un modèle qu'elle ne couvre pas (aucune inscription libre,
comptes créés à la main par le propriétaire, statut ACTIF/SUSPENDU, changement
de mot de passe obligatoire à la première connexion) et parce qu'avoir les
comptes à deux endroits est une source de désynchronisation.

**L'application n'appelle jamais Supabase directement.** Elle ne parle qu'à
notre API. C'est ce qui permet aux formules de calcul de rester sur le serveur
(cf. D-007).



**Choisi :** driver `pg` (node-postgres) + un runner de migrations maison qui
exécute des fichiers `.sql` numérotés, dans une transaction, avec une table
`schema_migrations` pour la traçabilité.

**Pourquoi :** le schéma est le socle du produit et doit rester lisible tel quel
(contraintes d'intégrité, index, `ON DELETE`). Un ORM (Prisma, TypeORM) masque
le SQL généré, complique les contraintes fines d'isolation par utilisateur, et
ajoute une étape de génération de code à chaque changement. Ici le SQL est écrit
à la main, versionné, et relisible.

**Règle :** toutes les requêtes passent par des **requêtes paramétrées**
(`$1, $2…`). Aucune concaténation de chaîne dans du SQL, jamais.

**Exclut :** Prisma, TypeORM, Drizzle, Sequelize.

---

## D-003 — Hachage des mots de passe : `scrypt` (module `node:crypto`)

**Choisi :** `scrypt` de la bibliothèque standard Node, paramètres
N=2^16, r=8, p=1, sel aléatoire de 16 octets, comparaison en temps constant
(`timingSafeEqual`). Format stocké : `scrypt$N$r$p$sel$hash` (base64).

**Pourquoi :** argon2id serait le choix par défaut, mais les implémentations
Node (`argon2`, `bcrypt`) nécessitent une compilation native qui échoue
régulièrement sur Windows sans outils de build. `scrypt` est recommandé par
l'OWASP, présent nativement dans Node, sans aucune dépendance à installer, et
donc sans risque de casse à l'installation. Le format stocké est
auto-descriptif : migrer vers argon2id plus tard ne demandera qu'un
re-hachage à la connexion suivante.

**Exclut :** `bcrypt`, `argon2` (dépendances natives).

---

## D-004 — Application cliente : Tauri v2 + React 19 + TypeScript + Vite

**Choisi :** Tauri v2 comme coque desktop, cible **Windows uniquement en V1**.
Interface React 19 + TypeScript, bundler Vite, styles Tailwind CSS v4,
routage `react-router`, appels serveur via `@tanstack/react-query`.

**Pourquoi :** Tauri produit un binaire de quelques Mo (contre ~150 Mo pour
Electron) et n'expose pas Node au frontend, ce qui réduit la surface d'attaque.
L'interface se développe et se teste dans un navigateur (`npm run dev`) sans
avoir besoin de la coque desktop.

**Prérequis à installer sur le poste de build :** la chaîne Rust
(<https://rustup.rs>) et Microsoft Visual Studio Build Tools. Tant qu'ils sont
absents, l'interface se développe en mode web ; seul l'empaquetage `.exe` est
bloqué.

**Exclut :** Electron, cibles macOS/Linux en V1.

---

## D-005 — Authentification : JWT court + refresh token révocable

**Choisi :** un jeton d'accès JWT de courte durée (15 min, signé HS256 via
`jose`) et un jeton de rafraîchissement long (30 j) **stocké haché en base**,
donc révocable individuellement.

**Pourquoi :** l'application est un logiciel installé, pas un onglet de
navigateur : elle doit rester connectée plusieurs jours sans redemander le mot
de passe. Un JWT seul n'est pas révocable — or le cadrage exige qu'un compte
passé en `SUSPENDU` perde l'accès immédiatement. Le refresh token en base
apporte cette révocation ; le jeton d'accès court limite la fenêtre pendant
laquelle une suspension n'est pas encore effective à 15 minutes maximum.

**Détail (Vague 1) :** le statut du compte est **revérifié en base à chaque
requête authentifiée**, pas seulement à la connexion.

### D-005b — Transport des jetons : en-tête et corps JSON, **aucun cookie**

**Choisi :** jeton d'accès dans l'en-tête `Authorization: Bearer …` ; jeton de
rafraîchissement transmis dans le corps JSON de `/api/auth/login` et
`/api/auth/refresh`. Aucun cookie de session.

**Pourquoi :** l'application est servie depuis l'origine `tauri://localhost` et
appelle une autre origine. Un cookie serait donc un cookie tierce-partie
(`SameSite=None; Secure`), soumis aux politiques du moteur WebView de Windows —
une dépendance fragile pour la fonction la plus critique du produit. Par
ailleurs l'application doit de toute façon conserver le jeton entre deux
lancements, ce qu'un cookie ne lui permettrait pas de faire proprement.

**Conséquence :** `credentials: true` dans la configuration CORS devient inutile
et doit passer à `false` en Vague 1. Aucun cookie n'étant échangé, la surface
CSRF classique disparaît.

**Conséquence côté stockage client :** le jeton de rafraîchissement est un
secret durable. Il doit être rangé par l'application dans un emplacement protégé
par le système (trousseau Windows via un greffon Tauri), **jamais** dans
`localStorage` ni dans un fichier en clair. À traiter en Vague 1.

---

## D-006 — Tests : Vitest

**Choisi :** Vitest pour le backend et l'application.

**Pourquoi :** natif ESM et TypeScript sans configuration de transpilation,
même moteur que Vite côté frontend — un seul outil de test pour tout le repo.

**Exclut :** Jest.

---

## D-007 — Le moteur de calcul s'exécute **exclusivement côté serveur**

**Choisi :** `backend/src/engine/` n'est jamais livré au client. L'application
envoie des paramètres d'entrée et reçoit des résultats ; les formules
(FAO 56, Manning-Strickler, Hazen-Williams, pompage) ne transitent jamais.

**Pourquoi :** c'est le cœur de valeur du produit. Une application desktop est
décompilable — tout code de calcul embarqué serait lisible par un concurrent.

**Seule exception admise :** des contrôles de saisie triviaux côté interface
(« ce champ doit être un nombre positif »), toujours **redoublés** côté serveur.

---

## D-009 — Fermeture de l'API publique de Supabase sur nos tables

**Le risque :** Supabase publie automatiquement une API REST (PostgREST) sur
toutes les tables du schéma `public`. Une clé « anon » est faite pour être
distribuée publiquement. Sans précaution, n'importe qui disposant de l'URL du
projet et de cette clé pourrait donc lire nos tables — dont `users` et
`projects` — **sans jamais passer par notre serveur ni par aucune connexion**.

**Choisi :** activer `ROW LEVEL SECURITY` sur les sept tables **sans définir
aucune politique**. En PostgreSQL, RLS activé sans politique signifie « tout est
refusé ». Les rôles `anon` et `authenticated` de Supabase ne voient donc plus
rien. Les droits `SELECT/INSERT/UPDATE/DELETE` leur sont en outre retirés
explicitement, ceinture et bretelles.

Notre backend, lui, se connecte avec le rôle propriétaire de la base, qui
contourne RLS — son accès est inchangé.

**Pourquoi pas des politiques RLS complètes ?** Parce que l'isolation entre
clients est déjà assurée par le backend, qui est le seul chemin d'accès légitime
(cf. D-007 : les calculs doivent rester serveur). Écrire un second système
d'autorisation dans la base créerait deux sources de vérité à maintenir
d'accord. RLS est ici utilisé comme un **verrou de fermeture**, pas comme un
mécanisme d'autorisation.

**Conséquence opérationnelle :** la clé `service_role` de Supabase ne doit
**jamais** quitter le serveur, et l'application installée ne reçoit aucune clé
Supabase, d'aucune sorte.

---

## D-010 — Une suspension de compte prend effet en moins de 15 minutes

**Choisi :** le statut du compte est relu **en base à chaque requête
authentifiée**, et pas seulement à la connexion. Le jeton d'accès étant de
courte durée, un compte suspendu perd l'accès au plus tard au bout de 15
minutes, et immédiatement sur toute action passant par le serveur.

**Pourquoi c'est important commercialement :** c'est le seul levier du
propriétaire. Un client qui ne paie plus doit perdre l'accès de façon fiable,
sans qu'il soit possible de « rester connecté » indéfiniment en gardant
l'application ouverte.

**Mise en œuvre :** à la suspension, toutes les sessions longues du compte sont
révoquées en base. Le jeton d'accès en cours reste techniquement valide jusqu'à
son expiration, mais toute requête est refusée puisque le statut est revérifié.

---

## D-008 — Aucun paiement, aucune licence technique

Rappel du cadrage, inscrit ici pour qu'aucune vague ultérieure ne le remette en
cause : pas d'API de paiement, pas de webhook, pas de clé de licence, pas
d'empreinte matérielle, pas d'expiration automatique. Le seul contrôle d'accès
est le statut de compte `ACTIF` / `SUSPENDU`, modifié à la main par
l'administrateur depuis son dashboard.
