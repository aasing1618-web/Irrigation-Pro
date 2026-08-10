# Moteur de calcul — Irrigation gravitaire (à surface libre)

Spécification de référence, issue du classeur `Boite_a_outils_Irrigation.xlsx`
(cours *Systèmes d'irrigation*, Babacar FAYE PhD, Université de Thiès).

**Ce document fait autorité pour l'implémentation.** Toute formule y figure sous
sa forme exacte. Les incohérences relevées dans le classeur d'origine sont
signalées par ⚠️ et **ne doivent pas être corrigées en silence** : le
comportement retenu est indiqué à chaque fois.

Le moteur s'exécute **exclusivement côté serveur** (décision D-007).

---

## 1. Principe d'architecture : un pipeline, pas des formulaires

Le classeur est une chaîne d'étapes où chaque feuille reprend automatiquement
les résultats de la précédente. L'application doit reproduire ce principe : un
**état de projet** dans lequel chaque module lit des valeurs et en publie de
nouvelles — et non des formulaires indépendants.

L'utilisateur peut **écraser localement** une valeur reprise d'une étape
antérieure ; elle devient alors une saisie figée sans casser le reste. Cette
possibilité fait partie de la spécification.

```
1_Doses (Dn, Db) ──────────────┐
                               ├──► 3_Nb_Irrig (Ni, ESP, IC) ──► 4_Capacité (Q)
2_Besoins_eau (Ben, BEn total) ┘                                      ▲
                                                                      │
5_Efficiences (Et,Eb,Ea,Ed,Ei,Ep) ───────────────────────────────────┘
        └──► 7_DFC_DMP ◄── 1_Doses, 2_Besoins_eau

6_Canaux_Manning : module indépendant (Q cible saisi ou repris de 4_Capacité)
```

---

## 2. Glossaire

| Symbole | Signification | Unité |
|---|---|---|
| Dn | Dose nette d'irrigation | mm |
| Db | Dose brute d'irrigation | mm |
| RU | Réserve utile du sol | mm |
| p | Facteur de tarissement | – (0 à 1) |
| θcc | Humidité à la capacité au champ | cm³/cm³ |
| θpf | Humidité au point de flétrissement permanent | cm³/cm³ |
| Z | Profondeur racinaire | cm |
| ETO | Évapotranspiration de référence | mm/j |
| Kc | Coefficient cultural | – |
| Kr | Coefficient de réduction (localisée) | – |
| ETcrop | Évapotranspiration de la culture | mm/j |
| Pe | Pluie efficace | mm/mois |
| Perc | Percolation profonde | mm/mois |
| R | Contribution des eaux souterraines | mm/mois |
| Ben | Besoin net | mm/mois ou mm/j |
| BEb | Besoin brut | mm/mois ou m³/mois |
| Ni | Nombre d'irrigations du cycle | – |
| ESP | Espacement entre deux arrosages | jours |
| IC | Cycle d'irrigation retenu (= ESP − 1 j) | jours |
| At | Superficie totale | ha |
| A | Superficie irriguée par jour | ha/j |
| V | Volume prélevé par jour | m³/j |
| Q | Capacité du système | l/s, m³/h, m³/s |
| T | Durée d'irrigation par jour | h |
| Et, Eb, Ea, Ed, Ei, Ep | Efficiences (transport, bloc, application, distribution, irrigation, projet) | % |

---

## 3. Tables de référence

Constantes de l'application. Jamais modifiables par l'utilisateur.

### Table A — Dose nette Dn (mm) : type de sol × profondeur d'enracinement

| Type de sol | Peu profond (30-60 cm) | Moyen (50-100 cm) | Profond (90-150 cm) |
|---|---|---|---|
| Sols peu profonds / sableux | 15 | 30 | 40 |
| Sols limoneux | 20 | 40 | 60 |
| Sols argileux | 30 | 50 | 70 |

### Table B — Classification des cultures par profondeur d'enracinement (41 entrées)

- **Peu profond (30-60 cm)** : Chou/chou-fleur, Céleri, Laitue, Oignon, Ananas,
  Pomme de terre, Épinards, Légumes (général, sauf betterave/carotte/concombre)
- **Moyen (50-100 cm)** : Bananier, Haricots, Betterave, Carotte, Trèfle, Cacao,
  Concombre, Arachide, Palmier, Pois, Poivrier, Sisal (agave), Soja, Betterave
  sucrière, Tournesol, Tabac, Tomate
- **Profond (90-150 cm)** : Luzerne, Avoine, Agrumes, Cotonnier, Dattier,
  Vergers caducifoliés, Lin, Vigne, Maïs, Melon, Olivier, Carthame, Sorgho,
  Canne à sucre, Patate douce, Blé

### Table C — Efficience d'application Ea (%) *(FAO, 1989)*

| Méthode | Ea (%) |
|---|---|
| Irrigation de surface | 60 |
| Irrigation par aspersion | 75 |
| Irrigation goutte à goutte | 90 |

### Table D — Efficience au champ (%), irrigation de surface

Moyenne = `AVERAGE(Mini, Maxi)`.

| Technique | Mini | Maxi | Moyenne |
|---|---|---|---|
| Irrigation à la raie (inclinée) | 50 | 80 | 65 |
| Irrigation à la raie, réutilisation eaux aval | 60 | 90 | 75 |
| Irrigation à la raie (horizontale) | 65 | 95 | 80 |
| Irrigation par planche | 50 | 80 | 65 |
| Bassins plats | 80 | 95 | 87,5 |

### Table E — Efficience de distribution Ed (%) = Et × Eb

| Longueur de canal | Terre-Sable | Terre-Limon | Terre-Argile | Revêtus |
|---|---|---|---|---|
| Importante (> 2000 m) | 60 | 70 | 80 | 95 |
| Moyenne (200-2000 m) | 70 | 75 | 85 | 95 |
| Faible (< 200 m) | 80 | 85 | 90 | 95 |

### Table F — Efficiences de référence pour le design *(Hayde, 2006)*

| Culture | Ei design (%) | Et design (%) |
|---|---|---|
| Riz | 90 | 95 |
| Cultures sèches | 80 | 95 |

### Table G — Main d'eau usuelle (l/s)

10, 15, 20, 25, 30.

### Table H — Pertes d'eau dans les canaux non revêtus (m³/m² de surface mouillée)

| Type de sol | Mini | Maxi |
|---|---|---|
| Argilo-limoneux imperméables | 0,07 | 0,10 |
| Argilo-limoneux, sols vaseux | 0,15 | 0,23 |
| Sable limoneux | 0,30 | 0,45 |
| Sols sableux | 0,45 | 0,55 |
| Sols sableux graveleux | 0,55 | 0,75 |
| Sols caillouteux perméables | 0,75 | 0,90 |

⚠️ **Table documentaire seule** — aucune formule du classeur ne l'utilise. À
afficher comme aide, ne pas la brancher dans un calcul.

### Table I — Coefficient de rugosité de Manning n *(engineeringtoolbox.com)*

`Ks (Strickler) = 1 / n`.

| Nature de la paroi | n |
|---|---|
| Béton (ciment) - fini | 0,012 |
| Béton - coffrages en acier | 0,011 |
| Béton - coffrages en bois | 0,015 |
| Béton - centrifugé | 0,013 |
| Canal de terre - graveleux | 0,025 |
| Canal de terre - avec mauvaises herbes | 0,030 |
| Canal de terre - pierreux, galets | 0,035 |
| Terre, lisse | 0,018 |
| Métal ondulé | 0,022 |
| Fonte / fonte ductile, neuve | 0,012 |
| Maçonnerie | 0,025 |
| Maçonnerie de moellons | 0,020 |
| Acier lisse | 0,012 |
| Acier neuf non revêtu | 0,011 |
| Acier riveté | 0,019 |
| PVC - parois lisses | 0,010 |
| PEHD - ondulé, parois lisses | 0,012 |
| PEHD - ondulé, parois ondulées | 0,021 |
| Bois raboté | 0,012 |
| Bois non raboté | 0,013 |
| Cours d'eau naturels propres et droits | 0,030 |
| Cours d'eau naturels - grandes rivières | 0,035 |
| Canaux naturels en très mauvais état | 0,060 |

Valeur de repli si matériau non trouvé : **n = 0,014**.

### Table J — Pente longitudinale recommandée *(Savva et Frenken, 2002)*

| Taille du canal | Débit (m³/s) | Pente recommandée |
|---|---|---|
| Gros canaux | > 15,0 | 0,1 – 0,2 ‰ |
| Canaux intermédiaires | 0,3 à 15,0 | 0,2 – 0,3 ‰ |
| Petits canaux d'approvisionnement | < 0,3 | 0,3 – 0,4 ‰ |

Pente maximale à ne jamais dépasser : **1:300 = 0,33 %**.

---

## 4. Module `1_Doses` — Dose nette et dose brute

**Formules-cadre :** `Dn = RFU = p × RU = p × (θcc − θpf) × Z` ; `Db = Dn / E × 100`

### Méthode A — Choix rapide (culture + type de sol)

Entrées : `culture` (Table B), `typeSol` (Table A).

```
catégorieEnracinement = rechercheCatégorie(culture)        // Table B, sinon "-"
dnSuggéré             = TableA[typeSol][catégorieEnracinement]   // sinon "-"
```

### Méthode B — Calcul détaillé (formule RFU)

Entrées : `p` (0–1 ; FAO 56 usuel ≈ 0,3 à 0,7), `θcc`, `θpf` (cm³/cm³), `Z` (cm).

```
RU (mm) = (θcc − θpf) × Z × 10        // ×10 : Z en cm → mm d'eau
Dn (mm) = p × RU
```

### Dose nette retenue

`dnRetenue` vaut par défaut le résultat de la Méthode A. **L'utilisateur peut
l'écraser** par la Méthode B ou une valeur libre.

### Dose brute

Entrées : `typeEfficience` ∈ {`Ea`, `Eb`, `Ep`} et `valeurEfficience` (%).

```
Db (mm) = dnRetenue / valeurEfficience × 100
```

⚠️ **Particularité du classeur gravitaire.** `valeurEfficience` y est une
**saisie libre**, non reliée au module `5_Efficiences` — l'utilisateur doit la
recopier lui-même. Le classeur « sous pression », lui, la calcule
automatiquement.

**Comportement retenu pour l'application :** proposer automatiquement la valeur
correspondante issue de `5_Efficiences` selon le type choisi, **tout en laissant
l'utilisateur l'écraser**. C'est une correction assumée d'une source d'erreur de
saisie, et elle doit être signalée dans l'interface (« valeur reprise du module
Efficiences »).

