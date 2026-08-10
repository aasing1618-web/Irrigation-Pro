# Moteur de calcul — Irrigation sous pression (aspersion & goutte-à-goutte)

Spécification de référence, issue du classeur
`Boite_a_outils_Irrigation_sous_pression.xlsx` (cours *Systèmes d'irrigation*,
Babacar FAYE PhD, Université de Thiès).

Mêmes conventions que [MOTEUR-GRAVITAIRE.md](MOTEUR-GRAVITAIRE.md) : ⚠️ signale
une particularité du classeur d'origine, jamais corrigée en silence. Le glossaire
et le principe de pipeline y sont décrits et ne sont pas répétés ici.

Le moteur s'exécute **exclusivement côté serveur** (décision D-007).

```
1_Doses (Dn, Db) ──┐
2_Besoins_eau ─────┼──► 3_Nb_Irrig (Ni, ESP, IC) ──► 4_Débit (Q)
                   │                                     │
                   │              ┌──────────────────────┴──────────────────┐
                   │              ▼                                         ▼
                   │        5_Aspersion                          6_Goutte_a_goutte
                   │              └──────────────┬──────────────────────────┘
                   │                             ▼
                   │              7_Reseau_Hazen_Williams ◄── 9_Coeff_Fn (table F(n))
                   │                             ▼
                   │                     8_HMT_Pompe
   (exemples résolus indépendants : 10_Application_RAM, 11_Application_Kr_LR)
```

---

## 1. Tables de référence

Les tables A (dose nette par sol × enracinement) et B (classification des
cultures) sont **identiques** à celles du classeur gravitaire — mêmes valeurs.
La table B y est réduite à 30 cultures, sous-ensemble adapté aux conduites sous
pression ; **utiliser la liste complète** est sans risque et évite de maintenir
deux listes.

### Table C — Efficience d'application Ea (%) *(FAO, 1989)*

| Méthode | Ea (%) |
|---|---|
| Aspersion | 75 |
| Goutte-à-goutte | 90 |

### Table D — Espacement des arroseurs (% du diamètre mouillé Dm) selon le vent
*(adapté de FAO Irrigation & Drainage Paper 8, Vermeiren & Jobling, 1980)*

| Classe de vent | % de Dm (Se et Sl) |
|---|---|
| Calme (< 2 m/s) | 0,65 |
| Faible (2-4 m/s) | 0,60 |
| Modéré (4-6 m/s) | 0,50 |
| Fort (> 6 m/s) | 0,30 |

### Table E — Coefficient de Hazen-Williams C

| Matériau | C |
|---|---|
| PVC | 150 |
| PEHD (polyéthylène) | 140 |
| Aluminium neuf | 120 |
| Aluminium usagé | 100 |
| Acier galvanisé | 100 |
| Fonte | 130 |
| Béton | 130 |
| Amiante-ciment | 140 |

### Table F — Débits usuels de goutteurs

2, 4, 8, 16 l/h — tous donnés à une pression de service de **1 bar ≈ 10 mCE**
(goutteurs non autorégulants).

### Table G — Vitesse admissible dans les conduites (m/s)

| Type de conduite | Mini | Maxi |
|---|---|---|
| Conduite principale / secondaire | 0,5 | 1,5 |
| Rampe (porte-arroseurs / porte-goutteurs) | 0,3 | 1,0 |
| Conduite de refoulement (sortie pompe) | 1,0 | 2,5 |

### Table H — Diamètres intérieurs commerciaux (PVC/PE), mm

16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 200.

### Table I — Surface mouillée minimale recommandée (goutte-à-goutte)
*(adapté de FAO Irrigation & Drainage Paper 24, Doorenbos & Pruitt, 1977)*

| Climat | % surface mouillée mini |
|---|---|
| Humide | 25 % |
| Semi-aride | 40 % |
| Aride | 60 % |

### Table L — Conversion pression

