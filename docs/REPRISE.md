# Où reprendre — état au 2026-08-11

Note de reprise, tenue à jour. À lire en premier avant de continuer le travail.

---

## État général

| Vague | État |
|---|---|
| 0 — Fondations | ✅ Livrée |
| 1 — Connexion et comptes | ✅ Livrée, **vérifiée sur la vraie base** (16 contrôles) |
| 2 — Projets et calculs | ✅ Livrée, **vérifiée sur la vraie base** (21 contrôles) |
| 3 — Rapports PDF et dashboard admin | ✅ Livrée, **vérifiée sur la vraie base** (24 contrôles) |
| 4 — Finitions | ✅ Livrée, **vérifiée sur la vraie base** (39 contrôles) |
| 5 — Sécurité et tests finaux | 🚧 **C'est ici qu'on reprend** |

**646 tests au vert** : 536 backend, 72 application, 18 dashboard, 20 site.
Dépôt à jour sur `github.com/aasing1618-web/Irrigation-Pro`, branche `main`.

---

## Ce qui fonctionne aujourd'hui

- Base **Supabase** branchée (pooler IPv4, TLS vérifié par le certificat racine
  versionné dans le dépôt). Verrouillage RLS actif : l'API REST publique de
  Supabase ne peut rien lire.
- **Authentification** complète : mot de passe temporaire à changer, statut
  ACTIF/SUSPENDU, suspension effective en moins de 15 minutes, verrouillage
  anti-force-brute, journal d'activité sans aucun secret.
- **Session web par cookie `HttpOnly`** (D-013) — le transport par corps JSON
  reste le défaut, la coque Tauri fonctionne sans changement.
- **14 modules de calcul** portés des deux classeurs Excel, dont les 16 cas de
  référence sont reproduits à 1e-6 près.
- **Projets** avec isolation stricte entre clients, prouvée sur la vraie base.
- **Rapports PDF** générés côté serveur, figés sur disque, téléchargeables.
- **Dashboard administrateur** (port 5174) : création, suspension, réactivation,
  réinitialisation de mot de passe, journal d'activité.
- **Lien WhatsApp**, **affichage des versions**, **détection de mise à jour**.
- **Site vitrine** (port 5175) : page unique, sans prix ni formulaire, un seul
  appel à l'action — WhatsApp.

Compte propriétaire : `otaziznoblees@gmail.com`.

Les quatre interfaces, en développement :

```bash
cd backend && npm run dev   # 4000
cd app     && npm run dev   # 5173
cd admin   && npm run dev   # 5174
cd site    && npm run dev   # 5175
```

---

## Vague 5 — ce qu'il reste à faire

D'après `CLAUDE.md` : revue de sécurité complète, tests d'isolation des données,
tests d'authentification, tests des calculs métier.

**Et surtout, la liste bloquante de D-011**, à ne pas rogner :

1. **Réinitialiser le mot de passe de la base Supabase** — reporté par le
   propriétaire tant qu'on est en prototype. La Vague 5 est le moment.
2. **Regénérer `JWT_SECRET`.**
3. Recalibrer `trust proxy` selon l'hébergeur retenu.
4. Activer RLS sur `schema_migrations`.
5. Remplacer le limiteur de débit en mémoire si l'API est répliquée un jour.
6. Créer un projet Supabase séparé pour les tests.

**Deux décisions attendent le propriétaire :**

- **Où vont les PDF** en production : disque persistant ou Supabase Storage
  (`docs/DEPLOIEMENT.md`). Ce sont des données irremplaçables, au même titre que
  la base.
- **Le nom de domaine.** Sans domaine à soi, la session web ne tiendra pas —
  c'est la contrainte `SameSite` expliquée dans `docs/DEPLOIEMENT.md`.

---

## À faire avant de considérer le produit présentable

- **Essayer les interfaces à la main**, écran par écran. Les tests couvrent le
  comportement, pas l'ergonomie. Voir `docs/ANTIGRAVITY.md`, usage nº 1.
- **Regarder le site vitrine à l'écran** en 375 px, 768 px et 1440 px : il n'a
  jamais été affiché.
- **Relire cinq formulations du site vitrine** (voir `docs/VAGUE-4.md`,
  réserve nº 3) — elles sont de nous, pas du propriétaire.
- **Regarder un vrai PDF** : sa mise en page mérite un jugement humain.
- **Fournir une icône** (PNG carré 1024×1024).
- **Renseigner le vrai nom** du compte propriétaire (« Propriétaire » pour
  l'instant).

---

## Documents de référence

| Document | Rôle |
|---|---|
| `CLAUDE.md` | Cahier des charges produit — fait foi |
| `AGENTS.md` | Règles pour tout agent intervenant sur le dépôt |
| `docs/DECISIONS.md` | 14 décisions d'architecture, dont **D-011** (durcissements reportés), **D-012** (ce qui est protégé) et **D-013** (cible web) |
| `docs/API-VAGUE-1.md` à `API-VAGUE-4.md` | Contrats d'API, écrits avant chaque vague |
| `docs/MOTEUR-GRAVITAIRE.md` / `MOTEUR-SOUS-PRESSION.md` | Spécification du moteur de calcul |
| `docs/VAGUE-0.md` à `VAGUE-4.md` | Comptes rendus de livraison |
| `docs/DEPLOIEMENT.md` | Topologie retenue et liste bloquante avant mise en ligne |
| `docs/ANTIGRAVITY.md` | Comment répartir le travail avec Antigravity |
| `docs/DEMARRAGE-SUPABASE.md` | Comment brancher la base |

---

## Méthode qui a fait ses preuves

1. Le lead écrit le **contrat d'API** de la vague **avant** de lancer les agents.
   C'est ce qui leur permet de travailler en parallèle sans se contredire.
2. Les agents travaillent sur des **périmètres de fichiers disjoints**.
3. Une fois les tests simulés au vert, **on vérifie la vague contre la vraie
   base** avec un script jetable. Cela a trouvé, à chaque vague, des défauts que
   les simulations ne pouvaient pas voir.
4. **Avant de mesurer, on repart d'un serveur neuf.** Un serveur de
   développement oublié sert du vieux code et fausse tout — c'est arrivé deux
   fois.
5. **Deux agents en parallèle au maximum** : trois ont été coupés par des
   limites d'usage, et deux l'ont été à quelques minutes de la fin. Un agent
   coupé laisse un travail presque complet : relire son périmètre avant de
   relancer quoi que ce soit.
