# Où reprendre — état au 2026-08-11 (soir)

Note de reprise, tenue à jour. À lire en premier avant de continuer le travail.

---

## ✅ Le backend est réparé (2026-08-12)

Les 22 tests qui échouaient repassent au vert **sans avoir été modifiés**. La
suite complète passe de bloquée à **537 tests en 21 s**.

`backend/src/reports/stockage.ts` est devenu **enfichable** : Supabase Storage
(bucket `rapports`) en production, disque local ailleurs. Le commutateur est
**sûr par défaut** — on ne parle à Supabase que si `NODE_ENV=production`, ou sur
demande explicite par `REPORTS_STORAGE=supabase`.

⚠️ **Ce commutateur n'est pas un confort, c'est un garde-fou.** Sans lui, lancer
les tests avec les identifiants de production écrirait les PDF de test **dans le
bucket des vrais clients**, au milieu de leurs rapports. D-011 prévoit un projet
Supabase séparé pour les tests ; tant qu'il n'existe pas, ce commutateur est la
seule protection. **Ne le retirez pas pour « simplifier ».**

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` ne sont plus exigés qu'en
production, sinon `npm run dev` et les scripts de maintenance refusaient de
démarrer — ce qui poussait à coller les identifiants de production dans un
`.env` local, c'est-à-dire à provoquer exactement l'accident décrit ci-dessus.

---

## 🔴 À FAIRE EN PREMIER — le projet Supabase n'existe plus

```
nslookup vkfaeyfwxjgfzmsinmoq.supabase.co
  → Non-existent domain          (alors que supabase.co répond)

Connexion par le pooler
  → XX000 : tenant/user postgres.vkfaeyfwxjgfzmsinmoq not found
