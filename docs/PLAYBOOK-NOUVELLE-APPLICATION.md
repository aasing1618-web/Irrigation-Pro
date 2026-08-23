# Construire la prochaine application — mode d'emploi

> Tiré de la construction réelle d'**Irrigation Pro** (août 2026) : 655 tests,
> 4 vagues livrées, 25 contrôles contre la vraie base, et une quinzaine de
> pièges payés comptant. Ce document existe pour que la prochaine application
> — pompage, assainissement, adduction, autre — ne les repaie pas.
>
> Il s'adresse à **vous** (le propriétaire) et à **Claude Code**. Donnez-le en
> entier au début du prochain projet.

---

## 1. Ce qui se réutilise, et ce qui change

C'est la découverte la plus rentable de ce projet.

| Part du produit | Réutilisable ? | Effort sur la prochaine app |
|---|---|---|
| Authentification, sessions, cookie, verrouillage anti-force-brute | ✅ **tel quel** | copier |
| Projets, isolation entre clients, journal d'activité | ✅ **tel quel** | copier |
| Dashboard administrateur (créer, suspendre, réactiver) | ✅ **tel quel** | changer les textes |
| Génération de rapports PDF | ✅ **structure** | changer les rubriques |
| Déploiement, origine unique, stockage | ✅ **tel quel** | copier |
| Site vitrine | ✅ **structure** | changer le contenu |
| **Le moteur de calcul** | ❌ **entièrement neuf** | c'est là que va le travail |

**Environ 80 % du code ne change pas.** Ce qui change, c'est le moteur — et
c'est précisément ce qui fait la valeur commerciale du produit.

**Conséquence pratique :** ne repartez jamais d'une page blanche. Copiez le
dépôt Irrigation Pro, videz `backend/src/engine/`, et remplacez-le. Vous
économisez trois vagues sur cinq.

### Ce qu'il faut renommer en repartant du dépôt

```
backend/package.json      → "name"
app/package.json          → "name"
admin/package.json        → "name"
site/                     → tout le contenu éditorial
CLAUDE.md                 → le cahier des charges produit
docs/MOTEUR-*.md          → la spécification du nouveau moteur
backend/src/engine/       → vidé et réécrit
```

Tout le reste tourne sans y toucher.

---

## 2. L'architecture qui a tenu

```
        https://mon-app.onrender.com          (une seule origine)
                          │
        ┌─────────────────▼──────────────────┐
        │   un seul processus Node/Express    │
        │  /api/*    → l'API                  │
        │  /admin/*  → le dashboard           │
        │  /*        → le logiciel client     │
        └─────────────────┬───────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       Supabase Postgres       Supabase Storage
        (les données)            (les PDF)
```

**Pile :** Node 22 · Express 5 · TypeScript strict · PostgreSQL (Supabase, sans
ORM) · React 19 · Vite 6 · Tailwind v4 · Vitest.

### Les cinq décisions structurantes, et pourquoi

1. **Une seule origine.** Sans nom de domaine, c'est la seule façon de faire
   fonctionner un cookie `SameSite=Strict`. Deux hébergeurs = deux domaines =
   le client ne reste jamais connecté. Voir le piège n° 7.
2. **Le moteur de calcul s'exécute côté serveur, jamais dans le navigateur.**
   C'est le savoir-faire du produit ; il ne descend pas sur le poste du client.
3. **Pas d'ORM.** SQL écrit à la main, migrations numérotées avec somme de
   contrôle. Un ORM ajoute une couche à déboguer pour un gain nul sur un modèle
   de 8 tables.
4. **Le PDF est figé sur disque, jamais régénéré.** Une référence déjà imprimée
   et remise à un client ne doit jamais désigner un document différent.
5. **Aucun paiement, aucune licence technique.** Le compte est ACTIF ou
   SUSPENDU, changé à la main après une conversation WhatsApp. Cela supprime
   toute une famille de code, de bugs et d'obligations légales.

---

## 3. La méthode par vagues

Ne sautez pas de vague. Chacune est validée avant la suivante.

