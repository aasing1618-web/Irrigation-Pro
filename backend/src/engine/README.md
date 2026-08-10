# Moteur de calcul — Irrigation Pro

> ## ⛔ Ce dossier ne quitte JAMAIS le serveur
>
> **Décision D-007** (`docs/DECISIONS.md`). Le contenu de `backend/src/engine/`
> n'est **jamais** livré au client, ni compilé dans l'application installée, ni
> recopié dans `app/`, `admin/` ou `site/`.
>
> **Pourquoi :** ces formules et ces tables sont le cœur de valeur du produit —
> c'est très exactement ce que le client achète. Une application installée sur un
> poste Windows est **décompilable** : tout code de calcul embarqué serait
> lisible par un concurrent en quelques minutes.
>
> **En pratique :**
>
> - l'application envoie des **paramètres d'entrée** et reçoit des **résultats
>   numériques** ; aucune formule, aucun coefficient métier ne transite ;
> - les tables de référence (dose nette par type de sol, `n` de Manning, `C` de
>   Hazen-Williams, fractions du diamètre mouillé…) ne sortent du serveur que
>   sous forme de couples `{ cle, libelle }`, via `listerReferences()` — jamais
>   leurs valeurs ;
> - le catalogue `listerModules()` ne décrit que des **métadonnées d'affichage**
>   (libellé, unité, plage de saisie), pour que l'application puisse construire
>   ses formulaires sans connaître les formules ;
> - seule exception admise côté interface : des contrôles de saisie triviaux
>   (« ce champ doit être un nombre positif »), **toujours redoublés ici**.

---

## Ce que fait ce dossier

Le moteur porte les calculs d'irrigation issus de deux classeurs Excel du cours
*Systèmes d'irrigation* (Babacar FAYE PhD, Université de Thiès) :

| Classeur | Spécification qui fait autorité |
|---|---|
| `Boite_a_outils_Irrigation.xlsx` (gravitaire, à surface libre) | [`docs/MOTEUR-GRAVITAIRE.md`](../../../docs/MOTEUR-GRAVITAIRE.md) |
| `Boite_a_outils_Irrigation_sous_pression.xlsx` (aspersion, goutte-à-goutte) | [`docs/MOTEUR-SOUS-PRESSION.md`](../../../docs/MOTEUR-SOUS-PRESSION.md) |

**Les deux documents de spécification font autorité sur ce code.** Ils décrivent
chaque formule sous sa forme exacte, signalent par ⚠️ les incohérences des
classeurs d'origine et indiquent le comportement retenu pour chacune. Toute
divergence entre le code et ces documents est un défaut du code.

Le moteur est constitué de **fonctions pures** : aucune base de données, aucune
entrée/sortie, aucun appel réseau. Il est donc entièrement testable hors ligne,
et `calculer()` est **synchrone**.

---

## Surface publique

Tout passe par `index.ts`, et par lui seul :

| Fonction | Rôle |
|---|---|
| `calculer(module, entrees)` | Exécute un module. Lève `ErreurValidation` (→ 400) ou `ErreurCalculImpossible` (→ 422). |
| `listerModules()` / `decrireModule(code)` | Catalogue des modules et de leurs champs, sans aucun coefficient métier. |
| `listerReferences(table)` / `listerTablesDeReference()` | Listes déroulantes, sous forme de couples `{ cle, libelle }` uniquement. |

Les erreurs portent un `code` machine stable, un `champ` fautif quand il est
identifiable, et un **message en français destiné à un ingénieur agronome** —
jamais un message technique, jamais un message anglais de bibliothèque.

---

## Les modules

`COMMUN` = partagé par les deux classeurs, paramétré par `variante`.

### Modules partagés

| Code | Ce qu'il calcule | Formules et sources |
|---|---|---|
| `DOSES` | Dose nette `Dn` (par table sol × enracinement, ou par la formule de la réserve facilement utilisable) puis dose brute `Db`. | `Dn = RFU = p × RU = p × (θcc − θpf) × Z` ; `Db = Dn / E × 100`. MOTEUR-GRAVITAIRE.md §4, MOTEUR-SOUS-PRESSION.md §2. Plages usuelles du facteur de tarissement : **FAO 56** (Allen *et al.*, 1998). Efficiences d'application : **FAO (1989)**. |
| `CAPACITE_SYSTEME` | Superficie irriguée par jour, volume journalier, débit du système ; bloc de sensibilité au transport en gravitaire. | `A = At / IC` ; `V = 10 × A × Db` ; `Q = V / T`. MOTEUR-GRAVITAIRE.md §7, MOTEUR-SOUS-PRESSION.md §5. Les besoins n'interviennent que **par le cycle `IC`** : c'est `Db` qui dimensionne. |