**1 bar = 10,19 mCE** (mètres de colonne d'eau). Constante à centraliser.

---

## 2. Module `1_Doses`

Identique au module `1_Doses` gravitaire (Méthode A par table, Méthode B par
formule RFU), **à une différence près** :

La méthode d'irrigation est choisie dans la Table C (Aspersion /
Goutte-à-goutte) et la valeur `Ea` (%) est **calculée automatiquement** — ici le
classeur fait bien la liaison, contrairement au classeur gravitaire.

```
Db (mm) = dnRetenue / Ea(%) × 100
```

### Cas de test de référence

Culture=Arachide, sol=Sols limoneux → Dn=40 mm. Méthode = goutte-à-goutte →
Ea=90 % → **Db = 44,4444 mm**.

---

## 3. Module `2_Besoins_eau`

**Deux différences majeures** avec la version gravitaire : **une seule culture**
(pas d'assolement), et le besoin brut divise bien par `Ea`.

**Formules-cadre :** `ETcrop = Kr × Kc × ETO` ;
`Ben = ETcrop × jours + Perc − (Pe + R)` ; `BEb = Ben / Ea`

Entrées : `At` (ha), `culture`, `irrigationLocalisée` (Oui/Non), `Kr` si Oui
(**Kr = 1 en aspersion**, couverture totale), puis 12 mois de `ETO`, `Pe`,
`Perc`, `R`, `joursDuMois`, `Kc`.

```
ETcrop (mm/j) = (irrigationLocalisée ? Kr : 1) × Kc × ETO
Ben (mm/mois) = ETcrop × joursDuMois + Perc − (Pe + R)
BEb (mm/mois) = Ben / Ea                          // Ea en fraction, de 1_Doses
```

⚠️ **Différence avec le classeur gravitaire : aucun plafonnement à 0.** Dans
l'exemple fourni, Septembre donne `Ben = −10` (la pluie efficace dépasse le
besoin).

**Comportement retenu :** conserver la valeur négative dans le **calcul mensuel**
(elle traduit un excédent de pluie, information utile), mais **plafonner à 0 dans
la somme du cycle et dans la recherche du mois de pointe** — sinon un mois
pluvieux viendrait subventionner artificiellement un mois sec, ce qui
sous-dimensionnerait le système. Afficher les deux valeurs, et signaler
visuellement les mois excédentaires.

### Synthèse

```
besoinNetDePointe = MAX(Ben sur 12 mois)
moisDePointe / joursMoisDePointe = mois correspondant
BEnTotal          = SUM(Ben sur 12 mois)
```

### Cas de test de référence

At=10 ha, Tomate, goutte-à-goutte, Kr=0,85 → **besoin net de pointe =
171,275 mm/mois** (mois 4, 31 j) ; **BEnTotal = 507,80375 mm**.

> ⚠️ **Donnée manquante — à réclamer.** Comme pour le classeur gravitaire, le
> **tableau climatique mensuel** de ce cas n'a pas été transmis : seules les
> sorties le sont. Les tests utilisent un calendrier reconstitué qui reproduit
> exactement les valeurs publiées. À remplacer par le vrai tableau dès que le
> classeur sera disponible.
>
> ⚠️ **Ambiguïté sur `BEnTotal = 507,80375 mm`.** Le classeur ne plafonne pas
> les mois excédentaires. Deux lectures sont possibles : le total **inclut** le
> −10 mm de septembre (507,80375), ou il ne compte que les mois déficitaires
> (517,80375). L'implémentation expose **les deux** : `bEnTotalClasseur`
> (fidèle au classeur, qui retrouve la valeur publiée) et le total retenu pour
> le **dimensionnement**, qui plafonne à 0 — c'est celui-là qu'il faut utiliser,
> car un mois pluvieux ne doit pas subventionner un mois sec.
>
> À confirmer par l'auteur du classeur.

---

## 4. Module `3_Nb_Irrig_ESP_IC`

Plus compact que la version gravitaire : **pas de tableau mensuel**, tout est
calculé sur le seul mois de pointe.

