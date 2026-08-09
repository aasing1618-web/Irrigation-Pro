# Vague 0 — Fondations · Compte rendu de livraison

**Objectif fixé par le cahier des charges :** « Le serveur tourne et l'app peut le contacter. »

**Statut : atteint et vérifié des deux côtés.**

---

## Ce qui a été livré

### Le dépôt
Les quatre dossiers prévus existent (`backend/`, `app/`, `admin/`, `site/`),
git est initialisé, les secrets sont exclus du versionnement. Les choix de
librairies sont arrêtés et justifiés dans [`DECISIONS.md`](DECISIONS.md).

### Le serveur (`backend/`)
API Express 5 en TypeScript. Elle démarre, se configure depuis un fichier
`.env` dont chaque variable est validée au lancement (un `.env` incomplet
arrête le serveur avec un message explicite plutôt que de le laisser démarrer à
moitié configuré).

Deux endpoints publics pour l'instant :

| Endpoint | Rôle |
|---|---|
| `GET /health` | Dit si le serveur **et** la base de données répondent |
| `GET /api/version` | Donne le numéro de version de l'API |

Sont déjà en place, avant même la première ligne de code métier : identifiant
unique par requête (pour le support), en-têtes de sécurité HTTP, liste blanche
stricte des applications autorisées à appeler l'API, limitation du débit de
requêtes, format d'erreur unique sur toute l'API, et journalisation qui masque
automatiquement mots de passe et jetons.

### La base de données (`backend/src/db/`)
Le modèle de données complet, en SQL lisible et commenté en français :
`users`, `refresh_tokens`, `projects`, `project_data`, `reports`,
`activity_logs`, `admin_actions`.

Trois principes y sont inscrits dans la structure elle-même, pas seulement dans
le code :

- **Les identifiants sont des UUID** et non des numéros séquentiels : personne
  ne peut deviner l'identifiant du projet d'un autre client en incrémentant un
  chiffre.
- **`projects.owner_id` est la colonne d'isolation.** Il n'existe aucune
  fonction d'accès à un projet qui ne prenne pas le propriétaire en paramètre ;
  la règle est écrite en tête du fichier concerné.
- **Aucune colonne ne peut contenir un mot de passe ou un jeton en clair** —
  ni les mots de passe temporaires, ni les jetons de session.

Les migrations s'appliquent une par une dans une transaction, et une migration
déjà appliquée qui aurait été modifiée est détectée et refusée.

### L'application cliente (`app/`)
Coque Tauri v2 + interface React 19. Au lancement, l'application interroge le
serveur et distingue trois situations, dans un langage compréhensible par un
utilisateur non informaticien :

- serveur joignable et base disponible → on entre dans l'application ;
- serveur injoignable → « Vérifiez votre connexion internet », bouton **Réessayer** ;
- serveur en mode dégradé → message distinct, avec une **référence d'incident**
  (le seul élément technique affiché, parce que c'est ce que le support
  demandera).

L'application comporte déjà sa navigation (Tableau de bord, Projets, Calculs,
Rapports, Paramètres), son numéro de version, et des états vides soignés là où
les fonctions arriveront. Aucune formule de calcul n'y figure et n'y figurera :
elles restent sur le serveur.

---

## Vérifications effectuées

| Contrôle | Résultat |
|---|---|
| Compilation du serveur | aucune erreur |
| Tests du serveur | 12 / 12 |
| Compilation de l'application | aucune erreur |
| Tests de l'application | 13 / 13 |
| Fabrication de l'interface (`build`) | réussie |
| Démarrage réel du serveur | OK sur le port 4000 |
| Route inconnue | 404 au format d'erreur standard |
| Appel depuis une origine non autorisée | 403, refusé |
| En-têtes de sécurité HTTP | présents |
| Chaîne application → serveur, en conditions réelles | vérifiée |
| Recherche de code de paiement ou de licence | néant |

`/health` répond **503 « dégradé »** sur ce poste, parce que PostgreSQL n'y est
pas installé. C'est le comportement attendu, et il prouve que la détection de
panne fonctionne.

---

## Décisions prises pendant la vague

Les six décisions structurantes sont documentées dans
[`DECISIONS.md`](DECISIONS.md). Deux méritent d'être signalées ici parce
qu'elles s'écartent du choix le plus évident :

1. **Express plutôt que NestJS.** Le cahier des charges laissait le choix. À
   l'échelle de ce produit, NestJS impose une machinerie qui coûte plus en
   complexité qu'elle ne rapporte, et rend le code plus difficile à relire.

2. **Hachage `scrypt` plutôt qu'argon2 ou bcrypt.** Ces deux derniers exigent
   une compilation native qui échoue fréquemment sur Windows. `scrypt` est
   recommandé par l'OWASP, intégré à Node, sans dépendance à installer. Le
   format de stockage retenu permettra de migrer plus tard sans casse.

Une décision a également été tranchée en cours de route entre les agents et
inscrite au registre : **aucun cookie de session** (D-005b). L'application
recevra ses jetons par en-tête et corps JSON — un cookie serait ici un cookie
tierce-partie, dépendant des politiques du moteur WebView de Windows, pour la
fonction la plus critique du produit.

---

## Ce qui reste à faire avant la Vague 1

Deux installations sur le poste, aucune ligne de code :

1. **PostgreSQL** — nécessaire dès la Vague 1 (les comptes vivent en base).
   Procédure détaillée dans [`../backend/src/db/README.md`](../backend/src/db/README.md).
2. **Une icône de l'application** — un PNG carré 1024×1024 ; Tauri en dérive
   automatiquement tous les formats Windows.

**Rust + Visual Studio Build Tools** ne sont nécessaires qu'au moment de
fabriquer le fichier d'installation `.exe` remis au client (Vague 4). Leur
absence ne bloque rien aujourd'hui : l'interface se développe et se teste sans.

---

## Points ouverts pour le propriétaire

- **Aucun compte administrateur n'existe encore.** Il faudra une commande
  d'amorçage pour créer le tout premier compte propriétaire — prévu en Vague 1.
- **Le numéro WhatsApp** est à renseigner (`WHATSAPP_NUMBER` dans
  `backend/.env`) ; une valeur factice y figure aujourd'hui.
- **L'hébergement du serveur** n'est pas choisi. Ce choix devra être fait avant
  la Vague 3, car il conditionne le certificat HTTPS et l'emplacement de
  stockage des PDF.