| Vague | Contenu | Livrable vérifiable |
|---|---|---|
| **0** | Structure, base de données, `/health` | « le serveur tourne et l'app le contacte » |
| **1** | Connexion, comptes, ACTIF/SUSPENDU | « un compte suspendu est bloqué » |
| **2** | Projets + **le moteur de calcul** | « le client obtient un résultat » |
| **3** | Rapports PDF + dashboard admin | « le propriétaire crée un compte, le client sort un PDF » |
| **4** | Finitions : WhatsApp, versions, vitrine | « c'est présentable » |
| **5** | Sécurité, mise en ligne | « c'est en ligne et ça tient » |

**Pourquoi cet ordre.** Chaque vague est utilisable seule. Si le budget s'arrête
en vague 3, vous avez un produit vendable. Si vous aviez tout construit en
parallèle, vous auriez trois moitiés de choses.

### La règle qui a sauvé le projet

> **Une fois les tests simulés au vert, on vérifie la vague contre la VRAIE base
> avec un script jetable.**

Cette étape a trouvé un défaut à **chaque** vague — des défauts que les tests
simulés ne pouvaient pas voir : un 404 qui trahissait l'existence du routeur
d'administration, un PDF de 4 pages qui en produisait 12, des notes effacées
pendant la frappe.

Le script est jetable : écrit, lancé, supprimé. Il affiche son bilan **avant**
de nettoyer, sinon un nettoyage qui échoue emporte les résultats avec lui.

---

## 4. Faire travailler Claude Code vite — les règles qui comptent

C'est la partie que vous m'avez demandée. Voici ce qui coûte cher, et ce qui
règle le problème.

### 4.1 Les trois fichiers à écrire AVANT la première ligne de code

| Fichier | Rôle | Effet mesuré |
|---|---|---|
| `CLAUDE.md` | Le cahier des charges produit. Fait foi sur tout. | Supprime 90 % des allers-retours de clarification |
| `AGENTS.md` | Les règles de travail : interdits, périmètres, commandes | Empêche un agent de réécrire ce qui marche |
| `docs/REPRISE.md` | Où on en est, tenu à jour à chaque session | **Le plus rentable des trois** |

**`REPRISE.md` est le levier n° 1.** Une session qui commence par le lire sait
en 30 secondes ce qu'une session sans lui met dix minutes et des milliers de
jetons à redécouvrir. Il doit contenir : l'état de chaque vague, ce qui bloque,
le diagnostic déjà fait, et l'ordre de reprise.

### 4.2 Le contrat d'API avant les agents

> **Écrire le contrat de la vague AVANT de lancer le moindre agent.**

C'est ce qui permet à deux agents de travailler en parallèle sans se
contredire : ils ne négocient pas entre eux, ils obéissent au même document.

Un contrat tient en une page et fixe : les routes, la forme des erreurs, les
codes de retour, et **les décisions qui se discutent** (« une ressource
appartenant à un autre client renvoie 404, jamais 403 »).

### 4.3 Deux agents en parallèle, jamais trois

Mesuré sur ce projet : **trois agents ont été coupés par les limites d'usage à
deux reprises**, et deux autres l'ont été à quelques minutes de la fin. Un agent
coupé laisse un travail presque complet mais non testé — il faut alors relire
tout son périmètre avant de relancer quoi que ce soit.

Deux agents sur des **périmètres de fichiers disjoints**, c'est le maximum
rentable.

### 4.4 Comment formuler une demande pour ne pas perdre de jetons

**À faire :**

- **Donner le symptôme exact, pas votre interprétation.** « Le déploiement
  échoue » + les 30 dernières lignes du journal → diagnostic en une lecture.
  « Ça marche pas, c'est sûrement les URL » → une heure de recherche à l'aveugle.
- **Dire ce qui a changé depuis la dernière fois.** « J'ai créé le bucket, j'ai
  mis les clés » évite de tout re-vérifier.
- **Un objectif par message.** Trois demandes dans un message donnent trois
  travaux à moitié faits.
- **Répondre aux questions bloquantes tout de suite.** Une question posée est
  une question qui bloque réellement ; y répondre coûte moins cher que de
  laisser deviner.

**À éviter :**

- ❌ **Coller un secret dans la conversation.** Sur ce projet, **trois clés ont
  été brûlées ainsi** (deux Hostinger, une base de données). Un secret collé est
  un secret à révoquer. Mettez-le dans `.env` ou chez l'hébergeur, et dites
  simplement « c'est fait ».