```
Ni       = BEnTotal / dnRetenue
NiArrondi = ROUNDUP(Ni, 0)                    // ici l'arrondi EST automatisé

Ben (mm/j) = besoinNetDePointe / joursMoisDePointe
ESP (j)    = dnRetenue / Ben(mm/j)
IC (j)     = ESP − 1
```

⚠️ **Pas de `MAX(1, …)` sur IC**, contrairement au classeur gravitaire : `IC`
pourrait descendre sous 1 si `ESP < 2`.

**Comportement retenu :** ne pas plafonner silencieusement, mais **refuser le
calcul avec un message explicite** si `IC ≤ 0` — un cycle négatif n'a pas de sens
physique et propagerait une aberration jusqu'au débit de la pompe. Avertir si
`0 < IC < 1`.

### Cas de test de référence

BEnTotal=507,80375, Dn=40 → Ni=12,695 → **NiArrondi = 13**. Ben pointe=171,275 mm
(31 j) → 5,525 mm/j → ESP=7,2398 j → **IC = 6,2398 j**.

---

## 5. Module `4_Debit_Systeme`

Formules **strictement identiques** à `4_Capacite_Systeme` du classeur
gravitaire (`A = At/IC` ; `V = 10×A×Db` ; `Q = V/T`), **sans** le bloc de
sensibilité `Et`.

`T` est souvent plus élevé qu'en gravitaire (20 h dans l'exemple contre 12 h) :
les équipements sous pression fonctionnent plus longtemps par jour.

**À implémenter comme un module partagé** entre les deux classeurs, paramétré.

### Cas de test de référence

At=10 ha, IC=6,2398 j, Db=44,4444 mm, T=20 h → A=1,6026 ha/j, V=712,271 m³/j,
**Q = 9,8927 l/s = 35,614 m³/h = 0,0098927 m³/s**.

---

## 6. Module `5_Aspersion`

**Formules-cadre :** `Se, Sl = %Dm (vent)` ; `Pr = q / (Se×Sl)` ;
`N = Qsystème / q` ; `t = Db / Pr`

```
%Dm            = TableD[classeVent]
Se (m)         = %Dm × Dm            // espacement entre rampes
Sl (m)         = %Dm × Dm            // espacement entre arroseurs sur la rampe
surfaceParArroseur (m²) = Se × Sl

Pr (mm/h)      = q / (Se × Sl)       // q en l/h → 1 l/m² = 1 mm
```

Contrôle du ruissellement, avec `Ki` = vitesse d'infiltration du sol (mm/h) :

```
Pr ≤ Ki  → « OK — pas de ruissellement »
Pr > Ki  → « Risque de ruissellement : réduire q ou augmenter Se×Sl »
```

```
Qsystème (l/h)          = Q(l/s) × 3600
N (arroseurs simultanés) = Qsystème(l/h) / q
surfaceSimultanée (ha)   = N × Se × Sl / 10000
t (h par position)       = Db / Pr
positionsParJour         = T / t
```

Vérification à afficher : le produit (positions × durée) doit couvrir la surface
totale sur le cycle `IC` retenu. ⚠️ Cette vérification est **manuelle** dans le
classeur — **l'application doit l'automatiser** et signaler l'incohérence, c'est
précisément le genre d'erreur qu'un tableur laisse passer.

### Cas de test de référence

Dm=24 m, vent « Faible » (0,60) → Se=Sl=14,4 m → 207,36 m²/arroseur.
q=1400 l/h → **Pr=6,7515 mm/h** ; Ki=15 → OK. Qsystème=9,8927 l/s=35 613,57 l/h
→ **N=25,44** arroseurs → 0,5275 ha simultanés. Db=44,4444 mm →
**t=6,5829 h/position** ; T=20 h → **3,038 positions/jour**.

---

## 7. Module `6_Goutte_a_goutte`