### Sorties publiées

`dnRetenue` → `3_Nb_Irrig`, `7_DFC_DMP` · `Db` → `4_Capacité`

### Cas de test de référence (valeurs du classeur)

Culture = Arachide → catégorie « Moyen (50-100 cm) » ; sol = Sols limoneux →
**Dn suggéré = 40 mm**. Méthode B (p=0,5 ; θcc=0,30 ; θpf=0,15 ; Z=90) →
**RU = 135 mm**, **Dn = 67,5 mm**. Dn retenue = 40 mm ; Ea = 70 % →
**Db = 57,142857 mm**.

---

## 5. Module `2_Besoins_eau` — Besoins en eau des cultures

**Formules-cadre :** `ETcrop = Kc × ETO` ; `Ben = ETcrop + Perc − (Pe + R)` ;
`BEb = Σ[10×A×A%×Ben]/E`

### Entrées

- `At` (ha) — superficie totale
- **Deux cultures** : nom + surface (ha) pour chacune
- `irrigationLocalisée` (Oui/Non) et `Kr` si Oui
- **12 mois** de : `ETO` (mm/j), `Pe` (mm/mois), `Perc` (mm/mois), `R` (mm/mois),
  `joursDuMois`, `Kc` culture 1, `Kc` culture 2

### Calculs mensuels, par culture