```

Ce n'est pas un problème de réseau sur le poste, ni de mot de passe : ce serait
alors un échec d'authentification. Le nom d'hôte du projet a **disparu du DNS**.

**Ce qu'il faut vérifier, dans cet ordre**, sur <https://supabase.com/dashboard> :

1. Le projet est-il **en pause** ? Une offre gratuite met le projet en veille
   après une semaine sans activité. Il se réveille depuis le tableau de bord.
2. A-t-il été **supprimé** ? Alors la base et les rapports sont perdus, et il
   faut repartir d'un projet neuf : les trois migrations de
   `backend/src/db/migrations/` le reconstruisent, puis `npm run creer-admin`
   recrée le compte propriétaire.
3. Dans les deux cas, **relever la nouvelle chaîne de connexion** et la mettre
   dans `backend/.env`.

**Tant que ce point n'est pas réglé**, rien qui touche la vraie base ne peut
avancer : ni le renommage du compte, ni la vérification de bout en bout, ni la
mise en ligne. Le code, lui, est testable sans base — les 655 tests passent.

### En attente de la base

- **Renommer le compte propriétaire en « Abdou Aziz Sy »** (il s'appelle encore
  « Propriétaire », et ce nom s'imprime sur les rapports remis aux clients).
  Une fois la base joignable, dans l'éditeur SQL de Supabase :

  ```sql
  update users set full_name = 'Abdou Aziz Sy', updated_at = now()
   where email = 'otaziznoblees@gmail.com';
  ```

---

## Décisions prises par le propriétaire le 2026-08-11 au soir

1. **Les rapports PDF vont sur Supabase Storage.** Ceci **annule D-015**
   (disque persistant). Conséquence favorable : le serveur Node n'a plus besoin
   de disque, donc une offre d'hébergement gratuite redevient possible.
2. **Le produit est une application web.** Confirme D-013.
3. **Nom du compte propriétaire : « Abdou Aziz Sy »** — à corriger en base, il
   s'appelle encore « Propriétaire ». *(Pas encore fait.)*
4. **Les deux photos filigranées sont abandonnées.** Pas de licence à acheter,
   on s'en passe. Les 7 photos propres suffisent.
5. **La revue visuelle des interfaces et le jugement du PDF seront faits avec
   Antigravity** par le propriétaire (missions n° 1 et n° 2 de `GEMINI.md`).

---

## État général

| Vague | État |
|---|---|
| 0 — Fondations | ✅ Livrée |
| 1 — Connexion et comptes | ✅ Livrée, vérifiée sur la vraie base (16 contrôles) |
| 2 — Projets et calculs | ✅ Livrée, vérifiée (21 contrôles) |
| 3 — Rapports PDF et dashboard | ✅ Livrée, vérifiée (24 contrôles) |
| 4 — Finitions | ✅ Livrée, vérifiée (39 contrôles) |
| **Habillage visuel** | ✅ Livré (voir plus bas) |
| **5 — Sécurité et tests finaux** | ⬜ Non commencée |

**Tests : 118 au vert côté interfaces** (site 28, application 72, dashboard 18).
**Backend : cassé**, voir tout en haut.

---

## Ce qui a été livré côté visuel (2026-08-11)

- **7 photographies** du propriétaire installées dans `site/public/photos/`,
  renommées proprement. Registre unique dans `site/src/photos.ts`, avec les
  textes alternatifs regroupés pour être relus d'un coup d'œil.
- **Effet d'eau WebGL** (`site/src/components/PhotoOndulante.tsx`) sur le hero
  du site. Adapté du composant fourni : plus de dépendance à Next.js, canevas
  borné à son cadre, boucle arrêtée hors écran, **quatre replis** au lieu d'un
  plantage.
- **Image expansive au défilement** (`site/src/components/MediaExpansif.tsx`).
  Adapté du composant fourni, avec **un changement assumé** : l'original
  capturait la molette ; ici tout passe par `animation-timeline: view()`, donc
  aucun détournement de défilement et aucun JavaScript pendant qu'on descend.
- **Logiciel et dashboard** : la scène du produit sur les quatre écrans
  d'avant-session (`BrandBackdrop`). Photo du canal côté client — la même que le
  site vitrine, pour la continuité — et un asperseur côté administration, pour
  qu'on ne confonde pas les deux. **Aucun WebGL ni détournement de molette dans
  les outils de travail**, c'est délibéré.
- **8 tests neufs** attrapent le défaut qu'aucun test classique ne voit : une
  image cassée n'échoue nulle part, elle affiche un cadre vide.
- `Image/` est passé en `.gitignore` : le dépôt ne redistribue pas d'aperçus
  filigranés qui ne nous appartiennent pas.

---

## Ce qu'il reste au produit, dans l'ordre conseillé

1. **Réparer le backend** (tout en haut). Rien d'autre n'a de sens avant.
2. **Renommer le compte propriétaire** en « Abdou Aziz Sy ».
3. **Finir la mise en ligne.** Trois fichiers ont été commencés par une autre
   session et ne sont **ni finis ni vérifiés** : `build.sh`, `render.yaml`,
   `backend/tests/static.routes.test.ts`, plus le service statique dans
   `backend/src/app.ts`. Topologie retenue : **une seule origine** (D-014),
   l'API sous `/api/*`, le logiciel sous `/`, le dashboard sous `/admin/*`.
4. **Mettre en place la sauvegarde.** La base et le bucket `rapports` sont
   irremplaçables. Supabase sauvegarde la base selon l'offre souscrite ; **le
   bucket, lui, est à vérifier explicitement**.
5. **Brancher une supervision** gratuite sur `/health` (UptimeRobot ou
   équivalent).
6. **Vague 5 — sécurité**, avec la liste bloquante de D-011 : réinitialiser le
   mot de passe de la base Supabase, regénérer `JWT_SECRET`, recalibrer
   `trust proxy`, activer RLS sur `schema_migrations`, projet Supabase séparé
   pour les tests.

### Deux points ouverts, sans urgence

- **Icône** 1024 × 1024 : nécessaire seulement si un installateur Windows
  revient à l'ordre du jour. Sans objet pour une application web.
- **Liste globale des rapports**, tous projets confondus : n'existe pas. Ce
  serait une décision produit, pas un oubli.

---

## Documents de référence

| Document | Rôle |
|---|---|
| `CLAUDE.md` | Cahier des charges produit — fait foi |
| `AGENTS.md` | Règles pour tout agent intervenant sur le dépôt |
| `GEMINI.md` | Prompt complet à donner à Antigravity, et ses quatre missions |
| `docs/DECISIONS.md` | 15 décisions justifiées. **D-015 est annulée** par la décision du 2026-08-11 au soir |
| `docs/API-VAGUE-1.md` à `API-VAGUE-4.md` | Contrats d'API |
| `docs/MOTEUR-*.md` | Spécification du moteur et ses 16 cas de référence |
| `docs/VAGUE-0.md` à `VAGUE-4.md` | Comptes rendus de livraison |
| `docs/DEPLOIEMENT.md` | Topologie et liste bloquante avant mise en ligne |

---

## Méthode qui a fait ses preuves

1. Le lead écrit le **contrat d'API** de la vague **avant** de lancer les agents.
2. Les agents travaillent sur des **périmètres de fichiers disjoints**.
3. Une fois les tests simulés au vert, **on vérifie contre la vraie base** avec
   un script jetable. Cela a trouvé des défauts à chaque vague.
4. **Avant de mesurer, on repart d'un serveur neuf.** Un serveur de
   développement oublié sert du vieux code et fausse tout — c'est arrivé deux
   fois.
5. **Deux agents en parallèle au maximum.**
6. **On relance les tests des trois interfaces après toute modification
   partagée.** Le backend a été cassé sans que personne s'en aperçoive : c'est
   exactement ce que cette habitude évite.