**Formules-cadre :** `qp = Ne × qa` ; `Pw = Ne×π×(Dw/2)² / (Sp×Sr)` ;
`t = (Db × Sp × Sr) / qp`

```
qp (l/h)   = Ne × qa                                   // débit par plant
Pw (%)     = Ne × π × (Dw/2)² / (Sp × Sr) × 100        // surface mouillée
%mini      = TableI[climat] × 100
```

Contrôle : `Pw ≥ %mini` → « OK — surface mouillée suffisante », sinon
« Insuffisant : augmenter Ne, qa ou Dw ».

```
plantsParHa            = 10000 / (Sp × Sr)
débitParHa (l/h/ha)    = plantsParHa × qp
surfaceSimultanée (ha) = Qsystème(l/h) / débitParHa
nombreDeSecteurs       = ROUNDUP(At / surfaceSimultanée, 0)

volumeParPlant (L)     = Db × Sp × Sr
t (h par poste)        = volumeParPlant / qp
```

### Cas de test de référence

Sp=0,4 m, Sr=1,2 m, Ne=1, qa=4 l/h → qp=4 l/h. Dw=0,6 m → **Pw=58,905 %** ;
climat semi-aride (40 %) → OK. plantsParHa=20 833,33 → débitParHa=83 333,33 l/h/ha.
Qsystème=35 613,57 l/h → 0,4274 ha simultanés ; At=10 ha → **24 secteurs**.
Db=44,4444 mm → volumeParPlant=21,333 L → **t=5,333 h/poste**.

---

## 8. Module `7_Reseau_Hazen_Williams`

**Formules-cadre :** `J = 10,67 × Q^1,852 / (C^1,852 × D^4,87)` ;
`F = 1/(m+1) + 1/(2N) + √(m−1)/(6N²)` ; `v = Q / (πD²/4)`

```
Q (m³/s) = Q(l/s) / 1000
D (m)    = D(mm) / 1000
m        = 1,852                       // exposant de Hazen-Williams, constante
J (m/m)  = 10,67 × Q^1,852 / (C^1,852 × D^4,87)
F        = N > 1 ? 1/(m+1) + 1/(2N) + √(m−1)/(6N²) : 1
ΔH (m)   = J × L × F
v (m/s)  = Q / (π × D² / 4)
```

`N` = nombre de sorties équidistantes sur le tronçon (0 ou 1 = conduite simple).
`F` est le **facteur de Christiansen** : le long d'une rampe, chaque sortie
prélève du débit, donc la perte de charge réelle est inférieure à celle d'une
conduite à débit constant.

Contrôle de vitesse selon la Table G, avec le type de conduite en paramètre.

> ⚠️ **Point d'architecture.** Le classeur dit : « recopiez cette feuille pour
> chaque tronçon ». **L'application doit donc traiter le réseau comme une liste
> de tronçons** (rampe, porte-rampe, secondaire, principale), chacun avec ses
> paramètres, et **agréger les ΔH** pour alimenter `8_HMT_Pompe`. C'est la
> principale amélioration structurelle à apporter par rapport au tableur.

### Cas de test de référence

PEHD (C=140), D=63 mm, Q=5 l/s, L=100 m, N=0 → F=1, **J=0,043575 m/m**,
**ΔH=4,3575 m**, **v=1,604 m/s** → « hors plage usuelle » (> 1,5 m/s).

---

## 9. Module `8_HMT_Pompe`

**Formules-cadre :** `HMT = Hg + Pservice(m) + ΔHlin + ΔHsing` ;
`Ph = 9,81 × Q × HMT` ; `Pa = Ph / η`

```
Pservice (m)  = Pservice(bar) × 10,19
ΔHlinéaire    = Σ ΔH des tronçons        // de 7_Reseau_Hazen_Williams
ΔHsingulières = %singulières × ΔHlinéaire   // coudes, vannes, filtres ; ex. 10 %
HMT (m)       = Hg + Pservice(m) + ΔHlinéaire + ΔHsingulières

Ph (kW)  = 9,81 × Q(m³/s) × HMT(m)
Pa (kW)  = Ph / η                        // η = rendement pompe + moteur
Pa (CV)  = Pa(kW) / 0,736
```

