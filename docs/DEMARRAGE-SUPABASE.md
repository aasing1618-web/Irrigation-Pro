# Brancher la base Supabase — marche à suivre

Projet Supabase : **`irrigation-pro`** — `https://vkfaeyfwxjgfzmsinmoq.supabase.co`

Tout est configuré sauf **une** valeur, que je ne peux pas obtenir moi-même :
le mot de passe de votre base. Comptez cinq minutes.

---

## Étape 1 — Récupérer la chaîne de connexion

1. Ouvrez votre projet sur <https://supabase.com/dashboard>.
2. Menu **Project Settings** → **Database**.
3. Section **Connection string**, onglet **Transaction pooler**
   (parfois appelé « Connection pooling », mode *Transaction*, port **6543**).
4. Copiez la chaîne. Elle ressemble à :

   ```
   postgresql://postgres.vkfaeyfwxjgfzmsinmoq:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```

5. Remplacez `[YOUR-PASSWORD]` par le mot de passe de la base — celui choisi à la
   création du projet. Si vous l'avez perdu, le même écran permet de le
   réinitialiser (bouton **Reset database password**).

> **Pourquoi le *pooler* et pas la connexion directe ?**
> J'ai testé les deux depuis votre machine. La connexion directe
> (`db.vkfaeyfwxjgfzmsinmoq.supabase.co`) n'existe qu'en **IPv6**, et votre
> réseau n'a pas d'IPv6 — elle est donc injoignable, et le resterait pour la
> plupart de vos futurs clients. Le pooler répond en IPv4 : c'est la bonne
> adresse, ce n'est pas un contournement.

---

## Étape 2 — Coller la chaîne

Ouvrez `backend/.env` et remplacez la ligne :

```
DATABASE_URL=COLLER_ICI_LA_CHAINE_POOLER_SUPABASE
```

par votre chaîne complète. **Ce fichier n'est jamais envoyé sur GitHub** — il
est exclu du dépôt, et il doit le rester.

Si le mot de passe contient des caractères spéciaux (`@`, `:`, `/`, `#`, `?`),
ils doivent être encodés. Le plus simple est de réinitialiser le mot de passe en
demandant à Supabase d'en générer un — il sera alors sans caractère gênant.

---

## Étape 3 — Créer les tables

```bash
cd backend
npm run migrate
```

Trois migrations doivent s'appliquer :

| Migration | Ce qu'elle fait |
|---|---|
| `001_init` | Crée les 7 tables du produit |
| `002_verrouillage_supabase` | **Ferme l'API REST publique de Supabase sur vos tables** |
| `003_motif_revocation` | Ajoute le motif de révocation des sessions |

**La migration 002 est la plus importante des trois.** Supabase publie
automatiquement une API REST sur toutes vos tables, accessible avec une clé dite
« anon » faite pour être distribuée publiquement. Tant que cette migration n'est
pas passée, vos tables `users` et `projects` sont lisibles **sans mot de passe
et sans passer par votre serveur**. Après, elles ne le sont plus.

Pour vérifier à tout moment ce qui est appliqué :

```bash
npm run migrate:status
```

---

## Étape 4 — Créer votre compte propriétaire

```bash
npm run creer-admin -- --email "votre@email.com" --nom "Votre Nom"
```

La commande affiche un mot de passe temporaire **une seule fois**. Notez-le : il
n'est stocké nulle part en clair et ne pourra pas être réaffiché. Vous devrez le
changer à votre première connexion.

---

## Étape 5 — Essayer

Deux terminaux :

```bash
cd backend && npm run dev     # serveur sur http://localhost:4000
cd app     && npm run dev     # interface sur http://localhost:5173
```

Ouvrez <http://localhost:5173>, connectez-vous avec le compte créé à l'étape 4.
Vous devriez être obligé de changer votre mot de passe, puis entrer dans
l'application.

---

## Règles de sécurité à ne jamais oublier

- La clé **`service_role`** de Supabase donne tous les droits sur la base. Elle
  ne doit **jamais** quitter le serveur : ni dans l'application installée, ni
  sur GitHub, ni dans un message.
- Le fichier `backend/.env` contient votre mot de passe de base et le secret de
  signature des sessions. Il est exclu du dépôt — **ne l'ajoutez jamais à la
  main**, et ne le partagez pas.
- Si l'un de ces secrets a été exposé, changez-le : mot de passe de base depuis
  le tableau de bord Supabase, secret de signature en regénérant la valeur de
  `JWT_SECRET`. Regénérer `JWT_SECRET` déconnecte tout le monde, sans autre
  conséquence.