### Réseau gravitaire (canaux à surface libre)

| Code | Ce qu'il calcule | Formules et sources |
|---|---|---|
| `BESOINS_EAU_GRAVITAIRE` | Besoin net mensuel de chaque culture, besoin **net assolé** du périmètre, mois de pointe, besoin total du cycle, volumes. | `ETcrop = Kc × ETO` ; `Ben = MAX(0, ETcrop × jours + Perc − (Pe + R))` ; agrégation pondérée par les surfaces. Méthode **FAO 56**. MOTEUR-GRAVITAIRE.md §5. |
| `IRRIGATIONS_GRAVITAIRE` | Nombre d'irrigations du cycle, espacement mois par mois, cycle d'irrigation retenu pour le design. | `Ni = BEnTotal / Dn` ; `ESP = Dn / Ben(mm/j)` ; `IC = MAX(1, ESP − 1)`. **Savva & Frenken (2002)**, FAO. MOTEUR-GRAVITAIRE.md §6. |
| `EFFICIENCES` | Efficiences de distribution, d'irrigation et de projet, avec contrôles de cohérence. | `Ed = Et × Eb` ; `Ei = Eb × Ea` ; `Ep = Et × Eb × Ea`. Tables **FAO (1989)** et **Hayde (2006)**. MOTEUR-GRAVITAIRE.md §8. |
| `CANAL_MANNING` | Tirant d'eau d'un canal trapézoïdal pour un débit cible, section, vitesse, revanche, pente recommandée. | `Q = (1/n) × S × R^(2/3) × I^(1/2)` ; `S = (b + m·h)·h` ; `P = b + 2h√(1+m²)` ; `R = S/P` (**Manning-Strickler**). Rugosités : *engineeringtoolbox.com*. Revanche et pentes recommandées : **Savva & Frenken (2002)**. MOTEUR-GRAVITAIRE.md §9. |
| `DFC_DMP` | Débit fictif continu net et brut, débit maximal de pointe, superficie par main d'eau, découpage en quartiers hydrauliques. | `DFCnet = Qm / (jours × 8,64)` ; `DFCbrut = DFCnet / Ep` ; `DMP = DFCbrut × K` ; `W = mainDEau / DFCbrut`. Support de cours, p. 140. MOTEUR-GRAVITAIRE.md §10. |

### Réseau sous pression (aspersion, goutte-à-goutte)

| Code | Ce qu'il calcule | Formules et sources |
|---|---|---|
| `BESOINS_EAU_SOUS_PRESSION` | Besoins net et brut mensuels d'une culture unique, mois excédentaires, mois de pointe, besoin total du cycle. | `ETcrop = Kr × Kc × ETO` ; `Ben = ETcrop × jours + Perc − (Pe + R)` ; `BEb = Ben / Ea`. Méthode **FAO 56**. MOTEUR-SOUS-PRESSION.md §3. |
| `IRRIGATIONS_SOUS_PRESSION` | Version compacte du module précédent, calculée sur le seul mois de pointe. | `Ni = BEnTotal / Dn` ; `ESP = Dn / Ben(mm/j)` ; `IC = ESP − 1`. **Savva & Frenken (2002)**. MOTEUR-SOUS-PRESSION.md §4. |
| `ASPERSION` | Espacement des arroseurs selon le vent, pluviométrie de l'installation, contrôle du ruissellement, arroseurs simultanés, durée et nombre de positions par jour. | `Se = Sl = %Dm` ; `Pr = q / (Se × Sl)` ; `N = Qsystème / q` ; `t = Db / Pr`. Espacements selon le vent : **FAO Irrigation & Drainage Paper 8** (Vermeiren & Jobling, 1980). MOTEUR-SOUS-PRESSION.md §6. |
| `GOUTTE_A_GOUTTE` | Débit par plant, pourcentage de surface mouillée, densité de plantation, découpage en secteurs, volume et durée par poste. | `qp = Ne × qa` ; `Pw = Ne × π × (Dw/2)² / (Sp × Sr)` ; `t = (Db × Sp × Sr) / qp`. Surfaces mouillées minimales : **FAO Irrigation & Drainage Paper 24** (Doorenbos & Pruitt, 1977). MOTEUR-SOUS-PRESSION.md §7. |
| `RESEAU_HAZEN_WILLIAMS` | Pertes de charge de chaque tronçon du réseau, facteur de Christiansen, contrôle des vitesses, agrégation des ΔH pour la pompe. | `J = 10,67 × Q^1,852 / (C^1,852 × D^4,87)` (**Hazen-Williams**) ; `F = 1/(m+1) + 1/(2N) + √(m−1)/(6N²)` (**Christiansen**) ; `v = Q / (πD²/4)`. MOTEUR-SOUS-PRESSION.md §8. |
| `POMPE_HMT` | Hauteur manométrique totale, puissances hydraulique et absorbée. | `HMT = Hg + Pservice + ΔHlin + ΔHsing` ; `Ph = 9,81 × Q × HMT` ; `Pa = Ph / η`. MOTEUR-SOUS-PRESSION.md §9. Le **NPSH disponible n'est pas calculé** : il est rappelé à l'utilisateur, jamais inventé. |
| `COEFFICIENT_CHRISTIANSEN` | Lecture ou interpolation du facteur `F(n)` tabulé d'une rampe à sorties multiples, comparé à la formule continue. | Table `F(n)` de **Christiansen**, valable de 5 à 100 sorties. MOTEUR-SOUS-PRESSION.md §10. |