Le **NPSH disponible** n'est pas calculé par le classeur : afficher un rappel
explicite qu'il doit être vérifié auprès du constructeur. Ne pas l'inventer.

### Cas de test de référence

Hg=15 m, Pservice=1 bar=10,19 m, ΔHlin=2+1,5+1=4,5 m, singulières 10 %=0,45 m →
**HMT=30,14 m**. Q=0,0098927 m³/s → **Ph=2,925 kW** ; η=0,65 → **Pa=4,50 kW ≈
6,11 CV**.

---

## 10. Module `9_Coeff_Fn_Rampe` — Table de Christiansen tabulée

`ΔHréel = ΔH(sans sortie) × F(n)`. Trois cas selon la position du premier
orifice : **F1** à une distance S de la tête, **F2** près de la tête (0),
**F3** à S/2. Deux matériaux (exposant de perte de charge différent).

| n | Plast. F1 | Plast. F2 | Plast. F3 | Alu F1 | Alu F2 | Alu F3 |
|---|---|---|---|---|---|---|
| 2 | n.d. | n.d. | n.d. | 0,64 | n.d. | 0,52 |
| 3 | n.d. | n.d. | n.d. | 0,54 | n.d. | 0,44 |
| 5 | 0,469 | 0,337 | 0,410 | 0,457 | 0,321 | 0,396 |
| 10 | 0,415 | 0,350 | 0,384 | 0,402 | 0,336 | 0,371 |
| 15 | 0,398 | 0,355 | 0,377 | 0,385 | 0,341 | 0,363 |
| 20 | 0,389 | 0,357 | 0,373 | 0,376 | 0,343 | 0,360 |
| 25 | 0,384 | 0,358 | 0,371 | 0,371 | 0,345 | 0,358 |
| 30 | 0,381 | 0,359 | 0,370 | 0,368 | 0,346 | 0,357 |
| 40 | 0,376 | 0,360 | 0,368 | 0,363 | 0,347 | 0,355 |
| 50 | 0,374 | 0,361 | 0,367 | 0,361 | 0,348 | 0,354 |
| 100 | 0,369 | 0,362 | 0,366 | 0,356 | 0,349 | 0,352 |

`n.d.` = valeur illisible sur la source. **Ne pas inventer ces valeurs** :
renvoyer une erreur explicite invitant à utiliser la formule continue.

**Interpolation linéaire, valable 5 ≤ n ≤ 100.** Hors plage : utiliser la
formule continue de Christiansen du module `7_Reseau_Hazen_Williams`, valable
pour tout `n`.

⚠️ Dans le classeur, **aucun lien automatique** entre cette table et
`7_Reseau_Hazen_Williams` : l'utilisateur recopie à la main.
**Comportement retenu :** proposer la valeur tabulée comme aide de contrôle, et
garder la formule continue comme source du calcul.

### Cas de test de référence

n=20, plastique, F1 → **F = 0,389** (valeur tabulée, sans interpolation).

---

## 11. Exemple résolu `10_Application_RAM` — choix d'un goutteur autorégulant

Champ de 180 m, goutteurs tous les 40 cm, premier à 2 m du départ, goutteur RAM
2,3 l/h, pression d'entrée 2 atm. Choisir RAM17 ou RAM20.

```
1 atm = 1,01325 bar
pression (mCE)      = atm × 1,01325 × 10,19
lignePressionRetenue = plus grande valeur ≤ pression parmi {20; 25; 35; 40}
longueurRequise (m)  = L − d0
```

**Longueur maximale de rampe (m)** pour qa = 2,3 l/h, à 10 % de variation de
débit *(abaques Netafim, support de cours)* :

RAM17 :