- ❌ Demander une refonte visuelle pendant qu'une panne bloque le produit. Les
  deux se font, mais l'ordre compte.
- ❌ Laisser tourner un serveur de développement oublié (voir piège n° 1).

### 4.5 Le rythme de travail qui a marché

```
1. Lire REPRISE.md
2. Écrire le contrat de la vague
3. Lancer 2 agents sur périmètres disjoints
4. Relire leur travail : git diff, puis les tests
5. Vérifier contre la vraie base avec un script jetable
6. Commit avec un message qui explique POURQUOI
7. Mettre REPRISE.md à jour
8. Push
```

**Le commit qui explique pourquoi** vaut de l'or six mois plus tard. « Fix bug »
ne dit rien ; « le pied de page dessiné sous la marge basse déclenchait le saut
de page automatique, d'où 12 pages au lieu de 4 » évite de refaire l'erreur.

---

## 5. Le catalogue des pièges

Chacun a été payé sur ce projet. Symptôme → cause → correctif.

### Piège n° 1 — Le serveur de développement oublié ⭐ le plus coûteux

**Symptôme :** une vérification déclare bon un travail qui ne marche pas, ou
échoue sur du code déjà corrigé.

**Cause :** un `npm run dev` lancé des heures plus tôt occupe encore le port et
sert **du vieux code**.

**Correctif :** avant toute mesure,
```bash
netstat -ano | findstr ":4000"     # Windows
```
et on tue ce qui traîne. **Ce piège a faussé deux vérifications sur ce projet.**

### Piège n° 2 — `NODE_ENV=production` supprime les outils de compilation

**Symptôme :** le déploiement échoue sur `tsc: not found` avant d'avoir rien
produit.

**Cause :** l'hébergeur applique `NODE_ENV=production` **aussi pendant la
compilation**, et `npm install` ignore alors les `devDependencies`. Or
TypeScript et Vite en sont. Mesuré : **101 paquets retirés**.

**Correctif :** `npm ci --include=dev` dans le script de compilation, explicite.
Et un contrôle final qui vérifie que les artefacts existent.

### Piège n° 3 — La mauvaise chaîne de connexion Supabase

**Symptôme :** le serveur démarre, répond en mode dégradé, ne se connecte
jamais. On croit à un mot de passe faux.

**Cause :** la chaîne « Direct connection » (port 5432) est **IPv6 uniquement**.

**Correctif :** toujours le **Transaction pooler, port 6543**. Project Settings
→ Database → Connection pooling.

### Piège n° 4 — Le projet Supabase se met en pause

**Symptôme :** `nslookup` répond « Non-existent domain », le pooler dit
« tenant not found ». On croit le projet supprimé.

**Cause :** l'offre gratuite met le projet en veille après **une semaine sans
activité**, et retire son DNS.

**Correctif :** le réveiller depuis le tableau de bord. Les données sont
intactes. Et brancher une supervision qui appelle `/health` régulièrement.

### Piège n° 5 — Le nom du bucket est sensible à la casse

**Symptôme :** « Bucket not found » à la première génération de rapport **en
production**, jamais avant.

**Cause :** le bucket créé s'appelait `Rapport`, le code cherchait `rapports`.

**Correctif :** rendre le nom configurable (`SUPABASE_BUCKET`), et reformuler
l'erreur en indiquant le nom effectivement cherché.

### Piège n° 6 — Les deux clés Supabase ne font pas la même chose

| Clé | Usage | Peut écrire dans un bucket privé ? |
|---|---|---|
| `sb_publishable_…` | navigateur, soumise à RLS | ❌ non |
| `sb_secret_…` (service_role) | serveur uniquement | ✅ oui |

Avec les tables verrouillées par RLS, la clé publiable ne peut **rien**. Le
backend a besoin de la clé secrète.

### Piège n° 7 — `SameSite=Strict` raisonne en domaine, pas en adresse

**Symptôme :** en production, l'utilisateur est déconnecté à chaque
rechargement. Impossible à reproduire en local.

**Cause :** interface sur `…vercel.app`, API sur `…onrender.com` → deux sites
différents, le cookie ne part jamais. En local, `localhost:5173` et
`localhost:4000` sont le **même** site : le problème n'apparaît pas.

