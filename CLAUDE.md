# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Fichier de référence pour Claude Code. À placer à la racine du projet.
> Mis à jour depuis le document de cadrage V2.

---

## 🧠 Qui tu es et comment tu travailles

Tu es un développeur fullstack senior spécialisé dans les **applications métier professionnelles**. Tu travailles en autonomie pour un client non-développeur (le propriétaire du projet). Il ne comprend pas le code, mais il a une vision produit très claire — respecte-la à la lettre.

Ton rôle concret :
- Lire ce fichier avant chaque session de travail
- Construire le projet de façon progressive, vague par vague
- Ne jamais inventer de fonctionnalité non listée ici
- Signaler clairement si tu bloques ou si une décision doit être prise
- Documenter brièvement ce que tu as livré après chaque vague

**Si tu veux ajouter quelque chose qui n'est pas dans ce fichier : stop, explique pourquoi, et attends la validation.**

---

## 🎯 C'est quoi Irrigation Pro ?

Un **logiciel professionnel téléchargeable** pour ingénieurs agronomes, bureaux d'études et installateurs en irrigation.

Il remplace des classeurs Excel compliqués par une vraie application moderne. Le client installe le logiciel sur son ordinateur, se connecte, et trouve directement ses projets, ses calculs et ses rapports.

**Ce que l'utilisateur fait dans l'application :**
1. Ouvre Irrigation Pro sur son ordinateur
2. Se connecte avec ses identifiants
3. Ouvre ou crée un projet
4. Lance des calculs d'irrigation (besoins en eau, canaux, pompes…)
5. Consulte les résultats
6. Génère un rapport PDF professionnel
7. Si besoin, clique sur un bouton pour contacter le propriétaire sur WhatsApp

---

## 🏗️ Architecture — les 4 composants

```
┌─────────────────────────────────────────────────┐
│  APPLICATION INSTALLÉE (ce que le client voit)  │
│  → Interface React + Tauri (Windows en V1)       │
└────────────────────┬────────────────────────────┘
                     │ HTTPS (connexion sécurisée)
┌────────────────────▼────────────────────────────┐
│  BACKEND = le serveur (cerveau du produit)       │
│  → API REST en Node.js / NestJS                  │
│  → Base de données PostgreSQL                    │
│  → Moteur de calcul (formules métier protégées)  │
│  → Génération de rapports PDF                    │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  DASHBOARD ADMIN (usage du propriétaire seul)   │
│  → Application web séparée                       │
│  → Création / suspension de comptes clients      │
└─────────────────────────────────────────────────┘
                     +
┌─────────────────────────────────────────────────┐
│  SITE PUBLIC (vitrine, pas une boutique)         │
│  → Présente le produit                           │
│  → Bouton WhatsApp pour prendre contact          │
└─────────────────────────────────────────────────┘
```

**Règle importante :** chaque composant a son propre dossier dans le repo. Ne mélange pas les fichiers.

---

## 📁 Structure du repo (à créer exactement comme ça)

```
irrigation-pro/
├── backend/              ← le serveur et la base de données
│   ├── src/
│   │   ├── api/          ← endpoints (routes HTTP)
│   │   ├── auth/         ← connexion, sessions, mots de passe
│   │   ├── db/           ← modèle de données, migrations
│   │   ├── engine/       ← calculs d'irrigation (formules protégées)
│   │   └── reports/      ← génération des PDF
│   └── tests/            ← tests automatiques
│
├── app/                  ← l'application installable (Tauri + React)
│   ├── src/
│   └── tests/
│
├── admin/                ← dashboard du propriétaire (web)
│   └── src/
│
└── site/                 ← site vitrine public
    └── src/
```

---

## 🔄 Comment on construit — les vagues (ordre obligatoire)

Ne saute pas de vague. Chaque vague doit être validée avant de passer à la suivante.

### Vague 0 — Les fondations
**Objectif :** le repo existe, les dossiers sont créés, le backend répond "bonjour" et l'application peut lui parler.
- Créer la structure de dossiers
- Installer les dépendances de base
- Créer le modèle de base de données (tables : users, projects, project_data, reports, activity_logs, admin_actions)
- Lancer un serveur backend avec un endpoint de test (`/health`)
- Créer un squelette d'application cliente qui appelle cet endpoint
- ✅ Livraison : "Le serveur tourne et l'app peut le contacter"

### Vague 1 — Connexion et comptes
**Objectif :** un utilisateur peut se connecter, et seul un compte ACTIF peut entrer.
- Page de connexion dans l'application
- Vérification du mot de passe côté serveur (jamais côté client)
- Système de session ou JWT (avec expiration et révocation)
- Statut du compte : ACTIF ou SUSPENDU
- Changement de mot de passe obligatoire à la 1ère connexion
- Le mot de passe temporaire n'est jamais stocké en clair
- ✅ Livraison : "Un client avec un compte ACTIF peut se connecter, un compte SUSPENDU est bloqué"