```
ETcrop (mm/j)   = (irrigationLocalisée ? Kr : 1) × ETO × Kc
Ben (mm/mois)   = MAX(0, ETcrop × joursDuMois + Perc − (Pe + R))
```

Le plafonnement à 0 est **volontaire** : un mois où la pluie efficace dépasse les
besoins ne produit pas de besoin négatif.

### Agrégation à l'échelle du périmètre

```
%surface_i    = surface_i / At
BEbAssolé (mm/mois) = %surface_1 × Ben_1 + %surface_2 × Ben_2
BEb (m³/mois)       = 10 × At × BEbAssolé          // 1 mm sur 1 ha = 10 m³
```

⚠️ **Incohérence du classeur.** Une case « Efficience E à utiliser pour BEb »
(0,7 dans l'exemple) existe et l'en-tête annonce `BEb = Σ[A%×Ben]/E`, **mais la
formule réellement implémentée ne divise pas par E**. Ce que le classeur nomme
« BEb assolé » est donc un **besoin net moyen pondéré**, pas un besoin brut.

**Comportement retenu :** reproduire fidèlement le classeur (**pas de division
par E**), mais **renommer la grandeur** « besoin net assolé » dans l'interface et
les rapports, pour que le libellé cesse de mentir. Exposer la division par E
comme une option explicite, désactivée par défaut.

### Synthèse

```
besoinNetDePointe = MAX(BEbAssolé sur 12 mois)
moisDePointe      = mois correspondant
joursMoisDePointe = jours de ce mois
BEnTotal          = SUM(BEbAssolé sur 12 mois)
```

⚠️ **Bloc annexe non connecté.** Le bas de la feuille (lignes 42-61) calcule un
« débit fictif continu » alternatif avec des hypothèses propres (efficience 0,85
au lieu de 0,7) et des **surfaces codées en dur (50 ha)** au lieu des cellules de
saisie. Aucune autre feuille ne le référence : c'est un exercice pédagogique.
**Ne pas le brancher au pipeline.** Le reproduire, si souhaité, comme module
« exercice » séparé.

### Sorties publiées

`BEnTotal` → `3_Nb_Irrig`, `7_DFC_DMP` · `besoinNetDePointe`, `moisDePointe`,
`joursMoisDePointe` → `7_DFC_DMP` · `BEbAssolé` mensuel + `joursDuMois` →
`3_Nb_Irrig` · `At` → `4_Capacité`, `7_DFC_DMP`

### Cas de test de référence

At = 100 ha, 50 ha maïs / 50 ha coton → **besoin net de pointe = 201,5 mm/mois**
(Juillet, 31 j) ; **BEnTotal = 619,8875 mm**.

> ⚠️ **Donnée manquante — à réclamer.** Le cahier des charges transmis donne les
> **sorties** de ce cas mais pas le **tableau climatique mensuel** qui les
> produit (ETO, Pe, Perc, R, jours, Kc par mois). Les tests utilisent donc un
> calendrier **reconstitué** qui reproduit exactement les valeurs publiées — et
> qui redonne aussi, sans réglage supplémentaire, celles du module
> `3_Nb_Irrig` (Ni 15,497 ; ESP mini 6,1538 en juillet ; IC 5,1538), ce qui est
> un bon indice de cohérence.
>
> Ce n'est **pas** une preuve que le calendrier réel est celui-là. Dès que le
> classeur d'origine sera disponible, remplacer ce calendrier par le vrai et
> relancer les tests. Tant que ce n'est pas fait, ce cas prouve que les
> **formules** sont justes, pas que les **données d'exemple** le sont.

---

## 6. Module `3_Nb_Irrig_ESP_IC` — Nombre d'irrigations, espacement, cycle

**Formules-cadre :** `Ni = BEnTotal / Dn` ; `ESP = Dn / Ben(mm/j)` ;
`IC = ESP − 1 j` *(Savva & Frenken, 2002)*

```
Ni = BEnTotal / dnRetenue
```

`Ni` est théorique ; la planification utilise `ROUNDUP(Ni, 0)`. Le classeur ne
l'automatise pas ici — **l'application doit afficher les deux** (valeur exacte et
arrondi), en indiquant clairement lequel sert à la planification.

### Par mois (12 colonnes)

```
Ben (mm/j)      = joursDuMois = 0 ? 0 : BEbAssolé / joursDuMois
ESP (j)         = Ben(mm/j) = 0 ? "-" : dnRetenue / Ben(mm/j)
IC (j)          = ESP = "-" ? "-" : MAX(1, ESP − 1)
nbArrosagesMois = ESP = "-" ? 0 : ROUNDUP(joursDuMois / ESP, 0)
```

Le numérateur de `ESP` est **toujours le même `Dn`** : la dose ne varie pas d'un
mois à l'autre.

### IC retenu pour le design

```
ESPmini  = MIN(ESP sur les 12 mois)      // le mois le plus exigeant dimensionne
ICretenu = MAX(1, ESPmini − 1)
```

### Sortie publiée

`ICretenu` → `4_Capacité`

### Cas de test de référence

Dn = 40 mm, BEnTotal = 619,8875 mm → **Ni = 15,497** (16 arrosages arrondis).
ESP minimal (Juillet) = 6,1538 j → **ICretenu = 5,1538 j**.

---

## 7. Module `4_Capacite_Systeme` — Capacité du système

**Formules-cadre :** `A = At / IC` ; `V = 10 × A × Db` ; `Q = V / T`

> **Point de méthode à conserver absolument** *(énoncé explicitement dans le
> classeur)* : dans le design, les besoins n'interviennent **que via IC**. C'est
> la **dose brute Db** qui détermine la capacité du système. `Q` ne dépend donc
> pas directement de `Ben` ni de `BEnTotal`.

Entrées : `At` (de `2_Besoins_eau`), `IC` (de `3_Nb_Irrig`), `Db` (de
`1_Doses`), `T` (h/j, saisie libre).

```
A (ha/j)  = At / IC
V (m³/j)  = 10 × A × Db
Q (l/s)   = V / (T × 3600) × 1000
Q (m³/h)  = V / T
Q (m³/s)  = Q(l/s) / 1000
```

### Sensibilité au transport

```
débitTête (l/s)      = Q(l/s)
débitDisponible (l/s) = débitTête × Et        // Et saisi, ex. 0,9
```

### Cas de test de référence

At=100 ha, IC=5,1538 j, Db=57,142857 mm, T=12 h → A=19,403 ha/j,
V=11 087,42 m³/j, **Q = 256,65 l/s = 923,95 m³/h = 0,2567 m³/s**.
Avec Et=0,9 → 230,99 l/s en aval.

---

## 8. Module `5_Efficiences` — Calculateur d'efficiences

**Relations :** `Ed = Et × Eb` ; `Ei = Eb × Ea` ; `Ep = Et × Eb × Ea = Ed × Ea = Et × Ei`

Entrées (%) : `Et` (transport), `Eb` (canaux du bloc), `Ea` (application).

```
Ed = Et × Eb / 100
Ei = Eb × Ea / 100
Ep = Et × Eb × Ea / 10000
```

Vérifications (doivent redonner `Ep`) : `Ed × Ea / 100` et `Et × Ei / 100`.
L'application doit afficher ces contrôles de cohérence.

Aide au choix de `Ea` : Table C. ⚠️ Dans le classeur, cette aide est un
calculateur **local non répercuté** sur `Ea` — l'utilisateur recopie à la main.
**Comportement retenu :** proposer la valeur automatiquement, écrasable.

Définitions à afficher dans l'interface :
- `Et` : eau reçue à l'entrée du bloc / eau lâchée à l'ouvrage de tête
- `Eb` : eau reçue à l'entrée de la parcelle / eau reçue à l'entrée du bloc
- `Ea` : eau disponible pour la culture / eau reçue à l'entrée de la parcelle

### Sortie publiée

`Ep` → `7_DFC_DMP`

### Cas de test de référence

Et=90, Eb=90, Ea=70 → Ed=81, Ei=63, **Ep = 56,7 %**.

---

## 9. Module `6_Canaux_Manning` — Canaux trapézoïdaux

**Formules-cadre :** `Q = (1/n) × S × R^(2/3) × I^(1/2)` ; `S = (b + m·h)·h` ;
`P = b + 2h√(1+m²)` ; `R = S/P`

Entrées : `Qcible` (m³/s), `natureParoi` (Table I) → `n`, `b` (m, largeur au
fond), `m` (fruit des talus), `I` (m/m, pente longitudinale), `h` (m, tirant
d'eau).

```
Ks        = 1 / n
S (m²)    = (b + m × h) × h
P (m)     = b + 2h × √(1 + m²)
R (m)     = S / P
Qcalculé  = Ks × S × R^(2/3) × I^0,5
v (m/s)   = Qcalculé / S
écart     = Qcalculé − Qcible
```

> ⚠️ **Différence majeure d'implémentation.** Dans Excel, `h` est ajusté à la
> main via « Valeur cible » (Goal Seek). **L'application doit résoudre
> numériquement** `Q(h) − Qcible = 0` — dichotomie ou Newton — et renvoyer `h`
> directement. `Q(h)` est strictement croissante sur `h > 0`, la dichotomie
> converge donc toujours. Prévoir une borne haute raisonnable et un nombre
> maximal d'itérations, et rendre l'écart résiduel visible.

### Contrôles à afficher

- Rapport `b/h` : si `h ≪ b` alors `Ks ≈ h^(1/3)` ; si `h ≫ b` alors `Ks ≈ h^(1/6)`
- Vitesse visée **entre 0,3 et 1 m/s** (évite érosion et dépôt)

### Revanche *(Savva et Frenken, 2002)*

```
J (m)          = C × √h            // C = 0,8 si Q ≤ 0,5 m³/s ; 1,35 si Q > 80 m³/s
hauteurTotale  = h + J
```

### Pente recommandée (Table J)

```
tailleCanal = Qcible > 15 ? "Gros canal" : (Qcible ≥ 0,3 ? "Canal intermédiaire" : "Petit canal")
pente       = Qcible > 15 ? "0,1-0,2‰"   : (Qcible ≥ 0,3 ? "0,2-0,3‰"            : "0,3-0,4‰")
```

### Cas de test de référence

Qcible=0,09 m³/s, paroi « Terre, lisse » (n=0,018 ; Ks=55,556), b=0,3 m, m=1,
I=0,001, h≈0,29639 m → S=0,17676 m², P=1,13831 m, R=0,15528 m,
**Qcalculé ≈ 0,08971 m³/s** (écart −0,000285), v=0,5075 m/s. Revanche (C=0,8) :
J=0,4355 m → hauteur totale 0,7319 m. « Petit canal », pente « 0,3-0,4 ‰ ».

---

## 10. Module `7_DFC_DMP` — Débit fictif continu, débit de pointe, quartiers

Exprime la capacité en **débit spécifique par hectare**, pour découper le réseau
en quartiers hydrauliques *(p.140 du support de cours)*.

```
DFCnet (l/s/ha)  = Qm(mm/mois) / (joursMoisDePointe × 8,64)
DFCbrut (l/s/ha) = DFCnet / Ep                    // Ep en fraction
DMP (l/s/ha)     = DFCbrut × K                    // K de 1,1 à 1,3, usuel 1,2
W (ha)           = mainDEau / DFCbrut             // Table G
N (quartiers)    = ROUNDUP(At / W, 0)
F (arrosages)    = ROUNDUP(BEnTotal / Dn, 0)
```

`Qm` = besoin net mensuel de pointe (de `2_Besoins_eau`).

### Cas de test de référence

Qm=201,5 mm (31 j) → DFCnet=0,7523 l/s/ha ; Ep=0,567 → DFCbrut=1,3268 l/s/ha ;
K=1,2 → **DMP=1,5922 l/s/ha**. Main d'eau=20 l/s → W=15,073 ha ; At=100 ha →
**N=7 quartiers**. D=40 mm, BEnTotal=619,8875 mm → **F=16 arrosages**.

---

## 11. Exigences de test

Chaque module doit avoir un test unitaire qui **reproduit exactement le cas de
référence ci-dessus**, avec une tolérance relative de 1e-6. Ce sont les valeurs
du classeur d'origine : elles constituent la preuve que le portage est fidèle.

Tester en plus, pour chaque module : les entrées nulles ou négatives, les
divisions par zéro (mois sans besoin, efficience nulle), et les valeurs hors
plage (efficience > 100 %, `p` hors [0,1]). Aucune formule ne doit produire
`NaN` ou `Infinity` : elle renvoie une erreur métier explicite.