**Correctif :** une seule origine (voir § 2), ou un vrai domaine avec deux
sous-domaines.

### Piège n° 8 — Les tests qui écrivent dans le bucket de production

**Symptôme :** aucun. C'est bien le problème.

**Cause :** lancer la suite de tests avec les identifiants de production écrit
les fichiers de test au milieu des vrais.

**Correctif :** un commutateur **sûr par défaut** — on ne parle au stockage
distant que si `NODE_ENV=production`, ou sur demande explicite. Partout
ailleurs, disque local.

### Piège n° 9 — Les erreurs qui trahissent ce qu'elles cachent

**Symptôme :** un client non-administrateur reçoit un 404 dont la **forme**
diffère des autres 404, ce qui révèle l'existence du routeur d'administration.

**Correctif :** toutes les erreurs sortent du même moule. Et e-mail inconnu /
mot de passe faux doivent renvoyer **le même code, le même message et la même
durée**.

### Piège n° 10 — Le pied de page qui multiplie les pages

**Symptôme :** un rapport de 4 pages en produit 12, dont 8 quasi vides.
Invisible tant qu'on ne les compte pas.

**Cause :** le pied de page était dessiné **sous** la marge basse, ce qui
déclenchait le saut de page automatique de la bibliothèque PDF.

**Correctif :** toujours compter les pages d'un PDF produit dans un test.

### Piège n° 11 — Les images filigranées

**Symptôme :** un filigrane « Adobe Stock » en travers du site vitrine.

**Cause :** aperçu non licencié, téléchargé sans s'en rendre compte.

**Correctif :** vérifier chaque image **avant** de l'intégrer. Publier un aperçu
non licencié sur le site d'un produit commercial est une contrefaçon, et le
numéro d'image imprimé dessus dispense l'ayant droit d'enquêter.

### Piège n° 12 — Les détails d'outillage qui font perdre une heure

| Symptôme | Cause | Correctif |
|---|---|---|
| `Permission denied` sur `./build.sh` chez l'hébergeur | fichier en mode 644 | `git update-index --chmod=+x build.sh` |
| CORS refuse tout | `CORS_ORIGINS="*"` avec cookies | un navigateur refuse `*` quand `credentials: true` |
| `npm ci` échoue sur `esbuild.exe` (Windows) | un serveur de dev tient le fichier | tuer le processus |
| Heredoc cassé en PowerShell | apostrophes françaises | passer par un fichier de message |
| `grep` qui ne finit jamais | fichier de 37 000 lignes | cibler le fichier, pas le dossier |
| Variables invisibles dans `.env` | collées en texte libre | format strict `CLE=valeur` |

---

## 6. Le prompt de démarrage de la prochaine application

À copier tel quel, en remplaçant ce qui est entre crochets.

```
Nous construisons [NOM], un logiciel professionnel de calcul en
[DOMAINE : pompage / assainissement / adduction], destiné aux [MÉTIER].

Il reprend l'architecture d'Irrigation Pro, dont tu vas copier le dépôt :
- une seule origine (API + logiciel + dashboard dans un processus Node) ;
- Supabase pour la base et le stockage des PDF ;
- authentification par cookie HttpOnly, comptes ACTIF/SUSPENDU ouverts à la
  main, aucun paiement en ligne ;
- moteur de calcul côté serveur uniquement ;
- rapports PDF figés, jamais régénérés.

CE QUI CHANGE : uniquement backend/src/engine/. Voici le cahier des charges
des calculs : [COLLER LA SPÉCIFICATION, avec les CAS DE RÉFÉRENCE CHIFFRÉS].

AVANT DE CODER :
1. Lis CLAUDE.md, AGENTS.md et docs/PLAYBOOK-NOUVELLE-APPLICATION.md.
2. Écris docs/MOTEUR-[DOMAINE].md : chaque formule, chaque unité, chaque cas
   de référence. Signale toute ambiguïté au lieu de trancher seul.
3. Écris le contrat d'API de la vague avant de lancer le moindre agent.

RÈGLES : deux agents en parallèle au maximum, sur des périmètres de fichiers
disjoints. Après chaque vague, vérification contre la vraie base avec un
script jetable. Jamais de secret dans la conversation.

Commence par la Vague 0 et rends-moi compte avant d'ouvrir la Vague 1.
```

