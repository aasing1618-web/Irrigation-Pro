# Contrat d'API — Vague 2 : projets et calculs

**Ce document fait autorité.** Le serveur l'implémente, l'application le
consomme, les tests le vérifient. Il complète [API-VAGUE-1.md](API-VAGUE-1.md),
dont toutes les règles générales restent valables : préfixe `/api`, format
d'erreur `{ error: { code, message, details? } }`, `Authorization: Bearer`,
statut du compte relu en base à chaque requête.

**Toutes les routes de ce document exigent une authentification.**

---

## 1. La règle qui prime sur toutes les autres

> **Un client ne voit et ne modifie que ses propres projets.**
>
> Chaque route reçoit `res.locals.user` du middleware d'authentification.
> **Toute** requête SQL touchant un projet, une donnée de projet ou un rapport
> filtre sur `owner_id = utilisateur connecté`. Il n'existe aucune fonction
> d'accès sans propriétaire — c'est vérifié depuis la Vague 0.

**Un projet qui appartient à quelqu'un d'autre renvoie `404 NOT_FOUND`, jamais
`403`.** Un `403` confirmerait que le projet existe : ce serait dire à un client
combien de projets ont ses concurrents. Du point de vue d'un utilisateur, ce qui
ne lui appartient pas **n'existe pas**.

Les identifiants sont des UUID : ils ne sont pas devinables. C'est une seconde
barrière, jamais la première.

---

## 2. Projets

### `GET /api/projects` — lister mes projets

Paramètres de requête facultatifs : `statut` (`BROUILLON`|`EN_COURS`|`TERMINE`),
`recherche` (texte libre sur le nom et le nom du client), `limite` (défaut 50,
max 200), `depuis` (décalage).

Les projets supprimés (`deleted_at` non nul) **ne sont jamais renvoyés**.

```json
{ "projets": [ { "id": "uuid", "nom": "…", "nomClient": "…", "localisation": "…",
  "description": "…", "statut": "BROUILLON", "creeLe": "…", "modifieLe": "…",
  "nombreCalculs": 3 } ], "total": 12 }
```

### `POST /api/projects` — créer

```json
{ "nom": "…", "nomClient": "…", "localisation": "…", "description": "…" }
```

`nom` obligatoire, 1 à 200 caractères, non vide après suppression des espaces.
Les autres champs sont facultatifs, 500 caractères maximum. Le propriétaire est
**toujours** l'utilisateur connecté — un `ownerId` envoyé par le client est
**ignoré**, jamais honoré. → `201` avec le projet créé.

### `GET /api/projects/:id` — ouvrir

→ `200 { "projet": { …, "calculs": [ … ] } }`, ou `404 NOT_FOUND`.

### `PATCH /api/projects/:id` — modifier

Mêmes champs que la création, tous facultatifs, plus `statut`. Au moins un champ
requis. → `200` avec le projet à jour, ou `404`.

### `DELETE /api/projects/:id` — supprimer

**Suppression logique** : `deleted_at` est renseigné, la ligne est conservée.
Motif : les rapports déjà remis à un client final doivent rester traçables.
→ `204`, ou `404`.

---

## 3. Calculs

Le moteur s'exécute **exclusivement côté serveur** (D-007). L'application envoie
des paramètres, reçoit des résultats. **Aucune formule ne transite.**

### `GET /api/calculs/modules` — catalogue des modules

Décrit les modules disponibles et leurs champs de saisie : nom, unité, plage
admise, valeur par défaut, aide. **C'est ce qui permet à l'application de
construire ses formulaires sans connaître les formules.**

```json
{ "modules": [ { "code": "BESOINS_EAU", "famille": "GRAVITAIRE",
  "nom": "Besoins en eau des cultures", "entrees": [ { "champ": "At",
  "libelle": "Superficie totale", "unite": "ha", "type": "nombre",
  "min": 0, "obligatoire": true } ] } ] }
```

### `GET /api/calculs/references/:table` — tables de référence

Sert les listes déroulantes : cultures, types de sol, matériaux de canal,
matériaux de conduite, diamètres commerciaux, classes de vent, climats.
Renvoie **les libellés et les clés, jamais les coefficients** quand ceux-ci
constituent le savoir-faire (les coefficients de Manning et de Hazen-Williams
restent sur le serveur ; le client n'envoie que le matériau choisi).

### `POST /api/calculs/:module` — calculer sans enregistrer

Corps : les entrées du module. → `200 { "resultats": { … }, "avertissements": [ … ],
"engineVersion": "1.0.0" }`.

Une entrée invalide → `400 VALIDATION_ERROR` avec le champ fautif.
Un calcul impossible (division par zéro, cycle négatif) →
`422 CALCUL_IMPOSSIBLE` avec le message métier du moteur, **rédigé pour un
ingénieur agronome**, pas pour un développeur.

Les `avertissements` sont les contrôles métier non bloquants : vitesse hors
plage, risque de ruissellement, surface mouillée insuffisante. **Ils ne doivent
jamais être silencieux** — c'est la valeur ajoutée par rapport au tableur.

### `POST /api/projects/:id/calculs` — calculer et archiver

Corps : `{ "module": "…", "entrees": { … } }`. Vérifie d'abord que le projet
appartient à l'utilisateur, calcule, puis enregistre dans `project_data`
(`inputs`, `results`, `engine_version`, `computed_at`).
→ `201 { "calcul": { "id", "module", "entrees", "resultats", "engineVersion",
"calculeLe" } }`, ou `404` si le projet n'est pas le sien.

### `GET /api/projects/:id/calculs` — historique des calculs d'un projet

Facultatif : `module` pour filtrer. Renvoie du plus récent au plus ancien.

### `DELETE /api/projects/:id/calculs/:calculId` — retirer un calcul archivé

→ `204`, ou `404`. Vérifie **les deux** appartenances : le calcul appartient au
projet, et le projet appartient à l'utilisateur.

---

## 4. Codes d'erreur ajoutés par cette vague

| HTTP | `code` | Quand |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Entrée mal formée ; `details` liste les champs |
| 404 | `NOT_FOUND` | Ressource inexistante **ou appartenant à un autre** |
| 409 | `CONFLICT` | Conflit d'état (ex. calcul sur projet supprimé) |
| 422 | `CALCUL_IMPOSSIBLE` | Entrées valides mais calcul sans solution physique |

---

## 5. Journalisation

Ajoutées à `activity_logs` : `PROJECT_CREATED`, `PROJECT_UPDATED`,
`PROJECT_DELETED`, `CALCUL_RUN`, `CALCUL_SAVED`, `CALCUL_DELETED`.

Chaque entrée porte l'identifiant du projet concerné. **Jamais de mot de passe,
jamais de jeton** — le filtre défensif de la Vague 1 reste actif.

---

## 6. Ce que l'application doit faire

- **Liste de projets** : recherche, filtre par statut, création, ouverture. État
  vide soigné quand il n'y en a aucun — c'est le premier écran d'un nouveau
  client.
- **Fiche projet** : informations, historique des calculs, accès aux modules.
- **Formulaires de calcul construits à partir du catalogue** `GET
  /api/calculs/modules`, jamais codés en dur dans l'application : ajouter un
  module côté serveur doit suffire à le faire apparaître.
- **Résultats lisibles** : valeurs, unités, et les avertissements mis en avant.
  Un résultat sans son unité est une faute.
- **Aucune formule côté client.** Une validation de saisie triviale (« ce champ
  doit être un nombre positif ») est admise, toujours redoublée côté serveur.