### Modules volontairement absents

- **Le module `Kr` / besoin en lixiviation est retiré du périmètre du produit**,
  par décision du propriétaire (2026-08-10) : sa spécification était incomplète
  et il est peu utilisé en pratique. Ne pas le réintroduire sans une
  spécification complète et une validation explicite.
- **`10_Application_RAM`** (choix d'un goutteur autorégulant) est un exercice
  résolu autonome, hors du pipeline de conception ; il n'est pas encore porté.
- **Table H** (pertes d'eau dans les canaux non revêtus) est **documentaire
  seule** : aucune formule ne l'utilise, et elle ne doit être branchée dans aucun
  calcul.

---

## Organisation des fichiers

```
engine/
├── index.ts          ← surface publique : registre des modules, catalogue, tables
├── types.ts          ← enveloppe de résultat et description des modules
├── erreurs.ts        ← erreurs métier (VALIDATION → 400, CALCUL_IMPOSSIBLE → 422)
├── validation.ts     ← pont zod, messages traduits en français
├── nombres.ts        ← équivalents Excel de ROUNDUP et INT
├── version.ts        ← version du moteur, archivée avec chaque calcul
├── tables/           ← tables de référence (constantes métier, jamais exposées)
├── commun/           ← modules partagés par les deux classeurs
├── gravitaire/       ← modules propres au réseau à surface libre
└── sous-pression/    ← modules propres au réseau sous pression
```

---

## Règles de contribution

1. **Un module sans test n'est pas terminé.** Les tests vivent dans
   `backend/tests/engine/` :
   - `references-gravitaire.test.ts` et `references-sous-pression.test.ts`
     rejouent le **cas de test de référence** de chaque module, avec les valeurs
     chiffrées des classeurs d'origine ;
   - `comportements-specifies.test.ts` verrouille les arbitrages ⚠️ des
     spécifications ;
   - `robustesse.test.ts` couvre les entrées nulles, négatives, hors plage et les
     divisions par zéro ;
   - `garde-fou-non-fini.test.ts` balaie **tous les modules du registre** pour
     garantir qu'aucune sortie n'est `NaN` ou `Infinity`.
2. **Ne jamais modifier une valeur attendue pour faire passer un test.** Si un
   calcul ne retrouve pas la référence, le défaut est dans le moteur. Si la
   référence elle-même paraît fausse, laisser le test en échec, le marquer, et
   faire trancher.
3. **Ajouter un module, c'est aussi ajouter son jeu d'entrées valides** dans
   `backend/tests/engine/aide-moteur.ts` : sans lui, le filet de sécurité
   générique échoue — c'est délibéré.
4. **Aucune formule ne renvoie `NaN` ni `Infinity`** : toute division dont le
   dénominateur peut s'annuler passe par `diviser()`, toute grandeur publiée par
   `exigerFini()`, et l'utilisateur reçoit une erreur métier explicite.
5. **Aucune valeur de table ne doit être inventée.** Les cases illisibles de la
   source (`n.d.`) sont `null` et produisent une erreur qui renvoie vers la
   méthode continue.
