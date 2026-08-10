# Où reprendre — état au 2026-08-10

Note de reprise, écrite au moment d'interrompre la session. À lire en premier
avant de continuer le travail.

---

## État général

| Vague | État |
|---|---|
| 0 — Fondations | ✅ Livrée et vérifiée |
| 1 — Connexion et comptes | ✅ Livrée, **vérifiée contre la vraie base Supabase** (16 contrôles) |
| 2 — Projets et calculs | ✅ Livrée, **vérifiée contre la vraie base** (21 contrôles) |
| 3 — Rapports PDF et dashboard admin | 🚧 **En cours — c'est ici qu'on reprend** |
| 4 — Finitions | ⬜ Non commencée |
| 5 — Sécurité et tests finaux | ⬜ Non commencée |

**397 tests au vert** : 351 backend, 46 application. Tout compile.
Le dépôt est à jour sur `github.com/aasing1618-web/Irrigation-Pro`, branche `main`.

---

## Ce qui est déjà en place et fonctionne

- Base **Supabase** branchée (`aws-1-eu-west-1`, via le *pooler*, port 6543).
  Les 3 migrations sont appliquées. Le verrouillage RLS est actif et vérifié :
  les rôles publics de Supabase n'ont plus aucun droit sur nos tables.
- Authentification complète, suspension effective en moins de 15 minutes.
- **14 modules de calcul**, dont les 16 cas de référence des classeurs Excel
  sont reproduits à 1e-6 près.
- CRUD projets avec isolation stricte entre clients, prouvée sur la vraie base.
- Compte propriétaire créé : `otaziznoblees@gmail.com`.

---

## Vague 3 — travail partiel conservé

Deux agents ont été interrompus **en cours de travail**. Ce qu'ils ont produit
compile et ne casse aucun test, mais **n'est pas terminé et n'est pas testé**.

### Rapports PDF — `backend/src/reports/`

Fichiers présents : `types.ts`, `collecte.ts`, `mise-en-page.ts`,
`document.ts`, `texte.ts`.

**Ce qui manque :**
- `backend/src/api/reports.routes.ts` — les 4 routes du contrat
- `backend/src/db/repositories/reports.repo.ts`
- le montage de la route dans `backend/src/api/index.ts`
- **tous les tests** (`backend/tests/reports.*.test.ts`)
- la décision « régénérer à la demande » vs « écrire sur disque » — non tranchée
- la vérification du rendu des accents par les polices de `pdfkit`

### Administration — `backend/src/api/admin.routes.ts`

754 lignes, apparemment complet, plus `admin-actions.repo.ts` (177 lignes) et
des ajouts dans `users.repo.ts`. La route semble montée dans `api/index.ts`.

**Ce qui manque :**
- **tous les tests** (`backend/tests/admin.*.test.ts`)
- **une relecture attentive** : ce code n'a jamais été relu ni exercé. Ne pas le
  considérer comme acquis. Vérifier en particulier les points exigés par le
  contrat : `password_hash` qui ne sort jamais, `404` et non `403` pour un
  compte `CLIENT`, mot de passe temporaire absent de tout journal, révocation
  des sessions à la suspension, et les garde-fous d'auto-verrouillage.

### Dashboard administrateur — `admin/`

**Pas commencé.** Le dossier est vide. Le contrat le décrit en section 5 de
`docs/API-VAGUE-3.md`.

### Interface cliente — génération de rapports

**Pas commencée.** L'application ne sait pas encore demander ni télécharger un
PDF. À faire une fois les routes de rapports en place.

---

## Par quoi reprendre, dans l'ordre

1. **Tester et relire l'API d'administration** — le code existe, il n'est pas
   éprouvé. C'est le plus proche d'être fini.
2. **Terminer les rapports PDF** : dépôt, routes, montage, tests, et un vrai PDF
   ouvert et regardé.
3. **Construire le dashboard administrateur** (`admin/`).
4. **Ajouter la génération de rapports à l'application cliente.**
5. **Vérifier la Vague 3 contre la vraie base**, comme les vagues 1 et 2 :
   création d'un compte par l'administrateur, suspension, génération d'un PDF,
   et contrôle qu'un client ne peut pas télécharger le rapport d'un autre.

---

## Documents à lire avant de reprendre

| Document | Rôle |
|---|---|
| `CLAUDE.md` | Cahier des charges produit — fait foi |
| `docs/DECISIONS.md` | 12 décisions d'architecture justifiées, dont **D-011** (durcissements reportés) |
| `docs/API-VAGUE-3.md` | **Le contrat de la vague en cours** |
| `docs/MOTEUR-GRAVITAIRE.md` / `MOTEUR-SOUS-PRESSION.md` | Spécification du moteur de calcul |
| `docs/VAGUE-0.md` à `VAGUE-2.md` | Comptes rendus des vagues livrées |
| `docs/DEMARRAGE-SUPABASE.md` | Comment brancher la base |

---

## Points ouverts avec le propriétaire

- **Le nom du compte propriétaire** est « Propriétaire » ; le vrai nom reste à
  renseigner.
- **L'icône de l'application** (PNG carré 1024×1024) n'a pas encore été fournie.
- **Rust + Visual Studio Build Tools** ne sont pas installés : nécessaires
  seulement pour produire le `.exe` Windows et pour que la session survive à la
  fermeture du logiciel. Le choix « application installée ou web » est
  volontairement repoussé à la Vague 4.
- **D-011** : les durcissements de sécurité reportés, à reprendre en Vague 5 —
  notamment la réinitialisation du mot de passe de la base Supabase.
