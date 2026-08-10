# Irrigation Pro

Logiciel professionnel de dimensionnement en irrigation, destiné aux bureaux
d'études, ingénieurs agronomes et installateurs. Il remplace les classeurs Excel
par une véritable application métier : projets, calculs, rapports PDF.

---

## Les quatre composants

| Dossier | Ce que c'est | Qui l'utilise |
|---|---|---|
| `backend/` | Le serveur : API, base de données, moteur de calcul, génération des PDF | Personne directement — c'est le cerveau |
| `app/` | L'application installée sur l'ordinateur du client | Le client |
| `admin/` | Le tableau de bord de gestion des comptes | Le propriétaire, seul |
| `site/` | Le site vitrine public avec le bouton WhatsApp | Les prospects |

Le détail des choix techniques et de leurs raisons se trouve dans
[`docs/DECISIONS.md`](docs/DECISIONS.md). Le cahier des charges produit fait foi
dans [`CLAUDE.md`](CLAUDE.md).

---

## Ce qu'il faut installer sur le poste de développement

| Outil | Pourquoi | Où |
|---|---|---|
| **Node.js 20 ou plus** | Fait tourner le serveur et les interfaces | <https://nodejs.org> |
| **PostgreSQL 15 ou plus** | La base de données qui stocke comptes et projets | <https://www.postgresql.org/download/windows/> |
| **Rust (rustup)** | Uniquement pour fabriquer le `.exe` Windows de l'application | <https://rustup.rs> |
| **Visual Studio Build Tools** | Requis par Rust sur Windows (charge de travail « Développement Desktop en C++ ») | <https://visualstudio.microsoft.com/downloads/> |

Node.js suffit pour développer et tester. PostgreSQL devient nécessaire à la
Vague 1 (comptes). Rust n'est nécessaire qu'au moment de produire le fichier
d'installation livré au client.

---

## Démarrer le serveur

```bash
cd backend
cp .env.example .env      # puis remplir les valeurs, surtout DATABASE_URL et JWT_SECRET
npm install
npm run migrate           # crée les tables (nécessite PostgreSQL en marche)
npm run dev               # le serveur écoute sur http://localhost:4000
```

Vérifier qu'il répond : ouvrir <http://localhost:4000/health> dans un
navigateur. Une réponse `"status": "ok"` signifie que le serveur **et** la base
de données fonctionnent.

## Démarrer l'application cliente

```bash
cd app
npm install
npm run dev               # interface accessible sur http://localhost:5173
```

Le serveur doit tourner en parallèle, sinon l'application affiche un écran
« serveur injoignable » — c'est le comportement attendu.

## Lancer les tests

```bash
cd backend && npm test
cd app && npm test
```

---

## Avancement par vagues

L'ordre est imposé par le cahier des charges : une vague n'est lancée que si la
précédente est validée.

- [x] **Vague 0 — Fondations** : structure du repo, modèle de données, serveur et application connectés
- [x] **Vague 1 — Connexion et comptes** : authentification, statut ACTIF/SUSPENDU
- [x] **Vague 2 — Projets et calculs** : CRUD projets, besoins en eau (FAO), Manning-Strickler
- [ ] **Vague 3 — Rapports PDF et dashboard admin**
- [ ] **Vague 4 — Finitions** : WhatsApp, version, site vitrine
- [ ] **Vague 5 — Sécurité et tests finaux**

Le compte rendu de chaque vague est publié dans [`docs/`](docs/).

---

## Règles non négociables

Elles sont détaillées dans `CLAUDE.md`, rappelées ici parce qu'elles ne doivent
jamais être contournées :

- Un client ne voit **que** ses propres projets — vérifié côté serveur à chaque requête.
- Les mots de passe ne sont **jamais** stockés en clair, même les temporaires.
- Les formules de calcul s'exécutent **côté serveur**, jamais dans l'application livrée.
- Aucune intégration de paiement, aucune clé de licence, aucune expiration
  automatique. Le seul contrôle d'accès est le statut du compte.