### Ce que vous devez fournir, et qui conditionne tout

**Les cas de référence chiffrés.** Sur Irrigation Pro, les 16 cas repris des
classeurs Excel (`Dn = 40 mm`, `Q = 256,65 l/s`, `HMT = 30,14 m`…) sont ce qui a
permis de prouver que le moteur était juste, à 10⁻⁶ près.

**Sans cas de référence, un moteur de calcul n'est pas vérifiable.** C'est la
seule chose que personne ne peut produire à votre place : elle vient de votre
métier.

---

## 7. Calendrier réaliste

Mesuré sur Irrigation Pro, avec un propriétaire disponible pour répondre.

| Vague | Durée | Ce qui la ralentit |
|---|---|---|
| 0 — Fondations | ½ journée | rien, si le dépôt est copié |
| 1 — Connexion | 1 journée | rien, si le code est repris |
| 2 — **Moteur** | **2 à 4 jours** | **les ambiguïtés de la spécification** |
| 3 — PDF + admin | 1 à 2 jours | la mise en page du rapport |
| 4 — Finitions | 1 journée | le contenu éditorial du site |
| 5 — Mise en ligne | ½ journée | les allers-retours avec l'hébergeur |

**La vague 2 domine tout.** C'est le moteur, et c'est normal : c'est le produit.
Tout le reste est de l'infrastructure déjà écrite.

---

## 8. Checklist de mise en ligne

À dérouler dans l'ordre, sans en sauter.

**Avant**
- [ ] Bucket de stockage créé, **nom exact noté** (sensible à la casse)
- [ ] Clé **secrète** relevée (pas la publiable)
- [ ] Chaîne de connexion **pooler, port 6543**
- [ ] `JWT_SECRET` généré par l'hébergeur, jamais choisi à la main
- [ ] `build.sh` exécutable et testé en local avec `NODE_ENV=production`

**Après le premier déploiement**
- [ ] `/health` renvoie `"status":"ok"` **et** `"database":{"ok":true}`
- [ ] Connexion, puis **F5** : la session survit
- [ ] Un rapport PDF réellement généré et téléchargé
- [ ] Supervision branchée sur `/health` toutes les 10 minutes

**Avant le premier client payant**
- [ ] Mot de passe de la base réinitialisé si un secret a transité en clair
- [ ] Projet de base séparé pour les tests
- [ ] Sauvegarde de la base **et** du stockage vérifiée
- [ ] Les interfaces essayées à la main, écran par écran

---

## 9. Les deux choses qu'aucun test ne remplace

1. **Regarder les écrans.** 655 tests prouvent qu'une fonction renvoie la bonne
   valeur. Aucun ne dit qu'un bouton est illisible ou qu'un écran saute au
   chargement. Cette réserve est restée ouverte de la vague 1 à la vague 5 sur
   ce projet.
2. **Regarder un vrai PDF.** C'est le document que votre client remet à **son**
   client. Il porte votre réputation. Sa structure se teste ; sa mise en page se
   juge à l'œil.

Un agent qui pilote un navigateur (Antigravity, ou Claude Code avec un outil de
capture) comble le premier point. Le second demande votre œil d'ingénieur.

---

## 10. Ce qui reste vrai quel que soit le domaine

- **Le savoir-faire ne descend jamais dans le navigateur.** Les formules
  s'exécutent sur le serveur. Même en examinant le logiciel, on n'y trouve rien.
- **Un rapport ne se régénère jamais.** Une référence imprimée désigne un
  document, pour toujours.
- **Les avertissements métier ne sont jamais masquables.** C'est ce qui
  distingue le logiciel du tableur qu'il remplace : le tableur laisse passer une
  vitesse hors plage en silence.
- **Les hypothèses de calcul figurent dans le rapport**, y compris les
  coefficients retenus. Une note de calcul qui tait ses hypothèses n'est pas
  défendable devant un confrère.
- **Un client ne voit jamais les données d'un autre**, et une ressource
  étrangère renvoie 404, jamais 403.

Ces cinq règles ne dépendent ni de l'irrigation, ni du pompage. Elles tiennent
parce que le métier visé engage une **responsabilité professionnelle** — et
c'est vrai de tous les domaines de l'ingénierie.
