# Vague 2 — Projets et calculs · Compte rendu de livraison

**Objectif du cahier des charges :** « Le client peut créer un projet et obtenir
des résultats de calcul. »

**Statut : atteint, et vérifié contre la vraie base Supabase.**

---

## Ce que le client peut faire maintenant

Il se connecte, crée un projet (nom, client final, localisation, description),
le retrouve dans sa liste, le cherche, le filtre par avancement. Il ouvre un
module de calcul, saisit ses données, obtient un résultat avec ses unités, et
peut **archiver ce résultat dans le projet** — l'historique garde la trace de
ce qui a été calculé, avec quelles entrées et avec quelle version des formules.

**14 modules de calcul** sont disponibles, portés des deux classeurs Excel :

| Famille | Modules |
|---|---|
| Communs | Doses (nette et brute), Besoins en eau, Nombre d'irrigations et cycle, Capacité du système, Efficiences |
| Gravitaire | Canaux trapézoïdaux (Manning-Strickler), DFC / DMP et quartiers hydrauliques |
| Sous pression | Aspersion, Goutte-à-goutte, Pertes de charge (Hazen-Williams), Pompe (HMT et puissance), Coefficient de Christiansen |

---

## Ce qui rend ce logiciel meilleur que le classeur qu'il remplace

**Les avertissements ne sont plus silencieux.** Un tableur accepte sans broncher
une vitesse d'écoulement hors plage, un risque de ruissellement, une surface
mouillée insuffisante. Ici, ces contrôles métier sont calculés et **affichés en
évidence** à côté du résultat.

**Le tirant d'eau se calcule tout seul.** Dans le classeur, il fallait ajuster
`h` à la main jusqu'à retomber sur le débit visé, via l'outil « Valeur cible ».
Le serveur le résout numériquement et donne directement la réponse, avec l'écart
résiduel affiché.

**Le réseau de conduites est une vraie liste de tronçons.** Le classeur demandait
de recopier la feuille pour chaque tronçon, puis d'additionner à la main. Les
pertes de charge s'agrègent automatiquement pour alimenter le calcul de la pompe.

**Les incohérences du classeur ont été tranchées, pas recopiées.** Trois exemples,
tous documentés dans les spécifications : le « besoin brut » gravitaire qui ne
divisait pas par l'efficience est conservé tel quel mais **renommé** pour que le
libellé cesse de mentir ; un cycle d'irrigation négatif **refuse** désormais de
produire un résultat au lieu de propager une aberration jusqu'à la pompe ; les
valeurs illisibles de la table de Christiansen ne sont **jamais** inventées —
le serveur renvoie une erreur explicite.

---

## Le savoir-faire reste protégé

Les formules ne quittent jamais le serveur (décision D-007). L'application
installée ne les contient pas — et comme un logiciel installé est décompilable,
c'est la seule protection qui vaille.

En pratique : l'application demande au serveur **le catalogue des modules**, qui
décrit les champs à saisir, leurs unités et leurs plages, et construit ses
formulaires à partir de là. Elle ne connaît ni les coefficients de Manning, ni
ceux de Hazen-Williams : l'utilisateur choisit « PVC » ou « Terre, lisse », le
serveur seul sait ce que cela vaut. **Vérifié par un test** : le catalogue ne
contient aucun coefficient métier.

Conséquence utile : ajouter un module de calcul plus tard ne demandera **aucune
modification de l'application**.

---

## Vérifications

### Tests automatiques — 397 au total

| Suite | Nombre |
|---|---|
| Backend (authentification, projets, isolation, moteur) | **351** |
| Application | **46** |

Dont **149 tests du moteur seul**, qui rejouent les **16 cas chiffrés des
classeurs d'origine** avec une tolérance de 1e-6. Ce sont eux qui prouvent que
le portage est fidèle : Dn = 40 mm, Db = 57,142857 mm, Q = 256,65 l/s,
Ep = 56,7 %, HMT = 30,14 m, Pw = 58,905 %, F(20) = 0,389… tous retrouvés.

S'y ajoute un balayage générique : environ **1 000 exécutions en entrées
dégradées** (valeurs nulles, négatives, hors plage) qui vérifient qu'aucun
module ne produit jamais `NaN` ou `Infinity`, et que tous les messages d'erreur
sont en français, rédigés pour un ingénieur agronome.

### Vérification contre la vraie base — 21 contrôles, 0 échec

Menée avec deux comptes clients distincts sur le projet Supabase réel :

| Contrôle | Résultat |
|---|---|
| Création de projet, identifiant UUID non devinable | ✔ |
| **Un client ne voit aucun projet d'un autre** | ✔ |
| **Lecture, modification, suppression d'un projet d'autrui → 404, jamais 403** | ✔ |
| Archivage d'un calcul dans le projet d'autrui → 404 | ✔ |
| Un `ownerId` injecté dans une requête est ignoré | ✔ |
| Catalogue servi, sans aucun coefficient métier | ✔ |
| Calcul exécuté et archivé, résultat conforme au classeur | ✔ |
| Version du moteur enregistrée avec le calcul | ✔ |
| Suppression d'un compte : ses projets suivent (cascade) | ✔ |
| Entrée aberrante refusée, message en français | ✔ |

Le **404 plutôt que 403** est délibéré : un 403 confirmerait l'existence du
projet. Pour un client, ce qui ne lui appartient pas n'existe pas.

---

## Défauts trouvés et corrigés pendant la vague

1. **Débordement dans le calcul des canaux.** Pour de très grandes valeurs de
   fruit de talus, `√(1+m²)` débordait et le serveur renvoyait un périmètre
   mouillé infini à l'utilisateur. Trouvé par le balayage générique.
2. **Messages d'erreur en anglais.** Une valeur de liste invalide remontait le
   message brut de la bibliothèque de validation, en anglais et en jargon
   technique — contraire à la règle du moteur.
3. **Promesses rejetées orphelines** dans l'application : l'erreur s'affichait
   bien, mais le rejet non rattrapé serait remonté dans la console du client.
4. **Un test au sélecteur ambigu**, qui trouvait « En cours » à la fois dans un
   badge et dans les options d'un filtre.

---

## Réserves à lever

1. **Les tableaux climatiques mensuels des deux cas d'exemple n'ont pas été
   transmis** — seules leurs sorties le sont. Les tests utilisent des
   calendriers reconstitués qui reproduisent exactement les valeurs publiées.
   Cela prouve que **les formules** sont justes, pas que **les données
   d'exemple** le sont. À remplacer dès que les classeurs seront disponibles.

2. **Ambiguïté sur le besoin total sous pression** (507,80375 mm) : selon que
   l'on compte ou non le mois excédentaire, on obtient 507,80375 ou 517,80375.
   Les deux sont exposés ; le dimensionnement utilise le second, car un mois
   pluvieux ne doit pas subventionner un mois sec. À confirmer par l'auteur du
   classeur.

3. **Le module `11_Application_Kr_LR` n'est pas implémenté** : sa spécification
   est tronquée dans la source transmise. Rien n'a été inventé.

4. **Les modules de calcul n'ont pas encore été essayés à la main** dans
   l'interface, écran par écran. Les tests couvrent le comportement ; ils ne
   remplacent pas un essai par un praticien du métier.