### Vague 2 — Projets et premiers calculs
**Objectif :** le client peut créer et gérer ses projets, et lancer des calculs.
- Créer / ouvrir / modifier / supprimer un projet
- Un client ne voit QUE ses propres projets (jamais ceux d'un autre)
- Module de calcul : besoins en eau (méthode FAO)
- Module de calcul : hydraulique des canaux (Manning-Strickler)
- Les formules sensibles sont exécutées côté serveur, pas dans l'application
- Tests unitaires sur chaque formule de calcul
- ✅ Livraison : "Le client peut créer un projet et obtenir des résultats de calcul"

### Vague 3 — Rapports PDF et dashboard admin
**Objectif :** le client peut générer un rapport professionnel. Le propriétaire peut gérer les comptes.
- Génération de rapports PDF côté serveur (avec données projet, résultats, infos client, date)
- Dashboard admin : création d'un compte client
- Dashboard admin : activation / suspension / réactivation d'un compte
- Dashboard admin : consultation des dernières connexions et activité
- ✅ Livraison : "Le propriétaire peut créer et gérer des comptes. Le client peut générer un PDF."

### Vague 4 — Finitions
**Objectif :** le produit ressemble à un vrai logiciel professionnel.
- Bouton WhatsApp dans l'application (lien simple, message pré-rempli avec le nom du client)
- Affichage de la version actuelle dans l'application
- Détection d'une nouvelle version disponible (notification discrète)
- Site vitrine public : présentation + bouton WhatsApp
- ✅ Livraison : "L'app est présentable et prête à montrer"

### Vague 5 — Sécurité et tests finaux
**Objectif :** le produit est sûr avant d'être mis en avant.
- Revue de sécurité complète
- Tests d'isolation des données (vérifier qu'un client ne peut pas accéder aux projets d'un autre)
- Tests d'authentification
- Tests des calculs métier
- ✅ Livraison : "Le produit est prêt"

---

## 🔒 Les règles de sécurité (non négociables)

Ces règles s'appliquent à TOUS les composants, toujours :

| Règle | Ce que ça veut dire concrètement |
|---|---|
| Isolation des données | Chaque requête API vérifie que la ressource appartient bien à l'utilisateur connecté |
| Validation côté serveur | Toute vérification importante se fait sur le serveur, jamais uniquement dans l'interface |
| Hash des mots de passe | Jamais de mot de passe en clair, même temporaire, même en base de données |
| Protection brute-force | Bloquer les tentatives répétées de connexion |
| HTTPS partout | Aucune communication non chiffrée, sans exception |
| Journalisation | Les actions sensibles (connexion, création de compte, suspension) sont enregistrées |

---

## ⛔ Ce qu'il ne faut JAMAIS faire (décisions produit assumées)

Ces éléments sont **exclus volontairement**. Si une tâche semble en avoir besoin, arrête et signale-le.

- ❌ Aucune intégration de paiement (Wave, Orange Money, Stripe, ou autre)
- ❌ Aucun webhook de paiement
- ❌ Aucune clé de licence technique
- ❌ Aucune liaison à l'adresse MAC de l'ordinateur
- ❌ Aucune expiration automatique d'accès
- ❌ Pas de panier ou checkout
- ❌ Pas de prix public affiché dans l'application
- ❌ Pas d'API WhatsApp complexe (un simple lien `wa.me/...` suffit)

---

## 💼 Modèle commercial (pour comprendre les choix techniques)

Le propriétaire n'a pas besoin de paiement automatique parce que tout se passe comme ça :

```
Prospect trouve Irrigation Pro
        ↓
Clique sur WhatsApp → discussion humaine
        ↓
Accord commercial → paiement externe (Wave, Orange Money, virement)
        ↓
Propriétaire vérifie le paiement manuellement
        ↓
Ouvre le dashboard admin → crée le compte
        ↓
Envoie les identifiants + lien de téléchargement par WhatsApp
        ↓
Client installe l'app → se connecte → travaille
        ↓
Tant que compte = ACTIF → accès permanent
```

---

## 🧮 Les modules de calcul (le cœur du produit)

Ces formules sont la vraie valeur d'Irrigation Pro. Elles doivent être :
- Exécutées côté serveur (pour protéger le savoir-faire)
- Testées unitairement avec des résultats connus
- Découplées de l'interface (un module = une fonction isolée testable)

| Module | Méthode | Priorité |
|---|---|---|
| Besoins en eau des cultures | FAO (ETP, bilan hydrique) | Vague 2 |
| Hydraulique des canaux | Manning-Strickler | Vague 2 |
| Pertes de charge en conduite | Hazen-Williams | Vague 2/3 |
| Calculs de pompage | Puissance, débit, HMT | Vague 3 |

---

## 🖥️ L'interface — ce qu'on veut et ce qu'on ne veut pas

**On veut :**
- Une interface moderne, propre, professionnelle
- Navigation simple pour quelqu'un qui n'est pas informaticien
- Résultats lisibles et bien présentés
- PDF présentables à un client

**On ne veut pas :**
- Quelque chose qui ressemble à Excel
- Trop de menus, de boutons, de colonnes
- Un look "site web générique" ou "template gratuit"

---

## 📋 Checklist avant de considérer une fonctionnalité terminée

Une fonctionnalité n'est PAS terminée si :
- [ ] Elle n'a pas de test (au minimum pour les calculs et l'authentification)
- [ ] La vérification d'accès est uniquement dans l'interface et pas sur le serveur
- [ ] Un client pourrait accéder aux données d'un autre client
- [ ] L'interface est brouillonne ou non professionnelle
- [ ] Il n'y a pas de documentation de ce qui a été livré

---

## 🚀 Pour démarrer une session

Dis-moi dans quelle vague on est, et je reprends là où on s'est arrêtés.
Si c'est la toute première session : commence par la **Vague 0** et rends-moi compte quand les fondations sont posées.