| Pression (m) \ Espacement (m) | 0,3 | 0,4 | 0,5 | 0,6 | 0,8 | 1,0 |
|---|---|---|---|---|---|---|
| 40 | 135 | 174 | 209 | 238 | 307 | 365 |
| 35 | 128 | 165 | 199 | 226 | 291 | 346 |
| 25 | 112 | 143 | 173 | 196 | 253 | 300 |
| 20 | 101 | 127 | 156 | 177 | 228 | 271 |

RAM20 :

| Pression (m) \ Espacement (m) | 0,3 | 0,4 | 0,5 | 0,6 | 0,8 | 1,0 |
|---|---|---|---|---|---|---|
| 40 | 250 | 306 | 358 | 406 | 495 | 575 |
| 35 | 235 | 290 | 339 | 385 | 470 | 545 |
| 25 | 205 | 250 | 293 | 333 | 405 | 470 |
| 20 | 185 | 225 | 265 | 300 | 365 | 425 |

Règle de choix : retenir **RAM17** s'il suffit (le plus économique), sinon
**RAM20** s'il suffit, sinon aucun des deux — réduire la longueur ou augmenter
pression/espacement.

```
nombreDeGoutteurs = INT(longueurRequise / e) + 1
positionDernier   = d0 + (nombre − 1) × e        // doit valoir L
débitRampe (l/h)  = nombreDeGoutteurs × qa
```

Si plusieurs rampes en parallèle, multiplier par leur nombre pour obtenir le
débit en tête de réseau (à rapprocher de `4_Debit_Systeme`).

### Cas de test de référence

Pression retenue = 20 mCE (car 20,65 < 25) ; longueur requise = 178 m.
RAM17 à (20 ; 0,4) = 127 m → **insuffisant**. RAM20 = 225 m → **suffisant** →
**on retient RAM20**. Goutteurs = INT(178/0,4)+1 = **446** ; position du dernier
= 2+445×0,4 = 180 m ✓. Débit rampe = **1 025,8 l/h = 1,0258 m³/h**.

---

## 12. Exemple résolu `11_Application_Kr_LR` — ⚠️ spécification incomplète

Comparaison des méthodes de coefficient de réduction `Kr` et calcul du besoin en
lixiviation. Formules-cadre connues :

```
ETcrop-loc = ETcrop_pointe × Kr(GC)
LRt        = ECw / (2 × ECe_max)
LR         = LRt × (ETcrop-loc / Ea)
IRn        = ETcrop-loc + …            ← la suite manque
```

**La spécification de ce module est tronquée dans la source qui m'a été
transmise.** Les méthodes alternatives de calcul de `Kr` (Keller, Freeman,
Decroix…) et la formule complète de `IRn` ne sont pas connues.

**Ce module ne doit pas être implémenté tant que sa spécification n'est pas
complète.** Ne rien inventer : une formule d'irrigation approximative produit un
dimensionnement faux, et c'est le genre d'erreur qui se voit sur le terrain des
années plus tard. Réclamer la fin du document avant de le traiter.

Les deux exemples résolus (`10` et `11`) sont de toute façon des **exercices
pédagogiques autonomes**, hors du pipeline de conception : ils sont à traiter en
dernier, après les modules 1 à 9.

---

## 13. Exigences de test

Chaque module doit avoir un test unitaire **reproduisant exactement le cas de
référence** ci-dessus, tolérance relative 1e-6. Ce sont les valeurs du classeur
d'origine : elles prouvent la fidélité du portage.

Tester en plus : entrées nulles ou négatives, divisions par zéro (`Sp × Sr = 0`,
`q = 0`, `η = 0`), diamètre ou débit nul dans Hazen-Williams, et `N = 1` dans le
facteur de Christiansen (`√(m−1)/(6N²)` avec `m = 1,852` reste défini, mais la
branche `F = 1` doit être prise). Aucune formule ne doit produire `NaN` ou
`Infinity` : elle renvoie une erreur métier explicite.
